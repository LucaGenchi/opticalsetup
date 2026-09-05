import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { createElement, registry } from '../sketch/js/elements.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { collectionSetupPath } from '../sketch/js/collection-setups.js';
import { buildTwoPhotonHandoffUrl } from '../sketch/js/two-photon-handoff.js';
const load=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));

test('paper identities and source files have explicit provenance and unresolved values',async()=>{
 const {papers}=await load('../collections/2pp/papers.json');
 const {documents}=await load('../collections/2pp/sources.json');
 assert.equal(new Set(papers.map(p=>p.id)).size,17);
 assert.equal(documents.length,18);
 for(const d of documents){assert.match(d.sha256,/^[a-f0-9]{64}$/);assert.ok(d.pages>0);assert.ok(new URL(d.url));}
 const dong=papers.find(p=>p.id==='dong-2007');assert.equal(dong.doi,'10.1063/1.2789661');
 const gu=papers.find(p=>p.id==='gu-2025');assert.equal(gu.settings.pulseDurationFs,undefined);
 const gittard=papers.find(p=>p.id==='gittard-2011');assert.equal(gittard.settings.pulseDurationFs,undefined,'an upper bound is not an exact value');
 const zhang=papers.find(p=>p.id==='zhang-2024');assert.equal(zhang.settings.sourcePowerMw,undefined,'maximum capacity is not operating power');
});

test('collection setup paths accept only slugs', () => {
  assert.equal(collectionSetupPath('nanoscribe-gt'), '../collections/2pp/setups/nanoscribe-gt.json');
  for (const value of ['', '../secret', 'a/b', 'UPPER', null]) assert.equal(collectionSetupPath(value), null);
});

test('Nanoscribe GT teaching scene loads, traces, scans, and preserves its native save state', async () => {
  const text = await readFile(new URL('../collections/2pp/setups/nanoscribe-gt.json', import.meta.url), 'utf8');
  const scene = parseSketch(text, registry);
  const byId = id => scene.elements.find(element => element.id === id);
  const source = byId('gt-source');
  const stage = byId('gt-stage');
  const galvos = [byId('gt-galvo-x'), byId('gt-galvo-y')];

  assert.equal(source.params.handoffBasis, 'interpretation');
  assert.equal(new URL(buildTwoPhotonHandoffUrl(source)).searchParams.get('basis'), 'interpretation');
  assert.equal(stage.params.pzTravelXY, 0.3);
  assert.equal(stage.params.pzTravelZ, 0.3);
  assert.ok(Math.abs(2 * stage.params.pzTravelXY * stage.params.pzFreqXY - 0.1) < 1e-12,
    'the optional 300 um triangle sweep is configured for the reported 100 um/s typical piezo speed');

  const at = seconds => scene.elements.map(element => galvos.includes(element)
    ? { ...element, _animationTimeS: seconds }
    : element);
  const first = traceScene(at(0));
  const later = traceScene(at(0.0025));
  assert.ok(first.signalHits.some(hit => hit.stageId === stage.id));
  assert.ok(first.writeHits.some(hit => hit.stageId === stage.id));
  assert.ok(later.signalHits.some(hit => hit.stageId === stage.id));
  assert.notEqual(first.signalHits[0].y, later.signalHits[0].y,
    'moving galvos must move the computed sample hit');

  source.params.enabled = false;
  assert.equal(traceScene(scene.elements).signalHits.length, 0, 'laser-off control removes the writing path');
  source.params.enabled = true;
  for (const galvo of galvos) galvo.params.scanMode = 'static';
  const staticHit = traceScene(scene.elements).signalHits[0];
  assert.ok(staticHit, 'static-galvo control retains a centred writing path');

  const saved = JSON.stringify({ app: 'optics2d', version: 1, elements: scene.elements, beams: scene.beams });
  assert.deepEqual(parseSketch(saved, registry), parseSketch(JSON.stringify(parseSketch(saved, registry)), registry));
  assert.equal(createElement('pulsedlaser').params.handoffBasis, 'user');
});

test('only the assigned Nanoscribe record publishes a collection setup', async () => {
  const { papers } = await load('../collections/2pp/papers.json');
  assert.deepEqual(papers.filter(paper => paper.setup).map(paper => paper.id), ['nanoscribe-gt']);
  const page = await readFile(new URL('../collections/2pp/nanoscribe-gt/index.html', import.meta.url), 'utf8');
  assert.match(page, /Open editable setup/);
  assert.match(page, /\/sketch\/\?setup=nanoscribe-gt&amp;collectionMode=edit/);
  assert.match(page, /<iframe src="\/sketch\/\?setup=nanoscribe-gt"/);
  assert.match(page, /setups\/nanoscribe-gt\.json/);
  assert.match(page, /research\/nanoscribe-gt\.md/);
});
