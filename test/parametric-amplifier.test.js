// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  idlerWavelength, parametricPair, parametricMismatch, parametricGainCoefficient,
  parametricSmallSignalGain, MAX_PARAMETRIC_GAIN, opoWaves,
} from '../sketch/js/parametric.js';

const near = (actual, expected, tolerance = 1e-10) =>
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
const gain = (gammaPerM, lengthM, deltaKPerM = 0) => parametricSmallSignalGain({ gammaPerM, lengthM, deltaKPerM });
const indices = { pumpWl: 532, signalWl: 800, nPump: 1.7, nSignal: 1.6, nIdler: 1.6 };

test('matched plane-wave gain equals cosh squared over low and high gain', () => {
  for (const x of [1e-8, 0.01, 0.5, 1, 4, 20]) {
    near(gain(1000, x / 1000).gain, Math.cosh(x) ** 2);
  }
});

test('mismatch is even, reduces central gain and has a continuous g=0 limit', () => {
  assert.ok(gain(1000, 0.002, 1000).gain < gain(1000, 0.002).gain);
  near(gain(1000, 0.002, 1000).gain, gain(1000, 0.002, -1000).gain);
  for (const delta of [2000 * (1 - 1e-12), 2000, 2000 * (1 + 1e-12)]) near(gain(1000, 0.002, delta).gain, 5, 1e-10);
});

test('oscillatory gain has the sin prefactor and never de-amplifies the seed', () => {
  const gamma = 300, delta = 2000, length = 0.002;
  const q = Math.sqrt((delta / 2) ** 2 - gamma ** 2);
  near(gain(gamma, length, delta).gain, 1 + gamma ** 2 / q ** 2 * Math.sin(q * length) ** 2);
  assert.equal(gain(gamma, length, delta).regime, 'oscillatory');
  for (let i = 0; i < 100; i++) assert.ok(gain(gamma, length, i * 100).gain >= 1);
  near(gain(gamma, Math.PI / q, delta).gain, 1);
});

test('low-gain mismatch acceptance scales inversely with crystal length', () => {
  // Hold Gamma L fixed and compare equal Delta k L. Compare excess rather
  // than total gain so the unity baseline cannot mask a bandwidth error.
  const short = gain(1, 0.001, 2000).excess / gain(1, 0.001).excess;
  const long = gain(0.5, 0.002, 1000).excess / gain(0.5, 0.002).excess;
  near(short, long);
  assert.ok(gain(0.5, 0.002, 2000).excess / gain(0.5, 0.002).excess < short);
});

test('SI gain coefficient has the correct prefactor, d_eff and square-root intensity scaling', () => {
  const input = { ...indices, dEffPmV: 2, pumpIntensityWm2: 1e13 };
  const idlerM = idlerWavelength(532, 800) * 1e-9;
  const expected = Math.sqrt(8 * Math.PI ** 2 * (2e-12) ** 2 * 1e13
    / (8.8541878128e-12 * 299792458 * 800e-9 * idlerM * 1.7 * 1.6 * 1.6));
  near(parametricGainCoefficient(input), expected);
  near(parametricGainCoefficient({ ...input, pumpIntensityWm2: 4e13 }), 2 * expected);
  near(parametricGainCoefficient({ ...input, dEffPmV: -4 }), 2 * expected);
  assert.equal(parametricGainCoefficient({ ...input, pumpIntensityWm2: 0 }), 0);
});

test('collinear mismatch and first-order QPM use consistent nm, um and metre units', () => {
  near(parametricMismatch({ ...indices, nPump: 1.6 }), 0, 1e-8);
  const mismatch = parametricMismatch(indices);
  const periodUm = 2 * Math.PI / mismatch * 1e6;
  near(parametricMismatch({ ...indices, polingPeriodUm: periodUm }), 0, 1e-8);
  near(mismatch, 2 * Math.PI * 0.1 / (532e-9), 1e-12);
});

test('shared OPO/OPA photon pair preserves energy and equal generated photon flux', () => {
  for (const [pump, signal] of [[532, 800], [400, 800], [1064, 3000]]) {
    const pair = parametricPair(pump, signal);
    near(1 / pump, 1 / signal + 1 / pair.idlerWl, 1e-15);
    near(pair.signalShare + pair.idlerShare, 1);
    near(pair.signalShare * signal, pair.idlerShare * pair.idlerWl);
    near(opoWaves({ pumpWl: pump, signalWl: signal }).signalShare, pair.signalShare);
  }
  near(parametricPair(532, 800).signalShare, 0.665);
  assert.equal(parametricPair(400, 800).degenerate, true);
});

test('invalid wavelengths cannot silently create an infinite-frequency seed or idler', () => {
  for (const [pump, signal] of [[532, 400], [532, 532], [0, 800], [NaN, 800], [532, Infinity], [Infinity, 800]]) {
    assert.equal(parametricPair(pump, signal), null);
    assert.equal(opoWaves({ pumpWl: pump, signalWl: signal }), null);
  }
});

test('zero interaction is unity; overflow-prone finite gain is explicitly capped', () => {
  assert.equal(gain(0, 1).gain, 1);
  assert.equal(gain(1, 0).gain, 1);
  const high = gain(1000, 1);
  assert.equal(high.capped, true);
  near(high.gain, MAX_PARAMETRIC_GAIN);
  assert.ok(high.logExcess > Math.log(MAX_PARAMETRIC_GAIN));
  assert.ok(Object.values(high).every(value => typeof value !== 'number' || Number.isFinite(value)));
});

test('malformed numerical parameters fail explicitly rather than reaching rendering', () => {
  for (const input of [{ gammaPerM: Infinity, lengthM: 1 }, { gammaPerM: -1, lengthM: 1 },
    { gammaPerM: 1, lengthM: -1 }, { gammaPerM: 1, lengthM: 1, deltaKPerM: NaN }]) {
    assert.equal(parametricSmallSignalGain(input), null);
  }
  assert.equal(parametricMismatch({ ...indices, nPump: 0 }), null);
  assert.equal(parametricMismatch({ ...indices, polingPeriodUm: -1 }), null);
  assert.equal(parametricGainCoefficient({ ...indices, dEffPmV: 2, pumpIntensityWm2: Infinity }), null);
});
