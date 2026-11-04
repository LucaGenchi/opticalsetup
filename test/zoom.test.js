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
  zoomScaleBar, zoomViewBox,
} from '../sketch/js/zoom.js';
import { zoomSceneSVG } from '../sketch/js/zoom-view.js';

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

test('the region outline and the connector lines can be dashed', () => {
  const params = createElement('zoom').params;
  const plain = zoomFrameSVG(params);
  assert.doesNotMatch(plain, /stroke-dasharray/);
  const dashed = zoomFrameSVG({ ...params, regionDash: true, connectorDash: true });
  assert.match(dashed, /stroke-dasharray="6 4" data-zoom-frame="region"/);
  assert.equal(dashed.match(/stroke-dasharray="5 4" data-zoom-frame="connector"/g).length, 2);
  assert.doesNotMatch(dashed, /stroke-dasharray[^>]*data-zoom-frame="view"/, 'the view border stays solid');
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
