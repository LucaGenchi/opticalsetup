// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The lens designer's engine (calculators/lens-design/engine/). The Python
// reference cases live in validation/reference/lens_design.py and run from
// validation.test.js; these are the second check against Optiland, the
// spec's validation cases for real rays, third-order theory, the wavefront
// and diffraction, and the boundaries: failing rays, malformed
// prescriptions, non-finite numbers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { normalizeSystem, systemToJSON, systemFromJSON, LIMITS } from '../calculators/lens-design/engine/system.js';
import { firstOrder, seidelSums, mediumIndices } from '../calculators/lens-design/engine/paraxial.js';
import { traceModel, traceRay, traceFrom, aim, launch } from '../calculators/lens-design/engine/trace.js';
import { analyzeSystem } from '../calculators/lens-design/engine/analyze.js';
import { pupilGrid, spotStats, bestFocusShift } from '../calculators/lens-design/engine/spot.js';
import { PRESETS, presetSystem } from '../calculators/lens-design/engine/presets.js';
import { materialIndex } from '../calculators/lens-design/engine/materials.js';
import { surfaceTableCardinals, presetRows } from '../sketch/js/lensgroup.js';
import { analyzeDiffraction, pupilSamples, psfFromPupil, mtfFromPsf, intensityAt, refinedPeak, commonFftSize, MIN_ACROSS, ALIAS_WAVES } from '../calculators/lens-design/engine/diffraction.js';
import { traceBundle, referenceSphere, opdWaves } from '../calculators/lens-design/engine/wavefront.js';
import { fitZernike, zernikeBasis, nollToNm } from '../calculators/lens-design/engine/zernike.js';
import { fft2 } from '../calculators/lens-design/engine/fft.js';

const optiland = JSON.parse(readFileSync(new URL('./fixtures/optiland-cooke-triplet.json', import.meta.url), 'utf8'));
const close = (got, want, tol, label = '') => assert.ok(Math.abs(got - want) <= tol, `${label} got ${got}, want ${want} (tolerance ${tol})`);
const rel = (got, want, tol, label = '') => close(got, want, tol * Math.abs(want), label);

const cooke = () => presetSystem('cooke');
// The Optiland comparison: paraxial aiming and no clipping at the stop, as
// Optiland traces these rays (its stop has no aperture of its own here).
const cookeAsOptiland = () => normalizeSystem({ ...cooke(), rayAiming: 'paraxial' });

// ------------------------------------------------- second check: Optiland

test('Cooke triplet: paraxial data agree with Optiland 0.5.5', () => {
  const fo = firstOrder(cooke(), 550);
  const ref = optiland.paraxial;
  rel(fo.efl, ref.f2, 1e-12, 'EFL');
  rel(fo.zEp, ref.EPL, 1e-12, 'entrance pupil position');
  rel(2 * fo.rXp, ref.XPD, 1e-12, 'exit pupil diameter');
  // Optiland measures the exit pupil from the image plane.
  rel(fo.zXp - 42.20778, ref.XPL, 1e-12, 'exit pupil position');
  rel(fo.fnoInfinite, ref.FNO, 1e-12, 'F-number');
  for (const um of ['0.48', '0.55', '0.65']) {
    mediumIndices(cooke(), Number(um) * 1000).forEach((n, i) => close(n, ref.index[um][i], 1e-13, `index ${um} µm surface ${i}`));
  }
});

test('Cooke triplet: 63 real skew rays land where Optiland puts them (paraxial aiming)', () => {
  const sys = cookeAsOptiland();
  const fo = firstOrder(sys, 550);
  for (const r of optiland.rays) {
    const model = traceModel(sys, r.um * 1000, fo);
    const t = traceRay(model, r.Hy * 20, r.Px, r.Py, model.zLast + 42.20778, { clip: false });
    assert.ok(t.ok, JSON.stringify(r));
    close(t.x, r.x, 1e-9, `x of ${JSON.stringify(r)}`);
    close(t.y, r.y, 1e-9, `y of ${JSON.stringify(r)}`);
    close(t.D[1], r.M, 1e-12, 'direction cosine M');
  }
});

test('Cooke triplet: RMS spots on a 64 × 64 grid agree with Optiland', () => {
  const sys = cookeAsOptiland();
  const fo = firstOrder(sys, 550);
  const grid = pupilGrid(64);
  [0, 14, 20].forEach((field, fi) => {
    const ref = optiland.spots[fi];
    const spots = [480, 550, 650].map(nm => {
      const model = traceModel(sys, nm, fo);
      const rays = grid.map(([px, py]) => traceRay(model, field, px, py, model.zLast + 42.20778, { clip: false }));
      assert.ok(rays.every(r => r.ok));
      return { nm, x: rays.map(r => r.x), y: rays.map(r => r.y) };
    });
    const primary = spotStats(spots[1].x, spots[1].y);
    assert.equal(spots[1].x.length, ref.rays);
    // Optiland's definition: each wavelength about the primary centroid.
    close(primary.cx, ref.centroid_primary[0], 1e-9, 'centroid x');
    close(primary.cy, ref.centroid_primary[1], 1e-9, 'centroid y');
    for (const w of spots) {
      const rms = Math.sqrt(w.x.reduce((s, x, i) => s + (x - primary.cx) ** 2 + (w.y[i] - primary.cy) ** 2, 0) / w.x.length);
      rel(rms, ref.rms[String(w.nm / 1000)], 1e-7, `field ${field} ${w.nm} nm`);
    }
  });
});

// --------------------------------------- spec case 3: real trace vs Seidel

// S_I from the real trace alone: the ρ³ coefficient of the meridional
// transverse aberration at the paraxial focus is S_I / (2 n' u').
function realTraceSI(system) {
  const fo = firstOrder(system, system.wavelengthsNm[system.primaryWavelength]);
  const model = traceModel(system, system.wavelengthsNm[system.primaryWavelength], fo);
  const zImage = model.zLast + fo.imageDistance;
  const rhos = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4];
  const rows = rhos.map(r => [r ** 3, r ** 5, r ** 7]);
  const ta = rhos.map(r => traceRay(model, 0, 0, r, zImage).y);
  const ata = [0, 1, 2].map(i => [0, 1, 2].map(j => rows.reduce((s, row) => s + row[i] * row[j], 0)));
  const atb = [0, 1, 2].map(i => rows.reduce((s, row, k) => s + row[i] * ta[k], 0));
  // Cramer's rule for the first unknown.
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const a3 = det(ata.map((row, i) => [atb[i], row[1], row[2]])) / det(ata);
  return 2 * fo.marginal.u.at(-1) * a3;
}

// Welford's thin-lens S_I (shape B, conjugate C = −1 for an object at infinity).
const welford = (n, K, y, B, C) => y ** 4 * K ** 3 / 4 * ((n / (n - 1)) ** 2 + (n + 2) / (n * (n - 1) ** 2) * B * B
  + 4 * (n + 1) / (n * (n - 1)) * B * C + (3 * n + 2) / n * C * C);

test('plano-convex singlet: real-trace spherical aberration matches the Seidel and thin-lens values', () => {
  const n = materialIndex('nbk7', 587.5618);
  for (const [id, B] of [['pcx-curved-first', 1], ['pcx-flat-first', -1]]) {
    const sys = normalizeSystem({ ...presetSystem(id), wavelengthsNm: [587.5618], primaryWavelength: 0 });
    const fo = firstOrder(sys, 587.5618);
    const fitted = realTraceSI(sys);
    rel(seidelSums(sys, fo).total.SI, fitted, 1e-5, `${id}: surface sum vs real trace`);
    // The thin-lens formula ignores the 4 mm thickness, which lowers the
    // marginal height at the second face of the curved-first lens by 1.4 %;
    // the flat-first lens is unaffected, its first face doing nothing on axis.
    const thin = welford(n, (n - 1) / 51.68, 5, B, -1);
    rel(fitted, thin, B > 0 ? 0.01 : 1e-5, `${id}: real trace vs thin-lens formula`);
  }
});

