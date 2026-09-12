import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { registry } from '../sketch/js/elements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { buildPaperHandoff } from '../sketch/js/two-photon-handoff.js';
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

test('Ouyang scene is native, reload-stable, traced to resin, and honest at handoff',async()=>{
 const raw=await readFile(new URL('../collections/2pp/setups/ouyang-2023.json',import.meta.url),'utf8');
 const scene=parseSketch(raw,registry);
 assert.equal(scene.beams.length,0,'the scene must not fake optical paths with manual beams');
 const types=scene.elements.map(element=>element.type);
 for(const type of ['pulsedlaser','hwp','pbs','grating','lens','dmd','slit','dichroic','objective','stage','mirror','camera']){
  assert.ok(types.includes(type),`missing native ${type}`);
 }
 const dmd=scene.elements.find(element=>element.id==='ouyang-dmd');
 assert.equal(dmd.params.pattern,'hologram');
 assert.equal(dmd.params.focusCount,3);
 const traced=traceScene(scene.elements,scene.beams);
 assert.ok(traced.writeHits.some(hit=>hit.stageId==='ouyang-stage' && hit.sourceId===undefined));
 assert.ok(traced.signalHits.some(hit=>hit.stageId==='ouyang-stage'
  && hit.sourceId==='ouyang-laser' && hit.objectiveNA===1.3));
 const camera=detectorReading('ouyang-ccd');
 assert.equal(camera?.wavelength,589);
 assert.ok(camera?.signal>0);

 const normalized={app:'optics2d',version:1,elements:scene.elements,beams:scene.beams};
 assert.deepEqual(parseSketch(JSON.stringify(normalized),registry),scene,'normalized save must reload identically');

 const {papers}=await load('../collections/2pp/papers.json');
 const handoff=buildPaperHandoff(papers.find(p=>p.id==='ouyang-2023').settings);
 assert.deepEqual(handoff.imported.map(field=>field.key),['wavelengthNm','pulseDurationFs','numericalAperture']);
 assert.deepEqual(handoff.omitted.filter(field=>field.value!==null).map(field=>field.key),
  ['sourcePowerMw','repetitionRateMHz']);
});

test('Ouyang control experiments change the traced focal group at the resin',async()=>{
 const raw=await readFile(new URL('../collections/2pp/setups/ouyang-2023.json',import.meta.url),'utf8');
 const scene=parseSketch(raw,registry);
 const dmd=scene.elements.find(e=>e.id==='ouyang-dmd');
 const laser=scene.elements.find(e=>e.id==='ouyang-laser');
 const slit=scene.elements.find(e=>e.id==='ouyang-filter');
 const hits=()=>traceScene(scene.elements,scene.beams).signalHits.filter(h=>
  h.stageId==='ouyang-stage'&&h.sourceId===laser.id&&h.wavelengthNm===800);
 const baseline=hits(); assert.equal(baseline.length,3);
 dmd.params.focusCount=1; assert.equal(hits().length,1);
 dmd.params.focusCount=3;dmd.params.scanAngle=1;
 const shifted=hits(); assert.equal(shifted.length,3);
 assert.ok(shifted.every((h,i)=>Math.abs(h.x-baseline[i].x)>0.05));
 dmd.params.scanAngle=0;slit.params.gap=4;assert.equal(hits().length,1);
 slit.params.gap=24;laser.params.avgPowerW=0;
 assert.equal(hits().length,0);
 assert.ok(detectorReading('ouyang-ccd')?.signal>0,'independent observation light survives');
 laser.params.avgPowerW=2;assert.deepEqual(hits(),baseline,'positive source power preserves normalized geometry');
 laser.params.enabled=false;assert.equal(hits().length,0);
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
