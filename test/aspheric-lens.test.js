import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ASPHERE_LIMITS, asphereSag, asphereSlope, asphericLensAdjustment,
  asphericLensCardinals, asphericLensGeometry, createElement, getDirectManipulation,
  getElementMeta, registry, touchingGlassBody,
} from '../sketch/js/elements.js';
import { detectorReading, traceAll, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { toLocal } from '../sketch/js/util.js';

const X = 200;

function axisCrossing(type, params, height, wavelength = 587.6) {
  const lens = createElement(type, X, 0);
  Object.assign(lens.params, { dia: 25.4, glass: 'nbk7', transEff: 100, ...params });
  const laser = createElement('cwlaser', 0, height);
  Object.assign(laser.params, { beamMode: 'line', wavelength });
  const path = traceScene([laser, lens]).drawables
    .filter(drawable => drawable.type === 'path')
    .sort((a, b) => b.pts.length - a.pts.length)[0];
  assert.ok(path?.pts.length >= 4, `${type} ray must enter and leave the glass`);
  const a = path.pts.at(-2), b = path.pts.at(-1);
  assert.ok(Math.abs(b.y - a.y) > 1e-12, 'outgoing ray must cross the axis');
  return a.x + (b.x - a.x) * -a.y / (b.y - a.y);
}

function backFocalDistance(type, params, height, wavelength = 587.6) {
  const crossing = axisCrossing(type, params, height, wavelength);
  const rearVertex = type === 'asphericlens'
    ? asphericLensGeometry({ dia: 25.4, ...params }).xv2
    : (params.thickness ?? 6) / 2;
  return crossing - (X + rearVertex);
}

test('aspheric lens exposes two standard even-asphere faces and direct controls', () => {
  const lens = createElement('asphericlens');
  assert.deepEqual(Object.keys(lens.params), [
    'r1', 'k1', 'r2', 'k2', 'thickness', 'dia', 'glass', 'transEff',
    'a4_1', 'a6_1', 'a8_1', 'a4_2', 'a6_2', 'a8_2',
  ]);
  assert.equal(lens.params.k1, -0.58);
  assert.equal(lens.params.k2, 0);
  assert.equal(lens.params.transEff, 98);
  const analytic = registry.asphericlens.surfaces(lens).filter(surface => surface.data.asphere);
  assert.equal(analytic.length, 2);
  assert.deepEqual(analytic.map(surface => surface.data.topologyKey), ['front', 'rear']);
  assert.deepEqual(getDirectManipulation(lens), {
    resize: { y: 'dia' },
    tune: { key: 'k1', short: 'k₁', param: registry.asphericlens.params[1] },
  });
  assert.equal(getElementMeta('asphericlens', lens.params).tier, 'simulated');
  assert.match(getElementMeta('asphericlens', lens.params).note, /exact intersections and surface normals/i);
});

test('the sag convention reproduces spheres and paraboloids exactly', () => {
  const R = 60, y = 12;
  const spherical = R - Math.sqrt(R * R - y * y);
  assert.ok(Math.abs(asphereSag(y, { R, k: 0 }) - spherical) < 1e-12);
  assert.ok(Math.abs(asphereSag(y, { R, k: -1 }) - y * y / (2 * R)) < 1e-12);

  const profile = { R: 40, k: -0.7, a4: 3e-6, a6: -2e-9, a8: 1e-12 };
  const step = 1e-5;
  const numericSlope = (asphereSag(y + step, profile) - asphereSag(y - step, profile)) / (2 * step);
  assert.ok(Math.abs(asphereSlope(y, profile) - numericSlope) < 1e-8,
    'the analytic normal must match the differentiated surface');
});

test('zero asphere terms trace identically to the exact spherical singlet', () => {
  const common = { r1: 60, r2: -60, thickness: 6, dia: 25.4, glass: 'nbk7' };
  const sphericalAsphere = {
    ...common, k1: 0, k2: 0,
    a4_1: 0, a6_1: 0, a8_1: 0,
    a4_2: 0, a6_2: 0, a8_2: 0,
  };
  for (const height of [0.2, 4, 10, 12]) {
    const expected = backFocalDistance('thicklens', common, height);
    const actual = backFocalDistance('asphericlens', sphericalAsphere, height);
    assert.ok(Math.abs(actual - expected) < 2e-7,
      `height ${height}: asphere ${actual} vs spherical ${expected}`);
  }
});

test('oblique hits land on the analytic profile and the finite aperture clips safely', () => {
  const lens = createElement('asphericlens', X, 0);
  lens.rot = 17;
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  const path = traceScene([laser, lens]).drawables.find(drawable => drawable.type === 'path');
  assert.ok(path?.pts.length >= 4);
  const hit = toLocal(lens, path.pts[1].x, path.pts[1].y);
  const geometry = asphericLensGeometry(lens.params);
  assert.ok(Math.abs(hit.x - (geometry.xv1 + asphereSag(hit.y, geometry.front))) < 1e-8,
    'the traced hit belongs to the analytic face, not a drawing chord');

  const miss = createElement('cwlaser', 0, geometry.h + 0.1);
  miss.params.beamMode = 'line';
  const missedPath = traceScene([miss, createElement('asphericlens', X, 0)]).drawables
    .find(drawable => drawable.type === 'path');
  assert.equal(missedPath.pts.length, 2, 'a ray outside the clear aperture misses the finite lens');

  const corner = createElement('cwlaser', 0, geometry.h);
  corner.params.beamMode = 'line';
  const cornerPath = traceScene([corner, createElement('asphericlens', X, 0)]).drawables
    .find(drawable => drawable.type === 'path');
  assert.ok(cornerPath.pts.length >= 2, 'a boundary ray remains traceable');
  assert.ok(cornerPath.pts.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
});

test('near-tangent paired roots inside one scan interval still refract the ray', () => {
  const lens = createElement('asphericlens', X, 0);
  Object.assign(lens.params, {
    r1: 30, k1: 0, r2: 0, k2: 0, thickness: 6, dia: 25.4,
    a4_1: 0, a6_1: 0, a8_1: 0, a4_2: 0, a6_2: 0, a8_2: 0,
  });

  // In lens-local coordinates this is the review reproduction
  // x = -3 + 0.1700743y - 0.430776. It crosses the spherical front face
  // twice near y = 5.006 and y = 5.054, inside one of the old 128 scan bins.
  const lineSlope = 0.1700743;
  const directionLength = Math.hypot(lineSlope, 1);
  const dx = lineSlope / directionLength;
  const dy = 1 / directionLength;
  const sourceY = -20;
  const sourceX = X - lens.params.thickness / 2 + lineSlope * sourceY - 0.430776;
  const laser = createElement('cwlaser', sourceX - 52 * dx, sourceY - 52 * dy);
  laser.rot = Math.atan2(dy, dx) * 180 / Math.PI;
  laser.params.beamMode = 'line';

  const path = traceScene([laser, lens]).drawables.find(drawable => drawable.type === 'path');
  assert.ok(path?.pts.length > 2, 'the near-grazing ray must interact instead of passing through untouched');
  const firstHit = toLocal(lens, path.pts[1].x, path.pts[1].y);
  assert.ok(Math.abs(firstHit.y - 5.006) < 0.01, `first front-face hit was at y=${firstHit.y}`);
});

test('aspheric containment uses the realized analytic faces', () => {
  const lens = createElement('asphericlens');
  Object.assign(lens.params, { r1: 30, k1: 0, dia: 25.4 });
  const localPoint = { x: -2.993, y: 0.5292 };
  const geometry = asphericLensGeometry(lens.params);
  const frontX = geometry.xv1 + asphereSag(localPoint.y, geometry.front);
  const rearX = geometry.xv2 + asphereSag(localPoint.y, geometry.rear);

  assert.ok(frontX < localPoint.x && localPoint.x < rearX,
    `review point must be analytically inside [${frontX}, ${rearX}]`);
  assert.equal(registry.asphericlens.containsLocal(lens, localPoint), true);
});

test('the default conic suppresses longitudinal spherical aberration', () => {
  const lens = createElement('asphericlens');
  const corrected = { ...lens.params, transEff: 100 };
  const spherical = { ...corrected, k1: 0 };
  const heights = [0.5, 3, 6, 9, 12];
  const focusSpan = params => {
    const foci = heights.map(height => backFocalDistance('asphericlens', params, height));
    return Math.max(...foci) - Math.min(...foci);
  };
  const correctedSpan = focusSpan(corrected);
  const sphericalSpan = focusSpan(spherical);
  assert.ok(correctedSpan < 0.03, `default longitudinal spread is ${correctedSpan} mm`);
  assert.ok(correctedSpan < sphericalSpan / 50,
    `asphere ${correctedSpan} mm should strongly beat sphere ${sphericalSpan} mm`);
});

test('higher-order coefficients alter marginal rays without changing paraxial power', () => {
  const base = createElement('asphericlens').params;
  const changed = { ...base, a4_1: 1e-5 };
  assert.deepEqual(asphericLensCardinals(changed), asphericLensCardinals(base),
    'A4 begins at fourth order and must not rewrite the paraxial readout');
  const baseFocus = backFocalDistance('asphericlens', base, 12);
  const changedFocus = backFocalDistance('asphericlens', changed, 12);
  assert.ok(Math.abs(changedFocus - baseFocus) > 5,
    'A4 must change the physical intersection/normal, not only the SVG');
});

test('per-face transmission, catalogue dispersion, and rotation use the common glass path', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  const lens = createElement('asphericlens', 180, 0);
  Object.assign(lens.params, { r1: 2000, r2: -2000, k1: 0, transEff: 50 });
  const detector = createElement('detector', 360, 0);
  detector.params.aperture = 40;
  traceAll([laser, lens, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.25) < 1e-9,
    'two 50% faces leave one quarter of the power');

  const blue = backFocalDistance('asphericlens', { ...createElement('asphericlens').params }, 3, 486.1);
  const red = backFocalDistance('asphericlens', { ...createElement('asphericlens').params }, 3, 656.3);
  assert.ok(blue < red, 'normal glass dispersion focuses blue before red');

  lens.rot = 12;
  const drawables = traceAll([laser, lens]);
  for (const drawable of drawables) {
    for (const point of drawable.pts || drawable.dots || []) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    }
  }
});

