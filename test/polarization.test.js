import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, getElementMeta, registry } from '../sketch/js/elements.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';
import {
  degreeOfPolarization, legacyPolarization, linearStokes, retarder, polarizationDescription,
} from '../sketch/js/polarization.js';
import { scopeTrace } from '../sketch/js/pulses.js';

function nearly(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`);
}

test('quarter-wave retardance respects fast-axis alignment and handedness', () => {
  const aligned = retarder(linearStokes(0), 0, 90);
  assert.equal(polarizationDescription(aligned), 'Linear 0°');
  const plus = retarder(linearStokes(45), 0, 90);
  const minus = retarder(linearStokes(-45), 0, 90);
  assert.equal(polarizationDescription(plus), 'Right circular');
  assert.equal(polarizationDescription(minus), 'Left circular');
});

test('waveplate integration preserves aligned linear input', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.pol = 0;
  const qwp = createElement('qwp', 150, 0);
  qwp.params.a = 0;
  const detector = createElement('detector', 300, 0);
  traceAll([laser, qwp, detector]);
  assert.equal(detectorReading(detector.id).polarization, 'Linear 0°');
});

test('EOM retardance changes polarization and an analyzer converts it to extinction', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.pol = 45;
  const eom = createElement('eom', 120, 0);
  eom.params.modulate = true;
  eom.params.a = 0;
  eom.params.retardance = 180;
  const analyzer = createElement('polarizer', 220, 0);
  analyzer.params.pangle = 45;
  const detector = createElement('detector', 320, 0);
  traceAll([laser, eom, analyzer, detector]);
  assert.equal(detectorReading(detector.id), null);
});

// ---------------- EOM switching: an electro-optic amplitude modulator ----------------
// A crystal axis at 45° to the input polarization is the direct way to make a
// switching EOM alternate cleanly between horizontal and vertical linear
// output, with no separate quarter-wave plate needed: 0° retardance leaves
// the input axis untouched, and a full half-wave (180°) flips it to the
// orthogonal linear state. See raytrace.js's 'retarder'/switching case for
// the general (any two states, any duty) version this exercises.

test('a switching EOM at 45° to the input toggles cleanly between horizontal and vertical', () => {
  const H = linearStokes(0);
  const lowState = retarder(H, 45, 0);
  const highState = retarder(H, 45, 180);
  assert.equal(polarizationDescription(lowState), 'Linear 0°');
  assert.equal(polarizationDescription(highState), 'Linear 90°');
});

test('a switching EOM plus a downstream analyzer gives a 0-to-1 intensity modulation, duty-averaged for a static reading', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.pol = 0; // horizontal
  const eom = createElement('eom', 120, 0);
  eom.params.modulate = true;
  eom.params.a = 45; // crystal axis 45° to input -> low/high states are H/V
  eom.params.driveMode = 'switching';
  eom.params.switchMode = 'custom';
  eom.params.retardanceLow = 0; // stays H
  eom.params.retardanceHigh = 180; // flips to V
  const analyzer = createElement('polarizer', 220, 0); // aligned with H, so only the low state passes
  analyzer.params.pangle = 0;
  const detector = createElement('detector', 320, 0);

  eom.params.switchDuty = 0.5;
  traceAll([laser, eom, analyzer, detector]);
  nearly(detectorReading(detector.id).signal, 0.5);

  // more time in the blocked (V) state -> less transmitted, weighted exactly
  // by how much time is spent in the transmitting (H) state
  eom.params.switchDuty = 0.9;
  traceAll([laser, eom, analyzer, detector]);
  nearly(detectorReading(detector.id).signal, 0.1);

  // duty=0 (always low/H) reproduces plain full transmission
  eom.params.switchDuty = 0;
  traceAll([laser, eom, analyzer, detector]);
  nearly(detectorReading(detector.id).signal, 1);

  // duty=1 (always high/V) reproduces the static full-extinction case above
  eom.params.switchDuty = 1;
  traceAll([laser, eom, analyzer, detector]);
  assert.equal(detectorReading(detector.id), null);
});

test('EOM switching frequency and duty are configurable independently of the retardance levels', () => {
  const eom = createElement('eom', 0, 0);
  eom.params.modulate = true;
  eom.params.driveMode = 'switching';
  assert.equal(eom.params.switchMode, 'flip', 'H↔V switching is the default, needing no axis/retardance tuning');
  assert.equal(eom.params.retardanceLow, 0);
  assert.equal(eom.params.retardanceHigh, 180); // full swing by default -> full 0-to-1 depth out of the box
  assert.equal(eom.params.switchDuty, 0.5);
  assert.ok(eom.params.switchFreqMHz > 0);
});

test('the H↔V flip drive needs no crystal-axis tuning and works from any input polarization', () => {
  // Regression: the crystal axis defaults to 0°, which with an explicit
  // 0°/180° retardance pair leaves a horizontal input completely unchanged in
  // both states — a silent no-op that made the feature look broken. The flip
  // drive derives the required half-wave action from whatever arrives.
  for (const inputPol of [0, 30, 90]) {
    const laser = createElement('laser', 0, 0);
    laser.params.pol = inputPol;
    const eom = createElement('eom', 120, 0);
    eom.params.modulate = true;
    eom.params.driveMode = 'switching'; // switchMode defaults to 'flip'
    eom.params.a = 0; // deliberately left at the unhelpful default
    const analyzer = createElement('polarizer', 220, 0);
    analyzer.params.pangle = inputPol; // aligned with the undriven state
    const detector = createElement('detector', 320, 0);

    eom.params.switchDuty = 0; // never driven -> input passes untouched
    traceAll([laser, eom, analyzer, detector]);
    nearly(detectorReading(detector.id).signal, 1, 1e-6);

    eom.params.switchDuty = 1; // always driven -> rotated 90°, fully blocked
    traceAll([laser, eom, analyzer, detector]);
    assert.equal(detectorReading(detector.id), null, `flip should extinguish a ${inputPol}° input through an aligned analyzer`);
  }
});

test('a waveplate between a switching EOM and a PBS retards both states, and its axis decides whether the modulation survives', () => {
  // A quarter-wave plate is not automatically helpful here. Both modulation
  // states are carried through it (rather than being pre-averaged away), so
  // the axis genuinely matters: aligned with the switch, H/V is preserved and
  // the PBS still routes pulse-by-pulse; at 45° the two states become
  // opposite circular polarizations, which a PBS cannot tell apart at all —
  // it splits both 50/50 and the modulation vanishes.
  const modulationDepth = qwpAxis => {
    const laser = createElement('laser', 0, 0);
    laser.params.pol = 0;
    laser.params.temporalMode = 'pulsed';
    laser.params.repRateMHz = 20;
    const eom = createElement('eom', 120, 0);
    eom.params.modulate = true;
    eom.params.driveMode = 'switching';
    eom.params.switchFreqMHz = 10;
    const qwp = createElement('qwp', 200, 0);
    qwp.params.a = qwpAxis;
    const pbs = createElement('pbs', 300, 0);
    const transmitted = createElement('detector', 420, 0);
    traceAll([laser, eom, qwp, pbs, transmitted]);
    const amplitudes = scopeTrace(detectorReading(transmitted.id).pulse).pulses.map(p => p.amplitude);
    return Math.max(...amplitudes) - Math.min(...amplitudes);
  };

  nearly(modulationDepth(0), 1, 1e-6); // aligned: full pulse-by-pulse routing survives
  nearly(modulationDepth(45), 0, 1e-6); // 45°: circular states, PBS cannot discriminate
});

test('switching to static drive mode falls back to the plain fixed-retardance behavior unchanged', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.pol = 45;
  const eom = createElement('eom', 120, 0);
  eom.params.modulate = true;
  eom.params.a = 0;
  eom.params.driveMode = 'static';
  eom.params.retardance = 180;
  const analyzer = createElement('polarizer', 220, 0);
  analyzer.params.pangle = 45;
  const detector = createElement('detector', 320, 0);
  traceAll([laser, eom, analyzer, detector]);
  assert.equal(detectorReading(detector.id), null, 'static drive mode is untouched by the new switching feature');
});

test('a beam alternating between orthogonal states reads as unpolarized, not as a definite azimuth', () => {
  // Regression: the duty-averaged Stokes vector of a 50/50 H/V alternation is
  // the origin of the Poincaré sphere, and atan2(0, 0) is 0 — so a probe just
  // after a switching EOM confidently reported "linear 0°", making it look
  // like the modulator was doing nothing at all.
  const mixed = { s1: 0, s2: 0, s3: 0 };
  assert.equal(degreeOfPolarization(mixed), 0);
  assert.equal(polarizationDescription(mixed), 'Unpolarized');
  assert.equal(legacyPolarization(mixed), undefined, 'the probe glyph must fall through to its unpolarized case');
  // Pure states are untouched.
  assert.equal(polarizationDescription(linearStokes(0)), 'Linear 0°');
  assert.equal(degreeOfPolarization(linearStokes(30)), 1);
});

test('the beam probe names both modulation states and the rate instead of their average', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.pol = 0;
  laser.params.beamMode = 'line';
  const eom = createElement('eom', 120, 0);
  eom.params.modulate = true;
  eom.params.driveMode = 'switching';
  eom.params.switchFreqMHz = 10;
  const probe = createElement('probe', 220, 0);
  probe.params.prop = 'pol';
  traceAll([laser, eom, probe]);
  const svg = registry.probe.svg(probe);
  assert.match(svg, /0°\s*↔\s*90°/, 'both alternating states are named');
  assert.match(svg, /10\.0 MHz/, 'the switching rate is shown on the probe');
  assert.doesNotMatch(svg, /unpolarized/, 'a modulated beam is not simply "unpolarized"');
});

test('the EOM inspector explains the switching feature once voltage is applied', () => {
  const eom = createElement('eom', 0, 0);
  assert.match(getElementMeta('eom', eom.params).note, /Apply voltage/);
  eom.params.modulate = true;
  eom.params.driveMode = 'switching';
  const note = getElementMeta('eom', eom.params).note;
  assert.match(note, /orthogonal/i);
  assert.match(note, /polarizer or PBS/i);
  assert.match(note, /individual pulses are routed/i);
});

// ---------------- time-resolved routing: the point of a fast EOM ----------------
// A 20 MHz pulse train switched at 10 MHz must send alternate pulses to
// alternate PBS ports. Averaging the two polarization states into one blurred
// Stokes vector reports the right mean power but loses exactly the structure
// these modulation-transfer techniques (SRS microscopy and friends) rely on.

function pbsBench({ repRateMHz = 20, switchFreqMHz = 10, duty = 0.5 } = {}) {
  const laser = createElement('laser', 0, 0);
  laser.params.pol = 0;
  laser.params.temporalMode = 'pulsed';
  laser.params.repRateMHz = repRateMHz;
  const eom = createElement('eom', 200, 0);
  eom.params.modulate = true;
  eom.params.driveMode = 'switching';
  eom.params.switchFreqMHz = switchFreqMHz;
  eom.params.switchDuty = duty;
  const pbs = createElement('pbs', 400, 0);
  const transmitted = createElement('detector', 600, 0);
  const reflected = createElement('detector', 400, -200);
  reflected.rot = 270;
  traceAll([laser, eom, pbs, transmitted, reflected]);
  return {
    transmitted: detectorReading(transmitted.id),
    reflected: detectorReading(reflected.id),
  };
}

test('a 20 MHz train switched at 10 MHz sends alternate pulses to alternate PBS ports', () => {
  const { transmitted, reflected } = pbsBench();
  const t = scopeTrace(transmitted.pulse);
  const r = scopeTrace(reflected.pulse);

  // Two periods of the slower (10 MHz modulation -> 100 ns) = 200 ns, which
  // at a 50 ns pulse spacing is five pulse slots.
  assert.equal(t.spanNs, 200);
  assert.equal(t.pulses.length, 5);

  const pattern = t.pulses.map(p => Math.round(p.amplitude));
  assert.deepEqual(pattern, [0, 1, 0, 1, 0], 'every other pulse leaves by the transmitted port');
  const complement = r.pulses.map(p => Math.round(p.amplitude));
  assert.deepEqual(complement, [1, 0, 1, 0, 1], 'the reflected port carries exactly the pulses the other one dropped');

  // Each pulse is fully routed, never half-split: no intermediate amplitudes.
  for (const p of [...t.pulses, ...r.pulses]) {
    assert.ok(p.amplitude < 1e-9 || p.amplitude > 1 - 1e-9,
      `expected a fully routed pulse, got amplitude ${p.amplitude}`);
  }
});

test('complementary PBS ports do not share a cached gate average', () => {
  // Regression: the gate-transmission cache key was built from period, duty,
  // phase and shape only. The two ports of a polarization-modulated PBS are
  // identical in every one of those and differ *only* in their high/low
  // transmission levels, so the second port silently reused the first port's
  // average — an asymmetric duty then reported the same power on both sides.
  const { transmitted, reflected } = pbsBench({ switchFreqMHz: 5, duty: 0.25 });
  assert.ok(Math.abs(transmitted.signal - reflected.signal) > 0.4,
    `ports with a 25/75 duty split must differ, got ${transmitted.signal} and ${reflected.signal}`);
  nearly(transmitted.signal + reflected.signal, 1, 1e-6);
});

test('port-averaged power still splits evenly and conserves energy across the PBS', () => {
  const { transmitted, reflected } = pbsBench();
  nearly(transmitted.signal, 0.5, 1e-6);
  nearly(reflected.signal, 0.5, 1e-6);
  nearly(transmitted.signal + reflected.signal, 1, 1e-6);
});

test('an asymmetric switching duty biases which port most pulses take', () => {
  const { transmitted, reflected } = pbsBench({ switchFreqMHz: 5, duty: 0.25 });
  // 25% of the time driven (V, reflected), 75% undriven (H, transmitted).
  nearly(transmitted.signal, 0.75, 1e-6);
  nearly(reflected.signal, 0.25, 1e-6);
});

test('the scope window spans two periods of whichever is slower, the train or the modulation', () => {
  const withGate = (repRateMHz, gateMHz) => scopeTrace({
    repRateMHz, pulseWidthFs: 100, phaseNs: 0,
    trains: [{ repRateMHz, pulseWidthFs: 100, phaseNs: 0, gates: gateMHz
      ? [{ opl: 0, frequencyMHz: gateMHz, duty: 0.5, phaseNs: 0, shape: 'square', high: 1, low: 0 }]
      : [] }],
  });

  // Modulation slower than the train -> the window follows the modulation.
  const slowMod = withGate(20, 2);
  assert.equal(slowMod.spanNs, 1000); // 2 x 500 ns modulation period
  assert.equal(slowMod.modulationMHz, 2);
  assert.equal(slowMod.repRateMHz, 20);

  // Modulation faster than the train -> the window follows the train.
  const fastMod = withGate(1, 50);
  assert.equal(fastMod.spanNs, 2000); // 2 x 1000 ns pulse period
  assert.equal(fastMod.modulationMHz, 50);

  // No modulation at all -> two periods of the train.
  assert.equal(withGate(25, null).spanNs, 80);
});

test('a modulation synchronous with the rep rate parks every pulse in the same state', () => {
  // Not a bug but a real stroboscopic trap: at 50 MHz switching, a 1 MHz
  // train only ever samples one phase of the square wave, so one PBS port
  // takes every pulse and the other goes dark. Worth having pinned, since a
  // user hitting it sees "no modulation" and could read it as broken.
  const { transmitted, reflected } = pbsBench({ repRateMHz: 1, switchFreqMHz: 50 });
  assert.equal(transmitted, null, 'every pulse arrives in the driven state and is reflected away');
  assert.ok(reflected && Math.abs(reflected.signal - 1) < 1e-6, 'the other port takes the whole train');
});

test('an unmodulated pulsed beam still traces as a plain train, with no modulation frequency', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.temporalMode = 'pulsed';
  laser.params.repRateMHz = 10;
  const detector = createElement('detector', 300, 0);
  traceAll([laser, detector]);
  const trace = scopeTrace(detectorReading(detector.id).pulse);
  assert.equal(trace.spanNs, 200); // 2 x 100 ns
  assert.equal(trace.modulationMHz, null);
  assert.ok(trace.pulses.every(p => p.amplitude === 1), 'nothing gates an unmodulated train');
});

test('continuous-wave light through the same chain keeps the averaged behavior it always had', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.pol = 0; // CW by default
  const eom = createElement('eom', 200, 0);
  eom.params.modulate = true;
  eom.params.driveMode = 'switching';
  const pbs = createElement('pbs', 400, 0);
  const transmitted = createElement('detector', 600, 0);
  traceAll([laser, eom, pbs, transmitted]);
  const reading = detectorReading(transmitted.id);
  nearly(reading.signal, 0.5, 1e-6);
  assert.equal(reading.pulse, null, 'CW light has no pulse train to plot');
  assert.equal(scopeTrace(reading.pulse), null);
});
