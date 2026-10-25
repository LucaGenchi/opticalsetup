// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The lens design page: editor on the left, analyses on the right. Every
// edit is normalized (engine/system.js), analysed in a worker
// (engine/analyze.js) and drawn; the last design is remembered in this
// browser only. Numbers shown here are formatted from the analysis, never
// recomputed.

import { PRESETS, presetSystem, DEFAULT_PRESET } from './engine/presets.js';
import { normalizeSystem, systemToJSON, systemFromJSON } from './engine/system.js';
import { canvasScene } from './engine/canvas-export.js';
import { createEditor } from './editor.js';
import { drawLayout, drawSpots, downloadSvgAsPng, downloadCanvas, downloadText, fileSafe } from './plots.js';
import { buildShareURL } from '../../sketch/js/share.js';
import { formatNumber } from '../assets/calculator-kit.js';

const STORAGE_KEY = 'opticalsetup-lens-design';
const $ = sel => document.querySelector(sel);
const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('aria-') || k.startsWith('data-') || k === 'scope') node.setAttribute(k, v);
    else node[k] = v;
  }
  node.append(...children.filter(c => c != null));
  return node;
};
const mm = (v, d = 5) => (Number.isFinite(v) ? `${formatNumber(v, d)} mm` : '∞');
const um = v => `${formatNumber(v * 1e3, 3)} µm`;

// ------------------------------------------------------------ analysis

let worker = null;
try {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
} catch {
  worker = null;
}
let fallback = null;
let requestId = 0;
let timer = 0;

function analyze(system) {
  const id = ++requestId;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (worker) { worker.postMessage({ id, system }); return; }
    fallback ??= (await import('./engine/analyze.js')).analyzeSystem;
    receive({ id, result: fallback(system) });
  }, 40);
}

function receive({ id, result, error }) {
  if (id !== requestId) return;
  if (error) result = { ok: false, errors: [`The analysis failed: ${error}`], warnings: [] };
  showResult(result);
}
if (worker) {
  worker.onmessage = e => receive(e.data);
  worker.onerror = e => {
    // A browser that cannot run module workers: analyse here instead.
    e.preventDefault?.();
    worker = null;
    analyze(current);
  };
}

// --------------------------------------------------------------- state

let current = null;
let lastResult = null;
let fileMessage = '';

// What the table's layout depends on; a change here rebuilds it. (Only the
// system form, never a table cell, edits the object, so rebuilding is safe.)
const structureOf = s => JSON.stringify([s.surfaces.map(r => [r.type, r.material, r.stop]), s.image.focus, s.object]);

const editor = createEditor($('#bench-editor'), {
  presets: PRESETS,
  onChange(next) {
    const normalized = normalizeSystem(next);
    const structural = structureOf(normalized) !== structureOf(current) || normalized.surfaces.length !== current.surfaces.length;
    current = normalized;
    fileMessage = '';
    editor.update(normalized, { structural });
    save();
    analyze(current);
  },
  onPreset(id) { load(presetSystem(id), id); },
  async onImport(file) {
    const parsed = systemFromJSON(await file.text());
    if (parsed.error) { fileMessage = `${file.name}: ${parsed.error}`; showResult(lastResult); return; }
    load(parsed.system);
  },
  onExport() {
    downloadText(systemToJSON(current), `${fileSafe(current.name)}.lens.json`, 'application/json');
  },
});

function load(system, presetId = '') {
  current = normalizeSystem(system);
  fileMessage = '';
  const preset = PRESETS.find(p => p.id === presetId);
  editor.setSystem(current, { presetId, note: preset?.note ?? '' });
  save();
  analyze(current);
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, systemToJSON(current)); } catch { /* storage off: nothing to remember */ }
}

function initialSystem() {
  const requested = new URLSearchParams(location.search).get('preset');
  if (requested && PRESETS.some(p => p.id === requested)) return [presetSystem(requested), requested];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? systemFromJSON(stored) : null;
    if (parsed?.system) return [parsed.system, ''];
  } catch { /* storage off */ }
  return [presetSystem(DEFAULT_PRESET), DEFAULT_PRESET];
}

// ---------------------------------------------------------------- tabs

const tabs = [...document.querySelectorAll('.bench-tab')];
let activeTab = tabs[0]?.id.replace('tab-', '');
function selectTab(tab, focus = false) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    $(`#${t.getAttribute('aria-controls')}`).hidden = !on;
  }
  activeTab = tab.id.replace('tab-', '');
  if (focus) tab.focus();
  renderTab(activeTab);
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', e => {
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    selectTab(tabs[(to + tabs.length) % tabs.length], true);
  });
});

// ------------------------------------------------------------- results

