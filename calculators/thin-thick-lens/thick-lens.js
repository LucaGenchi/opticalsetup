// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Thin and thick lenses focusing a laser: a collimated CW Gaussian beam
// through an ideal thin lens or a spherical singlet of catalogue glass in
// air (plano-convex either way round, or bi-convex), its focus, and its
// coupling into a single-mode fiber, and how it falls as the fiber moves
// across the axis, along it, or tilts.
//
// Conventions. Light travels toward +z; a radius is positive when its centre
// of curvature lies after its vertex (R₁ > 0 and R₂ < 0 for a bi-convex
// lens), 0 for a flat face. Positions along the axis are signed, positive
// toward +z: H from the front vertex V₁, H′ from the back vertex V₂.
//
// The lens data come from the lens designer's paraxial (y-nu) trace
// (calculators/lens-design/engine/paraxial.js): two rays give the system
// matrix from V₁ to V₂, and from it f, the back and front focal distances
// and the principal planes, which the Python reference checks against the
// thick-lens formulas
//
//   1/f = (n − 1)[1/R₁ − 1/R₂ + (n − 1)t/(n R₁R₂)],
//   H = −f(n − 1)t/(n R₂) from V₁,   H′ = −f(n − 1)t/(n R₁) from V₂.
//
// A singlet is given by its radii and centre thickness, or designed from its
// focal length, clear diameter and edge thickness (designLens): a
// plano-convex lens has R = (n − 1)f whatever its thickness; a bi-convex one,
// equi-convex or of the best form for a collimated beam, is solved for f.
//
// The beam is a collimated TEM₀₀ beam with its waist at V₁. Its paraxial
// focus is Self's thin-lens result between the principal planes. Through
// focus, two lenses are followed: the real singlet, traced by the lens
// designer's engine, and an ideal lens of the same focal length that obeys
// the sine condition (an aplanat: a ray at height h leaves toward the focus
// at sin θ = h/f), both lit by the beam and limited by the clear aperture.
// On axis their pupils are round, so the focus is the Debye integral in one
// dimension, carried through focus in the Debye-Wolf form (see focusFrom),
// with the wavefront W from the traced rays, and the fiber coupling the
// overlap the engine's coupling.js takes, its azimuth integrated exactly
// when the fiber is set off. Units: mm, wavelengths in nm, focal spots and
// fiber modes in µm.

import { defaultsFor, parseInputs, unavailable } from '../assets/calculator-inputs.js';
import { GLASSES, glassWavelengthRange, isWavelengthInGlassRange } from '../../sketch/js/glass.js';
import { gaussianBeam, thinLensFocus } from '../gaussian-beam/gaussian-beam.js';
import { fiberMode, MARCUSE_V } from '../fiber-coupling/fiber-coupling.js';
import { besselJ0 } from '../point-scanning/psf.js';
import { normalizeSystem } from '../lens-design/engine/system.js';
import { firstOrder, paraxialRay } from '../lens-design/engine/paraxial.js';
import { materialIndex, glassShortName } from '../lens-design/engine/materials.js';
import { traceModel } from '../lens-design/engine/trace.js';
import { traceBundle, referenceSphere, sphereCrossing } from '../lens-design/engine/wavefront.js';
import { illumination } from '../lens-design/engine/diffraction.js';
import { modeNorm, MODE_LIMIT } from '../lens-design/engine/coupling.js';
import { thickLensAdjustment } from '../../sketch/js/elements.js';

// The share of a Gaussian beam's power inside its 1/e² radius, which also
// defines the focus radius drawn for any beam: the radius holding this much.
export const GAUSSIAN_SHARE = 1 - Math.exp(-2);
// The beam fills the pupil out to this many 1/e² radii (or the clear
// aperture, if smaller): beyond 3.5 w lies 2 × 10⁻¹¹ of the power, and the
// edge's ringing no longer moves the focus radius (it does by 5 × 10⁻⁴ at 2.5 w).
export const PUPIL_BEAM_RADII = 3.5;
// The engine's beam-to-pupil ratio range.
const BEAM_RATIO_MAX = 10;
// Radial pupil samples (powers of two: coarser strides divide them), tried
// in turn until every integral is resolved, the fewest Simpson intervals
// used, and the largest wavefront step (waves) and Bessel phase step (rad)
// per interval. With wavefront steps up to 0.25 waves the singlet's peak
// and coupling stay within 3 × 10⁻⁶ of their values on 16384 samples
// (plano-convex singlets both ways round, 2 to 4 mm beams, 400 to 1550 nm,
// planes from 1 mm before F′ to 1 mm after); 0.5 waves leave 10⁻⁴. A fiber
// mode's far field exp(−s²/θ₀²) gets at least MODE_STEPS intervals per θ₀.
export const PUPIL_SAMPLES = [1024, 4096];
const RHO = PUPIL_SAMPLES[0], MIN_INTERVALS = 64, MAX_WAVE_STEP = 0.25, MAX_BESSEL_STEP = 0.25, MODE_STEPS = 8;
// Steps of the radius grid per λ/s_max, and the farthest radius it reaches,
// in λ/s_max: where the Bessel phase step on the coarsest pupil grid
// reaches MAX_BESSEL_STEP, so every grid resolves it there. A spot wider
// than that is not measured.
const R_STEPS = 16, R_REACH = MAX_BESSEL_STEP * RHO / (2 * Math.PI);
// Planes in the focus scans.
export const SCAN_POINTS = 41;
// Beyond this rim NA the page shows no focus; beyond HIGH_NA it warns that
// scalar diffraction ignores polarization; below FRESNEL_LIMIT that the
// focus is not where the Debye integral puts it (engine/diffraction.js).
export const MAX_RIM_NA = 0.9, HIGH_NA = 0.6, FRESNEL_LIMIT = 10;

export const GLASS_CHOICES = [...GLASSES.values()].map(g => [g.id, g.label]);

// ---------------------------------------------------------------- lens

const curvature = r => (r ? 1 / r : 0);

// First-order data at one wavelength, from two y-nu rays through the
// engine's surfaces: A enters at height 1, parallel; B at the vertex with
// unit slope. Their heights at V₂ and slopes after it are the columns of
// the system matrix [y₂, u₂] = [[A_y, B_y], [A_u, B_u]] [y₁, u₁].
export function lensData({ glass, wavelengthNm, r1Mm, r2Mm, thicknessMm }) {
  const n = materialIndex(glass, wavelengthNm);
  const sys = { surfaces: [{ type: 'standard', radius: r1Mm, thickness: thicknessMm }, { type: 'standard', radius: r2Mm, thickness: 0 }] };
  const media = [1, n, 1];
  const A = paraxialRay(sys, media, 1, 0), B = paraxialRay(sys, media, 0, 1);
  const matrix = { Ay: A.y[1], Au: A.u[1], By: B.y[1], Bu: B.u[1] };
  const power = -matrix.Au;
  const thinPower = (n - 1) * (curvature(r1Mm) - curvature(r2Mm));
  if (Math.abs(power) < 1e-12) return { n, matrix, power: 0, afocal: true, thinPower, thinFocalMm: thinPower ? 1 / thinPower : Infinity };
  const efl = 1 / power;
  const bfl = -matrix.Ay / matrix.Au, ffl = -matrix.Bu / matrix.Au;
  return {
    n, matrix, power, afocal: false, efl, bfl, ffl,
    // H from V₁ (its focal point lies f before it), H′ from V₂.
    h1Mm: efl - ffl, h2Mm: bfl - efl,
    thinPower, thinFocalMm: thinPower ? 1 / thinPower : Infinity,
    // Coddington's shape factor (R₂ + R₁)/(R₂ − R₁): −1 and +1 are the two
    // plano-convex orientations, 0 equi-convex.
    shape: shapeFactor(r1Mm, r2Mm),
  };
}

