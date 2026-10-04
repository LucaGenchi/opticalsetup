// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { state, changed, loadAutosave, replaceRecoveredAutosave } from '../sketch/js/state.js';
import { registry, createElement } from '../sketch/js/elements.js';

for (const raw of ['{"elements":', JSON.stringify({ app: 'optics2d', version: 2, elements: [] })]) {
  test(`unreadable autosave survives edits and reloads: ${raw}`, t => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
      else delete globalThis.localStorage;
      state.autosaveRecovery = null;
    });
    let stored = raw, writable = true;
    globalThis.localStorage = {
      getItem: () => stored,
      setItem(_key, value) { if (!writable) throw new Error('QuotaExceededError'); stored = value; },
      removeItem() { assert.fail('recovery must never delete the original'); },
    };
    assert.equal(loadAutosave(registry), false);
    assert.equal(state.autosaveRecovery.text, raw, 'download retains the exact bytes');
    state.elements = [createElement('cwlaser', 0, 0)]; state.beams = [];
    changed();
    assert.equal(stored, raw, 'editing the new scene cannot overwrite the failed autosave');
    assert.equal(state.autosaved, false, 'a share link must remain available when autosave is paused');
    assert.equal(loadAutosave(registry), false, 'reloading still offers the original data');
    writable = false;
    assert.equal(replaceRecoveredAutosave(), false);
    assert.equal(state.autosaveRecovery.text, raw);
    assert.equal(stored, raw);
    writable = true;
    assert.equal(replaceRecoveredAutosave(), true);
    assert.equal(state.autosaveRecovery, null);
    assert.equal(loadAutosave(registry), true);
    assert.equal(state.elements[0].type, 'cwlaser');
  });
}

test('storage that cannot be read is not reported as a saved setup', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
    state.autosaveRecovery = null;
  });
  const blocked = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
  globalThis.localStorage = {
    getItem: blocked, setItem: blocked,
    removeItem() { assert.fail('nothing was read, so nothing may be deleted'); },
  };
  // A recovery left over from an earlier load must not survive either.
  state.autosaveRecovery = { text: 'stale', message: 'stale' };
  assert.equal(loadAutosave(registry), false);
  assert.equal(state.autosaveRecovery, null);
  assert.equal(state.autosaved, false);
  state.elements = [createElement('cwlaser', 0, 0)]; state.beams = [];
  changed();
  assert.equal(state.autosaved, false, 'a share link must remain available when nothing can be stored');
  assert.equal(state.autosaveRecovery, null);
});
