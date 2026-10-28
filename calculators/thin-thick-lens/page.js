// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The thin and thick lens page: inputs -> thick-lens.js -> the ray diagram,
// results and graphs.

import { LENS_INPUTS, LENS_DEFAULTS, computeThickLens, chromaticScan, rayDiagram, canvasScene, HIGH_NA, FRESNEL_LIMIT } from './thick-lens.js';
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

function rows(r) {
  const { lens, image, thin, values: v } = r;
  const key = [{ group: 'At a glance' }, ['Focal length f', lens.efl, 'mm'], ['Back focal length (V₂ to F′)', lens.bfl, 'mm']];
  key.push(image.atInfinity ? ['Image', 'at infinity'] : [image.real ? 'Image after V₂' : 'Virtual image, before V₂', Math.abs(image.fromV2), 'mm'],
    ...(image.atInfinity ? [] : [['Magnification m', image.magnification, '', 4]]));
  if (r.ideal && !r.beamIssue) key.push(['Focused waist, ideal (1/e² radius)', r.ideal.waistUm, 'µm', 4]);
  if (r.scan?.real) key.push(['Singlet Strehl ratio, best plane', r.scan.real.strehl, '', 3], ['Fiber coupling, singlet (best position)', 100 * r.scan.real.bestCoupling, '%', 3]);

  const out = [{ group: `At ${formatNumber(v.wavelengthNm, 5)} nm` }, ['Refractive index n', lens.n, '', 6],
    ['Focal length f, thick lens', lens.efl, 'mm'],
    ['Focal length, thin-lens formula', lens.thinFocalMm, 'mm'],
    ['Power 1/f', 1000 / lens.efl, 'D', 4],
    ['Back focal length (V₂ to F′)', lens.bfl, 'mm'], ['Front focal length (F to V₁)', lens.ffl, 'mm'],
    ['Principal plane H from V₁', signed(lens.h1Mm)], ['Principal plane H′ from V₂', signed(lens.h2Mm)],
    ['Shape factor (R₂ + R₁)/(R₂ − R₁)', lens.shape === null ? 'undefined (equal curvatures)' : formatNumber(lens.shape, 4)],
    ['Edge thickness at the clear diameter', r.geometry.edgeMm, 'mm', 4]];

  const img = [{ group: `Object ${formatNumber(v.objectDistanceMm, 6)} mm before V₁, ${formatNumber(v.objectHeightMm, 4)} mm tall` }];
  if (image.atInfinity) img.push(['Image', 'at infinity: the object is in the front focal plane']);
  else {
    img.push(['Object distance from H, s', image.objectFromH, 'mm'],
      [image.real ? 'Image distance after V₂' : 'Virtual image distance before V₂', Math.abs(image.fromV2), 'mm'],
      ['Image distance from H′, s′', image.imageFromH2, 'mm'],
      ['Image', `${image.real ? 'real' : 'virtual'}, ${image.upright ? 'upright' : 'inverted'}`],
      ['Magnification m', image.magnification, '', 4], ['Image height', image.heightMm, 'mm', 4],
      ['Newton: x = s − f', image.newtonX, 'mm'], ['Newton: x′ = s′ − f (x x′ = f²)', image.newtonX2, 'mm'],
      thin.atInfinity ? ['Thin-lens estimate, from the centre', 'at infinity'] : ['Thin-lens estimate, after V₂', thin.fromV2, 'mm']);
  }

  const focus = [], fiber = [];
  if (r.ideal && !(r.lens.efl < 0)) {
    focus.push({ group: 'Gaussian beam, ideal lens' }, ['Focused waist w₀′ (1/e² radius)', r.ideal.waistUm, 'µm', 4],
      lengthRow('Waist after V₂', r.ideal.fromV2Mm, 6), ['Rayleigh range z_R′', r.ideal.rayleighMm * 1e3, 'µm', 4],
      ['Convergence, half angle', r.ideal.halfAngleMrad, 'mrad', 4], ['Share of the beam inside D', 100 * r.clipShare, '%', 6]);
    const mode = r.mode ? [['V number', r.mode.vNumber, '', 4], ['Cutoff wavelength', r.mode.cutoffNm, 'nm', 4],
      ['Single-mode here', r.mode.singleMode ? 'yes' : 'no: LP₁₁ is guided too']] : [];
    fiber.push({ group: `Mode-field diameter ${formatNumber(v.mfdUm, 4)} µm` }, ...mode,
      ['Gaussian mode matching, ideal lens', 100 * r.gaussianEta, '%', 4]);
  }
  const s = r.scan;
  if (s) {
    focus.push({ group: 'Through focus' }, ['Ideal lens: spot radius (86.5 %)', s.ideal.bestRadiusUm, 'µm', 4]);
    fiber.push(['Ideal lens with this aperture, best', 100 * s.ideal.bestCoupling, '%', 4]);
    if (s.real) {
      focus.push(['Singlet: Strehl ratio at F′', s.real.paraxialStrehl, '', 3], ['Singlet: spot radius at F′', s.real.paraxialRadiusUm, 'µm', 4],
        ['Singlet: brightest plane from F′', s.real.bestShiftMm * 1e3, 'µm', 4], ['Singlet: Strehl ratio there', s.real.strehl, '', 3],
        ['Singlet: spot radius there', s.real.bestRadiusUm, 'µm', 4]);
      fiber.push(['Singlet, fiber at F′', 100 * s.real.paraxialCoupling, '%', 3], ['Singlet, best fiber position from F′', s.real.fiberShiftMm * 1e3, 'µm', 4],
        ['Singlet, coupling there', 100 * s.real.bestCoupling, '%', 3]);
    }
  }
  return { key, lens: out, image: img, focus, fiber };
}

