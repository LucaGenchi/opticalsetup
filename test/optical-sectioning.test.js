// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createElement, newSampleChannel, registry, specimenFocusReadout, isVolumeSpecimen,
  NONLINEAR_SIGNAL_KINDS, LINEAR_SIGNAL_KINDS,
} from '../sketch/js/elements.js';
import {
  NONLINEAR_ORDER, MIN_RELATIVE_SIGNAL, bundleFocus, relativeYield, volumeEmissionPoints, linearPathFraction,
} from '../sketch/js/sectioning.js';
import { traceScene, specimenFocusReading, specimenIncidentBeams, probeBeamsAt } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { wavelengthToColor } from '../sketch/js/util.js';

// A bundle converging to (fx, 0) from rays crossing the line x = 0.
// Every ray travels in +x; a negative fx is a bundle diverging from behind.
function converging(fx, halfHeight = 5, n = 5) {
  return Array.from({ length: n }, (_, i) => {
    const y = -halfHeight + 2 * halfHeight * i / (n - 1);
    const sign = Math.sign(fx), len = Math.hypot(fx, y);
    return { p: { x: 0, y }, d: { x: sign * fx / len, y: -sign * y / len }, w: 1 };
  });
}

test('every nonlinear signal kind has an order, and no linear one does', () => {
  assert.deepEqual(Object.keys(NONLINEAR_ORDER).sort(), NONLINEAR_SIGNAL_KINDS.map(([kind]) => kind).sort());
  for (const [kind] of LINEAR_SIGNAL_KINDS) assert.equal(NONLINEAR_ORDER[kind], undefined);
});

test('the focus of a converging bundle is where its rays meet', () => {
  const focus = bundleFocus(converging(50), 800);
  assert.equal(focus.ok, true);
  assert.ok(Math.abs(focus.zMm - 50) < 1e-9);
  assert.ok(Math.abs(focus.point.x - 50) < 1e-9 && Math.abs(focus.point.y) < 1e-9);
  assert.ok(Math.abs(focus.na - 0.1 / Math.hypot(1, 0.1)) < 1e-9);
  // Diffraction-limited Gaussian focus: w0 = λ/(π NA), zR = π w0²/λ.
  const wl = 800e-6;
  assert.ok(Math.abs(focus.w0Mm - wl / (Math.PI * focus.na)) < 1e-12);
  assert.ok(Math.abs(focus.zRMm - Math.PI * focus.w0Mm ** 2 / wl) < 1e-12);
  // A focus behind the crossing is a negative distance.
  assert.ok(Math.abs(bundleFocus(converging(-20), 800).zMm + 20) < 1e-9);
});

test('a bundle with no usable focus says why instead of inventing one', () => {
  const parallel = [-2, 0, 2].map(y => ({ p: { x: 0, y }, d: { x: 1, y: 0 }, w: 1 }));
  assert.deepEqual(bundleFocus(parallel, 800), { ok: false, reason: 'collimated' });
  assert.deepEqual(bundleFocus([{ p: { x: 0, y: 0 }, d: { x: 1, y: 0 }, w: 1 }], 800), { ok: false, reason: 'single' });
  assert.deepEqual(bundleFocus([], 800), { ok: false, reason: 'single' });
  const broken = [{ p: { x: NaN, y: 0 }, d: { x: 1, y: 0 }, w: 1 }, { p: { x: 0, y: 1 }, d: { x: 1, y: Infinity }, w: 1 }];
  assert.equal(bundleFocus(broken, 800).ok, false);
  assert.equal(bundleFocus(converging(50), 0).ok, false);
});

test('the thin-slice yield is a Lorentzian per extra photon', () => {
  assert.equal(relativeYield(1, 5), 1);
  assert.equal(relativeYield(2, 0), 1);
  assert.ok(Math.abs(relativeYield(2, 1) - 0.5) < 1e-12);
  assert.ok(Math.abs(relativeYield(3, 1) - 0.25) < 1e-12);
  assert.ok(relativeYield(3, 1e300) === 0);
});

test('a focus inside the path concentrates a nonlinear signal there', () => {
  const focus = { ok: true, zRMm: 0.1 };
  const points = volumeEmissionPoints(2, -10, 10, focus, 8);
  const total = points.reduce((s, p) => s + p.share, 0);
  assert.ok(total > 0.999 && total <= 1 + 1e-12, `shares add up: ${total}`);
  // The focus, halfway along, emits once and carries almost all of it.
  const peak = points.find(p => Math.abs(p.at - 0.5) < 1e-12);
  assert.ok(peak && peak.level === 1);
  assert.ok(peak.share > 0.98, `focus share ${peak.share}`);
  assert.equal(points.filter(p => Math.abs(p.at - 0.5) < 1e-12).length, 1);
  // Exact integral: the piece [0, 2.5 mm] holds atan(25)/π of a 2nd-order
  // signal over [-10, 10] mm.
  const total2 = 2 * Math.atan(100);
  const expectedPeak = 2 * Math.atan(25) / total2;
  assert.ok(Math.abs(peak.share - expectedPeak) < 1e-9);
});

