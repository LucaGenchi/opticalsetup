// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, newSampleChannel, registry, specimenFocusReadout, NONLINEAR_SIGNAL_KINDS, LINEAR_SIGNAL_KINDS } from '../sketch/js/elements.js';
import { NONLINEAR_ORDER, bundleFocus, focusYield } from '../sketch/js/sectioning.js';
import { traceScene, specimenFocusReading, probeBeamsAt, srsTransferGate } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';

// A bundle converging to (fx, 0) from rays crossing the layer x = 0.
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
  assert.ok(Math.abs(focus.na - 0.1 / Math.hypot(1, 0.1)) < 1e-9);
  // Diffraction-limited Gaussian focus: w0 = λ/(π NA), zR = π w0²/λ.
  const wl = 800e-6;
  assert.ok(Math.abs(focus.w0Mm - wl / (Math.PI * focus.na)) < 1e-12);
  assert.ok(Math.abs(focus.zRMm - Math.PI * focus.w0Mm ** 2 / wl) < 1e-12);
  // A focus behind the layer is a negative distance.
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

test('the thin-layer yield is a Lorentzian per extra photon', () => {
  const focus = { ok: true, zMm: 0.03, zRMm: 0.03 };
  assert.equal(focusYield(1, focus), 1);
  assert.equal(focusYield(undefined, focus), 1);
  assert.equal(focusYield(2, { ...focus, zMm: 0 }), 1);
  assert.ok(Math.abs(focusYield(2, focus) - 0.5) < 1e-12);
  assert.ok(Math.abs(focusYield(3, focus) - 0.25) < 1e-12);
  // Unknown focus: not scaled. Far away: small, never NaN.
  assert.equal(focusYield(2, { ok: false, reason: 'collimated' }), 1);
  assert.equal(focusYield(2, null), 1);
  const far = focusYield(3, { ok: true, zMm: 1e300, zRMm: 1e-300 });
  assert.ok(Number.isFinite(far) && far >= 0 && far < 1e-12);
});

// 800 nm pulsed beam, 10 mm wide, focused by an f = 50 mm lens at x = 150.
function bench({ kind = 'tpef', offset = 0, sectioning = true, lens = true, beamMode = 'beam' } = {}) {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { wavelength: 800, beamMode, beamWidth: 10 });
  const elements = [laser];
  if (lens) {
    const l = createElement('lens', 100, 0);
    l.params.f = 50;
    elements.push(l);
  }
  const sample = createElement('sample', 150 + offset, 0);
  sample.rot = 90;
  const linear = kind === 'fluor' || kind === 'raman';
  Object.assign(sample.params, {
    aperture: 40, specimenType: linear ? 'linear' : 'nonlinear', transmitExc: false,
    channels: [{ ...newSampleChannel(kind), eff: 0.5, autoWl: false, wl: 900 }],
  });
  if (sectioning !== undefined) sample.params.focusSectioning = sectioning;
  elements.push(sample);
  traceScene(elements);
  return sample;
}

function signal(sample, wl) {
  return probeBeamsAt(sample.x + 12, sample.y, 11.999999)
    .filter(b => Math.abs(b.wl - wl) < 0.5).reduce((sum, b) => sum + b.power, 0);
}

test('a nonlinear layer off the focus emits less, by the thin-layer factor', () => {
  const atFocus = bench();
  const reference = signal(atFocus, 900);
  assert.ok(reference > 0);
  const reading = specimenFocusReading(atFocus.id);
  assert.equal(reading.ok, true);
  assert.ok(Math.abs(reading.zMm) < 1e-9);
  for (const offset of [0.01, 0.1, 1]) {
    const moved = bench({ offset });
    const focus = specimenFocusReading(moved.id);
    assert.ok(Math.abs(focus.zMm + offset) < 1e-6, 'the focus lies before a layer moved past it');
    const expected = 1 / (1 + (offset / focus.zRMm) ** 2);
    assert.ok(Math.abs(signal(moved, 900) / reference - expected) < 1e-6, `2PEF at ${offset} mm`);
  }
  // Third order falls as the square of the same Lorentzian.
  // probeBeamsAt reads the last trace, so read each bench before the next.
  const thgAt = signal(bench({ kind: 'thg' }), 800 / 3);
  const thgOff = bench({ kind: 'thg', offset: 0.05 });
  const zR = specimenFocusReading(thgOff.id).zRMm;
  const ratio = signal(thgOff, 800 / 3) / thgAt;
  assert.ok(Math.abs(ratio - (1 + (0.05 / zR) ** 2) ** -2) < 1e-6);
});

test('a linear layer emits the same wherever the focus is', () => {
  const atFocus = signal(bench({ kind: 'fluor' }), 900);
  const far = signal(bench({ kind: 'fluor', offset: 1 }), 900);
  assert.ok(atFocus > 0);
  assert.ok(Math.abs(far - atFocus) < 1e-12);
});

