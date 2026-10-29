// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Imaging with lenses: one lens forming the image of an object, and two
// lenses as a telescope (Keplerian or Galilean), a beam expander, a relay
// (the 4f system) or a pair at any spacing. Each lens is an ideal thin lens
// or a spherical singlet of catalogue glass in air, plano-convex, bi-convex,
// plano-concave or bi-concave, given by its focal length or by its radii and
// centre thickness.
//
// Conventions, as on the thin and thick lens page (thin-thick-lens/
// thick-lens.js, whose lens data and designs this page reuses): light
// travels toward +z; a radius is positive when its centre of curvature lies
// after its vertex, 0 for a flat face; positions along the axis are signed,
// positive toward +z. An object distance is positive before the first
// vertex, an image distance positive after the last one.
//
// Paraxial (first-order) optics throughout. Each lens is its ray-transfer
// matrix from its front vertex V₁ to its back vertex V₂, [y₂, u₂] =
// [[A, B], [C, D]] [y₁, u₁] (lensData's two y–u rays for a singlet;
// [[1, 0], [−1/f, 1]] for the ideal lens); a pair is L₂ T(g) L₁, with g the
// gap from the first lens's V₂ to the second's V₁. From any such matrix: the
// image of an object d before the first vertex lies
//
//   s′ = −(A d + B)/(C d + D)   after the last vertex,   m = A + C s′,
//
// which holds for an afocal pair too (C = 0, where a telescope's angular
// magnification is D and its beam expansion A = 1/D). The Python reference
// checks these against Gaussian imaging from the principal planes, lens by
// lens, Newton's form for afocal pairs, and Gullstrand's equation.
//
// Beside the thick lenses, the thin-lens model: each singlet a thin lens at
// its centre with the lensmaker's thin-lens focal length for the same radii
// (the ideal lens is its own model), spaced by that model's own rule.
// Units: mm, angles in degrees, wavelengths in nm.

import { defaultsFor, parseInputs, unavailable } from '../assets/calculator-inputs.js';
import { GLASSES, glassWavelengthRange, isWavelengthInGlassRange } from '../../sketch/js/glass.js';
import { materialIndex, glassShortName } from '../lens-design/engine/materials.js';
import { lensData, designLens, sagMm, niceUp, GLASS_CHOICES } from '../thin-thick-lens/thick-lens.js';
import { thickLensAdjustment, registry } from '../../sketch/js/elements.js';

// Points on the image-against-object graphs.
export const SCAN_POINTS = 401;

const fmt = (x, d = 4) => String(Number(Number(x).toPrecision(d)));
const glassName = id => glassShortName(GLASSES.get(id).label);

// ---------------------------------------------------------------- matrices

// [[Ay, By], [Au, Bu]] acting on [y, u]: Ay, Au are the height and slope a
// ray entering at height 1, parallel, leaves with; By, Bu those of a ray
// entering on the axis with unit slope (lensData's convention).
export const gap = g => ({ Ay: 1, By: g, Au: 0, Bu: 1 });
export const thinLens = f => ({ Ay: 1, By: 0, Au: Number.isFinite(f) ? -1 / f : 0, Bu: 1 });
// P after Q: Q applied first.
export const times = (P, Q) => ({
  Ay: P.Ay * Q.Ay + P.By * Q.Au, By: P.Ay * Q.By + P.By * Q.Bu,
  Au: P.Au * Q.Ay + P.Bu * Q.Au, Bu: P.Au * Q.By + P.Bu * Q.Bu,
});
export const chain = (...ms) => ms.reduce((acc, m) => times(m, acc));

// The cardinal points of a system from its first vertex to its last: f,
// the back focal length (last vertex to F′), the front one (F to the first
// vertex), and the principal planes, H from the first vertex and H′ from the
// last; null for an afocal system.
export function cardinal(m, afocal = false) {
  if (afocal) return null;
  const efl = -1 / m.Au, bfl = -m.Ay / m.Au, ffl = -m.Bu / m.Au;
  return { efl, bfl, ffl, h1Mm: efl - ffl, h2Mm: bfl - efl };
}

// The image of an object d before the first vertex; `afocal` takes C = 0
// exactly (a pair spaced afocal has C at round-off). An image at infinity
// (the object in the front focal plane) has no distance. In air the matrix
// has A D − B C = 1, so m = A + C s′ = 1/(C d + D): the same value without
// subtracting two nearly equal terms when the image is tiny.
export function imageThrough(m, d, afocal = false) {
  const C = afocal ? 0 : m.Au;
  const num = m.Ay * d + m.By, den = C * d + m.Bu;
  if (!(Math.abs(den) > 1e-12 * (Math.abs(C * d) + Math.abs(m.Bu)))) return { atInfinity: true };
  return { atInfinity: false, fromLast: -num / den, magnification: 1 / den };
}

// ---------------------------------------------------------------- lenses

export const LENS_KINDS = [
  ['ideal', 'Ideal thin lens'], ['planoconvex', 'Plano-convex singlet'], ['biconvex', 'Bi-convex singlet'],
  ['planoconcave', 'Plano-concave singlet'], ['biconcave', 'Bi-concave singlet'],
];
const SINGLETS = ['planoconvex', 'biconvex', 'planoconcave', 'biconcave'];
const CONVEX = ['planoconvex', 'biconvex'], CONCAVE = ['planoconcave', 'biconcave'];

