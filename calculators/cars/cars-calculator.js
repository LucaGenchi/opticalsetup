// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { ramanStokesWl, carsAntiStokesWl } from '../../sketch/js/elements.js';
import { defaultsFor, parseInputs, unavailable } from '../assets/calculator-inputs.js';

export const CARS_INPUTS = [
  { id: 'mode', group: 'excitation', label: 'Input mode', type: 'select', value: 'wavelengths',
    options: [['wavelengths', 'Pump and Stokes wavelengths'], ['shift', 'Pump and Raman shift']],
    help: 'Solve for the shift or for the Stokes wavelength.' },
  { id: 'pumpNm', group: 'excitation', label: 'Pump wavelength', unit: 'nm', value: 800, min: 100, max: 20000,
    help: 'Vacuum wavelength of the pump; shorter than the Stokes wavelength.' },
  { id: 'stokesNm', group: 'excitation', label: 'Stokes wavelength', unit: 'nm', value: 1000, min: 100, max: 20000,
    when: 'mode', whenValue: 'wavelengths', help: 'Must be longer than the pump to excite a positive Raman shift.' },
  { id: 'ramanShiftCm', group: 'excitation', label: 'Raman shift', unit: 'cm⁻¹', value: 2500, min: 0, max: 10000,
    when: 'mode', whenValue: 'shift', help: 'Positive vibrational wavenumber; must be below the pump’s optical wavenumber.' },
  { id: 'separateProbe', group: 'probe', label: 'Use a distinct probe', type: 'checkbox', value: false,
    help: 'Unticked: the pump also probes the vibrational coherence (two-color CARS).' },
  { id: 'probeNm', group: 'probe', label: 'Probe wavelength', unit: 'nm', value: 700, min: 100, max: 20000,
    when: 'separateProbe', help: 'A distinct third wave. Anti-Stokes frequency = probe frequency + Raman frequency.' },
];
export const CARS_DEFAULTS = defaultsFor(CARS_INPUTS);
export function computeCars(raw) {
  const { values: v, errors } = parseInputs(CARS_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  let stokesNm, ramanShiftCm;
  if (v.mode === 'shift') {
    ramanShiftCm = v.ramanShiftCm;
    if (!(ramanShiftCm > 0)) return unavailable('Raman shift must be positive.', 'ramanShiftCm');
    const stokesWavenumberCm = 1e7 / v.pumpNm - ramanShiftCm;
    if (!(stokesWavenumberCm > 0)) return unavailable('This shift leaves no positive Stokes frequency. Reduce the shift or shorten the pump wavelength.', 'ramanShiftCm', 'pumpNm');
    stokesNm = ramanStokesWl(v.pumpNm, ramanShiftCm);
    if (stokesNm === null || stokesNm > 20000) return unavailable('The inferred Stokes wavelength exceeds the 20000 nm input scope.', 'ramanShiftCm', 'pumpNm');
  } else {
    stokesNm = v.stokesNm;
    if (!(stokesNm > v.pumpNm)) return unavailable('Stokes wavelength must be longer than the pump wavelength.', 'stokesNm', 'pumpNm');
    // Subtract wavelengths first to retain precision for small shifts.
    ramanShiftCm = 1e7 * (stokesNm - v.pumpNm) / v.pumpNm / stokesNm;
    if (ramanShiftCm > 10000) return unavailable('The Raman shift exceeds this calculator’s 10000 cm⁻¹ scope.', 'stokesNm', 'pumpNm');
  }
  const probeNm = v.separateProbe ? v.probeNm : v.pumpNm;
  const antiStokesNm = v.separateProbe
    ? 1e7 / (1e7 / probeNm + ramanShiftCm) : carsAntiStokesWl(v.pumpNm, stokesNm);
  return { ok: true, pumpNm: v.pumpNm, stokesNm, probeNm, ramanShiftCm, antiStokesNm,
    ramanTHz: ramanShiftCm * 0.0299792458 };
}
