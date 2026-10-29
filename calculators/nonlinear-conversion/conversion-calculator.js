// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Vacuum-wavelength energy conservation for the common nonlinear processes,
// and for the harmonics, SFG and DFG the widest spectrum the inputs allow.
import { mixWavelength } from '../../sketch/js/parametric.js';
import { CRS_DEFAULTS, computeCrs } from '../coherent-raman/crs-calculator.js';
import { defaultsFor, parseInputs, unavailable } from '../assets/calculator-inputs.js';

const C_NM_THZ = 299792.458;          // ν [THz] = C_NM_THZ / λ [nm]
const HC_EV_NM = 1239.8419843320026;  // E [eV] = HC_EV_NM / λ [nm] (CODATA 2018, exact)
const SCOPE = { min: 100, max: 20000 };

export const PROCESSES = [
  ['shg', 'Second-harmonic generation (SHG)'], ['thg', 'Third-harmonic generation (THG)'],
  ['sfg', 'Sum-frequency generation (SFG)'], ['dfg', 'Difference-frequency generation (DFG)'],
  ['opo', 'Optical parametric oscillation (OPO)'],
  ['crs', 'Coherent Raman scattering (CARS and CSRS)'],
];
const HARMONIC_ORDER = { shg: 2, thg: 3 };

export const CONVERSION_INPUTS = [
  { id: 'process', group: 'process', label: 'Process', type: 'select', value: 'shg', options: PROCESSES,
    help: 'Each process conserves photon energy; the page solves for the generated wave.' },
  { id: 'known', group: 'process', label: 'Known wave', type: 'select', value: 'fundamental',
    options: [['fundamental', 'Fundamental → harmonic'], ['harmonic', 'Harmonic → fundamental']],
    when: 'process', whenValue: ['shg', 'thg'], help: 'Choose which wave you know.' },
  { id: 'harmonicInputNm', group: 'waves', label: 'Known wavelength', unit: 'nm', value: 1064, ...SCOPE,
    when: 'process', whenValue: ['shg', 'thg'], help: 'Vacuum wavelength of the wave chosen above.' },
  { id: 'harmonicBandwidthNm', group: 'waves', label: 'Bandwidth of the known wave (FWHM)', unit: 'nm', value: 1, min: 0, max: 10000,
    when: 'process', whenValue: ['shg', 'thg'], help: 'Gaussian spectrum; 0 for a single line. At most half the wavelength.' },
  { id: 'wave1Nm', group: 'waves', label: 'Input wavelength λ₁', unit: 'nm', value: 800, ...SCOPE,
    when: 'process', whenValue: ['sfg', 'dfg'], help: 'Either input; the order does not matter.' },
  { id: 'wave2Nm', group: 'waves', label: 'Input wavelength λ₂', unit: 'nm', value: 1040, ...SCOPE,
    when: 'process', whenValue: ['sfg', 'dfg'], help: 'For DFG it must differ from λ₁.' },
  { id: 'bandwidth1Nm', group: 'waves', label: 'Bandwidth of λ₁ (FWHM)', unit: 'nm', value: 10, min: 0, max: 10000,
    when: 'process', whenValue: ['sfg', 'dfg'], help: 'Gaussian spectrum; 0 for a single line. At most half the wavelength.' },
  { id: 'bandwidth2Nm', group: 'waves', label: 'Bandwidth of λ₂ (FWHM)', unit: 'nm', value: 10, min: 0, max: 10000,
    when: 'process', whenValue: ['sfg', 'dfg'], help: 'As for λ₁.' },
  { id: 'pumpNm', group: 'waves', label: 'Pump wavelength', unit: 'nm', value: 1030, ...SCOPE,
    when: 'process', whenValue: ['opo', 'crs'], help: 'Vacuum wavelength of the pump.' },
  { id: 'outputNm', group: 'waves', label: 'Signal or idler wavelength', unit: 'nm', value: 1550, ...SCOPE,
    when: 'process', whenValue: 'opo', help: 'Either output; it must be longer than the pump. The other is solved.' },
  { id: 'stokesNm', group: 'waves', label: 'Stokes wavelength', unit: 'nm', value: 1458, ...SCOPE,
    when: 'process', whenValue: 'crs', help: 'Longer than the pump. The Coherent Raman calculator also solves from a Raman shift.' },
];
export const CONVERSION_DEFAULTS = defaultsFor(CONVERSION_INPUTS);