test('malformed and impossible prescriptions stay finite and disclose realization', () => {
  const raw = {
    app: 'optics2d', version: 1, beams: [],
    elements: [{
      id: 'asphere', type: 'asphericlens', x: 0, y: 0,
      params: {
        r1: 1, k1: 999, r2: -1, k2: -999, thickness: 0.5, dia: 500,
        glass: 'not-a-glass', transEff: 999,
        a4_1: 1, a6_1: -1, a8_1: 1, a4_2: -1, a6_2: 1, a8_2: -1,
      },
    }],
  };
  const [lens] = parseSketch(JSON.stringify(raw), registry).elements;
  assert.equal(lens.params.k1, ASPHERE_LIMITS.conic);
  assert.equal(lens.params.k2, -ASPHERE_LIMITS.conic);
  assert.equal(lens.params.a4_1, ASPHERE_LIMITS.a4);
  assert.equal(lens.params.transEff, 100);
  assert.equal(lens.params.glass, 'nbk7');

  const geometry = asphericLensGeometry(lens.params);
  assert.ok(asphericLensAdjustment(lens.params));
  assert.ok(Number.isFinite(geometry.span) && geometry.span < 2000);
  assert.doesNotMatch(registry.asphericlens.svg(lens), /NaN|Infinity|undefined/);
  for (const surface of registry.asphericlens.surfaces(lens)) {
    assert.ok([surface.x1, surface.y1, surface.x2, surface.y2].every(Number.isFinite));
    if (surface.data.asphere) {
      const profile = surface.data.asphere;
      assert.ok([profile.cx, profile.cy, profile.R, profile.k, profile.a4, profile.a6, profile.a8]
        .every(Number.isFinite));
    }
  }
  const meta = getElementMeta('asphericlens', lens.params);
  assert.match(meta.note, /outside the finite-aperture safety bounds/i);
});

test('aspheric singlets participate in glass-body contact warnings', () => {
  const sphere = createElement('thicklens', 100, 0);
  Object.assign(sphere.params, { r1: 0, r2: 0, thickness: 6, dia: 25.4 });
  const asphere = createElement('asphericlens', 106, 0);
  Object.assign(asphere.params, { r1: 0, r2: 0, thickness: 6, dia: 25.4 });
  const warning = touchingGlassBody(sphere, [sphere, asphere]);
  assert.ok(warning);
  assert.equal(warning.type, 'asphericlens');
});
