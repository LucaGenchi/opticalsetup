// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The fiber coupling page: the fiber and the laser, from which it designs
// the lens (lens-choice.js, graph 1); then a lens of any focal length and
// its alignment, which reads the first panel's last result (graphs 2–4).
import { FIBER_DEFAULTS, SETUP_INPUTS, LENS_INPUTS, computeFiberCoupling, couplingScan, SINGLE_MODE_V, PARAXIAL_LIMIT_MRAD } from './fiber-coupling.js';
import { computeFiberSetup, focalScan, matchingLensInput } from './lens-choice.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';
import { formatNumber } from '../assets/calculator-kit.js';

const percent = eta => 100 * eta;
const pick = inputs => Object.fromEntries(inputs.map(i => [i.id, FIBER_DEFAULTS[i.id]]));

// ---------------------------------------------------------------- the lens to use
function modeRows(r) {
  const v = r.values;
  return [{ group: 'The fiber mode' },
    ['Mode-field diameter', r.mode.modeFieldDiameterUm, 'µm', 4],
    ...(v.fiberMode === 'step' ? [['V number', r.mode.vNumber, '', 4], ['Single-mode cutoff wavelength', r.mode.cutoffNm, 'nm', 5],
      ['Single-mode here', r.mode.singleMode ? 'yes' : 'no: LP₁₁ is guided too']] : []),
    ['Mode divergence, half angle', r.modeDivergenceMrad, 'mrad', 4]];
}

function setupRows(r) {
  const out = { mode: modeRows(r) };
  if (r.optimalFocalMm === null) {
    out.ideal = [{ group: 'The ideal lens' }, ['Focal length that matches the mode', 'none: the beam is not larger than the mode']];
    return out;
  }
  const f = r.focus;
  out.ideal = [{ group: 'The ideal thin lens' },
    ['Focal length that matches the mode', r.optimalFocalMm, 'mm', 4],
    ['Spot diameter at the waist (1/e²)', 2 * f.beam.waistUm, 'µm', 4],
    ['Waist distance after the lens', f.distanceMm, 'mm', 6],
    ['Convergence, half angle', f.beam.halfDivergenceMrad, 'mrad', 4],
    ['Rayleigh range of the input beam', f.input.rayleighMm / 1000, 'm', 4],
    { group: `Focal lengths that keep ${formatNumber(percent(r.range.eta), 3)} % or more` },
    ['From', r.range.minMm, 'mm', 4],
    r.range.maxMm === null ? ['To', 'any longer f'] : ['To', r.range.maxMm, 'mm', 4]];
  const s = r.suggestion;
  out.planoconvex = s.ok
    ? [{ group: `Plano-convex, ${s.name}, curved side toward the laser` },
      ['Focal length f', r.optimalFocalMm, 'mm', 4], ['Radius of the curved face', s.radiusMm, 'mm', 4],
      ['Clear diameter', s.diameterMm, 'mm', 4], ['Centre / edge thickness', `${formatNumber(s.thicknessMm, 4)} / ${formatNumber(s.edgeMm, 3)} mm`],
      ['Back focal length (flat face to F′)', s.bflMm, 'mm', 4],
      { group: 'Traced, with its spherical aberration' },
      ['Strehl ratio, best plane', s.strehl, '', 3],
      ['Best fiber position', `${formatNumber(Math.abs(s.shiftMm * 1e3), 3)} µm ${s.shiftMm < 0 ? 'before' : 'after'} F′`],
      ['Coupling efficiency there', percent(s.efficiency), '%', 3],
      ['Through an ideal lens, same model', percent(s.idealEfficiency), '%', 3]]
    : [{ group: 'Plano-convex lens' }, ['Suggestion', 'none: see the note below']];
  return out;
}