const wave = (role, wavelengthNm, generated = false) => ({ role, wavelengthNm, frequencyTHz: C_NM_THZ / wavelengthNm, photonEv: HC_EV_NM / wavelengthNm,
  generated, bandwidthTHz: null, bandwidthNm: null });

// Spectral widths. Every spectrum is a Gaussian in frequency whose FWHM is
// Δν = cΔλ/λ², and a width is read back to nm the same way. A generated
// field is a product of the input fields (E², E³, E₁E₂ or E₁E₂*), so for
// Gaussian spectra its frequency FWHM adds in quadrature, each field counted
// as often as it appears: √n Δν for the nth harmonic, √(Δν₁² + Δν₂²) for
// SFG and DFG. Phase matching is taken to accept the whole spectrum.
const widthTHz = (nm, bandwidthNm) => C_NM_THZ * bandwidthNm / (nm * nm);
const widthNm = (thz, nm) => thz * nm * nm / C_NM_THZ;
// A width counts only while the spectrum keeps clear of zero frequency:
// FWHM at most half the centre frequency, where the Gaussian has fallen to
// about 1e-5 at ν = 0.
const fitsAboveZero = w => w.bandwidthTHz <= w.frequencyTHz / 2;

function withWidths(waves, widths) {
  const out = waves.map((w, i) => ({ ...w, bandwidthTHz: widths[i], bandwidthNm: widthNm(widths[i], w.wavelengthNm) }));
  if (out.every(fitsAboveZero)) return { waves: out };
  const bad = out.find(w => !fitsAboveZero(w));
  return { waves, bandwidthNote: `No bandwidths: the ${bad.role.toLowerCase()} spectrum would reach zero frequency, so a Gaussian width does not describe it. Narrow the inputs or set them to 0.` };
}

function inputWidthError(id, label, nm, bandwidthNm) {
  return bandwidthNm <= nm / 2 ? null : { id, message: `${label}: at most half the wavelength (${nm / 2} nm).` };
}

// Difference-frequency wavelength λ₁λ₂/(λ₂ − λ₁) for λ₁ < λ₂. Subtracting the
// wavelengths rather than their reciprocals keeps two inputs a few ulps apart
// from cancelling to zero; the result is null unless positive and finite.
function differenceNm(shortNm, longNm) {
  const out = shortNm * longNm / (longNm - shortNm);
  return out > 0 && Number.isFinite(out) ? out : null;
}

