// App bootstrap: palette, toolbar, keyboard shortcuts.

import { state, changed, onChange, pushUndo, undo, redo, canUndo, canRedo, findSelected, serialize, parseSketch, replaceScene, loadAutosave } from './state.js';
import { registry, categories, createElement, getElementMeta } from './elements.js';
// Registers the redesigned detector catalogue, the Etalon, and the VIPA
// element onto `registry`. Imported here, not from pwa.js: service-worker
// registration is unrelated, and every Node entry point that validates
// scenes must install the same catalogues (see tools/build-examples.mjs,
// tools/build-community.mjs and scripts/materialize-example-proposal.mjs)
// so the browser and the tooling never disagree about which element types
// exist.
import './detector-instruments.js';
import './etalon.js';
import './vipa.js';
import {
  initCanvas, renderAll, startPlacing, startBeamTool, cancelTool, isPlacing,
  isPolygonDrawing, rotatePlacing, finishBeam, finishPolygon, undoPolygonPoint,
  getViewportDetail, zoomBy, zoomFit, setSelectionCallback, setMeasurementsCallback,
  getPulsePlayback, setPulsePlaying, setPulseSpeed, setMechanicsMode, setPulseDisplayMode, resetPulseTime, clearVoxelPreview,
} from './canvas.js';
import { initInspector, renderInspector, refreshMeasurements } from './inspector.js';
import { buildSVG, exportSVG, exportPNG, exportGIF } from './export.js';
import { examples } from './examples-data.js';
import { community } from './community-data.js';
import { download, esc, manualBeamSVG } from './util.js';
import { buildShareURL, copyText, sharedSceneFromURL } from './share.js';
import { qrSVG } from './qr.js';
import { buildExampleProposalIssueURL } from './proposal.js';
import { recommendedTimeScale, TIME_SCALES, elementDriveHz } from './timescale.js';
import { initTheme } from './theme.js';
import { APP_RELEASE } from './release.js';

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
    mkDemo('cwlaser', 60, 150, 0),
    mkDemo('mirror', 220, 150, 45, { length: 50.8 }),
  ],
  lens: () => [
    mkDemo('cwlaser', 60, 220, 0, { beamMode: 'beam', beamWidth: 20 }),
    mkDemo('lens', 220, 220, 0, { f: 100, dia: 40 }),
    mkDemo('box', 320, 220, 0, { text: '', w: 2, h: 60, behavior: 'block', fill: '#c9d4e0' }, { label: 'focus (f = 100 mm)', showLabel: true, labelPos: 't' }),
  ],
  lensc: () => [
    mkDemo('cwlaser', 60, 220, 0, { beamMode: 'beam', beamWidth: 20 }),
    mkDemo('lensc', 220, 220, 0, { f: -100, dia: 40 }),
    mkDemo('box', 340, 220, 0, { text: '', w: 2, h: 2, behavior: 'pass', fill: '#c9d4e0' }, { label: 'diverges — virtual image on the source side', showLabel: true, labelPos: 't' }),
  ],
  thicklens: () => [
    mkDemo('cwlaser', 60, 220, 0, { wavelength: 532, beamMode: 'beam', beamWidth: 48 }),
    mkDemo('thicklens', 240, 220, 0, {
      r1: 60, r2: -60, thickness: 12, dia: 50.8, glass: 'nbk7', transmission: 1,
    }, { label: 'f/1.2 spherical singlet', showLabel: true, labelPos: 't' }),
    mkDemo('box', 370, 220, 0, { text: '', w: 4, h: 110, behavior: 'block', fill: '#f2f3f5' }, {
      label: 'screen beyond the caustic', showLabel: true, labelPos: 'r',
    }),
  ],
  telescope: () => [
    mkDemo('cwlaser', 60, 300, 0, { beamMode: 'beam', beamWidth: 10 }),
    mkDemo('telescope', 280, 300, 0, { f1: 50, f2: 150, dia: 50.8 }),
    mkDemo('box', 460, 300, 0, { text: '', w: 2, h: 2, behavior: 'pass', fill: '#c9d4e0' }, { label: 'still parallel — 3× wider', showLabel: true, labelPos: 't' }),
  ],
  objective: () => [
    // The beam is sized to fill the 2fNA back pupil exactly, so the demo shows
    // the objective working at its full rated NA — narrow the laser and the
    // inspector's effective-NA readout drops with it.
    mkDemo('cwlaser', 60, 300, 0, { beamMode: 'beam', beamWidth: 24 }),
    mkDemo('objective', 300, 300, 0, { efl: 10, immersion: 'oil', na: 1.2 }),
    mkDemo('sample', 329, 300, 90, {}, { label: '20× · NA 1.20 · oil', showLabel: true, labelPos: 't' }),
  ],
  bs: () => [
    mkDemo('cwlaser', 60, 200, 0),
    mkDemo('bs', 220, 200, 0, { ratio: 0.5 }),
    mkDemo('detector', 380, 200, 0, {}, { label: 'transmitted', showLabel: true }),
    mkDemo('detector', 220, 60, -90, {}, { label: 'reflected', showLabel: true, labelPos: 'l' }),
  ],
  dichroic: () => [
    mkDemo('cwlaser', 60, 220, 0, { wavelength: 650 }, { label: '650 nm', showLabel: true }),
    mkDemo('cwlaser', 260, 60, 90, { wavelength: 450 }, { label: '450 nm', showLabel: true, labelPos: 'l' }),
    mkDemo('dichroic', 260, 220, -45, { length: 50.8 }, { label: 'Long pass 550 nm', showLabel: true, labelPos: 'r' }),
    mkDemo('textlabel', 90, 330, 0, {
      text: 'Reflects any wavelength below 550 nm, transmits any wavelength above 550 nm.', fontSize: 12,
    }),
  ],
  filter: () => [
    mkDemo('pulsedlaser', 40, 200, 0, { wavelength: 532, transformLimited: false, bandwidth: 10, showPulse: false }, { label: '532 nm laser with 10 nm bandwidth', showLabel: true }),
    mkDemo('probe', 150, 200, 0, { prop: 'spectrum' }),
    mkDemo('filter', 260, 200, 0, { ftype: 'bandpass', center: 532, band: 2 }, { label: '532 - 2 nm bandpass filter', showLabel: true }),
    mkDemo('probe', 370, 200, 0, { prop: 'spectrum' }),
    mkDemo('detector', 460, 200, 0),
  ],
  etalon: () => [
    mkDemo('pulsedlaser', 40, 200, 0, { wavelength: 532, transformLimited: false, bandwidth: 60, showPulse: false }, { label: '532 nm laser with 60 nm bandwidth', showLabel: true }),
    mkDemo('probe', 150, 200, 0, { prop: 'spectrum' }),
    mkDemo('etalon', 260, 200, 0, { fsr: 8 }, { label: '532 nm etalon, 8 nm FSR', showLabel: true }),
    mkDemo('probe', 370, 200, 0, { prop: 'spectrum' }),
    mkDemo('detector', 460, 200, 0),
  ],
  vipa: () => [
    mkDemo('pulsedlaser', 30, 200, 0, { wavelength: 532, transformLimited: false, bandwidth: 60, beamMode: 'line', showPulse: false }, { label: '532 nm laser with 60 nm bandwidth', showLabel: true }),
    mkDemo('probe', 120, 200, 0, { prop: 'spectrum' }),
    mkDemo('vipa', 250, 192.65, 0, {
      fsr: 0.002, bandwidth: 0.00185, tilt: 12, windowSize: 1.5, aperture: 90,
    }, { label: 'VIPA — same spectrum leaks out at different points', showLabel: true, labelPos: 't' }),
    mkDemo('box', 460, 200, 0, { text: '', w: 10, h: 200, behavior: 'block', fill: '#f2f3f5' }, { label: 'screen — one input beam, many spatially fanned-out outputs', showLabel: true, labelPos: 'r' }),
  ],
  prism: () => [
    mkDemo('sclaser', 60, 200, 0, { scMin: 400, scMax: 700, showPulse: false }),
    mkDemo('prism', 220, 206, 0, { apex: 55, psize: 50 }),
    mkDemo('box', 480, 405, 0, { text: '', w: 10, h: 150, behavior: 'block', fill: '#f2f3f5' }, { label: 'screen', showLabel: true, labelPos: 'r' }),
  ],
  grating: () => [
    mkDemo('sclaser', 60, 200, 0, { scMin: 400, scMax: 700, showPulse: false }),
    mkDemo('grating', 220, 200, 0, { orders: '-1,0,1', transmissive: true }),
    mkDemo('box', 340, 200, 0, { text: '', w: 10, h: 260, behavior: 'block', fill: '#f2f3f5' }, { label: 'screen', showLabel: true, labelPos: 'r' }),
  ],
  freeglass: () => [
    mkDemo('cwlaser', 40, 200, 0, { wavelength: 550, beamMode: 'line' }),
    mkDemo('freeglass', 230, 205, 20, { scale: 1.6, ior: 2 }),
    mkDemo('box', 430, 200, 0, { text: '', w: 10, h: 160, behavior: 'block', fill: '#f2f3f5' }, { label: 'screen — beam bends at entry and exit', showLabel: true, labelPos: 'r' }),
  ],
  diffuser: () => [
    mkDemo('cwlaser', 60, 200, 0),
    mkDemo('diffuser', 220, 200, 0, { div: 18 }),
    mkDemo('box', 420, 200, 0, { text: '', w: 10, h: 220, behavior: 'block', fill: '#f2f3f5' }, { label: 'screen — scattered into a cone', showLabel: true, labelPos: 'r' }),
  ],
  glassrod: () => [
    mkDemo('pulsedlaser', 30, 200, 0, {
      repRateMHz: 80, pulseWidthFs: 100,
    }, { label: 'pulsed laser', showLabel: true }),
    mkDemo('glassrod', 220, 200, 0, { rodlen: 100, ior: 2.3 }, { label: 'n = 2.3 — watch the packet lag inside', showLabel: true, labelPos: 't' }),
  ],
  polarizer: () => [
    mkDemo('cwlaser', 60, 200, 0, { pol: 0 }),
    mkDemo('probe', 150, 200, 0, { prop: 'pol' }),
    mkDemo('polarizer', 240, 200, 0, { pangle: 90 }),
    mkDemo('detector', 360, 200, 0, {}, { label: 'transmitted power', showLabel: true }),
  ],
  aom: () => [
    mkDemo('pulsedlaser', 60, 200, 0, {
      repRateMHz: 80, pulseWidthFs: 100,
    }),
    mkDemo('aom', 220, 200, 0, {
      deflect: 15, rfMHz: 80, zero: true, eff: 1,
      modulate: true, modShape: 'square', modFreqMHz: 40,
    }),
    mkDemo('box', 370, 200, 0, { text: '', w: 10, h: 90, behavior: 'block', fill: '#f2f3f5' }, { label: '1st order (deflected) + 0th order', showLabel: true, labelPos: 'r' }),
  ],
  detector: () => [
    mkDemo('cwlaser', 60, 200, 0),
    mkDemo('detector', 220, 200, 0),
  ],
  cmirror: () => [
    mkDemo('cwlaser', 60, 150, 0, { beamMode: 'beam', beamWidth: 20 }),
    mkDemo('cmirror', 220, 150, 45, { f: 100, length: 50.8 }),
    mkDemo('box', 220, 50, 0, { text: '', w: 70, h: 2, behavior: 'pass', fill: '#c9d4e0' }, { label: 'focus (f = 100 mm)', showLabel: true, labelPos: 't' }),
  ],
  cmirrorx: () => [
    mkDemo('cwlaser', 60, 150, 0, { beamMode: 'beam', beamWidth: 20 }),
    mkDemo('cmirrorx', 220, 150, 45, { f: -100, length: 50.8 }),
    mkDemo('box', 220, 50, 0, { text: '', w: 70, h: 2, behavior: 'pass', fill: '#c9d4e0' }, { label: 'diverges — virtual focus behind mirror', showLabel: true, labelPos: 't' }),
  ],
  oap: () => [
    mkDemo('cwlaser', 60, 300, 0, { beamMode: 'beam', beamWidth: 20 }),
    mkDemo('oap', 300, 300, 0, { f: 50, length: 80 }),
  ],
  galvo: () => [
    mkDemo('cwlaser', 60, 200, 0),
    mkDemo('galvo', 220, 200, 45, { scanMode: 'sine', scanAmplitude: 8, scanFrequencyHz: 0.4 }),
    mkDemo('box', 220, 60, 0, { text: '', w: 200, h: 2, behavior: 'block', fill: '#f2f3f5' }, { label: 'screen — the reflected beam sweeps back and forth', showLabel: true, labelPos: 't' }),
  ],
  retroreflector: () => [
    mkDemo('cwlaser', 60, 145, 0),
    mkDemo('retroreflector', 260, 160, 0, {
      length: 50.8, moveMode: 'linear', travel: 50, freqHz: 0.15,
    }, { label: 'slides only away from the laser — round-trip path only ever gets longer', showLabel: true, labelPos: 'b' }),
  ],
};

