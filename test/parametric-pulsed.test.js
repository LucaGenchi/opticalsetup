import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { detectorReading, opoReading, traceScene } from '../sketch/js/raytrace.js';
import {
  idlerWavelength, nmToWavenumberWidth, opoPulse, opoWaves, transformLimitFs,
  waveSpectrum, wavenumberToNmWidth,
} from '../sketch/js/parametric.js';
import { spectrumStats, transformLimitedBandwidthNm } from '../sketch/js/spectrum.js';
import { DISPERSION_UNAVAILABLE, gaussianPulseDurationAfterGDD } from '../sketch/js/glass.js';
import { pulseEnvelopeAtOpticalPath } from '../sketch/js/pulses.js';

const close = (actual, expected, tolerance, label = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label} ${actual} is not within ${tolerance} of ${expected}`);

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
  Object.assign(xtal.params, { convert: 'opo', opoDepletion: 0.6, transmitPump: true, ...crystal });
  const split = createElement('dichroic', 350, 160);
  split.rot = 135;
  split.params.cutoff = cutoff;
  const long = createElement('detector', 520, 160);
  const short = createElement('detector', 350, 350);
  short.rot = 90;
  traceScene([pump, ...beforeCrystal, xtal, split, long, short, ...extra]);
  return { long: detectorReading(long.id), short: detectorReading(short.id), state: opoReading(xtal.id), xtal };
}

// A Ti:sapphire-pumped femtosecond OPO.
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
  const { long, short } = opoScene({ laser: TISA, crystal: { pumpWl: 800, signalWl: 1200, transmitPump: false, outputPhase: 'unknown' }, cutoff: 1800 });
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
  Object.assign(xtal.params, { convert: 'opo', pumpWl: 800, signalWl: 1200, opoDepletion: 0.6 });
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

// Picosecond OPOs for coherent Raman imaging run near 2 ps and 10 cm⁻¹; the
// two 10 cm⁻¹ outputs here are illustrative.
test('a green-pumped ps OPO with authored 10 cm⁻¹ outputs', () => {
  const { long, short, state } = opoScene({
    laser: { wavelength: 516, pulseWidthFs: 2000, transformLimited: false, bandwidth: wavenumberToNmWidth(516, 10), avgPowerW: 3 },
    crystal: { pumpWl: 516, signalWl: 800, linewidthMode: 'both', signalLinewidthCm: 10, idlerLinewidthCm: 10, outputPhase: 'unknown' }, cutoff: 1000,
  });
  near(state.waves.signal.widthCm, 10, 1e-9, 'signal width');
  near(nmToWavenumberWidth(long.wavelength, fwhm(long)), 10, WIDTH * 10, 'idler width');
  near(long.wavelength, idlerWavelength(516, 800), 1e-3, 'idler centre');
  near(long.signal + short.signal, 1, 2 * PULSED, 'energy');
  assert.equal(long.pulse.pulseWidthFs, 2000);
});

test('a ns OPO takes its signal width from the cavity, and the idler adds the pump width', () => {
  // A few cm⁻¹ is typical of a free-running nanosecond OPO.
  const { long, state } = opoScene({
    laser: { wavelength: 355, pulseWidthFs: 5e6, transformLimited: false, bandwidth: wavenumberToNmWidth(355, 1), avgPowerW: 2, repRateMHz: 0.01 },
    crystal: { pumpWl: 355, signalWl: 500, linewidthMode: 'signal', signalLinewidthCm: 5, outputPhase: 'unknown' }, cutoff: 800,
  });
  near(state.waves.signal.widthCm, 5, 1e-9, 'signal width');
  near(nmToWavenumberWidth(long.wavelength, fwhm(long)), Math.hypot(1, 5), WIDTH * 5, 'idler width');
  assert.equal(long.pulse.pulseWidthFs, 5e6);
});

test('a single-frequency CW pump with a single-frequency cavity stays exact', () => {
  const { long, short, state } = opoScene({
    source: 'cwlaser', laser: { wavelength: 1064, avgPowerW: 15 },
    // 0.6 is the ceiling the crystal allows: no single pass converts everything.
    crystal: { pumpWl: 1064, signalWl: 1550, linewidthMode: 'signal', signalLinewidthCm: 0, opoDepletion: 0.6 },
    cutoff: 2500,
  });
  const idler = idlerWavelength(1064, 1550);
  near(long.wavelength, idler, 1e-9, 'idler');
  assert.equal(fwhm(long), 0);
  assert.equal(long.pulse, null);
  near(long.signal, 0.6 * 1550 / (1550 + idler), 1e-9, 'idler power');
  near(short.signal, 0.4 + 0.6 * idler / (1550 + idler), 1e-9, 'pump + signal');
  assert.equal(state.waves.signal.bw, 0);
});

test('degeneracy with equal widths is one beam; with different widths, two coincident beams', () => {
  const pumpNm = transformLimitedBandwidthNm(140, 800);
  const equal = opoWaves({ pumpWl: 800, pumpFwhmNm: pumpNm, signalWl: 1600, linewidthMode: 'both', signalLinewidthCm: 60, idlerLinewidthCm: 60 });
  assert.ok(equal.degenerate && equal.merged);

  const unequal = opoWaves({ pumpWl: 800, pumpFwhmNm: pumpNm, signalWl: 1600 });
  assert.ok(unequal.degenerate && !unequal.merged, 'pump-wide signal and quadrature idler differ in width');
  near(unequal.idler.wl, 1600, 1e-9, 'coincident idler');

  const { long, short } = opoScene({ laser: TISA, crystal: { pumpWl: 800, signalWl: 1600, opoDepletion: 0.4 }, cutoff: 1200 });
  near(long.signal, 0.4, PULSED, 'degenerate power');
  near(short.signal, 0.6, PULSED, 'residual pump');
  assert.equal(long.pulse.trains.length, 2, 'signal and idler trains');
});

test('a line signal and a band idler at degeneracy keep their own spectra through a filter', () => {
  // Pump 800 nm, signal 1600 nm exactly, signal 0 cm⁻¹, idler 100 cm⁻¹. A
  // 1 nm bandpass at 1600 nm passes the whole line but only a sliver of the
  // band. The same settings a hair off degeneracy must agree.
  const run = signalWl => {
    const pump = createElement('pulsedlaser', 60, 160);
    Object.assign(pump.params, TISA);
    const xtal = createElement('crystal', 220, 160);
    Object.assign(xtal.params, {
      convert: 'opo', pumpWl: 800, signalWl, opoDepletion: 0.6, transmitPump: false,
      linewidthMode: 'both', signalLinewidthCm: 0, idlerLinewidthCm: 100,
    });
    const band = createElement('filter', 320, 160);
    Object.assign(band.params, { ftype: 'bandpass', center: 1600, band: 1, trans: 1 });
    const det = createElement('detector', 420, 160);
    traceScene([pump, xtal, band, det]);
    return detectorReading(det.id)?.signal ?? 0;
  };
  const at = run(1600);
  const near1600 = run(1600.0001);
  near(at, near1600, 1e-3, 'degenerate and near-degenerate transmission');
  // Of the 60 % converted, the zero-width signal passes the 1 nm bandpass and
  // the 100 cm⁻¹ idler band mostly does not, so a little over half survives.
  assert.ok(at > 0.3 && at < 0.36, `the line half passes and the band mostly does not (got ${at})`);
});

test('generated pulses carry only train fields, never the pump spectrum or chirp description', () => {
  const pump = {
    sourceId: 'L', repRateMHz: 80, pulseWidthFs: 140, phaseNs: 3, pulseShape: 'sech2', transformLimited: true,
    centerWavelengthNm: 800, gates: [{ opl: 1, frequencyMHz: 1, duty: 0.5, phaseNs: 0 }],
    spectrumKind: 'flat', transformLimitFs: 20, inputChirp: 'positive',
  };
  const out = opoPulse(pump, waveSpectrum(1200, 50), { crystalId: 'X', role: 'signal' });
  for (const key of ['spectrumKind', 'transformLimitFs', 'inputChirp']) assert.ok(!(key in out), `${key} leaked`);
  assert.equal(out.phaseNs, 3);
  assert.deepEqual(out.gates, pump.gates);
  assert.notEqual(out.gates, pump.gates, 'gates are copied, not shared');
  assert.equal(out.pulseShape, 'gauss', 'the output spectrum is Gaussian');
});

test('a zero-width pulsed output has a duration but cannot be declared transform-limited', () => {
  const pump = { sourceId: 'L', repRateMHz: 80, pulseWidthFs: 140, phaseNs: 0, pulseShape: 'gauss', transformLimited: true };
  const line = waveSpectrum(1200, 0);
  const unknown = opoPulse(pump, line, { crystalId: 'X', role: 'signal' });
  assert.equal(unknown.pulseWidthFs, 140);
  assert.equal(unknown.durationRaisedToLimit, false);
  const limited = opoPulse(pump, line, { crystalId: 'X', role: 'signal', outputPhase: 'transformLimited' });
  assert.equal(limited.transformLimited, false);
  assert.equal(limited.transformLimitUnavailable, true, 'the refused request is reported');
  assert.equal(transformLimitFs(0), Infinity);
});

test('light is never converted twice by the same crystal, even after another crystal', () => {
  // A cavity closed by a pump-transmitting dichroic and a 50 % output mirror.
  // Crystal A turns 800 nm into 5000 + 952 nm; crystal B turns that 952 nm
  // idler into 1500 + 2609 nm. A's acceptance is opened to ±2000 nm, so when
  // B's light returns through A only the provenance guard stops A converting
  // it into 2143 nm or 5455 nm light that no crystal should make. A guard
  // that remembered only the last crystal lets both through.
  const pump = createElement('cwlaser', 40, 160);
  Object.assign(pump.params, { wavelength: 800, avgPowerW: 1, beamMode: 'line' });
  const input = createElement('dichroic', 120, 160);
  Object.assign(input.params, { dtype: 'shortpass', cutoff: 850 });
  const a = createElement('crystal', 200, 160);
  Object.assign(a.params, { convert: 'opo', pumpWl: 800, signalWl: 5000, opoDepletion: 0.5, pumpAcceptanceNm: 2000 });
  const b = createElement('crystal', 300, 160);
  Object.assign(b.params, { convert: 'opo', pumpWl: 952, signalWl: 1500, opoDepletion: 0.5 });
  const output = createElement('mirror', 400, 160);
  Object.assign(output.params, { refl: 50, showTransmitted: true });
  const det = createElement('detector', 500, 160);
  traceScene([pump, input, a, b, output, det]);
  const lines = new Set(detectorReading(det.id).spectrum.map(s => Math.round(s.wavelength)));
  for (const expected of [800, 952, 1500, 2609, 5000]) assert.ok(lines.has(expected), `missing ${expected} nm`);
  for (const forbidden of [2143, 5455]) assert.ok(!lines.has(forbidden), `A reconverted light derived from its own output (${forbidden} nm)`);
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
  // Generated light passes through whether or not the residual pump is kept.
  for (const transmitPump of [true, false]) {
    const { long, short } = opoScene({
      laser: TISA, crystal: { pumpWl: 800, signalWl: 1200, pumpAcceptanceNm: 2000, transmitPump }, cutoff: 1800, extra: [m1, m2],
    });
    for (const reading of [long, short].filter(Boolean)) {
      assert.ok(Number.isFinite(reading.signal) && reading.signal <= 1 + PULSED, 'unbounded power');
      assert.ok(reading.spectrum.every(s => Number.isFinite(s.wavelength) && Number.isFinite(s.power)));
      assert.ok(!reading.spectrum.some(s => s.wavelength > 3000 && s.power > 1e-6), 'a signal was re-split into a cascade idler');
    }
    if (!transmitPump) {
      // With no residual pump, whatever reaches the detectors is generated
      // light that returned through the crystal unconverted.
      const generated = [long, short].filter(Boolean).flatMap(r => r.spectrum)
        .filter(s => s.power > 1e-6 && (Math.abs(s.wavelength - 1200) < 5 || Math.abs(s.wavelength - 2400) < 150));
      assert.ok(generated.length > 0, 'no generated light got through with the residual pump off');
    }
  }
});

test('saved OPO crystals without the new settings keep their fixed-fraction behaviour', () => {
  const legacy = createElement('crystal', 0, 0);
  assert.equal(legacy.params.pumpAcceptanceNm, 1);
  assert.equal(legacy.params.linewidthMode, 'pump');
  const waves = opoWaves({ pumpWl: 532, signalWl: 800 });
  const { long, short, state } = opoScene({
    source: 'cwlaser', laser: { wavelength: 532 }, crystal: { pumpWl: 532, signalWl: 800 }, cutoff: 1200,
  });
  assert.equal(state.state, 'converting');
  near(long.signal, 0.6 * (1 - waves.signalShare), 1e-9, 'idler');
  near(short.signal, 0.4 + 0.6 * waves.signalShare, 1e-9, 'pump + signal');
});

test('a transform-limited OPO output broadens through glass; one with unknown phase is unavailable, not invented', () => {
  // The pump's own phase is unknown (a legacy-style laser with no chirp
  // sign). A signal declared transform-limited must still broaden through
  // glass on the canvas; one with unknown phase must neither broaden nor be
  // given a chirp it was never declared to have.
  const run = outputPhase => {
    const pump = createElement('pulsedlaser', 60, 160);
    Object.assign(pump.params, { wavelength: 800, pulseWidthFs: 140, transformLimited: false, bandwidth: 10, beamMode: 'line' });
    const xtal = createElement('crystal', 200, 160);
    Object.assign(xtal.params, { convert: 'opo', pumpWl: 800, signalWl: 1200, transmitPump: false, outputPhase });
    const glass = createElement('glassrod', 320, 160);
    glass.params.material = 'nbk7';
    const det = createElement('detector', 500, 160);
    det.params.aperture = 40;
    const { pulseTracks } = traceScene([pump, xtal, glass, det]);
    const tracks = pulseTracks.filter(track => track.pulse.centerWavelengthNm > 1000);
    tracks.reading = detectorReading(det.id);
    return tracks;
  };
  // The glass fans each output into spectral samples, so look per colour.
  const limited = run('transformLimited');
  for (const centre of [1200, 2400]) {
    const tracks = limited.filter(track => Math.abs(track.pulse.centerWavelengthNm - centre) < 5);
    assert.ok(tracks.some(track => track.gddTrace?.some(event => event.linear)),
      `glass left no dispersion history on the transform-limited ${centre} nm output`);
  }
  const unknown = run('unknown');
  assert.ok(unknown.length > 0);
  for (const track of unknown) {
    const end = pulseEnvelopeAtOpticalPath(track, track.opls.at(-1) - 1e-6);
    assert.equal(end.stretchFactor, 1, 'unknown phase must not claim broadening on the canvas');
  }
  const trains = unknown.reading.pulse.trains.filter(t => t.centerWavelengthNm > 1000);
  assert.ok(trains.length > 0);
  for (const train of trains) {
    assert.equal(train.stretchedPulseWidthFs, null, 'unknown phase has no predictable dispersed duration');
    assert.equal(train.dispersionModel, DISPERSION_UNAVAILABLE.unknownPhase);
  }
});

test('an explicitly chirped output is its transform limit plus the GDD that stretches it', () => {
  const pump = { sourceId: 'L', repRateMHz: 80, pulseWidthFs: 140, phaseNs: 0, pulseShape: 'gauss', transformLimited: true };
  const wave = waveSpectrum(1200, TISA_CM);
  const limit = transformLimitFs(TISA_CM);
  const chirped = opoPulse(pump, wave, { crystalId: 'X', role: 'signal', outputPhase: 'positiveChirp', durationFactor: 1.4 });
  assert.equal(chirped.spectralPhase, 'positiveChirp');
  assert.equal(chirped.transformLimited, true);
  near(chirped.pulseWidthFs, limit, 1e-9, 'described from its limit');
  assert.ok(chirped.chirpGddFs2 > 0, 'a positive chirp');
  near(gaussianPulseDurationAfterGDD(limit, chirped.chirpGddFs2), 196, 1e-6, 'the GDD recovers the set duration');
  near(gaussianPulseDurationAfterGDD(limit, chirped.chirpGddFs2 - chirped.chirpGddFs2), limit, 1e-9, 'compensating GDD restores the limit');

  // The same set duration with unknown phase carries no chirp at all.
  const unknown = opoPulse(pump, wave, { crystalId: 'X', role: 'signal', outputPhase: 'unknown', durationFactor: 1.4 });
  assert.equal(unknown.spectralPhase, 'unknown');
  assert.equal(unknown.transformLimited, false);
  assert.equal(unknown.chirpGddFs2, 0);
  near(unknown.pulseWidthFs, 196, 1e-9, 'set duration kept');

  const atLimit = opoPulse(pump, wave, { crystalId: 'X', role: 'signal', outputPhase: 'positiveChirp', durationFactor: limit / 140 });
  assert.equal(atLimit.spectralPhase, 'transformLimited', 'a duration equal to the limit carries no chirp and is not unknown');
  assert.equal(atLimit.chirpGddFs2, 0);

  const short = opoPulse(pump, wave, { crystalId: 'X', role: 'signal', outputPhase: 'positiveChirp', durationFactor: 0.1 });
  assert.equal(short.spectralPhase, 'transformLimited', 'shorter than the limit cannot be chirped down to it');
  near(short.pulseWidthFs, limit, 1e-9);
});

test('a compressor cannot claim to shorten an unknown-phase output; an explicit chirp compresses to its limit', () => {
  // "Unknown" does not mean uncompressible: it means the phase that would
  // decide it is not known, so a compressor leaves the duration unavailable
  // rather than inventing either answer.
  const run = (outputPhase, compressorGddFs2 = 0) => {
    const laser = createElement('pulsedlaser', 60, 160);
    Object.assign(laser.params, { wavelength: 516, pulseWidthFs: 2000, bandwidth: wavenumberToNmWidth(516, 10), beamMode: 'line' });
    const xtal = createElement('crystal', 200, 160);
    Object.assign(xtal.params, {
      convert: 'opo', pumpWl: 516, signalWl: 800, linewidthMode: 'both', signalLinewidthCm: 10, idlerLinewidthCm: 10,
      outputPhase, transmitPump: false,
    });
    const extra = [];
    if (compressorGddFs2) {
      const compressor = createElement('pulsecompressor', 350, 160);
      compressor.params.gddFs2 = compressorGddFs2;
      extra.push(compressor);
    }
    const det = createElement('detector', 500, 160);
    const { pulseTracks } = traceScene([laser, xtal, ...extra, det]);
    const reading = detectorReading(det.id);
    return {
      reading,
      train: reading?.pulse?.trains.find(t => Math.abs(t.centerWavelengthNm - 800) < 5),
      tracks: pulseTracks.filter(t => Math.abs(t.pulse.centerWavelengthNm - 800) < 5),
    };
  };
  // With no dispersion on the path, the configured duration is the answer
  // whatever the phase.
  const unknown = run('unknown');
  assert.ok(unknown.tracks.length > 0);
  assert.ok(Number.isFinite(unknown.train.stretchedPulseWidthFs));
  close(unknown.train.stretchedPulseWidthFs, unknown.train.pulseWidthFs, 1e-6);
  const chirped = run('positiveChirp');
  assert.ok(chirped.train, 'no signal train');
  assert.ok(chirped.reading.pulse.trains.every(t => t.gddFs2 > 0), 'the chirp should reach the detector');
  // The chirp is carried as GDD on the ray, so it is counted once: the
  // detector reads the set duration, not a doubly stretched one.
  const limit = chirped.train.transformLimitFs;
  assert.ok(chirped.train.stretchedPulseWidthFs > limit * 1.05);
  assert.match(chirped.train.dispersionModel, /positive chirp carried as GDD/);
  // Taking that GDD back out returns the explicit chirp to its limit ...
  const compressed = run('positiveChirp', -chirped.train.gddFs2);
  close(compressed.train.stretchedPulseWidthFs, limit, limit * 1e-6);
  // ... while the same compressor on an unknown phase predicts nothing.
  const unknownCompressed = run('unknown', -chirped.train.gddFs2);
  assert.equal(unknownCompressed.train.stretchedPulseWidthFs, null);
  assert.equal(unknownCompressed.train.dispersionModel, DISPERSION_UNAVAILABLE.unknownPhase);
});
