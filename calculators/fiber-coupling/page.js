// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The free space to fiber coupling page: the fiber and the laser, from
// which it designs the lens (lens-choice.js, the figure and graph 1); then a
// real singlet of your choosing, which reads the first panel's last result
// (real-lens.js, graphs 2–4).
import { FIBER_DEFAULTS, SETUP_INPUTS, SINGLE_MODE_V, PARAXIAL_LIMIT_MRAD } from './fiber-coupling.js';
import { computeFiberSetup, focalScan } from './lens-choice.js';
import { REAL_LENS_INPUTS, REAL_LENS_DEFAULTS, computeRealLens, suggestedLensInputs } from './real-lens.js';
import { HIGH_NA, FRESNEL_LIMIT } from '../thin-thick-lens/thick-lens.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';
import { formatNumber } from '../assets/calculator-kit.js';
import { wavelengthToColor } from '../../sketch/js/util.js';

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
    ['From', r.range.shownMinMm, 'mm', 4],
    r.range.shownMaxMm === null ? ['To', 'any longer f'] : ['To', r.range.shownMaxMm, 'mm', 4]];
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
  if (r.focus.input.rayleighMm < 10 * r.optimalFocalMm) out.push('The input beam’s Rayleigh range is not long compared with the focal length: it is not really collimated, and the waist forms well short of f (the ideal thin lens figures account for this).');
  const s = r.suggestion;
  if (!s.ok) out.push(`No plano-convex suggestion: ${s.reason}`);
  else {
    out.push(`The plano-convex lens is a catalogue-style starting point (a usual glass for the wavelength; the smallest common diameter at least twice the beam’s, or failing that the widest at least 1.5 times it), traced through both faces with the fiber at its best position on the axis. Its coupling counts the light its clear diameter clips: ${s.clipShare > 0.9999 ? 'more than 99.99' : formatNumber(percent(s.clipShare), 4)} % of the beam passes. Uncoated, its two faces would reflect another ${formatNumber(percent(s.faceLoss), 2)} %.`);
    if (s.efficiency < 0.9 * s.idealEfficiency) out.push(`Spherical aberration costs this plano-convex lens ${formatNumber(percent(1 - s.efficiency / s.idealEfficiency), 2)} % of the light: an aspheric lens or an achromatic doublet of the same focal length focuses much closer to the ideal.`);
  }
  return out;
}

// ---------------------------------------------------------------- figure
// The beam, the lens and the fiber, schematic (a millimetre beam onto a
// micrometre mode cannot be drawn to scale), in the canvas's colours: the
// beam in its wavelength's, and the matching focal length under it.
const figure = document.getElementById('calc-figure');

