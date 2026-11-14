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
      // The planes of its first and last vertex: where its glass begins and
      // ends along the axis (its principal planes can lie outside it).
      faces: [planeAt(owner, sign * card.first), planeAt(owner, sign * card.last)],
    });
  }
  steps.sort((a, b) => a.t - b.t);
  if (steps.some(step => !step.f)) return null;
  return steps;
}

// The image of point P through the first `upTo` steps, as homogeneous
// coordinates { x, y, w } (w = 0: a point at infinity, (x, y) the direction
// its rays run in). Each step maps points exactly, in the frame of its own
// planes: a lens by the Gaussian lens equation, which is the tracer's
// thin-lens bend u′ = u − h/f (tangent slopes, h along the lens) applied to
// every ray through the point, and an afocal step by its matrix. Mapping the
// point itself, rather than intersecting two traced rays, keeps a tilted
// lens right: a steep helper ray could cross its plane against the light
// and be bent the wrong way (Andrea on #319).
function imageHomog(P, steps, u, upTo = steps.length) {
  let X = P.x, Y = P.y, W = 1;
  for (let k = 0; k < upTo; k++) {
    const step = steps[k];
    const F1 = frameOf(step.H, u), F2 = frameOf(step.H2, u);
    // Along the light (z, before the plane < 0) and across the optic (h).
    const rx = X - W * F1.mid.x, ry = Y - W * F1.mid.y;
    const z = rx * F1.np.x + ry * F1.np.y, h = rx * F1.t.x + ry * F1.t.y;
    let z2, h2, w2;
    if (step.matrix) {
      // Rays through (z, h) meet again at z′ = (Az − B)/D, h′ = Ah.
      const { A, B, D } = step.matrix;
      z2 = A * z - B * W; h2 = A * D * h; w2 = D * W;
    } else {
      // 1/z′ = 1/z + 1/f, h′ = h z′/z, from H to H′ at the same height.
      const f = step.f;
      z2 = f * z; h2 = f * h; w2 = z + f * W;
    }
    X = w2 * F2.mid.x + z2 * F2.np.x + h2 * F2.t.x;
    Y = w2 * F2.mid.y + z2 * F2.np.y + h2 * F2.t.y;
    W = w2;
    // Keep the numbers in range over a long chain.
    const scale = Math.max(Math.abs(X), Math.abs(Y), Math.abs(W));
    if (!(scale > 0) || !Number.isFinite(scale)) return null;
    X /= scale; Y /= scale; W /= scale;
  }
  return { x: X, y: Y, w: W };
}

// Beyond this distance (mm) an image counts as at infinity.
const FAR_IMAGE = 1e9;

// The image of point P after the first `upTo` steps, or null when it lies at
// infinity. (v, the Object's up direction, is no longer needed.)
export function imageOfPoint(P, steps, u, v, upTo = steps.length) {
  const H = imageHomog(P, steps, u, upTo);
  if (!H || !(Math.abs(H.w) > 0)) return null;
  const pt = { x: H.x / H.w, y: H.y / H.w };
  if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) return null;
  return Math.hypot(pt.x - P.x, pt.y - P.y) > FAR_IMAGE ? null : pt;
}

// ---------------------------------------------------------------------------
// Principal rays: the three textbook construction rays from the Object's tip:
//   - parallel to the lens's axis, then through its back focal point;
//   - through the centre (of H, leaving from the centre of H′), undeviated;
//   - through its front focal point, then parallel to the axis.
// The first lens draws them from the tip. Every later lens bends the rays
// that reach it, and they pass through any real image formed on the way, so
// each drawn ray is one connected path of light from the object to the last
// image. A first lens whose object is at infinity has no ray parallel to the
// axis, and one whose image is at infinity has no ray leaving parallel.
// Each ray is a straight line between optics, fixed by the image points the
// chain already computes, so the rays meet exactly at each image, and end
// on the last one when it is real.
//
// The rays are drawn, not traced: they do not interact with anything else in
// the scene. A plate or telescope group (an afocal step) carries them through
// its paraxial matrix. A dashed line leads back to a virtual image. A ray is
// drawn only if every optic it crosses catches it within its glass (Luca's
// rule on #319): a construction ray that would meet a lens outside the glass
// is left out rather than bent in empty air. A thick lens, asphere or lens
// group shows its principal planes across its glass, since that is where the
// construction bends its rays.

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


