import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, getDirectManipulation, getSize, registry } from '../sketch/js/elements.js';
import { applyInput, initInspector, renderInspector } from '../sketch/js/inspector.js';
import { parseSketch, state } from '../sketch/js/state.js';
import {
  magnificationForWorkingDistance, objectiveFocalLength, objectiveNumericalAperture, objectivePupilDiameter,
  OBJECTIVE_REFERENCE_TUBE_F_MM,
} from '../sketch/js/objective.js';

const file = (elements = []) => JSON.stringify({ app: 'optics2d', version: 1, elements, beams: [] });

// ---------------- geometry: NA never resizes, magnification does ----------------

test('the objective pupil (drawn body + traced aperture) tracks magnification, never NA alone', () => {
  const base = { magnification: 20, na: 1 };
  assert.equal(objectivePupilDiameter(base), 20); // 2 * (200/20)

  for (const na of [0.05, 0.5, 1.0, 1.49]) {
    assert.equal(objectivePupilDiameter({ magnification: 20, na }), 20, `NA ${na} must not change the pupil`);
  }

  assert.equal(objectivePupilDiameter({ magnification: 40, na: 1 }), 10); // 2 * (200/40)
  assert.equal(objectivePupilDiameter({ magnification: 10, na: 1 }), 40); // 2 * (200/10)
});

test('NA still flows into the traced surface for downstream consumers (e.g. the 2PP handoff)', () => {
  const objective = createElement('objective');
  objective.params.na = 1.35;
  const surface = registry.objective.surfaces(objective)[0];
  assert.equal(surface.data.objectiveNA, 1.35);
  assert.equal(objectiveNumericalAperture(objective.params), 1.35);
});

// ---------------- working distance: a derived, unstored, always-live param ----------------

test('working distance has no storage of its own', () => {
  const objective = createElement('objective');
  assert.equal(Object.hasOwn(objective.params, 'workingDistance'), false);
  const spec = registry.objective.params.find(p => p.key === 'workingDistance');
  assert.equal(spec.type, 'derived');
  assert.equal(typeof spec.get, 'function');
  assert.equal(typeof spec.set, 'function');
});

test('working distance reads as the same thin-lens focal length as magnification, in mm', () => {
  const spec = registry.objective.params.find(p => p.key === 'workingDistance');
  assert.equal(spec.get({ magnification: 20 }), objectiveFocalLength({ magnification: 20 }));
  assert.equal(spec.get({ magnification: 20 }), 10);
  assert.equal(spec.get({ magnification: 40 }), 5);
  assert.equal(spec.get({ magnification: 4 }), 50);
});

test('setting working distance writes back through magnification, and clamps like any other field', () => {
  const spec = registry.objective.params.find(p => p.key === 'workingDistance');
  const params = { magnification: 20 };

  spec.set(params, 20); // 200/20 = 10x
  assert.equal(params.magnification, 10);
  assert.equal(spec.get(params), 20);

  spec.set(params, 2); // 200/2 = 100x
  assert.equal(params.magnification, 100);
  assert.equal(spec.get(params), 2);

  // out of range requests clamp to the nearest valid magnification, and the
  // readback reflects what that magnification actually implies
  spec.set(params, 1000);
  assert.equal(params.magnification, 1, 'clamped to the minimum magnification (1x)');
  spec.set(params, 0.01);
  assert.equal(params.magnification, 200, 'clamped to the maximum magnification (200x)');
});

test('magnificationForWorkingDistance is the exact inverse relationship used by the tracer', () => {
  assert.equal(magnificationForWorkingDistance(10), 20);
  assert.equal(magnificationForWorkingDistance(OBJECTIVE_REFERENCE_TUBE_F_MM), 1);
  assert.equal(magnificationForWorkingDistance(1), 200);
});

// ---------------- editing either field in the inspector keeps the other live ----------------

test('committing a magnification edit refreshes the displayed working distance', () => {
  const panel = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  const objective = createElement('objective');
  state.elements = [objective];
  state.beams = [];
  state.selection = { kind: 'element', id: objective.id };
  state.demoMode = false;
  initInspector(panel);
  renderInspector();
  assert.match(panel.innerHTML, /value="10"[^>]*data-derived="1"|data-derived="1"[^>]*value="10"/);

  applyInput({ dataset: { p: 'magnification' }, type: 'number', value: '40' }, true);
  assert.equal(objective.params.magnification, 40);
  assert.match(panel.innerHTML, /value="5"[^>]*data-derived="1"|data-derived="1"[^>]*value="5"/,
    'working distance display must follow the new magnification, not the value it had at render time');
});

test('committing a working-distance edit writes back to magnification and stays consistent on rerender', () => {
  const panel = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  const objective = createElement('objective');
  state.elements = [objective];
  state.beams = [];
  state.selection = { kind: 'element', id: objective.id };
  state.demoMode = false;
  initInspector(panel);
  renderInspector();

  applyInput({ dataset: { p: 'workingDistance', derived: '1' }, type: 'number', value: '25' }, true);
  assert.equal(objective.params.magnification, 8, '200mm tube / 25mm working distance = 8x');
  assert.equal(objective.params.na, 1, 'NA is untouched by a working-distance edit');
});

// ---------------- direct manipulation: resize/tune wired to working distance ----------------

test('the objective resize handle and tune knob are wired to working distance, not NA', () => {
  const objective = createElement('objective');
  const direct = getDirectManipulation(objective);
  assert.equal(direct.resize.y, 'workingDistance');
  assert.equal(direct.tune.key, 'workingDistance');
  assert.equal(direct.tune.param.type, 'derived');
});

test('dragging the resize handle out (working distance up) visibly grows the objective', () => {
  const objective = createElement('objective');
  const spec = registry.objective.params.find(p => p.key === 'workingDistance');
  const before = getSize(objective);

  spec.set(objective.params, 40); // longer working distance
  const after = getSize(objective);
  assert.ok(after.h > before.h, 'a longer working distance draws a visibly bigger barrel');
});

// ---------------- legacy sketches: no working-distance key to migrate ----------------

test('a sketch saved before working distance existed just derives it fresh from magnification', () => {
  const raw = createElement('objective');
  raw.params = { magnification: 25, na: 0.8, transEff: 90 };
  const [loaded] = parseSketch(file([raw]), registry).elements;
  assert.equal(loaded.params.magnification, 25);
  assert.equal(Object.hasOwn(loaded.params, 'workingDistance'), false);
  const spec = registry.objective.params.find(p => p.key === 'workingDistance');
  assert.equal(spec.get(loaded.params), 8); // 200 / 25
});
