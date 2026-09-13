import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { arrivalOutputPort, arrivalPortState, groupArrivalHits } from '../sketch/js/arrival-preview.js';

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

test('physical port history survives before grouping and ignores spectral sample tags', () => {
  const negative = arrivalPortState({ sig: 'm-1w0' }, 'doe:m-1');
  assert.equal(negative.arrivalGroup, undefined, 'a DOE alone does not activate an array preview');
  assert.deepEqual(negative, arrivalPortState({ sig: 'm-1w4' }, 'doe:m-1'));
  const lenslet = arrivalPortState(negative, 'mla:L0', true);
  assert.equal(lenslet.arrivalGroup, '/doe:m-1/mla:L0');
  assert.notEqual(lenslet.arrivalGroup,
    arrivalPortState(arrivalPortState({}, 'doe:m1'), 'mla:L0', true).arrivalGroup);
  assert.notEqual(arrivalPortState(lenslet, 'bs:T').arrivalGroup,
    arrivalPortState(lenslet, 'bs:R').arrivalGroup);
});

test('port interpretation distinguishes real branches from spatial, spectral and timing samples', () => {
  for (const tag of ['R', 'R0', 'R1']) assert.equal(arrivalOutputPort('dichroic', tag), 'R');
  for (const tag of ['d1', 'd1w0', 'd1w4']) assert.equal(arrivalOutputPort('aod', tag), 'm1');
  for (const tag of ['d0', 'd0r', 'd0off']) assert.equal(arrivalOutputPort('aom', tag), 'm0');
  for (const tag of ['c0', 'c4']) assert.equal(arrivalOutputPort('aotf', tag), 'selected');
  assert.equal(arrivalOutputPort('aotf', 'depleted'), 'depleted');
  assert.equal(arrivalOutputPort('refract', 'w0'), 'T');
  assert.equal(arrivalOutputPort('refract', 'w4-tir'), 'R');
  assert.equal(arrivalOutputPort('refract', 'tir'), 'R');
  assert.equal(arrivalOutputPort('diffuser', 'd1'), null);
  assert.equal(arrivalOutputPort('metalens', 'w0'), null);
  assert.equal(arrivalOutputPort('chop', 'gate'), null);
});

function fourCellBench() {
  const [laser, array, stage] = bench('slm');
  laser.params.beamWidth = 20;
  array.params.layers = [{ type: 'lensarray', n: 4, f: 40 }];
  stage.x = 146;
  return [laser, array, stage];
}

test('lenslets followed by a grating layer keep both orders without splitting wavelength samples', () => {
  const scene = fourCellBench();
  scene[1].params.layers.push({ type: 'grating', lines: 20, orders: '-1,1' });
  const sorted = hits => hits.map(hit => ({
    group: hit.arrivalGroup, power: hit.intensity, span: hit.spreadMm,
  })).sort((a, b) => a.group.localeCompare(b.group));
  for (const bandwidth of [0, 40]) {
    scene[0].params.bandwidth = bandwidth;
    scene[1].params.layers[1].orders = '-1,1';
    const hits = traceScene(scene).writeHits;
    assert.equal(hits.length, 8, 'four lenslets each have two physical outgoing orders');
    assert.ok(hits.every(hit => /:L\d+\/.+:m-?1$/.test(hit.arrivalGroup)));
    assert.ok(hits.every(hit => hit.arrivalSamples >= (bandwidth ? 25 : 5)));
    assert.ok(hits.every(hit => hit.spreadMm > 1), 'each order still retains its own real defocus');
    near(hits.reduce((sum, hit) => sum + hit.intensity, 0), 1);
    scene[1].params.layers[1].orders = '1,-1';
    assert.deepEqual(sorted(traceScene(scene).writeHits), sorted(hits));
  }
  scene[1].params.layers[1].orders = '0';
  const zerothOnly = traceScene(scene).writeHits;
  assert.equal(zerothOnly.length, 4);
  near(zerothOnly.reduce((sum, hit) => sum + hit.intensity, 0), 1);
});

