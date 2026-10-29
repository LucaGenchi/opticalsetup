// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Dispersion compensation calculator: the input schema, a default bench for
// each layout, and the results the page shows. DOM-free; the geometry and
// the phase come from compressor-model.js, the glasses from the canvas's
// catalogue, the chirp to compensate from the material calculator's data.

import { GLASS_OPTIONS, GLASSES, MAX_SOURCE_GDD_FS2 } from '../../sketch/js/glass.js';
import { gaussianPulseDurationAfterGDD, sech2PulseDurationAfterGDD } from '../../sketch/js/glass.js';
import { MATERIALS, MATERIAL_OPTIONS, materialDispersion, materialIndexDerivatives } from '../dispersion/materials.js';
import { defaultsFor, parseInputs, unavailable } from '../assets/calculator-inputs.js';
import { LAYOUTS, buildLayout, buildFigure, dispersionAt, fourthOrder, phaseJet, throughput, omegaOf, brewsterCut } from './compressor-model.js';

const C_NM_PER_FS = 299.792458;
const C_MM_PER_FS = 2.99792458e-4;
const TIME_BANDWIDTH = { gauss: 0.441, sech2: 0.315 };
const PRISM_GLASSES = GLASS_OPTIONS.filter(([id]) => MATERIALS.has(id));
const PRISMS = ['prism-pair', 'four-prism'];
const GRATINGS = ['grating-pair', 'four-grating', 'stretcher'];
const PAIRS = ['grating-pair', 'four-grating'];
// The longest block of glass the figure draws for the input chirp.
const MAX_BLOCK_MM = 300;

