// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { probeAt, traceScene } from '../sketch/js/raytrace.js';
import { probeDurationLabel } from '../sketch/js/probe.js';
import { glassGVD } from '../sketch/js/glass.js';
import '../sketch/js/etalon.js'; // registers registry.etalon

// A beam probe reads the pulse where it sits. One traced path can run on
// through a compressor or a glass rod past the probe, so the duration must
// follow the dispersion accumulated up to the probe, not the path's end.

// Gaussian FWHM τ0 after GDD φ2: τ0·√(1 + (4 ln2 · φ2 / τ0²)²).
const gaussianAfter = (tau0, gdd) => tau0 * Math.sqrt(1 + (4 * Math.LN2 * gdd / (tau0 * tau0)) ** 2);
const near = (actual, expected, tolerance) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

function source(params = {}) {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, {
    wavelength: 800, avgPowerW: 1, repRateMHz: 80, pulseWidthFs: 100, transformLimited: true,
    beamMode: 'line', ...params,
  });
  return laser;
}

function compressor(x, gddFs2) {
  const element = createElement('pulsecompressor', x, 0);
  Object.assign(element.params, { gddFs2 });
  return element;
}

const durationAt = x => probeAt(x, 0)?.pulse?.pulseWidthFs;

test('a probe between two compressors on one path reads the pulse there', () => {
  traceScene([source(), compressor(150, -30000), compressor(300, 30000)]);
  near(durationAt(80), 100, 1e-6);
  near(durationAt(220), gaussianAfter(100, -30000), 1e-6);
  near(durationAt(400), 100, 1e-6);
});

test('a probe inside a glass rod reads the dispersion accumulated so far', () => {
  const rod = createElement('glassrod', 200, 0);
  Object.assign(rod.params, { rodlen: 100, dia: 20, material: 'nbk7' });
  traceScene([source({ pulseWidthFs: 20 }), rod]);
  const gvd = glassGVD('nbk7', 800);
  assert.ok(gvd > 0, 'N-BK7 has normal dispersion at 800 nm');
  near(durationAt(100), 20, 1e-6);
  // Halfway through the 100 mm rod, and after it.
  near(durationAt(200), gaussianAfter(20, gvd * 50), 0.05 * gaussianAfter(20, gvd * 50));
  near(durationAt(320), gaussianAfter(20, gvd * 100), 0.02 * gaussianAfter(20, gvd * 100));
  assert.ok(durationAt(150) < durationAt(200) && durationAt(200) < durationAt(250),
    'the pulse lengthens steadily through the glass');
});

test('a probe after an etalon says the duration is unavailable', () => {
  const etalon = createElement('etalon', 100, 0);
  traceScene([source({ pulseWidthFs: 20 }), etalon]);
  const reading = probeAt(200, 0);
  assert.ok(reading?.pulse, 'the probe found the pulsed beam');
  assert.equal(reading.pulse.pulseWidthFs, null);
  assert.match(reading.pulse.durationIssue, /etalon/i);
  assert.equal(probeDurationLabel(reading, 'pulsedlaser'), 'Unavailable');
});

test('a probe before any dispersion still reads the configured duration', () => {
  traceScene([source({ pulseWidthFs: 250 })]);
  near(durationAt(100), 250, 1e-9);
  assert.equal(probeDurationLabel(probeAt(100, 0), 'pulsedlaser'), '250 fs');
});
