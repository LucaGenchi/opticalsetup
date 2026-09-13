import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registry, getVisualBounds, stageOffsetAt } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';
import { programmableMaskFrame } from '../sketch/js/programmable-mask.js';
import { sampleArrivalDetailReading } from '../sketch/js/sample-arrival-detail.js';
import { objectiveScanPlanes } from '../sketch/js/scan-relay.js';

const load = async () => parseSketch(await readFile(new URL(
  '../collections/2pp/setups/somers-2021.json', import.meta.url), 'utf8'), registry);
const element = (scene, id) => scene.elements.find(e => e.id === `somers-${id}`);
const arrivals = () => sampleArrivalDetailReading('somers-stage').channels;
const sampleHits = trace => trace.signalHits.filter(hit => hit.stageId === 'somers-stage');
const span = values => Math.max(...values) - Math.min(...values);
const close = (actual, expected, tolerance = 1e-8) => assert.ok(
  Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const segments = trace => trace.drawables.filter(path => path.type === 'path')
  .flatMap(path => path.pts.slice(1).map((b, i) => [path.pts[i], b]));

function uniformProbe(scene, sourceOffset, wavelength) {
  const copy = structuredClone(scene);
  const laser = element(copy, 'laser');
  laser.y += sourceOffset;
  laser.params.beamMode = 'line';
  if (wavelength !== undefined) Object.assign(laser.params, { wavelength, bandwidth: 0 });
  Object.assign(element(copy, 'dmd').params, {
    maskPattern: 'uniform', maskLevel: 1, maskPlayback: false,
  });
  return copy;
}

test('Somers default shows a sampled projected field and a real incident CCD branch', async () => {
  const scene = await load();
  const trace = traceScene(scene.elements);
  const hits = sampleHits(trace);
  assert.equal(hits.length, 3);
  assert.ok(hits.every(hit => hit.objectiveNA === 1.49));
  const detail = arrivals();
  assert.equal(detail.length, 1);
  assert.equal(detail[0].sampleCount, 57);
  close(detail[0].maxUm - detail[0].minUm, 49.2586325328, 1e-6);
  assert.ok(detectorReading('somers-ccd')?.signal > 0);
  const scan = value => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
    else if (value && typeof value === 'object') Object.values(value).forEach(scan);
  };
  scan(trace);
  const stage = element(scene, 'stage');
  assert.equal(stage.params.transmitExc, true);
  assert.equal(stage.params.transmission, 0);
  assert.ok(!segments(trace).some(([a, b]) => Math.abs(a.x - stage.x) < 1e-7
    && Math.abs(a.y - stage.y) < 0.1 && b.x > stage.x + 1e-6),
  'sample transmission must end at the actual specimen plane');
});

test('Somers recombines every admitted wavelength across the full illuminated DMD field', async () => {
  const scene = await load();
  const fields = [];
  for (let sample = 0; sample <= 24; sample++) {
    const copy = uniformProbe(scene, -2.25 + sample * 4.5 / 24);
    const trace = traceScene(copy.elements);
    const hit = segments(trace).find(([a, b]) => a.y > 215.001
      && Math.abs(b.y - 215) < 1e-8 && Math.abs(b.x - 670) < 6)?.[1];
    assert.ok(hit, `source sample ${sample} must reach the actual DMD face`);
    fields.push(hit.x);
    const hits = sampleHits(trace);
    assert.equal(hits.length, 3, `all three accepted wavelengths, source sample ${sample}`);
    close(span(hits.map(h => h.y)), 0);
    for (const h of hits) {
      close(h.x, 572);
      // The folded scene maps screen-x at the DMD to screen-y at the resin.
      close(h.y, 420 - (hit.x - 670) / 150);
    }
  }
  close(span(fields), 9 / Math.cos(24 * Math.PI / 180));

  // A deliberately wrong collecting lens must fail wavelength coincidence,
  // even though all rays still hit the comparatively wide resin holder.
  element(scene, 'l3').params.f = 330;
  assert.ok(span(sampleHits(traceScene(scene.elements)).map(h => h.y)) > 0.002);
});

test('Somers finite acceptance is measured at the true objective BFP', async () => {
  const scene = await load();
  const planes = objectiveScanPlanes(element(scene, 'objective'));
  close(planes.bfp.x, 568);
  close(planes.focus.x, 572);
  const wavelengths = [771.9723805905, 785.98619029525, 800, 814.01380970475, 828.0276194095];
  for (const wavelength of wavelengths) {
    const pupil = [];
    for (const offset of [-2.25, 0, 2.25]) {
      const copy = uniformProbe(scene, offset, wavelength);
      const trace = traceScene(copy.elements);
      const path = segments(trace).find(([a, b]) => b.x > a.x
        && a.x <= 568 + 1e-8 && b.x >= 568 - 1e-8
        && Math.abs(a.y - 420) < 10 && Math.abs(b.y - 420) < 10);
      assert.ok(path, 'the incoming ray must reach the pupil plane');
      const [a, b] = path;
      const height = a.y + (b.y - a.y) * (568 - a.x) / (b.x - a.x) - 420;
      pupil.push(height);
      const outer = Math.abs(wavelength - 800) > 20;
      assert.equal(sampleHits(trace).length, outer ? 0 : 1);
      assert.equal(Math.abs(height) > 2.98, outer);
    }
    close(span(pupil), 0);
  }
});

