// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// OPA calculator: the inputs, their units and ranges, and every number the
// page shows. No DOM here, so test/calculator-opa.test.js can check the
// wiring. The physics is the app's own (sketch/js/parametric.js and
// parametric-amplifier.js, called with the inputs converted to SI), plus the
// depleted coupled-wave reference curve (coupled-wave.js), which the app
// does not use.

import { parametricPair, parametricGainCoefficient, parametricSmallSignalGain } from '../../sketch/js/parametric.js';
import { allocateParametricAmplifier } from '../../sketch/js/parametric-amplifier.js';
import { coupledWaveConversion, coupledWaveStepCount } from './coupled-wave.js';

const GAUSSIAN_PEAK_FACTOR = 2 * Math.sqrt(Math.LN2 / Math.PI); // P_peak = 0.939 E / tau (FWHM)
const GW_PER_CM2 = 1e13; // W/m^2

// Every input, in page order. `help` is shown next to the field; the page's
// parameter table explains each one at length.
export const OPA_INPUTS = [
  { id: 'pumpWl', group: 'pump', label: 'Wavelength', symbol: 'λ<sub>p</sub>', unit: 'nm', value: 515, min: 200, max: 5000, step: 1,
    help: 'Vacuum wavelength of the pump. It must be the shortest of the three waves.' },
  { id: 'pumpPowerW', group: 'pump', label: 'Average power', symbol: 'P<sub>p</sub>', unit: 'W', value: 1, min: 0, max: 1e5, step: 0.1,
    help: 'Average pump power reaching the crystal. It sets the energy budget, not the gain.' },
  { id: 'pumpIntensityGWcm2', group: 'pump', label: 'Peak intensity', symbol: 'I<sub>p</sub>', unit: 'GW/cm²', value: 50, min: 0, max: 1000, step: 1,
    help: 'Peak on-axis intensity inside the crystal. It sets the gain coefficient Γ.' },
  { id: 'pumpPulsed', group: 'pump', label: 'Pulsed pump', type: 'checkbox', value: true,
    help: 'Unticked: a continuous-wave pump at the intensity above.' },
  { id: 'pumpFwhmFs', group: 'pump', label: 'Pulse duration (FWHM)', symbol: 'τ<sub>p</sub>', unit: 'fs', value: 300, min: 1, max: 1e7, step: 10,
    help: 'Full width at half maximum of the pump intensity envelope (Gaussian).', when: 'pumpPulsed' },
  { id: 'repRateMHz', group: 'pump', label: 'Repetition rate', symbol: 'f<sub>rep</sub>', unit: 'MHz', value: 0.2, min: 1e-6, max: 1e4, step: 0.1,
    help: 'Pulse repetition rate, shared by pump and seed.' },
  { id: 'dEffPmV', group: 'crystal', label: 'Effective nonlinearity', symbol: 'd<sub>eff</sub>', unit: 'pm/V', value: 2, min: 0, max: 100, step: 0.1,
    help: 'Strength of the crystal’s χ⁽²⁾ response for this polarization and direction. See “d_eff” below.' },
  { id: 'nPump', group: 'crystal', label: 'Refractive index at λp', symbol: 'n<sub>p</sub>', value: 1.67, min: 1, max: 5, step: 0.01,
    help: 'Refractive index of the crystal for the pump, in its polarization.' },
  { id: 'nSignal', group: 'crystal', label: 'Refractive index at λs', symbol: 'n<sub>s</sub>', value: 1.66, min: 1, max: 5, step: 0.01,
    help: 'Refractive index for the signal (seed).' },
  { id: 'nIdler', group: 'crystal', label: 'Refractive index at λi', symbol: 'n<sub>i</sub>', value: 1.64, min: 1, max: 5, step: 0.01,
    help: 'Refractive index for the idler.' },
  { id: 'lengthMm', group: 'crystal', label: 'Crystal length', symbol: 'L', unit: 'mm', value: 2, min: 0, max: 100, step: 0.1,
    help: 'Interaction length inside the crystal.' },
  { id: 'deltaKPerMm', group: 'crystal', label: 'Phase mismatch', symbol: 'Δk', unit: '1/mm', value: 0, min: -1e4, max: 1e4, step: 0.5,
    help: 'Δk = k_p − k_s − k_i (− 2π/Λ with quasi-phase matching). Zero is perfect phase matching.' },
  { id: 'maxDepletion', group: 'crystal', label: 'Depletion limit', symbol: 'η<sub>max</sub>', value: 1, min: 0, max: 1, step: 0.05,
    help: 'Largest fraction of the pump the model may convert at any instant (1 = the ideal plane-wave limit).' },
  { id: 'seedOn', group: 'seed', label: 'Seed on', type: 'checkbox', value: true,
    help: 'Without a seed there is nothing to amplify: this model has no parametric noise (OPG).' },
  { id: 'seedWl', group: 'seed', label: 'Wavelength', symbol: 'λ<sub>s</sub>', unit: 'nm', value: 780, min: 200, max: 20000, step: 1,
    help: 'Signal (seed) wavelength. Must be longer than the pump’s; the idler follows from energy conservation.' },
  { id: 'seedPowerW', group: 'seed', label: 'Average power', symbol: 'P<sub>s</sub>', unit: 'W', value: 1e-6, min: 0, max: 1e5, step: 1e-6,
    help: 'Average seed power entering the crystal.' },
  { id: 'seedPulsed', group: 'seed', label: 'Pulsed seed', type: 'checkbox', value: true,
    help: 'Unticked: a continuous-wave seed, present all the time.' },
  { id: 'seedFwhmFs', group: 'seed', label: 'Pulse duration (FWHM)', symbol: 'τ<sub>s</sub>', unit: 'fs', value: 300, min: 1, max: 1e7, step: 10,
    help: 'FWHM of the seed intensity envelope (Gaussian).', when: 'seedPulsed' },
  { id: 'delayFs', group: 'seed', label: 'Delay after the pump', symbol: 'Δt', unit: 'fs', value: 0, min: -1e7, max: 1e7, step: 10,
    help: 'Arrival time of the seed peak relative to the pump peak.', when: 'seedPulsed' },
  { id: 'seed2On', group: 'seed2', label: 'Second seed on', type: 'checkbox', value: false,
    help: 'A second seed shares the same pump: where both are present they split its energy.' },
  { id: 'seed2Wl', group: 'seed2', label: 'Wavelength', symbol: 'λ<sub>s2</sub>', unit: 'nm', value: 900, min: 200, max: 20000, step: 1,
    help: 'Wavelength of the second seed.', when: 'seed2On' },
  { id: 'seed2DelayFs', group: 'seed2', label: 'Delay after the pump', symbol: 'Δt<sub>2</sub>', unit: 'fs', value: 0, min: -1e7, max: 1e7, step: 10,
    help: 'Same power and pulse duration as the first seed.', when: 'seed2On' },
];

