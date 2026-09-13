import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registry, createElement, getVisualBounds } from '../sketch/js/elements.js';
import { traceScene, detectorReading, objectivePupilFill } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { composeParaxial, paraxialTrain, objectiveScanPlanes, tracedPlaneCrossings } from '../sketch/js/scan-relay.js';
import { sampleArrivalDetailReading } from '../sketch/js/sample-arrival-detail.js';
import '../sketch/js/detector-instruments.js';

const text = await readFile(new URL('../collections/2pp/setups/gittard-2011.json', import.meta.url), 'utf8');
const load = () => parseSketch(text, registry);
const get = (scene, id) => scene.elements.find(element => element.id === `gittard-${id}`);
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance,
  `${actual} differs from ${expected}`);
const staticScan = (scene, x = 0, y = 0) => {
  for (const [id, angle] of [['galvo-x', x], ['galvo-y', y]]) {
    Object.assign(get(scene, id).params, { scanMode: 'static', commandAngle: angle });
  }
};
const finiteTrace = result => {
  assert.ok(result.drawables.every(item => (item.pts || []).every(point => Number.isFinite(point.x) && Number.isFinite(point.y))));
  assert.ok(result.writeHits.every(hit => [hit.x, hit.y, hit.intensity, hit.spreadMm].every(Number.isFinite)));
};
const focused = (result, count, samples = 25) => {
  assert.equal(result.writeHits.length, count);
  assert.equal(new Set(result.writeHits.map(hit => hit.arrivalGroup)).size, count);
  for (const hit of result.writeHits) {
    assert.equal(hit.pulse.sourceId, 'gittard-laser');
    assert.equal(hit.arrivalSamples, samples, 'the whole sampled aperture reaches each physical order');
    assert.ok(hit.spreadMm < 1e-8, `unfocused order: ${hit.spreadMm} mm`);
    assert.ok(hit.intensity > 0);
    close(hit.x, 554);
  }
  finiteTrace(result);
};

test('Gittard uses all-aperture angular orders and a full Fourier/collimator train', () => {
  const scene = load(), slm = get(scene, 'slm');
  assert.equal(slm.params.maskMode, 'phase');
  assert.equal(slm.params.maskPattern, 'hologram');
  assert.equal(slm.params.holographicOrders, true);
  assert.deepEqual(slm.params.layers, [], 'the old f=500 focus-grid power must not survive the angular-order migration');
  const first = get(scene, 'fourier-lens'), collimator = get(scene, 'collimator');
  const upstream = paraxialTrain([
    { distanceMm: first.y - 140 }, { focalMm: first.params.f },
    { distanceMm: collimator.y - first.y }, { focalMm: collimator.params.f },
    { distanceMm: get(scene, 'galvo-x').y - collimator.y },
  ]);
  const pivot = paraxialTrain([{ distanceMm: 35 }, { focalMm: 35 }, { distanceMm: 70 }, { focalMm: 35 }, { distanceMm: 35 }]);
  const scan = get(scene, 'scan-lens'), tube = get(scene, 'tube-lens'), fold = get(scene, 'relay-fold');
  const planes = objectiveScanPlanes(get(scene, 'objective'));
  const final = paraxialTrain([
    { distanceMm: scan.y - get(scene, 'galvo-y').y }, { focalMm: scan.params.f },
    { distanceMm: fold.y - scan.y + tube.x - fold.x }, { focalMm: tube.params.f },
    { distanceMm: planes.bfp.x - tube.x },
  ]);
  for (const matrix of [upstream, pivot, final]) { close(matrix.B, 0); close(matrix.C, 0); }
  close(upstream.A, -1); close(pivot.A, -1); close(final.A, -2.5);
  close(planes.bfp.x, 550); close(planes.stop.x, planes.bfp.x); close(planes.focus.x, 554);
  const objective = paraxialTrain([{ distanceMm: 2 }, { focalMm: 2 }, { distanceMm: 2 }]);
  const complete = composeParaxial(objective, composeParaxial(final, composeParaxial(pivot, upstream)));
  close(complete.A, 0); close(complete.B, -0.8); close(complete.C, 1.25); close(complete.D, 0);
  // The dichroic and shortpass use zero-thickness spectral surfaces: no hidden lens power or axial shift.
  assert.equal(registry.dichroic.surfaces(get(scene, 'observation-pickoff'))[0].kind, 'dichroic');
  assert.equal(registry.filter.surfaces(get(scene, 'postsample-filter'))[0].kind, 'filter');
});

test('Gittard 1, 4 and 8 orders retain and focus all beam samples across both scanner controls', () => {
  for (const count of [1, 4, 8]) for (const x of [-0.2, 0, 0.2]) for (const y of [-0.2, 0, 0.2]) {
    const scene = load(); get(scene, 'slm').params.focusCount = count; staticScan(scene, x, y);
    const result = traceScene(scene.elements, scene.beams);
    focused(result, count);
    assert.ok(result.writeHits.every(hit => Math.abs(hit.y - 390) < 0.026));
    assert.equal(objectivePupilFill('gittard-objective').transmitted, 1);
    assert.equal(sampleArrivalDetailReading('gittard-stage').channels.filter(channel => channel.sourceId === 'gittard-laser').length, count);
  }
});

