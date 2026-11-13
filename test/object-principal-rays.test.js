// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The Object's principal rays: three textbook construction rays from the tip,
// drawn lens by lens from each lens's object to its image.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { objectImageReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';

const near = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b} (tolerance ${tol})`);
const lensAt = (x, f, dia = 25.4) => {
  const lens = createElement('lens', x, 0);
  Object.assign(lens.params, { f, dia });
  return lens;
};
const objectAt = (x, y = 0, height = 22) => {
  const object = createElement('objarrow', x, y);
  Object.assign(object.params, { height, raysFrom: 'principal' });
  return object;
};
// The drawing styles the image block gives the construction.
const solid = r => r.drawables.filter(d => d.type === 'path' && d.w === 1.8 && d.opacity === 0.9 && !d.dash);
const dashed = r => r.drawables.filter(d => d.type === 'path' && d.w === 1.4 && d.dash === '5 4');
const planes = r => r.drawables.filter(d => d.type === 'path' && d.color === '#94a3b8' && d.dash === '3 3');
const distanceToLine = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / Math.hypot(dx, dy);
};
// Whether a polyline passes through p (on one of its segments, within tol).
const passes = (pts, p, tol = 1e-9) => pts.slice(1).some((b, i) => {
  const a = pts[i];
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  return t >= -1e-12 && t <= 1 + 1e-12 && distanceToLine(p, a, b) <= tol;
});
const allFinite = r => r.drawables.every(d => (d.pts || []).every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));

test('one lens: the three rays have their textbook properties and meet at the image tip', () => {
  // Tip at y = −11 (up is −y), 300 mm before a 100 mm lens: image 150 mm
  // after it, half size, inverted, so its tip is at (450, +5.5).
  const object = objectAt(0);
  const result = traceScene([object, lensAt(300, 100)], []);
  const rays = solid(result);
  assert.equal(rays.length, 3);
  assert.equal(result.paths.filter(r => r.sourceId === object.id).length, 0, 'principal rays are drawn, not traced');
  const tip = { x: 450, y: 5.5 };
  for (const ray of rays) {
    near(ray.pts[0].x, 0, 1e-9, 'starts at the tip x');
    near(ray.pts[0].y, -11, 1e-9, 'starts at the tip y');
    assert.ok(passes(ray.pts, tip), `meets at the image tip: ${JSON.stringify(ray.pts)}`);
    near(ray.pts.at(-1).x, tip.x, 1e-9, 'ends on the image, not past it');
    near(ray.pts.at(-1).y, tip.y, 1e-9, 'ends on the image, not past it');
    near(ray.pts[1].x, 300, 1e-9, 'bends at the lens');
  }
  const [parallel, chief, focal] = rays;
  near(parallel.pts[1].y, -11, 1e-9, 'parallel ray stays at the tip height');
  assert.ok(passes(parallel.pts, { x: 400, y: 0 }), 'parallel ray then crosses the back focal point');
  near(chief.pts[1].y, 0, 1e-9, 'chief ray meets the lens centre');
  near(distanceToLine(chief.pts[2], chief.pts[0], chief.pts[1]), 0, 1e-9, 'chief ray is undeviated');
  assert.ok(passes(focal.pts, { x: 200, y: 0 }), 'focal ray crosses the front focal point');
  near(focal.pts[2].y, focal.pts[1].y, 1e-9, 'focal ray leaves parallel to the axis');
  assert.equal(dashed(result).length, 0, 'a real image needs no dashed line');
  assert.equal(planes(result).length, 0, 'every ray meets the 25.4 mm lens inside its glass');
});

test('a virtual image: rays diverge and dashed lines lead back to the upright image', () => {
  // 60 mm before a 100 mm lens 76.2 mm across: virtual image 150 mm before
  // the lens, 2.5× and upright, its tip at (−90, −27.5).
  const object = objectAt(0);
  const result = traceScene([object, lensAt(60, 100, 76.2)], []);
  assert.equal(solid(result).length, 3);
  const back = dashed(result);
  assert.equal(back.length, 3);
  for (const d of back) {
    near(d.pts.at(-1).x, -90, 1e-9, 'dashed to the virtual tip x');
    near(d.pts.at(-1).y, -27.5, 1e-9, 'dashed to the virtual tip y');
  }
  assert.equal(objectImageReading(object.id).stages[0].real, false);
  assert.equal(planes(result).length, 0, 'a thin lens never gets grey lines');
});

test('a ray that would meet a lens outside its glass is not drawn', () => {
  // Same scene, a 25.4 mm lens: the focal ray would meet its plane at −27.5,
  // beyond the 12.7 mm rim, so only the parallel and centre rays are drawn.
  const object = objectAt(0);
  const result = traceScene([object, lensAt(60, 100)], []);
  const rays = solid(result);
  assert.equal(rays.length, 2);
  for (const ray of rays) assert.ok(Math.abs(ray.pts[1].y) <= 12.7, 'each drawn ray meets the glass');
  assert.equal(dashed(result).length, 2);
  assert.equal(planes(result).length, 0, 'no plane drawn on past the glass');
});

test('two lenses: each lens gets its own three rays, from its object to its image', () => {
  // Image 1 at (450, +5.5); 150 mm before lens 2 (f 100) at 600, so image 2
  // is 300 mm after it at (900, −11), upright overall.
  const object = objectAt(0);
  const result = traceScene([object, lensAt(300, 100), lensAt(600, 100)], []);
  const rays = solid(result);
  assert.equal(rays.length, 6);
  const image1 = { x: 450, y: 5.5 }, image2 = { x: 900, y: -11 };
  for (const ray of rays.slice(0, 3)) {
    const end = ray.pts.at(-1);
    near(end.x, image1.x, 1e-9, 'lens 1 rays end at image 1');
    near(end.y, image1.y, 1e-9, 'lens 1 rays end at image 1');
  }
  for (const ray of rays.slice(3)) {
    near(ray.pts[0].x, image1.x, 1e-9, 'lens 2 rays start at image 1');
    near(ray.pts[0].y, image1.y, 1e-9, 'lens 2 rays start at image 1');
    near(ray.pts[1].x, 600, 1e-9, 'and bend at lens 2');
    near(ray.pts.at(-1).x, image2.x, 1e-9, 'lens 2 rays end on image 2');
    near(ray.pts.at(-1).y, image2.y, 1e-9, 'lens 2 rays end on image 2');
  }
  near(rays[4].pts[1].y, 0, 1e-9, 'lens 2 chief ray through its centre');
});

test('an object in the front focal plane: the collimated rays go on through the next lens into its focus', () => {
  // Lens 1 at 100 (f 100) collimates the tip; lens 2 at 300 (f 100) images
  // it in its back focal plane at (400, +11). With no real image between
  // them, lens 2 starts no rays of its own: lens 1's two rays (parallel and
  // centre; none leaves lens 1 parallel to the axis) are one connected path
  // each, bent at lens 2 into its focus.
  const object = objectAt(0);
  const result = traceScene([object, lensAt(100, 100, 50.8), lensAt(300, 100, 50.8)], []);
  const rays = solid(result);
  assert.equal(rays.length, 2);
  const slope = (a, b) => (b.y - a.y) / (b.x - a.x);
  for (const ray of rays) {
    near(ray.pts[0].x, 0, 1e-9, 'starts at the tip');
    assert.deepEqual(ray.pts.slice(1, 3).map(q => q.x), [100, 300], 'crosses lens 1, then lens 2');
    near(ray.pts.at(-1).x, 400, 1e-9, 'ends on the image');
    near(ray.pts.at(-1).y, 11, 1e-9, 'ends on the image');
  }
  near(slope(rays[0].pts[1], rays[0].pts[2]), slope(rays[1].pts[1], rays[1].pts[2]), 1e-12, 'parallel between the lenses');
  assert.equal(dashed(result).length + planes(result).length, 0);
  // With 25.4 mm lenses, lens 1's centre ray would reach lens 2 at +22,
  // past its 12.7 mm rim, and is left out.
  const small = solid(traceScene([objectAt(0), lensAt(100, 100), lensAt(300, 100)], []));
  assert.equal(small.length, 1);
  assert.ok(small.every(ray => ray.pts.every(p => !(Math.abs(p.x - 300) < 1e-9) || Math.abs(p.y) <= 12.7)), 'nothing crosses lens 2 outside its glass');
});

test('an image that would form beyond the next lens: lens 1 rays go on through lens 2 to its image', () => {
  // Image 1 would form at (450, +5.5), 50 mm beyond lens 2 at 400 (f 100);
  // lens 2 bends the converging rays to (433.3, 3.67). No ray starts in
  // mid-air and none is dashed.
  const object = objectAt(0);
  const result = traceScene([object, lensAt(300, 100), lensAt(400, 100)], []);
  const rays = solid(result);
  assert.equal(rays.length, 3);
  assert.equal(dashed(result).length, 0);
  const image2 = { x: 400 + 100 / 3, y: 11 / 3 };
  for (const ray of rays) {
    near(ray.pts[0].x, 0, 1e-9, 'starts at the tip');
    assert.deepEqual(ray.pts.slice(1, 3).map(q => q.x), [300, 400], 'crosses lens 1, then lens 2');
    near(ray.pts.at(-1).x, image2.x, 1e-9, 'ends on image 2');
    near(ray.pts.at(-1).y, image2.y, 1e-9, 'ends on image 2');
  }
});

test('a plate before the lens: the rays bend in it and keep their properties at the lens', () => {
  const object = objectAt(0, 0, 4);
  const plate = createElement('lensgroup', 150, 0);
  Object.assign(plate.params, { preset: 'custom', rows: [{ r: 0, thickness: 100, glass: 'nbk7' }, { r: 0, thickness: 4, glass: 'air' }] });
  const result = traceScene([object, plate, lensAt(300, 100)], []);
  const rays = solid(result);
  assert.equal(rays.length, 3);
  const [parallel, chief, focal] = rays;
  for (const ray of rays) {
    near(ray.pts[0].x, 0, 1e-9, 'starts at the real tip');
    near(ray.pts[0].y, -2, 1e-9, 'starts at the real tip');
  }
  const atLens = ray => ray.pts.find(p => Math.abs(p.x - 300) < 1e-9);
  near(atLens(chief).y, 0, 1e-9, 'chief ray meets the lens centre through the plate');
  near(atLens(parallel).y, -2, 1e-9, 'parallel ray reaches the lens at the tip height');
  near(focal.pts.at(-1).y, focal.pts.at(-2).y, 1e-9, 'focal ray leaves parallel');
  near(parallel.pts.at(-1).x, focal.pts.at(-1).x, 1e-9, 'all end on the image');
  // The rays meet at the drawn image tip, which the plate has moved.
  const image = rays.map(r => r.pts.at(-1));
  near(image[0].x, image[1].x, 1e-9, 'parallel and chief meet');
  near(image[0].y, image[1].y, 1e-9, 'parallel and chief meet');
  // A plate carries rays without bending them: the slope inside differs
  // from outside, and it is the same on both sides.
  const slope = (a, b) => (b.y - a.y) / (b.x - a.x);
  const [p0, p1, p2, p3] = chief.pts;
  assert.ok(Math.abs(slope(p1, p2)) < Math.abs(slope(p0, p1)), 'flatter inside the glass');
  near(slope(p0, p1), slope(p2, p3), 1e-9, 'same slope either side of the plate');
});

test('a plate after the last lens: the rays cross at the lens image, go on through the plate and lead back to the final image', () => {
  // Andrea's case on #319: lens at 300 (f 100) images the tip at (450, +5.5);
  // a 100 mm N-BK7 plate from 600 moves the final image to x ≈ 484.0, which
  // the light leaving the plate appears to come from (virtual).
  const object = objectAt(0);
  const plate = createElement('lensgroup', 600, 0);
  Object.assign(plate.params, { preset: 'custom', dia: 100, rows: [{ r: 0, thickness: 100, glass: 'nbk7' }, { r: 0, thickness: 4, glass: 'air' }] });
  const result = traceScene([object, lensAt(300, 100), plate], []);
  const tip = result.drawables.find(d => d.type === 'poly' && d.opacity === 0.85).pts[0];
  near(tip.x, 484.016896, 1e-5, 'drawn final image');
  const rays = solid(result);
  assert.equal(rays.length, 3);
  for (const ray of rays) {
    assert.ok(passes(ray.pts, { x: 450, y: 5.5 }, 1e-9), 'crosses at the lens image');
    assert.ok(ray.pts.at(-1).x > 700, `goes on through the plate: ${JSON.stringify(ray.pts.at(-1))}`);
  }
  const back = dashed(result);
  assert.equal(back.length, 3);
  for (const d of back) {
    near(d.pts.at(-1).x, tip.x, 1e-9, 'dashed back to the final image x');
    near(d.pts.at(-1).y, tip.y, 1e-9, 'dashed back to the final image y');
  }
});

test('a thick lens: rays cross between its principal planes at constant height, both planes drawn', () => {
  const object = objectAt(0, 0, 10);
  const thick = createElement('thicklens', 300, 0);
  const result = traceScene([object, thick], []);
  const rays = solid(result);
  assert.equal(rays.length, 3);
  for (const ray of rays) near(ray.pts[1].y, ray.pts[2].y, 1e-9, 'same height on H and H′');
  const ext = planes(result);
  assert.equal(ext.length, 2, 'H and H′');
  const reading = objectImageReading(object.id);
  assert.equal(reading.stages.length, 1);
  // The three rays meet at the drawn image tip (the arrowhead's first point).
  const tip = result.drawables.find(d => d.type === 'poly' && d.opacity === 0.85).pts[0];
  for (const ray of rays) assert.ok(passes(ray.pts, tip, 1e-9), 'meets at the drawn image tip');
});

test('a meniscus with its principal planes outside the glass: a ray that would pass it by is not drawn', () => {
  // Andrea's case on #319: R1 60, R2 57, 6 mm thick, 25.4 mm across. Its
  // principal planes lie near x = 540, far beyond the glass (297–304.4), so
  // the centre ray from the tip at (280, −15) would meet H at height 0 yet
  // cross the lens faces above the 12.7 mm rim.
  const meniscus = () => {
    const m = createElement('thicklens', 300, 0);
    Object.assign(m.params, { r1: 60, r2: 57, thickness: 6, dia: 25.4, glass: 'nbk7' });
    return m;
  };
  const faces = [297, 304.432833];
  const crossingsInGlass = rays => {
    for (const ray of rays) {
      for (const x of faces) {
        let crossed = false;
        for (let i = 1; i < ray.pts.length; i++) {
          const a = ray.pts[i - 1], b = ray.pts[i];
          if ((a.x - x) * (b.x - x) > 0 || a.x === b.x) continue;
          crossed = true;
          const y = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
          assert.ok(Math.abs(y) <= 12.7 + 1e-6, `crosses the face plane x = ${x} within the glass (y = ${y})`);
        }
        assert.ok(crossed, `crosses the face plane x = ${x}`);
      }
    }
  };
  // Close and tall: every principal ray would pass the glass by.
  const close = traceScene([objectAt(280, 0, 30), meniscus()], []);
  assert.equal(solid(close).length, 0);
  assert.ok(allFinite(close));
  // Far and small: all three cross the glass and are drawn.
  const far = solid(traceScene([objectAt(0, 0, 4), meniscus()], []));
  assert.equal(far.length, 3);
  crossingsInGlass(far);
});

test('with no lens, with rays off, or before the option existed: no principal rays', () => {
  const alone = objectAt(0);
  const none = traceScene([alone], []);
  assert.equal(solid(none).length + dashed(none).length + planes(none).length, 0);
  assert.deepEqual(registry.objarrow.source(alone, { surfaces: [] }), [], 'no traced fan either');

  const off = objectAt(0);
  off.params.raysMode = 'none';
  assert.equal(solid(traceScene([off, lensAt(300, 100)], [])).length, 0);

  const saved = { app: 'optics2d', version: 1, beams: [], elements: [{ id: 'o', type: 'objarrow', x: 0, y: 0, rot: 0, params: { height: 20 } }] };
  assert.equal(parseSketch(JSON.stringify(saved), registry).elements[0].params.raysFrom, 'axis');
});

test('the principal rays draw without the image marker, and hide the fan controls', () => {
  const object = objectAt(0);
  object.params.showImage = false;
  const result = traceScene([object, lensAt(300, 100)], []);
  assert.equal(solid(result).length, 3);
  assert.equal(result.drawables.filter(d => d.opacity === 0.85).length, 0, 'no image marker');
  const shown = key => registry.objarrow.params.find(p => p.key === key).show(object.params);
  assert.equal(shown('aim'), false);
  assert.equal(shown('nrays'), false);
  assert.equal(shown('spread'), false);
  object.params.raysFrom = 'tip';
  assert.equal(shown('aim'), true);
  assert.equal(shown('nrays'), true);
});

test('edge cases stay finite: tip on the lens axis, object just off the focal plane, tilted lens', () => {
  const onAxis = objectAt(0, 11);
  const r1 = traceScene([onAxis, lensAt(300, 100)], []);
  assert.ok(allFinite(r1));
  assert.ok(solid(r1).length >= 1);

  const nearFocus = objectAt(200 - 1e-4);
  const r2 = traceScene([nearFocus, lensAt(300, 100)], []);
  assert.ok(allFinite(r2));
  for (const ray of [...solid(r2), ...dashed(r2)]) {
    for (let i = 1; i < ray.pts.length; i++) {
      assert.ok(Math.hypot(ray.pts[i].x - ray.pts[i - 1].x, ray.pts[i].y - ray.pts[i - 1].y) <= 6000 + 1e-6, 'segments capped');
    }
  }

  const tilted = lensAt(300, 100, 200);
  tilted.rot = 20;
  const object = objectAt(0);
  const r3 = traceScene([object, tilted], []);
  assert.ok(allFinite(r3));
  const rays = solid(r3);
  assert.equal(rays.length, 3);
  const meet = rays[0].pts.at(-1);
  for (const ray of rays.slice(1)) {
    near(ray.pts.at(-1).x, meet.x, 1e-6, 'the three still meet with a tilted lens');
    near(ray.pts.at(-1).y, meet.y, 1e-6, 'the three still meet with a tilted lens');
  }
});
