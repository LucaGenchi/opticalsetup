// A filter, dichroic, etalon or AOTF that reshapes a pulse's spectrum leaves a
// pulse whose duration follows from what survives: an ideal filter changes the
// spectrum's amplitude and not its phase, so the pulse at a detector is the
// transform of the surviving spectrum with the source's quadratic phase plus
// every GDD on the path, wherever the filter stands.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { quadraticPhasePulse } from '../sketch/js/pulse-field.js';
import { gaussianPulseDurationAfterGDD } from '../sketch/js/glass.js';
import { transformLimitedDurationFs } from '../sketch/js/spectrum.js';
import '../sketch/js/detector-instruments.js';

const close = (actual, expected, tolerance, label = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} ${actual} is not within ${tolerance} of ${expected}`);
const cNmFs = 299.792458;

test('the numerical transform reproduces the analytic Gaussian and the sinc limit of a box', () => {
  const gaussian = nm => Math.exp(-4 * Math.LN2 * ((nm - 800) / 10) ** 2);
  const tau0 = transformLimitedDurationFs(10, 800, 'gauss');
  // 1e6 fs² is far past the numerical window: the stationary-phase limit.
  for (const gdd of [0, 5000, -36000, 1e6]) {
    const result = quadraticPhasePulse(gaussian, 770, 830, gdd);
    const expected = gaussianPulseDurationAfterGDD(tau0, gdd);
    close(result.durationFs, expected, 0.005 * expected, `${gdd} fs²`);
  }
  // A flat 1 nm band: sinc² with a FWHM of 0.886 / Δν.
  const box = quadraticPhasePulse(() => 1, 649.5, 650.5, 0);
  const expected = 0.886 / (cNmFs * 1 / 650 ** 2);
  close(box.transformLimitFs, expected, 0.01 * expected);
});

function laser(params) {
  const source = createElement('pulsedlaser', 0, 0);
  Object.assign(source.params, { wavelength: 800, beamMode: 'line', ...params });
  return source;
}
function continuum() {
  const source = createElement('sclaser', 0, 0);
  Object.assign(source.params, { temporalMode: 'pulsed', beamMode: 'line', scMin: 400, scMax: 900, pulseWidthFs: 500 });
  return source;
}
function at(type, x, params) {
  const element = createElement(type, x, 0);
  Object.assign(element.params, params);
  return element;
}
const rod = x => at('glassrod', x, { rodlen: 100, dia: 20, material: 'nbk7' });
const bandpass = (x, center, band) => at('filter', x, { ftype: 'bandpass', center, band });
function read(elements) {
  const det = createElement('detector', 800, 0);
  det.params.aperture = 40;
  traceScene([...elements, det]);
  return detectorReading(det.id);
}

test('a filter before or after the same glass leaves the same pulse', () => {
  const tl = () => laser({ transformLimited: true, pulseWidthFs: 20 });
  const before = read([tl(), bandpass(150, 800, 10), rod(400)]).pulse;
  const after = read([tl(), rod(250), bandpass(500, 800, 10)]).pulse;
  for (const pulse of [before, after]) assert.match(pulse.dispersionModel, /^Filtered spectrum · numerical transform/);
  close(before.stretchedPulseWidthFs, after.stretchedPulseWidthFs, 0.03 * after.stretchedPulseWidthFs, 'before vs after');
  // 10 nm of a 47 nm pulse is nearly flat: a sinc limit near 0.886 / Δν.
  close(after.transformLimitFs, 0.886 / (cNmFs * 10 / 800 ** 2), 10);
});

test('a filtered chirped pulse is timed with the source chirp and recompresses to its own limit', () => {
  const chirped = () => laser({ transformLimited: false, bandwidth: 30, inputChirp: 'positive', chirpGddFs2: 20000 });
  const filtered = read([chirped(), bandpass(150, 800, 10)]).pulse;
  assert.match(filtered.dispersionModel, /positive source chirp 20,000 fs²/);
  assert.ok(filtered.stretchedPulseWidthFs > filtered.transformLimitFs);
  const compressed = read([chirped(), bandpass(150, 800, 10), at('pulsecompressor', 400, { gddFs2: -20000 })]).pulse;
  close(compressed.stretchedPulseWidthFs, filtered.transformLimitFs, 0.01 * filtered.transformLimitFs);
});

test('a 1 nm slice of a continuum is timed, and survives optics after the filter', () => {
  // Before and after the glass, and straight onto the detector.
  const cases = [
    read([continuum(), bandpass(150, 650, 1)]),
    read([continuum(), rod(250), bandpass(500, 650, 1)]),
    read([continuum(), bandpass(150, 650, 1), rod(400)]),
  ];
  for (const reading of cases) {
    assert.ok(reading?.pulse, 'the slice reaches the detector');
    assert.match(reading.pulse.dispersionModel, /^Filtered continuum · linear-chirp estimate/);
    // Its sinc limit, 1.25 ps; the source's 500 fs sweep adds under 1 fs.
    close(reading.pulse.stretchedPulseWidthFs, 1249, 15);
  }
  // 1/500 of the continuum passes, then the rod's two faces.
  const direct = cases[0].signal, throughGlass = cases[2].signal;
  assert.ok(throughGlass > 0.85 * direct && throughGlass < direct, `${throughGlass} vs ${direct}`);
});

test('a broad filtered continuum after glass is stretched by the glass across what passes', () => {
  const longpass = read([continuum(), rod(250), at('filter', 500, { ftype: 'longpass', cutoff: 800 })]).pulse;
  const unfiltered = read([continuum(), rod(250)]).pulse;
  // 800-900 nm through 100 mm of N-BK7: roughly a picosecond of spread, far
  // less than the whole continuum's 20 ps.
  assert.ok(longpass.stretchedPulseWidthFs > 500 && longpass.stretchedPulseWidthFs < 1500, `${longpass.stretchedPulseWidthFs}`);
  assert.ok(unfiltered.stretchedPulseWidthFs > 10 * longpass.stretchedPulseWidthFs);
});
