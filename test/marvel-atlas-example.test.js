import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import '../sketch/js/detector-instruments.js';
import { registry } from '../sketch/js/elements.js';
import { probeAveragePowerW, probeDurationLabel } from '../sketch/js/probe.js';
import { probeAt, traceScene } from '../sketch/js/raytrace.js';
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

test('the ATLAS example preserves the published pulse regime', () => {
  const scene = traced();
  const source = scene.elements.find(element => element.id === 'atlas-fundamental');
  assert.equal(source.params.wavelength, 1053);
  assert.equal(source.params.pulseWidthFs, 100);
  assert.equal(source.params.repRateMHz, 0.00001, '10 Hz in MHz');
  assert.equal(probeDurationLabel(reading(scene, 'duration-probe'), source.type), '100 fs');
});

test('the illustrative SHG stage yields 527 nm and order-200 J pulses', () => {
  const scene = traced();
  const green = reading(scene, 'wavelength-probe');
  assert.equal(green.wl, 526.5);
  const watts = probeAveragePowerW(reading(scene, 'power-probe'), scene.elements);
  assert.ok(Math.abs(watts - 2000) < 1e-6, `expected 2 kW, got ${watts}`);
  assert.ok(Math.abs(watts / 10 - 200) < 1e-6, '2 kW at 10 Hz is 200 J per pulse');
});

test('undisclosed amplifier stages are explicit diagram-only pass-through boxes', () => {
  const scene = traced();
  for (const id of ['arch-opcpa', 'arch-amplifier', 'arch-compressor']) {
    const element = scene.elements.find(candidate => candidate.id === id);
    assert.equal(element.type, 'box');
    assert.equal(element.params.behavior, 'pass');
  }
});
