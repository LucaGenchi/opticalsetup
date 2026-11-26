// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { readFile } from 'node:fs/promises';

import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';
import { buildSVG } from '../sketch/js/export.js';
import { gaussianFocus } from '../sketch/js/sectioning.js';
import { focusEnvelope, zoomFoci } from '../sketch/js/zoom-focus.js';
import { zoomSceneSVG } from '../sketch/js/zoom-view.js';
import { zoomGeometry, zoomNotes } from '../sketch/js/zoom.js';
import { gaussianBeam, thinLensFocus } from '../calculators/assets/gaussian-beam.js';

// A 532 nm beam 3 mm wide, focused by an f = 100 mm lens at x = 200.
function focusedScene(zoomAt = { x: 200, y: 0 }, zoomParams = {}) {
  const laser = createElement('cwlaser', 0, 0);
  const lens = createElement('lens', 100, 0);
  const zoom = createElement('zoom', zoomAt.x, zoomAt.y);
  Object.assign(zoom.params, { diffraction: true, w: 4, mag: 20, insetX: 0, insetY: -150 }, zoomParams);
  const elements = [laser, lens, zoom];
  return { laser, lens, zoom, elements, traced: traceScene(elements, []) };
}

const view = ({ zoom, elements, traced }) =>
  zoomSceneSVG(zoom, { drawables: traced.drawables, paths: traced.paths, elements });

test('a beam focused in the region gets its propagated waist', () => {
  const scene = focusedScene();
  const foci = zoomFoci(scene.zoom, scene.traced.paths);
  assert.equal(foci.length, 1);
  const [focus] = foci;
  // The laser's beam parameter (step G1): w = 1.5 mm at its output, 48 mm
  // before the lens. The waist is Self's closed form for an ideal thin lens,
  // 2.9 µm before the geometric focus (the Gaussian focal shift).
  const ideal = thinLensFocus(gaussianBeam({ waistUm: 1500, wavelengthNm: 532 }), 48, 100);
  assert.equal(focus.model, 'propagated');
  assert.ok(Math.abs(focus.point.x - (100 + ideal.distanceMm)) < 1e-6 && Math.abs(focus.point.y) < 1e-6, `at the waist: ${focus.point.x}`);
  assert.ok(focus.point.x < 200 && focus.point.x > 199.99);
  assert.ok(Math.abs(focus.axis.x - 1) < 1e-9);
  assert.ok(Math.abs(focus.w0Mm * 1000 / ideal.beam.waistUm - 1) < 1e-6, `w0 ${focus.w0Mm}`);
  assert.ok(Math.abs(focus.zRMm / ideal.beam.rayleighMm - 1) < 1e-5, `zR ${focus.zRMm}`);
  // The textbook λf/(πw) for a 1.5 mm half-width.
  assert.ok(Math.abs(focus.w0Mm - 532e-6 * 100 / (Math.PI * 1.5)) < 1e-7, `w0 ${focus.w0Mm}`);
  assert.equal(focus.wl, 532);
});

