// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Two-beam processes between pulse trains at f and f/n -- an oscillator and
// its pulse-picked copy: which pulses meet, how strong the signal is, and how
// the slower train modulates the faster one for stimulated Raman.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, newSampleChannel, registry, channelWarning, specimenTimingReadout } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceAll, detectorReading, specimenIncidentBeams, specimenTimingReading } from '../sketch/js/raytrace.js';
import { mixOverlap, coincidenceGate, mixDurationFs } from '../sketch/js/parametric.js';
import { gateTransmissionAt, pulseGateTransmission, C_MM_PER_NS } from '../sketch/js/pulses.js';
import { allocateParametricAmplifier } from '../sketch/js/parametric-amplifier.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);
const ch = (kind, over = {}) => ({ ...newSampleChannel(kind), ...over });
const beam = (rate, phaseNs = 0, widthFs = 200, opl = 0) => ({ opl, pulse: { repRateMHz: rate, pulseWidthFs: widthFs, phaseNs } });

test('trains at f and f/n meet on every n-th pulse of the faster one', () => {
  // 80 and 40 MHz, the 40 MHz pulse zero 200 fs after an 80 MHz pulse that is
  // itself 3 periods (37.5 ns) after the fast train's pulse zero.
  const fastPeriod = 12.5;
  const slow = beam(40, 3 * fastPeriod + 200e-6), fast = beam(80);
  const t = mixOverlap(fast, slow);
  assert.equal(t.unsupported, false);
  assert.equal(t.ratio, 2);
  assert.equal(t.slower, 'b');
  assert.equal(t.repRateMHz, 40, 'the coincidences come at the slower rate');
  close(t.periodNs, 25, 1e-12);
  close(t.offsetNs, -200e-6, 1e-12, 'the fast pulse arrives 200 fs before the slow one');
  close(t.factor, Math.exp(-4 * Math.LN2 * 200 ** 2 / (2 * 200 ** 2)), 1e-9, 'the same Gaussian gate');
  close(t.fastCoincidenceNs, 3 * fastPeriod, 1e-12);
  assert.equal(t.selfPulseOffset, 3, 'the fast pulse that takes part');
  assert.equal(t.partnerPulseOffset, 0);
  // Seen from the other side, the same coincidence.
  const back = mixOverlap(slow, fast);
  assert.equal(back.slower, 'a');
  close(back.offsetNs, 200e-6, 1e-12);
  close(back.centerNs, t.centerNs, 1e-12);
  // Any whole multiple, up to an amplifier at 1 kHz beside its 80 MHz seed.
  assert.equal(mixOverlap(beam(80), beam(80 / 3)).ratio, 3);
  assert.equal(mixOverlap(beam(80), beam(0.001)).ratio, 80000);
  // Other ratios keep no pattern here and are not modelled.
  for (const rate of [37, 60, 53.3]) {
    const other = mixOverlap(beam(80), beam(rate));
    assert.equal(other.unsupported, true, `${rate} MHz`);
    assert.equal(other.factor, 0);
  }
  // Equal rates are untouched: no ratio.
  assert.equal(mixOverlap(beam(80), beam(80, 200e-6)).ratio, undefined);
});

test('the coincidence gate passes exactly the fast pulses a slow one meets', () => {
  // 80 MHz pulses emitted at k * 12.5 ns reach the spot after 300 mm (1 ns).
  // A 80/4 = 20 MHz train arrives 2 fast periods + 100 fs after fast pulse zero.
  const oplMm = 300;
  const fast = beam(80, 0, 200, oplMm), slow = beam(20, 2 * 12.5 + 100e-6, 200, oplMm);
  const t = mixOverlap(fast, slow);
  assert.equal(t.ratio, 4);
  const gate = coincidenceGate(t, oplMm, { high: 0.8, low: 1 });
  const passed = [];
  for (let k = 0; k < 16; k++) passed.push(gateTransmissionAt(gate, k * 12.5));
  assert.deepEqual(passed.map(v => (v === 0.8 ? 1 : 0)), [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0]);
  assert.equal(coincidenceGate(mixOverlap(beam(80), beam(80)), 0), null, 'equal rates pick nothing');
});

