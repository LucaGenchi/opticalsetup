// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The imaging chain an Object's "Draw image formed" follows: every lens its
// axis crosses, in order, each reduced to a paraxial step. An ideal thin lens
// (a `lens` or `metalens` surface, which is also how an objective is traced)
// is one plane of focal length f. A real optic traced as glass (a thick lens,
// an asphere, a lens group) is its pair of principal planes H and H′ with its
// focal length, from the paraxial matrix of its faces: a ray meets H, leaves
// H′ at the same height, and bends there as at a thin lens. Those are the
// same cardinal points the inspector reports for the optic.
//
// The construction is the same for any point: trace two rays from it through
// the steps and intersect what comes out. Everything here is the paraxial
// model: the real
// glass the tracer follows adds aberrations that a drawn ray fan shows and
// this construction leaves out.

import { toWorld, rotPt, dot, sub, add, mul, norm, perp } from './util.js';

// The thin-lens bend the tracer applies at a lens surface (its lensBend):
// tangent-space u′ = u − h/f, with h measured from the segment's midpoint.
function lensBend(dir, hitP, s, f) {
  const t = norm(sub(s.b, s.a));
  const n = perp(t);
  const sgn = dot(dir, n) >= 0 ? 1 : -1;
  const np = mul(n, sgn);
  const h = dot(sub(hitP, mul(add(s.a, s.b), 0.5)), t);
  const denom = dot(dir, np);
  if (Math.abs(denom) < 1e-6 || !f) return dir;
  const u = dot(dir, t) / denom;
  const u2 = u - h / f;
  return norm(add(np, mul(t, u2)));
}

// Distance along o + t·d to the segment a–b (within it), or Infinity.
function axisHit(o, d, s) {
  const e = sub(s.b, s.a);
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-9) return Infinity;
  const dp = sub(s.a, o);
  const t = (dp.x * e.y - dp.y * e.x) / den;
  const q = (dp.x * d.y - dp.y * d.x) / den;
  return q >= 0 && q <= 1 ? t : Infinity;
}

// Paraxial cardinal points of a run of refracting faces, along the direction
// light crosses them. `faces` are { s, R, n } in crossing order: s the vertex
// position along that direction, R the radius (positive when the centre of
// curvature lies further along), n the index after the face. Light starts
// and ends in air. Returns the focal length and where H and H′ lie (as s),
// the first and last vertex, and the run's paraxial matrix { A, B, C, D }
// from the first vertex to the last (height and angle in air). An afocal run
// (C = 0: a plane-parallel plate, a telescope) has no focal length or
// principal planes: it says `afocal` and carries only the matrix. Null for
// no faces.
// Below this power (1/mm), a run is treated as afocal: its focal length would
// be beyond a thousand kilometres and its principal planes as far off.
const AFOCAL_POWER = 1e-9;

export function paraxialCardinals(faces) {
  if (!faces.length) return null;
  const trace = (y, omega) => {
    let n = 1;
    for (let i = 0; i < faces.length; i++) {
      const face = faces[i];
      if (face.R) omega -= y * (face.n - n) / face.R;
      n = face.n;
      if (i < faces.length - 1) y += (faces[i + 1].s - face.s) * omega / n;
    }
    return { y, omega };
  };
  const r1 = trace(1, 0), r2 = trace(0, 1);
  const A = r1.y, B = r2.y, C = r1.omega, D = r2.omega;
  const first = faces[0].s, last = faces.at(-1).s;
  if (![A, B, C, D].every(Number.isFinite)) return null;
  if (!(Math.abs(C) > AFOCAL_POWER)) return { afocal: true, f: Infinity, A, B, C: 0, D, first, last };
  return { f: -1 / C, h1: first - (1 - D) / C, h2: last + (1 - A) / C, first, last, A, B, C, D };
}

// The faces of an optic in the order light going along `dir` (world) meets
// them, from the optic's own forward description ({ x, R, n } along its
// local +x, n the index after each face).
function facesAlong(el, local, dir) {
  const forward = dot(dir, rotPt(1, 0, el.rot || 0)) >= 0;
  if (forward) return { sign: 1, faces: local.map(f => ({ s: f.x, R: f.R, n: f.n })) };
  const faces = [];
  for (let i = local.length - 1; i >= 0; i--) {
    faces.push({ s: -local[i].x, R: local[i].R ? -local[i].R : 0, n: i > 0 ? local[i - 1].n : 1 });
  }
  return { sign: -1, faces };
}

