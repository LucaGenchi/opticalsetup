// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The optics a dispersion compensator needs on the canvas. Prism faces
// transmit by Fresnel at their real angle and polarization
// (docs/physics/prism-fresnel.md); gratings keep a set diffraction
// efficiency per order; CaF₂ is a canvas glass; a D-shaped mirror picks off
// a returning beam.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, registry } from '../sketch/js/elements.js';
import { traceScene, detectorReading, probeAt } from '../sketch/js/raytrace.js';
import { glassIndex, GLASS_OPTIONS } from '../sketch/js/glass.js';
import { fresnelTransmittances, throughFace } from '../sketch/js/fresnel.js';
import { linearStokes } from '../sketch/js/polarization.js';

const D2R = Math.PI / 180;

// An N-SF10 prism cut and turned for Brewster's angle at 800 nm, at minimum
// deviation, with a detector across the deviated beam.
function brewsterPrism(pol) {
  const n = glassIndex('nsf10', 800);
  const theta = Math.atan(n) / D2R, apex = 180 - 2 * theta, dev = 2 * theta - apex;
  const laser = createElement('cwlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'line', wavelength: 800, pol });
  const prism = createElement('prism', 200, 0);
  prism.rot = theta - apex / 2;
  Object.assign(prism.params, { material: 'nsf10', apex, psize: 25.4 });
  // The beam meets the prism's left face; aim the detector along the
  // deviated direction from roughly where it leaves.
  const det = createElement('detector', 200 + 300 * Math.cos(dev * D2R), 300 * Math.sin(dev * D2R));
  det.rot = dev;
  det.params.aperture = 120;
  return { laser, prism, det, n, theta };
}

test('a Brewster prism passes p-polarized light whole and s-polarized light at Fresnel loss', () => {
  const p = brewsterPrism(0);
  traceScene([p.laser, p.prism, p.det]);
  const pSignal = detectorReading(p.det.id).signal;
  const s = brewsterPrism(90);
  traceScene([s.laser, s.prism, s.det]);
  const sSignal = detectorReading(s.det.id).signal;
  // Both faces at Brewster: T_s from air into glass and back out are equal.
  const face = fresnelTransmittances(1, s.n, Math.cos(s.theta * D2R));
  assert.ok(Math.abs(face.Tp - 1) < 1e-6, `T_p ${face.Tp}`);
  assert.ok(Math.abs(pSignal - 1) < 1e-3, `p through two Brewster faces: ${pSignal}`);
  assert.ok(Math.abs(sSignal - face.Ts ** 2) < 2e-3, `s: ${sSignal} against ${face.Ts ** 2}`);
});

test('linear light at 45 degrees loses the mean and turns toward p, segment by segment', () => {
  const p = brewsterPrism(45);
  traceScene([p.laser, p.prism, p.det]);
  const reading = detectorReading(p.det.id);
  const face = fresnelTransmittances(1, p.n, Math.cos(p.theta * D2R));
  const first = throughFace(linearStokes(45), face);
  const second = throughFace(first.stokes, face);
  assert.ok(Math.abs(reading.signal - first.T * second.T) < 2e-3, `${reading.signal} against ${first.T * second.T}`);
  // A probe before the prism still reads 45°; one after reads the turned state.
  const before = probeAt(100, 0);
  assert.ok(Math.abs(before.stokes.s2 - 1) < 1e-9, `before: ${JSON.stringify(before.stokes)}`);
  const angle = Math.atan2(p.det.y, p.det.x - 200);
  const after = probeAt(200 + 150 * Math.cos(angle), 150 * Math.sin(angle));
  assert.ok(Math.abs(after.stokes.s1 - second.stokes.s1) < 1e-6, `after: ${JSON.stringify(after.stokes)}`);
  assert.ok(after.stokes.s1 > 0, 'turned toward p');
});

test('a grating order keeps its set diffraction efficiency', () => {
  const read = efficiency => {
    const laser = createElement('cwlaser', 0, 0);
    Object.assign(laser.params, { beamMode: 'line', wavelength: 800 });
    const grating = createElement('grating', 200, 0);
    Object.assign(grating.params, { lines: 600, orders: '1', ...(efficiency ? { efficiency } : {}) });
    const angle = Math.atan2(2880, -5264);
    const det = createElement('detector', 200 + 300 * Math.cos(angle), 300 * Math.sin(angle));
    det.rot = angle / D2R;
    det.params.aperture = 60;
    traceScene([laser, grating, det]);
    return detectorReading(det.id)?.signal ?? 0;
  };
  const full = read(null);
  assert.ok(full > 0.99, `default keeps the whole order: ${full}`);
  assert.ok(Math.abs(read(80) - 0.8 * full) < 1e-9);
  assert.equal(registry.grating.params.find(p => p.key === 'efficiency').def, 100);
});

test('CaF₂ is a canvas glass with its published index', () => {
  assert.ok(GLASS_OPTIONS.some(([id]) => id === 'caf2'));
  // Malitson (1963): nd = 1.43385.
  assert.ok(Math.abs(glassIndex('caf2', 587.6) - 1.43385) < 2e-5);
});

test('a D-shaped mirror lets the incoming beam pass its edge and picks off the return', () => {
  const mk = (type, x, y, rot, params) => Object.assign(createElement(type, x, y), { rot, params: { ...createElement(type).params, ...params } });
  const laser = mk('cwlaser', 40, 180, 0, { wavelength: 633, beamMode: 'line' });
  const pickoff = mk('dmirror', 230, 203, 45, { length: 12.7 });
  const roof = mk('retroreflector', 460, 190, 0, { length: 50.8 });
  const det = mk('detector', 230, 320, 90, { aperture: 26 });
  traceScene([laser, pickoff, roof, det]);
  assert.ok(Math.abs(detectorReading(det.id).signal - 1) < 1e-9, 'the whole return reaches the detector');
  // Moved 20 mm into the incoming beam, it blocks the way in instead.
  pickoff.y = 183;
  traceScene([laser, pickoff, roof, det]);
  assert.equal(detectorReading(det.id), null);
  assert.equal(registry.dmirror.category, 'Mirrors');
});
