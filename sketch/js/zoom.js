// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Zoom: a region of the bench drawn again, larger, somewhere else on the
// canvas. This module is the pure geometry — where the region and its view
// sit, the lines that join them, the scale bar — shared by the registry entry
// (frames only, for the palette and the placement ghost) and zoom-view.js,
// which fills the view with the magnified bench.
//
// Shapes are drawn in the zoom's drawing frame: centred on the element's
// origin and turned with it, so a rectangle or an ellipse can lie along a
// tilted beam. The view's offset (insetX, insetY) is kept in bench
// millimetres instead, so turning the region turns both shapes but does not
// swing the view around the bench. A rectangle or ellipse turned half a turn
// is the same shape, so the drawing frame is the element's local frame,
// turned a further half turn whenever that keeps the scale bar upright
// (`flip`); `turn` is then the frame's angle on the bench, within ±90°.

export const ZOOM_SHAPES = [['circle', 'Circle'], ['ellipse', 'Ellipse'], ['rect', 'Rectangle']];
export const ZOOM_REGION_MIN = 0.1;
export const ZOOM_REGION_MAX = 2000;
export const ZOOM_OFFSET_LIMIT = 5000;
const ZOOM_MAG_MAX = 1000;
// The longest side a view may reach. Past this an export is not a figure but
// a canvas the browser refuses to allocate.
const ZOOM_VIEW_MAX = 4000;
// Where a round view carries its scale bar, as a fraction of its half-height
// below the centre.
const ROUND_BAR_DEPTH = 0.72;

const finite = Number.isFinite;
const bounded = (value, lo, hi, fallback) => Math.min(hi, Math.max(lo, finite(value) ? value : fallback));
const num = value => Number(value.toFixed(4));

function regionSize(params = {}) {
  const shape = ZOOM_SHAPES.some(([key]) => key === params.shape) ? params.shape : 'circle';
  const w = bounded(params.w, ZOOM_REGION_MIN, ZOOM_REGION_MAX, 30);
  const h = shape === 'circle' ? w : bounded(params.h, ZOOM_REGION_MIN, ZOOM_REGION_MAX, 20);
  return { shape, w, h };
}

// A region several metres wide cannot also be magnified a thousand times;
// the bound follows the region so the view stays drawable. It sits on the
// field's 0.5 step, so a value clamped to it and rounded to the step is
// still within it.
export function zoomMaxMagnification(params = {}) {
  const { w, h } = regionSize(params);
  return Math.min(ZOOM_MAG_MAX, Math.max(1, Math.floor(2 * ZOOM_VIEW_MAX / Math.max(w, h)) / 2));
}

// The magnification and a set scale-bar length are bounded by the region.
// Left past its bound after the region grew, a field would read one value
// while the view draws another, and would come back if the region shrank
// again, unlike a reloaded scene. Every edit of the region runs this, as
// loading a scene does through the schema.
export function normalizeZoomParams(params = {}) {
  const { w } = regionSize(params);
  return {
    mag: bounded(params.mag, 1, zoomMaxMagnification(params), 4),
    scaleBarMm: bounded(params.scaleBarMm, 0, w, 0),
  };
}

function drawingFrame(rot) {
  const r = ((((finite(rot) ? rot : 0) % 360) + 540) % 360) - 180;
  const flip = r > 90 || r <= -90;
  return { flip, turn: flip ? (r > 0 ? r - 180 : r + 180) : r };
}

export function zoomGeometry(params = {}, rot = 0) {
  const { shape, w, h } = regionSize(params);
  const mag = bounded(params.mag, 1, zoomMaxMagnification({ shape, w, h }), 4);
  const { flip, turn } = drawingFrame(rot);
  const a = turn * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  const ox = bounded(params.insetX, -ZOOM_OFFSET_LIMIT, ZOOM_OFFSET_LIMIT, 110);
  const oy = bounded(params.insetY, -ZOOM_OFFSET_LIMIT, ZOOM_OFFSET_LIMIT, -90);
  return {
    shape, mag, rx: w / 2, ry: h / 2, turn, flip, cos, sin,
    ix: ox * cos + oy * sin, iy: -ox * sin + oy * cos,
    irx: mag * w / 2, iry: mag * h / 2,
  };
}

