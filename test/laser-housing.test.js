// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// A laser's housing length, height and colour are appearance only: the box
// grows backwards from its fixed front face, and the beam never changes.
import test from 'node:test';
import assert from 'node:assert/strict';

import { boxAnchor, createElement, getSize, getVisualBounds, labelSVG, registry } from '../sketch/js/elements.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { initInspector, renderInspector } from '../sketch/js/inspector.js';
import { parseSketch, state } from '../sketch/js/state.js';
import '../sketch/js/detector-instruments.js';

const LASERS = ['cwlaser', 'pulsedlaser', 'sclaser'];

function laser(type, params = {}) {
  const el = createElement(type, 0, 0);
  Object.assign(el.params, { beamMode: 'beam', beamWidth: 12 }, params);
  return el;
}

const housingRect = el => registry[el.type].svg(el).match(/^<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"[^>]* fill="([^"]+)"/);

test('every laser offers housing length, height and colour in Label & appearance', () => {
  const panel = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  for (const type of LASERS) {
    const keys = registry[type].params.filter(p => p.appearance).map(p => p.key);
    assert.deepEqual(keys, ['housingLength', 'housingHeight', 'housingColor'], type);
    const el = laser(type);
    state.elements = [el];
    state.beams = [];
    state.selection = { kind: 'element', id: el.id };
    state.embedMode = false;
    initInspector(panel);
    renderInspector();
    const appearance = panel.innerHTML.slice(panel.innerHTML.indexOf('Label &amp; appearance'));
    for (const label of ['Housing length (mm)', 'Housing height (mm)', 'Housing color']) {
      assert.ok(appearance.includes(label), `${type}: ${label} sits in Label & appearance`);
    }
  }
});

test('the default housing is the box every laser had before', () => {
  for (const type of LASERS) {
    for (const params of [{ beamMode: 'line' }, { beamMode: 'beam', beamWidth: 30 }]) {
      const el = laser(type, params);
      const h = params.beamMode === 'beam' ? Math.max(34, params.beamWidth + 28) : 34;
      assert.deepEqual(getSize(el), { w: 104, h: h + 4 }, type);
      assert.deepEqual(boxAnchor(el), { x: 0, y: 0 }, type);
      const [, x, y, width, height] = housingRect(el);
      assert.deepEqual([x, y, width, height].map(Number), [-46, -h / 2, 92, h], type);
      const xs = registry[type].surfaces(el).flatMap(s => [s.x1, s.x2]);
      assert.deepEqual([Math.min(...xs), Math.max(...xs)], [-46, 46], `${type} absorbs where it is drawn`);
    }
  }
});

test('a longer, taller housing grows backwards and leaves the beam exactly as it was', () => {
  const screen = () => Object.assign(createElement('detector', 300, 0), { id: 'det' });
  for (const type of LASERS) {
    const plain = laser(type);
    const big = laser(type, { housingLength: 400, housingHeight: 120, housingColor: '#d9c9a3' });
    big.id = plain.id;

    assert.deepEqual(registry[type].source(big), registry[type].source(plain), `${type}: same emitted rays`);
    const drawn = el => JSON.stringify(traceScene([el, screen()]).drawables);
    assert.equal(drawn(big), drawn(plain), `${type}: the traced beam is unchanged`);

    // The front face and exit port stay put; the box extends to x = 46 - 400.
    const [, x, , width, height, fill] = housingRect(big);
    assert.deepEqual([Number(x), Number(width), Number(height), fill], [-354, 400, 120, '#d9c9a3']);
    assert.match(registry[type].svg(big), /<rect x="46[.\d]*" y="-9"/, `${type}: exit port unchanged`);
    assert.deepEqual(registry[type].snapPt, { x: 52, y: 0 });
    const size = getSize(big), anchor = boxAnchor(big);
    assert.equal(anchor.x + size.w / 2, 52, `${type}: the box still ends at the exit`);
    assert.equal(anchor.x - size.w / 2, 46 - 400 - 6);
    const xs = registry[type].surfaces(big).flatMap(s => [s.x1, s.x2]);
    assert.deepEqual([Math.min(...xs), Math.max(...xs)], [-354, 46], `${type}: absorbs where it is drawn`);
  }
});

test('the housing is never drawn shorter than the beam needs, and says so', () => {
  const el = laser('cwlaser', { beamWidth: 40, housingHeight: 34 });
  assert.equal(Number(housingRect(el)[4]), 68, 'a 40 mm beam needs a 68 mm housing');
  const note = registry.cwlaser.params.find(p => p.key === 'housingHeight').note(el.params);
  assert.match(note, /Drawn 68 mm tall/);
  el.params.housingHeight = 90;
  assert.equal(Number(housingRect(el)[4]), 90);
  assert.equal(registry.cwlaser.params.find(p => p.key === 'housingHeight').note(el.params), '');
});

test('a light housing gets dark lettering; a short one shrinks its markings', () => {
  const light = laser('pulsedlaser', { housingColor: '#f4f1e8' });
  assert.match(registry.pulsedlaser.svg(light), /fill="#1f2329">LASER</);
  assert.match(registry.pulsedlaser.svg(laser('pulsedlaser')), /fill="#fff">LASER</);
  const short = laser('cwlaser', { housingLength: 46 });
  assert.match(registry.cwlaser.svg(short), /<g transform="translate\(23 0\) scale\(0\.5\)">/);
});

test('labels and export bounds follow the box, not the element origin', () => {
  const el = laser('cwlaser', { housingLength: 400 });
  el.label = 'Pump';
  el.showLabel = true;
  assert.match(labelSVG(el), /<text x="-154\.0"/, 'a label below centres on the housing');
  el.labelPos = 'l';
  const x = Number(labelSVG(el).match(/<text x="([^"]+)"/)[1]);
  assert.ok(x < -354, 'a label on the left clears the long housing');
  assert.ok(getVisualBounds(el).x0 < x - 20, 'and the export bounds include it');
});

test('malformed or missing housing fields open as the default housing', () => {
  const file = params => JSON.stringify({ app: 'optics2d', version: 1, beams: [],
    elements: [{ id: 'l1', type: 'cwlaser', x: 0, y: 0, params }] });
  const [old] = parseSketch(file({ wavelength: 633 }), registry).elements;
  assert.equal(old.params.housingLength, 92);
  assert.equal(old.params.housingHeight, 34);
  assert.equal(old.params.housingColor, '#3a3f46');
  assert.deepEqual(getSize(old), { w: 104, h: 38 });

  const [bad] = parseSketch(file({ housingLength: 1e9, housingHeight: -5, housingColor: 'url(#x)' }), registry).elements;
  assert.equal(bad.params.housingLength, 1000);
  assert.equal(bad.params.housingHeight, 34);
  assert.equal(bad.params.housingColor, '#3a3f46');

  // Unnormalized params straight into the drawing code still give a finite box.
  const raw = laser('sclaser', { housingLength: 'abc', housingHeight: Infinity, housingColor: 7 });
  assert.doesNotMatch(registry.sclaser.svg(raw), /NaN|Infinity|undefined/);
  assert.deepEqual(getSize(raw), { w: 104, h: 44 });
  assert.match(registry.sclaser.svg(raw), /fill="#24233a"/, 'the SC laser falls back to its own colour');
});

test('turning a long housing by its handle starts from its own angle, not a jump', async () => {
  globalThis.window ??= { matchMedia: () => ({ matches: true }) };
  globalThis.document ??= { addEventListener() {}, dispatchEvent() {} };
  const { dragRotation } = await import('../sketch/js/canvas.js');
  for (const length of [40, 92, 400]) {
    const el = laser('cwlaser', { housingLength: length });
    // The handle above the box centre, with a view zoom of 1.
    const anchor = boxAnchor(el), handle = { x: anchor.x, y: -(getSize(el).h / 2 + 6) - 22 };
    const drag = { el, rot: 0, grab: Math.atan2(handle.y, handle.x) * 180 / Math.PI };
    assert.equal(dragRotation(drag, { x: handle.x + 1, y: handle.y }), 0, `${length} mm: a 1 px nudge keeps 0°`);
    // A quarter turn of the pointer about the pivot is a quarter turn of the laser.
    const quarter = { x: -handle.y, y: handle.x };
    assert.equal(dragRotation(drag, quarter), 90, `${length} mm`);
    assert.equal(dragRotation({ ...drag, rot: 30 }, quarter), 120, 'from any starting angle');
  }
});
