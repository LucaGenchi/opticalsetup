// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Step G1 of the Physics in 2D track: the beam parameter a source starts,
// the in-plane ray-transfer matrix measured from the tracer with two
// companion rays, and the readouts and declines that follow
// (docs/physics/beam-propagation.md). The analytic matrices themselves are
// checked in validation/reference/beam_propagation.py.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { traceScene, detectorReading, beamAtPoint, beamTracksFromLastTrace } from '../sketch/js/raytrace.js';
import { sourceBeamParameter, noBeamReason, fiberBeamParameter, measuredMatrix, companionStarts, segmentGap } from '../sketch/js/beam-propagation.js';
import { beamFromQ, qFromWaist, transformQ, thinLensMatrix, freeSpaceMatrix, composeMatrices } from '../sketch/js/gaussian-beam.js';
import { gaussianBeam, thinLensFocus } from '../calculators/assets/gaussian-beam.js';
import { lp01 } from '../sketch/js/lp01.js';
import { beamRowsHTML } from '../sketch/js/inspector.js';
import { parseSketch } from '../sketch/js/state.js';

const make = (type, x, y, params = {}, rot = 0) => {
  const el = createElement(type, x, y);
  Object.assign(el.params, params);
  el.rot = rot;
  return el;
};
const laser = (params = {}) => make('cwlaser', 0, 0, { beamMode: 'beam', beamWidth: 2, wavelength: 1000, ...params });
const close = (a, b, tol, label = '') => assert.ok(Math.abs(a - b) <= tol, `${label} ${a} vs ${b}`);

test('G1: a laser drawn with a size starts its beam from its Beam width, waist at the output', () => {
  const beam = sourceBeamParameter('cwlaser', { beamMode: 'beam', beamWidth: 4, wavelength: 1064 });
  // The Beam width is the 1/e² diameter: the only size setting.
  assert.equal(beam.waistUm, 2000);
  assert.equal(beam.m2, 1);
  close(beam.q.re, 0, 0);
  close(beam.q.im, Math.PI * 4 / 1064e-6, 1e-6, 'z_R');
  // M² is the one beam setting a laser adds.
  const poor = sourceBeamParameter('pulsedlaser', { beamMode: 'beam', beamWidth: 4, wavelength: 800, beamM2: 1.3 });
  close(poor.q.im, Math.PI * 2 ** 2 / (1.3 * 800e-6), 1e-9, 'z_R with M²');
  // A simple line has none, and says how to get one.
  assert.equal(sourceBeamParameter('cwlaser', { beamMode: 'line', beamWidth: 4, wavelength: 532 }), null);
  assert.match(noBeamReason('cwlaser', { beamMode: 'line' }), /simple line/);
  assert.equal(noBeamReason('cwlaser', { beamMode: 'beam' }), null);
  // Sources without one spatial mode start none, each with its reason.
  for (const [type, why] of [['sclaser', /many wavelengths/], ['ledsource', /incoherent/], ['pointsource', /all directions/]]) {
    assert.equal(sourceBeamParameter(type, { beamMode: 'beam', beamWidth: 4, wavelength: 532 }), null, type);
    assert.match(noBeamReason(type, {}), why, type);
  }
  // Every laser offers M² alone, collapsed, defaulting to an ideal beam;
  // the old waist settings are gone.
  for (const type of ['cwlaser', 'pulsedlaser']) {
    const params = registry[type].params;
    assert.equal(params.find(p => p.key === 'beamHeading')?.open, false, `${type}: collapsed`);
    assert.ok(!params.some(p => p.key === 'beamWaistUm' || p.key === 'beamWaistPosMm'), type);
    const el = createElement(type, 0, 0);
    assert.equal(el.params.beamM2, 1);
    assert.match(params.find(p => p.key === 'beamParameter').readout(el.params), /^w₀ [0-9.]+ mm at the output \(1\/e², half the beam width\) · z_R [0-9.]+ m · θ [0-9.]+ mrad$/);
    // A beam of 0.1 mm can be drawn, so small waists need no other setting.
    assert.equal(params.find(p => p.key === 'beamWidth').min, 0.1);
  }
});

