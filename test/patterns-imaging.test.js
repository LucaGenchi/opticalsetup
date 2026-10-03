// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { examples } from '../tools/patterns/imaging.mjs';
import { registry } from '../sketch/js/elements.js';
import { validateExample, setupSVG } from '../tools/patterns/diagram.mjs';
import '../sketch/js/detector-instruments.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';
import { objectImageAtCamera } from '../sketch/js/detector-measurements.js';

const byId = id => examples.find(example => example.id === id);
function finiteNumbers(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `Nonfinite number: ${value}`);
  else if (Array.isArray(value)) value.forEach(finiteNumbers);
  else if (value && typeof value === 'object') Object.values(value).forEach(finiteNumbers);
}
function trace(id, edit = () => {}) {
  const scene = parseSketch(JSON.stringify(byId(id).scene), registry);
  edit(scene.elements);
  const result = traceScene(scene.elements, scene.beams);
  finiteNumbers(scene);
  finiteNumbers(result);
  return elementId => detectorReading(elementId);
}
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('all 51 patterns supply honest native scenes or explicit unavailable reasons', () => {
  const expected = Object.entries({IMG:9,BEAM:8,ILL:8,SCAN:8,ROUTE:8,FIELD:10}).flatMap(([prefix,count]) => Array.from({length:count},(_,i)=>`${prefix}-${String(i+1).padStart(2,'0')}`));
  assert.deepEqual(examples.map(x=>x.id).sort(), expected.sort());
  for(const example of examples) {
    validateExample(example); finiteNumbers(example);
    assert.ok(example.summary && example.limit && example.steps.length >= 2);
    assert.ok(example.references.length);
    for(const r of example.references) assert.equal(new URL(r.url).protocol,'https:');
    if(example.mode === 'unavailable') { assert.ok(example.unavailableReason.length > 100); assert.equal(example.scene,undefined); continue; }
    assert.equal(example.mode,'rays'); assert.equal(example.scene.version,1);
    const scene=parseSketch(JSON.stringify(example.scene),registry);
    assert.equal(new Set(scene.elements.map(e=>e.id)).size,scene.elements.length);
    const result=traceScene(scene.elements,scene.beams); finiteNumbers(result);
    assert.ok(!/NaN|undefined/.test(setupSVG(example)),example.id);
    const receivers=scene.elements.filter(e=>['camera','detector','spectrometer'].includes(e.type));
    assert.ok(receivers.some(e=>detectorReading(e.id)?.signal > 0),`${example.id}: a real receiver must collect light`);
  }
});

test('IMG-02 expands a collimated 3 mm beam to 9 mm with finite normalized rays', () => {
  const get = trace('IMG-02');
  near(get('output').spotSpan, 9);
  near(get('output').signal, 1);
  const moved = trace('IMG-02', elements => { elements.find(e=>e.id==='second').x += 50; });
  assert.ok(Math.abs(moved('output').spotSpan - 9) > 0.1, 'incorrect telescope separation changes output size');
});

test('ROUTE-01 selects colors and its cutoff boundary sends both colors to one port', () => {
  const get = trace('ROUTE-01');
  near(get('red-output').wavelength, 640);
  near(get('blue-output').wavelength, 488);
  near(get('red-output').signal,1);
  near(get('blue-output').signal,1);
  const allTransmit = trace('ROUTE-01', elements => { elements.find(e=>e.id==='dichroic').params.cutoff=450; });
  near(allTransmit('red-output').signal,2);
  assert.equal(allTransmit('blue-output'),null);
});

test('ROUTE-02 equally projects a 45° linear input and extinguishes a basis-aligned port', () => {
  const get=trace('ROUTE-02');
  near(get('transmitted').signal,0.5);
  near(get('reflected').signal,0.5);
  assert.notEqual(get('transmitted').polarization,get('reflected').polarization);
  const aligned=trace('ROUTE-02', elements => { elements.find(e=>e.id==='input').params.pol=0; });
  near(aligned('transmitted').signal,1);
  assert.ok(!aligned('reflected') || aligned('reflected').signal < 1e-12);
});

test('ROUTE-03 reproduces half-wave attenuation at midrange and at both endpoints', () => {
  near(trace('ROUTE-03')('output').signal,0.5);
  const full=trace('ROUTE-03', elements=>{elements.find(e=>e.id==='plate').params.a=0;});
  near(full('output').signal,1);
  const blocked=trace('ROUTE-03', elements=>{elements.find(e=>e.id==='plate').params.a=45;});
  assert.ok(!blocked('output') || blocked('output').signal < 1e-12);
});

test('ROUTE-08 yields 4.5 sample/reference ratio and loses the sample signal at zero transmission', () => {
  const get=trace('ROUTE-08');
  near(get('signal').signal,0.45);
  near(get('reference').signal,0.1);
  near(get('signal').signal/get('reference').signal,4.5);
  const changed=trace('ROUTE-08',elements=>{elements.find(e=>e.id==='input').params.avgPowerW=0.2;});
  near(changed('signal').signal/changed('reference').signal,4.5);
  const blocked=trace('ROUTE-08',elements=>{elements.find(e=>e.id==='sample').params.transmission=0;});
  assert.ok(!blocked('signal') || blocked('signal').signal<1e-12);
  near(blocked('reference').signal,0.1);
});


