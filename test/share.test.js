import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildShareURL,
  decodeSharePayload,
  encodeSharePayload,
  sharedSceneFromURL,
} from '../sketch/js/share.js';

const scene = JSON.stringify({
  app: 'optics2d', version: 1,
  elements: [{ id: 'e1', type: 'cwlaser', x: 12, y: 34, params: { wavelength: 532 } }],
  beams: [],
});

test('uncompressed share payloads round-trip Unicode scene JSON', async () => {
  const source = JSON.stringify({ ...JSON.parse(scene), title: 'Mach–Zehnder λ' });
  const payload = await encodeSharePayload(source, { compression: false });
  assert.match(payload, /^j\./);
  assert.deepEqual(JSON.parse(await decodeSharePayload(payload)), JSON.parse(source));
});

test('share URLs target the frozen renderer for the current release', async () => {
  const url = await buildShareURL(scene, 'https://example.org/sketch/?lang=en#old');
  assert.match(url, /^https:\/\/example\.org\/v1\/sketch\/\?lang=en#sketch=/);
  assert.deepEqual(JSON.parse(await sharedSceneFromURL(url)), JSON.parse(scene));
});

test('versioned share URLs preserve release paths and deployment prefixes', async () => {
  const frozen = await buildShareURL(scene, 'https://opticalsetup.com/v1/sketch/#old', { compression: false });
  assert.equal(new URL(frozen).pathname, '/v1/sketch/');

  const mirror = await buildShareURL(
    scene,
    'https://lucagenchi.github.io/optics-sketch/sketch/#old',
    { compression: false },
  );
  assert.equal(new URL(mirror).pathname, '/optics-sketch/v1/sketch/');
});

test('compressed share payloads round-trip when stream compression is available', async (t) => {
  if (typeof CompressionStream !== 'function' || typeof DecompressionStream !== 'function') {
    t.skip('stream compression is unavailable in this runtime');
    return;
  }
  const repeated = JSON.stringify({ ...JSON.parse(scene), note: 'optical setup '.repeat(200) });
  const payload = await encodeSharePayload(repeated);
  assert.match(payload, /^g\./);
  assert.deepEqual(JSON.parse(await decodeSharePayload(payload)), JSON.parse(repeated));
});

test('non-share fragments are ignored and damaged links fail closed', async () => {
  assert.equal(await sharedSceneFromURL('https://example.org/#section'), null);
  await assert.rejects(() => sharedSceneFromURL('https://example.org/#sketch=g.not-valid'), /damaged|invalid/i);
});
