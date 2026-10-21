// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { CONVERSION_INPUTS, CONVERSION_DEFAULTS, computeConversion } from './conversion-calculator.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';

const NOTES = {
  shg: 'The second harmonic has twice the fundamental frequency. The fundamental may lie outside the input scope when solving from the harmonic.',
  thg: 'The third harmonic has three times the fundamental frequency, generated directly or as SHG followed by SFG of the harmonic with the fundamental.',
  sfg: 'The output frequency is the sum of the input frequencies. SHG is the special case of two equal inputs.',
  dfg: 'The output frequency is the higher input frequency minus the lower. The lower-frequency input is amplified at the same time (parametric amplification).',
  opo: 'The pump frequency splits into signal plus idler. The signal is the higher-frequency output by convention; they swap names at degeneracy.',
  crs: 'CARS at twice the pump frequency minus the Stokes frequency, CSRS at twice the Stokes frequency minus the pump frequency. The Coherent Raman calculator adds the other input modes, the spectral resolution and reference spectra.',
};

mountCalculator({ inputs: CONVERSION_INPUTS, defaults: CONVERSION_DEFAULTS, groups: {
  process: { title: 'Process' }, waves: { title: 'Known wavelengths' },
}, compute: computeConversion,
  rows: r => [
    { group: 'Vacuum wavelengths' }, ...r.waves.map(w => [w.role, w.wavelengthNm, 'nm', 7]),
    { group: 'Frequencies' }, ...r.waves.map(w => [w.role, w.frequencyTHz, 'THz', 7]),
    { group: 'Photon energies' }, ...r.waves.map(w => [w.role, w.photonEv, 'eV', 6]),
    ...(r.process === 'crs' ? [{ group: 'Raman excitation' }, ['Raman shift (pump − Stokes)', r.ramanShiftCm, 'cm⁻¹']] : []),
    ...(r.process === 'opo' ? [{ group: 'Parametric output' }, ['Degeneracy wavelength (twice the pump)', r.degeneracyNm, 'nm'],
      ['Signal share of converted power (λp/λs)', r.signalShare * 100, '%', 4],
      ['Idler share of converted power (λp/λi)', r.idlerShare * 100, '%', 4]] : []),
  ],
  notes: r => [NOTES[r.process],
    ...(r.waves.some(w => w.wavelengthNm > 20000) ? ['A wave lies beyond 20 µm, in the far infrared or terahertz range.'] : []),
    ...(r.degenerate ? ['Degenerate operation: signal and idler share one wavelength.'] : []),
    ...(r.process === 'crs' && r.waves.length < 4 ? ['No CSRS wavelength: the Raman frequency is not below the Stokes frequency.'] : []),
    'Energy conservation only. Phase matching, crystal choice, acceptance bandwidths, power and conversion efficiency are not modelled.'],
});