function drawFigure(r) {
  figure.classList.toggle('is-stale', !r.ok);
  if (!r.ok) return;
  const v = r.values, beam = wavelengthToColor(v.wavelengthNm);
  const focal = r.optimalFocalMm === null ? 'no lens matches' : `f = ${formatNumber(r.optimalFocalMm, 4)} mm`;
  const label = `Schematic, not to scale: a ${formatNumber(v.wavelengthNm, 5)} nm beam ${formatNumber(v.beamDiameterMm, 4)} mm wide, a lens focusing it onto the fiber’s end${r.optimalFocalMm === null ? '; no lens matches this beam to the mode' : `, at the focal length that matches the mode, ${formatNumber(r.optimalFocalMm, 4)} mm`}.`;
  const text = (x, y, size, anchor, content, cls = 'fig-ink') => `<text class="${cls}" x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}">${content}</text>`;
  // Colours by class, so the figure follows the page's light or dark theme
  // as the canvas does: its background and labels change, the glass, the
  // fiber and the beam's wavelength colour do not.
  figure.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 56 400 204" preserveAspectRatio="xMidYMid meet" font-family="Helvetica, Arial, sans-serif" role="img" aria-label="${label}">
    <polygon points="0,124 200,124 300,138 300,142 200,156 0,156" fill="${beam}" fill-opacity="0.35"/>
    <polyline points="0,124 200,124 300,138" fill="none" stroke="${beam}" stroke-width="2"/>
    <polyline points="0,156 200,156 300,142" fill="none" stroke="${beam}" stroke-width="2"/>
    <path d="M200,72 Q228,140 200,208 Q172,140 200,72 Z" fill="#cfe3f5" stroke="#2b6cb0" stroke-width="3"/>
    <rect x="300" y="133" width="100" height="14" fill="#0ea5e9"/>
    <g class="fig-dim" stroke-width="1" fill="none"><line x1="200" y1="214" x2="200" y2="240"/><line x1="300" y1="150" x2="300" y2="240"/>
      <line x1="204" y1="232" x2="296" y2="232"/><polyline points="209,228 203,232 209,236"/><polyline points="291,228 297,232 291,236"/></g>
    ${text(250, 224, 16, 'middle', focal)}${text(8, 254, 12, 'start', 'Schematic, not to scale', 'fig-muted')}
  </svg>`;
}

let setup = null, lens = null;

// Start the second part from the first part's plano-convex suggestion.
const useSuggested = document.createElement('button');
useSuggested.type = 'button';
useSuggested.className = 'calc-reset';
useSuggested.textContent = 'Use the suggested plano-convex lens';
useSuggested.addEventListener('click', () => {
  const values = suggestedLensInputs(setup);
  if (!values) return;
  const form = document.getElementById('lens-form');
  for (const [id, value] of Object.entries(values)) form.elements[id].value = String(value);
  lens.update();
});

mountCalculator({
  inputs: SETUP_INPUTS, defaults: pick(SETUP_INPUTS), hideInactive: true, charts: ['focal'],
  groups: { laser: { title: 'Laser' }, fiber: { title: 'Fiber', form: 'fiber-form' } },
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
    drawFigure(r);
    useSuggested.disabled = !suggestedLensInputs(r);
    useSuggested.title = !r.ok ? 'Set a valid fiber and laser first.' : useSuggested.disabled ? 'There is no plano-convex suggestion: see the notes above.' : '';
    lens?.update();
  },
});

// ---------------------------------------------------------------- real lenses
// Lengths to micrometre resolution, as on the Thin and thick lens page: in
// mm to 0.001 mm, and in µm, for the focus's few-micrometre sizes, to 0.1 µm.
const roundMm = mm => Math.round(mm * 1e3) / 1e3;
const roundUm = um => (Number.isFinite(um) ? Math.round(um * 10) / 10 : um);
const mmRow = (label, mm) => [label, roundMm(mm), 'mm', 12];
const umRow = (label, um) => [label, roundUm(um), 'µm', 12];
const mmText = mm => `${formatNumber(roundMm(mm), 12)} mm`;
const radius = mm => (mm ? mmText(mm) : 'flat');
const KIND = Object.fromEntries(REAL_LENS_INPUTS.find(i => i.id === 'lensKind').options);

function lensRows(r) {
  const { lens: l, values: v, fiber: f } = r;
  const key = [{ group: `${KIND[v.lensKind]} at ${formatNumber(v.wavelengthNm, 5)} nm` },
    ['Radii R₁ / R₂', `${radius(v.r1Mm)} / ${radius(v.r2Mm)}`],
    ['Centre / edge thickness', `${mmText(v.thicknessMm)} / ${mmText(l.geometry.edgeMm)}`],
    mmRow('Focal length f', l.efl), mmRow('Back focal length (V₂ to F′)', l.bfl),
    ['Focusing NA (1/e² half angle)', l.focusNa, '', 3], umRow('Focused waist, ideal (1/e² radius)', l.ideal.waistUm)];
  if (l.scan.real) key.push(['Singlet Strehl ratio, best plane', l.scan.real.strehl, '', 3]);
  const coupling = [];
  for (const [kind, name] of [['real', 'Singlet'], ['ideal', 'Ideal thin lens, same f']]) {
    if (!f[kind]) continue;
    const k = f[kind], shiftUm = k.shiftMm * 1e3;
    // Under 0.05 µm the search's rounding, not a position.
    coupling.push({ group: name }, Math.abs(roundUm(shiftUm)) < 0.05 ? ['Best fiber position', 'at F′'] : umRow('Best fiber position from F′', shiftUm),
      ['Mode overlap there', percent(k.aligned), '%', 4], ['Coupling efficiency', percent(k.efficiency), '%', 4],
      umRow('Lateral offset that halves it', k.halfLateralUm), ['Tilt that halves it', k.halfTiltMrad, 'mrad', 3]);
  }
  coupling.push({ group: 'Losses' }, ['Light reaching the fiber', percent(f.through), '%', 4]);
  return { 'lens-key': key, 'lens-coupling': coupling };
}

function lensNotes(r) {
  const { lens: l, values: v, fiber: f } = r, out = [];
  if (l.realIssue) out.push(l.realIssue);
  if (l.clipShare < 0.999) out.push(`The clear diameter passes ${formatNumber(percent(l.clipShare), 4)} % of the beam; the rest is lost, and the cut edge spreads the focus.`);
  if (l.rimNa > HIGH_NA) out.push(`The lit pupil reaches NA ${formatNumber(l.rimNa, 3)} at its rim: above ${HIGH_NA}, scalar diffraction ignores polarization, which then matters.`);
  if (l.fresnelNumber < FRESNEL_LIMIT) out.push(`The Fresnel number of the lit pupil, a²/(λf) = ${formatNumber(l.fresnelNumber, 3)}, is below ${FRESNEL_LIMIT}: the focus moves toward the lens from where the Debye integral puts it, so the figures are approximate.`);
  if (l.scan.real?.clipped) out.push('Part of the beam meets the back face outside the clear diameter and is cut there.');
  if (v.spec === 'focal') out.push(`Designed for f = ${formatNumber(v.focalMm, 5)} mm at ${formatNumber(v.wavelengthNm, 5)} nm with a ${formatNumber(v.edgeMm, 4)} mm edge: the radii and centre thickness above.`);
  if (f.axialCut) out.push(`The axial graph stops at ±${formatNumber(f.axialCut.reachMm, 3)} mm instead of ±${formatNumber(f.axialCut.wantedMm, 3)} mm: farther from the focus the defocus varies too fast across the pupil for this page’s sampling.`);
  out.push('The singlet is traced through its two spherical faces; the ideal thin lens of the same focal length obeys the sine condition (an aplanat) and focuses the Gaussian beam to the Gaussian waist. The fiber sits on the axis at each lens’s best position, its axis along the lens’s. The coupling efficiency is the mode overlap times the light reaching the fiber: the beam’s share inside the clear diameter' + (f.values.fresnel ? ', and the transmission of the uncoated lens faces and fiber end.' : '.') + ' Each graph moves the fiber one way only, from that position; the focus is round, so a lateral offset in any direction is the same.');
  return out;
}

function lensGraphs(r) {
  const f = r.fiber;
  const kinds = [['real', 'Singlet', '--series-1'], ['ideal', 'Ideal thin lens, same f', '--series-3']].filter(([k]) => f.scans[k]);
  const plot = (axis, x, label, unit, vlines = []) => ({
    x, xLabel: label, xUnit: unit, yLabel: 'Coupling efficiency (%)', yMin: 0, yMax: 100,
    series: kinds.map(([k, name, color]) => ({ name, color, values: f.scans[k][axis].map(e => (Number.isFinite(e) ? percent(e * f.through) : null)) })),
    vlines, formatX: n => formatNumber(n, 4), formatY: n => formatNumber(n, 4),
  });
  return {
    lateral: plot('lateral', f.scans.lateralUm, 'Lateral offset of the core (µm)', 'µm'),
    axial: plot('axial', f.scans.axialUm, 'Fiber position from F′ (µm)', 'µm', [{ x: 0, label: 'F′' }]),
    tilt: plot('tilt', f.scans.tiltMrad, 'Tilt of the fiber (mrad)', 'mrad'),
  };
}

lens = mountCalculator({
  panel: 'lens', inputs: REAL_LENS_INPUTS, defaults: REAL_LENS_DEFAULTS, hideInactive: true, charts: ['lateral', 'axial', 'tilt'],
  groups: { lens: { title: 'Lens' }, size: { title: 'Dimensions' }, surfaces: { title: 'Surfaces' } },
  compute: raw => computeRealLens(setup, raw), rows: lensRows, notes: lensNotes, graphs: lensGraphs,
});

document.getElementById('lens-actions').prepend(useSuggested);
