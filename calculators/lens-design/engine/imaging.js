// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The image of an extended target, through the PSF of one field point
// (isoplanatic) at one wavelength, in fully incoherent and in fully coherent
// light (Goodman, Introduction to Fourier Optics, ch. 6):
//
//   incoherent  I = |h|² ⊛ |o|²,  transfer function the OTF (cutoff 2 NA/λ)
//   coherent    I = |h ⊛ o|²,     transfer function the pupil (cutoff NA/λ)
//
// where h is the amplitude PSF and o the target's amplitude transmission,
// both in image-plane coordinates (the target as a perfect lens would image
// it, centred on the primary wavelength's chief ray). Coherent light is a
// plane wave travelling along the chief ray. The targets here are clear or
// opaque, so |o|² = o.
//
// The pupil is sampled on grid nodes, centre included (pupil.js), with the
// spacings of the diffraction analysis: on an M × M transform (M = N·Q) the
// image samples are Δ = λ/(2 n |a| Q) apart, and pupil sample k is spatial
// frequency k/(MΔ). With the forward transform F[q] = Σ f[n] e^{−2πiqn/M}:
//
//   h[n] = Σ_k P_k e^{−2πi k n/M},  P_k = A_k e^{−2πi W_k}   (as diffraction.js)
//   coherent:   U = F⁻¹{P[−q] · O[q]},   so that a clear field gives U = P(0)
//   incoherent: I = F⁻¹{OTF[q]/OTF[0] · O[q]},  OTF = F{|h|²}
//
// O is the target's spectrum on the same frequencies. Bars and gratings have
// closed-form spectra, so their images are exactly band-limited; the star is
// drawn on a grid finer than the image's, averaged within each fine cell,
// and transformed. Two points are delta functions: their images are the PSF
// moved by a sub-sample shift (a linear phase across the pupil), so they sit
// exactly where asked. The transform is periodic: light the PSF spreads past
// the edge of the computed field comes back on the other side, which a
// warning reports when it matters.

import { fft2 } from './fft.js';
import { traceBundle, opdWaves } from './wavefront.js';
import { illumination } from './diffraction.js';
import { monochromaticPupil, nodeSamples, nodeStep, bundleChecks } from './pupil.js';

// The Airy pattern's first zero, 3.8317/(2π) = 0.6098 λ/NA: the Rayleigh
// distance.
export const RAYLEIGH = 3.8317059702075125 / (2 * Math.PI);
// A target may fill this fraction of the computed field's half-width.
const FIT = 0.45;
// The star's radius: at most this fraction of the computed field, and
// STAR_SPAN times its coherent cutoff radius.
const STAR_RADIUS = 0.4;
const STAR_SPAN = 2.2;
// Light the PSF may send past the margin around the target before a
// warning (fraction of its energy).
const WRAP_LIMIT = 0.05;
// The finest grid the star is drawn on, and the samples per image sample.
const RASTER_MAX = 1024;
const RASTER_SAMPLES = 4;

const fmt = (v, d = 3) => String(Number(Number(v).toPrecision(d)));
const signed = (k, M) => (k < M / 2 ? k : k - M);
const sinc = t => (Math.abs(t) < 1e-12 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t));

// Inverse of fft2, normalized (1/M²), in place.
function ifft2(re, im, M) {
  for (let i = 0; i < im.length; i++) im[i] = -im[i];
  fft2(re, im, M);
  const s = 1 / (M * M);
  for (let i = 0; i < re.length; i++) { re[i] *= s; im[i] *= -s; }
}

