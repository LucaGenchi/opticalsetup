import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
import { dmdPatternBands, dmdPatternOnAt, dmdPatternPhaseAt } from '../sketch/js/dmd-pattern.js';
import { traceScene } from '../sketch/js/raytrace.js';

test('DMD displayed ON/OFF intervals agree with routed rays at the same face coordinates', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  const dmd = createElement('dmd', 180, 0);
  Object.assign(dmd.params, { length: 40, pitch: 7, duty: 0.3, routeOff: false });
  const bands = dmdPatternBands(dmd.params);
  const svg = registry.dmd.svg(dmd);
  assert.ok(svg.includes('data-dmd-on="true"') && svg.includes('data-dmd-on="false"'));
  for (const band of bands) {
    laser.y = (band.y0 + band.y1) / 2;
    const outgoing = traceScene([laser, dmd]).drawables.filter(path =>
      path.type === 'path' && Math.abs(path.pts[0].x - 171) < 1e-6);
    assert.equal(outgoing.length > 0, band.on, `face y=${laser.y} should match the visible gate`);
  }
  const initial = registry.dmd.svg(dmd);
  dmd.params.duty = 0.8;
  assert.notEqual(registry.dmd.svg(dmd), initial, 'ON fraction must change the displayed mask');
  dmd.params.pitch = 3;
  assert.notEqual(dmdPatternBands(dmd.params).length, bands.length, 'pitch must change the displayed mask');
});

test('DMD mask playback and intervals remain bounded at endpoints and malformed inputs', () => {
  for (const params of [{}, { length: Infinity, pitch: NaN, duty: -1 }, { length: 100, pitch: 1, duty: 0.95 }]) {
    for (const phase of [0, 0.65, -1, Infinity]) {
      const bands = dmdPatternBands(params, phase);
      assert.ok(bands.length > 0 && bands.length <= 202);
      assert.ok(bands.every(b => Number.isFinite(b.y0) && Number.isFinite(b.y1) && b.y1 > b.y0));
      for (const band of bands) assert.equal(dmdPatternOnAt(params, (band.y0 + band.y1) / 2, phase), band.on);
    }
  }
  for (const time of [Infinity, NaN, 1e308, -1e308, 0, 1]) {
    const phase = dmdPatternPhaseAt({ sequence: true, sequenceHz: 10 }, time);
    assert.ok(Number.isFinite(phase) && phase >= 0 && phase < 1);
  }
});
