import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { parseSketch } from '../sketch/js/state.js';
import { registry } from '../sketch/js/elements.js';
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

test('the Somers native paper setup is included and is reloadable',async()=>{
 const {setups}=await load('../collections/2pp/setups/manifest.json');
 assert.ok(setups.some(s=>s.id==='somers-2021'));
 const text=await readFile(new URL('../collections/2pp/setups/somers-2021.json',import.meta.url),'utf8');
 const scene=parseSketch(text,registry);
 assert.ok(scene.elements.some(e=>e.id==='somers-laser'&&e.params.repRateMHz===0.005));
 assert.ok(scene.elements.some(e=>e.id==='somers-dmd'&&e.params.disperseSpectrum&&e.params.sequence));
 assert.ok(scene.elements.some(e=>e.id==='somers-stage'&&e.params.specimenType==='resin'));
 const reloaded=parseSketch(JSON.stringify(scene),registry);
 assert.deepEqual(reloaded,scene);
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
