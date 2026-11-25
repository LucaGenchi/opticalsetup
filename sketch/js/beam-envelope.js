// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The beam envelope (step G2 of the Physics in 2D track,
// docs/physics/beam-propagation.md): the 1/e² radius w(z) of a propagated
// Gaussian beam drawn around its central ray as a band. DOM-free:
// sketch/js/raytrace.js gives each stretch of a traced path its beam (the
// one the probe and the detectors read) and turns the bands returned here
// into drawables, so the canvas and every export draw the same geometry.
//
// One function draws every Gaussian envelope in the app: `envelopeEdges`
// gives both edges of the curve w(z) = w₀·√(1 + (z/z_R)²) between two
// points of the axis. The zoom's focus (sketch/js/zoom-focus.js) and the
// bench's band use it, so a zoom over a band shows the same curve.

const dot = (a, b) => a.x * b.x + a.y * b.y;

// Both edges of the 1/e² envelope of a beam whose waist (radius w0Mm,
// Rayleigh range zRMm) lies at `point` on the unit `axis`, from `from` to
// `to` along the axis measured from the waist, sampled evenly in asinh(z/z_R)
// so the samples crowd where the curve bends and thin out where it is
// straight. `left` is on the side of the axis turned a quarter turn
// anticlockwise in the drawing. Null when there is nothing to draw.
export function envelopeEdges({ point, axis, w0Mm, zRMm }, from, to, samples = 48) {
  if (!(from < to) || !(w0Mm > 0) || !(zRMm > 0)) return null;
  const nx = -axis.y, ny = axis.x;
  const u0 = Math.asinh(from / zRMm), u1 = Math.asinh(to / zRMm);
  const left = [], right = [];
  for (let k = 0; k <= samples; k++) {
    const z = k === 0 ? from : k === samples ? to : zRMm * Math.sinh(u0 + (u1 - u0) * k / samples);
    const w = w0Mm * Math.sqrt(1 + (z / zRMm) ** 2);
    const cx = point.x + z * axis.x, cy = point.y + z * axis.y;
    left.push({ x: cx + w * nx, y: cy + w * ny });
    right.push({ x: cx - w * nx, y: cy - w * ny });
  }
  return [...left, ...right].every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) ? { left, right } : null;
}

// The part of an open polyline on the kept side of a line (n·(p − at) ≥ 0),
// with the crossing points added where it enters or leaves that side.
function clipPolyline(points, { at, n }) {
  const side = p => n.x * (p.x - at.x) + n.y * (p.y - at.y);
  const kept = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], sp = side(p);
    if (sp >= 0) kept.push(p);
    const q = points[i + 1];
    if (!q) break;
    const sq = side(q);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      kept.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
    }
  }
  return kept;
}

// Below this sine between a surface and the beam, a band is cut square to
// the beam rather than along the surface: a face met at grazing incidence
// would stretch the cut far along the beam.
const GRAZING_SINE = 0.1;

// The band of one straight stretch of a beam: it starts at `start` and runs
// `length` along the unit `d`; `shape` is the beam at `start` (beamFromQ:
// waistAheadMm, waistUm, rayleighMm). `faces` holds, for the start and the
// end, null (the band is cut square to the beam there) or the surface the
// beam leaves or meets there, as a line through `at` along the unit `t`: the
// band then ends on that surface, as the drawn rays do, rather than square
// to the beam, so the bands of two stretches meet along a tilted mirror
// without a gap or an overlap. Returns both edges and the outline to fill;
// null when there is nothing to draw. Nothing marks the waist: the band is
// narrowest there, and the probe reads its place and size (Luca: marks
// across the band confuse more than they show).
export function envelopeBand({ start, d, length, shape, faces = [null, null] }) {
  if (!shape || !(length > 0)) return null;
  const w0 = shape.waistUm / 1000, zR = shape.rayleighMm, ahead = shape.waistAheadMm;
  if (![w0, zR, ahead, length, start?.x, start?.y, d?.x, d?.y].every(Number.isFinite) || !(w0 > 0) || !(zR > 0)) return null;
  const across = { x: -d.y, y: d.x };
  const radiusAt = s => w0 * Math.sqrt(1 + ((s - ahead) / zR) ** 2);
  // A face used for a cut: the band runs on past the stretch's end as far as
  // the face leans along the beam, and is then cut on it, keeping the side
  // that holds the middle of the stretch. Each edge meets a leaning face
  // where the beam is wider (or narrower) than at the central hit, one edge
  // before the hit and the other after it: each meeting is a root of the
  // edge's distance to the face along s, bracketed by stepping out from the
  // hit (doubling) and found by bisection. An edge that never meets the face
  // (the beam spreads faster than the face leans away) leaves the band cut
  // square to the beam.
  const middle = { x: start.x + d.x * length / 2, y: start.y + d.y * length / 2 };
  const cut = (face, s0) => {
    if (!face) return null;
    const sine = Math.abs(dot(face.t, across));
    if (!(sine >= GRAZING_SINE)) return null;
    let n = { x: -face.t.y, y: face.t.x };
    if (dot(n, { x: middle.x - face.at.x, y: middle.y - face.at.y }) < 0) n = { x: -n.x, y: -n.y };
    const meets = side => {
      const f = s => dot(n, { x: start.x + d.x * s + side * across.x * radiusAt(s) - face.at.x, y: start.y + d.y * s + side * across.y * radiusAt(s) - face.at.y });
      const f0 = f(s0);
      if (!Number.isFinite(f0)) return null;
      let best = null;
      for (const dir of [1, -1]) {
        let a = s0, fa = f0, step = Math.max(radiusAt(s0), 1e-3);
        for (let k = 0; k < 60 && step < 1e6; k++, step *= 2) {
          const b = s0 + dir * step, fb = f(b);
          if (!Number.isFinite(fb)) break;
          if ((fa > 0) !== (fb > 0)) {
            let lo = a, hi = b;
            for (let j = 0; j < 80 && Math.abs(hi - lo) > 1e-12 * Math.max(1, Math.abs(hi)); j++) {
              const m = (lo + hi) / 2;
              if ((f(m) > 0) === (fa > 0)) lo = m; else hi = m;
            }
            const root = (lo + hi) / 2;
            if (best === null || Math.abs(root - s0) < Math.abs(best - s0)) best = root;
            break;
          }
          a = b; fa = fb;
        }
      }
      return best;
    };
    const roots = [meets(1), meets(-1)];
    if (roots.some(r => r === null)) return null;
    const reach = Math.max(...roots.map(r => Math.abs(r - s0)));
    return { at: face.at, n, reach: reach * 1.01 + 1e-6 };
  };
  const startCut = cut(faces[0], 0), endCut = cut(faces[1], length);
  const from = -(startCut?.reach ?? 0), to = length + (endCut?.reach ?? 0);
  const point = { x: start.x + d.x * ahead, y: start.y + d.y * ahead };
  const edges = envelopeEdges({ point, axis: d, w0Mm: w0, zRMm: zR }, from - ahead, to - ahead, 96);
  if (!edges) return null;
  let { left, right } = edges;
  for (const c of [startCut, endCut]) {
    if (!c) continue;
    left = clipPolyline(left, c);
    right = clipPolyline(right, c);
  }
  if (left.length < 2 || right.length < 2) return null;
  return { left, right, outline: [...left, ...[...right].reverse()] };
}