const table = (label, rows, { head = null, cls = 'calc-results' } = {}) => {
  const t = el('table', { class: cls, 'aria-label': label });
  if (head) t.append(el('thead', {}, el('tr', {}, ...head.map(h => el('th', { scope: 'col', text: h })))));
  const body = el('tbody');
  for (const row of rows) {
    if (row.group) { body.append(el('tr', { class: 'group' }, el('th', { colSpan: head?.length ?? 2, text: row.group }))); continue; }
    const [name, ...cells] = row;
    body.append(el('tr', {}, el('th', { scope: 'row', text: name }), ...cells.map(c => el('td', { text: c }))));
  }
  t.append(body);
  return t;
};

function showResult(result) {
  lastResult = result;
  editor.setResult(result);
  const status = $('#calc-status');
  status.textContent = '';
  status.classList.toggle('is-error', Boolean(fileMessage) || !result?.ok);
  if (fileMessage) status.append(el('span', { text: fileMessage }));
  else if (!result?.ok) {
    status.append(el('b', { text: 'No analysis for this prescription.' }), el('ul', {}, ...(result?.errors ?? []).map(e => el('li', { text: e }))));
  } else {
    const f = result.firstOrder;
    status.textContent = `f ${mm(f.efl, 5)} · F/${formatNumber(f.fno, 4)} · working F/${formatNumber(f.workingFno, 4)} · image ${mm(result.image.fromLast, 5)} after the last surface`;
  }
  const notes = $('#calc-notes');
  notes.textContent = '';
  for (const w of result?.warnings ?? []) notes.append(el('li', { text: w.text }));
  for (const id of ['layout', 'spot']) dirty.add(id);
  renderTab(activeTab);
  updateOpenLink(result);
}

const dirty = new Set();
let spotCommon = true;

function renderTab(id) {
  const result = lastResult;
  if (!result || !dirty.has(id)) return;
  dirty.delete(id);
  const plot = $(`[data-plot="${id}"]`), body = $(`[data-body="${id}"]`);
  plot.textContent = ''; body.textContent = '';
  if (!result.ok) { plot.append(el('p', { class: 'chart-message', text: 'Nothing to draw until the prescription can be analysed.' })); return; }
  if (id === 'layout') renderLayout(plot, body, result);
  if (id === 'spot') renderSpot(plot, body, result);
}

function exportBar(...buttons) {
  return el('div', { class: 'bench-export' }, ...buttons.map(([text, onClick]) => {
    const b = el('button', { type: 'button', class: 'bench-button', text });
    b.addEventListener('click', onClick);
    return b;
  }));
}

function renderLayout(plot, body, r) {
  const svg = drawLayout(plot, r);
  plot.append(exportBar(['Download PNG', () => downloadSvgAsPng(svg, `${fileSafe(r.system.name)}-layout.png`)]));
  const f = r.firstOrder, finite = !r.system.object.atInfinity;
  const rows = [
    ['Effective focal length', mm(f.efl)],
    ['Back focal length', mm(f.bfl)],
    ['F-number (f / entrance pupil)', formatNumber(f.fno, 4)],
    ['Working F-number', formatNumber(f.workingFno, 4)],
    ['Image-space NA (paraxial)', formatNumber(f.naImage, 4)],
    ...(finite ? [['Object-space NA (paraxial)', formatNumber(f.naObject, 4)], ['Magnification', formatNumber(f.magnification, 5)]] : []),
    ['Entrance pupil: diameter, position', `${mm(f.epd, 4)}, ${mm(f.zEp, 5)}`],
    ['Exit pupil: diameter, position', Number.isFinite(f.zXp) ? `${mm(f.xpd, 4)}, ${mm(f.zXp, 5)}` : 'at infinity (telecentric)'],
    ['Paraxial image distance', mm(f.imageDistance)],
    ['Paraxial image height (largest field)', mm(f.imageHeight)],
    ['Total track (surface 1 to paraxial image)', mm(f.totalTrack)],
    ['Airy radius, 1.22 λ N_w', um(r.airyRadius)],
  ];
  const fo = table('First-order data', rows);
  const waves = table('Paraxial focus by wavelength', r.byWavelength.map(w => [`${formatNumber(w.nm, 6)} nm`, mm(w.efl), mm(w.imageDistance)]),
    { head: ['Wavelength', 'Focal length', 'Image distance'] });
  const keys = ['SI', 'SII', 'SIII', 'SIV', 'SV', ...(r.seidel.chromatic ? ['CL', 'CT'] : [])];
  const fmt = v => (Math.abs(v) < 1e-12 ? '0' : formatNumber(v, 3));
  const seidel = table('Seidel sums by surface (mm)', [
    ...r.seidel.rows.map(row => [String(row.surface), ...keys.map(k => fmt(row[k]))]),
    ['Σ', ...keys.map(k => fmt(r.seidel.total[k]))],
  ], { head: ['Surface', 'S I', 'S II', 'S III', 'S IV', 'S V', ...(r.seidel.chromatic ? ['C L', 'C T'] : [])], cls: 'calc-results bench-seidel' });
  const W = r.seidelWaves;
  const wave = table(`Third-order wavefront coefficients (waves at ${formatNumber(r.primaryNm, 6)} nm)`, [
    ['W040 spherical', formatNumber(W.W040, 3)], ['W131 coma', formatNumber(W.W131, 3)], ['W222 astigmatism', formatNumber(W.W222, 3)],
    ['W220 field curvature', formatNumber(W.W220, 3)], ['W311 distortion', formatNumber(W.W311, 3)],
  ]);
  body.append(
    el('h3', { text: 'First-order data' }), fo,
    el('div', { class: 'bench-tables' }, el('div', {}, el('h3', { text: 'Focus by wavelength' }), waves),
      el('div', {}, el('h3', { text: 'Third-order wavefront' }), wave)),
    el('h3', { text: 'Seidel sums by surface (mm)' }), el('div', { class: 'bench-scroll' }, seidel),
  );
}

