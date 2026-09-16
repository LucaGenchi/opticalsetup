import test from 'node:test';
import assert from 'node:assert/strict';

import { mixStateText, registry } from '../sketch/js/elements.js';
import { mixDurationFs, mixOverlap, mixPulse, mixWavelength } from '../sketch/js/parametric.js';
import { pulseGateTransmission } from '../sketch/js/pulses.js';
import { detectorReading, mixReading, traceScene } from '../sketch/js/raytrace.js';

const defaults = type => Object.fromEntries((registry[type].params || []).map(p => [p.key, p.def]));
const el = (type, id, x, y, params = {}) => ({ type, id, x, y, rot: 0, params: { ...defaults(type), ...params } });

// Two pulsed beams, well clear of each other's bodies, crossing one crystal.
// `dx` moves the second laser along its own beam, which is exactly what a
// delay stage does: 1 mm of extra path is 3.34 ps of delay.
function bench({ dx = 0, dfg = false, repB = 80, widthFs = 200, cw = false, efficiency = 0.4 } = {}) {
  const second = cw
    ? el('cwlaser', 'b', dx, 25, { wavelength: 800, power: 1, dia: 2 })
    : el('pulsedlaser', 'b', dx, 25, { wavelength: 800, pulseWidthFs: widthFs, repRateMHz: repB, power: 1, dia: 2 });
  const elements = [
    el('pulsedlaser', 'a', 0, -25, { wavelength: 1030, pulseWidthFs: widthFs, repRateMHz: 80, power: 1, dia: 2 }),
    second,
    el('crystal', 'c', 300, 0, { convert: 'shg', mixEfficiency: efficiency, mixDfg: dfg, efficiency: 0.2, aperture: 80 }),
    el('detector', 'd', 600, 0, { aperture: 120 }),
  ];
  traceScene(elements);
  return { reading: mixReading('c'), detector: detectorReading('d') };
}

// The generated lines are bands, not single wavelengths: the mixed output
// carries the two inputs' widths added in quadrature, as the harmonics carry
// their own beam's. A window has to be wide enough to hold one whole band and
// narrow enough to exclude its neighbours.
const sawWavelength = (detector, wl, tolerance = 8) =>
  (detector?.spectrum || []).some(s => Math.abs(s.wavelength - wl) <= tolerance);
const bandPower = (detector, wl, span) => (detector?.spectrum || [])
  .filter(s => Math.abs(s.wavelength - wl) <= span)
  .reduce((total, s) => total + s.power, 0);

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
  // The mixing draws its authored fraction of what doubling leaves of BOTH
  // beams — (1 − 0.2) × 0.4 of each — which is what puts the mixed line in the
  // same range as the harmonics beside it.
  const mixed = bandPower(detector, 450.27, 20);
  assert.ok(Math.abs(mixed - 2 * 0.8 * 0.4) < 1e-6, `sum-frequency power ${mixed}`);
});

test('one beam alone still doubles, and mixes with nothing', () => {
  // A chi(2) crystal does not choose: doubling needs one beam, mixing needs
  // two. With one beam the harmonic is all there is.
  const elements = [
    el('pulsedlaser', 'a', 0, 0, { wavelength: 1030, pulseWidthFs: 200, repRateMHz: 80, power: 5 }),
    el('crystal', 'c', 300, 0, { convert: 'shg', efficiency: 0.3, mixEfficiency: 0.5, aperture: 40 }),
    el('detector', 'd', 600, 0, { aperture: 60 }),
  ];
  traceScene(elements);
  assert.equal(mixReading('c').state, 'oneBeam');
  assert.ok(sawWavelength(detectorReading('d'), 515, 5), 'the single beam did not double');
});

test('both beams double whatever the timing, and only the pair needs it', () => {
  // This is the bench signature: two second harmonics that never move, and a
  // third line that comes and goes with the delay.
  const lines = detector => [...new Set((detector?.spectrum || [])
    .map(s => Math.round(s.wavelength)))].filter(w => w < 700);
  const together = lines(bench().detector);
  const apart = lines(bench({ dx: -30 }).detector);
  for (const harmonic of [515, 400]) {
    assert.ok(together.some(w => Math.abs(w - harmonic) <= 6), `${harmonic} nm harmonic missing at time zero`);
    assert.ok(apart.some(w => Math.abs(w - harmonic) <= 6), `${harmonic} nm harmonic missing off time zero`);
  }
  const sum = Math.round(1 / (1 / 800 + 1 / 1030));
  assert.ok(together.some(w => Math.abs(w - sum) <= 1), 'no sum frequency at time zero');
  assert.ok(!apart.some(w => Math.abs(w - sum) <= 1), 'the sum frequency survived a 100 ps mismatch');
});

