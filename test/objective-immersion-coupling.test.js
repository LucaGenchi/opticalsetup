import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { buildSVG } from '../sketch/js/export.js';
import {
  immersionCouplingStatus, immersionLayerSVG, resolveImmersionCouplings,
} from '../sketch/js/immersion.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { serialize, state } from '../sketch/js/state.js';
import { toWorld } from '../sketch/js/util.js';

let nextId = 0;

function objective(medium = 'water', y = 0) {
  const element = createElement('objective', 0, y);
  element.id = `objective-${++nextId}`;
  element.params.immersion = medium;
  element.params.magnification = 10;
  element.params.workingDistance = 20;
  element.params.frontAperture = 40; // independent 40 mm front opening; coupling reach 30 mm
  return element;
}

function sourceOf(element) {
  const local = registry.objective.immersionSource?.(element) || registry.objective.snapPt || { x: 0, y: 0 };
  return toWorld(element, local.x, local.y);
}

function contactElement(type, id, source, dx, dy = 0) {
  const element = createElement(type, source.x + dx, source.y + dy);
  element.id = id;
  // Sample/stage contact is local-x. Rotating it makes a vertical segment
  // that either truly crosses the objective's horizontal forward ray or does
  // not, depending on dy and aperture.
  element.rot = 90;
  // Place the nearest visible specimen face, not its centre plane, at dx.
  element.x += (element.params.thickness || 6) / 2;
  return element;
}

function cloneElement(element) {
  return { ...element, params: { ...element.params } };
}

test('nearest true forward segment contact wins; behind, off-axis, and out-of-reach contacts do not', () => {
  const obj = objective();
  const source = sourceOf(obj);
  const behind = contactElement('sample', 'behind', source, -8);
  const offAxis = contactElement('sample', 'off-axis', source, 6, 40);
  const far = contactElement('sample', 'too-far', source, 31);
  const fartherValid = contactElement('stage', 'farther-valid', source, 18);
  const nearest = contactElement('sample', 'nearest', source, 9);

  const coupling = resolveImmersionCouplings([obj, behind, offAxis, far, fartherValid, nearest]).get(obj.id);
  assert.ok(coupling);
  assert.equal(coupling.targetId, 'nearest');
  assert.equal(coupling.targetKind, 'element');
  assert.equal(coupling.distance, 9);
  assert.deepEqual(coupling.contact, { x: source.x + 9, y: source.y });
});

test('equal-distance contacts are ambiguous and produce no coupling', () => {
  const obj = objective();
  const source = sourceOf(obj);
  const one = contactElement('sample', 'tie-a', source, 12);
  const two = contactElement('stage', 'tie-b', source, 12 + 5e-6);

  assert.equal(resolveImmersionCouplings([obj, one, two]).has(obj.id), false);
  assert.equal(immersionCouplingStatus(obj, [obj, one, two]).state, 'ambiguous');
  const svg = immersionLayerSVG([obj, one, two]);
  assert.doesNotMatch(svg, /immersion-meniscus/);
  assert.match(svg, /class="objective-na-overlay"[^>]*data-na-anchor="nominal-focus"/);
});

test('a physical optic before the target blocks coupling while annotations do not', () => {
  const obj = objective();
  const source = sourceOf(obj);
  const target = contactElement('sample', 'blocked-target', source, 14);
  const lens = createElement('lens', source.x + 7, source.y);
  lens.id = 'blocking-lens';
  assert.equal(resolveImmersionCouplings([obj, lens, target]).has(obj.id), false);

  const annotation = createElement('textlabel', source.x + 7, source.y);
  annotation.id = 'non-blocking-annotation';
  const coupling = resolveImmersionCouplings([obj, annotation, target]).get(obj.id);
  assert.ok(coupling);
  assert.equal(coupling.targetId, target.id);
});

