// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The specimen's coherent Raman readout: the Raman shift and spectral
// resolution of the pump and Stokes as they reach the sample, with the
// physics of the Coherent Raman scattering calculator.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, newSampleChannel, registry, specimenRamanReadout } from '../sketch/js/elements.js';
import { traceAll, specimenRamanReading } from '../sketch/js/raytrace.js';
import { chirpMismatch, crsResolutionCm, ramanShiftCm, RESOLUTION_PREFACTOR_PS_CM } from '../sketch/js/coherent-raman.js';
import { computeResolution } from '../calculators/coherent-raman/crs-calculator.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('the shared relations reproduce the calculator page', () => {
  // The page's own worked example: 800 + 1040 nm, two 2 ps pulses.
  close(ramanShiftCm(800, 1040), 2884.6, 0.05);
  close(crsResolutionCm(2, 2), 14.7, 0.05);
  close(RESOLUTION_PREFACTOR_PS_CM, 20.8, 0.05, 'the paper’s 20.8 ps·cm⁻¹ prefactor');
  assert.equal(computeResolution({ pumpPs: 0.3, stokesPs: 5 }).resolutionCm, crsResolutionCm(0.3, 5));
  // Equal, reversed and missing inputs give nothing rather than a number.
  for (const [p, s] of [[800, 800], [1040, 800], [0, 1040], [NaN, 1040]]) assert.equal(ramanShiftCm(p, s), null);
  for (const [p, s] of [[0, 1], [1, -1], [NaN, 1]]) assert.equal(crsResolutionCm(p, s), null);
});

test('the chirp mismatch is the broadening a Gaussian beat really has', () => {
  // Independent reference: build E_p(t) E_S*(t) from each pulse's spectral
  // phase, Fourier transform it numerically, and measure the FWHM of its
  // amplitude spectrum. Eq. (5) is that width for equal chirps; a mismatch m
  // widens it by √(1 + m²).
  const field = ({ tau0Fs, gddFs2 }) => {
    const inverse = tau0Fs * tau0Fs / (2 * Math.LN2), d = inverse * inverse + 4 * gddFs2 * gddFs2;
    return { a: inverse / d, b: -2 * gddFs2 / d };
  };
  const beatWidthCm = (pump, stokes) => {
    const p = field(pump), s = field(stokes);
    const A = p.a + s.a, B = p.b - s.b;
    const span = 5 / Math.sqrt(A), steps = 4000, dt = 2 * span / steps;
    const amplitude = w => {
      let re = 0, im = 0;
      for (let i = 0; i <= steps; i++) {
        const t = -span + i * dt, mag = Math.exp(-A * t * t), arg = -B * t * t + w * t;
        re += mag * Math.cos(arg); im += mag * Math.sin(arg);
      }
      return Math.hypot(re, im);
    };
    const peak = amplitude(0);
    let lo = 0, hi = 1;
    while (amplitude(hi) > peak / 2) hi *= 2;
    for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (amplitude(mid) > peak / 2) lo = mid; else hi = mid; }
    // rad/fs → cm⁻¹, full width.
    return 2 * lo / (2 * Math.PI * 2.99792458e-5);
  };
  const durationPs = ({ tau0Fs, gddFs2 }) => tau0Fs * Math.hypot(1, 4 * Math.LN2 * gddFs2 / tau0Fs ** 2) / 1000;
  const cases = [
    [{ tau0Fs: 150, gddFs2: 0 }, { tau0Fs: 300, gddFs2: 0 }],          // transform-limited
    [{ tau0Fs: 120, gddFs2: 60000 }, { tau0Fs: 120, gddFs2: 60000 }],  // equally chirped
    [{ tau0Fs: 120, gddFs2: 60000 }, { tau0Fs: 120, gddFs2: 0 }],      // only the pump chirped
    [{ tau0Fs: 200, gddFs2: -20000 }, { tau0Fs: 400, gddFs2: 30000 }], // opposite chirps
  ];
  for (const [pump, stokes] of cases) {
    const m = chirpMismatch(pump, stokes);
    const eq5 = crsResolutionCm(durationPs(pump), durationPs(stokes));
    close(beatWidthCm(pump, stokes), eq5 * Math.hypot(1, m), 1e-4 * eq5, `${JSON.stringify([pump, stokes])}`);
  }
  assert.equal(chirpMismatch(cases[1][0], cases[1][1]), 0);
  // A long chirped pump beside a short transform-limited Stokes barely
  // matters (the short pulse sets the width); opposite chirps do.
  const pumpOnly = chirpMismatch(cases[2][0], cases[2][1]);
  assert.ok(pumpOnly > 0 && pumpOnly < 0.1, `${pumpOnly}`);
  assert.ok(chirpMismatch(cases[3][0], cases[3][1]) > 1);
  // Spectral focusing proper: different transform limits stretched to one
  // chirp rate. Solve the Stokes GDD for the pump's rate b; the mismatch is 0.
  const pump = { tau0Fs: 100, gddFs2: 50000 };
  const target = field(pump).b, inverseS = 200 * 200 / (2 * Math.LN2);
  // b(φ) = −2φ/(inverse² + 4φ²): take the root on the strongly chirped branch.
  const phi = (-1 - Math.sqrt(1 - 4 * target * target * inverseS * inverseS)) / (4 * target);
  close(chirpMismatch(pump, { tau0Fs: 200, gddFs2: phi }), 0, 1e-9);
  for (const bad of [null, {}, { tau0Fs: 0, gddFs2: 0 }, { tau0Fs: 100, gddFs2: NaN }]) {
    assert.equal(chirpMismatch(bad, pump), null);
  }
});

