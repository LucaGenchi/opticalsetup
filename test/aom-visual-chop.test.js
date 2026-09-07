import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';

// Source -> AOM -> detector sitting on the diffracted order.
function bench({
  source = 'cwlaser', showPulse = true, beamMode = 'line',
  modulate = true, modShape = 'square', drawChopped = true,
  chopDuty = 0.5, zero = false, eff = 0.85, deflect = 8,
} = {}) {
  const laser = createElement(source, 0, 0);
  laser.params.beamMode = beamMode;
  if (beamMode === 'beam') laser.params.beamWidth = 6;
  if (source !== 'cwlaser') laser.params.showPulse = showPulse;
  const aom = createElement('aom', 200, 0);
  Object.assign(aom.params, { modulate, modShape, drawChopped, chopDuty, zero, eff, deflect });
  const detector = createElement('detector', 400, Math.round(200 * Math.tan(deflect * Math.PI / 180)));
  detector.params.size = 40;
  const drawables = traceAll([laser, aom, detector], []);
  return { drawables, dashes: drawables.filter(d => d.dash), signal: detectorReading(detector.id)?.signal };
}

// Where a dashed stroke's lit window opens, in mm along the beam. SVG shifts
// a dash pattern backwards by the offset, so the window starts at
// period - offset rather than at the offset itself.
const CHOP_PERIOD_MM = 14;
const litStart = d => (CHOP_PERIOD_MM - (d.dashOffset || 0)) % CHOP_PERIOD_MM;

test('a square-gated CW beam is drawn in chunks', () => {
  const { dashes } = bench();
  assert.equal(dashes.length, 1);
  // 14 mm schematic period split by the duty cycle, the same convention the
  // chopper uses for gated CW light.
  assert.equal(dashes[0].dash, '7.0 7.0');
});

test('the chunk pattern follows the on fraction', () => {
  assert.equal(bench({ chopDuty: 0.25 }).dashes[0].dash, '3.5 10.5');
  assert.equal(bench({ chopDuty: 0.75 }).dashes[0].dash, '10.5 3.5');
});

test('the flag turns the chunks off without touching anything else', () => {
  assert.equal(bench({ drawChopped: false }).dashes.length, 0);
});

// The continuous drives sweep the beam smoothly; there are no on/off edges to
// draw, and chunking them would claim a gating that is not happening.
test('only a square drive is chunked', () => {
  for (const modShape of ['sine', 'sawtooth']) {
    assert.equal(bench({ modShape }).dashes.length, 0, modShape);
    assert.equal(bench({ modShape, drawChopped: true }).dashes.length, 0, modShape);
  }
  assert.equal(bench({ modShape: 'square' }).dashes.length, 1);
});

test('an unmodulated AOM is never chunked', () => {
  assert.equal(bench({ modulate: false }).dashes.length, 0);
});

// Whether packets are on screen is live playback state -- the overlay is
// dropped in mechanics mode and whenever the time scale sits far from the
// pulse rate -- and the tracer cannot see any of it. So the flag alone
// decides, and a pulsed beam chunks in every case a CW one would. Making this
// conditional on `showPulse` is what hid the chunks from a pulsed source
// whose packets the canvas had already suppressed.
test('a pulsed beam is chunked whenever the flag asks for it', () => {
  assert.equal(bench({ source: 'pulsedlaser', showPulse: true }).dashes.length, 1);
  assert.equal(bench({ source: 'pulsedlaser', showPulse: false }).dashes.length, 1);
  assert.equal(bench({ source: 'pulsedlaser', showPulse: false, drawChopped: false }).dashes.length, 0);
  assert.equal(bench({ source: 'pulsedlaser', showPulse: true, drawChopped: false }).dashes.length, 0);
});

// Light returns to the zeroth order exactly while the RF is off, so the two
// orders are gated in opposition: one is lit wherever the other is dark.
test('the zeroth order is chunked in anti-phase with the diffracted one', () => {
  const { dashes } = bench({ zero: true });
  assert.equal(dashes.length, 2);
  const first = dashes.find(d => !d.dashOffset);
  const zeroth = dashes.find(d => d.dashOffset);
  assert.ok(first && zeroth, 'one order carries a dash offset and the other does not');
  // Complementary patterns: the on and off lengths swap.
  assert.equal(first.dash, '7.0 7.0');
  assert.equal(zeroth.dash, '7.0 7.0');
  // ...and the zeroth order's lit window starts where the diffracted one's
  // ends. A dash offset shifts the pattern backwards, so the window opens at
  // period - offset.
  assert.equal(litStart(zeroth), 7);
});