const HALF_PLANE = 50;
// A plane through world point c along the optic's local y, as a segment.
function planeAt(el, localX) {
  const c = toWorld(el, localX, 0), t = rotPt(0, 1, el.rot || 0);
  return { a: add(c, mul(t, -HALF_PLANE)), b: add(c, mul(t, HALF_PLANE)), c };
}

// Every lens the Object's axis crosses beyond 1 mm, in order, as paraxial
// steps { t, f, H, H2, exit, el }. `thinFocal(s)` gives a thin surface's
// focal length at the Object's wavelength; a real optic describes its faces
// with its registry entry's `paraxialFaces(el, wavelength)`. A real optic
// with no power (a plate, a telescope group) is an afocal step: H and H2 are
// then its first and last vertex planes, and `matrix` carries a ray from one
// to the other. Null when a thin lens on the axis has no focal length, or an
// optic cannot describe its faces: no image is drawn then, as before.
export function objectImagingSteps(el, surfaces, { registry, thinFocal, wavelength }) {
  const u = rotPt(1, 0, el.rot || 0);
  const p0 = { x: el.x, y: el.y };
  const steps = [];
  const real = new Map();
  for (const s of surfaces || []) {
    if (s.kind === 'lens' || s.kind === 'metalens') {
      // The same crossing test the image construction always used.
      const e = sub(s.b, s.a);
      const den = u.x * e.y - u.y * e.x;
      if (Math.abs(den) < 1e-9) continue;
      const dp = sub(s.a, p0);
      const t = (dp.x * e.y - dp.y * e.x) / den;
      const q = (dp.x * u.y - dp.y * u.x) / den;
      if (t > 1 && q >= 0 && q <= 1) {
        const f = thinFocal(s);
        steps.push({ t, f, H: s, H2: s, exit: add(p0, mul(u, t)), el: s.el, thin: true, half: Math.hypot(e.x, e.y) / 2 });
      }
      continue;
    }
    const owner = s.el;
    if (!owner || owner === el || typeof registry[owner.type]?.paraxialFaces !== 'function') continue;
    const t = axisHit(p0, u, s);
    // A missed face is Infinity: beyond 1 mm, but not on the axis.
    if (!(t > 1 && Number.isFinite(t))) continue;
    if (!real.has(owner) || t < real.get(owner)) real.set(owner, t);
  }
  for (const [owner, t] of real) {
    const local = registry[owner.type].paraxialFaces(owner, wavelength);
    const { sign, faces } = facesAlong(owner, local || [], u);
    const card = paraxialCardinals(faces);
    if (!card) return null;
    // The glass's half-height about its own axis, from its traced surfaces.
    const centre = toWorld(owner, 0, 0), across = rotPt(0, 1, owner.rot || 0);
    let half = 0;
    for (const s of surfaces) {
      if (s.el !== owner) continue;
      for (const pt of [s.a, s.b]) half = Math.max(half, Math.abs(dot(sub(pt, centre), across)));
    }
    if (card.afocal) {
      steps.push({
        t, f: Infinity, matrix: { A: card.A, B: card.B, D: card.D },
        H: planeAt(owner, sign * card.first), H2: planeAt(owner, sign * card.last),
        exit: toWorld(owner, sign * card.last, 0), el: owner, thin: false, half,
      });
      continue;
    }
    if (!Number.isFinite(card.f)) return null;
    steps.push({
      t, f: card.f, H: planeAt(owner, sign * card.h1), H2: planeAt(owner, sign * card.h2),
      exit: toWorld(owner, sign * card.last, 0), el: owner, thin: false, half,
    });
  }
  steps.sort((a, b) => a.t - b.t);
  if (steps.some(step => !step.f)) return null;
  return steps;
}

