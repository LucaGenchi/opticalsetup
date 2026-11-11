// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// The diffraction-limited focus a zoom can draw over a beam that focuses
// inside its region.
//
// Traced rays meet at a geometric point, which no real beam reaches. Where a
// bundle of a beam's sampling rays converges inside the region, this finds
// its focus the way a volume specimen does (bundleFocus: the plane of least
// spread, and the numerical aperture of the outermost rays) and gives the
// ideal Gaussian beam focused in that cone: waist w0 = λ/(π·NA) and Rayleigh
// range zR = π·w0²/λ, in air, at the light's centre wavelength. Its 1/e²
// radius along the beam, w(z) = w0·sqrt(1 + (z/zR)²), meets the rays' cone
// far from the focus, so the drawn envelope joins the traced beam.
//
// That is the diffraction limit of the cone, not a wave-optics calculation:
// aberrations, a medium's index, truncation by an aperture and M² > 1 are
// not computed, and a broadband beam is taken at its centre wavelength.

import { bundleFocus } from './sectioning.js';
import { wavelengthToColor } from './util.js';
import { zoomGeometry } from './zoom.js';

// A focus is drawn only where every ray of its bundle really passes through
// it: one at a segment's start (a point source's own emitter) or past its
// end (a virtual focus behind an optic) is not a beam focus.
const ALONG_TOLERANCE = 1e-6;

// Rays of one beam's bundle share their source, their route through
// splitting optics, their wavelength and the number of interactions behind
// them, so they reach the region on the same segment of their paths.
function bundleKey(path, segment) {
  return [path.originId || '', path.sourceId || '', path.branch || '', path.wl, segment].join('|');
}

function inRegion(g, at, p) {
  const dx = p.x - at.x, dy = p.y - at.y;
  const x = dx * g.cos + dy * g.sin, y = -dx * g.sin + dy * g.cos;
  if (g.shape === 'rect') return Math.abs(x) <= g.rx && Math.abs(y) <= g.ry;
  return (x * x) / (g.rx * g.rx) + (y * y) / (g.ry * g.ry) <= 1;
}

// Whether the segment a→b passes within the region's bounding circle.
function nearRegion(at, reach, a, b) {
  const ex = b.x - a.x, ey = b.y - a.y;
  const len2 = ex * ex + ey * ey;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((at.x - a.x) * ex + (at.y - a.y) * ey) / len2)) : 0;
  return Math.hypot(a.x + t * ex - at.x, a.y + t * ey - at.y) <= reach;
}

// Every beam focus inside the zoom's region, from the traced paths: each
// with its bench `point`, beam `axis` (unit), waist `w0Mm`, Rayleigh range
// `zRMm`, numerical aperture `na`, the stretch of the axis the beam travels
// (`from` < 0 < `to`, from the focus), wavelength `wl` and drawing `color`.
export function zoomFoci(zoom, paths = []) {
  const g = zoomGeometry(zoom.params, zoom.rot);
  const reach = Math.hypot(g.rx, g.ry);
  const groups = new Map();
  for (const path of paths) {
    if (!path || path.speckle || path.evanFade || !(path.wl > 0)) continue;
    const pts = path.pts || [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (!(len > 0) || !nearRegion(zoom, reach, a, b)) continue;
      const w = path.segmentIntensities?.[i] ?? path.intensity;
      if (!(w > 0)) continue;
      const key = bundleKey(path, i);
      if (!groups.has(key)) groups.set(key, { wl: path.wl, color: path.color || null, rays: [] });
      groups.get(key).rays.push({ p: a, d: { x: (b.x - a.x) / len, y: (b.y - a.y) / len }, w, len });
    }
  }
  const foci = [];
  for (const group of groups.values()) {
    const found = bundleFocus(group.rays, group.wl);
    if (!found.ok || !inRegion(g, zoom, found.point)) continue;
    const real = group.rays.every(r => {
      const along = (found.point.x - r.p.x) * r.d.x + (found.point.y - r.p.y) * r.d.y;
      return along > ALONG_TOLERANCE && along <= r.len + ALONG_TOLERANCE;
    });
    if (!real) continue;
    // Where the bundle travels: its rays start on the optic before the
    // focus and end on the optic after it. `from` and `to` span all of it
    // along the axis, and `ends` are the two optics' faces, as lines
    // through the outermost rays' start and end points, so the waist can
    // be cut along each face (a tilted mirror too) rather than square to
    // the beam.
    let from = Infinity, to = -Infinity;
    for (const r of group.rays) {
      const s0 = (r.p.x - found.point.x) * found.axis.x + (r.p.y - found.point.y) * found.axis.y;
      const s1 = s0 + r.len * (r.d.x * found.axis.x + r.d.y * found.axis.y);
      from = Math.min(from, s0); to = Math.max(to, s1);
    }
    if (![from, to].every(Number.isFinite) || !(from < 0 && to > 0)) continue;
    const across = p => (p.x - found.point.x) * -found.axis.y + (p.y - found.point.y) * found.axis.x;
    const outermost = group.rays.reduce((ends, r) => {
      const t = across(r.p);
      if (!ends.lo || t < ends.lo.t) ends.lo = { t, r };
      if (!ends.hi || t > ends.hi.t) ends.hi = { t, r };
      return ends;
    }, {});
    const endOf = r => ({ x: r.p.x + r.len * r.d.x, y: r.p.y + r.len * r.d.y });
    const ends = [
      faceLine(outermost.lo.r.p, outermost.hi.r.p, found.point, found.axis, from),
      faceLine(endOf(outermost.lo.r), endOf(outermost.hi.r), found.point, found.axis, to),
    ];
    foci.push({
      point: found.point, axis: found.axis, w0Mm: found.w0Mm, zRMm: found.zRMm, na: found.na,
      from, to, ends, wl: group.wl, color: group.color || wavelengthToColor(group.wl),
    });
  }
  return foci;
}

