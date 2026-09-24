// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
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
import { gaussianPulseDurationAfterGDD, DISPERSION_UNAVAILABLE, filteredPulseDuration, pulseDurationAfterDispersion } from '../sketch/js/glass.js';
import { flatSpectrum } from '../sketch/js/spectrum.js';
import { transformLimitedDurationFs } from '../sketch/js/spectrum.js';
import '../sketch/js/detector-instruments.js';
import '../sketch/js/etalon.js';

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
  for (const pulse of [before, after]) assert.match(pulse.dispersionModel, /^Filtered spectrum · effective quadratic phase/);
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
    assert.match(reading.pulse.dispersionModel, /^Filtered continuum · assumed-sweep estimate/);
    // Its sinc limit, 1.25 ps; the source's 500 fs sweep adds under 1 fs.
    close(reading.pulse.stretchedPulseWidthFs, 1249, 15);
  }
  // 1/500 of the continuum passes, then the rod's two faces.
  const direct = cases[0].signal, throughGlass = cases[2].signal;
  assert.ok(throughGlass > 0.85 * direct && throughGlass < direct, `${throughGlass} vs ${direct}`);
});

test('a broad filtered band behind glass declines instead of one quadratic phase standing for it', () => {
  // 800-900 nm after 100 mm of N-BK7: the glass's GDD across the band moves
  // the edge phase by radians, which one effective GDD would drop.
  const longpass = read([continuum(), rod(250), at('filter', 500, { ftype: 'longpass', cutoff: 800 })]).pulse;
  assert.equal(longpass.stretchedPulseWidthFs, null);
  assert.equal(longpass.dispersionModel, DISPERSION_UNAVAILABLE.broadGdd);
  // With no glass there is one GDD, zero, and it is timed.
  const bare = read([continuum(), at('filter', 150, { ftype: 'longpass', cutoff: 800 })]).pulse;
  assert.match(bare.dispersionModel, /^Filtered continuum/);
});

test('a grating order and a filter give the same pulse in either order', () => {
  // A grating keeps each order sample's slice as fanLo/fanHi; a filter cuts it
  // as it cuts a slice of a glass-fanned band.
  const angle = Math.atan2(2880, -5264);
  const through = (filterFirst, source) => {
    const filter = at('filter', 120, { ftype: 'bandpass', center: 800, band: 10, length: 300 });
    const grating = at('grating', 200, { lines: 600, orders: '1' });
    if (!filterFirst) {
      Object.assign(filter, { x: 200 + 150 * Math.cos(angle), y: 150 * Math.sin(angle), rot: angle * 180 / Math.PI });
    }
    const det = createElement('detector', 200 + 300 * Math.cos(angle), 300 * Math.sin(angle));
    det.rot = angle * 180 / Math.PI;
    det.params.aperture = 300;
    traceScene(filterFirst ? [source(), filter, grating, det] : [source(), grating, filter, det]);
    return detectorReading(det.id);
  };
  const tl = () => laser({ transformLimited: true, pulseWidthFs: 20 });
  const sc = () => {
    const source = createElement('sclaser', 0, 0);
    Object.assign(source.params, { temporalMode: 'pulsed', beamMode: 'line', scMin: 700, scMax: 900, pulseWidthFs: 500 });
    return source;
  };
  for (const [label, source, share] of [['laser', tl, 0.2], ['continuum', sc, 10 / 200]]) {
    const first = through(true, source), after = through(false, source);
    close(after.signal, share, 0.01, `${label}: 10 nm of the band passes`);
    close(first.signal, after.signal, 0.03 * after.signal, `${label}: power either way`);
    close(first.pulse.stretchedPulseWidthFs, after.pulse.stretchedPulseWidthFs, 0.02 * after.pulse.stretchedPulseWidthFs, `${label}: duration either way`);
    close(after.pulse.stretchedPulseWidthFs, 190, 5, `${label}: the 10 nm limit`);
  }
});

// --- Review round: the reviewer's three reproductions ----------------------

