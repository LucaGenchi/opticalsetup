// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { CONVERSION_INPUTS, CONVERSION_DEFAULTS, PROCESSES, computeConversion, conversionSpectrum } from './conversion-calculator.js';
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
  opo: 'The bandwidth of the output you enter is set by the cavity and phase matching, so it is yours to give; it may exceed the pump’s, because only the sum of the signal and idler frequencies is fixed. The other output is the pump–output difference frequency, so its frequency FWHM is the quadrature sum of theirs, as in DFG: for transform-limited pulses and independent CW lines, and the widest it can be.',
  crs: 'Bandwidths for transform-limited Gaussian pulses and an instantaneous response (non-resonant, or a Raman line broader than the excitation): CARS is E_p²E_S* and CSRS E_S²E_p*, so the frequency FWHMs add in quadrature with the twice-used beam counted twice. A narrow Raman line narrows CARS towards the pump width and CSRS towards the Stokes width; the Coherent Raman calculator gives the spectral resolution.',
};
const MIXING_NOTE = { sfg: 'mixing', dfg: 'mixing', opo: 'opo', crs: 'crs' };
// Given waves blue then aqua, generated ones orange then plum: four
// colours that stay apart under colour-vision deficiency, in both themes.
const GIVEN = ['--series-1', '--series-3'], MADE = ['--series-2', '--series-4'];

const { update } = mountCalculator({ inputs: CONVERSION_INPUTS, defaults: CONVERSION_DEFAULTS, hideInactive: true, groups: {
  process: { title: 'Process' }, waves: { title: 'Wavelength' }, waves2: { title: 'Second wavelength' },
}, compute: computeConversion,
  graphs: r => {
    const { x, xMin, xMax, series } = conversionSpectrum(r);
    let given = 0, made = 0;
    const colored = series.map((s, i) => ({ ...s, color: s.generated ? MADE[made++ % 2] : GIVEN[given++ % 2], wave: r.waves[i] }));
    return { spectrum: { x, xMin, xMax, xLabel: 'Wavelength (nm)', xUnit: 'nm', yLabel: 'Normalized intensity (a.u.)', yMin: 0, yMax: 1,
      formatX: v => formatNumber(v, 6),
      series: colored.map(s => ({ key: s.role, name: s.role, values: s.values, fill: 'light', color: s.color })),
      // Each generated wave's central wavelength under the axis, in its colour.
      xMarks: colored.filter(s => s.generated).map(s => ({ x: s.wave.wavelengthNm, label: s.wave.wavelengthNm.toFixed(1), color: s.color })) } };
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
      ? [BANDWIDTH_NOTES[MIXING_NOTE[r.process] ?? 'harmonic'],
        ...(r.fromHarmonic ? [BANDWIDTH_NOTES.fromHarmonic] : [])] : []),
    ...(r.waves.some(w => w.wavelengthNm > 20000) ? ['A wave lies beyond 20 µm, in the far infrared or terahertz range.'] : []),
    ...(r.degenerate ? ['Degenerate operation: signal and idler share one wavelength.'] : []),
    ...(r.process === 'crs' && r.waves.length < 4 ? ['No CSRS wavelength: the Raman frequency is not below the Stokes frequency.'] : []),
    'Energy conservation, and the widest Gaussian spectrum each generated wave can have. Phase matching, crystal choice, acceptance bandwidths, power and conversion efficiency are not modelled.'],
});

// While the boxes sit side by side, they take the height of the tallest
// process, so the graph below stays put when the process changes: each
// process is shown once, unpainted, to measure it, and the measure is redone
// when the width changes. Stacked in one column (a phone), they keep their
// own height rather than leave a gap.
const form = document.getElementById('calc-form');
function reserveInputHeight() {
  const select = document.getElementById('in-process');
  const chosen = select.value;
  form.style.minHeight = '';
  if (getComputedStyle(form).gridTemplateColumns.split(' ').length < 3) return;
  let tallest = 0;
  for (const [process] of PROCESSES) {
    select.value = process;
    update();
    tallest = Math.max(tallest, form.offsetHeight);
  }
  select.value = chosen;
  update();
  form.style.minHeight = `${tallest}px`;
}
reserveInputHeight();
let resizing;
window.addEventListener('resize', () => { clearTimeout(resizing); resizing = setTimeout(reserveInputHeight, 150); });