test('a bundle with no beam parameter gets the Gaussian waist of its cone, labelled', () => {
  // An LED carries no beam parameter (step G1).
  const laser = createElement('ledsource', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 3;
  const lens = createElement('lens', 100, 0);
  const zoom = createElement('zoom', 200, 0);
  Object.assign(zoom.params, { diffraction: true, w: 4, mag: 20, insetX: 0, insetY: -150 });
  const elements = [laser, lens, zoom];
  const traced = traceScene(elements, []);
  const foci = zoomFoci(zoom, traced.paths);
  assert.ok(foci.length >= 1);
  for (const focus of foci) {
    assert.equal(focus.model, 'cone');
    assert.ok(Math.abs(focus.point.x - 200) < 1e-6, 'at the focal plane');
    // The cone's half-angle is the beam's half-width over f.
    assert.ok(Math.abs(focus.na - Math.sin(Math.atan(1.5 / 100))) < 1e-6, `NA ${focus.na}`);
    const ideal = gaussianFocus(focus.wl, focus.na);
    assert.equal(focus.w0Mm, ideal.w0Mm);
    assert.equal(focus.zRMm, ideal.zRMm);
  }
  assert.match(zoomSceneSVG(zoom, { drawables: traced.drawables, paths: traced.paths, elements }), />cone estimate</);
});

test('the waist is always drawn, and its note can be turned off', () => {
  assert.equal('diffraction' in createElement('zoom').params, false, 'no switch for the waist');
  assert.equal(createElement('zoom').params.focusNote, true);
  const scene = focusedScene();
  const svg = view(scene);
  assert.match(svg, /data-zoom-focus="true"/);
  assert.match(svg, /data-zoom-focus-label[^]*>w₀ 11\.3 µm<[^]*>zR 753 µm</);
  // A round view of modest size (60 mm across) still names the waist.
  const modest = focusedScene({ x: 200, y: 0 }, { shape: 'circle', w: 4, mag: 15 });
  assert.match(view(modest), />w₀ 11\.3 µm</);
  scene.zoom.params.focusNote = false;
  const unnamed = view(scene);
  assert.match(unnamed, /data-zoom-focus="true"/, 'note off: the waist is still drawn');
  assert.doesNotMatch(unnamed, /data-zoom-focus-label|w₀/, 'without its note');
  // A zoom saved with the earlier switch off draws the waist now.
  scene.zoom.params.diffraction = false;
  assert.match(view(scene), /data-zoom-focus="true"/, 'a saved switch is no longer read');
  // A zoom saved before the settings existed draws both.
  delete scene.zoom.params.diffraction;
  delete scene.zoom.params.focusNote;
  assert.match(view(scene), /data-zoom-focus="true"[^]*w₀ 11\.3 µm/);
});

test('a focus outside the region, a collimated beam and a point emitter get no waist', () => {
  assert.equal(zoomFoci(focusedScene({ x: 150, y: 0 }).zoom, focusedScene().traced.paths).length, 0, 'region before the focus');
  const laser = createElement('cwlaser', 0, 0);
  const zoom = createElement('zoom', 150, 0);
  assert.equal(zoomFoci(zoom, traceScene([laser, zoom], []).paths).length, 0, 'collimated');
  const point = createElement('pointsource', 100, 0);
  const atEmitter = createElement('zoom', 100, 0);
  assert.equal(zoomFoci(atEmitter, traceScene([point, atEmitter], []).paths).length, 0, 'rays leaving an emitter are not a focus');
});

test('a virtual focus behind the optic is not drawn', () => {
  // A diverging lens: its rays point back to a focus before it, where they never went.
  const laser = createElement('cwlaser', 0, 0);
  const lens = createElement('lens', 100, 0);
  lens.params.f = -50;
  // A region wide enough to take in the diverging rays too (radius 80 about
  // x = 50 reaches past the lens), so only the check on where the rays went
  // can leave the focus out.
  const zoom = createElement('zoom', 50, 0);
  Object.assign(zoom.params, { w: 160 });
  const paths = traceScene([laser, lens, zoom], []).paths;
  assert.ok(paths.some(path => path.pts.some(p => p.x > 100)), 'rays leave the lens');
  assert.equal(zoomFoci(zoom, paths).length, 0);
});

test('the envelope is the 1/e² radius: 2w0 across the waist, meeting the cone far off', () => {
  const focus = { point: { x: 10, y: 5 }, axis: { x: 0, y: 1 }, w0Mm: 0.01, zRMm: 0.5 };
  const outline = focusEnvelope(focus, -20, 20, 48);
  assert.equal(outline.length, 98);
  const half = outline.length / 2;
  // Sample 24 is the waist on each edge.
  assert.ok(Math.abs(Math.abs(outline[24].x - outline[half + 24].x) - 0.02) < 1e-12, 'width 2w0 at the waist');
  assert.ok(Math.abs(outline[24].y - 5) < 1e-12);
  // The far end: w(z) → z·w0/zR, the cone's half-width.
  const far = outline[0];
  const z = Math.abs(far.y - 5);
  assert.ok(z >= 20 - 1e-9);
  assert.ok(Math.abs(Math.abs(far.x - 10) - 0.01 * Math.sqrt(1 + (z / 0.5) ** 2)) < 1e-12);
  assert.deepEqual(focusEnvelope({ ...focus, zRMm: NaN }, -20, 20), [], 'non-finite input draws nothing');
});

test('the waist is drawn in the view, at the view\'s line weight', () => {
  const scene = focusedScene();
  const svg = view(scene);
  const polygon = svg.match(/<polygon [^>]*data-zoom-focus[^>]*>/)[0];
  assert.match(polygon, /stroke-width="0\.8"/);
});

test('a micron waist behind a short lens is a smooth curve, not rounded into steps', () => {
  // The reported case: f = 10 mm gives w0 1.14 µm, viewed at ×500.
  const laser = createElement('cwlaser', 0, 0);
  const lens = createElement('lens', 150, 0);
  lens.params.f = 10;
  const zoom = createElement('zoom', 160, 0);
  Object.assign(zoom.params, { diffraction: true, w: 0.2, mag: 500, insetX: 60, insetY: -80 });
  const elements = [laser, lens, zoom];
  const traced = traceScene(elements, []);
  const [focus] = zoomFoci(zoom, traced.paths);
  // The propagated waist (step G1), λf/(πw) = 1.13 µm; the cone estimate
  // λ/(π sin θ) gave 1.14 µm at this NA of 0.15.
  assert.ok(Math.abs(focus.w0Mm - thinLensFocus(gaussianBeam({ waistUm: 1500, wavelengthNm: 532 }), 98, 10).beam.waistUm / 1000) < 1e-9);
  const svg = zoomSceneSVG(zoom, { drawables: traced.drawables, paths: traced.paths, elements });
  const pts = svg.match(/<polygon points="([^"]+)"[^>]*data-zoom-focus/)[1].split(' ').map(p => p.split(',').map(Number));
  const g = zoomGeometry(zoom.params);
  // Half the samples on each edge; sample 24 is the waist.
  const across = Math.abs(pts[24][1] - pts[49 + 24][1]);
  assert.ok(Math.abs(across - 2 * focus.w0Mm * g.mag) < 0.02, `2w0 in the view: ${across} vs ${2 * focus.w0Mm * g.mag}`);
  // Every sample on the edge is where w(z) puts it, to the drawing's 0.01.
  const zR = focus.zRMm, w0 = focus.w0Mm;
  for (const [x, y] of pts.slice(0, 49)) {
    const z = (x - g.ix) / g.mag;
    const w = w0 * Math.sqrt(1 + (z / zR) ** 2);
    assert.ok(Math.abs(Math.abs(y - g.iy) - w * g.mag) < 0.02, `edge at z ${z}`);
  }
});