test('conic and A4 terms enter S_I: an aplanatic plano-hyperbolic singlet sums to zero', () => {
  const n = materialIndex('nbk7', 587.5618);
  const sys = normalizeSystem({
    wavelengthsNm: [587.5618], primaryWavelength: 0, aperture: { type: 'epd', value: 40 },
    surfaces: [{ radius: 0, thickness: 5, material: 'nbk7', stop: true }, { radius: -(n - 1) * 100, conic: -n * n, thickness: 100 }],
  });
  const fo = firstOrder(sys, 587.5618);
  close(seidelSums(sys, fo).total.SI, 0, 1e-15, 'S_I');
  const r = analyzeSystem(sys);
  close(r.spots[0].poly.rms, 0, 1e-12, 'RMS spot');
  // The same correction written as an A4 term instead of a conic.
  const c = 1 / sys.surfaces[1].radius;
  const asSphere = normalizeSystem({ ...sys, surfaces: [sys.surfaces[0], { ...sys.surfaces[1], conic: 0, asphere: [-n * n * c ** 3 / 8] }] });
  close(seidelSums(asSphere, firstOrder(asSphere, 587.5618)).total.SI, 0, 1e-15, 'S_I with A4');
});

// ------------------------------------------------------------- the engine

test('perfect lens: a point image at every field, at infinity and at a finite object', () => {
  const r = analyzeSystem(presetSystem('perfect'));
  for (const spot of r.spots) {
    close(spot.poly.rms, 0, 1e-12, `field ${spot.field}`);
    close(spot.chief.y, 100 * Math.tan(spot.field * Math.PI / 180), 1e-9, 'chief height f tan θ');
  }
  close(r.airyRadius, 1.22 * 587.5618e-6 * 10, 1e-15, 'Airy radius 1.22 λ F/#');
  const finite = analyzeSystem({ ...presetSystem('perfect'), object: { atInfinity: false, distanceMm: 300 }, fields: { type: 'height', values: [0, 10] } });
  close(finite.firstOrder.imageDistance, 150, 1e-9, '1/v = 1/f − 1/u');
  close(finite.firstOrder.magnification, -0.5, 1e-12, 'magnification');
  close(finite.spots[1].poly.rms, 0, 1e-12, 'off-axis point image');
  close(finite.spots[1].chief.y, -5, 1e-9, 'image height');
});

test('real ray aiming lands on the stop where paraxial aiming does not', () => {
  const sys = normalizeSystem({ ...cooke(), rayAiming: 'real' });
  const fo = firstOrder(sys, 550);
  const model = traceModel(sys, 550, fo);
  const stopHit = e => traceFrom(model, ...Object.values(launch(model, 20, e[0], e[1])), { until: model.stop + 1, clip: false }).P;
  for (const py of [-1, 0, 0.5]) {
    const real = aim(model, 20, 0.3, py, 'real');
    assert.ok(real.ok);
    const p = stopHit(real.e);
    close(p[0], 0.3 * fo.stopRadius, 1e-9); close(p[1], py * fo.stopRadius, 1e-9, `real aim reaches (0.3, ${py}) on the stop`);
  }
  // Pupil aberration at 20°: the paraxially aimed chief ray crosses the stop
  // 0.23 mm off centre, the lower rim ray 0.58 mm inside the rim.
  assert.ok(Math.abs(stopHit(aim(model, 20, 0, 0, 'paraxial').e)[1]) > 0.1);
  assert.ok(Math.abs(stopHit(aim(model, 20, 0, -1, 'paraxial').e)[1] + fo.stopRadius) > 0.1);
});

test('best RMS focus is the minimum of the summed RMS over fields', () => {
  const sys = presetSystem('pcx-curved-first');
  const best = analyzeSystem({ ...sys, image: { focus: 'best-rms' } });
  const sumSq = offset => analyzeSystem({ ...sys, image: { focus: 'best-rms', offsetMm: offset } }).spots.reduce((s, sp) => s + sp.poly.rms ** 2, 0);
  const at = sumSq(0);
  for (const d of [-0.05, -0.01, 0.01, 0.05]) assert.ok(sumSq(d) > at, `offset ${d} is worse`);
  assert.ok(best.image.bestShift < 0, 'spherical aberration pulls best focus toward the lens');
});

test('bestFocusShift is exact for a ray bundle with a known waist', () => {
  // Rays converging to x = 0 at Δ = 2: positions x_i, slopes −x_i / 2.
  const xs = [-1, -0.5, 0.25, 0.75, 1];
  const shift = bestFocusShift([{ x: xs, y: xs.map(() => 0), sx: xs.map(x => -x / 2), sy: xs.map(() => 0) }]);
  close(shift, 2, 1e-12);
});

test('pupil grid and spot statistics', () => {
  const g = pupilGrid(32);
  assert.ok(g.every(([x, y]) => x * x + y * y <= 1));
  close(g.length / (32 * 32), Math.PI / 4, 0.01, 'fills the circle');
  const s = spotStats([1, -1, 0, 0], [0, 0, 1, -1]);
  close(s.rms, 1, 1e-15); close(s.geo, 1, 1e-15); close(s.cx, 0, 1e-15);
  assert.ok(Number.isNaN(spotStats([], []).rms));
});

test('the cemented achromat agrees with the canvas lens group it comes from', () => {
  // The canvas evaluates 587.6 nm and spaces cemented faces by its tracer's
  // 0.06 mm gap; the designer cements exactly.
  const canvas = surfaceTableCardinals(presetRows('doublet'), 587.6).f;
  const designer = firstOrder(normalizeSystem({ ...presetSystem('achromat'), wavelengthsNm: [587.6], primaryWavelength: 0 }), 587.6).efl;
  rel(designer, canvas, 2e-3, 'EFL');
});

// --------------------------------------------------- failures, boundaries

test('failing rays are reported by kind, never dropped silently', () => {
  const tir = analyzeSystem({
    aperture: { type: 'epd', value: 18 }, wavelengthsNm: [587.5618], primaryWavelength: 0,
    surfaces: [{ radius: 0, thickness: 3, material: 'nsf11', stop: true }, { radius: -10, thickness: 20 }],
  });
  assert.ok(tir.spots[0].perWavelength[0].failed.tir > 0, 'steep glass-to-air face: TIR');
  assert.ok(tir.warnings.some(w => /total internal reflection/.test(w.text)));

  const miss = analyzeSystem({
    aperture: { type: 'epd', value: 14 }, wavelengthsNm: [587.5618], primaryWavelength: 0,
    surfaces: [{ radius: 6, thickness: 4, material: 'nbk7', stop: true }, { radius: 0, thickness: 10 }],
  });
  assert.ok(miss.spots[0].perWavelength[0].failed.miss > 0, 'aperture wider than the sphere: miss');

  const clipped = analyzeSystem({ ...cooke(), surfaces: cooke().surfaces.map((s, i) => (i === 0 ? { ...s, semiDiameter: 6 } : s)) });
  assert.equal(clipped.spots[0].vignetting, 0, 'on axis the beam fits');
  assert.ok(clipped.spots[2].vignetting > 0.05, 'at 20° the clear aperture vignettes');
  assert.ok(clipped.warnings.some(w => w.kind === 'vignetting'));

  const crossing = analyzeSystem({
    aperture: { type: 'epd', value: 32 }, wavelengthsNm: [587.5618], primaryWavelength: 0,
    surfaces: [{ radius: 20, thickness: 1, material: 'nbk7', stop: true }, { radius: -20, thickness: 15 }],
  });
  assert.ok(crossing.spots[0].perWavelength[0].failed.behind > 0, 'faces that cross: the ray would travel backward');
  assert.ok(crossing.warnings.some(w => /negative edge thickness/.test(w.text)));
});

test('impossible systems give a reason instead of numbers', () => {
  const afocal = analyzeSystem({ surfaces: [{ type: 'paraxial', focal: 50, thickness: 150, stop: true }, { type: 'paraxial', focal: 100, thickness: 10 }] });
  assert.equal(afocal.ok, false);
  assert.match(afocal.errors[0], /afocal/);
  const ideal = analyzeSystem({ surfaces: [{ radius: 50, thickness: 4, material: 'nbk7', stop: true }, { type: 'paraxial', focal: 50, thickness: 50 }] });
  assert.equal(ideal.ok, false);
  assert.match(ideal.errors[0], /ideal lens/);
});

