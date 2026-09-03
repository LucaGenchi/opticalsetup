// Spectral profiles carried by rays, alongside the existing (wl, bw)
// centroid/FWHM pair every part of the tracer already reads. `bw` stays a
// meaningful summary number on its own (drawing color, dispersion checks,
// detector bandMin/bandMax), but only `spec` describes the true shape a
// wavelength-selective element (dichroic, filter, etalon) or a spectrometer
// display should actually integrate against:
//   { kind: 'gauss',   center, fwhm }   a laser line of the given bandwidth
//   { kind: 'flat',    lo, hi }         a supercontinuum / crystal-generated
//                                       broadband slice
//   { kind: 'sampled', lo, hi, w }      whatever survived a filter
// A ray with bw===0 carries spec===null (nothing to integrate — exact
// single-wavelength physics applies).

const SIGMA_PER_FWHM = 1 / (2 * Math.sqrt(2 * Math.LN2));

// Gaussian standard deviation implied by a FWHM bandwidth (≈ FWHM / 2.355).
// Shared with the spectrometer/beam-probe display range calculations, which
// size their plotted window around ±2σ of real signal rather than the raw
// FWHM.
export const fwhmToSigma = fwhm => fwhm * SIGMA_PER_FWHM;

// Gaussian tails are followed to ±3σ (98.9% of the energy): far enough that
// the sampled/re-gridded profiles below are accurate, near enough that a
// wide source stays inside a sane wavelength range instead of reaching into
// X-rays or radio.
const GAUSS_SUPPORT_SIGMA = 3;

import { LAMP_PRESETS } from './lamps.js';

const GRID = 65;
// Nominal half-width given to a discharge line so integrals over it are finite.
const LINE_HALF_NM = 0.05;
const LOCATE_GRID = 257;

// Below this fraction of incident power survives, a filtered result counts
// as fully blocked — keeps a badly-mistuned narrowband element from
// spawning vanishingly weak child rays that can never register on a detector.
const BLOCK = 1e-4;

export const gaussianSpectrum = (center, fwhm) =>
  (fwhm > 0 && center > 0 ? { kind: 'gauss', center, fwhm } : null);

export const flatSpectrum = (lo, hi) =>
  (Math.abs(hi - lo) > 0 ? { kind: 'flat', lo: Math.min(lo, hi), hi: Math.max(lo, hi) } : null);

// A discrete line spectrum: what a low-pressure gas discharge actually emits.
// Kept as the lines themselves rather than re-gridded, because any uniform
// grid fine enough to resolve a 0.1 nm line across the visible would be
// thousands of points wide and every consumer re-samples this.
export const lineSpectrum = lines => {
  const kept = (lines || [])
    .map(l => ({ nm: Number(l.nm), w: Math.max(0, Number(l.w ?? 1)) }))
    .filter(l => Number.isFinite(l.nm) && l.nm > 0 && l.w > 0)
    .sort((a, b) => a.nm - b.nm);
  return kept.length ? { kind: 'lines', lines: kept } : null;
};

export function spectrumSupport(spec) {
  if (!spec) return null;
  if (spec.kind === 'lines') {
    const first = spec.lines[0].nm, last = spec.lines[spec.lines.length - 1].nm;
    // A single line still needs a finite span for anything that integrates.
    return first === last ? [first - 0.05, last + 0.05] : [first, last];
  }
  if (spec.kind === 'gauss') {
    const half = GAUSS_SUPPORT_SIGMA * SIGMA_PER_FWHM * spec.fwhm;
    return [Math.max(1, spec.center - half), spec.center + half];
  }
  return [spec.lo, spec.hi];
}

