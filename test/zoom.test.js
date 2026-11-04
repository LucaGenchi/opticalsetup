// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, getVisualBounds, isRotatable, registry } from '../sketch/js/elements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';
import { buildSVG } from '../sketch/js/export.js';
import {
  formatLength, niceScaleBarLength, zoomConnectors, zoomFrameSVG, zoomGeometry, zoomHitTest, zoomMaxMagnification,
  normalizeZoomParams, zoomMapper, zoomScaleBar, zoomViewBox, zoomViewCorner, zoomViewCornerDrag,
} from '../sketch/js/zoom.js';
import { zoomPulsePlacement, zoomSceneSVG } from '../sketch/js/zoom-view.js';

const lineLaser = (x, y) => {
  const laser = createElement('cwlaser', x, y);
  laser.params.beamMode = 'line';
  return laser;
};
const view = (zoom, elements, opts = {}) =>
  zoomSceneSVG(zoom, { drawables: traceScene(elements, []).drawables, elements, ...opts });
// The magnified bench only, between the view's clip group and its border.
const viewContent = svg => svg.match(/<g clip-path="[^"]+">([\s\S]*)<\/g><(?:ellipse|rect)[^>]*data-zoom-frame="view"/)?.[1] ?? '';

test('a zoom is diagram-only: rays and readings are the same with or without it', () => {
  const laser = createElement('cwlaser', 0, 0);
  const detector = createElement('detector', 300, 0);
  const zoom = createElement('zoom', 150, 0);
  assert.deepEqual(registry.zoom.surfaces(zoom), []);
  const bare = traceScene([laser, detector], []).drawables;
  const plainReading = detectorReading(detector.id).signal;
  const zoomed = traceScene([laser, zoom, detector], []).drawables;
  assert.deepEqual(zoomed, bare);
  assert.equal(detectorReading(detector.id).signal, plainReading);
});

test('the view redraws rays at the magnification and keeps their line weight', () => {
  const laser = lineLaser(0, 2);
  const zoom = createElement('zoom', 200, 0);
  Object.assign(zoom.params, { mag: 5, insetX: 0, insetY: 120 });
  const svg = view(zoom, [laser, zoom]);
  // y = 2 on the bench lands 5 × 2 below the view's centre.
  const ray = viewContent(svg).match(/<polyline points="([^"]+)"[^>]*stroke-width="([^"]+)"/);
  assert.ok(ray, 'the ray crossing the region is drawn in the view');
  const ys = ray[1].split(' ').map(pair => Number(pair.split(',')[1]));
  assert.ok(ys.every(y => Math.abs(y - 130) < 1e-6), `ray at local y 130, got ${ys}`);
  const traced = traceScene([laser], []).drawables.find(d => d.type === 'path');
  assert.equal(Number(ray[2]), traced.w, 'a ray keeps its bench stroke width');
});

test('components in the region grow, their outlines keep the bench weight', () => {
  const lens = createElement('lens', 200, 0);
  const zoom = createElement('zoom', 200, 0);
  Object.assign(zoom.params, { w: 40, mag: 4 });
  const bench = Number(registry.lens.svg(lens).match(/stroke-width="([^"]+)"/)[1]);
  const content = viewContent(view(zoom, [lens, zoom]));
  assert.match(content, /scale\(4\)/);
  assert.ok(content.includes(`stroke-width="${Number((bench / 4).toPrecision(4))}"`),
    'stroke widths are divided by the magnification under scale(4)');
});

test('only the region is redrawn: distant parts, notes and canvas-only parts stay out', () => {
  const zoom = createElement('zoom', 200, 0);
  const far = createElement('detector', 700, 0);
  const note = createElement('textlabel', 195, 0);
  note.params.text = 'NOTE-INSIDE';
  const blocker = createElement('blocker', 200, 0);
  const elements = [far, note, blocker, zoom];
  const onCanvas = viewContent(view(zoom, elements));
  assert.doesNotMatch(onCanvas, /translate\(700 0\)/, 'a part outside the region is not drawn');
  assert.doesNotMatch(onCanvas, /NOTE-INSIDE/, 'text is not enlarged');
  assert.match(onCanvas, /translate\(200 0\)/, 'the canvas view shows what the canvas shows');
  const exported = viewContent(view(zoom, elements, { exporting: true }));
  assert.doesNotMatch(exported, /translate\(200 0\)/, 'canvas-only parts stay out of the export');
});

