// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { CONVERSION_INPUTS, CONVERSION_DEFAULTS, computeConversion, conversionSpectrum } from './conversion-calculator.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';
import { formatNumber } from '../assets/calculator-kit.js';

const NOTES = {
  shg: 'The second harmonic has twice the fundamental frequency. The fundamental may lie outside the input scope when solving from the harmonic.',
  thg: 'The third harmonic has three times the fundamental frequency, generated directly or as SHG followed by SFG of the harmonic with the fundamental.',
  sfg: 'The output frequency is the sum of the input frequencies. SHG is the special case of two equal inputs.',
  dfg: 'The output frequency is the higher input frequency minus the lower. The lower-frequency input is amplified at the same time (parametric amplification).',
  opo: 'The pump frequency splits into signal plus idler. The signal is the higher-frequency output by convention; they swap names at degeneracy.',
  crs: 'CARS at twice the pump frequency minus the Stokes frequency, CSRS at twice the Stokes frequency minus the pump frequency. The Coherent Raman calculator adds the other input modes, the spectral resolution and reference spectra.',
};

const BANDWIDTH_NOTES = {
  harmonic: 'Bandwidths for Gaussian spectra and a crystal that phase-matches the whole spectrum: the harmonic field is a power of the fundamental field, so its frequency FWHM is √2 (SHG) or √3 (THG) times wider, with or without a linear chirp. A narrower acceptance bandwidth narrows the harmonic.',
  fromHarmonic: 'Solving back from the harmonic gives the narrowest fundamental that could produce it; a limited phase-matching acceptance would need a broader one.',
  mixing: 'Bandwidths for Gaussian spectra and a crystal that phase-matches the whole spectrum: the frequency FWHMs add in quadrature. This holds for transform-limited pulses and for independent CW lines; chirped inputs can give a narrower output, and so can a narrower acceptance bandwidth.',
  lines: 'Lines only: the signal and idler bandwidths are set by the cavity and phase matching, not by energy conservation.',
  crsLines: 'Lines only: the CARS and CSRS spectra depend on the Raman resonance and the pulse durations; the Coherent Raman calculator gives the spectral resolution.',
};
const COLORS = ['--series-1', '--series-3'];

mountCalculator({ inputs: CONVERSION_INPUTS, defaults: CONVERSION_DEFAULTS, hideInactive: true, groups: {
  process: { title: 'Process' }, waves: { title: 'Wavelengths' },
}, compute: computeConversion,
  graphs: r => {
    const { x, xMin, xMax, series } = conversionSpectrum(r);
    let given = 0, made = 0;
    return { spectrum: { x, xMin, xMax, xLabel: 'Wavelength (nm)', xUnit: 'nm', yLabel: 'Normalized intensity (a.u.)', yMin: 0, yMax: 1,
      formatX: v => formatNumber(v, 6),
      // Given waves blue then green, generated ones orange, the second dashed.
      series: series.map(s => ({ key: s.role, name: s.role, values: s.values, fill: 'light',
        ...(s.generated ? { color: '--series-2', dash: made++ > 0 } : { color: COLORS[given++ % 2] }) })) } };
  },
  rows: r => ({
    calc: [
      { group: 'Vacuum wavelengths' }, ...r.waves.map(w => [w.role, w.wavelengthNm, 'nm', 7]),
      { group: 'Frequencies' }, ...r.waves.map(w => [w.role, w.frequencyTHz, 'THz', 7]),
      { group: 'Photon energies' }, ...r.waves.map(w => [w.role, w.photonEv, 'eV', 6])],
    details: [
      ...(r.waves.some(w => w.bandwidthTHz > 0) ? [
        { group: 'Bandwidths (FWHM)' }, ...r.waves.map(w => [w.role, w.bandwidthNm, 'nm', 4]),
        { group: 'Frequency bandwidths (FWHM)' }, ...r.waves.map(w => [w.role, w.bandwidthTHz, 'THz', 4])] : []),
      ...(r.process === 'crs' ? [{ group: 'Raman excitation' }, ['Raman shift (pump − Stokes)', r.ramanShiftCm, 'cm⁻¹']] : []),
      ...(r.process === 'opo' ? [{ group: 'Parametric output' }, ['Degeneracy wavelength (twice the pump)', r.degeneracyNm, 'nm'],
        ['Signal share of converted power (λp/λs)', r.signalShare * 100, '%', 4],
        ['Idler share of converted power (λp/λi)', r.idlerShare * 100, '%', 4]] : [])],
  }),
  notes: r => [NOTES[r.process],
    ...(r.bandwidthNote ? [r.bandwidthNote] : r.waves.some(w => w.bandwidthTHz > 0)
      ? [r.process === 'sfg' || r.process === 'dfg' ? BANDWIDTH_NOTES.mixing : BANDWIDTH_NOTES.harmonic,
        ...(r.fromHarmonic ? [BANDWIDTH_NOTES.fromHarmonic] : [])] : []),
    ...(r.process === 'opo' ? [BANDWIDTH_NOTES.lines] : r.process === 'crs' ? [BANDWIDTH_NOTES.crsLines] : []),
    ...(r.waves.some(w => w.wavelengthNm > 20000) ? ['A wave lies beyond 20 µm, in the far infrared or terahertz range.'] : []),
    ...(r.degenerate ? ['Degenerate operation: signal and idler share one wavelength.'] : []),
    ...(r.process === 'crs' && r.waves.length < 4 ? ['No CSRS wavelength: the Raman frequency is not below the Stokes frequency.'] : []),
    'Energy conservation, and Gaussian spectral widths for the harmonics, SFG and DFG. Phase matching, crystal choice, acceptance bandwidths, power and conversion efficiency are not modelled.'],
});