test('G1: a saved laser opens with the beam its width implies', () => {
  const saved = { version: 1, elements: [{ id: 'l1', type: 'cwlaser', x: 0, y: 0, rot: 0, params: { beamMode: 'beam', beamWidth: 6, wavelength: 633 } }], beams: [] };
  const scene = parseSketch(JSON.stringify(saved), registry);
  const el = scene.elements[0];
  assert.equal(el.params.beamM2, 1);
  assert.equal(sourceBeamParameter(el.type, el.params).waistUm, 3000);
});

test('G1: the measured matrix of free space and a thin lens is the analytic one', () => {
  traceScene([laser(), make('lens', 200, 0, { f: 100 })]);
  const [track] = beamTracksFromLastTrace();
  const m = track.q[1].matrix, expected = composeMatrices(freeSpaceMatrix(148), thinLensMatrix(100));
  for (const k of ['A', 'B', 'C', 'D']) close(m[k], expected[k], 1e-7, k);
  close(m.A * m.D - m.B * m.C, 1, 1e-9, 'determinant');
});

test('G1: the companions converge to the analytic matrix as their offset and tilt shrink', () => {
  // A tilted concave mirror: f = 100 mm met at 22.5°, in-plane focal length
  // f cos θ. A reflection negates the matrix in the app's basis.
  const fIn = 100 * Math.cos(22.5 * Math.PI / 180);
  const exact = composeMatrices(freeSpaceMatrix(148), thinLensMatrix(fIn));
  const errors = [];
  for (const scale of [10, 1, 0.1]) {
    traceScene([laser(), make('cmirror', 200, 0, { f: 100 }, 22.5)], [], { companionStep: { offsetMm: 1e-4 * scale, tiltRad: 1e-6 * scale } });
    const m = beamTracksFromLastTrace()[0].q[1].matrix;
    errors.push(Math.max(...['A', 'B', 'C', 'D'].map(k => Math.abs(-m[k] - exact[k]) / Math.max(1, Math.abs(exact[k])))));
  }
  assert.ok(errors[0] > errors[1] && errors[1] > errors[2], `shrinking: ${errors}`);
  // First order: ten times smaller step, about ten times smaller error.
  assert.ok(errors[0] / errors[1] > 7 && errors[1] / errors[2] > 7, `first order: ${errors}`);
  assert.ok(errors[1] < 1e-6, `default step: ${errors[1]}`);
});

test('G1: matrices from companion offsets, and the companion invariant', () => {
  // Built by hand: a companion displaced 1e-4 mm keeps its offset through
  // 100 mm of air; a tilted one walks off by 100 × 1e-6.
  const central = { p: { x: 100, y: 0 }, d: { x: 1, y: 0 } };
  const companions = companionStarts({ x: 0, y: 0 }, { x: 1, y: 0 });
  const moved = companions.map(c => ({ p: { x: c.p.x + 100 * c.d.x, y: c.p.y + 100 * c.d.y }, d: c.d }));
  const m = measuredMatrix(central, moved, 1, 1);
  close(m.A, 1, 1e-9); close(m.B, 100, 1e-6); close(m.C, 0, 1e-12); close(m.D, 1, 1e-9);
  // A companion travelling backwards is not following the central ray.
  assert.equal(measuredMatrix(central, [{ p: { x: 0, y: 0 }, d: { x: -1, y: 0 } }, moved[1]], 1, 1), null);
  // The segment helper used for clipping.
  const gap = segmentGap({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 2 }, { x: 5, y: 8 });
  close(gap.distance, 2, 1e-12); close(gap.along, 0.5, 1e-12);
});

