// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Normalized Stokes-vector helpers. s1/s2 describe linear polarization and
// s3 circular handedness; unpolarized light is represented by null. The
// basis, the sign conventions and the matrices live in mueller.js.

import { applyMueller, idealPolarizerMueller, linearRetarderMueller, stokesVector } from './mueller.js';

const D2R = Math.PI / 180;

export function linearStokes(angleDeg = 0) {
  const a = 2 * angleDeg * D2R;
  return { s1: Math.cos(a), s2: Math.sin(a), s3: 0 };
}

export function cloneStokes(stokes) {
  return stokes ? { s1: stokes.s1, s2: stokes.s2, s3: stokes.s3 } : null;
}

export function retarder(stokes, axisDeg, retardanceDeg) {
  if (!stokes) return null;
  const [, s1, s2, s3] = applyMueller(linearRetarderMueller(axisDeg, retardanceDeg), stokesVector(stokes));
  return { s1, s2, s3 };
}

export function analyzerTransmission(stokes, axisDeg) {
  if (!stokes) return 0.5;
  const [T] = applyMueller(idealPolarizerMueller(axisDeg), stokesVector(stokes));
  return Math.min(1, Math.max(0, T));
}

// The linear-polarization azimuth encoded in a Stokes vector's s1/s2 plane,
// wrapped to [0, 180)° — meaningful for the linear component regardless of
// whether the light is purely linear or elliptical with some circular
// admixture (s3).
export function stokesAngleDeg(stokes) {
  return ((Math.atan2(stokes.s2, stokes.s1) / (2 * D2R)) % 180 + 180) % 180;
}

// Overall degree of polarization: 1 for any pure state, 0 for a fully
// scrambled one. A beam alternating between two orthogonal states (a
// switching EOM at 50% duty, say) averages to the origin of the Poincaré
// sphere, and reporting that as a definite azimuth would be a plain lie —
// the azimuth of a zero-length vector is meaningless.
// How two states that meet coherently relate: 'same' (they interfere
// fully), 'orthogonal' (two pure states at opposite points of the Poincaré
// sphere, which add their powers exactly) or 'partial' (anything else,
// unpolarized against polarized included). Rounding below 1e-9 is ignored.
export function polarizationRelation(a, b, tolerance = 1e-9) {
  if (!a && !b) return 'same';
  if (!a || !b) return 'partial';
  if (Math.abs(a.s1 - b.s1) <= tolerance && Math.abs(a.s2 - b.s2) <= tolerance && Math.abs(a.s3 - b.s3) <= tolerance) return 'same';
  const pure = s => Math.abs(Math.hypot(s.s1, s.s2, s.s3) - 1) <= tolerance;
  if (pure(a) && pure(b) && a.s1 * b.s1 + a.s2 * b.s2 + a.s3 * b.s3 <= -1 + tolerance) return 'orthogonal';
  return 'partial';
}

export const degreeOfPolarization = stokes =>
  (stokes ? Math.min(1, Math.hypot(stokes.s1, stokes.s2, stokes.s3)) : 0);

const DEPOLARIZED = 0.02;

export function legacyPolarization(stokes) {
  if (!stokes) return undefined;
  if (degreeOfPolarization(stokes) < DEPOLARIZED) return undefined;
  if (Math.abs(stokes.s3) > 0.985) return 'c';
  if (Math.abs(stokes.s3) < 0.015) {
    return stokesAngleDeg(stokes);
  }
  return 'e';
}

export function polarizationDescription(stokes) {
  if (!stokes) return 'Unpolarized';
  if (degreeOfPolarization(stokes) < DEPOLARIZED) return 'Unpolarized';
  if (Math.abs(stokes.s3) > 0.985) return stokes.s3 > 0 ? 'Right circular' : 'Left circular';
  const linearDegree = Math.hypot(stokes.s1, stokes.s2);
  const angle = stokesAngleDeg(stokes);
  if (Math.abs(stokes.s3) < 0.015 && linearDegree > 0.985) return `Linear ${Math.round(angle)}°`;
  return `Elliptical ${Math.round(angle)}°`;
}
