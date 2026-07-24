import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, stageOffsetAt, stageSampleLabelSVG, voxelDepthFactor } from '../sketch/js/elements.js';
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

test('the signal-spot indicator reports the real generated wavelength, not a fixed per-material color', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.wavelength = 800;
  const stage = createElement('stage', 150, 0);

  Object.assign(stage.params, { containsSample: true, sampleKind: 'fluorescent', mode: 'fluor', fluorWl: 520 });
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

test('XY mode moves only the transverse (Y) axis, bidirectionally', () => {
  const p = { pzMode: 'xy', pzTravelXY: 20, pzFreqXY: 1 };
  closeTo(stageOffsetAt(p, 0).x, 0);
  closeTo(stageOffsetAt(p, 0).y, -10);
  closeTo(stageOffsetAt(p, 0.25).y, 0);
  closeTo(stageOffsetAt(p, 0.5).y, 10, 1e-6); // full sweep the other way
  closeTo(stageOffsetAt(p, 0.75).y, 0);
});

test('Z mode moves only the depth (X) axis, bidirectionally', () => {
  const p = { pzMode: 'z', pzTravelZ: 20, pzFreqZ: 1 };
  closeTo(stageOffsetAt(p, 0).y, 0);
  closeTo(stageOffsetAt(p, 0).x, -10);
  closeTo(stageOffsetAt(p, 0.5).x, 10, 1e-6);
});

test('sync mode rasters: XY sweeps continuously while Z steps once per completed sweep, bouncing at the ends', () => {
  const p = { pzMode: 'sync', pzTravelXY: 20, pzFreqXY: 1, pzTravelZ: 8, pzZSteps: 3 };
  // halfPeriod = 0.5s (one full XY sweep in one direction).
  // Z levels 0,1,2 map to offsets -4, 0, 4 (3 steps across an 8mm travel).
  closeTo(stageOffsetAt(p, 0.0).x, -4); // sweep 0: level 0
  closeTo(stageOffsetAt(p, 0.6).x, 0); // sweep 1: level 1
  closeTo(stageOffsetAt(p, 1.1).x, 4); // sweep 2: level 2
  closeTo(stageOffsetAt(p, 1.6).x, 0); // sweep 3: bounces back to level 1
  closeTo(stageOffsetAt(p, 2.1).x, -4); // sweep 4: back to level 0
  // XY itself still sweeps left-to-right then right-to-left within each pass
  closeTo(stageOffsetAt(p, 0.0).y, -10);
  closeTo(stageOffsetAt(p, 0.5).y, 10, 1e-6);
  closeTo(stageOffsetAt(p, 1.0).y, -10, 1e-5);
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
  stage.params.containsSample = true;
  stage.params.sampleKind = 'resin';
  const svg = stageSampleLabelSVG(stage);
  assert.match(svg, /Resin/);
  assert.doesNotMatch(svg, /rotate/);

  stage.params.showMaterialLabel = false;
  assert.equal(stageSampleLabelSVG(stage), '');

  stage.params.showMaterialLabel = true;
  stage.params.containsSample = false;
  assert.equal(stageSampleLabelSVG(stage), '', 'no label without an installed sample');
});

test('the label position accounts for the stage rotating its bounding box', () => {
  const upright = createElement('stage', 0, 0);
  upright.params.containsSample = true;
  const svgUpright = stageSampleLabelSVG(upright);

  const rotated = createElement('stage', 0, 0);
  rotated.rot = 90;
  rotated.params.containsSample = true;
  const svgRotated = stageSampleLabelSVG(rotated);

  assert.notEqual(svgUpright, svgRotated);
});
