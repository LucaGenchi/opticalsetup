// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Optical glass catalogue.

import { transformLimitedDurationFs, spectrumWeight } from './spectrum.js';
import { quadraticPhasePulse } from './pulse-field.js';
//
// Each entry carries the published three-term Sellmeier coefficients
//
//     n²(λ) = 1 + Σ Bᵢ λ² / (λ² - Cᵢ)
//
// with wavelength in micrometres. Unlike the old two-term Cauchy fit, this
// reproduces the curvature needed for group-velocity dispersion and the
// infrared zero-GVD crossing while leaving visible ray geometry effectively
// unchanged. These room-temperature catalogue curves still do not model
// absorption, temperature, stress, coatings, or manufacturing tolerances.
const LAMBDA_D = 587.6, LAMBDA_F = 486.1, LAMBDA_C = 656.3;
const C_METRES_PER_SECOND = 299792458;

const CATALOGUE = [
  {
    id: 'nbk7', label: 'N-BK7 crown (nd 1.517 / V 64.2)',
    B: [1.03961212, 0.231792344, 1.01046945],
    C: [0.00600069867, 0.0200179144, 103.560653],
    range: [300, 2500],
  },
  {
    id: 'silica', label: 'Fused silica (nd 1.459 / V 67.8)',
    B: [0.6961663, 0.4079426, 0.8974794],
    C: [0.0684043 ** 2, 0.1162414 ** 2, 9.896161 ** 2],
    range: [210, 3710],
  },
  {
    id: 'nsf5', label: 'N-SF5 flint (nd 1.673 / V 32.3)',
    B: [1.52481889, 0.187085527, 1.42729015],
    C: [0.011254756, 0.0588995392, 129.141675],
    range: [380, 2500],
  },
  {
    id: 'nsf11', label: 'N-SF11 dense flint (nd 1.785 / V 25.7)',
    B: [1.73759695, 0.313747346, 1.89878101],
    C: [0.013188707, 0.0623068142, 155.23629],
    range: [370, 2500],
  },
];

export const GLASSES = new Map(CATALOGUE.map(g => [g.id, { ...g }]));

// The one glass that shipped before this catalogue existed. Its coefficients
// were a rougher fit (Abbe 58.0 against N-BK7's real 64.2), so it is folded
// into the accurate entry on load rather than kept as a second BK7 — see the
// legacy-glass migration in state.js.
export const LEGACY_GLASS_ID = 'bk7';
export const LEGACY_GLASS_REPLACEMENT = 'nbk7';

export const GLASS_OPTIONS = CATALOGUE.map(g => [g.id, GLASSES.get(g.id).label]);

export const isDispersiveGlass = id => GLASSES.has(id);

// Index samples repeat heavily: a broadband ray is tested against several
// surfaces, and each interaction asks for the same material/wavelength pair.
// A 0.1 nm bucket is substantially finer than the tracer's spectral sampling
// while avoiding three Sellmeier-term evaluations at every surface.
const INDEX_CACHE = Object.fromEntries(CATALOGUE.map(glass => [glass.id, []]));

// Every Sellmeier fit has resonance poles just outside its published range —
// N-SF11's sits at 249.6 nm, N-SF5's at 242.7 nm, both inside the app's own
// 100-20000 nm wavelength span. Evaluating across one produces an index of 21
// and a GVD of 1e9 fs²/mm: numbers that are not merely inaccurate but absurd,
// reported with the same confidence as a real one (a 100 fs pulse through a
// glass rod came out as 2.3 milliseconds). Clamping each glass to the range
// its coefficients were published for keeps the curve monotone and physical;
// glassWavelengthRange lets callers say when they are quoting the edge rather
// than the asked-for wavelength.
function boundedWavelengthNm(wavelength, glass = null) {
  const value = Math.min(20000, Math.max(150, Number(wavelength) || LAMBDA_D));
  if (!glass?.range) return value;
  return Math.min(glass.range[1], Math.max(glass.range[0], value));
}

export const glassWavelengthRange = id => GLASSES.get(id)?.range ?? null;

// True when a wavelength falls outside the glass's published fit, so a caller
// can mark the value as extrapolated instead of presenting it as measured.
export function isWavelengthInGlassRange(id, wavelength) {
  const range = glassWavelengthRange(id);
  if (!range) return true;
  const value = Number(wavelength);
  return Number.isFinite(value) && value >= range[0] && value <= range[1];
}

// S = n² and its first two analytic derivatives with respect to wavelength
// in micrometres. Keeping the derivatives analytic avoids the step-size noise
// of finite differences in the tracer's hot loop.
function sellmeierTerms(glass, wavelengthNm) {
  const wavelengthUm = boundedWavelengthNm(wavelengthNm, glass) / 1000;
  const lambda2 = wavelengthUm * wavelengthUm;
  let squaredIndex = 1, first = 0, second = 0;
  for (let i = 0; i < glass.B.length; i++) {
    const B = glass.B[i], C = glass.C[i], denominator = lambda2 - C;
    const denominator2 = denominator * denominator;
    squaredIndex += B * lambda2 / denominator;
    first += -2 * B * C * wavelengthUm / denominator2;
    second += 2 * B * C * (3 * lambda2 + C) / (denominator2 * denominator);
  }
  return { wavelengthUm, squaredIndex, first, second };
}

// Refractive index of a catalogue glass at a wavelength, in nm.
export function glassIndex(id, wavelength = LAMBDA_D) {
  const glass = GLASSES.get(id);
  if (!glass) return null;
  const bucket = Math.round(boundedWavelengthNm(wavelength, glass) * 10);
  const cache = INDEX_CACHE[id];
  if (cache[bucket] !== undefined) return cache[bucket];
  const { squaredIndex } = sellmeierTerms(glass, bucket / 10);
  const index = squaredIndex > 0 && Number.isFinite(squaredIndex) ? Math.sqrt(squaredIndex) : null;
  cache[bucket] = index;
  return index;
}

// The true wavelengths of the Fraunhofer lines the Abbe number is defined on.
// LAMBDA_D/F/C above are the rounded values used for everything else, where a
// tenth of a nanometre is far below what the drawing or the tracer can show.
// The Abbe number cannot use them: it divides nd - 1 by nF - nC, a difference
// of about 0.008, so rounding the lines by 0.04 nm moves the result by 0.03 --
// enough to report 64.14 for a glass every catalogue lists as 64.17.
const LINE_D = 587.5618, LINE_F = 486.1327, LINE_C = 656.2725;

