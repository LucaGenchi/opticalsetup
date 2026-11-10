// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// What the service and its view owe to each other and to the hosts that run them:
// one hash for one scene, a handshake every client can complete, metadata each
// host accepts, and a view whose every file is actually served.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleStatelessRpc } from '../../mcp/stateless.js';
import { createApplication } from '../../mcp/server.js';
import { buildWidget, widgetAsset } from '../../mcp/widget.js';
import { registry, createElement } from '../../mcp/registry.js';
import { inspectDocument, emptyDocument } from '../../mcp/scene-api.js';
import { browserSceneHash, canonicalScene, mayAdopt, offeredSetup, proposalMatches, takeLateResult } from '../../mcp/web/snapshot.js';
import { createDrawnPath } from '../../sketch/js/path-types.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const origin = 'https://mcp.example.com';
const service = { origin, html: '<html></html>', compute: async (kind, scene) => inspectDocument({ ...emptyDocument(), scene }) };
const rpc = async (method, params, extra = {}) => handleStatelessRpc({ jsonrpc: '2.0', id: 1, method, params }, { ...service, ...extra });
const call = async (name, args = {}) => (await rpc('tools/call', { name, arguments: args })).result;
// The editor's memory, as the view reads it: the scene exactly as the editor serializes it.
const editorState = (elements, beams = []) => JSON.stringify({ app: 'optics2d', version: 1, elements, beams });
const points = [{ x: 0, y: 0 }, { x: 80, y: 20 }];

async function bundledScenes() {
  const scenes = [];
  for (const folder of ['Examples', 'community-submissions']) {
    for (const entry of await readdir(join(ROOT, folder), { recursive: true })) {
      if (!entry.endsWith('.json')) continue;
      const data = JSON.parse(await readFile(join(ROOT, folder, entry), 'utf8'));
      const scene = data.scene || data;
      if (Array.isArray(scene.elements)) scenes.push([join(folder, entry), scene]);
    }
  }
  return scenes;
}

test('the form both sides hash is a fixed point for every palette element, drawn path and bundled scene', async () => {
  const cases = Object.entries(registry).filter(([, def]) => !def.hidden)
    .map(([type]) => [type, JSON.parse(editorState([createElement(type, 100.5, -37.25)]))]);
  for (const type of ['beam', 'fiber', 'barefiber']) cases.push([type, JSON.parse(editorState([], [createDrawnPath(type, points)]))]);
  const scenes = await bundledScenes();
  assert.ok(scenes.length > 20, 'the bundled scenes were found');
  for (const [label, scene] of [...cases, ...scenes]) {
    const once = canonicalScene(scene, registry);
    assert.deepEqual(canonicalScene(once, registry), once, `${label} changes when it is normalized a second time`);
  }
});

test('a fiber drawn by hand and a glass just placed are accepted with the hash the view computed', async () => {
  for (const [label, state] of [
    ['hand-drawn fiber', editorState([], [createDrawnPath('fiber', points)])],
    ['free-form glass', editorState([createElement('freeglass', 100, 100)])],
  ]) {
    const scene = canonicalScene(state, registry);
    const setup = { id: 'view', revision: 4, scene, hash: await browserSceneHash(scene) };
    const result = await call('add_components', { setup, clientRequestId: 'after-' + label, components: [{ type: 'lens', x: 300, y: 0 }] });
    assert.equal(result.isError, undefined, `${label}: ${result.content[0].text.slice(0, 120)}`);
    assert.ok(proposalMatches(setup, result.structuredContent), `${label}: the proposal is based on the scene the view holds`);
    assert.equal(result.structuredContent.setup.hash, await browserSceneHash(result.structuredContent.setup.scene));
    // The raw editor state is not that scene: its hash is refused, which is why the view hashes the loaded form.
    const raw = JSON.parse(state);
    const refused = await call('get_setup', { setup: { id: 'view', revision: 4, scene: raw, hash: await browserSceneHash(raw) } });
    assert.equal(refused.structuredContent.error.code, 'SNAPSHOT_MISMATCH', label);
  }
});

