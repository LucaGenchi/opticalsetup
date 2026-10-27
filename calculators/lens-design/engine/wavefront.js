// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The wavefront of one field at one wavelength, as optical path differences
// on the exit-pupil reference sphere, the convention of OpticStudio and
// Optiland:
//
// - the reference sphere is centred on C, where the chief ray of the
//   primary wavelength meets the image plane, and passes through the axial
//   point of the paraxial exit pupil (radius R = |C − E|);
// - each ray's optical path is counted from a common wavefront in object
//   space (the object point, or for an object at infinity the plane through
//   the origin normal to the incoming direction) to where it crosses that
//   sphere, found by stepping back from the image plane;
// - OPD = (OPL of the chief ray − OPL of the ray) / λ, in waves, so the
//   chief ray of each wavelength has OPD 0.
//
// Centring every wavelength's sphere on the primary chief ray keeps lateral
// colour in the wavefront (as a tilt), where the polychromatic PSF needs it.
// A bundle is traced once to the last surface; the OPD for any other image
// plane (through focus) is then a straight-line step for every ray.

import { aim, launch, traceFrom } from './trace.js';

// Trace the rays named by normalized pupil points (parallel arrays px, py)
// for one field, keeping each ray's state after the last surface.
export function traceBundle(model, field, px, py, { clip = true } = {}) {
  const K = px.length;
  const valid = new Uint8Array(K);
  const P = new Float64Array(3 * K), D = new Float64Array(3 * K), opl = new Float64Array(K);
  const failed = {};
  const infinite = model.system.object.atInfinity;
  for (let k = 0; k < K; k++) {
    const a = aim(model, field, px[k], py[k]);
    let fail = null;
    if (!a.ok) fail = 'aim';
    else {
      const start = launch(model, field, a.e[0], a.e[1]);
      const t = traceFrom(model, start.P, start.D, { clip });
      if (!t.ok) fail = t.fail;
      else if (!(t.D[2] > 1e-12)) fail = 'image';
      else {
        valid[k] = 1;
        for (let i = 0; i < 3; i++) { P[3 * k + i] = t.P[i]; D[3 * k + i] = t.D[i]; }
        // From the common object-space wavefront: a plane wave's rays start
        // on the entrance-pupil plane, P·D ahead of the plane through the
        // origin normal to them.
        opl[k] = t.opl + (infinite ? start.P[0] * start.D[0] + start.P[1] * start.D[1] + start.P[2] * start.D[2] : 0);
      }
    }
    if (fail) failed[fail] = (failed[fail] ?? 0) + 1;
  }
  return { K, px, py, valid, P, D, opl, failed, nImage: model.n[model.n.length - 1], wavelengthNm: model.wavelengthNm };
}

// Where ray k of a bundle meets the plane z.
export function pointAt(bundle, k, z) {
  const i = 3 * k, s = (z - bundle.P[i + 2]) / bundle.D[i + 2];
  return [bundle.P[i] + s * bundle.D[i], bundle.P[i + 1] + s * bundle.D[i + 1], z, s];
}

// Where ray k crosses the reference sphere (centre C, radius R) for the
// image plane z: to the plane, then back along the ray to the sphere (the
// nearer crossing behind the image point, or the nearer one ahead of it
// when the image point lies outside the sphere). Returns the point and the
// optical path to it, or null when the ray misses the sphere.
export function sphereCrossing(bundle, k, z, C, R) {
  const i = 3 * k;
  const [x, y, , s] = pointAt(bundle, k, z);
  const L = -bundle.D[i], M = -bundle.D[i + 1], N = -bundle.D[i + 2];
  const dx = x - C[0], dy = y - C[1], dz = z - C[2];
  const b = 2 * (L * dx + M * dy + N * dz);
  const c = dx * dx + dy * dy + dz * dz - R * R;
  const disc = b * b - 4 * c;
  if (!(disc >= 0)) return null;
  let t = (-b - Math.sqrt(disc)) / 2;
  if (t < 0) t = (-b + Math.sqrt(disc)) / 2;
  return { point: [x + t * L, y + t * M, z + t * N], opl: bundle.opl[k] + bundle.nImage * (s - t) };
}

