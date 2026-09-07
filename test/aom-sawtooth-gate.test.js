import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from '../sketch/js/elements.js';
import { gateTransmissionAt } from '../sketch/js/pulses.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';

const gate = (shape, depth = 1) => ({ opl: 0, frequencyMHz: 1, phaseNs: 0, shape, depth, duty: 0.5 });
// One period of a 1 MHz gate is 1000 ns.
const at = (shape, phase, depth = 1) => gateTransmissionAt(gate(shape, depth), phase * 1000);

test('a sawtooth gate ramps linearly across its period', () => {
  for (const phase of [0, 0.25, 0.5, 0.75]) {
    assert.ok(Math.abs(at('sawtooth', phase) - phase) < 1e-9,
      `phase ${phase} should transmit ${phase}, got ${at('sawtooth', phase)}`);
  }
  // Rising, never folding back inside one period.
  let previous = -Infinity;
  for (let i = 0; i < 20; i++) {
    const value = at('sawtooth', i / 20);
    assert.ok(value > previous, 'the ramp must be monotonic within a period');
    previous = value;
  }
  // ...and it resets at the period boundary rather than continuing to climb.
  assert.ok(at('sawtooth', 1.01) < at('sawtooth', 0.99));
});

test('depth sets the bottom of the sawtooth ramp, not its top', () => {
  assert.ok(Math.abs(at('sawtooth', 0, 0.4) - 0.6) < 1e-9, 'starts at 1 - depth');
  assert.ok(Math.abs(at('sawtooth', 0.999, 0.4) - 1) < 1e-2, 'climbs to full transmission');
  // Zero depth is no modulation at all, at every phase.
  for (const phase of [0, 0.3, 0.6, 0.9]) {
    assert.ok(Math.abs(at('sawtooth', phase, 0) - 1) < 1e-9, 'depth 0 leaves the beam alone');
  }
});

test('the three waveforms are genuinely different gates', () => {
  const phases = [0.1, 0.35, 0.6, 0.85];
  const square = phases.map(p => at('square', p));
  const sine = phases.map(p => at('sine', p));
  const sawtooth = phases.map(p => at('sawtooth', p));
  assert.notDeepEqual(square, sine);
  assert.notDeepEqual(square, sawtooth);
  assert.notDeepEqual(sine, sawtooth);
  // A square gate is the only one that is ever fully off mid-period.
  assert.equal(at('square', 0.75), 0);
  assert.ok(at('sawtooth', 0.75) > 0);
});

// Both continuous shapes sweep symmetrically between 1-depth and 1, so each
// averages 1 - depth/2 over a period: a sine over its cosine, a sawtooth over
// its ramp. That is the number a detector with no temporal resolution reads.
test('a sawtooth averages 1 - depth/2, like the sine', () => {
  for (const depth of [0, 0.25, 0.5, 1]) {
    for (const shape of ['sine', 'sawtooth']) {
      let sum = 0;
      const N = 20000;
      for (let i = 0; i < N; i++) sum += at(shape, (i + 0.5) / N, depth);
      assert.ok(Math.abs(sum / N - (1 - depth / 2)) < 1e-3,
        `${shape} at depth ${depth} averaged ${sum / N}`);
    }
  }
});

function readAom({ modShape, modDepth = 1, chopDuty = 0.5, eff = 0.8 }) {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  const aom = createElement('aom', 200, 0);
  Object.assign(aom.params, { modulate: true, modShape, modDepth, chopDuty, eff, deflect: 8 });
  const detector = createElement('detector', 400, Math.round(200 * Math.tan(8 * Math.PI / 180)));
  detector.params.size = 40;
  traceAll([laser, aom, detector], []);
  return detectorReading(detector.id)?.signal;
}

