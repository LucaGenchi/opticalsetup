#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { parseSketch } from '../../../sketch/js/state.js';
import { registry } from '../../../sketch/js/elements.js';
import '../../../sketch/js/detector-instruments.js';
import { APP_RELEASE } from '../../../sketch/js/release.js';

const MAX_SCENE_BYTES = 1_000_000;
const MAX_SHARE_HASH_CHARS = 200_000;
const BASE_URL = `https://opticalsetup.com/${APP_RELEASE}/sketch/`;

function fail(message) {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}

function base64url(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function main() {
  const [scenePath] = process.argv.slice(2);
  if (!scenePath) {
    fail('usage: node skills/opticalsetup/scripts/build-share-link.mjs path/to/scene.json');
    return;
  }

  let sourceText;
  try {
    sourceText = await readFile(scenePath, 'utf8');
  } catch (error) {
    fail(`could not read ${scenePath}: ${error.message}`);
    return;
  }

  let normalized;
  try {
    normalized = parseSketch(sourceText, registry);
  } catch (error) {
    fail(`scene validation failed: ${error.message}`);
    return;
  }

  const canonical = JSON.stringify({
    app: 'optics2d',
    version: 1,
    elements: normalized.elements,
    beams: normalized.beams,
  });
  const source = Buffer.from(canonical, 'utf8');

  if (source.length > MAX_SCENE_BYTES) {
    fail(`normalized scene is ${source.length} bytes; maximum is ${MAX_SCENE_BYTES}`);
    return;
  }

  const compressed = gzipSync(source);
  const payload = compressed.length < source.length
    ? `g.${base64url(compressed)}`
    : `j.${base64url(source)}`;
  const hash = `sketch=${payload}`;

  if (hash.length + 1 > MAX_SHARE_HASH_CHARS) {
    fail(`share fragment is ${hash.length + 1} characters; maximum is ${MAX_SHARE_HASH_CHARS}`);
    return;
  }

  const url = new URL(BASE_URL);
  url.hash = hash;
  console.log(url.toString());
}

main().catch(error => fail(error?.stack || String(error)));
