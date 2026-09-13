import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import { scopeTrace } from '../sketch/js/pulses.js';

// Modulation efficiency is the fraction of the beam the AOM can switch, so it
// is what sets how completely each order turns on and off. It used to be
// invisible on the time trace: the plot normalized to its own peak, so an AOM
// at 20% drew exactly like one at 100%.
function orders({ eff = 0.5, chopDuty = 0.5, modShape = 'square' } = {}) {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'line', repRateMHz: 80 });
  const aom = createElement('aom', 200, 0);
  Object.assign(aom.params, {
    modulate: true, modShape, chopDuty, modDepth: 1, modFreqMHz: 5, eff, zero: true, deflect: 10,
  });
  const dy = Math.round(300 * Math.tan(10 * Math.PI / 180));
  const first = createElement('detector', 500, dy);
  const zeroth = createElement('detector', 500, 0);
  first.params.aperture = 40;
  zeroth.params.aperture = 40;
  const scene = [laser, aom, first, zeroth];
  traceAll(scene, []);
  const levels = detector => {
    const reading = detectorReading(detector.id);
    // At zero efficiency there is no diffracted order at all, so no reading.
    if (!reading) return { min: 0, max: 0, signal: 0, amps: [] };
    const amps = scopeTrace(reading.pulse, {}).pulses.map(p => p.amplitude);
    return { min: Math.min(...amps), max: Math.max(...amps), signal: reading.signal, amps };
  };
  return { first: levels(first), zeroth: levels(zeroth) };
}

test('the diffracted order only reaches the efficiency, not full height', () => {
  for (const eff of [1, 0.7, 0.5, 0.2]) {
    const { first } = orders({ eff });
    assert.ok(Math.abs(first.max - eff) < 1e-6, `eff ${eff}: peaked at ${first.max.toFixed(3)}`);
    // It does still extinguish: with no RF there is no first order at all.
    assert.ok(first.min < 1e-6, `eff ${eff}: should fall to zero, got ${first.min.toFixed(3)}`);
  }
});

test('the undiffracted order only falls to the residual, not to zero', () => {
  for (const eff of [1, 0.7, 0.5, 0.2]) {
    const { zeroth } = orders({ eff });
    assert.ok(Math.abs(zeroth.max - 1) < 1e-6, `eff ${eff}: should return to full, got ${zeroth.max.toFixed(3)}`);
    assert.ok(Math.abs(zeroth.min - (1 - eff)) < 1e-6,
      `eff ${eff}: should bottom at 1-eff = ${(1 - eff).toFixed(2)}, got ${zeroth.min.toFixed(3)}`);
  }
});

test('the two orders are complementary at every instant', () => {
  for (const eff of [1, 0.6, 0.3]) {
    const { first, zeroth } = orders({ eff });
    assert.ok(first.amps.length && first.amps.length === zeroth.amps.length);
    for (let i = 0; i < first.amps.length; i++) {
      assert.ok(Math.abs(first.amps[i] + zeroth.amps[i] - 1) < 1e-6,
        `eff ${eff}, pulse ${i}: orders summed to ${(first.amps[i] + zeroth.amps[i]).toFixed(4)}, not 1`);
    }
    // ...and genuinely in opposition, not merely summing right.
    const firstPeak = first.amps.indexOf(Math.max(...first.amps));
    assert.ok(Math.abs(zeroth.amps[firstPeak] - zeroth.min) < 1e-6,
      'the undiffracted order must be at its floor where the diffracted one peaks');
  }
});

// Efficiency 0 is a crystal with no RF coupling at all: nothing is switched,
// so the undiffracted beam is simply the whole beam, unmodulated.
test('zero efficiency leaves the beam alone', () => {
  const { first, zeroth } = orders({ eff: 0 });
  assert.ok(zeroth.max - zeroth.min < 1e-6, 'nothing to modulate');
  assert.ok(Math.abs(zeroth.max - 1) < 1e-6, 'the whole beam goes straight through');
  assert.ok(first.max < 1e-6, 'no diffracted order exists');
});

