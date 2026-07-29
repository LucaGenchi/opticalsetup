import test from 'node:test';
import assert from 'node:assert/strict';

import { etalonDefinition, etalonSurfaces } from '../sketch/js/etalon.js';
import { registry } from '../sketch/js/elements.js';

const base = {
  aperture: 35,
  spacing: 12,
  etalonTilt: 0,
  reflectivity: 90,
  vipaTilt: 4,
  frontReflectivity: 99.9,
  outputReflectivity: 96,
  windowSize: 3,
  windowOffset: 0,
  showLeakage: true,
};

const length = surface => Math.hypot(surface.x2 - surface.x1, surface.y2 - surface.y1);
const direction = surface => {
  const l = length(surface);
  return { x: (surface.x2 - surface.x1) / l, y: (surface.y2 - surface.y1) / l };
};

test('registers one Etalon / VIPA palette element', () => {
  assert.equal(registry.etalon, etalonDefinition);
  assert.equal(etalonDefinition.category, 'Dispersive & Apertures');
  assert.deepEqual(etalonDefinition.params[0].options, [
    ['etalon', 'Fabry–Pérot etalon'],
    ['vipa', 'VIPA'],
  ]);
});

test('etalon mode creates two parallel partially reflective surfaces', () => {
  const surfaces = etalonSurfaces({ ...base, mode: 'etalon' });
  assert.equal(surfaces.length, 2);
  for (const surface of surfaces) {
    assert.equal(surface.kind, 'mirror');
    assert.equal(surface.data.refl, 90);
    assert.equal(surface.data.showTransmitted, true);
    assert.ok(Math.abs(length(surface) - 35) < 1e-9);
  }
  const a = direction(surfaces[0]), b = direction(surfaces[1]);
  assert.ok(Math.abs(a.x - b.x) < 1e-12);
  assert.ok(Math.abs(a.y - b.y) < 1e-12);
});

test('VIPA mode leaves an entrance window and leaks through the output coating', () => {
  const surfaces = etalonSurfaces({ ...base, mode: 'vipa' });
  assert.equal(surfaces.length, 3);
  const [frontA, frontB, output] = surfaces;
  assert.equal(frontA.data.refl, 99.9);
  assert.equal(frontB.data.refl, 99.9);
  assert.equal(frontA.data.showTransmitted, false);
  assert.equal(output.data.refl, 96);
  assert.equal(output.data.showTransmitted, true);
  assert.ok(Math.abs(length(frontA) + length(frontB) - 32) < 1e-9);
  assert.ok(Math.abs(length(output) - 35) < 1e-9);
  const a = direction(frontA), b = direction(output);
  assert.ok(Math.abs(a.x - b.x) < 1e-12);
  assert.ok(Math.abs(a.y - b.y) < 1e-12);
});