// Relative weight at one wavelength, normalised so the profile peaks at 1.
export function spectrumWeight(spec, wl) {
  if (!spec) return 1;
  if (spec.kind === 'lines') {
    // Lines are quasi-monochromatic; LINE_HALF_NM is the nominal half-width
    // they are given so that anything asking "how much is at this
    // wavelength" gets a finite answer instead of a delta function.
    let best = 0;
    for (const line of spec.lines) {
      if (Math.abs(wl - line.nm) <= LINE_HALF_NM) best = Math.max(best, line.w);
    }
    return best;
  }
  if (spec.kind === 'gauss') {
    const z = (wl - spec.center) / (SIGMA_PER_FWHM * spec.fwhm);
    return Math.exp(-0.5 * z * z);
  }
  if (wl < spec.lo || wl > spec.hi) return 0;
  if (spec.kind === 'flat') return 1;
  const n = spec.w.length;
  if (n < 2) return spec.w[0] || 0;
  const t = (wl - spec.lo) / (spec.hi - spec.lo) * (n - 1);
  const i = Math.min(n - 2, Math.max(0, Math.floor(t)));
  return spec.w[i] + (spec.w[i + 1] - spec.w[i]) * (t - i);
}

// Uniform grid across the profile's own support (its natural extent — exact
// [lo, hi] for a flat/sampled profile, ±3σ for a Gaussian), weights
// normalised to sum to 1. Used both to render a spectrometer's display curve
// and to weight a dispersive element's per-wavelength ray fan by the real
// spectral density rather than splitting it evenly.
export function spectrumSamples(spec, count = GRID) {
  if (!spec) return null;
  if (spec.kind === 'lines') {
    // The lines ARE the samples. Handing back a uniform grid here would put
    // most of the weight where the lamp emits nothing, and a grating fanning
    // this spectrum would produce colours that are not in the light.
    const total = spec.lines.reduce((sum, l) => sum + l.w, 0);
    if (!(total > 0)) return null;
    return spec.lines.map(l => ({ wl: l.nm, weight: l.w / total }));
  }
  const [lo, hi] = spectrumSupport(spec);
  const n = Math.max(2, count);
  const out = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    const wl = lo + (hi - lo) * i / (n - 1);
    const weight = Math.max(0, spectrumWeight(spec, wl));
    total += weight;
    out.push({ wl, weight });
  }
  if (!(total > 0)) return null;
  for (const sample of out) sample.weight /= total;
  return out;
}

// Centroid and full width at half maximum of an arbitrary profile — after a
// filter reshapes a spectrum it is no longer Gaussian or flat, but FWHM
// stays the width every readout in the app already speaks in.
export function spectrumStats(spec) {
  if (!spec) return null;
  if (spec.kind === 'lines') {
    const total = spec.lines.reduce((sum, l) => sum + l.w, 0);
    if (!(total > 0)) return null;
    const center = spec.lines.reduce((sum, l) => sum + l.nm * l.w, 0) / total;
    const first = spec.lines[0].nm, last = spec.lines[spec.lines.length - 1].nm;
    // For a line spectrum the useful "width" is the span it covers, not a
    // half-maximum of anything: a single line has no width worth quoting.
    return { center, fwhm: last - first };
  }
  if (spec.kind === 'gauss') return { center: spec.center, fwhm: spec.fwhm };
  if (spec.kind === 'flat') return { center: (spec.lo + spec.hi) / 2, fwhm: spec.hi - spec.lo };
  const w = spec.w, n = w.length;
  if (n < 2) return { center: spec.lo, fwhm: 0 };
  const step = (spec.hi - spec.lo) / (n - 1);
  let total = 0, moment = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    total += w[i];
    moment += w[i] * (spec.lo + step * i);
    peak = Math.max(peak, w[i]);
  }
  if (!(total > 0) || !(peak > 0)) return null;
  const half = peak / 2;
  let left = spec.lo, right = spec.hi;
  for (let i = 0; i < n; i++) {
    if (w[i] < half) continue;
    left = i === 0 ? spec.lo : spec.lo + step * (i - 1 + (half - w[i - 1]) / (w[i] - w[i - 1]));
    break;
  }
  for (let i = n - 1; i >= 0; i--) {
    if (w[i] < half) continue;
    right = i === n - 1 ? spec.hi : spec.lo + step * (i + (w[i] - half) / (w[i] - w[i + 1]));
    break;
  }
  return { center: moment / total, fwhm: Math.max(0, right - left) };
}

function integrate(values, step) {
  if (values.length < 2) return 0;
  let sum = (values[0] + values[values.length - 1]) / 2;
  for (let i = 1; i < values.length - 1; i++) sum += values[i];
  return sum * step;
}

