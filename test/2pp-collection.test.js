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

test('Gu conjugate relay selects seven separate metalens focal regions', async () => {
 const raw=await readFile(new URL('../collections/2pp/setups/gu-2025.json',import.meta.url),'utf8');
 const scene=parseSketch(raw,registry);
 const byId=id=>scene.elements.find(e=>e.id===id);
 const slm=byId('slm'), l1=byId('l1'), l2=byId('l2'), pbs=byId('pbs2'), fold=byId('fold'), array=byId('ml2');
 assert.equal((slm.x-9-pbs.x)+(l1.y-pbs.y),l1.params.f);
 assert.equal(l2.y-l1.y,l1.params.f+l2.params.f);
 assert.equal((fold.y-l2.y)+(fold.x-array.x),l2.params.f);
 const hits=()=>traceScene(scene.elements,scene.beams).signalHits.filter(h=>h.stageId==='stage'&&h.wavelengthNm===800);
 const groups=()=>[...new Set(hits().map(h=>Math.round((h.y-array.y)/9)))].sort((a,b)=>a-b);
 slm.params.layers[0].levels='1,1,1,1,1,1,1';
 assert.deepEqual(groups(),[-3,-2,-1,0,1,2,3]);
 for(let band=0;band<7;band++){
  slm.params.layers[0].levels=Array.from({length:7},(_,i)=>i===band?1:0).join(',');
  assert.deepEqual(groups(),[3-band],`SLM band ${band} must select only its conjugate lenslet`);
 }
 slm.params.layers[0].levels='1,1,1,1,1,1,1';
 const focused=hits(); array.params.f=60;
 assert.notDeepEqual(hits().map(h=>h.y),focused.map(h=>h.y),'metalens focal length must alter sample crossings');
 const active=traceScene(scene.elements,scene.beams);
 assert.ok(active.writeHits.length>0);
 assert.ok(active.signalHits.some(h=>h.stageId==='obsSample'),'observation illumination must reach its sample');
 byId('laser').params.avgPowerW=0;
 assert.equal(hits().length,0);
 assert.equal(traceScene(scene.elements,scene.beams).writeHits.length,0);
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
