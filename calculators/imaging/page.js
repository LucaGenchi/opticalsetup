// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The imaging page: one lens and an object (inputs -> imaging.js -> the ray
// figure, results and graphs), then two lenses, a telescope, relay or pair
// at any spacing, with a figure of their own.

import {
  IMAGING_INPUTS, IMAGING_DEFAULTS, PAIR_INPUTS, PAIR_DEFAULTS, computeImaging, computePair,
  imageScan, scanReach, thinModel, imagingDiagram, pairDiagram, imagingCanvasScene, pairCanvasScene,
} from './imaging.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';
import { formatNumber } from '../assets/calculator-kit.js';
import { buildShareURL } from '../../sketch/js/share.js';

// Lengths to micrometre resolution, as on the thin and thick lens page.
const roundMm = mm => Math.round(mm * 1e3) / 1e3;
const mmRow = (label, mm) => [label, roundMm(mm), 'mm', 12];
const mmText = mm => `${formatNumber(roundMm(mm), 12)} mm`;
const signed = mm => (Math.abs(roundMm(mm)) < 1e-9 ? '0 mm (at the vertex)' : `${mm < 0 ? '−' : '+'}${mmText(Math.abs(mm))}`);
const radius = mm => (mm ? `${mm < 0 ? '−' : ''}${mmText(Math.abs(mm))}` : 'flat');
const KIND = { ideal: 'Ideal thin lens', planoconvex: 'Plano-convex singlet', biconvex: 'Bi-convex singlet', planoconcave: 'Plano-concave singlet', biconcave: 'Bi-concave singlet' };
const nature = im => `${im.real ? 'real' : 'virtual'}, ${im.upright ? 'upright' : 'inverted'}, ${Math.abs(im.magnification) > 1 ? 'enlarged' : 'reduced'}`;

// A lens's shape and cardinal points.
function lensRows(lens) {
  if (lens.ideal) return [mmRow('Focal length f', lens.efl), ['Principal planes', 'H = H′, in the plane of the lens']];
  return [
    ['Radii R₁ / R₂', `${radius(lens.r1Mm)} / ${radius(lens.r2Mm)}`],
    ['Centre / edge thickness', `${mmText(lens.thicknessMm)} / ${mmText(lens.edgeMm)}`],
    ['Refractive index n', lens.n, '', 6], mmRow('Focal length f', lens.efl),
    mmRow('f by the thin-lens formula', lens.thinFocalMm), mmRow('Back focal length (V₂ to F′)', lens.bfl),
    mmRow('Front focal length (F to V₁)', lens.ffl),
    ['H from V₁', signed(lens.h1Mm)], ['H′ from V₂', signed(lens.h2Mm)],
  ];
}

// ---------------------------------------------------------------- one lens
function rows(r) {
  const { lens, image, thin, values: v } = r;
  const key = [{ group: `${KIND[lens.kind]}${lens.ideal ? '' : ` at ${formatNumber(v.wavelengthNm, 5)} nm`}` }, mmRow('Focal length f', lens.efl)];
  if (!lens.ideal) key.push(mmRow('Back focal length (V₂ to F′)', lens.bfl));
  if (image.atInfinity) key.push(['Image', 'at infinity (object in the front focal plane)']);
  else key.push(mmRow(`Image after ${lens.ideal ? 'the lens' : 'V₂'}`, image.fromLast), ['Magnification m', image.magnification, '', 4], ['Image', nature(image)]);
  const lensTable = [{ group: 'The lens' }, ...lensRows(lens)];
  const imageTable = [{ group: 'The image' }];
  if (!image.atInfinity) {
    imageTable.push(mmRow('Object distance from H, s', image.objectFromH), mmRow('Image distance from H′, s′', image.imageFromH2),
      ['Magnification m = −s′/s', image.magnification, '', 6], mmRow('Image height', image.heightMm),
      mmRow('Newton: x, object before F', image.newtonX), mmRow('Newton: x′, image after F′', image.newtonX2),
      ['Newton: x x′ (= f²)', image.newtonX * image.newtonX2, 'mm²', 6]);
  } else imageTable.push(['Image', 'at infinity']);
  if (!lens.ideal) {
    imageTable.push({ group: 'Thin-lens formula, from the lens’s centre' });
    if (thin.atInfinity) imageTable.push(['Image', 'at infinity']);
    else imageTable.push(mmRow('Image after the centre', thin.fromCentre), mmRow('So after V₂', thin.fromLast), ['Magnification', thin.magnification, '', 4]);
  }
  return { key, lens: lensTable, image: imageTable };
}

