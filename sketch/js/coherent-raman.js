// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Two-colour coherent Raman excitation: which vibration a pump and a Stokes
// beam address, and how finely. Shared by the specimen's readout and the
// Coherent Raman scattering calculator, so both state the same numbers.

const C_CM_PER_S = 29979245800;

// The Raman shift a pump and a longer-wavelength Stokes beam drive, in cm⁻¹:
// their difference in wavenumber. Null for an equal or reversed pair.
export function ramanShiftCm(pumpNm, stokesNm) {
  if (!(pumpNm > 0) || !(stokesNm > pumpNm)) return null;
  // Subtract wavelengths first to retain precision for small shifts.
  return 1e7 * (stokesNm - pumpNm) / pumpNm / stokesNm;
}

// Spectral resolution of coherent Raman excitation by Gaussian pulses,
// transform-limited or equally chirped (spectral focusing), from the pump
// and Stokes intensity FWHM durations: Mohseni, Polzer and Hellerer, Opt.
// Express 26, 10230 (2018), Eq. (5). Durations in ps, result in cm⁻¹.
export const RESOLUTION_PREFACTOR_PS_CM = 2 * Math.SQRT2 * Math.LN2 / (Math.PI * C_CM_PER_S) * 1e12;

export function crsResolutionCm(pumpPs, stokesPs) {
  if (!(pumpPs > 0) || !(stokesPs > 0)) return null;
  return RESOLUTION_PREFACTOR_PS_CM * Math.hypot(1 / pumpPs, 1 / stokesPs);
}

export const crsResolutionGHz = resolutionCm => resolutionCm * C_CM_PER_S * 1e-9;

// How far two Gaussian pulses are from being equally chirped, which is the
// condition Eq. (5) holds under. Each pulse is its transform limit τ0 (intensity
// FWHM, fs) with a GDD φ (fs²); in time its field goes as exp(−(a + ib) t²) with
// a = (1/a0)/D, b = −2φ/D, a0 = 2 ln2/τ0² and D = 1/a0² + 4φ². Equal chirps
// mean equal b: the pump–Stokes beat then has a constant frequency and only
// the envelopes set the resolution. Returns |b_p − b_S| / (a_p + a_S), zero
// for equal chirps; any mismatch only broadens the excitation.
export function chirpMismatch(pump, stokes) {
  const phase = ({ tau0Fs, gddFs2 }) => {
    const inverse = tau0Fs * tau0Fs / (2 * Math.LN2);
    const d = inverse * inverse + 4 * gddFs2 * gddFs2;
    return { a: inverse / d, b: -2 * gddFs2 / d };
  };
  if (!(pump?.tau0Fs > 0) || !(stokes?.tau0Fs > 0)
    || !Number.isFinite(pump.gddFs2) || !Number.isFinite(stokes.gddFs2)) return null;
  const p = phase(pump), s = phase(stokes);
  return Math.abs(p.b - s.b) / (p.a + s.a);
}

// How far a delay between chirped pulses moves the vibration they address,
// in cm⁻¹: the spectral-focusing scan. With linear chirps each colour arrives
// at its own time, so a pump–Stokes delay pairs different colours; for
// strongly and equally chirped pulses the shift is dt / (2πc GDD), Eq. (6)
// of Mohseni et al. Here it is the exact centre of the excitation spectrum
// for Gaussian pulses of any chirp: the cross-correlation of the two spectra,
// each exp(−Δω² τ0²/(8 ln2)) with the quadratic phase ½ GDD Δω², whose
// centre lies at Δ Im(A₁/K) / (2 Re(A₁A₂/K)) with A₁ = α_p − i GDD_p/2,
// A₂ = α_S + i GDD_S/2, K = A₁ + A₂, α = τ0²/(8 ln2) and Δ the pump's lead
// over the Stokes. Transform-limited pulses give zero: all their colours
// arrive together. `delayFs` is the Stokes arrival after the pump's.
export function spectralFocusingShiftCm(pump, stokes, delayFs) {
  if (!(pump?.tau0Fs > 0) || !(stokes?.tau0Fs > 0) || !Number.isFinite(delayFs)
    || !Number.isFinite(pump.gddFs2) || !Number.isFinite(stokes.gddFs2)) return null;
  const alpha = tau0 => tau0 * tau0 / (8 * Math.LN2);
  const a1 = { re: alpha(pump.tau0Fs), im: -pump.gddFs2 / 2 };
  const a2 = { re: alpha(stokes.tau0Fs), im: stokes.gddFs2 / 2 };
  const k = { re: a1.re + a2.re, im: a1.im + a2.im };
  const kk = k.re * k.re + k.im * k.im;
  // A₁/K and A₁A₂/K, written out.
  const ratioIm = (a1.im * k.re - a1.re * k.im) / kk;
  const prod = { re: a1.re * a2.re - a1.im * a2.im, im: a1.re * a2.im + a1.im * a2.re };
  const prodRe = (prod.re * k.re + prod.im * k.im) / kk;
  const radPerFs = -delayFs * ratioIm / (2 * prodRe);
  return radPerFs / (2 * Math.PI * C_CM_PER_S * 1e-15);
}