test('the waist note sits on the frame, inside the top of the view, never clipped', () => {
  for (const shape of ['circle', 'ellipse', 'rect']) {
    for (const rot of [0, 30, 200]) {
      const scene = focusedScene({ x: 200, y: 0 }, { shape, w: 4, h: 3 });
      scene.zoom.rot = rot;
      const svg = view(scene);
      const label = svg.indexOf('data-zoom-focus-label');
      assert.ok(label > svg.indexOf('data-zoom-frame="view"'), `${shape} ${rot}°: drawn after the view's border, outside its clip`);
      // Like the scale bar, upright in the frame the view is drawn in.
      assert.doesNotMatch(svg.slice(label), /<text [^>]*transform=/);
    }
  }
  const params = { ...focusedScene().zoom.params, shape: 'rect', w: 4, h: 3, mag: 20 };
  const g = zoomGeometry(params);
  const lines = [{ text: 'w₀ 11.3 µm · zR 753 µm' }, { text: 'w₀ 2.00 µm · zR 23.6 µm' }];
  const placed = zoomNotes(params, 0, lines);
  assert.equal(placed.length, 2, 'one line per focus');
  assert.ok(placed[1].y > placed[0].y);
  for (const note of placed) {
    const half = 0.58 * note.font * [...note.text].length / 2;
    assert.ok(note.x - half >= g.ix - g.irx && note.x + half <= g.ix + g.irx, 'no wider than the view');
    assert.ok(note.y < g.iy, 'in the top half, clear of the scale bar');
  }
  const round = zoomNotes({ ...params, shape: 'circle', w: 3 }, 0, lines);
  const rg = zoomGeometry({ ...params, shape: 'circle', w: 3 });
  for (const note of round) {
    const half = 0.58 * note.font * [...note.text].length / 2;
    const top = note.y - 0.65 * note.font;
    assert.ok(((half) / rg.irx) ** 2 + ((top - rg.iy) / rg.iry) ** 2 <= 1 + 1e-9, 'inside the circle where it sits');
  }
  assert.deepEqual(zoomNotes({ ...params, w: 0.5, h: 0.5, mag: 4 }, 0, lines), [], 'too small a view for a readable note');
});

test('an exported figure carries the waist', () => {
  const scene = focusedScene();
  const saved = { elements: state.elements, beams: state.beams };
  try {
    state.elements = scene.elements;
    state.beams = [];
    const svg = buildSVG({ whiteBg: true });
    assert.match(svg, /data-zoom-focus="true"/);
    assert.match(svg, /w₀ 11\.3 µm/);
  } finally {
    state.elements = saved.elements;
    state.beams = saved.beams;
  }
});

