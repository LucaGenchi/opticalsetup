#!/usr/bin/env node

// Publish an immutable copy of the current static workbench. The destination
// is deliberately append-only: a released directory must never be overwritten.

import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_RELEASE } from '../sketch/js/release.js';
import { releaseDigest, releaseSourceDigest } from './release-integrity.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const release = process.argv[2];

if (!/^v[1-9]\d*$/.test(release || '')) {
  throw new Error('Usage: node tools/freeze-release.mjs v<number>');
}
if (release !== APP_RELEASE) {
  throw new Error(`Requested ${release}, but sketch/js/release.js declares ${APP_RELEASE}`);
}

const destination = resolve(ROOT, release);
try {
  await access(destination, constants.F_OK);
  throw new Error(`${release}/ already exists; published releases are immutable`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const sceneSource = await readFile(resolve(ROOT, 'sketch/js/state.js'), 'utf8');
const sceneVersion = Number(sceneSource.match(/version:\s*(\d+),\s*elements:/)?.[1]);
if (!Number.isInteger(sceneVersion)) {
  throw new Error('Could not determine the serialized scene version from sketch/js/state.js');
}

const bundledDirectories = [
  'sketch',
  'Examples',
  'community-submissions',
  'wiki',
  'example-setups',
  'community',
  'assets',
  'css',
];

async function normalizeSnapshotHtml(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await normalizeSnapshotHtml(path);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      const source = await readFile(path, 'utf8');
      await writeFile(path, source.replace(/[ \t]+$/gm, ''));
    }
  }
}

await mkdir(destination);
for (const directory of bundledDirectories) {
  await cp(resolve(ROOT, directory), resolve(destination, directory), { recursive: true });
}
await cp(resolve(ROOT, 'index.html'), resolve(destination, 'index.html'));
await normalizeSnapshotHtml(destination);

// The release landing page and app brand stay inside the frozen site. All
// generated wiki/example/community pages already use relative links.
const landingPath = resolve(destination, 'index.html');
const landing = (await readFile(landingPath, 'utf8')).replace(/href="\//g, 'href="./');
await writeFile(landingPath, landing);
const appPath = resolve(destination, 'sketch/index.html');
const app = (await readFile(appPath, 'utf8')).replace('class="brand" href="/"', 'class="brand" href="../"');
await writeFile(appPath, app);

const contentSha256 = await releaseDigest(destination);
const sourceSha256 = await releaseSourceDigest(ROOT);
await writeFile(resolve(destination, 'release.json'), `${JSON.stringify({
  app: 'opticalsetup',
  release,
  frozen: true,
  applicationPath: `/${release}/sketch/`,
  sceneFormatVersions: [sceneVersion],
  bundledDirectories,
  contentSha256,
  sourceSha256,
}, null, 2)}\n`);

console.log(`Frozen ${release} at ${release}/sketch/`);