test('only the aligned fiber end facing into the cable can couple', () => {
  const obj = objective();
  const source = sourceOf(obj);
  const facingAtStart = {
    id: 'fiber-start', kind: 'fiber', width: 4,
    pts: [{ x: source.x + 8, y: source.y }, { x: source.x + 20, y: source.y }],
  };
  let coupling = resolveImmersionCouplings([obj], [facingAtStart]).get(obj.id);
  assert.ok(coupling);
  assert.equal(coupling.targetId, 'fiber-start');
  assert.equal(coupling.targetEnd, 0);

  const facingAtEnd = {
    id: 'fiber-end', kind: 'fiber', width: 4,
    pts: [{ x: source.x + 20, y: source.y }, { x: source.x + 8, y: source.y }],
  };
  coupling = resolveImmersionCouplings([obj], [facingAtEnd]).get(obj.id);
  assert.ok(coupling);
  assert.equal(coupling.targetEnd, 1);

  const overlappingOffset = {
    id: 'fiber-overlap', kind: 'fiber', width: 4,
    pts: [{ x: source.x + 8, y: source.y + 3 }, { x: source.x + 20, y: source.y + 3 }],
  };
  coupling = resolveImmersionCouplings([obj], [overlappingOffset]).get(obj.id);
  assert.ok(coupling, 'a finite fiber face that crosses the axis remains eligible');
  assert.equal(coupling.distance, 8, 'focus distance is measured axially to the face intersection');
  assert.deepEqual(coupling.contact, { x: source.x + 8, y: source.y });

  const facingAway = {
    id: 'fiber-away', kind: 'fiber', width: 4,
    pts: [{ x: source.x + 8, y: source.y }, { x: source.x - 2, y: source.y }],
  };
  const misaligned = {
    id: 'fiber-offset', kind: 'fiber', width: 4,
    pts: [{ x: source.x + 8, y: source.y + 6 }, { x: source.x + 20, y: source.y + 6 }],
  };
  assert.equal(resolveImmersionCouplings([obj], [facingAway]).has(obj.id), false);
  assert.equal(resolveImmersionCouplings([obj], [misaligned]).has(obj.id), false);
});

test('authored geometry chooses target identity and the current stage contact follows that same target', () => {
  const baseObjective = objective();
  const source = sourceOf(baseObjective);
  const baseChosen = contactElement('stage', 'stage-chosen', source, 10);
  const baseOther = contactElement('stage', 'stage-other', source, 16);
  const baseElements = [baseObjective, baseChosen, baseOther];

  const currentObjective = cloneElement(baseObjective);
  const currentChosen = cloneElement(baseChosen);
  const currentOther = cloneElement(baseOther);
  currentChosen.x = source.x + 20 + currentChosen.params.thickness / 2; // the selected stage moved away in Z
  currentOther.y = source.y + 100; // the other authored target moved out of the axis

  const coupling = resolveImmersionCouplings(
    [currentObjective, currentChosen, currentOther],
    [],
    { baseElements },
  ).get(currentObjective.id);

  assert.ok(coupling);
  assert.equal(coupling.targetId, 'stage-chosen', 'animation must not retarget the objective to a different stage');
  assert.equal(coupling.baseDistance, 10);
  assert.equal(coupling.distance, 20);
  assert.deepEqual(coupling.contact, { x: source.x + 20, y: source.y });

  currentOther.x = source.x + 6 + currentOther.params.thickness / 2;
  currentOther.y = source.y;
  assert.equal(resolveImmersionCouplings(
    [currentObjective, currentChosen, currentOther],
    [],
    { baseElements },
  ).has(currentObjective.id), false, 'a nearer target can block the authored coupling but must never steal it mid-scan');

  currentOther.y = source.y + 100;
  currentChosen.x = source.x + 40 + currentChosen.params.thickness / 2;
  assert.equal(resolveImmersionCouplings(
    [currentObjective, currentChosen, currentOther],
    [],
    { baseElements },
  ).has(currentObjective.id), false, 'a stage that scans beyond reach disconnects instead of stretching the gap');
});

test('a moving specimen face blocks a locked gap before its centre surface crosses it', () => {
  const baseObjective = objective();
  const source = sourceOf(baseObjective);
  const baseChosen = contactElement('sample', 'face-chosen', source, 8);
  const baseOther = contactElement('sample', 'face-blocker', source, 16);
  const baseElements = [baseObjective, baseChosen, baseOther];

  const currentObjective = cloneElement(baseObjective);
  const currentChosen = cloneElement(baseChosen);
  const currentOther = cloneElement(baseOther);
  currentOther.x = source.x + 7 + currentOther.params.thickness / 2;

  assert.ok(
    currentOther.x - source.x > 8,
    'the blocker centre remains behind the locked contact in this regression setup',
  );
  assert.equal(resolveImmersionCouplings(
    [currentObjective, currentChosen, currentOther],
    [],
    { baseElements },
  ).has(currentObjective.id), false, 'the nearer visible face must disconnect the gap');
});

