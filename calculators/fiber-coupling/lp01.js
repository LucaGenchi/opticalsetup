// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The exact fundamental mode LP₀₁ of a weakly guiding step-index fiber
// (Gloge, Appl. Opt. 10, 2252 (1971)). With ρ = r/a in core radii, u from
//
//   u J₁(u)/J₀(u) = w K₁(w)/K₀(w),   u² + w² = V²,
//
// the field is J₀(uρ)/J₀(u) in the core and K₀(wρ)/K₀(w) in the cladding.
// It depends on V alone, scaled by the core radius a. It is nearly, not
// exactly, Gaussian: the Gaussian exp(−ρ²/s²) that couples to it best
// (`best.ratio` = s, its 1/e² radius in core radii) couples at `best.eta`,
// 99.2 % at V = 2 and 94.4 % at V = 1.2, the most any TEM₀₀ beam can.
//
// Two views of the mode serve the page. On the fiber face, the overlap with
// a Gaussian waist (`gaussianOverlap`), for an ideal lens whose waist lies
// on the face. In the far field, its Hankel transform
//
//   F(q) = ∫₀^∞ E(ρ) J₀(qρ) ρ dρ = V² [P J₀(q) − q J₁(q)] / ((u² − q²)(w² + q²)),
//
// P = u J₁(u)/J₀(u), q = k a sin α (`farField`, normalized to F(0) = 1),
// which the traced singlets overlap on the sphere about the fiber's core.
// The closed form follows from the two Lommel integrals of J₀ and K₀ and the
// eigenvalue equation, which also makes its pole at q = u removable. It
// falls off as a power of q, not as a Gaussian: `reach` is where it stays
// below 10⁻⁵ of its peak, beyond which the overlaps leave it out.
//
// Bessel functions for the mode come from their integral representations
// by the trapezoid rule, spectrally accurate for these smooth periodic or
// doubly-exponentially decaying integrands (as in the Python reference);
// the far field, evaluated for every ray, uses the rational approximations
// of J₀ and J₁ (to about 10⁻⁸) the point-scanning calculator uses.
import { besselJ0, besselJ1 } from '../point-scanning/psf.js';

// First zero of J₀: LP₁₁ is guided above it.
export const J0_ZERO = 2.404825557695773;

// J₀ and J₁ by J_n(x) = (1/π) ∫₀^π cos(nτ − x sin τ) dτ; the rule is exact
// to round-off once its nodes outnumber |x| comfortably.
export function besselJ(n, x) {
  const count = Math.max(48, Math.ceil(Math.abs(x)) + 48), h = Math.PI / count;
  let sum = 0;
  for (let i = 0; i <= count; i++) sum += (i === 0 || i === count ? 0.5 : 1) * Math.cos(n * i * h - x * Math.sin(i * h));
  return sum * h / Math.PI;
}

// K₀ and K₁ by K_n(x) = ∫₀^∞ exp(−x cosh t) cosh(nt) dt, cut where the
// integrand is below e⁻⁶⁰ of its start.
export function besselK(n, x) {
  const top = Math.acosh(Math.max(1, 60 / x)) + 1, count = 400, h = top / count;
  let sum = 0;
  for (let i = 0; i <= count; i++) sum += (i === 0 || i === count ? 0.5 : 1) * Math.exp(-x * Math.cosh(i * h)) * Math.cosh(n * i * h);
  return sum * h;
}

