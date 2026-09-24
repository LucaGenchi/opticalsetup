// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateParametricAmplifier } from '../sketch/js/parametric-amplifier.js';
import { parametricPair, mixOverlap } from '../sketch/js/parametric.js';
const near = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const pulse = (phaseNs = 0, repRateMHz = 80) => ({ phaseNs, repRateMHz, pulseWidthFs: 100 });
const seed = (key = 's', extra = {}) => ({ key, powerW: 0.001, wl: 800, gammaPerM: 1000, ...extra });
const run = (extra = {}) => allocateParametricAmplifier({ pump: { wl: 532, powerW: 1 }, seeds: [seed()], lengthM: 0.001, ...extra });
const conserved = result => {
  const output = result.pumpOutW + result.channels.reduce((sum, c) => sum + c.signalOutW + c.idlerOutW, 0);
  near(output, result.totalInputW);
  near(result.depletedPumpW, result.channels.reduce((sum, c) => sum + c.signalGainW + c.idlerOutW, 0));
  // Subtracting two nearly equal pump powers loses relative precision in the
  // tiny difference; bound that roundoff relative to the incident pump.
  assert.ok(Math.abs(result.pumpInW - result.pumpOutW - result.depletedPumpW)
    <= 1e-14 * Math.max(1, result.pumpInW));
  for (const channel of result.channels) {
    if (channel.signalGainW > 0) near(channel.signalGainW * channel.signalWl, channel.idlerOutW * channel.idlerWl);
  }
  const check = value => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `nonfinite ${value}`);
    else if (value && typeof value === 'object') Object.values(value).forEach(check);
  };
  check(result);
};

test('small-signal seed amplification debits pump and creates the Manley–Rowe idler', () => {
  const result = run(), c = result.channels[0];
  assert.equal(c.state, 'amplifying');
  near(c.signalOutW, 0.001 * Math.cosh(1) ** 2);
  near(c.idlerOutW / c.signalGainW, 800 / parametricPair(532, 800).idlerWl);
  assert.equal(c.saturated, false);
  conserved(result);
});

test('seed absence and zero-power seeds cannot create OPG', () => {
  const none = run({ seeds: [] });
  assert.equal(none.pumpOutW, 1);
  assert.deepEqual(none.channels, []);
  const zero = run({ seeds: [seed('zero', { powerW: 0, gammaPerM: 1e6 })] });
  assert.equal(zero.channels[0].state, 'noSeed');
  assert.equal(zero.depletedPumpW, 0);
  conserved(zero);
});

test('no pump passes the seed unchanged even with a nonzero supplied gain coefficient', () => {
  const result = run({ pump: { wl: 532, powerW: 0 } });
  assert.equal(result.channels[0].state, 'noPump');
  assert.equal(result.channels[0].signalOutW, 0.001);
  conserved(result);
});

test('saturation is bounded by one explicit pump budget at extreme gain', () => {
  for (const maxDepletion of [0, 0.01, 0.5, 1]) {
    const result = run({ maxDepletion, lengthM: 1 });
    near(result.depletedPumpW, maxDepletion);
    assert.ok(result.pumpOutW >= 0);
    conserved(result);
  }
  assert.equal(run({ lengthM: 1 }).channels[0].smallSignalGainCapped, true);
});

test('competing seeds share a single pump independently of input order', () => {
  const seeds = [seed('z', { wl: 900 }), seed('a', { wl: 850 }), seed('q', { wl: 800 })];
  const result = run({ seeds, lengthM: 1 });
  assert.deepEqual(result, run({ seeds: seeds.slice().reverse(), lengthM: 1 }));
  near(result.depletedPumpW, 1);
  assert.ok(result.channels.every(c => c.saturated));
  conserved(result);
});

test('pulse overlap uses the existing Gaussian integral and disappears off time zero', () => {
  const pump = { wl: 532, powerW: 1, opl: 30, pulse: pulse() };
  const on = seed('s', { opl: 30, pulse: pulse() });
  const off = seed('s', { opl: 60, pulse: pulse() });
  const good = run({ pump, seeds: [on] });
  assert.equal(good.channels[0].overlap, mixOverlap(pump, on).factor);
  const bad = run({ pump, seeds: [off] });
  assert.equal(bad.channels[0].state, 'unsynchronized');
  assert.equal(bad.depletedPumpW, 0);
  conserved(good); conserved(bad);
});

test('a CW pump can only give up the energy that meets the seed pulses, even at enormous formal gain', () => {
  // 100 fs seed pulses at 80 MHz: the seed window is 8 FWHM = 800 fs per
  // 12.5 ns period, so at most 6.4e-5 of the CW pump can ever be converted.
  const result = run({ pump: { wl: 532, powerW: 1 }, seeds: [seed('s', { pulse: pulse() })], lengthM: 1 });
  assert.ok(result.channels[0].saturated);
  assert.ok(result.depletedPumpW > 6e-5 && result.depletedPumpW <= 800e-15 * 80e6 * (1 + 1e-9));
  conserved(result);
});