function shapeFactor(r1, r2) {
  const c1 = curvature(r1), c2 = curvature(r2);
  return c1 === c2 ? null : (c1 + c2) / (c1 - c2);
}

// Sag of a spherical face at height h (null when the sphere is smaller).
export function sagMm(r, h) {
  if (!r) return 0;
  if (Math.abs(r) < h) return null;
  return r - Math.sign(r) * Math.sqrt(r * r - h * h);
}

// ---------------------------------------------------------------- beam

// The ideal focus of a collimated TEM₀₀ beam (waist at V₁): a thin lens of
// focal length f at H, seen from H′ (Self's equations).
export function idealFocus(lens, beamDiameterMm, wavelengthNm) {
  const input = gaussianBeam({ waistUm: beamDiameterMm * 500, wavelengthNm });
  const focus = thinLensFocus(input, lens.h1Mm, lens.efl);
  return {
    waistUm: focus.beam.waistUm, rayleighMm: focus.beam.rayleighMm, halfAngleMrad: focus.beam.halfDivergenceMrad,
    fromH2Mm: focus.distanceMm, fromV2Mm: focus.distanceMm + lens.h2Mm,
  };
}

// The share of the beam a round aperture of diameter D passes.
export const apertureShare = (diameterMm, beamDiameterMm) => 1 - Math.exp(-2 * (diameterMm / beamDiameterMm) ** 2);

// The pupil the beam fills: out to PUPIL_BEAM_RADII of its 1/e² radius, or
// to the clear aperture if that is smaller; `beamRatio` is the beam's 1/e²
// radius in units of the pupil's (the engine's convention).
export function beamPupil(v) {
  const w = v.beamDiameterMm / 2, epd = Math.min(v.diameterMm, 2 * PUPIL_BEAM_RADII * w);
  return { epd, beamRatio: w / (epd / 2) };
}

// The real singlet as the lens designer's engine describes it: the front
// face is the stop, the back face clips at the clear diameter.
export function singletSystem(v, lens) {
  const { epd, beamRatio } = beamPupil(v);
  return {
    name: 'Singlet', object: { atInfinity: true }, aperture: { type: 'epd', value: epd }, fields: { type: 'angle', values: [0] },
    wavelengthsNm: [v.wavelengthNm], primaryWavelength: 0, image: { focus: 'paraxial' },
    surfaces: [{ radius: v.r1Mm, thickness: v.thicknessMm, material: v.glass, stop: true }, { radius: v.r2Mm, thickness: lens.bfl, semiDiameter: v.diameterMm / 2 }],
    diffraction: { grid: 64, padding: 2, illumination: 'gaussian', beamRatio, vignetting: true },
  };
}

// Simpson weights on n (even) intervals of [0, 1].
function simpson(n) {
  const w = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) w[i] = (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) / (3 * n);
  return w;
}

// n + 1 evenly spaced pupil radii from 0 to 1.
const grids = new Map();
const pupilGrid = n => {
  if (!grids.has(n)) grids.set(n, Float64Array.from({ length: n + 1 }, (_, k) => k / n));
  return grids.get(n);
};

// The real singlet's rays, traced by the engine along one radius of the
// pupil (the x–z plane), as they leave the back face.
export function singletRays(v, lens, samples = RHO) {
  const sys = normalizeSystem(singletSystem(v, lens));
  const fo = firstOrder(sys, v.wavelengthNm);
  if (!fo.ok) return { ok: false, reason: fo.reason };
  const model = traceModel(sys, v.wavelengthNm, fo);
  const grid = pupilGrid(samples);
  const bundle = traceBundle(model, 0, grid, new Float64Array(samples + 1));
  return {
    ok: true, bundle, zFocus: model.zLast + fo.imageDistance, zXp: Number.isFinite(fo.zXp) ? model.zLast + fo.zXp : model.zLast,
    amp: Float64Array.from(grid, (r, k) => (bundle.valid[k] ? illumination(sys.diffraction, r * r) : 0)),
    clipped: bundle.failed.clipped ?? 0,
  };
}

// The ideal lens: aplanatic (it obeys the sine condition, sin θ = h/f), so
// a beam of height h leaves it toward the focus at sin θ = h/f with no
// wavefront error. Its rays, in the engine's bundle format, all pass
// through the focus F at z = f with equal optical paths; its exit pupil is
// the sphere of radius f about F.
export function aplanaticRays(v, lens, samples = RHO) {
  const { epd, beamRatio } = beamPupil(v);
  const f = lens.efl, K = samples + 1, grid = pupilGrid(samples);
  const P = new Float64Array(3 * K), D = new Float64Array(3 * K);
  for (let k = 0; k < K; k++) {
    const s = epd / 2 * grid[k] / f;
    P[3 * k + 2] = f;
    D[3 * k] = -s; D[3 * k + 2] = Math.sqrt(1 - s * s);
  }
  const bundle = { K, px: grid, valid: new Uint8Array(K).fill(1), P, D, opl: new Float64Array(K), nImage: 1, wavelengthNm: v.wavelengthNm };
  return { ok: true, bundle, zFocus: f, zXp: 0, amp: Float64Array.from(grid, r => Math.exp(-r * r / (beamRatio * beamRatio))), clipped: 0 };
}

