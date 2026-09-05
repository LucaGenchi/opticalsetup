import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