for (const upstream of [true, false]) {
  test(`a separate grating ${upstream ? 'before' : 'after'} an MLA preserves physical order identity`, () => {
    const [laser, array, stage] = fourCellBench();
    array.type = 'microlensarray';
    Object.assign(array.params, { count: 4, f: 40 });
    const grating = createElement('grating', upstream ? 70 : 120, 0);
    Object.assign(grating.params, { length: 100, transmissive: true, lines: 20, orders: '-1,1' });
    const hits = traceScene([laser, array, grating, stage]).writeHits;
    assert.equal(hits.length, 8);
    assert.ok(hits.every(hit => hit.arrivalSamples > 1));
    assert.equal(new Set(hits.map(hit => hit.arrivalGroup)).size, 8);
    assert.ok(hits.every(hit => /:m-?1(?:\/|$)/.test(hit.arrivalGroup)));
    near(hits.reduce((sum, hit) => sum + hit.intensity, 0), 1);
  });
}

test('a residual SLM port stays separate from the programmed port of every upstream lenslet', () => {
  const [laser, array, stage] = fourCellBench();
  const mask = createElement('slm', 120, 0);
  Object.assign(mask.params, { length: 100, transmissive: true, zeroOrder: true, zeroFrac: 0.25,
    layers: [{ type: 'steer', angle: 1 }] });
  const scene = [laser, array, mask, stage];
  const hits = traceScene(scene).writeHits;
  assert.equal(hits.length, 8);
  const residual = hits.filter(hit => hit.arrivalGroup.endsWith(':z0'));
  const programmed = hits.filter(hit => hit.arrivalGroup.endsWith(':programmed'));
  assert.equal(residual.length, 4);
  assert.equal(programmed.length, 4);
  near(residual.reduce((sum, hit) => sum + hit.intensity, 0), 0.25);
  near(programmed.reduce((sum, hit) => sum + hit.intensity, 0), 0.75);
  Object.assign(mask.params, { maskMode: 'amplitude', maskPattern: 'uniform', maskLevel: 0 });
  const dark = traceScene(scene).writeHits;
  assert.equal(dark.length, 4, 'a dark program leaves only the independent residual port');
  assert.ok(dark.every(hit => hit.arrivalGroup.endsWith(':z0')));
  near(dark.reduce((sum, hit) => sum + hit.intensity, 0), 0.25);
});

for (const type of ['aom', 'aod']) {
  test(`${type} zeroth and first orders remain separate after a lens array`, () => {
    const [laser, array, stage] = fourCellBench();
    const modulator = createElement(type, 120, 0);
    Object.assign(modulator.params, { aperture: 100, zero: true, eff: 0.6, modulate: false });
    const scene = [laser, array, modulator, stage];
    const hits = traceScene(scene).writeHits;
    assert.equal(hits.length, 8);
    const first = hits.filter(hit => hit.arrivalGroup.endsWith(':m1'));
    const zeroth = hits.filter(hit => hit.arrivalGroup.endsWith(':m0'));
    assert.equal(first.length, 4);
    assert.equal(zeroth.length, 4);
    near(first.reduce((sum, hit) => sum + hit.intensity, 0), 0.6);
    near(zeroth.reduce((sum, hit) => sum + hit.intensity, 0), 0.4);
    modulator.params.eff = 0;
    const dark = traceScene(scene).writeHits;
    assert.equal(dark.length, 4);
    assert.ok(dark.every(hit => hit.arrivalGroup.endsWith(':m0')));
    near(dark.reduce((sum, hit) => sum + hit.intensity, 0), 1);
  });
}

test('rays bypassing a finite splitter cannot merge with rays that crossed its attenuating port', () => {
  const [laser, device, stage] = bench('slm');
  device.params.layers = [{ type: 'focusgrid', n: 1, f: 3000 }];
  stage.x = 180;
  const splitter = createElement('bs', 140, 0);
  Object.assign(splitter.params, { size: 10, ratio: 0.5 });
  const hits = traceScene([laser, device, splitter, stage]).writeHits;
  assert.equal(hits.length, 2);
  const crossed = hits.find(hit => hit.arrivalGroup.endsWith(':T'));
  const bypassed = hits.find(hit => hit.arrivalGroup.endsWith(':F0'));
  assert.ok(crossed && bypassed);
  assert.equal(crossed.arrivalSamples + bypassed.arrivalSamples, 25);
  near(crossed.intensity, crossed.arrivalSamples / 25 * 0.5);
  near(bypassed.intensity, bypassed.arrivalSamples / 25);
});
