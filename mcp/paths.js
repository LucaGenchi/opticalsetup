// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { PATH_TOOLS, PATH_WIDTH_FIELD, FIBER_INPUT_FIELDS, FIBER_OUTPUT_FIELDS, createDrawnPath, pathMeta } from '../sketch/js/path-types.js';
import { FIBER_PROPAGATION_FIELDS, HOLLOW_CORE_FIELDS, EXTRA_LOSS_FIELD, CAPILLARY_LOSS_MODELS, normalizeHollowCore } from '../sketch/js/fiber.js';
import { parseSketch } from '../sketch/js/state.js';
import { SceneError } from './errors.js';
export const MAX_PATH_POINTS = 256;
export const pathType = path => path.kind === 'fiber' ? (path.bare ? 'barefiber' : 'fiber') : 'beam';
export function pathDefinition(type) {
  const def = PATH_TOOLS.find(p => p.tool === type);
  if (!def) throw new SceneError('Unknown path type: ' + type + '. Use fiber, barefiber or beam.');
  return def;
}
export function pathView(path) {
  const { id, kind, pts, ...parameters } = path;
  const type = pathType(path), def = pathDefinition(type);
  return { id, type, label: def.label, points: pts, parameters, capability: pathMeta(path) };
}
export function pathSchema(type, parameters = {}) {
  const def = pathDefinition(type);
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) throw new SceneError('parameters must be an object');
  const raw = { ...createDrawnPath(type, []), ...parameters, kind: def.kind, pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  const defaults = parseSketch({ elements: [], beams: [raw] }).beams[0];
  const numeric = p => ({ ...p, type: 'number', default: defaults[p.key] ?? p.default, editable: true });
  const fields = [
    { key: 'color', label: 'Color', type: 'color', default: defaults.color, editable: true },
    numeric(PATH_WIDTH_FIELD),
  ];
  const checkbox = (key, label, fallback) => ({ key, label, type: 'checkbox', default: defaults[key] ?? fallback, editable: true });
  if (def.kind === 'beam') fields.push(checkbox('dash', 'Dashed', false), checkbox('arrow', 'Arrowhead', true));
  else {
    fields.push(checkbox('bare', 'Without connectors', def.bare), checkbox('propagate', 'Beam propagates', true),
      { key: 'fiberModel', label: 'Fiber model', type: 'select', default: defaults.fiberModel || 'linear', options: [['linear', 'Linear dispersion'], ['argon', 'Hollow core · argon']], editable: true },
      ...FIBER_INPUT_FIELDS.map(numeric), ...FIBER_PROPAGATION_FIELDS.map(numeric),
      ...HOLLOW_CORE_FIELDS.map(numeric), numeric(EXTRA_LOSS_FIELD),
      checkbox('kerrEnabled', 'Kerr nonlinearity', normalizeHollowCore().kerrEnabled),
      { key: 'lossModel', label: 'Loss model', type: 'select', default: defaults.lossModel || normalizeHollowCore().lossModel, options: CAPILLARY_LOSS_MODELS, editable: true });
    for (const end of [0, 1]) fields.push({ key: 'out' + end, label: 'Output at end ' + (end ? 'B' : 'A'), type: 'object', default: defaults['out' + end], editable: true,
      fields: FIBER_OUTPUT_FIELDS.map(p => ({ ...p, editable: true })) });
  }
  if (def.kind === 'fiber') for (const field of fields) {
    const argon = defaults.fiberModel === 'argon';
    field.visible = ['color', 'width', 'bare', 'propagate'].includes(field.key) || defaults.propagate;
    if (['groupIndex', 'beta2Ps2PerKm'].includes(field.key)) field.visible &&= !argon;
    if ([...HOLLOW_CORE_FIELDS.map(p => p.key), EXTRA_LOSS_FIELD.key, 'kerrEnabled', 'lossModel'].includes(field.key)) field.visible &&= argon;
    if (field.key === 'lossDbPerM') field.visible &&= !argon || defaults.lossModel === 'manual';
  }
  return { type, kind: 'path', label: def.label, category: def.kind === 'fiber' ? 'Fibers' : 'Annotations',
    storage: 'scene.beams', creationTool: 'add_paths', editTool: 'update_paths', removeTool: 'remove_paths',
    points: { units: 'mm', minItems: 2, maxItems: MAX_PATH_POINTS, endA: 'first point', endB: 'last point' },
    capability: pathMeta(defaults), parameters: fields };
}
export function validatePathPoints(points) {
  if (!Array.isArray(points) || points.length < 2 || points.length > MAX_PATH_POINTS) throw new SceneError(`Provide 2–${MAX_PATH_POINTS} path points`);
  for (const p of points) for (const key of ['x', 'y']) {
    if (!p || typeof p[key] !== 'number' || !Number.isFinite(p[key]) || Math.abs(p[key]) > 100000) throw new SceneError('Path coordinates must be finite numbers within ±100000 mm');
  }
  return points.map(({ x, y }) => ({ x, y }));
}
export function applyPathParameters(path, patch) {
  const fields = pathSchema(pathType(path), path).parameters;
  function validate(specs, values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new SceneError('Path parameters must be an object');
    for (const [key, value] of Object.entries(values)) {
      const spec = specs.find(p => p.key === key);
      if (!spec) throw new SceneError(`Path parameter ${key} is not editable; use get_component_schema`);
      if (spec.type === 'object') validate(spec.fields, value);
      else if (spec.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) throw new SceneError(key + ' must be a finite number');
      else if (spec.type === 'checkbox' && typeof value !== 'boolean') throw new SceneError(key + ' must be a boolean');
      else if (spec.type === 'color' && (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value))) throw new SceneError(key + ' must be a six-digit hex color');
      else if (spec.type === 'select' && !spec.options.some(([v]) => v === value)) throw new SceneError('Unsupported value for ' + key + '; use get_component_schema');
    }
  }
  validate(fields, patch);
  const model = patch.fiberModel || path.fiberModel || 'linear';
  const hollowKeys = [...HOLLOW_CORE_FIELDS.map(p => p.key), EXTRA_LOSS_FIELD.key, 'kerrEnabled', 'lossModel'];
  if (path.kind === 'fiber' && model !== 'argon' && Object.keys(patch).some(key => hollowKeys.includes(key))) throw new SceneError('Hollow-core controls require fiberModel:argon in the same patch or current path');
  for (const [key, value] of Object.entries(patch)) path[key] = key === 'out0' || key === 'out1' ? { ...path[key], ...value } : value;
}
