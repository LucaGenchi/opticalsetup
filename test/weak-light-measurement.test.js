// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import {
  WEAK_BRANCH_BUDGET, detectorReading, probePowerAt, traceScene, weakLightShortfallFromLastTrace,
} from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';
import { parseSketch } from '../sketch/js/state.js';
import { readFileSync } from 'node:fs';
import { probeAveragePowerW } from '../sketch/js/probe.js';

// Light below 2 % of its source used to stop being followed one optic later
// (unless a detector or sample was next), and was never drawn: a meter behind
// a 1 % ND and a lens read nothing, although 1 mW reaches it. Weak light is
// part of the setup, so it is now drawn and traced like any other beam, down
// to 1e-12 of its source. A bounded budget of weak branches caps the cost,
// and whatever that budget cannot follow is reported instead of vanishing.

const close = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-15, `${what}: ${actual} vs ${expected}`);

function laserAt(x, y, avgPowerW, { type = 'cwlaser', beamMode = 'line' } = {}) {
  const laser = createElement(type, x, y);
  Object.assign(laser.params, { avgPowerW, beamMode });
  return laser;
}
const lineLaser = (x, y, avgPowerW) => laserAt(x, y, avgPowerW);

function nd(x, trans) {
  const filter = createElement('filter', x, 0);
  Object.assign(filter.params, { ftype: 'nd', trans });
  return filter;
}

const meter = (x, y, rot = 0) => Object.assign(createElement('powermeter', x, y), { rot });
const read = (m, elements) => enhancedReading(m, elements);
const drawnBeyond = (drawables, x) => drawables.filter(d => (d.pts || []).some(p => p.x > x + 1e-6));

test('light too weak for the old drawing floor is drawn, and reaches a meter one optic further on', () => {
  // The reported reproduction: 100 mW, a 1 % ND, a lens, then a meter.
  const m = meter(500, 0);
  const elements = [lineLaser(0, 0, 0.1), nd(200, 0.01), createElement('lens', 300, 0), m];
  const { drawables } = traceScene(elements, []);
  const reading = read(m, elements);
  assert.ok(reading, 'the meter receives the light');
  close(reading.detectedPowerW, 0.001, 'meter behind the lens');
  assert.equal(reading.weakLightIncomplete, undefined, 'nothing was dropped, so no caveat');
  assert.deepEqual(weakLightShortfallFromLastTrace(), []);
  for (const x of [250, 400]) close(probeAveragePowerW(probePowerAt(x, 0, 5), elements), 0.001, `probe at x=${x}`);
  // The attenuated beam is part of the setup: it is drawn past the ND and
  // the lens, all the way to the meter.
  assert.ok(drawnBeyond(drawables, 400).length > 0, 'the 1 mW beam is drawn after the lens');
});

test('a pulsed weak beam is animated as well as drawn', () => {
  const m = meter(500, 0);
  const elements = [laserAt(0, 0, 0.1, { type: 'pulsedlaser' }), nd(200, 0.01), createElement('lens', 300, 0), m];
  const { pulseTracks } = traceScene(elements, []);
  assert.ok(pulseTracks.some(t => (t.pts || []).some(p => p.x > 400)), 'packets run past the lens');
  close(read(m, elements).detectedPowerW, 0.001, 'meter');
});

test('the lens makes no difference to what the meter reads', () => {
  const readAt = withLens => {
    const m = meter(500, 0);
    const elements = [lineLaser(0, 0, 0.1), nd(200, 0.01), ...(withLens ? [createElement('lens', 300, 0)] : []), m];
    traceScene(elements, []);
    return read(m, elements).detectedPowerW;
  };
  close(readAt(true), readAt(false), 'with and without the lens');
});

test('a weak beam keeps at least a tenth of a full beam\'s opacity, however faint', () => {
  // Beam mode draws filled strips whose opacity follows the light. Down to
  // 2 % it fades as before; below that it stops at a tenth of full strength,
  // or an OD 3 or OD 6 beam would be invisible (Luca, #193).
  const opacityAfter = trans => {
    const elements = [laserAt(0, 0, 0.1, { beamMode: 'beam' }), nd(200, trans)];
    const { drawables } = traceScene(elements, []);
    const strips = drawables.filter(d => d.type === 'poly');
    const full = Math.max(...strips.filter(d => d.pts.every(p => p.x <= 200 + 1e-6)).map(d => d.opacity));
    const after = strips.filter(d => d.pts.some(p => p.x > 200 + 1e-6)).map(d => d.opacity);
    assert.ok(after.length > 0, `ND ${trans}: the beam is drawn after the ND`);
    return { full, after: Math.max(...after) };
  };
  const { full } = opacityAfter(1);
  for (const trans of [0.01, 1e-3, 1e-6, 1e-10]) {
    const { after } = opacityAfter(trans);
    assert.ok(after >= 0.1 * full - 1e-12, `ND ${trans}: ${after} is below a tenth of ${full}`);
    assert.ok(after <= full, `ND ${trans}: never brighter than the full beam`);
  }
  // Above the old floor nothing changed: a 1 % beam keeps its 20 % fade.
  assert.ok(Math.abs(opacityAfter(0.01).after - 0.2 * full) < 1e-12);
});

