// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import '../sketch/js/detector-instruments.js';
import { registry } from '../sketch/js/elements.js';
import { detectorReading, supercontinuumReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import {
  CRYSTAL_X, FOCAL_MM, NIR_SC_NAME, nirSupercontinuumScene, PUMP_NM, SEPARATOR_NM, WINDOW_HI_NM, WINDOW_LO_NM,
} from '../tools/build-nir-supercontinuum-example.mjs';

const raw = readFileSync(new URL(`../Examples/Nonlinear Optics/${NIR_SC_NAME}.json`, import.meta.url), 'utf8');

function traced(edit = () => {}) {
  const scene = parseSketch(raw, registry);
  edit(scene);
  traceScene(scene.elements);
  return scene;
}
const band = id => {
  const w = (detectorReading(id)?.spectrum || []).filter(s => s.power > 1e-9).map(s => s.wavelength);
  return w.length ? [Math.min(...w), Math.max(...w)] : null;
};

test('the committed near-infrared continuum example is exactly what its generator writes', () => {
  assert.deepEqual(JSON.parse(raw), nirSupercontinuumScene());
});

test('a 1035 nm femtosecond pump in YAG gives the interpolated estimate, at the lens focus', () => {
  const scene = traced();
  const at = id => scene.elements.find(el => el.id === id);
  assert.equal(at('laser').params.wavelength, PUMP_NM);
  assert.equal(at('crystal').x, CRYSTAL_X);
  assert.equal(at('crystal').x - at('focus').x, FOCAL_MM);
  const reading = supercontinuumReading('crystal');
  assert.equal(reading.state, 'estimate');
  assert.equal(reading.measured, false, 'interpolated, not a reference at 1035 nm');
  assert.ok(reading.minNm < SEPARATOR_NM && reading.maxNm > WINDOW_HI_NM, `${reading.minNm}-${reading.maxNm}`);
});

test('the separator splits the continuum at 1050 nm and the bandpass selects 1050–1300 nm', () => {
  traced();
  const [visLo, visHi] = band('visible-spectrometer');
  assert.ok(visHi <= SEPARATOR_NM + 1 && visLo < 600, `reflected ${visLo}-${visHi}`);
  const [nirLo, nirHi] = band('nir-spectrometer');
  assert.ok(nirLo >= WINDOW_LO_NM - 1 && nirHi <= WINDOW_HI_NM + 1 && nirHi > WINDOW_HI_NM - 20, `selected ${nirLo}-${nirHi}`);
  assert.ok(!(detectorReading('nir-spectrometer').spectrum || [])
    .some(s => s.power > 1e-9 && Math.abs(s.wavelength - PUMP_NM) < 5), 'residual pump reached the near-infrared spectrometer');
});

test('a pump the estimate has no reference data for draws no continuum', () => {
  traced(scene => { scene.elements.find(el => el.id === 'crystal').params.scMedium = 'fusedsilica'; });
  assert.equal(supercontinuumReading('crystal').state, 'unsupported');
  assert.equal(band('nir-spectrometer'), null);
});
