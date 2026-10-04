// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The beam probe's spectrum plot of a discharge lamp: one stem per line and
// nothing between them (reviewer, #226: the lines were joined into one
// filled curve, which showed light in the dark gaps).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { traceAll } from '../sketch/js/raytrace.js';
import { LAMP_PRESETS } from '../sketch/js/lamps.js';

// The reviewer's scene: a lamp at the focus of an off-axis parabola, and a
// probe on the collimated beam.
function lampProbe(lampType, probeParams = {}) {
  const lamp = createElement('pointsource', 175, 200);
  Object.assign(lamp.params, { sourceKind: 'lamp', lampType, spread: 360, nrays: 24 });
  const oap = createElement('oap', 150, 200);
  oap.rot = 180;
  Object.assign(oap.params, { length: 110, f: 25 });
  const probe = createElement('probe', 260, 200);
  Object.assign(probe.params, { prop: 'spectrum' }, probeParams);
  const scene = [lamp, oap, probe];
  traceAll(scene, []);
  return registry.probe.svg(probe, scene);
}

const stemsOf = svg => [...svg.matchAll(/<line data-spectrum-line="([\d.]+)" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)]
  .map(m => ({ nm: Number(m[1]), x: Number(m[2]), base: Number(m[3]), x2: Number(m[4]), top: Number(m[5]) }));

test('a mercury lamp is drawn as seven separate stems, as tall as each line is strong', () => {
  const svg = lampProbe('hg');
  const stems = stemsOf(svg);
  const lines = LAMP_PRESETS.hg.lines;
  assert.equal(stems.length, lines.length, 'one stem per line');
  assert.match(svg, /data-spectrum-lines="7"/);
  const strongest = Math.max(...lines.map(l => l.w));
  const full = Math.max(...stems.map(s => s.base - s.top));
  stems.forEach((stem, i) => {
    assert.ok(Math.abs(stem.nm - lines[i].nm) < 0.01, `stem ${i} sits at ${lines[i].nm} nm`);
    assert.equal(stem.x, stem.x2, 'a stem is vertical');
    assert.ok(Math.abs((stem.base - stem.top) / full - lines[i].w / strongest) < 0.01,
      `the ${lines[i].nm} nm stem is as tall as its weight`);
  });
  // left to right in wavelength, on one baseline
  assert.deepEqual(stems.map(s => s.x), stems.map(s => s.x).sort((a, b) => a - b));
  assert.equal(new Set(stems.map(s => s.base)).size, 1);
});

test('nothing is drawn between a lamp\'s lines', () => {
  const svg = lampProbe('hg');
  assert.doesNotMatch(svg, /data-spectrum-points/, 'no filled curve through the lines');
  assert.doesNotMatch(svg, /<path/, 'no path of any kind joins them');
  assert.doesNotMatch(svg, /linearGradient|fill="url\(/, 'and no gradient fill');
});

test('a fixed range shows only the lines inside it, scaled to the strongest of those', () => {
  // 560-600 nm holds mercury's yellow pair alone (576.96 and 579.07 nm).
  const stems = stemsOf(lampProbe('hg', { rangeMode: 'manual', specMin: 560, specMax: 600 }));
  assert.deepEqual(stems.map(s => s.nm), [576.96, 579.07]);
  assert.ok(stems.every(s => Math.abs((s.base - s.top) - (stems[0].base - stems[0].top)) < 0.01),
    'two equal lines stand equally tall');
  // A range with no line in it draws no stem and still renders its axes.
  const empty = lampProbe('hg', { rangeMode: 'manual', specMin: 600, specMax: 700 });
  assert.equal(stemsOf(empty).length, 0);
  assert.match(empty, />600<\/text>/);
  assert.doesNotMatch(empty, /NaN|Infinity/);
});

test('a Gaussian beam keeps its filled curve, point for point', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'line', wavelength: 532, pulseWidthFs: 150, transformLimited: true });
  const probe = createElement('probe', 150, 0);
  probe.params.prop = 'spectrum';
  const scene = [laser, probe];
  traceAll(scene, []);
  const svg = registry.probe.svg(probe, scene);
  assert.doesNotMatch(svg, /data-spectrum-line/, 'a continuum has no stems');
  const fill = /<path data-spectrum-points="28" d="([^"]+)" fill="url\(#probeSpecGrad/.exec(svg);
  assert.ok(fill, 'the filled 28-point curve is still there');
  // The curve as drawn before this change: its start on the axis, its peak
  // at the centre of the plot, and its return to the axis.
  assert.ok(fill[1].startsWith('M 18.20,37.00 C 18.20,36.95 17.95,36.80 18.20,36.71 C 18.44,36.62 19.18,36.57 19.67,36.45'));
  assert.ok(fill[1].includes('C 36.29,11.66 36.78,11.21 37.27,11.00 C 37.76,10.79 38.24,10.79 38.73,11.00'));
  assert.ok(fill[1].endsWith('C 58.05,36.80 57.80,36.95 57.80,37.00 Z'));
});
