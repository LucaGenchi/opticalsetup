// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createApplication } from '../../mcp/server.js';
import { sceneHash, snapshot } from '../../mcp/stateless.js';
import { diffScene, applyScenePatch } from '../../mcp/web/scene-patch.js';
import { resultData, globalsResult } from '../../mcp/web/snapshot.js';

const origin = 'https://mcp.example.com';
const widget = 'https://mcp-example-com.web-sandbox.oaiusercontent.com';
const token = 'a'.repeat(64);
const decode = bytes => JSON.parse(new TextDecoder().decode(bytes));
const size = value => Buffer.byteLength(JSON.stringify(value));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const request = (app, path, body, from = widget) => app(new Request(origin + path, {
  method: 'POST', headers: { origin: from, 'content-type': 'application/json' }, body: JSON.stringify(body),
}));
const rpc = async (app, name, args) => (await app.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).result;
async function subscribe(app, channel = token) {
  const reader = (await request(app, '/mcp/events', { channel })).body.getReader();
  assert.deepEqual(decode((await reader.read()).value), { connected: true });
  return reader;
}
async function proposalFrom(reader, call) {
  return Promise.race([
    reader.read().then(({ value }) => decode(value)),
    call.then(result => { throw new Error('Tool returned before delivery: ' + JSON.stringify(result.structuredContent)); }),
  ]);
}
const sync = (app, setup, extra = {}) => request(app, '/mcp/sync', { channel: token, canUndo: false, canRedo: false, ...setup, ...extra });
const delta = (base, scene, extra = {}) => ({
  id: base.id, revision: base.revision + 1, hash: sceneHash(scene), patch: diffScene(base.scene, scene),
  baseRevision: base.revision, baseHash: base.hash, ...extra,
});

async function largeSetup() {
  const folder = new URL('../../community-submissions/', import.meta.url);
  for (const name of await readdir(folder)) {
    if (!name.endsWith('.json')) continue;
    const document = JSON.parse(await readFile(new URL(name, folder), 'utf8'));
    if (document.scene?.elements.length === 120) return snapshot({ id: 'community', revision: 0, scene: document.scene });
  }
  throw new Error('120-component community setup missing');
}

test('a large connected scene sends a bounded edit and waits for browser confirmation', async t => {
  const app = createApplication({ origin });
  t.after(() => app.close());
  const reader = await subscribe(app);
  const setup = await largeSetup();
  const { workspaceRef } = await (await sync(app, setup)).json();
  const opened = await rpc(app, 'open_setup', { workspaceRef });
  assert.ok(size(opened.structuredContent) < 350);
  assert.ok(size(opened.content) < 400);
  assert.deepEqual(resultData(opened).setup, setup);
  assert.deepEqual(globalsResult({ toolOutput: opened.structuredContent, toolResponseMetadata: opened._meta }).data.setup, setup);
  const info = (await rpc(app, 'get_setup', { workspaceRef })).structuredContent;
  assert.equal(info.componentCount, 120);
  assert.ok(!Object.hasOwn(info, 'setup'));
  const { items, total, nextOffset } = (await rpc(app, 'get_items', { workspaceRef, kind: 'component', limit: 3 })).structuredContent;
  assert.equal(total, 120); assert.equal(items.length, 3); assert.equal(nextOffset, 3);
  assert.equal(items[0].parameters, undefined);
  const id = items[0].id;
  assert.ok((await rpc(app, 'get_items', { workspaceRef, ids: [id], details: true })).structuredContent.items[0].parameters);

  const args = { workspaceRef, expectedRevision: 0, clientRequestId: 'move-one', components: [{ id, dx: 5 }] };
  let done = false;
  const call = rpc(app, 'move_components', args).then(response => { done = true; return response; });
  const proposal = await proposalFrom(reader, call);
  assert.equal(done, false);
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.revision, 0);
  assert.equal((await rpc(app, 'move_components', { ...args, clientRequestId: 'different' })).structuredContent.error.code, 'BUSY');
  const replay = rpc(app, 'move_components', args);
  const scene = applyScenePatch(setup.scene, proposal.patch);
  assert.equal(scene.elements[0].x, setup.scene.elements[0].x + 5);
  assert.equal(proposal.hash, sceneHash(scene));
  assert.ok(size(proposal) < 2500);
  const ack = delta(setup, scene, { deliveryId: proposal.deliveryId, canUndo: true });
  assert.equal((await sync(app, { ...ack, hash: 'b'.repeat(64) })).status, 409);
  assert.equal((await sync(app, ack)).status, 200);
  const result = await call;
  assert.deepEqual(await replay, result);
  assert.deepEqual(await rpc(app, 'move_components', args), result);
  assert.equal(result.structuredContent.status, 'applied');
  assert.deepEqual(result.structuredContent.changed, [id]);
  assert.equal(result.structuredContent.canUndo, true);
  assert.ok(size(args) < 250 && size(result) < 750);
  assert.equal((await rpc(app, 'move_components', { ...args, components: [{ id, dx: 8 }] })).structuredContent.error.code, 'REQUEST_ID_REUSED');
  assert.equal((await rpc(app, 'move_components', { ...args, clientRequestId: 'stale' })).structuredContent.error.code, 'REVISION_CONFLICT');
  await reader.cancel();
});

