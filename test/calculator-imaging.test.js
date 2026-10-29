// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The imaging calculator (calculators/imaging/). The Python reference
// (validation/reference/imaging.py) checks its numbers; these tests check
// its limits, refusals, figures and the numbers its text quotes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGING_DEFAULTS, PAIR_DEFAULTS, PAIR_INPUTS, computeImaging, computePair, buildLens, equiConcaveRadius, imageThrough, cardinal,
  chain, gap, thinLens, afocalGap, thinModel, imageScan, scanReach, imagingDiagram, pairDiagram,
  imagingCanvasScene, pairCanvasScene,
} from '../calculators/imaging/imaging.js';
import { lensData } from '../calculators/thin-thick-lens/thick-lens.js';
import { materialIndex } from '../calculators/lens-design/engine/materials.js';
import { imagingCalculators } from '../tools/calculators-imaging-content.mjs';

const close = (a, b, rel, label = '') => assert.ok(Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1e-12), `${label} ${a} vs ${b}`);
const one = x => computeImaging({ ...IMAGING_DEFAULTS, ...x });
const pair = x => computePair({ ...PAIR_DEFAULTS, ...x });
const ideal = (f, x = {}) => ({ lensKind: 'ideal', lensFocalMm: f, ...x });
const ids = r => r.errors.map(e => e.id);
// Every coordinate a figure hands to the renderer is finite.
const finite = g => JSON.stringify(g, (k, v) => {
  if (typeof v === 'number') assert.ok(Number.isFinite(v), `${k} = ${v}`);
  return v;
});

test('matrices: a thin lens images by the Gaussian formula, and a singlet’s matrix gives lensData’s cardinal points', () => {
  // 1/s + 1/s′ = 1/f for an ideal lens: s = 30, f = 20 → s′ = 60, m = −2.
  const im = imageThrough(thinLens(20), 30);
  close(im.fromLast, 60, 1e-14);
  close(im.magnification, -2, 1e-14);
  // An object in the front focal plane is imaged at infinity.
  assert.equal(imageThrough(thinLens(20), 20).atInfinity, true);
  // The cardinal points of a lens's own matrix are lensData's.
  const d = lensData({ glass: 'nbk7', wavelengthNm: 588, r1Mm: 20, r2Mm: -20, thicknessMm: 5 });
  const c = cardinal(d.matrix);
  for (const k of ['efl', 'bfl', 'ffl', 'h1Mm', 'h2Mm']) close(c[k], d[k], 1e-12, k);
  // Gaps add, and chain applies its matrices in order.
  const m = chain(gap(3), thinLens(10), gap(4));
  close(m.By, 3 + 4 - 12 / 10, 1e-14);
  // The afocal gap puts H′ of lens 1 f₁ + f₂ before H of lens 2: for thin
  // lenses, f₁ + f₂ exactly, with C = 0.
  close(afocalGap(thinLens(50), thinLens(150)), 200, 1e-14);
  close(afocalGap(thinLens(-50), thinLens(150)), 100, 1e-14);
  assert.ok(Math.abs(chain(thinLens(50), gap(200), thinLens(150)).Au) < 1e-18);
});

test('one lens: real and virtual images, Newton’s form, the thin-lens model', () => {
  const r = one({});
  assert.ok(r.ok && r.image.real && !r.image.upright);
  close(r.image.newtonX * r.image.newtonX2, r.lens.efl ** 2, 1e-12, 'x x′ = f²');
  // m = −s′/s with distances from the principal planes.
  close(r.image.magnification, -r.image.imageFromH2 / r.image.objectFromH, 1e-12);
  // Inside F: virtual, upright, enlarged.
  const near = one({ objectDistanceMm: 15 });
  assert.ok(!near.image.real && near.image.upright && near.image.magnification > 1);
  // At the front focal point (FFL before V₁) the image is at infinity.
  assert.equal(one({ objectDistanceMm: r.lens.ffl }).image.atInfinity, true);
  // A diverging lens: virtual, upright, reduced, between F′ and the lens,
  // wherever the object stands.
  for (const d of [0.5, 10, 50, 1e5]) {
    const cc = one({ lensKind: 'biconcave', objectDistanceMm: d });
    assert.ok(!cc.image.real && cc.image.upright && cc.image.magnification < 1, `d = ${d}`);
    assert.ok(cc.image.fromLast > cc.lens.bfl && cc.image.fromLast < 0, `d = ${d}`);
  }
  // The ideal lens is its own thin-lens model.
  const id = one(ideal(40));
  assert.deepEqual([id.thin.fromLast, id.thin.magnification], [id.image.fromLast, id.image.magnification]);
  // A thin singlet tends to its thin-lens model.
  const thin = one({ lensFrontRadiusMm: 200, lensBackRadiusMm: 200, lensCentreMm: 0.05, lensDiameterMm: 4, objectDistanceMm: 500 });
  close(thin.image.fromLast, thin.thin.fromLast, 1e-3);
});

