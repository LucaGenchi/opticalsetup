// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The thin and thick lens calculator (calculators/thin-thick-lens/). The
// Python reference (validation/reference/thick_lens.py) checks its numbers;
// these tests check its limits, refusals and the numbers its text quotes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LENS_DEFAULTS, computeThickLens, lensData, imageOf, rayDiagram, canvasScene, singletRays, singletSystem, aplanaticRays,
  focusFrom, beamPupil, GAUSSIAN_SHARE,
} from '../calculators/thin-thick-lens/thick-lens.js';
import { gaussianCoupling } from '../calculators/fiber-coupling/fiber-coupling.js';
import { analyzeCoupling } from '../calculators/lens-design/engine/coupling.js';
import { thickLensCalculators } from '../tools/calculators-thick-lens-content.mjs';

const close = (a, b, rel, label = '') => assert.ok(Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1e-300), `${label} ${a} vs ${b}`);
const run = (x, options) => computeThickLens({ ...LENS_DEFAULTS, ...x }, options);
const lensOnly = x => run(x, { focus: false });

test('lens data: thin and thick limits', () => {
  // Zero thickness: the thick lens is the thin one, H and H′ on the lens.
  const thin = lensOnly({ r1Mm: 40, r2Mm: -60, thicknessMm: 0, diameterMm: 4 });
  close(thin.efl, thin.lens.thinFocalMm, 1e-12);
  assert.ok(Math.abs(thin.h1Mm) < 1e-12 && Math.abs(thin.h2Mm) < 1e-12);
  // A plano-convex lens, curved side first: thickness leaves f alone, H
  // sits on the curved vertex, H′ t/n inside the flat back.
  const pcx = lensOnly({});
  close(pcx.efl, pcx.lens.thinFocalMm, 1e-12);
  assert.ok(Math.abs(pcx.h1Mm) < 1e-12);
  close(pcx.h2Mm, -3 / pcx.n, 1e-12);
  close(pcx.bfl, pcx.efl - 3 / pcx.n, 1e-12);
  // Turned round, H′ sits on the curved vertex and F′ is f behind it.
  const flip = lensOnly({ r1Mm: 0, r2Mm: -5.5 });
  close(flip.efl, pcx.efl, 1e-12);
  close(flip.bfl, flip.efl, 1e-12);
  // A biconvex lens: thickness lengthens f; H and H′ sit symmetrically.
  const bx = lensOnly({ wavelengthNm: 587.6, r1Mm: 20, r2Mm: -20, thicknessMm: 5, diameterMm: 12 });
  assert.ok(bx.efl > bx.lens.thinFocalMm);
  close(bx.h1Mm, -bx.h2Mm, 1e-12);
  // Equal radii with no thickness: zero power (afocal), refused.
  assert.equal(lensOnly({ r1Mm: 20, r2Mm: 20, thicknessMm: 0, diameterMm: 4 }).ok, false);
});

test('the image: lens formula, Newton, virtual images and the construction rays', () => {
  for (const [x, d] of [[{}, 30], [{}, 6], [{ wavelengthNm: 587.6, r1Mm: 20, r2Mm: -20, thicknessMm: 5, diameterMm: 12 }, 100], [{ glass: 'silica', wavelengthNm: 1064, r1Mm: -40, r2Mm: 40, thicknessMm: 2, diameterMm: 10 }, 50]]) {
    const r = lensOnly({ ...x, objectDistanceMm: d });
    const im = r.image, f = r.efl;
    close(1 / im.objectFromH + 1 / im.imageFromH2, 1 / f, 1e-10, 'lens formula');
    close(im.magnification, -im.imageFromH2 / im.objectFromH, 1e-10, 'magnification');
    close(im.newtonX * im.newtonX2, f * f, 1e-9, 'Newton');
    // The three rays from the object's tip meet at the image's tip.
    const g = rayDiagram(r);
    for (const ray of g.rays) {
      const [, , [t, y2]] = ray.path;
      close(y2 + ray.slopeOut * (t + im.fromV2 - t), im.heightMm, 1e-9, ray.name);
    }
    // The extensions meet the principal planes at the same height.
    const per = g.extend.length / g.rays.length;
    for (let i = 0; i < g.rays.length; i++) assert.ok(Math.abs(g.extend[per * i][1][1] - g.extend[per * i + 1][1][1]) < 1e-9 * Math.max(1, Math.abs(im.heightMm)), 'H and H′ heights');
  }
  const inside = lensOnly({ objectDistanceMm: 6 });
  assert.equal(inside.image.real, false);
  assert.equal(inside.image.upright, true);
  // At the front focal point the image is at infinity.
  const atF = lensOnly({ objectDistanceMm: lensOnly({}).ffl });
  assert.equal(atF.image.atInfinity, true);
  assert.match(rayDiagram(atF).imageNote, /infinity/);
});

