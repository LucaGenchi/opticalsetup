// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The thin and thick lens page: a laser and a lens (inputs -> thick-lens.js
// -> the beam figure, results and graphs), then the fiber panel, which reads
// the lens panel's last result.

import {
  LENS_INPUTS, LENS_DEFAULTS, FIBER_INPUTS, FIBER_DEFAULTS, computeThickLens, computeFiber, chromaticScan, beamDiagram, canvasScene,
  HIGH_NA, FRESNEL_LIMIT,
} from './thick-lens.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';
import { formatNumber } from '../assets/calculator-kit.js';
import { buildShareURL } from '../../sketch/js/share.js';
import { SINGLE_MODE_V } from '../fiber-coupling/fiber-coupling.js';

const figure = document.getElementById('preview-figure');
const caption = document.getElementById('preview-caption');
const figureNote = document.getElementById('preview-note');
const openLink = document.getElementById('preview-open');

// A length in mm, shown in µm below 1 mm.
const length = mm => (Math.abs(mm) >= 1 ? [mm, 'mm'] : [mm * 1e3, 'µm']);
const lengthRow = (label, mm, digits) => [label, ...length(mm), digits];
const signed = mm => (Math.abs(mm) < 1e-9 ? '0 mm (at the vertex)' : `${mm < 0 ? '−' : '+'}${formatNumber(Math.abs(mm), 4)} mm`);
const KIND = { ideal: 'Ideal thin lens', planoconvex: 'Plano-convex singlet', biconvex: 'Bi-convex singlet' };
const radius = mm => (mm ? `${formatNumber(mm, 5)} mm` : 'flat');

// The lens and its focus at a glance; the rest of the lens data below.
function rows(r) {
  const { lens, values: v } = r;
  const key = [{ group: `${KIND[v.lensKind]} at ${formatNumber(v.wavelengthNm, 5)} nm` }];
  if (!lens.ideal) {
    key.push(['Radii R₁ / R₂', `${radius(v.r1Mm)} / ${radius(v.r2Mm)}`],
      ['Centre / edge thickness', `${formatNumber(v.thicknessMm, 5)} mm / ${formatNumber(r.geometry.edgeMm, 4)} mm`]);
  }
  key.push(['Focal length f', lens.efl, 'mm'], ['Back focal length (V₂ to F′)', lens.bfl, 'mm']);
  if (r.ideal && !r.beamIssue) key.push(['Focused waist, ideal (1/e² radius)', r.ideal.waistUm, 'µm', 4]);
  if (r.scan?.real) key.push(['Singlet Strehl ratio, best plane', r.scan.real.strehl, '', 3]);

  const out = [{ group: 'Cardinal points and shape' }];
  if (lens.ideal) {
    out.push(['Principal planes', 'H = H′, in the plane of the lens'], ['Focal points', 'f before and after it']);
  } else {
    out.push(['Refractive index n', lens.n, '', 6], ['Focal length, thin-lens formula', lens.thinFocalMm, 'mm'],
      ['Front focal length (F to V₁)', lens.ffl, 'mm'],
      ['Principal plane H from V₁', signed(lens.h1Mm)], ['Principal plane H′ from V₂', signed(lens.h2Mm)],
      ['Shape factor (R₂ + R₁)/(R₂ − R₁)', lens.shape === null ? 'undefined (equal curvatures)' : formatNumber(lens.shape, 4)]);
  }

  const focus = [];
  if (r.ideal) {
    focus.push({ group: 'Gaussian beam, ideal lens' }, ['Focused waist w₀′ (1/e² radius)', r.ideal.waistUm, 'µm', 4],
      lengthRow('Waist after V₂', r.ideal.fromV2Mm, 6), ['Rayleigh range z_R′', r.ideal.rayleighMm * 1e3, 'µm', 4],
      ['Convergence, half angle', r.ideal.halfAngleMrad, 'mrad', 4], ['Share of the beam inside D', 100 * r.clipShare, '%', 6]);
  }
  const s = r.scan;
  if (s) {
    focus.push({ group: 'Through focus' }, ['Ideal lens: spot radius (86.5 %)', s.ideal.bestRadiusUm, 'µm', 4]);
    if (s.real) {
      focus.push(['Singlet: Strehl ratio at F′', s.real.paraxialStrehl, '', 3], ['Singlet: spot radius at F′', s.real.paraxialRadiusUm, 'µm', 4],
        ['Singlet: brightest plane from F′', s.real.bestShiftMm * 1e3, 'µm', 4], ['Singlet: Strehl ratio there', s.real.strehl, '', 3],
        ['Singlet: spot radius there', s.real.bestRadiusUm, 'µm', 4]);
    }
  }
  return { key, lens: out, focus };
}