// One lens's inputs, their ids prefixed by `p` (a page holds several lenses,
// and every field's id is unique on it). `group` takes the type, `sizeGroup`
// the dimensions.
export function lensInputs(p, { group = p, sizeGroup = group, toward = 'the object', kind = 'ideal', orientation = 'convex', spec = 'focal', glass = 'nbk7', focalMm = 50, diameterMm = 25.4, edgeMm = 2, centreMm = 3, radiusMm = 25, frontRadiusMm = 50, backRadiusMm = 50 } = {}) {
  const is = kinds => ({ when: `${p}Kind`, whenValue: kinds });
  const singlet = is(SINGLETS), designed = { when: `${p}Spec`, whenValue: 'focal' }, manual = { when: `${p}Spec`, whenValue: 'radii' };
  return [
    { id: `${p}Kind`, type: 'select', group, label: 'Lens', value: kind, options: LENS_KINDS },
    { id: `${p}Orientation`, type: 'select', group, label: `Toward ${toward}`, value: orientation, ...is(['planoconvex', 'planoconcave']),
      options: [['convex', 'Curved side first'], ['plano', 'Flat side first']] },
    { id: `${p}Spec`, type: 'select', group, label: 'Given by', value: spec, ...singlet,
      options: [['focal', 'Focal length and diameter'], ['radii', 'Radii and centre thickness']],
      tip: 'Focal length and diameter: the page designs the radii (with the edge thickness for a convex lens, the centre thickness for a concave one) that give this f. Radii and centre thickness: enter the lens’s shape yourself, and the page computes its f.' },
    { id: `${p}Shape`, type: 'select', group, label: 'Bi-convex shape', value: 'equi', all: [is('biconvex'), designed],
      options: [['equi', 'Equi-convex (R₂ = −R₁)'], ['best', 'Best form for a collimated beam']],
      tip: 'Best form: the thin-lens shape with the least spherical aberration for light arriving parallel, its stronger face first. A bi-concave lens designed from f is equi-concave.' },
    { id: `${p}Glass`, type: 'select', group, label: 'Glass', value: glass, options: GLASS_CHOICES, ...singlet },
    { id: `${p}FocalMm`, group: sizeGroup, label: 'Focal length f', unit: 'mm', value: focalMm, min: -100000, max: 100000, arrowStep: 1,
      any: [is('ideal'), { all: [singlet, designed] }], help: 'From H′ to F′; negative for a diverging lens.' },
    { id: `${p}DiameterMm`, group: sizeGroup, label: 'Clear diameter D', unit: 'mm', value: diameterMm, min: 0.1, max: 1000, arrowStep: 0.5 },
    { id: `${p}EdgeMm`, group: sizeGroup, label: 'Edge thickness', unit: 'mm', value: edgeMm, min: 0, max: 1000, arrowStep: 0.1, all: [is(CONVEX), designed],
      tip: 'At the clear diameter; with f and D it fixes the centre thickness.' },
    { id: `${p}CentreMm`, group: sizeGroup, label: 'Centre thickness t', unit: 'mm', value: centreMm, min: 0.01, max: 1000, arrowStep: 0.1,
      any: [{ all: [singlet, manual] }, { all: [is(CONCAVE), designed] }], tip: 'Along the axis, between the two vertices.' },
    { id: `${p}RadiusMm`, group: sizeGroup, label: 'Radius of the curved face', unit: 'mm', value: radiusMm, min: 0.01, max: 10000, arrowStep: 0.5,
      all: [is(['planoconvex', 'planoconcave']), manual], tip: 'Its magnitude; the other face is flat.' },
    { id: `${p}FrontRadiusMm`, group: sizeGroup, label: 'Front radius |R₁|', unit: 'mm', value: frontRadiusMm, min: 0.01, max: 10000, arrowStep: 0.5,
      all: [is(['biconvex', 'biconcave']), manual], tip: `The face toward ${toward}; its sign follows from the lens’s kind.` },
    { id: `${p}BackRadiusMm`, group: sizeGroup, label: 'Back radius |R₂|', unit: 'mm', value: backRadiusMm, min: 0.01, max: 10000, arrowStep: 0.5,
      all: [is(['biconvex', 'biconcave']), manual], tip: 'The other face; its sign follows from the lens’s kind.' },
  ];
}

// The ideal lens: a thin lens of focal length f in the plane of V₁ = V₂.
function idealLens(f, diameterMm) {
  return {
    ideal: true, kind: 'ideal', n: null, matrix: thinLens(f), power: 1 / f, efl: f, bfl: f, ffl: f, h1Mm: 0, h2Mm: 0,
    thinFocalMm: f, thicknessMm: 0, diameterMm, r1Mm: null, r2Mm: null, edgeMm: null,
  };
}

// designLens names the thin and thick lens page's input ids.
const DESIGN_IDS = { focalMm: 'FocalMm', diameterMm: 'DiameterMm', edgeMm: 'EdgeMm', convexRadiusMm: 'RadiusMm', frontRadiusMm: 'FrontRadiusMm', backRadiusMm: 'BackRadiusMm', shape: 'Shape', glass: 'Glass' };

// The equi-concave lens of focal length f < 0 and centre thickness t: with
// R₁ = −R, R₂ = R the thick-lens power is (n − 1)[−2c − (n − 1)t c²/n],
// c = 1/R; its root, written to stay accurate as t → 0.
export function equiConcaveRadius(n, f, t) {
  return (n - 1) * (1 + Math.sqrt(1 - t / (n * f))) * -f;
}

