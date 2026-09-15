// Optical parametric oscillation for the crystal's `convert: 'opo'` mode: a
// phenomenological singly resonant oscillator, not a cavity simulation.
//
// Energy. A pump photon splits into a signal and an idler photon,
// 1/λp = 1/λs + 1/λi. The cavity holds the signal at its authored wavelength;
// the idler takes up whatever the arriving pump dictates.
//
// Power. A fixed, authored fraction of the pump is converted. Signal and
// idler are generated with equal photon fluxes (Manley–Rowe), so the
// generated powers divide as P_s/P_i = λi/λs. This is the lossless generated
// split: what leaves a real resonator also depends on its output coupling
// and losses. Threshold and pump depletion are not modelled.
//
// Linewidths are FWHM in wavenumber, where energy conservation is linear.
// Unless both are authored, the idler is the pump and signal combined as
// uncorrelated Gaussians (widths in quadrature); correlated fluctuations
// would change that. A narrow line is a Gaussian in wavelength; a broad one
// is sampled from its Gaussian in wavenumber, with the 1/λ² Jacobian.
//
// Pulses keep the pump's train timing, including its accumulated delay. Their
// duration is the pump's times an authored factor, never shorter than their
// bandwidth allows, and their spectral phase is unknown unless declared
// transform-limited. The output spectra are Gaussian, so their transform
// limit uses the Gaussian time–bandwidth product.

import { gaussianSpectrum, spectrumStats } from './spectrum.js';

const NM_CM = 1e7; // λ[nm] · σ[cm⁻¹]
const C_CM_PER_FS = 2.99792458e-5;
const GAUSS_TBP = 0.441;
const SIGMA_PER_FWHM = 1 / (2 * Math.sqrt(2 * Math.LN2));
// Up to this fractional width a Gaussian in wavelength is indistinguishable
// from the Gaussian in wavenumber it stands for.
const NARROW = 0.01;
const SPECTRUM_GRID = 129;
const SUPPORT_SIGMAS = 3;

export const nmToWavenumberWidth = (wl, fwhmNm) => (wl > 0 && fwhmNm > 0 ? NM_CM * fwhmNm / (wl * wl) : 0);
export const wavenumberToNmWidth = (wl, widthCm) => (wl > 0 && widthCm > 0 ? wl * wl * widthCm / NM_CM : 0);

// Transform-limited FWHM duration of a Gaussian spectrum `widthCm` wide. A
// zero width has no finite limit.
export const transformLimitFs = widthCm => (widthCm > 0 ? GAUSS_TBP / (C_CM_PER_FS * widthCm) : Infinity);

// Idler wavelength from energy conservation, or null when the signal leaves
// no positive idler frequency (signal at or beyond the pump frequency).
export function idlerWavelength(pumpWl, signalWl) {
  if (!(pumpWl > 0) || !(signalWl > 0)) return null;
  const inv = 1 / pumpWl - 1 / signalWl;
  return inv > 1e-9 ? 1 / inv : null;
}

// Spectral FWHM of the arriving pump, in nm. A filtered or structured
// spectrum is reduced to its FWHM here: the model is Gaussian throughout.
export function pumpWidthNm(ray) {
  const stats = ray?.spec ? spectrumStats(ray.spec) : null;
  if (stats && stats.fwhm > 0) return stats.fwhm;
  return Math.max(0, Number(ray?.bw) || 0);
}

// A Gaussian in wavenumber sampled onto a wavelength grid (with the 1/λ²
// Jacobian) and normalised to a peak of 1.
function sampledWavenumberGaussian(wl, widthCm) {
  const center = NM_CM / wl, sd = widthCm * SIGMA_PER_FWHM;
  const reach = SUPPORT_SIGMAS * sd;
  const lo = NM_CM / (center + reach);
  const hi = NM_CM / Math.max(center * 0.05, center - reach);
  const w = [];
  for (let i = 0; i < SPECTRUM_GRID; i++) {
    const lambda = lo + (hi - lo) * i / (SPECTRUM_GRID - 1);
    const z = (NM_CM / lambda - center) / sd;
    w.push(Math.exp(-0.5 * z * z) / (lambda * lambda));
  }
  const peak = Math.max(...w);
  return { kind: 'sampled', lo, hi, w: w.map(v => v / peak) };
}

