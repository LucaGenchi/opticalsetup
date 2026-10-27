// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Real (skew) ray tracing through a sequential, rotationally symmetric
// system, in global coordinates: surface 1's vertex at z = 0, each later
// vertex one thickness further on. A ray is named by its field and its
// normalized entrance-pupil coordinates (px, py), |p| ≤ 1:
//
// - object at infinity: a plane-wave ray, direction (0, sin θ, cos θ), that
//   crosses the paraxial entrance-pupil plane at (px, py)·r_EP;
// - finite object: the ray from the object point (0, h, −d) to that point.
//
// A positive field angle points rays toward +y (the OpticStudio and Optiland
// convention, so a positive lens forms its image at +y); a positive object
// height sits at +y. With "real" ray aiming, (px, py) instead name the point
// (px, py)·r_stop on the stop, found by Newton iteration from the paraxial
// aim. A ray that misses a surface, is totally internally reflected, is
// clipped by a set clear semi-diameter or by the stop's own radius (a
// paraxially aimed ray can pass outside it, because the real pupil is not
// the paraxial one), or would have to travel backward
// (surfaces crossing at that height) stops there and says so.
//
// Each trace also adds up the optical path length n·t from its start, for
// the wavefront (wavefront.js). An ideal lens has no thickness to add, so it
// contributes the path that makes it stigmatic: every ray from a point O at
// the lens's paraxial object distance a meets at O's ideal image I, and the
// path O → Q → I through any lens point Q is made equal to the straight
// path O → vertex → I (see idealLensPath).

import { makeSurface, intersect, normalAt, refract } from './surfaces.js';
import { mediumIndices } from './paraxial.js';

export const FAILURES = {
  miss: 'missed a surface',
  behind: 'met surfaces that cross at its height',
  'no-convergence': 'asphere intersection did not converge',
  tir: 'total internal reflection',
  clipped: 'clipped by a clear aperture',
  stop: 'passed outside the aperture stop',
  aim: 'real ray aiming did not converge',
  image: 'did not reach the image plane',
};

// Everything a trace needs at one wavelength.
export function traceModel(system, wavelengthNm, fo) {
  const n = mediumIndices(system, wavelengthNm);
  let z = 0;
  const surfaces = system.surfaces.map((s, j) => {
    const entry = {
      z, type: s.type, focal: s.focal, geom: makeSurface(s),
      clip: s.semiDiameter > 0 && !s.stop ? s.semiDiameter : 0,
      stopClip: s.stop ? fo.stopRadius : 0,
      n1: n[j], n2: n[j + 1],
      conjugate: s.type === 'paraxial' ? paraxialConjugate(fo, j) : null,
    };
    z += s.thickness;
    return entry;
  });
  return { system, wavelengthNm, n, surfaces, fo, stop: fo.stop, zLast: surfaces[surfaces.length - 1].z };
}

const unit = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

// The ideal lens at surface j works between the conjugates of the primary
// wavelength's paraxial marginal ray: the object at a distance a in front of
// it (negative: a virtual object behind it; infinite: a collimated beam).
function paraxialConjugate(fo, j) {
  const uIn = j === 0 ? fo.objectSlope.marginal : fo.marginal.u[j - 1];
  const y = fo.marginal.y[j];
  return Math.abs(uIn) < 1e-15 * Math.max(1, Math.abs(y)) ? Infinity : y / uIn;
}

const sign = v => (v < 0 ? -1 : 1);

// Optical path an ideal lens of focal length f adds to the ray that meets it
// at Q = (x, y) (relative to its vertex) with unit direction d before it and
// dOut after it. The ray is taken to come from the point O where it crosses
// the object plane z = −a, imaged to I = (m O_x, m O_y, b), with
// 1/b = 1/f − 1/a and m = −b/a; the ray through the vertex is undeviated, so
//
//   φ = σ_a (|O| − |Q − O|) + σ_b (|I| − |I − Q|),
//
// with σ = −1 for a virtual point (light does not travel that leg). A
// collimated input (a infinite) gives σ_a(|O| − |Q − O|) → −Q·d; a
// collimated output (a = f) gives σ_b(|I| − |I − Q|) → Q·dOut. A lens
// sitting exactly at its own object (a = 0) is given the thin-lens
// quadratic phase −r²/2f.
export function idealLensPath(f, a, x, y, d, dOut) {
  if (Math.abs(a) < 1e-12 * Math.max(1, Math.abs(f))) return -(x * x + y * y) / (2 * f);
  let front, O;
  if (!Number.isFinite(a)) {
    front = -(x * d[0] + y * d[1]);
    O = null;
  } else {
    const s = a / d[2];
    O = [x - s * d[0], y - s * d[1], -a];
    front = sign(a) * (Math.hypot(...O) - Math.abs(s));
  }
  const inv = 1 / f - (O ? 1 / a : 0);
  if (Math.abs(inv) < 1e-15 / Math.max(1, Math.abs(f))) return front + x * dOut[0] + y * dOut[1];
  const b = 1 / inv;
  // The image of O, or for a collimated input the focal-plane point that
  // direction d is focused to.
  const I = O ? [-b / a * O[0], -b / a * O[1], b] : [f * d[0] / d[2], f * d[1] / d[2], f];
  return front + sign(b) * (Math.hypot(...I) - Math.hypot(I[0] - x, I[1] - y, I[2]));
}

