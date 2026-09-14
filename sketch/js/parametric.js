// Optical parametric oscillation for the crystal's `convert: 'opo'` mode: a
// phenomenological singly resonant oscillator, not a cavity simulation.
//
// Energy. A pump photon splits into a signal and an idler photon,
// 1/λp = 1/λs + 1/λi. The cavity holds the signal at its authored wavelength;
// the idler takes up whatever the arriving pump dictates.
//
// Power. Signal and idler are generated with equal photon fluxes
// (Manley–Rowe), so the generated powers divide as P_s/P_i = λi/λs. This is
// the lossless generated split: what leaves a real resonator also depends on
// its output coupling and losses.
//
// Threshold. The pump power reaching a crystal is summed over every arrival
// before the crystal is evaluated (see raytrace.js), so the answer does not
// depend on how many rays sample the beam. Pump depletion then follows the
// plane-wave singly resonant solution, sin²x with x/sin x = √N, from N = 1 up
// to complete depletion at N = (π/2)². Beyond that the plane-wave solution
// back-converts; the model holds the depletion instead, an empirical plateau
// scaled by the user's measured maximum efficiency.
//
// Linewidths are FWHM in wavenumber, where energy conservation is linear.
// Unless both are authored, the idler is the pump and signal combined as
// uncorrelated Gaussians (widths in quadrature); correlated fluctuations
// would change that. A narrow line is a Gaussian in wavelength; a broad one
// is sampled from its Gaussian in wavenumber, with the 1/λ² Jacobian.
//
// Pulses keep the pump's train timing. Their duration is the pump's times an
// authored factor, never shorter than their bandwidth allows, and their
// spectral phase is unknown unless declared transform-limited.

import { gaussianSpectrum, spectrumStats } from './spectrum.js';

const NM_CM = 1e7; // λ[nm] · σ[cm⁻¹]
const C_CM_PER_FS = 2.99792458e-5;
const TBP_K = { gauss: 0.441, sech2: 0.315 };
const SIGMA_PER_FWHM = 1 / (2 * Math.sqrt(2 * Math.LN2));
const PLANE_WAVE_FULL_DEPLETION = (Math.PI / 2) ** 2;
// Up to this fractional width a Gaussian in wavelength is indistinguishable
// from the Gaussian in wavenumber it stands for.
const NARROW = 0.01;
const SPECTRUM_GRID = 129;
const SUPPORT_SIGMAS = 3;

export const nmToWavenumberWidth = (wl, fwhmNm) => (wl > 0 && fwhmNm > 0 ? NM_CM * fwhmNm / (wl * wl) : 0);
export const wavenumberToNmWidth = (wl, widthCm) => (wl > 0 && widthCm > 0 ? wl * wl * widthCm / NM_CM : 0);

// Transform-limited FWHM duration of a spectrum `widthCm` wide.
export const transformLimitFs = (widthCm, shape = 'gauss') =>
  (widthCm > 0 ? (TBP_K[shape] ?? TBP_K.gauss) / (C_CM_PER_FS * widthCm) : 0);

// Idler wavelength from energy conservation, or null when the signal leaves
// no positive idler frequency (signal at or beyond the pump frequency).
export function idlerWavelength(pumpWl, signalWl) {
  if (!(pumpWl > 0) || !(signalWl > 0)) return null;
  const inv = 1 / pumpWl - 1 / signalWl;
  return inv > 1e-9 ? 1 / inv : null;
}

// Fraction of the pump depleted at N = P_pump / P_threshold, before the
// user's efficiency ceiling. N ≤ 1 does not oscillate.
export function pumpDepletion(N) {
  if (!(N > 1)) return 0;
  if (N >= PLANE_WAVE_FULL_DEPLETION) return 1;
  // x/sin x rises monotonically from 1 at x→0 to π/2 at x = π/2.
  const target = Math.sqrt(N);
  let lo = 0, hi = Math.PI / 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (mid / Math.sin(mid) < target) lo = mid; else hi = mid;
  }
  const s = Math.sin((lo + hi) / 2);
  return s * s;
}

// Spectral FWHM of the arriving pump, in nm. A filtered or structured
// spectrum is reduced to its FWHM here: the model is Gaussian throughout.
export function pumpWidthNm(ray) {
  const stats = ray?.spec ? spectrumStats(ray.spec) : null;
  if (stats && stats.fwhm > 0) return stats.fwhm;
  return Math.max(0, Number(ray?.bw) || 0);
}

// Wavelength density of a Gaussian in wavenumber, area-normalised in λ.
function wavenumberDensity(wl, widthCm) {
  const center = NM_CM / wl, sd = widthCm * SIGMA_PER_FWHM;
  const norm = 1 / (sd * Math.sqrt(2 * Math.PI));
  return lambda => {
    const z = (NM_CM / lambda - center) / sd;
    return norm * Math.exp(-0.5 * z * z) * NM_CM / (lambda * lambda);
  };
}

function wavenumberSupport(wl, widthCm) {
  const center = NM_CM / wl, reach = SUPPORT_SIGMAS * widthCm * SIGMA_PER_FWHM;
  return [NM_CM / (center + reach), NM_CM / Math.max(center * 0.05, center - reach)];
}

