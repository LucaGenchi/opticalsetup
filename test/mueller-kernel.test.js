// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The Mueller and Jones kernel (step A1 of the Physics in 2D track): the
// functions that now delegate to it give the results they gave before, the
// closed-form matrices agree with the Jones matrices that define the app's
// conventions, and the edges return null rather than non-finite numbers.
// Step A2 changed the retardance sign and added the reciprocal matrix.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  applyMueller, composeMueller, complex, fresnelCoefficients, fresnelReflectionMueller,
  fresnelTransmissionMueller, idealMirrorMueller, idealPolarizerMueller, jonesOverlap, jonesToMueller,
  linearDiattenuatorMueller, linearJones, linearRetarderMueller, mirroredStokes, normalizeJones,
  reciprocalMueller, rotatorMueller, stokesFromJones, stokesVector,
} from '../sketch/js/mueller.js';
import { analyzerTransmission, retarder } from '../sketch/js/polarization.js';
import { fresnelTransmittances, throughFace } from '../sketch/js/fresnel.js';

// ------------------------------------------------ the formulas before A1, frozen

const D2R = Math.PI / 180;
const legacy = {
  retarder(stokes, axisDeg, retardanceDeg) {
    if (!stokes) return null;
    const a = 2 * axisDeg * D2R;
    const delta = retardanceDeg * D2R;
    const axis = { x: Math.cos(a), y: Math.sin(a), z: 0 };
    const v = { x: stokes.s1, y: stokes.s2, z: stokes.s3 };
    const c = Math.cos(delta), s = Math.sin(delta);
    const dot = axis.x * v.x + axis.y * v.y;
    const cross = { x: axis.y * v.z, y: -axis.x * v.z, z: axis.x * v.y - axis.y * v.x };
    return {
      s1: v.x * c + cross.x * s + axis.x * dot * (1 - c),
      s2: v.y * c + cross.y * s + axis.y * dot * (1 - c),
      s3: v.z * c + cross.z * s,
    };
  },
  analyzerTransmission(stokes, axisDeg) {
    if (!stokes) return 0.5;
    const a = 2 * axisDeg * D2R;
    return Math.min(1, Math.max(0, 0.5 * (1 + stokes.s1 * Math.cos(a) + stokes.s2 * Math.sin(a))));
  },
  fresnelTransmittances(n1, n2, cosIncidence) {
    const ci = Math.min(1, Math.max(0, Math.abs(cosIncidence)));
    const sinT = (n1 / n2) * Math.sqrt(Math.max(0, 1 - ci * ci));
    if (!(sinT < 1)) return null;
    const ct = Math.sqrt(1 - sinT * sinT);
    const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
    const rp = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct);
    const Ts = 1 - rs * rs, Tp = 1 - rp * rp;
    return Number.isFinite(Ts) && Number.isFinite(Tp) ? { Ts, Tp } : null;
  },
  throughFace(stokes, { Ts, Tp }) {
    const mean = (Tp + Ts) / 2, diff = (Tp - Ts) / 2, cross = Math.sqrt(Tp * Ts);
    const s = stokes || { s1: 0, s2: 0, s3: 0 };
    const T = mean + diff * s.s1;
    if (!(T > 0)) return { T: 0, stokes: stokes ? { ...stokes } : null };
    return { T, stokes: { s1: (diff + mean * s.s1) / T, s2: cross * s.s2 / T, s3: cross * s.s3 / T } };
  },
  linearJones(pol, phase) {
    const angle = pol * Math.PI / 180;
    const re = Math.cos(phase), im = Math.sin(phase);
    return [
      { re: Math.cos(angle) * re, im: Math.cos(angle) * im },
      { re: Math.sin(angle) * re, im: Math.sin(angle) * im },
    ];
  },
};

// A deterministic generator, so a failure names a reproducible case.
function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function pureStates(random, count) {
  const states = [null, { s1: 1, s2: 0, s3: 0 }, { s1: 0, s2: 0, s3: 1 }, { s1: 0, s2: -1, s3: 0 }];
  for (let i = 0; i < count; i++) {
    const az = random() * Math.PI, chi = (random() - 0.5) * Math.PI / 2;
    states.push({ s1: Math.cos(2 * chi) * Math.cos(2 * az), s2: Math.cos(2 * chi) * Math.sin(2 * az), s3: Math.sin(2 * chi) });
  }
  return states;
}

