// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash, randomUUID } from 'node:crypto';
import { TOOLS as LAB_TOOLS, UI_URI } from './tool-definitions.js';
import { emptyDocument, normalizeScene, mutateDocument, documentView, componentSchema, searchComponents, SceneError } from './scene-api.js';
import { appIcons } from './widget.js';
import { canonicalJSON } from './web/snapshot.js';
export const VERSION = '1.0.0';
export const sceneHash = scene => createHash('sha256').update(canonicalJSON(scene)).digest('hex');
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const sceneSchema = { type: 'object', properties: { app: { type: 'string', enum: ['optics2d'] }, version: { type: 'integer', enum: [1] }, elements: { type: 'array', maxItems: 200, items: { type: 'object', additionalProperties: true } }, beams: { type: 'array', maxItems: 100, items: { type: 'object', additionalProperties: true } } }, required: ['elements'], additionalProperties: true };
const setupSchema = object({ id: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' }, revision: { type: 'integer', minimum: 0, maximum: 1000000000 }, scene: sceneSchema, hash: { type: 'string', pattern: '^[a-f0-9]{64}$' }, channel: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Opaque live delivery channel from the browser context. Copy it unchanged; never invent it.' } }, ['revision', 'scene']);
const editNames = new Set(['add_components', 'move_components', 'set_component_parameters', 'remove_components', 'add_paths', 'update_paths', 'remove_paths', 'undo_setup', 'redo_setup']);
const historyEdit = name => name === 'undo_setup' || name === 'redo_setup';
const workspaceRef = { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Opaque workspace reference from the latest workbench context. Copy it unchanged.' };
const revision = { type: 'integer', minimum: 0, maximum: 1000000000 };
const page = { offset: { type: 'integer', minimum: 0, maximum: 300 }, limit: { type: 'integer', minimum: 1, maximum: 20 } };
const ids = { type: 'array', minItems: 1, maxItems: 20, items: { type: 'string' } };
const curve = {
  curve: { type: 'string', maxLength: 120, pattern: '^[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)*$', description: 'Name of one sampled curve, exactly as a reading gives it. Needs exactly one ID in ids.' },
  sampleOffset: { type: 'integer', minimum: 0, maximum: 100000 }, sampleLimit: { type: 'integer', minimum: 1, maximum: 256 },
};
const output = { type: 'object', additionalProperties: true };
const descriptions = {
  open_setup: 'Open the interactive OpticalSetup workbench. Pass workspaceRef to reopen a connected setup, or omit it to start an empty one. Returns the workspaceRef of the view it opens, which can be used at once. A standalone client can supply an explicit setup snapshot to open it in the workbench.',
  get_setup: 'Get the workbench revision, component and path counts, and undo/redo availability. Use get_items for IDs and controls. A standalone client can summarize its own explicit setup snapshot.',
  inspect_setup: 'Run the native 2D tracer on the current workspace. Returns a page of detector and fiber readings with model limits. Filter by IDs with ids. A reading keeps its numbers and notes and leaves out its sampled curves (a spectrum, a pulse envelope), naming each with its length. To read one, pass a single ID in ids with curve, and sampleOffset and sampleLimit for the window. A standalone client can pass an explicit setup snapshot.',
  get_setup_screenshot: 'Render the setup as a fitted PNG using the native geometry and tracer. Supply expectedRevision to verify a specific edit. The returned image is a static scene export.',
  undo_setup: 'Undo the last workbench edit at expectedRevision. The browser owns its history. Only standalone snapshot clients need to supply targetScene.',
  redo_setup: 'Redo the last undone workbench edit at expectedRevision. The browser owns its history. Only standalone snapshot clients need to supply targetScene.',
};
export const TOOLS = LAB_TOOLS.filter(t => !['replace_setup', 'save_setup_screenshot'].includes(t.name)).map(original => {
  const t = structuredClone(original);
  t.securitySchemes = [{ type: 'noauth' }];
  t.annotations.idempotentHint = t.name !== 'open_setup';
  t._meta = { ...t._meta, securitySchemes: t.securitySchemes };
  if (['search_components', 'get_component_schema'].includes(t.name)) {
    t.outputSchema = t.name === 'search_components' ? object({ total: { type: 'integer' }, components: { type: 'array', items: { type: 'object' } } }, ['total', 'components']) : { ...output, properties: { type: { type: 'string' } }, required: ['type'] };
    return t;
  }
  const properties = { ...t.inputSchema.properties, workspaceRef };
  for (const key of ['setupId', 'ifRevision']) delete properties[key];
  if (properties.expectedRevision) properties.expectedRevision = revision;
  properties.setup = { ...setupSchema, description: 'Explicit full snapshot for standalone clients. In a workbench always use workspaceRef instead.' };
  if (historyEdit(t.name)) properties.targetScene = { ...sceneSchema, description: 'Standalone snapshot mode only: the caller’s undo or redo scene.' };
  if (t.name === 'inspect_setup') Object.assign(properties, { ...page, ids, ...curve });
  t.inputSchema = object(properties, t.inputSchema.required.filter(key => key !== 'expectedRevision'));
  t.description = descriptions[t.name] || original.description
    .replaceAll('get_setup.paths', 'get_items with kind path')
    .replace('Returns actual IDs and normalized parameters. ', 'Returns the IDs added. ')
    .replace('Reports normalized parameters after the edit.', 'Read normalized parameters with get_items and details.')
    .replace('current IDs/revision from get_setup', 'component IDs from get_items and the revision from get_setup')
    + ' Use workspaceRef and expectedRevision. Success confirms the workbench applied the edit. Standalone clients can supply an explicit setup snapshot.';
  t.outputSchema = { ...output, properties: { setupId: { type: 'string' }, revision, hash: { type: 'string' }, setup: setupSchema } };
  return t;
});
TOOLS.push({
  name: 'get_items', title: 'Find items in the current setup',
  description: 'List one page of components or drawn paths by label, type, or exact IDs. Include details for native parameters and path points. Use the returned stable IDs for edits.',
  inputSchema: object({ workspaceRef, ...page, ids, kind: { type: 'string', enum: ['component', 'path'] }, query: { type: 'string', maxLength: 120 }, details: { type: 'boolean' } }, ['workspaceRef']),
  outputSchema: { ...output, properties: { items: { type: 'array' }, revision }, required: ['items', 'revision'] },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  securitySchemes: [{ type: 'noauth' }], _meta: { securitySchemes: [{ type: 'noauth' }] },
});
const canRender = service => service?.screenshots !== false;
const toolsFor = service => canRender(service) ? TOOLS : TOOLS.filter(t => t.name !== 'get_setup_screenshot');
const instructionsFor = service => 'Open the OpticalSetup workbench before editing. open_setup returns a workspaceRef for the view it opens; the workbench context repeats it, with the current revision and selection. Pass workspaceRef to get_setup, get_items and inspect_setup. Pass it with expectedRevision to edit. Each edit needs a unique clientRequestId. For exact retries reuse the same ID and arguments. Only status applied confirms the browser accepted an edit. If the workbench changed, read get_setup again. If the reference is unavailable, ask the user to open or reconnect the workbench. Keep the existing view open while editing. Browser storage owns the scene and Undo/Redo. A client that shows no workbench view cannot use that reference: it supplies its own full setup and chains the returned snapshots. Discover native controls with search_components/get_component_schema. Fibers and manual beams use the path tools.' + (canRender(service) ? ' Verify an edit with get_setup_screenshot.' : '') + ' Describe the limits of the existing 2D model. The service cannot purchase or publish anything, send messages, or certify clinical safety. Official website: https://opticalsetup.com.';
// Every handshake-era revision is served the same way, so a client is answered in the revision it asked for.
const HANDSHAKE_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
function validate(schema, value, path = 'arguments', depth = 0) {
  if (depth > 40) throw new SceneError('Arguments are nested too deeply');
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SceneError(path + ' must be an object');
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) throw new SceneError(path + '.' + key + ' is required');
    for (const [key, field] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new SceneError('Unsupported property');
      if (schema.properties?.[key]) validate(schema.properties[key], field, path + '.' + key, depth + 1);
      else if (schema.additionalProperties === false) throw new SceneError('Unknown argument ' + path + '.' + key);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? 1000)) throw new SceneError(path + ' has an invalid size');
    if (schema.items) value.forEach((v, i) => validate(schema.items, v, `${path}[${i}]`, depth + 1));
  } else if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') throw new SceneError(path + ' must be a boolean');
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length < (schema.minLength || 0) || value.length > (schema.maxLength || 500)) throw new SceneError(path + ' must be bounded text');
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) throw new SceneError(path + ' has an invalid format');
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value)) || value < schema.minimum || value > schema.maximum) throw new SceneError(path + ' is outside its numeric bounds');
  }
  if (schema.enum && !schema.enum.includes(value)) throw new SceneError(path + ' has an unsupported value');
}
export function snapshot(value) {
  if (!value) { const doc = emptyDocument(); return { id: randomUUID(), revision: 0, scene: doc.scene, hash: sceneHash(doc.scene) }; }
  validate(setupSchema, value, 'setup');
  const scene = normalizeScene(value.scene);
  const hash = sceneHash(scene);
  if (value.hash && value.hash !== hash) throw new SceneError('Snapshot hash does not match its scene. Use the latest complete snapshot.', 'SNAPSHOT_MISMATCH');
  return { id: value.id || 'supplied', revision: value.revision, scene, hash, ...(value.channel ? { channel: value.channel } : {}) };
}
function view(setup, extra = {}) {
  const doc = { ...emptyDocument(), ...setup };
  const { components, paths } = documentView(doc, false);
  return { setup, components, paths, ...extra };
}
export const setupVersion = setup => ({ setupId: setup.id, revision: setup.revision, hash: setup.hash });
function summary(setup) {
  return {
    ...setupVersion(setup),
    ...(setup.workspaceRef && { workspaceRef: setup.workspaceRef }),
    componentCount: setup.scene.elements.length, pathCount: setup.scene.beams.length,
    canUndo: setup.canUndo ?? false, canRedo: setup.canRedo ?? false,
  };
}
const result = data => ({ resultType: 'complete', structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] });
function mutate(setup, name, args) {
  if (historyEdit(name)) return normalizeScene(args.targetScene);
  const doc = { ...emptyDocument(), revision: setup.revision, scene: setup.scene };
  const next = mutateDocument(doc, name, { ...args, expectedRevision: setup.revision }).document.scene;
  // Stable IDs when a standalone client repeats an edit against the same base.
  const before = new Set([...setup.scene.elements, ...setup.scene.beams].map(item => item.id));
  let index = 0;
  for (const item of [...next.elements, ...next.beams]) {
    if (!before.has(item.id)) item.id = 'mcp_' + sceneHash({ base: setup.hash, action: name, request: args.clientRequestId, index: index++ }).slice(0, 24);
  }
  return next;
}
function paginate(items, { offset = 0, limit = 12 }) {
  return { items: items.slice(offset, offset + limit), total: items.length, nextOffset: offset + limit < items.length ? offset + limit : null };
}
function selectedItems(setup, args) {
  const { components, paths } = documentView({ ...emptyDocument(), ...setup }, false);
  const items = [...components.map(item => ({ ...item, kind: 'component' })), ...paths.map(item => ({ ...item, kind: 'path' }))];
  const query = args.query?.toLowerCase();
  const matches = items.filter(item => (!args.kind || args.kind === item.kind) &&
    (!args.ids || args.ids.includes(item.id)) && (!query || [item.id, item.type, item.label].some(value => value?.toLowerCase().includes(query))));
  return { ...setupVersion(setup), ...paginate(matches.map(({ parameters, points, capability, ...item }) =>
    args.details ? { ...item, parameters, points, capability } : item), args) };
}
// A reading is the editor's own object, and some of its fields are the curves the editor plots:
// a spectrum, a pulse envelope, a field. They are nearly all of its size, and the numbers that
// sum them up (band limits, duration, energy, peak power) are in the reading beside them. So a
// reading gives each curve's name and length in its place, and one curve is read by that name,
// a window at a time. A list of notes is never a curve, however long: caveats always arrive.
const CURVE_FROM = 9;
const isCurve = value => Array.isArray(value) && value.length >= CURVE_FROM && !value.every(item => typeof item === 'string' && item.includes(' '));
export function compactReading(value, path = []) {
  if (isCurve(value)) return { omitted: value.length, curve: path.join('.') };
  if (Array.isArray(value)) return value.map((item, index) => compactReading(item, [...path, index]));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compactReading(item, [...path, key])]));
  return value;
}
const compactItem = item => ({ ...item, reading: compactReading(item.reading) });
function curveWindow(readings, args) {
  if (args.ids?.length !== 1) throw new SceneError('Name one reading in ids to read a curve.');
  const [id] = args.ids, item = readings.find(reading => reading.id === id);
  const path = args.curve.split('.');
  let value = item?.reading;
  for (const key of path) value = value && typeof value === 'object' && Object.hasOwn(value, key) ? value[key] : undefined;
  if (!isCurve(value)) throw new SceneError(`${id} has no curve named ${args.curve}. Use a name its reading gives.`);
  const offset = args.sampleOffset ?? 0, end = offset + (args.sampleLimit ?? 128);
  // A sample that holds a curve of its own gives its name in turn, so a window stays a window.
  const values = value.slice(offset, end).map((sample, index) => compactReading(sample, [...path, offset + index]));
  return { id, type: item.type, curve: args.curve, total: value.length, offset, values, nextOffset: end < value.length ? end : null };
}
async function readSetup(name, setup, args, service) {
  if (args.expectedRevision !== undefined && args.expectedRevision !== setup.revision) throw new SceneError('The setup has a different revision. Read get_setup again.', 'REVISION_CONFLICT');
  if (name === 'get_setup_screenshot') {
    const { data, width, height } = await service.compute('screenshot', setup.scene);
    const response = result({ ...setupVersion(setup), width, height, format: 'png' });
    response.content.push({ type: 'image', mimeType: 'image/png', data });
    return response;
  }
  if (name === 'inspect_setup') {
    const traced = await service.compute('inspect', setup.scene);
    const { detectors = [], paths = [] } = traced;
    if (args.curve) return result({ ...setupVersion(setup), ...curveWindow([...detectors, ...paths], args) });
    if (args.sampleOffset !== undefined || args.sampleLimit !== undefined) throw new SceneError('sampleOffset and sampleLimit read one curve. Name it with curve.');
    if (!setup.workspaceRef) return result({ ...traced, detectors: detectors.map(compactItem), paths: paths.map(compactItem), ...setupVersion(setup) });
    // Each reading comes with what its detector or fiber models, as it does for a standalone snapshot.
    const readings = [
      ...detectors.map(({ id, type, reading, capability }) => ({ id, type, reading, capability, kind: 'detector' })),
      ...paths.filter(({ type }) => ['fiber', 'barefiber'].includes(type))
        .map(({ id, type, reading, readoutNote, capability }) => ({ id, type, reading, readoutNote, capability, kind: 'fiber' })),
    ];
    const matches = readings.filter(item => !args.ids || args.ids.includes(item.id)).map(compactItem);
    return result({ ...setupVersion(setup), scope: traced.scope, ...paginate(matches, args) });
  }
  if (name === 'get_items') return result(selectedItems(setup, args));
  return result(setup.workspaceRef ? summary(setup) : view(setup));
}

