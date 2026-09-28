// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import {
  MEASUREMENT_RAY_BUDGET, probePowerAt, traceScene, weakLightShortfallFromLastTrace,
} from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';
import { probeAveragePowerW } from '../sketch/js/probe.js';

// Light below the tracer's drawing floor (2 % of the source for an ordinary
// ray) used to be followed only when the very next thing it met was a
// detector or a sample. One optic further on, it was gone: a meter behind a
// 1 % ND and a lens read nothing, although 1 mW reaches it. It is now
// followed on, undrawn, within a bounded budget of its own, and whatever the
// budget cannot follow is reported instead of vanishing.

const close = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-15, `${what}: ${actual} vs ${expected}`);

function lineLaser(x, y, avgPowerW) {
  const laser = createElement('cwlaser', x, y);
  Object.assign(laser.params, { avgPowerW, beamMode: 'line' });
  return laser;
}

function nd(x, trans) {
  const filter = createElement('filter', x, 0);
  Object.assign(filter.params, { ftype: 'nd', trans });
  return filter;
}

const meter = (x, y, rot = 0) => Object.assign(createElement('powermeter', x, y), { rot });
const read = (m, elements) => enhancedReading(m, elements);
const drawnPoints = drawables => drawables.flatMap(d => d.pts || []);