// Derive the displayed Abbe number from the same curve used for ray tracing,
// so the material label and its actual dispersion cannot drift apart. The
// curve is evaluated directly here rather than through glassIndex, whose
// cache buckets wavelengths to 0.1 nm.
export function glassAbbe(id) {
  const glass = GLASSES.get(id);
  if (!glass) return null;
  const at = nm => {
    const { squaredIndex } = sellmeierTerms(glass, nm);
    return squaredIndex > 0 && Number.isFinite(squaredIndex) ? Math.sqrt(squaredIndex) : NaN;
  };
  const nd = at(LINE_D), nF = at(LINE_F), nC = at(LINE_C);
  return [nd, nF, nC].every(Number.isFinite) && nF !== nC
    ? (nd - 1) / (nF - nC)
    : null;
}

// GVD cache: rays are already qualitative wavelength samples, so a 1 nm
// bucket avoids repeating the analytic derivative for many spatial rays while
// remaining far finer than the app's spectral display resolution.
const GVD_CACHE = Object.fromEntries(CATALOGUE.map(glass => [glass.id, []]));

// Group-velocity dispersion β₂ in fs²/mm at a wavelength supplied in nm.
// With λ and d²n/dλ² evaluated in micrometre units, 1e21 converts
// λ³·d²n/dλ² / c² from SI to fs²/mm.
export function glassGVD(id, wavelength = LAMBDA_D) {
  const cache = GVD_CACHE[id];
  if (!cache) return null;
  const glass = GLASSES.get(id);
  const bucketNm = Math.round(boundedWavelengthNm(wavelength, glass));
  if (cache[bucketNm] !== undefined) return cache[bucketNm];
  const { wavelengthUm, squaredIndex, first, second } = sellmeierTerms(glass, bucketNm);
  const n = Math.sqrt(squaredIndex);
  const d2n = second / (2 * n) - (first * first) / (4 * n * n * n);
  const gvd = wavelengthUm ** 3 * d2n * 1e21
    / (2 * Math.PI * C_METRES_PER_SECOND ** 2);
  const finite = Number.isFinite(gvd) ? gvd : null;
  cache[bucketNm] = finite;
  return finite;
}

// Group index n_g = n - lambda*dn/dlambda from the same Sellmeier curve used
// for refraction and GVD. This is what a broad flat spectrum needs: comparing
// n_g at its two endpoints gives the actual first-arrival/last-arrival spread
// through a traced length, without pretending that a centre-wavelength GDD is
// adequate hundreds of nanometres away from the centre.
export function glassGroupIndex(id, wavelength = LAMBDA_D) {
  const glass = GLASSES.get(id);
  if (!glass) return null;
  const { wavelengthUm, squaredIndex, first } = sellmeierTerms(glass, wavelength);
  const n = Math.sqrt(squaredIndex);
  if (!(n > 0) || !Number.isFinite(first)) return null;
  const ng = n - wavelengthUm * first / (2 * n);
  return Number.isFinite(ng) ? ng : null;
}

const FS_PER_MM_IN_VACUUM = 1e12 / C_METRES_PER_SECOND;

// Signed endpoint group-delay difference T(lambda_hi)-T(lambda_lo), in fs.
// Keeping the sign lets different materials (or a signed GDD proxy) cancel;
// callers take the magnitude only when converting the final spread to a width.
export function glassGroupDelayDifferenceFs(id, wavelengthLoNm, wavelengthHiNm, lengthMm) {
  const lo = Number(wavelengthLoNm), hi = Number(wavelengthHiNm), length = Number(lengthMm);
  if (!(hi > lo) || !(length >= 0)) return null;
  const ngLo = glassGroupIndex(id, lo), ngHi = glassGroupIndex(id, hi);
  if (![ngLo, ngHi].every(Number.isFinite)) return null;
  const delay = length * (ngHi - ngLo) * FS_PER_MM_IN_VACUUM;
  return Number.isFinite(delay) ? delay : null;
}

// Signed endpoint delay produced by a lumped GDD value. Frequencies are in
// rad/fs, so multiplying by fs^2 yields femtoseconds directly.
export function gddGroupDelayDifferenceFs(gddFs2, wavelengthLoNm, wavelengthHiNm) {
  const gdd = Number(gddFs2), lo = Number(wavelengthLoNm), hi = Number(wavelengthHiNm);
  if (!Number.isFinite(gdd) || !(hi > lo)) return null;
  const cNmPerFs = C_METRES_PER_SECOND * 1e-6;
  const difference = gdd * 2 * Math.PI * cNmPerFs * (1 / hi - 1 / lo);
  return Number.isFinite(difference) ? difference : null;
}

// Transform-limited Gaussian pulse broadening under second-order dispersion.
// Inputs and output are all femtosecond-based (fs and fs²). Higher-order
// dispersion and any pre-existing chirp remain outside this estimate.
export function gaussianPulseDurationAfterGDD(pulseWidthFs, gddFs2) {
  const input = Number(pulseWidthFs), gdd = Number(gddFs2);
  if (!(input > 0) || !Number.isFinite(gdd)) return null;
  const chirp = 4 * Math.log(2) * gdd / (input * input);
  const output = input * Math.sqrt(1 + chirp * chirp);
  return Number.isFinite(output) ? output : null;
}

// FWHM of a transform-limited sech^2 intensity pulse after quadratic spectral
// phase, normalised to an input FWHM of 1. The values were generated by a
// converged Fourier propagation of E(t)=sech(t/T0) (131072 samples, 0.00305
// input-FWHM spacing). Linear interpolation stays within 0.12% of a denser
// verification grid for |GDD|/tau0^2 <= 20. Above that the spectrum-to-time
// mapping approaches Delta-t = 2*pi*0.315*|GDD|/tau0; the final segment is
// continued with that published time-bandwidth-product asymptote.
const SECH2_GDD_FWHM = [
  [0, 1], [0.01, 1.00135167], [0.02, 1.00535408], [0.03, 1.01186186],
  [0.05, 1.03152785], [0.075, 1.06582806], [0.1, 1.10717281],
  [0.15, 1.20028603], [0.2, 1.29851270], [0.3, 1.49592468],
  [0.4, 1.68926872], [0.5, 1.87817310], [0.75, 2.33708078],
  [1, 2.78626394], [1.5, 3.67944692], [2, 4.58066309],
  [3, 6.42117221], [4, 8.30420613], [5, 10.21566535],
  [7.5, 15.06143181], [10, 19.95304236], [15, 29.78794814],
  [20, 39.65016596],
];
const SECH2_ASYMPTOTIC_SLOPE = 2 * Math.PI * 0.315;

