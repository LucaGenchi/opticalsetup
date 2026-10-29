// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The lens design page: editor on the left, analyses on the right. Every
// edit is normalized (engine/system.js), analysed in a worker
// (engine/analyze.js) and drawn; the diffraction tabs ask a second worker
// (engine/diffraction.js) for the chosen field, after each geometric
// result, and only while one of them is open, and the imaging and coupling
// tabs a worker each (engine/imaging.js, engine/coupling.js) likewise. The last design is
// remembered in this browser only. Numbers shown here are formatted from the
// analysis, never recomputed.

import { PRESETS, presetSystem, DEFAULT_PRESET } from './engine/presets.js';
import { normalizeSystem, systemToJSON, systemFromJSON } from './engine/system.js';
import { canvasScene } from './engine/canvas-export.js';
import { createEditor } from './editor.js';
import { drawLayout, drawSpots, drawHeatmap, roundTicks, downloadSvgAsPng, downloadCanvas, downloadText, fileSafe } from './plots.js';
import { ZERNIKE_NAMES } from './engine/zernike.js';
import { buildShareURL } from '../../sketch/js/share.js';
import { wavelengthToColor } from '../../sketch/js/util.js';
import { formatNumber, lineChart } from '../assets/calculator-kit.js';

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

// The diffraction worker. A request that a newer one makes useless (an
// edit, another field) is stopped by ending the worker and starting a new
// one, so a 256-sample grid never holds up the next answer.
const DIFFRACTION_TABS = ['wavefront', 'psf', 'mtf'];
// Tabs that show one wavelength at a time.
const MONOCHROMATIC_TABS = ['wavefront', 'imaging', 'coupling'];
let diffWorker = null, diffBusy = false, diffNoWorker = false, diffId = 0;
// The result, and the prescription and field it was computed for.
let diffResult = null, diffFor = null, diffField = null;
const view = { field: 0, wavelength: 'poly', psfLog: false };

function startDiffWorker() {
  try {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    w.onmessage = e => receiveDiffraction(e.data);
    w.onerror = e => {
      e.preventDefault?.();
      diffWorker = null; diffNoWorker = true; diffBusy = false;
      requestDiffraction();
    };
    return w;
  } catch {
    diffNoWorker = true;
    return null;
  }
}

function requestDiffraction() {
  const r = lastResult;
  if (!r?.ok) return;
  const id = ++diffId;
  diffFor = r; diffResult = null;
  view.field = Math.min(view.field, r.system.fields.values.length - 1);
  diffField = view.field;
  const message = { id, kind: 'diffraction', system: r.system, field: view.field, zImage: r.image.z };
  if (diffBusy && diffWorker) { diffWorker.terminate(); diffWorker = null; }
  if (!diffWorker && !diffNoWorker) diffWorker = startDiffWorker();
  if (diffWorker) { diffBusy = true; diffWorker.postMessage(message); return; }
  setTimeout(async () => {
    const { analyzeDiffraction } = await import('./engine/diffraction.js');
    let out;
    try { out = { id, result: analyzeDiffraction(message.system, message) }; } catch (error) { out = { id, error: String(error?.message ?? error) }; }
    receiveDiffraction(out);
  }, 0);
}

function receiveDiffraction({ id, result, error }) {
  if (id !== diffId) return;
  diffBusy = false;
  diffResult = error ? { ok: false, errors: [`The diffraction analysis failed: ${error}`], warnings: [] } : result;
  for (const t of DIFFRACTION_TABS) dirty.add(t);
  renderTab(activeTab);
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
  for (const id of ['layout', 'spot', ...DIFFRACTION_TABS, ...COHERENT_TABS]) dirty.add(id);
  // The diffraction results belong to the previous prescription now.
  diffResult = null; diffFor = null;
  for (const job of Object.values(jobs)) { job.result = null; job.for = null; }
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
  if (DIFFRACTION_TABS.includes(id)) renderDiffraction(id, plot, body, result);
  if (COHERENT_TABS.includes(id)) renderCoherent(id, plot, body, result);
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
      Number.isFinite(off) ? um(off) : '—',
      s.lateralColour == null ? '—' : um(s.lateralColour),
      s.distortion == null ? '—' : `${formatNumber(100 * s.distortion, 3)} %`,
      `${s.lost} of ${s.rays}`, `${formatNumber(100 * s.vignetting, 3)} %`];
  });
  body.append(el('h3', { text: 'Spot sizes' }), el('div', { class: 'bench-scroll' }, table('Spot sizes by field', rows, {
    head: ['Field', 'RMS radius', 'Largest radius', ...nms.map(nm => `RMS at ${formatNumber(nm, 4)} nm`), 'Centroid from chief ray', 'Lateral colour', 'Distortion', 'Rays lost', 'Vignetted'],
    cls: 'calc-results bench-spot-table',
  })), el('p', { class: 'bench-note' },
    document.createTextNode(`Radii are from each spot’s polychromatic centroid; the plots are centred on the chief ray of the primary wavelength. Lateral colour is the distance between the centroids of the shortest and longest wavelengths; distortion compares the chief ray with its paraxial height. `),
    el('a', { href: '#reading-spots', text: 'How to read a spot diagram' }), document.createTextNode('.')));
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

// ------------------------------------------------------------- diffraction

const fieldText = (r, v) => `${formatNumber(v, 4)}${r.fieldUnit === '°' ? '°' : ' mm'}`;
const nmText = nm => `${formatNumber(nm, 4)} nm`;

// The field and wavelength choosers above every diffraction tab, plus the
// log switch on the PSF tab.
function diffractionControls(id, r) {
  const fieldSelect = el('select', { 'aria-label': 'Field' },
    ...r.system.fields.values.map((v, i) => el('option', { value: String(i), text: fieldText(r, v) })));
  fieldSelect.value = String(view.field);
  fieldSelect.addEventListener('change', () => {
    view.field = Number(fieldSelect.value);
    for (const t of [...DIFFRACTION_TABS, ...COHERENT_TABS]) dirty.add(t);
    renderTab(activeTab);
  });
  const many = r.system.wavelengthsNm.length > 1;
  const options = [...(many && !MONOCHROMATIC_TABS.includes(id) ? [['poly', 'Polychromatic']] : []), ...r.system.wavelengthsNm.map((nm, i) => [String(i), nmText(nm)])];
  const wlSelect = el('select', { 'aria-label': 'Wavelength' }, ...options.map(([v, t]) => el('option', { value: v, text: t })));
  wlSelect.value = String(selectedWavelength(id, r));
  wlSelect.addEventListener('change', () => { view.wavelength = wlSelect.value === 'poly' ? 'poly' : Number(wlSelect.value); for (const t of [...DIFFRACTION_TABS, ...COHERENT_TABS]) dirty.add(t); renderTab(activeTab); });
  const bar = el('div', { class: 'bench-spot-controls bench-diffraction-controls' },
    el('label', { class: 'bench-check' }, document.createTextNode('Field'), fieldSelect),
    el('label', { class: 'bench-check' }, document.createTextNode('Wavelength'), wlSelect));
  if (id === 'psf') {
    const log = el('input', { type: 'checkbox', checked: view.psfLog });
    log.addEventListener('change', () => { view.psfLog = log.checked; dirty.add('psf'); renderTab('psf'); });
    bar.append(el('label', { class: 'bench-check' }, log, document.createTextNode('Logarithmic scale')));
  }
  return bar;
}

