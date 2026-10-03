// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { examples } from '../tools/patterns/systems.mjs';
import { registry } from '../sketch/js/elements.js';

const counts = { LINK:9, QUANT:9, SENSE:10, COMPUTE:8, DISPLAY:8, CONTROL:9 };
test('system pattern catalogue covers each assigned survey ID exactly once', () => {
  assert.equal(examples.length, 53);
  const ids = new Set(examples.map(e=>e.id));
  assert.equal(ids.size, 53);
  for (const [group,count] of Object.entries(counts)) {
    for(let i=1;i<=count;i++) assert.ok(ids.has(`${group}-${String(i).padStart(2,'0')}`));
  }
});
for (const e of examples) test(`${e.id}: complete finite schematic with registry-backed icons`, () => {
  assert.equal(e.mode,'schematic');
  assert.equal(e.scene,undefined,'schematics must not advertise classical ray simulation of unsupported systems');
  for (const key of ['title','summary','limit']) assert.ok(e[key].length>20,key);
  assert.ok(e.steps.length>=2);
  assert.ok(e.steps.every(s=>s.length>30));
  assert.ok(e.references.length>=1);
  for(const r of e.references) {
    assert.ok(r.label.length>10);
    assert.equal(new URL(r.url).protocol,'https:');
  }
  const ids = new Set(e.nodes.map(n=>n.id));
  assert.equal(ids.size,e.nodes.length);
  assert.ok(e.nodes.length>=4 && e.nodes.length<=8);
  for(const n of e.nodes) {
    assert.ok(n.label && n.note.length>15);
    assert.ok(Number.isFinite(n.x) && n.x>=70 && n.x<=890);
    assert.ok(Number.isFinite(n.y) && n.y>=65 && n.y<=350);
    if(n.type) assert.ok(registry[n.type],n.type);
  }
  const reached = new Set([e.nodes[0].id]);
  for(const edge of e.edges) {
    assert.ok(ids.has(edge.from)); assert.ok(ids.has(edge.to));
    assert.ok(edge.label.length>0);
    assert.ok(['light','signal','reference'].includes(edge.kind));
    for(const p of edge.via||[]) assert.ok(p.length===2 && p.every(Number.isFinite));
  }
  // Topology is connected even when information flows back to a controller.
  for(let i=0;i<e.nodes.length;i++) for(const edge of e.edges) {
    if(reached.has(edge.from)) reached.add(edge.to);
    if(reached.has(edge.to)) reached.add(edge.from);
  }
  assert.equal(reached.size,ids.size);
  assert.ok(e.edges.length>=e.nodes.length-1);
});
test('distinct topology includes returns, parallel acquisition and control feedback',()=>{
  const get=id=>examples.find(e=>e.id===id);
  assert.ok(get('QUANT-02').edges.some(e=>e.from==='fold'&&e.to==='pbs'));
  assert.ok(get('SENSE-03').edges.some(e=>e.from==='lo'&&e.to==='mix'));
  assert.ok(get('COMPUTE-07').edges.some(e=>e.from==='def'&&e.to==='solve'));
  assert.ok(get('DISPLAY-02').edges.filter(e=>e.to.startsWith('p')).length===3);
  assert.ok(get('CONTROL-03').edges.some(e=>e.from==='servo'&&e.to==='l'&&e.kind==='signal'));
  assert.ok(get('CONTROL-04').limit.includes('one-way'));
  assert.ok(get('CONTROL-06').steps.some(s=>s.includes('zero-reference')));
});
