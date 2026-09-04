import test from 'node:test';
import assert from 'node:assert/strict';

import { categories, createElement, formatPower, getDirectManipulation, peakPowerW, registry } from '../sketch/js/elements.js';
import { detectorReading, traceAll, traceScene } from '../sketch/js/raytrace.js';
import { elementDriveHz, recommendedTimeScale } from '../sketch/js/timescale.js';
import { applyInput, initInspector, renderInspector } from '../sketch/js/inspector.js';
import { state } from '../sketch/js/state.js';
import '../sketch/js/detector-instruments.js';

const LASERS = ['cwlaser', 'pulsedlaser', 'sclaser'];

// ---------------- the split itself ----------------

test('the three laser sources are separate palette entries and the old catch-all is gone', () => {
  assert.equal(Object.hasOwn(registry, 'laser'), false, 'the all-in-one laser type must not survive the split');
  for (const type of LASERS) {
    assert.ok(registry[type], `${type} should exist`);
    assert.equal(registry[type].category, 'Sources');
  }
  assert.deepEqual(LASERS.map(t => registry[t].label), ['CW Laser', 'Pulsed Laser', 'Supercontinuum laser']);
  // distinct, ascending order so the palette lists them CW, pulsed, SC
  assert.deepEqual(LASERS.map(t => registry[t].paletteOrder), [0, 1, 2]);
  const sourceOrders = Object.values(registry)
    .filter(def => def.category === 'Sources' && Number.isFinite(def.paletteOrder))
    .map(def => def.paletteOrder);
  assert.equal(new Set(sourceOrders).size, sourceOrders.length, 'no two Sources may claim the same palette slot');
  assert.ok(categories.includes('Sources'));
});

test('no laser source still offers the emission switch the split replaced', () => {
  for (const type of LASERS) {
    const emission = registry[type].params.find(p => p.key === 'temporalMode');
    assert.ok(emission, `${type} still pins temporalMode for the tracer`);
    assert.equal(emission.show(), false, `${type} must not render an Emission selector`);
    assert.equal(emission.options.length, 1, `${type} temporalMode is fixed by its element type`);
  }
  assert.equal(createElement('cwlaser').params.temporalMode, 'cw');
  assert.equal(createElement('pulsedlaser').params.temporalMode, 'pulsed');
  assert.equal(createElement('sclaser').params.temporalMode, 'pulsed');
});

