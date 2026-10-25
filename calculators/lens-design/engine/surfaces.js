// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Rotationally symmetric surfaces in 3D: sag, normal, ray intersection and
// refraction. A surface sits at its own vertex, axis z, and is the even
// asphere
//
//   z(ρ) = c ρ / (1 + √(1 − (1+k) c² ρ)) + A4 ρ² + A6 ρ³ + … + A16 ρ⁸,
//
// written in ρ = x² + y² so that nothing divides by the radial distance on
// the axis. The same convention as sketch/js/asphere.js (A4 multiplies r⁴).
//
// Conics (spheres included) are intersected in closed form; a surface with
// any polynomial term is solved by Newton iteration started from its conic,
// with a convergence check. A ray that cannot meet the surface is reported,
// never moved.

export const NEWTON_TOLERANCE_MM = 1e-12;
export const NEWTON_MAX_ITERATIONS = 40;

export function makeSurface({ radius = 0, conic = 0, asphere = [] } = {}) {
  const c = radius ? 1 / radius : 0;
  const a = asphere.map(v => Number(v) || 0);
  while (a.length && a[a.length - 1] === 0) a.pop();
  return { c, k: conic, a, hasAsphere: a.length > 0 };
}

// Largest ρ a conic is defined at (Infinity for paraboloids, hyperboloids
// and planes).
export function conicDomain(surf) {
  const q = (1 + surf.k) * surf.c * surf.c;
  return q > 0 ? 1 / q : Infinity;
}

export function sag(surf, rho) {
  const { c, k, a } = surf;
  let z = 0;
  if (c) {
    const disc = 1 - (1 + k) * c * c * rho;
    if (disc < 0) return NaN;
    z = c * rho / (1 + Math.sqrt(disc));
  }
  let p = rho;
  for (let i = 0; i < a.length; i++) { p *= rho; z += a[i] * p; }
  return z;
}

// dz/dρ. For the conic part this is c / (2√(1 − (1+k)c²ρ)), finite on axis.
export function sagSlopeRho(surf, rho) {
  const { c, k, a } = surf;
  let d = 0;
  if (c) {
    const disc = 1 - (1 + k) * c * c * rho;
    if (disc <= 0) return NaN;
    d = c / (2 * Math.sqrt(disc));
  }
  let p = 1;
  for (let i = 0; i < a.length; i++) { p *= rho; d += (i + 2) * a[i] * p; }
  return d;
}

// Unit normal at (x, y) on the surface, pointing toward +z.
export function normalAt(surf, x, y) {
  const g = sagSlopeRho(surf, x * x + y * y);
  const nx = -2 * x * g, ny = -2 * y * g;
  const len = Math.sqrt(nx * nx + ny * ny + 1);
  return [nx / len, ny / len, 1 / len];
}

// Distance t along the ray P + tD (P relative to the vertex) to the surface,
// or { fail } when there is none. `minT` rejects intersections behind the
// ray; the first surface of a system passes -Infinity because its rays start
// on the entrance-pupil plane, which may lie behind it.
export function intersect(surf, P, D, minT = -1e-9) {
  const [px, py, pz] = P, [dx, dy, dz] = D;
  const { c, k } = surf;
  let t;
  if (!c) {
    if (Math.abs(dz) < 1e-15) return { fail: 'miss' };
    t = -pz / dz;
  } else {
    // c(x² + y² + (1+k) z²) − 2z = 0 along the ray: A t² + 2B t + C = 0.
    const A = c * (dx * dx + dy * dy + (1 + k) * dz * dz);
    const B = c * (px * dx + py * dy + (1 + k) * pz * dz) - dz;
    const C = c * (px * px + py * py + (1 + k) * pz * pz) - 2 * pz;
    const disc = B * B - A * C;
    if (disc < 0) return { fail: 'miss' };
    // The root that tends to the vertex plane as c → 0: the surface's own
    // sheet, not the far side of the sphere or the other nappe.
    const denom = -B + (B <= 0 ? 1 : -1) * Math.sqrt(disc);
    if (denom === 0) return { fail: 'miss' };
    t = C / denom;
  }
  if (!surf.hasAsphere) {
    const x = px + t * dx, y = py + t * dy, rho = x * x + y * y;
    if (rho > conicDomain(surf) * (1 + 1e-12)) return { fail: 'miss' };
    const z = pz + t * dz;
    // The stable root can still land on the wrong sheet of a closed conic for
    // a steep ray; the sag check catches it.
    const s = sag(surf, rho);
    if (!(Math.abs(z - s) <= 1e-7 * Math.max(1, Math.abs(z)))) return { fail: 'miss' };
    return t >= minT ? { t } : { fail: 'behind' };
  }
  // Newton on f(t) = z(t) − sag(ρ(t)), from the conic (or plane) solution.
  if (!Number.isFinite(t)) t = Math.abs(dz) > 1e-15 ? -pz / dz : 0;
  for (let i = 0; i < NEWTON_MAX_ITERATIONS; i++) {
    const x = px + t * dx, y = py + t * dy, rho = x * x + y * y;
    const s = sag(surf, rho), g = sagSlopeRho(surf, rho);
    if (!Number.isFinite(s) || !Number.isFinite(g)) return { fail: 'miss' };
    const f = pz + t * dz - s;
    const df = dz - g * 2 * (x * dx + y * dy);
    if (Math.abs(df) < 1e-14) return { fail: 'no-convergence' };
    const step = f / df;
    t -= step;
    if (Math.abs(step) < NEWTON_TOLERANCE_MM) return t >= minT ? { t } : { fail: 'behind' };
  }
  return { fail: 'no-convergence' };
}

// Vector Snell's law. N is the unit normal on the +z side, D the unit
// direction; returns the refracted unit direction, or null for total internal
// reflection.
export function refract(D, N, n1, n2) {
  if (n1 === n2) return D;
  let cosI = D[0] * N[0] + D[1] * N[1] + D[2] * N[2];
  let nx = N[0], ny = N[1], nz = N[2];
  if (cosI < 0) { cosI = -cosI; nx = -nx; ny = -ny; nz = -nz; }
  const mu = n1 / n2;
  const sin2T = mu * mu * (1 - cosI * cosI);
  if (sin2T > 1) return null;
  const g = Math.sqrt(1 - sin2T) - mu * cosI;
  return [mu * D[0] + g * nx, mu * D[1] + g * ny, mu * D[2] + g * nz];
}
