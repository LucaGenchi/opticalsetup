// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Scalar diffraction for one field: the wavefront (wavefront.js) becomes a
// pupil function P = A·exp(−2πi W), whose discrete Fourier transform is the
// amplitude point-spread function (the Fraunhofer, or Debye, approximation
// of focusing). Everything here is scalar and isoplanatic, for incoherent
// light; polychromatic results are incoherent sums over the wavelengths.
//
// Sampling. The PSF is the Fourier transform of the pupil function over the
// direction cosines (l, m) of the reference sphere, seen from its centre
// (the Debye integral): a pupil sample spacing δp maps to δl = a_x δp, where
// a_x = ∂l/∂p_x is measured where the traced rays cross the sphere (an
// affine fit over the pupil), and so on in y. On an M × M FFT grid the image
// samples are then
//
//   Δx = λ / (n M δp_x |a_x|),   Δy = λ / (n M δp_y |a_y|).
//
// On axis n|a| is the image-space NA, and with N samples across the pupil
// (δp = 2/N) and M = N·Q this is Δ = λ N_w / Q, N_w = 1/(2 NA). Off axis
// the cone that reaches the image narrows, about as cos²θ′ in the plane of
// the field and cos θ′ across it, and measuring a_x and a_y takes that in.
// The spacings δp_x and δp_y are chosen, for every wavelength, so that Δx
// and Δy are one common Δ: all PSFs share one square image grid with no
// interpolation, and N counts the samples across the pupil in the direction
// and at the wavelength that need the finest sampling (the smallest
// λ/(2 n |a|)); the others are sampled a little more coarsely, and the
// FFT grid grows until each keeps MIN_ACROSS samples across (wavelengths too
// far apart for that within MAX_FFT are refused). Zero padding Q ≥ 2 lets
// the MTF reach its cutoff without wrapping.
//
// The pupil grid is uniform in normalized entrance-pupil (or, with real
// aiming, stop) coordinates; the FFT treats it as uniform in direction
// cosines, which holds while the map between them stays affine (the result
// reports how far the traced directions depart from it: pupil distortion).

import { normalizeSystem } from './system.js';
import { firstOrder, paraxialRay, mediumIndices } from './paraxial.js';
import { traceModel, FAILURES } from './trace.js';
import { traceBundle, referenceSphere, opdWaves, wavefrontStats, sphereCrossing, pointAt } from './wavefront.js';
import { bestFocusShift } from './spot.js';
import { fft2 } from './fft.js';
import { fitZernike } from './zernike.js';
import { analyzeSystem, checkSystem, HIGH_NA } from './analyze.js';

export const FRESNEL_LIMIT = 10;
// Neighbouring pupil samples further apart than this (waves) alias.
export const ALIAS_WAVES = 0.5;
export const THROUGH_FOCUS = { points: 33, grid: 64, maxGrid: 128, waves: 2 };
// Every wavelength keeps at least this many samples across the pupil (the
// coarsest grid offered), the common FFT grid growing to make room up to
// MAX_FFT; and a pupil needs at least MIN_LIT samples that carry light.
export const MIN_ACROSS = 32;
export const MAX_FFT = 1024;
export const MIN_LIT = 50;
// Above this, the traced exit-pupil directions are too far from a uniform
// grid for an FFT PSF to be trusted.
export const PUPIL_DISTORTION_LIMIT = 0.1;
const ENERGY_WINDOW = 0.995;

// Cell-centred pupil samples of spacings (dpx, dpy) inside the unit disc,
// placed in an M × M grid (row index ↔ y); `flipX`/`flipY` mirror the
// placement, for a pupil whose rays turn the other way (see sign below).
export function pupilSamples(M, dpx, dpy = dpx, flipX = false, flipY = false) {
  const px = [], py = [], index = [];
  for (let i = 0; i < M; i++) {
    const y = (i + 0.5 - M / 2) * dpy;
    if (Math.abs(y) > 1) continue;
    for (let j = 0; j < M; j++) {
      const x = (j + 0.5 - M / 2) * dpx;
      if (x * x + y * y <= 1) {
        px.push(x); py.push(y);
        index.push((flipY ? M - 1 - i : i) * M + (flipX ? M - 1 - j : j));
      }
    }
  }
  return { px: Float64Array.from(px), py: Float64Array.from(py), index: Int32Array.from(index), M, dpx, dpy };
}

const det3 = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

// The Debye integral runs over the directions s = (C − S)/R from the points
// S where the rays cross the reference sphere to its centre C: these
// direction cosines, for the valid rays of a bundle, with their pupil
// coordinates.
function sphereDirections(bundle, z, sphere) {
  const rows = [];
  for (let k = 0; k < bundle.K; k++) {
    if (!bundle.valid[k]) continue;
    const hit = sphereCrossing(bundle, k, z, sphere.C, sphere.R);
    if (!hit) continue;
    rows.push([bundle.px[k], bundle.py[k], (sphere.C[0] - hit.point[0]) / sphere.R, (sphere.C[1] - hit.point[1]) / sphere.R]);
  }
  return rows;
}

