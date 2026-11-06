// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Aiming an Object's ray fan at the optics in front of it (the Object's
// "Aim: fill the first optic"). Plain geometry on the scene's traced
// surfaces, worked in the Object's own frame: +x is the Object's axis and
// +y points down, as everywhere in the sketch.
//
// The target is the first optic the Object's axis meets: a thin lens, a
// metalens, a glass face or a mirror. The fan is the widest cone of
// directions from the fan's origin that reaches that optic's clear aperture
// without first meeting anything opaque (a slit, an iris, a lens stop, a
// housing). Transmissive optics in between, such as a filter or a polarizer,
// are not obstacles here and are not targets either.
//
// The answer is exact rather than sampled: seen from the origin, whether a
// direction gets through changes only at an obstacle's end point or where an
// obstacle crosses the target, so testing one direction between each pair
// of those angles decides every direction. A 0.5 mm slit 150 mm away is
// found as reliably as an open lens.

import { toLocal } from './util.js';

// Surfaces that the fan is aimed at.
export const AIM_TARGET_KINDS = new Set(['lens', 'metalens', 'refract', 'mirror', 'cmirror']);
// Surfaces that stop light before it reaches the target.
const OPAQUE_KINDS = new Set(['absorb', 'detector']);
// The fan is drawn this fraction of its width inside each edge, so an edge ray
// lands on the optic (or through the slit) rather than grazing its rim.
const EDGE_INSET = 0.005;

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

// The optic the Object's axis meets first and every opaque surface, in the
// Object's frame. `surfaces` are the tracer's world-space surfaces; the axis
// leaves the Object's anchor along +x. Null when the axis meets no optic.
export function objectAimScene(el, surfaces) {
  const toObject = s => ({ a: toLocal(el, s.a.x, s.a.y), b: toLocal(el, s.b.x, s.b.y), kind: s.kind });
  const axisFrom = { x: 0, y: 0 }, axis = { x: 1, y: 0 };
  let target = null, nearest = Infinity;
  const obstacles = [];
  for (const s of surfaces || []) {
    if (!s?.a || !s?.b || s.el === el) continue;
    if (OPAQUE_KINDS.has(s.kind)) { obstacles.push(toObject(s)); continue; }
    if (!AIM_TARGET_KINDS.has(s.kind)) continue;
    const local = toObject(s);
    const t = hitSegment(axisFrom, axis, local.a, local.b);
    // Beyond 1 mm, as the image construction asks of the lenses it uses.
    if (t > 1 && t < nearest) { nearest = t; target = local; }
  }
  return target ? { target, obstacles } : null;
}

// The widest cone of directions from `origin` (Object frame) that reaches the
// scene's target unobstructed, as angles { lo, hi } in radians from the
// Object's axis (positive = clockwise on screen). Null when the target is
// not in front of the origin or nothing gets through.
export function aimedFanSpan(origin, scene) {
  if (!scene?.target) return null;
  const { target, obstacles } = scene;
  const angle = p => Math.atan2(p.y - origin.y, p.x - origin.x);
  const ends = [angle(target.a), angle(target.b)];
  if (ends.some(a => !(Math.abs(a) < Math.PI / 2))) return null;
  const lo = Math.min(...ends), hi = Math.max(...ends);
  if (!(hi - lo > 1e-9)) return null;

  const reaches = a => {
    const d = { x: Math.cos(a), y: Math.sin(a) };
    const t = hitSegment(origin, d, target.a, target.b);
    if (!Number.isFinite(t)) return false;
    return obstacles.every(o => !(hitSegment(origin, d, o.a, o.b) < t));
  };

  // Every angle where the answer can change, inside the target's own span.
  const cuts = [lo, hi];
  for (const o of obstacles) {
    cuts.push(angle(o.a), angle(o.b));
    const x = crossing(o.a, o.b, target.a, target.b);
    if (x) cuts.push(angle(x));
  }
  const sorted = [...new Set(cuts.filter(a => a >= lo && a <= hi))].sort((a, b) => a - b);

  let best = null, run = null;
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a0 = sorted[i], a1 = sorted[i + 1];
    if (a1 - a0 < 1e-12) continue;
    if (reaches((a0 + a1) / 2)) {
      run = run ? { lo: run.lo, hi: a1 } : { lo: a0, hi: a1 };
      if (!best || run.hi - run.lo > best.hi - best.lo) best = run;
    } else {
      run = null;
    }
  }
  if (!best) return null;
  const inset = (best.hi - best.lo) * EDGE_INSET;
  return { lo: best.lo + inset, hi: best.hi - inset };
}