export const OPA_DEFAULTS = Object.fromEntries(OPA_INPUTS.map(input => [input.id, input.value]));

const STATE_TEXT = {
  amplifying: 'Amplifying.',
  noSeed: 'No seed: nothing to amplify. (This model has no parametric noise, so an unseeded crystal gives no output.)',
  noPump: 'No pump power: no gain.',
  inactive: 'No gain at these settings.',
  unsynchronized: 'The seed never meets the pump pulse: no gain. Bring the delay within about one pulse duration.',
  invalidWavelength: 'The seed wavelength must be longer than the pump wavelength, so that the idler has a positive frequency.',
  degenerateUnsupported: 'Degenerate: signal and idler would be the same wave (λs = 2λp). That amplifier is phase-sensitive, which this model does not describe.',
  doubleSeedUnsupported: 'The second seed sits at the first seed’s idler wavelength. Two seeded conjugate waves need their relative phase, which this model does not describe.',
  repetitionUnsupported: 'Pump and seed must share one repetition rate.',
  invalidTiming: 'The pulse timing is not valid.',
  invalidGain: 'The gain could not be evaluated for these inputs.',
};
export const stateText = state => STATE_TEXT[state] ?? state;

// Parse raw field values (strings or numbers, booleans for checkboxes)
// against the schema. Out-of-range or non-numeric input is never clamped: it
// is reported, and the page shows no result rather than an old one.
export function validateOpaInputs(raw) {
  const values = {}, reasons = [];
  for (const input of OPA_INPUTS) {
    const v = raw[input.id];
    if (input.type === 'checkbox') { values[input.id] = Boolean(v); continue; }
    const number = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
    values[input.id] = number;
    const active = !input.when || raw[input.when];
    if (!active) continue;
    if (String(v ?? '').trim() === '' || !Number.isFinite(number)) reasons.push(`${input.label} (${plain(input)}): enter a number.`);
    else if (number < input.min || number > input.max) {
      reasons.push(`${input.label} (${plain(input)}): must be between ${input.min} and ${input.max}${input.unit ? ` ${input.unit}` : ''}.`);
    }
  }
  if (!reasons.length) {
    // A pulse must fit well inside one period for a single-pulse picture.
    for (const [on, id, who] of [[values.pumpPulsed, 'pumpFwhmFs', 'pump'], [values.seedPulsed, 'seedFwhmFs', 'seed']]) {
      if (on && values[id] * 1e-15 * values.repRateMHz * 1e6 > 0.05) {
        reasons.push(`The ${who} pulse lasts more than 5 % of the pulse period: treat it as continuous-wave (untick “pulsed”).`);
      }
    }
  }
  return { values, reasons };
}
const plain = input => (input.symbol || '').replace(/<[^>]+>/g, '');