function notes(r) {
  const out = [];
  const { lens, image, thin } = r;
  if (!image.atInfinity && !image.real) out.push(`The image is virtual: the light leaving the lens diverges as if from a point ${mmText(Math.abs(image.fromLast))} before ${lens.ideal ? 'the lens' : 'V₂'}, where the dashed lines meet. It can be seen through the lens, or imaged by another lens, but not caught on a screen.`);
  if (lens.efl < 0) out.push('A diverging lens forms a virtual, upright and reduced image of any real object, between its F′ and the lens.');
  if (!lens.ideal && !image.atInfinity && !thin.atInfinity) out.push(`The thin-lens formula, with distances from the lens’s centre and f = ${mmText(lens.thinFocalMm)}, puts the image ${mmText(Math.abs(thin.fromLast - image.fromLast))} ${thin.fromLast < image.fromLast ? 'nearer the object' : 'farther from the object'} than the thick lens does.`);
  const g = r.diagram;
  if (g?.outside) out.push('Some construction rays meet the lens outside its clear diameter. They are aids that locate the image, which the light through the lens forms all the same.');
  if (g?.imageNote) out.push(g.imageNote);
  out.push('Paraxial optics: exact for rays close to the axis. A real lens images steep rays elsewhere (aberrations), which the Lens design page traces.');
  return out;
}

const fromHere = (list, limit) => list.map(y => (y !== null && Math.abs(y) <= limit ? y : null));
function scanGraphs(scan, kinds, { xLabel, imageLabel, current, focal }) {
  const series = (key, limit) => kinds.map(([k, name, color, dash]) => ({ name, color, dash, values: fromHere(scan[k][key], limit) }));
  // A tenth of headroom, so a flat line (an afocal pair's m) clears the axes.
  const room = list => {
    const ys = list.flatMap(s => s.values).filter(y => y !== null);
    return ys.length ? { yMin: Math.min(0, 1.1 * Math.min(...ys)), yMax: Math.max(0, 1.1 * Math.max(...ys)) } : {};
  };
  const limitImage = Math.max(4 * Math.abs(focal.ref), 1.5 * Math.abs(current?.image ?? 0));
  const limitM = Math.max(4, 1.5 * Math.abs(current?.magnification ?? 0));
  const vlines = focal.z > 0 ? [{ x: focal.z, label: focal.label }] : [];
  const mark = (y, limit) => (current && Number.isFinite(y) && Math.abs(y) <= limit ? { x: current.d, y } : null);
  const images = series('image', limitImage), ms = series('magnification', limitM);
  return {
    image: { x: scan.x, xLabel, xUnit: 'mm', yLabel: imageLabel, series: images, ...room(images), vlines, marker: mark(current?.image, limitImage), formatX: n => formatNumber(n, 5), formatY: n => formatNumber(n, 5) },
    magnification: { x: scan.x, xLabel, xUnit: 'mm', yLabel: 'Lateral magnification m', series: ms, ...room(ms), vlines, marker: mark(current?.magnification, limitM), formatX: n => formatNumber(n, 5), formatY: n => formatNumber(n, 4) },
  };
}

function graphs(r) {
  const { lens, image, values: v } = r;
  const kinds = lens.ideal ? [['thick', 'Ideal thin lens', '--series-1']] : [['thick', 'Thick lens', '--series-1'], ['thin', 'Thin-lens formula, from the centre', '--series-3']];
  const scan = imageScan({ thick: { matrix: lens.matrix }, thin: { matrix: thinModel(lens) } }, scanReach(lens.efl, v.objectDistanceMm));
  const g = scanGraphs(scan, kinds, {
    xLabel: `Object distance before ${lens.ideal ? 'the lens' : 'V₁'} (mm)`, imageLabel: `Image distance after ${lens.ideal ? 'the lens' : 'V₂'} (mm)`,
    current: image.atInfinity ? null : { d: v.objectDistanceMm, image: image.fromLast, magnification: image.magnification },
    focal: { z: lens.ffl, label: 'F', ref: lens.efl },
  });
  return { image: g.image, magnification: g.magnification };
}

// ---------------------------------------------------------------- figures
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const BEAM = '#d9480f', FIELD = '#6741d9', INK = '#2b3240', LENS = '#2b6cb0', IMAGE = '#2f855a', FAINT = '#8a93a3';

