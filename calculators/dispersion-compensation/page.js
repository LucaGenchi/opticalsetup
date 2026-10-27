// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The dispersion compensation page: inputs -> compressor-calculator.js ->
// the bench drawn by the canvas's own tracer, results and graphs.

import {
  COMPRESSOR_INPUTS, COMPRESSOR_DEFAULTS, LAYOUT_PRESETS, computeCompressor, gddScan, separationScan,
} from './compressor-calculator.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';
import { formatNumber } from '../assets/calculator-kit.js';
import { registry, getVisualBounds } from '../../sketch/js/elements.js';
import { traceScene } from '../../sketch/js/raytrace.js';
import { buildShareURL } from '../../sketch/js/share.js';
import { canvasScene, lensGlassGddFs2 } from './compressor-model.js';

const figure = document.getElementById('preview-figure');
const caption = document.getElementById('preview-caption');
const presetNote = document.getElementById('preview-note');
const openLink = document.getElementById('preview-open');
const form = document.getElementById('calc-form');

// The reset button returns to the chosen layout's example, so the defaults
// follow the layout.
const defaults = { ...COMPRESSOR_DEFAULTS };
function loadPreset(layout) {
  Object.assign(defaults, COMPRESSOR_DEFAULTS, LAYOUT_PRESETS[layout].values, { layout });
  for (const [id, value] of Object.entries(defaults)) {
    const control = form.elements[id];
    if (control && id !== 'layout') control.value = String(value);
  }
}
// Runs before the form's own change listener, which then recomputes. Going
// from a solved separation to setting it by hand starts from the solution:
// the last one solved, kept apart, since the select's input event has
// already recomputed the bench by hand by the time its change event fires.
let lastSolved = null;
form.addEventListener('change', e => {
  if (e.target.name === 'layout') { loadPreset(e.target.value); lastSolved = null; }
  if (e.target.name === 'solve' && e.target.value === 'manual' && lastSolved) {
    form.elements[lastSolved.id].value = String(Number(lastSolved.value.toFixed(1)));
  }
}, true);

// Dispersion to the nearest fs², fs³ or fs⁴ and durations to the nearest fs
// (a tenth below 10 fs, ps past 10 ps): further digits are below what the
// models and the glass data hold.
const grouped = n => (n < 0 ? '-' : '') + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
const whole = (x, unit) => {
  if (!Number.isFinite(x)) return '—';
  return Math.abs(x) >= 1e15 ? `${formatNumber(x, 4)} ${unit}` : `${grouped(Math.round(x) || 0)} ${unit}`;
};
const fs = x => [!Number.isFinite(x) ? '—' : x >= 1e4 ? `${formatNumber(x / 1000, 3)} ps` : x < 10 ? `${formatNumber(Math.round(x * 10) / 10, 3)} fs` : whole(x, 'fs')];
const mm = x => [x, 'mm', 4];

