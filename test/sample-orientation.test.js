import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry, getSize, getDirectManipulation, stageOffsetAt } from '../sketch/js/elements.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import { rotPt } from '../sketch/js/util.js';

// The specimen holders' baseline was redefined: what used to require rot=270
// to look "horizontal" (long/clear-aperture axis left-right, beam crossing
// top-to-bottom) is now the rot=0 default. This pins that redefinition
// directly, independent of any single physics test elsewhere.

test('sample and stage are wider than tall at rot 0 — the new horizontal baseline', () => {
  const sample = createElement('sample', 0, 0);
  const sampleSize = getSize(sample);
  assert.ok(sampleSize.w > sampleSize.h, `expected a wide bar, got ${sampleSize.w}x${sampleSize.h}`);

  const stage = createElement('stage', 0, 0);
  const stageSize = getSize(stage);
  assert.ok(stageSize.w > stageSize.h, `expected a wide bar, got ${stageSize.w}x${stageSize.h}`);
});

test('at rot 0 the specimen surface runs left-right and does not cross a standard left-to-right beam', () => {
  const laser = createElement('cwlaser', 0, 0);
  const sample = createElement('sample', 150, 0);
  sample.params.transmission = 0.5;
  const detector = createElement('detector', 300, 0);
  traceAll([laser, sample, detector]);
  // The beam sails straight through, unattenuated, because the surface is
  // parallel to it rather than crossing it.
  assert.ok(Math.abs(detectorReading(detector.id).signal - 1) < 1e-9,
    'a rot=0 specimen should not intercept a horizontal beam under the new baseline');
});

test('rotating 90° restores the familiar beam-crossing behavior', () => {
  const laser = createElement('cwlaser', 0, 0);
  const sample = createElement('sample', 150, 0);
  sample.rot = 90;
  sample.params.transmission = 0.5;
  const detector = createElement('detector', 300, 0);
  traceAll([laser, sample, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.5) < 1e-9,
    'a 90°-rotated specimen crosses a horizontal beam again');
});

test('the resize handles grip the aperture axis, which is now horizontal', () => {
  const sample = createElement('sample', 0, 0);
  const sampleDirect = getDirectManipulation(sample);
  assert.equal(sampleDirect.resize.x, 'aperture', 'dragging the side handles resizes the aperture');
  assert.equal(sampleDirect.resize.y, undefined);

  const stage = createElement('stage', 0, 0);
  const stageDirect = getDirectManipulation(stage);
  assert.equal(stageDirect.resize.x, 'aperture');
  assert.equal(stageDirect.resize.y, undefined);
});

test('XY scan stays parallel to the long axis at any placement angle', () => {
  // stageOffsetAt returns the motion purely in local coordinates; the
  // long axis is local x by construction (see the redefined baseline
  // above), so an XY sweep is pure local-x motion by definition. What this
  // test pins is that rotating that local offset into world space (the
  // fix applied in canvas.js's animatedStageElement) keeps it aligned with
  // the specimen's own — now rotated — long axis, not the old world axes.
  const p = { pzMode: 'xy', pzTravelXY: 10, pzFreqXY: 1 };
  const local = stageOffsetAt(p, 0); // {x: -5, y: 0}
  assert.equal(local.y, 0, 'XY motion is pure local-x, i.e. along the long axis by construction');

  for (const rot of [0, 45, 90, 180, 270]) {
    const world = rotPt(local.x, local.y, rot);
    // The long axis direction at this rotation, per toWorld's own convention.
    const axis = rotPt(1, 0, rot);
    const alongAxis = Math.abs(world.x * axis.y - world.y * axis.x) < 1e-9; // cross product ~ 0 => parallel
    assert.ok(alongAxis, `world offset should stay parallel to the rotated long axis at rot=${rot}`);
  }
});
