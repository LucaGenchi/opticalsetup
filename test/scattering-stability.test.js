// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';
import { pasteObjects } from '../sketch/js/clipboard.js';
import { readFileSync } from 'node:fs';

function setup(type, beamMode) {
  const source = createElement('cwlaser', 0, 0);
  Object.assign(source.params, { beamMode, beamWidth: 1 });
  const remote = createElement('mirror', 50, 1000);
  const scatterer = createElement(type, 100, 0);
  Object.assign(scatterer.params, { div: 8, transmissive: true, layers: [{ type: 'speckle', div: 8 }] });
  const slit = createElement('slit', 200, 0); slit.params.gap = 8;
  const meter = createElement('detector', 300, 0); meter.params.aperture = 100;
  return { elements: [source, remote, scatterer, slit, meter], scatterer, remote, meter };
}

const reading = (elements, meter) => {
  traceScene(elements);
  return detectorReading(meter.id)?.signal ?? 0;
};

for (const type of ['diffuser', 'slm', 'metasurface']) for (const mode of ['line', 'beam']) {
  test(`${type} ${mode} scattering survives unrelated edits and a save/load`, () => {
    const { elements, scatterer, remote, meter } = setup(type, mode);
    scatterer.scatterSeed = 1;
    const expected = reading(elements, meter);
    assert.ok(expected > 0 && expected < 1, 'the aperture samples part of the scattered power');
    assert.equal(reading([...elements].reverse(), meter), expected);
    const edited = elements.filter(el => el !== remote);
    assert.equal(reading(edited, meter), expected);
    const saved = JSON.stringify({ app: 'optics2d', version: 1, elements: edited, beams: [] });
    const loaded = parseSketch(saved, registry);
    assert.equal(reading(loaded.elements, meter), expected);
    assert.equal(loaded.elements.find(el => el.id === scatterer.id).scatterSeed, 1);
  });
}

test('legacy scattering migrates its existing pattern before unrelated edits', () => {
  for (const type of ['diffuser', 'slm', 'metasurface']) {
    const { elements, scatterer, remote, meter } = setup(type, 'line');
    delete scatterer.scatterSeed;
    const before = reading(elements, meter);
    const loaded = parseSketch({ elements, beams: [] }, registry);
    const migrated = loaded.elements.find(el => el.id === scatterer.id);
    assert.equal(migrated.scatterSeed, 5, 'the old active face followed four laser-body surfaces and the mirror');
    assert.equal(reading(loaded.elements, meter), before);
    assert.equal(reading(loaded.elements.filter(el => el.id !== remote.id), meter), before);
    assert.deepEqual(parseSketch(loaded, registry), loaded, 'migration is idempotent');
  }
});

test('authored scattering seeds are finite bounded integers', () => {
  const { elements, scatterer } = setup('diffuser', 'line');
  for (const [value, expected] of [[-2, 0], [2.8, 2], [1e100, 0xffffffff], [Infinity, 5]]) {
    scatterer.scatterSeed = value;
    assert.equal(parseSketch({ elements }, registry).elements[2].scatterSeed, expected);
  }
});

test('a pasted scatterer is a different scatterer; everything else about it is copied', () => {
  for (const type of ['diffuser', 'slm', 'metasurface']) {
    const original = createElement(type, 0, 0);
    original.scatterSeed = 7;
    const mirror = createElement('mirror', 0, 50);
    let n = 0;
    const { els } = pasteObjects({ els: [original, mirror], beams: [] }, { newId: prefix => `${prefix}${++n}` });
    assert.notEqual(els[0].scatterSeed, 7);
    assert.ok(Number.isInteger(els[0].scatterSeed) && els[0].scatterSeed >= 0 && els[0].scatterSeed <= 0xffffffff);
    assert.deepEqual(els[0].params, original.params);
    assert.equal(original.scatterSeed, 7, 'the original keeps its pattern');
    assert.equal('scatterSeed' in els[1], false, 'a mirror gains no seed');
  }
});

test('wiki demos give their scatterers a fixed pattern', () => {
  const main = readFileSync(new URL('../sketch/js/main.js', import.meta.url), 'utf8');
  const mkDemo = main.slice(main.indexOf('function mkDemo('), main.indexOf('\n}\n', main.indexOf('function mkDemo(')) + 3);
  const build = new Function('createElement', `${mkDemo}; return mkDemo;`)(createElement);
  for (const type of ['diffuser', 'slm', 'metasurface']) {
    assert.equal(build(type, 0, 0).scatterSeed, 1);
    assert.equal(build(type, 0, 0, 0, {}, { scatterSeed: 9 }).scatterSeed, 9, 'a demo may still choose its own');
  }
  assert.equal('scatterSeed' in build('mirror', 0, 0), false);
});