test('pieces weaker than 1e-6 of the most intense point generate nothing', () => {
  // Third order, focus 10 µm across: 2.5 mm away is ~(250)^-4 ≈ 2.6e-10.
  const points = volumeEmissionPoints(3, -10, 10, { ok: true, zRMm: 0.01 }, 8);
  assert.ok(points.every(p => p.level >= MIN_RELATIVE_SIGNAL));
  assert.equal(points.length, 1, 'only the focus is left');
  // With the focus outside the path, levels are relative to the nearest
  // point inside, so the path still emits -- no sectioning.
  const outside = volumeEmissionPoints(2, 40, 60, { ok: true, zRMm: 0.1 }, 8);
  assert.equal(outside.length, 8);
  assert.equal(Math.max(...outside.map(p => p.level)), 1);
  assert.ok(Math.min(...outside.map(p => p.level)) > 0.4);
});

test('a linear signal, or a beam without a focus, emits evenly along the path', () => {
  for (const [order, focus] of [[1, { ok: true, zRMm: 0.1 }], [2, null], [2, { ok: false, reason: 'speckle' }]]) {
    const points = volumeEmissionPoints(order, -10, 10, focus, 4);
    assert.deepEqual(points.map(p => p.at), [0.125, 0.375, 0.625, 0.875]);
    assert.ok(points.every(p => p.share === 0.25 && p.level === 1));
  }
});

test('a linear signal grows with the path and never passes one', () => {
  assert.ok(Math.abs(linearPathFraction(0.1, 1) - 0.1) < 1e-12, 'efficiency is per millimetre');
  assert.ok(Math.abs(linearPathFraction(0.1, 2) - 0.19) < 1e-12);
  assert.ok(linearPathFraction(0.1, 20) > linearPathFraction(0.1, 10));
  assert.equal(linearPathFraction(0.5, 1e6), 1);
  assert.equal(linearPathFraction(1, 3), 1);
  assert.equal(linearPathFraction(0, 3), 0);
  assert.equal(linearPathFraction(NaN, 3), 0);
  assert.equal(linearPathFraction(0.1, -2), 0);
});

// 10 mm beam focused by an f = 100 mm lens at x = 100, so the focus is at
// x = 200; a 20 mm specimen there, its whole thickness active.
function thickBench({ kind = 'tpef', lens = true, wavelength = kind === 'fluor' ? 488 : 920, offset = 0, diffuser = false, volume = true } = {}) {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { wavelength, beamMode: 'beam', beamWidth: 10 });
  const elements = [laser];
  if (diffuser) {
    const d = createElement('diffuser', 60, 0);
    d.params.div = 6;
    elements.push(d);
  }
  if (lens) {
    const l = createElement('lens', 100, 0);
    l.params.f = 100;
    elements.push(l);
  }
  const sample = createElement('sample', 200 + offset, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 40, thickness: 20, specimenType: kind === 'fluor' ? 'linear' : 'nonlinear',
    transmitExc: true, transmission: 0.9, volumeSpecimen: volume,
    channels: [{ ...newSampleChannel(kind), eff: 0.1, autoWl: false, wl: 560 }],
  });
  elements.push(sample);
  const { drawables } = traceScene(elements);
  return { sample, drawables };
}

// The x positions isotropic emission starts from: every fan's rays share an
// origin, and a glow is drawn as segments starting there.
// Only spots drawn at least a tenth as bright as the brightest are listed.
function emissionOrigins(drawables, wl = 560) {
  const color = wavelengthToColor(wl);
  const spots = new Map();
  for (const d of drawables) {
    if (d.type !== 'path' || d.color !== color || d.w !== 1.8) continue;
    const key = `${d.pts[0].x.toFixed(3)},${d.pts[0].y.toFixed(3)}`;
    const spot = spots.get(key) || { n: 0, opacity: 0 };
    spot.n++;
    spot.opacity = Math.max(spot.opacity, d.opacity);
    spots.set(key, spot);
  }
  const fans = [...spots].filter(([, spot]) => spot.n >= 10);
  const brightest = Math.max(0, ...fans.map(([, spot]) => spot.opacity));
  return fans.filter(([, spot]) => spot.opacity >= brightest / 10)
    .map(([key]) => Number(key.split(',')[0])).sort((a, b) => a - b);
}

