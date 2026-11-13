// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createApplication } from '../../mcp/server.js';
import { sceneHash, snapshot, compactReading, CAVEATS } from '../../mcp/stateless.js';
import { inspectDocument, emptyDocument } from '../../mcp/scene-api.js';
import { diffScene, applyScenePatch } from '../../mcp/web/scene-patch.js';
import { createDrawnPath } from '../../sketch/js/path-types.js';
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

test('an unconfirmed edit keeps its outcome through a second one, a changed call and a full mirror', async t => {
  const app = createApplication({ origin, mirrorOptions: { ackMs: 60, maxWorkspaces: 1, maxUnconfirmed: 2 } });
  t.after(() => app.close());
  let reader = await subscribe(app);
  const setup = snapshot();
  const { workspaceRef } = await (await sync(app, setup)).json();
  const lens = (clientRequestId, x) => ({ workspaceRef, expectedRevision: 0, clientRequestId, components: [{ type: 'lens', x, y: 0 }] });
  const first = rpc(app, 'add_components', lens('first', 0));
  const firstProposal = await proposalFrom(reader, first);
  assert.equal((await first).structuredContent.error.code, 'EDIT_UNCONFIRMED');
  // Its ID still names that edit: other arguments under it are refused.
  assert.equal((await rpc(app, 'add_components', lens('first', 9))).structuredContent.error.code, 'REQUEST_ID_REUSED');
  // A second edit left unconfirmed does not take the place of the first.
  const second = rpc(app, 'add_components', lens('second', 50));
  await proposalFrom(reader, second);
  assert.equal((await second).structuredContent.error.code, 'EDIT_UNCONFIRMED');
  // No more are sent until the browser has answered for these.
  const third = (await rpc(app, 'add_components', lens('third', 90))).structuredContent.error;
  assert.equal(third.code, 'EDIT_UNCONFIRMED'); assert.match(third.message, /earlier edits/);
  // The view goes. While its edits are unconfirmed its mirror is not given to another view.
  await reader.cancel();
  const other = await subscribe(app, 'c'.repeat(64));
  assert.equal((await (await sync(app, setup, { channel: 'c'.repeat(64) })).json()).error, 'BUSY');
  await other.cancel();
  // It returns and says it applied the first.
  reader = await subscribe(app);
  const scene = applyScenePatch(setup.scene, firstProposal.patch);
  assert.equal((await sync(app, delta(setup, scene, { deliveryId: firstProposal.deliveryId, canUndo: true }))).status, 200);
  const again = (await rpc(app, 'add_components', lens('first', 0))).structuredContent;
  assert.equal(again.status, 'applied'); assert.equal(again.revision, 1); assert.equal(again.changed.length, 1);
  // The second was computed on the scene the first replaced, so it cannot have been applied.
  assert.equal((await rpc(app, 'add_components', lens('second', 50))).structuredContent.error.code, 'REVISION_CONFLICT');
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.componentCount, 1);
  // With nothing left unconfirmed, a view that has gone gives up its place again.
  await reader.cancel();
  const next = await subscribe(app, 'c'.repeat(64));
  assert.equal((await sync(app, setup, { channel: 'c'.repeat(64) })).status, 200);
  await next.cancel();
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

test('a scene the mirror does not take is refused with the reason, and the chat is told instead of reading the old one', async t => {
  const app = createApplication({ origin });
  t.after(() => app.close());
  const reader = await subscribe(app);
  const setup = snapshot({ revision: 0, scene: { elements: [{ type: 'cwlaser', id: 'laser', x: 0, y: 0 }, { type: 'powermeter', id: 'meter', x: 300, y: 0 }] } });
  // A view in Claude registers from its sandbox origin, as a view in ChatGPT does from its own.
  const claude = 'https://0123456789abcdef0123456789abcdef.claudemcpcontent.com';
  const registered = await request(app, '/mcp/sync', { channel: token, canUndo: false, canRedo: false, ...setup }, claude);
  assert.equal(registered.headers.get('access-control-allow-origin'), claude);
  const { workspaceRef } = await registered.json();
  // The user removes the laser and builds past what the mirror takes.
  const many = { ...setup.scene, elements: Array.from({ length: 201 }, (_, index) => ({ type: 'lens', id: 'lens' + index, x: index, y: 0 })) };
  const refused = await sync(app, { id: setup.id, revision: 1, hash: sceneHash(many), scene: many });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).message, /more than 200 components or 100 paths/);
  // The mirror still holds the scene with the laser. Reading it would describe a setup that is gone.
  const edit = { workspaceRef, expectedRevision: 0, clientRequestId: 'on-old-scene', components: [{ id: 'meter', dx: 5 }] };
  for (const [name, args] of [['get_setup', { workspaceRef }], ['get_items', { workspaceRef }], ['inspect_setup', { workspaceRef }], ['open_setup', { workspaceRef }], ['move_components', edit]]) {
    const { error } = (await rpc(app, name, args)).structuredContent;
    assert.equal(error.code, 'WORKSPACE_NOT_SHARED', name);
    assert.match(error.message, /more than 200 components or 100 paths/, name);
  }
  // A scene it takes is read again, under the same reference.
  const fewer = { ...many, elements: many.elements.slice(0, 200) };
  const taken = await sync(app, { id: setup.id, revision: 2, hash: sceneHash(snapshot({ revision: 2, scene: fewer }).scene), scene: fewer });
  assert.equal((await taken.json()).workspaceRef, workspaceRef);
  const info = (await rpc(app, 'get_setup', { workspaceRef })).structuredContent;
  assert.equal(info.revision, 2); assert.equal(info.componentCount, 200);
  await reader.cancel();
});

