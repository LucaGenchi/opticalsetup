// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { diffScene } from './scene-patch.js';

const url = route => new URL('../../../' + route, import.meta.url);
const post = body => ({
  method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
  headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body),
});
// The service takes a request of up to 950,000 bytes. A sync that would be larger is not sent.
export const MAX_SYNC = 900000;
const size = text => new TextEncoder().encode(text).length;
// An answer that is not JSON (a listener or a proxy that refused the request) still has a status.
const read = async response => { try { return await response.json(); } catch { return {}; } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sameVersion = (a, b) => a?.revision === b?.revision && a?.hash === b?.hash;

export async function followEvents(channel, receive) {
  const response = await fetch(url('events'), post({ channel }));
  if (!response.ok || !response.body) throw new Error('Live chat delivery unavailable');
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 1000000) throw new Error('Live response too large');
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        await receive(JSON.parse(line));
      }
    }
  } finally { await reader.cancel(); }
}

export function createLiveWorkspace({ current, receive, changed, ticket }) {
  // A new editor mount owns its channel. Other tabs may share browser storage,
  // while their relay credentials and temporary server mirrors stay independent.
  const channel = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  let connected = false, sending = false, confirmed, workspaceRef, refused, latest, retryTimer, connectionGeneration = 0, ceiling = MAX_SYNC;
  const acknowledgements = [];
  async function flush() {
    if (sending || !connected || (!latest && !acknowledgements.length)) return;
    sending = true;
    const generation = connectionGeneration;
    const ack = acknowledgements[0];
    const state = ack?.state || latest;
    const { id, revision, hash, scene, canUndo, canRedo } = state;
    const base = confirmed;
    const payload = ack?.rejected ? { channel, rejected: true, deliveryId: ack.id, ...(ack.busy && { busy: true }) } : {
      channel, ...(ticket && { ticket }), id, revision, hash, canUndo, canRedo, ...(ack && { deliveryId: ack.id }),
    };
    // A scene whose sync would not fit in a request is not sent. The view says so in its place, in
    // a few bytes, so that the service stops answering for the scene it took before.
    const notice = JSON.stringify({ channel, ...(ticket && { ticket }), id, revision, hash, canUndo, canRedo, oversized: true });
    const sync = async body => {
      const text = JSON.stringify(body), bytes = size(text);
      let response = await fetch(url('sync'), post(body.rejected || bytes <= ceiling ? text : notice));
      // Something on the way may take less than the service does. What it refuses as too large is
      // reported the same way, and nothing of that size is sent again.
      if (response.status === 413 && !body.rejected) {
        ceiling = Math.min(ceiling, bytes - 1);
        response = await fetch(url('sync'), post(notice));
      }
      return [response, await read(response)];
    };
    let retry = false;
    try {
      if (!ack?.rejected) {
        if (!base) payload.scene = scene;
        else if (!sameVersion(base, state)) {
          payload.baseRevision = base.revision; payload.baseHash = base.hash;
          payload.patch = diffScene(base.scene, scene);
          // For bulk replacements, the complete scene can be smaller than a delta.
          if (JSON.stringify(payload.patch).length > JSON.stringify(scene).length) {
            delete payload.patch; payload.scene = scene;
          }
        }
      }
      let [response, result] = await sync(payload);
      if (result.error === 'RESYNC_REQUIRED' && !ack?.rejected) {
        delete payload.patch;
        [response, result] = await sync({ ...payload, scene });
      }
      if (generation !== connectionGeneration) return;
      if (response.status >= 500) throw new Error('Sync unavailable');
      if (response.ok && !ack?.rejected) { confirmed = state; workspaceRef = result.workspaceRef; refused = undefined; }
      // A scene the service does not take (too large for it, or one the editor holds but cannot load)
      // is set aside until it changes or the next heartbeat offers it again. The reason is kept, so
      // the view can say why the chat does not follow.
      else if (!ack?.rejected && [400, 413].includes(response.status)) refused = result.message || 'the service could not read it';
      if (ack) acknowledgements.shift();
      if (!ack?.rejected && latest && sameVersion(latest, state)) latest = undefined;
    } catch { retry = true; }
    finally {
      sending = false;
      changed(connected);
      if (retry) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(flush, 1000);
      } else if (latest || acknowledgements.length) void flush();
    }
  }
  return {
    // The reference names this view for as long as it is open, so it is kept through a reconnection
    // and while a change is on its way to the service.
    get reference() { return workspaceRef; },
    get connected() { return connected; },
    get synced() { return connected && sameVersion(confirmed, current()); },
    get problem() { return refused; },
    update(deliveryId, rejected = false, busy = false) {
      latest = current();
      if (deliveryId) acknowledgements.push({ id: deliveryId, rejected, busy, state: latest });
      changed(connected);
      void flush();
    },
    async connect() {
      // The service ends every stream at its time limit, and edits cannot reach the view until the
      // next one is open: a stream that was working is reopened after a quarter of a second. One
      // that could not be opened is retried ever more slowly.
      let delay = 250;
      while (true) {
        try {
          await followEvents(channel, async event => {
            if (event.connected || event.ping) {
              connected = true;
              delay = 250;
              this.update();
            } else if (event.deliveryId) await receive(event);
          });
        } catch { /* transient connection failure */ }
        connected = false;
        connectionGeneration++;
        changed(false);
        await pause(delay);
        delay = Math.min(delay * 4, 30000);
      }
    },
  };
}
