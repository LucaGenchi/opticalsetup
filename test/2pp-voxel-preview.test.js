import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, stageOffsetAt, stageSampleLabelSVG, voxelDepthFactor } from '../sketch/js/elements.js';
import { pulseArrivalsAtPath } from '../sketch/js/pulses.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { rotPt } from '../sketch/js/util.js';

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

test('a pulsed resin stage exposes one write location, and only for resin', () => {
  const laser = createElement('laser', 0, 0);
  const stage = createElement('stage', 150, 0);
  stage.rot = 90; // the specimen surface is horizontal at rot 0; a left-to-right beam needs it rotated to cross it
  Object.assign(stage.params, { sampleKind: 'resin', voxelPreview: true });
  assert.equal(traceScene([laser, stage]).writeHits.length, 0, 'CW light cannot create a 2PP preview mark');

  laser.params.temporalMode = 'pulsed';
  const scene = traceScene([laser, stage]);
  assert.equal(scene.writeHits.length, 1);
  assert.equal(scene.writeHits[0].stageId, stage.id);
  closeTo(scene.writeHits[0].x, stage.x);
  closeTo(scene.writeHits[0].y, stage.y);

  // The holder always carries a specimen now, so "no marks" is expressed by
  // the material, not by an installed/empty switch.
  stage.params.sampleKind = 'generic';
  assert.equal(traceScene([laser, stage]).writeHits.length, 0);
});

test('voxel writing only ever fires for a resin sample, regardless of the voxelPreview flag', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.temporalMode = 'pulsed';
  const stage = createElement('stage', 150, 0);
  stage.rot = 90; // the specimen surface is horizontal at rot 0; a left-to-right beam needs it rotated to cross it
  Object.assign(stage.params, { voxelPreview: true });

  for (const sampleKind of ['generic', 'fluorescent', 'nonlinear', 'opaque']) {
    stage.params.sampleKind = sampleKind;
    assert.equal(traceScene([laser, stage]).writeHits.length, 0, `${sampleKind} must not write voxels`);
  }
  stage.params.sampleKind = 'resin';
  assert.equal(traceScene([laser, stage]).writeHits.length, 1);
});

test('a mounted sample reports an excitation hit for the signal-spot indicator, CW or pulsed', () => {
  const laser = createElement('laser', 0, 0);
  const stage = createElement('stage', 150, 0);
  stage.rot = 90; // the specimen surface is horizontal at rot 0; a left-to-right beam needs it rotated to cross it
  Object.assign(stage.params, { sampleKind: 'fluorescent', mode: 'fluor' });

  const cw = traceScene([laser, stage]);
  assert.equal(cw.signalHits.length, 1);
  assert.equal(cw.signalHits[0].stageId, stage.id);
  closeTo(cw.signalHits[0].x, stage.x);

  laser.params.temporalMode = 'pulsed';
  const pulsed = traceScene([laser, stage]);
  assert.equal(pulsed.signalHits.length, 1, 'a pulsed source reports the same single hit');
  closeTo(pulsed.signalHits[0].x, stage.x);
});

test('an opaque (non-transmitting) sample still reports its excitation hit', () => {
  const laser = createElement('laser', 0, 0);
  const stage = createElement('stage', 150, 0);
  Object.assign(stage.params, { sampleKind: 'opaque', transmitExc: false });
  const scene = traceScene([laser, stage]);
  assert.equal(scene.signalHits.length, 1);
  assert.equal(scene.signalHits[0].stageId, stage.id);
});

test('the signal-spot indicator reports the real generated wavelength, not a fixed per-material color', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.wavelength = 800;
  const stage = createElement('stage', 150, 0);
  stage.rot = 90; // the specimen surface is horizontal at rot 0; a left-to-right beam needs it rotated to cross it

  Object.assign(stage.params, { sampleKind: 'fluorescent', mode: 'fluor', fluorWl: 520 });
  closeTo(traceScene([laser, stage]).signalHits[0].wl, 520);

  Object.assign(stage.params, { sampleKind: 'nonlinear', mode: 'shg' });
  closeTo(traceScene([laser, stage]).signalHits[0].wl, 400); // 800 / 2

  stage.params.mode = 'thg';
  closeTo(traceScene([laser, stage]).signalHits[0].wl, 800 / 3);

  Object.assign(stage.params, { mode: 'cars', carsWl: 660 });
  closeTo(traceScene([laser, stage]).signalHits[0].wl, 660);

  // a plain attenuating (non-signal-generating) surface reports no wavelength
  Object.assign(stage.params, { sampleKind: 'generic', mode: 'none' });
  assert.equal(traceScene([laser, stage]).signalHits[0].wl, undefined);
});

test('the piezo stage is static by default and only moves when a scan pattern is chosen', () => {
  assert.deepEqual(stageOffsetAt({}, 5), { x: 0, y: 0 });
  assert.deepEqual(stageOffsetAt({ pzMode: 'static', pzTravelXY: 20, pzFreqXY: 1 }, 5), { x: 0, y: 0 });
});

