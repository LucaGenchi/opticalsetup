// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Gaussian beams through ray-transfer matrices (step G1 of the Physics in 2D
// track, docs/physics/beam-propagation.md). One set of functions for the
// canvas tracer and the calculators: calculators/assets/gaussian-beam.js
// builds its closed forms on these. DOM-free.
//
// A beam of quality M² in a medium of index n is the embedded Gaussian of
// ISO 11146: the TEM₀₀ formulas with the vacuum wavelength λ replaced by
// M² λ / n. Its complex beam parameter (P. A. Bélanger, Opt. Lett. 16, 196
// (1991)) is
//
//   1/q = 1/R − i M² λ / (π n w²),   q = z + i z_R,
//
// with z the distance from the waist (positive after it), w the 1/e²
// intensity radius and R the wavefront's radius of curvature. Matrices act
// on the reduced ray (y, n·u), on which every lossless paraxial system has
// determinant 1, and the reduced beam parameter q/n transforms as
//
//   q′/n′ = (A·q/n + B) / (C·q/n + D)
//
// (A. E. Siegman, Lasers, University Science Books (1986), ch. 20). Units:
// q, z and lengths in mm, beam radii in µm in the readouts, λ in nm.

export const complex = (re, im = 0) => ({ re, im });
const add = (a, b) => complex(a.re + b.re, a.im + b.im);
const mul = (a, b) => complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const scale = (a, s) => complex(a.re * s, a.im * s);
const div = (a, b) => {
  const d = b.re * b.re + b.im * b.im;
  return complex((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
};

const lambdaMm = (wavelengthNm, m2 = 1) => m2 * wavelengthNm * 1e-6;

// The beam parameter `zMm` after a waist of radius `waistUm` (q = z + i z_R).
export function qFromWaist({ waistUm, wavelengthNm, m2 = 1, index = 1, zMm = 0 }) {
  const w0 = waistUm * 1e-3;
  return complex(zMm, Math.PI * w0 * w0 * index / lambdaMm(wavelengthNm, m2));
}

// Free propagation over `distanceMm` in one medium.
export const propagateQ = (q, distanceMm) => complex(q.re + distanceMm, q.im);

// Through a ray-transfer matrix on the reduced ray (y, n·u), from a medium of
// index nIn to one of index nOut. Null when the result is not a beam (a
// singular matrix, or one that is not lossless enough to keep Im q > 0).
export function transformQ(q, { A, B, C, D }, nIn = 1, nOut = 1) {
  const reduced = scale(q, 1 / nIn);
  const out = div(add(scale(reduced, A), complex(B)), add(scale(reduced, C), complex(D)));
  const next = scale(out, nOut);
  return Number.isFinite(next.re) && Number.isFinite(next.im) && next.im > 0 ? next : null;
}

// Everything a readout states, from q: the radius w and wavefront radius R
// here (Infinity at the waist), the waist w₀, how far along the beam the
// waist lies (positive ahead, negative behind), the Rayleigh range and the
// Gouy phase relative to the waist, atan(z / z_R), of one transverse plane.
export function beamFromQ(q, { wavelengthNm, m2 = 1, index = 1 }) {
  if (!q || !(q.im > 0) || !Number.isFinite(q.re)) return null;
  const lambda = lambdaMm(wavelengthNm, m2) / index;
  const zR = q.im, z = q.re;
  const w0 = Math.sqrt(lambda * zR / Math.PI);
  const w = w0 * Math.sqrt(1 + (z / zR) ** 2);
  return {
    radiusUm: w * 1e3,
    curvatureMm: z === 0 ? Infinity : z * (1 + (zR / z) ** 2),
    waistUm: w0 * 1e3,
    waistAheadMm: -z,
    rayleighMm: zR,
    gouyDeg: Math.atan2(z, zR) * 180 / Math.PI,
    halfDivergenceMrad: lambda / (Math.PI * w0) * 1e3,
  };
}

// Ray-transfer matrices of the analytic elements, on the reduced ray.
export const freeSpaceMatrix = (lengthMm, index = 1) => ({ A: 1, B: lengthMm / index, C: 0, D: 1 });
export const thinLensMatrix = focalMm => ({ A: 1, B: 0, C: -1 / focalMm, D: 1 });
export const composeMatrices = (...matrices) => matrices.reduce((m, next) => ({
  A: next.A * m.A + next.B * m.C, B: next.A * m.B + next.B * m.D,
  C: next.C * m.A + next.D * m.C, D: next.C * m.B + next.D * m.D,
}), { A: 1, B: 0, C: 0, D: 1 });

export { add as complexAdd, mul as complexMul, div as complexDiv };
