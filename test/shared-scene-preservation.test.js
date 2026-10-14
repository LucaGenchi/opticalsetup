// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createElement, registry } from '../sketch/js/elements.js';
import { state, replaceScene, loadAutosave, pushUndo, undo, canUndo, serialize, parseSketch } from '../sketch/js/state.js';
import { buildShareURL, sharedSceneFromURL } from '../sketch/js/share.js';

const main = readFileSync(new URL('../sketch/js/main.js', import.meta.url), 'utf8');
const loading = main.slice(main.indexOf('function preserveWorkbenchInUndo()'), main.indexOf('// ---------- boot ----------'));

test('incoming shared setup opens without asking and can be undone', t => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete globalThis.localStorage;
  });
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  const oldSource = createElement('cwlaser', 0, 0); oldSource.params.wavelength = 700;
  const incoming = createElement('cwlaser', 100, 0); incoming.params.wavelength = 633;
  replaceScene({ elements: [oldSource], beams: [] }, { resetHistory: true });
  // A fresh page starts empty, but has the previous workbench on disk.
  state.elements = []; state.beams = [];
  let confirmations = 0;
  const context = vm.createContext({ state, registry, loadAutosave, pushUndo, replaceScene,
    confirm() { confirmations++; return false; }, clearSharedSceneURL() {}, zoomFit() {},
  });
  vm.runInContext(loading, context);
  context.openSharedScene({ elements: [incoming], beams: [] });
  assert.equal(confirmations, 0);
  assert.equal(state.elements[0].params.wavelength, 633);
  assert.equal(canUndo(), true);
  undo();
  assert.equal(state.elements[0].params.wavelength, 700);
  assert.equal(loadAutosave(registry), true);
  assert.equal(state.elements[0].params.wavelength, 700);
});

test('reloading after Share reopens the visitor\'s own scene without asking', async t => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete globalThis.localStorage;
  });
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  const source = createElement('cwlaser', 0, 0); source.params.wavelength = 700;
  replaceScene({ elements: [source], beams: [] }, { resetHistory: true });
  // Share leaves this link in the address bar; the reload starts empty.
  const href = await buildShareURL(serialize(), 'https://example.org/sketch/');
  const saved = storage.get('optics2d-autosave-v1');
  state.elements = []; state.beams = [];
  let confirmations = 0, fitted = 0;
  const context = vm.createContext({ state, registry, loadAutosave, pushUndo, replaceScene,
    confirm() { confirmations++; return true; }, clearSharedSceneURL() {}, zoomFit() { fitted++; },
  });
  vm.runInContext(loading, context);
  context.openSharedScene(parseSketch(await sharedSceneFromURL(href), registry));
  assert.equal(confirmations, 0);
  assert.equal(canUndo(), false);
  assert.equal(fitted, 1);
  assert.equal(state.elements[0].params.wavelength, 700);
  assert.equal(storage.get('optics2d-autosave-v1'), saved);
  assert.equal(state.autosaved, true, 'the change listener can retire the fragment');

  // The same link over an edited bench opens directly and preserves Undo.
  state.elements[0].params.wavelength = 633;
  replaceScene({ elements: state.elements, beams: [] }, { resetHistory: true });
  state.elements = []; state.beams = [];
  context.openSharedScene(parseSketch(await sharedSceneFromURL(href), registry));
  assert.equal(confirmations, 0);
  assert.equal(state.elements[0].params.wavelength, 700);
  assert.equal(canUndo(), true);
  undo();
  assert.equal(state.elements[0].params.wavelength, 633);
});

test('the bootstrap applies shared-scene preservation after decoding', () => {
  const branch = main.slice(main.indexOf('if (sharedScene)'));
  assert.match(branch, /^if \(sharedScene\) \{\s*openSharedScene\(sharedScene\);/);
});
