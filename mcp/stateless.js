// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash, randomUUID } from 'node:crypto';
import { TOOLS as LAB_TOOLS, UI_URI } from './tool-definitions.js';
import { emptyDocument, normalizeScene, mutateDocument, documentView, componentSchema, searchComponents, SceneError } from './scene-api.js';
import { appIcons } from './widget.js';
import { canonicalJSON, scenePatch, applyScenePatch } from './web/snapshot.js';
export const VERSION = '1.0.0';
export const sceneHash = scene => createHash('sha256').update(canonicalJSON(scene)).digest('hex');
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const sceneSchema = { type: 'object', properties: { app: { type: 'string', enum: ['optics2d'] }, version: { type: 'integer', enum: [1] }, elements: { type: 'array', maxItems: 200, items: { type: 'object', additionalProperties: true } }, beams: { type: 'array', maxItems: 100, items: { type: 'object', additionalProperties: true } } }, required: ['elements'], additionalProperties: true };
const workspaceRefSchema = { type: 'string', pattern: '^[a-f0-9]{64}{ id: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' }, revision: { type: 'integer', minimum: 0, maximum: 1000000000 }, scene: sceneSchema, hash: { type: 'string', pattern: '^[a-f0-9]{64}$' }, channel: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Opaque live delivery channel from the browser context. Copy it unchanged; never invent it.' } }, ['revision', 'scene']);
const descriptions = {
  open_setup: 'Open the interactive OpticalSetup workbench in the chat. Supply the latest setup from the visible widget context or a preceding tool result; omit setup only for an empty workbench. Scenes are held by the browser, not saved on this service. Use Save JSON for a portable backup.',
  get_setup: 'Summarize the supplied setup, including stable component IDs and paths in scene.beams. This service cannot read browser storage. Always pass the latest full setup from the visible widget context or preceding result; never invent or silently substitute an empty scene.',
  inspect_setup: 'Run the native OpticalSetup 2D tracer on the supplied setup and report detector and fiber readings with model limits. The service does not store the setup. Null readings mean no detected light.',
  get_setup_screenshot: 'Render the supplied setup as a fitted PNG using OpticalSetup’s native SVG geometry and tracer. Returns actual image content with its scene hash and revision, without saving a scene or image. This is a static scene export, not a screenshot of the chat interface. Pass the latest full setup to verify an edit.',
  undo_setup: 'Return a scene restored from undoScene in the latest visible widget context. Pass that scene as targetScene and the current setup. Undo history is owned by the browser; this service has no account history.',
  redo_setup: 'Return a scene restored from redoScene in the latest visible widget context. Pass that scene as targetScene and the current setup. Redo history is owned by the browser.',
};
const statelessNames = new Set(['open_setup', 'get_setup', 'inspect_setup', 'get_setup_screenshot', 'undo_setup', 'redo_setup']);
const editNames = new Set(['add_components', 'move_components', 'set_component_parameters', 'remove_components', 'add_paths', 'update_paths', 'remove_paths', 'undo_setup', 'redo_setup']);
const viewOutput = object({ setup: setupSchema, components: { type: 'array', items: { type: 'object' } }, paths: { type: 'array', items: { type: 'object' } }, baseRevision: { type: 'integer' }, baseHash: { type: 'string' }, clientRequestId: { type: 'string' }, action: { type: 'string' }, delivery: { type: 'string', enum: ['sent', 'offline', 'not_requested'] } }, ['setup', 'components', 'paths']);
export const TOOLS = LAB_TOOLS.filter(t => !['replace_setup', 'save_setup_screenshot'].includes(t.name)).map(original => {
  const t = structuredClone(original);
  t.securitySchemes = [{ type: 'noauth' }];
  t.annotations.idempotentHint = true;
  t._meta = { ...t._meta, securitySchemes: t.securitySchemes };
  if (editNames.has(t.name)) t._meta = { ...t._meta, ui: { resourceUri: UI_URI }, 'openai/outputTemplate': UI_URI };
  if (t.name === 'open_setup') t.annotations.idempotentHint = false;
  if (['search_components', 'get_component_schema'].includes(t.name)) {
    t.outputSchema = t.name === 'search_components' ? object({ total: { type: 'integer' }, components: { type: 'array', items: { type: 'object' } } }, ['total', 'components']) : { type: 'object', properties: { type: { type: 'string' } }, required: ['type'], additionalProperties: true };
    return t;
  }
  const properties = { ...t.inputSchema.properties };
  for (const key of ['setupId', 'ifRevision', 'expectedRevision']) delete properties[key];
  properties.setup = { ...setupSchema, description: 'Legacy stateless fallback only. Prefer workspaceRef to avoid sending the whole scene through the model.' };
  properties.workspaceRef = workspaceRefSchema;
  properties.expectedRevision = { type: 'integer', minimum: 0, description: 'Recommended with workspaceRef: reject if the browser revision changed since the last read.' };
  if (['undo_setup', 'redo_setup'].includes(t.name)) properties.targetScene = { ...sceneSchema, description: t.name === 'undo_setup' ? 'undoScene from the latest visible widget context.' : 'redoScene from the latest visible widget context.' };
  const required = t.inputSchema.required.filter(key => !['expectedRevision'].includes(key));
  // Either workspaceRef or setup is required at runtime. JSON Schema cannot
  // express the old and new transport alternatives without breaking clients.
  t.inputSchema = object(properties, required);
  t.description = descriptions[t.name] || original.description.replace(/Read get_setup(?: and get_component_schema)? first\./g, 'Use the latest supplied setup and obtain native controls from get_component_schema.').replace(/Read the setup first/g, 'Use the latest supplied setup').replace(/saved revision/g, 'returned snapshot').replace(/active setup/g, 'supplied setup').replace(/active setup/g, 'supplied setup');
  if (!statelessNames.has(t.name)) t.description += ' Prefer workspaceRef from the widget context: the server holds an expiring in-memory mirror and returns a compact acknowledged edit. Without it, supply the full setup for legacy stateless processing. Never treat a proposed edit as applied before browser acknowledgement.';
  t.outputSchema = { type: 'object', additionalProperties: true };
  /* Legacy responses and compact session responses have different shapes.
  t.outputSchema = t.name === 'inspect_setup' ? { type: 'object', properties: { revision: { type: 'integer' }, detectors: { type: 'array' }, paths: { type: 'array' }, scope: { type: 'string' }, hash: { type: 'string' } }, required: ['revision', 'detectors', 'paths', 'scope', 'hash'], additionalProperties: true }
    : t.name === 'get_setup_screenshot' ? object({ revision: { type: 'integer' }, hash: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' }, format: { type: 'string', enum: ['png'] } }, ['revision', 'hash', 'width', 'height', 'format']) : viewOutput;
  */
  return t;
});
// An indexed read avoids transmitting the full parameters of every element.
TOOLS.push({
  name: 'get_items', title: 'Read selected optical elements and paths',
  description: 'Use with workspaceRef to fetch detailed parameters/points for up to 40 specific element or path IDs. get_setup lists IDs compactly. The full snapshot fallback is available with setup.',
  annotations: { readOnlyHint: true, openWorldHint: false },
  securitySchemes: [{ type: 'noauth' }],
  inputSchema: object({
    workspaceRef: workspaceRefSchema, setup: setupSchema,
    componentIds: { type: 'array', maxItems: 40, items: { type: 'string' } },
    pathIds: { type: 'array', maxItems: 40, items: { type: 'string' } }
  }),
  outputSchema: { type: 'object', additionalProperties: true }
});
// The PNG tool needs a renderer this machine may not have. A service without one
// neither lists the tool nor tells the model to verify edits with it.
const canRender = service => service?.screenshots !== false;
const toolsFor = service => canRender(service) ? TOOLS : TOOLS.filter(t => t.name !== 'get_setup_screenshot');
const instructionsFor = service => 'OpticalSetup is a browser-owned 2D optical editor. Prefer workspaceRef (opaque 64-hex token) from latest widget context for every call: it refers to a 30-minute in-memory mirror of that browser setup, so do not pass full scene JSON to the model or tools. Read get_setup for IDs/revision and get_items for selected parameters. A session edit returns a compact result only after the browser applies and acknowledges the patch. If the session is unavailable or no widget exists, the legacy full-setup stateless input remains available; never silently substitute an empty setup. The browser retains Undo/Redo and portable JSON; the mirror is not a database. Discover elements with search_components/get_component_schema; fibers and paths are scene.beams. Use unique clientRequestId and expectedRevision; if rejected, reread the current setup. Do not call open_setup after each edit. Descriptions are limited to actual 2D physics. Unsupported requests: purchasing, community publication, email and clinical certification. Official website https://opticalsetup.com.' + (canRender(service) ? ' Verify with get_setup_screenshot when needed.' : '');
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
const result = data => ({ resultType: 'complete', structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] });
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
        response = discoveryResult({ contents: [{ uri: UI_URI, mimeType: 'text/html;profile=mcp-app', text: service.html, _meta: { ui: { prefersBorder: false, csp: { connectDomains: [service.origin], resourceDomains: [service.origin] } }, 'openai/widgetDomain': service.origin, 'openai/widgetCSP': { connect_domains: [service.origin], resource_domains: [service.origin], redirect_domains: ['https://opticalsetup.com'] }, 'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'] }, 'openai/widgetDescription': 'OpticalSetup with a browser-owned scene, local Undo/Redo and JSON save/load. MCP operations process snapshots without storing them.' } }] }); break;
      case 'tools/call': {
        const name = body.params?.name, args = body.params?.arguments || {};
        const definition = toolsFor(service).find(t => t.name === name);
        if (!definition) throw new SceneError('Unknown tool', 'NOT_FOUND');
        validate(definition.inputSchema, args);
        if (name === 'search_components') response = result(searchComponents(args.query, args.category, args.limit));
        else if (name === 'get_component_schema') response = result(componentSchema(args.type, args.parameters));
        else {
          if (!args.workspaceRef && !args.setup && name !== 'open_setup') throw new SceneError('Provide workspaceRef from the workbench, or a complete setup snapshot.', 'MISSING_SETUP');
          if (args.workspaceRef && !service.sessions) throw new SceneError('Session transport unavailable', 'SESSION_UNAVAILABLE');
          if (args.workspaceRef && name !== 'open_setup') {
            const setup = service.sessions.read(args.workspaceRef);
            if (args.expectedRevision !== undefined && args.expectedRevision !== setup.revision) throw new SceneError('Workbench revision changed; call get_setup again.', 'REVISION_CONFLICT');
            if (editNames.has(name)) {
              if (name !== 'undo_setup' && name !== 'redo_setup' && !args.clientRequestId) throw new SceneError('clientRequestId is required');
              let nextScene = null, patch = null;
              if (!['undo_setup', 'redo_setup'].includes(name)) {
                const doc = { ...emptyDocument(), revision: setup.revision, scene: setup.scene };
                nextScene = mutateDocument(doc, name, { ...args, expectedRevision: setup.revision }).document.scene;
                const before = new Set([...setup.scene.elements, ...setup.scene.beams].map(x => x.id));
                let i = 0;
                for (const item of [...nextScene.elements, ...nextScene.beams]) if (!before.has(item.id)) item.id = 'mcp_' + sceneHash({ base: setup.hash, action: name, request: args.clientRequestId, index: i++ }).slice(0, 24);
                patch = scenePatch(setup.scene, nextScene);
                if (sceneHash(applyScenePatch(setup.scene, patch)) !== sceneHash(nextScene)) throw new SceneError('Incremental patch cannot reproduce this edit', 'PATCH_MISMATCH');
              }
              const fingerprint = sceneHash({ name, revision: setup.revision, args: { ...args, setup: undefined } });
              const offered = service.sessions.offer(args.workspaceRef, {
                requestId: args.clientRequestId, fingerprint, baseRevision: setup.revision, baseHash: setup.hash,
                action: name, nextScene, patch,
              });
              if (offered.fresh) {
                const proposal = {
                  workspaceRef: args.workspaceRef, setupId: setup.id, baseRevision: setup.revision,
                  baseHash: setup.hash, revision: setup.revision + 1, hash: nextScene ? sceneHash(nextScene) : undefined,
                  clientRequestId: args.clientRequestId, action: name,
                  ...(patch ? { patch } : { historyAction: name }),
                };
                if (service.deliver?.(args.workspaceRef, proposal) !== 'sent') {
                  service.sessions.fail(args.workspaceRef, args.clientRequestId, 'Open the workbench to apply edits; the server did not change its mirror.');
                }
              }
              response = result(await offered.promise);
            } else if (name === 'get_setup') {
              response = result({
                setupId: setup.id, revision: setup.revision, hash: setup.hash, workspaceRef: args.workspaceRef,
                counts: { elements: setup.scene.elements.length, paths: setup.scene.beams.length },
                components: setup.scene.elements.map(x => ({ id: x.id, type: x.type, label: x.label || undefined, x: x.x, y: x.y, rotation: x.rot })),
                paths: setup.scene.beams.map(x => ({ id: x.id, type: x.kind, points: x.pts?.length || 0 })),
              });
            } else if (name === 'get_items') {
              const components = (args.componentIds || []).map(id => {
                const item = setup.scene.elements.find(x => x.id === id);
                if (!item) throw new SceneError('Unknown component ' + id, 'NOT_FOUND');
                return item;
              });
              const paths = (args.pathIds || []).map(id => {
                const item = setup.scene.beams.find(x => x.id === id);
                if (!item) throw new SceneError('Unknown path ' + id, 'NOT_FOUND');
                return item;
              });
              response = result({ revision: setup.revision, hash: setup.hash, components, paths });
            } else if (name === 'inspect_setup') response = result({ ...await service.compute('inspect', setup.scene), revision: setup.revision, hash: setup.hash });
            else if (name === 'get_setup_screenshot') {
              const { data, width, height } = await service.compute('screenshot', setup.scene);
              response = result({ revision: setup.revision, hash: setup.hash, width, height, format: 'png' });
              response.content.push({ type: 'image', mimeType: 'image/png', data });
            } else response = result(view(setup));
          } else {
          const setup = snapshot(args.setup);
          if (name === 'get_items') {
            const components = (args.componentIds || []).map(id => {
              const item = setup.scene.elements.find(x => x.id === id);
              if (!item) throw new SceneError('Unknown component ' + id, 'NOT_FOUND');
              return item;
            });
            const paths = (args.pathIds || []).map(id => {
              const item = setup.scene.beams.find(x => x.id === id);
              if (!item) throw new SceneError('Unknown path ' + id, 'NOT_FOUND');
              return item;
            });
            response = result({ revision: setup.revision, hash: setup.hash, components, paths });
          } else if (editNames.has(name)) {
            let next;
            if (['undo_setup', 'redo_setup'].includes(name)) next = normalizeScene(args.targetScene);
            else {
              const doc = { ...emptyDocument(), revision: setup.revision, scene: setup.scene };
              next = mutateDocument(doc, name, { ...args, expectedRevision: setup.revision }).document.scene;
              // Stable retry IDs without a server receipt table or session storage.
              const before = new Set([...setup.scene.elements, ...setup.scene.beams].map(x => x.id));
              let i = 0;
              for (const item of [...next.elements, ...next.beams]) if (!before.has(item.id)) item.id = 'mcp_' + sceneHash({ base: setup.hash, action: name, request: args.clientRequestId, index: i++ }).slice(0, 24);
            }
            const proposal = view({ id: setup.id, revision: setup.revision + 1, scene: next, hash: sceneHash(next), ...(setup.channel ? { channel: setup.channel } : {}) }, { baseRevision: setup.revision, baseHash: setup.hash, clientRequestId: args.clientRequestId, action: name });
            proposal.delivery = service.deliver?.(setup.channel, proposal) || 'not_requested';
            response = result(proposal);
          } else if (name === 'inspect_setup') response = result({ ...await service.compute('inspect', setup.scene), revision: setup.revision, hash: setup.hash });
          else if (name === 'get_setup_screenshot') {
            const { data, width, height } = await service.compute('screenshot', setup.scene);
            response = result({ revision: setup.revision, hash: setup.hash, width, height, format: 'png' });
            response.content.push({ type: 'image', mimeType: 'image/png', data });
          } else response = result(view(setup));
          }
        }
        break;
      }
      default: return { jsonrpc: '2.0', id: body.id ?? null, error: { code: -32601, message: 'Method not found' } };
    }
    return { jsonrpc: '2.0', id: body.id ?? null, result: response };
  } catch (error) {
    const safe = error instanceof SceneError ? error : new SceneError('Setup processing failed. Your browser copy is unchanged.', 'INTERNAL_ERROR');
    if (body.method === 'tools/call') return { jsonrpc: '2.0', id: body.id ?? null, result: { resultType: 'complete', isError: true, structuredContent: { error: { code: safe.code, message: safe.message } }, content: [{ type: 'text', text: safe.message }] } };
    return { jsonrpc: '2.0', id: body.id ?? null, error: { code: -32602, message: safe.message } };
  }
}
, description: 'Opaque browser workbench reference from the latest widget context. Prefer this to a full scene snapshot.' };
const setupSchema = object({ id: { type: 'string', minLength: 1, maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' }, revision: { type: 'integer', minimum: 0, maximum: 1000000000 }, scene: sceneSchema, hash: { type: 'string', pattern: '^[a-f0-9]{64}$' }, channel: { type: 'string', pattern: '^[a-f0-9]{64}$', description: 'Opaque live delivery channel from the browser context. Copy it unchanged; never invent it.' } }, ['revision', 'scene']);
const descriptions = {
  open_setup: 'Open the interactive OpticalSetup workbench in the chat. Supply the latest setup from the visible widget context or a preceding tool result; omit setup only for an empty workbench. Scenes are held by the browser, not saved on this service. Use Save JSON for a portable backup.',
  get_setup: 'Summarize the supplied setup, including stable component IDs and paths in scene.beams. This service cannot read browser storage. Always pass the latest full setup from the visible widget context or preceding result; never invent or silently substitute an empty scene.',
  inspect_setup: 'Run the native OpticalSetup 2D tracer on the supplied setup and report detector and fiber readings with model limits. The service does not store the setup. Null readings mean no detected light.',
  get_setup_screenshot: 'Render the supplied setup as a fitted PNG using OpticalSetup’s native SVG geometry and tracer. Returns actual image content with its scene hash and revision, without saving a scene or image. This is a static scene export, not a screenshot of the chat interface. Pass the latest full setup to verify an edit.',
  undo_setup: 'Return a scene restored from undoScene in the latest visible widget context. Pass that scene as targetScene and the current setup. Undo history is owned by the browser; this service has no account history.',
  redo_setup: 'Return a scene restored from redoScene in the latest visible widget context. Pass that scene as targetScene and the current setup. Redo history is owned by the browser.',
};
const statelessNames = new Set(['open_setup', 'get_setup', 'inspect_setup', 'get_setup_screenshot', 'undo_setup', 'redo_setup']);
const editNames = new Set(['add_components', 'move_components', 'set_component_parameters', 'remove_components', 'add_paths', 'update_paths', 'remove_paths', 'undo_setup', 'redo_setup']);
const viewOutput = object({ setup: setupSchema, components: { type: 'array', items: { type: 'object' } }, paths: { type: 'array', items: { type: 'object' } }, baseRevision: { type: 'integer' }, baseHash: { type: 'string' }, clientRequestId: { type: 'string' }, action: { type: 'string' }, delivery: { type: 'string', enum: ['sent', 'offline', 'not_requested'] } }, ['setup', 'components', 'paths']);
export const TOOLS = LAB_TOOLS.filter(t => !['replace_setup', 'save_setup_screenshot'].includes(t.name)).map(original => {
  const t = structuredClone(original);
  t.securitySchemes = [{ type: 'noauth' }];
  t.annotations.idempotentHint = true;
  t._meta = { ...t._meta, securitySchemes: t.securitySchemes };
  if (editNames.has(t.name)) t._meta = { ...t._meta, ui: { resourceUri: UI_URI }, 'openai/outputTemplate': UI_URI };
  if (t.name === 'open_setup') t.annotations.idempotentHint = false;
  if (['search_components', 'get_component_schema'].includes(t.name)) {
    t.outputSchema = t.name === 'search_components' ? object({ total: { type: 'integer' }, components: { type: 'array', items: { type: 'object' } } }, ['total', 'components']) : { type: 'object', properties: { type: { type: 'string' } }, required: ['type'], additionalProperties: true };
    return t;
  }
  const properties = { ...t.inputSchema.properties };
  for (const key of ['setupId', 'ifRevision', 'expectedRevision']) delete properties[key];
  properties.setup = { ...setupSchema, description: 'Latest browser-owned snapshot from widget context or a previous tool result. The server does not retrieve or retain it.' };
  if (['undo_setup', 'redo_setup'].includes(t.name)) properties.targetScene = { ...sceneSchema, description: t.name === 'undo_setup' ? 'undoScene from the latest visible widget context.' : 'redoScene from the latest visible widget context.' };
  const required = t.inputSchema.required.filter(key => !['expectedRevision'].includes(key));
  if (t.name !== 'open_setup') required.push('setup');
  if (['undo_setup', 'redo_setup'].includes(t.name)) required.push('targetScene');
  t.inputSchema = object(properties, required);
  t.description = descriptions[t.name] || original.description.replace(/Read get_setup(?: and get_component_schema)? first\./g, 'Use the latest supplied setup and obtain native controls from get_component_schema.').replace(/Read the setup first/g, 'Use the latest supplied setup').replace(/saved revision/g, 'returned snapshot').replace(/active setup/g, 'supplied setup').replace(/active setup/g, 'supplied setup');
  if (!statelessNames.has(t.name)) t.description += ' Stateless: pass the full current setup. Returns a proposed new snapshot; the browser applies it only if the base scene still matches. Nothing is stored by this service.';
  t.outputSchema = t.name === 'inspect_setup' ? { type: 'object', properties: { revision: { type: 'integer' }, detectors: { type: 'array' }, paths: { type: 'array' }, scope: { type: 'string' }, hash: { type: 'string' } }, required: ['revision', 'detectors', 'paths', 'scope', 'hash'], additionalProperties: true }
    : t.name === 'get_setup_screenshot' ? object({ revision: { type: 'integer' }, hash: { type: 'string' }, width: { type: 'integer' }, height: { type: 'integer' }, format: { type: 'string', enum: ['png'] } }, ['revision', 'hash', 'width', 'height', 'format']) : viewOutput;
  return t;
});
// The PNG tool needs a renderer this machine may not have. A service without one
// neither lists the tool nor tells the model to verify edits with it.
const canRender = service => service?.screenshots !== false;
const toolsFor = service => canRender(service) ? TOOLS : TOOLS.filter(t => t.name !== 'get_setup_screenshot');
const instructionsFor = service => 'OpticalSetup is a stateless 2D optical editor. No account, database or server-side scene storage. The latest visible widget context contains setup (revision, hash, full scene), undoScene and redoScene. Always use that snapshot for edits; otherwise use the most recent tool result. The service cannot read a browser’s canvas: ask the user to open it or supply JSON when current state is absent. Never reset a setup just because its data is unavailable. Discover native controls with search_components/get_component_schema; drawn fibers are scene.beams and use path tools. Chain each returned setup into the next edit and use a unique clientRequestId.' + (canRender(service) ? ' Verify an edit with get_setup_screenshot.' : '') + ' A tool computes a proposed snapshot; only a matching browser applies it. For an existing visible editor, do not call open_setup after every edit or launch a second competing view. The browser keeps Undo/Redo locally; use its supplied undoScene/redoScene. If the widget rejects an old proposal, use its newer context. Unsupported requests: this integration cannot buy equipment, prepare orders, publish community setups, send email or certify clinical safety. For procurement requests, explain the limitation and offer a component specification export; do not request payment details or shipping addresses. Do not imply another integration action was performed. Model limits must be stated. Official website: https://opticalsetup.com.';
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
const result = data => ({ resultType: 'complete', structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] });
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
        response = discoveryResult({ contents: [{ uri: UI_URI, mimeType: 'text/html;profile=mcp-app', text: service.html, _meta: { ui: { prefersBorder: false, csp: { connectDomains: [service.origin], resourceDomains: [service.origin] } }, 'openai/widgetDomain': service.origin, 'openai/widgetCSP': { connect_domains: [service.origin], resource_domains: [service.origin], redirect_domains: ['https://opticalsetup.com'] }, 'openai/ui': { availableDisplayModes: ['inline', 'fullscreen'] }, 'openai/widgetDescription': 'OpticalSetup with a browser-owned scene, local Undo/Redo and JSON save/load. MCP operations process snapshots without storing them.' } }] }); break;
      case 'tools/call': {
        const name = body.params?.name, args = body.params?.arguments || {};
        const definition = toolsFor(service).find(t => t.name === name);
        if (!definition) throw new SceneError('Unknown tool', 'NOT_FOUND');
        validate(definition.inputSchema, args);
        if (name === 'search_components') response = result(searchComponents(args.query, args.category, args.limit));
        else if (name === 'get_component_schema') response = result(componentSchema(args.type, args.parameters));
        else {
          const setup = snapshot(args.setup);
          if (editNames.has(name)) {
            let next;
            if (['undo_setup', 'redo_setup'].includes(name)) next = normalizeScene(args.targetScene);
            else {
              const doc = { ...emptyDocument(), revision: setup.revision, scene: setup.scene };
              next = mutateDocument(doc, name, { ...args, expectedRevision: setup.revision }).document.scene;
              // Stable retry IDs without a server receipt table or session storage.
              const before = new Set([...setup.scene.elements, ...setup.scene.beams].map(x => x.id));
              let i = 0;
              for (const item of [...next.elements, ...next.beams]) if (!before.has(item.id)) item.id = 'mcp_' + sceneHash({ base: setup.hash, action: name, request: args.clientRequestId, index: i++ }).slice(0, 24);
            }
            const proposal = view({ id: setup.id, revision: setup.revision + 1, scene: next, hash: sceneHash(next), ...(setup.channel ? { channel: setup.channel } : {}) }, { baseRevision: setup.revision, baseHash: setup.hash, clientRequestId: args.clientRequestId, action: name });
            proposal.delivery = service.deliver?.(setup.channel, proposal) || 'not_requested';
            response = result(proposal);
          } else if (name === 'inspect_setup') response = result({ ...await service.compute('inspect', setup.scene), revision: setup.revision, hash: setup.hash });
          else if (name === 'get_setup_screenshot') {
            const { data, width, height } = await service.compute('screenshot', setup.scene);
            response = result({ revision: setup.revision, hash: setup.hash, width, height, format: 'png' });
            response.content.push({ type: 'image', mimeType: 'image/png', data });
          } else response = result(view(setup));
        }
        break;
      }
      default: return { jsonrpc: '2.0', id: body.id ?? null, error: { code: -32601, message: 'Method not found' } };
    }
    return { jsonrpc: '2.0', id: body.id ?? null, result: response };
  } catch (error) {
    const safe = error instanceof SceneError ? error : new SceneError('Setup processing failed. Your browser copy is unchanged.', 'INTERNAL_ERROR');
    if (body.method === 'tools/call') return { jsonrpc: '2.0', id: body.id ?? null, result: { resultType: 'complete', isError: true, structuredContent: { error: { code: safe.code, message: safe.message } }, content: [{ type: 'text', text: safe.message }] } };
    return { jsonrpc: '2.0', id: body.id ?? null, error: { code: -32602, message: safe.message } };
  }
}
