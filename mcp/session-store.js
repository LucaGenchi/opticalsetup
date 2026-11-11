// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Ephemeral, capability-addressed mirrors. The browser is the authority: a
// proposed edit is not committed until the browser acknowledges its hash.
import { createHash } from 'node:crypto';
import { normalizeScene, SceneError } from './scene-api.js';
import { canonicalJSON } from './web/snapshot.js';

const digest = value => createHash('sha256').update(canonicalJSON(value)).digest('hex');
const validRef = ref => typeof ref === 'string' && /^[a-f0-9]{64}$/.test(ref);
const copy = value => JSON.parse(JSON.stringify(value));

export function createSessionStore({ ttlMs = 30 * 60_000, maxSessions = 40, ackTimeoutMs = 12_000, now = Date.now } = {}) {
  const entries = new Map();
  const evictExpired = () => {
    for (const [ref, item] of entries) if (now() > item.expires && !item.pending) entries.delete(ref);
  };
  const current = ref => {
    if (!validRef(ref)) throw new SceneError('Invalid workspaceRef', 'INVALID_WORKSPACE');
    evictExpired();
    const item = entries.get(ref);
    if (!item) throw new SceneError('Workbench session unavailable or expired; reopen the view to resynchronize.', 'SESSION_NOT_FOUND');
    item.expires = now() + ttlMs;
    return item;
  };
  const finish = (item, error, result) => {
    const pending = item.pending;
    if (!pending) return;
    item.pending = null;
    clearTimeout(pending.timeout);
    error ? pending.reject(error) : pending.resolve(result);
  };
  return {
    get(ref) { return current(ref); },
    sync(ref, supplied) {
      if (!validRef(ref)) throw new SceneError('Invalid workspaceRef', 'INVALID_WORKSPACE');
      if (!supplied || typeof supplied.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(supplied.id) ||
          !Number.isInteger(supplied.revision) || supplied.revision < 0 || supplied.revision > 1e9) {
        throw new SceneError('Invalid browser snapshot', 'INVALID_SETUP');
      }
      const scene = normalizeScene(supplied.scene);
      const hash = digest(scene);
      if (supplied.hash !== hash) throw new SceneError('Browser scene hash mismatch', 'SNAPSHOT_MISMATCH');
      evictExpired();
      let item = entries.get(ref);
      if (item) {
        if (item.pending) throw new SceneError('An edit is awaiting browser confirmation; resync after it finishes.', 'REVISION_BUSY');
        if (item.setup.id !== supplied.id || supplied.revision < item.setup.revision ||
            (supplied.revision === item.setup.revision && hash !== item.setup.hash)) {
          throw new SceneError('Browser snapshot conflicts with the session revision', 'REVISION_CONFLICT');
        }
      } else {
        if (entries.size >= maxSessions) throw new SceneError('Too many active workbenches', 'SESSION_LIMIT');
        item = { setup: null, pending: null, receipts: new Map(), expires: 0 };
        entries.set(ref, item);
      }
      item.setup = { id: supplied.id, revision: supplied.revision, hash, scene };
      item.expires = now() + ttlMs;
      return { setupId: supplied.id, revision: supplied.revision, hash };
    },
    read(ref) { return copy(current(ref).setup); },
    offer(ref, { requestId, fingerprint, baseRevision, baseHash, action, nextScene = null, patch = null }) {
      const item = current(ref);
      if (typeof requestId !== 'string' || !requestId || requestId.length > 100) throw new SceneError('Invalid clientRequestId');
      const receipt = item.receipts.get(requestId);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) throw new SceneError('clientRequestId reused for another operation', 'REQUEST_ID_REUSED');
        return { fresh: false, promise: Promise.resolve(receipt.result) };
      }
      if (item.pending) {
        if (item.pending.requestId === requestId && item.pending.fingerprint === fingerprint) {
          return { fresh: false, promise: item.pending.promise };
        }
        throw new SceneError('An edit is still pending; retry after the browser confirms it.', 'REVISION_BUSY');
      }
      if (item.setup.revision !== baseRevision || item.setup.hash !== baseHash) {
        throw new SceneError('Workbench changed; read its latest revision first.', 'REVISION_CONFLICT');
      }
      let resolve, reject;
      const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
      const pending = { requestId, fingerprint, baseRevision, baseHash, action, nextScene, patch, promise, resolve, reject, timeout: null };
      item.pending = pending;
      pending.timeout = setTimeout(() => {
        if (item.pending === pending) finish(item, new SceneError('Workbench did not confirm the edit. Check the view before retrying.', 'ACK_TIMEOUT'));
      }, ackTimeoutMs);
      pending.timeout.unref?.();
      return { fresh: true, promise };
    },
    fail(ref, requestId, reason = 'Workbench is not connected') {
      const item = current(ref);
      if (item.pending?.requestId !== requestId) return false;
      finish(item, new SceneError(reason, 'EDIT_NOT_APPLIED'));
      return true;
    },
    ack(ref, answer) {
      const item = current(ref), pending = item.pending;
      if (!pending || pending.requestId !== answer?.clientRequestId) {
        const receipt = item.receipts.get(answer?.clientRequestId);
        if (receipt && answer?.applied === true && receipt.result.revision === answer.revision && receipt.result.hash === answer.hash) return receipt.result;
        throw new SceneError('No matching pending edit', 'NO_PENDING_EDIT');
      }
      if (answer.applied !== true) {
        finish(item, new SceneError('Workbench rejected the stale or invalid proposal; its local scene was preserved.', 'EDIT_REJECTED'));
        return { applied: false };
      }
      const revision = pending.baseRevision + 1;
      let next;
      try {
        next = pending.nextScene || normalizeScene(answer.scene);
        if (answer.revision !== revision || digest(next) !== answer.hash) throw new SceneError('Edit acknowledgement hash mismatch', 'ACK_MISMATCH');
        if (pending.nextScene && digest(pending.nextScene) !== answer.hash) throw new SceneError('Unexpected edited scene', 'ACK_MISMATCH');
      } catch (error) {
        finish(item, error instanceof SceneError ? error : new SceneError('Invalid edit acknowledgement', 'ACK_MISMATCH'));
        throw error;
      }
      const result = {
        status: 'applied', setupId: item.setup.id, revision, hash: answer.hash,
        workspaceRef: ref, clientRequestId: pending.requestId, action: pending.action,
        changed: pending.patch ? {
          elements: { upserted: pending.patch.elements.upsert.map(x => x.id), removed: pending.patch.elements.remove },
          paths: { upserted: pending.patch.beams.upsert.map(x => x.id), removed: pending.patch.beams.remove }
        } : { history: pending.action },
      };
      item.setup = { ...item.setup, revision, hash: answer.hash, scene: next };
      item.receipts.set(pending.requestId, { fingerprint: pending.fingerprint, result });
      if (item.receipts.size > 60) item.receipts.delete(item.receipts.keys().next().value);
      finish(item, null, result);
      return result;
    },
    get size() { evictExpired(); return entries.size; },
  };
}