const pulseOf = (on, widthFs, repRateMHz, delayFs = 0) => (on ? { pulse: { repRateMHz, pulseWidthFs: widthFs, phaseNs: delayFs * 1e-6 } } : {});

// The allocator call the app would make, in SI and in the app's units.
export function allocatorInputs(v, overrides = {}) {
  const o = { ...v, ...overrides };
  const gamma = seedWl => parametricGainCoefficient({
    pumpWl: o.pumpWl, signalWl: seedWl, nPump: o.nPump, nSignal: o.nSignal, nIdler: o.nIdler,
    dEffPmV: o.dEffPmV, pumpIntensityWm2: o.pumpIntensityGWcm2 * GW_PER_CM2,
  });
  const seeds = [{
    key: 'seed', wl: o.seedWl, powerW: o.seedOn ? o.seedPowerW : 0,
    gammaPerM: gamma(o.seedWl) ?? 0, deltaKPerM: o.deltaKPerMm * 1e3,
    ...pulseOf(o.seedPulsed, o.seedFwhmFs, o.repRateMHz, o.delayFs),
  }];
  if (o.seed2On) {
    seeds.push({
      key: 'seed2', wl: o.seed2Wl, powerW: o.seedOn ? o.seedPowerW : 0,
      gammaPerM: gamma(o.seed2Wl) ?? 0, deltaKPerM: o.deltaKPerMm * 1e3,
      ...pulseOf(o.seedPulsed, o.seedFwhmFs, o.repRateMHz, o.seed2DelayFs),
    });
  }
  return {
    pump: { wl: o.pumpWl, powerW: o.pumpPowerW, ...pulseOf(o.pumpPulsed, o.pumpFwhmFs, o.repRateMHz) },
    seeds, lengthM: o.lengthMm * 1e-3, maxDepletion: o.maxDepletion,
  };
}

// Undepleted (no energy limit) average gain: the same allocation with a
// pump budget so large it never binds. Gamma is supplied separately, so
// this changes only the budget, not the gain.
function undepletedGain(v, overrides) {
  const args = allocatorInputs(v, overrides);
  const result = allocateParametricAmplifier({ ...args, pump: { ...args.pump, powerW: 1e250 }, maxDepletion: 1 });
  return result?.channels.find(c => c.key === 'seed')?.achievedGain ?? null;
}

export function computeOpa(v) {
  const pair = parametricPair(v.pumpWl, v.seedWl);
  const gammaPerM = pair ? parametricGainCoefficient({
    pumpWl: v.pumpWl, signalWl: v.seedWl, nPump: v.nPump, nSignal: v.nSignal, nIdler: v.nIdler,
    dEffPmV: v.dEffPmV, pumpIntensityWm2: v.pumpIntensityGWcm2 * GW_PER_CM2,
  }) : null;
  const deltaKPerM = v.deltaKPerMm * 1e3, lengthM = v.lengthMm * 1e-3;
  const small = gammaPerM === null ? null : parametricSmallSignalGain({ gammaPerM, lengthM, deltaKPerM });
  const allocation = allocateParametricAmplifier(allocatorInputs(v));
  const seed = allocation?.channels.find(c => c.key === 'seed') ?? null;
  const seed2 = allocation?.channels.find(c => c.key === 'seed2') ?? null;
  const repHz = v.repRateMHz * 1e6;
  const pumpEnergyJ = v.pumpPulsed ? v.pumpPowerW / repHz : null;
  const pumpPeakW = v.pumpPulsed ? GAUSSIAN_PEAK_FACTOR * pumpEnergyJ / (v.pumpFwhmFs * 1e-15) : v.pumpPowerW;
  // Gaussian beam: I_peak = 2 P_peak / (pi w^2), w the 1/e^2 intensity radius.
  const beamRadiusM = v.pumpIntensityGWcm2 > 0 ? Math.sqrt(2 * pumpPeakW / (Math.PI * v.pumpIntensityGWcm2 * GW_PER_CM2)) : null;
  const perPulse = watts => (v.pumpPulsed || v.seedPulsed ? watts / repHz : null);
  return {
    pair, gammaPerM, small, allocation, seed, seed2,
    gammaL: gammaPerM === null ? null : gammaPerM * lengthM,
    mismatchPhase: deltaKPerM * lengthM,
    undepletedGain: seed?.state === 'amplifying' ? undepletedGain(v) : null,
    pumpEnergyJ, pumpPeakW, beamRadiusM,
    signalEnergyJ: seed ? perPulse(seed.signalOutW) : null,
    idlerEnergyJ: seed ? perPulse(seed.idlerOutW) : null,
    energyErrorW: allocation ? allocation.pumpOutW + allocation.channels.reduce((sum, c) => sum + c.signalOutW + c.idlerOutW, 0) - allocation.totalInputW : null,
    notes: notesFor(v, { pair, beamRadiusM }),
  };
}

