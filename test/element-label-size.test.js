import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry, labelSVG, getVisualBounds } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';

test('larger element labels survive save/reload and expand the fitted visual bounds', () => {
  const element = createElement('lens', 100, 100);
  Object.assign(element, { label: 'Objective pupil relay', showLabel: true, labelPos: 't' });
  const old = getVisualBounds(element);
  element.labelFontSize = 22;
  const [restored] = parseSketch(JSON.stringify({ elements: [element] }), registry).elements;
  assert.match(labelSVG(restored), /font-size="22"/);
  const bounds = getVisualBounds(restored);
  assert.ok(bounds.x1 - bounds.x0 > (old.x1 - old.x0) * 1.9);
  assert.ok(bounds.y0 < old.y0, 'fit/export includes the taller label');
});

test('legacy labels remain 11 and malformed sizes stay finite', () => {
  const element = createElement('lens', 0, 0);
  Object.assign(element, { label: 'Lens', showLabel: true });
  assert.match(labelSVG(element), /font-size="11"/);
  for (const [input, expected] of [[0, 6], [1e9, 32], [null, 11]]) {
    element.labelFontSize = input;
    const [restored] = parseSketch(JSON.stringify({ elements: [element] }), registry).elements;
    assert.match(labelSVG(restored), new RegExp(`font-size="${expected}"`));
    assert.ok(Object.values(getVisualBounds(restored)).every(Number.isFinite));
  }
});
