// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Dispersion compensators: the spectral phase of prism and grating
// compressors and of a grating stretcher, from their geometry, and the
// canvas scene of the same layout. DOM-free.
//
// Every layout's phase is an exact plane-wave closed form
// (docs in tools/calculators-compressor-content.mjs):
//   prism pair      φ(ω) = (ω/c) (B − A)·u(ω)        Fork, Martinez & Gordon
//   grating pair    φ(ω) = (ω/c) G cos β(ω)          Treacy
//   stretcher       a grating pair of separation (s₁ + s₂ − 2f) cos β₀,
//                   to paraxial order (Martinez)
// with A, B the prisms' apexes, u the colour's direction between them, G the
// gratings' perpendicular separation and β the diffraction angle. Terms
// linear in ω (a fixed delay) are dropped. Derivatives come from Taylor
// arithmetic to third order in ω, so GDD and TOD are exact to rounding.
//
// Positions are those of the canvas scene the same function builds, so the
// page and the canvas describe one bench: test/compressor-calculator.test.js
// traces that scene and compares the canvas's own GDD reading.

import { createElement, estimatedThinLensThicknessMm } from '../../sketch/js/elements.js';
import { fresnelTransmittances } from '../../sketch/js/fresnel.js';
import { traceScene, detectorReading } from '../../sketch/js/raytrace.js';
import { DISPERSION_UNAVAILABLE, glassGVD } from '../../sketch/js/glass.js';
import { spectrumSupport } from '../../sketch/js/spectrum.js';
import { materialIndexDerivatives } from '../dispersion/materials.js';

const C_MM_PER_FS = 2.99792458e-4;
const C_UM_PER_FS = 0.299792458;
const D2R = Math.PI / 180;
export const omegaOf = wavelengthNm => 2 * Math.PI * C_UM_PER_FS * 1000 / wavelengthNm;
export const wavelengthOf = omega => 2 * Math.PI * C_UM_PER_FS * 1000 / omega;

// ------------------------------------------------------- Taylor arithmetic
// A jet is [f, f′, f″/2, f‴/6] in ε = ω − ω₀: the normalized Taylor
// coefficients, truncated after the third.
const jet = (value, slope = 0) => [value, slope, 0, 0];
const jadd = (a, b) => a.map((x, i) => x + b[i]);
const jscale = (a, k) => a.map(x => x * k);
const jmul = (a, b) => [
  a[0] * b[0], a[0] * b[1] + a[1] * b[0], a[0] * b[2] + a[1] * b[1] + a[2] * b[0],
  a[0] * b[3] + a[1] * b[2] + a[2] * b[1] + a[3] * b[0],
];
// g(f) from g and its first three derivatives at f₀ (Faà di Bruno).
const jcompose = (f, g0, g1, g2, g3) => [
  g0, g1 * f[1], g1 * f[2] + g2 * f[1] * f[1] / 2,
  g1 * f[3] + g2 * f[1] * f[2] + g3 * f[1] ** 3 / 6,
];
const jsin = f => { const s = Math.sin(f[0]), c = Math.cos(f[0]); return jcompose(f, s, c, -s, -c); };
const jcos = f => { const s = Math.sin(f[0]), c = Math.cos(f[0]); return jcompose(f, c, -s, -c, s); };
const jsqrt = f => {
  const x = f[0], r = Math.sqrt(x);
  return jcompose(f, r, 1 / (2 * r), -1 / (4 * x * r), 3 / (8 * x * x * r));
};
const jasin = f => {
  const x = f[0], q = 1 - x * x, r = Math.sqrt(q);
  return jcompose(f, Math.asin(x), 1 / r, x / (q * r), (1 + 2 * x * x) / (q * q * r));
};
// λ in µm as a jet in ω.
const jwavelengthUm = w => {
  const K = 2 * Math.PI * C_UM_PER_FS, x = w[0];
  return jcompose(w, K / x, -K / x ** 2, 2 * K / x ** 3, -6 * K / x ** 4);
};
// n(ω), or null outside the glass's fit domain.
function jindex(material, w) {
  const um = jwavelengthUm(w);
  const d = materialIndexDerivatives(material, um[0] * 1000);
  return d ? jcompose(um, d.n, d.n1, d.n2, d.n3) : null;
}

// --------------------------------------------------------------- geometry
const rotate = ([x, y], deg) => {
  const a = deg * D2R;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const vmul = (a, k) => [a[0] * k, a[1] * k];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1];
