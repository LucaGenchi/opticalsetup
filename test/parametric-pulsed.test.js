import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { detectorReading, opoReading, traceScene } from '../sketch/js/raytrace.js';
import {
  idlerWavelength, nmToWavenumberWidth, opoPulse, opoWaves, pumpDepletion, transformLimitFs,
  waveSpectrum, wavenumberToNmWidth,
} from '../sketch/js/parametric.js';
import { spectrumStats, transformLimitedBandwidthNm } from '../sketch/js/spectrum.js';

// Before this model the OPO's signal and idler inherited the pump's spectrum,
// so with any pulsed pump a dichroic routed all of the light as if it were
// still pump: the idler port stayed dark. These scenes are that failure, and
// the regimes a lab OPO actually runs in.

// A Gaussian spectrum crossing a dichroic already loses ~2e-5 of its power to
// tail truncation, so pulsed powers are compared to 1e-4.
const PULSED = 1e-4;
// A dichroic resamples the spectrum it passes onto a grid, so a width read
// back from a detector is good to about 0.1 %.
const WIDTH = 1e-3;
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);
const fwhm = reading => reading.bandMax - reading.bandMin;

// pump -> [extra optics] -> crystal -> dichroic: wavelengths above `cutoff`
// go straight on to `long`, shorter ones reflect down to `short`.
function opoScene({ source = 'pulsedlaser', laser = {}, crystal = {}, cutoff, extra = [], beforeCrystal = [] }) {
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
  traceScene([pump, ...beforeCrystal, xtal, split, long, short, ...extra]);
  return { long: detectorReading(long.id), short: detectorReading(short.id), state: opoReading(xtal.id), xtal };
}

// Ti:sapphire-pumped fs OPO (Chameleon Compact OPO / APE OPO-X class).
const TISA = { wavelength: 800, pulseWidthFs: 140, repRateMHz: 80, avgPowerW: 3.5 };
const TISA_CM = nmToWavenumberWidth(800, transformLimitedBandwidthNm(140, 800, 'gauss'));

test('a synchronously pumped fs OPO sends a real idler to the long-wavelength port', () => {
  const { long, short } = opoScene({ laser: TISA, crystal: { pumpWl: 800, signalWl: 1200 }, cutoff: 1800 });
  assert.ok(long, 'the idler port stayed dark: signal and idler kept the pump spectrum');
  // A band Gaussian in frequency has its wavelength centroid slightly to the red.
  near(long.wavelength, 2400, 1, 'idler centre');
  // converted 0.6, split by photon energy: idler gets λs/(λs+λi) = 1/3
  near(long.signal, 0.2, PULSED, 'idler power');
  near(short.signal, 0.8, PULSED, 'pump + signal power');
});

test('with the signal as wide as the pump, the idler is their quadrature sum in wavenumber', () => {
  const { long, state } = opoScene({ laser: TISA, crystal: { pumpWl: 800, signalWl: 1200 }, cutoff: 1800 });
  near(state.waves.signal.widthCm, TISA_CM, 1e-9, 'signal width');
  near(state.waves.idler.widthCm, Math.SQRT2 * TISA_CM, 1e-9, 'idler width');
  // Read back from the detector through the Jacobian-sampled spectrum.
  const lo = 1e7 / long.bandMax, hi = 1e7 / long.bandMin;
  near(hi - lo, Math.SQRT2 * TISA_CM, 0.01 * TISA_CM, 'idler width at the detector');
});

test('broad outputs are Gaussian in wavenumber, narrow ones stay Gaussian in wavelength', () => {
  const narrow = waveSpectrum(1000, 50); // 0.5 % wide
  assert.equal(narrow.spec.kind, 'gauss');
  near(narrow.bw, wavenumberToNmWidth(1000, 50), 1e-12, 'narrow width');

  const broad = waveSpectrum(2400, 150); // 3.6 % wide
  assert.equal(broad.spec.kind, 'sampled');
  const stats = spectrumStats(broad.spec);
  assert.ok(stats.center > 2400, 'a frequency Gaussian is skewed to the red in wavelength');
  const lo = 1e7 / (1e7 / 2400 + 75), hi = 1e7 / (1e7 / 2400 - 75);
  near(stats.fwhm, hi - lo, 0.01 * (hi - lo), 'half-maximum points sit at ±Δσ/2');
});