test('a detector averages a picked train exactly, however long its cycle', () => {
  // 80 MHz beside 1 kHz: one pulse in 80 000 is met. With that pulse at 0.5
  // and the rest at 1, the train passes 1 - 0.5/80000 on average, whichever
  // pulse it is -- spread samples could miss it, or catch it too often.
  const expected = 1 - 0.5 / 80000;
  for (const metPulse of [0, 1, 12345, 79999]) {
    const t = mixOverlap(beam(80), beam(0.001, metPulse * 12.5));
    assert.equal(t.ratio, 80000);
    const gate = coincidenceGate(t, 0, { high: 0.5, low: 1 });
    const average = pulseGateTransmission({ repRateMHz: 80, pulseWidthFs: 200, phaseNs: 0, gates: [gate] });
    close(average, expected, 1e-12, `met pulse ${metPulse}`);
  }
  // Shorter cycles: 4096 consecutive pulses, whole cycles for f/2 and f/1000
  // and within 1/4096 of the depth otherwise.
  for (const [n, tol] of [[2, 1e-12], [1000, 1e-12], [3, 0.5 / 4096], [7, 0.5 / 4096]]) {
    const t = mixOverlap(beam(80), beam(80 / n, 12.5));
    const gate = coincidenceGate(t, 0, { high: 0.5, low: 1 });
    close(pulseGateTransmission({ repRateMHz: 80, pulseWidthFs: 200, phaseNs: 0, gates: [gate] }), 1 - 0.5 / n, tol, `f/${n}`);
  }
  // Above a million the pattern is not modelled.
  assert.equal(mixOverlap(beam(80), beam(80 / 2e6)).unsupported, true);
});

test('the CARS train lasts as long as I_p^2 I_S does', () => {
  // Two 200 fs Gaussian pulses: the plain product lasts 200/sqrt(2); with the
  // pump counted twice, 200/sqrt(3).
  close(mixDurationFs(200, 200), 200 / Math.SQRT2, 1e-9);
  close(mixDurationFs(200, 200, 2, 1), 200 / Math.sqrt(3), 1e-9);
  close(mixDurationFs(100, 400, 2, 1), 1 / Math.sqrt(2 / 100 ** 2 + 1 / 400 ** 2), 1e-9);
  // Nonsense orders count one photon, never a non-finite duration.
  for (const order of [0, -1, NaN, Infinity]) close(mixDurationFs(200, 200, order, 1), 200 / Math.SQRT2, 1e-9);
});

// Two lasers on one nonlinear specimen at the given rates, all on one path
// length to it, read by a detector straight behind it.
function bench({ rates = [80, 40], channel = ch('cars', { eff: 0.5 }), read = null } = {}) {
  const lasers = [[800, rates[0], -6], [1040, rates[1], 6]].map(([wl, rate, y]) => {
    const laser = createElement('pulsedlaser', 0, y);
    Object.assign(laser.params, { wavelength: wl, temporalMode: 'pulsed', repRateMHz: rate, pulseWidthFs: 200, beamMode: 'line' });
    return laser;
  });
  const sample = createElement('sample', 200, 0);
  sample.rot = 90;
  Object.assign(sample.params, { aperture: 40, specimenType: 'nonlinear', channels: [channel] });
  const elements = [...lasers, sample];
  let filter = null;
  if (read) {
    filter = createElement('filter', 300, read === 1040 ? 6 : -6);
    Object.assign(filter.params, { ftype: read === 1040 ? 'longpass' : 'shortpass', cutoff: 900, length: 8 });
    elements.push(filter);
  }
  const detector = createElement('detector', 380, read ? (read === 1040 ? 6 : -6) : 0);
  detector.params.aperture = read ? 8 : 60;
  elements.push(detector);
  traceAll(elements);
  return { sample, detector, reading: detectorReading(detector.id), timing: specimenTimingReading(sample.id), elements };
}
const carsWl = 1 / (2 / 800 - 1 / 1040);
const lineOf = (reading, wl) => (reading?.spectrum || []).filter(s => Math.abs(s.wavelength - wl) < 2);
const carsPower = reading => lineOf(reading, carsWl).reduce((sum, s) => sum + s.power, 0);

