// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { registry, createElement, getElementMeta } from './registry.js';
import { traceScene, detectorReading, fiberReading } from '../sketch/js/raytrace.js';
import { PATH_TOOLS, createDrawnPath, pathMeta } from '../sketch/js/path-types.js';
import { pathSchema, pathView, validatePathPoints, applyPathParameters } from './paths.js';
import { canonicalScene } from './web/snapshot.js';
import { SceneError } from './errors.js';
export { SceneError } from './errors.js';
import { createHash } from 'node:crypto';

export const LIMITS = { elements: 200, beams: 100, operations: 40, coordinate: 100000 };
const READ_ONLY = new Set(['readout', 'derived', 'derived-select', 'section']);
const copy = value => JSON.parse(JSON.stringify(value));
const record = value => value && typeof value === 'object' && !Array.isArray(value);
function requireRecord(value, name) {
  if (!record(value)) throw new SceneError(`${name} must be an object`);
}
function number(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > LIMITS.coordinate) {
    throw new SceneError(`${name} must be a finite number within ±${LIMITS.coordinate}`);
  }
  return value;
}
function definition(type) {
  if (PATH_TOOLS.some(p => p.tool === type)) throw new SceneError(`${type} is a drawn path; use add_paths with ordered points. It is stored in scene.beams.`);
  if (typeof type !== 'string' || !Object.hasOwn(registry, type) || registry[type].hidden) {
    throw new SceneError(`Unknown component type: ${String(type)}. Search the component catalogue first.`);
  }
  return registry[type];
}
function parameterPatch(type, patch) {
  requireRecord(patch, 'parameters');
  const specs = definition(type).params || [];
  for (const [key, value] of Object.entries(patch)) {
    const spec = specs.find(p => p.key === key);
    if (!spec || READ_ONLY.has(spec.type)) throw new SceneError(`Parameter ${key} is not editable on ${type}`);
    if (spec.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new SceneError(`${key} must be a finite number`);
    }
    if (spec.type === 'checkbox' && typeof value !== 'boolean') throw new SceneError(`${key} must be a boolean`);
    if (spec.type === 'select' && Array.isArray(spec.options) && !spec.options.some(o => o[0] === value)) {
      throw new SceneError(`Unsupported value for ${key}; use get_component_schema`);
    }
  }
  return copy(patch);
}

export function componentSchema(type, parameters = {}) {
  if (PATH_TOOLS.some(p => p.tool === type)) return pathSchema(type, parameters);
  const def = definition(type);
  requireRecord(parameters, 'parameters');
  const params = { ...createElement(type).params, ...parameters };
  const bound = value => typeof value === 'function' ? value(params) : value;
  return {
    type, label: def.label, category: def.category, aliases: def.aliases || [],
    size: def.size, capability: getElementMeta(type, params),
    parameters: (def.params || []).filter(p => p.key).map(p => ({
      key: p.key, label: p.label, type: p.type, editable: !READ_ONLY.has(p.type),
      visible: typeof p.show === 'function' ? Boolean(p.show(params)) : true,
      default: p.def, min: bound(p.min), max: bound(p.max), step: p.step,
      options: Array.isArray(p.options) ? p.options : undefined,
    })),
  };
}

export function searchComponents(query = '', category = '', limit = 20) {
  if (typeof query !== 'string' || typeof category !== 'string') throw new SceneError('Search terms must be text');
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = Object.entries(registry).filter(([type, d]) => {
    const text = [type, d.label, d.category, ...(d.aliases || [])].join(' ').toLowerCase();
    return !d.hidden && (!category || d.category.toLowerCase() === category.toLowerCase()) && terms.every(t => text.includes(t));
  });
  const components = matches.map(([type, d]) => ({ type, label: d.label, category: d.category, aliases: d.aliases || [], capability: getElementMeta(type, createElement(type).params) }));
  for (const def of PATH_TOOLS) {
    const pathCategory = def.kind === 'fiber' ? 'Fibers' : 'Annotations';
    const aliases = def.kind === 'fiber' ? ['fibre', 'optical fiber', 'optical fibre', ...(def.bare ? ['bare', 'no connector'] : ['patch cable', 'connector'])] : ['manual', 'drawn', 'diagram'];
    const text = [def.tool, def.label, pathCategory, def.desc, ...aliases].join(' ').toLowerCase();
    if ((!category || pathCategory.toLowerCase() === category.toLowerCase()) && terms.every(t => text.includes(t))) components.push({ type: def.tool, kind: 'path', label: def.label, category: pathCategory, aliases, storage: 'scene.beams', creationTool: 'add_paths', editTool: 'update_paths', capability: pathMeta(createDrawnPath(def.tool, [])) });
  }
  return { total: components.length, components: components.slice(0, Math.max(1, Math.min(80, Number(limit) || 20))) };
}

