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

import { parametricPair, mixWidthNm } from './parametric.js';
import { allocateParametricAmplifier } from './parametric-amplifier.js';
import { gaussianSpectrum, lineSpectrum, spectrumStats, spectrumSupport, spectrumWeight } from './spectrum.js';

// The allocator works with Gamma (1/m) and a length; any length works as
// long as Gamma L is right, so a fixed 1 mm reference is used.
export const OPA_REFERENCE_LENGTH_M = 1e-3;
// A seed is sliced where the gain is: across the overlap of its spectrum
// with the gain band, out to where the band's excess gain is below 1e-6 of
// its peak (2.23 FWHM; 2.5 is used). The slices resolve whichever of the two
// is narrower, so a 0.1 nm band inside a 600 nm continuum and a narrow seed
// inside a wide band are both integrated, not sampled on a coarse grid.
export const SEED_SLICES = 65;
const GAIN_REACH_FWHM = 2.5;

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

// The area under a profile's weight (peak 1): the normaliser that turns its
// weight into a density. Exact for the two continuous profiles sources emit.
function profileArea(spec) {
  if (spec.kind === 'gauss') return spec.fwhm * Math.sqrt(Math.PI / (4 * Math.LN2));
  if (spec.kind === 'flat') return spec.hi - spec.lo;
  return 0;
}

// A seed beam's spectral slices: { wl, fraction, line } of its power in the
// part of its spectrum the gain band reaches. Supported seeds are the ones
// sources emit: a monochromatic line, a Gaussian line, a flat continuum and a
// lamp's discrete lines. A Gaussian or flat profile is smooth and single, so
// 65 slices across its overlap with the band resolve both. A reshaped
// (sampled) spectrum, for instance a filtered continuum, can hide structure
// narrower than any fixed slicing: it returns null, and the seed is reported
// as unsupported rather than silently mis-sampled.
export function seedSlices(settings, { wl, bw, spec }) {
  const profile = spec || (bw > 0 ? gaussianSpectrum(wl, bw) : null);
  const reach = GAIN_REACH_FWHM * settings.gainBandwidthNm;
  const inBand = x => Math.abs(x - settings.signalWl) <= reach;
  if (!profile) return inBand(wl) ? [{ wl, fraction: 1, line: true }] : [];
  if (profile.kind === 'lines') {
    const total = profile.lines.reduce((sum, l) => sum + l.w, 0);
    return total > 0 ? profile.lines.filter(l => inBand(l.nm)).map(l => ({ wl: l.nm, fraction: l.w / total, line: true })) : [];
  }
  if (profile.kind !== 'gauss' && profile.kind !== 'flat') return null;
  const [supportLo, supportHi] = spectrumSupport(profile);
  const lo = Math.max(supportLo, settings.signalWl - reach), hi = Math.min(supportHi, settings.signalWl + reach);
  const area = profileArea(profile);
  if (!(hi > lo) || !(area > 0)) return [];
  const width = (hi - lo) / SEED_SLICES;
  const slices = [];
  for (let k = 0; k < SEED_SLICES; k++) {
    const x = lo + (k + 0.5) * width;
    const fraction = Math.max(0, spectrumWeight(profile, x)) * width / area;
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
  const lo = kept[0].wl, hi = kept.at(-1).wl, n = 65, w = [];
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
  const spec = peak > 0 ? { kind: 'sampled', lo, hi, w: w.map(v => v / peak) } : null;
  const stats = spec ? spectrumStats(spec) : null;
  return { wl: centroid, bw: stats?.fwhm ?? 0, spec };
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

  // One allocator channel per seed slice.
  const channels = [];
  const unsupported = new Set();
  const lineSeeds = new Set();
  for (const seed of seeds) {
    const slices = seedSlices(settings, seed);
    if (slices === null) { unsupported.add(seed.key); continue; }
    if (slices.some(slice => slice.line)) lineSeeds.add(seed.key);
    for (const [i, slice] of slices.entries()) {
      const gain = opaGainAt(settings, slice.wl);
      channels.push({
        seedKey: seed.key, key: `${seed.key}#${i}`, wl: slice.wl,
        powerW: seed.powerW * slice.fraction,
        gammaPerM: gammaLForGain(gain) / OPA_REFERENCE_LENGTH_M, deltaKPerM: 0,
        pulse: seed.pulse || undefined, opl: seed.opl,
      });
    }
  }
  const result = channels.length ? allocateParametricAmplifier({
    pump: { wl: pump.wl, powerW: pump.powerW, pulse: pump.pulse || undefined, opl: pump.opl },
    seeds: channels.map(({ seedKey, ...c }) => c),
    lengthM: OPA_REFERENCE_LENGTH_M, maxDepletion: settings.maxDepletion,
  }) : null;
  const byKey = new Map((result?.channels || []).map(c => [c.key, c]));
  const seedResults = seeds.map(seed => {
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
    let state = unsupported.has(seed.key) ? 'spectrumUnsupported' : amplifying.length ? 'amplifying' : !mine.length ? 'outsideBand'
      : states.length === 1 ? states[0] : states.find(s => s !== 'inactive') || 'inactive';
    if (state === 'invalidWavelength') state = 'seedBelowPump';
    return {
      key: seed.key, wl: seed.wl, seedW: seed.powerW, gainW, idlerW, pumpW,
      achievedGain: seed.powerW > 0 ? (seed.powerW + gainW) / seed.powerW : 1,
      saturated: amplifying.some(c => c.out.saturated),
      lowOverlap: mine.some(c => c.out?.lowOverlap),
      overlap: mine.find(c => c.out)?.out?.overlap ?? null,
      skewNs: mine.find(c => c.out)?.out?.skewNs ?? null,
      peakGain: mine.length ? Math.max(...mine.map(c => opaGainAt(settings, c.wl))) : 1,
      signal, idler, idlerWl: idler?.wl ?? idlerAt(seed.wl), state,
    };
  });
  const pumpOutW = result ? result.pumpOutW : pump.powerW;
  const any = seedResults.some(s => s.state === 'amplifying');
  return {
    ...withPump,
    state: any ? 'amplifying' : seedResults[0]?.state || 'inactive',
    seeds: seedResults,
    pumpOutW,
    pumpScale: pump.powerW > 0 ? pumpOutW / pump.powerW : 1,
    conversion: pump.powerW > 0 ? (pump.powerW - pumpOutW) / pump.powerW : 0,
  };
}
