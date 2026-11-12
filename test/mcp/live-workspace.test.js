// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The view's half of the live workspace, run against the real service: the
// browser's fetch is replaced by one that hands each request to the
// application, so the two halves of the protocol are tested together.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../../mcp/server.js';
import { sceneHash, snapshot } from '../../mcp/stateless.js';
import { applyScenePatch } from '../../mcp/web/scene-patch.js';
import { createLiveWorkspace } from '../../mcp/web/live-workspace.js';

const origin = 'https://mcp.example.com';
const widget = 'https://mcp-example-com.web-sandbox.oaiusercontent.com';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const rpc = async (app, name, args) => (await app.rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).result.structuredContent;
async function until(test, what, ms = 3000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(10)) if (test()) return;
  assert.fail('Timed out waiting for ' + what);
}

// One service and one view. `slow` delays the view's answer to a proposal, as a busy or throttled tab does.
function open(t, { mirrorOptions, slow = 0, initial = snapshot() } = {}) {
  let app = createApplication({ origin, mirrorOptions });
  const streams = [], sent = [];
  let stopped = false;
  globalThis.fetch = (url, init) => {
    // A view outlives the test that made it: once the test is over its requests go nowhere.
    if (stopped) return new Promise(() => {});
    const route = String(url).endsWith('/events') ? '/mcp/events' : '/mcp/sync';
    const abort = new AbortController();
    if (route === '/mcp/events') streams.push(abort); else sent.push(JSON.parse(init.body));
    return app(new Request(origin + route, { method: 'POST', headers: { origin: widget, 'content-type': 'application/json' }, body: init.body, signal: abort.signal }));
  };
  t.after(() => { stopped = true; app.close(); });
  // What the editor does with its setup, without the editor: bridge.js applies a proposal the same way.
  const view = { setup: initial, history: [], future: [], states: [], held: false };
  view.live = createLiveWorkspace({
    current: () => ({ ...view.setup, canUndo: Boolean(view.history.length), canRedo: Boolean(view.future.length) }),
    receive: async proposal => {
      if (slow) await sleep(slow);
      const { setup } = view;
      if (view.held || proposal.baseRevision !== setup.revision || proposal.baseHash !== setup.hash) { view.live.update(proposal.deliveryId, true, view.held); return; }
      const scene = proposal.action === 'undo_setup' ? view.history.at(-1) : applyScenePatch(setup.scene, proposal.patch);
      if (proposal.action === 'undo_setup') { view.future.push(setup.scene); view.history.pop(); }
      else { view.history.push(setup.scene); view.future = []; }
      view.setup = { ...setup, scene, hash: sceneHash(scene), revision: setup.revision + 1 };
      view.live.update(proposal.deliveryId);
    },
    changed: connected => view.states.push({ connected, reference: view.live.reference, synced: view.live.synced, problem: view.live.problem }),
  });
  view.edit = scene => {
    view.history.push(view.setup.scene); view.future = [];
    view.setup = { ...view.setup, scene, hash: sceneHash(scene), revision: view.setup.revision + 1 };
    view.live.update();
  };
  void view.live.connect();
  return {
    view, sent, streams,
    get app() { return app; },
    restart() { app.close(); app = createApplication({ origin, mirrorOptions }); },
    synced: () => until(() => view.live.synced, 'the view to be in step with the service'),
  };
}
const lens = (workspaceRef, expectedRevision, clientRequestId, x = 0) => ({ workspaceRef, expectedRevision, clientRequestId, components: [{ type: 'lens', x, y: 0 }] });

test('a view registers its scene, sends what changes, and confirms the edits the chat makes', async t => {
  const { app, view, sent, synced } = open(t);
  await synced();
  const workspaceRef = view.live.reference;
  assert.match(workspaceRef, /^[a-f0-9]{64}$/);
  assert.equal(sent[0].scene.elements.length, 0, 'the first message carries the scene');
  const added = await rpc(app, 'add_components', lens(workspaceRef, 0, 'first'));
  assert.equal(added.status, 'applied');
  assert.equal(view.setup.scene.elements[0].id, added.changed[0]);
  assert.equal(view.setup.hash, added.hash);
  // A manual change travels as the items that changed, and the chat's next edit is computed on it.
  await synced();
  view.edit({ ...view.setup.scene, elements: [{ ...view.setup.scene.elements[0], x: 40 }] });
  await synced();
  assert.equal(sent.at(-1).scene, undefined);
  assert.deepEqual(sent.at(-1).patch.elements.put.map(item => item.x), [40]);
  assert.equal((await rpc(app, 'move_components', { workspaceRef, expectedRevision: 1, clientRequestId: 'stale', components: [{ id: added.changed[0], dx: 1 }] })).error.code, 'REVISION_CONFLICT');
  const moved = await rpc(app, 'move_components', { workspaceRef, expectedRevision: 2, clientRequestId: 'moved', components: [{ id: added.changed[0], dx: 1 }] });
  assert.equal(moved.status, 'applied');
  assert.equal(view.setup.scene.elements[0].x, 41);
  // Undo is the browser's own history, and what the view then holds is what the service reads.
  assert.equal((await rpc(app, 'undo_setup', { workspaceRef, expectedRevision: 3, clientRequestId: 'undo' })).status, 'applied');
  assert.equal(view.setup.scene.elements[0].x, 40);
  await synced();
  assert.equal((await rpc(app, 'get_items', { workspaceRef })).items[0].x, 40);
});

