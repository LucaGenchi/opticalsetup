import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';

const LENS_TYPES = ['lens', 'lensc', 'telescope', 'objective'];

test('every lens and the objective have a transmission efficiency param defaulting to 100%', () => {
  for (const type of LENS_TYPES) {
    const el = createElement(type);
    assert.equal(el.params.transEff, 100, `${type} should default to 100% transmission efficiency`);
    const spec = registry[type].params.find(p => p.key === 'transEff');
    assert.ok(spec, `${type} should expose a transEff param`);
    assert.equal(spec.label, 'Transmission efficiency (%)');
  }
});

test('a convex lens at 100% transmission passes power through unchanged', () => {
  const laser = createElement('laser', 0, 0);
  const lens = createElement('lens', 150, 0);
  lens.params.f = 100;
  const detector = createElement('detector', 300, 0);
  traceAll([laser, lens, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 1) < 1e-9);
});

test('a lens below 100% transmission attenuates power/intensity by exactly that fraction', () => {
  const laser = createElement('laser', 0, 0);
  const lens = createElement('lens', 150, 0);
  lens.params.f = 100;
  lens.params.transEff = 80;
  const detector = createElement('detector', 300, 0);
  traceAll([laser, lens, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.8) < 1e-9);
});

test('the objective attenuates by its own transmission efficiency', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.beamMode = 'line';
  const objective = createElement('objective', 150, 0);
  objective.params.f = 20;
  objective.params.transEff = 75;
  const detector = createElement('detector', 400, 0);
  traceAll([laser, objective, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.75) < 1e-9);
});

test('a telescope applies its shared transmission efficiency at each of its two lens surfaces', () => {
  const laser = createElement('laser', 0, 0);
  const telescope = createElement('telescope', 300, 0);
  telescope.params.f1 = 100;
  telescope.params.f2 = 50;
  telescope.params.transEff = 90;
  const detector = createElement('detector', 700, 0);
  traceAll([laser, telescope, detector]);
  // Two real lenses sharing one coating spec: overall throughput is T², not T.
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.81) < 1e-9);
});

test('a concave lens (lensc) inherits the same transmission efficiency behavior as the convex lens', () => {
  const laser = createElement('laser', 0, 0);
  const lensc = createElement('lensc', 150, 0);
  lensc.params.transEff = 60;
  const detector = createElement('detector', 300, 0);
  traceAll([laser, lensc, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.6) < 1e-9);
});
