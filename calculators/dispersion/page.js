// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { DISPERSION_INPUTS, DISPERSION_DEFAULTS, computeDispersion, dispersionScan } from './dispersion-calculator.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';
import { formatNumber } from '../assets/calculator-kit.js';

const shapeName = { gauss: 'Gaussian', sech2: 'sech²' };

mountCalculator({ inputs: DISPERSION_INPUTS, defaults: DISPERSION_DEFAULTS, groups: {
  source: { title: 'Laser source' }, material: { title: 'Material properties', form: 'material-form' },
  plot: { title: 'Plot range', form: 'plot-form' },
}, compute: computeDispersion,
  // Three columns: the source and its input pulse, the material and its
  // values at λ₀, then what the thickness does to the pulse.
  rows: r => ({
    pulse: [{ group: `${shapeName[r.values.shape]} pulse, transform-limited at the input` },
      ['Duration (FWHM)', r.transformLimitFs, 'fs'], ['Bandwidth in frequency (FWHM)', r.bandwidthTHz, 'THz']],
    material: [{ group: 'Material at the central wavelength' },
      ['Phase index n', r.index, '', 7], ['Group index', r.groupIndex, '', 7],
      ['GVD β₂', r.gvdFs2PerMm, 'fs²/mm'], ['TOD β₃', r.todFs3PerMm, 'fs³/mm'], ['Abbe number', r.abbe, '', 4]],
    calc: [{ group: `Through ${formatNumber(r.values.thicknessMm, 6)} mm (output)` },
      ['GDD', r.gddFs2, 'fs²'], ['TOD', r.todFs3, 'fs³'],
      ['Delay spread across the bandwidth (blue − red)', r.delaySpreadFs, 'fs'],
      ['Output duration, GDD only (FWHM)', r.outputFs, 'fs'],
      [r.material.form === 'gas' ? 'Added group delay (vs. vacuum)' : 'Added group delay (vs. the same path in air)', r.addedDelayFs / 1000, 'ps'],
      [r.material.form === 'gas' ? 'Added optical path length (vs. vacuum)' : 'Added optical path length (vs. air)', r.addedOpticalPathMm, 'mm']],
  }),
  notes: r => {
    const v = r.values, out = [];
    out.push(`${r.material.label}: ${r.material.conditions}. Fit domain ${r.range[0]}–${r.range[1]} nm; this is not a transmission guarantee.`);
    out.push(r.gvdFs2PerMm >= 0 ? 'Normal dispersion (positive GVD) at the central wavelength.' : 'Anomalous dispersion (negative GVD) at the central wavelength.');
    out.push(r.material.form === 'gas'
      ? 'Added delay and optical path compare the beam path with vacuum: the air fit gives absolute indices.'
      : 'Added delay is how much later the pulse arrives than through the same length of air, L(n_g − 1)/c; the added optical path, L(n − 1), is the phase path. Retime a pump–probe delay line by the added delay.');
    if (r.material.birefringent) out.push('Principal-axis index of a birefringent crystal: valid for light polarized along that axis. Other propagation directions need the angle-dependent index, which is not modelled.');
    if (!r.band) out.push('Bandwidth 0: a monochromatic beam has no pulse duration or delay spread.');
    else {
      if (r.delaySpreadFs === null) out.push('A bandwidth edge lies outside the fit domain, so the delay spread is not given.');
      if (v.bandwidthNm > 0.1 * v.wavelengthNm) out.push('The transform limit uses Δν = cΔλ/λ₀², a small-bandwidth approximation that is off by a few percent beyond about 10 % of λ₀.');
      out.push('The output duration includes GDD only. TOD, listed above, also distorts the pulse and is not included in that number.');
    }
    out.push(`Graphs plot ${formatNumber(r.plot[0], 6)}–${formatNumber(r.plot[1], 6)} nm.`);
    if (v.wavelengthNm < r.plot[0] || v.wavelengthNm > r.plot[1]) out.push('The central wavelength lies outside the plot range, so the graphs show no marker.');
    return out;
  },
  graphs: r => {
    const scan = dispersionScan(r), x = scan.map(p => p.wavelengthNm);
    const band = r.band ? { lo: r.band[0], hi: r.band[1], label: 'Laser bandwidth (FWHM)' } : null;
    const inPlot = r.values.wavelengthNm >= r.plot[0] && r.values.wavelengthNm <= r.plot[1];
    const chart = (key, yLabel, series, throughZero) => {
      const all = series.flatMap(s => s.values), lo = Math.min(...all), hi = Math.max(...all);
      const pad = Math.max((hi - lo) * 0.08, Math.abs(hi) * 1e-6, 1e-6);
      return { x, xLabel: 'Vacuum wavelength (nm)', xUnit: 'nm', yLabel, series, band,
        yMin: throughZero ? Math.min(0, lo - pad) : lo - pad,
        yMax: throughZero ? Math.max(0, hi + pad) : hi + pad,
        formatY: n => formatNumber(n, key === 'index' ? 6 : 4),
        marker: inPlot ? { x: r.values.wavelengthNm, y: r[key] } : null };
    };
    return {
      index: chart('index', 'Refractive index', [
        { name: 'Phase index n', color: '--series-1', values: scan.map(p => p.index) },
        { name: 'Group index', color: '--series-2', values: scan.map(p => p.groupIndex) }]),
      gvd: chart('gvdFs2PerMm', 'GVD β₂ (fs²/mm)', [
        { name: 'GVD β₂', color: '--series-1', values: scan.map(p => p.gvdFs2PerMm) }], true),
      tod: chart('todFs3PerMm', 'TOD β₃ (fs³/mm)', [
        { name: 'TOD β₃', color: '--series-1', values: scan.map(p => p.todFs3PerMm) }], true),
    };
  },
});
