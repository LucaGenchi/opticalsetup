// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { sumFrequencyWl } from '../../sketch/js/elements.js';
import { defaultsFor, parseInputs } from '../assets/calculator-inputs.js';

export const SHG_INPUTS = [
  { id: 'mode', group: 'waves', label: 'Known wavelength', type: 'select', value: 'fundamental',
    options: [['fundamental', 'Fundamental → second harmonic'], ['harmonic', 'Second harmonic → fundamental']],
    help: 'Choose which wave you know. Both wavelengths are vacuum values.' },
  { id: 'wavelengthNm', group: 'waves', label: 'Known wavelength', unit: 'nm', value: 1064, min: 100, max: 20000,
    help: 'Enter the wavelength of the wave chosen above.' },
];
export const SHG_DEFAULTS = defaultsFor(SHG_INPUTS);
export function computeShg(raw) {
  const { values: v, errors } = parseInputs(SHG_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  const fundamentalNm = v.wavelengthNm * (v.mode === 'harmonic' ? 2 : 1);
  const harmonicNm = sumFrequencyWl(fundamentalNm, fundamentalNm);
  return { ok: true, fundamentalNm, harmonicNm,
    fundamentalTHz: 299792.458 / fundamentalNm, harmonicTHz: 299792.458 / harmonicNm };
}