const vcross = (a, b) => a[0] * b[1] - a[1] * b[0];
const unit = a => vmul(a, 1 / Math.hypot(a[0], a[1]));
const angleOf = d => Math.atan2(d[1], d[0]) / D2R;
// Where the ray p + t d meets the line through a and b: t, and u along a→b.
function meet(p, d, a, b) {
  const e = vsub(b, a), den = vcross(d, e);
  if (Math.abs(den) < 1e-15) return null;
  const w = vsub(a, p);
  return { t: vcross(w, e) / den, u: vcross(w, d) / den };
}
// Snell's law in vector form at a face with unit normal `normal`.
function refract(d, normal, n1, n2) {
  const nn = vdot(d, normal) < 0 ? normal : vmul(normal, -1);
  const cosI = -vdot(d, nn), ratio = n1 / n2;
  const k = 1 - ratio * ratio * (1 - cosI * cosI);
  if (k < 0) return null;
  return { d: unit(vadd(vmul(d, ratio), vmul(nn, ratio * cosI - Math.sqrt(k)))), cosI, cosT: Math.sqrt(k) };
}

// The prism element's corners in world coordinates (elements.js: apex at
// (0, −size/2), base corners at (±size·tan(α/2), size/2), rotated by rot).
function prismCorners(el) {
  const h = el.params.psize, hb = h * Math.tan(el.params.apex * D2R / 2);
  const world = p => vadd([el.x, el.y], rotate(p, el.rot));
  return { apex: world([0, -h / 2]), left: world([-hb, h / 2]), right: world([hb, h / 2]) };
}

// A prism whose `face` ('left' or 'right' of its own frame) is crossed at
// world point `hit`, `depth` mm from the apex along that face.
function prismAt(material, apexDeg, size, rot, hit, face, depth) {
  const hb = size * Math.tan(apexDeg * D2R / 2);
  const top = [0, -size / 2], corner = [face === 'left' ? -hb : hb, size / 2];
  const e = unit(vsub(corner, top));
  const w = rotate(vadd(top, vmul(e, depth)), rot);
  const el = createElement('prism', hit[0] - w[0], hit[1] - w[1]);
  el.rot = rot;
  Object.assign(el.params, { apex: apexDeg, psize: size, material });
  return el;
}

// One wavelength's ray from `p` along `d` through one prism: the exit point
// and direction, the glass path and the cosines at both faces; null on total
// internal reflection or if it misses the far face.
function throughPrism(el, hit, d, n) {
  const { apex, left, right } = prismCorners(el);
  // From a point before the face, so the entrance is found even when `hit`
  // lies on it.
  const p = vsub(hit, vmul(d, 10));
  const faces = [[apex, left], [apex, right], [left, right]];
  let entry = null;
  for (const [a, b] of faces) {
    const m = meet(p, d, a, b);
    if (m && m.t > 1e-9 && m.u >= -1e-9 && m.u <= 1 + 1e-9 && (!entry || m.t < entry.t)) entry = { ...m, a, b };
  }
  if (!entry) return null;
  const q = vadd(p, vmul(d, entry.t));
  const normalOf = (a, b) => { const t = unit(vsub(b, a)); return [-t[1], t[0]]; };
  const inside = refract(d, normalOf(entry.a, entry.b), 1, n);
  if (!inside) return null;
  let exit = null;
  for (const [a, b] of faces) {
    if (a === entry.a && b === entry.b) continue;
    const m = meet(q, inside.d, a, b);
    if (m && m.t > 1e-9 && m.u >= -1e-9 && m.u <= 1 + 1e-9 && (!exit || m.t < exit.t)) exit = { ...m, a, b };
  }
  if (!exit) return null;
  const r = vadd(q, vmul(inside.d, exit.t));
  const out = refract(inside.d, normalOf(exit.a, exit.b), n, 1);
  if (!out) return null;
  return { entry: q, exit: r, d: out.d, glassMm: exit.t, faces: [[inside.cosI, inside.cosT], [out.cosI, out.cosT]] };
}

// Depth along the entrance face that gives a glass path `glassMm` to a ray
// entering at incidence θ₁ (law of sines in the apex triangle).
function depthForGlass(glassMm, apexDeg, theta1Deg, n) {
  const a = apexDeg * D2R, t2 = Math.asin(Math.sin(theta1Deg * D2R) / n);
  return glassMm * Math.cos(a - t2) / Math.sin(a);
}

// Brewster's angle at the central wavelength and the apex of a prism cut
// for minimum deviation there.
export function brewsterCut(material, wavelengthNm) {
  const n = materialIndexDerivatives(material, wavelengthNm)?.n;
  if (!n) return null;
  const theta = Math.atan(n) / D2R;
  return { thetaDeg: theta, apexDeg: 180 - 2 * theta, n };
}