function diagramSVG(g, label, clipId) {
  const [lo, hi] = g.z, W = hi - lo, font = W / 30, H = Math.max(2 * g.yMax + 3 * font, 0.3 * W);
  const u = W / 400;
  const pts = p => p.map(([z, y]) => `${z.toFixed(4)},${(-y).toFixed(4)}`).join(' ');
  const text = (z, y, s, { size = font, anchor = 'middle', fill = INK } = {}) => `<text x="${z}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${s}</text>`;
  // An arrow from the axis to height h at z.
  const arrow = (z, h, color, dashed = false) => {
    const a = Math.min(3 * u, Math.abs(h) / 3), s = h > 0 ? 1 : -1;
    return `<g stroke="${color}" stroke-width="${1.6 * u}" fill="none"${dashed ? ` stroke-dasharray="${3 * u} ${2 * u}"` : ''}><line x1="${z}" y1="0" x2="${z}" y2="${-h}"/>`
      + `<polyline points="${z - a},${-h + s * a} ${z},${-h} ${z + a},${-h + s * a}" stroke-dasharray="none"/></g>`;
  };
  let body = `<rect x="${lo}" y="${-H / 2}" width="${W}" height="${H}" fill="#ffffff"/>`;
  body += `<defs><clipPath id="${clipId}"><rect x="${lo}" y="${-H / 2}" width="${W}" height="${H}"/></clipPath></defs><g clip-path="url(#${clipId})">`;
  body += `<line x1="${lo}" y1="0" x2="${hi}" y2="0" stroke="${FAINT}" stroke-width="${u}" stroke-dasharray="${4 * u} ${3 * u}"/>`;
  for (const ray of g.extend) body += `<polyline points="${pts(ray)}" fill="none" stroke="${BEAM}" stroke-width="${0.8 * u}" stroke-dasharray="${2.5 * u} ${2 * u}" opacity="0.7"/>`;
  for (const ray of g.rays) body += `<polyline points="${pts(ray)}" fill="none" stroke="${BEAM}" stroke-width="${1.1 * u}" stroke-linejoin="round" opacity="0.85"/>`;
  for (const ray of g.field ?? []) body += `<polyline points="${pts(ray)}" fill="none" stroke="${FIELD}" stroke-width="${1.1 * u}" stroke-linejoin="round" opacity="0.85"/>`;
  for (const lens of g.lenses) {
    if (lens.outline) { body += `<polygon points="${pts(lens.outline)}" fill="#cfe3f5" fill-opacity="0.75" stroke="${LENS}" stroke-width="${u}"/>`; continue; }
    // The ideal lens: a line across its diameter, its arrowheads pointing
    // out for a converging lens and in for a diverging one.
    const z = lens.z, d = lens.half, a = 4 * u, s = lens.diverging ? -1 : 1;
    body += `<g stroke="${LENS}" stroke-width="${2 * u}" fill="none"><line x1="${z}" y1="${-d}" x2="${z}" y2="${d}"/>`
      + `<polyline points="${z - a},${-d + s * a} ${z},${-d} ${z + a},${-d + s * a}"/><polyline points="${z - a},${d - s * a} ${z},${d} ${z + a},${d - s * a}"/></g>`;
  }
  if (g.object) body += arrow(g.object.z, g.object.height, INK);
  if (g.intermediate) body += arrow(g.intermediate.z, g.intermediate.height, FAINT, true);
  if (g.image) body += arrow(g.image.z, g.image.height, IMAGE, !g.image.real);
  // Points on the axis, merged where two coincide: a label per place.
  const points = [];
  for (const [z, name] of g.points) {
    const same = points.find(p => Math.abs(p.z - z) < 0.6 * font);
    if (same) same.names.push(name); else points.push({ z, names: [name] });
  }
  for (const p of points) body += `<circle cx="${p.z}" cy="0" r="${2.2 * u}" fill="${INK}"/>${text(p.z, font * 1.2, p.names.join(' = '))}`;
  for (const [z, name] of g.planes ?? []) {
    body += `<line x1="${z}" y1="${-g.yMax}" x2="${z}" y2="${g.yMax}" stroke="#5b6475" stroke-width="${0.7 * u}" stroke-dasharray="${2 * u} ${2 * u}"/>`;
  }
  // Plane labels side by side when the planes are close.
  const planes = g.planes ?? [];
  if (planes.length === 2 && Math.abs(planes[1][0] - planes[0][0]) < 2 * font) {
    const [left, right] = [...planes].sort((a, b) => a[0] - b[0]);
    body += text(left[0] - font * 0.2, -g.yMax - font * 0.3, left[1], { anchor: 'end' }) + text(right[0] + font * 0.2, -g.yMax - font * 0.3, right[1], { anchor: 'start' });
  } else for (const [z, name] of planes) body += text(z, -g.yMax - font * 0.3, name);
  for (const [z, name, anchor] of g.labels ?? []) body += text(z, g.yMax * 0.8 + font * 1.1, name, { size: 0.85 * font, anchor });
  body += '</g>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${lo} ${-H / 2} ${W} ${H}" font-family="Helvetica, Arial, sans-serif" role="img" aria-label="${esc(label)}">${body}</svg>`;
}

