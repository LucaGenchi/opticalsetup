// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { examples } from '../tools/patterns/systems.mjs';
import { registry } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';
import { validateExample, setupSVG } from '../tools/patterns/diagram.mjs';

const counts={LINK:9,QUANT:9,SENSE:10,COMPUTE:8,DISPLAY:8,CONTROL:9};
const byId=id=>examples.find(e=>e.id===id);
const close=(actual,expected,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);
function finite(value) {
 if(typeof value==='number') assert.ok(Number.isFinite(value));
 else if(Array.isArray(value)) value.forEach(finite);
 else if(value&&typeof value==='object') Object.values(value).forEach(finite);
}
function run(id,edit=()=>{}) {
 const s=parseSketch(structuredClone(byId(id).scene),registry);edit(s.elements);finite(s);
 const result=traceScene(s.elements,s.beams);finite(result);
 // Snapshot readings: another trace replaces the tracer's detector cache.
 const readings=Object.fromEntries(s.elements.filter(e=>registry[e.type].readoutKind).map(e=>[e.id,structuredClone(enhancedReading(e,s.elements))]));
 return name=>readings[name];
}
test('all 53 assigned survey records expose honest native availability',()=>{
 assert.equal(examples.length,53);const ids=new Set(examples.map(e=>e.id));assert.equal(ids.size,53);
 for(const [group,count] of Object.entries(counts))for(let i=1;i<=count;i++)assert.ok(ids.has(`${group}-${String(i).padStart(2,'0')}`));
 assert.ok(examples.filter(e=>e.mode==='rays').length>=18,'represent supported optical layouts instead of blanket rejection');
});
for(const e of examples)test(`${e.id}: native setup or exact missing capability, never a mockup`,()=>{
 validateExample(e);assert.ok(e.title&&e.summary&&e.limit&&e.steps.length>=2);
 assert.equal(e.nodes,undefined);assert.equal(e.edges,undefined);
 for(const ref of e.references){assert.ok(ref.label.length>10);assert.equal(new URL(ref.url).protocol,'https:');}
 if(e.mode==='unavailable'){assert.equal(e.scene,undefined);assert.ok(e.unavailableReason.length>70);return;}
 assert.equal(e.mode,'rays');assert.ok(e.scene.elements.some(el=>registry[el.type].source));
 assert.ok(e.scene.elements.every(el=>!['box','textlabel','arrowann','highlight','figureframe'].includes(el.type)));
 assert.deepEqual(e.scene.beams,[]);
 assert.equal(new Set(e.scene.elements.map(el=>el.id)).size,e.scene.elements.length);
 const s=parseSketch(e.scene,registry);finite(s);finite(traceScene(s.elements,s.beams));
 const svg=setupSVG(e);assert.ok(svg.includes('<svg'));assert.ok(!/NaN|Infinity|undefined/.test(svg));
 assert.equal(svg,setupSVG(e));
});
test('LINK-01 drops only 1550 nm and adds a separate replacement; missed-band boundary',()=>{
 const a=run('LINK-01');close(a('drop-detector').wavelength,1550);close(a('drop-detector').signal,1);
 assert.deepEqual(a('bus-output').sourceFractions.map(s=>s.sourceId).sort(),['carrier-1530','carrier-1570','replacement']);
 const b=run('LINK-01',es=>es.find(e=>e.id==='drop-filter').params.center=1500);assert.equal(b('drop-detector'),null);
 close(b('add-reject').signal,1);assert.ok(!b('bus-output').sourceFractions.some(s=>s.sourceId==='carrier-1550'));
});
test('LINK-02 phase drive moves power between complementary native camera ports',()=>{
 let a=run('LINK-02');close(a('port-a').signal,1);close(a('port-b').signal,0);
 let b=run('LINK-02',es=>es.find(e=>e.id==='phase').params.depthDeg=180);close(b('port-a').signal,0);close(b('port-b').signal,1);
 let c=run('LINK-02',es=>es.find(e=>e.id==='phase').params.depthDeg=90);close(c('port-a').signal,.5);close(c('port-b').signal,.5);
});
test('LINK-03 quadrature contributions combine and single-arm zero boundary stays physical',()=>{
 let a=run('LINK-03');close(a('port-a').signal,.25);close(a('port-b').signal,.25);
 let b=run('LINK-03',es=>es.find(e=>e.id==='q-amplitude').params.ratio=0);close(b('port-a').signal,.125);close(b('port-b').signal,.125);
 let c=run('LINK-03',es=>es.find(e=>e.id==='q-phase').params.depthDeg=0);close(c('port-a').signal,.5);close(c('port-b').signal,0);
});
test('SENSE-01 actual quarter-wave return reaches orthogonal PBS port, aligned axis suppresses it',()=>{
 const a=run('SENSE-01');close(a('receive').signal,1);assert.equal(a('receive').polarization,'Linear 90°');
 const b=run('SENSE-01',es=>es.find(e=>e.id==='quarter-wave').params.a=0);assert.equal(b('receive'),null);
});
test('SENSE-02 mirror displacement doubles propagated pulse delay, missing reflection removes return',()=>{
 const a=run('SENSE-02');assert.ok(a('return').pulse.earliestPathDelayNs>a('reference').pulse.earliestPathDelayNs);
 const b=run('SENSE-02',es=>es.find(e=>e.id==='target').y+=100);
 close(b('return').pulse.earliestPathDelayNs-a('return').pulse.earliestPathDelayNs,200/299.792458);
 const c=run('SENSE-02',es=>es.find(e=>e.id==='target').params.refl=0);assert.equal(c('return'),null);
});
test('SENSE-04 fluorescent spot motion changes image centroid and zero emission removes it',()=>{
 const a=run('SENSE-04');assert.ok(a('spot-camera').signal>0);close(a('spot-camera').centroid,0);
 const b=run('SENSE-04',es=>es.find(e=>e.id==='spot').x+=5);close(b('spot-camera').centroid,5);
 const c=run('SENSE-04',es=>es.find(e=>e.id==='spot').params.channels[0].eff=0);assert.equal(c('spot-camera'),null);
});
test('SENSE-07 two spectral side channels and pump channel are independently traceable',()=>{
 const a=run('SENSE-07');close(a('forward-pump').wavelength,488);close(a('green').wavelength,530);close(a('red').wavelength,610);
 const b=run('SENSE-07',es=>es.find(e=>e.id==='sample').params.channels[1].eff=0);assert.equal(b('red'),null);assert.ok(b('green').signal>0);
});
test('COMPUTE-01 actual tilted-reference interference differs from deposited ray power',()=>{
 const a=run('COMPUTE-01');assert.ok(a('port-a').profile);assert.equal(a('port-a').profileMode,'coherent');
 const b=run('COMPUTE-01',es=>es.filter(e=>e.type==='camera').forEach(e=>e.params.interference=false));
 assert.equal(b('port-a').profileMode,'deposited');assert.notDeepEqual(a('port-a').profile,b('port-a').profile);
});
test('COMPUTE-02 four phase steps produce complementary acquisition readings',()=>{
 const signals=[0,90,180,270].map(depth=>{const a=run('COMPUTE-02',es=>es.find(e=>e.id==='phase').params.depthDeg=depth);close(a('port-a').signal+a('port-b').signal,1);return a('port-a').signal;});
 [1,.5,0,.5].forEach((expected,i)=>close(signals[i],expected));
 const b=run('COMPUTE-02',es=>es.filter(e=>e.type==='camera').forEach(e=>e.params.interference=false));close(b('port-a').signal,.5);
});
test('COMPUTE-07 actual known-defocus camera broadens while focused branch is unchanged',()=>{
 const a=run('COMPUTE-07');close(a('focus-camera').spotSpan,0);close(a('defocus-camera').spotSpan,1.2);
 const b=run('COMPUTE-07',es=>es.find(e=>e.id==='defocus-camera').y-=10);close(b('defocus-camera').spotSpan,0);close(b('focus-camera').signal,.5);
});
test('DISPLAY-01 native model eye receives both overlay and world, transparent combiner removes overlay',()=>{
 const a=run('DISPLAY-01');assert.deepEqual(a('observer-eye').spectrum.map(s=>s.wavelength),[532,640]);
 const b=run('DISPLAY-01',es=>es.find(e=>e.id==='combiner').params.ratio=1);assert.deepEqual(b('observer-eye').spectrum.map(s=>s.wavelength),[640]);
});
test('DISPLAY-06 physical walls collect rays that would miss narrow detector',()=>{
 const a=run('DISPLAY-06');assert.ok(a('receiver').signal>.9);
 const b=run('DISPLAY-06',es=>es.filter(e=>e.id.endsWith('-wall')).forEach(e=>e.y+=200));assert.ok(b('receiver').signal<.4);
});
test('DISPLAY-07 primary and secondary deliver angular solar samples and removal loses folded receiver',()=>{
 const a=run('DISPLAY-07');assert.ok(a('receiver').signal>.5);assert.ok(a('receiver').spotSpan<2);
 const b=run('DISPLAY-07',es=>es.find(e=>e.id==='secondary').y+=100);assert.ok((b('receiver')?.signal||0)<.05);
});
test('CONTROL-01 manual actuator changes actual delivery/monitor powers and zero blocks both',()=>{
 const a=run('CONTROL-01');close(a('delivery').detectedPowerW,.0076);close(a('monitor').detectedPowerW,.0004);
 const b=run('CONTROL-01',es=>es.find(e=>e.id==='actuator').params.trans=0);assert.equal(b('delivery'),null);assert.equal(b('monitor'),null);
});
test('CONTROL-02 two mirror adjustments affect two actual diagnostic centroids',()=>{
 const a=run('CONTROL-02');assert.ok(a('near-camera').signal>0&&a('far-camera').signal>0);
 const b=run('CONTROL-02',es=>es.find(e=>e.id==='steerer-1').rot+=.1);
 assert.ok(Math.abs(b('near-camera').centroid-a('near-camera').centroid)>.1);
 assert.ok(Math.abs(b('far-camera').centroid-a('far-camera').centroid)>.05);
 const c=run('CONTROL-02',es=>es.find(e=>e.id==='far-lens').x+=100);assert.ok(c('far-camera').spotSpan>1);
});
test('CONTROL-05 axial reflective reference motion supplies native return centroid change',()=>{
 const a=run('CONTROL-05');close(a('focus-camera').centroid,12.56);
 const b=run('CONTROL-05',es=>es.find(e=>e.id==='reference-plane').x+=10);close(b('focus-camera').centroid,10);
 const c=run('CONTROL-05',es=>es.find(e=>e.id==='quarter-wave').params.a=0);assert.equal(c('focus-camera'),null);
});
test('CONTROL-06 native power normalization holds under source changes and opaque boundary',()=>{
 const a=run('CONTROL-06');close(a('sample-meter').detectedPowerW/a('reference-meter').detectedPowerW,.6);
 const b=run('CONTROL-06',es=>es.find(e=>e.id==='source').params.avgPowerW=.02);close(b('sample-meter').detectedPowerW,2*a('sample-meter').detectedPowerW);
 const c=run('CONTROL-06',es=>es.find(e=>e.id==='sample').params.transmission=0);assert.equal(c('sample-meter'),null);assert.ok(c('reference-meter').signal>0);
});
test('CONTROL-08 three native branches distinguish direct pupil size from focused spot',()=>{
 const a=run('CONTROL-08');close(a('main-camera').signal,.6);close(a('direct-camera').signal,.2);close(a('direct-camera').spotSpan,6);close(a('pupil-camera').spotSpan,0);
 const b=run('CONTROL-08',es=>es.find(e=>e.id==='pupil-lens').y-=10);assert.ok(b('pupil-camera').spotSpan>1);close(b('direct-camera').spotSpan,6);
});
test('CONTROL-09 shutter selection delivers two calibration inputs through the same detector path',()=>{
 const a=run('CONTROL-09');close(a('spectrometer').wavelength,532);
 const b=run('CONTROL-09',es=>{es.find(e=>e.id==='test-shutter').params.trans=0;es.find(e=>e.id==='calibration-shutter').params.trans=1;});close(b('spectrometer').wavelength,546);
 const c=run('CONTROL-09',es=>es.find(e=>e.id==='test-shutter').params.trans=0);assert.equal(c('spectrometer'),null);
});