function notes(r) {
  const out = [];
  for (const issue of [r.beamIssue, r.realIssue]) if (issue) out.push(issue);
  if (r.clipShare !== undefined && r.clipShare < 0.999) out.push(`The clear diameter passes ${formatNumber(100 * r.clipShare, 4)} % of the beam; the rest is lost, and the cut edge spreads the focus.`);
  if (r.rimNa > HIGH_NA) out.push(`The lit pupil reaches NA ${formatNumber(r.rimNa, 3)} at its rim: above ${HIGH_NA}, scalar diffraction ignores polarization, which then matters.`);
  if (r.fresnelNumber < FRESNEL_LIMIT) out.push(`The Fresnel number of the lit pupil, a²/(λf) = ${formatNumber(r.fresnelNumber, 3)}, is below ${FRESNEL_LIMIT}: the focus moves toward the lens from where the Debye integral puts it, so the curves are approximate.`);
  if (r.scan?.real?.clipped) out.push('Part of the beam meets the back face outside the clear diameter and is cut there.');
  if (r.mode && !r.mode.singleMode && r.ideal) out.push(`V = ${formatNumber(r.mode.vNumber, 4)} is above ${formatNumber(SINGLE_MODE_V, 4)}: at this wavelength the fiber also guides LP₁₁. The coupling here is into the fundamental mode only.`);
  const real = r.scan?.real;
  if (real && [real.bestRadiusUm, real.paraxialRadiusUm, ...real.radiusUm].some(x => !Number.isFinite(x))) out.push(`The singlet’s spot grows wider than ${formatNumber(real.radiusLimitUm, 3)} µm, beyond which this page does not integrate it: its radius is left out there.`);
  if (!r.image.atInfinity) {
    const steep = Math.max(r.values.objectHeightMm / r.values.objectDistanceMm, Math.abs(r.image.heightMm) / Math.max(1e-9, Math.abs(r.image.imageFromH2)));
    if (steep > 0.1) out.push(`The construction rays reach ${formatNumber(Math.atan(steep) * 1e3, 3)} mrad from the axis: beyond about 0.1 rad the paraxial image is only a guide, and the real one is aberrated.`);
  }
  if (r.scan) out.push('The ideal lens obeys the sine condition (an aplanat) and focuses the Gaussian beam to the Gaussian waist; the singlet is traced through its two spherical faces.');
  return out;
}