function sech2DurationFactor(normalizedGdd) {
  const q = Math.abs(Number(normalizedGdd));
  if (!Number.isFinite(q)) return null;
  const last = SECH2_GDD_FWHM.at(-1);
  if (q >= last[0]) return last[1] + (q - last[0]) * SECH2_ASYMPTOTIC_SLOPE;
  for (let i = 1; i < SECH2_GDD_FWHM.length; i++) {
    const a = SECH2_GDD_FWHM[i - 1], b = SECH2_GDD_FWHM[i];
    if (q > b[0]) continue;
    const t = (q - a[0]) / (b[0] - a[0]);
    return a[1] + (b[1] - a[1]) * t;
  }
  return 1;
}

export function sech2PulseDurationAfterGDD(transformLimitedFwhmFs, gddFs2) {
  const tau0 = Number(transformLimitedFwhmFs), gdd = Number(gddFs2);
  if (!(tau0 > 0) || !Number.isFinite(gdd)) return null;
  const factor = sech2DurationFactor(gdd / (tau0 * tau0));
  const output = tau0 * factor;
  return Number.isFinite(output) ? output : null;
}

function gddForSech2Duration(transformLimitedFwhmFs, durationFs) {
  const tau0 = Number(transformLimitedFwhmFs), duration = Number(durationFs);
  if (!(tau0 > 0) || !(duration >= tau0)) return null;
  const target = duration / tau0;
  const last = SECH2_GDD_FWHM.at(-1);
  if (target >= last[1]) {
    return tau0 * tau0 * (last[0] + (target - last[1]) / SECH2_ASYMPTOTIC_SLOPE);
  }
  let lo = 0, hi = last[0];
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (sech2DurationFactor(mid) < target) lo = mid;
    else hi = mid;
  }
  return tau0 * tau0 * (lo + hi) / 2;
}

// The chirp that stretches a pulse of transform limit tau0 to a given duration,
// by inverting the Gaussian formula or the sech² table. Used only to convert a
// laser saved as duration + bandwidth into the bandwidth + GDD it is now
// authored as; below the limit there is no chirp to find, so it returns 0.
export function chirpGddForDuration(transformLimitFs, durationFs, shape = 'gauss') {
  const tau0 = Number(transformLimitFs), duration = Number(durationFs);
  if (!(tau0 > 0) || !(duration > tau0 * (1 + 1e-12))) return 0;
  const magnitude = shape === 'sech2'
    ? gddForSech2Duration(tau0, duration)
    : tau0 * tau0 / (4 * Math.LN2) * Math.sqrt((duration / tau0) ** 2 - 1);
  return Number.isFinite(magnitude) ? magnitude : 0;
}

// What a pulsed laser emits, from its authored controls. The one accessor
// every reader uses -- the tracer's pulse record, peak power, pulse energy,
// the inspector's readouts and the two-photon hand-off -- so the duration they
// quote cannot drift apart.
//  - Transform-limited: the duration and shape are authored; the transform
//    limit is that duration and no GDD is carried.
//  - Chirped: the bandwidth, a sign and a non-negative GDD magnitude are
//    authored; the transform limit follows from the bandwidth and the emitted
//    duration from the signed GDD, so it can never fall below the limit.
// The signed GDD is the canonical value; sign and magnitude are two controls
// over it and cannot disagree.
export const MAX_SOURCE_GDD_FS2 = 1e7;
// The authorable range of a transform-limited duration, and fixed bounds for
// a chirped pulse's bandwidth wide enough to hold the transform-limited
// bandwidth of every such pulse at every allowed wavelength (1e-8 nm for a
// 1 ms sech² pulse at 100 nm, 2e5 nm for a 1 fs pulse at 12 µm). Fixed, so no
// edit of wavelength or shape can move a stored bandwidth out of bounds: the
// spectrum, the timing and a reload all read the one stored value.
export const MIN_PULSE_FS = 1, MAX_PULSE_FS = 1e9;
export const MIN_BANDWIDTH_NM = 1e-9, MAX_BANDWIDTH_NM = 1e6;
export function authoredPulseTiming(params = {}) {
  const shape = params.pulseShape === 'sech2' ? 'sech2' : 'gauss';
  if (params.transformLimited !== false) {
    const tau = Math.min(MAX_PULSE_FS, Math.max(MIN_PULSE_FS, Number(params.pulseWidthFs) || 100));
    return { transformLimited: true, transformLimitFs: tau, inputGddFs2: 0, durationFs: tau, shape };
  }
  const bandwidth = Math.max(0, Number(params.bandwidth) || 0);
  const tau0 = transformLimitedDurationFs(bandwidth, Number(params.wavelength), shape);
  const magnitude = Math.min(MAX_SOURCE_GDD_FS2, Math.max(0, Number(params.chirpGddFs2) || 0));
  const gdd = magnitude * (params.inputChirp === 'negative' ? -1 : 1);
  const durationFs = !(tau0 > 0) || !Number.isFinite(tau0) ? null
    : shape === 'sech2' ? sech2PulseDurationAfterGDD(tau0, gdd) : gaussianPulseDurationAfterGDD(tau0, gdd);
  return {
    transformLimited: false,
    transformLimitFs: Number.isFinite(tau0) && tau0 > 0 ? tau0 : null,
    inputGddFs2: gdd,
    durationFs: Number.isFinite(durationFs) ? durationFs : null,
    shape,
  };
}