test('CARS between f and f/n: a picked Stokes keeps the level, a picked pump gains n', () => {
  // Same average powers, the signal against the same beams at the faster
  // rate: only one fast pulse in n is met, but each slow pulse carries n times
  // the energy, and CARS goes as I_p^2 I_S. A Stokes at f/2: (1/2)*2 = 1. A
  // pump at f/2: (1/2)*2^2 = 2.
  const equal = carsPower(bench({ rates: [80, 80] }).reading);
  assert.ok(equal > 0);
  const pickedStokes = bench({ rates: [80, 40] });
  // Read now: the next bench replaces the traced scene.
  const warning = channelWarning(ch('cars'), specimenIncidentBeams(pickedStokes.sample.id));
  assert.equal(pickedStokes.timing.state, 'mixing');
  assert.equal(pickedStokes.timing.ratio, 2);
  close(carsPower(pickedStokes.reading) / equal, 1, 1e-9, 'Stokes at f/2');
  const pickedPump = bench({ rates: [40, 80] });
  close(carsPower(pickedPump.reading) / equal, 2, 1e-9, 'pump at f/2');
  // A bounded proxy still: never more than the driving beam brings, however
  // large n is. Efficiency 0.5 times a gain of 1000 stops at 1.
  const amplifier = carsPower(bench({ rates: [0.08, 80] }).reading);
  close(amplifier / equal, 2, 1e-9, 'capped at efficiency 1');
  // The signal is the coincidences' train, as long as I_p^2 I_S lasts.
  const trains = pickedStokes.reading?.pulse?.trains || [];
  const cars = trains.filter(t => t.repRateMHz === 40);
  assert.ok(cars.length, JSON.stringify(trains.map(t => t.repRateMHz)));
  close(cars[0].pulseWidthFs, 200 / Math.sqrt(3), 1e-6, 'CARS duration');
  assert.match(specimenTimingReadout(pickedStokes.timing),
    /arriving together, 100% temporal overlap; the 40 MHz pulses meet every second pulse of the 80 MHz train$/);
  assert.equal(warning, null, 'nothing to warn about');
});

test('SRS between f and f/2: the slower train modulates the faster beam, with no EOM', () => {
  // Stokes at 40 MHz, pump at 80 MHz: every second pump pulse meets a Stokes
  // pulse and loses some of itself to it (stimulated Raman loss), so the pump
  // carries a 40 MHz, full-depth square modulation a lock-in reads.
  const transferEff = 0.1;
  const pump = bench({ rates: [80, 40], channel: ch('srs', { transferEff }), read: 800 }).reading;
  const gates = (pump?.pulse?.trains || []).flatMap(t => t.gates || []);
  assert.equal(gates.length, 1, 'one transferred modulation on the pump');
  assert.equal(gates[0].frequencyMHz, 40);
  close(gates[0].duty, 0.5, 1e-12);
  assert.equal(gates[0].low, 1, 'the pulses no Stokes meets are untouched');
  // Each Stokes pulse carries twice the energy at the same average power, so
  // the met pump pulses change twice as much: 1 - 2 * 0.1.
  close(gates[0].high, 1 - 2 * transferEff, 1e-12, 'loss on the met pump pulses');
  // Pump at 40 MHz, Stokes at 80: the Stokes is the faster beam and gains.
  const stokes = bench({ rates: [40, 80], channel: ch('srs', { transferEff }), read: 1040 }).reading;
  const gain = (stokes?.pulse?.trains || []).flatMap(t => t.gates || []);
  close(gain[0].high, 1 + 2 * transferEff, 1e-12, 'gain on the met Stokes pulses');
});