// Carries rays { p, d } through the first `upTo` steps, in place.
function throughSteps(rays, steps, upTo = steps.length) {
  for (let k = 0; k < upTo; k++) {
    const step = steps[k];
    for (const r of rays) {
      const e = sub(step.H.b, step.H.a);
      const den = r.d.x * e.y - r.d.y * e.x;
      if (Math.abs(den) < 1e-9) continue;
      const dp = sub(step.H.a, r.p);
      const t = (dp.x * e.y - dp.y * e.x) / den;
      const hitP = add(r.p, mul(r.d, t));
      if (step.matrix) {
        // An afocal optic: height and slope at its first vertex plane to
        // height and slope at its last, both measured along the plane and
        // against its normal the way the light crosses it.
        const tH = norm(e);
        const n = perp(tH), np = mul(n, dot(r.d, n) >= 0 ? 1 : -1);
        const denom = dot(r.d, np);
        if (Math.abs(denom) < 1e-6) continue;
        const h = dot(sub(hitP, mul(add(step.H.a, step.H.b), 0.5)), tH);
        const slope = dot(r.d, tH) / denom;
        const { A, B, D } = step.matrix;
        r.p = add(mul(add(step.H2.a, step.H2.b), 0.5), mul(tH, A * h + B * slope));
        r.d = norm(add(np, mul(tH, D * slope)));
        continue;
      }
      if (step.H2 === step.H) {
        r.p = hitP;
      } else {
        // Leave H′ at the height it met H.
        const tH = norm(e), tH2 = norm(sub(step.H2.b, step.H2.a));
        const h = dot(sub(hitP, mul(add(step.H.a, step.H.b), 0.5)), tH);
        r.p = add(mul(add(step.H2.a, step.H2.b), 0.5), mul(tH2, h));
      }
      r.d = lensBend(r.d, r.p, step.H2, step.f);
    }
  }
  return rays;
}

function meet(rA, rB) {
  const den2 = rA.d.x * rB.d.y - rA.d.y * rB.d.x;
  if (Math.abs(den2) < 1e-9) return null; // image at infinity
  const dp2 = sub(rB.p, rA.p);
  const tA = (dp2.x * rB.d.y - dp2.y * rB.d.x) / den2;
  const pt = add(rA.p, mul(rA.d, tA));
  return Number.isFinite(pt.x) && Number.isFinite(pt.y) ? pt : null;
}

// The image of point P after the first `upTo` steps: two rays from P, along
// the axis u and along u + v (never parallel to it), intersected.
export function imageOfPoint(P, steps, u, v, upTo = steps.length) {
  const [rA, rB] = throughSteps([{ p: P, d: u }, { p: P, d: norm(add(u, v)) }], steps, upTo);
  return meet(rA, rB);
}

// ---------------------------------------------------------------------------
// Principal rays: the three textbook construction rays from the Object's tip,
// drawn lens by lens. Each lens gets its own three rays, from its own object
// point (the image the optics before it form) to its own image:
//   - parallel to the lens's axis, then through its back focal point;
//   - through the centre (of H, leaving from the centre of H′), undeviated;
//   - through its front focal point, then parallel to the axis.
// An object point at infinity (the lens before made a collimated beam) has no
// ray parallel to the axis; an image at infinity has no ray leaving parallel.
// Each ray is a straight line on either side of the lens, and every line is
// fixed by the object point and the image point the chain already computes,
// so the three rays of one lens meet exactly at its drawn image.
//
// The rays are drawn, not traced: they do not interact with anything in the
// scene. A plate or telescope group (an afocal step) between lenses carries
// them, through its paraxial matrix. A dashed line is drawn only for a
// virtual image: back to an image behind the lens, or on from the next lens
// to an image the lens would have formed beyond it. A ray that meets a thin
// lens's plane outside the lens gets the plane drawn on to it (as textbooks
// do), and a thick lens, asphere or lens group gets its principal planes
// drawn, since that is where the construction bends its rays.

function frameOf(plane, u) {
  const mid = mul(add(plane.a, plane.b), 0.5), t = norm(sub(plane.b, plane.a));
  const n = perp(t);
  return { mid, t, np: dot(n, u) >= 0 ? n : mul(n, -1) };
}

// Where the line o + s·d meets the (infinite) line of `plane`, or null.
function linePlane(o, d, plane) {
  const e = sub(plane.b, plane.a);
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-12) return null;
  const dp = sub(plane.a, o);
  const s = (dp.x * e.y - dp.y * e.x) / den;
  return add(o, mul(d, s));
}

const heightOn = (P, F) => dot(sub(P, F.mid), F.t);
const pointOn = (h, F) => add(F.mid, mul(F.t, h));
const ahead = (from, to, d) => dot(sub(to, from), d);
const finitePt = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);

// A direction from a to b turned to run with the light (along F.np), or null
// when the two points coincide or the line runs along the plane.
function forward(d, F) {
  if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return null;
  const c = dot(d, F.np);
  if (Math.abs(c) < 1e-6) return null;
  return c > 0 ? d : mul(d, -1);
}
function towards(a, b, F) {
  const e = sub(b, a), l = Math.hypot(e.x, e.y);
  return l > 1e-9 ? forward(mul(e, 1 / l), F) : null;
}