test('a connected inspection reads one page of detectors and fibers, each with what it models', async t => {
  const app = createApplication({ origin, computeScene: async (kind, scene) => inspectDocument({ ...emptyDocument(), scene }) });
  t.after(() => app.close());
  const reader = await subscribe(app);
  const setup = snapshot({ revision: 0, scene: { elements: [
    { type: 'cwlaser', id: 'laser', x: 0, y: 0 }, { type: 'powermeter', id: 'meter', x: 300, y: 0 }, { type: 'detector', id: 'spare', x: 300, y: 200 },
  ], beams: [
    { ...createDrawnPath('fiber', [{ x: 0, y: 300 }, { x: 200, y: 300 }]), id: 'hollow', fiberModel: 'argon' },
    { ...createDrawnPath('fiber', [{ x: 0, y: 400 }, { x: 200, y: 400 }]), id: 'patch' },
  ] } });
  const { workspaceRef } = await (await sync(app, setup)).json();
  const first = (await rpc(app, 'inspect_setup', { workspaceRef, limit: 1 })).structuredContent;
  assert.equal(first.total, 4); assert.equal(first.items.length, 1); assert.equal(first.nextOffset, 1);
  assert.equal(first.items[0].id, 'meter');
  assert.ok(first.items[0].reading.signal > 0);
  // The model is told what each reading stands for, not only the reading.
  assert.equal(first.items[0].capability.status, 'Simulated');
  assert.match(first.items[0].capability.description, /optical power/);
  assert.match(first.scope, /2D models/);
  const spare = (await rpc(app, 'inspect_setup', { workspaceRef, ids: ['spare'] })).structuredContent;
  assert.equal(spare.total, 1); assert.equal(spare.items[0].reading, null);
  assert.ok(spare.items[0].capability.description);
  // A fiber says what its model leaves out, and a linear one that it has no readout of its own.
  const { items } = (await rpc(app, 'inspect_setup', { workspaceRef, ids: ['hollow', 'patch'] })).structuredContent;
  assert.deepEqual(items.map(item => item.kind), ['fiber', 'fiber']);
  assert.match(items[0].capability.limits, /argon capillary model; no ionization/);
  assert.equal(items[0].readoutNote, undefined);
  assert.match(items[1].capability.limits, /linear delay, attenuation and constant dispersion/);
  assert.match(items[1].readoutNote, /no dedicated solver readout/);
  await reader.cancel();
});

