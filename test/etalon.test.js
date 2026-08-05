import test from 'node:test';
import assert from 'node:assert/strict';

import { airyTransmission, etalonDefinition, etalonSurfaces } from '../sketch/js/etalon.js';
import { createElement, getElementMeta, registry } from '../sketch/js/elements.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';

const base = {
  aperture: 35,
  spacing: 12,
  refractiveIndex: 1.46,
  designWavelength: 532,
  etalonTilt: 0,
  reflectivity: 90,
  vipaTilt: 4,
  frontReflectivity: 99.9,
  outputReflectivity: 96,
  angularDispersion: 0.08,
  windowSize: 3,
  windowOffset: 0,
  showLeakage: true,
};

const length = surface => Math.hypot(surface.x2 - surface.x1, surface.y2 - surface.y1);

test('registry imports Etalon / VIPA without a side-effect loader and exposes its model limits', () => {
  assert.equal(registry.etalon, etalonDefinition);
  assert.equal(etalonDefinition.category, 'Dispersive & Apertures');
  assert.deepEqual(etalonDefinition.params[0].options, [
    ['etalon', 'Fabry–Pérot etalon'],
    ['vipa', 'VIPA'],
  ]);
  const meta = getElementMeta('etalon', createElement('etalon').params);
  assert.match(meta.description, /Airy etalon/i);
  assert.match(meta.note, /qualitative/i);

  const scene = parseSketch({
    app: 'optics2d', version: 1,
    elements: [{ id: 'etalon-loader', type: 'etalon', x: 10, y: 20, rot: 0, params: {} }],
    beams: [],
  }, registry);
  assert.equal(scene.elements[0].type, 'etalon');
  assert.equal(scene.elements[0].params.designWavelength, 532);
});

test('etalon mode exposes one bounded analytic interaction plane', () => {
  const [surface] = etalonSurfaces({ ...base, mode: 'etalon' });
  assert.equal(etalonSurfaces({ ...base, mode: 'etalon' }).length, 1);
  assert.equal(surface.kind, 'etalon');
  assert.equal(surface.data.reflectivity, 0.9);
  assert.equal(surface.data.spacing, 12);
  assert.ok(Math.abs(length(surface) - 35) < 1e-9);
});

test('Airy response is resonant at the design state and finite away from it', () => {
  const common = {
    designWavelengthNm: 532,
    spacingMm: 12,
    refractiveIndex: 1.46,
    reflectivity: 0.9,
  };
  assert.equal(airyTransmission({ ...common, wavelengthNm: 532 }), 1);
  const offResonance = airyTransmission({ ...common, wavelengthNm: 533 });
  assert.ok(offResonance > 0 && offResonance < 1);
});

test('default etalon transmits its design wavelength to a downstream detector', () => {
  const laser = createElement('laser', 0, 0);
  const etalon = createElement('etalon', 150, 0);
  const detector = createElement('detector', 300, 0);
  traceAll([laser, etalon, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 1) < 1e-9);
});

function vipaOutputs(wavelength) {
  const laser = createElement('laser', 0, 0);
  laser.params.wavelength = wavelength;
  const vipa = createElement('etalon', 150, 0);
  vipa.params.mode = 'vipa';
  return traceAll([laser, vipa]).filter(drawable =>
    drawable.type === 'path' && drawable.pts.length >= 2 && drawable.pts[0].x > 150);
}

test('default VIPA emits multiple bounded leakage orders', () => {
  const surfaces = etalonSurfaces({ ...base, mode: 'vipa' });
  const surface = surfaces.find(candidate => candidate.kind === 'vipa');
  assert.equal(surfaces.length, 3);
  assert.ok(surface);
  assert.equal(surface.kind, 'vipa');
  assert.ok(Math.abs(surface.data.frontReflectivity - 0.999) < 1e-12);
  assert.equal(surface.data.outputReflectivity, 0.96);
  assert.ok(Math.abs(length(surface) - 3) < 1e-9);
  assert.ok(Math.abs(surfaces.filter(candidate => candidate.kind === 'mirror')
    .reduce((sum, candidate) => sum + length(candidate), 0) - 32) < 1e-9);

  const outputs = vipaOutputs(532);
  assert.ok(outputs.length >= 3, `expected multiple visible leakage orders, got ${outputs.length}`);
  assert.ok(outputs.length <= 24, `leakage order count must remain bounded, got ${outputs.length}`);
});

test('VIPA output direction changes with wavelength', () => {
  const direction = wavelength => {
    const output = vipaOutputs(wavelength)[0];
    assert.ok(output, `expected a visible ${wavelength} nm output`);
    const a = output.pts[0], b = output.pts[1];
    return Math.atan2(b.y - a.y, b.x - a.x);
  };
  assert.ok(Math.abs(direction(450) - direction(650)) > 0.1);
});
