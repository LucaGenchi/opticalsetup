// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The integrated OPA element's model: the settings of a packaged, seeded
// optical parametric amplifier -- where it is tuned, how wide its gain band
// is, how much small-signal gain it gives, how much of the pump it may
// convert -- mapped onto the reviewed physics core. No DOM and no tracer
// state here, so it can be tested directly.
//
// What is phenomenological and what is computed:
// - The gain spectrum is a Gaussian of the authored FWHM around the tuned
//   signal wavelength, peaking at the authored small-signal gain. A real
//   OPA's gain spectrum follows from the crystal's phase matching; this
//   stands in for it with the two numbers a data sheet quotes.
// - From that peak gain at each wavelength, the amplifier is evaluated by
//   allocateParametricAmplifier() (sketch/js/parametric-amplifier.js, PR
//   #181): gain instant by instant through the pulses, Manley-Rowe photon
//   accounting, idler generation and a per-instant pump depletion limit.
//   The authored gain is the gain at the pump's peak intensity: an arcosh
//   gives the Gamma L that produces it.
// - A broadband seed is cut into spectral slices, each amplified with the
//   gain at its own wavelength, so only the phase-matched part of, say, a
//   supercontinuum grows.
// - Pump and seed are timed as they arrive: their durations include what
//   glass, fibers and compressors did to them on the way (arrivingPulse).
// - A seed with a known linear chirp -- stretched, as in optical parametric
//   chirped-pulse amplification (OPCPA) -- carries each wavelength at its own
//   time, t = GDD (omega - omega0). Each slice then meets the pump at that
//   time, so the pump's envelope shapes the amplified spectrum. When the gain
//   window is long compared with the seed's transform limit, the amplified
//   signal keeps the seed's spectral phase, and a compressor after the OPA
//   can recompress it (chirpedSignalPulse).

import { parametricPair, mixOverlap, mixWidthNm } from './parametric.js';
import { allocateParametricAmplifier, MAX_CHANNELS } from './parametric-amplifier.js';
import {
  gaussianSpectrum, lineSpectrum, spectrumStats, spectrumSupport, spectrumWeight,
} from './spectrum.js';
import { DISPERSION_UNAVAILABLE, pulseDurationAfterDispersion } from './glass.js';
import { fieldMetrics } from './pulse-field.js';

// The allocator works with Gamma (1/m) and a length; any length works as
// long as Gamma L is right, so a fixed 1 mm reference is used.
export const OPA_REFERENCE_LENGTH_M = 1e-3;
// A seed is sliced where the gain is: across the overlap of its spectrum
// with the gain band, out to where the band's excess gain is below 1e-6 of
// its peak (2.23 FWHM; 2.5 is used). The slices resolve whichever of the two
// is narrower, so a 0.1 nm band inside a 600 nm continuum and a narrow seed
// inside a wide band are both integrated, not sampled on a coarse grid.
export const SEED_SLICES = 65;
// The fewest slices a continuous seed is cut into when several seeds share
// the allocator's channels (a later stage of a cascade); below this, the
// seeds are reported as too many rather than sampled too coarsely.
export const MIN_SEED_SLICES = 9;
// OPA stages the tracer plans in a cascade, one planning pass per stage
// (sketch/js/raytrace.js, traceScene).
export const MAX_OPA_STAGES = 6;
const GAIN_REACH_FWHM = 2.5;
// The amplified signal keeps a chirped seed's spectral phase only while the
// pump's gain window, tau_p / sqrt(Gamma L) at the peak gain, is at least this
// many times the seed's transform limit. A shorter window gates each spectral
// slice in time and adds bandwidth of its own -- in quadrature, 1/3 of the
// seed's adds under 6 % -- which this spectral picture cannot represent, so
// below it the signal's phase is reported as unknown.
export const PHASE_KEPT_WINDOW_RATIO = 3;
const C_NM_PER_FS = 299.792458;

