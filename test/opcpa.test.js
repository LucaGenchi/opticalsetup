// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { detectorReading, opcpaReading, traceScene } from '../sketch/js/raytrace.js';
import { opcpaTransfer } from '../sketch/js/parametric.js';

const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

function stage({ pumpPhaseNs = 0, chirped = false } = {}) {
  const seed = createElement('pulsedlaser', 60, 160);
  Object.assign(seed.params, {
    wavelength: 1053, avgPowerW: 10, repRateMHz: 0.001, pulseWidthFs: 1000, beamMode: 'line',
    ...(chirped ? { transformLimited: false, bandwidth: 8, inputChirp: 'positive', chirpGddFs2: 30000 } : {}),
  });
  const pump = createElement('pulsedlaser', 60, 184);
  Object.assign(pump.params, {
    wavelength: 527, avgPowerW: 100, repRateMHz: 0.001, pulseWidthFs: 1000,
    pulsePhaseNs: pumpPhaseNs, beamMode: 'line',
  });
  const amp = createElement('opcpa', 220, 160);
  Object.assign(amp.params, {
    pumpWl: 527, smallSignalGain: 20, maxPumpDepletion: 0.6,
    signalBeamMm: 0, idlerBeamMm: 0, pumpBeamMm: 0,
  });
  const signal = createElement('detector', 400, 160);
  const idler = createElement('detector', 400, 184);
  const residual = createElement('detector', 400, 202);
  traceScene([seed, pump, amp, signal, idler, residual]);
  return {
    state: opcpaReading(amp.id),
    signal: detectorReading(signal.id),
    idler: detectorReading(idler.id),
    residual: detectorReading(residual.id),
  };
}

test('the OPCPA budget saturates gain against pump depletion and conserves power', () => {
  const result = opcpaTransfer({
    seedPowerW: 10, pumpPowerW: 100, smallSignalGain: 20,
    maxPumpDepletion: 0.6, overlap: 1, signalShare: 0.5,
  });
  near(result.actualGain, 4);
  near(result.signalOutputW, 40);
  near(result.idlerPowerW, 30);
  near(result.residualPumpW, 40);
  near(result.signalOutputW + result.idlerPowerW + result.residualPumpW, 110);
});

test('the integrated OPCPA exposes amplified signal, idler and residual pump ports', () => {
  const { state, signal, idler, residual } = stage();
  assert.equal(state.state, 'amplifying');
  near(state.transfer.pumpDepletion, 0.6);
  near(state.transfer.signalOutputW + state.transfer.idlerPowerW + state.transfer.residualPumpW, 110);
  near(signal.signal, state.transfer.actualGain);
  near(idler.signal, state.transfer.idlerPowerW / state.transfer.seedPowerW);
  near(residual.signal, 1 - state.transfer.pumpDepletion);
  assert.ok(idler.pulse && idler.pulse.pulseWidthFs < 1000, 'idler follows the seed–pump temporal product');
});

test('OPCPA gain follows pulse overlap instead of amplifying a mistimed seed', () => {
  const matched = stage().state;
  const mistimed = stage({ pumpPhaseNs: 0.01 }).state;
  assert.equal(mistimed.state, 'noOverlap');
  assert.ok(mistimed.transfer.overlap < 1e-20);
  near(mistimed.transfer.actualGain, 1);
  assert.ok(matched.transfer.actualGain > mistimed.transfer.actualGain);
});

test('the amplified signal preserves the seed chirp for a downstream compressor', () => {
  const { signal } = stage({ chirped: true });
  near(signal.pulse.totalGddFs2, 30000, 1e-6);
  assert.equal(signal.pulse.trains[0].inputGddFs2, 30000);
});
