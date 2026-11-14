// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The Poincaré sphere a polarimeter draws: one normalized Stokes vector
// (S1, S2, S3)/S0 plotted in a fixed oblique view. DOM-free, so the detector
// screen, the inspector and the tests share one drawing.
//
// Axes follow the readout's own basis (docs/model-details.md, "Polarization
// basis"): +S1 is linear 0° (p), +S2 linear 45°, +S3 right circular (Born
// and Wolf). Fully polarized light sits on the surface; partly polarized
// light sits inside, at a radius equal to its degree of polarization;
// unpolarized light sits at the centre.

import { esc } from './util.js';

// Seen from 35° round from +S1 towards +S2 and 22° above the equator: +S1
// comes out of the page to the lower left, +S2 points right, +S3 up, the
// usual textbook view. All three positive half-axes face the viewer.
export const POINCARE_VIEW = Object.freeze({ azimuthDeg: 35, elevationDeg: 22 });

const AZ = POINCARE_VIEW.azimuthDeg * Math.PI / 180;
const EL = POINCARE_VIEW.elevationDeg * Math.PI / 180;

// Orthographic projection of a point of the unit ball. x and y are screen
// coordinates in sphere radii (y up), depth > 0 faces the viewer.
export function projectPoincare(s1, s2, s3) {
  return {
    x: -s1 * Math.sin(AZ) + s2 * Math.cos(AZ),
    y: -s1 * Math.sin(EL) * Math.cos(AZ) - s2 * Math.sin(EL) * Math.sin(AZ) + s3 * Math.cos(EL),
    depth: s1 * Math.cos(EL) * Math.cos(AZ) + s2 * Math.cos(EL) * Math.sin(AZ) + s3 * Math.sin(EL),
  };
}

const finite = value => (Number.isFinite(value) ? value : 0);

// The point plotted for a reading, or null when there is no measured vector
// to plot. A vector longer than 1 (round-off) is pulled back to the surface;
// anything non-finite reads as 0 so nothing non-finite reaches the drawing.
export function poincarePoint(stokes) {
  if (!stokes || typeof stokes !== 'object') return null;
  let s1 = finite(stokes.s1), s2 = finite(stokes.s2), s3 = finite(stokes.s3);
  const length = Math.hypot(s1, s2, s3);
  if (length > 1) { s1 /= length; s2 /= length; s3 /= length; }
  return { s1, s2, s3, degree: Math.min(1, length) };
}

// Two palettes. 'screen' writes the instrument colours inline, so a detector
// screen looks the same on the canvas and in an exported figure. 'css' writes
// class names only, so the inspector follows the light and dark themes.
const SCREEN = {
  sphere: 'fill="#0b2431" stroke="#4f6f80" stroke-width="0.55"',
  front: 'fill="none" stroke="#4f6f80" stroke-width="0.45"',
  back: 'fill="none" stroke="#35505e" stroke-width="0.4" stroke-dasharray="1 1"',
  axis: 'stroke="#7f99a8" stroke-width="0.5"',
  axisBack: 'stroke="#46606e" stroke-width="0.4" stroke-dasharray="0.9 0.9"',
  label: 'fill="#9eb5c3" font-weight="700"',
  vector: 'stroke="#f9a8d4" stroke-width="0.9"',
  vectorBack: 'stroke="#f9a8d4" stroke-width="0.8" stroke-dasharray="1.2 0.9"',
  drop: 'stroke="#f9a8d4" stroke-width="0.4" stroke-dasharray="0.8 0.8" opacity="0.75"',
  point: 'fill="#f9a8d4" stroke="#fff" stroke-width="0.5"',
  pointBack: 'fill="#061822" stroke="#f9a8d4" stroke-width="0.7"',
};
const cssPalette = new Proxy({}, { get: (_, role) => `class="ps-${String(role).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}"` });

const n = value => (Math.round(value * 100) / 100 + 0).toString();

// A great circle through the unit vectors u and v, split into the parts in
// front of and behind the sphere's silhouette, as SVG path data.
function greatCircle(u, v, cx, cy, r) {
  const steps = 96, front = [], back = [];
  let previous = null;
  for (let index = 0; index <= steps; index++) {
    const t = 2 * Math.PI * index / steps, c = Math.cos(t), s = Math.sin(t);
    const p = projectPoincare(u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s);
    const side = p.depth >= 0 ? front : back, point = `${n(cx + r * p.x)},${n(cy - r * p.y)}`;
    side.push(`${previous === side ? 'L' : 'M'}${point}`);
    // A segment that crosses the silhouette starts the other side's path at
    // the same point, so the two halves meet without a gap.
    if (previous && previous !== side) previous.push(`L${point}`);
    previous = side;
  }
  return { front: front.join(' '), back: back.join(' ') };
}

