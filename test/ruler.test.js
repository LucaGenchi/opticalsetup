// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, getElementMeta, getVisualBounds, registry } from '../sketch/js/elements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';
import { buildSVG } from '../sketch/js/export.js';
import {
  rulerConstrainOrigin, rulerEditCandidate, rulerFromWorldPoints, rulerHitTest, rulerLabelText,
  rulerLocalBounds, rulerMeasurement, rulerPoints, rulerSVG, rulerTickStep, rulerValueText,
} from '../sketch/js/ruler.js';

const close = (actual, expected, tolerance = 1e-9, message) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, message || `${actual} is not within ${tolerance} of ${expected}`);
const world = el => rulerPoints(el.params).map(p => {
  const a = (el.rot || 0) * Math.PI / 180;
  return { x: el.x + p.x * Math.cos(a) - p.y * Math.sin(a), y: el.y + p.x * Math.sin(a) + p.y * Math.cos(a) };
});
const allFinite = svg => !/NaN|Infinity/.test(svg);
const makeRuler = (x, y, rot = 0, params = {}) => {
  const el = createElement('ruler', x, y);
  el.rot = rot;
  Object.assign(el.params, params);
  return el;
};

test('a ruler is diagram-only: rays and readings are the same with or without it', () => {
  const laser = createElement('cwlaser', 0, 0);
  const detector = createElement('detector', 300, 0);
  const ruler = createElement('ruler', 150, 0);
  const angle = createElement('ruler', 150, 0);
  angle.params.mode = 'angle';
  assert.deepEqual(registry.ruler.surfaces(ruler), []);
  assert.deepEqual(registry.ruler.surfaces(angle), []);
  const bare = traceScene([laser, detector], []).drawables;
  const reading = detectorReading(detector.id).signal;
  assert.deepEqual(traceScene([laser, ruler, angle, detector], []).drawables, bare);
  assert.equal(detectorReading(detector.id).signal, reading);
  assert.equal(getElementMeta('ruler').tier, 'diagram');
});

test('a distance ruler reads the straight distance between its two ends', () => {
  const el = makeRuler(10, 20, 30);
  el.params.len = 80;
  const [a, b] = world(el);
  close(Math.hypot(b.x - a.x, b.y - a.y), 80);
  close((a.x + b.x) / 2, 10);
  close((a.y + b.y) / 2, 20);
  assert.deepEqual(rulerMeasurement(el.params), { kind: 'distance', value: 80, unit: 'mm' });
  assert.equal(rulerValueText(el.params), '80.0 mm');
  assert.equal(rulerValueText({ ...el.params, decimals: 3 }), '80.000 mm');
  assert.equal(rulerValueText({ ...el.params, decimals: 0 }), '80 mm');
});

test('dragging one end moves only that end; the other stays where it is on the bench', () => {
  const el = makeRuler(0, 0, 0);
  el.params.len = 100;
  const [fixed] = world(el);
  const next = rulerEditCandidate(el, 1, { x: 50, y: -50 });
  const moved = { ...el, x: next.x, y: next.y, rot: next.rot, params: { ...el.params, ...next.params } };
  const [a, b] = world(moved);
  close(a.x, fixed.x, 1e-9); close(a.y, fixed.y, 1e-9);
  // The length is kept to a thousandth, so the dragged end lands within
  // half a micrometre of the pointer.
  close(b.x, 50, 5e-4); close(b.y, -50, 5e-4);
  assert.equal(moved.params.len, 111.803);
  // y points down on the canvas, so a rise of 50 over 100 is a turn of −26.6°.
  close(moved.rot, 360 + Math.atan2(-50, 100) * 180 / Math.PI, 1e-9);
  // Dragging the first end keeps the second one exactly instead.
  const other = rulerEditCandidate(el, 0, { x: -30, y: 20 });
  const turned = { ...el, x: other.x, y: other.y, rot: other.rot, params: { ...el.params, ...other.params } };
  const [, keptB] = world(turned);
  const [, startB] = world(el);
  close(keptB.x, startB.x, 1e-9); close(keptB.y, startB.y, 1e-9);
});