function notes(r) {
  const out = [];
  for (const issue of [r.beamIssue, r.realIssue]) if (issue) out.push(issue);
  if (r.clipShare !== undefined && r.clipShare < 0.999) out.push(`The clear diameter passes ${formatNumber(100 * r.clipShare, 4)} % of the beam; the rest is lost, and the cut edge spreads the focus.`);
  if (r.rimNa > HIGH_NA) out.push(`The lit pupil reaches NA ${formatNumber(r.rimNa, 3)} at its rim: above ${HIGH_NA}, scalar diffraction ignores polarization, which then matters.`);
  if (r.fresnelNumber < FRESNEL_LIMIT) out.push(`The Fresnel number of the lit pupil, a²/(λf) = ${formatNumber(r.fresnelNumber, 3)}, is below ${FRESNEL_LIMIT}: the focus moves toward the lens from where the Debye integral puts it, so the curves are approximate.`);
  if (r.scan?.real?.clipped) out.push('Part of the beam meets the back face outside the clear diameter and is cut there.');
  const real = r.scan?.real;
  if (real && [real.bestRadiusUm, real.paraxialRadiusUm, ...real.radiusUm].some(x => !Number.isFinite(x))) out.push(`The singlet’s spot grows wider than ${formatNumber(real.radiusLimitUm, 3)} µm, beyond which this page does not integrate it: its radius is left out there.`);
  if (r.values.spec === 'focal' && !r.lens.ideal) out.push(`Designed for f = ${formatNumber(r.values.focalMm, 5)} mm at ${formatNumber(r.values.wavelengthNm, 5)} nm with a ${formatNumber(r.values.edgeMm, 4)} mm edge: the radii and centre thickness above.`);
  if (r.scan) out.push(r.lens.ideal ? 'The ideal lens obeys the sine condition (an aplanat): it focuses the Gaussian beam to the Gaussian waist.' : 'The ideal lens of the same focal length obeys the sine condition (an aplanat) and focuses the Gaussian beam to the Gaussian waist; the singlet is traced through its two spherical faces.');
  return out;
}

