#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Build the directory that gets deployed: the public site as of the latest
// release, plus the app of every earlier MAJOR.MINOR at /vX.Y/ so that links
// shared from it keep opening the app that made them.
//
//   node tools/stage-site.mjs <new-output-directory>
//
// Everything is read from the release tags, never from the working tree, so
// work merged after the last release cannot reach the site by accident. See
// docs/release-policy.md.

import { spawnSync } from 'node:child_process';
import { access, copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KEPT_RELEASE_ENTRIES, PUBLIC_SITE_ENTRIES, git, keptReleases, readReleases,
  rendererDigest, siteDigest, tagExists,
} from './release-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The entries that exist at `tag`, extracted under `destination`.
async function extract(root, tag, entries, destination) {
  const present = entries.filter(entry => {
    try { return git(root, ['ls-tree', '--name-only', tag, '--', entry], { stdio: 'pipe' }).length > 0; }
    catch (_) { return false; }
  });
  await mkdir(destination, { recursive: true });
  const archive = git(root, ['archive', '--format=tar', tag, '--', ...present], { stdio: 'pipe' });
  const untar = spawnSync('tar', ['-x', '-C', destination], { input: archive });
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
  for (const { version } of [latest, ...keptReleases(releases)]) {
    if (!tagExists(root, version)) throw new Error(`Tag ${version} is missing; fetch tags, or tag the release commit`);
  }

  await extract(root, latest.version, PUBLIC_SITE_ENTRIES, out);
  if (await siteDigest(out) !== latest.siteSha256 || await rendererDigest(out) !== latest.rendererSha256) {
    throw new Error(`Tag ${latest.version} does not hold the release that releases.json recorded`);
  }

  // A kept copy is the app as first released under that MAJOR.MINOR. The
  // recorded hash is what makes it immutable: a moved or rewritten tag fails
  // here instead of quietly changing what an old link opens.
  const kept = keptReleases(releases);
  for (const { path, version, rendererSha256 } of kept) {
    const destination = resolve(out, path);
    await extract(root, version, KEPT_RELEASE_ENTRIES, destination);
    if (await rendererDigest(destination) !== rendererSha256) {
      throw new Error(`Tag ${version} no longer holds the app that was released as ${path}`);
    }
  }

  await copyFile(resolve(root, 'releases.json'), resolve(out, 'releases.json'));
  return { version: latest.version, kept: kept.map(entry => entry.path) };
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