test('the ideal lens reproduces the Gaussian beam', () => {
  const r = run({});
  const s = r.scan.ideal, w0 = r.ideal.waistUm;
  close(s.bestRadiusUm, w0, 1e-3, 'focused waist');
  close(s.bestCoupling, r.gaussianEta, 1e-3, 'coupling');
  assert.ok(Math.abs(s.bestShiftMm) < 0.01 * r.ideal.rayleighMm, 'focus at F′');
  // One Rayleigh range away: √2 the radius, half the peak.
  const m = s.model, zr = r.ideal.rayleighMm;
  for (const z of [zr, -zr]) {
    const p = m.plane(z);
    close(m.radiusHolding(p) * 1e3, Math.SQRT2 * w0, 2.5e-3, 'radius at z_R');
    close(m.peak(p), 0.5, 4e-3, 'peak at z_R');
    close(m.coupling(p, r.values.mfdUm / 2000), gaussianCoupling({ waistUm: w0, modeRadiusUm: r.values.mfdUm / 2, wavelengthNm: 1550, axialOffsetUm: z * 1e3 }), 3e-3, 'coupling at z_R');
  }
  // The share held is GAUSSIAN_SHARE by definition of the radius.
  const p0 = m.plane(0);
  close(m.radiusHolding(p0, 0.5) / m.radiusHolding(p0), Math.sqrt(Math.log(2) / 2), 1e-3, 'half-power radius');
  assert.ok(GAUSSIAN_SHARE > 0.86 && GAUSSIAN_SHARE < 0.87);
  // A clear aperture as wide as the beam cuts its tails: less power
  // focused, a wider spot.
  const cut = run({ diameterMm: 2 });
  close(cut.clipShare, 1 - Math.exp(-2), 1e-12);
  assert.ok(cut.scan.ideal.bestRadiusUm > 1.05 * w0);
});

test('slower beams follow the paraxial Gaussian more closely', () => {
  // The text quotes 2 × 10⁻³ at the example's convergence.
  let last = Infinity;
  for (const bd of [2, 1, 0.5]) {
    const r = run({ beamDiameterMm: bd }), m = r.scan.ideal.model;
    const error = Math.abs(m.radiusHolding(m.plane(r.ideal.rayleighMm)) * 1e3 / (Math.SQRT2 * r.ideal.waistUm) - 1);
    assert.ok(error < (bd === 2 ? 2.5e-3 : last), `${bd} mm: ${error}`);
    last = error;
  }
});

test('a lens that follows the tangent rule widens the focus by 0.4 %', () => {
  // The text compares the aplanat with a lens whose rays leave at
  // tan θ = h/f (the lens designer's ideal lens).
  const r = run({});
  const rays = aplanaticRays(r.values, r.lens), f = r.lens.efl, { epd } = beamPupil(r.values);
  const D = rays.bundle.D;
  for (let k = 0; k < rays.bundle.K; k++) {
    const h = epd / 2 * rays.bundle.px[k], c = 1 / Math.hypot(1, h / f);
    D[3 * k] = -h / f * c; D[3 * k + 2] = c;
  }
  const tangent = focusFrom(rays);
  const ratio = tangent.radiusHolding(tangent.plane(0)) * 1e3 / r.scan.ideal.bestRadiusUm;
  const text = JSON.stringify(thickLensCalculators);
  assert.ok(text.includes(`widen the example’s focus by ${(100 * (ratio - 1)).toFixed(1)} %`), `ratio ${ratio}`);
});