test('a view that started empty before its tool finished takes the late result, unless something was done in it', async () => {
  const empty = { app: 'optics2d', version: 1, elements: [], beams: [] };
  const placeholder = { provisional: true, setup: { id: 'placeholder', revision: 0, scene: empty }, history: [], future: [] };
  const opened = (await call('open_setup')).structuredContent;
  const late = (await call('add_components', { setup: opened.setup, clientRequestId: 'late', components: [{ type: 'lens', x: 0, y: 0 }] })).structuredContent;
  assert.notEqual(late.setup.id, placeholder.setup.id);
  assert.equal(mayAdopt(placeholder, opened), true, 'the setup the view was opened for');
  assert.equal(mayAdopt(placeholder, late), true, 'an edit of that setup');
  // Work done in the placeholder is not thrown away for a result that arrives afterwards.
  assert.equal(mayAdopt({ ...placeholder, setup: { ...placeholder.setup, revision: 1 }, history: [empty] }, late), false);
  assert.equal(mayAdopt({ ...placeholder, future: [empty] }, late), false);
  // A view that was given its setup, or runs outside a chat, never changes setup.
  assert.equal(mayAdopt({ ...placeholder, provisional: false }, late), false);
  assert.equal(mayAdopt(placeholder, { setup: { ...late.setup, id: 'placeholder' } }), false, 'its own setup is not another one');
  for (const nothing of [undefined, null, {}, { setup: {} }]) assert.equal(mayAdopt(placeholder, nothing), false);
});

test('work done in the placeholder while a late result is being checked is kept, not replaced', async () => {
  const empty = { app: 'optics2d', version: 1, elements: [], beams: [] };
  const late = { setup: { id: 'opened-for', revision: 1, scene: empty } };
  // A stand-in for the view: its state, and what happens while each of the two waits is under way.
  const run = async ({ duringCheck = () => {}, duringSettle = () => {}, provisional = true } = {}) => {
    const state = { provisional, setup: { id: 'placeholder', revision: 0, scene: empty }, history: [], future: [], dragging: false };
    const steps = [];
    const outcome = await takeLateResult(late, {
      view: () => state,
      validate: async incoming => { steps.push('check'); await null; duringCheck(state); return { setup: incoming.setup }; },
      settle: async () => { steps.push('settle'); await null; duringSettle(state); },
      replace: offered => { steps.push('replace'); state.setup = offered.setup; },
    });
    return { outcome, steps, state };
  };
  const edit = state => { state.history.push(state.setup.scene); state.setup = { ...state.setup, revision: 1 }; };

  const untouched = await run();
  assert.equal(untouched.outcome, 'taken');
  assert.deepEqual(untouched.steps, ['check', 'settle', 'replace'], 'the replacement follows both waits');
  assert.equal(untouched.state.setup.id, 'opened-for');

  // An edit committed while the result's hash was being checked.
  const committed = await run({ duringCheck: edit });
  assert.equal(committed.outcome, 'refuse'); assert.ok(!committed.steps.includes('replace'));
  assert.equal(committed.state.setup.id, 'placeholder'); assert.equal(committed.state.history.length, 1);
  // An edit still uncommitted at that moment, which only the settling commits.
  const pending = await run({ duringSettle: edit });
  assert.equal(pending.outcome, 'refuse'); assert.ok(!pending.steps.includes('replace'));
  assert.equal(pending.state.setup.revision, 1);
  // A pointer that went down meanwhile: the result is tried again when it is released.
  const pressed = await run({ duringCheck: state => { state.dragging = true; } });
  assert.equal(pressed.outcome, 'wait'); assert.ok(!pressed.steps.includes('replace'));
  // A view that has its setup is not checked at all.
  const settled = await run({ provisional: false });
  assert.equal(settled.outcome, 'refuse'); assert.deepEqual(settled.steps, []);
  // A result that cannot be checked leaves the placeholder as it was.
  const state = { provisional: true, setup: { id: 'placeholder', revision: 0, scene: empty }, history: [], future: [], dragging: false };
  await assert.rejects(takeLateResult(late, { view: () => state, validate: async () => { throw new Error('unreadable'); }, settle: async () => {}, replace: () => { state.setup = late.setup; } }), /unreadable/);
  assert.equal(state.setup.id, 'placeholder');
});

