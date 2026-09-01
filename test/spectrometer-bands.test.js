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

// ---------------- the plotted window ----------------

function axisRange(svg) {
  const ticks = [...svg.matchAll(/>(\d{3,4})</g)].map(match => Number(match[1]));
  return [Math.min(...ticks), Math.max(...ticks)];
}

function screenOf(scene, sensor) {
  const display = createElement('display', sensor.x + 130, sensor.y + 80);
  display.params.sensorId = sensor.id;
  const full = [...scene, display];
  traceAll(full);
  return registry.display.svg(display, full);
}

// What actually reaches the plot: samples outside the window are filtered
// out before anything is drawn, so counting what was drawn is a direct test
// of whether the window dropped measured light. Reading the axis labels
// instead is unreliable -- peak captions are numbers on the plot too.
function drawnBandSamples(svg) {
  return Number(svg.match(/data-spectrum-points="(\d+)"/)?.[1] ?? 0);
}
function drawnSegments(svg) {
  return [...svg.matchAll(/data-spectrum-band-segment="(\d+)"/g)].map(m => Number(m[1]));
}

test('the window keeps every selected line rather than cropping to the brightest', () => {
  const { scene, spectrometer, reading } = aotfScene({ channels: LINES });
  const svg = screenOf(scene, spectrometer);
  const measured = peaks(reading).length;
  assert.equal(drawnBandSamples(svg), measured,
    'every measured sample must survive the plotted window');
  assert.equal(drawnSegments(svg).length, LINES.length,
    'one drawn band per selected line');
});

test('a broadband source beside a laser line keeps both on the axis', () => {
  // A line concentrates all its power into the nominal width it is drawn
  // over, so on a density axis it stands orders of magnitude above any
  // continuum next to it. Measuring the continuum against THAT peak would
  // drop it off the plot for sharing a detector with a laser.
  const broadband = createElement('sclaser', 0, -3);
  broadband.params.beamMode = 'line';
  const laser = createElement('cwlaser', 0, 3);
  laser.params.wavelength = 1064;
  laser.params.beamMode = 'line';
  const spectrometer = createElement('spectrometer', 400, 0);
  spectrometer.params.aperture = 40;
  const scene = [broadband, laser, spectrometer];
  traceAll(scene);
  const svg = screenOf(scene, spectrometer);
  const reading = detectorReading(spectrometer.id);
  const bandSamples = reading.spectrum.filter(sample => sample.continuum).length;
  assert.ok(bandSamples > 8, 'the continuum was measured');
  assert.equal(drawnBandSamples(svg), bandSamples,
    'the whole continuum must stay on the axis beside the 1064 nm line');
  assert.match(svg, /data-spectrum-lines="1"/, 'and the line is still drawn');
});

test('a Gaussian envelope sampled by many narrow lines keeps all of them', () => {
  // The case this is really for: a pulsed laser's own spectrum cut into
  // slices by an AOTF. Every slice has to stay on the plot, and their
  // heights have to still trace the envelope they were cut from.
  const source = createElement('pulsedlaser', 0, 0);
  Object.assign(source.params, { beamMode: 'beam', beamWidth: 6, wavelength: 800, pulseWidthFs: 20 });
  const aotf = createElement('aotf', 200, 0);
  const centres = [770, 782, 792, 800, 808, 818, 830];
  aotf.params.channels = centres.map(wl => ({ wl, band: 1.5, eff: 0.9 }));
  const spectrometer = createElement('spectrometer', 460, 0);
  const scene = [source, aotf, spectrometer];
  traceAll(scene);
  const svg = screenOf(scene, spectrometer);
  assert.equal(drawnSegments(svg).length, centres.length,
    'every slice of the envelope must be drawn');

  const reading = detectorReading(spectrometer.id);
  const byBand = new Map();
  for (const sample of reading.spectrum.filter(s => s.power > 1e-12)) {
    const key = sample.bandId || String(sample.wavelength);
    const entry = byBand.get(key) || { power: 0, wl: sample.wavelength };
    entry.power += sample.power;
    byBand.set(key, entry);
  }
  const bands = [...byBand.values()].sort((a, b) => a.wl - b.wl);
  assert.equal(bands.length, centres.length, 'one measured band per selected slice');
  // The envelope survives the sampling: power climbs to the centre slice and
  // falls away again, which is the Gaussian the AOTF cut its slices from.
  const middle = Math.floor(bands.length / 2);
  for (let i = 1; i <= middle; i++) {
    assert.ok(bands[i].power > bands[i - 1].power,
      `climbing to the centre: ${bands[i].wl.toFixed(0)} nm should carry more than `
      + `${bands[i - 1].wl.toFixed(0)} nm`);
  }
  for (let i = middle; i < bands.length - 1; i++) {
    assert.ok(bands[i + 1].power < bands[i].power,
      `falling away from the centre: ${bands[i + 1].wl.toFixed(0)} nm should carry less than `
      + `${bands[i].wl.toFixed(0)} nm`);
  }
  // A Gaussian is symmetric, and slices placed symmetrically about its centre
  // must come back carrying the same power.
  for (let i = 0; i < middle; i++) {
    const left = bands[i].power, right = bands[bands.length - 1 - i].power;
    assert.ok(Math.abs(left - right) / left < 0.02,
      `${bands[i].wl.toFixed(0)} and ${bands[bands.length - 1 - i].wl.toFixed(0)} nm `
      + 'sit symmetrically about the centre but carry different power');
  }
  // The peak of the envelope is the slice at the laser's own centre.
  assert.ok(Math.abs(bands[middle].wl - 800) < 2, 'the tallest slice is the one at 800 nm');
});
