import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { registry } from '../sketch/js/elements.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { buildPaperHandoff, twoPhotonHandoffCandidates } from '../sketch/js/two-photon-handoff.js';
import { twoPhotonSetups } from '../sketch/js/two-photon-setups-data.js';

const sceneUrl = new URL('../collections/2pp/setups/yan-2015.json', import.meta.url);

async function loadScene() {
  return parseSketch(await readFile(sceneUrl, 'utf8'), registry);
}

test('Yan mechanism interpretation traces four nonzero SLM orders into resin', async () => {
  const scene = await loadScene();
  const result = traceScene(scene.elements, scene.beams);
  assert.equal(result.signalHits.length, 4);
  assert.equal(result.writeHits.length, 4);
  assert.ok(result.signalHits.every(hit => hit.stageId === 'yan-resin-stage'));
  assert.ok(result.signalHits.every(hit => hit.sourceId === 'yan-laser'));
  assert.deepEqual(
    result.signalHits.map(hit => Number(hit.x.toFixed(3))),
    [526.817, 522.244, 517.756, 513.183],
  );
});

test('Yan source interlock and SLM order control change the computed sample hits', async () => {
  const scene = await loadScene();
  scene.elements.find(el => el.id === 'yan-laser').params.enabled = false;
  assert.equal(traceScene(scene.elements).signalHits.length, 0);

  const twoOrder = await loadScene();
  twoOrder.elements.find(el => el.id === 'yan-slm').params.layers[0].orders = '-1,1';
  assert.equal(traceScene(twoOrder.elements).signalHits.length, 2);
});

test('Yan Fourier stop removes the computed zeroth order', async () => {
  const scene = await loadScene();
  const withoutStop = scene.elements.filter(el => el.id !== 'yan-zero-dump');
  const hits = traceScene(withoutStop).signalHits;
  assert.equal(hits.length, 5);
  assert.ok(hits.some(hit => Math.abs(hit.x - 520) < 1e-6), 'unfiltered zeroth order reaches the sample centre');
});

test('Yan scene round-trips and exposes no invented paper handoff values', async () => {
  const scene = await loadScene();
  const reloaded = parseSketch(JSON.stringify(scene), registry);
  assert.deepEqual(reloaded, scene);
  assert.deepEqual(twoPhotonSetups, [{
    slug: 'yan-2015',
    path: '../collections/2pp/setups/yan-2015.json',
  }]);
  const handoff = buildPaperHandoff({});
  assert.equal(handoff.url, null);
  assert.equal(handoff.imported.length, 0);
  assert.equal(handoff.omitted.length, 5);
  const trace = traceScene(reloaded.elements);
  assert.deepEqual(twoPhotonHandoffCandidates(reloaded.elements, trace.signalHits, 'yan-resin-stage'), [],
    'invented source settings must remain excluded after native save/reload');
});


test('Yan focuses finite-width order bundles at the front resin plane', async () => {
  const scene = await loadScene();
  const stage = scene.elements.find(element => element.id === 'yan-resin-stage');
  const objective = scene.elements.find(element => element.id === 'yan-objective');
  assert.equal(objective.rot, 270, 'the objective front faces the sample');
  assert.equal(stage.y, objective.y - 16 - objective.params.workingDistance);
  const arrivals = traceScene(scene.elements).drawables.flatMap(drawable => drawable.pts || [])
    .filter(point => Math.abs(point.y - stage.y) < 1e-7);
  assert.ok(arrivals.length >= 4 * 25, 'sized source rays reach the resin');
  assert.equal(new Set(arrivals.map(point => point.x.toFixed(6))).size, 4,
    'all sampled rays converge to four distinct points, not four unfocused intersections');
  stage.y -= 5;
  const defocused = traceScene(scene.elements).drawables.flatMap(drawable => drawable.pts || [])
    .filter(point => Math.abs(point.y - stage.y) < 1e-7);
  assert.ok(new Set(defocused.map(point => point.x.toFixed(6))).size > 4,
    'moving the resin out of focus spreads each bundle at the physical sample plane');
});
