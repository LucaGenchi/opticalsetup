import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { registry, stageOffsetAt, getVisualBounds } from '../sketch/js/elements.js';
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
  let ccd = detectorReading('somers-ccd');
  assert.ok(ccd?.signal > 0);
  assert.ok(ccd.bandMin > 700, 'writing light is visible without the optional alignment source');
  scene.elements.find(element => element.id === 'somers-align-laser').params.enabled = true;
  traceScene(scene.elements);
  ccd = detectorReading('somers-ccd');
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
  dmd._animationTimeS = 2.125;
  const secondMask = writingHits(traceScene(scene.elements)).map(hit => hit.x.toFixed(5));
  assert.notDeepEqual(secondMask, firstMask, 'advancing the actual DMD gate should turn the reference image point off');

  assert.notDeepEqual(stageOffsetAt(stage.params, 0), { x: 0, y: 0 });
  stage.params.pzMode = 'static';
  assert.deepEqual(stageOffsetAt(stage.params, 0.75), { x: 0, y: 0 });
});


test('Somers spectral rays re-image the illuminated mask point at the nominal resin plane', async () => {
  const scene = await loadScene();
  const hitSpan = () => {
    const hits = traceScene(scene.elements).signalHits.filter(hit => hit.sourceId === 'somers-laser');
    assert.ok(hits.length >= 3);
    return Math.max(...hits.map(hit => hit.x)) - Math.min(...hits.map(hit => hit.x));
  };
  assert.ok(hitSpan() < 0.0001, 'different wavelengths must coincide geometrically, not merely hit the same wide resin holder');
  scene.elements.find(element => element.id === 'somers-l3').params.f *= 1.1;
  assert.ok(hitSpan() > 0.0001, 'breaking the relay conjugates must visibly separate the spectral hits');
});

test('Somers stage motion stays downstream of the objective and zero source power stops writing', async () => {
  const scene = await loadScene();
  const stage = scene.elements.find(element => element.id === 'somers-stage');
  const laser = scene.elements.find(element => element.id === 'somers-laser');
  const nominalY = stage.y;
  for (const seconds of [0, 0.75, 1.25, 2.5, 4]) {
    const offset = stageOffsetAt(stage.params, seconds);
    stage.y = nominalY + offset.y;
    const hits = traceScene(scene.elements).signalHits.filter(hit => hit.sourceId === 'somers-laser');
    assert.ok(hits.length >= 3);
    assert.ok(hits.every(hit => hit.objectiveNA === 1.49), 'moving resin must never intercept the unfocused beam before the objective');
  }
  laser.params.avgPowerW = 0;
  assert.equal(traceScene(scene.elements).writeHits.length, 0);
});

test('Somers exported figure frame includes all component labels and explanatory text', async () => {
  const scene = await loadScene();
  const frame = getVisualBounds(scene.elements.find(element => element.type === 'figureframe'));
  for (const element of scene.elements) {
    const bounds = getVisualBounds(element);
    assert.ok(bounds.x0 >= frame.x0 && bounds.y0 >= frame.y0 && bounds.x1 <= frame.x1 && bounds.y1 <= frame.y1, element.id);
  }
});


test('Somers save/reload preserves the mask, spectrum, source units, and calculated print hits', async () => {
  const scene = await loadScene();
  const loaded = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, ...scene }), registry);
  assert.deepEqual(loaded, scene);
  const laser = loaded.elements.find(element => element.id === 'somers-laser');
  assert.equal(laser.params.repRateMHz, 0.005);
  assert.equal(laser.params.pulseWidthFs, 65);
  assert.deepEqual(traceScene(loaded.elements).writeHits, traceScene(scene.elements).writeHits);
});

test('Somers DMD has the reported 24 degree incidence and a normal selected central order', async () => {
  const scene = await loadScene();
  const result = traceScene(scene.elements);
  const paths = result.drawables.filter(path => path.type === 'path')
    .flatMap(path => path.pts.slice(1).map((point, index) => ({ pts: [path.pts[index], point] })));
  const arriving = paths.find(path => path.pts.length === 2
    && Math.abs(path.pts[0].y - 700) < 5 && Math.abs(path.pts[1].y - 735) < 0.01);
  assert.ok(arriving);
  const angle = path => Math.atan2(path.pts[1].y - path.pts[0].y, path.pts[1].x - path.pts[0].x) * 180 / Math.PI;
  assert.ok(Math.abs(angle(arriving) - 114) < 0.001);
  const central = paths.find(path => Math.abs(path.pts[0].y - 735) < 0.01
    && Math.abs(path.pts[1].y - 435) < 0.01 && Math.abs(path.pts[1].x - path.pts[0].x) < 0.0001);
  assert.ok(central, 'the central selected DMD order must propagate along its surface normal');
  assert.ok(Math.abs(angle(central) + 90) < 0.001);
});