export function pathToSphere(bundle, k, z, C, R) {
  return sphereCrossing(bundle, k, z, C, R)?.opl ?? NaN;
}

// The reference sphere for image plane z: centred where the primary chief
// ray (a one-ray bundle) meets it, through the axial exit-pupil point zXp.
// Without a chief ray the centre falls back to the centroid of `fallback`.
export function referenceSphere(chief, z, zXp, fallback = null) {
  let C = null;
  if (chief && chief.valid[0]) C = pointAt(chief, 0, z).slice(0, 3);
  else if (fallback) {
    let sx = 0, sy = 0, count = 0;
    for (let k = 0; k < fallback.K; k++) {
      if (!fallback.valid[k]) continue;
      const p = pointAt(fallback, k, z);
      sx += p[0]; sy += p[1]; count++;
    }
    if (count) C = [sx / count, sy / count, z];
  }
  if (!C) return null;
  const R = Math.hypot(C[0], C[1], C[2] - zXp);
  return { C, R, fromChief: Boolean(chief && chief.valid[0]) };
}

// OPD in waves for every ray of a bundle (NaN where a ray fails), relative
// to the bundle's own chief ray, or to the mean path when that fails.
export function opdWaves(bundle, ownChief, z, sphere) {
  const lambdaMm = bundle.wavelengthNm * 1e-6;
  const out = new Float64Array(bundle.K).fill(NaN);
  let ref = ownChief && ownChief.valid[0] ? pathToSphere(ownChief, 0, z, sphere.C, sphere.R) : NaN;
  const paths = new Float64Array(bundle.K).fill(NaN);
  let sum = 0, count = 0;
  for (let k = 0; k < bundle.K; k++) {
    if (!bundle.valid[k]) continue;
    paths[k] = pathToSphere(bundle, k, z, sphere.C, sphere.R);
    if (Number.isFinite(paths[k])) { sum += paths[k]; count++; }
  }
  if (!Number.isFinite(ref)) ref = count ? sum / count : 0;
  for (let k = 0; k < bundle.K; k++) if (Number.isFinite(paths[k])) out[k] = (ref - paths[k]) / lambdaMm;
  return out;
}

// RMS and peak-to-valley of an OPD sample set, about its mean (piston
// removed) and about its best-fitting plane (piston and tilt removed).
export function wavefrontStats(px, py, w) {
  let n = 0, sw = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, swx = 0, swy = 0;
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < w.length; k++) {
    const v = w[k];
    if (!Number.isFinite(v)) continue;
    const x = px[k], y = py[k];
    n++; sw += v; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; swx += v * x; swy += v * y;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!n) return { count: 0, mean: NaN, rms: NaN, rmsTilt: NaN, pv: NaN, tiltX: NaN, tiltY: NaN };
  const mean = sw / n;
  // Plane a + b x + c y by least squares (normal equations, 3 × 3).
  const A = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]], rhs = [sw, swx, swy];
  const det3 = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d = det3(A);
  const solve = col => det3(A.map((row, i) => row.map((v, j) => (j === col ? rhs[i] : v)))) / d;
  const plane = Math.abs(d) > 1e-12 * n * n * n ? [solve(0), solve(1), solve(2)] : [mean, 0, 0];
  let s0 = 0, s1 = 0;
  for (let k = 0; k < w.length; k++) {
    const v = w[k];
    if (!Number.isFinite(v)) continue;
    s0 += (v - mean) ** 2;
    s1 += (v - plane[0] - plane[1] * px[k] - plane[2] * py[k]) ** 2;
  }
  return { count: n, mean, rms: Math.sqrt(s0 / n), rmsTilt: Math.sqrt(s1 / n), pv: hi - lo, tiltX: plane[1], tiltY: plane[2] };
}