const micron = mm => mm * 1e3;
function graphs(r) {
  const s = r.scan, none = { message: r.beamIssue ?? 'No focus to show.' };
  const colour = chromaticScan(r.values, r.lens);
  const out = {
    colour: {
      x: colour.map(p => p.nm), xLabel: 'Wavelength (nm)', xUnit: 'nm', yLabel: 'Focal length (mm)',
      series: r.lens.ideal
        ? [{ name: 'Thin lens of this glass', color: '--series-3', values: colour.map(p => p.thin) }]
        : [
          { name: 'Effective focal length f', color: '--series-1', values: colour.map(p => p.efl) },
          { name: 'Back focal length', color: '--series-1', dash: true, values: colour.map(p => p.bfl) },
          { name: 'Ideal thin lens, same radii', color: '--series-3', values: colour.map(p => p.thin) },
        ],
      // The scale starts near the curves, so their change shows.
      yMin: 0.98 * Math.min(...colour.flatMap(p => [p.efl, p.bfl, p.thin]).filter(Number.isFinite)),
      marker: { x: r.values.wavelengthNm, y: r.lens.efl }, vlines: [{ x: r.values.wavelengthNm, label: `${formatNumber(r.values.wavelengthNm, 5)} nm` }],
      formatX: n => formatNumber(n, 5), formatY: n => formatNumber(n, 5),
    },
  };
  if (!s) return { ...out, beam: none, psf: none };
  const x = s.shiftsMm.map(micron), span = 2 * micron(s.span);
  // Marker lines, F′ first; one within 8 % of the plot of another is left out.
  const lines = marks => {
    const kept = [];
    for (const m of marks) if (m && kept.every(o => Math.abs(o.x - m.x) > 0.08 * span)) kept.push(m);
    return kept;
  };
  const real = s.real;
  out.beam = {
    x, xLabel: 'Distance from F′ (µm)', xUnit: 'µm', yLabel: 'Spot radius, 86.5 % (µm)', yMin: 0,
    series: [
      { name: 'Singlet', color: '--series-1', values: real ? real.radiusUm : x.map(() => null) },
      { name: 'Ideal thin lens', color: '--series-3', values: s.ideal.radiusUm },
    ],
    vlines: lines([{ x: 0, label: 'F′' }, real && { x: micron(real.bestShiftMm), label: 'singlet brightest' }]),
    formatX: n => formatNumber(n, 4), formatY: n => formatNumber(n, 4),
  };
  // Across the focus: out to three ideal waists, or twice the singlet's
  // spot (its whole reach when the spot is wider), on a symmetric grid.
  const spot = real ? (Number.isFinite(real.bestRadiusUm) ? 2 * real.bestRadiusUm : real.radiusLimitUm) : 0;
  const ideal = s.ideal.model, reach = Math.min(Math.max(3 * r.ideal.waistUm, spot), s.ideal.radiusLimitUm, real ? real.radiusLimitUm : Infinity);
  const radii = Array.from({ length: 161 }, (_, i) => -reach + 2 * reach * i / 160);
  const relative = (model, plane) => radii.map(u => model.intensity(plane, Math.abs(u) * 1e-3) * model.norm / ideal.norm);
  out.psf = {
    x: radii, xLabel: 'Distance from the axis (µm)', xUnit: 'µm', yLabel: 'Intensity (ideal peak = 1)', yMin: 0,
    series: [
      { name: 'Singlet, brightest plane', color: '--series-1', values: real ? relative(real.model, real.atBest) : radii.map(() => null) },
      { name: 'Singlet at F′', color: '--series-1', dash: true, values: real ? relative(real.model, real.atParaxial) : radii.map(() => null) },
      { name: 'Ideal thin lens', color: '--series-3', values: relative(ideal, s.ideal.atBest) },
    ],
    formatX: n => formatNumber(n, 4), formatY: n => formatNumber(n, 4),
  };
  return out;
}

// ---------------------------------------------------------------- figure
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const BEAM = '#d9480f';