test('kernel: the analyzer, the Fresnel transmittances, the face and the camera Jones vector are bitwise unchanged', () => {
  const random = generator(1);
  for (const stokes of pureStates(random, 200)) {
    for (const axis of [0, 45, 90, -30, 12.5, 180 * random(), -360 * random()]) {
      assert.ok(Object.is(analyzerTransmission(stokes, axis), legacy.analyzerTransmission(stokes, axis)), `${JSON.stringify(stokes)} ${axis}`);
    }
  }
  for (let i = 0; i < 2000; i++) {
    const n1 = 1 + random(), n2 = 1 + random(), cos = 2 * random() - 1;
    assert.deepEqual(fresnelTransmittances(n1, n2, cos), legacy.fresnelTransmittances(n1, n2, cos));
  }
  for (const [n1, n2, cos] of [[1, 1.5, 1], [1, 1.5, 0], [1.5, 1, 0.5], [NaN, 1.5, 0.5], [1, Infinity, 0.5], [1, 0, 1], [1, 0, 0.5]]) {
    assert.deepEqual(fresnelTransmittances(n1, n2, cos), legacy.fresnelTransmittances(n1, n2, cos), `${n1} ${n2} ${cos}`);
  }
  for (const stokes of pureStates(random, 200)) {
    for (const face of [{ Ts: 0.76, Tp: 1 }, { Ts: 0.9, Tp: 0.9 }, { Ts: random(), Tp: random() }, { Ts: 0, Tp: 0 }]) {
      assert.deepEqual(throughFace(stokes, face), legacy.throughFace(stokes, face), `${JSON.stringify(stokes)} ${JSON.stringify(face)}`);
    }
  }
  for (let i = 0; i < 200; i++) {
    const pol = 360 * random() - 180, phase = 10 * random() - 5;
    assert.deepEqual(linearJones(pol, phase), legacy.linearJones(pol, phase));
  }
});

// Step A2 adopted Goldstein's published retardance sign: the retarder is the
// rotation A1 froze with the retardance reversed, so every power is unchanged
// and only the sign of s3 (the handedness) moves.
test('kernel: the retarder is the previous Rodrigues rotation with the retardance reversed', () => {
  const random = generator(2);
  let worst = 0;
  for (const stokes of pureStates(random, 300)) {
    for (const [axis, ret] of [[45, 90], [0, 180], [22.5, 90], [360 * random(), 720 * random() - 360], [-90 * random(), 45]]) {
      const got = retarder(stokes, axis, ret), want = legacy.retarder(stokes, axis, -ret);
      if (!stokes) { assert.equal(got, null); continue; }
      for (const key of ['s1', 's2', 's3']) worst = Math.max(worst, Math.abs(got[key] - want[key]));
    }
  }
  assert.ok(worst < 1e-15, `largest difference ${worst}`);
});

// ------------------------------------------------ conventions

const c = complex;
const mulJ = (a, b) => [0, 1].map(i => [0, 1].map(j => {
  const terms = [0, 1].map(k => ({ re: a[i][k].re * b[k][j].re - a[i][k].im * b[k][j].im, im: a[i][k].re * b[k][j].im + a[i][k].im * b[k][j].re }));
  return c(terms[0].re + terms[1].re, terms[0].im + terms[1].im);
}));
const applyJ = (J, e) => [0, 1].map(i => {
  const a = J[i][0], b = J[i][1];
  return c(a.re * e[0].re - a.im * e[0].im + b.re * e[1].re - b.im * e[1].im,
    a.re * e[0].im + a.im * e[0].re + b.re * e[1].im + b.im * e[1].re);
});
const rot = a => [[c(Math.cos(a)), c(Math.sin(a))], [c(-Math.sin(a)), c(Math.cos(a))]];
const inFrame = (axisDeg, diagonal) => mulJ(rot(-axisDeg * D2R), mulJ([[diagonal[0], c(0)], [c(0), diagonal[1]]], rot(axisDeg * D2R)));

function assertMatrixClose(actual, expected, tolerance, label) {
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      assert.ok(Math.abs(actual[i][j] - expected[i][j]) <= tolerance, `${label}: m${i}${j} ${actual[i][j]} vs ${expected[i][j]}`);
    }
  }
}

test('kernel: a Mueller matrix acts on Stokes vectors as its Jones matrix acts on fields', () => {
  const random = generator(3);
  const value = () => c(2 * random() - 1, 2 * random() - 1);
  for (let i = 0; i < 200; i++) {
    const J = [[value(), value()], [value(), value()]], e = [value(), value()];
    const got = applyMueller(jonesToMueller(J), stokesFromJones(e)), want = stokesFromJones(applyJ(J, e));
    got.forEach((v, k) => assert.ok(Math.abs(v - want[k]) < 1e-12, `case ${i}, S${k}`));
  }
  // S3 = 2 Im(E_p E_s*): (1, −i)/√2 is s3 = +1.
  const S = stokesFromJones([c(Math.SQRT1_2), c(0, -Math.SQRT1_2)]);
  assert.ok(Math.abs(S[3] - 1) < 1e-15);
});