// ------------------------------------------------------------ the layouts
export const LAYOUTS = [
  ['prism-pair', 'Prism pair'],
  ['four-prism', 'Four-prism sequence'],
  ['grating-pair', 'Grating pair (Treacy)'],
  ['four-grating', 'Four-grating sequence'],
  ['stretcher', 'Grating stretcher (Martinez)'],
];
const isPrism = layout => layout === 'prism-pair' || layout === 'four-prism';

// The source at the origin facing +x; the first optic at least this far
// from it (buildFigure moves it further when the drawing needs room).
const SOURCE_TO_FIRST_MM = 250;
// A double pass ends on a mirror at least END_MIRROR_GAP_MM past the last
// optic; its return leaves the input line at a beamsplitter PICKOFF_GAP_MM
// past the source (or past the block of glass that carries the input chirp).
const END_MIRROR_GAP_MM = 120;
const PICKOFF_GAP_MM = 78;
const SOURCE_FRONT_MM = 52;

// Place a prism pair whose first prism the central ray enters at `hit`,
// travelling along `dir`. `mirror` builds the mirror image (the second half
// of a four-prism sequence).
function placePrismPair(g, hit, dir, glass1, glass2, mirror) {
  const axis = angleOf(dir);
  // Turned so the ray meets the entrance face at the chosen incidence.
  const rot1 = mirror ? axis + 180 - (g.thetaDeg - g.apexDeg / 2) : axis + g.thetaDeg - g.apexDeg / 2;
  const [f1, f2] = mirror ? ['right', 'left'] : ['left', 'right'];
  const p1 = prismAt(g.material, g.apexDeg, g.sizeMm, rot1,
    hit, f1, depthForGlass(glass1, g.apexDeg, g.thetaDeg, g.n0));
  const t1 = throughPrism(p1, hit, dir, g.n0);
  if (!t1) return null;
  // The second prism inverted, its faces parallel to the first's; the
  // central ray leaves it on the far face at the same incidence.
  const hit2 = vadd(t1.exit, vmul(t1.d, g.separationMm));
  const theta2 = Math.asin(g.n0 * Math.sin(g.apexDeg * D2R - Math.asin(Math.sin(g.thetaDeg * D2R) / g.n0))) / D2R;
  const p2 = prismAt(g.material, g.apexDeg, g.sizeMm, rot1 + 180,
    hit2, f2, depthForGlass(glass2, g.apexDeg, theta2, g.n0));
  const t2 = throughPrism(p2, hit2, t1.d, g.n0);
  if (!t2) return null;
  return { prisms: [p1, p2], legs: [t1, t2], apexes: [prismCorners(p1).apex, prismCorners(p2).apex], exit: t2.exit, dir: t2.d, inDir: dir, mirror };
}

function gratingAt(hit, rot, lines, order, length) {
  const el = createElement('grating', hit[0], hit[1]);
  el.rot = rot;
  Object.assign(el.params, { lines, orders: String(order), transmissive: false, length });
  return el;
}

// Diffraction by a reflective grating whose line is along t = rot(0, 1):
// the tangential component gains m λ/d (the canvas's convention).
function diffract(d, rot, order, wavelengthNm, lines) {
  const t = rotate([0, 1], rot), normal = [-t[1], t[0]];
  const sOut = vdot(d, t) + order * wavelengthNm * lines * 1e-6;
  if (Math.abs(sOut) >= 1) return null;
  const side = vdot(d, normal) >= 0 ? -1 : 1;
  return vadd(vmul(normal, side * Math.sqrt(1 - sOut * sOut)), vmul(t, sOut));
}

function placeGratingPair(g, hit, dir, mirror) {
  const axis = angleOf(dir);
  const rot = mirror ? axis - g.incidenceDeg : axis + g.incidenceDeg;
  const order = mirror ? -1 : 1;
  const g1 = gratingAt(hit, rot, g.lines, order, g.sizeMm);
  const d1 = diffract(dir, rot, order, g.wavelengthNm, g.lines);
  if (!d1) return null;
  const t = rotate([0, 1], rot), normal = [-t[1], t[0]];
  const cosBeta = Math.abs(vdot(d1, normal));
  const hit2 = vadd(hit, vmul(d1, g.separationMm / cosBeta));
  const g2 = gratingAt(hit2, rot, g.lines, -order, g.sizeMm);
  const d2 = diffract(d1, rot, -order, g.wavelengthNm, g.lines);
  if (!d2) return null;
  return { gratings: [g1, g2], hits: [hit, hit2], exit: hit2, dir: d2, between: d1, rot, order, cosBeta, separationMm: g.separationMm };
}

