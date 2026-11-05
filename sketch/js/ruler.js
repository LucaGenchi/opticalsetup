// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The ruler annotation: a dimension line that measures a distance on the
// bench, or two arms from a vertex that measure the angle between them. It
// is diagram-only (the registry gives it no surfaces), so it never touches a
// ray. Everything here is DOM-free, so the canvas, the export and the tests
// share one geometry.
//
// Local frame (the element's own, before el.rot is applied; y points down,
// as on the canvas):
//   distance: the two ends sit at (−len/2, 0) and (+len/2, 0);
//   angle:    the vertex is the origin, arm 1 runs along +x, and arm 2 is
//             turned `angle` degrees from it, positive counterclockwise as
//             seen on screen.

import { formulaSpans, markdownLayout, markdownTextSVG } from './markdown.js';
import { esc } from './util.js';

export const RULER_MODES = [['distance', 'Distance'], ['angle', 'Angle']];
export const RULER_LENGTH_MIN = 0.1;
export const RULER_LENGTH_MAX = 5000;
export const RULER_VALUE_TOKEN = '{value}';

const DEG = Math.PI / 180;
const finite = Number.isFinite;
const clamp = (value, lo, hi, fallback) => (finite(value) ? Math.min(hi, Math.max(lo, value)) : fallback);
const lengthOf = (value, fallback) => clamp(value, RULER_LENGTH_MIN, RULER_LENGTH_MAX, fallback);
const normalDegrees = value => ((value % 360) + 360) % 360;

// A signed angle folded into (−180, 180].
function signedDegrees(value) {
  const a = normalDegrees(value);
  return a > 180 ? a - 360 : a;
}

function settings(params = {}) {
  return {
    mode: params.mode === 'angle' ? 'angle' : 'distance',
    len: lengthOf(params.len, 100),
    armA: lengthOf(params.armA, 80),
    armB: lengthOf(params.armB, 80),
    angle: clamp(params.angle, -180, 180, 45),
    decimals: Math.round(clamp(params.decimals, 0, 3, 1)),
    width: clamp(params.width, 0.25, 8, 1.2),
    fontSize: clamp(params.fontSize, 6, 72, 12),
    fill: typeof params.fill === 'string' ? params.fill : '#334155',
    arrows: params.arrows !== false,
    ticks: params.ticks === true,
    below: params.labelSide === 'below',
    text: typeof params.text === 'string' ? params.text : RULER_VALUE_TOKEN,
  };
}

// The measured points in the local frame: the two ends, or the vertex
// followed by the tips of arm 1 and arm 2. These are also the handles the
// canvas offers for dragging.
export function rulerPoints(params = {}) {
  const s = settings(params);
  if (s.mode === 'distance') return [{ x: -s.len / 2, y: 0 }, { x: s.len / 2, y: 0 }];
  const t = s.angle * DEG;
  return [{ x: 0, y: 0 }, { x: s.armA, y: 0 }, { x: s.armB * Math.cos(t), y: -s.armB * Math.sin(t) }];
}

const toWorld = (el, p) => {
  const a = (el.rot || 0) * DEG;
  return { x: el.x + p.x * Math.cos(a) - p.y * Math.sin(a), y: el.y + p.x * Math.sin(a) + p.y * Math.cos(a) };
};