export const COMPRESSOR_INPUTS = [
  { id: 'layout', type: 'select', group: 'layout', label: 'Layout', value: 'prism-pair', options: LAYOUTS },
  { id: 'solve', type: 'select', group: 'layout', label: 'Separation', value: 'target',
    options: [['target', 'Solved for a target net GDD'], ['manual', 'Set by hand']] },
  { id: 'targetGddFs2', group: 'layout', label: 'Target net GDD', unit: 'fs²', value: 0, min: -1e8, max: 1e8,
    when: 'solve', whenValue: 'target' },

  { id: 'wavelengthNm', group: 'pulse', label: 'Central wavelength', unit: 'nm', value: 800, min: 250, max: 2500 },
  { id: 'bandwidthNm', group: 'pulse', label: 'Bandwidth (FWHM)', unit: 'nm', value: 30, min: 0.1, max: 400 },
  { id: 'shape', type: 'select', group: 'pulse', label: 'Pulse shape: time–bandwidth product', value: 'gauss',
    options: [['gauss', 'Gaussian, 0.441'], ['sech2', 'sech², 0.315']] },
  { id: 'chirp', type: 'select', group: 'pulse', label: 'Chirp to compensate', value: 'material',
    options: [['none', 'None (transform-limited input)'], ['material', 'From a material'], ['gdd', 'Entered GDD and TOD']] },
  { id: 'chirpMaterial', type: 'select', group: 'pulse', label: 'Material', value: 'nbk7', options: MATERIAL_OPTIONS,
    when: 'chirp', whenValue: 'material' },
  { id: 'chirpLengthMm', group: 'pulse', label: 'Material length', unit: 'mm', value: 30, min: 0, max: 100000,
    when: 'chirp', whenValue: 'material' },
  { id: 'inputGddFs2', group: 'pulse', label: 'Input GDD', unit: 'fs²', value: 1000, min: -1e8, max: 1e8,
    when: 'chirp', whenValue: 'gdd' },
  { id: 'inputTodFs3', group: 'pulse', label: 'Input TOD', unit: 'fs³', value: 0, min: -1e10, max: 1e10,
    when: 'chirp', whenValue: 'gdd' },
  { id: 'inputFodFs4', group: 'pulse', label: 'Input FOD', unit: 'fs⁴', value: 0, min: -1e13, max: 1e13,
    when: 'chirp', whenValue: 'gdd' },
  { id: 'polarization', type: 'select', group: 'pulse', label: 'Polarization', value: 'p',
    options: [['p', 'p (in the plane of the figure)'], ['s', 's (across it)']], when: 'layout', whenValue: PRISMS,
    help: 'Sets the Fresnel loss at the prism faces: none for p at Brewster’s angle.' },

  { id: 'prismMaterial', type: 'select', group: 'prisms', label: 'Prism glass', value: 'silica', options: PRISM_GLASSES,
    when: 'layout', whenValue: PRISMS },
  { id: 'prismCut', type: 'select', group: 'prisms', label: 'Prism cut', value: 'brewster',
    options: [['brewster', 'Brewster cut, at minimum deviation'], ['custom', 'Apex and incidence set by hand']],
    when: 'layout', whenValue: PRISMS, help: 'Brewster: apex and incidence follow from the glass at the central wavelength.' },
  { id: 'apexDeg', group: 'prisms', label: 'Apex angle', unit: '°', value: 60, min: 10, max: 80,
    all: [{ when: 'layout', whenValue: PRISMS }, { when: 'prismCut', whenValue: 'custom' }], help: 'The angle between the two faces the beam crosses.' },
  { id: 'incidenceDeg', group: 'prisms', label: 'Angle of incidence', unit: '°', value: 55, min: 0, max: 85,
    all: [{ when: 'layout', whenValue: PRISMS }, { when: 'prismCut', whenValue: 'custom' }], help: 'On the first face of each prism, from its normal.' },
  { id: 'separationMm', group: 'prisms', label: 'Separation L', unit: 'mm', value: 600, min: 30, max: 10000, arrowStep: 10,
    all: [{ when: 'layout', whenValue: PRISMS }, { when: 'solve', whenValue: 'manual' }],
    help: 'Along the central ray, from the first prism to the second.' },
  { id: 'insertion1Mm', group: 'prisms', label: 'Glass in prism 1', unit: 'mm', value: 3, min: 0.1, max: 200, arrowStep: 0.5,
    when: 'layout', whenValue: PRISMS, help: 'The central ray’s path in the first prism (and in the last of four).' },
  { id: 'insertion2Mm', group: 'prisms', label: 'Glass in prism 2', unit: 'mm', value: 10, min: 0.1, max: 200, arrowStep: 0.5,
    when: 'layout', whenValue: PRISMS, help: 'Sliding the second prism in or out tunes the GDD without moving the beam.' },
  { id: 'prismSizeMm', group: 'prisms', label: 'Prism size', unit: 'mm', value: 25.4, min: 5, max: 200,
    when: 'layout', whenValue: PRISMS, help: 'Apex to base. The colours must fit inside the second prism.' },
  { id: 'pairGapMm', group: 'prisms', label: 'Gap between the pairs', unit: 'mm', value: 100, min: 10, max: 5000,
    when: 'layout', whenValue: 'four-prism', help: 'Colours travel parallel here, so it does not change the dispersion.' },

  { id: 'lines', group: 'gratings', label: 'Line density', unit: 'lines/mm', value: 1200, min: 50, max: 3600, arrowStep: 50,
    when: 'layout', whenValue: GRATINGS },
  { id: 'gratingIncidenceDeg', group: 'gratings', label: 'Angle of incidence', unit: '°', value: 35, min: 0, max: 89,
    when: 'layout', whenValue: GRATINGS },
  { id: 'gratingSeparationMm', group: 'gratings', label: 'Separation G', unit: 'mm', value: 150, min: 1, max: 10000, arrowStep: 10,
    all: [{ when: 'layout', whenValue: PAIRS }, { when: 'solve', whenValue: 'manual' }] },
  { id: 'focalMm', group: 'gratings', label: 'Lens focal length f', unit: 'mm', value: 500, min: 50, max: 5000,
    when: 'layout', whenValue: 'stretcher' },
  { id: 'gratingLensMm', group: 'gratings', label: 'Grating to lens s', unit: 'mm', value: 200, min: 1, max: 5000, arrowStep: 10,
    all: [{ when: 'layout', whenValue: 'stretcher' }, { when: 'solve', whenValue: 'manual' }] },
  { id: 'lensDiameterMm', group: 'gratings', label: 'Lens diameter', unit: 'mm', value: 100, min: 5, max: 500,
    when: 'layout', whenValue: 'stretcher' },
  { id: 'gratingSizeMm', group: 'gratings', label: 'Grating length', unit: 'mm', value: 60, min: 5, max: 1000,
    when: 'layout', whenValue: GRATINGS },
  { id: 'efficiencyPct', group: 'gratings', label: 'Efficiency per diffraction', unit: '%', value: 92, min: 1, max: 100,
    when: 'layout', whenValue: GRATINGS },
  { id: 'beamDiameterMm', group: 'pulse', label: 'Beam diameter', unit: 'mm', value: 2, min: 0.01, max: 100 },
];