// 'poly' or a wavelength index; the wavefront, imaging and coupling tabs
// show one wavelength.
function selectedWavelength(id, r) {
  const many = r.system.wavelengthsNm.length > 1;
  if (view.wavelength === 'poly') return many && !MONOCHROMATIC_TABS.includes(id) ? 'poly' : r.system.primaryWavelength;
  return Math.min(view.wavelength, r.system.wavelengthsNm.length - 1);
}

// What every diffraction result is, said where it is shown.
function modelLabel(d, choice) {
  const weights = d.perWavelength.map(w => formatNumber(w.weight, 3)).join(' : ');
  const light = choice === 'poly'
    ? `polychromatic, an incoherent sum of ${d.perWavelength.length} wavelengths weighted ${weights}`
    : `monochromatic, ${nmText(d.perWavelength[choice].nm)}`;
  const pupil = d.illumination.illumination === 'gaussian' ? `Gaussian beam of ${formatNumber(d.illumination.beamRatio, 3)} pupil radii` : 'uniform pupil';
  return `Scalar diffraction, isoplanatic, ${light}; ${pupil}; field ${fieldText(d, d.fieldValue)}.`;
}

function renderDiffraction(id, plot, body, r) {
  plot.append(diffractionControls(id, r));
  if (diffFor !== r || diffField !== view.field || (!diffResult && !diffBusy)) requestDiffraction();
  if (!diffResult) {
    plot.append(el('p', { class: 'chart-message', text: 'Computing the wavefront and its diffraction…' }));
    dirty.add(id);
    return;
  }
  const d = diffResult;
  if (!d.ok) {
    plot.append(el('div', { class: 'calc-status is-error' }, el('b', { text: 'No diffraction analysis.' }), el('ul', {}, ...(d.errors ?? []).map(e => el('li', { text: e })))));
    return;
  }
  const choice = selectedWavelength(id, r);
  if (d.warnings.length) plot.append(el('ul', { class: 'bench-banner', role: 'note' }, ...d.warnings.map(w => el('li', { text: w.text }))));
  plot.append(el('p', { class: 'bench-note bench-model-label', text: modelLabel(d, choice) }));
  if (id === 'wavefront') renderWavefront(plot, body, r, d, choice);
  if (id === 'psf') renderPsf(plot, body, r, d, choice);
  if (id === 'mtf') renderMtf(plot, body, r, d, choice);
}

const heatCanvas = label => {
  const canvas = el('canvas', { class: 'bench-heatmap', role: 'img' });
  canvas.setAttribute('aria-label', label);
  return canvas;
};

function renderWavefront(plot, body, r, d, wi) {
  const w = d.perWavelength[wi], wf = w.wavefront;
  // Drawn with piston removed, as the RMS is: red ahead of the mean, blue
  // behind it.
  const shown = Float32Array.from(wf.map, v => v - wf.mean);
  let extreme = 1e-9;
  for (const v of shown) if (Number.isFinite(v)) extreme = Math.max(extreme, Math.abs(v));
  const canvas = heatCanvas(`Wavefront error at ${nmText(w.nm)}: RMS ${formatNumber(wf.rms, 3)} waves, peak to valley ${formatNumber(wf.pv, 3)} waves.`);
  const holder = el('div', { class: 'bench-heat-holder' }, canvas);
  const draw = () => drawHeatmap(canvas, {
    values: shown, cols: wf.cols, rows: wf.rows,
    extent: [-wf.cols / 2 * wf.step.x, wf.cols / 2 * wf.step.x, -wf.rows / 2 * wf.step.y, wf.rows / 2 * wf.step.y],
    range: [-extreme, extreme], colormap: 'diverging',
    xLabel: 'Pupil x (normalized)', yLabel: 'Pupil y (normalized)', barLabel: 'OPD, piston removed (waves)',
    barTicks: roundTicks(-extreme, extreme).map(v => [v, formatNumber(v, 3)]),
    title: `Field ${fieldText(d, d.fieldValue)}, ${nmText(w.nm)}`,
  });
  plot.append(holder, exportBar(
    ['Download PNG', () => downloadCanvas(canvas, `${fileSafe(r.system.name)}-wavefront.png`)],
    ['Download CSV', () => downloadText(wavefrontCsv(w), `${fileSafe(r.system.name)}-wavefront-${Math.round(w.nm)}nm.csv`, 'text/csv')]));
  draw();
  observeResize(holder, draw);

  const marechal = Math.exp(-((2 * Math.PI * wf.rmsTilt) ** 2));
  const rows = [
    ['RMS wavefront error (piston removed)', `${formatNumber(wf.rms, 3)} waves`],
    ['RMS with tilt also removed', `${formatNumber(wf.rmsTilt, 3)} waves`],
    ['Peak to valley', `${formatNumber(wf.pv, 3)} waves`],
    ['Strehl ratio (PSF peak)', formatNumber(w.strehl, 3)],
    ['Maréchal estimate, exp(−(2πσ)²)', formatNumber(marechal, 3)],
    ['Samples across the pupil (x × y)', `${w.samplesAcross.x.toFixed(1)} × ${w.samplesAcross.y.toFixed(1)}`],
    ['Largest step between neighbouring samples', `${formatNumber(wf.largestStep, 3)} waves`],
  ];
  body.append(el('h3', { text: 'Wavefront' }), table('Wavefront statistics', rows));
  if (wf.zernike) {
    const z = wf.zernike;
    // A coefficient below 10⁻⁵ waves is rounding, not aberration.
    const coef = v => (Math.abs(v) < 1e-5 ? '0' : formatNumber(v, 3));
    const terms = z.terms.slice(0, 15).map((t, i) => [`Z${t.j}`, ZERNIKE_NAMES[t.j] ?? '', `${t.n}, ${t.m}`, coef(z.coefficients[i])]);
    const t = el('table', { class: 'calc-results bench-zernike', 'aria-label': 'Zernike coefficients (Noll), waves' });
    t.append(el('thead', {}, el('tr', {}, ...['Term', 'Name', 'n, m', 'Coefficient (waves)'].map(h => el('th', { scope: 'col', text: h })))));
    const tb = el('tbody');
    for (const [a, b, c, v] of terms) tb.append(el('tr', {}, el('th', { scope: 'row', text: a }), el('td', { text: b }), el('td', { text: c }), el('td', { text: v })));
    tb.append(el('tr', {}, el('th', { scope: 'row', text: 'Rest' }), el('td', { text: `Terms 16–${z.terms.length} (in the CSV) and the fit residual` }), el('td', { text: '' }),
      el('td', { text: formatNumber(Math.hypot(...z.coefficients.slice(15), z.residualRms), 3) })));
    t.append(tb);
    body.append(el('h3', { text: 'Zernike coefficients (Noll, RMS-normalized)' }), el('div', { class: 'bench-scroll' }, t),
      exportBar(['Download Zernike CSV', () => downloadText(zernikeCsv(w), `${fileSafe(r.system.name)}-zernike-${Math.round(w.nm)}nm.csv`, 'text/csv')]));
  }
  body.append(el('p', { class: 'bench-note', text: 'OPD is the chief ray’s optical path minus the ray’s, on a sphere centred where the primary wavelength’s chief ray meets the image plane: positive where the wavefront is ahead of that sphere. The map has its mean removed; the CSV keeps the OPD from the chief ray. Another wavelength’s map also shows its lateral colour, as a tilt. ' },
    el('a', { href: '#reading-diffraction', text: 'How to read the wavefront, PSF and MTF' }), document.createTextNode('.')));
}