// The budget boundary. After the ND the weak ray is a single continuation
// (not charged); the cube's two weak outputs are one branch each: two in all.
function splitBench() {
  const transmitted = meter(500, 0), reflected = meter(300, -200, -90);
  const laser = lineLaser(0, 0, 0.1);
  const elements = [laser, nd(200, 0.01), createElement('bs', 300, 0), transmitted, reflected];
  return { laser, transmitted, reflected, elements };
}

test('a budget that just suffices follows every weak branch and reports nothing', () => {
  for (const budget of [2, WEAK_BRANCH_BUDGET]) {
    const { transmitted, reflected, elements } = splitBench();
    const { drawables } = traceScene(elements, [], { weakBranchBudget: budget });
    close(read(transmitted, elements).detectedPowerW, 0.0005, `transmitted arm, budget ${budget}`);
    close(read(reflected, elements).detectedPowerW, 0.0005, `reflected arm, budget ${budget}`);
    assert.equal(read(transmitted, elements).weakLightIncomplete, undefined);
    assert.deepEqual(weakLightShortfallFromLastTrace(), [], `budget ${budget}`);
    assert.ok(drawnBeyond(drawables, 400).length > 0, 'both weak arms are drawn');
  }
});

test('one branch short of the budget, the branch it cannot follow is reported, not lost silently', () => {
  const { laser, transmitted, reflected, elements } = splitBench();
  traceScene(elements, [], { weakBranchBudget: 1 });
  const readings = [read(transmitted, elements), read(reflected, elements)];
  const arrived = readings.filter(Boolean);
  assert.equal(arrived.length, 1, 'one arm is followed, the other is not');
  close(arrived[0].detectedPowerW, 0.0005, 'the arm that was followed');
  const shortfall = weakLightShortfallFromLastTrace();
  assert.equal(shortfall.length, 1);
  assert.equal(shortfall[0].sourceId, laser.id);
  close(shortfall[0].fraction, 0.005, 'reported shortfall');
  assert.equal(arrived[0].weakLightIncomplete, true);
  assert.ok(arrived[0].approximations.some(note => /^Light untraced/.test(note)), 'the inspector caveat');
  const display = createElement('display', 700, 0);
  display.params.sensorId = (readings[0] ? transmitted : reflected).id;
  assert.match(registry.display.svg(display, [...elements, display]), /LIGHT UNTRACED · READING INCOMPLETE/, 'the meter screen says so');
  // The probe on the followed arm marks its figure as incomplete. Not as a
  // floor: a missing destructive contribution could make it too high.
  const probe = createElement('probe', readings[0] ? 400 : 300, readings[0] ? 0 : -100);
  probe.params.prop = 'power';
  assert.equal(probePowerAt(probe.x, probe.y, 5).weakLightIncomplete, true);
  const card = registry.probe.svg(probe, [...elements, probe]);
  assert.match(card, /(0\.500 mW|500 µW) \(incomplete\)/);
  assert.doesNotMatch(card, /≥/);
});

test('with no budget both weak branches are reported, and the next ordinary trace is complete again', () => {
  const { laser, transmitted, reflected, elements } = splitBench();
  traceScene(elements, [], { weakBranchBudget: 0 });
  assert.equal(read(transmitted, elements), null);
  assert.equal(read(reflected, elements), null);
  const shortfall = weakLightShortfallFromLastTrace();
  assert.equal(shortfall.length, 1);
  assert.equal(shortfall[0].sourceId, laser.id);
  close(shortfall[0].fraction, 0.01, 'both halves of the 1 % beam');
  traceScene(elements, []);
  assert.deepEqual(weakLightShortfallFromLastTrace(), []);
  close(read(transmitted, elements).detectedPowerW, 0.0005, 'default budget');
});