test('malformed prescriptions are normalized to finite, bounded values with one stop', () => {
  const sys = normalizeSystem({
    surfaces: [
      { radius: 'abc', thickness: NaN, material: 'unobtainium', stop: true, conic: Infinity, asphere: [1e9, 'x'] },
      { radius: 1e12, thickness: -5, semiDiameter: -1, stop: true, index: 99, material: 'constant' },
    ],
    aperture: { type: 'na', value: 3 },
    fields: { type: 'angle', values: [-95, NaN, 10] },
    wavelengthsNm: [10, 'red', 1e9],
    pupilSamples: 1e6,
    image: { focus: 'sideways', offsetMm: -Infinity },
  });
  assert.equal(sys.surfaces.filter(s => s.stop).length, 1);
  assert.equal(sys.surfaces[0].material, 'air');
  assert.equal(sys.surfaces[0].radius, 0);
  assert.equal(sys.surfaces[0].asphere[0], LIMITS.asphere);
  assert.equal(sys.surfaces[1].thickness, 0);
  assert.equal(sys.surfaces[1].index, 4);
  assert.equal(sys.surfaces[1].radius, LIMITS.radius);
  assert.equal(sys.aperture.type, 'epd', 'NA needs a finite object');
  assert.deepEqual(sys.fields.values, [89, 0, 10]);
  assert.deepEqual(sys.wavelengthsNm, [200, 587.5618, 20000]);
  assert.equal(sys.pupilSamples, LIMITS.pupilSamples[1]);
  assert.equal(sys.image.focus, 'paraxial');
  assert.equal(sys.image.offsetMm, 0, 'a non-finite number falls back to the default');
  assert.equal(normalizeSystem({ image: { offsetMm: -1e9 } }).image.offsetMm, -LIMITS.imageOffset);
  assert.equal(normalizeSystem(null).surfaces.length, 2);
});

test('prescription files round-trip and refuse what they cannot read', () => {
  const text = systemToJSON(cooke());
  assert.deepEqual(systemFromJSON(text).system, cooke());
  assert.match(systemFromJSON('not json').error, /not JSON/);
  assert.match(systemFromJSON('{"surfaces": []}').error, /not an OpticalSetup lens/);
  assert.match(systemFromJSON(JSON.stringify({ ...JSON.parse(text), version: 99 })).error, /version 99/);
});

// Every number the page draws or prints must be finite (Infinity is allowed
// only where it means "at infinity" in the first-order table).
function assertFinite(value, path) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), `${path} = ${value}`);
  else if (Array.isArray(value)) value.forEach((v, i) => assertFinite(v, `${path}[${i}]`));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) assertFinite(v, `${path}.${k}`);
}

test('every preset analyses to finite drawings and spots', () => {
  for (const p of PRESETS) {
    const r = analyzeSystem(presetSystem(p.id));
    assert.ok(r.ok, `${p.id}: ${r.errors}`);
    assertFinite(r.surfaces, `${p.id}.surfaces`);
    assertFinite(r.layoutRays, `${p.id}.layoutRays`);
    assertFinite(r.spots, `${p.id}.spots`);
    assertFinite(r.seidel, `${p.id}.seidel`);
    assert.equal(r.spots.reduce((s, sp) => s + sp.lost, 0), 0, `${p.id} loses no rays`);
  }
});

test('a spherical design opens in the canvas as a Lens group; anything else says why not', async () => {
  const { canvasScene } = await import('../calculators/lens-design/engine/canvas-export.js');
  const { normalizeSurfaceTable } = await import('../sketch/js/lensgroup.js');
  const sys = cooke();
  const out = canvasScene(sys, analyzeSystem(sys));
  assert.ok(out.ok);
  const lens = out.scene.elements.find(e => e.type === 'lensgroup');
  assert.deepEqual(lens.params.rows.map(r => [r.r, r.glass]), sys.surfaces.map(s => [s.radius, s.material]));
  assert.equal(lens.params.rows[3].stop, true, 'the stop, in air after surface 4, carries across');
  // The canvas reads the rows back unchanged. Its one clear diameter for
  // every surface (the largest rim, here the first lens's) thickens the thin
  // flint, which moves f by about 0.4 %: the page says so rather than hiding it.
  const canvasF = surfaceTableCardinals(normalizeSurfaceTable(lens.params.rows), 550, { diameter: lens.params.dia }).f;
  close(out.canvasEfl, canvasF, 1e-12);
  rel(canvasF, firstOrder(sys, 550).efl, 0.01, 'EFL in the canvas');
  assert.match(out.note, /thickening any lens/);
  assert.equal(canvasScene(presetSystem('achromat'), analyzeSystem(presetSystem('achromat'))).ok, true);
  assert.equal(out.scene.elements.find(e => e.type === 'cwlaser').params.wavelength, 550);
  for (const [system, why] of [
    [presetSystem('perfect'), /ideal-lens/],
    [{ ...sys, surfaces: sys.surfaces.map((s, i) => (i ? s : { ...s, conic: -0.5 })) }, /spherical/],
    [{ ...sys, surfaces: sys.surfaces.map((s, i) => (i ? s : { ...s, material: 'constant' })) }, /constant index/],
  ]) {
    const refused = canvasScene(normalizeSystem(system));
    assert.equal(refused.ok, false);
    assert.ok(refused.reasons.some(r => why.test(r)), refused.reasons.join('; '));
  }
});

// Review of #267 (P1): with the entrance pupil beyond the first surface's
// centre of curvature, the numerically stable root lands on the far sheet of
// the sphere; the other root is the real crossing and must be tried.
test('an entrance pupil beyond the first centre of curvature still finds the first surface', () => {
  const sys = normalizeSystem({
    wavelengthsNm: [587.5618], primaryWavelength: 0, aperture: { type: 'epd', value: 10 },
    surfaces: [{ radius: 51.68, thickness: 4, material: 'nbk7' }, { radius: 0, thickness: 40 }, { radius: 0, thickness: 50, stop: true }],
  });
  const fo = firstOrder(sys, 587.5618);
  assert.ok(fo.zEp > 51.68, 'the pupil sits beyond the centre of curvature');
  const model = traceModel(sys, 587.5618, fo);
  const chief = traceRay(model, 0, 0, 0, 100, { path: true });
  assert.ok(chief.ok);
  close(chief.points[1][2], 0, 1e-12, 'the axial ray meets surface 1 at its vertex');
  const r = analyzeSystem(sys);
  assert.equal(r.spots[0].lost, 0);
});

// Review of #267 (P2): the stop clips at its own radius. Paraxially aimed
// rays that the real pupil puts outside it are lost and said to be; real
// aiming fills the stop exactly and loses none.
test('the aperture stop clips at its radius; real aiming fills it exactly', () => {
  const paraxial = analyzeSystem(cookeAsOptiland());
  assert.ok(paraxial.spots[0].perWavelength.every(w => w.failed.stop > 0), 'rim rays pass outside the stop on axis');
  assert.equal(paraxial.spots[0].vignetting, 0, 'losses at the stop are not vignetting by a set aperture');
  assert.ok(paraxial.warnings.some(w => w.kind === 'aiming'));
  const real = analyzeSystem(cooke());
  assert.equal(real.spots.reduce((s, sp) => s + sp.lost, 0), 0);
  assert.ok(!real.warnings.some(w => w.kind === 'aiming'));
  // No ray counted in a spot crossed the stop outside its radius.
  const fo = firstOrder(cooke(), 550);
  const model = traceModel(cooke(), 550, fo);
  for (const [px, py] of pupilGrid(32)) {
    for (const field of [0, 14, 20]) {
      const t = traceRay(model, field, px, py, 60.17675, { path: true });
      assert.ok(t.ok);
      const p = t.points[model.stop + 1];
      assert.ok(Math.hypot(p[0], p[1]) <= fo.stopRadius * (1 + 1e-7));
    }
  }
});