// One figure: its host elements, drawn from a result, with its canvas link.
function figureFor(prefix) {
  const el = id => document.getElementById(`${prefix}-${id}`);
  const figure = el('figure'), caption = el('caption'), note = el('note'), open = el('open');
  let token = 0;
  return (r, draw) => {
    figure.classList.toggle('is-stale', !r.ok);
    if (!r.ok) {
      caption.textContent = 'The figure shows the last valid setup: correct the inputs to update it.';
      open.setAttribute('aria-disabled', 'true');
      return;
    }
    const { svg, text, scene } = draw(r);
    caption.textContent = text;
    figure.innerHTML = svg(text);
    note.textContent = scene.ok ? scene.note : `The canvas cannot hold this setup: ${scene.reasons.join('; ')}.`;
    const mine = ++token;
    open.setAttribute('aria-disabled', 'true');
    if (!scene.ok) return;
    buildShareURL(JSON.stringify(scene.scene), new URL('../../sketch/', window.location.href).href)
      .then(url => { if (mine === token) { open.href = url; open.removeAttribute('aria-disabled'); } })
      .catch(() => { if (mine === token) open.removeAttribute('href'); });
  };
}

const drawImaging = figureFor('preview');
function imagingFigure(r) {
  const g = r.diagram, m = g.marks;
  g.points = [[m.F, 'F'], [m.F2, 'F′']];
  if (!r.lens.ideal) {
    g.planes = [[m.H, 'H'], [m.H2, 'H′']];
    const apart = m.V2 - m.V1 > 0.1 * (g.z[1] - g.z[0]);
    g.labels = [[m.V1, 'V₁', apart ? 'middle' : 'end'], [m.V2, 'V₂', apart ? 'middle' : 'start']];
  }
  const text = `To scale, in the plane of the axis: the object, ${r.lens.ideal ? 'the ideal lens' : 'the lens with its vertices V₁ and V₂ and its principal planes H and H′'}, its focal points F and F′, and three rays from the object’s tip: parallel to the axis, through F, and toward ${r.lens.ideal ? 'the lens’s centre' : 'H (leaving H′ at the same angle)'}${r.image.atInfinity ? '' : `. They meet at the ${r.image.real ? 'real image' : 'virtual image, drawn dashed with the rays’ backward extensions'}`}.`;
  return { svg: label => diagramSVG(g, label, 'imaging-clip'), text, scene: imagingCanvasScene(r) };
}

mountCalculator({
  inputs: IMAGING_INPUTS, defaults: IMAGING_DEFAULTS, hideInactive: true, charts: ['image', 'magnification'],
  groups: { object: { title: 'Object' }, lens: { title: 'Lens' }, size: { title: 'Dimensions' } },
  // The figure is drawn first: the notes read what it left off.
  compute: raw => { const r = computeImaging(raw); if (r.ok) r.diagram = imagingDiagram(r); return r; },
  rows, notes, graphs,
  onResult: r => drawImaging(r, imagingFigure),
});

// ---------------------------------------------------------------- two lenses
const TYPE = { keplerian: 'Keplerian telescope', galilean: 'Galilean telescope' };

