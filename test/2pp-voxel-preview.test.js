import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, stageYOffsetAt } from '../sketch/js/elements.js';
import { pulseArrivalsAtPath } from '../sketch/js/pulses.js';
import { traceScene } from '../sketch/js/raytrace.js';

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
};

const track = {
  pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
  opls: [0, 100],
  pulse: { sourceId: 'pulse', repRateMHz: 100, pulseWidthFs: 100, phaseNs: 0 },
};

test('2PP preview arrivals use the same physical and schematic clocks as pulse packets', () => {
  const physical = pulseArrivalsAtPath(track, 0, 30, 50, { mode: 'physical' });
  assert.equal(physical.length, 3);
  closeTo(physical[0].timeNs, 50 / 299.792458);
  closeTo(physical[1].timeNs - physical[0].timeNs, 10);

  const schematic = pulseArrivalsAtPath(track, 0, 30, 50, { mode: 'schematic' });
  assert.equal(schematic.length, 3);
  closeTo(schematic[0].timeNs, 50 / 14);
  closeTo(schematic[1].timeNs - schematic[0].timeNs, 10);
  assert.deepEqual(pulseArrivalsAtPath(track, 0, 30, 101), []);
});

test('a gated-off pulse train leaves no 2PP arrival events', () => {
  const gated = {
    ...track,
    pulse: {
      ...track.pulse,
      gates: [{ opl: 0, frequencyMHz: 100, duty: 0.5, phaseNs: 5 }],
    },
  };
  assert.deepEqual(pulseArrivalsAtPath(gated, 0, 30, 50, { mode: 'schematic' }), []);
});

test('a pulsed resin stage exposes one write location while an empty holder does not', () => {
  const laser = createElement('laser', 0, 0);
  const stage = createElement('stage', 150, 0);
  Object.assign(stage.params, { containsSample: true, sampleKind: 'resin', voxelPreview: true });
  assert.equal(traceScene([laser, stage]).writeHits.length, 0, 'CW light cannot create a 2PP preview mark');

  laser.params.temporalMode = 'pulsed';
  const scene = traceScene([laser, stage]);
  assert.equal(scene.writeHits.length, 1);
  assert.equal(scene.writeHits[0].stageId, stage.id);
  closeTo(scene.writeHits[0].x, stage.x);
  closeTo(scene.writeHits[0].y, stage.y);

  stage.params.containsSample = false;
  assert.equal(traceScene([laser, stage]).writeHits.length, 0);
});

test('2D stage scan is a bounded triangular Y translation', () => {
  const params = { voxelPreview: true, stageMoveY: true, stageTravelY: 20, stageFrequencyHz: 1 };
  closeTo(stageYOffsetAt(params, 0), -10);
  closeTo(stageYOffsetAt(params, 0.25), 0);
  closeTo(stageYOffsetAt(params, 0.5), 10);
  closeTo(stageYOffsetAt(params, 0.75), 0);
  closeTo(stageYOffsetAt({ ...params, voxelPreview: false }, 0.5), 0);
});
