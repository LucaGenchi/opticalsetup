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
// A host hands a tool result to the view as structured content, or only as its
// text. Either way this is the object the tool returned, or nothing.
export function resultData(result) {
  if (result?.structuredContent) return result.structuredContent;
  for (const block of result?.content || []) {
    if (block?.type !== 'text') continue;
    try { const data = JSON.parse(block.text); if (data && typeof data === 'object') return data; } catch { /* not the result */ }
  }
  return undefined;
}
// What ChatGPT's own globals say about the tool result: whether one has
// arrived, and the object the tool returned if it can be read. `toolOutput` is
// the structured content; `toolResponseMetadata.mcp_tool_result` is the whole
// result. Globals that carry neither (a theme change, a call still running,
// an empty placeholder) are not a result.
export function globalsResult(globals) {
  const filled = value => Boolean(value) && typeof value === 'object' && Object.keys(value).length > 0;
  const output = filled(globals?.toolOutput) ? globals.toolOutput : undefined;
  const whole = filled(globals?.toolResponseMetadata?.mcp_tool_result) ? resultData(globals.toolResponseMetadata.mcp_tool_result) : undefined;
  if (!output && !filled(globals?.toolResponseMetadata?.mcp_tool_result)) return { received: false, data: undefined };
  return { received: true, data: output?.setup ? output : whole?.setup ? whole : output ?? whole };
}
// What a result offers a view as its setup, once its hash has been checked;
// nothing if the hash is wrong. The edit that produced the result counts as
// applied, so the same result delivered a second time is recognised instead of
// being read as an edit based on an older scene.
export async function offeredSetup(incoming) {
  const setup = JSON.parse(JSON.stringify(incoming.setup));
  if (setup.hash !== await browserSceneHash(setup.scene)) return null;
  return { setup, history: [], future: [], requests: incoming.clientRequestId ? [incoming.clientRequestId] : [] };
}
export function proposalMatches(current, proposal) {
  return proposal.baseRevision === current.revision && proposal.baseHash === current.hash;
}


/**
 * A compact, deterministic edit over canonical scenes. Existing item order is
 * preserved, and additions follow the existing items. No scene metadata is
 * changed: this deliberately supports component/path mutations, not imports.
 */
export function scenePatch(before, after) {
  const metadata = value => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'elements' && key !== 'beams'));
  if (canonicalJSON(metadata(before)) !== canonicalJSON(metadata(after))) throw new Error('Patch changes scene metadata');
  const diff = kind => {
    const oldItems = before[kind] || [], newItems = after[kind] || [];
    const oldById = new Map(oldItems.map(item => [item.id, item]));
    const newIds = new Set(newItems.map(item => item.id));
    if (newIds.size !== newItems.length) throw new Error('Duplicate item ID');
    const remove = oldItems.filter(item => !newIds.has(item.id)).map(item => item.id);
    const upsert = newItems.filter(item => !oldById.has(item.id) || canonicalJSON(oldById.get(item.id)) !== canonicalJSON(item));
    return { remove, upsert };
  };
  return { elements: diff('elements'), beams: diff('beams') };
}
export function applyScenePatch(scene, patch) {
  const next = JSON.parse(JSON.stringify(scene));
  for (const kind of ['elements', 'beams']) {
    const change = patch?.[kind];
    if (!change || !Array.isArray(change.remove) || !Array.isArray(change.upsert)) throw new Error('Invalid scene patch');
    const existing = next[kind] || [], removed = new Set(change.remove);
    const updates = new Map(change.upsert.map(item => [item.id, item]));
    if (updates.size !== change.upsert.length || change.upsert.some(item => !item || typeof item.id !== 'string')) throw new Error('Duplicate/invalid patch item');
    if (change.remove.some(id => !existing.some(item => item.id === id))) throw new Error('Patch removes unknown item');
    if (change.upsert.some(item => removed.has(item.id))) throw new Error('Patch updates a removed item');
    const seen = new Set();
    next[kind] = existing.filter(item => !removed.has(item.id)).map(item => {
      if (!updates.has(item.id)) return item;
      seen.add(item.id);
      return updates.get(item.id);
    });
    for (const item of change.upsert) if (!seen.has(item.id)) next[kind].push(item);
  }
  return next;
}
