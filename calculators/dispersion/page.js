// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { DISPERSION_INPUTS, DISPERSION_DEFAULTS, computeDispersion, dispersionScan } from './dispersion-calculator.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';
import { formatNumber } from '../assets/calculator-kit.js';
mountCalculator({ inputs: DISPERSION_INPUTS, defaults: DISPERSION_DEFAULTS, groups: {
  material: { title: 'Material and thickness' }, plot: { title: 'Wavelength interval' },
}, compute: computeDispersion,
  rows: r => [['Refractive index n', r.index, '', 8], ['Group index ng', r.groupIndex, '', 8],
    ['GVD β₂', r.gvdFs2PerMm, 'fs²/mm'], ['GDD through the glass', r.gddFs2, 'fs²'], ['Abbe number Vd', r.abbe]],
  notes: r => [`Supported fit domain: ${r.range[0]}–${r.range[1]} nm; this is not a transmission guarantee.`,
    r.gvdFs2PerMm >= 0 ? 'Normal dispersion (positive GVD).' : 'Anomalous dispersion (negative GVD).',
    ...(r.values.wavelengthNm < r.values.loNm || r.values.wavelengthNm > r.values.hiNm
      ? ['The evaluated wavelength lies outside the plot interval. Extend the interval to show its marker.'] : []),
    'Continuous analytic Sellmeier evaluation. Catalogue fit uncertainty, temperature and absorption are not included.'],
  graphs: r => {
    const scan = dispersionScan(r), x = scan.map(p => p.wavelengthNm);
    const chart = (key, yLabel, series) => {
      const all = series.flatMap(s => s.values), lo = Math.min(...all), hi = Math.max(...all);
      const pad = Math.max((hi - lo) * 0.08, 1e-5);
      return { x, xLabel: 'Vacuum wavelength (nm)', xUnit: 'nm', yLabel, series,
        yMin: key === 'gvdFs2PerMm' ? Math.min(0, lo - pad) : lo - pad,
        yMax: key === 'gvdFs2PerMm' ? Math.max(0, hi + pad) : hi + pad,
        formatY: n => formatNumber(n, key === 'index' ? 6 : 4),
        marker: r.values.wavelengthNm >= r.values.loNm && r.values.wavelengthNm <= r.values.hiNm
          ? { x: r.values.wavelengthNm, y: r[key] } : null };
    };
    return {
      index: chart('index', 'Refractive index', [
        { name: 'Phase index n', color: '--series-1', values: scan.map(p => p.index) },
        { name: 'Group index ng', color: '--series-2', values: scan.map(p => p.groupIndex) }]),
      gvd: chart('gvdFs2PerMm', 'GVD β₂ (fs²/mm)', [
        { name: 'GVD β₂', color: '--series-1', values: scan.map(p => p.gvdFs2PerMm) }]),
    };
  },
});
