// App bootstrap: palette, toolbar, keyboard shortcuts.

import { state, changed, onChange, pushUndo, undo, redo, canUndo, canRedo, findSelected, serialize, parseSketch, replaceScene, loadAutosave } from './state.js';
import { registry, categories, createElement, getElementMeta } from './elements.js';
import {
  initCanvas, renderAll, startPlacing, startBeamTool, cancelTool, isPlacing,
  isPolygonDrawing, rotatePlacing, finishBeam, finishPolygon, undoPolygonPoint,
  getViewportDetail, zoomBy, zoomFit, setSelectionCallback,
  getPulsePlayback, setPulsePlaying, setPulseSpeed, setPulseDisplayMode, resetPulseTime,
} from './canvas.js';
import { initInspector, renderInspector, refreshMeasurements } from './inspector.js';
import { buildSVG, exportSVG, exportPNG } from './export.js';
import { examples } from './examples-data.js';
import { community } from './community-data.js';
import { download, esc } from './util.js';
import { buildShareURL, copyText, sharedSceneFromURL } from './share.js';
import { qrSVG } from './qr.js';
import { buildExampleProposalIssueURL } from './proposal.js';

const $ = id => document.getElementById(id);

// ---------- wiki embed scenes ----------
// Each demo needs a light source (and sometimes a second one, or a probe)
// so the showcased component's actual optical function is visible, not
// just its icon sitting in empty space. The showcased component keeps its
// registry type unique within its own scene, so it can be found again by
// type after the scene is built (see isDemo boot below).
function mkDemo(type, x, y, rot = 0, params = {}, extra = {}) {
  const e = createElement(type, x, y);
  e.rot = rot;
  Object.assign(e.params, params);
  Object.assign(e, extra);
  return e;
}

const demoScenes = {
  mirror: () => [
    mkDemo('laser', 60, 150, 0),
    mkDemo('mirror', 220, 150, 45, { length: 50.8 }),
  ],
  lens: () => [
    mkDemo('laser', 60, 220, 0, { beamMode: 'beam', beamWidth: 20 }),
    mkDemo('lens', 220, 220, 0, { f: 100, dia: 40 }),
    mkDemo('box', 320, 220, 0, { text: '', w: 2, h: 60, behavior: 'block', fill: '#c9d4e0' }, { label: 'focus (f = 100 mm)', showLabel: true, labelPos: 't' }),
  ],
  lensc: () => [
    mkDemo('laser', 60, 220, 0, { beamMode: 'beam', beamWidth: 20 }),
    mkDemo('lensc', 220, 220, 0, { f: -100, dia: 40 }),
    mkDemo('box', 340, 220, 0, { text: '', w: 2, h: 2, behavior: 'pass', fill: '#c9d4e0' }, { label: 'diverges — virtual image on the source side', showLabel: true, labelPos: 't' }),
  ],
  telescope: () => [
    mkDemo('laser', 60, 300, 0, { beamMode: 'beam', beamWidth: 10 }),
    mkDemo('telescope', 280, 300, 0, { f1: 50, f2: 150, dia: 50.8 }),
    mkDemo('box', 460, 300, 0, { text: '', w: 2, h: 2, behavior: 'pass', fill: '#c9d4e0' }, { label: 'still parallel — 3× wider', showLabel: true, labelPos: 't' }),
  ],
  objective: () => [
    mkDemo('laser', 60, 300, 0, { beamMode: 'beam', beamWidth: 18 }),
    mkDemo('objective', 300, 300, 0, { f: 10, aperture: 24 }),
    mkDemo('box', 326, 300, 0, { text: '', w: 2, h: 50, behavior: 'block', fill: '#c9d4e0' }, { label: 'focus (f = 10 mm)', showLabel: true, labelPos: 't' }),
  ],
  bs: () => [
    mkDemo('laser', 60, 200, 0),
    mkDemo('bs', 220, 200, 0, { ratio: 0.5 }),
    mkDemo('detector', 380, 200, 0, {}, { label: 'transmitted', showLabel: true }),
    mkDemo('detector', 220, 60, -90, {}, { label: 'reflected', showLabel: true, labelPos: 'l' }),
  ],
  dichroic: () => [
    mkDemo('laser', 60, 220, 0, { wavelength: 650 }, { label: 'transmitted (650 nm)', showLabel: true }),
    mkDemo('laser', 260, 60, 90, { wavelength: 450 }, { label: 'reflected (450 nm)', showLabel: true, labelPos: 'l' }),
    mkDemo('dichroic', 260, 220, -45, { length: 50.8 }),
  ],
  prism: () => [
    mkDemo('laser', 60, 200, 0, { bwMode: 'sc' }),
    mkDemo('prism', 220, 206, 0, { apex: 55, psize: 50 }),
    mkDemo('box', 480, 405, 0, { text: '', w: 10, h: 150, behavior: 'block', fill: '#f2f3f5' }, { label: 'screen', showLabel: true, labelPos: 'r' }),
  ],
  grating: () => [
    mkDemo('laser', 60, 200, 0, { bwMode: 'sc' }),
    mkDemo('grating', 220, 200, 0, { orders: '-1,0,1', transmissive: true }),
    mkDemo('box', 340, 200, 0, { text: '', w: 10, h: 260, behavior: 'block', fill: '#f2f3f5' }, { label: 'screen', showLabel: true, labelPos: 'r' }),
  ],
  polarizer: () => [
    mkDemo('laser', 60, 200, 0, { pol: 0 }),
    mkDemo('probe', 150, 200, 0, { prop: 'pol' }),
    mkDemo('polarizer', 240, 200, 0, { pangle: 90 }),
    mkDemo('detector', 360, 200, 0, {}, { label: 'transmitted power', showLabel: true }),
  ],
  aom: () => [
    mkDemo('laser', 60, 200, 0, {
      temporalMode: 'pulsed', repRateMHz: 80, pulseWidthFs: 100,
    }),
    mkDemo('aom', 220, 200, 0, {
      deflect: 15, rfMHz: 80, zero: true, eff: 1,
      modulate: true, modShape: 'square', modFreqMHz: 40,
    }),
    mkDemo('box', 370, 200, 0, { text: '', w: 10, h: 90, behavior: 'block', fill: '#f2f3f5' }, { label: '1st order (deflected) + 0th order', showLabel: true, labelPos: 'r' }),
  ],
  detector: () => [
    mkDemo('laser', 60, 200, 0),
    mkDemo('detector', 220, 200, 0),
  ],
  cmirror: () => [
    mkDemo('laser', 60, 150, 0, { beamMode: 'beam', beamWidth: 20 }),
    mkDemo('cmirror', 220, 150, 45, { f: 100, length: 50.8 }),
    mkDemo('box', 220, 50, 0, { text: '', w: 70, h: 2, behavior: 'pass', fill: '#c9d4e0' }, { label: 'focus (f = 100 mm)', showLabel: true, labelPos: 't' }),
  ],
  cmirrorx: () => [
    mkDemo('laser', 60, 150, 0, { beamMode: 'beam', beamWidth: 20 }),
    mkDemo('cmirrorx', 220, 150, 45, { f: -100, length: 50.8 }),
    mkDemo('box', 220, 50, 0, { text: '', w: 70, h: 2, behavior: 'pass', fill: '#c9d4e0' }, { label: 'diverges — virtual focus behind mirror', showLabel: true, labelPos: 't' }),
  ],
  oap: () => [
    mkDemo('laser', 60, 300, 0, { beamMode: 'beam', beamWidth: 20 }),
    mkDemo('oap', 300, 300, 0, { f: 50, length: 80 }),
  ],
  galvo: () => [
    mkDemo('laser', 60, 200, 0),
    mkDemo('galvo', 220, 200, 45, { scanMode: 'sine', scanAmplitude: 8, scanFrequencyHz: 0.4 }),
    mkDemo('box', 220, 60, 0, { text: '', w: 200, h: 2, behavior: 'block', fill: '#f2f3f5' }, { label: 'screen — the reflected beam sweeps back and forth', showLabel: true, labelPos: 't' }),
  ],
};

