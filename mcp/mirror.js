// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { SceneError } from './errors.js';
import { snapshot, sceneHash, setupVersion } from './stateless.js';
import { applyScenePatch, diffScene } from './web/scene-patch.js';
import { proposalMatches } from './web/snapshot.js';

const isToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const sameVersion = (a, b) => a.revision === b.revision && a.hash === b.hash;
const unavailable = () => new SceneError('Open the OpticalSetup workbench and wait for it to reconnect. Then use its current workspace reference.', 'WORKSPACE_UNAVAILABLE');
const conflict = () => new SceneError('The workbench changed. Read get_setup again before editing.', 'REVISION_CONFLICT');

export function createSceneMirror({ relay, ttlMs = 600000, maxWorkspaces = 40, ackMs = 5000, now = Date.now }) {
  const entries = new Map();
  const finish = (entry, error, value) => {
    const pending = entry.pending;
    if (!pending) return;
    clearTimeout(pending.timer);
    entry.pending = null;
    if (error) pending.reject(error);
    else pending.resolve(value);
  };
  const prune = () => {
    for (const [ref, entry] of entries) {
      if (entry.touched + ttlMs > now()) continue;
      finish(entry, unavailable());
      entries.delete(ref);
    }
  };
  const sweep = setInterval(prune, Math.min(ttlMs, 30000));
  sweep.unref();
  function get(ref) {
    prune();
    const entry = entries.get(ref);
    if (!entry) throw unavailable();
    return entry;
  }

  return {
    close() {
      clearInterval(sweep);
      for (const entry of entries.values()) finish(entry, unavailable());
      entries.clear();
    },
    read(ref) { return get(ref).current; },
    sync(data) {
      prune();
      if (!isToken(data?.channel) || !relay.connected(data.channel)) throw unavailable();
      // The reference authorizes MCP reads and proposals. Only the browser's
      // separate preimage can register a scene, read its stream or acknowledge.
      const workspaceRef = sceneHash(data.channel);
      const entry = entries.get(workspaceRef);
      const current = entry?.current;
      if (data.rejected === true) {
        if (data.deliveryId === entry?.pending?.id) finish(entry, conflict());
        return { workspaceRef };
      }
      const { id, revision, hash, canUndo, canRedo } = data;
      if (!isToken(hash) || typeof canUndo !== 'boolean' || typeof canRedo !== 'boolean') throw new SceneError('Invalid workbench state');
      if (current && (id !== current.id || revision < current.revision)) throw conflict();
      const pending = entry?.pending;
      const acknowledge = pending && data.deliveryId === pending.id;
      if (acknowledge && (revision !== pending.baseRevision + 1 || (pending.hash && hash !== pending.hash))) throw conflict();
      if (current && id === current.id && sameVersion(current, data)) {
        entry.touched = now();
        return { workspaceRef };
      }
      if (current && revision === current.revision) throw conflict();
      if (!entry && entries.size >= maxWorkspaces) throw new SceneError('Too many active workbenches. Retry shortly.', 'BUSY');
      let scene = data.scene;
      if (!scene) {
        if (!current || !proposalMatches(current, data)) throw new SceneError('The workbench needs to send its current scene.', 'RESYNC_REQUIRED');
        scene = applyScenePatch(current.scene, data.patch);
      }
      const setup = snapshot({ id, revision, hash, scene });
      if (Buffer.byteLength(JSON.stringify(setup.scene)) > 750000) throw new SceneError('This scene exceeds the live workbench size limit');
      const next = { ...setup, workspaceRef, canUndo, canRedo };
      if (!entry) entries.set(workspaceRef, { current: next, channel: data.channel, touched: now(), receipts: new Map(), pending: null });
      else {
        entry.current = next;
        entry.touched = now();
        if (acknowledge) {
          const patch = diffScene(current.scene, next.scene);
          const receipt = {
            status: 'applied', workspaceRef, ...setupVersion(next), canUndo, canRedo,
            changed: [...(patch.elements?.put || []).map(item => item.id), ...(patch.beams?.put || []).map(item => item.id)],
            removed: [...(patch.elements?.remove || []), ...(patch.beams?.remove || [])],
          };
          entry.receipts.set(pending.requestId, { fingerprint: pending.fingerprint, receipt });
          if (entry.receipts.size > 60) entry.receipts.delete(entry.receipts.keys().next().value);
          finish(entry, null, receipt);
        } else if (pending) finish(entry, conflict());
      }
      return { workspaceRef };
    },
    async edit(name, args, mutate) {
      const entry = get(args.workspaceRef);
      const { current, receipts, pending, channel } = entry;
      const fingerprint = sceneHash({ name, args });
      const previous = receipts.get(args.clientRequestId) || (pending?.requestId === args.clientRequestId ? pending : null);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new SceneError('clientRequestId was already used for a different edit', 'REQUEST_ID_REUSED');
        return previous.receipt ?? previous.promise;
      }
      if (args.expectedRevision !== current.revision) throw conflict();
      if (pending) throw new SceneError('The workbench is applying an edit. Retry shortly.', 'BUSY');
      if (!relay.connected(channel)) throw unavailable();
      const undo = name === 'undo_setup', redo = name === 'redo_setup';
      if ((undo && !current.canUndo) || (redo && !current.canRedo)) throw new SceneError('There is no matching workbench history.', 'EMPTY_HISTORY');
      const scene = undo || redo ? null : mutate(current, name, args);
      if (scene && Buffer.byteLength(JSON.stringify(scene)) > 750000) throw new SceneError('This edit would exceed the live workbench size limit');
      const proposal = {
        action: name, deliveryId: sceneHash({ channel, fingerprint, base: current.hash }), clientRequestId: args.clientRequestId,
        baseRevision: current.revision, baseHash: current.hash,
        ...(scene && { patch: diffScene(current.scene, scene), hash: sceneHash(scene) }),
      };
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      const timer = setTimeout(() => finish(entry, new SceneError('The browser did not confirm the edit. Retry with the same clientRequestId or read the current setup.', 'EDIT_UNCONFIRMED')), ackMs);
      entry.pending = { id: proposal.deliveryId, baseRevision: proposal.baseRevision, hash: proposal.hash, requestId: args.clientRequestId, fingerprint, timer, promise, resolve, reject };
      if (relay.publish(channel, proposal) !== 'sent') finish(entry, unavailable());
      return promise;
    },
  };
}
