// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Regression coverage for the feedback-round-1 features re-applied on top of
// the direct-manipulation branch: unified evanescent point source,
// concave-lens outline, and surface-aware snap anchors.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createElement, registry } from '../sketch/js/elements.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import '../sketch/js/detector-instruments.js';
import '../sketch/js/etalon.js';
import { parseSketch, state } from '../sketch/js/state.js';
import { buildSVG } from '../sketch/js/export.js';

test('point source rays fade evanescently unless a nearby lens collects them', () => {
  const src = createElement('pointsource', 0, 0);
  src.params.nrays = 4;
  src.params.spread = 360;

  const alone = traceAll([src]);
  const maxAlone = Math.max(...alone.filter(d => d.pts).flatMap(d => d.pts.map(p => Math.hypot(p.x, p.y))));
  assert.ok(Math.abs(maxAlone - 110) < 1e-6, `unattended rays fade at 110mm, got ${maxAlone}`);

  const lens = createElement('lens', 100, 0);
  lens.params.f = 50;
  lens.params.dia = 200;
  const collected = traceAll([src, lens]);
  const maxCollected = Math.max(...collected.filter(d => d.pts).flatMap(d => d.pts.map(p => Math.hypot(p.x, p.y))));
  assert.ok(maxCollected > 1000, `lens-collected rays propagate on, got ${maxCollected}`);
});

// ---- capture range --------------------------------------------------------
// Lenses and mirrors (every element of those two categories) and fiber tips
// collect a point source's light within its capture range. Other optics
// neither collect it nor hide a collector behind them; opaque things do hide
// it. A ray with no collector ahead fades at 110 mm. The partial-mirror and
// fiber cases follow Andrea Bertoncini's tests in #191.

function pointSource(params = {}) {
  const src = createElement('pointsource', 0, 0);
  Object.assign(src.params, { nrays: 4 }, params);
  return src;
}

function rayPoints(elements, beams = []) {
  const points = traceAll(elements, beams).filter(d => d.type === 'path').flatMap(d => d.pts);
  assert.ok(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  return points;
}

const fadesAtGlow = points => points.every(p => Math.hypot(p.x, p.y) <= 110 + 1e-8);
// Only what the point source at the origin drew, leaving out another source's
// own beam.
function sourcePoints(elements) {
  const paths = traceAll(elements).filter(d => d.type === 'path' && Math.hypot(d.pts[0].x, d.pts[0].y) < 1e-6);
  assert.ok(paths.length > 0);
  return paths.flatMap(d => d.pts);
}
const at = (type, x, params = {}) => {
  const el = createElement(type, x, 0);
  Object.assign(el.params, params);
  return el;
};
const lens = () => at('lens', 400, { f: 100, dia: 50 });
// What a detector 600 mm away reads behind `between`.
function readBehind(between, source = pointSource()) {
  const detector = at('detector', 600, { aperture: 100 });
  rayPoints([source, ...between, detector]);
  return detectorReading(detector.id)?.signal ?? 0;
}

test('a new point source has a 1 m capture range, and a sketch saved without one keeps 165 mm', () => {
  assert.equal(createElement('pointsource', 0, 0).params.captureRange, 1000);
  assert.ok(registry.pointsource.source(pointSource()).every(r => r.captureLen === 1000 && r.captureMode === 'collectors'));

  const saved = pointSource();
  delete saved.params.captureRange;
  const load = element => parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [element], beams: [] }), registry).elements[0];
  assert.equal(load(saved).params.captureRange, 165, 'no stored range: the range it was drawn with');
  assert.equal(load(pointSource({ captureRange: 400 })).params.captureRange, 400, 'a stored range is kept');
  assert.equal(load(pointSource()).params.captureRange, 1000, 'a stored default is kept too');

  // An old sketch still does what it did: a lens 150 mm away collects, one
  // 300 mm away does not.
  const old = load(saved);
  assert.ok(rayPoints([old, at('lens', 150)]).some(p => p.x > 1000));
  assert.ok(fadesAtGlow(rayPoints([old, at('lens', 300)])));
});

test('the capture range is clamped at its schema boundary, and never reaches the tracer non-finite', () => {
  const load = captureRange => parseSketch(JSON.stringify({
    app: 'optics2d', version: 1, beams: [], elements: [pointSource({ captureRange })],
  }), registry).elements[0].params.captureRange;
  assert.equal(load(1e9), 5000);
  assert.equal(load(-50), 110);
  assert.equal(load(0), 110);
  for (const bad of [NaN, Infinity, -Infinity, 'far', null, undefined]) {
    const rays = registry.pointsource.source({ params: { spread: 360, nrays: 4, captureRange: bad } });
    assert.ok(rays.every(r => Number.isFinite(r.captureLen) && r.captureLen >= 110 && r.captureLen <= 5000), String(bad));
  }
});

