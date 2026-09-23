// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The pulsed laser's temporal controls: transform-limited pulses are authored
// as a duration; chirped ones as a bandwidth, a quadratic chirp's sign and its
// GDD, with every duration derived so it can never fall below the transform
// limit the bandwidth sets.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry, pulseEnergyJ, formatEnergy, peakPowerW } from '../sketch/js/elements.js';
import { authoredPulseTiming, gaussianPulseDurationAfterGDD, MAX_SOURCE_GDD_FS2 } from '../sketch/js/glass.js';
import { transformLimitedBandwidthNm, transformLimitedDurationFs } from '../sketch/js/spectrum.js';

const spec = key => registry.pulsedlaser.params.find(p => p.key === key);
const close = (actual, expected, tolerance, label = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} ${actual} is not within ${tolerance} of ${expected}`);

test('the transform-limited toggle comes first and decides which fields are authored', () => {
  const keys = registry.pulsedlaser.params.map(p => p.key);
  assert.ok(keys.indexOf('transformLimited') < keys.indexOf('pulseWidthFs'), 'toggle before the duration');
  const shownWhen = (key, transformLimited) => {
    const s = spec(key);
    return !s.show || s.show({ transformLimited });
  };
  for (const key of ['pulseWidthFs', 'bandwidthTL']) {
    assert.equal(shownWhen(key, true), true, key);
    assert.equal(shownWhen(key, false), false, key);
  }
  for (const key of ['bandwidth', 'durationTL', 'inputChirp', 'chirpGddFs2', 'durationChirped']) {
    assert.equal(shownWhen(key, true), false, key);
    assert.equal(shownWhen(key, false), true, key);
  }
  assert.equal(shownWhen('pulseShape', true) && shownWhen('pulseShape', false), true, 'shape in both');
  assert.deepEqual(spec('inputChirp').options.map(o => o[0]), ['positive', 'negative'], 'no Unknown on the laser');
  assert.equal(spec('chirpGddFs2').min, 0);
  assert.equal(spec('chirpGddFs2').max, MAX_SOURCE_GDD_FS2);
});

test('a chirped laser emits the duration its bandwidth and GDD give, never below the limit', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { wavelength: 800, transformLimited: false, bandwidth: 5, inputChirp: 'negative', chirpGddFs2: 0 });
  const tau0 = transformLimitedDurationFs(5, 800, 'gauss');
  close(authoredPulseTiming(laser.params).durationFs, tau0, 1e-9, 'no GDD: at the limit');
  laser.params.chirpGddFs2 = 135000;
  const timing = authoredPulseTiming(laser.params);
  assert.equal(timing.inputGddFs2, -135000, 'the sign and magnitude make one signed GDD');
  close(timing.durationFs, gaussianPulseDurationAfterGDD(tau0, 135000), 1e-9);
  assert.ok(timing.durationFs > 1900 && timing.durationFs < 2100, 'about 2 ps, as in the reviewer\'s scene');
  // The readouts show the same numbers.
  assert.match(spec('durationTL').readout(laser.params), /188\.3 fs/);
  assert.match(spec('durationChirped').readout(laser.params), /ps$/);
});

test('pulse energy and peak power follow the emitted pulse', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { avgPowerW: 0.1, repRateMHz: 80, transformLimited: true, pulseWidthFs: 100 });
  close(pulseEnergyJ(laser.params), 1.25e-9, 1e-18);
  assert.equal(formatEnergy(pulseEnergyJ(laser.params)), '1.25 nJ');
  assert.equal(spec('pulseEnergy').readout(laser.params), '1.25 nJ');
  const limited = peakPowerW(laser.params);
  Object.assign(laser.params, { transformLimited: false, bandwidth: 9.4, chirpGddFs2: 20000 });
  assert.ok(peakPowerW(laser.params) < limited / 3, 'a stretched pulse has less peak power');
  assert.doesNotMatch(spec('peakPower').readout(laser.params), /estimate/, 'a chirped Gaussian stays Gaussian');
  laser.params.pulseShape = 'sech2';
  assert.match(spec('peakPower').readout(laser.params), /estimate/, 'a dispersed sech² is not an exact sech²');
});

test('a spectrum carried across the mode toggle survives a save and reload, at both extremes', async () => {
  // The reviewer's reproduction: a 1 ns transform-limited pulse toggled to
  // chirped computed 0.00094 nm, which reload then clamped to 0.1 nm -- a pulse
  // 106 times shorter -- and a 1 fs pulse's 941.5 nm was clamped to 400 nm.
  const { state, parseSketch } = await import('../sketch/js/state.js');
  const { initInspector, renderInspector, applyInput } = await import('../sketch/js/inspector.js');
  initInspector({ innerHTML: '', querySelector: () => null, querySelectorAll: () => [] });
  const toggle = (laser, checked) => {
    Object.assign(state, { elements: [laser], beams: [], selection: { kind: 'element', id: laser.id }, embedMode: false });
    renderInspector();
    applyInput({ dataset: { p: 'transformLimited' }, type: 'checkbox', checked }, true);
  };
  const reopen = laser => parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [laser], beams: [] }), registry).elements[0];
  for (const duration of [1e6, 1e9, 1, 50]) {
    const laser = createElement('pulsedlaser', 0, 0);
    Object.assign(laser.params, { wavelength: 800, transformLimited: true, pulseWidthFs: duration });
    toggle(laser, false);
    const before = authoredPulseTiming(laser.params);
    const after = reopen(laser);
    assert.equal(after.params.bandwidth, laser.params.bandwidth, `${duration} fs: bandwidth kept`);
    close(authoredPulseTiming(after.params).durationFs, before.durationFs, before.durationFs * 1e-12, `${duration} fs`);
    // And back: the duration it returns to is also kept through a reload.
    toggle(laser, true);
    assert.equal(reopen(laser).params.pulseWidthFs, laser.params.pulseWidthFs, `${duration} fs back to transform-limited`);
  }
  // The accessor, the field and a reload agree on the bounds.
  const edge = createElement('pulsedlaser', 0, 0);
  Object.assign(edge.params, { wavelength: 800, transformLimited: false, bandwidth: 5000 });
  close(authoredPulseTiming(edge.params).durationFs, authoredPulseTiming(reopen(edge).params).durationFs, 1e-12, 'clamped alike');
});

test('to transform-limited restores its last duration; to chirped reinitializes from it', async () => {
  // Switching to transform-limited restores the last transform-limited
  // duration instead of deriving one from the chirped bandwidth -- which can
  // imply a limit outside 1 fs – 1 ms (900 nm at 400 nm implies 0.26 fs) that
  // the field would have to clamp. Switching to chirped initializes the
  // bandwidth from the current transform-limited pulse and resets the GDD, so
  // previous chirped settings are replaced.
  const { state, parseSketch } = await import('../sketch/js/state.js');
  const { initInspector, renderInspector, applyInput } = await import('../sketch/js/inspector.js');
  initInspector({ innerHTML: '', querySelector: () => null, querySelectorAll: () => [] });
  const toggle = (laser, checked) => {
    Object.assign(state, { elements: [laser], beams: [], selection: { kind: 'element', id: laser.id }, embedMode: false });
    renderInspector();
    applyInput({ dataset: { p: 'transformLimited' }, type: 'checkbox', checked }, true);
  };
  const reopen = laser => parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [laser], beams: [] }), registry).elements[0];
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { wavelength: 800, transformLimited: true, pulseWidthFs: 150 });
  toggle(laser, false);
  toggle(laser, true);
  assert.equal(laser.params.pulseWidthFs, 150, 'off and on with no edits: the same pulse');
  // The reviewer's out-of-range case: chirped at 400 nm, 900 nm, then back.
  toggle(laser, false);
  Object.assign(laser.params, { wavelength: 400, bandwidth: 900, chirpGddFs2: 0 });
  close(authoredPulseTiming(laser.params).durationFs, 0.2615, 1e-3, 'the chirped pulse keeps its implied 0.26 fs');
  toggle(laser, true);
  assert.equal(laser.params.pulseWidthFs, 150, 'transform-limited restores its last duration, unclamped');
  assert.equal(reopen(laser).params.pulseWidthFs, 150, 'and a reload keeps it');
  // The next switch to chirped replaces the old chirped settings: the
  // bandwidth is the 150 fs pulse's at 400 nm, the GDD zero, the pulse unchanged.
  laser.params.chirpGddFs2 = 5000;
  toggle(laser, false);
  close(laser.params.bandwidth, transformLimitedBandwidthNm(150, 400, 'gauss'), 0.001, 'bandwidth reinitialized');
  assert.equal(laser.params.chirpGddFs2, 0, 'GDD reset');
  close(authoredPulseTiming(laser.params).durationFs, 150, 0.05, 'the emitted pulse is unchanged');
});

test('after a wavelength or shape edit, the spectrum, the timing and a reload agree', async () => {
  // The reviewer's reproduction: 800 nm, chirped, 900 nm bandwidth, then
  // 400 nm. The emitted spectrum and the timing must use one bandwidth, and a
  // reload must not change it.
  const { state, parseSketch } = await import('../sketch/js/state.js');
  const { initInspector, renderInspector, applyInput } = await import('../sketch/js/inspector.js');
  const { resolveSourceSpectrum } = await import('../sketch/js/spectrum.js');
  initInspector({ innerHTML: '', querySelector: () => null, querySelectorAll: () => [] });
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { wavelength: 800, transformLimited: false, bandwidth: 900, inputChirp: 'positive', chirpGddFs2: 0 });
  Object.assign(state, { elements: [laser], beams: [], selection: { kind: 'element', id: laser.id }, embedMode: false });
  renderInspector();
  for (const [key, value] of [['wavelength', 400], ['pulseShape', 'sech2']]) {
    const input = key === 'pulseShape' ? { dataset: { p: key }, type: 'select-one', value } : { dataset: { p: key }, type: 'number', value: String(value), min: '100', max: '12000' };
    applyInput(input, true);
    const emitted = resolveSourceSpectrum('pulsedlaser', laser.params).bw;
    const timing = authoredPulseTiming(laser.params);
    close(timing.transformLimitFs, transformLimitedDurationFs(emitted, laser.params.wavelength, laser.params.pulseShape), 1e-9, `${key}: timing uses the emitted bandwidth`);
    const reopened = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [laser], beams: [] }), registry).elements[0];
    assert.equal(resolveSourceSpectrum('pulsedlaser', reopened.params).bw, emitted, `${key}: reload keeps the spectrum`);
    close(authoredPulseTiming(reopened.params).durationFs, timing.durationFs, 1e-12, `${key}: reload keeps the timing`);
  }
});

test('the tracer\'s pulse record carries exactly the duration the readout shows', async () => {
  const { traceScene } = await import('../sketch/js/raytrace.js');
  for (const params of [
    { wavelength: 400, transformLimited: false, bandwidth: 900, chirpGddFs2: 0 },   // implies 0.26 fs
    { wavelength: 800, transformLimited: false, bandwidth: 5, chirpGddFs2: 135000 },
    { wavelength: 800, transformLimited: true, pulseWidthFs: 150 },
  ]) {
    const laser = createElement('pulsedlaser', 0, 0);
    Object.assign(laser.params, { beamMode: 'line', ...params });
    const det = createElement('detector', 200, 0);
    const { pulseTracks } = traceScene([laser, det]);
    close(pulseTracks[0].pulse.pulseWidthFs, authoredPulseTiming(laser.params).durationFs, 1e-12, JSON.stringify(params));
  }
});
