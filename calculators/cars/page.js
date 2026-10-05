// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { CARS_INPUTS, CARS_DEFAULTS, computeCars } from './cars-calculator.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';
mountCalculator({ inputs: CARS_INPUTS, defaults: CARS_DEFAULTS, groups: {
  excitation: { title: 'Raman excitation' }, probe: { title: 'Probe' },
}, compute: computeCars,
  rows: r => [['Pump wavelength', r.pumpNm, 'nm'], ['Stokes wavelength', r.stokesNm, 'nm'],
    ['Probe wavelength', r.probeNm, 'nm'], ['Raman shift', r.ramanShiftCm, 'cm⁻¹'],
    ['Raman frequency', r.ramanTHz, 'THz'], ['Anti-Stokes wavelength', r.antiStokesNm, 'nm']],
  notes: () => ['Frequency relations only. No Raman resonance strength, nonresonant background or conversion efficiency is predicted.'],
});
