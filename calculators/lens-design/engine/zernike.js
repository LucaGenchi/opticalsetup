// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Zernike polynomials in Noll's ordering and normalization (R. J. Noll,
// J. Opt. Soc. Am. 66, 207 (1976)): over the unit circle each Z_j has zero
// mean (j > 1) and unit RMS, so a fitted wavefront's RMS is the root sum of
// squares of its coefficients beyond piston. With x = ρ cos θ, y = ρ sin θ:
//
//   Z_j = √(n+1) R_n^0(ρ)                     m = 0
//   Z_j = √(2(n+1)) R_n^m(ρ) cos(mθ)          m ≠ 0, j even
//   Z_j = √(2(n+1)) R_n^m(ρ) sin(mθ)          m ≠ 0, j odd
//
//   R_n^m(ρ) = Σ_s (−1)^s (n−s)! / (s! ((n+m)/2 − s)! ((n−m)/2 − s)!) ρ^(n−2s)

export const ZERNIKE_TERMS = 37;

// Noll's index j (from 1) to the radial order n and azimuthal order m.
export function nollToNm(j) {
  let n = 0;
  while ((n + 1) * (n + 2) / 2 < j) n++;
  // Within order n, the |m| run from n mod 2 upward, two indices each
  // (one for m = 0); even j takes the cosine.
  const first = n * (n + 1) / 2 + 1;
  let k = j - first;
  let m = n % 2;
  if (m === 0) {
    if (k === 0) return { n, m: 0 };
    k -= 1; m = 2;
  }
  m += 2 * Math.floor(k / 2);
  return { n, m };
}

const factorial = (() => { const f = [1]; for (let i = 1; i <= 30; i++) f[i] = f[i - 1] * i; return k => f[k]; })();

function radialCoefficients(n, m) {
  const out = [];
  for (let s = 0; s <= (n - m) / 2; s++) {
    out.push({ c: (s % 2 ? -1 : 1) * factorial(n - s) / (factorial(s) * factorial((n + m) / 2 - s) * factorial((n - m) / 2 - s)), p: n - 2 * s });
  }
  return out;
}

export const ZERNIKE_NAMES = {
  1: 'Piston', 2: 'Tilt x', 3: 'Tilt y', 4: 'Defocus', 5: 'Astigmatism 45°', 6: 'Astigmatism 0°',
  7: 'Coma y', 8: 'Coma x', 9: 'Trefoil y', 10: 'Trefoil x', 11: 'Spherical',
  12: 'Secondary astigmatism 0°', 13: 'Secondary astigmatism 45°', 14: 'Quadrafoil 0°', 15: 'Quadrafoil 45°',
  22: 'Secondary spherical', 37: 'Tertiary spherical',
};

// The terms as functions of (x, y) on the unit disc.
export function zernikeBasis(count = ZERNIKE_TERMS) {
  return Array.from({ length: count }, (_, i) => {
    const j = i + 1, { n, m } = nollToNm(j);
    const radial = radialCoefficients(n, m);
    const norm = m === 0 ? Math.sqrt(n + 1) : Math.sqrt(2 * (n + 1));
    const kind = m === 0 ? 0 : j % 2 === 0 ? 1 : -1;
    return {
      j, n, m: kind < 0 ? -m : m,
      at(x, y) {
        const rho = Math.hypot(x, y);
        let r = 0;
        for (const t of radial) r += t.c * rho ** t.p;
        if (!kind) return norm * r;
        const theta = Math.atan2(y, x);
        return norm * r * (kind > 0 ? Math.cos(m * theta) : Math.sin(m * theta));
      },
    };
  });
}

// Least-squares fit of values w at points (x, y) on the unit disc, by the
// normal equations and a Cholesky solve. Returns the coefficients (same unit
// as w) and the RMS of what the fit leaves.
export function fitZernike(xs, ys, ws, count = ZERNIKE_TERMS) {
  const K = xs.length;
  if (K < count) return null;
  const basis = zernikeBasis(count);
  const G = new Float64Array(count * count), b = new Float64Array(count), row = new Float64Array(count);
  for (let k = 0; k < K; k++) {
    for (let i = 0; i < count; i++) row[i] = basis[i].at(xs[k], ys[k]);
    for (let i = 0; i < count; i++) {
      b[i] += row[i] * ws[k];
      for (let j = 0; j <= i; j++) G[i * count + j] += row[i] * row[j];
    }
  }
  // Cholesky: G = L Lᵀ, in the lower triangle.
  for (let i = 0; i < count; i++) {
    for (let j = 0; j <= i; j++) {
      let s = G[i * count + j];
      for (let k = 0; k < j; k++) s -= G[i * count + k] * G[j * count + k];
      if (i === j) {
        if (!(s > 0)) return null;
        G[i * count + i] = Math.sqrt(s);
      } else G[i * count + j] = s / G[j * count + j];
    }
  }
  const y = new Float64Array(count), c = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= G[i * count + k] * y[k];
    y[i] = s / G[i * count + i];
  }
  for (let i = count - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < count; k++) s -= G[k * count + i] * c[k];
    c[i] = s / G[i * count + i];
  }
  let res = 0;
  for (let k = 0; k < K; k++) {
    let v = ws[k];
    for (let i = 0; i < count; i++) v -= c[i] * basis[i].at(xs[k], ys[k]);
    res += v * v;
  }
  return { coefficients: Array.from(c), residualRms: Math.sqrt(res / K), terms: basis.map(t => ({ j: t.j, n: t.n, m: t.m })) };
}
