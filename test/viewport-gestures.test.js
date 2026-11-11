// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { clampZoom, gridDetailForZoom, MICRO_GRID_PITCH, pinchView, snapToGrid, wheelView, WHEEL_ZOOM_MAX_DELTA, WHEEL_ZOOM_RATE, zoomViewAt } from '../sketch/js/viewport.js';

test('zoomViewAt keeps the world point under its screen anchor', () => {
  const start = { x: 60, y: 40, z: 1 };
  const anchor = { x: 210, y: 140 };
  const world = { x: (anchor.x - start.x) / start.z, y: (anchor.y - start.y) / start.z };
  const next = zoomViewAt(start, anchor, 2);
  assert.equal(next.z, 2);
  assert.equal(next.x + world.x * next.z, anchor.x);
  assert.equal(next.y + world.y * next.z, anchor.y);
});

test('pinchView combines pinch zoom and midpoint panning around the starting world point', () => {
  const start = { x: 60, y: 40, z: 1 };
  const startCenter = { x: 160, y: 120 };
  const nextCenter = { x: 200, y: 155 };
  const next = pinchView(start, startCenter, 80, nextCenter, 160);
  assert.deepEqual(next, { x: 0, y: -5, z: 2 });
  assert.equal((startCenter.x - start.x) / start.z, (nextCenter.x - next.x) / next.z);
  assert.equal((startCenter.y - start.y) / start.z, (nextCenter.y - next.y) / next.z);
});

test('viewport zoom remains bounded', () => {
  assert.equal(clampZoom(0.001), 0.15);
  assert.equal(clampZoom(500), 64);
  assert.equal(zoomViewAt({ x: 0, y: 0, z: 32 }, { x: 10, y: 10 }, 3).z, 64);
});

test('progressive grid and snapping refine at precision zoom tiers', () => {
  assert.deepEqual(gridDetailForZoom(1.99), { step: 25, level: 'table' });
  assert.deepEqual(gridDetailForZoom(2), { step: 5, level: 'fine' });
  assert.deepEqual(gridDetailForZoom(8), { step: 1, level: 'micro' });
  assert.deepEqual(gridDetailForZoom(29.99), { step: 1, level: 'micro' });
  assert.deepEqual(gridDetailForZoom(30), { step: 0.25, level: 'micro' });

  assert.equal(snapToGrid(13.4, 1), 25);
  assert.equal(snapToGrid(13.4, 2), 15);
  assert.equal(snapToGrid(13.4, 8), 13);
  assert.equal(snapToGrid(13.4, 9.99), 13);
  assert.equal(snapToGrid(13.4, 10), 13.5);
  assert.equal(snapToGrid(13.4, 30), 13.5);
});

test('the grid pitch is carried by the returned step, not by shared module state', () => {
  // Two pitches share the 'micro' level. An earlier revision kept them in sync
  // through a mutable `export let`, which made a query function mutate module
  // state and left the value stale for any caller that read it without
  // querying at the current zoom first.
  assert.equal(MICRO_GRID_PITCH, 1);
  gridDetailForZoom(30);
  assert.equal(MICRO_GRID_PITCH, 1, 'querying a zoom must not rewrite the constant');
  assert.equal(gridDetailForZoom(30).step, 0.25);
  assert.equal(gridDetailForZoom(8).step, 1);

  // Interleaving zooms must not contaminate each other.
  const deep = gridDetailForZoom(64);
  const shallow = gridDetailForZoom(8);
  assert.equal(deep.step, 0.25);
  assert.equal(shallow.step, 1);
});

test('precision snapping stays on a 0.25 mm lattice across the whole deep-zoom range', () => {
  for (const z of [10, 16, 30, 64]) {
    for (const v of [13.4, -7.13, 0.12, 100.06]) {
      const snapped = snapToGrid(v, z);
      assert.ok(Math.abs(Math.round(snapped / 0.25) - snapped / 0.25) < 1e-9,
        `snapToGrid(${v}, ${z}) = ${snapped} is not on the 0.25 mm lattice`);
      assert.ok(Math.abs(snapped - v) <= 0.125 + 1e-9, 'snapping must move to the nearest rung');
    }
  }
  // and below the threshold the coarser tiers are untouched
  assert.equal(snapToGrid(13.4, 9.99), 13);
  assert.equal(snapToGrid(13.4, 1), 25);
});

const keepsAnchor = (before, after, anchor) => {
  const world = { x: (anchor.x - before.x) / before.z, y: (anchor.y - before.y) / before.z };
  return Math.abs(after.x + world.x * after.z - anchor.x) < 1e-9
    && Math.abs(after.y + world.y * after.z - anchor.y) < 1e-9;
};

