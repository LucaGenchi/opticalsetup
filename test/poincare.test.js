// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The Poincaré sphere drawn by the polarimeter: the view, the point plotted,
// and that nothing non-finite reaches the drawing.

import test from 'node:test';
import assert from 'node:assert/strict';

import { POINCARE_VIEW, poincarePoint, poincareSphereSVG, projectPoincare } from '../sketch/js/poincare.js';

const close = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const el = POINCARE_VIEW.elevationDeg * Math.PI / 180;

test('the view puts +S3 up, +S2 to the right and +S1 out of the page to the lower left', () => {
  const s1 = projectPoincare(1, 0, 0), s2 = projectPoincare(0, 1, 0), s3 = projectPoincare(0, 0, 1);
  close(s3.x, 0, 1e-12, 'S3 x');
  close(s3.y, Math.cos(el), 1e-12, 'S3 y');
  assert.ok(s2.x > 0.7 && Math.abs(s2.y) < 0.3, 'S2 points right');
  assert.ok(s1.x < 0 && s1.y < 0, 'S1 points to the lower left');
  // All three positive half-axes face the viewer, the negative ones do not.
  for (const axis of [s1, s2, s3]) assert.ok(axis.depth > 0);
  for (const axis of [projectPoincare(-1, 0, 0), projectPoincare(0, -1, 0), projectPoincare(0, 0, -1)]) assert.ok(axis.depth < 0);
  // An orthographic view of a unit vector lands inside the unit disc, and
  // its depth completes it to unit length.
  for (const [a, b, c] of [[0.3, -0.5, 0.81], [-0.6, 0.64, -0.48], [0, 0.8, 0.6]]) {
    const p = projectPoincare(a, b, c);
    close(Math.hypot(p.x, p.y, p.depth), Math.hypot(a, b, c), 1e-12, 'length kept');
  }
});

test('the plotted point is the measured vector, kept inside the unit ball and finite', () => {
  assert.equal(poincarePoint(null), null);
  assert.equal(poincarePoint(undefined), null);
  assert.deepEqual(poincarePoint({ s1: 0.3, s2: 0, s3: -0.4 }), { s1: 0.3, s2: 0, s3: -0.4, degree: 0.5 });
  // Round-off past the surface is pulled back onto it.
  const over = poincarePoint({ s1: 0, s2: 0, s3: 1 + 1e-9 });
  close(over.s3, 1, 1e-15, 's3');
  assert.equal(over.degree, 1);
  assert.deepEqual(poincarePoint({ s1: NaN, s2: Infinity, s3: 0.2 }), { s1: 0, s2: 0, s3: 0.2, degree: 0.2 });
});

test('right circular sits at the north pole, left circular at the south pole behind the centre', () => {
  const r = 10, right = poincareSphereSVG({ s1: 0, s2: 0, s3: 1 }, { r });
  assert.match(right, /data-poincare="state"/);
  const marker = /<circle cx="([-\d.]+)" cy="([-\d.]+)"[^>]*data-poincare-point="0,0,1"/.exec(right);
  assert.ok(marker, 'a point at the north pole');
  close(Number(marker[1]), 0, 0.01, 'x');
  close(Number(marker[2]), -r * Math.cos(el), 0.01, 'y');
  // The south pole faces away: the point is drawn hollow and its vector dashed.
  const left = poincareSphereSVG({ s1: 0, s2: 0, s3: -1 }, { r });
  assert.match(left, /fill="#061822" stroke="#f9a8d4"[^>]*data-poincare-point="0,0,-1"/);
  assert.match(left, /stroke="#f9a8d4" stroke-width="0.8" stroke-dasharray/);
});

test('partly polarized light sits inside the sphere, unpolarized light at its centre', () => {
  const r = 20, half = poincareSphereSVG({ s1: 0.5, s2: 0, s3: 0 }, { r });
  const marker = /<circle cx="([-\d.]+)" cy="([-\d.]+)"[^>]*data-poincare-point="0.5,0,0"/.exec(half);
  const expected = projectPoincare(0.5, 0, 0);
  close(Number(marker[1]), r * expected.x, 0.01, 'x');
  close(Number(marker[2]), -r * expected.y, 0.01, 'y');
  assert.ok(Math.hypot(Number(marker[1]), Number(marker[2])) < r / 2 + 0.01, 'inside, at half the radius or less');
  // On the equator: no drop line to the equatorial plane.
  assert.doesNotMatch(half, /opacity="0.75"/);
  const none = poincareSphereSVG({ s1: 0, s2: 0, s3: 0 }, { r });
  assert.match(none, /cx="0" cy="0"[^>]*data-poincare-point="0,0,0"/);
  assert.doesNotMatch(none, /stroke="#f9a8d4" stroke-width="0.9"/, 'no vector of zero length');
  // Above the equator the drop line shows the height.
  assert.match(poincareSphereSVG({ s1: 0.6, s2: 0, s3: 0.8 }, { r }), /opacity="0.75"/);
});

test('no measured vector leaves the sphere empty, and nothing non-finite is drawn', () => {
  const empty = poincareSphereSVG(null);
  assert.match(empty, /data-poincare="none"/);
  assert.doesNotMatch(empty, /data-poincare-point/);
  for (const bad of [{ s1: NaN, s2: NaN, s3: NaN }, { s1: Infinity, s2: -Infinity, s3: 1 }, 'x', 42]) {
    const svg = poincareSphereSVG(bad, { cx: NaN, cy: Infinity, r: NaN, fontSize: -1 });
    assert.doesNotMatch(svg, /NaN|Infinity/);
  }
});

test('the inspector palette writes classes only, so the theme sets the colours', () => {
  const svg = poincareSphereSVG({ s1: 0, s2: 0.6, s3: 0.8 }, { palette: 'css', meridians: true, labels: 'full', r: 22 });
  assert.doesNotMatch(svg, /(?:fill|stroke)="#/);
  for (const role of ['sphere', 'front', 'back', 'axis', 'axis-back', 'label', 'vector', 'drop', 'point']) {
    assert.match(svg, new RegExp(`class="ps-${role}"`));
  }
  for (const label of ['S₁ 0°', 'S₂ 45°', 'S₃ R', '>L<']) assert.ok(svg.includes(label), label);
});