test('difference frequency is off by default and appears when asked for', () => {
  const dfgWl = mixWavelength('dfg', 800, 1030);
  assert.equal(bandPower(bench().detector, dfgWl, 600), 0, 'DFG was drawn without being asked for');
  const { reading, detector } = bench({ dfg: true });
  assert.ok(Math.abs(reading.dfgWl - dfgWl) < 1e-6);
  assert.ok(bandPower(detector, dfgWl, 600) > 0, 'DFG was asked for and not drawn');
  assert.match(mixStateText(reading), /difference 3583 nm/);
});

test('the driving beam is debited for its harmonic and its share of the mixing', () => {
  // Half an overlap is half a mixed line, and the residual has to agree: the
  // books must not lose power that nothing absorbed.
  const { reading, detector } = bench({ dx: -0.03, efficiency: 0.5 });
  assert.equal(reading.state, 'mixing');
  // Every line here is a band: a 200 fs pulse has bandwidth, and so does what
  // it makes.
  const power = (wl, span) => bandPower(detector, wl, span);
  const doubled = 0.2;                                      // the bench's SHG fraction
  const perBeam = (1 - doubled) * 0.5 * reading.overlap;    // each beam's contribution
  const mixed = 2 * perBeam;                                // both beams feed the line
  assert.ok(Math.abs(power(450.27, 20) - mixed) < 1e-6, `sum frequency ${power(450.27, 20)} vs ${mixed}`);
  assert.ok(Math.abs(power(400, 6) - doubled) < 1e-6, `harmonic ${power(400, 6)} vs ${doubled}`);
  // Each beam is debited only its own contribution.
  assert.ok(Math.abs(power(800, 20) - (1 - doubled - perBeam)) < 1e-6,
    `residual ${power(800, 20)} vs ${1 - doubled - perBeam}`);
});

test('the signal disappears when the two pulses stop arriving together', () => {
  // 30 mm of extra path is 100 ps, far outside a 200 fs pulse.
  const { reading, detector } = bench({ dx: -30 });
  assert.equal(reading.state, 'unsynchronized');
  assert.ok(Math.abs(reading.skewNs - 30 / 299.792458) < 1e-9, `skew ${reading.skewNs}`);
  assert.ok(!sawWavelength(detector, 450.27), 'signal survived a 100 ps mismatch');
  assert.match(mixStateText(reading), /Only the second harmonics: the pulses arrive 100 ps apart/);
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
  const { reading, detector } = bench({ dfg: true });
  assert.equal(reading.state, 'mixing');
  assert.ok(reading.dfgWl > 1030, `difference frequency ${reading.dfgWl}`);
  // A difference-frequency band at 3.6 µm is wide: width in nm scales as λ².
  assert.ok(bandPower(detector, 3582.6, 600) > 0, 'no difference-frequency light at the detector');
  // 400 nm with 1000 nm lands at 667 nm, between the two inputs.
  assert.ok(Math.abs(mixWavelength('dfg', 400, 1000) - 666.667) < 1e-3);
});

test('a carried gate keeps switching when it did, whatever path the other beam took', () => {
  // Gates are defined against their own train's emission time, so carrying one
  // onto a train with a different epoch needs it rebased. Without that, moving
  // an always-present CW source switches the signal off through the gate
  // reference — the same bug as timing the pulse from the CW beam.
  const gate = { opl: 0, frequencyMHz: 80, duty: 0.5, phaseNs: -0.05 };
  const partner = { opl: 300, pulse: { repRateMHz: 80, pulseWidthFs: 200, phaseNs: 0, gates: [gate] } };
  const open = pulseGateTransmission(partner.pulse);
  assert.equal(open, 1, 'the input itself is not fully passed');
  for (const driverOpl of [300, 330, 600, 1234.5]) {
    const overlap = mixOverlap({ opl: driverOpl, pulse: null }, partner);
    const mixed = mixPulse(null, partner.pulse, {
      crystalId: 'c', kind: 'sfg', wl: 343,
      centerNs: overlap.centerNs, oplMm: driverOpl, repRateMHz: overlap.repRateMHz,
    });
    assert.equal(pulseGateTransmission(mixed), open, `CW driver at ${driverOpl} mm changed the gating`);
  }
});