test('a non-finite drawable never reaches the view', () => {
  const zoom = createElement('zoom', 0, 0);
  const svg = zoomSceneSVG(zoom, {
    drawables: [{ type: 'path', pts: [{ x: NaN, y: 0 }, { x: 1, y: 0 }], color: '#ff0000', w: 1, opacity: 1 }],
  });
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

const side = (a, b, p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
const outline = (shape, cx, cy, rx, ry) => Array.from({ length: 720 }, (_, i) => {
  const t = i / 720 * 2 * Math.PI;
  if (shape !== 'rect') return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) };
  const c = Math.cos(t), s = Math.sin(t), k = 1 / Math.max(Math.abs(c) / rx, Math.abs(s) / ry);
  return { x: cx + k * c, y: cy + k * s };
});

for (const shape of ['circle', 'ellipse', 'rect']) {
  test(`${shape} connectors touch both outlines and leave each on one side`, () => {
    const g = zoomGeometry({ shape, w: 30, h: 18, mag: 3, insetX: 120, insetY: -70 });
    const lines = zoomConnectors(g);
    assert.equal(lines.length, 2);
    const points = [...outline(shape, 0, 0, g.rx, g.ry), ...outline(shape, g.ix, g.iy, g.irx, g.iry)];
    for (const [a, b] of lines) {
      const sides = points.map(p => side(a, b, p) / Math.hypot(b.x - a.x, b.y - a.y));
      const tolerance = 1e-3 * g.irx;
      assert.ok(sides.every(s => s > -tolerance) || sides.every(s => s < tolerance), 'a connector never cuts an outline');
    }
  });
}

test('rectangle connectors join corresponding corners', () => {
  const g = zoomGeometry({ shape: 'rect', w: 20, h: 10, mag: 4, insetX: 100, insetY: 80 });
  for (const [a, b] of zoomConnectors(g)) {
    const sx = Math.sign(a.x), sy = Math.sign(a.y);
    assert.deepEqual(b, { x: g.ix + sx * g.irx, y: g.iy + sy * g.iry });
  }
});

test('a view that contains its own region draws no connectors', () => {
  for (const shape of ['circle', 'ellipse', 'rect']) {
    assert.deepEqual(zoomConnectors(zoomGeometry({ shape, w: 30, h: 20, mag: 3, insetX: 5, insetY: 0 })), [], shape);
  }
});

test('the region is grabbed by its edge, the view anywhere', () => {
  const params = createElement('zoom').params;
  assert.equal(zoomHitTest(params, { x: 0, y: 0 }, 1), false, 'parts inside the region stay selectable');
  assert.equal(zoomHitTest(params, { x: 5, y: 3 }, 1), false);
  assert.equal(zoomHitTest(params, { x: 15.5, y: 0 }, 1), true, 'the outline is grabbed');
  assert.equal(zoomHitTest(params, { x: params.insetX, y: params.insetY }, 1), true, 'the view is opaque');
  assert.equal(zoomHitTest({ ...params, shape: 'rect' }, { x: 0, y: 0 }, 1), false);
  assert.equal(zoomHitTest({ ...params, shape: 'rect' }, { x: 14.5, y: 3 }, 1), true);
});

test('fitting and export bounds include the view', () => {
  const zoom = createElement('zoom', 200, 0);
  const box = getVisualBounds(zoom, { includeLabel: false });
  const g = zoomGeometry(zoom.params);
  assert.equal(box.x1, 200 + g.ix + g.irx);
  assert.equal(box.y0, g.iy - g.iry);
  state.elements = [createElement('cwlaser', 0, 0), zoom];
  state.beams = [];
  const [x, y, w, h] = buildSVG().match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.ok(x + w >= box.x1 && y <= box.y0, 'the exported figure holds the whole view');
});

test('a malformed saved zoom opens clamped to its schema', () => {
  const scene = parseSketch({
    app: 'optics2d', version: 1,
    elements: [{
      id: 'z', type: 'zoom', x: 10, y: 20, rot: 30,
      params: { shape: 'hexagon', w: -5, mag: 'big', insetX: 1e9, scaleBarMm: 1e6, frameColor: 'red', scaleBar: 'yes' },
    }],
  }, registry);
  const zoom = scene.elements[0];
  // A circle offers no rotation but keeps a saved turn: it draws the same,
  // and the turn comes back if the shape is switched to an ellipse.
  assert.equal(zoom.rot, 30);
  assert.equal(zoom.params.shape, 'circle');
  assert.equal(zoom.params.w, 0.1);
  assert.equal(zoom.params.mag, 4);
  assert.equal(zoom.params.insetX, 5000);
  assert.equal(zoom.params.scaleBarMm, 0.1, 'a manual bar is no longer than the region');
  assert.equal(zoom.params.frameColor, '#475569');
  assert.equal(zoom.params.scaleBar, true);
  assert.doesNotMatch(zoomFrameSVG(zoom.params), /NaN|Infinity/);
});

test('the magnification bound follows the region, also for a stale value', () => {
  assert.equal(zoomMaxMagnification({ shape: 'circle', w: 2000 }), 2);
  assert.equal(zoomMaxMagnification({ shape: 'circle', w: 0.1 }), 1000);
  assert.equal(zoomGeometry({ shape: 'rect', w: 10, h: 2000, mag: 50 }).mag, 2);
});

test('scale bar lengths are written the way a person reads them', () => {
  assert.equal(formatLength(2), '2 mm');
  assert.equal(formatLength(0.05), '50 µm');
  assert.equal(formatLength(0.0123), '12.3 µm');
  assert.equal(formatLength(0.0005), '500 nm');
});

test('an automatic scale bar is a round 1-2-5 length of a tenth to a quarter of the region', () => {
  for (const width of [0.1, 0.35, 1, 3.7, 14, 30, 99, 250, 2000]) {
    const mm = niceScaleBarLength(width);
    const mantissa = mm / 10 ** Math.floor(Math.log10(mm) + 1e-9);
    assert.ok([1, 2, 5].some(m => Math.abs(mantissa - m) < 1e-9), `${width} mm -> ${mm}`);
    assert.ok(mm <= width / 4 + 1e-12 && mm >= width / 10 - 1e-12, `${width} mm -> ${mm}`);
    assert.equal(String(mm).length <= 7 || /e-/.test(String(mm)), true, `no float noise in ${mm}`);
  }
  assert.equal(niceScaleBarLength(14), 2);
  assert.equal(formatLength(niceScaleBarLength(0.35)), '50 µm');
  assert.equal(formatLength(niceScaleBarLength(0.1)), '20 µm');
  assert.equal(niceScaleBarLength(0), 0);
  assert.equal(niceScaleBarLength(NaN), 0);
});

test('the default zoom draws its automatic bar at the labelled length', () => {
  const params = createElement('zoom').params;
  const bar = zoomScaleBar(params);
  assert.equal(bar.mm, niceScaleBarLength(params.w));
  assert.equal(bar.label, '5 mm');
});

test('a rectangle or ellipse zoom turns, a circle does not', () => {
  const zoom = createElement('zoom');
  assert.equal(isRotatable(zoom), false);
  zoom.params.shape = 'rect';
  assert.equal(isRotatable(zoom), true);
  zoom.params.shape = 'ellipse';
  assert.equal(isRotatable(zoom), true);
  assert.equal(isRotatable(createElement('figureframe')), false);
  assert.equal(isRotatable(createElement('lens')), true);
});

const turnToBench = (zoom, p) => {
  const a = (zoom.rot || 0) * Math.PI / 180;
  return { x: zoom.x + p.x * Math.cos(a) - p.y * Math.sin(a), y: zoom.y + p.x * Math.sin(a) + p.y * Math.cos(a) };
};

for (const rot of [0, 30, 135, 200, 290]) {
  test(`turned by ${rot}°, the view stays on the bench and still magnifies it in place`, () => {
    const laser = lineLaser(0, 2);
    const zoom = createElement('zoom', 200, 0);
    Object.assign(zoom.params, { shape: 'rect', w: 40, h: 16, mag: 5, insetX: 30, insetY: 150 });
    zoom.rot = rot;
    // The view's centre, from its local box, lands one offset away on the bench.
    const box = zoomViewBox(zoom.params, rot);
    const centre = turnToBench(zoom, { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 });
    assert.ok(Math.abs(centre.x - 230) < 1e-9 && Math.abs(centre.y - 150) < 1e-9, `view centre ${centre.x}, ${centre.y}`);
    // Every point of the ray at y = 2 lands at 150 + 5 × 2 on the bench: the
    // enlarged bench keeps its orientation whatever the turn.
    const svg = view(zoom, [laser, zoom]);
    const flipped = /^<g transform="rotate\(180\)">/.test(svg);
    assert.equal(flipped, Math.abs(((rot + 180) % 360) - 180) > 90, 'half-turned frames keep the bar upright');
    const pts = viewContent(svg).match(/<polyline points="([^"]+)"/)[1].split(' ').map(pair => {
      const [x, y] = pair.split(',').map(Number);
      return turnToBench(zoom, flipped ? { x: -x, y: -y } : { x, y });
    });
    assert.ok(pts.every(p => Math.abs(p.y - 160) < 0.05), `ray on the bench at y 160, got ${pts.map(p => p.y.toFixed(2))}`);
    // The view is grabbed where it is drawn.
    const local = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
    assert.equal(zoomHitTest(zoom.params, local, 1, rot), true);
  });
}

