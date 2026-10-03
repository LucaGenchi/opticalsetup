// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExample } from '../tools/patterns/diagram.mjs';
import { examples } from '../tools/patterns/pulses.mjs';
import { registry } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';

const groups = { CONTRAST:8, SPECT:8, CAV:9, PULSE:10, ACCESS:7, WAVE:8, XRAY:8 };

test('assigned optical-pattern families have complete unique authored examples', () => {
 const expected = Object.entries(groups).flatMap(([group,count]) => Array.from({length:count},(_,i)=>`${group}-${String(i+1).padStart(2,'0')}`));
 assert.deepEqual(examples.map(record=>record.id).sort(), expected.sort());
 for (const record of examples) {
  validateExample(record);
  assert.ok(record.title && record.summary && record.limit, record.id);
  assert.ok(record.steps.length >= 2 && record.steps.every(step=>step.length > 30), record.id);
  assert.ok(record.references.length >= 1, record.id);
  for (const source of record.references) {
   assert.ok(source.label.length > 10, record.id);
   assert.equal(new URL(source.url).protocol, 'https:', record.id);
  }
  assert.ok(record.nodes.length >= 4 && record.nodes.length <= 8, record.id);
  const nodes = new Set(record.nodes.map(node=>node.id));
  assert.equal(nodes.size, record.nodes.length, record.id);
  const touched = new Set();
  for (const node of record.nodes) {
   assert.ok(node.note.length > 15 && node.label.length > 2, `${record.id}/${node.id}`);
   assert.ok(Number.isFinite(node.x) && node.x >= 70 && node.x <= 890, record.id);
   assert.ok(Number.isFinite(node.y) && node.y >= 65 && node.y <= 350, record.id);
   if (node.type) assert.ok(registry[node.type], `${record.id}/${node.type}`);
  }
  for (const edge of record.edges) {
   assert.ok(nodes.has(edge.from) && nodes.has(edge.to), record.id);
   assert.ok(['light','signal','reference'].includes(edge.kind), record.id);
   assert.ok(edge.label, record.id);
   touched.add(edge.from); touched.add(edge.to);
   for (const point of edge.via || []) assert.ok(point.length === 2 && point.every(Number.isFinite), record.id);
  }
  assert.equal(touched.size, nodes.size, `${record.id}: no isolated blocks`);
  assert.ok(record.mode === 'schematic' || record.mode === 'rays');
  if (record.mode === 'rays') assert.ok(record.scene, record.id);
  else assert.equal(record.scene, undefined, `${record.id}: unsupported defining physics stays schematic`);
 }
});

test('topologies preserve specific loops, parallel channels and conjugate distinctions', () => {
 const get = id => examples.find(record=>record.id === id);
 assert.ok(get('CONTRAST-04').edges.some(edge=>edge.from === 'direct' && edge.to === 'lens'));
 assert.ok(get('CONTRAST-04').edges.some(edge=>edge.from === 'scatter' && edge.to === 'lens'));
 assert.ok(get('CAV-05').edges.some(edge=>edge.from === 'fold' && edge.to === 'pbs'));
 assert.ok(get('WAVE-01').edges.some(edge=>edge.from === 'ctrl' && edge.to === 'dm' && edge.kind === 'signal'));
 assert.equal(get('XRAY-03').edges.filter(edge=>edge.to === 'det').length, 3);
 assert.ok(get('PULSE-08').nodes.some(node=>node.id === 'solve'));
});

function finiteNumbers(value) {
 if (typeof value === 'number') assert.ok(Number.isFinite(value), 'non-finite traced geometry');
 else if (Array.isArray(value)) value.forEach(finiteNumbers);
 else if (value && typeof value === 'object') Object.values(value).forEach(finiteNumbers);
}
function filterScene() {
 const saved = structuredClone(examples.find(record=>record.id === 'SPECT-05').scene);
 const parsed = parseSketch(JSON.stringify(saved), registry);
 assert.deepEqual(parsed.elements.map(element=>element.id), saved.elements.map(element=>element.id));
 finiteNumbers(parsed);
 return parsed;
}
function measure(scene) {
 const traced = traceScene(scene.elements,scene.beams);
 finiteNumbers(traced);
 return { output:detectorReading('spect05-output'), reference:detectorReading('spect05-reference') };
}

test('cascaded-filter live scene transmits overlap and preserves its independent source monitor', () => {
 const readings = measure(filterScene());
 assert.ok(readings.output && readings.reference);
 assert.ok(Math.abs(readings.output.signal - 0.9) < 1e-10);
 assert.ok(Math.abs(readings.reference.signal - 0.1) < 1e-10);
 assert.ok(Math.abs(readings.output.wavelength - 532) < 1e-9);
});

test('cascaded-filter rejection and disjoint-passband boundary do not erase source monitoring', () => {
 const rejected = filterScene();
 rejected.elements.find(element=>element.type === 'cwlaser').params.wavelength = 510;
 let readings = measure(rejected);
 assert.equal(readings.output,null);
 assert.ok(Math.abs(readings.reference.signal - 0.1) < 1e-10);
 const disjoint = filterScene();
 disjoint.elements.find(element=>element.id === 'spect05-filter2').params.center = 570;
 readings = measure(disjoint);
 assert.equal(readings.output,null);
 assert.ok(Math.abs(readings.reference.signal - 0.1) < 1e-10);
});
