// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The thin and thick lens calculator (calculators/thin-thick-lens/). The
// Python reference (validation/reference/thick_lens.py) checks its numbers;
// these tests check its limits, refusals and the numbers its text quotes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LENS_DEFAULTS, FIBER_DEFAULTS, computeThickLens, computeFiber, lensData, bestFormRatio, beamDiagram, canvasScene, chromaticScan,
  singletRays, singletSystem, aplanaticRays, focusFrom, beamPupil, fresnelTransmission, GAUSSIAN_SHARE,
} from '../calculators/thin-thick-lens/thick-lens.js';
import { gaussianCoupling } from '../calculators/fiber-coupling/fiber-coupling.js';
import { analyzeCoupling, modeNorm } from '../calculators/lens-design/engine/coupling.js';
import { materialIndex } from '../calculators/lens-design/engine/materials.js';
import { thickLensCalculators } from '../tools/calculators-thick-lens-content.mjs';

const close = (a, b, rel, label = '') => assert.ok(Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1e-300), `${label} ${a} vs ${b}`);
const run = (x, options) => computeThickLens({ ...LENS_DEFAULTS, ...x }, options);
const lensOnly = x => run(x, { focus: false });
const fiber = (r, x = {}) => computeFiber(r, { ...FIBER_DEFAULTS, ...x });
// A singlet given by its radii and centre thickness.
const radii = (front, back, t, x = {}) => ({ lensKind: 'biconvex', spec: 'radii', frontRadiusMm: front, backRadiusMm: back, thicknessMm: t, ...x });
const plano = (R, t, x = {}) => ({ lensKind: 'planoconvex', spec: 'radii', convexRadiusMm: R, thicknessMm: t, ...x });

test('lens data: thin and thick limits', () => {
  // The ideal lens: f as given, H and H′ in its plane, no glass and the
  // same f at every wavelength.
  const ideal = lensOnly({ lensKind: 'ideal' });
  assert.equal(ideal.efl, 11);
  assert.ok(ideal.h1Mm === 0 && ideal.h2Mm === 0 && ideal.bfl === 11);
  assert.equal(ideal.values.glass, undefined);
  assert.ok(chromaticScan(ideal.values, ideal.lens).every(p => p.efl === 11 && p.bfl === 11 && p.thin === 11));
  // It takes wavelengths outside every glass's range.
  assert.ok(lensOnly({ lensKind: 'ideal', wavelengthNm: 10000 }).ok);
  // A plano-convex lens, curved side first: thickness leaves f alone, H
  // sits on the curved vertex, H′ t/n inside the flat back.
  const pcx = lensOnly(plano(5.5, 3));
  close(pcx.efl, pcx.lens.thinFocalMm, 1e-12);
  assert.ok(Math.abs(pcx.h1Mm) < 1e-12);
  close(pcx.h2Mm, -3 / pcx.n, 1e-12);
  close(pcx.bfl, pcx.efl - 3 / pcx.n, 1e-12);
  // Turned round, H′ sits on the curved vertex and F′ is f behind it.
  const flip = lensOnly(plano(5.5, 3, { orientation: 'plano' }));
  close(flip.efl, pcx.efl, 1e-12);
  close(flip.bfl, flip.efl, 1e-12);
  // A bi-convex lens: thickness lengthens f; H and H′ sit symmetrically.
  const bx = lensOnly(radii(20, 20, 5, { wavelengthNm: 587.6, diameterMm: 12 }));
  assert.ok(bx.efl > bx.lens.thinFocalMm);
  close(bx.h1Mm, -bx.h2Mm, 1e-12);
  // A thin bi-convex lens tends to the lensmaker's formula.
  const thin = lensOnly(radii(40, 60, 0.01, { diameterMm: 4 }));
  close(thin.efl, thin.lens.thinFocalMm, 1e-4);
});

