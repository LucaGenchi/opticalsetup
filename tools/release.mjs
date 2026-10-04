#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Cut and check releases. See docs/release-policy.md.
//
//   node tools/release.mjs status            what changed since the last release
//   node tools/release.mjs prepare [level]   write the next release (auto|patch|minor|major)
//   node tools/release.mjs verify            release.js and releases.json agree
//   node tools/release.mjs verify --tree     ...and this tree is exactly that release
//   node tools/release.mjs current           print the current release, if any

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  planRelease, readAppRelease, readReleases, rendererDigest, siteDigest, withAppRelease,
} from './release-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function releaseStatus(root = ROOT) {
  const releases = await readReleases(root);
  const [renderer, site] = await Promise.all([rendererDigest(root), siteDigest(root)]);
  const last = releases.at(-1) ?? null;
  let next = null, reason = null;
  try { next = planRelease({ releases, renderer, site }); } catch (error) { reason = error.message; }
  return { current: last?.version ?? '', appRelease: await readAppRelease(root), renderer, site, last, next, reason };
}

export async function prepareRelease(root = ROOT, level = 'auto', date = new Date().toISOString().slice(0, 10)) {
  const releases = await readReleases(root);
  const [renderer, site] = await Promise.all([rendererDigest(root), siteDigest(root)]);
  const plan = planRelease({ releases, renderer, site, level });
  const releasePath = resolve(root, 'sketch/js/release.js');
  await writeFile(releasePath, withAppRelease(await readFile(releasePath, 'utf8'), plan.version));
  releases.push({ version: plan.version, date, rendererSha256: renderer, siteSha256: site });
  await writeFile(resolve(root, 'releases.json'), `${JSON.stringify({ releases }, null, 2)}\n`);
  return plan;
}

// Without `tree`, only that the label and the list name the same release:
// true on every commit, since ordinary work leaves both alone. With `tree`,
// also that the files are byte for byte what the release recorded, which is
// true only on the release commit itself and is what a deploy requires.
export async function verifyRelease(root = ROOT, { tree = false } = {}) {
  const releases = await readReleases(root);
  const last = releases.at(-1);
  const appRelease = await readAppRelease(root);
  if (appRelease !== (last?.version ?? '')) {
    throw new Error(`sketch/js/release.js says '${appRelease}' but releases.json ends at '${last?.version ?? ''}'`);
  }
  if (!tree) return last?.version ?? '';
  if (!last) throw new Error('No release has been cut yet');
  const [renderer, site] = await Promise.all([rendererDigest(root), siteDigest(root)]);
  if (renderer !== last.rendererSha256 || site !== last.siteSha256) {
    throw new Error(`This tree is not ${last.version}: public files changed after the release was prepared. Prepare it again on the current main.`);
  }
  return last.version;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === 'status') {
      const s = await releaseStatus();
      console.log(`Current release: ${s.current || 'none'}`);
      if (s.next) {
        console.log(`Next release:    ${s.next.version} (${s.next.level})`);
        console.log(s.last
          ? (s.next.rendererChanged ? 'The app changed, so the next release gets a new kept copy.' : 'Only content changed; the app is the one already released.')
          : 'This will be the first release.');
      } else {
        console.log(s.reason);
      }
    } else if (command === 'prepare') {
      const plan = await prepareRelease(ROOT, args[0] ?? 'auto');
      console.log(plan.version);
    } else if (command === 'verify') {
      const version = await verifyRelease(ROOT, { tree: args.includes('--tree') });
      console.log(version ? `${version} is consistent${args.includes('--tree') ? ' and this tree is that release' : ''}` : 'No release has been cut yet');
    } else if (command === 'current') {
      console.log((await readReleases(ROOT)).at(-1)?.version ?? '');
    } else {
      console.error('Usage: node tools/release.mjs status | prepare [auto|patch|minor|major] | verify [--tree] | current');
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
