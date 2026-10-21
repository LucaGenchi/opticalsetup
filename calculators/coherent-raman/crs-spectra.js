// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The reference-spectrum panel of the coherent Raman page: which part of a
// measured Raman spectrum the excitation addresses, given the Raman shift
// and the spectral resolution from the two panels above. DOM-free; the page
// loads the spectrum file and passes it in.
import { SPECTRA, SPECTRUM_SOURCES, SPECTRUM_TECHNIQUES } from './spectra-index.js';
import { defaultsFor, parseInputs } from '../assets/calculator-inputs.js';

export const SPECTRUM_INDEX = new Map(SPECTRA.map(s => [s.id, s]));

export const SPECTRUM_INPUTS = [
  { id: 'spectrum', type: 'select', group: 'spectrum', label: 'Reference material', value: 'ethanol',
    options: SPECTRA.map(s => [s.id, s.name, s.category]),
    help: 'Measured spectra from openly licensed sources, grouped by chemical class. Sources and licences are listed below.' },
  { id: 'view', type: 'select', group: 'spectrum', label: 'Range', value: 'full',
    options: [['full', 'Whole measured spectrum'], ['window', 'Around the probed shift']],
    help: '“Around the probed shift” shows ±150 cm⁻¹, or ±3 resolutions if that is wider.' },
];
export const SPECTRUM_DEFAULTS = defaultsFor(SPECTRUM_INPUTS);

// raw: the panel's inputs. context: { ramanShiftCm, resolutionCm } from the
// other panels (null when they are invalid) and `data`, the loaded spectrum
// file (undefined while loading, { error } if it failed).
export function computeSpectrumView(raw, { ramanShiftCm = null, resolutionCm = null, data } = {}) {
  const { values: v, errors } = parseInputs(SPECTRUM_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  if (!(ramanShiftCm > 0)) return { ok: false, errors: [{ id: null, message: 'Set a valid Raman excitation in the first panel to show the probed shift.' }] };
  if (!(resolutionCm > 0)) return { ok: false, errors: [{ id: null, message: 'Set valid pulse durations in the resolution panel to show the probed window.' }] };
  if (data === undefined) return { ok: false, pending: true, message: 'Loading the reference spectrum…' };
  if (data?.error || !Array.isArray(data?.intensity) || data.id !== v.spectrum) {
    return { ok: false, errors: [{ id: 'spectrum', message: 'This reference spectrum could not be loaded.' }] };
  }
  const meta = SPECTRUM_INDEX.get(v.spectrum);
  const x = data.intensity.map((_, i) => data.startCm + i * data.stepCm);
  const y = data.intensity.map(n => n / 1000);
  const [lo, hi] = [x[0], x.at(-1)];
  const window = [ramanShiftCm - resolutionCm / 2, ramanShiftCm + resolutionCm / 2];
  const inRange = window[1] >= lo && window[0] <= hi;
  // Linear interpolation of the spectrum at the probed shift.
  const at = cm => {
    if (cm < lo || cm > hi) return null;
    const k = Math.min(x.length - 2, Math.floor((cm - lo) / data.stepCm));
    return y[k] + (y[k + 1] - y[k]) * (cm - x[k]) / data.stepCm;
  };
  // The strongest sample inside the window; a window narrower than one bin
  // falls back to the sample nearest the shift.
  let peak = null;
  x.forEach((cm, k) => { if (cm >= window[0] && cm <= window[1] && (!peak || y[k] > peak.y)) peak = { x: cm, y: y[k] }; });
  if (!peak && inRange) {
    const k = Math.max(0, Math.min(x.length - 1, Math.round((ramanShiftCm - lo) / data.stepCm)));
    peak = { x: x[k], y: y[k] };
  }
  const half = Math.max(150, 3 * resolutionCm);
  const view = v.view === 'window' && inRange
    ? [Math.max(lo, ramanShiftCm - half), Math.min(hi, ramanShiftCm + half)] : [lo, hi];
  const keep = x.map((cm, k) => cm >= view[0] && cm <= view[1] ? k : -1).filter(k => k >= 0);
  return {
    ok: true, meta, source: SPECTRUM_SOURCES[meta.source], technique: SPECTRUM_TECHNIQUES[meta.technique],
    ramanShiftCm, resolutionCm, window, inRange, measuredRange: [lo, hi],
    atShift: at(ramanShiftCm), peak,
    plot: { x: keep.map(k => x[k]), y: keep.map(k => y[k]) },
  };
}
