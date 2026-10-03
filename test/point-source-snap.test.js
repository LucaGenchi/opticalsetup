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
// A ray that meets a traced surface within the source's capture range is
// ordinary light from there on; one that meets nothing in range fades at
// 110 mm. Coverage of the optical families, the beamsplitter branches, the
// partial mirror and the fiber follows Andrea Bertoncini's tests in #191.

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
const at = (type, x, params = {}) => {
  const el = createElement(type, x, 0);
  Object.assign(el.params, params);
  return el;
};
// What a detector 600 mm away reads behind `between`.
function readBehind(between, source = pointSource()) {
  const detector = at('detector', 600, { aperture: 100 });
  rayPoints([source, ...between, detector]);
  return detectorReading(detector.id)?.signal ?? 0;
}

test('a new point source has a 1 m capture range, and a sketch saved without one keeps 165 mm', () => {
  assert.equal(createElement('pointsource', 0, 0).params.captureRange, 1000);
  assert.ok(registry.pointsource.source(pointSource()).every(r => r.captureLen === 1000 && r.captureMode === 'surface'));

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

test('every optical family 500 mm away receives the source', () => {
  for (const type of [
    'lens', 'lensc', 'metalens', 'thicklens', 'lensgroup', 'telescope', 'objective',
    'freeglass', 'prism', 'glassrod', 'mirror', 'cmirror', 'cmirrorx', 'oap',
    'galvo', 'retroreflector', 'bs', 'pbs', 'dichroic', 'etalon', 'grating',
    'diffuser', 'slm', 'metasurface', 'dmd', 'dm', 'aom', 'aotf', 'eye',
    'asphericlens', 'conicmirror', 'polygonscanner', 'aod',
  ]) {
    const points = rayPoints([pointSource(), at(type, 500)]);
    assert.ok(points.some(p => p.x > 400), `${type} must receive the ray aimed at it`);
  }
});

test('an optic that only passes light on does not hide what is behind it', () => {
  // The same lens-and-detector bench read with nothing in front, then with
  // each pass-through optic 300 mm from the source. On this branch's first
  // version the filter, polarizer and waveplates ended the ray.
  const lens = () => at('lens', 400, { f: 100, dia: 50 });
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
  const blocked = readBehind([at('filter', 300, { ftype: 'bandpass', center: 800, band: 10 }), lens()]);
  assert.equal(blocked, 0);
});

test('a point source reads on a detector the way a laser does through the same optics', () => {
  // One ray along the axis from each source, through a neutral-density
  // filter and a waveplate: the same fraction of each arrives.
  const laserRead = between => {
    const laser = createElement('cwlaser', -60, 0);
    const detector = at('detector', 600, { aperture: 100 });
    traceAll([laser, ...between, detector]);
    return detectorReading(detector.id)?.signal ?? 0;
  };
  const stack = () => [at('filter', 200, { ftype: 'nd', trans: 0.3 }), at('qwp', 300)];
  const pointFraction = readBehind(stack()) / readBehind([]);
  const laserFraction = laserRead(stack()) / laserRead([]);
  assert.ok(pointFraction > 0 && Math.abs(pointFraction - laserFraction) < 1e-9, `${pointFraction} vs ${laserFraction}`);
});

test('a detector facing the source reads it inside the range and not outside', () => {
  assert.ok(readBehind([]) > 0, 'a detector 600 mm away, range 1 m');
  assert.equal(readBehind([], pointSource({ captureRange: 500 })), 0, 'the same detector, range 500 mm');
});

test('a blocker still stops the light, and diagram-only elements change nothing', () => {
  const lens = () => at('lens', 400, { f: 100, dia: 50 });
  assert.equal(readBehind([at('blocker', 300), lens()]), 0, 'nothing is reached through a blocker');
  assert.equal(readBehind([at('beamdump', 300), lens()]), 0, 'nor through a beam dump');

  const open = readBehind([lens()]);
  for (const type of ['textlabel', 'arrowann', 'window', 'gascell']) {
    assert.equal(readBehind([at(type, 300), lens()]), open, `${type} is not a surface`);
  }
  // ...and a diagram-only element is not something to be captured by either.
  assert.ok(fadesAtGlow(rayPoints([pointSource(), at('textlabel', 300), at('window', 500)])));
});

test('a ray that misses everything keeps the 110 mm fade', () => {
  const lens = createElement('lens', 500, 100); // off all four sampled axes
  assert.ok(fadesAtGlow(rayPoints([pointSource(), lens])));
});

test('a beamsplitter sends on both branches', () => {
  const points = rayPoints([pointSource(), at('bs', 500)]);
  assert.ok(points.some(p => p.x > 600 && Math.abs(p.y) < 1e-6), 'transmitted branch propagates');
  assert.ok(points.some(p => Math.abs(p.y) > 500), 'reflected branch propagates');
});

test('light leaking through a partial mirror keeps only the range it has left', () => {
  const mirror = at('mirror', 500, { refl: 30, showTransmitted: true });
  const glass = at('glassrod', 700);
  const detector = at('detector', 900);
  rayPoints([pointSource(), mirror, glass, detector]);
  assert.ok(detectorReading(detector.id)?.signal > 0, 'glass 700 mm from the source is inside 1 m');
  glass.x = 1100;
  detector.x = 1300;
  rayPoints([pointSource(), mirror, glass, detector]);
  assert.equal(detectorReading(detector.id), null, 'glass 1100 mm from the source is not');
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
