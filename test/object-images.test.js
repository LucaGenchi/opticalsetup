// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The Object's images: the image readout, and images through real optics
// (by their cardinal points, or their paraxial matrix when they have no
// power).
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

test('an Object saved before the light options keeps its centred fan from the axis', () => {
  const saved = { app: 'optics2d', version: 1, beams: [], elements: [{ id: 'o', type: 'objarrow', x: 0, y: 0, rot: 0, params: { height: 20 } }] };
  const [object] = parseSketch(JSON.stringify(saved), registry).elements;
  assert.equal(object.params.anchor, 'centre');
  assert.equal(object.params.raysFrom, 'axis');
  assert.equal(object.params.aim, 'ahead');
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

test('a plate in a lens group, which has no focal length, moves the image the next lens makes', () => {
  const object = createElement('objarrow', 0, 0);
  const plate = createElement('lensgroup', 150, 0);
  Object.assign(plate.params, { preset: 'custom', rows: [{ r: 0, thickness: 4, glass: 'nbk7' }, { r: 0, thickness: 4, glass: 'air' }] });
  traceScene([object, plate, lensAt(300, 100)], []);
  const reading = objectImageReading(object.id);
  // A plate t thick brings the object t(1 − 1/n) nearer, here 1.36 mm.
  const n = glassIndex('nbk7', object.params.wavelength);
  const s = 300 - 4 * (1 - 1 / n);
  assert.equal(reading.stages.length, 1, 'the plate has no image line of its own');
  near(reading.stages[0].distance, s * 100 / (s - 100), 1e-9, 'image after the lens');
  near(reading.stages[0].m, -100 / (s - 100), 1e-9, 'magnification');
  // A narrow fan from the tip, traced through the real glass, comes together
  // at the drawn image tip. (Aimed, it would fill the plate, and its edge
  // rays would pass beside the lens behind it.)
  Object.assign(object.params, { height: 10, aim: 'ahead', spread: 2, nrays: 5 });
  const narrow = traceScene([object, plate, lensAt(300, 100)], []);
  const tip = imageTip(narrow);
  near(tip.x, 300 + reading.stages[0].distance, 1e-9, 'drawn where the readout says');
  assert.equal(objectPaths(narrow, object).length, 5);
  for (const r of objectPaths(narrow, object)) near(distanceToLine(tip, r.pts.at(-2), r.pts.at(-1)), 0, 0.02, 'traced ray through the drawn tip');
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
