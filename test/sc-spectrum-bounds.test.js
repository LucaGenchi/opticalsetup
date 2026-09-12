import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry, normalizeSupercontinuumParams } from '../sketch/js/elements.js';
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
  // Each stops one 10 nm step short of the other, never at it.
  assert.equal(minimum.max({ scMax: 700 }), 690);
  assert.equal(minimum.max({ scMax: 1000 }), 990);
  assert.equal(maximum.min({ scMin: 600 }), 610);
  assert.equal(maximum.min({ scMin: 300 }), 310);
});

test('continuum import keeps finite ordered endpoints at schema extremes', () => {
  for (const [lo, hi] of [[12000, 200], [-100, -200], [15000, 14000], [-1, 13000], [null, null], [800, 800]]) {
    const p = loadBand(lo, hi).params;
    assert.ok(Number.isFinite(p.scMin) && Number.isFinite(p.scMax));
    assert.ok(p.scMin >= 200 && p.scMax <= 12000 && p.scMax - p.scMin >= 10 - 1e-9,
      `${lo}/${hi} loaded as ${p.scMin}/${p.scMax}`);
  }
});

// A crossed entry used to clamp to equal endpoints. A zero-width band has no
// finite transform limit, so the duration floor lifted the pulse to the
// field's 1e9 fs ceiling -- and it stayed there once the band was put right,
// because widening a band never shortens a pulse.
test('typing an endpoint past the other one leaves the pulse duration alone', () => {
  const defs = registry.sclaser.params;
  const commit = (params, key, typed) => {
    const spec = defs.find(p => p.key === key);
    const lo = typeof spec.min === 'function' ? spec.min(params) : spec.min;
    const hi = typeof spec.max === 'function' ? spec.max(params) : spec.max;
    params[key] = Math.min(hi, Math.max(lo, typed));
    Object.assign(params, normalizeSupercontinuumParams(params));
  };
  const params = { scMin: 400, scMax: 700, pulseShape: 'gauss', pulseWidthFs: 100 };
  commit(params, 'scMin', 910);
  assert.deepEqual([params.scMin, params.scMax], [690, 700], 'the minimum stops one step short');
  assert.equal(params.pulseWidthFs, 100, 'a 10 nm band still admits the 100 fs pulse');
  commit(params, 'scMin', 500);
  commit(params, 'scMax', 300);
  assert.deepEqual([params.scMin, params.scMax], [500, 510]);
  assert.equal(params.pulseWidthFs, 100);
});
