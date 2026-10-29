// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Vacuum-wavelength energy conservation for the common nonlinear processes,
// and the widest spectrum the inputs allow for each generated wave.
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
  { id: 'process', group: 'process', label: 'Process', type: 'select', value: 'shg', options: PROCESSES },
  { id: 'known', group: 'process', label: 'Known wave', type: 'select', value: 'fundamental',
    options: [['fundamental', 'Fundamental → harmonic'], ['harmonic', 'Harmonic → fundamental']],
    when: 'process', whenValue: ['shg', 'thg'] },
  { id: 'harmonicInputNm', group: 'waves', label: 'Known wavelength', unit: 'nm', value: 1030, ...SCOPE,
    when: 'process', whenValue: ['shg', 'thg'] },
  { id: 'harmonicBandwidthNm', group: 'waves', label: 'Bandwidth of the known wave (FWHM)', unit: 'nm', value: 10, min: 0, max: 10000,
    when: 'process', whenValue: ['shg', 'thg'] },
  { id: 'wave1Nm', group: 'waves', label: 'Input wavelength λ₁', unit: 'nm', value: 1030, ...SCOPE,
    when: 'process', whenValue: ['sfg', 'dfg'], help: 'Either input; the order does not matter.' },
  { id: 'bandwidth1Nm', group: 'waves', label: 'Bandwidth of λ₁ (FWHM)', unit: 'nm', value: 2, min: 0, max: 10000,
    when: 'process', whenValue: ['sfg', 'dfg'] },
  { id: 'pumpNm', group: 'waves', label: 'Pump wavelength', unit: 'nm', value: 515, ...SCOPE,
    when: 'process', whenValue: 'opo' },
  { id: 'pumpBandwidthNm', group: 'waves', label: 'Bandwidth of the pump (FWHM)', unit: 'nm', value: 1, min: 0, max: 10000,
    when: 'process', whenValue: 'opo' },
  { id: 'ramanPumpNm', group: 'waves', label: 'Pump wavelength', unit: 'nm', value: 785, ...SCOPE,
    when: 'process', whenValue: 'crs' },
  { id: 'ramanPumpBandwidthNm', group: 'waves', label: 'Bandwidth of the pump (FWHM)', unit: 'nm', value: 1, min: 0, max: 10000,
    when: 'process', whenValue: 'crs' },
  { id: 'wave2Nm', group: 'waves2', label: 'Input wavelength λ₂', unit: 'nm', value: 800, ...SCOPE,
    when: 'process', whenValue: ['sfg', 'dfg'], help: 'For DFG it must differ from λ₁.' },
  { id: 'bandwidth2Nm', group: 'waves2', label: 'Bandwidth of λ₂ (FWHM)', unit: 'nm', value: 2, min: 0, max: 10000,
    when: 'process', whenValue: ['sfg', 'dfg'] },
  { id: 'outputNm', group: 'waves2', label: 'Signal or idler wavelength', unit: 'nm', value: 800, ...SCOPE,
    when: 'process', whenValue: 'opo', help: 'Either output; it must be longer than the pump. The other is solved.' },
  { id: 'outputBandwidthNm', group: 'waves2', label: 'Bandwidth of that output (FWHM)', unit: 'nm', value: 1, min: 0, max: 10000,
    when: 'process', whenValue: 'opo', help: 'Set by the cavity and phase matching, so enter your own; it may exceed the pump’s. 0 for a single line.' },
  { id: 'stokesNm', group: 'waves2', label: 'Stokes wavelength', unit: 'nm', value: 1030, ...SCOPE,
    when: 'process', whenValue: 'crs', help: 'Longer than the pump. The Coherent Raman calculator also solves from a Raman shift.' },
  { id: 'stokesBandwidthNm', group: 'waves2', label: 'Bandwidth of the Stokes beam (FWHM)', unit: 'nm', value: 1, min: 0, max: 10000,
    when: 'process', whenValue: 'crs' },
];
export const CONVERSION_DEFAULTS = defaultsFor(CONVERSION_INPUTS);

const wave = (role, wavelengthNm, generated = false) => ({ role, wavelengthNm, frequencyTHz: C_NM_THZ / wavelengthNm, photonEv: HC_EV_NM / wavelengthNm,
  generated, bandwidthTHz: null, bandwidthNm: null });

