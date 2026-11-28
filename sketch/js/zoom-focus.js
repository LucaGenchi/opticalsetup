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
// radius along the beam, w(z) = w0·sqrt(1 + (z/zR)²), is drawn with the
// slope of the rays' cone (focusEnvelope), so it joins the traced beam far
// from the focus at any NA.
//
// That is the diffraction limit of the cone, not a wave-optics calculation:
// aberrations, a medium's index, truncation by an aperture and M² > 1 are
// not computed, and a broadband beam is taken at its centre wavelength.
//
// Where the bundle's central ray carries a propagated beam parameter (step
// G1), the waist drawn is that beam's instead: its own size, Rayleigh range
// and position, which differ from the cone's where the beam's Rayleigh range
// is not long against the focal length, where M² > 1 or in a medium. Each
// focus says which of the two it shows (`model`: 'propagated' or 'cone').

import { beamFromQ } from './gaussian-beam.js';
import { envelopeEdges } from './beam-envelope.js';
import { beamOnPathSegment } from './raytrace.js';
import { bundleFocus } from './sectioning.js';
import { wavelengthToColor } from './util.js';
import { zoomGeometry } from './zoom.js';

// A focus is drawn only where every ray of its bundle really passes through
// it: one at a segment's start (a point source's own emitter) or past its
// end (a virtual focus behind an optic) is not a beam focus.
const ALONG_TOLERANCE = 1e-6;
// A ray that goes on through a plane keeps its direction to about 1 µrad
// (1 − cos 1.4e-6 ≈ 1e-12).
const STRAIGHT_TOLERANCE = 1e-12;
// How far past the face where its beam parameter ends a propagated waist is
// still named: a tenth of its Rayleigh range, where the beam is wider than
// w0 by half a percent (sqrt(1 + 0.1²) = 1.005), so the face meets the
// waist (a fiber's end face, a pinhole's plate, a specimen plane).
const STOP_REACH = 0.1;

// Rays of one beam's bundle share their source, their route through
// splitting optics, their wavelength and the number of interactions behind
// them, so they reach the region on the same segment of their paths.
function bundleKey(path, segment) {
  return [path.originId || '', path.sourceId || '', path.branch || '', path.wl, segment].join('|');
}