test('G1: the readout follows the propagated waist, not the cone estimate, where they differ', () => {
  // The issue's cases: 100 µm at 1 µm, waist on an ideal thin lens.
  // The lens's measured matrix applied to that beam (a laser's own waist
  // sits at its output, 52 mm past the laser, here 0.1 mm before the lens).
  const waistAfter = (f, m2) => {
    traceScene([make('cwlaser', 147.9, 0, { beamMode: 'beam', beamWidth: 0.2, wavelength: 1000 }), make('lens', 200, 0, { f })]);
    const q = transformQ(qFromWaist({ waistUm: 100, wavelengthNm: 1000, m2, zMm: -0.1 }), beamTracksFromLastTrace()[0].q[1].matrix);
    return { waistUm: beamFromQ(q, { wavelengthNm: 1000, m2 }).waistUm, distanceMm: beamFromQ(q, { wavelengthNm: 1000, m2 }).waistAheadMm };
  };
  const longRange = waistAfter(1, 1);
  close(longRange.waistUm / (1e-3 * 1 / (Math.PI * 0.1) * 1e3), 1, 1e-3, 'meets λf/(πw) for z_R ≫ f');
  const equal = waistAfter(31.41592653589793, 1);
  close(equal.waistUm, 70.711, 5e-4, 'w0'); close(equal.distanceMm, 15.708, 5e-4, 'distance');
  const quality = waistAfter(15.707963267948966, 2);
  close(quality.waistUm, 70.711, 5e-4, 'w0 with M² = 2'); close(quality.distanceMm, 7.854, 5e-4, 'distance');
  // The cone estimate λf/(πw) would have said 50 µm here.
  assert.ok(Math.abs(quality.waistUm - 50) > 20);
  // Through the readout itself: a 0.2 mm beam width (a 100 µm waist at the
  // output) with M² = 2, the lens 0.1 mm on, against the q law by hand.
  traceScene([laser({ beamWidth: 0.2, beamM2: 2 }), make('lens', 52.1, 0, { f: 15.707963267948966 })]);
  const [read] = beamAtPoint(52.2, 0, 0.001);
  const byHand = beamFromQ(transformQ(qFromWaist({ waistUm: 100, wavelengthNm: 1000, m2: 2, zMm: 0.1 }), thinLensMatrix(15.707963267948966)), { wavelengthNm: 1000, m2: 2 });
  close(read.waistUm, byHand.waistUm, 1e-4, 'readout w0');
  close(read.waistAheadMm + 0.1, byHand.waistAheadMm, 1e-4, 'readout waist distance');
});

test('G1: every readout states the beam in the drawing plane, with the Gouy phase marked circular', () => {
  const detector = make('detector', 400, 0);
  traceScene([laser(), make('lens', 200, 0, { f: 100 }), detector]);
  const reading = detectorReading(detector.id);
  assert.equal(reading.scope.beam, 'plane');
  const [b] = reading.beam.branches;
  assert.equal(b.gouyScope, 'circular');
  // Gouy phase relative to the waist, atan(z/z_R), and w from q.
  const q = { re: -b.waistAheadMm, im: b.rayleighMm };
  close(b.gouyDeg, Math.atan2(q.re, q.im) * 180 / Math.PI, 1e-9, 'Gouy');
  close(b.radiusUm, b.waistUm * Math.hypot(1, q.re / q.im), 1e-6, 'w(z)');
  const rows = beamRowsHTML(reading.beam);
  assert.match(rows, /Beam radius w/);
  assert.match(rows, /in the drawing plane/);
  assert.match(rows, /assumes a circular beam/);
});

test('G1: a split gives each branch its own beam; branches that recombine are declined', () => {
  const t = make('detector', 400, 0), r = make('detector', 200, -200, {}, -90);
  traceScene([laser(), make('bs', 200, 0), t, r]);
  for (const d of [t, r]) {
    const beam = detectorReading(d.id).beam;
    assert.equal(beam.branches.length, 1);
    close(beam.branches[0].waistUm, 1000, 1e-6, 'unchanged waist');
    close(beam.branches[0].waistAheadMm, d === t ? -(400 - 52 - 19) : -(148 + 181), 1e-6, 'behind by the path');
  }
  // A Mach-Zehnder (fully reflecting cubes as fold mirrors): both arms
  // leave the second splitter along +x onto one detector.
  const out = make('detector', 420, -200, {}, 0);
  traceScene([laser(), make('bs', 200, 0), make('bs', 300, 0, { ratio: 0 }), make('bs', 200, -200, { ratio: 0 }), make('bs', 300, -200), out]);
  const beam = detectorReading(out.id)?.beam;
  assert.ok(beam, 'light arrives');
  assert.ok(beam.declined.some(d => /recombine/.test(d.reason)), JSON.stringify(beam));
});