export function computeConversion(raw) {
  const { values: v, errors } = parseInputs(CONVERSION_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  const p = v.process;
  if (HARMONIC_ORDER[p]) {
    const order = HARMONIC_ORDER[p];
    const fundamentalNm = v.known === 'harmonic' ? v.harmonicInputNm * order : v.harmonicInputNm;
    const name = order === 2 ? 'Second harmonic' : 'Third harmonic';
    const error = inputWidthError('harmonicBandwidthNm', 'Bandwidth of the known wave', v.harmonicInputNm, v.harmonicBandwidthNm);
    if (error) return { ok: false, errors: [error] };
    const known = widthTHz(v.harmonicInputNm, v.harmonicBandwidthNm);
    const widths = v.known === 'harmonic' ? [known / Math.sqrt(order), known] : [known, known * Math.sqrt(order)];
    return { ok: true, process: p, bandwidths: true, fromHarmonic: v.known === 'harmonic',
      ...withWidths([wave('Fundamental', fundamentalNm, v.known === 'harmonic'), wave(name, fundamentalNm / order, v.known !== 'harmonic')], widths) };
  }
  if (p === 'sfg' || p === 'dfg') {
    const [shortNm, longNm] = [v.wave1Nm, v.wave2Nm].sort((a, b) => a - b);
    if (p === 'dfg' && !(longNm > shortNm)) return unavailable('DFG needs two different input wavelengths.', 'wave1Nm', 'wave2Nm');
    const outNm = p === 'sfg' ? mixWavelength('sfg', v.wave1Nm, v.wave2Nm) : differenceNm(shortNm, longNm);
    if (outNm === null) return unavailable('The output wavelength is not a finite number for these inputs.', 'wave1Nm', 'wave2Nm');
    const errors = [inputWidthError('bandwidth1Nm', 'Bandwidth of λ₁', v.wave1Nm, v.bandwidth1Nm),
      inputWidthError('bandwidth2Nm', 'Bandwidth of λ₂', v.wave2Nm, v.bandwidth2Nm)].filter(Boolean);
    if (errors.length) return { ok: false, errors };
    const [w1, w2] = [widthTHz(v.wave1Nm, v.bandwidth1Nm), widthTHz(v.wave2Nm, v.bandwidth2Nm)];
    return { ok: true, process: p, bandwidths: true,
      ...withWidths([wave('Input λ₁', v.wave1Nm), wave('Input λ₂', v.wave2Nm),
        wave(p === 'sfg' ? 'Sum frequency' : 'Difference frequency', outNm, true)], [w1, w2, Math.hypot(w1, w2)]) };
  }
  if (p === 'crs') {
    // Two-color CARS and CSRS from the Coherent Raman calculator itself, so
    // both pages decline the same inputs; its field names map onto ours.
    const r = computeCrs({ ...CRS_DEFAULTS, mode: 'pump-stokes', pumpNm: v.pumpNm, stokesNm: v.stokesNm });
    if (!r.ok) return { ok: false, errors: r.errors.map(e => ({ ...e, id: e.id === 'stokesNm' ? 'stokesNm' : 'pumpNm' })) };
    return { ok: true, process: p, ramanShiftCm: r.ramanShiftCm,
      waves: [wave('Pump', r.pumpNm), wave('Stokes', r.stokesNm), wave('CARS (anti-Stokes)', r.antiStokesNm, true),
        ...(r.csrsNm === null ? [] : [wave('CSRS (coherent Stokes)', r.csrsNm, true)])] };
  }
  if (!(v.outputNm > v.pumpNm)) return unavailable('The signal or idler must be longer than the pump.', 'outputNm', 'pumpNm');
  // The partner is the pump–output difference frequency, as in DFG, without
  // the tracer's 1e-9 nm⁻¹ cutoff in parametricPair: an output just longer
  // than the pump gives a very long partner, not a refusal.
  const partnerNm = differenceNm(v.pumpNm, v.outputNm);
  if (partnerNm === null) return unavailable('The partner wavelength is not a finite number for these inputs.', 'outputNm', 'pumpNm');
  // The signal is the higher-frequency output by convention.
  const [signalNm, idlerNm] = [v.outputNm, partnerNm].sort((a, b) => a - b);
  const degenerate = Math.abs(idlerNm - signalNm) <= 1e-9 * idlerNm;
  return { ok: true, process: p, degenerate, degeneracyNm: 2 * v.pumpNm,
    // Manley–Rowe: of the converted pump power, a fraction λ_p/λ goes to each output.
    signalShare: v.pumpNm / signalNm, idlerShare: v.pumpNm / idlerNm,
    waves: [wave('Pump', v.pumpNm), wave('Signal', signalNm, true), wave('Idler', idlerNm, true)] };
}

// The spectrum graph: each wave as its Gaussian against wavelength, scaled
// to its own peak, sampled at 1/16 of its FWHM out to ±2 FWHM (where it has
// fallen to 1.5e-5) and null elsewhere so the peaks stand apart. A wave
// without a width (zero, or not modelled) is a vertical line at its
// position. The x range pads the outermost samples by 5 % of the span.
const SAMPLES_PER_SIDE = 32, SAMPLE_STEP = 1 / 16;
export function conversionSpectrum(result) {
  const peaks = result.waves.map(w => w.bandwidthTHz > 0
    ? { ...w, line: null, width: w.bandwidthTHz }
    : { ...w, line: [w.wavelengthNm * (1 - 1e-7), w.wavelengthNm, w.wavelengthNm * (1 + 1e-7)], width: 0 });
  const xs = new Set();
  for (const w of peaks) {
    if (w.line) { w.line.forEach(nm => xs.add(nm)); continue; }
    for (let k = -SAMPLES_PER_SIDE; k <= SAMPLES_PER_SIDE; k++) xs.add(C_NM_THZ / (w.frequencyTHz + k * SAMPLE_STEP * w.width));
  }
  const x = [...xs].sort((a, b) => a - b);
  const pad = 0.05 * (x.at(-1) - x[0]);
  const series = peaks.map(w => ({ role: w.role, generated: w.generated, values: x.map(nm => {
    if (w.line) return nm === w.line[1] ? 1 : nm === w.line[0] || nm === w.line[2] ? 0 : null;
    const offset = (C_NM_THZ / nm - w.frequencyTHz) / w.width;
    return Math.abs(offset) <= SAMPLES_PER_SIDE * SAMPLE_STEP * (1 + 1e-9) ? Math.exp(-4 * Math.LN2 * offset * offset) : null;
  }) }));
  return { x, xMin: Math.max(0, x[0] - pad), xMax: x.at(-1) + pad, series };
}