test('browser history, competing manual edits, isolation and expired mirrors', async t => {
  let now = 0;
  const app = createApplication({ origin, mirrorOptions: { now: () => now, ttlMs: 60000, ackMs: 300, reconnectMs: 100 } });
  t.after(() => app.close());
  const reader = await subscribe(app);
  const setup = await largeSetup();
  const { workspaceRef } = await (await sync(app, setup, { canUndo: true })).json();
  assert.equal((await rpc(app, 'get_setup', { workspaceRef: 'b'.repeat(64) })).structuredContent.error.code, 'WORKSPACE_UNAVAILABLE');
  const args = { workspaceRef, expectedRevision: 0, clientRequestId: 'undo' };
  const undo = rpc(app, 'undo_setup', args);
  const proposal = await proposalFrom(reader, undo);
  assert.equal(proposal.patch, undefined);
  const next = { ...setup.scene, elements: setup.scene.elements.slice(0, -1) };
  const undoState = delta(setup, next, { deliveryId: proposal.deliveryId, canRedo: true });
  assert.equal((await sync(app, undoState, { channel: workspaceRef })).status, 503, 'the model reference cannot acknowledge');
  assert.equal((await request(app, '/mcp/sync', { channel: token, ...undoState }, 'https://evil.example')).status, 403);
  assert.equal((await sync(app, undoState)).status, 200);
  assert.deepEqual((await undo).structuredContent.removed, [setup.scene.elements.at(-1).id]);

  const redo = rpc(app, 'redo_setup', { ...args, expectedRevision: 1, clientRequestId: 'redo' });
  const redoEvent = await proposalFrom(reader, redo);
  assert.equal(redoEvent.baseRevision, 1);
  const base = { ...setup, revision: 1, hash: undoState.hash, scene: next };
  const manual = { ...next, elements: next.elements.slice(1) };
  assert.equal((await sync(app, delta(base, manual, { canUndo: true }))).status, 200);
  assert.equal((await redo).structuredContent.error.code, 'REVISION_CONFLICT');

  const rejected = rpc(app, 'undo_setup', { ...args, expectedRevision: 2, clientRequestId: 'rejected' });
  const rejectedEvent = await proposalFrom(reader, rejected);
  assert.equal((await request(app, '/mcp/sync', { channel: token, deliveryId: rejectedEvent.deliveryId, rejected: true })).status, 200);
  assert.equal((await rejected).structuredContent.error.code, 'REVISION_CONFLICT');
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.revision, 2);
  // Refused because a pointer was down in the editor: nothing changed, and the chat is told that instead.
  const engaged = rpc(app, 'undo_setup', { ...args, expectedRevision: 2, clientRequestId: 'engaged' });
  const engagedEvent = await proposalFrom(reader, engaged);
  assert.equal((await request(app, '/mcp/sync', { channel: token, deliveryId: engagedEvent.deliveryId, rejected: true, busy: true })).status, 200);
  assert.equal((await engaged).structuredContent.error.code, 'BUSY');

  const unconfirmed = rpc(app, 'undo_setup', { ...args, expectedRevision: 2, clientRequestId: 'no-ack' });
  const event = await proposalFrom(reader, unconfirmed);
  assert.equal(event.baseRevision, 2);
  assert.equal((await unconfirmed).structuredContent.error.code, 'EDIT_UNCONFIRMED');
  await reader.cancel();
  assert.equal((await rpc(app, 'undo_setup', { ...args, expectedRevision: 2, clientRequestId: 'offline' })).structuredContent.error.code, 'WORKSPACE_UNAVAILABLE');
  now = 61000;
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.error.code, 'WORKSPACE_UNAVAILABLE');
  const reconnected = await subscribe(app);
  const current = { id: setup.id, revision: 2, hash: sceneHash(manual) };
  assert.equal((await (await sync(app, current)).json()).error, 'RESYNC_REQUIRED');
  assert.equal((await (await sync(app, { ...current, scene: manual })).json()).workspaceRef, workspaceRef);
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.revision, 2);
  await reconnected.cancel();
});