test('lenses: the designs have the focal length asked for, and impossible lenses are refused', () => {
  const at = (p, x) => buildLens({ ...IMAGING_DEFAULTS, ...x }, 'lens', 588);
  // Concave designs: plano-concave either way round, equi-concave.
  for (const x of [{ lensKind: 'planoconcave' }, { lensKind: 'planoconcave', lensOrientation: 'plano' }, { lensKind: 'biconcave' }]) {
    for (const t of [0.5, 3, 10]) {
      const b = at('lens', { ...x, lensSpec: 'focal', lensFocalMm: -40, lensCentreMm: t });
      assert.ok(b.lens, JSON.stringify(x));
      close(b.lens.efl, -40, 1e-12, `${JSON.stringify(x)} t = ${t}`);
      assert.ok(b.lens.edgeMm > t, 'a concave lens is thicker at its edge');
    }
  }
  // The equi-concave radius tends to the thin lens's 2(n − 1)|f|.
  const n = materialIndex('nbk7', 588);
  close(equiConcaveRadius(n, -40, 1e-9), 2 * (n - 1) * 40, 1e-9);
  // Convex designs come from the thin and thick lens page.
  close(at('lens', { lensKind: 'planoconvex', lensSpec: 'focal', lensFocalMm: 50, lensDiameterMm: 25.4 }).lens.efl, 50, 1e-12);
  // Refusals, each naming the inputs to correct.
  assert.deepEqual(ids(one({ lensKind: 'planoconvex', lensSpec: 'focal', lensFocalMm: -50 })), ['lensFocalMm', 'lensKind']);
  assert.deepEqual(ids(one({ lensKind: 'biconcave', lensSpec: 'focal', lensFocalMm: 50 })), ['lensFocalMm', 'lensKind']);
  assert.deepEqual(ids(one(ideal(0.05))), ['lensFocalMm']);
  assert.deepEqual(ids(one({ lensKind: 'planoconcave', lensSpec: 'focal', lensFocalMm: -5, lensDiameterMm: 12 })), ['lensFocalMm', 'lensDiameterMm']);
  assert.deepEqual(ids(one({ lensKind: 'biconcave', lensFrontRadiusMm: 5 })), ['lensFrontRadiusMm', 'lensDiameterMm']);
  // Faces that cross before the clear diameter.
  const thinEdge = one({ lensCentreMm: 1 });
  assert.match(thinEdge.errors[0].message, /faces cross/);
  assert.deepEqual(ids(thinEdge), ['lensCentreMm', 'lensDiameterMm']);
  // A wavelength outside the glass's fit; the ideal lens takes any.
  assert.deepEqual(ids(one({ wavelengthNm: 5000 })), ['wavelengthNm', 'lensGlass']);
  assert.ok(one(ideal(40, { wavelengthNm: 5000 })).ok);
  // Inputs are clamped at the schema.
  assert.deepEqual(ids(one({ objectDistanceMm: 0 })), ['objectDistanceMm']);
  assert.deepEqual(ids(one({ lensFocalMm: 2e5, lensKind: 'ideal' })), ['lensFocalMm']);
});