test('a turned circle keeps its scale bar level on the bench', () => {
  const params = createElement('zoom').params;
  const svg = zoomFrameSVG(params, { rot: 40 });
  assert.match(svg, /<g transform="rotate\(-40 [^)]+\)"><g data-zoom-scalebar/);
  assert.doesNotMatch(zoomFrameSVG(params, { rot: 0 }), /rotate\(/);
});

test('the outlines dash together, the connector lines on their own', () => {
  const params = createElement('zoom').params;
  const plain = zoomFrameSVG(params);
  assert.doesNotMatch(plain, /stroke-dasharray/);
  const outlines = zoomFrameSVG({ ...params, regionDash: true });
  assert.match(outlines, /stroke-dasharray="6 4" data-zoom-frame="region"/);
  assert.match(outlines, /stroke-dasharray="6 4" data-zoom-frame="view"/, 'the view is the region enlarged');
  assert.doesNotMatch(outlines, /stroke-dasharray[^>]*data-zoom-frame="connector"/);
  const connectors = zoomFrameSVG({ ...params, connectorDash: true });
  assert.equal(connectors.match(/stroke-dasharray="5 4" data-zoom-frame="connector"/g).length, 2);
  assert.doesNotMatch(connectors, /stroke-dasharray[^>]*data-zoom-frame="(?:region|view)"/);
});

test('a pulse marker lands in the view where its point maps, and only near the region', () => {
  const zoom = createElement('zoom', 300, 0);
  Object.assign(zoom.params, { shape: 'rect', w: 40, h: 20, mag: 5, insetX: 0, insetY: 200 });
  zoom.rot = 30;
  const place = zoomPulsePlacement(zoom);
  const g = zoomGeometry(zoom.params, zoom.rot);
  const at = place({ x: 304, y: 2, angle: 10, widthMm: 12 });
  const expected = zoomMapper(g, zoom)({ x: 304, y: 2 });
  assert.ok(Math.abs(at.x - expected.x) < 1e-9 && Math.abs(at.y - expected.y) < 1e-9, 'mapped like the rays');
  assert.equal(at.angle, 10 - 30, 'heading turned into the drawing frame');
  assert.equal(at.scale, 5, 'a physical packet length grows with the magnification');
  assert.equal(place({ x: 600, y: 0, angle: 0, widthMm: 12 }), null, 'a packet far from the region is left out');
});

test('an animation frame draws the pulse packets crossing the region inside the view', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  laser.params.beamMode = 'line';
  // Wider than the schematic packet spacing, so a packet is always inside.
  const zoom = createElement('zoom', 300, 0);
  Object.assign(zoom.params, { w: 160, mag: 2, insetX: 0, insetY: 400, scaleBar: false });
  state.elements = [laser, zoom];
  state.beams = [];
  const playback = { speedNsPerSecond: 10, mode: 'schematic' };
  const frame = buildSVG({ whiteBg: true, animation: { seconds: 0.3, playback } });
  const bench = frame.match(/class="pulse-marker"/g)?.length || 0;
  assert.ok(bench > 0, 'the bench shows packets at this time scale');
  const inView = viewContent(frame).match(/class="pulse-marker"/g)?.length || 0;
  assert.ok(inView > 0, 'the view shows the packets crossing its region');
  assert.ok(inView < bench, 'and only those');
  assert.doesNotMatch(buildSVG({ whiteBg: true }), /pulse-marker/, 'a still export draws no packets, on the bench or in the view');
});