// Emitted power, measured on a huge circle tangent to the beam axis at the
// specimen: it catches the half of every fan that heads to one side, the same
// fraction for every spot on the axis, so ratios between benches are exact.
// (A probe does not count light emitted inside its own circle.)
const emitted = (sample, wl = 560) => probeBeamsAt(sample.x, sample.y - 1e6, 1e6 - 1e-6)
  .filter(b => Math.abs(b.wl - wl) < 0.5).reduce((sum, b) => sum + b.power, 0);

test('a new specimen is a volume; a saved one without the switch stays a thin line', () => {
  const fresh = createElement('sample', 0, 0);
  assert.equal(fresh.params.volumeSpecimen, true);
  const stage = createElement('stage', 0, 0);
  assert.equal(stage.params.volumeSpecimen, true);
  const saved = createElement('sample', 0, 0);
  delete saved.params.volumeSpecimen;
  Object.assign(saved.params, { specimenType: 'linear', channels: [newSampleChannel('fluor')] });
  const loaded = parseSketch(JSON.stringify({ version: 1, elements: [saved] }), registry);
  assert.equal(loaded.elements[0].params.volumeSpecimen, false);
  assert.equal(isVolumeSpecimen(loaded.elements[0].params), false);
  // A volume specimen's thickness is a physical setting, not presentation.
  const spec = registry.sample.params.find(p => p.key === 'thickness');
  assert.equal(spec.appearance({ ...fresh.params, specimenType: 'linear', channels: [newSampleChannel('fluor')] }), false);
});

test('with the focus inside, two-photon fluorescence comes only from the focus', () => {
  const { sample, drawables } = thickBench({ kind: 'tpef' });
  assert.deepEqual(emissionOrigins(drawables), [200]);
  const reading = specimenFocusReading(sample.id);
  assert.equal(reading.length, 1);
  assert.equal(reading[0].inside, true);
  assert.ok(Math.abs(reading[0].depthMm - 10) < 1e-9);
  assert.match(specimenFocusReadout(reading), /^920 nm: 10 mm deep · zR 117 µm$/);
  // The efficiency is the total, wherever it comes from.
  const total = emitted(sample);
  const collimated = thickBench({ kind: 'tpef', lens: false });
  assert.ok(Math.abs(emitted(collimated.sample) - total) < 1e-9 * Math.max(1, total));
});

test('one-photon fluorescence comes from the whole path and grows with it', () => {
  const { sample, drawables } = thickBench({ kind: 'fluor' });
  const origins = emissionOrigins(drawables);
  assert.ok(origins.length >= 6, `spots along the path: ${origins}`);
  assert.ok(origins[0] < 192 && origins[origins.length - 1] > 208, `spread over the 20 mm: ${origins}`);
  // 1 - (1 - 0.1)^20 of the beam, against 0.1 for a thin line.
  const thick = emitted(sample);
  const thin = thickBench({ kind: 'fluor', volume: false });
  const ratio = thick / emitted(thin.sample);
  assert.ok(Math.abs(ratio - linearPathFraction(0.1, 20) / 0.1) < 1e-6, `ratio ${ratio}`);
});

test('a wide-field, speckle or elsewhere-focused beam has no focus message and emits along the path', () => {
  for (const [what, options] of [
    ['collimated', { lens: false }],
    ['speckle', { diffuser: true }],
    ['focused 60 mm further on', { offset: -60 }],
  ]) {
    const { sample, drawables } = thickBench({ kind: 'tpef', ...options });
    assert.equal(specimenFocusReadout(specimenFocusReading(sample.id)), null, `${what}: no focus inside`);
    const origins = emissionOrigins(drawables);
    assert.ok(origins.length >= 6, `${what}: emits along the path, got ${origins}`);
  }
  const speckled = thickBench({ kind: 'tpef', diffuser: true });
  assert.equal(specimenFocusReading(speckled.sample.id)[0].reason, 'speckle');
});

test('a fainter emission spot glows fainter', () => {
  // Focus 3 mm from the exit face: the far side's spots are weaker than
  // the focus, and so is their glow.
  const { drawables } = thickBench({ kind: 'tpef', offset: -7, lens: true });
  const color = wavelengthToColor(560);
  const byOrigin = new Map();
  for (const d of drawables) {
    if (d.type !== 'path' || d.color !== color || d.w !== 1.8) continue;
    const x = Number(d.pts[0].x.toFixed(3));
    byOrigin.set(x, Math.max(byOrigin.get(x) || 0, d.opacity));
  }
  const brightest = Math.max(...byOrigin.values());
  assert.ok([...byOrigin.values()].some(v => v < brightest / 10), 'weak spots are drawn faintly');
});