test('G1: an element without a paraxial model stops the beam and is named', () => {
  const detector = make('detector', 400, 0);
  traceScene([laser(), make('diffuser', 200, 0), detector]);
  const beam = detectorReading(detector.id).beam;
  assert.equal(beam.branches.length, 0);
  assert.equal(beam.declined[0].element, registry.diffuser.label);
  assert.match(beam.declined[0].reason, /scatters the light into many directions, so the Gaussian beam is not followed past it/);
  // Before the diffuser the beam is still there.
  assert.ok(beamAtPoint(120, 0, 1)[0].waistUm > 0);
});

test('G1: an edge within 1.5 beam radii clips the beam and is declined', () => {
  const detector = make('detector', 400, 0);
  // A 2 mm beam (w = 1 mm): a block whose edge is 1.2 mm from the axis clips.
  traceScene([laser(), make('blocker', 200, 1.2 + 30, { w: 16, h: 60 }), detector]);
  const beam = detectorReading(detector.id).beam;
  assert.equal(beam.branches.length, 0);
  assert.match(beam.declined[0].reason, /clips the beam/);
  // 2 mm away it does not.
  traceScene([laser(), make('blocker', 200, 2 + 30, { w: 16, h: 60 }), detector]);
  assert.equal(detectorReading(detector.id).beam.branches.length, 1);
  // A lens smaller than the beam clips it at its own rim.
  traceScene([laser({ beamWidth: 10 }), make('lens', 200, 0, { f: 100, dia: 12 }), detector]);
  assert.match(detectorReading(detector.id).beam.declined[0].reason, /edge/);
});

test('G1: a focus steeper than the paraxial limit is declined', () => {
  const detector = make('detector', 300, 0);
  // w = 5 mm into f = 10 mm: far-field half-angle about 0.5 rad.
  traceScene([laser({ beamWidth: 10 }), make('lens', 200, 0, { f: 10, dia: 25.4 }), detector]);
  const beam = detectorReading(detector.id).beam;
  assert.ok(beam.declined.some(d => /paraxial limit/.test(d.reason)), JSON.stringify(beam));
});

test('G1: converted light starts no beam parameter; the unconverted pump keeps it', () => {
  const pump = make('detector', 400, 0);
  traceScene([laser({ wavelength: 1064 }), make('crystal', 200, 0, { convert: 'shg' }), pump]);
  const beam = detectorReading(pump.id).beam;
  assert.ok(beam.branches.some(b => b.wavelengthNm === 1064), 'pump keeps its beam');
  assert.ok(beam.declined.some(d => /converts the wavelength/.test(d.reason)), JSON.stringify(beam));
});

test('G1: a fiber output starts a beam from its mode where it is known', () => {
  // Step-index, set single-mode: the best Gaussian of LP01 at V.
  const fiber = { fiberModel: 'linear', inputNA: 0.12, singleModeCoreUm: 4 };
  const beam = fiberBeamParameter(fiber, 633, V => lp01(V).best.ratio);
  const V = 2 * Math.PI * 2e-3 * 0.12 / 633e-6;
  close(beam.V, V, 1e-9);
  close(beam.waistUm, lp01(V).best.ratio * 2, 1e-12);
  assert.equal(beam.mode, 'LP01');
  // Multimode at this wavelength, or no core set: declined, with the reason.
  assert.match(fiberBeamParameter({ ...fiber, singleModeCoreUm: 50 }, 633, V => lp01(V).best.ratio).issue, /more than one mode/);
  assert.match(fiberBeamParameter({ fiberModel: 'linear', inputNA: 0.12 }, 633, () => 1).issue, /no single-mode core is set/);
  // A hollow-core capillary: 0.64 of its core radius.
  close(fiberBeamParameter({ fiberModel: 'argon', coreDiameterUm: 250 }, 800, () => 1).waistUm, 80, 1e-12);
});