test('the scale bar can be turned off', () => {
  const params = { ...createElement('zoom').params, scaleBar: false };
  assert.equal(zoomScaleBar(params), null);
  assert.doesNotMatch(zoomFrameSVG(params), /data-zoom-scalebar/);
});

test('a manual scale bar too long for the view is shortened and labelled as drawn', () => {
  for (const shape of ['rect', 'circle']) {
    const params = { ...createElement('zoom').params, shape, w: 30, h: 20, mag: 4, scaleBarMm: 30 };
    const g = zoomGeometry(params);
    const bar = zoomScaleBar(params);
    assert.ok(bar.mm < 30, `${shape}: shortened`);
    assert.equal(bar.label, formatLength(bar.mm));
    assert.ok(Math.abs(bar.x2 - bar.x1 - bar.mm * g.mag) < 1e-9, 'the drawn length is the labelled length');
    for (const x of [bar.x1, bar.x2]) {
      const inside = shape === 'rect'
        ? Math.abs(x - g.ix) <= g.irx && Math.abs(bar.y - g.iy) <= g.iry
        : ((x - g.ix) / g.irx) ** 2 + ((bar.y - g.iy) / g.iry) ** 2 <= 1;
      assert.ok(inside, `${shape}: bar end inside the view`);
    }
  }
});

