import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { detectorReading, opoReading, traceScene } from '../sketch/js/raytrace.js';
import {
  idlerWavelength, nmToWavenumberWidth, opoWaves, pumpDepletion, wavenumberToNmWidth,
} from '../sketch/js/parametric.js';
import { transformLimitedBandwidthNm } from '../sketch/js/spectrum.js';

// Before this model the OPO's signal and idler inherited the pump's spectrum,
// so with any pulsed pump a dichroic routed all of the light as if it were
// still pump: the idler port stayed dark. These scenes are that failure, and
// the regimes a lab OPO actually runs in.

// A Gaussian spectrum crossing a dichroic already loses ~2e-5 of its power to
// tail truncation, so pulsed powers are compared to 1e-4.
const PULSED = 1e-4;
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);
const fwhm = reading => reading.bandMax - reading.bandMin;
// A dichroic resamples the spectrum it passes onto a grid, so a width read
// back from a detector is good to about 0.1 %.
const WIDTH = 1e-3;

// pump -> crystal -> dichroic: wavelengths above `cutoff` go straight on to
// `long`, shorter ones reflect down to `short`.
function opoScene({ source = 'pulsedlaser', laser = {}, crystal = {}, cutoff, extra = [] }) {
  const pump = createElement(source, 60, 160);
  Object.assign(pump.params, laser);
  const xtal = createElement('crystal', 220, 160);
  Object.assign(xtal.params, { convert: 'opo', efficiency: 0.6, transmitPump: true, ...crystal });
  const split = createElement('dichroic', 350, 160);
  split.rot = 135;
  split.params.cutoff = cutoff;
  const long = createElement('detector', 520, 160);
  const short = createElement('detector', 350, 350);
  short.rot = 90;
  traceScene([pump, xtal, split, long, short, ...extra]);
  return { long: detectorReading(long.id), short: detectorReading(short.id), state: opoReading(xtal.id) };
}

// Ti:sapphire-pumped fs OPO (Chameleon Compact OPO / APE OPO-X class).
const TISA = { wavelength: 800, pulseWidthFs: 140, repRateMHz: 80, avgPowerW: 3.5 };

test('a synchronously pumped fs OPO sends a real idler to the long-wavelength port', () => {
  const { long, short } = opoScene({ laser: TISA, crystal: { pumpWl: 800, signalWl: 1200 }, cutoff: 1800 });
  assert.ok(long, 'the idler port stayed dark: signal and idler kept the pump spectrum');
  near(long.wavelength, 2400, 1e-6, 'idler centre');
  // converted 0.6, split by photon energy: idler gets λs/(λs+λi) = 1/3
  near(long.signal, 0.2, PULSED, 'idler power');
  near(short.signal, 0.8, PULSED, 'pump + signal power');
});

test('signal follows the pump linewidth and the idler is their convolution, in wavenumber', () => {
  const pumpNm = transformLimitedBandwidthNm(140, 800, 'gauss');
  const pumpCm = nmToWavenumberWidth(800, pumpNm);
  const idler = opoScene({ laser: TISA, crystal: { pumpWl: 800, signalWl: 1200 }, cutoff: 1800 }).long;
  near(nmToWavenumberWidth(2400, fwhm(idler)), Math.SQRT2 * pumpCm, WIDTH * pumpCm, 'idler width');

  // Route the signal on its own by putting the cutoff between pump and signal.
  const signal = opoScene({ laser: TISA, crystal: { pumpWl: 800, signalWl: 1200, transmitPump: false }, cutoff: 1000 });
  const signalOnly = signal.long.spectrum.filter(s => s.wavelength < 1800);
  assert.ok(signalOnly.length > 1, 'the signal should be a band, not a single line');
  const waves = signal.state.waves;
  near(waves.signal.widthCm, pumpCm, 1e-9, 'signal width');
  near(waves.signal.bw, wavenumberToNmWidth(1200, pumpCm), 1e-9, 'signal width in nm');
});

