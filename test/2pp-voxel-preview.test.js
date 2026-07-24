import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, stageOffsetAt, voxelDepthFactor } from '../sketch/js/elements.js';
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

test('voxel writing only ever fires for a resin sample, regardless of the voxelPreview flag', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.temporalMode = 'pulsed';
  const stage = createElement('stage', 150, 0);
  Object.assign(stage.params, { containsSample: true, voxelPreview: true });

  for (const sampleKind of ['generic', 'fluorescent', 'nonlinear', 'opaque']) {
    stage.params.sampleKind = sampleKind;
    assert.equal(traceScene([laser, stage]).writeHits.length, 0, `${sampleKind} must not write voxels`);
  }
  stage.params.sampleKind = 'resin';
  assert.equal(traceScene([laser, stage]).writeHits.length, 1);
});

test('any installed sample reports an excitation hit for the signal-spot indicator, CW or pulsed', () => {
  const laser = createElement('laser', 0, 0);
  const stage = createElement('stage', 150, 0);
  Object.assign(stage.params, { containsSample: true, sampleKind: 'fluorescent', mode: 'fluor' });

  const cw = traceScene([laser, stage]);
  assert.equal(cw.signalHits.length, 1);
  assert.equal(cw.signalHits[0].stageId, stage.id);
  closeTo(cw.signalHits[0].x, stage.x);

  stage.params.containsSample = false;
  assert.equal(traceScene([laser, stage]).signalHits.length, 0);
});

test('an opaque (non-transmitting) sample still reports its excitation hit', () => {
  const laser = createElement('laser', 0, 0);
  const stage = createElement('stage', 150, 0);
  Object.assign(stage.params, { containsSample: true, sampleKind: 'opaque', transmitExc: false });
  const scene = traceScene([laser, stage]);
  assert.equal(scene.signalHits.length, 1);
  assert.equal(scene.signalHits[0].stageId, stage.id);
});

test('the piezo stage moves independently along X (depth) and Y (transverse)', () => {
  const both = { stageMoveX: true, stageTravelX: 20, stageFrequencyX: 1, stageMoveY: true, stageTravelY: 20, stageFrequencyY: 1 };
  closeTo(stageOffsetAt(both, 0).x, -10);
  closeTo(stageOffsetAt(both, 0).y, -10);
  closeTo(stageOffsetAt(both, 0.5).x, 10);
  closeTo(stageOffsetAt(both, 0.5).y, 10);

  const xOnly = { ...both, stageMoveY: false };
  closeTo(stageOffsetAt(xOnly, 0).x, -10);
  closeTo(stageOffsetAt(xOnly, 0).y, 0);

  const yOnly = { ...both, stageMoveX: false };
  closeTo(stageOffsetAt(yOnly, 0).x, 0);
  closeTo(stageOffsetAt(yOnly, 0).y, -10);

  const neither = { ...both, stageMoveX: false, stageMoveY: false };
  closeTo(stageOffsetAt(neither, 0.5).x, 0);
  closeTo(stageOffsetAt(neither, 0.5).y, 0);
});

test('voxel depth factor grows from 0 at focus to 1 at the edge of the configured axial travel', () => {
  closeTo(voxelDepthFactor(0, 20), 0);
  closeTo(voxelDepthFactor(5, 20), 0.5);
  closeTo(voxelDepthFactor(10, 20), 1);
  closeTo(voxelDepthFactor(50, 20), 1);
  closeTo(voxelDepthFactor(-5, 20), 0.5);
});