// Reference values from an independent 4001-point quadrature of
// integral Is(t - delay) cosh^2(Gamma0 L sqrt(Ip(t)/Ip0)) dt / integral Is dt
// (seed small enough that the pump is not depleted).
test('pulsed gain follows the local pump intensity across the seed, not a peak gain times overlap', () => {
  const pulsedGain = (tauP, tauS, delayFs) => run({
    pump: { wl: 532, powerW: 1e9, pulse: { ...pulse(), pulseWidthFs: tauP } },
    seeds: [seed('s', { powerW: 1e-9, gammaPerM: 5000, pulse: { ...pulse(delayFs * 1e-6), pulseWidthFs: tauS } })],
  }).channels[0].achievedGain;
  const close = (a, b) => assert.ok(Math.abs(a / b - 1) < 1e-3, `${a} != ${b}`);
  close(pulsedGain(100, 100, 0), 2313);     // peak-intensity cosh^2(5) would be 5507
  close(pulsedGain(100, 100, 100), 247.9);  // delay: gain collapses far faster than the overlap
  close(pulsedGain(1000, 100, 0), 5375);    // short seed on a long pump sees nearly the peak
  close(pulsedGain(100, 1000, 0), 257.8);   // long seed: only its middle meets the pump
});

test('a CW seed is amplified only while the pump pulse is present', () => {
  // Time-averaged gain 1 + f_rep * integral (cosh^2(Gamma(t) L) - 1) dt for a
  // 100 fs, 80 MHz pump with Gamma0 L = 5 (same independent quadrature).
  const result = run({ pump: { wl: 532, powerW: 1e9, pulse: pulse() }, seeds: [seed('s', { powerW: 1e-9, gammaPerM: 5000 })] });
  assert.ok(Math.abs(result.channels[0].achievedGain / 1.02189 - 1) < 1e-4);
  conserved(result);
});

test('integer-period delay is equivalent; repetition mismatch is explicitly unsupported', () => {
  const pump = { wl: 532, powerW: 1, pulse: pulse() };
  const wrapped = run({ pump, seeds: [seed('s', { pulse: pulse(12.5) })] });
  near(wrapped.channels[0].overlap, 1);
  const unsupported = run({ pump, seeds: [seed('s', { pulse: pulse(0, 60) })] });
  assert.equal(unsupported.channels[0].state, 'repetitionUnsupported');
  assert.equal(unsupported.depletedPumpW, 0);
  conserved(unsupported);
});

test('CW and pulsed inputs use the established always-present CW timing convention', () => {
  for (const pulsedPump of [true, false]) {
    const pump = { wl: 532, powerW: 1, ...(pulsedPump ? { pulse: pulse() } : {}) };
    const seeds = [seed('s', pulsedPump ? {} : { pulse: pulse(123) })];
    const result = run({ pump, seeds });
    assert.equal(result.channels[0].overlap, 1);
    conserved(result);
  }
});

test('invalid wavelengths and same-mode degeneracy pass without duplicate idlers', () => {
  for (const [wl, state] of [[400, 'invalidWavelength'], [532, 'invalidWavelength'],
    [Infinity, 'invalidWavelength'], [1064, 'degenerateUnsupported']]) {
    const result = run({ seeds: [seed('s', { wl })] });
    assert.equal(result.channels[0].state, state);
    assert.equal(result.channels[0].idlerOutW, 0);
    assert.equal(result.depletedPumpW, 0);
    conserved(result);
  }
});

test('both seeded conjugate frequencies are rejected rather than double-counted', () => {
  const seeds = [seed(), seed('i', { wl: parametricPair(532, 800).idlerWl })];
  const result = run({ seeds });
  assert.ok(result.channels.every(c => c.state === 'doubleSeedUnsupported'));
  assert.equal(result.depletedPumpW, 0);
  conserved(result);
});

test('invalid timing, unknown durations and gates fail honestly', () => {
  for (const [extra, state] of [
    [{ repRateMHz: NaN }, 'invalidTiming'], [{ pulseWidthFs: Infinity }, 'invalidTiming'],
    [{ durationUnknown: true }, 'durationUnsupported'], [{ gates: [{ duty: 0 }] }, 'gatesUnsupported'],
  ]) {
    const result = run({ seeds: [seed('s', { pulse: { ...pulse(), ...extra } })] });
    assert.equal(result.channels[0].state, state);
    assert.equal(result.depletedPumpW, 0);
    conserved(result);
  }
});

test('batch validation rejects ambiguous keys and unaccountable powers', () => {
  for (const extra of [{ seeds: [seed(), seed()] }, { seeds: [seed('s', { powerW: -1 })] },
    { maxDepletion: 2 }, { lengthM: NaN }, { pump: { powerW: Infinity, wl: 532 } },
    { seeds: [seed('s', { powerW: NaN })] }, { seeds: Array.from({ length: 257 }, (_, i) => seed(String(i))) }]) {
    assert.equal(run(extra), null);
  }
});

test('deterministic parameter sweep conserves every watt and generated photon pair', () => {
  for (const powerW of [1e-10, 0.01, 1, 1e20]) for (const gammaPerM of [0, 100, 1000, 1e6]) {
    const result = run({ pump: { wl: 532, powerW }, seeds: [seed('s', { gammaPerM, powerW: powerW / 1000 })] });
    assert.ok(result.depletedPumpW <= powerW * (1 + 1e-14));
    conserved(result);
  }
});

test('a subnormal seed and huge finite pump keep diagnostics finite', () => {
  const result = run({ pump: { wl: 532, powerW: 1e200 }, seeds: [seed('s', { powerW: Number.MIN_VALUE })], lengthM: 1 });
  conserved(result);
  assert.ok(result.channels[0].signalGainW > 0);
});

test('does not mutate input records or nested pulse metadata', () => {
  const pump = Object.freeze({ wl: 532, powerW: 1, pulse: Object.freeze(pulse()) });
  const seeds = Object.freeze([Object.freeze(seed('s', { pulse: Object.freeze(pulse()) }))]);
  conserved(run({ pump, seeds }));
});