export function normalizeScene(scene) {
  requireRecord(scene, 'scene');
  if (!Array.isArray(scene.elements) || scene.elements.length > LIMITS.elements || (scene.beams || []).length > LIMITS.beams) {
    throw new SceneError(`Scenes are limited to ${LIMITS.elements} components and ${LIMITS.beams} manual beams`);
  }
  for (const el of scene.elements) {
    number(el.x, 'x'); number(el.y, 'y');
    if (el.rot !== undefined) number(el.rot, 'rotation');
  }
  try { return canonicalScene(scene, registry); }
  catch (error) { throw new SceneError(error.message); }
}
export function emptyDocument(id = 'workspace') {
  return { id, revision: 0, scene: { app: 'optics2d', version: 1, elements: [], beams: [] }, history: [], future: [], receipts: [] };
}
function element(scene, id) {
  const el = scene.elements.find(e => e.id === id);
  if (!el && scene.beams.some(p => p.id === id)) throw new SceneError(`${id} is a drawn path. Use update_paths or remove_paths with its ID.`);
  if (!el) throw new SceneError(`Component ${id} does not exist. Read the current setup first.`, 'NOT_FOUND');
  return el;
}
function path(scene, id) {
  const p = scene.beams.find(b => b.id === id);
  if (!p) throw new SceneError(`Path ${id} does not exist. Read get_setup.paths first.`, 'NOT_FOUND');
  return p;
}

