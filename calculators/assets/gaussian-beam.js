// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Gaussian beams in closed form, shared by the fiber-coupling and thin and
// thick lens pages: the waist, Rayleigh range and divergence, the beam at
// any distance, and focusing by an ideal thin lens (Self's equations). A
// beam of quality M² in a medium of index n is the embedded Gaussian of
// ISO 11146: the TEM₀₀ formulas with λ replaced by M² λ / n.
//
//   z_R = π w₀² n / (M² λ),   θ = M² λ / (π n w₀),
//   w(z) = w₀ √(1 + (z/z_R)²),   R(z) = z (1 + (z_R/z)²),   ψ(z) = atan(z/z_R).
//
// Units: λ in nm, beam radii in µm, distances and focal lengths in mm,
// angles in mrad.
//
// Every function here goes through the beam parameter q of
// sketch/js/gaussian-beam.js, the propagation the canvas tracer uses for its
// beams (step G1), so the pages and the canvas cannot disagree on a Gaussian
// beam's waist.

import { beamFromQ, propagateQ, qFromWaist, thinLensMatrix, transformQ } from '../../sketch/js/gaussian-beam.js';

// A half angle for a refusal: the formulas' own number while it still
// means something.
export const steepText = mrad => (mrad <= 1e4 ? `${Math.round(mrad)} mrad` : 'more than 10 rad');

const effectiveWavelengthMm = (wavelengthNm, m2, index) => m2 * wavelengthNm * 1e-6 / index;

// The beam from its waist radius.
export function gaussianBeam({ waistUm, wavelengthNm, m2 = 1, index = 1 }) {
  const lambda = effectiveWavelengthMm(wavelengthNm, m2, index), w0 = waistUm * 1e-3;
  const halfDivergenceMrad = lambda / (Math.PI * w0) * 1e3;
  return { waistUm, wavelengthNm, m2, index, rayleighMm: Math.PI * w0 * w0 / lambda, halfDivergenceMrad, bppMmMrad: w0 * halfDivergenceMrad };
}

// Radius, wavefront radius of curvature (Infinity at the waist) and Gouy
// phase z mm from the waist.
export function beamAt(beam, zMm) {
  const here = beamFromQ(qFromWaist({ ...beam, zMm }), beam);
  return { radiusUm: here.radiusUm, curvatureMm: here.curvatureMm, gouyDeg: here.gouyDeg };
}

// An ideal thin lens of focal length f, `distanceMm` after the waist: the
// new waist, its distance after the lens (negative for a virtual waist
// before it) and the magnification. The q law through the lens's matrix,
// which is Self's closed form (Appl. Opt. 22, 658 (1983)) evaluated another
// way: magnification 1/√((1 − s/f)² + (z_R/f)²).
export function thinLensFocus(beam, distanceMm, focalMm) {
  const atLens = propagateQ(qFromWaist(beam), distanceMm);
  const after = transformQ(atLens, thinLensMatrix(focalMm), beam.index ?? 1, beam.index ?? 1);
  const waist = beamFromQ(after, beam);
  return {
    beam: gaussianBeam({ ...beam, waistUm: waist.waistUm }), magnification: waist.waistUm / beam.waistUm,
    distanceMm: waist.waistAheadMm,
    lensRadiusUm: beamFromQ(atLens, beam).radiusUm,
  };
}