function wavefrontCsv(w) {
  const wf = w.wavefront, lines = ['pupil_x,pupil_y,opd_waves_from_chief_ray'];
  for (let i = 0; i < wf.rows; i++) for (let j = 0; j < wf.cols; j++) {
    const v = wf.map[i * wf.cols + j];
    if (Number.isFinite(v)) lines.push(`${((j + 0.5 - wf.cols / 2) * wf.step.x).toPrecision(8)},${((i + 0.5 - wf.rows / 2) * wf.step.y).toPrecision(8)},${v.toPrecision(8)}`);
  }
  return `${lines.join('\n')}\n`;
}

function zernikeCsv(w) {
  const z = w.wavefront.zernike;
  return `noll_j,n,m,name,coefficient_waves\n${z.terms.map((t, i) => `${t.j},${t.n},${t.m},${ZERNIKE_NAMES[t.j] ?? ''},${z.coefficients[i].toPrecision(8)}`).join('\n')}\nresidual_rms,,,,${z.residualRms.toPrecision(8)}\n`;
}

// The PSF being shown: one wavelength's, or the polychromatic sum.
function psfOf(d, choice) {
  if (choice === 'poly') return { psf: d.poly.psf, cut: d.poly.idealCut, strehl: d.poly.strehl, peakAt: d.poly.peakAt, mtf: d.poly.mtf, mtfIdeal: d.poly.mtfIdeal, nm: d.primaryNm };
  const w = d.perWavelength[choice];
  return { psf: w.psf, cut: w.idealCut, strehl: w.strehl, peakAt: w.peakAt, mtf: w.mtf, mtfIdeal: w.mtfIdeal, nm: w.nm, w };
}

// Series colours for the charts: one CSS custom property per wavelength.
function setWavelengthColours(host, d) {
  d.perWavelength.forEach((w, i) => host.style.setProperty(`--wl-${i}`, wavelengthToColor(w.nm)));
}

// The centred (2v+1)² part of a (2h+1)² crop.
function zoom(values, h, v) {
  const n = 2 * h + 1, m = 2 * v + 1, out = new Float32Array(m * m);
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) out[i * m + j] = values[(i + h - v) * n + (j + h - v)];
  return out;
}

