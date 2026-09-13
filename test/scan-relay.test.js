import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from '../sketch/js/elements.js';
import { traceScene } from '../sketch/js/raytrace.js';
import {
  composeParaxial, inspectScanRelay, objectiveScanPlanes, paraxialTrain,
  scanRelayMatrix, tracedPlaneCrossings, transferParaxialRay,
} from '../sketch/js/scan-relay.js';

const close = (actual, expected, tolerance = 1e-8) => assert.ok(
  Math.abs(actual - expected) < tolerance, `${actual} should be ${expected} within ${tolerance}`,
);
const geometry = {
  scannerToScanMm: 50, scanFocalMm: 50, scanToTubeMm: 150,
  tubeFocalMm: 100, tubeToPupilMm: 100,
};
const conditions = { objectiveFocalMm: 10, inputBeamRadiusMm: 2, pupilRadiusMm: 6.5 };

test('a complete 4f relay images the scanner pupil and converts angle into focus displacement', () => {
  const matrix = scanRelayMatrix(geometry);
  for (const [key, expected] of Object.entries({ A: -2, B: 0, C: 0, D: -0.5 })) close(matrix[key], expected);
  close(matrix.A * matrix.D - matrix.B * matrix.C, 1);
  const report = inspectScanRelay(matrix, conditions);
  assert.equal(report.pupilConjugate, true);
  assert.equal(report.collimatedOutput, true);
  for (const sample of report.samples) {
    close(sample.pupilCenterMm, 0);
    close(sample.pupilWidthMm, 8);
    close(sample.focusWidthMm, 0);
    close(sample.focusCenterMm, -5 * Math.tan(sample.opticalAngleDeg * Math.PI / 180));
    assert.equal(sample.fitsPupil, true);
  }
  assert.ok(report.samples[0].focusCenterMm > report.samples[2].focusCenterMm);
});

test('a correct final lens-to-BFP distance does not repair the wrong scanner distance', () => {
  const report = inspectScanRelay(scanRelayMatrix({ ...geometry, scannerToScanMm: 60 }), conditions);
  close(report.matrix.B, -20);
  assert.equal(report.pupilConjugate, false);
  assert.equal(report.collimatedOutput, true);
  close(report.samples[2].pupilCenterMm, -20 * Math.tan(0.4 * Math.PI / 180));
  close(report.samples[2].focusWidthMm, 0);
});

test('a misplaced tube lens can leave a stationary pupil while spoiling the geometric focus', () => {
  const report = inspectScanRelay(scanRelayMatrix({ ...geometry, scanToTubeMm: 170 }), conditions);
  assert.equal(report.pupilConjugate, true);
  assert.equal(report.collimatedOutput, false);
  close(report.matrix.C, 0.004);
  for (const sample of report.samples) {
    close(sample.pupilCenterMm, 0);
    close(sample.focusWidthMm, 0.16);
  }
});

test('finite pupil aperture rejects pupil walk even while the paraxial focus stays sharp', () => {
  const matrix = scanRelayMatrix({ ...geometry, tubeToPupilMm: 200 });
  const report = inspectScanRelay(matrix, { ...conditions, opticalAnglesDeg: [-4, 0, 4] });
  close(matrix.B, -50);
  assert.deepEqual(report.samples.map(sample => sample.fitsPupil), [false, true, false]);
  assert.ok(report.samples.every(sample => sample.focusWidthMm < 1e-8));
});

test('separate scanner pivots need an inter-pivot conjugacy as well as the final relay', () => {
  const finalRelay = scanRelayMatrix(geometry);
  const unrelayedFirstPivot = composeParaxial(finalRelay, paraxialTrain([{ distanceMm: 30 }]));
  close(unrelayedFirstPivot.B, -60);
  const interPivot = scanRelayMatrix({
    scannerToScanMm: 25, scanFocalMm: 25, scanToTubeMm: 50,
    tubeFocalMm: 25, tubeToPupilMm: 25,
  });
  const complete = composeParaxial(finalRelay, interPivot);
  close(complete.B, 0);
  close(complete.C, 0);
  close(complete.A, 2);
});

