import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';

function normalized(type, duty) {
  const element = createElement(type, 100, 0);
  Object.assign(element.params, { modulate: true, chopDuty: duty });
  return parseSketch(JSON.stringify({ elements: [element] }), registry).elements[0];
}

test('1–99% chopper duty agrees between saved controls, wheel opening and CW transmission', () => {
  const source = createElement('cwlaser', 0, 0);
  source.params.beamMode = 'line';
  const detector = createElement('detector', 200, 0);
  for (const duty of [0.01, 0.03, 0.05, 0.5, 0.95, 0.97, 0.99]) {
    const chopper = normalized('chopper', duty);
    assert.equal(chopper.params.chopDuty, duty);
    assert.equal(registry.chopper.surfaces(chopper)[0].data.duty, duty);
    const svg = registry.chopper.svg(chopper);
    const endpoint = svg.match(/ A [\d.]+ [\d.]+ 0 0 1 ([\d.e+-]+),([\d.e+-]+) Z/);
    assert.ok(endpoint, 'wheel blade arc is present');
    const bladeAngle = Math.atan2(Number(endpoint[2]), Number(endpoint[1])) * 180 / Math.PI;
    assert.ok(Math.abs((60 - bladeAngle) / 60 - duty) < 1e-10,
      `drawn opening matches ${duty}`);
    traceScene([source, chopper, detector]);
    assert.ok(Math.abs(detectorReading(detector.id).signal - duty) < 1e-10,
      `time-averaged transmission matches ${duty}`);
  }
});

test('AOM low/high duty boundaries survive save and normalize safely outside the range', () => {
  for (const [input, expected] of [[0.01, 0.01], [0.03, 0.03], [0.99, 0.99], [-1, 0.01], [2, 0.99]]) {
    for (const type of ['aom', 'chopper']) {
      const element = normalized(type, input);
      assert.equal(element.params.chopDuty, expected);
      const data = registry[type].surfaces(element)[0].data;
      assert.equal((type === 'aom' ? data.gate : data).duty, expected);
      assert.doesNotMatch(registry[type].svg(element), /NaN|Infinity/);
    }
  }
});
