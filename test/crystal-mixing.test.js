import test from 'node:test';
import assert from 'node:assert/strict';

import { mixStateText, registry } from '../sketch/js/elements.js';
import { mixDurationFs, mixOverlap, mixPulse, mixWavelength } from '../sketch/js/parametric.js';
import { detectorReading, mixReading, traceScene } from '../sketch/js/raytrace.js';

const defaults = type => Object.fromEntries((registry[type].params || []).map(p => [p.key, p.def]));
const el = (type, id, x, y, params = {}) => ({ type, id, x, y, rot: 0, params: { ...defaults(type), ...params } });

// Two pulsed beams, well clear of each other's bodies, crossing one crystal.
// `dx` moves the second laser along its own beam, which is exactly what a
// delay stage does: 1 mm of extra path is 3.34 ps of delay.
function bench({ dx = 0, convert = 'sfg', repB = 80, widthFs = 200, cw = false, efficiency = 0.4 } = {}) {
  const second = cw
    ? el('cwlaser', 'b', dx, 25, { wavelength: 800, power: 1, dia: 2 })
    : el('pulsedlaser', 'b', dx, 25, { wavelength: 800, pulseWidthFs: widthFs, repRateMHz: repB, power: 1, dia: 2 });
  const elements = [
    el('pulsedlaser', 'a', 0, -25, { wavelength: 1030, pulseWidthFs: widthFs, repRateMHz: 80, power: 1, dia: 2 }),
    second,
    el('crystal', 'c', 300, 0, { convert, efficiency, aperture: 80 }),
    el('detector', 'd', 600, 0, { aperture: 120 }),
  ];
  traceScene(elements);
  return { reading: mixReading('c'), detector: detectorReading('d') };
}

const sawWavelength = (detector, wl, tolerance = 1) =>
  (detector?.spectrum || []).some(s => Math.abs(s.wavelength - wl) <= tolerance);

test('sum and difference frequency follow photon energy conservation', () => {
  // 1/λ3 = 1/λ1 + 1/λ2 and 1/λ1 − 1/λ2.
  assert.ok(Math.abs(mixWavelength('sfg', 800, 1030) - 450.2732) < 1e-3);
  assert.ok(Math.abs(mixWavelength('dfg', 800, 1030) - 3582.6087) < 1e-3);
  // The order of the two inputs cannot matter.
  assert.equal(mixWavelength('sfg', 1030, 800), mixWavelength('sfg', 800, 1030));
  assert.equal(mixWavelength('dfg', 1030, 800), mixWavelength('dfg', 800, 1030));
  // Difference frequency of one colour with itself has no positive solution.
  assert.equal(mixWavelength('dfg', 800, 800), null);
  assert.equal(mixWavelength('shg', 800, 1030), null);
});

test('the mixed pulse is shorter than either input, and follows the shorter one', () => {
  assert.ok(Math.abs(mixDurationFs(200, 200) - 200 / Math.SQRT2) < 1e-9);
  assert.ok(Math.abs(mixDurationFs(2000, 100) - 99.875) < 1e-3);
  assert.equal(mixDurationFs(0, 150), 150);
});

test('two synchronized beams mix, and their sum frequency reaches the detector', () => {
  const { reading, detector } = bench();
  assert.equal(reading.state, 'mixing');
  assert.ok(Math.abs(reading.wl - 450.2732) < 1e-3, `output ${reading.wl}`);
  assert.equal(reading.skewNs, 0);
  assert.equal(reading.overlap, 1);
  assert.ok(sawWavelength(detector, 450.27), 'no sum-frequency light at the detector');
  // The drawn signal is the authored fraction of the driving beam, and it is
  // attributed to that beam rather than to the crystal.
  const line = (detector.spectrum || []).find(s => Math.abs(s.wavelength - 450.27) <= 1);
  assert.ok(Math.abs(line.power - 0.4) < 1e-9, `sum-frequency power ${line.power}`);
});

test('one beam alone produces nothing, whatever its power', () => {
  const elements = [
    el('pulsedlaser', 'a', 0, 0, { wavelength: 1030, pulseWidthFs: 200, repRateMHz: 80, power: 5 }),
    el('crystal', 'c', 300, 0, { convert: 'sfg', efficiency: 0.9, aperture: 40 }),
    el('detector', 'd', 600, 0, { aperture: 60 }),
  ];
  traceScene(elements);
  assert.equal(mixReading('c').state, 'oneBeam');
  assert.ok(!sawWavelength(detectorReading('d'), 515), 'a single beam produced a harmonic in a mixing mode');
});