// ---------- palette ----------
function buildPalette() {
  const pal = $('paletteContent');
  let h = `<div class="library-head">
    <div class="library-title-row"><span class="library-title">Component library</span><span id="libraryCount" class="library-count"></span></div>
    <div class="palette-search-wrap"><input id="paletteSearch" type="search" placeholder="Search components…" autocomplete="off" aria-label="Search components"><span class="search-shortcut">/</span></div>
    <div class="capability-legend" aria-label="Component capability legend">
      <span><i class="cap-dot simulated"></i>Simulated</span>
      <span><i class="cap-dot configurable"></i>Setup</span>
      <span><i class="cap-dot diagram"></i>Diagram</span>
    </div>
  </div><div id="paletteGroups">`;
  let total = 0;
  const initiallyOpen = new Set(['Sources', 'Mirrors', 'Lenses']);
  for (const cat of categories) {
    const entries = Object.entries(registry).filter(([, def]) => def.category === cat && !def.hidden)
      .sort((a, b) => (a[1].paletteOrder ?? 100) - (b[1].paletteOrder ?? 100));
    const drawArrowHere = cat === 'Annotations';
    if (!entries.length && !drawArrowHere) continue;
    h += `<details class="palette-group" data-category="${esc(cat)}" ${initiallyOpen.has(cat) ? 'open' : ''}>
      <summary>${esc(cat)}<span class="group-count">${entries.length + (drawArrowHere ? 1 : 0)}</span></summary><div class="catlist">`;
    if (drawArrowHere) {
      // freehand "draw arrow" tool lives here too — it's the same concept as
      // the fixed-length Arrow annotation, just drawn point-by-point
      const arrowEl = createElement('arrowann');
      const arrowDef = registry.arrowann;
      const asz = typeof arrowDef.size === 'function' ? arrowDef.size(arrowEl) : arrowDef.size;
      const avb = Math.max(asz.w, asz.h) + 12;
      const ameta = getElementMeta('arrowann', arrowEl.params);
      const adesc = 'Draw a straight or multi-point arrow: click waypoints, double-click to finish.';
      const asearch = `arrow draw beam annotation ${adesc}`.toLowerCase();
      h += `<button type="button" class="palitem" data-tool="drawarrow" data-type="arrowann" data-search="${esc(asearch)}" title="${esc(adesc)}">
        <svg viewBox="${-avb / 2} ${-avb / 2} ${avb} ${avb}">${arrowDef.svg(arrowEl)}</svg>
        <span class="pal-copy"><span class="pal-label">Arrow</span><span class="pal-desc">${esc(adesc)}</span></span>
        <i class="cap-dot ${ameta.tier}" title="${esc(ameta.status)}" aria-label="${esc(ameta.status)}"></i></button>`;
      total++;
    }
    for (const [type, def] of entries) {
      const el = createElement(type);
      const sz = typeof def.size === 'function' ? def.size(el) : (def.size_ ? def.size_(el) : def.size);
      const vb = Math.max(sz.w, sz.h) + 12;
      const meta = getElementMeta(type, el.params);
      const parameterSearch = (def.params || []).flatMap(param => [
        param.label,
        ...(param.options || []).flatMap(option => option),
      ]).join(' ');
      const search = `${def.label} ${cat} ${meta.status} ${meta.description} ${(def.aliases || []).join(' ')} ${parameterSearch}`.toLowerCase();
      h += `<button type="button" class="palitem" data-type="${type}" data-search="${esc(search)}" title="${esc(meta.description)}">
        <svg viewBox="${-vb / 2} ${-vb / 2} ${vb} ${vb}">${def.svg(el)}</svg>
        <span class="pal-copy"><span class="pal-label">${esc(def.label)}</span><span class="pal-desc">${esc(meta.description)}</span></span>
        <i class="cap-dot ${meta.tier}" title="${esc(meta.status)}" aria-label="${esc(meta.status)}"></i></button>`;
      total++;
    }
    h += `</div></details>`;
  }
  h += `</div><div id="paletteEmpty" class="palette-empty">No matching component.<br>Try a device, behavior, or category.</div>`;
  pal.innerHTML = h;
  $('libraryCount').textContent = `${total} components`;
  pal.querySelectorAll('.palitem').forEach(item => {
    if (item.dataset.tool === 'drawarrow') {
      item.addEventListener('click', () => { startBeamTool('beam'); closeMobileSheet('palette'); });
      return;
    }
    item.addEventListener('click', () => { startPlacing(item.dataset.type); closeMobileSheet('palette'); });
  });

  const search = $('paletteSearch');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    let visible = 0;
    pal.querySelectorAll('.palette-group').forEach(group => {
      let groupVisible = 0;
      group.querySelectorAll('.palitem').forEach(item => {
        const haystack = item.dataset.search;
        const words = haystack.split(/[^a-z0-9λ]+/).filter(Boolean);
        const match = !q || terms.every(term => term.length <= 3 ? words.includes(term) : haystack.includes(term));
        item.hidden = !match;
        if (match) { visible++; groupVisible++; }
      });
      group.hidden = groupVisible === 0;
      if (q && groupVisible) group.open = true;
    });
    $('libraryCount').textContent = q ? `${visible} of ${total}` : `${total} components`;
    $('paletteEmpty').classList.toggle('is-visible', visible === 0);
  });
}