test('G1: the q law through a matrix keeps a beam, and refuses a non-beam', () => {
  const q = qFromWaist({ waistUm: 100, wavelengthNm: 1000 });
  const out = transformQ(q, thinLensMatrix(50));
  const b = beamFromQ(out, { wavelengthNm: 1000 });
  assert.ok(b.waistUm > 0 && b.waistAheadMm > 0);
  assert.equal(transformQ(q, { A: 0, B: 0, C: 0, D: 0 }), null);
  assert.equal(beamFromQ({ re: 1, im: -1 }, { wavelengthNm: 1000 }), null);
});

test('G1: the probe can show the Gaussian beam where it stands', () => {
  const probe = make('probe', 300, 0, { prop: 'beam' });
  const elements = [laser(), make('lens', 200, 0, { f: 100 }), probe];
  traceScene(elements);
  const svg = registry.probe.svg(probe, elements);
  assert.match(svg, /Beam radius w [0-9.]+ µm \(1\/e²\)/);
  assert.match(svg, /Wavefront (converging|diverging), R /);
  assert.match(svg, /Gaussian beam, in the drawing plane/);
  // One beam: no source name to decode.
  assert.doesNotMatch(svg, /Laser|CW laser/);
  // Just behind a diffuser, where the scattered central ray still passes
  // whatever direction the diffuser gave it.
  const behind = make('probe', 203, 0, { prop: 'beam', sampleDiameterMm: 2 });
  const blocked = [laser(), make('diffuser', 200, 0), behind];
  traceScene(blocked);
  const scattered = registry.probe.svg(behind, blocked);
  assert.match(scattered, /No Gaussian beam here/);
  assert.match(scattered, /scatters the light/);
  // Branches without a beam do not count as recombining.
  assert.doesNotMatch(scattered, /recombine/);
});

test('G1: a fiber relaunches a beam from its mode, not clipped by its own connector', () => {
  // A hollow-core capillary: its 80 µm beam (0.64 of a 125 µm core radius)
  // starts 0.1 mm past the end face, within 1.5 w of the connector's own
  // edges, which must not count as clipping it.
  const sketch = (fiber) => parseSketch(JSON.stringify({ version: 1, elements: [
    { id: 'L', type: 'cwlaser', x: 0, y: 0, rot: 0, params: { beamMode: 'beam', beamWidth: 2, wavelength: 1000 } },
    { id: 'lens', type: 'lens', x: 150, y: 0, rot: 0, params: { f: 100 } },
    { id: 'D', type: 'detector', x: 700, y: 0, rot: 0, params: {} },
  ], beams: [{ id: 'F', kind: 'fiber', pts: [{ x: 250, y: 0 }, { x: 400, y: 0 }], propagate: true, inputNA: 0.12, out1: { mode: 'diverge', na: 0.05 }, out0: { mode: 'diverge', na: 0.05 }, ...fiber }] }), registry);
  const hollow = sketch({ fiberModel: 'argon', coreDiameterUm: 250 });
  traceScene(hollow.elements, hollow.beams);
  let beam = detectorReading('D').beam;
  assert.deepEqual(beam.declined, []);
  close(beam.branches[0].waistUm, 80, 1e-9, 'HE11 Gaussian');
  assert.equal(beam.branches[0].sourceId, 'F');
  // A step-index fiber set single-mode: the LP01 Gaussian at V = 1.51.
  const single = sketch({ singleModeCoreUm: 4 });
  traceScene(single.elements, single.beams);
  beam = detectorReading('D').beam;
  const V = 2 * Math.PI * 2e-3 * 0.12 / 1e-3;
  close(beam.branches[0].waistUm, lp01(V).best.ratio * 2, 1e-9, 'LP01 Gaussian');
  // Without a core set, light that came in with a beam says why none leaves.
  const plain = sketch({});
  traceScene(plain.elements, plain.beams);
  assert.match(detectorReading('D').beam.declined[0].reason, /no single-mode core/);
  assert.equal(detectorReading('D').beam.declined[0].element, 'Fiber');
});

test('G1 (review): the probe declines where an edge between interactions clips the beam', () => {
  // A 2 mm beam (w = 1 mm); a block's edge 1.2 mm from the axis at x = 200.
  const elements = [laser(), make('blocker', 200, 31.2, { w: 16, h: 60 }), make('detector', 400, 0)];
  traceScene(elements);
  const [after] = beamAtPoint(300, 0, 1);
  assert.ok(after.issue, JSON.stringify(after));
  assert.match(after.issue.reason, /clips the beam/);
  // Before the block the beam is still read.
  const [before] = beamAtPoint(120, 0, 1);
  close(before.radiusUm, 1000, 1, 'w before the block');
});

