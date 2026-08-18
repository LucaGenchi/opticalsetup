import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry, getVisualBounds, boxAnchor, getElementMeta, getDirectManipulation } from '../sketch/js/elements.js';

// ---------------- text label: left-anchored, grows rightward ----------------

test('a text label anchors its left edge and grows to the right as text is typed', () => {
  const label = createElement('textlabel', 100, 50);
  const svg = registry.textlabel.svg(label);
  assert.match(svg, /text-anchor="start"/, 'text should hang off its left edge, not be centered on the drop point');
  assert.match(svg, /x="0"/, 'text starts exactly at the element origin');

  const shortBounds = getVisualBounds(label);
  label.params.text = 'A much, much longer label than before';
  const longBounds = getVisualBounds({ ...label });

  assert.equal(shortBounds.x0, longBounds.x0, 'the left edge must not move as the text grows');
  assert.ok(longBounds.x1 > shortBounds.x1, 'the box should only expand to the right');
});

test('boxAnchor is the identity offset for every element type except the left-anchored text label', () => {
  const laser = createElement('laser', 0, 0);
  assert.deepEqual(boxAnchor(laser), { x: 0, y: 0 });

  const label = createElement('textlabel', 0, 0);
  const off = boxAnchor(label);
  assert.equal(off.y, 0);
  assert.ok(off.x > 0, 'the left-anchored box center sits to the right of the element origin');
  assert.equal(off.x, registry.textlabel.size(label).w / 2);
});

// ---------------- figure frame + highlight: anchor-corner resize wiring ----------------

test('the figure frame and highlight both declare corner-anchored resize, not center-scaling', () => {
  // Regression: dragging one corner used to scale both edges out from the
  // fixed center, so pulling the top-right corner right also grew the box
  // leftward. anchor: true tells canvas.js to keep the opposite corner
  // fixed in world space instead.
  const frame = getDirectManipulation(createElement('figureframe', 0, 0));
  assert.equal(frame.resize.anchor, true);
  assert.equal(frame.resize.x, 'w');
  assert.equal(frame.resize.y, 'h');

  const highlight = getDirectManipulation(createElement('highlight', 0, 0));
  assert.equal(highlight.resize.anchor, true);
});

// ---------------- highlight annotation ----------------

test('the highlight annotation is a background-only shape that never touches rays', () => {
  const h = createElement('highlight');
  assert.equal(h.params.shape, 'rect');
  assert.equal(registry.highlight.surfaces(h).length, 0);
  assert.equal(getElementMeta('highlight', h.params).tier, 'diagram');
});

test('a rectangular highlight hit-tests its full filled area, and a circular one is elliptical', () => {
  const rect = createElement('highlight');
  rect.params.w = 100; rect.params.h = 40;
  assert.equal(registry.highlight.hitTest(rect, { x: 40, y: 15 }, 0), true, 'inside the rectangle');
  assert.equal(registry.highlight.hitTest(rect, { x: 49, y: 19 }, 0), true, 'near the rectangle corner, still inside');
  assert.equal(registry.highlight.hitTest(rect, { x: 60, y: 0 }, 0), false, 'outside the rectangle width');

  const circle = createElement('highlight');
  circle.params.shape = 'circle';
  circle.params.w = 100; circle.params.h = 100;
  assert.equal(registry.highlight.hitTest(circle, { x: 35, y: 35 }, 0), true, 'inside the inscribed circle');
  assert.equal(registry.highlight.hitTest(circle, { x: 48, y: 48 }, 0), false, 'inside the bounding box but outside the circle');
});

test('the highlight shape renders with the configured fill and opacity, both shapes', () => {
  const rect = createElement('highlight');
  rect.params.fill = '#112233';
  rect.params.opacity = 40;
  const rectSvg = registry.highlight.svg(rect);
  assert.match(rectSvg, /<rect /);
  assert.match(rectSvg, /fill="#112233"/);
  assert.match(rectSvg, /fill-opacity="0\.4"/);

  const circle = createElement('highlight');
  circle.params.shape = 'circle';
  const circleSvg = registry.highlight.svg(circle);
  assert.match(circleSvg, /<ellipse /);
});

test('a highlight can carry a label like any other element', () => {
  const h = createElement('highlight');
  assert.equal(registry.highlight.noLabel, undefined, 'highlight must not opt out of the standard label system');
});