// ---- Review of c79abe4 (#306) ----

test('the magnification follows a region that grows and does not come back when it shrinks', () => {
  const params = { ...createElement('zoom').params, w: 30, mag: 100 };
  Object.assign(params, { w: 2000 }, normalizeZoomParams({ ...params, w: 2000 }));
  assert.equal(params.mag, 2, 'the field reads what the view draws');
  assert.equal(params.mag, zoomGeometry(params).mag);
  Object.assign(params, { w: 30 }, normalizeZoomParams({ ...params, w: 30 }));
  assert.equal(params.mag, 2, 'as after saving and reloading');
  assert.equal(normalizeZoomParams({ ...params, w: 10, scaleBarMm: 25 }).scaleBarMm, 10,
    'a set scale bar is no longer than the region');
});

test('arrows drawn with the Arrow tool are not enlarged; fibers are', () => {
  const zoom = createElement('zoom', 200, 0);
  const arrow = { id: 'arrow', kind: 'beam', pts: [{ x: 190, y: 0 }, { x: 210, y: 0 }], width: 2, color: '#e02020', arrow: true };
  const fiber = { id: 'fiber', kind: 'fiber', pts: [{ x: 190, y: 5 }, { x: 210, y: 5 }], width: 4, color: '#e8a800' };
  const content = viewContent(zoomSceneSVG(zoom, { beams: [arrow, fiber], elements: [zoom] }));
  assert.doesNotMatch(content, /#e02020/, 'the arrow stays out of the view');
  assert.match(content, /#e8a800/, 'the fiber is enlarged');
});

test('the scale bar and its label fit the view vertically, or are left out', () => {
  // The reported case: a rectangle 1 mm high at ×4 makes a 4 mm tall view.
  const thin = { ...createElement('zoom').params, shape: 'rect', w: 30, h: 1, mag: 4 };
  const bar = zoomScaleBar(thin);
  if (bar) {
    const g = zoomGeometry(thin);
    assert.ok(bar.top >= g.iy - g.iry && bar.y <= g.iy + g.iry, `bar ${bar.top}…${bar.y} inside ${g.iy - g.iry}…${g.iy + g.iry}`);
  }
  assert.doesNotMatch(zoomFrameSVG({ ...thin, h: 0.5, mag: 2 }), /data-zoom-scalebar/, 'too low for a readable label');
  for (const shape of ['rect', 'ellipse']) {
    for (const h of [1, 2, 4, 8, 20, 60]) {
      for (const mag of [1, 3, 10]) {
        const params = { ...createElement('zoom').params, shape, w: 30, h, mag };
        const g = zoomGeometry(params);
        const b = zoomScaleBar(params);
        if (!b) continue;
        const topLimit = shape === 'rect' ? g.iy - g.iry : g.iy - 0.9 * g.iry;
        assert.ok(b.top >= topLimit - 1e-9 && b.y <= g.iy + g.iry + 1e-9, `${shape} h ${h} ×${mag}`);
      }
    }
  }
});

test('a stroke left at the SVG default keeps its bench weight in the view', () => {
  const camera = createElement('camera', 200, 0);
  const zoom = createElement('zoom', 200, 0);
  Object.assign(zoom.params, { w: 40, mag: 100 });
  const content = viewContent(view(zoom, [camera, zoom]));
  assert.ok(content.includes('scale(100) rotate(0) translate(-200 0)" stroke-width="0.01"'),
    'the enlarged group sets the inherited stroke width to 1/mag');
});

// ---- Setting the magnification from the view's corners ----

// The view's corner on the side (sx, sy) of the element's local frame, on the
// bench relative to the element's origin.
const viewCorner = (params, rot, sx, sy) => {
  const b = zoomViewBox(params, rot);
  const p = { x: sx < 0 ? b.x0 : b.x1, y: sy < 0 ? b.y0 : b.y1 };
  const a = rot * Math.PI / 180;
  return { x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) };
};
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;

for (const rot of [0, 30, 200]) {
  test(`dragging a view corner at ${rot}° scales the view about the opposite corner`, () => {
    const start = { ...createElement('zoom').params, shape: 'rect', w: 30, h: 12, mag: 3, insetX: 120, insetY: -80 };
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const anchor = viewCorner(start, rot, -sx, -sy);
      const corner = viewCorner(start, rot, sx, sy);
      // Pull the corner to where a ×6 view would put it.
      const target = { x: anchor.x + 2 * (corner.x - anchor.x), y: anchor.y + 2 * (corner.y - anchor.y) };
      const next = zoomViewCornerDrag(start, rot, { sx, sy }, target);
      const after = { ...start, ...next };
      assert.ok(Math.abs(next.mag - 6) < 1e-9, `corner ${sx},${sy}: ×${next.mag}`);
      assert.ok(near(viewCorner(after, rot, -sx, -sy), anchor), 'the opposite corner stays on the bench');
      assert.ok(near(viewCorner(after, rot, sx, sy), target), 'the dragged corner meets the pointer');
    }
  });
}

