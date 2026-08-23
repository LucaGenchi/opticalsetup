import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, getSize, registry } from '../sketch/js/elements.js';
import { immersionLayerSVG } from '../sketch/js/immersion.js';
import {
  OBJECTIVE_FRONT_X,
  objectiveAcceptanceHalfAngle,
  objectiveMediumIndex,
  objectiveNumericalAperture,
  objectiveWorkingDistance,
} from '../sketch/js/objective.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';

const EPSILON = 1e-6;
const file = (elements = []) => JSON.stringify({ app: 'optics2d', version: 1, elements, beams: [] });

function near(actual, expected, tolerance = EPSILON, message = '') {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message || `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

function firstPathData(svg) {
  const match = svg.match(/<path\b[^>]*\bd="([^"]+)"/);
  assert.ok(match, 'the objective has an outer body path');
  return match[1];
}

function objectiveBounds(objective) {
  return {
    size: getSize(objective),
    anchor: registry.objective.boxAnchor?.(objective) || { x: 0, y: 0 },
    bodyPath: firstPathData(registry.objective.svg(objective)),
  };
}

function objectiveLens(objective) {
  const lens = registry.objective.surfaces(objective).find(surface => surface.kind === 'lens');
  assert.ok(lens, 'the objective exposes one ideal refracting plane');
  return lens;
}

function attrNumber(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}="([^"]+)"`));
  assert.ok(match, `guide line has ${name}`);
  const value = Number(match[1]);
  assert.ok(Number.isFinite(value), `${name} is finite`);
  return value;
}

function acceptanceGuideLines(objective) {
  const svg = immersionLayerSVG([objective]);
  const tags = [...svg.matchAll(/<line\b[^>]*class="[^"]*\bobjective-na-marginal\b[^"]*"[^>]*>/g)]
    .map(match => match[0]);
  assert.equal(tags.length, 2, 'the NA guide is exactly two straight marginal rays');
  return tags.map(tag => ({
    x1: attrNumber(tag, 'x1'),
    y1: attrNumber(tag, 'y1'),
    x2: attrNumber(tag, 'x2'),
    y2: attrNumber(tag, 'y2'),
  }));
}

function farPointSourceRays(source, objective) {
  return traceScene([source, objective], []).drawables.filter(drawable => {
    const end = drawable.pts?.at(-1);
    return drawable.pts?.length >= 2 && end && end.x < objective.x - 1000;
  });
}

test('objective axial geometry stays fixed while clear aperture alone resizes the housing height', () => {
  const objective = createElement('objective');
  const expected = objectiveBounds(objective);
  const variants = [
    { workingDistance: 1, na: 0.05, immersion: 'air', frontAperture: 20 },
    { workingDistance: 80, na: 0.85, immersion: 'air', frontAperture: 100 },
    { workingDistance: 4, na: 1.4, immersion: 'oil', frontAperture: 20 },
    { workingDistance: 30, na: 1.1, immersion: 'custom', immersionIndex: 1.42, frontAperture: 48 },
    // Retired optical-size fields can still be present transiently while an
    // old sketch is loading, but must never leak into canvas geometry.
    { efl: 200, magnification: 1, workingDistance: 12, frontAperture: 75 },
  ];

  for (const params of variants) {
    Object.assign(objective.params, params);
    assert.deepEqual(objectiveBounds(objective), expected);
  }

  objective.params.frontAperture = 4;
  const narrowed = objectiveBounds(objective);
  assert.equal(narrowed.size.w, expected.size.w, 'aperture resizing never stretches the axial footprint');
  assert.ok(narrowed.size.h < expected.size.h, 'the housing height follows a smaller clear opening');
  assert.deepEqual(narrowed.anchor, expected.anchor, 'the fixed front/back placement keeps the same box anchor');
  assert.notEqual(narrowed.bodyPath, expected.bodyPath, 'the visible housing follows the authored opening');
});

