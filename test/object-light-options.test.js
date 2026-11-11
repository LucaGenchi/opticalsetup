// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The Object's light options: where its rays start (anchor, tip, tip and
// base), where they point (straight ahead, or filling the first optic), and
// where the shape sits on its anchor (centred, or standing on it).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, getDirectManipulation, objectBaseFanColor, registry } from '../sketch/js/elements.js';
import { aimedFanSpan, objectAimScene } from '../sketch/js/object-aim.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';

const near = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b} (tolerance ${tol})`);

// The lesson scene: an arrow 22 mm tall standing on the axis, 300 mm in front
// of an f = 100 mm lens (25.4 mm across), so the image is 150 mm behind the
// lens at m = −0.5, its tip 11 mm below the axis.
function lessonScene({ params = {}, slitGap = null, rot = 0 } = {}) {
  const object = createElement('objarrow', 0, 0);
  object.rot = rot;
  Object.assign(object.params, {
    anchor: 'base', raysFrom: 'tip', aim: 'optic', nrays: 21, height: 22, showImage: true, ...params,
  });
  const lens = createElement('lens', 300, 0);
  lens.params.f = 100;
  const elements = [object, lens];
  if (slitGap !== null) {
    const slit = createElement('slit', 200, 0);
    slit.params.gap = slitGap;
    elements.push(slit);
  }
  return { object, lens, elements };
}

// Each ray's crossing of the lens plane and the straight line it leaves on.
function raysThroughLens(result, object) {
  return result.paths.filter(r => r.sourceId === object.id).map(r => {
    const i = r.pts.findIndex((p, k) => k > 0 && r.pts[k - 1].x < 300 && p.x >= 300 - 1e-6);
    return i > 0 ? { color: r.color, atLens: r.pts[i], next: r.pts[i + 1] } : { color: r.color, atLens: null };
  });
}

// The drawn image's arrowhead: its first vertex is the shape's tip.
const imageTip = result => result.drawables.find(d => d.type === 'poly' && d.opacity === 0.85)?.pts[0];

const distanceToLine = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / Math.hypot(dx, dy);
};

test('an Object saved before the light options opens centred, with its fan from the anchor straight ahead', () => {
  const saved = {
    app: 'optics2d', version: 1, beams: [],
    elements: [{ id: 'o', type: 'objarrow', x: 0, y: 0, rot: 0, params: { height: 20, shape: 'arrow', raysMode: 'fan', spread: 10, nrays: 3, showImage: true, wavelength: 620 } }],
  };
  const [object] = parseSketch(JSON.stringify(saved), registry).elements;
  assert.equal(object.params.anchor, 'centre');
  assert.equal(object.params.raysFrom, 'axis');
  assert.equal(object.params.aim, 'ahead');
  // The fan of before: three rays from (1, 0), 10° across, the middle one on the axis.
  const rays = registry.objarrow.source(object, { surfaces: [] });
  assert.deepEqual(rays.map(r => [r.x, r.y]), [[1, 0], [1, 0], [1, 0]]);
  near(Math.atan2(rays[0].dy, rays[0].dx) * 180 / Math.PI, -5, 1e-12, 'first ray');
  near(rays[1].dy, 0, 1e-15, 'middle ray');
  // The arrowhead's point is still half the height above the anchor.
  assert.match(registry.objarrow.svg(object), /<polygon points="0\.0,-10\.0 /);
});

test('a new Object is centred on the axis and fills the first optic from its tip, and keeps that through a save', () => {
  const object = createElement('objarrow', 0, 0);
  assert.equal(object.params.anchor, 'centre');
  assert.equal(object.params.raysFrom, 'tip');
  assert.equal(object.params.aim, 'optic');
  const lens = createElement('lens', 300, 0);
  lens.params.f = 100;
  const result = traceScene([object, lens], []);
  const tip = imageTip(result);
  near(tip.x, 450, 1e-9, 'image distance');
  // The tip stands half the height above the axis; its image, at m = −0.5,
  // a quarter of it below.
  near(tip.y, object.params.height / 4, 1e-9, 'inverted half-size tip');
  const rays = raysThroughLens(result, object);
  assert.equal(rays.length, object.params.nrays);
  for (const r of rays) near(distanceToLine(tip, r.atLens, r.next), 0, 1e-9, 'ray through the image tip');
  // A save writes every param, so the reloaded Object is not mistaken for one
  // saved before the options existed.
  const saved = { app: 'optics2d', version: 1, beams: [], elements: [object, lens] };
  const [reloaded] = parseSketch(JSON.stringify(saved), registry).elements;
  assert.equal(reloaded.params.anchor, 'centre');
  assert.equal(reloaded.params.raysFrom, 'tip');
  assert.equal(reloaded.params.aim, 'optic');
});

test('an arrow standing on the axis fills the lens from its tip, and the rays meet at the drawn image tip', () => {
  const { object, elements } = lessonScene();
  const result = traceScene(elements, []);
  const rays = raysThroughLens(result, object);
  assert.equal(rays.length, 21);
  assert.ok(rays.every(r => r.atLens), 'every ray reaches the lens');
  const ys = rays.map(r => r.atLens.y);
  // Filled to within 1.5 % of the rim on both sides, never past it (the
  // edge rays are drawn 0.5 % of the fan's width inside the rim).
  assert.ok(Math.min(...ys) < -12.7 * 0.985 && Math.min(...ys) > -12.7, `lower edge ${Math.min(...ys)}`);
  assert.ok(Math.max(...ys) > 12.7 * 0.985 && Math.max(...ys) < 12.7, `upper edge ${Math.max(...ys)}`);
  const tip = imageTip(result);
  near(tip.x, 450, 1e-9, 'image distance');
  near(tip.y, 11, 1e-9, 'image tip height (m = −0.5, inverted)');
  for (const r of rays) near(distanceToLine(tip, r.atLens, r.next), 0, 1e-9, 'ray through the image tip');
  // The arrow's drawn base sits on the anchor.
  assert.match(registry.objarrow.svg(object), /<polyline points="0\.0,0\.0 0\.0,-15\.8"/);
});

test('a slit in front of the lens narrows the aimed fan to the slit, and the image stays put', () => {
  const open = traceScene(lessonScene().elements, []);
  for (const gap of [4, 0.5]) {
    const { object, elements } = lessonScene({ slitGap: gap });
    const result = traceScene(elements, []);
    const rays = raysThroughLens(result, object);
    assert.equal(rays.length, 21);
    assert.ok(rays.every(r => r.atLens), `gap ${gap}: every ray passes the slit and reaches the lens`);
    // From the tip, 22 mm up, the slit's opening ±gap/2 at 200 mm maps to
    // −22 + (y + 22)·1.5 on the lens, cut off by the lens rim at 12.7.
    const lo = -22 + (-gap / 2 + 22) * 1.5, hi = Math.min(12.7, -22 + (gap / 2 + 22) * 1.5);
    const ys = rays.map(r => r.atLens.y);
    assert.ok(Math.min(...ys) >= lo && Math.min(...ys) < lo + 0.02 * (hi - lo), `gap ${gap}: lower edge ${Math.min(...ys)} vs ${lo}`);
    assert.ok(Math.max(...ys) <= hi && Math.max(...ys) > hi - 0.02 * (hi - lo), `gap ${gap}: upper edge ${Math.max(...ys)} vs ${hi}`);
    assert.deepEqual(imageTip(result), imageTip(open), `gap ${gap}: image unchanged`);
    const tip = imageTip(result);
    for (const r of rays) near(distanceToLine(tip, r.atLens, r.next), 0, 1e-9, `gap ${gap}: ray through the image tip`);
  }
});

test('the aimed fan follows the lens when the lens moves', () => {
  const { object, lens, elements } = lessonScene();
  lens.y = 6;
  const rays = raysThroughLens(traceScene(elements, []), object);
  const ys = rays.map(r => r.atLens?.y);
  assert.ok(ys.every(Number.isFinite));
  assert.ok(Math.min(...ys) > 6 - 12.7 && Math.min(...ys) < 6 - 12.7 * 0.985, `lower edge ${Math.min(...ys)}`);
  assert.ok(Math.max(...ys) < 6 + 12.7 && Math.max(...ys) > 6 + 12.7 * 0.985, `upper edge ${Math.max(...ys)}`);
});

test('tip and base fans: the base fan meets on the axis in a second colour, the tip fan at the image tip', () => {
  const { object, elements } = lessonScene({ params: { raysFrom: 'tipBase', nrays: 5 } });
  const result = traceScene(elements, []);
  const rays = raysThroughLens(result, object);
  assert.equal(rays.length, 10);
  const base = rays.filter(r => r.color), tipFan = rays.filter(r => !r.color);
  assert.equal(base.length, 5);
  assert.equal(tipFan.length, 5);
  assert.ok(base.every(r => r.color === objectBaseFanColor(object.params)));
  for (const r of base) near(distanceToLine({ x: 450, y: 0 }, r.atLens, r.next), 0, 1e-9, 'base ray through the image base');
  for (const r of tipFan) near(distanceToLine(imageTip(result), r.atLens, r.next), 0, 1e-9, 'tip ray through the image tip');
  // Drawn in that colour; the light keeps the object's wavelength.
  assert.ok(result.drawables.some(d => d.type === 'path' && d.color === objectBaseFanColor(object.params)));
  assert.ok(result.paths.filter(r => r.sourceId === object.id).every(r => r.wl === object.params.wavelength));
});

test('a centred Object aims from its tip too, and its image is drawn around the anchor’s image', () => {
  const { object, elements } = lessonScene({ params: { anchor: 'centre' } });
  const result = traceScene(elements, []);
  const tip = imageTip(result);
  near(tip.x, 450, 1e-9, 'image distance');
  near(tip.y, 5.5, 1e-9, 'tip 11 mm above the anchor images 5.5 mm below the axis');
  for (const r of raysThroughLens(result, object)) near(distanceToLine(tip, r.atLens, r.next), 0, 1e-9, 'ray through the image tip');
});

test('a turned standing Object still aims at the lens and images its tip where its rays meet', () => {
  // Object turned 90° (facing down the page) with the lens 300 mm below it.
  const object = createElement('objarrow', 0, 0);
  object.rot = 90;
  Object.assign(object.params, { anchor: 'base', raysFrom: 'tip', aim: 'optic', nrays: 7, height: 22, showImage: true });
  const lens = createElement('lens', 0, 300);
  lens.rot = 90;
  lens.params.f = 100;
  const result = traceScene([object, lens], []);
  const tip = imageTip(result);
  near(tip.y, 450, 1e-9, 'image distance');
  near(tip.x, -11, 1e-9, 'inverted half-size tip');
  const paths = result.paths.filter(r => r.sourceId === object.id);
  assert.equal(paths.length, 7);
  for (const r of paths) {
    const last = r.pts.at(-1), prev = r.pts.at(-2);
    assert.ok(prev.y >= 300 - 1e-6, 'every ray went through the lens');
    near(distanceToLine(tip, prev, last), 0, 1e-9, 'ray through the image tip');
  }
});

test('with no optic on its axis, or the optic behind it, an aimed fan points straight ahead', () => {
  for (const lensX of [null, -300]) {
    const object = createElement('objarrow', 0, 0);
    Object.assign(object.params, { anchor: 'base', raysFrom: 'tip', aim: 'optic', nrays: 3, spread: 10 });
    const elements = [object];
    if (lensX !== null) elements.push(createElement('lens', lensX, 0));
    const surfaces = lensX === null ? [] : [{ a: { x: lensX, y: -12.7 }, b: { x: lensX, y: 12.7 }, kind: 'lens', el: elements[1] }];
    const rays = registry.objarrow.source(object, { surfaces });
    near(Math.atan2(rays[0].dy, rays[0].dx) * 180 / Math.PI, -5, 1e-12, `lens at ${lensX}: first ray`);
    near(Math.atan2(rays[2].dy, rays[2].dx) * 180 / Math.PI, 5, 1e-12, `lens at ${lensX}: last ray`);
    // Each ray lies on a line through the tip itself.
    for (const r of rays) near(r.x * r.dy - (r.y + 22) * r.dx, 0, 1e-12, 'ray through the tip');
  }
});

test('aimedFanSpan finds a narrow opening exactly and gives up when nothing gets through', () => {
  const el = { x: 0, y: 0, rot: 0 };
  const lensSurface = { a: { x: 300, y: -12.7 }, b: { x: 300, y: 12.7 }, kind: 'lens' };
  const blade = (y1, y2) => ({ a: { x: 200, y: y1 }, b: { x: 200, y: y2 }, kind: 'absorb' });
  // A 0.2 mm opening in a plate, seen from the axis 200 mm away: far narrower
  // than any sampling of the lens's 4.8° would catch.
  const scene = objectAimScene(el, [lensSurface, blade(-25, -0.1), blade(0.1, 25)]);
  const span = aimedFanSpan({ x: 0, y: 0 }, scene);
  near(span.lo, Math.atan2(-0.1, 200) * 0.995 + Math.atan2(0.1, 200) * 0.005, 1e-12, 'lower edge');
  near(span.hi, Math.atan2(0.1, 200) * 0.995 + Math.atan2(-0.1, 200) * 0.005, 1e-12, 'upper edge');
  // A closed plate: no direction reaches the lens.
  assert.equal(aimedFanSpan({ x: 0, y: 0 }, objectAimScene(el, [lensSurface, blade(-25, 25)])), null);
  // A filter in front is not a target and not an obstacle.
  const filtered = objectAimScene(el, [lensSurface, { a: { x: 100, y: -12.7 }, b: { x: 100, y: 12.7 }, kind: 'filter' }]);
  assert.equal(filtered.targets.length, 1);
  assert.equal(filtered.targets[0].a.x, 300);
  assert.equal(filtered.obstacles.length, 0);
});

// Where each of the Object's rays first meets something.
const firstHits = (result, object) => result.paths.filter(r => r.sourceId === object.id).map(r => r.pts[1]);

test('a curved mirror is filled across its whole face, not only the segment on the axis', () => {
  // A parabolic mirror is traced as many short segments; the fan must span
  // all of them (the default OAP is 80 mm long).
  const object = createElement('objarrow', 0, 0);
  object.params.nrays = 21;
  const oap = createElement('oap', 300, 0);
  const ys = firstHits(traceScene([object, oap], []), object).map(p => p.y);
  assert.ok(Math.min(...ys) < -39 && Math.max(...ys) > 39, `OAP filled from ${Math.min(...ys)} to ${Math.max(...ys)}`);
});

test('a conic mirror is aimed at, and a central opening does not split the fan', () => {
  for (const hole of [0, 20]) {
    const object = createElement('objarrow', 0, 0);
    Object.assign(object.params, { anchor: 'centre', nrays: 21 });
    const mirror = createElement('conicmirror', 300, 0);
    mirror.params.hole = hole;
    // A lens behind the mirror must not be picked instead of it.
    const lens = createElement('lens', 500, 0);
    const hits = firstHits(traceScene([object, mirror, lens], []), object);
    const onMirror = hits.filter(p => Math.abs(p.x - 300) < 5);
    const ys = onMirror.map(p => p.y);
    assert.ok(Math.min(...ys) < -24 && Math.max(...ys) > 24, `hole ${hole}: mirror filled from ${Math.min(...ys)} to ${Math.max(...ys)}`);
    if (hole === 0) assert.equal(onMirror.length, 21, 'every ray lands on the mirror');
    else {
      // The rays aimed at the opening go through it.
      assert.ok(onMirror.length < 21 && onMirror.length >= 13, `hole ${hole}: ${onMirror.length} rays on the mirror`);
      assert.ok(onMirror.every(p => Math.abs(p.y) >= hole / 2 - 1e-6), 'none lands inside the opening');
    }
  }
});

test('with the lens tilted against the Object, the drawn image tip is where the tip’s rays meet', () => {
  for (const rot of [20, -15]) {
    const object = createElement('objarrow', 0, 0);
    const lens = createElement('lens', 300, 0);
    lens.params.f = 100;
    lens.rot = rot;
    const result = traceScene([object, lens], []);
    const tip = imageTip(result);
    const paths = result.paths.filter(r => r.sourceId === object.id);
    assert.equal(paths.length, object.params.nrays);
    for (const r of paths) near(distanceToLine(tip, r.pts.at(-2), r.pts.at(-1)), 0, 1e-6, `lens at ${rot}°: ray through the drawn tip`);
  }
});

test('the fan angle is set by the optic while aimed, and the ray limit is 21', () => {
  const object = createElement('objarrow', 0, 0);
  const spread = registry.objarrow.params.find(p => p.key === 'spread');
  assert.equal(getDirectManipulation(object).tune, null, 'no fan-angle knob while aimed');
  assert.equal(spread.show(object.params), false);
  object.params.aim = 'ahead';
  assert.ok(getDirectManipulation(object).tune, 'the fan-angle knob while pointing straight ahead');
  assert.equal(spread.show(object.params), true);
  const saved = { app: 'optics2d', version: 1, beams: [], elements: [{ id: 'o', type: 'objarrow', x: 0, y: 0, rot: 0, params: { nrays: 50 } }] };
  assert.equal(parseSketch(JSON.stringify(saved), registry).elements[0].params.nrays, 21);
});

test('the base fan’s colour contrasts with the object’s own', () => {
  assert.equal(objectBaseFanColor({ wavelength: 620 }), '#2563eb');
  assert.equal(objectBaseFanColor({ wavelength: 532 }), '#db2777');
  assert.equal(objectBaseFanColor({ wavelength: 450 }), '#ea580c');
  assert.equal(objectBaseFanColor({ autoColor: false, color: '#00ff00' }), '#db2777');
  assert.equal(objectBaseFanColor({ autoColor: false, color: '#0000ff' }), '#ea580c');
  assert.equal(objectBaseFanColor({ autoColor: false, color: '#333333' }), '#2563eb');
  assert.equal(objectBaseFanColor({ autoColor: false, color: 'not a colour' }), '#2563eb');
});