// The placement and params that put the measured points at `world` (bench
// coordinates, in the order rulerPoints() gives them). Null when the points
// do not define a ruler: two ends on top of each other, or an arm of zero
// length, has no direction to measure along. The geometry is kept exact,
// never rounded, so a handle that is not dragged stays where it was put (on
// a component it was snapped to); the inspector rounds only what it shows.
export function rulerFromWorldPoints(mode, world) {
  if (!Array.isArray(world) || world.some(p => !finite(p?.x) || !finite(p?.y))) return null;
  if (mode === 'angle') {
    if (world.length !== 3) return null;
    const [v, a, b] = world;
    const ax = a.x - v.x, ay = a.y - v.y, bx = b.x - v.x, by = b.y - v.y;
    const armA = Math.hypot(ax, ay), armB = Math.hypot(bx, by);
    if (armA < RULER_LENGTH_MIN || armB < RULER_LENGTH_MIN) return null;
    if (armA > RULER_LENGTH_MAX || armB > RULER_LENGTH_MAX) return null;
    // y points down, so a turn that looks counterclockwise has a negative
    // cross product.
    const angle = -Math.atan2(ax * by - ay * bx, ax * bx + ay * by) / DEG;
    return {
      x: v.x, y: v.y, rot: normalDegrees(Math.atan2(ay, ax) / DEG),
      params: { armA, armB, angle: signedDegrees(angle) },
    };
  }
  if (world.length !== 2) return null;
  const [a, b] = world;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < RULER_LENGTH_MIN || len > RULER_LENGTH_MAX) return null;
  return {
    x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
    rot: normalDegrees(Math.atan2(b.y - a.y, b.x - a.x) / DEG),
    params: { len },
  };
}

// Moving one handle to `local` (in the frame of `el` as it was when the drag
// began) while every other handle stays where it is on the bench.
export function rulerEditCandidate(el, index, local) {
  if (!el || !Number.isInteger(index) || !finite(local?.x) || !finite(local?.y)) return null;
  const points = rulerPoints(el.params);
  if (!points[index]) return null;
  const world = points.map(p => toWorld(el, p));
  world[index] = toWorld(el, local);
  return rulerFromWorldPoints(el.params?.mode === 'angle' ? 'angle' : 'distance', world);
}

// The handle a Shift-drag keeps to 45° steps around: the other end of a
// distance, or the vertex for an arm. The vertex itself has no partner and
// keeps to steps around where it started.
export function rulerConstrainOrigin(el, index) {
  const points = rulerPoints(el?.params);
  if (el?.params?.mode === 'angle') return index === 0 ? null : points[0];
  return points[1 - index] ?? null;
}

// What the ruler measures: a length in bench millimetres, or the angle
// between the arms (0 to 180°; the sign only says which way arm 2 opens).
export function rulerMeasurement(params = {}) {
  const s = settings(params);
  return s.mode === 'angle'
    ? { kind: 'angle', value: Math.abs(s.angle), unit: '°' }
    : { kind: 'distance', value: s.len, unit: 'mm' };
}

export function rulerValueText(params = {}, { tex = false } = {}) {
  const s = settings(params);
  const m = rulerMeasurement(params);
  const number = m.value.toFixed(s.decimals);
  if (m.kind === 'angle') return tex ? `${number}\\degree` : `${number}°`;
  return tex ? `${number}\\,\\mathrm{mm}` : `${number} mm`;
}

// The label as Markdown: {value} becomes the measurement. Inside a formula
// it is written as TeX, so "$d = {value}$" sets the unit upright rather than
// as the italic variables m·m. Formulas are found line by line with the
// renderer's own rules (formulaSpans), so the text between two formulas, as
// in "$x$ = {value}; $y$", is never mistaken for one.
export function rulerLabelText(params = {}) {
  const s = settings(params);
  if (!s.text.includes(RULER_VALUE_TOKEN)) return s.text;
  const tex = rulerValueText(params, { tex: true });
  const plain = rulerValueText(params);
  const fill = (part, value) => part.split(RULER_VALUE_TOKEN).join(value);
  return s.text.split('\n').map(line => {
    let out = '', cursor = 0;
    for (const span of formulaSpans(line)) {
      out += fill(line.slice(cursor, span.start), plain) + fill(line.slice(span.start, span.end), tex);
      cursor = span.end;
    }
    return out + fill(line.slice(cursor), plain);
  }).join('\n');
}

// The tick spacing for a graduated ruler: a 1-2-5 step giving about ten
// divisions over the length.
export function rulerTickStep(len) {
  const raw = lengthOf(len, 100) / 10;
  const power = 10 ** Math.floor(Math.log10(raw));
  const mantissa = raw / power;
  return (mantissa < 1.5 ? 1 : mantissa < 3.5 ? 2 : mantissa < 7.5 ? 5 : 10) * power;
}