test('the fixed plane focuses, draws a distinct physical continuation, and remains reciprocal', () => {
  const objective = createElement('objective', 200, 0);
  Object.assign(objective.params, {
    workingDistance: 12,
    frontAperture: 20,
    immersion: 'air',
    na: 0.65,
  });
  const lens = objectiveLens(objective);
  assert.equal(lens.x1, OBJECTIVE_FRONT_X);
  assert.equal(lens.x2, OBJECTIVE_FRONT_X);
  assert.equal(lens.data.f, 12);

  const frontX = objective.x + OBJECTIVE_FRONT_X;
  const focusX = frontX + objectiveWorkingDistance(objective.params);
  const laser = createElement('cwlaser', 20, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 4;
  const detector = createElement('detector', focusX + 120, 0);
  const scene = traceScene([laser, objective, detector], []);
  const focusedEdges = scene.drawables.filter(drawable => {
    if (drawable.pts?.length !== 2) return false;
    const [start, end] = drawable.pts;
    return Math.abs(start.x - frontX) < EPSILON
      && end.x >= focusX && end.x <= focusX + 0.03;
  });
  assert.ok(focusedEdges.length >= 2, 'both collimated beam edges end visibly at focus');
  for (const edge of focusedEdges) {
    const [start, end] = edge.pts;
    const t = -start.y / (end.y - start.y);
    near(start.x + t * (end.x - start.x), focusX, 1e-6, 'each edge crosses the axis at the nominal focus');
  }
  const continuation = scene.drawables.filter(drawable => drawable.segment === 'post-focus');
  assert.ok(continuation.some(drawable => drawable.type === 'poly'), 'the divergent beam envelope remains visible after focus');
  const continuationEdges = continuation.filter(drawable => drawable.type === 'path');
  assert.ok(continuationEdges.length >= 2, 'both post-focus edges remain visible');
  assert.ok(continuationEdges.every(drawable => drawable.dash === '4 3'), 'post-focus edges use a distinct dashed treatment');
  assert.ok(
    Math.max(...continuation.map(drawable => drawable.opacity ?? 0))
      < Math.max(...scene.drawables.filter(drawable => drawable.segment !== 'post-focus').map(drawable => drawable.opacity ?? 0)),
    'the continuation is fainter than the incident and converging beam',
  );
  assert.ok(continuation.some(drawable => drawable.pts?.some(point => point.x > focusX + 50)), 'visible light propagates well beyond the waist');
  assert.ok(detectorReading(detector.id)?.signal > 0, 'the same visible continuation reaches downstream physics');

  const point = createElement('pointsource', focusX, 0);
  point.rot = 180;
  point.params.spread = 30;
  point.params.nrays = 5;
  const collimated = farPointSourceRays(point, objective);
  assert.equal(collimated.length, 5, 'all five rays inside the acceptance cone leave the back');
  for (const ray of collimated) {
    const a = ray.pts.at(-2);
    const b = ray.pts.at(-1);
    near((b.y - a.y) / (b.x - a.x), 0, 1e-9, 'a point at focus leaves as a collimated ray');
  }
});

test('NA, clear aperture, traced acceptance, and the visible marginal guide use one cone', () => {
  const objective = createElement('objective', 0, 0);
  Object.assign(objective.params, {
    workingDistance: 10,
    frontAperture: 2,
    immersion: 'air',
    na: 0.8,
    showAcceptance: true,
  });

  const index = objectiveMediumIndex(objective.params);
  const ratedHalfAngle = Math.asin(objectiveNumericalAperture(objective.params) / index);
  const acceptedRadius = Math.min(
    objective.params.frontAperture / 2,
    objectiveWorkingDistance(objective.params) * Math.tan(ratedHalfAngle),
  );
  assert.equal(acceptedRadius, 1, 'this setup is deliberately clear-aperture limited');

  const lens = objectiveLens(objective);
  near((lens.y2 - lens.y1) / 2, acceptedRadius, 1e-6, 'the trace plane uses the effective accepted radius');
  const effectiveHalfAngle = Math.atan2(acceptedRadius, objectiveWorkingDistance(objective.params));
  const effectiveNA = index * Math.sin(effectiveHalfAngle);
  near(objectiveAcceptanceHalfAngle(objective.params), effectiveHalfAngle, 1e-9);
  near(lens.data.objectiveNA, effectiveNA, 1e-9, 'downstream physics receives effective rather than unattainable rated NA');
  assert.ok(lens.data.objectiveNA < objectiveNumericalAperture(objective.params));

  const guide = acceptanceGuideLines(objective);
  const frontX = objective.x + OBJECTIVE_FRONT_X;
  const focusX = frontX + objectiveWorkingDistance(objective.params);
  const frontEnds = [];
  const focusEnds = [];
  for (const line of guide) {
    const ends = [
      { x: line.x1, y: line.y1 },
      { x: line.x2, y: line.y2 },
    ];
    frontEnds.push(ends.find(point => Math.abs(point.x - frontX) < EPSILON));
    focusEnds.push(ends.find(point => Math.abs(point.x - focusX) < EPSILON));
  }
  assert.ok(frontEnds.every(Boolean), 'both guide rays start on the fixed front plane');
  assert.ok(focusEnds.every(Boolean), 'both guide rays meet at the nominal focus');
  assert.deepEqual(frontEnds.map(point => point.y).sort((a, b) => a - b), [-acceptedRadius, acceptedRadius]);
  assert.ok(focusEnds.every(point => Math.abs(point.y) < EPSILON));

  const sourceAt = spread => {
    const point = createElement('pointsource', focusX, 0);
    point.rot = 180;
    point.params.spread = spread;
    point.params.nrays = 3;
    return point;
  };
  const acceptedAngleDeg = effectiveHalfAngle * 180 / Math.PI;
  assert.equal(
    farPointSourceRays(sourceAt(acceptedAngleDeg * 1.8), objective).length,
    3,
    'rays just inside the displayed marginal guide pass',
  );
  assert.equal(
    farPointSourceRays(sourceAt(acceptedAngleDeg * 2.2), objective).length,
    1,
    'the two rays just outside the displayed marginal guide are stopped',
  );
});

test('changing rated NA moves only the guide endpoints along the fixed front plane', () => {
  const objective = createElement('objective', 40, 15);
  Object.assign(objective.params, {
    workingDistance: 8,
    frontAperture: 40,
    immersion: 'air',
    showAcceptance: true,
    na: 0.2,
  });
  const low = acceptanceGuideLines(objective);
  objective.params.na = 0.8;
  const high = acceptanceGuideLines(objective);

  const sortedEndpoints = lines => lines.flatMap(line => [
    { x: line.x1, y: line.y1 },
    { x: line.x2, y: line.y2 },
  ]).sort((a, b) => a.x - b.x || a.y - b.y);
  const lowPoints = sortedEndpoints(low);
  const highPoints = sortedEndpoints(high);
  const frontX = objective.x + OBJECTIVE_FRONT_X;
  const focusX = frontX + objectiveWorkingDistance(objective.params);

  assert.ok(lowPoints.slice(0, 2).every(point => Math.abs(point.x - frontX) < EPSILON));
  assert.ok(highPoints.slice(0, 2).every(point => Math.abs(point.x - frontX) < EPSILON));
  assert.deepEqual(lowPoints.slice(2), [{ x: focusX, y: objective.y }, { x: focusX, y: objective.y }]);
  assert.deepEqual(highPoints.slice(2), lowPoints.slice(2), 'the apex does not move with NA');
  const lowHalfWidth = Math.abs(lowPoints[0].y - objective.y);
  const highHalfWidth = Math.abs(highPoints[0].y - objective.y);
  assert.ok(highHalfWidth > lowHalfWidth * 3, 'higher NA visibly opens the same cone');
});

test('legacy objective files migrate to the coherent model with bounded aperture-backed housing', () => {
  const legacyMagnification = createElement('objective', 0, 0);
  legacyMagnification.params = { magnification: 25, na: 0.8, transEff: 90 };
  const legacyFocal = createElement('objective', 60, 0);
  legacyFocal.params = { f: 20, aperture: 24, transEff: 91 };
  const transitional = createElement('objective', 120, 0);
  transitional.params = {
    efl: 12,
    workingDistance: 4,
    frontAperture: 30,
    immersion: 'oil',
    na: 1.2,
    showAcceptance: true,
    transEff: 87,
  };

  const loaded = parseSketch(file([legacyMagnification, legacyFocal, transitional]), registry).elements;
  const [fromMagnification, fromFocal, fromTransition] = loaded;
  assert.equal(fromMagnification.params.workingDistance, 8, '25x seeds an 8 mm focal distance');
  assert.equal(fromMagnification.params.frontAperture, 20, 'legacy magnification did not author a trustworthy clear opening');
  assert.equal(fromMagnification.params.na, 0.8);
  assert.equal(fromMagnification.params.transEff, 90);

  assert.equal(fromFocal.params.workingDistance, 20);
  assert.equal(fromFocal.params.frontAperture, 20, 'the clear opening is bounded to the supported nose range');
  assert.equal(fromFocal.params.na, 0.6);
  assert.equal(fromFocal.params.transEff, 91);

  assert.equal(fromTransition.params.workingDistance, 4, 'authored WD wins over a transitional EFL');
  assert.equal(fromTransition.params.frontAperture, 20);
  assert.equal(fromTransition.params.immersion, 'oil');
  assert.equal(fromTransition.params.na, 1.2);
  assert.equal(fromTransition.params.showAcceptance, true);
  assert.equal(fromTransition.params.transEff, 87);

  for (const objective of loaded) {
    for (const retired of ['f', 'aperture', 'magnification']) {
      assert.equal(Object.hasOwn(objective.params, retired), false, `${retired} is normalized away`);
    }
    assert.equal(
      objective.params.efl,
      objective.params.workingDistance,
      'the hidden compatibility EFL stays synchronized with the single focal distance',
    );
    const lens = objectiveLens(objective);
    assert.equal(lens.x1, OBJECTIVE_FRONT_X);
    assert.equal(lens.data.f, objective.params.workingDistance);
    assert.ok([lens.x1, lens.y1, lens.x2, lens.y2, lens.data.f, lens.data.objectiveNA].every(Number.isFinite));
  }
  assert.deepEqual(objectiveBounds(fromMagnification), objectiveBounds(fromFocal));
  assert.deepEqual(objectiveBounds(fromFocal), objectiveBounds(fromTransition));

  const roundTrip = parseSketch(file(loaded), registry).elements;
  assert.deepEqual(roundTrip.map(element => element.params), loaded.map(element => element.params));
});

test('an objective without a light source never emits point-source-like traced rays', () => {
  const objective = createElement('objective');
  objective.params.showAcceptance = false;
  assert.deepEqual(traceScene([objective], []).drawables, []);
});
