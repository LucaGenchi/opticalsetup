// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Gaussian beams in closed form: the waist, Rayleigh range and divergence,
// the beam at any distance, and focusing by an ideal thin lens (Self's
// equations). A beam of quality M² in a medium of index n is the embedded
// Gaussian of ISO 11146: the TEM₀₀ formulas with λ replaced by M² λ / n.
//
//   z_R = π w₀² n / (M² λ),   θ = M² λ / (π n w₀),
//   w(z) = w₀ √(1 + (z/z_R)²),   R(z) = z (1 + (z_R/z)²),   ψ(z) = atan(z/z_R).
//
// Units: λ in nm, beam radii in µm, distances and focal lengths in mm,
// angles in mrad, power in W, intensity in W/cm².
import { defaultsFor, parseInputs, unavailable } from '../assets/calculator-inputs.js';

const effectiveWavelengthMm = (wavelengthNm, m2, index) => m2 * wavelengthNm * 1e-6 / index;

// The beam from its waist radius.
export function gaussianBeam({ waistUm, wavelengthNm, m2 = 1, index = 1 }) {
  const lambda = effectiveWavelengthMm(wavelengthNm, m2, index), w0 = waistUm * 1e-3;
  const halfDivergenceMrad = lambda / (Math.PI * w0) * 1e3;
  return { waistUm, wavelengthNm, m2, index, rayleighMm: Math.PI * w0 * w0 / lambda, halfDivergenceMrad, bppMmMrad: w0 * halfDivergenceMrad };
}

// The waist radius from what the beam is given by.
export function waistFrom(given, value, wavelengthNm, m2 = 1, index = 1) {
  const lambda = effectiveWavelengthMm(wavelengthNm, m2, index);
  if (given === 'waist') return value;
  if (given === 'diameter') return value / 2;
  // A full divergence angle in mrad: w₀ = λ/(π θ), θ the half angle.
  if (given === 'divergence') return lambda / (Math.PI * value / 2 * 1e-3) * 1e3;
  // A Rayleigh range in mm.
  return Math.sqrt(value * lambda / Math.PI) * 1e3;
}

// Radius, wavefront radius of curvature (Infinity at the waist) and Gouy
// phase z mm from the waist.
export function beamAt(beam, zMm) {
  const t = zMm / beam.rayleighMm;
  return {
    radiusUm: beam.waistUm * Math.sqrt(1 + t * t),
    curvatureMm: zMm === 0 ? Infinity : zMm * (1 + 1 / (t * t)),
    gouyDeg: Math.atan(t) * 180 / Math.PI,
  };
}

// An ideal thin lens of focal length f, `distanceMm` after the waist
// (Self, Appl. Opt. 22, 658 (1983)): the new waist, its distance after the
// lens (negative for a virtual waist before it) and the magnification.
export function thinLensFocus(beam, distanceMm, focalMm) {
  const s = distanceMm, f = focalMm, zr = beam.rayleighMm;
  const magnification = 1 / Math.sqrt((1 - s / f) ** 2 + (zr / f) ** 2);
  const out = gaussianBeam({ ...beam, waistUm: beam.waistUm * magnification });
  return {
    beam: out, magnification,
    distanceMm: f + (s - f) * f * f / ((s - f) ** 2 + zr * zr),
    lensRadiusUm: beamAt(beam, s).radiusUm,
  };
}

export const GAUSSIAN_INPUTS = [
  { id: 'wavelengthNm', group: 'beam', label: 'Wavelength', unit: 'nm', value: 1064, min: 100, max: 100000, arrowStep: 1,
    help: 'Vacuum wavelength.' },
  { id: 'given', type: 'select', group: 'beam', label: 'Beam given by', value: 'waist',
    options: [['waist', 'Waist radius w₀'], ['diameter', 'Waist diameter 2w₀'], ['divergence', 'Full divergence angle 2θ'], ['rayleigh', 'Rayleigh range z_R']],
    help: 'Any one of these fixes the others. All widths are 1/e² intensity radii or diameters.' },
  { id: 'waistUm', group: 'beam', label: 'Waist radius w₀', unit: 'µm', value: 500, min: 0.1, max: 1e6, when: 'given', whenValue: 'waist',
    help: '1/e² intensity radius at the narrowest point.' },
  { id: 'waistDiameterUm', group: 'beam', label: 'Waist diameter 2w₀', unit: 'µm', value: 1000, min: 0.2, max: 2e6, when: 'given', whenValue: 'diameter',
    help: '1/e² intensity diameter at the narrowest point.' },
  { id: 'divergenceMrad', group: 'beam', label: 'Full divergence 2θ', unit: 'mrad', value: 1.355, min: 1e-4, max: 1000, when: 'given', whenValue: 'divergence',
    help: 'Full far-field angle of the 1/e² diameter. Paraxial: keep it well below 1 rad.' },
  { id: 'rayleighMm', group: 'beam', label: 'Rayleigh range z_R', unit: 'mm', value: 738, min: 1e-4, max: 1e9, when: 'given', whenValue: 'rayleigh',
    help: 'Distance from the waist to where the area has doubled.' },
  { id: 'm2', group: 'beam', label: 'Beam quality M²', unit: '', value: 1, min: 1, max: 1000, arrowStep: 0.1,
    help: '1 for an ideal TEM₀₀ beam. Larger values spread M² times faster for the same waist.' },
  { id: 'index', group: 'beam', label: 'Refractive index of the medium', unit: '', value: 1, min: 1, max: 4, arrowStep: 0.01,
    help: 'The beam propagates in a uniform medium of this index (1 for air or vacuum).' },
  { id: 'powerW', group: 'beam', label: 'Power (0: not given)', unit: 'W', value: 1, min: 0, max: 1e9,
    help: 'For the peak intensity of a TEM₀₀ beam.' },
  { id: 'zMm', group: 'position', label: 'Distance from the waist z', unit: 'mm', value: 1000, min: -1e8, max: 1e8,
    help: 'Where to read the beam; negative before the waist. With a lens, z runs on past it.' },
  { id: 'lens', type: 'checkbox', group: 'lens', label: 'Focus with a thin lens', value: false,
    help: 'An ideal thin lens on the beam axis.' },
  { id: 'focalMm', group: 'lens', label: 'Focal length f', unit: 'mm', value: 100, min: -1e6, max: 1e6, when: 'lens',
    help: 'Negative for a diverging lens.' },
  { id: 'lensDistanceMm', group: 'lens', label: 'Lens distance from the waist d', unit: 'mm', value: 500, min: 0, max: 1e8, when: 'lens',
    help: 'The lens sits d after the input waist.' },
];
export const GAUSSIAN_DEFAULTS = defaultsFor(GAUSSIAN_INPUTS);

