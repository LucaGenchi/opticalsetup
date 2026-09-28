// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The beam probe with several beams in its sampling circle: which beams it
// finds (probeBeamsAt), and what its spectrum, wavelength, polarization and
// time views say about them. With one beam every view is unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceScene, probeBeamsAt } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import {
  probeBeamWeights, combinedSpectrumSamples, probeTimingSummary, probeTimingLabel,
} from '../sketch/js/probe.js';
import { C_MM_PER_NS } from '../sketch/js/pulses.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tolerance ${tol})`);

const pulsed = (x, y, wavelength, avgPowerW, extra = {}) => {
  const l = createElement('pulsedlaser', x, y);
  Object.assign(l.params, { wavelength, avgPowerW, repRateMHz: 80, pulseWidthFs: 300, beamMode: 'line', ...extra });
  return l;
};
// Two lasers 3 mm apart, both inside a 10 mm circle; the second starts 3 mm
// further back, so its pulses arrive 3 mm / c = 10.007 ps later.
function twoLasers(second = {}) {
  const a = pulsed(0, 0, 800, 0.1, { pol: 0 });
  const b = pulsed(-3, 3, 1040, 0.2, { pol: 90, ...second });
  return [a, b];
}
const probeCard = (prop, elements, x = 300, y = 1.5) => {
  const probe = createElement('probe', x, y);
  probe.params.prop = prop;
  traceScene([...elements, probe], []);
  return registry.probe.svg(probe, [...elements, probe]);
};

test('the probe finds each beam crossing its circle, and one beam for one laser however it is sampled', () => {
  const elements = twoLasers();
  traceScene(elements, []);
  const beams = probeBeamsAt(300, 1.5, 5);
  assert.deepEqual(beams.map(b => Math.round(b.wl)), [800, 1040]);
  assert.deepEqual(beams.map(b => b.pol), [0, 90]);
  near(beams[1].arrivalNs - beams[0].arrivalNs, 3 / C_MM_PER_NS, 1e-9, '3 mm further back');
  assert.equal(probeBeamsAt(300, 0, 1).length, 1, 'a 2 mm circle on one beam finds only it');
  // A 4 mm wide beam through a lens: five sampling rays, one beam.
  const wide = pulsed(0, 0, 800, 0.1, { beamMode: 'beam', beamWidth: 4 });
  traceScene([wide, createElement('lens', 150, 0)], []);
  const one = probeBeamsAt(250, 0, 5);
  assert.equal(one.length, 1);
  near(one[0].power, 1, 1e-12);
});

// The Mach-Zehnder fixture with a pulsed source; the second beamsplitter's
// output port is at (700, 400).
function pulsedMachZehnder() {
  const scene = parseSketch(readFileSync('test/fixtures/mach-zehnder.json', 'utf8'), registry);
  const elements = scene.elements.filter(e => !['camera', 'display', 'textlabel'].includes(e.type));
  const cw = elements.find(e => e.type === 'cwlaser');
  elements.splice(elements.indexOf(cw), 1, pulsed(cw.x, cw.y, 800, 0.1, { pulseWidthFs: 100 }));
  return elements;
}

test('two arms of one pulsed laser are two beams when their pulses arrive apart', () => {
  const elements = pulsedMachZehnder();
  const delay = elements.find(e => e.type === 'delayline');
  delay.params.delayMm = 0;
  traceScene(elements, []);
  assert.equal(probeBeamsAt(700, 400, 5).length, 1, 'equal arms: the pulses coincide, one beam');
  delay.params.delayMm = 3;
  traceScene(elements, []);
  const arms = probeBeamsAt(700, 400, 5);
  assert.equal(arms.length, 2, 'a 3 mm longer arm: two beams');
  near(arms[1].arrivalNs - arms[0].arrivalNs, 3 / C_MM_PER_NS, 1e-9);
  assert.equal(probeTimingLabel(probeTimingSummary(arms)), 'delayed 10 ps', 'one colour: the delay alone');
  // The wavelength view has nothing new to say about two arms of one colour:
  // it keeps its single-beam card. The time view shows the delay.
  const card = prop => {
    const probe = createElement('probe', 700, 400);
    probe.params.prop = prop;
    traceScene([...elements, probe], []);
    return registry.probe.svg(probe, [...elements, probe]);
  };
  assert.doesNotMatch(card('wl'), /data-probe-beams/);
  assert.doesNotMatch(card('wl'), /stroke-dasharray/, 'nor its sampling circle');
  assert.match(card('time'), /data-probe-timing="delayed"/);
  assert.match(card('time'), /stroke-dasharray/, 'the circle shows when several beams are read');
});