// Height and slope at an afocal step's first plane from those at its last
// (the inverse of its matrix), and the forward map.
function afocalBack(step, X2, d, u) {
  const F1 = frameOf(step.H, u), F2 = frameOf(step.H2, u);
  const c = dot(d, F2.np);
  const { A, B, D } = step.matrix;
  if (Math.abs(c) < 1e-6 || !A || !D) return null;
  const s1 = dot(d, F2.t) / c / D;
  const h1 = (heightOn(X2, F2) - B * s1) / A;
  return { p: pointOn(h1, F1), d: norm(add(F1.np, mul(F1.t, s1))) };
}
function afocalForward(step, X1, d, u) {
  const F1 = frameOf(step.H, u), F2 = frameOf(step.H2, u);
  const c = dot(d, F1.np);
  if (Math.abs(c) < 1e-6) return null;
  const { A, B, D } = step.matrix;
  const s1 = dot(d, F1.t) / c;
  return { p: pointOn(A * heightOn(X1, F1) + B * s1, F2), d: norm(add(F2.np, mul(F2.t, D * s1))) };
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// Shortens a polyline so that no segment is longer than `maxLen`, stopping
// at the first one that was, so a ray to a far-off image stays drawable.
function capped(pts, maxLen) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = out.at(-1), e = sub(pts[i], a), l = Math.hypot(e.x, e.y);
    if (l > maxLen) { out.push(add(a, mul(e, maxLen / l))); break; }
    out.push(pts[i]);
  }
  return out;
}