function renderPsf(plot, body, r, d, choice) {
  const full = psfOf(d, choice), h = d.viewWindow, n = 2 * h + 1, um = d.spacing * 1e3;
  const sel = { ...full, psf: zoom(full.psf, d.window, h), cut: { x: full.cut.x.slice(d.window - h, d.window + h + 1) } };
  let max = 0;
  for (const v of sel.psf) max = Math.max(max, v);
  max = Math.max(max, 1e-12);
  const values = view.psfLog ? Float32Array.from(sel.psf, v => Math.log10(Math.max(v, max * 1e-7))) : sel.psf;
  const range = view.psfLog ? [Math.log10(max) - 5, Math.log10(max)] : [0, max];
  const primary = d.perWavelength[d.primary];
  const ref = sel.w ?? primary;
  const airy = 1.22 * ref.nm * 1e-6 / (2 * ref.na.x) * 1e3;
  const canvas = heatCanvas(`Point-spread function: Strehl ratio ${formatNumber(sel.strehl, 3)}; ${n} × ${n} samples ${formatNumber(um, 3)} µm apart.`);
  const holder = el('div', { class: 'bench-heat-holder' }, canvas);
  const ext = (h + 0.5) * um;
  const draw = () => drawHeatmap(canvas, {
    values, cols: n, rows: n, extent: [-ext, ext, -ext, ext], range, smooth: true,
    xLabel: 'x (µm)', yLabel: 'y (µm)',
    barLabel: view.psfLog ? 'log₁₀ intensity (perfect lens = 0)' : 'Intensity (perfect lens peak = 1)',
    barTicks: view.psfLog
      ? Array.from({ length: 6 }, (_, k) => Math.floor(range[1]) - k).map(v => [v, String(v)])
      : roundTicks(0, max).map(v => [v, formatNumber(v, 3)]),
    title: `Field ${fieldText(d, d.fieldValue)}, ${choice === 'poly' ? 'polychromatic' : nmText(sel.nm)}`,
    overlay(ctx, toX, toY, scale) {
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(toX(0), toY(0), airy * scale, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(toX(0) - 5, toY(0)); ctx.lineTo(toX(0) + 5, toY(0)); ctx.moveTo(toX(0), toY(0) - 5); ctx.lineTo(toX(0), toY(0) + 5); ctx.stroke();
    },
  });
  plot.append(holder, el('p', { class: 'bench-note', text: `Dashed circle: the Airy radius 1.22 λ/(2 NA) = ${formatNumber(airy, 3)} µm at ${nmText(ref.nm)}; + : the primary chief ray.` }),
    exportBar(['Download PNG', () => downloadCanvas(canvas, `${fileSafe(r.system.name)}-psf.png`)],
      ['Download CSV', () => downloadText(psfCsv(d, full), `${fileSafe(r.system.name)}-psf.csv`, 'text/csv')]));
  draw();
  observeResize(holder, draw);

  // Cross-sections through the peak, each relative to its own peak so that
  // the shapes compare (the heights are the Strehl ratio, in the table).
  const pi = Math.round(sel.peakAt.y / d.spacing) + h, pj = Math.round(sel.peakAt.x / d.spacing) + h;
  const row = Math.min(n - 1, Math.max(0, pi)), col = Math.min(n - 1, Math.max(0, pj));
  const xs = Array.from({ length: n }, (_, k) => (k - h) * um);
  const peak = Math.max(sel.psf[row * n + col], 1e-30), idealPeak = Math.max(...sel.cut.x, 1e-30);
  const cutHost = el('div', { class: 'chart-host bench-chart' });
  body.append(el('h3', { text: 'Cross-sections through the peak' }), cutHost);
  lineChart(cutHost, null, {
    x: xs, xLabel: 'Position (µm)', yLabel: 'Intensity / its peak', yMin: 0,
    series: [
      { key: 'x', name: 'Along x', color: '--series-1', values: xs.map((_, k) => sel.psf[row * n + k] / peak) },
      { key: 'y', name: 'Along y', color: '--series-2', values: xs.map((_, k) => sel.psf[k * n + col] / peak) },
      { key: 'ideal', name: 'Perfect lens', color: '--muted', dash: true, values: Array.from(sel.cut.x, v => v / idealPeak) },
    ],
    formatX: v => formatNumber(v, 3), formatY: v => formatNumber(v, 3),
  });

  // Through focus.
  const tf = d.throughFocus;
  if (tf) {
    const tfHost = el('div', { class: 'chart-host bench-chart' });
    setWavelengthColours(tfHost, d);
    const series = d.perWavelength.map((w, i) => ({ key: `wl${i}`, name: nmText(w.nm), color: `--wl-${i}`, values: Array.from(tf.strehl[i]) }));
    if (tf.poly) series.unshift({ key: 'poly', name: 'Polychromatic', color: '--ink', values: Array.from(tf.poly) });
    body.append(el('h3', { text: 'Strehl ratio through focus' }), tfHost,
      el('p', { class: 'bench-note', text: `Moving the image plane from where it is now (0); ${focusGridText(tf, d)}. A negative shift moves it toward the lens.${tf.aliased.some(Boolean) ? ' Planes where the wavefront is too steep to sample are left out.' : ''}` }),
      exportBar(['Download CSV', () => downloadText(focusCsv(d), `${fileSafe(r.system.name)}-through-focus.csv`, 'text/csv')]));
    lineChart(tfHost, null, {
      x: Array.from(tf.shifts, z => z * 1e3), xLabel: 'Image-plane shift (µm)', yLabel: 'Strehl ratio', yMin: 0, yMax: 1,
      series, vlines: [{ x: 0, label: 'image plane' }], formatX: v => formatNumber(v, 3), formatY: v => formatNumber(v, 3),
    });
  }

  const rows = [
    ['Strehl ratio (PSF peak)', formatNumber(sel.strehl, 3)],
    ...(sel.w ? [['Strehl ratio at the chief ray', formatNumber(sel.w.strehlAtChief, 3)]] : []),
    ['Peak position from the chief ray', `${formatNumber(sel.peakAt.x * 1e3, 3)}, ${formatNumber(sel.peakAt.y * 1e3, 3)} µm`],
    ...(sel.w ? [
      ['Image-space NA (x, y), traced', `${formatNumber(sel.w.na.x, 4)}, ${formatNumber(sel.w.na.y, 4)}`],
      ['Light through the apertures', `${formatNumber(100 * sel.w.transmission, 4)} %`],
    ] : []),
    ['PSF sample spacing', `${formatNumber(um, 4)} µm`],
    ['Pupil grid, padding, FFT', `${d.grid} × ${d.padding} → ${d.fftSize} × ${d.fftSize}${d.fftSize > d.grid * d.padding ? ' (grown so that every wavelength keeps 32 samples across the pupil)' : ''}`],
    ...(sel.w ? [['Samples across the pupil (x × y)', `${formatNumber(sel.w.samplesAcross.x, 3)} × ${formatNumber(sel.w.samplesAcross.y, 3)}`]] : []),
    ['Fresnel number of the exit pupil', Number.isFinite(d.fresnelNumber) ? `${formatNumber(d.fresnelNumber, 3)}${d.perWavelength.length > 1 ? ` (at ${formatNumber(d.fresnelNm, 4)} nm, the longest)` : ''}` : '∞'],
    ['Pupil distortion', `${formatNumber(100 * d.pupilDistortion, 3)} %`],
  ];
  body.append(el('h3', { text: 'Point-spread function' }), table('PSF figures', rows));
}

function psfCsv(d, sel) {
  const h = d.window, n = 2 * h + 1, um = d.spacing * 1e3, lines = ['x_um,y_um,intensity_rel_perfect_peak'];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) lines.push(`${((j - h) * um).toPrecision(6)},${((i - h) * um).toPrecision(6)},${sel.psf[i * n + j].toPrecision(6)}`);
  return `${lines.join('\n')}\n`;
}

// The pupil sampling of the through-focus planes at the primary
// wavelength: each plane takes the coarsest grid that samples its wavefront.
function focusGridText(tf, d) {
  const [lo, hi] = tf.across.map(v => formatNumber(v, 3));
  const at = `at ${nmText(d.primaryNm)}`;
  return lo === hi ? `${lo} samples across the pupil ${at}` : `${lo} to ${hi} samples across the pupil ${at}, more where the wavefront is steeper`;
}

function focusCsv(d) {
  const tf = d.throughFocus;
  const value = v => (Number.isFinite(v) ? v.toPrecision(6) : '');
  const head = ['shift_um', ...(tf.poly ? ['strehl_polychromatic'] : []), ...d.perWavelength.map(w => `strehl_${Math.round(w.nm)}nm`), `pupil_samples_across_${Math.round(d.primaryNm)}nm`, 'aliased'];
  const lines = [head.join(',')];
  tf.shifts.forEach((z, i) => lines.push([(z * 1e3).toPrecision(6), ...(tf.poly ? [value(tf.poly[i])] : []), ...tf.strehl.map(s => value(s[i])), tf.planeAcross[i] ? tf.planeAcross[i].toPrecision(4) : '', tf.aliased[i] ? 'yes' : 'no'].join(',')));
  return `${lines.join('\n')}\n`;
}

