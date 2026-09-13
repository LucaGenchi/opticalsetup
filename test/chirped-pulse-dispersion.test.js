import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import {
  glassGroupDelayDifferenceFs, glassGroupIndex, pulseDurationAfterDispersion,
  sech2PulseDurationAfterGDD,
} from '../sketch/js/glass.js';
import { pulseEnvelopeAtOpticalPath } from '../sketch/js/pulses.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { transformLimitedBandwidthNm, transformLimitedDurationFs } from '../sketch/js/spectrum.js';
import { parseSketch } from '../sketch/js/state.js';

const close = (actual, expected, tolerance = 1e-9, label = '') => {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label || 'value'}: expected ${expected}, got ${actual}`);
};

function slabBench(source) {
  source.params.beamMode = 'line';
  const slab = createElement('freeglass', 150, 0);
  Object.assign(slab.params, {
    material: 'nbk7', transEff: 100, scale: 1,
    vertices: [
      { x: -2.5, y: -30 }, { x: 2.5, y: -30 },
      { x: 2.5, y: 30 }, { x: -2.5, y: 30 },
    ],
  });
  const detector = createElement('detector', 300, 0);
  detector.params.aperture = 100;
  const scene = traceScene([source, slab, detector]);
  return { detector, reading: detectorReading(detector.id), scene };
}

test('a chirped Gaussian uses bandwidth to recover input GDD and can compress to its transform limit', () => {
  const wavelength = 800, bandwidth = 10, input = 200;
  const tau0 = transformLimitedDurationFs(bandwidth, wavelength, 'gauss');
  const magnitude = tau0 * tau0 / (4 * Math.LN2) * Math.sqrt((input / tau0) ** 2 - 1);
  const pulse = {
    pulseWidthFs: input, bandwidthNm: bandwidth, centerWavelengthNm: wavelength,
    pulseShape: 'gauss', transformLimited: false, inputChirp: 'negative',
  };

  const compressed = pulseDurationAfterDispersion(pulse, magnitude);
  close(compressed.durationFs, tau0, 1e-9, 'compressed duration');
  close(compressed.inputGddFs2, -magnitude, 1e-9, 'input GDD');
  assert.ok(compressed.durationFs < input);

  const stretchedAgain = pulseDurationAfterDispersion(pulse, 2 * magnitude);
  close(stretchedAgain.durationFs, input, 1e-9, 'symmetric stretch after crossing zero');
});

test('the transform-limited Gaussian result remains the existing closed-form number', () => {
  const pulse = {
    pulseWidthFs: 10, bandwidthNm: transformLimitedBandwidthNm(10, 800, 'gauss'),
    centerWavelengthNm: 800, pulseShape: 'gauss', transformLimited: true,
  };
  const gdd = 222.5;
  const expected = 10 * Math.sqrt(1 + (4 * Math.LN2 * gdd / 100) ** 2);
  close(pulseDurationAfterDispersion(pulse, gdd).durationFs, expected, 1e-12);
});

test('sech² GDD follows the verified numerical Fourier table and reverses authored chirp', () => {
  const tau0 = 100, gdd = 5000; // |GDD| / tau0² = 0.5
  close(sech2PulseDurationAfterGDD(tau0, gdd), 187.817310, 1e-6);
  const bandwidth = transformLimitedBandwidthNm(tau0, 800, 'sech2');
  const input = sech2PulseDurationAfterGDD(tau0, gdd);
  const pulse = {
    pulseWidthFs: input, bandwidthNm: bandwidth, centerWavelengthNm: 800,
    pulseShape: 'sech2', transformLimited: false, inputChirp: 'negative',
  };
  close(pulseDurationAfterDispersion(pulse, gdd).durationFs, tau0, 1e-6);
});

test('the flat-band model uses Sellmeier endpoint group delay, not centre GDD', () => {
  const lo = 690, hi = 700, length = 5, input = 250;
  const expectedDelay = length * (glassGroupIndex('nbk7', hi) - glassGroupIndex('nbk7', lo))
    * (1e12 / 299792458);
  close(glassGroupDelayDifferenceFs('nbk7', lo, hi, length), expectedDelay, 1e-9);

  const source = createElement('sclaser', 0, 0);
  Object.assign(source.params, { scMin: lo, scMax: hi, pulseWidthFs: input });
  const { reading } = slabBench(source);
  assert.ok(reading?.pulse);
  close(reading.pulse.groupDelayDifferenceFs, expectedDelay, 0.05, 'traced endpoint delay');
  close(reading.pulse.stretchedPulseWidthFs,
    Math.sqrt(input * input + expectedDelay * expectedDelay), 0.05, 'flat-band duration');
  assert.match(reading.pulse.dispersionModel, /Flat-band endpoint/);
});

test('Gaussian, sech² and supercontinuum sources all acquire a finite duration through one glass slab', () => {
  const gaussian = createElement('pulsedlaser', 0, 0);
  Object.assign(gaussian.params, {
    wavelength: 800, pulseWidthFs: 200, transformLimited: false,
    bandwidth: 10, pulseShape: 'gauss', inputChirp: 'positive',
  });
  const sech = createElement('pulsedlaser', 0, 0);
  Object.assign(sech.params, {
    wavelength: 800, pulseWidthFs: 200, transformLimited: false,
    bandwidth: 7, pulseShape: 'sech2', inputChirp: 'positive',
  });
  const continuum = createElement('sclaser', 0, 0);
  Object.assign(continuum.params, { scMin: 690, scMax: 700, pulseWidthFs: 250 });

  for (const source of [gaussian, sech, continuum]) {
    const { reading } = slabBench(source);
    assert.ok(Number.isFinite(reading?.pulse?.stretchedPulseWidthFs), source.type);
    assert.ok(reading.pulse.stretchedPulseWidthFs > source.params.pulseWidthFs, source.type);
  }
});

test('0 nm bandwidth stays unstretched, and packet and detector use the same chirped duration', () => {
  const monochromatic = createElement('pulsedlaser', 0, 0);
  Object.assign(monochromatic.params, {
    wavelength: 800, pulseWidthFs: 200, transformLimited: false,
    bandwidth: 0, pulseShape: 'gauss', inputChirp: 'negative',
  });
  const mono = slabBench(monochromatic).reading.pulse;
  close(mono.stretchedPulseWidthFs, 200);
  assert.equal(mono.dispersionModel, '0 nm bandwidth — unchanged');

  const chirped = createElement('pulsedlaser', 0, 0);
  Object.assign(chirped.params, {
    wavelength: 800, pulseWidthFs: 200, transformLimited: false,
    bandwidth: 10, pulseShape: 'gauss', inputChirp: 'positive',
  });
  const { reading, scene } = slabBench(chirped);
  const tracks = scene.pulseTracks.filter(candidate => candidate.opls.length >= 3);
  const track = tracks.reduce((best, candidate) => {
    const delta = Math.abs((candidate.gddTrace?.at(-1)?.gdd ?? 0) - reading.pulse.gddFs2);
    const bestDelta = Math.abs((best?.gddTrace?.at(-1)?.gdd ?? Infinity) - reading.pulse.gddFs2);
    return !best || delta < bestDelta ? candidate : best;
  }, null);
  assert.ok(track);
  const local = pulseEnvelopeAtOpticalPath(track, track.opls.at(-1) - 1e-6);
  close(local.pulseWidthFs, reading.pulse.stretchedPulseWidthFs, 1e-4);
});

test('legacy pulsed-laser saves gain a safe positive input-chirp default', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  laser.params.transformLimited = false;
  delete laser.params.inputChirp;
  const saved = JSON.stringify({ app: 'optics2d', version: 1, elements: [laser], beams: [] });
  const [loaded] = parseSketch(saved, registry).elements;
  assert.equal(loaded.params.inputChirp, 'positive');
});
