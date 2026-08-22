// App state, undo/redo, autosave.

import { distinctPoints, rotPt } from './util.js';
import { boundaryBounds, normalizeBoundaryPoints, normalizePolygonPoints } from './polygon.js';
import { migrateLegacyObjectiveParams, normalizeObjectiveParams } from './objective.js';
import { LEGACY_GLASS_ID, LEGACY_GLASS_REPLACEMENT } from './glass.js';
import { normalizeSurfaceTable } from './lensgroup.js';

// Elements whose boundary refracts and therefore carries per-surface
// transmission of its own.
const GLASS_BODY_TYPES = new Set(['thicklens', 'freeglass']);

export const state = {
  elements: [],   // optical elements
  beams: [],      // manual beams: {id, kind:'beam', pts:[{x,y}], color, width, dash, arrow}
  selection: null, // {kind:'element'|'beam', id}
  view: { x: 60, y: 40, z: 1 },
  showGrid: true,
  snap: true,
  showFocal: true,
  tool: 'select', // 'select' | 'beam' | 'place:<type>'
  demoMode: false, // wiki embed: single fixed element, no adding/moving/deleting
};

const undoStack = [], redoStack = [];
const listeners = [];
const AUTOSAVE_KEY = 'optics2d-autosave-v1';
const COLOR = /^#[0-9a-f]{6}$/i;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const finite = v => typeof v === 'number' && Number.isFinite(v);
const record = v => v && typeof v === 'object' && !Array.isArray(v);

function freshId(prefix, candidate, used) {
  let id = typeof candidate === 'string' && candidate ? candidate : '';
  if (!id || used.has(id)) {
    do { id = prefix + Math.random().toString(36).slice(2, 9); } while (used.has(id));
  }
  used.add(id);
  return id;
}

function normalizeLayers(value) {
  if (!Array.isArray(value)) return [];
  const types = new Set(['lensarray', 'grating', 'steer', 'speckle']);
  return value.slice(0, 4).filter(record).map(raw => {
    const type = types.has(raw.type) ? raw.type : 'lensarray';
    const n = finite(raw.n) ? raw.n : 3;
    const f = finite(raw.f) ? raw.f : 50;
    const lines = finite(raw.lines) ? raw.lines : 600;
    const angle = finite(raw.angle) ? raw.angle : 5;
    const div = finite(raw.div) ? raw.div : 8;
    return {
      type,
      n: Math.round(clamp(n, 1, 8)),
      f: clamp(f, -3000, 3000),
      lines: clamp(lines, 10, 3600),
      orders: typeof raw.orders === 'string' ? raw.orders.slice(0, 200) : '1',
      angle: clamp(angle, -360, 360),
      div: clamp(div, 0.5, 40),
    };
  });
}

// Specimen signal channels: up to five stacked emissions on one sample.
// Sketches saved before this existed carry no `channels` at all and are read
// through their legacy single `mode` instead (see legacySampleChannels).
function normalizeChannels(value) {
  if (!Array.isArray(value)) return [];
  const kinds = new Set(['fluor', 'raman', 'phase', 'tpef', 'thpef', 'shg', 'thg', 'sfg', 'cars', 'srs']);
  const materials = new Set(['lipid', 'protein', 'dmso', 'pmma', 'polystyrene', 'water']);
  const dyes = new Set(['custom', 'dapi', 'hoechst', 'gfp', 'rhodamine']);
  return value.slice(0, 5).filter(record).map(raw => ({
    kind: kinds.has(raw.kind) ? raw.kind : 'fluor',
    wl: clamp(finite(raw.wl) ? raw.wl : 520, 100, 4000),
    eff: clamp(finite(raw.eff) ? raw.eff : 0.1, 0, 1),
    epi: raw.epi === true,
    epiRatio: clamp(finite(raw.epiRatio) ? raw.epiRatio : 0.15, 0, 1),
    autoWl: raw.autoWl !== false,
    autoColor: raw.autoColor !== false,
    color: typeof raw.color === 'string' && COLOR.test(raw.color) ? raw.color : '#22c55e',
    material: materials.has(raw.material) ? raw.material : 'lipid',
    fluorophore: dyes.has(raw.fluorophore) ? raw.fluorophore : 'custom',
    retardance: clamp(finite(raw.retardance) ? raw.retardance : 90, 0, 360),
    axis: clamp(finite(raw.axis) ? raw.axis : 45, 0, 180),
    transferEff: clamp(finite(raw.transferEff) ? raw.transferEff : 0.1, 0.01, 0.5),
    requireOverlap: raw.requireOverlap !== false,
  }));
}

