// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
import { traceAll, detectorReading, probeAt, probePowerAt } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';
import { buildSVG } from '../sketch/js/export.js';

const at = (type, x, y = 0, params = {}) => {
  const el = createElement(type, x, y);
  Object.assign(el.params, params);
  return el;
};
const source = (params = {}) => at('pointsource', 0, 0, { nrays: 4, ...params });
const load = elements => parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements, beams: [] }), registry).elements;
const paths = elements => traceAll(elements).filter(d => d.type === 'path');
const signal = (elements, detector) => {
  traceAll([...elements, detector]);
  return detectorReading(detector.id)?.signal ?? 0;
};
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`);

test('new point sources reach bare detectors beyond the old capture range', () => {
  const src = source({ captureRange: 110, escapeLength: 10 });
  assert.equal(src.params.propagation, 'normal');
  assert.ok(registry.pointsource.source(src).every(ray => !ray.evan));
  for (const distance of [50, 111, 1001, 5500]) {
    close(signal([src], at('detector', distance)), 0.25);
  }
  close(signal([src], at('detector', 500, 100)), 0); // no sampled ray intersects
});

test('filters, polarizers and opaque surfaces act without a collector', () => {
  const src = source(), detector = at('detector', 600);
  close(signal([src, at('filter', 200, 0, { ftype: 'nd', trans: 0.3 })], detector), 0.075);
  close(signal([src, at('polarizer', 200)], detector), 0.125);
  close(signal([src, at('filter', 200, 0, { ftype: 'bandpass', center: 800, band: 10 })], detector), 0);
  for (const type of ['blocker', 'beamdump', 'cwlaser']) {
    const opaque = at(type, 200);
    if (type === 'cwlaser') opaque.rot = 180; // housing blocks, its own beam points away
    close(signal([src, opaque], detector), 0);
  }
  close(signal([src, at('textlabel', 200), at('arrowann', 300)], detector), 0.25);
});

test('a partial mirror transmits ordinary point-source light beyond the old range', () => {
  const mirror = at('mirror', 200, 0, { refl: 30, showTransmitted: true });
  close(signal([source({ captureRange: 110 }), mirror], at('detector', 1500)), 0.25 * 0.7);
});

test('freeform glass alone refracts point-source light and respects surface transmission', () => {
  const src = source(), glass = at('freeglass', 200, 0, { transEff: 80 });
  // Parallel faces at oblique incidence: two refractions yield a lateral shift.
  glass.params.vertices = [{ x: -20, y: -100 }, { x: 20, y: -100 }, { x: 20, y: 100 }, { x: -20, y: 100 }];
  glass.rot = 25;
  const detector = at('detector', 500, 0, { aperture: 100 });
  close(signal([src, glass], detector), 0.25 * 0.8 ** 2);
  const drawn = paths([src, glass]);
  const forward = drawn.flatMap(p => p.pts).filter(p => p.x > 150);
  assert.ok(forward.some(p => Math.abs(p.y) > 1), 'glass changes the path without any lens behind it');
  assert.ok(forward.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test('a point source born inside freeform glass can undergo TIR and exit', () => {
  const src = source(); src.rot = 20;
  const glass = at('freeglass', 0, 0, {
    ior: 1.5, transEff: 100,
    vertices: [{ x: -100, y: -10 }, { x: 100, y: -10 }, { x: 100, y: 10 }, { x: -100, y: 10 }],
  });
  const drawn = paths([src, glass]);
  assert.ok(drawn.flatMap(p => p.pts).some(p => p.x > 100), 'light exits the end face');
  assert.ok(drawn.flatMap(p => p.pts).every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.ok(drawn.some(p => p.pts.some(q => Math.abs(Math.abs(q.y) - 10) < 1e-6)), 'internal face hit');
});

test('catalogue freeform glass disperses a broadband point source without collectors', () => {
  const src = source({ bwMode: 'band', bandwidth: 200 });
  src.y = 10;
  const glass = at('freeglass', 180, 0, {
    material: 'nbk7', vertices: [{ x: -35, y: -30 }, { x: 35, y: 0 }, { x: -35, y: 30 }],
  });
  const drawn = paths([src, glass]).filter(p => p.pts.some(q => q.x > 200));
  assert.ok(new Set(drawn.map(p => p.color)).size > 1, 'distinct spectral output rays');
  const slopes = drawn.map(p => {
    const a = p.pts.at(-2), b = p.pts.at(-1);
    return (b.y - a.y) / (b.x - a.x);
  });
  assert.ok(Math.max(...slopes) - Math.min(...slopes) > 0.001, 'wavelengths leave at different angles');
});

test('lamp lines reach a bare detector and grating without a collection optic', () => {
  const src = source({ sourceKind: 'lamp', lampType: 'na' });
  const detector = at('detector', 500);
  close(signal([src], detector), 0.25);
  const reading = detectorReading(detector.id);
  assert.ok(reading.bandMax > reading.bandMin, 'both sodium lines arrive');
  const grating = at('grating', 200);
  const drawn = paths([src, grating]);
  assert.ok(drawn.some(p => p.pts.some(q => q.x > 100 && Math.abs(q.y) > 1)), 'diffracted output is traced');
});

test('escaping-ray length only clips the drawing, leaving probes and detector power intact', () => {
  const src = source({ escapeLength: 10 });
  const detector = at('detector', 500);
  for (const length of [10, 110, 1000, 6000]) {
    src.params.escapeLength = length;
    const drawn = paths([src]);
    close(Math.max(...drawn.flatMap(p => p.pts).map(p => Math.hypot(p.x, p.y))), length);
    close(probeAt(900, 0, 1).intensity, 1);
    close(probePowerAt(900, 0, 1).sourceFractions[0].fraction, 0.25);
    close(signal([src], detector), 0.25);
    const face = registry.detector.surfaces(detector).find(s => s.kind === 'detector');
    assert.ok(paths([src, detector]).some(p => p.pts.some(q => q.x === detector.x + face.x1)), 'full leg to detector remains drawn');
  }
});

test('display clipping after refraction retains full optical paths for probes', () => {
  const src = source({ escapeLength: 10 });
  const glass = at('freeglass', 200, 0, {
    transEff: 100,
    vertices: [{ x: -20, y: -50 }, { x: 20, y: -50 }, { x: 20, y: 50 }, { x: -20, y: 50 }],
  });
  const drawn = paths([src, glass]);
  close(Math.max(...drawn.flatMap(p => p.pts).map(p => p.x)), 230);
  close(probePowerAt(900, 0, 1).sourceFractions[0].fraction, 0.25);
});

test('SVG uses the same escaping-ray display length as the canvas drawables', () => {
  state.beams = [];
  const src = source({ escapeLength: 10 });
  state.elements = [src];
  const svg = buildSVG({ bounds: { x: -20, y: -20, w: 40, h: 40 } });
  const exported = [...svg.matchAll(/<polyline points="([^"]+)"/g)]
    .flatMap(match => match[1].split(' ').map(pair => pair.split(',').map(Number)));
  assert.ok(exported.length > 0);
  close(Math.max(...exported.map(([x, y]) => Math.hypot(x, y))), 10);
});

test('saved sources migrate to explicit legacy mode; new and upgraded sources round-trip normally', () => {
  const old = source();
  delete old.params.propagation;
  delete old.params.captureRange;
  const [loaded] = load([old]);
  assert.equal(loaded.params.propagation, 'legacy');
  assert.equal(loaded.params.captureRange, 165);
  close(signal([loaded], at('detector', 500)), 0);
  loaded.params.propagation = 'normal';
  close(signal(load([loaded]), at('detector', 500)), 0.25);
  const [fresh] = load([source({ escapeLength: 300 })]);
  assert.equal(fresh.params.propagation, 'normal');
  assert.equal(fresh.params.escapeLength, 300);
  const [withRange] = load([{ ...old, params: { ...old.params, captureRange: 450 } }]);
  assert.equal(withRange.params.captureRange, 450);
});

test('escaping-ray display values are bounded on load and safe for direct traces', () => {
  for (const [value, expected] of [[-100, 10], [1e9, 6000], [null, 110], ['bad', 110]]) {
    const [loaded] = load([source({ escapeLength: value })]);
    assert.equal(loaded.params.escapeLength, expected);
  }
  for (const value of [NaN, Infinity, -Infinity, undefined, null]) {
    assert.ok(paths([source({ escapeLength: value })]).flatMap(p => p.pts)
      .every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
});
