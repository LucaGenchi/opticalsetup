import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { traceAll } from '../sketch/js/raytrace.js';
import { DETECTOR_TYPES } from '../sketch/js/detector-instruments.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';

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

test('camera screen shows one continuous 1D intensity profile and beam diameter', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 12;
  const camera = createElement('camera', 300, 0);
  camera.params.pixels = 16;

  const svg = screenFor(camera, [laser, camera]);
  assert.match(svg, /INTENSITY PROFILE/);
  assert.equal((svg.match(/data-camera-profile-curve/g) || []).length, 1);
  assert.equal((svg.match(/data-camera-profile-fill/g) || []).length, 1);
  assert.doesNotMatch(svg, /2D INTENSITY|data-camera-pixel=|data-profile-bin=/);
  assert.match(svg, /BEAM Ø/);
});

test('camera registry owns one 1D sensor schema and passes its interference setting to the surface', () => {
  const camera = createElement('camera', 300, 0);
  assert.equal(registry.camera.params.some(param => param.key === 'rows'), false);
  assert.equal(camera.params.pixels, 24);
  assert.equal(camera.params.interference, true);
  assert.equal(registry.camera.surfaces(camera)[0].data.interference, true);

  camera.params.interference = false;
  assert.equal(registry.camera.surfaces(camera)[0].data.interference, false);
});

test('photodetector screen is an intensity readout', () => {
  const laser = createElement('cwlaser', 0, 0);
  const detector = createElement('detector', 300, 0);
  const svg = screenFor(detector, [laser, detector]);

  assert.match(svg, /data-detector-readout="detector"/);
  assert.match(svg, /REL INTENSITY/);
  assert.match(svg, /Σw/);
});

// ---------------- photodetector screen as an oscilloscope ----------------

test('a pulsed photodetector screen becomes an oscilloscope showing the train in time', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  laser.params.temporalMode = 'pulsed';
  laser.params.repRateMHz = 20;
  const detector = createElement('detector', 300, 0);
  const svg = screenFor(detector, [laser, detector]);

  assert.match(svg, /OSCILLOSCOPE/);
  assert.match(svg, /data-scope-pulses="\d+"/);
  assert.match(svg, /REP 20\.0 MHz/);
  assert.doesNotMatch(svg, /REL INTENSITY/, 'the plain averaged readout is replaced, not stacked');
});

test('the oscilloscope reports the modulation frequency and window for a switched beam', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  laser.params.pol = 0;
  laser.params.temporalMode = 'pulsed';
  laser.params.repRateMHz = 20;
  const eom = createElement('eom', 150, 0);
  eom.params.modulate = true;
  eom.params.driveMode = 'switching';
  eom.params.switchFreqMHz = 10;
  const analyzer = createElement('polarizer', 250, 0);
  analyzer.params.pangle = 0;
  const detector = createElement('detector', 400, 0);
  const svg = screenFor(detector, [laser, eom, analyzer, detector]);

  assert.match(svg, /MOD 10\.0 MHz/, 'the modulation rate is reported alongside the rep rate');
  assert.match(svg, /REP 20\.0 MHz/);
  // Window is two periods of the slower 10 MHz modulation = 200 ns, with the
  // midpoint tick at 100 ns.
  assert.match(svg, />200 ns</);
  assert.match(svg, />100 ns</);
  assert.match(svg, />0 ns</, 'the window starts at a plain zero, not a sub-nanosecond unit');
  assert.match(svg, /data-scope-envelope="\d+"/, 'the gate envelope is drawn behind the pulses');
});

test('continuous-wave light keeps the plain intensity readout, with nothing to plot in time', () => {
  const laser = createElement('cwlaser', 0, 0); // CW by default
  const detector = createElement('detector', 300, 0);
  const svg = screenFor(detector, [laser, detector]);
  assert.match(svg, /REL INTENSITY/);
  assert.doesNotMatch(svg, /OSCILLOSCOPE/);
  assert.doesNotMatch(svg, /data-scope-pulses/);
});

test('PMT screen reports low-light input, gain, output, and saturation state', () => {
  const laser = createElement('cwlaser', 0, 0);
  const pmt = createElement('pmt', 300, 0);
  pmt.params.gain = 25;
  const svg = screenFor(pmt, [laser, pmt]);

  assert.match(svg, /LOW-LIGHT INTENSITY/);
  assert.match(svg, /GAIN/);
  assert.match(svg, /PMT OUTPUT/);
  assert.match(svg, /LINEAR|SATURATED/);
});