function syncToolMode(detail = { mode: 'select' }) {
  const active = detail.mode !== 'select';
  const mode = $('toolMode');
  const mobileActions = $('mobileToolActions');
  const canvas = $('canvas');
  canvas.classList.toggle('tool-active', active);
  mode.classList.toggle('is-visible', active);
  mobileActions.classList.toggle('is-visible', active);
  $('mobileToolLabel').textContent = active ? `Adding ${detail.label}` : '';
  const canFinishMobileTool = detail.mode === 'beam' || detail.mode === 'fiber' || detail.mode === 'polygon';
  $('btnMobileToolDone').hidden = !canFinishMobileTool;
  document.querySelectorAll('.palitem').forEach(item => item.classList.toggle('is-active',
    ((detail.mode === 'place' || detail.mode === 'polygon') && !item.dataset.tool && item.dataset.type === detail.type) ||
    (detail.mode === 'beam' && item.dataset.tool === 'drawarrow')));
  $('btnFiber').classList.toggle('active', detail.mode === 'fiber');
  if (!active) { mode.textContent = ''; return; }
  mode.textContent = detail.mode === 'place'
    ? `Place ${detail.label} · click to drop · R rotate · Shift keeps placing · Esc cancels`
    : detail.mode === 'polygon'
      ? `${detail.label} · click corners · click first point, double-click, or Enter closes · Shift constrains · Option bypasses snap`
      : `${detail.label} · click waypoints · double-click or Enter finishes · Esc cancels`;
}

const mobileQuery = window.matchMedia('(max-width: 899px)');

function isMobileLayout() { return mobileQuery.matches; }

function syncMobileSheets() {
  const mobile = isMobileLayout();
  const paletteOpen = $('palette').classList.contains('mobile-open');
  const inspectorOpen = $('inspector').classList.contains('mobile-open');
  $('palette').inert = mobile && !paletteOpen;
  $('inspector').inert = mobile && !inspectorOpen;
  $('mobileBackdrop').hidden = !mobile || (!paletteOpen && !inspectorOpen);
}

