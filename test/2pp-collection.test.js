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

test('the reviewed Saha apparatus is included as a working collection scene',async()=>{
 const {papers}=await load('../collections/2pp/papers.json');
 const working=papers.filter(p=>p.scene);
 assert.ok(working.some(p=>p.id==='saha-2019'));
 const assigned = working.find(p=>p.id==='saha-2019');
 assert.equal(assigned.scene,'setups/saha-2019.json');
 assert.equal(assigned.researchNote,'research/saha-2019.md');
 await readFile(new URL(`../collections/2pp/${assigned.scene}`,import.meta.url),'utf8');
 await readFile(new URL(`../collections/2pp/${assigned.researchNote}`,import.meta.url),'utf8');
});

// The site lists collections under one hub rather than promoting a single
// subject in the header: 2PP is one collection, not a top-level destination.
test('the collections hub lists 2PP and the landing page links to the hub, not into it', async () => {
 const read = async p => readFile(new URL(p, import.meta.url), 'utf8');
 const hub = await read('../collections/index.html');
 assert.match(hub, /href="\/collections\/2pp\/"/, 'the hub links to the 2PP collection');
 const {papers} = await load('../collections/2pp/papers.json');
 assert.ok(hub.includes(`${papers.length} references`), 'the hub counts the references it links to');
 const landing = await read('../index.html');
 assert.match(landing, /href="\/collections\/">Collections</, 'the landing header offers Collections');
 assert.doesNotMatch(landing, /href="\/collections\/2pp\//, 'and does not link a single collection directly');
 // Every generated collection page navigates back to the hub and shares its stylesheet.
 for (const page of ['../collections/2pp/index.html', '../collections/2pp/pearre-2018/index.html']) {
  const html = await read(page);
  assert.match(html, /href="\/collections\/">Collections</, `${page} keeps the hub in its nav`);
  assert.match(html, /href="\/collections\/style\.css"/, `${page} uses the shared collections stylesheet`);
 }
 assert.match(await read('../sitemap.xml'), /<loc>https:\/\/opticalsetup\.com\/collections\/<\/loc>/);
});
