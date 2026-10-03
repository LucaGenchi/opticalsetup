// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { detectorReading, traceScene, etalonMeanTransmission } from '../sketch/js/raytrace.js';
import { resolveEtalonPhysical } from '../sketch/js/etalon.js';
import '../sketch/js/detector-instruments.js';

// A 400-900 nm supercontinuum fanned into wavelength samples by a dispersive
// N-BK7 rod. Each sample stands for a ~60 nm slice; a filter downstream has to
// cut inside that slice, not pass or block it on its node wavelength.
function fanThrough(wavelengthElement, detectorType = 'detector') {
  const source = createElement('sclaser', 0, 0);
  Object.assign(source.params, { temporalMode: 'pulsed', beamMode: 'line', scMin: 400, scMax: 900 });
  const rod = createElement('glassrod', 250, 0);
  Object.assign(rod.params, { rodlen: 100, dia: 20, material: 'nbk7' });
  const elements = [source, rod];
  if (wavelengthElement) {
    const [type, params] = wavelengthElement;
    const el = createElement(type, 450, 0);
    Object.assign(el.params, params);
    elements.push(el);
  }
  const detector = createElement(detectorType, 700, 0);
  detector.params.aperture = 40;
  elements.push(detector);
  traceScene(elements);
  return detectorReading(detector.id);
}