// The specimen is horizontal at rot 0 now (its clear-aperture/long axis is
// local x, the beam crosses it along local y), so XY (long-axis) motion maps
// to the local-x offset and Z (depth) maps to local-y — see stageOffsetAt.
test('XY mode moves only the long-axis (local x) offset, bidirectionally', () => {
  const p = { pzMode: 'xy', pzTravelXY: 20, pzFreqXY: 1 };
  closeTo(stageOffsetAt(p, 0).y, 0);
  closeTo(stageOffsetAt(p, 0).x, -10);
  closeTo(stageOffsetAt(p, 0.25).x, 0);
  closeTo(stageOffsetAt(p, 0.5).x, 10, 1e-6); // full sweep the other way
  closeTo(stageOffsetAt(p, 0.75).x, 0);
});

test('Z mode moves only the depth (local y) offset, bidirectionally', () => {
  const p = { pzMode: 'z', pzTravelZ: 20, pzFreqZ: 1 };
  closeTo(stageOffsetAt(p, 0).x, 0);
  closeTo(stageOffsetAt(p, 0).y, -10);
  closeTo(stageOffsetAt(p, 0.5).y, 10, 1e-6);
});

test('sync mode rasters: XY sweeps continuously while Z steps once per completed sweep, bouncing at the ends', () => {
  const p = { pzMode: 'sync', pzTravelXY: 20, pzFreqXY: 1, pzTravelZ: 8, pzZSteps: 3 };
  // halfPeriod = 0.5s (one full XY sweep in one direction).
  // Z levels 0,1,2 map to offsets -4, 0, 4 (3 steps across an 8mm travel).
  closeTo(stageOffsetAt(p, 0.0).y, -4); // sweep 0: level 0
  closeTo(stageOffsetAt(p, 0.6).y, 0); // sweep 1: level 1
  closeTo(stageOffsetAt(p, 1.1).y, 4); // sweep 2: level 2
  closeTo(stageOffsetAt(p, 1.6).y, 0); // sweep 3: bounces back to level 1
  closeTo(stageOffsetAt(p, 2.1).y, -4); // sweep 4: back to level 0
  // XY itself still sweeps left-to-right then right-to-left within each pass
  closeTo(stageOffsetAt(p, 0.0).x, -10);
  closeTo(stageOffsetAt(p, 0.5).x, 10, 1e-6);
  closeTo(stageOffsetAt(p, 1.0).x, -10, 1e-5);
});

test('the piezo motion offset rotates with the element, so XY stays parallel to the rotated long axis', () => {
  // Regression: the offset used to be added straight into world x/y, so
  // rotating the stage left its scan direction pointing at the old world
  // axes instead of following the specimen's own (now rotated) long axis.
  const p = { pzMode: 'xy', pzTravelXY: 20, pzFreqXY: 1 };
  const local = stageOffsetAt(p, 0); // {x:-10, y:0} — pure long-axis motion
  for (const rot of [0, 90, 180, 270, 37]) {
    const world = rotPt(local.x, local.y, rot);
    closeTo(Math.hypot(world.x, world.y), 10, 1e-9, `rotation must preserve the travel distance at rot=${rot}`);
  }
  // At rot=90 the (local x) long axis points along world -y.
  const world90 = rotPt(local.x, local.y, 90);
  closeTo(world90.x, 0);
  closeTo(world90.y, -10);
});

test('voxel depth factor grows from 0 at focus to 1 at the edge of the configured axial travel', () => {
  closeTo(voxelDepthFactor(0, 20), 0);
  closeTo(voxelDepthFactor(5, 20), 0.5);
  closeTo(voxelDepthFactor(10, 20), 1);
  closeTo(voxelDepthFactor(50, 20), 1);
  closeTo(voxelDepthFactor(-5, 20), 0.5);
});

test('the material label is world-upright (no rotate transform) and respects the show/hide toggle', () => {
  const stage = createElement('stage', 100, 50);
  stage.rot = 137;
  stage.params.sampleKind = 'resin';
  const svg = stageSampleLabelSVG(stage);
  assert.match(svg, /Resin/);
  assert.doesNotMatch(svg, /rotate/);

  stage.params.showMaterialLabel = false;
  assert.equal(stageSampleLabelSVG(stage), '');

  stage.params.showMaterialLabel = true;
  assert.match(stageSampleLabelSVG(stage), /Resin/, 'the toggle is the only thing that hides it');
});

test('the label position accounts for the stage rotating its bounding box', () => {
  const upright = createElement('stage', 0, 0);
  const svgUpright = stageSampleLabelSVG(upright);

  const rotated = createElement('stage', 0, 0);
  rotated.rot = 90;
  const svgRotated = stageSampleLabelSVG(rotated);

  assert.notEqual(svgUpright, svgRotated);
});
