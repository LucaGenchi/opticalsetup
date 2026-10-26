// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The spectral phase of a pulse from the paths its colours took. A prism or
// grating splits a broadband ray into wavelength samples; each is traced on
// its own and arrives with a phase
//
//   φ = 2π (path / λ + grating cycles)
//
// where `path` is its phase optical path in mm (already carried on to a
// common reference plane, ideal-lens paths included) and the cycles are what
// gratings added to its diffracted orders. A polynomial in ω − ω₀ through
// those phases gives the GDD (2 a₂) and the group delay across the band.
// The model, its scope and its checks: docs/physics/ray-path-phase.md.
// DOM-free.

const C_NM_PER_FS = 299.792458;
const omegaOf = nm => 2 * Math.PI * C_NM_PER_FS / nm;

// Phase beyond second order larger than this inside the bandwidth's FWHM is
// worth saying: the duration model uses the GDD alone.
export const PATH_PHASE_HIGHER_ORDER_RAD = 0.5;

// Solve the normal equations of a least-squares polynomial fit, by Gaussian
// elimination with partial pivoting. `z` is scaled to [-1, 1] and the values
// are detrended, so the system is small and well conditioned.
function polynomialFit(z, values, degree) {
  const m = degree + 1;
  const a = Array.from({ length: m }, () => new Array(m + 1).fill(0));
  z.forEach((zi, k) => {
    const powers = Array.from({ length: 2 * m - 1 }, (_, j) => zi ** j);
    for (let r = 0; r < m; r++) {
      for (let c = 0; c < m; c++) a[r][c] += powers[r + c];
      a[r][m] += powers[r] * values[k];
    }
  });
  for (let c = 0; c < m; c++) {
    let pivot = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    if (!(Math.abs(a[pivot][c]) > 0)) return null;
    [a[c], a[pivot]] = [a[pivot], a[c]];
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let j = c; j <= m; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((row, i) => row[m] / row[i]);
}

// Rounding in a traced path: its length and the coordinates it ends at are
// sums of double-precision terms, each good to about one part in 2^52 of its
// size. Four ulps of the largest bounded the GDD error measured on the
// reference layouts (four-prism, prism pair, single prism, grating pair,
// stretcher; 1 to 0.001 nm) by a factor of 5.7 or more.
const PATH_ROUNDING = 4 * Number.EPSILON;

// The polynomial coefficients through phases at the points' x, after taking
// off the line through the outermost points (the phases' linear part is
// group delay, much larger than the curvature). Linear in the phases.
function fitPhases(xs, phis) {
  const n = xs.length, first = 0, last = n - 1;
  const slope = (phis[last] - phis[first]) / (xs[last] - xs[first]);
  const residual = phis.map((phi, i) => (phi - phis[first]) - slope * (xs[i] - xs[first]));
  const scale = Math.max(...xs.map(Math.abs));
  if (!(scale > 0)) return null;
  const c = polynomialFit(xs.map(x => x / scale), residual, Math.min(n - 1, 4));
  if (!c || !c.every(Number.isFinite)) return null;
  const coefficient = j => (j < c.length ? c[j] / scale ** j : 0);
  return { a1: coefficient(1) + slope, a2: coefficient(2), a3: coefficient(3), a4: coefficient(4) };
}

// samples: [{ wavelengthNm, pathMm, cycles }], one per distinct wavelength.
// Returns { gddFs2, todFs3, fodFs4, delaySpreadFs, gddNoiseFs2 } or null when
// fewer than three wavelengths arrive or a number is not finite. TOD and FOD
// are zero where too few samples arrive to fit them. The delay spread is the
// group delay of the red band edge minus the blue one, the convention of
// glassGroupDelayDifferenceFs; null without both edges. `coordinateScaleMm`
// is the size of the coordinates the paths were measured in, which bounds
// their rounding together with the paths' own length.
//
// The phases are taken relative to the sample nearest the centre:
// (path − path_ref)/λ + (cycles − cycles_ref). What that leaves out,
// path_ref/λ = path_ref ω/2πc and a constant, is linear in ω and carries no
// GDD; kept in, its 1e7 rad would bury the curvature of a narrow band.
// `gddNoiseFs2` is what the paths' rounding can move the GDD by: the GDD is
// gddFs2 ± gddNoiseFs2. It grows as the band narrows and as the coordinates
// grow, so a caller that relies on the GDD has to check it.
export function pathPhaseFit(samples, centerNm, { loNm = null, hiNm = null, coordinateScaleMm = 0 } = {}) {
  if (!(centerNm > 0) || !Array.isArray(samples)) return null;
  const w0 = omegaOf(centerNm);
  const sorted = samples.filter(s => [s.wavelengthNm, s.pathMm, s.cycles || 0].every(Number.isFinite))
    .map(s => ({ ...s, x: omegaOf(s.wavelengthNm) - w0 })).sort((p, q) => p.x - q.x);
  if (sorted.length < 3 || sorted.length !== samples.length) return null;
  for (let i = 1; i < sorted.length; i++) if (!(sorted[i].x > sorted[i - 1].x)) return null;
  const ref = sorted.reduce((best, p) => (Math.abs(p.x) < Math.abs(best.x) ? p : best));
  const xs = sorted.map(p => p.x);
  const phis = sorted.map(p => 2 * Math.PI * ((p.pathMm - ref.pathMm) / (p.wavelengthNm * 1e-6) + ((p.cycles || 0) - (ref.cycles || 0))));
  const fit = fitPhases(xs, phis);
  if (!fit) return null;
  const { a1, a2, a3, a4 } = fit;
  const delayAt = nm => {
    const x = omegaOf(nm) - w0;
    return a1 + 2 * a2 * x + 3 * a3 * x * x + 4 * a4 * x ** 3;
  };
  const gddFs2 = 2 * a2, todFs3 = 6 * a3, fodFs4 = 24 * a4;
  const delaySpreadFs = loNm > 0 && hiNm > loNm ? delayAt(hiNm) - delayAt(loNm) : null;
  if (![gddFs2, todFs3, fodFs4].every(Number.isFinite)) return null;
  // Rounding: each phase can be off by δφ; the fit is linear in the phases,
  // so the GDD can move by δφ times the sum of its sensitivities.
  const shortestMm = Math.min(...sorted.map(p => p.wavelengthNm)) * 1e-6;
  const largestPath = Math.max(...sorted.map(p => Math.abs(p.pathMm)), Math.abs(coordinateScaleMm));
  const largestCycles = Math.max(...sorted.map(p => Math.abs(p.cycles || 0)));
  const phaseNoise = 2 * Math.PI * PATH_ROUNDING * (largestPath / shortestMm + largestCycles);
  let gain = 0;
  for (let k = 0; k < xs.length; k++) {
    const unit = fitPhases(xs, xs.map((_, i) => (i === k ? 1 : 0)));
    gain += Math.abs(2 * (unit?.a2 ?? Infinity));
  }
  const gddNoiseFs2 = phaseNoise * gain;
  return { gddFs2, todFs3, fodFs4, delaySpreadFs: Number.isFinite(delaySpreadFs) ? delaySpreadFs : null, gddNoiseFs2 };
}

// The phase a fit has beyond second order at a wavelength, in rad.
export function higherOrderPhaseRad(fit, centerNm, wavelengthNm) {
  const x = omegaOf(wavelengthNm) - omegaOf(centerNm);
  return fit.todFs3 / 6 * x ** 3 + fit.fodFs4 / 24 * x ** 4;
}
