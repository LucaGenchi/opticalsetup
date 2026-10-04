// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Linear, same-source spectral fields. See docs/physics/broadband-interference.md.
import { spectrumSupport, spectrumWeight } from './spectrum.js';

export const SPECTRAL_PATH_LIMIT = 8;
export const SPECTRAL_SAMPLE_LIMIT = 4097;
export const SPECTRAL_UNAVAILABLE = 'Broadband interference unavailable: spectral or path resolution limit; powers added without interference';
export const RECOMBINED_PULSE_UNAVAILABLE = 'Temporal field after interference is unavailable';
const TAU_NM = 2 * Math.PI * 1e6;
const sinc = x => Math.abs(x) < 1e-5 ? 1 - x * x / 6 : Math.sin(x) / x;

// Terms are amplitudes, optical paths (mm), phases (rad), and optionally
// slopes across one sensor interval. Common absolute path/phase cancels.
// widthMm averages over that interval analytically at each wavelength.
export function spectralFieldResult(spec, terms, { widthMm = 0 } = {}) {
  if (!spec || !['gauss', 'flat', 'sampled'].includes(spec.kind)
      || !Array.isArray(terms) || !terms.length || terms.length > SPECTRAL_PATH_LIMIT
      || !Number.isFinite(widthMm) || widthMm < 0) return null;
  if (spec.kind === 'sampled' && (!Array.isArray(spec.w) || spec.w.length < 2 || spec.w.length > SPECTRAL_SAMPLE_LIMIT)) return null;
  const support = spectrumSupport(spec);
  if (!support || !support.every(Number.isFinite) || !(support[0] > 0) || !(support[1] > support[0])) return null;
  const [lo, hi] = support;
  if (terms.some(t => !Number.isFinite(t.amplitude) || t.amplitude < 0
      || !Number.isFinite(t.opdMm) || !Number.isFinite(t.phaseRad ?? 0)
      || !Number.isFinite(t.pol ?? 0) || !Number.isFinite(t.slope ?? 0) || !Number.isFinite(t.phaseSlope ?? 0))) return null;
  const first = terms[0];
  const relative = terms.map(t => ({ amplitude: t.amplitude,
    opd: t.opdMm - first.opdMm, phase: (t.phaseRad || 0) - (first.phaseRad || 0),
    slope: (t.slope || 0) - (first.slope || 0),
    phaseSlope: (t.phaseSlope || 0) - (first.phaseSlope || 0), pol: t.pol || 0,
  }));
  const pairs = [];
  let maxOpd = 0;
  for (let i = 0; i < relative.length; i++) for (let j = 0; j < i; j++) {
    const a = relative[i], b = relative[j];
    const pair = { amplitude: 2 * a.amplitude * b.amplitude * Math.cos((a.pol - b.pol) * Math.PI / 180),
      opd: a.opd - b.opd, phase: a.phase - b.phase,
      slope: a.slope - b.slope, phaseSlope: a.phaseSlope - b.phaseSlope };
    maxOpd = Math.max(maxOpd, Math.abs(pair.opd) + Math.abs(pair.slope) * widthMm / 2);
    pairs.push(pair);
  }
  // At least 32 samples per fastest wavelength fringe, plus source support.
  // This precondition prevents an aliased coarse/fine agreement.
  const needed = Math.max(128, (spec.kind === 'sampled' ? spec.w.length - 1 : 0),
    Math.ceil(32 * 1e6 * maxOpd * (hi - lo) / (lo * lo)));
  let intervals = 2 ** Math.ceil(Math.log2(needed));
  if (intervals * 2 + 1 > SPECTRAL_SAMPLE_LIMIT) return null;
  const diagonal = relative.reduce((sum, t) => sum + t.amplitude ** 2, 0);
  const evaluate = n => {
    const w = [];
    let norm = 0, power = 0;
    for (let i = 0; i <= n; i++) {
      const wl = lo + (hi - lo) * i / n;
      const density = spectrumWeight(spec, wl);
      if (!Number.isFinite(density) || density < 0) return null;
      const k = TAU_NM / wl;
      let value = diagonal;
      for (const p of pairs) value += p.amplitude * Math.cos(k * p.opd + p.phase)
        * sinc((k * p.slope + p.phaseSlope) * widthMm / 2);
      if (!Number.isFinite(value) || value < -1e-9 * Math.max(1, diagonal)) return null;
      const sample = density * Math.max(0, value);
      const weight = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
      w.push(sample);
      norm += weight * density;
      power += weight * sample;
    }
    if (!(norm > 0) || !Number.isFinite(power)) return null;
    return { power: power / norm, spec: { kind: 'sampled', lo, hi, w, interference: true }, samples: n + 1 };
  };
  let coarse = evaluate(intervals);
  if (!coarse) return null;
  while (intervals * 2 + 1 <= SPECTRAL_SAMPLE_LIMIT) {
    intervals *= 2;
    const fine = evaluate(intervals);
    if (!fine) return null;
    if (Math.abs(fine.power - coarse.power) <= 2e-6 * Math.max(1e-12, diagonal)) return fine;
    coarse = fine;
  }
  return null;
}

