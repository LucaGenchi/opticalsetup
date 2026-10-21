// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { CRS_INPUTS, CRS_DEFAULTS, computeCrs, RESOLUTION_INPUTS, RESOLUTION_DEFAULTS, computeResolution } from './crs-calculator.js';
import { SPECTRUM_INPUTS, SPECTRUM_DEFAULTS, computeSpectrumView } from './crs-spectra.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';
import { formatNumber } from '../assets/calculator-kit.js';

// The spectrum panel reads the shift and the resolution from the panels
// above and loads one spectrum file at a time, on demand.
const probe = { ramanShiftCm: null, resolutionCm: null };
const files = new Map();
let spectra = null;
function spectrumFile(id) {
  if (!files.has(id)) {
    files.set(id, undefined);
    fetch(new URL(`./spectra/${encodeURIComponent(id)}.json`, import.meta.url))
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => files.set(id, data), error => files.set(id, { error }))
      .finally(() => spectra?.update());
  }
  return files.get(id);
}

mountCalculator({ inputs: CRS_INPUTS, defaults: CRS_DEFAULTS, groups: {
  excitation: { title: 'Raman excitation' },
}, compute: computeCrs,
  rows: r => [
    { group: 'Excitation' },
    ['Pump wavelength', r.pumpNm, 'nm'], ['Stokes wavelength', r.stokesNm, 'nm'],
    ['Raman shift', r.ramanShiftCm, 'cm⁻¹'], ['Raman frequency', r.ramanTHz, 'THz'],
    { group: 'Coherent Raman signals' },
    ['CARS (anti-Stokes) wavelength', r.antiStokesNm, 'nm'], ['CSRS (coherent Stokes) wavelength', r.csrsNm, 'nm'],
  ],
  notes: r => [
    'CARS appears at twice the pump frequency minus the Stokes frequency; CSRS at twice the Stokes frequency minus the pump frequency.',
    ...(r.csrsNm === null ? ['No CSRS wavelength: the Raman frequency is not below the Stokes frequency.'] : []),
    'Stimulated Raman scattering (SRS) is detected at the pump and Stokes wavelengths themselves, as a loss or gain.',
    'Frequency relations only. No Raman resonance strength, nonresonant background, phase matching or signal level is predicted.',
  ],
  onResult: r => { probe.ramanShiftCm = r.ok ? r.ramanShiftCm : null; spectra?.update(); },
});

mountCalculator({ panel: 'resolution', inputs: RESOLUTION_INPUTS, defaults: RESOLUTION_DEFAULTS, groups: {
  durations: { title: 'Pulse durations (intensity FWHM)' },
}, compute: computeResolution,
  rows: r => [['Spectral resolution Δν̃', r.resolutionCm, 'cm⁻¹', 4], ['Spectral resolution Δν', r.resolutionGHz, 'GHz', 4]],
  notes: () => [
    'Gaussian pulses, transform-limited or with equal linear chirp (spectral focusing). A chirp mismatch broadens the resolution further.',
    'Width of the excitation profile as defined by Mohseni et al. (2018), Eq. (5); see the physics section for the convention.',
  ],
  onResult: r => { probe.resolutionCm = r.ok ? r.resolutionCm : null; spectra?.update(); },
});

const cm = n => formatNumber(n, 5);
// "Flanagan & Glavin, Sci. Data 12, 498 (2025)"; a ROD entry adds its number
// and first contributor. The full citations are in the page's references.
function compactSource(r) {
  if (!r.meta.rodId) return r.source.short;
  const [first, ...rest] = r.meta.contributors;
  return `${r.source.short}, entry ${r.meta.rodId} (${first.replace(/,.*$/, '')}${rest.length ? ' et al.' : ''})`;
}
spectra = mountCalculator({ panel: 'spectra', inputs: SPECTRUM_INPUTS, defaults: SPECTRUM_DEFAULTS, groups: {
  spectrum: { title: 'Reference spectrum' },
}, compute: raw => computeSpectrumView(raw, { ...probe, data: spectrumFile(raw.spectrum) }),
  // The material's details sit under its selector; the probed window, on
  // the right, is what changes with the excitation.
  rows: r => ({
    spectra: [
      { group: 'Probed window' },
      ['Raman shift', r.ramanShiftCm, 'cm⁻¹'], ['Resolution (FWHM)', r.resolutionCm, 'cm⁻¹', 4],
      ['Window', `${cm(r.window[0])}–${cm(r.window[1])} cm⁻¹`],
      ['Spectrum at the shift (normalized)', r.atShift, '', 3],
      ['Strongest point in the window', r.peak ? `${cm(r.peak.x)} cm⁻¹ (${formatNumber(r.peak.y, 3)}${r.peak.interpolated ? ', interpolated at the window edge' : ''})` : '—'],
    ],
    'spectrum-info': [
      { group: r.meta.name },
      ['Category', r.meta.category], ['Measurement', r.technique],
      ['Measured range', `${cm(r.measuredRange[0])}–${cm(r.measuredRange[1])} cm⁻¹`],
      ['Source', compactSource(r)], ['Licence', r.source.licenseName],
    ],
  }),
  notes: r => [
    ...(r.inRange ? [] : [`The probed window lies outside this spectrum’s measured range (${cm(r.measuredRange[0])}–${cm(r.measuredRange[1])} cm⁻¹).`]),
    `${r.meta.measurement}.`,
    'Normalized to its strongest band after a two-point baseline. Relative band heights depend on the instrument and the excitation, so compare positions, not heights, across sources.',
    'The highlighted band is the probed window, the Raman shift ± half the resolution. It shows which bands the excitation addresses; it does not model the coherent Raman signal, which also depends on linewidths and the nonresonant background.',
  ],
  graphs: r => ({
    spectrum: {
      x: r.plot.x, xLabel: 'Raman shift (cm⁻¹)', xUnit: 'cm⁻¹', yLabel: 'Normalized intensity',
      series: [{ name: r.meta.name, color: '--series-1', values: r.plot.y }],
      yMin: 0, yMax: 1.05, formatX: n => formatNumber(n, 5), formatY: n => formatNumber(n, 3),
      band: { lo: r.window[0], hi: r.window[1], label: 'Probed window' },
      marker: r.atShift === null ? null : { x: r.ramanShiftCm, y: r.atShift },
    },
  }),
});