// The focus of one lens on axis, from its rays: evaluated at any plane
// (`shiftMm` from its paraxial focus). Each ray's wavefront W (waves, from
// the axial ray) on the reference sphere about the paraxial focus through
// the exit pupil, and the sphere's direction there, s = sin θ of its angle
// to the axis. The pupil maps onto directions with the area ratio
// J = (s/ρ) ds/dρ, and a plane wave of direction s spans the solid angle
// dΩ = d²s / cos θ, so a ray of power A² per unit pupil area has the
// amplitude A √(cos θ / J) per unit solid angle (the measure the engine's
// coupling uses; its FFT fits one scale a instead, s = aρ). The Debye
// integral sums those amplitudes over d²s / cos θ:
//
//   U(r) = 2π ∫ A √(J / cos θ) e^(−2πiW) J₀(2π s r/λ) ρ dρ,
//
// for the aplanat the familiar √cos θ apodization over the solid angle.
// `resolved()` says whether every integral taken so far had steps fine
// enough for its wavefront and Bessel phase; if not, the rays must be
// traced on a finer grid.
export function focusFrom({ bundle, zFocus, zXp, amp }) {
  const lambda = bundle.wavelengthNm * 1e-6;
  if (!bundle.valid[0]) return { ok: false, reason: 'The axial ray does not reach the focus.' };
  const lit = amp.reduce((n, a) => n + (a > 0 ? 1 : 0), 0);
  if (lit < 8) return { ok: false, reason: 'Apertures cut nearly all of the beam.' };
  const N = bundle.K - 1, rho = pupilGrid(N), w = simpson(N);
  // ∫ A² ρ dρ: the power, the same at every plane.
  let sumA2 = 0;
  for (let k = 0; k <= N; k++) sumA2 += w[k] * amp[k] * amp[k] * rho[k];

  // The pupil on the reference sphere about the paraxial focus: each ray's
  // wavefront W0 there and its direction s (the sphere's normal at the
  // ray), with its area ratio J.
  const { C, R } = referenceSphere(bundle, zFocus, zXp);
  const s = new Float64Array(N + 1).fill(NaN), w0 = new Float64Array(N + 1).fill(NaN);
  const ref = sphereCrossing(bundle, 0, zFocus, C, R).opl;
  for (let k = 0; k <= N; k++) {
    if (!(amp[k] > 0)) continue;
    const hit = sphereCrossing(bundle, k, zFocus, C, R);
    if (!hit) continue;
    s[k] = Math.abs(C[0] - hit.point[0]) / R;
    w0[k] = (ref - hit.opl) / lambda;
  }
  // The weight A √(J / cos θ), and ∫ A² ρ dρ / cos θ over the same rays:
  // the integral of |U|² over a plane (Parseval), which the radius holding
  // a share of the power is taken against.
  const weight = new Float64Array(N + 1);
  let sMax = 0, sumA2c = 0, dsMax = 0;
  for (let k = 0; k <= N; k++) {
    if (!Number.isFinite(s[k])) continue;
    const lo = k > 0 && Number.isFinite(s[k - 1]) ? k - 1 : k, hi = k < N && Number.isFinite(s[k + 1]) ? k + 1 : k;
    if (lo === hi) continue;
    const ds = (s[hi] - s[lo]) / (rho[hi] - rho[lo]), cos = Math.sqrt(1 - s[k] * s[k]);
    weight[k] = amp[k] * Math.sqrt(Math.abs(k ? s[k] / rho[k] * ds : ds * ds) / cos);
    sumA2c += w[k] * amp[k] * amp[k] * rho[k] / cos;
    sMax = Math.max(sMax, s[k]);
    dsMax = Math.max(dsMax, Math.abs(ds));
  }
  // Another plane, Δz past the focus: each plane wave of the Debye integral
  // advances by Δz cos θ, so W = W0 + Δz (1 − cos θ)/λ (from the axial
  // wave). This is the angular spectrum of the focal field carried to the
  // plane, exact within the Debye approximation.
  const plane = shiftMm => {
    const opd = Float64Array.from(w0, (w, k) => w + shiftMm * (1 - Math.sqrt(1 - s[k] * s[k])) / lambda);
    let steepest = 0;
    for (let k = 1; k <= N; k++) if (weight[k] > 0 && weight[k - 1] > 0) steepest = Math.max(steepest, Math.abs(opd[k] - opd[k - 1]));
    return { z: zFocus + shiftMm, shiftMm, s, opd, weight, steepest, sMax };
  };
  // |Σ weight·g(k)·e^(−2πiW) ρ|² over Simpson nodes on a stride of the
  // samples fine enough for the wavefront, for the oscillation `rate` (rad
  // per unit of ρ) of g, and for g's narrowest feature `scale` (in ρ); g is
  // real, or [re, im]. When even the samples themselves are too coarse, the
  // sum is kept but marked unresolved, or, `strict`, is NaN.
  let unresolved = false;
  const sum = (p, g, rate = 0, scale = Infinity, strict = false) => {
    const tooCoarse = stride => p.steepest * stride > MAX_WAVE_STEP || rate * stride / N > MAX_BESSEL_STEP || MODE_STEPS * stride / N > scale;
    let stride = N / MIN_INTERVALS;
    while (stride > 1 && tooCoarse(stride)) stride /= 2;
    if (tooCoarse(stride)) {
      if (strict) return NaN;
      unresolved = true;
    }
    const n = N / stride, ws = simpson(n);
    let re = 0, im = 0;
    for (let i = 0; i <= n; i++) {
      const k = i * stride, a = p.weight[k];
      if (!(a > 0)) continue;
      const v = g(k), c = ws[i] * a * rho[k], ph = -2 * Math.PI * p.opd[k];
      const [gr, gi] = typeof v === 'number' ? [v, 0] : v, cr = Math.cos(ph), ci = Math.sin(ph);
      re += c * (gr * cr - gi * ci); im += c * (gr * ci + gi * cr);
    }
    return re * re + im * im;
  };
  // The unaberrated peak at the paraxial focus, (∫ A √(J / cos θ) ρ dρ)²,
  // which every intensity is relative to (a lens with the same pupil and
  // W = 0).
  let sumAJ = 0;
  for (let k = 0; k <= N; k++) sumAJ += w[k] * weight[k] * rho[k];
  const norm = sumAJ * sumAJ;

  // Intensity at radius r (mm), relative to that peak.
  const intensity = (p, r) => {
    const kappa = 2 * Math.PI * r / lambda;
    return sum(p, kappa ? k => besselJ0(kappa * p.s[k]) : () => 1, kappa * p.sMax) / norm;
  };
  const peak = p => intensity(p, 0);
  // The radius that holds `share` of the power. In these units ∫|U|² over a
  // plane, λ² ∫ A²/cos θ dpupil over (2π ∫ A √(J / cos θ) ρ dρ)², is
  // λ² ∫A²ρdρ/cos θ / (2π (∫A√(J / cos θ)ρdρ)²).
  const total = lambda * lambda * sumA2c / (2 * Math.PI * norm);
  // Simpson's rule in r on steps of λ/(R_STEPS s_max), and within the last
  // pair of steps the integral of the quadratic through its three samples;
  // NaN beyond radiusLimit.
  const radiusLimit = R_REACH * lambda / sMax;
  const radiusHolding = (p, share = GAUSSIAN_SHARE) => {
    const h = lambda / (R_STEPS * p.sMax), goal = share * total / (2 * Math.PI);
    let held = 0, f0 = 0;
    for (let i = 0; (i + 2) * h <= radiusLimit; i += 2) {
      const r0 = i * h, f1 = intensity(p, r0 + h) * (r0 + h), f2 = intensity(p, r0 + 2 * h) * (r0 + 2 * h);
      const b = (-3 * f0 + 4 * f1 - f2) / (2 * h), c = (f0 - 2 * f1 + f2) / (2 * h * h);
      const part = x => f0 * x + b * x * x / 2 + c * x * x * x / 3;
      if (held + part(2 * h) >= goal) {
        let lo = 0, hi = 2 * h;
        for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (held + part(mid) >= goal) hi = mid; else lo = mid; }
        return r0 + (lo + hi) / 2;
      }
      held += part(2 * h); f0 = f2;
    }
    return NaN;
  };
  // Coupling into a fiber whose core sits at the plane's axial point, its
  // axis along the lens's: the overlap on the sphere about the core with
  // the mode's far field exp(−s²/θ₀²), θ₀ = λ/(π w₀), each ray standing for
  // the solid angle dΩ = J dpupil / cos θ (engine/coupling.js). A wide mode
  // has a narrow far field: θ₀ spans θ₀/max(ds/dρ) of the pupil radius.
  //
  //   η = |2π ∫ A √(J/cos θ) e^(−s²/θ₀²) e^(−2πiW) ρ dρ|² / (2π ∫A²ρdρ · ∫|M|²dΩ).
  //
  // A fiber set off, one way at a time. Moved by Δ across the axis, each
  // plane wave reaches the core with the phase 2π s cos φ Δ/λ, and its
  // average over the azimuth φ is exactly J₀(2π s Δ/λ). Tilted by τ, the
  // mode's far field is exp(−sin²α/θ₀²), α the angle between a direction and
  // the fiber's axis (as the engine takes it): with cos α = s sin τ cos φ +
  // cos θ cos τ, it is negligible (below e⁻⁴⁰ of its peak) outside an arc
  // about φ = 0, which Gauss–Legendre nodes cover. The radial integral is
  // sampled finely enough for the phase's rate 2πΔ max(ds/dρ)/λ and the
  // mode's width. `strict` gives NaN where the pupil samples are too coarse,
  // instead of marking the model unresolved.
  const coupling = (p, modeRadiusMm, lateralMm = 0, tiltRad = 0, strict = false) => {
    const theta = lambda / (Math.PI * modeRadiusMm), norm = 2 * Math.PI / (sumA2 * modeNorm(theta)), t2 = theta * theta;
    if (lateralMm && tiltRad) throw new Error('coupling: one offset at a time');
    if (!tiltRad) {
      const kx = 2 * Math.PI * Math.abs(lateralMm) / lambda;
      const g = kx ? k => Math.exp(-p.s[k] * p.s[k] / t2) * besselJ0(kx * p.s[k]) : k => Math.exp(-p.s[k] * p.s[k] / t2);
      return norm * sum(p, g, kx * dsMax, theta / dsMax, strict);
    }
    const st = Math.sin(Math.abs(tiltRad)), ct = Math.cos(tiltRad);
    const ring = k => {
      const s = p.s[k], a = s * st, b = Math.sqrt(1 - s * s) * ct, top = a + b;
      // cos α falls with φ; the arc ends where sin²α has grown by 40 θ₀².
      const floor = Math.sqrt(Math.max(0, top * top - 40 * t2));
      const phiEnd = a > 0 ? Math.acos(Math.max(-1, Math.min(1, (floor - b) / a))) : Math.PI;
      let sumArc = 0;
      for (let j = 0; j < ARC_NODES.length; j++) {
        const ca = a * Math.cos(phiEnd * ARC_NODES[j]) + b;
        sumArc += ARC_WEIGHTS[j] * Math.exp(-(1 - ca * ca) / t2);
      }
      return sumArc * phiEnd / Math.PI;
    };
    return norm * sum(p, ring, 0, theta / dsMax, strict);
  };
  return { ok: true, lambda, zFocus, norm, plane, peak, intensity, radiusHolding, coupling, radiusLimit, bundle, samples: N, resolved: () => !unresolved };
}

