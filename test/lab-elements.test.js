import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry, categories, getElementMeta, getDirectManipulation } from '../sketch/js/elements.js';

const GLASS_FILL = 'fill="#c9e4f5"';

// ---------------- Lab elements category ----------------

test('Lab elements is registered as the last category', () => {
  assert.equal(categories[categories.length - 1], 'Lab elements');
});

// ---------------- gas cell ----------------

test('the gas cell is a diagram-only element that never touches rays', () => {
  const cell = createElement('gascell', 0, 0);
  assert.equal(cell.type, 'gascell');
  assert.equal(registry.gascell.category, 'Lab elements');
  assert.equal(registry.gascell.surfaces(cell).length, 0);
  assert.equal(getElementMeta('gascell', cell.params).tier, 'diagram');
});

test('the gas cell end windows are off by default and toggle independently per side', () => {
  const cell = createElement('gascell', 0, 0);
  assert.equal(cell.params.windowLeft, false);
  assert.equal(cell.params.windowRight, false);
  assert.doesNotMatch(registry.gascell.svg(cell), new RegExp(GLASS_FILL));

  cell.params.windowLeft = true;
  const leftOnly = registry.gascell.svg(cell);
  assert.match(leftOnly, new RegExp(GLASS_FILL));
  assert.equal((leftOnly.match(new RegExp(GLASS_FILL, 'g')) || []).length, 1);

  cell.params.windowRight = true;
  const both = registry.gascell.svg(cell);
  assert.equal((both.match(new RegExp(GLASS_FILL, 'g')) || []).length, 2);
});

test('the gas cell extension tube is off by default and draws as an open pair of rails on the chosen side', () => {
  const cell = createElement('gascell', 0, 0);
  assert.equal(cell.params.extension, false);
  assert.equal(cell.params.extensionSide, 'right');
  assert.doesNotMatch(registry.gascell.svg(cell), /stroke="#7a5f28" stroke-width="2.5"/);

  cell.params.extension = true;
  const rightSvg = registry.gascell.svg(cell);
  // no wall at the far (output) end -- just two parallel rails from the
  // housing edge (x=45) out to the open end (x=81), never a closing rect.
  // The rails carry the same casing color as the housing outline so the
  // extension reads as a continuation of it, not a separate grey pipe.
  assert.match(rightSvg, /<line x1="45" y1="-11" x2="81" y2="-11" stroke="#7a5f28" stroke-width="2.5"/);
  assert.match(rightSvg, /<line x1="45" y1="11" x2="81" y2="11" stroke="#7a5f28" stroke-width="2.5"/);
  assert.doesNotMatch(rightSvg, /<rect[^>]*fill="#8d98a5"/);
  // the housing's own brass fill extends into the tube between the rails,
  // so the two chambers read as one continuous filled body when joined.
  assert.match(rightSvg, /<rect x="45" y="-11" width="36" height="22" fill="#b8933f"/);

  cell.params.extensionSide = 'left';
  const leftSvg = registry.gascell.svg(cell);
  assert.match(leftSvg, /<line x1="-81" y1="-11" x2="-45" y2="-11"/);
  assert.match(leftSvg, /<line x1="-81" y1="11" x2="-45" y2="11"/);
});

test('the housing outline keeps its rounded corners and only gaps the wall between the extension rails', () => {
  const cell = createElement('gascell', 0, 0);
  const closed = registry.gascell.svg(cell);
  assert.match(closed, /A 6 6 0 0 1 45 -21.5/, 'a normal (no extension) cell keeps its top-right corner');
  assert.match(closed, /A 6 6 0 0 1 39 27.5/, 'and its bottom-right corner');
  assert.match(closed, /L 45 21.5/, 'and a single unbroken right wall');

  cell.params.extension = true;
  cell.params.extensionSide = 'right';
  const rightOpenSvg = registry.gascell.svg(cell);
  // corners (and the stretch from each corner down to the rail) survive --
  // only the middle strip level with the tube rails (y -11..11) opens up.
  assert.match(rightOpenSvg, /A 6 6 0 0 1 45 -21.5/, 'the top-right corner still rounds normally');
  assert.match(rightOpenSvg, /A 6 6 0 0 1 39 27.5/, 'the bottom-right corner still rounds normally');
  assert.match(rightOpenSvg, /L 45 -11 M 45 11 L 45 21.5/, 'the wall gap lines up exactly with the tube rails');

  cell.params.extensionSide = 'left';
  const leftOpenSvg = registry.gascell.svg(cell);
  assert.match(leftOpenSvg, /A 6 6 0 0 1 -45 21.5/, 'the bottom-left corner still rounds normally');
  assert.match(leftOpenSvg, /L -45 11 M -45 -11 L -45 -21.5/, 'the left wall gap lines up with the tube rails too');
});