test('G1 (review): a decline on the continuing ray holds from that interaction, not from the source', () => {
  // A transmitting sample with no channels has no paraxial model.
  const detector = make('detector', 400, 0);
  traceScene([laser(), make('sample', 200, 0, {}, 90), detector]);
  const [before] = beamAtPoint(120, 0, 1);
  assert.ok(!before.issue && before.radiusUm > 0, `before the sample: ${JSON.stringify(before)}`);
  const beam = detectorReading(detector.id)?.beam;
  assert.ok(beam?.declined.some(d => /specimen scatters and absorbs/.test(d.reason)), JSON.stringify(beam));
});

test('G1 (review): the beam a source starts is held to the paraxial limit', () => {
  // A 2 µm beam (below the 0.1 mm the inspector allows) has a 1 µm waist:
  // at 1 µm, θ = 318 mrad.
  const detector = make('detector', 300, 0);
  traceScene([make('cwlaser', 0, 0, { beamMode: 'beam', beamWidth: 0.002, wavelength: 1000 }), detector]);
  const beam = detectorReading(detector.id).beam;
  assert.equal(beam.branches.length, 0);
  assert.match(beam.declined[0].reason, /318 mrad, beyond the paraxial limit/);
  assert.equal(beam.declined[0].element, registry.cwlaser.label);
  assert.ok(beamAtPoint(200, 0, 1)[0].issue);
});

test('G1 (review): a thin lens inside a medium of index n bends the reduced slope by n/f', () => {
  // n = 1.5, w0 = 100 µm at 1 µm, waist on an f = 50 mm lens (Self's form:
  // z_R = π w0² n/λ = 47.12 mm, magnification 1/√(1 + (z_R/f)²)).
  const focus = thinLensFocus(gaussianBeam({ waistUm: 100, wavelengthNm: 1000, index: 1.5 }), 0, 50);
  close(focus.beam.waistUm, 72.7727, 5e-4, 'w0');
  close(focus.distanceMm, 23.5207, 5e-4, 'distance');
  const m = thinLensMatrix(50, 1.5);
  assert.equal(m.C, -1.5 / 50);
});

