// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Fresnel transmission at an uncoated, lossless dielectric face, and the
// polarization it leaves (docs/physics/prism-fresnel.md). The canvas is the
// plane of incidence: p is the app's 0° (s₁ = +1), s is 90°. The
// coefficients and the matrices live in mueller.js. DOM-free.

import {
  applyMueller, fresnelCoefficients, fresnelTransmittancesFromCoefficients,
  linearDiattenuatorMueller, stokesVector,
} from './mueller.js';

// Power transmittances for s and p, T = 1 − r², or null beyond the critical
// angle. cosIncidence is |cos θ₁|.
export function fresnelTransmittances(n1, n2, cosIncidence) {
  return fresnelTransmittancesFromCoefficients(fresnelCoefficients(n1, n2, cosIncidence));
}

// A face as a partial polarizer along p (Mueller diattenuator). Takes a
// normalized Stokes vector, or null for unpolarized light; returns the power
// fraction transmitted and the normalized Stokes vector after the face.
export function throughFace(stokes, { Ts, Tp }) {
  const [T, S1, S2, S3] = applyMueller(linearDiattenuatorMueller(0, Tp, Ts), stokesVector(stokes));
  if (!(T > 0)) return { T: 0, stokes: stokes ? { ...stokes } : null };
  return { T, stokes: { s1: S1 / T, s2: S2 / T, s3: S3 / T } };
}
