// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createElement, registry } from '../sketch/js/elements.js';
import { state, replaceScene, loadAutosave, pushUndo, undo, canUndo } from '../sketch/js/state.js';

const main = readFileSync(new URL('../sketch/js/main.js', import.meta.url), 'utf8');
const loading = main.slice(main.indexOf('function preserveWorkbenchInUndo()'), main.indexOf('// ---------- boot ----------'));

for (const accept of [true, false]) test(`incoming shared setup ${accept ? 'can be undone' : 'can be declined without losing work'}`, t => {
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
  const before = storage.get('optics2d-autosave-v1');
  // A fresh page starts empty, but has the previous workbench on disk.
  state.elements = []; state.beams = [];
  let confirmations = 0, retired = 0;
  const context = vm.createContext({ state, registry, loadAutosave, pushUndo, replaceScene,
    confirm() { confirmations++; return accept; }, clearSharedSceneURL() { retired++; }, zoomFit() {},
  });
  vm.runInContext(loading, context);
  context.openSharedScene({ elements: [incoming], beams: [] });
  assert.equal(confirmations, 1);
  assert.equal(state.elements[0].params.wavelength, accept ? 633 : 700);
  if (accept) {
    assert.equal(canUndo(), true);
    undo();
    assert.equal(state.elements[0].params.wavelength, 700);
    assert.equal(loadAutosave(registry), true);
    assert.equal(state.elements[0].params.wavelength, 700);
  } else {
    assert.equal(storage.get('optics2d-autosave-v1'), before);
    assert.equal(retired, 1);
  }
});

test('the bootstrap applies shared-scene preservation after decoding', () => {
  const branch = main.slice(main.indexOf('if (sharedScene)'));
  assert.match(branch, /^if \(sharedScene\) \{\s*openSharedScene\(sharedScene\);/);
});