test('the duty cycle sets how long each order holds its level', () => {
  for (const chopDuty of [0.25, 0.75]) {
    const { first, zeroth } = orders({ eff: 0.5, chopDuty });
    const lit = first.amps.filter(a => a > 0.25).length / first.amps.length;
    assert.ok(Math.abs(lit - chopDuty) < 0.1,
      `duty ${chopDuty}: diffracted order lit for ${(100 * lit).toFixed(0)}% of the period`);
    // Levels are set by efficiency, not by duty.
    assert.ok(Math.abs(first.max - 0.5) < 1e-6 && Math.abs(zeroth.min - 0.5) < 1e-6,
      'duty must not move the levels');
  }
});

// Making the levels visible must not have moved any measured power.
test('drawing the levels honestly does not change what the detectors read', () => {
  for (const eff of [1, 0.5, 0.2]) {
    for (const chopDuty of [0.25, 0.5]) {
      const { first, zeroth } = orders({ eff, chopDuty });
      assert.ok(Math.abs(first.signal - eff * chopDuty) < 1e-6,
        `eff ${eff} duty ${chopDuty}: diffracted read ${first.signal}`);
      assert.ok(Math.abs(zeroth.signal - (1 - eff * chopDuty)) < 1e-6,
        `eff ${eff} duty ${chopDuty}: undiffracted read ${zeroth.signal}`);
      assert.ok(Math.abs(first.signal + zeroth.signal - 1) < 1e-6, 'and they still sum to the beam');
    }
  }
});

// The axis is absolute, so light lost before the detector shortens the trace
// rather than being normalized back to full height.
test('a beam that arrives attenuated draws at the height it arrives with', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'line', repRateMHz: 80 });
  const splitter = createElement('bs', 200, 0);
  splitter.params.ratio = 0.5;
  const detector = createElement('detector', 400, 0);
  traceAll([laser, splitter, detector], []);
  const amps = scopeTrace(detectorReading(detector.id).pulse, {}).pulses.map(p => p.amplitude);
  assert.ok(Math.abs(Math.max(...amps) - 0.5) < 1e-6,
    `half the beam should draw at half height, drew ${Math.max(...amps).toFixed(3)}`);
});

test('the control says what it controls', () => {
  const spec = registry.aom.params.find(p => p.key === 'eff');
  assert.match(spec.label, /Modulation efficiency/);
});

// The vertical scale is fixed at one source beam, so it must not quietly
// rescale when more than one beam arrives. Rescaling to the summed peak made
// one source and two draw identically, and made two half-strength beams look
// like two full ones.
test('the vertical scale stays fixed when several beams share a detector', () => {
  const height = (sources, attenuate) => {
    const scene = [];
    for (let i = 0; i < sources; i++) {
      const laser = createElement('pulsedlaser', 0, i * 40);
      Object.assign(laser.params, { beamMode: 'line', repRateMHz: 80 });
      scene.push(laser);
      if (attenuate) {
        const nd = createElement('filter', 200, i * 40);
        Object.assign(nd.params, { ftype: 'nd', trans: 0.5 });
        scene.push(nd);
      }
    }
    const detector = createElement('detector', 400, 0);
    detector.params.aperture = 200;
    const screen = createElement('display', 520, 0);
    Object.assign(screen.params, { sensorId: detector.id, screenOn: true });
    scene.push(detector, screen);
    traceAll(scene, []);
    const values = /data-scope-trace="\d+" points="([^"]+)"/.exec(registry.display.svg(screen, scene))[1]
      .split(' ').map(p => (6 - Number(p.split(',')[1])) / 17);
    return Math.max(...values);
  };
  // One whole beam is exactly full height.
  assert.ok(Math.abs(height(1, false) - 1) < 0.02, 'one source fills the screen');
  // Half a beam is half height -- this is the case a peak rescale destroyed.
  assert.ok(Math.abs(height(1, true) - 0.5) < 0.02,
    `an attenuated source must draw short, drew ${height(1, true).toFixed(3)}`);
  // Two halves make one beam's worth, so they reach full height honestly.
  assert.ok(Math.abs(height(2, true) - 1) < 0.02, 'two half beams sum to one');
  // Above one beam's worth the axis stretches to fit rather than clipping, so
  // a modulation riding over full scale stays visible. That costs the absolute
  // reading for multi-source scenes, which is recorded in scopePlot.
  assert.ok(Math.abs(height(2, false) - 1) < 0.02, 'two sources still fill the screen');
});