test('a singlet designed from its focal length has that focal length and edge', () => {
  for (const glass of ['nbk7', 'silica', 'nsf11']) {
    for (const x of [{}, { orientation: 'plano' }, { lensKind: 'biconvex' }, { lensKind: 'biconvex', shape: 'best' }]) {
      if (glass === 'nsf11' && x.shape === 'best') continue;
      const r = lensOnly({ glass, wavelengthNm: 1064, focalMm: 25, diameterMm: 12.7, edgeMm: 2, ...x });
      assert.ok(r.ok, `${glass} ${JSON.stringify(x)}`);
      close(r.efl, 25, 1e-12, `${glass} ${JSON.stringify(x)} f`);
      assert.ok(Math.abs(r.geometry.edgeMm - 2) < 1e-12, `${glass} ${JSON.stringify(x)} edge ${r.geometry.edgeMm}`);
    }
  }
  // Near hemispherical faces the power falls again as the centre thickens:
  // a lens on the far side of the strongest one is still found, and the
  // refusal names the strongest.
  const tight = lensOnly({ lensKind: 'biconvex', focalMm: 4.4214828 });
  close(tight.values.r1Mm, 3.5, 1e-7);
  close(tight.values.thicknessMm, 4.3944487, 1e-7);
  assert.match(lensOnly({ lensKind: 'biconvex', focalMm: 3 }).errors[0].message, /the strongest has f = 4\.36\d mm/);
  // Plano-convex: R = (n − 1)f exactly, either way round.
  const pc = lensOnly({});
  close(pc.values.r1Mm, (pc.n - 1) * 11, 1e-15);
  const flip = lensOnly({ orientation: 'plano' });
  assert.deepEqual([flip.values.r1Mm, flip.values.r2Mm, flip.values.thicknessMm], [0, -pc.values.r1Mm, pc.values.thicknessMm]);
  // The best form meets the Coddington condition: R₂ = −6R₁ at n = 1.5,
  // and none is bi-convex from n = 1.686.
  close(bestFormRatio(1.5), 6, 1e-12);
  const best = lensOnly({ lensKind: 'biconvex', shape: 'best' }), n = best.n;
  close((best.values.r1Mm + best.values.r2Mm) / (best.values.r1Mm - best.values.r2Mm), -2 * (n * n - 1) / (n + 2), 1e-12);
  assert.equal(bestFormRatio(1.687), null);
  // And it focuses best: best form ahead of plano-convex curved side first,
  // ahead of equi-convex, all for the same f.
  const strehl = x => run(x).scan.real.strehl;
  assert.ok(strehl({ lensKind: 'biconvex', shape: 'best' }) > strehl({}) && strehl({}) > strehl({ lensKind: 'biconvex' }));
});

test('the ideal lens reproduces the Gaussian beam', () => {
  const r = run({});
  const s = r.scan.ideal, w0 = r.ideal.waistUm;
  // Slightly tighter than the paraxial formula (the small-angle limit),
  // by the amount the text quotes.
  const waistError = s.bestRadiusUm / w0 - 1;
  assert.ok(waistError < 0 && waistError > -1.5e-3, `focused waist ${waistError}`);
  const text = JSON.stringify(thickLensCalculators);
  assert.ok(text.includes(`within ${(-100 * waistError).toFixed(2)} % of the Gaussian formula’s waist`), `waist ${waistError}`);
  assert.ok(text.includes(`the Gaussian waist to ${(-waistError * 1e3).toFixed(1)} × 10⁻³`), `waist ${waistError}`);
  assert.ok(Math.abs(s.bestShiftMm) < 0.01 * r.ideal.rayleighMm, 'focus at F′');
  const f = fiber(r);
  close(f.ideal.aligned, gaussianCoupling({ waistUm: w0, modeRadiusUm: 5.2, wavelengthNm: 1550 }), 1e-4, 'coupling');
  // One Rayleigh range away: √2 the radius, half the peak.
  const m = s.model, zr = r.ideal.rayleighMm;
  for (const z of [zr, -zr]) {
    const p = m.plane(z);
    close(m.radiusHolding(p) * 1e3, Math.SQRT2 * w0, 2.5e-3, 'radius at z_R');
    // 0.4971 at the example's convergence: the paraxial 1/2 is the
    // small-angle limit.
    close(m.peak(p), 0.5, 7e-3, 'peak at z_R');
    close(m.coupling(p, 5.2e-3), gaussianCoupling({ waistUm: w0, modeRadiusUm: 5.2, wavelengthNm: 1550, axialOffsetUm: z * 1e3 }), 3e-3, 'coupling at z_R');
  }
  // The share held is GAUSSIAN_SHARE by definition of the radius.
  const p0 = m.plane(0);
  close(m.radiusHolding(p0, 0.5) / m.radiusHolding(p0), Math.sqrt(Math.log(2) / 2), 1e-3, 'half-power radius');
  assert.ok(GAUSSIAN_SHARE > 0.86 && GAUSSIAN_SHARE < 0.87);
  // A clear aperture as wide as the beam cuts its tails: less power
  // focused, a wider spot.
  const cut = run({ lensKind: 'ideal', diameterMm: 2 });
  close(cut.clipShare, 1 - Math.exp(-2), 1e-12);
  assert.ok(cut.scan.ideal.bestRadiusUm > 1.05 * w0);
});