// Review of #267 (follow-up): conic roots seed Newton for an asphere, so they
// are checked against the bare conic. Checking them against the full sag
// threw the seed away; the vertex-plane fallback then fell outside the
// sphere (r = 11 > R = 10) and a ray that does meet the surface was a miss.
test('an asphere keeps its conic seed when the vertex-plane crossing is outside the conic', async () => {
  const { makeSurface, intersect, sag } = await import('../calculators/lens-design/engine/surfaces.js');
  const surf = makeSurface({ radius: 10, conic: 0, asphere: [1e-5] });
  const n = Math.sqrt(26), P = [0, 11, 0], D = [0, -1 / n, 5 / n];
  const hit = intersect(surf, P, D, -Infinity);
  assert.ok(hit.t !== undefined, `got ${JSON.stringify(hit)}`);
  // Independent bisection on z(t) − sag(t) over the near sheet.
  const g = t => P[2] + t * D[2] - sag(surf, (P[1] + t * D[1]) ** 2);
  let lo = 6, hi = 9; // at t < 5.1 the ray is still outside the sphere
  assert.ok(g(lo) < 0 && g(hi) > 0);
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (g(mid) < 0) lo = mid; else hi = mid; }
  close(hit.t, lo, 1e-10, 't');
  close(P[1] + hit.t * D[1], 9.5660366395, 1e-9, 'y (Andrea’s bisection)');
  close(P[2] + hit.t * D[2], 7.1698168024, 1e-9, 'z (Andrea’s bisection)');
  // The same ray without the A4 term still meets the bare sphere.
  assert.ok(intersect(makeSurface({ radius: 10 }), P, D, -Infinity).t !== undefined);
});

// A field whose every ray fails has no spot: its statistics are NaN by
// design (never drawn), the notes say so, and everything that is drawn stays
// finite.
test('a field with no surviving ray is reported, not drawn', () => {
  const sys = normalizeSystem({ ...presetSystem('pcx-curved-first'), surfaces: presetSystem('pcx-curved-first').surfaces.map((s, i) => (i === 1 ? { ...s, semiDiameter: 0.1 } : s)) });
  const r = analyzeSystem(sys);
  assert.ok(r.ok);
  const empty = r.spots.filter(s => !s.poly.count);
  assert.ok(empty.length >= 2, 'the off-axis fields lose every ray');
  for (const s of empty) {
    assert.ok(Number.isNaN(s.poly.rms));
    assert.ok(r.warnings.some(w => w.text.includes(`Field ${Number(s.field).toPrecision(4)}°: no ray reaches the image`)));
  }
  assert.ok(!r.warnings.some(w => /drawn about its centroid/.test(w.text) && empty.some(s => w.text.startsWith(`Field ${Number(s.field).toPrecision(4)}°`))));
  assertFinite(r.layoutRays, 'layoutRays');
  assertFinite(r.surfaces, 'surfaces');
});

test('distortion and lateral colour: zero for a perfect lens, Optiland’s values for the Cooke triplet', () => {
  for (const s of analyzeSystem(presetSystem('perfect')).spots) {
    if (s.field) close(s.distortion, 0, 1e-12, `perfect lens distortion at ${s.field}°`);
    close(s.lateralColour, 0, 1e-15, 'no colour in an ideal lens');
  }
  // Optiland's f-tan distortion: the real chief ray at the image plane
  // against a near-axis chief ray scaled by tan θ, with paraxial aiming.
  const r = analyzeSystem(cookeAsOptiland());
  for (const ref of optiland.distortion) {
    const spot = r.spots.find(s => s.field === ref.Hy * 20);
    close(100 * spot.distortion, ref.percent, 1e-7, `distortion at ${spot.field}°`);
  }
  assert.equal(r.spots[0].distortion, null, 'undefined on axis');
  // Lateral colour is the distance between the extreme wavelengths' centroids.
  const edge = r.spots[2], short = edge.perWavelength[0], long = edge.perWavelength[2];
  close(edge.lateralColour, Math.hypot(short.cx - long.cx, short.cy - long.cy), 1e-15);
  assert.equal(analyzeSystem({ ...cooke(), wavelengthsNm: [550], primaryWavelength: 0 }).spots[2].lateralColour, null, 'one wavelength: none');
});

test('every catalogue glass has a readable short name', async () => {
  const { GLASSES } = await import('../sketch/js/glass.js');
  const { glassShortName } = await import('../calculators/lens-design/engine/materials.js');
  const names = [...GLASSES.values()].map(g => glassShortName(g.label));
  assert.deepEqual(names.slice(0, 3), ['N-BK7', 'Fused silica', 'CaF₂']);
  assert.ok(names.every(n => n && !n.includes('(') && n.length <= 14), names.join(', '));
  assert.equal(new Set(names).size, names.length, 'no two glasses share a name');
});

// ------------------------------------------------ wavefront and diffraction

const wavefrontRef = JSON.parse(readFileSync(new URL('./fixtures/optiland-cooke-wavefront.json', import.meta.url), 'utf8'));
const LAMBDA_D = 587.5618;
// The perfect lens of the presets at one wavelength and one field.
const perfectMono = (extra = {}) => normalizeSystem({
  ...presetSystem('perfect'), wavelengthsNm: [LAMBDA_D], primaryWavelength: 0, fields: { type: 'angle', values: [0] }, ...extra,
});
// The OPD of rays on Optiland's terms: the Cooke triplet with paraxial aiming
// and no apertures, each wavelength referenced to its own chief ray.
function optilandOpd(Hy, um, px, py) {
  const sys = cookeAsOptiland(), fo = firstOrder(sys, 550);
  const model = traceModel(sys, um * 1e3, fo);
  const z = model.zLast + 42.20778, zXp = model.zLast + fo.zXp;
  const own = traceBundle(model, Hy * 20, [0], [0], { clip: false });
  return opdWaves(traceBundle(model, Hy * 20, px, py, { clip: false }), own, z, referenceSphere(own, z, zXp));
}
// Optiland's FFTPSF pupil: n points from -1 to 1 inclusive, centred in a
// G-point FFT grid.
function optilandPupil(n, G) {
  const px = [], py = [], index = [], pad = (G - n) / 2;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = -1 + 2 * j / (n - 1), y = -1 + 2 * i / (n - 1);
    if (x * x + y * y <= 1) { px.push(x); py.push(y); index.push((i + pad) * G + j + pad); }
  }
  return { px, py, index: Int32Array.from(index), M: G };
}

test('Cooke triplet wavefront: OPD, Zernike fits, Strehl ratio and MTF agree with Optiland 0.5.5', () => {
  for (const r of wavefrontRef.opd) close(optilandOpd(r.Hy, r.um, [r.Px], [r.Py])[0], r.opd, 1e-9, `OPD Hy ${r.Hy} ${r.um} µm (${r.Px}, ${r.Py})`);
  for (const z of wavefrontRef.zernike) {
    const g = pupilGrid(z.grid);
    const fit = fitZernike(g.map(p => p[0]), g.map(p => p[1]), Array.from(optilandOpd(z.Hy, z.um, g.map(p => p[0]), g.map(p => p[1]))));
    fit.coefficients.forEach((c, i) => close(c, z.noll[i], 1e-9, `Noll Z${i + 1} at Hy ${z.Hy}`));
  }
  const pupil = optilandPupil(64, 128);
  const unit = new Float64Array(pupil.px.length).fill(1);
  for (const p of wavefrontRef.psf) {
    const psf = psfFromPupil(pupil, unit, optilandOpd(p.Hy, p.um, pupil.px, pupil.py));
    const ideal = psf.sumA ** 2;
    // Optiland's Strehl ratio is the PSF at the chief-ray point.
    close(psf.center / ideal, p.strehl_lossless, 1e-9, `lossless Strehl Hy ${p.Hy} ${p.um} µm`);
    // Optiland weights the pupil by the glasses' internal transmittance,
    // which this page leaves out: 1e-4 covers it.
    close(psf.center / ideal, p.strehl, 1e-4, `Optiland Strehl Hy ${p.Hy} ${p.um} µm`);
    close(psf.peak / ideal, p.peak, 1e-4, `PSF peak Hy ${p.Hy} ${p.um} µm`);
  }
  for (const f of wavefrontRef.mtf.fields) {
    const psf = psfFromPupil(pupil, unit, optilandOpd(f.Hy, 0.55, pupil.px, pupil.py));
    const m = mtfFromPsf(psf.I, 128, 64);
    for (let k = 0; k < 64; k++) {
      close(m.tan[k], f.tangential[k], 1e-4, `tangential MTF Hy ${f.Hy} sample ${k}`);
      close(m.sag[k], f.sagittal[k], 1e-4, `sagittal MTF Hy ${f.Hy} sample ${k}`);
    }
  }
});

