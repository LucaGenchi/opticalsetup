import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { registry } from '../sketch/js/elements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { buildPaperHandoff } from '../sketch/js/two-photon-handoff.js';
import '../sketch/js/detector-instruments.js';
import '../sketch/js/etalon.js';
import '../sketch/js/vipa.js';

const sceneUrl = new URL('../collections/2pp/setups/gittard-2011.json', import.meta.url);
const sourceText = await readFile(sceneUrl, 'utf8');
const loadScene = () => parseSketch(sourceText, registry);
const byId = (scene, id) => scene.elements.find(element => element.id === id);

test('Gittard default traces four focus rows through the NA 1.40 objective into resin', () => {
  const scene = loadScene();
  const slm = byId(scene, 'gittard-slm');
  assert.deepEqual(slm.params.layers.map(layer => layer.type), ['steer', 'focusgrid']);
  assert.equal(slm.params.layers.find(layer => layer.type === 'focusgrid').n, 4);

  const result = traceScene(scene.elements, scene.beams);
  assert.deepEqual(result.writeHits.map(hit => hit.focusRow).sort(), [0, 1, 2, 3]);
  const writingHits = result.signalHits.filter(hit => hit.sourceId === 'gittard-laser');
  assert.equal(writingHits.length, 4);
  assert.ok(writingHits.every(hit => hit.objectiveNA === 1.4));
  assert.ok(result.writeHits.every(hit => Number.isFinite(hit.x) && Number.isFinite(hit.y)));

  const camera = detectorReading('gittard-cmos');
  assert.ok(camera, 'the independent transmission-illumination path should reach the CMOS camera');
  assert.equal(camera.wavelength, 550, 'the interpreted visible filter keeps the 780 nm writing branch off the camera');
});

test('Gittard controls distinguish focus generation, zero order, scan and laser-off behavior', () => {
  const baseline = loadScene();
  const baselineTrace = traceScene(baseline.elements, baseline.beams);
  const baselinePaths = baselineTrace.drawables.filter(drawable => drawable.type === 'path').length;
  const baselineMean = baselineTrace.writeHits.reduce((sum, hit) => sum + hit.x, 0) / baselineTrace.writeHits.length;

  const single = loadScene();
  byId(single, 'gittard-slm').params.layers.find(layer => layer.type === 'focusgrid').n = 1;
  assert.equal(traceScene(single.elements, single.beams).writeHits.length, 1);

  const noZero = loadScene();
  byId(noZero, 'gittard-slm').params.zeroOrder = false;
  const noZeroPaths = traceScene(noZero.elements, noZero.beams).drawables
    .filter(drawable => drawable.type === 'path').length;
  assert.ok(noZeroPaths < baselinePaths, 'turning off zeroth order removes its route into the plane-P dump');

  const scanned = loadScene();
  for (const id of ['gittard-galvo-x', 'gittard-galvo-y']) byId(scanned, id)._animationTimeS = 0.0025;
  const scannedHits = traceScene(scanned.elements, scanned.beams).writeHits;
  assert.equal(scannedHits.length, 4, 'the bounded default sweep keeps all four rows on the resin');
  const scannedMean = scannedHits.reduce((sum, hit) => sum + hit.x, 0) / scannedHits.length;
  assert.ok(Math.abs(scannedMean - baselineMean) > 0.001, 'galvo motion changes the computed downstream focus position');

  const disabled = loadScene();
  byId(disabled, 'gittard-laser').params.enabled = false;
  assert.equal(traceScene(disabled.elements, disabled.beams).writeHits.length, 0);
});

test('Gittard scene save/reload and paper-basis handoff preserve only supported exact values', () => {
  const scene = loadScene();
  const saved = JSON.stringify({ app: 'optics2d', version: 1, elements: scene.elements, beams: scene.beams });
  assert.deepEqual(parseSketch(saved, registry), scene);

  const handoff = buildPaperHandoff({
    wavelengthNm: 780,
    repetitionRateMHz: 80,
    numericalAperture: 1.4,
    sourcePowerMw: 4000,
  });
  const query = new URL(handoff.url).searchParams;
  assert.equal(query.get('wavelengthNm'), '780');
  assert.equal(query.get('repetitionRateMHz'), '80');
  assert.equal(query.get('numericalAperture'), '1.4');
  assert.equal(query.has('sourcePowerMw'), false);
  assert.equal(query.has('pulseDurationFs'), false);
});
