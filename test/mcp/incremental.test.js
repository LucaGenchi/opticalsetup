// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../../mcp/server.js';
import { createSessionStore } from '../../mcp/session-store.js';
import { emptyDocument, normalizeScene } from '../../mcp/scene-api.js';
import { createElement } from '../../mcp/registry.js';
import { applyScenePatch, scenePatch } from '../../mcp/web/snapshot.js';
import { sceneHash } from '../../mcp/stateless.js';

const origin = 'https://mcp.example.com';
const widget = 'https://mcp-example-com.web-sandbox.oaiusercontent.com';
const token = 'd'.repeat(64);
const rpcCall = (name, args) => ({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name, arguments: args } });
const decode = bytes => JSON.parse(new TextDecoder().decode(bytes));
const scene0 = () => normalizeScene(emptyDocument().scene);
const setupAt = (scene, revision = 0, id = 'optics-workspace') => ({ id, scene, revision, hash: sceneHash(scene), channel: token });
const appRequest = (app, path, data, from = widget) => app(new Request(origin + path, {
  method: 'POST', headers: { origin: from, 'content-type': 'application/json' }, body: JSON.stringify(data),
}));
const sessionRequest = async (app, body, from = widget) => {
  const response = await appRequest(app, '/mcp/session', body, from);
  return { status: response.status, data: await response.json() };
};
async function begin(app, setup) {
  const result = await sessionRequest(app, { action: 'sync', workspaceRef: token, setup });
  assert.equal(result.status, 200, JSON.stringify(result.data));
}
async function readerFor(app) {
  const response = await appRequest(app, '/mcp/events', { channel: token });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  assert.deepEqual(decode((await reader.read()).value), { connected: true });
  return reader;
}
async function approve(app, reader, pending, before) {
  const proposal = decode((await reader.read()).value);
  assert.equal(proposal.baseHash, before.hash);
  const changed = applyScenePatch(before.scene, proposal.patch);
  assert.equal(sceneHash(changed), proposal.hash, 'browser hash matches the server patch');
  const ack = await sessionRequest(app, {
    action: 'ack', workspaceRef: token, clientRequestId: proposal.clientRequestId,
    applied: true, revision: proposal.revision, hash: proposal.hash,
  });
  assert.equal(ack.status, 200, JSON.stringify(ack.data));
  const output = (await pending).result.structuredContent;
  assert.equal(output.status, 'applied');
  assert.equal(output.hash, proposal.hash);
  assert.equal(output.setup, undefined, 'model sees no full scene');
  return { output, setup: setupAt(changed, proposal.revision), proposal };
}

test('scene patch round-trips additions, changes and deletions without changing unaffected objects', () => {
  const first = scene0();
  first.elements.push({ ...createElement('lens', 50, 0), id: 'lens-a' }, { ...createElement('lens', 60, 0), id: 'lens-b' });
  const second = structuredClone(first);
  second.elements[0].x += 15;
  second.elements.splice(1, 1);
  second.elements.push({ ...createElement('detector', 90, 0), id: 'sensor-c' });
  const patch = scenePatch(first, second);
  assert.deepEqual(applyScenePatch(first, patch), second);
  assert.deepEqual(patch.elements.remove, ['lens-b']);
  assert.deepEqual(patch.elements.upsert.map(x => x.id), ['lens-a', 'sensor-c']);
  assert.equal(first.elements.length, 2, 'original is unchanged');
  assert.throws(() => applyScenePatch(first, { elements: { remove: ['unknown'], upsert: [] }, beams: { remove: [], upsert: [] } }), /unknown/);
});

