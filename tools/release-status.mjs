#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_RELEASE } from '../sketch/js/release.js';
import { frozenReleaseStatuses, releaseSourceDigest } from './release-integrity.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function nextRelease(release) {
  const match = /^v([1-9]\d*)$/.exec(release);
  if (!match) throw new Error(`Invalid application release: ${release}`);
  return `v${Number(match[1]) + 1}`;
}

const frozenReleases = await frozenReleaseStatuses(ROOT);
const current = frozenReleases.find(candidate => candidate.release === APP_RELEASE);
if (!current) throw new Error(`No frozen snapshot exists for ${APP_RELEASE}`);
const manifestPath = resolve(ROOT, APP_RELEASE, 'release.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.release !== APP_RELEASE || manifest.frozen !== true) {
  throw new Error(`${APP_RELEASE}/release.json does not describe the current frozen release`);
}

const actualSourceSha256 = await releaseSourceDigest(ROOT);
const invalidReleases = frozenReleases
  .filter(candidate => !candidate.valid)
  .map(candidate => candidate.release);
const status = {
  currentRelease: APP_RELEASE,
  nextRelease: nextRelease(APP_RELEASE),
  releaseNeeded: actualSourceSha256 !== manifest.sourceSha256,
  contentValid: invalidReleases.length === 0,
  invalidReleases,
  expectedContentSha256: manifest.contentSha256 ?? null,
  actualContentSha256: current.actualContentSha256,
  releasedSourceSha256: manifest.sourceSha256 ?? null,
  actualSourceSha256,
};

if (process.argv.includes('--verify')) {
  if (!status.contentValid) throw new Error(`Frozen release content changed: ${status.invalidReleases.join(', ')}`);
  if (status.releaseNeeded) throw new Error(`Current public source does not match ${APP_RELEASE}`);
  console.log(`${APP_RELEASE} is intact and aligned with the public source`);
} else if (process.argv.includes('--github')) {
  console.log(`current_release=${status.currentRelease}`);
  console.log(`next_release=${status.nextRelease}`);
  console.log(`release_needed=${status.releaseNeeded}`);
  console.log(`content_valid=${status.contentValid}`);
} else {
  console.log(JSON.stringify(status, null, 2));
}