// Least-squares plane v ≈ c0 + c1 px + c2 py through rows [px, py, l, m],
// for l (axis 0) or m (axis 1). Returns the coefficients and the largest
// residual.
function affineFit(rows, axis) {
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sv = 0, svx = 0, svy = 0;
  for (const [x, y, ...dir] of rows) {
    const v = dir[axis];
    n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sv += v; svx += v * x; svy += v * y;
  }
  const A = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]], r = [sv, svx, svy];
  const det = det3(A);
  if (n < 6 || !(Math.abs(det) > 1e-12 * n * n * n)) return null;
  const c = [0, 1, 2].map(col => det3(A.map((row, i) => row.map((v, j) => (j === col ? r[i] : v)))) / det);
  let worst = 0;
  for (const [x, y, ...dir] of rows) worst = Math.max(worst, Math.abs(dir[axis] - c[0] - c[1] * x - c[2] * y));
  return { c, worst };
}

// How the pupil maps to direction cosines at one wavelength: a_x = ∂l/∂p_x
// and a_y = ∂m/∂p_y over a coarse grid of traced rays, or the paraxial NA
// (with the usual sign) when too few rays get through.
const SCALE_GRID = 12;
export function directionScale(model, field, sphere, z, paraxialNa, clip = true) {
  const g = pupilSamples(SCALE_GRID, 2 / SCALE_GRID);
  const b = traceBundle(model, field, g.px, g.py, { clip });
  const rows = sphereDirections(b, z, sphere);
  const fx = affineFit(rows, 0), fy = affineFit(rows, 1);
  const fallback = -paraxialNa / b.nImage;
  const ax = fx && Math.abs(fx.c[1]) > 0 ? fx.c[1] : fallback, ay = fy && Math.abs(fy.c[2]) > 0 ? fy.c[2] : fallback;
  return { ax, ay, n: b.nImage, measured: Boolean(fx && fy) };
}

// The smallest power-of-two FFT size, at least `base`, that gives every
// wavelength MIN_ACROSS samples across the pupil when the image samples are
// `step` apart (a wavelength whose λ/(2n|a|) is s gets M·step/s), or null
// when that would pass MAX_FFT.
export function commonFftSize(base, step, sMax) {
  let M = base;
  while (M * step / sMax < MIN_ACROSS - 1e-9) M *= 2;
  return M <= Math.max(base, MAX_FFT) ? M : null;
}

// The sign: a focus displaced by +δ from the reference point gives
// OPD = n·a·p·δ/λ (with a = ∂m/∂p, negative for an upright exit pupil: from
// the top of the pupil the centre lies downward), and the field at the pupil
// carries exp(−2πi·OPD); with the forward kernel the PSF then lands at +δ
// when the samples are placed in order of −a·p. An inverted exit pupil
// (a > 0) is placed mirrored.

// Amplitude of the illumination at normalized pupil radius ρ: uniform, or a
// Gaussian beam whose 1/e² intensity radius is `beamRatio` pupil radii.
export const illumination = (d, rho2) => (d.illumination === 'gaussian' ? Math.exp(-rho2 / (d.beamRatio * d.beamRatio)) : 1);

// |FFT|² of the pupil function A·exp(−2πi W) on the M × M grid, unshifted
// (index 0 is the reference point, index (i, j) the image point (jΔ, iΔ)
// taken modulo M). Also returns ΣA (the unaberrated peak is (ΣA)²).
export function psfFromPupil(samples, amplitude, opd) {
  const { M, index } = samples;
  const re = new Float64Array(M * M), im = new Float64Array(M * M);
  let sumA = 0, power = 0;
  for (let k = 0; k < index.length; k++) {
    const a = amplitude[k];
    if (!(a > 0) || !Number.isFinite(opd[k])) continue;
    const ph = 2 * Math.PI * opd[k];
    re[index[k]] = a * Math.cos(ph);
    im[index[k]] = -a * Math.sin(ph);
    sumA += a; power += a * a;
  }
  fft2(re, im, M);
  const I = new Float64Array(M * M);
  let peak = 0, at = 0;
  for (let i = 0; i < I.length; i++) {
    I[i] = re[i] * re[i] + im[i] * im[i];
    if (I[i] > peak) { peak = I[i]; at = i; }
  }
  return { I, sumA, power, peak, peakAt: at, center: I[0] };
}

