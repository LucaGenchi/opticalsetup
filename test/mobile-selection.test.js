import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldOpenInspectorAfterSelectionGesture } from '../sketch/js/viewport.js';

test('a stationary element or beam selection can open the narrow inspector', () => {
  for (const mode of ['move', 'movebeam']) {
    assert.equal(shouldOpenInspectorAfterSelectionGesture({ mode, maxDistancePx: 0 }), true);
    assert.equal(shouldOpenInspectorAfterSelectionGesture({ mode, maxDistancePx: 3.9 }), true);
    assert.equal(shouldOpenInspectorAfterSelectionGesture({
      mode, pointerType: 'touch', maxDistancePx: 9.9,
    }), true);
  }
});

test('dragging a selection never opens the narrow inspector', () => {
  assert.equal(shouldOpenInspectorAfterSelectionGesture({ mode: 'move', maxDistancePx: 4 }), false);
  assert.equal(shouldOpenInspectorAfterSelectionGesture({
    mode: 'movebeam', pointerType: 'touch', maxDistancePx: 10,
  }), false);
  assert.equal(shouldOpenInspectorAfterSelectionGesture({
    mode: 'move', changed: true, maxDistancePx: 0,
  }), false);
});

test('direct-manipulation and unrelated gestures do not summon the inspector', () => {
  for (const mode of ['resize', 'rotate', 'tune', 'pan', 'marquee', 'movemulti']) {
    assert.equal(shouldOpenInspectorAfterSelectionGesture({ mode }), false);
  }
  assert.equal(shouldOpenInspectorAfterSelectionGesture(), false);
  assert.equal(shouldOpenInspectorAfterSelectionGesture({ mode: 'move', maxDistancePx: NaN }), false);
});