// One wavelength's ray from p along d through `optics` in order: its points,
// the direction it leaves in and the glass it crossed in each prism, or null
// where it misses one or the glass has no index there.
function follow(optics, p, d, wavelengthNm) {
  const points = [p], glass = [];
  for (const el of optics) {
    if (el.type === 'prism') {
      const n = materialIndexDerivatives(el.params.material, wavelengthNm)?.n;
      const t = n && throughPrism(el, p, d, n);
      if (!t) return null;
      points.push(t.entry, t.exit);
      glass.push(t.glassMm);
      p = t.exit; d = t.d;
      continue;
    }
    const half = (el.params.length ?? el.params.dia) / 2;
    const t = rotate([0, 1], el.rot), c = [el.x, el.y];
    const m = meet(p, d, vsub(c, vmul(t, half)), vadd(c, vmul(t, half)));
    if (!m || m.t < 1e-9 || m.u < -1e-9 || m.u > 1 + 1e-9) return null;
    p = vadd(p, vmul(d, m.t));
    points.push(p);
    const normal = [-t[1], t[0]];
    if (el.type === 'mirror') d = vsub(d, vmul(normal, 2 * vdot(d, normal)));
    else if (el.type === 'grating') {
      d = diffract(d, el.rot, Number(el.params.orders), wavelengthNm, el.params.lines);
      if (!d) return null;
    } else if (el.type === 'lens') {
      const h = vdot(vsub(p, c), t), axis = vdot(d, normal) >= 0 ? normal : vmul(normal, -1);
      d = unit(vadd(axis, vmul(t, vdot(d, t) / vdot(d, axis) - h / el.params.f)));
    }
  }
  return { points, p, d, glass };
}

// The canvas elements after the last optic. A double pass ends on a flat
// mirror square to the colours, which leave a pair parallel: each colour
// comes back along its own path, so the return is the input beam again,
// recompressed, with the colours on top of each other (no spatial chirp) and
// exactly twice one pass's phase. In the plane of the figure it retraces the
// input, so a beamsplitter on the input line sends it out (in the lab the end
// mirror is tipped out of the plane and a pickoff above the input takes it
// without loss); a beam dump takes the input's reflection. Then an
// autocorrelator on the output, sized from the band's edges, traced.
function finish(source, optics, exit, dir, passes, v, firstMm, pickoffX) {
  const out = [];
  // The scene's gratings diffract with the efficiency entered, as the
  // page's transmission does.
  for (const el of optics) if (el.type === 'grating') el.params.efficiency = v.efficiencyPct;
  // The band's edges, beyond the FWHM (the canvas samples a Gaussian out to
  // ±3σ, 1.27 FWHM).
  const colours = [v.wavelengthNm, v.wavelengthNm - 1.3 * v.bandwidthNm, v.wavelengthNm + 1.3 * v.bandwidthNm];
  const begin = [firstMm - 50, 0];
  const left = [-dir[1], dir[0]];
  // A colour that misses an optic is left out here; buildFigure's trace
  // finds it and says so.
  const ends = colours.map(nm => follow(optics, begin, [1, 0], nm)).filter(Boolean);
  // Where each colour crosses the line through `at` across the beam.
  const across = at => ends.map(e => meet(e.p, e.d, at, vadd(at, left))?.u ?? 0);
  // One pass of a single pair leaves the colours side by side: their offset
  // at the FWHM edges, measured across the output.
  const edges = [v.wavelengthNm - v.bandwidthNm / 2, v.wavelengthNm + v.bandwidthNm / 2].map(nm => follow(optics, begin, [1, 0], nm));
  const sideBySide = edges.every(Boolean) ? Math.abs(meet(edges[0].p, edges[0].d, edges[1].p, vadd(edges[1].p, left))?.u ?? 0) : null;
  let outPoint, outDir, width;
  if (passes === 2) {
    // Past any optic in the output's way: reflective gratings send the light
    // back, so an earlier one can lie ahead of the last.
    let gap = END_MIRROR_GAP_MM;
    for (let moved = true; moved;) {
      moved = false;
      for (const el of optics) {
        const half = (el.params.length ?? el.params.psize ?? el.params.dia ?? 25) / 2;
        const along = vdot(vsub([el.x, el.y], exit), dir), aside = Math.abs(vdot(vsub([el.x, el.y], exit), left));
        if (along > 1e-6 && along + half + 30 > gap && aside < half + 20) { gap = along + half + 30; moved = true; }
      }
    }
    const at = vadd(exit, vmul(dir, gap));
    const xs = across(at);
    const centre = vadd(at, vmul(left, (Math.max(...xs) + Math.min(...xs)) / 2));
    const end = createElement('mirror', centre[0], centre[1]);
    end.rot = angleOf(dir);
    end.params.length = Math.max(25.4, Math.ceil(Math.max(...xs) - Math.min(...xs) + 12));
    out.push(end);
    // The return leaves the beamsplitter to the side of the figure the
    // optics leave free; the input's reflection goes the other way, to a dump.
    const meanY = optics.reduce((sum, el) => sum + el.y, 0) / optics.length;
    const outSide = meanY > 0 ? -1 : 1;
    const split = createElement('bs', pickoffX, 0);
    split.rot = outSide > 0 ? 0 : 90;
    out.push(split);
    const dump = createElement('beamdump', pickoffX, -outSide * 60);
    dump.rot = angleOf([0, -outSide]);
    out.push(dump);
    outPoint = [pickoffX, 0];
    outDir = [0, outSide];
    width = 0;
  } else {
    // Centred on the band, which one pass of a pair leaves side by side.
    const xs = across(vadd(exit, vmul(dir, 150)));
    outPoint = vadd(exit, vmul(left, (Math.max(...xs) + Math.min(...xs)) / 2)); outDir = dir;
    width = Math.max(...xs) - Math.min(...xs);
  }
  // A plain detector stands in for the autocorrelator, which only the canvas
  // registers (its module also drives the canvas's palette); the scene
  // "Open in the canvas" sends has the autocorrelator in its place
  // (canvasScene).
  const ac = createElement('detector', outPoint[0] + outDir[0] * 150, outPoint[1] + outDir[1] * 150);
  ac.rot = angleOf(outDir);
  ac.params.aperture = Math.min(120, Math.max(30, 2 * Math.ceil((1.3 * width + 20) / 2)));
  out.push(ac);
  return { elements: [...source, ...optics, ...out], outputChirpMm: passes === 2 ? 0 : sideBySide };
}