test('a slow gate survives the choice of coincident pulse', () => {
  // The pair is matched to the nearest pulse of the other train, which can sit
  // a whole period away. A chopper slower than the train would see the
  // difference if the gate were not anchored to its own beam's emission.
  const gate = { opl: 0, frequencyMHz: 1, duty: 0.5, phaseNs: 0 };
  const pulse = { repRateMHz: 80, pulseWidthFs: 200, phaseNs: 0, gates: [gate] };
  const period = 1000 / 80;
  const base = mixPulse(pulse, null, { crystalId: 'c', kind: 'sfg', wl: 343, centerNs: 0, oplMm: 0, repRateMHz: 80 });
  const shifted = mixPulse(pulse, null, { crystalId: 'c', kind: 'sfg', wl: 343, centerNs: period, oplMm: 0, repRateMHz: 80 });
  assert.ok(Math.abs(pulseGateTransmission(base) - pulseGateTransmission(shifted)) < 1e-9,
    'a full period of epoch shift changed how a slow gate acts');
  assert.ok(Math.abs(pulseGateTransmission(base) - pulseGateTransmission(pulse)) < 1e-9,
    'the mixed train is gated differently from the beam that carried the gate');
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

test('nothing is created: outputs and residual add up to the beam', () => {
  // Every combination of the two knobs, with and without the difference
  // frequency, must leave the driving beam's power accounted for.
  for (const shg of [0, 0.3, 0.9, 1]) {
    for (const mix of [0, 0.5, 1]) {
      for (const dfg of [false, true]) {
        const elements = [
          el('pulsedlaser', 'a', 0, -25, { wavelength: 1030, pulseWidthFs: 200, repRateMHz: 80, power: 1, dia: 2 }),
          el('pulsedlaser', 'b', 0, 25, { wavelength: 800, pulseWidthFs: 200, repRateMHz: 80, power: 1, dia: 2 }),
          el('crystal', 'c', 300, 0, { convert: 'shg', efficiency: shg, mixEfficiency: mix, mixDfg: dfg, aperture: 80 }),
          el('detector', 'd', 600, 0, { aperture: 120 }),
        ];
        traceScene(elements);
        const detector = detectorReading('d');
        const total = (detector?.spectrum || []).reduce((sum, s) => sum + s.power, 0);
        const label = `shg ${shg}, mix ${mix}, dfg ${dfg}`;
        // Two beams of 1 each go in; everything drawn must come out of them.
        assert.ok(total <= 2 + 1e-6, `${label}: ${total} out of 2 in`);
        assert.ok(total > 1.99, `${label}: ${total} — power vanished`);
      }
    }
  }
});

test('a third colour makes its own pairs, sharing one mixing budget', () => {
  const elements = [
    el('pulsedlaser', 'a', 0, -40, { wavelength: 1030, pulseWidthFs: 200, repRateMHz: 80, power: 1, dia: 2 }),
    el('pulsedlaser', 'b', 0, 0, { wavelength: 800, pulseWidthFs: 200, repRateMHz: 80, power: 1, dia: 2 }),
    el('pulsedlaser', 'c2', 0, 40, { wavelength: 600, pulseWidthFs: 200, repRateMHz: 80, power: 1, dia: 2 }),
    el('crystal', 'c', 300, 0, { convert: 'shg', efficiency: 0.2, mixEfficiency: 0.4, aperture: 120 }),
    el('detector', 'd', 600, 0, { aperture: 160 }),
  ];
  traceScene(elements);
  const detector = detectorReading('d');
  const lines = [...new Set((detector.spectrum || []).map(s => Math.round(s.wavelength)))];
  // Every unordered pair mixes: 600+800, 600+1030, 800+1030.
  for (const [a, b] of [[600, 800], [600, 1030], [800, 1030]]) {
    const sum = Math.round(mixWavelength('sfg', a, b));
    assert.ok(lines.some(w => Math.abs(w - sum) <= 1), `${a} + ${b} nm → ${sum} nm missing`);
  }
  // And the books still balance across three beams.
  const total = (detector.spectrum || []).reduce((sum, s) => sum + s.power, 0);
  assert.ok(total > 2.99 && total <= 3 + 1e-6, `three beams in, ${total} out`);
  // Three colours make three pairs, and the readout counts the crystal's.
  assert.equal(mixReading('c').alsoPairs, 2, 'the crystal should report all three of its pairs');
});

test('two trains of one colour stay two beams, whatever order they are traced in', () => {
  // A wavelength is not an identity: a synchronous 1000 nm beam and a late one
  // are different partners, and which is found must not depend on which source
  // happens to be traced first.
  const driver = () => el('pulsedlaser', 'drv', 0, -40, { wavelength: 600, pulseWidthFs: 200, repRateMHz: 80, power: 1, dia: 2 });
  const synchronous = () => el('pulsedlaser', 'sync', 0, 0, { wavelength: 1000, pulseWidthFs: 200, repRateMHz: 80, power: 1, dia: 2 });
  const late = () => el('pulsedlaser', 'late', -30, 40, { wavelength: 1000, pulseWidthFs: 200, repRateMHz: 80, power: 1, dia: 2 });
  const rest = () => [
    el('crystal', 'c', 300, 0, { convert: 'shg', efficiency: 0.3, mixEfficiency: 0.5, aperture: 120 }),
    el('detector', 'd', 600, 0, { aperture: 150 }),
  ];
  const sum = Math.round(mixWavelength('sfg', 600, 1000));
  const run = sources => {
    traceScene([...sources, ...rest()]);
    const detector = detectorReading('d');
    return (detector?.spectrum || [])
      .filter(s => Math.abs(s.wavelength - sum) <= 1)
      .reduce((total, s) => total + s.power, 0);
  };
  const a = run([driver(), synchronous(), late()]);
  const b = run([driver(), late(), synchronous()]);
  assert.ok(a > 0, 'the synchronous partner produced nothing');
  assert.equal(a, b, 'the result changed when only the source order changed');
});

test('the readout describes the whole crystal, not the last ray through it', () => {
  // 600 and 800 nm mix; 1030 nm arrives late and cannot. The crystal is
  // mixing, and must not report that nothing does.
  const elements = [
    el('pulsedlaser', 'a', 0, -40, { wavelength: 600, pulseWidthFs: 200, repRateMHz: 80, power: 1, dia: 2 }),
    el('pulsedlaser', 'b', 0, 0, { wavelength: 800, pulseWidthFs: 200, repRateMHz: 80, power: 1, dia: 2 }),
    el('pulsedlaser', 'c3', -30, 40, { wavelength: 1030, pulseWidthFs: 200, repRateMHz: 80, power: 1, dia: 2 }),
    el('crystal', 'c', 300, 0, { convert: 'shg', efficiency: 0.3, mixEfficiency: 0.5, aperture: 120 }),
    el('detector', 'd', 600, 0, { aperture: 150 }),
  ];
  traceScene(elements);
  const reading = mixReading('c');
  assert.equal(reading.state, 'mixing', 'a pair that cannot mix spoke for the crystal');
  assert.equal(Math.round(reading.wl), Math.round(mixWavelength('sfg', 600, 800)));
  assert.equal(reading.alsoPairs, 2, 'the other pairs at this crystal are not counted');
  assert.match(mixStateText(reading), /2 more pairs at this crystal/);
});

test('a beam in several saturated pairs still gives away only what it has', () => {
  // At the highest authored share every pair asks for more than its beam can
  // spare, so the requests have to be scaled on both sides of every pair.
  for (const mix of [0.4, 0.6]) {
    for (const order of [[600, 800, 1030], [1030, 600, 800]]) {
      const elements = order.map((wl, index) =>
        el('pulsedlaser', `s${index}`, 0, -40 + index * 40, {
          wavelength: wl, pulseWidthFs: 200, repRateMHz: 80, power: 1, dia: 2,
        }));
      elements.push(
        el('crystal', 'c', 300, 0, { convert: 'shg', efficiency: 0.2, mixEfficiency: mix, aperture: 120 }),
        el('detector', 'd', 600, 0, { aperture: 150 }),
      );
      traceScene(elements);
      const total = (detectorReading('d')?.spectrum || []).reduce((sum, s) => sum + s.power, 0);
      assert.ok(total <= 3 + 1e-6 && total > 2.99,
        `mixing ${mix}, order ${order}: ${total} out of 3 in`);
    }
  }
});

test('the mixed band carries both inputs\' widths, not just the emitting beam\'s', () => {
  const spanOf = ({ partnerFs = 200, filterPartner = false } = {}) => {
    const elements = [
      el('pulsedlaser', 'a', 0, -25, { wavelength: 800, pulseWidthFs: 200, repRateMHz: 80, power: 1, dia: 2 }),
      el('pulsedlaser', 'b', 0, 25, { wavelength: 1030, pulseWidthFs: partnerFs, repRateMHz: 80, power: 1, dia: 2 }),
      el('crystal', 'c', 300, 0, { convert: 'shg', efficiency: 0.2, mixEfficiency: 0.3, aperture: 80 }),
      el('detector', 'd', 600, 0, { aperture: 120 }),
    ];
    if (filterPartner) {
      // A narrow filter in the partner's arm, before the crystal.
      elements.splice(2, 0, el('filter', 'f', 150, 25, { ftype: 'bandpass', center: 1030, band: 2, trans: 1 }));
    }
    traceScene(elements);
    const band = (detectorReading('d')?.spectrum || []).filter(s => Math.abs(s.wavelength - 450.3) <= 40);
    assert.ok(band.length > 1, 'the mixed output has no band at all');
    return Math.max(...band.map(s => s.wavelength)) - Math.min(...band.map(s => s.wavelength));
  };
  const both200 = spanOf();
  const shortPartner = spanOf({ partnerFs: 20 });
  assert.ok(shortPartner > both200 * 2,
    `a 20 fs partner should widen the mixed band: ${shortPartner} vs ${both200}`);
  // And narrowing the partner's spectrum narrows the band it helps make.
  const filtered = spanOf({ filterPartner: true });
  assert.ok(filtered < both200, `filtering the partner should narrow the mixed band: ${filtered} vs ${both200}`);
});