// Spectral widths. Every spectrum is a Gaussian in frequency, and a width in
// nm is the FWHM of that curve against wavelength: its half-maximum points
// sit at c/(ν ∓ Δν/2), so Δλ = cΔν/(ν² − Δν²/4), close to cΔν/ν² = λ²Δν/c
// for a narrow spectrum and exact for a broad one. A generated field is a
// product of the input fields (E², E³, E₁E₂, E₁E₂*, E_pE_s* for an OPO
// partner, E_p²E_S* for CARS, E_S²E_p* for CSRS), so for Gaussian spectra
// its frequency FWHM adds in quadrature, each field counted as often as it
// appears: √n Δν for the nth harmonic, √(Δν₁² + Δν₂²) for SFG, DFG and the
// OPO partner, √(2Δν_p² + Δν_S²) for CARS. Phase matching is taken to accept
// the whole spectrum, and the Raman response to be instantaneous.
// widthTHz inverts widthNm in a form that does not cancel for small Δλ.
const widthTHz = (nm, bandwidthNm) => 2 * C_NM_THZ * bandwidthNm / (nm * (nm + Math.hypot(nm, bandwidthNm)));
const widthNm = (thz, nm) => {
  const nu = C_NM_THZ / nm;
  return C_NM_THZ * thz / (nu * nu - thz * thz / 4);
};
// A width counts only while the spectrum keeps clear of zero frequency:
// FWHM below half the centre frequency, so the graph's ±2 FWHM stays above
// ν = 0, where the Gaussian has fallen to about 1e-5. An input at most λ/2
// wide is at most 0.47 ν wide.
const fitsAboveZero = w => w.bandwidthTHz < w.frequencyTHz / 2;

function withWidths(waves, widths) {
  const out = waves.map((w, i) => ({ ...w, bandwidthTHz: widths[i], bandwidthNm: widthNm(widths[i], w.wavelengthNm) }));
  if (out.every(fitsAboveZero)) return { waves: out };
  const bad = out.find(w => !fitsAboveZero(w));
  const name = /^[A-Z]{2}/.test(bad.role) ? bad.role : bad.role[0].toLowerCase() + bad.role.slice(1);
  return { waves, bandwidthNote: `No bandwidths: the ${name} spectrum would reach zero frequency, so a Gaussian width does not describe it. Narrow the inputs or set them to 0.` };
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
    const r = computeCrs({ ...CRS_DEFAULTS, mode: 'pump-stokes', pumpNm: v.ramanPumpNm, stokesNm: v.stokesNm });
    if (!r.ok) return { ok: false, errors: r.errors.map(e => ({ ...e, id: e.id === 'stokesNm' ? 'stokesNm' : 'ramanPumpNm' })) };
    const errors = [inputWidthError('ramanPumpBandwidthNm', 'Bandwidth of the pump', v.ramanPumpNm, v.ramanPumpBandwidthNm),
      inputWidthError('stokesBandwidthNm', 'Bandwidth of the Stokes beam', v.stokesNm, v.stokesBandwidthNm)].filter(Boolean);
    if (errors.length) return { ok: false, errors };
    // CARS is E_p²E_S*, CSRS E_S²E_p*: the field that appears twice counts twice.
    const [wp, ws] = [widthTHz(v.ramanPumpNm, v.ramanPumpBandwidthNm), widthTHz(v.stokesNm, v.stokesBandwidthNm)];
    const csrs = r.csrsNm !== null;
    return { ok: true, process: p, bandwidths: true, ramanShiftCm: r.ramanShiftCm,
      ...withWidths([wave('Pump', r.pumpNm), wave('Stokes', r.stokesNm), wave('CARS (anti-Stokes)', r.antiStokesNm, true),
        ...(csrs ? [wave('CSRS (coherent Stokes)', r.csrsNm, true)] : [])],
      [wp, ws, Math.sqrt(2 * wp * wp + ws * ws), ...(csrs ? [Math.sqrt(2 * ws * ws + wp * wp)] : [])]) };
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
  const widthErrors = [inputWidthError('pumpBandwidthNm', 'Bandwidth of the pump', v.pumpNm, v.pumpBandwidthNm),
    inputWidthError('outputBandwidthNm', 'Bandwidth of that output', v.outputNm, v.outputBandwidthNm)].filter(Boolean);
  if (widthErrors.length) return { ok: false, errors: widthErrors };
  // The known output's width is the user's (cavity, phase matching); the
  // partner is the pump–output difference frequency, E_pE_out*, as in DFG.
  const [wp, wk] = [widthTHz(v.pumpNm, v.pumpBandwidthNm), widthTHz(v.outputNm, v.outputBandwidthNm)];
  const wPartner = Math.hypot(wp, wk);
  const knownIsSignal = v.outputNm <= partnerNm;
  return { ok: true, process: p, bandwidths: true, degenerate, degeneracyNm: 2 * v.pumpNm,
    // Manley–Rowe: of the converted pump power, a fraction λ_p/λ goes to each output.
    signalShare: v.pumpNm / signalNm, idlerShare: v.pumpNm / idlerNm,
    ...withWidths([wave('Pump', v.pumpNm), wave('Signal', signalNm, true), wave('Idler', idlerNm, true)],
      [wp, knownIsSignal ? wk : wPartner, knownIsSignal ? wPartner : wk]) };
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
    for (let k = -SAMPLES_PER_SIDE; k <= SAMPLES_PER_SIDE; k++) {
      const nu = w.frequencyTHz + k * SAMPLE_STEP * w.width;
      if (nu > 0) xs.add(C_NM_THZ / nu);   // computeConversion keeps nu > 0; this keeps x finite regardless
    }
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
