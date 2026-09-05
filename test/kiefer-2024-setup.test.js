import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { registry } from '../sketch/js/elements.js';
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
  assert.ok(writingHits(result).length >= 7, 'the pulsed route reaches the resin through the objective');
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
  assert.ok(span(nominalHits) > span(weakHits) + 5, 'the separate MLA increases the relayed focus separation');

  const highAngleDoe = await load();
  highAngleDoe.elements.find(element => element.id === 'kiefer-mla').params.f = 3000;
  highAngleDoe.elements.find(element => element.id === 'kiefer-doe').params.lines = 100;
  const highAngleHits = writingHits(traceScene(highAngleDoe.elements));
  assert.equal(highAngleHits.length, 1, 'a direct high-angle split loses outer orders in the compact scan relay');
  assert.ok(nominalHits.length > highAngleHits.length);
});

test('Kiefer physical galvos move the computed sample arrivals', async () => {
  const at = async time => {
    const scene = await load();
    scene.elements.filter(element => element.type === 'galvo')
      .forEach(element => { element._animationTimeS = time; });
    return writingHits(traceScene(scene.elements)).map(hit => hit.y);
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