export const clampZoomOffset = value => bounded(value, -ZOOM_OFFSET_LIMIT, ZOOM_OFFSET_LIMIT, 0);

// A point in the element's local frame, in the drawing frame.
const drawn = (g, p) => (g.flip ? { x: -p.x, y: -p.y } : p);

// Bench point -> point in the view, in the drawing frame, for a zoom whose
// origin is `at`.
export function zoomMapper(g, at) {
  return p => {
    const dx = p.x - at.x, dy = p.y - at.y;
    return {
      x: g.ix + g.mag * (dx * g.cos + dy * g.sin),
      y: g.iy + g.mag * (-dx * g.sin + dy * g.cos),
    };
  };
}

// The two lines that join the region to its view: the outer edges of their
// convex hull. The view is the region scaled up, so for a rectangle these
// join corresponding corners, and for a circle or ellipse they are the
// common outer tangents. A view that swallows its region has none.
export function zoomConnectors(g) {
  if (g.shape === 'rect') return rectBridges(g);
  // Stretching y by rx/ry turns both ellipses into circles (they share an
  // aspect ratio) without breaking tangency; solve there and stretch back.
  const k = g.rx / g.ry;
  const cx = g.ix, cy = g.iy * k, r1 = g.rx, r2 = g.irx;
  const d = Math.hypot(cx, cy);
  if (!(d > r2 - r1 + 1e-9)) return [];
  const theta = Math.atan2(cy, cx), alpha = Math.acos((r1 - r2) / d);
  return [theta + alpha, theta - alpha].map(phi => {
    const nx = Math.cos(phi), ny = Math.sin(phi);
    return [{ x: r1 * nx, y: r1 * ny / k }, { x: cx + r2 * nx, y: (cy + r2 * ny) / k }];
  });
}

function rectBridges(g) {
  const corners = (cx, cy, rx, ry, view) => [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    .map(([sx, sy]) => ({ x: cx + sx * rx, y: cy + sy * ry, view }));
  const hull = convexHull([...corners(0, 0, g.rx, g.ry, false), ...corners(g.ix, g.iy, g.irx, g.iry, true)]);
  const bridges = [];
  hull.forEach((a, i) => {
    const b = hull[(i + 1) % hull.length];
    if (a.view !== b.view) bridges.push(a.view ? [b, a] : [a, b]);
  });
  return bridges.map(pair => pair.map(({ x, y }) => ({ x, y })));
}

function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = list => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out.at(-2), out.at(-1), p) <= 1e-9) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}

// Whether a point in the element's local frame falls inside the view, grown
// by `tolerance`.
export function zoomViewContains(params, local, tolerance = 0, rot = 0) {
  const g = zoomGeometry(params, rot);
  const p = drawn(g, local);
  const ax = g.irx + tolerance, ay = g.iry + tolerance;
  const dx = p.x - g.ix, dy = p.y - g.iy;
  if (g.shape === 'rect') return Math.abs(dx) <= ax && Math.abs(dy) <= ay;
  return (dx * dx) / (ax * ax) + (dy * dy) / (ay * ay) <= 1;
}

// The region is an outline over the bench: only its edge is grabbed, so the
// parts inside it stay selectable. The view is opaque and grabbed anywhere.
export function zoomHitTest(params, local, tolerance, rot = 0) {
  if (zoomViewContains(params, local, tolerance, rot)) return true;
  const g = zoomGeometry(params, rot);
  const p = drawn(g, local);
  if (g.shape === 'rect') {
    const inside = Math.abs(p.x) <= g.rx + tolerance && Math.abs(p.y) <= g.ry + tolerance;
    return inside && (Math.abs(Math.abs(p.x) - g.rx) <= tolerance || Math.abs(Math.abs(p.y) - g.ry) <= tolerance);
  }
  const rho = Math.hypot(p.x, p.y);
  if (rho < 1e-12) return Math.min(g.rx, g.ry) <= tolerance;
  const edge = 1 / Math.hypot(p.x / rho / g.rx, p.y / rho / g.ry);
  return Math.abs(rho - edge) <= tolerance;
}

// The view's box in the element's local frame, where it lies square with
// the element, for export bounds, fitting and the selection outline.
export function zoomViewBox(params, rot = 0) {
  const g = zoomGeometry(params, rot);
  const box = { x0: g.ix - g.irx, y0: g.iy - g.iry, x1: g.ix + g.irx, y1: g.iy + g.iry };
  return g.flip ? { x0: -box.x1, y0: -box.y1, x1: -box.x0, y1: -box.y0 } : box;
}