function notesFor(v, { pair, beamRadiusM }) {
  const notes = [];
  if (beamRadiusM !== null && beamRadiusM < 2 * v.pumpWl * 1e-9) {
    notes.push('The peak intensity and pump power imply a beam radius below two wavelengths: check them, a real focus cannot be that small.');
  }
  if (pair && pair.idlerWl > 5000) notes.push(`The idler (${Math.round(pair.idlerWl)} nm) is beyond 5 µm, outside the transparency of most oxide crystals. Absorption of the idler suppresses the gain; this model assumes it is transparent.`);
  if (!v.seedPulsed && v.pumpPulsed) notes.push('A continuous seed is amplified only while a pump pulse is present, so its average-power gain is small even when the peak gain is huge.');
  return notes;
}

const range = (from, to, n) => Array.from({ length: n }, (_, k) => from + (to - from) * k / (n - 1));

// Graph 1: signal gain against the seed delay, with and without the energy limit.
export function delayScan(v, n = 161) {
  if (!(v.pumpPulsed && v.seedPulsed)) return null;
  const span = 2.5 * Math.max(v.pumpFwhmFs, v.seedFwhmFs);
  return range(-span, span, n).map(delayFs => ({
    x: delayFs,
    depleted: allocateParametricAmplifier(allocatorInputs(v, { delayFs }))?.channels.find(c => c.key === 'seed')?.achievedGain ?? null,
    undepleted: undepletedGain(v, { delayFs }),
  }));
}

// Graph 3: signal gain against the peak pump intensity.
export function intensityScan(v, n = 81) {
  const top = Math.max(1, 2.5 * v.pumpIntensityGWcm2);
  return range(0, top, n).map(pumpIntensityGWcm2 => ({
    x: pumpIntensityGWcm2,
    depleted: allocateParametricAmplifier(allocatorInputs(v, { pumpIntensityGWcm2 }))?.channels.find(c => c.key === 'seed')?.achievedGain ?? null,
    undepleted: undepletedGain(v, { pumpIntensityGWcm2 }),
  }));
}

// Graph 2: pump conversion against crystal length, for the app's model and
// for the depleted coupled-wave reference on the same time slices.
export function lengthScan(v, n = 81) {
  const top = Math.max(1, 2.5 * v.lengthMm);
  const lengths = range(0, top, n);
  const model = lengths.map(lengthMm => allocateParametricAmplifier(allocatorInputs(v, { lengthMm }))?.conversionFraction ?? null);
  const reference = v.seed2On ? { values: null, reason: 'the exact curve is drawn for one seed only.' } : coupledWaveCurve(v, lengths);
  const points = lengths.map((x, k) => ({ x, model: model[k], reference: reference.values ? reference.values[k] : null }));
  points.reference = reference;
  return points;
}

const GAUSSIAN_AREA_FWHM = Math.sqrt(Math.PI / (4 * Math.LN2));
const envelope = (t, fwhm) => Math.exp(-4 * Math.LN2 * (t / fwhm) ** 2);

// Convergence control of the exact curve's time average. The window is cut
// into N equal midpoint cells; N doubles until two successive grids agree at
// every plotted length within REFERENCE_TOLERANCE (a fraction of the pump
// energy), or until the Runge-Kutta work would exceed REFERENCE_STEP_BUDGET,
// in which case the curve is declared unavailable rather than drawn wrong.
export const REFERENCE_TOLERANCE = 0.002;
const REFERENCE_FIRST_CELLS = 121;
const REFERENCE_STEP_BUDGET = 2.5e6;