function cavity({ traceLeaks }) {
  // Two 99 % mirrors facing each other behind a 1 % ND.
  const left = createElement('mirror', 300, 0), right = createElement('mirror', 340, 0);
  for (const mirror of [left, right]) {
    mirror.params.refl = 99;
    mirror.params.showTransmitted = traceLeaks;
  }
  const m = meter(500, 0);
  const laser = lineLaser(0, 0, 0.1);
  return { m, laser, elements: [laser, nd(200, 0.01), left, right, m] };
}

test('weak light split round a cavity stays bounded by the budget, and says so', () => {
  // With the leaks traced, every round trip splits the weak ray again, far
  // past a small budget: the trace must end and count what it dropped.
  const { m, elements } = cavity({ traceLeaks: true });
  for (const budget of [8, 64]) {
    traceScene(elements, [], { weakBranchBudget: budget });
    const shortfall = weakLightShortfallFromLastTrace();
    assert.equal(shortfall.length, 1, `budget ${budget} ran out`);
    assert.ok(shortfall[0].fraction > 0 && shortfall[0].fraction < 0.01, `${shortfall[0].fraction}`);
    const reading = read(m, elements);
    assert.ok(reading.detectedPowerW > 0 && reading.detectedPowerW < 0.001, `${reading.detectedPowerW}`);
    assert.equal(reading.weakLightIncomplete, true);
  }
});

test('light the depth limit cuts off is reported too', () => {
  // A laser emitting between two facing 100 % mirrors (its exit port sits
  // 52 mm ahead of its centre, just inside the left one): nothing leaks, so
  // the light bounces until the depth limit stops it with all its power, and
  // that is reported rather than dropped silently.
  const left = createElement('mirror', 300, 0), right = createElement('mirror', 360, 0);
  const laser = lineLaser(250, 0, 0.1);
  traceScene([laser, left, right], []);
  const shortfall = weakLightShortfallFromLastTrace();
  assert.equal(shortfall.length, 1);
  assert.equal(shortfall[0].sourceId, laser.id);
  assert.ok(Math.abs(shortfall[0].fraction - 1) < 1e-12, `the whole beam is trapped: ${shortfall[0].fraction}`);
});

test('a source missing entirely from a mixed reading still flags it', () => {
  // A second, strong source reaches the same meter directly, so the reading
  // exists and names only that source; the weak one, cut off by the budget
  // at a splitter, left no trace in it at all.
  const m = meter(500, 0);
  m.params.aperture = 60;
  const weak = lineLaser(0, 0, 0.1), strong = lineLaser(0, 20, 0.1);
  const cube = createElement('bs', 300, 0);
  cube.params.size = 10;
  const elements = [weak, strong, nd(200, 0.01), cube, m];
  traceScene(elements, []);
  close(read(m, elements).detectedPowerW, 0.1005, 'the strong source and half the weak one');
  assert.equal(read(m, elements).weakLightIncomplete, undefined);
  traceScene(elements, [], { weakBranchBudget: 0 });
  const reading = read(m, elements);
  close(reading.detectedPowerW, 0.1, 'the strong source alone');
  assert.deepEqual(reading.sourceFractions.map(f => f.sourceId), [strong.id]);
  assert.equal(reading.weakLightIncomplete, true, 'the meter says its reading is incomplete');
  const area = probePowerAt(400, 20, 5);
  assert.deepEqual(area.sourceFractions.map(f => f.sourceId), [strong.id]);
  assert.equal(area.weakLightIncomplete, true, 'and so does a probe on the strong beam alone');
});

const straightFiber = extra => ({
  id: 'cable', kind: 'fiber', pts: [{ x: 400, y: 10 }, { x: 600, y: 10 }], width: 20,
  propagate: true, lossDbPerM: 0, out0: { mode: 'diverge', na: 0.01 }, out1: { mode: 'diverge', na: 0.01 }, ...extra,
});

test('weak light out of a fiber is drawn and animated, and reaches the meter', () => {
  for (const type of ['cwlaser', 'pulsedlaser']) {
    const laser = laserAt(0, 10, 0.1, { type });
    const m = meter(800, 10);
    const filter = nd(200, 0.01);
    filter.y = 10;
    const elements = [laser, filter, m];
    const { drawables, pulseTracks } = traceScene(elements, [straightFiber()]);
    close(read(m, elements).detectedPowerW, 0.001, type);
    assert.ok(drawnBeyond(drawables, 601).length > 0, `${type}: drawn after the fiber`);
    if (type === 'pulsedlaser') assert.ok(pulseTracks.some(t => (t.pts || []).some(p => p.x > 601)), 'and animated');
  }
});