test('with the switch off a nonlinear layer is not scaled, as in saved scenes', () => {
  const atFocus = signal(bench({ sectioning: false }), 900);
  const far = signal(bench({ sectioning: false, offset: 1 }), 900);
  assert.ok(Math.abs(far - atFocus) < 1e-12);
  // A scene saved before the switch existed opens with it off.
  const saved = createElement('sample', 0, 0);
  delete saved.params.focusSectioning;
  const loaded = parseSketch(JSON.stringify({ version: 1, elements: [saved] }), registry);
  assert.equal(loaded.elements[0].params.focusSectioning, false);
});

test('a collimated or one-ray beam is not scaled, and the readout says why', () => {
  const collimated = bench({ lens: false, offset: 7 });
  const focus = specimenFocusReading(collimated.id);
  assert.deepEqual({ ok: focus.ok, reason: focus.reason }, { ok: false, reason: 'collimated' });
  assert.ok(Math.abs(signal(collimated, 900) - signal(bench({ lens: false, sectioning: false, offset: 7 }), 900)) < 1e-12);
  assert.match(specimenFocusReadout(focus, [{ kind: 'tpef' }]), /Collimated beam/);

  const line = bench({ beamMode: 'line', offset: 1 });
  const lineFocus = specimenFocusReading(line.id);
  assert.equal(lineFocus.reason, 'single');
  assert.match(specimenFocusReadout(lineFocus, [{ kind: 'tpef' }]), /focus unknown/);
  const lineSignal = signal(line, 900);
  assert.ok(lineSignal > 0);
  assert.ok(Math.abs(lineSignal - signal(bench({ beamMode: 'line', sectioning: false, offset: 1 }), 900)) < 1e-12);
});

test('the focus readout names the distance, the Rayleigh range and each order present', () => {
  const sample = bench({ offset: 0.1 });
  const text = specimenFocusReadout(specimenFocusReading(sample.id), [{ kind: 'tpef' }, { kind: 'thg' }]);
  assert.match(text, /^Focus 100 µm before the layer · zR 25\.7 µm · ×0\.0\d+ 2nd-order, ×0\.00\d+ 3rd-order$/);
  assert.equal(specimenFocusReadout(null, [{ kind: 'tpef' }]), 'No beam reaches the specimen yet');
});

test('stimulated Raman transfer depth carries the focus yield', () => {
  const pulse = { repRateMHz: 80, pulseWidthFs: 1000, phaseNs: 0 };
  const gate = { opl: 0, frequencyMHz: 20, duty: 0.5, phaseNs: 0, shape: 'square', high: 1, low: 0 };
  const channel = { ...newSampleChannel('srs'), transferEff: 0.3, requireOverlap: false };
  const donor = { wl: 1030, opl: 0, pulse: { ...pulse, gates: [gate] }, gates: [gate] };
  const receiver = { wl: 780, opl: 0, pulse: { ...pulse } };
  const full = srsTransferGate(channel, receiver, [donor], null);
  const quarter = srsTransferGate(channel, receiver, [donor], null, 0.25);
  assert.ok(Math.abs(full.depth - 0.3) < 1e-12);
  assert.ok(Math.abs(quarter.depth - 0.075) < 1e-12);
  // A pump receiver loses 1 - depth while the Stokes donor is on.
  assert.ok(Math.abs(quarter.high - 0.925) < 1e-12 && quarter.low === 1);
});

// Two thin layers on one beam: the first transmits 0.9 of the excitation.
function stacked(kind, second) {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { wavelength: 800, beamMode: 'beam', beamWidth: 10 });
  const lens = createElement('lens', 100, 0);
  lens.params.f = 50;
  const linear = kind === 'fluor';
  const layer = x => {
    const sample = createElement('sample', x, 0);
    sample.rot = 90;
    Object.assign(sample.params, {
      aperture: 40, thickness: 1, specimenType: linear ? 'linear' : 'nonlinear', transmitExc: true, transmission: 0.9,
      focusSectioning: true, channels: [{ ...newSampleChannel(kind), eff: 0.5, autoWl: false, wl: 900 }],
    });
    return sample;
  };
  const first = layer(130), last = layer(second);
  traceScene([laser, lens, first, last]);
  const read = s => probeBeamsAt(s.x + 1.5, s.y, 1).filter(b => Math.abs(b.wl - 900) < 0.5).reduce((sum, b) => sum + b.power, 0);
  return { first: read(first), last: read(last), focus: specimenFocusReading(last.id) };
}

test('a layer behind another finds its own beam: full excitation share and its own focus', () => {
  // Before the probe pass tagged the excitation it passes on, the second
  // layer missed its beam record and emitted from one sampling ray's power.
  const linear = stacked('fluor', 150);
  assert.ok(linear.first > 0);
  assert.ok(Math.abs(linear.last / linear.first - 0.9) < 1e-6);
  const atFocus = stacked('tpef', 150);
  assert.ok(Math.abs(atFocus.focus.zMm) < 1e-9);
  const behind = stacked('tpef', 150.05);
  const expected = 1 / (1 + (0.05 / behind.focus.zRMm) ** 2);
  assert.ok(Math.abs(behind.last / atFocus.last - expected) < 1e-6);
  // The first layer, 20 mm before the focus, is all but dark.
  assert.ok(atFocus.first / atFocus.last < 1e-4);
});