// Pump conversion of the depleted coupled-wave solution, quasi-static in
// time: each cell of the pulse period has its own pump intensity (Gamma
// scales with its square root) and its own seed-to-pump photon ratio, and
// is solved as a plane wave with depletion; the converted pump energies of
// the cells are summed. One seed only. Returns { values, cells, change } or
// { values: null, reason }.
export function coupledWaveCurve(v, lengthsMm) {
  const zeros = { values: lengthsMm.map(() => 0), cells: 0, change: 0 };
  const pair = parametricPair(v.pumpWl, v.seedWl);
  if (!pair || pair.degenerate || !v.seedOn || !(v.seedPowerW > 0) || !(v.pumpPowerW > 0)) return zeros;
  const gammaPeak = parametricGainCoefficient({
    pumpWl: v.pumpWl, signalWl: v.seedWl, nPump: v.nPump, nSignal: v.nSignal, nIdler: v.nIdler,
    dEffPmV: v.dEffPmV, pumpIntensityWm2: v.pumpIntensityGWcm2 * GW_PER_CM2,
  });
  if (!(gammaPeak > 0)) return zeros;
  const periodFs = 1e9 / v.repRateMHz;
  const tauP = v.pumpPulsed ? v.pumpFwhmFs : null, tauS = v.seedPulsed ? v.seedFwhmFs : null;
  // The delay of the nearest seed pulse, in the same convention as the
  // allocator (mixOverlap): a whole number of periods does not matter.
  const centre = tauP && tauS ? ((v.delayFs % periodFs) + 1.5 * periodFs) % periodFs - periodFs / 2 : 0;
  let lo = -Infinity, hi = Infinity;
  if (tauP) { lo = -2.5 * tauP; hi = 2.5 * tauP; }
  if (tauS) { lo = Math.max(lo, centre - 4 * tauS); hi = Math.min(hi, centre + 4 * tauS); }
  if ((tauP || tauS) && !(hi > lo)) return zeros;
  const lengthsM = lengthsMm.map(l => l * 1e-3);
  const lengthMax = lengthsM.at(-1) ?? 0;
  const deltaKPerM = v.deltaKPerMm * 1e3;

  const cellsOf = n => {
    if (!tauP && !tauS) return [{ pumpShare: 1, seedShare: 1, scale: 1 }];
    const width = (hi - lo) / n;
    return Array.from({ length: n }, (_, k) => {
      const t = lo + (k + 0.5) * width;
      const density = (tau, at) => (tau ? envelope(t - at, tau) / (tau * GAUSSIAN_AREA_FWHM) : 1 / periodFs);
      return { pumpShare: density(tauP, 0) * width, seedShare: density(tauS, centre) * width, scale: tauP ? Math.sqrt(envelope(t, tauP)) : 1 };
    }).filter(c => c.pumpShare > 0 && c.seedShare > 0);
  };
  // The true seed-to-pump photon flux ratio of each cell: powers times
  // wavelength. Never altered; a cell the solver cannot afford makes the
  // whole curve unavailable.
  const problems = cells => cells.map(c => ({
    share: c.pumpShare, gammaPerM: gammaPeak * c.scale, deltaKPerM,
    seedPhotonRatio: (v.seedPowerW * c.seedShare) / (v.pumpPowerW * c.pumpShare) * (v.seedWl / v.pumpWl),
  }));
  const cost = list => list.reduce((sum, p) => sum + coupledWaveStepCount({ ...p, lengthM: lengthMax }), 0);
  const solve = list => {
    const out = lengthsMm.map(() => 0);
    for (const p of list) {
      const conversion = coupledWaveConversion({ ...p, lengthsM });
      if (!conversion) return null;
      conversion.forEach((c, k) => { out[k] += p.share * c; });
    }
    return out;
  };
  const unavailable = reason => ({ values: null, reason });
  const tooCostly = 'the exact curve would need too much computation at these settings (very high gain or a very long crystal); only the model is drawn.';

  let n = REFERENCE_FIRST_CELLS, list = problems(cellsOf(n)), spent = cost(list);
  if (spent > REFERENCE_STEP_BUDGET) return unavailable(tooCostly);
  let previous = solve(list);
  if (!previous) return unavailable(tooCostly);
  if (!tauP && !tauS) return { values: previous, cells: 1, change: 0 };
  for (;;) {
    n *= 2;
    list = problems(cellsOf(n));
    spent += cost(list);
    if (spent > REFERENCE_STEP_BUDGET) return unavailable(tooCostly);
    const next = solve(list);
    if (!next) return unavailable(tooCostly);
    const change = Math.max(...next.map((x, k) => Math.abs(x - previous[k])));
    if (change <= REFERENCE_TOLERANCE) return { values: next, cells: n, change };
    previous = next;
  }
}