test('a plain wheel or two-finger swipe pans on both axes and never zooms', () => {
  const view = { x: 60, y: 40, z: 1 };
  const point = { x: 210, y: 140 };
  // Mouse Y wheel moves the table up and down, the X (tilt/thumb) wheel sideways.
  assert.deepEqual(wheelView(view, point, { deltaY: 100 }), { x: 60, y: -60, z: 1 });
  assert.deepEqual(wheelView(view, point, { deltaX: -100 }), { x: 160, y: 40, z: 1 });
  // A trackpad swipe is diagonal and jittery: both components are used, none becomes zoom.
  assert.deepEqual(wheelView(view, point, { deltaX: 8, deltaY: 1 }), { x: 52, y: 39, z: 1 });
  assert.deepEqual(wheelView(view, point, { deltaX: -3, deltaY: -6 }), { x: 63, y: 46, z: 1 });
  assert.deepEqual(view, { x: 60, y: 40, z: 1 }, 'a wheel event cannot mutate the previous view');
});

test('Shift+wheel pans sideways whether or not the browser swapped the axis', () => {
  const view = { x: 60, y: 40, z: 1 };
  const point = { x: 0, y: 0 };
  assert.deepEqual(wheelView(view, point, { deltaY: 20, shiftKey: true }), { x: 40, y: 40, z: 1 });
  assert.deepEqual(wheelView(view, point, { deltaX: 20, shiftKey: true }), { x: 40, y: 40, z: 1 });
  assert.deepEqual(wheelView(view, point, { deltaX: 5, deltaY: 10, shiftKey: true }), { x: 55, y: 30, z: 1 });
});

test('pinch and Ctrl/Cmd+wheel zoom at the pointer, a mouse notch by at most about 2x', () => {
  const view = { x: 60, y: 40, z: 1 };
  const anchor = { x: 210, y: 140 };
  for (const mod of [{ ctrlKey: true }, { metaKey: true }]) {
    const zoomIn = wheelView(view, anchor, { deltaY: -100, ...mod });
    const zoomOut = wheelView(view, anchor, { deltaY: 100, ...mod });
    assert.ok(Math.abs(zoomIn.z - Math.exp(WHEEL_ZOOM_MAX_DELTA * WHEEL_ZOOM_RATE)) < 1e-12);
    assert.ok(zoomIn.z < 2.1, 'one mouse notch no longer jumps 3.3x');
    assert.ok(Math.abs(zoomOut.z * zoomIn.z - 1) < 1e-12, 'in and out are symmetric');
    assert.ok(keepsAnchor(view, zoomIn, anchor) && keepsAnchor(view, zoomOut, anchor));
  }
  // A trackpad pinch sends small deltas; they keep their continuous rate.
  assert.ok(Math.abs(wheelView(view, anchor, { deltaY: -5, ctrlKey: true }).z - Math.exp(5 * WHEEL_ZOOM_RATE)) < 1e-12);
  // Shift does not turn a pinch into a pan, and a sideways pinch delta does nothing.
  assert.ok(wheelView(view, anchor, { deltaY: -5, ctrlKey: true, shiftKey: true }).z > 1);
  assert.deepEqual(wheelView(view, anchor, { deltaX: 30, ctrlKey: true }), view);
});

test('wheel delta modes are converted to pixels and non-finite deltas move nothing', () => {
  const view = { x: 0, y: 0, z: 1 };
  const point = { x: 0, y: 0 };
  assert.deepEqual(wheelView(view, point, { deltaY: 3, deltaMode: 1 }), { x: 0, y: -48, z: 1 });
  assert.deepEqual(wheelView(view, point, { deltaY: 1, deltaMode: 2, viewportHeight: 600 }), { x: 0, y: -600, z: 1 });
  assert.deepEqual(wheelView(view, point, { deltaY: 1, deltaMode: 2, viewportHeight: Number.NaN }), { x: 0, y: -800, z: 1 });
  assert.equal(wheelView(view, point, { deltaY: -3, deltaMode: 1, ctrlKey: true }).z,
    wheelView(view, point, { deltaY: -48, ctrlKey: true }).z);
  assert.deepEqual(wheelView(view, point, { deltaX: Infinity, deltaY: Number.NaN }), view);
  assert.deepEqual(wheelView(view, point, { deltaY: -Infinity, ctrlKey: true }), view);
});

test('Ctrl/Cmd+wheel stops at the zoom limits', () => {
  const point = { x: 0, y: 0 };
  assert.equal(wheelView({ x: 0, y: 0, z: 64 }, point, { deltaY: -100, ctrlKey: true }).z, 64);
  assert.equal(wheelView({ x: 0, y: 0, z: 0.15 }, point, { deltaY: 100, ctrlKey: true }).z, 0.15);
});
