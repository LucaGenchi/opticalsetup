// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Coupling into a single-mode fiber at the image: the overlap of the field
// the lens delivers with the fiber's mode, taken as a Gaussian of 1/e²
// radius w₀ = MFD/2 at the fiber's face. Coherent, scalar, monochromatic;
// one field point (Wagner and Tomlinson's overlap; Goodman, ch. 6).
//
// The overlap is evaluated in the exit pupil, on the reference sphere
// centred on the fiber's core (so the fiber's lateral and axial offsets
// enter exactly, through the optical paths to that sphere, instead of as a
// small-offset phase). On a sphere centred on its waist, the mode's far
// field has a flat phase and a Gaussian amplitude in the direction s of the
// light arriving at the core:
//
//   M(s) = exp(−sin²α/θ₀²),   θ₀ = λ/(π n w₀),
//
// with α the angle between s and the fiber's axis (the primary chief ray's
// direction, turned by the fiber's tilt). This holds while the sphere is
// far from the waist compared with the mode's Rayleigh range (always, for a
// fiber behind a lens). With the pupil function P = A·exp(−2πi W) over the
// same directions,
//
//   η = |∫ P M* dΩ|² / (∫ |P|² dΩ · ∫ |M|² dΩ),
//
// the last over all directions (π θ₀²/2 for a narrow mode; see modeNorm):
// the part of the mode the pupil does not fill is lost coupling (mode
// mismatch). The pupil samples are uniform in pupil coordinates; each
// stands for the solid angle dΩ its rays fill on the sphere (from the local
// derivatives of their directions) and carries the power A² of its pupil
// cell, so its amplitude there is A/√dΩ. (The PSF instead treats the
// samples as evenly spaced in direction, which the FFT needs; the overlap
// is a plain sum and can take the exact measure.) Every quantity here is
// geometric (paths to a sphere, directions, angles from an axis), so no
// sign convention enters: offsets and tilts act the way the rays do.
//
// η is the fraction of the light reaching the fiber's face that enters its
// mode. The light lost before that is reported beside it: the Gaussian
// beam's tail outside the entrance pupil, the apertures (vignetting), and,
// on request, the reflections of uncoated surfaces at normal incidence.

import { traceBundle, opdWaves, sphereCrossing } from './wavefront.js';
import { illumination, pupilSamples, largestStep } from './diffraction.js';
import { monochromaticPupil, bundleChecks } from './pupil.js';

// Above this half-angle (rad) the mode's far field is not paraxial.
export const MODE_LIMIT = 0.3;
export const SCAN_POINTS = 61;

const fmt = (v, d = 3) => String(Number(Number(v).toPrecision(d)));