test('dry and open objectives render NA without liquid; unresolved legacy renders neither', () => {
  const air = objective('air');
  const airTarget = contactElement('sample', 'target-air', sourceOf(air), 8);
  assert.equal(resolveImmersionCouplings([air, airTarget]).size, 0);
  const airSVG = immersionLayerSVG([air, airTarget]);
  assert.doesNotMatch(airSVG, /immersion-meniscus/);
  assert.match(airSVG, /class="objective-na-overlay"[^>]*data-na-anchor="nominal-focus"/);

  const legacy = objective('legacy');
  const legacyTarget = contactElement('sample', 'target-legacy', sourceOf(legacy), 8);
  assert.equal(resolveImmersionCouplings([legacy, legacyTarget]).size, 0);
  assert.equal(immersionLayerSVG([legacy, legacyTarget]), '');

  const missingLegacy = objective('water');
  delete missingLegacy.params.immersion;
  missingLegacy.params.na = 1.2;
  const target = contactElement('sample', 'legacy-target', sourceOf(missingLegacy), 8);
  assert.equal(immersionLayerSVG([missingLegacy, target]), '');

  const water = objective('water');
  const waterSVG = immersionLayerSVG([water]);
  assert.doesNotMatch(waterSVG, /immersion-meniscus/);
  assert.match(waterSVG, /class="objective-na-overlay"[^>]*data-na-anchor="nominal-focus"/);
});

test('water, oil, and custom bridges render distinct finite world-space spline menisci', () => {
  const renders = new Map();
  for (const medium of ['water', 'oil', 'custom']) {
    const obj = objective(medium);
    if (medium === 'custom') obj.params.immersionIndex = 1.41;
    const source = sourceOf(obj);
    const target = contactElement('sample', `render-${medium}`, source, 12);
    const before = JSON.stringify([obj, target]);
    const svg = immersionLayerSVG([obj, target]);
    renders.set(medium, svg);

    assert.match(svg, new RegExp(`data-immersion-objective-id="${obj.id}"`));
    assert.match(svg, new RegExp(`class="immersion-coupling immersion-${medium}"`));
    assert.match(svg, /class="immersion-meniscus"/);
    assert.match(svg, /class="objective-na-overlay"[^>]*data-na-anchor="contact"[^>]*data-schematic="true"/);
    assert.match(svg, /class="objective-na-acceptance"/);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
    assert.equal((svg.match(/<path\b/g) || []).length, 2);
    const meniscusPath = svg.match(/class="immersion-meniscus" d="([^"]+)"/)?.[1] || '';
    assert.match(meniscusPath, /^M .* C .* L .* C .* Z$/, 'the liquid boundary uses two cubic side splines');
    const coordinates = meniscusPath.match(/-?\d+(?:\.\d+)?/g)?.map(Number) || [];
    assert.ok(coordinates.length >= 16);
    assert.ok(coordinates.every(Number.isFinite));
    assert.equal(JSON.stringify([obj, target]), before, 'deriving/rendering a bridge must not mutate scene state');
  }

  assert.notEqual(renders.get('water'), renders.get('oil'));
  assert.notEqual(renders.get('oil'), renders.get('custom'));
  assert.notEqual(renders.get('water'), renders.get('custom'));
});

