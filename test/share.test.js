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

test('share URLs round-trip a scene without changing the host path', async () => {
  const url = await buildShareURL(scene, 'https://example.org/optics/?lang=en#old');
  assert.match(url, /^https:\/\/example\.org\/optics\/\?lang=en#sketch=/);
  assert.deepEqual(JSON.parse(await sharedSceneFromURL(url)), JSON.parse(scene));
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

test('creating a share link rejects payloads that its own loader cannot open', async () => {
  const source = JSON.stringify({ ...JSON.parse(scene), note: 'x'.repeat(160_000) });
  await assert.rejects(
    () => buildShareURL(source, 'https://example.org/sketch/', { compression: false }),
    /too large.*share link/i,
  );
});

test('large compressible scenes still produce working share links', async (t) => {
  if (typeof CompressionStream !== 'function' || typeof DecompressionStream !== 'function') {
    t.skip('stream compression is unavailable'); return;
  }
  const source = JSON.stringify({ ...JSON.parse(scene), note: 'x'.repeat(160_000) });
  const url = await buildShareURL(source, 'https://example.org/sketch/');
  assert.deepEqual(JSON.parse(await sharedSceneFromURL(url)), JSON.parse(source));
});

test('the largest uncompressed share fragment round-trips at the loader limit', async () => {
  // 149992 JSON bytes encode to 199990 base64url characters; the prefix and
  // encoding marker bring the complete fragment to exactly 200000.
  const source = JSON.stringify({ note: 'x'.repeat(149_981) });
  const url = await buildShareURL(source, 'https://example.org/sketch/', { compression: false });
  assert.equal(new URL(url).hash.length, 200_000);
  assert.equal(await sharedSceneFromURL(url), source);
});
