// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { parseSketch } from '../../sketch/js/state.js';
// The one scene form that both the browser and the service hash: the editor's
// own load-time normalization. The editor's memory is not always in that form
// (a fiber just drawn has no cable length yet, a free-form glass just placed is
// not yet recentred), and the service always normalizes what it receives, so
// hashing the raw state would make the two sides disagree about the same scene.
export function canonicalScene(scene, registry) {
  return JSON.parse(JSON.stringify({ app: 'optics2d', version: 1, ...parseSketch(scene, registry) }));
}
export function canonicalJSON(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonicalJSON(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export async function browserSceneHash(scene) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJSON(scene)));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
// A view opened before its tool has finished starts on an empty setup of its
// own. Until something is done in it, a result that names another setup is the
// one the view was opened for, and the view takes it instead of refusing it.
export function mayAdopt(view, incoming) {
  return Boolean(view.provisional && incoming?.setup?.id && incoming.setup.id !== view.setup.id
    && view.setup.revision === 0 && !view.history.length && !view.future.length);
}
export function proposalMatches(current, proposal) {
  return proposal.baseRevision === current.revision && proposal.baseHash === current.hash;
}
