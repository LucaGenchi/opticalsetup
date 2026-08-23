import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, galvoAngleAt, getDirectManipulation, getSize, registry } from '../sketch/js/elements.js';

test('every resizable component exposes a handle backed by a real size parameter', () => {
  for (const type of Object.keys(registry)) {
    const el = createElement(type);
    const direct = getDirectManipulation(el);
    if (type === 'objective') {
      assert.equal(direct?.resize?.y, 'frontAperture', 'the vertical handles own the real clear opening');
      assert.equal(direct?.tune?.key, 'workingDistance', 'the separate purple handle moves the focus');
    }
    assert.ok(direct?.resize, `${type} has resize metadata`);
    Object.assign(el.params, direct.resize.set || {});
    for (const [axis, key] of Object.entries(direct.resize).filter(([axis, key]) =>
      ['x', 'y', 'uniform'].includes(axis) && typeof key === 'string')) {
      const before = getSize(el);
      const spec = registry[type].params.find(param => param.key === key);
      assert.ok(spec, `${type} resize key ${key} belongs to its registry schema`);
      // A `derived` param has no storage of its own — read/write it through
      // its declared get/set
      // instead of the raw params object, same as inspector.js and canvas.js
      // do for on-canvas dragging.
      const current = spec.type === 'derived' ? spec.get(el.params) : el.params[key];
      const candidate = Number.isFinite(spec.max) && spec.max !== current
        ? spec.max : Number.isFinite(spec.min) && spec.min !== current ? spec.min : current * 1.5;
      if (spec.type === 'derived') spec.set(el.params, candidate);
      else el.params[key] = candidate;
      const after = getSize(el);
      if (axis === 'y') assert.notEqual(after.h, before.h, `${type} height follows ${key}`);
      if (axis === 'x') assert.notEqual(after.w, before.w, `${type} width follows ${key}`);
      if (axis === 'uniform') assert.ok(after.w !== before.w || after.h !== before.h, `${type} bounds follow ${key}`);
    }
  }
});

test('galvo scan amplitude is capped at 10 degrees regardless of the requested value', () => {
  const params = {
    commandAngle: 0, scanMode: 'sine', scanAmplitude: 30,
    scanFrequencyHz: 1, scanPhaseDeg: 0,
  };
  assert.equal(galvoAngleAt(params, 0.25), 10);
  assert.equal(galvoAngleAt(params, 0.75), -10);
  assert.ok(galvoAngleAt(params, 0.125) < 10);
});

test('galvo scan amplitude is also constrained without flat-topped clipping near the mechanical limit', () => {
  const params = {
    commandAngle: 40, scanMode: 'sine', scanAmplitude: 10,
    scanFrequencyHz: 1, scanPhaseDeg: 0,
  };
  assert.equal(galvoAngleAt(params, 0.25), 45);
  assert.equal(galvoAngleAt(params, 0.75), 35);
  assert.ok(galvoAngleAt(params, 0.125) < 45);
});
