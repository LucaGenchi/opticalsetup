// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The specimen's coherent Raman readout: the Raman shift and spectral
// resolution of the pump and Stokes as they reach the sample, with the
// physics of the Coherent Raman scattering calculator.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, newSampleChannel, registry, specimenRamanPopup, specimenRamanReadout } from '../sketch/js/elements.js';
import { traceAll, specimenRamanReading } from '../sketch/js/raytrace.js';
import { chirpMismatch, crsResolutionCm, ramanShiftCm, RESOLUTION_PREFACTOR_PS_CM, spectralFocusingShiftCm } from '../sketch/js/coherent-raman.js';
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

test('the pop-up\u2019s figure for sech² pulses: about 12 % narrower than Eq. (5)', () => {
  // The excitation of two transform-limited 2 ps sech² pulses: the amplitude
  // spectrum of the product of their fields, by numerical Fourier transform.
  const tau = 2000, t0 = tau / 1.7627;
  const span = 20000, steps = 40000, dt = 2 * span / steps;
  const amplitude = w => {
    let re = 0, im = 0;
    for (let i = 0; i <= steps; i++) {
      const t = -span + i * dt, m = 1 / Math.cosh(t / t0) ** 2;
      re += m * Math.cos(w * t); im += m * Math.sin(w * t);
    }
    return Math.hypot(re, im);
  };
  const peak = amplitude(0);
  let lo = 0, hi = 1e-4;
  while (amplitude(hi) > peak / 2) hi *= 2;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (amplitude(mid) > peak / 2) lo = mid; else hi = mid; }
  const sechCm = 2 * lo / (2 * Math.PI * 2.99792458e-5);
  close(sechCm, 12.97, 0.01, 'the review\u2019s value');
  close(sechCm / crsResolutionCm(2, 2), 0.88, 0.005, 'about 12 % narrower');
});

// Spectral focusing's scan, from its definition: the excitation spectrum is
// the cross-correlation of the pump and Stokes spectral fields, each a
// Gaussian amplitude with the quadratic phase ½ GDD Δω² and a group delay
// set by its arrival time. Its peak, found numerically, is the vibration
// the pair addresses.
function excitationPeakCm(pump, stokes, delayFs) {
  const a0 = tau => 2 * Math.LN2 / (tau * tau);
  const ap = a0(pump.tau0Fs), as = a0(stokes.tau0Fs);
  const span = 6 * Math.sqrt(Math.max(ap, as)), steps = 6000, dx = 2 * span / steps;
  const amplitude = y => {
    let re = 0, im = 0;
    for (let i = 0; i <= steps; i++) {
      const x = -span + i * dx;
      const mag = Math.exp(-((x + y) ** 2) / (4 * ap) - x * x / (4 * as));
      // The Stokes field's own delay enters as its group delay, −x·delay.
      const arg = 0.5 * pump.gddFs2 * (x + y) ** 2 - 0.5 * stokes.gddFs2 * x * x - x * delayFs;
      re += mag * Math.cos(arg); im += mag * Math.sin(arg);
    }
    return Math.hypot(re, im);
  };
  let lo = -0.05, hi = 0.05;
  for (let k = 0; k < 120; k++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (amplitude(m1) < amplitude(m2)) lo = m1; else hi = m2;
  }
  return (lo + hi) / 2 / (2 * Math.PI * 2.99792458e-5);
}

test('a delay between chirped pulses moves the vibration they address', () => {
  const cases = [
    [{ tau0Fs: 100, gddFs2: 60000 }, { tau0Fs: 100, gddFs2: 60000 }, 150],
    [{ tau0Fs: 100, gddFs2: 60000 }, { tau0Fs: 100, gddFs2: 60000 }, -150],
    [{ tau0Fs: 150, gddFs2: 20000 }, { tau0Fs: 300, gddFs2: -10000 }, 200],
    [{ tau0Fs: 80, gddFs2: -40000 }, { tau0Fs: 120, gddFs2: -40000 }, 90],
  ];
  for (const [pump, stokes, delay] of cases) {
    close(spectralFocusingShiftCm(pump, stokes, delay), excitationPeakCm(pump, stokes, delay), 1e-3, JSON.stringify([pump, stokes, delay]));
  }
  // A Stokes 150 fs after a pump, both 100 fs stretched by 60 000 fs²: the
  // 13.2 cm⁻¹ the review measured, and Eq. (6) of Mohseni et al.,
  // dt/(2πc GDD) = 13.27 cm⁻¹, in the limit of strong chirp.
  close(spectralFocusingShiftCm(cases[0][0], cases[0][1], 150), 13.224, 1e-3);
  const strong = { tau0Fs: 100, gddFs2: 2e6 };
  const eq6 = 150 / 2e6 / (2 * Math.PI * 2.99792458e-5);
  close(spectralFocusingShiftCm(strong, strong, 150), eq6, 1e-5 * eq6, 'Eq. (6)');
  // Transform-limited pulses bring every colour at once: no scan.
  close(spectralFocusingShiftCm({ tau0Fs: 100, gddFs2: 0 }, { tau0Fs: 300, gddFs2: 0 }, 500), 0, 1e-12);
  for (const bad of [[null, strong, 1], [strong, strong, NaN], [{ tau0Fs: 0, gddFs2: 0 }, strong, 1]]) {
    assert.equal(spectralFocusingShiftCm(...bad), null);
  }
});

