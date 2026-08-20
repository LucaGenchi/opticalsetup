import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, galvoAngleAt, registry } from '../sketch/js/elements.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';
import { resolveSourceSpectrum } from '../sketch/js/spectrum.js';
import { wavelengthToColor } from '../sketch/js/util.js';

const EPS = 1e-9;

function nearly(actual, expected, tolerance = EPS) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`);
}

function lastAngle(path) {
  const a = path.pts.at(-2);
  const b = path.pts.at(-1);
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
}

function signedAngleDelta(from, to) {
  return ((to - from + 540) % 360) - 180;
}

function reflectedAngle(params, timeSeconds = 0) {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  const galvo = createElement('galvo', 180, 0);
  Object.assign(galvo.params, params);
  galvo._animationTimeS = timeSeconds;
  const ray = traceAll([laser, galvo])
    .filter(drawable => drawable.type === 'path' && drawable.pts.length >= 3)
    .sort((a, b) => b.pts.length - a.pts.length)[0];
  assert.ok(ray, 'the source ray should strike and leave the galvo mirror');
  return lastAngle(ray);
}

test('supercontinuum laser is a first-class pulsed source with a readable default spectrum', () => {
  assert.ok(Object.hasOwn(registry, 'sclaser'));
  assert.equal(registry.sclaser.label, 'Supercontinuum laser');

  const source = createElement('sclaser', 0, 0);
  assert.equal(source.params.temporalMode, 'pulsed');
  assert.equal(source.params.scMin, 300);
  assert.equal(source.params.scMax, 700);
  assert.equal(resolveSourceSpectrum('sclaser', source.params).wl,
    (source.params.scMin + source.params.scMax) / 2);

  source.params.beamMode = 'line';
  const detector = createElement('detector', 300, 0);
  traceAll([source, detector]);
  const reading = detectorReading(detector.id);
  assert.ok(reading);
  nearly(reading.bandMin, source.params.scMin);
  nearly(reading.bandMax, source.params.scMax);
  assert.ok(reading.pulse, 'the dedicated source should produce a pulsed track by default');
});

test('a broadband filter transmits the true spectral overlap without a visibility power floor', () => {
  const source = createElement('sclaser', 0, 0);
  source.params.beamMode = 'line';
  source.params.scMin = 400;
  source.params.scMax = 800;
  const filter = createElement('filter', 150, 0);
  filter.params.ftype = 'bandpass';
  filter.params.band = 20;
  const detector = createElement('detector', 300, 0);

  filter.params.center = 550; // 20 nm wholly inside a 400 nm source band
  traceAll([source, filter, detector]);
  nearly(detectorReading(detector.id).signal, 20 / 400);

  filter.params.center = 795; // [785, 805] overlaps [400, 800] by 15 nm
  traceAll([source, filter, detector]);
  nearly(detectorReading(detector.id).signal, 15 / 400);

  filter.params.center = 900;
  traceAll([source, filter, detector]);
  assert.equal(detectorReading(detector.id), null);
});

test('one broadband source produces wavelength-dependent paths through a prism', () => {
  const source = createElement('sclaser', 0, 0);
  source.params.beamMode = 'line';
  source.params.scMin = 450;
  source.params.scMax = 700;
  const prism = createElement('prism', 180, 0);
  prism.params.psize = 50;
  prism.rot = 20;

  const outgoing = traceAll([source, prism])
    .filter(drawable => drawable.type === 'path' && drawable.pts.length >= 3);
  const angles = new Set(outgoing.map(path => lastAngle(path).toFixed(5)));
  assert.ok(angles.size >= 5, `expected a dispersed fan, received ${angles.size} outgoing angle(s)`);

  const blue = outgoing.find(path => path.color === wavelengthToColor(source.params.scMin));
  const red = outgoing.find(path => path.color === wavelengthToColor(source.params.scMax));
  assert.ok(blue && red, 'the dispersed fan should retain both spectral endpoints');
  assert.ok(lastAngle(blue) > lastAngle(red), 'short wavelengths should deviate more than long wavelengths');
});

test('galvo static, sine, and triangle commands have deterministic mechanical angles', () => {
  const staticParams = { scanMode: 'static', commandAngle: 7 };
  nearly(galvoAngleAt(staticParams, 0), 7);
  nearly(galvoAngleAt(staticParams, 123.456), 7);

  for (const scanMode of ['sine', 'triangle']) {
    const params = {
      scanMode,
      commandAngle: 3,
      scanAmplitude: 10,
      scanFrequencyHz: 2,
      scanPhaseDeg: 0,
    };
    const period = 1 / params.scanFrequencyHz;
    nearly(galvoAngleAt(params, 0), 3);
    nearly(galvoAngleAt(params, period / 4), 13);
    nearly(galvoAngleAt(params, period / 2), 3);
    nearly(galvoAngleAt(params, 3 * period / 4), -7);
    nearly(galvoAngleAt(params, period), 3);
  }
});

test('galvo reflected direction scans by twice the mechanical mirror angle', () => {
  const base = reflectedAngle({ scanMode: 'static', commandAngle: 0 });
  const staticTilt = reflectedAngle({ scanMode: 'static', commandAngle: 7 });
  nearly(signedAngleDelta(base, staticTilt), 14, 1e-7);

  for (const scanMode of ['sine', 'triangle']) {
    const params = {
      scanMode,
      commandAngle: 0,
      scanAmplitude: 10,
      scanFrequencyHz: 1,
      scanPhaseDeg: 0,
    };
    const positive = reflectedAngle(params, 0.25);
    const negative = reflectedAngle(params, 0.75);
    nearly(signedAngleDelta(base, positive), 20, 1e-7);
    nearly(signedAngleDelta(base, negative), -20, 1e-7);
  }
});