// The layout's geometry and canvas scene, or { error } when it cannot be
// built (total internal reflection, an evanescent order, a ray that misses).
// The chirp being compensated, as the scene carries it (`v.sceneChirp`,
// from the calculator): a block of the material before the compensator, or
// the source's own chirp setting (GDD only).
export function buildLayout(v, firstMm = SOURCE_TO_FIRST_MM) {
  const laser = createElement('pulsedlaser', 0, 0);
  const sourceGdd = v.sceneChirp?.gddFs2 ?? 0;
  Object.assign(laser.params, {
    wavelength: v.wavelengthNm, beamMode: 'line', transformLimited: false, bandwidth: v.bandwidthNm,
    pulseShape: v.shape, pulseWidthFs: 100, chirpGddFs2: Math.abs(sourceGdd), inputChirp: sourceGdd < 0 ? 'negative' : 'positive',
    pol: v.polarization === 's' ? 90 : 0, temporalMode: 'pulsed', showPulse: false,
  });
  const source = [laser];
  const blockMm = v.sceneChirp?.block?.lengthMm ?? 0;
  if (blockMm > 0) {
    const half = 15, t = blockMm / 2;
    const block = createElement('freeglass', SOURCE_FRONT_MM + 28 + t, 0);
    Object.assign(block.params, {
      material: v.sceneChirp.block.material, scale: 1,
      vertices: [{ x: -t, y: -half }, { x: t, y: -half }, { x: t, y: half }, { x: -t, y: half }],
    });
    source.push(block);
  }
  const pickoffX = SOURCE_FRONT_MM + (blockMm > 0 ? 28 + blockMm : 0) + PICKOFF_GAP_MM;
  const start = [Math.max(firstMm, pickoffX + 120), 0];
  firstMm = start[0];
  if (isPrism(v.layout)) {
    const cut = brewsterCut(v.prismMaterial, v.wavelengthNm);
    if (!cut) return { error: 'The prism glass has no index at this wavelength.' };
    const apexDeg = v.prismCut === 'brewster' ? cut.apexDeg : v.apexDeg;
    const thetaDeg = v.prismCut === 'brewster' ? cut.thetaDeg : v.incidenceDeg;
    const g = { material: v.prismMaterial, apexDeg, thetaDeg, n0: cut.n, sizeMm: v.prismSizeMm, separationMm: v.separationMm };
    const pair = placePrismPair(g, start, [1, 0], v.insertion1Mm, v.insertion2Mm, false);
    if (!pair) return { error: 'The central ray does not cross the prism pair: check the angles, insertion and prism size.' };
    const pairs = [pair];
    if (v.layout === 'four-prism') {
      const hit = vadd(pair.exit, vmul(pair.dir, v.pairGapMm));
      const second = placePrismPair(g, hit, pair.dir, v.insertion2Mm, v.insertion1Mm, true);
      if (!second) return { error: 'The central ray does not cross the second prism pair.' };
      pairs.push(second);
    }
    const last = pairs.at(-1);
    const passes = v.layout === 'prism-pair' ? v.passes : 1;
    const optics = pairs.flatMap(p => p.prisms);
    const done = finish(source, optics, last.exit, last.dir, passes, v, firstMm, pickoffX);
    const layout = { kind: 'prism', g, pairs, passes, dimension: { a: pair.legs[0].exit, b: pair.legs[1].entry } };
    return { ...layout, ...done };
  }
  const lines = v.lines, gr = { lines, incidenceDeg: v.gratingIncidenceDeg, wavelengthNm: v.wavelengthNm, sizeMm: v.gratingSizeMm };
  if (v.layout === 'stretcher') {
    const rot = v.gratingIncidenceDeg;
    const g1 = gratingAt(start, rot, lines, 1, v.gratingSizeMm);
    const axis = diffract([1, 0], rot, 1, v.wavelengthNm, lines);
    if (!axis) return { error: 'Order −1 is evanescent at this incidence and line density.' };
    const lensAt = dist => {
      const p = vadd(start, vmul(axis, dist));
      const el = createElement('lens', p[0], p[1]);
      el.rot = angleOf(axis);
      Object.assign(el.params, { f: v.focalMm, dia: v.lensDiameterMm });
      return el;
    };
    const s = v.gratingLensMm;
    const l1 = lensAt(s), l2 = lensAt(s + 2 * v.focalMm);
    // The second grating lies along the image of the first: its line is the
    // first one's reflected about the lens axis.
    const t1 = rotate([0, 1], rot), along = vdot(t1, axis);
    const t2 = vsub(vmul(axis, 2 * along), t1);
    const rot2 = Math.atan2(-t2[0], t2[1]) / D2R;
    const hit2 = vadd(start, vmul(axis, 2 * s + 2 * v.focalMm));
    // Of the two orders, the one that makes the colours parallel again.
    const colour = (m, nm) => follow([g1, l1, l2, gratingAt(hit2, rot2, lines, m, v.gratingSizeMm)], [firstMm - 50, 0], [1, 0], nm);
    const order2 = [1, -1].find(m => {
      const a = colour(m, v.wavelengthNm - 1), b = colour(m, v.wavelengthNm + 1);
      return a && b && Math.abs(vcross(a.d, b.d)) < 1e-9;
    });
    if (!order2) return { error: 'The second grating cannot recombine the colours: check the lens and grating sizes.' };
    const g2 = gratingAt(hit2, rot2, lines, order2, v.gratingSizeMm);
    const outDir = colour(order2, v.wavelengthNm).d;
    const normal = [-t1[1], t1[0]];
    const cosBeta = Math.abs(vdot(axis, normal));
    const done = finish(source, [g1, l1, l2, g2], hit2, outDir, v.passes, v, firstMm, pickoffX);
    const layout = { kind: 'stretcher', gr, cosBeta, axis, passes: v.passes,
      effectiveSeparationMm: (2 * s - 2 * v.focalMm) * cosBeta, dimension: { a: start, b: [l1.x, l1.y] } };
    return { ...layout, ...done };
  }
  const pair = placeGratingPair({ ...gr, separationMm: v.gratingSeparationMm }, start, [1, 0], false);
  if (!pair) return { error: 'Order −1 is evanescent at this incidence and line density.' };
  const pairs = [pair];
  if (v.layout === 'four-grating') {
    // Reflective gratings send the light back toward the source, and the
    // mirror-image second pair returns it to the input line: the gap is set
    // so that its last grating lands past the first one, clear of the input.
    // Between the pairs the colours travel parallel, so the gap does not
    // change the dispersion.
    const extent = pair.exit[0] - start[0];
    const gap = Math.max(v.gratingSizeMm + 40 - 2 * extent, 50);
    const hit = vadd(pair.exit, vmul(pair.dir, gap));
    const second = placeGratingPair({ ...gr, separationMm: v.gratingSeparationMm }, hit, pair.dir, true);
    if (!second) return { error: 'Order −1 is evanescent at the second pair.' };
    pairs.push(second);
  }
  const last = pairs.at(-1);
  const passes = v.layout === 'grating-pair' ? v.passes : 1;
  const optics = pairs.flatMap(p => p.gratings);
  const done = finish(source, optics, last.exit, last.dir, passes, v, firstMm, pickoffX);
  const layout = { kind: 'grating', gr, pairs, passes, dimension: { a: pair.hits[0], b: pair.hits[1] } };
  return { ...layout, ...done };
}

