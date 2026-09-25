// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The OPA calculator page (calculators/opa/): the inputs it hands the app's
// functions, its refusals, its derived numbers, its scans and the depleted
// coupled-wave reference curve. The physics of the app functions themselves
// is checked in parametric-amplifier*.test.js and validation.test.js; here
// the question is whether the page asks them the right thing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  OPA_INPUTS, OPA_DEFAULTS, validateOpaInputs, computeOpa, allocatorInputs,
  delayScan, lengthScan, intensityScan, coupledWaveCurve, stateText, REFERENCE_TOLERANCE,
} from '../calculators/opa/opa-calculator.js';
import { coupledWaveConversion, coupledWaveStepCount } from '../calculators/opa/coupled-wave.js';
import { formatNumber, formatSI } from '../calculators/assets/calculator-kit.js';
import { parametricGainCoefficient, parametricSmallSignalGain } from '../sketch/js/parametric.js';
import { allocateParametricAmplifier } from '../sketch/js/parametric-amplifier.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
const valid = overrides => {
  const { values, reasons } = validateOpaInputs({ ...OPA_DEFAULTS, ...overrides });
  assert.deepEqual(reasons, []);
  return values;
};

test('the page hands the allocator the typed values, converted to SI once', () => {
  const v = valid({ delayFs: 120, deltaKPerMm: 0.4, lengthMm: 3 });
  // Built by hand from the typed values: GW/cm2 -> W/m2, mm -> m, fs -> ns, 1/mm -> 1/m.
  const gamma = parametricGainCoefficient({ pumpWl: 515, signalWl: 780, nPump: 1.67, nSignal: 1.66, nIdler: 1.64, dEffPmV: 2, pumpIntensityWm2: 50e13 });
  const expected = {
    pump: { wl: 515, powerW: 1, pulse: { repRateMHz: 0.2, pulseWidthFs: 300, phaseNs: 0 } },
    seeds: [{ key: 'seed', wl: 780, powerW: 1e-6, gammaPerM: gamma, deltaKPerM: 400, pulse: { repRateMHz: 0.2, pulseWidthFs: 300, phaseNs: 120e-6 } }],
    lengthM: 3e-3, maxDepletion: 0.5,
  };
  // Same fields, same values to 12 significant figures (unit conversions
  // such as 120 * 1e-6 differ from 120e-6 in the last bit).
  const round = value => (typeof value === 'number' ? Number(value.toPrecision(12))
    : Array.isArray(value) ? value.map(round)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, x]) => [k, round(x)])) : value);
  assert.deepEqual(round(allocatorInputs(v)), round(expected));
  const r = computeOpa(v);
  assert.deepEqual(round(r.allocation), round(allocateParametricAmplifier(expected)));
  assert.ok(rel(r.small.gain, parametricSmallSignalGain({ gammaPerM: gamma, lengthM: 3e-3, deltaKPerM: 400 }).gain) < 1e-12);
});

test('invalid input is reported, never clamped or replaced by an old result', () => {
  for (const [id, bad, fragment] of [['pumpWl', '', 'enter a number'], ['lengthMm', 'abc', 'enter a number'],
    ['lengthMm', -1, 'between 0 and 100'], ['maxDepletion', 1.5, 'between 0 and 1'], ['pumpIntensityGWcm2', 5000, 'between 0 and 1000']]) {
    const { reasons } = validateOpaInputs({ ...OPA_DEFAULTS, [id]: bad });
    assert.equal(reasons.length, 1, `${id}=${bad}`);
    assert.ok(reasons[0].includes(fragment), reasons[0]);
  }
  // A field switched off by its checkbox is not validated.
  assert.deepEqual(validateOpaInputs({ ...OPA_DEFAULTS, pumpPulsed: false, pumpFwhmFs: '' }).reasons, []);
  // A decimal comma is read as a decimal point.
  assert.equal(validateOpaInputs({ ...OPA_DEFAULTS, lengthMm: '2,5' }).values.lengthMm, 2.5);
  // A pulse filling a sizeable part of the period is refused, not modelled wrongly.
  assert.match(validateOpaInputs({ ...OPA_DEFAULTS, repRateMHz: 100, pumpFwhmFs: 1e6 }).reasons[0], /5 %/);
});

test('physically unsupported seeds explain themselves instead of amplifying', () => {
  assert.equal(computeOpa(valid({ seedWl: 500 })).seed.state, 'invalidWavelength');
  assert.equal(computeOpa(valid({ seedWl: 1030 })).seed.state, 'degenerateUnsupported');
  assert.equal(computeOpa(valid({ seedOn: false })).seed.state, 'noSeed');
  assert.equal(computeOpa(valid({ delayFs: 5000 })).seed.state, 'unsynchronized');
  for (const state of ['invalidWavelength', 'degenerateUnsupported', 'noSeed', 'unsynchronized', 'doubleSeedUnsupported']) {
    assert.notEqual(stateText(state), state, `${state} has an explanation`);
  }
});