test('generated pulses are their own trains, synchronised to the pump, with unknown phase', () => {
  const { long, short } = opoScene({ laser: TISA, crystal: { pumpWl: 800, signalWl: 1200, transmitPump: false }, cutoff: 1800 });
  const idler = long.pulse;
  assert.equal(idler.repRateMHz, 80);
  assert.equal(idler.pulseWidthFs, 140);
  assert.equal(idler.transformLimited, false);
  near(idler.gddFs2, 0, 1e-12, 'idler GDD at the crystal reference plane');
  const train = idler.trains[0];
  near(train.centerWavelengthNm, 2400, 1, 'idler train colour');

  const signal = short.pulse;
  assert.equal(signal.trains.length, 1);
  near(signal.trains[0].centerWavelengthNm, 1200, 1, 'signal train colour');
  assert.equal(signal.pulseWidthFs, 140);
  assert.equal(signal.transformLimited, false, 'an OPO does not know its output phase');
});

test('pump, signal and idler recombined on one detector are three synchronised trains', () => {
  const pump = createElement('pulsedlaser', 60, 160);
  Object.assign(pump.params, TISA);
  const xtal = createElement('crystal', 220, 160);
  Object.assign(xtal.params, { convert: 'opo', pumpWl: 800, signalWl: 1200, efficiency: 0.6 });
  const det = createElement('detector', 400, 160);
  traceScene([pump, xtal, det]);
  const reading = detectorReading(det.id);
  assert.equal(reading.pulse.sources, 3);
  const colours = reading.pulse.trains.map(t => Math.round(t.centerWavelengthNm)).sort((a, b) => a - b);
  assert.deepEqual(colours.map(c => Math.round(c / 100) * 100), [800, 1200, 2400]);
  near(reading.signal, 1, 1e-9, 'energy');
});

test('output durations follow the authored factor, never beat the transform limit, or are declared limited', () => {
  const pump = { sourceId: 'L', repRateMHz: 80, pulseWidthFs: 140, phaseNs: 0, pulseShape: 'gauss', transformLimited: true };
  const wave = waveSpectrum(1200, TISA_CM);
  const longer = opoPulse(pump, wave, { crystalId: 'X', role: 'signal', durationFactor: 1.4 });
  near(longer.pulseWidthFs, 196, 1e-9, '1.4× pump duration');
  assert.equal(longer.spectralPhase, 'unknown');
  assert.equal(longer.sourceId, 'L›X:signal');
  assert.equal(longer.syncSourceId, 'L');

  const tooShort = opoPulse(pump, wave, { crystalId: 'X', role: 'signal', durationFactor: 0.1 });
  near(tooShort.pulseWidthFs, transformLimitFs(TISA_CM), 1e-9, 'raised to the limit');
  assert.equal(tooShort.durationRaisedToLimit, true);
  near(transformLimitFs(TISA_CM), 140, 1e-6, 'a pump-wide signal has the pump transform limit');

  const limited = opoPulse(pump, waveSpectrum(2400, Math.SQRT2 * TISA_CM), { crystalId: 'X', role: 'idler', outputPhase: 'transformLimited' });
  near(limited.pulseWidthFs, 140 / Math.SQRT2, 1e-6, 'transform-limited idler');
  assert.equal(limited.transformLimited, true);
  assert.equal(opoPulse(null, wave, { crystalId: 'X', role: 'signal' }), null, 'CW stays CW');
});

test('a ps OPO in the picoEmerald class with authored 10 cm⁻¹ outputs', () => {
  const { long, short, state } = opoScene({
    laser: { wavelength: 516, pulseWidthFs: 2000, transformLimited: false, bandwidth: wavenumberToNmWidth(516, 10), avgPowerW: 3 },
    crystal: { pumpWl: 516, signalWl: 800, linewidthMode: 'both', signalLinewidthCm: 10, idlerLinewidthCm: 10 }, cutoff: 1000,
  });
  near(state.waves.signal.widthCm, 10, 1e-9, 'signal width');
  near(nmToWavenumberWidth(long.wavelength, fwhm(long)), 10, WIDTH * 10, 'idler width');
  near(long.wavelength, idlerWavelength(516, 800), 1e-3, 'idler centre');
  near(long.signal + short.signal, 1, 2 * PULSED, 'energy');
  assert.equal(long.pulse.pulseWidthFs, 2000);
});