test('each waveform delivers its own duty-averaged power', () => {
  // Square: efficiency times the on fraction.
  assert.ok(Math.abs(readAom({ modShape: 'square', chopDuty: 0.25 }) - 0.8 * 0.25) < 1e-9);
  // Continuous: efficiency times 1 - depth/2, and the on fraction is ignored.
  for (const modShape of ['sine', 'sawtooth']) {
    assert.ok(Math.abs(readAom({ modShape, modDepth: 1 }) - 0.8 * 0.5) < 1e-9, `${modShape} depth 1`);
    assert.ok(Math.abs(readAom({ modShape, modDepth: 0.5 }) - 0.8 * 0.75) < 1e-9, `${modShape} depth 0.5`);
    // Fully undriven modulation passes the whole diffracted order.
    assert.ok(Math.abs(readAom({ modShape, modDepth: 0 }) - 0.8) < 1e-9, `${modShape} depth 0`);
    assert.equal(readAom({ modShape, modDepth: 1, chopDuty: 0.25 }),
      readAom({ modShape, modDepth: 1, chopDuty: 0.75 }), `${modShape} must ignore the on fraction`);
  }
});

// An unrecognised shape on a sketch from the future must not silently become
// a ramp; square is the documented fallback.
test('an unknown waveform falls back to square', () => {
  assert.equal(readAom({ modShape: 'triangle', chopDuty: 0.25 }), 0.8 * 0.25);
  assert.equal(at('triangle', 0.75), 0);
});

// The symmetry knob a function generator puts on its ramp output: how much of
// the period is spent rising. 1 is the rising sawtooth, 0 the falling one,
// and 0.5 a triangle.
const ramp = (phase, symmetry) =>
  gateTransmissionAt({ opl: 0, frequencyMHz: 1, phaseNs: 0, shape: 'sawtooth', depth: 1, symmetry }, phase * 1000);

test('rise fraction sweeps the ramp from falling through triangular to rising', () => {
  // Rising: climbs across the whole period.
  assert.ok(Math.abs(ramp(0.25, 1) - 0.25) < 1e-9);
  assert.ok(Math.abs(ramp(0.75, 1) - 0.75) < 1e-9);
  // Falling: the mirror image.
  assert.ok(Math.abs(ramp(0.25, 0) - 0.75) < 1e-9);
  assert.ok(Math.abs(ramp(0.75, 0) - 0.25) < 1e-9);
  // Triangle: peaks at the half period and returns.
  assert.ok(Math.abs(ramp(0.5, 0.5) - 1) < 1e-9, 'triangle peaks mid-period');
  assert.ok(Math.abs(ramp(0.25, 0.5) - 0.5) < 1e-9);
  assert.ok(Math.abs(ramp(0.75, 0.5) - 0.5) < 1e-9);
  assert.ok(ramp(0, 0.5) < 1e-9 && ramp(0.999, 0.5) < 0.01, 'triangle starts and ends low');
});

test('an asymmetric ramp still peaks exactly at its rise fraction', () => {
  for (const symmetry of [0.2, 0.35, 0.8]) {
    assert.ok(Math.abs(ramp(symmetry, symmetry) - 1) < 1e-9, `peak at ${symmetry}`);
    assert.ok(ramp(symmetry / 2, symmetry) < 1, 'still climbing before the peak');
    assert.ok(ramp((symmetry + 1) / 2, symmetry) < 1, 'falling after it');
  }
});

// Sweeping the shape must not change how much light gets through, or the
// symmetry control would double as a brightness control.
test('rise fraction does not move the average transmission', () => {
  for (const symmetry of [0, 0.25, 0.5, 0.75, 1]) {
    let sum = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) sum += ramp((i + 0.5) / N, symmetry);
    assert.ok(Math.abs(sum / N - 0.5) < 1e-3, `symmetry ${symmetry} averaged ${sum / N}`);
  }
});

test('an omitted rise fraction keeps the plain rising sawtooth', () => {
  for (const phase of [0.1, 0.5, 0.9]) {
    assert.ok(Math.abs(ramp(phase, undefined) - phase) < 1e-9, 'defaults to rising');
  }
});