function resolveBound(bound, params, fallback) {
  const resolved = typeof bound === 'function' ? bound(params) : bound;
  return finite(resolved) ? resolved : fallback;
}

function normalizeParam(value, spec, params = {}) {
  if (spec.type === 'signals') return normalizeChannels(value);
  if (spec.type === 'layers') return normalizeLayers(value);
  if (spec.type === 'surfacetable') return value == null ? null : normalizeSurfaceTable(value);
  if (spec.type === 'boundary') return normalizeBoundaryPoints(value, spec.def || []);
  if (spec.type === 'points') return normalizePolygonPoints(value, spec.def || []);
  if (spec.type === 'checkbox') return typeof value === 'boolean' ? value : !!spec.def;
  if (spec.type === 'color') return typeof value === 'string' && COLOR.test(value) ? value : spec.def;
  if (spec.type === 'text') {
    const text = typeof value === 'string' ? value : String(spec.def ?? '');
    return spec.key === 'orders' ? text.slice(0, 200) : text;
  }
  if (spec.type === 'sensor') {
    return typeof value === 'string' ? value.slice(0, 128) : String(spec.def ?? '');
  }
  if (spec.type === 'select') {
    const options = [...(spec.options || []), ...(spec.legacyOptions || [])];
    return options.some(([option]) => option === value) ? value : spec.def;
  }
  if (spec.type === 'number' || spec.type === 'optsize') {
    let n = finite(value) ? value : spec.def;
    if (!finite(n)) n = 0;
    if (spec.negative) {
      n = clamp(
        Math.abs(n),
        resolveBound(spec.min, params, 0),
        resolveBound(spec.max, params, Number.MAX_SAFE_INTEGER),
      );
      return -n;
    }
    const lo = resolveBound(spec.min, params, spec.type === 'optsize' ? 1 : -Number.MAX_SAFE_INTEGER);
    const hi = resolveBound(spec.max, params, spec.type === 'optsize' ? 500 : Number.MAX_SAFE_INTEGER);
    return clamp(n, lo, hi);
  }
  return value ?? spec.def;
}

// The old all-in-one `laser` split into three types whose behavior used to be
// selected by params. A saved sketch (or a shared link, which encodes the
// whole scene in a URL) still names the old type, so it is routed here to
// whichever of the three now describes what it was configured to do. This is
// a type-level rename, so it has to happen before the registry lookup below.
function migrateLegacySourceType(raw) {
  if (raw.type !== 'laser') return raw.type;
  const p = record(raw.params) ? raw.params : {};
  if (p.bwMode === 'sc') return 'sclaser';
  return p.temporalMode === 'pulsed' ? 'pulsedlaser' : 'cwlaser';
}

// Params the old laser carried that the type it became no longer has. Runs
// only for elements literally saved as `laser`, never for the new types, so
// it cannot disturb a sketch written by the current format.
//
// `bwMode` is the one that matters: it used to decide whether `bandwidth`
// counted at all, and a monochromatic laser still stored whatever unused
// bandwidth sat in the field. Dropping bwMode without folding it in would
// hand that stale number to a source that now always honours it.
function migrateLegacyLaserParams(rawParams, migratedType) {
  const p = { ...rawParams };
  if (migratedType === 'pulsedlaser') {
    p.transformLimited = p.transformLimited === true; // the old default was off
    if (!p.transformLimited && p.bwMode !== 'band') p.bandwidth = 0;
  }
  if (migratedType === 'sclaser') {
    // A plain laser set to "Supercontinuum (white)" had no endpoint fields of
    // its own; the tracer gave it this fixed band.
    if (!finite(p.scMin)) p.scMin = 430;
    if (!finite(p.scMax)) p.scMax = 870;
  }
  return p;
}

