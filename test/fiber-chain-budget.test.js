// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceScene, detectorReading, weakLightShortfallFromLastTrace, WEAK_LIGHT_NOTE } from '../sketch/js/raytrace.js';

function chain(count) {
  const source = createElement('cwlaser', 0, 0);
  Object.assign(source.params, { beamMode: 'line', avgPowerW: 1 });
  const meter = createElement('powermeter', 150 + count * 130, 0);
  meter.params.aperture = 200;
  const fibers = Array.from({ length: count }, (_, i) => ({
    id: `fiber-${i}`, kind: 'fiber', pts: [{ x: 100 + i * 130, y: 0 }, { x: 200 + i * 130, y: 0 }],
    width: 20, propagate: true, inputNA: 0.22, groupIndex: 1, lossDbPerM: 0,
    out0: { mode: 'diverge', na: 0.01 }, out1: { mode: 'diverge', na: 0.01 },
  }));
  return { source, meter, fibers, elements: [source, meter] };
}

test('lossless fiber chains continue beyond the old three-hop cutoff', () => {
  for (const count of [1, 3, 4, 6]) {
    const { elements, meter, fibers } = chain(count);
    traceScene(elements, fibers);
    assert.ok(Math.abs(detectorReading(meter.id)?.signal - 1) < 1e-8, `${count} fibers deliver the incident power`);
    assert.deepEqual(weakLightShortfallFromLastTrace(), []);
  }
});

test('an exhausted fiber budget flags pending light and downstream readings', () => {
  const { source, meter, fibers, elements } = chain(4);
  // An independent beam reaches the meter, so its partial reading must carry
  // the caveat even when the unfinished fiber has not reached the sensor yet.
  const direct = createElement('cwlaser', 300, 50);
  direct.params.beamMode = 'line';
  elements.push(direct);
  traceScene(elements, fibers, { fiberEmissionBudget: 2 });
  const omitted = weakLightShortfallFromLastTrace();
  assert.ok(omitted.some(row => row.sourceId === source.id && row.fraction > 0));
  assert.equal(detectorReading(meter.id).weakLightIncomplete, true);
  assert.match(WEAK_LIGHT_NOTE, /fiber propagation budget/);
  traceScene(elements, fibers);
  assert.equal(detectorReading(meter.id).weakLightIncomplete, undefined, 'the next complete trace clears the caveat');
});