test('round trips of a synchronously pumped cavity, a whole period apart, are one beam', async () => {
  const { sceneFiles, sceneFromFile } = await import('../tools/update-golden.mjs');
  const file = (await sceneFiles()).find(f => /optical-parametric-oscillator-ring-cavity/.test(f.slug));
  const scene = sceneFromFile(readFileSync(file.path, 'utf8'));
  traceScene(scene.elements, scene.beams || []);
  const cavity = scene.elements.find(e => e.id === 'cavity-wavelength');
  // Twelve passes round the ring, 12.5 ns (one 80 MHz period) apart.
  assert.equal(probeBeamsAt(cavity.x, cavity.y, 5).length, 1);
});

test('the time view says whether pulses arrive together, which comes first, and by how much', () => {
  const beam = (wl, arrivalNs, extra = {}) => ({ wl, arrivalNs, pulse: { repRateMHz: 80, pulseWidthFs: 300, durationFs: 300, ...extra } });
  const together = probeTimingSummary([beam(800, 1), beam(1040, 1 + 100e-6)]);
  assert.equal(together.state, 'synced', '100 fs apart, within half of a 300 fs pulse');
  assert.equal(probeTimingLabel(together), 'synced');
  // Without a known duration at the probe, the verdict says what it used.
  assert.equal(probeTimingLabel(probeTimingSummary([beam(800, 1, { durationFs: null }), beam(1040, 1)])), 'synced (by source widths)');
  const apart = probeTimingSummary([beam(800, 1 + 0.01), beam(1040, 1)]);
  assert.equal(apart.state, 'delayed');
  assert.equal(probeTimingLabel(apart), '800 nm 10 ps after 1040 nm');
  // The delay is taken within one period: 12.49 ns apart at 80 MHz is 10 ps early.
  const wrapped = probeTimingSummary([beam(800, 1), beam(1040, 1 + 12.49)]);
  near(wrapped.beams[1].delayNs, 0.01, 1e-9);
  assert.equal(wrapped.beams[0].beam.wl, 1040, 'the 1040 nm pulse comes first');
  // Trains at different rates have no fixed delay.
  const rates = probeTimingSummary([beam(800, 1), beam(1040, 1, { repRateMHz: 76 })]);
  assert.equal(rates.state, 'rates');
  assert.match(probeTimingLabel(rates), /not synced/);
  // A continuous beam takes no part; one pulsed beam alone has nothing to compare.
  assert.equal(probeTimingSummary([beam(800, 1), { wl: 1040, arrivalNs: 1, pulse: null }]), null);
});

test('the combined spectrum is a power density: each beam contributes its watts', () => {
  const beams = [{ wl: 800, bw: 0, spec: null, power: 1, originId: 'a' }, { wl: 1040, bw: 0, spec: null, power: 1, originId: 'b' }];
  const { weights, absolute } = probeBeamWeights(beams, [{ id: 'a', params: { avgPowerW: 0.1 } }, { id: 'b', params: { avgPowerW: 0.2 } }]);
  assert.equal(absolute, true);
  assert.deepEqual(weights, [0.1, 0.2]);
  const samples = combinedSpectrumSamples(beams, weights, 700, 1150, 900);
  const area = samples.slice(1).reduce((sum, s, i) => sum + (s.wl - samples[i].wl) * (s.weight + samples[i].weight) / 2, 0);
  near(area, 0.3, 1e-6, 'the density integrates to the total watts');
  const peakNear = wl => Math.max(...samples.filter(s => Math.abs(s.wl - wl) < 10).map(s => s.weight));
  near(peakNear(1040) / peakNear(800), 2, 1e-3, 'the 0.2 W line stands twice as tall as the 0.1 W one (to the sampling grid)');
  // A source without a power setting: relative weights, flagged.
  assert.equal(probeBeamWeights(beams, [{ id: 'a', params: { avgPowerW: 0.1 } }, { id: 'b', params: {} }]).absolute, false);
});

test('each view shows every beam in the circle', () => {
  const elements = twoLasers();
  const spectrum = probeCard('spectrum', elements);
  assert.match(spectrum, /data-probe-beams="2" data-probe-weights="watts"/);
  assert.match(spectrum, /800 · 1040 nm/);
  const wl = probeCard('wl', elements);
  assert.match(wl, /800 ± 2 nm/);
  assert.match(wl, /1040 ± 3 nm/);
  const pol = probeCard('pol', elements);
  assert.match(pol, /linear 0°/);
  assert.match(pol, /linear 90°/);
  assert.match(pol, /800 nm/);
  assert.match(pol, /1040 nm/);
  const time = probeCard('time', elements);
  assert.match(time, /data-probe-timing="delayed"/);
  assert.match(time, /1040 nm 10 ps after 800 nm/);
  // Moved level with each other, the two pulses arrive together.
  assert.match(probeCard('time', twoLasers({ x: 0 }).map((l, i) => (i ? Object.assign(l, { x: 0 }) : l))), /data-probe-timing="synced"/);
});