// One example bench per layout, loaded when it is chosen.
export const LAYOUT_PRESETS = {
  'prism-pair': {
    note: 'A Ti:sapphire pulse after 10 mm of N-BK7 (a lens system’s glass), recompressed by a double-pass fused-silica pair.',
    values: { solve: 'target', targetGddFs2: 0, wavelengthNm: 800, bandwidthNm: 30, shape: 'gauss', chirp: 'material',
      chirpMaterial: 'nbk7', chirpLengthMm: 10, polarization: 'p', prismMaterial: 'silica', prismCut: 'brewster',
      separationMm: 600, insertion1Mm: 3, insertion2Mm: 12, prismSizeMm: 25.4, beamDiameterMm: 2 },
  },
  'four-prism': {
    note: 'A 31 fs pulse at 800 nm after 30 mm of N-BK7, recompressed by four Brewster N-SF10 prisms in one pass: no spatial chirp, and the flint’s third-order dispersion shows in the output.',
    values: { solve: 'target', targetGddFs2: 0, wavelengthNm: 800, bandwidthNm: 30, shape: 'gauss', chirp: 'material',
      chirpMaterial: 'nbk7', chirpLengthMm: 30, polarization: 'p', prismMaterial: 'nsf10', prismCut: 'brewster',
      separationMm: 160, insertion1Mm: 3, insertion2Mm: 5, prismSizeMm: 25.4, pairGapMm: 100, beamDiameterMm: 2 },
  },
  'grating-pair': {
    note: 'A chirped-pulse amplifier at 800 nm: the pulse the stretcher example makes (+10⁶ fs², about 88 ps), recompressed by a double-pass pair of the same gratings at the same angle, which cancels its third- and fourth-order dispersion too.',
    values: { solve: 'target', targetGddFs2: 0, wavelengthNm: 800, bandwidthNm: 30, shape: 'gauss', chirp: 'gdd',
      inputGddFs2: 1e6, inputTodFs3: -1.6046e6, inputFodFs4: 4.002e6, lines: 1200, gratingIncidenceDeg: 45, gratingSeparationMm: 300, gratingSizeMm: 160,
      efficiencyPct: 92, beamDiameterMm: 8 },
  },
  'four-grating': {
    note: 'A 1030 nm fibre laser: the pulse after 20 m of fused-silica fibre, recompressed by four 1000 lines/mm gratings in one pass. Fibre and gratings add third-order dispersion of the same sign, so some remains.',
    values: { solve: 'target', targetGddFs2: 0, wavelengthNm: 1030, bandwidthNm: 8, shape: 'sech2', chirp: 'material',
      chirpMaterial: 'silica', chirpLengthMm: 20000, lines: 1000, gratingIncidenceDeg: 45, gratingSeparationMm: 100, gratingSizeMm: 50,
      efficiencyPct: 92, beamDiameterMm: 3 },
  },
  stretcher: {
    note: 'The stretcher of a Ti:sapphire amplifier: two 1200 lines/mm gratings and two f = 500 mm lenses in a double pass, stretching a 31 fs pulse with +10⁶ fs² to about 88 ps.',
    values: { solve: 'target', targetGddFs2: 1e6, wavelengthNm: 800, bandwidthNm: 30, shape: 'gauss', chirp: 'none',
      lines: 1200, gratingIncidenceDeg: 45, focalMm: 500, gratingLensMm: 200, lensDiameterMm: 100, gratingSizeMm: 100,
      efficiencyPct: 92, beamDiameterMm: 2 },
  },
};