test('an uneven duty keeps the two orders exactly complementary', () => {
  for (const chopDuty of [0.25, 0.75]) {
    const { dashes } = bench({ zero: true, chopDuty });
    const first = dashes.find(d => !d.dashOffset);
    const zeroth = dashes.find(d => d.dashOffset);
    const [on, off] = first.dash.split(' ').map(Number);
    const [zeroOn, zeroOff] = zeroth.dash.split(' ').map(Number);
    // The diffracted order is lit for `on`; the zeroth for the rest.
    assert.ok(Math.abs(zeroOn - off) < 1e-9, `duty ${chopDuty}: on windows must swap`);
    assert.ok(Math.abs(zeroOff - on) < 1e-9, `duty ${chopDuty}: off windows must swap`);
    // The zeroth order's lit window begins exactly where the diffracted one
    // stops, which is what puts the two beams in opposition rather than
    // merely giving them complementary lengths.
    assert.ok(Math.abs(litStart(zeroth) - on) < 1e-9, `duty ${chopDuty}: wrong phase`);
  }
});

// The flag must not move a reading, and a detector placed directly in the
// beam cannot prove that: measurement surfaces deliberately retain rays below
// the weak-branch floor (LOW_POWER_MEASUREMENT_SURFACES), so a branch that
// would be culled at an ordinary optic still lands on them. An earlier cut
// split the zeroth order into a residual plus the light returned during the
// off phase; at efficiency 0.99 the residual fell under MIN_INT and was
// dropped by any lens in the way, so enabling a *drawing* flag changed the
// detector from 0.505 to 0.495. Route through a real optic to catch that.
test('chunking cannot move a reading taken through downstream optics', () => {
  for (const eff of [0.3, 0.85, 0.99, 1]) {
    const read = drawChopped => {
      const laser = createElement('cwlaser', 0, 0);
      laser.params.beamMode = 'line';
      const aom = createElement('aom', 200, 0);
      Object.assign(aom.params, {
        modulate: true, modShape: 'square', zero: true, eff, chopDuty: 0.5, deflect: 8, drawChopped,
      });
      const lens = createElement('lens', 400, 0);
      const detector = createElement('detector', 600, 0);
      detector.params.size = 60;
      traceAll([laser, aom, lens, detector], []);
      return detectorReading(detector.id)?.signal;
    };
    const on = read(true);
    assert.equal(on, read(false), `efficiency ${eff}: the drawing flag moved the reading`);
    assert.ok(Math.abs(on - (1 - eff * 0.5)) < 1e-9,
      `efficiency ${eff}: zeroth order should read 1 - eff*duty, got ${on}`);
  }
});

// A pulsed source splits the zeroth order into two branches for the pulse
// calculation -- a residual present while the RF is on, and the diffracted
// light returned while it is off -- but they draw as one beam on one path. If
// only the gated branch is chunked, the residual keeps drawing a solid stroke
// through the gaps and the zeroth order never goes dark, contradicting the
// opposition the whole feature is for.
test('every branch of a pulsed zeroth order is chunked, leaving no solid stroke', () => {
  const paths = drawables => drawables.filter(d => d.type === 'path');
  for (const eff of [0.5, 0.85]) {
    const build = drawChopped => {
      const laser = createElement('pulsedlaser', 0, 0);
      laser.params.beamMode = 'line';
      const aom = createElement('aom', 200, 0);
      Object.assign(aom.params, {
        modulate: true, modShape: 'square', zero: true, eff, chopDuty: 0.5, deflect: 8, drawChopped,
      });
      return traceAll([laser, aom], []);
    };
    const on = build(true);
    const off = build(false);
    // The flag adds no strokes and removes none -- it only dashes them.
    assert.equal(paths(on).length, paths(off).length, `efficiency ${eff}: stroke count changed`);
    assert.equal(paths(off).filter(d => d.dash).length, 0);
    // Diffracted order, plus both branches of the zeroth.
    assert.equal(paths(on).filter(d => d.dash).length, 3, `efficiency ${eff}: a branch was left solid`);
    // Both zeroth-order branches must share the anti-phase offset, or they
    // would chunk against each other instead of against the diffracted order.
    const offsets = paths(on).filter(d => d.dash).map(d => d.dashOffset || 0).sort();
    assert.deepEqual(offsets, [0, 7, 7], `efficiency ${eff}: branches disagree on phase`);
  }
});