test('power meter uses configured source power', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.avgPowerW = 0.25;
  const meter = createElement('powermeter', 300, 0);
  const svg = screenFor(meter, [laser, meter]);

  assert.match(svg, /OPTICAL POWER/);
  assert.match(svg, /250/);
  assert.match(svg, /mW/);
  // the provenance caption was dropped: it collided with the unit label.
  // Physical watts (not relative units) is what proves source power was used.
  assert.match(svg, /mW|&#183;|W</);
});

test('wavefront detector reports collimation and intensity', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 10;
  const detector = createElement('wavefrontdetector', 300, 0);
  const svg = screenFor(detector, [laser, detector]);

  assert.match(svg, /WAVEFRONT \+ INTENSITY/);
  assert.match(svg, /COLLIMATED/);
  assert.match(svg, /DIVERGENCE 0\.00°/);
});

test('polarimeter reports state, Stokes parameters, and a visual glyph', () => {
  const laser = createElement('cwlaser', 0, 0);
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
  const laser = createElement('cwlaser', 0, 0);
  laser.params.bwMode = 'band';
  laser.params.bandwidth = 40;
  const spectrometer = createElement('spectrometer', 300, 0);
  const svg = screenFor(spectrometer, [laser, spectrometer]);

  // The "WAVELENGTH + BANDWIDTH" mode line was dropped as redundant — the
  // spectrometer only ever shows this one labeled plot, so restating its
  // axes added nothing. The bandwidth caption went too: one number cannot
  // describe several lines, and it read as the span between the outermost
  // ones rather than the width of anything real.
  assert.doesNotMatch(svg, /WAVELENGTH \+ BANDWIDTH/);
  assert.doesNotMatch(svg, /BANDWIDTH/);
  assert.match(svg, /data-spectrum-points=/);
});

test('general detector includes Stokes parameters and pulsed timing', () => {
  const laser = createElement('pulsedlaser', 0, 0);
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

test('wavefront classification is monotonic through a focus and independent of detector size', () => {
  // Regression: the original implementation inferred divergence by measuring
  // the beam's drawn width at two planes and differencing them, with both the
  // sampling baseline and the probe tolerance scaled by the sensor aperture.
  // That made the verdict flip with detector size and degenerate into
  // quantization noise near a focus (reported: converging AT the focus,
  // diverging at +25, collimated at +50/+75, diverging again at +100).
  const stateAt = (distanceFromLens, aperture) => {
    const laser = createElement('cwlaser', 0, 0);
    laser.params.beamMode = 'beam';
    laser.params.beamWidth = 20;
    const lens = createElement('lens', 200, 0);
    lens.params.f = 100;
    lens.params.dia = 25.4;
    const wf = createElement('wavefrontdetector', 200 + distanceFromLens, 0);
    if (aperture) wf.params.aperture = aperture;
    const elements = [laser, lens, wf];
    traceAll(elements);
    return enhancedReading(wf, elements).wavefront.state;
  };

  // Exactly one converging -> diverging transition along the axis.
  const walk = [40, 60, 80, 120, 160, 200, 260].map(d => stateAt(d));
  assert.ok(!walk.includes('COLLIMATED'), `a focused beam is never collimated, got ${walk.join(',')}`);
  const flips = walk.slice(1).filter((s, i) => s !== walk[i]).length;
  assert.equal(flips, 1, `expected a single crossover, got ${walk.join(',')}`);
  assert.equal(walk[0], 'CONVERGING');
  assert.equal(walk[walk.length - 1], 'DIVERGING');

  // Resizing the detector must not change the physics it reports.
  for (const distance of [60, 160]) {
    const byAperture = [10, 20, 40, 80].map(a => stateAt(distance, a));
    assert.equal(new Set(byAperture).size, 1,
      `detector size changed the verdict at ${distance} mm: ${byAperture.join(',')}`);
  }
});

test('a genuinely collimated beam still reads as collimated', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 12;
  const wf = createElement('wavefrontdetector', 300, 0);
  const elements = [laser, wf];
  traceAll(elements);
  assert.equal(enhancedReading(wf, elements).wavefront.state, 'COLLIMATED');
});