test('a reading leaves its sampled curves out, and one curve is read a window at a time', async t => {
  const app = createApplication({ origin, computeScene: async (kind, scene) => inspectDocument({ ...emptyDocument(), scene }) });
  t.after(() => app.close());
  const reader = await subscribe(app);
  const scene = JSON.parse(await readFile(new URL('../../Examples/Ultrashort Pulses/Hollow-core pulse compressor.json', import.meta.url), 'utf8'));
  const setup = snapshot({ revision: 0, scene });
  const { workspaceRef } = await (await sync(app, setup)).json();
  // With their curves, the three readings of this setup were 280,000 characters, more than a chat host passes on.
  const traced = inspectDocument({ ...emptyDocument(), scene: setup.scene });
  assert.ok(size(traced.detectors.map(item => item.reading)) > 150000);
  const page = await rpc(app, 'inspect_setup', { workspaceRef });
  assert.ok(size(page.content) < 12000, 'the page is ' + size(page.content) + ' bytes');
  const { items } = page.structuredContent;
  assert.deepEqual(items.map(item => item.id).sort(), ['hcf-before', 'hcf-fiber', 'hcf-output']);
  // What sums a curve up stays in the reading: the band, the duration, the energy, the peak power.
  const { reading } = items.find(item => item.id === 'hcf-output');
  assert.ok(reading.signal > 0 && reading.bandMin < reading.wavelength && reading.wavelength < reading.bandMax);
  const { envelope } = reading.pulse;
  assert.ok(envelope.fwhmFs > 0 && envelope.energyJ > 0 && envelope.peakPowerW > 0);
  // Each curve is named where it was, with its length. Short lists are not curves.
  assert.deepEqual(envelope.intensity, { omitted: 1024, curve: 'pulse.envelope.intensity' });
  assert.deepEqual(reading.pulse.trains[0].envelope.timeFs, { omitted: 1024, curve: 'pulse.trains.0.envelope.timeFs' });
  assert.equal(reading.spectrum.curve, 'spectrum');
  assert.ok(Array.isArray(reading.pulse.trains) && Array.isArray(reading.sourceFractions) && Array.isArray(reading.approximations));
  const fiber = items.find(item => item.id === 'hcf-fiber');
  assert.deepEqual(fiber.reading.field.re, { omitted: 1024, curve: 'field.re' });
  assert.ok(fiber.reading.metrics.fwhmFs > 0 && fiber.reading.bIntegral > 0);
  assert.match(fiber.capability.limits, /argon capillary/);

  // One curve of one reading, in windows that are the tracer's own samples.
  const whole = traced.detectors.find(item => item.id === 'hcf-output').reading;
  const curve = args => rpc(app, 'inspect_setup', { workspaceRef, ids: ['hcf-output'], curve: 'pulse.envelope.intensity', ...args });
  const first = (await curve({})).structuredContent;
  assert.equal(first.total, 1024); assert.equal(first.offset, 0); assert.equal(first.nextOffset, 128); assert.equal(first.revision, 0);
  assert.deepEqual(first.values, whole.pulse.envelope.intensity.slice(0, 128));
  const last = (await curve({ sampleOffset: 1000, sampleLimit: 256 })).structuredContent;
  assert.deepEqual(last.values, whole.pulse.envelope.intensity.slice(1000)); assert.equal(last.nextOffset, null);
  assert.deepEqual((await curve({ sampleOffset: 5000 })).structuredContent.values, []);
  const lines = await rpc(app, 'inspect_setup', { workspaceRef, ids: ['hcf-output'], curve: 'spectrum', sampleLimit: 256 });
  assert.deepEqual(lines.structuredContent.values, whole.spectrum); assert.ok(size(lines.content) < 40000);
  assert.deepEqual((await rpc(app, 'inspect_setup', { workspaceRef, ids: ['hcf-fiber'], curve: 'spectrum.w', sampleLimit: 4 })).structuredContent.values, traced.paths[0].reading.spectrum.w.slice(0, 4));
  // What is not one curve of one reading is refused in words.
  const refused = async args => (await rpc(app, 'inspect_setup', { workspaceRef, ...args })).structuredContent.error?.message;
  assert.match(await refused({ curve: 'spectrum' }), /Name one reading/);
  assert.match(await refused({ ids: ['hcf-output', 'hcf-before'], curve: 'spectrum' }), /Name one reading/);
  assert.match(await refused({ ids: ['absent'], curve: 'spectrum' }), /absent has no curve named spectrum/);
  assert.match(await refused({ ids: ['hcf-output'], curve: 'pulse.trains' }), /no curve named pulse.trains/);
  assert.match(await refused({ ids: ['hcf-output'], curve: 'signal' }), /no curve named signal/);
  assert.match(await refused({ ids: ['hcf-output'], curve: 'spectrum.length' }), /no curve named/);
  assert.match(await refused({ ids: ['hcf-output'], curve: '__proto__.constructor' }), /no curve named/);
  assert.match(await refused({ ids: ['hcf-output'], curve: 'spectrum..x' }), /invalid format/);
  assert.match(await refused({ ids: ['hcf-output'], sampleLimit: 10 }), /Name it with curve/);
  assert.match(await refused({ ids: ['hcf-output'], curve: 'spectrum', sampleLimit: 257 }), /numeric bounds/);
  await reader.cancel();
});