test('the meniscus attaches to the objective aperture edges and contacted specimen edges', () => {
  const obj = objective('water');
  const source = sourceOf(obj);
  const target = contactElement('sample', 'edge-target', source, 12);
  target.params.aperture = 50;
  const svg = immersionLayerSVG([obj, target]);
  const d = svg.match(/class="immersion-meniscus" d="([^"]+)"/)?.[1] || '';

  // At 10x the drawn front pupil is 40 mm across, hence +/-20 mm from
  // the objective centre. The rotated 50 mm specimen face contributes its
  // full +/-25 mm contact footprint.
  assert.match(d, new RegExp(`M ${source.x.toFixed(2)},${(source.y + 20).toFixed(2)}`));
  assert.match(d, new RegExp(`${(source.x + 12).toFixed(2)},${(source.y + 25).toFixed(2)} L `));
  assert.match(d, new RegExp(`L ${(source.x + 12).toFixed(2)},${(source.y - 25).toFixed(2)} C `));
  assert.match(d, new RegExp(`${source.x.toFixed(2)},${(source.y - 20).toFixed(2)} Z$`));
});

test('NA acceptance uses theta = asin(NA / n) and changes independently of the liquid meniscus', () => {
  const low = objective('water');
  low.params.na = 0.05;
  const lowTarget = contactElement('sample', 'na-target', sourceOf(low), 12);
  const high = cloneElement(low);
  high.params.na = 1.27;

  const lowSVG = immersionLayerSVG([low, lowTarget]);
  const highSVG = immersionLayerSVG([high, lowTarget]);
  const halfAngle = svg => Number(svg.match(/data-half-angle-deg="([^"]+)"/)?.[1]);
  const meniscus = svg => svg.match(/class="immersion-meniscus" d="([^"]+)"/)?.[1];
  const acceptance = svg => svg.match(/class="objective-na-acceptance"[^>]* d="([^"]+)"/)?.[1];

  assert.ok(Math.abs(halfAngle(lowSVG) - Math.asin(0.05 / 1.333) * 180 / Math.PI) < 0.001);
  assert.ok(Math.abs(halfAngle(highSVG) - Math.asin(1.27 / 1.333) * 180 / Math.PI) < 0.001);
  assert.ok(halfAngle(highSVG) > halfAngle(lowSVG));
  assert.equal(meniscus(highSVG), meniscus(lowSVG), 'NA must not deform the liquid boundary');
  assert.notEqual(acceptance(highSVG), acceptance(lowSVG), 'NA must visibly change the acceptance sector');
});

test('at fixed NA the medium index changes the schematic acceptance angle', () => {
  const water = objective('water');
  water.params.na = 1;
  const target = contactElement('sample', 'medium-angle-target', sourceOf(water), 12);
  const oil = cloneElement(water);
  oil.params.immersion = 'oil';

  const waterSVG = immersionLayerSVG([water, target]);
  const oilSVG = immersionLayerSVG([oil, target]);
  const halfAngle = svg => Number(svg.match(/data-half-angle-deg="([^"]+)"/)?.[1]);
  assert.ok(Math.abs(halfAngle(waterSVG) - Math.asin(1 / 1.333) * 180 / Math.PI) < 0.001);
  assert.ok(Math.abs(halfAngle(oilSVG) - Math.asin(1 / 1.518) * 180 / Math.PI) < 0.001);
  assert.ok(halfAngle(waterSVG) > halfAngle(oilSVG));
});

test('dry and uncoupled objectives keep NA visibly responsive at nominal working distance', () => {
  for (const medium of ['air', 'water']) {
    const low = objective(medium);
    low.params.na = 0.2;
    const high = cloneElement(low);
    high.params.na = medium === 'air' ? 1 : 1.2;
    const lowSVG = immersionLayerSVG([low]);
    const highSVG = immersionLayerSVG([high]);
    const acceptance = svg => svg.match(/class="objective-na-acceptance"[^>]* d="([^"]+)"/)?.[1];

    assert.match(lowSVG, /data-na-anchor="nominal-focus"/);
    assert.match(highSVG, /data-na-anchor="nominal-focus"/);
    assert.doesNotMatch(lowSVG, /immersion-meniscus/);
    assert.notEqual(acceptance(lowSVG), acceptance(highSVG), `${medium} NA must change the visible cone`);
  }
});

