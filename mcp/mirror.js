// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { SceneError } from './errors.js';
import { LIMITS } from './scene-api.js';
import { snapshot, sceneHash, setupVersion } from './stateless.js';
import { applyScenePatch, diffScene } from './web/scene-patch.js';
import { proposalMatches } from './web/snapshot.js';

const isToken = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const sameVersion = (a, b) => a.revision === b.revision && a.hash === b.hash;
const unavailable = () => new SceneError('Open the OpticalSetup workbench and wait for it to reconnect. Then use its current workspace reference.', 'WORKSPACE_UNAVAILABLE');
const conflict = () => new SceneError('The workbench changed. Read get_setup again before editing.', 'REVISION_CONFLICT');
const engaged = () => new SceneError('The workbench is in the middle of a manual edit and did not take this one. Nothing changed. Retry shortly.', 'BUSY');
const unshared = reason => new SceneError(`The workbench now holds a setup the chat cannot follow: ${reason}. It cannot be read or edited from here until that changes. Tell the user.`, 'WORKSPACE_NOT_SHARED');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createSceneMirror({ relay, ttlMs = 600000, maxWorkspaces = 40, ackMs = 5000, reconnectMs = 3000, maxUnconfirmed = 8, now = Date.now }) {
  const entries = new Map();
  const finish = (entry, error, value) => {
    const pending = entry.pending;
    if (!pending) return;
    clearTimeout(pending.timer);
    entry.pending = null;
    if (error) pending.reject(error);
    else pending.resolve(value);
  };
  // The wait for the browser has a limit, but the browser may still apply the edit after it.
  // The edit is kept as overdue, so a confirmation that comes late is still recorded as its outcome.
  // Every overdue edit was computed on the scene the mirror holds now. The browser applies an edit
  // only to the scene it was computed on, so at most one of them can become the next scene: they
  // are all kept until the browser answers for one or sends a scene that came about another way.
  const expire = entry => {
    const { id, baseRevision, hash, requestId, fingerprint } = entry.pending;
    entry.overdue.set(id, { id, baseRevision, hash, requestId, fingerprint });
    finish(entry, new SceneError('The browser has not confirmed the edit, which may still be applied. Repeat the call with the same clientRequestId and arguments to learn its outcome before editing further.', 'EDIT_UNCONFIRMED'));
  };
  // A view reopens its live stream whenever the service ends it at its time limit, and after a
  // network fault. An edit that arrives in between waits for the view instead of failing.
  const reconnected = async (ref, entry) => {
    for (let waited = 0; waited < reconnectMs && !relay.connected(entry.channel); waited += 50) await pause(50);
    if (entries.get(ref) !== entry || !relay.connected(entry.channel)) throw unavailable();
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
    read(ref) {
      const entry = get(ref);
      if (entry.refused) throw unshared(entry.refused);
      return entry.current;
    },
    sync(data) {
      prune();
      if (!isToken(data?.channel) || !relay.connected(data.channel)) throw unavailable();
      // The reference authorizes MCP reads and proposals. Only the browser's
      // separate preimage can register a scene, read its stream or acknowledge.
      const workspaceRef = sceneHash(data.channel);
      const entry = entries.get(workspaceRef);
      const current = entry?.current;
      if (data.rejected === true) {
        if (data.deliveryId === entry?.pending?.id) finish(entry, data.busy === true ? engaged() : conflict());
        entry?.overdue.delete(data.deliveryId);
        return { workspaceRef };
      }
      const { id, revision, hash, canUndo, canRedo } = data;
      if (!isToken(hash) || typeof canUndo !== 'boolean' || typeof canRedo !== 'boolean') throw new SceneError('Invalid workbench state');
      if (current && (id !== current.id || revision < current.revision)) throw conflict();
      const pending = entry?.pending;
      const acknowledge = pending && data.deliveryId === pending.id;
      // The edit this confirms: the one being waited for, or one whose wait has already ended.
      const confirmed = acknowledge ? pending : entry?.overdue.get(data.deliveryId);
      if (confirmed && (revision !== confirmed.baseRevision + 1 || (confirmed.hash && hash !== confirmed.hash))) throw conflict();
      if (current && id === current.id && sameVersion(current, data)) {
        entry.touched = now();
        entry.refused = null;
        return { workspaceRef };
      }
      if (current && revision === current.revision) throw conflict();
      if (!entry && entries.size >= maxWorkspaces) {
        // A view that has gone keeps its mirror until it expires. One that is here now takes the place
        // of the one gone longest; if that view comes back it sends its scene again, as after a restart.
        // One whose edit is still unconfirmed keeps its place, and with it what the browser may yet say of that edit.
        const [gone] = [...entries].filter(([, other]) => !other.pending && !other.overdue.size && !relay.connected(other.channel)).sort((a, b) => a[1].touched - b[1].touched);
        if (!gone) throw new SceneError('Too many active workbenches. Retry shortly.', 'BUSY');
        entries.delete(gone[0]);
      }
      let scene = data.scene, setup;
      if (!scene && (!current || !proposalMatches(current, data))) throw new SceneError('The workbench needs to send its current scene.', 'RESYNC_REQUIRED');
      try {
        scene ||= applyScenePatch(current.scene, data.patch);
        // The editor has no such limit, so the view is given the reason in words it can show.
        if (scene?.elements?.length > LIMITS.elements || scene?.beams?.length > LIMITS.beams) throw new SceneError(`it has more than ${LIMITS.elements} components or ${LIMITS.beams} paths`);
        setup = snapshot({ id, revision, hash, scene });
        if (Buffer.byteLength(JSON.stringify(setup.scene)) > 750000) throw new SceneError('it is larger than the live workbench takes');
      } catch (error) {
        // The view now holds a scene this mirror cannot take, so the scene held here is no longer
        // the workbench. It is not read or edited in its place: the chat is told why instead.
        if (entry) entry.refused = error instanceof SceneError ? error.message : 'the service could not read it';
        throw error;
      }
      const next = { ...setup, workspaceRef, canUndo, canRedo };
      if (!entry) entries.set(workspaceRef, { current: next, channel: data.channel, touched: now(), receipts: new Map(), pending: null, overdue: new Map(), refused: null });
      else {
        entry.current = next;
        entry.touched = now();
        entry.refused = null;
        if (confirmed) {
          const patch = diffScene(current.scene, next.scene);
          const receipt = {
            status: 'applied', workspaceRef, ...setupVersion(next), canUndo, canRedo,
            changed: [...(patch.elements?.put || []).map(item => item.id), ...(patch.beams?.put || []).map(item => item.id)],
            removed: [...(patch.elements?.remove || []), ...(patch.beams?.remove || [])],
          };
          entry.receipts.set(confirmed.requestId, { fingerprint: confirmed.fingerprint, receipt });
          if (entry.receipts.size > 60) entry.receipts.delete(entry.receipts.keys().next().value);
          if (acknowledge) finish(entry, null, receipt);
        }
        // Whatever else was being waited for, or left unconfirmed, was computed on the scene this one replaced.
        entry.overdue.clear();
        if (entry.pending) finish(entry, conflict());
      }
      return { workspaceRef };
    },
    async edit(name, args, mutate) {
      const entry = get(args.workspaceRef);
      const { receipts, channel } = entry;
      const fingerprint = sceneHash({ name, args });
      // The same request again is answered with what became of it the first time.
      const earlier = () => {
        const previous = receipts.get(args.clientRequestId) || [entry.pending, ...entry.overdue.values()].find(edit => edit?.requestId === args.clientRequestId);
        if (previous && previous.fingerprint !== fingerprint) throw new SceneError('clientRequestId was already used for a different edit', 'REQUEST_ID_REUSED');
        // An overdue edit has neither: the same call again sends it again, under the same delivery.
        return previous && (previous.receipt ?? previous.promise);
      };
      let outcome = earlier();
      if (outcome) return outcome;
      if (!relay.connected(channel)) {
        await reconnected(args.workspaceRef, entry);
        if ((outcome = earlier())) return outcome;
      }
      const { current, pending, overdue } = entry;
      if (entry.refused) throw unshared(entry.refused);
      if (args.expectedRevision !== current.revision) throw conflict();
      if (pending) throw new SceneError('The workbench is applying an edit. Retry shortly.', 'BUSY');
      const deliveryId = sceneHash({ channel, fingerprint, base: current.hash });
      if (!overdue.has(deliveryId) && overdue.size >= maxUnconfirmed) throw new SceneError('The browser has not answered for earlier edits, which may still be applied. Repeat one of those calls with the same clientRequestId and arguments to learn its outcome, or read get_setup once the workbench answers.', 'EDIT_UNCONFIRMED');
      const undo = name === 'undo_setup', redo = name === 'redo_setup';
      if ((undo && !current.canUndo) || (redo && !current.canRedo)) throw new SceneError('There is no matching workbench history.', 'EMPTY_HISTORY');
      const scene = undo || redo ? null : mutate(current, name, args);
      if (scene && Buffer.byteLength(JSON.stringify(scene)) > 750000) throw new SceneError('This edit would exceed the live workbench size limit');
      const proposal = {
        action: name, deliveryId, clientRequestId: args.clientRequestId,
        baseRevision: current.revision, baseHash: current.hash,
        ...(scene && { patch: diffScene(current.scene, scene), hash: sceneHash(scene) }),
      };
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      const timer = setTimeout(() => expire(entry), ackMs);
      entry.pending = { id: deliveryId, baseRevision: proposal.baseRevision, hash: proposal.hash, requestId: args.clientRequestId, fingerprint, timer, promise, resolve, reject };
      // Sent again, the overdue edit is waited for once more.
      overdue.delete(deliveryId);
      if (relay.publish(channel, proposal) !== 'sent') finish(entry, unavailable());
      return promise;
    },
  };
}
