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
  // A line counts as sent when the output has taken it, not when it was handed over: a client
  // that reads slowly leaves answers waiting here, and ending before they are out would cut them.
  const send = message => new Promise(written => output.write(JSON.stringify(message) + '\n', () => written()));
  const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
  const track = work => { pending.add(work); work.finally(() => pending.delete(work)); };
  // A client that has gone away makes writing fail. There is no one left to tell, and the input closes next.
  output.on('error', () => {});
  lines.on('line', line => {
    if (!line.trim()) return;
    if (line.length > maxLine) return track(fail(null, -32600, 'Request too large'));
    let body;
    try { body = JSON.parse(line); } catch { return track(fail(null, -32700, 'Parse error')); }
    const message = body && typeof body === 'object' && !Array.isArray(body);
    // An answer to a request: this service sends none, so there is nothing for it to answer.
    if (message && body.method === undefined && ('result' in body || 'error' in body)) return;
    const notification = message && typeof body.method === 'string' && body.id === undefined;
    track(Promise.resolve().then(() => rpc(body)).then(
      response => (response && !notification ? send(response) : undefined),
      () => (notification ? undefined : fail(message ? body.id ?? null : null, -32603, 'Internal error')),
    ));
  });
  // The client ends the conversation by closing the input. Every request that came in is answered,
  // and every answer written out, before this resolves.
  return new Promise(resolve => lines.once('close', async () => {
    while (pending.size) await Promise.allSettled([...pending]);
    resolve();
  }));
}
