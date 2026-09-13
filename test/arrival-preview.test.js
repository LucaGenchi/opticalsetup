import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { groupArrivalHits } from '../sketch/js/arrival-preview.js';

const near = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('grouped preview chooses an actual weighted arrival and retains the entire defocused spread', () => {
  const make = (x, weight) => ({ stageId: 'stage', arrivalGroup: 'order1', pulse: { sourceId: 'laser' }, x, y: 3, opl: 10 + x, intensity: 1, weight });
  const arrivals = [make(0, 0.1), make(4, 0.8), make(10, 0.1)];
  const [group] = groupArrivalHits(arrivals);
  assert.equal(group.x, 4, 'the marker is an actual arrival, not the virtual weighted center at 4.2');
  assert.equal(group.y, 3);
  assert.deepEqual(group.spreadStart, { x: 0, y: 3 });
  assert.deepEqual(group.spreadEnd, { x: 10, y: 3 });
  assert.equal(group.spreadMm, 10);
  assert.equal(group.arrivalSamples, 3);
  near(group.intensity, 1);
  assert.equal(group.oplMin, 10);
  assert.equal(group.oplMax, 20);
});

test('different sources and orders keep independent arrival markers; bad grouped hits cannot escape', () => {
  const plain = { stageId: 'stage', x: 0, y: 0, intensity: 1 };
  const make = (source, group) => ({ stageId: 'stage', pulse: { sourceId: source }, arrivalGroup: group, x: 2, y: 4, opl: 20, weight: 0.5 });
  const hits = groupArrivalHits([plain, make('a', '1'), make('a', '2'), make('b', '1'),
    { ...make('a', '3'), x: NaN }, { ...make('a', '4'), weight: Infinity }]);
  assert.equal(hits.length, 4);
  assert.equal(hits[0], plain, 'ordinary serial source references keep their established form');
  assert.ok(hits.every(hit => Number.isFinite(hit.x) && Number.isFinite(hit.y)));
});

function bench(type) {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { wavelength: 800, beamMode: 'beam', beamWidth: 24, transformLimited: false, bandwidth: 0 });
  const device = createElement(type, 100, 0);
  Object.assign(device.params, { length: 24, count: 3, f: 40, designWavelength: 800, focusEff: 100,
    transmissive: true, layers: [{ type: 'focusgrid', n: 3, f: 40 }] });
  const stage = createElement('stage', type === 'slm' ? 131 : 140, 0);
  stage.rot = 90;
  Object.assign(stage.params, { aperture: 100, specimenType: 'resin', voxelPreview: true });
  return [laser, device, stage];
}

for (const type of ['microlensarray', 'metalensarray', 'slm']) {
  test(`${type} gives one arrival per optical channel and exposes geometric defocus`, () => {
    const scene = bench(type);
    let hits = traceScene(scene).writeHits;
    assert.equal(hits.length, 3);
    assert.ok(hits.every(hit => hit.arrivalSamples > 1 && hit.spreadMm < 1e-8));
    assert.deepEqual(hits.map(hit => Math.round(hit.y)).sort((a, b) => a - b), [-8, 0, 8]);
    near(hits.reduce((sum, hit) => sum + hit.intensity, 0), 1);
    scene[2].x += 15;
    hits = traceScene(scene).writeHits;
    assert.equal(hits.length, 3);
    assert.ok(hits.every(hit => hit.spreadMm > 2), 'defocus must remain visible as traced support, not collapse to a point');
    assert.ok(hits.every(hit => hit.oplMax >= hit.oplMin));
  });
}

test('arrival count is independent of the spatial ray sample count', () => {
  const original = registry.pulsedlaser.source;
  try {
    for (const count of [25, 49]) {
      registry.pulsedlaser.source = el => Array.from({ length: count }, (_, i) => ({
        x: 52, y: -el.params.beamWidth / 2 + el.params.beamWidth * i / (count - 1),
        dx: 1, dy: 0, sample: i, sampleGrid: 'edges',
      }));
      for (const type of ['microlensarray', 'metalensarray', 'slm']) {
        const hits = traceScene(bench(type)).writeHits;
        assert.equal(hits.length, 3);
        near(hits.reduce((sum, hit) => sum + hit.intensity, 0), 1);
      }
    }
  } finally { registry.pulsedlaser.source = original; }
});

test('an extinguished array channel creates no arrival group', () => {
  const [laser, device, stage] = bench('metalensarray');
  const mask = createElement('slm', 75, 0);
  Object.assign(mask.params, { length: 24, transmissive: true, maskMode: 'amplitude',
    maskPattern: 'custom', maskFrames: [[[1], [0], [1]]] });
  const hits = traceScene([laser, mask, device, stage]).writeHits;
  assert.equal(hits.length, 2);
  assert.ok(hits.every(hit => Math.abs(hit.y) > 7));
});