// ---------- palette ----------
const FIBER_TOOLS = [
  { tool: 'fiber', label: 'Fiber', desc: 'Draw an optical fiber patch cable: click waypoints, double-click to finish.', bare: false },
  { tool: 'barefiber', label: 'Bare fiber', desc: 'Draw a bare optical fiber, without connectors: click waypoints, double-click to finish.', bare: true },
];
const FIBER_ICON_PTS = [{ x: -15, y: 7 }, { x: 0, y: -7 }, { x: 15, y: 7 }];
const FIBER_ICON_VB = 44;

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
    const drawFiberHere = cat === 'Fibers';
    if (!entries.length && !drawArrowHere && !drawFiberHere) continue;
    h += `<details class="palette-group" data-category="${esc(cat)}" ${initiallyOpen.has(cat) ? 'open' : ''}>
      <summary>${esc(cat)}<span class="group-count">${entries.length + (drawArrowHere ? 1 : 0) + (drawFiberHere ? FIBER_TOOLS.length : 0)}</span></summary><div class="catlist">`;
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
    if (drawFiberHere) {
      // Both are draw-point tools, not placeable registry elements — same
      // pattern as the Arrow tool above. Bare fiber shares every physics
      // param with the connectorized one; only the drawn graphic differs
      // (see manualBeamSVG's `bare` branch), so both icons are rendered by
      // that same function for a real preview, not a hand-drawn stand-in.
      for (const ft of FIBER_TOOLS) {
        const iconBeam = { kind: 'fiber', pts: FIBER_ICON_PTS, color: '#e8a800', width: 4, bare: ft.bare };
        const fsearch = `fiber optical patch cable ${ft.bare ? 'bare no connector flat termination' : 'connector'} ${ft.desc}`.toLowerCase();
        h += `<button type="button" class="palitem" data-tool="${ft.tool}" data-search="${esc(fsearch)}" title="${esc(ft.desc)}">
          <svg viewBox="${-FIBER_ICON_VB / 2} ${-FIBER_ICON_VB / 2} ${FIBER_ICON_VB} ${FIBER_ICON_VB}">${manualBeamSVG(iconBeam)}</svg>
          <span class="pal-copy"><span class="pal-label">${esc(ft.label)}</span><span class="pal-desc">${esc(ft.desc)}</span></span>
          <i class="cap-dot simulated" title="Simulated" aria-label="Simulated"></i></button>`;
        total++;
      }
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
    if (item.dataset.tool === 'fiber' || item.dataset.tool === 'barefiber') {
      item.addEventListener('click', () => { startBeamTool(item.dataset.tool); closeMobileSheet('palette'); });
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
  const construction = detail.type ? registry[detail.type]?.construction : null;
  const mode = $('toolMode');
  const mobileActions = $('mobileToolActions');
  const canvas = $('canvas');
  canvas.classList.toggle('tool-active', active);
  mode.classList.toggle('is-visible', active);
  mobileActions.classList.toggle('is-visible', active);
  $('mobileToolLabel').textContent = active ? `Adding ${detail.label}` : '';
  const canFinishMobileTool = detail.mode === 'beam' || detail.mode === 'fiber' || detail.mode === 'barefiber' || detail.mode === 'polygon';
  $('btnMobileToolDone').hidden = !canFinishMobileTool;
  document.querySelectorAll('.palitem').forEach(item => item.classList.toggle('is-active',
    ((detail.mode === 'place' || detail.mode === 'polygon') && !item.dataset.tool && item.dataset.type === detail.type) ||
    (detail.mode === 'beam' && item.dataset.tool === 'drawarrow') ||
    (detail.mode === 'fiber' && item.dataset.tool === 'fiber') ||
    (detail.mode === 'barefiber' && item.dataset.tool === 'barefiber')));
  if (!active) { mode.textContent = ''; return; }
  mode.textContent = detail.mode === 'place'
    ? `Place ${detail.label} · click to drop · R rotate · Shift keeps placing · Esc cancels`
    : detail.mode === 'polygon'
      ? construction?.circularArcs
        ? `${detail.label} · click straight anchors · press-drag curves · click first point, double-click, or Enter closes · Option bypasses snap`
        : `${detail.label} · click corners · click first point, double-click, or Enter closes · Shift constrains · Option bypasses snap`
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
    renderInspector();
    return;
  }
  const sel = findSelected();
  if (!sel) return;
  pushUndo();
  if (state.selection.kind === 'element') { sel.x += dx; sel.y += dy; }
  else for (const p of sel.pts) { p.x += dx; p.y += dy; }
  changed();
  // Geometry-derived inspector hints (notably objective immersion coupling)
  // must follow keyboard movement as closely as the canvas itself does.
  renderInspector();
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
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = ex.name;
      // No group: a plain top-level option, not nested in any optgroup —
      // it stays outside every category, including ones added later.
      if (!ex.group) { sel.appendChild(o); continue; }
      const key = `${sel.id}:${ex.group}`;
      let og = groups.get(key);
      if (!og) {
        og = document.createElement('optgroup');
        og.label = ex.group;
        sel.appendChild(og);
        groups.set(key, og);
      }
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
  $('pulseSpeed').value = detail.mechanicsMode ? 'mechanics' : String(detail.speedNsPerSecond);
  $('pulseScaleNote').textContent = detail.mechanicsMode
    ? 'mechanics illustrative · pulses not synced'
    : detail.cwFallback
      ? 'shown as CW · pulse rate far from time scale'
      : detail.mode === 'physical'
        ? 'spacing physical · packets enlarged'
        : 'packets schematic · timing physical';
}