test('a corner drag follows the diagonal, stays within the bounds, and rounds without moving the anchor', () => {
  const start = { ...createElement('zoom').params, mag: 4, insetX: 110, insetY: -90 };
  const anchor = viewCorner(start, 0, -1, -1);
  const corner = viewCorner(start, 0, 1, 1);
  // Off the diagonal: only the part along it counts.
  const along = zoomViewCornerDrag(start, 0, { sx: 1, sy: 1 }, { x: corner.x + 20, y: corner.y - 20 });
  assert.ok(Math.abs(along.mag - 4) < 1e-9, 'sideways motion leaves the magnification');
  // Through the anchor and past it: never below ×1, never past the bound.
  assert.equal(zoomViewCornerDrag(start, 0, { sx: 1, sy: 1 }, { x: anchor.x - 50, y: anchor.y - 50 }).mag, 1);
  assert.equal(zoomViewCornerDrag(start, 0, { sx: 1, sy: 1 }, { x: 1e6, y: 1e6 }).mag, zoomMaxMagnification(start));
  // Rounded to the field's step, with the anchor still exact.
  const rounded = zoomViewCornerDrag(start, 0, { sx: 1, sy: 1 }, { x: corner.x + 7, y: corner.y + 7 },
    mag => Math.round(mag * 10) / 10);
  assert.equal(rounded.mag, Math.round(rounded.mag * 10) / 10);
  assert.ok(near(viewCorner({ ...start, ...rounded }, 0, -1, -1), anchor));
});

