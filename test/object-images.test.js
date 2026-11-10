// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The Object's images: objects at infinity, the image readout, images
// through real optics (by their cardinal points), principal construction
// rays, and the extra shapes.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, objectImageReadout, registry, thickLensCardinals } from '../sketch/js/elements.js';
import { paraxialCardinals } from '../sketch/js/object-imaging.js';
import { applyObjectivePreset } from '../sketch/js/objective.js';
import { objectImageReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';
import { initInspector, refreshMeasurements } from '../sketch/js/inspector.js';
import { glassIndex } from '../sketch/js/glass.js';
import { surfaceRowsOf, surfaceTableCardinals } from '../sketch/js/lensgroup.js';
import { asphericLensCardinals } from '../sketch/js/asphere.js';

const near = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b} (tolerance ${tol})`);
const imageDrawables = result => result.drawables.filter(d => d.opacity === 0.85);
// The arrowhead's first vertex is the drawn image's tip.
const imageTip = result => imageDrawables(result).find(d => d.type === 'poly')?.pts[0];
const objectPaths = (result, object) => result.paths.filter(r => r.sourceId === object.id);
const distanceToLine = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / Math.hypot(dx, dy);
};
const lensAt = (x, f) => {
  const lens = createElement('lens', x, 0);
  lens.params.f = f;
  return lens;
};

test('an Object saved before these options is nearby, and its new options stay out of the way', () => {
  const saved = { app: 'optics2d', version: 1, beams: [], elements: [{ id: 'o', type: 'objarrow', x: 0, y: 0, rot: 0, params: { height: 20 } }] };
  const [object] = parseSketch(JSON.stringify(saved), registry).elements;
  assert.equal(object.params.distance, 'finite');
  assert.equal(object.params.raysFrom, 'axis');
});

test('an object at infinity of 0.5° images 2.6 mm tall in the focal plane of a 300 mm lens', () => {
  const object = createElement('objarrow', 0, 0);
  Object.assign(object.params, { distance: 'infinity', angularSize: 0.5, nrays: 7 });
  const result = traceScene([object, lensAt(100, 300)], []);
  const reading = objectImageReading(object.id);
  assert.equal(reading.stages.length, 1);
  near(reading.stages[0].distance, 300, 1e-9, 'image in the focal plane');
  near(Math.abs(reading.stages[0].height), 300 * Math.tan(0.5 * Math.PI / 180), 1e-9, 'f·tan θ');
  assert.match(objectImageReadout(reading), /^Image 300 mm after .* · 2\.62 mm tall · real, inverted$/);
  // The tip's bundle comes together at the drawn image tip.
  const tip = imageTip(result);
  near(tip.x, 400, 1e-9, 'drawn in the focal plane');
  near(tip.y, 2.618, 1e-3, 'drawn 2.6 mm below the axis');
  const paths = objectPaths(result, object);
  assert.equal(paths.length, 7);
  for (const r of paths) near(distanceToLine(tip, r.pts.at(-2), r.pts.at(-1)), 0, 1e-9, 'ray through the drawn tip');
  // Aimed, the parallel bundle fills the lens (25.4 mm across) edge to edge.
  const atLens = paths.map(r => r.pts[1].y);
  assert.ok(Math.min(...atLens) < -12.5 && Math.max(...atLens) > 12.5, `bundle ${Math.min(...atLens)} to ${Math.max(...atLens)}`);
  assert.ok(paths.every(r => Math.abs(r.pts[1].x - 100) < 1e-6), 'every ray lands on the lens');
});

test('the 5× objective with a 200 mm tube lens, object in its front focal plane, reads m = −5.0', () => {
  const objective = createElement('objective', 200, 0);
  objective.rot = 180; // front tip facing the object
  Object.assign(objective.params, applyObjectivePreset(objective.params, 'dry-5x-014'));
  const object = createElement('objarrow', 200 - 16 - objective.params.workingDistance, 0);
  object.params.height = 2;
  traceScene([object, objective, lensAt(400, 200)], []);
  const reading = objectImageReading(object.id);
  assert.equal(reading.stages.length, 2);
  assert.equal(reading.stages[0].atInfinity, true, 'collimated between objective and tube lens');
  near(reading.stages[1].m, -5, 1e-9, 'magnification');
  near(reading.stages[1].distance, 200, 1e-9, 'image in the tube lens focal plane');
  assert.match(objectImageReadout(reading), /Image 1 at infinity after Objective \(collimated\); Image 2 200 mm after .* · m = −5\.00 · real, inverted/);
});

test('the paraxial cardinal points agree with what the inspector reports for each real optic', () => {
  for (const type of ['thicklens', 'asphericlens', 'lensgroup']) {
    const el = createElement(type, 0, 0);
    const faces = registry[type].paraxialFaces(el, 587.6).map(f => ({ s: f.x, R: f.R, n: f.n }));
    const card = paraxialCardinals(faces);
    const reported = type === 'lensgroup'
      ? surfaceTableCardinals(surfaceRowsOf(el.params), 587.6, { diameter: el.params.dia })
      : type === 'thicklens' ? thickLensCardinals(el.params) : asphericLensCardinals(el.params);
    near(card.f, reported.f, 1e-9, `${type} focal length`);
    near(card.h2 + card.f - card.last, reported.bfd, 1e-9, `${type} back focal distance`);
  }
});

test('a real optic images through its principal planes, either way round', () => {
  for (const type of ['thicklens', 'asphericlens', 'lensgroup']) {
    for (const rot of [0, 180]) {
      const object = createElement('objarrow', 0, 0);
      // A narrow fan straight ahead from a small object, so the real glass's
      // aberrations stay small (an asphere turned round has the most).
      Object.assign(object.params, { height: 1, aim: 'ahead', spread: 0.5, nrays: 5 });
      const optic = createElement(type, 300, 0);
      optic.rot = rot;
      const result = traceScene([object, optic], []);
      const reading = objectImageReading(object.id);
      assert.equal(reading.stages.length, 1, `${type} at ${rot}°: one image`);
      assert.equal(reading.stages[0].real, true);
      // The thin-lens equation from the principal planes, independently.
      const local = registry[type].paraxialFaces(optic, object.params.wavelength);
      const card = paraxialCardinals(rot === 0
        ? local.map(f => ({ s: 300 + f.x, R: f.R, n: f.n }))
        : reversedFaces(local, 300));
      const so = card.h1, si = 1 / (1 / card.f - 1 / so);
      near(reading.stages[0].distance, card.h2 + si - card.last, 1e-9, `${type} at ${rot}°: image distance`);
      near(reading.stages[0].m, -si / so, 1e-9, `${type} at ${rot}°: magnification`);
      // The traced rays come together there, up to the glass's aberrations.
      const tip = imageTip(result);
      for (const r of objectPaths(result, object)) {
        near(distanceToLine(tip, r.pts.at(-2), r.pts.at(-1)), 0, 0.02, `${type} at ${rot}°: traced ray near the drawn tip`);
      }
    }
  }
});

// An optic's faces met right to left (turned 180°, centred at x0).
function reversedFaces(local, x0) {
  const out = [];
  for (let i = local.length - 1; i >= 0; i--) out.push({ s: x0 - local[i].x, R: local[i].R ? -local[i].R : 0, n: i > 0 ? local[i - 1].n : 1 });
  return out;
}

// The drawn principal rays (construction lines) and their dashed returns.
const principalLines = result => result.drawables.filter(d => d.type === 'path' && d.w === 1.4 && d.opacity === 0.9);
const dashedReturns = result => result.drawables.filter(d => d.type === 'path' && d.dash && d.w === 1.2);

test('principal rays meet at the drawn image tip, and run back dashed to a virtual image', () => {
  // The 22 mm arrow is taller than the lens is wide: the construction still
  // works, through the lens's whole plane.
  const real = createElement('objarrow', 0, 0);
  real.params.raysFrom = 'principal';
  const realResult = traceScene([real, lensAt(300, 100)], []);
  assert.equal(objectPaths(realResult, real).length, 0, 'construction lines, not traced light');
  const tip = imageTip(realResult);
  const lines = principalLines(realResult);
  assert.equal(lines.length, 3);
  for (const d of lines) {
    near(d.pts[0].y, -22, 1e-9, 'from the tip');
    near(d.pts[1].x, 300, 1e-9, 'bends at the lens plane');
    near(distanceToLine(tip, d.pts.at(-2), d.pts.at(-1)), 0, 1e-9, 'through the image tip');
    assert.ok(d.pts.at(-1).x > tip.x, 'drawn past the image');
  }
  const slopes = lines.map(d => [(d.pts[1].y - d.pts[0].y) / (d.pts[1].x - d.pts[0].x), (d.pts[2].y - d.pts[1].y) / (d.pts[2].x - d.pts[1].x)]);
  assert.ok(slopes.some(([a]) => Math.abs(a) < 1e-12), 'one parallel to the axis');
  assert.ok(slopes.some(([a, b]) => Math.abs(a - b) < 1e-12 && Math.abs(a) > 0), 'one through the centre, undeviated');
  assert.ok(slopes.some(([a, b]) => Math.abs(b) < 1e-12 && Math.abs(a) > 0), 'one through the front focal point, parallel after');
  assert.equal(dashedReturns(realResult).length, 0, 'no back-extensions for a real image');

  const virtual = createElement('objarrow', 0, 0);
  virtual.params.raysFrom = 'principal';
  const virtualResult = traceScene([virtual, lensAt(60, 100)], []);
  const reading = objectImageReading(virtual.id);
  assert.equal(reading.stages[0].real, false);
  near(reading.stages[0].m, 2.5, 1e-9, 'magnifier');
  const vTip = imageTip(virtualResult);
  const dashed = dashedReturns(virtualResult);
  assert.equal(dashed.length, 3);
  for (const d of dashed) near(Math.hypot(d.pts[1].x - vTip.x, d.pts[1].y - vTip.y), 0, 1e-9, 'dashed back to the virtual tip');
  for (const d of principalLines(virtualResult)) near(distanceToLine(vTip, d.pts.at(-2), d.pts.at(-1)), 0, 1e-9, 'outgoing line through the virtual tip');
});

test('principal rays from an object at infinity cross at its image in the focal plane', () => {
  const object = createElement('objarrow', 0, 0);
  Object.assign(object.params, { distance: 'infinity', angularSize: 2, raysFrom: 'principal' });
  const result = traceScene([object, lensAt(100, 200)], []);
  const tip = imageTip(result);
  near(tip.x, 300, 1e-9, 'focal plane');
  const lines = principalLines(result);
  assert.equal(lines.length, 2);
  for (const d of lines) near(distanceToLine(tip, d.pts.at(-2), d.pts.at(-1)), 0, 1e-9, 'through the image tip');
});

test('a real optic beside the axis is not part of the image chain', () => {
  const object = createElement('objarrow', 0, 0);
  traceScene([object, lensAt(300, 100), createElement('thicklens', 300, 120)], []);
  const reading = objectImageReading(object.id);
  assert.equal(reading.stages.length, 1);
  near(reading.stages[0].distance, 150, 1e-9, 'the thin lens alone');
});

test('the readout lists the intermediate image and the final one', () => {
  const object = createElement('objarrow', 0, 0);
  traceScene([object, lensAt(150, 50), lensAt(400, 100)], []);
  const text = objectImageReadout(objectImageReading(object.id));
  assert.equal(text, 'Image 1 75 mm after Thin convex lens · m = −0.50 · real, inverted; Image 2 233.3 mm after Thin convex lens · m = 0.67 · real, upright');
  assert.equal(objectImageReadout(null), 'No image: no lens on the Object’s axis');
});

test('every shape is drawn, and imaged', () => {
  for (const shape of ['point', 'candle', 'cell', 'moon']) {
    const object = createElement('objarrow', 0, 0);
    object.params.shape = shape;
    assert.match(registry.objarrow.svg(object), /<polygon /, `${shape} icon`);
    const result = traceScene([object, lensAt(300, 100)], []);
    assert.ok(imageDrawables(result).length >= 1, `${shape} image`);
    for (const d of imageDrawables(result)) assert.ok(d.pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
  // The point sits at the tip, so its image is the tip's image.
  const object = createElement('objarrow', 0, 0);
  object.params.shape = 'point';
  const result = traceScene([object, lensAt(300, 100)], []);
  const pts = imageDrawables(result)[0].pts;
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length, cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  near(cx, 450, 1e-6, 'point image distance');
  near(cy, 11, 1e-6, 'point image height');
});

test('a plate in a lens group, which has no focal length, moves the image the next lens makes', () => {
  const object = createElement('objarrow', 0, 0);
  object.params.raysFrom = 'principal';
  const plate = createElement('lensgroup', 150, 0);
  Object.assign(plate.params, { preset: 'custom', rows: [{ r: 0, thickness: 4, glass: 'nbk7' }, { r: 0, thickness: 4, glass: 'air' }] });
  const result = traceScene([object, plate, lensAt(300, 100)], []);
  const reading = objectImageReading(object.id);
  // A plate t thick brings the object t(1 − 1/n) nearer, here 1.36 mm.
  const n = glassIndex('nbk7', object.params.wavelength);
  const s = 300 - 4 * (1 - 1 / n);
  assert.equal(reading.stages.length, 1, 'the plate has no image line of its own');
  near(reading.stages[0].distance, s * 100 / (s - 100), 1e-9, 'image after the lens');
  near(reading.stages[0].m, -100 / (s - 100), 1e-9, 'magnification');
  // The principal rays are still drawn, through the plate and the lens.
  assert.equal(result.drawables.filter(d => d.type === 'path' && d.w === 1.4).length, 3);
  // A plate alone images the object where it appears to be, upright.
  const alone = createElement('objarrow', 0, 0);
  traceScene([alone, plate], []);
  const [own] = objectImageReading(alone.id).stages;
  assert.equal(own.real, false);
  near(own.m, 1, 1e-12, 'unmagnified');
  // The group is centred on its position: the plate's last face is at 152.
  near(own.distance, 4 * (1 - 1 / n) - 152, 1e-9, 'shifted towards the plate');
});

test('a tilted thin lens or mirror is aimed at whole, however far it is turned', () => {
  for (const type of ['lens', 'mirror']) {
    for (const rot of [30, 46, 60]) {
      const object = createElement('objarrow', 0, 0);
      object.params.nrays = 5;
      const optic = type === 'lens' ? lensAt(300, 100) : createElement('mirror', 300, 0);
      optic.rot = rot;
      const paths = objectPaths(traceScene([object, optic], []), object);
      assert.equal(paths.length, 5);
      // The second point of every ray is on the optic.
      const c = Math.cos(rot * Math.PI / 180), s = Math.sin(rot * Math.PI / 180);
      for (const r of paths) near((r.pts[1].x - 300) * c + r.pts[1].y * s, 0, 1e-6, `${type} at ${rot}°`);
    }
  }
});

test('the Image readout follows a change to the Object’s position', () => {
  const object = createElement('objarrow', 0, 0);
  const lens = lensAt(300, 100);
  const output = { dataset: { p: 'imageReadout' }, textContent: '' };
  initInspector({ querySelectorAll: selector => (selector === 'output.readout[data-p]' ? [output] : []), querySelector: () => null });
  Object.assign(state, { elements: [object, lens], beams: [], selection: { kind: 'element', id: object.id } });
  traceScene(state.elements, []);
  refreshMeasurements();
  assert.match(output.textContent, /^Image 150 mm after .* m = −0\.50/);
  // Moved in the inspector's X field (a position, not a param), retraced.
  object.x = 100;
  traceScene(state.elements, []);
  refreshMeasurements();
  assert.match(output.textContent, /^Image 200 mm after .* m = −1\.00/);
});
