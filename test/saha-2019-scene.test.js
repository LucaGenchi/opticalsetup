import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import '../sketch/js/etalon.js';
import '../sketch/js/vipa.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';

const sourceUrl = new URL('../collections/2pp/setups/saha-2019.json', import.meta.url);

async function loadScene() {
  return parseSketch(await readFile(sourceUrl, 'utf8'), registry);
}

test('Saha scene traces dispersed DMD light through the objective to the resin plane', async () => {
  const scene = await loadScene();
  const result = traceScene(scene.elements, scene.beams);
  assert.ok(result.writeHits.length >= 3, 'several spectral samples should reach the resin stage');
  assert.equal(new Set(result.signalHits.map(hit => hit.wavelengthNm.toFixed(6))).size, 3);
  assert.ok(result.signalHits.every(hit => hit.objectiveNA === 1.25));
  assert.ok(result.drawables.every(item => (item.pts || []).every(point =>
    Number.isFinite(point.x) && Number.isFinite(point.y))));
});

test('Saha scene survives save/reload normalization without changing the traced route', async () => {
  const first = await loadScene();
  const saved = JSON.stringify({ app: 'optics2d', version: 1, elements: first.elements, beams: first.beams });
  const second = parseSketch(saved, registry);
  assert.deepEqual(second, first);
  const a = traceScene(first.elements, first.beams).writeHits.map(hit => [hit.x, hit.y, hit.intensity]);
  const b = traceScene(second.elements, second.beams).writeHits.map(hit => [hit.x, hit.y, hit.intensity]);
  assert.deepEqual(b, a);
});

test('Saha controls distinguish source, spectral dispersion, and binary mask behavior', async () => {
  const scene = await loadScene();
  const laser = scene.elements.find(element => element.id === 'saha-laser');
  const dmd = scene.elements.find(element => element.id === 'saha-dmd');

  laser.params.enabled = false;
  assert.equal(traceScene(scene.elements, scene.beams).writeHits.length, 0);

  laser.params.enabled = true;
  dmd.params.spectralDispersion = false;
  let result = traceScene(scene.elements, scene.beams);
  assert.equal(result.writeHits.length, 1);
  assert.deepEqual([...new Set(result.signalHits.map(hit => hit.wavelengthNm))], [800]);

  dmd.params.spectralDispersion = true;
  dmd.params.duty = 0.05;
  result = traceScene(scene.elements, scene.beams);
  assert.equal(result.writeHits.length, 0, 'the default illuminated DMD coordinate should become an OFF stripe');
});