// One duration model shared by detector readouts, probes, scopes and packet
// drawing. Narrowband pulses use bandwidth to recover their transform limit
// and therefore the magnitude of authored input chirp. A flat supercontinuum
// uses the signed endpoint group-delay difference accumulated along the path.
//
// The model only answers when the phase it needs is known. It declines --
// `durationFs: null`, `available: false`, with a model string that says why --
// for a pulse whose spectral phase was declared unknown, for a sampled
// envelope whose field is gone, for a spectrum reshaped since emission, and
// for a duration shorter than its bandwidth allows. A declined result is not
// "uncompressible": the phase that would decide it is simply not known. The
// one exception is a path with no dispersion at all, where the configured
// duration is the answer whatever the phase.
export const DISPERSION_UNAVAILABLE = {
  unknownPhase: 'Spectral phase unknown — dispersed duration unavailable',
  reshaped: 'Spectrum reshaped after emission — dispersed duration unavailable',
  sampled: 'Sampled envelope unavailable — dispersed duration unavailable',
  belowLimit: 'Duration shorter than its bandwidth allows — dispersed duration unavailable',
  partialFan: 'Only part of the fanned-out spectrum reaches this detector — dispersed duration unavailable',
  generated: 'Continuum generated on the bench — its duration is not modelled',
  recordsDiffer: 'Parts of this beam carry different pulse histories — duration unavailable',
  unresolved: 'Filtered spectrum not resolvable — its transform at this dispersion exceeds the numerical window',
  broadGdd: 'Band too broad for one quadratic phase — the GDD along the path varies across it; duration unavailable',
  etalon: 'Etalon comb not carried for timing — its fringes and phase are not modelled; duration unavailable',
};

function declinedDuration(model, extra = {}) {
  return {
    durationFs: null, available: false, transformLimitFs: null, inputGddFs2: null, totalGddFs2: null,
    ...extra, model,
  };
}

// Phase is authored in two places: the pulsed laser's Input chirp, and the
// crystal/OPO outputs' spectral phase. A pulse that is not transform-limited
// derives a chirp only when one of them names a sign; anything else, including
// a sketch saved before the choice existed, is unknown.
function authoredChirpSign(pulse) {
  if (pulse?.transformLimited === true) return 0;
  if (pulse?.spectralPhase === 'unknown') return null;
  if (pulse?.inputChirp === 'positive') return 1;
  if (pulse?.inputChirp === 'negative') return -1;
  return null;
}

export function pulseDurationAfterDispersion(pulse, pathGddFs2 = 0, groupDelayDifferenceFs = 0) {
  const input = Number(pulse?.pulseWidthFs);
  const bandwidthKnown = Number.isFinite(Number(pulse?.bandwidthNm));
  const bandwidth = bandwidthKnown ? Math.max(0, Number(pulse.bandwidthNm)) : 0;
  const shape = pulse?.pulseShape === 'sech2' ? 'sech2' : 'gauss';
  const gdd = Number(pathGddFs2), delayDifference = Number(groupDelayDifferenceFs);
  if (!(input > 0) || !Number.isFinite(gdd) || !Number.isFinite(delayDifference)) return null;
  // A sampled envelope is answered by its field, never by this model: if the
  // caller got here, that field is gone or invalid, and the pulse is neither a
  // chirped Gaussian nor a flat band.
  if (pulse?.pulseShape === 'sampled' || pulse?.fieldIssue) {
    return declinedDuration(pulse?.fieldIssue || DISPERSION_UNAVAILABLE.sampled, { totalGddFs2: gdd });
  }
  // Filtering a pulse changes its duration by itself, and the dispersion
  // already accumulated belongs to wavelengths that may since have been
  // removed, so neither the source spectrum nor the surviving one gives an
  // honest answer from a single accumulated number.
  // A continuum a crystal generated has no authored duration of its own --
  // the record's width is the pump's -- so there is nothing to disperse,
  // filtered or not.
  if (pulse?.durationUnknown) return declinedDuration(DISPERSION_UNAVAILABLE.generated, { totalGddFs2: gdd });
  // A filtered pulse is answered from the spectrum that survived the filter,
  // when the record carries it.
  if (pulse?.etalonComb) return declinedDuration(DISPERSION_UNAVAILABLE.etalon, { totalGddFs2: gdd });
  if (pulse?.spectrumReshaped) {
    return Array.isArray(pulse.filteredPieces) && pulse.filteredPieces.length
      ? filteredPulseDuration(pulse, pulse.filteredPieces, gdd)
      : declinedDuration(DISPERSION_UNAVAILABLE.reshaped, { totalGddFs2: gdd });
  }
  const undispersed = Math.abs(gdd) < 1e-9 && Math.abs(delayDifference) < 1e-9;
  if (!(bandwidth > 0) && pulse?.transformLimited !== true) return {
    durationFs: input,
    available: true,
    transformLimitFs: null,
    inputGddFs2: 0,
    totalGddFs2: gdd,
    model: '0 nm bandwidth — unchanged',
  };
  if (pulse?.spectrumKind === 'flat') {
    // The authored continuum duration is a floor here: a compressor can take
    // the path's spread back out, not the chirp the source was authored with.
    const duration = Math.sqrt(input * input + delayDifference * delayDifference);
    return Number.isFinite(duration) ? {
      durationFs: duration,
      available: true,
      transformLimitFs: Number.isFinite(pulse.transformLimitFs) ? pulse.transformLimitFs : null,
      inputGddFs2: null,
      totalGddFs2: gdd,
      groupDelayDifferenceFs: delayDifference,
      model: 'Flat-band endpoint group-delay spread',
    } : null;
  }
  // A laser authored as bandwidth + signed GDD states its phase outright:
  // no inversion from duration is needed or wanted.
  if (pulse?.transformLimited !== true && Number.isFinite(pulse?.inputGddFs2) && Number(pulse?.transformLimitFs) > 0) {
    const tau0 = Number(pulse.transformLimitFs), inputGdd = Number(pulse.inputGddFs2);
    const totalGdd = inputGdd + gdd;
    const duration = shape === 'sech2' ? sech2PulseDurationAfterGDD(tau0, totalGdd) : gaussianPulseDurationAfterGDD(tau0, totalGdd);
    if (!Number.isFinite(duration)) return null;
    const state = inputGdd === 0 ? 'no chirp set' : `${inputGdd < 0 ? 'negative' : 'positive'} chirp ${Math.abs(inputGdd).toLocaleString('en-US', { maximumFractionDigits: 0 })} fs²`;
    return {
      durationFs: duration, available: true, transformLimitFs: tau0, inputGddFs2: inputGdd, totalGddFs2: totalGdd,
      model: `${shape === 'sech2' ? 'Sech² numerical GDD' : 'Gaussian GDD'} · ${state}`,
    };
  }
  const sign = authoredChirpSign(pulse);
  const configuredOnly = model => ({
    durationFs: input, available: true, transformLimitFs: null, inputGddFs2: null, totalGddFs2: gdd, model,
  });
  if (sign === null) {
    return undispersed ? configuredOnly('Configured duration · zero net modeled dispersion · spectral phase unknown')
      : declinedDuration(DISPERSION_UNAVAILABLE.unknownPhase, { totalGddFs2: gdd });
  }
  const center = Number(pulse?.centerWavelengthNm);
  const tau0 = pulse?.transformLimited === true
    ? input : transformLimitedDurationFs(bandwidth, center, shape);
  // A configured duration shorter than its bandwidth permits is not a chirped
  // pulse, and there is no phase from which to predict what glass does to it.
  if (!(tau0 > 0) || !Number.isFinite(tau0) || input + 1e-9 < tau0) {
    return undispersed ? configuredOnly('Configured duration · zero net modeled dispersion · below its transform limit')
      : declinedDuration(DISPERSION_UNAVAILABLE.belowLimit, {
        transformLimitFs: Number.isFinite(tau0) ? tau0 : null, totalGddFs2: gdd,
      });
  }
  let initialMagnitude = 0;
  if (sign !== 0 && input > tau0 * (1 + 1e-12)) {
    initialMagnitude = shape === 'sech2'
      ? gddForSech2Duration(tau0, input)
      : tau0 * tau0 / (4 * Math.LN2) * Math.sqrt((input / tau0) ** 2 - 1);
  }
  if (!Number.isFinite(initialMagnitude)) return null;
  const inputGdd = initialMagnitude * (sign || 1);
  const totalGdd = inputGdd + gdd;
  const duration = shape === 'sech2'
    ? sech2PulseDurationAfterGDD(tau0, totalGdd)
    : gaussianPulseDurationAfterGDD(tau0, totalGdd);
  if (!Number.isFinite(duration)) return null;
  // An OPO's chirped output is held as its transform limit plus the GDD it
  // carries on the ray, so it is already in `gdd` and must not be added again.
  const state = pulse?.spectralPhase === 'positiveChirp' ? 'positive chirp carried as GDD'
    : sign === 0 ? 'transform-limited'
      : `${sign < 0 ? 'negative' : 'positive'} input chirp`;
  return {
    durationFs: duration,
    available: true,
    transformLimitFs: tau0,
    inputGddFs2: inputGdd,
    totalGddFs2: totalGdd,
    model: `${shape === 'sech2' ? 'Sech² numerical GDD' : 'Gaussian GDD'} · ${state}`,
  };
}

