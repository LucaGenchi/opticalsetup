// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// MCP over standard input and output, for a client that starts this service
// itself (Claude Desktop, Claude Code): one JSON-RPC message per line each way.
// The output carries messages and nothing else. A request gets exactly one line
// back, whatever happens to it; a notification gets none.
import { createInterface } from 'node:readline';
export function serveStdio(rpc, { input = process.stdin, output = process.stdout, maxLine = 950000 } = {}) {
  const lines = createInterface({ input, crlfDelay: Infinity });
  const pending = new Set();
  const send = message => output.write(JSON.stringify(message) + '\n');
  const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
  lines.on('line', line => {
    if (!line.trim()) return;
    if (line.length > maxLine) return fail(null, -32600, 'Request too large');
    let body;
    try { body = JSON.parse(line); } catch { return fail(null, -32700, 'Parse error'); }
    const message = body && typeof body === 'object' && !Array.isArray(body);
    // An answer to a request: this service sends none, so there is nothing for it to answer.
    if (message && body.method === undefined && ('result' in body || 'error' in body)) return;
    const notification = message && typeof body.method === 'string' && body.id === undefined;
    const task = Promise.resolve().then(() => rpc(body)).then(
      response => { if (response && !notification) send(response); },
      () => { if (!notification) fail(message ? body.id ?? null : null, -32603, 'Internal error'); },
    ).finally(() => pending.delete(task));
    pending.add(task);
  });
  // The client ends the conversation by closing the input; what is still being answered is answered first.
  return new Promise(resolve => lines.once('close', () => Promise.allSettled([...pending]).then(() => resolve())));
}