// The arm mismatch at which two equal copies of this spectrum stop
// interfering well: the optical path difference where fringe visibility
// |∫ S(λ) exp(2πi d/λ) dλ| / ∫ S(λ) dλ first falls to one half. Taken from
// the same spectrum the tracer integrates, so it is the scale of what an
// interferometer here shows -- for a transform-limited Gaussian pulse it is
// the length of the pulse, c × its duration. Null without a finite band.
export function coherencePathMm(spec, samples = 512) {
  const support = spec && ['gauss', 'flat', 'sampled'].includes(spec.kind) ? spectrumSupport(spec) : null;
  if (!support || !support.every(Number.isFinite) || !(support[0] > 0) || !(support[1] > support[0])) return null;
  const [lo, hi] = support;
  const grid = Array.from({ length: samples + 1 }, (_, i) => {
    const wl = lo + (hi - lo) * i / samples;
    const weight = (i === 0 || i === samples ? 1 : i % 2 ? 4 : 2) * Math.max(0, spectrumWeight(spec, wl));
    return { k: TAU_NM / wl, weight };
  });
  const norm = grid.reduce((sum, g) => sum + g.weight, 0);
  if (!(norm > 0)) return null;
  const visibility = d => {
    let re = 0, im = 0;
    for (const g of grid) { re += g.weight * Math.cos(g.k * d); im += g.weight * Math.sin(g.k * d); }
    return Math.hypot(re, im) / norm;
  };
  // λ²/Δλ over the whole support bounds the answer from above for any shape
  // this model has; step well inside it, then bisect the crossing.
  const scale = 1e-6 * lo * hi / (hi - lo);
  const step = scale / 64;
  let below = 0;
  for (let i = 1; i <= 64 * 16; i++) {
    const d = i * step;
    if (visibility(d) <= 0.5) {
      let a = below, b = d;
      for (let n = 0; n < 40; n++) {
        const mid = (a + b) / 2;
        if (visibility(mid) > 0.5) a = mid; else b = mid;
      }
      return (a + b) / 2;
    }
    below = d;
  }
  return null;
}

// Translate a previously combined field to its current ray reference. A
// scalar attenuation multiplies every term equally. Its spectral phase is
// retained across successive recombinations; a single centroid phase cannot
// substitute for it.
export function spectralTermsAt(field, power, oplMm, phaseRad = 0) {
  if (!field) return [{ amplitude: Math.sqrt(Math.max(0, power)), opdMm: oplMm, phaseRad }];
  if (!(field.power > 0)) return [];
  const scale = Math.sqrt(Math.max(0, power) / field.power);
  return field.terms.map(t => ({ amplitude: t.amplitude * scale,
    opdMm: oplMm + t.opdMm, phaseRad: phaseRad + t.phaseRad }));
}