test('a ns OPO takes its signal width from the cavity, and the idler adds the pump width', () => {
  // 5 cm⁻¹ is a typical free-running BBO OPO (EKSPLA NT340: < 5 cm⁻¹).
  const { long, state } = opoScene({
    laser: { wavelength: 355, pulseWidthFs: 5e6, transformLimited: false, bandwidth: wavenumberToNmWidth(355, 1), avgPowerW: 2, repRateMHz: 0.01 },
    crystal: { pumpWl: 355, signalWl: 500, linewidthMode: 'signal', signalLinewidthCm: 5 }, cutoff: 800,
  });
  near(state.waves.signal.widthCm, 5, 1e-9, 'signal width');
  near(nmToWavenumberWidth(long.wavelength, fwhm(long)), Math.hypot(1, 5), WIDTH * 5, 'idler width');
  assert.equal(long.pulse.pulseWidthFs, 5e6);
});

test('a single-frequency CW pump with a single-frequency cavity stays exact', () => {
  const { long, short, state } = opoScene({
    source: 'cwlaser', laser: { wavelength: 1064, avgPowerW: 15 },
    crystal: { pumpWl: 1064, signalWl: 1550, linewidthMode: 'signal', signalLinewidthCm: 0, efficiency: 0.9 },
    cutoff: 2500,
  });
  const idler = idlerWavelength(1064, 1550);
  near(long.wavelength, idler, 1e-9, 'idler');
  assert.equal(fwhm(long), 0);
  assert.equal(long.pulse, null);
  near(long.signal, 0.9 * 1550 / (1550 + idler), 1e-9, 'idler power');
  near(short.signal, 0.1 + 0.9 * idler / (1550 + idler), 1e-9, 'pump + signal');
  assert.equal(state.waves.signal.bw, 0);
});

test('degenerate output carries both distributions, continuous with the near-degenerate pair', () => {
  const at = opoWaves({ pumpWl: 800, pumpFwhmNm: transformLimitedBandwidthNm(140, 800), signalWl: 1600 });
  assert.ok(at.degenerate);
  const merged = spectrumStats(at.merged.spec);
  const signalOnly = spectrumStats(at.signal.spec), idlerOnly = spectrumStats(at.idler.spec);
  assert.ok(merged.fwhm > signalOnly.fwhm && merged.fwhm < idlerOnly.fwhm, 'the sum lies between its parts');

  // Just off degeneracy, the two separate bands weighted by power have the
  // same summed profile.
  const off = opoWaves({ pumpWl: 800, pumpFwhmNm: transformLimitedBandwidthNm(140, 800), signalWl: 1600.001 });
  assert.ok(!off.degenerate);
  near(off.signalShare, 0.5, 1e-6, 'near-degenerate share');
  near(at.signalShare, 0.5, 1e-12, 'degenerate share');

  const { long, short } = opoScene({ laser: TISA, crystal: { pumpWl: 800, signalWl: 1600, efficiency: 0.4 }, cutoff: 1200 });
  near(long.signal, 0.4, PULSED, 'degenerate power');
  near(short.signal, 0.6, PULSED, 'residual pump');
  assert.equal(long.pulse.trains.length, 1);
});

test('the acceptance window is authored and independent of the pump bandwidth', () => {
  const inside = opoScene({ laser: { ...TISA, wavelength: 804 }, crystal: { pumpWl: 800, signalWl: 1200, pumpAcceptanceNm: 5 }, cutoff: 1800 });
  near(inside.long.wavelength, idlerWavelength(804, 1200), 1, 'the idler takes up the pump detuning');

  // The pump is 6.7 nm wide, but the default 1 nm acceptance still rejects a 4 nm detuning.
  const outside = opoScene({ laser: { ...TISA, wavelength: 804 }, crystal: { pumpWl: 800, signalWl: 1200 }, cutoff: 1800 });
  assert.equal(outside.long, null);
  near(outside.short.signal, 1, PULSED, 'unconverted pump');
});