// One lens from inputs prefixed by `p`, at one wavelength: its lens data,
// signed radii, thicknesses and diameter; or the reason there is none, with
// the inputs to correct. `name` heads the reason on a page of several lenses.
export function buildLens(v, p, wavelengthNm, name = '') {
  const get = k => v[p + k];
  const kind = get('Kind'), D = get('DiameterMm'), h = D / 2, f = get('FocalMm');
  const say = (reason, ...keys) => ({ reason: name ? `${name}: ${reason}` : reason, ids: keys.map(k => p + k) });
  if (kind === 'ideal') {
    if (!(Math.abs(f) >= 0.1)) return say('enter a focal length of at least 0.1 mm either way (negative for a diverging lens).', 'FocalMm');
    return { lens: idealLens(f, D) };
  }
  const glass = get('Glass'), spec = get('Spec'), flatFirst = get('Orientation') === 'plano';
  const n = materialIndex(glass, wavelengthNm);
  let r1, r2, t;
  if (CONVEX.includes(kind)) {
    if (spec === 'focal' && !(f > 0)) return say('a convex singlet converges, so its focal length is positive: enter f > 0, or choose a concave singlet.', 'FocalMm', 'Kind');
    const d = designLens({
      lensKind: kind, spec, orientation: flatFirst ? 'plano' : 'convex', shape: get('Shape'), glass, wavelengthNm,
      focalMm: f, diameterMm: D, edgeMm: get('EdgeMm'), convexRadiusMm: get('RadiusMm'),
      frontRadiusMm: get('FrontRadiusMm'), backRadiusMm: get('BackRadiusMm'), thicknessMm: get('CentreMm'),
    });
    if (d.reason) return { reason: name ? `${name}: ${d.reason}` : d.reason, ids: d.ids.map(id => p + DESIGN_IDS[id]) };
    [r1, r2, t] = [d.r1Mm, d.r2Mm, d.thicknessMm];
  } else {
    if (spec === 'focal' && !(f < 0)) return say('a concave singlet diverges, so its focal length is negative: enter f < 0, or choose a convex singlet.', 'FocalMm', 'Kind');
    t = get('CentreMm');
    if (kind === 'planoconcave') {
      // Flat on one side, f = R/(n − 1) whatever the thickness.
      const R = spec === 'focal' ? -(n - 1) * f : get('RadiusMm');
      if (!(R > h)) {
        return spec === 'focal'
          ? say(`a plano-concave lens of ${glassName(glass)} (n = ${fmt(n, 5)}) with f = ${fmt(f)} mm has |R| = (n − 1)|f| = ${fmt(R)} mm, not more than the ${fmt(h)} mm clear radius: choose a longer |f| or a smaller D.`, 'FocalMm', 'DiameterMm')
          : say(`a radius of ${fmt(R)} mm does not reach the ${fmt(h)} mm clear radius: choose a larger radius or a smaller D.`, 'RadiusMm', 'DiameterMm');
      }
      [r1, r2] = flatFirst ? [0, R] : [-R, 0];
    } else {
      const [R1, R2] = spec === 'focal' ? Array(2).fill(equiConcaveRadius(n, f, t)) : [get('FrontRadiusMm'), get('BackRadiusMm')];
      if (!(R1 > h) || !(R2 > h)) {
        return spec === 'focal'
          ? say(`an equi-concave lens of ${glassName(glass)} with f = ${fmt(f)} mm and t = ${fmt(t)} mm has |R| = ${fmt(R1)} mm, not more than the ${fmt(h)} mm clear radius: choose a longer |f| or a smaller D.`, 'FocalMm', 'DiameterMm')
          : say(`a radius of ${fmt(Math.min(R1, R2))} mm does not reach the ${fmt(h)} mm clear radius: choose larger radii or a smaller D.`, R1 > h ? 'BackRadiusMm' : 'FrontRadiusMm', 'DiameterMm');
      }
      [r1, r2] = [-R1, R2];
    }
  }
  const data = lensData({ glass, wavelengthNm, r1Mm: r1, r2Mm: r2, thicknessMm: t });
  if (data.afocal) return say('these radii and this thickness make an afocal lens (zero power): it has no focal points.', 'FrontRadiusMm', 'BackRadiusMm', 'CentreMm');
  const sag1Mm = sagMm(r1, h), sag2Mm = sagMm(r2, h), edgeMm = t - sag1Mm + sag2Mm;
  if (edgeMm < -1e-12) return say(`the faces cross before the clear diameter (edge thickness ${fmt(edgeMm, 3)} mm): choose a thicker centre, larger radii or a smaller D.`, 'CentreMm', 'DiameterMm');
  return { lens: { ...data, ideal: false, kind, glass, r1Mm: r1, r2Mm: r2, thicknessMm: t, diameterMm: D, edgeMm, sag1Mm, sag2Mm } };
}

// The thin-lens model of a lens, between the planes of its vertices: a thin
// lens of the thin-lens formula's f at its centre.
export const thinModel = lens => chain(gap(lens.thicknessMm / 2), thinLens(lens.thinFocalMm), gap(lens.thicknessMm / 2));

// The wavelength must lie in each singlet's glass fit.
function glassRangeIssue(v, prefixes, wavelengthId) {
  for (const p of prefixes) {
    if (v[`${p}Kind`] === 'ideal' || isWavelengthInGlassRange(v[`${p}Glass`], v[wavelengthId])) continue;
    const [lo, hi] = glassWavelengthRange(v[`${p}Glass`]);
    return unavailable(`${glassName(v[`${p}Glass`])} is fitted from ${lo} to ${hi} nm; choose a wavelength inside that range.`, wavelengthId, `${p}Glass`);
  }
  return null;
}

// ---------------------------------------------------------------- one lens

export const IMAGING_INPUTS = [
  { id: 'wavelengthNm', group: 'object', label: 'Wavelength', unit: 'nm', value: 588, min: 200, max: 20000, arrowStep: 1,
    help: 'Sets the glass’s index; the ideal lens has none.' },
  { id: 'objectDistanceMm', group: 'object', label: 'Object distance', unit: 'mm', value: 50, min: 0.001, max: 1e6, arrowStep: 1,
    help: 'From the object to the front vertex V₁ (to the lens, for the ideal lens).' },
  { id: 'objectHeightMm', group: 'object', label: 'Object height', unit: 'mm', value: 3, min: 0.001, max: 10000, arrowStep: 0.5,
    help: 'Above the axis.' },
  ...lensInputs('lens', { sizeGroup: 'size', kind: 'biconvex', spec: 'radii', diameterMm: 12, centreMm: 5, radiusMm: 20, frontRadiusMm: 20, backRadiusMm: 20, focalMm: 50 }),
];
export const IMAGING_DEFAULTS = defaultsFor(IMAGING_INPUTS);