test('the singlet’s coupling matches the lens designer’s two-dimensional overlap', () => {
  for (const x of [{}, { r1Mm: 0, r2Mm: -5.5 }, { beamDiameterMm: 1.4 }]) {
    const r = lensOnly(x);
    const rays = singletRays(r.values, r.lens), m = focusFrom(rays);
    // At the paraxial focus both evaluate the same model; off it the engine
    // centres its sphere on the core instead (Debye-Wolf here).
    for (const shift of [0]) {
      const system = { ...singletSystem(r.values, r.lens), diffraction: { ...singletSystem(r.values, r.lens).diffraction, grid: 256 }, coupling: { mfdUm: 10.4, axialUm: shift * 1e3 } };
      const engine = analyzeCoupling(system, { zImage: rays.zFocus, scans: false });
      close(m.coupling(m.plane(shift), 10.4 / 2000), engine.eta, 1e-4, `${JSON.stringify(x)} at ${shift}`);
    }
  }
});

test('refusals and partial results', () => {
  const outside = lensOnly({ wavelengthNm: 3000 });
  assert.equal(outside.ok, false);
  assert.equal(outside.errors[0].id, 'wavelengthNm');
  assert.equal(lensOnly({ r1Mm: 2 }).ok, false, 'a radius smaller than the clear radius');
  assert.equal(run({ mfdUm: 0.5 }).ok, false, 'a mode spreading beyond 0.3 rad');
  assert.equal(run({ fiberMode: 'step', coreDiameterUm: 2, na: 0.05 }).ok, false, 'V outside the fit');
  // A diverging lens: lens data and the image, no focus.
  const neg = run({ r1Mm: -20, r2Mm: 20, thicknessMm: 2 });
  assert.ok(neg.ok && neg.efl < 0 && neg.beamIssue && !neg.scan);
  // Faces that cross: the ideal lens only.
  const crossed = run({ r1Mm: 5.5, r2Mm: -5.5, thicknessMm: 0.5 });
  assert.ok(crossed.ok && crossed.realIssue && crossed.scan.ideal && !crossed.scan.real);
  assert.equal(rayDiagram(crossed).outline, null);
  // A lit pupil too steep for the model.
  assert.ok(run({ beamDiameterMm: 6, r1Mm: 3.1, diameterMm: 6, thicknessMm: 4 }).beamIssue);
  // Every number the page draws is finite.
  const r = run({});
  for (const kind of ['real', 'ideal']) {
    for (const key of ['peak', 'radiusUm', 'coupling']) assert.ok(r.scan[kind][key].every(Number.isFinite), `${kind} ${key}`);
  }
});

test('the singlet opens in the canvas as its Thick spherical lens', () => {
  const r = lensOnly({});
  const scene = canvasScene(r.values);
  assert.ok(scene.ok);
  const lens = scene.scene.elements.find(e => e.type === 'thicklens');
  assert.deepEqual([lens.params.r1, lens.params.r2, lens.params.thickness, lens.params.dia, lens.params.glass], [5.5, 0, 3, 6, 'nbk7']);
  assert.equal(scene.note, '');
  assert.equal(canvasScene({ ...r.values, thicknessMm: 0 }).ok, false);
});

