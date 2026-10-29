// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// A point source caught by every optical element within its capture range --
// the default for a newly placed source. A lens, a mirror or a fiber tip
// collects the light; any other optic acts on it and hands on only the range
// that is left; light nothing catches fades out. Light sources do not catch
// it. Several benches follow Andrea Bertoncini's tests in #254.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import '../sketch/js/detector-instruments.js';
import '../sketch/js/etalon.js';
import { parseSketch } from '../sketch/js/state.js';

const at = (type, x, y = 0, params = {}, rot = 0) => {
  const el = createElement(type, x, y);
  el.rot = rot;
  Object.assign(el.params, params);
  return el;
};
const source = (params = {}) => at('pointsource', 0, 0, { nrays: 4, ...params });
const load = elements => parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements, beams: [] }), registry).elements;
const close = (actual, expected, label = '') =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label} ${actual} vs ${expected}`);

function paths(elements) {
  const drawn = traceAll(elements).filter(d => d.type === 'path');
  assert.ok(drawn.flatMap(d => d.pts).every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  return drawn;
}
// What the point source at the origin drew, leaving out another source's beam.
const sourcePoints = elements => paths(elements)
  .filter(d => Math.hypot(d.pts[0].x, d.pts[0].y) < 1e-6).flatMap(d => d.pts);
const allPoints = elements => paths(elements).flatMap(d => d.pts);
const reach = points => Math.max(...points.map(p => Math.hypot(p.x, p.y)));
// A detector's sensitive face sits 19 mm in front of its centre: this puts the
// face `d` mm from the source along +x, or along -y (where a 45° fold sends
// the light) facing back down at the fold.
const faceAt = (d, params = {}) => at('detector', d + 19, 0, params);
const faceUp = (x, d, params = {}) => at('detector', x, -(d + 19), params, 270);
const fadesAtGlow = points => reach(points) <= 110 + 1e-8;
function signal(elements, detector) {
  paths([...elements, detector]);
  return detectorReading(detector.id)?.signal ?? 0;
}

test('a new source is caught by every optical element within 1 m; a saved one keeps its rule', () => {
  const fresh = createElement('pointsource', 0, 0);
  assert.equal(fresh.params.catchMode, 'all');
  assert.equal(fresh.params.captureRange, 1000);
  assert.ok(registry.pointsource.source(fresh).every(r => r.captureMode === 'all' && r.captureLen === 1000));

  const [kept] = load([source({ captureRange: 2500 })]);
  assert.equal(kept.params.catchMode, 'all', 'the new rule survives save and reload');
  assert.equal(kept.params.captureRange, 2500);

  const saved = source({ captureRange: 400 });
  delete saved.params.catchMode;
  const [old] = load([saved]);
  assert.equal(old.params.catchMode, 'lensmirror', 'saved before the control: lenses, mirrors and fiber tips');
  assert.equal(old.params.captureRange, 400);
  assert.equal(signal([old], at('detector', 300)), 0, 'and it still reads nothing on a bare detector');

  const [malformed] = load([source({ catchMode: 'everything' })]);
  assert.ok(['all', 'collectors', 'lensmirror'].includes(malformed.params.catchMode));
  assert.equal(load([source({ catchMode: 'lensmirror' })])[0].params.catchMode, 'lensmirror', 'the saved rule round-trips');
});

test('under the saved-sketch rule the eye\'s pupil lens does not hide a collector', () => {
  // Found in review of #260: the look-ahead used the new collector list, so
  // the pupil lens stood in front of the real lens and ended the search.
  const eye = at('eye', 0, 0, { length: 16.7 });
  const saved = at('pointsource', 7, 0, { nrays: 4, captureRange: 400 });
  delete saved.params.catchMode;
  const [old] = load([saved]);
  assert.equal(old.params.catchMode, 'lensmirror');
  const lens = at('lens', -100, 0, { f: 100, dia: 200 });
  close(signal([old, eye, lens], at('detector', -219, 0, {}, 180)), 0.25, 'collected by the lens, as on main');
});

test('under Collectors a detector collects like a lens; a saved sketch keeps it out', () => {
  // A bare detector facing the source reads it, an ND in front acts on the
  // light, a beam block in front hides it, and a filter alone collects nothing.
  const collectors = (params = {}) => source({ catchMode: 'collectors', ...params });
  close(signal([collectors()], faceAt(500)), 0.25, 'bare detector');
  close(signal([collectors(), at('filter', 200, 0, { ftype: 'nd', trans: 0.3 })], faceAt(500)), 0.075, 'ND in front');
  assert.equal(signal([collectors(), at('blocker', 200)], faceAt(500)), 0, 'blocked');
  assert.equal(signal([collectors()], faceAt(1100)), 0, 'out of range');
  assert.ok(fadesAtGlow(sourcePoints([collectors(), at('filter', 300)])), 'a filter alone still collects nothing');
  assert.equal(signal([source({ catchMode: 'lensmirror' })], faceAt(500)), 0, 'the saved rule: no detector');
  // The eye is a detector too: its retina reads a source in front of it.
  const eye = at('eye', 400);
  paths([collectors({ nrays: 64 }), eye]);
  assert.ok((detectorReading(eye.id)?.signal ?? 0) > 0, 'the eye reads it');
});

test('the range reaches 100 m, is clamped there, and a bare detector reads only inside it', () => {
  assert.equal(load([source({ captureRange: 1e9 })])[0].params.captureRange, 100000);
  close(signal([source()], at('detector', 500)), 0.25, 'inside 1 m');
  assert.equal(signal([source()], at('detector', 1500)), 0, 'outside 1 m');
  close(signal([source({ captureRange: 2000 })], at('detector', 1500)), 0.25, 'range raised to 2 m');
  close(signal([source({ captureRange: 100000 })], faceAt(99000)), 0.25, 'a detector 99 m away, directly');
  // The boundary is included.
  close(signal([source({ captureRange: 400 })], faceAt(400)), 0.25, 'at the boundary');
  assert.equal(signal([source({ captureRange: 400 })], faceAt(400.1)), 0, 'just past it');
});

// Placed so the ray along +x meets a surface: a slit's axis runs through its
// gap, and a sample or stage at 0° lies along the ray. A D-shaped mirror is
// set to reflect the first pass, the only one a ray from the source makes.
const PLACE = { slit: { y: 10 }, sample: { rot: 90 }, stage: { rot: 90 }, dmirror: { params: { reflectsOn: 'first' } } };

test('every element with a traced surface catches within range, except a light source', () => {
  const missed = [];
  for (const [type, def] of Object.entries(registry)) {
    if (def.hidden || type === 'pointsource') continue;
    const probe = createElement(type, 500, 0);
    const traced = (def.surfaces?.(probe) || []).length > 0;
    const { y = 0, rot = 0, params = {} } = PLACE[type] || {};
    const near = sourcePoints([source({ nrays: 64 }), at(type, 500, y, params, rot)]);
    const far = sourcePoints([source({ nrays: 64 }), at(type, 1500, y, params, rot)]);
    assert.ok(fadesAtGlow(far), `${type} 1.5 m away is out of range`);
    if (def.category === 'Sources' || !traced) {
      assert.ok(fadesAtGlow(near), `${type} must not catch the rays`);
    } else if (!(reach(near) > 300)) {
      missed.push(type);
    }
  }
  assert.deepEqual(missed, [], 'these optics did not catch a ray aimed at them');
});

test('a light source near the lamp neither catches its rays nor is lit by them', () => {
  for (const type of ['cwlaser', 'pulsedlaser', 'sclaser', 'ledsource']) {
    for (const x of [80, 300, 900]) {
      // Its housing faces the source, its own beam points away.
      assert.ok(fadesAtGlow(sourcePoints([source({ nrays: 64 }), at(type, x, 0, {}, 180)])), `${type} at ${x} mm`);
    }
  }
});

test('filters and polarizers act on the light without any lens; opaque things block it', () => {
  const detector = () => at('detector', 600);
  close(signal([source(), at('filter', 200, 0, { ftype: 'nd', trans: 0.3 })], detector()), 0.075, 'ND');
  close(signal([source(), at('polarizer', 200)], detector()), 0.125, 'polarizer');
  assert.equal(signal([source(), at('filter', 200, 0, { ftype: 'bandpass', center: 800, band: 10 })], detector()), 0);
  for (const type of ['blocker', 'beamdump', 'box']) {
    const opaque = at(type, 300);
    assert.equal(signal([source(), opaque], detector()), 0, type);
    // Caught, so the ray is drawn all the way to it rather than fading.
    assert.ok(reach(sourcePoints([source(), opaque])) > 250, `${type} is reached`);
  }
});

test('diagram-only elements change nothing', () => {
  const open = signal([source()], at('detector', 600));
  close(open, 0.25);
  close(signal([source(), at('textlabel', 150), at('window', 300), at('gascell', 450)], at('detector', 600)), open);
});

test('after an optic that does not collect, only the range that is left counts', () => {
  const nd = () => at('filter', 300, 0, { ftype: 'nd', trans: 0.3 });
  close(signal([source(), nd()], faceAt(900)), 0.075, 'detector 600 mm on, 100 mm inside the range');
  assert.equal(signal([source(), nd()], faceAt(1100)), 0, 'detector past the source range');
  close(signal([source({ captureRange: 1500 }), nd()], faceAt(1100)), 0.075, 'range raised');
  // A cube beamsplitter hands the range on along both of its ports.
  const cube = () => at('bs', 300);
  assert.ok(signal([source(), cube()], faceUp(300, 600)) > 0, 'reflected port, 900 mm of path');
  assert.equal(signal([source(), cube()], faceUp(300, 800)), 0, 'reflected port, 1100 mm of path');
  assert.ok(signal([source(), cube()], faceAt(900)) > 0, 'transmitted port, 900 mm');
  assert.equal(signal([source(), cube()], faceAt(1100)), 0, 'transmitted port, 1100 mm');
});

test('a cavity of optics that do not collect is traced only as far as the range reaches', () => {
  // Found in review of #260: the cavity sum treated the light between two
  // notch reflectors as an endless series of round trips, though the range
  // runs out after a few. Each pass gives 10% to the detector behind them.
  const notch = x => at('dichroic', x, 0, { dtype: 'notch', center: 550, band: 50, bandRefl: 90 });
  const read = captureRange => signal([source({ wavelength: 550, captureRange }), notch(-50), notch(50)], faceAt(100));
  close(read(1000), 0.25 * (1 - 0.9 ** 10), 'ten passes inside 1 m');
  close(read(500), 0.25 * (1 - 0.9 ** 5), 'five inside 500 mm');
  // Two partial mirrors collect what they reflect, so that cavity is ordinary
  // light and is summed whole.
  const mirror = x => at('mirror', x, 0, { refl: 90, showTransmitted: true });
  close(signal([source({ wavelength: 550 }), mirror(-50), mirror(50)], faceAt(100)), 0.25, 'collected cavity');
});

test('a lens or a mirror collects: what leaves it is ordinary light at any distance', () => {
  close(signal([source(), at('lens', 500, 0, { f: 100, dia: 200 })], at('detector', 3000, 0, { aperture: 200 })), 0.25, 'lens');
  // A fold mirror sends the collected ray to a detector 2 m away.
  close(signal([source(), at('mirror', 300, 0, {}, 45)], faceUp(300, 2000)), 0.25, 'mirror');
  // A filter in front of the lens still filters the light it collects.
  close(signal([source(), at('filter', 200, 0, { ftype: 'nd', trans: 0.5 }), at('lens', 500, 0, { f: 100, dia: 200 })],
    at('detector', 3000, 0, { aperture: 200 })), 0.125, 'filter then lens');
});

test('a partial mirror collects what it reflects; its leak keeps the range that is left', () => {
  const mirror = () => at('mirror', 200, 0, { refl: 30, showTransmitted: true });
  close(signal([source(), mirror()], faceAt(900)), 0.25 * 0.7, 'leak inside the range');
  assert.equal(signal([source(), mirror()], faceAt(1100)), 0, 'leak past the range');
  const folded = () => at('mirror', 200, 0, { refl: 30, showTransmitted: true }, 45);
  close(signal([source(), folded()], faceUp(200, 2000)), 0.25 * 0.3, 'reflected port, 2 m away');
  close(signal([source(), folded()], faceAt(900)), 0.25 * 0.7, 'leak of the fold, inside the range');
});

test('light nothing catches fades out, also after an optic it went through', () => {
  assert.ok(fadesAtGlow(sourcePoints([source()])), 'nothing around: the 110 mm glow');
  const filtered = paths([source(), at('filter', 300, 0, { ftype: 'nd', trans: 0.3 })]);
  const beyond = filtered.filter(d => d.pts.every(p => p.x >= 300 - 1e-6) && d.pts.some(p => p.x > 300 + 1e-6));
  assert.ok(beyond.length > 1, 'the light past the filter is drawn as a fading glow');
  close(Math.max(...beyond.flatMap(d => d.pts.map(p => p.x))), 410, 'faded out 110 mm past the filter');
  assert.ok(beyond.every(d => d.opacity < 0.6), 'dimmer than a caught ray');
  // Never drawn past the range: 50 mm were left at a filter 950 mm away.
  const late = allPoints([source(), at('filter', 950, 0, { ftype: 'nd', trans: 0.3 })]);
  close(reach(late), 1000, 'glow capped by the range');
});

test('freeform glass alone refracts the light into a detector', () => {
  const glass = at('freeglass', 200, 0, {
    transEff: 80, vertices: [{ x: -20, y: -100 }, { x: 20, y: -100 }, { x: 20, y: 100 }, { x: -20, y: 100 }],
  }, 25);
  close(signal([source(), glass], at('detector', 500, 0, { aperture: 100 })), 0.25 * 0.8 ** 2, 'two surfaces');
  const shifted = allPoints([source(), glass]).filter(p => p.x > 230);
  assert.ok(shifted.some(p => Math.abs(p.y) > 1), 'the ray leaves the glass displaced');
});

test('a lamp\'s lines reach a bare detector and a grating', () => {
  const lamp = source({ sourceKind: 'lamp', lampType: 'na' });
  const detector = at('detector', 500);
  close(signal([lamp], detector), 0.25);
  const reading = detectorReading(detector.id);
  assert.ok(reading.bandMax > reading.bandMin, 'both sodium lines arrive');
  assert.ok(sourcePoints([lamp, at('grating', 200)]).some(p => p.x < 190 && Math.abs(p.y) > 1), 'diffracted orders are traced');
});

test('fluorescence a point source pumps keeps its own collection rules', () => {
  // The sample is caught without collecting, so the pump leaving it keeps the
  // range that is left; the light it emits is a new emitter and must not.
  const sample = at('sample', 300, 0, {
    specimenType: 'linear', transmission: 1,
    channels: [{ kind: 'fluor', wl: 600, eff: 0.1, epi: false, epiRatio: 0.15, autoWl: false }],
  }, 90);
  const detector = at('detector', 340, 0, { aperture: 120 });
  paths([source({ wavelength: 532 }), sample, detector]);
  const reading = detectorReading(detector.id);
  assert.ok(reading?.signal > 0, 'the pump reaches the detector');
  const fluorescence = (reading.spectrum || []).filter(c => Math.abs(c.wavelength - 600) < 1).reduce((s, c) => s + c.power, 0);
  assert.equal(fluorescence, 0, 'a bare detector does not collect fluorescence, as on main');
});