test('the driving beam is debited exactly what the pair generates', () => {
  // Half an overlap is half a signal, and the residual has to agree: the
  // books must not lose power that nothing absorbed.
  const { reading, detector } = bench({ dx: -0.03, efficiency: 0.5 });
  assert.equal(reading.state, 'mixing');
  // The residual driver is a band, not a line: a 200 fs pulse has bandwidth.
  const power = (wl, span) => (detector.spectrum || [])
    .filter(s => Math.abs(s.wavelength - wl) <= span)
    .reduce((total, s) => total + s.power, 0);
  const converted = 0.5 * reading.overlap;
  assert.ok(Math.abs(power(450.27, 1) - converted) < 1e-9, `signal ${power(450.27, 1)} vs ${converted}`);
  assert.ok(Math.abs(power(800, 20) - (1 - converted)) < 1e-6, `residual ${power(800, 20)} vs ${1 - converted}`);
});

test('the signal disappears when the two pulses stop arriving together', () => {
  // 30 mm of extra path is 100 ps, far outside a 200 fs pulse.
  const { reading, detector } = bench({ dx: -30 });
  assert.equal(reading.state, 'unsynchronized');
  assert.equal(reading.reason, 'skew');
  assert.ok(Math.abs(reading.skewNs - 30 / 299.792458) < 1e-9, `skew ${reading.skewNs}`);
  assert.ok(!sawWavelength(detector, 450.27), 'signal survived a 100 ps mismatch');
  assert.match(mixStateText(reading), /No signal: the pulses arrive 100 ps apart/);
});

test('the overlap traces a cross-correlation as the delay is scanned', () => {
  // Scanning the stage through zero is how time zero is found on a bench:
  // the signal peaks at zero delay and falls away either side of it.
  const overlaps = [-0.06, -0.02, 0, 0.02, 0.06].map(dx => bench({ dx }).reading.overlap);
  assert.equal(overlaps[2], 1, 'the peak is not at zero delay');
  assert.ok(overlaps[1] > overlaps[0] && overlaps[1] < 1, 'not rising towards zero delay');
  assert.ok(overlaps[3] > overlaps[4] && overlaps[3] < 1, 'not falling after zero delay');
  // Symmetric about zero, since only the size of the mismatch matters.
  assert.ok(Math.abs(overlaps[1] - overlaps[3]) < 1e-9);
  assert.ok(Math.abs(overlaps[0] - overlaps[4]) < 1e-9);
});

test('a longer pulse pair tolerates a delay that kills a shorter one', () => {
  const short = bench({ dx: -0.2, widthFs: 200 });
  const long = bench({ dx: -0.2, widthFs: 5000 });
  assert.equal(short.reading.state, 'unsynchronized');
  assert.equal(long.reading.state, 'mixing');
  assert.ok(long.reading.overlap > 0.9, `overlap ${long.reading.overlap}`);
});

test('only equal repetition rates are modelled, and the rest say so', () => {
  // Different rates are not physically silent — 80 and 60 MHz coincide at
  // 20 MHz — but this model keeps no pulse-by-pulse bookkeeping for them, so
  // it reports the timing as unsupported instead of inventing a result.
  for (const repB of [37, 40, 60]) {
    const { reading, detector } = bench({ repB });
    assert.equal(reading.state, 'unsupported', `${repB} MHz`);
    assert.ok(!sawWavelength(detector, 450.27), `${repB} MHz drew a signal`);
    assert.match(mixStateText(reading), /Timing not modelled/);
  }
  assert.equal(bench({ repB: 80 }).reading.state, 'mixing');
});