test('generated pulses keep the pump train but carry their own colour and no inherited chirp', () => {
  const { long } = opoScene({ laser: TISA, crystal: { pumpWl: 800, signalWl: 1200 }, cutoff: 1800 });
  assert.equal(long.pulse.repRateMHz, 80);
  assert.equal(long.pulse.pulseWidthFs, 140);
  assert.equal(long.pulse.transformLimited, false, 'the idler is wider than its duration requires');
  near(long.pulse.trains[0].centerWavelengthNm, 2400, 1e-6, 'idler train colour');
  near(long.pulse.gddFs2, 0, 1e-12, 'idler GDD');

  // With the pump dumped, the short port sees the signal alone. It is as
  // narrow in frequency as the transform-limited pump, so it stays limited.
  const signal = opoScene({ laser: TISA, crystal: { pumpWl: 800, signalWl: 1200, transmitPump: false }, cutoff: 1800 }).short;
  near(signal.pulse.trains[0].centerWavelengthNm, 1200, 1e-6, 'signal train colour');
  assert.equal(signal.pulse.transformLimited, true);
  assert.equal(signal.pulse.pulseWidthFs, 140);
});

test('a ps OPO in the picoEmerald class: 2 ps pump at 10 cm⁻¹ gives a 10 cm⁻¹ signal', () => {
  const pumpNm = wavenumberToNmWidth(516, 10);
  const { long, short, state } = opoScene({
    laser: { wavelength: 516, pulseWidthFs: 2000, transformLimited: false, bandwidth: pumpNm, avgPowerW: 3 },
    crystal: { pumpWl: 516, signalWl: 800 }, cutoff: 1000,
  });
  near(state.waves.signal.widthCm, 10, 1e-9, 'signal width');
  near(nmToWavenumberWidth(long.wavelength, fwhm(long)), Math.hypot(10, 10), WIDTH * 14, 'idler width');
  near(long.wavelength, idlerWavelength(516, 800), 1e-6, 'idler centre');
  near(long.signal + short.signal, 1, 2 * PULSED, 'energy');
});

test('a ns OPO takes its signal width from the cavity, and the idler adds the pump width', () => {
  // 5 cm⁻¹ is a typical free-running BBO OPO (Ekspla NT340: < 5 cm⁻¹).
  const pumpNm = wavenumberToNmWidth(355, 1);
  const { long, state } = opoScene({
    laser: { wavelength: 355, pulseWidthFs: 5e6, transformLimited: false, bandwidth: pumpNm, avgPowerW: 2, repRateMHz: 1e-5 },
    crystal: { pumpWl: 355, signalWl: 500, linewidthMode: 'fixed', signalLinewidthCm: 5 }, cutoff: 800,
  });
  near(state.waves.signal.widthCm, 5, 1e-9, 'signal width');
  near(nmToWavenumberWidth(long.wavelength, fwhm(long)), Math.hypot(1, 5), WIDTH * 5, 'idler width');
  assert.equal(long.pulse.pulseWidthFs, 5e6);
});

test('a single-frequency CW pump with a single-frequency cavity stays exact', () => {
  const { long, short, state } = opoScene({
    source: 'cwlaser', laser: { wavelength: 1064, avgPowerW: 15 },
    crystal: { pumpWl: 1064, signalWl: 1550, linewidthMode: 'fixed', signalLinewidthCm: 0, efficiency: 0.9 },
    cutoff: 2500,
  });
  const idler = idlerWavelength(1064, 1550);
  near(long.wavelength, idler, 1e-9, 'idler');
  assert.equal(fwhm(long), 0);
  near(long.signal, 0.9 * 1550 / (1550 + idler), 1e-9, 'idler power');
  near(short.signal, 0.1 + 0.9 * idler / (1550 + idler), 1e-9, 'pump + signal');
  assert.equal(state.waves.signal.bw, 0);
});

test('degenerate pulsed output is one band at twice the pump wavelength', () => {
  const { long, short } = opoScene({ laser: TISA, crystal: { pumpWl: 800, signalWl: 1600, efficiency: 0.4 }, cutoff: 1200 });
  near(long.wavelength, 1600, 1e-6, 'degenerate centre');
  near(long.signal, 0.4, PULSED, 'degenerate power');
  near(short.signal, 0.6, PULSED, 'residual pump');
  const pumpCm = nmToWavenumberWidth(800, transformLimitedBandwidthNm(140, 800, 'gauss'));
  near(nmToWavenumberWidth(1600, fwhm(long)), Math.SQRT2 * pumpCm, WIDTH * pumpCm, 'degenerate width');
});

