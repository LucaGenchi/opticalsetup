import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registry, stageOffsetAt } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { objectiveBackFocalPlaneX, objectivePupilRadius } from '../sketch/js/objective.js';
import { toWorld, rotPt } from '../sketch/js/util.js';

const raw = await readFile(new URL('../collections/2pp/setups/basic-2pp.json', import.meta.url), 'utf8');
const load = () => parseSketch(raw, registry);
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

function freeze(scene) {
  for (const e of scene.elements) {
    if (e.type === 'galvo') Object.assign(e.params, { scanMode: 'static', commandAngle: 0 });
    if (e.type === 'stage') e.params.pzMode = 'static';
  }
  return scene;
}

function apertureProbes(scene) {
  const source = scene.elements.find(e => e.id === 'basic-source');
  const half = source.params.beamWidth / 2;
  return Array.from({ length: 25 }, (_, i) => {
    const elements = structuredClone(scene.elements);
    const ray = elements.find(e => e.id === source.id);
    const offset = rotPt(0, -half + 2 * half * i / 24, ray.rot);
    ray.x += offset.x; ray.y += offset.y; ray.params.beamMode = 'line';
    const traced = traceScene(elements, []);
    assert.equal(traced.writeHits.length, 1, 'every actual source-aperture sample reaches the resin');
    return traced;
  });
}

test('Basic relays both scanner pivots to a stationary pupil and focuses the full source aperture', () => {
  for (const pivot of ['basic-galvo-x', 'basic-galvo-y']) {
    for (const angle of [-0.25, 0, 0.25]) {
      const scene = freeze(load());
      scene.elements.find(e => e.id === pivot).params.commandAngle = angle;
      const objective = scene.elements.find(e => e.id === 'basic-objective');
      const pupil = toWorld(objective, objectiveBackFocalPlaneX(objective.params), 0);
      const traces = apertureProbes(scene);
      const hits = traces.map(t => t.writeHits[0]);
      near(Math.max(...hits.map(h => h.y)) - Math.min(...hits.map(h => h.y)), 0);
      hits.forEach(h => near(h.x, 550));
      if (angle === 0) near(hits[0].y, 310);
      else assert.ok(Math.abs(hits[0].y - 310) > 0.02, 'scanner motion moves the actual focus by more than20µm');
      const heights = traces.map(t => {
        for (const path of t.drawables.filter(d => d.type === 'path')) {
          for (let i = 1; i < path.pts.length; i++) {
            const a = path.pts[i - 1], b = path.pts[i];
            if (a.x < pupil.x && b.x >= pupil.x && a.y > 280 && a.y < 340) {
              return a.y + (b.y - a.y) * (pupil.x - a.x) / (b.x - a.x) - pupil.y;
            }
          }
        }
        throw new Error('ray does not cross the real objective pupil');
      });
      near((Math.min(...heights) + Math.max(...heights)) / 2, 0, 1e-5);
      assert.ok(Math.max(...heights.map(Math.abs)) < objectivePupilRadius(objective.params));
    }
  }
});

test('Basic source, polarization attenuation, Z defocus and persistence have causal effects', () => {
  const scene = freeze(load()), laser = scene.elements.find(e => e.id === 'basic-source');
  assert.equal(traceScene(scene.elements).writeHits.length, 1);
  for (const change of [{ enabled: false }, { enabled: true, avgPowerW: 0 }]) {
    Object.assign(laser.params, change);
    assert.equal(traceScene(scene.elements).writeHits.length, 0);
  }
  Object.assign(laser.params, { enabled: true, avgPowerW: 0.01 });
  const halfwave = scene.elements.find(e => e.id === 'basic-halfwave');
  halfwave.params.a = 45;
  assert.equal(traceScene(scene.elements).writeHits.length, 0);
  halfwave.params.a = 0;
  const stage = scene.elements.find(e => e.id === 'basic-resin');
  stage.x += 0.05;
  const hits = apertureProbes(scene).map(t => t.writeHits[0]);
  assert.ok(Math.max(...hits.map(h => h.y)) - Math.min(...hits.map(h => h.y)) > 0.04);
  const moving = load().elements.find(e => e.id === 'basic-resin');
  assert.notEqual(stageOffsetAt(moving.params, 0).y, stageOffsetAt(moving.params, 1).y);
  const round = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, ...scene }), registry);
  assert.deepEqual(round, scene);
  assert.deepEqual(traceScene(round.elements).writeHits, traceScene(scene.elements).writeHits);
});