const clamp = (value, lo, hi, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export function opaSettings(params = {}) {
  return {
    signalWl: clamp(params.signalWl, 200, 20000, 800),
    gainBandwidthNm: clamp(params.gainBandwidthNm, 0.1, 5000, 40),
    smallSignalGainDb: clamp(params.smallSignalGainDb, 0, 100, 40),
    maxDepletion: clamp(params.maxDepletion, 0, 1, 0.5),
  };
}

// Peak small-signal gain (at the pump's peak intensity) at wavelength wl.
export function opaGainAt(settings, wl) {
  const g0 = 10 ** (settings.smallSignalGainDb / 10);
  const x = (wl - settings.signalWl) / settings.gainBandwidthNm;
  return 1 + (g0 - 1) * Math.exp(-4 * Math.LN2 * x * x);
}

// The Gamma L that gives power gain G at zero mismatch: G = cosh^2(Gamma L).
export const gammaLForGain = gain => (gain > 1 ? Math.acosh(Math.sqrt(gain)) : 0);

// The integral of a piecewise-linear sampled profile from a to b: exact,
// segment by segment, so slices of it add up to its whole area.
function sampledIntegral(spec, a, b) {
  const n = spec.w.length, dx = (spec.hi - spec.lo) / (n - 1);
  let sum = 0;
  for (let i = 0; i < n - 1; i++) {
    const u = Math.max(a, spec.lo + i * dx), v = Math.min(b, spec.lo + (i + 1) * dx);
    if (v > u) sum += (v - u) * (spectrumWeight(spec, u) + spectrumWeight(spec, v)) / 2;
  }
  return sum;
}
const opaSampled = spec => spec.kind === 'sampled' && spec.opaOutput && Array.isArray(spec.w) && spec.w.length > 1;

// The area under a profile's weight (peak 1): the normaliser that turns its
// weight into a density. Exact for the two continuous profiles sources emit
// and for an OPA's own sampled output.
function profileArea(spec) {
  if (spec.kind === 'gauss') return spec.fwhm * Math.sqrt(Math.PI / (4 * Math.LN2));
  if (spec.kind === 'flat') return spec.hi - spec.lo;
  if (opaSampled(spec)) return sampledIntegral(spec, spec.lo, spec.hi);
  return 0;
}

// A seed beam's spectral slices: { wl, fraction, line } of its power in the
// part of its spectrum the gain band reaches. Supported seeds are the ones
// sources emit -- a monochromatic line, a Gaussian line, a flat continuum and
// a lamp's discrete lines -- and the signal or idler of another OPA (the next
// stage of a cascade), a piecewise-linear profile this module built itself
// (spectrumOf). A Gaussian or flat profile is smooth and single, so `count`
// slices (65 unless several seeds share the allocator) across its overlap
// with the band resolve both; an OPA's own profile is integrated exactly over
// each slice, so its slices add up to its power. Any other reshaped (sampled)
// spectrum, for instance a filtered continuum, can hide structure narrower
// than any fixed slicing: it returns null, and the seed is reported as
// unsupported rather than silently mis-sampled.
export function seedSlices(settings, { wl, bw, spec }, count = SEED_SLICES) {
  const profile = spec || (bw > 0 ? gaussianSpectrum(wl, bw) : null);
  const reach = GAIN_REACH_FWHM * settings.gainBandwidthNm;
  const inBand = x => Math.abs(x - settings.signalWl) <= reach;
  if (!profile) return inBand(wl) ? [{ wl, fraction: 1, line: true }] : [];
  if (profile.kind === 'lines') {
    const total = profile.lines.reduce((sum, l) => sum + l.w, 0);
    return total > 0 ? profile.lines.filter(l => inBand(l.nm)).map(l => ({ wl: l.nm, fraction: l.w / total, line: true })) : [];
  }
  const sampled = opaSampled(profile);
  if (profile.kind !== 'gauss' && profile.kind !== 'flat' && !sampled) return null;
  const [supportLo, supportHi] = spectrumSupport(profile);
  const lo = Math.max(supportLo, settings.signalWl - reach), hi = Math.min(supportHi, settings.signalWl + reach);
  const area = profileArea(profile);
  if (!(hi > lo) || !(area > 0)) return [];
  const width = (hi - lo) / count;
  const slices = [];
  for (let k = 0; k < count; k++) {
    const x = lo + (k + 0.5) * width;
    const fraction = sampled
      ? sampledIntegral(profile, lo + k * width, lo + (k + 1) * width) / area
      : Math.max(0, spectrumWeight(profile, x)) * width / area;
    if (fraction > 0) slices.push({ wl: x, fraction, line: false });
  }
  return slices;
}

// A spectrum from (wavelength, power) points: one line, or a sampled profile
// on a uniform grid, with its centroid and FWHM.
function spectrumOf(points, fallbackBw = 0, lines = false) {
  const kept = points.filter(p => p.powerW > 0).sort((a, b) => a.wl - b.wl);
  if (!kept.length) return null;
  // Discrete inputs give discrete outputs: never interpolate between lines.
  if (lines && kept.length > 1) {
    const spec = lineSpectrum(kept.map(p => ({ nm: p.wl, w: p.powerW })));
    const strongest = kept.reduce((best, p) => (p.powerW > best.powerW ? p : best));
    return { wl: strongest.wl, bw: spectrumStats(spec)?.fwhm ?? 0, spec };
  }
  const total = kept.reduce((sum, p) => sum + p.powerW, 0);
  const centroid = kept.reduce((sum, p) => sum + p.wl * p.powerW, 0) / total;
  if (kept.length === 1) {
    return { wl: centroid, bw: fallbackBw, spec: fallbackBw > 0 ? gaussianSpectrum(centroid, fallbackBw) : null };
  }
  const lo = kept[0].wl, hi = kept.at(-1).wl, n = SEED_SLICES, w = [];
  // Power per unit wavelength at each point: its power over the span it
  // stands for (half-way to each neighbour). The idler's slices are not
  // evenly spaced in wavelength even when the signal's are.
  const density = kept.map((p, k) => {
    const left = k > 0 ? (p.wl - kept[k - 1].wl) / 2 : 0;
    const right = k < kept.length - 1 ? (kept[k + 1].wl - p.wl) / 2 : 0;
    const span = left + right || 1;
    return p.powerW / span;
  });
  for (let i = 0; i < n; i++) {
    const x = lo + (hi - lo) * i / (n - 1);
    const k = Math.min(kept.length - 2, Math.max(0, kept.findIndex(p => p.wl >= x) - 1));
    const a = kept[k], b = kept[k + 1];
    const t = b.wl > a.wl ? Math.min(1, Math.max(0, (x - a.wl) / (b.wl - a.wl))) : 0;
    w.push(density[k] + (density[k + 1] - density[k]) * t);
  }
  const peak = Math.max(...w);
  // Marked as this module's own smooth output: a later OPA stage may slice it
  // (seedSlices). Any element that reshapes it builds a new, unmarked profile.
  const spec = peak > 0 ? { kind: 'sampled', lo, hi, w: w.map(v => v / peak), opaOutput: true } : null;
  const stats = spec ? spectrumStats(spec) : null;
  return { wl: centroid, bw: stats?.fwhm ?? 0, spec };
}

// A beam's pulse as it reaches a port: the record's train with the duration
// it has there, after the GDD and group-delay spread of its path, and -- when
// the duration model knows its spectral phase -- its transform limit and
// total GDD. `issue` says why a duration cannot be stated; the OPA then does
// not amplify on a guess. The same rules as the beam probe's.
export function arrivingPulse(beam) {
  const pulse = beam?.pulse;
  if (!pulse) return { pulse: null, chirp: null, issue: null };
  const gdd = Number.isFinite(beam.gddFs2) ? beam.gddFs2 : 0;
  const spread = Number.isFinite(beam.groupDelayDifferenceFs) ? beam.groupDelayDifferenceFs : 0;
  const declined = issue => ({ pulse: null, chirp: null, issue });
  if (pulse.fieldIssue) return declined(pulse.fieldIssue);
  if (pulse.field) {
    const fwhm = fieldMetrics(pulse.field, gdd)?.fwhmFs;
    return Number.isFinite(fwhm) && fwhm > 0
      ? { pulse: { ...pulse, pulseWidthFs: fwhm }, chirp: null, issue: null } : declined(DISPERSION_UNAVAILABLE.sampled);
  }
  const d = pulseDurationAfterDispersion(pulse, gdd, spread);
  if (!d || d.available === false || !(d.durationFs > 0)) return declined(d?.model || 'Pulse duration unavailable');
  const centreNm = Number(pulse.centerWavelengthNm) > 0 ? Number(pulse.centerWavelengthNm) : beam.wl;
  const chirp = d.transformLimitFs > 0 && Number.isFinite(d.inputGddFs2) && Number.isFinite(d.totalGddFs2) && centreNm > 0
    ? { tau0Fs: d.transformLimitFs, gddFs2: d.totalGddFs2, centreNm } : null;
  return { pulse: { ...pulse, pulseWidthFs: d.durationFs }, chirp, issue: null };
}

// The timing of one spectral slice of a chirped seed at wavelength wl: its
// group delay GDD (omega - omega0) and the seed's transform-limited envelope.
// For a Gaussian the slices' envelopes add up to the chirped pulse's exactly:
// the delays' spread and the transform limit add in quadrature to
// tau0 sqrt(1 + (4 ln2 GDD / tau0^2)^2). Without a known chirp every slice
// keeps the whole arriving envelope.
export function slicePulse({ pulse, chirp }, wl) {
  if (!pulse) return undefined;
  if (!chirp) return pulse;
  const dOmega = 2 * Math.PI * C_NM_PER_FS * (1 / wl - 1 / chirp.centreNm); // rad/fs
  const delayFs = chirp.gddFs2 * dOmega;
  return { ...pulse, pulseWidthFs: chirp.tau0Fs, phaseNs: (Number(pulse.phaseNs) || 0) + delayFs * 1e-6 };
}

// The amplified signal's pulse when it keeps the seed's spectral phase. Gain
// changes the amplitude of the spectrum, not its phase -- as a filter does --
// so the signal is described the way a filtered pulse is: its amplified
// spectrum as the one surviving piece, with the seed's total GDD as its phase
// (filteredPulseDuration in glass.js). Its durations, stretched here and
// recompressed after a compressor, are then the transform of that spectrum
// with that phase, whatever its shape -- a saturated OPA flattens it.
// `base` supplies the train's timing.
export function chirpedSignalPulse(base, signal, gddFs2) {
  const [lo, hi] = signal.spec ? spectrumSupport(signal.spec) : [NaN, NaN];
  if (!(hi > lo)) return null;
  const pulse = {
    ...base,
    centerWavelengthNm: signal.wl, bandwidthNm: signal.bw, spectrumKind: signal.spec.kind,
    spectrumLoNm: lo, spectrumHiNm: hi,
    pulseShape: 'gauss', transformLimited: false, inputGddFs2: gddFs2, spectralPhase: 'seed',
    spectrumReshaped: true, filteredPieces: [{ spec: signal.spec, lo, hi, power: 1 }],
  };
  const here = pulseDurationAfterDispersion(pulse, 0, 0);
  if (!here || here.available === false || !(here.durationFs > 0)) return null;
  return { ...pulse, pulseWidthFs: here.durationFs, transformLimitFs: here.transformLimitFs };
}

// Plan one OPA event from the beams its two ports received in the probe
// pass. `pump` and `seeds` are beam records { key, wl, bw, spec, opl, pulse,
// powerW } with powerW on the one watt basis of the sources' settings (null
// when a source has no power setting). Returns the state, per-seed results
// and the pump's remaining fraction; never throws for physical inputs.
export function planOpa(params, { pump, pumps = [], seeds = [] }) {
  const settings = opaSettings(params);
  const base = { settings, state: 'noPump', seeds: [], pumpInW: 0, pumpOutW: 0, pumpScale: 1, conversion: 0 };
  if (pumps.length > 1) return { ...base, state: 'multiplePumps' };
  if (!pump) return { ...base, state: seeds.length ? 'noPump' : 'idle' };
  const pair = parametricPair(pump.wl, settings.signalWl);
  const idlerAt = wl => parametricPair(pump.wl, wl)?.idlerWl ?? null;
  const withPump = { ...base, pumpWl: pump.wl, pumpInW: pump.powerW ?? 0, pumpOutW: pump.powerW ?? 0, tunedIdlerWl: pair?.idlerWl ?? null };
  if (!pair) return { ...withPump, state: 'tunedBelowPump' };
  if (!seeds.length) return { ...withPump, state: 'noSeed' };
  const watts = w => Number.isFinite(w) && w >= 0; // null >= 0 is true in JavaScript
  if (!watts(pump.powerW) || seeds.some(s => !watts(s.powerW))) return { ...withPump, state: 'uncalibrated' };
  const pumpArrival = arrivingPulse(pump);
  if (pumpArrival.issue) return { ...withPump, state: 'pumpDurationUnavailable', durationIssue: pumpArrival.issue };
  const arrivals = seeds.map(arrivingPulse);

  // One allocator channel per seed slice. Several continuous seeds -- the
  // branches a cascade builds up, stage after stage -- share the allocator's
  // channels: each is cut into fewer slices, down to MIN_SEED_SLICES, and
  // beyond that the seeds are reported as too many, never dropped silently.
  const channels = [];
  const unsupported = new Set();
  const lineSeeds = new Set();
  const sliced = seeds.map(seed => seedSlices(settings, seed));
  const lineChannels = sliced.reduce((sum, s) => sum + (s?.some(slice => slice.line) ? s.length : 0), 0);
  const continuous = sliced.filter(s => s?.length && !s.some(slice => slice.line)).length;
  const count = continuous ? Math.min(SEED_SLICES, Math.floor((MAX_CHANNELS - lineChannels) / continuous)) : SEED_SLICES;
  if (lineChannels > MAX_CHANNELS || (continuous && count < MIN_SEED_SLICES)) {
    const tooMany = seeds.map(seed => ({ key: seed.key, wl: seed.wl, seedW: seed.powerW, gainW: 0, idlerW: 0, pumpW: 0,
      achievedGain: 1, saturated: false, lowOverlap: false, overlap: null, skewNs: null, peakGain: 1,
      signal: null, idler: null, idlerWl: idlerAt(seed.wl), state: 'tooManySeeds' }));
    return { ...withPump, state: 'tooManySeeds', seeds: tooMany };
  }
  for (const [index, seed] of seeds.entries()) {
    if (arrivals[index].issue) continue;
    const first = sliced[index];
    const slices = first && first.length && !first.some(slice => slice.line) && count < SEED_SLICES
      ? seedSlices(settings, seed, count) : first;
    if (slices === null) { unsupported.add(seed.key); continue; }
    if (slices.some(slice => slice.line)) lineSeeds.add(seed.key);
    for (const [i, slice] of slices.entries()) {
      const gain = opaGainAt(settings, slice.wl);
      channels.push({
        seedKey: seed.key, key: `${seed.key}#${i}`, wl: slice.wl,
        powerW: seed.powerW * slice.fraction,
        gammaPerM: gammaLForGain(gain) / OPA_REFERENCE_LENGTH_M, deltaKPerM: 0,
        pulse: slicePulse(arrivals[index], slice.wl), opl: seed.opl,
      });
    }
  }
  const result = channels.length ? allocateParametricAmplifier({
    pump: { wl: pump.wl, powerW: pump.powerW, pulse: pumpArrival.pulse || undefined, opl: pump.opl },
    seeds: channels.map(({ seedKey, ...c }) => c),
    lengthM: OPA_REFERENCE_LENGTH_M, maxDepletion: settings.maxDepletion,
  }) : null;
  const byKey = new Map((result?.channels || []).map(c => [c.key, c]));
  const seedResults = seeds.map((seed, index) => {
    const arrival = arrivals[index];
    const mine = channels.filter(c => c.seedKey === seed.key).map(c => ({ ...c, out: byKey.get(c.key) }));
    const amplifying = mine.filter(c => c.out?.state === 'amplifying');
    const states = [...new Set(mine.map(c => c.out?.state).filter(Boolean))];
    // The amplified light's spectrum is the amplified slices' own: one slice
    // is a line (a monochromatic seed), never the whole seed's width.
    const lines = lineSeeds.has(seed.key);
    const signal = spectrumOf(amplifying.map(c => ({ wl: c.wl, powerW: c.out.signalGainW })), 0, lines);
    const idlerPoints = amplifying.map(c => ({ wl: c.out.idlerWl, powerW: c.out.idlerOutW }));
    const idler = spectrumOf(idlerPoints, signal && idlerPoints.length === 1
      ? mixWidthNm(idlerPoints[0].wl, pump.wl, pump.bw || 0, signal.wl, 0) : 0, lines);
    const gainW = amplifying.reduce((sum, c) => sum + c.out.signalGainW, 0);
    const idlerW = amplifying.reduce((sum, c) => sum + c.out.idlerOutW, 0);
    const pumpW = amplifying.reduce((sum, c) => sum + c.out.depletedPumpW, 0);
    let state = arrival.issue ? 'durationUnavailable' : unsupported.has(seed.key) ? 'spectrumUnsupported'
      : amplifying.length ? 'amplifying' : !mine.length ? 'outsideBand'
      : states.length === 1 ? states[0] : states.find(s => s !== 'inactive') || 'inactive';
    if (state === 'invalidWavelength') state = 'seedBelowPump';
    const peakGain = mine.length ? Math.max(...mine.map(c => opaGainAt(settings, c.wl))) : 1;
    // Seed and pump as whole pulses, for the readout: slices of a chirped
    // seed each meet the pump at their own time.
    const whole = arrival.pulse || pumpArrival.pulse
      ? mixOverlap({ opl: pump.opl, pulse: pumpArrival.pulse }, { opl: seed.opl, pulse: arrival.pulse }) : null;
    // The pump's gain window, as the allocator resolves it: tau_p / sqrt(Gamma L).
    const windowFs = pumpArrival.pulse ? pumpArrival.pulse.pulseWidthFs / Math.sqrt(Math.max(1, gammaLForGain(peakGain))) : Infinity;
    const phaseKept = Boolean(arrival.chirp && !lines && signal?.bw > 0
      && windowFs >= PHASE_KEPT_WINDOW_RATIO * arrival.chirp.tau0Fs);
    return {
      key: seed.key, wl: seed.wl, seedW: seed.powerW, gainW, idlerW, pumpW,
      achievedGain: seed.powerW > 0 ? (seed.powerW + gainW) / seed.powerW : 1,
      saturated: amplifying.some(c => c.out.saturated),
      lowOverlap: mine.some(c => c.out?.lowOverlap),
      overlap: whole && !whole.unsupported ? whole.factor : mine.find(c => c.out)?.out?.overlap ?? null,
      skewNs: whole && !whole.unsupported ? whole.skewNs : mine.find(c => c.out)?.out?.skewNs ?? null,
      peakGain,
      signal, idler, idlerWl: idler?.wl ?? idlerAt(seed.wl), state,
      durationIssue: arrival.issue, arrivingPulse: arrival.pulse, chirp: arrival.chirp,
      gainWindowFs: windowFs, phaseKept,
    };
  });
  const pumpOutW = result ? result.pumpOutW : pump.powerW;
  const any = seedResults.some(s => s.state === 'amplifying');
  return {
    ...withPump,
    pumpPulse: pumpArrival.pulse,
    state: any ? 'amplifying' : seedResults[0]?.state || 'inactive',
    seeds: seedResults,
    pumpOutW,
    pumpScale: pump.powerW > 0 ? pumpOutW / pump.powerW : 1,
    conversion: pump.powerW > 0 ? (pump.powerW - pumpOutW) / pump.powerW : 0,
  };
}