test('G1 (review): no readout writer can record while companions replay an interaction', async () => {
  // Every writer interact() can reach returns at once in companion mode.
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../sketch/js/raytrace.js', import.meta.url), 'utf8');
  for (const name of ['recordCompressor', 'recordMetalensHit', 'recordProbeBeam', 'recordOpo', 'recordMix', 'recordSrsNote',
    'recordSpecimenTiming', 'recordObjectivePupil', 'recordPhasePlateSpan', 'markIncompleteCoherence', 'noteWeakLightShortfall']) {
    const body = source.slice(source.indexOf(`function ${name}(`));
    const firstLines = body.split('\n').slice(1, 3).join('\n');
    assert.match(firstLines, /companionMode/, `${name} is guarded`);
  }
  // The inline writes in interact() too.
  for (const line of source.split('\n').filter(l => /(supercontinuumStates|opoStates)\.set\(/.test(l) && !/^function|^\s*if \(elementId\) opoStates/.test(l))) {
    assert.match(line, /companionMode/, line.trim());
  }
});

test('G1 (review): a probe just before a lens wide enough for the beam reads the beam', () => {
  // The lens ending the segment is not an edge ahead of the probe; its rim
  // (12.7 mm) is checked where the beam meets it.
  const detector = make('detector', 400, 0);
  traceScene([laser(), make('lens', 200, 0, { f: 100, dia: 25.4 }), detector]);
  for (const x of [198, 198.5, 199, 199.9]) {
    const [b] = beamAtPoint(x, 0, 0.001);
    assert.ok(!b.issue && b.radiusUm > 0, `at ${x} mm: ${JSON.stringify(b.issue)}`);
  }
  assert.equal(detectorReading(detector.id).beam.branches.length, 1);
  // A block that ends the beam is not reported as clipping it before it is reached.
  traceScene([laser(), make('blocker', 200, 0, { w: 16, h: 60 })]);
  assert.ok(!beamAtPoint(191.5, 0, 0.001)[0].issue, "0.5 mm before the block's face at 192 mm");
});

// Luca's manual check (round 5): a probe above the Mach-Zehnder of the test
// scene listed a beam of its dark port, and the probe on its output listed
// both arms while the detector there declined.
test('G1 (Luca): a dark interference port gives no beam, and a probe on an output agrees with the detector', () => {
  const laser633 = make('cwlaser', 0, 0, { beamMode: 'beam', beamWidth: 2, wavelength: 633 });
  const out = make('detector', 420, -100);
  const elements = [laser633, make('bs', 200, 0), make('bs', 300, 0), make('bs', 200, -100), make('bs', 300, -100), out];
  traceScene(elements);
  // The unused output travels up through x = 300 and carries no light.
  assert.deepEqual(beamAtPoint(300, -300, 5), []);
  const above = make('probe', 300, -300, { prop: 'beam' });
  assert.match(registry.probe.svg(above, [...elements, above]), /No light here/);
  // On the lit output both arms travel together: one decline, as the
  // detector's.
  const onOutput = beamAtPoint(360, -100, 5);
  assert.equal(onOutput.length, 1, JSON.stringify(onOutput));
  assert.match(onOutput[0].issue.reason, /recombine here/);
  assert.match(detectorReading(out.id).beam.declined[0].reason, /recombine here/);
});

test('G1 (Luca): separate spots of one source on one detector are read one by one', () => {
  // A splitter and a fold send two parallel beams 30 mm apart onto one wide
  // detector: they do not overlap, so each keeps its beam.
  const wide = make('detector', 400, -15, { aperture: 60 });
  traceScene([laser({ wavelength: 633 }), make('bs', 200, 0), make('bs', 200, -30, { ratio: 0 }), wide]);
  const beam = detectorReading(wide.id).beam;
  assert.equal(beam.branches.length, 2, JSON.stringify(beam));
  assert.deepEqual(beam.declined, []);
  // The card names them by colour, not by the laser's internal name.
  const html = beamRowsHTML(beam, () => 'Laser 5');
  assert.match(html, /Beam radius w · 633 nm/);
  assert.doesNotMatch(html, /Laser 5/);
});

test('G1: an ideal lens met far from its axis, where its model is not lossless, is declined', () => {
  // A collimated beam h above the axis leaves at θ = atan(h/f); the ideal
  // lens's matrix there has determinant cos³θ (0.4 % at h = 5 mm, 5.7 % at
  // 20 mm), against 1 for any lossless paraxial optic.
  const read = h => {
    const detector = make('detector', 260, h * 0.4, { aperture: 100 });
    traceScene([make('cwlaser', 0, h, { beamMode: 'beam', beamWidth: 2, wavelength: 633 }), make('lens', 200, 0, { f: 100, dia: 100 }), detector]);
    const m = beamTracksFromLastTrace()[0].q[1]?.matrix;
    return { beam: detectorReading(detector.id).beam, det: m && m.A * m.D - m.B * m.C };
  };
  const near = read(5);
  close(near.det, Math.cos(Math.atan(0.05)) ** 3, 1e-6, 'determinant cos³θ');
  assert.equal(near.beam.branches.length, 1);
  const far = read(20);
  assert.equal(far.beam.branches.length, 0);
  assert.match(far.beam.declined[0].reason, /too far from its axis for its ideal model: there it would change the beam quality by 5\.7 %/);
});

test('G1: a probe whose circle reaches past an optic reads the beam at the end of its segment', () => {
  // A probe 3 mm after a diffuser with a 10 mm circle also crosses the beam
  // that arrives: that beam is read where it meets the diffuser.
  traceScene([laser(), make('diffuser', 200, 0)]);
  const lit = beamAtPoint(203, 0, 5).find(b => !b.issue);
  const [atDiffuser] = (traceScene([laser()]), beamAtPoint(200, 0, 0.01));
  close(lit.radiusUm, atDiffuser.radiusUm, 1e-9, 'w at the diffuser');
});
