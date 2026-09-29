// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createElement, registry } from '../sketch/js/elements.js';
import {
  detectorReading, loopClosuresFromLastTrace, opoReading, probePowerAt, traceScene, weakLightShortfallFromLastTrace,
} from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { C_MM_PER_NS } from '../sketch/js/pulses.js';

// Light going round a closed passive loop -- a cavity -- loses the same
// fraction g of its power on every round trip, so once the tracer sees the
// same round trip twice it sums the rest of the series, g + g^2 + ... , in
// closed form instead of stopping at its depth limit with light still
// circulating. What the method refuses keeps the depth limit and its
// "reading incomplete" caveat.

const near = (actual, expected, tolerance, what) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} vs ${expected}`);
const probeFraction = (x, y) => probePowerAt(x, y, 5)?.sourceFractions.reduce((sum, f) => sum + f.fraction, 0) ?? 0;

// A laser into a linear cavity of two facing partial mirrors, both leaks
// traced. Everything is at normal incidence, so every round trip retraces
// the one before. A single ray unless a sized beam is asked for.
function twoMirrorCavity(R1, R2, { source = 'cwlaser', beamMode = 'line', repRateMHz, extra = [] } = {}) {
  const laser = createElement(source, 100, 0);
  Object.assign(laser.params, { avgPowerW: 1, beamMode });
  if (repRateMHz) laser.params.repRateMHz = repRateMHz;
  const m1 = createElement('mirror', 300, 0), m2 = createElement('mirror', 400, 0);
  m1.params.refl = R1 * 100;
  m2.params.refl = R2 * 100;
  m1.params.showTransmitted = m2.params.showTransmitted = true;
  const out = createElement('detector', 500, 0);
  return { laser, out, elements: [laser, m1, m2, out, ...extra] };
}

test('a two-mirror cavity sums to the incoherent series, and conserves power', () => {
  const R1 = 0.7, R2 = 0.9, T1 = 1 - R1, T2 = 1 - R2;
  const { out, elements } = twoMirrorCavity(R1, R2);
  traceScene(elements, []);
  const transmitted = T1 * T2 / (1 - R1 * R2);
  const reflected = R1 + T1 * T1 * R2 / (1 - R1 * R2);
  near(detectorReading(out.id).signal, transmitted, 1e-12, 'through the far mirror');
  // A probe between the laser and the cavity reads the beam going in (1) and
  // everything coming back out: M1's reflection and the leaks back through it.
  near(probeFraction(200, 0) - 1, reflected, 1e-12, 'back out through the first mirror');
  near(transmitted + reflected, 1, 1e-12, 'lossless mirrors: what goes in comes out');
  // Inside, a probe reads the circulating power in both directions.
  near(probeFraction(350, 0), T1 * (1 + R2) / (1 - R1 * R2), 1e-12, 'circulating power');
  assert.deepEqual(weakLightShortfallFromLastTrace(), [], 'nothing is left over');
  assert.deepEqual(detectorReading(out.id).approximations, [], 'so the reading carries no caveat');
  const [loop, ...more] = loopClosuresFromLastTrace();
  assert.equal(more.length, 0);
  near(loop.g, R1 * R2, 1e-15, 'round-trip transmission');
  assert.equal(loop.interactions, 2);
});

test('the sum stays exact as the loop approaches lossless, and the drawing is not brightened', () => {
  // g = 0.998: the closed form carries 500 round trips' worth of light.
  const R = 0.999, T = 1 - R;
  const { out, elements } = twoMirrorCavity(R, R);
  const { drawables } = traceScene(elements, []);
  const transmitted = T * T / (1 - R * R);
  near(detectorReading(out.id).signal, transmitted, 1e-12, 'through the far mirror');
  near(transmitted + probeFraction(200, 0) - 1, 1, 1e-9, 'conservation');
  near(loopClosuresFromLastTrace()[0].g, R * R, 1e-15, 'round-trip transmission');
  // Only power carries the sum. The light inside was drawn at the 0.1 % that
  // gets in (opacity 0.35 + 0.6 x 0.001); a summed round trip drawn with its
  // power would be at full opacity.
  const inside = drawables.filter(d => d.type === 'path' && d.pts.every(p => p.x >= 300 - 1e-6 && p.x <= 400 + 1e-6));
  assert.ok(inside.length > 0);
  for (const path of inside) assert.ok(path.opacity < 0.36, `drawn at ${path.opacity}`);
});

test('a lossless loop is not summed: its light never leaves, and the depth limit says so', () => {
  const left = createElement('mirror', 300, 0), right = createElement('mirror', 360, 0);
  const laser = createElement('cwlaser', 250, 0);
  laser.params.avgPowerW = 0.1;
  traceScene([laser, left, right], []);
  assert.deepEqual(loopClosuresFromLastTrace(), []);
  near(weakLightShortfallFromLastTrace()[0].fraction, 1, 1e-12, 'the whole beam is trapped');
});

test('a loop through a crystal that would convert the circulating light again is refused', () => {
  const crystal = createElement('crystal', 350, 0);
  Object.assign(crystal.params, { convert: 'shg', efficiency: 0.1, transmitPump: true });
  const { out, elements } = twoMirrorCavity(0.7, 0.9, { extra: [crystal] });
  traceScene(elements, []);
  assert.deepEqual(loopClosuresFromLastTrace(), [], 'no loop summed');
  assert.ok(weakLightShortfallFromLastTrace()[0]?.fraction > 0, 'the depth limit still stops the light');
  assert.equal(detectorReading(out.id).weakLightIncomplete, true, 'and the reading says so');
  // The same crystal converting nothing is a plain window, and is summed.
  crystal.params.convert = 'none';
  traceScene(elements, []);
  assert.equal(loopClosuresFromLastTrace().length, 1);
  near(detectorReading(out.id).signal, 0.3 * 0.1 / (1 - 0.63), 1e-12, 'window in the cavity');
});

test('a pulsed loop is summed only when each round trip lands on a later pulse of the train', () => {
  // 100 mm between the mirrors: one round trip is 200 mm of path.
  const roundTripNs = 200 / C_MM_PER_NS;
  const synchronous = 1000 / roundTripNs;
  const R1 = 0.7, R2 = 0.9;
  for (const [repRateMHz, summed] of [[synchronous, true], [2 * synchronous, true], [synchronous / 2, false]]) {
    const { out, elements } = twoMirrorCavity(R1, R2, { source: 'pulsedlaser', beamMode: 'beam', repRateMHz });
    traceScene(elements, []);
    const reading = detectorReading(out.id);
    const label = `${repRateMHz.toFixed(3)} MHz`;
    if (summed) {
      // A sized pulsed beam: every sample retraces its own round trip.
      assert.ok(loopClosuresFromLastTrace().length > 1, `${label}: each ray sample closes its own loop`);
      near(reading.signal, (1 - R1) * (1 - R2) / (1 - R1 * R2), 1e-12, label);
      assert.deepEqual(weakLightShortfallFromLastTrace(), [], label);
    } else {
      // Half a period: every other echo falls between the pulses.
      assert.deepEqual(loopClosuresFromLastTrace(), [], label);
      assert.equal(reading.weakLightIncomplete, true, label);
    }
  }
});

// A square ring closed by a 50/50 beamsplitter: the beam enters through it,
// goes round three 100 % mirrors, and half of it is reflected into the ring
// again on each return.
function ring(beamMode) {
  const laser = createElement('cwlaser', 100, 0);
  Object.assign(laser.params, { avgPowerW: 1, beamMode });
  const bs = createElement('bs', 300, 0);
  bs.rot = 90;
  const a = createElement('mirror', 450, 0), b = createElement('mirror', 450, -150), c = createElement('mirror', 300, -150);
  a.rot = 45; b.rot = -45; c.rot = 45;
  return [laser, bs, a, b, c];
}

test('a coherent beam\'s loop is left to the coherent field sum', () => {
  // One ray carries no field: its ring is summed, and a probe on the ring
  // reads 0.5 / (1 - 0.5) of the input.
  traceScene(ring('line'), []);
  assert.deepEqual(loopClosuresFromLastTrace().map(loop => loop.g), [0.5]);
  near(probeFraction(375, 0), 1, 1e-12, 'incoherent circulating power');
  near(probeFraction(300, 75), 1, 1e-12, 'everything leaves through the beamsplitter');
  assert.deepEqual(weakLightShortfallFromLastTrace(), []);
  // A sized CW beam is one phase-locked field whose round trips interfere at
  // the beamsplitter; adding their powers would be wrong, so no loop of it is
  // summed while it is coherent.
  traceScene(ring('beam'), []);
  assert.deepEqual(loopClosuresFromLastTrace(), []);
});

test('both bundled OPO cavities deliver the whole signal they generate', () => {
  // Fractions of the laser: the Z cavity's OPO sees the doubled half of it.
  const cases = [
    ['Synchronously pumped picosecond OPO', 0.1129, 0.9, 10],
    ['Optical parametric oscillator — ring cavity, element by element', 0.1995, 0.8, 5],
  ];
  for (const [name, steadyState, outputCouplerR, interactions] of cases) {
    const scene = parseSketch(readFileSync(new URL(`../Examples/Nonlinear Optics/${name}.json`, import.meta.url), 'utf8'), registry);
    traceScene(scene.elements);
    // The idler leaves in one pass, so it states exactly how much pump was
    // converted; Manley-Rowe gives the signal generated alongside it.
    const share = opoReading('crystal').waves.signalShare;
    const generated = detectorReading('idler-detector').signal * share / (1 - share);
    const signal = detectorReading('signal-detector');
    near(signal.signal, generated, 1e-12, `${name}: signal`);
    near(signal.signal, steadyState, 5e-5, `${name}: of the laser`);
    assert.deepEqual(signal.approximations, [], `${name}: no caveat`);
    assert.deepEqual(weakLightShortfallFromLastTrace(), [], `${name}: nothing left circulating`);
    const loops = loopClosuresFromLastTrace();
    assert.equal(loops.length, 1, `${name}: one loop`);
    near(loops[0].g, outputCouplerR, 1e-12, `${name}: round-trip transmission`);
    assert.equal(loops[0].interactions, interactions, `${name}: interactions per round trip`);
  }
});
