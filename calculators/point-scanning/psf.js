// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Point-spread functions of a point-scanning microscope, DOM-free.
//
// Scalar focus of a uniformly filled circular pupil in optical coordinates
// (So et al., Annu. Rev. Biomed. Eng. 2, 399 (2000), Eq. 2):
//   v = 2π NA r / λ,   u = 4π (n − √(n² − NA²)) z / λ = 8π n sin²(α/2) z / λ,
//   h(u, v) = |2 ∫₀¹ J₀(vρ) exp(−i u ρ²/2) ρ dρ|²,
// which is the Airy pattern [2J₁(v)/v]² in focus and sinc²(u/4) on the axis.
// A point object's signal, as the focus scans over it, is
//   one-photon, open detector:   h_ex
//   one-photon, pinhole:         h_ex · (h_det ⊗ pinhole)   (Wilson & Carlini 1987)
//   N-photon, open detector:     h_ex^N
// with h_det at the detected wavelength (emission, Raman Stokes or the
// excitation itself). Widths are FWHM, found by bisection on the profiles.

// Bessel J0 and J1 live in sketch/js/bessel.js, shared with the canvas's
// fiber mode; they are re-exported here for this page's callers.
import { besselJ0, besselJ1 } from '../../sketch/js/bessel.js';
export { besselJ0, besselJ1 };

// Gauss–Legendre nodes and weights on [a, b].
const legendreCache = new Map();
function legendre(n) {
  if (legendreCache.has(n)) return legendreCache.get(n);
  const x = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < Math.ceil(n / 2); i++) {
    let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), dp = 0;
    for (let iter = 0; iter < 100; iter++) {
      let p0 = 1, p1 = 0;
      for (let j = 1; j <= n; j++) { const p2 = p1; p1 = p0; p0 = ((2 * j - 1) * z * p1 - (j - 1) * p2) / j; }
      dp = n * (z * p0 - p1) / (z * z - 1);
      const dz = p0 / dp;
      z -= dz;
      if (Math.abs(dz) < 1e-15) break;
    }
    x[i] = -z; x[n - 1 - i] = z;
    w[i] = w[n - 1 - i] = 2 / ((1 - z * z) * dp * dp);
  }
  const rule = { x, w };
  legendreCache.set(n, rule);
  return rule;
}
function nodes(n, a, b) {
  const { x, w } = legendre(n), h = (b - a) / 2;
  return { x: Array.from(x, t => a + h * (t + 1)), w: Array.from(w, t => t * h) };
}

// In-focus intensity [2J1(v)/v]² and on-axis intensity sinc²(u/4).
export function airyIntensity(v) {
  if (Math.abs(v) < 1e-4) return 1 - v * v / 4;
  const a = 2 * besselJ1(v) / v;
  return a * a;
}
export function axialIntensity(u) {
  const x = u / 4;
  if (Math.abs(x) < 1e-4) return 1 - x * x / 3;
  const s = Math.sin(x) / x;
  return s * s;
}

// 1 AU is the Airy-disc diameter 1.22 λ/NA, so a pinhole of P AU has the
// radius v = 1.22 π P in the detected light's optical units.
export const AU_RADIUS_V = 1.22 * Math.PI;

const RHO = 128, PIN_S = 64, PIN_PHI = 48;

// The detection response of a pinhole of radius R (optical units of the
// detected light): the detected PSF summed over the pinhole, normalized to
// 1 at the focus. R = 0 is the point-pinhole limit, h_det itself.
export function pinholeResponse(radiusV) {
  if (!(radiusV > 0)) return { lateral: airyIntensity, axial: axialIntensity };
  const s = nodes(PIN_S, 0, radiusV), phi = nodes(PIN_PHI, 0, Math.PI);
  const lateralRaw = r => {
    let sum = 0;
    for (let i = 0; i < PIN_S; i++) {
      let ring = 0;
      for (let j = 0; j < PIN_PHI; j++) {
        const d2 = r * r + s.x[i] * s.x[i] - 2 * r * s.x[i] * Math.cos(phi.x[j]);
        ring += phi.w[j] * airyIntensity(Math.sqrt(Math.max(0, d2)));
      }
      sum += s.w[i] * s.x[i] * ring;
    }
    return 2 * sum;
  };
  // h(u, v) = |2 ∫ J0(vρ) e^(−iuρ²/2) ρ dρ|²; J0(vρ) is tabulated once.
  const rho = nodes(RHO, 0, 1);
  const j0 = s.x.map(v => rho.x.map((p, k) => besselJ0(v * p) * p * rho.w[k]));
  const axialRaw = u => {
    const c = rho.x.map(p => Math.cos(u * p * p / 2)), sn = rho.x.map(p => Math.sin(u * p * p / 2));
    let sum = 0;
    for (let i = 0; i < PIN_S; i++) {
      let re = 0, im = 0;
      for (let k = 0; k < RHO; k++) { re += j0[i][k] * c[k]; im -= j0[i][k] * sn[k]; }
      sum += s.w[i] * s.x[i] * 4 * (re * re + im * im);
    }
    return 2 * Math.PI * sum;
  };
  const lateral0 = lateralRaw(0), axial0 = axialRaw(0);
  return { lateral: r => lateralRaw(r) / lateral0, axial: u => axialRaw(u) / axial0 };
}

// Half width at half maximum of a profile f with f(0) = 1 that falls below
// one half: step out until it does, then bisect.
export function halfWidth(f, step) {
  let lo = 0, hi = step;
  for (let k = 0; f(hi) > 0.5; k++) {
    if (k > 4000) return null;
    lo = hi; hi += step;
  }
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0.5) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Effective PSF profiles in the excitation's optical units (v_ex, u_ex).
// `detectionRatio` β = λ_ex/λ_det converts them to the detected light's.
export function effectivePsf({ order = 1, pinholeAu = null, detectionRatio = 1 }) {
  if (order > 1) {
    return { lateral: v => airyIntensity(v) ** order, axial: u => axialIntensity(u) ** order };
  }
  if (pinholeAu === null) return { lateral: airyIntensity, axial: axialIntensity };
  const det = pinholeResponse(AU_RADIUS_V * pinholeAu), b = detectionRatio;
  return {
    lateral: v => airyIntensity(v) * det.lateral(b * v),
    axial: u => axialIntensity(u) * det.axial(b * u),
    detection: det,
  };
}
