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
// A copy this browser stored under an earlier version of the editor is brought
// to the form the editor loads today: its scene and every scene in its undo
// and redo lists, so that an undo lands on a scene both sides hash alike. The
// revision stays, because nothing was edited; the hash is the caller's to
// refresh. A list holding a scene that no longer loads is dropped whole.
export function loadedCopy(value, registry) {
  const bring = scenes => { try { return scenes.map(scene => canonicalScene(scene, registry)); } catch { return []; } };
  return { ...value, setup: { ...value.setup, scene: canonicalScene(value.setup.scene, registry) }, history: bring(value.history), future: bring(value.future) };
}
// Whether a copy another tab sent is already in that form. One that is not
// comes from a tab still running an earlier editor, and is not taken.
export function inLoadedForm(value, registry) {
  try {
    const lists = copy => [copy.setup.scene, copy.history, copy.future];
    return Array.isArray(value.history) && Array.isArray(value.future) && canonicalJSON(lists(loadedCopy(value, registry))) === canonicalJSON(lists(value));
  } catch { return false; }
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