// The duration a set of arrivals would report, or a declined result when
// they are not one pulse. Rays of one train reaching a detector by paths of
// different dispersion -- two interferometer arms, say -- carry different
// spectral phases, and GDD on separate arrivals does not compensate the way
// GDD in sequence on one ray does: +5000 fs² on one arm and −5000 fs² on the
// other give equal widths, yet their mean describes neither. So the paths
// must agree in phase, not merely in width. Three tests, all required:
//  - the quadratic phase each path adds, relative to their mean, stays within
//    0.1 rad at the edge of the pulse's FWHM bandwidth;
//  - a broad band's endpoint delays agree within 2 % of the duration;
//  - every path's own duration, and the mean-GDD duration, agree within 2 %.
// The 2 % and 0.1 rad are a display heuristic for small variations -- the
// few fs² across a thick lens's aperture -- not a proof that distinct fields
// combine into one pulse.
export const PATH_SPREAD_TOLERANCE = 0.02;
export const PATH_PHASE_TOLERANCE_RAD = 0.1;
export const PATHS_DISAGREE = 'Paths with different dispersion reach this detector — duration unavailable';
const TIME_BANDWIDTH = { gauss: 0.441, sech2: 0.315 };
export function pulseDurationAcrossPaths(pulse, paths) {
  const list = (paths || []).filter(p => Number.isFinite(p?.gddFs2));
  if (!list.length) return pulseDurationAfterDispersion(pulse, 0, 0);
  const weightOf = p => (Number.isFinite(p.weight) && p.weight > 0 ? p.weight : 1);
  const weight = list.reduce((sum, p) => sum + weightOf(p), 0);
  const mean = key => list.reduce((sum, p) => sum + (p[key] || 0) * weightOf(p), 0) / weight;
  const meanGdd = mean('gddFs2'), meanDelay = mean('groupDelayDifferenceFs');
  const central = pulseDurationAfterDispersion(pulse, meanGdd, meanDelay);
  if (!central || central.available === false) return central;
  const disagree = declinedDuration(PATHS_DISAGREE, { totalGddFs2: central.totalGddFs2 });
  if (list.length === 1) return central;
  const tau0 = Number(central.transformLimitFs);
  if (tau0 > 0) {
    const tbp = TIME_BANDWIDTH[pulse?.pulseShape === 'sech2' ? 'sech2' : 'gauss'];
    const halfWidth = Math.PI * tbp / tau0; // half the FWHM angular bandwidth, rad/fs
    const phase = list.map(p => Math.abs(p.gddFs2 - meanGdd) * halfWidth * halfWidth / 2);
    if (Math.max(...phase) > PATH_PHASE_TOLERANCE_RAD) return disagree;
  }
  const delaySpread = Math.max(...list.map(p => Math.abs((p.groupDelayDifferenceFs || 0) - meanDelay)));
  if (delaySpread > PATH_SPREAD_TOLERANCE * central.durationFs) return disagree;
  const widths = list.map(p => pulseDurationAfterDispersion(pulse, p.gddFs2, p.groupDelayDifferenceFs || 0)?.durationFs);
  if (widths.some(w => !Number.isFinite(w))) return disagree;
  const all = [...widths, central.durationFs];
  if ((Math.max(...all) - Math.min(...all)) / Math.max(1e-9, central.durationFs) > PATH_SPREAD_TOLERANCE) return disagree;
  return central;
}

