// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { detectorReading, opcpaReading, traceScene } from '../sketch/js/raytrace.js';
import { opcpaGainAtIntensity, opcpaPumpCoverage, opcpaTransfer } from '../sketch/js/parametric.js';

const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

function stage({ pumpPhaseNs = 0, chirped = false, seedWl = 1053, seedFs = 1000, pumpFs = 1000 } = {}) {
  const seed = createElement('pulsedlaser', 60, 160);
  Object.assign(seed.params, {
    wavelength: seedWl, avgPowerW: 10, repRateMHz: 0.001, pulseWidthFs: seedFs, beamMode: 'line',
    ...(chirped ? { transformLimited: false, bandwidth: 8, inputChirp: 'positive', chirpGddFs2: 30000 } : {}),
  });
  const pump = createElement('pulsedlaser', 60, 184);
  Object.assign(pump.params, {
    wavelength: 527, avgPowerW: 100, repRateMHz: 0.001, pulseWidthFs: pumpFs,
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
  // Equal 1 ps seed and pump: the seed overlaps 1/√2 of the pump pulse.
  near(state.transfer.pumpCoverage, Math.SQRT1_2, 1e-9);
  near(state.transfer.pumpDepletion, 0.6 * Math.SQRT1_2, 1e-9);
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

test('seeded parametric gain follows cosh²(√f · arcosh √G₀) in the pump intensity fraction f', () => {
  near(opcpaGainAtIntensity(100, 1), 100, 1e-9);
  near(opcpaGainAtIntensity(100, 0), 1);
  // A quarter of the pump intensity halves ΓL: cosh²(arcosh(10) / 2).
  near(opcpaGainAtIntensity(100, 0.25), Math.cosh(Math.acosh(10) / 2) ** 2, 1e-12);
  // Gain collapses faster than a linear share of the extra gain would.
  assert.ok(opcpaGainAtIntensity(100, 0.5) < 1 + 99 * 0.5);
  // Bounded inputs stay finite.
  assert.equal(opcpaGainAtIntensity(Number.NaN, Number.NaN), 1);
});

test('only the overlapped part of the pump pulse can be depleted', () => {
  near(opcpaPumpCoverage(1000, 1000), Math.SQRT1_2);
  near(opcpaPumpCoverage(100, 1000), 100 / Math.hypot(100, 1000));
  assert.equal(opcpaPumpCoverage(null, 1000), 1, 'unknown durations do not scale the budget');
  const short = opcpaTransfer({ seedPowerW: 1, pumpPowerW: 100, smallSignalGain: 1e5, maxPumpDepletion: 0.6, seedDurationFs: 100, pumpDurationFs: 1000 });
  const stretched = opcpaTransfer({ seedPowerW: 1, pumpPowerW: 100, smallSignalGain: 1e5, maxPumpDepletion: 0.6, seedDurationFs: 1000, pumpDurationFs: 1000 });
  assert.ok(stretched.pumpTransferredW > 5 * short.pumpTransferredW, 'stretching the seed reaches more of the pump');
  for (const r of [short, stretched]) near(r.signalGainW + r.idlerPowerW, r.pumpTransferredW, 1e-12);
});

test('stretching the seed in the scene raises the pump the stage can extract', () => {
  const brief = stage({ seedFs: 100, pumpFs: 2000 }).state.transfer;
  const long = stage({ seedFs: 1500, pumpFs: 2000 }).state.transfer;
  assert.ok(long.pumpDepletion > 5 * brief.pumpDepletion, `${long.pumpDepletion} vs ${brief.pumpDepletion}`);
});

test('a non-degenerate stage splits converted pump power by Manley–Rowe', () => {
  const { state } = stage({ seedWl: 800 });
  const t = state.transfer;
  const idlerWl = 1 / (1 / 527 - 1 / 800);
  near(state.waves.idler.wl, idlerWl, 1e-6);
  // Equal photon numbers: power ratio signal : idler = λi : λs.
  near(t.signalGainW / t.idlerPowerW, idlerWl / 800, 1e-9);
  near(t.signalGainW + t.idlerPowerW, t.pumpTransferredW, 1e-12);
});
