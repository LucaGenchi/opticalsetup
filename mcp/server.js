// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { handleStatelessRpc, VERSION } from './stateless.js';
import { buildWidget, widgetAsset, widgetResourceUri } from './widget.js';
import { compute, canRenderScreenshots } from './compute.js';
import { createLiveRelay } from './relay.js';
const MAX_BODY = 950000;
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'];
// Claude serves a view from a sandbox origin named by a hash of the connector URL.
const CLAUDE_SANDBOX = /^https:\/\/[a-f0-9]{16,64}\.claudemcpcontent\.com$/;
export function createApplication({ origin, challenge = '', computeScene = compute, revision = 'local', screenshots = true }) {
  const originUrl = new URL(origin);
  const relay = createLiveRelay();
  const widgetOrigin = 'https://' + originUrl.hostname.replaceAll('.', '-') + '.web-sandbox.oaiusercontent.com';
  // A local service answers to every loopback name of its own port; a hosted one only to its public host.
  const local = LOOPBACK.includes(originUrl.hostname);
  const hosts = local ? LOOPBACK.map(name => name + (originUrl.port ? ':' + originUrl.port : '')) : [originUrl.host];
  const origins = local ? hosts.map(name => originUrl.protocol + '//' + name) : [origin];
  if (originUrl.origin !== origin || originUrl.username || originUrl.password) throw new Error('Use an origin without a path or credentials');
  const widget = buildWidget(origin);
  let draining = false;
  const application = async request => {
    if (draining) return json({ error: 'Service restarting; retry with your current browser snapshot' }, 503);
    const url = new URL(request.url), host = request.headers.get('host'), requestOrigin = request.headers.get('origin');
    if (host && !hosts.includes(host)) return json({ error: 'Forbidden host' }, 403);
    if (url.pathname === '/mcp/events') {
      if (requestOrigin && ![...origins, widgetOrigin].includes(requestOrigin) && !CLAUDE_SANDBOX.test(requestOrigin)) return json({ error: 'Forbidden origin' }, 403);
      const cors = requestOrigin ? { 'access-control-allow-origin': requestOrigin, vary: 'Origin' } : {};
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' } });
      if (request.method !== 'POST') return json({ error: 'POST required' }, 405, cors);
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
      if (url.pathname === '/mcp/health') return json({ ok: true, service: 'OpticalSetup', version: VERSION, revision, storage: 'none', authentication: 'none', screenshots });
      if (url.pathname === '/.well-known/openai-apps-challenge') return challenge ? new Response(challenge, { headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } }) : new Response('Challenge not configured', { status: 404 });
      if (url.pathname === '/mcp/workbench') return new Response(await widget, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      return new Response('Not found', { status: 404 });
    }
    if (request.method !== 'POST' || url.pathname !== '/mcp') return new Response('Not found', { status: 404 });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON required' }, 415);
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_BODY) return json({ error: 'Request too large' }, 413);
    let body;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
    const response = await handleStatelessRpc(body, { html: await widget, origin, compute: computeScene, screenshots, deliver: (channel, data) => relay.publish(channel, data) });
    return response === null ? new Response(null, { status: 202 }) : json(response);
  };
  application.close = () => { draining = true; relay.close(); };
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
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 5188), origin = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`;
  if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://')) throw new Error('Production requires an HTTPS origin');
  const screenshots = await canRenderScreenshots();
  const application = createApplication({ origin, challenge: process.env.OPENAI_APPS_CHALLENGE, revision: process.env.DEPLOY_REVISION || 'local', screenshots });
  const server = await listen(application, { port });
  console.log(`OpticalSetup stateless MCP listening at ${origin}/mcp; no scene database; PNG tool ${screenshots ? 'available' : 'not offered (needs Linux tmpfs and FFmpeg)'}`);
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    application.close(); server.close(() => process.exit(0));
    setTimeout(() => { server.closeAllConnections(); process.exit(0); }, 5000).unref();
  });
}
