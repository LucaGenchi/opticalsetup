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

// A sinusoidal drive dims the beam smoothly; there are no on/off edges to
// draw, and chunking it would claim a gating that is not happening.
test('a sinusoidal drive is never chunked', () => {
  assert.equal(bench({ modShape: 'sine' }).dashes.length, 0);
  assert.equal(bench({ modShape: 'sine', drawChopped: true }).dashes.length, 0);
});

test('an unmodulated AOM is never chunked', () => {
  assert.equal(bench({ modulate: false }).dashes.length, 0);
});

// A pulse train animates its own packets being gated. Drawing chunks as well
// would describe the same modulation twice, so the chunks wait until the
// packet overlay is switched off.
test('a pulsed beam is chunked only once its packets are hidden', () => {
  assert.equal(bench({ source: 'pulsedlaser', showPulse: true }).dashes.length, 0);
  assert.equal(bench({ source: 'pulsedlaser', showPulse: false }).dashes.length, 1);
  assert.equal(bench({ source: 'pulsedlaser', showPulse: false, drawChopped: false }).dashes.length, 0);
});

// The zeroth order is only ever partially depleted -- it drops to 1-efficiency
// while the RF is on rather than to zero -- so drawing it as hard on/off
// chunks would overstate its modulation.
test('only the diffracted order is chunked, never the zeroth', () => {
  const { dashes } = bench({ zero: true });
  assert.equal(dashes.length, 1);
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
  assert.ok(!spec.show({ modulate: true, modShape: 'sine' }), 'hidden for a sinusoidal drive');
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