// u by bisection between 0 and min(V, J0_ZERO), where the two sides of the
// eigenvalue equation cross once.
function solveU(V) {
  const f = u => {
    const w = Math.sqrt(V * V - u * u);
    return u * besselJ(1, u) / besselJ(0, u) - w * besselK(1, w) / besselK(0, w);
  };
  let lo = 1e-9, hi = Math.min(V, J0_ZERO) - 1e-12;
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Composite Simpson nodes for ∫ g(ρ) ρ dρ over the mode: the core on 200
// intervals, the cladding in segments of growing step out to where K₀ has
// fallen by e⁻⁴⁰ (at least 12 core radii), as in the Python reference.
function radialNodes(w) {
  const out = Math.max(12, 40 / w), rho = [], weight = [];
  const segment = (a, b, n) => {
    const h = (b - a) / n;
    for (let k = 0; k <= n; k++) { rho.push(a + k * h); weight.push((k === 0 || k === n ? 1 : k % 2 ? 4 : 2) * h / 3); }
  };
  segment(0, 1, 200);
  for (const [a, b, step] of [[1, 3, 0.01], [3, 12, 0.05], [12, out, 0.25]]) {
    if (b > a) segment(a, b, 2 * Math.ceil((b - a) / step / 2));
  }
  return { rho, weight };
}

// Maximum of f on [a, b] by golden section.
function goldenMax(f, a, b, steps = 80) {
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = f(x1), f2 = f(x2);
  for (let i = 0; i < steps; i++) {
    if (f1 > f2) { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = f(x1); } else { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = f(x2); }
  }
  return f1 > f2 ? [x1, f1] : [x2, f2];
}

const cache = new Map();
// Gauss–Legendre nodes and weights on [0, 1], 4 points.
const GL4 = [[0.0694318442029737, 0.1739274225687269], [0.3300094782075719, 0.3260725774312731], [0.6699905217924281, 0.3260725774312731], [0.9305681557970262, 0.1739274225687269]];

// ∫|M|² dΩ over the hemisphere for the far field M(s) = F(k a s), s = sin α,
// with ka = k a (the core radius in wavelengths, times 2π), the overlap's
// normalization: by Simpson's rule in α, on steps resolving F's
// oscillation (period π in q) and out to where it falls below 10⁻⁵.
export function farFieldNorm(mode, ka) {
  const top = Math.asin(Math.min(1, mode.reach / ka)), n = 2 * Math.ceil(Math.max(1000, 20 * Math.min(ka, mode.reach)) / 2), h = top / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const a = i * h, m = mode.farField(ka * Math.sin(a));
    sum += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * m * m * Math.sin(a);
  }
  return 2 * Math.PI * sum * h / 3;
}

// The mode at V: u, w, the field on the face and its best Gaussian, and the
// far field. Kept per V, as the page asks again on every redraw.
export function lp01(V) {
  const key = V.toPrecision(15);
  if (cache.has(key)) return cache.get(key);
  const u = solveU(V), w = Math.sqrt(V * V - u * u);
  const j0u = besselJ(0, u), j1u = besselJ(1, u), k0w = besselK(0, w), k1w = besselK(1, w);
  const P = u * j1u / j0u;
  const { rho, weight } = radialNodes(w);
  const e = rho.map((r, k) => (k <= 200 ? besselJ(0, u * r) / j0u : besselK(0, w * r) / k0w));
  // ∫E²ρdρ, in closed form: ½[1 + (J₁/J₀)²] in the core, ½[(K₁/K₀)² − 1] outside.
  const power = 0.5 * (1 + (j1u / j0u) ** 2) + 0.5 * ((k1w / k0w) ** 2 - 1);
  // Overlap with a Gaussian waist exp(−ρ²/s²) on the face (∫g²ρdρ = s²/4).
  const gaussianOverlap = s => {
    let cross = 0;
    for (let k = 0; k < rho.length; k++) cross += weight[k] * e[k] * Math.exp(-rho[k] * rho[k] / (s * s)) * rho[k];
    return cross * cross / (power * s * s / 4);
  };
  // Bracketed on a logarithmic scan of 0.3 to 30 core radii, then refined.
  const grid = Array.from({ length: 61 }, (_, i) => 0.3 * 100 ** (i / 60));
  const values = grid.map(gaussianOverlap);
  const at = values.indexOf(Math.max(...values));
  const [ratio, eta] = goldenMax(gaussianOverlap, grid[Math.max(0, at - 1)], grid[Math.min(grid.length - 1, at + 1)]);
  // The far field. Near its removable pole the numerator N(q) = P J₀(q) −
  // q J₁(q), zero at u, is the integral of N′(t) = −P J₁(t) − t J₀(t) from
  // u, taken by 4-point Gauss–Legendre: no cancellation.
  const f0 = V * V * P / (u * u * w * w);
  const farField = q => {
    q = Math.abs(q);
    if (Math.abs(q - u) >= 0.5) return V * V * (P * besselJ0(q) - q * besselJ1(q)) / ((u * u - q * q) * (w * w + q * q)) / f0;
    let mean = 0;
    for (let i = 0; i < 4; i++) { const t = u + (q - u) * GL4[i][0]; mean += GL4[i][1] * (-P * besselJ1(t) - t * besselJ0(t)); }
    return -V * V * mean / ((u + q) * (w * w + q * q)) / f0;
  };
  // Where the far field last exceeds 10⁻⁵ of its peak, on steps of 0.05.
  let reach = 0;
  for (let q = 0; q <= 2000; q += 0.05) if (Math.abs(farField(q)) > 1e-5) reach = q + 0.05;
  const mode = { V, u, w, P, power, field: r => (r <= 1 ? besselJ(0, u * r) / j0u : besselK(0, w * r) / k0w), gaussianOverlap, best: { ratio, eta }, farField, reach };
  cache.set(key, mode);
  return mode;
}