function setupNotes(r) {
  const v = r.values, out = [];
  if (v.fiberMode === 'step') {
    out.push('Mode-field diameter from Marcuse’s fit for an ideal step-index core. A real fiber’s datasheet value (usually the Petermann II diameter) can differ from it by more than the fit’s 1 %; prefer the datasheet value when you have it.');
    if (!r.mode.singleMode) out.push(`V = ${formatNumber(r.mode.vNumber, 4)} is above ${formatNumber(SINGLE_MODE_V, 4)}: at this wavelength the fiber also guides LP₁₁. The efficiencies here are into the fundamental mode only.`);
  }
  if (r.optimalFocalMm === null) {
    out.push('A positive lens only makes the beam smaller: with the beam no wider than the mode, none matches it. Expand the beam first, or choose a fiber with a smaller mode.');
    return out;
  }
  out.push('The ideal thin lens focuses the beam exactly to the mode: 100 % for a perfectly Gaussian mode, before the Fresnel reflection at the fiber face (about 3.4 % for uncoated silica).');
  if (r.range.paraxialCut) out.push(`Shorter focal lengths would still match the mode to ${formatNumber(percent(r.range.eta), 3)} %, but focus steeper than ${formatNumber(PARAXIAL_LIMIT_MRAD / 1000, 3)} rad (half angle), outside the paraxial model this page rests on: the range starts at that limit.`);
  const ideal = matchingLensInput(r);
  if (!ideal.ok) out.push(`The second part cannot take the matching focal length (${formatNumber(ideal.focalMm, 4)} mm): ${ideal.reason}`);
  if (r.focus.input.rayleighMm < 10 * r.optimalFocalMm) out.push('The input beam’s Rayleigh range is not long compared with the focal length: it is not really collimated, and the waist forms well short of f (the ideal thin lens figures account for this).');
  const s = r.suggestion;
  if (!s.ok) out.push(`No plano-convex suggestion: ${s.reason}`);
  else {
    out.push(`The plano-convex lens is a catalogue-style starting point (a usual glass for the wavelength; the smallest common diameter at least twice the beam’s, or failing that the widest at least 1.5 times it), traced through both faces with the fiber at its best position on the axis. Its coupling counts the light its clear diameter clips: ${s.clipShare > 0.9999 ? 'more than 99.99' : formatNumber(percent(s.clipShare), 4)} % of the beam passes. Uncoated, its two faces would reflect another ${formatNumber(percent(s.faceLoss), 2)} %.`);
    if (s.efficiency < 0.9 * s.idealEfficiency) out.push(`Spherical aberration costs this plano-convex lens ${formatNumber(percent(1 - s.efficiency / s.idealEfficiency), 2)} % of the light: an aspheric lens or an achromatic doublet of the same focal length focuses much closer to the ideal.`);
  }
  return out;
}

let setup = null, lens = null;

// Start the second part's lens from the design: the matching focal length.
const useIdeal = document.createElement('button');
useIdeal.type = 'button';
useIdeal.className = 'calc-reset';
useIdeal.textContent = 'Use the matching focal length';
useIdeal.addEventListener('click', () => {
  const ideal = setup && matchingLensInput(setup);
  if (!ideal?.ok) return;
  document.getElementById('lens-form').elements.focalMm.value = String(ideal.focalMm);
  lens.update();
});

mountCalculator({
  inputs: SETUP_INPUTS, defaults: pick(SETUP_INPUTS), hideInactive: true, charts: ['focal'],
  groups: { fiber: { title: 'Fiber' }, laser: { title: 'Laser' } },
  compute: computeFiberSetup, rows: setupRows, notes: setupNotes,
  graphs: r => {
    if (r.optimalFocalMm === null) return { focal: { message: 'No lens matches a beam that is not larger than the mode.' } };
    const scan = focalScan(r);
    return {
      focal: { x: scan.map(p => p.x), xLabel: 'Lens focal length f (mm)', xUnit: 'mm', yLabel: 'Mode matching (%)', yMin: 0, yMax: 100,
        series: [{ name: 'Ideal thin lens', color: '--series-1', values: scan.map(p => (p.efficiency === null ? null : percent(p.efficiency))) }],
        vlines: [{ x: r.optimalFocalMm, label: 'matched' }], marker: { x: r.optimalFocalMm, y: 100 },
        formatX: n => formatNumber(n, 4), formatY: n => formatNumber(n, 4) },
    };
  },
  onResult: r => {
    setup = r;
    const ideal = matchingLensInput(r);
    useIdeal.disabled = !ideal?.ok;
    useIdeal.title = !r.ok ? 'Set a valid fiber and laser first.' : !ideal ? 'No lens matches the mode: see the notes above.'
      : ideal.ok ? `Set f = ${formatNumber(ideal.focalMm, 4)} mm` : 'The second part cannot take the matching focal length: see the notes above.';
    lens?.update();
  },
});