test('an end dragged onto the other one, or off to infinity, is refused', () => {
  const el = makeRuler(0, 0, 0);
  el.params.len = 100;
  assert.equal(rulerEditCandidate(el, 1, { x: -50, y: 0 }), null, 'zero length has no direction');
  assert.equal(rulerEditCandidate(el, 1, { x: Infinity, y: 0 }), null);
  assert.equal(rulerEditCandidate(el, 1, { x: NaN, y: 0 }), null);
  assert.equal(rulerEditCandidate(el, 5, { x: 0, y: 0 }), null, 'no such handle');
  assert.equal(rulerEditCandidate(el, 1, { x: 6000, y: 0 }), null, 'beyond the length bound');
  assert.equal(rulerFromWorldPoints('distance', [{ x: 0, y: 0 }]), null);
});

test('an angle ruler reads the angle between its arms, and its sign says which way arm 2 opens', () => {
  // Arm 1 to the right, arm 2 straight up on screen: a quarter turn
  // counterclockwise, so +90.
  const ccw = rulerFromWorldPoints('angle', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: -20 }]);
  close(ccw.params.angle, 90);
  close(ccw.params.armA, 10); close(ccw.params.armB, 20);
  assert.equal(ccw.rot, 0);
  const cw = rulerFromWorldPoints('angle', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 20 }]);
  close(cw.params.angle, -90);
  assert.equal(rulerMeasurement({ mode: 'angle', angle: -90 }).value, 90, 'the reading is the size of the angle');
  // Straight back along arm 1 is half a turn, never −180.
  const straight = rulerFromWorldPoints('angle', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: -10, y: 0 }]);
  close(straight.params.angle, 180);
  // A turned ruler keeps its angle: its points round-trip through the bench.
  const el = makeRuler(40, -30, 200);
  Object.assign(el.params, { mode: 'angle', angle: 37.5, armA: 60, armB: 45 });
  const back = rulerFromWorldPoints('angle', world(el));
  close(back.x, 40, 1e-9); close(back.y, -30, 1e-9); close(back.rot, 200, 1e-9);
  close(back.params.angle, 37.5, 1e-9); close(back.params.armA, 60, 1e-9); close(back.params.armB, 45, 1e-9);
  assert.equal(rulerValueText(el.params), '37.5°');
});

test('moving an angle ruler\'s vertex keeps both arm tips on the bench', () => {
  const el = makeRuler(0, 0, 0);
  Object.assign(el.params, { mode: 'angle', angle: 90, armA: 50, armB: 50 });
  const [, tipA, tipB] = world(el);
  const next = rulerEditCandidate(el, 0, { x: 10, y: -10 });
  const moved = { ...el, x: next.x, y: next.y, rot: next.rot, params: { ...el.params, ...next.params } };
  const [, a, b] = world(moved);
  close(moved.x, 10, 1e-12); close(moved.y, -10, 1e-12);
  close(a.x, tipA.x, 1e-3); close(a.y, tipA.y, 1e-3);
  close(b.x, tipB.x, 1e-3); close(b.y, tipB.y, 1e-3);
  // From (10,−10), between the arms, each tip lies 40 along and 10 back
  // across, so the angle opens past a right angle.
  close(moved.params.armA, Math.hypot(40, 10), 5e-4);
  close(moved.params.angle, 90 + 2 * Math.atan2(10, 40) * 180 / Math.PI, 5e-4);
  for (const key of ['armA', 'armB', 'angle']) {
    assert.equal(moved.params[key], Math.round(moved.params[key] * 1000) / 1000, `${key} is kept to a thousandth`);
  }
  assert.equal(rulerEditCandidate(el, 1, { x: 0, y: 0 }), null, 'an arm of zero length is refused');
});

