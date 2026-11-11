// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Aiming an Object's ray fan at the optics in front of it (the Object's
// "Aim: fill the first optic"). Plain geometry on the scene's traced
// surfaces, worked in the Object's own frame: +x is the Object's axis and
// +y points down, as everywhere in the sketch.
//
// The target is the first optic the Object's axis meets: a thin lens, a
// metalens, a glass face or a mirror (flat, spherical, parabolic or conic).
// It is the whole optic, every traced segment of it, not only the segment
// the axis crosses: a curved mirror is traced as many short segments. Only
// the optic's central two-thirds is aimed at (AIM_FILL): rays through its
// very edge leave it at the steepest angles, and the next lens would miss
// them. The fan is the widest cone of directions from the fan's origin that
// reaches that central part (or, when a slit or stop lets light through only
// to the outer part, the whole optic) without first meeting anything opaque (a slit, an iris, a lens
// stop, a housing). A hole in the optic itself, such as a conic mirror's
// central opening, does not split the cone: the fan spans the whole optic
// and the rays aimed at the hole pass through it. Transmissive optics in
// between, such as a filter or a polarizer, are not obstacles here and are
// not targets either.
//
// The answer is exact rather than sampled: seen from the origin, what a
// direction meets first changes only at a segment's end point or where an
// obstacle crosses the target, so testing one direction between each pair
// of those angles decides every direction. A 0.5 mm slit 150 mm away is
// found as reliably as an open lens.

import { toLocal } from './util.js';

// Surfaces that the fan is aimed at.
export const AIM_TARGET_KINDS = new Set(['lens', 'metalens', 'refract', 'mirror', 'cmirror', 'conicmirror']);
// Surfaces that stop light before it reaches the target.
const OPAQUE_KINDS = new Set(['absorb', 'detector']);
// The fan is drawn this fraction of its width inside each edge, so an edge ray
// lands on the optic (or through the slit) rather than grazing its rim.
const EDGE_INSET = 0.005;
// The fraction of the optic's half-width, either side of its centre, that the
// fan is aimed at.
export const AIM_FILL = 2 / 3;

// Distance t along o + t·d to the segment a–b, or Infinity when the ray
// misses it. The same parametrisation the tracer's own segment test uses.
function hitSegment(o, d, a, b) {
  const ex = b.x - a.x, ey = b.y - a.y;
  const den = d.x * ey - d.y * ex;
  if (Math.abs(den) < 1e-12) return Infinity;
  const px = a.x - o.x, py = a.y - o.y;
  const t = (px * ey - py * ex) / den;
  const q = (px * d.y - py * d.x) / den;
  return t > 1e-9 && q >= 0 && q <= 1 ? t : Infinity;
}

// Where the segments p1–p2 and a–b cross, or null.
function crossing(p1, p2, a, b) {
  const d = { x: p2.x - p1.x, y: p2.y - p1.y };
  const t = hitSegment(p1, d, a, b);
  return t <= 1 ? { x: p1.x + d.x * t, y: p1.y + d.y * t } : null;
}

const nearestHit = (o, d, segments) => segments.reduce((best, s) => Math.min(best, hitSegment(o, d, s.a, s.b)), Infinity);

// Where the Object's axis (from its anchor along +x) meets an optic given as
// its segments, or Infinity. An axis that runs through a hole in the optic,
// a conic mirror's central opening, meets it where it crosses the line
// between the optic's outermost points on either side.
function axisDistance(segments) {
  const axisFrom = { x: 0, y: 0 }, axis = { x: 1, y: 0 };
  const t = nearestHit(axisFrom, axis, segments);
  if (Number.isFinite(t)) return t;
  const pts = segments.flatMap(s => [s.a, s.b]);
  const top = pts.reduce((p, q) => (q.y < p.y ? q : p)), bottom = pts.reduce((p, q) => (q.y > p.y ? q : p));
  if (!(top.y < 0 && bottom.y > 0)) return Infinity;
  const x = top.x + (bottom.x - top.x) * (-top.y) / (bottom.y - top.y);
  return x > 0 ? x : Infinity;
}