test('two sources into one fiber both arrive, whichever comes first', () => {
  // Andrea's reproduction on 4668e01: the fiber re-emits one coupling per
  // emission key, and two CW sources at one wavelength and path length used
  // to share a key, so the one coupled second was dropped.
  for (const trans of [0.01, 1]) {
    for (const weakFirst of [true, false]) {
      const weak = lineLaser(0, 0, 0.1), strong = lineLaser(0, 20, 0.1);
      const filter = nd(200, trans);
      filter.params.h = 10;
      const lens = createElement('lens', 300, 0);
      lens.params.aperture = 10;
      const m = meter(800, 10);
      m.params.aperture = 100;
      const elements = [...(weakFirst ? [weak, strong] : [strong, weak]), filter, lens, m];
      traceScene(elements, [straightFiber()]);
      const reading = read(m, elements);
      const what = `ND ${trans}, ${weakFirst ? 'weak' : 'strong'} source first`;
      close(reading.detectedPowerW, 0.1 + 0.1 * trans, what);
      assert.deepEqual(new Set(reading.sourceFractions.map(f => f.sourceId)), new Set([weak.id, strong.id]), what);
    }
  }
});

// Andrea's reproductions on ad0eb6c, with coherent sources: a sized CW laser
// is phase-locked, so the coherent planning passes run before the final one.
test('the coherent planning passes do not count dropped light a second time', () => {
  // All of a coherent beam trapped between two 100 % mirrors: the depth
  // limit stops the whole of it, once -- not once per planning pass.
  const left = createElement('mirror', 300, 0), right = createElement('mirror', 360, 0);
  const laser = laserAt(250, 0, 0.1, { beamMode: 'beam' });
  laser.params.beamWidth = 6;
  traceScene([laser, left, right], []);
  const trapped = weakLightShortfallFromLastTrace();
  assert.equal(trapped.length, 1);
  assert.ok(Math.abs(trapped[0].fraction - 1) < 1e-12, `the whole beam, once: ${trapped[0].fraction}`);
  // A 1 % coherent beam split by a cube with no budget: both halves, once.
  const beamLaser = laserAt(0, 0, 0.1, { beamMode: 'beam' });
  beamLaser.params.beamWidth = 6;
  traceScene([beamLaser, nd(200, 0.01), createElement('bs', 300, 0)], [], { weakBranchBudget: 0 });
  const split = weakLightShortfallFromLastTrace();
  assert.equal(split.length, 1);
  assert.ok(Math.abs(split[0].fraction - 0.01) < 1e-12, `the 1 % beam, once: ${split[0].fraction}`);
});

test('coherent light demoted below its floor is not recombined by the plan any more', () => {
  // Two Mach-Zehnders in cascade: the first, nearly dark at its horizontal
  // port, sends about 3.5e-5 of the light into the second. That light has
  // fallen below the coherent floor, so it is power-only: the second
  // interferometer splits it the same way whatever its own delay.
  const first = parseSketch(readFileSync('test/fixtures/mach-zehnder.json', 'utf8')).elements;
  const second = parseSketch(readFileSync('test/fixtures/mach-zehnder.json', 'utf8')).elements;
  const firstCameras = first.filter(el => el.type === 'camera');
  const horizontal = firstCameras.reduce((a, b) => (a.x > b.x ? a : b));
  const bench = first.filter(el => el !== horizontal && el.type !== 'display');
  bench.find(el => el.type === 'delayline').params.delayMm = 0.000799;
  const cascade = second.filter(el => !['cwlaser', 'textlabel', 'display'].includes(el.type)).map(el => {
    el.id = `second-${el.id}`;
    el.x += 600;
    el.y += 200;
    return el;
  });
  const secondDelay = cascade.find(el => el.type === 'delayline');
  const cameras = cascade.filter(el => el.type === 'camera');
  const readings = [0, 0.000133, 0.000266].map(delayMm => {
    secondDelay.params.delayMm = delayMm;
    traceScene([...bench, ...cascade], []);
    return cameras.map(camera => detectorReading(camera.id)?.signal ?? 0);
  });
  const total = readings[0][0] + readings[0][1];
  assert.ok(total > 1e-5 && total < 1e-4, `about 3.5e-5 reaches the second interferometer: ${total}`);
  for (const [i, reading] of readings.entries()) {
    for (const port of [0, 1]) {
      assert.ok(Math.abs(reading[port] - readings[0][port]) < 1e-9 * total,
        `delay step ${i}, port ${port}: ${reading[port]} vs ${readings[0][port]}`);
    }
  }
});
