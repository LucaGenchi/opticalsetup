// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { MATERIALS, MATERIAL_OPTIONS, materialRange, materialDispersion, materialAbbe } from './materials.js';
import { gaussianPulseDurationAfterGDD, sech2PulseDurationAfterGDD } from '../../sketch/js/glass.js';
import { defaultsFor, parseInputs, unavailable } from '../assets/calculator-inputs.js';

// Vacuum group delay per mm of path, in fs.
const FS_PER_MM = 1e12 / 299792458;
const C_NM_PER_FS = 299.792458;
// Time–bandwidth products (intensity FWHM × frequency FWHM), the values
// sketch/js/spectrum.js uses. The transform limit is evaluated here rather
// than through transformLimitedDurationFs, whose 1e-9 nm bandwidth floor
// would shorten the limit of a narrower band without saying so.
const TIME_BANDWIDTH = { gauss: 0.441, sech2: 0.315 };
const WAVELENGTH_SCOPE = [180, 20000];

export const DISPERSION_INPUTS = [
  { id: 'material', type: 'select', group: 'material', label: 'Material', value: 'silica', options: MATERIAL_OPTIONS,
    help: 'Published dispersion fit; its source, conditions and fit domain are listed below.' },
  { id: 'thicknessMm', group: 'material', label: 'Thickness', unit: 'mm', value: 10, min: 0, max: 10000,
    help: 'Path length through the material (for air, the beam path). Scales delay, GDD and TOD.' },
  { id: 'wavelengthNm', group: 'source', label: 'Central wavelength', unit: 'nm', value: 800, min: WAVELENGTH_SCOPE[0], max: WAVELENGTH_SCOPE[1],
    help: 'Vacuum wavelength at which the material values are evaluated. Must be inside the material’s fit domain.' },
  { id: 'bandwidthNm', group: 'source', label: 'Bandwidth (FWHM)', unit: 'nm', value: 30, min: 0, max: 10000,
    help: 'Spectral FWHM of the pulse, assumed transform-limited at the input. 0 for a monochromatic beam.' },
  { id: 'shape', type: 'select', group: 'source', label: 'Pulse shape', value: 'gauss',
    options: [['gauss', 'Gaussian'], ['sech2', 'sech²']],
    help: 'Sets the time–bandwidth product of the input pulse and how GDD stretches it.' },
  { id: 'plotRange', type: 'select', group: 'plot', label: 'Range', value: 'auto',
    options: [['auto', 'Around the central wavelength (λ₀/2 to 2λ₀)'], ['domain', 'Whole fit domain'], ['custom', 'Custom']],
    help: 'Automatic and whole-domain ranges are clipped to the material’s fit domain.' },
  { id: 'loNm', group: 'plot', label: 'Plot start', unit: 'nm', value: 400, min: WAVELENGTH_SCOPE[0], max: WAVELENGTH_SCOPE[1],
    when: 'plotRange', whenValue: 'custom', help: 'Inside the material’s fit domain.' },
  { id: 'hiNm', group: 'plot', label: 'Plot end', unit: 'nm', value: 1600, min: WAVELENGTH_SCOPE[0], max: WAVELENGTH_SCOPE[1],
    when: 'plotRange', whenValue: 'custom', help: 'Inside the fit domain, at least 1 nm above the start.' },
];
export const DISPERSION_DEFAULTS = defaultsFor(DISPERSION_INPUTS);

function plotInterval(v, [lo, hi]) {
  if (v.plotRange === 'domain') return [lo, hi];
  if (v.plotRange === 'auto') return [Math.max(lo, v.wavelengthNm / 2), Math.min(hi, 2 * v.wavelengthNm)];
  return [v.loNm, v.hiNm];
}

export function computeDispersion(raw) {
  const { values: v, errors } = parseInputs(DISPERSION_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  const material = MATERIALS.get(v.material);
  const range = materialRange(v.material);
  const domain = `${material.label}: fit domain ${range[0]}–${range[1]} nm.`;
  const inDomain = nm => nm >= range[0] && nm <= range[1];
  if (!inDomain(v.wavelengthNm)) return unavailable(`${domain} Choose a central wavelength inside it.`, 'wavelengthNm');
  if (v.plotRange === 'custom') {
    for (const id of ['loNm', 'hiNm']) if (!inDomain(v[id])) return unavailable(`${domain} The plot range must lie inside it.`, id);
    if (v.hiNm - v.loNm < 1) return unavailable('Plot end must be at least 1 nm above the start.', 'loNm', 'hiNm');
  }
  if (!(v.bandwidthNm < v.wavelengthNm)) return unavailable('The bandwidth must be smaller than the central wavelength.', 'bandwidthNm');
  const point = materialDispersion(v.material, v.wavelengthNm);
  if (!point) return unavailable('Dispersion is unavailable at this wavelength.', 'wavelengthNm');

  const L = v.thicknessMm;
  const band = v.bandwidthNm > 0 ? [v.wavelengthNm - v.bandwidthNm / 2, v.wavelengthNm + v.bandwidthNm / 2] : null;
  // Group delay of the blue edge minus the red edge, from n_g at each edge:
  // exact for the material curve, unlike a GDD × Δω estimate.
  const edges = band && band.every(inDomain) ? band.map(nm => materialDispersion(v.material, nm)) : null;
  const delaySpreadFs = edges?.every(Boolean) ? L * (edges[0].groupIndex - edges[1].groupIndex) * FS_PER_MM : null;
  const gddFs2 = L * point.gvdFs2PerMm;
  const transformLimitFs = band ? TIME_BANDWIDTH[v.shape] * v.wavelengthNm ** 2 / (C_NM_PER_FS * v.bandwidthNm) : null;
  const outputFs = transformLimitFs === null ? null : v.shape === 'sech2'
    ? sech2PulseDurationAfterGDD(transformLimitFs, gddFs2) : gaussianPulseDurationAfterGDD(transformLimitFs, gddFs2);
  return {
    ok: true, ...point, values: v, range, band, material,
    plot: plotInterval(v, range),
    delayVsVacuumFs: L * (point.groupIndex - 1) * FS_PER_MM,
    gddFs2, todFs3: L * point.todFs3PerMm, delaySpreadFs,
    transformLimitFs, outputFs, abbe: materialAbbe(v.material),
  };
}

export function dispersionScan(result, count = 241) {
  if (!result?.ok) return [];
  const [lo, hi] = result.plot;
  return Array.from({ length: count }, (_, i) => {
    const wavelengthNm = i === count - 1 ? hi : lo + (hi - lo) * i / (count - 1);
    return { wavelengthNm, ...materialDispersion(result.values.material, wavelengthNm) };
  });
}