// 1, 2 or 5 times a power of ten, at least v.
function niceUp(v) {
  const p = 10 ** Math.floor(Math.log10(v)), m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

// Maximum of f on [a, b] by golden section.
function goldenMax(f, a, b, steps = 60) {
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = f(x1), f2 = f(x2);
  for (let i = 0; i < steps; i++) {
    if (f1 > f2) { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = f(x1); } else { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = f(x2); }
  }
  return f1 > f2 ? [x1, f1] : [x2, f2];
}

// ∫ |M|² dΩ over the hemisphere for M = exp(−sin²α/θ²):
// 2π ∫₀¹ exp(−2(1 − u²)/θ²) du = √2 π θ D(√2/θ), D Dawson's integral, whose
// asymptotic series gives (πθ²/2)(1 + θ²/4 + 3θ⁴/16 + 15θ⁶/64 + …); at the
// largest θ allowed (0.3) the terms kept leave below 10⁻⁷.
export function modeNorm(theta) {
  const t2 = theta * theta;
  let term = 1, sum = 1;
  for (let k = 1; k <= 8; k++) { term *= (2 * k - 1) * t2 / 4; sum += term; }
  return Math.PI * t2 / 2 * sum;
}

// Uncoated surfaces at normal incidence: the transmitted fraction,
// Π (1 − R), R = ((n − n′)/(n + n′))², over every real surface. An ideal
// lens has no surface.
export function fresnelTransmission(sys, n) {
  let T = 1;
  sys.surfaces.forEach((s, j) => {
    if (s.type === 'paraxial') return;
    const R = ((n[j] - n[j + 1]) / (n[j] + n[j + 1])) ** 2;
    T *= 1 - R;
  });
  return T;
}

export function analyzeCoupling(input, { scans = true, ...options } = {}) {
  const p = monochromaticPupil(input, options);
  if (!p.ok) return { ok: false, errors: p.errors, warnings: p.warnings ?? [] };
  const { sys, sphere, scale, nm } = p;
  const d = sys.diffraction, fiber = sys.coupling, N = d.grid;
  const lambda = nm * 1e-6, n = scale.n;
  const warnings = [...p.warnings];
  const w0 = fiber.mfdUm * 1e-3 / 2;
  const theta0 = lambda / (Math.PI * n * w0);
  if (theta0 > MODE_LIMIT) {
    return { ok: false, errors: [`A mode-field diameter of ${fmt(fiber.mfdUm, 3)} µm at ${fmt(nm, 4)} nm spreads at ${fmt(theta0 * 1e3, 3)} mrad (1/e² half-angle), beyond the ${MODE_LIMIT * 1e3} mrad the paraxial Gaussian mode allows. Check the mode-field diameter.`], warnings };
  }

  const g = pupilSamples(N, 2 / N);
  const bundle = traceBundle(p.model, p.fieldValue, g.px, g.py, { clip: d.vignetting });
  const opd = opdWaves(bundle, p.chief, p.zImage, sphere);
  const checks = bundleChecks(p, bundle, opd, g, largestStep(g, opd));
  if (checks.error) return { ok: false, errors: [checks.error], warnings };
  warnings.push(...checks.warnings);
  const lit = Float64Array.from(g.px, (x, k) => illumination(d, x * x + g.py[k] ** 2));
  const E = [0, 0, p.zXp];
  // The fiber's axis: along the primary chief ray, turned by the tilt.
  const c = p.chiefDirection;
  const ax = c[0] + Math.sin(fiber.tiltXMrad * 1e-3), ay = c[1] + Math.sin(fiber.tiltYMrad * 1e-3);
  if (!(ax * ax + ay * ay < 1)) return { ok: false, errors: ['The fiber’s tilt turns it beyond 90° from the axis.'], warnings };
  const fiberAxis = [ax, ay, Math.sqrt(1 - ax * ax - ay * ay)];
  // The mode's far field across the pupil, in samples: too few integrate
  // badly.
  const modeSamples = theta0 / (Math.max(Math.abs(scale.ax), Math.abs(scale.ay)) * g.dpx);
  if (modeSamples < 2) warnings.push({ kind: 'mode-sampling', text: `The fiber mode’s far field is only ${fmt(modeSamples, 2)} pupil samples wide, too few to integrate well; choose a finer pupil grid. (Such a wide mode is badly matched to this beam anyway.)` });

  // Each sample's neighbours on the N × N grid, for the local derivatives
  // of the directions.
  const where = new Int32Array(N * N).fill(-1);
  g.index.forEach((ix, k) => { where[ix] = k; });
  const near = (k, di, dj) => {
    const i = Math.floor(g.index[k] / N) + di, j = (g.index[k] % N) + dj;
    return i >= 0 && i < N && j >= 0 && j < N ? where[i * N + j] : -1;
  };
  const nb = Array.from({ length: bundle.K }, (_, k) => [near(k, 0, -1), near(k, 0, 1), near(k, -1, 0), near(k, 1, 0)]);
  const affine = Math.abs(scale.ax * scale.ay);

  // The light arriving at a core at C (mm), on the sphere centred there:
  // each sample's direction s to C, its solid angle dΩ (from the local
  // derivatives of s over the pupil grid), and its amplitude A·√dΩ·e^{−2πiW}
  // (the pupil sample carries power A² over dΩ). `aberrated: false` drops
  // W: a perfect lens with the same pupil.
  const field = (C, aberrated = true) => {
    const R = Math.hypot(C[0] - E[0], C[1] - E[1], C[2] - E[2]);
    const K = bundle.K;
    const sx = new Float64Array(K).fill(NaN), sy = new Float64Array(K).fill(NaN), sz = new Float64Array(K).fill(NaN), opl = new Float64Array(K).fill(NaN);
    let sum = 0, count = 0;
    for (let k = 0; k < K; k++) {
      if (!bundle.valid[k]) continue;
      const hit = sphereCrossing(bundle, k, C[2], C, R);
      if (!hit) continue;
      sx[k] = (C[0] - hit.point[0]) / R; sy[k] = (C[1] - hit.point[1]) / R; sz[k] = (C[2] - hit.point[2]) / R;
      opl[k] = hit.opl; sum += hit.opl; count++;
    }
    const chief = p.chief.valid[0] ? sphereCrossing(p.chief, 0, C[2], C, R) : null;
    const ref = chief ? chief.opl : sum / Math.max(1, count);
    const slope = (v, k, a, b, span) => {
      const lo = a >= 0 && Number.isFinite(v[a]) ? a : k, hi = b >= 0 && Number.isFinite(v[b]) ? b : k;
      return lo === hi ? NaN : (v[hi] - v[lo]) / (span * ((lo === k || hi === k) ? 1 : 2));
    };
    const out = { s: [], re: [], im: [], power: 0 };
    for (let k = 0; k < K; k++) {
      if (!Number.isFinite(sx[k])) continue;
      const [l, r, dn, up] = nb[k];
      const J = slope(sx, k, l, r, g.dpx) * slope(sy, k, dn, up, g.dpy) - slope(sx, k, dn, up, g.dpy) * slope(sy, k, l, r, g.dpx);
      const dOmega = (Number.isFinite(J) ? Math.abs(J) : affine) * g.dpx * g.dpy / sz[k];
      const a = lit[k] * Math.sqrt(dOmega), ph = aberrated ? -2 * Math.PI * (ref - opl[k]) / lambda : 0;
      out.s.push([sx[k], sy[k], sz[k]]);
      out.re.push(a * Math.cos(ph)); out.im.push(a * Math.sin(ph));
      out.power += lit[k] * lit[k];
    }
    return out;
  };
  // η for a mode of far-field radius θ about axis `a`: the mode is
  // exp(−sin²α/θ²), α the angle from the axis (|s × a| = sin α).
  const eta = (f, a = fiberAxis, theta = theta0) => {
    let re = 0, im = 0;
    for (let k = 0; k < f.re.length; k++) {
      const [x, y, z] = f.s[k];
      const s2 = (y * a[2] - z * a[1]) ** 2 + (z * a[0] - x * a[2]) ** 2 + (x * a[1] - y * a[0]) ** 2;
      const m = Math.exp(-s2 / (theta * theta));
      re += f.re[k] * m; im += f.im[k] * m;
    }
    return f.power > 0 ? (re * re + im * im) / (f.power * modeNorm(theta)) : 0;
  };
  const C0 = sphere.C;
  const at = (dxUm, dyUm, dzUm) => [C0[0] + dxUm * 1e-3, C0[1] + dyUm * 1e-3, C0[2] + dzUm * 1e-3];
  const coupledAt = (dxUm, dyUm, dzUm) => eta(field(at(dxUm, dyUm, dzUm)));

  const aligned = field(C0), ideal = field(C0, false);
  const result = {
    ideal: eta(ideal, c),
    aligned: eta(aligned, c),
    eta: coupledAt(fiber.offsetXUm, fiber.offsetYUm, fiber.axialUm),
  };
  // The mode that suits this beam best, aligned with the chief ray: over
  // the paraxial range of mode sizes, a scan in log θ₀ then golden section.
  const lo = Math.log(0.02 * Math.min(p.na.x, p.na.y)), hi = Math.log(MODE_LIMIT);
  const grid = Array.from({ length: 49 }, (_, k) => lo + (hi - lo) * k / 48);
  let bestK = 0, bestV = -1;
  grid.forEach((u, k) => { const v = eta(aligned, c, Math.exp(u)); if (v > bestV) { bestV = v; bestK = k; } });
  const [uBest, etaBest] = goldenMax(u => eta(aligned, c, Math.exp(u)), grid[Math.max(0, bestK - 1)], grid[Math.min(48, bestK + 1)]);
  const bestMfdUm = 2e3 * lambda / (Math.PI * n * Math.exp(uBest));

  // Light that reaches the face: the Gaussian beam's tail outside the
  // entrance pupil, then the apertures.
  const inPupil = d.illumination === 'gaussian' ? 1 - Math.exp(-2 / (d.beamRatio * d.beamRatio)) : 1;
  let all = 0;
  for (const a of lit) all += a * a;
  const transmission = all > 0 ? aligned.power / all : 0;
  const fresnel = fresnelTransmission(sys, p.model.n);
  const throughput = inPupil * transmission * (fiber.fresnel ? fresnel : 1);

  // Scans through the current position, each along one coordinate.
  let scan = null;
  if (scans) {
    const spot = lambda / (Math.PI * n * Math.min(p.na.x, p.na.y));
    const lateral = niceUp(Math.max(3 * Math.max(w0, spot) * 1e3, 1.25 * Math.abs(fiber.offsetXUm), 1.25 * Math.abs(fiber.offsetYUm)));
    const zR = Math.PI * w0 * w0 * n / lambda;
    const axial = niceUp(Math.max(Math.max(3 * zR, 2 * n * lambda / Math.min(p.na.x, p.na.y) ** 2) * 1e3, 1.25 * Math.abs(fiber.axialUm)));
    const line = range => Float64Array.from({ length: SCAN_POINTS }, (_, k) => -range + 2 * range * k / (SCAN_POINTS - 1));
    const xs = line(lateral), zs = line(axial);
    scan = {
      lateral: xs, axial: zs,
      x: Float64Array.from(xs, v => coupledAt(v, fiber.offsetYUm, fiber.axialUm)),
      y: Float64Array.from(xs, v => coupledAt(fiber.offsetXUm, v, fiber.axialUm)),
      z: Float64Array.from(zs, v => coupledAt(fiber.offsetXUm, fiber.offsetYUm, v)),
    };
  }

  for (const v of [result.ideal, result.aligned, result.eta, etaBest]) {
    if (!Number.isFinite(v)) return { ok: false, errors: ['The coupling is not finite; this is a bug worth reporting.'], warnings };
  }
  return {
    ok: true, warnings,
    nm, wavelength: p.wi, field: p.fi, fieldValue: p.fieldValue, fieldUnit: sys.fields.type === 'angle' ? '°' : 'mm',
    fiber: { ...fiber }, chiefAngle: { x: Math.asin(c[0]), y: Math.asin(c[1]) }, modeRadius: w0, modeDivergence: theta0, modeRayleigh: Math.PI * w0 * w0 * n / lambda,
    na: p.na, ...result,
    best: { mfdUm: bestMfdUm, eta: etaBest },
    inPupil, transmission, fresnel, fresnelApplied: fiber.fresnel, throughput,
    total: throughput * result.eta,
    samplesAcross: N, rays: bundle.K, illumination: { ...d },
    scan,
  };
}
