import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registry } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene, objectivePupilFill } from '../sketch/js/raytrace.js';
import { objectiveScanPlanes, scanRelayMatrix, tracedPlaneCrossings } from '../sketch/js/scan-relay.js';
import { programmableMaskFrame } from '../sketch/js/programmable-mask.js';
import { sampleArrivalDetailReading } from '../sketch/js/sample-arrival-detail.js';
import { toWorld } from '../sketch/js/util.js';

const raw = readFileSync(new URL('../collections/2pp/setups/ouyang-2023.json', import.meta.url), 'utf8');
const load = () => parseSketch(raw, registry);
const by = (scene, id) => scene.elements.find(element => element.id === `ouyang-${id}`);
const trace = scene => traceScene(scene.elements, scene.beams);
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const span = values => Math.max(...values) - Math.min(...values);
const center = values => (Math.max(...values) + Math.min(...values)) / 2;

function fullAperture(scene) {
  const laser = by(scene, 'laser'), half = laser.params.beamWidth / 2;
  const planes = objectiveScanPlanes(by(scene, 'objective'));
  return Array.from({ length: 25 }, (_, i) => {
    const probe = structuredClone(scene), source = by(probe, 'laser');
    source.y += -half + 2 * half * i / 24;
    source.params.beamMode = 'line';
    const result = trace(probe);
    return {
      result,
      pupil: tracedPlaneCrossings(result.drawables, { center: planes.bfp, axis: planes.axis }),
    };
  });
}

test('Ouyang retains reported focal lengths and uses the actual DMD face and true BFP', () => {
  const scene = load(), dmd = by(scene, 'dmd');
  const face = toWorld(dmd, -9, 0), l3 = by(scene, 'l3'), l4 = by(scene, 'l4');
  const planes = objectiveScanPlanes(by(scene, 'objective'));
  near(by(scene, 'grating').rot, 49.43);
  assert.deepEqual(['l1', 'l2', 'l3', 'l4'].map(id => by(scene, id).params.f), [225, 250, 150, 200]);
  near(distance(by(scene, 'grating'), by(scene, 'fold-a')) + distance(by(scene, 'fold-a'), by(scene, 'l1')), 225);
  near(distance(by(scene, 'l1'), by(scene, 'fold-b')) + distance(by(scene, 'fold-b'), by(scene, 'fold-c'))
    + distance(by(scene, 'fold-c'), by(scene, 'l2')), 475);
  near(distance(by(scene, 'l2'), by(scene, 'fold-d')) + distance(by(scene, 'fold-d'), by(scene, 'fold-e'))
    + distance(by(scene, 'fold-e'), face), 250);
  near(distance(face, l3), 150);
  near(distance(l3, by(scene, 'filter')), 150);
  near(distance(l3, l4), 350);
  const q = distance(l4, by(scene, 'dichroic')) + distance(by(scene, 'dichroic'), planes.bfp);
  near(q, 200);
  assert.equal(planes.stopClamped, false);
  near(distance(planes.bfp, planes.stop), 0);
  near(distance(planes.focus, by(scene, 'stage')), 0);
  const matrix = scanRelayMatrix({ scannerToScanMm: distance(face, l3), scanFocalMm: 150,
    scanToTubeMm: distance(l3, l4), tubeFocalMm: 200, tubeToPupilMm: q });
  near(matrix.A, -4 / 3); near(matrix.B, 0); near(matrix.C, 0); near(matrix.D, -0.75);
  assert.ok(Math.abs(distance(dmd, l3) - 150) > 1, 'the device body centre is not the active optical plane');
});

test('Ouyang focuses every admitted source sample and keeps each steered order centred in the pupil', () => {
  for (const scan of [-1, 0, 1]) {
    const scene = load(); by(scene, 'dmd').params.scanAngle = scan;
    const probes = fullAperture(scene);
    for (const probe of probes) {
      assert.equal(probe.result.writeHits.length, 3);
      assert.equal(probe.pupil.length, 3, 'all three routes cross the true objective pupil');
      assert.ok(probe.pupil.every(hit => Math.abs(hit.heightMm) < 1.6), 'the complete finite beam fits the 6.5 mm pupil radius');
      for (const hit of probe.result.writeHits) near(hit.y, by(scene, 'stage').y);
    }
    for (let order = 0; order < 3; order++) {
      near(span(probes.map(p => p.result.writeHits[order].x)), 0);
      near(center(probes.map(p => p.pupil[order].heightMm)), 0);
    }
    const result = trace(scene), detail = sampleArrivalDetailReading('ouyang-stage');
    assert.equal(result.signalHits.length, 75);
    assert.equal(detail.channels.length, 3);
    assert.ok(result.writeHits.every(hit => hit.arrivalSamples === 25 && hit.spreadMm < 1e-8));
    assert.ok(detail.channels.every(channel => channel.sampleCount === 25 && channel.maxUm - channel.minUm < 1e-5));
    assert.equal(objectivePupilFill('ouyang-objective').transmitted, 1);
  }
  const result = trace(load());
  const positions = result.writeHits.map(h => h.x - 950).sort((a, b) => a - b);
  near(positions[0], -5 * 0.75 * Math.tan(2 * Math.PI / 180));
  near(positions[1], 0); near(positions[2], -positions[0]);
});