// One output wave: wavelength, FWHM in nm, spectrum, and width in cm⁻¹.
// A zero width is an exact line.
export function waveSpectrum(wl, widthCm) {
  if (!(widthCm > 0)) return { wl, bw: 0, spec: null, widthCm: 0 };
  if (widthCm * wl / NM_CM <= NARROW) {
    const bw = wavenumberToNmWidth(wl, widthCm);
    return { wl, bw, spec: gaussianSpectrum(wl, bw), widthCm };
  }
  const spec = sampledWavenumberGaussian(wl, widthCm);
  return { wl, bw: spectrumStats(spec)?.fwhm || wavenumberToNmWidth(wl, widthCm), spec, widthCm };
}

// Signal and idler of one pump ray, or null when the settings leave no
// physical idler.
//   linewidthMode 'pump'   – signal as wide as the pump (a heuristic for
//                            synchronous pumping); idler in quadrature
//                 'signal' – authored signal width; idler in quadrature
//                 'both'   – authored signal and idler widths
// `merged` is set only at degeneracy with equal widths, where signal and
// idler are one beam; with different widths they stay two coincident waves.
export function opoWaves({
  pumpWl, pumpFwhmNm = 0, signalWl, linewidthMode = 'pump', signalLinewidthCm = 0, idlerLinewidthCm = 0,
}) {
  const idler = idlerWavelength(pumpWl, signalWl);
  if (idler === null) return null;
  const pumpCm = nmToWavenumberWidth(pumpWl, pumpFwhmNm);
  const authored = v => Math.max(0, Number(v) || 0);
  const signalCm = linewidthMode === 'signal' || linewidthMode === 'both' ? authored(signalLinewidthCm) : pumpCm;
  const idlerCm = linewidthMode === 'both' ? authored(idlerLinewidthCm) : Math.hypot(pumpCm, signalCm);
  const degenerate = Math.abs(idler - signalWl) <= 1e-9 * Math.max(idler, signalWl);
  const signal = waveSpectrum(signalWl, signalCm);
  return {
    pumpCm,
    degenerate,
    signalShare: idler / (signalWl + idler),
    signal,
    idler: waveSpectrum(degenerate ? signalWl : idler, idlerCm),
    merged: degenerate && Math.abs(signalCm - idlerCm) <= 1e-12 * Math.max(1, signalCm) ? signal : null,
  };
}

// Pulse metadata for a generated wave. It keeps the pump train's timing and
// gates but is a train of its own, so detectors can tell pump, signal and
// idler apart while still knowing they are synchronised. Only fields that
// describe the train are carried over; anything describing the pump's own
// spectrum or phase is recomputed for the new light.
export function opoPulse(pumpPulse, wave, { crystalId, role, outputPhase = 'unknown', durationFactor = 1 }) {
  if (!pumpPulse) return null;
  const limit = transformLimitFs(wave.widthCm);
  const factor = Number(durationFactor) > 0 ? Number(durationFactor) : 1;
  const requested = pumpPulse.pulseWidthFs * factor;
  // A zero-width output is an idealised monochromatic pulse train, as a
  // pulsed source with 0 nm bandwidth is: it has a duration but no limit,
  // so it cannot be declared transform-limited.
  const wantsLimit = outputPhase === 'transformLimited';
  const transformLimited = wantsLimit && Number.isFinite(limit);
  // Rounding alone must not count as asking for less than the limit.
  const belowLimit = Number.isFinite(limit) && requested < limit * (1 - 1e-9);
  const trainId = pumpPulse.sourceId || '';
  return {
    sourceId: `${trainId}›${crystalId || 'opo'}:${role}`,
    syncSourceId: pumpPulse.syncSourceId || trainId,
    repRateMHz: pumpPulse.repRateMHz,
    phaseNs: pumpPulse.phaseNs,
    gates: Array.isArray(pumpPulse.gates) ? pumpPulse.gates.map(g => ({ ...g })) : undefined,
    centerWavelengthNm: wave.wl,
    bandwidthNm: wave.bw,
    pulseShape: 'gauss',
    pulseWidthFs: transformLimited ? limit : belowLimit ? limit : requested,
    transformLimited,
    spectralPhase: transformLimited ? 'transformLimited' : 'unknown',
    durationRaisedToLimit: !transformLimited && belowLimit,
    transformLimitUnavailable: wantsLimit && !transformLimited,
  };
}