test('the focusing NA and the through-focus window', () => {
  const r = run({});
  close(r.focusNa, Math.sin(r.ideal.halfAngleMrad * 1e-3), 1e-15);
  close(r.focusNa, 1 / 11, 2e-3, 'about w/f');
  // The window holds F′ and each lens's brightest plane with room on both
  // sides, on round steps: flat side first, its focus 268 µm before F′.
  for (const x of [{}, { orientation: 'plano' }]) {
    const r = run(x), s = r.scan, zr = r.ideal.rayleighMm, b = s.real.bestShiftMm, room = Math.max(3 * zr, Math.abs(b));
    assert.ok(s.shiftsMm[0] <= Math.min(-3 * zr, b - room) + 1e-12, `${JSON.stringify(x)} low end`);
    assert.ok(s.shiftsMm.at(-1) >= Math.max(3 * zr, b + room) - 1e-12, `${JSON.stringify(x)} high end`);
  }
  const flip = run({ orientation: 'plano' }).scan;
  assert.ok(Math.abs(flip.shiftsMm[0] + 0.6) < 1e-12 && Math.abs(flip.shiftsMm.at(-1) - 0.2) < 1e-12, 'flat side first: −600 to 200 µm');
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

test('the fiber set off: the ideal lens follows the Gaussian closed form', () => {
  // A clear aperture that cuts nothing: the closed form's untruncated beam.
  const r = run({ lensKind: 'ideal', diameterMm: 25 }), m = r.scan.ideal.model, zr = r.ideal.rayleighMm;
  for (const z of [0, zr, -zr]) {
    for (const [dx, tilt] of [[3, 0], [0, 40], [0, -40]]) {
      close(m.coupling(m.plane(z), 5.2e-3, dx * 1e-3, tilt * 1e-3),
        gaussianCoupling({ waistUm: r.ideal.waistUm, modeRadiusUm: 5.2, wavelengthNm: 1550, axialOffsetUm: z * 1e3, lateralOffsetUm: dx, tiltMrad: tilt }),
        3e-3, `z ${z}, ${dx} µm, ${tilt} mrad`);
    }
  }
  assert.throws(() => m.coupling(m.plane(0), 5.2e-3, 3e-3, 0.03), /one offset at a time/);
});

test('the tilted fiber’s arc of azimuth matches a brute-force ring, quickly', () => {
  // A 200 µm mode at 350 nm tilted 100 mrad: its far field lights a sliver
  // of each ring. Against the trapezoid rule on 20000 azimuths, and fast.
  const r = run({ lensKind: 'ideal', wavelengthNm: 350 }), m = r.scan.ideal.model, p = m.plane(0), w = 0.1;
  const theta = m.lambda / (Math.PI * w), N = m.samples;
  const brute = tau => {
    let re = 0, im = 0;
    const ring = s => {
      const c = Math.sqrt(1 - s * s), M = 20000;
      let sum = 0;
      for (let j = 0; j <= M; j++) { const ca = s * Math.cos(Math.PI * j / M) * Math.sin(tau) + c * Math.cos(tau); sum += (j === 0 || j === M ? 0.5 : 1) * Math.exp(-(1 - ca * ca) / theta ** 2); }
      return sum / M;
    };
    for (let k = 0; k <= N; k++) {
      if (!(p.weight[k] > 0)) continue;
      const c = (k === 0 || k === N ? 1 : k % 2 ? 4 : 2) / (3 * N) * p.weight[k] * k / N * ring(p.s[k]), ph = -2 * Math.PI * p.opd[k];
      re += c * Math.cos(ph); im += c * Math.sin(ph);
    }
    return re * re + im * im;
  };
  const ratio = (brute(0.1) / brute(0)) * m.coupling(p, w);
  const t0 = performance.now(), fast = m.coupling(p, w, 0, 0.1);
  assert.ok(performance.now() - t0 < 50, 'one tilted overlap in well under a frame');
  close(fast, ratio, 1e-5, 'arc');
  // The whole fiber panel for that case, three scans included.
  const t1 = performance.now();
  assert.ok(fiber(r, { mfdUm: 200 }).ok);
  assert.ok(performance.now() - t1 < 2000, 'fiber panel time');
});

test('the singlet’s coupling matches the lens designer’s two-dimensional overlap', () => {
  for (const x of [{}, { orientation: 'plano' }, { beamDiameterMm: 1.4 }]) {
    const r = lensOnly(x);
    const rays = singletRays(r.values, r.lens), m = focusFrom(rays);
    const engine = (shift, dx = 0, tilt = 0) => {
      const sys = singletSystem(r.values, r.lens);
      return analyzeCoupling({ ...sys, diffraction: { ...sys.diffraction, grid: 256 }, coupling: { mfdUm: 10.4, axialUm: shift * 1e3, offsetXUm: dx, offsetYUm: 0, tiltXMrad: tilt, tiltYMrad: 0 } }, { zImage: rays.zFocus, scans: false }).eta;
    };
    // At the paraxial focus both evaluate the same model.
    close(m.coupling(m.plane(0), 5.2e-3), engine(0), 1e-4, `${JSON.stringify(x)} at F′`);
    if (x.orientation || x.beamDiameterMm) continue;
    // Set off near the best plane, they differ only in where the sphere is
    // centred (the engine's on the core): to a few 10⁻³.
    const p = m.plane(-0.08);
    for (const [dx, tilt] of [[3, 0], [0, 30], [0, -30]]) close(m.coupling(p, 5.2e-3, dx * 1e-3, tilt * 1e-3), engine(-0.08, dx, tilt), 5e-3, `${dx} µm, ${tilt} mrad`);
  }
});

test('refusals and partial results', () => {
  const outside = lensOnly({ wavelengthNm: 3000 });
  assert.equal(outside.ok, false);
  assert.equal(outside.errors[0].id, 'wavelengthNm');
  assert.equal(lensOnly(plano(2, 3)).ok, false, 'a radius smaller than the clear radius');
  // A focal length too short for the diameter, plano-convex and bi-convex.
  assert.deepEqual(lensOnly({ focalMm: 5 }).errors.map(e => e.id), ['focalMm', 'diameterMm']);
  assert.equal(lensOnly({ lensKind: 'biconvex', focalMm: 2 }).ok, false);
  // No bi-convex best form in a dense flint.
  assert.deepEqual(lensOnly({ lensKind: 'biconvex', shape: 'best', glass: 'nsf11' }).errors.map(e => e.id), ['shape', 'glass']);
  // A bi-convex lens so thick that it diverges: lens data, no focus.
  const neg = run(radii(5, 5, 40, { diameterMm: 4 }));
  assert.ok(neg.ok && neg.efl < 0 && neg.beamIssue && !neg.scan);
  // Faces that cross: the ideal lens only.
  const crossed = run(radii(5.5, 5.5, 0.5));
  assert.ok(crossed.ok && crossed.realIssue && crossed.scan.ideal && !crossed.scan.real);
  assert.equal(beamDiagram(crossed).outline, null);
  // A lens narrower than the beam.
  assert.deepEqual(lensOnly({ diameterMm: 1.9 }).errors.map(e => e.id), ['diameterMm', 'beamDiameterMm']);
  assert.ok(lensOnly({ diameterMm: 2 }).ok, 'as wide as the beam');
  // A lit pupil too steep for the model.
  assert.ok(run(plano(3.1, 4, { beamDiameterMm: 6 })).beamIssue);
  // Fiber modes the page cannot take.
  const r = run({});
  assert.equal(fiber(r, { mfdUm: 0.5 }).ok, false, 'a mode spreading beyond 0.3 rad');
  assert.equal(fiber(r, { fiberMode: 'step', coreDiameterUm: 2, na: 0.05 }).ok, false, 'V outside the fit');
  assert.equal(fiber(r, { fiberMode: 'index', coreIndex: 1.44, claddingIndex: 1.45 }).ok, false, 'a core below its cladding');
  assert.ok(fiber(lensOnly({}), {}).pending, 'no focus computed above');
  // Every number the page draws is finite.
  for (const kind of ['real', 'ideal']) for (const key of ['peak', 'radiusUm']) assert.ok(r.scan[kind][key].every(Number.isFinite), `${kind} ${key}`);
  const f = fiber(r);
  for (const kind of ['real', 'ideal']) for (const axis of ['lateral', 'axial', 'tilt']) assert.ok(f.scans[kind][axis].every(Number.isFinite), `${kind} ${axis}`);
});

test('a wavefront the pupil grid cannot follow is traced finer, or refused', () => {
  // Flat side first the wavefront needs 4096 samples; there the peak and
  // coupling agree with 16384 samples.
  const flip = run({ orientation: 'plano' });
  assert.equal(flip.scan.samples, 4096);
  const fine = focusFrom(singletRays(flip.values, flip.lens, 16384)), plane = fine.plane(flip.scan.real.bestShiftMm);
  assert.ok(Math.abs(fine.peak(plane) - flip.scan.real.strehl) < 1e-5, 'peak');
  assert.ok(Math.abs(fine.coupling(plane, 5.2e-3) - flip.scan.real.model.coupling(flip.scan.real.atBest, 5.2e-3)) < 1e-5, 'coupling');
  // On 1024 samples it is resolved at F′ but not at the far end of the
  // search for its brightest plane, 2.6 mm past it.
  const coarse = focusFrom(singletRays(flip.values, flip.lens, 1024));
  coarse.peak(coarse.plane(0));
  assert.equal(coarse.resolved(), true);
  coarse.peak(coarse.plane(flip.scan.real.reachMm));
  assert.equal(coarse.resolved(), false);
  // Hundreds of waves (flat side first, a 5 mm beam at 350 nm): refused,
  // not shown wrong.
  const steep = run({ orientation: 'plano', beamDiameterMm: 5, wavelengthNm: 350 });
  assert.ok(steep.ok && !steep.scan && /4096 samples/.test(steep.beamIssue));
  // A spot wider than the radius scan reaches: no radius, rather than a
  // wrong one.
  const wide = run({ orientation: 'plano', beamDiameterMm: 4 });
  assert.ok(wide.scan.real.radiusUm.some(x => !Number.isFinite(x)));
  assert.ok(wide.scan.real.radiusLimitUm > 0 && wide.scan.ideal.radiusUm.every(Number.isFinite));
});

test('a wide fiber mode’s narrow far field is integrated finely', () => {
  // The ideal lens at F′ (s = aρ, J = a², W = 0), its overlap integrated
  // directly on 2¹⁸ intervals.
  const direct = (v, f, mfdUm, n = 1 << 18) => {
    const { epd, beamRatio } = beamPupil(v), a = epd / 2 / f, theta = v.wavelengthNm * 1e-6 / (Math.PI * mfdUm / 2000);
    let overlap = 0, power = 0;
    for (let i = 0; i <= n; i++) {
      const rho = i / n, wt = (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) / (3 * n), A = Math.exp(-((rho / beamRatio) ** 2)), s = a * rho;
      overlap += wt * A * a / Math.sqrt(Math.sqrt(1 - s * s)) * Math.exp(-((s / theta) ** 2)) * rho;
      power += wt * A * A * rho;
    }
    return 2 * Math.PI * overlap * overlap / (power * modeNorm(theta));
  };
  // A 200 µm mode: its far field spans 2 % of the pupil radius at 1550 nm,
  // 0.4 % at 350 nm, where the fiber panel traces the rays 4096 times.
  for (const [nm, samples] of [[1550, 1024], [350, 4096]]) {
    const r = run({ wavelengthNm: nm }), f = fiber(r, { mfdUm: 200 });
    assert.equal(f.samples, samples, `${nm} nm`);
    close(f.ideal.aligned, direct(r.values, r.lens.efl, 200), 1e-4, `${nm} nm`);
  }
});

test('a wide mode’s axial response is integrated over the pupil it weights', () => {
  // A 200 µm mode at 350 nm takes only the central 1.3 % of the pupil
  // radius: there the defocus is resolved far from the focus. The ideal
  // lens's overlap (s = aρ, J = a², W = Δz(1 − cos θ)/λ), integrated
  // directly on 2¹⁸ intervals, at 25 and 100 mm.
  const r = run({ lensKind: 'ideal', wavelengthNm: 350 }), f = fiber(r, { mfdUm: 200 }), m = f.ideal.model;
  const v = r.values, { epd, beamRatio } = beamPupil(v), a = epd / 2 / r.lens.efl, lambda = 350e-6, theta = lambda / (Math.PI * 0.1);
  const direct = dz => {
    const n = 1 << 18;
    let re = 0, im = 0, power = 0;
    for (let i = 0; i <= n; i++) {
      const rho = i / n, wt = (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) / (3 * n), A = Math.exp(-((rho / beamRatio) ** 2)), s = a * rho, c = Math.sqrt(1 - s * s);
      const amp = wt * A * a / Math.sqrt(c) * Math.exp(-((s / theta) ** 2)) * rho, ph = -2 * Math.PI * dz * (1 - c) / lambda;
      re += amp * Math.cos(ph); im += amp * Math.sin(ph); power += wt * A * A * rho;
    }
    return 2 * Math.PI * (re * re + im * im) / (power * modeNorm(theta));
  };
  for (const dz of [25, 100]) close(m.coupling(m.plane(dz), 0.1, 0, 0, true), direct(dz), 1e-4, `${dz} mm`);
  // The axial scan has no gaps; where it cannot reach, it stops and says so.
  assert.ok(f.scans.ideal.axial.every(Number.isFinite));
  assert.ok(f.axialCut && f.axialCut.reachMm > 100 && f.scans.axialUm.at(-1) <= f.axialCut.reachMm * 1e3 + 1e-9);
  assert.equal(fiber(run({}), {}).axialCut, null, 'the example is not cut');
});

test('uncoated losses only where fused silica is fitted', () => {
  const far = run({ lensKind: 'ideal', wavelengthNm: 10000, focalMm: 5 });
  assert.ok(fiber(far, { mfdUm: 100 }).ok, 'coated: no material needed');
  assert.deepEqual(fiber(far, { mfdUm: 100, fresnel: true }).errors.map(e => e.id), ['fresnel']);
});

test('a focus behind the back face is not shown as one in air', () => {
  // f stays positive, but F′ lies 9 mm before the back vertex, in the glass.
  const thick = run(plano(5.5, 30));
  assert.ok(thick.ok && thick.efl > 0 && thick.bfl < 0);
  assert.ok(!thick.scan && !thick.ideal && /inside the glass/.test(thick.beamIssue));
});

test('the beam figure: rays through the singlet, or bent at the ideal lens', () => {
  const r = run({}), g = beamDiagram(r);
  assert.ok(g.outline && g.rays.length === 6 && !g.ideal);
  // Each traced ray enters the curved face at its height and crosses the
  // axis before F′ (spherical aberration).
  for (const ray of g.rays) {
    const [[, y0], [zIn, yIn], [zOut, yOut], [zEnd, yEnd]] = ray;
    assert.equal(y0, yIn);
    close(zIn, r.values.r1Mm - Math.sqrt(r.values.r1Mm ** 2 - yIn ** 2), 1e-12);
    const zCross = zOut - yOut * (zEnd - zOut) / (yEnd - yOut);
    assert.ok(zCross < g.marks.F2 && zCross > r.values.thicknessMm, `crosses at ${zCross}`);
  }
  const ideal = beamDiagram(run({ lensKind: 'ideal' }));
  assert.ok(ideal.ideal && !ideal.outline);
  for (const ray of ideal.rays) close(ray[2][1] * 11 / (11 - ideal.z[1]), ray[1][1], 1e-12, 'through F′');
});

test('the lens opens in the canvas', () => {
  const r = lensOnly({});
  const scene = canvasScene(r.values, r.lens);
  assert.ok(scene.ok);
  const lens = scene.scene.elements.find(e => e.type === 'thicklens');
  assert.deepEqual([lens.params.r1, lens.params.r2, lens.params.thickness, lens.params.dia, lens.params.glass], [5.50717, 0, 1.88885, 6, 'nbk7']);
  assert.equal(scene.note, '');
  const ideal = lensOnly({ lensKind: 'ideal' });
  assert.deepEqual(canvasScene(ideal.values, ideal.lens).scene.elements[1].params, { f: 11, dia: 6, transEff: 100 });
  const thinPlano = lensOnly(plano(5.5, 0.2));
  assert.equal(canvasScene(thinPlano.values, thinPlano.lens).ok, false);
  // The canvas laser is 1 to 60 mm wide: a beam outside is drawn at the
  // nearest width, and the note says so.
  for (const [d, drawn] of [[0.5, 1], [100, 60]]) {
    const s = canvasScene({ ...r.values, beamDiameterMm: d, diameterMm: 200 }, r.lens);
    assert.equal(s.scene.elements.find(e => e.type === 'cwlaser').params.beamWidth, drawn);
    assert.match(s.note, new RegExp(`drawn ${drawn} mm wide, not ${d} mm`));
  }
});

test('the fiber panel: modes, losses and scans', () => {
  // From the indices: NA = √(n_core² − n_clad²), and then the same mode as
  // the core diameter and that NA.
  const byIndex = fiber(run({}), { fiberMode: 'index', coreIndex: 1.4508, claddingIndex: 1.444, coreRadiusUm: 4.1 });
  close(byIndex.mode.na, Math.sqrt(1.4508 ** 2 - 1.444 ** 2), 1e-15);
  const byNa = fiber(run({}), { fiberMode: 'step', coreDiameterUm: 8.2, na: byIndex.mode.na });
  close(byIndex.values.mfdUm, byNa.values.mfdUm, 1e-15);
  close(byIndex.real.aligned, byNa.real.aligned, 1e-15);
  // An ideal lens reflects nowhere: uncoated, only the fiber end loses.
  const ideal = run({ lensKind: 'ideal' });
  close(fiber(ideal, { fresnel: true }).through, ideal.clipShare * (1 - ((materialIndex('silica', 1550) - 1) / (materialIndex('silica', 1550) + 1)) ** 2), 1e-15);
  // The default core and NA guide LP₁₁ too at 1310 nm (V = 2.75).
  const at1310 = fiber(run({ wavelengthNm: 1310 }), { fiberMode: 'step' });
  assert.equal(at1310.mode.singleMode, false);
  assert.ok(Math.abs(at1310.mode.vNumber - 2.753) < 1e-3);
  assert.equal(fiber(run({}), { fiberMode: 'step' }).mode.singleMode, true);
  // Uncoated: two lens faces and a silica fiber end at normal incidence.
  const r = run({}), plain = fiber(r), lossy = fiber(r, { fresnel: true });
  const R = n => ((n - 1) / (n + 1)) ** 2, ns = materialIndex('silica', 1550);
  close(lossy.through, r.clipShare * (1 - R(r.n)) ** 2 * (1 - R(ns)), 1e-12);
  close(fresnelTransmission(r.n, 1550), (1 - R(r.n)) ** 2 * (1 - R(ns)), 1e-15);
  close(lossy.real.efficiency, lossy.real.aligned * lossy.through, 1e-15);
  // The lateral and angular scans start at the best position's value and
  // fall from it; the axial scan peaks within a step of it.
  for (const kind of ['real', 'ideal']) {
    const s = plain.scans[kind], best = plain[kind].aligned;
    close(s.lateral[0], best, 1e-12); close(s.tilt[0], best, 1e-12);
    for (const axis of ['lateral', 'tilt', 'axial']) assert.ok(s[axis].every(v => v <= best + 1e-9), `${kind} ${axis}`);
    assert.ok(Math.max(...s.axial) > 0.99 * best, `${kind} axial peak`);
    // The halving offsets lie where the scans cross half the best.
    assert.ok(plain[kind].halfLateralUm > 0 && plain[kind].halfTiltMrad > 0);
    close(plain[kind].model.coupling(plain[kind].plane, 5.2e-3, plain[kind].halfLateralUm * 1e-3, 0), best / 2, 2e-2, 'half lateral');
  }
  // The angular scan stays inside the mode model's 0.3 rad.
  assert.ok(plain.scans.tiltMrad.at(-1) <= 300);
});

// The numbers the page text quotes, recomputed. A change to the engine that
// moves one of them fails here, so the text is updated with it.
test('the numbers quoted on the thin and thick lens page are the engine’s', () => {
  const text = JSON.stringify(thickLensCalculators);
  const says = fragment => assert.ok(text.includes(fragment), `the text no longer says “${fragment}”`);
  const sigf = (x, d) => String(Number(Number(x).toPrecision(d)));
  const fixed = (x, d) => Number(x).toFixed(d);
  // Lengths in µm, to 0.1 µm as the page rounds them.
  const um = x => String(Math.round(x * 10) / 10);

  const d = run({});
  says(`for f = 11 mm at 1550 nm, where n = ${fixed(d.n, 5)}`);
  says(`But H′ lies ${fixed(-d.h2Mm, 3)} mm inside the glass`);
  says(`only ${fixed(d.bfl, 3)} mm behind the flat back`);
  const bx = lensOnly(radii(20, 20, 5, { wavelengthNm: 587.6, diameterMm: 12 }));
  says(`${fixed(bx.lens.thinFocalMm, 2)} mm by the thin formula, ${fixed(bx.efl, 2)} mm by the thick one, with H and H′ ${fixed(bx.h1Mm, 3)} mm inside each face and a back focal length of ${fixed(bx.bfl, 2)} mm`);
  says(`so R = (n − 1)f, ${fixed(d.values.r1Mm, 3)} mm for the example, and t = ${fixed(d.values.thicknessMm, 3)} mm with a 1 mm edge`);
  const equi = lensOnly({ lensKind: 'biconvex' }), best = lensOnly({ lensKind: 'biconvex', shape: 'best' });
  says(`the same f takes R = ±${sigf(equi.values.r1Mm, 3)} mm and t = ${fixed(equi.values.thicknessMm, 3)} mm`);
  says(`the best form has R₁ = ${fixed(best.values.r1Mm, 3)} mm and R₂ = −${sigf(-best.values.r2Mm, 4)} mm, ${fixed(best.values.thicknessMm, 3)} mm thick`);
  const at = nm => lensData({ ...d.values, wavelengthNm: nm }).efl;
  says(`f = ${fixed(at(486.1), 2)} mm at 486.1 nm (the F line) and ${fixed(at(656.3), 2)} mm at 656.3 nm (the C line); at 1300 nm it is ${fixed(at(1300), 2)} mm, at 1550 nm ${fixed(at(1550), 2)} mm`);
  says(`to a ${um(d.ideal.waistUm)} µm waist, ${fixed(d.ideal.fromV2Mm, 3)} mm after the back vertex, with a Rayleigh range of ${um(d.ideal.rayleighMm * 1e3)} µm, converging at ${sigf(d.ideal.halfAngleMrad, 4)} mrad: a focusing NA of ${sigf(d.focusNa, 3)}`);
  const s = d.scan.real;
  says(`the singlet reaches only ${sigf(s.paraxialStrehl, 2)} at its paraxial focus F′. Its brightest plane lies ${um(-s.bestShiftMm * 1e3)} µm closer to the lens, where the Strehl ratio is ${sigf(s.strehl, 3)} and the spot radius ${um(s.bestRadiusUm)} µm, against ${um(d.scan.ideal.bestRadiusUm)} µm for the ideal lens`);
  const flip = run({ orientation: 'plano' });
  says(`the best Strehl ratio falls to ${sigf(flip.scan.real.strehl, 3)}, ${um(-flip.scan.real.bestShiftMm * 1e3)} µm before F′`);
  const equiRun = run({ lensKind: 'biconvex' }), bestRun = run({ lensKind: 'biconvex', shape: 'best' });
  says(`an equi-convex lens reaches ${sigf(equiRun.scan.real.strehl, 3)} and the best form ${sigf(bestRun.scan.real.strehl, 3)}`);
  const narrow = run({ beamDiameterMm: 1 });
  says(`With a 1 mm beam the plano-convex singlet is nearly perfect (${sigf(narrow.scan.real.strehl, 3)})`);
  // Fiber coupling moved to the Free space to fiber coupling page, whose
  // text test/calculator-beams.test.js checks; this page only points there.
  says('Free space to fiber coupling</a> calculator, which traces these singlets');
});

// The summary is shown and indexed as plain text (escaped), so it carries no markup.
test('every calculator summary is plain text', async () => {
  const { calculators } = await import('../tools/calculators-content.mjs');
  for (const calc of calculators) assert.ok(!/[<>]/.test(calc.summary ?? ''), `${calc.slug}: markup in its summary`);
});