test('with one beam in the circle every view reads it as before, and more than four are summarised', () => {
  const one = [pulsed(0, 0, 800, 0.1)];
  assert.doesNotMatch(probeCard('spectrum', one, 300, 0), /data-probe-beams/);
  assert.doesNotMatch(probeCard('time', one, 300, 0), /data-probe-timing/);
  const many = [0, 2, 4, 6, 8].map((y, i) => pulsed(0, y - 4, 700 + 50 * i, 0.1));
  const wl = probeCard('wl', many, 300, 0);
  assert.match(wl, /\+1 more/);
});

// Andrea's findings on c9b8470.
test('a broad band and a line together: each integrates to its own watts', () => {
  const beams = [
    { wl: 800, bw: 200, spec: { kind: 'flat', lo: 700, hi: 900 }, power: 1, originId: 'band' },
    { wl: 800, bw: 0, spec: null, power: 1, originId: 'line' },
    { wl: 900, bw: 100, spec: { kind: 'gauss', center: 900, fwhm: 100 }, power: 1, originId: 'gauss' },
  ];
  const weights = [0.1, 0.1, 0.1];
  const samples = combinedSpectrumSamples(beams, weights, 400, 1300, 4000);
  const area = samples.slice(1).reduce((sum, s, i) => sum + (s.wl - samples[i].wl) * (s.weight + samples[i].weight) / 2, 0);
  near(area, 0.3, 2e-3, 'was ~57 W: the band alone integrated to ~40 W');
});

test('two lasers at one centre but different widths are summed, not reduced to the nearest', () => {
  const narrow = pulsed(0, 0, 800, 0.1, { pulseWidthFs: 1000 });
  const broad = pulsed(0, 3, 800, 0.1, { pulseWidthFs: 10 });
  const card = probeCard('spectrum', [narrow, broad]);
  assert.match(card, /data-probe-beams="2"/);
  assert.match(card, />800 nm</, 'one colour in the caption');
});

test('two arms gated at different frequencies are two beams, each with its own gate', () => {
  const elements = pulsedMachZehnder();
  const chop = (x, y, frequencyHz) => Object.assign(createElement('chopper', x, y), {}, {
    params: { ...createElement('chopper', x, y).params, frequencyHz },
  });
  elements.push(chop(400, 200, 1000), chop(450, 400, 2000));
  traceScene(elements, []);
  const beams = probeBeamsAt(700, 400, 5);
  const rates = beams.map(beam => beam.pulse.gates.map(g => g.frequencyMHz)).flat().sort();
  assert.equal(beams.length, 2, `${beams.length} beams`);
  assert.deepEqual(rates, [0.001, 0.002], 'was one beam carrying the 2 kHz gate');
});

test('the sampling rays of a focused beam are one beam; a 200 fs arm difference is two', () => {
  const wide = pulsed(0, 0, 800, 0.1, { beamMode: 'beam', beamWidth: 20, pulseWidthFs: 100 });
  const lens = createElement('lens', 100, 0);
  lens.params.f = 30;
  traceScene([wide, lens], []);
  assert.equal(probeBeamsAt(130, 0, 5).length, 1, 'was nine beams, up to 5.41 ps apart');
  const elements = pulsedMachZehnder();
  elements.find(e => e.type === 'delayline').params.delayMm = 0.06;
  traceScene(elements, []);
  const arms = probeBeamsAt(700, 400, 5);
  assert.equal(arms.length, 2, 'was one beam below the old 0.1 mm floor');
  near(arms[1].arrivalNs - arms[0].arrivalNs, 0.06 / C_MM_PER_NS, 1e-9);
  assert.match(probeTimingLabel(probeTimingSummary(arms)), /^delayed 0\.2 ps/);
});

test('the time plot draws each train at its arrival, counting the emission phase once', () => {
  // Same path, the second source emitting 1 ns later: first pulses at 0 and 1 ns.
  const a = pulsed(0, 0, 800, 0.1);
  const b = pulsed(0, 3, 1040, 0.1, { pulsePhaseNs: 1 });
  const card = probeCard('time', [a, b]);
  const firsts = [...card.matchAll(/data-probe-first-pulse-ns="([^"]+)"/g)].map(m => Number(m[1])).sort((p, q) => p - q);
  assert.equal(firsts.length, 2);
  near(firsts[0], 0, 1e-9);
  near(firsts[1], 1, 1e-9, 'was drawn at 2 ns');
  assert.match(card, /1040 nm 1 ns after 800 nm/);
});

test('a spectrum without every source\'s watts says it is relative, on the card', () => {
  const a = pulsed(0, 0, 800, 0.1), b = pulsed(0, 3, 1040, 0.1);
  delete b.params.avgPowerW;
  const card = probeCard('spectrum', [a, b]);
  assert.match(card, /data-probe-weights="relative"/);
  assert.match(card, /· relative</);
});