// Whether a glass face segment runs along its body's axis (local x) rather
// than across it.
function isRim(s) {
  const body = s.el;
  const a = body ? toLocal(body, s.a.x, s.a.y) : s.a, b = body ? toLocal(body, s.b.x, s.b.y) : s.b;
  return Math.abs(b.y - a.y) <= Math.abs(b.x - a.x);
}

// The optic the Object's axis meets first (all of its target segments) and
// every opaque surface, in the Object's frame. `surfaces` are the tracer's
// world-space surfaces. Null when the axis meets no optic.
export function objectAimScene(el, surfaces) {
  const toObject = s => ({ a: toLocal(el, s.a.x, s.a.y), b: toLocal(el, s.b.x, s.b.y), kind: s.kind, world: { a: s.a, b: s.b } });
  const optics = new Map(), obstacles = [];
  for (const s of surfaces || []) {
    if (!s?.a || !s?.b || s.el === el) continue;
    if (OPAQUE_KINDS.has(s.kind)) { obstacles.push(toObject(s)); continue; }
    if (!AIM_TARGET_KINDS.has(s.kind)) continue;
    const local = toObject(s);
    // A glass body's rim stops the fan like an opaque edge: a ray that meets
    // the rim first enters the glass sideways and is trapped or thrown off.
    // Its faces lie across the body's own axis and its rim runs along it, so
    // the test is made in the body's frame, where a tilted lens keeps its
    // faces. A thin lens, a metalens or a mirror has no rim: every segment
    // of it is optic, however it is turned.
    if (s.kind === 'refract' && isRim(s)) { obstacles.push(local); continue; }
    // One optic is every target segment of one element.
    const owner = s.el || s;
    if (!optics.has(owner)) optics.set(owner, []);
    optics.get(owner).push(local);
  }
  let targets = null, owner = null, nearest = Infinity;
  for (const [o, segments] of optics) {
    const t = axisDistance(segments);
    // Beyond 1 mm, as the image construction asks of the lenses it uses.
    if (t > 1 && t < nearest) { nearest = t; targets = segments; owner = o; }
  }
  return targets ? { targets: centralPart(targets, owner), whole: targets, obstacles } : null;
}

// The part of an optic within AIM_FILL of its half-width from its centre.
// Every optic lays its aperture out along its own local y (a lens pair's two
// lenses, a mirror's segments, a thick lens's faces), so the cut is made
// there: |y − centre| ≤ AIM_FILL · half-width, in the optic's own frame,
// whichever way it is turned. Each segment is cut at the same fractions
// along its length in the Object's frame. An optic whose centre is a hole
// wider than that, such as a conic mirror with a large opening, keeps its
// whole face.
function centralPart(segments, owner) {
  const own = owner?.type ? (p => toLocal(owner, p.x, p.y)) : null;
  const world = segments.map(s => (s.world && own ? [own(s.world.a), own(s.world.b)] : [s.a, s.b]));
  const ys = world.flat().map(p => p.y);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const centre = (lo + hi) / 2, reach = AIM_FILL * (hi - lo) / 2;
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const cut = [];
  segments.forEach((s, i) => {
    const [a, b] = world[i];
    const ya = a.y - centre, yb = b.y - centre;
    // The fractions along the segment where |y − centre| ≤ reach.
    let t0 = 0, t1 = 1;
    if (Math.abs(yb - ya) < 1e-12) {
      if (Math.abs(ya) > reach) return;
    } else {
      const tAt = y => (y - ya) / (yb - ya);
      const [p, q] = [tAt(-reach), tAt(reach)].sort((m, n) => m - n);
      t0 = Math.max(0, p); t1 = Math.min(1, q);
      if (!(t1 - t0 > 1e-12)) return;
    }
    cut.push({ a: lerp(s.a, s.b, t0), b: lerp(s.a, s.b, t1), kind: s.kind });
  });
  return cut.length ? cut : segments;
}

