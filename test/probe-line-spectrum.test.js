// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The beam probe's spectrum plot of a discharge lamp: one stem per line and
// nothing between them (reviewer, #226: the lines were joined into one
// filled curve, which showed light in the dark gaps).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { traceAll, traceScene } from '../sketch/js/raytrace.js';
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

// ---------------- caption ----------------
// A lamp's nominal wavelength is its brightest visible line and its bandwidth
// the span of its lines, so "wl ± bw/2" named a range centred where the lamp
// is not: mercury (365-1014 nm) was captioned "111–760 nm".

test('the spectrum card names a lamp by the span of its lines', () => {
  const svg = lampProbe('hg');
  assert.match(svg, />365–1014 nm<\/text>/);
  assert.doesNotMatch(svg, /111–760/);
  // every stem lies inside the range the caption states
  assert.ok(stemsOf(svg).every(s => s.nm >= 365 && s.nm <= 1014.5));
});

test('the wavelength view counts a lamp\'s lines and does not call it a supercontinuum', () => {
  const svg = lampProbe('hg', { prop: 'wl' });
  assert.match(svg, />7 lines · 365–1014 nm<\/text>/);
  assert.doesNotMatch(svg, /SC /);
  // the swatch is the colour the beam is drawn in, not the two-tone SC mark
  assert.doesNotMatch(svg, /<path/);
  const helium = lampProbe('he', { prop: 'wl' });
  assert.match(helium, />7 lines · 389–707 nm<\/text>/);
});

test('a lamp cut down to one line is captioned as that line', () => {
  // A 546 nm bandpass leaves mercury's green line alone.
  const lamp = createElement('pointsource', 175, 200);
  Object.assign(lamp.params, { sourceKind: 'lamp', lampType: 'hg', spread: 360, nrays: 24 });
  const oap = createElement('oap', 150, 200);
  oap.rot = 180;
  Object.assign(oap.params, { length: 110, f: 25 });
  const filter = createElement('filter', 220, 200);
  Object.assign(filter.params, { ftype: 'bandpass', center: 546, band: 10, length: 120 });
  for (const [prop, caption] of [['spectrum', />546 nm<\/text>/], ['wl', />546 nm<\/text>/]]) {
    const probe = createElement('probe', 260, 200);
    probe.params.prop = prop;
    const scene = [lamp, oap, filter, probe];
    traceAll(scene, []);
    const svg = registry.probe.svg(probe, scene);
    assert.match(svg, caption, `${prop} view`);
    assert.doesNotMatch(svg, /lines ·|±|–/, `${prop} view quotes no range and no width`);
  }
});

test('a supercontinuum and a Gaussian beam keep their captions', () => {
  const card = (type, params, prop) => {
    const source = createElement(type, 0, 0);
    Object.assign(source.params, { beamMode: 'line' }, params);
    const probe = createElement('probe', 150, 0);
    probe.params.prop = prop;
    traceAll([source, probe], []);
    return registry.probe.svg(probe, [source, probe]);
  };
  assert.match(card('pulsedlaser', { wavelength: 532, pulseWidthFs: 150, transformLimited: true }, 'spectrum'), />532 ± 1 nm<\/text>/);
  assert.match(card('sclaser', {}, 'wl'), />SC \d+–\d+ nm<\/text>/);
  assert.match(card('sclaser', {}, 'spectrum'), />\d+–\d+ nm<\/text>/);
});

// ---------------- a lamp beside another beam ----------------
// Reviewer, #233: with a mercury lamp and a 532 nm laser in one sampling
// circle, the polarization view still named the lamp "436 nm".

function lampAndLaser(prop) {
  const lamp = createElement('pointsource', 175, 200);
  Object.assign(lamp.params, { sourceKind: 'lamp', lampType: 'hg', spread: 360, nrays: 24 });
  const oap = createElement('oap', 150, 200);
  oap.rot = 180;
  Object.assign(oap.params, { length: 110, f: 25 });
  // a laser coming the other way, 3 mm off the lamp's axis
  const laser = createElement('cwlaser', 400, 203);
  laser.rot = 180;
  Object.assign(laser.params, { wavelength: 532, beamMode: 'line' });
  const probe = createElement('probe', 260, 200);
  Object.assign(probe.params, { prop, sampleDiameterMm: 30 });
  const scene = [lamp, oap, laser, probe];
  traceScene(scene, []);
  return registry.probe.svg(probe, scene);
}
const captions = svg => [...svg.matchAll(/>([^<>]*nm[^<>]*)<\/text>/g)].map(m => m[1]);