test('spec 1: a perfect lens has Strehl 1, its first dark ring at 1.22 λ N_w and the diffraction-limited MTF', () => {
  for (const field of [0, 3, 5]) {
    const r = analyzeDiffraction(perfectMono({ fields: { type: 'angle', values: [field] } }), { throughFocus: false });
    const w = r.perWavelength[0];
    assert.ok(w.wavefront.rms < 1e-9, `flat wavefront at ${field}° (${w.wavefront.rms} waves)`);
    close(w.strehl, 1, 1e-9, `Strehl at ${field}°`);
  }
  const r = analyzeDiffraction(perfectMono({ diffraction: { grid: 128, padding: 4 } }), { throughFocus: false });
  const w = r.perWavelength[0], h = r.window, n = 2 * h + 1;
  // The field changes sign at a dark ring. Around the darkest sample k it
  // flips either just before k or just after; for each choice, fit a
  // quadratic to the five signed amplitudes k−2 … k+2 (least squares): the
  // right choice is smooth, the wrong one has a kink. The ring is where the
  // better quadratic crosses zero.
  const amp = Array.from({ length: h + 1 }, (_, u) => Math.sqrt(w.psf[h * n + h + u]));
  let k = 1;
  while (amp[k + 1] < amp[k]) k++;
  const quadratic = flipAt => {
    const xs = [-2, -1, 0, 1, 2], ys = xs.map(x => (k + x < flipAt ? 1 : -1) * amp[k + x]);
    // Orthogonal on −2…2: 1, x, x² − 2.
    const c0 = ys.reduce((a, y) => a + y, 0) / 5, c1 = xs.reduce((a, x, i) => a + x * ys[i], 0) / 10;
    const c2 = xs.reduce((a, x, i) => a + (x * x - 2) * ys[i], 0) / 14;
    const residual = xs.reduce((a, x, i) => a + (ys[i] - c0 - c1 * x - c2 * (x * x - 2)) ** 2, 0);
    // Root nearest the middle of c2 x² + c1 x + (c0 − 2 c2) = 0.
    const A = c2, B = c1, C = c0 - 2 * c2, disc = Math.sqrt(B * B - 4 * A * C);
    const roots = Math.abs(A) < 1e-15 ? [-C / B] : [(-B - disc) / (2 * A), (-B + disc) / (2 * A)];
    return { residual, root: k + roots.reduce((p, q) => (Math.abs(q) < Math.abs(p) ? q : p)) };
  };
  const [best] = [quadratic(k), quadratic(k + 1)].sort((p, q) => p.residual - q.residual);
  const zero = best.root;
  const nw = 1 / (2 * w.na.x);
  rel(zero * r.spacing, 1.21967 * LAMBDA_D * 1e-6 * nw, 0.01, 'first zero of the Airy pattern');
  rel(w.na.x, 5 / Math.hypot(5, 100), 1e-3, 'NA of the beam');
  let worst = 0;
  r.frequencies.forEach((f, i) => {
    const nu = f / w.cutoff.tangential;
    if (nu >= 1) return;
    const phi = Math.acos(nu), analytic = 2 / Math.PI * (phi - Math.cos(phi) * Math.sin(phi));
    worst = Math.max(worst, Math.abs(w.mtf.tan[i] - analytic), Math.abs(w.mtf.sag[i] - analytic), Math.abs(w.mtfIdeal.tan[i] - analytic));
  });
  assert.ok(worst < 0.01, `MTF within 1 % of the analytic curve (worst ${worst})`);
});

test('the ideal lens is stigmatic at finite conjugates and in a chain', () => {
  const finite = normalizeSystem({
    object: { atInfinity: false, distanceMm: 200 }, wavelengthsNm: [LAMBDA_D], primaryWavelength: 0,
    aperture: { type: 'na', value: 0.05 }, fields: { type: 'height', values: [0, 3, 8] },
    surfaces: [{ type: 'paraxial', focal: 100, thickness: 200, stop: true }],
  });
  const chain = normalizeSystem({
    wavelengthsNm: [LAMBDA_D], primaryWavelength: 0, aperture: { type: 'epd', value: 8 }, fields: { type: 'angle', values: [0, 2] },
    surfaces: [{ type: 'paraxial', focal: 80, thickness: 30, stop: true }, { type: 'paraxial', focal: -60, thickness: 40 }, { type: 'paraxial', focal: 70, thickness: 50 }],
  });
  for (const sys of [finite, chain]) {
    sys.fields.values.forEach((_, field) => {
      const w = analyzeDiffraction(sys, { field, throughFocus: false }).perWavelength[0];
      assert.ok(w.wavefront.rms < 1e-9, `${sys.surfaces.length} ideal lens(es), field ${field}: ${w.wavefront.rms} waves`);
      close(w.strehl, 1, 1e-9);
    });
  }
});

test('spec 2: Strehl ratio against defocus matches sinc²(W020) for a uniform pupil', () => {
  for (const w020 of [0.1, 0.25, 0.5]) {
    const dz = w020 * LAMBDA_D * 1e-6 * 2 / 0.05 ** 2;
    const w = analyzeDiffraction(perfectMono({ image: { focus: 'paraxial', offsetMm: dz }, diffraction: { grid: 128 } }), { throughFocus: false }).perWavelength[0];
    const analytic = (Math.sin(Math.PI * w020) / (Math.PI * w020)) ** 2;
    close(w.strehlAtChief, analytic, 3e-3, `on-axis Strehl at ${w020} waves of defocus`);
    close(w.strehl, w.strehlAtChief, 1e-9, 'the peak stays on axis below half a wave');
    // Noll Z4 = √3 (2ρ² − 1): W020 ρ² carries W020 / (2√3) of it.
    rel(w.wavefront.zernike.coefficients[3], w020 / (2 * Math.sqrt(3)), 0.01, 'defocus coefficient');
  }
});

test('spec 4 and 8: a Gaussian beam focuses to λf/(πw), and the FFT conserves energy', () => {
  for (const ratio of [0.2, 0.3, 0.4]) {
    const r = analyzeDiffraction(perfectMono({ diffraction: { grid: 128, padding: 4, illumination: 'gaussian', beamRatio: ratio } }), { throughFocus: false });
    const w = r.perWavelength[0], h = r.window, n = 2 * h + 1;
    let sum = 0, second = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { sum += w.psf[i * n + j]; second += w.psf[i * n + j] * ((j - h) * r.spacing) ** 2; }
    rel(2 * Math.sqrt(second / sum), LAMBDA_D * 1e-6 * 100 / (Math.PI * ratio * 5), 0.01, `waist for w = ${ratio} pupil radii`);
    close(w.strehl, 1, 1e-9, 'an untruncated Gaussian is its own reference');
  }
  // Truncation by the pupil: a wide beam loses light at the rim.
  const wide = analyzeDiffraction(perfectMono({ diffraction: { illumination: 'gaussian', beamRatio: 2 } }), { throughFocus: false }).perWavelength[0];
  close(wide.transmission, 1, 1e-12, 'every sample of the pupil passes');
  const M = 64, g = pupilSamples(M, 2 / 32);
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const amp = Float64Array.from(g.px, () => random()), opd = Float64Array.from(g.px, () => 5 * random());
  const psf = psfFromPupil(g, amp, opd);
  const total = psf.I.reduce((a, b) => a + b, 0);
  close(total / (M * M) / psf.power, 1, 1e-6, 'Parseval: Σ|PSF| = M² Σ|P|²');
});

