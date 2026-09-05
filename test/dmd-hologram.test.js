import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createElement, dmdBinaryHologramOn, dmdHologramAngles, getElementMeta, registry,
} from '../sketch/js/elements.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';

const outgoingAngles = params => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  const dmd = createElement('dmd', 100, 0);
  Object.assign(dmd.params, {
    pattern: 'hologram', pitch: 8, duty: 0.95, tilt: 12, ...params,
  });
  return traceScene([laser, dmd]).drawables
    .filter(path => path.type === 'path' && path.pts[0]?.x === 91)
    .map(path => {
      const [a, b] = path.pts;
      return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    }).sort((a, b) => a - b);
};

test('binary hologram mode creates the configured representative focus orders', () => {
  const three = outgoingAngles({ focusCount: 3, focusSpan: 6, scanAngle: 0 });
  assert.equal(three.length, 3);
  assert.ok(Math.abs((three[1] - three[0]) - 3) < 1e-9);
  assert.ok(Math.abs((three[2] - three[1]) - 3) < 1e-9);

  const shifted = outgoingAngles({ focusCount: 3, focusSpan: 6, scanAngle: 4 });
  assert.equal(shifted.length, 3);
  for (let index = 0; index < three.length; index++) {
    assert.ok(Math.abs((shifted[index] - three[index]) - 4) < 1e-9,
      'random-access scan must steer every represented focus');
  }
  assert.match(getElementMeta('dmd', { pattern: 'hologram' }).note, /one-dimensional geometric proxy/i);
});

test('legacy stripe mode keeps its single ON/OFF routing behavior', () => {
  assert.equal(outgoingAngles({ pattern: 'stripes', focusCount: 8 }).length, 1);
});

test('displayed hologram samples gate the same physical points on the DMD face', () => {
  const dmd = createElement('dmd', 100, 0);
  Object.assign(dmd.params, { pattern: 'hologram', length: 48, pitch: 4,
    duty: 0.5, focusCount: 3, focusSpan: 4, scanAngle: 1, routeOff: false });
  const svg = registry.dmd.svg(dmd);
  const bands = [...svg.matchAll(/data-dmd-height="([^"]+)" data-dmd-on="(true|false)"/g)];
  assert.ok(bands.some(band => band[2] === 'true') && bands.some(band => band[2] === 'false'));
  for (const [index, band] of bands.entries()) {
    if (index % 5) continue;
    const source = createElement('cwlaser', 0, Number(band[1]));
    source.params.beamMode = 'line';
    const paths = traceScene([source, dmd]).drawables.filter(path =>
      path.type === 'path' && Math.abs(path.pts[0]?.x - 91) < 1e-9);
    assert.equal(paths.length, band[2] === 'true' ? 3 : 0,
      `display and propagation disagree at local height ${band[1]}`);
  }
  dmd.params.focusSpan = 14;
  assert.notEqual(registry.dmd.svg(dmd), svg, 'focus-span control must also update the displayed mask');
});

test('representative hologram orders conserve accepted ray power', () => {
  const source = createElement('cwlaser', 0, 0); source.params.beamMode = 'line';
  const dmd = createElement('dmd', 200, 0);
  Object.assign(dmd.params, { pattern: 'hologram', duty: 0.95, focusCount: 8 });
  const paths = traceScene([source, dmd]).drawables.filter(path =>
    path.type === 'path' && path.pts[0]?.x === 191);
  assert.equal(paths.length, 8);
  // Unit input is divided into eight equal geometric branches. The opacity
  // is deliberately not a power meter; trace to a collecting detector instead.
  const detector = createElement('detector', 120, -27);
  detector.rot = 180;
  detector.params.aperture = 40;
  const all = traceScene([source, dmd, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 1) < 1e-9,
    'splitting into eight selected orders must not multiply incident power');
  assert.equal(detectorReading(detector.id).samples, 8);
  assert.ok(all.drawables.every(path => (path.pts || []).every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
});

test('malformed hologram inputs normalize and helper outputs stay finite and bounded', () => {
  const raw = createElement('dmd', 100, 0);
  Object.assign(raw.params, {
    pattern: 'hologram', focusCount: Infinity, focusSpan: -99,
    scanAngle: 1e9, pitch: NaN, duty: -1,
  });
  const [dmd] = parseSketch(JSON.stringify({ elements: [raw] }), registry).elements;
  assert.equal(dmd.params.focusCount, 3);
  assert.equal(dmd.params.focusSpan, 0);
  assert.equal(dmd.params.scanAngle, 20);
  assert.equal(dmd.params.pitch, 8);
  assert.equal(dmd.params.duty, 0.05);
  assert.deepEqual(dmdHologramAngles(dmd.params), [20, 20, 20]);
  for (const height of [-Infinity, -1e9, 0, 1e9, Infinity, NaN]) {
    assert.equal(typeof dmdBinaryHologramOn(height, dmd.params), 'boolean');
  }
  const scene = traceScene([createElement('cwlaser', 0, 0), dmd]);
  assert.ok(scene.drawables.every(path => (path.pts || []).every(point =>
    Number.isFinite(point.x) && Number.isFinite(point.y))));
});
