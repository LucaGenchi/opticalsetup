import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { registry, getVisualBounds } from '../sketch/js/elements.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { buildPaperHandoff } from '../sketch/js/two-photon-handoff.js';

const sceneUrl = new URL('../collections/2pp/setups/kiefer-2024.json', import.meta.url);
const load = async () => parseSketch(await readFile(sceneUrl, 'utf8'), registry);
const writingHits = result => result.writeHits.filter(hit => hit.stageId === 'kiefer-stage');
const span = hits => Math.max(...hits.map(hit => hit.y)) - Math.min(...hits.map(hit => hit.y));

test('Kiefer scene round-trips finite native elements and traces both real paths', async () => {
  const scene = await load();
  const ids = new Set(scene.elements.map(element => element.id));
  for (const id of [
    'kiefer-laser', 'kiefer-aom', 'kiefer-doe', 'kiefer-mla', 'kiefer-gx',
    'kiefer-gy', 'kiefer-objective', 'kiefer-stage', 'kiefer-led', 'kiefer-camera',
  ]) assert.ok(ids.has(id), id);

  const result = traceScene(scene.elements);
  assert.equal(writingHits(result).length, 7, 'seven meridional DOE orders reach the resin');
  assert.ok(result.signalHits.filter(hit => hit.sourceId === 'kiefer-laser')
    .every(hit => hit.objectiveNA === 1.4), 'every writing arrival traverses the objective, including the outer orders');
  assert.ok(detectorReading('kiefer-camera')?.signal > 0, 'the LED return reaches the camera through sample, objective, BS and L8');
  assert.ok(result.drawables.every(item => (item.pts || []).every(point => Number.isFinite(point.x) && Number.isFinite(point.y))));

  const roundTrip = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, ...scene }), registry);
  assert.deepEqual(roundTrip, scene);
});

test('Kiefer controls isolate source gating, DOE branching and MLA separation', async () => {
  const off = await load();
  off.elements.find(element => element.id === 'kiefer-laser').params.enabled = false;
  let result = traceScene(off.elements);
  assert.equal(writingHits(result).length, 0);
  assert.ok(detectorReading('kiefer-camera')?.signal > 0, 'the observation branch stays live');

  const zeroOrder = await load();
  zeroOrder.elements.find(element => element.id === 'kiefer-doe').params.orders = '0';
  result = traceScene(zeroOrder.elements);
  assert.equal(writingHits(result).length, 1, 'one DOE order leaves one meridional sample arrival');

  const nominal = await load();
  const nominalHits = writingHits(traceScene(nominal.elements));
  const weakArray = await load();
  weakArray.elements.find(element => element.id === 'kiefer-mla').params.f = 3000;
  const weakHits = writingHits(traceScene(weakArray.elements));
  assert.ok(span(nominalHits) > span(weakHits) + 0.02, 'the separate MLA increases the relayed focus separation');

  const highAngleDoe = await load();
  highAngleDoe.elements.find(element => element.id === 'kiefer-mla').params.f = 3000;
  highAngleDoe.elements.find(element => element.id === 'kiefer-doe').params.lines = 100;
  const highAngleHits = writingHits(traceScene(highAngleDoe.elements));
  assert.ok(highAngleHits.length < 7, 'a direct high-angle split loses outer orders at the finite MLA entrance');
  assert.ok(nominalHits.length > highAngleHits.length);
});

test('Kiefer physical galvos move the computed sample arrivals', async () => {
  const at = async time => {
    const scene = await load();
    scene.elements.filter(element => element.type === 'galvo')
      .forEach(element => { element._animationTimeS = time; });
    const result = traceScene(scene.elements);
    assert.equal(writingHits(result).length, 7);
    assert.ok(result.signalHits.filter(hit => hit.sourceId === 'kiefer-laser').every(hit => hit.objectiveNA === 1.4));
    return writingHits(result).map(hit => hit.y);
  };
  assert.notDeepEqual(await at(0), await at(0.001));
});

test('Kiefer paper handoff preserves supported units and rejects laser output power', () => {
  const handoff = buildPaperHandoff({
    wavelengthNm: 790,
    repetitionRateMHz: 80,
    pulseDurationFs: 140,
    numericalAperture: 1.4,
    sourcePowerMw: 3700,
  });
  const query = new URL(handoff.url).searchParams;
  assert.equal(query.get('wavelengthNm'), '790');
  assert.equal(query.get('repetitionRateMHz'), '80');
  assert.equal(query.get('pulseDurationFs'), '140');
  assert.equal(query.get('numericalAperture'), '1.4');
  assert.equal(query.has('sourcePowerMw'), false);
  assert.equal(handoff.omitted.find(field => field.key === 'sourcePowerMw').value, 3700);
});


test('Kiefer exact zero power leaves the independent camera path working', async () => {
  const scene = await load();
  scene.elements.find(element => element.id === 'kiefer-laser').params.avgPowerW = 0;
  assert.equal(writingHits(traceScene(scene.elements)).length, 0);
  assert.ok(detectorReading('kiefer-camera')?.signal > 0);
});

test('Kiefer annotations stay inside the figure and default unused ports terminate', async () => {
  const scene = await load();
  const frame = getVisualBounds(scene.elements.find(element => element.id === 'kiefer-frame'));
  for (const element of scene.elements.filter(element => element.type === 'textlabel')) {
    const bounds = getVisualBounds(element);
    assert.ok(bounds.x0 >= frame.x0 && bounds.x1 <= frame.x1 && bounds.y0 >= frame.y0 && bounds.y1 <= frame.y1, element.id);
  }
  assert.ok(traceScene(scene.elements).drawables.every(item => (item.pts || []).every(point =>
    point.x >= frame.x0 && point.x <= frame.x1 && point.y >= frame.y0 && point.y <= frame.y1)), 'no uncollected rays sweep across the notes');
});
