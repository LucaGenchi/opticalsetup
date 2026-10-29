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
