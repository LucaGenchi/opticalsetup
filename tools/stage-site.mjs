#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Build the directory that gets deployed: the public site as of the latest
// release, plus the app of every earlier MAJOR.MINOR at /vX.Y/ so that links
// shared from it keep opening the app that made them.
//
//   node tools/stage-site.mjs <new-output-directory>
//
// Every file is read from a release tag, never from the working tree, so
// work merged after the last release cannot reach the site by accident. The
// working tree supplies only the list of releases, and that list is checked
// against the tags before anything is staged. See docs/release-policy.md.

import { spawnSync } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  brokenInternalLinks, git, keptReleases, readAppRelease, readReleases, rendererDigest, schemeOf, siteDigest,
  verifyHistory,
} from './release-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The paths that exist at `tag`, extracted under `destination`.
async function extract(root, tag, paths, destination) {
  const present = paths.filter(path => git(root, ['ls-tree', '--name-only', tag, '--', path]).length > 0);
  await mkdir(destination, { recursive: true });
  const untar = spawnSync('tar', ['-x', '-C', destination], { input: git(root, ['archive', '--format=tar', tag, '--', ...present]) });
  if (untar.status !== 0) throw new Error(`Could not unpack ${tag}: ${untar.stderr}`);
}

export async function stageSite(output, root = ROOT) {
  const out = resolve(output);
  if (out === root || root.startsWith(`${out}/`)) throw new Error('The output directory must not contain the repository');
  try {
    await access(out);
    throw new Error(`The output directory already exists: ${out}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const releases = await readReleases(root);
  const latest = releases.at(-1);
  if (!latest) throw new Error('No release has been cut yet, so there is nothing to deploy');
  // Every release is tagged, and the list still begins with what each tag
  // was released with: nothing published was removed or edited.
  verifyHistory(root, releases);

  // Every release, not only the ones that are served, must still be the
  // files it recorded -- the whole public site, which includes everything a
  // kept copy serves. A tag that was moved or rewritten fails here instead of
  // quietly changing what an old link opens.
  const kept = new Map(keptReleases(releases).map(entry => [entry.version, entry.path]));
  const scratch = await mkdtemp(join(tmpdir(), 'opticalsetup-stage-'));
  try {
    for (const entry of releases) {
      const scheme = schemeOf(entry.scheme);
      const tree = join(scratch, entry.version);
      await extract(root, entry.version, [...scheme.site, 'releases.json'], tree);
      if (await siteDigest(tree, entry.scheme) !== entry.siteSha256
        || await rendererDigest(tree, entry.scheme) !== entry.rendererSha256) {
        throw new Error(`Tag ${entry.version} no longer holds the files that were released as ${entry.version}`);
      }
      // The site hash already covers the label; said outright because an app
      // carrying the wrong label would share unpinned or mispinned links.
      if (await readAppRelease(tree) !== entry.version) {
        throw new Error(`Tag ${entry.version} holds an app labelled '${await readAppRelease(tree)}'`);
      }
      if (entry === latest) await cp(tree, out, { recursive: true });
      if (kept.has(entry.version)) {
        for (const path of scheme.kept) {
          // A section the site did not have yet at that release is simply absent.
          try { await access(join(tree, path)); } catch (_) { continue; }
          await cp(join(tree, path), join(out, kept.get(entry.version), path), { recursive: true });
        }
      }
      await rm(tree, { recursive: true, force: true });
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }

  const broken = await brokenInternalLinks(out);
  if (broken.length) {
    throw new Error(`The staged site has ${broken.length} link(s) to files it does not contain:\n  ${broken.slice(0, 20).join('\n  ')}`);
  }
  return { version: latest.version, kept: [...kept.values()] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2];
  if (!output) {
    console.error('Usage: node tools/stage-site.mjs <new-output-directory>');
    process.exitCode = 2;
  } else {
    try {
      const { version, kept } = await stageSite(output);
      console.log(`Staged ${version} with kept releases ${kept.join(', ')} at ${resolve(output)}`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