test('beside a laser, every list names the lamp by its lines and never by 436 nm', () => {
  const pol = lampAndLaser('pol');
  assert.match(pol, /data-probe-beams="2"/);
  assert.deepEqual(captions(pol), ['365–1014 nm', '532 nm']);
  assert.deepEqual(captions(lampAndLaser('wl')), ['7 lines · 365–1014 nm', '532 nm']);
  assert.deepEqual(captions(lampAndLaser('duration')).map(c => c.split(' · CW')[0]).sort(),
    ['532 nm', '7 lines · 365–1014 nm']);
  assert.deepEqual(captions(lampAndLaser('time')), ['365–1014 nm · 532 nm']);
  for (const prop of ['pol', 'wl', 'duration', 'time']) {
    assert.doesNotMatch(lampAndLaser(prop), /436/, `${prop} view`);
  }
});

test('the polarization card makes room for a lamp\'s longer name and leaves a laser\'s where it was', () => {
  const svg = lampAndLaser('pol');
  const slots = [...svg.matchAll(/<g transform="translate\(([\d.]+),0\)">(?:<g transform="translate\(([\d.]+),0\)">)?/g)]
    .map(m => ({ x: Number(m[1]), inset: Number(m[2] || 0) }));
  const names = [...svg.matchAll(/<text data-probe-pol-name="1" x="([\d.]+)"[^>]*>([^<]+)</g)]
    .map(m => ({ x: Number(m[1]), text: m[2] }));
  assert.equal(names.length, 2);
  // the lamp's caption starts inside its own slot and ends before the next
  const lampEnd = slots[0].x + names[0].x + names[0].text.length * 3.7;
  assert.ok(names[0].x >= 0 && lampEnd <= slots[1].x, `the lamp's name (to ${lampEnd}) stays left of the laser's card at ${slots[1].x}`);
  // the laser's caption sits where it always has: 8 left of its card's centre
  assert.equal(slots[1].inset, 0);
  assert.equal(names[1].x, 56 / 2 - 8);
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

// Reviewer, #233 (second round): the time card was sized by its verdict
// alone, so four lamps -- a 53-character list -- overran a 103-unit card.

// `count` sources collimated or aimed onto one probe at (400,300), 20 degrees apart.
function converging(count, build) {
  const P = [400, 300], scene = [];
  for (let k = 0; k < count; k++) {
    const deg = 20 * k, a = deg * Math.PI / 180;
    const at = back => [P[0] - back * Math.cos(a), P[1] - back * Math.sin(a)];
    scene.push(...build(deg, at));
  }
  const probe = createElement('probe', P[0], P[1]);
  Object.assign(probe.params, { prop: 'time', sampleDiameterMm: 20 });
  scene.push(probe);
  traceScene(scene, []);
  const svg = registry.probe.svg(probe, scene);
  return {
    svg,
    width: Number(/<rect x="0" y="0" width="([\d.]+)" height="56"/.exec(svg)[1]),
    names: /data-probe-time-names="(\d+)">([^<]*)</.exec(svg),
  };
}
const lampUnit = (deg, at) => {
  const lamp = createElement('pointsource', ...at(195));
  lamp.rot = deg;
  Object.assign(lamp.params, { sourceKind: 'lamp', lampType: 'hg', spread: 360, nrays: 24 });
  const oap = createElement('oap', ...at(220));
  oap.rot = 180 + deg;
  Object.assign(oap.params, { length: 60, f: 25 });
  return [lamp, oap];
};
const laserUnit = wavelengths => (deg, at) => {
  const laser = createElement('pulsedlaser', ...at(200));
  laser.rot = deg;
  Object.assign(laser.params, { beamMode: 'line', wavelength: wavelengths[deg / 20] });
  return [laser];
};

test('the time card is as wide as its list of beams needs, at the four-beam limit', () => {
  const { svg, width, names } = converging(4, lampUnit);
  assert.equal(names[1], '4', 'four beams are listed');
  assert.equal(names[2], Array(4).fill('365–1014 nm').join(' · '));
  // centred text at font-size 4.8: 2.8 units a character is a generous bound
  assert.ok(names[2].length * 2.8 + 12 <= width, `a ${names[2].length}-character list fits a ${width}-unit card`);
  // the plot's axis grows with the card
  assert.match(svg, new RegExp(`<line x1="9" y1="44" x2="${width - 7}" y2="44"`));
  assert.doesNotMatch(svg, /NaN|Infinity/);
});

test('a time card whose list is short keeps the width it had', () => {
  const two = converging(2, laserUnit([800, 1040]));
  assert.equal(two.names[2], '800 nm · 1040 nm');
  assert.ok(two.width >= 90 && two.names[2].length * 2.8 + 12 < 90, 'the list does not set the width');
  // one lamp beside a laser: the longer name still fits the minimum card
  const lampAndOne = /data-probe-time-names="2">([^<]*)</.exec(lampAndLaser('time'))[1];
  assert.ok(lampAndOne.length * 2.8 + 12 <= 90);
});
