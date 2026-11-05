// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, getDirectManipulation, registry } from '../sketch/js/elements.js';

// canvas.js touches these at import time; the drag maths needs no real DOM.
globalThis.window ??= { matchMedia: () => ({ matches: true }) };
globalThis.document ??= { addEventListener() {}, dispatchEvent() {} };
const { tuneDragValue } = await import('../sketch/js/canvas.js');

// A tune knob that its `when` hides at the defaults, or whose key follows a
// mode, is also checked in the states that show it or change its param.
const VARIANTS = {
  ledsource: [{ ledPreset: 'custom' }],
  objarrow: [{ raysMode: 'fan' }],
  slm: [{ zeroOrder: true }],
  metasurface: [{ zeroOrder: true }],
  eom: [{ modulate: true }],
  crystal: [{ convert: 'shg' }, { convert: 'opo' }],
  dichroic: [{}, { dtype: 'bandpass' }],
  filter: [{}, { ftype: 'bandpass' }, { ftype: 'nd' }],
  ruler: [{ mode: 'angle' }],
};

function tuneCases() {
  const cases = [];
  for (const type of Object.keys(registry).filter(type => registry[type].direct?.tune)) {
    for (const overrides of VARIANTS[type] || [{}]) {
      const el = createElement(type);
      Object.assign(el.params, overrides);
      const tune = getDirectManipulation(el)?.tune;
      if (tune) cases.push({ name: `${type}.${tune.key}`, el, tune });
    }
  }
  return cases;
}

// A drag as the canvas starts it: grabbed at clientY 0, from the current value.
function grab(el, tune) {
  const value = tune.param.type === 'derived' ? tune.param.get(el.params) : el.params[tune.key];
  return { mode: 'tune', el, tune, clientY: 0, value };
}

const places = step => (String(step).split('.')[1] || '').length;

function assertClean(value, spec, name) {
  assert.ok(Number.isFinite(value), `${name}: ${value} is finite`);
  assert.equal(value, Number(value.toFixed(places(spec.step))), `${name}: ${value} has no more decimals than its ${spec.step} step`);
}

test('every tuned param has a tune case', () => {
  const tuned = new Set(tuneCases().map(c => c.el.type));
  for (const type of Object.keys(registry).filter(type => registry[type].direct?.tune)) {
    assert.ok(tuned.has(type), `${type}: its tune knob is shown in at least one tested state`);
  }
});

test('a tune drag writes a value on its step, not the float sum', () => {
  // The AOD reported in the field: 4° + 42 × 0.1° is 8.200000000000001 in
  // binary floating point; the knob must write the 8.2 its label shows.
  const aod = createElement('aod');
  const tune = getDirectManipulation(aod).tune;
  assert.equal(tune.key, 'centerDeflect');
  assert.equal(aod.params.centerDeflect, 4);
  const value = tuneDragValue(grab(aod, tune), -28); // 28 px up = 42 steps of 0.1°
  assert.equal(value, 8.2);
  assert.equal(JSON.stringify({ value }), '{"value":8.2}', 'a saved sketch stores 8.2');

  for (const { name, el, tune } of tuneCases()) {
    const drag = grab(el, tune);
    for (let dy = -300; dy <= 300; dy += 1) assertClean(tuneDragValue(drag, dy), tune.param, `${name} at ${dy} px`);
  }
});

test('a tune drag clamped at its limits still writes a clean value', () => {
  const aod = createElement('aod');
  const aodDrag = grab(aod, getDirectManipulation(aod).tune);
  assert.equal(tuneDragValue(aodDrag, -1e5), 30, 'the AOD knob stops at exactly 30°');
  assert.equal(tuneDragValue(aodDrag, 1e5), 0, 'and at exactly 0°');
  // 19 × 0.05 is 0.9500000000000001 before rounding.
  const chopper = createElement('chopper');
  assert.equal(tuneDragValue(grab(chopper, getDirectManipulation(chopper).tune), -1e5), 0.95);

  for (const { name, el, tune } of tuneCases()) {
    const spec = tune.param;
    const bound = b => typeof b === 'function' ? b(el.params) : b;
    for (const dy of [-1e6, 1e6]) {
      const value = tuneDragValue(grab(el, tune), dy);
      assertClean(value, spec, `${name} at ${dy} px`);
      const magnitude = spec.negative ? Math.abs(value) : value;
      assert.ok(magnitude >= bound(spec.min) && magnitude <= bound(spec.max),
        `${name} at ${dy} px: ${value} stays within ${bound(spec.min)}…${bound(spec.max)}`);
    }
  }
});
