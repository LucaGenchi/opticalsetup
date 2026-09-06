import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, getElementMeta, getDirectManipulation, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { conicMirrorGeometry } from '../sketch/js/conic-mirror.js';
import { asphereSag } from '../sketch/js/asphere.js';
import { traceScene, traceAll, detectorReading } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { toWorld, toLocal } from '../sketch/js/util.js';

function line(height, mirrorParams = {}, angle = 0, fromBack = false) {
  const mirror = createElement('conicmirror', 200, 50);
  Object.assign(mirror.params, { radius: -100, conic: -1, dia: 60, refl: 100, ...mirrorParams });
  mirror.rot = angle;
  const sourcePoint = toWorld(mirror, fromBack ? 180 : -180, height);
  const source = createElement('cwlaser', sourcePoint.x, sourcePoint.y);
  source.rot = angle + (fromBack ? 180 : 0);
  source.params.beamMode = 'line';
  const path = traceScene([source, mirror]).drawables.find(d => d.type === 'path');
  return { mirror, path };
}

test('a parabolic conic reflects every admitted axial ray to the analytic focus', () => {
  for (const angle of [0, 33, 180]) for (const height of [-25, -8, 8, 25]) {
    const { mirror, path } = line(height, {}, angle);
    assert.equal(path.pts.length, 3);
    const hit = toLocal(mirror, path.pts[1].x, path.pts[1].y);
    const end = toLocal(mirror, path.pts[2].x, path.pts[2].y);
    assert.ok(Math.abs(hit.x - asphereSag(hit.y, { R: -100, k: -1 })) < 1e-8);
    const focus = hit.x + (end.x - hit.x) * -hit.y / (end.y - hit.y);
    assert.ok(Math.abs(focus + 50) < 1e-7, `${angle}°, h=${height}: ${focus}`);
  }
});

test('the central hole and exterior miss; the annulus and hole boundary reflect', () => {
  for (const height of [0, 4.99, 30.1]) assert.equal(line(height, { hole: 10 }).path.pts.length, 2);
  for (const height of [5, -5, 29.9]) assert.equal(line(height, { hole: 10 }).path.pts.length, 3);
  assert.equal(line(10, { hole: 60 }).path.pts.length, 2, 'a fully open element has no coating');
  assert.equal(line(10, { hole: 500 }).path.pts.length, 2);
});

test('an oblique ray can enter through the hole then hit the same curved annulus', () => {
  // x = y/4 cuts x=y²/200 at y=0 (open) and y=50 (reflective).
  // The first rejected root must not hide the second valid root.
  const mirror = createElement('conicmirror', 200, 0);
  Object.assign(mirror.params, { radius: 100, conic: -1, dia: 120, hole: 10, facing: 'right' });
  const source = createElement('cwlaser', 170, -120);
  source.rot = Math.atan2(4, 1) * 180 / Math.PI;
  source.params.beamMode = 'line';
  const path = traceScene([source, mirror]).drawables.find(d => d.type === 'path');
  assert.ok(path.pts.length >= 3);
  assert.ok(Math.abs(path.pts[1].y - 50) < 1e-6);
});

test('opaque rear and coating losses absorb instead of inventing transmitted rays', () => {
  assert.equal(line(12, {}, 0, true).path.pts.length, 2);
  const zero = line(12, { refl: 0 });
  assert.equal(zero.path.pts.length, 2);
  assert.ok(zero.path.pts.at(-1).x < 200, 'ray ends at the coating');
  const half = line(12, { refl: 50 });
  assert.equal(half.path.pts.length, 3);
});