test('light a crystal generated never converts in it again, even through a wide window', () => {
  // Signal 1600 nm returning through a crystal accepting 532 ± 2000 nm.
  const m1 = createElement('mirror', 140, 160);
  const m2 = createElement('mirror', 300, 160);
  m1.params.refl = 95;
  m2.params.refl = 95;
  const { long, short } = opoScene({
    laser: TISA, crystal: { pumpWl: 800, signalWl: 1200, pumpAcceptanceNm: 2000 }, cutoff: 1800, extra: [m1, m2],
  });
  for (const reading of [long, short].filter(Boolean)) {
    assert.ok(Number.isFinite(reading.signal) && reading.signal <= 1 + PULSED, 'unbounded power');
    assert.ok(reading.spectrum.every(s => Number.isFinite(s.wavelength) && Number.isFinite(s.power)));
    assert.ok(!reading.spectrum.some(s => s.wavelength > 3000 && s.power > 1e-6), 'a signal was re-split into a cascade idler');
  }
});

test('pump depletion follows the plane-wave singly resonant solution, then an empirical plateau', () => {
  assert.equal(pumpDepletion(0.5), 0);
  assert.equal(pumpDepletion(1), 0);
  assert.equal(pumpDepletion((Math.PI / 2) ** 2), 1);
  assert.equal(pumpDepletion(10), 1);
  // x/sin x = √N, depletion sin²x: pick x, derive N, recover sin²x.
  for (const x of [0.2, 0.7, 1.2, 1.5]) {
    near(pumpDepletion((x / Math.sin(x)) ** 2), Math.sin(x) ** 2, 1e-9, `depletion at x=${x}`);
  }
});

const CW_THRESHOLD = {
  source: 'cwlaser',
  crystal: { pumpWl: 1064, signalWl: 1550, thresholdW: 3, efficiency: 1, linewidthMode: 'signal', signalLinewidthCm: 0 },
  cutoff: 2500,
};
const idlerShare = 1550 / (1550 + idlerWavelength(1064, 1550));

test('a threshold switches oscillation on with the pump power', () => {
  const run = avgPowerW => opoScene({ ...CW_THRESHOLD, laser: { wavelength: 1064, avgPowerW } });
  const below = run(2);
  assert.equal(below.long, null, 'below threshold there is no idler');
  near(below.short.signal, 1, 1e-9, 'all pump passes');
  assert.equal(below.state.state, 'below');

  const full = run(3 * (Math.PI / 2) ** 2);
  assert.equal(full.state.state, 'oscillating');
  near(full.state.depletion, 1, 1e-9, 'full depletion');

  const partial = run(4.5);
  near(partial.long.signal, pumpDepletion(1.5) * idlerShare, 1e-9, 'idler at 1.5× threshold');
});

test('the threshold sees the whole beam, however many rays sample it', () => {
  const line = opoScene({ ...CW_THRESHOLD, laser: { wavelength: 1064, avgPowerW: 4.5, beamMode: 'line' } });
  const beam = opoScene({ ...CW_THRESHOLD, laser: { wavelength: 1064, avgPowerW: 4.5, beamMode: 'beam', beamWidth: 4 } });
  near(line.state.drive.ratio, 1.5, 1e-9, 'line');
  near(beam.state.drive.ratio, 1.5, 1e-9, 'beam');
  near(beam.long.signal, line.long.signal, 1e-9, 'same idler');
});

test('clipping the pump lowers the drive, uniform attenuation too', () => {
  // A 10 mm beam through a 3 mm slit keeps only the central samples.
  const iris = createElement('slit', 140, 160);
  iris.params.gap = 3;
  const clipped = opoScene({
    ...CW_THRESHOLD, laser: { wavelength: 1064, avgPowerW: 9, beamMode: 'beam', beamWidth: 10 },
    crystal: { ...CW_THRESHOLD.crystal, thresholdW: 1 }, beforeCrystal: [iris],
  });
  const open = opoScene({
    ...CW_THRESHOLD, laser: { wavelength: 1064, avgPowerW: 9, beamMode: 'beam', beamWidth: 10 },
    crystal: { ...CW_THRESHOLD.crystal, thresholdW: 1 },
  });
  near(open.state.drive.amount, 9, 1e-9, 'open beam delivers the source power');
  assert.ok(clipped.state.drive.amount < 0.5 * open.state.drive.amount, `clipped drive ${clipped.state.drive.amount} W`);

  const nd = createElement('filter', 140, 160);
  Object.assign(nd.params, { ftype: 'nd', trans: 0.5 });
  const attenuated = opoScene({ ...CW_THRESHOLD, laser: { wavelength: 1064, avgPowerW: 9 }, beforeCrystal: [nd] });
  near(attenuated.state.drive.amount, 4.5, 1e-6, 'attenuated drive');
});