test('two lenses: Keplerian and Galilean telescopes, the 4f relay, and a pair at a set gap', () => {
  const k = pair({});
  assert.equal(k.telescope.kind, 'keplerian');
  close(k.telescope.angular, -1 / 3, 1e-12);
  close(k.beam.diameterMm, 15, 1e-12);
  // The thick lenses' principal planes, not their centres, are f₁ + f₂ apart.
  close(k.gapMm + k.l2.h1Mm - k.l1.h2Mm, 200, 1e-12);
  const g = pair({ l1Kind: 'planoconcave', l1FocalMm: -50 });
  assert.equal(g.telescope.kind, 'galilean');
  close(g.telescope.angular, 1 / 3, 1e-12);
  assert.ok(g.lengthMm < k.lengthMm);
  // Spaced afocal, the magnification is −f₂/f₁ wherever the object stands,
  // and the image moves (f₂/f₁)² as far.
  const at = d => pair({ pairObject: 'distance', pairDistanceMm: d }).image;
  for (const d of [10, 100, 1000]) close(at(d).magnification, -3, 1e-12, `d = ${d}`);
  close(at(100).fromLast - at(110).fromLast, 90, 1e-9);
  // 4f: object in lens 1's front focal plane, image in lens 2's back one.
  const f4 = pair({ pairObject: 'focal' });
  close(f4.image.fromLast, f4.l2.bfl, 1e-12);
  close(f4.fourierZ, f4.l1.thicknessMm + f4.l1.bfl, 1e-15);
  assert.equal(f4.fourF, true);
  // At a gap shorter than lens 1's back focal length, lens 2 takes the
  // light before that plane: no Fourier plane, no 4f.
  const short = pair({ pairObject: 'focal', spacing: 'gap', gapMm: 10 });
  assert.ok(short.ok && short.fourierZ === null && short.fourF === false);
  // Nor in a Galilean reducer, whose F′ of lens 1 lies beyond lens 2.
  const reducer = pair({ pairObject: 'focal', l1FocalMm: 150, l2Kind: 'biconcave', l2FocalMm: -50 });
  assert.ok(reducer.ok && reducer.fourierZ === null && !reducer.fourF);
  // A diverging lens 1 has no real front focal plane.
  assert.deepEqual(ids(pair({ l1Kind: 'planoconcave', l1FocalMm: -50, pairObject: 'focal' })), ['pairObject', 'l1Kind']);
  // f₁ + f₂ ≤ 0 cannot be spaced afocal.
  assert.deepEqual(ids(pair({ l2Kind: 'planoconcave', l2FocalMm: -150 })), ['l1FocalMm', 'l2FocalMm', 'l1Kind', 'l2Kind']);
  // At a set gap: lenses that would overlap are refused, with the gap to set.
  const facing = { spacing: 'gap', l1Kind: 'planoconcave', l1FocalMm: -50, l1Orientation: 'plano', l2Orientation: 'convex' };
  const tight = pair({ ...facing, gapMm: 0 });
  assert.deepEqual(ids(tight), ['gapMm']);
  // The least gap it suggests is rounded up, so entering it works.
  const suggested = Number(tight.errors[0].message.match(/at least ([\d.]+) mm/)[1]);
  assert.equal(suggested, 2.299);
  assert.ok(pair({ ...facing, gapMm: suggested }).ok);
  close(pair({ ...facing, gapMm: suggested }).minimumGapMm, 2.2981766, 1e-7);
  // Two thin lenses at a gap e: Gullstrand's 1/f = 1/f₁ + 1/f₂ − e/(f₁f₂).
  const thinPair = pair({ spacing: 'gap', gapMm: 30, l1Kind: 'ideal', l2Kind: 'ideal' });
  close(thinPair.cardinal.efl, 1 / (1 / 50 + 1 / 150 - 30 / 7500), 1e-12);
  // A set gap of exactly f₁ + f₂ between ideal lenses is afocal too.
  assert.ok(pair({ spacing: 'gap', gapMm: 200, l1Kind: 'ideal', l2Kind: 'ideal' }).afocal);
});

test('a tiny image keeps its magnification and its sign', () => {
  // Two 0.1 mm lenses 100 m apart, the object 1 km away: m = 1/(C d + D)
  // does not cancel to zero as A + C s′ would.
  const r = pair({ spacing: 'gap', gapMm: 100000, l1Kind: 'ideal', l1FocalMm: 0.1, l2Kind: 'ideal', l2FocalMm: 0.1, pairObject: 'distance', pairDistanceMm: 1e6 });
  close(r.image.magnification, 1.0000021e-13, 1e-7);
  assert.equal(r.image.upright, true);
});

