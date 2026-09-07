import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry, compressorFinalState, formatGdd } from '../sketch/js/elements.js';
import { traceAll, compressorGddReading } from '../sketch/js/raytrace.js';

const row = key => registry.pulsecompressor.params.find(p => p.key === key);
const GDD_IN = row('gddIn');
const GDD_OUT = row('gddOut');
const STATE = row('gddState');

// A pulsed source, an optional upstream GDD, and the compressor under test.
function scene({ upstream = null, applied = 0 } = {}) {
  const source = createElement('pulsedlaser', 0, 0);
  source.params.beamMode = 'line';
  const elements = [source];
  if (upstream === 'rod') {
    const rod = createElement('glassrod', 120, 0);
    rod.params.material = 'nbk7';
    elements.push(rod);
  } else if (Number.isFinite(upstream)) {
    const pre = createElement('pulsecompressor', 200, 0);
    pre.params.gddFs2 = upstream;
    elements.push(pre);
  }
  const target = createElement('pulsecompressor', 320, 0);
  target.params.gddFs2 = applied;
  elements.push(target);
  traceAll(elements, []);
  return {
    target,
    reading: compressorGddReading(target.id),
    in: GDD_IN.readout(target.params, target),
    out: GDD_OUT.readout(target.params, target),
    state: STATE.readout(target.params, target),
  };
}

// The original defect: the recommendation subtracted the compressor's own
// setting from an arrival that never included it. That double-count is gone
// along with the row, but the invariant underneath it is what mattered --
// what a compressor reports as arriving must not move when you change what
// the compressor itself applies.
test('GDD at input is what arrives, independent of this compressor own setting', () => {
  const arrivals = [-2000, 0, 2000, -10000].map(applied => scene({ upstream: 4000, applied }).in);
  assert.equal(new Set(arrivals).size, 1, `input should be constant, got ${arrivals.join(', ')}`);
  assert.equal(arrivals[0], '4,000');
});

test('GDD at output is the arrival plus what this element applies', () => {
  for (const applied of [-6000, -4000, 0, 4000]) {
    const s = scene({ upstream: 4000, applied });
    assert.equal(Math.round(s.reading.outgoing), 4000 + applied);
    assert.equal(s.out, formatGdd(4000 + applied));
  }
});

// Driving the output negative is a destination, not an overshoot: pre-chirping
// a pulse so it arrives transform-limited after a downstream objective is an
// ordinary reason to use a compressor. The state row has to say so.
test('final state names the side of zero the pulse leaves on', () => {
  assert.match(scene({ upstream: 4000, applied: -2000 }).state, /^Positive dispersion/);
  assert.match(scene({ upstream: 4000, applied: -6000 }).state, /^Negative dispersion/);
  assert.match(scene({ upstream: 4000, applied: 4000 }).state, /^Positive dispersion/);
});

test('crossing the null reports the upstream chirp cancelled and the opposite one applied', () => {
  const s = scene({ upstream: 4000, applied: -6000 });
  assert.equal(s.in, '4,000');
  assert.equal(s.out, '-2,000');
  assert.equal(s.state,
    'Negative dispersion — the upstream positive GDD is completely cancelled and a negative chirp is applied');

  // Symmetric: an upstream negative chirp overcompensated back into positive.
  const back = scene({ upstream: -8000, applied: 12000 });
  assert.equal(back.state,
    'Positive dispersion — the upstream negative GDD is completely cancelled and a positive chirp is applied');
});

test('the exact null claims no sign, on either side of the boundary', () => {
  assert.equal(scene({ upstream: 4000, applied: -4000 }).state, 'Cancelled — no net chirp left');
  assert.match(scene({ upstream: 4000, applied: -4001 }).state, /^Negative dispersion/);
  assert.match(scene({ upstream: 4000, applied: -3999 }).state, /^Positive dispersion/);
});

// Nothing upstream: no magnitude to compare against, but the sign is the
// whole point -- this is the pre-compensation case.
test('a compressor with nothing upstream reports pre-compensation, not a cancellation', () => {
  const pre = scene({ applied: -2000 });
  assert.equal(pre.reading.incoming, 0);
  assert.equal(pre.in, '0.0');
  assert.equal(pre.out, '-2,000');
  assert.match(pre.state, /^Negative dispersion — nothing upstream to cancel/);

  assert.match(scene({ applied: 2000 }).state, /^Positive dispersion — applied by this element alone/);
  assert.equal(scene({ applied: 0 }).state, 'No chirp');
});

test('a compressor that changes nothing says so rather than claiming a cancellation', () => {
  assert.match(scene({ upstream: 4000, applied: 0 }).state, /passed through unchanged$/);
});

// Negating a zero arrival is where JavaScript's negative zero leaks into the
// UI: (-0).toLocaleString() is "-0". No readout may ever print it.
test('no readout prints a negative zero', () => {
  assert.equal(formatGdd(-0), '0.0');
  assert.equal(formatGdd(0), '0.0');
  assert.equal(formatGdd(-0.4), '-0.4');
  for (const applied of [0, -2000, 2000]) {
    const s = scene({ applied });
    for (const value of [s.in, s.out]) assert.doesNotMatch(value, /^-0$/);
  }
});

test('non-finite readings degrade to a dash rather than NaN', () => {
  assert.equal(formatGdd(NaN), '—');
  assert.equal(formatGdd(Infinity), '—');
  assert.equal(compressorFinalState({ incoming: NaN, outgoing: 0 }), '—');
  assert.equal(compressorFinalState({ incoming: 0, outgoing: Infinity }), '—');
});

test('the readouts say so before any pulse has crossed the element', () => {
  const fresh = createElement('pulsecompressor', 0, 0);
  assert.equal(GDD_IN.readout(fresh.params, fresh), 'No pulse through it yet');
  assert.equal(GDD_OUT.readout(fresh.params, fresh), '—');
  assert.equal(STATE.readout(fresh.params, fresh), '—');
});
