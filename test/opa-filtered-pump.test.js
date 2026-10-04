// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// An OPA times the pulses at its ports from their pulse record. The record of
// a filtered pulse holds the spectrum the FIRST filter to reshape it left; a
// second filter narrowing it further went unnoticed, so behind a 30 nm and
// then an 8 nm bandpass the OPA timed its pump at 26 fs where a detector at
// the port reads 98 fs, and delivered about a quarter of the signal. The
// beam's record is now brought up to date with the spectrum that arrives.
// Two references that do not depend on the fix: a detector placed where the
// port is, and the one filter two box filters are together equivalent to.

import assert from 'node:assert/strict';
import test from 'node:test';
import '../sketch/js/detector-instruments.js';
import { createElement } from '../sketch/js/elements.js';
import { traceScene, detectorReading, opaReading } from '../sketch/js/raytrace.js';

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
