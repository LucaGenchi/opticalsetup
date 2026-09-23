// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry, getSize, boxAnchor, getDirectManipulation } from '../sketch/js/elements.js';
import { displayOpacity, displayOrder, moveToEdge } from '../sketch/js/appearance.js';
import { state, parseSketch, replaceScene, serialize, pushUndo, undo, redo } from '../sketch/js/state.js';
import { buildSVG } from '../sketch/js/export.js';

test('laser housing length leaves emission, aperture position and optical surfaces unchanged', () => {
  for (const type of ['cwlaser', 'pulsedlaser', 'sclaser']) {
    const el = createElement(type);
    const rays = registry[type].source(el), surfaces = registry[type].surfaces(el);
    const height = getSize(el).h;
    for (const length of [20, 240, 500]) {
      el.params.housingLength = length;
      assert.deepEqual(registry[type].source(el), rays);
      assert.deepEqual(registry[type].surfaces(el), surfaces);
      assert.ok(Math.abs(getSize(el).w - length) < 1e-9);
      assert.equal(getSize(el).h, height);
      assert.ok(Math.abs(boxAnchor(el).x + getSize(el).w / 2 - 52) < 1e-9);
    }
    assert.equal(getDirectManipulation(el).resize.y, 'beamWidth');
    assert.equal(getDirectManipulation(el).resize.x, 'housingLength');
    const old = { ...el, params: { ...el.params } };
    delete old.params.housingLength;
    assert.equal(getSize(old).w, 104);
    for (const value of [NaN, Infinity, -200]) {
      el.params.housingLength = value;
      assert.ok(Number.isFinite(getSize(el).w) && getSize(el).w >= 20);
      assert.doesNotMatch(registry[type].svg(el), /NaN|Infinity/);
    }
  }
});

test('visual order and opacity persist, export and undo without changing simulation order', () => {
  const a = createElement('cwlaser', 0, 0), b = createElement('mirror', 150, 0);
  a.opacity = 25;
  a.params.housingLength = 200;
  replaceScene({ elements: [a, b], beams: [] }, { resetHistory: true });
  pushUndo();
  moveToEdge(state.elements, a, 'front');
  assert.deepEqual(state.elements.map(el => el.id), [a.id, b.id]);
  assert.deepEqual(displayOrder(state.elements).map(el => el.id), [b.id, a.id]);
  const loaded = parseSketch(serialize(), registry);
  assert.equal(loaded.elements[0].opacity, 25);
  assert.equal(loaded.elements[0].params.housingLength, 200);
  assert.deepEqual(displayOrder(loaded.elements).map(el => el.id), [b.id, a.id]);
  const svg = buildSVG();
  assert.match(svg, /rotate\(0\)" opacity="0.25"/);
  assert.ok(svg.indexOf('translate(150 0) rotate') < svg.indexOf('translate(0 0) rotate'));
  undo();
  assert.deepEqual(displayOrder(state.elements).map(el => el.id), [a.id, b.id]);
  redo();
  assert.deepEqual(displayOrder(state.elements).map(el => el.id), [b.id, a.id]);
  moveToEdge(state.elements, state.elements[0], 'back');
  assert.deepEqual(displayOrder(state.elements).map(el => el.id), [a.id, b.id]);
});

test('every component supports safe opacity including invisible and legacy values', () => {
  for (const type of Object.keys(registry)) {
    const el = createElement(type);
    assert.equal(displayOpacity(el), 1);
    el.opacity = 0;
    assert.equal(displayOpacity(el), 0);
    el.opacity = 50;
    assert.equal(displayOpacity(el), 0.5);
  }
  const el = createElement('cwlaser');
  el.opacity = -20;
  el.displayOrder = Infinity;
  const loaded = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [el], beams: [] }), registry).elements[0];
  assert.equal(loaded.opacity, 0);
  assert.equal(loaded.displayOrder, 0);
  assert.equal(displayOpacity({ opacity: NaN }), 1);
  assert.equal(displayOpacity({ opacity: 200 }), 1);
});
