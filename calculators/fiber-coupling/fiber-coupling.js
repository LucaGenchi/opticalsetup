// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Coupling a collimated TEM₀₀ beam into a single-mode fiber through an
// ideal thin lens. The fiber's fundamental mode is taken as a Gaussian of
// radius w_m: given (the datasheet mode-field diameter), or from the core
// radius a and NA by Marcuse's fit (Bell Syst. Tech. J. 56, 703 (1977)),
//
//   V = 2π a NA / λ,   w_m / a = 0.65 + 1.619 V^(−3/2) + 2.879 V^(−6),
//
// which the Python reference checks against the best Gaussian for the exact
// LP₀₁ mode over 1.2 ≤ V ≤ 3.5, the range this page accepts (within 1 %). The efficiency is the
// normalized overlap of the focused beam and that mode on the fiber face,
// in closed form. Per transverse axis, with the beam's complex curvature
// A = ik/(2q) (q = Δz + i z_R′ at the face, Δz past the focus), B = 1/w_m²,
// a lateral offset x₀ and a tilt θ. Geometry: x₀ is where the beam's centre
// meets the fiber face, measured from the fiber axis; θ is the angle of the
// beam's axis to the fiber's, in the same plane, positive when the beam
// travels toward +x (the side of a positive offset). Fields carry exp(−ikz)
// (Kogelnik and Li), the convention in which exp(−ikx²/(2q)) diverges past
// the waist, so that beam carries exp(−ikθx) on the face. Its sign matters
// together with an offset and defocus; the Python reference pins it by
// propagating the field.
//
//   η_x = 2 √(Re A · B) / |A + B| · exp(2 Re[(2A x₀ − ikθ)² / (4(A + B)) − A x₀²]),
//
// and η = η_x(x₀, θ) · η_y(0, 0). With no offset, tilt or defocus this is
// (2 w w_m / (w² + w_m²))². Units: λ in nm, beam diameter in mm, mode and
// offsets in µm, distances in mm, tilt in mrad.
import { defaultsFor, parseInputs, unavailable } from '../assets/calculator-inputs.js';
import { gaussianBeam, thinLensFocus, steepText } from '../gaussian-beam/gaussian-beam.js';

// First zero of J₀: LP₁₁ is guided above it.
export const SINGLE_MODE_V = 2.404825557695773;
// The range of V in which the page uses Marcuse's fit: where the Python
// reference checks it against the exact mode (within 1 % there).
export const MARCUSE_V = [1.2, 3.5];
// Beyond this half angle (rad) the paraxial beam formulas do not hold.
export const PARAXIAL_LIMIT_MRAD = 300;

export function fiberMode({ wavelengthNm, coreDiameterUm, na }) {
  const a = coreDiameterUm / 2;
  const vNumber = 2 * Math.PI * a * na / (wavelengthNm * 1e-3);
  const ratio = 0.65 + 1.619 * vNumber ** -1.5 + 2.879 * vNumber ** -6;
  return {
    vNumber, singleMode: vNumber < SINGLE_MODE_V, inFit: vNumber >= MARCUSE_V[0] && vNumber <= MARCUSE_V[1],
    modeFieldDiameterUm: 2 * ratio * a,
    cutoffNm: 2 * Math.PI * a * na / SINGLE_MODE_V * 1e3,
  };
}

// Complex arithmetic on [re, im] pairs, for the overlap.
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const scale = (a, s) => [a[0] * s, a[1] * s];

// One transverse axis of the overlap; see the header.
function overlapAxis(waistUm, modeRadiusUm, axialOffsetUm, offsetUm, tiltMrad, wavelengthNm) {
  const k = 2 * Math.PI / (wavelengthNm * 1e-3);                     // 1/µm
  const zr = Math.PI * waistUm * waistUm / (wavelengthNm * 1e-3);    // µm
  // A = ik/(2q), q = Δz + i z_R.
  const A = div([0, k / 2], [axialOffsetUm, zr]);
  const B = [1 / (modeRadiusUm * modeRadiusUm), 0];
  const sum = add(A, B);
  const linear = add(scale(A, 2 * offsetUm), [0, -k * tiltMrad * 1e-3]);
  const exponent = add(div(mul(linear, linear), scale(sum, 4)), scale(A, -offsetUm * offsetUm));
  return 2 * Math.sqrt(A[0] * B[0]) / Math.hypot(sum[0], sum[1]) * Math.exp(2 * exponent[0]);
}