// MTF value at frequency f by linear interpolation, or null past the data.
function mtfAt(freqs, values, f) {
  const k = f / freqs[1], i = Math.floor(k);
  if (!(i >= 0 && i + 1 < values.length)) return null;
  return values[i] + (values[i + 1] - values[i]) * (k - i);
}
// The first frequency where the MTF falls to `level`.
function mtfCrossing(freqs, values, level) {
  for (let i = 1; i < values.length; i++) if (values[i] <= level) return freqs[i - 1] + (freqs[i] - freqs[i - 1]) * (values[i - 1] - level) / (values[i - 1] - values[i]);
  return null;
}

function renderMtf(plot, body, r, d, choice) {
  const sel = psfOf(d, choice);
  const cutoffs = choice === 'poly' ? d.perWavelength.flatMap(w => [w.cutoff.tangential, w.cutoff.sagittal]) : [sel.w.cutoff.tangential, sel.w.cutoff.sagittal];
  const top = Math.max(...cutoffs);
  const freqs = Array.from(d.frequencies);
  const count = Math.min(freqs.length, freqs.findIndex(f => f > top) + 1 || freqs.length);
  const xs = freqs.slice(0, count);
  const host = el('div', { class: 'chart-host bench-chart' });
  plot.append(host);
  lineChart(host, null, {
    x: xs, xLabel: 'Spatial frequency (cycles/mm)', yLabel: 'MTF', yMin: 0, yMax: 1,
    series: [
      { key: 't', name: 'Tangential', color: '--series-1', values: Array.from(sel.mtf.tan.slice(0, count)) },
      { key: 's', name: 'Sagittal', color: '--series-2', dash: true, values: Array.from(sel.mtf.sag.slice(0, count)) },
      { key: 'it', name: 'Perfect lens, tangential', color: '--muted', values: Array.from(sel.mtfIdeal.tan.slice(0, count)) },
      { key: 'is', name: 'Perfect lens, sagittal', color: '--muted', dash: true, values: Array.from(sel.mtfIdeal.sag.slice(0, count)) },
    ],
    formatX: v => formatNumber(v, 3), formatY: v => formatNumber(v, 3),
  });
  plot.append(exportBar(['Download CSV', () => downloadText(mtfCsv(d, sel, count), `${fileSafe(r.system.name)}-mtf.csv`, 'text/csv')]));

  const marks = [10, 20, 50, 100, 200, 500, 1000].filter(f => f < top * 0.98);
  const rows = marks.map(f => [`${f} cycles/mm`, formatNumber(mtfAt(freqs, sel.mtf.tan, f), 3), formatNumber(mtfAt(freqs, sel.mtf.sag, f), 3), formatNumber(mtfAt(freqs, sel.mtfIdeal.tan, f), 3)]);
  const fifty = [mtfCrossing(xs, sel.mtf.tan, 0.5), mtfCrossing(xs, sel.mtf.sag, 0.5), mtfCrossing(xs, sel.mtfIdeal.tan, 0.5)];
  rows.push(['MTF50 (cycles/mm)', ...fifty.map(v => (v == null ? '—' : formatNumber(v, 3)))]);
  if (sel.w) rows.push(['Cutoff 2 NA/λ (cycles/mm)', formatNumber(sel.w.cutoff.tangential, 4), formatNumber(sel.w.cutoff.sagittal, 4), '']);
  body.append(el('h3', { text: 'Modulation transfer' }), el('div', { class: 'bench-scroll' }, table('MTF values', rows, { head: ['Frequency', 'Tangential', 'Sagittal', 'Perfect lens'] })),
    el('p', { class: 'bench-note', text: 'Tangential: a pattern whose stripes run across the field direction (frequency along y); sagittal: along it. Polychromatic curves are the transform of the summed PSF.' }));
}

function mtfCsv(d, sel, count) {
  const lines = ['frequency_cycles_per_mm,tangential,sagittal,perfect_tangential,perfect_sagittal'];
  for (let k = 0; k < count; k++) lines.push([d.frequencies[k], sel.mtf.tan[k], sel.mtf.sag[k], sel.mtfIdeal.tan[k], sel.mtfIdeal.sag[k]].map(v => Number(v).toPrecision(6)).join(','));
  return `${lines.join('\n')}\n`;
}

// --------------------------------------------- imaging and fiber coupling

// The imaging and coupling tabs each have a worker of their own, run as the
// diffraction worker is (a newer request stops a busy one), for the chosen
// field and wavelength and the tab's own settings. Those settings live in
// the prescription (system.imaging, system.coupling), so a saved file keeps
// them; editing them asks for no new geometric analysis.
const COHERENT_TABS = ['imaging', 'coupling'];
const jobs = Object.fromEntries(COHERENT_TABS.map(kind => [kind, { worker: null, busy: false, noWorker: false, id: 0, result: null, for: null, key: '' }]));
const jobKey = (kind, r) => `${view.field}|${selectedWavelength(kind, r)}|${JSON.stringify(current[kind])}`;

function startJobWorker(kind) {
  const job = jobs[kind];
  try {
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    w.onmessage = e => receiveJob(kind, e.data);
    w.onerror = e => {
      e.preventDefault?.();
      job.worker = null; job.noWorker = true; job.busy = false;
      requestJob(kind);
    };
    return w;
  } catch {
    job.noWorker = true;
    return null;
  }
}

function requestJob(kind) {
  const r = lastResult, job = jobs[kind];
  if (!r?.ok) return;
  view.field = Math.min(view.field, r.system.fields.values.length - 1);
  const id = ++job.id;
  job.for = r; job.key = jobKey(kind, r); job.result = null;
  const message = { id, kind, system: { ...r.system, [kind]: current[kind] }, field: view.field, zImage: r.image.z, wavelength: selectedWavelength(kind, r) };
  if (job.busy && job.worker) { job.worker.terminate(); job.worker = null; }
  if (!job.worker && !job.noWorker) job.worker = startJobWorker(kind);
  if (job.worker) { job.busy = true; job.worker.postMessage(message); return; }
  setTimeout(async () => {
    const run = kind === 'imaging' ? (await import('./engine/imaging.js')).analyzeImaging : (await import('./engine/coupling.js')).analyzeCoupling;
    let out;
    try { out = { id, result: run(message.system, message) }; } catch (error) { out = { id, error: String(error?.message ?? error) }; }
    receiveJob(kind, out);
  }, 0);
}