test('the capture range includes its boundary and stops beyond it', () => {
  for (const range of [110, 400, 1000, 5000]) {
    const src = pointSource({ captureRange: range });
    assert.ok(rayPoints([src, at('lens', range)]).some(p => p.x > range + 500), `lens at ${range} mm is reached`);
    assert.ok(fadesAtGlow(rayPoints([src, at('lens', range + 0.1)])), `lens just past ${range} mm is not`);
  }
});

test('every lens and every mirror collects the source, and nothing else does', () => {
  for (const [type, def] of Object.entries(registry)) {
    if (def.hidden) continue;
    const points = sourcePoints([pointSource(), at(type, 500)]);
    if (def.category === 'Lenses' || def.category === 'Mirrors') {
      assert.ok(points.some(p => Math.hypot(p.x, p.y) > 450), `${type} must collect the ray aimed at it`);
    } else {
      assert.ok(fadesAtGlow(points), `${type} must not collect: the rays fade at 110 mm`);
    }
  }
});

test('a laser next to a point source does not catch its rays', () => {
  // The housing is opaque, so it ends the glow where it is nearer than
  // 110 mm, but it never turns a ray into a traced line.
  for (const type of ['cwlaser', 'pulsedlaser', 'sclaser', 'ledsource']) {
    for (const x of [80, 300, 900]) {
      const laser = at(type, x);
      laser.rot = 180; // its housing faces the source
      assert.ok(fadesAtGlow(sourcePoints([pointSource({ nrays: 64 }), laser])), `${type} at ${x} mm`);
    }
  }
});

test('an optic in front of a lens acts on the light without hiding the lens', () => {
  const open = readBehind([lens()]);
  assert.ok(open > 0, 'the bare bench reads the source');
  for (const [type, params, fraction] of [
    ['filter', { ftype: 'nd', trans: 0.5 }, 0.5],
    ['filter', { ftype: 'bandpass', center: 532, band: 40 }, 1],
    ['hwp', {}, 1],
    ['qwp', {}, 1],
    ['polarizer', {}, 0.5],
  ]) {
    const signal = readBehind([at(type, 300, params), lens()]);
    assert.ok(Math.abs(signal - open * fraction) < 1e-9, `${type}: ${signal} vs ${open * fraction}`);
  }
  // A filter that blocks the source's wavelength still blocks it.
  assert.equal(readBehind([at('filter', 300, { ftype: 'bandpass', center: 800, band: 10 }), lens()]), 0);
  // ...and with no lens behind it, the filter collects nothing.
  assert.ok(fadesAtGlow(rayPoints([pointSource(), at('filter', 300)])));
});

test('a detector facing the source collects nothing; behind a lens it reads', () => {
  assert.equal(readBehind([]), 0, 'no lens, no reading');
  assert.ok(readBehind([lens()]) > 0);
  assert.equal(readBehind([lens()], pointSource({ captureRange: 300 })), 0, 'lens beyond the range');
});

test('opaque things hide a collector, and diagram-only elements change nothing', () => {
  for (const type of ['blocker', 'beamdump', 'detector']) {
    assert.equal(readBehind([at(type, 300), lens()]), 0, `nothing is collected through a ${type}`);
    assert.ok(fadesAtGlow(sourcePoints([pointSource(), at(type, 300), lens()])),
      `${type}: the ray fades instead of being drawn to it`);
  }
  const open = readBehind([lens()]);
  for (const type of ['textlabel', 'arrowann', 'window', 'gascell']) {
    assert.equal(readBehind([at(type, 300), lens()]), open, `${type} is not a surface`);
  }
});

test('a ray that misses every collector keeps the 110 mm fade', () => {
  const off = createElement('lens', 500, 100); // off all four sampled axes
  assert.ok(fadesAtGlow(rayPoints([pointSource(), off])));
});

test('a beamsplitter in front of a lens splits the collected light', () => {
  const points = rayPoints([pointSource(), at('bs', 300), at('lens', 500)]);
  assert.ok(points.some(p => p.x > 600 && Math.abs(p.y) < 1e-6), 'transmitted branch reaches the lens and goes on');
  assert.ok(points.some(p => Math.abs(p.y) > 500), 'reflected branch propagates');
});

test('light leaking through a partial mirror keeps only the range it has left', () => {
  const mirror = at('mirror', 500, { refl: 30, showTransmitted: true });
  const beyond = at('lens', 700, { f: 100, dia: 50 });
  const detector = at('detector', 900);
  rayPoints([pointSource(), mirror, beyond, detector]);
  assert.ok(detectorReading(detector.id)?.signal > 0, 'a lens 700 mm from the source is inside 1 m');
  beyond.x = 1100;
  detector.x = 1300;
  rayPoints([pointSource(), mirror, beyond, detector]);
  assert.equal(detectorReading(detector.id), null, 'a lens 1100 mm from the source is not');
});

test('a fiber input collects the source inside the range', () => {
  const fiber = {
    id: 'collection-fiber', kind: 'fiber', width: 4, propagate: true,
    pts: [{ x: 500, y: 0 }, { x: 700, y: 0 }],
  };
  assert.ok(rayPoints([pointSource()], [fiber]).some(p => p.x > 800));
});