// An optic's face as the side of a line the focus is on: the line through
// two points on it, or, when they coincide, the line square to the axis at
// `s` from the focus. Kept: n·(p − at) ≥ 0.
function faceLine(a, b, focus, axis, s) {
  let n = { x: -(b.y - a.y), y: b.x - a.x };
  let at = a;
  const len = Math.hypot(n.x, n.y);
  if (!(len > 1e-12)) {
    n = { x: axis.x, y: axis.y };
    at = { x: focus.x + s * axis.x, y: focus.y + s * axis.y };
  } else {
    n = { x: n.x / len, y: n.y / len };
  }
  if (n.x * (focus.x - at.x) + n.y * (focus.y - at.y) < 0) n = { x: -n.x, y: -n.y };
  return { at, n };
}

// The part of a closed outline on the kept side of a line (one pass of
// Sutherland–Hodgman, which holds for a non-convex outline against a
// single line).
function clipToSide(outline, { at, n }) {
  const side = p => n.x * (p.x - at.x) + n.y * (p.y - at.y);
  const kept = [];
  for (let i = 0; i < outline.length; i++) {
    const p = outline[i], q = outline[(i + 1) % outline.length];
    const sp = side(p), sq = side(q);
    if (sp >= 0) kept.push(p);
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq);
      kept.push({ x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
    }
  }
  return kept;
}

// The 1/e² envelope of a focus on the bench, as a closed outline: both
// edges from `from` to `to` along the beam, measured from the focus,
// sampled densely near the waist (evenly in asinh(z/zR)) where the curve
// bends, then cut along the optics' faces in `focus.ends`, when given.
export function focusEnvelope(focus, from, to, samples = 48) {
  const { point, axis, w0Mm, zRMm } = focus;
  if (!(from < to)) return [];
  const nx = -axis.y, ny = axis.x;
  const u0 = Math.asinh(from / zRMm), u1 = Math.asinh(to / zRMm);
  const left = [], right = [];
  for (let k = 0; k <= samples; k++) {
    const z = zRMm * Math.sinh(u0 + (u1 - u0) * k / samples);
    const w = w0Mm * Math.sqrt(1 + (z / zRMm) ** 2);
    const cx = point.x + z * axis.x, cy = point.y + z * axis.y;
    left.push({ x: cx + w * nx, y: cy + w * ny });
    right.push({ x: cx - w * nx, y: cy - w * ny });
  }
  let outline = left.concat(right.reverse());
  for (const face of focus.ends || []) outline = clipToSide(outline, face);
  return outline.length >= 3 && outline.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) ? outline : [];
}