test('each source icon matches what it emits', () => {
  const cw = registry.cwlaser.svg(createElement('cwlaser'));
  assert.match(cw, />CW LASER</, 'the CW box says so in its label');
  assert.doesNotMatch(cw, /8fd3ff/, 'and carries no pulse glyphs');

  const pulsed = registry.pulsedlaser.svg(createElement('pulsedlaser'));
  assert.match(pulsed, />LASER</);
  assert.match(pulsed, /stroke="#8fd3ff"/, 'the pulsed box keeps its pulse-train glyphs');

  const sc = registry.sclaser.svg(createElement('sclaser'));
  assert.match(sc, />SC LASER</);
  assert.match(sc, /#7c3aed/, 'the SC box keeps its spectral stripes');
});

// ---------------- emission geometry, shared ----------------

test('every laser source shares the same beam geometry contract', () => {
  for (const type of LASERS) {
    const el = createElement(type, 0, 0);
    assert.equal(registry[type].source(el).length, 25, `${type} samples a sized beam`);
    el.params.beamMode = 'line';
    assert.equal(registry[type].source(el).length, 1, `${type} collapses to one ray in line mode`);
    assert.deepEqual(registry[type].snapPt, { x: 52, y: 0 });
    const direct = getDirectManipulation(el);
    assert.equal(direct.resize.y, 'beamWidth', `${type} resizes by beam width`);
  }
});

// ---------------- peak power readout ----------------

test('the pulsed laser reports peak power as a derived, non-editable readout', () => {
  const spec = registry.pulsedlaser.params.find(p => p.key === 'peakPower');
  assert.equal(spec.type, 'readout');
  assert.equal(typeof spec.readout, 'function');

  const laser = createElement('pulsedlaser');
  assert.match(spec.readout(laser.params), /^[\d.]+ kW$/);

  // it must track the fields it derives from, in the right direction
  const base = peakPowerW(laser.params);
  assert.ok(peakPowerW({ ...laser.params, pulseWidthFs: 75 }) > base, 'a shorter pulse peaks higher');
  assert.ok(peakPowerW({ ...laser.params, repRateMHz: 160 }) < base, 'a faster train peaks lower');
  assert.ok(peakPowerW({ ...laser.params, avgPowerW: 0.2 }) > base, 'more average power peaks higher');
  // sech² concentrates slightly less of its energy at the peak than a Gaussian
  assert.ok(peakPowerW({ ...laser.params, pulseShape: 'sech2' }) < base);
});

test('a committed edit refreshes every readout the element carries', () => {
  // Readouts are derived, so an edit to any param can change them. Without a
  // rebuild on commit, peak power and the transform-limited bandwidth would
  // keep showing the values they had before the edit.
  const panel = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  const laser = createElement('pulsedlaser', 0, 0);
  state.elements = [laser];
  state.beams = [];
  state.selection = { kind: 'element', id: laser.id };
  state.embedMode = false;
  initInspector(panel);
  renderInspector();
  assert.match(panel.innerHTML, /7\.83 kW/);

  const commit = (key, value) => {
    const input = { dataset: { p: key }, type: 'number', value: String(value) };
    applyInput(input, true);
  };
  commit('avgPowerW', 0.2);
  assert.match(panel.innerHTML, /15\.7 kW/, 'doubling average power doubles the peak');

  commit('pulseWidthFs', 300);
  assert.match(panel.innerHTML, /7\.83 kW/, 'doubling the duration halves it again');
  assert.match(panel.innerHTML, />1\.388</, 'and the derived bandwidth halves with it');
});

test('peak power is never stored on the element, only computed for display', () => {
  assert.equal(createElement('pulsedlaser').params.peakPower, undefined);
  assert.equal(JSON.parse(JSON.stringify(createElement('pulsedlaser').params)).peakPower, undefined);
});

test('power formatting scales to a readable unit and refuses to invent one', () => {
  assert.equal(formatPower(7828), '7.83 kW');
  assert.equal(formatPower(2.5e6), '2.5 MW');
  assert.equal(formatPower(0.5), '500 mW');
  assert.equal(formatPower(2), '2 W');
  assert.equal(formatPower(0.002), '2 mW');
  assert.equal(formatPower(0), '—');
  assert.equal(formatPower(Number.NaN), '—');
});

// ---------------- show pulse dynamics ----------------

test('hiding pulse dynamics drops the packet overlay while the pulse physics keeps running', () => {
  for (const type of ['pulsedlaser', 'sclaser']) {
    const laser = createElement(type, 0, 0);
    const detector = createElement('detector', 300, 0);

    const shown = traceScene([laser, detector]);
    assert.ok(shown.pulseTracks.length > 0, `${type} draws packets by default`);

    laser.params.showPulse = false;
    const hidden = traceScene([laser, detector]);
    assert.equal(hidden.pulseTracks.length, 0, `${type} draws no packets once hidden`);
    assert.equal(hidden.drawables.length, shown.drawables.length, 'the beam itself is unchanged');

    // still a pulsed source everywhere the physics cares
    assert.equal(elementDriveHz(laser), 80e6, 'still drives the simulated clock');
    traceAll([laser, detector]);
    assert.ok(detectorReading(detector.id).pulse, 'a detector still sees a pulse train');
  }
});

test('a hidden pulse train still sets the recommended time scale', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  laser.params.showPulse = false;
  assert.equal(recommendedTimeScale([laser]).driver, 'the pulsed source');
});

// ---------------- the CW source is genuinely steady ----------------

test('the CW laser produces no pulse train at all', () => {
  const laser = createElement('cwlaser', 0, 0);
  const detector = createElement('detector', 300, 0);
  const scene = traceScene([laser, detector]);
  assert.equal(scene.pulseTracks.length, 0);
  assert.equal(elementDriveHz(laser), null, 'a steady source drives no clock');
  assert.equal(recommendedTimeScale([laser]).driver, null);

  traceAll([laser, detector]);
  assert.ok(!detectorReading(detector.id).pulse, 'nothing for an oscilloscope to plot');
});

// ---------------- supercontinuum colour vs. dispersion ----------------

test('the supercontinuum ships a fixed white beam but still disperses into a rainbow', () => {
  const source = createElement('sclaser', 0, 0);
  source.params.beamMode = 'line';
  source.params.scMin = 450;
  source.params.scMax = 700;

  // Undispersed, as a single line: the co-propagating spectral halo, which
  // deliberately suggests a spectrum without implying it has been spread out
  // in space yet.
  const straight = traceScene([source]).drawables.filter(d => d.type === 'path');
  assert.deepEqual(straight.map(d => d.color), ['#7c3aed', '#f97316', '#dbe7f5']);

  // Undispersed, as a sized beam: one flat broadband white across the aperture.
  source.params.beamMode = 'beam';
  const wide = traceScene([source]).drawables.filter(d => d.type === 'path' || d.type === 'band');
  assert.deepEqual([...new Set(wide.map(d => d.color))], ['#cbd8ea'],
    'the default SC beam colour reproduces the broadband white the tracer already used');
  source.params.beamMode = 'line';

  // through a prism: each sampled wavelength regains its own colour, so the
  // source's fixed beam colour must not flatten the fan
  const prism = createElement('prism', 180, 0);
  prism.params.psize = 50;
  prism.rot = 20;
  const fanned = traceScene([source, prism]).drawables
    .filter(d => d.type === 'path' && d.pts.length >= 3);
  assert.ok(new Set(fanned.map(d => d.color)).size >= 5,
    'a fixed source colour must not collapse the dispersed fan to one colour');
});