// The layout as a canvas scene whose own tracer delivers the whole band the
// source sends to the autocorrelator: no colour lost to an optic too small
// or sent astray by a beam crossing an optic on the way. Reflective gratings
// fold the light back over the input, so where a colour goes missing the
// bench moves further from the source (which changes nothing in the
// dispersion) until none does. Where no distance works, the layout comes
// back with `figureIssue`; the numbers never depend on it. The canvas flags
// a gap inside the band (its partial fan); the band's edges, whose weak
// colours that test lets go, must arrive too. A band that arrives whole can
// still have taken the wrong path (near Littrow, a colour bounced back off the
// first grating), and then the colours leave at different angles: every
// bench here sends them out parallel, so the canvas finding angular
// dispersion at the detector marks the figure wrong too. Only missing or
// misdirected colours count: how much light each delivers (Fresnel loss
// across the band, grating efficiency) and the canvas's GDD reading (its lens
// glass, its fit to traced colours) follow the canvas's own models, which
// differ from the page's without any fault in the drawing.
const FIRST_OPTIC_MM = [SOURCE_TO_FIRST_MM, 400, 600, 900, 1300, 2000];
// The canvas's note where the colours reaching a detector still diverge.
const ANGULAR_DISPERSION = 'angular dispersion remains';

// The GDD the canvas adds for its lenses' glass: it gives each thin lens an
// estimated thickness of N-BK7, crossed once a pass. The page's lenses are
// ideal and glassless.
export function lensGlassGddFs2(layout, v) {
  return (layout.elements ?? []).filter(el => el.type === 'lens')
    .reduce((sum, el) => sum + glassGVD('nbk7', v.wavelengthNm) * estimatedThinLensThicknessMm(el.params) * layout.passes, 0);
}

