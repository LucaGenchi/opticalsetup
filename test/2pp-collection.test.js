import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {readCollectionSetups} from '../tools/2pp-collection-support.mjs';
const load=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));

test('paper identities and source files have explicit provenance and unresolved values',async()=>{
 const {papers,introduction}=await load('../collections/2pp/papers.json');
 const archive=await load('../collections/2pp/research/archive.json');
 const {documents}=await load('../collections/2pp/sources.json');
 assert.equal(new Set(papers.map(p=>p.id)).size,5);
 assert.equal(introduction.id,'basic-2pp');
 assert.equal(introduction.status,'designed');
 assert.ok(papers.every(p=>p.id!=='nanoscribe-gt'));
 assert.ok(archive.papers.every(p=>p.status==='research-only'&&p.id!=='nanoscribe-gt'&&p.exclusionReason));
 for(const d of documents){assert.match(d.sha256,/^[a-f0-9]{64}$/);assert.ok(d.pages>0);assert.ok(new URL(d.url));}
 for(const p of papers)for(const filename of p.documents)assert.ok(documents.some(d=>d.paper===p.id&&d.filename===filename));
 const dong=archive.papers.find(p=>p.id==='dong-2007');assert.equal(dong.doi,'10.1063/1.2789661');
 const gu=papers.find(p=>p.id==='gu-2025');assert.equal(gu.settings.pulseDurationFs,35,'verified complete author manuscript supersedes the old missing-duration note');
 const gittard=papers.find(p=>p.id==='gittard-2011');assert.equal(gittard.settings.pulseDurationFs,undefined,'an upper bound is not an exact value');
 const zhang=archive.papers.find(p=>p.id==='zhang-2024');assert.equal(zhang.settings.sourcePowerMw,undefined,'maximum capacity is not operating power');
});

test('only Basic and five selected papers have native collection scenes or public scene pages',async()=>{
 const records=await load('../collections/2pp/papers.json');
 const directory=new URL('../collections/2pp/',import.meta.url);
 const expected=[records.introduction.id,...records.papers.map(p=>p.id)].sort();
 const files=(await readdir(new URL('setups/',directory))).filter(f=>f.endsWith('.json')&&f!=='manifest.json').map(f=>f.slice(0,-5)).sort();
 assert.deepEqual(files,expected);
 const setups=await readCollectionSetups(directory.pathname,[records.introduction,...records.papers]);
 assert.deepEqual([...setups.keys()].sort(),expected);
 for(const id of ['nanoscribe-gt','pearre-2018','kiefer-2024','saha-2019','dong-2007','yan-2015']){
  await assert.rejects(access(new URL(`${id}/index.html`,directory)));
 }
 const archivePage=await readFile(new URL('research/index.html',directory),'utf8');
 assert.match(archivePage,/no native setup/);
 assert.doesNotMatch(archivePage,/paper=(?:nanoscribe-gt|pearre-2018|kiefer-2024|saha-2019|dong-2007|yan-2015)/);
});

// The site lists collections under one hub rather than promoting a single
// subject in the header, and a collection page is dressed like every other
// section: the shared wiki shell, the shared header, one name for the canvas.
test('the collections hub lists 2PP, and collection pages wear the site chrome', async () => {
 const read = async p => readFile(new URL(p, import.meta.url), 'utf8');
 const hub = await read('../collections/index.html');
 assert.match(hub, /href="\.\.\/collections\/2pp\/"/, 'the hub links to the 2PP collection');
 const {papers} = await load('../collections/2pp/papers.json');
 assert.ok(hub.includes('6 setups')&&hub.includes(`${papers.length} paper architectures`), 'the hub counts the six authored scenes');
 const landing = await read('../index.html');
 assert.match(landing, /href="\/collections\/">Collections</, 'the landing header offers Collections');
 assert.doesNotMatch(landing, /href="\/collections\/2pp\//, 'and does not link a single collection directly');
 for (const page of ['../collections/index.html', '../collections/2pp/index.html', '../collections/2pp/basic-2pp/index.html','../collections/2pp/fischer-2011/index.html','../collections/2pp/research/index.html']) {
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