test('world objective planes respect rotation, working distance and the separately seated stop', () => {
  const objective = createElement('objective', 560, 679);
  objective.rot = 90;
  Object.assign(objective.params, { efl: 8, workingDistance: 0.6 });
  const planes = objectiveScanPlanes(objective);
  close(planes.bfp.x, 560);
  close(planes.bfp.y, 679.6);
  close(planes.lens.y, 687.6);
  close(planes.focus.y, 695.6);
  assert.equal(planes.stopClamped, false);
  Object.assign(objective.params, { efl: 2, workingDistance: 12 });
  const longWD = objectiveScanPlanes(objective);
  assert.equal(longWD.stopClamped, true);
  assert.notDeepEqual(longWD.bfp, longWD.stop);
});

test('invalid geometry fails explicitly instead of returning non-finite optical coordinates', () => {
  for (const value of [NaN, Infinity, -Infinity, '100', undefined]) {
    assert.throws(() => scanRelayMatrix({ ...geometry, scanToTubeMm: value }), /finite/);
  }
  assert.throws(() => scanRelayMatrix({ ...geometry, scanFocalMm: 0 }), /positive/);
  assert.throws(() => scanRelayMatrix({ ...geometry, tubeToPupilMm: -1 }), /nonnegative/);
  assert.throws(() => paraxialTrain([{ focalMm: Number.MIN_VALUE }]), /finite/);
  assert.throws(() => paraxialTrain([{ focalMm: 10, distanceMm: 10 }]), /exactly one/);
  assert.throws(() => transferParaxialRay({ A: 2, B: 0, C: 0, D: 1 }, Number.MAX_VALUE, 0), /finite/);
  assert.throws(() => inspectScanRelay(scanRelayMatrix(geometry), { ...conditions, opticalAnglesDeg: [90] }), /small/);
  assert.throws(() => inspectScanRelay(scanRelayMatrix(geometry), { ...conditions, opticalAnglesDeg: [] }), /samples/);
  assert.throws(() => tracedPlaneCrossings([], { center: { x: 0, y: 0 }, axis: { x: 0, y: 0 } }), /positive/);
});

// A real folded native scene: source travels downward to an actual galvo,
// then rightward through two native thin lenses and a native objective.
// Mechanical mirror angle is half the optical deflection angle.
function nativeBench({ opticalAngleDeg = 0, separationError = 0, pupilDistanceError = 0 } = {}) {
  // Nine isolated native line rays sample a 4 mm collimated beam. Native
  // beam-mode drawables only expose the two envelope edges as paths.
  const sources = Array.from({ length: 9 }, (_, index) => {
    const source = createElement('pulsedlaser', 98 + index / 2, -120);
    source.rot = 90;
    Object.assign(source.params, { beamMode: 'line', bandwidth: 0 });
    return source;
  });
  const scanner = createElement('galvo', 100, 0);
  scanner.rot = 135;
  Object.assign(scanner.params, { scanMode: 'static', commandAngle: opticalAngleDeg / 2, length: 30 });
  const scan = createElement('lens', 150, 0);
  Object.assign(scan.params, { f: 50, dia: 40 });
  const tube = createElement('lens', 300 + separationError, 0);
  Object.assign(tube.params, { f: 100, dia: 40 });
  const objective = createElement('objective', 399 + separationError + pupilDistanceError, 0);
  Object.assign(objective.params, { efl: 10, workingDistance: 5, frontAperture: 20, na: 0.65 });
  const planes = objectiveScanPlanes(objective);
  const stage = createElement('stage', planes.focus.x, 0);
  stage.rot = 90;
  Object.assign(stage.params, { specimenType: 'resin', voxelPreview: true, transmission: 0 });
  const scene = traceScene([...sources, scanner, scan, tube, objective, stage]);
  const at = center => tracedPlaneCrossings(scene.drawables, { center, axis: planes.axis });
  return { scene, pupil: at(planes.bfp), focus: at(planes.focus) };
}

function span(crossings) {
  assert.ok(crossings.length >= 3, 'a finite traced bundle must reach the measurement plane');
  const heights = crossings.map(point => point.heightMm);
  const low = Math.min(...heights), high = Math.max(...heights);
  return { center: (low + high) / 2, width: high - low, count: heights.length };
}

