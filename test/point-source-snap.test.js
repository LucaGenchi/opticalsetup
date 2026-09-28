// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Regression coverage for the feedback-round-1 features re-applied on top of
// the direct-manipulation branch: unified evanescent point source,
// concave-lens outline, and surface-aware snap anchors.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import '../sketch/js/etalon.js';
import { parseSketch } from '../sketch/js/state.js';

test('point source rays keep their short visual fade unless an optic is intersected', () => {
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

function pointSource() {
  const src = createElement('pointsource', 0, 0);
  src.params.nrays = 4;
  return src;
}

function rayPoints(elements, beams = []) {
  const points = traceAll(elements, beams).filter(d => d.type === 'path').flatMap(d => d.pts);
  assert.ok(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  return points;
}

test('point source activates across reflective, refractive, and diffractive component families at 1 m', () => {
  for (const type of [
    'lens', 'lensc', 'metalens', 'thicklens', 'lensgroup', 'telescope', 'objective',
    'freeglass', 'prism', 'glassrod', 'mirror', 'cmirror', 'cmirrorx', 'oap',
    'galvo', 'retroreflector', 'bs', 'pbs', 'dichroic', 'etalon', 'grating',
    'diffuser', 'slm', 'metasurface', 'dmd', 'dm', 'aom', 'aotf', 'eye',
    'asphericlens', 'conicmirror', 'polygonscanner', 'aod',
  ]) {
    const optic = createElement(type, 1000, 0);
    const points = rayPoints([pointSource(), optic]);
    assert.ok(points.some(p => p.x > 900), `${type} must activate the intersecting ray`);
  }
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

test('a beamsplitter activates both output branches', () => {
  const splitter = createElement('bs', 1000, 0);
  const points = rayPoints([pointSource(), splitter]);
  assert.ok(points.some(p => p.x > 1100 && Math.abs(p.y) < 1e-6), 'transmitted branch propagates');
  assert.ok(points.some(p => Math.abs(p.y) > 500), 'reflected branch propagates');
});

test('light transmitted through a partial mirror can activate at later glass', () => {
  const mirror = createElement('mirror', 1000, 0);
  mirror.params.refl = 30;
  mirror.params.showTransmitted = true;
  const glass = createElement('glassrod', 1200, 0);
  const detector = createElement('detector', 1500, 0);
  rayPoints([pointSource(), mirror, glass, detector]);
  assert.ok(detectorReading(detector.id)?.signal > 0);
  glass.x = 6100;
  detector.x = 6400;
  rayPoints([pointSource(), mirror, glass, detector]);
  assert.equal(detectorReading(detector.id), null, 'transmitted light keeps the remaining capture range');
});

test('point source reflects and reaches a downstream detector after activation', () => {
  const mirror = createElement('mirror', 1000, 0);
  mirror.rot = 45;
  const detector = createElement('detector', 1000, -600);
  detector.rot = -90;
  const points = rayPoints([pointSource(), mirror, detector]);
  assert.ok(points.some(p => Math.abs(p.x - 1000) < 1e-6 && p.y < -500));
  assert.ok(detectorReading(detector.id)?.signal > 0, 'reflected light reaches the detector');
});

test('distant freeform glass activates the ray and refracts through both faces', () => {
  const glass = createElement('freeglass', 1000, 10);
  glass.params.ior = 1.5;
  glass.params.vertices = [{ x: -35, y: -30 }, { x: 35, y: 0 }, { x: -35, y: 30 }];
  const points = rayPoints([pointSource(), glass]);
  assert.ok(points.some(p => Math.abs(p.x - 965) < 1e-6 && Math.abs(p.y) < 1e-6), 'entry face is traced');
  assert.ok(points.some(p => p.x > 1000 && p.x < 1035), 'exit face is traced');
  assert.ok(points.some(p => p.x > 1100 && Math.abs(p.y) > 100), 'the wedge bends the outgoing ray');
});

test('activation includes the 5 m boundary and stops beyond it', () => {
  const lens = createElement('lens', 5000, 0);
  assert.ok(rayPoints([pointSource(), lens]).some(p => p.x > 5000));
  lens.x = 5000.1;
  assert.ok(rayPoints([pointSource(), lens]).every(p => Math.hypot(p.x, p.y) <= 110 + 1e-8));
});

test('missed optics, diagram-only elements, and blocking surfaces do not activate rays', () => {
  const src = pointSource();
  const lens = createElement('lens', 1000, 100); // misses the four sampled axes
  const annotation = createElement('textlabel', 500, 0);
  assert.ok(rayPoints([src, lens, annotation]).every(p => Math.hypot(p.x, p.y) <= 110 + 1e-8));

  lens.y = 0;
  const blocker = createElement('blocker', 500, 0);
  const points = rayPoints([src, blocker, lens]);
  assert.ok(points.every(p => Math.hypot(p.x, p.y) <= 110 + 1e-8), 'the source must not see through the blocker');
});

test('fiber inputs still collect point-source rays at the extended range', () => {
  const fiber = {
    id: 'collection-fiber', kind: 'fiber', width: 4, propagate: true,
    pts: [{ x: 1000, y: 0 }, { x: 1200, y: 0 }],
  };
  assert.ok(rayPoints([pointSource()], [fiber]).some(p => p.x > 1300));
});

test('point source emission angle restricts the fan without duplicate full-circle samples', () => {
  const full = registry.pointsource.source({ params: { spread: 360, nrays: 8 } });
  assert.equal(full.length, 8);
  const angles = full.map(r => Math.atan2(r.dy, r.dx).toFixed(6));
  assert.equal(new Set(angles).size, 8, 'no duplicated -180/+180 sample');
  assert.ok(full.every(r => r.evan && r.evanLen === 110));

  const cone = registry.pointsource.source({ params: { spread: 60, nrays: 5 } });
  assert.ok(cone.every(r => Math.abs(Math.atan2(r.dy, r.dx)) <= (30 + 1e-9) * Math.PI / 180));
});

test('led and lamp remain merged into Point source, the lamp now as a mode', () => {
  // Both were folded into Point source in July on the grounds that neither did
  // anything the point source could not. That still holds: a discharge lamp is
  // geometrically a point source and differs only in its spectrum, so it is a
  // mode of this element rather than an element of its own.
  assert.equal(Object.hasOwn(registry, 'led'), false);
  assert.equal(Object.hasOwn(registry, 'lamp'), false);
  assert.ok(registry.pointsource.params.some(p => p.key === 'sourceKind'),
    'and the lamp lives here, as a source mode');
  assert.ok(!registry.pointsource.hidden, 'pointsource is visible');
  // still searchable under their old names
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
