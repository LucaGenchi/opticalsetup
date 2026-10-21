// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, eyePowerD, eyeRefractionD, registry, EYE_MAX_FOCUS_MM, EYE_MIN_FOCUS_MM } from '../sketch/js/elements.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';
import { parseSketch } from '../sketch/js/state.js';

const spec = key => registry.eye.params.find(p => p.key === key);
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);

test('a new eye is the 60 D reduced eye, focused on distant light', () => {
  const eye = createElement('eye', 0, 0);
  assert.equal(eye.params.diameter, 16.7);
  assert.equal(eye.params.focus, 16.7);
  assert.equal(eye.params.pupil, 4);
  assert.equal(eye.params.powerUnit, 'mm');
  close(eyePowerD(eye.params), 1000 / 16.7);
  close(eyeRefractionD(eye.params), 0);
  assert.equal(spec('refraction').readout(eye.params), '0.00 D (emmetropic)');
});

test('an eye saved before the new defaults opens at the values it was drawn with', () => {
  const old = JSON.stringify({ app: 'optics2d', version: 1, beams: [], elements: [
    { id: 'old', type: 'eye', x: 0, y: 0, rot: 0, params: {} },
    { id: 'set', type: 'eye', x: 0, y: 0, rot: 0, params: { diameter: 24, pupil: 6, focus: 22 } },
  ] });
  const [legacy, saved] = parseSketch(old, registry).elements;
  assert.deepEqual([legacy.params.diameter, legacy.params.pupil, legacy.params.focus], [30, 12, 30]);
  assert.deepEqual([saved.params.diameter, saved.params.pupil, saved.params.focus], [24, 6, 22]);
  assert.equal(legacy.params.powerUnit, 'mm');
  assert.equal(legacy.params.retinalReflectivity, 0);
  assert.equal(legacy.params.retinalDiffuse, 0);
});

test('eye power can be read and set in dioptres; the focal length stays the stored value', () => {
  const eye = createElement('eye', 0, 0);
  const power = spec('powerD');
  assert.equal(spec('focus').show(eye.params), true);
  assert.equal(power.show(eye.params), false);
  eye.params.powerUnit = 'D';
  assert.equal(spec('focus').show(eye.params), false);
  assert.equal(power.show(eye.params), true);

  power.set(eye.params, 62.5);
  close(eye.params.focus, 16);
  assert.equal(power.get(eye.params), 62.5);
  // A stronger eye than its length needs is myopic; spectacles of the
  // refractive error would focus distant light again.
  close(eyeRefractionD(eye.params), 1000 / 16.7 - 62.5);
  assert.match(spec('refraction').readout(eye.params), /^−2\.62 D \(myopic\)$/);
  power.set(eye.params, 55);
  assert.match(spec('refraction').readout(eye.params), /\(hyperopic\)$/);

  // Out of range or malformed dioptres never leave the focal-length range.
  power.set(eye.params, 1000);
  assert.equal(eye.params.focus, EYE_MIN_FOCUS_MM);
  power.set(eye.params, 1);
  assert.equal(eye.params.focus, EYE_MAX_FOCUS_MM);
  power.set(eye.params, 'abc');
  power.set(eye.params, -5);
  power.set(eye.params, 0);
  assert.equal(eye.params.focus, EYE_MAX_FOCUS_MM);
});

test('a refractive error defocuses the retinal spot', () => {
  const spot = power => {
    const laser = createElement('cwlaser', 0, 0);
    laser.params.beamWidth = 3;
    const eye = createElement('eye', 150, 0);
    eye.params.powerUnit = 'D';
    spec('powerD').set(eye.params, power);
    traceAll([laser, eye]);
    return detectorReading(eye.id).spotSpan;
  };
  assert.ok(spot(1000 / 16.7) < 1e-6, 'emmetropic: collimated light focuses on the retina');
  assert.ok(spot(1000 / 16.7 + 4) > 0.2, 'myopic: the spot spreads');
  assert.ok(spot(1000 / 16.7 - 4) > 0.2, 'hyperopic: the spot spreads');
});

// The return is read at the free port of a 50/50 splitter in front of the eye.
function returned({ reflectivity, diffuse, pupil = 4, beamMode = 'line', offset = 0 }) {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = beamMode;
  laser.params.avgPowerW = 0.002;
  const splitter = createElement('bs', 100, 0);
  splitter.params.ratio = 0.5;
  const eye = createElement('eye', 250, offset);
  Object.assign(eye.params, { retinalReflectivity: reflectivity, retinalDiffuse: diffuse, pupil });
  const port = createElement('detector', 100, 120);
  port.rot = 90;
  port.params.aperture = 80;
  traceAll([laser, splitter, eye, port]);
  return { eye, retina: detectorReading(eye.id), port: detectorReading(port.id), elements: [laser, splitter, eye, port] };
}

test('diffuse retinal reflection returns the Lambertian share that leaves through the pupil', () => {
  for (const pupil of [2, 4, 8]) {
    const sinAlpha = (pupil / 2) / Math.hypot(pupil / 2, 16.7);
    const { port, retina } = returned({ reflectivity: 10, diffuse: 100, pupil });
    close(port.signal, 0.5 * 0.1 * sinAlpha ** 2 * 0.5, 1e-12);
    close(retina.signal, 0.5, 1e-12);
  }
  // A mix splits the reflected light between the two returns.
  const mixed = returned({ reflectivity: 10, diffuse: 50 }).port.signal;
  const sinAlpha = 2 / Math.hypot(2, 16.7);
  close(mixed, 0.5 * 0.1 * (0.5 + 0.5 * sinAlpha ** 2) * 0.5, 1e-12);
  // The same for a sized beam, sampled ray by ray.
  close(returned({ reflectivity: 10, diffuse: 100, beamMode: 'beam' }).port.signal, 0.5 * 0.1 * sinAlpha ** 2 * 0.5, 1e-9);
});

test('diffuse reflection needs a reflecting retina and ignores malformed values', () => {
  assert.equal(returned({ reflectivity: 0, diffuse: 100 }).port, null);
  close(returned({ reflectivity: 10, diffuse: 'abc' }).port.signal, 0.5 * 0.1 * 0.5);
  close(returned({ reflectivity: 10, diffuse: -40 }).port.signal, 0.5 * 0.1 * 0.5);
  const full = 0.5 * 0.1 * (2 / Math.hypot(2, 16.7)) ** 2 * 0.5;
  close(returned({ reflectivity: 10, diffuse: 250 }).port.signal, full, 1e-12);
});

test('the eye reports the power reaching its retina in watts', () => {
  const { eye, elements } = returned({ reflectivity: 10, diffuse: 0 });
  const reading = enhancedReading(eye, elements);
  close(reading.detectedPowerW, 0.002 * 0.5, 1e-12);
  assert.equal(reading.powerCoversAllArrivals, true);
});
