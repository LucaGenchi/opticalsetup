// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveRelay } from '../../mcp/relay.js';
import { createApplication } from '../../mcp/server.js';
const token = 'b'.repeat(64);
const decode = value => JSON.parse(new TextDecoder().decode(value));
test('live relay isolates channels, closes on disconnect and has no replay', async () => {
  const relay = createLiveRelay(), abort = new AbortController();
  const reader = relay.subscribe(token, abort.signal).getReader();
  try {
    assert.deepEqual(decode((await reader.read()).value), { connected: true });
    assert.equal(relay.publish('c'.repeat(64), { setup: { scene: 'private' } }), 'offline');
    assert.equal(relay.publish(token, { action: 'add_components' }), 'sent');
    assert.deepEqual(decode((await reader.read()).value), { action: 'add_components' });
    abort.abort(); assert.equal(relay.connections, 0);
    assert.equal((await reader.read()).done, true);
    assert.equal(relay.publish(token, { action: 'missed' }), 'offline');
    const next = relay.subscribe(token).getReader();
    assert.deepEqual(decode((await next.read()).value), { connected: true });
    relay.close(); assert.equal(relay.connections, 0);
    assert.equal((await next.read()).done, true);
  } finally { await reader.cancel(); }
});
test('only the exact widget origin can subscribe; matching stateless edits arrive live', async () => {
  const origin = 'https://mcp.example.com', widget = 'https://mcp-example-com.web-sandbox.oaiusercontent.com';
  const app = createApplication({ origin });
  const req = (path, options) => app(new Request(origin + path, options));
  const options = { method: 'POST', headers: { origin: widget, 'content-type': 'application/json' }, body: JSON.stringify({ channel: token }) };
  assert.equal((await req('/mcp/events', { ...options, headers: { ...options.headers, origin: 'https://evil.example' } })).status, 403);
  const response = await req('/mcp/events', options), reader = response.body.getReader();
  try {
    assert.equal(response.headers.get('access-control-allow-origin'), widget);
    assert.deepEqual(decode((await reader.read()).value), { connected: true });
    const rpc = async (name, args) => (await (await req('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) })).json()).result;
    const setup = { ...(await rpc('open_setup', {})).structuredContent.setup, channel: token };
    const result = await rpc('add_components', { setup, clientRequestId: 'relay-test', components: [{ type: 'lens', x: 200, y: 200 }] });
    assert.equal(result.structuredContent.delivery, 'sent');
    const delivered = decode((await reader.read()).value);
    assert.equal(delivered.setup.channel, token); assert.equal(delivered.setup.scene.elements.length, 1); assert.equal(delivered.baseHash, setup.hash);
  } finally { await reader.cancel(); }
});