// |U|² at a continuous image position (u, v), in samples from the
// reference point, by the pupil sum itself (the FFT gives it only at whole
// samples).
export function intensityAt(samples, amplitude, opd, u, v) {
  const { M, index } = samples;
  let re = 0, im = 0;
  for (let k = 0; k < index.length; k++) {
    const a = amplitude[k];
    if (!(a > 0) || !Number.isFinite(opd[k])) continue;
    const i = Math.floor(index[k] / M), j = index[k] % M;
    const ph = -2 * Math.PI * (opd[k] + (j * u + i * v) / M);
    re += a * Math.cos(ph); im += a * Math.sin(ph);
  }
  return re * re + im * im;
}

// The peak of a sampled PSF, refined between samples: a parabola through
// the brightest sample and its neighbours on each axis gives a sub-sample
// position, where `exact(u, v)` is evaluated; the larger value wins.
export function refinedPeak(I, M, at, exact) {
  const i0 = Math.floor(at / M), j0 = at % M;
  const val = (i, j) => I[((i + M) % M) * M + ((j + M) % M)];
  const step = (a, b, c) => { const d = a - 2 * b + c; return d < 0 ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * d))) : 0; };
  const du = step(val(i0, j0 - 1), val(i0, j0), val(i0, j0 + 1));
  const dv = step(val(i0 - 1, j0), val(i0, j0), val(i0 + 1, j0));
  const signed = k => (k < M / 2 ? k : k - M);
  const u = signed(j0) + du, v = signed(i0) + dv;
  const refined = du || dv ? exact(u, v) : I[at];
  return refined > I[at] ? { value: refined, u, v } : { value: I[at], u: signed(j0), v: signed(i0) };
}

// |OTF| along the y (tangential) and x (sagittal) frequency axes, from an
// unshifted intensity grid, normalized to 1 at zero frequency.
export function mtfFromPsf(I, M, count) {
  const re = Float64Array.from(I), im = new Float64Array(M * M);
  fft2(re, im, M);
  const dc = Math.hypot(re[0], im[0]);
  const tan = new Float64Array(count), sag = new Float64Array(count);
  for (let k = 0; k < count; k++) {
    tan[k] = dc > 0 ? Math.hypot(re[k * M], im[k * M]) / dc : 0;
    sag[k] = dc > 0 ? Math.hypot(re[k], im[k]) / dc : 0;
  }
  return { tan, sag };
}

// The centred (2h+1)² window of an unshifted grid, scaled.
function crop(I, M, h, scale) {
  const n = 2 * h + 1, out = new Float32Array(n * n);
  for (let v = -h; v <= h; v++) {
    const row = ((v + M) % M) * M;
    for (let u = -h; u <= h; u++) out[(v + h) * n + (u + h)] = I[row + ((u + M) % M)] * scale;
  }
  return out;
}

// Smallest half-width (samples) of a centred square holding `fraction` of
// the energy, at least hMin.
function energyWindow(I, M, hMin, fraction) {
  let total = 0;
  for (let i = 0; i < I.length; i++) total += I[i];
  const at = (u, v) => I[((v + M) % M) * M + ((u + M) % M)];
  let inside = at(0, 0);
  const hMax = M / 2 - 1;
  for (let h = 1; h <= hMax; h++) {
    for (let u = -h; u <= h; u++) inside += at(u, -h) + at(u, h);
    for (let v = -h + 1; v <= h - 1; v++) inside += at(-h, v) + at(h, v);
    if (h >= hMin && inside >= fraction * total) return h;
  }
  return hMax;
}

// Largest OPD step (waves) between neighbouring valid samples.
function largestStep(samples, opd) {
  const { M, index } = samples;
  const grid = new Float64Array(M * M).fill(NaN);
  for (let k = 0; k < index.length; k++) grid[index[k]] = opd[k];
  let worst = 0;
  for (const i of index) {
    const v = grid[i];
    if (!Number.isFinite(v)) continue;
    const right = (i % M) < M - 1 ? grid[i + 1] : NaN, below = i + M < M * M ? grid[i + M] : NaN;
    if (Number.isFinite(right)) worst = Math.max(worst, Math.abs(right - v));
    if (Number.isFinite(below)) worst = Math.max(worst, Math.abs(below - v));
  }
  return worst;
}

// How far the image-space direction cosines of the traced rays depart from
// an affine map of the pupil coordinates, as a fraction of the map's span:
// 0 for a perfect FFT grid.
function pupilDistortion(bundle, z, sphere) {
  const rows = sphereDirections(bundle, z, sphere);
  let worst = 0, span = 0;
  for (const axis of [0, 1]) {
    const f = affineFit(rows, axis);
    if (!f) continue;
    span = Math.max(span, Math.hypot(f.c[1], f.c[2]));
    worst = Math.max(worst, f.worst);
  }
  return span > 0 ? worst / span : 0;
}

const fmt = (v, d = 3) => String(Number(Number(v).toPrecision(d)));
// An image-plane shift (mm), in µm below a millimetre.
const shiftText = mm => (Math.abs(mm) >= 1 ? `${fmt(mm, 3)} mm` : `${fmt(mm * 1e3, 3)} µm`);