function setMobileSheet(id, open) {
  const sheet = $(id);
  if (!isMobileLayout()) { sheet.classList.remove('mobile-open'); syncMobileSheets(); return; }
  if (open) {
    const other = id === 'palette' ? $('inspector') : $('palette');
    other.classList.remove('mobile-open');
  }
  sheet.classList.toggle('mobile-open', open);
  syncMobileSheets();
}

function closeMobileSheet(id) { setMobileSheet(id, false); }

function syncMobileSelection() {
  const properties = $('btnProperties');
  if (!properties) return;
  properties.hidden = !state.selection;
  // no keyboard on touch devices: a floating trash button stands in for
  // the Delete/Backspace shortcut whenever something is selected
  $('btnTrash').hidden = !state.selection;
}

function renderSelection(detail = {}) {
  renderInspector();
  syncToolbar();
  syncMobileSelection();
  if (isMobileLayout() && detail.openMobile === true && state.selection && state.tool === 'select') {
    setMobileSheet('inspector', true);
  }
}

// ---------- selection / deletion ----------
function deleteSelected() {
  if (state.demoMode) return;
  const s = state.selection;
  if (s?.kind === 'multi') {
    pushUndo();
    state.elements = state.elements.filter(e => !s.els.includes(e.id));
    state.beams = state.beams.filter(b => !s.beams.includes(b.id));
    state.selection = null;
    changed();
    renderInspector();
    return;
  }
  const sel = findSelected();
  if (!sel) return;
  pushUndo();
  if (state.selection.kind === 'element') state.elements = state.elements.filter(e => e.id !== sel.id);
  else state.beams = state.beams.filter(b => b.id !== sel.id);
  state.selection = null;
  changed();
  renderInspector();
}

const newId = pre => pre + Math.random().toString(36).slice(2, 9);

function duplicateSelected() {
  if (state.demoMode) return;
  const s = state.selection;
  if (s?.kind === 'multi') {
    const hasDuplicable = s.beams.length || s.els.some(id => {
      const el = state.elements.find(item => item.id === id);
      return el && !registry[el.type]?.singleton;
    });
    if (!hasDuplicable) return;
    pushUndo();
    const els = [], bms = [];
    for (const id of s.els) {
      const src = state.elements.find(e => e.id === id);
      if (!src || registry[src.type]?.singleton) continue;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = newId('e'); copy.x += 30; copy.y += 30;
      state.elements.push(copy); els.push(copy.id);
    }
    for (const id of s.beams) {
      const src = state.beams.find(b => b.id === id);
      if (!src) continue;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = newId('b');
      for (const p of copy.pts) { p.x += 30; p.y += 30; }
      state.beams.push(copy); bms.push(copy.id);
    }
    state.selection = { kind: 'multi', els, beams: bms };
    changed();
    renderInspector();
    return;
  }
  const sel = findSelected();
  if (!sel) return;
  if (state.selection.kind === 'element' && registry[sel.type]?.singleton) return;
  pushUndo();
  const copy = JSON.parse(JSON.stringify(sel));
  if (state.selection.kind === 'element') {
    copy.id = newId('e');
    copy.x += 30; copy.y += 30;
    state.elements.push(copy);
    state.selection = { kind: 'element', id: copy.id };
  } else {
    copy.id = newId('b');
    for (const p of copy.pts) { p.x += 30; p.y += 30; }
    state.beams.push(copy);
    state.selection = { kind: 'beam', id: copy.id };
  }
  changed();
  renderInspector();
}

function rotateSelected(deg) {
  if (state.demoMode) return;
  if (isPlacing()) { rotatePlacing(deg); return; }
  const sel = findSelected();
  if (!sel || state.selection.kind !== 'element') return;
  if (registry[sel.type]?.rotatable === false) return;
  pushUndo();
  sel.rot = (((sel.rot || 0) + deg) % 360 + 360) % 360;
  changed();
  renderInspector();
}

function nudgeSelected(dx, dy) {
  if (state.demoMode) return;
  const s = state.selection;
  if (s?.kind === 'multi') {
    pushUndo();
    for (const id of s.els) {
      const el = state.elements.find(e => e.id === id);
      if (el) { el.x += dx; el.y += dy; }
    }
    for (const id of s.beams) {
      const b = state.beams.find(q => q.id === id);
      if (b) for (const p of b.pts) { p.x += dx; p.y += dy; }
    }
    changed();
    return;
  }
  const sel = findSelected();
  if (!sel) return;
  pushUndo();
  if (state.selection.kind === 'element') { sel.x += dx; sel.y += dy; }
  else for (const p of sel.pts) { p.x += dx; p.y += dy; }
  changed();
}

