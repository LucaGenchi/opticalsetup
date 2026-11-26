// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The four routing examples do what their pages say: each is traced as
// shipped, then with the one control its page tells the reader to change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';

const close = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

// Trace an example, optionally after editing elements by id, and return a
// reader of detector readings by id. Readings are snapshotted because the
// next trace replaces the tracer's detector cache.
async function run(path, edit = () => {}) {
  const text = await readFile(new URL(`../Examples/${path}.json`, import.meta.url), 'utf8');
  const scene = parseSketch(text, registry);
  const byId = id => scene.elements.find(el => el.id === id);
  edit(byId);
  const traced = traceScene(scene.elements, scene.beams);
  for (const drawable of traced.drawables) {
    for (const point of drawable.pts || []) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  }
  const readings = new Map(scene.elements
    .filter(el => registry[el.type].readoutKind && el.type !== 'display')
    .map(el => [el.id, structuredClone(enhancedReading(el, scene.elements))]));
  return id => readings.get(id);
}
const signal = reading => reading ? reading.signal : 0;

const WAVELENGTHS = 'Beam Routing/Wavelength combining and separation — dichroic mirrors';
const SEND_RETURN = 'Beam Routing/Polarization send–return separation — PBS and quarter-wave plate';
const EPI = 'Microscopy Implementations/Epi-fluorescence microscope';
const IQ = 'Interferometers/IQ optical modulator — nested Mach–Zehnder';

test('three colours share one axis and each leaves at its own port', async () => {
  const at = await run(WAVELENGTHS);
  for (const [port, wl] of [['out-488', 488], ['out-561', 561], ['out-640', 640]]) {
    close(at(port).signal, 0.9);
    close(at(port).bandMin, wl);
    close(at(port).bandMax, wl);
  }
  // The pick-off sees all three colours on the shared axis.
  close(at('monitor').signal, 0.3);
  close(at('monitor').bandMin, 488);
  close(at('monitor').bandMax, 640);
});

test('a dichroic edge on the wrong side of a colour sends it to the next port', async () => {
  const at = await run(WAVELENGTHS, byId => { byId('split-488').params.cutoff = 450; });
  assert.equal(at('out-488'), null);
  close(at('out-561').signal, 1.8);
  close(at('out-561').bandMin, 488);
  close(at('out-640').signal, 0.9);
});

test('a combiner edge on the wrong side never puts its laser on the axis', async () => {
  const at = await run(WAVELENGTHS, byId => { byId('combine-488').params.cutoff = 450; });
  assert.equal(at('out-488'), null);
  close(at('monitor').signal, 0.2);
  close(at('out-561').signal, 0.9);
});

test('the quarter-wave double pass sends the whole return to the return port', async () => {
  close((await run(SEND_RETURN))('receive').signal, 1);
  // Fast axis along the polarization: the return retraces to the laser.
  close(signal((await run(SEND_RETURN, byId => { byId('qwp').params.a = 0; }))('receive')), 0);
  // Halfway: elliptical on the way out, half the return at each port.
  close((await run(SEND_RETURN, byId => { byId('qwp').params.a = 22.5; }))('receive').signal, 0.5);
});

test('the half-wave plate sets how much light is sent at all', async () => {
  close((await run(SEND_RETURN, byId => { byId('hwp').params.a = 22.5; }))('receive').signal, 0.5);
  close(signal((await run(SEND_RETURN, byId => { byId('hwp').params.a = 45; }))('receive')), 0);
});

test('only the fluorescence reaches the epi PMT, through the pinhole', async () => {
  const pmt = (await run(EPI))('pmt');
  assert.ok(pmt.signal > 5e-4 && pmt.signal < 0.05, `collected fraction ${pmt.signal}`);
  // The 525/50 filter's own band, to within its sampling: nothing at 488 nm.
  assert.ok(pmt.bandMin > 495 && pmt.bandMax < 555, `${pmt.bandMin}–${pmt.bandMax} nm`);
  assert.ok(pmt.spotSpan <= 0.5, 'only light through the 0.5 mm pinhole reaches the PMT');
});

test('the pinhole stops the fluorescence from above and below the focus', async () => {
  // The 2 mm layer glows all along the beam; a 2 mm pinhole passes all of it,
  // the 0.5 mm one only the part near the focus.
  const narrow = signal((await run(EPI))('pmt'));
  const wide = signal((await run(EPI, byId => { byId('pinhole').params.gap = 2; }))('pmt'));
  close(narrow / wide, 0.75, 0.02);
  // A thin layer moved 1 mm off the focus sends nothing through the 0.5 mm pinhole.
  const thin = byId => { byId('stage').params.activeThickness = 0.5; };
  assert.ok(signal((await run(EPI, thin))('pmt')) > 0);
  close(signal((await run(EPI, byId => { thin(byId); byId('stage').y += 1; }))('pmt')), 0);
});

test('the epi PMT goes dark when the filters stop matching the dye', async () => {
  // An emission filter clear of the GFP band passes nothing: no 488 nm leak.
  close(signal((await run(EPI, byId => { byId('emission-filter').params.center = 620; }))('pmt')), 0);
  // A dichroic edge below the laser line transmits the excitation instead
  // of sending it to the sample.
  close(signal((await run(EPI, byId => { byId('dichroic').params.cutoff = 450; }))('pmt')), 0);
  // No sample in the focus, no signal.
  close(signal((await run(EPI, byId => { byId('stage').y += 60; }))('pmt')), 0);
});

// Drive both arms of one child modulator push-pull by a total of `deg`.
const drive = (byId, child, deg) => {
  byId(`${child}-plus`).params.depthDeg = deg / 2;
  byId(`${child}-minus`).params.depthDeg = -deg / 2;
};

test('in quadrature the output power is I² + Q², whatever the signs', async () => {
  const shipped = await run(IQ);
  close(shipped('output').signal, 0.5);
  close(shipped('unused').signal, 0.5);
  close(signal(shipped('i-monitor')), 0);
  close(signal(shipped('q-monitor')), 0);
  for (const qDeg of [120, -120]) {
    const at = await run(IQ, byId => { drive(byId, 'i', 60); drive(byId, 'q', qDeg); });
    // I = sin 30°, Q = ±sin 60°: (I² + Q²)/4 at each port, the rest at the monitors.
    close(at('output').signal, 0.25);
    close(at('unused').signal, 0.25);
    close(at('i-monitor').signal, 0.375);
    close(at('q-monitor').signal, 0.125);
  }
});

test('without the 90° shift I and Q interfere and their signs show', async () => {
  const sum = [];
  for (const qDeg of [120, -120]) {
    const at = await run(IQ, byId => { drive(byId, 'i', 60); drive(byId, 'q', qDeg); byId('quadrature').params.depthDeg = 0; });
    sum.push([at('output').signal, at('unused').signal]);
    close(at('output').signal + at('unused').signal, 0.5);
  }
  // (I ∓ Q)²/8 and (I ± Q)²/8 with I = 1/2, Q = √3/2: the ports swap with the sign.
  close(sum[0][0], (2 - Math.sqrt(3)) / 8);
  close(sum[0][1], (2 + Math.sqrt(3)) / 8);
  close(sum[1][0], sum[0][1]);
  close(sum[1][1], sum[0][0]);
});

test('an undriven I/Q modulator sends everything to its monitors', async () => {
  const at = await run(IQ, byId => { drive(byId, 'i', 0); drive(byId, 'q', 0); });
  close(signal(at('output')), 0);
  close(signal(at('unused')), 0);
  close(at('i-monitor').signal, 0.5);
  close(at('q-monitor').signal, 0.5);
});
