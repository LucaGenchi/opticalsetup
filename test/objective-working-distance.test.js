import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, getDirectManipulation, getSize, registry } from '../sketch/js/elements.js';
import { applyInput, initInspector, renderInspector } from '../sketch/js/inspector.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';
import {
  OBJECTIVE_DEFAULT_BACK_X,
  OBJECTIVE_FRONT_X,
  OBJECTIVE_SHOULDER_X,
  objectiveAcceptanceHalfAngleDeg,
  objectiveAcceptedRadius,
  objectiveBackFocalPlaneX,
  objectiveBackX,
  objectiveEffectiveNumericalAperture,
  objectiveFocalLength,
  objectiveFrontAperture,
  objectiveLensPlaneX,
  objectiveMagnification,
  objectiveMediumIndex,
  objectiveNumericalAperture,
  objectiveWorkingDistance,
} from '../sketch/js/objective.js';

const file = (elements = []) => JSON.stringify({ app: 'optics2d', version: 1, elements, beams: [] });

function near(actual, expected, tolerance = 1e-9, message = '') {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message || `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function inspectorFor(objective, extras = []) {
  const panel = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  state.elements = [objective, ...extras];
  state.beams = [];
  state.selection = { kind: 'element', id: objective.id };
  state.demoMode = false;
  initInspector(panel);
  renderInspector();
  return panel;
}

test('one fixed front plane uses working distance as its reciprocal focal distance', () => {
  const objective = createElement('objective');
  let surface = registry.objective.surfaces(objective).find(item => item.kind === 'lens');
  assert.ok(surface);
  assert.equal(objectiveLensPlaneX(objective.params), OBJECTIVE_FRONT_X);
  assert.equal(surface.x1, OBJECTIVE_FRONT_X);
  assert.equal(surface.data.f, 10);
  assert.equal(surface.x1 + surface.data.f, 26);

  objective.params.workingDistance = 2;
  objective.params.efl = 80;
  surface = registry.objective.surfaces(objective).find(item => item.kind === 'lens');
  assert.equal(surface.x1, OBJECTIVE_FRONT_X, 'the ideal plane never moves inside the icon');
  assert.equal(surface.data.f, 2, 'working distance is the single authored focal distance');
  assert.equal(surface.data.effectiveFocalLength, 2);
  assert.equal(surface.x1 + surface.data.f, 18, 'collimated light focuses WD beyond the front tip');
});

test('rated NA, medium, and clear aperture produce one effective cone on the trace surface', () => {
  const objective = createElement('objective');
  Object.assign(objective.params, {
    workingDistance: 3.5,
    frontAperture: 20,
    immersion: 'oil',
    na: 1.35,
  });
  let surface = registry.objective.surfaces(objective).find(item => item.kind === 'lens');
  const ratedAngle = Math.asin(1.35 / 1.518);
  const accepted = Math.min(10, 3.5 * Math.tan(ratedAngle));
  near(objectiveAcceptedRadius(objective.params), accepted);
  near((surface.y2 - surface.y1) / 2, accepted);
  near(surface.data.objectiveNA, 1.35);
  near(surface.data.objectiveMediumIndex, 1.518);
  near(surface.data.workingDistance, 3.5);
  near(objectiveAcceptanceHalfAngleDeg(objective.params), ratedAngle * 180 / Math.PI);

  objective.params.frontAperture = 1;
  surface = registry.objective.surfaces(objective).find(item => item.kind === 'lens');
  assert.equal(objectiveAcceptedRadius(objective.params), 0.5);
  near((surface.y2 - surface.y1) / 2, 0.5);
  assert.ok(surface.data.objectiveNA < 1.35, 'a small clear opening lowers the effective NA');
  near(surface.data.objectiveNA, objectiveEffectiveNumericalAperture(objective.params));
});

test('opening rated NA accepts visibly more of the same collimated beam', () => {
  const signalFor = na => {
    const laser = createElement('cwlaser', 0, 0);
    laser.params.beamMode = 'beam';
    laser.params.beamWidth = 20;
    const objective = createElement('objective', 150, 0);
    Object.assign(objective.params, {
      workingDistance: 10,
      frontAperture: 20,
      immersion: 'air',
      na,
    });
    const detector = createElement('detector', 205, 0);
    detector.params.aperture = 100;
    traceAll([laser, objective, detector]);
    return detectorReading(detector.id)?.signal || 0;
  };

  const narrow = signalFor(0.2);
  const wide = signalFor(0.85);
  assert.ok(narrow > 0, 'the low-NA objective still accepts central rays');
  assert.ok(wide > narrow * 3, 'the high-NA cone passes substantially more of the beam');
});

test('the inspector resolves medium-dependent NA bounds without changing focus distance', () => {
  const objective = createElement('objective');
  objective.params.immersion = 'oil';
  objective.params.na = 1.4;
  objective.params.workingDistance = 4;
  objective.params.efl = 4;
  const panel = inspectorFor(objective);

  assert.match(panel.innerHTML, /data-p="na"[^>]*max="1\.49"/);
  assert.match(panel.innerHTML, /data-p="acceptanceHalfAngle">67\.3°/);

  applyInput({ dataset: { p: 'immersion' }, type: 'select-one', value: 'air' }, true);
  assert.equal(objective.params.immersion, 'air');
  assert.equal(objective.params.na, 0.85, 'dry objectives cap at the practical 0.85');
  assert.equal(objective.params.workingDistance, 4);
  assert.equal(objective.params.efl, 4);
  assert.match(panel.innerHTML, /data-p="na"[^>]*max="0\.85"/);
  assert.match(panel.innerHTML, /data-p="acceptanceHalfAngle">58\.2°/);
  assert.doesNotMatch(panel.innerHTML, /data-p="immersionIndex"/);

  applyInput({ dataset: { p: 'immersion' }, type: 'select-one', value: 'custom' }, true);
  assert.match(panel.innerHTML, /data-p="immersionIndex"/);
  assert.equal(objective.params.workingDistance, 4);
});

test('the effective-angle readout follows live NA input', () => {
  const objective = createElement('objective');
  objective.params.immersion = 'oil';
  objective.params.na = 1.4;
  const angleOutput = { dataset: { p: 'acceptanceHalfAngle' }, textContent: '' };
  const panel = {
    innerHTML: '',
    querySelector: () => null,
    querySelectorAll: selector => selector === 'output.readout[data-p]' ? [angleOutput] : [],
  };
  state.elements = [objective];
  state.beams = [];
  state.selection = { kind: 'element', id: objective.id };
  state.demoMode = false;
  initInspector(panel);
  renderInspector();

  applyInput({ dataset: { p: 'na' }, type: 'number', value: '0.3' });
  assert.equal(objective.params.na, 0.3);
  assert.equal(angleOutput.textContent, '11.4°');
});

test('the inspector reports when the clear opening limits effective NA', () => {
  const objective = createElement('objective');
  Object.assign(objective.params, {
    workingDistance: 10,
    frontAperture: 2,
    immersion: 'oil',
    na: 1.4,
  });
  const panel = inspectorFor(objective);
  assert.match(panel.innerHTML, /data-p="effectiveNA">0\.151 of 1\.400 — clear-aperture limited/);
  assert.match(panel.innerHTML, /data-p="acceptanceHalfAngle">5\.7°/);
});

test('an unresolved legacy medium stays visible for repair but cannot be newly selected', () => {
  const objective = createElement('objective');
  objective.params.immersion = 'legacy';
  objective.params.na = 1.4;
  const panel = inspectorFor(objective);

  assert.match(panel.innerHTML, /option value="legacy" selected disabled/);
  assert.match(panel.innerHTML, /older high-NA sketch did not record one/i);
});

test('committing objective coordinates refreshes the derived immersion-bridge hint', () => {
  const objective = createElement('objective', 0, 0);
  objective.params.immersion = 'water';
  const sample = createElement('sample', 27, 0);
  sample.rot = 90;
  const panel = inspectorFor(objective, [sample]);

  assert.match(panel.innerHTML, /data-objective-coupling-status="connected"/);
  assert.match(panel.innerHTML, /actual gap 8\.0 mm/);
  assert.match(panel.innerHTML, /WD 10\.0 mm/);

  applyInput({ dataset: { k: 'x' }, type: 'number', value: '-100', min: '-500', max: '500' }, true);
  assert.doesNotMatch(panel.innerHTML, /data-objective-coupling-status="connected"/);
  assert.match(panel.innerHTML, /data-objective-coupling-status="open"/);
});

test('editing focus distance synchronizes compatibility EFL and leaves NA alone', () => {
  const objective = createElement('objective');
  const panel = inspectorFor(objective);
  assert.doesNotMatch(panel.innerHTML, /data-p="efl"/, 'compatibility EFL is not a second visible control');

  applyInput({ dataset: { p: 'workingDistance' }, type: 'number', value: '25' }, true);
  assert.equal(objective.params.workingDistance, 25);
  assert.equal(objective.params.efl, 25);
  assert.equal(objective.params.na, 0.65);
  const surface = registry.objective.surfaces(objective).find(item => item.kind === 'lens');
  assert.equal(surface.x1, OBJECTIVE_FRONT_X);
  assert.equal(surface.data.f, 25);
  assert.equal(surface.x1 + surface.data.f, 41);
  assert.match(panel.innerHTML, /data-p="workingDistance"[^>]*value="25"/);
});

test('focus distance is bounded directly, not by a second EFL value', () => {
  assert.equal(objectiveWorkingDistance({ workingDistance: 400, efl: 8 }), 200);
  assert.equal(objectiveWorkingDistance({ workingDistance: 0, efl: 8 }), 0.05);
  assert.equal(objectiveWorkingDistance({ efl: 8 }), 8, 'transitional EFL seeds focus only when WD is absent');
});

test('on-canvas tuning changes focus while the fixed housing has no resize handle', () => {
  const objective = createElement('objective');
  const direct = getDirectManipulation(objective);
  assert.equal(direct.resize, null);
  assert.equal(direct.tune.key, 'workingDistance');
  assert.equal(direct.tune.param.type, 'number');

  const before = getSize(objective);
  objective.params.workingDistance = 80;
  objective.params.frontAperture = 1;
  objective.params.na = 0.05;
  assert.deepEqual(getSize(objective), before, 'optical settings never resize the objective housing');
});

test('legacy magnification seeds focus while clear aperture gets a safe fixed-body default', () => {
  const raw = createElement('objective');
  raw.params = { magnification: 25, na: 0.8, transEff: 90 };
  const [loaded] = parseSketch(file([raw]), registry).elements;

  assert.equal(loaded.params.workingDistance, 8, '25x converts to a legacy 200/25 = 8 mm focus distance');
  assert.equal(loaded.params.efl, 8);
  assert.equal(loaded.params.frontAperture, 20, 'magnification did not author a trustworthy clear opening');
  assert.equal(loaded.params.immersion, 'air');

  inspectorFor(loaded);
  applyInput({ dataset: { p: 'workingDistance' }, type: 'number', value: '12' }, true);
  assert.equal(loaded.params.workingDistance, 12);
  assert.equal(loaded.params.efl, 12);
  assert.equal(objectiveFocalLength(loaded.params), 12);
});

test('malformed legacy magnification seeds focus from its bounded value', () => {
  const zero = createElement('objective');
  zero.params = { magnification: 0, na: 0.8 };
  const huge = createElement('objective');
  huge.params = { magnification: 10000, na: 0.8 };

  const [loadedZero, loadedHuge] = parseSketch(file([zero, huge]), registry).elements;
  assert.equal(loadedZero.params.workingDistance, 200, 'magnification 0 bounds to 1x');
  assert.equal(loadedZero.params.efl, 200);
  assert.equal(loadedHuge.params.workingDistance, 1, 'magnification 10000 bounds to 200x');
  assert.equal(loadedHuge.params.efl, 1);
});

test('the body and compatibility focal markers stay simple and deterministic', () => {
  assert.equal(OBJECTIVE_FRONT_X - OBJECTIVE_SHOULDER_X, 9);
  assert.equal(OBJECTIVE_SHOULDER_X - OBJECTIVE_DEFAULT_BACK_X, 28);
  assert.equal(objectiveBackX({ workingDistance: 200, na: 1.4 }), OBJECTIVE_DEFAULT_BACK_X);
  assert.equal(objectiveLensPlaneX({ workingDistance: 200 }), OBJECTIVE_FRONT_X);
  assert.equal(objectiveBackFocalPlaneX({ workingDistance: 12 }), OBJECTIVE_FRONT_X - 12);
});

test('a fresh objective is a dry NA 0.65 ideal focus with full transmission', () => {
  const objective = createElement('objective');
  assert.equal(objective.params.workingDistance, 10);
  assert.equal(objective.params.efl, 10);
  assert.equal(objectiveMagnification(objective.params), 20);
  assert.equal(objective.params.frontAperture, 20);
  assert.equal(objective.params.immersion, 'air');
  assert.equal(objective.params.na, 0.65);
  assert.equal(objective.params.transEff, 100);
  assert.equal(objectiveFrontAperture(objective.params), 20);
  assert.equal(objectiveNumericalAperture(objective.params), 0.65);
  assert.equal(objectiveMediumIndex(objective.params), 1);
});
