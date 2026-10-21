// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { ramanStokesWl, carsAntiStokesWl } from '../../sketch/js/elements.js';
import { defaultsFor, parseInputs, unavailable } from '../assets/calculator-inputs.js';

const C_CM_PER_S = 29979245800;
const SCOPE_NM = [100, 20000], MAX_SHIFT_CM = 10000;

export const CRS_INPUTS = [
  { id: 'mode', group: 'excitation', label: 'Known quantities', type: 'select', value: 'pump-stokes',
    options: [['pump-stokes', 'Pump and Stokes wavelengths'], ['pump-shift', 'Pump wavelength and Raman shift'], ['stokes-shift', 'Stokes wavelength and Raman shift']],
    help: 'The third quantity is solved from the other two.' },
  { id: 'pumpNm', group: 'excitation', label: 'Pump wavelength', unit: 'nm', value: 800, min: SCOPE_NM[0], max: SCOPE_NM[1],
    when: 'mode', whenValue: ['pump-stokes', 'pump-shift'], help: 'Vacuum wavelength of the pump, the higher-frequency excitation beam.' },
  { id: 'stokesNm', group: 'excitation', label: 'Stokes wavelength', unit: 'nm', value: 1040, min: SCOPE_NM[0], max: SCOPE_NM[1],
    when: 'mode', whenValue: ['pump-stokes', 'stokes-shift'], help: 'Vacuum wavelength of the Stokes beam; longer than the pump.' },
  { id: 'ramanShiftCm', group: 'excitation', label: 'Raman shift', unit: 'cm⁻¹', value: 2850, min: 0, max: MAX_SHIFT_CM,
    when: 'mode', whenValue: ['pump-shift', 'stokes-shift'], help: 'Vibrational wavenumber to address; must be positive.' },
];
export const CRS_DEFAULTS = defaultsFor(CRS_INPUTS);

const outOfScope = nm => !(nm >= SCOPE_NM[0] && nm <= SCOPE_NM[1]);

export function computeCrs(raw) {
  const { values: v, errors } = parseInputs(CRS_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  let pumpNm = v.pumpNm, stokesNm = v.stokesNm, ramanShiftCm = v.ramanShiftCm;
  if (v.mode === 'pump-stokes') {
    if (!(stokesNm > pumpNm)) return unavailable('Stokes wavelength must be longer than the pump wavelength.', 'stokesNm', 'pumpNm');
    // Subtract wavelengths first to retain precision for small shifts.
    ramanShiftCm = 1e7 * (stokesNm - pumpNm) / pumpNm / stokesNm;
    if (ramanShiftCm > MAX_SHIFT_CM) return unavailable(`The Raman shift exceeds this calculator’s ${MAX_SHIFT_CM} cm⁻¹ scope.`, 'stokesNm', 'pumpNm');
  } else {
    if (!(ramanShiftCm > 0)) return unavailable('Raman shift must be positive.', 'ramanShiftCm');
    if (v.mode === 'pump-shift') {
      if (!(1e7 / pumpNm - ramanShiftCm > 0)) return unavailable('This shift leaves no positive Stokes frequency. Reduce the shift or shorten the pump wavelength.', 'ramanShiftCm', 'pumpNm');
      stokesNm = ramanStokesWl(pumpNm, ramanShiftCm);
      if (stokesNm === null || outOfScope(stokesNm)) return unavailable(`The inferred Stokes wavelength is outside the ${SCOPE_NM[0]}–${SCOPE_NM[1]} nm scope.`, 'ramanShiftCm', 'pumpNm');
    } else {
      pumpNm = 1e7 / (1e7 / stokesNm + ramanShiftCm);
      if (outOfScope(pumpNm)) return unavailable(`The inferred pump wavelength is outside the ${SCOPE_NM[0]}–${SCOPE_NM[1]} nm scope.`, 'ramanShiftCm', 'stokesNm');
    }
  }
  // Two-color CRS: the pump scatters off the coherence into CARS at
  // 2ν_p − ν_S, the Stokes beam into CSRS at 2ν_S − ν_p, which exists only
  // while the Raman frequency is below the Stokes frequency.
  const antiStokesNm = carsAntiStokesWl(pumpNm, stokesNm);
  const csrsInverse = 2e7 / stokesNm - 1e7 / pumpNm;
  const csrsNm = csrsInverse > 0 ? 1e7 / csrsInverse : null;
  return { ok: true, mode: v.mode, pumpNm, stokesNm,
    ramanShiftCm, ramanTHz: ramanShiftCm * C_CM_PER_S * 1e-12, antiStokesNm, csrsNm };
}

// Spectral resolution of coherent Raman excitation by Gaussian pulses,
// transform-limited or equally chirped (spectral focusing), from the pump
// and Stokes intensity FWHM durations: Mohseni, Polzer and Hellerer, Opt.
// Express 26, 10230 (2018), Eq. (5).
export const RESOLUTION_INPUTS = [
  { id: 'pumpPs', group: 'durations', label: 'Pump duration', symbol: 'τ<sub>p</sub>', unit: 'ps', value: 2, min: 0.005, max: 10000,
    help: 'Intensity FWHM. For spectral focusing, the chirped duration at the sample.' },
  { id: 'stokesPs', group: 'durations', label: 'Stokes duration', symbol: 'τ<sub>S</sub>', unit: 'ps', value: 2, min: 0.005, max: 10000,
    help: 'Intensity FWHM. Spectral focusing needs the same chirp on both beams.' },
];
export const RESOLUTION_DEFAULTS = defaultsFor(RESOLUTION_INPUTS);
export const RESOLUTION_PREFACTOR_PS_CM = 2 * Math.SQRT2 * Math.LN2 / (Math.PI * C_CM_PER_S) * 1e12;

export function computeResolution(raw) {
  const { values: v, errors } = parseInputs(RESOLUTION_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  const resolutionCm = RESOLUTION_PREFACTOR_PS_CM * Math.hypot(1 / v.pumpPs, 1 / v.stokesPs);
  return { ok: true, ...v, resolutionCm, resolutionGHz: resolutionCm * C_CM_PER_S * 1e-9 };
}
