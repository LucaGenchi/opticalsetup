// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The service as a client starts it: MCP over standard input and output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { serveStdio } from '../../mcp/stdio.js';
import { createApplication } from '../../mcp/server.js';

const SERVER = fileURLToPath(new URL('../../mcp/server.js', import.meta.url));
const line = message => JSON.stringify(message) + '\n';

test('one line in, at most one line out: a request is answered, a notification and an answer are not', async () => {
  const application = createApplication({ origin: 'http://127.0.0.1:5188', screenshots: false });
  const input = new PassThrough(), output = new PassThrough();
  const written = []; output.on('data', chunk => written.push(chunk.toString()));
  const served = serveStdio(application.rpc, { input, output, maxLine: 2000 });
  input.write(line({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }));
  input.write(line({ jsonrpc: '2.0', method: 'notifications/initialized' }));
  input.write(line({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 1 } }));
  input.write(line({ jsonrpc: '2.0', method: 'tools/list' }));                       // a request sent without an id is a notification
  input.write(line({ jsonrpc: '2.0', id: 9, result: {} }));                           // an answer: this service asked nothing
  input.write('\n   \n');
  input.write('this is not JSON\n');
  input.write(line({ id: 2 }));                                                       // not a request at all
  input.write(line([{ jsonrpc: '2.0', id: 3, method: 'ping' }]));                     // batches are not taken
  input.write(line({ jsonrpc: '2.0', id: 4, method: 'no/such/method' }));
  input.write(line({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'open_setup', arguments: {} } }));
  input.write(line({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_setup', arguments: { note: 'x'.repeat(3000) } } }));
  input.end();
  await served;
  const text = written.join('');
  assert.ok(text.endsWith('\n'));
  const messages = text.trimEnd().split('\n').map(JSON.parse);
  for (const message of messages) assert.equal(message.jsonrpc, '2.0');
  const byId = id => messages.filter(message => message.id === id);
  assert.equal(byId(1)[0].result.protocolVersion, '2025-06-18');
  assert.equal(byId(4)[0].error.code, -32601);
  assert.equal(byId(5)[0].result.structuredContent.setup.revision, 0);
  assert.equal(byId(2)[0].error.code, -32600);
  assert.equal(byId(9).length, 0);
  // Without an id there is nothing to answer to: the parse error, the batch and the oversized line.
  assert.deepEqual(byId(null).map(message => message.error.code).sort(), [-32600, -32600, -32700]);
  assert.equal(messages.length, 7, 'the notifications, the answer and the blank lines produced no line');
  application.close();
});

test('a request that throws is still answered once, and what is being answered is finished before the end', async () => {
  const input = new PassThrough(), output = new PassThrough();
  const written = []; output.on('data', chunk => written.push(chunk.toString()));
  let release; const held = new Promise(resolve => { release = resolve; });
  const served = serveStdio(async body => {
    if (body.method === 'boom') throw new Error('private detail');
    if (body.method === 'slow') { await held; return { jsonrpc: '2.0', id: body.id, result: { done: true } }; }
    return null;
  }, { input, output });
  input.write(line({ jsonrpc: '2.0', id: 'a', method: 'boom' }));
  input.write(line({ jsonrpc: '2.0', method: 'boom' }));
  input.write(line({ jsonrpc: '2.0', id: 'b', method: 'slow' }));
  input.end();
  let ended = false; served.then(() => { ended = true; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(ended, false, 'the input is closed but one request is still being answered');
  release(); await served;
  const messages = written.join('').trimEnd().split('\n').map(JSON.parse);
  assert.deepEqual(messages.find(message => message.id === 'a').error, { code: -32603, message: 'Internal error' });
  assert.deepEqual(messages.find(message => message.id === 'b').result, { done: true });
  assert.equal(messages.length, 2);
  assert.doesNotMatch(written.join(''), /private detail/);
});

// The whole service, started the way Claude Desktop starts it.
function start(env = {}) {
  const child = spawn(process.execPath, [SERVER, '--stdio'], { env: { PATH: process.env.PATH, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = [], waiting = new Map(); let buffer = '', errors = '', nextId = 1;
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const text = buffer.slice(0, newline); buffer = buffer.slice(newline + 1); lines.push(text);
      try { const message = JSON.parse(text); waiting.get(message.id)?.(message); waiting.delete(message.id); } catch { /* reported by the test */ }
    }
  });
  child.stderr.on('data', chunk => { errors += chunk; });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++, timer = setTimeout(() => reject(new Error(`${method} was not answered. stderr: ${errors}`)), 15000);
    waiting.set(id, message => { clearTimeout(timer); resolve(message); });
    child.stdin.write(line({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }));
  });
  const end = async () => {
    child.stdin.end();
    const timer = setTimeout(() => child.kill('SIGKILL'), 8000);
    const [code] = await once(child, 'exit'); clearTimeout(timer);
    return code;
  };
  return { child, lines, request, end, errors: () => errors, notify: method => child.stdin.write(line({ jsonrpc: '2.0', method })) };
}
const viewOrigin = async service => {
  const html = (await service.request('resources/read', { uri: 'ui://opticalsetup/workbench.html' })).result.contents[0].text;
  return /<script type="module" src="(http:\/\/127\.0\.0\.1:\d+)\/mcp\/assets\/mcp\/web\/entry\.js">/.exec(html)?.[1];
};

test('started with --stdio the service speaks MCP on its standard streams, serves the view its files, and leaves when its input closes', async () => {
  const service = start({ MCP_DIAGNOSTICS: '1' });
  try {
    const initialized = await service.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'claude-ai', version: '1' } });
    assert.equal(initialized.result.serverInfo.name, 'OpticalSetup');
    service.notify('notifications/initialized');
    const origin = await viewOrigin(service);
    assert.ok(origin, 'the view is told where its files are');
    const health = await (await fetch(origin + '/mcp/health')).json();
    assert.equal(health.ok, true);
    const tools = (await service.request('tools/list')).result.tools.map(tool => tool.name);
    assert.ok(tools.includes('open_setup'));
    assert.equal(tools.includes('get_setup_screenshot'), health.screenshots);
    // The view has no page of its own to load from: its files and its live channel come from the loopback listener.
    const entry = await fetch(origin + '/mcp/assets/mcp/web/entry.js');
    assert.equal(entry.status, 200); assert.match(entry.headers.get('content-type'), /javascript/);
    const meta = (await service.request('resources/read', { uri: 'ui://opticalsetup/workbench.html' })).result.contents[0]._meta;
    assert.equal(meta.ui.domain, undefined, 'a local connector has no sandbox origin to declare');
    assert.deepEqual(meta.ui.csp, { connectDomains: [origin], resourceDomains: [origin] });
    const opened = (await service.request('tools/call', { name: 'open_setup', arguments: {} })).result.structuredContent.setup;
    const edited = (await service.request('tools/call', { name: 'add_components', arguments: { setup: opened, clientRequestId: 'stdio-1', components: [{ type: 'lens', x: 0, y: 0 }] } })).result;
    assert.equal(edited.structuredContent.setup.scene.elements.length, 1);
    // The same service still answers over HTTP, and what it logs about that goes to standard error.
    const overHttp = await (await fetch(origin + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: line({ jsonrpc: '2.0', id: 1, method: 'ping' }) })).json();
    assert.deepEqual(overHttp.result, {});
    assert.equal(await service.end(), 0);
    assert.match(service.errors(), /"rpc":"ping"/, 'the diagnostics were written');
    assert.match(service.errors(), /on standard input and output/);
    for (const text of service.lines) {
      const message = JSON.parse(text);
      assert.equal(message.jsonrpc, '2.0'); assert.ok(Number.isInteger(message.id), 'only answers to the requests sent: ' + text.slice(0, 80));
    }
    assert.equal(service.lines.length, 6);
  } finally { service.child.kill('SIGKILL'); }
});

test('a second copy takes another port instead of failing to start', async () => {
  const first = start();
  let second;
  try {
    const firstOrigin = await viewOrigin(first);
    second = start();
    const secondOrigin = await viewOrigin(second);
    assert.ok(firstOrigin && secondOrigin);
    assert.notEqual(firstOrigin, secondOrigin);
    for (const origin of [firstOrigin, secondOrigin]) assert.equal((await fetch(origin + '/mcp/health')).status, 200);
    assert.deepEqual([await first.end(), await second.end()], [0, 0]);
  } finally { first.child.kill('SIGKILL'); second?.child.kill('SIGKILL'); }
});