test('FFT: matches a direct DFT; refining the peak never lowers it', () => {
  const m = 16, re = new Float64Array(m * m), im = new Float64Array(m * m);
  for (let i = 0; i < m * m; i++) { re[i] = Math.sin(i * 1.3); im[i] = Math.cos(i * 0.7); }
  const src = [Float64Array.from(re), Float64Array.from(im)];
  fft2(re, im, m);
  for (const [u, v] of [[0, 0], [3, 5], [15, 1], [8, 8]]) {
    let a = 0, b = 0;
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
      const ph = -2 * Math.PI * (u * x + v * y) / m, k = y * m + x;
      a += src[0][k] * Math.cos(ph) - src[1][k] * Math.sin(ph);
      b += src[0][k] * Math.sin(ph) + src[1][k] * Math.cos(ph);
    }
    close(re[v * m + u], a, 1e-9); close(im[v * m + u], b, 1e-9);
  }
  assert.throws(() => fft2(new Float64Array(9), new Float64Array(9), 3), /power of two/);
  const g = pupilSamples(64, 2 / 32), amp = new Float64Array(g.px.length).fill(1);
  const opd = Float64Array.from(g.px, (x, k) => 0.8 * x * x + 0.3 * g.py[k] ** 3);
  const psf = psfFromPupil(g, amp, opd);
  close(intensityAt(g, amp, opd, 0, 0), psf.I[0], 1e-6 * psf.peak, 'the pupil sum equals the FFT on a sample');
  assert.ok(refinedPeak(psf.I, 64, psf.peakAt, (u, v) => intensityAt(g, amp, opd, u, v)).value >= psf.peak);
});

test('Zernike: Noll ordering, orthonormal on the disc, and a fit recovers its coefficients', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 22, 37].map(j => Object.values(nollToNm(j))),
    [[0, 0], [1, 1], [1, 1], [2, 0], [2, 2], [2, 2], [3, 1], [3, 1], [3, 3], [3, 3], [4, 0], [6, 0], [8, 0]]);
  const basis = zernikeBasis(15), g = pupilGrid(400);
  for (const [i, j] of [[0, 0], [3, 3], [10, 10], [3, 10], [6, 7], [4, 5]]) {
    const mean = g.reduce((s, [x, y]) => s + basis[i].at(x, y) * basis[j].at(x, y), 0) / g.length;
    close(mean, i === j ? 1 : 0, 3e-3, `<Z${i + 1} Z${j + 1}>`);
  }
  const coef = [0.1, -0.2, 0.05, 0.3, 0, 0.12, -0.07, 0, 0.02, 0, 0.15];
  const pts = pupilGrid(48);
  const w = pts.map(([x, y]) => coef.reduce((s, c, i) => s + c * zernikeBasis(11)[i].at(x, y), 0));
  const fit = fitZernike(pts.map(p => p[0]), pts.map(p => p[1]), w);
  coef.forEach((c, i) => close(fit.coefficients[i], c, 1e-10, `Z${i + 1}`));
  assert.ok(fit.residualRms < 1e-10);
  assert.equal(fitZernike([0], [0], [1]), null, 'too few points');
});

test('the PSF lands on the side the rays do, for an upright and an inverted exit pupil', () => {
  const lines = { wavelengthsNm: [486.1327, LAMBDA_D, 656.2725], primaryWavelength: 1 };
  const plate = normalizeSystem({ ...lines, aperture: { type: 'epd', value: 10 }, fields: { type: 'angle', values: [0, 10] }, diffraction: { grid: 128 },
    surfaces: [{ type: 'paraxial', focal: 100, thickness: 20, stop: true }, { radius: 0, thickness: 20, material: 'f2' }, { radius: 0, thickness: 70 }] });
  // The same, then an ideal relay lens that images the stop upside down.
  const relay = normalizeSystem({ ...plate, fields: { type: 'angle', values: [0, 4] },
    surfaces: [...plate.surfaces.slice(0, 2), { radius: 0, thickness: 280 }, { type: 'paraxial', focal: 100, thickness: 190 }] });
  for (const [sys, inverted] of [[plate, false], [relay, true]]) {
    const geo = analyzeSystem(sys);
    const r = analyzeDiffraction(sys, { field: 1, zImage: geo.image.z, throughFocus: false });
    for (const i of [0, 2]) {
      const w = r.perWavelength[i], spot = geo.spots[1].perWavelength[i];
      assert.equal(w.inverted, inverted);
      const rays = spot.cy - r.image.center[1];
      assert.ok(Math.abs(rays) > geo.airyRadius / 4, 'a lateral colour worth testing');
      assert.equal(Math.sign(w.peakAt.y), Math.sign(rays), `${w.nm} nm: PSF peak ${w.peakAt.y}, ray centroid ${rays}`);
      close(w.peakAt.y, rays, geo.airyRadius, `${w.nm} nm`);
    }
  }
});

test('Strehl ratio: Maréchal for a small aberration; the through-focus peak sits short of the paraxial focus for undercorrected spherical aberration', () => {
  const w = analyzeDiffraction(normalizeSystem({ ...presetSystem('pcx-curved-first'), wavelengthsNm: [LAMBDA_D], primaryWavelength: 0 }), { throughFocus: false }).perWavelength[0];
  close(w.strehl, Math.exp(-((2 * Math.PI * w.wavefront.rmsTilt) ** 2)), 0.01, 'Maréchal approximation');
  const flat = normalizeSystem({ ...presetSystem('pcx-flat-first'), wavelengthsNm: [LAMBDA_D], primaryWavelength: 0, fields: { type: 'angle', values: [0] } });
  const tf = analyzeDiffraction(flat).throughFocus;
  const s = tf.strehl[0], best = s.indexOf(Math.max(...s));
  assert.ok(tf.shifts[best] < 0, `best focus ${tf.shifts[best]} mm before the paraxial focus`);
  assert.ok(Math.max(...s) > s[(s.length - 1) / 2], 'better than at the paraxial focus');
  assert.equal(tf.poly, null, 'one wavelength: no polychromatic curve');
  // A perfect lens peaks at its focus and falls off on both sides; not
  // quite symmetrically, because the reference sphere's radius changes with
  // the plane. The exact path difference integrated in Python
  // (lens_design.defocus_strehl) gives 0.40870 half a wave past focus and
  // 0.40490 half a wave before it: a difference of 0.00380.
  const tf2 = analyzeDiffraction(perfectMono()).throughFocus, p = tf2.strehl[0], mid = (p.length - 1) / 2;
  close(p[mid], 1, 1e-9);
  for (let i = 1; i <= 4; i++) assert.ok(p[mid + i] < p[mid + i - 1] && p[mid - i] < p[mid - i + 1], 'falls off on both sides');
  const half = tf2.shifts.findIndex(z => Math.abs(z - 0.5 * LAMBDA_D * 1e-6 * 2 / 0.05 ** 2) < 1e-9);
  assert.equal(half, mid + 4, 'the grid has a point half a wave past focus');
  close(p[half] - p[2 * mid - half], 0.00380, 5e-4, 'the asymmetry of exact defocus');
});

test('polychromatic PSF: weights, one image grid, and a Strehl ratio that counts lateral colour', () => {
  const sys = presetSystem('cooke');
  const r = analyzeDiffraction(sys, { field: 2, throughFocus: false });
  assert.equal(r.perWavelength.length, 3);
  for (const w of r.perWavelength) assert.equal(w.psf.length, (2 * r.window + 1) ** 2, 'one window for all');
  assert.ok(r.poly.strehl > 0 && r.poly.strehl < Math.max(...r.perWavelength.map(w => w.strehl)));
  // Weighting one wavelength alone gives its own PSF.
  const only = analyzeDiffraction({ ...sys, wavelengthWeights: [0, 1, 0] }, { field: 2, throughFocus: false });
  const mono = only.perWavelength[1];
  close(only.poly.strehl, mono.strehl, 1e-9);
  only.poly.psf.forEach((v, i) => close(v, mono.psf[i], 1e-9));
  // The reference wavelength gets N samples across the pupil; others fewer.
  const across = r.perWavelength.flatMap(w => [w.samplesAcross.x, w.samplesAcross.y]);
  close(Math.max(...across), sys.diffraction.grid, 1e-9);
  assert.ok(Math.min(...across) < sys.diffraction.grid);
});

