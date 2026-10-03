// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { examples } from '../tools/patterns/pulses.mjs';
import { validateExample } from '../tools/patterns/diagram.mjs';
import { registry } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene, detectorReading, opaReading } from '../sketch/js/raytrace.js';

const groups={CONTRAST:8,SPECT:8,CAV:9,PULSE:10,ACCESS:7,WAVE:8,XRAY:8};
const sources=new Set(['cwlaser','pulsedlaser','sclaser','pointsource','objarrow']);
const get=id=>examples.find(record=>record.id===id);
const scene=id=>parseSketch(structuredClone(get(id).scene),registry);
function finite(value){if(typeof value==='number')assert.ok(Number.isFinite(value));else if(Array.isArray(value))value.forEach(finite);else if(value&&typeof value==='object')Object.values(value).forEach(finite);}
function readings(s){const t=traceScene(s.elements,s.beams);finite(t);return s.elements.map(el=>({element:el,reading:detectorReading(el.id)})).filter(row=>row.reading&&row.reading.signal>0);}
function power(id,sensor){readings(scene(id));return detectorReading(sensor)?.signal||0;}

test('all 58 assigned patterns are either genuine native setups or explicitly unavailable',()=>{
 const expected=Object.entries(groups).flatMap(([group,count])=>Array.from({length:count},(_,i)=>`${group}-${String(i+1).padStart(2,'0')}`));
 assert.deepEqual(examples.map(record=>record.id).sort(),expected.sort());
 assert.equal(examples.filter(record=>record.mode==='rays').length,33);
 assert.equal(examples.filter(record=>record.mode==='unavailable').length,25);
 for(const record of examples){validateExample(record);assert.ok(record.references.length);assert.ok(record.steps.length>=2);assert.ok(!record.nodes&&!record.edges);for(const reference of record.references)assert.equal(new URL(reference.url).protocol,'https:');if(record.mode==='unavailable'){assert.ok(record.unavailableReason.length>50);assert.equal(record.scene,undefined);assert.ok(!record.unavailableReason.includes('in progress'));}}
});

for(const record of examples.filter(record=>record.mode==='rays')){
 test(`${record.id}: normalized native optics produce measured light and source removal produces darkness`,()=>{
  const s=scene(record.id);finite(s);
  assert.equal(new Set(s.elements.map(el=>el.id)).size,s.elements.length);
  assert.ok(s.elements.some(el=>sources.has(el.type)));
  assert.ok(s.elements.every(el=>registry[el.type]&&(registry[el.type].category!=='Annotations'||el.type==='probe')&&el.type!=='box'));
  assert.ok(s.beams.every(beam=>beam.kind==='fiber'&&beam.propagate));
  for(const display of s.elements.filter(el=>el.type==='display')) assert.ok(s.elements.some(el=>el.id===display.params.sensorId),'display must link to an actual sensor');
  const lit=readings(s);assert.ok(lit.length>0,`${record.id} must illuminate a real readout`);
  lit.forEach(row=>finite(row.reading));
  s.elements=s.elements.filter(el=>!sources.has(el.type));
  assert.equal(readings(s).length,0,`${record.id}: no light generated without physical excitation`);
 });
}

test('ideal cascaded filters pass overlap and reject disjoint bands without losing reference light',()=>{
 const s=scene('SPECT-05');let r=readings(s);assert.ok(Math.abs(detectorReading('spect05-output').signal-0.9)<1e-9);assert.ok(Math.abs(detectorReading('spect05-reference').signal-0.1)<1e-9);
 s.elements.find(el=>el.type==='cwlaser').params.wavelength=510;readings(s);assert.equal(detectorReading('spect05-output'),null);assert.ok(detectorReading('spect05-reference').signal>0);
 s.elements.find(el=>el.type==='cwlaser').params.wavelength=532;s.elements.find(el=>el.id==='spect05-filter2').params.center=570;readings(s);assert.equal(detectorReading('spect05-output'),null);assert.ok(detectorReading('spect05-reference').signal>0);
});

test('native harmonic channel vanishes at zero conversion',()=>{
 const s=scene('PULSE-09');assert.ok(readings(s).some(row=>row.element.type==='spectrometer'));
 s.elements.find(el=>el.type==='crystal').params.efficiency=0;assert.equal(readings(s).length,0);
});

test('native OPA examples really amplify rather than carrying a gain label',()=>{
 for(const id of ['CAV-04','CAV-09','PULSE-01']){const s=scene(id);readings(s);for(const amp of s.elements.filter(el=>el.type==='opa'))assert.equal(opaReading(amp.id).state,'amplifying',`${id}/${amp.id}`);}
});

test('Michelson native delay changes coherent camera intensity',()=>{
 const s=scene('SPECT-06');readings(s);const detector=s.elements.find(el=>el.type==='camera');const bright=detectorReading(detector.id);assert.ok(bright.coherentPaths>=2);
 s.elements.find(el=>el.type==='delayline').params.delayMm=0.00015;readings(s);assert.ok(Math.abs(bright.signal-detectorReading(detector.id).signal)>0.5);
});

test('EOM retardance selects a real PBS output',()=>{
 const s=scene('PULSE-06');readings(s);const initial=detectorReading('pulse06-selected').signal;
 s.elements.find(el=>el.type==='eom').params.retardance=180;readings(s);assert.ok((detectorReading('pulse06-selected')?.signal||0)<initial/10);
});

test('pupil matching and baffles reject light through physical aperture clipping',()=>{
 for(const id of ['WAVE-07','WAVE-08']){const s=scene(id);const before=readings(s).reduce((sum,row)=>sum+row.reading.signal,0);s.elements.filter(el=>el.type==='slit')[0].params.gap=0.5;const after=readings(s).reduce((sum,row)=>sum+row.reading.signal,0);assert.ok(after<before/2,id);}
});

test('fluorescence aperture and Raman rejection are computed rather than drawn',()=>{
 const confocal=scene('CONTRAST-01');assert.ok(readings(confocal).length);confocal.elements.find(el=>el.type==='slit').x+=10;assert.equal(readings(confocal).length,0);
 const raman=scene('SPECT-07');assert.ok(readings(raman).length);raman.elements.find(el=>el.id==='raman-reject').params.cutoff=800;assert.equal(readings(raman).length,0);
});

test('all X-ray/EUV records name missing native essentials and provide no optical substitutes',()=>{
 for(const record of examples.filter(record=>record.id.startsWith('XRAY-'))){assert.equal(record.mode,'unavailable');assert.equal(record.scene,undefined);assert.ok(/X-ray|EUV|Talbot|zone plate/.test(record.unavailableReason));}
});


test('coronagraph scene blocks the on-axis source while admitting the off-axis source',()=>{
 const s=scene('WAVE-05');assert.ok(readings(s).length);s.elements=s.elements.filter(el=>el.id!=='wave05-companion');assert.equal(readings(s).length,0);
});
