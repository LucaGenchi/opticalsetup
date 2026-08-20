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

test('the gas cell extension tube is off by default and draws on the chosen side only', () => {
  const cell = createElement('gascell', 0, 0);
  assert.equal(cell.params.extension, false);
  assert.equal(cell.params.extensionSide, 'right');
  assert.doesNotMatch(registry.gascell.svg(cell), /fill="#8d98a5"/);

  cell.params.extension = true;
  const rightSvg = registry.gascell.svg(cell);
  assert.match(rightSvg, /<rect x="45"[^>]*fill="#8d98a5"/);

  cell.params.extensionSide = 'left';
  const leftSvg = registry.gascell.svg(cell);
  assert.match(leftSvg, /<rect x="-[\d.]+"[^>]*fill="#8d98a5"/);
});

test('the gas port arrow flips direction between outward and inward', () => {
  const cell = createElement('gascell', 0, 0);
  assert.equal(cell.params.gasDirection, 'out');
  const out = registry.gascell.svg(cell);
  assert.match(out, /<line x1="0" y1="-60.3" x2="0" y2="-48.3"/);

  cell.params.gasDirection = 'in';
  const inward = registry.gascell.svg(cell);
  assert.match(inward, /<line x1="0" y1="-48.3" x2="0" y2="-60.3"/);
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

test('the optical window transparency slider fades its glass fill', () => {
  const win = createElement('window', 0, 0);
  win.params.transparency = 0;
  assert.match(registry.window.svg(win), /fill-opacity="1\.00"/);

  win.params.transparency = 35;
  assert.match(registry.window.svg(win), /fill-opacity="0\.65"/);
});

test('the optical window resizes via optic length and tunes transparency on-canvas', () => {
  const direct = getDirectManipulation(createElement('window', 0, 0));
  assert.equal(direct.resize.y, 'length');
  assert.equal(direct.tune.key, 'transparency');
});