test('PSF: the Fresnel-number guard uses the longest wavelength and the Gaussian beam radius', () => {
  // f = 100 mm, 4 mm pupil: a²/(λz) is 80 at 500 nm and 20 at 2 µm for
  // the whole pupil; a beam of half the pupil radius gives 20 and 5, below
  // the limit of 10 (the primary wavelength and the whole pupil gave 80).
  const sys = (illumination, wavelengthsNm) => normalizeSystem({ surfaces: [{ type: 'paraxial', focal: 100, thickness: 100, stop: true }], aperture: { type: 'epd', value: 4 }, wavelengthsNm, primaryWavelength: 0, image: { focus: 'paraxial' }, diffraction: { grid: 64, padding: 2, illumination, beamRatio: 0.5 } });
  const flags = r => r.warnings.some(w => w.kind === 'fresnel');
  const uniform = analyzeDiffraction(sys('uniform', [500, 2000]), { throughFocus: false });
  close(uniform.fresnelNumber, 20, 1e-9);
  assert.equal(uniform.fresnelNm, 2000);
  assert.ok(!flags(uniform), 'the whole pupil stays above 10 at 2 µm');
  const beam = analyzeDiffraction(sys('gaussian', [500, 2000]), { throughFocus: false });
  close(beam.fresnelNumber, 5, 1e-9);
  assert.ok(flags(beam), 'the narrow beam at 2 µm is flagged');
  assert.match(beam.warnings.find(w => w.kind === 'fresnel').text, /at 2000 nm.*Gaussian beam/);
  // Boundary: the same beam at 500 nm alone stays above the limit.
  const visible = analyzeDiffraction(sys('gaussian', [500]), { throughFocus: false });
  close(visible.fresnelNumber, 20, 1e-9);
  assert.ok(!flags(visible));
});

test('diffraction validity guards: aliasing, Fresnel number, high NA, a narrow beam, no rays', () => {
  const kinds = r => r.warnings.map(w => w.kind);
  const blurred = analyzeDiffraction(perfectMono({ image: { focus: 'paraxial', offsetMm: 8 }, diffraction: { grid: 32 } }), { throughFocus: false });
  assert.ok(kinds(blurred).includes('aliasing'));
  assert.ok(!kinds(analyzeDiffraction(perfectMono(), { throughFocus: false })).includes('aliasing'));
  // A 50 µm beam into a 1 mm lens: a²/(λz) ≈ 1.
  const micro = analyzeDiffraction(normalizeSystem({ wavelengthsNm: [LAMBDA_D], primaryWavelength: 0, aperture: { type: 'epd', value: 0.05 },
    surfaces: [{ type: 'paraxial', focal: 1, thickness: 1, stop: true }] }), { throughFocus: false });
  assert.ok(kinds(micro).includes('fresnel'));
  assert.ok(micro.fresnelNumber < 10);
  const fast = analyzeDiffraction(normalizeSystem({ wavelengthsNm: [LAMBDA_D], primaryWavelength: 0, aperture: { type: 'epd', value: 160 },
    surfaces: [{ type: 'paraxial', focal: 100, thickness: 100, stop: true }] }), { throughFocus: false });
  assert.ok(kinds(fast).includes('high-na'));
  assert.ok(kinds(analyzeDiffraction(perfectMono({ diffraction: { grid: 32, illumination: 'gaussian', beamRatio: 0.1 } }), { throughFocus: false })).includes('beam'));
  // Every ray clipped: nothing to diffract, said plainly.
  const blocked = normalizeSystem({ ...cooke(), surfaces: cooke().surfaces.map((s, i) => (i === 0 ? { ...s, semiDiameter: 0.01 } : s)) });
  const none = analyzeDiffraction(blocked, { field: 2, throughFocus: false });
  assert.equal(none.ok, false);
  assert.match(none.errors[0], /No ray/);
});

test('diffraction settings: defaults, clamping, weights, and files from before they existed', () => {
  const old = normalizeSystem({ surfaces: [{ radius: 50, thickness: 4, material: 'nbk7', stop: true }, { radius: -50, thickness: 48 }], wavelengthsNm: [500, 600] });
  assert.deepEqual(old.diffraction, { grid: 64, padding: 2, illumination: 'uniform', beamRatio: 1, vignetting: true });
  assert.deepEqual(old.wavelengthWeights, [1, 1]);
  const odd = normalizeSystem({ ...old, diffraction: { grid: 100, padding: 3, illumination: 'laser', beamRatio: 1e9, vignetting: 'no' }, wavelengthWeights: [-1, 'x', 5] });
  assert.deepEqual(odd.diffraction, { grid: 64, padding: 2, illumination: 'uniform', beamRatio: LIMITS.beamRatio[1], vignetting: true });
  assert.deepEqual(odd.wavelengthWeights, [0, 1]);
  assert.deepEqual(normalizeSystem({ ...old, wavelengthWeights: [0, 0] }).wavelengthWeights, [1, 1], 'all zero means equal');
  const set = normalizeSystem({ ...old, diffraction: { grid: 256, padding: 4, illumination: 'gaussian', beamRatio: 0.5, vignetting: false } });
  assert.deepEqual(systemFromJSON(systemToJSON(set)).system, set);
});

test('diffraction outputs stay finite across random prescriptions', () => {
  let seed = 11;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const glasses = ['nbk7', 'f2', 'nsk16', 'air'];
  for (let trial = 0; trial < 25; trial++) {
    const surfaces = Array.from({ length: 2 + Math.floor(random() * 4) }, (_, i) => ({
      radius: random() < 0.2 ? 0 : (random() < 0.5 ? -1 : 1) * (10 + 200 * random()),
      thickness: 1 + 20 * random(), material: glasses[Math.floor(random() * glasses.length)], stop: i === 0,
    }));
    const sys = normalizeSystem({ surfaces, aperture: { type: 'epd', value: 1 + 10 * random() }, fields: { type: 'angle', values: [0, 10 * random()] },
      diffraction: { grid: 32, illumination: random() < 0.5 ? 'uniform' : 'gaussian', beamRatio: 0.3 + random() } });
    for (const field of [0, 1]) {
      const r = analyzeDiffraction(sys, { field });
      if (!r.ok) { assert.ok(r.errors.length); continue; }
      for (const w of r.perWavelength) {
        for (const v of w.psf) assert.ok(Number.isFinite(v));
        for (const v of [...w.mtf.tan, ...w.mtf.sag, w.strehl, w.strehlAtChief, w.peakAt.x, w.peakAt.y]) assert.ok(Number.isFinite(v), `trial ${trial}`);
        assert.ok(w.strehl >= 0 && w.strehl <= 1 + 1e-9);
      }
      // A through-focus plane has a value unless it is flagged aliased.
      const tf = r.throughFocus;
      for (const s of tf.strehl) s.forEach((v, i) => assert.ok(tf.aliased[i] ? Number.isNaN(v) : Number.isFinite(v), `trial ${trial}, plane ${i}`));
    }
  }
});