test('graphs: the image runs off at the focal plane without a line joining its branches', () => {
  const r = one({});
  const scan = imageScan({ thick: { matrix: r.lens.matrix }, thin: { matrix: thinModel(r.lens) } }, scanReach(r.lens.efl, 50));
  assert.equal(scan.x.length, 401);
  assert.equal(scanReach(20.2, 50), 100);
  // Before F the image is virtual, after it real; the first point past F is
  // left out, so the line breaks there.
  const ys = scan.thick.image, k = scan.x.findIndex(d => d > r.lens.ffl);
  assert.ok(ys[k - 1] < 0 && ys[k] === null && ys[k + 1] > 0);
  assert.equal(ys.filter(y => y === null).length, 1);
  // An afocal pair's magnification is flat and its image a straight line.
  const k2 = pair({});
  const flat = imageScan({ thick: { matrix: k2.system, afocal: true } }, 200);
  assert.ok(flat.thick.magnification.every(m => Math.abs(m + 3) < 1e-9));
});

test('figures: finite coordinates, the image off the figure said to be, rays outside the lens flagged', () => {
  for (const x of [{}, { objectDistanceMm: 15 }, { lensKind: 'biconcave' }, ideal(40), ideal(-40), { objectDistanceMm: 1e6 }, { lensKind: 'planoconcave', lensOrientation: 'plano' }]) {
    const r = one(x);
    finite(imagingDiagram(r));
  }
  // An object very near F images far beyond the figure.
  const far = one({ objectDistanceMm: one({}).lens.ffl * 1.0001 });
  const g = imagingDiagram(far);
  assert.equal(g.image, null);
  assert.match(g.imageNote, /off the figure/);
  // At F the image is at infinity, and the figure says so.
  assert.match(imagingDiagram(one({ objectDistanceMm: one({}).lens.ffl })).imageNote, /infinity/);
  // Inside F the steep construction ray misses the lens.
  assert.equal(imagingDiagram(one({ objectDistanceMm: 15 })).outside, true);
  assert.equal(imagingDiagram(one({})).outside, false);
  for (const x of [{}, { pairObject: 'focal' }, { pairObject: 'distance' }, { spacing: 'gap', gapMm: 100 }, { l1Kind: 'planoconcave', l1FocalMm: -50 }, { fieldDeg: 0 }]) {
    const d = pairDiagram(pair(x));
    finite(d);
    assert.equal(d.lenses.length, 2);
  }
});

test('the canvas: the lens with a point source at the object’s tip, the pair with a laser or a point source', () => {
  const s = imagingCanvasScene(one({}));
  assert.ok(s.ok);
  const [src, lens] = s.scene.elements;
  assert.equal(src.type, 'pointsource');
  // V₁ at −t/2, the object 50 mm before it, 3 mm above the axis (y down).
  assert.deepEqual([src.x, src.y], [-52.5, -3]);
  assert.equal(lens.type, 'thicklens');
  assert.deepEqual(imagingCanvasScene(one(ideal(40))).scene.elements[1].params, { f: 40, dia: 12, transEff: 100 });
  assert.ok(!imagingCanvasScene(one(ideal(5000))).ok);
  const p = pairCanvasScene(pair({}));
  assert.deepEqual(p.scene.elements.map(e => e.type), ['cwlaser', 'thicklens', 'thicklens']);
  const k = pair({});
  close(p.scene.elements[2].x, k.l1.thicknessMm / 2 + k.gapMm + k.l2.thicknessMm / 2, 1e-5);
  assert.match(p.note, /on the axis only/);
  assert.equal(pairCanvasScene(pair({ pairObject: 'focal' })).scene.elements[0].type, 'pointsource');
  // What the canvas cannot reproduce is declined with the reason, never
  // opened as something else: an object beyond a point source's reach, a
  // wavelength outside its sources'.
  const far = imagingCanvasScene(one({ objectDistanceMm: 2e5 }));
  assert.ok(!far.ok && /100 m at most/.test(far.reasons.join()));
  assert.ok(imagingCanvasScene(one({ objectDistanceMm: 9e4 })).ok);
  const ir = imagingCanvasScene(one(ideal(40, { wavelengthNm: 20000 })));
  assert.ok(!ir.ok && /100 to 12000 nm/.test(ir.reasons.join()));
  assert.ok(!pairCanvasScene(pair({ l1Kind: 'ideal', l2Kind: 'ideal', pairWavelengthNm: 15000 })).ok);
  assert.ok(!pairCanvasScene(pair({ pairObject: 'distance', pairDistanceMm: 2e5 })).ok);
});

