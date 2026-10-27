// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Lens designer, phase 3: imaging in coherent and incoherent light, and
// coupling into a single-mode fiber. The Python reference
// (validation/reference/lens_coherent.py) checks the numbers against an
// independent quadrature; these tests check the specification's cases, the
// app's internal consistency and every number the page text quotes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeImaging, prepareImaging, twoPointAt, RAYLEIGH } from '../calculators/lens-design/engine/imaging.js';
import { analyzeCoupling, modeNorm, fresnelTransmission, MODE_LIMIT } from '../calculators/lens-design/engine/coupling.js';
import { analyzeDiffraction } from '../calculators/lens-design/engine/diffraction.js';
import { normalizeSystem, systemToJSON, systemFromJSON, defaultImaging, defaultCoupling } from '../calculators/lens-design/engine/system.js';
import { mediumIndices } from '../calculators/lens-design/engine/paraxial.js';
import { presetSystem } from '../calculators/lens-design/engine/presets.js';
import { computeFiberCoupling, FIBER_DEFAULTS } from '../calculators/fiber-coupling/fiber-coupling.js';

const LAMBDA = 587.5618;
const perfect = (diffraction = {}, extra = {}) => ({
  surfaces: [{ type: 'paraxial', focal: 100, thickness: 100, stop: true }],
  aperture: { type: 'epd', value: 10 }, wavelengthsNm: [LAMBDA], primaryWavelength: 0,
  image: { focus: 'paraxial' }, diffraction: { grid: 64, padding: 2, ...diffraction }, ...extra,
});
const image = (system, imaging, options) => analyzeImaging({ ...system, imaging: { ...defaultImaging(), ...imaging } }, options);
const couple = (system, coupling, options) => analyzeCoupling({ ...system, coupling: { ...defaultCoupling(), ...coupling } }, options);
const near = (a, b, tol, label = '') => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b} (tolerance ${tol})`);

test('Imaging: a grating passes only below NA/λ in coherent light and below 2 NA/λ in incoherent light', () => {
  // N = 64: frequencies are rounded to k/64 of the incoherent cutoff.
  const at = f => image(perfect(), { target: 'grating', frequency: f }).readout.modulation;
  assert.ok(at(31 / 64).coherent > 0.99, 'coherent, just below NA/λ');
  near(at(33 / 64).coherent, 0, 1e-12, 'coherent, just above NA/λ');
  assert.ok(at(33 / 64).incoherent > 0.3, 'incoherent at the same frequency');
  assert.ok(at(63 / 64).incoherent > 0 && at(63 / 64).incoherent < 0.01, 'incoherent, just below 2 NA/λ');
  // Above the coherent cutoff the coherent image is the zero order alone:
  // a flat field of intensity (1/2)² everywhere.
  const flat = image(perfect(), { target: 'grating', frequency: 0.7 });
  for (const v of flat.coherent) near(v, 0.25, 1e-12, 'flat coherent field');
});

test('Imaging: an incoherent grating’s modulation is 4/π times the MTF of the MTF tab, for an aberrated lens too', () => {
  // The Cooke triplet on axis at 550 nm, a grating along x at 0.4 of the
  // cutoff (its third harmonic is beyond the cutoff): the image is
  // 1/2 + (2/π)|OTF| cos(…), so its modulation is (4/π)|OTF(ν)|.
  const cooke = { ...presetSystem('cooke'), wavelengthsNm: [550], primaryWavelength: 0 };
  const r = image(cooke, { target: 'grating', frequency: 0.4, axis: 'x' });
  const d = analyzeDiffraction(cooke, { throughFocus: false });
  const w = d.perWavelength[0], k = r.geometry.frequency / d.frequencies[1], i = Math.floor(k), t = k - i;
  const mtf = w.mtf.sag[i] * (1 - t) + w.mtf.sag[i + 1] * t;
  near(r.readout.modulation.incoherent, 4 / Math.PI * mtf, 3e-3, 'modulation vs MTF');
});

test('Imaging: the transform’s images equal the point-by-point pupil sum', () => {
  for (const [system, field] of [[perfect(), 0], [presetSystem('cooke'), 1]]) {
    const sys = normalizeSystem({ ...system, imaging: { target: 'points', separation: 1.3, phaseDeg: 70, axis: 'y' } });
    const r = analyzeImaging(sys, { field });
    const prep = prepareImaging(sys, { field });
    const n = 2 * r.window + 1, h = r.window;
    for (const [i, j] of [[h, h], [h + 2, h - 1], [h - 3, h + 4], [h + 1, h + 1]]) {
      const v = twoPointAt(prep, r.points, 70 * Math.PI / 180, (j - h) * r.spacing, (i - h) * r.spacing);
      near(r.incoherent[i * n + j], v.incoherent, 1e-6, 'incoherent');
      near(r.coherent[i * n + j], v.coherent, 1e-6, 'coherent');
    }
  }
});

test('Imaging: two points through a perfect lens at the Rayleigh distance', () => {
  const r = image(perfect(), { target: 'points' });
  near(r.geometry.separation, RAYLEIGH * LAMBDA * 1e-6 / r.na.x, 1e-15, 'separation');
  // Closed forms 0.7346 and 1.4692 (Airy amplitude 0.6061 from each point);
  // the 64-sample pupil grid adds about 2e-3.
  near(r.readout.midpoint.incoherent, 0.7346, 3e-3, 'incoherent midpoint');
  near(r.readout.peak.incoherent, 1, 2e-3, 'incoherent peak');
  near(r.readout.midpoint.coherent, 1.4692, 6e-3, 'coherent in phase');
  near(image(perfect(), { target: 'points', phaseDeg: 180 }).readout.midpoint.coherent, 0, 1e-12, 'coherent in antiphase');
});

test('Imaging: refusals and guards', () => {
  const coarse = perfect({ grid: 32 });
  assert.equal(image(coarse, { target: 'bars', frequency: 0.02 }).ok, false, 'bars too large for the field');
  assert.equal(image(coarse, { target: 'grating', frequency: 0.02 }).ok, false, 'fewer than two periods');
  assert.equal(image(coarse, { target: 'points', separation: 20 }).ok, false, 'points too far apart');
  // A heavily aberrated field spills light round the periodic field.
  const r = image({ ...presetSystem('cooke'), diffraction: { grid: 32, padding: 2 } }, { target: 'star' }, { field: 2 });
  assert.ok(r.ok);
  for (const result of [r, image(perfect(), { target: 'star' }), image(perfect(), { target: 'bars' })]) {
    for (const v of [...result.incoherent, ...result.coherent, ...result.profile.incoherent, ...result.profile.coherent]) assert.ok(Number.isFinite(v));
  }
});

test('Coupling: perfect lens, matched Gaussian beam: η → 1, and the closed-form misalignments', () => {
  const beta = 0.4, wIn = beta * 5, w0 = LAMBDA * 1e-6 * 100 / (Math.PI * wIn), zR = Math.PI * w0 * w0 / (LAMBDA * 1e-6);
  const sys = perfect({ grid: 128, illumination: 'gaussian', beamRatio: beta });
  const mfdUm = 2e3 * w0;
  const eta = c => couple(sys, { mfdUm, ...c }, { scans: false }).eta;
  near(eta({}), 1, 1e-5, 'matched');
  near(eta({ offsetYUm: 1 }), Math.exp(-((1e-3 / w0) ** 2)), 1e-5, 'lateral exp(−d²/w0²)');
  near(eta({ axialUm: 1e3 * zR }), 0.8, 3e-5, 'axial 1/(1 + 1/4)');
  near(eta({ tiltXMrad: 1e3 * wIn / 100 / 2 }), Math.exp(-0.25), 1e-5, 'tilt exp(−t²/θ0²)');
});

test('Coupling: a perfect lens agrees with the Fiber coupling calculator’s closed form, offsets and tilts of both signs', () => {
  const sys = perfect({ grid: 128, illumination: 'gaussian', beamRatio: 0.4 });
  // Each face is placed from its own model's focus. The calculator's beam,
  // by Self's equations, waists f³/(f² + z_R²) = 2.2 µm nearer the lens than
  // the paraxial image, where the pupil-based (Debye) model puts it; that and
  // the paraxial closed form's missing θ₀² terms leave up to 1.2e-3 at 200 µm
  // from focus with the 12 µm mode, and below 5e-4 elsewhere here.
  const args = { ...FIBER_DEFAULTS, wavelengthNm: LAMBDA, beamDiameterMm: 4, focalMm: 100, fiberMode: 'mfd' };
  for (const [mfdUm, d, dz, t] of [[18.7, 3, 0, 0], [12, 0, 200, 0], [18.7, 4, 300, 2], [18.7, 4, 300, -2], [18.7, 4, -300, 2], [25, 2, 150, -1.5]]) {
    const mine = couple(sys, { mfdUm, offsetYUm: d, axialUm: dz, tiltYMrad: t }, { scans: false }).eta;
    const page = computeFiberCoupling({ ...args, mfdUm, lateralOffsetUm: d, axialOffsetUm: dz, tiltMrad: t });
    assert.ok(page.ok, page.errors?.join(' '));
    near(mine, page.efficiency, dz ? 1.5e-3 : 6e-4, `MFD ${mfdUm}, d ${d}, Δz ${dz}, t ${t}`);
  }
});

test('Coupling: a uniform pupil’s best Gaussian mode is the closed form’s 81.45 %', () => {
  const r = couple(perfect({ grid: 128 }), {}, { scans: false });
  near(r.best.eta, 0.81451, 1e-3, 'best η');
  // α = NA/θ0 = 1.121 at the optimum.
  const theta = LAMBDA * 1e-6 / (Math.PI * r.best.mfdUm * 1e-3 / 2);
  near(r.na.x / theta, 1.1209, 2e-3, 'α');
});

test('Coupling: η never exceeds 1, the mode norm is the hemisphere integral, refusals', () => {
  for (const th of [0.01, 0.1, 0.3]) {
    // Simpson on 2π ∫ exp(−2 sin²α/θ²) sin α dα, over the angles that matter.
    const n = 200000, top = Math.min(Math.PI / 2, 14 * th), h = top / n;
    let sum = 0;
    for (let k = 0; k <= n; k++) { const a = k * h, w = k === 0 || k === n ? 1 : k % 2 ? 4 : 2; sum += w * Math.exp(-2 * Math.sin(a) ** 2 / (th * th)) * Math.sin(a); }
    near(modeNorm(th), 2 * Math.PI * sum * h / 3, 1e-7 * modeNorm(th), `θ = ${th}`);
  }
  const cooke = presetSystem('cooke');
  for (const field of [0, 1, 2]) for (const mfdUm of [1.5, 4, 20]) {
    const r = couple(cooke, { mfdUm, offsetXUm: 1, axialUm: -10, tiltYMrad: 5 }, { field, scans: false });
    assert.ok(r.ok && r.eta <= 1 && r.ideal <= 1 && r.best.eta <= 1, `field ${field}, MFD ${mfdUm}`);
  }
  const tiny = couple(perfect(), { mfdUm: 2 * LAMBDA * 1e-3 / (Math.PI * MODE_LIMIT) * 0.9 }, { scans: false });
  assert.equal(tiny.ok, false, 'mode spreading beyond the paraxial limit');
  assert.ok(couple(perfect(), { mfdUm: 2 * LAMBDA * 1e-3 / (Math.PI * MODE_LIMIT) * 1.1 }, { scans: false }).ok);
  // Uncoated surfaces: four air–glass faces of the Cooke triplet's N-SK16 and F2 at 550 nm.
  const sys = normalizeSystem(cooke), n = mediumIndices(sys, 550);
  let T = 1;
  for (let j = 0; j < sys.surfaces.length; j++) T *= 1 - ((n[j] - n[j + 1]) / (n[j] + n[j + 1])) ** 2;
  near(fresnelTransmission(sys, n), T, 1e-15, 'Fresnel product');
  assert.equal(fresnelTransmission(normalizeSystem(perfect()), [1, 1]), 1, 'an ideal lens has no surface');
});

test('Settings: old files read with defaults, new ones round-trip, inputs are clamped', () => {
  const old = normalizeSystem(perfect());
  assert.deepEqual(old.imaging, defaultImaging());
  assert.deepEqual(old.coupling, defaultCoupling());
  const set = { ...perfect(), imaging: { target: 'star', axis: 'y', separation: 2, phaseDeg: -90, frequency: 0.3, spokes: 12.4 }, coupling: { mfdUm: 6, offsetXUm: 2, offsetYUm: -1, axialUm: 30, tiltXMrad: 4, tiltYMrad: -3, fresnel: true } };
  const back = systemFromJSON(systemToJSON(set)).system;
  assert.deepEqual(back.imaging, { target: 'star', axis: 'y', separation: 2, phaseDeg: 270, frequency: 0.3, spokes: 12 });
  assert.deepEqual(back.coupling, set.coupling);
  const wild = normalizeSystem({ ...perfect(), imaging: { target: 'cat', separation: 1e9, frequency: -4, spokes: 'x', phaseDeg: Infinity }, coupling: { mfdUm: -3, tiltXMrad: 1e9, offsetYUm: NaN } });
  assert.deepEqual(wild.imaging, { target: 'points', axis: 'x', separation: 20, phaseDeg: 0, frequency: 0.02, spokes: 36 });
  assert.equal(wild.coupling.mfdUm, 0.1);
  assert.equal(wild.coupling.tiltXMrad, 300);
  assert.equal(wild.coupling.offsetYUm, 0);
});

test('Text: every number the page quotes about imaging and coupling', () => {
  const p = presetSystem('perfect');
  const pts = image(p, { target: 'points' });
  assert.equal(pts.rayleigh.x.toFixed(5), '0.00717', 'Rayleigh distance 7.17 µm');
  assert.equal(pts.cutoff.incoherent.x.toFixed(0), '170');
  assert.equal(pts.cutoff.coherent.x.toFixed(0), '85');
  assert.equal(pts.na.x.toFixed(3), '0.050');
  near(pts.readout.dip.incoherent, 0.735, 3e-3, 'about 73.5 %');
  assert.equal((100 * pts.readout.midpoint.coherent).toFixed(0), '147');
  const g4 = image(p, { target: 'grating', frequency: 0.4 }), g6 = image(p, { target: 'grating', frequency: 0.6 });
  assert.equal(g4.geometry.frequency.toFixed(0), '69');
  assert.equal(g4.readout.modulation.coherent.toFixed(2), '1.00');
  assert.equal(g4.readout.modulation.incoherent.toFixed(2), '0.63');
  assert.equal(g6.geometry.frequency.toFixed(0), '101');
  assert.equal(g6.readout.modulation.coherent, 0);
  assert.equal(g6.readout.modulation.incoherent.toFixed(2), '0.37');
  const star = image(p, { target: 'star' });
  assert.equal((star.geometry.cutoffRadius.incoherent.x * 1e3).toFixed(1), '33.7');
  assert.equal((star.geometry.cutoffRadius.coherent.x * 1e3).toFixed(1), '67.4');
  // Coherent edges ring above the clear level.
  const bars = image(p, { target: 'bars', frequency: 0.4 });
  assert.ok(Math.max(...bars.profile.coherent) > 1.05, 'coherent overshoot');
  const cooke = presetSystem('cooke');
  const cBars = image(cooke, { target: 'bars', frequency: 0.3 });
  assert.equal(cBars.nm, 550);
  assert.equal(cBars.readout.contrast.coherent.vertical.toFixed(2), '-0.96');

  const c0 = couple(p, {}, { scans: false });
  assert.equal((100 * c0.best.eta).toFixed(1), '81.4');
  assert.equal(c0.best.mfdUm.toFixed(2), '8.38');
  const g = couple({ ...p, diffraction: { ...normalizeSystem(p).diffraction, illumination: 'gaussian', beamRatio: 0.5 } }, {}, { scans: false });
  assert.equal((100 * g.best.eta).toFixed(2), '99.97');
  assert.equal(g.best.mfdUm.toFixed(1), '15.0');
  const k0 = couple(cooke, { mfdUm: 4 }, { scans: false });
  assert.equal((100 * k0.ideal).toFixed(1), '80.9');
  assert.equal((100 * k0.aligned).toFixed(1), '12.9');
  assert.equal(k0.best.mfdUm.toFixed(2), '2.99');
  assert.equal((100 * k0.best.eta).toFixed(1), '15.3');
  assert.equal((k0.aligned / k0.ideal).toFixed(2), '0.16');
  const d = analyzeDiffraction(cooke, { throughFocus: false });
  assert.equal(d.perWavelength[1].strehl.toFixed(2), '0.30', 'Strehl ratio 0.30 at 550 nm');
  const k14 = couple(cooke, { mfdUm: 4 }, { field: 1, scans: false });
  assert.equal((100 * k14.aligned).toFixed(1), '4.4');
  assert.equal((100 * k14.best.eta).toFixed(1), '12.6');
  assert.equal(k14.best.mfdUm.toFixed(2), '9.98');
  assert.equal((k14.chiefAngle.y * 1e3).toFixed(0), '238');
  assert.equal((k14.modeDivergence * 1e3).toFixed(1), '87.5');
});