function rows(r) {
  const v = r.values, g = r.geometry, isPrism = g.kind === 'prism';
  const solvedLabel = { separationMm: 'Separation L (solved)', gratingSeparationMm: 'Separation G (solved)', gratingLensMm: 'Grating to lens s (solved)' };
  const key = [{ group: 'At a glance' }];
  if (r.solved) key.push([solvedLabel[r.solved.id], r.solved.value, 'mm', 4]);
  key.push(['Compensator GDD', whole(r.comp.gddFs2, 'fs²')], ['Net GDD', whole(r.net.gddFs2, 'fs²')]);
  key.push(['Output duration (FWHM, every order)', ...fs(r.outputFs)], ['Transform limit', ...fs(r.tlFs)]);
  key.push(['Transmission', r.throughput.transmission * 100, '%', 4]);

  const geometry = [{ group: 'The bench at the central wavelength' }];
  if (isPrism) {
    geometry.push(['Apex angle', g.apexDeg, '°', 5], ['Angle of incidence', g.incidenceDeg, '°', 5],
      ['Brewster’s angle', g.brewsterDeg, '°', 5], ['Deviation per prism', g.deviationDeg, '°', 5],
      ['Separation L, along the central ray', ...mm(g.separationMm)], ['Apex-to-apex distance', ...mm(g.apexDistanceMm)],
      ['Glass in the prisms (central ray, one pass)', g.glass.map(x => formatNumber(x, 3)).join(' + ') + ' mm'],
      ['Colour spread across prism 2 (FWHM band)', ...mm(g.spreadMm)],
      ['Prism 2 aperture needed (spread + beam)', ...mm(g.apertureMm)]);
  } else {
    geometry.push(['Angle of incidence', g.incidenceDeg, '°', 5], ['Diffraction angle (order −1)', g.diffractionDeg, '°', 5],
      ['Littrow angle', g.littrowDeg, '°', 5]);
    if (g.kind === 'stretcher') geometry.push(['Grating to lens s', ...mm(v.gratingLensMm)], ['Equivalent grating separation (s₁ + s₂ − 2f) cos β', ...mm(g.effectiveSeparationMm)]);
    else geometry.push(['Separation G, between the faces', ...mm(g.separationMm)], ['Slant distance, along the central ray', ...mm(g.slantMm)]);
    geometry.push([g.kind === 'stretcher' ? 'Colour spread on the gratings (equivalent pair, FWHM band)' : 'Colour spread on grating 2 (FWHM band)', ...mm(g.spreadMm)],
      ['Grating aperture needed (spread + beam footprint)', ...mm(g.apertureMm)]);
  }
  geometry.push(['Spatial chirp at the output (FWHM band)', g.outputChirpMm > 1e-6 ? `${formatNumber(g.outputChirpMm, 3)} mm` : 'none']);

  const dispersion = [{ group: 'Dispersion at the central wavelength' },
    ['Compensator GDD', whole(r.comp.gddFs2, 'fs²')], ['Compensator TOD', whole(r.comp.todFs3, 'fs³')], ['Compensator FOD', whole(r.comp.fodFs4, 'fs⁴')]];
  if (isPrism && g.glassGddFs2 !== null) dispersion.push(['of which the glass crossed (central ray)', whole(g.glassGddFs2, 'fs²')]);
  if (r.slopeFs2PerMm !== null) dispersion.push(['GDD per mm of separation', r.slopeFs2PerMm, 'fs²/mm', 4]);
  dispersion.push(['Input GDD', whole(r.chirp.gddFs2, 'fs²')], ['Input TOD', whole(r.chirp.todFs3, 'fs³')], ['Input FOD', whole(r.chirp.fodFs4, 'fs⁴')],
    ['Net GDD', whole(r.net.gddFs2, 'fs²')], ['Net TOD', whole(r.net.todFs3, 'fs³')], ['Net FOD', whole(r.net.fodFs4, 'fs⁴')]);

  const pulse = [{ group: 'Pulse duration (FWHM)' }, ['Transform limit', ...fs(r.tlFs)],
    ['Input, every order', ...fs(r.inputFs)], ['Input, GDD only', ...fs(r.inputGddOnlyFs)],
    ['Output, every order', ...fs(r.outputFs)], ['Output, GDD only', ...fs(r.outputGddOnlyFs)]];
  const t = r.throughput;
  const transmission = [{ group: 'Transmission' }];
  if (isPrism) transmission.push([`Fresnel, ${t.faces} uncoated faces (${v.polarization}-polarized)`, t.transmission * 100, '%', 5]);
  else transmission.push([`Gratings, ${t.diffractions} diffractions at ${formatNumber(v.efficiencyPct, 3)} %`, t.transmission * 100, '%', 4]);
  return { key, geometry, dispersion, pulse, transmission };
}

function notes(r) {
  const v = r.values, out = [];
  if (r.layout.kind === 'stretcher') out.push(`The stretcher’s dispersion is that of the equivalent grating pair, to paraxial order in ideal lenses without glass. The canvas traces the lenses exactly and also gives each one an estimated thickness of N-BK7, whose GDD it reads with the rest: ${formatNumber(lensGlassGddFs2(r.layout, v), 3)} fs² more here.`);
  if (r.layout.passes === 2) out.push('The double pass ends on a flat mirror square to the beam, which sends each colour back along its own path: the beam leaves as it came in, with twice one pass’s dispersion and the colours together again. In the plane of the figure the return retraces the input, so a beamsplitter takes it out, and the canvas loses half the light at each crossing. In the lab the end mirror is tipped slightly out of the plane, and a pickoff mirror just above the input takes the return without loss; the transmission above is for that.');
  else if (r.geometry.outputChirpMm > 1e-6) out.push(`One pass of a single pair leaves the colours side by side across the beam: ${formatNumber(r.geometry.outputChirpMm, 3)} mm between the edges of the FWHM band, on a ${formatNumber(v.beamDiameterMm, 3)} mm beam. A double pass or a four-element sequence brings them back together.`);
  const failure = (which, reason) => reason === 'domain'
    ? `Part of the spectrum lies outside a glass’s published fit, so the ${which} has no Fourier duration; only its GDD-only duration is given.`
    : `The ${which} is too long for the Fourier transform used here (more than 2¹⁸ points), so only its GDD-only duration is given.`;
  if (r.outputFs === null) out.push(failure('output', r.outputFailure));
  if (r.inputFs === null) out.push(failure('input', r.inputFailure));
  if (v.chirp === 'material') out.push('The input carries the material’s full dispersion, every order, from its published fit.');
  else if (v.chirp === 'gdd') out.push('The input carries the GDD, TOD and FOD entered, and nothing beyond them.');
  out.push('The output duration includes every order of both phases, from a Fourier transform of the spectrum; the GDD-only figure is the analytic one, for comparison. Plane waves along the central ray: beam size, diffraction and the colours’ spread across a finite beam are not modelled. Dispersion is shown to the nearest fs², fs³ or fs⁴ and durations to the nearest fs.');
  if (r.geometry.kind === 'prism') out.push('Prism losses: Fresnel reflection at each uncoated face for the polarization chosen; no absorption. Mirror losses are not included.');
  else out.push('Grating losses: the efficiency entered, once per diffraction. Mirror and lens losses are not included.');
  return out;
}

