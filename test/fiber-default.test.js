// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawnPath } from '../sketch/js/path-types.js';

test('newly drawn fibers propagate beams by default', () => {
  const points = [{ x: 0, y: 0 }, { x: 50, y: 0 }];
  for (const type of ['fiber', 'barefiber']) {
    const path = createDrawnPath(type, points);
    assert.equal(path.kind, 'fiber');
    assert.equal(path.propagate, true);
  }
});