test('compact edit is delivered and acknowledged, and the mirror supports indexed reads', async () => {
  const app = createApplication({ origin, screenshots: false });
  const original = setupAt(scene0());
  await begin(app, original);
  const reader = await readerFor(app);
  try {
    const summary = (await app.rpc(rpcCall('get_setup', { workspaceRef: token }))).result.structuredContent;
    assert.equal(summary.revision, 0);
    assert.equal(summary.setup, undefined);
    const pending = app.rpc(rpcCall('add_components', {
      workspaceRef: token, expectedRevision: 0, clientRequestId: 'add-one',
      components: [{ type: 'lens', x: 200, y: 70, parameters: { f: 50 } }],
    }));
    const { output, setup, proposal } = await approve(app, reader, pending, original);
    assert.equal(output.changed.elements.upserted.length, 1);
    assert.ok(proposal.patch.elements.upsert[0].id.startsWith('mcp_'));
    assert.ok(!('setup' in proposal), 'live channel transports patch only');
    const id = output.changed.elements.upserted[0];
    const selected = (await app.rpc(rpcCall('get_items', { workspaceRef: token, componentIds: [id] }))).result.structuredContent;
    assert.equal(selected.components[0].params.f, 50);
    assert.equal(selected.paths.length, 0);
    assert.deepEqual((await sessionRequest(app, { action: 'read', workspaceRef: token })).data.setup.scene, setup.scene);
    // Same request is idempotent even when the mirror has moved to revision 1.
    const again = (await app.rpc(rpcCall('add_components', {
      workspaceRef: token, expectedRevision: 0, clientRequestId: 'add-one',
      components: [{ type: 'lens', x: 200, y: 70, parameters: { f: 50 } }],
    }))).result.structuredContent;
    assert.deepEqual(again, output);
    assert.equal((await sessionRequest(app, { action: 'read', workspaceRef: token })).data.setup.revision, 1);
    const stale = (await app.rpc(rpcCall('move_components', {
      workspaceRef: token, expectedRevision: 0, clientRequestId: 'stale', components: [{ id, dx: 3 }],
    }))).result;
    assert.equal(stale.isError, true);
    assert.equal(stale.structuredContent.error.code, 'REVISION_CONFLICT');
  } finally { await reader.cancel(); app.close(); }
});

test('large scenes stay outside model edit arguments/results: 120 components, one movement', async () => {
  const app = createApplication({ origin, screenshots: false });
  const elements = Array.from({ length: 120 }, (_, i) => ({ ...createElement('lens', 50 + i * 10, 100), id: 'lens-' + i, label: 'L'.repeat(120) }));
  const initial = setupAt(normalizeScene({ ...scene0(), elements }));
  await begin(app, initial);
  const reader = await readerFor(app);
  try {
    const args = { workspaceRef: token, expectedRevision: 0, clientRequestId: 'move-large', components: [{ id: 'lens-3', dx: 5 }] };
    const pending = app.rpc(rpcCall('move_components', args));
    const { output, proposal } = await approve(app, reader, pending, initial);
    assert.equal(output.changed.elements.upserted.length, 1);
    const requestSize = JSON.stringify(args).length, responseSize = JSON.stringify(output).length;
    const sceneSize = JSON.stringify(initial.scene).length;
    assert.ok(sceneSize > 20000);
    assert.ok(requestSize < 400);
    assert.ok(responseSize < 1300);
    assert.ok(JSON.stringify(proposal).length < sceneSize / 10, 'incremental event not a full scene');
  } finally { await reader.cancel(); app.close(); }
});

test('the browser can reject an old proposal, and offline edits never commit', async () => {
  const app = createApplication({ origin, screenshots: false });
  const original = setupAt(scene0());
  await begin(app, original);
  const reader = await readerFor(app);
  try {
    const pending = app.rpc(rpcCall('add_components', {
      workspaceRef: token, expectedRevision: 0, clientRequestId: 'reject-old',
      components: [{ type: 'lens', x: 100, y: 100 }],
    }));
    const proposal = decode((await reader.read()).value);
    assert.equal(proposal.baseRevision, 0);
    const rejected = await sessionRequest(app, { action: 'ack', workspaceRef: token, clientRequestId: 'reject-old', applied: false });
    assert.equal(rejected.status, 200);
    assert.equal((await pending).result.structuredContent.error.code, 'EDIT_REJECTED');
    assert.deepEqual((await sessionRequest(app, { action: 'read', workspaceRef: token })).data.setup.scene, original.scene);
  } finally { await reader.cancel(); }
  const offline = (await app.rpc(rpcCall('add_components', {
    workspaceRef: token, expectedRevision: 0, clientRequestId: 'offline',
    components: [{ type: 'lens', x: 200, y: 100 }],
  }))).result;
  assert.equal(offline.structuredContent.error.code, 'EDIT_NOT_APPLIED');
  assert.equal((await sessionRequest(app, { action: 'read', workspaceRef: token })).data.setup.revision, 0);
  app.close();
});