test('a list of caveats is never left out, and a list of colours is', () => {
  const notes = Array.from({ length: 12 }, (_, index) => 'Approximation' + index);
  const colours = Array.from({ length: 12 }, () => '#ff3030');
  const compact = compactReading({ approximations: notes, profileColors: colours, profile: Array(12).fill(0.5), short: [1, 2, 3], pulse: null, branches: [{ gates: Array(9).fill({ opl: 1 }) }] });
  assert.deepEqual(compact.approximations, notes);
  assert.deepEqual(compact.profileColors, { omitted: 12, curve: 'profileColors' });
  assert.deepEqual(compact.profile, { omitted: 12, curve: 'profile' });
  assert.deepEqual(compact.short, [1, 2, 3]);
  assert.equal(compact.pulse, null);
  assert.deepEqual(compact.branches, [{ gates: { omitted: 9, curve: 'branches.0.gates' } }]);
  assert.equal(compactReading(null), null);
});

test('the reference in the open result works before its view exists, and names the first view to take it up, for good', async t => {
  let now = 0;
  const app = createApplication({ origin, mirrorOptions: { openMs: 400, maxInvitations: 3, now: () => now } });
  t.after(() => app.close());
  const opened = await rpc(app, 'open_setup', {});
  const { workspaceRef } = opened.structuredContent, { ticket, setup } = opened._meta.opticalsetup;
  assert.match(workspaceRef, /^[a-f0-9]{64}$/); assert.match(ticket, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify([opened.structuredContent, opened.content]).includes(ticket), 'the model is not shown the ticket');
  // The model edits in the turn that opened the workbench; the view registers a moment later.
  const call = rpc(app, 'add_components', { workspaceRef, expectedRevision: 0, clientRequestId: 'same-turn', components: [{ type: 'lens', x: 0, y: 0 }] });
  await sleep(100);
  // Knowing the reference is not enough to take it up.
  const other = 'c'.repeat(64), intruder = await subscribe(app, other);
  assert.notEqual((await (await sync(app, setup, { channel: other, ticket: workspaceRef })).json()).workspaceRef, workspaceRef);
  const reader = await subscribe(app);
  assert.equal((await (await sync(app, setup, { ticket })).json()).workspaceRef, workspaceRef);
  const proposal = await proposalFrom(reader, call);
  const scene = applyScenePatch(setup.scene, proposal.patch);
  const applied = delta(setup, scene, { deliveryId: proposal.deliveryId, canUndo: true, ticket });
  assert.equal((await (await sync(app, applied)).json()).workspaceRef, workspaceRef);
  const result = (await call).structuredContent;
  assert.equal(result.status, 'applied'); assert.equal(result.workspaceRef, workspaceRef);
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.workspaceRef, workspaceRef);
  // The view's own channel is still what confirms: the ticket and the reference cannot.
  for (const channel of [ticket, workspaceRef]) assert.equal((await sync(app, applied, { channel })).status, 503);

  // Reopening gives the new view a reference of its own, good at once, and the first view keeps the one it has.
  const reopened = await rpc(app, 'open_setup', { workspaceRef });
  assert.notEqual(reopened.structuredContent.workspaceRef, workspaceRef);
  assert.deepEqual(reopened._meta.opticalsetup.setup.scene, scene);
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.revision, 1);

  // The same result shown a second time (a reloaded chat, a second tab) presents the same ticket.
  // The reference does not move: the later view is given its own, and the first keeps the one it has.
  const again = 'd'.repeat(64), second = await subscribe(app, again);
  const sentToSecond = second.read().then(({ value, done }) => done ? null : decode(value));
  const current = { id: setup.id, revision: 1, hash: applied.hash, scene };
  assert.equal((await (await sync(app, current, { channel: again, ticket, canUndo: true })).json()).workspaceRef, sceneHash(again));
  assert.equal((await (await sync(app, current, { ticket, canUndo: true })).json()).workspaceRef, workspaceRef);
  // An edit by the reference goes to the first view and to no other.
  const move = rpc(app, 'move_components', { workspaceRef, expectedRevision: 1, clientRequestId: 'to-first', components: [{ id: scene.elements[0].id, dx: 5 }] });
  const moveProposal = await proposalFrom(reader, move);
  const moved = applyScenePatch(scene, moveProposal.patch);
  assert.equal((await sync(app, delta(current, moved, { deliveryId: moveProposal.deliveryId, canUndo: true, ticket }))).status, 200);
  assert.equal((await move).structuredContent.status, 'applied');
  // The later view is read under its own reference, and was sent nothing.
  assert.equal((await rpc(app, 'get_setup', { workspaceRef: sceneHash(again) })).structuredContent.revision, 1);
  await second.cancel();
  assert.equal(await sentToSecond, null);

  // When the first view's mirror has gone the reference names nobody. Another view that presents
  // the ticket is not given it, and the first view comes back to it.
  await reader.cancel();
  now = 700000;
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.error.code, 'WORKSPACE_UNAVAILABLE');
  const third = 'f'.repeat(64), late = await subscribe(app, third);
  assert.equal((await (await sync(app, current, { channel: third, ticket, canUndo: true })).json()).workspaceRef, sceneHash(third));
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.error.code, 'WORKSPACE_UNAVAILABLE');
  const back = await subscribe(app);
  const held = { id: setup.id, revision: 2, hash: sceneHash(moved), scene: moved };
  assert.equal((await (await sync(app, held, { ticket, canUndo: true })).json()).workspaceRef, workspaceRef);
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.revision, 2);

  // A reference nobody takes up: the call waits for the view, then says what to do.
  const lonely = await rpc(app, 'open_setup', {});
  const started = Date.now();
  const error = (await rpc(app, 'get_setup', { workspaceRef: lonely.structuredContent.workspaceRef })).structuredContent.error;
  assert.equal(error.code, 'WORKSPACE_UNAVAILABLE'); assert.match(error.message, /explicit setup snapshot/);
  assert.ok(Date.now() - started >= 350);
  // Only so many views are expected at once. One opened past that is not waited for, and its
  // view works under a reference of its own, as a view does that receives no ticket.
  await rpc(app, 'open_setup', {}); await rpc(app, 'open_setup', {});
  const crowded = await rpc(app, 'open_setup', {});
  const before = Date.now();
  assert.equal((await rpc(app, 'get_setup', { workspaceRef: crowded.structuredContent.workspaceRef })).structuredContent.error.code, 'WORKSPACE_UNAVAILABLE');
  assert.ok(Date.now() - before < 200);
  const extra = 'e'.repeat(64), fourth = await subscribe(app, extra);
  assert.equal((await (await sync(app, setup, { channel: extra, ticket: crowded._meta.opticalsetup.ticket })).json()).workspaceRef, sceneHash(extra));
  // A view is expected for two minutes. One that comes later is not waited for, and is not given the reference either.
  now += 130000;
  const expired = Date.now();
  assert.equal((await rpc(app, 'get_setup', { workspaceRef: lonely.structuredContent.workspaceRef })).structuredContent.error.code, 'WORKSPACE_UNAVAILABLE');
  assert.ok(Date.now() - expired < 200);
  const tardy = '9'.repeat(64), fifth = await subscribe(app, tardy);
  assert.equal((await (await sync(app, setup, { channel: tardy, ticket: lonely._meta.opticalsetup.ticket })).json()).workspaceRef, sceneHash(tardy));
  for (const stream of [intruder, late, back, fourth, fifth]) await stream.cancel();
});

