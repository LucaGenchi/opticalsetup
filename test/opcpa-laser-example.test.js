// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import '../sketch/js/detector-instruments.js';
import { registry } from '../sketch/js/elements.js';
import { probeAveragePowerW, probeDurationLabel } from '../sketch/js/probe.js';
import { opcpaReading, probeAt, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';

const raw = readFileSync(new URL(
  '../Examples/Ultrashort Pulses/High-energy OPCPA laser — architecture sketch.json',
  import.meta.url,
), 'utf8');

const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

function traced() {
  const scene = parseSketch(raw, registry);
  traceScene(scene.elements);
  return scene;
}

function reading(scene, id) {
  const probe = scene.elements.find(element => element.id === id);
  return probeAt(probe.x, probe.y);
}

test('the OPCPA laser example keeps its 1053 nm seed and recompresses it to 100 fs', () => {
  const scene = traced();
  const source = scene.elements.find(element => element.id === 'seed');
  assert.equal(source.params.wavelength, 1053);
  assert.equal(source.params.repRateMHz, 0.001, 'the trace is normalized to the app minimum');
  assert.equal(probeDurationLabel(reading(scene, 'duration-probe'), source.type), '100 fs');
});

test('the live OPCPA stage is timed, pump limited by the overlapped pump and energy balanced', () => {
  const scene = traced();
  const stage = scene.elements.find(element => element.id === 'opcpa-stage');
  assert.equal(stage.type, 'opcpa');
  const state = opcpaReading(stage.id);
  assert.equal(state.state, 'amplifying');
  const t = state.transfer;
  assert.equal(t.overlap, 1);
  // The stretched seed (100 fs transform limit, +30,000 fs²) is about 837 fs
  // against a 500 fs pump, so it overlaps τs/√(τs²+τp²) of the pump pulse.
  near(t.pumpCoverage, 837.23 / Math.hypot(837.23, 500), 1e-4);
  near(t.pumpDepletion, 0.6 * t.pumpCoverage);
  // A degenerate stage (526.5 nm pump, 1053 nm seed) gives signal and idler
  // equal shares of the converted pump.
  near(t.signalGainW, t.idlerPowerW);
  near(t.signalOutputW + t.idlerPowerW + t.residualPumpW, 810);
  assert.ok(t.actualGain > 20 && t.actualGain < 23, `gain ${t.actualGain}`);
});

test('the illustrative SHG stage yields 527 nm from the compressed OPCPA signal', () => {
  const scene = traced();
  const green = reading(scene, 'wavelength-probe');
  assert.equal(green.wl, 526.5);
  const watts = probeAveragePowerW(reading(scene, 'power-probe'), scene.elements);
  const t = opcpaReading('opcpa-stage').transfer;
  // 60% SHG conversion of the compressed signal, after the 95% transmission
  // of the transport optics in the scene.
  near(watts, t.signalOutputW * 0.6 * 0.95, 1e-6);
});

test('the Nd:glass power amplifier stays an explicit pass-through placeholder', () => {
  const scene = traced();
  for (const id of ['arch-amplifier', 'power-amplifier-proxy']) {
    const element = scene.elements.find(candidate => candidate.id === id);
    assert.equal(element.type, 'box');
    assert.equal(element.params.behavior, 'pass');
  }
});