// The quadratic spectral phase a pulse left its source with, for a filtered
// pulse: `gddFs2`, or `continuum` for a supercontinuum authored only as a band
// and a duration, or `declined` with the reason.
function sourceSpectralPhase(pulse) {
  if (pulse?.transformLimited === true) return { gddFs2: 0 };
  if (Number.isFinite(pulse?.inputGddFs2)) return { gddFs2: Number(pulse.inputGddFs2) };
  // An OPO's chirp is carried on the ray as GDD already.
  if (pulse?.spectralPhase === 'positiveChirp') return { gddFs2: 0 };
  if (pulse?.spectrumKind === 'flat') return { continuum: true };
  const sign = authoredChirpSign(pulse);
  if (sign === null) return { declined: DISPERSION_UNAVAILABLE.unknownPhase };
  const input = Number(pulse?.pulseWidthFs), shape = pulse?.pulseShape === 'sech2' ? 'sech2' : 'gauss';
  const tau0 = transformLimitedDurationFs(Number(pulse?.bandwidthNm), Number(pulse?.centerWavelengthNm), shape);
  if (!(tau0 > 0) || !Number.isFinite(tau0) || !(input + 1e-9 >= tau0)) return { declined: DISPERSION_UNAVAILABLE.belowLimit };
  if (sign === 0 || !(input > tau0 * (1 + 1e-12))) return { gddFs2: 0 };
  const magnitude = shape === 'sech2' ? gddForSech2Duration(tau0, input)
    : tau0 * tau0 / (4 * Math.LN2) * Math.sqrt((input / tau0) ** 2 - 1);
  return Number.isFinite(magnitude) ? { gddFs2: sign * magnitude } : { declined: DISPERSION_UNAVAILABLE.unknownPhase };
}

// The duration of a pulse whose spectrum a filter, dichroic, etalon or AOTF
// has reshaped. An ideal filter changes the amplitude of the spectrum and not
// its phase, so the phase at the detector is still the source's quadratic
// phase plus every GDD on the path, wherever the filter stands; the duration
// is the transform of the surviving spectrum with that phase. `pieces` are
// what arrives: [{ spec, lo, hi, power }], each a spectrum restricted to
// [lo, hi] carrying `power`. The path GDD is the glass's at the arriving
// light's own wavelengths -- a slice cut from a fanned-out band carries the
// GDD at its own centre -- and higher orders are not modelled.
//
// A supercontinuum has a duration and no phase. It is taken as a linear sweep
// across its band, so a slice carries the share of the authored duration its
// width spans; with the sign unknown, that and the slice's own dispersed
// duration add in quadrature, and a compressor cannot take the source part out.
// A numerical transform costs about a millisecond, and packets ask again
// every frame, so answers are kept by what they depend on.
const filteredDurations = new Map();
export function filteredPulseDuration(pulse, pieces, pathGddFs2 = 0) {
  const key = JSON.stringify([
    (pieces || []).map(p => [p?.lo, p?.hi, p?.power, p?.spec]), Number(pathGddFs2),
    pulse?.transformLimited, pulse?.inputGddFs2, pulse?.spectralPhase, pulse?.spectrumKind, pulse?.inputChirp,
    pulse?.pulseWidthFs, pulse?.bandwidthNm, pulse?.centerWavelengthNm, pulse?.pulseShape,
    pulse?.spectrumLoNm, pulse?.spectrumHiNm,
  ]);
  if (filteredDurations.has(key)) return { ...filteredDurations.get(key) };
  const result = computeFilteredPulseDuration(pulse, pieces, pathGddFs2);
  if (filteredDurations.size >= 256) filteredDurations.clear();
  filteredDurations.set(key, result);
  return { ...result };
}
function computeFilteredPulseDuration(pulse, pieces, pathGddFs2) {
  const gdd = Number(pathGddFs2);
  const list = (pieces || []).filter(p => p?.spec && p.hi > p.lo && p.power > 0);
  if (!list.length || !Number.isFinite(gdd)) return declinedDuration(DISPERSION_UNAVAILABLE.reshaped, { totalGddFs2: gdd });
  const source = sourceSpectralPhase(pulse);
  if (source.declined) return declinedDuration(source.declined, { totalGddFs2: gdd });
  // Each piece keeps the power that arrived in it, spread over its own
  // interval with its spectrum's shape: a slice attenuated more than its
  // neighbour -- by an aperture, a path, a coating -- stays attenuated, and
  // the answer does not depend on how the same light is partitioned.
  const scaled = list.map(p => {
    let area = 0;
    for (let i = 0; i < 512; i++) area += spectrumWeight(p.spec, p.lo + (p.hi - p.lo) * (i + 0.5) / 512);
    area *= (p.hi - p.lo) / 512;
    return area > 0 ? { ...p, scale: p.power / area } : null;
  }).filter(Boolean);
  if (!scaled.length) return declinedDuration(DISPERSION_UNAVAILABLE.reshaped, { totalGddFs2: gdd });
  const density = nm => scaled.reduce((sum, p) => (nm >= p.lo && nm <= p.hi
    ? sum + p.scale * spectrumWeight(p.spec, nm) : sum), 0);
  const lo = Math.min(...scaled.map(p => p.lo)), hi = Math.max(...scaled.map(p => p.hi));
  if (source.continuum) {
    const dispersed = quadraticPhasePulse(density, lo, hi, gdd);
    const bandLo = Number(pulse?.spectrumLoNm), bandHi = Number(pulse?.spectrumHiNm), input = Number(pulse?.pulseWidthFs);
    if (!dispersed || !(bandHi > bandLo) || !(input > 0)) return declinedDuration(DISPERSION_UNAVAILABLE.unresolved, { totalGddFs2: gdd });
    const share = Math.min(1, (1 / lo - 1 / hi) / (1 / bandLo - 1 / bandHi));
    return {
      durationFs: Math.hypot(input * share, dispersed.durationFs), available: true,
      transformLimitFs: dispersed.transformLimitFs, inputGddFs2: null, totalGddFs2: gdd,
      model: 'Filtered continuum · assumed-sweep estimate, source part uncompensated',
    };
  }
  const totalGdd = source.gddFs2 + gdd;
  const result = quadraticPhasePulse(density, lo, hi, totalGdd);
  if (!result) return declinedDuration(DISPERSION_UNAVAILABLE.unresolved, { totalGddFs2: totalGdd });
  const state = source.gddFs2 === 0 ? 'no source chirp'
    : `${source.gddFs2 < 0 ? 'negative' : 'positive'} source chirp ${Math.abs(source.gddFs2).toLocaleString('en-US', { maximumFractionDigits: 0 })} fs²`;
  return {
    durationFs: result.durationFs, available: true, transformLimitFs: result.transformLimitFs,
    inputGddFs2: source.gddFs2, totalGddFs2: totalGdd,
    model: `Filtered spectrum · effective quadratic phase · ${state}`,
  };
}

