import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { registry, categories, createElement } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';
import { manualBeamSVG } from '../sketch/js/util.js';
import { traceAll } from '../sketch/js/raytrace.js';

const file = (elements = [], beams = []) => JSON.stringify({ app: 'optics2d', version: 1, elements, beams });
const canvasSource = await readFile(new URL('../sketch/js/canvas.js', import.meta.url), 'utf8');
const mainSource = await readFile(new URL('../sketch/js/main.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../sketch/index.html', import.meta.url), 'utf8');

const fiber = (overrides = {}) => ({
  kind: 'fiber',
  pts: [{ x: 0, y: 0 }, { x: 50, y: 0 }],
  color: '#e8a800', width: 4, propagate: true,
  inputNA: 0.22, groupIndex: 1.468, lossDbPerM: 0.2,
  out0: { mode: 'diverge', na: 0.12, focal: 20, dia: 6 },
  out1: { mode: 'diverge', na: 0.12, focal: 20, dia: 6 },
  ...overrides,
});

test('bare fiber renders with flat (butt) caps and no connector plugs', () => {
  const svg = manualBeamSVG(fiber({ bare: true }));
  assert.match(svg, /stroke-linecap="butt"/);
  assert.doesNotMatch(svg, /fill="#4d565f"/, 'the connector body rect should not be drawn');
  assert.doesNotMatch(svg, /fill="#8d98a5"/, 'the connector ferrule rect should not be drawn');
});

test('a connectorized fiber keeps its round caps and connector plugs, same as before', () => {
  const svg = manualBeamSVG(fiber({ bare: false }));
  assert.match(svg, /stroke-linecap="round"/);
  assert.match(svg, /fill="#4d565f"/, 'connector body should still render');
  assert.match(svg, /fill="#8d98a5"/, 'connector ferrule should still render');

  const legacySvg = manualBeamSVG(fiber()); // no `bare` key at all — old saved scenes
  assert.match(legacySvg, /stroke-linecap="round"/);
  assert.match(legacySvg, /fill="#4d565f"/);
});

test('a bare fiber exposes every physics param a connectorized fiber has', () => {
  const bare = fiber({ bare: true, propagate: true });
  const withConnectors = fiber({ bare: false });
  const physicsKeys = ['propagate', 'inputNA', 'groupIndex', 'lossDbPerM', 'out0', 'out1'];
  for (const key of physicsKeys) {
    assert.ok(key in bare, `bare fiber is missing ${key}`);
    assert.deepEqual(bare[key], withConnectors[key], `${key} should behave identically for both variants`);
  }
});

test('the bare flag survives save/load and defaults to false for scenes saved before it existed', () => {
  const scene = parseSketch(file([], [
    { id: 'b1', ...fiber({ bare: true }) },
    { id: 'b2', ...fiber() }, // no bare key at all, as an old save would have
  ]), registry);
  assert.equal(scene.beams[0].bare, true);
  assert.equal(scene.beams[1].bare, false);
});

test('the palette offers a Fibers category with a distinct Fiber and Bare fiber tool', () => {
  assert.ok(categories.includes('Fibers'));
  assert.match(mainSource, /tool: 'fiber', label: 'Fiber'/);
  assert.match(mainSource, /tool: 'barefiber', label: 'Bare fiber'/);
  assert.match(mainSource, /startBeamTool\(item\.dataset\.tool\)/, 'clicking either fiber tool should start the matching draw mode');
});

test('the standalone Fiber toolbar button is gone', () => {
  assert.doesNotMatch(indexSource, /id="btnFiber"/);
  assert.doesNotMatch(mainSource, /btnFiber/);
});

test('drawing with the barefiber tool creates a fiber beam with bare set, sharing the same defaults as the connectorized tool', () => {
  assert.match(canvasSource, /drawing\.kindType === 'fiber' \|\| drawing\.kindType === 'barefiber'/);
  assert.match(canvasSource, /bare: drawing\.kindType === 'barefiber',/);
});

test('the beam leaving a fiber starts right at the output connector, not a couple mm downstream', () => {
  // Regression: the emitted cone used to start 2 mm past the tip point to
  // stay clear of the connector's own coupling geometry, leaving a visible
  // dead gap between the drawn fiber end and where the beam appeared to
  // begin. nearestHit() already ignores any surface within 0.05 mm of a
  // ray's own origin, so a much smaller push is enough.
  const laser = createElement('cwlaser', 0, 0);
  const pointB = { x: 200, y: 0 };
  const patch = fiber({ pts: [{ x: 100, y: 0 }, pointB] });
  const drawables = traceAll([laser], [patch]);

  const emitted = drawables.filter(d => d.type === 'path' && d.pts?.length
    && d.pts[0].x > pointB.x - 1 && Math.abs(d.pts[0].y) < 5);
  assert.ok(emitted.length, 'expected at least one drawn ray leaving the output connector');
  for (const d of emitted) {
    const gap = Math.hypot(d.pts[0].x - pointB.x, d.pts[0].y - pointB.y);
    assert.ok(gap < 0.5, `a ray started ${gap.toFixed(2)} mm from point B, expected well under 0.5 mm`);
  }
});