// The band the canvas spreads the source's colours over (a Gaussian band
// out to its support, whatever the pulse shape), and whether a reading
// reaches both of its edges.
function wholeBand(reading, v) {
  const [lo, hi] = spectrumSupport({ kind: 'gauss', center: v.wavelengthNm, fwhm: v.bandwidthNm });
  const tol = 1e-6 * v.wavelengthNm;
  return reading.bandMin <= lo + tol && reading.bandMax >= hi - tol;
}

export function buildFigure(v) {
  let layout = null;
  for (const firstMm of FIRST_OPTIC_MM) {
    layout = buildLayout(v, firstMm);
    if (layout.error) return layout;
    traceScene(layout.elements);
    const reading = detectorReading(layout.elements.at(-1).id);
    const pulse = reading?.pulse;
    const model = String(pulse?.dispersionModel ?? '');
    if (Number.isFinite(pulse?.gddFs2) && !model.includes(DISPERSION_UNAVAILABLE.partialFan)
      && !model.includes(ANGULAR_DISPERSION) && wholeBand(reading, v)) return layout;
  }
  return { ...layout, figureIssue: layout.kind === 'prism'
    ? 'In the plane of the figure part of the band misses a prism or the detector (the colours spread wider than the optics), so the drawing and the canvas scene do not deliver the whole band; larger prisms would.'
    : 'In the plane of the figure a beam crosses an optic or is clipped (near Littrow, for instance, the beam leaving the second grating runs back across the first), so the drawing and the canvas scene do not deliver the whole band along the designed path. Real benches separate such beams in height; larger optics help where the colours are clipped.' };
}

// The scene as the canvas opens it: the output detector becomes an
// autocorrelator of the same size, which reads the pulse duration.
export function canvasScene(layout) {
  const elements = layout.elements.map((el, i) => i === layout.elements.length - 1
    ? { id: el.id, type: 'autocorrelator', x: el.x, y: el.y, rot: el.rot, label: '', showLabel: false, params: { aperture: el.params.aperture } }
    : el);
  return { app: 'optics2d', version: 1, elements, beams: [] };
}