// ---------- keyboard ----------
function bindKeys() {
  window.addEventListener('keydown', e => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const meta = e.metaKey || e.ctrlKey;

    if (e.key === '/') { e.preventDefault(); $('paletteSearch')?.focus(); return; }

    if (meta && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (isPolygonDrawing() && !e.shiftKey) undoPolygonPoint();
      else e.shiftKey ? redo() : undo();
      renderInspector();
      return;
    }
    if (meta && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (e.key === 'Escape') {
      cancelTool();
      if (state.selection) { state.selection = null; renderAll(); renderInspector(); }
      return;
    }
    if (e.key === 'Enter' && state.tool === 'beam') { finishBeam(); renderInspector(); return; }
    if (e.key === 'Enter' && isPolygonDrawing()) { e.preventDefault(); finishPolygon(); renderInspector(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      if (isPolygonDrawing()) undoPolygonPoint(); else deleteSelected();
      return;
    }
    if (e.key === 'r' || e.key === 'R') { rotateSelected(e.shiftKey ? -45 : 45); return; }
    if (e.key.toLowerCase() === 'q') { rotateSelected(-5); return; }
    if (e.key.toLowerCase() === 'e') { rotateSelected(5); return; }
    const step = e.shiftKey ? 25 : 1;
    if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeSelected(-step, 0); }
    if (e.key === 'ArrowRight') { e.preventDefault(); nudgeSelected(step, 0); }
    if (e.key === 'ArrowUp') { e.preventDefault(); nudgeSelected(0, -step); }
    if (e.key === 'ArrowDown') { e.preventDefault(); nudgeSelected(0, step); }
  });
}