// The widest run of rays, among a one-parameter family, that reaches the
// target unobstructed. `rayAt(x)` is the ray for parameter x; `paramOf(p)`
// is the parameter of the ray through point p. Returns { lo, hi } with the
// edge inset, or null.
function widestOpenRun(targets, obstacles, rayAt, paramOf) {
  const ends = targets.flatMap(s => [paramOf(s.a), paramOf(s.b)]);
  if (ends.some(x => !Number.isFinite(x))) return null;
  const lo = Math.min(...ends), hi = Math.max(...ends);
  if (!(hi - lo > 1e-9)) return null;

  // What a ray meets first: the optic ('reach'), something opaque
  // ('block'), or neither ('miss': a hole in the optic, or a gap between it
  // and the edge of the run).
  const meets = x => {
    const { o, d } = rayAt(x);
    const t = nearestHit(o, d, targets), tObs = nearestHit(o, d, obstacles);
    if (tObs < t || (Number.isFinite(tObs) && !Number.isFinite(t))) return 'block';
    return Number.isFinite(t) ? 'reach' : 'miss';
  };

  // Every parameter where the answer can change, inside the target's span.
  const cuts = [...ends];
  for (const o of obstacles) {
    cuts.push(paramOf(o.a), paramOf(o.b));
    for (const s of targets) {
      const x = crossing(o.a, o.b, s.a, s.b);
      if (x) cuts.push(paramOf(x));
    }
  }
  const sorted = [...new Set(cuts.filter(x => x >= lo && x <= hi))].sort((a, b) => a - b);

  // Runs not blocked by anything opaque, each from its first to its last ray
  // that reaches the optic; the widest one wins.
  let best = null, run = null;
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a0 = sorted[i], a1 = sorted[i + 1];
    if (a1 - a0 < 1e-12) continue;
    const what = meets((a0 + a1) / 2);
    if (what === 'block') { run = null; continue; }
    if (what === 'miss') continue;
    run = run ? { lo: run.lo, hi: a1 } : { lo: a0, hi: a1 };
    if (!best || run.hi - run.lo > best.hi - best.lo) best = run;
  }
  if (!best) return null;
  const inset = (best.hi - best.lo) * EDGE_INSET;
  return { lo: best.lo + inset, hi: best.hi - inset };
}

const sceneTargets = scene => scene?.targets || (scene?.target ? [scene.target] : []);

// The widest cone of directions from `origin` (Object frame) that reaches the
// scene's target unobstructed, as angles { lo, hi } in radians from the
// Object's axis (positive = clockwise on screen). Null when the target is
// not in front of the origin or nothing gets through.
export function aimedFanSpan(origin, scene) {
  const targets = sceneTargets(scene);
  if (!targets.length) return null;
  const angle = p => Math.atan2(p.y - origin.y, p.x - origin.x);
  if (targets.some(s => !(Math.abs(angle(s.a)) < Math.PI / 2 && Math.abs(angle(s.b)) < Math.PI / 2))) return null;
  const rayAt = a => ({ o: origin, d: { x: Math.cos(a), y: Math.sin(a) } });
  const run = widestOpenRun(targets, scene.obstacles || [], rayAt, angle);
  // A slit or stop that lets light through only to the optic's outer part:
  // aim through it at the whole optic rather than point straight ahead.
  if (run || !scene.whole?.length) return run;
  if (scene.whole.some(s => !(Math.abs(angle(s.a)) < Math.PI / 2 && Math.abs(angle(s.b)) < Math.PI / 2))) return null;
  return widestOpenRun(scene.whole, scene.obstacles || [], rayAt, angle);
}
