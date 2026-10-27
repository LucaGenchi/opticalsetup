// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { FIBER_INPUTS, FIBER_DEFAULTS, computeFiberCoupling, couplingScan, SINGLE_MODE_V } from './fiber-coupling.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';
import { formatNumber } from '../assets/calculator-kit.js';

const percent = eta => 100 * eta;

mountCalculator({ inputs: FIBER_INPUTS, defaults: FIBER_DEFAULTS, groups: {
  laser: { title: 'Laser and lens' }, fiber: { title: 'Fiber', form: 'fiber-form' }, align: { title: 'Alignment', form: 'fiber-form' },
}, compute: computeFiberCoupling, hideInactive: true,
  rows: r => {
    const v = r.values, f = r.focus;
    const misaligned = v.lateralOffsetUm !== 0 || v.axialOffsetUm !== 0 || v.tiltMrad !== 0;
    return {
      focus: [{ group: 'The focused beam' },
        ['Spot diameter at the waist (1/e²)', 2 * r.focusWaistUm, 'µm', 4],
        ['Waist distance after the lens', r.focusDistanceMm, 'mm', 6],
        ['Depth of focus 2z_R′', 2 * f.beam.rayleighMm * 1e3, 'µm', 4],
        ['Convergence, half angle', f.beam.halfDivergenceMrad, 'mrad', 4],
        ['Rayleigh range of the input beam', f.input.rayleighMm / 1000, 'm', 4]],
      mode: [{ group: 'The fiber mode' },
        ['Mode-field diameter', r.mode.modeFieldDiameterUm, 'µm', 4],
        ...(v.fiberMode === 'step' ? [['V number', r.vNumber, '', 4], ['Single-mode cutoff wavelength', r.cutoffNm, 'nm', 5],
          ['Single-mode here', r.mode.singleMode ? 'yes' : 'no: LP₁₁ is guided too']] : []),
        ['Mode divergence, half angle', r.modeDivergenceMrad, 'mrad', 4]],
      calc: [{ group: 'Lens choice' },
        r.optimalFocalMm ? ['Focal length that matches the mode', r.optimalFocalMm, 'mm', 4] : ['Focal length that matches the mode', 'none: the beam is not larger than the mode'],
        ['Mode matching with this lens', percent(r.matchEfficiency), '%', 4], ['Loss from mode mismatch', r.matchLossDb, 'dB', 3],
        ...(misaligned ? [{ group: 'With the misalignments set' }, ['Coupling efficiency', percent(r.efficiency), '%', 4],
          r.lossDb <= 300 ? ['Coupling loss', r.lossDb, 'dB', 3] : ['Coupling loss', 'more than 300 dB: nothing couples']] : []),
        { group: 'Alignment that costs 1 dB more' },
        ['Lateral offset', r.tolerance.lateralUm, 'µm', 3], ['Axial offset (either way)', r.tolerance.axialUm, 'µm', 3], ['Tilt', r.tolerance.tiltMrad, 'mrad', 3]],
    };
  },
  notes: r => {
    const v = r.values, out = [];
    out.push('Overlap of a TEM₀₀ beam with a Gaussian approximation of the fiber’s fundamental mode, on the fiber face. Fresnel reflection at an uncoated face (about 3.4 % for silica, 0.15 dB) and lens aberrations come on top.');
    if (v.fiberMode === 'step') {
      out.push('Mode-field diameter from Marcuse’s fit for an ideal step-index core. A real fiber’s datasheet value (usually the Petermann II diameter) can differ from it by more than the fit’s 1 %; prefer the datasheet value when you have it.');
      if (!r.mode.singleMode) out.push(`V = ${formatNumber(r.vNumber, 4)} is above ${formatNumber(SINGLE_MODE_V, 4)}: at this wavelength the fiber also guides LP₁₁. The efficiency here is into the fundamental mode only.`);
    }
    if (r.optimalFocalMm && Math.abs(v.focalMm / r.optimalFocalMm - 1) > 0.05) out.push(`A ${formatNumber(r.optimalFocalMm, 3)} mm lens would match the mode exactly (100 % for a perfect Gaussian mode).`);
    if (r.focus.beam.halfDivergenceMrad > 100) out.push('The focused beam converges faster than 0.1 rad: beyond the paraxial approximation, and beyond the acceptance of most single-mode fibers.');
    if (r.focus.input.rayleighMm < 10 * v.focalMm) out.push('The input beam’s Rayleigh range is not long compared with the focal length: it is not really collimated, and the waist forms well short of f (the page accounts for this).');
    out.push('The lateral offset is where the beam’s centre meets the fiber face; the tilt lies in the same plane, positive when the beam travels away from the axis on the offset side. With an offset and a focus error, the sign of the tilt matters.');
    out.push('The 1 dB alignment figures move one axis at a time from perfect alignment. Each graph below varies one quantity with the others as set.');
    return out;
  },
  graphs: r => {
    const chart = (key, xLabel, xUnit, x0, vlines = []) => {
      const scan = couplingScan(r, key);
      return { x: scan.map(p => p.x), xLabel, xUnit, yLabel: 'Coupling efficiency (%)', yMin: 0, yMax: 100,
        series: [{ name: 'Efficiency', color: '--series-1', values: scan.map(p => (p.efficiency === null ? null : percent(p.efficiency))) }],
        vlines, marker: { x: x0, y: percent(r.efficiency) },
        formatX: n => formatNumber(n, 4), formatY: n => formatNumber(n, 4) };
    };
    const v = r.values;
    return {
      focal: chart('focalMm', 'Lens focal length f (mm)', 'mm', v.focalMm, r.optimalFocalMm ? [{ x: r.optimalFocalMm, label: 'matched' }] : []),
      lateral: chart('lateralOffsetUm', 'Lateral offset (µm)', 'µm', v.lateralOffsetUm),
      axial: chart('axialOffsetUm', 'Axial offset from the focus (µm)', 'µm', v.axialOffsetUm),
      tilt: chart('tiltMrad', 'Tilt, positive away from the axis (mrad)', 'mrad', v.tiltMrad),
    };
  },
});
