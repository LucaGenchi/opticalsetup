import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acoustoOpticShiftedWavelength, aodDeflectionDeg, aodDriveFrequencyMHz, aodDriveInBand,
} from '../sketch/js/acousto-optic.js';
import { createElement, getElementMeta, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { detectorReading, traceAll, traceScene } from '../sketch/js/raytrace.js';

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

// ---------------- review findings ----------------

test('a broadband beam through an AOD stays a continuum, not a row of invented lines', () => {
  // An AOD sends every wavelength to its own angle, so the tracer fans a
  // broadband ray into quadrature nodes. Those nodes are a sampling of a
  // continuous spectrum; presented as discrete wavelengths they arrive at a
  // spectrometer as laser lines that were never in the source.
  const source = createElement('sclaser', 0, 0);
  Object.assign(source.params, { beamMode: 'beam', beamWidth: 6, scMin: 500, scMax: 600 });
  const aod = createElement('aod', 200, 0);
  Object.assign(aod.params, { centerDeflect: 0, scanRange: 0, eff: 0.9, zero: false });
  const spectrometer = createElement('spectrometer', 430, 0);
  spectrometer.params.aperture = 120;
  traceAll([source, aod, spectrometer]);
  const reading = detectorReading(spectrometer.id);
  const measured = reading.spectrum.filter(sample => sample.power > 1e-12);
  assert.ok(measured.length > 20, `expected a sampled band, got ${measured.length} samples`);
  assert.ok(measured.every(sample => sample.continuum),
    `${measured.filter(s => !s.continuum).length} node(s) reported as discrete lines`);
});

test('a single-wavelength beam through an AOD is still a line', () => {
  // The converse: the continuum flag must follow the source, not the element.
  const laser = createElement('cwlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'line', wavelength: 532 });
  const aod = createElement('aod', 200, 0);
  Object.assign(aod.params, { centerDeflect: 0, scanRange: 0, eff: 0.9, zero: false });
  const spectrometer = createElement('spectrometer', 430, 0);
  spectrometer.params.aperture = 120;
  traceAll([laser, aod, spectrometer]);
  const measured = detectorReading(spectrometer.id).spectrum.filter(s => s.power > 1e-12);
  assert.equal(measured.length, 1);
  assert.equal(measured[0].continuum, false);
});

test('a scanning AOD actually moves the beam as the simulation clock advances', () => {
  // The element is time-dependent, which is the whole point of it. If this
  // holds and the beam still does not move on canvas, the fault is in whether
  // the renderer re-traces -- see hasAodScan() in canvas.js's animateMotion.
  const laser = createElement('cwlaser', 80, 240);
  Object.assign(laser.params, { beamMode: 'line', wavelength: 532 });
  const aod = createElement('aod', 300, 240);
  Object.assign(aod.params, {
    centerDeflect: 8, scanRange: 12, scanMode: 'triangle', scanFreqKHz: 10, zero: false,
  });
  const screen = createElement('box', 560, 240);
  Object.assign(screen.params, { text: '', w: 3, h: 220, behavior: 'block' });

  const angleAt = simulationTimeNs => {
    const drawables = traceScene([laser, { ...aod, _simulationTimeNs: simulationTimeNs }, screen], []).drawables;
    const segment = drawables.filter(d => d.pts && d.pts.length > 1).pop();
    const start = segment.pts[0], end = segment.pts[segment.pts.length - 1];
    return Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  };
  // 10 kHz triangle: one period is 100 us, starting at the bottom of the band.
  assert.ok(Math.abs(angleAt(0) - 2) < 1e-6, 'starts at the low end of the scan');
  assert.ok(Math.abs(angleAt(25000) - 8) < 1e-6, 'passes the centre deflection');
  assert.ok(Math.abs(angleAt(50000) - 14) < 1e-6, 'reaches the top of the scan');
  assert.ok(Math.abs(angleAt(100000) - 2) < 1e-6, 'and returns');
});