// The pupil of the analysis, sampled for imaging. Exported for the tests
// and for engine/coupling.js's reuse of the same checks.
export function prepareImaging(input, options = {}) {
  const p = monochromaticPupil(input, options);
  if (!p.ok) return p;
  const d = p.sys.diffraction, N = d.grid, Q = d.padding, M = N * Q;
  const lambda = p.nm * 1e-6, n = p.scale.n;
  // λ/(2 n |a|) on each axis; the finer sets the image sample Δ, and each
  // axis's pupil spacing follows from it.
  const reach = { x: lambda / (2 * n * Math.abs(p.scale.ax)), y: lambda / (2 * n * Math.abs(p.scale.ay)) };
  const dx = Math.min(reach.x, reach.y) / Q;
  const g = nodeSamples(M, 2 * reach.x / (M * dx), 2 * reach.y / (M * dx), p.scale.ax > 0, p.scale.ay > 0);
  const bundle = traceBundle(p.model, p.fieldValue, g.px, g.py, { clip: d.vignetting });
  const opd = opdWaves(bundle, p.chief, p.zImage, p.sphere);
  const amp = Float64Array.from(g.px, (x, k) => (bundle.valid[k] && Number.isFinite(opd[k]) ? illumination(d, x * x + g.py[k] ** 2) : 0));
  const checks = bundleChecks(p, bundle, opd, g, nodeStep(g, opd));
  if (checks.error) return { ok: false, errors: [checks.error], warnings: p.warnings };
  let sumA = 0;
  for (const a of amp) sumA += a;
  return { ...p, M, N, Q, dx, g, amp, opd, sumA, bundle, warnings: [...p.warnings, ...checks.warnings] };
}

// The pupil function on the M × M grid, times the linear phase that moves
// its image by (u, v) samples.
function pupilField(prep, u = 0, v = 0) {
  const { M, g, amp, opd } = prep;
  const re = new Float64Array(M * M), im = new Float64Array(M * M);
  for (let k = 0; k < amp.length; k++) {
    const a = amp[k];
    if (!(a > 0)) continue;
    const ph = -2 * Math.PI * opd[k] + 2 * Math.PI * (g.kx[k] * u + g.ky[k] * v) / M;
    re[g.index[k]] = a * Math.cos(ph);
    im[g.index[k]] = a * Math.sin(ph);
  }
  return { re, im };
}

// The amplitude PSF at image position (x, y) mm from the reference point,
// by the pupil sum itself, relative to a perfect lens's peak: the value the
// transform gives on whole samples, anywhere.
export function amplitudeAt(prep, x, y) {
  const { M, g, amp, opd, dx, sumA } = prep;
  const u = x / dx, v = y / dx;
  let re = 0, im = 0;
  for (let k = 0; k < amp.length; k++) {
    const a = amp[k];
    if (!(a > 0)) continue;
    const ph = -2 * Math.PI * (opd[k] + (g.kx[k] * u + g.ky[k] * v) / M);
    re += a * Math.cos(ph); im += a * Math.sin(ph);
  }
  return [re / sumA, im / sumA];
}

// Two points at `points` (mm), the second with phase φ: the intensity at
// (x, y), incoherent and coherent, relative to a perfect lens's peak.
export function twoPointAt(prep, points, phaseRad, x, y) {
  const [a, b] = points.map(([px, py]) => amplitudeAt(prep, x - px, y - py));
  const c = Math.cos(phaseRad), s = Math.sin(phaseRad);
  const re = a[0] + b[0] * c - b[1] * s, im = a[1] + b[0] * s + b[1] * c;
  return { incoherent: a[0] ** 2 + a[1] ** 2 + b[0] ** 2 + b[1] ** 2, coherent: re * re + im * im };
}

// Closed-form spectrum of clear rectangles {cx, cy, w, h} (in samples) on
// the M × M frequency grid, as the transform of their sampled, band-limited
// transmission.
function rectSpectrum(M, rects) {
  const re = new Float64Array(M * M), im = new Float64Array(M * M);
  for (let i = 0; i < M; i++) {
    const qy = signed(i, M);
    for (let j = 0; j < M; j++) {
      const qx = signed(j, M);
      let r = 0, m = 0;
      for (const b of rects) {
        const a = b.w * b.h * sinc(qx * b.w / M) * sinc(qy * b.h / M);
        const ph = -2 * Math.PI * (qx * b.cx + qy * b.cy) / M;
        r += a * Math.cos(ph); m += a * Math.sin(ph);
      }
      re[i * M + j] = r; im[i * M + j] = m;
    }
  }
  return { re, im };
}

// A square-wave grating, clear at the centre, `cycles` periods across the
// field along `axis`: its Fourier series, 1/2 and sin(mπ/2)/(mπ), on the
// harmonics that fit the grid.
function gratingSpectrum(M, cycles, axis) {
  const re = new Float64Array(M * M), im = new Float64Array(M * M);
  for (let m = -Math.floor((M / 2 - 1) / cycles); m * cycles < M / 2; m++) {
    const q = m * cycles, c = m === 0 ? 0.5 : Math.sin(m * Math.PI / 2) / (m * Math.PI);
    if (Math.abs(c) < 1e-15) continue;
    const at = axis === 'x' ? (q + M) % M : ((q + M) % M) * M;
    re[at] = M * M * c;
  }
  return { re, im };
}