test('Ouyang source, geometric-order and Fourier-filter controls affect actual arrivals', () => {
  const scene = load(), source = by(scene, 'laser'), dmd = by(scene, 'dmd');
  const baseline = trace(scene).writeHits;
  source.params.avgPowerW = 2;
  assert.deepEqual(trace(scene).writeHits, baseline, 'positive power is metadata, not a cure model');
  for (const change of [{ enabled: false }, { enabled: true, avgPowerW: 0 }]) {
    Object.assign(source.params, change);
    assert.equal(trace(scene).writeHits.length, 0);
    assert.equal(sampleArrivalDetailReading('ouyang-stage').channels.length, 0);
  }
  Object.assign(source.params, { enabled: true, avgPowerW: 4 });
  dmd.params.focusCount = 1;
  const single = trace(scene); assert.equal(single.writeHits.length, 1); assert.equal(single.signalHits.length, 25);
  dmd.params.focusCount = 8;
  const eight = trace(scene); assert.equal(eight.writeHits.length, 8); assert.equal(eight.signalHits.length, 200);
  near(eight.writeHits.reduce((sum, hit) => sum + hit.intensity, 0), 0.82);
  dmd.params.focusCount = 3; dmd.params.scanAngle = 1;
  const shifted = trace(scene).writeHits.map(hit => hit.x - 950).sort((a, b) => a - b);
  near(shifted[1], -5 * 0.75 * Math.tan(Math.PI / 180));
  dmd.params.scanAngle = 0; by(scene, 'filter').params.gap = 4;
  const filtered = trace(scene);
  assert.equal(filtered.writeHits.length, 1); assert.equal(filtered.signalHits.length, 25);
  near(filtered.writeHits[0].x, 950); near(filtered.writeHits[0].intensity, 0.82 / 3);
});

test('Ouyang frame data is genuinely 2D and remains separate from configured geometric orders', () => {
  const scene = load(), dmd = by(scene, 'dmd');
  const initial = programmableMaskFrame(dmd.params, 'dmd', 0);
  assert.equal(initial.mode, 'binary'); assert.equal(initial.grid.length, 16);
  assert.ok(initial.grid.every(row => row.length === 16));
  assert.ok(initial.grid.some(row => new Set(row).size > 1));
  dmd.params.focusCount = 8; dmd.params.scanAngle = 1;
  assert.deepEqual(programmableMaskFrame(dmd.params, 'dmd', 0), initial, 'order controls never claim to synthesize a CGH');
  Object.assign(dmd.params, { focusCount: 3, scanAngle: 0, maskFrame: 1 });
  assert.notDeepEqual(programmableMaskFrame(dmd.params, 'dmd', 0).grid, initial.grid);
  assert.equal(trace(scene).signalHits.length, 39, 'the changed sampled column gates real aperture rays');
  Object.assign(dmd.params, { maskPattern: 'uniform', maskLevel: 0 });
  assert.equal(trace(scene).writeHits.length, 0);
});

test('Ouyang finite apertures and physical defocus cannot retain a fictitious sharp focus', () => {
  let scene = load(); by(scene, 'objective').params.na = 0.1;
  const clipped = trace(scene);
  assert.ok(clipped.signalHits.length > 0 && clipped.signalHits.length < 75);
  assert.ok(clipped.writeHits.every(hit => hit.spreadMm < 1e-8), 'only genuinely admitted rays reach the focus');
  scene = load(); by(scene, 'dmd').params.scanAngle = 20;
  const blocked = trace(scene); assert.equal(blocked.writeHits.length, 0);
  assert.ok(blocked.drawables.every(d => (d.pts || []).every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
  scene = load(); by(scene, 'stage').y += 0.1;
  const defocused = trace(scene);
  assert.equal(defocused.writeHits.length, 3);
  assert.ok(defocused.writeHits.every(hit => hit.spreadMm > 0.05 && hit.arrivalSamples === 25));
  for (const hit of defocused.writeHits) {
    assert.ok(defocused.signalHits.some(actual => distance(hit, actual) < 1e-8), 'the group mark is an actual sampled arrival');
  }
  scene = load(); by(scene, 'l4').x += 10;
  assert.ok(trace(scene).writeHits.every(hit => hit.spreadMm > 0.003), 'incorrect relay separation produces resolved geometric spread');
});

test('Ouyang saves the central-wavelength scope and shared controls without a post-resin fan', () => {
  const scene = load(), source = by(scene, 'laser'), stage = by(scene, 'stage');
  assert.equal(source.params.transformLimited, false); assert.equal(source.params.bandwidth, 0);
  assert.equal(source.params.pulseWidthFs, 100); assert.equal(source.params.repRateMHz, 0.001);
  assert.equal(stage.params.transmitExc, true); assert.equal(stage.params.transmission, 0);
  assert.equal(stage.params.showArrivalDetail, true);
  const baseline = trace(scene);
  assert.ok(baseline.drawables.filter(d => d.type === 'path').every(d => d.pts.every(p => p.y <= stage.y + 1e-8)));
  by(scene, 'dmd').params.maskFrame = 1; by(scene, 'dmd').params.scanAngle = 1;
  by(scene, 'filter').params.gap = 4;
  const restored = parseSketch(JSON.stringify(scene), registry);
  assert.deepEqual(restored, scene);
  assert.deepEqual(trace(restored), trace(scene));
});