const unfiltered = () => fanThrough(null).signal;
const close = (actual, expected, tol, label) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} vs ${expected}`);

test('a 1 nm bandpass after a dispersive rod passes 1/500 of a 500 nm band, not a whole sample', () => {
  const full = unfiltered();
  const narrow = fanThrough(['filter', { ftype: 'bandpass', center: 650, band: 1 }]).signal;
  const wide = fanThrough(['filter', { ftype: 'bandpass', center: 650, band: 10 }]).signal;
  close(narrow / full, 1 / 500, 1e-6, '1 nm bandpass');
  close(wide / full, 10 / 500, 1e-6, '10 nm bandpass');
});

test('a longpass after a dispersive rod passes the part of the band above its edge', () => {
  const full = unfiltered();
  const reading = fanThrough(['filter', { ftype: 'longpass', cutoff: 650 }], 'spectrometer');
  close(reading.signal / full, 250 / 500, 1e-6, '650 nm longpass');
  // The slice straddling the edge is cut at the edge, so the spectrometer
  // paints nothing below it.
  const below = reading.spectrum.filter(s => s.wavelength < 649.9).reduce((sum, s) => sum + s.power, 0);
  assert.ok(below < 1e-9, `power below the edge: ${below}`);
  assert.ok(reading.bandMin >= 649.9, `band starts at ${reading.bandMin}`);
});

test('a notch dichroic after a dispersive rod removes only its band from the transmitted fan', () => {
  const full = unfiltered();
  const reading = fanThrough(['dichroic', { dtype: 'notch', center: 650, band: 100 }], 'spectrometer');
  close(reading.signal / full, 400 / 500, 1e-6, '100 nm notch');
  const inNotch = reading.spectrum
    .filter(s => s.wavelength > 600.1 && s.wavelength < 699.9)
    .reduce((sum, s) => sum + s.power, 0);
  assert.ok(inNotch < 1e-9, `power inside the notch: ${inNotch}`);
});

test('a filter that passes the whole band leaves the fanned spectrometer reading untouched', () => {
  const plain = fanThrough(null, 'spectrometer');
  const passed = fanThrough(['filter', { ftype: 'longpass', cutoff: 300 }], 'spectrometer');
  assert.equal(passed.signal, plain.signal);
  const strip = spectrum => spectrum.map(({ wavelength, power, widthNm }) => ({ wavelength, power, widthNm }));
  assert.deepEqual(strip(passed.spectrum), strip(plain.spectrum));
  assert.equal(plain.bandMin, 400);
  assert.equal(plain.bandMax, 900);
});

test('a spectrometer shows a fanned flat continuum flat, with no spike where two slices meet', () => {
  const samples = fanThrough(null, 'spectrometer').spectrum;
  const interior = samples.slice(1, -1).map(s => s.power);
  const mean = interior.reduce((a, b) => a + b, 0) / interior.length;
  for (const power of interior) assert.ok(Math.abs(power / mean - 1) < 0.02, `${power} vs ${mean}`);
});

// The reviewer's chain: a 1 nm slice is 0.2 % of the continuum, below the
// weak-ray floor, and was dropped at the first optic after the filter.
test('a narrow slice survives the optics after its filter, not only a detector right behind it', () => {
  const chain = extra => {
    const source = createElement('sclaser', 0, 0);
    Object.assign(source.params, { temporalMode: 'pulsed', beamMode: 'line', scMin: 400, scMax: 900 });
    const rod = createElement('glassrod', 250, 0);
    Object.assign(rod.params, { rodlen: 100, dia: 20, material: 'nbk7' });
    const filter = createElement('filter', 450, 0);
    Object.assign(filter.params, { ftype: 'bandpass', center: 650, band: 1 });
    const detector = createElement('detector', 800, 0);
    detector.params.aperture = 40;
    traceScene([source, rod, filter, ...extra, detector]);
    return detectorReading(detector.id)?.signal ?? 0;
  };
  const at = (type, params) => { const el = createElement(type, 600, 0); Object.assign(el.params, params); return el; };
  const direct = chain([]);
  close(chain([at('filter', { ftype: 'nd', trans: 1 })]), direct, 1e-12, 'transparent ND');
  close(chain([at('dichroic', { dtype: 'longpass', cutoff: 500 })]), direct, 1e-12, 'passing dichroic');
  close(chain([at('filter', { ftype: 'bandpass', center: 650, band: 1 })]), direct, 1e-12, 'second identical bandpass');
  const window = chain([at('glassrod', { rodlen: 20, dia: 20, material: 'nbk7' })]);
  assert.ok(window > 0.9 * direct && window < direct, `through a window: ${window} of ${direct}`);
});

test('a partial notch reflector splits a fanned band between both ports without loss', () => {
  const ports = bandRefl => {
    const source = createElement('sclaser', 0, 0);
    Object.assign(source.params, { temporalMode: 'pulsed', beamMode: 'line', scMin: 400, scMax: 900 });
    const rod = createElement('glassrod', 250, 0);
    Object.assign(rod.params, { rodlen: 100, dia: 20, material: 'nbk7' });
    const notch = createElement('dichroic', 450, 0);
    Object.assign(notch.params, { dtype: 'notch', center: 650, band: 100, bandRefl });
    notch.rot = 45;
    const through = createElement('detector', 750, 0);
    const reflected = createElement('detector', 450, -250);
    reflected.rot = -90;
    for (const det of [through, reflected]) det.params.aperture = 60;
    traceScene([source, rod, notch, through, reflected]);
    return [detectorReading(through.id)?.signal ?? 0, detectorReading(reflected.id)?.signal ?? 0];
  };
  const [full] = ports(0);
  // The notch holds 100 of the 500 nm: a fifth of the light, times its reflectance.
  for (const [bandRefl, t, r] of [[0, 1, 0], [25, 0.95, 0.05], [100, 0.8, 0.2]]) {
    const [T, R] = ports(bandRefl);
    close(T / full, t, 1e-9, `transmitted at ${bandRefl} %`);
    close(R / full, r, 1e-9, `reflected at ${bandRefl} %`);
  }
});

test('the etalon mean over a slice resolves its fringes at any finesse', () => {
  // Converged anchors: 4 million-point midpoint integration of the same Airy
  // function over 618.75-681.25 nm, FSR 20 nm, 98 % peak transmission. A
  // fixed 65-point grid gave 0.0155 for the 0.01 nm case, 6.7 times too high.
  for (const [bandwidth, expected] of [[0.01, 0.0023268], [1, 0.0730280], [5, 0.3467644]]) {
    const data = resolveEtalonPhysical({ centerWavelength: 650, fsr: 20, bandwidth, peakTransmission: 98 });
    close(etalonMeanTransmission(618.75, 681.25, 1, data), expected, 1e-4 * expected, `${bandwidth} nm linewidth`);
  }
});
