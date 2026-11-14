// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Mueller and Jones kernel (docs/physics/mueller-kernel.md). DOM-free.
//
// One basis and one set of conventions for every polarization calculation
// in the app:
//
// - Jones vectors are (E_p, E_s). p lies in the drawing plane, perpendicular
//   to the ray; s points out of the plane. The app's polarization angle is
//   measured from p, so 0° is p and 90° is s.
// - The field is E(t) = Re{J exp(−iωt)}, so a path of optical length L adds
//   the phase e^(+ikL) and the slow axis of a retarder lags by e^(+iδ).
// - k̂ is along the ray, ŝ = +ẑ points out of the screen (the canvas y axis
//   points down) and p̂ = ŝ × k̂, so (p̂, ŝ, k̂) is right-handed. An element's
//   axis angle is measured from p̂ towards ŝ for light crossing the element
//   along its own forward direction (local +x); light crossing it backwards
//   sees the reciprocal matrix (reciprocalMueller).
// - Stokes vectors are S = (S0, S1, S2, S3) with S0 = |E_p|² + |E_s|²,
//   S1 = |E_p|² − |E_s|², S2 = 2 Re(E_p E_s*), S3 = 2 Im(E_p E_s*). Rays carry
//   the normalized part (s1, s2, s3) = (S1, S2, S3) / S0, and null for
//   unpolarized light.
// - Retardance follows Goldstein's published matrices: the Jones matrix
//   R(−θ) diag(1, e^(+iδ)) R(θ) for an element whose fast axis is at θ, with
//   R(a) = [[cos a, sin a], [−sin a, cos a]]. A quarter-wave plate with its
//   fast axis at 45° turns linear 0° light into s3 = +1, right circular in
//   Born and Wolf's sense (clockwise seen looking towards the source). Until
//   step A2 of the Physics in 2D track the app used δ → −δ, which made θ the
//   slow axis and swapped every circular label.
//
// Matrices are 4 × 4 arrays of rows; complex numbers are { re, im }.

const D2R = Math.PI / 180;

export const complex = (re, im = 0) => ({ re, im });

const cmul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cconj = a => ({ re: a.re, im: -a.im });
const cdiv = (a, b) => {
  const d = b.re * b.re + b.im * b.im;
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d };
};
const finiteComplex = a => Number.isFinite(a.re) && Number.isFinite(a.im);

// ---------------------------------------------------------------- Stokes

// The full Stokes vector of a normalized state; unpolarized light (null) is
// (1, 0, 0, 0).
export function stokesVector(stokes) {
  return stokes ? [1, stokes.s1, stokes.s2, stokes.s3] : [1, 0, 0, 0];
}

export function applyMueller(m, S) {
  return m.map(row => row[0] * S[0] + row[1] * S[1] + row[2] * S[2] + row[3] * S[3]);
}

// The matrix of `first` followed by `second`: second · first.
export function composeMueller(first, second) {
  return second.map(row => [0, 1, 2, 3].map(j =>
    row[0] * first[0][j] + row[1] * first[1][j] + row[2] * first[2][j] + row[3] * first[3][j]));
}

// ---------------------------------------------------------------- Mueller matrices

// Turns the polarization azimuth by +angle (from p towards s).
export function rotatorMueller(angleDeg) {
  const a = 2 * angleDeg * D2R;
  const c = Math.cos(a), s = Math.sin(a);
  return [
    [1, 0, 0, 0],
    [0, c, -s, 0],
    [0, s, c, 0],
    [0, 0, 0, 1],
  ];
}

// A linear retarder with its fast axis at θ: a rotation of (s1, s2, s3) by
// −δ about the axis (cos 2θ, sin 2θ, 0) of the Poincaré sphere (Rodrigues'
// formula), Goldstein's matrix for a retarder of retardance δ.
export function linearRetarderMueller(axisDeg, retardanceDeg) {
  const a = 2 * axisDeg * D2R;
  const delta = retardanceDeg * D2R;
  const x = Math.cos(a), y = Math.sin(a);
  const c = Math.cos(delta), s = Math.sin(delta);
  return [
    [1, 0, 0, 0],
    [0, c + x * x * (1 - c), x * y * (1 - c), -y * s],
    [0, x * y * (1 - c), c + y * y * (1 - c), x * s],
    [0, y * s, -x * s, c],
  ];
}

