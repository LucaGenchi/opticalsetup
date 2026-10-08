// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
import { traceScene, getTraceRevision, detectorReading } from '../sketch/js/raytrace.js';
import { SceneTraceCache } from '../sketch/js/point-source-rendering.js';
import { parseSketch, state } from '../sketch/js/state.js';
import { buildSVG } from '../sketch/js/export.js';
import '../sketch/js/detector-instruments.js';

const source = (nrays = 4096) => {
  const el = createElement('pointsource', 0, 0);
  el.params.nrays = nrays;
  return el;
};
const load = el => parseSketch(JSON.stringify({app: 'optics2d', version: 1, elements: [el], beams: []}), registry).elements[0];
function bench() {
  const lamp = source();
  const lens = createElement('lens', 200, 0);
  Object.assign(lens.params, { f: 100, dia: 200 });
  const detector = createElement('detector', 400, 0);
  detector.params.aperture = 100;
  return { elements: [lamp, lens, detector], lamp, lens, detector };
}

test('dense ray counts round-trip; old counts and collection conversions survive', () => {
  for (const n of [4, 12, 128, 1024, 4096]) {
    const el = load(source(n));
    assert.equal(el.params.nrays, n);
    assert.equal(registry.pointsource.source(el).length, n);
  }
  assert.equal(load(source(1e9)).params.nrays, 4096);
  const old = source(24);
  delete old.params.captureRange;
  assert.equal(load(old).params.captureRange, 165);
  assert.equal(load(old).params.nrays, 24);
  delete old.params.nrays;
  assert.equal(load(old).params.nrays, 12);
  for (const bad of [NaN, Infinity, -Infinity, undefined]) {
    const malformed = source();
    malformed.params.nrays = bad;
    const rays = registry.pointsource.source(malformed);
    assert.equal(rays.length, 12);
    assert.ok(rays.every(r => Number.isFinite(r.dx) && Number.isFinite(r.dy)));
  }
});

test('canvas display uses every point-source ray with identical geometry and readings', () => {
  const { elements, detector } = bench();
  elements.push(createElement('cwlaser', -50, 200));
  const vector = traceScene(elements);
  const reading = detectorReading(detector.id).signal;
  assert.ok(reading > 0);
  const screen = traceScene(elements, [], { pointSourceCanvas: true });
  assert.equal(detectorReading(detector.id).signal, reading);
  const withoutDisplayFlag = screen.drawables.map(({ pointSourceCanvas, ...d }) => d);
  assert.deepEqual(withoutDisplayFlag, vector.drawables);
  assert.ok(screen.drawables.some(d => d.pointSourceCanvas));
  assert.ok(screen.drawables.some(d => !d.pointSourceCanvas), 'laser stays vector rendered');
});

test('cached tracing updates for in-place edits, blockers, beam edits, animated poses and external traces', () => {
  const { elements, lamp, detector } = bench();
  const cache = new SceneTraceCache(traceScene, getTraceRevision);
  const first = cache.get(elements, []);
  const revision = getTraceRevision();
  assert.equal(cache.get(elements, []), first);
  assert.equal(getTraceRevision(), revision, 'unchanged scene skips the tracer');
  lamp.x = 10;
  const moved = cache.get(elements, []);
  assert.notEqual(moved, first, 'mutation before changed() is visible');
  const block = createElement('box', 100, 0);
  Object.assign(block.params, { behavior: 'block', w: 5, h: 300 });
  elements.push(block);
  cache.get(elements, []);
  assert.equal(detectorReading(detector.id)?.signal ?? 0, 0);
  elements.pop();
  lamp.params.captureRange = 110;
  cache.get(elements, []);
  assert.equal(detectorReading(detector.id)?.signal ?? 0, 0);
  lamp.params.captureRange = 1000;
  cache.get(elements, []);
  assert.ok(detectorReading(detector.id).signal > 0);
  const beforeAnimation = cache.scene;
  elements[1]._animationTimeS = 1;
  assert.notEqual(cache.get(elements, []), beforeAnimation);
  const beam = { id: 'manual', kind: 'beam', pts: [{x: 0, y: 200}, {x: 100, y: 200}], color: '#ffffff', width: 2 };
  const withBeam = cache.get(elements, [beam]);
  beam.pts[1].x = 200;
  assert.notEqual(cache.get(elements, [beam]), withBeam);
  const cached = cache.scene;
  traceScene([]);
  assert.equal(detectorReading(detector.id), null);
  assert.notEqual(cache.get(elements, [beam]), cached, 'restore readouts after an export/independent trace');
  assert.ok(detectorReading(detector.id).signal > 0);
});

test('many dense sources export as finite vector geometry without argument overflow', () => {
  const oldElements = state.elements, oldBeams = state.beams;
  try {
    state.elements = Array.from({length: 4}, (_, i) => ({...source(), x: i * 250}));
    state.beams = [];
    const svg = buildSVG();
    assert.doesNotMatch(svg, /NaN|Infinity|foreignObject|<canvas/);
    assert.ok((svg.match(/<polyline /g) || []).length >= 4 * 4096);
  } finally {
    state.elements = oldElements; state.beams = oldBeams;
  }
});
