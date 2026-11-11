// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Only live response sinks live here. No scene, history, pending edit or replay buffer.
export function createLiveRelay({ maxConnections = 40, lifetimeMs = 120000, heartbeatMs = 20000 } = {}) {
  const sinks = new Map();
  const closers = new Set();
  const valid = token => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);
  return {
    get connections() { return [...sinks.values()].reduce((n, set) => n + set.size, 0); },
    connected(token) { return Boolean(sinks.get(token)?.size); },
    close() { for (const close of [...closers]) close(); },
    subscribe(token, signal) {
      if (!valid(token)) throw new Error('Invalid channel');
      if (this.connections >= maxConnections || (sinks.get(token)?.size || 0) >= 4) throw new Error('Too many live connections');
      let close;
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          const write = data => {
            // Drop a slow connection rather than retaining edit payloads for it.
            if ((controller.desiredSize ?? 0) < 0) { close(); return; }
            controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
          };
          const clients = sinks.get(token) || new Set(); sinks.set(token, clients); clients.add(write);
          let closed = false;
          close = () => {
            if (closed) return; closed = true;
            clearTimeout(expiry); clearInterval(heartbeat); signal?.removeEventListener('abort', close);
            closers.delete(close);
            clients.delete(write); if (!clients.size) sinks.delete(token);
            try { controller.close(); } catch { /* already cancelled */ }
          };
          const expiry = setTimeout(close, lifetimeMs), heartbeat = setInterval(() => write({ ping: true }), heartbeatMs);
          closers.add(close);
          signal?.addEventListener('abort', close, { once: true });
          write({ connected: true });
          if (signal?.aborted) close();
        },
        cancel() { close?.(); },
      });
      return stream;
    },
    publish(token, data) {
      if (!valid(token)) return 'not_requested';
      const clients = sinks.get(token);
      if (!clients?.size) return 'offline';
      for (const write of [...clients]) write(data);
      return clients.size ? 'sent' : 'offline';
    },
  };
}