const micron = mm => mm * 1e3;
function graphs(r) {
  const s = r.scan, none = { message: r.beamIssue ?? 'No focus to show.' };
  const colour = chromaticScan(r.values);
  const out = {
    colour: {
      x: colour.map(p => p.nm), xLabel: 'Wavelength (nm)', xUnit: 'nm', yLabel: 'Focal length (mm)',
      series: [
        { name: 'Effective focal length f', color: '--series-1', values: colour.map(p => p.efl) },
        { name: 'Back focal length', color: '--series-1', dash: true, values: colour.map(p => p.bfl) },
        { name: 'Thin-lens formula', color: '--series-3', values: colour.map(p => p.thin) },
      ],
      // The scale starts near the curves, so their change shows.
      yMin: 0.98 * Math.min(...colour.flatMap(p => [p.efl, p.bfl, p.thin]).filter(Number.isFinite)),
      marker: { x: r.values.wavelengthNm, y: r.lens.efl }, vlines: [{ x: r.values.wavelengthNm, label: `${formatNumber(r.values.wavelengthNm, 5)} nm` }],
      formatX: n => formatNumber(n, 5), formatY: n => formatNumber(n, 5),
    },
  };
  if (!s) return { ...out, beam: none, psf: none, coupling: none };
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
      { name: 'Ideal lens', color: '--series-3', values: s.ideal.radiusUm },
    ],
    vlines: lines([{ x: 0, label: 'F′' }, real && { x: micron(real.bestShiftMm), label: 'singlet brightest' }]),
    formatX: n => formatNumber(n, 4), formatY: n => formatNumber(n, 4),
  };
  out.coupling = {
    x, xLabel: 'Fiber position from F′ (µm)', xUnit: 'µm', yLabel: 'Coupling (%)', yMin: 0, yMax: 100,
    series: [
      { name: 'Singlet', color: '--series-1', values: real ? real.coupling.map(e => 100 * e) : x.map(() => null) },
      { name: 'Ideal lens', color: '--series-3', values: s.ideal.coupling.map(e => 100 * e) },
    ],
    vlines: lines([{ x: 0, label: 'F′' }, real && { x: micron(real.fiberShiftMm), label: 'singlet best' }]),
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
      { name: 'Ideal lens', color: '--series-3', values: relative(ideal, s.ideal.atBest) },
    ],
    formatX: n => formatNumber(n, 4), formatY: n => formatNumber(n, 4),
  };
  return out;
}

// ---------------------------------------------------------------- figure
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const RAY_COLOURS = { parallel: '#d9480f', focal: '#2f9e44', nodal: '#1c7ed6' };

