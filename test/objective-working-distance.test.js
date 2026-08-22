import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, getDirectManipulation, getSize, registry } from '../sketch/js/elements.js';
import { applyInput, initInspector, renderInspector } from '../sketch/js/inspector.js';
import { detectorReading, objectivePupilFill, traceAll, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';
import {
  OBJECTIVE_DEFAULT_BACK_X,
  OBJECTIVE_FRONT_X,
  OBJECTIVE_PRESETS,
  OBJECTIVE_SHOULDER_X,
  applyObjectivePreset,
  objectiveAcceptanceHalfAngleDeg,
  objectiveMagnification,
  objectiveBackFocalPlaneX,
  objectiveBackX,
  objectiveLensPlaneX,
  objectiveStopX,
  objectiveFocalLength,
  objectiveFrontAperture,
  objectiveMediumIndex,
  objectiveNumericalAperture,
  objectivePresetKey,
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
  assert.equal(objectivePupilDiameter({ magnification: 20, immersion: 'air', na: 0.85 }), 17);
  assert.equal(objectivePupilDiameter({ magnification: 40, immersion: 'air', na: 0.85 }), 8.5);
  assert.equal(objectivePupilDiameter({ magnification: 20, immersion: 'oil', na: 1.4 }), 28);

  assert.equal(objectiveFrontAperture({ magnification: 20, frontAperture: 24, na: 0.2 }), 24);
  assert.equal(objectiveFrontAperture({ magnification: 80, frontAperture: 24, na: 1.4, immersion: 'oil' }), 24);
});