export function gaussianCoupling({ waistUm, modeRadiusUm, wavelengthNm, axialOffsetUm = 0, lateralOffsetUm = 0, tiltMrad = 0 }) {
  return overlapAxis(waistUm, modeRadiusUm, axialOffsetUm, lateralOffsetUm, tiltMrad, wavelengthNm)
    * overlapAxis(waistUm, modeRadiusUm, axialOffsetUm, 0, 0, wavelengthNm);
}

// The focused beam of a collimated TEM₀₀ beam (waist at the lens).
export function focusCollimated(beamDiameterMm, wavelengthNm, focalMm) {
  const input = gaussianBeam({ waistUm: beamDiameterMm * 500, wavelengthNm });
  const focus = thinLensFocus(input, 0, focalMm);
  return { input, beam: focus.beam, distanceMm: focus.distanceMm };
}

// The focal length that focuses the beam to the mode radius exactly:
// w′ = w f / √(f² + z_R²) = w_m. Null when the beam is not larger than the
// mode (no positive lens can then shrink it to the mode).
export function matchingFocalMm(beamDiameterMm, wavelengthNm, modeRadiusUm) {
  const input = gaussianBeam({ waistUm: beamDiameterMm * 500, wavelengthNm });
  const w = input.waistUm, m = modeRadiusUm;
  return w > m ? m * input.rayleighMm / Math.sqrt(w * w - m * m) : null;
}

export const FIBER_INPUTS = [
  { id: 'wavelengthNm', group: 'laser', label: 'Wavelength', unit: 'nm', value: 1550, min: 200, max: 20000, arrowStep: 1,
    help: 'Vacuum wavelength of the laser.' },
  { id: 'beamDiameterMm', group: 'laser', label: 'Beam diameter at the lens (1/e²)', unit: 'mm', value: 2, min: 0.01, max: 100, arrowStep: 0.1,
    help: 'A collimated TEM₀₀ beam, its waist at the lens.' },
  { id: 'focalMm', group: 'laser', label: 'Lens focal length f', unit: 'mm', value: 11, min: 0.1, max: 10000, arrowStep: 0.1,
    help: 'An ideal thin lens: no aberrations, aperture large enough not to clip the beam.' },
  { id: 'fiberMode', type: 'select', group: 'fiber', label: 'Fiber mode given by', value: 'mfd',
    options: [['mfd', 'Mode-field diameter (datasheet)'], ['step', 'Core diameter and NA (step index)']],
    help: 'Datasheets quote the mode-field diameter at one wavelength; the core and NA give it at any wavelength.' },
  { id: 'mfdUm', group: 'fiber', label: 'Mode-field diameter', unit: 'µm', value: 10.4, min: 0.5, max: 200, arrowStep: 0.1, when: 'fiberMode', whenValue: 'mfd',
    help: '1/e² intensity diameter of the fundamental mode at this wavelength.' },
  { id: 'coreDiameterUm', group: 'fiber', label: 'Core diameter', unit: 'µm', value: 8.2, min: 0.5, max: 100, arrowStep: 0.1, when: 'fiberMode', whenValue: 'step',
    help: 'Step-index core.' },
  { id: 'na', group: 'fiber', label: 'Numerical aperture', unit: '', value: 0.14, min: 0.01, max: 0.5, arrowStep: 0.01, when: 'fiberMode', whenValue: 'step',
    help: 'NA = √(n_core² − n_clad²), the index-profile NA.' },
  { id: 'lateralOffsetUm', group: 'align', label: 'Lateral offset on the face', unit: 'µm', value: 0, min: 0, max: 1000, arrowStep: 0.1,
    help: 'Where the beam’s centre meets the fiber face, measured from the fiber axis.' },
  { id: 'axialOffsetUm', group: 'align', label: 'Axial offset from the focus', unit: 'µm', value: 0, min: -100000, max: 100000, arrowStep: 1,
    help: 'Fiber face beyond (positive) or before (negative) the focused waist.' },
  { id: 'tiltMrad', group: 'align', label: 'Tilt', unit: 'mrad', value: 0, min: -300, max: 300, arrowStep: 0.5,
    help: 'Angle between the beam axis and the fiber axis, in the plane of the offset: positive when the beam travels away from the axis on the offset side, negative when back toward it.' },
];
export const FIBER_DEFAULTS = defaultsFor(FIBER_INPUTS);