function pairRows(r) {
  const { l1, l2, values: v } = r;
  const key = [{ group: r.telescope ? `${TYPE[r.telescope.kind]}${v.pairObject === 'infinity' ? '' : ', as a relay'}` : 'Two lenses, focusing' }];
  if (r.telescope) key.push(['Angular magnification', r.telescope.angular, '', 5], ['Beam expansion (heights)', r.telescope.expansion, '', 5]);
  else key.push(mmRow('Focal length of the pair', r.cardinal.efl));
  key.push(mmRow('Gap, lens 1 to lens 2 (vertices)', r.gapMm), mmRow('Length, first to last vertex', r.lengthMm));
  if (r.image && !r.image.atInfinity) key.push(mmRow('Image after lens 2', r.image.fromLast), ['Magnification m', r.image.magnification, '', 5]);

  const lensTable = (lens, name) => [{ group: `${name}: ${KIND[lens.kind]}` }, ...lensRows(lens)];
  const system = [{ group: 'Their spacing' }, mmRow(r.values.spacing === 'afocal' ? 'H′ of lens 1 to H of lens 2 (f₁ + f₂)' : 'H′ of lens 1 to H of lens 2', r.gapMm + l2.h1Mm - l1.h2Mm)];
  if (r.values.spacing === 'afocal') system.push(mmRow('Gap by the thin-lens model', r.thinGapMm), mmRow('Thin-lens model’s error in the gap', r.thinGapMm - r.gapMm));
  if (r.cardinal) {
    system.push({ group: 'The pair as one lens' }, mmRow('Focal length f', r.cardinal.efl), mmRow('Back focal length (after lens 2)', r.cardinal.bfl),
      mmRow('Front focal length (before lens 1)', r.cardinal.ffl), ['H from lens 1’s V₁', signed(r.cardinal.h1Mm)], ['H′ from lens 2’s V₂', signed(r.cardinal.h2Mm)]);
    if (r.thinCardinal) system.push(mmRow('f by the thin-lens model', r.thinCardinal.efl));
  } else if (r.telescope?.thinAngular !== null) system.push(['Angular magnification, thin-lens model', r.telescope.thinAngular, '', 5]);

  const light = [];
  if (v.pairObject === 'infinity') {
    light.push({ group: 'The collimated beam' });
    if (r.beam.diameterMm !== undefined) light.push(mmRow('Diameter out', r.beam.diameterMm), ['Field angle out (paraxial)', r.beam.angleDeg, '°', 4]);
    else light.push(mmRow('Focus after lens 2', r.beam.focusFromLast), ['Focus', r.beam.focusFromLast > 0 ? 'real' : 'virtual (before lens 2’s back vertex)']);
  } else {
    light.push({ group: 'The object and its image' }, mmRow('Object before lens 1', r.objectDistanceMm));
    if (r.intermediate.atInfinity) light.push(['Image by lens 1 alone', 'at infinity']);
    else light.push(mmRow('Image by lens 1 alone, after its V₂', r.intermediate.z - l1.thicknessMm));
    if (r.image.atInfinity) light.push(['Final image', 'at infinity']);
    else light.push(mmRow('Final image after lens 2', r.image.fromLast), ['Magnification m', r.image.magnification, '', 6], mmRow('Image height', r.image.heightMm), ['Image', nature(r.image)]);
    const thin = r.thinImage;
    light.push({ group: 'Thin-lens model' }, thin.atInfinity ? ['Final image', 'at infinity'] : mmRow('Final image after lens 2', thin.fromLast));
    if (!thin.atInfinity) light.push(['Magnification', thin.magnification, '', 6]);
  }
  if (l1.efl > 0) light.push({ group: 'Fourier plane' }, mmRow('Lens 1’s back focal plane, after its V₂', l1.bfl));
  return { 'pair-key': key, 'pair-l1': lensTable(l1, 'Lens 1'), 'pair-l2': lensTable(l2, 'Lens 2'), 'pair-system': system, 'pair-image': light };
}