test('scene patches preserve item order on insert, delete and reorder', async () => {
  const { scene } = await largeSetup();
  const next = { ...scene, elements: [scene.elements[2], { ...scene.elements[1], id: 'inserted' }, ...scene.elements.slice(3)] };
  assert.deepEqual(applyScenePatch(scene, diffScene(scene, next)), next);
  assert.throws(() => applyScenePatch(scene, { elements: { remove: ['unknown'], put: [] } }), /Unknown removed item/);
  assert.equal(scene.elements.length, 120);
});

test('mirrors cap their capacity and an unregistered channel cannot supply state', async t => {
  const app = createApplication({ origin, mirrorOptions: { maxWorkspaces: 1 } });
  t.after(() => app.close());
  const setup = snapshot();
  assert.equal((await sync(app, setup)).status, 503);
  const first = await subscribe(app), second = await subscribe(app, 'c'.repeat(64));
  const { workspaceRef } = await (await sync(app, setup)).json();
  assert.equal((await (await sync(app, setup, { channel: 'c'.repeat(64) })).json()).error, 'BUSY');
  // A view that has gone gives up its place to one that is here, instead of holding it until it expires.
  await first.cancel();
  assert.equal((await sync(app, setup, { channel: 'c'.repeat(64) })).status, 200);
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.error.code, 'WORKSPACE_UNAVAILABLE');
  // The view that is here keeps its place when the first one returns.
  const returned = await subscribe(app);
  assert.equal((await (await sync(app, setup)).json()).error, 'BUSY');
  await returned.cancel();
  await second.cancel();
});

test('an edit the browser confirms after the wait has ended is still recorded as its outcome', async t => {
  const app = createApplication({ origin, mirrorOptions: { ackMs: 60 } });
  t.after(() => app.close());
  const reader = await subscribe(app);
  const setup = snapshot();
  const { workspaceRef } = await (await sync(app, setup)).json();
  const args = { workspaceRef, expectedRevision: 0, clientRequestId: 'late', components: [{ type: 'lens', x: 0, y: 0 }] };
  const first = rpc(app, 'add_components', args);
  const proposal = await proposalFrom(reader, first);
  assert.equal((await first).structuredContent.error.code, 'EDIT_UNCONFIRMED');
  // A second edit sent meanwhile was computed on the scene the first one is about to change.
  const second = rpc(app, 'add_components', { ...args, clientRequestId: 'second', components: [{ type: 'lens', x: 50, y: 0 }] });
  const secondProposal = await proposalFrom(reader, second);
  // The browser applies the first all the same, and says so late.
  const scene = applyScenePatch(setup.scene, proposal.patch);
  assert.equal((await sync(app, delta(setup, scene, { deliveryId: proposal.deliveryId, canUndo: true }))).status, 200);
  assert.equal((await second).structuredContent.error.code, 'REVISION_CONFLICT');
  assert.equal((await request(app, '/mcp/sync', { channel: token, deliveryId: secondProposal.deliveryId, rejected: true })).status, 200);
  // The same call again reports what became of it, and is not applied a second time.
  const again = (await rpc(app, 'add_components', args)).structuredContent;
  assert.equal(again.status, 'applied'); assert.equal(again.revision, 1); assert.equal(again.changed.length, 1);
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.componentCount, 1);
  assert.equal((await rpc(app, 'add_components', { ...args, components: [{ type: 'lens', x: 9, y: 0 }] })).structuredContent.error.code, 'REQUEST_ID_REUSED');

  // An overdue edit the browser then refuses is forgotten: the same call again is sent again.
  const base = { ...setup, revision: 1, hash: sceneHash(scene), scene };
  const move = { workspaceRef, expectedRevision: 1, clientRequestId: 'refused-late', components: [{ id: scene.elements[0].id, dx: 5 }] };
  const refused = rpc(app, 'move_components', move);
  const refusedProposal = await proposalFrom(reader, refused);
  assert.equal((await refused).structuredContent.error.code, 'EDIT_UNCONFIRMED');
  assert.equal((await request(app, '/mcp/sync', { channel: token, deliveryId: refusedProposal.deliveryId, rejected: true })).status, 200);
  const resent = rpc(app, 'move_components', move);
  const resentProposal = await proposalFrom(reader, resent);
  assert.equal(resentProposal.deliveryId, refusedProposal.deliveryId);
  const moved = applyScenePatch(scene, resentProposal.patch);
  assert.equal((await sync(app, delta(base, moved, { deliveryId: resentProposal.deliveryId, canUndo: true }))).status, 200);
  assert.equal((await resent).structuredContent.status, 'applied');
  // A late confirmation that does not match the edit it names records nothing.
  const wrong = rpc(app, 'move_components', { ...move, expectedRevision: 2, clientRequestId: 'wrong-late' });
  const wrongProposal = await proposalFrom(reader, wrong);
  assert.equal((await wrong).structuredContent.error.code, 'EDIT_UNCONFIRMED');
  assert.equal((await sync(app, { ...delta({ ...base, revision: 2, hash: sceneHash(moved), scene: moved }, scene, { deliveryId: wrongProposal.deliveryId, canUndo: true }) })).status, 409);
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.revision, 2);
  await reader.cancel();
});