export function computeImaging(raw) {
  const { values: v, errors } = parseInputs(IMAGING_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  const range = glassRangeIssue(v, ['lens'], 'wavelengthNm');
  if (range) return range;
  const built = buildLens(v, 'lens', v.wavelengthNm);
  if (built.reason) return unavailable(built.reason, ...built.ids);
  const { lens } = built, d = v.objectDistanceMm, t = lens.thicknessMm;
  const result = { ok: true, values: v, lens };
  const image = imageThrough(lens.matrix, d);
  if (!image.atInfinity) {
    // Distances from the principal planes, and from the focal points
    // (Newton's form, x x′ = f²).
    const s = d + lens.h1Mm, s2 = image.fromLast - lens.h2Mm;
    Object.assign(image, {
      heightMm: image.magnification * v.objectHeightMm, real: image.fromLast > 0, upright: image.magnification > 0,
      objectFromH: s, imageFromH2: s2, newtonX: s - lens.efl, newtonX2: s2 - lens.efl,
    });
  }
  result.image = image;
  // The thin-lens estimate: distances from the lens's centre.
  const thin = imageThrough(thinModel(lens), d);
  if (!thin.atInfinity) thin.fromCentre = thin.fromLast + t / 2;
  result.thin = thin;
  return result;
}

// ---------------------------------------------------------------- two lenses

export const PAIR_INPUTS = [
  { id: 'pairWavelengthNm', group: 'pair', label: 'Wavelength', unit: 'nm', value: 633, min: 200, max: 20000, arrowStep: 1 },
  { id: 'spacing', type: 'select', group: 'pair', label: 'Spacing', value: 'afocal',
    options: [['afocal', 'Afocal: F′ of lens 1 on F of lens 2 (telescope, 4f)'], ['gap', 'A gap you set']],
    tip: 'Afocal: the page spaces the lenses so that parallel light leaves parallel, a telescope, beam expander or 4f relay. A gap you set: any other spacing, which gives the pair a focal length of its own.' },
  { id: 'gapMm', group: 'pair', label: 'Gap, V₂ of lens 1 to V₁ of lens 2', unit: 'mm', value: 100, min: 0, max: 100000, arrowStep: 1,
    when: 'spacing', whenValue: 'gap' },
  { id: 'pairObject', type: 'select', group: 'pair', label: 'Light in', value: 'infinity',
    options: [['infinity', 'A collimated beam (object at infinity)'], ['focal', 'An object in lens 1’s front focal plane (4f, if afocal)'], ['distance', 'An object at a distance']] },
  { id: 'beamDiameterMm', group: 'pair', label: 'Beam diameter', unit: 'mm', value: 5, min: 0.001, max: 1000, arrowStep: 0.5,
    when: 'pairObject', whenValue: 'infinity', help: 'Of the collimated beam entering lens 1.' },
  { id: 'fieldDeg', group: 'pair', label: 'Field angle', unit: '°', value: 1, min: 0, max: 10, arrowStep: 0.1,
    when: 'pairObject', whenValue: 'infinity', help: 'A second, tilted beam: the angle the telescope magnifies.' },
  { id: 'pairDistanceMm', group: 'pair', label: 'Object distance', unit: 'mm', value: 100, min: 0.001, max: 1e6, arrowStep: 1,
    when: 'pairObject', whenValue: 'distance', help: 'From the object to V₁ of lens 1.' },
  { id: 'pairHeightMm', group: 'pair', label: 'Object height', unit: 'mm', value: 4, min: 0.001, max: 10000, arrowStep: 0.5,
    when: 'pairObject', whenValue: ['focal', 'distance'] },
  ...lensInputs('l1', { kind: 'planoconvex', focalMm: 50, toward: 'the light' }),
  ...lensInputs('l2', { kind: 'planoconvex', orientation: 'plano', focalMm: 150, toward: 'lens 1' }),
];
export const PAIR_DEFAULTS = defaultsFor(PAIR_INPUTS);

// The gap g from lens 1's V₂ to lens 2's V₁ that makes L₂ T(g) L₁ afocal:
// its C, L₂.C (L₁.A + g L₁.C) + L₂.D L₁.C, is linear in g. It puts H′ of
// lens 1 f₁ + f₂ before H of lens 2.
export const afocalGap = (m1, m2) => -(m2.Au * m1.Ay + m2.Bu * m1.Au) / (m2.Au * m1.Au);

// The smallest gap between the vertices at which the lenses do not overlap:
// lens 1's back face against lens 2's front face, at the axis and at the
// smaller clear radius, where their sags are largest.
export function minimumGap(l1, l2) {
  const h = Math.min(l1.diameterMm, l2.diameterMm) / 2;
  const back = l1.ideal ? 0 : sagMm(l1.r2Mm, h), front = l2.ideal ? 0 : sagMm(l2.r1Mm, h);
  return Math.max(0, back - front);
}

export function computePair(raw) {
  const { values: v, errors } = parseInputs(PAIR_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  const nm = v.pairWavelengthNm;
  const range = glassRangeIssue(v, ['l1', 'l2'], 'pairWavelengthNm');
  if (range) return range;
  const b1 = buildLens(v, 'l1', nm, 'Lens 1');
  if (b1.reason) return unavailable(b1.reason, ...b1.ids);
  const b2 = buildLens(v, 'l2', nm, 'Lens 2');
  if (b2.reason) return unavailable(b2.reason, ...b2.ids);
  const l1 = b1.lens, l2 = b2.lens, t1 = l1.thicknessMm, t2 = l2.thicknessMm;
  const afocal = v.spacing === 'afocal';
  const g = afocal ? afocalGap(l1.matrix, l2.matrix) : v.gapMm;
  if (afocal && !(g >= 0)) {
    return unavailable(`Spaced afocal, lens 2 would start ${fmt(-g)} mm before lens 1 ends: H′ of lens 1 must lie f₁ + f₂ = ${fmt(l1.efl + l2.efl)} mm before H of lens 2${l1.efl + l2.efl < 0 ? ', a negative distance' : ''}. A telescope needs f₁ + f₂ > 0: two converging lenses (Keplerian), or one converging and one diverging, the converging one the stronger in |f| (Galilean).`, 'l1FocalMm', 'l2FocalMm', 'l1Kind', 'l2Kind');
  }
  const least = minimumGap(l1, l2);
  if (g < least - 1e-9) {
    // The least gap shown is rounded up to the micrometre, so that it works.
    return afocal
      ? unavailable(`Spaced afocal (${fmt(g)} mm between the vertices), the lenses’ faces would cut into each other at their rims: choose lenses of longer focal length or smaller diameter.`, 'l1DiameterMm', 'l2DiameterMm')
      : unavailable(`With a ${fmt(g)} mm gap the lenses’ faces cut into each other at their rims: set a gap of at least ${Math.ceil(least * 1e3) / 1e3} mm.`, 'gapMm');
  }
  const system = chain(l1.matrix, gap(g), l2.matrix);
  // Near enough to afocal at a set gap counts as afocal too.
  const isAfocal = afocal || Math.abs(system.Au) < 1e-12 * (Math.abs(l1.power) + Math.abs(l2.power));
  // The thin-lens model: thin lenses at the lenses' centres, spaced afocal
  // by its own rule (f₁ + f₂ between them), or at the same gap.
  const f1t = l1.thinFocalMm, f2t = l2.thinFocalMm;
  const gThin = afocal ? f1t + f2t - t1 / 2 - t2 / 2 : g;
  const thin = chain(gap(t1 / 2), thinLens(f1t), gap(t1 / 2 + gThin + t2 / 2), thinLens(f2t), gap(t2 / 2));
  const thinAfocal = afocal || Math.abs(thin.Au) < 1e-12 * (Math.abs(1 / f1t) + Math.abs(1 / f2t));
  const result = {
    ok: true, values: v, l1, l2, gapMm: g, minimumGapMm: least, thinGapMm: gThin, lengthMm: t1 + g + t2, system, thin, afocal: isAfocal, thinAfocal,
    cardinal: cardinal(system, isAfocal), thinCardinal: cardinal(thin, thinAfocal),
  };
  if (isAfocal) {
    // A telescope: u′ = D u and y′ = A y (A D = 1 when C = 0).
    result.telescope = {
      angular: system.Bu, expansion: system.Ay, kind: system.Bu < 0 ? 'keplerian' : 'galilean',
      thinAngular: thinAfocal ? thin.Bu : null,
    };
  }
  // Lens 1's back focal plane holds the Fourier transform of an object in
  // its front focal plane, if the light reaches it before lens 2 (a
  // converging lens 1, its F′ in the gap); spaced afocal it is also lens 2's
  // front focal plane, and the pair is a 4f system.
  const between = l1.bfl > 0 && l1.bfl < g;
  result.fourierZ = between ? t1 + l1.bfl : null;
  result.fourF = between && afocal && v.pairObject === 'focal';
  if (v.pairObject === 'infinity') {
    result.beam = isAfocal
      ? { diameterMm: Math.abs(system.Ay) * v.beamDiameterMm, angleDeg: system.Bu * v.fieldDeg }
      : { focusFromLast: result.cardinal.bfl };
    return result;
  }
  let d = v.pairDistanceMm;
  if (v.pairObject === 'focal') {
    if (!(l1.ffl > 0)) return unavailable(`Lens 1’s front focal point lies ${fmt(-l1.ffl)} mm after its front vertex${l1.efl < 0 ? ' (a diverging lens)' : ''}: there is no real object plane there. Choose an object at a distance.`, 'pairObject', 'l1Kind');
    d = l1.ffl;
  }
  result.objectDistanceMm = d;
  const image = imageThrough(system, d, isAfocal);
  if (!image.atInfinity) Object.assign(image, { heightMm: image.magnification * v.pairHeightMm, real: image.fromLast > 0, upright: image.magnification > 0 });
  result.image = image;
  result.thinImage = imageThrough(thin, d, thinAfocal);
  // The image lens 1 forms on its own, z from its V₁.
  const first = imageThrough(l1.matrix, d);
  result.intermediate = first.atInfinity ? { atInfinity: true } : { atInfinity: false, z: t1 + first.fromLast, heightMm: first.magnification * v.pairHeightMm };
  return result;
}

// ---------------------------------------------------------------- graphs

// The image distance after the last vertex, and the magnification, against
// the object distance before the first, for the thick system and its
// thin-lens model. A value beyond ±limit is left out, and so is the first
// beyond the focal plane, where C d + D changes sign, so the line breaks at
// the asymptote instead of joining its two branches.
export function imageScan(systems, reachMm, count = SCAN_POINTS) {
  const x = Array.from({ length: count }, (_, i) => reachMm * (i + 1) / count);
  const out = { x };
  for (const [key, { matrix, afocal }] of Object.entries(systems)) {
    const C = afocal ? 0 : matrix.Au;
    let side = null;
    out[key] = { image: [], magnification: [] };
    for (const d of x) {
      const im = imageThrough(matrix, d, afocal), now = Math.sign(C * d + matrix.Bu);
      const broke = side !== null && now !== side;
      side = now;
      out[key].image.push(im.atInfinity || broke ? null : im.fromLast);
      out[key].magnification.push(im.atInfinity || broke ? null : im.magnification);
    }
  }
  return out;
}

// How far the object-distance axis reaches: past the front focal point and
// the object, to a round number.
export const scanReach = (focalMm, objectMm = 0) => niceUp(Math.max(4 * Math.abs(focalMm), 1.5 * objectMm));

// ---------------------------------------------------------------- figures

// A lens's outline at z0 (its V₁), as a polygon in (z, y): null for the
// ideal lens, drawn as a line.
function outline(lens, z0) {
  if (lens.ideal) return null;
  const half = lens.diameterMm / 2, n = 40, out = [];
  for (let i = 0; i <= n; i++) { const y = -half + 2 * half * i / n; out.push([z0 + sagMm(lens.r1Mm, Math.abs(y)), y]); }
  for (let i = n; i >= 0; i--) { const y = -half + 2 * half * i / n; out.push([z0 + lens.thicknessMm + sagMm(lens.r2Mm, Math.abs(y)), y]); }
  return out;
}

// A ray traced paraxially from (z, y) at slope u through lenses placed at
// their V₁ positions, to zEnd: straight between each lens's vertex planes,
// as the paraxial trace sees it. `exits` holds its height and slope after
// each lens; `outside` whether it crossed a lens beyond its clear radius.
function trace(placed, z, y, u, zEnd) {
  const path = [[z, y]], exits = [];
  let outside = false;
  for (const { lens, z0 } of placed) {
    y += u * (z0 - z);
    path.push([z0, y]);
    if (Math.abs(y) > lens.diameterMm / 2) outside = true;
    const m = lens.matrix, y2 = m.Ay * y + m.By * u, u2 = m.Au * y + m.Bu * u;
    z = z0 + lens.thicknessMm; y = y2; u = u2;
    path.push([z, y]);
    if (Math.abs(y) > lens.diameterMm / 2) outside = true;
    exits.push({ z, y, u });
  }
  path.push([zEnd, y + u * (zEnd - z)]);
  return { path, exits, outside };
}

// The three construction rays from the object's tip (z0, h), all traced
// through every lens: parallel to the axis, through lens 1's front focal
// point F, and toward its front principal point H (a nodal point in air).
function constructionRays(placed, z0, h, zEnd) {
  const first = placed[0], zF = first.z0 - first.lens.ffl, zH = first.z0 + first.lens.h1Mm;
  const scale = Math.max(1, Math.abs(first.lens.efl));
  const rays = [{ name: 'parallel', ...trace(placed, z0, h, 0, zEnd) }];
  if (Math.abs(zF - z0) > 1e-9 * scale) rays.push({ name: 'focal', ...trace(placed, z0, h, -h / (zF - z0), zEnd) });
  if (Math.abs(zH - z0) > 1e-9 * scale) rays.push({ name: 'nodal', ...trace(placed, z0, h, -h / (zH - z0), zEnd) });
  return rays;
}

// The figure's extent along the axis: every fixed point, and an image or
// object within three times their spread (one farther out is left off, and
// said to be).
function extent(fixed, extra) {
  const lo0 = Math.min(...fixed), hi0 = Math.max(...fixed), reach = 3 * Math.max(hi0 - lo0, 1e-9);
  const shown = extra.filter(z => z !== null && z > lo0 - reach && z < hi0 + reach);
  let lo = Math.min(lo0, ...shown), hi = Math.max(hi0, ...shown);
  // More room after the last point, where the rays run on past the image.
  const pad = 0.08 * (hi - lo);
  lo -= pad; hi += 2 * pad;
  return { lo, hi, within: z => z !== null && z > lo0 - reach && z < hi0 + reach };
}

// One lens, to scale, in mm with z from V₁: the outline (or the ideal lens's
// line), the cardinal points and vertices, the object and its image, the
// three construction rays, and dashed extensions: the incoming rays forward
// to H and the outgoing ones back to H′, where they meet at equal heights,
// and back to a virtual image.
export function imagingDiagram(result) {
  const { values: v, lens, image } = result;
  const t = lens.thicknessMm, d = v.objectDistanceMm, h = v.objectHeightMm;
  const marks = { F: -lens.ffl, F2: t + lens.bfl, H: lens.h1Mm, H2: t + lens.h2Mm, V1: 0, V2: t };
  const imageZ = image.atInfinity ? null : t + image.fromLast;
  const span = extent([-d, 0, t, ...Object.values(marks)], [imageZ]);
  const shown = span.within(imageZ);
  const placed = [{ lens, z0: 0 }];
  const rays = constructionRays(placed, -d, h, span.hi);
  const extend = [];
  for (const ray of rays) {
    const [, [, y1]] = ray.path, uIn = (y1 - h) / d, out = ray.exits[0];
    if (!lens.ideal) {
      extend.push([[0, y1], [marks.H, y1 + uIn * marks.H]]);
      extend.push([[t, out.y], [marks.H2, out.y + out.u * (marks.H2 - t)]]);
    }
    if (shown && !image.real) extend.push([[t, out.y], [imageZ, out.y + out.u * (imageZ - t)]]);
  }
  const heights = [h, lens.diameterMm / 2, ...(shown ? [Math.abs(image.heightMm)] : [])];
  return {
    z: [span.lo, span.hi], yMax: 1.25 * Math.max(...heights),
    lenses: [{ outline: outline(lens, 0), z: 0, t, half: lens.diameterMm / 2, diverging: lens.efl < 0, ideal: lens.ideal }],
    marks, rays: rays.map(r => r.path), extend, outside: rays.some(r => r.outside),
    object: { z: -d, height: h },
    image: shown ? { z: imageZ, height: image.heightMm, real: image.real } : null,
    imageNote: image.atInfinity ? 'The object sits in the front focal plane: the image is at infinity, the rays leave parallel.'
      : shown ? '' : `The image lies ${fmt(Math.abs(image.fromLast), 3)} mm ${image.fromLast > 0 ? 'after' : 'before'} the back vertex, off the figure.`,
  };
}

// Two lenses, to scale, z from lens 1's V₁: both outlines, each lens's focal
// points, and either the beams (a collimated beam on the axis at half and
// all of its radius, and one tilted by the field angle, through H of lens 1
// and at its edges) or the construction rays from the object's tip and rays
// from its foot to lens 1's rim, with the intermediate image lens 1 forms
// and the final one.
export function pairDiagram(result) {
  const { values: v, l1, l2, gapMm: g } = result;
  const z2 = l1.thicknessMm + g, end = z2 + l2.thicknessMm;
  const placed = [{ lens: l1, z0: 0 }, { lens: l2, z0: z2 }];
  const marks = { F1: -l1.ffl, F1b: l1.thicknessMm + l1.bfl, F2: z2 - l2.ffl, F2b: end + l2.bfl };
  const object = v.pairObject === 'infinity' ? null : { z: -result.objectDistanceMm, height: v.pairHeightMm };
  const image = result.image && !result.image.atInfinity ? end + result.image.fromLast : null;
  const middle = result.intermediate && !result.intermediate.atInfinity ? result.intermediate.z : null;
  const fixed = [0, end, ...Object.values(marks), ...(object ? [object.z] : [])];
  const span = extent(fixed, [image, middle]);
  let { lo } = span;
  const { hi } = span;
  // A collimated beam needs a run-in before lens 1.
  if (!object) lo = Math.min(lo, -0.15 * (hi - lo));
  const rays = [], field = [], extend = [];
  let outside = false;
  if (!object) {
    const r = v.beamDiameterMm / 2;
    for (const y of [r / 2, r, -r / 2, -r]) { const ray = trace(placed, lo, y, 0, hi); rays.push(ray.path); outside ||= ray.outside; }
    if (v.fieldDeg > 0) {
      const u = Math.tan(v.fieldDeg * Math.PI / 180), zH = l1.h1Mm;
      for (const y of [0, r, -r]) { const ray = trace(placed, lo, y + u * (lo - zH), u, hi); field.push(ray.path); outside ||= ray.outside; }
    }
  } else {
    // Rays from the object's foot to lens 1's rim, which meet again at the
    // foot of each image.
    const rim = 0.9 * l1.diameterMm / 2;
    for (const y of [rim, -rim]) { const ray = trace(placed, object.z, 0, y / -object.z, hi); field.push(ray.path); outside ||= ray.outside; }
    for (const ray of constructionRays(placed, object.z, object.height, hi)) {
      rays.push(ray.path);
      outside ||= ray.outside;
      const out = ray.exits[1];
      if (span.within(image) && !result.image.real) extend.push([[out.z, out.y], [image, out.y + out.u * (image - out.z)]]);
    }
  }
  const shown = span.within(image), midShown = span.within(middle);
  const heights = [l1.diameterMm / 2, l2.diameterMm / 2, ...(object ? [object.height] : []), ...(shown ? [Math.abs(result.image.heightMm)] : [])];
  return {
    z: [lo, hi], yMax: 1.25 * Math.max(...heights),
    lenses: placed.map(({ lens, z0 }) => ({ outline: outline(lens, z0), z: z0, t: lens.thicknessMm, half: lens.diameterMm / 2, diverging: lens.efl < 0, ideal: lens.ideal })),
    marks, rays, field, extend, outside, object,
    image: shown ? { z: image, height: result.image.heightMm, real: result.image.real } : null,
    intermediate: midShown ? { z: middle, height: result.intermediate.heightMm } : null,
    imageNote: !object ? '' : result.image.atInfinity ? 'The image is at infinity: the rays leave lens 2 parallel.'
      : shown ? '' : `The image lies ${fmt(Math.abs(result.image.fromLast), 3)} mm ${result.image.fromLast > 0 ? 'after' : 'before'} lens 2’s back vertex, off the figure.`,
  };
}

// ---------------------------------------------------------------- canvas

// What the canvas's elements accept, from its registry: a scene outside
// these limits would open as something else (normalised) or show nothing.
const spec = (type, key) => registry[type].params.find(p => p.key === key);
const CANVAS = {
  nm: [spec('pointsource', 'wavelength').min, spec('pointsource', 'wavelength').max],
  laserNm: [spec('cwlaser', 'wavelength').min, spec('cwlaser', 'wavelength').max],
  capture: spec('pointsource', 'captureRange').max,
  f: spec('lens', 'f').max,
  thickness: [spec('thicklens', 'thickness').min, spec('thicklens', 'thickness').max],
  radius: spec('thicklens', 'r1').max,
  // An optic's diameter (its 'optsize'), as the canvas clamps it.
  diameter: [1, 500],
};

// A lens as the canvas holds it, or the reasons it cannot: its Lens (the
// ideal thin lens) or Thick spherical lens, and the note when the canvas
// realises a singlet a little differently.
function canvasLens(lens, name) {
  const reasons = [];
  if (lens.diameterMm < CANVAS.diameter[0] || lens.diameterMm > CANVAS.diameter[1]) reasons.push(`${name}’s diameter runs from ${CANVAS.diameter[0]} to ${CANVAS.diameter[1]} mm`);
  if (lens.ideal) {
    if (Math.abs(lens.efl) > CANVAS.f) reasons.push(`${name}’s focal length runs from −${CANVAS.f} to ${CANVAS.f} mm`);
  } else {
    if (lens.thicknessMm < CANVAS.thickness[0] || lens.thicknessMm > CANVAS.thickness[1]) reasons.push(`${name}’s centre thickness runs from ${CANVAS.thickness[0]} to ${CANVAS.thickness[1]} mm`);
    if ([lens.r1Mm, lens.r2Mm].some(r => Math.abs(r) > CANVAS.radius)) reasons.push(`${name}’s radii are limited to ±${CANVAS.radius} mm`);
  }
  const params = lens.ideal
    ? { f: Number(fmt(lens.efl, 6)), dia: lens.diameterMm, transEff: 100 }
    : { r1: Number(fmt(lens.r1Mm, 6)), r2: Number(fmt(lens.r2Mm, 6)), thickness: Number(fmt(lens.thicknessMm, 6)), dia: lens.diameterMm, glass: lens.glass, transEff: 100 };
  const adjusted = lens.ideal ? null : thickLensAdjustment(params);
  return {
    reasons, params, type: lens.ideal ? 'lens' : 'thicklens',
    note: adjusted ? `The canvas keeps a singlet’s edge at least 0.4 mm thick, so it draws ${name} as R₁ ${fmt(adjusted.r1)}, R₂ ${fmt(adjusted.r2)}, t ${fmt(adjusted.thickness)} mm.` : '',
  };
}

// The reasons a source cannot stand where the calculator puts it: its
// wavelength, and for a point source how far its light carries.
function sourceReasons(nm, [lo, hi], reach = null) {
  const reasons = [];
  if (nm < lo || nm > hi) reasons.push(`its sources run from ${lo} to ${hi} nm`);
  if (reach !== null && reach > CANVAS.capture) reasons.push(`a point source’s light carries ${CANVAS.capture / 1000} m at most, and the lens is ${fmt(reach / 1000, 3)} m from the object`);
  return reasons;
}

// A point source at the object's tip (x, y on the canvas, y downward),
// aimed to fill a lens of half-diameter `half` centred at xLens, its light
// carried a little past the lens.
function pointSource(nm, x, y, xLens, half) {
  const deg = a => a * 180 / Math.PI, dist = xLens - x;
  const top = Math.atan2(-0.9 * half - y, dist), bottom = Math.atan2(0.9 * half - y, dist);
  return {
    id: 'object', type: 'pointsource', x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, rot: Number(fmt(deg((top + bottom) / 2), 4)),
    label: 'Object tip', showLabel: true,
    params: { wavelength: nm, bwMode: 'mono', spread: Math.min(360, Math.max(10, Number(fmt(deg(bottom - top), 3)))), nrays: 11, captureRange: Math.min(CANVAS.capture, Math.max(1000, Math.ceil(1.5 * Math.hypot(dist, y)))) },
  };
}

const laser = (nm, x, beamDiameterMm) => ({
  id: 'laser', type: 'cwlaser', x: Math.round(x), y: 0, rot: 0, label: `${fmt(nm, 5)} nm`, showLabel: true,
  params: { wavelength: nm, avgPowerW: 0.01, beamMode: 'beam', beamWidth: Math.min(60, Math.max(1, beamDiameterMm)) },
});

const scene = elements => ({ app: 'optics2d', version: 1, beams: [], elements });

// The one-lens setup on the canvas: a point source at the object's tip and
// the lens, centred at x = 0 (the canvas centres a singlet on its element).
export function imagingCanvasScene(result) {
  const { values: v, lens } = result;
  const c = canvasLens(lens, 'the lens');
  const x = -lens.thicknessMm / 2 - v.objectDistanceMm;
  const reasons = [...c.reasons, ...sourceReasons(v.wavelengthNm, CANVAS.nm, Math.hypot(x, v.objectHeightMm))];
  if (reasons.length) return { ok: false, reasons };
  return {
    ok: true, note: c.note,
    scene: scene([pointSource(v.wavelengthNm, x, -v.objectHeightMm, 0, lens.diameterMm / 2),
      { id: 'lens', type: c.type, x: 0, y: 0, rot: 0, label: lens.ideal ? 'Ideal lens' : 'Singlet', showLabel: true, labelPos: 'b', params: c.params }]),
  };
}

// The pair on the canvas: a laser beam (object at infinity) or a point
// source at the object's tip, and both lenses at their spacing.
export function pairCanvasScene(result) {
  const { values: v, l1, l2 } = result;
  const c1 = canvasLens(l1, 'lens 1'), c2 = canvasLens(l2, 'lens 2');
  const beam = v.pairObject === 'infinity';
  const x = beam ? null : -l1.thicknessMm / 2 - result.objectDistanceMm;
  const reasons = [...c1.reasons, ...c2.reasons, ...sourceReasons(v.pairWavelengthNm, beam ? CANVAS.laserNm : CANVAS.nm, beam ? null : Math.hypot(x, v.pairHeightMm))];
  if (reasons.length) return { ok: false, reasons };
  const x2 = l1.thicknessMm / 2 + result.gapMm + l2.thicknessMm / 2;
  const notes = [c1.note, c2.note];
  let source;
  if (beam) {
    source = laser(v.pairWavelengthNm, -l1.thicknessMm / 2 - Math.max(60, 0.3 * x2), v.beamDiameterMm);
    if (source.params.beamWidth !== v.beamDiameterMm) notes.push(`The canvas’s laser beam is 1 to 60 mm wide, so it is drawn ${fmt(source.params.beamWidth)} mm wide.`);
    if (v.fieldDeg > 0) notes.push('The canvas shows the beam on the axis only.');
  } else {
    source = pointSource(v.pairWavelengthNm, x, -v.pairHeightMm, 0, l1.diameterMm / 2);
  }
  return {
    ok: true, note: notes.filter(Boolean).join(' '),
    scene: scene([source,
      { id: 'lens1', type: c1.type, x: 0, y: 0, rot: 0, label: 'Lens 1', showLabel: true, labelPos: 'b', params: c1.params },
      { id: 'lens2', type: c2.type, x: Number(fmt(x2, 6)), y: 0, rot: 0, label: 'Lens 2', showLabel: true, labelPos: 'b', params: c2.params }]),
  };
}