test('browser-owned undo is acknowledged with an actual scene; manual changes reject stale AI revisions', async () => {
  const app = createApplication({ origin, screenshots: false });
  const original = setupAt(scene0());
  await begin(app, original);
  const reader = await readerFor(app);
  try {
    const add = app.rpc(rpcCall('add_components', {
      workspaceRef: token, expectedRevision: 0, clientRequestId: 'add-undo', components: [{ type: 'lens', x: 200, y: 100 }],
    }));
    const { setup: added } = await approve(app, reader, add, original);
    const pendingUndo = app.rpc(rpcCall('undo_setup', {
      workspaceRef: token, expectedRevision: 1, clientRequestId: 'undo-one',
    }));
    const undoCommand = decode((await reader.read()).value);
    assert.equal(undoCommand.historyAction, 'undo_setup');
    assert.equal(undoCommand.patch, undefined);
    const ack = await sessionRequest(app, {
      action: 'ack', workspaceRef: token, clientRequestId: 'undo-one',
      applied: true, revision: 2, hash: original.hash, scene: original.scene,
    });
    assert.equal(ack.status, 200, JSON.stringify(ack.data));
    assert.equal((await pendingUndo).result.structuredContent.status, 'applied');
    assert.deepEqual((await sessionRequest(app, { action: 'read', workspaceRef: token })).data.setup.scene, original.scene);
    const manualScene = structuredClone(original.scene);
    manualScene.elements.push({ ...createElement('lens', 500, 100), id: 'manual-lens' });
    const manuallyEdited = setupAt(normalizeScene(manualScene), 3);
    assert.equal((await sessionRequest(app, { action: 'sync', workspaceRef: token, setup: manuallyEdited })).status, 200);
    const stale = (await app.rpc(rpcCall('move_components', {
      workspaceRef: token, expectedRevision: 2, clientRequestId: 'old-manual',
      components: [{ id: 'manual-lens', dx: 10 }],
    }))).result;
    assert.equal(stale.structuredContent.error.code, 'REVISION_CONFLICT');
    assert.equal((await sessionRequest(app, { action: 'read', workspaceRef: token })).data.setup.revision, 3);
    assert.equal(added.scene.elements.length, 1);
  } finally { await reader.cancel(); app.close(); }
});

test('session endpoints require the widget origin and an opaque valid reference', async () => {
  const app = createApplication({ origin, screenshots: false });
  const original = setupAt(scene0());
  assert.equal((await sessionRequest(app, { action: 'sync', workspaceRef: token, setup: original }, 'https://evil.example')).status, 403);
  assert.equal((await sessionRequest(app, { action: 'sync', workspaceRef: 'x', setup: original })).status, 409);
  await begin(app, original);
  assert.equal((await sessionRequest(app, { action: 'read', workspaceRef: 'a'.repeat(64) })).status, 409);
  assert.equal((await sessionRequest(app, { action: 'sync', workspaceRef: token, setup: { ...original, hash: '0'.repeat(64) } })).status, 409);
  app.close();
});

test('session expiry and capacity are bounded without persistent storage', () => {
  let clock = 0;
  const store = createSessionStore({ ttlMs: 100, maxSessions: 1, now: () => clock });
  const snap = setupAt(scene0());
  store.sync(token, snap);
  assert.equal(store.size, 1);
  assert.throws(() => store.sync('e'.repeat(64), snap), /Too many active/);
  clock = 101;
  assert.equal(store.size, 0);
  assert.throws(() => store.read(token), /expired/);
  store.sync('e'.repeat(64), snap);
  assert.equal(store.size, 1);
});