const VALUE_ID = { waist: 'waistUm', diameter: 'waistDiameterUm', divergence: 'divergenceMrad', rayleigh: 'rayleighMm' };

// The beam everywhere: before the lens (or with none) the input beam,
// after it the focused one, in its own coordinate from its waist.
export function beamAlong(result, zMm) {
  const { input, lens } = result;
  if (!lens || zMm <= lens.positionMm) return { ...beamAt(input, zMm), after: false };
  return { ...beamAt(lens.output, zMm - lens.positionMm - lens.distanceMm), after: true };
}

export function computeGaussianBeam(raw) {
  const { values: v, errors } = parseInputs(GAUSSIAN_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  if (v.lens && v.focalMm === 0) return unavailable('A focal length of 0 is not a lens.', 'focalMm');
  const waistUm = waistFrom(v.given, v[VALUE_ID[v.given]], v.wavelengthNm, v.m2, v.index);
  const input = gaussianBeam({ waistUm, wavelengthNm: v.wavelengthNm, m2: v.m2, index: v.index });
  if (input.halfDivergenceMrad > 300) return unavailable(`This waist diverges at ${Math.round(input.halfDivergenceMrad)} mrad (half angle): far outside the paraxial approximation these formulas rest on. Choose a larger waist or a smaller divergence.`, VALUE_ID[v.given]);
  let lens = null;
  if (v.lens) {
    const focus = thinLensFocus(input, v.lensDistanceMm, v.focalMm);
    lens = { positionMm: v.lensDistanceMm, focalMm: v.focalMm, output: focus.beam, distanceMm: focus.distanceMm, magnification: focus.magnification, lensRadiusUm: focus.lensRadiusUm };
  }
  const result = { ok: true, values: v, input, lens };
  const at = beamAlong(result, v.zMm);
  const peak = (radiusUm) => (v.powerW > 0 && v.m2 === 1 ? 2 * v.powerW / (Math.PI * (radiusUm * 1e-4) ** 2) : null);
  return {
    ...result, at,
    // For the validation table: flat names, as the reference writes them.
    waistUm, rayleighMm: input.rayleighMm, halfDivergenceMrad: input.halfDivergenceMrad, bppMmMrad: input.bppMmMrad,
    radiusUm: at.radiusUm, curvatureMm: at.curvatureMm,
    gouyDeg: v.m2 === 1 && !at.after ? at.gouyDeg : null,
    peakIntensityWcm2: peak(at.radiusUm), waistIntensityWcm2: peak(waistUm),
    ...(lens ? { focusWaistUm: lens.output.waistUm, focusDistanceMm: lens.distanceMm, focusRayleighMm: lens.output.rayleighMm, magnification: lens.magnification, lensRadiusUm: lens.lensRadiusUm } : {}),
  };
}

// The span the graphs cover: the waist, the reading point and, with a
// lens, the lens and the new waist, each with room around it.
export function plotSpan(result) {
  const { input, lens, values: v } = result;
  const points = [v.zMm];
  if (!lens) points.push(-2 * input.rayleighMm, 2 * input.rayleighMm);
  else {
    const waistAt = lens.positionMm + lens.distanceMm;
    points.push(-Math.min(2 * input.rayleighMm, Math.max(lens.positionMm, input.rayleighMm) / 2), 0, lens.positionMm);
    if (lens.distanceMm > 0) points.push(waistAt + Math.max(2 * lens.output.rayleighMm, 0.5 * lens.distanceMm));
    else points.push(lens.positionMm + Math.max(2 * Math.abs(lens.distanceMm), 2 * lens.output.rayleighMm, lens.positionMm));
  }
  const lo = Math.min(...points), hi = Math.max(...points), pad = 0.05 * (hi - lo || 1);
  return [lo - pad, hi + pad];
}

export function gaussianScan(result, count = 401) {
  const [lo, hi] = plotSpan(result);
  return Array.from({ length: count }, (_, i) => {
    const zMm = lo + (hi - lo) * i / (count - 1);
    return { zMm, ...beamAlong(result, zMm) };
  });
}