// ---------------------------------------------------------------- your lens
function lensRows(r) {
  const v = r.values, f = r.focus;
  const misaligned = v.lateralOffsetUm !== 0 || v.axialOffsetUm !== 0 || v.tiltMrad !== 0;
  return {
    'lens-focus': [{ group: 'The focused beam' },
      ['Spot diameter at the waist (1/e²)', 2 * r.focusWaistUm, 'µm', 4],
      ['Waist distance after the lens', r.focusDistanceMm, 'mm', 6],
      ['Depth of focus 2z_R′', 2 * f.beam.rayleighMm * 1e3, 'µm', 4],
      ['Convergence, half angle', f.beam.halfDivergenceMrad, 'mrad', 4]],
    'lens-coupling': [{ group: 'Mode matching' },
      ['With this lens', percent(r.matchEfficiency), '%', 4], ['Loss from mode mismatch', r.matchLossDb, 'dB', 3],
      ...(misaligned ? [{ group: 'With the misalignments set' }, ['Coupling efficiency', percent(r.efficiency), '%', 4],
        r.lossDb <= 300 ? ['Coupling loss', r.lossDb, 'dB', 3] : ['Coupling loss', 'more than 300 dB: nothing couples']] : []),
      { group: 'Alignment that costs 1 dB more' },
      ['Lateral offset', r.tolerance.lateralUm, 'µm', 3], ['Axial offset (either way)', r.tolerance.axialUm, 'µm', 3], ['Tilt', r.tolerance.tiltMrad, 'mrad', 3]],
  };
}

function lensNotes(r) {
  const v = r.values, out = [];
  out.push('An ideal thin lens with the fiber and laser above: the overlap of the TEM₀₀ beam with the Gaussian mode on the fiber face. Fresnel reflection and lens aberrations come on top.');
  if (r.optimalFocalMm && Math.abs(v.focalMm / r.optimalFocalMm - 1) > 0.05) out.push(`A ${formatNumber(r.optimalFocalMm, 4)} mm lens would match the mode exactly, as above.`);
  if (r.focus.beam.halfDivergenceMrad > 100) out.push('The focused beam converges faster than 0.1 rad: beyond the paraxial approximation, and beyond the acceptance of most single-mode fibers.');
  out.push('The lateral offset is where the beam’s centre meets the fiber face; the tilt lies in the same plane, positive when the beam travels away from the axis on the offset side. With an offset and a focus error, the sign of the tilt matters.');
  out.push('The 1 dB alignment figures move one axis at a time from perfect alignment. Each graph below varies one quantity with the others as set.');
  return out;
}

lens = mountCalculator({
  panel: 'lens', inputs: LENS_INPUTS, defaults: pick(LENS_INPUTS), charts: ['lateral', 'axial', 'tilt'],
  groups: { lens: { title: 'Lens' }, align: { title: 'Alignment' } },
  compute: raw => (setup?.ok ? computeFiberCoupling({ ...setup.raw, ...raw }) : { pending: true, message: 'Set a valid fiber and laser above first.' }),
  rows: lensRows, notes: lensNotes,
  graphs: r => {
    const chart = (key, xLabel, xUnit, x0) => {
      const scan = couplingScan(r, key);
      return { x: scan.map(p => p.x), xLabel, xUnit, yLabel: 'Coupling efficiency (%)', yMin: 0, yMax: 100,
        series: [{ name: 'Efficiency', color: '--series-1', values: scan.map(p => percent(p.efficiency)) }],
        marker: { x: x0, y: percent(r.efficiency) }, formatX: n => formatNumber(n, 4), formatY: n => formatNumber(n, 4) };
    };
    const v = r.values;
    return {
      lateral: chart('lateralOffsetUm', 'Lateral offset (µm)', 'µm', v.lateralOffsetUm),
      axial: chart('axialOffsetUm', 'Axial offset from the focus (µm)', 'µm', v.axialOffsetUm),
      tilt: chart('tiltMrad', 'Tilt, positive away from the axis (mrad)', 'mrad', v.tiltMrad),
    };
  },
});

document.getElementById('lens-actions').prepend(useIdeal);
