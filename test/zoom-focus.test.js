// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { state } from '../sketch/js/state.js';
import { buildSVG } from '../sketch/js/export.js';
import { gaussianFocus } from '../sketch/js/sectioning.js';
import { focusEnvelope, zoomFoci } from '../sketch/js/zoom-focus.js';
import { zoomSceneSVG } from '../sketch/js/zoom-view.js';
import { zoomGeometry, zoomNotes } from '../sketch/js/zoom.js';

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

test('a beam focused in the region gets the Gaussian waist of its cone', () => {
  const scene = focusedScene();
  const foci = zoomFoci(scene.zoom, scene.traced.paths);
  assert.equal(foci.length, 1);
  const [focus] = foci;
  assert.ok(Math.abs(focus.point.x - 200) < 1e-6 && Math.abs(focus.point.y) < 1e-6, 'at the focal plane');
  assert.ok(Math.abs(focus.axis.x - 1) < 1e-9);
  // The cone's half-angle is the beam's half-width over f.
  assert.ok(Math.abs(focus.na - Math.sin(Math.atan(1.5 / 100))) < 1e-6, `NA ${focus.na}`);
  const ideal = gaussianFocus(532, focus.na);
  assert.equal(focus.w0Mm, ideal.w0Mm);
  assert.equal(focus.zRMm, ideal.zRMm);
  // The textbook λf/(πw) for a 1.5 mm half-width, within the paraxial error.
  assert.ok(Math.abs(focus.w0Mm - 532e-6 * 100 / (Math.PI * 1.5)) < 1e-4, `w0 ${focus.w0Mm}`);
  assert.equal(focus.wl, 532);
});

test('the view draws the waist and names it only when asked', () => {
  const scene = focusedScene();
  const svg = view(scene);
  assert.match(svg, /data-zoom-focus="true"/);
  assert.match(svg, /data-zoom-focus-label[^]*>w₀ 11\.3 µm<[^]*>zR 753 µm</);
  // A round view of modest size (60 mm across) still names the waist.
  const modest = focusedScene({ x: 200, y: 0 }, { shape: 'circle', w: 4, mag: 15 });
  assert.match(view(modest), />w₀ 11\.3 µm</);
  scene.zoom.params.diffraction = false;
  assert.doesNotMatch(view(scene), /data-zoom-focus/, 'off: the view is the bench as traced');
  delete scene.zoom.params.diffraction;
  assert.doesNotMatch(view(scene), /data-zoom-focus/, 'a scene saved before the setting is unchanged');
  assert.equal(createElement('zoom').params.diffraction, false);
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
  const outline = focusEnvelope(focus, 20, 48);
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
  assert.deepEqual(focusEnvelope({ ...focus, zRMm: NaN }, 20), [], 'non-finite input draws nothing');
});

test('the waist keeps its weight in the view', () => {
  const scene = focusedScene();
  const svg = view(scene);
  const width = Number(svg.match(/<polygon [^>]*stroke-width="([\d.]+)"[^>]*data-zoom-focus/)[1]);
  assert.ok(Math.abs(width - 0.8 / 20) < 1e-9, 'bench weight divided by the magnification');
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
