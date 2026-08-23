#!/usr/bin/env node

import { access, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function nextRelease(release) {
  const match = /^v([1-9]\d*)$/.exec(release);
  if (!match) throw new Error(`Invalid application release: ${release}`);
  return `v${Number(match[1]) + 1}`;
}

export async function bumpRelease(root = ROOT) {
  const releasePath = resolve(root, 'sketch/js/release.js');
  const source = await readFile(releasePath, 'utf8');
  const match = source.match(/APP_RELEASE\s*=\s*'(v[1-9]\d*)'/);
  if (!match) throw new Error('Could not read APP_RELEASE from sketch/js/release.js');
  const next = nextRelease(match[1]);
  try {
    await access(resolve(root, next), constants.F_OK);
    throw new Error(`${next}/ already exists; release numbers are append-only`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await writeFile(releasePath, source.replace(match[0], `APP_RELEASE = '${next}'`));
  return next;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await bumpRelease());
}