test('Gittard independent edge-to-edge line probes all produce every full-aperture order', () => {
  for (const count of [1, 4, 8]) {
    const supports = Array.from({ length: count }, () => []);
    for (let sample = 0; sample < 9; sample++) {
      const scene = load(); staticScan(scene); get(scene, 'slm').params.focusCount = count;
      const laser = get(scene, 'laser'); laser.params.beamMode = 'line'; laser.y += (sample - 4) / 8;
      const result = traceScene(scene.elements, scene.beams);
      focused(result, count, 1);
      result.writeHits.sort((a, b) => a.y - b.y).forEach((hit, index) => supports[index].push(hit.y));
    }
    for (const values of supports) assert.ok(Math.max(...values) - Math.min(...values) < 1e-8);
  }
});

test('Gittard both scanner pivots remain conjugate to the real finite objective pupil', () => {
  for (const pivotId of ['galvo-x', 'galvo-y']) for (const angle of [-0.2, 0, 0.2]) {
    const scene = load(); staticScan(scene, pivotId === 'galvo-x' ? angle : 0, pivotId === 'galvo-y' ? angle : 0);
    const pivot = get(scene, pivotId), incomingDeg = pivotId === 'galvo-x' ? 102 : 180;
    const rad = incomingDeg * Math.PI / 180, dx = Math.cos(rad), dy = Math.sin(rad);
    const ids = ['galvo-y', 'scan-lens', 'relay-fold', 'tube-lens', 'observation-pickoff', 'objective', 'stage', 'postsample-filter'];
    if (pivotId === 'galvo-x') ids.push('galvo-x', 'scan-relay');
    const elements = scene.elements.filter(element => ids.some(id => element.id === `gittard-${id}`));
    const rays = Array.from({ length: 9 }, (_, index) => {
      const h = (index - 4) / 8;
      const ray = createElement('pulsedlaser', pivot.x - 100 * dx - h * dy, pivot.y - 100 * dy + h * dx);
      ray.rot = incomingDeg; Object.assign(ray.params, { beamMode: 'line', bandwidth: 0, wavelength: 780 }); return ray;
    });
    const result = traceScene([...rays, ...elements]);
    const planes = objectiveScanPlanes(get(scene, 'objective'));
    const crossings = tracedPlaneCrossings(result.drawables, { center: planes.bfp, axis: planes.axis });
    assert.equal(crossings.length, 9);
    const heights = crossings.map(hit => hit.heightMm);
    close((Math.max(...heights) + Math.min(...heights)) / 2, 0);
    assert.ok(heights.every(height => Math.abs(height) < planes.pupilRadiusMm));
  }
});

test('Gittard spatial zero-order rejection, source boundary and independent camera remain physical', () => {
  const run = change => { const scene = load(); staticScan(scene); change?.(scene); return traceScene(scene.elements, scene.beams); };
  const baseline = run(); focused(baseline, 4);
  const frame = getVisualBounds(get(load(), 'frame'));
  assert.ok(baseline.drawables.every(item => (item.pts || []).every(point =>
    point.x >= frame.x0 && point.x <= frame.x1 && point.y >= frame.y0 && point.y <= frame.y1)),
  'all post-sample beam edges must reach the finite shortpass absorber before escaping the frame');
  const dumpTracks = result => result.pulseTracks.filter(track => {
    const end = track.pts.at(-1); return Math.abs(end.y - 220) < 1e-8 && Math.abs(end.x - 500) < 1e-8;
  });
  assert.ok(dumpTracks(baseline).length > 0);
  const noZero = run(scene => { get(scene, 'slm').params.zeroOrder = false; }); focused(noZero, 4);
  assert.equal(dumpTracks(noZero).length, 0);
  const sum = result => result.writeHits.reduce((total, hit) => total + hit.intensity, 0);
  close(sum(baseline) / sum(noZero), 0.3);
  assert.equal(run(scene => { get(scene, 'slm').params.scanAngle = 0; }).writeHits.length, 0,
    'putting programmed orders on the spatially rejected axis extinguishes writing');
  for (const change of [scene => { get(scene, 'laser').params.enabled = false; }, scene => { get(scene, 'laser').params.avgPowerW = 0; }]) {
    assert.equal(run(change).writeHits.length, 0);
    close(detectorReading('gittard-cmos').signal, 0.8);
    assert.equal(detectorReading('gittard-cmos').wavelength, 550);
  }
  run();
  assert.ok(detectorReading('gittard-cmos').spotSpan < 1e-8);
});

test('Gittard a misplaced collimator visibly broadens actual supports and saved controls round-trip', () => {
  const scene = load(); staticScan(scene); get(scene, 'collimator').y += 5;
  const defocused = traceScene(scene.elements, scene.beams);
  assert.ok(defocused.writeHits.length > 0);
  assert.ok(defocused.writeHits.every(hit => hit.spreadMm > 0.001), 'the preview must expose defocus, not manufacture a sharp centroid');
  finiteTrace(defocused);
  const saved = load(); get(saved, 'slm').params.focusCount = 8; staticScan(saved, 0.2, -0.2);
  const roundTrip = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, ...saved }), registry);
  assert.deepEqual(roundTrip, saved);
  focused(traceScene(roundTrip.elements, roundTrip.beams), 8);
  const frame = getVisualBounds(get(saved, 'frame'));
  for (const element of saved.elements.filter(element => element.type === 'textlabel')) {
    const bounds = getVisualBounds(element);
    assert.ok(bounds.x0 >= frame.x0 && bounds.x1 <= frame.x1 && bounds.y0 >= frame.y0 && bounds.y1 <= frame.y1, element.id);
  }
});
