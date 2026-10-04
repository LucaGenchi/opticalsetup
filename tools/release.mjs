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
//   node tools/release.mjs tag-state         for the deploy: none | tagged | new

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CURRENT_SCHEME, planRelease, readAppRelease, readReleases, releaseTagState, rendererDigest, siteDigest,
  verifyHistory, withAppRelease,
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

// The date on the maintainer's own calendar, not UTC's.
function today() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(n => String(n).padStart(2, '0')).join('-');
}

export async function prepareRelease(root = ROOT, level = 'auto', date = today()) {
  // Everything that can refuse the release comes before the first write, so
  // a refused release leaves both files as they were.
  const releases = await readReleases(root);
  verifyHistory(root, releases);
  const last = releases.at(-1);
  const renderer = await rendererDigest(root);
  // The site hash covers the release label, so "has anything changed" is
  // asked of the tree as it stands, still carrying the last release's label.
  const plan = planRelease({ releases, renderer, site: await siteDigest(root), level });
  const labelPath = resolve(root, 'sketch/js/release.js');
  const label = await readFile(labelPath, 'utf8');
  const relabelled = withAppRelease(label, plan.version);
  if (last && await readAppRelease(root) !== last.version) {
    throw new Error(`sketch/js/release.js does not carry ${last.version}, the last release; restore it before preparing the next`);
  }

  await writeFile(labelPath, relabelled);
  // Recorded with the new label in place: the tree that will be committed.
  releases.push({ version: plan.version, date, scheme: CURRENT_SCHEME, rendererSha256: renderer, siteSha256: await siteDigest(root) });
  await writeFile(resolve(root, 'releases.json'), `${JSON.stringify({ releases }, null, 2)}\n`);
  return plan;
}

// Without `tree`, that the label and the list name the same release and that
// no published entry was removed or edited: true on every commit, since
// ordinary work leaves both files alone. With `tree`,
// also that the files are byte for byte what the release recorded, which is
// true only on the release commit itself and is what a deploy requires.
export async function verifyRelease(root = ROOT, { tree = false } = {}) {
  const releases = await readReleases(root);
  const last = releases.at(-1);
  const appRelease = await readAppRelease(root);
  if (appRelease !== (last?.version ?? '')) {
    throw new Error(`sketch/js/release.js says '${appRelease}' but releases.json ends at '${last?.version ?? ''}'`);
  }
  // Published entries are still there, unedited. The latest may be a release
  // that is prepared and not merged yet, whose tag the deploy creates.
  verifyHistory(root, releases, { allowUntaggedLatest: true });
  if (!tree) return last?.version ?? '';
  if (!last) throw new Error('No release has been cut yet');
  const [renderer, site] = await Promise.all([rendererDigest(root, last.scheme), siteDigest(root, last.scheme)]);
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
    } else if (command === 'tag-state') {
      // none | tagged | new; fails when a published release has lost its tag.
      console.log(releaseTagState(ROOT, await readReleases(ROOT)));
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
