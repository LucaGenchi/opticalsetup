// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, getDirectManipulation, getElementMeta, getVisualBounds, registry } from '../sketch/js/elements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';
import { buildSVG } from '../sketch/js/export.js';
import { fieldDisplayValue } from '../sketch/js/inspector.js';
import {
  rulerAxisPaths, rulerClampDirection, rulerClampPoint, rulerClampTargets, rulerEditCandidate, rulerFromWorldPoints, rulerHandleDrag, rulerHitTest, rulerLabelText,
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
  close(b.x, 50, 1e-9); close(b.y, -50, 1e-9);
  close(moved.params.len, Math.hypot(100, 50));
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

test('the inspector shows dragged geometry to a thousandth without changing it', () => {
  assert.equal(fieldDisplayValue(223.97321265, { displayDecimals: 3 }), 223.973);
  assert.equal(fieldDisplayValue(-147.2648, { displayDecimals: 3 }), -147.265);
  assert.equal(fieldDisplayValue(223.97321265, {}), 223.97321265, 'other fields are shown as stored');
  assert.equal(fieldDisplayValue(-5, { negative: true }), 5);
  assert.ok(Number.isNaN(fieldDisplayValue(NaN, { displayDecimals: 3 })));
  for (const key of ['len', 'angle', 'armA', 'armB']) {
    assert.equal(registry.ruler.params.find(p => p.key === key).displayDecimals, 3, key);
  }
});

test('{value} between two formulas stays prose, as the renderer reads it', () => {
  // Review of #308: "$x$ = {value}; $y$" used to pair the closing $ of the
  // first formula with the opening $ of the second.
  const p = { mode: 'distance', len: 100, decimals: 1 };
  assert.equal(rulerLabelText({ ...p, text: '$x$ = {value}; $y$' }), '$x$ = 100.0 mm; $y$');
  assert.equal(rulerLabelText({ ...p, text: 'Costs $5 and {value}' }), 'Costs $5 and 100.0 mm', 'a price opens no formula');
  assert.equal(rulerLabelText({ ...p, text: '`$a {value}$`' }), '`$a 100.0 mm$`', 'a code span is never a formula');
  assert.equal(rulerLabelText({ ...p, text: '$a$\n$b = {value}$' }), '$a$\n$b = 100.0\\,\\mathrm{mm}$', 'formulas do not pair across lines');
  const svg = rulerSVG({ ...p, text: '$x$ = {value}; $y$' });
  assert.doesNotMatch(svg, /mathrm|\\,/, 'no TeX command is drawn as text');
});

test('a short display formula is boxed where it is drawn', () => {
  // Review of #308: a $$x$$ line is centred inside a 30 px layout, so its
  // bounds and hit area must follow the indent, not start at zero.
  const params = { mode: 'angle', angle: 0, armA: 0.1, armB: 0.1, text: '$$x$$', fontSize: 12 };
  const svg = rulerSVG(params);
  const [, tx] = svg.match(/class="ruler-label" transform="translate\(([-\d.]+) /);
  const [, shift] = svg.match(/rotate\([-\d.]+\) translate\(([-\d.]+) 0\)/);
  const [, indent] = svg.match(/class="markdown-label"[^>]*><text x="([-\d.]+)"/);
  const textCenter = Number(tx) + Number(shift) + Number(indent);
  const b = rulerLocalBounds(params, 0);
  assert.ok(textCenter > b.x0 && textCenter < b.x1, `text at ${textCenter} lies inside ${b.x0}…${b.x1}`);
  assert.ok(rulerHitTest(params, { x: textCenter + 2, y: 0 }, 1), 'the drawn text is grabbable');
});

test('a distance end left exactly on a length bound still lets the other one move', () => {
  // Review of #308: rebuilt from bench coordinates a length came back as
  // 0.09999999999999432 or 5000.000000000001 and the drag was refused.
  for (const rot of [0, 45, 137]) {
    for (const len of [0.1, 5000]) {
      const el = makeRuler(380, 220, rot, { len });
      const [, b] = world(el);
      const next = rulerEditCandidate(el, 0, rulerPoints(el.params)[0]);
      assert.ok(next, `len ${len} at ${rot}° is accepted`);
      close(next.params.len, len, 1e-9, `length ${next.params.len} stays at its bound`);
      assert.ok(next.params.len >= 0.1 && next.params.len <= 5000, 'and inside the schema');
      const moved = { ...el, ...next, params: { ...el.params, ...next.params } };
      close(world(moved)[1].x, b.x, 1e-9); close(world(moved)[1].y, b.y, 1e-9);
    }
  }
  assert.ok(rulerEditCandidate(makeRuler(380, 220, 45, { len: 5000 }), 1, { x: 2500, y: 0 }), 'a 5000 mm distance can be re-aimed');
  // Clearly beyond a bound is still refused.
  assert.equal(rulerFromWorldPoints('distance', [{ x: 0, y: 0 }, { x: 5000.01, y: 0 }]), null);
  assert.equal(rulerFromWorldPoints('distance', [{ x: 0, y: 0 }, { x: 0.0999, y: 0 }]), null);
  assert.equal(rulerFromWorldPoints('angle', [{ x: 0, y: 0 }, { x: 5001, y: 0 }, { x: 0, y: 10 }]), null);
});

test('coordinates near the largest finite number never produce Infinity', () => {
  // Review of #308: (a.x + b.x) / 2 overflowed for two close ends at 1e308.
  const next = rulerFromWorldPoints('distance', [{ x: 1e308, y: 0 }, { x: 1e308, y: 100 }]);
  assert.ok(next && [next.x, next.y, next.rot, next.params.len].every(Number.isFinite), JSON.stringify(next));
  assert.equal(next.x, 1e308);
  assert.equal(next.params.len, 100);
  const far = makeRuler(1.7e308, 0, 0, { len: 100 });
  const candidate = rulerEditCandidate(far, 1, { x: 50, y: 20 });
  assert.ok(candidate === null || [candidate.x, candidate.y, candidate.rot, candidate.params.len].every(Number.isFinite));
  assert.equal(rulerFromWorldPoints('distance', [{ x: -1.7e308, y: 0 }, { x: 1.7e308, y: 0 }]), null, 'an overflowing length is refused');
});

const applied = (el, result) => ({ ...el, x: result.candidate.x, y: result.candidate.y, rot: result.candidate.rot, params: { ...el.params, ...result.candidate.params } });
const grid = value => Math.round(value / 25) * 25;

test('dragging an arm tip only turns that arm: smooth, its length kept, the other arm still', () => {
  const el = makeRuler(380, 220, 0, { mode: 'angle', angle: 90, armA: 80, armB: 5000 });
  const [vertex, , tipB] = world(el);
  // Grid snapping is on, but an arm turns continuously: no 25 mm jumps.
  const result = rulerHandleDrag(el, 1, { x: 380 + 70, y: 220 - 45 }, { snapGrid: grid, tolerance: 0 });
  const moved = applied(el, result);
  assert.equal(moved.params.armA, 80, 'arm 1 keeps its length');
  assert.equal(moved.params.armB, 5000);
  const [v, a, b] = world(moved);
  close(v.x, vertex.x, 1e-12); close(v.y, vertex.y, 1e-12);
  close(b.x, tipB.x, 1e-9); close(b.y, tipB.y, 1e-9);
  // Arm 1 now points at the pointer, 80 mm out.
  close(Math.atan2(a.y - v.y, a.x - v.x), Math.atan2(-45, 70), 1e-12);
  close(Math.hypot(a.x - v.x, a.y - v.y), 80, 1e-9);
  // Arm 1 turned toward arm 2, so the angle between them closes.
  close(moved.params.angle, 90 - Math.atan2(45, 70) * 180 / Math.PI, 1e-9);
  // Dragging arm 2 changes only the angle; rot and lengths stay.
  const second = applied(el, rulerHandleDrag(el, 2, { x: 380 - 10, y: 220 - 10 }, { snapGrid: grid }));
  assert.equal(second.rot, 0);
  close(second.params.angle, 135, 1e-9);
  assert.equal(second.params.armB, 5000);
  assert.equal(rulerHandleDrag(el, 2, { x: 380, y: 220 }), null, 'a pointer on the vertex has no direction');
});

test('auto clamp lays an arm along a beam axis through the vertex, or toward a component', () => {
  // A beam arrives from the left and folds upwards at the vertex.
  const targets = {
    points: [{ x: 300, y: 100, label: 'Lens' }],
    lines: [
      { a: { x: 0, y: 200 }, b: { x: 200, y: 200 }, label: 'beam axis' },
      { a: { x: 200, y: 200 }, b: { x: 200, y: 0 }, label: 'beam axis' },
      { a: { x: 0, y: 260 }, b: { x: 400, y: 260 }, label: 'beam axis' },   // passes 60 mm below
    ],
  };
  const el = makeRuler(200, 200, 180, { mode: 'angle', angle: -45, armA: 60, armB: 60 });
  const up = rulerHandleDrag(el, 2, { x: 205, y: 140 }, { targets, tolerance: 8 });
  assert.equal(up.label, 'beam axis');
  close(applied(el, up).params.angle, -90, 1e-9, 'clicked exactly onto the folded beam');
  assert.ok(up.guide, 'the canvas draws the line it clicked onto');
  const back = rulerHandleDrag(el, 1, { x: 140, y: 196 }, { targets, tolerance: 8 });
  assert.equal(back.label, 'beam axis');
  close(applied(el, back).rot, 180, 1e-9, 'arm 1 back along the incoming beam');
  const lens = rulerHandleDrag(el, 2, { x: 250, y: 152 }, { targets, tolerance: 8 });
  assert.equal(lens.label, 'Lens');
  close(applied(el, lens).rot - applied(el, lens).params.angle, Math.atan2(-100, 100) * 180 / Math.PI + 360, 1e-9);
  // Out of reach, with Alt, or with auto clamp off, the arm follows the pointer.
  assert.equal(rulerHandleDrag(el, 2, { x: 230, y: 140 }, { targets, tolerance: 8 }).label, null);
  assert.equal(rulerHandleDrag(el, 2, { x: 205, y: 140 }, { targets, tolerance: 8, clamp: false }).label, null);
  const off = makeRuler(200, 200, 180, { mode: 'angle', angle: -45, armA: 60, armB: 60, autoClamp: false });
  assert.equal(rulerHandleDrag(off, 2, { x: 205, y: 140 }, { targets, tolerance: 8 }).label, null);
  // A beam that misses the vertex defines no direction for it.
  assert.equal(rulerClampDirection({ x: 200, y: 200 }, { x: 300, y: 262 }, { lines: [targets.lines[2]] }, 8), null);
});

test('Shift steps the angle between the arms by 5°', () => {
  const el = makeRuler(0, 0, 30, { mode: 'angle', angle: 40, armA: 50, armB: 50 });
  for (const index of [1, 2]) {
    const pointer = { x: 50 * Math.cos(-1.2), y: 50 * Math.sin(-1.2) };
    const moved = applied(el, rulerHandleDrag(el, index, pointer, { shift: true }));
    close(moved.params.angle / 5, Math.round(moved.params.angle / 5), 1e-9, `arm ${index}: ${moved.params.angle}`);
  }
});

test('the vertex moves the whole ruler, clicking onto components, then the grid', () => {
  const el = makeRuler(100, 100, 30, { mode: 'angle', angle: 60, armA: 40, armB: 70 });
  const targets = { points: [{ x: 152, y: 98, label: 'Mirror' }], lines: [{ a: { x: 0, y: 300 }, b: { x: 400, y: 300 }, label: 'beam axis' }] };
  const onMirror = rulerHandleDrag(el, 0, { x: 149, y: 101 }, { targets, tolerance: 8, snapGrid: grid });
  assert.equal(onMirror.label, 'Mirror');
  assert.deepEqual(onMirror.candidate, { x: 152, y: 98, rot: 30, params: {} }, 'only the position changes');
  const onBeam = rulerHandleDrag(el, 0, { x: 207, y: 296 }, { targets, tolerance: 8, snapGrid: grid });
  assert.equal(onBeam.label, 'beam axis');
  close(onBeam.candidate.x, 207, 1e-9); close(onBeam.candidate.y, 300, 1e-9);
  const onGrid = rulerHandleDrag(el, 0, { x: 61, y: 139 }, { targets, tolerance: 8, snapGrid: grid });
  assert.deepEqual([onGrid.candidate.x, onGrid.candidate.y, onGrid.label], [50, 150, null]);
  const free = rulerHandleDrag(el, 0, { x: 61, y: 139 }, { targets, tolerance: 8, snapGrid: null });
  assert.deepEqual([free.candidate.x, free.candidate.y], [61, 139]);
});

test('a distance end clicks onto a component, then a beam axis, then the grid; Shift keeps 45° steps', () => {
  const el = makeRuler(0, 0, 0, { len: 100 });
  const targets = { points: [{ x: 80, y: 3, label: 'Lens' }], lines: [{ a: { x: 0, y: 60 }, b: { x: 200, y: 60 }, label: 'beam axis' }] };
  assert.equal(rulerHandleDrag(el, 1, { x: 77, y: 0 }, { targets, tolerance: 8 }).label, 'Lens');
  const beam = rulerHandleDrag(el, 1, { x: 120, y: 55 }, { targets, tolerance: 8, snapGrid: grid });
  assert.equal(beam.label, 'beam axis');
  const end = world(applied(el, beam))[1];
  close(end.x, 120, 1e-9); close(end.y, 60, 1e-9);
  const gridEnd = world(applied(el, rulerHandleDrag(el, 1, { x: 112, y: 130 }, { targets, tolerance: 8, snapGrid: grid })))[1];
  close(gridEnd.x, 100, 1e-9); close(gridEnd.y, 125, 1e-9);
  const level = applied(el, rulerHandleDrag(el, 1, { x: 90, y: 7 }, { shift: true }));
  close(level.rot, 0, 1e-9, 'Shift keeps the line level');
  assert.deepEqual(rulerClampPoint({ x: 0, y: 0 }, targets, 1), null);
});

test('the purple knob tunes an angle ruler\'s angle, and the hint follows the mode', async () => {
  globalThis.window ??= { matchMedia: () => ({ matches: true }) };
  globalThis.document ??= { addEventListener() {}, dispatchEvent() {} };
  const { tuneDragValue } = await import('../sketch/js/canvas.js');
  const angle = makeRuler(0, 0, 0, { mode: 'angle' });
  const tune = getDirectManipulation(angle).tune;
  assert.equal(tune.key, 'angle');
  // Dragging up 10 px (20 steps of 0.1°) opens the angle by 2°, either way.
  const grab = el => ({ mode: 'tune', el, tune, clientY: 0, value: el.params.angle, direction: tune.direction(el.params) });
  assert.equal(tuneDragValue(grab(angle), -10), 47);
  const clockwise = makeRuler(0, 0, 0, { mode: 'angle', angle: -90 });
  assert.equal(tuneDragValue(grab(clockwise), -10), -92);
  assert.equal(tuneDragValue(grab(clockwise), 10), -88, 'down closes it');
  assert.equal(tuneDragValue(grab(makeRuler(0, 0, 0, { mode: 'angle', angle: 179 })), -40), 180, 'held at the bound');
  assert.equal(getDirectManipulation(makeRuler(0, 0, 0)).tune, null, 'a distance ruler has no knob');
  assert.match(registry.ruler.directHint(angle.params), /turn that arm/);
  assert.match(registry.ruler.directHint({ mode: 'distance' }), /move that end/);
});

test('clamp targets: a beam\'s middle ray, an object arrow\'s axis ray, and a point source\'s centre only', () => {
  // Review of #308: rays with no sample index (object arrow, point source)
  // were all dropped, so an object arrow's visible central ray was no target.
  const targetsFor = elements => rulerClampTargets({ elements, paths: traceScene(elements, []).paths, definitions: registry });
  const onAxis = (targets, y) => targets.lines.some(l => Math.abs(l.a.y - y) < 1e-9 && Math.abs(l.b.y - y) < 1e-9);

  const arrow = createElement('objarrow', 0, 0);
  const arrowTargets = targetsFor([arrow]);
  assert.equal(arrowTargets.lines.length, 1, 'one axis ray of the three drawn');
  const [axis] = rulerAxisPaths(traceScene([arrow], []).paths, [arrow]);
  close(axis[1].y, axis[0].y, 1e-6, 'the axis ray leaves along the arrow');
  assert.ok(onAxis(arrowTargets, axis[0].y), 'and it is the target');
  // A ruler end dropped near the arrow's axis lands on it.
  const hit = rulerClampPoint({ x: 50, y: axis[0].y + 2 }, arrowTargets, 5);
  assert.equal(hit?.label, 'beam axis');
  close(hit.y, axis[0].y, 1e-9);

  const turned = createElement('objarrow', 0, 0);
  turned.rot = 30;
  const [turnedAxis] = rulerAxisPaths(traceScene([turned], []).paths, [turned]);
  close(Math.atan2(turnedAxis[1].y - turnedAxis[0].y, turnedAxis[1].x - turnedAxis[0].x), Math.PI / 6, 1e-6);

  const point = createElement('pointsource', 100, 100);
  const pointTargets = targetsFor([point]);
  assert.equal(pointTargets.lines.length, 0, 'a point source has no axis');
  assert.ok(pointTargets.points.some(p => p.x === 100 && p.y === 100), 'its centre clamps');

  const laser = createElement('cwlaser', 0, 50);
  laser.params.beamMode = 'beam';
  const laserTargets = targetsFor([laser]);
  assert.ok(laserTargets.lines.length >= 1 && laserTargets.lines.length <= 2, 'only the middle sample(s) of the fan');
  assert.ok(onAxis(laserTargets, 50), 'along the beam centre');

  const mirror = createElement('mirror', 200, 50);
  mirror.rot = 45;
  const folded = targetsFor([laser, mirror]);
  assert.ok(folded.points.some(p => p.label === 'beam' && Math.abs(p.y - 50) < 1 && Math.abs(p.x - 200) < 10), 'the fold is a point');
  assert.equal(targetsFor([laser, makeRuler(0, 0, 0)]).points.filter(p => p.label === 'Ruler').length, 2, 'another ruler\'s handles');
  assert.equal(rulerClampTargets({ elements: [laser], definitions: registry, excludeId: laser.id }).points.length, 0, 'the dragged ruler itself is excluded');
});

test('an unsampled beam keeps its branches after a splitter as clamp targets', () => {
  // Review of #308: only the incident segment of a line-mode laser (or an
  // object arrow's axis ray) was kept, losing the transmitted and reflected
  // branches a beamsplitter makes.
  const hasLineThrough = (targets, p) => targets.lines.some(({ a, b }) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    return t >= 0 && t <= 1 && Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) < 1e-6;
  });
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  const splitter = createElement('bs', 200, 0);
  const scene = [laser, splitter];
  const targets = rulerClampTargets({ elements: scene, paths: traceScene(scene, []).paths, definitions: registry });
  assert.ok(hasLineThrough(targets, { x: 100, y: 0 }), 'incident');
  assert.ok(hasLineThrough(targets, { x: 400, y: 0 }), 'transmitted');
  assert.ok(hasLineThrough(targets, { x: 200, y: -200 }), 'reflected');
  assert.ok(targets.points.some(p => Math.abs(p.x - 200) < 1e-6 && Math.abs(p.y) < 1e-6), 'the split point');

  // An object arrow: its axis ray's branches, never its marginal rays'.
  const arrow = createElement('objarrow', 0, 0);
  const arrowScene = [arrow, createElement('bs', 200, 0)];
  const arrowPaths = traceScene(arrowScene, []).paths;
  const axes = rulerAxisPaths(arrowPaths, arrowScene);
  assert.equal(axes.length, 3, 'the axis ray, then its reflected and transmitted branches');
  const [axis] = rulerAxisPaths(traceScene([arrow], []).paths, [arrow]);
  for (const pts of axes) {
    for (const p of pts) {
      // Every kept point lies on the axis line or on the vertical reflected branch.
      assert.ok(Math.abs(p.y - axis[0].y) < 1e-6 || Math.abs(p.x - 200) < 1e-6, JSON.stringify(p));
    }
  }
});
