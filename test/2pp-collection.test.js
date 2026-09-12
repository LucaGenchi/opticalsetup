import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { createElement, registry, getVisualBounds, stageOffsetAt } from '../sketch/js/elements.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { collectionSetupRequest } from '../sketch/js/collection-loader.js';
import { readCollectionSetups, reviewedPaperHandoff } from '../tools/2pp-collection-support.mjs';
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
  assert.equal(collectionSetupRequest(new URLSearchParams({ paper: 'nanoscribe-gt' })).path, '../collections/2pp/setups/nanoscribe-gt.json');
  for (const value of ['', '../secret', 'a/b', 'UPPER']) assert.equal(collectionSetupRequest(new URLSearchParams({ paper: value })), null);
});

test('Nanoscribe GT teaching scene loads, traces, scans, and preserves its native save state', async () => {
  const text = await readFile(new URL('../collections/2pp/setups/nanoscribe-gt.json', import.meta.url), 'utf8');
  const scene = parseSketch(text, registry);
  const byId = id => scene.elements.find(element => element.id === id);
  const source = byId('gt-source');
  const stage = byId('gt-stage');
  const galvos = [byId('gt-galvo-x'), byId('gt-galvo-y')];

  assert.equal(source.params.handoffBasis, 'interpretation');
  assert.equal(buildTwoPhotonHandoffUrl(source), null, 'invented values must not leave without supported provenance');
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
  source.params.avgPowerW = 0;
  assert.equal(traceScene(scene.elements).writeHits.length, 0, 'zero optical power cannot write');
  source.params.avgPowerW = 0.08;
  for (const galvo of galvos) galvo.params.scanMode = 'static';
  const staticHit = traceScene(scene.elements).signalHits[0];
  assert.ok(staticHit, 'static-galvo control retains a centred writing path');

  const saved = JSON.stringify({ app: 'optics2d', version: 1, elements: scene.elements, beams: scene.beams });
  assert.deepEqual(parseSketch(saved, registry), parseSketch(JSON.stringify(parseSketch(saved, registry)), registry));
  assert.equal(createElement('pulsedlaser').params.handoffBasis, 'user');
});

test('Nanoscribe discovery includes its scene with canonical collection links and no numeric preset', async () => {
  const { papers } = await load('../collections/2pp/papers.json');
  const setups = await readCollectionSetups(new URL('../collections/2pp/', import.meta.url).pathname, papers);
  assert.ok(setups.has('nanoscribe-gt'));
  assert.equal(reviewedPaperHandoff(papers.find(paper => paper.id === 'nanoscribe-gt')).url, null);
  const page = await readFile(new URL('../collections/2pp/nanoscribe-gt/index.html', import.meta.url), 'utf8');
  assert.match(page, /Open editable setup/);
  assert.match(page, /\/sketch\/\?paper=nanoscribe-gt&amp;edit=1/);
  // Collection pages link the canvas relatively, as every other section does.
  assert.match(page, /src="[^"]*sketch\/\?paper=nanoscribe-gt&amp;embed=1"/);
  assert.match(page, /setups\/nanoscribe-gt\.json/);
  assert.match(page, /research\/nanoscribe-gt\.md/);
  assert.match(page, /No calculator preset is supplied/);
});


test('Nanoscribe independently driven axes and fine piezo retain the computed resin route', async () => {
  const scene = parseSketch(await readFile(new URL('../collections/2pp/setups/nanoscribe-gt.json', import.meta.url), 'utf8'), registry);
  const galvos = scene.elements.filter(element => element.type === 'galvo');
  for (const active of galvos) {
    for (const galvo of galvos) galvo.params.scanMode = galvo === active ? 'sine' : 'static';
    active.params.scanPhaseDeg = 0;
    const hits = [0.25, 0.75].map(phase => {
      active._animationTimeS = phase / active.params.scanFrequencyHz;
      const traced = traceScene(scene.elements);
      assert.equal(traced.writeHits.length, 1);
      return traced.writeHits[0].y;
    });
    assert.notEqual(hits[0], hits[1], `${active.id} must move the focus independently`);
  }
  for (const galvo of galvos) galvo.params.scanMode = 'static';
  const stage = scene.elements.find(element => element.type === 'stage');
  stage.params.pzMode = 'xy';
  const materialHits = [0.75, 2.25].map(time => {
    const local = stageOffsetAt(stage.params, time);
    const moved = { ...stage, y: stage.y + local.x }; // the authored stage is rotated 90 degrees
    const traced = traceScene(scene.elements.map(element => element === stage ? moved : element));
    assert.equal(traced.writeHits.length, 1);
    return traced.writeHits[0].y - moved.y;
  });
  assert.ok(Math.abs(materialHits[0] - materialHits[1]) > 0.1, 'piezo movement changes where the focus meets the mounted material');
});

test('Nanoscribe Figure frame includes all component and text bounds', async () => {
  const scene = parseSketch(await readFile(new URL('../collections/2pp/setups/nanoscribe-gt.json', import.meta.url), 'utf8'), registry);
  const frame = getVisualBounds(scene.elements.find(element => element.type === 'figureframe'), { includeLabel: false });
  for (const element of scene.elements) {
    const bounds = getVisualBounds(element);
    assert.ok(bounds.x0 >= frame.x0 && bounds.x1 <= frame.x1
      && bounds.y0 >= frame.y0 && bounds.y1 <= frame.y1, `${element.id} must fit its export frame`);
  }
});

// The site lists collections under one hub rather than promoting a single
// subject in the header, and a collection page is dressed like every other
// section: the shared wiki shell, the shared header, one name for the canvas.
test('the collections hub lists 2PP, and collection pages wear the site chrome', async () => {
 const read = async p => readFile(new URL(p, import.meta.url), 'utf8');
 const hub = await read('../collections/index.html');
 assert.match(hub, /href="\.\.\/collections\/2pp\/"/, 'the hub links to the 2PP collection');
 const {papers} = await load('../collections/2pp/papers.json');
 assert.ok(hub.includes(`${papers.length} references`), 'the hub counts the references it links to');
 const landing = await read('../index.html');
 assert.match(landing, /href="\/collections\/">Collections</, 'the landing header offers Collections');
 assert.doesNotMatch(landing, /href="\/collections\/2pp\//, 'and does not link a single collection directly');
 for (const page of ['../collections/index.html', '../collections/2pp/index.html', '../collections/2pp/pearre-2018/index.html']) {
  const html = await read(page);
  assert.match(html, /wiki\/assets\/wiki\.css/, `${page} uses the shared site stylesheet`);
  assert.match(html, /collections\/assets\/collections\.css/, `${page} adds the collections sheet`);
  assert.match(html, /class="site-header"/, `${page} uses the shared header`);
  assert.match(html, /class="btn" href="[^"]*\/sketch\/">Open the canvas</, `${page} names the canvas the way the rest of the site does`);
  assert.doesNotMatch(html, />Workbench</, `${page} does not invent another name for the canvas`);
  assert.match(html, /href="[^"]*\/collections\/">Collections</, `${page} keeps the hub in its nav`);
 }
 // Every generated section shares that header, so the nav cannot drift apart.
 for (const page of ['../wiki/index.html', '../example-setups/index.html', '../community/index.html']) {
  assert.match(await read(page), /href="[^"]*\/collections\/">Collections</, `${page} lists Collections too`);
 }
 assert.match(await read('../sitemap.xml'), /<loc>https:\/\/opticalsetup\.com\/collections\/<\/loc>/);
});