// A path's segment after segment i, as a ray from the point segment i ends
// at, where the light goes on (finite, lit and of some length), with
// whether it carries a beam parameter; else null.
function continuation(path, i) {
  const a = path.pts[i + 1], b = path.pts[i + 2];
  if (!a || !b || ![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const w = path.segmentIntensities?.[i + 1] ?? path.intensity;
  if (!(len > 0) || !(w > 0)) return null;
  return { p: a, d: { x: (b.x - a.x) / len, y: (b.y - a.y) / len }, len, beam: Boolean(beamOnPathSegment(path, i + 1)) };
}

// A path's segment before segment i, as the direction the light arrived in
// at the point segment i starts from, where it was lit and of some length,
// with whether it carried a beam parameter; else null.
function arrival(path, i) {
  const a = path.pts[i - 1], b = path.pts[i];
  if (!a || !b || ![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const w = path.segmentIntensities?.[i - 1] ?? path.intensity;
  if (!(len > 0) || !(w > 0)) return null;
  return { d: { x: (b.x - a.x) / len, y: (b.y - a.y) / len }, beam: Boolean(beamOnPathSegment(path, i - 1)) };
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
// (`from` < 0 < `to`, from the focus), wavelength `wl` and drawing `color`,
// and whether the view names it (`named`: false beside the stretch that
// holds the waist, see propagatedFocus).
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
      if (!groups.has(key)) groups.set(key, { wl: path.wl, color: path.color || null, rays: [], beam: null });
      const group = groups.get(key);
      group.rays.push({ p: a, d: { x: (b.x - a.x) / len, y: (b.y - a.y) / len }, w, len, next: continuation(path, i), prev: arrival(path, i) });
      if (!group.beam && (group.beam = beamOnPathSegment(path, i))) group.beamLen = len;
    }
  }
  const foci = [];
  for (const group of groups.values()) {
    // The rays must converge to a focus for one to be drawn at all (a
    // collimated beam's own waist is not a focus); where the bundle carries a
    // propagated beam, its waist is drawn in place of the cone's.
    const cone = bundleFocus(group.rays, group.wl);
    if (!cone.ok) continue;
    const found = propagatedFocus(group) || cone;
    if (!found.ok || !inRegion(g, zoom, found.point)) continue;
    const real = group.rays.every(r => {
      const along = (found.point.x - r.p.x) * r.d.x + (found.point.y - r.p.y) * r.d.y;
      return along > ALONG_TOLERANCE && along <= r.len + ALONG_TOLERANCE;
    });
    // Every ray must pass through a cone's focus; a propagated waist was
    // placed on the beam's own axis (propagatedFocus).
    if (!real && found.model !== 'propagated') continue;
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
    // A focus that sits where the bundle's rays end, on an optic the same
    // light goes on through (a specimen plane, a window's face), is crossed
    // all the same: the beam travels on along the rays' next segments, so
    // the waist is drawn on both sides, cut at the face after that stretch.
    // Light that stops there, or turns back, is left as it was.
    // Only a plane the light crosses straight at the waist itself: every ray
    // ends on the waist (within a hundredth of w0, or the along tolerance)
    // and its next segment keeps its direction. A mirror, a lens or any
    // optic that turns the rays, and rays that end short of a waist further
    // on, are not crossed (the waist predicted past them is not where the
    // light goes). Only a cone estimate is carried on: a propagated waist,
    // or light that still carries a beam parameter past the plane (an ND
    // filter at the waist), is drawn by its own segments and would be drawn
    // twice.
    const atWaist = Math.max(ALONG_TOLERANCE, found.w0Mm / 100);
    const endsOnWaist = r => Math.hypot(r.p.x + r.len * r.d.x - found.point.x, r.p.y + r.len * r.d.y - found.point.y) <= atWaist;
    const straightOn = r => r.next && !r.next.beam && r.next.d.x * r.d.x + r.next.d.y * r.d.y >= 1 - STRAIGHT_TOLERANCE;
    let after = null;
    if (found.model !== 'propagated' && Number.isFinite(to) && to <= ALONG_TOLERANCE && group.rays.every(r => endsOnWaist(r) && straightOn(r))) {
      after = group.rays.map(r => r.next);
      to = -Infinity;
      for (const r of after) {
        const s0 = (r.p.x - found.point.x) * found.axis.x + (r.p.y - found.point.y) * found.axis.y;
        to = Math.max(to, s0 + r.len * (r.d.x * found.axis.x + r.d.y * found.axis.y));
      }
    }
    // A cone's focus lies between the optics; a propagated waist may lie
    // beyond them where propagatedFocus allows it, and its envelope is drawn
    // on the stretch the beam travels, cut at the faces as before.
    // A propagated waist's envelope stops where an edge clips the beam.
    if (found.model === 'propagated' && found.reachMm !== null) to = Math.min(to, found.reachMm - found.waistFromStartMm);
    if (![from, to].every(Number.isFinite) || !(from < to)) continue;
    if (found.model !== 'propagated' && !(from < 0 && to > 0)) continue;
    const across = p => (p.x - found.point.x) * -found.axis.y + (p.y - found.point.y) * found.axis.x;
    const outermost = group.rays.reduce((ends, r) => {
      const t = across(r.p);
      if (!ends.lo || t < ends.lo.t) ends.lo = { t, r };
      if (!ends.hi || t > ends.hi.t) ends.hi = { t, r };
      return ends;
    }, {});
    const endOf = r => ({ x: r.p.x + r.len * r.d.x, y: r.p.y + r.len * r.d.y });
    // The face after the focus: where the bundle ends, or, crossing on, where
    // the same outermost rays' next segments end.
    const last = r => (after ? r.next : r);
    const ends = [
      faceLine(outermost.lo.r.p, outermost.hi.r.p, found.point, found.axis, from),
      faceLine(endOf(last(outermost.lo.r)), endOf(last(outermost.hi.r)), found.point, found.axis, to),
    ];
    foci.push({
      point: found.point, axis: found.axis, w0Mm: found.w0Mm, zRMm: found.zRMm, na: found.na,
      from, to, ends, wl: group.wl, color: group.color || wavelengthToColor(group.wl),
      model: found.model || 'cone', estimate: found.estimate || null,
      // A propagated waist that another bundle's stretch holds is named
      // once, by that bundle.
      named: found.named !== false,
      // The bench already draws this beam's envelope (step G2), and the
      // view magnifies it: the waist is not drawn a second time.
      drawnAsEnvelope: found.model === 'propagated' && Boolean(group.beam?.drawnAsEnvelope),
    });
  }
  return foci;
}

// The waist of a bundle's propagated beam, in bundleFocus's shape, where the
// beam really forms it; null without a beam parameter, and { ok: false }
// where it does not (no waist is drawn there, neither the beam's nor a
// cone's). Each waist belongs to one bundle, the one whose stretch holds it,
// measured on the path that carries the beam parameter, from where its
// segment starts (included) to where it ends (excluded):
// - beside a face the light crosses straight carrying the beam parameter
//   (a filter), the waist is the neighbouring bundle's, which names it:
//   this bundle keeps its focus within a Rayleigh range of the face, as
//   before, but unnamed (`named: false`); its envelope is cut at that face
//   on the waist's side, which leaves it no more than a line;
// - beside a face that turns any of the rays (a lens, a mirror), the waist
//   is not where this light goes: behind the start it is virtual, past the
//   end the beam forms another waist, or none, and never this one;
// - past a face where the beam parameter ends, the light stopping there (a
//   fiber's end face, a pinhole's plate, a beam block) or going on straight
//   without one (a specimen plane), the waist is named only within
//   STOP_REACH Rayleigh ranges of it, where the face meets the waist;
// - behind a start that no beam parameter reaches straight, there is none.
function propagatedFocus(group) {
  const beam = group.beam;
  if (!beam) return null;
  const shape = beamFromQ(beam.q, { wavelengthNm: beam.wavelengthNm, m2: beam.m2, index: beam.index });
  if (!shape) return null;
  const along = shape.waistAheadMm;
  const length = group.beamLen;
  const straight = (r, other) => other.d.x * r.d.x + other.d.y * r.d.y >= 1 - STRAIGHT_TOLERANCE;
  let named = true;
  if (along < -ALONG_TOLERANCE) {
    const carriedIn = group.rays.every(r => r.prev && straight(r, r.prev)) && group.rays.some(r => r.prev.beam);
    if (!carriedIn || !(along > -shape.rayleighMm)) return { ok: false };
    named = false;
  } else if (!(along < length - ALONG_TOLERANCE)) {
    const goesOn = group.rays.filter(r => r.next);
    if (goesOn.some(r => !straight(r, r.next))) return { ok: false };
    if (goesOn.some(r => r.next.beam)) {
      if (!(along <= length + shape.rayleighMm)) return { ok: false };
      named = false;
    } else if (!(along <= length + STOP_REACH * shape.rayleighMm)) return { ok: false };
  }
  // An edge that clips the beam before its waist ends the beam parameter
  // there (as the probe and detectors read it): the zoom then keeps the cone
  // estimate. One that clips it past the waist leaves the waist, and the
  // envelope is drawn up to the edge (`reachMm`), as the bench's band is.
  const clipAt = beam.clipAt?.(Math.max(along, length)) ?? null;
  // Arms of the same light that overlap before the waist recombine there:
  // the readouts give no beam, and the zoom draws no waist, neither the
  // beam's nor a cone's, even where an edge clips the light afterwards. One
  // that begins past the waist ends its envelope.
  const overlapAt = beam.overlapAt ?? null;
  if (overlapAt !== null && overlapAt <= Math.max(0, along) && (clipAt === null || overlapAt <= clipAt)) return { ok: false };
  if (clipAt !== null && clipAt <= Math.max(0, along)) return null;
  const reach = [clipAt, overlapAt].filter(v => v !== null);
  return {
    ok: true, model: 'propagated', named, reachMm: reach.length ? Math.min(...reach) : null,
    point: { x: beam.p.x + beam.d.x * along, y: beam.p.y + beam.d.y * along }, axis: { ...beam.d }, waistFromStartMm: along,
    w0Mm: shape.waistUm / 1000, zRMm: shape.rayleighMm, na: Math.sin(Math.atan(shape.halfDivergenceMrad / 1000)),
    estimate: beam.estimate || null,
  };
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
// edges from `from` to `to` along the beam, measured from the focus, as the
// bench's beam envelope draws them (envelopeEdges), then cut along the
// optics' faces in `focus.ends`, when given.
export function focusEnvelope(focus, from, to, samples = 48) {
  // A cone's waist w0 = λ/(π·NA) takes NA as the sine of the cone's half
  // angle, while w(z) opens with slope w0/zR: drawn with the note's zR its
  // edges would open at atan(NA), inside the rays (32° against 39° at
  // NA 0.63). The outline is drawn with the slope of the outermost rays,
  // tan(asin NA), so it ends on them; the note keeps zR = π·w0²/λ.
  const drawn = focus.model === 'cone' && focus.na > 0 && focus.na < 1
    ? { ...focus, zRMm: focus.w0Mm / Math.tan(Math.asin(focus.na)) } : focus;
  const edges = envelopeEdges(drawn, from, to, samples);
  if (!edges) return [];
  let outline = edges.left.concat([...edges.right].reverse());
  for (const face of focus.ends || []) outline = clipToSide(outline, face);
  return outline.length >= 3 && outline.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) ? outline : [];
}
