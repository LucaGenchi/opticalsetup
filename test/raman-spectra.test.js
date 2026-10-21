// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The reference spectra shipped with the coherent Raman calculator: third-
// party data, so each file must carry an allowed licence and its credit,
// match the index, and keep the band positions its source publishes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SPECTRA, SPECTRUM_SOURCES, SPECTRUM_CATEGORIES, SPECTRUM_TECHNIQUES } from '../calculators/coherent-raman/spectra-index.js';
import { SPECTRUM_DEFAULTS, computeSpectrumView } from '../calculators/coherent-raman/crs-spectra.js';

const DIR = new URL('../calculators/coherent-raman/spectra/', import.meta.url).pathname;
const load = id => JSON.parse(readFileSync(join(DIR, `${id}.json`), 'utf8'));
// Licences that the GPL lets us ship with attribution, and nothing else.
const ALLOWED = new Set(['CC-BY-4.0', 'CC0-1.0']);

test('every spectrum file is indexed, licensed, credited and well formed', () => {
  const files = readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort();
  assert.deepEqual(files, SPECTRA.map(s => s.id).sort(), 'index and files agree');
  for (const meta of SPECTRA) {
    const s = load(meta.id);
    assert.ok(ALLOWED.has(s.license) && SPECTRUM_SOURCES[s.source].license === s.license, `${s.id}: licence`);
    assert.ok(s.attribution && /^https:\/\//.test(s.sourceUrl) && /^https:\/\/creativecommons\.org\//.test(s.licenseUrl), `${s.id}: credit`);
    assert.ok(s.changes, `${s.id}: CC BY asks that changes be indicated`);
    assert.ok(SPECTRUM_CATEGORIES.includes(s.category) && SPECTRUM_TECHNIQUES[s.technique] && s.measurement, `${s.id}: classification`);
    // The excipients include liquids; their label must not call them solids.
    if (s.source === 'berzins2020') assert.doesNotMatch(s.measurement, /solid/, `${s.id}: neutral sample-state label`);
    assert.equal(s.stepCm, 2);
    assert.equal(meta.endCm, s.startCm + (s.intensity.length - 1) * 2, `${s.id}: index range`);
    assert.ok(s.intensity.every(v => Number.isInteger(v) && v >= 0 && v <= 1000), `${s.id}: scaled 0–1000`);
    assert.equal(Math.max(...s.intensity), 1000);
    assert.equal(Math.min(...s.intensity), 0);
    if (s.source === 'rod') assert.ok(s.rodId && s.contributors.length, `${s.id}: ROD entry and contributors`);
  }
  assert.ok(SPECTRA.length >= 80);
});

test('solvent band positions match the band table their source publishes', () => {
  // Major bands from Flanagan and Glavin, Sci. Data 12, 498 (2025), Tables 2–3.
  const BANDS = {
    ethanol: [883, 1052, 1454, 2929], methanol: [1034, 1452, 2835], acetone: [788, 1709, 2924],
    acetonitrile: [920, 2253], chloroform: [261, 366, 668], cyclohexane: [802, 1028, 1444, 2853],
    dmso: [669, 1044, 2913], toluene: [1003, 1030, 1210, 1605, 3056],
  };
  for (const [id, bands] of Object.entries(BANDS)) {
    const s = load(id);
    for (const band of bands) {
      // The strongest sample within ±10 cm⁻¹ sits within one 2 cm⁻¹ bin.
      let best = null;
      s.intensity.forEach((v, i) => { const x = s.startCm + 2 * i; if (Math.abs(x - band) <= 10 && (!best || v > best.v)) best = { x, v }; });
      assert.ok(Math.abs(best.x - band) <= 2, `${id} ${band} cm⁻¹: found ${best.x}`);
    }
  }
});

test('the probed window: shift ± half the resolution, in or out of the measured range', () => {
  const data = load('ethanol');
  const view = (raw, ctx) => computeSpectrumView({ ...SPECTRUM_DEFAULTS, ...raw }, { data, ...ctx });
  const r = view({}, { ramanShiftCm: 2884.6, resolutionCm: 14.7 });
  assert.equal(r.ok, true);
  assert.deepEqual(r.window, [2884.6 - 7.35, 2884.6 + 7.35]);
  assert.ok(r.inRange && r.peak.x >= r.window[0] && r.peak.x <= r.window[1]);
  assert.ok(r.atShift > 0 && r.atShift <= 1);
  assert.equal(r.plot.x.length, data.intensity.length);
  const zoom = view({ view: 'window' }, { ramanShiftCm: 1000, resolutionCm: 10 });
  assert.equal(zoom.plot.x[0], 850);
  assert.equal(zoom.plot.x.at(-1), 1150);
  // A window narrower than one bin (review of #244: 1001 ± 0.25 cm⁻¹ once
  // reported the 1002 cm⁻¹ sample): its maximum lies inside, interpolated.
  for (const [shift, res] of [[1001, 0.5], [1001.3, 1.2], [883.5, 0.2]]) {
    const sub = view({}, { ramanShiftCm: shift, resolutionCm: res });
    assert.ok(sub.peak.x >= sub.window[0] && sub.peak.x <= sub.window[1], `${shift} ± ${res / 2}: ${sub.peak.x}`);
    assert.equal(sub.peak.interpolated, true);
  }
  // The maximum of the interpolated curve: never below any sample or edge in the window.
  const wide = view({}, { ramanShiftCm: 1460, resolutionCm: 31 });
  wide.plot.x.forEach((cm, k) => { if (cm >= wide.window[0] && cm <= wide.window[1]) assert.ok(wide.peak.y >= wide.plot.y[k]); });
  assert.equal(wide.peak.interpolated, false);
  // A window overlapping the end of the measured range is clipped to it.
  const edge = view({}, { ramanShiftCm: 3150, resolutionCm: 20 });
  assert.ok(edge.inRange && edge.peak.x <= 3150 && edge.peak.x >= 3140);
  const outside = view({}, { ramanShiftCm: 3300, resolutionCm: 10 });
  assert.equal(outside.ok, true);
  assert.equal(outside.inRange, false);
  assert.equal(outside.atShift, null);
  assert.equal(outside.peak, null);
  assert.equal(view({}, { ramanShiftCm: null, resolutionCm: 10 }).ok, false);
  assert.equal(view({}, { ramanShiftCm: 1000, resolutionCm: null }).ok, false);
  assert.equal(computeSpectrumView(SPECTRUM_DEFAULTS, { ramanShiftCm: 1000, resolutionCm: 10, data: undefined }).pending, true);
  assert.equal(computeSpectrumView({ ...SPECTRUM_DEFAULTS, spectrum: 'toluene' }, { ramanShiftCm: 1000, resolutionCm: 10, data }).ok, false, 'a file for another material is refused');
  assert.equal(view({ spectrum: 'nope' }, { ramanShiftCm: 1000, resolutionCm: 10 }).ok, false);
});
