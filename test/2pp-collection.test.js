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
