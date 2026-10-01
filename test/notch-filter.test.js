// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import '../sketch/js/detector-instruments.js';

// A notch filter blocks the band a bandpass of the same center and width
// would pass, and transmits everything on either side of it. The blocked
// light is removed, as a bandpass removes what it rejects.

const close = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} vs ${expected}`);

function read(source, filterParams, { rod = false, detectorType = 'detector' } = {}) {
  const elements = [source];
  if (rod) {
    const glass = createElement('glassrod', 250, 0);
    Object.assign(glass.params, { rodlen: 100, dia: 20, material: 'nbk7' });
    elements.push(glass);
  }
  if (filterParams) {
    const filter = createElement('filter', 450, 0);
    Object.assign(filter.params, filterParams);
    elements.push(filter);
  }
  const detector = createElement(detectorType, 700, 0);
  detector.params.aperture = 40;
  elements.push(detector);
  traceScene(elements);
  return detectorReading(detector.id);
}

const signal = reading => reading?.signal ?? 0;

const laser = (wavelength, extra = {}) => {
  const el = createElement('cwlaser', 0, 0);
  Object.assign(el.params, { beamMode: 'line', wavelength, ...extra });
  return el;
};

const continuum = () => {
  const el = createElement('sclaser', 0, 0);
  Object.assign(el.params, { temporalMode: 'pulsed', beamMode: 'line', scMin: 400, scMax: 900 });
  return el;
};

test('the filter offers a notch type that shows the band controls', () => {
  const spec = registry.filter.params;
  const type = spec.find(p => p.key === 'ftype');
  assert.ok(type.options.some(([value]) => value === 'notch'));
  const shown = key => spec.find(p => p.key === key).show({ ftype: 'notch' });
  assert.equal(shown('center'), true);
  assert.equal(shown('band'), true);
  assert.equal(shown('cutoff'), false);
  assert.equal(shown('trans'), false);
});

test('a notch blocks a laser line inside its band and passes one outside it untouched', () => {
  const notch = { ftype: 'notch', center: 532, band: 10 };
  assert.equal(signal(read(laser(532), notch)), 0);
  const open = signal(read(laser(633), null));
  assert.ok(open > 0);
  assert.equal(signal(read(laser(633), notch)), open);
});

test('a notch on a flat continuum transmits both sides and nothing in its band', () => {
  const full = signal(read(continuum(), null));
  const reading = read(continuum(), { ftype: 'notch', center: 650, band: 100 }, { detectorType: 'spectrometer' });
  close(reading.signal / full, 400 / 500, 1e-6, '100 nm notch on 400-900 nm');
  const inNotch = reading.spectrum
    .filter(s => s.wavelength > 600.1 && s.wavelength < 699.9)
    .reduce((sum, s) => sum + s.power, 0);
  assert.ok(inNotch < 1e-9, `power inside the notch: ${inNotch}`);
  assert.ok(reading.spectrum.some(s => s.wavelength < 600 && s.power > 0), 'blue side missing');
  assert.ok(reading.spectrum.some(s => s.wavelength > 700 && s.power > 0), 'red side missing');
});

test('a notch after a dispersive rod cuts its band out of each fanned slice', () => {
  const full = signal(read(continuum(), null, { rod: true }));
  const narrow = signal(read(continuum(), { ftype: 'notch', center: 650, band: 1 }, { rod: true }));
  const wide = signal(read(continuum(), { ftype: 'notch', center: 650, band: 100 }, { rod: true }));
  close(narrow / full, 499 / 500, 1e-6, '1 nm notch');
  close(wide / full, 400 / 500, 1e-6, '100 nm notch');
});

test('a notch and a bandpass of the same band split a Gaussian line between them', () => {
  const source = () => laser(532, { bwMode: 'band', bandwidth: 40 });
  const full = signal(read(source(), null));
  const band = { center: 532, band: 20 };
  const passed = signal(read(source(), { ftype: 'bandpass', ...band }));
  const notched = signal(read(source(), { ftype: 'notch', ...band }));
  assert.ok(passed > 0 && notched > 0);
  close((passed + notched) / full, 1, 1e-9, 'bandpass + notch');
  // A 20 nm band centred on a 40 nm FWHM Gaussian holds erf(√ln2 / 2) of it.
  close(notched / full, 1 - 0.44408, 0.01, 'notch on a Gaussian');
});

test('a notch wider than the beam blocks all of it; one beside the beam leaves it alone', () => {
  assert.equal(signal(read(continuum(), { ftype: 'notch', center: 650, band: 600 })), 0);
  assert.equal(signal(read(continuum(), { ftype: 'notch', center: 650, band: 600 }, { rod: true })), 0);
  const plain = read(continuum(), null, { detectorType: 'spectrometer' });
  const beside = read(continuum(), { ftype: 'notch', center: 1200, band: 100 }, { detectorType: 'spectrometer' });
  assert.equal(beside.signal, plain.signal);
});

test('a saved notch filter keeps its type when the scene is opened again', () => {
  const filter = createElement('filter', 0, 0);
  Object.assign(filter.params, { ftype: 'notch', center: 785, band: 30 });
  const file = JSON.stringify({ app: 'optics2d', version: 1, elements: [filter], beams: [] });
  const [loaded] = parseSketch(file, registry).elements;
  assert.equal(loaded.params.ftype, 'notch');
  assert.equal(loaded.params.center, 785);
  assert.equal(loaded.params.band, 30);
});
