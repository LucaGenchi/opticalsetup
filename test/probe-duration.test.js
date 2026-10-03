// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { probeAt, traceScene } from '../sketch/js/raytrace.js';
import { probeDurationLabel } from '../sketch/js/probe.js';
import { glassGVD } from '../sketch/js/glass.js';
import { pulseTransmissionAt, traceValueAt } from '../sketch/js/pulses.js';
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

const durationAt = x => probeAt(x, 0)?.pulse?.durationFs;

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
  assert.equal(reading.pulse.durationFs, null);
  assert.match(reading.pulse.durationIssue, /etalon/i);
  assert.equal(probeDurationLabel(reading, 'pulsedlaser'), 'Unavailable');
});

test('a probe before any dispersion still reads the configured duration', () => {
  traceScene([source({ pulseWidthFs: 250 })]);
  near(durationAt(100), 250, 1e-9);
  assert.equal(probeDurationLabel(probeAt(100, 0), 'pulsedlaser'), '250 fs');
});

// Andrea's and Codex's reproduction on 0587e2d: the time-mode probe hands its
// pulse record to scopeTrace, which evaluates the upstream gates with
// pulseWidthFs. Dispersion after a gate must not change, in hindsight, what
// that gate let through.
test('dispersion after a gate does not change what the gate let through', () => {
  const laser = source({ pulseWidthFs: 2, repRateMHz: 1000 });
  const aom = createElement('aom', 100, 0);
  Object.assign(aom.params, { deflect: 0, eff: 1, modulate: true, modShape: 'square', modFreqMHz: 1000, chopDuty: 0.5 });
  traceScene([laser, aom, compressor(300, 1e6)]);
  const before = probeAt(200, 0), after = probeAt(400, 0);
  assert.ok(before?.pulse?.gates?.length && after?.pulse?.gates?.length, 'both probes see the gated train');
  near(pulseTransmissionAt(after.pulse, 0), pulseTransmissionAt(before.pulse, 0), 1e-12);
  // The duration readout still follows the compressor.
  near(before.pulse.durationFs, 2, 1e-9);
  near(after.pulse.durationFs, gaussianAfter(2, 1e6), 1e-6 * gaussianAfter(2, 1e6));
});

// traceValueAt is continuous from the right at a step: a probe exactly at the
// optical path of a compressor already reads the new GDD (the convention of
// the pulse packets), with a 1e-9 tolerance on the path; a linear event
// (inside glass) interpolates.
test('the GDD trace at a step: before, exactly at and after the event', () => {
  const step = [{ opl: 0, gdd: 0 }, { opl: 10, gdd: 30000 }];
  assert.equal(traceValueAt(step, 9.999, 'gdd'), 0);
  assert.equal(traceValueAt(step, 10, 'gdd'), 30000);
  assert.equal(traceValueAt(step, 10 - 1e-10, 'gdd'), 30000);
  assert.equal(traceValueAt(step, 10.001, 'gdd'), 30000);
  const ramp = [{ opl: 0, gdd: 0 }, { opl: 10, gdd: 1000, linear: true }];
  assert.equal(traceValueAt(ramp, 2.5, 'gdd'), 250);
});
