import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { registry, stageOffsetAt } from '../sketch/js/elements.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';

async function loadScene() {
  const text = await readFile(new URL('../collections/2pp/setups/somers-2021.json', import.meta.url), 'utf8');
  return parseSketch(text, registry);
}

const writingHits = result => result.signalHits
  .filter(hit => hit.stageId === 'somers-stage' && hit.sourceId === 'somers-laser');

test('Somers default traces the pulsed DMD route to resin and the observation CCD', async () => {
  const scene = await loadScene();
  const result = traceScene(scene.elements);
  const hits = writingHits(result);
  assert.ok(hits.length >= 3);
  assert.ok(hits.every(hit => hit.objectiveNA === 1.49));
  assert.ok(new Set(hits.map(hit => Math.round(hit.wavelengthNm))).size >= 3);
  assert.ok(result.writeHits.length > 0, 'pulsed arrivals should drive the resin preview');
  const ccd = detectorReading('somers-ccd');
  assert.ok(ccd?.signal > 0);
  assert.ok(ccd.bandMin <= 633 && ccd.bandMax >= 800, 'alignment and writing branches should both reach the CCD');
});

test('Somers controls isolate laser emission, carrier dispersion, mask updates, and Z motion', async () => {
  const scene = await loadScene();
  const laser = scene.elements.find(element => element.id === 'somers-laser');
  const dmd = scene.elements.find(element => element.id === 'somers-dmd');
  const stage = scene.elements.find(element => element.id === 'somers-stage');

  laser.params.enabled = false;
  let result = traceScene(scene.elements);
  assert.equal(writingHits(result).length, 0);
  assert.equal(result.writeHits.length, 0);
  laser.params.enabled = true;

  dmd.params.disperseSpectrum = false;
  result = traceScene(scene.elements);
  assert.equal(new Set(writingHits(result).map(hit => Math.round(hit.wavelengthNm))).size, 1);
  dmd.params.disperseSpectrum = true;

  dmd._animationTimeS = 0;
  const firstMask = writingHits(traceScene(scene.elements)).map(hit => hit.x.toFixed(5));
  dmd._animationTimeS = 1.625;
  const secondMask = writingHits(traceScene(scene.elements)).map(hit => hit.x.toFixed(5));
  assert.notDeepEqual(secondMask, firstMask, 'advancing the actual DMD gate should change projected hit locations');

  assert.notDeepEqual(stageOffsetAt(stage.params, 0), { x: 0, y: 0 });
  stage.params.pzMode = 'static';
  assert.deepEqual(stageOffsetAt(stage.params, 0.75), { x: 0, y: 0 });
});