// ---------- examples dropdown ----------
// Examples are plain sketch .json files under Examples/<Category>/ (the
// same format the "Save" button writes) — see tools/build-examples.mjs,
// which turns that folder into ./examples-data.js. Loading one is just a
// fetch + the same parseSketch() the "Open" button uses.
async function loadExample(index) {
  if (index === '') return;
  const ex = examples[+index];
  if (!ex) return;
  if (hasScene() && !confirm(`Load example “${ex.name}”? This replaces the current sketch (Undo brings it back).`)) return;
  try {
    const res = await fetch(ex.path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const scene = parseSketch(await res.text(), registry);
    pushUndo();
    cancelTool();
    replaceScene(scene);
    renderSelection();
    zoomFit();
  } catch (err) {
    alert('Could not load example: ' + err.message);
  }
}

function bindExamples() {
  const selects = [$('exampleSel'), $('mobileExampleSel')].filter(Boolean);
  const groups = new Map(); // group label -> <optgroup>
  examples.forEach((ex, i) => {
    for (const sel of selects) {
      const key = `${sel.id}:${ex.group}`;
      let og = groups.get(key);
      if (!og) {
        og = document.createElement('optgroup');
        og.label = ex.group || 'Examples';
        sel.appendChild(og);
        groups.set(key, og);
      }
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = ex.name;
      og.appendChild(o);
    }
  });
  selects.forEach(sel => sel.addEventListener('change', () => {
    const i = sel.value;
    sel.value = ''; // reset so the same example can be re-chosen later
    loadExample(i);
    if (sel.id === 'mobileExampleSel') $('mobileMenu').close();
  }));
}

// ---------- community dropdown ----------
// Setups shared by other users, approved by a maintainer and published under
// community-submissions/issue-<N>.json — same fetch + parseSketch() pattern as Examples,
// just a separate, unmoderated-for-pedagogy, flat list (see wiki/community/
// for the write-up per entry, with an embedded read-only preview of each).
async function loadCommunity(index) {
  if (index === '') return;
  const entry = community[+index];
  if (!entry) return;
  if (hasScene() && !confirm(`Load “${entry.name}” from the community? This replaces the current sketch (Undo brings it back).`)) return;
  try {
    const res = await fetch(entry.path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const scene = parseSketch(JSON.stringify(data.scene), registry);
    pushUndo();
    cancelTool();
    replaceScene(scene);
    renderSelection();
    zoomFit();
  } catch (err) {
    alert('Could not load this community setup: ' + err.message);
  }
}

function bindCommunity() {
  const selects = [$('communitySel'), $('mobileCommunitySel')].filter(Boolean);
  community.forEach((entry, i) => {
    for (const sel of selects) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = entry.name;
      sel.appendChild(o);
    }
  });
  selects.forEach(sel => sel.addEventListener('change', () => {
    const i = sel.value;
    sel.value = '';
    loadCommunity(i);
    if (sel.id === 'mobileCommunitySel') $('mobileMenu').close();
  }));
}

// ---------- toolbar ----------
const hasScene = () => state.elements.length > 0 || state.beams.length > 0;

function syncToolbar() {
  $('btnUndo').disabled = !canUndo();
  $('btnRedo').disabled = !canRedo();
  $('btnPropose').disabled = !hasScene();
  if ($('btnMobilePropose')) $('btnMobilePropose').disabled = !hasScene();
  for (const [id, pressed] of [['btnGrid', state.showGrid], ['btnSnap', state.snap], ['btnFocal', state.showFocal]]) {
    const button = $(id);
    button.classList.toggle('active', pressed);
    button.setAttribute('aria-pressed', String(pressed));
  }
  syncViewControls();
  syncMobileSelection();
}

function syncViewControls(detail = getViewportDetail()) {
  const readout = $('zoomReadout');
  if (readout) {
    readout.textContent = `${Math.round(detail.zoom * 100)}% · ${detail.step} mm grid`;
    readout.title = `Zoom ${Math.round(detail.zoom * 100)}% — grid spacing is ${detail.step} mm`;
  }
  const scaleBarMm = detail.step * 2;
  const scaleBarLine = $('scaleBarLine');
  const scaleBarLabel = $('scaleBarLabel');
  if (scaleBarLine && scaleBarLabel) {
    scaleBarLine.style.width = `${Math.max(1, scaleBarMm * detail.zoom)}px`;
    scaleBarLabel.textContent = `${scaleBarMm} mm`;
  }
  const snap = $('btnSnap');
  if (!snap) return;
  const description = detail.snap
    ? `Snap to ${detail.step} mm ${detail.level === 'table' ? 'table-hole' : 'fine'} grid; Option bypasses snapping`
    : 'Snapping is off';
  snap.title = description;
  snap.setAttribute('aria-label', description);
}

function syncPulseControls(detail = getPulsePlayback()) {
  const controls = $('pulseControls');
  if (!controls) return;
  controls.classList.toggle('is-idle', !detail.hasPulses);
  const play = $('btnPulsePlay');
  play.textContent = detail.playing ? 'Ⅱ' : '▶';
  play.title = detail.playing ? 'Pause pulse animation' : 'Play pulse animation';
  play.setAttribute('aria-label', play.title);
  play.setAttribute('aria-pressed', String(detail.playing && detail.hasPulses));
  play.classList.toggle('active', detail.playing && detail.hasPulses);
  $('pulseDisplay').value = detail.mode;
  $('pulseSpeed').value = String(detail.speedNsPerSecond);
  $('pulseScaleNote').textContent = detail.mode === 'physical'
    ? 'spacing physical · packets enlarged'
    : 'packets schematic · timing physical';
}

function bindToolbar() {
  let shareUrl = '', shareQrSvg = '';
  const closeShare = () => $('shareDialog').close();
  $('shareClose').addEventListener('click', closeShare);
  $('shareDialog').addEventListener('click', event => { if (event.target === $('shareDialog')) closeShare(); });
  $('shareCopy').addEventListener('click', async () => {
    await copyText(shareUrl);
    $('shareCopy').textContent = 'Copied!';
    setTimeout(() => { $('shareCopy').textContent = 'Copy link'; }, 1600);
  });
  $('shareDownloadQR').addEventListener('click', () => download(
    'opticalsetup-qr.svg',
    shareQrSvg,
    'image/svg+xml',
  ));
  const proposalDialog = $('proposalDialog');
  const proposalForm = $('proposalForm');
  const closeProposal = () => proposalDialog.close();
  $('proposalClose').addEventListener('click', closeProposal);
  $('proposalCancel').addEventListener('click', closeProposal);
  proposalDialog.addEventListener('click', event => { if (event.target === proposalDialog) closeProposal(); });
  $('btnPropose').addEventListener('click', () => {
    if (!hasScene()) return;
    proposalForm.reset();
    $('proposalError').hidden = true;
    proposalDialog.showModal();
    $('proposalName').focus();
  });
  proposalForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!proposalForm.reportValidity()) return;
    const submit = $('proposalSubmit');
    const error = $('proposalError');
    submit.disabled = true;
    submit.textContent = 'Preparing setup…';
    error.hidden = true;
    try {
      const sketch = serialize();
      parseSketch(sketch, registry);
      const svg = buildSVG();
      if (/\b(?:NaN|Infinity)\b/.test(svg)) throw new Error('The setup contains invalid geometry');
      const setupURL = await buildShareURL(sketch, 'https://opticalsetup.com/sketch/');
      const issueURL = buildExampleProposalIssueURL({
        name: $('proposalName').value,
        description: $('proposalDescription').value,
        reference: $('proposalReference').value,
        shareURL: setupURL,
      });
      window.location.assign(issueURL);
    } catch (err) {
      error.textContent = err.message || 'Could not prepare the GitHub proposal.';
      error.hidden = false;
      submit.disabled = false;
      submit.innerHTML = 'Continue on GitHub <span aria-hidden="true">↗</span>';
    }
  });
  $('btnNew').addEventListener('click', () => {
    if (!hasScene()) { cancelTool(); return; }
    if (!confirm('Clear the current sketch? (Undo brings it back.)')) return;
    pushUndo();
    cancelTool();
    state.elements = []; state.beams = []; state.selection = null;
    changed(); renderInspector();
  });
  $('btnOpen').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const scene = parseSketch(await f.text(), registry);
      if (hasScene() && !confirm(`Open “${f.name}”? This replaces the current sketch (Undo brings it back).`)) return;
      pushUndo();
      cancelTool();
      replaceScene(scene);
      renderInspector(); zoomFit();
    } catch (err) {
      alert('Could not open file: ' + err.message);
    } finally {
      e.target.value = '';
    }
  });
  $('btnSave').addEventListener('click', () => download('optical-setup.json', serialize(), 'application/json'));
  $('btnShare').addEventListener('click', async () => {
    const button = $('btnShare');
    button.disabled = true;
    try {
      const url = await buildShareURL(serialize());
      history.replaceState(null, '', url);
      // The auto-copy is best-effort: restrictive clipboard permissions must
      // not block the dialog, which offers its own Copy button and a
      // selectable URL field as the fallback.
      let copied = true;
      try { await copyText(url); } catch (_) { copied = false; }
      shareUrl = url;
      shareQrSvg = qrSVG(url);
      $('shareURL').value = url;
      $('shareQR').innerHTML = shareQrSvg;
      $('shareQRNote').textContent = 'Scan to open this exact optical setup.';
      $('shareDialog').showModal();
      if (copied) {
        button.textContent = 'Copied!';
        setTimeout(() => { button.textContent = 'Share'; }, 1600);
      }
    } catch (err) {
      alert('Could not create share link: ' + err.message);
    } finally {
      button.disabled = false;
    }
  });
  $('btnSVG').addEventListener('click', exportSVG);
  $('btnPNG').addEventListener('click', () => exportPNG(3));
  $('btnUndo').addEventListener('click', () => { undo(); renderInspector(); });
  $('btnRedo').addEventListener('click', () => { redo(); renderInspector(); });
  $('btnFiber').addEventListener('click', () => startBeamTool('fiber'));
  $('btnGrid').addEventListener('click', () => { state.showGrid = !state.showGrid; syncToolbar(); renderAll(); });
  $('btnSnap').addEventListener('click', () => { state.snap = !state.snap; syncToolbar(); });
  $('btnFocal').addEventListener('click', () => { state.showFocal = !state.showFocal; syncToolbar(); renderAll(); });
  $('btnZoomIn').addEventListener('click', () => zoomBy(1.25));
  $('btnZoomOut').addEventListener('click', () => zoomBy(0.8));
  $('btnZoomFit').addEventListener('click', zoomFit);
  $('btnPulsePlay').addEventListener('click', () => setPulsePlaying(!getPulsePlayback().playing));
  $('btnPulseReset').addEventListener('click', resetPulseTime);
  $('pulseDisplay').addEventListener('change', e => setPulseDisplayMode(e.target.value));
  $('pulseSpeed').addEventListener('change', e => setPulseSpeed(parseFloat(e.target.value)));

  const mobileMenu = $('mobileMenu');
  $('btnMobileMenu').addEventListener('click', () => mobileMenu.showModal());
  $('mobileMenuClose').addEventListener('click', () => mobileMenu.close());
  mobileMenu.addEventListener('click', event => { if (event.target === mobileMenu) mobileMenu.close(); });
  mobileMenu.querySelectorAll('[data-mobile-action]').forEach(button => {
    button.addEventListener('click', () => {
      const target = {
        new: 'btnNew', open: 'btnOpen', save: 'btnSave', share: 'btnShare', propose: 'btnPropose', svg: 'btnSVG', png: 'btnPNG',
      }[button.dataset.mobileAction];
      $(target)?.click();
      mobileMenu.close();
    });
  });

  $('btnAdd').addEventListener('click', () => setMobileSheet('palette', true));
  $('btnProperties').addEventListener('click', () => setMobileSheet('inspector', true));
  $('btnTrash').addEventListener('click', () => { deleteSelected(); renderSelection(); });
  $('closePalette').addEventListener('click', () => closeMobileSheet('palette'));
  $('closeInspector').addEventListener('click', () => closeMobileSheet('inspector'));
  $('mobileBackdrop').addEventListener('click', () => {
    closeMobileSheet('palette');
    closeMobileSheet('inspector');
  });
  $('btnMobileToolCancel').addEventListener('click', cancelTool);
  $('btnMobileToolDone').addEventListener('click', () => {
    if (state.tool === 'beam') finishBeam();
    else if (isPolygonDrawing()) finishPolygon();
    renderSelection();
  });
}