// The spectrum of a transmission inside(x, y) (mm), drawn on a grid up to
// RASTER_MAX across with each fine cell averaged over sub-samples, then
// transformed; the frequencies of the image grid are kept.
function rasterSpectrum(M, dx, inside) {
  const S = Math.max(1, Math.floor(RASTER_MAX / M)), F = S * M, sub = Math.max(1, Math.ceil(RASTER_SAMPLES / S));
  const step = dx / S;
  const re = new Float64Array(F * F), im = new Float64Array(F * F);
  for (let i = 0; i < F; i++) {
    const y = signed(i, F) * step;
    for (let j = 0; j < F; j++) {
      const x = signed(j, F) * step;
      let v = 0;
      for (let a = 0; a < sub; a++) for (let b = 0; b < sub; b++) v += inside(x + ((b + 0.5) / sub - 0.5) * step, y + ((a + 0.5) / sub - 0.5) * step);
      re[i * F + j] = v / (sub * sub);
    }
  }
  fft2(re, im, F);
  const oRe = new Float64Array(M * M), oIm = new Float64Array(M * M), s = 1 / (S * S);
  for (let qi = -M / 2; qi < M / 2; qi++) {
    for (let qj = -M / 2; qj < M / 2; qj++) {
      const from = ((qi + F) % F) * F + ((qj + F) % F), to = ((qi + M) % M) * M + ((qj + M) % M);
      oRe[to] = re[from] * s; oIm[to] = im[from] * s;
    }
  }
  return { re: oRe, im: oIm };
}

// The centred (2h + 1)² window of an unshifted grid.
function crop(A, M, h) {
  const n = 2 * h + 1, out = new Float32Array(n * n);
  for (let v = -h; v <= h; v++) {
    const row = ((v + M) % M) * M;
    for (let u = -h; u <= h; u++) out[(v + h) * n + (u + h)] = A[row + ((u + M) % M)];
  }
  return out;
}

// A target's transmission drawn on the window, averaged within each sample.
function mask(inside, h, dx) {
  const n = 2 * h + 1, out = new Float32Array(n * n), sub = 4;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    let v = 0;
    for (let a = 0; a < sub; a++) for (let b = 0; b < sub; b++) v += inside((j - h + (b + 0.5) / sub - 0.5) * dx, (i - h + (a + 0.5) / sub - 0.5) * dx);
    out[i * n + j] = v / (sub * sub);
  }
  return out;
}

// The spectrum S (unshifted, M × M) along the line y = `offset` (axis x) or
// x = `offset` (axis y), as a one-dimensional spectrum: the line's values
// are then lineValue(line, M, position), exactly, at any position (both in
// samples), since the image is band-limited to the grid's frequencies.
function lineSpectrum(S, M, axis, offset = 0) {
  const re = new Float64Array(M), im = new Float64Array(M);
  for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
    const k = i * M + j, across = signed(axis === 'x' ? i : j, M), along = axis === 'x' ? j : i;
    const ph = 2 * Math.PI * across * offset / M, c = Math.cos(ph), s = Math.sin(ph);
    re[along] += S.re[k] * c - S.im[k] * s; im[along] += S.re[k] * s + S.im[k] * c;
  }
  return { re, im };
}
function lineValue(line, M, u) {
  let re = 0, im = 0;
  for (let q = 0; q < M; q++) {
    const ph = 2 * Math.PI * signed(q, M) * u / M, c = Math.cos(ph), s = Math.sin(ph);
    re += line.re[q] * c - line.im[q] * s; im += line.re[q] * s + line.im[q] * c;
  }
  return [re / (M * M), im / (M * M)];
}