test('the equivalent lens moves so EFL and working distance are both true', () => {
  const objective = createElement('objective');
  let surface = registry.objective.surfaces(objective)[0];
  assert.equal(objectiveFocalLength(objective.params), 10);
  assert.equal(objectiveWorkingDistance(objective.params), 1.2);
  assert.ok(Math.abs(surface.x1 - 7.2) < 1e-9, 'the equivalent plane sits inside the default objective barrel');
  assert.ok(Math.abs(surface.x1 + surface.data.f - 17.2) < 1e-9, 'collimated light focuses at front + WD');

  objective.params.workingDistance = 2;
  surface = registry.objective.surfaces(objective)[0];
  assert.equal(surface.x1, 8, 'a short working distance moves the equivalent lens into the housing, as in a real objective');
  assert.equal(surface.data.f, 10, 'the traced lens keeps the real EFL');
  assert.equal(surface.x1 + surface.data.f, 18, 'and still focuses exactly WD beyond the front tip');

  objective.params.efl = 5;
  surface = registry.objective.surfaces(objective)[0];
  assert.equal(objectiveFocalLength(objective.params), 5);
  assert.equal(surface.data.effectiveFocalLength, 5);
  assert.equal(surface.data.f, 5, 'the traced lens carries the real EFL');
  assert.equal(objectiveWorkingDistance(objective.params), 2, 'EFL must not rewrite WD');
  assert.equal(surface.x1, 13, 'lens plane = 16 + WD - EFL = 16 + 2 - 5');
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

test('objective starting points coordinate EFL, WD, medium, NA, and aperture', () => {
  const starting = createElement('objective').params;
  for (const preset of OBJECTIVE_PRESETS) {
    const params = applyObjectivePreset(starting, preset.key);
    assert.equal(objectivePresetKey(params), preset.key);
    assert.equal(objectiveMediumIndex(params) !== null, true);
    assert.ok(objectiveWorkingDistance(params) <= objectiveFocalLength(params));
    assert.ok(objectiveNumericalAperture(params) > 0);
    assert.ok(objectiveFrontAperture(params) >= 1);
  }

  const custom = applyObjectivePreset(starting, '40x-dry');
  custom.workingDistance = 0.75;
  assert.equal(objectivePresetKey(custom), 'custom', 'one exact-value edit leaves preset mode honestly');
});

// ---------------- inspector behavior ----------------

test('the inspector leads with presets and keeps exact objective values collapsed under Advanced', () => {
  const objective = createElement('objective');
  const panel = inspectorFor(objective);

  assert.match(panel.innerHTML, /data-p="objectivePreset" data-derived-select="1"/);
  assert.match(panel.innerHTML, /value="20x-dry" selected/);
  assert.match(panel.innerHTML, /data-section="objective-advanced" >/,
    'advanced exact values should start collapsed');
  assert.doesNotMatch(panel.innerHTML, /purple knob tunes/i);

  applyInput({ dataset: { p: 'objectivePreset', derivedSelect: '1' }, type: 'select-one', value: '100x-oil' }, true);
  assert.equal(objective.params.efl, 2);
  assert.equal(objective.params.workingDistance, 0.13);
  assert.equal(objective.params.immersion, 'oil');
  assert.equal(objective.params.na, 1.4);
  assert.equal(objective.params.frontAperture, 6);
  assert.match(panel.innerHTML, /value="100x-oil" selected/);

  applyInput({ dataset: { p: 'workingDistance' }, type: 'number', value: '0.2' }, true);
  assert.equal(objectivePresetKey(objective.params), 'custom');
  assert.match(panel.innerHTML, /value="custom" selected disabled/);
});

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
  assert.equal(objective.params.na, 0.85, 'dry objectives cap at the practical 0.85, not at n = 1');
  assert.equal(objective.params.workingDistance, 4.2);
  assert.match(panel.innerHTML, /data-p="na"[^>]*max="0\.85"/);
  assert.match(panel.innerHTML, /data-p="acceptanceHalfAngle">58\.2°/);
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
  objective.params.workingDistance = 10;
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

test('editing EFL updates the reported magnification and carries WD down with it', () => {
  const objective = createElement('objective');
  objective.params.workingDistance = 10;
  const panel = inspectorFor(objective);
  assert.equal(objective.params.workingDistance, 10);
  assert.match(panel.innerHTML, /data-p="magnification">20\.0/);

  // Raising EFL leaves an already-configured WD where the author put it.
  applyInput({ dataset: { p: 'efl' }, type: 'number', value: '40' }, true);
  assert.equal(objective.params.workingDistance, 10, 'a longer EFL must not rewrite WD');
  assert.match(panel.innerHTML, /data-p="magnification">5\.0/, 'the reported magnification follows EFL');

  // Shortening it past WD does move WD: an objective cannot focus further
  // away than its own focal length.
  applyInput({ dataset: { p: 'efl' }, type: 'number', value: '5' }, true);
  assert.equal(objective.params.efl, 5);
  assert.equal(objective.params.workingDistance, 5, 'WD follows EFL down to stay physical');
  assert.match(panel.innerHTML, /data-p="magnification">40\.0/);
  assert.match(panel.innerHTML, /data-p="workingDistance"[^>]*value="5"/);
});

test('working-distance edits move focus without changing EFL or NA', () => {
  const objective = createElement('objective');
  objective.params.efl = 40;
  inspectorFor(objective);

  applyInput({ dataset: { p: 'workingDistance' }, type: 'number', value: '25' }, true);
  assert.equal(objective.params.workingDistance, 25);
  assert.equal(objective.params.efl, 40, 'WD must not rewrite EFL');
  assert.equal(objective.params.na, 0.4);
  const surface = registry.objective.surfaces(objective)[0];
  assert.equal(surface.x1, 1, 'lens plane = 16 + 25 - 40');
  assert.equal(surface.x1 + surface.data.f, 41, 'front boundary 16 mm + 25 mm WD');
});

test('working distance is capped at the effective focal length', () => {
  const objective = createElement('objective');
  objective.params.efl = 8;
  objective.params.workingDistance = 40;
  assert.equal(objectiveWorkingDistance(objective.params), 8, 'WD can equal EFL but never exceed it');
  // Which is what keeps the equivalent plane inside the barrel.
  assert.ok(registry.objective.surfaces(objective)[0].x1 <= OBJECTIVE_FRONT_X);

  objective.params.workingDistance = 0.05;
  assert.equal(objectiveWorkingDistance(objective.params), 0.05, 'and supports real sub-millimetre high-NA clearances');
});

// ---------------- direct manipulation and persistence ----------------

test('the objective resize handle changes its front aperture without exposing EFL as a drag target', () => {
  const objective = createElement('objective');
  const direct = getDirectManipulation(objective);
  assert.equal(direct.resize.y, 'frontAperture');
  assert.equal(direct.tune, null, 'the former 1–200 mm canvas knob made destructive jumps too easy');

  const before = getSize(objective);
  objective.params.workingDistance = 12;
  assert.deepEqual(getSize(objective), before, 'a modest WD change moves focus, not the barrel boundary');
  objective.params.frontAperture = 40;
  assert.ok(getSize(objective).h > before.h, 'front aperture is the actual resizable boundary');
});

test('legacy objectives receive compatibility WD/aperture values that then persist independently', () => {
  const raw = createElement('objective');
  raw.params = { magnification: 25, na: 0.8, transEff: 90 };
  const [loaded] = parseSketch(file([raw]), registry).elements;

  assert.equal(loaded.params.efl, 8, 'magnification 25 converts to EFL 200/25');
  assert.equal(loaded.params.workingDistance, 8, 'old geometry used WD = 200 / M');
  assert.equal(loaded.params.frontAperture, 16, 'old body used 2 × EFL');
  assert.equal(loaded.params.immersion, 'air');

  loaded.params.efl = 12;
  assert.equal(objectiveFocalLength(loaded.params), 12);
  assert.equal(objectiveWorkingDistance(loaded.params), 8, 'after migration a longer EFL leaves WD alone');
  assert.equal(loaded.params.frontAperture, 16);
});

test('malformed legacy magnification seeds compatibility geometry from its bounded value', () => {
  const zero = createElement('objective');
  zero.params = { magnification: 0, na: 0.8 };
  const huge = createElement('objective');
  huge.params = { magnification: 10000, na: 0.8 };

  const [loadedZero, loadedHuge] = parseSketch(file([zero, huge]), registry).elements;
  // A malformed magnification is bounded first, then converted, so the
  // objective it becomes is the one the bounded value describes.
  assert.equal(loadedZero.params.efl, 200, 'magnification 0 -> bounded to 1x -> EFL 200');
  assert.equal(loadedZero.params.workingDistance, 200);
  assert.equal(loadedHuge.params.efl, 1, 'magnification 10000 -> bounded to 200x -> EFL 1');
  assert.equal(loadedHuge.params.workingDistance, 1);
});


// ---------------- the back pupil is a real stop ----------------

test('rated NA sets the back pupil, so it sets the focusing cone and what overfilling costs', () => {
  const objective = createElement('objective', 400, 0);
  objective.params.efl = 10;
  objective.params.frontAperture = 40; // wide enough that the tip is never the limit

  const coneHalfAngle = na => {
    objective.params.na = na;
    const laser = createElement('cwlaser', 60, 0);
    laser.params.beamMode = 'beam';
    laser.params.beamWidth = objectivePupilDiameter(objective.params); // fill the pupil
    const slopes = traceScene([laser, objective], []).drawables
      .filter(d => d.pts?.length >= 2)
      .map(d => {
        const a = d.pts.at(-2), b = d.pts.at(-1);
        return (b.y - a.y) / (b.x - a.x);
      });
    const steepest = slopes.reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0);
    return Math.abs(Math.atan(steepest)) * 180 / Math.PI;
  };

  // A paraxial stop in a thin-lens tracer: filling 2fNA converges at atan(NA).
  for (const na of [0.2, 0.6, 0.85]) {
    const want = Math.atan(na) * 180 / Math.PI;
    assert.ok(Math.abs(coneHalfAngle(na) - want) < 0.01, `NA ${na} must focus at atan(NA) = ${want.toFixed(2)} deg`);
  }
});

test('the aperture stop sits at the back focal plane, where an infinity pupil belongs', () => {
  const objective = createElement('objective');
  objective.params.efl = 10;
  // Default WD = EFL puts the BFP inside the barrel, so the stop is exactly there.
  assert.equal(objectiveStopX(objective.params), objectiveBackFocalPlaneX(objective.params));

  // The single-plane model can push the BFP further back than any real
  // barrel; the stop is then clamped into the housing rather than left
  // blocking light in mid-air behind it.
  objective.params.efl = 120;
  assert.ok(objectiveBackFocalPlaneX(objective.params) < objectiveBackX(objective.params));
  assert.equal(objectiveStopX(objective.params), objectiveBackX(objective.params) + 1);
});

test('overfilling the back pupil reports what it costs', () => {
  const objective = createElement('objective', 400, 0);
  objective.params.efl = 10;
  objective.params.na = 0.6; // 12 mm pupil
  objective.params.frontAperture = 40;
  const laser = createElement('cwlaser', 60, 0);
  laser.params.beamMode = 'beam';

  laser.params.beamWidth = 12;
  traceAll([laser, objective], []);
  let fill = objectivePupilFill(objective.id);
  assert.equal(fill.pupilDiameter, 12);
  assert.ok(Math.abs(fill.beamDiameter - 12) < 0.05);
  assert.equal(fill.transmitted, 1, 'a beam that exactly fills the pupil is not clipped');

  laser.params.beamWidth = 24;
  traceAll([laser, objective], []);
  fill = objectivePupilFill(objective.id);
  assert.ok(Math.abs(fill.beamDiameter - 24) < 0.05);
  // uniform round beam through a round stop: the area ratio survives
  assert.ok(Math.abs(fill.transmitted - 0.25) < 0.01, 'double the fill costs three quarters');
});

test('a scan pivoted on the BFP marker never vignettes; one pivoted elsewhere does', () => {
  // The reason the BFP marker is worth relaying a scan mirror onto: pivot
  // there and the beam stays centred in the stop at every angle, pivot
  // somewhere else and it walks across the pupil and is cut.
  const objective = createElement('objective', 400, 0);
  objective.params.efl = 10;
  objective.params.na = 0.6; // 12 mm pupil
  objective.params.frontAperture = 40;
  const stopWorldX = objective.x + objectiveStopX(objective.params);
  const lensWorldX = objective.x + objectiveLensPlaneX(objective.params);

  // how much of the beam gets past the objective, as a beam pivoting at
  // `pivotX` is tilted by `deg`
  const throughput = (pivotX, deg) => {
    const laser = createElement('cwlaser', 0, 0);
    laser.params.beamMode = 'beam';
    laser.params.beamWidth = 6;
    laser.params.wavelength = 532;
    const rad = deg * Math.PI / 180;
    laser.rot = deg;
    laser.x = pivotX - Math.cos(rad) * 52;
    laser.y = -Math.sin(rad) * 52;
    return traceScene([laser, objective], []).drawables
      .filter(d => d.pts?.length >= 2 && d.pts.some(pt => pt.x > lensWorldX + 1)).length;
  };

  const straight = throughput(stopWorldX, 0);
  assert.ok(straight > 10, 'sanity: an on-axis beam inside the pupil gets through');
  assert.equal(throughput(stopWorldX, 4), straight, 'a pivot on the BFP loses nothing when it scans');
  assert.ok(
    throughput(stopWorldX - 120, 4) < straight / 2,
    'a pivot 120 mm short of the BFP walks the beam off the pupil and is cut',
  );
});

test('the barrel is a stubby taper on a long straight body, and only the body grows', () => {
  const taper = OBJECTIVE_FRONT_X - OBJECTIVE_SHOULDER_X;
  const body = OBJECTIVE_SHOULDER_X - OBJECTIVE_DEFAULT_BACK_X;
  assert.equal(taper, 9, 'the tapered nose is short');
  assert.equal(body, 28, 'the straight section carries the length');

  const objective = createElement('objective');
  assert.equal(objectiveBackX(objective.params), OBJECTIVE_DEFAULT_BACK_X);

  // A short working distance pushes the lens plane back; the nose must not
  // stretch with it, only the straight section.
  objective.params.efl = 40;
  objective.params.workingDistance = 2;
  const grown = objectiveBackX(objective.params);
  assert.ok(grown < OBJECTIVE_DEFAULT_BACK_X, 'the barrel grew');
  assert.equal(OBJECTIVE_FRONT_X - OBJECTIVE_SHOULDER_X, taper, 'the nose is fixed geometry');
  assert.match(registry.objective.svg(objective), new RegExp(`L ${OBJECTIVE_SHOULDER_X},-`), 'and it is drawn at the fixed shoulder');
  assert.ok(registry.objective.svg(objective).includes(`L ${grown},-`), 'while the body reaches the grown rear face');
});

test('a fresh objective is the plausible 20x dry starting point with full transmission', () => {
  const objective = createElement('objective');
  assert.equal(objective.params.efl, 10);
  assert.equal(objectiveMagnification(objective.params), 20);
  assert.equal(objective.params.immersion, 'air');
  assert.equal(objective.params.na, 0.4);
  assert.equal(objective.params.transEff, 100);
  assert.equal(objective.params.workingDistance, 1.2);
  assert.equal(objective.params.frontAperture, 8);
  assert.equal(objectivePresetKey(objective.params), '20x-dry');
});

test('an underfilled pupil reports the smaller NA the experiment actually runs at', () => {
  const objective = createElement('objective', 400, 0);
  objective.params.efl = 10;
  objective.params.na = 0.65;  // 13 mm pupil
  objective.params.frontAperture = 40;
  const laser = createElement('cwlaser', 60, 0);
  laser.params.beamMode = 'beam';

  const effectiveNA = () => {
    traceAll([laser, objective], []);
    const fill = objectivePupilFill(objective.id);
    return objectiveNumericalAperture(objective.params) * Math.min(1, fill.fill);
  };

  laser.params.beamWidth = 13;
  assert.ok(Math.abs(effectiveNA() - 0.65) < 0.005, 'a filled pupil gives the full rated NA');

  // Half the pupil diameter is half the convergence angle, so half the NA.
  laser.params.beamWidth = 6.5;
  assert.ok(Math.abs(effectiveNA() - 0.325) < 0.005, 'half-filled means half the NA');

  // Overfilling cannot buy more than the objective is rated for.
  laser.params.beamWidth = 26;
  assert.ok(Math.abs(effectiveNA() - 0.65) < 0.005, 'overfilling is capped at the rating');
});
