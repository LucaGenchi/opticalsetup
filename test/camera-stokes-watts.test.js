// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// A camera's polarization reading weighs a mix of sources by the watts each
// delivers, as the polarimeter and the general detector do: its label and
// its Stokes vector come from the camera's own field reconstruction, so the
// weighting has to happen there too.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';
import { polarizationDescription } from '../sketch/js/polarization.js';

const close = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

function readAll(elements, detector) {
  traceScene(elements, []);
  return enhancedReading(detector, elements);
}

// Two independent beams, fully collected, at 0° and 90°.
function orthogonalPair(type, wattsA, wattsB, ...between) {
  const a = createElement('cwlaser', 0, -6);
  Object.assign(a.params, { avgPowerW: wattsA, pol: 0, beamWidth: 2 });
  const b = createElement('cwlaser', 0, 6);
  Object.assign(b.params, { avgPowerW: wattsB, pol: 90, beamWidth: 2, wavelength: 532 });
  const detector = createElement(type, 200, 0);
  return readAll([a, b, ...between, detector], detector);
}

test('a camera weighs 1 mW at 0° and 3 mW at 90° by their watts, like the polarimeter', () => {
  const camera = orthogonalPair('camera', 0.001, 0.003);
  assert.equal(camera.polarization, 'Partly linear 90°');
  close(camera.normalizedStokes.s1, -0.5, 1e-9, 's1');
  close(camera.normalizedStokes.s2, 0, 1e-12, 's2');
  close(camera.normalizedStokes.s3, 0, 1e-12, 's3');
  assert.equal(camera.polarization, polarizationDescription(camera.normalizedStokes));
  // Equal watts still cancel to the origin.
  const equal = orthogonalPair('camera', 0.002, 0.002);
  assert.equal(equal.polarization, 'Unpolarized');
  close(equal.normalizedStokes.s1, 0, 1e-9, 'equal s1');
});

test('the watts weighting is relative: nanowatt beams behind a 1e-4 ND filter still read', () => {
  // Multiplying each contribution by its source's watts without rescaling
  // turned the camera's "too faint to count" threshold into a physical floor:
  // 1 nW and 3 nW through 1e-4 fell under it and read "No detected field".
  const nd = createElement('filter', 100, 0);
  Object.assign(nd.params, { ftype: 'nd', trans: 1e-4, length: 40 });
  const camera = orthogonalPair('camera', 1e-9, 3e-9, nd);
  assert.equal(camera.polarization, 'Partly linear 90°');
  close(camera.normalizedStokes.s1, -0.5, 1e-9, 's1');
});

test('re-emitted light is charged to the laser that pumped it when the camera weighs a mix', () => {
  // The fluorescence collection setup of power-attribution.test.js: a 100 mW
  // pump gives 1.75 mW of unpolarized fluorescence through the longpass. A
  // separate 1 mW linear beam joins it. The specimen relabels sourceId when
  // it emits, so the watts must be looked up by the pump's id: 1 mW of
  // 2.75 mW polarized is a DoP of 36.36 %.
  const read = type => {
    const laser = createElement('cwlaser', 0, 0);
    Object.assign(laser.params, { beamMode: 'beam', beamWidth: 12, wavelength: 488, avgPowerW: 0.1 });
    const focus = createElement('lens', 150, 0);
    Object.assign(focus.params, { f: 60, dia: 25 });
    const slide = createElement('sample', 210, 0);
    slide.rot = 90;
    Object.assign(slide.params, {
      specimenType: 'linear', activeThickness: 1, transmitExc: true, transmission: 0.9, aperture: 44,
    });
    slide.params.channels = [{
      kind: 'fluor', wl: 520, eff: 0.35, epi: false, epiRatio: 0.15, autoWl: false,
      autoColor: true, color: '#22c55e', material: 'lipid', fluorophore: 'custom',
      retardance: 90, axis: 45, transferEff: 0.1, requireOverlap: true,
    }];
    const collect = createElement('lens', 285, 0);
    Object.assign(collect.params, { f: 55, dia: 50 });
    const longpass = createElement('filter', 345, 0);
    Object.assign(longpass.params, { ftype: 'longpass', cutoff: 500, length: 50 });
    const linear = createElement('cwlaser', 330, 8);
    Object.assign(linear.params, { beamMode: 'beam', beamWidth: 2, wavelength: 600, avgPowerW: 0.001, pol: 0 });
    const detector = createElement(type, 440, 0);
    detector.params.aperture = 40;
    return readAll([laser, focus, slide, collect, longpass, linear, detector], detector);
  };
  const polarimeter = read('polarimeter');
  close(polarimeter.detectedPowerW, 0.00275, 1e-9, 'polarimeter watts');
  close(polarimeter.normalizedStokes.s1, 1 / 2.75, 1e-9, 'polarimeter DoP');
  const camera = read('camera');
  close(camera.normalizedStokes.s1, 1 / 2.75, 1e-9, 'camera DoP');
  close(camera.normalizedStokes.s2, 0, 1e-12, 'camera s2');
  close(camera.normalizedStokes.s3, 0, 1e-12, 'camera s3');
  assert.equal(camera.polarization, 'Partly linear 0°');
  assert.equal(camera.polarization, polarizationDescription(camera.normalizedStokes));
});

test('with an unrated source in the mix the camera keeps counting each source as a fraction of itself', () => {
  // A point source has no power setting, so there are no watts to compare:
  // the camera falls back to fractions, as the polarimeter does.
  const read = (type, watts) => {
    const laser = createElement('cwlaser', 0, -6);
    Object.assign(laser.params, { avgPowerW: watts, pol: 0, beamWidth: 2 });
    const point = createElement('pointsource', 60, 6);
    const detector = createElement(type, 200, 0);
    return readAll([laser, point, detector], detector);
  };
  const weak = read('camera', 0.001);
  const strong = read('camera', 1);
  assert.equal(weak.polarization, polarizationDescription(weak.normalizedStokes));
  close(strong.normalizedStokes.s1, weak.normalizedStokes.s1, 1e-12, 'laser watts do not move a fraction mix');
});