function receiveJob(kind, { id, result, error }) {
  const job = jobs[kind];
  if (id !== job.id) return;
  job.busy = false;
  job.result = error ? { ok: false, errors: [`The ${kind} analysis failed: ${error}`], warnings: [] } : result;
  dirty.add(kind);
  renderTab(activeTab);
}

// A tab setting changed: keep it in the prescription and recompute that tab.
function changeSetting(kind, mutate) {
  const next = structuredClone(current);
  mutate(next[kind]);
  current = normalizeSystem(next);
  editor.adopt(current);
  save();
  dirty.add(kind);
  renderTab(activeTab);
}

// A labelled number box that commits on change (Enter or leaving it).
function numberSetting(kind, key, label, unit, digits = 4) {
  const input = el('input', { type: 'text', inputMode: 'decimal', value: formatNumber(current[kind][key], digits), class: 'bench-number' });
  input.setAttribute('aria-label', `${label}${unit ? ` (${unit})` : ''}`);
  input.addEventListener('change', () => {
    const v = Number(input.value.trim().replace(',', '.').replace('−', '-'));
    if (input.value.trim() === '' || !Number.isFinite(v)) { input.setAttribute('aria-invalid', 'true'); return; }
    changeSetting(kind, s => { s[key] = v; });
  });
  return el('label', { class: 'bench-check' }, document.createTextNode(label), input, unit ? el('span', { class: 'bench-unit', text: unit }) : null);
}
function choiceSetting(kind, key, label, options) {
  const select = el('select', { 'aria-label': label }, ...options.map(([v, t]) => el('option', { value: v, text: t })));
  select.value = String(current[kind][key]);
  select.addEventListener('change', () => changeSetting(kind, s => { s[key] = select.value; }));
  return el('label', { class: 'bench-check' }, document.createTextNode(label), select);
}

function imagingControls() {
  const t = current.imaging;
  const items = [choiceSetting('imaging', 'target', 'Target', [['points', 'Two points'], ['bars', 'Bar target'], ['grating', 'Grating'], ['star', 'Siemens star']])];
  const along = () => choiceSetting('imaging', 'axis', t.target === 'points' ? 'Side by side along' : 'Varying along', [['x', 'x'], ['y', 'y']]);
  if (t.target === 'points') items.push(numberSetting('imaging', 'separation', 'Separation', '× Rayleigh distance', 3), along(), numberSetting('imaging', 'phaseDeg', 'Phase of the second point', '°', 4));
  if (t.target === 'bars' || t.target === 'grating') items.push(numberSetting('imaging', 'frequency', 'Frequency', '× 2 NA/λ', 3));
  if (t.target === 'grating') items.push(along());
  if (t.target === 'star') items.push(numberSetting('imaging', 'spokes', 'Cycles round the star', '', 4));
  return el('div', { class: 'bench-spot-controls bench-diffraction-controls bench-settings' }, ...items);
}

function couplingControls() {
  const box = el('input', { type: 'checkbox', checked: current.coupling.fresnel });
  box.addEventListener('change', () => changeSetting('coupling', s => { s.fresnel = box.checked; }));
  return el('div', { class: 'bench-spot-controls bench-diffraction-controls bench-settings' },
    numberSetting('coupling', 'mfdUm', 'Mode-field diameter', 'µm'),
    numberSetting('coupling', 'offsetXUm', 'Core offset x', 'µm'),
    numberSetting('coupling', 'offsetYUm', 'Core offset y', 'µm'),
    numberSetting('coupling', 'axialUm', 'Face past the image plane', 'µm'),
    numberSetting('coupling', 'tiltXMrad', 'Tilt from the chief ray, x', 'mrad'),
    numberSetting('coupling', 'tiltYMrad', 'Tilt from the chief ray, y', 'mrad'),
    el('label', { class: 'bench-check' }, box, document.createTextNode('Uncoated surfaces (Fresnel reflection)')));
}

function renderCoherent(kind, plot, body, r) {
  plot.append(diffractionControls(kind, r), kind === 'imaging' ? imagingControls() : couplingControls());
  const job = jobs[kind];
  if (job.for !== r || job.key !== jobKey(kind, r) || (!job.result && !job.busy)) requestJob(kind);
  if (!job.result) {
    plot.append(el('p', { class: 'chart-message', text: kind === 'imaging' ? 'Computing the image…' : 'Computing the coupling…' }));
    dirty.add(kind);
    return;
  }
  const d = job.result;
  if (!d.ok) {
    plot.append(el('div', { class: 'calc-status is-error' }, el('b', { text: kind === 'imaging' ? 'No image.' : 'No coupling.' }), el('ul', {}, ...(d.errors ?? []).map(e => el('li', { text: e })))));
    return;
  }
  if (d.warnings.length) plot.append(el('ul', { class: 'bench-banner', role: 'note' }, ...d.warnings.map(w => el('li', { text: w.text }))));
  const pupil = d.illumination.illumination === 'gaussian' ? `Gaussian beam of ${formatNumber(d.illumination.beamRatio, 3)} pupil radii` : 'uniform pupil';
  const label = kind === 'imaging'
    ? `Scalar, isoplanatic (the PSF of field ${fieldText(d, d.fieldValue)} for the whole target), monochromatic ${nmText(d.nm)}; fully incoherent, and fully coherent (a plane wave along the chief ray); ${pupil}.`
    : `Scalar, coherent, monochromatic ${nmText(d.nm)}; Gaussian fiber mode; ${pupil}; field ${fieldText(d, d.fieldValue)}.`;
  plot.append(el('p', { class: 'bench-note bench-model-label', text: label }));
  if (kind === 'imaging') renderImaging(plot, body, r, d);
  else renderCoupling(plot, body, r, d);
}

const umText = mmValue => `${formatNumber(mmValue * 1e3, 3)} µm`;
// The midpoint is the brightest point: no dip, the two are not resolved.
const dipText = v => (v >= 1 - 1e-9 ? '100 % (no dip)' : `${formatNumber(100 * v, 3)} %`);
const pct = v => `${formatNumber(100 * v, 3)} %`;
const xy = (v, f) => (Math.abs(v.x - v.y) <= 1e-9 * Math.max(Math.abs(v.x), Math.abs(v.y)) ? f(v.x) : `${f(v.x)} (x), ${f(v.y)} (y)`);

