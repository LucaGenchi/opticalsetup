import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { registry } from '../sketch/js/elements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { buildPaperHandoff } from '../sketch/js/two-photon-handoff.js';

const sceneText = await readFile(new URL('../collections/2pp/setups/pearre-2018.json', import.meta.url), 'utf8');
const loadScene = () => parseSketch(sceneText, registry);

test('Pearre scene round-trips and keeps reported kHz and MHz quantities distinct', () => {
  const scene = loadScene();
  const reloaded = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, ...scene }), registry);
  assert.deepEqual(reloaded, scene);
  const laser = scene.elements.find(el => el.id === 'pearre-laser');
  const pockels = scene.elements.find(el => el.id === 'pearre-eom');
  const scanner = scene.elements.find(el => el.id === 'pearre-resonant-x');
  assert.equal(laser.params.repRateMHz, 80);
  assert.equal(pockels.params.switchFreqMHz, 3.33);
  assert.equal(scanner.params.resonanceFrequencyKHz, 7.91);
});

test('Pearre default and resonant extrema keep a computed objective-to-resin route', () => {
  const scene = loadScene();
  const scanner = scene.elements.find(el => el.id === 'pearre-resonant-x');
  const hits = [];
  for (const phase of [0, 0.25, 0.75]) {
    scanner._animationTimeS = phase / (scanner.params.resonanceFrequencyKHz * 1000);
    const traced = traceScene(scene.elements, scene.beams);
    assert.equal(traced.signalHits.length, 1);
    assert.equal(traced.writeHits.length, 1);
    assert.equal(traced.signalHits[0].objectiveNA, 0.8);
    hits.push(traced.signalHits[0].x);
  }
  assert.notEqual(hits[1], hits[2], 'resonant motion must move the downstream sample hit');
});

test('Pearre controls remove emission and change Pockels-addressed monitor signal', () => {
  const scene = loadScene();
  const laser = scene.elements.find(el => el.id === 'pearre-laser');
  const eom = scene.elements.find(el => el.id === 'pearre-eom');
  const enabled = traceScene(scene.elements, scene.beams);
  assert.equal(enabled.writeHits.length, 1);
  laser.params.enabled = false;
  assert.equal(traceScene(scene.elements, scene.beams).writeHits.length, 0);

  laser.params.enabled = true;
  eom.params.switchDuty = 0.1;
  traceScene(scene.elements, scene.beams);
  const mostlyOpen = detectorReading('pearre-monitor').signal;
  eom.params.switchDuty = 0.9;
  traceScene(scene.elements, scene.beams);
  const mostlyClosed = detectorReading('pearre-monitor').signal;
  assert.ok(mostlyOpen > mostlyClosed * 5);
});

test('Pearre paper handoff exports verified fields and omits non-exact power', () => {
  const result = buildPaperHandoff({
    wavelengthNm: 780,
    repetitionRateMHz: 80,
    pulseDurationFs: 120,
    numericalAperture: 0.8,
  });
  const query = new URL(result.url).searchParams;
  assert.equal(query.get('repetitionRateMHz'), '80');
  assert.equal(query.has('sourcePowerMw'), false);
  assert.equal(query.has('switchFreqMHz'), false);
  assert.equal(query.has('resonanceFrequencyKHz'), false);
  assert.equal(loadScene().elements.find(el => el.id === 'pearre-resin').params.handoffEnabled, false);
});
