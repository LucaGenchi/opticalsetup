import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { registry } from '../sketch/js/elements.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { twoPhotonHandoffCandidates } from '../sketch/js/two-photon-handoff.js';

const sceneUrl = new URL('../collections/2pp/setups/dong-2007.json', import.meta.url);

async function loadScene() {
  return parseSketch(await readFile(sceneUrl, 'utf8'), registry);
}

const positions = result => result.writeHits
  .map(hit => [Number(hit.x.toFixed(2)), Number(hit.y.toFixed(2))])
  .sort((a, b) => a[0] - b[0]);

test('Dong mechanism interpretation traces four independent lenslet foci onto resin', async () => {
  const scene = await loadScene();
  const result = traceScene(scene.elements, scene.beams);
  assert.deepEqual(positions(result), [[355, 325], [365, 325], [375, 325], [385, 325]]);
  assert.equal(new Set(result.writeHits.map(hit => hit.writeGroup)).size, 4);
  assert.ok(result.drawables.length > 0);
  assert.ok(result.pulseTracks.length > 0);
});

test('Dong aperture-mask and lens-count controls change the computed focus set', async () => {
  const scene = await loadScene();
  const mask = scene.elements.find(element => element.id === 'dong-mask');
  const array = scene.elements.find(element => element.id === 'dong-array');

  mask.params.gap = 18;
  assert.deepEqual(positions(traceScene(scene.elements)), [[365, 325], [375, 325]]);

  mask.params.gap = 38;
  array.params.count = 2;
  assert.deepEqual(positions(traceScene(scene.elements)), [[360, 325], [380, 325]]);

  array.params.count = 1;
  assert.deepEqual(positions(traceScene(scene.elements)), [[370, 325]],
    'the one-lenslet boundary must remain finite and produce one writing marker');
});

test('Dong defocus and source-off controls affect real propagation safely', async () => {
  const scene = await loadScene();
  const source = scene.elements.find(element => element.id === 'dong-source');
  const array = scene.elements.find(element => element.id === 'dong-array');
  const focused = positions(traceScene(scene.elements));

  array.params.f = 45;
  const defocused = positions(traceScene(scene.elements));
  assert.equal(defocused.length, 4);
  assert.notDeepEqual(defocused, focused, 'moving the waist must change the resin-plane intersections');
  assert.ok(traceScene(scene.elements).drawables.every(drawable =>
    (drawable.pts || []).every(point => Number.isFinite(point.x) && Number.isFinite(point.y))));

  source.params.enabled = false;
  const off = traceScene(scene.elements);
  assert.equal(off.drawables.length, 0);
  assert.equal(off.pulseTracks.length, 0);
  assert.equal(off.writeHits.length, 0);
});

test('Dong scene reloads equivalently and does not export invented pulse settings', async () => {
  const scene = await loadScene();
  const reloaded = parseSketch(JSON.stringify(scene), registry);
  assert.deepEqual(reloaded, scene);
  const trace = traceScene(reloaded.elements, reloaded.beams);
  assert.deepEqual(twoPhotonHandoffCandidates(reloaded.elements, trace.signalHits, 'dong-stage'), []);
});