// Two synchronised trains, pump 800 nm and Stokes 1040 nm, the Stokes
// chopped. A first specimen transfers the modulation onto the pump by SRS;
// a second, thick one behind a lens makes two-photon fluorescence.
function srsThenTpef({ srs = true } = {}) {
  const laser = (wl, y, beamMode) => {
    const l = createElement('pulsedlaser', 0, y);
    Object.assign(l.params, { wavelength: wl, temporalMode: 'pulsed', repRateMHz: 40, pulseWidthFs: 200, beamMode, beamWidth: 4 });
    return l;
  };
  const chopper = createElement('chopper', 80, 6);
  Object.assign(chopper.params, { modulate: true, frequencyHz: 1e7, diameter: 10 });
  const first = createElement('sample', 140, 0);
  first.rot = 90;
  Object.assign(first.params, {
    aperture: 40, specimenType: 'nonlinear', volumeSpecimen: false, transmitExc: true, transmission: 1,
    channels: srs ? [{ ...newSampleChannel('srs'), transferEff: 0.3, requireOverlap: false }] : [],
  });
  const lens = createElement('lens', 180, 0);
  lens.params.f = 80;
  const second = createElement('sample', 260, 0);
  second.rot = 90;
  Object.assign(second.params, {
    aperture: 40, thickness: 20, specimenType: 'nonlinear', volumeSpecimen: true, transmitExc: true, transmission: 0.9,
    channels: [{ ...newSampleChannel('tpef'), eff: 0.2, autoWl: false, wl: 560 }],
  });
  const { drawables } = traceScene([laser(800, -6, 'beam'), laser(1040, 6, 'line'), chopper, first, lens, second]);
  return { first, second, drawables };
}

test('after a stimulated Raman specimen, the next specimen still finds its beam and focus', () => {
  // Andrea (#261): the modulation the first specimen adds changed the beam's
  // identity, so the second lost its focus and the beam's summed power.
  const plain = srsThenTpef({ srs: false });
  const plainPower = emitted(plain.second);
  const plainOrigins = emissionOrigins(plain.drawables);
  const gated = srsThenTpef();
  assert.ok(specimenIncidentBeams(gated.first.id).some(b => b.wl === 1040 && b.gates.length), 'the Stokes is modulated');
  assert.ok(plainPower > 0);
  assert.ok(Math.abs(emitted(gated.second) - plainPower) < 1e-9 * Math.max(1, plainPower), 'same power with the transfer');
  assert.deepEqual(emissionOrigins(gated.drawables), plainOrigins);
  assert.equal(plainOrigins.length, 1, 'from the focus only');
});

test('the focus readout names each beam that focuses inside, and only those', () => {
  // Andrea (#261): a focused pump and a collimated Stokes beam. The readout
  // speaks for the pump, which drives the two-photon signal.
  const pump = createElement('pulsedlaser', 0, 0);
  Object.assign(pump.params, { wavelength: 800, beamMode: 'beam', beamWidth: 10, avgPowerW: 0.5 });
  const lens = createElement('lens', 100, 0);
  lens.params.f = 100;
  // Off to the side and aimed at the specimen, clear of the pump.
  const stokes = createElement('pulsedlaser', 120, 30);
  stokes.rot = Math.atan2(-27, 80) * 180 / Math.PI;
  Object.assign(stokes.params, { wavelength: 1030, beamMode: 'beam', beamWidth: 4 });
  const sample = createElement('sample', 200, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 40, thickness: 20, specimenType: 'nonlinear', volumeSpecimen: true,
    channels: [{ ...newSampleChannel('tpef'), eff: 0.2, autoWl: false, wl: 560 }],
  });
  const { drawables } = traceScene([pump, lens, stokes, sample]);
  const readings = specimenFocusReading(sample.id);
  assert.equal(readings.length, 2);
  const text = specimenFocusReadout(readings);
  assert.match(text, /^800 nm: 10 mm deep · zR /);
  assert.doesNotMatch(text, /1030/);
  // The two-photon signal follows the pump's focus: its brightest spot.
  const origins = emissionOrigins(drawables);
  assert.ok(origins.includes(200), `spots ${origins}`);
  assert.ok(origins.every(x => Math.abs(x - 200) <= 2.5), `spots ${origins}`);
});
