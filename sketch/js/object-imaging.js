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
// the steps and intersect what comes out. An object at infinity sends each of
// its points as a parallel bundle, so its image is where two parallel rays
// in that direction meet. Everything here is the paraxial model: the real
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
// plus the last vertex; null for an afocal run.
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
  const A = r1.y, C = r1.omega, D = r2.omega;
  if (!(Math.abs(C) > 1e-12)) return null;
  const first = faces[0].s, last = faces.at(-1).s;
  return { f: -1 / C, h1: first - (1 - D) / C, h2: last + (1 - A) / C, first, last };
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
// with its registry entry's `paraxialFaces(el, wavelength)`. Null when some
// lens on the axis has no focal length (an afocal optic, a missing value):
// no image is drawn then, as before.
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
        steps.push({ t, f, H: s, H2: s, exit: add(p0, mul(u, t)), el: s.el, thin: true });
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
    if (!card || !Number.isFinite(card.f)) return null;
    steps.push({
      t, f: card.f, H: planeAt(owner, sign * card.h1), H2: planeAt(owner, sign * card.h2),
      exit: toWorld(owner, sign * card.last, 0), el: owner, thin: false,
    });
  }
  steps.sort((a, b) => a.t - b.t);
  if (steps.some(step => !step.f)) return null;
  return steps;
}

// Carries rays { p, d } through the first `upTo` steps, in place. `onHit`
// sees each ray where it meets a step's H and where it leaves its H′.
function throughSteps(rays, steps, upTo = steps.length, onHit = null) {
  for (let k = 0; k < upTo; k++) {
    const step = steps[k];
    for (const r of rays) {
      const e = sub(step.H.b, step.H.a);
      const den = r.d.x * e.y - r.d.y * e.x;
      if (Math.abs(den) < 1e-9) continue;
      const dp = sub(step.H.a, r.p);
      const t = (dp.x * e.y - dp.y * e.x) / den;
      const hitP = add(r.p, mul(r.d, t));
      if (onHit) onHit(r, hitP);
      if (step.H2 === step.H) {
        r.p = hitP;
      } else {
        // Leave H′ at the height it met H.
        const tH = norm(e), tH2 = norm(sub(step.H2.b, step.H2.a));
        const h = dot(sub(hitP, mul(add(step.H.a, step.H.b), 0.5)), tH);
        r.p = add(mul(add(step.H2.a, step.H2.b), 0.5), mul(tH2, h));
      }
      if (onHit && step.H2 !== step.H) onHit(r, r.p);
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

// The image of a point at infinity seen along `dir` from `P` (a point on the
// Object's axis): two parallel rays, through P and beside it, intersected.
export function imageOfDirection(dir, P, steps, upTo = steps.length) {
  const side = perp(dir);
  const [rA, rB] = throughSteps([{ p: P, d: dir }, { p: add(P, mul(side, 1)), d: dir }], steps, upTo);
  return meet(rA, rB);
}

// One ray from p along d through all the steps, as a construction line: the
// points where it crosses each lens plane (and leaves a real optic's H′),
// where it leaves the last one, and in which direction.
export function rayPathThroughSteps(p, d, steps) {
  const pts = [p];
  const [r] = throughSteps([{ p, d }], steps, steps.length, (_, at) => pts.push(at));
  return { pts, p: r.p, d: r.d };
}

// Where the line o + t·d meets the line through segment s, or null.
function lineMeet(o, d, s) {
  const e = sub(s.b, s.a);
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-12) return null;
  const dp = sub(s.a, o);
  return add(o, mul(d, (dp.x * e.y - dp.y * e.x) / den));
}

// The textbook construction rays (world { p, d }) for an Object in front of
// the first lens of its chain, from the Object's tip: parallel to the axis
// (then through the back focal point); through the lens centre (undeviated;
// for a real optic, aimed at H and leaving H′ parallel to itself); through
// the front focal point (then parallel). The third is left out when the tip
// stands in the front focal plane, where it would run along the plane. For
// an Object at infinity, whose tip's light is a parallel bundle, the two of
// that bundle through the centre and through the front focal point, started
// on the Object's own plane. `tip` is the tip in world coordinates and
// `tipDir` its bundle's direction at infinity (null for a nearby Object).
export function principalRays(el, steps, { tip, tipDir = null }) {
  const first = steps?.[0];
  if (!first) return [];
  const u = rotPt(1, 0, el.rot || 0), p0 = { x: el.x, y: el.y };
  const centre = lineMeet(p0, u, first.H);
  if (!centre) return [];
  const front = sub(centre, mul(u, first.f));
  if (tipDir) {
    const along = dot(tipDir, u);
    if (!(along > 1e-9)) return [];
    const onObjectPlane = q => sub(q, mul(tipDir, dot(sub(q, p0), u) / along));
    return [{ p: onObjectPlane(centre), d: tipDir }, { p: onObjectPlane(front), d: tipDir }];
  }
  const rays = [{ p: tip, d: u }, { p: tip, d: norm(sub(centre, tip)) }];
  const ahead = dot(sub(front, tip), u);
  if (ahead > 1e-6) rays.push({ p: tip, d: norm(sub(front, tip)) });
  else if (ahead < -1e-6) rays.push({ p: tip, d: norm(sub(tip, front)) });
  return rays;
}
