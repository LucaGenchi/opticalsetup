import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createElement, getDirectManipulation, getElementMeta, metalensFocalLength,
  metalensNumericalAperture, registry,
} from '../sketch/js/elements.js';
import { detectorReading, metalensReading, traceAll, traceScene } from '../sketch/js/raytrace.js';
import { objectImageAtCamera } from '../sketch/js/detector-measurements.js';
import { parseSketch } from '../sketch/js/state.js';
import '../sketch/js/detector-instruments.js';

const X = 120;

function tracedFocus(wavelength, params = {}) {
  const source = createElement('cwlaser', 0, 3);
  Object.assign(source.params, { beamMode: 'line', wavelength });
  const lens = createElement('metalens', X, 0);
  Object.assign(lens.params, params);
  const path = traceScene([source, lens]).drawables
    .filter(drawable => drawable.type === 'path')
    .sort((a, b) => b.pts.length - a.pts.length)[0];
  assert.ok(path?.pts.length >= 3, 'the test ray must cross the metalens');
  const a = path.pts.at(-2), b = path.pts.at(-1);
  return a.x + (b.x - a.x) * (0 - a.y) / (b.y - a.y);
}

test('metalens exposes a compact spectral design and direct physical controls', () => {
  const lens = createElement('metalens');
  assert.deepEqual(lens.params, {
    designType: 'chromatic', f: 20, designWavelength: 532,
    bandMin: 450, bandMax: 650, dia: 12.7, focusEff: 70,
  });
  assert.deepEqual(registry.metalens.params.map(param => param.key), [
    'designType', 'f', 'designWavelength', 'bandMin', 'bandMax', 'dia',
    'focusEff', 'opticalSpec', 'incidentFocus',
  ]);
  assert.deepEqual(getDirectManipulation(lens), {
    resize: { y: 'dia' },
    tune: { key: 'f', short: 'f', param: registry.metalens.params[1] },
  });
  assert.match(getElementMeta('metalens', lens.params).note, /f\(λ\) = f₀λ₀\/λ/);
});

test('chromatic metalens focuses at f0 on-design and shifts inversely with wavelength', () => {
  const params = { f: 20, designWavelength: 532, dia: 25.4, focusEff: 100 };
  assert.equal(metalensFocalLength(params, 532), 20);
  assert.ok(Math.abs(metalensFocalLength(params, 650) - 20 * 532 / 650) < 1e-12);
  assert.ok(Math.abs(tracedFocus(532, params) - (X + 20)) < 1e-6);
  assert.ok(Math.abs(tracedFocus(650, params) - (X + 20 * 532 / 650)) < 1e-6);
});

test('idealized achromatic mode holds one focus in-band and remains continuous outside', () => {
  const params = {
    designType: 'achromatic', f: 30, bandMin: 450, bandMax: 650,
    dia: 25.4, focusEff: 100,
  };
  assert.equal(metalensFocalLength(params, 450), 30);
  assert.equal(metalensFocalLength(params, 532), 30);
  assert.equal(metalensFocalLength(params, 650), 30);
  assert.equal(metalensFocalLength(params, 400), 30 * 450 / 400);
  assert.equal(metalensFocalLength(params, 700), 30 * 650 / 700);
  assert.ok(Math.abs(tracedFocus(500, params) - (X + 30)) < 1e-6);
  assert.match(getElementMeta('metalens', params).note, /idealized geometric focus/i);
});

test('metalens focusing efficiency attenuates the focused output power', () => {
  const source = createElement('cwlaser', 0, 0);
  source.params.beamMode = 'line';
  const lens = createElement('metalens', X, 0);
  Object.assign(lens.params, { focusEff: 35, f: 100 });
  const detector = createElement('detector', 300, 0);
  traceAll([source, lens, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.35) < 1e-9);
});

test('broadband light is sampled at the metalens and reported with its focal spread', () => {
  const source = createElement('sclaser', 0, 3);
  Object.assign(source.params, { beamMode: 'line', scMin: 450, scMax: 650 });
  const lens = createElement('metalens', X, 0);
  Object.assign(lens.params, { f: 20, designWavelength: 532, dia: 25.4, focusEff: 100 });
  traceScene([source, lens]);
  const reading = metalensReading(lens.id);
  assert.equal(reading.length, 9);
  assert.equal(reading[0].wavelengthNm, 450);
  assert.equal(reading.at(-1).wavelengthNm, 650);
  assert.ok(reading[0].focalLengthMm > reading.at(-1).focalLengthMm,
    'ordinary diffractive chromaticity brings longer wavelengths to a nearer focus');
});

test('a metalens forms the wavelength-specific object image seen by a camera', () => {
  const object = createElement('objarrow', 0, 0);
  Object.assign(object.params, { height: 10, shape: 'F', wavelength: 620, showImage: true });
  const lens = createElement('metalens', 100, 0);
  Object.assign(lens.params, {
    f: 50, designWavelength: 620, dia: 50.8, focusEff: 100,
  });
  const camera = createElement('camera', 222, 0); // active face at the 200 mm image plane
  camera.params.ch = 40;
  const image = objectImageAtCamera(camera, [object, lens, camera]);
  assert.ok(image);
  assert.equal(image.shape, 'F');
  assert.ok(Math.abs(image.magnification + 1) < 1e-9);
});

test('nominal NA is derived from aperture and focal length', () => {
  const params = { f: 20, dia: 12.7 };
  const expected = Math.sin(Math.atan(12.7 / 40));
  assert.ok(Math.abs(metalensNumericalAperture(params) - expected) < 1e-12);
  assert.equal(metalensNumericalAperture({ f: 0, dia: 12.7 }), 0);
});

test('malformed saved metalens parameters normalize to finite bounded values', () => {
  const raw = {
    type: 'metalens', x: 0, y: 0,
    params: {
      designType: 'magic', f: null, designWavelength: 50000,
      bandMin: -100, bandMax: 50000, dia: -4, focusEff: 1000,
    },
  };
  const [loaded] = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [raw], beams: [] }), registry).elements;
  assert.deepEqual(loaded.params, {
    designType: 'chromatic', f: 20, designWavelength: 12000,
    bandMin: 100, bandMax: 12000, dia: 1, focusEff: 100,
  });
});