const discoveryResult = data => ({ resultType: 'complete', ttlMs: 0, cacheScope: 'private', ...data });
export async function handleStatelessRpc(body, service) {
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') return { jsonrpc: '2.0', id: body?.id ?? null, error: { code: -32600, message: 'Invalid JSON-RPC request' } };
  if (body.id === undefined && body.method.startsWith('notifications/')) return null;
  try {
    let response;
    switch (body.method) {
      case 'initialize': response = { protocolVersion: ['2026-07-28', ...HANDSHAKE_VERSIONS].includes(body.params?.protocolVersion) ? body.params.protocolVersion : HANDSHAKE_VERSIONS[0], capabilities: { tools: {}, resources: {}, extensions: { 'io.modelcontextprotocol/ui': {} } }, instructions: instructionsFor(service), serverInfo: { name: 'OpticalSetup', version: VERSION, icons: appIcons } }; break;
      case 'server/discover': response = discoveryResult({ supportedVersions: ['2026-07-28', '2025-11-25'], capabilities: { tools: {}, resources: {}, extensions: { 'io.modelcontextprotocol/ui': {} } }, instructions: instructionsFor(service), _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'OpticalSetup', version: VERSION, icons: appIcons } } }); break;
      case 'ping': response = {}; break;
      case 'tools/list': response = discoveryResult({ tools: toolsFor(service) }); break;
      case 'resources/list': response = discoveryResult({ resources: [{ uri: UI_URI, name: 'OpticalSetup workbench', mimeType: 'text/html;profile=mcp-app' }] }); break;
      case 'resources/templates/list': response = discoveryResult({ resourceTemplates: [] }); break;
      case 'resources/read':
        if (body.params?.uri !== UI_URI) throw new SceneError('Unknown resource', 'NOT_FOUND');
        response = discoveryResult({ contents: [{ uri: UI_URI, mimeType: 'text/html;profile=mcp-app', text: service.html, _meta: { ui: { prefersBorder: false, csp: { connectDomains: [service.origin], resourceDomains: [service.origin] } }, 'openai/widgetDomain': service.origin, 'openai/widgetCSP': { connect_domains: [service.origin], resource_domains: [service.origin], redirect_domains: ['https://opticalsetup.com'] }, 'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'] }, 'openai/widgetDescription': 'OpticalSetup with a browser-owned scene, local Undo/Redo and JSON save/load. MCP tools use a temporary in-memory scene while the workbench is connected.' } }] }); break;
      case 'tools/call': {
        const name = body.params?.name, args = body.params?.arguments || {};
        const definition = toolsFor(service).find(t => t.name === name);
        if (!definition) throw new SceneError('Unknown tool', 'NOT_FOUND');
        validate(definition.inputSchema, args);
        if (name === 'search_components') response = result(searchComponents(args.query, args.category, args.limit));
        else if (name === 'get_component_schema') response = result(componentSchema(args.type, args.parameters));
        else {
          if (args.setup && args.workspaceRef) throw new SceneError('Use either workspaceRef or setup.');
          if (args.workspaceRef && !service.mirror) throw new SceneError('Open the OpticalSetup workbench to connect a workspace.', 'WORKSPACE_UNAVAILABLE');
          if (name === 'open_setup') {
            const setup = args.workspaceRef ? await service.mirror.read(args.workspaceRef) : snapshot(args.setup);
            // The view that this call opens does not exist yet. The model is given the reference it
            // will answer to, and the view the ticket that takes it up, which the model never sees.
            const invitation = service.mirror?.invite();
            const open = { ...summary(setup), ...(invitation && { workspaceRef: invitation.workspaceRef }), open: true };
            const { id, revision, hash, scene, channel } = setup;
            response = { ...result(open), _meta: { opticalsetup: { setup: { id, revision, hash, scene, ...(channel && { channel }) }, ...(invitation && { ticket: invitation.ticket }) } } };
          } else if (args.workspaceRef && editNames.has(name)) {
            if (args.expectedRevision === undefined || args.targetScene) throw new SceneError('Workspace edits require expectedRevision and use browser-owned history.');
            const applied = await service.mirror.edit(name, args, mutate);
            response = result(applied);
          } else if (args.workspaceRef) {
            response = await readSetup(name, await service.mirror.read(args.workspaceRef), args, service);
          } else {
            if (!args.setup) throw new SceneError('A workspaceRef or explicit setup snapshot is required.');
            const setup = snapshot(args.setup);
            if (editNames.has(name)) {
              if (args.expectedRevision !== undefined && args.expectedRevision !== setup.revision) throw new SceneError('The setup has a different revision.', 'REVISION_CONFLICT');
              if (historyEdit(name) && !args.targetScene) throw new SceneError('Standalone undo and redo require targetScene.');
              const next = mutate(setup, name, args);
              const proposal = view({ ...setup, revision: setup.revision + 1, scene: next, hash: sceneHash(next) }, { baseRevision: setup.revision, baseHash: setup.hash, clientRequestId: args.clientRequestId, action: name });
              proposal.delivery = service.deliver?.(setup.channel, proposal) || 'not_requested';
              response = result(proposal);
            } else response = await readSetup(name, setup, args, service);
          }
        }
        break;
      }
      default: return { jsonrpc: '2.0', id: body.id ?? null, error: { code: -32601, message: 'Method not found' } };
    }
    return { jsonrpc: '2.0', id: body.id ?? null, result: response };
  } catch (error) {
    const safe = error instanceof SceneError ? error : new SceneError('Setup processing failed. Check the current workbench before retrying.', 'INTERNAL_ERROR');
    if (body.method === 'tools/call') return { jsonrpc: '2.0', id: body.id ?? null, result: { resultType: 'complete', isError: true, structuredContent: { error: { code: safe.code, message: safe.message } }, content: [{ type: 'text', text: safe.message }] } };
    return { jsonrpc: '2.0', id: body.id ?? null, error: { code: -32602, message: safe.message } };
  }
}