// Dragging a corner of the view sets the magnification: the opposite corner
// stays where it is on the bench and the view, which keeps the region's
// shape, grows or shrinks to meet the pointer. `params` are the zoom's at the
// start of the drag, `corner` is {sx, sy} (±1) in the element's local frame,
// and `point` is the pointer relative to the element's origin, on the bench.
// The magnification follows the pointer projected on the view's diagonal, so
// it changes smoothly whichever way the pointer leaves it; `snap` rounds it
// (to the field's step) before the view is placed, so the anchor stays exact.
export function zoomViewCornerDrag(params, rot, corner, point, snap = mag => mag) {
  const g = zoomGeometry(params);
  const a = (finite(rot) ? rot : 0) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  // Half the view's diagonal towards the dragged corner, per unit of
  // magnification, on the bench.
  const hx = corner.sx * g.rx * cos - corner.sy * g.ry * sin;
  const hy = corner.sx * g.rx * sin + corner.sy * g.ry * cos;
  const ox = bounded(params.insetX, -ZOOM_OFFSET_LIMIT, ZOOM_OFFSET_LIMIT, 110);
  const oy = bounded(params.insetY, -ZOOM_OFFSET_LIMIT, ZOOM_OFFSET_LIMIT, -90);
  const anchor = { x: ox - g.mag * hx, y: oy - g.mag * hy };
  const raw = ((point.x - anchor.x) * hx + (point.y - anchor.y) * hy) / (2 * (hx * hx + hy * hy));
  const mag = bounded(snap(bounded(raw, 1, zoomMaxMagnification(params), g.mag)), 1, zoomMaxMagnification(params), g.mag);
  return {
    mag,
    insetX: clampZoomOffset(anchor.x + mag * hx),
    insetY: clampZoomOffset(anchor.y + mag * hy),
  };
}

// A length in millimetres as a person writes it on a scale bar.
export function formatLength(mm) {
  const [value, unit] = mm >= 1 ? [mm, 'mm'] : mm >= 1e-3 ? [mm * 1e3, 'µm'] : [mm * 1e6, 'nm'];
  return `${Number(value.toPrecision(3))} ${unit}`;
}

// A round length for an automatic scale bar, for a region `regionWidthMm`
// across. It reads in bench millimetres, so the answer is what the bar
// stands for on the bench, before magnification: the largest 1, 2 or 5
// times a power of ten that is at most a quarter of the region, so the bar
// spans between a tenth and a quarter of the view. One significant figure
// keeps 2e-5 from printing as 0.000019999999999999998.
export function niceScaleBarLength(regionWidthMm) {
  if (!(regionWidthMm > 0)) return 0;
  const target = regionWidthMm / 4;
  const power = 10 ** Math.floor(Math.log10(target));
  const step = [5, 2, 1].find(m => m * power <= target * (1 + 1e-9)) ?? 1;
  return Number((step * power).toPrecision(1));
}

// The bar's placement in the view, in the drawing frame, or null when it is
// off or cannot fit. A bar asked to be longer than the view can hold is
// shortened, and its label always names the length actually drawn. It lies
// along the region's width, so on a turned rectangle it follows the beam
// the rectangle was laid along.
//
// The bar and its label must fit the view's height too. Above the bar's
// baseline `y` they take its thickness, the gap to the label and the label's
// ascent (about 1.43 font); a rectangle also keeps a pad below. A view too
// low for that shrinks the font with it, and one too low for a readable
// label carries no bar at all.
export function zoomScaleBar(params = {}, rot = 0) {
  if (params.scaleBar === false) return null;
  const g = zoomGeometry(params, rot);
  const round = g.shape !== 'rect';
  // A round view keeps the label's top within 0.9 of its half-height above
  // the centre; the bar itself sits ROUND_BAR_DEPTH below it.
  const tallest = round ? (ROUND_BAR_DEPTH + 0.9) * g.iry / 1.43 : 2 * g.iry / (1.43 + 0.9);
  const font = Math.min(14, Math.max(6, 0.16 * Math.min(g.irx, g.iry)), tallest);
  if (!(font >= 3)) return null;
  const pad = 0.9 * font, thickness = 0.28 * font;
  const room = round ? 2 * g.irx * Math.sqrt(1 - ROUND_BAR_DEPTH ** 2) - 2 * pad : 2 * g.irx - 2 * pad;
  const asked = params.scaleBarMm > 0 ? params.scaleBarMm : niceScaleBarLength(2 * g.rx);
  const mm = Math.min(finite(asked) ? asked : 0, room / g.mag);
  if (!(mm > 0)) return null;
  const length = mm * g.mag;
  const y = round ? g.iy + ROUND_BAR_DEPTH * g.iry : g.iy + g.iry - pad;
  const x1 = round ? g.ix - length / 2 : g.ix + g.irx - pad - length;
  return { mm, label: formatLength(mm), x1, x2: x1 + length, y, top: y - 1.43 * font, thickness, font };
}

