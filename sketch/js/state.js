// App state, undo/redo, autosave.

import { distinctPoints, rotPt } from './util.js';
import { normalizePolygonPoints, polygonBounds } from './polygon.js';

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

function normalizeParam(value, spec) {
  if (spec.type === 'layers') return normalizeLayers(value);
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
    return spec.options.some(([option]) => option === value) ? value : spec.def;
  }
  if (spec.type === 'number' || spec.type === 'optsize') {
    let n = finite(value) ? value : spec.def;
    if (!finite(n)) n = 0;
    if (spec.negative) {
      n = clamp(Math.abs(n), spec.min ?? 0, spec.max ?? Number.MAX_SAFE_INTEGER);
      return -n;
    }
    const lo = spec.type === 'optsize' ? (spec.min ?? 1) : (spec.min ?? -Number.MAX_SAFE_INTEGER);
    const hi = spec.type === 'optsize' ? (spec.max ?? 500) : (spec.max ?? Number.MAX_SAFE_INTEGER);
    return clamp(n, lo, hi);
  }
  return value ?? spec.def;
}

function normalizeElement(raw, definitions, used) {
  if (!record(raw) || typeof raw.type !== 'string') throw new Error('Sketch contains an invalid element');
  const def = definitions && Object.hasOwn(definitions, raw.type) ? definitions[raw.type] : null;
  if (definitions && !def) throw new Error(`Sketch uses an unknown element type: ${raw.type}`);
  if (!finite(raw.x) || !finite(raw.y)) throw new Error(`Element ${raw.type} has invalid coordinates`);
  const params = {};
  if (def) {
    for (const spec of def.params || []) params[spec.key] = normalizeParam(raw.params?.[spec.key], spec);
  } else {
    if (!record(raw.params)) throw new Error(`Element ${raw.type} has invalid parameters`);
    Object.assign(params, raw.params);
  }
  const rot = def?.rotatable === false ? 0 : finite(raw.rot) ? ((raw.rot % 360) + 360) % 360 : 0;
  let x = raw.x, y = raw.y;
  // Keep editable polygon bounds centered on the element transform. This makes
  // hit boxes, resize handles, labels, and exports agree while preserving the
  // exact world-space boundary of older or hand-edited sketch files.
  if (raw.type === 'freeglass' && Array.isArray(params.vertices) && params.vertices.length >= 3) {
    const b = polygonBounds(params.vertices), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    if (Math.abs(cx) > 1e-9 || Math.abs(cy) > 1e-9) {
      params.vertices = params.vertices.map(p => ({ x: p.x - cx, y: p.y - cy }));
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
  try { localStorage.setItem(AUTOSAVE_KEY, serialize()); } catch (_) { /* ignore */ }
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
