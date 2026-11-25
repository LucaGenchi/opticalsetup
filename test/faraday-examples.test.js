// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Step P2's two examples do what their pages say (tools/examples-content.mjs):
// each scene is traced as shipped and with each change its page lists, from
// the setup as it opens, and every number the page quotes is read here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';
import { rotationForCrossingDeg } from '../sketch/js/faraday.js';
import { transformLimitedBandwidthNm } from '../sketch/js/spectrum.js';

const close = (actual, expected, tolerance, what = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what} ${actual} != ${expected} ± ${tolerance}`);

async function run(path, edit = () => {}) {
  const scene = parseSketch(await readFile(new URL(`../Examples/${path}.json`, import.meta.url), 'utf8'), registry);
  const get = id => scene.elements.find(el => el.id === id);
  edit(get);
  traceScene(scene.elements, scene.beams);
  const watts = id => enhancedReading(get(id), scene.elements)?.detectedPowerW ?? 0;
  const readout = (id, key) => registry[get(id).type].params.find(p => p.key === key).readout(get(id).params, get(id));
  return { get, watts, readout };
}
const mW = 1e-3, uW = 1e-6;

const ISOLATOR = 'Ultrashort Pulses/Optical isolator — isolation across a pulse spectrum';
const MIRROR = 'Beam Routing/Faraday mirror — a double pass that undoes an unknown retarder';

test('optical isolator example: the figures and the returned spectrum its page quotes', async () => {
  const shipped = await run(ISOLATOR);
  const text = shipped.readout('isolator', 'isolation');
  assert.match(text, /^45° at 800 nm needs B·L = 0\.0106 T·m/);
  assert.match(text, /800 nm: rotation \+45\.0°, forward transmission 100\.0 %, isolation 40\.0 dB; at 768\.6 nm and 831\.4 nm, the edges of its band, 22\.0 dB and 23\.2 dB/);
  // About 63 nm wide (768.6 to 831.4 nm at half maximum).
  close(831.4 - 768.6, 63, 0.5, 'bandwidth');
  close(shipped.watts('spectrometer'), 3.95 * mW, 0.005 * mW, 'power that gets through');
  // Two humps, at 761 and 836 nm, and a hole at 800 nm.
  const spectrum = detectorReading('spectrometer').spectrum;
  const peaks = spectrum.filter((p, i) => i > 0 && i < spectrum.length - 1 && p.power > spectrum[i - 1].power && p.power > spectrum[i + 1].power);
  assert.deepEqual(peaks.map(p => Math.round(p.wavelength)), [761, 836]);
  const at = nm => spectrum.reduce((a, b) => (Math.abs(b.wavelength - nm) < Math.abs(a.wavelength - nm) ? b : a));
  assert.ok(at(800).power < peaks[0].power / 20, 'the hole at 800 nm');
});

test('optical isolator example: each change in its table', async () => {
  const ideal = await run(ISOLATOR, get => { get('isolator').params.isolatorModel = 'ideal'; });
  assert.equal(ideal.watts('spectrometer'), 0);
  const moved = await run(ISOLATOR, get => { get('isolator').params.designWl = 780; });
  close(moved.watts('spectrometer'), 5.32 * mW, 0.005 * mW, 'design at 780 nm');
  const spectrum = detectorReading('spectrometer').spectrum;
  const inner = spectrum.filter(p => p.wavelength > 765 && p.wavelength < 800);
  const hole = inner.reduce((a, b) => (b.power < a.power ? b : a));
  close(hole.wavelength, 780, 4, 'the hole moves to 780 nm');
  // What gets through is said to vary in state across its spectrum, and its
  // duration is not computed.
  assert.ok(detectorReading('spectrometer').approximations.some(a => /varies across its spectrum/.test(a)));
  assert.match(detectorReading('spectrometer').pulse.fieldIssue, /not one scalar pulse/);
  close((await run(ISOLATOR, get => { get('isolator').params.extinctionDb = 30; })).watts('spectrometer'), 4.85 * mW, 0.005 * mW, '30 dB');
  close((await run(ISOLATOR, get => { get('laser').params.pulseWidthFs = 100; })).watts('spectrometer'), 185 * uW, 0.5 * uW, '100 fs');
  // About 9 nm wide at 100 fs, under 1 nm at 1000 fs (transform-limited
  // Gaussians at 800 nm).
  close(transformLimitedBandwidthNm(100, 800, 'gauss'), 9.4, 0.05, '100 fs bandwidth');
  assert.ok(transformLimitedBandwidthNm(1000, 800, 'gauss') < 1);
  const narrow = await run(ISOLATOR, get => { get('laser').params.pulseWidthFs = 1000; });
  close(narrow.watts('spectrometer'), 101 * uW, 0.5 * uW, '1000 fs');
  // 1 W × 1e-4 is the 40 dB floor, and the 15 fs pulse gets through 39 times
  // more.
  close(narrow.watts('spectrometer'), 100 * uW, 1.5 * uW);
  close(3.95 * mW / (101 * uW), 39, 0.5);
});

test('Faraday mirror example: every return reaches the power meter, whatever the plate', async () => {
  const shipped = await run(MIRROR);
  close(shipped.watts('meter'), 10 * mW, 0.005 * mW, 'as it opens');
  const rotator = shipped.get('rotator').params;
  close(rotationForCrossingDeg(rotator, 1064, true).deg, -45, 0.005, '45° per pass');
  assert.equal(rotator.lengthMm, 20.94);
  assert.equal(rotator.fieldT, 1);
  assert.match(shipped.readout('rotator', 'rotation'), /1064 nm, travelling along the field: −45\.0°/);
  assert.match(shipped.readout('rotator', 'rotation'), /1064 nm, travelling against the field: \+45\.0°/);
  close((await run(MIRROR, get => { get('plate').params.a = 65; })).watts('meter'), 10 * mW, 0.005 * mW, 'plate at 65°');
  close((await run(MIRROR, get => { get('rotator').params.fieldT = 0; })).watts('meter'), 4.13 * mW, 0.005 * mW, 'no field');
  close((await run(MIRROR, get => { get('rotator').params.fieldT = 0; get('plate').params.a = 45; })).watts('meter'), 10 * mW, 0.005 * mW, 'no field, plate at 45°');
  close((await run(MIRROR, get => { get('rotator').params.lengthMm = 10.47; })).watts('meter'), 7.07 * mW, 0.005 * mW, '22.5° per pass');
});