test('derived pump quantities: pulse energy, Gaussian peak power and implied beam radius', () => {
  const r = computeOpa(valid({}));
  assert.ok(rel(r.pumpEnergyJ, 5e-6) < 1e-12);
  // P_peak = 2 sqrt(ln2/pi) E / tau = 0.9394 E / tau
  assert.ok(rel(r.pumpPeakW, 2 * Math.sqrt(Math.LN2 / Math.PI) * 5e-6 / 300e-15) < 1e-12);
  // I = 2 P / (pi w^2)
  assert.ok(rel(2 * r.pumpPeakW / (Math.PI * r.beamRadiusM ** 2), 50e13) < 1e-12);
  assert.ok(Math.abs(r.energyErrorW) < 1e-15);
  assert.ok(r.notes.some(n => n.includes('beam radius')) === false);
  assert.ok(computeOpa(valid({ pumpPowerW: 1e-9 })).notes.some(n => n.includes('beam radius')));
});

test('scans: delay symmetric and CW-aware, intensity monotonic, length starts at zero', () => {
  const v = valid({});
  const delay = delayScan(v, 41);
  delay.forEach((p, k) => assert.ok(rel(p.depleted, delay[delay.length - 1 - k].depleted) < 1e-9));
  assert.ok(delay[20].depleted > delay[5].depleted);
  assert.equal(delayScan(valid({ seedPulsed: false })), null);
  const intensity = intensityScan(v, 21);
  for (let k = 1; k < intensity.length; k++) assert.ok(intensity[k].undepleted >= intensity[k - 1].undepleted);
  intensity.forEach(p => assert.ok(p.depleted <= p.undepleted * (1 + 1e-12)));
  const length = lengthScan(v, 21);
  assert.equal(length[0].model, 0);
  assert.equal(length[0].reference, 0);
  length.forEach(p => assert.ok(p.reference >= 0 && p.reference <= 1 && p.model >= 0 && p.model <= 1));
});

test('the exact curve agrees with the model while the pump is barely depleted, then back-converts', () => {
  const v = valid({});
  const scan = lengthScan(v, 81);
  // Low conversion: the energy limit is not active, so both are the same physics.
  for (const p of scan.filter(q => q.model > 1e-4 && q.model < 0.02)) assert.ok(rel(p.reference, p.model) < 0.05, `${p.x} mm`);
  // Past the optimum the exact solution gives energy back; the model does not.
  const peak = scan.reduce((best, p) => (p.reference > best.reference ? p : best));
  assert.ok(scan.at(-1).reference < 0.5 * peak.reference);
  assert.ok(scan.at(-1).model >= peak.model);
  assert.ok(scan.reference.change <= REFERENCE_TOLERANCE);
  // A second seed: no single-seed exact solution to draw, and it says so.
  const two = lengthScan(valid({ seed2On: true }), 5);
  assert.ok(two.every(p => p.reference === null) && /one seed/.test(two.reference.reason));
});

// Andrea's three reproductions against 355b7c1.
test('exact curve: a delay of whole periods changes nothing, as in the model', () => {
  const at = delayFs => coupledWaveCurve(valid({ repRateMHz: 100, delayFs }), [0, 2]).values[1];
  assert.ok(Math.abs(at(1e7) - at(0)) < 1e-12);
  assert.ok(Math.abs(at(-1e7) - at(0)) < 1e-12);
  assert.ok(at(0) > 0.07);
});

test('exact curve: the seed-to-pump ratio is never altered, however seed-dominated', () => {
  const v = valid({ pumpPulsed: false, seedPulsed: false, pumpPowerW: 0.001, seedPowerW: 10000, pumpIntensityGWcm2: 0.000001, lengthMm: 2 });
  assert.ok(Math.abs(coupledWaveCurve(v, [0, 2]).values[1] - 0.2471393149) < 1e-9);
});

test('exact curve: the time average is converged or not drawn', () => {
  const v = valid({ pumpIntensityGWcm2: 500, lengthMm: 8 });
  // At 8 mm alone: converges to the 2001-slice value 0.0801849957 (Andrea).
  const one = coupledWaveCurve(v, [0, 8]);
  assert.ok(one.change <= REFERENCE_TOLERANCE && Math.abs(one.values[1] - 0.0801849957) < REFERENCE_TOLERANCE);
  // The full scan to 20 mm would need more work than the page allows:
  // declared unavailable with a reason, never drawn from 121 slices.
  const scan = lengthScan(v, 81).reference;
  assert.ok(scan.values ? scan.change <= REFERENCE_TOLERANCE : /too much computation/.test(scan.reason));
});