test('kernel: each closed-form matrix is the Mueller matrix of the Jones matrix that defines it', () => {
  for (const [axis, ret] of [[0, 90], [45, 90], [30, 45], [-20, 200], [22.5, 180]]) {
    // The field is Re{J exp(−iωt)}: the slow axis lags by e^(+iδ).
    const J = inFrame(axis, [c(1), c(Math.cos(ret * D2R), Math.sin(ret * D2R))]);
    assertMatrixClose(linearRetarderMueller(axis, ret), jonesToMueller(J), 1e-14, `retarder ${axis}/${ret}`);
  }
  for (const [axis, tMax, tMin] of [[0, 0.9, 0.6], [35, 0.8, 0.1], [-70, 1, 0.3]]) {
    const J = inFrame(axis, [c(Math.sqrt(tMax)), c(Math.sqrt(tMin))]);
    assertMatrixClose(linearDiattenuatorMueller(axis, tMax, tMin), jonesToMueller(J), 1e-14, `diattenuator ${axis}`);
  }
  for (const axis of [0, 60, -15]) {
    assertMatrixClose(idealPolarizerMueller(axis), jonesToMueller(inFrame(axis, [c(1), c(0)])), 1e-14, `polarizer ${axis}`);
  }
  for (const angle of [30, -15, 100]) {
    const t = angle * D2R;
    const J = [[c(Math.cos(t)), c(-Math.sin(t))], [c(Math.sin(t)), c(Math.cos(t))]];
    assertMatrixClose(rotatorMueller(angle), jonesToMueller(J), 1e-14, `rotator ${angle}`);
  }
  assertMatrixClose(idealMirrorMueller(), jonesToMueller([[c(1), c(0)], [c(0), c(-1)]]), 0, 'mirror');
  // A quarter-wave plate with its fast axis at 45° turns linear 0° into
  // s3 = +1, right circular (the validation row of paraxial.py).
  const S = applyMueller(linearRetarderMueller(45, 90), stokesVector({ s1: 1, s2: 0, s3: 0 }));
  assert.ok(Math.abs(S[3] - 1) < 1e-15);
});

test('kernel: an element crossed backwards is the reciprocal Q·Jᵀ·Q', () => {
  const Q = [[c(1), c(0)], [c(0), c(-1)]];
  const transpose = J => [[J[0][0], J[1][0]], [J[0][1], J[1][1]]];
  const back = J => mulJ(Q, mulJ(transpose(J), Q));
  const random = generator(5);
  const value = () => c(2 * random() - 1, 2 * random() - 1);
  for (let i = 0; i < 50; i++) {
    const J = [[value(), value()], [value(), value()]];
    assertMatrixClose(reciprocalMueller(jonesToMueller(J)), jonesToMueller(back(J)), 1e-12, `general ${i}`);
  }
  // A retarder or polarizer at θ becomes the same element at −θ; a reciprocal
  // rotation keeps its sense; the mirror is its own reciprocal.
  for (const [axis, ret] of [[45, 90], [30, 45], [-20, 200], [100, 180]]) {
    assertMatrixClose(reciprocalMueller(linearRetarderMueller(axis, ret)), linearRetarderMueller(-axis, ret), 1e-14, `retarder ${axis}`);
  }
  for (const axis of [0, 35, 120]) {
    assertMatrixClose(reciprocalMueller(idealPolarizerMueller(axis)), idealPolarizerMueller(-axis), 1e-14, `polarizer ${axis}`);
  }
  assertMatrixClose(reciprocalMueller(rotatorMueller(25)), rotatorMueller(25), 1e-14, 'rotator');
  assertMatrixClose(reciprocalMueller(idealMirrorMueller()), idealMirrorMueller(), 0, 'mirror');
  assert.deepEqual(mirroredStokes({ s1: 0.6, s2: 0.48, s3: 0.64 }), { s1: 0.6, s2: -0.48, s3: -0.64 });
  assert.equal(mirroredStokes(null), null);
});

test('kernel: composition applies the first matrix first', () => {
  const first = idealPolarizerMueller(0), second = rotatorMueller(45);
  const S = applyMueller(composeMueller(first, second), [1, 0, 1, 0]);
  const T = applyMueller(second, applyMueller(first, [1, 0, 1, 0]));
  S.forEach((v, k) => assert.ok(Math.abs(v - T[k]) < 1e-15));
  assert.ok(Math.abs(S[2] - 0.5) < 1e-15, 'p at half power, turned by 45° into +45°');
});

// ------------------------------------------------ Fresnel

