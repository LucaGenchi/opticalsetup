// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleStatelessRpc, TOOLS, snapshot } from '../../mcp/stateless.js';
import { createApplication } from '../../mcp/server.js';
import { proposalMatches } from '../../mcp/web/snapshot.js';
import { inspectDocument, emptyDocument } from '../../mcp/scene-api.js';
const service = { origin: 'https://mcp.example.com', html: '<html></html>', compute: async (kind, scene) => { if (kind === 'inspect') return inspectDocument({ ...emptyDocument(), scene }); throw Error('Do not fake screenshots in tests'); } };
const call = async (name, args = {}) => (await handleStatelessRpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, service)).result;
test('stateless edits are deterministic, isolated, chainable and reject missing snapshots', async () => {
  const a = (await call('open_setup')).structuredContent.setup, b = (await call('open_setup')).structuredContent.setup;
  assert.notEqual(a.id, b.id);
  const args = { setup: a, clientRequestId: 'add-1', components: [{ type: 'cwlaser', x: 100, y: 200, parameters: { wavelength: 532 } }, { type: 'lens', x: 220, y: 200, parameters: { f: 50 } }] };
  const added = (await call('add_components', args)).structuredContent;
  assert.deepEqual(added, (await call('add_components', args)).structuredContent);
  assert.equal(a.scene.elements.length, 0); assert.equal(b.scene.elements.length, 0);
  assert.equal(added.setup.scene.elements.length, 2); assert.ok(proposalMatches(a, added)); assert.ok(!proposalMatches(added.setup, added));
  const id = added.components.find(x => x.type === 'lens').id;
  const moved = (await call('move_components', { setup: added.setup, clientRequestId: 'move-1', components: [{ id, dx: 20, rotation: 15 }] })).structuredContent;
  assert.equal(moved.components.find(x => x.id === id).x, 240);
  const tuned = (await call('set_component_parameters', { setup: moved.setup, clientRequestId: 'params-1', components: [{ id, parameters: { f: 75 } }] })).structuredContent;
  assert.equal(tuned.components.find(x => x.id === id).parameters.f, 75);
  assert.equal((await call('get_setup', {})).isError, true);
  assert.equal((await call('get_setup', { setup: { ...a, hash: 'a'.repeat(64) } })).structuredContent.error.code, 'SNAPSHOT_MISMATCH');
});
test('fibers, supplied local history and detector tracing use native models', async () => {
  const setup = snapshot({ id: 'test-fiber', revision: 0, scene: emptyDocument().scene });
  const added = (await call('add_paths', { setup, clientRequestId: 'fiber-1', paths: [{ type: 'barefiber', points: [{ x: 300, y: 400 }, { x: 450, y: 400 }] }] })).structuredContent;
  const id = added.paths[0].id;
  const edited = (await call('update_paths', { setup: added.setup, clientRequestId: 'fiber-2', paths: [{ id, dx: 10, parameters: { inputNA: 0.18 } }] })).structuredContent;
  assert.equal(edited.paths[0].points[0].x, 310); assert.equal(edited.paths[0].parameters.inputNA, 0.18);
  const removed = (await call('remove_paths', { setup: edited.setup, clientRequestId: 'fiber-3', paths: [{ id }] })).structuredContent;
  assert.equal(removed.paths.length, 0);
  const undone = (await call('undo_setup', { setup: removed.setup, targetScene: edited.setup.scene, clientRequestId: 'fiber-undo' })).structuredContent;
  assert.deepEqual(undone.setup.scene, edited.setup.scene);
  const redone = (await call('redo_setup', { setup: undone.setup, targetScene: removed.setup.scene, clientRequestId: 'fiber-redo' })).structuredContent;
  assert.equal(redone.paths.length, 0);
  const detector = (await call('add_components', { setup, clientRequestId: 'detectors', components: [{ type: 'cwlaser', x: 100, y: 200, parameters: { wavelength: 532 } }, { type: 'detector', x: 300, y: 200 }] })).structuredContent.setup;
  const reading = (await call('inspect_setup', { setup: detector })).structuredContent;
  assert.equal(reading.detectors.length, 1); assert.ok(reading.detectors[0].reading); assert.equal(reading.hash, detector.hash);
});
test('HTTP noauth, origin/host boundaries, JSON limits and exact domain challenge', async () => {
  const app = createApplication({ origin: service.origin, challenge: 'exact-token', computeScene: service.compute });
  const request = (path, options = {}) => app(new Request(service.origin + path, options));
  assert.equal((await (await request('/mcp/health')).json()).storage, 'ephemeral-memory');
  assert.equal(await (await request('/.well-known/openai-apps-challenge')).text(), 'exact-token');
  assert.equal((await request('/mcp')).status, 405);
  assert.equal((await request('/mcp', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await request('/mcp', { method: 'POST', headers: { host: 'evil.example', 'content-type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await request('/mcp', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await request('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(950001) })).status, 413);
  const tools = await (await request('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) })).json();
  assert.equal(tools.result.tools.length, 16);
  assert.equal(tools.result.resultType, 'complete');
  assert.equal(tools.result.ttlMs, 0);
  assert.equal(tools.result.cacheScope, 'private');
  const resources = (await handleStatelessRpc({ jsonrpc: '2.0', id: 3, method: 'resources/list' }, service)).result;
  const resource = (await handleStatelessRpc({ jsonrpc: '2.0', id: 4, method: 'resources/read', params: { uri: resources.resources[0].uri } }, service)).result;
  assert.equal(resource.resultType, 'complete'); assert.equal(resource.contents[0].text, '<html></html>');
  for (const t of tools.result.tools) { assert.deepEqual(t.securitySchemes, [{ type: 'noauth' }]); assert.ok(t.outputSchema); for (const k of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) assert.equal(typeof t.annotations[k], 'boolean'); }
  assert.ok(!TOOLS.some(x => ['replace_setup', 'save_setup_screenshot'].includes(x.name)));
});