// A spectrum made of weighted Gaussians in wavenumber, sampled onto a
// wavelength grid and normalised to a peak of 1.
function sampledMixture(components) {
  const live = components.filter(c => c.weight > 0 && c.widthCm > 0);
  if (!live.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (const c of live) {
    const [a, b] = wavenumberSupport(c.wl, c.widthCm);
    lo = Math.min(lo, a);
    hi = Math.max(hi, b);
  }
  const densities = live.map(c => ({ weight: c.weight, at: wavenumberDensity(c.wl, c.widthCm) }));
  const w = [];
  for (let i = 0; i < SPECTRUM_GRID; i++) {
    const lambda = lo + (hi - lo) * i / (SPECTRUM_GRID - 1);
    w.push(densities.reduce((sum, d) => sum + d.weight * d.at(lambda), 0));
  }
  const peak = Math.max(...w);
  return peak > 0 ? { kind: 'sampled', lo, hi, w: w.map(v => v / peak) } : null;
}

// One output wave: wavelength, FWHM in nm, spectrum, and width in cm⁻¹.
// A zero width is an exact line.
export function waveSpectrum(wl, widthCm) {
  if (!(widthCm > 0)) return { wl, bw: 0, spec: null, widthCm: 0 };
  if (widthCm * wl / NM_CM <= NARROW) {
    const bw = wavenumberToNmWidth(wl, widthCm);
    return { wl, bw, spec: gaussianSpectrum(wl, bw), widthCm };
  }
  const spec = sampledMixture([{ wl, widthCm, weight: 1 }]);
  return { wl, bw: spectrumStats(spec)?.fwhm || wavenumberToNmWidth(wl, widthCm), spec, widthCm };
}

// Signal and idler of one pump ray, or null when the settings leave no
// physical idler.
//   linewidthMode 'pump'   – signal as wide as the pump (a heuristic for
//                            synchronous pumping); idler in quadrature
//                 'signal' – authored signal width; idler in quadrature
//                 'both'   – authored signal and idler widths
export function opoWaves({
  pumpWl, pumpFwhmNm = 0, signalWl, linewidthMode = 'pump', signalLinewidthCm = 0, idlerLinewidthCm = 0,
}) {
  const idler = idlerWavelength(pumpWl, signalWl);
  if (idler === null) return null;
  const pumpCm = nmToWavenumberWidth(pumpWl, pumpFwhmNm);
  const authored = v => Math.max(0, Number(v) || 0);
  const signalCm = linewidthMode === 'signal' || linewidthMode === 'both' ? authored(signalLinewidthCm) : pumpCm;
  const idlerCm = linewidthMode === 'both' ? authored(idlerLinewidthCm) : Math.hypot(pumpCm, signalCm);
  const signalShare = idler / (signalWl + idler);
  const degenerate = Math.abs(idler - signalWl) <= 1e-9 * Math.max(idler, signalWl);
  const result = {
    pumpCm, degenerate, signalShare,
    signal: waveSpectrum(signalWl, signalCm),
    idler: waveSpectrum(idler, idlerCm),
  };
  if (degenerate) {
    // Signal and idler share one mode but not one width: the merged beam
    // carries both distributions, weighted by their generated powers.
    const spec = signalCm === idlerCm
      ? result.signal.spec
      : sampledMixture([
        { wl: signalWl, widthCm: signalCm, weight: signalShare },
        { wl: signalWl, widthCm: idlerCm, weight: 1 - signalShare },
      ]);
    const bw = spec ? spectrumStats(spec)?.fwhm || 0 : 0;
    result.merged = { wl: signalWl, bw, spec: bw > 0 ? spec : null, widthCm: nmToWavenumberWidth(signalWl, bw) };
  }
  return result;
}

// Pulse metadata for a generated wave. It keeps the pump train's timing and
// gates but is a train of its own, so detectors and correlators can tell
// pump, signal and idler apart while still knowing they are synchronised.
export function opoPulse(pumpPulse, wave, { crystalId, role, outputPhase = 'unknown', durationFactor = 1 }) {
  if (!pumpPulse) return null;
  const shape = pumpPulse.pulseShape || 'gauss';
  const limit = transformLimitFs(wave.widthCm, shape);
  const transformLimited = outputPhase === 'transformLimited' && limit > 0;
  const factor = Number(durationFactor) > 0 ? Number(durationFactor) : 1;
  const requested = pumpPulse.pulseWidthFs * factor;
  // Rounding alone must not count as asking for less than the limit.
  const belowLimit = requested < limit * (1 - 1e-9);
  const pulseWidthFs = transformLimited ? limit : belowLimit ? limit : requested;
  const trainId = pumpPulse.sourceId || '';
  return {
    ...pumpPulse,
    gates: Array.isArray(pumpPulse.gates) ? pumpPulse.gates.map(g => ({ ...g })) : pumpPulse.gates,
    sourceId: `${trainId}›${crystalId || 'opo'}:${role}`,
    syncSourceId: pumpPulse.syncSourceId || trainId,
    centerWavelengthNm: wave.wl,
    bandwidthNm: wave.bw,
    pulseWidthFs,
    transformLimited,
    spectralPhase: transformLimited ? 'transformLimited' : 'unknown',
    durationRaisedToLimit: !transformLimited && belowLimit,
  };
}
