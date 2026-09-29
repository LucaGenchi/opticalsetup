// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import {
  UNTRACED_NEGLIGIBLE_SHARE, probePowerAt, traceScene, untracedLightAt, weakLightShortfallFromLastTrace,
} from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';
import { parseSketch } from '../sketch/js/state.js';

// Light the tracer stops (weak-branch budget, depth limit) used to flag every
// reading in the sketch. Luca found that counter-intuitive: a meter whose own
// 50 mW beam was complete said "reading incomplete" because a laser elsewhere
// was trapped between two mirrors. A reading now carries the caveat only when
// the stopped light could reach it, and says how much, in its own terms.

const near = (actual, expected, tol, what) => assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} vs ${expected}`);

function laserAt(x, y, avgPowerW, params = {}) {
  const laser = createElement('cwlaser', x, y);
  Object.assign(laser.params, { avgPowerW, beamMode: 'line' }, params);
  return laser;
}
const meter = (x, y, rot = 0) => Object.assign(createElement('powermeter', x, y), { rot });
const displayOf = sensor => Object.assign(createElement('display', sensor.x, sensor.y + 150), {
  params: { ...createElement('display', 0, 0).params, sensorId: sensor.id },
});
const screen = (sensor, elements) => {
  const display = displayOf(sensor);
  return registry.display.svg(display, [...elements, display]);
};
const probeCard = (x, y, elements) => {
  const probe = createElement('probe', x, y);
  probe.params.prop = 'power';
  return registry.probe.svg(probe, [...elements, probe]);
};

// Example 4 of Luca's tests. A laser emits between two facing 100 % mirrors
// (its exit port is just inside the left one), so all of its light goes round
// until the depth limit stops it; a separate 50 mW beam goes into a meter.
function trappedBench() {
  const trapped = laserAt(250, 0, 0.1);
  const left = createElement('mirror', 300, 0), right = createElement('mirror', 360, 0);
  const own = laserAt(0, 200, 0.05);
  const m = meter(400, 200);
  return { trapped, m, elements: [trapped, left, right, own, m] };
}

test('light trapped in a closed loop does not flag a meter it cannot reach (example 4)', () => {
  const { trapped, m, elements } = trappedBench();
  traceScene(elements, []);
  // The trapped light is still recorded as untraced...
  const shortfall = weakLightShortfallFromLastTrace();
  assert.equal(shortfall.length, 1);
  assert.equal(shortfall[0].sourceId, trapped.id);
  // ...but it goes round a loop that repeats exactly, with nothing leaking
  // out, so it can reach no sensor.
  const reading = enhancedReading(m, elements);
  near(reading.detectedPowerW, 0.05, 1e-15, 'the meter');
  assert.equal(reading.weakLightIncomplete, undefined);
  assert.deepEqual(reading.approximations, []);
  assert.doesNotMatch(screen(m, elements), /UNTRACED/);
  assert.equal(probePowerAt(300, 200, 5).weakLightIncomplete, undefined, 'a probe on the meter beam');
  assert.doesNotMatch(probeCard(300, 200, elements), /untraced|incomplete/);
  // A sensor nothing reaches is not told light may still arrive.
  const dark = meter(400, -200);
  traceScene([...elements, dark], []);
  assert.equal(untracedLightAt(dark.id), null);
});

test('a probe inside the lossless loop is incomplete, with no amount', () => {
  // The trapped light crosses it on every round trip, for ever: there is no
  // finite figure to give.
  const { elements } = trappedBench();
  traceScene(elements, []);
  const area = probePowerAt(330, 0, 5);
  assert.equal(area.weakLightIncomplete, true);
  assert.equal(area.untracedLight.bounded, false);
  assert.match(probeCard(330, 0, elements), /\(incomplete\)/);
});

// Two 99 % mirrors facing each other, both leaks traced, with the laser
// between them: each round trip hands 1 % out of the right mirror to a meter.
// The depth limit stops the light after about 30 round trips with more than
// half of it still going round.
function leakyBench() {
  const laser = laserAt(250, 0, 0.1);
  const left = createElement('mirror', 300, 0), right = createElement('mirror', 360, 0);
  for (const mirror of [left, right]) Object.assign(mirror.params, { refl: 99, showTransmitted: true });
  const m = meter(500, 0);
  const other = laserAt(0, 200, 0.05), otherMeter = meter(500, 200);
  return { laser, m, otherMeter, elements: [laser, left, right, m, other, otherMeter] };
}
// Followed for ever, the right mirror hands out 1 % of every round trip that
// starts there: 0.01 / (1 - 0.99^2) of the laser.
const RIGHT_PORT_W = 0.1 * 0.01 / (1 - 0.99 ** 2);

test('a leaky cavity flags only the meter its leak reaches, and says exactly how much is missing', () => {
  const { m, otherMeter, elements } = leakyBench();
  traceScene(elements, []);
  const reading = enhancedReading(m, elements);
  assert.equal(reading.weakLightIncomplete, true);
  assert.equal(reading.untracedLight.twoSided, false, 'power-only light only adds');
  assert.ok(reading.detectedPowerW < 0.5 * RIGHT_PORT_W, `most is still missing: ${reading.detectedPowerW}`);
  // What was traced plus what could still arrive is the steady state.
  near(reading.detectedPowerW + reading.untracedLight.powerW, RIGHT_PORT_W, 1e-12, 'reading + untraced');
  const missingMw = (reading.untracedLight.powerW * 1000).toPrecision(3);
  assert.match(screen(m, elements), new RegExp(`UNTRACED LIGHT · UP TO ${missingMw.replace('.', '\\.')} mW LOW`));
  assert.ok(reading.approximations[0].startsWith('Light untraced: up to '), reading.approximations[0]);
  // The other meter's beam never meets the cavity.
  assert.equal(enhancedReading(otherMeter, elements).weakLightIncomplete, undefined);
  // A probe on the leak between cavity and meter is exact too.
  const onLeak = probePowerAt(430, 0, 5);
  const onLeakW = onLeak.sourceFractions[0].fraction * 0.1;
  near(onLeakW + onLeak.untracedLight.powerW, RIGHT_PORT_W, 1e-12, 'probe on the leak');
  assert.match(probeCard(430, 0, elements), /\(up to \+[\d.]+ mW untraced\)/);
  // So is a probe inside the cavity, which counts the light each time it
  // crosses: rightward 1/(1 - 0.99^2) of the laser, leftward 0.99 of that.
  const inside = probePowerAt(330, 0, 5);
  near(inside.sourceFractions[0].fraction * 0.1 + inside.untracedLight.powerW, 0.1 * 1.99 / (1 - 0.99 ** 2), 1e-9, 'probe inside');
});

test('a loop whose leak enters a fiber could reach anything, so every meter is flagged', () => {
  // Past a fiber the tracer re-emits the light and no longer follows where
  // it came from: the loop counts as light that could go anywhere.
  const { m, otherMeter, elements } = leakyBench();
  m.x = 800;
  const fiber = {
    id: 'cable', kind: 'fiber', pts: [{ x: 400, y: 0 }, { x: 600, y: 0 }], width: 20,
    propagate: true, lossDbPerM: 0, out0: { mode: 'diverge', na: 0.01 }, out1: { mode: 'diverge', na: 0.01 },
  };
  traceScene(elements, [fiber]);
  assert.ok(enhancedReading(m, elements).detectedPowerW > 0, 'the leak arrives through the fiber');
  const other = enhancedReading(otherMeter, elements);
  assert.equal(other.weakLightIncomplete, true);
  assert.ok(other.untracedLight.powerW > other.detectedPowerW, 'all of the stopped light, which exceeds this 50 mW');
});

// Two sources on one meter: a strong one directly, and a weak one (behind an
// ND) that splits at a cube the weak-branch budget cannot follow.
function mixedBench(trans) {
  const m = meter(500, 0);
  m.params.aperture = 60;
  const weak = laserAt(0, 0, 0.1), strong = laserAt(0, 20, 0.1);
  const filter = createElement('filter', 200, 0);
  Object.assign(filter.params, { ftype: 'nd', trans });
  const cube = createElement('bs', 300, 0);
  cube.params.size = 10;
  return { m, weak, strong, elements: [weak, strong, filter, cube, m] };
}

test('a source missing from a mixed reading is flagged with the watts it could add', () => {
  const { m, strong, elements } = mixedBench(0.01);
  traceScene(elements, [], { weakBranchBudget: 0 });
  const reading = enhancedReading(m, elements);
  assert.deepEqual(reading.sourceFractions.map(f => f.sourceId), [strong.id]);
  assert.equal(reading.weakLightIncomplete, true, 'the weak source is not in the reading, and still flagged');
  near(reading.untracedLight.powerW, 0.001, 1e-15, 'both halves of the 1 mW beam');
  assert.equal(reading.untracedLight.twoSided, false);
  assert.match(screen(m, elements), /UNTRACED LIGHT · UP TO 1\.00 mW LOW/);
  // A probe cannot bound light that could go anywhere: it says incomplete.
  assert.match(probeCard(400, 20, elements), /\(incomplete\)/);
});

test('untraced light too small to move the displayed digits is not flagged', () => {
  // An ND of 1e-6 leaves 0.1 µW to be stopped at the cube: a millionth of
  // the 100 mW reading, far below its three significant figures.
  const { m, elements } = mixedBench(1e-6);
  traceScene(elements, [], { weakBranchBudget: 0 });
  assert.equal(weakLightShortfallFromLastTrace().length, 1, 'the stop is still recorded');
  const reading = enhancedReading(m, elements);
  assert.equal(reading.weakLightIncomplete, undefined);
  assert.deepEqual(reading.approximations, []);
  // The boundary itself: flagged from the negligible share up.
  assert.ok(1e-7 / 0.1 < UNTRACED_NEGLIGIBLE_SHARE);
  const { m: m2, elements: elements2 } = mixedBench(UNTRACED_NEGLIGIBLE_SHARE * 1.001);
  traceScene(elements2, [], { weakBranchBudget: 0 });
  assert.equal(enhancedReading(m2, elements2).weakLightIncomplete, true);
});

test('an OPA in the sketch leaves light that could go anywhere without an amount', () => {
  // An amplifier adds power of its own, so what stopped light would do past
  // one has no bound: the meter says "incomplete", as before.
  const { m, elements } = mixedBench(0.01);
  const opa = createElement('opa', 300, 600);
  traceScene([...elements, opa], [], { weakBranchBudget: 0 });
  const reading = enhancedReading(m, [...elements, opa]);
  assert.equal(reading.weakLightIncomplete, true);
  assert.equal(reading.untracedLight.bounded, false);
  assert.match(screen(m, [...elements, opa]), /LIGHT UNTRACED · READING INCOMPLETE/);
});

test('with interference, untraced light can make a reading too high, and the figure is ± and covers it', () => {
  // Andrea's #193 reproduction: the Mach-Zehnder fixture with both cubes at
  // 1 % and a 1 W coherent source. With no weak-branch budget the weak arms
  // are stopped, and the vertical port reads 0.9801 W instead of 0.9604 W.
  const elements = parseSketch(readFileSync('test/fixtures/mach-zehnder.json', 'utf8')).elements;
  for (const el of elements) {
    if (el.type === 'bs') el.params.ratio = 0.01;
    if (el.type === 'cwlaser') el.params.avgPowerW = 1;
  }
  const [horizontal, vertical] = elements.filter(el => el.type === 'camera').sort((a, b) => b.x - a.x);
  traceScene(elements, []);
  const full = enhancedReading(vertical, elements).detectedPowerW;
  near(full, 0.9604, 1e-9, 'complete trace');
  traceScene(elements, [], { weakBranchBudget: 0 });
  const reading = enhancedReading(vertical, elements);
  near(reading.detectedPowerW, 0.9801, 1e-9, 'budget 0');
  assert.ok(reading.detectedPowerW > full, 'too high, not too low');
  assert.equal(reading.untracedLight.twoSided, true);
  assert.ok(reading.untracedLight.powerW >= reading.detectedPowerW - full, 'the ± figure covers the error');
  assert.match(reading.approximations[0], /either way/);
  // The other port now receives nothing traced, and is told light may still
  // reach it (the inspector's no-signal card).
  assert.equal(enhancedReading(horizontal, elements), null);
  assert.ok(untracedLightAt(horizontal.id));
});