// Gauss–Legendre nodes and weights on [0, 1] (Newton on P_n), for the arc
// of azimuth a tilted fiber's mode lights.
function gaussLegendre01(n) {
  const x = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let z = Math.cos(Math.PI * (i + 0.75) / (n + 0.5)), dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1, p1 = z;
      for (let k = 2; k <= n; k++) { const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k; p0 = p1; p1 = p2; }
      dp = n * (z * p1 - p0) / (z * z - 1);
      const dz = p1 / dp;
      z -= dz;
      if (Math.abs(dz) < 1e-16) break;
    }
    x[i] = (1 - z) / 2; w[i] = 1 / ((1 - z * z) * dp * dp);
  }
  return { x, w };
}
const { x: ARC_NODES, w: ARC_WEIGHTS } = gaussLegendre01(64);

// Maximum of f on [a, b] by golden section.
function goldenMax(f, a, b, steps = 50) {
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = f(x1), f2 = f(x2);
  for (let i = 0; i < steps; i++) {
    if (f1 > f2) { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = f(x1); } else { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = f(x2); }
  }
  return f1 > f2 ? [x1, f1] : [x2, f2];
}

// Where f(shift) is largest within ±span: a scan, then golden section
// about its best sample.
export function bestShift(f, spanMm, count = 81) {
  const xs = Array.from({ length: count }, (_, i) => -spanMm + 2 * spanMm * i / (count - 1));
  const ys = xs.map(f);
  let k = 0;
  ys.forEach((y, i) => { if (y > ys[k]) k = i; });
  const [shiftMm, value] = goldenMax(f, xs[Math.max(0, k - 1)], xs[Math.min(count - 1, k + 1)]);
  return { shiftMm, value };
}

// 1, 2 or 5 times a power of ten, at least v.
export const niceUp = v => { const p = 10 ** Math.floor(Math.log10(v)), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };

// How far from the paraxial focus the singlet's rays inside `reach` pupil
// radii cross the axis (its longitudinal spherical aberration there).
function axialSpread(rays, reach) {
  const b = rays.bundle;
  let worst = 0;
  for (let k = 1; k < b.K; k++) {
    if (!b.valid[k] || b.px[k] > reach || !(Math.abs(b.D[3 * k]) > 1e-15)) continue;
    const zCross = b.P[3 * k + 2] - b.P[3 * k] * b.D[3 * k + 2] / b.D[3 * k];
    worst = Math.max(worst, Math.abs(zCross - rays.zFocus));
  }
  return worst;
}

// The singlet and the ideal lens through focus: at each plane of a common
// scan about the paraxial focus, the peak intensity and the radius holding
// 86.5 % of the power; then each lens's brightest plane. `withReal:
// false` leaves the singlet out (a lens whose faces cross). The rays are
// traced on the coarsest pupil grid that resolves every integral taken;
// when none does, the analysis is refused rather than shown wrong.
export function focusAnalysis(v, lens, ideal, opts = {}) {
  for (const samples of PUPIL_SAMPLES) {
    const out = focusOn(v, lens, ideal, samples, opts);
    if (!out.ok || out.resolved) return out;
  }
  return { ok: false, reason: `The wavefront or the spot varies too fast across the pupil to be integrated on ${PUPIL_SAMPLES.at(-1)} samples along its radius. Choose a narrower beam, a smaller clear diameter or a longer wavelength.` };
}

function focusOn(v, lens, ideal, samples, { withReal = true } = {}) {
  const kinds = withReal ? ['real', 'ideal'] : ['ideal'];
  const rays = { ideal: aplanaticRays(v, lens, samples), ...(withReal ? { real: singletRays(v, lens, samples) } : {}) };
  const models = {};
  for (const kind of kinds) {
    const m = rays[kind].ok ? focusFrom(rays[kind]) : rays[kind];
    if (!m.ok) return { ok: false, reason: `${kind === 'real' ? 'The singlet' : 'The ideal lens'}: ${m.reason}` };
    models[kind] = m;
  }
  const zr = ideal.rayleighMm;
  const reach = { ideal: 3 * zr, real: withReal ? Math.max(3 * zr, 1.5 * axialSpread(rays.real, Math.min(1, 2 * beamPupil(v).beamRatio))) : 0 };
  const out = { ok: true };
  for (const kind of kinds) {
    const m = models[kind];
    const peak = bestShift(s => m.peak(m.plane(s)), reach[kind]);
    out[kind] = { model: m, bestShiftMm: peak.shiftMm, strehl: peak.value, reachMm: reach[kind], clipped: rays[kind].clipped };
  }
  const span = niceUp(Math.max(3 * zr, ...kinds.map(kind => 1.5 * Math.abs(out[kind].bestShiftMm))));
  out.span = span;
  out.shiftsMm = Array.from({ length: SCAN_POINTS }, (_, i) => -span + 2 * span * i / (SCAN_POINTS - 1));
  out.samples = samples;
  const planes = {};
  for (const kind of kinds) {
    const m = models[kind], o = out[kind];
    planes[kind] = out.shiftsMm.map(s => m.plane(s));
    o.peak = planes[kind].map(p => m.peak(p));
    o.atBest = m.plane(o.bestShiftMm);
    o.atParaxial = m.plane(0);
    o.paraxialStrehl = m.peak(o.atParaxial);
    o.radiusLimitUm = m.radiusLimit * 1e3;
  }
  // The radii cost most: taken only once the grid resolves the wavefront.
  out.resolved = kinds.every(kind => models[kind].resolved());
  if (!out.resolved) return out;
  for (const kind of kinds) {
    const m = models[kind], o = out[kind];
    o.radiusUm = planes[kind].map(p => m.radiusHolding(p) * 1e3);
    o.bestRadiusUm = m.radiusHolding(o.atBest) * 1e3;
    o.paraxialRadiusUm = m.radiusHolding(o.atParaxial) * 1e3;
  }
  out.resolved = kinds.every(kind => models[kind].resolved());
  return out;
}