export const COMPRESSOR_DEFAULTS = { ...defaultsFor(COMPRESSOR_INPUTS), ...LAYOUT_PRESETS['prism-pair'].values };

// The variable a solve moves, per layout family.
const SOLVED = { 'prism-pair': 'separationMm', 'four-prism': 'separationMm', 'grating-pair': 'gratingSeparationMm', 'four-grating': 'gratingSeparationMm', stretcher: 'gratingLensMm' };
const solvedInput = layout => COMPRESSOR_INPUTS.find(i => i.id === SOLVED[layout]);

// ------------------------------------------------------------ input chirp
// The input pulse's spectral phase (rad) at ω, linear terms removed, and its
// GDD and TOD at ω₀; null where the material has no index.
function inputChirp(v) {
  const w0 = omegaOf(v.wavelengthNm);
  if (v.chirp === 'none') return { gddFs2: 0, todFs3: 0, fodFs4: 0, phase: () => 0 };
  if (v.chirp === 'gdd') {
    return { gddFs2: v.inputGddFs2, todFs3: v.inputTodFs3, fodFs4: v.inputFodFs4,
      phase: w => v.inputGddFs2 * (w - w0) ** 2 / 2 + v.inputTodFs3 * (w - w0) ** 3 / 6 + v.inputFodFs4 * (w - w0) ** 4 / 24 };
  }
  const m = materialDispersion(v.chirpMaterial, v.wavelengthNm);
  if (!m) return null;
  // φ(ω) = (ω/c) n(ω) L, minus its value and slope at ω₀ (the slope is the
  // group delay, L n_g / c).
  const L = v.chirpLengthMm, n0 = m.index, ng = m.groupIndex;
  const phase = w => {
    const d = materialIndexDerivatives(v.chirpMaterial, 2 * Math.PI * C_NM_PER_FS / w);
    if (!d) return null;
    return (w * d.n - w0 * n0 - ng * (w - w0)) * L / C_MM_PER_FS;
  };
  return { gddFs2: m.gvdFs2PerMm * L, todFs3: m.todFs3PerMm * L, fodFs4: fourthOrder(w => phase(w) ?? NaN, w0), phase };
}

// ---------------------------------------------------------- pulse duration
function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (inverse ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k + len / 2], ai = im[i + k + len / 2];
        const tr = ar * cr - ai * ci, ti = ar * ci + ai * cr;
        re[i + k + len / 2] = re[i + k] - tr; im[i + k + len / 2] = im[i + k] - ti;
        re[i + k] += tr; im[i + k] += ti;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

// Spectral intensity of the pulse shape, peak 1, FWHM Δω.
const spectrum = (shape, x) => (shape === 'sech2' ? 1 / Math.cosh(1.7627471740390860 * x) ** 2 : Math.exp(-4 * Math.LN2 * x * x));
export const MAX_FFT_POINTS = 2 ** 18;

