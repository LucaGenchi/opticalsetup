// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The Poincaré sphere drawn by the polarimeter: the view, the point plotted,
// and that nothing non-finite reaches the drawing.

import test from 'node:test';
import assert from 'node:assert/strict';

import { POINCARE_VIEW, poincarePoint, poincareSphereSVG, projectPoincare } from '../sketch/js/poincare.js';

const close = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const el = POINCARE_VIEW.elevationDeg * Math.PI / 180;

test('the view puts +S3 up, +S2 to the right and +S1 out of the page to the lower left', () => {
  const s1 = projectPoincare(1, 0, 0), s2 = projectPoincare(0, 1, 0), s3 = projectPoincare(0, 0, 1);
  close(s3.x, 0, 1e-12, 'S3 x');
  close(s3.y, Math.cos(el), 1e-12, 'S3 y');
  assert.ok(s2.x > 0.7 && Math.abs(s2.y) < 0.3, 'S2 points right');
  assert.ok(s1.x < 0 && s1.y < 0, 'S1 points to the lower left');
  // All three positive half-axes face the viewer, the negative ones do not.
  for (const axis of [s1, s2, s3]) assert.ok(axis.depth > 0);
  for (const axis of [projectPoincare(-1, 0, 0), projectPoincare(0, -1, 0), projectPoincare(0, 0, -1)]) assert.ok(axis.depth < 0);
  // An orthographic view of a unit vector lands inside the unit disc, and
  // its depth completes it to unit length.
  for (const [a, b, c] of [[0.3, -0.5, 0.81], [-0.6, 0.64, -0.48], [0, 0.8, 0.6]]) {
    const p = projectPoincare(a, b, c);
    close(Math.hypot(p.x, p.y, p.depth), Math.hypot(a, b, c), 1e-12, 'length kept');
  }
});

test('the plotted point is the measured vector, kept inside the unit ball and finite', () => {
  assert.equal(poincarePoint(null), null);
  assert.equal(poincarePoint(undefined), null);
  assert.deepEqual(poincarePoint({ s1: 0.3, s2: 0, s3: -0.4 }), { s1: 0.3, s2: 0, s3: -0.4, degree: 0.5 });
  // Round-off past the surface is pulled back onto it.
  const over = poincarePoint({ s1: 0, s2: 0, s3: 1 + 1e-9 });
  close(over.s3, 1, 1e-15, 's3');
  assert.equal(over.degree, 1);
  assert.deepEqual(poincarePoint({ s1: NaN, s2: Infinity, s3: 0.2 }), { s1: 0, s2: 0, s3: 0.2, degree: 0.2 });
});

test('right circular sits at the north pole, left circular at the south pole behind the centre', () => {
  const r = 10, right = poincareSphereSVG({ s1: 0, s2: 0, s3: 1 }, { r });
  assert.match(right, /data-poincare="state"/);
  const marker = /<circle cx="([-\d.]+)" cy="([-\d.]+)"[^>]*data-poincare-point="0,0,1"/.exec(right);
  assert.ok(marker, 'a point at the north pole');
  close(Number(marker[1]), 0, 0.01, 'x');
  close(Number(marker[2]), -r * Math.cos(el), 0.01, 'y');
  // The south pole faces away: the point is drawn hollow and its vector dashed.
  const left = poincareSphereSVG({ s1: 0, s2: 0, s3: -1 }, { r });
  assert.match(left, /fill="#061822" stroke="#f9a8d4"[^>]*data-poincare-point="0,0,-1"/);
  assert.match(left, /stroke="#f9a8d4" stroke-width="0.8" stroke-dasharray/);
});

test('partly polarized light sits inside the sphere, unpolarized light at its centre', () => {
  const r = 20, half = poincareSphereSVG({ s1: 0.5, s2: 0, s3: 0 }, { r });
  const marker = /<circle cx="([-\d.]+)" cy="([-\d.]+)"[^>]*data-poincare-point="0.5,0,0"/.exec(half);
  const expected = projectPoincare(0.5, 0, 0);
  close(Number(marker[1]), r * expected.x, 0.01, 'x');
  close(Number(marker[2]), -r * expected.y, 0.01, 'y');
  assert.ok(Math.hypot(Number(marker[1]), Number(marker[2])) < r / 2 + 0.01, 'inside, at half the radius or less');
  // On the equator: no drop line to the equatorial plane.
  assert.doesNotMatch(half, /opacity="0.75"/);
  const none = poincareSphereSVG({ s1: 0, s2: 0, s3: 0 }, { r });
  assert.match(none, /cx="0" cy="0"[^>]*data-poincare-point="0,0,0"/);
  assert.doesNotMatch(none, /stroke="#f9a8d4" stroke-width="0.9"/, 'no vector of zero length');
  // Above the equator the drop line shows the height.
  assert.match(poincareSphereSVG({ s1: 0.6, s2: 0, s3: 0.8 }, { r }), /opacity="0.75"/);
});