// ---------------------------------------------------------------- inputs

const singlet = { when: 'lensKind', whenValue: ['planoconvex', 'biconvex'] };
const designed = { when: 'spec', whenValue: 'focal' };
const manual = { when: 'spec', whenValue: 'radii' };

export const LENS_INPUTS = [
  { id: 'wavelengthNm', group: 'laser', label: 'Wavelength', unit: 'nm', value: 1550, min: 200, max: 20000, arrowStep: 1,
    help: 'Vacuum wavelength of the CW laser, inside the glass’s fitted range.' },
  { id: 'beamDiameterMm', group: 'laser', label: 'Beam diameter (1/e²)', unit: 'mm', value: 2, min: 0.001, max: 1000, arrowStep: 0.1,
    help: 'At the lens, where the collimated TEM₀₀ beam has its waist.' },
  { id: 'lensKind', type: 'select', group: 'lens', label: 'Lens', value: 'planoconvex',
    options: [['ideal', 'Ideal thin lens'], ['planoconvex', 'Plano-convex singlet'], ['biconvex', 'Bi-convex singlet']],
    help: 'The ideal lens has no aberrations; a singlet has two spherical faces, and its rays are traced.' },
  { id: 'orientation', type: 'select', group: 'lens', label: 'Toward the laser', value: 'convex', when: 'lensKind', whenValue: 'planoconvex',
    options: [['convex', 'Curved side first'], ['plano', 'Flat side first']],
    help: 'Curved side first shares the bending between both faces and focuses a collimated beam better.' },
  { id: 'spec', type: 'select', group: 'lens', label: 'Given by', value: 'focal', ...singlet,
    options: [['focal', 'Focal length, diameter and edge'], ['radii', 'Radii and centre thickness']],
    help: 'From f, the page designs the radii and the centre thickness; or enter them yourself.' },
  { id: 'shape', type: 'select', group: 'lens', label: 'Bi-convex shape', value: 'equi', all: [{ when: 'lensKind', whenValue: 'biconvex' }, designed],
    options: [['equi', 'Equi-convex (R₂ = −R₁)'], ['best', 'Best form (least spherical aberration)']],
    help: 'Best form: the thin-lens shape with the least spherical aberration for a collimated beam, its stronger face toward the laser.' },
  { id: 'glass', type: 'select', group: 'lens', label: 'Glass', value: 'nbk7', options: GLASS_CHOICES,
    help: 'From the canvas’s glass catalogue. For the ideal lens it sets only how f changes with wavelength.' },
  { id: 'focalMm', group: 'size', label: 'Effective focal length f', unit: 'mm', value: 11, min: 0.1, max: 100000, arrowStep: 0.5,
    any: [{ when: 'lensKind', whenValue: 'ideal' }, { all: [singlet, designed] }],
    help: 'At the laser’s wavelength, from the principal plane H′ to the focus F′.' },
  { id: 'diameterMm', group: 'size', label: 'Clear diameter D', unit: 'mm', value: 6, min: 0.01, max: 1000, arrowStep: 0.5,
    help: 'The aperture of the lens: it clips the beam and, for a singlet, sets the edge thickness.' },
  { id: 'edgeMm', group: 'size', label: 'Edge thickness', unit: 'mm', value: 1, min: 0, max: 1000, arrowStep: 0.1, all: [singlet, designed],
    help: 'At the clear diameter; with f and D it fixes the centre thickness.' },
  { id: 'convexRadiusMm', group: 'size', label: 'Radius of the curved face', unit: 'mm', value: 5.5, min: 0.01, max: 10000, arrowStep: 0.1,
    all: [{ when: 'lensKind', whenValue: 'planoconvex' }, manual], help: 'Its magnitude; the other face is flat.' },
  { id: 'frontRadiusMm', group: 'size', label: 'Front radius |R₁|', unit: 'mm', value: 20, min: 0.01, max: 10000, arrowStep: 0.1,
    all: [{ when: 'lensKind', whenValue: 'biconvex' }, manual], help: 'The face toward the laser; both faces are convex.' },
  { id: 'backRadiusMm', group: 'size', label: 'Back radius |R₂|', unit: 'mm', value: 20, min: 0.01, max: 10000, arrowStep: 0.1,
    all: [{ when: 'lensKind', whenValue: 'biconvex' }, manual], help: 'The face toward the focus.' },
  { id: 'thicknessMm', group: 'size', label: 'Centre thickness t', unit: 'mm', value: 3, min: 0.01, max: 1000, arrowStep: 0.1, all: [singlet, manual],
    help: 'Along the axis, between the two vertices.' },
];
export const LENS_DEFAULTS = defaultsFor(LENS_INPUTS);

const fmt = (x, d = 4) => String(Number(Number(x).toPrecision(d)));
const glassName = id => glassShortName(GLASSES.get(id).label);

// The best form for a collimated beam: a thin lens's spherical aberration
// is least when (R₁ + R₂)/(R₁ − R₂) = −2(n² − 1)/(n + 2) (the Coddington
// shape factor for an object at infinity), so |R₂| = k R₁ with
// k = (1 + c)/(1 − c), c = 2(n² − 1)/(n + 2): about 6 at n = 1.5. From
// n = 1.686 on, c ≥ 1 and the best form is no longer bi-convex.
export function bestFormRatio(n) {
  const c = 2 * (n * n - 1) / (n + 2);
  return c < 1 ? (1 + c) / (1 - c) : null;
}

// The ideal lens: a thin lens of focal length f in the plane of V₁ = V₂.
function idealLens(f, n) {
  return {
    n, ideal: true, matrix: { Ay: 1, Au: -1 / f, By: 0, Bu: 1 }, power: 1 / f, afocal: false,
    efl: f, bfl: f, ffl: f, h1Mm: 0, h2Mm: 0, thinPower: 1 / f, thinFocalMm: f, shape: null, r1Mm: null, r2Mm: null,
  };
}