function renderSpot(plot, body, r) {
  const canvas = el('canvas', { class: 'bench-spots', role: 'img' });
  canvas.setAttribute('aria-label', `Spot diagrams for ${r.spots.length} field${r.spots.length === 1 ? '' : 's'}; RMS radii ${r.spots.map(s => um(s.poly.rms)).join(', ')}.`);
  const holder = el('div', { class: 'bench-spot-holder' }, canvas);
  const common = el('input', { type: 'checkbox', checked: spotCommon, id: 'spot-common' });
  common.addEventListener('change', () => { spotCommon = common.checked; drawSpots(canvas, r, { common: spotCommon }); });
  plot.append(
    el('div', { class: 'bench-spot-controls' },
      el('label', { class: 'bench-check' }, common, document.createTextNode('Same scale for every field')),
      exportBar(['Download PNG', () => downloadCanvas(canvas, `${fileSafe(r.system.name)}-spots.png`)],
        ['Download CSV', () => downloadText(spotCsv(r), `${fileSafe(r.system.name)}-spots.csv`, 'text/csv')])),
    holder);
  drawSpots(canvas, r, { common: spotCommon });
  observeResize(holder, () => drawSpots(canvas, r, { common: spotCommon }));

  const nms = r.system.wavelengthsNm;
  const rows = r.spots.map(s => {
    const ref = s.chief;
    const off = ref ? Math.hypot(s.poly.cx - ref.x, s.poly.cy - ref.y) : NaN;
    return [`${formatNumber(s.field, 4)}${r.fieldUnit === '°' ? '°' : ' mm'}`, um(s.poly.rms), um(s.poly.geo),
      ...s.perWavelength.map(w => (w.count ? um(w.rms) : '—')),
      Number.isFinite(off) ? um(off) : '—', `${s.lost} of ${s.rays}`, `${formatNumber(100 * s.vignetting, 3)} %`];
  });
  body.append(el('h3', { text: 'Spot sizes' }), el('div', { class: 'bench-scroll' }, table('Spot sizes by field', rows, {
    head: ['Field', 'RMS radius', 'Largest radius', ...nms.map(nm => `RMS at ${formatNumber(nm, 4)} nm`), 'Centroid from chief ray', 'Rays lost', 'Vignetted'],
    cls: 'calc-results bench-spot-table',
  })), el('p', { class: 'bench-note', text: `Airy radius ${um(r.airyRadius)} (dashed circle). Radii are from each spot’s polychromatic centroid; the plots are centred on the chief ray of the primary wavelength.` }));
}

function spotCsv(r) {
  const lines = ['field,wavelength_nm,x_um_from_chief,y_um_from_chief'];
  for (const s of r.spots) {
    const ref = s.chief ?? { x: s.poly.cx, y: s.poly.cy };
    for (const w of s.perWavelength) {
      for (let i = 0; i < w.x.length; i++) lines.push(`${s.field},${w.nm},${((w.x[i] - ref.x) * 1e3).toPrecision(8)},${((w.y[i] - ref.y) * 1e3).toPrecision(8)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

let resizeObserver = null;
function observeResize(node, redraw) {
  resizeObserver?.disconnect();
  if (!('ResizeObserver' in window)) return;
  let width = node.clientWidth;
  resizeObserver = new ResizeObserver(() => {
    if (Math.abs(node.clientWidth - width) < 2) return;
    width = node.clientWidth;
    redraw();
  });
  resizeObserver.observe(node);
}

// ------------------------------------------------- open in the canvas

let linkId = 0;
async function updateOpenLink(result) {
  const id = ++linkId;
  if (!result?.ok) { editor.setOpenLink(null, []); return; }
  const out = canvasScene(result.system, result);
  if (!out.ok) { editor.setOpenLink(null, out.reasons); return; }
  try {
    const url = await buildShareURL(JSON.stringify(out.scene), new URL('../../sketch/', location.href).href);
    if (id === linkId) editor.setOpenLink(url, [], out.note);
  } catch (error) {
    if (id === linkId) editor.setOpenLink(null, [String(error?.message ?? error)]);
  }
}

// ---------------------------------------------------------------- start

const [system, presetId] = initialSystem();
load(system, presetId);