test('no measured vector leaves the sphere empty, and nothing non-finite is drawn', () => {
  const empty = poincareSphereSVG(null);
  assert.match(empty, /data-poincare="none"/);
  assert.doesNotMatch(empty, /data-poincare-point/);
  for (const bad of [{ s1: NaN, s2: NaN, s3: NaN }, { s1: Infinity, s2: -Infinity, s3: 1 }, 'x', 42]) {
    const svg = poincareSphereSVG(bad, { cx: NaN, cy: Infinity, r: NaN, fontSize: -1 });
    assert.doesNotMatch(svg, /NaN|Infinity/);
  }
});

test('the inspector palette writes classes only, so the theme sets the colours', () => {
  const svg = poincareSphereSVG({ s1: 0, s2: 0.6, s3: 0.8 }, { palette: 'css', meridians: true, labels: 'full', r: 22 });
  assert.doesNotMatch(svg, /(?:fill|stroke)="#/);
  for (const role of ['sphere', 'front', 'back', 'axis', 'axis-back', 'label', 'vector', 'drop', 'point']) {
    assert.match(svg, new RegExp(`class="ps-${role}"`));
  }
  for (const label of ['S₁ 0°', 'S₂ 45°', 'S₃ R', '>L<']) assert.ok(svg.includes(label), label);
});

test('an LED reads unpolarized at the centre of the sphere, with S0 the power that arrives', async () => {
  const { registry, createElement } = await import('../sketch/js/elements.js');
  await import('../sketch/js/detector-instruments.js');
  const { traceScene } = await import('../sketch/js/raytrace.js');
  const { enhancedReading } = await import('../sketch/js/detector-measurements.js');
  const { stokesDisplay } = await import('../sketch/js/detector-instruments.js');
  const scene = (extra = []) => {
    const led = createElement('ledsource', 0, 0);
    led.params.avgPowerW = 0.1;
    const polarimeter = createElement('polarimeter', 200, 0);
    const screen = createElement('display', 350, 0);
    Object.assign(screen.params, { sensorId: polarimeter.id, screenOn: true });
    const elements = [led, ...extra, polarimeter, screen];
    traceScene(elements, []);
    return { reading: enhancedReading(polarimeter, elements), shown: registry.display.svg(screen, elements) };
  };
  // An LED carries no Stokes vector of its own: it is unpolarized light, the
  // origin of the sphere, not "no measurement".
  const alone = scene();
  assert.equal(alone.reading.polarization, 'Unpolarized');
  assert.deepEqual(alone.reading.normalizedStokes, { s1: 0, s2: 0, s3: 0 });
  assert.match(alone.shown, /cx="-28" cy="0.5"[^>]*data-poincare-point="0,0,0"/);
  // S0 is the total power, 100 mW here, not the relative ray weight 1.
  assert.deepEqual(stokesDisplay(alone.reading), { values: ['100.00', '0.00', '0.00', '0.00'], unit: 'mW' });
  assert.match(alone.shown, /S0 100\.00 {2}S1 0\.00/);
  assert.match(alone.shown, /DoP 0% {2}· {2}mW/);
  // Through a polarizer the LED's light is fully polarized at the polarizer's
  // axis, and half its power is left.
  const polarizer = createElement('polarizer', 100, 0);
  polarizer.params.pangle = 0;
  const filtered = scene([polarizer]);
  assert.equal(filtered.reading.polarization, 'Linear 0°');
  assert.deepEqual(stokesDisplay(filtered.reading), { values: ['50.00', '50.00', '0.00', '0.00'], unit: 'mW' });
});

test('an LED beside a polarized laser reads partly polarized, inside the sphere', async () => {
  const { createElement } = await import('../sketch/js/elements.js');
  const { traceScene } = await import('../sketch/js/raytrace.js');
  const { enhancedReading } = await import('../sketch/js/detector-measurements.js');
  await import('../sketch/js/detector-instruments.js');
  // Two parallel beams side by side on one polarimeter: an unpolarized LED
  // and a laser polarized at 0°. The incoherent sum of their Stokes vectors,
  // weighed by the watts each delivers, gives S1/S0 = P_laser / (P_laser + P_led).
  const reading = (ledW, laserW) => {
    const led = createElement('ledsource', 0, -6);
    Object.assign(led.params, { avgPowerW: ledW, beamWidth: 2 });
    const laser = createElement('cwlaser', 0, 6);
    Object.assign(laser.params, { avgPowerW: laserW, pol: 0, beamWidth: 2 });
    const polarimeter = createElement('polarimeter', 200, 0);
    const elements = [led, laser, polarimeter];
    traceScene(elements, []);
    return enhancedReading(polarimeter, elements);
  };
  const equal = reading(0.001, 0.001);
  assert.equal(equal.polarization, 'Partly linear 0°');
  close(equal.normalizedStokes.s1, 0.5, 1e-9, 'equal powers');
  // A 3 mW LED beside a 1 mW laser: 25 % polarized, not the 50 % that
  // counting each source once would give.
  const unequal = reading(0.003, 0.001);
  close(unequal.normalizedStokes.s1, 0.25, 1e-9, '3:1');
  assert.equal(unequal.normalizedStokes.s2, 0);
  assert.equal(unequal.normalizedStokes.s3, 0);
});

test('partly polarized light is named by its polarized part, not as elliptical', async () => {
  const { polarizationDescription } = await import('../sketch/js/polarization.js');
  assert.equal(polarizationDescription({ s1: 0.556, s2: 0, s3: 0 }), 'Partly linear 0°');
  assert.equal(polarizationDescription({ s1: 0, s2: 0, s3: -0.5 }), 'Partly left circular');
  assert.equal(polarizationDescription({ s1: 0.3, s2: 0.3, s3: 0.3 }), 'Partly elliptical 23°');
  // The boundaries are unchanged: depolarized below 0.02, fully polarized from 0.985.
  assert.equal(polarizationDescription({ s1: 0.01, s2: 0, s3: 0 }), 'Unpolarized');
  assert.equal(polarizationDescription({ s1: 0.99, s2: 0, s3: 0 }), 'Linear 0°');
  assert.equal(polarizationDescription({ s1: 0, s2: 0, s3: 1 }), 'Right circular');
});

test('the Stokes numbers round to 0.01, so round-off reads 0.00 and no -0.00 appears', async () => {
  const { stokesDisplay } = await import('../sketch/js/detector-instruments.js');
  const shown = stokesDisplay({ stokes: { s0: 1, s1: 6.1e-17, s2: -1.2e-16, s3: -1 }, detectedPowerW: 0.001 });
  assert.deepEqual(shown, { values: ['1.00', '0.00', '0.00', '-1.00'], unit: 'mW' });
  // No calibrated power: the relative ray weight, labelled as such.
  assert.deepEqual(stokesDisplay({ stokes: { s0: 0.5, s1: 0.25, s2: 0, s3: 0 }, detectedPowerW: null }),
    { values: ['0.50', '0.25', '0.00', '0.00'], unit: 'rel. power' });
  // A non-finite value never reaches the screen.
  assert.deepEqual(stokesDisplay({ stokes: { s0: NaN, s1: NaN, s2: 0, s3: 0 }, detectedPowerW: Infinity }).values, ['0.00', '0.00', '0.00', '0.00']);
});

test('a camera weighs a mix by watts like the other sensors, and its label agrees with its vector', async () => {
  const { createElement } = await import('../sketch/js/elements.js');
  await import('../sketch/js/detector-instruments.js');
  const { traceScene } = await import('../sketch/js/raytrace.js');
  const { enhancedReading } = await import('../sketch/js/detector-measurements.js');
  // Two independent beams, fully collected: 1 mW at 0° and 3 mW at 90°. The
  // camera's label used to come from source-relative contributions and read
  // "Unpolarized" beside a 50 % vector.
  for (const type of ['camera', 'polarimeter', 'generaldetector']) {
    const a = createElement('cwlaser', 0, -6);
    Object.assign(a.params, { avgPowerW: 0.001, pol: 0, beamWidth: 2 });
    const b = createElement('cwlaser', 0, 6);
    Object.assign(b.params, { avgPowerW: 0.003, pol: 90, beamWidth: 2, wavelength: 532 });
    const detector = createElement(type, 200, 0);
    const elements = [a, b, detector];
    traceScene(elements, []);
    const reading = enhancedReading(detector, elements);
    assert.equal(reading.polarization, 'Partly linear 90°', type);
    close(reading.normalizedStokes.s1, -0.5, 1e-9, `${type} s1`);
  }
});

test('S0 falls back to relative power when the watts cover only some of the light', async () => {
  const { createElement } = await import('../sketch/js/elements.js');
  const { traceScene } = await import('../sketch/js/raytrace.js');
  const { enhancedReading } = await import('../sketch/js/detector-measurements.js');
  const { stokesDisplay } = await import('../sketch/js/detector-instruments.js');
  // A 100 mW laser at 0° beside a point source with no power setting: 100 mW
  // is the laser alone, while the vector mixes both, so their product would
  // be an invented absolute S1.
  const laser = createElement('cwlaser', 0, -6);
  Object.assign(laser.params, { avgPowerW: 0.1, pol: 0, beamWidth: 2 });
  const point = createElement('pointsource', 60, 6);
  const polarimeter = createElement('polarimeter', 200, 0);
  const elements = [laser, point, polarimeter];
  traceScene(elements, []);
  const reading = enhancedReading(polarimeter, elements);
  assert.equal(reading.powerCoversAllArrivals, false);
  const shown = stokesDisplay(reading);
  assert.equal(shown.unit, 'rel. power');
  close(Number(shown.values[1]) / Number(shown.values[0]), reading.normalizedStokes.s1, 0.01, 'S1/S0');
});
