// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
import { traceScene, getTraceRevision, detectorReading } from '../sketch/js/raytrace.js';
import { SceneTraceCache, screenRectInWorld, denseRepaint } from '../sketch/js/point-source-rendering.js';
import { readFileSync } from 'node:fs';
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

test('the Rays slider is a logarithmic ladder: each position one count, read back as itself', async () => {
  const { shouldUseSlider, logSliderLadder, logSliderPosition, logSliderValue } = await import('../sketch/js/inspector.js');
  const spec = registry.pointsource.params.find(p => p.key === 'nrays');
  assert.equal(spec.slider, 'log');
  assert.ok(shouldUseSlider(spec));
  assert.equal(shouldUseSlider({ ...spec, min: 0 }), false, 'a log slider needs a positive minimum');
  const { min, max, step } = spec;
  const ladder = logSliderLadder(min, max, step);
  const last = ladder.length - 1;
  assert.equal(ladder[0], 4);
  assert.equal(ladder[last], 4096);
  for (let i = 1; i <= last; i++) {
    assert.ok(ladder[i] > ladder[i - 1] && Number.isInteger(ladder[i]) && ladder[i] % 2 === 0, `rung ${i}: ${ladder[i]}`);
  }
  // Every count up to 48 is on the ladder, so the low end skips nothing;
  // 4-128 rays take over a third of the travel, not 3 %; each later rung is
  // at most 6 % above the one before, plus the rounding to an even count.
  for (let n = 4; n <= 48; n += 2) assert.ok(ladder.includes(n), `${n} rays`);
  const share = logSliderPosition(128, min, max, step) / last;
  assert.ok(share > 0.35 && share < 0.5, `128 rays at ${share}`);
  for (let i = 1; i <= last; i++) {
    assert.ok(ladder[i] <= ladder[i - 1] * 1.06 + step, `rung ${i}: ${ladder[i - 1]} -> ${ladder[i]}`);
  }
  // Each position is one count and reads back as itself: the change event
  // that follows any input keeps what the input set, and every arrow key
  // reaches the next count (found in review: from 108 an arrow step was
  // undone on change, and releasing a drag at 6 rays changed it to 8).
  for (let p = 0; p <= last; p++) {
    const value = logSliderValue(p, min, max, step);
    assert.equal(logSliderPosition(value, min, max, step), p, `position ${p} reads back`);
    if (p > 0) assert.ok(value > logSliderValue(p - 1, min, max, step), `position ${p} advances`);
  }
  // A typed count off the ladder, such as 108, puts the thumb on the nearest
  // rung; an arrow key from there moves to a neighbouring rung and stays.
  const from108 = logSliderPosition(108, min, max, step);
  const left = logSliderValue(from108 - 1, min, max, step);
  assert.ok(Math.abs(logSliderValue(from108, min, max, step) - 108) <= 4);
  assert.ok(left < 108 && logSliderValue(logSliderPosition(left, min, max, step), min, max, step) === left);
  const six = logSliderPosition(6, min, max, step);
  assert.equal(logSliderValue(six, min, max, step), 6, 'releasing at 6 rays keeps 6');
  // Values the exact field accepts off the ladder land on the nearest rung.
  assert.equal(logSliderValue(logSliderPosition(4094, min, max, step), min, max, step), 4096);
  for (const bad of [NaN, -5, 1e9]) {
    const position = logSliderPosition(bad, min, max, step);
    assert.ok(position >= 0 && position <= last);
  }
  assert.equal(logSliderValue(-3, min, max, step), 4);
  assert.equal(logSliderValue(1e9, min, max, step), 4096);
});

test('the dense layer is an SVG image placed in world space, repainted only when needed', () => {
  // Safari painted a canvas inside <foreignObject> above every later SVG
  // element, so lenses and mirrors disappeared behind dense rays.
  const canvasSource = readFileSync(new URL('../sketch/js/canvas.js', import.meta.url), 'utf8');
  assert.doesNotMatch(canvasSource, /foreignObject/);
  assert.match(canvasSource, /<image data-point-source-layer=/);
  // The image covers exactly what the screen shows, so the viewport transform
  // maps it back onto the screen pixel for pixel.
  const view = { x: 120, y: -40, z: 2 };
  const rect = screenRectInWorld(view, 800, 600);
  assert.deepEqual(rect, { x: -60, y: 20, width: 400, height: 300 });
  assert.equal(rect.x * view.z + view.x, 0);
  assert.equal((rect.y + rect.height) * view.z + view.y, 600);
  const painted = { x: 120, y: -40, z: 2, width: 800, height: 600, dpr: 2 };
  assert.equal(denseRepaint(false, painted, { ...painted }), 'none', 'a selection change repaints nothing');
  assert.equal(denseRepaint(false, painted, { ...painted, x: 150 }), 'later', 'a pan moves the image, then fills the edges');
  assert.equal(denseRepaint(false, painted, { ...painted, z: 3 }), 'later', 'a zoom scales it, then sharpens');
  assert.equal(denseRepaint(true, painted, { ...painted }), 'now', 'new rays');
  assert.equal(denseRepaint(false, painted, { ...painted, width: 900 }), 'now', 'a resized canvas');
  assert.equal(denseRepaint(false, painted, { ...painted, dpr: 1 }), 'now', 'another screen');
  assert.equal(denseRepaint(false, null, { ...painted }), 'now', 'never painted');
});