test('an exact retry by an opened reference is never sent to another view, whatever becomes of the first', async t => {
  const app = createApplication({ origin, mirrorOptions: { maxWorkspaces: 2 } });
  t.after(() => app.close());
  const other = 'c'.repeat(64), filler = 'd'.repeat(64);
  const opened = await rpc(app, 'open_setup', {});
  const { workspaceRef } = opened.structuredContent, { ticket, setup } = opened._meta.opticalsetup;
  let a = await subscribe(app);
  assert.equal((await (await sync(app, setup, { ticket })).json()).workspaceRef, workspaceRef);
  // The first view applies an edit and confirms it.
  const args = { workspaceRef, expectedRevision: 0, clientRequestId: 'first', components: [{ type: 'lens', x: 0, y: 0 }] };
  const call = rpc(app, 'add_components', args);
  const proposal = await proposalFrom(a, call);
  const scene = applyScenePatch(setup.scene, proposal.patch);
  assert.equal((await sync(app, delta(setup, scene, { deliveryId: proposal.deliveryId, canUndo: true, ticket }))).status, 200);
  assert.equal((await call).structuredContent.status, 'applied');
  // It goes, and the mirror fills. Then the same stored result is shown again: a second view
  // registers with the same ticket, at the scene the result carried, and takes the first one's place.
  await a.cancel();
  const gone = await subscribe(app, filler);
  assert.equal((await sync(app, snapshot(), { channel: filler })).status, 200);
  await gone.cancel();
  const b = await subscribe(app, other);
  const sentToSecond = b.read().then(({ value, done }) => done ? null : decode(value));
  assert.equal((await (await sync(app, setup, { channel: other, ticket })).json()).workspaceRef, sceneHash(other));
  // The second view has a place and its own reference. The opened reference names nobody, and
  // the same call again is sent to nobody.
  assert.equal((await rpc(app, 'get_setup', { workspaceRef: sceneHash(other) })).structuredContent.revision, 0);
  assert.equal((await rpc(app, 'add_components', args)).structuredContent.error.code, 'WORKSPACE_UNAVAILABLE');
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.error.code, 'WORKSPACE_UNAVAILABLE');
  // The first view returns to its reference. The same call is then judged by the scene that view
  // holds, where the edit already is.
  a = await subscribe(app);
  const held = { id: setup.id, revision: 1, hash: sceneHash(scene), scene };
  assert.equal((await (await sync(app, held, { ticket, canUndo: true })).json()).workspaceRef, workspaceRef);
  assert.equal((await rpc(app, 'add_components', args)).structuredContent.error.code, 'REVISION_CONFLICT');
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.componentCount, 1);
  await b.cancel();
  assert.equal(await sentToSecond, null, 'the second view was sent nothing');
  await a.cancel();
});