test('a zoom drawing the waist is still diagram-only', () => {
  const plain = focusedScene();
  const bare = traceScene([plain.laser, plain.lens], []).drawables;
  assert.deepEqual(plain.traced.drawables, bare);
});

// ---- Review of 6ef98b2 (#307) ----

// The envelope's outline back on the bench, from the drawn view points.
function envelopeOnBench(zoom, svg) {
  const g = zoomGeometry(zoom.params, zoom.rot);
  const pts = svg.match(/<polygon points="([^"]+)"[^>]*data-zoom-focus/)[1].split(' ').map(p => p.split(',').map(Number));
  return pts.map(([x, y]) => {
    const dx = (x - g.ix) / g.mag, dy = (y - g.iy) / g.mag;
    return { x: zoom.x + dx * g.cos - dy * g.sin, y: zoom.y + dx * g.sin + dy * g.cos };
  });
}

test('the waist stops at the optic after the focus', () => {
  // The reported case: a mirror at 45° 2 mm past an f = 10 mm focus.
  const laser = createElement('cwlaser', 0, 0);
  const lens = createElement('lens', 100, 0);
  lens.params.f = 10;
  const mirror = createElement('mirror', 112, 0);
  mirror.rot = 45;
  const zoom = createElement('zoom', 110, 0);
  Object.assign(zoom.params, { shape: 'rect', w: 10, h: 4, mag: 20, insetX: 0, insetY: -120 });
  const elements = [laser, lens, mirror, zoom];
  const traced = traceScene(elements, []);
  const [focus] = zoomFoci(zoom, traced.paths);
  // The propagated waist, a few nanometres before the geometric focus.
  assert.ok(Math.abs(focus.point.x - 110) < 1e-3);
  assert.ok(Math.abs(focus.from + 10) < 0.05, `the beam starts 10 mm before the focus, at the lens: ${focus.from}`);
  const bench = envelopeOnBench(zoom, zoomSceneSVG(zoom, { drawables: traced.drawables, paths: traced.paths, elements }));
  // The mirror's face is the line x + y = 112: nothing of the waist lies
  // behind it, to the drawing's rounding (0.01 in the view, /20 on the bench).
  const behind = Math.max(...bench.map(p => (p.x + p.y - 112) / Math.SQRT2));
  assert.ok(behind <= 1e-3, `the envelope stops at the mirror's face: ${behind} mm behind it`);
  assert.ok(behind >= -1e-3, 'and reaches it');
  // And at the lens, the face before: x ≥ 100.
  const fromLens = createElement('zoom', 105, 0);
  Object.assign(fromLens.params, { shape: 'rect', w: 14, h: 4, mag: 20, insetX: 0, insetY: -120 });
  const near = envelopeOnBench(fromLens, zoomSceneSVG(fromLens, { drawables: traced.drawables, paths: traced.paths, elements: [...elements, fromLens] }));
  assert.ok(Math.min(...near.map(p => p.x)) >= 100 - 1e-3, 'nothing of the waist before the lens');
});

test('the waist is cut along a face, however its outline crosses it', () => {
  const focus = { point: { x: 0, y: 0 }, axis: { x: 1, y: 0 }, w0Mm: 0.1, zRMm: 1 };
  // A face at 45° through (2, 0): keep x + y ≤ 2.
  const cut = focusEnvelope({ ...focus, ends: [{ at: { x: 2, y: 0 }, n: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 } }] }, -5, 5);
  assert.ok(cut.length >= 3);
  assert.ok(cut.every(p => p.x + p.y <= 2 + 1e-9), 'nothing past the face');
  assert.ok(cut.some(p => Math.abs(p.x + p.y - 2) < 1e-9), 'the outline runs along it');
  assert.deepEqual(focusEnvelope({ ...focus, ends: [{ at: { x: -10, y: 0 }, n: { x: -1, y: 0 } }] }, -5, 5), [], 'a face before the whole envelope leaves nothing');
});

test('an off-centre focus is drawn to the edge of the view on both sides', () => {
  // The reported case: a 4 × 0.2 mm region centred 1.9 mm before the focus.
  const scene = focusedScene({ x: 198.1, y: 0 }, { shape: 'rect', w: 4, h: 0.2, mag: 20 });
  const bench = envelopeOnBench(scene.zoom, view(scene));
  const xs = bench.map(p => p.x);
  assert.ok(Math.min(...xs) <= 196.1 + 1e-6, `reaches the region's left edge at 196.1: ${Math.min(...xs)}`);
  assert.ok(Math.max(...xs) >= 200.1 - 1e-6, `and its right edge at 200.1: ${Math.max(...xs)}`);
});