// Re-pick the canvas time scale when the scene's slowest animated element
// changes tier, so a kHz source or a piezo stage is watchable without the
// user hunting through the dropdown. Only ever fires when the scale would
// actually change, and never overrides a scale the user set by hand for the
// same scene shape.
let lastAutoScale = null; // a number (ns/s), the string 'mechanics', or null (never adjusted)
let userChoseScale = false;
function autoAdjustTimeScale() {
  const recommended = recommendedTimeScale(state.elements);
  if (!recommended) return;
  const key = recommended.mechanics ? 'mechanics' : recommended.scaleNsPerSecond;
  if (key === lastAutoScale) return;
  if (userChoseScale) return;
  const previous = lastAutoScale;
  lastAutoScale = key;
  if (previous === null && key === 10) return; // already the default
  const label = recommended.mechanics ? 'Mechanics' : (TIME_SCALES.find(s => s.ns === key) || {}).label || '';
  if (recommended.mechanics) setMechanicsMode(true);
  else setPulseSpeed(recommended.scaleNsPerSecond);
  showToast(`Time scale automatically adjusted to ${label} to show the animation${recommended.driver ? ` of ${recommended.driver}` : ''}.`);
}

// Small popup anchored above a specific element (screen coordinates) — used
// both for the pulse-representation switch and the illustrative-motion
// notice below.
let anchoredPopupTimer = null;
function showAnchoredPopup({ message, x, y } = {}) {
  const popup = $('pulseModePopup');
  if (!popup || !message) return;
  popup.textContent = message;
  popup.style.left = `${Math.round(x)}px`;
  popup.style.top = `${Math.round(y - 26)}px`;
  popup.hidden = false;
  popup.classList.add('is-visible');
  clearTimeout(anchoredPopupTimer);
  anchoredPopupTimer = setTimeout(() => {
    popup.classList.remove('is-visible');
    anchoredPopupTimer = setTimeout(() => { popup.hidden = true; }, 250);
  }, 3000);
}

