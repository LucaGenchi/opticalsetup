import test from 'node:test';
import assert from 'node:assert/strict';
import { clampZoom, gridDetailForZoom, pinchView, snapToGrid, zoomViewAt } from '../sketch/js/viewport.js';

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

test('progressive grid and snapping refine only at close zoom', () => {
  assert.deepEqual(gridDetailForZoom(1.99), { step: 25, level: 'table' });
  assert.deepEqual(gridDetailForZoom(2), { step: 5, level: 'fine' });
  assert.deepEqual(gridDetailForZoom(8), { step: 1, level: 'micro' });
  assert.equal(snapToGrid(13.4, 1), 25);
  assert.equal(snapToGrid(13.4, 2), 15);
  assert.equal(snapToGrid(13.4, 8), 13);
});