test('an edit the view applies after the service stopped waiting is reported as applied when the call is repeated', async t => {
  const { app, view, synced } = open(t, { mirrorOptions: { ackMs: 60 }, slow: 200 });
  await synced();
  const args = lens(view.live.reference, 0, 'slow');
  assert.equal((await rpc(app, 'add_components', args)).error.code, 'EDIT_UNCONFIRMED');
  await until(() => view.setup.revision === 1, 'the view to apply the edit');
  await synced();
  const again = await rpc(app, 'add_components', args);
  assert.equal(again.status, 'applied'); assert.equal(again.revision, 1);
  await sleep(250);
  assert.equal(view.setup.scene.elements.length, 1, 'the repeated call added nothing');
});

test('the view keeps its reference while it reopens its stream, and an edit made meanwhile reaches it', async t => {
  const { app, view, streams, synced } = open(t);
  await synced();
  const workspaceRef = view.live.reference;
  view.states.length = 0;
  streams.at(-1).abort();
  const added = await rpc(app, 'add_components', lens(workspaceRef, 0, 'between-streams'));
  assert.equal(added.status, 'applied');
  assert.equal(view.setup.scene.elements.length, 1);
  assert.ok(view.states.some(state => !state.connected), 'the stream did end');
  assert.ok(view.states.every(state => state.reference === workspaceRef), 'the reference was never withdrawn');
});

test('a view that is engaged refuses an edit without the chat being told the setup changed', async t => {
  const { app, view, synced } = open(t);
  await synced();
  const args = lens(view.live.reference, 0, 'held');
  view.held = true;
  assert.equal((await rpc(app, 'add_components', args)).error.code, 'BUSY');
  view.held = false;
  assert.equal((await rpc(app, 'add_components', args)).status, 'applied');
});

test('a scene the service does not take leaves the view saying why, until the scene is one it takes', async t => {
  const { app, view, synced } = open(t);
  await synced();
  const workspaceRef = view.live.reference;
  const items = Array.from({ length: 201 }, (_, index) => ({ type: 'lens', id: 'lens' + index, x: index, y: 0 }));
  const many = snapshot({ revision: 0, scene: { elements: items.slice(0, 200) } }).scene;
  view.edit({ ...many, elements: [...many.elements, { ...many.elements[0], id: 'one-too-many' }] });
  await until(() => view.live.problem, 'the view to learn the scene was refused');
  assert.match(view.live.problem, /more than 200 components/);
  assert.equal(view.live.synced, false);
  assert.equal(view.live.reference, workspaceRef);
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).error.code, 'WORKSPACE_NOT_SHARED', 'the chat is not given the scene the view no longer holds');
  view.edit(many);
  await synced();
  assert.equal(view.live.problem, undefined);
  assert.equal((await rpc(app, 'get_setup', { workspaceRef })).componentCount, 200);
});

test('after the service restarts the view sends its scene again under the same reference', async t => {
  const context = open(t);
  const { view, streams, synced } = context;
  await synced();
  const workspaceRef = view.live.reference;
  assert.equal((await rpc(context.app, 'add_components', lens(workspaceRef, 0, 'before'))).status, 'applied');
  await synced();
  context.restart();
  streams.at(-1).abort();
  await until(() => !view.live.synced, 'the view to notice');
  await synced();
  assert.equal(view.live.reference, workspaceRef);
  const setup = await rpc(context.app, 'get_setup', { workspaceRef });
  assert.equal(setup.revision, 1); assert.equal(setup.componentCount, 1); assert.equal(setup.canUndo, true);
  assert.equal((await rpc(context.app, 'add_components', lens(workspaceRef, 1, 'after', 50))).status, 'applied');
});
