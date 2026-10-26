// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The lens designer's engine (calculators/lens-design/engine/). The Python
// reference cases live in validation/reference/lens_design.py and run from
// validation.test.js; these are the second check against Optiland, the
// spec's validation cases for real rays and third-order theory, and the
// boundaries: failing rays, malformed prescriptions, non-finite numbers.
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
