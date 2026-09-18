// The pulsed laser's temporal controls: transform-limited pulses are authored
// as a duration; chirped ones as a bandwidth, a quadratic chirp's sign and its
// GDD, with every duration derived so it can never fall below the transform
// limit the bandwidth sets.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry, pulseEnergyJ, formatEnergy, peakPowerW } from '../sketch/js/elements.js';
import { authoredPulseTiming, gaussianPulseDurationAfterGDD, MAX_SOURCE_GDD_FS2 } from '../sketch/js/glass.js';
import { transformLimitedDurationFs } from '../sketch/js/spectrum.js';

const spec = key => registry.pulsedlaser.params.find(p => p.key === key);
const close = (actual, expected, tolerance, label = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} ${actual} is not within ${tolerance} of ${expected}`);

test('the transform-limited toggle comes first and decides which fields are authored', () => {
  const keys = registry.pulsedlaser.params.map(p => p.key);
  assert.ok(keys.indexOf('transformLimited') < keys.indexOf('pulseWidthFs'), 'toggle before the duration');
  const shownWhen = (key, transformLimited) => {
    const s = spec(key);
    return !s.show || s.show({ transformLimited });
  };
  for (const key of ['pulseWidthFs', 'bandwidthTL']) {
    assert.equal(shownWhen(key, true), true, key);
    assert.equal(shownWhen(key, false), false, key);
  }
  for (const key of ['bandwidth', 'durationTL', 'inputChirp', 'chirpGddFs2', 'durationChirped']) {
    assert.equal(shownWhen(key, true), false, key);
    assert.equal(shownWhen(key, false), true, key);
  }
  assert.equal(shownWhen('pulseShape', true) && shownWhen('pulseShape', false), true, 'shape in both');
  assert.deepEqual(spec('inputChirp').options.map(o => o[0]), ['positive', 'negative'], 'no Unknown on the laser');
  assert.equal(spec('chirpGddFs2').min, 0);
  assert.equal(spec('chirpGddFs2').max, MAX_SOURCE_GDD_FS2);
});

test('a chirped laser emits the duration its bandwidth and GDD give, never below the limit', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { wavelength: 800, transformLimited: false, bandwidth: 5, inputChirp: 'negative', chirpGddFs2: 0 });
  const tau0 = transformLimitedDurationFs(5, 800, 'gauss');
  close(authoredPulseTiming(laser.params).durationFs, tau0, 1e-9, 'no GDD: at the limit');
  laser.params.chirpGddFs2 = 135000;
  const timing = authoredPulseTiming(laser.params);
  assert.equal(timing.inputGddFs2, -135000, 'the sign and magnitude make one signed GDD');
  close(timing.durationFs, gaussianPulseDurationAfterGDD(tau0, 135000), 1e-9);
  assert.ok(timing.durationFs > 1900 && timing.durationFs < 2100, 'about 2 ps, as in the reviewer\'s scene');
  // The readouts show the same numbers.
  assert.match(spec('durationTL').readout(laser.params), /188\.3 fs/);
  assert.match(spec('durationChirped').readout(laser.params), /ps$/);
});

test('pulse energy and peak power follow the emitted pulse', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { avgPowerW: 0.1, repRateMHz: 80, transformLimited: true, pulseWidthFs: 100 });
  close(pulseEnergyJ(laser.params), 1.25e-9, 1e-18);
  assert.equal(formatEnergy(pulseEnergyJ(laser.params)), '1.25 nJ');
  assert.equal(spec('pulseEnergy').readout(laser.params), '1.25 nJ');
  const limited = peakPowerW(laser.params);
  Object.assign(laser.params, { transformLimited: false, bandwidth: 9.4, chirpGddFs2: 20000 });
  assert.ok(peakPowerW(laser.params) < limited / 3, 'a stretched pulse has less peak power');
  assert.doesNotMatch(spec('peakPower').readout(laser.params), /estimate/, 'a chirped Gaussian stays Gaussian');
  laser.params.pulseShape = 'sech2';
  assert.match(spec('peakPower').readout(laser.params), /estimate/, 'a dispersed sech² is not an exact sech²');
});
