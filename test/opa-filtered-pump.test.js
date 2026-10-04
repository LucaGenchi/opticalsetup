// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// An OPA times the pulses at its ports from their pulse record. The record of
// a filtered pulse holds the spectrum the FIRST filter to reshape it left; a
// second filter narrowing it further went unnoticed, so behind a 30 nm and
// then an 8 nm bandpass the OPA timed its pump at 26 fs where a detector at
// the port reads 98 fs, and delivered about a quarter of the signal. The
// OPA now reads the record as the whole train arrives: with what the later
// filters left of the recorded spectrum (the spectrum the packets are drawn
// from). Where no later filter acted, the record is the one it always was.
// Two references that do not depend on the fix: a detector placed where the
// port is, and the one filter two box filters are together equivalent to.

import assert from 'node:assert/strict';
import test from 'node:test';
import '../sketch/js/detector-instruments.js';
import { createElement } from '../sketch/js/elements.js';
import { traceScene, detectorReading, opaReading } from '../sketch/js/raytrace.js';
import { spectrumWeight } from '../sketch/js/spectrum.js';
import { quadraticPhasePulse } from '../sketch/js/pulse-field.js';

const place = (type, x, y, params) => {
  const el = createElement(type, x, y);
  Object.assign(el.params, params);
  return el;
};
const bandpass = (x, band, center = 515) => ['filter', x, { ftype: 'bandpass', center, band }];
const doubler = x => ['crystal', x, { convert: 'shg', efficiency: 0.5, transmitPump: false }];

