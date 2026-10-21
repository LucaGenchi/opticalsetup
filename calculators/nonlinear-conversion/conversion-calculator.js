// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Vacuum-wavelength energy conservation for the common nonlinear processes.
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
  { id: 'wave1Nm', group: 'waves', label: 'Input wavelength λ₁', unit: 'nm', value: 800, ...SCOPE,
    when: 'process', whenValue: ['sfg', 'dfg'], help: 'Either input; the order does not matter.' },
  { id: 'wave2Nm', group: 'waves', label: 'Input wavelength λ₂', unit: 'nm', value: 1040, ...SCOPE,
    when: 'process', whenValue: ['sfg', 'dfg'], help: 'For DFG it must differ from λ₁.' },
  { id: 'pumpNm', group: 'waves', label: 'Pump wavelength', unit: 'nm', value: 1030, ...SCOPE,
    when: 'process', whenValue: ['opo', 'crs'], help: 'Vacuum wavelength of the pump.' },
  { id: 'outputNm', group: 'waves', label: 'Signal or idler wavelength', unit: 'nm', value: 1550, ...SCOPE,
    when: 'process', whenValue: 'opo', help: 'Either output; it must be longer than the pump. The other is solved.' },
  { id: 'stokesNm', group: 'waves', label: 'Stokes wavelength', unit: 'nm', value: 1458, ...SCOPE,
    when: 'process', whenValue: 'crs', help: 'Longer than the pump. The Coherent Raman calculator also solves from a Raman shift.' },
];
export const CONVERSION_DEFAULTS = defaultsFor(CONVERSION_INPUTS);

const wave = (role, wavelengthNm) => ({ role, wavelengthNm, frequencyTHz: C_NM_THZ / wavelengthNm, photonEv: HC_EV_NM / wavelengthNm });

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
    return { ok: true, process: p, waves: [wave('Fundamental', fundamentalNm), wave(name, fundamentalNm / order)] };
  }
  if (p === 'sfg' || p === 'dfg') {
    const [shortNm, longNm] = [v.wave1Nm, v.wave2Nm].sort((a, b) => a - b);
    if (p === 'dfg' && !(longNm > shortNm)) return unavailable('DFG needs two different input wavelengths.', 'wave1Nm', 'wave2Nm');
    const outNm = p === 'sfg' ? mixWavelength('sfg', v.wave1Nm, v.wave2Nm) : differenceNm(shortNm, longNm);
    if (outNm === null) return unavailable('The output wavelength is not a finite number for these inputs.', 'wave1Nm', 'wave2Nm');
    return { ok: true, process: p, waves: [wave('Input λ₁', v.wave1Nm), wave('Input λ₂', v.wave2Nm),
      wave(p === 'sfg' ? 'Sum frequency' : 'Difference frequency', outNm)] };
  }
  if (p === 'crs') {
    // Two-color CARS and CSRS from the Coherent Raman calculator itself, so
    // both pages decline the same inputs; its field names map onto ours.
    const r = computeCrs({ ...CRS_DEFAULTS, mode: 'pump-stokes', pumpNm: v.pumpNm, stokesNm: v.stokesNm });
    if (!r.ok) return { ok: false, errors: r.errors.map(e => ({ ...e, id: e.id === 'stokesNm' ? 'stokesNm' : 'pumpNm' })) };
    return { ok: true, process: p, ramanShiftCm: r.ramanShiftCm,
      waves: [wave('Pump', r.pumpNm), wave('Stokes', r.stokesNm), wave('CARS (anti-Stokes)', r.antiStokesNm),
        ...(r.csrsNm === null ? [] : [wave('CSRS (coherent Stokes)', r.csrsNm)])] };
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
    waves: [wave('Pump', v.pumpNm), wave('Signal', signalNm), wave('Idler', idlerNm)] };
}