// The lens a set of inputs describes: its signed radii and centre
// thickness, and its lens data at the laser's wavelength; or the reason
// there is none, with the inputs to correct.
export function designLens(v) {
  const n = materialIndex(v.glass, v.wavelengthNm), h = v.diameterMm / 2;
  if (v.lensKind === 'ideal') return { lens: idealLens(v.focalMm, n), r1Mm: null, r2Mm: null, thicknessMm: 0 };
  const data = (r1Mm, r2Mm, thicknessMm) => ({ r1Mm, r2Mm, thicknessMm, lens: { ...lensData({ glass: v.glass, wavelengthNm: v.wavelengthNm, r1Mm, r2Mm, thicknessMm }), r1Mm, r2Mm } });
  if (v.lensKind === 'planoconvex') {
    // Flat on one side, the thickness term vanishes: f = R/(n − 1) exactly.
    const R = v.spec === 'focal' ? (n - 1) * v.focalMm : v.convexRadiusMm;
    if (!(R > h)) {
      return v.spec === 'focal'
        ? { reason: `A plano-convex lens of ${glassName(v.glass)} (n = ${fmt(n, 5)}) with f = ${fmt(v.focalMm)} mm has R = (n − 1)f = ${fmt(R)} mm, not more than the ${fmt(h)} mm clear radius: choose a longer f or a smaller D.`, ids: ['focalMm', 'diameterMm'] }
        : { reason: `A radius of ${fmt(R)} mm does not reach the ${fmt(h)} mm clear radius: choose a larger radius or a smaller D.`, ids: ['convexRadiusMm', 'diameterMm'] };
    }
    const t = v.spec === 'focal' ? v.edgeMm + sagMm(R, h) : v.thicknessMm;
    return v.orientation === 'plano' ? data(0, -R, t) : data(R, 0, t);
  }
  if (v.spec === 'radii') {
    const [r1, r2] = [v.frontRadiusMm, v.backRadiusMm];
    if (!(r1 > h) || !(r2 > h)) return { reason: `A radius of ${fmt(Math.min(r1, r2))} mm does not reach the ${fmt(h)} mm clear radius: choose larger radii or a smaller D.`, ids: [r1 > h ? 'backRadiusMm' : 'frontRadiusMm', 'diameterMm'] };
    return data(r1, -r2, v.thicknessMm);
  }
  // Bi-convex from f: |R₂| = k R₁, the centre as thick as the edge plus
  // both sags. The power is not monotonic in R₁: tighter faces bend more,
  // but near hemispheres the centre thickens fast and the power falls
  // again. So the strongest lens is found first (a scan in log R₁, then
  // golden section); an f shorter than its focal length has no lens, and a
  // longer one is found by bisection on the larger-radius side, where the
  // power falls steadily toward the thin lens's.
  const k = v.shape === 'best' ? bestFormRatio(n) : 1;
  if (k === null) return { reason: `At n = ${fmt(n, 5)} the shape with the least spherical aberration for a collimated beam is not bi-convex (that needs n below 1.686): choose the equi-convex shape, or a plano-convex lens curved side first.`, ids: ['shape', 'glass'] };
  const thick = R1 => v.edgeMm + sagMm(R1, h) + sagMm(k * R1, h);
  const power = R1 => lensData({ glass: v.glass, wavelengthNm: v.wavelengthNm, r1Mm: R1, r2Mm: -k * R1, thicknessMm: thick(R1) }).power;
  // From the smallest radii up to twice the thin lens's R₁ = (n − 1)f(1 + k)/k.
  const least = h * Math.max(1, 1 / k) * (1 + 1e-9);
  let hi = 2 * (n - 1) * v.focalMm * (1 + k) / k + 2 * least;
  const goal = 1 / v.focalMm;
  const radii = Array.from({ length: 201 }, (_, i) => least * (hi / least) ** (i / 200)), powers = radii.map(power);
  let best = 0;
  powers.forEach((p, i) => { if (p > powers[best]) best = i; });
  const [peak, strongest] = goldenMax(power, radii[Math.max(0, best - 1)], radii[Math.min(200, best + 1)], 80);
  let lo = peak;
  if (!(strongest > goal)) return { reason: `No ${v.shape === 'best' ? 'best-form' : 'equi-convex'} lens of ${glassName(v.glass)} with a ${fmt(v.diameterMm)} mm clear diameter and a ${fmt(v.edgeMm)} mm edge is as strong as f = ${fmt(v.focalMm)} mm: the strongest has f = ${fmt(1 / strongest)} mm, and tighter faces only thicken it. Choose a longer f, a smaller D or a thinner edge.`, ids: ['focalMm', 'diameterMm', 'edgeMm'] };
  while (power(hi) > goal) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-15 * hi; i++) { const mid = (lo + hi) / 2; if (power(mid) > goal) lo = mid; else hi = mid; }
  const R1 = (lo + hi) / 2;
  return data(R1, -k * R1, thick(R1));
}

// The edge thickness at the clear radius, or the reason there is none.
function edge(v) {
  const h = v.diameterMm / 2, s1 = sagMm(v.r1Mm, h), s2 = sagMm(v.r2Mm, h);
  return { edgeMm: v.thicknessMm - s1 + s2, sag1Mm: s1, sag2Mm: s2 };
}

// Lens data over the glass's range, for the chromatic graph: the thick lens
// and the thin-lens formula with the same radii; for the ideal lens, a thin
// lens of this glass with focal length f at the laser's wavelength.
export function chromaticScan(v, lens, count = 161) {
  const [lo, hi] = glassWavelengthRange(v.glass);
  const a = Math.max(lo, Math.min(350, v.wavelengthNm)), b = Math.min(hi, Math.max(2500, v.wavelengthNm));
  return Array.from({ length: count }, (_, i) => {
    const nm = a + (b - a) * i / (count - 1);
    if (lens.ideal) {
      const f = v.focalMm * (lens.n - 1) / (materialIndex(v.glass, nm) - 1);
      return { nm, efl: f, bfl: f, thin: f };
    }
    const d = lensData({ ...v, wavelengthNm: nm });
    return { nm, efl: d.afocal ? null : d.efl, bfl: d.afocal ? null : d.bfl, thin: Number.isFinite(d.thinFocalMm) ? d.thinFocalMm : null };
  });
}