test('the zoom marks its view as scalable for the canvas corner handles', () => {
  const zoom = createElement('zoom');
  const [box] = registry.zoom.selectionBoxes(zoom);
  assert.equal(box.scalable, true);
  assert.deepEqual({ x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 }, zoomViewBox(zoom.params, 0));
});

// ---- Review of fdf497a (#306) ----

// What the canvas does: the handle is 6 mm outside the corner (in the
// element's local frame); the drag keeps the offset between the pointer
// that pressed it and the corner itself.
const dragFromHandle = (params, rot, corner, moveBy) => {
  const a = rot * Math.PI / 180;
  const at = zoomViewCorner(params, rot, corner);
  const press = { x: at.x + 6 * (corner.sx * Math.cos(a) - corner.sy * Math.sin(a)), y: at.y + 6 * (corner.sx * Math.sin(a) + corner.sy * Math.cos(a)) };
  const grab = { x: at.x - press.x, y: at.y - press.y };
  return zoomViewCornerDrag(params, rot, corner, { x: press.x + moveBy.x + grab.x, y: press.y + moveBy.y + grab.y },
    mag => Math.round(mag * 10) / 10);
};

test('grabbing a corner handle does not rescale the view', () => {
  for (const rot of [0, 30, 200]) {
    for (const w of [30, 0.1]) {
      const params = { ...createElement('zoom').params, shape: 'rect', w, h: w / 2, mag: 4 };
      assert.ok(near(zoomViewCorner(params, rot, { sx: 1, sy: -1 }), viewCorner(params, rot, 1, -1)), 'the corner the handle belongs to');
      assert.equal(dragFromHandle(params, rot, { sx: 1, sy: -1 }, { x: 0, y: 0 }).mag, 4, `${w} mm at ${rot}°: pressed, not moved`);
      const nudged = dragFromHandle(params, rot, { sx: 1, sy: -1 }, { x: 0.01, y: 0.01 }).mag;
      assert.ok(Math.abs(nudged - 4) <= 0.2 + 1e-9, `${w} mm at ${rot}°: a 0.01 mm nudge gave ×${nudged}`);
    }
  }
});

test('near the offset limit the magnification stops instead of moving the fixed corner', () => {
  // The reported case: the view's centre would pass 5000 mm.
  const start = { ...createElement('zoom').params, shape: 'rect', w: 2000, h: 20, mag: 1, insetX: 4990, insetY: 0 };
  const anchor = viewCorner(start, 0, -1, -1);
  const toward2 = viewCorner({ ...start, mag: 2, insetX: 4990 + 1000 }, 0, 1, 1);
  const next = zoomViewCornerDrag(start, 0, { sx: 1, sy: 1 }, toward2, mag => Math.round(mag * 10) / 10);
  assert.ok(near(viewCorner({ ...start, ...next }, 0, -1, -1), anchor), `anchor ${JSON.stringify(viewCorner({ ...start, ...next }, 0, -1, -1))}`);
  // ×1.01 is the most the offset allows; on the 0.1 step that is ×1.0.
  assert.ok(next.insetX <= 5000 && next.mag <= 1.01 + 1e-9, `×${next.mag}, offset ${next.insetX}`);
  const unrounded = zoomViewCornerDrag(start, 0, { sx: 1, sy: 1 }, toward2);
  assert.ok(Math.abs(unrounded.mag - 1.01) < 1e-9 && Math.abs(unrounded.insetX - 5000) < 1e-6, `×${unrounded.mag}, offset ${unrounded.insetX}`);
  assert.ok(near(viewCorner({ ...start, ...unrounded }, 0, -1, -1), anchor));
});