// The intensity FWHM of the pulse whose spectral phase is `phase(ω)` (rad,
// linear terms removed), from its Fourier transform
// E(t) ∝ ∫ √S(ω) e^{iφ(ω)} e^{−iωt} dω, so positive TOD trails the pulse;
// `guessFs` sizes the time window. Returns { durationFs, profile }, or
// { durationFs: null, reason } with reason 'long' when the window would need
// more than `maxPoints` points, 'domain' when more than 10⁻⁴ of the spectrum
// falls where a material or grating has no value.
export function pulseFromPhase(v, phase, guessFs, maxPoints = MAX_FFT_POINTS) {
  const w0 = omegaOf(v.wavelengthNm);
  const dw = 2 * Math.PI * C_NM_PER_FS * v.bandwidthNm / v.wavelengthNm ** 2;
  // Out to ±8 FWHM of the spectrum, and wide enough that the time step is a
  // fiftieth of the expected duration.
  const span = Math.max(16 * dw, 100 * Math.PI / guessFs);
  for (let window = Math.max(8 * guessFs, 40 * Math.PI / dw); ; window *= 2) {
    const n = 2 ** Math.ceil(Math.log2(Math.max(256, window * span / (2 * Math.PI))));
    if (n > maxPoints) return { durationFs: null, profile: null, reason: 'long' };
    const step = span / n, re = new Float64Array(n), im = new Float64Array(n);
    let lost = 0, total = 0;
    for (let i = 0; i < n; i++) {
      const x = (i - n / 2) * step, w = w0 + x;
      const s = spectrum(v.shape, x / dw);
      total += s;
      if (s < 1e-14) continue;
      const p = w > 0 ? phase(w) : null;
      if (p === null || !Number.isFinite(p)) { lost += s; continue; }
      const a = Math.sqrt(s);
      // Centre the spectrum at index 0 so the pulse sits at t = 0.
      const k = (i - n / 2 + n) % n;
      re[k] = a * Math.cos(p); im[k] = a * Math.sin(p);
    }
    if (lost > 1e-4 * total) return { durationFs: null, profile: null, reason: 'domain' };
    fft(re, im);
    const dt = 2 * Math.PI / span;
    const intensity = Array.from({ length: n }, (_, i) => {
      const k = (i + n / 2) % n;
      return re[k] * re[k] + im[k] * im[k];
    });
    let peak = 0, edge = 0;
    for (let i = 0; i < n; i++) {
      peak = Math.max(peak, intensity[i]);
      if (i < n / 16 || i >= n - n / 16) edge = Math.max(edge, intensity[i]);
    }
    if (edge > 1e-4 * peak) continue;
    const half = peak / 2;
    const first = intensity.findIndex(I => I >= half), last = n - 1 - [...intensity].reverse().findIndex(I => I >= half);
    const cross = (i, j) => i + (half - intensity[i]) / (intensity[j] - intensity[i]) * (j - i);
    const t0 = first > 0 ? cross(first - 1, first) : first, t1 = last < n - 1 ? cross(last + 1, last) : last;
    const durationFs = Math.abs(t1 - t0) * dt;
    // The time step is a fiftieth of the guess; a pulse shorter than the
    // guess is measured again on a step a fiftieth of itself.
    if (durationFs < 0.9 * guessFs) return pulseFromPhase(v, phase, durationFs, maxPoints);
    const tAt = i => (i - n / 2) * dt;
    return { durationFs, profile: { times: intensity.map((_, i) => tAt(i)), intensity: intensity.map(I => I / peak) } };
  }
}

// --------------------------------------------------------------- compute
function analyticDuration(v, tlFs, gddFs2) {
  return v.shape === 'sech2' ? sech2PulseDurationAfterGDD(tlFs, gddFs2) : gaussianPulseDurationAfterGDD(tlFs, gddFs2);
}

// A first estimate of the duration, to size the Fourier window: the GDD's
// analytic stretch plus the delay the TOD and FOD give at the spectrum's
// half maximum (each order's group delay, φ⁽ⁿ⁾ Δωⁿ⁻¹/(n−1)!). The window
// then grows until the pulse's wings fall off its edges, so a modest
// estimate costs nothing; an estimate from the band's far wings would ask
// for a window far longer than the pulse.
function durationGuess(v, tlFs, { gddFs2, todFs3, fodFs4 }) {
  const dw = Math.PI * C_NM_PER_FS * v.bandwidthNm / v.wavelengthNm ** 2;
  return analyticDuration(v, tlFs, gddFs2) + Math.abs(todFs3) * dw ** 2 / 2 + Math.abs(fodFs4 ?? 0) * dw ** 3 / 6;
}

// The layout at a value of the solved variable.
const layoutWith = (v, value) => buildLayout({ ...v, [SOLVED[v.layout]]: value });