// A pump (upper arm) and a seed (lower arm) into an OPA, and the same two
// arms onto detectors standing where the OPA's ports are.
function scene({ pumpParams = {}, seedParams = {}, pumpArm = [], seedArm = [] } = {}) {
  const sources = [
    place('pulsedlaser', 0, -18, { beamMode: 'line', wavelength: 515, transformLimited: false, bandwidth: 60, avgPowerW: 1, repRateMHz: 0.2, ...pumpParams }),
    place('pulsedlaser', 0, 18, { beamMode: 'line', wavelength: 780, transformLimited: true, pulseWidthFs: 300, avgPowerW: 1e-6, repRateMHz: 0.2, ...seedParams }),
  ];
  const arms = () => [
    ...pumpArm.map(([type, x, params]) => place(type, x, -18, params)),
    ...seedArm.map(([type, x, params]) => place(type, x, 18, params)),
  ];
  const opa = place('opa', 400, 0, { signalWl: 780, gainBandwidthNm: 40, smallSignalGainDb: 40, maxDepletion: 0.5 });
  const out = place('detector', 550, 18, { aperture: 10 });
  traceScene([...sources, ...arms(), opa, out]);
  const plan = opaReading(opa.id);
  const signal = detectorReading(out.id);
  const atPump = place('detector', 380, -18, { aperture: 10 }), atSeed = place('detector', 380, 18, { aperture: 10 });
  traceScene([...sources, ...arms(), atPump, atSeed]);
  return {
    state: plan.state,
    pumpFs: plan.pumpPulse?.pulseWidthFs, seedFs: plan.seeds[0]?.arrivingPulse?.pulseWidthFs,
    signal: signal.signal, signalFs: signal.pulse?.stretchedPulseWidthFs,
    detectorPumpFs: detectorReading(atPump.id).pulse?.stretchedPulseWidthFs,
    detectorSeedFs: detectorReading(atSeed.id).pulse?.stretchedPulseWidthFs,
  };
}
const close = (a, b, rel, label) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${label}: ${a} vs ${b}`);

test('a pump filtered twice is timed as a detector at the port reads it', () => {
  const two = scene({ pumpArm: [bandpass(100, 30), bandpass(150, 8)] });
  assert.equal(two.state, 'amplifying');
  close(two.detectorPumpFs, 97.7437, 1e-5, 'detector at the pump port');
  // 26.34 fs before: the 30 nm filter's record.
  close(two.pumpFs, two.detectorPumpFs, 1e-9, 'pump duration');
});

test('two box filters amplify as the one filter they are together', () => {
  // 30 nm then 8 nm about one centre is an 8 nm bandpass, in either order.
  const one = scene({ pumpArm: [bandpass(100, 8)] });
  for (const arm of [[bandpass(100, 30), bandpass(150, 8)], [bandpass(100, 8), bandpass(150, 30)]]) {
    const two = scene({ pumpArm: arm });
    close(two.pumpFs, one.pumpFs, 1e-6, 'pump duration');
    close(two.signal, one.signal, 1e-6, 'signal');
    close(two.signalFs, one.signalFs, 1e-6, 'signal duration');
  }
  close(one.signal, 0.0014497186, 1e-7, 'signal behind one 8 nm filter');
  // Three in a row are the narrowest; an off-centre pair is its overlap; a
  // longpass and a shortpass are the bandpass between their edges.
  const cases = [
    [[bandpass(100, 30), bandpass(150, 8), bandpass(200, 4)], [bandpass(100, 4)]],
    [[bandpass(100, 30), bandpass(150, 8, 520)], [bandpass(100, 8, 520)]],
    [[['filter', 100, { ftype: 'longpass', cutoff: 505 }], ['filter', 150, { ftype: 'shortpass', cutoff: 520 }]], [bandpass(100, 15, 512.5)]],
  ];
  for (const [several, equivalent] of cases) {
    const a = scene({ pumpArm: several }), b = scene({ pumpArm: equivalent });
    close(a.pumpFs, a.detectorPumpFs, 1e-9, 'pump duration against the detector');
    close(a.pumpFs, b.pumpFs, 1e-5, 'pump duration');
    close(a.signal, b.signal, 1e-5, 'signal');
  }
});

test('a beam sampled by several rays is timed the same', () => {
  const line = scene({ pumpArm: [bandpass(100, 30), bandpass(150, 8)] });
  const beam = scene({ pumpParams: { beamMode: 'beam' }, pumpArm: [bandpass(100, 30), bandpass(150, 8)] });
  close(beam.pumpFs, line.pumpFs, 1e-9, 'pump duration');
  close(beam.signal, line.signal, 1e-9, 'signal');
});

test('a seed filtered twice is reported as it arrives', () => {
  const seedParams = { transformLimited: true, pulseWidthFs: 20 };
  const two = scene({ seedParams, seedArm: [bandpass(100, 30, 780), bandpass(150, 8, 780)] });
  const one = scene({ seedParams, seedArm: [bandpass(100, 8, 780)] });
  // 61.06 fs before.
  close(two.seedFs, two.detectorSeedFs, 1e-9, 'seed duration against the detector');
  close(two.seedFs, one.seedFs, 1e-6, 'seed duration');
});

test('nothing changes where the record was already the arriving spectrum', () => {
  // No filter, and one filter: the values main gives.
  const none = scene();
  close(none.pumpFs, 6.5025110, 1e-7, 'unfiltered pump');
  close(none.signal, 0.000098522254, 1e-7, 'unfiltered signal');
  const one = scene({ pumpArm: [bandpass(100, 30)] });
  close(one.pumpFs, 26.343462, 1e-7, 'pump behind one filter');
  close(one.signal, 0.00039576542, 1e-7, 'signal behind one filter');
});

test('a harmonic that still carries its fundamental\'s record is left to it', () => {
  // The doubled pump keeps the 1030 nm pulse's record, which does not
  // describe 515 nm light. Its timing is what it was, filtered before the
  // crystal, after it, or both: the update is for light its record is known
  // to describe.
  const pumpParams = { wavelength: 1030, bandwidth: 60 };
  const filteredFirst = scene({ pumpParams, pumpArm: [bandpass(60, 30, 1030), doubler(120), bandpass(200, 4)] });
  close(filteredFirst.pumpFs, 105.43713, 1e-7, 'pump filtered before and after the crystal');
  close(filteredFirst.signal, 0.0015607707, 1e-7, 'its signal');
  const filteredAfter = scene({ pumpParams, pumpArm: [doubler(120), bandpass(200, 4)] });
  close(filteredAfter.pumpFs, 26.010044, 1e-7, 'pump filtered after the crystal');
  close(filteredAfter.signal, 0.00039077760, 1e-7, 'its signal');
});

// --- A cascade: the first stage's signal seeds the second --------------------
// A phase-kept signal's record holds the amplified profile with its tails,
// wider than the spectrum its rays carry. Nothing between the stages selects
// any of it, so the second stage must be handed that profile untouched.

function cascade(between = []) {
  const laser = (x, y, wavelength, avgPowerW, extra) => place('pulsedlaser', x, y,
    { wavelength, avgPowerW, repRateMHz: 0.001, pulseWidthFs: 300, beamMode: 'line', ...extra });
  const stage = { signalWl: 800, gainBandwidthNm: 80, smallSignalGainDb: 40, maxDepletion: 0.5, outputPump: false, outputIdler: false };
  const pump1 = laser(0, -18, 532, 1, { transformLimited: true, pulseWidthFs: 20000 });
  const seed = laser(0, 18, 800, 1e-9, { transformLimited: false, bandwidth: 30, inputChirp: 'positive', chirpGddFs2: 20000 });
  const stage1 = place('opa', 300, 0, stage), stage2 = place('opa', 620, 0, stage);
  const pump2 = laser(320, -18, 532, 1, { transformLimited: true, pulseWidthFs: 20000 });
  const elements = [pump1, seed, stage1, pump2, ...between.map(([type, params]) => place(type, 420, 18, params)), stage2];
  traceScene(elements, []);
  pump2.params.pulsePhaseNs = opaReading(stage2.id).seeds[0]?.skewNs || 0;
  traceScene(elements, []);
  const two = opaReading(stage2.id);
  return { profile: opaReading(stage1.id).seeds[0].amplifiedProfile, state: two.state, seed: two.seeds.find(s => s.seedW > 1e-8) || two.seeds[0] };
}
// The duration of a profile restricted to [lo, hi] under a quadratic phase:
// a route that does not go through the tracer's records.
const transformed = (profile, lo, hi, gddFs2) => quadraticPhasePulse(nm => Math.max(0, spectrumWeight(profile, nm)), lo, hi, gddFs2);

test('a second stage is handed the first stage\'s amplified profile untouched', () => {
  const plain = cascade();
  assert.equal(plain.state, 'amplifying');
  const [piece] = plain.seed.record.pulse.filteredPieces;
  close(piece.lo, 734, 1e-9, 'the profile\'s lower end'); close(piece.hi, 866, 1e-9, 'its upper end');
  const reference = transformed(plain.profile, 734, 866, 20000);
  close(plain.seed.chirp.tau0Fs, 33.776, 1e-4, 'transform limit of the seed at stage 2');
  close(plain.seed.chirp.tau0Fs, reference.transformLimitFs, 1e-3, 'against the profile\'s own transform');
  close(plain.seed.arrivingPulse.pulseWidthFs, reference.durationFs, 1e-3, 'stretched duration');
  close(plain.seed.gainW, 0.0373429, 1e-5, 'power added at stage 2');
  // Recompressed between the stages: the profile's transform limit.
  const compressed = cascade([['pulsecompressor', { gddFs2: -20000, transEff: 100 }]]);
  close(compressed.seed.arrivingPulse.pulseWidthFs, reference.transformLimitFs, 1e-3, 'recompressed seed');
  close(compressed.seed.gainW, 0.00155269, 1e-5, 'power added at stage 2, recompressed');
  // A filter wider than the whole profile selects nothing.
  const wide = cascade([['filter', { ftype: 'bandpass', center: 800, band: 200 }]]);
  close(wide.seed.arrivingPulse.pulseWidthFs, plain.seed.arrivingPulse.pulseWidthFs, 1e-9, 'behind a filter that cuts nothing');
});

test('a filter between the stages cuts the amplified profile, and the seed is timed from what is left', () => {
  const cut = cascade([['filter', { ftype: 'bandpass', center: 800, band: 20 }]]);
  const reference = transformed(cut.profile, 790, 810, 20000);
  // 1624 fs before: the uncut profile's duration.
  close(cut.seed.arrivingPulse.pulseWidthFs, reference.durationFs, 5e-3, 'seed duration behind the filter');
});

// --- Part of a fanned-out train ---------------------------------------------
// Behind a grating the pulse travels as wavelength samples, and the whole
// train's spectrum goes with each of them. A port that catches one sample has
// not received the train: it is timed from what arrives, as before.

test('a port that catches one sample of a fanned-out pump is not timed from the whole train', () => {
  // The pump meets a 600 /mm transmission grating at the angle that sends
  // 800 nm on along the pump port's axis, then a 50 nm bandpass. With the
  // 6 mm port 300 mm away only the central sample enters.
  const incidence = -Math.asin(0.48);
  const pump = place('pulsedlaser', -100 * Math.cos(incidence), -18 - 100 * Math.sin(incidence),
    { beamMode: 'line', wavelength: 800, transformLimited: true, pulseWidthFs: 20, avgPowerW: 1, repRateMHz: 0.2 });
  pump.rot = incidence * 180 / Math.PI;
  const seed = place('pulsedlaser', 120, 18, { beamMode: 'line', wavelength: 1100, transformLimited: true, pulseWidthFs: 300, avgPowerW: 1e-6, repRateMHz: 0.2 });
  const grating = place('grating', 0, -18, { lines: 600, orders: '1', transmissive: true, length: 50 });
  const filter = place('filter', 150, -18, { ftype: 'bandpass', center: 800, band: 50 });
  const reading = aperture => {
    const opa = place('opa', 300, 0, { signalWl: 1100, gainBandwidthNm: 40, smallSignalGainDb: 40, maxDepletion: 0.5, aperture });
    traceScene([pump, seed, grating, filter, opa], []);
    const plan = opaReading(opa.id);
    const detector = place('detector', 280, -18, { aperture });
    traceScene([pump, grating, filter, detector], []);
    return { plan, detectorFs: detectorReading(detector.id).pulse?.stretchedPulseWidthFs };
  };
  for (const aperture of [2, 6]) {
    const { plan, detectorFs } = reading(aperture);
    close(detectorFs, 64.122, 1e-4, `detector, ${aperture} mm`);
    // 39.86 fs when timed from the whole train's 775-825 nm.
    close(plan.pumpPulse.pulseWidthFs, detectorFs, 1e-9, `pump duration, ${aperture} mm port`);
  }
  // Wide enough for three samples: several pumps, declined as before.
  assert.equal(reading(20).plan.state, 'multiplePumps');
});
