// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { CRS_INPUTS, CRS_DEFAULTS, computeCrs, RESOLUTION_INPUTS, RESOLUTION_DEFAULTS, computeResolution } from './crs-calculator.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';

mountCalculator({ inputs: CRS_INPUTS, defaults: CRS_DEFAULTS, groups: {
  excitation: { title: 'Raman excitation' }, probe: { title: 'Probe' },
}, compute: computeCrs,
  rows: r => [
    { group: 'Excitation' },
    ['Pump wavelength', r.pumpNm, 'nm'], ['Stokes wavelength', r.stokesNm, 'nm'],
    ['Raman shift', r.ramanShiftCm, 'cm⁻¹'], ['Raman frequency', r.ramanTHz, 'THz'],
    { group: r.separateProbe ? `Signals with a ${+r.carsProbeNm.toPrecision(6)} nm probe` : 'Two-color signals' },
    ['CARS (anti-Stokes) wavelength', r.antiStokesNm, 'nm'], ['CSRS (coherent Stokes) wavelength', r.csrsNm, 'nm'],
  ],
  notes: r => [
    r.separateProbe ? 'CARS at the probe frequency plus the Raman frequency; CSRS at the probe frequency minus it.'
      : 'CARS at twice the pump frequency minus the Stokes frequency (the pump probes); CSRS at twice the Stokes frequency minus the pump frequency (the Stokes beam probes).',
    ...(r.csrsNm === null ? ['No CSRS wavelength: the Raman frequency is not below the probing frequency.'] : []),
    'Stimulated Raman scattering (SRS) is detected at the pump and Stokes wavelengths themselves, as a loss or gain.',
    'Frequency relations only. No Raman resonance strength, nonresonant background, phase matching or signal level is predicted.',
  ],
});

mountCalculator({ panel: 'resolution', inputs: RESOLUTION_INPUTS, defaults: RESOLUTION_DEFAULTS, groups: {
  durations: { title: 'Pulse durations (intensity FWHM)' },
}, compute: computeResolution,
  rows: r => [['Spectral resolution Δν̃', r.resolutionCm, 'cm⁻¹', 4], ['Spectral resolution Δν', r.resolutionGHz, 'GHz', 4]],
  notes: () => [
    'Gaussian pulses, transform-limited or with equal linear chirp (spectral focusing). A chirp mismatch broadens the resolution further.',
    'Width of the excitation profile as defined by Mohseni et al. (2018), Eq. (5); see the physics section for the convention.',
  ],
});
