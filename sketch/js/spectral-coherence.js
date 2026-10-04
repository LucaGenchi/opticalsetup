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

// The arm mismatch at which two equal copies of a source spectrum stop
// interfering well: the optical path difference where fringe visibility
// |∫ S(λ) exp(2πi d/λ) dλ| / ∫ S(λ) dλ first falls to one half. Taken from
// the same spectrum the tracer integrates, so it is the scale of what an
// interferometer here shows; for a narrow-band transform-limited Gaussian
// pulse it approaches the length of the pulse, c × its duration.
//
// Returns the length in mm; null when the spectrum has no finite band (a
// single line has no such limit); NaN when the band is finite but the answer
// was not resolved. Only the single-band source shapes are supported --
// 'gauss' and 'flat'. A sampled profile can dip below one half between any
// two search points, so it is declined rather than searched.
const coherenceCache = new Map();
export function coherencePathMm(spec) {
  if (!spec) return null;
  if (!['gauss', 'flat'].includes(spec.kind)) return spec.kind === 'sampled' ? NaN : null;
  const support = spectrumSupport(spec);
  if (!support || !support.every(Number.isFinite) || !(support[0] > 0) || !(support[1] > support[0])) return null;
  const key = JSON.stringify(spec);
  if (!coherenceCache.has(key)) {
    if (coherenceCache.size > 64) coherenceCache.clear();
    coherenceCache.set(key, halfVisibilityPathMm(spec, support));
  }
  return coherenceCache.get(key);
}

function halfVisibilityPathMm(spec, [lo, hi]) {
  // Integrate in wavenumber k = 1/λ, where the phase 2π d k is linear, one
  // octave of wavelength at a time: an octave's sample count follows the
  // fringes it holds at this d, so a band reaching to very short wavelengths
  // is resolved without oversampling the rest. S(λ) dλ = S(1/k) dk / k².
  const octaves = [];
  for (let a = lo; a < hi; a = Math.min(hi, a * 2)) octaves.push([1 / Math.min(hi, a * 2), 1 / a]);
  const moments = dNm => {
    let re = 0, im = 0, norm = 0, first = 0, second = 0;
    for (const [ka, kb] of octaves) {
      const n = 2 * Math.min(32768, Math.ceil(Math.max(16, 16 * dNm * (kb - ka))));
      const h = (kb - ka) / n;
      for (let i = 0; i <= n; i++) {
        const k = ka + h * i;
        const weight = (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * h * Math.max(0, spectrumWeight(spec, 1 / k)) / (k * k);
        const phase = 2 * Math.PI * dNm * k;
        re += weight * Math.cos(phase); im += weight * Math.sin(phase);
        norm += weight; first += weight * k; second += weight * k * k;
      }
    }
    return { visibility: norm > 0 ? Math.hypot(re, im) / norm : NaN, norm, mean: first / norm, meanSquare: second / norm };
  };
  const at0 = moments(0);
  if (!(at0.norm > 0)) return null;
  const sigmaK = Math.sqrt(Math.max(0, at0.meanSquare - at0.mean ** 2));
  if (!(sigmaK > 0)) return null;
  // A Gaussian reaches one half at 1.18 of this scale and a flat band at
  // 1.09; step well inside it and stop far beyond it.
  const scaleNm = 1 / (2 * Math.PI * sigmaK);
  const step = scaleNm / 16;
  let below = 0;
  for (let i = 1; i <= 16 * 40; i++) {
    const d = i * step;
    const v = moments(d).visibility;
    if (!Number.isFinite(v)) return NaN;
    if (v <= 0.5) {
      let a = below, b = d;
      for (let n = 0; n < 40; n++) {
        const mid = (a + b) / 2;
        if (moments(mid).visibility > 0.5) a = mid; else b = mid;
      }
      return (a + b) / 2 * 1e-6;
    }
    below = d;
  }
  return NaN;
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
