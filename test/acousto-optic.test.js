import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acoustoOpticShiftedWavelength, aodDeflectionDeg, aodDriveFrequencyMHz, aodDriveInBand,
} from '../sketch/js/acousto-optic.js';
import { createElement, getElementMeta, registry } from '../sketch/js/elements.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
};

test('AOM, AOD, and AOTF share the acousto-optic palette subgroup', () => {
  for (const type of ['aom', 'aod', 'aotf']) {
    assert.equal(registry[type].category, 'Modulators');
    assert.equal(registry[type].paletteGroup, 'Acousto-optic');
  }
});

test('AOD frequency is coupled to angle and scales with optical wavelength', () => {
  const params = {
    centerRfMHz: 80, bandwidthMHz: 40, centerDeflect: 4, scanRange: 4,
    designWavelength: 532, order: 1, scanMode: 'static', rfMHz: 80,
  };

  closeTo(aodDeflectionDeg(params, 532, 60), 2);
  closeTo(aodDeflectionDeg(params, 532, 80), 4);
  closeTo(aodDeflectionDeg(params, 532, 100), 6);
  closeTo(aodDeflectionDeg(params, 1064, 80), 8);
  closeTo(aodDeflectionDeg({ ...params, order: -1 }, 532, 100), -6);
});

test('AOD triangle and sawtooth scans stay inside their RF bandwidth', () => {
  const params = { centerRfMHz: 80, bandwidthMHz: 40, scanMode: 'triangle', scanFreqKHz: 0.001 };
  closeTo(aodDriveFrequencyMHz(params, 0), 60);
  closeTo(aodDriveFrequencyMHz(params, 0.25), 80);
  closeTo(aodDriveFrequencyMHz(params, 0.5), 100);
  closeTo(aodDriveFrequencyMHz(params, 1), 60);

  params.scanMode = 'sawtooth';
  closeTo(aodDriveFrequencyMHz(params, 0), 60);
  closeTo(aodDriveFrequencyMHz(params, 0.5), 80);
  assert.ok(aodDriveInBand(params, aodDriveFrequencyMHz(params, 0.999999)));
});

test('AOD trace steers and frequency-shifts the efficient first order', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.wavelength = 532;

  const aod = createElement('aod', 150, 0);
  aod.params.zero = false;
  aod.params.rfMHz = 80;
  aod.params.eff = 0.8;

  const detectorX = 300;
  const detectorFaceX = detectorX - 19;
  const detector = createElement('detector', detectorX,
    Math.tan(4 * Math.PI / 180) * (detectorFaceX - aod.x));

  traceAll([laser, aod, detector]);
  const reading = detectorReading(detector.id);
  assert.ok(reading);
  closeTo(reading.signal, 0.8);
  closeTo(reading.wavelength, acoustoOpticShiftedWavelength(532, 80, 1), 1e-8);
});

test('a broadband beam leaves an AOD as a wavelength-dependent angular fan', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.transformLimited = false;
  laser.params.wavelength = 532;
  laser.params.bandwidth = 40;
  const aod = createElement('aod', 150, 0);
  aod.params.zero = false;

  const outgoingAngles = traceAll([laser, aod])
    .filter(path => path.type === 'path' && path.pts.at(-2).x >= aod.x - 1e-6)
    .map(path => {
      const start = path.pts.at(-2), end = path.pts.at(-1);
      return Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
    });

  assert.ok(outgoingAngles.length >= 3, 'the broadband input should expand into spectral rays');
  assert.ok(Math.max(...outgoingAngles) - Math.min(...outgoingAngles) > 0.3,
    'different wavelengths should leave at visibly different angles');
});

test('an out-of-band AOD drive suppresses diffraction and returns all power to the zero order', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  const aod = createElement('aod', 150, 0);
  aod.params.centerRfMHz = 80;
  aod.params.bandwidthMHz = 40;
  aod.params.rfMHz = 120;
  aod.params.zero = true;
  assert.match(getElementMeta('aod', aod.params).note, /outside the configured RF bandwidth/);

  const zeroOrder = createElement('detector', 300, 0);
  traceAll([laser, aod, zeroOrder]);
  closeTo(detectorReading(zeroOrder.id).signal, 1);

  aod.params.zero = false;
  traceAll([laser, aod, zeroOrder]);
  assert.equal(detectorReading(zeroOrder.id), null);
});

test('AOD animated surfaces derive their instantaneous drive from simulated time', () => {
  const aod = createElement('aod');
  aod.params.scanMode = 'triangle';
  aod.params.scanFreqKHz = 0.001;
  aod._simulationTimeNs = 500e6;
  closeTo(registry.aod.surfaces(aod)[0].data.rfMHz, 100);
});