function renderImaging(plot, body, r, d) {
  const h = d.window, n = 2 * h + 1, step = d.spacing * 1e3, ext = (h + 0.5) * step;
  let top = 1e-12;
  for (const v of d.incoherent) top = Math.max(top, v);
  for (const v of d.coherent) top = Math.max(top, v);
  const point = d.normalization === 'point';
  const barLabel = point ? 'Intensity (one point, perfect lens = 1)' : 'Intensity (clear area = 1)';
  const geo = d.geometry;
  const overlay = which => (ctx, toX, toY, scale) => {
    ctx.strokeStyle = 'rgba(255, 140, 60, .9)'; ctx.lineWidth = 1.2;
    if (d.points) {
      for (const [x, y] of d.points) {
        const px = toX(x * 1e3), py = toY(y * 1e3);
        ctx.beginPath(); ctx.moveTo(px - 5, py); ctx.lineTo(px + 5, py); ctx.moveTo(px, py - 5); ctx.lineTo(px, py + 5); ctx.stroke();
      }
    }
    if (geo.cutoffRadius && which) {
      const c = geo.cutoffRadius[which];
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.ellipse(toX(0), toY(0), c.x * 1e3 * scale, c.y * 1e3 * scale, 0, 0, 2 * Math.PI); ctx.stroke();
      ctx.setLineDash([]);
    }
  };
  const panel = (values, title, range, label, which = null, colourLabel = barLabel) => {
    const canvas = heatCanvas(label);
    const holder = el('div', { class: 'bench-heat-holder' }, canvas);
    const draw = () => drawHeatmap(canvas, {
      values, cols: n, rows: n, extent: [-ext, ext, -ext, ext], range, colormap: 'grey', smooth: true,
      xLabel: 'x (µm)', yLabel: 'y (µm)', barLabel: colourLabel,
      barTicks: roundTicks(range[0], range[1]).map(v => [v, formatNumber(v, 3)]), title, overlay: overlay(which),
    });
    return { holder, canvas, draw };
  };
  const panels = [];
  if (d.object) panels.push(panel(d.object, 'Target', [0, 1], 'The target as a perfect lens without diffraction would image it.', null, 'Transmission'));
  panels.push(panel(d.incoherent, 'Incoherent light', [0, top], `Image in incoherent light at ${nmText(d.nm)}.`, 'incoherent'));
  panels.push(panel(d.coherent, 'Coherent light', [0, top], `Image in coherent light at ${nmText(d.nm)}.`, 'coherent'));
  const grid = el('div', { class: 'bench-image-grid' }, ...panels.map(p => p.holder));
  const name = fileSafe(r.system.name);
  plot.append(grid,
    el('p', { class: 'bench-note', text: `${d.points ? '+ : where the two points are. ' : ''}${geo.cutoffRadius ? 'Dashed: where the star’s pattern reaches each image’s cutoff frequency; inside it, no contrast passes. ' : ''}Both images share one intensity scale.` }),
    exportBar(['Download incoherent PNG', () => downloadCanvas(panels.at(-2).canvas, `${name}-image-incoherent.png`)],
      ['Download coherent PNG', () => downloadCanvas(panels.at(-1).canvas, `${name}-image-coherent.png`)],
      ['Download CSV', () => downloadText(imageCsv(d), `${name}-image.csv`, 'text/csv')]));
  const drawAll = () => panels.forEach(p => p.draw());
  drawAll();
  observeResize(grid, drawAll);

  // The profile through the centre, or the star's contrast against radius.
  const pr = d.profile, radial = pr.axis === 'radius';
  const xs = Array.from(pr.positions, v => v * 1e3);
  const host = el('div', { class: 'chart-host bench-chart' });
  body.append(el('h3', { text: radial ? 'Contrast against radius' : `Profile along ${pr.axis} through the centre` }), host);
  lineChart(host, null, {
    x: xs, xLabel: radial ? 'Radius from the star’s centre (µm)' : `${pr.axis} (µm)`,
    yLabel: radial ? 'Contrast' : point ? 'Intensity (one point = 1)' : 'Intensity (clear area = 1)', ...(radial ? {} : { yMin: 0 }),
    series: [
      { key: 'i', name: 'Incoherent', color: '--series-1', values: Array.from(pr.incoherent) },
      { key: 'c', name: 'Coherent', color: '--series-2', values: Array.from(pr.coherent) },
      ...(pr.object && !radial ? [{ key: 'o', name: 'Target', color: '--muted', dash: true, values: Array.from(pr.object) }] : []),
    ],
    vlines: radial ? [{ x: geo.cutoffRadius.incoherent.x * 1e3, label: 'incoherent cutoff' }, { x: geo.cutoffRadius.coherent.x * 1e3, label: 'coherent cutoff' }] : [],
    formatX: v => formatNumber(v, 3), formatY: v => formatNumber(v, 3),
  });
  if (radial) body.append(el('p', { class: 'bench-note', text: 'Contrast between the middle of a bright spoke and the middle of the next dark one, along the spokes nearest +x; the marks are where the spokes’ frequency reaches each cutoff (in y, the direction the pattern varies there).' }));

  const rows = [
    ['Coherent cutoff NA/λ', xy(d.cutoff.coherent, v => `${formatNumber(v, 4)} cycles/mm`)],
    ['Incoherent cutoff 2 NA/λ', xy(d.cutoff.incoherent, v => `${formatNumber(v, 4)} cycles/mm`)],
    ['Rayleigh distance 0.61 λ/NA', xy(d.rayleigh, umText)],
  ];
  const ro = d.readout, t = d.target;
  if (t.target === 'points') {
    rows.push(
      ['Separation', `${umText(geo.separation)} (${formatNumber(t.separation, 3)} Rayleigh distance${t.separation === 1 ? '' : 's'})`],
      ['Midpoint ÷ brightest point on the line through them, incoherent', dipText(ro.dip.incoherent)],
      [`Midpoint ÷ brightest point on that line, coherent (phase ${formatNumber(t.phaseDeg, 4)}°)`, dipText(ro.dip.coherent)],
    );
  } else if (t.target === 'bars') {
    const c = ro.contrast;
    rows.push(
      ['Bar width', umText(geo.barWidth)],
      ['Frequency 1/(2 × width)', `${formatNumber(geo.frequency, 4)} cycles/mm`],
      ['Contrast across the vertical bars: incoherent, coherent', `${formatNumber(c.incoherent.vertical, 3)}, ${formatNumber(c.coherent.vertical, 3)}`],
      ['Contrast across the horizontal bars: incoherent, coherent', `${formatNumber(c.incoherent.horizontal, 3)}, ${formatNumber(c.coherent.horizontal, 3)}`],
    );
  } else if (t.target === 'grating') {
    rows.push(
      ['Frequency (a whole number of periods across the field)', `${formatNumber(geo.frequency, 4)} cycles/mm (period ${umText(geo.period)})`],
      ['Modulation: incoherent, coherent', `${formatNumber(ro.modulation.incoherent, 3)}, ${formatNumber(ro.modulation.coherent, 3)}`],
    );
  } else {
    rows.push(
      ['Star radius, cycles', `${umText(geo.radius)}, ${geo.spokes}`],
      ['Radius where incoherent contrast ends', xy(geo.cutoffRadius.incoherent, umText)],
      ['Radius where coherent contrast ends', xy(geo.cutoffRadius.coherent, umText)],
    );
  }
  rows.push(['Image sample spacing', `${formatNumber(step, 4)} µm`], ['Computed field (periodic)', umText(d.fieldOfView)]);
  body.append(el('h3', { text: 'Image' }), table('Imaging figures', rows),
    el('p', { class: 'bench-note' }, document.createTextNode('Contrast is (bright − dark)/(bright + dark) between the bars’ centres and the gaps; negative means the pattern is reversed. '),
      el('a', { href: '#reading-imaging', text: 'How to read the images' }), document.createTextNode('.')));
}