// Both orders together still carry the whole beam, chunks or not.
test('the two orders sum to the incident power', () => {
  for (const [eff, chopDuty] of [[0.85, 0.5], [1, 0.5], [0.6, 0.25], [0.3, 0.75]]) {
    const laser = createElement('cwlaser', 0, 0);
    laser.params.beamMode = 'line';
    const aom = createElement('aom', 200, 0);
    Object.assign(aom.params, { modulate: true, modShape: 'square', zero: true, eff, chopDuty, deflect: 8 });
    const diffracted = createElement('detector', 400, Math.round(200 * Math.tan(8 * Math.PI / 180)));
    const straight = createElement('detector', 400, 0);
    diffracted.params.size = 40;
    straight.params.size = 40;
    traceAll([laser, aom, diffracted, straight], []);
    const first = detectorReading(diffracted.id).signal;
    const zeroth = detectorReading(straight.id).signal;
    assert.ok(Math.abs(first - eff * chopDuty) < 1e-9, `eff ${eff} duty ${chopDuty}: diffracted power`);
    assert.ok(Math.abs(zeroth - (1 - eff * chopDuty)) < 1e-9, `eff ${eff} duty ${chopDuty}: zeroth power`);
    assert.ok(Math.abs(first + zeroth - 1) < 1e-9,
      `eff ${eff} duty ${chopDuty}: orders summed to ${first + zeroth}, not 1`);
  }
});

// The whole point of the flag being a drawing hint: it must not move a number.
test('chunking changes no traced power and no detector reading', () => {
  for (const source of ['cwlaser', 'pulsedlaser']) {
    const on = bench({ source, drawChopped: true });
    const off = bench({ source, drawChopped: false });
    assert.equal(on.signal, off.signal, `${source} detector reading moved`);
    assert.ok(on.signal > 0, `${source} should reach the detector at all`);
    // Efficiency times the duty cycle: the duty-averaged power a detector
    // with no temporal resolution sees, chunks drawn or not.
    assert.ok(Math.abs(on.signal - 0.85 * 0.5) < 1e-9, `${source} lost its duty-averaged power`);
  }
});

test('a sized beam chunks its envelope as well as dashing its edges', () => {
  const wide = bench({ beamMode: 'beam' });
  const plain = bench({ beamMode: 'beam', drawChopped: false });
  // Both edge rays of the diffracted order carry the dash...
  assert.equal(wide.dashes.length, 2);
  assert.equal(plain.dashes.length, 0);
  // ...and chopStrip cuts the filled envelope between them into separate
  // quads, so the chunks read as chunks at any beam width.
  const strips = d => d.drawables.filter(x => x.type === 'poly').length;
  assert.ok(strips(wide) > strips(plain),
    `chunked beam should add strips (${strips(wide)} vs ${strips(plain)})`);
});

test('the control is offered only where it means something', () => {
  const spec = registry.aom.params.find(p => p.key === 'drawChopped');
  assert.equal(spec.def, true);
  assert.ok(!spec.show({ modulate: false, modShape: 'square' }), 'hidden with no modulation');
  assert.ok(spec.show({ modulate: true, modShape: 'square' }), 'shown for a square gate');
  for (const modShape of ['sine', 'sawtooth']) {
    assert.ok(!spec.show({ modulate: true, modShape }), `hidden for a ${modShape} drive`);
  }
});

// On fraction belongs to the square drive alone; the continuous shapes are
// described by a depth instead. Offering both at once was the confusion.
test('each waveform offers only the control that describes it', () => {
  const duty = registry.aom.params.find(p => p.key === 'chopDuty');
  const depth = registry.aom.params.find(p => p.key === 'modDepth');
  assert.ok(duty.show({ modulate: true, modShape: 'square' }));
  assert.ok(!depth.show({ modulate: true, modShape: 'square' }));
  for (const modShape of ['sine', 'sawtooth']) {
    assert.ok(!duty.show({ modulate: true, modShape }), `${modShape} has no on fraction`);
    assert.ok(depth.show({ modulate: true, modShape }), `${modShape} is set by depth`);
  }
  const shape = registry.aom.params.find(p => p.key === 'modShape');
  assert.deepEqual(shape.options.map(o => o[0]), ['square', 'sine', 'sawtooth']);
  assert.deepEqual(shape.options.map(o => o[1]), ['Square', 'Sine', 'Sawtooth']);
});

// Saved sketches predate the flag and have no `drawChopped` key at all; the
// surface reads `!== false`, so they pick up the chunked drawing rather than
// silently falling to the off state.
test('a sketch saved before the flag existed still chunks', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  const aom = createElement('aom', 200, 0);
  Object.assign(aom.params, { modulate: true, modShape: 'square', deflect: 8 });
  delete aom.params.drawChopped;
  const dashes = traceAll([laser, aom], []).filter(d => d.dash);
  assert.equal(dashes.length, 1);
});
