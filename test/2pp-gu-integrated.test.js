import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, registry, stageOffsetAt } from '../sketch/js/elements.js';
import { glassIndex } from '../sketch/js/glass.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { programmableMaskFrame } from '../sketch/js/programmable-mask.js';
import { sampleArrivalDetailReading } from '../sketch/js/sample-arrival-detail.js';

const raw = readFileSync(new URL('../collections/2pp/setups/gu-2025.json', import.meta.url), 'utf8');
const load = () => parseSketch(raw, registry);
const by = (scene, id) => scene.elements.find(element => element.id === id);
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const trace = scene => traceScene(scene.elements, scene.beams);
const channel = hit => Number(hit.arrivalGroup.match(/ml2:M(\d+)$/)?.[1]);
const frame = (scene, index) => { by(scene, 'slm').params.maskFrame = index; };

test('Gu uses a real shared intensity grid and gives six, seven, zero and inverted individual channels', () => {
  const scene = load(), slm = by(scene, 'slm');
  const displayed = programmableMaskFrame(slm.params, 'slm', 0);
  assert.equal(displayed.mode, 'amplitude');
  assert.equal(displayed.grid.length, 7);
  assert.ok(displayed.grid.every(row => row.length === 7));
  const column = Math.min(6, Math.floor(displayed.column * 7));
  assert.deepEqual(displayed.grid.map(row => row[column]), [1, 0.72, 0, 0.38, 0.92, 0.18, 1]);
  assert.ok(displayed.grid.some(row => new Set(row).size > 1), 'the visible device is two dimensional');
  assert.equal(slm.params.layers.length, 0, 'the SLM does not create lenslet axes or holographic orders');
  assert.equal(slm.params.holographicOrders, false);
  assert.equal(slm.params.spectralMode, 'none');
  assert.equal(trace(scene).writeHits.length, 6);
  frame(scene, 1);
  assert.deepEqual(trace(scene).writeHits.map(channel).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6]);
  frame(scene, 2);
  assert.equal(trace(scene).writeHits.length, 0);
  for (let band = 0; band < 7; band++) {
    frame(scene, band + 3);
    assert.deepEqual(trace(scene).writeHits.map(channel), [6 - band], `band ${band} is inverted into its own lenslet`);
  }
});

