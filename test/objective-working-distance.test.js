import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, getDirectManipulation, getSize, registry } from '../sketch/js/elements.js';
import { applyInput, initInspector, renderInspector } from '../sketch/js/inspector.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';
import {
  objectiveAcceptanceHalfAngleDeg,
  objectiveFocalLength,
  objectiveFrontAperture,
  objectiveMediumIndex,
  objectiveNumericalAperture,
  objectivePupilDiameter,
  objectiveWorkingDistance,
} from '../sketch/js/objective.js';

const file = (elements = []) => JSON.stringify({ app: 'optics2d', version: 1, elements, beams: [] });

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

// ---------------- independent catalogue properties ----------------

test('rated pupil follows EFL and NA while the physical front aperture remains independent', () => {
  assert.equal(objectivePupilDiameter({ magnification: 20, immersion: 'air', na: 0.2 }), 4);
  assert.equal(objectivePupilDiameter({ magnification: 20, immersion: 'air', na: 0.5 }), 10);
  assert.equal(objectivePupilDiameter({ magnification: 20, immersion: 'air', na: 1 }), 20);
  assert.equal(objectivePupilDiameter({ magnification: 40, immersion: 'air', na: 1 }), 10);
  assert.equal(objectivePupilDiameter({ magnification: 20, immersion: 'oil', na: 1.4 }), 28);

  assert.equal(objectiveFrontAperture({ magnification: 20, frontAperture: 24, na: 0.2 }), 24);
  assert.equal(objectiveFrontAperture({ magnification: 80, frontAperture: 24, na: 1.4, immersion: 'oil' }), 24);
});

test('working distance drives the front-boundary focus map while EFL remains catalogue metadata', () => {
  const objective = createElement('objective');
  let surface = registry.objective.surfaces(objective)[0];
  assert.equal(objectiveFocalLength(objective.params), 10);
  assert.equal(objectiveWorkingDistance(objective.params), 10);
  assert.equal(surface.x1, 16, 'the trace surface is the physical front boundary');
  assert.equal(surface.x1 + surface.data.f, 26, 'collimated light focuses at front + WD');

  objective.params.workingDistance = 2;
  surface = registry.objective.surfaces(objective)[0];
  assert.equal(surface.x1, 16, 'short WD never moves an invisible trace plane into the housing');
  assert.equal(surface.data.f, 2);
  assert.equal(surface.x1 + surface.data.f, 18);

  objective.params.magnification = 40;
  surface = registry.objective.surfaces(objective)[0];
  assert.equal(objectiveFocalLength(objective.params), 5);
  assert.equal(surface.data.effectiveFocalLength, 5);
  assert.equal(surface.data.f, 2, 'catalogue EFL is not disguised as the front-boundary map distance');
  assert.equal(objectiveWorkingDistance(objective.params), 2, 'magnification must not rewrite WD');
  assert.equal(surface.x1, 16, 'the black-box surface cannot cross a nearby sample');
  assert.equal(surface.x1 + surface.data.f, 18, 'the independently authored specimen focus stays put');
});

test('medium, NA, and half-angle flow into the objective surface without rewriting WD', () => {
  const objective = createElement('objective');
  objective.params.workingDistance = 3.5;
  objective.params.immersion = 'oil';
  objective.params.na = 1.35;
  const surface = registry.objective.surfaces(objective)[0];

  assert.equal(surface.data.objectiveNA, 1.35);
  assert.equal(surface.data.objectiveMediumIndex, 1.518);
  assert.equal(surface.data.workingDistance, 3.5);
  assert.equal(objectiveNumericalAperture(objective.params), 1.35);
  assert.equal(objectiveMediumIndex(objective.params), 1.518);
  const expectedAngle = Math.asin(1.35 / 1.518) * 180 / Math.PI;
  assert.ok(Math.abs(objectiveAcceptanceHalfAngleDeg(objective.params) - expectedAngle) < 1e-9);
});