test('the open cone uses working distance while a connected cone uses the actual contact', () => {
  const dry = objective('air');
  dry.params.workingDistance = 6;
  dry.params.na = 0.7;
  const source = sourceOf(dry);
  const drySVG = immersionLayerSVG([dry]);
  const conePath = svg => svg.match(/class="objective-na-acceptance"[^>]* d="([^"]+)"/)?.[1] || '';
  assert.match(conePath(drySVG), new RegExp(`^M ${(source.x + 6).toFixed(2)},${source.y.toFixed(2)} `));

  const differentMagnification = cloneElement(dry);
  differentMagnification.params.magnification = 100;
  assert.equal(
    conePath(immersionLayerSVG([differentMagnification])),
    conePath(drySVG),
    'magnification/EFL must not move an independently configured nominal focus',
  );

  const wet = objective('water');
  wet.params.workingDistance = 20;
  const wetSource = sourceOf(wet);
  const target = contactElement('sample', 'contact-anchor-target', wetSource, 12);
  const wetSVG = immersionLayerSVG([wet, target]);
  assert.match(wetSVG, /data-na-anchor="contact"/);
  assert.match(conePath(wetSVG), new RegExp(`^M ${(wetSource.x + 12).toFixed(2)},${wetSource.y.toFixed(2)} `));
});

test('minimum gaps and maximum custom NA keep both visual paths finite and bounded', () => {
  const obj = objective('custom');
  obj.params.immersionIndex = 1.49;
  obj.params.na = 1.49;
  const target = contactElement('sample', 'short-gap-target', sourceOf(obj), 0.05);
  const svg = immersionLayerSVG([obj, target]);
  const halfAngle = Number(svg.match(/data-half-angle-deg="([^"]+)"/)?.[1]);

  assert.equal(halfAngle, 90);
  assert.equal((svg.match(/<path\b/g) || []).length, 2);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  for (const d of svg.matchAll(/ d="([^"]+)"/g)) {
    assert.ok((d[1].match(/-?\d+(?:\.\d+)?/g) || []).map(Number).every(Number.isFinite));
  }
});

test('the derived layer exports below rays, changes no trace, and stores no coupling relation', () => {
  const laser = createElement('cwlaser', -80, 0);
  laser.id = 'export-laser';
  const obj = objective('water');
  obj.id = 'export-objective';
  const target = contactElement('sample', 'export-sample', sourceOf(obj), 12);
  const elements = [laser, obj, target];

  const tracedBefore = traceScene(elements, []).drawables;
  const layer = immersionLayerSVG(elements);
  const tracedAfter = traceScene(elements, []).drawables;
  assert.deepEqual(tracedAfter, tracedBefore, 'rendering the coupling layer cannot change ray paths');
  assert.match(layer, /class="immersion-coupling immersion-water"/);

  state.elements = elements;
  state.beams = [];
  const exported = buildSVG();
  assert.equal(exported, buildSVG(), 'static export remains deterministic');
  const couplingIndex = exported.indexOf('class="immersion-coupling');
  const rayIndex = exported.indexOf('<polyline');
  const targetIndex = exported.indexOf(`translate(${target.x} ${target.y})`);
  assert.ok(couplingIndex >= 0 && couplingIndex < rayIndex, 'the coupling is below traced optical energy');
  assert.ok(couplingIndex < targetIndex, 'the coupling is below its target component');
  assert.doesNotMatch(exported, /NaN|Infinity|undefined/);

  const savedObjective = JSON.parse(serialize()).elements.find(element => element.id === obj.id);
  assert.deepEqual(
    Object.keys(savedObjective.params).filter(key => /target|coupling|gap/i.test(key)),
    [],
    'only objective properties are saved; target identity and gap geometry stay derived',
  );
});

test('animated export carries the authored stage coupling through its Z scan', () => {
  const obj = objective('oil');
  obj.id = 'animated-objective';
  const stage = contactElement('stage', 'animated-stage', sourceOf(obj), 14);
  stage.params.pzMode = 'z';
  stage.params.pzTravelZ = 8;
  stage.params.pzFreqZ = 1;
  state.elements = [obj, stage];
  state.beams = [];

  const frameA = buildSVG({ animation: { seconds: 0, playback: {} } });
  const frameB = buildSVG({ animation: { seconds: 0.5, playback: {} } });
  const meniscus = svg => svg.match(/class="immersion-meniscus" d="([^"]+)"/)?.[1];
  assert.ok(meniscus(frameA));
  assert.ok(meniscus(frameB));
  assert.notEqual(meniscus(frameA), meniscus(frameB), 'the liquid geometry follows the same moving stage');
});
