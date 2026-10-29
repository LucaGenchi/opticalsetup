// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// First-order optics by the y-nu trace, and the third-order (Seidel) sums
// from the same two rays. For each surface j, with n before and n' after,
//
//   n'u' = n u − y φ,  φ = c (n' − n)   (refraction; 1/f for an ideal lens)
//   y_{j+1} = y_j + t_j u'_j              (transfer)
//
// Everything is linear in the starting ray, which is what the pupil and
// aperture bookkeeping below relies on. Object space is air (n = 1). The
// Seidel sums follow Welford, "Aberrations of Optical Systems" (1986),
// chapters 7-8, including the fourth-order sag term of conics and aspheres.

import { materialIndex } from './materials.js';
import { stopIndexOf } from './system.js';

// Indices after each surface at one wavelength; index 0 of the returned
// array is object space.
export function mediumIndices(system, wavelengthNm) {
  return [1, ...system.surfaces.map(s => materialIndex(s.material, wavelengthNm, s.index))];
}

// Power of surface j between media n and n2.
function surfacePower(s, n, n2) {
  if (s.type === 'paraxial') return 1 / s.focal;
  return (s.radius ? 1 / s.radius : 0) * (n2 - n);
}

// Trace the paraxial ray that has height y0 at surface 1 and slope u0 in
// object space. Returns heights at each surface and slopes after each.
export function paraxialRay(system, n, y0, u0) {
  const S = system.surfaces;
  const y = new Array(S.length), u = new Array(S.length);
  let yj = y0, nu = n[0] * u0;
  for (let j = 0; j < S.length; j++) {
    y[j] = yj;
    nu -= yj * surfacePower(S[j], n[j], n[j + 1]);
    u[j] = nu / n[j + 1];
    if (j < S.length - 1) yj += S[j].thickness * u[j];
  }
  return { y, u };
}

const FAIL = reason => ({ ok: false, reason });

// First-order data at one wavelength. `zEp`, `zXp` and `imageDistance` are
// positions: the entrance pupil from the vertex of surface 1, the exit pupil
// and the paraxial image from the vertex of the last surface.
export function firstOrder(system, wavelengthNm) {
  const n = mediumIndices(system, wavelengthNm);
  const S = system.surfaces, last = S.length - 1, nImage = n[S.length];
  const stop = stopIndexOf(system);

  // Two independent rays span every paraxial ray: A (y 1, u 0), B (y 0, u 1).
  const A = paraxialRay(system, n, 1, 0);
  const B = paraxialRay(system, n, 0, 1);
  const power = -nImage * A.u[last];
  const efl = Math.abs(power) > 1e-15 ? 1 / power : Infinity;
  const bfl = A.u[last] ? -A.y[last] / A.u[last] : Infinity;

  // Entrance pupil: the object-space ray through the axis at zEp reaches the
  // stop centre: −u0 zEp A_s + u0 B_s = 0.
  if (Math.abs(A.y[stop]) < 1e-12) return FAIL('The entrance pupil is at infinity (object-space telecentric): this page needs a finite entrance pupil.');
  const zEp = B.y[stop] / A.y[stop];

  const finite = !system.object.atInfinity;
  const d = system.object.distanceMm;
  if (finite && Math.abs(d + zEp) < 1e-9) return FAIL('The object sits on the entrance pupil.');

  // Entrance-pupil radius from the aperture setting.
  let rEp;
  const ap = system.aperture;
  if (ap.type === 'epd') rEp = ap.value / 2;
  else if (ap.type === 'fno') {
    if (!Number.isFinite(efl)) return FAIL('An F-number needs a finite focal length; set the entrance pupil diameter instead.');
    rEp = Math.abs(efl) / ap.value / 2;
  } else {
    rEp = Math.abs(d + zEp) * Math.tan(Math.asin(ap.value));
  }

  // Marginal ray: from the axial object point to the rim of the pupil.
  const mu0 = finite ? rEp / (d + zEp) : 0;
  const my0 = finite ? mu0 * d : rEp;
  const m = paraxialRay(system, n, my0, mu0);
  const stopRadius = Math.abs(m.y[stop]);
  if (!(stopRadius > 0)) return FAIL('The marginal ray does not reach the stop.');

  // Chief ray: from the edge of the field through the pupil centre. Its
  // slope scales with the largest field; a single on-axis field uses a unit
  // slope so that the exit pupil is still defined.
  const fieldMax = Math.max(...system.fields.values);
  let cu0;
  if (finite) cu0 = -(fieldMax || 1) / (d + zEp);
  else cu0 = Math.tan((fieldMax || 1) * Math.PI / 180);
  const ch = paraxialRay(system, n, -cu0 * zEp, cu0);
  if (!fieldMax) { ch.y.fill(0); ch.u.fill(0); }
  const unit = fieldMax ? ch : paraxialRay(system, n, -cu0 * zEp, cu0);

  const uLast = m.u[last];
  if (Math.abs(uLast) < 1e-15) return FAIL('The image is at infinity (afocal system): add the lens that would focus it.');
  const imageDistance = -m.y[last] / uLast;
  const telecentricImage = Math.abs(unit.u[last]) < 1e-15;
  const zXp = telecentricImage ? Infinity : -unit.y[last] / unit.u[last];
  const rXp = telecentricImage ? Infinity : Math.abs(m.y[last] + uLast * zXp);
  const workingFno = 1 / (2 * nImage * Math.abs(uLast));
  const imageHeight = ch.y[last] + ch.u[last] * imageDistance;
  const magnification = finite ? (n[0] * mu0) / (nImage * uLast) : 0;
  const lagrange = n[0] * (cu0 * my0 - mu0 * (-cu0 * zEp)) * (fieldMax ? 1 : 0);

  return {
    ok: true, wavelengthNm, n, stop,
    efl, bfl, power,
    zEp, rEp, zXp, rXp, stopRadius,
    imageDistance, imageHeight, magnification,
    fnoInfinite: Number.isFinite(efl) ? Math.abs(efl) / (2 * rEp) : Infinity,
    workingFno, naImage: nImage * Math.abs(uLast),
    naObject: finite ? Math.abs(mu0) : 0,
    lagrange,
    totalTrack: S.slice(0, last).reduce((sum, s) => sum + s.thickness, 0) + imageDistance,
    marginal: m, chief: ch, objectSlope: { marginal: mu0, chief: cu0 },
  };
}