test('coupled-wave solver: undepleted limit equals the gain core, including mismatch', () => {
  for (const [gammaL, dkRatio] of [[1, 0], [4, 0], [3, 0.5], [2, 1.5]]) {
    const gamma = 1000, lengthM = gammaL / gamma, deltaKPerM = 2 * gamma * dkRatio, r = 1e-12;
    const [conversion] = coupledWaveConversion({ gammaPerM: gamma, deltaKPerM, seedPhotonRatio: r, lengthsM: [lengthM] });
    // Converted pump photons = generated idler photons = r (G - 1) while undepleted.
    const excess = parametricSmallSignalGain({ gammaPerM: gamma, lengthM, deltaKPerM }).excess;
    assert.ok(rel(conversion / r, excess) < 1e-5, `GammaL ${gammaL}, dk/2Gamma ${dkRatio}`);
  }
  assert.equal(coupledWaveConversion({ gammaPerM: -1, seedPhotonRatio: 1, lengthsM: [1] }), null);
  assert.equal(coupledWaveConversion({ gammaPerM: 1, seedPhotonRatio: 1, lengthsM: [2, 1] }), null);
  assert.deepEqual(coupledWaveConversion({ gammaPerM: 1000, seedPhotonRatio: 0, lengthsM: [0.001] }), [0]);
});

test('coupled-wave step count covers the shortened step at every requested length', () => {
  // Gamma sqrt(1+r) = 1 /m gives h = 0.05 m (Andrea's examples).
  const count = lengthsM => coupledWaveStepCount({ gammaPerM: 1, seedPhotonRatio: 1e-30, lengthsM });
  assert.equal(count([0.03, 0.06]), 2);
  assert.equal(count([0.01, 0.02, 0.03]), 3);
  assert.equal(count([0.1]), 2);
  assert.equal(count([0, 0.05, 0.1]), 2);
});

test('continuous waves: the exact curve is the single plane-wave solution', () => {
  const v = valid({ pumpPulsed: false, seedPulsed: false, pumpIntensityGWcm2: 0.5, seedPowerW: 0.01 });
  const gamma = parametricGainCoefficient({ pumpWl: 515, signalWl: 780, nPump: 1.67, nSignal: 1.66, nIdler: 1.64, dEffPmV: 2, pumpIntensityWm2: 0.5e13 });
  const [direct] = coupledWaveConversion({ gammaPerM: gamma, seedPhotonRatio: 0.01 * 780 / 515, lengthsM: [0.02] });
  assert.ok(rel(coupledWaveCurve(v, [20]).values[0], direct) < 1e-12);
});

test('number formatting for results and axes', () => {
  assert.equal(formatNumber(155000), '1.55 × 10⁵');
  assert.equal(formatNumber(0.5), '0.5');
  assert.equal(formatNumber(2.5e-7), '2.5 × 10⁻⁷');
  assert.equal(formatNumber(NaN), '—');
  assert.equal(formatSI(1.2e-5, 'W'), '12 µW');
  assert.equal(formatSI(0.916, 'W'), '916 mW');
});

test('arrow increments as Luca set them (2026-09-25); powers, intensity and the rest step by 1', () => {
  const steps = Object.fromEntries(OPA_INPUTS.filter(i => i.arrowStep).map(i => [i.id, i.arrowStep]));
  assert.deepEqual(steps, {
    pumpWl: 5, pumpFwhmFs: 50, repRateMHz: 0.1, nPump: 0.01, nSignal: 0.01, nIdler: 0.01,
    maxDepletion: 0.05, seedWl: 5, seedFwhmFs: 50, seed2Wl: 5,
  });
  // Defaults sit on their step grids, so the first arrow press lands on a round value.
  for (const input of OPA_INPUTS.filter(i => i.arrowStep)) {
    const k = input.value / input.arrowStep;
    assert.ok(Math.abs(k - Math.round(k)) < 1e-9, input.id);
  }
  assert.equal(OPA_DEFAULTS.maxDepletion, 0.5);
});

test('every input has a label, a help text and a default inside its range', () => {
  for (const input of OPA_INPUTS) {
    assert.ok(input.label && input.help, input.id);
    if (input.type !== 'checkbox') assert.ok(input.value >= input.min && input.value <= input.max, input.id);
  }
  assert.deepEqual(validateOpaInputs(OPA_DEFAULTS).reasons, []);
});

test('the committed calculator pages match their generator', () => {
  const result = spawnSync(process.execPath, ['tools/build-calculators.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