// The numbers the page text quotes, recomputed. A change to the engine that
// moves one of them fails here, so the text is updated with it.
test('the numbers quoted on the thin and thick lens page are the engine’s', () => {
  const text = JSON.stringify(thickLensCalculators);
  const says = fragment => assert.ok(text.includes(fragment), `the text no longer says “${fragment}”`);
  const sigf = (x, d) => String(Number(Number(x).toPrecision(d)));
  const fixed = (x, d) => Number(x).toFixed(d);

  const d = run({});
  says(`used at 1550 nm, where n = ${fixed(d.n, 5)}`);
  says(`f = ${fixed(d.efl, 2)} mm. But H′ lies ${fixed(-d.h2Mm, 3)} mm inside the glass`);
  says(`only ${fixed(d.bfl, 3)} mm behind the flat back`);
  const bx = lensOnly({ wavelengthNm: 587.6, r1Mm: 20, r2Mm: -20, thicknessMm: 5, diameterMm: 12 });
  says(`${fixed(bx.lens.thinFocalMm, 2)} mm by the thin formula, ${fixed(bx.efl, 2)} mm by the thick one, with H and H′ ${fixed(bx.h1Mm, 3)} mm inside each face and a back focal length of ${fixed(bx.bfl, 2)} mm`);
  says(`imaged ${fixed(d.image.fromV2, 2)} mm after the back vertex, inverted and reduced, m = −${fixed(-d.image.magnification, 4)}`);
  says(`would put it at ${fixed(d.thin.fromV2, 2)} mm`);
  const at = nm => lensOnly({ wavelengthNm: nm }).efl;
  says(`f = ${fixed(at(486.1), 2)} mm at 486.1 nm (the F line) and ${fixed(at(656.3), 2)} mm at 656.3 nm (the C line); at 1300 nm it is ${fixed(at(1300), 2)} mm, at 1550 nm ${fixed(at(1550), 2)} mm`);
  says(`to a ${sigf(d.ideal.waistUm, 3)} µm waist, ${fixed(d.ideal.fromV2Mm, 3)} mm after the back vertex, with a Rayleigh range of ${sigf(d.ideal.rayleighMm * 1e3, 4)} µm, converging at ${sigf(d.ideal.halfAngleMrad, 4)} mrad`);
  const s = d.scan.real;
  says(`the singlet reaches only ${sigf(s.paraxialStrehl, 2)} at its paraxial focus F′. Its brightest plane lies ${sigf(-s.bestShiftMm * 1e3, 4)} µm closer to the lens, where the Strehl ratio is ${sigf(s.strehl, 3)} and the spot radius ${sigf(s.bestRadiusUm, 3)} µm, against ${sigf(d.scan.ideal.bestRadiusUm, 3)} µm for the ideal lens`);
  const flip = run({ r1Mm: 0, r2Mm: -5.5 });
  says(`the best Strehl ratio falls to ${sigf(flip.scan.real.strehl, 3)}, ${sigf(-flip.scan.real.bestShiftMm * 1e3, 4)} µm before F′`);
  const narrow = run({ beamDiameterMm: 1 });
  says(`With a 1 mm beam the singlet is nearly perfect (${sigf(narrow.scan.real.strehl, 3)})`);
  says(`the ideal lens couples ${sigf(100 * d.scan.ideal.bestCoupling, 3)} %. The singlet couples ${sigf(100 * s.paraxialCoupling, 3)} % with the fiber at F′, and ${sigf(100 * s.bestCoupling, 3)} % with it ${sigf(-s.fiberShiftMm * 1e3, 4)} µm closer to the lens`);
  says(`Flat side first, the best is ${sigf(100 * flip.scan.real.bestCoupling, 3)} %`);
  says(`yet couples only ${sigf(100 * narrow.scan.real.bestCoupling, 3)} %, because its ${sigf(narrow.ideal.waistUm, 4)} µm waist`);
  const n = lensData({ glass: 'nbk7', wavelengthNm: 587.6, r1Mm: 1, r2Mm: 0, thicknessMm: 0 }).n;
  says(`(about ${Math.round(100 * ((n - 1) / (n + 1)) ** 2)} % per uncoated face)`);
});