// Multiply a ray's spectrum by a transmission function T(wavelength) -> [0,1]
// (a hard passband edge, or an oscillatory Airy transmission — anything).
// Returns the surviving fraction of incident power together with the
// reshaped profile and its new centroid/FWHM, or null when nothing
// measurable survives. With spec === null (a monochromatic ray) this is
// just T(centerWl) — the same exact single-wavelength result every element
// already computes for bw === 0.
export function applyTransmission(spec, centerWl, transmissionFn) {
  if (!spec) {
    const t = Math.max(0, Math.min(1, transmissionFn(centerWl)));
    return t > BLOCK ? { fraction: t, spec: null, wl: centerWl, bw: 0 } : null;
  }
  const [lo, hi] = spectrumSupport(spec);
  const locateStep = (hi - lo) / (LOCATE_GRID - 1);
  const incident = [];
  let first = -1, last = -1;
  for (let i = 0; i < LOCATE_GRID; i++) {
    const wl = lo + locateStep * i;
    incident.push(Math.max(0, spectrumWeight(spec, wl)));
    if (incident[i] * Math.max(0, transmissionFn(wl)) > 0) {
      if (first < 0) first = i;
      last = i;
    }
  }
  const incidentTotal = integrate(incident, locateStep);
  if (first < 0 || !(incidentTotal > 0)) return null;
  // Re-grid onto the surviving slice (plus a point of margin on each side):
  // a 20 nm filter out of a 400 nm source deserves the whole grid, not the
  // handful of coarse points it happens to straddle.
  const from = lo + locateStep * Math.max(0, first - 1);
  const to = lo + locateStep * Math.min(LOCATE_GRID - 1, last + 1);
  const step = (to - from) / (GRID - 1);
  const shaped = [];
  for (let i = 0; i < GRID; i++) {
    const wl = from + step * i;
    shaped.push(Math.max(0, spectrumWeight(spec, wl)) * Math.max(0, Math.min(1, transmissionFn(wl))));
  }
  const transmittedTotal = integrate(shaped, step);
  const fraction = transmittedTotal / incidentTotal;
  const peak = Math.max(...shaped);
  if (!(fraction > BLOCK) || !(peak > 0)) return null;
  const profile = { kind: 'sampled', lo: from, hi: to, w: shaped.map(v => v / peak) };
  const stats = spectrumStats(profile);
  if (!stats) return null;
  return {
    fraction: Math.min(1, fraction),
    spec: stats.fwhm > 0 ? profile : null,
    wl: stats.center,
    bw: stats.fwhm,
  };
}

// Time–bandwidth product for a transform-limited pulse: the minimum
// wavelength FWHM a pulse of the given duration can have. K is the
// dimensionless FWHM·FWHM product (frequency×time) for the pulse's
// intensity envelope shape — 0.441 for Gaussian, 0.315 for sech².
const C_NM_PER_FS = 299.792458; // speed of light, nm/fs
const TBP_K = { gauss: 0.441, sech2: 0.315 };

export function transformLimitedBandwidthNm(pulseWidthFs, wavelengthNm, shape = 'gauss') {
  const K = TBP_K[shape] ?? TBP_K.gauss;
  const dt = Math.max(1e-6, pulseWidthFs);
  const lambda = Math.max(1, wavelengthNm);
  return (lambda * lambda * K) / (C_NM_PER_FS * dt);
}

export function transformLimitedDurationFs(bandwidthNm, wavelengthNm, shape = 'gauss') {
  const K = TBP_K[shape] ?? TBP_K.gauss;
  const dl = Math.max(1e-9, bandwidthNm);
  const lambda = Math.max(1, wavelengthNm);
  return (lambda * lambda * K) / (C_NM_PER_FS * dl);
}