// Intensity-autocorrelation deconvolution factors: the measured trace is
// wider than the pulse by a shape-dependent constant, and dividing by the
// wrong one is the classic way to misreport a duration.
export const AUTOCORRELATION_FACTORS = { gauss: Math.SQRT2, sech2: 1.543 };

// The same instrument reading for a pulse whose envelope was computed rather
// than assumed: the trace is the envelope's measured intensity autocorrelation
// (envelopeAutocorrelation in pulse-field.js), and the duration is still what a
// real autocorrelator reports -- that trace's FWHM divided by the factor of the
// shape the user assumes. The envelope's own FWHM is known here, so the error
// that assumption makes can be shown too.
export function sampledAutocorrelationReading(autocorrelation, envelopeFwhmFs, assumed = 'gauss') {
  const traceFwhmFs = Number(autocorrelation?.fwhmFs);
  if (!(traceFwhmFs > 0)) return null;
  const assumedFactor = AUTOCORRELATION_FACTORS[assumed] ?? Math.SQRT2;
  const inferredPulseWidthFs = traceFwhmFs / assumedFactor;
  const truePulseWidthFs = Number(envelopeFwhmFs);
  return {
    traceFwhmFs, assumedFactor, inferredPulseWidthFs,
    truePulseWidthFs: truePulseWidthFs > 0 ? truePulseWidthFs : null,
    errorRatio: truePulseWidthFs > 0 ? inferredPulseWidthFs / truePulseWidthFs : null,
    trueFactor: truePulseWidthFs > 0 ? traceFwhmFs / truePulseWidthFs : null,
  };
}

// Where a sech^2 profile falls to half its peak, in units of its own FWHM:
// 2*arccosh(sqrt 2) = 1.762747174039086. Used to draw correlation curves; the
// 1.543 deconvolution factor above stays at its published rounding because
// that is the number a real instrument's manual quotes.
const SECH2_HALF = 2 * Math.acosh(Math.SQRT2);

// What an autocorrelator actually sees, and what it would report. `assumed`
// is the shape the instrument is set to; `actual` is the shape the pulse
// really has, so a mismatch can be shown rather than silently absorbed.
export function autocorrelationReading(pulseWidthFs, assumed = 'gauss', actual = 'gauss') {
  const width = Number(pulseWidthFs);
  if (!(width > 0)) return null;
  const actualFactor = AUTOCORRELATION_FACTORS[actual] ?? Math.SQRT2;
  const assumedFactor = AUTOCORRELATION_FACTORS[assumed] ?? Math.SQRT2;
  const traceFwhmFs = width * actualFactor;
  return {
    traceFwhmFs,
    inferredPulseWidthFs: traceFwhmFs / assumedFactor,
    truePulseWidthFs: width,
    assumedFactor,
    actualFactor,
    shapeMismatch: assumed !== actual,
  };
}

// The normalized shape of a correlation trace at a given delay from its peak.
// Shared by the reading and the screen so the overlap figure and the drawn
// curve can never disagree about what the trace actually looks like.
export function correlationShapeValue(delayFs, traceFwhmFs, shape = 'gauss') {
  const width = Number(traceFwhmFs), tau = Number(delayFs);
  if (!(width > 0) || !Number.isFinite(tau)) return 0;
  // sech^2 reaches half maximum at 2*arccosh(sqrt 2) in its own argument, so
  // the argument is SECH2_HALF*tau/FWHM -- not twice that, which would put the
  // half-maximum at a quarter width. The constant is solved rather than typed
  // as its usual 1.7627 rounding, so the curve meets the half-maximum chord
  // exactly instead of 17 ppm away from it.
  if (shape === 'sech2') return (1 / Math.cosh(SECH2_HALF * tau / width)) ** 2;
  return Math.exp(-4 * Math.LN2 * (tau / width) ** 2);
}

// Selecting the two arms for a cross-correlation. `trains` is keyed on source
// id, so two sources always give two entries even when the aggregate `mixed`
// flag stays false because their timing settings happen to agree. Arrival is
// emission phase plus propagation delay: both are real contributions to when a
// pulse turns up, and only their difference matters here.
export function crossCorrelationPair(reading) {
  const trains = Array.isArray(reading?.pulse?.trains) ? reading.pulse.trains : [];
  if (!reading?.pulse) return { reason: 'NO PULSE' };
  if (trains.length < 2) return { reason: 'ONLY ONE BEAM PRESENT' };
  if (trains.length > 2) return { reason: `${trains.length} TRAINS — NEEDS EXACTLY 2` };
  // A declined duration cannot be correlated: substituting the configured
  // width would draw a trace the arriving pulses do not make.
  if (trains.some(train => train.pulseShape === 'sampled' || train.fieldIssue)) return { reason: 'SAMPLED-ENVELOPE CORRELATION NOT MODELED' };
  if (trains.some(train => !Number.isFinite(train.stretchedPulseWidthFs) && train.dispersionModel)) {
    return { reason: 'DURATION UNAVAILABLE' };
  }
  const arm = train => ({
    pulseWidthFs: Number.isFinite(train.stretchedPulseWidthFs)
      ? train.stretchedPulseWidthFs : train.pulseWidthFs,
    pulseShape: train.pulseShape || 'gauss',
    repRateMHz: train.repRateMHz,
    centerWavelengthNm: train.centerWavelengthNm,
    arrivalFs: ((Number(train.phaseNs) || 0) + (Number(train.pathDelayNs) || 0)) * 1e6,
  });
  return { arms: [arm(trains[0]), arm(trains[1])] };
}

// The scope's horizontal window. Fixed by the user rather than sized from the
// measurement: an oscilloscope's timebase is a knob you turn, and a window that
// silently rescaled itself would hide the very motion the display exists to
// show -- two pulses walking toward each other keep the same apparent speed
// only if the axis holds still.
export const CROSS_SCOPE_SPANS_PS = [0.5, 1, 5, 10, 25];
export const DEFAULT_SCOPE_SPAN_PS = 0.5;

export function crossScopeHalfSpanFs(params) {
  const chosen = Number(params?.timeSpanPs);
  if (CROSS_SCOPE_SPANS_PS.includes(chosen)) return chosen * 1000;
  // Scenes saved against the earlier auto-ranging build carried a full-width
  // scan range instead; half of it is the same window.
  const legacy = Number(params?.scanRangePs);
  if (legacy > 0) {
    const half = legacy / 2;
    return CROSS_SCOPE_SPANS_PS.reduce((best, ps) => (Math.abs(ps - half) < Math.abs(best - half) ? ps : best),
      CROSS_SCOPE_SPANS_PS[0]) * 1000;
  }
  return DEFAULT_SCOPE_SPAN_PS * 1000;
}