// Exact values of the image whose spectrum is S at points (u, v) in
// samples: the inverse transform summed at each point, over the spectrum's
// non-zero frequencies, with the phase factors built per axis.
function pointsFromSpectrum(S, M, points) {
  const qx = [], qy = [], re = [], im = [];
  for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
    const k = i * M + j;
    if (S.re[k] === 0 && S.im[k] === 0) continue;
    qx.push(j); qy.push(i); re.push(S.re[k]); im.push(S.im[k]);
  }
  const cx = new Float64Array(M), sx = new Float64Array(M), cy = new Float64Array(M), sy = new Float64Array(M);
  return points.map(([u, v]) => {
    for (let q = 0; q < M; q++) {
      const a = 2 * Math.PI * signed(q, M) / M;
      cx[q] = Math.cos(a * u); sx[q] = Math.sin(a * u); cy[q] = Math.cos(a * v); sy[q] = Math.sin(a * v);
    }
    let r = 0, m = 0;
    for (let k = 0; k < re.length; k++) {
      const pr = cx[qx[k]] * cy[qy[k]] - sx[qx[k]] * sy[qy[k]], pi = cx[qx[k]] * sy[qy[k]] + sx[qx[k]] * cy[qy[k]];
      r += re[k] * pr - im[k] * pi; m += re[k] * pi + im[k] * pr;
    }
    return [r / (M * M), m / (M * M)];
  });
}

// The largest value of f on [a, b] near a bracketing sample, by golden
// section (f is smooth: a band-limited image).
function goldenMax(f, a, b) {
  const g = (Math.sqrt(5) - 1) / 2;
  let x1 = b - g * (b - a), x2 = a + g * (b - a), f1 = f(x1), f2 = f(x2);
  for (let i = 0; i < 40; i++) {
    if (f1 > f2) { b = x2; x2 = x1; f2 = f1; x1 = b - g * (b - a); f1 = f(x1); } else { a = x1; x1 = x2; f1 = f2; x2 = a + g * (b - a); f2 = f(x2); }
  }
  return Math.max(f1, f2);
}

// Fraction of a PSF's energy inside the centred square of half-width h.
function energyInside(I, M, h) {
  let total = 0, inside = 0;
  for (let i = 0; i < M; i++) {
    const v = Math.abs(signed(i, M));
    for (let j = 0; j < M; j++) {
      const e = I[i * M + j];
      total += e;
      if (v <= h && Math.abs(signed(j, M)) <= h) inside += e;
    }
  }
  return total > 0 ? inside / total : 1;
}

const contrast = (bright, dark) => (bright + dark > 0 ? (bright - dark) / (bright + dark) : 0);