function shapeSVG(shape, cx, cy, rx, ry, attrs) {
  return shape === 'rect'
    ? `<rect x="${num(cx - rx)}" y="${num(cy - ry)}" width="${num(2 * rx)}" height="${num(2 * ry)}" ${attrs}/>`
    : `<ellipse cx="${num(cx)}" cy="${num(cy)}" rx="${num(rx)}" ry="${num(ry)}" ${attrs}/>`;
}

function scaleBarSVG(bar) {
  if (!bar) return '';
  const halo = `stroke="#ffffff" stroke-width="${num(0.22 * bar.font)}" paint-order="stroke"`;
  return `<g data-zoom-scalebar="true" fill="#1f2937">` +
    `<rect x="${num(bar.x1)}" y="${num(bar.y - bar.thickness)}" width="${num(bar.x2 - bar.x1)}" height="${num(bar.thickness)}" ${halo}/>` +
    `<text x="${num((bar.x1 + bar.x2) / 2)}" y="${num(bar.y - bar.thickness - 0.4 * bar.font)}" text-anchor="middle" font-size="${num(bar.font)}" font-weight="600" ${halo}>${bar.label}</text></g>`;
}

// The whole zoom in the element's local frame. `content` is the magnified
// bench, already in the drawing frame; without it (palette, placement ghost)
// the view is an empty frame.
export function zoomFrameSVG(params = {}, { content = '', background = '#ffffff', clipId = 'zoom-view', rot = 0 } = {}) {
  const g = zoomGeometry(params, rot);
  const color = params.frameColor || '#475569';
  const regionDash = params.regionDash ? ' stroke-dasharray="6 4"' : '';
  const connectorDash = params.connectorDash ? ' stroke-dasharray="5 4"' : '';
  let s = shapeSVG(g.shape, 0, 0, g.rx, g.ry, `fill="none" stroke="${color}" stroke-width="1.2"${regionDash} data-zoom-frame="region"`);
  if (params.connectors !== false) {
    for (const [a, b] of zoomConnectors(g)) {
      s += `<line x1="${num(a.x)}" y1="${num(a.y)}" x2="${num(b.x)}" y2="${num(b.y)}" stroke="${color}" stroke-width="1" opacity="0.75"${connectorDash} data-zoom-frame="connector"/>`;
    }
  }
  s += shapeSVG(g.shape, g.ix, g.iy, g.irx, g.iry, `fill="${background}" stroke="none"`);
  if (content) {
    s += `<clipPath id="${clipId}">${shapeSVG(g.shape, g.ix, g.iy, g.irx, g.iry, '')}</clipPath>` +
      `<g clip-path="url(#${clipId})">${content}</g>`;
  }
  // The view's border is the region's outline enlarged, so it is dashed with it.
  s += shapeSVG(g.shape, g.ix, g.iy, g.irx, g.iry, `fill="none" stroke="${color}" stroke-width="1.5"${regionDash} data-zoom-frame="view"`);
  // A circle has no width to lie along: its bar stays level on the bench,
  // turned back about the view's centre, which keeps it inside the circle.
  const bar = scaleBarSVG(zoomScaleBar(params, rot));
  s += g.shape === 'circle' && bar && g.turn
    ? `<g transform="rotate(${num(-g.turn)} ${num(g.ix)} ${num(g.iy)})">${bar}</g>` : bar;
  return g.flip ? `<g transform="rotate(180)">${s}</g>` : s;
}