test('a setup too large to send is reported by the view, and the chat is not given the old one', async t => {
  const app = createApplication({ origin });
  t.after(() => app.close());
  const reader = await subscribe(app);
  const setup = snapshot({ revision: 0, scene: { elements: [{ type: 'cwlaser', id: 'laser', x: 0, y: 0 }, { type: 'powermeter', id: 'meter', x: 300, y: 0 }] } });
  const { workspaceRef } = await (await sync(app, setup)).json();
  // The view holds a scene whose sync would not fit in a request, so it says so instead of sending it.
  const notice = await sync(app, { id: setup.id, revision: 1, hash: 'b'.repeat(64), unsent: 'oversized' });
  assert.equal(notice.status, 400);
  assert.match((await notice.json()).message, /larger than the live workbench takes/);
  for (const name of ['get_setup', 'get_items', 'inspect_setup']) {
    const { error } = (await rpc(app, name, { workspaceRef })).structuredContent;
    assert.equal(error.code, 'WORKSPACE_NOT_SHARED', name); assert.match(error.message, /larger than the live workbench takes/, name);
  }
  // Another channel cannot say this of the workbench: the notice counts only from the view's own channel.
  assert.equal((await sync(app, { id: setup.id, revision: 1, hash: 'b'.repeat(64), unsent: 'oversized' }, { channel: 'c'.repeat(64) })).status, 503);
  // A scene that did not get through is said the same way, with its own reason. Anything else is not a notice.
  assert.match((await (await sync(app, { id: setup.id, revision: 1, hash: 'b'.repeat(64), unsent: 'undelivered' })).json()).message, /could not be sent to the service/);
  assert.match((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.error.message, /could not be sent to the service/);
  assert.equal((await (await sync(app, { id: setup.id, revision: 1, hash: 'b'.repeat(64), unsent: 'constructor' })).json()).error, 'RESYNC_REQUIRED');
  // A scene that fits is read again.
  const smaller = { ...setup.scene, elements: setup.scene.elements.slice(1) };
  assert.equal((await sync(app, { id: setup.id, revision: 2, hash: sceneHash(smaller), scene: smaller })).status, 200);
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).structuredContent.componentCount, 1);
  await reader.cancel();
});

