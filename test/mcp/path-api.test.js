// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { componentSchema, searchComponents, emptyDocument, mutateDocument, documentView, inspectDocument } from '../../mcp/scene-api.js';
import { createDrawnPath } from '../../sketch/js/path-types.js';
import { parseSketch } from '../../sketch/js/state.js';
const points = [{ x: 100, y: 0 }, { x: 180, y: 50 }, { x: 240, y: 0 }];
const edit = (doc, action, args, clientRequestId = action + '-' + doc.revision) => mutateDocument(doc, action, { ...args, expectedRevision: doc.revision, clientRequestId }).document;
test('fibers, British aliases and manual beams are discoverable with native path schemas', () => {
  for (const query of ['fiber', 'fibre', 'optical fiber']) {
    const found = searchComponents(query).components;
    for (const type of ['fiber', 'barefiber']) assert.ok(found.some(p => p.type === type && p.creationTool === 'add_paths'));
  }
  assert.ok(searchComponents('manual beam').components.some(p => p.type === 'beam'));
  assert.equal(searchComponents('', 'Fibers').total, 2);
  const schema = componentSchema('fiber');
  assert.equal(schema.kind, 'path'); assert.equal(schema.storage, 'scene.beams');
  assert.equal(schema.parameters.find(p => p.key === 'inputNA').max, 0.95);
  assert.equal(schema.parameters.find(p => p.key === 'out1').fields.find(p => p.key === 'focal').min, 2);
  assert.equal(schema.parameters.find(p => p.key === 'gasPressureBar').visible, false);
  assert.equal(componentSchema('fiber', { fiberModel: 'argon' }).parameters.find(p => p.key === 'gasPressureBar').visible, true);
  assert.equal(createDrawnPath('beam', points).kind, 'beam');
});
test('existing saved fibers are visible separately from components and keep their native values', () => {
  const scene = parseSketch({ elements: [], beams: [{ id: 'existing-fiber', kind: 'fiber', pts: points, bare: true, propagate: true, lengthM: 2, out1: { mode: 'focus', focal: 37 } }] });
  const doc = { ...emptyDocument(), scene };
  const before = JSON.stringify(doc.scene), view = documentView(doc);
  assert.equal(view.components.length, 0); assert.equal(view.paths[0].type, 'barefiber');
  assert.equal(view.paths[0].id, 'existing-fiber'); assert.deepEqual(view.paths[0].points, points);
  assert.equal(view.paths[0].parameters.lengthM, 2); assert.equal(view.paths[0].parameters.out1.focal, 37);
  assert.equal(inspectDocument(doc).paths[0].reading, null);
  assert.equal(JSON.stringify(doc.scene), before);
});
test('add, translate, reshape, configure, remove and Undo use stable native path IDs', () => {
  let doc = edit(emptyDocument(), 'add_components', { components: [{ type: 'cwlaser', x: 0, y: 0 }] });
  doc = edit(doc, 'add_paths', { paths: [{ type: 'barefiber', points, parameters: { lengthM: 2, out1: { mode: 'focus', focal: 37, dia: 7 } } }] });
  const id = doc.scene.beams[0].id;
  assert.equal(doc.scene.beams[0].kind, 'fiber'); assert.equal(doc.scene.beams[0].bare, true); assert.equal(doc.scene.beams[0].propagate, true);
  const args = { expectedRevision: doc.revision, clientRequestId: 'move-once', paths: [{ id, dx: 10, dy: -5, parameters: { inputNA: 99, out1: { na: 0.2 } } }] };
  doc = mutateDocument(doc, 'update_paths', args).document;
  assert.equal(mutateDocument(doc, 'update_paths', args).duplicate, true);
  assert.deepEqual(doc.scene.beams[0].pts[0], { x: 110, y: -5 });
  assert.equal(doc.scene.beams[0].inputNA, 0.95); assert.equal(doc.scene.beams[0].out1.focal, 37); assert.equal(doc.scene.beams[0].out1.mode, 'focus');
  doc = edit(doc, 'update_paths', { paths: [{ id, points: [{ x: 110, y: 0 }, { x: 290, y: 0 }] }] });
  assert.equal(doc.scene.beams[0].id, id); const saved = structuredClone(doc.scene);
  doc = edit(doc, 'remove_paths', { paths: [{ id }] });
  assert.equal(doc.scene.elements.length, 1); assert.equal(doc.scene.beams.length, 0);
  doc = edit(doc, 'undo_setup', {}); assert.deepEqual(doc.scene, saved);
});
test('stale, non-finite, degenerate and partly invalid path edits cannot change the document', () => {
  const doc = edit(emptyDocument(), 'add_paths', { paths: [{ type: 'fiber', points }] }), id = doc.scene.beams[0].id;
  const before = structuredClone(doc);
  assert.throws(() => mutateDocument(doc, 'update_paths', { expectedRevision: 0, clientRequestId: 'stale-path', paths: [{ id, dx: 20 }] }), /Setup changed/);
  for (const bad of [NaN, Infinity, 100001]) assert.throws(() => edit(doc, 'add_paths', { paths: [{ type: 'fiber', points: [{ x: bad, y: 0 }, { x: 0, y: 0 }] }] }), /finite/);
  assert.throws(() => edit(doc, 'add_paths', { paths: [{ type: 'fiber', points: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }] }), /distinct/);
  assert.throws(() => edit(doc, 'update_paths', { paths: [{ id, points, dx: 1 }] }), /not both/);
  assert.throws(() => edit(doc, 'update_paths', { paths: [{ id, dx: 10 }, { id: 'missing', dx: 10 }] }), /does not exist/);
  assert.throws(() => edit(doc, 'update_paths', { paths: [{ id, parameters: { out1: { unknown: 1 } } }] }), /not editable/);
  assert.throws(() => edit(doc, 'update_paths', { paths: [{ id, parameters: { propagate: 'true' } }] }), /boolean/);
  assert.throws(() => edit(doc, 'update_paths', { paths: [{ id, parameters: { gasPressureBar: 3 } }] }), /require/);
  assert.throws(() => edit(doc, 'move_components', { components: [{ id, dx: 10 }] }), /drawn path/);
  assert.deepEqual(doc, before);
});
test('argon model switching preserves native conversions and manual beams remain diagram-only', () => {
  let doc = edit(emptyDocument(), 'add_paths', { paths: [{ type: 'fiber', points, parameters: { fiberModel: 'argon', gasPressureBar: 3 } }, { type: 'beam', points }] });
  assert.equal(doc.scene.beams[0].lossModel, 'marcatili');
  assert.equal(documentView(doc).paths[1].capability.tier, 'diagram');
  const id = doc.scene.beams[0].id;
  doc = edit(doc, 'update_paths', { paths: [{ id, parameters: { fiberModel: 'linear' } }] });
  assert.equal(doc.scene.beams[0].gasPressureBar, undefined);
  assert.equal(doc.scene.beams[0].id, id);
});