test('kernel: Fresnel signs follow Born and Wolf, and a perfect conductor is the ideal mirror', () => {
  const normal = fresnelCoefficients(1, 1.5, 1);
  assert.ok(Math.abs(normal.rp.re - 0.2) < 1e-15 && Math.abs(normal.rs.re + 0.2) < 1e-15);
  const conductor = fresnelReflectionMueller(1, 1e12, Math.cos(30 * D2R));
  assertMatrixClose(conductor, idealMirrorMueller(), 1e-9, 'perfect conductor');
  // r_p changes sign at Brewster's angle; r_s does not.
  const below = fresnelCoefficients(1, 1.5, Math.cos(50 * D2R)), above = fresnelCoefficients(1, 1.5, Math.cos(60 * D2R));
  assert.ok(below.rp.re > 0 && above.rp.re < 0 && below.rs.re < 0 && above.rs.re < 0);
  // The transmission matrix carries the same transmittances as the face.
  const M = fresnelTransmissionMueller(1, 1.5, Math.cos(30 * D2R));
  const { Ts, Tp } = fresnelTransmittances(1, 1.5, Math.cos(30 * D2R));
  assert.ok(Math.abs(M[0][0] + M[0][1] - Tp) < 1e-15 && Math.abs(M[0][0] - M[0][1] - Ts) < 1e-15);
});

test('kernel: beyond the critical angle the reflection is total and retards, and nothing is transmitted', () => {
  const cos = Math.cos(54.6 * D2R);
  const tir = fresnelCoefficients(1.51, 1, cos);
  assert.equal(tir.total, true);
  assert.equal(tir.ts, null);
  assert.equal(tir.tp, null);
  assert.ok(Math.abs(Math.hypot(tir.rs.re, tir.rs.im) - 1) < 1e-15 && Math.abs(Math.hypot(tir.rp.re, tir.rp.im) - 1) < 1e-15);
  const M = fresnelReflectionMueller(1.51, 1, cos);
  assert.ok(Math.abs(M[0][0] - 1) < 1e-15 && Math.abs(M[0][1]) < 1e-15, 'no power lost, no diattenuation');
  assert.equal(fresnelTransmissionMueller(1.51, 1, cos), null);
  assert.equal(fresnelTransmittances(1.51, 1, cos), null);
  // Just past the critical angle the reflection is total and barely retards;
  // just before it, it is partial.
  const critical = Math.asin(1 / 1.5);
  const past = fresnelCoefficients(1.5, 1, Math.cos(critical + 1e-9));
  const before = fresnelCoefficients(1.5, 1, Math.cos(critical - 1e-6));
  assert.equal(past.total, true);
  assert.ok(Math.abs(Math.atan2(past.rs.im, past.rs.re) - Math.atan2(past.rp.im, past.rp.re)) < 1e-3);
  assert.equal(before.total, false);
  assert.ok(before.rs.re < 1 && before.rp.re < 1);
});

test('kernel: inputs with no finite answer return null, never non-finite numbers', () => {
  for (const [n1, n2, cos] of [[NaN, 1.5, 0.5], [1, NaN, 0.5], [1, 1.5, NaN], [1, Infinity, 0.5], [Infinity, 1, 0.5], [1, 0, 1], [1, 0, 0.5]]) {
    assert.equal(fresnelCoefficients(n1, n2, cos), null, `${n1} ${n2} ${cos}`);
    assert.equal(fresnelReflectionMueller(n1, n2, cos), null);
    assert.equal(fresnelTransmissionMueller(n1, n2, cos), null);
  }
  // Not validated, as before the kernel: an infinite cosine is clamped to
  // normal incidence, and a zero incident index still gives finite numbers.
  assert.deepEqual(fresnelCoefficients(1, 1.5, Infinity), fresnelCoefficients(1, 1.5, 1));
  const zero = fresnelCoefficients(0, 1.5, 0.5);
  assert.ok([zero.rs, zero.rp, zero.ts, zero.tp].every(v => Number.isFinite(v.re) && Number.isFinite(v.im)));
  assert.equal(normalizeJones([c(0), c(0)]), null);
  assert.equal(normalizeJones([c(1e-12), c(0)]), null);
  assert.deepEqual(stokesVector(null), [1, 0, 0, 0]);
  assert.equal(retarder(null, 45, 90), null, 'unpolarized light stays unpolarized through a retarder');
  assert.equal(analyzerTransmission(null, 30), 0.5);
  const face = throughFace(null, { Ts: 0.76, Tp: 1 });
  assert.ok(Math.abs(face.stokes.s1 - 0.24 / 1.76) < 1e-15, 'an unpolarized beam leaves a Brewster face partly p-polarized');
  const overlap = jonesOverlap(linearJones(0), linearJones(90));
  assert.ok(Math.abs(overlap.re) < 1e-15 && Math.abs(overlap.im) < 1e-15, 'p and s are orthogonal');
});
