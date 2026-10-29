// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { traceAll } from '../sketch/js/raytrace.js';
import { DETECTOR_TYPES } from '../sketch/js/detector-instruments.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';
import { resolveSourceSpectrum, spectrumStats } from '../sketch/js/spectrum.js';

function screenFor(sensor, elements, view = 'main') {
  const display = createElement('display', sensor.x + 130, sensor.y + 80);
  display.params.sensorId = sensor.id;
  display.params.displayView = view;
  const scene = [...elements, display];
  traceAll(scene);
  return registry.display.svg(display, scene);
}

test('Detectors contains the requested instruments in order', () => {
  const listed = Object.entries(registry)
    .filter(([, definition]) => definition.category === 'Detectors' && definition.readoutKind)
    .sort((a, b) => (a[1].paletteOrder ?? 100) - (b[1].paletteOrder ?? 100))
    .map(([type]) => type);

  // The eye reads light too, so it lands in this filter -- but it is an
  // observer rather than one of the nine bench instruments, and it sits after
  // the detector screen so the general detector keeps its place just before it.
  assert.deepEqual(listed, [...DETECTOR_TYPES, 'eye']);
  assert.equal(registry.eye.category, 'Detectors');
  assert.ok(registry.eye.paletteOrder > registry.display.paletteOrder);
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
  assert.match(svg, />0</, 'the window starts at a plain zero, not a sub-nanosecond unit');
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

test('a negligible tilted branch cannot steer the wavefront fit', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 10;

  const weak = createElement('cwlaser', 0, 20);
  weak.params.beamMode = 'line';
  weak.rot = -3;

  const attenuator = createElement('filter', 150, 12.14);
  attenuator.params.length = 3;
  attenuator.params.ftype = 'nd';
  attenuator.params.trans = 1e-6;

  const detector = createElement('wavefrontdetector', 300, 0);
  detector.params.aperture = 60;
  const elements = [laser, weak, attenuator, detector];
  traceAll(elements);

  const reading = enhancedReading(detector, elements);
  assert.ok(reading);
  assert.ok(reading.signal > 1 && reading.signal < 1.00001,
    `expected a one-millionth-power outlier, got ${reading.signal}`);
  assert.equal(reading.wavefront.state, 'COLLIMATED');
  assert.equal(reading.wavefront.divergenceDeg, 0);
});

test('a negligible ray far from a converging beam does not widen the fit', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 4;
  const lens = createElement('lens', 100, 0);
  lens.params.f = 2000;
  const detector = createElement('wavefrontdetector', 300, 0);
  detector.params.aperture = 60;
  traceAll([laser, lens, detector]);
  const alone = enhancedReading(detector, [laser, lens, detector]).wavefront;
  assert.equal(alone.state, 'CONVERGING');
  // A full edge-to-edge 4 mm beam over a 2 m focus: 2 atan(2 / 2000).
  assert.ok(Math.abs(alone.divergenceDeg - 2 * Math.atan(2 / 2000) * 180 / Math.PI) < 1e-3,
    `expected the beam's own cone, got ${alone.divergenceDeg}`);

  // A parallel ray 25 mm off axis, attenuated to one millionth.
  const stray = createElement('cwlaser', 120, 25);
  stray.params.beamMode = 'line';
  const attenuator = createElement('filter', 220, 25);
  attenuator.params.ftype = 'nd';
  attenuator.params.trans = 1e-6;
  attenuator.params.length = 10;
  const elements = [laser, lens, stray, attenuator, detector];
  traceAll(elements);
  const reading = enhancedReading(detector, elements);
  assert.ok(reading.signal > 1 && reading.signal < 1.00001,
    `expected a one-millionth-power stray, got ${reading.signal}`);
  assert.equal(reading.wavefront.state, 'CONVERGING');
  assert.ok(Math.abs(reading.wavefront.divergenceDeg - alone.divergenceDeg) < 1e-3 * alone.divergenceDeg,
    `the stray moved ${alone.divergenceDeg} to ${reading.wavefront.divergenceDeg}`);
});

