// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { examples } from '../tools/patterns/imaging.mjs';
import { registry } from '../sketch/js/elements.js';
import { validateExample, diagramSVG, wrap } from '../tools/patterns/diagram.mjs';
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

test('all 51 imaging, beam, illumination, scan, routing and field IDs have complete authored graphs', () => {
  const expected = Object.entries({IMG:9,BEAM:8,ILL:8,SCAN:8,ROUTE:8,FIELD:10}).flatMap(([prefix,count]) => Array.from({length:count},(_,i)=>`${prefix}-${String(i+1).padStart(2,'0')}`));
  assert.deepEqual(examples.map(x=>x.id).sort(), expected.sort());
  assert.equal(new Set(examples.map(x=>x.title)).size, examples.length);
  for (const example of examples) {
    validateExample(example);
    assert.ok(!/NaN|undefined/.test(diagramSVG(example)), example.id);
    assert.ok(example.title && example.summary && example.limit);
    assert.ok(example.steps.length >= 2);
    assert.ok(example.references.length);
    for (const source of example.references) {
      assert.ok(source.label.length > 8);
      assert.equal(new URL(source.url).protocol, 'https:');
    }
    const ids = new Set(example.nodes.map(x=>x.id));
    assert.equal(ids.size, example.nodes.length, example.id);
    assert.ok(example.nodes.length >= 4 && example.nodes.length <= 8, example.id);
    for(const node of example.nodes) {
      assert.ok(node.note && node.label, example.id);
      assert.ok(node.y + 48 + (wrap(node.label).length - 1) * 17 < 410, `${example.id}: label enters legend`);
      assert.ok(node.x >= 70 && node.x <= 890 && node.y >= 65 && node.y <= 350, `${example.id}: ${node.id}`);
      if(node.type) assert.ok(registry[node.type], `${example.id}: ${node.type}`);
    }
    for(const edge of example.edges) {
      assert.ok(ids.has(edge.from) && ids.has(edge.to), example.id);
      assert.ok(['light','signal','reference'].includes(edge.kind));
    }
    // The graph must not strand a labeled optical/control role.
    for(const node of example.nodes) assert.ok(example.edges.some(e=>e.from===node.id || e.to===node.id), `${example.id}: stranded ${node.id}`);
    finiteNumbers(example);
    if(example.mode==='rays') {
      assert.ok(example.scene);
      assert.equal(new Set(example.scene.elements.map(x=>x.id)).size, example.scene.elements.length);
      trace(example.id);
    } else { assert.equal(example.mode, 'schematic'); assert.equal(example.scene, undefined); }
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

test('schematic remapping branches retain the required downstream optics', () => {
  const beamlet = byId('BEAM-06').edges;
  assert.ok(beamlet.some(e => e.from === 'beamlet' && e.to === 'a2'));
  assert.ok(!beamlet.some(e => e.from === 'beamlet' && e.to === 'target'));
  const isolator = byId('ROUTE-05').edges;
  for (const [from, to] of [['load','p45'],['p45','faraday'],['faraday','p0'],['p0','reject']]) {
    assert.ok(isolator.some(e => e.from === from && e.to === to), `reverse isolator path ${from}→${to}`);
  }
});