// Every emitting element resolves to the same three-value spectral contract
// the tracer consumes: a centroid wavelength, an FWHM-style width, and the
// true spectral shape (null = exactly monochromatic). Each source type
// arrives at it differently — a CW line is monochromatic by construction, a
// supercontinuum is a flat band between two endpoints, and a pulsed laser
// either derives its width from its own duration (transform-limited) or
// takes an explicitly entered bandwidth, where 0 nm means monochromatic.
// Keeping every one of those rules here is what lets the tracer stay free of
// per-source-type branching.
export function resolveSourceSpectrum(type, params = {}) {
  const p = params;
  if (type === 'lamp') {
    const spec = lineSpectrum(LAMP_PRESETS[p.lampType]?.lines || LAMP_PRESETS.hg.lines);
    if (!spec) return { wl: 546.074, bw: 0, spec: null };
    const stats = spectrumStats(spec);
    // The nominal wavelength is the brightest visible line -- what the beam is
    // drawn as, and what a single-wavelength readout quotes -- while `spec`
    // carries the whole set for anything that disperses or measures it.
    const visible = spec.lines.filter(l => l.nm >= 380 && l.nm <= 780);
    const brightest = (visible.length ? visible : spec.lines)
      .reduce((best, l) => (l.w > best.w ? l : best));
    return { wl: brightest.nm, bw: stats ? stats.fwhm : 0, spec };
  }
  if (type === 'sclaser') {
    const lo = Math.min(p.scMin ?? 300, p.scMax ?? 700);
    const hi = Math.max(p.scMin ?? 300, p.scMax ?? 700);
    return { wl: (lo + hi) / 2, bw: hi - lo, spec: flatSpectrum(lo, hi) };
  }
  const wl = p.wavelength;
  if (type === 'pulsedlaser') {
    const bw = p.transformLimited
      ? transformLimitedBandwidthNm(p.pulseWidthFs || 150, wl, p.pulseShape)
      : Math.max(0, p.bandwidth || 0);
    return { wl, bw, spec: gaussianSpectrum(wl, bw) };
  }
  // Remaining sources (CW laser, point source, object) select a spectrum
  // through the generic `bwMode` switch they each expose.
  const bw = p.bwMode === 'band' ? Math.max(0, p.bandwidth || 0) : 0;
  return { wl, bw, spec: gaussianSpectrum(wl, bw) };
}

// ---- temporal coherence -------------------------------------------------
// Two beams only interfere while their path difference stays inside the
// source's coherence length. A perfectly monochromatic source has an
// infinite one and interferes at any delay; every real source has a finite
// linewidth and therefore a finite envelope, which is the whole mechanism
// behind optical coherence tomography: the fringe amplitude itself locates
// the depth at which the two arms match.
//
// Coherence length here is the FWHM of that envelope, which for a Gaussian
// spectrum is the standard axial-resolution figure lc = (2ln2/pi)·lambda^2/dLambda.

// FWHM of the Gaussian visibility envelope, in the same units as the path
// difference. 0 (or anything non-finite) means an ideal source: no envelope.
export function fringeVisibility(pathDifference, coherenceLengthMm) {
  const lc = Number(coherenceLengthMm);
  if (!Number.isFinite(lc) || lc <= 0) return 1;
  const delta = Math.abs(Number(pathDifference) || 0);
  // exp(-4 ln2 (dL/lc)^2): V = 1/2 exactly at dL = lc/2, so lc is the FWHM.
  return Math.exp(-4 * Math.LN2 * (delta / lc) ** 2);
}

// The linewidth a given coherence length implies, so a source can report the
// spectral width its interference behaviour corresponds to.
export function linewidthForCoherenceLengthNm(coherenceLengthMm, wavelengthNm) {
  const lc = Number(coherenceLengthMm), wl = Number(wavelengthNm);
  if (!Number.isFinite(lc) || lc <= 0 || !Number.isFinite(wl) || wl <= 0) return 0;
  // lambda^2 in nm^2 -> mm^2 is a factor 1e-12; back to nm is 1e6.
  return (2 * Math.LN2 / Math.PI) * wl * wl * 1e-6 / lc;
}

export function coherenceLengthForLinewidthMm(linewidthNm, wavelengthNm) {
  const dl = Number(linewidthNm), wl = Number(wavelengthNm);
  if (!Number.isFinite(dl) || dl <= 0 || !Number.isFinite(wl) || wl <= 0) return 0;
  return (2 * Math.LN2 / Math.PI) * wl * wl * 1e-6 / dl;
}
