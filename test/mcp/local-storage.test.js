// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { state, configureAutosave, changed, loadAutosave } from '../../sketch/js/state.js';
test('external persistence leaves the native editor interactive and avoids origin-wide autosave', () => {
  const oldStorage = globalThis.localStorage;
  let writes = 0;
  globalThis.localStorage = { getItem() { return '{"app":"optics2d","version":1,"elements":[],"beams":[]}'; }, setItem() { writes++; } };
  try {
    state.embedMode = false;
    configureAutosave({ enabled: false }); changed();
    assert.equal(state.embedMode, false); assert.equal(writes, 0); assert.equal(loadAutosave(), false);
    configureAutosave({ enabled: true }); changed(); assert.equal(writes, 1); assert.equal(loadAutosave(), true);
  } finally { configureAutosave({ enabled: true }); globalThis.localStorage = oldStorage; }
});