// Resample a Fourier profile onto `count` points over ±span.
function resample(profile, span, count = 301) {
  if (!profile) return null;
  const { times, intensity } = profile, dt = times[1] - times[0];
  return Array.from({ length: count }, (_, i) => {
    const t = -span + 2 * span * i / (count - 1), k = (t - times[0]) / dt, j = Math.floor(k);
    return j >= 0 && j + 1 < times.length ? intensity[j] + (intensity[j + 1] - intensity[j]) * (k - j) : 0;
  });
}

function graphs(r) {
  const v = r.values;
  const band = { lo: v.wavelengthNm - v.bandwidthNm / 2, hi: v.wavelengthNm + v.bandwidthNm / 2, label: 'Bandwidth (FWHM)' };
  const scan = gddScan(r);
  const gddSeries = [{ name: 'Compensator', color: '--series-1', values: scan.comp }];
  if (v.chirp !== 'none') gddSeries.push({ name: 'Input', color: '--series-2', values: scan.input, dash: true }, { name: 'Net', color: '--series-3', values: scan.net });
  const sep = separationScan(r);
  const span = 2 * Math.max(r.outputFs ?? r.outputGddOnlyFs, r.tlFs);
  const times = Array.from({ length: 301 }, (_, i) => -span + 2 * span * i / 300);
  const pulseSeries = [{ name: 'Output', color: '--series-1', values: resample(r.profiles.output, span) ?? times.map(() => null) },
    { name: 'Transform limit', color: '--series-2', values: resample(r.profiles.transform, span) ?? times.map(() => null), dash: true }];
  // The input only when it is not far longer than the window.
  if (r.inputFs !== null && r.inputFs < 4 * span) pulseSeries.push({ name: 'Input', color: '--series-3', values: resample(r.profiles.input, span) });
  return {
    gdd: { x: scan.x, xLabel: 'Wavelength (nm)', xUnit: 'nm', yLabel: 'GDD (fs²)', series: gddSeries, band,
      marker: { x: v.wavelengthNm, y: v.chirp === 'none' ? r.comp.gddFs2 : r.net.gddFs2 }, formatY: n => formatNumber(n, 4) },
    scan: { x: sep.x, xLabel: `${sep.label} (${sep.unit})`, xUnit: sep.unit, yLabel: 'Output duration (fs)',
      series: [{ name: 'Every order', color: '--series-1', values: sep.fs }, { name: 'GDD only', color: '--series-2', values: sep.gddOnly, dash: true }],
      marker: { x: sep.value, y: r.outputFs ?? r.outputGddOnlyFs }, yMin: 0, formatY: n => formatNumber(n, 4) },
    pulse: { x: times, xLabel: 'Time (fs)', xUnit: 'fs', yLabel: 'Intensity (peak 1)', series: pulseSeries, yMin: 0, yMax: 1.05,
      formatY: n => formatNumber(n, 3) },
  };
}

