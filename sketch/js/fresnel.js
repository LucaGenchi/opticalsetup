// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Fresnel transmission at an uncoated, lossless dielectric face, and the
// polarization it leaves (docs/physics/prism-fresnel.md). The canvas is the
// plane of incidence: p is the app's 0° (s₁ = +1), s is 90°. DOM-free.

// Power transmittances for s and p, T = 1 − r², or null beyond the critical
// angle. cosIncidence is |cos θ₁|.
export function fresnelTransmittances(n1, n2, cosIncidence) {
  const ci = Math.min(1, Math.max(0, Math.abs(cosIncidence)));
  const sinT = (n1 / n2) * Math.sqrt(Math.max(0, 1 - ci * ci));
  if (!(sinT < 1)) return null;
  const ct = Math.sqrt(1 - sinT * sinT);
  const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
  const rp = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct);
  const Ts = 1 - rs * rs, Tp = 1 - rp * rp;
  return Number.isFinite(Ts) && Number.isFinite(Tp) ? { Ts, Tp } : null;
}

// A face as a partial polarizer along p (Mueller diattenuator). Takes a
// normalized Stokes vector, or null for unpolarized light; returns the power
// fraction transmitted and the normalized Stokes vector after the face.
export function throughFace(stokes, { Ts, Tp }) {
  const mean = (Tp + Ts) / 2, diff = (Tp - Ts) / 2, cross = Math.sqrt(Tp * Ts);
  const s = stokes || { s1: 0, s2: 0, s3: 0 };
  const T = mean + diff * s.s1;
  if (!(T > 0)) return { T: 0, stokes: stokes ? { ...stokes } : null };
  return {
    T,
    stokes: { s1: (diff + mean * s.s1) / T, s2: cross * s.s2 / T, s3: cross * s.s3 / T },
  };
}
