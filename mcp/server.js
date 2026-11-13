// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { createServer } from 'node:http';
import { createServer as createSocketServer } from 'node:net';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { once } from 'node:events';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { handleStatelessRpc, VERSION } from './stateless.js';
import { buildWidget, widgetAsset, widgetResourceUri } from './widget.js';
import { compute, canRenderScreenshots } from './compute.js';
import { createSceneMirror } from './mirror.js';
import { SceneError } from './errors.js';
import { createLiveRelay } from './relay.js';
import { serveStdio } from './stdio.js';
const MAX_BODY = 950000;
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'];
// Names a build of this service on a call to /mcp: the one the caller expects, and the one that answered.
const BUILD_HEADER = 'x-opticalsetup-build';
// Claude serves a view from a sandbox origin named by a hash of the connector URL.
const CLAUDE_SANDBOX = /^https:\/\/[a-f0-9]{16,64}\.claudemcpcontent\.com$/;
export function createApplication({ origin, challenge = '', computeScene = compute, revision = 'local', build = '', screenshots = true, mirrorOptions }) {
  const originUrl = new URL(origin);
  const widgetOrigin = 'https://' + originUrl.hostname.replaceAll('.', '-') + '.web-sandbox.oaiusercontent.com';
  // A local service answers to every loopback name of its own port; a hosted one only to its public host.
  const local = LOOPBACK.includes(originUrl.hostname);
  const hosts = local ? LOOPBACK.map(name => name + (originUrl.port ? ':' + originUrl.port : '')) : [originUrl.host];
  const origins = local ? hosts.map(name => originUrl.protocol + '//' + name) : [origin];
  if (originUrl.origin !== origin || originUrl.username || originUrl.password) throw new Error('Use an origin without a path or credentials');
  const relay = createLiveRelay();
  const mirror = createSceneMirror({ ...mirrorOptions, relay });
  const widget = buildWidget(origin);
  // One answer to a JSON-RPC message, whichever transport brought it. An edit computed here reaches the open view either way.
  const rpc = async body => handleStatelessRpc(body, { html: await widget, origin, compute: computeScene, screenshots, mirror, deliver: (channel, data) => relay.publish(channel, data) });
  let draining = false;
  const application = async request => {
    if (draining) return json({ error: 'Service restarting; reconnect the workbench' }, 503);
    const url = new URL(request.url), host = request.headers.get('host'), requestOrigin = request.headers.get('origin');
    if (host && !hosts.includes(host)) return json({ error: 'Forbidden host' }, 403);
    if (['/mcp/events', '/mcp/sync'].includes(url.pathname)) {
      if (requestOrigin && ![...origins, widgetOrigin].includes(requestOrigin) && !CLAUDE_SANDBOX.test(requestOrigin)) return json({ error: 'Forbidden origin' }, 403);
      const cors = requestOrigin ? { 'access-control-allow-origin': requestOrigin, vary: 'Origin' } : {};
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' } });
      if (request.method !== 'POST') return json({ error: 'POST required' }, 405, cors);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415, cors);
      if (url.pathname === '/mcp/sync') {
        try {
          const bytes = await request.arrayBuffer();
          if (bytes.byteLength > MAX_BODY) return json({ error: 'Request too large', message: 'it is larger than the live workbench takes' }, 413, cors);
          return json(mirror.sync(JSON.parse(new TextDecoder().decode(bytes))), 200, cors);
        } catch (error) {
          const code = error instanceof SceneError ? error.code : 'INVALID_SYNC';
          const status = ['REVISION_CONFLICT', 'RESYNC_REQUIRED'].includes(code) ? 409 : ['WORKSPACE_UNAVAILABLE', 'BUSY'].includes(code) ? 503 : 400;
          // The reason a scene was refused is the editor's own, and the view shows it to the user.
          return json({ error: code, ...(error instanceof SceneError && { message: error.message }) }, status, cors);
        }
      }
      try {
        const text = await request.text(); if (text.length > 200) return json({ error: 'Invalid channel' }, 400, cors);
        const { channel } = JSON.parse(text);
        return new Response(relay.subscribe(channel, request.signal), { headers: { ...cors, 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
      } catch { return json({ error: 'Live connection unavailable' }, 400, cors); }
    }
    if (['GET', 'HEAD'].includes(request.method) && url.pathname.startsWith('/mcp/assets/')) {
      try { return await widgetAsset(decodeURIComponent(url.pathname)); }
      catch (error) {
        if (error instanceof URIError) return new Response('Invalid asset path', { status: 400 });
        throw error;
      }
    }
    if (requestOrigin && !origins.includes(requestOrigin)) return json({ error: 'Forbidden origin' }, 403);
    if (['GET', 'DELETE'].includes(request.method) && url.pathname === '/mcp') return json({ error: 'POST required' }, 405, { allow: 'POST' });
    if (request.method === 'GET' || request.method === 'HEAD') {
      if (url.pathname === '/mcp/health') return json({ ok: true, service: 'OpticalSetup', version: VERSION, revision, build, storage: 'temporary-memory', authentication: 'none', screenshots });
      if (url.pathname === '/.well-known/openai-apps-challenge') return challenge ? new Response(challenge, { headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } }) : new Response('Challenge not configured', { status: 404 });
      if (url.pathname === '/mcp/workbench') return new Response(await widget, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      return new Response('Not found', { status: 404 });
    }
    if (request.method !== 'POST' || url.pathname !== '/mcp') return new Response('Not found', { status: 404 });
    // Every answer on /mcp names the build that gave it. A caller that names the build it expects is
    // answered by that build only: another one refuses the message before reading it.
    const named = build ? { [BUILD_HEADER]: build } : {}, expected = request.headers.get(BUILD_HEADER);
    if (expected !== null && expected !== build) return json({ error: 'Another build of OpticalSetup answers here' }, 409, named);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415, named);
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_BODY) return json({ error: 'Request too large' }, 413, named);
    let body;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400, named); }
    const response = await rpc(body);
    return response === null ? new Response(null, { status: 202, headers: named }) : json(response, 200, named);
  };
  application.close = () => { draining = true; mirror.close(); relay.close(); };
  application.rpc = rpc;
  return application;
}
export async function listen(application, { host = '127.0.0.1', port = 5188 } = {}) {
  const server = createServer(async (incoming, outgoing) => {
    const abort = new AbortController(); outgoing.once('close', () => abort.abort());
    try {
      const chunks = []; let size = 0;
      for await (const chunk of incoming) { size += chunk.length; if (size > MAX_BODY) { outgoing.writeHead(413); outgoing.end('Request too large'); return; } chunks.push(chunk); }
      const headers = new Headers();
      for (const [k, v] of Object.entries(incoming.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(',') : v);
      const response = await application(new Request('http://127.0.0.1' + incoming.url, { method: incoming.method, headers, signal: abort.signal, ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: Buffer.concat(chunks) }) }));
      if (process.env.MCP_DIAGNOSTICS === '1' && incoming.url === '/mcp') {
        const known = ['initialize', 'server/discover', 'notifications/initialized', 'tools/list', 'resources/list', 'resources/templates/list', 'resources/read', 'ping'];
        let rpc = 'other', currentResource = true;
        try { const input = JSON.parse(Buffer.concat(chunks).toString()); if (known.includes(input.method)) rpc = input.method; if (rpc === 'resources/read') currentResource = input.params?.uri === widgetResourceUri; } catch { rpc = 'invalid-json'; }
        // Opt-in protocol diagnostics deliberately exclude arguments, URLs, IPs and header values.
        console.log(JSON.stringify({ transport: incoming.method, rpc, status: response.status, originPresent: headers.has('origin'), currentResource }));
      }
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (['application/x-ndjson', 'text/event-stream'].includes(response.headers.get('content-type'))) {
        outgoing.flushHeaders();
        for await (const chunk of response.body) {
          if (abort.signal.aborted) break;
          if (!outgoing.write(chunk)) await once(outgoing, 'drain', { signal: abort.signal });
        }
        outgoing.end();
      } else outgoing.end(incoming.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
    } catch { if (!outgoing.headersSent && !outgoing.destroyed) outgoing.writeHead(500); if (!outgoing.destroyed) outgoing.end('Setup processing failed'); }
  });
  server.requestTimeout = 20000; server.headersTimeout = 10000;
  await new Promise((res, rej) => { server.once('error', rej); server.listen(port, host, res); }); return server;
}
// A loopback port that is free now, for a copy of this service that may not have the usual one.
export function freePort() {
  return new Promise((found, failed) => {
    const socket = createSocketServer();
    socket.once('error', failed);
    socket.listen(0, '127.0.0.1', () => { const { port } = socket.address(); socket.close(() => found(port)); });
  });
}
// What this copy of the service is made of: a digest of the service's own files and of the editor it
// runs and hands to the view. Two copies with the same digest behave alike; the version number alone
// does not say so, since it stays the same from one checkout to the next.
export async function buildIdentity(root = fileURLToPath(new URL('../', import.meta.url))) {
  const files = [];
  const walk = async (folder, deep) => {
    for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
      const path = folder + '/' + entry.name;
      if (entry.isDirectory()) { if (deep) await walk(path, deep); }
      else if (/\.(?:js|css|html)$/.test(entry.name)) files.push(path);
    }
  };
  await walk('mcp', false); await walk('mcp/web', false); await walk('sketch', true);
  const digest = createHash('sha256');
  for (const path of files.sort()) digest.update(path + '\0').update(await readFile(join(root, path))).update('\0');
  return digest.digest('hex').slice(0, 32);
}
// Whether the service at a loopback origin is a copy of this one: the same service, version and build.
export async function sameService(origin, build) {
  try {
    const health = await (await fetch(origin + '/mcp/health', { signal: AbortSignal.timeout(1500) })).json();
    return health.ok === true && health.service === 'OpticalSetup' && health.version === VERSION && Boolean(build) && health.build === build;
  } catch { return false; }
}
// One JSON-RPC message answered by the copy of that build at that origin. The message names the
// build, so another build of this service refuses it unread, and an answer counts only if it names
// the same build. It throws when the answer is not that copy's.
export function forwardRpc(origin, build) {
  if (!build) throw new Error('A build is needed to pass messages on');
  return async body => {
    const response = await fetch(origin + '/mcp', { method: 'POST', headers: { 'content-type': 'application/json', [BUILD_HEADER]: build }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    if (response.headers.get(BUILD_HEADER) !== build) throw new Error('Not an answer of this build');
    if (response.status === 202) return null;
    const answer = await response.json();
    if (Array.isArray(answer) ? !answer.length : answer?.jsonrpc !== '2.0') throw new Error('Not an MCP answer');
    return answer;
  };
}
// The messages of a copy that relies on another copy on this machine. `forward` sends one to that
// copy and throws unless the answer is that build's, and `same` says whether the service at that
// address is still a copy of this build. What is promised is the build, not the process: a copy of
// the same build that took the address is used as the first was. After a message that was not
// answered by this build, `same` decides: still this build, and that one call is reported as lost;
// otherwise nothing more is sent, and every request is answered with the reason until the client
// starts the service again. This copy never takes the other one's place.
export function relyOn({ forward, same }) {
  let gone = false;
  const answer = (body, message) => (body && typeof body === 'object' && !Array.isArray(body) && body.id === undefined ? null
    : { jsonrpc: '2.0', id: body?.id ?? null, error: { code: -32603, message } });
  return async body => {
    if (!gone) {
      try { return await forward(body); } catch { /* decided below */ }
      if (await same()) return answer(body, 'The OpticalSetup service did not answer this call. It may still have been carried out: read the setup before repeating it.');
      gone = true;
    }
    return answer(body, 'The OpticalSetup service this one relied on is no longer running. Restart the client that started OpticalSetup, then open the workbench again.');
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // With --stdio a client starts this service itself and speaks MCP over its standard streams.
  // The view still needs its files and its live channel, so the loopback listener runs as well.
  const stdio = process.argv.includes('--stdio');
  // Standard output then carries MCP messages and nothing else: everything that would be printed goes to standard error.
  if (stdio) for (const level of ['log', 'info', 'debug']) console[level] = console.error;
  const screenshots = await canRenderScreenshots(), build = await buildIdentity();
  const start = async port => {
    const origin = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`;
    if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://')) throw new Error('Production requires an HTTPS origin');
    const application = createApplication({ origin, challenge: process.env.OPENAI_APPS_CHALLENGE, revision: process.env.DEPLOY_REVISION || 'local', build, screenshots });
    const server = await listen(application, { port });
    console.log(`OpticalSetup MCP ${stdio ? 'on standard input and output, view files' : 'listening'} at ${origin}/mcp; no scene database; PNG tool ${screenshots ? 'available' : 'not offered (needs Linux tmpfs and FFmpeg)'}`);
    return { origin, application, server };
  };
  const asked = Number(process.env.PORT || 5188);
  // A client can start the service more than once (Claude Desktop does, for one chat), and a view
  // opened through one copy must be the view the other copy's tool calls reach. So only the first
  // copy on a machine keeps workbenches; a later copy of the same build passes every message to it.
  let running, shared;
  try { running = await start(asked || await freePort()); }
  catch (error) {
    if (!stdio || process.env.PUBLIC_ORIGIN || error.code !== 'EADDRINUSE') throw error;
    const holder = `http://127.0.0.1:${asked}`;
    if (await sameService(holder, build)) {
      shared = relyOn({ forward: forwardRpc(holder, build), same: () => sameService(holder, build) });
      console.log(`OpticalSetup MCP on standard input and output, passing its calls to the copy already running at ${holder}/mcp`);
    }
    // Something else holds the port, or a copy of this service from another build, which may not behave
    // as this one does. A port that was asked for by name is not replaced; the usual one is.
    else if (process.env.PORT) throw error;
    else {
      console.log(`Port ${asked} is held by another program or by another build of OpticalSetup: this copy runs apart from it, and a view opened through one is not reached through the other.`);
      running = await start(await freePort());
    }
  }
  const close = () => { running?.application.close(); running?.server.close(); };
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    close(); if (!running) process.exit(0);
    running.server.once('close', () => process.exit(0));
    setTimeout(() => { running.server.closeAllConnections(); process.exit(0); }, 5000).unref();
  });
  // The client ends a stdio service by closing its input. By then every answer has been written out;
  // the listener and its connections are closed and the process ends by itself, which cannot cut
  // anything short. The timer is only for a handle that would otherwise keep it alive.
  if (stdio) serveStdio(running ? running.application.rpc : shared).then(() => {
    close(); running?.server.closeAllConnections();
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
