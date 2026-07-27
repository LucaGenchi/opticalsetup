import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { traceAll } from '../sketch/js/raytrace.js';
import { DETECTOR_TYPES } from '../sketch/js/detector-instruments.js';

function screenFor(sensor, elements, view = 'main') {
  const display = createElement('display', sensor.x + 130, sensor.y + 80);
  display.params.sensorId = sensor.id;
  display.params.displayView = view;
  const scene = [...elements, display];
  traceAll(scene);
  return registry.display.svg(display, scene);
}

test('Detectors contains the eight requested instruments in order', () => {
  const listed = Object.entries(registry)
    .filter(([, definition]) => definition.category === 'Detectors' && definition.readoutKind)
    .sort((a, b) => (a[1].paletteOrder ?? 100) - (b[1].paletteOrder ?? 100))
    .map(([type]) => type);

  assert.deepEqual(listed, DETECTOR_TYPES);
  assert.equal(registry.eye.category, 'Microscopy');
  assert.equal(registry.display.label, 'Detector screen');
});

test('camera screen shows a 2D intensity map and beam diameter', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 12;
  const camera = createElement('camera', 300, 0);
  camera.params.pixels = 16;
  camera.params.rows = 10;

  const svg = screenFor(camera, [laser, camera]);
  assert.match(svg, /data-detector-readout="camera"/);
  assert.match(svg, /2D INTENSITY/);
  assert.match(svg, /data-camera-pixel=/);
  assert.match(svg, /BEAM Ø/);
});

test('camera shows an object image when the paraxial image falls on its sensor', () => {
  const object = createElement('objarrow', 0, 0);
  object.params.height = 10;
  object.params.shape = 'F';
  object.params.showImage = true;
  const lens = createElement('lens', 100, 0);
  lens.params.f = 50;
  lens.params.dia = 50;
  const camera = createElement('camera', 222, 0); // active face at x=200 mm
  camera.params.ch = 40;

  const svg = screenFor(camera, [object, lens, camera]);
  assert.match(svg, /data-camera-object-image="true"/);
  assert.match(svg, /OBJECT IMAGE/);
});

test('photodetector screen is an intensity readout', () => {
  const laser = createElement('laser', 0, 0);
  const detector = createElement('detector', 300, 0);
  const svg = screenFor(detector, [laser, detector]);

  assert.match(svg, /data-detector-readout="detector"/);
  assert.match(svg, /REL INTENSITY/);
  assert.match(svg, /Σw/);
});

test('PMT screen reports low-light input, gain, output, and saturation state', () => {
  const laser = createElement('laser', 0, 0);
  const pmt = createElement('pmt', 300, 0);
  pmt.params.gain = 25;
  const svg = screenFor(pmt, [laser, pmt]);

  assert.match(svg, /LOW-LIGHT INTENSITY/);
  assert.match(svg, /GAIN/);
  assert.match(svg, /PMT OUTPUT/);
  assert.match(svg, /LINEAR|SATURATED/);
});

test('power meter uses configured source power', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.avgPowerW = 0.25;
  const meter = createElement('powermeter', 300, 0);
  const svg = screenFor(meter, [laser, meter]);

  assert.match(svg, /OPTICAL POWER/);
  assert.match(svg, /250/);
  assert.match(svg, /mW/);
  assert.match(svg, /configured source power/);
});

test('wavefront detector reports collimation and intensity', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 10;
  const detector = createElement('wavefrontdetector', 300, 0);
  const svg = screenFor(detector, [laser, detector]);

  assert.match(svg, /WAVEFRONT \+ INTENSITY/);
  assert.match(svg, /COLLIMATED/);
  assert.match(svg, /DIVERGENCE 0\.00°/);
});

test('polarimeter reports state, Stokes parameters, and a visual glyph', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.pol = 30;
  const polarimeter = createElement('polarimeter', 300, 0);
  const svg = screenFor(polarimeter, [laser, polarimeter]);

  assert.match(svg, /POLARIZATION · STOKES/);
  assert.match(svg, /LINEAR 30°/);
  assert.match(svg, /S0/);
  assert.match(svg, /S1/);
  assert.match(svg, /DoP/);
});

test('spectrometer reports wavelength, bandwidth, and spectrum samples', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.bwMode = 'band';
  laser.params.bandwidth = 40;
  const spectrometer = createElement('spectrometer', 300, 0);
  const svg = screenFor(spectrometer, [laser, spectrometer]);

  assert.match(svg, /WAVELENGTH \+ BANDWIDTH/);
  assert.match(svg, /BANDWIDTH 40\.0 nm/);
  assert.match(svg, /data-spectrum-sample=/);
});

test('general detector includes Stokes parameters and pulsed timing', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.temporalMode = 'pulsed';
  laser.params.repRateMHz = 80;
  laser.params.pulseWidthFs = 100;
  const detector = createElement('generaldetector', 300, 0);
  const svg = screenFor(detector, [laser, detector], 'detail');

  assert.match(svg, /STOKES \+ PULSE TIMING/);
  assert.match(svg, /REP RATE/);
  assert.match(svg, /80\.0 MHz/);
  assert.match(svg, /PULSE DURATION/);
  assert.match(svg, /100 fs/);
});