test('the wavefront fit weighs each source by its watts', () => {
  const strong = createElement('cwlaser', 0, 0);
  strong.params.beamMode = 'beam';
  strong.params.beamWidth = 10;
  strong.params.avgPowerW = 1;
  const tilted = createElement('cwlaser', 0, 20);
  tilted.params.beamMode = 'line';
  tilted.rot = -3;
  const detector = createElement('wavefrontdetector', 300, 0);
  detector.params.aperture = 60;
  const elements = [strong, tilted, detector];

  // One tilted ray of 1 mW beside a 1 W collimated beam: the beam decides.
  tilted.params.avgPowerW = 0.001;
  traceAll(elements);
  assert.equal(enhancedReading(detector, elements).wavefront.state, 'COLLIMATED');

  // At 1 W it carries half the light and tilts the fit.
  tilted.params.avgPowerW = 1;
  traceAll(elements);
  const even = enhancedReading(detector, elements).wavefront;
  assert.equal(even.state, 'CONVERGING');
  assert.ok(even.divergenceDeg > 1, `expected a strong tilt, got ${even.divergenceDeg}`);
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

// A 10 mm beam through an f = 100 lens, read by a wavefront detector whose
// sensing face sits `offset` mm from the focus. The face is the front of the
// detector's 52 mm body, 26 mm before the point it is placed at.
function focusScene(offset, view) {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 10;
  const lens = createElement('lens', 100, 0);
  lens.params.f = 100;
  const detector = createElement('wavefrontdetector', 226 + offset, 0);
  detector.params.aperture = 30;
  const elements = [laser, lens, detector];
  traceAll(elements);
  return { detector, elements, reading: enhancedReading(detector, elements) };
}

test('a wavefront detector on a focus reads the focus plane, not collimated', () => {
  const before = focusScene(-0.01).reading.wavefront;
  const at = focusScene(0).reading.wavefront;
  const after = focusScene(0.01).reading.wavefront;
  // Just off the focus the fit is unchanged.
  assert.equal(before.state, 'CONVERGING');
  assert.equal(before.divergenceDeg.toFixed(2), '5.73');
  assert.equal(after.state, 'DIVERGING');
  assert.equal(after.divergenceDeg.toFixed(2), '5.73');
  // On it the heights collapse, and the cone is read from the angles alone:
  // the 10 mm beam's edge rays at 5 mm over 100 mm.
  assert.equal(at.state, 'FOCUS PLANE');
  const cone = 2 * Math.atan(5 / 100);
  assert.ok(Math.abs(at.divergenceDeg - cone * 180 / Math.PI) < 1e-6, `cone ${at.divergenceDeg}`);
  assert.equal(at.signedDivergenceDeg, 0);
  // The ideal Gaussian waist of that cone at the laser's 532 nm, and its
  // Rayleigh range: w0 = lambda / (pi NA), zR = pi w0^2 / lambda.
  const wlMm = 532e-6, w0 = wlMm / (Math.PI * Math.sin(cone / 2));
  assert.ok(Math.abs(at.wavelengthNm - 532) < 1e-9);
  assert.ok(Math.abs(at.waistMm - w0) < 1e-9 * w0, `waist ${at.waistMm}`);
  assert.ok(Math.abs(at.rayleighMm - Math.PI * w0 * w0 / wlMm) < 1e-9, `zR ${at.rayleighMm}`);
  assert.ok(Math.abs(at.waistMm - 0.00339) < 5e-6 && Math.abs(at.rayleighMm - 0.0679) < 5e-5);
});

test('the focus plane screens show the waist and Rayleigh range', () => {
  const { detector, elements } = focusScene(0);
  const svg = screenFor(detector, elements);
  assert.match(svg, />FOCUS PLANE</);
  assert.match(svg, /CONE 5\.72°/);
  assert.match(svg, /w₀ 3\.39 µm · zR 67\.9 µm</);
  assert.doesNotMatch(svg, /COLLIMATED|DIVERGENCE/);

  // The general detector's body is 54 mm deep: its face is 27 mm ahead.
  const general = createElement('generaldetector', 227, 0);
  general.params.aperture = 30;
  const scene = elements.map(element => (element === detector ? general : element));
  const generalSvg = screenFor(general, scene);
  assert.match(generalSvg, />WAIST w₀<\/text>[^]*?>3\.39 µm</);
  assert.match(generalSvg, />FOCUS PLANE<\/text>[^]*?>zR 67\.9 µm</);
  assert.doesNotMatch(generalSvg, /COLLIMATED|POINT/);
});

test('a broadband focus says which wavelength its waist is for', () => {
  const led = createElement('ledsource', 0, 0);
  const lens = createElement('lens', 100, 0);
  lens.params.f = 100;
  const detector = createElement('wavefrontdetector', 226, 0);
  const elements = [led, lens, detector];
  traceAll(elements);
  const wave = enhancedReading(detector, elements).wavefront;
  assert.equal(wave.state, 'FOCUS PLANE');
  assert.ok(wave.wavelengthNm > 500 && wave.wavelengthNm < 650, `mean ${wave.wavelengthNm}`);
  assert.match(screenFor(detector, elements), new RegExp(`· AT ${Math.round(wave.wavelengthNm)} nm<`));
});

test('a slow cone on its focus is still a focus, not collimated', () => {
  // 1 mm over 2 m: a 0.0286° cone, below the 0.05° that reads collimated
  // either side of the focus.
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 1;
  const lens = createElement('lens', 100, 0);
  lens.params.f = 2000;
  const detector = createElement('wavefrontdetector', 2126, 0);
  detector.params.aperture = 30;
  const elements = [laser, lens, detector];
  traceAll(elements);
  const wave = enhancedReading(detector, elements).wavefront;
  assert.equal(wave.state, 'FOCUS PLANE');
  assert.ok(Math.abs(wave.divergenceDeg - 2 * Math.atan(0.5 / 2000) * 180 / Math.PI) < 1e-9, `cone ${wave.divergenceDeg}`);
  assert.ok(Math.abs(wave.waistMm - 532e-6 / (Math.PI * Math.sin(Math.atan(0.5 / 2000)))) < 1e-9, `waist ${wave.waistMm}`);
  const svg = screenFor(detector, elements);
  assert.match(svg, />FOCUS PLANE</);
  assert.match(svg, /w₀ 677 µm · zR 2710 mm</);
});

test('a lamp focus takes its waist at the spectrum\'s centre, not its brightest line', () => {
  const lamp = createElement('pointsource', 0, 0);
  lamp.params.sourceKind = 'lamp';
  lamp.params.lampType = 'hg';
  lamp.params.nrays = 360;
  lamp.params.spread = 360;
  const lens = createElement('lens', 100, 0);
  lens.params.f = 50;
  lens.params.dia = 60;
  const detector = createElement('wavefrontdetector', 226, 0);
  detector.params.aperture = 60;
  const elements = [lamp, lens, detector];
  traceAll(elements);
  const wave = enhancedReading(detector, elements).wavefront;
  assert.equal(wave.state, 'FOCUS PLANE');
  // Mercury's lines weighed by their strengths centre near 504.5 nm; its
  // brightest line, 435.8 nm, is what each ray's own wavelength names.
  const centre = spectrumStats(resolveSourceSpectrum('pointsource', lamp.params).spec).center;
  assert.ok(Math.abs(centre - 504.5) < 0.01, `centre ${centre}`);
  assert.ok(Math.abs(wave.wavelengthNm - centre) < 1e-6, `waist taken at ${wave.wavelengthNm}`);
  const na = Math.sin(wave.divergenceDeg * Math.PI / 360);
  assert.ok(Math.abs(wave.waistMm - centre * 1e-6 / (Math.PI * na)) < 1e-12);
});

test('every focus plane line fits the screen', () => {
  // Monospace glyphs advance about 0.6 of the font size; right-aligned at
  // x = 35, a line must not run past the screen's left edge at -42.2.
  const fits = svg => {
    const readout = svg.slice(svg.indexOf('data-detector-readout="wavefrontdetector"'));
    const lines = [...readout.matchAll(/<text x="35"[^>]*text-anchor="end" font-size="([\d.]+)"[^>]*>([^<]*)</g)];
    assert.equal(lines.length, 4, 'state, cone, waist and intensity');
    for (const [, size, text] of lines) {
      assert.ok(text.length * 0.6 * Number(size) <= 77.2, `"${text}" at ${size} is too wide`);
    }
  };
  const led = createElement('ledsource', 0, 0);
  const lens = createElement('lens', 100, 0);
  lens.params.f = 100;
  const detector = createElement('wavefrontdetector', 226, 0);
  const svg = screenFor(detector, [led, lens, detector]);
  assert.match(svg, /CONE 5\.72° · AT \d+ nm</);
  fits(svg);
  const laser = focusScene(0);
  fits(screenFor(laser.detector, laser.elements));
});

test('one ray, rays sharing one path, or a parallel bundle are not a focus', () => {
  const single = createElement('cwlaser', 0, 0);
  single.params.beamMode = 'line';
  const detector = createElement('wavefrontdetector', 226, 0);
  traceAll([single, detector]);
  assert.equal(enhancedReading(detector, [single, detector]).wavefront.state, 'COLLIMATED');

  // Two rays at one height and one angle have no cone between them.
  const twin = createElement('cwlaser', 0, 0);
  twin.params.beamMode = 'line';
  twin.params.wavelength = 633;
  const shared = [single, twin, detector];
  traceAll(shared);
  const reading = enhancedReading(detector, shared);
  assert.equal(reading.samples, 2);
  assert.equal(reading.wavefront.state, 'COLLIMATED');
  assert.equal(reading.convergence, null);

  const beam = createElement('cwlaser', 0, 0);
  beam.params.beamMode = 'beam';
  beam.params.beamWidth = 10;
  traceAll([beam, detector]);
  assert.equal(enhancedReading(detector, [beam, detector]).wavefront.state, 'COLLIMATED');
});