test('every wavelength keeps enough pupil samples on the common grid, or the analysis says why not', () => {
  const lens = { aperture: { type: 'epd', value: 10 }, surfaces: [{ type: 'paraxial', focal: 100, thickness: 100, stop: true }] };
  // 400 nm and 10.6 µm differ 26-fold: at 32 samples for the longer, the
  // shorter would need an FFT of 2048.
  const wide = analyzeDiffraction(normalizeSystem({ ...lens, wavelengthsNm: [400, 10600], wavelengthWeights: [0, 1], primaryWavelength: 1, diffraction: { grid: 32 } }));
  assert.equal(wide.ok, false);
  assert.match(wide.errors[0], /400 nm to 10600 nm/);
  assert.equal(analyzeDiffraction(normalizeSystem({ ...lens, wavelengthsNm: [10600], primaryWavelength: 0, diffraction: { grid: 32 } })).perWavelength[0].strehl.toFixed(6), '1.000000');
  // 400 to 2000 nm fits: the grid grows so the longer still gets 32 samples
  // across, and a perfect lens stays perfect at both.
  const nir = analyzeDiffraction(normalizeSystem({ ...lens, wavelengthsNm: [400, 2000], primaryWavelength: 0 }));
  assert.equal(nir.ok, true);
  assert.equal(nir.fftSize, 512);
  for (const w of nir.perWavelength) {
    assert.ok(Math.min(w.samplesAcross.x, w.samplesAcross.y) >= MIN_ACROSS - 1e-9, `${w.nm} nm`);
    assert.ok(Math.abs(w.strehl - 1) < 1e-6, `${w.nm} nm: ${w.strehl}`);
    // The frequencies still reach this wavelength's cutoff, where its MTF
    // has fallen to nothing, after passing one half.
    const f = nir.frequencies, cutoff = w.cutoff.tangential;
    assert.ok(f.at(-1) >= cutoff * (1 - 1e-9), `${w.nm} nm: frequencies end at ${f.at(-1)}, cutoff ${cutoff}`);
    const near = f.findIndex(v => v >= 0.98 * cutoff);
    assert.ok(w.mtf.tan[near] < 0.01 && w.mtf.tan.some(v => v < 0.5), `${w.nm} nm`);
  }
  assert.ok(Math.abs(nir.poly.strehl - 1) < 1e-6);
  // Without growth the range is N + 1 frequencies, the last at the cutoff.
  for (const padding of [2, 4]) assert.equal(analyzeDiffraction(perfectMono({ diffraction: { grid: 64, padding } }), { throughFocus: false }).frequencies.length, 65);
  // Through focus reports the samples actually across the pupil at the
  // primary wavelength (400 nm here: 256 on the grown grid, not N = 64).
  const tf = nir.throughFocus, mid = (tf.shifts.length - 1) / 2;
  assert.equal(tf.planeAcross[mid], Math.min(nir.perWavelength[0].samplesAcross.x, nir.perWavelength[0].samplesAcross.y));
  assert.ok(Math.abs(tf.planeAcross[mid] - 256) < 1e-9);
  assert.ok(tf.planeAcross.every(v => v >= MIN_ACROSS * 2000 / 400 - 1e-9));
  assert.equal(commonFftSize(128, 1, 4), 128);
  assert.equal(commonFftSize(64, 1, 4), 128);
  assert.equal(commonFftSize(64, 1, 64), null);
  // A clear aperture behind the lens that passes the chief ray but none of
  // the pupil samples: no PSF, said plainly; with apertures off, a perfect one.
  const cut = { ...lens, wavelengthsNm: [LAMBDA_D], primaryWavelength: 0, surfaces: [{ ...lens.surfaces[0], thickness: 50 }, { radius: 0, thickness: 50, semiDiameter: 0.05 }], diffraction: { grid: 32 } };
  const dark = analyzeDiffraction(normalizeSystem(cut));
  assert.equal(dark.ok, false);
  assert.match(dark.errors[0], /only 0 of the \d+ pupil samples carry light/);
  assert.ok(Math.abs(analyzeDiffraction(normalizeSystem({ ...cut, diffraction: { grid: 32, vignetting: false } })).perWavelength[0].strehl - 1) < 1e-6);
});

test('through focus: the grid refines until the wavefront is sampled, and planes still aliased are flagged', () => {
  // 8 mm past the focus of an F/10 lens: about 17 waves of defocus. At
  // N = 256 the image plane itself is sampled (0.24 waves per sample), so
  // the curve's value at zero shift is the analysis's own Strehl ratio.
  const r = analyzeDiffraction(perfectMono({ image: { focus: 'paraxial', offsetMm: 8 }, diffraction: { grid: 256 } }));
  const tf = r.throughFocus, mid = (tf.shifts.length - 1) / 2;
  assert.ok(!r.warnings.some(w => w.kind === 'aliasing'));
  assert.ok(Math.abs(tf.across[1] - 256) < 1e-9 && Math.abs(tf.planeAcross[mid] - 256) < 1e-9);
  assert.ok(Math.abs(tf.strehl[0][mid] / r.perWavelength[0].strehl - 1) < 1e-9, `${tf.strehl[0][mid]} against ${r.perWavelength[0].strehl}`);
  // The far planes, further from focus still, alias even at 256: flagged,
  // valueless and named in a warning.
  const flagged = [...tf.aliased.keys()].filter(i => tf.aliased[i]);
  assert.ok(flagged.length > 0 && flagged.every(i => tf.shifts[i] > 0 && Number.isNaN(tf.strehl[0][i]) && tf.largestStep[i] > ALIAS_WAVES));
  assert.ok(tf.largestStep.every((v, i) => tf.aliased[i] || v <= ALIAS_WAVES));
  assert.ok(r.warnings.some(w => w.kind === 'focus-aliasing'));
  // The presets' through-focus curves need no flag at any field.
  for (const field of [0, 1, 2]) {
    const c = analyzeDiffraction(normalizeSystem(cooke()), { field });
    assert.ok(!c.warnings.some(w => w.kind === 'focus-aliasing'), `field ${field}`);
    assert.ok(c.throughFocus.aliased.every(v => !v));
  }
});

test('the numbers quoted in “How to read the wavefront, PSF and MTF” are the engine’s', () => {
  const round = (v, d) => Number(v.toFixed(d));
  const at = (freqs, vals, f) => { const k = f / freqs[1], i = Math.floor(k); return vals[i] + (vals[i + 1] - vals[i]) * (k - i); };
  const fifty = (freqs, v) => { for (let i = 1; i < v.length; i++) if (v[i] <= 0.5) return freqs[i - 1] + (freqs[i] - freqs[i - 1]) * (v[i - 1] - 0.5) / (v[i - 1] - v[i]); return NaN; };
  const best = tf => { const s = Array.from(tf.strehl[1]), i = s.indexOf(Math.max(...s)); return { shift: tf.shifts[i], strehl: s[i] }; };

  const curved = analyzeDiffraction(presetSystem('pcx-curved-first'), { field: 0 });
  const c = curved.perWavelength[1];
  assert.equal(c.nm, LAMBDA_D);
  assert.equal(round(c.wavefront.rms, 3), 0.086);
  assert.equal(round(c.strehl, 2), 0.74);
  assert.equal(round(Math.exp(-((2 * Math.PI * c.wavefront.rmsTilt) ** 2)), 2), 0.75);
  assert.equal(round(-best(curved.throughFocus).shift, 2), 0.12);
  assert.equal(round(best(curved.throughFocus).strehl, 2), 0.98);
  assert.equal(round(analyzeDiffraction(presetSystem('pcx-flat-first'), { field: 0, throughFocus: false }).perWavelength[1].strehl, 2), 0.11);

  const cooke = presetSystem('cooke'), geo = analyzeSystem(cooke);
  const axis = analyzeDiffraction(cooke, { field: 0, zImage: geo.image.z }), a = axis.perWavelength[1];
  assert.equal(a.nm, 550);
  assert.equal(round(geo.spots[0].perWavelength[1].rms * 1e3, 1), 4.2);
  assert.equal(round(geo.airyRadius * 1e3, 2), 3.35);
  assert.equal(round(a.strehl, 2), 0.30);
  assert.equal(round(a.wavefront.rms, 2), 0.18);
  assert.equal(round(a.wavefront.pv, 2), 0.64);
  assert.equal(round(best(axis.throughFocus).shift, 2), 0.07);
  assert.equal(round(best(axis.throughFocus).strehl, 2), 0.76);
  assert.equal(Math.round(a.cutoff.tangential), 362);
  assert.equal(round(fifty(axis.frequencies, a.mtf.tan), 1), 51.5);
  const f14 = analyzeDiffraction(cooke, { field: 1, zImage: geo.image.z }), w14 = f14.perWavelength[1];
  assert.equal(round(w14.wavefront.zernike.coefficients[5], 2), 0.65);
  assert.ok(w14.wavefront.zernike.coefficients.every((v, i) => i < 1 || i === 5 || Math.abs(v) < 0.3), 'astigmatism dominates');
  assert.equal(round(-best(f14.throughFocus).shift, 2), 0.16);
  assert.equal(round(-best(analyzeDiffraction(cooke, { field: 2, zImage: geo.image.z }).throughFocus).shift, 2), 0.18);
  assert.equal(round(at(f14.frequencies, w14.mtf.tan, 50), 2), 0.05);
  assert.equal(round(at(f14.frequencies, w14.mtf.sag, 50), 2), 0.12);
  assert.equal(round(at(f14.frequencies, w14.mtfIdeal.tan, 50), 2), 0.81);
});