test('a Shift-drag keeps to steps around the partner handle', () => {
  const distance = makeRuler(0, 0, 0);
  assert.deepEqual(rulerConstrainOrigin(distance, 0), rulerPoints(distance.params)[1]);
  assert.deepEqual(rulerConstrainOrigin(distance, 1), rulerPoints(distance.params)[0]);
  const angle = makeRuler(0, 0, 0);
  angle.params.mode = 'angle';
  assert.deepEqual(rulerConstrainOrigin(angle, 2), { x: 0, y: 0 }, 'an arm turns about the vertex');
  assert.equal(rulerConstrainOrigin(angle, 0), null, 'the vertex has no partner');
});

test('{value} in the label becomes the measurement, written as TeX inside a formula', () => {
  const p = { mode: 'distance', len: 100, decimals: 1 };
  assert.equal(rulerLabelText({ ...p, text: '{value}' }), '100.0 mm');
  assert.equal(rulerLabelText({ ...p, text: 'L = {value}' }), 'L = 100.0 mm');
  assert.equal(rulerLabelText({ ...p, text: '$f = {value}$' }), '$f = 100.0\\,\\mathrm{mm}$');
  assert.equal(rulerLabelText({ ...p, text: '$d_1$ = {value}' }), '$d_1$ = 100.0 mm', 'outside the formula it stays prose');
  assert.equal(rulerLabelText({ ...p, text: '$$x = {value}$$' }), '$$x = 100.0\\,\\mathrm{mm}$$');
  assert.equal(rulerLabelText({ ...p, text: '$2f$' }), '$2f$', 'no token, no number');
  assert.equal(rulerLabelText({ ...p, text: '{value} and {value}' }), '100.0 mm and 100.0 mm');
  assert.equal(rulerLabelText({ mode: 'angle', angle: -30, decimals: 0, text: '$\\theta = {value}$' }), '$\\theta = 30\\degree$');
  assert.equal(rulerLabelText({ mode: 'angle', angle: 30, decimals: 0, text: '{value}' }), '30°');
});

test('the label is drawn as Markdown and LaTeX text, never as foreignObject', () => {
  const svg = rulerSVG({ mode: 'distance', len: 100, text: '**Path** $f = {value}$' });
  assert.match(svg, /class="markdown-label"/);
  assert.match(svg, /font-weight="700"[^>]*>Path</, 'Markdown emphasis survives');
  assert.match(svg, /STIX Two Text/, 'the formula is set in the math face');
  assert.match(svg, />mm</, 'the unit is its own upright run');
  assert.doesNotMatch(svg, /foreignObject/);
  assert.doesNotMatch(rulerSVG({ text: '' }), /ruler-label/, 'an empty label draws nothing');
  assert.doesNotMatch(rulerSVG({ text: '<script>x</script>' }), /<script>/, 'raw HTML is escaped');
});

test('a distance label stays readable when the ruler points left', () => {
  const upright = rulerSVG({ len: 100 }, { rot: 0 });
  const left = rulerSVG({ len: 100 }, { rot: 180 });
  assert.match(upright, /rotate\(0\)/);
  assert.match(left, /rotate\(180\)/);
  // Flipped, the label moves to the other local side, so it is still above
  // the line on screen.
  const b0 = rulerLocalBounds({ len: 100 }, 0), b180 = rulerLocalBounds({ len: 100 }, 180);
  assert.ok(b0.y0 < -10 && b180.y1 > 10);
  const below = rulerLocalBounds({ len: 100, labelSide: 'below' }, 0);
  assert.ok(below.y1 > 10 && below.y0 > -10);
});