test('Gu samples the entire admitted beam and keeps seven actual arrivals with their finite spectral support', () => {
  const scene = load();
  frame(scene, 1);
  by(scene, 'stage').params.showArrivalDetail = true;
  const result = trace(scene), detail = sampleArrivalDetailReading('stage');
  assert.equal(result.signalHits.length, 125, 'all 25 source samples and five spectral samples reach resin');
  assert.equal(result.writeHits.length, 7);
  assert.equal(detail.channels.length, 7);
  assert.equal(detail.channels.reduce((n, c) => n + c.sampleCount, 0), 125);
  for (const hit of result.writeHits) {
    assert.ok(result.signalHits.some(actual => Math.hypot(hit.x - actual.x, hit.y - actual.y) < 1e-9));
    const full = detail.channels.find(c => c.route === hit.arrivalGroup);
    near(hit.spreadMm * 1000, full.maxUm - full.minUm, 1e-7);
    assert.ok(hit.spreadMm > 0.15 && hit.spreadMm < 0.3, 'the geometric spectral support is retained, not called a PSF');
  }
  assert.ok(result.drawables.every(d => (d.pts || []).every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
  by(scene, 'laser').params.bandwidth = 0;
  const mono = trace(scene);
  assert.equal(mono.signalHits.length, 25);
  assert.equal(mono.writeHits.length, 7);
  assert.ok(mono.writeHits.every(hit => hit.spreadMm < 0.0002), 'compensated windows leave only the small finite-angle refraction residual');
});

test('Gu channel count survives source and wavelength sampling changes', () => {
  const original = registry.pulsedlaser.source;
  try {
    for (const count of [13, 25, 49]) {
      registry.pulsedlaser.source = element => Array.from({ length: count }, (_, i) => ({
        x: 52, y: -element.params.beamWidth / 2 + element.params.beamWidth * i / (count - 1),
        dx: 1, dy: 0, sample: i, sampleGrid: 'edges',
      }));
      for (const bandwidth of [0, 20]) {
        const scene = load(); frame(scene, 1); by(scene, 'laser').params.bandwidth = bandwidth;
        const hits = trace(scene).writeHits;
        assert.equal(hits.length, 7, `${count} source samples / ${bandwidth} nm retain seven channels`);
        assert.ok(hits.every(hit => Number.isFinite(hit.spreadMm) && hit.intensity > 0));
      }
    }
  } finally { registry.pulsedlaser.source = original; }
});

test('Gu source gates, focal-length control and physical stage offsets affect the native beam honestly', () => {
  let scene = load(); by(scene, 'laser').params.enabled = false;
  assert.equal(trace(scene).writeHits.length, 0);
  scene = load(); by(scene, 'laser').params.avgPowerW = 0;
  assert.equal(trace(scene).writeHits.length, 0);
  scene = load(); frame(scene, 1);
  const baseline = trace(scene).writeHits;
  by(scene, 'laser').params.avgPowerW = 3.5;
  assert.deepEqual(trace(scene).writeHits, baseline, 'positive source watts remain metadata for normalized geometric weights');
  by(scene, 'ml2').params.f = 60;
  const defocused = trace(scene).writeHits;
  assert.equal(defocused.length, 7);
  assert.ok(Math.max(...defocused.map(h => h.spreadMm)) > 2.5);
  assert.ok(defocused.every(h => h.spreadMm > 1.5), 'defocus cannot leave a fictitious sharp centroid');
  scene = load(); frame(scene, 1);
  const stage = by(scene, 'stage');
  stage.params.pzMode = 'xy';
  const xy = stageOffsetAt(stage.params, 0);
  near(xy.y, 0); assert.ok(xy.x !== 0);
  stage.y += xy.x; // The 90-degree stage maps local transverse x to world y.
  assert.deepEqual(trace(scene).writeHits.map(h => [h.x, h.y]), baseline.map(h => [h.x, h.y]), 'transverse stage motion does not move the optical foci');
  stage.params.pzMode = 'z';
  const z = stageOffsetAt(stage.params, 0);
  near(z.x, 0); assert.ok(z.y !== 0);
  stage.x -= z.y;
  const moved = trace(scene).writeHits;
  assert.equal(moved.length, 7);
  assert.ok(Math.max(...moved.map(h => h.spreadMm)) > Math.max(...baseline.map(h => h.spreadMm)));
});

function nativeFieldMatrix(scene) {
  const slm = by(scene, 'slm'), array = by(scene, 'ml2');
  const original = registry.guReviewProbe;
  registry.guReviewProbe = { ...registry.cwlaser, surfaces: () => [],
    source: element => [{ x: 0, y: 0, dx: -1, dy: element.params.probeSlope }] };
  try {
    const probe = (height, slope) => {
      const elements = scene.elements.filter(e => ['pbs2', 'qwp2', 'l1', 'window1', 'window2', 'l2', 'fold'].includes(e.id));
      const source = createElement('cwlaser', slm.x - 9, slm.y + height);
      source.type = 'guReviewProbe';
      Object.assign(source.params, { pol: 90, wavelength: 800, beamMode: 'line', probeSlope: slope });
      const result = traceScene([source, ...elements]);
      const crossings = [];
      for (const path of result.drawables) for (let i = 1; i < (path.pts?.length || 0); i++) {
        const a = path.pts[i - 1], b = path.pts[i];
        if (a.x < array.x && b.x > array.x && Math.abs(a.y - array.y) < 100) {
          const u = (array.x - a.x) / (b.x - a.x);
          // Array local +y is opposite world +y because its input face points left.
          crossings.push({ h: -(a.y + u * (b.y - a.y) - array.y), slope: -(b.y - a.y) / (b.x - a.x) });
        }
      }
      assert.equal(crossings.length, 1);
      return crossings[0];
    };
    const delta = 0.001, h = probe(delta, 0), u = probe(0, 0.0001);
    return { A: h.h / delta, B: u.h / 0.0001, C: h.slope / delta, D: u.slope / 0.0001 };
  } finally {
    if (original) registry.guReviewProbe = original;
    else delete registry.guReviewProbe;
  }
}

test('Gu preserves the reported field relay and explicitly compensates the modeled windows at 800 nm', () => {
  const scene = load();
  const slm = by(scene, 'slm'), pbs = by(scene, 'pbs2'), l1 = by(scene, 'l1'), l2 = by(scene, 'l2');
  const fold = by(scene, 'fold'), array = by(scene, 'ml2');
  near(slm.x - 9 - pbs.x + l1.y - pbs.y, 75);
  near(l2.y - l1.y, 275 + 2 * (1 - 1 / glassIndex('silica', 800)));
  near(fold.y - l2.y + array.x - fold.x, 200);
  const matrix = nativeFieldMatrix(scene);
  near(matrix.A, -200 / 75, 1e-7); near(matrix.B, 0, 1e-7);
  near(matrix.C, 0, 1e-9); near(matrix.D, -75 / 200, 1e-7);
  l2.y -= 10; fold.y -= 10; array.y -= 10;
  assert.ok(Math.abs(nativeFieldMatrix(scene).C) > 0.0005, 'a relay spacing error produces real residual curvature');
});

test('Gu save and reload preserve the shared mask, controls and traced arrivals', () => {
  const scene = load();
  frame(scene, 7); by(scene, 'ml2').params.f = 60; by(scene, 'stage').params.pzMode = 'z';
  const restored = parseSketch(JSON.stringify(scene), registry);
  assert.deepEqual(restored, scene);
  assert.deepEqual(trace(restored), trace(scene));
  assert.equal(scene.elements.filter(e => e.type === 'metalensarray').length, 1);
  assert.equal(scene.elements.filter(e => e.type === 'objective').length, 0, 'the omitted observation microscope is not a writing lens');
});