test('changing rated NA changes qualitative angular ray acceptance', () => {
  const signalFor = na => {
    const laser = createElement('cwlaser', 0, 0);
    laser.params.beamMode = 'beam';
    laser.params.beamWidth = 20;
    const objective = createElement('objective', 150, 0);
    Object.assign(objective.params, {
      magnification: 20,
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
  const wide = signalFor(1);
  assert.ok(narrow > 0, 'the low-NA objective still accepts its central rays');
  assert.ok(wide > narrow * 3, 'opening NA must accept visibly more of the same input beam');
});

// ---------------- inspector behavior ----------------

test('the inspector resolves medium-dependent NA bounds, angle, and medium changes without touching WD', () => {
  const objective = createElement('objective');
  objective.params.immersion = 'oil';
  objective.params.na = 1.4;
  objective.params.workingDistance = 4.2;
  const panel = inspectorFor(objective);

  assert.match(panel.innerHTML, /data-p="na"[^>]*max="1\.49"/);
  assert.match(panel.innerHTML, /data-p="acceptanceHalfAngle">67\.3°/);

  applyInput({ dataset: { p: 'immersion' }, type: 'select-one', value: 'air' }, true);
  assert.equal(objective.params.immersion, 'air');
  assert.equal(objective.params.na, 1);
  assert.equal(objective.params.workingDistance, 4.2);
  assert.match(panel.innerHTML, /data-p="na"[^>]*max="1"/);
  assert.match(panel.innerHTML, /data-p="acceptanceHalfAngle">90\.0°/);
  assert.doesNotMatch(panel.innerHTML, /data-p="immersionIndex"/);

  applyInput({ dataset: { p: 'immersion' }, type: 'select-one', value: 'custom' }, true);
  assert.match(panel.innerHTML, /data-p="immersionIndex"/);
  assert.equal(objective.params.workingDistance, 4.2);
});

test('the theta readout follows NA during live input without rebuilding the inspector', () => {
  const objective = createElement('objective');
  objective.params.immersion = 'oil';
  objective.params.na = 1.4;
  const angleOutput = { dataset: { p: 'acceptanceHalfAngle' }, textContent: '67.3°' };
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

test('an unresolved legacy medium is visible for repair but cannot be newly selected', () => {
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

test('magnification updates EFL but leaves stored working distance unchanged', () => {
  const objective = createElement('objective');
  const panel = inspectorFor(objective);
  assert.equal(objective.params.workingDistance, 10);
  assert.match(panel.innerHTML, /data-p="effectiveFocalLength">10\.00/);

  applyInput({ dataset: { p: 'magnification' }, type: 'number', value: '40' }, true);
  assert.equal(objective.params.magnification, 40);
  assert.equal(objective.params.workingDistance, 10);
  assert.match(panel.innerHTML, /data-p="effectiveFocalLength">5\.00/);
  assert.match(panel.innerHTML, /data-p="workingDistance"[^>]*value="10"/);
});

test('working-distance edits move focus without changing magnification or NA', () => {
  const objective = createElement('objective');
  inspectorFor(objective);

  applyInput({ dataset: { p: 'workingDistance' }, type: 'number', value: '25' }, true);
  assert.equal(objective.params.workingDistance, 25);
  assert.equal(objective.params.magnification, 20);
  assert.equal(objective.params.na, 1);
  const surface = registry.objective.surfaces(objective)[0];
  assert.equal(surface.x1, 16, 'even long WD keeps the focus map at the front, before any forward sample');
  assert.equal(surface.x1 + surface.data.f, 41, 'front boundary 16 mm + 25 mm WD');
});

// ---------------- direct manipulation and persistence ----------------

test('the objective resize handle changes its front aperture while tune changes only WD', () => {
  const objective = createElement('objective');
  const direct = getDirectManipulation(objective);
  assert.equal(direct.resize.y, 'frontAperture');
  assert.equal(direct.tune.key, 'workingDistance');
  assert.equal(direct.tune.param.type, 'number');

  const before = getSize(objective);
  objective.params.workingDistance = 40;
  assert.deepEqual(getSize(objective), before, 'WD moves focus, not the barrel boundary');
  objective.params.frontAperture = 40;
  assert.ok(getSize(objective).h > before.h, 'front aperture is the actual resizable boundary');
});

test('legacy objectives receive compatibility WD/aperture values that then persist independently', () => {
  const raw = createElement('objective');
  raw.params = { magnification: 25, na: 0.8, transEff: 90 };
  const [loaded] = parseSketch(file([raw]), registry).elements;

  assert.equal(loaded.params.magnification, 25);
  assert.equal(loaded.params.workingDistance, 8, 'old geometry used WD = 200 / M');
  assert.equal(loaded.params.frontAperture, 16, 'old body used 2 × EFL');
  assert.equal(loaded.params.immersion, 'air');

  loaded.params.magnification = 50;
  assert.equal(objectiveFocalLength(loaded.params), 4);
  assert.equal(loaded.params.workingDistance, 8, 'after migration WD no longer follows magnification');
  assert.equal(loaded.params.frontAperture, 16);
});

test('malformed legacy magnification seeds compatibility geometry from its bounded value', () => {
  const zero = createElement('objective');
  zero.params = { magnification: 0, na: 0.8 };
  const huge = createElement('objective');
  huge.params = { magnification: 10000, na: 0.8 };

  const [loadedZero, loadedHuge] = parseSketch(file([zero, huge]), registry).elements;
  assert.equal(loadedZero.params.magnification, 1);
  assert.equal(loadedZero.params.workingDistance, 200);
  assert.equal(loadedHuge.params.magnification, 200);
  assert.equal(loadedHuge.params.workingDistance, 1);
});
