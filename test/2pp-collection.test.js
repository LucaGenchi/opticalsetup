import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registry} from '../sketch/js/elements.js';
import {parseSketch} from '../sketch/js/state.js';
import {traceScene} from '../sketch/js/raytrace.js';
import {buildPaperHandoff} from '../sketch/js/two-photon-handoff.js';
const load=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));

test('paper identities and source files have explicit provenance and unresolved values',async()=>{
 const {papers}=await load('../collections/2pp/papers.json');
 const {documents}=await load('../collections/2pp/sources.json');
 assert.equal(new Set(papers.map(p=>p.id)).size,17);
 assert.equal(documents.length,19);
 for(const d of documents){assert.match(d.sha256,/^[a-f0-9]{64}$/);assert.ok(d.pages>0);assert.ok(new URL(d.url));}
 const dong=papers.find(p=>p.id==='dong-2007');assert.equal(dong.doi,'10.1063/1.2789661');
 const gu=papers.find(p=>p.id==='gu-2025');assert.equal(gu.settings.pulseDurationFs,35);
 const gittard=papers.find(p=>p.id==='gittard-2011');assert.equal(gittard.settings.pulseDurationFs,undefined,'an upper bound is not an exact value');
 const zhang=papers.find(p=>p.id==='zhang-2024');assert.equal(zhang.settings.sourcePowerMw,undefined,'maximum capacity is not operating power');
});

test('Gu scene traces the reported amplitude-gated metalens route into resin',async()=>{
 const raw=await readFile(new URL('../collections/2pp/setups/gu-2025.json',import.meta.url),'utf8');
 const scene=parseSketch(raw,registry);
 const source=scene.elements.find(e=>e.id==='laser');
 const slm=scene.elements.find(e=>e.id==='slm');
 const array=scene.elements.find(e=>e.id==='ml2');
 assert.deepEqual(
  {wavelength:source.params.wavelength,rate:source.params.repRateMHz,duration:source.params.pulseWidthFs,power:source.params.avgPowerW},
  {wavelength:800,rate:0.001,duration:35,power:7}
 );
 assert.equal(slm.params.layers[0].type,'amplitude');
 assert.equal(array.type,'metalensarray');
 const baseline=traceScene(scene.elements,scene.beams);
 const hits=baseline.signalHits.filter(hit=>hit.stageId==='stage');
 assert.ok(hits.length>0);
 assert.deepEqual([...new Set(hits.map(hit=>hit.sourceId))],['laser']);
 assert.ok(baseline.drawables.every(d=>(d.pts||[]).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))));

 const off=parseSketch(raw,registry);off.elements.find(e=>e.id==='laser').params.enabled=false;
 assert.equal(traceScene(off.elements,off.beams).signalHits.filter(hit=>hit.stageId==='stage').length,0);
 const masked=parseSketch(raw,registry);masked.elements.find(e=>e.id==='slm').params.layers[0].levels='0,0,0,0,0,0,0';
 assert.equal(traceScene(masked.elements,masked.beams).signalHits.filter(hit=>hit.stageId==='stage').length,0);

 const roundTrip=parseSketch(JSON.stringify(scene),registry);
 assert.deepEqual(roundTrip,scene);
});

test('Gu paper handoff preserves kHz and out-of-range provenance',async()=>{
 const {papers}=await load('../collections/2pp/papers.json');
 const result=buildPaperHandoff(papers.find(p=>p.id==='gu-2025').settings,'https://example.test/lab');
 assert.deepEqual(result.imported.map(item=>item.key),['wavelengthNm','numericalAperture']);
 assert.deepEqual(result.omitted.map(item=>item.key),['sourcePowerMw','repetitionRateMHz','pulseDurationFs']);
 const url=new URL(result.url);
 assert.equal(url.searchParams.get('wavelengthNm'),'800');
 assert.equal(url.searchParams.get('numericalAperture'),'0.8');
 assert.equal(url.searchParams.has('repetitionRateMHz'),false);
});