// Two lasers on one nonlinear specimen, each arm optionally through a pulse
// compressor that adds `gdd` fs².
function bench({ wls = [800, 1040], widthFs = 2000, gdd = [0, 0], cw = [false, false], kinds = ['cars'] } = {}) {
  const elements = [];
  wls.forEach((wl, i) => {
    const y = i === 0 ? -6 : 6;
    const laser = createElement(cw[i] ? 'cwlaser' : 'pulsedlaser', 0, y);
    Object.assign(laser.params, { wavelength: wl, beamMode: 'line' });
    if (!cw[i]) Object.assign(laser.params, { repRateMHz: 80, pulseWidthFs: widthFs });
    elements.push(laser);
    if (gdd[i]) {
      const compressor = createElement('pulsecompressor', 100, y);
      Object.assign(compressor.params, { gddFs2: gdd[i], aperture: 10 });
      elements.push(compressor);
    }
  });
  const sample = createElement('sample', 200, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 40, specimenType: 'nonlinear', channels: kinds.map(k => ({ ...newSampleChannel(k), eff: 0.5 })),
  });
  elements.push(sample);
  traceAll(elements);
  return { sample, reading: specimenRamanReading(sample.id) };
}

test('transform-limited pulses at the sample give the calculator’s shift and resolution', () => {
  const { reading } = bench();
  assert.equal(reading.state, 'resolved');
  assert.equal(reading.phase, 'transformLimited');
  close(reading.pump.wl, 800, 1e-6);
  close(reading.stokes.wl, 1040, 1e-6);
  close(reading.pump.durationFs, 2000, 1e-6);
  assert.ok(reading.pump.bwNm > 0 && reading.stokes.bwNm > reading.pump.bwNm, 'each beam’s arriving bandwidth');
  close(reading.shiftCm, ramanShiftCm(800, 1040), 1e-9);
  close(reading.resolutionCm, crsResolutionCm(2, 2), 1e-9);
  assert.equal(specimenRamanReadout(reading),
    `Pump 800 nm, ${Number(reading.pump.bwNm.toPrecision(3))} nm FWHM, 2 ps here; `
    + `Stokes 1040 nm, ${Number(reading.stokes.bwNm.toPrecision(3))} nm FWHM, 2 ps here `
    + '→ 2884.6 cm⁻¹ probed, 14.7 cm⁻¹ resolution (transform-limited pulses)');
});