test('G2: at high NA the cone estimate opens with the rays, not inside them', () => {
  // A dry NA 0.8 objective filled by an 8 mm beam: the rays converge at
  // NA 0.625 (39°), where sine and tangent differ by a quarter.
  const laser = createElement('cwlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'beam', beamWidth: 8, wavelength: 532 });
  const objective = createElement('objective', 150, 0);
  Object.assign(objective.params, { efl: 5, workingDistance: 0.6, immersion: 'air', na: 0.8, frontAperture: 8 });
  const zoom = createElement('zoom', 166.6, 0);
  Object.assign(zoom.params, { w: 0.5, mag: 300 });
  const [focus] = zoomFoci(zoom, traceScene([laser, objective, zoom], []).paths);
  assert.equal(focus.model, 'cone');
  assert.ok(focus.na > 0.6 && focus.na < 0.65, `NA ${focus.na}`);
  const z = -0.2;
  const outline = focusEnvelope(focus, z, 0.2);
  const halfWidthAt = x => Math.max(...outline.filter(p => Math.abs(p.x - x) < 1e-9).map(p => Math.abs(p.y - focus.point.y)));
  const slope = Math.tan(Math.asin(focus.na));
  const w = halfWidthAt(focus.point.x + z);
  assert.ok(Math.abs(w - Math.hypot(focus.w0Mm, z * slope)) < 1e-9, `edge ${w} against the rays' ${Math.abs(z) * slope}`);
  assert.ok(w > Math.abs(z) * focus.na * 1.2, 'wider than the sine slope would draw it');
  // The note keeps the waist's own Rayleigh range.
  assert.ok(Math.abs(focus.zRMm - gaussianFocus(532, focus.na).zRMm) < 1e-15);
});

// A high-NA water objective (EFL 10 mm, WD 2 mm, NA 1) at x = 150 focuses a
// 16 mm wide 532 nm beam at x = 168, onto a sample's specimen plane there,
// square to the beam: the tracer ends the incoming rays at the focus and
// starts the next ones from it.
function specimenFocusScene(extra = []) {
  const laser = createElement('cwlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'beam', beamWidth: 16, wavelength: 532 });
  const objective = createElement('objective', 150, 0);
  Object.assign(objective.params, { efl: 10, workingDistance: 2, immersion: 'water', na: 1 });
  const zoom = createElement('zoom', 168, 0);
  Object.assign(zoom.params, { w: 0.5, mag: 300 });
  const elements = [laser, objective, ...extra, zoom];
  return { zoom, elements, traced: traceScene(elements, []) };
}

function squareSample(x) {
  const sample = createElement('sample', x, 0);
  sample.rot = 90;
  sample.params.thickness = 3;
  return sample;
}

test('a focus on a specimen plane the light crosses gets its waist on both sides', () => {
  const free = specimenFocusScene();
  const [open] = zoomFoci(free.zoom, free.traced.paths);
  const scene = specimenFocusScene([squareSample(168)]);
  // The rays do stop at the focus and set off again from it.
  assert.ok(scene.traced.paths.some(path => path.pts.some((p, i) => i > 0 && i < path.pts.length - 1 && Math.abs(p.x - 168) < 1e-9)));
  const foci = zoomFoci(scene.zoom, scene.traced.paths);
  assert.equal(foci.length, 1);
  const [focus] = foci;
  assert.ok(Math.abs(focus.point.x - 168) < 1e-6 && Math.abs(focus.point.y) < 1e-6, `at the focus: ${focus.point.x}`);
  // The same waist as without the sample: the cone of the same rays.
  assert.equal(focus.model, open.model);
  assert.ok(Math.abs(focus.w0Mm / open.w0Mm - 1) < 1e-12, `w0 ${focus.w0Mm} vs ${open.w0Mm}`);
  assert.ok(Math.abs(focus.w0Mm * 1e6 - 271.08) < 0.01, `w0 ${focus.w0Mm}`);
  // Drawn from the objective's front, through the specimen plane and on
  // past it, still cut at the objective's face.
  assert.ok(focus.from < -1 && focus.to > 1, `stretch ${focus.from} to ${focus.to}`);
  const outline = focusEnvelope(focus, -0.05, 0.05);
  assert.ok(outline.some(p => p.x < 167.99) && outline.some(p => p.x > 168.01), 'both sides of the specimen plane');
  assert.match(view(scene), /data-zoom-focus="true"[^]*w₀ 271 nm/);
});

test('light that stops at the focus, an emitter and a virtual focus on a specimen plane get no waist', () => {
  // The same focus on the face of an opaque box: nothing goes on from it.
  const box = createElement('box', 173, 0);
  Object.assign(box.params, { w: 10, h: 40 });
  const blocked = specimenFocusScene([box]);
  assert.equal(zoomFoci(blocked.zoom, blocked.traced.paths).length, 0, 'stopped at the focus');
  // A point source on the specimen plane: its rays start there.
  const point = createElement('pointsource', 168, 0);
  const atEmitter = createElement('zoom', 168, 0);
  Object.assign(atEmitter.params, { w: 0.5, mag: 300 });
  const emitted = traceScene([point, squareSample(168), atEmitter], []);
  assert.equal(zoomFoci(atEmitter, emitted.paths).length, 0, 'an emitter on the plane');
  // A diverging lens whose virtual focus lies on a specimen plane the
  // collimated beam crossed before it: the rays never went there.
  const laser = createElement('cwlaser', 0, 0);
  const lens = createElement('lens', 100, 0);
  lens.params.f = -25;
  const zoom = createElement('zoom', 75, 0);
  Object.assign(zoom.params, { w: 160 });
  const paths = traceScene([laser, squareSample(75), lens, zoom], []).paths;
  assert.ok(paths.some(path => path.pts.some((p, i) => i > 0 && Math.abs(p.x - 75) < 1e-9)), 'the beam crosses the plane');
  assert.ok(paths.some(path => path.pts.some(p => p.x > 100)), 'rays leave the lens');
  assert.equal(zoomFoci(zoom, paths).length, 0, 'a virtual focus on the plane');
});

test('a focus on a mirror or short of a second lens is not carried straight on (review)', () => {
  // A mirror at the objective's focus turns the rays 46°–74°: the waist must
  // not be drawn on straight ahead, where no light travels.
  const mirror = createElement('mirror', 168, 0);
  mirror.rot = -60;
  const laser = createElement('cwlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'beam', beamWidth: 5, wavelength: 532 });
  const objective = createElement('objective', 150, 0);
  Object.assign(objective.params, { efl: 10, workingDistance: 2, immersion: 'water', na: 1 });
  const zoom = createElement('zoom', 168, 0);
  Object.assign(zoom.params, { w: 0.5, mag: 300 });
  for (const focus of zoomFoci(zoom, traceScene([laser, objective, mirror, zoom], []).paths)) {
    const ahead = focusEnvelope(focus, Math.max(focus.from, -0.3), Math.min(focus.to, 0.3))
      .filter(p => (p.x - 168) * focus.axis.x + p.y * focus.axis.y > 0.01);
    assert.equal(ahead.length, 0, 'nothing drawn past the mirror along the incoming axis');
  }
  // A narrow beam through two lenses: the rays end on the second lens some
  // 25 mm before the waist the first lens predicts; only the waist past the
  // second lens, the one the probe reads, is drawn.
  const narrow = createElement('cwlaser', 0, 0);
  Object.assign(narrow.params, { beamMode: 'beam', beamWidth: 0.1, wavelength: 633 });
  const first = createElement('lens', 200, 0);
  first.params.f = 100;
  const second = createElement('lens', 470, 0);
  second.params.f = 500;
  const wide = createElement('zoom', 497, 0);
  Object.assign(wide.params, { w: 8, mag: 20 });
  const foci = zoomFoci(wide, traceScene([narrow, first, second, wide], []).paths);
  assert.equal(foci.length, 1, `one waist: ${foci.map(f => f.point.x.toFixed(3)).join(', ')}`);
  assert.ok(Math.abs(foci[0].point.x - 498.423) < 0.01, `at ${foci[0].point.x}`);
});

test('a waist crossing a specimen plane is cut at the next face, a tilted mirror', () => {
  const mirror = createElement('mirror', 170, 0);
  mirror.rot = 45;
  const scene = specimenFocusScene([squareSample(168), mirror]);
  const [focus] = zoomFoci(scene.zoom, scene.traced.paths);
  // The outermost rays, 8 mm off axis 10 mm on, meet the face x + y = 170.
  assert.ok(Math.abs(focus.to - 10) < 1e-6, `to ${focus.to}`);
  const outline = focusEnvelope(focus, focus.from, focus.to);
  assert.ok(outline.length >= 3);
  assert.ok(Math.max(...outline.map(p => p.x + p.y)) <= 170 + 1e-9, 'cut along the mirror face');
});

test('a focus on a tilted mirror is not carried on along the reflection', () => {
  // Every reflected ray still heads forward, but on another axis.
  const led = createElement('ledsource', 0, 0);
  Object.assign(led.params, { beamMode: 'beam', beamWidth: 3 });
  const lens = createElement('lens', 100, 0);
  const mirror = createElement('mirror', 200, 0);
  mirror.rot = 50;
  const zoom = createElement('zoom', 200, 0);
  Object.assign(zoom.params, { w: 4, mag: 20 });
  assert.equal(zoomFoci(zoom, traceScene([led, lens, mirror, zoom], []).paths).length, 0);
});

test('a propagated waist is not carried on past a face', () => {
  // A 0.6 mm beam focused by an f = 100 mm lens: its waist lies about a
  // millimetre past a specimen plane at x = 197, where its beam parameter
  // ends. The incoming envelope stays cut at the plane.
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamWidth = 0.6;
  const zoom = createElement('zoom', 198, 0);
  Object.assign(zoom.params, { w: 6, mag: 20 });
  const foci = zoomFoci(zoom, traceScene([laser, createElement('lens', 100, 0), squareSample(197), zoom], []).paths);
  const propagated = foci.filter(f => f.model === 'propagated');
  assert.equal(propagated.length, 1);
  const [beam] = propagated;
  assert.ok(beam.point.x > 197 && beam.to <= 197 - beam.point.x + 1e-6, `ends at the plane: ${beam.point.x + beam.to}`);
  // An ND filter half a nanometre before the waist: the waist is drawn once
  // on each side of it, never twice over the same stretch.
  const scene = focusedScene();
  const [waist] = zoomFoci(scene.zoom, scene.traced.paths);
  const nd = createElement('filter', waist.point.x - 0.5e-6, 0);
  nd.params.ftype = 'nd';
  const zoomNd = createElement('zoom', 200, 0);
  Object.assign(zoomNd.params, { w: 4, mag: 20 });
  const split = zoomFoci(zoomNd, traceScene([createElement('cwlaser', 0, 0), createElement('lens', 100, 0), nd, zoomNd], []).paths);
  assert.equal(split.length, 2);
  // Named once, by the stretch past the filter that holds it.
  assert.deepEqual(split.map(f => f.named).sort(), [false, true]);
  const spans = split.map(f => [f.point.x + f.from, f.point.x + f.to]).sort((a, b) => a[0] - b[0]);
  assert.ok(spans[0][1] <= spans[1][0] + 1e-6, `no overlap: ${JSON.stringify(spans)}`);
});

// A 0.1 mm wide 633 nm beam through an f = 100 mm lens at x = 200: its
// Rayleigh range (12.4 mm) is short against f, so its waist forms at 495.285,
// far past the rays' crossing at 300, with w0 101 µm and zR 50.5 mm. A wide
// view (80 × 20 mm) around it, and what lies at or past the waist.
function wideWaist(extra = []) {
  const laser = createElement('cwlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'beam', beamWidth: 0.1, wavelength: 633 });
  const lens = createElement('lens', 200, 0);
  const zoom = createElement('zoom', 495, 0);
  Object.assign(zoom.params, { shape: 'rect', w: 80, h: 20, mag: 2 });
  const elements = [laser, lens, ...extra, zoom];
  const traced = traceScene(elements, []);
  const svg = zoomSceneSVG(zoom, { drawables: traced.drawables, paths: traced.paths, elements });
  return { foci: zoomFoci(zoom, traced.paths), labels: [...svg.matchAll(/>(w₀ [^<]*)</g)].map(m => m[1]) };
}
const placed = (type, x, params = {}) => Object.assign(createElement(type, x, 0), { params: { ...createElement(type, x, 0).params, ...params } });

test('the beam alone names its waist once', () => {
  const { foci, labels } = wideWaist();
  assert.deepEqual(labels, ['w₀ 101 µm']);
  assert.ok(Math.abs(foci[0].point.x - 495.285) < 1e-3, `at ${foci[0].point.x}`);
  assert.ok(Math.abs(foci[0].zRMm - 50.48) < 0.01, `zR ${foci[0].zRMm}`);
});

test('a lens before the waist is reached names only the waist it forms', () => {
  // A weak lens 25 mm before the waist: the beam's waist moves to 498.423.
  const weak = wideWaist([placed('lens', 470, { f: 500 })]);
  assert.deepEqual(weak.labels, ['w₀ 95.6 µm']);
  assert.ok(Math.abs(weak.foci[0].point.x - 498.423) < 1e-3, `at ${weak.foci[0].point.x}`);
  // A lens 4.3 mm (0.085 zR) before it, closer than a beam block may stand
  // and still name the waist (below): the waist is 513.312's, never 495's.
  const near = wideWaist([placed('lens', 491, { f: 100 })]);
  assert.deepEqual(near.labels, ['w₀ 87 µm']);
  assert.ok(Math.abs(near.foci[0].point.x - 513.312) < 1e-3, `at ${near.foci[0].point.x}`);
});

test('a lens past the waist names the waist it forms, and no virtual one behind it', () => {
  // A diverging lens 4.7 mm past the waist: the beam leaving it seems to
  // come from a waist behind the lens, which it never passes through.
  assert.deepEqual(wideWaist([placed('lens', 500, { f: -500 })]).labels, ['w₀ 101 µm']);
  assert.deepEqual(wideWaist([placed('lens', 505, { f: -200 })]).labels, ['w₀ 101 µm']);
  // A converging one there focuses the beam again, to a second real waist.
  const { foci, labels } = wideWaist([placed('lens', 500, { f: 300 })]);
  assert.deepEqual(labels, ['w₀ 101 µm', 'w₀ 101 µm']);
  assert.deepEqual(foci.map(f => Number(f.point.x.toFixed(3))), [495.285, 503.864]);
});

test('a beam block before the waist ends the beam: the waist is named only within a tenth of zR of it', () => {
  // The block's face at 470, half a Rayleigh range short: no waist.
  assert.deepEqual(wideWaist([placed('blocker', 475, { w: 10, h: 20 })]).labels, []);
  // Its face 4.3 mm (0.085 zR) short: the beam meets it 0.4 % wider than
  // w0, and the waist is named.
  assert.deepEqual(wideWaist([placed('blocker', 492, { w: 2, h: 20 })]).labels, ['w₀ 101 µm']);
  // 6.1 mm (0.12 zR) short: not.
  assert.deepEqual(wideWaist([placed('blocker', 490.2, { w: 2, h: 20 })]).labels, []);
});

test('an optic the beam goes straight through names the waist once, on either side of it', () => {
  // A longpass filter passes 633 nm unchanged: the waist is drawn by the
  // stretch that holds it, before the filter or after it, never by both.
  // Its envelope is still drawn on both stretches, meeting at the filter.
  for (const x of [494, 496]) {
    const { foci, labels } = wideWaist([placed('filter', x, { ftype: 'longpass' })]);
    assert.deepEqual(labels, ['w₀ 101 µm'], `filter at ${x}`);
    assert.equal(foci.length, 2);
    assert.deepEqual(foci.map(f => f.named).sort(), [false, true]);
    for (const f of foci) assert.ok(Math.abs(f.point.x - 495.285) < 1e-3);
    const spans = foci.map(f => [f.point.x + f.from, f.point.x + f.to]).sort((a, b) => a[0] - b[0]);
    assert.ok(Math.abs(spans[0][1] - x) < 1e-6 && Math.abs(spans[1][0] - x) < 1e-6, `halves meet at ${x}: ${JSON.stringify(spans)}`);
  }
  // A diagram-only window meets no ray, and changes nothing.
  assert.deepEqual(wideWaist([Object.assign(placed('window', 494), { rot: 90 })]).labels, ['w₀ 101 µm']);
});

test('a waist just past the face where the light stops keeps its note: a fiber, a pinhole', async () => {
  const labelsOf = async name => {
    const text = await readFile(new URL(`../Examples/Fundamentals/${name}.json`, import.meta.url), 'utf8');
    const scene = parseSketch(text, registry);
    const traced = traceScene(scene.elements, scene.beams);
    const zoom = scene.elements.find(el => el.type === 'zoom');
    const svg = zoomSceneSVG(zoom, { drawables: traced.drawables, paths: traced.paths, elements: scene.elements });
    return [...svg.matchAll(/>(w₀ [^<]*)</g)].map(m => m[1]);
  };
  // 1.6 µm (0.07 zR) past the fiber's end face.
  assert.deepEqual(await labelsOf('Coupling a laser into a single-mode fiber'), ['w₀ 2.21 µm']);
  // The beam's waist in the gap, and the light at 6° focused 1.9 µm
  // (0.015 zR) past the plate it ends on.
  const pinhole = await labelsOf('Pinhole spatial filter');
  assert.equal(pinhole.length, 2, pinhole.join(', '));
});