function imageCsv(d) {
  const pr = d.profile, lines = [`${pr.axis}_um,incoherent,coherent${pr.object ? ',target' : ''}`];
  pr.positions.forEach((z, k) => lines.push([(z * 1e3).toPrecision(6), pr.incoherent[k].toPrecision(6), pr.coherent[k].toPrecision(6), ...(pr.object ? [pr.object[k].toPrecision(3)] : [])].join(',')));
  return `${lines.join('\n')}\n`;
}

const dB = v => (v > 0 ? `${formatNumber(-10 * Math.log10(v), 3)} dB` : '—');
// η, or why there is none: a core too far from the focus for the grid.
const etaText = (v, withDb = true) => (Number.isFinite(v) ? `${pct(v)}${withDb ? ` (${dB(v)})` : ''}` : 'not resolved on this pupil grid');

function renderCoupling(plot, body, r, d) {
  const f = d.fiber, s = d.scan;
  const host = (title, chart) => { const h = el('div', { class: 'chart-host bench-chart' }); plot.append(el('h3', { class: 'bench-chart-title', text: title }), h); chart(h); };
  host('Coupling against the core’s lateral offset', h => lineChart(h, null, {
    x: Array.from(s.lateral), xLabel: 'Core offset (µm)', yLabel: 'Coupling η (%)', yMin: 0,
    series: [
      { key: 'x', name: 'Moving in x', color: '--series-1', values: Array.from(s.x, v => 100 * v) },
      { key: 'y', name: 'Moving in y', color: '--series-2', dash: true, values: Array.from(s.y, v => 100 * v) },
    ],
    vlines: [{ x: f.offsetXUm, label: 'x set' }, ...(Math.abs(f.offsetYUm - f.offsetXUm) > 1e-9 ? [{ x: f.offsetYUm, label: 'y set' }] : [])],
    formatX: v => formatNumber(v, 3), formatY: v => formatNumber(v, 3),
  }));
  host('Coupling against the face’s axial position', h => lineChart(h, null, {
    x: Array.from(s.axial), xLabel: 'Face past the image plane (µm)', yLabel: 'Coupling η (%)', yMin: 0,
    series: [{ key: 'z', name: 'Coupling', color: '--series-1', values: Array.from(s.z, v => 100 * v) }],
    vlines: [{ x: f.axialUm, label: 'set' }],
    formatX: v => formatNumber(v, 3), formatY: v => formatNumber(v, 3),
  }));
  plot.append(exportBar(['Download CSV', () => downloadText(couplingCsv(d), `${fileSafe(r.system.name)}-coupling.csv`, 'text/csv')]));

  const use = el('button', { type: 'button', class: 'bench-button', text: `Use ${formatNumber(d.best.mfdUm, 3)} µm` });
  use.addEventListener('click', () => changeSetting('coupling', c => { c.mfdUm = Number(d.best.mfdUm.toPrecision(3)); }));
  const rows = [
    ['Coupling into the mode, η', etaText(d.eta)],
    { group: 'Where the light goes' },
    ['Perfect lens, aligned (mode mismatch only)', pct(d.ideal)],
    ['This lens, aligned (adds the aberrations)', pct(d.aligned)],
    ['This lens, as set (adds the misalignment)', etaText(d.eta, false)],
    ['Beam inside the entrance pupil', pct(d.inPupil)],
    ['Through the apertures', pct(d.transmission)],
    [`Uncoated surfaces at normal incidence${d.fresnelApplied ? '' : ' (not applied)'}`, pct(d.fresnel)],
    ['Power in the fiber mode ÷ beam power', etaText(d.total)],
    { group: 'Fiber' },
    ['Mode: 1/e² radius, divergence, Rayleigh range', `${umText(d.modeRadius)}, ${formatNumber(d.modeDivergence * 1e3, 3)} mrad, ${umText(d.modeRayleigh)}`],
    ['Best mode-field diameter for this beam, aligned', `${formatNumber(d.best.mfdUm, 3)} µm (η ${pct(d.best.eta)})`],
    ['Chief ray at the image, from the axis (the fiber’s axis follows it)', xy({ x: d.chiefAngle.x * 1e3, y: d.chiefAngle.y * 1e3 }, v => `${formatNumber(v, 3)} mrad`)],
    ['Image-space NA, traced', xy(d.na, v => formatNumber(v, 4))],
  ];
  body.append(el('h3', { text: 'Coupling' }), table('Coupling figures', rows), el('div', { class: 'bench-export' }, use),
    el('p', { class: 'bench-note' }, document.createTextNode('η is the share of the light reaching the fiber’s face that enters its mode; the light lost before the face is listed under it. '),
      el('a', { href: '#reading-coupling', text: 'How to read the coupling' }), document.createTextNode('.')));
}

function couplingCsv(d) {
  const s = d.scan, lines = ['offset_um,eta_moving_x,eta_moving_y,face_past_image_um,eta_axial'];
  // Positions the grid cannot resolve are left empty.
  for (let k = 0; k < s.lateral.length; k++) lines.push([s.lateral[k], s.x[k], s.y[k], s.axial[k], s.z[k]].map(v => (Number.isFinite(v) ? Number(v).toPrecision(6) : '')).join(','));
  return `${lines.join('\n')}\n`;
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
