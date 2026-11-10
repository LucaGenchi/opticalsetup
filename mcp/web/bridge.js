// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { state, onChange, serialize, parseSketch, replaceScene, configureAutosave } from '../../sketch/js/state.js';
import { registry } from '../../sketch/js/elements.js';
import { renderAll, zoomFit } from '../../sketch/js/canvas.js';
import { renderInspector } from '../../sketch/js/inspector.js';
import { buildShareURL } from '../../sketch/js/share.js';
import { browserSceneHash, canonicalJSON, canonicalScene, offeredSetup, proposalMatches, takeLateResult } from './snapshot.js';
// Native autosave is origin-wide. Keep this integration's scenes scoped by ID.
configureAutosave({ enabled: false });
const nativeBoot = new Promise(resolve => window.addEventListener('opticalsetup:booted', resolve, { once: true }));
const hosted = window.parent !== window, pending = new Map();
let receiveInitialResult;
const initialResult = new Promise(resolve => { receiveInitialResult = resolve; });
let nextId = 1, setup, history = [], future = [], requests = [], applying = false, ready = false, busy = false, accepting = false, dragging = false, queued, channel, timer, contextKey = '', navigationGeneration = 0;
let host = {}, contextFailures = 0, contextRetryAt = 0, provisional = false, liveAbort;
// Hash the scene in the form the service hashes it. A state the editor can
// hold but not load (a fiber dragged onto a single point) stays raw, and the
// service then answers with the editor's own reason.
const nativeScene = () => {
  const text = serialize();
  try { return canonicalScene(text, registry); } catch { return JSON.parse(text); }
};
const key = id => 'opticalsetup-local-v1:' + id;
const eventsURL = new URL('../../../events', import.meta.url);
const copy = value => JSON.parse(JSON.stringify(value));
function status(message, error = false) {
  const el = document.getElementById('lab-status'); if (el) el.textContent = message;
  const box = document.getElementById('lab-sync'); if (box) box.dataset.error = String(error);
}
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++, timeout = setTimeout(() => { pending.delete(id); reject(new Error('Chat connection timed out')); }, 15000);
    pending.set(id, { resolve, reject, timeout });
    window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
  });
}
function controls() {
  for (const [id, enabled] of [['btnUndo', history.length], ['btnRedo', future.length]]) {
    const button = document.getElementById(id); if (button && button.disabled === Boolean(enabled)) button.disabled = !enabled;
  }
}
function context() {
  if (!hosted || !setup || busy || Date.now() < contextRetryAt) return;
  const selection = state.selection, selected = selection?.kind === 'element' ? state.elements.find(x => x.id === selection.id) : null;
  const payload = { setup, selectedComponent: selected ? { id: selected.id, type: selected.type } : null, selectedPathId: selection?.kind === 'beam' ? selection.id : null, undoScene: history.at(-1) || null, redoScene: future.at(-1) || null, storage: 'browser-local' };
  const content = JSON.stringify(payload);
  if (content === contextKey) return; contextKey = content;
  // A host that cannot take the context is asked again, but less and less often.
  request('ui/update-model-context', { content: [{ type: 'text', text: 'OpticalSetup current browser snapshot (use this for the next tool call): ' + content }] })
    .then(() => { contextFailures = 0; }, () => { contextKey = ''; contextRetryAt = Date.now() + Math.min(60000, 1000 * 2 ** contextFailures++); });
}
function persist(broadcast = true) {
  const local = { setup, history, future, requests };
  try { localStorage.setItem(key(setup.id), JSON.stringify(local)); status('Local copy · Save JSON for a backup'); }
  catch { status('Browser storage unavailable · Save JSON to keep this setup', true); }
  if (broadcast) channel?.postMessage(local);
  controls(); context(); updateLink();
  const box = document.getElementById('lab-sync'); if (box) { box.dataset.revision = String(setup.revision); box.dataset.sceneHash = setup.hash; box.dataset.storage = 'local'; box.dataset.setupId = setup.id; }
}
function stored(id) {
  try {
    const value = JSON.parse(localStorage.getItem(key(id)));
    if (value?.setup?.id !== id || !Array.isArray(value.history) || !Array.isArray(value.future) || !Array.isArray(value.requests)) return null;
    parseSketch(value.setup.scene, registry); return value;
  } catch { return null; }
}
function render(scene, fit = false) {
  applying = true;
  const selection = state.selection;
  replaceScene(parseSketch(scene, registry), { resetHistory: true });
  const items = selection?.kind === 'element' ? state.elements : selection?.kind === 'beam' ? state.beams : [];
  state.selection = items.some(x => x.id === selection?.id) ? selection : null;
  renderAll(); renderInspector(); if (fit && (state.elements.length || state.beams.length)) zoomFit();
  applying = false; controls();
}
// Take a setup as this view's own in one step, with nothing awaited: the copy
// this browser holds of it as it is now, or else what the result offered.
function take(id, fresh) {
  const view = stored(id) || fresh;
  if (!view) throw new Error('Invalid initial snapshot');
  ({ setup, history, future, requests } = view); render(setup.scene, true);
}
// Other views of the same setup in this browser follow each other through a channel named after it.
function openChannel() {
  try {
    channel?.close();
    channel = new BroadcastChannel(key(setup.id));
    channel.onmessage = async event => {
      if (dragging || busy) return;
      const data = event.data;
      if (data?.setup?.id !== setup.id || data.setup.revision <= setup.revision || data.setup.hash !== await browserSceneHash(data.setup.scene)) return;
      if (canonicalJSON(nativeScene()) !== canonicalJSON(setup.scene)) { status('Another view changed · Local edit kept', true); return; }
      ({ setup, history, future, requests } = data); render(setup.scene); persist(false);
    };
  } catch { /* isolated host storage may not support browser channels */ }
}
async function accept(data) {
  if (!data?.setup?.scene) return;
  const box = document.getElementById('lab-sync'); if (box) box.dataset.lastChatAction = data.action || 'open_setup';
  if (!ready) {
    queued = data;
    receiveInitialResult(data);
    return;
  }
  if (dragging || busy || accepting) { queued = data; return; }
  accepting = true;
  try {
  await settleManual();
  if (data.setup.id !== setup.id) {
    // The result this view was opened for may arrive after the view has started on an empty setup of its own.
    const placeholder = setup.id;
    const outcome = await takeLateResult(data, {
      view: () => ({ provisional, setup, history, future, dragging }),
      validate: offeredSetup, settle: settleManual,
      replace: fresh => { take(data.setup.id, fresh); provisional = false; },
    });
    if (outcome === 'wait') { queued = data; return; }
    if (outcome === 'refuse') { status('Chat edit targets another local setup · Current setup kept', true); return; }
    try { localStorage.removeItem(key(placeholder)); } catch { /* storage may be unavailable */ }
    // Storage, the channel between views and the live channel now belong to the setup just taken.
    openChannel(); liveAbort?.abort();
    if (!data.action || data.setup.revision <= setup.revision) { persist(); return; }
  }
  if (!data.action) return;
  if (requests.includes(data.clientRequestId)) return;
  if (!proposalMatches(setup, data)) { status('Chat edit was based on an older scene · Ask again using the current setup', true); contextKey = ''; context(); return; }
  if (data.setup.hash !== await browserSceneHash(data.setup.scene)) { status('Invalid chat snapshot · Local setup kept', true); return; }
  // A keyboard edit may have happened while the returned scene was hashing.
  await settleManual();
  if (dragging || !proposalMatches(setup, data)) { status('Chat edit was based on an older scene · Local setup kept', true); contextKey = ''; context(); return; }
  if (data.action === 'undo_setup') {
    if (!history.length || canonicalJSON(history.at(-1)) !== canonicalJSON(data.setup.scene)) { status('Undo history changed · Local setup kept', true); return; }
    future.push(setup.scene); history.pop();
  } else if (data.action === 'redo_setup') {
    if (!future.length || canonicalJSON(future.at(-1)) !== canonicalJSON(data.setup.scene)) { status('Redo history changed · Local setup kept', true); return; }
    history.push(setup.scene); future.pop();
  } else { history.push(setup.scene); history = history.slice(-30); future = []; }
  requests.push(data.clientRequestId); requests = requests.slice(-60);
  const fit = data.setup.scene.elements.length > setup.scene.elements.length || data.setup.scene.beams.length > setup.scene.beams.length;
  // A proposal computed without the channel (the model left it out) must not cost the view its live channel.
  setup = { ...copy(data.setup), ...(setup.channel ? { channel: setup.channel } : {}) }; render(setup.scene, fit); persist();
  } finally { accepting = false; drainQueued(); }
}
function drainQueued() {
  if (!queued || !ready || dragging || busy || accepting) return;
  const data = queued; queued = null;
  accept(data).catch(() => status('Could not apply chat edit · Local setup kept', true));
}
async function connectLive() {
  if (!hosted) return;
  let delay = 1000;
  while (ready) {
    const box = document.getElementById('lab-sync'), connection = liveAbort = new AbortController();
    // The channel belongs to the setup, so a view that takes another setup connects again for that one.
    if (!setup.channel) { setup.channel = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join(''); persist(); }
    try {
      const response = await fetch(eventsURL, { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ channel: setup.channel }), signal: connection.signal });
      if (!response.ok || !response.body) throw new Error('Live chat delivery unavailable');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      box.dataset.delivery = 'connected'; delay = 1000;
      try {
        while (ready) {
          const { value, done } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true });
          if (buffer.length > 1000000) throw new Error('Live response too large');
          let newline;
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
            const data = JSON.parse(line);
            if (data.setup) await accept(data);
          }
        }
      } finally { await reader.cancel(); }
    } catch { /* browser state is retained through transient connection failures */ }
    box.dataset.delivery = 'reconnecting';
    if (connection.signal.aborted) { delay = 1000; continue; }
    // A refused connection (limit reached, origin not allowed) is retried ever more slowly.
    await new Promise(resolve => setTimeout(resolve, delay)); delay = Math.min(delay * 2, 30000);
  }
}
window.addEventListener('message', event => {
  if (!hosted || event.source !== window.parent || event.data?.jsonrpc !== '2.0') return;
  const message = event.data;
  // The host numbers its own requests, so only a message without a method answers one of ours.
  if (message.method === undefined && message.id !== undefined && pending.has(message.id)) {
    const call = pending.get(message.id); pending.delete(message.id); clearTimeout(call.timeout);
    message.error ? call.reject(new Error(message.error.message)) : call.resolve(message.result);
  } else if (message.method === 'ui/notifications/tool-result') accept(message.params?.structuredContent).catch(() => status('Could not apply chat edit · Local setup kept', true));
  else if (message.method === 'ui/notifications/host-context-changed' && message.params?.containerDimensions) reportSize(message.params.containerDimensions);
  else if (message.id !== undefined && ['ui/resource-teardown', 'ping'].includes(message.method)) window.parent.postMessage({ jsonrpc: '2.0', id: message.id, result: {} }, '*');
});
// The editor fills whatever height it is given, so it has no content height
// for a host to measure. Where the host leaves the height open, ask for a
// workable one; a host that never hears a size can show the view with none.
const EDITOR_HEIGHT = 680;
function reportSize(box) {
  if (!hosted || box?.height) return;
  window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/size-changed', params: { width: document.documentElement.clientWidth, height: Math.min(box?.maxHeight || EDITOR_HEIGHT, EDITOR_HEIGHT) } }, '*');
}
// Some ChatGPT surfaces update legacy globals on the already-mounted view.
// Keep the standard MCP Apps lifecycle and support that compatibility event.
window.addEventListener('openai:set_globals', event => {
  const globals = event.detail?.globals;
  const data = globals?.toolOutput || globals?.toolResponseMetadata?.mcp_tool_result?.structuredContent;
  if (data) accept(data).catch(() => status('Could not apply chat edit · Local setup kept', true));
});
let manualPromise;
async function settleManual() {
  clearTimeout(timer);
  if (!setup || applying || dragging) return;
  if (manualPromise) return manualPromise;
  manualPromise = (async () => {
    busy = true;
    try {
      // Re-read after hashing if another manual edit arrived meanwhile.
      while (true) {
        const scene = nativeScene(), text = canonicalJSON(scene);
        if (text === canonicalJSON(setup.scene)) return;
        const hash = await browserSceneHash(scene);
        if (canonicalJSON(nativeScene()) !== text) continue;
        history.push(copy(setup.scene)); history = history.slice(-30); future = [];
        setup = { ...setup, scene, hash, revision: setup.revision + 1 };
        persist(); return;
      }
    } finally { busy = false; controls(); context(); }
  })().finally(() => {
    manualPromise = null;
    drainQueued();
  });
  return manualPromise;
}
async function localHistory(action) {
  await settleManual(); if (!setup || dragging) return;
  const from = action === 'undo' ? history : future, to = action === 'undo' ? future : history;
  if (!from.length) return;
  const scene = from.pop(); to.push(setup.scene);
  setup = { ...setup, scene, revision: setup.revision + 1, hash: await browserSceneHash(scene) };
  render(scene); persist();
}
window.addEventListener('click', event => {
  const id = event.target.closest?.('button')?.id;
  if (hosted && id === 'btnOpen') {
    event.preventDefault(); event.stopImmediatePropagation();
    document.getElementById('lab-open-json')?.showModal(); return;
  }
  if (hosted && id === 'btnSave') {
    event.preventDefault(); event.stopImmediatePropagation();
    const dialog = document.getElementById('lab-save-json');
    if (dialog) { dialog.querySelector('textarea').value = JSON.stringify(nativeScene(), null, 2); dialog.querySelector('[role="status"]').textContent = ''; dialog.showModal(); }
    return;
  }
  if (!['btnUndo', 'btnRedo', 'btnNew'].includes(id)) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (id === 'btnNew') {
    // Commit an in-flight inspector edit before clearing, so Undo restores it.
    (async () => {
      await settleManual();
      if (!setup || dragging || (!state.elements.length && !state.beams.length)) return;
      history.push(copy(setup.scene)); history = history.slice(-30); future = [];
      const scene = { app: 'optics2d', version: 1, elements: [], beams: [] };
      setup = { ...setup, scene, revision: setup.revision + 1, hash: await browserSceneHash(scene) };
      render(scene); persist();
    })().catch(() => status('Could not clear setup · Local setup kept', true));
  } else localHistory(id === 'btnUndo' ? 'undo' : 'redo');
}, true);
window.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) {
    event.preventDefault(); event.stopImmediatePropagation(); localHistory(event.shiftKey ? 'redo' : 'undo');
  }
}, true);
window.addEventListener('pointerdown', () => { dragging = true; }, true);
for (const name of ['pointerup', 'pointercancel']) window.addEventListener(name, () => { dragging = false; settleManual().then(() => { if (queued && ready) { const data = queued; queued = null; return accept(data); } }); }, true);
onChange(() => { if (!applying && ready) { clearTimeout(timer); timer = setTimeout(settleManual, 150); } });
async function updateLink() {
  const version = ++navigationGeneration;
  try {
    const href = await buildShareURL(JSON.stringify(setup.scene), 'https://opticalsetup.com/sketch/');
    if (version !== navigationGeneration) return;
    const a = document.getElementById('official-editor'); if (a) a.href = href;
    window.openai?.setOpenInAppUrl?.({ href });
  } catch { const a = document.getElementById('official-editor'); if (a) { a.href = 'https://opticalsetup.com/sketch/'; a.textContent = 'Visit OpticalSetup · Save JSON to transfer this large setup'; } }
}
window.addEventListener('DOMContentLoaded', async () => {
  const openDialog = document.createElement('dialog');
  openDialog.id = 'lab-open-json';
  openDialog.innerHTML = '<form><h2>Open a setup</h2><label for="lab-json-input">Paste your saved OpticalSetup JSON</label><textarea id="lab-json-input" maxlength="750000" spellcheck="false" required></textarea><p id="lab-json-error" role="alert"></p><div><button type="button" id="lab-json-cancel">Cancel</button><button type="submit">Open JSON</button></div></form>';
  document.body.append(openDialog);
  const saveDialog = document.createElement('dialog');
  saveDialog.id = 'lab-save-json';
  saveDialog.innerHTML = '<h2>Save a setup</h2><label for="lab-json-output">Copy this JSON into a .json file for a portable backup</label><textarea id="lab-json-output" readonly spellcheck="false"></textarea><p role="status"></p><div><button type="button" id="lab-save-close">Close</button><button type="button" id="lab-copy-json">Copy JSON</button></div>';
  document.body.append(saveDialog);
  saveDialog.querySelector('#lab-save-close').addEventListener('click', () => saveDialog.close());
  saveDialog.querySelector('#lab-copy-json').addEventListener('click', async () => {
    const text = saveDialog.querySelector('textarea'); text.focus(); text.select();
    let copied = false;
    try { await navigator.clipboard.writeText(text.value); copied = true; } catch { /* manual copy remains available */ }
    saveDialog.querySelector('[role="status"]').textContent = copied ? 'JSON copied · Paste it into a .json file to keep your backup.' : 'JSON selected · Press ⌘C or Ctrl+C to copy it.';
  });
  openDialog.querySelector('#lab-json-cancel').addEventListener('click', () => openDialog.close());
  openDialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = openDialog.querySelector('[type="submit"]'), errorBox = openDialog.querySelector('#lab-json-error');
    button.disabled = true; errorBox.textContent = '';
    try {
      const parsed = parseSketch(openDialog.querySelector('textarea').value, registry);
      if (parsed.elements.length > 200 || parsed.beams.length > 100) throw new Error('This integration supports up to 200 components and 100 paths.');
      const scene = { app: 'optics2d', version: 1, ...parsed }, hash = await browserSceneHash(scene);
      await settleManual();
      if (!setup || accepting || dragging) throw new Error('Finish the current edit and try again.');
      history.push(copy(setup.scene)); history = history.slice(-30); future = [];
      setup = { ...setup, scene, hash, revision: setup.revision + 1 };
      render(scene, true); persist(); openDialog.close();
    } catch (error) { errorBox.textContent = error.message; }
    finally { button.disabled = false; }
  });
  const brand = document.querySelector('.brand'); if (brand) { brand.href = 'https://opticalsetup.com'; brand.target = '_blank'; brand.rel = 'noopener'; }
  document.getElementById('official-editor')?.addEventListener('click', event => {
    if (hosted && window.openai?.openExternal) { event.preventDefault(); window.openai.openExternal({ href: event.currentTarget.href, redirectUrl: false }); }
  });
  // A sandboxed view cannot open a new tab by itself: ask the host, as MCP Apps defines.
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[target="_blank"]');
    if (!hosted || !link || window.openai?.openExternal || !host.hostCapabilities?.openLinks || !/^https:/.test(link.href)) return;
    event.preventDefault(); request('ui/open-link', { url: link.href }).catch(() => status('The chat could not open this link', true));
  });
  new MutationObserver(controls).observe(document.getElementById('toolbar'), { attributes: true, subtree: true, attributeFilter: ['disabled'] });
  const linkDocs = () => {
    for (const a of document.querySelectorAll('#inspector a[href^="/wiki/"]')) {
      a.href = 'https://opticalsetup.com' + a.getAttribute('href'); a.target = '_blank'; a.rel = 'noopener';
    }
  };
  new MutationObserver(linkDocs).observe(document.getElementById('inspectorContent'), { childList: true, subtree: true });
  linkDocs();
  try {
    await nativeBoot;
    if (hosted) {
      host = await request('ui/initialize', { protocolVersion: '2026-01-26', appInfo: { name: 'OpticalSetup', version: '1.0.0' }, appCapabilities: { availableDisplayModes: ['inline', 'fullscreen'] } }) || {};
      window.parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} }, '*');
      reportSize(host.hostContext?.containerDimensions);
    }
    // A host can deliver the initial tool result after the handshake response.
    const incoming = queued || window.openai?.toolOutput || (hosted && await Promise.race([
      initialResult,
      new Promise(resolve => setTimeout(resolve, 1200)),
    ]));
    if (incoming?.setup) take(incoming.setup.id, await offeredSetup(incoming));
    else {
      // Standalone workbench starts with its own local copy, separate from ChatGPT views.
      const id = hosted ? crypto.randomUUID() : 'standalone', local = stored(id);
      if (local) { ({ setup, history, future, requests } = local); render(setup.scene, true); }
      else { const scene = { app: 'optics2d', version: 1, elements: [], beams: [] }; setup = { id, revision: 0, scene, hash: await browserSceneHash(scene) }; render(scene); }
      // No result came in time: a hosted view may still be given the one it was opened for.
      provisional = hosted;
    }
    openChannel();
    ready = true;
    // A copy stored before scenes were hashed in their loaded form is brought to it now.
    await settleManual();
    if (incoming?.action && incoming.setup.revision > setup.revision) await accept(incoming);
    persist(); setInterval(context, 500); connectLive();
  } catch (error) { status('Local editor · ' + error.message + ' · Save JSON for a backup', true); }
});
