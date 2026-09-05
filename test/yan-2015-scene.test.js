import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { registry } from '../sketch/js/elements.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { buildPaperHandoff } from '../sketch/js/two-photon-handoff.js';
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
    [538.372, 526.046, 513.954, 501.628],
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
});