// The piezo stage and the retroreflector's delay-line motion are excluded
// from every time-scale sync — they always run on an illustrative wall
// clock (see canvas.js). Warn once per element, the moment it actually
// starts moving, so that isn't mistaken for a real timing bug.
const warnedIllustrativeIds = new Set();
function announceIllustrativeMotion() {
  for (const el of state.elements) {
    if (el.type !== 'stage' && el.type !== 'retroreflector') continue;
    if (warnedIllustrativeIds.has(el.id)) continue;
    if (elementDriveHz(el) === null) continue; // not actually moving yet
    warnedIllustrativeIds.add(el.id);
    const v = state.view;
    showAnchoredPopup({
      message: 'Animation timescale is illustrative only, not physically accurate.',
      x: el.x * v.z + v.x,
      y: el.y * v.z + v.y,
    });
  }
}

// Shared top-center toast — originally built for the auto time-scale
// notice, now a general-purpose transient message slot (e.g. the inspector's
// transform-limited-pulse recompute notice).
let timeScaleToastTimer = null;
function showToast(message) {
  const toast = $('timeScaleToast');
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  toast.classList.add('is-visible');
  clearTimeout(timeScaleToastTimer);
  timeScaleToastTimer = setTimeout(() => {
    toast.classList.remove('is-visible');
    timeScaleToastTimer = setTimeout(() => { toast.hidden = true; }, 300);
  }, 4200);
}