test('sphere, plane, convex and hyperbolic prescriptions remain finite', () => {
  for (const radius of [-100, 0, 100]) for (const conic of [-3, -1, 0, 1]) {
    const { path } = line(12, { radius, conic });
    assert.ok(path.pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
    assert.equal(path.pts.length, 3);
  }
  const convex = line(12, { radius: 100 });
  assert.ok(convex.path.pts.at(-1).y > convex.path.pts[1].y);
});

test('malformed geometry is bounded, disclosed, serializable and editable', () => {
  const raw = { app: 'optics2d', version: 1, beams: [], elements: [{
    id: 'm', type: 'conicmirror', x: 0, y: 0, params: { radius: 1, conic: 999, dia: 999, hole: -10, refl: 1000, facing: 'bad' },
  }] };
  const [el] = parseSketch(JSON.stringify(raw), registry).elements;
  assert.equal(el.params.conic, 20);
  assert.equal(el.params.dia, 500);
  assert.equal(el.params.hole, 0);
  assert.equal(el.params.refl, 100);
  assert.equal(el.params.facing, 'left');
  assert.ok(conicMirrorGeometry(el.params).R > 250 * Math.sqrt(21));
  assert.match(registry.conicmirror.params.find(p => p.key === 'realized').readout(el.params), /R = /);
  assert.doesNotMatch(registry.conicmirror.svg(el), /NaN|Infinity|undefined/);
  assert.equal(getElementMeta('conicmirror', el.params).tier, 'simulated');
  assert.equal(getDirectManipulation(el).resize.y, 'dia');
  const invalid = conicMirrorGeometry({ radius: NaN, conic: Infinity, dia: Infinity, hole: NaN, refl: Infinity });
  for (const key of ['R', 'k', 'h', 'inner', 'refl']) assert.ok(Number.isFinite(invalid[key]));
});

const exampleText = readFileSync(new URL('../Examples/Microscopy Implementations/IR Cassegrain objective — element by element.json', import.meta.url), 'utf8');
function example(change = () => {}) {
  const scene = parseSketch(exampleText, registry);
  change(id => scene.elements.find(el => el.id === id));
  traceAll(scene.elements);
  return { scene, reading: detectorReading('focus-sensor') };
}

test('Cassegrain example uses two independent mirrors and focuses after exactly two reflections', () => {
  const { scene, reading } = example();
  assert.equal(scene.elements.filter(el => el.type === 'conicmirror').length, 2);
  assert.equal(scene.beams.length, 0);
  assert.ok(reading.signal > 0.4);
  assert.ok(reading.spotSpan < 1e-8);
  // Independent line samples establish the physical route without camera interpolation.
  for (const height of [-16, -12, -8, 8, 12, 16]) {
    const source = createElement('cwlaser', 80, 230 + height);
    source.params.beamMode = 'line';
    const mirrors = scene.elements.filter(el => el.type === 'conicmirror');
    const path = traceScene([source, ...mirrors]).drawables.find(d => d.type === 'path');
    assert.equal(path.pts.length, 4);
    assert.ok(path.pts[1].x > 370, 'convex secondary first');
    assert.ok(path.pts[2].x < 280, 'concave primary second');
    const a = path.pts[2], b = path.pts[3];
    const focus = a.x + (b.x - a.x) * (230 - a.y) / (b.y - a.y);
    assert.ok(Math.abs(focus - 530) < 1e-7);
  }
});

test('Cassegrain control experiments change only the expected geometry or throughput', () => {
  const base = example().reading;
  const clipped = example(get => { get('primary').params.hole = 20; }).reading;
  assert.ok(clipped.signal > 0 && clipped.signal < base.signal / 2);
  const spheres = example(get => { get('primary').params.conic = 0; get('secondary').params.conic = 0; }).reading;
  assert.ok(spheres.spotSpan > 0.1);
  const ir = example(get => { get('source').params.wavelength = 10000; }).reading;
  assert.equal(ir.wavelength, 10000);
  assert.ok(Math.abs(ir.spotSpan - base.spotSpan) < 1e-9);
  const half = example(get => { get('primary').params.refl = 49; }).reading;
  assert.ok(Math.abs(half.signal - base.signal / 2) < 1e-9);
  const dark = example(get => { get('primary').params.refl = 0; }).reading;
  assert.ok(!dark || dark.signal === 0);
});

test('save and reload preserve the computed focus and apertures', () => {
  const { scene, reading } = example();
  const again = parseSketch(JSON.stringify(scene), registry);
  traceAll(again.elements);
  const restored = detectorReading('focus-sensor');
  assert.equal(restored.signal, reading.signal);
  assert.equal(restored.spotSpan, reading.spotSpan);
});