function diagramSVG(g) {
  const [lo, hi] = g.z, W = hi - lo, font = W / 30, H = Math.max(2 * g.yMax + 3 * font, 0.3 * W);
  const u = W / 400, Y = y => -y;
  const pts = p => p.map(([z, y]) => `${z.toFixed(4)},${Y(y).toFixed(4)}`).join(' ');
  let body = `<rect x="${lo}" y="${-H / 2}" width="${W}" height="${H}" fill="#ffffff"/>`;
  body += `<defs><clipPath id="diagram-clip"><rect x="${lo}" y="${-H / 2}" width="${W}" height="${H}"/></clipPath></defs><g clip-path="url(#diagram-clip)">`;
  body += `<line x1="${lo}" y1="0" x2="${hi}" y2="0" stroke="#8a93a3" stroke-width="${u}" stroke-dasharray="${4 * u} ${3 * u}"/>`;
  // The beam's rays under the lens, so the outline stays legible.
  for (const ray of g.rays) body += `<polyline points="${pts(ray)}" fill="none" stroke="${BEAM}" stroke-width="${1.1 * u}" stroke-linejoin="round" opacity="0.85"/>`;
  if (g.outline) body += `<polygon points="${pts(g.outline)}" fill="#cfe3f5" fill-opacity="0.75" stroke="#2b6cb0" stroke-width="${u}"/>`;
  else {
    // An ideal lens: a line across the clear diameter with arrowheads.
    const z = g.marks.H, d = g.halfDiameter, a = 4 * u;
    body += `<g stroke="#2b6cb0" stroke-width="${2 * u}" fill="none"><line x1="${z}" y1="${-d}" x2="${z}" y2="${d}"/>`
      + `<polyline points="${z - a},${-d + a} ${z},${-d} ${z + a},${-d + a}"/><polyline points="${z - a},${d - a} ${z},${d} ${z + a},${d - a}"/></g>`;
  }
  // Principal planes (a singlet's), and focal points.
  if (g.outline) {
    const apart = Math.abs(g.marks.H2 - g.marks.H) > 2 * font;
    const order = g.marks.H <= g.marks.H2 ? 1 : -1;
    for (const [key, label, side] of [['H', 'H', -order], ['H2', 'H′', order]]) {
      const z = g.marks[key];
      const anchor = apart ? 'middle' : side < 0 ? 'end' : 'start';
      body += `<line x1="${z}" y1="${-g.yMax}" x2="${z}" y2="${g.yMax}" stroke="#5b6475" stroke-width="${0.7 * u}" stroke-dasharray="${2 * u} ${2 * u}"/>`;
      body += `<text x="${z + (apart ? 0 : side * font * 0.2)}" y="${-g.yMax - font * 0.3}" font-size="${font}" fill="#2b3240" text-anchor="${anchor}">${label}</text>`;
    }
  }
  for (const [key, label] of [['F', 'F'], ['F2', 'F′']]) {
    const z = g.marks[key];
    body += `<circle cx="${z}" cy="0" r="${2.2 * u}" fill="#2b3240"/><text x="${z}" y="${font * 1.2}" font-size="${font}" fill="#2b3240" text-anchor="middle">${label}</text>`;
  }
  body += '</g>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${lo} ${-H / 2} ${W} ${H}" font-family="Helvetica, Arial, sans-serif" role="img" aria-label="${esc(caption.textContent)}">${body}</svg>`;
}

let shareToken = 0;
function drawFigure(r) {
  figure.classList.toggle('is-stale', !r.ok);
  if (!r.ok) {
    caption.textContent = 'The figure shows the last valid lens: correct the inputs to update it.';
    openLink.setAttribute('aria-disabled', 'true');
    return;
  }
  const g = beamDiagram(r);
  const lensText = r.lens.ideal ? 'the ideal lens (its principal planes in its plane)' : g.outline ? 'the lens, its principal planes H and H′' : 'the lens (its faces cross at this diameter, so it is drawn as a thin-lens line at H)';
  caption.textContent = `To scale, in the plane of the axis: ${lensText}, its focal points F and F′, and rays of the laser beam at a third, two thirds and all of its 1/e² radius${r.lens.ideal || !g.outline ? ', bent toward F′' : ', traced through both faces: the outer ones cross the axis before F′ (spherical aberration)'}.`;
  figure.innerHTML = diagramSVG(g);
  const scene = canvasScene(r.values, r.lens);
  figureNote.textContent = scene.ok ? scene.note : `The canvas’s ${r.lens.ideal ? 'Lens' : 'Thick spherical lens'} cannot hold this one: ${scene.reasons.join('; ')}.`;
  const token = ++shareToken;
  openLink.setAttribute('aria-disabled', 'true');
  if (!scene.ok) return;
  buildShareURL(JSON.stringify(scene.scene), new URL('../../sketch/', window.location.href).href)
    .then(url => { if (token === shareToken) { openLink.href = url; openLink.removeAttribute('aria-disabled'); } })
    .catch(() => { if (token === shareToken) openLink.removeAttribute('href'); });
}

// ---------------------------------------------------------------- fiber
let lensResult = null, fiber = null;