test('hit testing grabs the lines and the label, not what an angle ruler encloses', () => {
  const p = { mode: 'angle', angle: 90, armA: 80, armB: 80, text: '' };
  assert.ok(rulerHitTest(p, { x: 40, y: 1 }, 4), 'on arm 1');
  assert.ok(rulerHitTest(p, { x: 1, y: -40 }, 4), 'on arm 2');
  assert.equal(rulerHitTest(p, { x: 60, y: -60 }, 4), false, 'between the arms');
  assert.equal(rulerHitTest(p, { x: NaN, y: 0 }, 4), false);
  const d = { mode: 'distance', len: 100, text: '{value}' };
  assert.ok(rulerHitTest(d, { x: 0, y: 2 }, 4));
  assert.ok(rulerHitTest(d, { x: 0, y: -16 }, 4), 'on the label above the line');
  assert.equal(rulerHitTest(d, { x: 0, y: 40 }, 4), false);
});

test('graduation ticks use a 1-2-5 step of about ten divisions', () => {
  assert.equal(rulerTickStep(100), 10);
  assert.equal(rulerTickStep(37), 5);
  assert.equal(rulerTickStep(2.4), 0.2);
  assert.equal(rulerTickStep(800), 100);
  const svg = rulerSVG({ len: 100, ticks: true });
  assert.equal((svg.match(/ V 0/g) || []).length, 9, 'inner ticks only; the ends carry their bars');
  assert.doesNotMatch(rulerSVG({ len: 100, ticks: false }), / V 0/);
});

test('arrowheads are left off a line too short to hold them', () => {
  assert.equal((rulerSVG({ len: 100, text: '' }).match(/<path/g) || []).length, 2);
  assert.equal((rulerSVG({ len: 100, arrows: false, text: '' }).match(/<path/g) || []).length, 0);
  assert.equal((rulerSVG({ len: 5, text: '' }).match(/<path/g) || []).length, 0);
});

test('malformed or extreme params still draw finite geometry', () => {
  for (const params of [
    {}, { len: NaN, angle: Infinity, armA: -5, armB: 1e12, decimals: 99, width: -1, fontSize: 1000 },
    { mode: 'angle', angle: 0, armA: 0.1, armB: 0.1 }, { mode: 'angle', angle: 180 }, { mode: 'bogus', len: 0 },
  ]) {
    for (const rot of [0, 90, 135, 270, 359.9]) {
      assert.ok(allFinite(rulerSVG(params, { rot })), JSON.stringify(params));
      const b = rulerLocalBounds(params, rot);
      assert.ok([b.x0, b.y0, b.x1, b.y1].every(Number.isFinite), JSON.stringify(params));
    }
  }
});

test('a saved ruler is normalized on load, clamping out-of-range numbers', () => {
  const scene = parseSketch({
    elements: [{
      type: 'ruler', x: 0, y: 0, rot: 10,
      params: { mode: 'angle', angle: 720, armA: -3, armB: 'x', text: 42, decimals: 9, fill: 'red' },
    }],
  }, registry);
  const p = scene.elements[0].params;
  assert.equal(p.mode, 'angle');
  assert.equal(p.angle, 180);
  assert.equal(p.armA, 0.1);
  assert.equal(p.armB, 80);
  assert.equal(p.text, '{value}');
  assert.equal(p.decimals, 3);
  assert.equal(p.fill, '#334155');
  assert.equal(p.ticks, false);
});

test('the export contains the ruler and its label inside the fitted bounds', () => {
  const saved = state.elements;
  try {
    const ruler = makeRuler(0, 0, 0);
    ruler.params.text = '$L = {value}$';
    state.elements = [ruler];
    const out = buildSVG();
    assert.match(out, /class="ruler-label"/);
    assert.match(out, /100\.0/);
    const [x, y, w, h] = out.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    const b = getVisualBounds(ruler);
    assert.ok(x <= b.x0 && y <= b.y0 && x + w >= b.x1 && y + h >= b.y1);
    assert.ok(b.y0 < -10, 'the label above the line is part of the bounds');
  } finally {
    state.elements = saved;
  }
});