test('the answer does not depend on how the same arriving light is partitioned', () => {
  const tl = { transformLimited: true };
  const shared = flatSpectrum(700, 900);
  const partitioned = filteredPulseDuration(tl, [
    { spec: shared, lo: 700, hi: 800, power: 1 }, { spec: shared, lo: 800, hi: 900, power: 0.1 }], 0).durationFs;
  const own = filteredPulseDuration(tl, [
    { spec: flatSpectrum(700, 800), lo: 700, hi: 800, power: 1 }, { spec: flatSpectrum(800, 900), lo: 800, hi: 900, power: 0.1 }], 0).durationFs;
  close(partitioned, own, 1e-9, 'shared vs own parent');
  const equal = filteredPulseDuration(tl, [
    { spec: shared, lo: 700, hi: 800, power: 1 }, { spec: shared, lo: 800, hi: 900, power: 1 }], 0).durationFs;
  assert.ok(partitioned > equal * 1.1, `the attenuated half narrows the spectrum: ${partitioned} vs ${equal}`);
});

test('a narrow feature on wide bounds is timed as the narrow feature it is', () => {
  const line = nm => Math.exp(-4 * Math.LN2 * ((nm - 800) / 1) ** 2);
  const tau0 = transformLimitedDurationFs(1, 800, 'gauss');
  const result = quadraticPhasePulse(line, 400, 900, 10000);
  close(result.durationFs, gaussianPulseDurationAfterGDD(tau0, 10000), 0.005 * result.durationFs, '1 nm line in 400-900 nm');
  close(result.transformLimitFs, tau0, 0.005 * tau0);
  // Two separated 1 nm lines: the outermost half-height crossings follow the
  // envelope they share, within a beat period, not the 500 nm span.
  const two = quadraticPhasePulse(nm => line(nm) + Math.exp(-4 * Math.LN2 * ((nm - 500) / (500 / 800) ** 2) ** 2), 400, 900, 0);
  assert.ok(two && two.transformLimitFs > 0.8 * tau0 && two.transformLimitFs < 1.2 * tau0, `${two?.transformLimitFs}`);
});

test('a packet near cancellation keeps the residual GDD the detector sees', async () => {
  const pulse = {
    pulseWidthFs: 100, transformLimited: false, inputGddFs2: 1e6, transformLimitFs: 10, spectrumReshaped: true,
    filteredPieces: [{ spec: flatSpectrum(750, 850), lo: 750, hi: 850, power: 1 }],
  };
  const { pulseEnvelopeAtOpticalPath } = await import('../sketch/js/pulses.js');
  const track = { pulse, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }], opls: [0, 10], gddTrace: [{ opl: 0, gdd: -999900, linear: false }], groupDelayDifferenceTrace: null };
  const packet = pulseEnvelopeAtOpticalPath(track, 5);
  const detector = pulseDurationAfterDispersion(pulse, -999900).durationFs;
  close(packet.pulseWidthFs, detector, 0.005 * detector, 'packet vs detector');
});

test('an etalon keeps a pulse\'s power but does not time it from a comb it does not carry', () => {
  const tl = () => laser({ transformLimited: true, pulseWidthFs: 20 });
  const etalon = at('etalon', 200, { centerWavelength: 800, fsr: 20, bandwidth: 2, peakTransmission: 98 });
  const reading = read([tl(), etalon]);
  assert.ok(reading.signal > 0);
  assert.equal(reading.pulse.stretchedPulseWidthFs, null);
  assert.equal(reading.pulse.dispersionModel, DISPERSION_UNAVAILABLE.etalon);
});

test('an etalon after a filter still declines timing, at the detector and on its packets', async () => {
  // The reviewer's reproduction: the bandpass reshapes first, so the etalon's
  // own reshaping is not re-detected; its timing limit is marked regardless.
  const { pulseEnvelopeAtOpticalPath } = await import('../sketch/js/pulses.js');
  const source = laser({ transformLimited: true, pulseWidthFs: 20 });
  const etalon = at('etalon', 400, { centerWavelength: 800, fsr: 20, bandwidth: 2, peakTransmission: 98 });
  const det = createElement('detector', 800, 0);
  det.params.aperture = 40;
  const { pulseTracks } = traceScene([source, bandpass(200, 800, 10), etalon, det]);
  const reading = detectorReading(det.id);
  assert.ok(reading.signal > 0);
  assert.equal(reading.pulse.stretchedPulseWidthFs, null);
  assert.equal(reading.pulse.dispersionModel, DISPERSION_UNAVAILABLE.etalon);
  const after = pulseTracks.filter(track => track.pulse?.etalonComb);
  assert.ok(after.length > 0, 'the tracks after the etalon carry the mark');
  for (const track of after) {
    const packet = pulseEnvelopeAtOpticalPath(track, (track.opls[0] + track.opls.at(-1)) / 2);
    assert.equal(packet.dispersionModel, DISPERSION_UNAVAILABLE.etalon);
  }
});
