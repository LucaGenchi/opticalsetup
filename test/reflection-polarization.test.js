// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Polarization at reflections (step A2 of the Physics in 2D track). Each case
// is traced by the app and compared with the field itself, followed through
// the same optics as an explicit three-dimensional vector: a mirror is a
// perfect conductor, E_r = −E + 2(E·n)n; a waveplate delays the field along
// its slow axis by e^(+iδ) (the field is Re{E exp(−iωt)}); a polarizer keeps
// the field along its axis. None of this uses the app's Mueller matrices.
//
// The basis is the one in docs/model-details.md: ŝ points out of the screen,
// p̂ = ŝ × k̂, and an element's axis angle is measured from p̂ towards ŝ for
// light crossing it along its own forward direction (local +x).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';
import { rotPt } from '../sketch/js/util.js';

const D2R = Math.PI / 180;

// ---------------------------------------------------------------- the field

// Complex numbers and complex three-vectors, physical axes: X right, Y up on
// the screen, Z out of it. The canvas's y axis points down.
const c = (re, im = 0) => ({ re, im });
const cadd = (a, b) => c(a.re + b.re, a.im + b.im);
const cmul = (a, b) => c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cscale = (a, k) => c(a.re * k, a.im * k);
const cabs2 = a => a.re * a.re + a.im * a.im;
const physical = v => [v.x, -v.y, 0];
const Z = [0, 0, 1];
const dotRe = (E, v) => E.reduce((sum, e, i) => cadd(sum, cscale(e, v[i])), c(0));
const along = (amplitude, v) => v.map(x => cscale(amplitude, x));
const vadd = (A, B) => A.map((a, i) => cadd(a, B[i]));
const pHat = k => [-k[1], k[0], 0]; // ŝ × k̂ with ŝ = Z

const forwardOf = rot => physical(rotPt(1, 0, rot));
const axisOf = (rot, axisDeg) => {
  const p = pHat(forwardOf(rot)), a = axisDeg * D2R;
  return p.map((x, i) => x * Math.cos(a) + Z[i] * Math.sin(a));
};

// A field travelling along canvas direction d with the app's linear angle.
const linearField = (angleDeg, d) => {
  const k = physical(d), p = pHat(k), a = angleDeg * D2R;
  return { E: vadd(along(c(Math.cos(a)), p), along(c(Math.sin(a)), Z)), k };
};

const mirror = ({ E, k }, rot, amplitude = 1) => {
  const n = forwardOf(rot);
  const kn = k.reduce((sum, x, i) => sum + x * n[i], 0);
  const kOut = k.map((x, i) => x - 2 * kn * n[i]);
  const En = dotRe(E, n);
  return { E: E.map((e, i) => cscale(cadd(cscale(e, -1), cscale(En, 2 * n[i])), amplitude)), k: kOut };
};

const waveplate = ({ E, k }, rot, axisDeg, retardanceDeg) => {
  const f = axisOf(rot, axisDeg);
  const slow = [k[1] * f[2] - k[2] * f[1], k[2] * f[0] - k[0] * f[2], k[0] * f[1] - k[1] * f[0]];
  const delay = c(Math.cos(retardanceDeg * D2R), Math.sin(retardanceDeg * D2R));
  return { E: vadd(along(dotRe(E, f), f), along(cmul(delay, dotRe(E, slow)), slow)), k };
};

const polarizer = ({ E, k }, rot, axisDeg) => {
  const a = axisOf(rot, axisDeg);
  return { E: along(dotRe(E, a), a), k };
};

const stokesOf = ({ E, k }) => {
  const Ep = dotRe(E, pHat(k)), Es = dotRe(E, Z);
  const I = cabs2(Ep) + cabs2(Es);
  const cross = cmul(Ep, c(Es.re, -Es.im));
  return { I, s1: (cabs2(Ep) - cabs2(Es)) / I, s2: 2 * cross.re / I, s3: 2 * cross.im / I };
};

// ---------------------------------------------------------------- the app

function make(type, x, y, params = {}, rot = 0) {
  const element = createElement(type, x, y);
  Object.assign(element.params, params);
  element.rot = rot;
  return element;
}

function reading(elements, detector) {
  traceAll(elements);
  return detectorReading(detector.id);
}

const laserPower = pol => {
  const laser = make('cwlaser', 0, 0, { pol });
  const detector = make('detector', 300, 0);
  return reading([laser, detector], detector).signal;
};

function close(actual, expected, label, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
}

function assertStokes(read, field, label) {
  const expected = stokesOf(field);
  for (const key of ['s1', 's2', 's3']) close(read.normalizedStokes[key], expected[key], `${label} ${key}`);
}

// ---------------------------------------------------------------- the cases