// Where segment a–b crosses the (infinite) line of `plane`, or null.
function segmentPlane(a, b, plane) {
  const d = sub(b, a), e = sub(plane.b, plane.a);
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-12) return null;
  const dp = sub(plane.a, a);
  const s = (dp.x * e.y - dp.y * e.x) / den;
  return s >= -1e-12 && s <= 1 + 1e-12 ? add(a, mul(d, s)) : null;
}

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
// pieces (lens = the lens of the chain whose three rays they are, from 0),
// and the principal planes of the real optics the rays cross. Empty when the
// chain has no lens with power.
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
  const dirIn = j => { const H = imageHomog(tip, steps, u, j); return H ? norm({ x: H.x, y: H.y }) : null; };
  const lenses = steps.flatMap((s, i) => (s.matrix ? [] : [i]));
  // A ray is drawn only where it really crosses glass: a height h on a
  // step's plane must lie within that optic's half-aperture.
  const inGlass = (h, step) => !(step.half > 0) || (Number.isFinite(h) && Math.abs(h) <= step.half + 1e-9);
  // Whether the image in space j forms there for real: on the far side of
  // the plane it leaves the step before through, and not beyond the plane of
  // the step after. Measured across each plane (along its normal), so a
  // tilted lens is judged by where its plane really is. A ray in space j
  // runs from one plane to the next through that image, so this test
  // decides where the rays end.
  const side = (P, plane) => { const F = frameOf(plane, u); return dot(sub(P, F.mid), F.np); };
  const realIn = j => {
    const R = imgs[j];
    if (!R) return false;
    return side(R, steps[j - 1].H2) > 0 && (j === N || side(R, steps[j].H) <= 0);
  };
  // Only the first lens draws its three rays, from the tip. Every later lens
  // bends the rays that reach it, through any real image formed before it,
  // so each drawn ray is one connected path of light from the object to the
  // last image (Luca's call on #319, after testing a relay).
  const k = lenses[0];
  if (k === undefined) return out;
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
  const drawnAt = new Set();
  for (const ray of candidates) {
    if (!ray.din || !ray.dout || !inGlass(ray.h, step)) continue;
    const hit1 = pointOn(ray.h, F1), hit2 = pointOn(ray.h, F2);
    const crossed = [k];

    // Back from the lens to the tip, crossing any plates or telescopes
    // before it.
    const back = [hit1];
    let cur = hit1, d = ray.din, ok = true, space = k;
    while (space > 0) {
      const a = space - 1;
      const X2 = linePlane(cur, d, steps[a].H2);
      const prev = X2 && afocalBack(steps[a], X2, d, u);
      if (!prev || !inGlass(heightOn(X2, frameOf(steps[a].H2, u)), steps[a])
        || !inGlass(heightOn(prev.p, frameOf(steps[a].H, u)), steps[a])) { ok = false; break; }
      back.push(X2, prev.p);
      cur = prev.p; d = prev.d; space = a;
    }
    if (!ok) continue;
    back.push(tip);
    const pts = back.reverse();
    if (step.H2 !== step.H) pts.push(hit2);

    // On from the lens: through every step after it, bending at each
    // lens towards that lens's image, through any real image on the way,
    // to the last space.
    const dashed = [];
    cur = hit2; d = ray.dout;
    for (let j = k + 1; j <= N; j++) {
      const R = imgs[j];
      const next = j < N ? linePlane(cur, d, steps[j].H) : null;
      const reaches = realIn(j);
      if (j === N) {
        if (reaches) pts.push(R); // a real final image: the rays end on it
        else {
          // A virtual final image (dashed back to it) or one at infinity:
          // the rays run on to the edge of the trace, as traced light does.
          pts.push(add(cur, mul(d, maxLen)));
          if (R) dashed.push([cur, R]);
        }
        break;
      }
      if (reaches) {
        // A real image on the way: the ray passes through it and goes on.
        pts.push(R);
      } else if (R && ahead(R, cur, d) > 0 && !steps[j].matrix) {
        // A virtual image the next lens works from: dashed back to it.
        dashed.push([cur, R]);
      }
      if (!next) { ok = false; break; }
      const nextStep = steps[j];
      if (!inGlass(heightOn(next, frameOf(nextStep.H, u)), nextStep)) { ok = false; break; }
      if (nextStep.matrix) {
        const after = afocalForward(nextStep, next, d, u);
        if (!after || !inGlass(heightOn(after.p, frameOf(nextStep.H2, u)), nextStep)) { ok = false; break; }
        pts.push(next, after.p);
        cur = after.p; d = after.d;
        continue;
      }
      // A later lens: the ray bends there towards the lens's image (all rays of a point leave a lens
      // through its image), or parallel to the rest when that image is at
      // infinity.
      const G1 = frameOf(nextStep.H, u), G2 = frameOf(nextStep.H2, u);
      const h = heightOn(next, G1);
      const exit = pointOn(h, G2);
      const out2 = imgs[j + 1] ? towards(exit, imgs[j + 1], G2) : forward(dirIn(j + 1), G2);
      if (!out2) { ok = false; break; }
      pts.push(next);
      if (nextStep.H2 !== nextStep.H) pts.push(exit);
      crossed.push(j);
      cur = exit; d = out2;
    }
    if (!ok || !pts.every(finitePt)) continue;
    // A thick lens, asphere or lens group bends the construction at its
    // principal planes, which can lie outside its glass (a meniscus): the
    // drawn path must also cross both its vertex planes within the glass,
    // or it would pass the lens by.
    const missesGlass = crossed.some(c => (steps[c].faces || []).some(face => {
      const F = frameOf(face, u);
      let crossings = 0;
      for (let i = 1; i < pts.length; i++) {
        const x = segmentPlane(pts[i - 1], pts[i], face);
        if (!x) continue;
        crossings++;
        if (!inGlass(heightOn(x, F), steps[c])) return true;
      }
      return crossings === 0;
    }));
    if (missesGlass) continue;
    out.rays.push({ pts: capped(pts, maxLen), dashed: false, lens: 0 });
    for (const seg of dashed) {
      if (seg.every(finitePt)) out.rays.push({ pts: capped(seg, maxLen), dashed: true, lens: 0 });
    }
    for (const c of crossed) drawnAt.add(c);
  }
  // A real optic the rays cross shows its two principal planes across its
  // glass, where the construction bends them.
  for (const k of drawnAt) {
    const step = steps[k];
    if (step.H2 === step.H || !(step.half > 0)) continue;
    for (const plane of [step.H, step.H2]) {
      const F = frameOf(plane, u);
      out.planes.push({ pts: [pointOn(-step.half, F), pointOn(step.half, F)] });
    }
  }
  return out;
}