test('point source supports 128 distinct rays and clamps larger saved counts', () => {
  const source = pointSource();
  for (const count of [128, 1000]) {
    source.params.nrays = count;
    const scene = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [source], beams: [] }), registry);
    assert.equal(scene.elements[0].params.nrays, 128);
    const rays = registry.pointsource.source(scene.elements[0]);
    assert.equal(rays.length, 128);
    assert.equal(new Set(rays.map(r => Math.atan2(r.dy, r.dx).toFixed(8))).size, 128);
    rayPoints(scene.elements);
  }
});

test('beams are composited normally: a beam keeps its wavelength colour wherever strokes coincide', () => {
  // Screen blending makes coincident strokes of one wavelength add up to a
  // different hue (five 532 nm spectral samples behind a glass rod turned
  // yellow-green). Neither the export nor the canvas may blend beam strokes.
  const saved = { elements: state.elements, beams: state.beams };
  try {
    const laser = createElement('pulsedlaser', 0, 0);
    state.elements = [laser, at('glassrod', 200), at('detector', 400)];
    state.beams = [];
    const svg = buildSVG();
    assert.ok(/<polyline|<polygon/.test(svg), 'the export draws the beam');
    assert.ok(!/mix-blend-mode|isolation\s*:/.test(svg), 'no blend mode in exported beams');
  } finally {
    state.elements = saved.elements;
    state.beams = saved.beams;
  }
  const canvasSource = readFileSync(new URL('../sketch/js/canvas.js', import.meta.url), 'utf8');
  assert.ok(!/mix-blend-mode/.test(canvasSource), 'no blend mode on the canvas');
});

test('point source emission angle restricts the fan without duplicate full-circle samples', () => {
  const full = registry.pointsource.source({ params: { spread: 360, nrays: 8 } });
  assert.equal(full.length, 8);
  const angles = full.map(r => Math.atan2(r.dy, r.dx).toFixed(6));
  assert.equal(new Set(angles).size, 8, 'no duplicated -180/+180 sample');
  assert.ok(full.every(r => r.evan && r.evanLen === 110));
  assert.ok(full.every(r => r.captureLen === 165), 'no stored range falls back to the old 165 mm');

  const cone = registry.pointsource.source({ params: { spread: 60, nrays: 5 } });
  assert.ok(cone.every(r => Math.abs(Math.atan2(r.dy, r.dx)) <= (30 + 1e-9) * Math.PI / 180));
});

test('the lamp is a mode of Point source; a bare emitter still answers to "led"', () => {
  // The old `led` and `lamp` types were folded into Point source in July on
  // the grounds that neither did anything the point source could not. That
  // still holds for the lamp: a discharge lamp is geometrically a point source
  // and differs only in its spectrum, so it is a mode of this element. A
  // packaged, collimated LED is a different thing -- a directional beam -- and
  // is its own `ledsource` element (test/led-source.test.js); the pre-launch
  // `led` type name is not reused.
  assert.equal(Object.hasOwn(registry, 'led'), false);
  assert.equal(Object.hasOwn(registry, 'lamp'), false);
  assert.ok(registry.pointsource.params.some(p => p.key === 'sourceKind'),
    'and the lamp lives here, as a source mode');
  assert.ok(!registry.pointsource.hidden, 'pointsource is visible');
  // still searchable under their old names: a bare LED die is a point source
  assert.ok(registry.pointsource.aliases.includes('led'));
  assert.ok(registry.pointsource.aliases.includes('lamp'));
});

test('concave lens outline curves on the vertical refracting faces', () => {
  const el = createElement('lensc');
  const path = registry.lensc.svg(el);
  // both vertical faces are quadratic curves through the mid-plane (x≈0
  // control points), rather than curves along the top/bottom edges
  const d = path.match(/d="([^"]+)"/)[1];
  assert.match(d, /L [\d.+-]+,[\d.+-]+ Q [\d.+-]+,0 /, 'vertical face uses a Q through y-axis midpoint');
  assert.ok(!/Q [\d.+-]+,[\d.+-]*[1-9][\d.]* [\d.+-]+,-?\d/.test(d.split('Z')[0].split('Q')[0]), 'no top-edge curvature');
});

test('optically active elements carry surface-aware snap anchors', () => {
  const expected = {
    cwlaser: { x: 52, y: 0 },
    pulsedlaser: { x: 52, y: 0 },
    objective: { x: 16, y: 0 },
    slm: { x: -9, y: 0 },
    dmd: { x: -9, y: 0 },
    detector: { x: -19, y: 0 },
    pmt: { x: -25, y: 0 },
    camera: { x: -22, y: 0 },
    eye: { x: -15, y: 0 },
  };
  for (const [type, pt] of Object.entries(expected)) {
    assert.deepEqual(registry[type].snapPt, pt, `${type} snapPt`);
  }
  // the supercontinuum laser inherits the same exit-aperture anchor
  assert.deepEqual(registry.sclaser.snapPt, { x: 52, y: 0 });
});