test('A2 case 1: a mirror turns diagonal light to the other diagonal before a polarizer', () => {
  const P0 = laserPower(45);
  for (const axis of [45, 135]) {
    const laser = make('cwlaser', 0, 0, { pol: 45 });
    const fold = make('mirror', 200, 0, {}, -45);
    const analyzer = make('polarizer', 200, 120, { pangle: axis }, 90);
    const detector = make('detector', 200, 240, {}, 90);
    const read = reading([laser, fold, analyzer, detector], detector);
    let field = linearField(45, { x: 1, y: 0 });
    field = mirror(field, -45);
    field = polarizer(field, 90, axis);
    const expected = stokesOf(field).I * P0;
    close(read?.signal ?? 0, expected, `analyzer at ${axis}°`, 1e-9 * P0);
  }
});

test('A2 case 2: circular light changes handedness at each mirror', () => {
  // Right circular from a quarter-wave plate, then one fold, then a second.
  const start = () => {
    let field = linearField(0, { x: 1, y: 0 });
    return waveplate(field, 0, 45, 90);
  };
  const laser = () => make('cwlaser', 0, 0, { pol: 0 });
  const qwp = () => make('qwp', 120, 0, { a: 45 });

  const direct = make('detector', 300, 0);
  const read0 = reading([laser(), qwp(), direct], direct);
  assertStokes(read0, start(), 'no mirror');
  assert.equal(read0.polarization, 'Right circular');

  const once = make('detector', 250, 200, {}, 90);
  const read1 = reading([laser(), qwp(), make('mirror', 250, 0, {}, -45), once], once);
  assertStokes(read1, mirror(start(), -45), 'one mirror');
  assert.equal(read1.polarization, 'Left circular');

  const twice = make('detector', 450, 200);
  const read2 = reading([laser(), qwp(), make('mirror', 250, 0, {}, -45), make('mirror', 250, 200, {}, -45), twice], twice);
  assertStokes(read2, mirror(mirror(start(), -45), -45), 'two mirrors');
  assert.equal(read2.polarization, 'Right circular');
});

test('A2 case 3: the double pass through a PBS and a quarter-wave plate still sends all the light to the other port', () => {
  const P0 = laserPower(0);
  const laser = make('cwlaser', 0, 0, { pol: 0 });
  const pbs = make('pbs', 200, 0);
  const qwp = make('qwp', 300, 0, { a: 45 });
  const end = make('mirror', 400, 0);
  const detector = make('detector', 200, 150, {}, 90);
  const read = reading([laser, pbs, qwp, end, detector], detector);
  // Out through the plate, back off the mirror, back through the plate.
  let field = linearField(0, { x: 1, y: 0 });
  field = waveplate(field, 0, 45, 90);
  field = mirror(field, 0);
  field = waveplate(field, 0, 45, 90);
  const s = stokesOf(field);
  close(s.s1, -1, 'the returning light is s-polarized');
  close(read.signal, P0, 'the PBS reflects all of it', 1e-9 * P0);
});

test('A2 case 4: a quarter-wave plate with its fast axis at 45° makes linear 0° light right circular', () => {
  const laser = make('cwlaser', 0, 0, { pol: 0 });
  const qwp = make('qwp', 120, 0, { a: 45 });
  const detector = make('detector', 300, 0);
  const read = reading([laser, qwp, detector], detector);
  const field = waveplate(linearField(0, { x: 1, y: 0 }), 0, 45, 90);
  close(stokesOf(field).s3, 1, 'the field turns clockwise seen looking towards the source');
  assertStokes(read, field, 'anchor');
  assert.equal(read.polarization, 'Right circular');
});

test('A2 case 5: diagonal light returned by one mirror and by two folds reads as mirror images', () => {
  const P0 = laserPower(45);
  const common = () => [
    make('cwlaser', 0, 0, { pol: 45 }),
    make('bs', 200, 0),
    make('polarizer', 200, 100, { pangle: 45 }, 90),
  ];
  const detector = () => make('detector', 200, 200, {}, 90);
  const after = (field, returns) => {
    let f = returns(field);
    f = mirror(f, -45, Math.SQRT1_2); // the beamsplitter's reflection, half the power
    f = polarizer(f, 90, 45);
    return stokesOf(f).I * 0.5 * P0; // and half the power was transmitted on the way out
  };
  const start = () => linearField(45, { x: 1, y: 0 });

  const d1 = detector();
  const normal = reading([...common(), make('mirror', 350, 0), d1], d1)?.signal ?? 0;
  const expectedNormal = after(start(), f => mirror(f, 0));

  const d2 = detector();
  const roof = reading([...common(), make('mirror', 350, 0, { length: 10 }, -45), make('mirror', 350, 8, { length: 10 }, 45), d2], d2)?.signal ?? 0;
  const expectedRoof = after(start(), f => mirror(mirror(f, -45), 45));

  close(normal, expectedNormal, 'one mirror at normal incidence', 1e-9 * P0);
  close(roof, expectedRoof, 'two 45° folds', 1e-9 * P0);
  assert.ok(Math.abs(expectedNormal - expectedRoof) > 0.1 * P0, 'the two returns differ');
});