// ---------------------------------------------------------------- figure
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function sceneSVG(r) {
  const elements = r.layout.elements;
  const traced = traceScene(elements, []);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const el of elements) {
    const b = getVisualBounds(el, { includeLabel: false, elements });
    if (!b) continue;
    x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
  }
  const pad = Math.max(x1 - x0, y1 - y0) * 0.05 + 10;
  [x0, y0, x1, y1] = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  const w = x1 - x0, h = y1 - y0, unit = Math.max(w, h) / 100;
  const pts = p => p.map(q => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(' ');
  let body = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#ffffff"/>`;
  for (const d of traced.drawables) {
    if (d.type === 'poly') body += `<polygon points="${pts(d.pts)}" fill="${d.color}" opacity="${d.opacity}"/>`;
    else if (d.pts) body += `<polyline points="${pts(d.pts)}" fill="none" stroke="${d.color}" stroke-width="${Math.max(d.w, unit * 0.25)}" opacity="${d.opacity}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  for (const el of elements) body += `<g transform="translate(${el.x} ${el.y}) rotate(${el.rot || 0})">${registry[el.type].svg(el, elements)}</g>`;
  // The solved (or set) distance, as a dimension line beside the beam.
  const { a, b } = r.layout.dimension;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len > 0) {
    const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len, off = unit * 4;
    const [ax, ay, bx, by] = [a[0] + nx * off, a[1] + ny * off, b[0] + nx * off, b[1] + ny * off];
    const label = { prism: `L = ${formatNumber(r.geometry.separationMm, 4)} mm`, grating: `G = ${formatNumber(r.geometry.separationMm, 4)} mm`, stretcher: `s = ${formatNumber(r.values.gratingLensMm, 4)} mm` }[r.layout.kind];
    let angle = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
    if (angle > 90) angle -= 180; else if (angle < -90) angle += 180;
    const mx = (ax + bx) / 2 + nx * unit * 2.4, my = (ay + by) / 2 + ny * unit * 2.4;
    body += `<g stroke="#5b6475" stroke-width="${unit * 0.18}" fill="none"><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke-dasharray="${unit} ${unit * 0.7}"/>`
      + `<line x1="${a[0]}" y1="${a[1]}" x2="${ax}" y2="${ay}"/><line x1="${b[0]}" y1="${b[1]}" x2="${bx}" y2="${by}"/></g>`
      + `<text x="${mx}" y="${my}" transform="rotate(${angle} ${mx} ${my})" font-size="${unit * 2.6}" fill="#2b3240" text-anchor="middle" dominant-baseline="middle">${esc(label)}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" font-family="Helvetica, Arial, sans-serif" role="img" aria-label="${esc(caption.textContent)}">${body}</svg>`;
}

const sceneText = r => JSON.stringify(canvasScene(r.layout));

let shareToken = 0;
function drawFigure(r) {
  figure.classList.toggle('is-stale', !r.ok);
  if (!r.ok) {
    caption.textContent = 'The figure shows the last valid bench: correct the inputs to update it.';
    openLink.setAttribute('aria-disabled', 'true');
    return;
  }
  const v = r.values, label = { 'prism-pair': 'Prism pair', 'four-prism': 'Four prisms', 'grating-pair': 'Grating pair', 'four-grating': 'Four gratings', stretcher: 'Grating stretcher' }[v.layout];
  caption.textContent = `${label}${r.layout.passes === 2 ? ', double pass' : ''}, drawn to scale and traced by the canvas at ${formatNumber(v.wavelengthNm, 5)} nm: the colours of the ${formatNumber(v.bandwidthNm, 3)} nm band fan out and ${r.geometry.outputChirpMm > 1e-6 ? 'leave side by side' : 'come back together'} on their way to the detector, an autocorrelator in the canvas.`;
  const chirp = v.sceneChirp;
  if (chirp?.block) caption.textContent += ` The ${formatNumber(chirp.block.lengthMm, 4)} mm block before it carries the chirp.`;
  else if (chirp?.clipped) caption.textContent += ` The canvas source carries at most ${formatNumber(Math.abs(chirp.gddFs2), 3)} fs², so the scene carries that much of the ${whole(Math.abs(r.chirp.gddFs2), 'fs²')} entered: in the canvas the output stays chirped, and the canvas does not carry the input’s TOD and FOD either.`;
  else if (chirp) caption.textContent += ` The source carries the chirp as its GDD (${whole(chirp.gddFs2, 'fs²')}); the canvas does not carry the input’s TOD and FOD.`;
  if (r.figureIssue) caption.textContent = `${r.figureIssue} The numbers do not depend on the drawing.`;
  figure.innerHTML = sceneSVG(r);
  presetNote.textContent = LAYOUT_PRESETS[v.layout].note;
  // The share link is built asynchronously (gzip); only the latest stands.
  const token = ++shareToken;
  openLink.setAttribute('aria-disabled', 'true');
  buildShareURL(sceneText(r), new URL('../../sketch/', window.location.href).href)
    .then(url => { if (token === shareToken) { openLink.href = url; openLink.removeAttribute('aria-disabled'); } })
    .catch(() => { if (token === shareToken) openLink.removeAttribute('href'); });
}

// Groups whose every field is off for this layout are hidden whole.
function hideEmptyGroups() {
  for (const fieldset of form.querySelectorAll('fieldset')) {
    fieldset.hidden = ![...fieldset.querySelectorAll('.calc-field')].some(f => !f.classList.contains('is-off'));
  }
}

mountCalculator({
  inputs: COMPRESSOR_INPUTS, defaults, hideInactive: true,
  groups: { layout: { title: 'Layout' }, pulse: { title: 'Input pulse' }, prisms: { title: 'Prisms' }, gratings: { title: 'Gratings and lenses' } },
  compute: computeCompressor, rows, notes, graphs,
  onResult: r => { if (r.ok && r.solved) lastSolved = r.solved; hideEmptyGroups(); drawFigure(r); },
});