function bindToolbar() {
  let shareUrl = '', shareQrSvg = '', shareSceneText = '';
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
  $('shareDownloadSetup').addEventListener('click', () => download(
    'optical-setup.json',
    shareSceneText,
    'application/json',
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
      const sketch = serialize();
      const url = await buildShareURL(sketch);
      history.replaceState(null, '', url);
      // The auto-copy is best-effort: restrictive clipboard permissions must
      // not block the dialog, which offers its own Copy button and a
      // selectable URL field as the fallback.
      let copied = true;
      try { await copyText(url); } catch (_) { copied = false; }
      shareUrl = url;
      shareSceneText = sketch;
      $('shareURL').value = url;
      try {
        shareQrSvg = qrSVG(url);
        $('shareQR').innerHTML = shareQrSvg;
        $('shareQRNote').textContent = 'Scan to open this exact optical setup.';
        $('shareDownloadQR').disabled = false;
      } catch (err) {
        shareQrSvg = '';
        $('shareQR').innerHTML = '<div class="share-qr-unavailable"><strong>QR unavailable</strong><br>This self-contained link contains more data than one QR code can hold.</div>';
        $('shareQRNote').textContent = 'Copy the complete link or download the setup file instead.';
        $('shareDownloadQR').disabled = true;
      }
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
  const gifDialog = $('gifDialog');
  const closeGIF = () => gifDialog.close();
  $('btnGIF').addEventListener('click', () => {
    $('gifStatus').classList.remove('is-error');
    $('gifStatus').textContent = 'Figure frame sets the crop; otherwise the whole animation is fitted.';
    gifDialog.showModal();
  });
  $('gifClose').addEventListener('click', closeGIF);
  $('gifCancel').addEventListener('click', closeGIF);
  gifDialog.addEventListener('click', event => { if (event.target === gifDialog) closeGIF(); });
  $('gifForm').addEventListener('submit', async event => {
    event.preventDefault();
    const submit = $('gifSubmit');
    const status = $('gifStatus');
    const durationSeconds = Number($('gifDuration').value);
    const fps = Number($('gifFPS').value);
    if (durationSeconds * fps > 240) {
      status.classList.add('is-error');
      status.textContent = 'This capture exceeds 240 frames. Shorten the acquisition or lower the frame rate.';
      return;
    }
    submit.disabled = true;
    status.classList.remove('is-error');
    status.textContent = 'Rendering frames 0%…';
    try {
      await exportGIF({
        durationSeconds,
        fps,
        maxDimension: Number($('gifSize').value),
        playback: getPulsePlayback(),
        onProgress: value => { status.textContent = `Rendering frames ${Math.round(value * 100)}%…`; },
      });
      status.textContent = 'GIF downloaded. It loops continuously.';
    } catch (err) {
      status.classList.add('is-error');
      status.textContent = err.message || 'Could not export the GIF.';
    } finally {
      submit.disabled = false;
    }
  });
  $('btnUndo').addEventListener('click', () => { undo(); renderInspector(); });
  $('btnRedo').addEventListener('click', () => { redo(); renderInspector(); });
  $('btnGrid').addEventListener('click', () => { state.showGrid = !state.showGrid; syncToolbar(); renderAll(); });
  $('btnSnap').addEventListener('click', () => { state.snap = !state.snap; syncToolbar(); });
  $('btnFocal').addEventListener('click', () => { state.showFocal = !state.showFocal; syncToolbar(); renderAll(); });
  $('btnZoomIn').addEventListener('click', () => zoomBy(1.25));
  $('btnZoomOut').addEventListener('click', () => zoomBy(0.8));
  $('btnZoomFit').addEventListener('click', zoomFit);
  $('btnPulsePlay').addEventListener('click', () => setPulsePlaying(!getPulsePlayback().playing));
  $('btnPulseReset').addEventListener('click', resetPulseTime);
  $('pulseDisplay').addEventListener('change', e => setPulseDisplayMode(e.target.value));
  $('pulseSpeed').addEventListener('change', e => {
    userChoseScale = true; // an explicit pick wins until the scene changes tier again
    if (e.target.value === 'mechanics') setMechanicsMode(true);
    else setPulseSpeed(parseFloat(e.target.value)); // also clears mechanics mode
  });

  const mobileMenu = $('mobileMenu');
  $('btnMobileMenu').addEventListener('click', () => mobileMenu.showModal());
  $('mobileMenuClose').addEventListener('click', () => mobileMenu.close());
  mobileMenu.addEventListener('click', event => { if (event.target === mobileMenu) mobileMenu.close(); });
  mobileMenu.querySelectorAll('[data-mobile-action]').forEach(button => {
    button.addEventListener('click', () => {
      const target = {
        new: 'btnNew', open: 'btnOpen', save: 'btnSave', share: 'btnShare', propose: 'btnPropose', svg: 'btnSVG', png: 'btnPNG', gif: 'btnGIF',
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
document.addEventListener('optics:clearvoxels', e => clearVoxelPreview(e.detail?.stageId));
document.addEventListener('optics:toolchange', e => syncToolMode(e.detail));
document.addEventListener('optics:pulsestate', e => syncPulseControls(e.detail));
document.addEventListener('optics:pulserepresentation', e => showAnchoredPopup(e.detail));
document.addEventListener('optics:viewchange', e => syncViewControls(e.detail));
document.addEventListener('optics:toast', e => { if (e.detail?.message) showToast(e.detail.message); });

// ---------- boot ----------
window.addEventListener('DOMContentLoaded', async () => {
  $('releaseVersion').textContent = APP_RELEASE;
  const params = new URLSearchParams(location.search);
  const demoType = params.get('demo');
  const communitySlug = params.get('community');
  const exampleSlug = params.get('example');
  const isTypeDemo = Boolean(demoType && registry[demoType] && !registry[demoType].hidden);
  const isCommunityDemo = Boolean(!isTypeDemo && communitySlug);
  const isExampleDemo = Boolean(!isTypeDemo && !isCommunityDemo && exampleSlug);
  const isDemo = isTypeDemo || isCommunityDemo || isExampleDemo;

  initTheme($('btnTheme'));
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
  setMeasurementsCallback(refreshMeasurements);
  onChange(() => { renderAll(); syncToolbar(); refreshMeasurements(); autoAdjustTimeScale(); announceIllustrativeMotion(); });

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
  } else if (isExampleDemo) {
    // Example embed: same locked treatment as the community embed above —
    // the whole curated setup is there to click through. Examples/*.json is
    // the plain native save format (no {scene: ...} wrapper), same as
    // loadExample() above.
    try {
      const entry = examples.find(e => e.slug === exampleSlug);
      if (!entry) throw new Error('Unknown example');
      const res = await fetch(entry.path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const scene = parseSketch(await res.text(), registry);
      state.elements.push(...scene.elements);
      state.beams.push(...scene.beams);
    } catch (err) {
      console.error('Could not load example:', err);
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
      // starter scene: CW laser -> lens -> beamsplitter -> two detection arms
      const mk = (t, x, y, rot = 0, params = {}, label = '') => {
        const e = createElement(t, x, y); e.rot = rot; Object.assign(e.params, params);
        if (label) { e.label = label; e.showLabel = true; }
        return e;
      };
      state.elements.push(
        mk('cwlaser', 75, 200, 0, { wavelength: 488 }, 'Laser 488 nm'),
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