// A linear diattenuator that transmits the power fraction tMax for light
// polarized along its axis and tMin across it (Goldstein, ch. 6).
export function linearDiattenuatorMueller(axisDeg, tMax, tMin) {
  const a = 2 * axisDeg * D2R;
  const c = Math.cos(a), s = Math.sin(a);
  const mean = (tMax + tMin) / 2, diff = (tMax - tMin) / 2, cross = Math.sqrt(tMax * tMin);
  return [
    [mean, diff * c, diff * s, 0],
    [diff * c, mean * c * c + cross * s * s, (mean - cross) * c * s, 0],
    [diff * s, (mean - cross) * c * s, mean * s * s + cross * c * c, 0],
    [0, 0, 0, cross],
  ];
}

export const idealPolarizerMueller = axisDeg => linearDiattenuatorMueller(axisDeg, 1, 0);

// The reflection of an ideal mirror: the Jones matrix diag(1, −1) in the
// p, s basis. s1 is kept; s2 and s3 change sign, because p̂ = ŝ × k̂ turns
// over with the ray while ŝ does not. The tracer applies it at every
// specular reflection.
export function idealMirrorMueller() {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, -1, 0],
    [0, 0, 0, -1],
  ];
}

// The same element crossed backwards. Reciprocity gives the Jones matrix
// J_back = Q·Jᵀ·Q with Q = diag(1, −1) (R. Bhandari, Opt. Lett. 33, 854
// (2008)); in Stokes terms that is D·Mᵀ·D with D = diag(1, 1, −1, 1). A
// retarder or polarizer at θ becomes the same element at −θ; a reciprocal
// rotation keeps its sense; the ideal mirror is its own reciprocal.
// Non-reciprocal elements (a Faraday rotator, the ideal isolator gate) do
// not obey it and are handled where they are traced.
export function reciprocalMueller(m) {
  const D = [1, 1, -1, 1];
  return [0, 1, 2, 3].map(i => [0, 1, 2, 3].map(j => D[i] * m[j][i] * D[j]));
}

// Applies the ideal mirror to a normalized state; null (unpolarized) stays
// null.
export function mirroredStokes(stokes) {
  return stokes ? { s1: stokes.s1, s2: -stokes.s2, s3: -stokes.s3 } : null;
}

// ---------------------------------------------------------------- Jones

// The Pauli matrices in the order of (S0, S1, S2, S3). σ3 carries the sign
// that makes E† σ3 E = 2 Im(E_p E_s*).
const PAULI = [
  [[complex(1), complex(0)], [complex(0), complex(1)]],
  [[complex(1), complex(0)], [complex(0), complex(-1)]],
  [[complex(0), complex(1)], [complex(1), complex(0)]],
  [[complex(0), complex(0, 1)], [complex(0, -1), complex(0)]],
];

const mul2 = (a, b) => [0, 1].map(i => [0, 1].map(j => {
  const p = cmul(a[i][0], b[0][j]), q = cmul(a[i][1], b[1][j]);
  return { re: p.re + q.re, im: p.im + q.im };
}));
const dagger2 = a => [[cconj(a[0][0]), cconj(a[1][0])], [cconj(a[0][1]), cconj(a[1][1])]];

// Mueller matrix of a Jones matrix [[J_pp, J_ps], [J_sp, J_ss]]:
// M_ij = ½ tr(J† σ_i J σ_j).
export function jonesToMueller(jones) {
  const jd = dagger2(jones);
  return PAULI.map(si => {
    const left = mul2(mul2(jd, si), jones);
    return PAULI.map(sj => {
      const product = mul2(left, sj);
      return (product[0][0].re + product[1][1].re) / 2;
    });
  });
}

// The full Stokes vector of a Jones vector [E_p, E_s].
export function stokesFromJones([p, s]) {
  const ip = p.re * p.re + p.im * p.im, is = s.re * s.re + s.im * s.im;
  const cross = cmul(p, cconj(s));
  return [ip + is, ip - is, 2 * cross.re, 2 * cross.im];
}

// Linear light at angleDeg from p with a common phase, as the camera builds
// it for a hit that carries only an angle.
export function linearJones(angleDeg, phaseRad = 0) {
  const angle = angleDeg * Math.PI / 180;
  const re = Math.cos(phaseRad), im = Math.sin(phaseRad);
  return [
    { re: Math.cos(angle) * re, im: Math.cos(angle) * im },
    { re: Math.sin(angle) * re, im: Math.sin(angle) * im },
  ];
}

