import test from 'node:test';
import assert from 'node:assert/strict';

import { vipaDefinition, vipaSurfaces, resolveVipaPhysical } from '../sketch/js/vipa.js';
import { registry } from '../sketch/js/elements.js';

const base = {
  aperture: 35,
  centerWavelength: 532,
  bandwidth: 0.002,
  fsr: 0.05,
  tilt: 4,
  frontReflectivity: 99.9,
  windowSize: 3,
  windowOffset: 0,
  showLeakage: true,
};
const { outputReflectivity } = resolveVipaPhysical(base);

function nearly(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`);
}

const length = surface => Math.hypot(surface.x2 - surface.x1, surface.y2 - surface.y1);
const direction = surface => {
  const l = length(surface);
  return { x: (surface.x2 - surface.x1) / l, y: (surface.y2 - surface.y1) / l };
};

test('registers a standalone VIPA palette element under Filters & Splitters', () => {
  assert.equal(registry.vipa, vipaDefinition);
  assert.equal(vipaDefinition.category, 'Filters & Splitters');
  assert.equal(vipaDefinition.label, 'VIPA');
});

test('VIPA leaves an entrance window and leaks through the output coating', () => {
  const surfaces = vipaSurfaces(base);
  assert.equal(surfaces.length, 3);
  const [frontA, frontB, output] = surfaces;
  assert.equal(frontA.kind, 'mirror');
  assert.equal(frontA.data.refl, 99.9);
  assert.equal(frontB.data.refl, 99.9);
  assert.equal(frontA.data.showTransmitted, false);
  assert.equal(output.data.refl, outputReflectivity);
  assert.equal(output.data.showTransmitted, true);
  assert.ok(Math.abs(length(frontA) + length(frontB) - 32) < 1e-9);
  assert.ok(Math.abs(length(output) - 35) < 1e-9);
  const a = direction(frontA), b = direction(output);
  assert.ok(Math.abs(a.x - b.x) < 1e-12);
  assert.ok(Math.abs(a.y - b.y) < 1e-12);
});

test('hiding the leakage beams only affects the output face', () => {
  const surfaces = vipaSurfaces({ ...base, showLeakage: false });
  const output = surfaces[surfaces.length - 1];
  assert.equal(output.data.showTransmitted, false);
});

test('resolveVipaPhysical derives a millimeter-scale plate spacing and coating reflectivity from wavelength, resolution and FSR', () => {
  // 532 / 0.05 = 10640, an exact integer mode order, so the default FSR is
  // reproduced exactly rather than rounded to the nearest resonance.
  const { spacingMm, outputReflectivity: refl } = resolveVipaPhysical(base);
  nearly(spacingMm, 2.83024, 0.0001);
  nearly(refl, 88.2, 0.05);
});

test('changing the resolution (bandwidth) changes only the derived reflectivity, not the plate spacing', () => {
  const narrow = resolveVipaPhysical({ ...base, bandwidth: 0.001 });
  const wide = resolveVipaPhysical({ ...base, bandwidth: 0.01 });
  nearly(narrow.spacingMm, wide.spacingMm, 1e-9);
  assert.ok(narrow.outputReflectivity > wide.outputReflectivity,
    'a narrower resolution needs a higher-finesse (more reflective) coating');
});