test('the idler follows a detuned pump inside its bandwidth, and ignores one outside it', () => {
  const pumpNm = transformLimitedBandwidthNm(140, 800, 'gauss');
  const detuned = opoScene({ laser: { ...TISA, wavelength: 804 }, crystal: { pumpWl: 800, signalWl: 1200 }, cutoff: 1800 });
  assert.ok(4 < pumpNm, 'the test needs a detuning inside the pump width');
  near(detuned.long.wavelength, idlerWavelength(804, 1200), 1e-6, 'idler takes up the pump detuning');

  const far = opoScene({ laser: { ...TISA, wavelength: 820 }, crystal: { pumpWl: 800, signalWl: 1200 }, cutoff: 1800 });
  assert.equal(far.long, null, 'a pump outside the acceptance should not convert');
  near(far.short.signal, 1, PULSED, 'unconverted pump');
});

test('pump depletion follows the plane-wave singly resonant solution', () => {
  assert.equal(pumpDepletion(0.5), 0);
  assert.equal(pumpDepletion(1), 0);
  assert.equal(pumpDepletion((Math.PI / 2) ** 2), 1);
  assert.equal(pumpDepletion(10), 1, 'back-conversion is not modelled');
  // x/sin x = √N, depletion sin²x: pick x, derive N, recover sin²x.
  for (const x of [0.2, 0.7, 1.2, 1.5]) {
    near(pumpDepletion((x / Math.sin(x)) ** 2), Math.sin(x) ** 2, 1e-9, `depletion at x=${x}`);
  }
  let previous = 0;
  for (let N = 1; N <= 2.5; N += 0.05) {
    const value = pumpDepletion(N);
    assert.ok(value >= previous, `depletion fell at N=${N}`);
    previous = value;
  }
});

test('a threshold switches oscillation on with the pump power', () => {
  const run = avgPowerW => opoScene({
    source: 'cwlaser', laser: { wavelength: 1064, avgPowerW },
    crystal: { pumpWl: 1064, signalWl: 1550, thresholdW: 3, efficiency: 1, linewidthMode: 'fixed', signalLinewidthCm: 0 },
    cutoff: 2500,
  });
  const below = run(2);
  assert.equal(below.long, null, 'below threshold there is no idler');
  near(below.short.signal, 1, 1e-9, 'all pump passes');
  assert.equal(below.state.state, 'below');

  const full = run(3 * (Math.PI / 2) ** 2);
  assert.equal(full.state.state, 'oscillating');
  near(full.state.depletion, 1, 1e-9, 'full depletion');
  assert.ok(!full.short.spectrum.some(s => Math.abs(s.wavelength - 1064) < 1), 'no residual pump at full depletion');

  const partial = run(3 * 1.5);
  near(partial.long.signal, pumpDepletion(1.5) * 1550 / (1550 + idlerWavelength(1064, 1550)), 1e-9, 'idler at 1.5× threshold');
});

test('a source without an average power cannot reach a threshold', () => {
  const { long, state } = opoScene({
    source: 'pointsource', laser: { wavelength: 532 },
    crystal: { pumpWl: 532, signalWl: 800, thresholdW: 1 }, cutoff: 1200,
  });
  assert.equal(long, null);
  if (state) assert.equal(state.state, 'unknown-power');
});

test('saved OPO crystals without the new settings keep their fixed-fraction behaviour', () => {
  const legacy = createElement('crystal', 0, 0);
  assert.equal(legacy.params.thresholdW, 0);
  assert.equal(legacy.params.linewidthMode, 'sync');
  const waves = opoWaves({ pumpWl: 532, signalWl: 800 });
  const { long, short } = opoScene({
    source: 'cwlaser', laser: { wavelength: 532 }, crystal: { pumpWl: 532, signalWl: 800 }, cutoff: 1200,
  });
  near(long.signal, 0.6 * (1 - waves.signalShare), 1e-9, 'idler');
  near(short.signal, 0.4 + 0.6 * waves.signalShare, 1e-9, 'pump + signal');
});

test('an OPO between two mirrors terminates with finite, bounded output', () => {
  const m1 = createElement('mirror', 140, 160);
  const m2 = createElement('mirror', 300, 160);
  m1.params.refl = 0.9;
  m2.params.refl = 0.8;
  const { long, short } = opoScene({
    laser: TISA, crystal: { pumpWl: 800, signalWl: 1200 }, cutoff: 1800, extra: [m1, m2],
  });
  for (const reading of [long, short].filter(Boolean)) {
    assert.ok(Number.isFinite(reading.signal) && reading.signal <= 1 + PULSED, 'unbounded power');
    assert.ok(reading.spectrum.every(s => Number.isFinite(s.wavelength) && Number.isFinite(s.power)));
  }
});