// Seidel sums per surface (mm), from the marginal ray (y, u) and the chief
// ray (ȳ, ū) of firstOrder(). With A = n(u + yc) and Ā = n(ū + ȳc) before
// the surface, Δ(x) = x' − x across it and H the Lagrange invariant:
//
//   S_I   = −A² y Δ(u/n)          S_II = −A Ā y Δ(u/n)
//   S_III = −Ā² y Δ(u/n)          S_IV = −H² c Δ(1/n)
//   S_V   = −Ā³ y Δ(1/n²) + Ā ȳ c (2Ā y − A ȳ) Δ(1/n)
//
// (the form of S_V that stays finite where A = 0). A conic or A4 term adds
// b = k c³/8 + A4 to the sag's r⁴ coefficient and contributes
// δS_I = 8 b Δn y⁴, with δS_II, δS_III, δS_V scaled by successive powers of
// ȳ/y. An ideal (paraxial) lens contributes nothing. Chromatic sums use the
// index difference δn between the shortest and longest system wavelengths.
export function seidelSums(system, fo, shortNm = null, longNm = null) {
  const S = system.surfaces, n = fo.n;
  const { y, u } = fo.marginal, { y: yb, u: ub } = fo.chief;
  const H = fo.lagrange;
  const dn = shortNm != null && longNm != null && shortNm !== longNm
    ? (() => { const a = mediumIndices(system, shortNm), b = mediumIndices(system, longNm); return a.map((v, i) => v - b[i]); })()
    : null;
  const rows = [];
  let uPrev = fo.objectSlope.marginal, ubPrev = fo.objectSlope.chief;
  if (!Math.max(...system.fields.values)) ubPrev = 0;
  for (let j = 0; j < S.length; j++) {
    const s = S[j], n1 = n[j], n2 = n[j + 1];
    const row = { surface: j + 1, SI: 0, SII: 0, SIII: 0, SIV: 0, SV: 0, CL: 0, CT: 0 };
    if (s.type !== 'paraxial') {
      const c = s.radius ? 1 / s.radius : 0;
      const A = n1 * (uPrev + y[j] * c), Ab = n1 * (ubPrev + yb[j] * c);
      const dU = u[j] / n2 - uPrev / n1;
      const dInvN = 1 / n2 - 1 / n1, dInvN2 = 1 / (n2 * n2) - 1 / (n1 * n1);
      row.SI = -A * A * y[j] * dU;
      row.SII = -A * Ab * y[j] * dU;
      row.SIII = -Ab * Ab * y[j] * dU;
      row.SIV = -H * H * c * dInvN;
      row.SV = -Ab * Ab * Ab * y[j] * dInvN2 + Ab * yb[j] * c * (2 * Ab * y[j] - A * yb[j]) * dInvN;
      const b = s.conic * c * c * c / 8 + (s.asphere[0] || 0);
      if (b) {
        const e = 8 * b * (n2 - n1);
        row.SI += e * y[j] ** 4;
        row.SII += e * y[j] ** 3 * yb[j];
        row.SIII += e * y[j] ** 2 * yb[j] ** 2;
        row.SV += e * y[j] * yb[j] ** 3;
      }
      if (dn) {
        const dd = dn[j + 1] / n2 - dn[j] / n1;
        row.CL = A * y[j] * dd;
        row.CT = Ab * y[j] * dd;
      }
    }
    rows.push(row);
    uPrev = u[j]; ubPrev = ub[j];
  }
  const total = { surface: 'Σ' };
  for (const key of ['SI', 'SII', 'SIII', 'SIV', 'SV', 'CL', 'CT']) total[key] = rows.reduce((sum, r) => sum + r[key], 0);
  return { rows, total, chromatic: Boolean(dn) };
}

// Wavefront coefficients (mm) at the edge of the pupil and field.
export const seidelWavefront = t => ({
  W040: t.SI / 8, W131: t.SII / 2, W222: t.SIII / 2, W220: (t.SIII + t.SIV) / 4, W311: t.SV / 2,
});