test('the overlap is the Gaussian overlap integral, not a look-alike', () => {
  // Two 200 fs pulses 200 fs apart: exp(−4 ln2 Δt²/(τ₁²+τ₂²)) = 0.25.
  const pulse = (widthFs, phaseNs, opl = 0) => ({ opl, pulse: { repRateMHz: 80, pulseWidthFs: widthFs, phaseNs } });
  const equal = mixOverlap(pulse(200, 0), pulse(200, 200e-6));
  assert.ok(Math.abs(equal.factor - 0.25) < 1e-9, `factor ${equal.factor}`);
  assert.ok(Math.abs(equal.skewNs - 200e-6) < 1e-12);
  // The product of two equal envelopes peaks halfway between them.
  assert.ok(Math.abs(equal.centerNs - 100e-6) < 1e-12, `centre ${equal.centerNs}`);
  // A short pulse mixed with a long one pins the signal near the short one.
  const uneven = mixOverlap(pulse(100, 0), pulse(1000, 200e-6));
  assert.ok(uneven.centerNs < 20e-6, `centre ${uneven.centerNs} is not near the short pulse`);
  // Coincidence is with the nearest pulse of the other train, not pulse 0:
  // a full period of delay is no delay at all.
  const wrapped = mixOverlap(pulse(200, 0), pulse(200, 1000 / 80));
  assert.equal(wrapped.skewNs, 0);
  assert.equal(wrapped.factor, 1);
});

test('the generated train is timed by the pulsed beam, not by a CW one', () => {
  // A beam that is always there cannot decide when the signal arrives, so
  // moving the CW source must not move the mixed pulse.
  const near = bench({ cw: true }).detector;
  const far = bench({ cw: true, dx: -30 }).detector;
  assert.ok(near.pulse && far.pulse, 'no pulse summary at the detector');
  assert.equal(near.pulse.repRateMHz, 80);
  assert.ok(Math.abs(near.pulse.earliestPathDelayNs - far.pulse.earliestPathDelayNs) < 1e-9,
    'moving the CW source moved the mixed pulse');
});

test('a CW partner is always present, so it needs no timing', () => {
  const { reading } = bench({ cw: true });
  assert.equal(reading.state, 'mixing');
  assert.equal(reading.overlap, 1);
  assert.equal(reading.skewNs, null);
  assert.match(mixStateText(reading), /no pulse timing to match/);
  const steady = mixOverlap({ opl: 0, pulse: null }, { opl: 300, pulse: { repRateMHz: 80, phaseNs: 0 } });
  assert.equal(steady.comparable, false);
  assert.equal(steady.factor, 1);
  // Timing still comes from the pulsed side.
  assert.ok(Math.abs(steady.centerNs - 300 / 299.792458) < 1e-12);
});

test('difference frequency is longer than its shorter input, but not always than both', () => {
  const { reading, detector } = bench({ convert: 'dfg' });
  assert.equal(reading.state, 'mixing');
  assert.ok(reading.wl > 1030, `difference frequency ${reading.wl}`);
  assert.ok(sawWavelength(detector, 3582.6, 2), 'no difference-frequency light at the detector');
  // 400 nm with 1000 nm lands at 667 nm, between the two inputs.
  assert.ok(Math.abs(mixWavelength('dfg', 400, 1000) - 666.667) < 1e-3);
});

test('a gate on either beam gates the signal, because both have to be there', () => {
  const gated = { opl: 0, pulse: { repRateMHz: 80, pulseWidthFs: 200, phaseNs: 0, gates: [{ opl: 0, frequencyMHz: 1, duty: 0.5 }] } };
  const plain = { opl: 0, pulse: { repRateMHz: 80, pulseWidthFs: 200, phaseNs: 0 } };
  const fromDriver = mixPulse(gated.pulse, plain.pulse, { crystalId: 'c', kind: 'sfg', wl: 450 });
  const fromPartner = mixPulse(plain.pulse, gated.pulse, { crystalId: 'c', kind: 'sfg', wl: 450 });
  assert.equal(fromDriver.gates.length, 1, 'a gate on the driving beam was dropped');
  assert.equal(fromPartner.gates.length, 1, 'a gate on the partner was dropped');
  assert.equal(mixPulse(gated.pulse, gated.pulse, { crystalId: 'c', kind: 'sfg', wl: 450 }).gates.length, 2);
});

test('mixed light is not fed back into the same crystal', () => {
  const { detector } = bench();
  // 450 nm mixing with 800 nm would appear at 288 nm if the crystal converted
  // its own output again.
  assert.ok(!sawWavelength(detector, 288.4, 2), 'the crystal mixed its own output');
});
