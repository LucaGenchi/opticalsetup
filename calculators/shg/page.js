// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { SHG_INPUTS, SHG_DEFAULTS, computeShg } from './shg-calculator.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';
mountCalculator({ inputs: SHG_INPUTS, defaults: SHG_DEFAULTS, groups: { waves: { title: 'Wavelength conversion' } }, compute: computeShg,
  rows: r => [['Fundamental wavelength', r.fundamentalNm, 'nm'], ['Second-harmonic wavelength', r.harmonicNm, 'nm'],
    ['Fundamental frequency', r.fundamentalTHz, 'THz'], ['Second-harmonic frequency', r.harmonicTHz, 'THz']],
  notes: () => ['Vacuum-wavelength relation only. Phase matching and conversion efficiency require a material and setup model.'],
});