// The image of the system's imaging target (system.imaging) for field
// `field` at wavelength `wavelength` (indices), on the image plane zImage.
export function analyzeImaging(input, options = {}) {
  const prep = prepareImaging(input, options);
  if (!prep.ok) return { ok: false, errors: prep.errors, warnings: prep.warnings ?? [] };
  const { M, dx, sys, nm } = prep;
  const t = sys.imaging, warnings = [...prep.warnings];
  const lambda = nm * 1e-6;
  const naMin = Math.min(prep.na.x, prep.na.y);
  const L = M * dx;
  const rayleigh = { x: RAYLEIGH * lambda / prep.na.x, y: RAYLEIGH * lambda / prep.na.y };
  const cutoff = {
    coherent: { x: prep.na.x / lambda, y: prep.na.y / lambda },
    incoherent: { x: 2 * prep.na.x / lambda, y: 2 * prep.na.y / lambda },
  };
  const refuse = text => ({ ok: false, errors: [text], warnings });
  const tooBig = (extent, hint) => refuse(`The target spans ${fmt(2 * extent * 1e3, 3)} µm, more than this pupil grid computes: its field is ${fmt(L * 1e3, 3)} µm across (N λ/(2 NA) for N samples across the pupil). ${hint}`);

  let extent = 0, readout = {}, geometry = {}, inside = null, points = null, spectrum = null, h = 0, iSpec = null, cSpec = null;
  const axis = t.axis;
  if (t.target === 'points') {
    const s = t.separation * (axis === 'x' ? rayleigh.x : rayleigh.y);
    points = axis === 'x' ? [[s / 2, 0], [-s / 2, 0]] : [[0, s / 2], [0, -s / 2]];
    extent = s / 2 + 3 * Math.max(rayleigh.x, rayleigh.y);
    if (extent > FIT * L) return tooBig(extent, 'Bring the points closer, or choose a finer pupil grid.');
    geometry = { separation: s };
    h = Math.ceil(extent / dx);
  } else if (t.target === 'bars') {
    // Three vertical bars (frequency along x) and three horizontal ones,
    // each b wide and 5b long, b apart, the two sets 2b apart.
    const nu = t.frequency * 2 * naMin / lambda, b = 1 / (2 * nu);
    extent = 6 * b;
    if (extent > FIT * L) return tooBig(extent, 'Choose a higher frequency, or a finer pupil grid.');
    const rects = [];
    for (const k of [-1, 0, 1]) {
      rects.push({ cx: -3.5 * b + 2 * k * b, cy: 0, w: b, h: 5 * b });
      rects.push({ cx: 3.5 * b, cy: 2 * k * b, w: 5 * b, h: b });
    }
    inside = (x, y) => (rects.some(r => Math.abs(x - r.cx) <= r.w / 2 && Math.abs(y - r.cy) <= r.h / 2) ? 1 : 0);
    spectrum = rectSpectrum(M, rects.map(r => ({ cx: r.cx / dx, cy: r.cy / dx, w: r.w / dx, h: r.h / dx })));
    geometry = { barWidth: b, frequency: nu, rects };
    h = Math.ceil((extent + 1.5 * Math.max(rayleigh.x, rayleigh.y)) / dx);
  } else if (t.target === 'grating') {
    // A whole number of periods across the periodic field.
    const asked = t.frequency * 2 * naMin / lambda;
    const cycles = Math.round(asked * L);
    if (cycles < 2) return refuse(`At ${fmt(asked, 3)} cycles/mm fewer than two periods of the grating fit the ${fmt(L * 1e3, 3)} µm field this pupil grid computes. Choose a higher frequency, or a finer pupil grid.`);
    const nu = cycles / L;
    inside = (x, y) => (Math.cos(2 * Math.PI * nu * (axis === 'x' ? x : y)) > 0 ? 1 : 0);
    spectrum = gratingSpectrum(M, cycles, axis);
    geometry = { frequency: nu, asked, period: 1 / nu, cycles };
    h = Math.min(Math.floor(M / 4), Math.ceil(Math.max(2.5 / nu, 6 * Math.max(rayleigh.x, rayleigh.y)) / dx));
  } else {
    // A Siemens star of `spokes` cycles. Along a circle of radius r its
    // pattern has frequency spokes/(2πr), so contrast stops where that
    // reaches the cutoff; off axis the cutoffs differ in x and y, and the
    // circle becomes an ellipse (the top of the star, where the pattern runs
    // along x, is limited by the x cutoff).
    // Its radius: STAR_SPAN times the larger coherent cutoff radius, so both
    // cutoffs show with resolved spokes outside them, within the field.
    const C = t.spokes;
    const radius = nu => ({ x: C / (2 * Math.PI * nu.y), y: C / (2 * Math.PI * nu.x) });
    const cutoffRadius = { incoherent: radius(cutoff.incoherent), coherent: radius(cutoff.coherent) };
    const R0 = Math.min(STAR_RADIUS * L, STAR_SPAN * Math.max(cutoffRadius.coherent.x, cutoffRadius.coherent.y));
    inside = (x, y) => (x * x + y * y <= R0 * R0 && Math.sin(C * Math.atan2(y, x)) > 0 ? 1 : 0);
    spectrum = rasterSpectrum(M, dx, inside);
    geometry = { radius: R0, spokes: C, cutoffRadius };
    extent = R0;
    h = Math.ceil(1.08 * R0 / dx);
    if (geometry.cutoffRadius.coherent.x > R0 || geometry.cutoffRadius.coherent.y > R0) {
      warnings.push({ kind: 'target', text: `With ${C} cycles the star’s pattern is finer than the coherent cutoff all the way to its rim, so in coherent light it is not resolved anywhere. Choose fewer cycles to see where resolution stops.` });
    }
  }
  h = Math.min(h, M / 2 - 1);

  // The amplitude PSF, and its intensity.
  let incoherent, coherent, psfIntensity;
  if (points) {
    const fields = points.map(([x, y], i) => {
      const f = pupilField(prep, x / dx, y / dx);
      fft2(f.re, f.im, M);
      if (i === 1) {
        const c = Math.cos(t.phaseDeg * Math.PI / 180), s = Math.sin(t.phaseDeg * Math.PI / 180);
        for (let k = 0; k < f.re.length; k++) { const r = f.re[k]; f.re[k] = r * c - f.im[k] * s; f.im[k] = r * s + f.im[k] * c; }
      }
      return f;
    });
    const norm = 1 / (prep.sumA * prep.sumA);
    incoherent = new Float64Array(M * M); coherent = new Float64Array(M * M);
    const [a, b] = fields;
    for (let k = 0; k < M * M; k++) {
      incoherent[k] = (a.re[k] ** 2 + a.im[k] ** 2 + b.re[k] ** 2 + b.im[k] ** 2) * norm;
      coherent[k] = ((a.re[k] + b.re[k]) ** 2 + (a.im[k] + b.im[k]) ** 2) * norm;
    }
    psfIntensity = null;
  } else {
    const P = pupilField(prep);
    const hRe = Float64Array.from(P.re), hIm = Float64Array.from(P.im);
    fft2(hRe, hIm, M);
    psfIntensity = Float64Array.from(hRe, (r, k) => r * r + hIm[k] * hIm[k]);
    // Incoherent: the OTF, normalized to 1 at zero frequency.
    const oRe = Float64Array.from(psfIntensity), oIm = new Float64Array(M * M);
    fft2(oRe, oIm, M);
    const dc = oRe[0];
    const iRe = new Float64Array(M * M), iIm = new Float64Array(M * M);
    const cRe = new Float64Array(M * M), cIm = new Float64Array(M * M);
    for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
      const k = i * M + j, r = ((M - i) % M) * M + ((M - j) % M);
      const sr = spectrum.re[k], si = spectrum.im[k];
      const tr = oRe[k] / dc, ti = oIm[k] / dc;
      iRe[k] = tr * sr - ti * si; iIm[k] = tr * si + ti * sr;
      // Coherent: the pupil at −q.
      cRe[k] = P.re[r] * sr - P.im[r] * si; cIm[k] = P.re[r] * si + P.im[r] * sr;
    }
    // The image spectra are kept: the readouts and profiles below are
    // evaluated from them exactly, between samples too.
    iSpec = { re: Float64Array.from(iRe), im: Float64Array.from(iIm) };
    cSpec = { re: Float64Array.from(cRe), im: Float64Array.from(cIm) };
    ifft2(iRe, iIm, M);
    ifft2(cRe, cIm, M);
    incoherent = iRe;
    coherent = Float64Array.from(cRe, (r, k) => r * r + cIm[k] * cIm[k]);
    if (t.target !== 'grating') {
      const margin = Math.floor(M / 2 - extent / dx) - 1;
      const kept = margin > 0 ? energyInside(psfIntensity, M, margin) : 0;
      if (1 - kept > WRAP_LIMIT) {
        warnings.push({ kind: 'wrap', text: `${fmt(100 * (1 - kept), 2)} % of the point-spread function’s light falls further from its centre than the margin around the target, so it wraps round the edges of the computed field (the transform is periodic) and the image is approximate there. A finer pupil grid widens the field.` });
      }
    }
  }

  // Exact values along a line (axis x: the line y = offset; axis y: the line
  // x = offset), at position z along it, all in mm.
  const lines = new Map();
  const onLine = (lineAxis, offset) => {
    const key = `${lineAxis}${offset}`;
    if (points) {
      const phase = t.phaseDeg * Math.PI / 180;
      return z => (lineAxis === 'x' ? twoPointAt(prep, points, phase, z, offset) : twoPointAt(prep, points, phase, offset, z));
    }
    if (!lines.has(key)) lines.set(key, { i: lineSpectrum(iSpec, M, lineAxis, offset / dx), c: lineSpectrum(cSpec, M, lineAxis, offset / dx) });
    const L1 = lines.get(key);
    return z => {
      const c = lineValue(L1.c, M, z / dx);
      return { incoherent: lineValue(L1.i, M, z / dx)[0], coherent: c[0] * c[0] + c[1] * c[1] };
    };
  };

  // The profile through the centre along the axis (x for bars), four
  // points per sample; for the star, the contrast against radius between
  // the middle of a bright spoke and the middle of the next dark one.
  const along = t.target === 'points' || t.target === 'grating' ? axis : 'x';
  const centre = onLine(along, 0);
  let profile, values = null, fine = null;
  if (t.target === 'star') {
    const C = t.spokes, radii = Float64Array.from({ length: 121 }, (_, k) => 0.97 * geometry.radius * k / 120);
    const ray = angle => Array.from(radii, r => [r * Math.cos(angle) / dx, r * Math.sin(angle) / dx]);
    const bright = ray(Math.PI / (2 * C)), dark = ray(3 * Math.PI / (2 * C));
    const inc = sp => pointsFromSpectrum(iSpec, M, sp).map(z => z[0]);
    const coh = sp => pointsFromSpectrum(cSpec, M, sp).map(z => z[0] * z[0] + z[1] * z[1]);
    const ib = inc(bright), id = inc(dark), cb = coh(bright), cd = coh(dark);
    profile = {
      axis: 'radius', positions: radii,
      incoherent: Float32Array.from(ib, (b, k) => contrast(b, id[k])), coherent: Float32Array.from(cb, (b, k) => contrast(b, cd[k])),
      object: Float32Array.from(radii, r => (r <= geometry.radius ? 1 : 0)),
    };
  } else {
    fine = Float64Array.from({ length: 8 * h + 1 }, (_, k) => (k / 4 - h) * dx);
    values = Array.from(fine, centre);
    profile = {
      axis: along, positions: fine,
      incoherent: Float32Array.from(values, v => v.incoherent), coherent: Float32Array.from(values, v => v.coherent),
      object: inside ? Float32Array.from(fine, z => (along === 'x' ? inside(z, 0) : inside(0, z))) : null,
    };
  }

  // Readouts.
  if (t.target === 'points') {
    const mid = centre(0);
    // The brightest point along the line through the two: the brightest
    // profile point, refined by golden section on the exact sum.
    const peak = kind => {
      let best = 0;
      for (let k = 1; k < values.length; k++) if (values[k][kind] > values[best][kind]) best = k;
      return Math.max(values[best][kind], goldenMax(z => centre(z)[kind], fine[best] - dx / 4, fine[best] + dx / 4));
    };
    const top = { incoherent: peak('incoherent'), coherent: peak('coherent') };
    readout = {
      midpoint: mid, peak: top,
      dip: { incoherent: top.incoherent > 0 ? mid.incoherent / top.incoherent : 0, coherent: top.coherent > 0 ? mid.coherent / top.coherent : 0 },
    };
  } else if (t.target === 'bars') {
    // Contrast between the bars' centres and the gaps between them, across
    // each set: the vertical set along y = 0, the horizontal one along
    // x = 3.5 b.
    const b = geometry.barWidth;
    const across = (f, base, kind) => {
      const v = s => f(base + s * b)[kind];
      return contrast((v(-2) + v(0) + v(2)) / 3, (v(-1) + v(1)) / 2);
    };
    const vertical = onLine('x', 0), horizontal = onLine('y', 3.5 * b);
    readout = {
      contrast: {
        incoherent: { vertical: across(vertical, -3.5 * b, 'incoherent'), horizontal: across(horizontal, 0, 'incoherent') },
        coherent: { vertical: across(vertical, -3.5 * b, 'coherent'), horizontal: across(horizontal, 0, 'coherent') },
      },
    };
  } else if (t.target === 'grating') {
    // Largest and smallest value over one period, finely sampled.
    const swing = kind => {
      let lo = Infinity, hi = -Infinity;
      for (let s = 0; s < 128; s++) {
        const v = centre(s / 128 * geometry.period)[kind];
        lo = Math.min(lo, v); hi = Math.max(hi, v);
      }
      return contrast(hi, lo);
    };
    readout = { modulation: { incoherent: swing('incoherent'), coherent: swing('coherent') } };
  }

  const iCrop = crop(incoherent, M, h), cCrop = crop(coherent, M, h);
  const objectCrop = inside ? mask(inside, h, dx) : null;
  for (const v of iCrop) if (!Number.isFinite(v)) return refuse('The image is not finite; this is a bug worth reporting.');

  return {
    ok: true, warnings,
    nm, wavelength: prep.wi, field: prep.fi, fieldValue: prep.fieldValue, fieldUnit: sys.fields.type === 'angle' ? '°' : 'mm',
    target: { ...t }, normalization: points ? 'point' : 'area',
    spacing: dx, window: h, fftSize: M, grid: prep.N, padding: prep.Q, fieldOfView: L,
    na: prep.na, cutoff, rayleigh, geometry, points,
    incoherent: iCrop, coherent: cCrop, object: objectCrop, profile, readout,
    illumination: { ...sys.diffraction },
  };
}
