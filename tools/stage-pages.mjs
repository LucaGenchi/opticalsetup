#!/usr/bin/env node

import { access, cp, mkdir, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASE_SOURCE_ENTRIES } from './release-integrity.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = process.argv[2] ? resolve(process.argv[2]) : null;
if (!output) throw new Error('Usage: node tools/stage-pages.mjs <empty-output-directory>');
if (output === ROOT || ROOT.startsWith(`${output}/`)) {
  throw new Error('Pages output must not contain or replace the repository');
}
try {
  await access(output, constants.F_OK);
  throw new Error(`Pages output already exists: ${output}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await mkdir(output, { recursive: true });
for (const entry of RELEASE_SOURCE_ENTRIES) {
  await cp(resolve(ROOT, entry), resolve(output, entry), { recursive: true });
}

const releases = (await readdir(ROOT, { withFileTypes: true }))
  .filter(entry => entry.isDirectory() && /^v[1-9]\d*$/.test(entry.name))
  .map(entry => entry.name)
  .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
for (const release of releases) {
  await cp(resolve(ROOT, release), resolve(output, release), { recursive: true });
}

console.log(`Staged ${releases.length} immutable release(s) and the current public site at ${output}`);
