import test from 'node:test';
import assert from 'node:assert/strict';
import { clampZoom, gridDetailForZoom, MICRO_GRID_PITCH, pinchView, snapToGrid, zoomViewAt } from '../sketch/js/viewport.js';

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