const barHalf = s => 4 + 1.5 * s.width;

// Where the label goes, in the local frame: its centre, its size, and the
// turn that keeps it readable. A distance label runs along the line, turned
// half a revolution when the line points leftwards so it never reads upside
// down; an angle label stays level on screen, out along the bisector.
function labelPlacement(s, rot, text) {
  if (!text.trim()) return null;
  // The drawn text runs from the smallest line indent to the farthest line
  // end; a centred $$display$$ line is indented inside the layout's width.
  const layout = markdownLayout(text, s.fontSize);
  const left = Math.min(...layout.lines.map(line => line.indent || 0));
  const right = Math.max(...layout.lines.map(line => (line.indent || 0) + line.width));
  const width = Math.max(1, right - left);
  const height = layout.height;
  const r = normalDegrees(rot);
  if (s.mode === 'distance') {
    const flipped = r > 90 && r <= 270;
    const side = (s.below ? 1 : -1) * (flipped ? -1 : 1);
    const gap = barHalf(s) + 2;
    return { cx: 0, cy: side * (gap + height / 2), left, width, height, turn: flipped ? 180 : 0 };
  }
  const radius = arcRadius(s);
  const half = s.angle * DEG / 2;
  // Far enough out that the level box clears the arc in any direction.
  const reach = radius + 4 + Math.hypot(width, height) / 2;
  return { cx: reach * Math.cos(half), cy: -reach * Math.sin(half), left, width, height, turn: -r };
}

const arcRadius = s => Math.max(6, Math.min(40, 0.35 * Math.min(s.armA, s.armB)));

// The label's four corners in the local frame.
function labelCorners(place) {
  const t = place.turn * DEG, c = Math.cos(t), n = Math.sin(t);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const x = sx * place.width / 2, y = sy * place.height / 2;
    return { x: place.cx + x * c - y * n, y: place.cy + x * n + y * c };
  });
}