test('a view built from an edit result counts that edit as applied, and refuses a result whose hash is wrong', async () => {
  const opened = (await call('open_setup')).structuredContent;
  const edit = (await call('add_components', { setup: opened.setup, clientRequestId: 'first-edit', components: [{ type: 'lens', x: 0, y: 0 }] })).structuredContent;
  const fromEdit = await offeredSetup(edit);
  assert.deepEqual(fromEdit.setup, edit.setup);
  // Delivered again, the same result is one the view has already applied, not an edit based on an older scene.
  assert.deepEqual(fromEdit.requests, ['first-edit']);
  assert.ok(!proposalMatches(fromEdit.setup, edit), 'which is what it would otherwise look like');
  assert.deepEqual((await offeredSetup(opened)).requests, []);
  assert.deepEqual([fromEdit.history, fromEdit.future], [[], []]);
  assert.equal(await offeredSetup({ ...edit, setup: { ...edit.setup, hash: 'a'.repeat(64) } }), null);
  fromEdit.setup.scene.elements.length = 0;
  assert.equal(edit.setup.scene.elements.length, 1, 'the view works on its own copy');
});

test('a handshake client is answered in the revision it asked for, an unknown one in the newest handshake revision', async () => {
  for (const version of ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25', '2026-07-28']) {
    assert.equal((await rpc('initialize', { protocolVersion: version })).result.protocolVersion, version);
  }
  for (const version of ['2099-01-01', undefined, 7]) {
    assert.equal((await rpc('initialize', { protocolVersion: version })).result.protocolVersion, '2025-11-25');
  }
});

test('the view names no sandbox origin in the standard key, and both hosts may open the live channel', async () => {
  const meta = (await rpc('resources/read', { uri: 'ui://opticalsetup/workbench.html' })).result.contents[0]._meta;
  // Each host has its own format for ui.domain and Claude refuses to show a view that sends another's.
  assert.equal(meta.ui.domain, undefined);
  assert.equal(meta['openai/widgetDomain'], origin);
  assert.deepEqual(meta.ui.csp, { connectDomains: [origin], resourceDomains: [origin] });
  const app = createApplication({ origin });
  const subscribe = from => app(new Request(origin + '/mcp/events', { method: 'POST', headers: { origin: from, 'content-type': 'application/json' }, body: JSON.stringify({ channel: 'a'.repeat(64) }) }));
  for (const allowed of ['https://c3d80a4ed901ee05b21755a88273b4a4.claudemcpcontent.com', 'https://mcp-example-com.web-sandbox.oaiusercontent.com']) {
    const response = await subscribe(allowed);
    assert.equal(response.status, 200, allowed);
    assert.equal(response.headers.get('access-control-allow-origin'), allowed);
    await response.body.cancel();
  }
  for (const refused of ['https://not-a-hash.claudemcpcontent.com', 'https://c3d80a4ed901ee05b21755a88273b4a4.claudemcpcontent.com.evil.example', 'http://c3d80a4ed901ee05b21755a88273b4a4.claudemcpcontent.com', 'https://claudemcpcontent.com']) {
    assert.equal((await subscribe(refused)).status, 403, refused);
  }
  app.close();
});

test('a local service answers to every loopback name of its port, a hosted one only to its own host', async () => {
  const local = createApplication({ origin: 'http://127.0.0.1:5188' });
  const ask = (app, host, headers = {}) => app(new Request('http://127.0.0.1/mcp/health', { headers: { host, ...headers } }));
  for (const host of ['127.0.0.1:5188', 'localhost:5188', '[::1]:5188']) assert.equal((await ask(local, host)).status, 200, host);
  for (const host of ['localhost:9999', 'localhost', 'evil.example:5188']) assert.equal((await ask(local, host)).status, 403, host);
  assert.equal((await ask(local, 'localhost:5188', { origin: 'http://localhost:5188' })).status, 200);
  assert.equal((await ask(local, 'localhost:5188', { origin: 'https://evil.example' })).status, 403);
  const hosted = createApplication({ origin });
  assert.equal((await ask(hosted, 'mcp.example.com')).status, 200);
  for (const host of ['localhost', '127.0.0.1:5188']) assert.equal((await ask(hosted, host)).status, 403, host);
  for (const method of ['GET', 'DELETE']) assert.equal((await hosted(new Request(origin + '/mcp', { method }))).status, 405, method);
  local.close(); hosted.close();
});