// Starting point and direction for an aim point (ex, ey) on the entrance-
// pupil plane.
export function launch(model, fieldValue, ex, ey) {
  const { system, fo } = model;
  const P = [ex, ey, fo.zEp];
  if (system.object.atInfinity) {
    const th = fieldValue * Math.PI / 180;
    return { P, D: [0, Math.sin(th), Math.cos(th)] };
  }
  const O = [0, fieldValue, -system.object.distanceMm];
  return { P: O, D: unit([P[0] - O[0], P[1] - O[1], P[2] - O[2]]) };
}

// Trace from (P, D) through surfaces [0, until), recording the path when
// asked and, in `extent`, the largest squared height met on each surface.
// Returns the state after the last surface traced. `clip: false` lets a ray
// through every aperture, the stop included: real aiming's trial rays need
// that while they search, and so does a comparison with a program that does
// not clip at the stop.
export function traceFrom(model, P, D, { until = model.surfaces.length, path = false, extent = null, clip = true } = {}) {
  let p = P.slice(), d = D.slice(), opl = 0;
  const points = path ? [p.slice()] : null;
  for (let j = 0; j < until; j++) {
    const s = model.surfaces[j];
    const local = [p[0], p[1], p[2] - s.z];
    let hit;
    if (s.type === 'paraxial') hit = Math.abs(d[2]) > 1e-15 ? { t: -local[2] / d[2] } : { fail: 'miss' };
    else hit = intersect(s.geom, local, d, j === 0 ? -Infinity : -1e-9);
    if (hit.fail) return { ok: false, fail: hit.fail, surface: j, points };
    p = [p[0] + hit.t * d[0], p[1] + hit.t * d[1], p[2] + hit.t * d[2]];
    opl += s.n1 * hit.t;
    if (points) points.push(p.slice());
    if (extent) extent[j] = Math.max(extent[j], p[0] * p[0] + p[1] * p[1]);
    if (clip && s.clip && p[0] * p[0] + p[1] * p[1] > s.clip * s.clip * (1 + 1e-12)) {
      return { ok: false, fail: 'clipped', surface: j, points };
    }
    // The margin covers real aiming's own 1e-9 tolerance at the rim.
    if (clip && s.stopClip && Math.hypot(p[0], p[1]) > s.stopClip * (1 + 1e-7)) {
      return { ok: false, fail: 'stop', surface: j, points };
    }
    if (s.type === 'paraxial') {
      // An ideal thin lens: direction tangents change by −(x, y)/f, which
      // images every object plane perfectly onto its conjugate.
      const tx = d[0] / d[2] - p[0] / s.focal, ty = d[1] / d[2] - p[1] / s.focal;
      const out = unit([tx, ty, 1]);
      opl += idealLensPath(s.focal, s.conjugate, p[0], p[1], d, out);
      d = out;
    } else {
      const N = normalAt(s.geom, p[0], p[1]);
      const r = refract(d, N, s.n1, s.n2);
      if (!r) return { ok: false, fail: 'tir', surface: j, points };
      d = r;
    }
  }
  return { ok: true, P: p, D: d, opl, points };
}

// Aim point on the entrance-pupil plane for normalized pupil coordinates.
export function aim(model, fieldValue, px, py, mode = model.system.rayAiming) {
  const { fo } = model;
  const guess = [px * fo.rEp, py * fo.rEp];
  if (mode !== 'real') return { ok: true, e: guess };
  const target = [px * fo.stopRadius, py * fo.stopRadius];
  const stopAt = r => {
    const { P, D } = launch(model, fieldValue, r[0], r[1]);
    const t = traceFrom(model, P, D, { until: model.stop + 1, clip: false });
    return t.ok ? [t.P[0] - target[0], t.P[1] - target[1]] : null;
  };
  let e = guess;
  const h = 1e-6 * Math.max(1, fo.rEp);
  for (let i = 0; i < 30; i++) {
    const f = stopAt(e);
    if (!f) return { ok: false };
    if (Math.hypot(f[0], f[1]) < 1e-9 * Math.max(1, fo.stopRadius)) return { ok: true, e };
    const fx = stopAt([e[0] + h, e[1]]), fy = stopAt([e[0], e[1] + h]);
    if (!fx || !fy) return { ok: false };
    const a = (fx[0] - f[0]) / h, b = (fy[0] - f[0]) / h, c = (fx[1] - f[1]) / h, d = (fy[1] - f[1]) / h;
    const det = a * d - b * c;
    if (Math.abs(det) < 1e-14) return { ok: false };
    e = [e[0] - (d * f[0] - b * f[1]) / det, e[1] - (-c * f[0] + a * f[1]) / det];
  }
  return { ok: false };
}

// One named ray, all the way to the plane z = zImage (global).
export function traceRay(model, fieldValue, px, py, zImage, { path = false, extent = null, clip = true } = {}) {
  const a = aim(model, fieldValue, px, py);
  if (!a.ok) return { ok: false, fail: 'aim', surface: model.stop, points: null };
  const { P, D } = launch(model, fieldValue, a.e[0], a.e[1]);
  const t = traceFrom(model, P, D, { path, extent, clip });
  if (!t.ok) return t;
  if (!(t.D[2] > 1e-12)) return { ok: false, fail: 'image', surface: model.surfaces.length, points: t.points };
  const s = (zImage - t.P[2]) / t.D[2];
  const img = [t.P[0] + s * t.D[0], t.P[1] + s * t.D[1], zImage];
  if (t.points) t.points.push(img);
  const nImage = model.n[model.n.length - 1];
  return { ok: true, x: img[0], y: img[1], last: t.P, D: t.D, opl: t.opl + nImage * s, points: t.points };
}