test('light too weak to draw still reaches a meter one optic further on', () => {
  // The reported reproduction: 100 mW, a 1 % ND, a lens, then a meter.
  const laser = lineLaser(0, 0, 0.1), m = meter(500, 0);
  const elements = [laser, nd(200, 0.01), createElement('lens', 300, 0), m];
  const { drawables, pulseTracks } = traceScene(elements, []);
  const reading = read(m, elements);
  assert.ok(reading, 'the meter receives the light');
  close(reading.detectedPowerW, 0.001, 'meter behind the lens');
  assert.equal(reading.weakLightIncomplete, undefined, 'nothing was dropped, so no caveat');
  assert.deepEqual(weakLightShortfallFromLastTrace(), []);
  // The beam probe reads the same light, before and after the lens.
  for (const x of [250, 400]) close(probeAveragePowerW(probePowerAt(x, 0, 5), elements), 0.001, `probe at x=${x}`);
  // ...and none of it is drawn or animated: the drawn beam still ends at the
  // ND, exactly as it did before, so no faint clutter appears on the canvas.
  const xs = drawnPoints(drawables).map(p => p.x);
  assert.ok(xs.length > 0, 'the strong beam up to the ND is drawn');
  assert.ok(Math.max(...xs) <= 200 + 1e-6, `nothing drawn past the ND (max x ${Math.max(...xs)})`);
  assert.equal(pulseTracks.length, 0);
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

// The budget boundary. After the ND, the weak ray needs one measurement ray to
// be followed to the cube, and the cube's two outputs one each: three in all.
function splitBench() {
  const transmitted = meter(500, 0), reflected = meter(300, -200, -90);
  const laser = lineLaser(0, 0, 0.1);
  const elements = [laser, nd(200, 0.01), createElement('bs', 300, 0), transmitted, reflected];
  return { laser, transmitted, reflected, elements };
}

test('a budget that just suffices follows every weak branch and reports nothing', () => {
  for (const budget of [3, MEASUREMENT_RAY_BUDGET]) {
    const { transmitted, reflected, elements } = splitBench();
    traceScene(elements, [], { measurementRayBudget: budget });
    close(read(transmitted, elements).detectedPowerW, 0.0005, `transmitted arm, budget ${budget}`);
    close(read(reflected, elements).detectedPowerW, 0.0005, `reflected arm, budget ${budget}`);
    assert.equal(read(transmitted, elements).weakLightIncomplete, undefined);
    assert.deepEqual(weakLightShortfallFromLastTrace(), [], `budget ${budget}`);
  }
});

test('one ray short of the budget, the branch it cannot follow is reported, not lost silently', () => {
  const { laser, transmitted, reflected, elements } = splitBench();
  traceScene(elements, [], { measurementRayBudget: 2 });
  const readings = [read(transmitted, elements), read(reflected, elements)];
  const arrived = readings.filter(Boolean);
  assert.equal(arrived.length, 1, 'one arm is followed, the other is not');
  close(arrived[0].detectedPowerW, 0.0005, 'the arm that was followed');
  // The shortfall is exactly the arm that was not followed, charged to the
  // laser that emitted it, and the reading from that laser says it may be low.
  const shortfall = weakLightShortfallFromLastTrace();
  assert.equal(shortfall.length, 1);
  assert.equal(shortfall[0].sourceId, laser.id);
  close(shortfall[0].fraction, 0.005, 'reported shortfall');
  assert.equal(arrived[0].weakLightIncomplete, true);
  assert.ok(arrived[0].approximations.some(note => /^Weak light untraced/.test(note)), 'the inspector caveat');
  const display = createElement('display', 700, 0);
  display.params.sensorId = (readings[0] ? transmitted : reflected).id;
  assert.match(registry.display.svg(display, [...elements, display]), /WEAK LIGHT UNTRACED/, 'the meter screen says so');
  // The probe on the followed arm marks its figure as a floor.
  const probe = createElement('probe', readings[0] ? 400 : 300, readings[0] ? 0 : -100);
  probe.params.prop = 'power';
  const area = probePowerAt(probe.x, probe.y, 5);
  assert.equal(area.weakLightIncomplete, true);
  assert.match(registry.probe.svg(probe, [...elements, probe]), /≥ 0\.500 mW|≥ 500 µW/);
});

test('with no budget at all the whole weak beam is reported, and a full budget restores it', () => {
  const { laser, transmitted, reflected, elements } = splitBench();
  for (const budget of [0, 1]) {
    traceScene(elements, [], { measurementRayBudget: budget });
    assert.equal(read(transmitted, elements), null);
    assert.equal(read(reflected, elements), null);
    const shortfall = weakLightShortfallFromLastTrace();
    assert.equal(shortfall.length, 1);
    assert.equal(shortfall[0].sourceId, laser.id);
    close(shortfall[0].fraction, 0.01, `budget ${budget}: both halves of the 1 % beam`);
  }
  // The override is per trace: the next ordinary trace is complete again.
  traceScene(elements, []);
  assert.deepEqual(weakLightShortfallFromLastTrace(), []);
  close(read(transmitted, elements).detectedPowerW, 0.0005, 'default budget');
});

test('weak light followed round a cavity stays bounded by the budget', () => {
  // Two 99 % mirrors facing each other behind a 1 % ND: every round trip
  // splits the weak ray again, far past any budget, and the trace must still
  // end, count what it could not follow, and draw none of it.
  const left = createElement('mirror', 300, 0), right = createElement('mirror', 340, 0);
  left.params.refl = 99;
  right.params.refl = 99;
  const m = meter(500, 0);
  const laser = lineLaser(0, 0, 0.1);
  const elements = [laser, nd(200, 0.01), left, right, m];
  for (const budget of [8, 64]) {
    const { drawables } = traceScene(elements, [], { measurementRayBudget: budget });
    const shortfall = weakLightShortfallFromLastTrace();
    assert.equal(shortfall.length, 1, `budget ${budget} ran out`);
    assert.ok(shortfall[0].fraction > 0 && shortfall[0].fraction < 0.01, `${shortfall[0].fraction}`);
    const reading = read(m, elements);
    assert.ok(reading.detectedPowerW > 0 && reading.detectedPowerW < 0.001, `${reading.detectedPowerW}`);
    assert.equal(reading.weakLightIncomplete, true);
    assert.ok(Math.max(...drawnPoints(drawables).map(p => p.x)) <= 200 + 1e-6);
  }
});

test('weak light stays undrawn through a fiber, CW or pulsed, and still reaches the meter', () => {
  // Andrea's reproduction on ebeeca4: the fiber relaunched the light as
  // ordinary rays, drawn and animated from the far connector.
  const cable = {
    id: 'cable', kind: 'fiber', pts: [{ x: 400, y: 0 }, { x: 600, y: 0 }],
    propagate: true, lossDbPerM: 0, outMode: 'diverge', na: 0.01,
  };
  for (const type of ['cwlaser', 'pulsedlaser']) {
    for (const trans of [0.01, 1]) {
      const laser = createElement(type, 0, 0);
      Object.assign(laser.params, { avgPowerW: 0.1, beamMode: 'line' });
      const m = meter(800, 0);
      const elements = [laser, nd(200, trans), createElement('lens', 300, 0), m];
      const { drawables, pulseTracks } = traceScene(elements, [cable]);
      close(read(m, elements).detectedPowerW, 0.1 * trans, `${type}, ND ${trans}`);
      const drawnAfter = drawables.filter(d => (d.pts || []).some(p => p.x > 601)).length;
      const animatedAfter = pulseTracks.filter(t => (t.pts || []).some(p => p.x > 601)).length;
      if (trans < 1) {
        assert.equal(drawnAfter, 0, `${type}: nothing drawn after the fiber`);
        assert.equal(animatedAfter, 0, `${type}: nothing animated after the fiber`);
      } else {
        // The control: at full strength the same relaunch is drawn.
        assert.ok(drawnAfter > 0, `${type}: a strong beam is drawn after the fiber`);
        if (type === 'pulsedlaser') assert.ok(animatedAfter > 0, 'and animated');
      }
    }
  }
});

test('weak light the depth limit cuts off is reported too', () => {
  // Codex's finding on ebeeca4: in the 99 % cavity the default budget is
  // never reached, but each chain stops at the depth limit with power left.
  const left = createElement('mirror', 300, 0), right = createElement('mirror', 340, 0);
  left.params.refl = 99;
  right.params.refl = 99;
  const m = meter(500, 0);
  const laser = lineLaser(0, 0, 0.1);
  const elements = [laser, nd(200, 0.01), left, right, m];
  traceScene(elements, []);
  const shortfall = weakLightShortfallFromLastTrace();
  assert.equal(shortfall.length, 1);
  assert.equal(shortfall[0].sourceId, laser.id);
  assert.ok(shortfall[0].fraction > 0 && shortfall[0].fraction < 0.01, `${shortfall[0].fraction}`);
  assert.equal(read(m, elements).weakLightIncomplete, true);
});

test('a source missing entirely from a mixed reading still flags it', () => {
  // Andrea's reproduction on ebeeca4: a second, strong source reaches the
  // same meter directly, so the reading exists and names only that source;
  // the weak one, cut off by the budget, left no trace in it at all.
  const m = meter(500, 0, 0);
  m.params.aperture = 60;
  const weak = lineLaser(0, 0, 0.1), strong = lineLaser(0, 20, 0.1);
  const lens = createElement('lens', 300, 0);
  lens.params.aperture = 10;
  const elements = [weak, strong, nd(200, 0.01), lens, m];
  traceScene(elements, []);
  close(read(m, elements).detectedPowerW, 0.101, 'both sources, full budget');
  assert.equal(read(m, elements).weakLightIncomplete, undefined);
  traceScene(elements, [], { measurementRayBudget: 0 });
  const reading = read(m, elements);
  close(reading.detectedPowerW, 0.1, 'the strong source alone');
  assert.deepEqual(reading.sourceFractions.map(f => f.sourceId), [strong.id]);
  assert.equal(reading.weakLightIncomplete, true, 'the meter says it may read low');
  const area = probePowerAt(400, 20, 5);
  assert.deepEqual(area.sourceFractions.map(f => f.sourceId), [strong.id]);
  assert.equal(area.weakLightIncomplete, true, 'and so does a probe on the strong beam alone');
});

test('weak light into a fiber never displaces a strong beam sharing it, whichever source comes first', () => {
  // Andrea's reproduction on 4668e01: the fiber re-emits one coupling per
  // emission key, and two CW sources at one wavelength and path length used
  // to share a key -- the weak continuation could replace the strong beam.
  const cable = {
    id: 'cable', kind: 'fiber', pts: [{ x: 400, y: 10 }, { x: 600, y: 10 }], width: 20,
    propagate: true, lossDbPerM: 0, outMode: 'diverge', na: 0.01,
  };
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
      const { drawables } = traceScene(elements, [cable]);
      const reading = read(m, elements);
      const what = `ND ${trans}, ${weakFirst ? 'weak' : 'strong'} source first`;
      close(reading.detectedPowerW, 0.1 + 0.1 * trans, what);
      assert.deepEqual(new Set(reading.sourceFractions.map(f => f.sourceId)), new Set([weak.id, strong.id]), what);
      // The strong beam's relaunch is drawn either way.
      assert.ok(drawables.some(d => (d.pts || []).some(p => p.x > 601)), `${what}: strong relaunch drawn`);
    }
  }
});
