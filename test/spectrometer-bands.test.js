import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';

// A supercontinuum whose light an AOTF has cut into several narrow, widely
// separated lines -- the one arrangement where a single source arrives
// carrying more than one disjoint band.
function aotfScene({ channels, extra = [] } = {}) {
  const source = createElement('sclaser', 0, 0);
  Object.assign(source.params, { beamMode: 'beam', beamWidth: 6, bandLo: 450, bandHi: 700 });
  const aotf = createElement('aotf', 180, 0);
  aotf.params.channels = channels;
  const spectrometer = createElement('spectrometer', 460, 0);
  const scene = [source, aotf, ...extra, spectrometer];
  traceAll(scene);
  return { scene, spectrometer, reading: detectorReading(spectrometer.id) };
}

const LINES = [
  { wl: 470, band: 2, eff: 0.8 },
  { wl: 550, band: 2, eff: 0.8 },
  { wl: 660, band: 2, eff: 0.8 },
];

function peaks(reading) {
  return (reading.spectrum || []).filter(sample => sample.power > 1e-9);
}

test('separately selected lines are measured at their own widths, not the gap between them', () => {
  const { reading } = aotfScene({ channels: LINES });
  const measured = peaks(reading);
  assert.ok(measured.length >= 3, `expected at least three peaks, got ${measured.length}`);
  // Every reported sample must be no wider than the 2 nm line it came from.
  // Spreading them over a grid that spans all three lines reports each one
  // several times too wide, and a width that wrong feeds straight into the
  // spectral-density axis as a height that is several times too short.
  for (const sample of measured) {
    assert.ok(sample.widthNm <= 2.2,
      `a ${sample.widthNm.toFixed(2)} nm sample at ${sample.wavelength.toFixed(1)} nm: `
      + 'wider than the 2 nm line it was cut from');
  }
});

test('every selected line is reported near where it was actually selected', () => {
  const { reading } = aotfScene({ channels: LINES });
  const measured = peaks(reading);
  for (const line of LINES) {
    const found = measured.find(sample => Math.abs(sample.wavelength - line.wl) <= line.band);
    assert.ok(found, `nothing measured within ${line.band} nm of the ${line.wl} nm line`);
  }
  // And nothing is reported from the empty stretches between them.
  const between = measured.filter(sample =>
    LINES.every(line => Math.abs(sample.wavelength - line.wl) > line.band));
  assert.deepEqual(between.map(s => s.wavelength.toFixed(1)), [],
    'light reported at wavelengths the AOTF did not select');
});

test('the plot does not paint a band across a gap that carries no light', () => {
  const { scene, spectrometer } = aotfScene({ channels: LINES });
  const display = createElement('display', spectrometer.x + 130, spectrometer.y + 80);
  display.params.sensorId = spectrometer.id;
  const full = [...scene, display];
  traceAll(full);
  const svg = registry.display.svg(display, full);
  // Each selected line is its own measurement. Drawing one continuous curve
  // through all of them invents a spectrum in the gaps where the AOTF is
  // deliberately blocking everything.
  const segments = [...svg.matchAll(/data-spectrum-band-segment="([^"]*)"/g)];
  assert.ok(segments.length >= 3,
    `expected one drawn band per selected line, found ${segments.length}`);
});

test('a line measures the same whether or not others were selected beside it', () => {
  // The same 550 nm line, selected alone and selected alongside two others.
  // How finely the display samples it may differ -- the plot has a fixed
  // sample budget to share out -- but the line it reports must not.
  const alone = peaks(aotfScene({ channels: [LINES[1]] }).reading);
  const withNeighbours = peaks(aotfScene({ channels: LINES }).reading)
    .filter(sample => Math.abs(sample.wavelength - 550) <= 2);
  const extentOf = list => {
    const wavelengths = list.map(sample => sample.wavelength);
    const half = Math.max(...list.map(sample => (sample.widthNm || 0) / 2));
    return (Math.max(...wavelengths) + half) - (Math.min(...wavelengths) - half);
  };
  const powerOf = list => list.reduce((sum, sample) => sum + sample.power, 0);
  assert.ok(Math.abs(extentOf(alone) - extentOf(withNeighbours)) < 0.3,
    `the 550 nm line spans ${extentOf(alone).toFixed(2)} nm alone but `
    + `${extentOf(withNeighbours).toFixed(2)} nm with neighbours present`);
  // And the light in it is the same light.
  assert.ok(Math.abs(powerOf(alone) - powerOf(withNeighbours)) / powerOf(alone) < 0.02,
    `the 550 nm line carries ${powerOf(alone).toExponential(2)} alone but `
    + `${powerOf(withNeighbours).toExponential(2)} with neighbours present`);
});

test('a genuinely continuous band is still drawn as one curve', () => {
  // The fix must not fragment a real continuum: one filtered supercontinuum
  // is a single connected band and has to stay one.
  const source = createElement('sclaser', 0, 0);
  Object.assign(source.params, { beamMode: 'beam', beamWidth: 6, bandLo: 450, bandHi: 700 });
  const filter = createElement('filter', 200, 0);
  Object.assign(filter.params, { ftype: 'bandpass', center: 550, band: 60 });
  const spectrometer = createElement('spectrometer', 460, 0);
  const display = createElement('display', 590, 80);
  display.params.sensorId = spectrometer.id;
  const scene = [source, filter, spectrometer, display];
  traceAll(scene);
  const reading = detectorReading(spectrometer.id);
  const measured = peaks(reading);
  assert.ok(measured.length > 8, 'a 60 nm band should still be sampled finely');
  assert.ok(measured.every(sample => sample.continuum), 'a band is a continuum, not lines');
  const svg = registry.display.svg(display, scene);
  const segments = [...svg.matchAll(/data-spectrum-band-segment="([^"]*)"/g)];
  assert.equal(segments.length, 1, 'one connected band must draw as one curve');
});