function normalizeElement(raw, definitions, used) {
  if (!record(raw) || typeof raw.type !== 'string') throw new Error('Sketch contains an invalid element');
  const wasLegacyLaser = raw.type === 'laser';
  raw = { ...raw, type: migrateLegacySourceType(raw) };
  const def = definitions && Object.hasOwn(definitions, raw.type) ? definitions[raw.type] : null;
  if (definitions && !def) throw new Error(`Sketch uses an unknown element type: ${raw.type}`);
  if (!finite(raw.x) || !finite(raw.y)) throw new Error(`Element ${raw.type} has invalid coordinates`);
  const params = {};
  // The objective's old `f`/`aperture` params were retired outright in favor
  // of `magnification`/`na` — unlike the per-param `migrate` hook below,
  // which only ever sees keys that are still part of the current param
  // list, this needs the raw legacy values before they'd otherwise be
  // silently dropped for not matching any current spec.
  let rawParams = record(raw.params) ? raw.params : {};
  if (raw.type === 'objective') {
    rawParams = migrateLegacyObjectiveParams(rawParams);
  }
  // The original rough BK7 fit was replaced by the real N-BK7 catalogue
  // entry. Any sketch still naming it loads onto that instead of failing the
  // select's option check and silently falling back to a constant index.
  if (rawParams.material === LEGACY_GLASS_ID) {
    rawParams = { ...rawParams, material: LEGACY_GLASS_REPLACEMENT };
  }
  // Glass bodies used to carry per-surface transmission as a 0-1 fraction
  // while every other optic used a percentage. They now agree; the presence
  // of the retired key is what identifies a sketch saved before that.
  if (GLASS_BODY_TYPES.has(raw.type) && rawParams.transEff === undefined
      && Number.isFinite(Number(rawParams.transmission))) {
    rawParams = { ...rawParams, transEff: Number(rawParams.transmission) * 100 };
  }
  if (wasLegacyLaser) {
    rawParams = migrateLegacyLaserParams(rawParams, raw.type);
  }
  if (def) {
    for (const spec of def.params || []) {
      // `readout`/`derived` params have no storage of their own — always
      // computed fresh from other params — so there is nothing to normalize
      // or persist for them.
      if (spec.type === 'readout' || spec.type === 'derived') continue;
      // Earlier normalized params override raw input so dependent bounds can
      // safely read the medium/index selected just above the objective's NA.
      params[spec.key] = normalizeParam(rawParams[spec.key], spec, { ...rawParams, ...params });
    }
  } else {
    if (!record(raw.params)) throw new Error(`Element ${raw.type} has invalid parameters`);
    Object.assign(params, rawParams);
  }
  // Params added after a sketch format was already in the wild can declare a
  // `migrate` hook. It runs only when the saved element genuinely lacks the
  // key, deriving a value from whatever the old format did carry — the
  // plain default would otherwise erase that evidence before anyone reads it.
  for (const spec of def?.params || []) {
    if (spec.type === 'readout' || spec.type === 'derived') continue;
    if (spec.migrate && raw.params?.[spec.key] === undefined) params[spec.key] = spec.migrate(params);
  }
  if (raw.type === 'objective') Object.assign(params, normalizeObjectiveParams(params));
  const rot = def?.rotatable === false ? 0 : finite(raw.rot) ? ((raw.rot % 360) + 360) % 360 : 0;
  let x = raw.x, y = raw.y;
  // Keep editable polygon bounds centered on the element transform. This makes
  // hit boxes, resize handles, labels, and exports agree while preserving the
  // exact world-space boundary of older or hand-edited sketch files.
  if (raw.type === 'freeglass' && Array.isArray(params.vertices) && params.vertices.length >= 3) {
    const b = boundaryBounds(params.vertices), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    if (Math.abs(cx) > 1e-9 || Math.abs(cy) > 1e-9) {
      params.vertices = params.vertices.map(p => ({
        x: p.x - cx, y: p.y - cy, ...(p.arc === true ? { arc: true } : {}),
      }));
      const shift = rotPt(cx * (params.scale || 1), cy * (params.scale || 1), rot);
      x += shift.x; y += shift.y;
    }
  }
  return {
    id: freshId('e', raw.id, used), type: raw.type, x, y, rot,
    label: typeof raw.label === 'string' ? raw.label : '',
    showLabel: raw.showLabel === true,
    ...(raw.labelPos && ['b', 't', 'l', 'r'].includes(raw.labelPos) ? { labelPos: raw.labelPos } : {}),
    params,
  };
}

function normalizeFiberOutput(raw) {
  raw = record(raw) ? raw : {};
  return {
    mode: raw.mode === 'focus' ? 'focus' : 'diverge',
    na: clamp(finite(raw.na) ? raw.na : 0.12, 0.01, 0.95),
    focal: clamp(finite(raw.focal) ? raw.focal : 20, 2, 500),
    dia: clamp(finite(raw.dia) ? raw.dia : 6, 1, 30),
  };
}