test('a service that cannot render a PNG neither lists the tool nor asks the model to use it', async () => {
  const without = { screenshots: false };
  const listed = (await rpc('tools/list', undefined, without)).result.tools.map(tool => tool.name);
  assert.equal(listed.length, 14); assert.ok(!listed.includes('get_setup_screenshot'));
  assert.doesNotMatch((await rpc('initialize', {}, without)).result.instructions, /get_setup_screenshot/);
  assert.doesNotMatch((await rpc('server/discover', {}, without)).result.instructions, /get_setup_screenshot/);
  const refused = (await rpc('tools/call', { name: 'get_setup_screenshot', arguments: {} }, without)).result;
  assert.equal(refused.isError, true); assert.equal(refused.structuredContent.error.code, 'NOT_FOUND');
  // With a renderer, both are there.
  assert.ok((await rpc('tools/list')).result.tools.some(tool => tool.name === 'get_setup_screenshot'));
  assert.match((await rpc('initialize', {})).result.instructions, /Verify an edit with get_setup_screenshot/);
  const app = createApplication({ origin, screenshots: false });
  assert.equal((await (await app(new Request(origin + '/mcp/health'))).json()).screenshots, false);
  app.close();
});

test('the service registers exactly the element modules the editor registers', async () => {
  const sideEffects = async file => [...(await readFile(join(ROOT, file), 'utf8')).matchAll(/^import '([^']+)';/gm)].map(match => match[1].split('/').pop()).sort();
  const editor = await sideEffects('sketch/js/main.js');
  assert.ok(editor.length >= 3, 'the editor still registers element modules by importing them');
  // A module missing here would leave its elements out of the catalogue and make the service reject scenes that use them.
  assert.deepEqual(await sideEffects('mcp/registry.js'), editor);
});

test('every file the view loads is served, and the controls it takes over exist in the editor', async () => {
  const seen = new Set();
  const visit = async file => {
    if (seen.has(file)) return; seen.add(file);
    const source = await readFile(file, 'utf8');
    const specifiers = [...source.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]/g), ...source.matchAll(/(?:^|[\s;])import\s*['"]([^'"]+)['"]/g), ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match => match[1]);
    for (const specifier of specifiers) {
      assert.match(specifier, /^\.\.?\//, `${relative(ROOT, file)} imports ${specifier}, which a sandboxed view cannot resolve`);
      await visit(resolve(dirname(file), specifier));
    }
  };
  await visit(join(ROOT, 'mcp/web/entry.js'));
  assert.ok(seen.size > 40, 'the editor modules were followed from the view entry');
  for (const file of seen) {
    const path = relative(ROOT, file).split('\\').join('/');
    assert.equal((await widgetAsset('/mcp/assets/' + path)).status, 200, `${path} is loaded by the view but not served`);
  }
  for (const outside of ['/mcp/assets/package.json', '/mcp/assets/mcp/server.js', '/mcp/assets/sketch/js/../../mcp/server.js', '/mcp/assets/.github/workflows/ci.yml']) {
    assert.equal((await widgetAsset(outside)).status, 404, outside);
  }
  const html = await buildWidget(origin);
  assert.match(html, new RegExp(`<script type="module" src="${origin}/mcp/assets/mcp/web/entry\\.js"></script>`));
  assert.doesNotMatch(html, /<link[^>]+stylesheet|src="js\//);
  // The view replaces these controls' behaviour; a renamed control would silently keep the editor's own.
  const shell = await readFile(join(ROOT, 'sketch/index.html'), 'utf8');
  const bridge = await readFile(join(ROOT, 'mcp/web/bridge.js'), 'utf8');
  const own = /^(lab-|official-editor$)/;
  const ids = new Set([...bridge.matchAll(/getElementById\('([^']+)'\)/g)].map(match => match[1]).filter(id => !own.test(id)));
  for (const id of [...ids, 'btnNew', 'btnOpen', 'btnSave', 'btnUndo', 'btnRedo']) assert.match(shell, new RegExp(`id="${id}"`), `the editor has no #${id}`);
});
