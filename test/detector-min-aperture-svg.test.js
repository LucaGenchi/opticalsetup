import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { DETECTOR_TYPES } from '../sketch/js/detector-instruments.js';

// The parameter that sets each detector's drawn height.
const SIZE_KEYS = ['aperture', 'ch', 'diameter'];

test('every detector draws non-negative rect sizes at its minimum height', () => {
  for (const type of [...DETECTOR_TYPES, 'eye']) {
    const size = registry[type].params.find(p => SIZE_KEYS.includes(p.key));
    assert.ok(size, `${type} has a size parameter`);
    const el = createElement(type, 0, 0);
    el.params[size.key] = size.min;
    const svg = registry[type].svg(el, [el]);
    const values = [...svg.matchAll(/\b(width|height)="([^"]*)"/g)];
    assert.ok(values.length, `${type} draws sized shapes`);
    for (const [attr, name, value] of values) {
      assert.ok(Number.isFinite(Number(value)) && Number(value) >= 0,
        `${type} at ${size.key}=${size.min}: ${attr}`);
    }
  }
});