function pairNotes(r) {
  const out = [];
  const t = r.telescope;
  if (t?.kind === 'keplerian') out.push(`Keplerian: both lenses converge, the image is inverted (angular magnification ${formatNumber(t.angular, 4)}), and a collimated beam comes to a real focus between them, in lens 1’s back focal plane.`);
  if (t?.kind === 'galilean') out.push(`Galilean: one lens diverges, the image is upright (angular magnification +${formatNumber(t.angular, 4)}), and there is no real focus inside: a collimated beam is never concentrated to a point between the lenses, and the pair is shorter than a Keplerian one of the same magnification.`);
  if (r.values.spacing === 'afocal' && !(r.l1.ideal && r.l2.ideal)) out.push(`Spaced by the thin-lens model, f₁ + f₂ between the lenses’ centres, the gap would be ${mmText(Math.abs(r.thinGapMm - r.gapMm))} ${r.thinGapMm > r.gapMm ? 'too long' : 'too short'}: the principal planes, not the centres, are f₁ + f₂ apart.`);
  if (r.values.pairObject === 'focal' && r.image && !r.image.atInfinity) out.push(`The 4f relay: the object in lens 1’s front focal plane is imaged into lens 2’s back focal plane with m = −f₂/f₁, and lens 1’s back focal plane between them holds the object’s Fourier transform (its angular spectrum).`);
  if (r.values.pairObject !== 'infinity' && r.image && !r.image.atInfinity && !r.image.real) out.push('The final image is virtual: the light leaving lens 2 diverges as if from it, drawn dashed.');
  if (r.values.pairObject !== 'infinity' && !r.thinImage.atInfinity && !r.image.atInfinity) out.push('The thin-lens model images the same object, a distance before lens 1’s V₁, through thin lenses at the lenses’ centres; its error is the thickness’s effect.');
  const g = r.diagram;
  if (g?.outside) out.push('Some rays drawn meet a lens outside its clear diameter: a real lens of that size would cut them.');
  if (g?.imageNote) out.push(g.imageNote);
  out.push('Paraxial optics: exact for rays close to the axis; aberrations are not included.');
  return out;
}

function pairGraphs(r) {
  const both = r.l1.ideal && r.l2.ideal;
  const kinds = both ? [['thick', 'Ideal thin lenses', '--series-1']] : [['thick', 'Thick lenses', '--series-1'], ['thin', 'Thin-lens model', '--series-3']];
  const finite = r.image && !r.image.atInfinity;
  const scan = imageScan({ thick: { matrix: r.system, afocal: r.afocal }, thin: { matrix: r.thin, afocal: r.thinAfocal } },
    scanReach(r.cardinal && Math.abs(r.cardinal.efl) < 4 * Math.abs(r.l1.efl) ? r.cardinal.efl : r.l1.efl, r.objectDistanceMm ?? 0));
  const focal = r.cardinal ? { z: r.cardinal.ffl, label: 'F', ref: r.cardinal.efl } : { z: r.l1.ffl, label: 'F₁', ref: r.l2.efl * Math.max(1, Math.abs(r.l2.efl / r.l1.efl)) };
  const g = scanGraphs(scan, kinds, {
    xLabel: 'Object distance before lens 1 (mm)', imageLabel: 'Image distance after lens 2 (mm)',
    current: finite ? { d: r.objectDistanceMm, image: r.image.fromLast, magnification: r.image.magnification } : null, focal,
  });
  return { 'pair-image': g.image, 'pair-magnification': g.magnification };
}

const drawPair = figureFor('pair-preview');
function pairFigure(r) {
  const g = r.diagram, m = g.marks;
  g.points = [[m.F1, 'F₁'], [m.F1b, 'F₁′'], [m.F2, 'F₂'], [m.F2b, 'F₂′']];
  g.labels = g.lenses.map((lens, i) => [lens.z + lens.t / 2, `L${'₁₂'[i]}`, 'middle']);
  const v = r.values;
  const light = v.pairObject === 'infinity'
    ? `a collimated beam at half and all of its radius${v.fieldDeg > 0 ? `, and a beam tilted by ${formatNumber(v.fieldDeg, 3)}° through lens 1’s centre and at its edges (violet)` : ''}`
    : 'three rays from the object’s tip (parallel to the axis, through F₁ and toward lens 1’s H), two from its foot to the rim of lens 1 (violet), the image lens 1 forms (grey, dashed) and the final image';
  const text = `To scale, in the plane of the axis: lens 1 (L₁) and lens 2 (L₂) with their focal points, and ${light}.`;
  return { svg: label => diagramSVG(g, label, 'pair-clip'), text, scene: pairCanvasScene(r) };
}

mountCalculator({
  panel: 'pair', inputs: PAIR_INPUTS, defaults: PAIR_DEFAULTS, hideInactive: true, charts: ['pair-image', 'pair-magnification'],
  groups: { pair: { title: 'Spacing and light' }, l1: { title: 'Lens 1' }, l2: { title: 'Lens 2' } },
  compute: raw => { const r = computePair(raw); if (r.ok) r.diagram = pairDiagram(r); return r; },
  rows: pairRows, notes: pairNotes, graphs: pairGraphs,
  onResult: r => drawPair(r, pairFigure),
});