// The diffraction analysis of field `field` (an index into the system's
// fields). `zImage` is the image plane the geometric analysis chose; without
// it, that analysis is run here first.
export function analyzeDiffraction(input, { field = 0, zImage = null, throughFocus = true } = {}) {
  const sys = normalizeSystem(input);
  const errors = checkSystem(sys);
  const primaryNm = sys.wavelengthsNm[sys.primaryWavelength];
  const fo = errors.length ? null : firstOrder(sys, primaryNm);
  if (fo && !fo.ok) errors.push(fo.reason);
  if (errors.length) return { ok: false, errors, warnings: [] };
  const fi = Math.min(Math.max(0, Math.round(Number(field) || 0)), sys.fields.values.length - 1);
  const fieldValue = sys.fields.values[fi];
  if (!Number.isFinite(zImage)) {
    const geo = analyzeSystem(sys);
    if (!geo.ok) return { ok: false, errors: geo.errors, warnings: [] };
    zImage = geo.image.z;
  }
  const d = sys.diffraction;
  const warnings = [];
  const S = sys.surfaces, last = S.length - 1;
  const models = sys.wavelengthsNm.map(nm => traceModel(sys, nm, fo));
  const zLast = models[0].zLast;
  const zXp = Number.isFinite(fo.zXp) ? zLast + fo.zXp : zLast;

  // Each wavelength's paraxial image-space NA, for the beam that fills the
  // primary wavelength's entrance pupil (a fallback scale, and the through-
  // focus range), then the traced direction scales a_x, a_y.
  const paraxialNa = sys.wavelengthsNm.map(nm => {
    const n = mediumIndices(sys, nm);
    const m = paraxialRay(sys, n, fo.marginal.y[0], fo.objectSlope.marginal);
    return n[S.length] * Math.abs(m.u[last]);
  });
  if (paraxialNa.some(na => !(na > 0))) return { ok: false, errors: ['The image-space NA is zero: the beam does not converge, so there is no point-spread function.'], warnings };
  // Rays: the primary chief ray fixes the reference sphere, each
  // wavelength's own chief ray its piston.
  const chiefs = models.map(model => traceBundle(model, fieldValue, [0], [0], { clip: d.vignetting }));
  const primaryChief = chiefs[sys.primaryWavelength];
  const coarse = pupilSamples(SCALE_GRID, 2 / SCALE_GRID);
  const sphere = referenceSphere(primaryChief, zImage, zXp, primaryChief.valid[0] ? null : traceBundle(models[sys.primaryWavelength], fieldValue, coarse.px, coarse.py, { clip: d.vignetting }));
  if (!sphere) return { ok: false, errors: ['No ray of this field reaches the image, so there is no wavefront to diffract.'], warnings };
  if (!sphere.fromChief) warnings.push({ kind: 'chief', text: 'The chief ray of the primary wavelength fails, so the PSF is centred on the rays’ centroid instead.' });

  const scales = models.map((model, wi) => directionScale(model, fieldValue, sphere, zImage, paraxialNa[wi], d.vignetting));
  // λ/(2 n |a|) per wavelength and axis: the image sample at Q = 1.
  const reach = scales.map((sc, wi) => {
    const lambda = sys.wavelengthsNm[wi] * 1e-6;
    return { x: lambda / (2 * sc.n * Math.abs(sc.ax)), y: lambda / (2 * sc.n * Math.abs(sc.ay)) };
  });
  const sMin = Math.min(...reach.flatMap(r => [r.x, r.y]));
  const sMax = Math.max(...reach.flatMap(r => [r.x, r.y]));
  const reference = reach.findIndex(r => r.x === sMin || r.y === sMin);
  const N = d.grid, Q = d.padding;
  const dx = sMin / Q;
  // N samples across the pupil where the sampling must be finest; on the
  // common image grid a longer wavelength gets fewer, so the grid grows
  // until each has MIN_ACROSS.
  const M = commonFftSize(N * Q, dx, sMax);
  if (!M) {
    const finest = sys.wavelengthsNm[reach.findIndex(r => Math.min(r.x, r.y) === sMin)], coarsest = sys.wavelengthsNm[reach.findIndex(r => Math.max(r.x, r.y) === sMax)];
    return { ok: false, errors: [`The wavelengths span too wide a range for one diffraction grid (${fmt(finest, 4)} nm to ${fmt(coarsest, 4)} nm): on an FFT grid of ${MAX_FFT} the longest would get fewer than ${MIN_ACROSS} samples across the pupil. Analyse the far wavelengths separately.`], warnings };
  }
  const gridFor = (wi, MM, step) => pupilSamples(MM, 2 * reach[wi].x / (MM * step), 2 * reach[wi].y / (MM * step), scales[wi].ax > 0, scales[wi].ay > 0);
  const grids = models.map((_, wi) => gridFor(wi, M, dx));
  const bundles = models.map((model, wi) => traceBundle(model, fieldValue, grids[wi].px, grids[wi].py, { clip: d.vignetting }));
  const opds = bundles.map((b, wi) => opdWaves(b, chiefs[wi], zImage, sphere));
  // A pupil that apertures cut down to a few samples has no PSF worth the
  // name (and none at all when every sample is cut).
  for (const [wi, opd] of opds.entries()) {
    const lit = opd.reduce((n, v) => n + (Number.isFinite(v) ? 1 : 0), 0);
    if (lit >= MIN_LIT) continue;
    const cut = (bundles[wi].failed.clipped ?? 0) + (bundles[wi].failed.stop ?? 0);
    return { ok: false, errors: [`At ${fmt(sys.wavelengthsNm[wi], 4)} nm only ${lit} of the ${bundles[wi].K} pupil samples carry light, too few for a point-spread function. ${cut ? 'Apertures cut the rest: choose a finer pupil grid, or turn clear apertures off to see the lens without vignetting.' : 'Choose a finer pupil grid.'}`], warnings };
  }

  const weightsTotal = sys.wavelengthWeights.reduce((a, b) => a + b, 0);
  // Frequencies up to the highest cutoff, 1/s_min = N samples of 1/(MΔ).
  const freqCount = Math.min(M / 2, N + 1);
  const polyI = new Float64Array(M * M), polyIdeal = new Float64Array(M * M);
  let polyIdealPeak = 0;

  const perWavelength = sys.wavelengthsNm.map((nm, wi) => {
    const g = grids[wi], b = bundles[wi], opd = opds[wi];
    const amp = new Float64Array(b.K);
    let unvignetted = 0;
    for (let k = 0; k < b.K; k++) {
      const a = illumination(d, g.px[k] ** 2 + g.py[k] ** 2);
      unvignetted += a * a;
      amp[k] = b.valid[k] && Number.isFinite(opd[k]) ? a : 0;
    }
    const psf = psfFromPupil(g, amp, opd);
    const ideal = psfFromPupil(g, amp, new Float64Array(b.K));
    const idealPeak = ideal.sumA * ideal.sumA;
    const peak = refinedPeak(psf.I, M, psf.peakAt, (u, v) => intensityAt(g, amp, opd, u, v));
    const stats = wavefrontStats(g.px, g.py, opd);
    const failedCount = Object.values(b.failed).reduce((sum, v) => sum + v, 0);
    const cut = (b.failed.clipped ?? 0) + (b.failed.stop ?? 0);
    // Energy per wavelength: its weight times the fraction of the
    // illumination that gets through.
    const c = weightsTotal > 0 && unvignetted > 0 ? sys.wavelengthWeights[wi] / (weightsTotal * M * M * unvignetted) : 0;
    for (let i = 0; i < polyI.length; i++) { polyI[i] += c * psf.I[i]; polyIdeal[i] += c * ideal.I[i]; }
    polyIdealPeak += c * idealPeak;
    // The map for display, on the samples' own grid: column j holds
    // p_x = (j + ½ − cols/2)·δp_x, row i likewise in y (row 0 at −y).
    const cols = 2 * Math.ceil(1 / g.dpx), rows = 2 * Math.ceil(1 / g.dpy);
    const map = new Float32Array(cols * rows).fill(NaN);
    for (let k = 0; k < b.K; k++) {
      const j = Math.round(g.px[k] / g.dpx - 0.5) + cols / 2, i = Math.round(g.py[k] / g.dpy - 0.5) + rows / 2;
      map[i * cols + j] = opd[k];
    }
    const valid = [];
    for (let k = 0; k < b.K; k++) if (Number.isFinite(opd[k])) valid.push(k);
    const zernike = valid.length > 60 ? fitZernike(valid.map(k => g.px[k]), valid.map(k => g.py[k]), valid.map(k => opd[k])) : null;
    const naX = scales[wi].n * Math.abs(scales[wi].ax), naY = scales[wi].n * Math.abs(scales[wi].ay);
    return {
      nm, weight: sys.wavelengthWeights[wi], paraxialNa: paraxialNa[wi], na: { x: naX, y: naY },
      // Whether the exit pupil is inverted (placed mirrored on the grid).
      inverted: scales[wi].ay > 0,
      samplesAcross: { x: 2 / g.dpx, y: 2 / g.dpy }, rays: b.K, failed: b.failed, lost: failedCount, vignetting: b.K ? cut / b.K : 0,
      transmission: unvignetted > 0 ? psf.power / unvignetted : 0,
      strehl: idealPeak > 0 ? peak.value / idealPeak : 0,
      peakAt: { x: peak.u * dx, y: peak.v * dx },
      strehlAtChief: idealPeak > 0 ? psf.center / idealPeak : 0,
      wavefront: { cols, rows, step: { x: g.dpx, y: g.dpy }, map, ...stats, largestStep: largestStep(g, opd), zernike },
      // Cutoffs: tangential (y) and sagittal (x) frequencies, 2 n|a|/λ.
      cutoff: { tangential: 2 * naY / (nm * 1e-6), sagittal: 2 * naX / (nm * 1e-6) },
      mtf: mtfFromPsf(psf.I, M, freqCount), mtfIdeal: mtfFromPsf(ideal.I, M, freqCount),
      // Kept for the polychromatic peak, the window and the crops below;
      // dropped before returning.
      _I: psf.I, _ideal: ideal.I, _idealPeak: idealPeak, _exact: (u, v) => intensityAt(g, amp, opd, u, v), _c: c * M * M,
    };
  });

  const many = sys.wavelengthsNm.length > 1;
  let polyAt = 0;
  for (let i = 1; i < polyI.length; i++) if (polyI[i] > polyI[polyAt]) polyAt = i;
  const polyPeak = many ? refinedPeak(polyI, M, polyAt, (u, v) => perWavelength.reduce((sum, w) => sum + w._c * w._exact(u, v), 0) / (M * M)) : null;
  const poly = many ? {
    strehl: polyIdealPeak > 0 ? polyPeak.value / polyIdealPeak : 0,
    peakAt: { x: polyPeak.u * dx, y: polyPeak.v * dx },
    mtf: mtfFromPsf(polyI, M, freqCount),
    mtfIdeal: mtfFromPsf(polyIdeal, M, freqCount),
  } : null;

  // One display window for every PSF, from the polychromatic energy.
  const hMin = Math.min(M / 2 - 1, Math.ceil(5 * sMax / dx));
  const h = energyWindow(many ? polyI : perWavelength[0]._I, M, hMin, ENERGY_WINDOW);
  // What the page draws: half again the square that holds 95 % of the
  // light, so a faint halo does not shrink the core to a dot.
  const hView = Math.min(h, Math.max(hMin, Math.ceil(1.5 * energyWindow(many ? polyI : perWavelength[0]._I, M, 1, 0.95))));
  // The unaberrated PSF along x and y through the reference point, for the
  // cross-sections.
  const cuts = (I, scale) => ({
    x: Float32Array.from({ length: 2 * h + 1 }, (_, u) => I[(u - h + M) % M] * scale),
    y: Float32Array.from({ length: 2 * h + 1 }, (_, v) => I[((v - h + M) % M) * M] * scale),
  });
  for (const w of perWavelength) {
    const scale = w._idealPeak > 0 ? 1 / w._idealPeak : 0;
    w.psf = crop(w._I, M, h, scale);
    w.idealCut = cuts(w._ideal, scale);
    delete w._I; delete w._ideal; delete w._idealPeak; delete w._exact; delete w._c;
  }
  if (poly) {
    poly.psf = crop(polyI, M, h, polyIdealPeak > 0 ? 1 / polyIdealPeak : 0);
    poly.idealCut = cuts(polyIdeal, polyIdealPeak > 0 ? 1 / polyIdealPeak : 0);
  }

  // Validity guards.
  for (const w of perWavelength) {
    if (w.wavefront.largestStep > ALIAS_WAVES) {
      warnings.push({ kind: 'aliasing', text: `At ${fmt(w.nm, 4)} nm the wavefront changes by up to ${fmt(w.wavefront.largestStep, 2)} waves between neighbouring pupil samples (more than half a wave), so the PSF is aliased. Choose a finer pupil grid${N < 256 ? ` (${N * 2} or more)` : ''}, or reduce the aberration.` });
    }
  }
  const failures = {};
  for (const w of perWavelength) for (const [kind, count] of Object.entries(w.failed)) failures[kind] = (failures[kind] ?? 0) + count;
  for (const [kind, count] of Object.entries(failures)) {
    if (kind === 'clipped' || kind === 'stop') continue;
    warnings.push({ kind: 'rays', text: `${count} pupil ray${count === 1 ? '' : 's'} ${FAILURES[kind] ?? kind}; ${count === 1 ? 'it carries' : 'they carry'} no light in the pupil function.` });
  }
  const vignetted = perWavelength.find(w => w.vignetting > 0);
  if (vignetted && d.vignetting) warnings.push({ kind: 'vignetting', text: `${fmt(100 * vignetted.vignetting, 3)} % of the pupil is cut by apertures at ${fmt(vignetted.nm, 4)} nm; the pupil function is zero there (vignetting).` });
  const zDistance = Math.abs(zImage - zXp);
  const fresnel = Number.isFinite(fo.zXp) && zDistance > 0 ? fo.rXp * fo.rXp / (primaryNm * 1e-6 * zDistance) : Infinity;
  if (fresnel < FRESNEL_LIMIT) {
    warnings.push({ kind: 'fresnel', text: `The Fresnel number of the exit pupil seen from the image, a²/(λz) = ${fmt(fresnel, 3)}, is below ${FRESNEL_LIMIT}: the focus is not where the pupil-based (Debye) model puts it (focal shift), so this PSF is unreliable. This happens with very small or very slow optics.` });
  }
  if (fo.naImage > HIGH_NA || fo.naObject > HIGH_NA) {
    warnings.push({ kind: 'high-na', text: `The numerical aperture exceeds ${HIGH_NA}: scalar diffraction ignores polarization, which matters at high NA. A vector-diffraction tool (for example Optiland, open source) is the right check.` });
  }
  const distortion = pupilDistortion(bundles[sys.primaryWavelength], zImage, sphere);
  if (distortion > PUPIL_DISTORTION_LIMIT) {
    warnings.push({ kind: 'pupil', text: `The rays leave the lens up to ${fmt(100 * distortion, 2)} % away from an evenly spaced grid of directions (pupil distortion); the FFT assumes an even grid, so the PSF and MTF are approximate. Real ray aiming can help.` });
  }
  if (d.illumination === 'gaussian' && d.beamRatio * N / 2 < 3) {
    warnings.push({ kind: 'beam', text: `The Gaussian beam spans only ${fmt(d.beamRatio * N / 2, 2)} pupil samples to its 1/e² radius; choose a finer grid.` });
  }

  const own = { strehl: perWavelength.map(w => w.strehl), poly: poly?.strehl ?? NaN, step: Math.max(...perWavelength.map(w => w.wavefront.largestStep)), grid: N };
  const focus = throughFocus ? throughFocusCurve(sys, models, chiefs, primaryChief, gridFor, sMin, sMax, paraxialNa[sys.primaryWavelength], zImage, zXp, fo, fieldValue, own) : null;
  const aliasedPlanes = focus ? focus.shifts.filter((_, i) => focus.aliased[i]) : [];
  if (aliasedPlanes.length) {
    const lo = Math.min(...aliasedPlanes), hi = Math.max(...aliasedPlanes);
    warnings.push({ kind: 'focus-aliasing', text: `Through focus, ${aliasedPlanes.length} of the ${focus.shifts.length} planes (shifts ${shiftText(lo)} to ${shiftText(hi)}) change the wavefront by more than half a wave between neighbouring pupil samples even at ${focus.grid} samples across, so they have no Strehl ratio and are left off the plot. The wavefront there is too far from the reference sphere for a sampled pupil.` });
  }

  return {
    ok: true, warnings,
    field: fi, fieldValue, fieldUnit: sys.fields.type === 'angle' ? '°' : 'mm',
    primary: sys.primaryWavelength, primaryNm, reference,
    grid: N, padding: Q, fftSize: M, spacing: dx, window: h, viewWindow: hView,
    image: { z: zImage, center: sphere.C, radius: sphere.R, fromChief: sphere.fromChief },
    fresnelNumber: fresnel, pupilDistortion: distortion,
    illumination: { ...d },
    frequencies: Float64Array.from({ length: freqCount }, (_, k) => k / (M * dx)),
    perWavelength, poly, throughFocus: focus,
  };
}