test('IMG-01 gives a separately constructed inverted unit image and a narrow on-axis fan at the 4f plane', () => {
  const scene = parseSketch(JSON.stringify(byId('IMG-01').scene), registry);
  const camera = scene.elements.find(e => e.id === 'image');
  const image = objectImageAtCamera(camera, scene.elements);
  assert.ok(image, 'the camera face is 100 mm beyond the second lens');
  assert.equal(image.shape, 'F');
  near(image.magnification, -1);
  near(image.localBaseY, 0);
  near(image.localTipY, 10);
  const nominal = trace('IMG-01')('image');
  near(nominal.signal, 1);
  // The ray emitter starts 1 mm beyond the object anchor; its axis fan is
  // geometrically tight, but is not a diffraction spot or a rendered F image.
  assert.ok(nominal.spotSpan < 0.2);
  camera.x += 30;
  assert.equal(objectImageAtCamera(camera, scene.elements), null, 'shifted detector is not an image conjugate');
  const shifted = trace('IMG-01', elements => { elements.find(e => e.id === 'image').x += 30; })('image');
  assert.ok(shifted.spotSpan > 4, 'the same axis fan broadens after its conjugate');
});

const cases=[['IMG-03','second','f',30],['IMG-04','tube','f',30],['IMG-05','rear-focal-stop','y',2],['IMG-06','secondary','x',2],['IMG-07','tilted-sensor','rot',-26.565],['IMG-09','compensator-2x','x',10],['BEAM-01','focal-aperture','y',5],['BEAM-03','injection','x',10],['BEAM-04','powered-meridian-C2','x',20],['BEAM-06','array-B-1','y',3],['BEAM-07','fourier-stop','gap',-6],['BEAM-08','programmable-SLM','length',10],['ILL-01','field-stop','gap',-18],['ILL-02','critical-condenser','f',10],['ILL-03','emission-filter','center',100],['ILL-04','central-obscuration','aperture',8],['ILL-05','binary-DMD','duty',-.45],['ILL-06','detection-objective','x',40],['ILL-07','second','f',20],['ILL-08','lenslet-1','f',20],['SCAN-01','scanner','commandAngle',1],['SCAN-03','detection-pinhole','x',10],['SCAN-05','remote-mirror','x',2],['ROUTE-04','double-pass-QWP','a',-45],['ROUTE-05','forward-isolator','rot',180],['ROUTE-06','signal','pol',-45],['ROUTE-07','analysis-QWP','a',-45],['FIELD-01','MZ-phase-bias','opdUm',.266],['FIELD-03','right-loop-mirror','x',10],['FIELD-04','shear-upper-fold','x',-1],['FIELD-05','balanced-phase-bias','opdUm',.266],['FIELD-06','LO','x',40],['FIELD-07','Q-phase-bias','opdUm',.133],['FIELD-08','reference-mirror','y',50],['FIELD-09','nuller-phase-bias','opdUm',-.95],['FIELD-10','feed-A-2','x',10]];
function readouts(scene) {
 const result=traceScene(scene.elements,scene.beams); finiteNumbers(result);
 return scene.elements.filter(e=>['camera','detector','spectrometer'].includes(e.type)).map(e=>{ const r=detectorReading(e.id); return r ? [r.signal,r.spotSpan,r.centroid,r.profile] : [0]; });
}
for(const [id,elementId,key,delta] of cases) test(`${id}: changing ${elementId} ${key} changes its native receiver result`,()=>{
 const scene=parseSketch(JSON.stringify(byId(id).scene),registry);
 const baseline=readouts(scene);
 const element=scene.elements.find(e=>e.id===elementId);
 if(key in element) element[key]+=delta; else element.params[key]+=delta;
 const changed=readouts(scene);
 const flatten = value => Array.isArray(value) ? value.flatMap(flatten) : [Number(value) || 0];
 const a=flatten(baseline), b=flatten(changed);
 assert.ok(Math.max(...Array.from({length:Math.max(a.length,b.length)},(_,i)=>Math.abs((a[i]||0)-(b[i]||0)))) > 1e-6,'the optical component must materially affect collection, position or the resolved profile');
});
test('BEAM-02 real fiber input direction outside its NA rejects transported light',()=>{
 const scene=parseSketch(JSON.stringify(byId('BEAM-02').scene),registry);
 const baseline=readouts(scene);
 scene.beams[0].pts[1].y+=200;
 const changed=readouts(scene);
 assert.notDeepEqual(changed,baseline);
});
test('SCAN-06 translated retroreflector preserves output pointing and increases actual traced free-space path',()=>{
 const scene=parseSketch(JSON.stringify(byId('SCAN-06').scene),registry);
 const before=traceScene(scene.elements,scene.beams);
 const nominal=detectorReading('fixed-return');
 scene.elements.find(e=>e.id==='moving-retroreflector').x+=15;
 const after=traceScene(scene.elements,scene.beams);
 const translated=detectorReading('fixed-return');
 near(translated.signal,nominal.signal); near(translated.spotSpan,0);
 near(after.pulseTracks[0].opls.at(-1)-before.pulseTracks[0].opls.at(-1),30);
 near(translated.pulse.earliestPathDelayNs-nominal.pulse.earliestPathDelayNs,30/299.792458);
 assert.notDeepEqual(after,before,'physical round-trip segment geometry changes');
});
test('native zoom and reduction endpoints retain their authored image conjugates',()=>{
 for(const [id,cameraId,magnification] of [['IMG-04','image',-10],['IMG-09','image-1x',-1],['IMG-09','image-2x',-2],['ILL-07','image',-.25]]) {
  const s=parseSketch(JSON.stringify(byId(id).scene),registry);
  near(objectImageAtCamera(s.elements.find(e=>e.id===cameraId),s.elements).magnification,magnification);
 }
});