// The numbers the page text quotes, recomputed. A change to the engine that
// moves one of them fails here, so the text is updated with it.
test('the numbers quoted on the imaging page are the engine’s', () => {
  const text = JSON.stringify(imagingCalculators);
  const says = fragment => assert.ok(text.includes(fragment), `the text no longer says “${fragment}”`);
  // The text writes a minus sign, not a hyphen.
  const fixed = (x, d) => Number(x).toFixed(d).replace('-', '−');
  const sigf = (x, d) => String(Number(Number(x).toPrecision(d))).replace('-', '−');

  const r = one({}), { lens, image, thin } = r;
  says(`at 588 nm, where n = ${fixed(lens.n, 5)}. Its f is ${fixed(lens.efl, 2)} mm, with H and H′ ${fixed(lens.h1Mm, 3)} mm inside each face`);
  close(lens.h1Mm, -lens.h2Mm, 1e-12);
  says(`An object 50 mm before V₁ stands ${fixed(image.objectFromH, 2)} mm before H; its image forms ${fixed(image.imageFromH2, 2)} mm after H′, so ${fixed(image.fromLast, 2)} mm after V₂: real, inverted and reduced, m = ${sigf(image.magnification, 4)}`);
  says(`x = ${fixed(image.newtonX, 2)} mm and x′ = ${fixed(image.newtonX2, 2)} mm, whose product is f² = ${sigf(lens.efl ** 2, 4)} mm²`);
  const near = one({ objectDistanceMm: 15 }).image;
  says(`inside F (${fixed(lens.ffl, 2)} mm before V₁), the object of the example gives a virtual, upright image ${fixed(-near.fromLast, 2)} mm before V₂, magnified ${sigf(near.magnification, 4)} times`);
  const cc = one({ lensKind: 'biconcave' });
  says(`f = ${fixed(cc.lens.efl, 2)} mm, and the object 50 mm away a virtual, upright, reduced image ${fixed(-cc.image.fromLast, 2)} mm before V₂, m = ${sigf(cc.image.magnification, 4)}`);
  says(`the thin-lens formula gives f = ${fixed(lens.thinFocalMm, 2)} mm and puts the image ${fixed(thin.fromLast, 2)} mm after V₂ (m = ${sigf(thin.magnification, 4)}), ${fixed(image.fromLast - thin.fromLast, 3)} mm short of the thick lens’s ${fixed(image.fromLast, 2)} mm`);

  const k = pair({});
  says(`their vertices are ${fixed(k.gapMm, 2)} mm apart, H′ of the first lying ${fixed(-k.l1.h2Mm, 3)} mm inside its glass. A 5 mm beam leaves ${sigf(k.beam.diameterMm, 4)} mm wide, and a beam tilted by 1° leaves at ${sigf(k.beam.angleDeg, 4)}°`);
  says(`the gap would be ${fixed(k.thinGapMm - k.gapMm, 3)} mm too long`);
  const g = pair({ l1Kind: 'planoconcave', l1FocalMm: -50 });
  says(`${fixed(g.gapMm, 2)} mm between the vertices, ${fixed(g.lengthMm, 2)} mm from the first to the last, and the tilted beam leaves at +${sigf(g.beam.angleDeg, 4)}°`);
  const f4 = pair({ pairObject: 'focal' });
  assert.equal(f4.objectDistanceMm, 50);
  assert.equal(f4.l1.h1Mm, 0);
  says(`to ${sigf(f4.image.fromLast, 6)} mm after lens 2, with m = ${sigf(f4.image.magnification, 6)}; its Fourier plane lies ${fixed(f4.l1.bfl, 2)} mm after lens 1’s back vertex`);
  says(`puts the image ${fixed(f4.thinImage.fromLast, 1)} mm after lens 2: an error along the axis is multiplied by (f₂/f₁)² = ${sigf((f4.l2.efl / f4.l1.efl) ** 2, 6)}`);
  // The limits the text states are the schema's.
  says(`the field angle (up to ${PAIR_INPUTS.find(i => i.id === 'fieldDeg').max}°)`);
  const gp = pair({ spacing: 'gap', gapMm: 100 });
  says(`one lens of f = ${fixed(gp.cardinal.efl, 2)} mm whose F′ lies ${fixed(-gp.cardinal.bfl, 2)} mm before lens 2’s back vertex`);
  says(`The thin-lens model gives f = ${fixed(gp.thinCardinal.efl, 2)} mm`);
});