// Strehl ratio (peak) against image-plane shift. Each plane gets its own
// reference sphere, so the defocus is exact rather than a ρ² term. The
// shifts are symmetric about the current plane, with one at zero. Each
// plane is computed on the coarsest pupil grid, from THROUGH_FOCUS.grid
// samples across up to THROUGH_FOCUS.maxGrid (or the analysis's own N if
// finer), on which its wavefront changes by at most ALIAS_WAVES between
// neighbouring samples (each plane's Strehl ratio is relative to a perfect
// lens on its own grid); a plane aliased even on the finest is flagged
// `aliased` and has no value (NaN). The plane at zero shift is the
// analysis's own (`own`: its Strehl ratios, largest step and grid), so the
// curve passes through the value the page shows.
function throughFocusCurve(sys, models, chiefs, primaryChief, gridFor, sMin, sMax, na, zImage, zXp, fo, fieldValue, own) {
  const d = sys.diffraction;
  const levels = new Map();
  const level = n => {
    if (!levels.has(n)) {
      const M = commonFftSize(2 * n, sMin / 2, sMax);
      const grids = models.map((_, wi) => gridFor(wi, M, sMin / 2));
      const bundles = models.map((model, wi) => traceBundle(model, fieldValue, grids[wi].px, grids[wi].py, { clip: d.vignetting }));
      const amps = grids.map(g => Float64Array.from(g.px, (x, k) => illumination(d, x * x + g.py[k] ** 2)));
      levels.set(n, { N: n, M, grids, bundles, amps });
    }
    return levels.get(n);
  };
  let base = Math.min(d.grid, THROUGH_FOCUS.grid);
  // A pupil cut down to a few samples on the coarse grid takes the full one.
  if (base < d.grid && level(base).bundles.some(b => b.valid.reduce((n, v) => n + v, 0) < MIN_LIT)) base = d.grid;
  const finest = Math.max(base, THROUGH_FOCUS.maxGrid, d.grid);
  const nImage = fo.n[fo.n.length - 1];
  // ±2 waves of defocus (W020 = Δz NA²/2n), or wider when this field's
  // geometric best focus lies further out, so that the peak is on the plot.
  const b = level(base).bundles[sys.primaryWavelength], group = { x: [], y: [], sx: [], sy: [] };
  for (let k = 0; k < b.K; k++) {
    if (!b.valid[k]) continue;
    const [x, y] = pointAt(b, k, zImage);
    group.x.push(x); group.y.push(y); group.sx.push(b.D[3 * k] / b.D[3 * k + 2]); group.sy.push(b.D[3 * k + 1] / b.D[3 * k + 2]);
  }
  const range = Math.max(THROUGH_FOCUS.waves * 2 * nImage * sys.wavelengthsNm[sys.primaryWavelength] * 1e-6 / (na * na), 1.5 * Math.abs(bestFocusShift([group])));
  const K = THROUGH_FOCUS.points;
  const shifts = Float64Array.from({ length: K }, (_, i) => -range + 2 * range * i / (K - 1));
  const weightsTotal = sys.wavelengthWeights.reduce((a, b) => a + b, 0);
  const strehl = sys.wavelengthsNm.map(() => new Float64Array(K));
  const poly = new Float64Array(K), aliased = new Uint8Array(K), largest = new Float64Array(K), planeGrid = new Uint16Array(K);
  const mid = (K - 1) / 2;
  for (let i = 0; i < K; i++) {
    if (i === mid) {
      largest[i] = own.step; planeGrid[i] = own.grid;
      const bad = own.step > ALIAS_WAVES;
      aliased[i] = bad ? 1 : 0;
      strehl.forEach((s, wi) => { s[i] = bad ? NaN : own.strehl[wi]; });
      poly[i] = bad ? NaN : own.poly;
      continue;
    }
    const z = zImage + shifts[i];
    const sphere = referenceSphere(primaryChief, z, zXp, b);
    if (!sphere) { poly[i] = NaN; strehl.forEach(s => { s[i] = NaN; }); continue; }
    // The coarsest grid that samples this plane's wavefront (the steps
    // shrink about as 1/N).
    let L, opds, step;
    for (let n = base; ; ) {
      L = level(n);
      opds = L.bundles.map((bb, wi) => opdWaves(bb, chiefs[wi], z, sphere));
      step = Math.max(...opds.map((opd, wi) => largestStep(L.grids[wi], opd)));
      if (step <= ALIAS_WAVES || n >= finest) break;
      let next = 2 * n;
      while (next < finest && step * n / next > ALIAS_WAVES) next *= 2;
      n = next;
    }
    largest[i] = step; planeGrid[i] = L.N;
    if (step > ALIAS_WAVES) { aliased[i] = 1; poly[i] = NaN; strehl.forEach(s => { s[i] = NaN; }); continue; }
    const { M, grids, bundles, amps } = L;
    const sum = new Float64Array(M * M), parts = [];
    let idealPeak = 0;
    bundles.forEach((bb, wi) => {
      const opd = opds[wi];
      const amp = amps[wi].map((a, k) => (bb.valid[k] && Number.isFinite(opd[k]) ? a : 0));
      let unvignetted = 0;
      for (const a of amps[wi]) unvignetted += a * a;
      const psf = psfFromPupil(grids[wi], amp, opd);
      const ideal = psf.sumA * psf.sumA;
      const exact = (u, v) => intensityAt(grids[wi], amp, opd, u, v);
      strehl[wi][i] = ideal > 0 ? refinedPeak(psf.I, M, psf.peakAt, exact).value / ideal : 0;
      const c = weightsTotal > 0 && unvignetted > 0 ? sys.wavelengthWeights[wi] / (weightsTotal * unvignetted) : 0;
      for (let k = 0; k < sum.length; k++) sum[k] += c * psf.I[k];
      parts.push([c, exact]);
      idealPeak += c * ideal;
    });
    let at = 0;
    for (let k = 1; k < sum.length; k++) if (sum[k] > sum[at]) at = k;
    const peak = refinedPeak(sum, M, at, (u, v) => parts.reduce((t, [c, exact]) => t + c * exact(u, v), 0));
    poly[i] = idealPeak > 0 ? peak.value / idealPeak : 0;
  }
  const used = [...planeGrid].filter(n => n > 0);
  return {
    grid: used.length ? Math.max(...used) : base, gridRange: used.length ? [Math.min(...used), Math.max(...used)] : [base, base], planeGrid,
    shifts, strehl, poly: sys.wavelengthsNm.length > 1 ? poly : null, aliased, largestStep: largest,
  };
}
