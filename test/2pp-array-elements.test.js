import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry, getElementMeta } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';

const mk = (type, x, y, params = {}) => {
  const e = createElement(type, x, y); e.id = `${type}-${x}-${y}`;
  Object.assign(e.params, params); return e;
};

test('microlens array focuses each lenslet onto its own axis', () => {
  const array = mk('microlensarray', 100, 0, { length: 48, count: 4, f: 40 });
  for (const y of [-22, -18, -13, -10, -6, -1, 2, 6, 11, 14, 18, 22]) {
    const source = mk('cwlaser', 0, y, { beamMode: 'line' });
    const path = traceScene([source, array]).drawables.find(s => s.type === 'path' && Math.abs(s.pts[0].x - 100) < 0.01);
    const [a, b] = path.pts.slice(-2);
    const idx = Math.min(3, Math.max(0, Math.floor((y + 24) / 12)));
    const axis = -24 + (idx + 0.5) * 12;
    const focusY = a.y + (140 - a.x) * (b.y - a.y) / (b.x - a.x);
    assert.ok(Math.abs(focusY - axis) < 0.01, `${focusY} vs ${axis}`);
  }
});

test('diffractive splitter makes three angular orders and rejects evanescent orders', () => {
  const source = mk('cwlaser', 0, 0, { wavelength: 800, beamMode: 'line' });
  const doe = mk('diffractivesplitter', 100, 0, { lines: 60, orders: '-1,0,1' });
  const detector = mk('detector', 180, 0, { aperture: 100 });
  let out = traceScene([source, doe, detector]).drawables.filter(s => s.type === 'path' && Math.abs(s.pts[0].x - 100) < 0.01);
  assert.equal(out.length, 3);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 1) < 1e-8);
  const angles = out.map(s => { const [a,b] = s.pts.slice(-2); return Math.atan2(b.y-a.y,b.x-a.x); }).sort((a,b) => a-b);
  assert.ok(Math.abs(Math.sin(angles[0]) + 0.048) < 1e-8);
  assert.ok(Math.abs(Math.sin(angles[2]) - 0.048) < 1e-8);
  doe.params.orders = '0,1000';
  out = traceScene([source, doe, detector]).drawables.filter(s => s.type === 'path' && Math.abs(s.pts[0].x - 100) < 0.01);
  assert.equal(out.length, 1);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.5) < 1e-8, 'non-propagating power is not redistributed');
});

test('malformed arrays normalize to finite bounded geometry and branching', () => {
  const raw = { elements: [
    mk('microlensarray', 100, 0, { count: 1e9, f: -1, length: -100 }),
    mk('diffractivesplitter', 200, 0, { lines: null, orders: 'bad,NaN,Infinity,1.5' }),
  ] };
  const scene = parseSketch(JSON.stringify(raw), registry);
  assert.equal(scene.elements[0].params.count, 8);
  assert.equal(scene.elements[0].params.f, 1);
  assert.equal(scene.elements[0].params.length, 4);
  const result = traceScene([mk('cwlaser', 0, 0), ...scene.elements]);
  assert.ok(result.drawables.every(s => (s.pts || []).every(p => [p.x, p.y].every(Number.isFinite))));
});

test('disabled paper sources emit no rays; legacy sources still emit', () => {
  for (const type of ['cwlaser', 'pulsedlaser']) {
    const source = mk(type, 0, 0, { enabled: false });
    assert.equal(traceScene([source]).drawables.length, 0);
    assert.match(getElementMeta(type, source.params).note, /emission is off/);
    delete source.params.enabled;
    assert.ok(traceScene([source]).drawables.length > 0);
    const restored = parseSketch(JSON.stringify({ elements: [source] }), registry).elements[0];
    assert.equal(restored.params.enabled, true);
  }
});

test('Fischer 3% AOM duty survives normalization and reaches the tracer gate', () => {
  const aom = mk('aom', 100, 0, { modulate: true, chopDuty: 0.03, modFreqMHz: 0.004 });
  const normalized = parseSketch(JSON.stringify({ elements: [aom] }), registry).elements[0];
  assert.equal(normalized.params.chopDuty, 0.03);
  assert.equal(registry.aom.surfaces(normalized)[0].data.gate.duty, 0.03);
});

test('metalens array retains independent axes and inverse-wavelength focal length', () => {
  const array = mk('metalensarray', 100, 0, { length: 48, count: 4, f: 40, designWavelength: 800 });
  for (const [wavelength, focal] of [[800,40],[400,80]]) {
    const source = mk('cwlaser', 0, -22, { beamMode: 'line', wavelength });
    const path = traceScene([source,array]).drawables.find(s => s.type === 'path');
    const [a,b] = path.pts.slice(-2);
    const focusY = a.y + (100+focal-a.x)*(b.y-a.y)/(b.x-a.x);
    assert.ok(Math.abs(focusY+18)<0.01);
  }
  const bad=mk('metalensarray',100,0,{count:10000,length:-1,f:0});
  const normalized=parseSketch(JSON.stringify({elements:[bad]}),registry).elements[0];
  assert.equal(registry.metalensarray.surfaces(normalized).length,8);
  assert.equal(normalized.params.f,1);
});
