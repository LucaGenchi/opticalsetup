import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import '../sketch/js/detector-instruments.js';

function loadBand(scMin, scMax) {
  const source = createElement('sclaser', 0, 0);
  Object.assign(source.params, { scMin, scMax, beamMode: 'line' });
  return parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [source], beams: [] }), registry).elements[0];
}

test('loading reversed continuum endpoints preserves the previously emitted band', () => {
  const source = loadBand(900, 700);
  assert.equal(source.params.scMin, 700);
  assert.equal(source.params.scMax, 900);
  const spec = createElement('spectrometer', 200, 0);
  traceAll([source, spec], []);
  assert.equal(detectorReading(spec.id).bandMin, 700);
  assert.equal(detectorReading(spec.id).bandMax, 900);
});

test('continuum endpoint bounds follow the other endpoint', () => {
  const defs = registry.sclaser.params;
  const minimum = defs.find(p => p.key === 'scMin');
  const maximum = defs.find(p => p.key === 'scMax');
  assert.equal(minimum.max({ scMax: 700 }), 700);
  assert.equal(minimum.max({ scMax: 1000 }), 1000);
  assert.equal(maximum.min({ scMin: 600 }), 600);
  assert.equal(maximum.min({ scMin: 300 }), 300);
});

test('continuum import keeps finite ordered endpoints at schema extremes', () => {
  for (const [lo, hi] of [[12000, 200], [-100, -200], [15000, 14000], [-1, 13000], [null, null], [800, 800]]) {
    const p = loadBand(lo, hi).params;
    assert.ok(Number.isFinite(p.scMin) && Number.isFinite(p.scMax));
    assert.ok(p.scMin >= 200 && p.scMax <= 12000 && p.scMin <= p.scMax);
  }
});
