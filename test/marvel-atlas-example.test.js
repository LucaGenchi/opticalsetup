import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import '../sketch/js/detector-instruments.js';
import { registry } from '../sketch/js/elements.js';
import { probeAveragePowerW, probeDurationLabel } from '../sketch/js/probe.js';
import { opcpaReading, probeAt, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';

const raw = readFileSync(new URL(
  '../Examples/Ultrashort Pulses/Marvel ATLAS laser — public architecture.json',
  import.meta.url,
), 'utf8');

function traced() {
  const scene = parseSketch(raw, registry);
  traceScene(scene.elements);
  return scene;
}

function reading(scene, id) {
  const probe = scene.elements.find(element => element.id === id);
  return probeAt(probe.x, probe.y);
}

test('the ATLAS example preserves the published wavelength and duration', () => {
  const scene = traced();
  const source = scene.elements.find(element => element.id === 'atlas-seed');
  assert.equal(source.params.wavelength, 1053);
  assert.equal(source.params.repRateMHz, 0.001, 'the trace is normalized to the app minimum');
  assert.equal(probeDurationLabel(reading(scene, 'duration-probe'), source.type), '100 fs');
});

test('the live OPCPA stage is overlap matched, pump limited and energy balanced', () => {
  const scene = traced();
  const stage = scene.elements.find(element => element.id === 'opcpa-stage');
  assert.equal(stage.type, 'opcpa');
  const state = opcpaReading(stage.id);
  assert.equal(state.state, 'amplifying');
  assert.equal(state.transfer.overlap, 1);
  assert.equal(state.transfer.actualGain, 25);
  assert.equal(state.transfer.pumpDepletion, 0.6);
  assert.equal(state.transfer.signalOutputW, 250);
  assert.equal(state.transfer.idlerPowerW, 240);
  assert.equal(state.transfer.residualPumpW, 320);
  assert.equal(state.transfer.signalOutputW + state.transfer.idlerPowerW + state.transfer.residualPumpW, 810);
});

test('the illustrative SHG stage yields 527 nm from the compressed OPCPA signal', () => {
  const scene = traced();
  const green = reading(scene, 'wavelength-probe');
  assert.equal(green.wl, 526.5);
  const watts = probeAveragePowerW(reading(scene, 'power-probe'), scene.elements);
  assert.ok(Math.abs(watts - 142.5) < 1e-6, `expected normalized 142.5 W, got ${watts}`);
});

test('the undisclosed Nd:glass stage remains an explicit pass-through proxy', () => {
  const scene = traced();
  for (const id of ['arch-amplifier', 'power-amplifier-proxy']) {
    const element = scene.elements.find(candidate => candidate.id === id);
    assert.equal(element.type, 'box');
    assert.equal(element.params.behavior, 'pass');
  }
});