export function computeCompressor(raw) {
  const { values: parsed, errors } = parseInputs(COMPRESSOR_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  const v = { ...COMPRESSOR_DEFAULTS, ...parsed };
  if (!(v.bandwidthNm < v.wavelengthNm / 4)) return unavailable('Keep the bandwidth under a quarter of the central wavelength.', 'bandwidthNm');
  const isPrism = PRISMS.includes(v.layout);
  if (isPrism && !brewsterCut(v.prismMaterial, v.wavelengthNm)) {
    return unavailable('The central wavelength lies outside this glass’s fit domain.', 'wavelengthNm', 'prismMaterial');
  }
  const chirp = inputChirp(v);
  if (!chirp) return unavailable('The central wavelength lies outside the chirp material’s fit domain.', 'wavelengthNm', 'chirpMaterial');
  const solvedId = SOLVED[v.layout], input = solvedInput(v.layout);
  // How the scene carries the chirp: a block of the material when the canvas
  // has the glass and it is short enough to draw, else the source's GDD.
  const drawable = v.chirp === 'material' && GLASSES.has(v.chirpMaterial) && v.chirpLengthMm > 0 && v.chirpLengthMm <= MAX_BLOCK_MM;
  // The canvas source carries at most ±MAX_SOURCE_GDD_FS2; beyond that the
  // scene carries less chirp than the page compensates, and says so.
  v.sceneChirp = v.chirp === 'none' ? null : drawable
    ? { block: { material: v.chirpMaterial, lengthMm: v.chirpLengthMm } }
    : { gddFs2: Math.max(-MAX_SOURCE_GDD_FS2, Math.min(MAX_SOURCE_GDD_FS2, chirp.gddFs2)), clipped: Math.abs(chirp.gddFs2) > MAX_SOURCE_GDD_FS2 };

  // Solve: the GDD is linear in the separation (each layout's phase is), so
  // two evaluations give it exactly.
  let solved = null;
  if (v.solve === 'target') {
    const a = input.min + 100 > input.max ? input.min : Math.max(input.min, 100), b = a + 100;
    const la = layoutWith(v, a), lb = layoutWith(v, b);
    const ga = !la.error && dispersionAt(la, v.wavelengthNm)?.gddFs2, gb = !lb.error && dispersionAt(lb, v.wavelengthNm)?.gddFs2;
    if (!Number.isFinite(ga) || !Number.isFinite(gb)) {
      return unavailable((la.error || lb.error) ?? 'No colour passes this layout at the central wavelength.', solvedId);
    }
    const slope = (gb - ga) / (b - a);
    const value = a + (v.targetGddFs2 - chirp.gddFs2 - ga) / slope;
    if (!(Number.isFinite(value) && value >= input.min && value <= input.max)) {
      const need = Number.isFinite(value) ? `${input.label} = ${value.toFixed(0)} ${input.unit}` : 'a different geometry';
      return unavailable(`The target is out of reach: it needs ${need}, outside ${input.min}–${input.max} ${input.unit} (each mm adds ${slope.toPrecision(3)} fs²). Choose a more dispersive glass or grating, or a different target.`, 'targetGddFs2');
    }
    solved = { id: solvedId, value, slopeFs2PerMm: slope };
    v[solvedId] = value;
  }
  const layout = buildFigure(v);
  if (layout.error) return unavailable(layout.error, layout.field ?? solvedId);
  const comp = dispersionAt(layout, v.wavelengthNm);
  if (!comp) return unavailable('No colour passes this layout at the central wavelength.', 'wavelengthNm');
  // The GDD each mm of the separation adds, for the readout and the scan.
  const nextLayout = layoutWith(v, v[solvedId] + 1);
  const slopeFs2PerMm = solved?.slopeFs2PerMm ?? (!nextLayout.error && dispersionAt(nextLayout, v.wavelengthNm) ? dispersionAt(nextLayout, v.wavelengthNm).gddFs2 - comp.gddFs2 : null);

  const tlFs = TIME_BANDWIDTH[v.shape] * v.wavelengthNm ** 2 / (C_NM_PER_FS * v.bandwidthNm);
  // A solved bench meets its target to rounding; say so exactly.
  const sum = chirp.gddFs2 + comp.gddFs2;
  const netGdd = solved && Math.abs(sum - v.targetGddFs2) <= 1e-9 * Math.max(Math.abs(chirp.gddFs2), Math.abs(comp.gddFs2), 1) ? v.targetGddFs2 : sum;
  const net = { gddFs2: netGdd, todFs3: chirp.todFs3 + comp.todFs3,
    fodFs4: chirp.fodFs4 !== null && comp.fodFs4 !== null ? chirp.fodFs4 + comp.fodFs4 : null };
  const w0 = omegaOf(v.wavelengthNm);
  const p0 = phaseJet(layout, w0);
  const compPhase = w => {
    const p = phaseJet(layout, w);
    return p ? p[0] - p0[0] - p0[1] * (w - w0) : null;
  };
  const sumPhase = w => {
    const a = compPhase(w), b = chirp.phase(w);
    return a === null || b === null ? null : a + b;
  };
  const output = pulseFromPhase(v, sumPhase, durationGuess(v, tlFs, net));
  const input0 = pulseFromPhase(v, chirp.phase, durationGuess(v, tlFs, chirp));
  const transform = pulseFromPhase(v, () => 0, tlFs);
  return {
    ok: true, values: v, layout, solved, comp, chirp: { gddFs2: chirp.gddFs2, todFs3: chirp.todFs3, fodFs4: chirp.fodFs4 }, net, tlFs,
    slopeFs2PerMm,
    inputGddOnlyFs: analyticDuration(v, tlFs, chirp.gddFs2), outputGddOnlyFs: analyticDuration(v, tlFs, net.gddFs2),
    inputFs: input0.durationFs, outputFs: output.durationFs, inputFailure: input0.reason ?? null, outputFailure: output.reason ?? null,
    profiles: { output: output.profile, input: input0.profile, transform: transform.profile },
    throughput: throughput(layout, v), figureIssue: layout.figureIssue ?? null,
    geometry: geometryOf(layout, v),
    compPhase, chirpPhase: chirp.phase,
  };
}

// ------------------------------------------------------------ geometry
const D2R = Math.PI / 180;
function geometryOf(layout, v) {
  const lo = v.wavelengthNm - v.bandwidthNm / 2, hi = v.wavelengthNm + v.bandwidthNm / 2;
  if (layout.kind === 'prism') {
    const { g, pairs } = layout;
    const pair = pairs[0];
    const ab = [pair.apexes[1][0] - pair.apexes[0][0], pair.apexes[1][1] - pair.apexes[0][1]];
    // The band edges' directions between the prisms, from the same angle
    // formulas the phase uses, times the separation: their spread across
    // the second prism's entrance.
    const dev = nm => {
      const n = materialIndexDerivatives(g.material, nm)?.n;
      if (!n) return null;
      const a = g.apexDeg * D2R, t2 = Math.asin(Math.sin(g.thetaDeg * D2R) / n), s4 = n * Math.sin(a - t2);
      return Math.abs(s4) < 1 ? g.thetaDeg * D2R + Math.asin(s4) - a : null;
    };
    const dLo = dev(lo), dHi = dev(hi), d0 = dev(v.wavelengthNm);
    const spreadMm = dLo !== null && dHi !== null ? g.separationMm * Math.abs(dLo - dHi) : null;
    const glassPerPass = pairs.reduce((sum, p) => sum + p.legs[0].glassMm + p.legs[1].glassMm, 0);
    const m = materialDispersion(g.material, v.wavelengthNm);
    return {
      kind: 'prism', apexDeg: g.apexDeg, incidenceDeg: g.thetaDeg, deviationDeg: d0 / D2R, separationMm: g.separationMm,
      apexDistanceMm: Math.hypot(...ab), glass: pairs.flatMap(p => p.legs.map(l => l.glassMm)), glassPerPassMm: glassPerPass,
      glassGddFs2: m ? m.gvdFs2PerMm * glassPerPass * layout.passes : null,
      spreadMm, apertureMm: spreadMm === null ? null : spreadMm + v.beamDiameterMm,
      brewsterDeg: Math.atan(g.n0) / D2R, n0: g.n0,
    };
  }
  const { gr } = layout;
  const beta = nm => {
    const s = nm * gr.lines * 1e-6 - Math.sin(gr.incidenceDeg * D2R);
    return Math.abs(s) < 1 ? Math.asin(s) : null;
  };
  const b0 = beta(v.wavelengthNm), bLo = beta(lo), bHi = beta(hi);
  const littrowDeg = Math.asin(Math.min(1, v.wavelengthNm * gr.lines * 1e-6 / 2)) / D2R;
  const G = layout.kind === 'stretcher' ? Math.abs(layout.effectiveSeparationMm) : layout.pairs[0].separationMm;
  // On the second grating the band edges land G (tan β₁ − tan β₂) apart.
  const spreadMm = bLo !== null && bHi !== null ? G * Math.abs(Math.tan(bLo) - Math.tan(bHi)) : null;
  return {
    kind: layout.kind, diffractionDeg: b0 / D2R, littrowDeg, incidenceDeg: gr.incidenceDeg,
    separationMm: layout.kind === 'stretcher' ? null : G, slantMm: layout.kind === 'stretcher' ? null : G / Math.cos(b0),
    effectiveSeparationMm: layout.kind === 'stretcher' ? layout.effectiveSeparationMm : null,
    spreadMm, apertureMm: spreadMm === null ? null : spreadMm + v.beamDiameterMm / Math.cos(b0),
  };
}

// --------------------------------------------------------------- graphs
// GDD across the spectrum: the compensator's, the input's and their sum,
// from second differences of the exact phases.
export function gddScan(result, count = 121) {
  const v = result.values;
  const dw = 2 * Math.PI * C_NM_PER_FS * v.bandwidthNm / v.wavelengthNm ** 2;
  const x = [], comp = [], input = [], net = [];
  for (let i = 0; i < count; i++) {
    const nm = v.wavelengthNm - v.bandwidthNm * 1.5 + 3 * v.bandwidthNm * i / (count - 1);
    const p = phaseJet(result.layout, omegaOf(nm));
    const c = p ? 2 * p[2] : null;
    const h = dw * 1e-3, w = omegaOf(nm);
    const f = result.chirpPhase;
    const a = f(w - h), b = f(w), e = f(w + h);
    const inGdd = [a, b, e].every(Number.isFinite) ? (a - 2 * b + e) / (h * h) : null;
    x.push(nm); comp.push(c); input.push(inGdd);
    net.push(c !== null && inGdd !== null ? c + inGdd : null);
  }
  return { x, comp, input, net };
}

// The output duration as the solved variable moves, around its value.
// The range covers about ±3τ₀²/|dGDD/dmm| (out to roughly eight times the
// transform limit at its ends), at most half the value either way; the
// full-phase duration is computed where the pulse is under 30 transform
// limits, the GDD-only one everywhere.
export function separationScan(result, count = 61) {
  const v = result.values, id = SOLVED[v.layout], input = solvedInput(v.layout);
  const center = v[id];
  const slope = Math.abs(result.slopeFs2PerMm || 0);
  const span = Math.min(Math.max(Math.abs(center) * 0.5, 20), slope > 0 ? Math.max(3 * result.tlFs ** 2 / slope, 1) : Infinity);
  const lo = Math.max(input.min, center - span), hi = Math.min(input.max, center + span);
  const tlFs = result.tlFs, out = { x: [], fs: [], gddOnly: [] };
  for (let i = 0; i < count; i++) {
    const value = lo + (hi - lo) * i / (count - 1);
    const layout = layoutWith(v, value);
    out.x.push(value);
    if (layout.error) { out.fs.push(null); out.gddOnly.push(null); continue; }
    const w0 = omegaOf(v.wavelengthNm), p0 = phaseJet(layout, w0);
    const gdd = 2 * p0[2] + result.chirp.gddFs2, tod = 6 * p0[3] + result.chirp.todFs3;
    const phase = w => {
      const p = phaseJet(layout, w), c = result.chirpPhase(w);
      return p && c !== null ? p[0] - p0[0] - p0[1] * (w - w0) + c : null;
    };
    // The compensator's FOD changes slowly with the separation: the bench's.
    const guess = durationGuess(v, tlFs, { gddFs2: gdd, todFs3: tod, fodFs4: result.net.fodFs4 });
    out.fs.push(guess < 30 * tlFs ? pulseFromPhase(v, phase, guess, 2 ** 14).durationFs : null);
    out.gddOnly.push(analyticDuration(v, tlFs, gdd));
  }
  return { ...out, label: input.label, unit: input.unit, value: center };
}