test('the durations are the ones at the sample, after the dispersion on the way', () => {
  // 100 fs pulses through +20 000 fs² in both arms: both stretch to ~555 fs
  // with the same chirp rate, which is spectral focusing.
  const { reading } = bench({ widthFs: 100, gdd: [20000, 20000] });
  const stretched = 100 * Math.hypot(1, 4 * Math.LN2 * 20000 / 100 ** 2);
  close(reading.pump.durationFs, stretched, 1e-6);
  close(reading.stokes.durationFs, stretched, 1e-6);
  assert.equal(reading.phase, 'equalChirp');
  close(reading.resolutionCm, crsResolutionCm(stretched / 1000, stretched / 1000), 1e-9);
  assert.match(specimenRamanReadout(reading), /resolution \(equally chirped pulses, as in spectral focusing\)$/);

  // Only the pump chirped: Eq. (5) is then a floor, and the readout says so.
  const uneven = bench({ widthFs: 100, gdd: [20000, 0] }).reading;
  assert.equal(uneven.phase, 'chirpMismatch');
  close(uneven.stokes.durationFs, 100, 1e-6);
  assert.match(specimenRamanReadout(uneven), /→ 2884\.6 cm⁻¹ probed, at least [\d.]+ cm⁻¹ resolution: the pulses are chirped differently/);

  // A pump stretched to 5.5 ps beside a 100 fs Stokes: the chirps differ, but
  // the short Stokes sets the width, so Eq. (5) holds -- without calling it
  // spectral focusing.
  const lopsided = bench({ widthFs: 100, gdd: [200000, 0] }).reading;
  assert.equal(lopsided.phase, 'chirpNegligible');
  close(lopsided.resolutionCm, crsResolutionCm(lopsided.pump.durationFs / 1000, 0.1), 1e-9);
  assert.match(specimenRamanReadout(lopsided), /resolution \(the pulses are chirped differently, too little to change it\)$/);
});

test('what cannot be estimated is said, not guessed', () => {
  const one = bench({ wls: [800, 800.5] }).reading;
  assert.equal(one.state, 'oneColour');
  assert.match(specimenRamanReadout(one), /One colour only \(800 nm\)/);

  const cw = bench({ cw: [false, true] }).reading;
  assert.equal(cw.state, 'continuous');
  close(cw.shiftCm, ramanShiftCm(800, 1040), 1e-9, 'the shift is still known');
  assert.match(specimenRamanReadout(cw), /Stokes 1040 nm, continuous → 2884\.6 cm⁻¹ probed; resolution not estimated/);

  const three = bench({ wls: [800, 900, 1040] }).reading;
  assert.equal(three.colours, 3);
  assert.match(specimenRamanReadout(three), /3 colours on the spot: the shortest is read as the pump, the longest as the Stokes/);

  assert.equal(specimenRamanReadout(null), 'No beams reach the specimen yet');
  assert.equal(specimenRamanReading('no-such-element'), null);
});

test('the readout appears on both specimen holders, for CARS or SRS only', () => {
  for (const type of ['sample', 'stage']) {
    const field = registry[type].params.find(p => p.key === 'ramanProbe');
    assert.ok(field, `${type} has the readout`);
    const params = kinds => ({ specimenType: 'nonlinear', channels: kinds.map(k => newSampleChannel(k)) });
    assert.ok(field.show(params(['cars'])));
    assert.ok(field.show(params(['srs'])));
    assert.ok(!field.show(params(['shg', 'tpef'])), 'not for signals that address no vibration');
    assert.ok(!field.show({ specimenType: 'linear', channels: [newSampleChannel('fluor')] }));
  }
});
