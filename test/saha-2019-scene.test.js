import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { registry, stageOffsetAt, getVisualBounds } from '../sketch/js/elements.js';
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


test('Saha spectral rays re-image the illuminated mask point at the nominal resin plane', async () => {
  const scene = await loadScene();
  const hitSpan = () => {
    const hits = traceScene(scene.elements).signalHits.filter(hit => hit.sourceId === 'saha-laser');
    assert.ok(hits.length >= 3);
    return Math.max(...hits.map(hit => hit.x)) - Math.min(...hits.map(hit => hit.x));
  };
  assert.ok(hitSpan() < 0.0001, 'different wavelengths must coincide geometrically, not merely hit the same wide resin holder');
  scene.elements.find(element => element.id === 'saha-l1').params.f *= 1.1;
  assert.ok(hitSpan() > 0.0001, 'breaking the relay conjugates must visibly separate the spectral hits');
});

test('Saha stage motion stays downstream of the objective and zero source power stops writing', async () => {
  const scene = await loadScene();
  const stage = scene.elements.find(element => element.id === 'saha-stage');
  const laser = scene.elements.find(element => element.id === 'saha-laser');
  const nominalY = stage.y;
  for (const seconds of [0, 0.75, 1.25, 2.5, 4]) {
    const offset = stageOffsetAt(stage.params, seconds);
    stage.y = nominalY + offset.y;
    const hits = traceScene(scene.elements).signalHits.filter(hit => hit.sourceId === 'saha-laser');
    assert.ok(hits.length >= 3);
    assert.ok(hits.every(hit => hit.objectiveNA === 1.25), 'moving resin must never intercept the unfocused beam before the objective');
  }
  laser.params.avgPowerW = 0;
  assert.equal(traceScene(scene.elements).writeHits.length, 0);
});

test('Saha exported figure frame includes all component labels and explanatory text', async () => {
  const scene = await loadScene();
  const frame = getVisualBounds(scene.elements.find(element => element.type === 'figureframe'));
  for (const element of scene.elements) {
    const bounds = getVisualBounds(element);
    assert.ok(bounds.x0 >= frame.x0 && bounds.y0 >= frame.y0 && bounds.x1 <= frame.x1 && bounds.y1 <= frame.y1, element.id);
  }
});
