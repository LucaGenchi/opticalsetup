// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The DWDM link example does what its page says: traced as shipped, then
// with each control its page tells the reader to change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';

const close = (actual, expected, tolerance) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);

const PATH = '../Examples/Optical Communications/DWDM link — dispersion compensation.json';
const CHANNELS = [['rx1', 1550.12], ['rx2', 1551.72], ['rx3', 1553.33], ['rx4', 1554.94]];
// 0 dBm launched, 10 km at 0.2 dB/km and 1.7 km at 0.5 dB/km.
const DELIVERED = 10 ** (-(2 + 0.85) / 10);

// Trace the example after optional edits to its elements and fibers, and
// return the receivers' readings (snapshotted: the next trace replaces them).
async function run(edit = () => {}) {
  const scene = parseSketch(await readFile(new URL(PATH, import.meta.url), 'utf8'), registry);
  edit(id => scene.elements.find(el => el.id === id), id => scene.beams.find(b => b.id === id), scene);
  const traced = traceScene(scene.elements, scene.beams);
  for (const drawable of traced.drawables) {
    for (const point of drawable.pts || []) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  }
  return Object.fromEntries(['rx1', 'rx2', 'rx3', 'rx4'].map(id => [id, structuredClone(detectorReading(id))]));
}

test('every channel reaches its own receiver with the link budget and its pulse width restored', async () => {
  const rx = await run();
  for (const [id, wl] of CHANNELS) {
    close(rx[id].wavelength, wl, 1e-6);
    close(rx[id].signal, DELIVERED, 1e-6);
    close(rx[id].pulse.stretchedPulseWidthFs, 8300, 1);
    close(rx[id].pulse.totalGddFs2, -80000, 1);
  }
});

test('without dispersion compensation the pulses spread across three bit slots', async () => {
  const rx = await run((el, fiber) => { fiber('dcf').beta2Ps2PerKm = 0; });
  for (const [id] of CHANNELS) {
    // 8.3 ps · sqrt(1 + (4 ln2 · 217 ps² / (8.3 ps)²)²)
    close(rx[id].pulse.stretchedPulseWidthFs, 8300 * Math.hypot(1, 4 * Math.LN2 * 217e6 / 8300 ** 2), 1);
    assert.ok(rx[id].pulse.stretchedPulseWidthFs > 2.9 * 25000);
  }
});

test('a short DCF spool leaves the residual dispersion it does not cancel', async () => {
  const rx = await run((el, fiber) => { fiber('dcf').lengthM = 1200; });
  const residual = -217e6 + 127.6e3 * 1200;
  for (const [id] of CHANNELS) {
    close(rx[id].pulse.totalGddFs2, residual, 1);
    close(rx[id].pulse.stretchedPulseWidthFs, 8300 * Math.hypot(1, 4 * Math.LN2 * residual / 8300 ** 2), 1);
  }
});

test('a laser tuned between channels keeps only the edge its filter passes', async () => {
  const rx = await run(el => { el('tx2').params.wavelength += 0.8; });
  assert.ok(rx.rx2.signal > 0 && rx.rx2.signal < 0.2 * DELIVERED, `rx2 ${rx.rx2.signal}`);
  assert.ok(rx.rx2.pulse.stretchedPulseWidthFs > 2 * 8300);
  for (const id of ['rx1', 'rx3', 'rx4']) close(rx[id].signal, DELIVERED, 1e-6);
});

test('deleting a laser darkens only its own receiver', async () => {
  const rx = await run((el, fiber, scene) => { scene.elements = scene.elements.filter(e => e.id !== 'tx3'); });
  assert.equal(rx.rx3, null);
  for (const id of ['rx1', 'rx2', 'rx4']) close(rx[id].signal, DELIVERED, 1e-6);
});
