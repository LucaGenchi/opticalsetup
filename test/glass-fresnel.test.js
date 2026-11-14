// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Step P1 of the Physics in 2D track (issue #313): the "Bare glass (Fresnel)"
// choice on glass elements, and the retardance of total internal reflection
// wherever a face follows Fresnel.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';
import { applyMueller, fresnelReflectionMueller, fresnelTransmittancesFromCoefficients, fresnelCoefficients } from '../sketch/js/mueller.js';
import { parseSketch } from '../sketch/js/state.js';

const close = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const make = (type, x, y, rot = 0, params = {}) => {
  const element = createElement(type, x, y);
  element.rot = rot;
  Object.assign(element.params, params);
  return element;
};
// A right-angle prism of free-form glass, hypotenuse facing the beam's path
// at 45°: the beam (along +x, at y = 0) enters the left leg at normal
// incidence, is totally reflected once off the hypotenuse at 45° and leaves
// downwards (+y) through the lower leg at normal incidence.
const prism = params => make('freeglass', 120, 0, 0, {
  vertices: [{ x: -15, y: -15 }, { x: 15, y: 15 }, { x: -15, y: 15 }],
  material: 'constant', ior: 1.5, ...params,
});
const read = (elements, detector) => {
  traceScene(elements, []);
  return enhancedReading(detector, elements);
};
const prismReading = (pol, params, source = 'cwlaser') => {
  const laser = make(source, 0, 0, 0, { beamWidth: 1, avgPowerW: 0.001, ...(source === 'cwlaser' ? { pol } : {}) });
  const polarimeter = make('polarimeter', 120, 120, 90);
  return read([laser, prism(params), polarimeter], polarimeter);
};

test('bare glass: one total internal reflection applies the Fresnel matrix, not the ideal mirror', () => {
  // 45° inside n = 1.5 is past the critical angle (41.8°).
  const expected = applyMueller(fresnelReflectionMueller(1.5, 1, Math.cos(Math.PI / 4)), [1, 0, 1, 0]);
  const fresnel = prismReading(45, { surfaceModel: 'fresnel' });
  close(fresnel.normalizedStokes.s1, expected[1] / expected[0], 1e-9, 's1');
  close(fresnel.normalizedStokes.s2, expected[2] / expected[0], 1e-9, 's2');
  close(fresnel.normalizedStokes.s3, expected[3] / expected[0], 1e-9, 's3');
  assert.ok(Math.abs(fresnel.normalizedStokes.s3) > 0.5, 'linear 45° leaves elliptical');
  // Power: two normal-incidence faces, each (1 − R), and no loss at the
  // total reflection.
  const T = fresnelTransmittancesFromCoefficients(fresnelCoefficients(1, 1.5, 1)).Tp;
  close(fresnel.detectedPowerW, 0.001 * T * T, 1e-12, 'power');
});

test('per-surface transmission keeps the ideal mirror at total internal reflection, as before', () => {
  const kept = prismReading(45, { surfaceModel: 'transmission' });
  assert.equal(kept.polarization, 'Linear 135°');
  close(kept.normalizedStokes.s3, 0, 1e-12, 's3');
  close(kept.detectedPowerW, 0.001 * 0.98 * 0.98, 1e-12, 'power');
});

test('p and s are eigenstates of total internal reflection; unpolarized light stays unpolarized', () => {
  for (const [pol, label] of [[0, 'Linear 0°'], [90, 'Linear 90°']]) {
    assert.equal(prismReading(pol, { surfaceModel: 'fresnel' }).polarization, label);
  }
  const led = prismReading(null, { surfaceModel: 'fresnel' }, 'ledsource');
  assert.equal(led.polarization, 'Unpolarized');
  for (const key of ['s1', 's2', 's3']) close(led.normalizedStokes[key], 0, 1e-12, key);
});

test('a saved sketch without the Surfaces setting opens on per-surface transmission and reads as before', () => {
  const saved = {
    app: 'optics2d', version: 1, beams: [],
    elements: [
      { id: 'l', type: 'cwlaser', x: 0, y: 0, rot: 0, params: { pol: 45, beamWidth: 1, avgPowerW: 0.001 } },
      { id: 'g', type: 'freeglass', x: 120, y: 0, rot: 0, params: { vertices: [{ x: -15, y: -15 }, { x: 15, y: 15 }, { x: -15, y: 15 }], material: 'constant', ior: 1.5 } },
      { id: 'p', type: 'polarimeter', x: 120, y: 120, rot: 90, params: {} },
      // A malformed value falls back to the default too.
      { id: 'r', type: 'glassrod', x: 0, y: 300, rot: 0, params: { surfaceModel: 'gold' } },
    ],
  };
  const scene = parseSketch(JSON.stringify(saved), registry);
  const get = id => scene.elements.find(e => e.id === id);
  assert.equal(get('g').params.surfaceModel, 'transmission');
  assert.equal(get('r').params.surfaceModel, 'transmission');
  const reading = read(scene.elements, get('p'));
  assert.equal(reading.polarization, 'Linear 135°');
  close(reading.detectedPowerW, 0.001 * 0.98 * 0.98, 1e-12, 'power');
});

test('the glass rod: 96 % a face by default, Fresnel at its real angle on bare glass', () => {
  const rodReading = surfaceModel => {
    const laser = make('cwlaser', 0, 0, 0, { beamWidth: 1, avgPowerW: 0.001, pol: 0 });
    const rod = make('glassrod', 120, 0, 0, { material: 'constant', ior: 1.5, surfaceModel });
    const meter = make('powermeter', 250, 0);
    return read([laser, rod, meter], meter);
  };
  close(rodReading('transmission').detectedPowerW, 0.001 * 0.96 * 0.96, 1e-12, 'fixed');
  const T = fresnelTransmittancesFromCoefficients(fresnelCoefficients(1, 1.5, 1)).Tp;
  close(rodReading('fresnel').detectedPowerW, 0.001 * T * T, 1e-12, 'Fresnel');
});

test('every glass element with a per-surface transmission offers the Surfaces choice, defaulting to it', () => {
  for (const type of ['thicklens', 'asphericlens', 'lensgroup', 'freeglass', 'glassrod']) {
    const spec = registry[type].params.find(p => p.key === 'surfaceModel');
    assert.ok(spec, type);
    assert.equal(spec.def, 'transmission', type);
    assert.deepEqual(spec.options.map(([value]) => value), ['transmission', 'fresnel'], type);
    // The flat percentage is hidden when it does not apply.
    const percent = registry[type].params.find(p => p.key === 'transEff');
    if (percent) assert.equal(percent.show({ surfaceModel: 'fresnel' }), false, type);
  }
});
