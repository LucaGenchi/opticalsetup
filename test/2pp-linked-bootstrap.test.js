import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { collectionSetupRequest } from '../sketch/js/collection-loader.js';
import { createElement, registry } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';

// Execute the real bootstrap with rendering stubbed out. The regressions here
// concern mode selection and preserving a previous workbench across the new
// collection route, not a duplicate implementation of URL parsing.
const main = readFileSync(new URL('../sketch/js/main.js', import.meta.url), 'utf8');
const marker = main.indexOf('// ---------- boot ----------');
const preserve = main.slice(main.indexOf('function preserveWorkbenchInUndo()'), marker);
const boot = main.slice(marker);

async function openLinked(query, accept = true) {
  const previous = createElement('cwlaser', 22, 33); previous.id = 'previous';
  const incoming = createElement('pulsedlaser', 88, 99); incoming.id = 'incoming';
  const sceneText = JSON.stringify({ elements: [incoming], beams: [] });
  const state = { elements: [], beams: [], selection: null, embedMode: false, autosaved: false };
  const result = { state, fetches: [], confirms: 0, autosaveReads: 0, undo: [], zooms: 0, palettes: 0 };
  const noOp = () => {};
  const context = {
    state, registry, collectionSetupRequest, parseSketch, URLSearchParams,
    location: { search: query }, FIBER_DEMOS: new Set(), SCENE_DEMOS: new Set(),
    document: {
      body: { classList: { add: name => { result.bodyClass = name; } } },
      querySelector: () => ({ removeAttribute: name => { result.removedAttribute = name; } }),
    },
    window: { addEventListener: (event, handler) => { if (event === 'DOMContentLoaded') result.boot = handler; } },
    $: () => ({}), initTheme: noOp, initInspector: noOp,
    initCanvas: () => { result.modeAtCanvasInit = state.embedMode; },
    buildPalette: () => { result.palettes++; },
    syncToolMode: noOp, bindToolbar: noOp, bindContextMenu: noOp,
    bindExamples: noOp, bindCommunity: noOp, bindKeys: noOp,
    setSelectionCallback: noOp, setMeasurementsCallback: noOp,
    renderSelection: noOp, refreshMeasurements: noOp, onChange: noOp,
    renderAll: noOp, syncToolbar: noOp, autoAdjustTimeScale: noOp,
    announceIllustrativeMotion: noOp, syncPulseControls: noOp, syncMobileSheets: noOp,
    zoomFit: () => { result.zooms++; },
    loadAutosave: () => { result.autosaveReads++; state.elements = [structuredClone(previous)]; return true; },
    confirm: () => { result.confirms++; return accept; },
    pushUndo: () => { result.undo.push(structuredClone(state.elements)); },
    fetch: async path => { result.fetches.push(path); return { ok: true, text: async () => sceneText }; },
    examples: [{ slug: 'known-example', path: '../Examples/known.json' }],
    showToast: message => { throw new Error(message); },
    console: { error: (...args) => { throw new Error(args.join(' ')); } },
  };
  vm.runInNewContext(preserve + boot, context);
  await result.boot();
  return result;
}

test('paper previews set embedMode before canvas initialization and leave autosave alone', async () => {
  for (const query of ['?paper=gu-2025&embed=1', '?setup=gu-2025', '?collection=gu-2025&locked=1', '?paper=gu-2025&edit=1&embed=1']) {
    const result = await openLinked(query);
    assert.equal(result.modeAtCanvasInit, true, query);
    assert.equal(result.bodyClass, 'embed-mode');
    assert.equal(result.removedAttribute, 'href');
    assert.equal(result.palettes, 0);
    assert.equal(result.confirms, 0);
    assert.equal(result.autosaveReads, 0);
    assert.equal(result.undo.length, 0);
    assert.deepEqual(result.fetches, ['../collections/2pp/setups/gu-2025.json']);
    assert.equal(result.state.elements[0].id, 'incoming');
    assert.equal(result.zooms, 1);
  }
});

test('accepted editable paper links preserve the prior workbench in undo', async () => {
  const result = await openLinked('?paper=gu-2025&edit=1');
  assert.equal(result.modeAtCanvasInit, false);
  assert.equal(result.palettes, 1);
  assert.equal(result.confirms, 1);
  assert.equal(result.autosaveReads, 1);
  assert.equal(result.undo.length, 1);
  assert.equal(result.undo[0][0].id, 'previous');
  assert.equal(result.state.elements.length, 1);
  assert.equal(result.state.elements[0].id, 'incoming');
  assert.equal(result.zooms, 1);
});

test('declining an editable paper link retains the previous workbench without fetching', async () => {
  const result = await openLinked('?paper=gu-2025&edit=1', false);
  assert.equal(result.confirms, 1);
  assert.equal(result.undo.length, 0);
  assert.equal(result.state.elements.length, 1);
  assert.equal(result.state.elements[0].id, 'previous');
  assert.deepEqual(result.fetches, []);
  assert.equal(result.zooms, 0);
});

test('existing example links keep precedence over collection aliases', async () => {
  const result = await openLinked('?example=known-example&paper=gu-2025&embed=1');
  assert.equal(result.modeAtCanvasInit, true);
  assert.deepEqual(result.fetches, ['../Examples/known.json']);
  assert.equal(result.confirms, 0);
  assert.equal(result.state.elements[0].id, 'incoming');
});