/**
 * SVG markup (a <g>) for a Poincaré sphere.
 * @param {{s1:number,s2:number,s3:number}|null} stokes normalized Stokes vector, or null for "no state"
 * @param {{cx?:number, cy?:number, r?:number, palette?:'screen'|'css', meridians?:boolean, labels?:'short'|'full', fontSize?:number}} options
 */
export function poincareSphereSVG(stokes, options = {}) {
  const cx = finite(options.cx), cy = finite(options.cy);
  const r = Math.max(1, Number.isFinite(options.r) ? options.r : 10);
  const p = options.palette === 'css' ? cssPalette : SCREEN;
  const fontSize = Math.max(1, Number.isFinite(options.fontSize) ? options.fontSize : r * 0.32);
  const full = options.labels === 'full';
  const at = (s1, s2, s3, scale = 1) => {
    const q = projectPoincare(s1 * scale, s2 * scale, s3 * scale);
    return { x: cx + r * q.x, y: cy - r * q.y, depth: q.depth };
  };
  const parts = [`<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${p.sphere}/>`];
  const circles = [[[1, 0, 0], [0, 1, 0]]];
  if (options.meridians) circles.push([[1, 0, 0], [0, 0, 1]], [[0, 1, 0], [0, 0, 1]]);
  const paths = circles.map(([u, v]) => greatCircle(u, v, cx, cy, r));
  for (const path of paths) if (path.back) parts.push(`<path d="${path.back}" ${p.back}/>`);
  // Negative half-axes lie behind the centre in this view: dashed.
  const axes = [
    { v: [1, 0, 0], label: full ? 'S₁ 0°' : 'S1', anchor: 'end', dy: 0.9 },
    { v: [0, 1, 0], label: full ? 'S₂ 45°' : 'S2', anchor: 'start', dy: 0.35 },
    { v: [0, 0, 1], label: full ? 'S₃ R' : 'S3', anchor: 'middle', dy: -0.25 },
  ];
  for (const axis of axes) {
    const end = at(-axis.v[0], -axis.v[1], -axis.v[2]);
    parts.push(`<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(end.x)}" y2="${n(end.y)}" ${p.axisBack}/>`);
  }
  for (const path of paths) if (path.front) parts.push(`<path d="${path.front}" ${p.front}/>`);
  for (const axis of axes) {
    const end = at(...axis.v, 1.12), tip = at(...axis.v, 1.2);
    parts.push(`<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(end.x)}" y2="${n(end.y)}" ${p.axis}/>`);
    parts.push(`<text x="${n(tip.x)}" y="${n(tip.y + axis.dy * fontSize)}" text-anchor="${axis.anchor}" font-size="${n(fontSize)}" ${p.label}>${esc(axis.label)}</text>`);
  }
  if (full) {
    const south = at(0, 0, -1, 1.2);
    parts.push(`<text x="${n(south.x)}" y="${n(south.y + fontSize * 0.95)}" text-anchor="middle" font-size="${n(fontSize)}" ${p.label}>L</text>`);
  }
  const point = poincarePoint(stokes);
  if (point) {
    const tip = at(point.s1, point.s2, point.s3), behind = tip.depth < 0;
    // The drop to the equatorial plane shows how far the state sits above or
    // below it, which a single projected dot cannot.
    if (Math.abs(point.s3) > 0.02) {
      const foot = at(point.s1, point.s2, 0);
      parts.push(`<line x1="${n(tip.x)}" y1="${n(tip.y)}" x2="${n(foot.x)}" y2="${n(foot.y)}" ${p.drop}/>`);
      if (Math.hypot(point.s1, point.s2) > 0.02) parts.push(`<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(foot.x)}" y2="${n(foot.y)}" ${p.drop}/>`);
    }
    if (point.degree > 0.02) parts.push(`<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(tip.x)}" y2="${n(tip.y)}" ${behind ? p.vectorBack : p.vector}/>`);
    parts.push(`<circle cx="${n(tip.x)}" cy="${n(tip.y)}" r="${n(Math.max(0.8, r * 0.11))}" ${behind ? p.pointBack : p.point} data-poincare-point="${n(point.s1)},${n(point.s2)},${n(point.s3)}"/>`);
  }
  return `<g data-poincare="${point ? 'state' : 'none'}">${parts.join('')}</g>`;
}