function fiberRows(f) {
  const mode = [{ group: `Mode-field diameter ${formatNumber(f.values.mfdUm, 4)} µm` }, ['Far-field half angle θ₀ (1/e²)', f.theta * 1e3, 'mrad', 4]];
  if (f.mode) mode.push(['V number', f.mode.vNumber, '', 4], ['Cutoff wavelength', f.mode.cutoffNm, 'nm', 4], ['Single-mode here', f.mode.singleMode ? 'yes' : 'no: LP₁₁ is guided too']);
  mode.push(['Light reaching the fiber', 100 * f.through, '%', 4]);
  const coupling = [];
  for (const [kind, name] of [['real', 'Singlet'], ['ideal', 'Ideal thin lens']]) {
    if (!f[kind]) continue;
    const k = f[kind], shiftUm = k.shiftMm * 1e3;
    // Below a nanometre the search's rounding, not a position.
    coupling.push({ group: name }, Math.abs(shiftUm) < 1e-3 ? ['Best fiber position', 'at F′'] : ['Best fiber position from F′', shiftUm, 'µm', 4],
      ['Mode overlap there', 100 * k.aligned, '%', 4], ['Coupling efficiency', 100 * k.efficiency, '%', 4],
      ['Lateral offset that halves it', k.halfLateralUm, 'µm', 3], ['Tilt that halves it', k.halfTiltMrad, 'mrad', 3]);
  }
  return { 'fiber-mode': mode, 'fiber-coupling': coupling };
}

function fiberNotes(f) {
  const out = [];
  if (f.mode && !f.mode.singleMode) out.push(`V = ${formatNumber(f.mode.vNumber, 4)} is above ${formatNumber(SINGLE_MODE_V, 4)}: at this wavelength the fiber also guides LP₁₁. The coupling here is into the fundamental mode only.`);
  out.push('The fiber sits on the axis at each lens’s best position, its axis along the lens’s. The coupling efficiency is the mode overlap times the light reaching the fiber: the beam’s share inside the clear diameter' + (f.values.fresnel ? ', and the transmission of the uncoated lens faces and fiber end.' : '.') + ' Each graph moves the fiber one way only, from that position; the focus is round, so a lateral offset in any direction is the same.');
  return out;
}

function fiberGraphs(f) {
  const kinds = [['real', 'Singlet', '--series-1'], ['ideal', 'Ideal thin lens', '--series-3']].filter(([k]) => f.scans[k]);
  const plot = (axis, x, label, unit, vlines = []) => ({
    x, xLabel: label, xUnit: unit, yLabel: 'Coupling efficiency (%)', yMin: 0, yMax: 100,
    series: kinds.map(([k, name, color]) => ({ name, color, values: f.scans[k][axis].map(e => (Number.isFinite(e) ? 100 * e * f.through : null)) })),
    vlines, formatX: n => formatNumber(n, 4), formatY: n => formatNumber(n, 4),
  });
  return {
    lateral: plot('lateral', f.scans.lateralUm, 'Lateral offset of the core (µm)', 'µm'),
    axial: plot('axial', f.scans.axialUm, 'Fiber position from F′ (µm)', 'µm', [{ x: 0, label: 'F′' }]),
    tilt: plot('tilt', f.scans.tiltMrad, 'Tilt of the fiber (mrad)', 'mrad'),
  };
}

mountCalculator({
  inputs: LENS_INPUTS, defaults: LENS_DEFAULTS, hideInactive: true, charts: ['beam', 'psf', 'colour'],
  groups: { laser: { title: 'Laser' }, lens: { title: 'Lens' }, size: { title: 'Dimensions' } },
  compute: computeThickLens, rows, notes, graphs,
  onResult: r => { drawFigure(r); lensResult = r; fiber?.update(); },
});

fiber = mountCalculator({
  panel: 'fiber', inputs: FIBER_INPUTS, defaults: FIBER_DEFAULTS, hideInactive: true, charts: ['lateral', 'axial', 'tilt'],
  groups: { fiber: { title: 'Fiber' } },
  compute: raw => computeFiber(lensResult, raw), rows: fiberRows, notes: fiberNotes, graphs: fiberGraphs,
});