test('an edit that arrives while the view is reopening its stream waits for it', async t => {
  const app = createApplication({ origin, mirrorOptions: { reconnectMs: 400 } });
  t.after(() => app.close());
  const first = await subscribe(app);
  const setup = snapshot();
  const { workspaceRef } = await (await sync(app, setup)).json();
  // The service ends every stream at its time limit and the view opens the next one.
  await first.cancel();
  const args = { workspaceRef, expectedRevision: 0, clientRequestId: 'between-streams', components: [{ type: 'lens', x: 0, y: 0 }] };
  const call = rpc(app, 'add_components', args);
  const repeated = rpc(app, 'add_components', args);
  await sleep(120);
  const reader = await subscribe(app);
  const proposal = await proposalFrom(reader, call);
  const scene = applyScenePatch(setup.scene, proposal.patch);
  assert.equal((await sync(app, delta(setup, scene, { deliveryId: proposal.deliveryId, canUndo: true }))).status, 200);
  assert.equal((await call).structuredContent.status, 'applied');
  // The same call made twice during the wait is one edit with one outcome.
  assert.deepEqual(await repeated, await call);
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.componentCount, 1);
  // A view that does not come back is unavailable once the wait is over; reading still works.
  await reader.cancel();
  const started = Date.now();
  assert.equal((await rpc(app, 'remove_components', { workspaceRef, expectedRevision: 1, clientRequestId: 'gone', components: [{ id: scene.elements[0].id }] })).structuredContent.error.code, 'WORKSPACE_UNAVAILABLE');
  assert.ok(Date.now() - started >= 350);
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.revision, 1);
});

test('a scene the mirror does not take is refused with the reason, and the mirror keeps what it had', async t => {
  const app = createApplication({ origin });
  t.after(() => app.close());
  const reader = await subscribe(app);
  const setup = snapshot();
  // A view in Claude registers from its sandbox origin, as a view in ChatGPT does from its own.
  const claude = 'https://0123456789abcdef0123456789abcdef.claudemcpcontent.com';
  const registered = await request(app, '/mcp/sync', { channel: token, canUndo: false, canRedo: false, ...setup }, claude);
  assert.equal(registered.headers.get('access-control-allow-origin'), claude);
  const { workspaceRef } = await registered.json();
  const many = { ...setup.scene, elements: Array.from({ length: 201 }, (_, index) => ({ type: 'lens', id: 'lens' + index, x: index, y: 0 })) };
  const refused = await sync(app, { id: setup.id, revision: 1, hash: sceneHash(many), scene: many });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).message, /more than 200 components or 100 paths/);
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.revision, 0);
  await reader.cancel();
});