test('every list of text in a bundled reading is either kept whole as a caveat or known to be data', async () => {
  // A caveat list is protected by name. A new kind of text list has to be put on one side or the
  // other here, so that it cannot be left out of a reading unnoticed once it grows long.
  const data = new Set(['profileColors']), found = new Set();
  const walk = (value, key) => {
    if (Array.isArray(value)) { if (value.some(item => typeof item === 'string')) found.add(key); value.forEach(item => walk(item, key)); }
    else if (value && typeof value === 'object') for (const [name, item] of Object.entries(value)) walk(item, name);
  };
  const folder = new URL('../../Examples/', import.meta.url);
  for (const group of await readdir(folder, { withFileTypes: true })) {
    if (!group.isDirectory()) continue;
    for (const name of await readdir(new URL(group.name + '/', folder))) {
      if (!name.endsWith('.json')) continue;
      const scene = JSON.parse(await readFile(new URL(group.name + '/' + name, folder), 'utf8'));
      const traced = inspectDocument({ ...emptyDocument(), scene: snapshot({ revision: 0, scene }).scene });
      for (const item of [...traced.detectors, ...traced.paths]) walk(item.reading, '');
    }
  }
  assert.ok(found.has('phaseIssues') && found.has('profileColors'), 'the bundled scenes do have readings with lists of text');
  for (const key of found) assert.ok(CAVEATS.has(key) || data.has(key), 'a reading has a list of text named ' + key);
  const long = Array.from({ length: 12 }, (_, index) => 'note' + index);
  assert.deepEqual(compactReading({ interference: { phaseIssues: long } }).interference.phaseIssues, long);
});