test('two pump paths meeting on one crystal add up to reach threshold together', () => {
  // A 50/50 splitter sends half the pump up to a mirror that folds it back
  // onto the crystal at an angle. Neither half alone reaches the 3 W threshold.
  const run = withMirror => {
    const laser = createElement('cwlaser', 60, 160);
    Object.assign(laser.params, { wavelength: 1064, avgPowerW: 4.5, beamMode: 'line' });
    const bs = createElement('bs', 140, 160);
    const fold = createElement('mirror', 140, 80);
    fold.rot = 61;
    const xtal = createElement('crystal', 260, 160);
    Object.assign(xtal.params, { convert: 'opo', ...CW_THRESHOLD.crystal });
    traceScene(withMirror ? [laser, bs, fold, xtal] : [laser, bs, xtal]);
    return opoReading(xtal.id);
  };
  const one = run(false);
  near(one.drive.amount, 2.25, 1e-9, 'one path');
  assert.equal(one.state, 'below');
  const both = run(true);
  near(both.drive.amount, 4.5, 1e-9, 'both paths');
  assert.equal(both.state, 'oscillating');
  near(both.depletion, pumpDepletion(1.5), 1e-9, 'depletion from the summed pump');
});

test('a pulse-energy threshold divides average power by the repetition rate', () => {
  // 20 mJ pulses at 1 kHz (the source's lowest repetition rate): 20 W average. Threshold 10 mJ.
  const ns = {
    source: 'pulsedlaser',
    laser: { wavelength: 355, pulseWidthFs: 5e6, transformLimited: false, bandwidth: 0.01, avgPowerW: 20, repRateMHz: 0.001 },
    crystal: { pumpWl: 355, signalWl: 500, thresholdUnit: 'pulseMJ', thresholdW: 10, efficiency: 0.3, linewidthMode: 'signal', signalLinewidthCm: 5 },
    cutoff: 800,
  };
  const { state, long } = opoScene(ns);
  near(state.drive.amount, 20, 1e-9, 'pulse energy');
  near(state.drive.ratio, 2, 1e-9, 'ratio');
  assert.ok(long.signal > 0);

  const cw = opoScene({ ...ns, source: 'cwlaser', laser: { wavelength: 355, avgPowerW: 5 } });
  assert.equal(cw.state.state, 'needs-pulses');
  assert.equal(cw.long, null);
});

test('a source without an average power cannot reach a threshold', () => {
  const { long, state } = opoScene({
    source: 'pointsource', laser: { wavelength: 532 },
    crystal: { pumpWl: 532, signalWl: 800, thresholdW: 1 }, cutoff: 1200,
  });
  assert.equal(long, null);
  if (state?.drive) assert.equal(state.drive.state, 'unknown-power');
});

test('saved OPO crystals without the new settings keep their fixed-fraction behaviour', () => {
  const legacy = createElement('crystal', 0, 0);
  assert.equal(legacy.params.thresholdW, 0);
  assert.equal(legacy.params.pumpAcceptanceNm, 1);
  assert.equal(legacy.params.linewidthMode, 'pump');
  const waves = opoWaves({ pumpWl: 532, signalWl: 800 });
  const { long, short, state } = opoScene({
    source: 'cwlaser', laser: { wavelength: 532 }, crystal: { pumpWl: 532, signalWl: 800 }, cutoff: 1200,
  });
  assert.equal(state.state, 'fixed');
  near(long.signal, 0.6 * (1 - waves.signalShare), 1e-9, 'idler');
  near(short.signal, 0.4 + 0.6 * waves.signalShare, 1e-9, 'pump + signal');
});
