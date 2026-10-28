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