test('the gas port sits off-center, clear of the pressure gauge and rotate handle', () => {
  const cell = createElement('gascell', 0, 0);
  const svg = registry.gascell.svg(cell);
  assert.match(svg, /<line x1="22.5"/, 'the port should be offset toward 3/4 width, not centered at x=0');
});

test('the gas port arrow flips direction between outward and inward', () => {
  const cell = createElement('gascell', 0, 0);
  assert.equal(cell.params.gasDirection, 'out');
  const out = registry.gascell.svg(cell);
  assert.match(out, /<line x1="22.5" y1="-49.5" x2="22.5" y2="-37.5"/);

  cell.params.gasDirection = 'in';
  const inward = registry.gascell.svg(cell);
  assert.match(inward, /<line x1="22.5" y1="-37.5" x2="22.5" y2="-49.5"/);
});

test('a closed gas port draws the valve stem but no arrow', () => {
  const cell = createElement('gascell', 0, 0);
  cell.params.gasDirection = 'closed';
  const svg = registry.gascell.svg(cell);
  assert.match(svg, /fill="#6b7280" stroke="#3f4650"/, 'the valve stem body should still be drawn');
  assert.doesNotMatch(svg, /stroke="#1361fa"/, 'no arrow line for a closed port');
  assert.doesNotMatch(svg, /fill="#1361fa"/, 'no arrowhead for a closed port');
});

test('the gas cell transparency slider fades the housing fill without touching the strokes', () => {
  const cell = createElement('gascell', 0, 0);
  cell.params.transparency = 0;
  assert.match(registry.gascell.svg(cell), /fill-opacity="1\.00"/);

  cell.params.transparency = 60;
  const svg = registry.gascell.svg(cell);
  assert.match(svg, /fill-opacity="0\.40"/);
  assert.match(svg, /stroke="#7a5f28" stroke-width="2"/, 'the housing outline must stay fully opaque');
});

test('the gas cell transparency slider now reaches a fully invisible fill, leaving the outline opaque', () => {
  const cell = createElement('gascell', 0, 0);
  const field = registry.gascell.params.find(f => f.key === 'transparency');
  assert.equal(field.max, 100);

  cell.params.transparency = 100;
  const svg = registry.gascell.svg(cell);
  assert.match(svg, /fill-opacity="0\.00"/, 'the inner fill can go fully transparent');
  assert.match(svg, /<path d="[^"]+" fill="none" stroke="#7a5f28" stroke-width="2"\/>/, 'the outline stays a solid, fully opaque contour');
});

test('the gas cell resizes via length/height and tunes transparency on-canvas', () => {
  const direct = getDirectManipulation(createElement('gascell', 0, 0));
  assert.equal(direct.resize.x, 'length');
  assert.equal(direct.resize.y, 'height');
  assert.equal(direct.tune.key, 'transparency');
});

// ---------------- optical window ----------------

test('the optical window is a diagram-only element that never touches rays', () => {
  const win = createElement('window', 0, 0);
  assert.equal(registry.window.category, 'Lab elements');
  assert.equal(registry.window.surfaces(win).length, 0);
  assert.equal(getElementMeta('window', win.params).tier, 'diagram');
});

test('the optical window transparency slider fades its glass fill, up to fully invisible', () => {
  const win = createElement('window', 0, 0);
  const field = registry.window.params.find(f => f.key === 'transparency');
  assert.equal(field.max, 100);

  win.params.transparency = 0;
  assert.match(registry.window.svg(win), /fill-opacity="1\.00"/);

  win.params.transparency = 35;
  assert.match(registry.window.svg(win), /fill-opacity="0\.65"/);

  win.params.transparency = 100;
  const svg = registry.window.svg(win);
  assert.match(svg, /fill-opacity="0\.00"/);
  assert.match(svg, /stroke="#4a90c4" stroke-width="1.5"/, 'the glass edge outline stays fully opaque');
});

test('the optical window resizes via optic length and tunes transparency on-canvas', () => {
  const direct = getDirectManipulation(createElement('window', 0, 0));
  assert.equal(direct.resize.y, 'length');
  assert.equal(direct.tune.key, 'transparency');
});
