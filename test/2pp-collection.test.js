import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registry} from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import {parseSketch} from '../sketch/js/state.js';
import {traceScene} from '../sketch/js/raytrace.js';
import {examples} from '../sketch/js/examples-data.js';
const load=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));

test('all referenced apparatus files load, remain editable, and never pass annotations off as traced rays',async()=>{
 const manifest=await load('../collections/2pp/scene-manifest.json');
 assert.equal(manifest.length,17);
 const missing=manifest.filter(p=>p.status==='full-text-needed');
 assert.deepEqual(missing.map(p=>p.id),['dong-2007','yang-2015','yan-2015']);
 assert.ok(missing.every(p=>p.setups.length===0));
 const setups=manifest.flatMap(p=>p.setups);assert.equal(setups.length,15);
 for(const s of setups){
  assert.ok(examples.some(e=>e.slug===s.slug),s.slug);
  const raw=await load(`..${decodeURIComponent(s.file)}`);
  const scene=parseSketch(raw,registry);
  assert.equal(scene.elements.length,raw.elements.length);
  assert.ok(scene.beams.length>0);
  assert.ok(scene.beams.every(b=>b.dash===true),s.name);
  assert.equal(traceScene(scene.elements).drawables.length,0,s.name);
  assert.deepEqual(parseSketch(JSON.stringify(scene),registry),scene,`${s.name} save round trip`);
 }
});

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