// Lasers on one nonlinear specimen, each arm optionally through a pulse
// compressor adding `gdd` fs² and a filter, and each laser optionally moved
// back by `backMm` so its pulses arrive later.
function bench({
  wls = [800, 1040], widthFs = 2000, gdd = [0, 0], cw = [false, false], kinds = ['cars'],
  filters = [], backMm = [], shape = 'gauss',
} = {}) {
  const elements = [];
  wls.forEach((wl, i) => {
    const y = (i - (wls.length - 1) / 2) * 30;
    const laser = createElement(cw[i] ? 'cwlaser' : 'pulsedlaser', -(backMm[i] || 0), y);
    Object.assign(laser.params, { wavelength: wl, beamMode: 'line' });
    if (!cw[i]) Object.assign(laser.params, { repRateMHz: 80, pulseWidthFs: widthFs, pulseShape: shape });
    elements.push(laser);
    if (gdd[i]) {
      const compressor = createElement('pulsecompressor', 100, y);
      Object.assign(compressor.params, { gddFs2: gdd[i], aperture: 10 });
      elements.push(compressor);
    }
    if (filters[i]) {
      const filter = createElement('filter', 150, y);
      Object.assign(filter.params, filters[i]);
      elements.push(filter);
    }
  });
  const sample = createElement('sample', 200, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 80, specimenType: 'nonlinear', channels: kinds.map(k => ({ ...newSampleChannel(k), eff: 0.5 })),
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

test('the probed shift follows the delay between chirped pulses, as spectral focusing scans', () => {
  // The review's bench: 100 fs pulses, +60 000 fs² in both arms, the Stokes
  // laser 45 µm further back -- 150 fs late.
  const delayed = bench({ widthFs: 100, gdd: [60000, 60000], backMm: [0, 150e-6 * 299.792458] }).reading;
  close(delayed.delayFs, 150, 1e-6);
  close(delayed.carrierShiftCm, ramanShiftCm(800, 1040), 1e-9);
  close(delayed.shiftCm - delayed.carrierShiftCm, 13.224, 1e-3);
  assert.equal(delayed.delayShift, 'computed');
  assert.match(specimenRamanReadout(delayed),
    /→ 2897\.8 cm⁻¹ probed \(2884\.6 cm⁻¹ between the carriers, moved by the Stokes arriving 150 fs after the pump\), [\d.]+ cm⁻¹ resolution \(equally chirped pulses/);
  // The pump late instead: the scan goes the other way.
  const early = bench({ widthFs: 100, gdd: [60000, 60000], backMm: [150e-6 * 299.792458, 0] }).reading;
  close(early.shiftCm - early.carrierShiftCm, -13.224, 1e-3);
  assert.match(specimenRamanReadout(early), /the Stokes arriving 150 fs before the pump/);

  // Transform-limited pulses do not scan, delayed or not.
  const plain = bench({ backMm: [0, 0.1] }).reading;
  assert.ok(plain.delayFs > 300);
  close(plain.shiftCm, plain.carrierShiftCm, 1e-9);
  assert.match(specimenRamanReadout(plain), /→ 2884\.6 cm⁻¹ probed, 14\.7 cm⁻¹ resolution/);

  // Without the spectral phase the scan cannot be computed: the readout gives
  // the carriers' difference and says so.
  const sech = bench({ shape: 'sech2', backMm: [0, 0.1] }).reading;
  assert.equal(sech.delayShift, 'unknownPhase');
  assert.match(specimenRamanReadout(sech),
    /→ 2884\.6 cm⁻¹ between the carriers \(with the Stokes arriving 333\.6 fs after the pump, the shift actually probed is not computed/);
  assert.equal(bench({ shape: 'sech2' }).reading.delayShift, null, 'no delay, nothing to say');
});

test('a pulse that is not a Gaussian gives an estimate, marked and explained', () => {
  // The review's bench: 20 fs pulses cut to 10 and 1 nm. Each duration is the
  // filtered band's own, with the source's chirp and the path's dispersion.
  const { reading } = bench({
    widthFs: 20, filters: [{ ftype: 'bandpass', center: 800, band: 10 }, { ftype: 'bandpass', center: 1040, band: 1 }],
  });
  assert.equal(reading.state, 'resolved');
  assert.equal(reading.pump.shape, 'reshaped');
  assert.equal(reading.stokes.shape, 'reshaped');
  assert.ok(reading.estimate);
  close(reading.resolutionCm, crsResolutionCm(reading.pump.durationFs / 1000, reading.stokes.durationFs / 1000), 1e-9);
  close(reading.resolutionCm, 110, 1);
  assert.match(specimenRamanReadout(reading), /, ≈ 110 cm⁻¹ resolution \(transform-limited pulses, a Gaussian-pulse estimate\)$/);
  assert.match(specimenRamanPopup(reading), /^Estimate\. The pump is not a Gaussian: its spectrum was reshaped upstream, by a filter or an amplifier’s gain\. The Stokes is not a Gaussian: its spectrum was reshaped upstream.*computed from the band that survived.*as a Gaussian in time of its duration here/);

  const one = bench({ widthFs: 20, filters: [null, { ftype: 'bandpass', center: 1040, band: 2 }] }).reading;
  assert.equal(one.pump.shape, 'gaussian');
  assert.equal(one.stokes.shape, 'reshaped');
  assert.match(specimenRamanPopup(one), /^Estimate\. The Stokes is not a Gaussian: its spectrum was reshaped upstream/);
  assert.doesNotMatch(specimenRamanPopup(one), /The pump is not/);

  // sech² pulses: Eq. (5) is for Gaussians, and two transform-limited 2 ps
  // sech² pulses really excite a 12.97 cm⁻¹ profile (the transform of the
  // product of their fields), not 14.7. The value is marked, not hidden.
  const sech = bench({ shape: 'sech2' }).reading;
  assert.equal(sech.pump.shape, 'sech2');
  assert.ok(sech.estimate);
  assert.match(specimenRamanReadout(sech),
    /, ≈ 14\.7 cm⁻¹ resolution if the pulses are transform-limited or equally chirped \(their spectral phase is not known here, a Gaussian-pulse estimate\)$/);
  assert.match(specimenRamanPopup(sech), /The pump is not a Gaussian: it is a sech² pulse\. The Stokes is not a Gaussian: it is a sech² pulse\. The resolution formula/);
  assert.doesNotMatch(specimenRamanPopup(sech), /band that survived/, 'nothing was filtered');
  assert.doesNotMatch(specimenRamanPopup(sech), /delay/, 'no delay shift is computed without the phase');
  assert.match(specimenRamanPopup(reading), /of its duration here; so does the shift a delay between chirped pulses gives\./);
  assert.match(specimenRamanPopup(sech), /about 12 % narrower for two sech² pulses/);
  // A numerically computed envelope (an OPA's, say) is named as such.
  const computed = { ...sech, pump: { ...sech.pump, shape: 'computed' }, stokes: { ...sech.stokes, shape: 'gaussian' } };
  assert.match(specimenRamanPopup(computed), /^Estimate\. The pump is not a Gaussian: its envelope is computed numerically\. The resolution/);
  // A Gaussian pair needs no estimate.
  assert.equal(bench().reading.pump.shape, 'gaussian');
  assert.ok(!bench().reading.estimate);
  // An unfiltered pair needs no pop-up.
  assert.equal(specimenRamanPopup(bench().reading), null);
  assert.equal(specimenRamanPopup(null), null);
});

test('close colours never make one beam both pump and Stokes', () => {
  // The review's bench: 800, 800.5 and 801 nm with the outer two dimmed.
  // The strongest beam near either end is the 800.5 nm one; it cannot be both.
  const nd = { ftype: 'nd', trans: 0.5 };
  const { reading } = bench({ wls: [800, 800.5, 801], filters: [nd, null, nd] });
  assert.equal(reading.state, 'resolved');
  assert.ok(reading.stokes.wl - reading.pump.wl >= 1, `${reading.pump.wl} / ${reading.stokes.wl}`);
  assert.ok(Number.isFinite(reading.shiftCm));
  assert.doesNotThrow(() => specimenRamanReadout(reading));
  // Wider apart, the strongest beam at each end is still read.
  const wide = bench({ wls: [800, 800.5, 1040, 1040.5], filters: [nd, null, null, nd] }).reading;
  assert.equal(wide.colours, 2);
  close(wide.pump.wl, 800.5, 1e-9);
  close(wide.stokes.wl, 1040, 1e-9);
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
