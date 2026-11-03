// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, getVisualBounds } from '../sketch/js/elements.js';
import { markdownLayout, markdownTextSVG, parseInlineMarkdown } from '../sketch/js/markdown.js';
import { texRuns } from '../sketch/js/tex.js';

const mathText = tokens => tokens.filter(token => token.math).map(token => token.text).join('');
const runs = source => texRuns(source, { measure: run => run.stretch ?? [...run.text].length * 0.5 * run.scale });

// ---------------- formulas in text labels ----------------

test('a formula becomes Unicode math in positioned tspans, with no TeX source left over', () => {
  const svg = markdownTextSVG('Snell: $n_1 \\sin\\theta_1 = n_2 \\sin\\theta_2$', { fontSize: 14 });
  assert.match(svg, /<tspan font-family="'STIX Two Text'/, 'a formula is set in the serif math faces');
  assert.match(svg, /font-style="italic">n<\/tspan>/, 'variables are italic');
  assert.match(svg, /font-style="normal">sin<\/tspan>/, 'function names are upright');
  assert.match(svg, />θ<\/tspan>/);
  assert.match(svg, /dy="\d+\.\d+" font-size="9\.80" font-style="normal">1<\/tspan>/, 'a subscript is smaller and lowered');
  assert.doesNotMatch(svg, /\\|\$/);
});

test('text after a formula returns to the baseline', () => {
  const svg = markdownTextSVG('a $x^2 + y_1$ b', { fontSize: 14 });
  const shifts = [...svg.matchAll(/dy="(-?\d+\.\d+)"/g)].map(match => Number(match[1]));
  assert.ok(shifts.length >= 3);
  assert.ok(Math.abs(shifts.reduce((sum, dy) => sum + dy, 0)) < 0.02, 'every rise is undone before the closing text');
  assert.match(svg, /<\/tspan><\/tspan><tspan dy="[^"]+"> b<\/tspan>/);
});

test('scripts stack when a symbol has both, and the pen ends past the wider one', () => {
  const [base, sup, sub, rest] = runs('x_1^{22}');
  assert.equal(base.text, 'x');
  assert.equal(sup.text, '22');
  assert.ok(sup.shift < 0 && sup.scale < 1);
  assert.equal(sub.text, '1');
  assert.ok(sub.shift > 0);
  assert.ok(sub.dx < 0, 'the subscript steps back under the superscript');
  assert.equal(rest.text, '');
  assert.ok(Math.abs(rest.dx - (sup.scale * 0.5 * 2 - sub.scale * 0.5)) < 1e-9);
});

test('TeX spacing ignores typed spaces, and spaces relations wider than operators', () => {
  assert.deepEqual(runs('a+b'), runs('a + b'));
  const [, plus, b] = runs('a+b');
  assert.equal(plus.text, '+');
  assert.ok(Math.abs(plus.dx - 4 / 18) < 1e-9 && Math.abs(b.dx - 4 / 18) < 1e-9);
  const [, equals] = runs('a=b');
  assert.ok(Math.abs(equals.dx - 5 / 18) < 1e-9);
  const [minus, x] = runs('-x');
  assert.equal(minus.text, '−');
  assert.ok(!minus.dx && !x.dx, 'a leading minus is a sign, with no gap');
});

test('a fraction stacks its parts around a stretched bar and makes room in the line', () => {
  const tokens = parseInlineMarkdown('$\\frac{1}{f}$');
  const [num, den, bar] = tokens;
  assert.equal(num.text, '1');
  assert.ok(num.shift < 0);
  assert.equal(den.text, 'f');
  assert.ok(den.shift > 0);
  assert.ok(bar.stretch > 0);

  const svg = markdownTextSVG('$\\frac{1}{f}$', { fontSize: 14 });
  assert.match(svg, /textLength="\d+\.\d+" lengthAdjust="spacingAndGlyphs">—<\/tspan>/);
  assert.ok(markdownLayout('$\\frac{1}{f}$', 14).height > markdownLayout('1/f', 14).height);
});

test('a formula alone on its line is displayed: centered, with full-size fractions', () => {
  const layout = markdownLayout('A much longer line of prose above it\n$$\\frac{a}{b}$$', 14);
  const display = layout.lines[1];
  assert.equal(display.kind, 'display');
  assert.ok(display.indent > 0);
  assert.ok(Math.abs(display.indent - (layout.width - display.width) / 2) < 1e-9);
  assert.equal(display.tokens.find(token => token.text === 'a').scale, 1);
  assert.ok(parseInlineMarkdown('$\\frac{a}{b}$').find(token => token.text === 'a').scale < 1, 'inline fractions are script size');
});

test('a formula outranks emphasis, and a code span outranks a formula', () => {
  const tokens = parseInlineMarkdown('$a_1 * b_1$');
  assert.ok(tokens.every(token => token.math));
  assert.equal(mathText(tokens), 'a1∗b1');

  assert.deepEqual(parseInlineMarkdown('`$HOME` and `$x$`').filter(token => token.code).map(token => token.text), ['$HOME', '$x$']);
  assert.equal(mathText(parseInlineMarkdown('`$HOME` and `$x$`')), '');
});

test('prices stay plain text, an escaped dollar is literal, and formulas still open after them', () => {
  assert.deepEqual(parseInlineMarkdown('Costs $5 and $10.'), [{ text: 'Costs $5 and $10.', href: null }]);
  assert.deepEqual(parseInlineMarkdown('The \\$ sign'), [{ text: 'The $ sign', href: null }]);
  const mixed = parseInlineMarkdown('\\$5 buys $x$, and $a$ to $b$');
  assert.equal(mixed[0].text, '$5 buys ');
  assert.equal(mathText(mixed), 'xab');
});

test('accents, roots and \\text keep their meaning', () => {
  assert.equal(mathText(parseInlineMarkdown('$\\vec{E}$')), 'E⃗');
  const root = parseInlineMarkdown('$\\sqrt{2}$');
  assert.equal(root[0].text, '√');
  assert.equal(root[1].decoration, 'overline');
  const svg = markdownTextSVG('$d \\text{ in mm}$', { fontSize: 14 });
  assert.match(svg, /<\/tspan><\/tspan><tspan font-style="normal"> in mm<\/tspan>/, '\\text keeps its spaces and the label font');
});

test('an unsupported command stays visible as typed', () => {
  assert.match(mathText(parseInlineMarkdown('$\\begin{pmatrix}$')), /^\\begin/);
});

test('markup inside a formula is escaped', () => {
  const svg = markdownTextSVG('$<script>alert(1)</script>$', { fontSize: 14 });
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /&lt;/);
});

test('malformed formulas never throw and never reach the SVG as non-finite numbers', () => {
  const inputs = [
    '$\\frac{1$', '$x^$', '$}{$', '$\\sqrt[$', '$\\left$', '$\\text{abc$', '$^_^_$', '$\\frac{}{}$',
    '$\\frac{\\frac{\\frac{a}{b}}{c}}{d}$', '$x^{y^{z^{w}}}$', '$\\$', '$\\mathbb{R}^3$', '$\\operatorname*{sinc}x$',
  ];
  for (const text of inputs) {
    const svg = markdownTextSVG(text, { fontSize: 14 });
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/, text);
    const label = createElement('textlabel', 0, 0);
    label.params.text = text;
    const bounds = getVisualBounds(label);
    assert.ok([bounds.x0, bounds.x1, bounds.y0, bounds.y1].every(Number.isFinite), text);
  }
});