// Everything the ruler draws, as a box in its local frame: the selection box,
// the hit area's outer limit and the export bounds all come from here.
export function rulerLocalBounds(params = {}, rot = 0) {
  const s = settings(params);
  const pts = rulerPoints(params);
  const bar = barHalf(s);
  const extra = s.mode === 'distance'
    ? [{ x: pts[0].x, y: -bar }, { x: pts[1].x, y: bar }]
    : [{ x: -arcRadius(s), y: -arcRadius(s) }, { x: arcRadius(s), y: arcRadius(s) }];
  const place = labelPlacement(s, rot, rulerLabelText(params));
  const all = [...pts, ...extra, ...(place ? labelCorners(place) : [])];
  const xs = all.map(p => p.x), ys = all.map(p => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function insideLabel(place, p, tolerance) {
  const t = -place.turn * DEG, c = Math.cos(t), n = Math.sin(t);
  const dx = p.x - place.cx, dy = p.y - place.cy;
  const x = dx * c - dy * n, y = dx * n + dy * c;
  return Math.abs(x) <= place.width / 2 + tolerance && Math.abs(y) <= place.height / 2 + tolerance;
}

// Only the drawn lines and the label are grabbable, so whatever an angle
// ruler encloses -- a mirror between its arms -- stays selectable.
export function rulerHitTest(params, local, tolerance = 4, rot = 0) {
  if (!finite(local?.x) || !finite(local?.y)) return false;
  const s = settings(params);
  const pts = rulerPoints(params);
  const near = tolerance + s.width / 2 + 2;
  if (s.mode === 'distance') {
    const bar = barHalf(s);
    if (distToSegment(local, pts[0], pts[1]) <= near) return true;
    if (pts.some(p => distToSegment(local, { x: p.x, y: -bar }, { x: p.x, y: bar }) <= near)) return true;
  } else {
    if (distToSegment(local, pts[0], pts[1]) <= near || distToSegment(local, pts[0], pts[2]) <= near) return true;
    const r = Math.hypot(local.x, local.y);
    const a = -Math.atan2(local.y, local.x) / DEG;
    const lo = Math.min(0, s.angle), hi = Math.max(0, s.angle);
    if (Math.abs(r - arcRadius(s)) <= near && a >= lo - 1 && a <= hi + 1) return true;
  }
  const place = labelPlacement(s, rot, rulerLabelText(params));
  return !!place && insideLabel(place, local, tolerance);
}

const n2 = value => +value.toFixed(2);

function arrowHead(tip, dirX, length, half, fill) {
  return `<path d="M ${n2(tip)},0 L ${n2(tip - dirX * length)},${n2(-half)} L ${n2(tip - dirX * length)},${n2(half)} Z" fill="${fill}"/>`;
}

export function rulerSVG(params = {}, { rot = 0 } = {}) {
  const s = settings(params);
  const fill = esc(s.fill);
  const stroke = `stroke="${fill}" stroke-width="${s.width}" stroke-linecap="round"`;
  const pts = rulerPoints(params);
  let out = '';
  if (s.mode === 'distance') {
    const half = s.len / 2, bar = barHalf(s);
    const headLength = 4 + 2 * s.width, headHalf = 1.6 + 0.8 * s.width;
    const arrows = s.arrows && s.len > 2.5 * headLength;
    const inset = arrows ? headLength - 0.5 : 0;
    out += `<line x1="${n2(-half + inset)}" y1="0" x2="${n2(half - inset)}" y2="0" ${stroke}/>`;
    out += `<line x1="${n2(-half)}" y1="${n2(-bar)}" x2="${n2(-half)}" y2="${n2(bar)}" ${stroke}/>` +
      `<line x1="${n2(half)}" y1="${n2(-bar)}" x2="${n2(half)}" y2="${n2(bar)}" ${stroke}/>`;
    if (arrows) out += arrowHead(-half, -1, headLength, headHalf, fill) + arrowHead(half, 1, headLength, headHalf, fill);
    if (s.ticks) {
      const step = rulerTickStep(s.len);
      const count = Math.floor(s.len / step + 1e-9);
      let ticks = '';
      for (let i = 1; i <= count; i++) {
        const x = -half + i * step;
        if (half - x < step * 0.05) continue;
        const h = (i % 5 === 0 ? 0.8 : 0.5) * bar;
        ticks += `M ${n2(x)},${n2(-h)} V 0 `;
      }
      if (ticks) out += `<path d="${ticks.trim()}" fill="none" stroke="${fill}" stroke-width="${n2(Math.max(0.4, s.width * 0.7))}"/>`;
    }
  } else {
    const [v, a, b] = pts;
    const r = arcRadius(s);
    const t = s.angle * DEG;
    out += `<line x1="0" y1="0" x2="${n2(a.x)}" y2="${n2(a.y)}" ${stroke}/>` +
      `<line x1="0" y1="0" x2="${n2(b.x)}" y2="${n2(b.y)}" ${stroke}/>`;
    if (Math.abs(s.angle) > 1e-6) {
      // A counterclockwise turn on screen runs against SVG's sweep direction
      // (y points down), so a positive angle takes sweep-flag 0.
      out += `<path d="M ${n2(r)},0 A ${n2(r)} ${n2(r)} 0 0 ${s.angle > 0 ? 0 : 1} ${n2(r * Math.cos(t))},${n2(-r * Math.sin(t))}" fill="none" stroke="${fill}" stroke-width="${n2(Math.max(0.5, s.width * 0.85))}"/>`;
    }
    out += `<circle cx="${v.x}" cy="${v.y}" r="${n2(1 + 0.6 * s.width)}" fill="${fill}"/>`;
  }
  const text = rulerLabelText(params);
  const place = labelPlacement(s, rot, text);
  if (place) {
    out += `<g class="ruler-label" transform="translate(${n2(place.cx)} ${n2(place.cy)}) rotate(${n2(place.turn)}) translate(${n2(-place.left - place.width / 2)} 0)">` +
      markdownTextSVG(text, { fontSize: s.fontSize, fill: s.fill }) + '</g>';
  }
  // Marked so the dark theme can lighten the default colour on the canvas.
  return `<g data-ruler="true">${out}</g>`;
}