function diagramSVG(g) {
  const [lo, hi] = g.z, W = hi - lo, font = W / 30, H = Math.max(2 * g.yMax + 3 * font, 0.3 * W);
  const u = W / 400, X = z => z, Y = y => -y;
  const pts = p => p.map(([z, y]) => `${X(z).toFixed(4)},${Y(y).toFixed(4)}`).join(' ');
  let body = `<rect x="${lo}" y="${-H / 2}" width="${W}" height="${H}" fill="#ffffff"/>`;
  body += `<defs><clipPath id="diagram-clip"><rect x="${lo}" y="${-H / 2}" width="${W}" height="${H}"/></clipPath></defs><g clip-path="url(#diagram-clip)">`;
  body += `<line x1="${lo}" y1="0" x2="${hi}" y2="0" stroke="#8a93a3" stroke-width="${u}" stroke-dasharray="${4 * u} ${3 * u}"/>`;
  if (g.outline) body += `<polygon points="${pts(g.outline)}" fill="#cfe3f5" stroke="#2b6cb0" stroke-width="${u}"/>`;
  else body += `<line x1="${X(g.marks.H)}" y1="${-g.yMax / 1.25}" x2="${X(g.marks.H)}" y2="${g.yMax / 1.25}" stroke="#2b6cb0" stroke-width="${2 * u}"/>`;
  // Principal planes and focal points.
  // Close principal planes get their labels on their outer sides.
  const apart = Math.abs(g.marks.H2 - g.marks.H) > 2 * font;
  const order = g.marks.H <= g.marks.H2 ? 1 : -1;
  for (const [key, label, side] of [['H', 'H', -order], ['H2', 'H′', order]]) {
    const z = X(g.marks[key]);
    const anchor = apart ? 'middle' : side < 0 ? 'end' : 'start';
    body += `<line x1="${z}" y1="${-g.yMax}" x2="${z}" y2="${g.yMax}" stroke="#5b6475" stroke-width="${0.7 * u}" stroke-dasharray="${2 * u} ${2 * u}"/>`;
    body += `<text x="${z + (apart ? 0 : side * font * 0.2)}" y="${-g.yMax - font * 0.3}" font-size="${font}" fill="#2b3240" text-anchor="${anchor}">${label}</text>`;
  }
  for (const [key, label] of [['F', 'F'], ['F2', 'F′']]) {
    const z = X(g.marks[key]);
    body += `<circle cx="${z}" cy="0" r="${2.2 * u}" fill="#2b3240"/><text x="${z}" y="${font * 1.2}" font-size="${font}" fill="#2b3240" text-anchor="middle">${label}</text>`;
  }
  // Rays, then their extensions.
  for (const ray of g.rays) body += `<polyline points="${pts(ray.path)}" fill="none" stroke="${RAY_COLOURS[ray.name]}" stroke-width="${1.2 * u}" stroke-linejoin="round"/>`;
  g.extend.forEach((seg, i) => {
    const name = g.rays[Math.floor(i / (g.extend.length / g.rays.length))]?.name ?? 'parallel';
    body += `<polyline points="${pts(seg)}" fill="none" stroke="${RAY_COLOURS[name]}" stroke-width="${0.8 * u}" stroke-dasharray="${2.5 * u} ${2 * u}" opacity="0.8"/>`;
  });
  // Object and image arrows.
  const arrow = (z, h, colour, dash) => {
    const head = Math.min(Math.abs(h) * 0.3, 6 * u) * Math.sign(h);
    return `<g stroke="${colour}" stroke-width="${1.6 * u}" fill="none"${dash ? ` stroke-dasharray="${2.5 * u} ${2 * u}"` : ''}><line x1="${X(z)}" y1="0" x2="${X(z)}" y2="${Y(h)}"/>`
      + `<polyline points="${X(z) - 3 * u},${Y(h - head)} ${X(z)},${Y(h)} ${X(z) + 3 * u},${Y(h - head)}" stroke-dasharray="none"/></g>`;
  };
  body += arrow(g.object.z, g.object.height, '#2b3240', false);
  if (g.image) body += arrow(g.image.z, g.image.height, '#7b2cbf', !g.image.real);
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
  const g = rayDiagram(r);
  caption.textContent = `To scale, in the plane of the axis: the lens${g.outline ? '' : ' (its faces cross at this diameter, so it is drawn as a thin-lens line at H)'}, its principal planes H and H′ and focal points F and F′, the object and its ${r.image.atInfinity ? 'image at infinity' : r.image.real ? 'real image' : 'virtual image (dashed)'}. The rays are paraxial: red enters parallel and leaves through F′, green passes through F and leaves parallel, blue aims at H and leaves H′ at the same angle. Dashed: their extensions to the principal planes${r.image.real ? '' : ' and back to the virtual image'}. ${g.imageNote}`.trim();
  figure.innerHTML = diagramSVG(g);
  const scene = canvasScene(r.values);
  figureNote.textContent = scene.ok ? scene.note : `The canvas’s Thick spherical lens cannot hold this one: ${scene.reasons.join('; ')}.`;
  const token = ++shareToken;
  openLink.setAttribute('aria-disabled', 'true');
  if (!scene.ok) return;
  buildShareURL(JSON.stringify(scene.scene), new URL('../../sketch/', window.location.href).href)
    .then(url => { if (token === shareToken) { openLink.href = url; openLink.removeAttribute('aria-disabled'); } })
    .catch(() => { if (token === shareToken) openLink.removeAttribute('href'); });
}

mountCalculator({
  inputs: LENS_INPUTS, defaults: LENS_DEFAULTS, hideInactive: true,
  groups: { lens: { title: 'Lens' }, object: { title: 'Object' }, beam: { title: 'Laser beam' }, fiber: { title: 'Fiber' } },
  compute: computeThickLens, rows, notes, graphs, onResult: drawFigure,
});