// The principal rays of the chain `steps` for the point `tip` (an Object's
// tip), with u the Object's axis and v its up direction. Returns
// { rays: [{ pts, dashed, lens }], planes: [{ pts }] }: solid and dashed ray
// pieces (lens = which lens of the chain they belong to, from 0), and the
// lens-plane extensions. Empty when the chain has no lens with power.
export function principalRays(steps, tip, u, v, { maxLen = 6000 } = {}) {
  const out = { rays: [], planes: [] };
  if (!steps?.length || !finitePt(tip)) return out;
  const N = steps.length;
  // The tip's image in each space: space j lies after step j − 1.
  const imgs = [tip];
  for (let j = 1; j <= N; j++) {
    const p = imageOfPoint(tip, steps, u, v, j);
    imgs.push(finitePt(p) ? p : null);
  }
  // The direction of a ray from the tip in space j (all are parallel there
  // when the image in that space is at infinity).
  const dirIn = j => throughSteps([{ p: tip, d: u }], steps, j)[0].d;
  const lenses = steps.flatMap((s, i) => (s.matrix ? [] : [i]));
  // Where rays cross each lens's planes (by step index), for the extensions.
  const hitsOf = new Map(lenses.map(k => [k, []]));
  lenses.forEach((k, li) => {
    const p = li > 0 ? lenses[li - 1] : -1;
    const m = li < lenses.length - 1 ? lenses[li + 1] : -1;
    const step = steps[k];
    const F1 = frameOf(step.H, u), F2 = frameOf(step.H2, u);
    const O = imgs[k], I = imgs[k + 1];
    const dIn = O ? null : forward(dirIn(k), F1);
    const dOut = I ? null : forward(dirIn(k + 1), F2);
    const candidates = [];
    if (O) {
      const h = heightOn(O, F1);
      candidates.push({ h, din: F1.np, dout: I ? towards(pointOn(h, F2), I, F2) : dOut });
    }
    candidates.push({ h: 0, din: O ? towards(O, F1.mid, F1) : dIn, dout: I ? towards(F2.mid, I, F2) : dOut });
    if (I) {
      const h = heightOn(I, F2);
      candidates.push({ h, din: O ? towards(O, pointOn(h, F1), F1) : dIn, dout: F2.np });
    }
    for (const ray of candidates) {
      if (!ray.din || !ray.dout || !Number.isFinite(ray.h)) continue;
      const hit1 = pointOn(ray.h, F1), hit2 = pointOn(ray.h, F2);

      // Back from the lens to where this lens's light starts: through any
      // afocal steps after the lens before, to the image that lens formed
      // when it lies between them, else to the lens before.
      const back = [hit1];
      let cur = hit1, d = ray.din, ok = true;
      for (let a = k - 1; a > p; a--) {
        const X2 = linePlane(cur, d, steps[a].H2);
        const prev = X2 && afocalBack(steps[a], X2, d, u);
        if (!prev) { ok = false; break; }
        back.push(X2, prev.p);
        cur = prev.p; d = prev.d;
      }
      if (!ok) continue;
      const Q = imgs[p + 1];
      if (p < 0) back.push(Q);
      else {
        const B = linePlane(cur, d, steps[p].H2);
        if (Q && ahead(Q, cur, d) > 0 && (!B || ahead(B, Q, d) >= 0)) back.push(Q);
        else if (!B) continue;
        // No real image to start from (a virtual object, or one at
        // infinity): the rays are aimed at this lens, so they arrive over
        // the second half of the gap rather than out of the lens before,
        // where they could cross its plane far from the glass. Through a
        // plate they start on the lens before.
        else back.push(back.length > 1 ? B : add(cur, mul(sub(B, cur), 0.5)));
      }
      const pts = back.reverse();
      if (step.H2 !== step.H) pts.push(hit2);

      // On from the lens: through any afocal steps, to this lens's image
      // where it forms before the next lens, else to the next lens.
      const dashed = [];
      let endH = null;
      cur = hit2; d = ray.dout;
      const last = m < 0 ? N : m;
      for (let j = k + 1; j <= last; j++) {
        const R = imgs[j];
        const next = j < N ? linePlane(cur, d, steps[j].H) : null;
        const reaches = R && ahead(cur, R, d) > 0 && (!next || ahead(R, next, d) >= 0);
        if (reaches && m < 0) {
          // The last lens's image: the rays cross there and go on a little.
          const dist = Math.hypot(R.x - cur.x, R.y - cur.y);
          pts.push(R, add(R, mul(d, clamp(0.3 * dist, 15, 120))));
          break;
        }
        if (j === N) {
          // The last lens with its image out of reach: out and back (dashed)
          // to a virtual image, or straight on to one at infinity.
          const dist = R ? Math.hypot(R.x - cur.x, R.y - cur.y) : 2 * Math.abs(step.f);
          pts.push(add(cur, mul(d, clamp(dist, 80, 400))));
          if (R) dashed.push([cur, R]);
          break;
        }
        if (reaches) { pts.push(R); break; }
        if (j === m) {
          if (!next) { ok = false; break; }
          pts.push(next);
          endH = heightOn(next, frameOf(steps[m].H, u));
          if (R && ahead(next, R, d) > 0) dashed.push([next, R]);
          else if (R && ahead(R, cur, d) > 0) dashed.push([cur, R]);
          break;
        }
        // An afocal step ahead: carry the ray through it.
        if (!next) { ok = false; break; }
        const after = afocalForward(steps[j], next, d, u);
        if (!after) { ok = false; break; }
        pts.push(next, after.p);
        cur = after.p; d = after.d;
      }
      if (!ok || !pts.every(finitePt)) continue;
      out.rays.push({ pts: capped(pts, maxLen), dashed: false, lens: li });
      for (const seg of dashed) {
        if (seg.every(finitePt)) out.rays.push({ pts: capped(seg, maxLen), dashed: true, lens: li });
      }
      hitsOf.get(k).push(ray.h);
      if (endH !== null && Number.isFinite(endH)) hitsOf.get(m).push(endH);
    }
  });
  for (const [k, hits] of hitsOf) {
    if (!hits.length) continue;
    const step = steps[k];
    const F1 = frameOf(step.H, u), F2 = frameOf(step.H2, u);
    const half = Number.isFinite(step.half) ? step.half : 0;
    if (step.H2 === step.H) {
      // A thin lens: its plane drawn on, beyond the rim, as far as the rays
      // that meet it outside the lens (one line each side at most).
      for (const sign of [-1, 1]) {
        const far = Math.max(0, ...hits.map(h => sign * h));
        if (far > half + 0.5) out.planes.push({ pts: [pointOn(sign * half, F1), pointOn(sign * far, F1)] });
      }
    } else {
      // A real optic: its two principal planes, across the glass and on to
      // the rays.
      const lo = Math.min(-half, ...hits), hi = Math.max(half, ...hits);
      for (const F of [F1, F2]) out.planes.push({ pts: [pointOn(lo, F), pointOn(hi, F)] });
    }
  }
  return out;
}