const LOSS_1DB = 10 ** -0.1;
const lossDb = eta => -10 * Math.log10(eta);

// The misalignment along one axis that costs 1 dB beyond the aligned
// coupling, with the other two at zero, by bisection.
function toleranceFor(key, base, guess) {
  const aligned = gaussianCoupling(base);
  const at = x => gaussianCoupling({ ...base, [key]: x }) / aligned;
  let lo = 0, hi = guess;
  while (at(hi) > LOSS_1DB && hi < 1e9) hi *= 2;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) > LOSS_1DB) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function computeFiberCoupling(raw) {
  const { values: v, errors } = parseInputs(FIBER_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  let mode;
  if (v.fiberMode === 'step') {
    mode = fiberMode(v);
    if (!mode.inFit) {
      return unavailable(`V = ${mode.vNumber.toFixed(3)}: outside ${MARCUSE_V[0]}–${MARCUSE_V[1]}, the range in which this page’s Gaussian fit to the fundamental mode is checked. Enter the mode-field diameter instead.`, 'coreDiameterUm', 'na');
    }
  } else mode = { modeFieldDiameterUm: v.mfdUm };
  const modeRadiusUm = mode.modeFieldDiameterUm / 2;
  // The fiber mode's own far-field half angle, in air: a mode this small
  // spreads beyond the paraxial approximation as well.
  const modeDivergenceMrad = v.wavelengthNm * 1e-3 / (Math.PI * modeRadiusUm) * 1e3;
  if (modeDivergenceMrad > PARAXIAL_LIMIT_MRAD) {
    return unavailable(`A ${mode.modeFieldDiameterUm.toPrecision(3)} µm mode at ${v.wavelengthNm} nm spreads at a half angle of ${steepText(modeDivergenceMrad)}: beyond the paraxial approximation the Gaussian-mode model rests on. Single-mode fibers have modes several wavelengths wide.`, v.fiberMode === 'step' ? 'coreDiameterUm' : 'mfdUm');
  }
  const focus = focusCollimated(v.beamDiameterMm, v.wavelengthNm, v.focalMm);
  const waistUm = focus.beam.waistUm;
  if (!(Number.isFinite(waistUm) && waistUm > 0 && Number.isFinite(focus.distanceMm)) || focus.beam.halfDivergenceMrad > PARAXIAL_LIMIT_MRAD) {
    return unavailable(`The lens focuses the beam at a half angle of ${steepText(focus.beam.halfDivergenceMrad)}, far outside the paraxial approximation this page rests on (and the acceptance of any single-mode fiber). Choose a longer focal length or a narrower beam.`, 'focalMm', 'beamDiameterMm');
  }
  // The face must lie after the lens: before it the light is still the
  // incoming beam, not the focused one.
  if (!(focus.distanceMm + v.axialOffsetUm * 1e-3 > 0)) {
    return unavailable(`An axial offset of ${v.axialOffsetUm} µm puts the fiber face ${(-(focus.distanceMm + v.axialOffsetUm * 1e-3)).toFixed(3)} mm before the lens; the focus is ${focus.distanceMm.toFixed(3)} mm after it.`, 'axialOffsetUm');
  }
  const base = { waistUm, modeRadiusUm, wavelengthNm: v.wavelengthNm };
  const offsets = { axialOffsetUm: v.axialOffsetUm, lateralOffsetUm: v.lateralOffsetUm, tiltMrad: v.tiltMrad };
  const matchEfficiency = gaussianCoupling(base);
  const efficiency = gaussianCoupling({ ...base, ...offsets });
  return {
    ok: true, values: v, mode, modeRadiusUm, modeDivergenceMrad, focus,
    focusWaistUm: waistUm, focusDistanceMm: focus.distanceMm,
    optimalFocalMm: matchingFocalMm(v.beamDiameterMm, v.wavelengthNm, modeRadiusUm),
    matchEfficiency, efficiency, matchLossDb: lossDb(matchEfficiency), lossDb: lossDb(efficiency),
    ...(v.fiberMode === 'step' ? { vNumber: mode.vNumber, cutoffNm: mode.cutoffNm, modeFieldDiameterUm: mode.modeFieldDiameterUm } : {}),
    tolerance: {
      lateralUm: toleranceFor('lateralOffsetUm', base, modeRadiusUm),
      axialUm: toleranceFor('axialOffsetUm', base, focus.beam.rayleighMm * 1e3),
      tiltMrad: toleranceFor('tiltMrad', base, modeDivergenceMrad),
    },
  };
}

// The next 1, 2 or 5 × 10ⁿ at or above x, so a scan ends on a round tick.
const roundUp = x => { const e = 10 ** Math.floor(Math.log10(x)); return [1, 2, 5, 10].find(m => m * e >= x * (1 - 1e-12)) * e; };

// Efficiency against one quantity, the others as set.
export function couplingScan(result, key, count = 241) {
  const v = result.values, base = { waistUm: result.focusWaistUm, modeRadiusUm: result.modeRadiusUm, wavelengthNm: v.wavelengthNm,
    axialOffsetUm: v.axialOffsetUm, lateralOffsetUm: v.lateralOffsetUm, tiltMrad: v.tiltMrad };
  if (key === 'focalMm') {
    const centre = result.optimalFocalMm ?? v.focalMm, lo = Math.min(centre, v.focalMm) / 3, hi = Math.max(centre, v.focalMm) * 3;
    return Array.from({ length: count }, (_, i) => {
      const f = lo * (hi / lo) ** (i / (count - 1));
      const focus = focusCollimated(v.beamDiameterMm, v.wavelengthNm, f);
      // No value where the page would refuse: beyond the paraxial limit, or
      // with the face before the lens.
      const valid = focus.beam.halfDivergenceMrad <= PARAXIAL_LIMIT_MRAD && focus.distanceMm + v.axialOffsetUm * 1e-3 > 0;
      return { x: f, efficiency: valid ? gaussianCoupling({ ...base, waistUm: focus.beam.waistUm }) : null };
    });
  }
  const reach = roundUp({
    lateralOffsetUm: Math.max(3 * result.tolerance.lateralUm, 1.2 * v.lateralOffsetUm),
    axialOffsetUm: Math.max(3 * result.tolerance.axialUm, 1.2 * Math.abs(v.axialOffsetUm)),
    tiltMrad: Math.max(3 * result.tolerance.tiltMrad, 1.2 * Math.abs(v.tiltMrad)),
  }[key]);
  // The axial scan stops at the lens; tilt runs both ways.
  const span = key === 'axialOffsetUm' ? [Math.max(-reach, -result.focusDistanceMm * 1e3 * (1 - 1e-6)), reach] : key === 'tiltMrad' ? [-Math.min(reach, PARAXIAL_LIMIT_MRAD), Math.min(reach, PARAXIAL_LIMIT_MRAD)] : [0, reach];
  return Array.from({ length: count }, (_, i) => {
    const x = span[0] + (span[1] - span[0]) * i / (count - 1);
    return { x, efficiency: gaussianCoupling({ ...base, [key]: x }) };
  });
}