test('native galvo, relay, objective and resin trace stationary pupil with lateral focus motion', () => {
  let rayCount = null;
  for (const opticalAngleDeg of [-0.4, 0, 0.4]) {
    const result = nativeBench({ opticalAngleDeg });
    const pupil = span(result.pupil), focus = span(result.focus);
    close(pupil.center, 0);
    close(pupil.width, 8, 0.001); // finite-angle projection of the mirror footprint
    close(focus.center, -5 * Math.tan(opticalAngleDeg * Math.PI / 180));
    close(focus.width, 0);
    rayCount ??= focus.count;
    assert.equal(focus.count, rayCount, 'no sampled scan ray is lost');
    assert.ok(result.scene.writeHits.length > 0, 'the native resin receives the focus');
    for (const point of result.scene.drawables.flatMap(drawable => drawable.pts ?? [])) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    }
  }
});

test('native tracing independently detects focal broadening from relay separation error', () => {
  const result = nativeBench({ separationError: 20 });
  close(span(result.pupil).center, 0);
  close(span(result.focus).width, 0.16);
});

test('native finite objective clips a sufficiently displaced scan pupil', () => {
  for (const pupilDistanceError of [100, 130]) {
    const centered = nativeBench({ pupilDistanceError });
    const scanned = nativeBench({ opticalAngleDeg: 4, pupilDistanceError });
    close(span(scanned.pupil).center, -pupilDistanceError / 2 * Math.tan(4 * Math.PI / 180));
    assert.ok(span(scanned.focus).count < span(centered.focus).count);
    // In particular, an accepted ray must not walk out of the finite
    // equivalent lens and escape to the resin without refraction.
    close(span(scanned.focus).width, 0);
  }
});

test('two folded native scanner pivots each remain conjugate through an inter-pivot relay', () => {
  for (const [xAngle, yAngle] of [[0, 0], [-0.25, 0], [0.25, 0], [0, -0.25], [0, 0.25]]) {
    const sources = Array.from({ length: 9 }, (_, index) => {
      const source = createElement('pulsedlaser', 80, 148.8 + index * 0.3);
      Object.assign(source.params, { beamMode: 'line', bandwidth: 0 });
      return source;
    });
    const gx = createElement('galvo', 300, 150);
    gx.rot = 135;
    Object.assign(gx.params, { scanMode: 'static', commandAngle: xAngle });
    const between = createElement('telescope', 300, 230);
    between.rot = 90;
    Object.assign(between.params, { f1: 40, f2: 40, dia: 20 });
    const gy = createElement('galvo', 300, 310);
    gy.rot = 135;
    Object.assign(gy.params, { scanMode: 'static', commandAngle: yAngle });
    const finalRelay = createElement('telescope', 400, 310);
    Object.assign(finalRelay.params, { f1: 40, f2: 80, dia: 25.4 });
    const objective = createElement('objective', 532.5, 310);
    Object.assign(objective.params, { efl: 5, workingDistance: 1.5, na: 0.65, frontAperture: 8 });
    const planes = objectiveScanPlanes(objective);
    const result = traceScene([...sources, gx, between, gy, finalRelay, objective]);
    const at = center => span(tracedPlaneCrossings(result.drawables, { center, axis: planes.axis }));
    close(at(planes.bfp).center, 0);
    close(at(planes.focus).width, 0);
    assert.equal(at(planes.focus).count, 9);
    close(Math.abs(at(planes.focus).center), 2.5 * Math.tan(2 * Math.max(Math.abs(xAngle), Math.abs(yAngle)) * Math.PI / 180));
  }
});

test('plane measurements count a shared vertex once and ignore reverse or non-finite paths', () => {
  const plane = { center: { x: 0, y: 0 }, axis: { x: 1, y: 0 } };
  const drawables = [
    { type: 'path', pts: [{ x: -1, y: 2 }, { x: 0, y: 2 }] },
    { type: 'path', pts: [{ x: 0, y: 2 }, { x: 1, y: 2 }] },
    { type: 'path', pts: [{ x: 1, y: 3 }, { x: -1, y: 3 }] },
    { type: 'path', pts: [{ x: -1, y: NaN }, { x: 1, y: 2 }] },
  ];
  assert.deepEqual(tracedPlaneCrossings(drawables, plane), [{ x: 0, y: 2, heightMm: 2 }]);
});