test('Somers source and carrier controls distinguish illumination from spectral geometry', async () => {
  const scene = await load();
  traceScene(scene.elements);
  const baseline = detectorReading('somers-ccd').signal;
  element(scene, 'hwp').params.a = 22.5;
  traceScene(scene.elements);
  close(detectorReading('somers-ccd').signal, baseline / 2);
  element(scene, 'hwp').params.a = 45;
  assert.equal(sampleHits(traceScene(scene.elements)).length, 0);
  assert.equal(arrivals().length, 0);
  element(scene, 'hwp').params.a = 0;
  const laser = element(scene, 'laser');
  for (const settings of [{ enabled: false }, { enabled: true, avgPowerW: 0 }]) {
    Object.assign(laser.params, settings);
    assert.equal(sampleHits(traceScene(scene.elements)).length, 0);
    assert.equal(arrivals().length, 0);
  }
  Object.assign(laser.params, { enabled: true, avgPowerW: 0.1 });
  element(scene, 'dmd').params.spectralMode = 'none';
  assert.equal(sampleHits(traceScene(scene.elements)).length, 1);
  assert.equal(arrivals()[0].sampleCount, 19);
  close(arrivals()[0].maxUm - arrivals()[0].minUm, 49.2586325328, 1e-6);
});

test('Somers mask playback changes discrete two-dimensional slices and actual image support', async () => {
  const scene = await load();
  const dmd = element(scene, 'dmd');
  const first = programmableMaskFrame(dmd.params, 'dmd', 0);
  assert.equal(first.count, 4);
  assert.deepEqual(programmableMaskFrame(dmd.params, 'dmd', 1.999), first);
  assert.equal(programmableMaskFrame(dmd.params, 'dmd', 2).index, 1);
  assert.ok(first.grid.some(row => row.some(Boolean) && row.some(v => !v)));
  assert.ok(first.grid.some(row => row.every(v => !v)));
  const counts = [];
  for (let frame = 0; frame < 4; frame++) {
    dmd._animationTimeS = frame * 2;
    traceScene(scene.elements);
    counts.push(arrivals().reduce((n, channel) => n + channel.sampleCount, 0));
  }
  assert.deepEqual(counts, [57, 30, 75, 24]);
  // An OFF center in outline/ring frames is not an empty projected field.
  assert.ok(counts[1] > 0 && counts[3] > 0);
  Object.assign(dmd.params, { maskPlayback: false, maskFrame: 0, maskSlice: 0.05 });
  traceScene(scene.elements);
  assert.equal(arrivals().length, 0);
  Object.assign(dmd.params, { maskPattern: 'uniform', maskLevel: 0, maskSlice: 0.5 });
  traceScene(scene.elements);
  assert.equal(arrivals().length, 0);
});

test('Somers Z preview moves the physical resin and broadens actual sampled support', async () => {
  const scene = await load();
  const stage = element(scene, 'stage');
  assert.equal(stage.params.pzMode, 'static');
  traceScene(scene.elements);
  const nominal = arrivals()[0].maxUm - arrivals()[0].minUm;
  const nominalX = stage.x;
  stage.params.pzMode = 'z';
  for (const time of [0, 2.5, 5]) {
    const offset = stageOffsetAt(stage.params, time);
    // Stage local Z is local +y; its 90-degree rotation points this along -x.
    stage.x = nominalX - offset.y;
    assert.ok(stage.x > 571.87, 'resin must remain outside the objective front tip');
    const trace = traceScene(scene.elements);
    assert.equal(sampleHits(trace).length, 3);
    const detail = arrivals()[0];
    assert.equal(detail.sampleCount, 57);
    assert.ok(detail.maxUm - detail.minUm > nominal * 2.5);
  }
  assert.deepEqual(stageOffsetAt(stage.params, 0), stageOffsetAt(stage.params, 5));
});

test('Somers shared frames, source units and optical behavior survive save/reload', async () => {
  const scene = await load();
  const loaded = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, ...scene }), registry);
  assert.deepEqual(loaded, scene);
  const laser = element(loaded, 'laser');
  assert.equal(laser.params.repRateMHz, 0.005);
  assert.equal(laser.params.handoffEnabled, false);
  const dmd = element(loaded, 'dmd');
  assert.equal(dmd.params.spectralMode, 'carrier');
  assert.equal(dmd.params.maskPattern, 'slices');
  assert.equal(dmd.params.showMaskDetail, true);
  assert.ok(!Object.hasOwn(dmd.params, 'sequence'));
  assert.deepEqual(traceScene(loaded.elements).writeHits, traceScene(scene.elements).writeHits);
  const frame = getVisualBounds(element(scene, 'frame'));
  for (const item of scene.elements) {
    const bounds = getVisualBounds(item);
    assert.ok(bounds.x0 >= frame.x0 && bounds.x1 <= frame.x1
      && bounds.y0 >= frame.y0 && bounds.y1 <= frame.y1, `${item.id} must fit the figure`);
  }
});