function bindContextMenu() {
  const menu = $('contextMenu');
  const wrap = $('canvasWrap');
  const hide = () => { menu.hidden = true; };
  document.addEventListener('optics:contextmenu', event => {
    const detail = event.detail;
    if (!detail || state.demoMode) { hide(); return; }
    const rect = wrap.getBoundingClientRect();
    const rotate = menu.querySelector('[data-action="rotate"]');
    const duplicate = menu.querySelector('[data-action="duplicate"]');
    if (rotate) rotate.hidden = detail.kind !== 'element' || !detail.rotatable;
    if (duplicate) duplicate.hidden = detail.duplicable === false;
    menu.hidden = false;
    const width = menu.offsetWidth || 178, height = menu.offsetHeight || 116;
    menu.style.left = `${Math.max(6, Math.min(rect.width - width - 6, detail.clientX - rect.left))}px`;
    menu.style.top = `${Math.max(6, Math.min(rect.height - height - 6, detail.clientY - rect.top))}px`;
    menu.querySelector('[data-action="duplicate"]')?.focus({ preventScroll: true });
  });
  menu.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    hide();
    if (action === 'duplicate') duplicateSelected();
    else if (action === 'rotate') rotateSelected(45);
    else if (action === 'delete') deleteSelected();
  });
  window.addEventListener('pointerdown', event => { if (!menu.hidden && !menu.contains(event.target)) hide(); }, true);
  window.addEventListener('blur', hide);
  menu.addEventListener('keydown', event => {
    const buttons = [...menu.querySelectorAll('[data-action]:not([hidden])')];
    const index = buttons.indexOf(document.activeElement);
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); hide();
      document.querySelector('#opticsCanvas')?.focus({ preventScroll: true });
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      buttons[(index + delta + buttons.length) % buttons.length]?.focus();
    }
  });
}

