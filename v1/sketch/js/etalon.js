// Fabry–Pérot etalon: two closely spaced, matched partially reflective
// coatings. Real transmission is governed by multi-beam interference (the
// Airy function) — at a resonance the reflected components from every
// internal bounce cancel and transmission climbs to the coating-limited
// peak even for high reflectivity, repeating periodically at the free
// spectral range. That is not reachable by summing independent partial
// reflections (this app's qualitative tracer never tracks phase), so the
// element is implemented as a single spectral-filter surface — see
// etalonAiryTransmission() in raytrace.js — the same architecture already
// used by `filter`/`dichroic`, just driven by the closed-form multi-beam
// result instead of a simple edge/band shape.
//
// No separate "tilt" parameter: the transmission is evaluated with the ray's
// actual incidence angle at the hit, so rotating the element (like any other
// element) shifts the resonance wavelength exactly like tilting a real
// etalon does.

import { registry } from './elements.js';

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, Number(value)));

// Both mirrors matched (R1 = R2 = R): finesse F = π√R / (1-R). Inverting for
// R given a target finesse (Spectral input mode: FSR / FWHM) means solving
// Fx² + πx − F = 0 for x = √R. Shared with vipa.js — a VIPA is, spectrally,
// the same tilted Fabry–Pérot cavity, just illuminated and read out
// geometrically rather than through a phase-tracked transmission function.
export function reflectivityForFinesse(F) {
  if (!(F > 0)) return 0;
  const x = (-Math.PI + Math.sqrt(Math.PI * Math.PI + 4 * F * F)) / (2 * F);
  return clamp(x * x, 0, 0.995);
}

export function finesseForReflectivity(R) {
  return (1 - R) > 1e-6 ? Math.PI * Math.sqrt(R) / (1 - R) : Infinity;
}

// Nearest integer cavity mode order for a target FSR at a given center
// wavelength, and the spacing (nm) that order implies — shared with
// vipa.js. A resonance must sit exactly at the tuned center wavelength; the
// raw λ²/(2·FSR) spacing only lands there when λ/FSR happens to be an
// integer, so this rounds to the nearest mode order instead. The resulting
// FSR is the closest real one to what was asked for.
export function spacingForFsr(lam0, fsrTarget) {
  const order = Math.max(1, Math.round(lam0 / fsrTarget));
  return (order * lam0) / 2;
}

// Default free spectral range is 19 nm (532 / 19 = 28, an exact integer
// mode order) so the default 1 nm bandwidth gives a clean, well-separated
// transmission comb (finesse ~19) out of the box, with the center
// wavelength landing exactly on a resonance rather than a rounded
// approximation of one.
const DEFAULT_WAVELENGTH_NM = 532;
const DEFAULT_FSR_NM = 19;

// Canonical physical values {R, spacingNm, loss} the tracer needs, derived
// from the spectral parameters (center wavelength, bandwidth, FSR, peak
// transmission) — the only way to specify an etalon.
export function resolveEtalonPhysical(params = {}) {
  const lam0 = Math.max(1, params.centerWavelength ?? DEFAULT_WAVELENGTH_NM);
  const fwhm = Math.max(0.0001, params.bandwidth ?? 1);
  const fsrTarget = Math.max(fwhm * 1.01, params.fsr ?? DEFAULT_FSR_NM);
  const R = reflectivityForFinesse(fsrTarget / fwhm);
  const spacingNm = spacingForFsr(lam0, fsrTarget);
  const peakT = clamp((params.peakTransmission ?? 98) / 100, 0, 1);
  const surfaceT = (1 - R) * Math.sqrt(peakT);
  const loss = clamp((1 - R) - surfaceT, 0, 1 - R);
  return { R, spacingNm: clamp(spacingNm, 1000, 20000000), loss };
}

// Exposed for tests: the same physics numbers a spec sheet would quote.
export function etalonDerivedInfo(params = {}) {
  const { R, spacingNm, loss } = resolveEtalonPhysical(params);
  const lam0 = params.centerWavelength ?? DEFAULT_WAVELENGTH_NM;
  const finesse = finesseForReflectivity(R);
  const fsr = (lam0 * lam0) / (2 * spacingNm);
  const fwhm = Number.isFinite(finesse) && finesse > 0 ? fsr / finesse : 0;
  const surfaceT = Math.max(0, 1 - R - loss);
  const peakTransmission = (1 - R) > 1e-9 ? (surfaceT * surfaceT) / ((1 - R) * (1 - R)) : 0;
  return { reflectivity: R * 100, spacingUm: spacingNm / 1000, finesse, fsr, fwhm, peakTransmission: peakTransmission * 100 };
}

export const etalonDefinition = {
  label: 'Etalon (Fabry–Pérot)',
  category: 'Filters & Splitters',
  paletteOrder: 4,
  aliases: [
    'fabry perot', 'fabry–pérot etalon', 'fabry-perot etalon', 'interferometer',
    'spectral filter cavity', 'free spectral range', 'finesse',
  ],
  description: 'Two closely spaced, matched partially reflective coatings. Multi-beam interference gives narrow, periodic high-transmission peaks (the free spectral range) rather than a flat partial reflection — light off-resonance reflects, light at a resonance transmits at up to the coating-limited peak. Rotating the element shifts the resonance wavelength, like tilting a real etalon.',
  size: { w: 10, h: 41 },
  size_: element => ({ w: 10, h: (element.params.aperture ?? 35) + 6 }),
  params: [
    { key: 'aperture', label: 'Clear aperture (mm)', type: 'number', min: 6, max: 150, step: 1, def: 35 },
    { key: 'centerWavelength', label: 'Center wavelength (nm)', type: 'number', min: 150, max: 8000, step: 1, def: DEFAULT_WAVELENGTH_NM },
    { key: 'bandwidth', label: 'Transmission bandwidth, FWHM (nm)', type: 'number', min: 0.0001, max: 500, step: 0.01, def: 1 },
    { key: 'fsr', label: 'Free spectral range (nm)', type: 'number', min: 0.001, max: 2000, step: 0.05, def: DEFAULT_FSR_NM },
    { key: 'peakTransmission', label: 'Peak transmission (%)', type: 'number', min: 1, max: 100, step: 0.5, def: 98 },
  ],
  svg(element) {
    const half = (element.params.aperture ?? 35) / 2;
    return `<rect x="-3" y="${-half}" width="6" height="${2 * half}" fill="#eaf4fb" fill-opacity="0.75" stroke="#4a90c4" stroke-width="1.2"/>` +
      `<line x1="-3" y1="${-half}" x2="-3" y2="${half}" stroke="#2f6690" stroke-width="1.6"/>` +
      `<line x1="3" y1="${-half}" x2="3" y2="${half}" stroke="#2f6690" stroke-width="1.6"/>`;
  },
  surfaces(element) {
    const half = (element.params.aperture ?? 35) / 2;
    const { R, spacingNm, loss } = resolveEtalonPhysical(element.params);
    return [{ x1: 0, y1: -half, x2: 0, y2: half, kind: 'etalon', data: { R, spacingNm, loss } }];
  },
};

registry.etalon = etalonDefinition;