export function computeThickLens(raw, { focus = true } = {}) {
  const { values: input, errors } = parseInputs(LENS_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  if (!isWavelengthInGlassRange(input.glass, input.wavelengthNm)) {
    const [lo, hi] = glassWavelengthRange(input.glass);
    return unavailable(`${glassName(input.glass)} is fitted from ${lo} to ${hi} nm; choose a wavelength inside that range.`, 'wavelengthNm');
  }
  const design = designLens(input);
  if (design.reason) return unavailable(design.reason, ...design.ids);
  const { lens } = design;
  const v = { ...input, r1Mm: design.r1Mm, r2Mm: design.r2Mm, thicknessMm: design.thicknessMm };
  if (lens.afocal) return unavailable('These radii and this thickness make an afocal lens (zero power): it has no focal points.', 'frontRadiusMm', 'backRadiusMm', 'thicknessMm');
  const geometry = lens.ideal ? null : edge(v);
  const result = { ok: true, values: v, lens, geometry, efl: lens.efl, bfl: lens.bfl, ffl: lens.ffl, h1Mm: lens.h1Mm, h2Mm: lens.h2Mm, n: lens.n };
  // The beam: only a converging lens focuses it.
  if (lens.efl < 0) { result.beamIssue = 'These radii and this thickness make a diverging lens: the beam leaves it diverging, so there is no focus to show.'; return result; }
  const ideal = idealFocus(lens, v.beamDiameterMm, v.wavelengthNm);
  // A positive f still leaves the beam diverging when F′ (or the beam's
  // waist) lies before the back face: there is no focus in air.
  if (!(lens.bfl > 0) || !(ideal.fromV2Mm > 0)) {
    const [what, z] = lens.bfl > 0 ? ['The focused waist', ideal.fromV2Mm] : ['F′', lens.bfl];
    result.beamIssue = `${what} lies ${fmt(-z)} mm before the back vertex V₂, ${-z < v.thicknessMm ? 'inside the glass' : 'before the lens'}: the beam leaves the back face diverging, so there is no focus in air for a spot or a fiber.`;
    return result;
  }
  result.ideal = ideal;
  result.clipShare = apertureShare(v.diameterMm, v.beamDiameterMm);
  if (!focus) return result;
  if (ideal.halfAngleMrad > 300) { result.beamIssue = `The focused beam converges at ${fmt(ideal.halfAngleMrad, 3)} mrad (half angle), beyond the 0.3 rad the paraxial beam and the scalar focus allow.`; return result; }
  if (v.beamDiameterMm / v.diameterMm > BEAM_RATIO_MAX) { result.beamIssue = `The beam is more than ${BEAM_RATIO_MAX} times the clear diameter: the lens passes only its centre, a nearly even disc of light, which this page does not model as a beam.`; return result; }
  if (geometry && !(geometry.edgeMm > 0)) { result.realIssue = `The faces cross before the clear diameter (edge thickness ${fmt(geometry.edgeMm, 3)} mm): a real lens needs more centre thickness, so only the ideal lens is shown.`; }
  // The pupil's rim seen from the focus, and the Fresnel number of the lit
  // pupil: the Debye integral holds for a large one (engine/pupil.js).
  const pupil = beamPupil(v);
  result.rimNa = pupil.epd / 2 / lens.efl;
  if (result.rimNa > MAX_RIM_NA) { result.beamIssue = `The lit pupil reaches a numerical aperture of ${fmt(result.rimNa, 3)} at its rim (sin θ = h/f): beyond ${MAX_RIM_NA}, where neither the ideal lens nor the scalar focus means much. Choose a narrower beam or a smaller clear diameter.`; return result; }
  const lit = Math.min(v.beamDiameterMm, v.diameterMm) / 2;
  result.fresnelNumber = lit * lit / (v.wavelengthNm * 1e-6 * lens.efl);
  const scan = focusAnalysis(v, lens, ideal, { withReal: !lens.ideal && !result.realIssue });
  if (!scan.ok) { result.beamIssue = scan.reason; return result; }
  result.scan = scan;
  return result;
}

// ---------------------------------------------------------------- fiber

export const FIBER_INPUTS = [
  { id: 'fiberMode', type: 'select', group: 'fiber', label: 'Fiber mode given by', value: 'mfd',
    options: [['mfd', 'Mode-field diameter (datasheet)'], ['step', 'Core diameter and NA (step index)']],
    help: 'The mode is taken as a Gaussian of this 1/e² diameter.' },
  { id: 'mfdUm', group: 'fiber', label: 'Mode-field diameter', unit: 'µm', value: 10.4, min: 0.5, max: 200, arrowStep: 0.1, when: 'fiberMode', whenValue: 'mfd',
    help: '1/e² intensity diameter of the fundamental mode at the laser’s wavelength.' },
  { id: 'coreDiameterUm', group: 'fiber', label: 'Core diameter', unit: 'µm', value: 8.2, min: 0.5, max: 100, arrowStep: 0.1, when: 'fiberMode', whenValue: 'step',
    help: 'Step-index core; the mode follows from Marcuse’s fit.' },
  { id: 'na', group: 'fiber', label: 'Numerical aperture', unit: '', value: 0.14, min: 0.01, max: 0.5, arrowStep: 0.01, when: 'fiberMode', whenValue: 'step',
    help: 'NA = √(n_core² − n_clad²), the index-profile NA.' },
  { id: 'fresnel', type: 'checkbox', group: 'fiber', label: 'Uncoated surfaces (Fresnel reflections)', value: false,
    help: 'Loses the normal-incidence reflection at both lens faces and at a fused-silica fiber end.' },
];
export const FIBER_DEFAULTS = defaultsFor(FIBER_INPUTS);

// Points on each offset scan.
export const OFFSET_POINTS = 41;

// The light reaching the fiber: the beam's share through the clear
// aperture and, uncoated, the transmission of the two lens faces and the
// fiber end at normal incidence.
const reflectance = n => ((n - 1) / (n + 1)) ** 2;
export function fresnelTransmission(n, wavelengthNm) {
  const silica = materialIndex('silica', Math.min(3710, Math.max(210, wavelengthNm)));
  return (1 - reflectance(n)) ** 2 * (1 - reflectance(silica));
}

// Per lens, the fiber at its best plane on the axis; cached on the lens
// result for each mode. The rays are retraced on a finer pupil grid when
// the mode's far field needs it; with none fine enough, the coupling is
// refused.
const fiberCache = new WeakMap();
function fiberFocus(result, mfdUm) {
  let cache = fiberCache.get(result);
  if (!cache) fiberCache.set(result, cache = new Map());
  if (!cache.has(mfdUm)) cache.set(mfdUm, fiberFocusOn(result, mfdUm));
  return cache.get(mfdUm);
}

function fiberFocusOn(result, mfdUm) {
  const { values: v, lens, scan } = result, w = mfdUm / 2000;
  const kinds = ['real', 'ideal'].filter(kind => scan[kind]);
  for (const samples of PUPIL_SAMPLES.filter(n => n >= scan.samples)) {
    const out = { ok: true, samples, kinds };
    let resolved = true;
    for (const kind of kinds) {
      const m = samples === scan.samples ? scan[kind].model : focusFrom(kind === 'real' ? singletRays(v, lens, samples) : aplanaticRays(v, lens, samples));
      const reach = scan[kind].reachMm;
      const eta = s => m.coupling(m.plane(s), w, 0, 0, true);
      const xs = Array.from({ length: 81 }, (_, i) => -reach + 2 * reach * i / 80), ys = xs.map(eta);
      if (ys.some(Number.isNaN)) { resolved = false; break; }
      let k = 0;
      ys.forEach((y, i) => { if (y > ys[k]) k = i; });
      const [shiftMm, aligned] = goldenMax(eta, xs[Math.max(0, k - 1)], xs[Math.min(80, k + 1)]);
      out[kind] = { model: m, shiftMm, plane: m.plane(shiftMm), aligned };
    }
    if (resolved) return out;
  }
  return { ok: false, reason: `The fiber mode’s far field is too narrow for the pupil to be sampled across it on ${PUPIL_SAMPLES.at(-1)} samples: a mode this wide takes almost none of this beam anyway. Choose a smaller mode-field diameter.` };
}

// Where a scan that starts at its peak first falls to half of it, by linear
// interpolation (null when it does not within the scan).
function halfPoint(xs, ys) {
  const half = ys[0] / 2;
  for (let i = 1; i < xs.length; i++) {
    if (ys[i] <= half && ys[i - 1] > half) return xs[i - 1] + (xs[i] - xs[i - 1]) * (ys[i - 1] - half) / (ys[i - 1] - ys[i]);
  }
  return null;
}

// The coupling efficiency of each lens with the fiber at its best plane,
// and as the fiber is moved across the axis (a radius: the focus is round),
// along it, or tilted, one way at a time.
export function computeFiber(lensResult, raw) {
  if (!lensResult?.ok) return { pending: true, message: 'Set a valid laser and lens above first.' };
  const { values: f, errors } = parseInputs(FIBER_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  const v = lensResult.values;
  let mode = null, mfdUm = f.mfdUm;
  if (f.fiberMode === 'step') {
    mode = fiberMode({ wavelengthNm: v.wavelengthNm, coreDiameterUm: f.coreDiameterUm, na: f.na });
    if (!mode.inFit) return unavailable(`V = ${mode.vNumber.toFixed(3)}: outside ${MARCUSE_V[0]}–${MARCUSE_V[1]}, where this page’s Gaussian fit to the fundamental mode is checked. Enter the mode-field diameter instead.`, 'coreDiameterUm', 'na');
    mfdUm = mode.modeFieldDiameterUm;
  }
  const theta = v.wavelengthNm * 1e-3 / (Math.PI * mfdUm / 2);
  if (theta > MODE_LIMIT) return unavailable(`A ${fmt(mfdUm, 3)} µm mode at ${fmt(v.wavelengthNm)} nm spreads at ${fmt(theta * 1e3, 3)} mrad (1/e² half angle), beyond the ${MODE_LIMIT * 1e3} mrad the Gaussian mode model allows.`, f.fiberMode === 'step' ? 'coreDiameterUm' : 'mfdUm');
  if (!lensResult.scan) return { pending: true, message: lensResult.beamIssue ?? 'No focus above to couple into.' };
  const focus = fiberFocus(lensResult, mfdUm);
  if (!focus.ok) return unavailable(focus.reason, f.fiberMode === 'step' ? 'coreDiameterUm' : 'mfdUm');
  const w = mfdUm / 2000, ideal = lensResult.ideal, kinds = focus.kinds;
  const through = lensResult.clipShare * (f.fresnel ? fresnelTransmission(lensResult.lens.n, v.wavelengthNm) : 1);
  // Scan ranges, out to where a Gaussian beam's coupling is nearly gone:
  // twice √(w₀′² + w_m²) across, 1.5 √(θ′² + θ₀²) in angle (within the mode
  // model's angles), and along the axis three times the longer Rayleigh
  // range, or past both lenses' best planes.
  const modeRayleighMm = Math.PI * w * w / (v.wavelengthNm * 1e-6);
  const lateralUm = niceUp(2 * Math.hypot(ideal.waistUm, mfdUm / 2));
  const tiltMrad = Math.min(MODE_LIMIT * 1e3, niceUp(1.5 * Math.hypot(theta * 1e3, ideal.halfAngleMrad)));
  const axialMm = niceUp(Math.max(3 * Math.max(ideal.rayleighMm, modeRayleighMm), ...kinds.map(kind => 1.5 * Math.abs(focus[kind].shiftMm))));
  const line = (lo, hi) => Array.from({ length: OFFSET_POINTS }, (_, i) => lo + (hi - lo) * i / (OFFSET_POINTS - 1));
  const scans = { lateralUm: line(0, lateralUm), axialUm: line(-axialMm * 1e3, axialMm * 1e3), tiltMrad: line(0, tiltMrad) };
  const out = { ok: true, values: { ...f, mfdUm }, mode, theta, samples: focus.samples, through, scans };
  for (const kind of kinds) {
    const { model: m, plane, shiftMm, aligned } = focus[kind];
    const lateral = scans.lateralUm.map(x => m.coupling(plane, w, x * 1e-3, 0, true));
    const tilt = scans.tiltMrad.map(a => m.coupling(plane, w, 0, a * 1e-3, true));
    const axial = scans.axialUm.map(z => m.coupling(m.plane(z * 1e-3), w, 0, 0, true));
    scans[kind] = { lateral, tilt, axial };
    out[kind] = {
      model: m, plane, shiftMm, aligned, efficiency: aligned * through,
      halfLateralUm: halfPoint(scans.lateralUm, lateral), halfTiltMrad: halfPoint(scans.tiltMrad, tilt),
    };
  }
  return out;
}

// ---------------------------------------------------------------- figure

// The lens and the beam it focuses, to scale, in mm with z from V₁: the
// outline (null for the ideal lens, or when the faces cross), the cardinal
// points, and rays of the beam at fractions of its 1/e² radius, traced
// through the singlet (straight inside the glass) or bent at the ideal
// lens's plane toward F′.
export function beamDiagram(result) {
  const { values: v, lens, geometry } = result;
  const t = v.thicknessMm, f = lens.efl;
  const marks = { F: -lens.ffl, F2: t + lens.bfl, H: lens.h1Mm, H2: t + lens.h2Mm };
  const lo = Math.min(marks.F, -0.2 * f) - 0.1 * f, hi = Math.max(marks.F2, t) + 0.3 * f;
  const w = v.beamDiameterMm / 2, reach = Math.min(w, 0.999 * v.diameterMm / 2);
  const heights = [1 / 3, 2 / 3, 1].map(x => x * reach);
  const rays = [];
  const real = !lens.ideal && geometry.edgeMm >= 0;
  if (real) {
    const sys = normalizeSystem(singletSystem(v, lens));
    const fo = firstOrder(sys, v.wavelengthNm);
    const { epd } = beamPupil(v);
    const px = Float64Array.from(heights, h => Math.min(1, h / (epd / 2)));
    const b = fo.ok ? traceBundle(traceModel(sys, v.wavelengthNm, fo), 0, px, new Float64Array(px.length)) : null;
    heights.forEach((h, k) => {
      if (!b?.valid[k]) return;
      const zIn = sagMm(v.r1Mm, h), [x, , z] = b.P.slice(3 * k, 3 * k + 3), [dx, , dz] = b.D.slice(3 * k, 3 * k + 3);
      for (const sign of [1, -1]) rays.push([[lo, sign * h], [zIn, sign * h], [z, sign * x], [hi, sign * (x + dx / dz * (hi - z))]]);
    });
  } else {
    for (const h of heights) for (const sign of [1, -1]) rays.push([[lo, sign * h], [0, sign * h], [hi, sign * h * (1 - hi / f)]]);
  }
  let outline = null;
  if (real) {
    const half = v.diameterMm / 2, n = 40, face = (r, z0, y) => z0 + sagMm(r, Math.abs(y));
    outline = [];
    for (let i = 0; i <= n; i++) { const y = -half + 2 * half * i / n; outline.push([face(v.r1Mm, 0, y), y]); }
    for (let i = n; i >= 0; i--) { const y = -half + 2 * half * i / n; outline.push([face(v.r2Mm, t, y), y]); }
  }
  return { z: [lo, hi], yMax: 1.25 * Math.max(v.diameterMm / 2, reach), outline, marks, rays, ideal: !real, halfDiameter: v.diameterMm / 2 };
}

// The lens on the canvas: a laser of this wavelength and beam width and the
// canvas's Thick spherical lens (or its ideal Lens), or the reasons it
// cannot hold it.
export function canvasScene(v, lens) {
  const reasons = [];
  if (v.diameterMm < 1 || v.diameterMm > 500) reasons.push('its diameter runs from 1 to 500 mm');
  if (lens.ideal) {
    if (lens.efl > 3000) reasons.push('its focal length runs up to 3000 mm');
  } else {
    if (v.thicknessMm < 0.5 || v.thicknessMm > 60) reasons.push('its centre thickness runs from 0.5 to 60 mm');
    if ([v.r1Mm, v.r2Mm].some(r => Math.abs(r) > 2000)) reasons.push('its radii are limited to ±2000 mm');
  }
  if (reasons.length) return { ok: false, reasons };
  const params = lens.ideal
    ? { f: Number(fmt(lens.efl, 6)), dia: v.diameterMm, transEff: 100 }
    : { r1: Number(fmt(v.r1Mm, 6)), r2: Number(fmt(v.r2Mm, 6)), thickness: Number(fmt(v.thicknessMm, 6)), dia: v.diameterMm, glass: v.glass, transEff: 100 };
  const adjusted = lens.ideal ? null : thickLensAdjustment(params);
  // The canvas laser's beam width runs from 1 to 60 mm.
  const beamWidth = Math.min(60, Math.max(1, v.beamDiameterMm));
  const notes = [
    adjusted && `The canvas’s lens keeps an edge of at least 0.4 mm and radii above the clear radius, so it is drawn as R₁ ${fmt(adjusted.r1)}, R₂ ${fmt(adjusted.r2)}, t ${fmt(adjusted.thickness)} mm.`,
    beamWidth !== v.beamDiameterMm && `The canvas’s laser beam is 1 to 60 mm wide, so it is drawn ${fmt(beamWidth)} mm wide, not ${fmt(v.beamDiameterMm)} mm.`,
  ];
  return {
    ok: true,
    note: notes.filter(Boolean).join(' '),
    scene: {
      app: 'optics2d', version: 1, beams: [],
      elements: [
        { id: 'laser', type: 'cwlaser', x: -Math.round(v.thicknessMm / 2 + 60), y: 0, rot: 0, label: `${fmt(v.wavelengthNm, 5)} nm`, showLabel: true,
          params: { wavelength: v.wavelengthNm, avgPowerW: 0.01, beamMode: 'beam', beamWidth } },
        { id: 'lens', type: lens.ideal ? 'lens' : 'thicklens', x: 0, y: 0, rot: 0, label: lens.ideal ? 'Ideal lens' : 'Singlet', showLabel: true, labelPos: 'b', params },
      ],
    },
  };
}
