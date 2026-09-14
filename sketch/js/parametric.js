// Optical parametric oscillation for the crystal's `convert: 'opo'` mode.
//
// A pump photon splits into a signal and an idler photon,
// 1/λp = 1/λs + 1/λi, with equal photon fluxes in the two outputs
// (Manley–Rowe), so their powers divide as P_s/P_i = λi/λs. The model is a
// singly resonant oscillator: the cavity holds the signal at the authored
// wavelength and the idler takes up whatever the arriving pump dictates.
//
// Spectral widths are handled in wavenumber, where they combine simply. The
// resonant signal either follows the pump's width (a synchronously pumped
// fs/ps OPO, whose output pulses are about as long as the pump's) or is set
// by the cavity (a ns or CW OPO). The non-resonant idler is the difference
// frequency of pump and signal, so its spectrum is their convolution; for
// Gaussians the widths add in quadrature.
//
// Oscillation needs a pump above threshold. Above it, the pump depletion of a
// plane-wave singly resonant OPO follows sin²x with x/sin x = √N, where N is
// the pump power in units of threshold: zero at N = 1, complete at
// N = (π/2)². Beyond that point the plane-wave solution back-converts, which
// Gaussian beams and pulses average out, so the depletion is held there.
//
// Not modelled: phase matching from crystal data (the signal is authored),
// cavity length and synchronisation, group-velocity walk-off, build-up time,
// spatial overlap, and spectral phase.

import { gaussianSpectrum, spectrumStats } from './spectrum.js';

// nm·cm⁻¹: Δλ[nm] = λ[nm]² · Δσ[cm⁻¹] / 1e7
const NM_CM = 1e7;
const PLANE_WAVE_FULL_DEPLETION = (Math.PI / 2) ** 2;

export const nmToWavenumberWidth = (wl, fwhmNm) => (wl > 0 && fwhmNm > 0 ? NM_CM * fwhmNm / (wl * wl) : 0);
export const wavenumberToNmWidth = (wl, widthCm) => (wl > 0 && widthCm > 0 ? wl * wl * widthCm / NM_CM : 0);

// Idler wavelength from energy conservation, or null when the signal leaves
// no positive idler frequency (signal at or beyond the pump frequency).
export function idlerWavelength(pumpWl, signalWl) {
  if (!(pumpWl > 0) || !(signalWl > 0)) return null;
  const inv = 1 / pumpWl - 1 / signalWl;
  return inv > 1e-9 ? 1 / inv : null;
}

// Fraction of the pump converted at N = P_pump / P_threshold, before the
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

// Spectral FWHM of the arriving pump, in nm.
export function pumpWidthNm(ray) {
  const stats = ray?.spec ? spectrumStats(ray.spec) : null;
  if (stats && stats.fwhm > 0) return stats.fwhm;
  return Math.max(0, Number(ray?.bw) || 0);
}

// One output wave: wavelength, FWHM in nm, and the spectrum object the ray
// carries. A zero width is an exact line.
function wave(wl, widthCm) {
  const bw = wavenumberToNmWidth(wl, widthCm);
  return { wl, bw, spec: bw > 0 ? gaussianSpectrum(wl, bw) : null, widthCm };
}

// Signal and idler of one pump ray. `linewidthMode` 'sync' gives the signal
// the pump's wavenumber width; 'fixed' uses `signalLinewidthCm`. Returns null
// when the settings leave no physical idler.
export function opoWaves({ pumpWl, pumpFwhmNm = 0, signalWl, linewidthMode = 'sync', signalLinewidthCm = 0 }) {
  const idler = idlerWavelength(pumpWl, signalWl);
  if (idler === null) return null;
  const pumpCm = nmToWavenumberWidth(pumpWl, pumpFwhmNm);
  const signalCm = linewidthMode === 'fixed' ? Math.max(0, Number(signalLinewidthCm) || 0) : pumpCm;
  const idlerCm = Math.hypot(pumpCm, signalCm);
  const degenerate = Math.abs(idler - signalWl) <= 1e-9 * Math.max(idler, signalWl);
  return {
    pumpCm,
    degenerate,
    // P_s/P_i = λi/λs: the signal's share of the converted power.
    signalShare: idler / (signalWl + idler),
    signal: wave(signalWl, degenerate ? idlerCm : signalCm),
    idler: wave(idler, idlerCm),
  };
}

// Pulse metadata for a generated wave. The train (source, repetition rate,
// phase, gates) is the pump's: a synchronously pumped OPO is locked to it.
// The duration is copied from the pump. The pulse is transform-limited only
// when it is as narrow in frequency as a transform-limited pump.
export function opoPulse(pumpPulse, wl, { transformLimited }) {
  if (!pumpPulse) return null;
  return {
    ...pumpPulse,
    gates: Array.isArray(pumpPulse.gates) ? pumpPulse.gates.map(g => ({ ...g })) : pumpPulse.gates,
    centerWavelengthNm: wl,
    transformLimited: Boolean(transformLimited && pumpPulse.transformLimited === true),
  };
}