// A Jones vector scaled to unit length, or null when it has no length.
export function normalizeJones([x, y], eps = 1e-10) {
  const norm = Math.hypot(x.re, x.im, y.re, y.im);
  if (!(norm > eps)) return null;
  return [{ re: x.re / norm, im: x.im / norm }, { re: y.re / norm, im: y.im / norm }];
}

// left† right, the overlap of two Jones vectors.
export function jonesOverlap(left, right) {
  let re = 0, im = 0;
  for (let i = 0; i < 2; i++) {
    re += left[i].re * right[i].re + left[i].im * right[i].im;
    im += left[i].re * right[i].im - left[i].im * right[i].re;
  }
  return { re, im };
}

// ---------------------------------------------------------------- Fresnel

// Amplitude coefficients of a lossless, non-magnetic interface between real
// indices n1 (incident side) and n2, in the sign convention of Born and Wolf
// (§1.5.2), which matches the p, s basis above: p̂ = ŝ × k̂ on the incident
// and on the reflected ray, so r_p = +1 and r_s = −1 in the limit of a
// perfect conductor, the ideal mirror diag(1, −1). cosIncidence is |cos θ₁|.
//
// Beyond the critical angle cos θ₂ = +iκ, the branch whose transmitted field
// decays away from the face for exp(−iωt); |r_s| = |r_p| = 1, the phase
// difference between them is the retardance of total internal reflection,
// and no transmission coefficients are returned. Returns null when the
// inputs give no finite coefficients.
export function fresnelCoefficients(n1, n2, cosIncidence) {
  const ci = Math.min(1, Math.max(0, Math.abs(cosIncidence)));
  const sinT = (n1 / n2) * Math.sqrt(Math.max(0, 1 - ci * ci));
  if (sinT < 1) {
    const ct = Math.sqrt(1 - sinT * sinT);
    const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct);
    const rp = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct);
    const ts = 2 * n1 * ci / (n1 * ci + n2 * ct);
    const tp = 2 * n1 * ci / (n2 * ci + n1 * ct);
    if (![rs, rp, ts, tp].every(Number.isFinite)) return null;
    return {
      total: false, cosTransmitted: complex(ct),
      rs: complex(rs), rp: complex(rp), ts: complex(ts), tp: complex(tp),
    };
  }
  if (!(sinT >= 1)) return null;
  const kappa = Math.sqrt(sinT * sinT - 1);
  const rs = cdiv(complex(n1 * ci, -n2 * kappa), complex(n1 * ci, n2 * kappa));
  const rp = cdiv(complex(n2 * ci, -n1 * kappa), complex(n2 * ci, n1 * kappa));
  if (!finiteComplex(rs) || !finiteComplex(rp)) return null;
  return { total: true, cosTransmitted: complex(0, kappa), rs, rp, ts: null, tp: null };
}

// Mueller matrix of the reflection, in the p, s basis of the incident and of
// the reflected ray. Includes the retardance of total internal reflection.
export function fresnelReflectionMueller(n1, n2, cosIncidence) {
  const c = fresnelCoefficients(n1, n2, cosIncidence);
  if (!c) return null;
  const { rp, rs } = c;
  const Rp = rp.re * rp.re + rp.im * rp.im, Rs = rs.re * rs.re + rs.im * rs.im;
  const x = cmul(rp, cconj(rs));
  return [
    [(Rp + Rs) / 2, (Rp - Rs) / 2, 0, 0],
    [(Rp - Rs) / 2, (Rp + Rs) / 2, 0, 0],
    [0, 0, x.re, -x.im],
    [0, 0, x.im, x.re],
  ];
}

// Power transmittances T = 1 − |r|², or null beyond the critical angle.
export function fresnelTransmittancesFromCoefficients(c) {
  if (!c || c.total) return null;
  const Ts = 1 - (c.rs.re * c.rs.re + c.rs.im * c.rs.im);
  const Tp = 1 - (c.rp.re * c.rp.re + c.rp.im * c.rp.im);
  return Number.isFinite(Ts) && Number.isFinite(Tp) ? { Ts, Tp } : null;
}

// Mueller matrix of the transmission: below the critical angle t_s and t_p
// are real and positive, so the face is a diattenuator along p. Null beyond
// the critical angle.
export function fresnelTransmissionMueller(n1, n2, cosIncidence) {
  const T = fresnelTransmittancesFromCoefficients(fresnelCoefficients(n1, n2, cosIncidence));
  return T ? linearDiattenuatorMueller(0, T.Tp, T.Ts) : null;
}