// Auto time span for an autocorrelation: the narrowest standard span whose
// half-width is at least 1.5 trace FWHMs. A Gaussian trace has fallen to
// 0.2 % of its peak there, so its wings reach the baseline on screen instead
// of being clipped at the edge, while the trace still fills a readable share
// of the window. The standard steps keep it from drifting with the pulse: it
// only moves when the trace crosses one of them. Beyond the widest span it
// returns that span and the screen says the trace does not fit.
export const AUTO_SCOPE_SPAN = 'auto';
export function autoScopeHalfSpanFs(traceFwhmFs) {
  const needed = 1.5 * Math.max(0, Number(traceFwhmFs) || 0);
  return (CROSS_SCOPE_SPANS_PS.find(ps => ps * 1000 >= needed) ?? CROSS_SCOPE_SPANS_PS.at(-1)) * 1000;
}

// The timebase that shows a given pair best: the narrowest setting that still
// holds both pulses with air around them. Picked once, when the mode is
// switched -- not continuously, because a window that re-ranged itself while
// the pulses moved would hide the very motion the display exists to show.
export function bestScopeSpanPs(traceFwhmFs, separationFs, widestPulseFs = 0) {
  // Peaks sit either side of the origin, so each is half the separation out;
  // a quarter more than that keeps them clear of the edge. The second term
  // stops a merged pair from being crushed into a single pixel.
  const needed = Math.max(
    Math.abs(Number(separationFs) || 0) / 2 * 1.25,
    Math.max(Number(traceFwhmFs) || 0, Number(widestPulseFs) || 0) * 2,
  );
  return CROSS_SCOPE_SPANS_PS.find(ps => ps * 1000 >= needed)
    ?? CROSS_SCOPE_SPANS_PS[CROSS_SCOPE_SPANS_PS.length - 1];
}

// A cross-correlation differs from an autocorrelation in the two ways that
// make it useful. It is not forced to be symmetric, and it is not centred on
// zero: the peak sits at whatever timing mismatch the two arms really have,
// which is exactly why the measurement is what finds time zero.
//
// Width: variance adds exactly under correlation whatever the envelopes, so
// the two widths combine in quadrature. Converting that variance back into a
// FWHM needs the trace's own shape constant, which is only well defined when
// both pulses have the same shape -- and the scaling below is built so that
// two identical pulses reproduce the known autocorrelation factor exactly
// (1.414 for Gaussian, 1.543 for sech2) rather than defaulting to quadrature
// and being 9% wrong for sech2, which is the very error this instrument
// exists to teach. Mixed shapes have no closed form; the geometric mean of
// the two constants is used and the result is flagged as approximate.
//
// `a` and `b` are { pulseWidthFs, pulseShape, arrivalFs, repRateMHz,
// centerWavelengthNm }.
export function crossCorrelationReading(a, b) {
  const t1 = Number(a?.pulseWidthFs), t2 = Number(b?.pulseWidthFs);
  if (!(t1 > 0) || !(t2 > 0)) return null;
  const shapeOf = t => (AUTOCORRELATION_FACTORS[t?.pulseShape] ? t.pulseShape : 'gauss');
  const s1 = shapeOf(a), s2 = shapeOf(b);
  const k1 = AUTOCORRELATION_FACTORS[s1], k2 = AUTOCORRELATION_FACTORS[s2];
  const shapeMismatch = s1 !== s2;
  const k = shapeMismatch ? Math.sqrt(k1 * k2) : k1;
  // The shape correction has to fade out as the durations diverge. Applying
  // k/sqrt(2) flat would break the limit the instrument is most used for: with
  // a reference much shorter than the pulse, the correlation must reproduce
  // the pulse's own envelope, so the trace width must converge on the pulse
  // width -- and a flat sech^2 correction overshoots it by 9%. This weight is
  // 1 for equal durations and falls to 0 as either dominates, so both limits
  // come out exact. Against a numerical sech^2 correlation it is within 2%
  // everywhere between them; Gaussians are unaffected, since k/sqrt(2) is 1.
  const overlapWeight = (2 * t1 * t2) / (t1 * t1 + t2 * t2);
  const traceFwhmFs = Math.hypot(t1, t2) * (1 + (k / Math.SQRT2 - 1) * overlapWeight);

  const rep1 = Number(a?.repRateMHz), rep2 = Number(b?.repRateMHz);
  // Without a common repetition rate the two trains drift against each other
  // and no stable trace exists to average up, however well the arms happen to
  // be matched at one instant.
  const synchronized = rep1 > 0 && rep2 > 0 && Math.abs(rep1 - rep2) <= 1e-9 * Math.max(rep1, rep2);
  const periodFs = synchronized ? 1e9 / rep1 : null;

  const rawOffsetFs = (Number(b?.arrivalFs) || 0) - (Number(a?.arrivalFs) || 0);
  // Pulses repeat, so a mismatch of more than half a period is really a
  // smaller mismatch against the neighbouring pulse of the other train. That
  // is not a modelling convenience: it is why a synchronized system can only
  // ever be nulled modulo its own period.
  const offsetFs = periodFs
    ? rawOffsetFs - periodFs * Math.round(rawOffsetFs / periodFs)
    : rawOffsetFs;

  const l1 = Number(a?.centerWavelengthNm), l2 = Number(b?.centerWavelengthNm);
  const sumFrequencyNm = l1 > 0 && l2 > 0 ? (l1 * l2) / (l1 + l2) : null;

  return {
    traceFwhmFs,
    traceShape: shapeMismatch ? 'gauss' : s1,
    offsetFs,
    rawOffsetFs,
    periodFs,
    synchronized,
    shapeMismatch,
    // 1.0 when the two pulses land together; this is the number you maximize
    // when hunting for time zero on a real bench.
    overlap: synchronized
      ? correlationShapeValue(offsetFs, traceFwhmFs, shapeMismatch ? 'gauss' : s1)
      : 0,
    widths: [t1, t2],
    shapes: [s1, s2],
    sumFrequencyNm,
  };
}
