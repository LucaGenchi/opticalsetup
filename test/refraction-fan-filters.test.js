import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
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