function normalizeBeam(raw, used) {
  if (!record(raw)) throw new Error('Sketch contains an invalid manual beam');
  const kind = raw.kind ?? 'beam';
  if (kind !== 'beam' && kind !== 'fiber') throw new Error(`Unknown manual beam type: ${kind}`);
  const pts = distinctPoints(raw.pts);
  if (pts.length < 2) throw new Error(`${kind === 'fiber' ? 'Fiber' : 'Manual beam'} needs at least two distinct points`);
  const base = {
    id: freshId('b', raw.id, used), kind, pts,
    color: typeof raw.color === 'string' && COLOR.test(raw.color) ? raw.color : (kind === 'fiber' ? '#e8a800' : '#e02020'),
    width: clamp(finite(raw.width) ? raw.width : (kind === 'fiber' ? 4 : 2), 0.5, 20),
  };
  if (kind === 'fiber') {
    return {
      ...base,
      bare: raw.bare === true,
      propagate: raw.propagate === true,
      inputNA: clamp(finite(raw.inputNA) ? raw.inputNA : 0.22, 0.01, 0.95),
      groupIndex: clamp(finite(raw.groupIndex) ? raw.groupIndex : 1.468, 1, 2.2),
      lossDbPerM: clamp(finite(raw.lossDbPerM) ? raw.lossDbPerM : 0.2, 0, 100),
      out0: normalizeFiberOutput(raw.out0),
      out1: normalizeFiberOutput(raw.out1),
    };
  }
  return { ...base, dash: raw.dash === true, arrow: raw.arrow !== false };
}

export function parseSketch(text, definitions = null) {
  const d = typeof text === 'string' ? JSON.parse(text) : text;
  if (!record(d) || !Array.isArray(d.elements) || (d.beams !== undefined && !Array.isArray(d.beams))) {
    throw new Error('Not a valid optics sketch file');
  }
  if (d.app !== undefined && d.app !== 'optics2d') throw new Error('Not an OpticalSetup file');
  if (d.version !== undefined && d.version !== 1) throw new Error(`Unsupported sketch version: ${d.version}`);
  const used = new Set();
  return {
    elements: d.elements.map(el => normalizeElement(el, definitions, used)),
    beams: (d.beams || []).map(beam => normalizeBeam(beam, used)),
  };
}

export function onChange(fn) { listeners.push(fn); }

export function changed() {
  // Wiki/example/community embeds are deliberately interactive enough to let
  // readers try parameters, but they must never replace the user's real
  // workbench autosave when both pages share the same origin.
  if (!state.demoMode) {
    try { localStorage.setItem(AUTOSAVE_KEY, serialize()); } catch (_) { /* ignore */ }
  }
  for (const fn of listeners) fn();
}

function snapshot() {
  return JSON.stringify({ elements: state.elements, beams: state.beams });
}

export function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > 100) undoStack.shift();
  redoStack.length = 0;
}

export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;

function restore(snap) {
  const d = JSON.parse(snap);
  state.elements = d.elements;
  state.beams = d.beams;
  const sel = state.selection;
  if (sel && !findSelected()) state.selection = null;
  changed();
}

export function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
}

export function findSelected() {
  const s = state.selection;
  if (!s) return null;
  if (s.kind === 'multi') return null;
  if (s.kind === 'element') return state.elements.find(e => e.id === s.id) || null;
  return state.beams.find(b => b.id === s.id) || null;
}

export function serialize() {
  return JSON.stringify({ app: 'optics2d', version: 1, elements: state.elements, beams: state.beams }, null, 1);
}

export function replaceScene(scene, { resetHistory = false } = {}) {
  state.elements = scene.elements;
  state.beams = scene.beams;
  state.selection = null;
  if (resetHistory) { undoStack.length = 0; redoStack.length = 0; }
  changed();
}

export function deserialize(text, { resetHistory = true, definitions = null } = {}) {
  const scene = parseSketch(text, definitions);
  replaceScene(scene, { resetHistory });
  return scene;
}

export function loadAutosave(definitions = null) {
  try {
    const t = localStorage.getItem(AUTOSAVE_KEY);
    if (t) {
      const scene = parseSketch(t, definitions);
      state.elements = scene.elements; state.beams = scene.beams;
      undoStack.length = 0; redoStack.length = 0;
      return true;
    }
  } catch (_) {
    try { localStorage.removeItem(AUTOSAVE_KEY); } catch (_) { /* ignore */ }
  }
  return false;
}
