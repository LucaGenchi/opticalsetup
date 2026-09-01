import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import { aotfWingHalfWidth } from '../sketch/js/aotf.js';

// A supercontinuum whose light an AOTF has cut into several narrow, widely
// separated lines -- the one arrangement where a single source arrives
// carrying more than one disjoint band.
const PASSBAND = 2;

function aotfScene({ channels, passband = PASSBAND, extra = [] } = {}) {
  const source = createElement('sclaser', 0, 0);
  Object.assign(source.params, { beamMode: 'beam', beamWidth: 6, bandLo: 450, bandHi: 700 });
  const aotf = createElement('aotf', 180, 0);
  aotf.params.passband = passband;
  aotf.params.channels = channels;
  const spectrometer = createElement('spectrometer', 460, 0);
  const scene = [source, aotf, ...extra, spectrometer];
  traceAll(scene);
  return { scene, spectrometer, reading: detectorReading(spectrometer.id) };
}

const LINES = [
  { wl: 470, eff: 0.8 },
  { wl: 550, eff: 0.8 },
  { wl: 660, eff: 0.8 },
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

test('the light is where it was selected, and stops where the passband does', () => {
  const { reading } = aotfScene({ channels: LINES });
  const measured = peaks(reading);
  const reach = aotfWingHalfWidth(PASSBAND);
  for (const line of LINES) {
    const found = measured.find(sample => Math.abs(sample.wavelength - line.wl) <= PASSBAND);
    assert.ok(found, `nothing measured within ${PASSBAND} nm of the ${line.wl} nm line`);
  }
  // A sinc squared passband has sidelobes, so light does appear either side
  // of each line -- but it is truncated at a zero, so nothing survives past
  // the last one.
  const stray = measured.filter(sample =>
    LINES.every(line => Math.abs(sample.wavelength - line.wl) > reach + 0.5));
  assert.deepEqual(stray.map(sample => sample.wavelength.toFixed(1)), [],
    'light reported outside every channel\u2019s passband');
});

test('each channel peaks on the wavelength it was tuned to', () => {
  const { reading } = aotfScene({ channels: LINES });
  const measured = peaks(reading).slice().sort((a, b) => a.wavelength - b.wavelength);
  const density = measured.map(sample => sample.power / (sample.widthNm || 1));
  for (const line of LINES) {
    // The brightest sample within a channel's reach is the channel's centre.
    let best = -1, bestDensity = -Infinity;
    measured.forEach((sample, index) => {
      if (Math.abs(sample.wavelength - line.wl) > PASSBAND * 3) return;
      if (density[index] > bestDensity) { bestDensity = density[index]; best = index; }
    });
    assert.ok(best >= 0, `no samples near the ${line.wl} nm channel`);
    assert.ok(Math.abs(measured[best].wavelength - line.wl) < PASSBAND / 2,
      `the ${line.wl} nm channel peaks at ${measured[best].wavelength.toFixed(2)} nm`);
  }
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
  const reach = aotfWingHalfWidth(PASSBAND);
  const alone = peaks(aotfScene({ channels: [LINES[1]] }).reading);
  const withNeighbours = peaks(aotfScene({ channels: LINES }).reading)
    .filter(sample => Math.abs(sample.wavelength - 550) <= reach);
  const extentOf = list => {
    const wavelengths = list.map(sample => sample.wavelength);
    const half = Math.max(...list.map(sample => (sample.widthNm || 0) / 2));
    return (Math.max(...wavelengths) + half) - (Math.min(...wavelengths) - half);
  };
  const powerOf = list => list.reduce((sum, sample) => sum + sample.power, 0);
  // Within a bin: the two are sampled at different densities, because the
  // display budget is shared out among however many bands there are.
  assert.ok(Math.abs(extentOf(alone) - extentOf(withNeighbours)) < 1,
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
  const bandSamples = reading.spectrum.filter(sample => sample.continuum).length;
  assert.equal(drawnBandSamples(svg), bandSamples,
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

test('a Gaussian envelope sliced by an AOTF keeps every slice and its shape', () => {
  // The case this is really for: a pulsed laser's own spectrum cut into
  // slices by an AOTF. The slices here sit 8-12 nm apart with passbands only
  // 1.5 nm wide, so their Lorentzian wings overlap and the spectrometer
  // rightly reports one connected band -- no wavelength across the range is
  // fully blocked. What matters is that the band still resolves every slice,
  // and that their heights still trace the envelope they were cut from.
  const source = createElement('pulsedlaser', 0, 0);
  Object.assign(source.params, { beamMode: 'beam', beamWidth: 6, wavelength: 800, pulseWidthFs: 20 });
  const aotf = createElement('aotf', 200, 0);
  const centres = [770, 782, 792, 800, 808, 818, 830];
  aotf.params.passband = 1.5;
  aotf.params.channels = centres.map(wl => ({ wl, eff: 0.9 }));
  const spectrometer = createElement('spectrometer', 460, 0);
  const scene = [source, aotf, spectrometer];
  traceAll(scene);
  const svg = screenOf(scene, spectrometer);
  const reading = detectorReading(spectrometer.id);
  const samples = reading.spectrum
    .filter(sample => sample.power > 1e-15)
    .sort((a, b) => a.wavelength - b.wavelength);
  const density = samples.map(sample => sample.power / (sample.widthNm || 1));

  // Nothing measured may be cropped by the window.
  assert.equal(drawnBandSamples(svg),
    reading.spectrum.filter(sample => sample.continuum).length,
    'the window must keep the whole envelope');

  // Every channel shows up as a local maximum at the wavelength it was tuned
  // to. Sampled too coarsely, the peaks wash into one smooth blob instead.
  const heights = centres.map(centre => {
    let best = -1, bestDensity = -Infinity;
    samples.forEach((sample, index) => {
      if (Math.abs(sample.wavelength - centre) > 2) return;
      if (density[index] > bestDensity) { bestDensity = density[index]; best = index; }
    });
    assert.ok(best > 0 && best < samples.length - 1,
      `the ${centre} nm slice is not resolved`);
    assert.ok(density[best] > density[best - 1] && density[best] >= density[best + 1],
      `the ${centre} nm slice is not a peak -- the sampling has smoothed it away`);
    return bestDensity;
  });

  // And the peaks trace the Gaussian: climbing to the centre slice, falling
  // after it, and symmetric about it.
  const middle = Math.floor(centres.length / 2);
  for (let i = 1; i <= middle; i++) {
    assert.ok(heights[i] > heights[i - 1],
      `the ${centres[i]} nm slice should stand taller than ${centres[i - 1]} nm`);
  }
  for (let i = middle; i < centres.length - 1; i++) {
    assert.ok(heights[i + 1] < heights[i],
      `the ${centres[i + 1]} nm slice should stand shorter than ${centres[i]} nm`);
  }
  for (let i = 0; i < middle; i++) {
    const left = heights[i], right = heights[centres.length - 1 - i];
    assert.ok(Math.abs(left - right) / left < 0.06,
      `${centres[i]} and ${centres[centres.length - 1 - i]} nm sit symmetrically `
      + 'about the centre but come back at different heights');
  }
});


test('the passband is one property of the device, shared by every channel', () => {
  // A real AOTF's resolution is set by its crystal and interaction length,
  // not by which RF tones happen to be applied, so widening it has to widen
  // every selected line at once.
  const narrow = aotfScene({ channels: LINES, passband: 1 }).reading;
  const wide = aotfScene({ channels: LINES, passband: 6 }).reading;
  const totalOf = reading => peaks(reading).reduce((sum, s) => sum + s.power, 0);
  assert.ok(totalOf(wide) > 4 * totalOf(narrow),
    'a six-fold wider passband should pass roughly six times the light');

  const widthNear = (reading, wl) => {
    const near = peaks(reading).filter(s => Math.abs(s.wavelength - wl) < aotfWingHalfWidth(6));
    const ws = near.map(s => s.wavelength);
    return Math.max(...ws) - Math.min(...ws);
  };
  for (const line of LINES) {
    assert.ok(widthNear(wide, line.wl) > 3 * widthNear(narrow, line.wl),
      `the ${line.wl} nm line did not widen with the device passband`);
  }
});

test('the sinc squared passband has the sidelobes a real AOTF has', () => {
  // The rejection floor of an acousto-optic filter is set by its sidelobes,
  // not by an edge: a line sitting in the first sidelobe of a neighbouring
  // channel still gets a few percent through. That is a real limitation of
  // the device and it should be visible here.
  const aotf = createElement('aotf', 200, 0);
  const detector = createElement('detector', 400, 0);
  const at = wl => {
    const laser = createElement('cwlaser', 0, 0);
    Object.assign(laser.params, { wavelength: wl, beamMode: 'line' });
    aotf.params.passband = 4;
    aotf.params.channels = [{ wl: 532, eff: 1 }];
    traceAll([laser, aotf, detector]);
    return detectorReading(detector.id)?.signal ?? 0;
  };
  // Zeros land every 1.1288 passbands; sidelobe peaks between them.
  const zero = 4 / 0.44294647068945237 / 2;
  assert.ok(at(532 + zero) < 1e-6, `the first zero at +${zero.toFixed(2)} nm is a real zero`);
  assert.ok(at(532 + 2 * zero) < 1e-6, 'and so is the second');
  const firstLobe = at(532 + 1.4303 / 0.44294647068945237 * 2);
  assert.ok(firstLobe > 0.04 && firstLobe < 0.055,
    `the first sidelobe should carry about 4.7%, got ${(firstLobe * 100).toFixed(2)}%`);
  // Truncated at the third zero, so beyond that nothing.
  assert.equal(at(532 + 3.5 * zero), 0, 'the passband ends at the third zero');
});