// Pure, atomic transformations. The storage adapter commits using revision CAS.
export function mutateDocument(document, action, args) {
  requireRecord(args, 'arguments');
  const requestId = args.clientRequestId;
  if (typeof requestId !== 'string' || requestId.length < 1 || requestId.length > 100) throw new SceneError('clientRequestId is required (1–100 characters)');
  const fingerprint = createHash('sha256').update(JSON.stringify({ action, ...args })).digest('hex');
  const receipt = document.receipts.find(r => r.id === requestId);
  if (receipt) {
    if (receipt.fingerprint !== fingerprint) throw new SceneError('clientRequestId was already used for a different edit', 'REQUEST_ID_REUSED');
    return { document, duplicate: true };
  }
  if (!Number.isInteger(args.expectedRevision) || args.expectedRevision !== document.revision) {
    throw new SceneError(`Setup changed: expected revision ${args.expectedRevision}, current revision ${document.revision}. Read it again before editing.`, 'REVISION_CONFLICT');
  }
  const next = copy(document);
  let scene = copy(document.scene);
  const pathEdit = ['add_paths', 'update_paths', 'remove_paths'].includes(action);
  const items = pathEdit ? args.paths : args.components;
  if (pathEdit || ['add_components', 'move_components', 'set_component_parameters', 'remove_components'].includes(action)) {
    if (!Array.isArray(items) || !items.length || items.length > LIMITS.operations) throw new SceneError(`Provide 1–${LIMITS.operations} ${pathEdit ? 'paths' : 'components'}`);
  }
  if (action === 'add_paths') {
    for (const item of items) {
      requireRecord(item, 'path');
      const schema = pathSchema(item.type);
      const drawn = createDrawnPath(schema.type, validatePathPoints(item.points));
      applyPathParameters(drawn, item.parameters || {}); scene.beams.push(drawn);
    }
  } else if (action === 'update_paths') {
    for (const item of items) {
      requireRecord(item, 'path'); const drawn = path(scene, item.id);
      if (item.points === undefined && item.dx === undefined && item.dy === undefined && item.parameters === undefined) throw new SceneError('Supply points, displacement or parameters');
      if (item.points !== undefined && (item.dx !== undefined || item.dy !== undefined)) throw new SceneError('Use replacement points or displacement, not both');
      if (item.points !== undefined) drawn.pts = validatePathPoints(item.points);
      if (item.dx !== undefined || item.dy !== undefined) {
        const dx = number(item.dx ?? 0, 'dx'), dy = number(item.dy ?? 0, 'dy');
        drawn.pts = validatePathPoints(drawn.pts.map(p => ({ x: p.x + dx, y: p.y + dy })));
      }
      if (item.parameters !== undefined) applyPathParameters(drawn, item.parameters);
    }
  } else if (action === 'remove_paths') {
    const ids = new Set(items.map(item => { path(scene, item.id); return item.id; }));
    scene.beams = scene.beams.filter(p => !ids.has(p.id));
  } else if (action === 'add_components') {
    for (const item of items) {
      requireRecord(item, 'component'); definition(item.type);
      const el = createElement(item.type, number(item.x, 'x'), number(item.y, 'y'));
      el.rot = item.rotation === undefined ? 0 : number(item.rotation, 'rotation');
      if (item.label !== undefined) { if (typeof item.label !== 'string' || item.label.length > 200) throw new SceneError('label must be text of at most 200 characters'); el.label = item.label; el.showLabel = true; }
      Object.assign(el.params, parameterPatch(item.type, item.parameters || {}));
      scene.elements.push(el);
    }
  } else if (action === 'move_components') {
    for (const item of items) {
      const el = element(scene, item.id);
      if (item.x === undefined && item.y === undefined && item.dx === undefined && item.dy === undefined && item.rotation === undefined) throw new SceneError('Supply a position, displacement, or rotation');
      if ((item.x !== undefined && item.dx !== undefined) || (item.y !== undefined && item.dy !== undefined)) throw new SceneError('Use absolute position or displacement for each axis');
      if (item.x !== undefined) el.x = number(item.x, 'x');
      if (item.y !== undefined) el.y = number(item.y, 'y');
      if (item.dx !== undefined) el.x = number(el.x + number(item.dx, 'dx'), 'x');
      if (item.dy !== undefined) el.y = number(el.y + number(item.dy, 'dy'), 'y');
      if (item.rotation !== undefined) el.rot = number(item.rotation, 'rotation');
    }
  } else if (action === 'set_component_parameters') {
    for (const item of items) { const el = element(scene, item.id); Object.assign(el.params, parameterPatch(el.type, item.parameters)); }
  } else if (action === 'remove_components') {
    const ids = new Set(items.map(item => { element(scene, item.id); return item.id; }));
    scene.elements = scene.elements.filter(el => !ids.has(el.id));
  } else if (action === 'replace_setup') {
    scene = normalizeScene(args.scene);
  } else if (action === 'undo_setup' || action === 'redo_setup') {
    const from = action === 'undo_setup' ? next.history : next.future;
    const to = action === 'undo_setup' ? next.future : next.history;
    if (!from.length) throw new SceneError(`Nothing to ${action === 'undo_setup' ? 'undo' : 'redo'}`, 'EMPTY_HISTORY');
    to.push(copy(document.scene)); scene = from.pop();
  } else throw new SceneError(`Unknown edit action ${action}`);
  if (!['undo_setup', 'redo_setup'].includes(action)) {
    next.history.push(copy(document.scene)); next.history = next.history.slice(-30); next.future = [];
  }
  next.scene = normalizeScene(scene); next.revision++;
  next.receipts.push({ id: requestId, fingerprint }); next.receipts = next.receipts.slice(-60);
  return { document: next, duplicate: false };
}

export function documentView(document, includeScene = true) {
  return { setupId: document.id, revision: document.revision, canUndo: Boolean(document.history.length), canRedo: Boolean(document.future.length),
    components: document.scene.elements.map(el => ({ id: el.id, type: el.type, label: el.label || registry[el.type]?.label, x: el.x, y: el.y, rotation: el.rot, parameters: el.params })),
    paths: document.scene.beams.map(pathView),
    ...(includeScene ? { scene: document.scene } : {}) };
}
export function inspectDocument(document) {
  traceScene(document.scene.elements, document.scene.beams);
  const detectors = document.scene.elements.filter(el => registry[el.type]?.readoutKind)
    .map(el => ({ id: el.id, type: el.type, reading: detectorReading(el.id), capability: getElementMeta(el.type, el.params, { element: el, elements: document.scene.elements }) }));
  const paths = document.scene.beams.map(p => ({ ...pathView(p), reading: p.kind === 'fiber' ? fiberReading(p.id) : null,
    readoutNote: p.kind === 'fiber' && p.fiberModel !== 'argon' ? 'Linear fibers have no dedicated solver readout; use a downstream detector or beam probe.' : undefined }));
  return { setupId: document.id, revision: document.revision, detectors, paths, scope: 'OpticalSetup’s existing 2D models; readings depend on source configuration and component model limits.' };
}
