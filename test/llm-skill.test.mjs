import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import test from 'node:test';
import { parseSketch } from '../sketch/js/state.js';
import { registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';

const SCENE_PATH = 'skills/opticalsetup/examples/minimal-scene.json';
const SCRIPT_PATH = 'skills/opticalsetup/scripts/build-share-link.mjs';

test('published OpticalSetup skill builds a valid self-contained scene link', () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, SCENE_PATH], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const url = new URL(result.stdout.trim());
  assert.equal(url.origin, 'https://opticalsetup.com');
  assert.equal(url.pathname, '/sketch/');
  assert.match(url.hash, /^#sketch=[gj]\.[A-Za-z0-9_-]+$/);

  const payload = url.hash.slice('#sketch='.length);
  const separator = payload.indexOf('.');
  const encoding = payload.slice(0, separator);
  const encoded = payload.slice(separator + 1);
  const bytes = Buffer.from(encoded, 'base64url');
  const text = (encoding === 'g' ? gunzipSync(bytes) : bytes).toString('utf8');
  const scene = parseSketch(text, registry);

  assert.deepEqual(scene.elements.map(element => element.type), ['laser', 'lens']);
  assert.equal(scene.beams.length, 0);
});

test('published discovery catalog points to the canonical skill', async () => {
  const catalog = JSON.parse(await readFile('.well-known/ai-catalog.json', 'utf8'));
  assert.equal(catalog.specVersion, '1.0');
  assert.equal(catalog.entries.length, 1);
  assert.equal(catalog.entries[0].url, 'https://opticalsetup.com/skills/opticalsetup/SKILL.md');
  assert.equal(catalog.entries[0].type, 'application/ai-skill');
});