test('the slower beam changes steadily, with nothing to lock in on', () => {
  // Every 40 MHz Stokes pulse meets a pump pulse, so it gains on every pulse:
  // brighter, unmodulated. Its change is the equal-rate one, set by the pump's
  // ordinary pulses.
  const transferEff = 0.1;
  const plain = bench({ rates: [80, 40], channel: ch('srs', { transferEff: 0.01, requireOverlap: true }), read: 1040 });
  const without = bench({ rates: [80, 40], channel: ch('phase'), read: 1040 }).reading;
  const slow = bench({ rates: [80, 40], channel: ch('srs', { transferEff }), read: 1040 }).reading;
  assert.deepEqual((slow?.pulse?.trains || []).flatMap(t => t.gates || []), [], 'no modulation on the slower beam');
  close(slow.signal / without.signal, 1 + transferEff, 1e-9, 'a steady gain');
  assert.ok(plain.reading.signal > without.signal);
});

test('a 1 kHz train modulates an 80 MHz beam by the one pulse in 80 000 it meets', () => {
  const without = bench({ rates: [80, 0.001], channel: ch('phase'), read: 800 }).reading;
  const srs = bench({ rates: [80, 0.001], channel: ch('srs', { transferEff: 0.1 }), read: 800 }).reading;
  const gates = (srs?.pulse?.trains || []).flatMap(t => t.gates || []);
  assert.equal(gates.length, 1);
  assert.equal(gates[0].frequencyMHz, 0.001);
  // The met pulses lose half (capped), the others nothing: the average drops
  // by 0.5/80000.
  close(gates[0].high, 0.5, 1e-12);
  close(srs.signal / without.signal, 1 - 0.5 / 80000, 1e-9);
});

test('SRS between rates says what it does not model', () => {
  // An EOM on top of the slower train is a composite modulation.
  const transferEff = 0.1;
  const { elements, sample } = bench({ rates: [80, 40], channel: ch('srs', { transferEff }), read: 800 });
  const eom = createElement('chopper', 80, 6);
  Object.assign(eom.params, { modulate: true, frequencyHz: 1e7, diameter: 10 });
  traceAll([...elements, eom]);
  assert.match(registry.stage.params.find(p => p.key === 'pulseTiming').readout(sample.params, sample),
    /Stimulated Raman transfer not drawn: the beams run at different repetition rates and one is modulated as well/);
  // Rates with no whole ratio are not timed at all.
  const odd = bench({ rates: [80, 37], channel: ch('srs', { transferEff }), read: 800 });
  assert.equal(odd.timing.state, 'unsupported');
  assert.deepEqual((odd.reading?.pulse?.trains || []).flatMap(t => t.gates || []), []);
});

test('the parametric amplifier still needs one repetition rate', () => {
  const pulse = rate => ({ phaseNs: 0, repRateMHz: rate, pulseWidthFs: 100 });
  const result = allocateParametricAmplifier({
    pump: { wl: 532, powerW: 1, pulse: pulse(80) },
    seeds: [{ key: 's', powerW: 0.001, wl: 800, gammaPerM: 1000, pulse: pulse(40) }],
    lengthM: 0.001,
  });
  assert.equal(result.channels[0].state, 'repetitionUnsupported');
  assert.equal(result.depletedPumpW, 0);
});

test('a scene with a delayed picked train is timed at its coincidence', () => {
  // Moving the 40 MHz laser back by 0.06 mm (200 fs) leaves the pair 200 fs
  // apart, not a whole fast period, and the timing readout says so.
  const shifted = (() => {
    const lasers = [[800, 80, 0, -6], [1040, 40, -200e-6 * C_MM_PER_NS, 6]].map(([wl, rate, x, y]) => {
      const laser = createElement('pulsedlaser', x, y);
      Object.assign(laser.params, { wavelength: wl, temporalMode: 'pulsed', repRateMHz: rate, pulseWidthFs: 200, beamMode: 'line' });
      return laser;
    });
    const sample = createElement('sample', 200, 0);
    sample.rot = 90;
    Object.assign(sample.params, { aperture: 40, specimenType: 'nonlinear', channels: [ch('cars', { eff: 0.5 })] });
    traceAll([...lasers, sample]);
    return specimenTimingReading(sample.id);
  })();
  close(shifted.skewNs, 200e-6, 1e-9);
  close(shifted.overlap, Math.exp(-4 * Math.LN2 * 200 ** 2 / (200 ** 2 / 2 + 200 ** 2)), 1e-6, 'the CARS gate');
  assert.equal(shifted.ratio, 2);
});
