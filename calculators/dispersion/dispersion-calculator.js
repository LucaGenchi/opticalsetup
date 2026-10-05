// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { GLASSES, GLASS_OPTIONS, glassWavelengthRange, glassDispersion, glassAbbe } from '../../sketch/js/glass.js';
import { defaultsFor, parseInputs, unavailable } from '../assets/calculator-inputs.js';

export const DISPERSION_INPUTS = [
  { id: 'glass', type: 'select', group: 'material', label: 'Glass', value: 'silica', options: GLASS_OPTIONS,
    help: 'Room-temperature catalogue fit. Coefficients and domains are listed below.' },
  { id: 'wavelengthNm', group: 'material', label: 'Wavelength', unit: 'nm', value: 800, min: 210, max: 3710,
    help: 'Vacuum wavelength at which the results are evaluated. Must be inside this glass’s fit.' },
  { id: 'lengthMm', group: 'material', label: 'Glass thickness', unit: 'mm', value: 1, min: 0, max: 10000,
    help: 'GDD = thickness × GVD. Does not change the material curves.' },
  { id: 'loNm', group: 'plot', label: 'Plot start', unit: 'nm', value: 400, min: 210, max: 3710,
    help: 'Must be inside the selected glass’s fit domain.' },
  { id: 'hiNm', group: 'plot', label: 'Plot end', unit: 'nm', value: 1800, min: 210, max: 3710,
    help: 'Must be greater than the start, with at least 1 nm span.' },
];
export const DISPERSION_DEFAULTS = defaultsFor(DISPERSION_INPUTS);
export function computeDispersion(raw) {
  const { values: v, errors } = parseInputs(DISPERSION_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  const [lo, hi] = glassWavelengthRange(v.glass);
  for (const id of ['wavelengthNm', 'loNm', 'hiNm']) {
    if (v[id] < lo || v[id] > hi) return unavailable(`${GLASSES.get(v.glass).label}: supported fit domain is ${lo}–${hi} nm.`, id);
  }
  if (v.hiNm - v.loNm < 1) return unavailable('Plot end must be at least 1 nm above the start.', 'loNm', 'hiNm');
  const point = glassDispersion(v.glass, v.wavelengthNm);
  if (!point) return unavailable('Dispersion is unavailable at this wavelength.', 'wavelengthNm');
  return { ok: true, ...point, gddFs2: v.lengthMm * point.gvdFs2PerMm,
    abbe: glassAbbe(v.glass), values: v, range: [lo, hi] };
}
export function dispersionScan(result) {
  if (!result?.ok) return [];
  const v = result.values;
  return Array.from({ length: 241 }, (_, i) => {
    const wavelengthNm = i === 240 ? v.hiNm : v.loNm + (v.hiNm - v.loNm) * i / 240;
    return { wavelengthNm, ...glassDispersion(v.glass, wavelengthNm) };
  });
}
