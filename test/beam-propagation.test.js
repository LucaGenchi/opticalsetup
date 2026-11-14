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
import { sourceBeamParameter, fiberBeamParameter, measuredMatrix, companionStarts, segmentGap } from '../sketch/js/beam-propagation.js';
import { beamFromQ, qFromWaist, transformQ, thinLensMatrix, freeSpaceMatrix, composeMatrices } from '../sketch/js/gaussian-beam.js';
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
  assert.equal(beam.waistUm, 2000);
  assert.equal(beam.waistPosMm, 0);
  assert.equal(beam.m2, 1);
  assert.equal(beam.derived, true);
  close(beam.q.re, 0, 0);
  close(beam.q.im, Math.PI * 4 / 1064e-6, 1e-6, 'z_R');
  // The three settings override it; the waist position is after the output.
  const set = sourceBeamParameter('pulsedlaser', { beamMode: 'beam', beamWidth: 4, wavelength: 800, beamWaistUm: 50, beamWaistPosMm: 120, beamM2: 1.3 });
  assert.equal(set.derived, false);
  close(set.q.re, -120, 1e-12, 'at the output, 120 mm before the waist');
  close(set.q.im, Math.PI * 0.05 ** 2 / (1.3 * 800e-6), 1e-9, 'z_R with M²');
  // A simple line has a beam parameter only when its waist is set.
  assert.equal(sourceBeamParameter('cwlaser', { beamMode: 'line', beamWidth: 4, wavelength: 532 }), null);
  assert.ok(sourceBeamParameter('cwlaser', { beamMode: 'line', wavelength: 532, beamWaistUm: 300 }));
  // Sources without a defined spatial mode start none.
  for (const type of ['sclaser', 'ledsource', 'pointsource']) assert.equal(sourceBeamParameter(type, { beamMode: 'beam', beamWidth: 4, wavelength: 532 }), null, type);
  // Every laser offers the settings, collapsed, defaulting to today's beam.
  for (const type of ['cwlaser', 'pulsedlaser']) {
    const params = registry[type].params;
    assert.equal(params.find(p => p.key === 'beamHeading')?.open, false, `${type}: collapsed`);
    const el = createElement(type, 0, 0);
    assert.equal(el.params.beamWaistUm, 0);
    assert.equal(el.params.beamWaistPosMm, 0);
    assert.equal(el.params.beamM2, 1);
  }
});

test('G1: a saved laser without the new settings opens with the beam its width implies', () => {
  const saved = { version: 1, elements: [{ id: 'l1', type: 'cwlaser', x: 0, y: 0, rot: 0, params: { beamMode: 'beam', beamWidth: 6, wavelength: 633 } }], beams: [] };
  const scene = parseSketch(JSON.stringify(saved), registry);
  const el = scene.elements[0];
  assert.equal(el.params.beamWaistUm, 0);
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
  const waistAfter = (f, m2) => {
    traceScene([laser({ beamWaistUm: 100, beamWaistPosMm: 148, beamM2: m2 }), make('lens', 200, 0, { f })]);
    const [after] = beamAtPoint(200.01, 0, 0.001);
    return { waistUm: after.waistUm, distanceMm: after.waistAheadMm + 0.01 };
  };
  const longRange = waistAfter(1, 1);
  close(longRange.waistUm / (1e-3 * 1 / (Math.PI * 0.1) * 1e3), 1, 1e-3, 'meets λf/(πw) for z_R ≫ f');
  const equal = waistAfter(31.41592653589793, 1);
  close(equal.waistUm, 70.711, 5e-4, 'w0'); close(equal.distanceMm, 15.708, 5e-4, 'distance');
  const quality = waistAfter(15.707963267948966, 2);
  close(quality.waistUm, 70.711, 5e-4, 'w0 with M² = 2'); close(quality.distanceMm, 7.854, 5e-4, 'distance');
  // The cone estimate λf/(πw) would have said 50 µm here.
  assert.ok(Math.abs(quality.waistUm - 50) > 20);
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
  assert.match(beam.declined[0].reason, /no paraxial model/);
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
  assert.match(fiberBeamParameter({ fiberModel: 'linear', inputNA: 0.12 }, 633, () => 1).issue, /no single-mode core/);
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
  assert.match(svg, /w [0-9.]+ µm/);
  assert.match(svg, /in the drawing plane/);
  // Just behind a diffuser, where the scattered central ray still passes
  // whatever direction the diffuser gave it.
  const behind = make('probe', 202, 0, { prop: 'beam' });
  const blocked = [laser(), make('diffuser', 200, 0), behind];
  traceScene(blocked);
  assert.match(registry.probe.svg(behind, blocked), /not propagated/);
});
