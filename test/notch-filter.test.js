// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { gaussianSpectrum, spectrumSlice, spectrumStats, spectrumWeight } from '../sketch/js/spectrum.js';
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
  close((passed + notched) / full, 1, 0.01, 'bandpass + notch');
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

// Several filters in a row along one beam, each 100 mm after the last.
function readChain(source, filters, detectorType = 'detector') {
  const elements = [source];
  filters.forEach((params, i) => {
    const filter = createElement('filter', 200 + 100 * i, 0);
    Object.assign(filter.params, params);
    elements.push(filter);
  });
  const detector = createElement(detectorType, 300 + 100 * filters.length, 0);
  detector.params.aperture = 40;
  elements.push(detector);
  traceScene(elements);
  return detectorReading(detector.id);
}

test('a notched Gaussian carries no light in the removed band to later filters', () => {
  const source = () => laser(532, { bwMode: 'band', bandwidth: 40 });
  const notch = { ftype: 'notch', center: 532, band: 2 };
  // The reviewer's reproduction: notch then a bandpass of the same band.
  assert.equal(signal(readChain(source(), [notch, { ftype: 'bandpass', center: 532, band: 2 }])), 0);
  // A wider bandpass in between re-grids the profile; the band stays empty.
  assert.equal(signal(readChain(source(), [notch, { ftype: 'bandpass', center: 532, band: 30 }, { ftype: 'bandpass', center: 532, band: 1 }])), 0);
  // A second identical notch has nothing left to remove.
  const once = signal(readChain(source(), [notch]));
  const twice = signal(readChain(source(), [notch, notch]));
  assert.ok(once > 0.9);
  close(twice, once, 1e-9, 'repeated notch');
});

test('a sliver of continuum left beside a wide notch is kept, on either side', () => {
  const full = signal(read(continuum(), null));
  // 899.8-900 nm survives a 500 nm notch centred on 649.8 nm ...
  close(signal(read(continuum(), { ftype: 'notch', center: 649.8, band: 500 })) / full, 0.2 / 500, 1e-9, 'red sliver');
  // ... and 400-400.2 nm one centred on 650.2 nm, as the fanned path keeps it.
  close(signal(read(continuum(), { ftype: 'notch', center: 650.2, band: 500 })) / full, 0.2 / 500, 1e-9, 'blue sliver');
  const fannedFull = signal(read(continuum(), null, { rod: true }));
  close(signal(read(continuum(), { ftype: 'notch', center: 649.8, band: 500 }, { rod: true })) / fannedFull, 0.2 / 500, 1e-6, 'fanned red sliver');
});

test('the two sides a notch keeps are ordinary slices with exact edges', () => {
  const line = gaussianSpectrum(532, 40);
  const blue = spectrumSlice(line, 400, 531);
  const red = spectrumSlice(line, 533, 700);
  // Nothing is interpolated past an edge.
  assert.equal(spectrumWeight(blue.spec, 531.001), 0);
  assert.equal(spectrumWeight(red.spec, 532.999), 0);
  // Each side's own centre and width describe the light it holds.
  assert.ok(blue.wl < 531 && red.wl > 533, `${blue.wl} / ${red.wl}`);
  const stats = spectrumStats(blue.spec);
  assert.ok(stats.center >= blue.spec.lo && stats.center <= 531);
  close(blue.fraction, red.fraction, 1e-3, 'symmetric sides');
  // A slice outside the profile, or of zero width, holds nothing.
  assert.equal(spectrumSlice(line, 900, 950), null);
  assert.equal(spectrumSlice(line, 532, 532), null);
});

test('glass after a notch does not refill the removed band', () => {
  // The reviewer's reproduction: Gaussian -> notch -> N-BK7 rod -> same-band
  // bandpass. The rod fans each side into samples; none lies in the band.
  for (const band of [2, 20]) {
    const elements = [laser(532, { bwMode: 'band', bandwidth: 40 })];
    const notch = createElement('filter', 150, 0);
    Object.assign(notch.params, { ftype: 'notch', center: 532, band });
    const rod = createElement('glassrod', 300, 0);
    Object.assign(rod.params, { rodlen: 100, dia: 20, material: 'nbk7' });
    const bandpass = createElement('filter', 500, 0);
    Object.assign(bandpass.params, { ftype: 'bandpass', center: 532, band });
    const detector = createElement('detector', 700, 0);
    detector.params.aperture = 40;
    traceScene([...elements, notch, rod, bandpass, detector]);
    assert.equal(signal(detectorReading(detector.id)), 0, `${band} nm notch then bandpass through glass`);
  }
});
