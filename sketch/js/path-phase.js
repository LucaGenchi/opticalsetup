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

// samples: [{ wavelengthNm, pathMm, cycles }], one per distinct wavelength.
// Returns { gddFs2, todFs3, fodFs4, delaySpreadFs } or null when fewer than
// three wavelengths arrive or a number is not finite. TOD and FOD are zero
// where too few samples arrive to fit them. The delay spread is the group
// delay of the red band edge minus the blue one, the convention of
// glassGroupDelayDifferenceFs; null without both edges.
export function pathPhaseFit(samples, centerNm, { loNm = null, hiNm = null } = {}) {
  if (!(centerNm > 0) || !Array.isArray(samples)) return null;
  const w0 = omegaOf(centerNm);
  const points = samples.map(s => ({
    x: omegaOf(s.wavelengthNm) - w0,
    phi: 2 * Math.PI * (s.pathMm / (s.wavelengthNm * 1e-6) + (s.cycles || 0)),
  })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.phi)).sort((p, q) => p.x - q.x);
  if (points.length < 3 || points.length !== samples.length) return null;
  for (let i = 1; i < points.length; i++) if (!(points[i].x > points[i - 1].x)) return null;
  // The phases are about 1e7 rad and the part that carries the GDD is about
  // 1 rad, so the line through the outermost samples comes off first.
  const first = points[0], last = points[points.length - 1];
  const slope = (last.phi - first.phi) / (last.x - first.x);
  const residual = points.map(p => (p.phi - first.phi) - slope * (p.x - first.x));
  const scale = Math.max(...points.map(p => Math.abs(p.x)));
  if (!(scale > 0)) return null;
  const degree = Math.min(points.length - 1, 4);
  const c = polynomialFit(points.map(p => p.x / scale), residual, degree);
  if (!c || !c.every(Number.isFinite)) return null;
  // Back to powers of x = ω − ω₀; the trend adds to the linear term.
  const coefficient = j => (j < c.length ? c[j] / scale ** j : 0);
  const a1 = coefficient(1) + slope, a2 = coefficient(2), a3 = coefficient(3), a4 = coefficient(4);
  const delayAt = nm => {
    const x = omegaOf(nm) - w0;
    return a1 + 2 * a2 * x + 3 * a3 * x * x + 4 * a4 * x ** 3;
  };
  const gddFs2 = 2 * a2, todFs3 = 6 * a3, fodFs4 = 24 * a4;
  const delaySpreadFs = loNm > 0 && hiNm > loNm ? delayAt(hiNm) - delayAt(loNm) : null;
  if (![gddFs2, todFs3, fodFs4].every(Number.isFinite)) return null;
  return { gddFs2, todFs3, fodFs4, delaySpreadFs: Number.isFinite(delaySpreadFs) ? delaySpreadFs : null };
}

// The phase a fit has beyond second order at a wavelength, in rad.
export function higherOrderPhaseRad(fit, centerNm, wavelengthNm) {
  const x = omegaOf(wavelengthNm) - omegaOf(centerNm);
  return fit.todFs3 / 6 * x ** 3 + fit.fodFs4 / 24 * x ** 4;
}