// inspector panel buttons dispatch these
document.addEventListener('optics:delete', deleteSelected);
document.addEventListener('optics:duplicate', duplicateSelected);
document.addEventListener('optics:toolchange', e => syncToolMode(e.detail));
document.addEventListener('optics:pulsestate', e => syncPulseControls(e.detail));
document.addEventListener('optics:viewchange', e => syncViewControls(e.detail));

// ---------- boot ----------
window.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(location.search);
  const demoType = params.get('demo');
  const communitySlug = params.get('community');
  const isTypeDemo = Boolean(demoType && registry[demoType] && !registry[demoType].hidden);
  const isCommunityDemo = Boolean(!isTypeDemo && communitySlug);
  const isDemo = isTypeDemo || isCommunityDemo;

  initCanvas($('canvas'), $('status'));
  initInspector($('inspectorContent'));
  if (isDemo) {
    state.demoMode = true;
    document.body.classList.add('demo-mode');
  } else {
    buildPalette();
  }
  syncToolMode();
    bindToolbar();
    bindContextMenu();
  if (!isDemo) { bindExamples(); bindCommunity(); }
  bindKeys();
  setSelectionCallback(renderSelection);
  onChange(() => { renderAll(); syncToolbar(); refreshMeasurements(); });

  if (isTypeDemo) {
    // Wiki embed: a small fixed scene — a light source plus the showcased
    // component, so its actual optical function is visible — with no way
    // to add/move/delete anything. See state.demoMode call sites in this
    // file and canvas.js for what's disabled.
    const build = demoScenes[demoType];
    const sceneElements = build ? build() : [createElement(demoType, 0, 0)];
    state.elements.push(...sceneElements);
    const hero = sceneElements.find(e => e.type === demoType) || sceneElements[0];
    state.selection = { kind: 'element', id: hero.id };
  } else if (isCommunityDemo) {
    // Community embed: the actual submitted scene, locked the same way as a
    // wiki demo (state.demoMode), but with no single "hero" element — the
    // whole setup is there to click through, not one component to focus on.
    try {
      const entry = community.find(e => e.slug === communitySlug);
      if (!entry) throw new Error('Unknown community setup');
      const res = await fetch(entry.path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const scene = parseSketch(JSON.stringify(data.scene), registry);
      state.elements.push(...scene.elements);
      state.beams.push(...scene.beams);
    } catch (err) {
      console.error('Could not load community setup:', err);
    }
  } else {
    let sharedScene = null;
    try {
      const sharedText = await sharedSceneFromURL();
      if (sharedText) sharedScene = parseSketch(sharedText, registry);
    } catch (err) {
      alert('Could not open shared sketch: ' + err.message);
    }

    if (sharedScene) {
      replaceScene(sharedScene, { resetHistory: true });
      zoomFit();
    } else if (!loadAutosave(registry)) {
      // starter scene: laser -> lens -> beamsplitter -> two detection arms
      const mk = (t, x, y, rot = 0, params = {}, label = '') => {
        const e = createElement(t, x, y); e.rot = rot; Object.assign(e.params, params);
        if (label) { e.label = label; e.showLabel = true; }
        return e;
      };
      state.elements.push(
        mk('laser', 75, 200, 0, { wavelength: 488 }, 'Laser 488 nm'),
        mk('lens', 275, 200, 0, { f: 150 }, 'f = 150 mm'),
        mk('bs', 425, 200, 0),
        mk('mirror', 625, 200, 135),
        mk('filter', 625, 330, 90, { ftype: 'bandpass', center: 488, band: 20 }),
        mk('detector', 625, 430, 90, {}, 'PD'),
        mk('dichroic', 425, 75, 45, { dtype: 'longpass', cutoff: 550 }),
        mk('pmt', 600, 75, 0, {}, 'PMT'),
      );
    }
  }
  renderAll();
  renderSelection();
  syncToolbar();
  syncPulseControls();
  syncMobileSheets();

  if (isDemo) {
    zoomFit();
  } else {
    // Deep link from the wiki ("Open in the canvas" on a component page):
    // ?place=<type> arms the placement tool for that component on load.
    const placeType = params.get('place');
    if (placeType && registry[placeType] && !registry[placeType].hidden) {
      startPlacing(placeType);
    }
  }
  window.addEventListener('resize', () => {
    renderAll();
    if (!isMobileLayout()) {
      $('palette').classList.remove('mobile-open');
      $('inspector').classList.remove('mobile-open');
    }
    syncMobileSheets();
  });
});