// ------------------------------------------------------------- the phases
// The compressor's spectral phase as a jet at ω (rad, fs), or null where a
// colour cannot pass (no index, total internal reflection, evanescent).
export function phaseJet(layout, omega) {
  const w = jet(omega, 1);
  const k = jscale(w, 1 / C_MM_PER_FS);
  if (layout.kind === 'prism') {
    const { g } = layout;
    const n = jindex(g.material, w);
    if (!n) return null;
    const alpha = g.apexDeg * D2R, s1 = Math.sin(g.thetaDeg * D2R);
    // θ₂ = asin(sin θ₁ / n), θ₄ = asin(n sin(α − θ₂)), deviation θ₁ + θ₄ − α.
    const inv = jcompose(n, 1 / n[0], -1 / n[0] ** 2, 2 / n[0] ** 3, -6 / n[0] ** 4);
    const sin2 = jscale(inv, s1);
    if (Math.abs(sin2[0]) >= 1) return null;
    const th3 = jadd(jet(alpha), jscale(jasin(sin2), -1));
    const sin4 = jmul(n, jsin(th3));
    if (Math.abs(sin4[0]) >= 1) return null;
    const dev = jadd(jasin(sin4), jet(g.thetaDeg * D2R - alpha));
    let total = jet(0);
    for (const pair of layout.pairs) {
      // u = cos(dev) d + sin(dev) d⊥, d the pair's input direction and d⊥
      // it turned toward the side the prism deviates the light (from the
      // traced central ray).
      const d = pair.inDir, sign = Math.sign(vcross(d, pair.legs[0].d));
      const perp = [-d[1] * sign, d[0] * sign];
      const ab = vsub(pair.apexes[1], pair.apexes[0]);
      total = jadd(total, jadd(jscale(jcos(dev), vdot(ab, d)), jscale(jsin(dev), vdot(ab, perp))));
    }
    return jscale(jmul(k, total), layout.passes);
  }
  const lam = jscale(jwavelengthUm(w), 1e-3);
  const { gr } = layout;
  const sb = jadd(jet(-Math.sin(gr.incidenceDeg * D2R)), jscale(lam, gr.lines));
  if (Math.abs(sb[0]) >= 1) return null;
  const cb = jsqrt(jadd(jet(1), jscale(jmul(sb, sb), -1)));
  const G = layout.kind === 'stretcher' ? layout.effectiveSeparationMm
    : layout.pairs.length * layout.pairs[0].separationMm;
  return jscale(jmul(k, cb), G * layout.passes);
}

// Group delay dispersion, third- and fourth-order dispersion at ω₀, in fs²,
// fs³ and fs⁴.
export function dispersionAt(layout, wavelengthNm) {
  const w0 = omegaOf(wavelengthNm), p = phaseJet(layout, w0);
  return p ? { gddFs2: 2 * p[2], todFs3: 6 * p[3], fodFs4: fourthOrder(w => phaseJet(layout, w)?.[0] ?? NaN, w0) } : null;
}

// Fourth-order dispersion d⁴φ/dω⁴ at ω₀ in fs⁴, from a scalar phase
// function: central fourth differences at h = 0.01 and 0.02 rad/fs,
// Richardson-extrapolated (truncation O(h⁴); rounding of a 10⁷ rad phase
// about 1 fs⁴).
export function fourthOrder(phase, omega0) {
  const D = h => {
    const f = [-2, -1, 0, 1, 2].map(k => phase(omega0 + k * h));
    return f.every(Number.isFinite) ? (f[0] - 4 * f[1] + 6 * f[2] - 4 * f[3] + f[4]) / h ** 4 : NaN;
  };
  const value = (4 * D(0.01) - D(0.02)) / 3;
  return Number.isFinite(value) ? value : null;
}

// ----------------------------------------------------------- throughput
// Fresnel transmission of the prism faces at the central wavelength for
// p (in the plane of the figure, the canvas's 0°) or s light, and the
// gratings' efficiency per diffraction.
export function throughput(layout, v) {
  if (layout.kind === 'prism') {
    let T = 1;
    for (const pair of layout.pairs) {
      for (const leg of pair.legs) {
        for (const [i, [cosI]] of leg.faces.entries()) {
          const [n1, n2] = i === 0 ? [1, layout.g.n0] : [layout.g.n0, 1];
          const { Ts, Tp } = fresnelTransmittances(n1, n2, cosI);
          T *= v.polarization === 's' ? Ts : Tp;
        }
      }
    }
    return { transmission: T ** layout.passes, diffractions: 0, faces: 4 * layout.pairs.length * layout.passes };
  }
  const diffractions = 2 * (layout.kind === 'stretcher' ? 1 : layout.pairs.length) * layout.passes;
  return { transmission: (v.efficiencyPct / 100) ** diffractions, diffractions, faces: 0 };
}
