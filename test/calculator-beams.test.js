// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAUSSIAN_DEFAULTS, computeGaussianBeam, gaussianBeam, beamAt, thinLensFocus, waistFrom, gaussianScan, widthNames, PARAXIAL_LIMIT_MRAD } from '../calculators/gaussian-beam/gaussian-beam.js';
import { LENS_DEFAULTS as SINGLET_DEFAULTS, FIBER_DEFAULTS as SINGLET_FIBER_DEFAULTS, computeThickLens, computeFiber } from '../calculators/thin-thick-lens/thick-lens.js';
import { FIBER_DEFAULTS, computeFiberCoupling, gaussianCoupling, fiberMode, matchingFocalMm, couplingScan, SINGLE_MODE_V, focusCollimated } from '../calculators/fiber-coupling/fiber-coupling.js';
import { SETUP_INPUTS, LENS_INPUTS, FIBER_INPUTS } from '../calculators/fiber-coupling/fiber-coupling.js';
import { computeFiberSetup, focalRange, focalScan, choosePlanoConvex, planoConvexGlass, planoConvexSuggestion, NEAR_MATCH, STOCK_DIAMETERS_MM } from '../calculators/fiber-coupling/lens-choice.js';
import { beamCalculators } from '../tools/calculators-beam-content.mjs';

const close = (a, b, rel = 1e-12, label = '') => assert.ok(Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1e-300), `${label} ${a} vs ${b}`);
const beam = x => computeGaussianBeam({ ...GAUSSIAN_DEFAULTS, ...x });
const fiber = x => computeFiberCoupling({ ...FIBER_DEFAULTS, ...x });
const focusWaist = (v, f) => focusCollimated(v.beamDiameterMm, v.wavelengthNm, f).beam.waistUm;
const setup = x => computeFiberSetup({ ...FIBER_DEFAULTS, ...x });

test('Gaussian beam: textbook identities', () => {
  const b = gaussianBeam({ waistUm: 300, wavelengthNm: 800 });
  // At z_R the radius is √2 w₀, the curvature radius 2 z_R (its minimum) and the Gouy phase 45°.
  const at = beamAt(b, b.rayleighMm);
  close(at.radiusUm, Math.SQRT2 * 300);
  close(at.curvatureMm, 2 * b.rayleighMm);
  close(at.gouyDeg, 45);
  for (const t of [0.5, 0.9, 1.1, 2]) assert.ok(beamAt(b, t * b.rayleighMm).curvatureMm > at.curvatureMm);
  // Far out, w/z tends to θ; the beam parameter product is λ/π.
  close(beamAt(b, 1e9 * b.rayleighMm).radiusUm * 1e-3 / (1e9 * b.rayleighMm) * 1e3, b.halfDivergenceMrad, 1e-12);
  close(b.bppMmMrad, 800e-6 / Math.PI * 1e3);
  // The waist is flat; every way of giving the beam names the same one.
  assert.equal(beamAt(b, 0).curvatureMm, Infinity);
  for (const [given, value] of [['diameter', 600], ['divergence', 2 * b.halfDivergenceMrad], ['rayleigh', b.rayleighMm]]) close(waistFrom(given, value, 800), 300, 1e-12, given);
  // M² and n: z_R scales as n/M², θ as M²/n.
  const m = gaussianBeam({ waistUm: 300, wavelengthNm: 800, m2: 2, index: 1.5 });
  close(m.rayleighMm, b.rayleighMm * 1.5 / 2);
  close(m.halfDivergenceMrad, b.halfDivergenceMrad * 2 / 1.5);
  // The form's defaults describe one beam, whichever way it is given.
  for (const given of ['waist', 'diameter', 'divergence', 'rayleigh']) close(beam({ given }).waistUm, 500, 2e-3, given);
});

test('thin lens: Self’s equations in their limits', () => {
  const b = gaussianBeam({ waistUm: 50, wavelengthNm: 632.8 });
  // Waist at the front focal plane: out at the back focal plane, magnified f/z_R.
  const ff = thinLensFocus(b, 100, 100);
  close(ff.distanceMm, 100);
  close(ff.magnification, 100 / b.rayleighMm);
  // Far from the lens the Gaussian result tends to the geometric image.
  const far = thinLensFocus(b, 1e5, 100);
  close(far.distanceMm, 1e5 * 100 / (1e5 - 100), 1e-6);
  // Collimated input (z_R ≫ f): the focus is at f and w₀′ = λf/(πw₀).
  const wide = gaussianBeam({ waistUm: 5000, wavelengthNm: 1064 });
  const c = thinLensFocus(wide, 0, 50);
  close(c.distanceMm, 50, 1e-6);
  close(c.beam.waistUm, 1064e-6 * 50 / (Math.PI * 5) * 1e3, 1e-6);
  // The new beam keeps the beam parameter product.
  close(c.beam.bppMmMrad, wide.bppMmMrad);
  // Well inside f (but far from the waist compared with z_R): a virtual
  // waist before the lens. Close to a small waist the waist stays real.
  assert.ok(thinLensFocus(gaussianBeam({ waistUm: 20, wavelengthNm: 632.8 }), 30, 100).distanceMm < 0);
  assert.ok(thinLensFocus(b, 1, 100).distanceMm > 0);
  // A diverging lens: always virtual.
  assert.ok(thinLensFocus(wide, 0, -50).distanceMm < 0);
  // Two lenses' worth of z: the beam after the lens is the focused one.
  const r = beam({ lens: true, waistUm: 1000, focalMm: 100, lensDistanceMm: 0, zMm: 0 });
  close(r.focusDistanceMm, thinLensFocus(r.input, 0, 100).distanceMm);
  const atFocus = beam({ lens: true, waistUm: 1000, focalMm: 100, lensDistanceMm: 0, zMm: r.focusDistanceMm });
  close(atFocus.radiusUm, atFocus.focusWaistUm, 1e-9);
  assert.equal(atFocus.gouyDeg, null, 'no Gouy phase after the lens');
});

test('Gaussian beam: refusals and values withheld', () => {
  const zero = beam({ lens: true, focalMm: 0 });
  assert.equal(zero.ok, false);
  assert.equal(beam({ waistUm: 0.1, wavelengthNm: 10000 }).ok, false, 'a 0.1 µm waist at 10 µm diverges far beyond paraxial');
  assert.equal(beam({ waistUm: -1 }).ok, false);
  assert.equal(beam({ m2: 0.5 }).ok, false);
  const m2 = beam({ m2: 1.3 });
  assert.equal(m2.gouyDeg, null);
  assert.equal(m2.peakIntensityWcm2, null);
  assert.equal(beam({ powerW: 0 }).peakIntensityWcm2, null);
  // The energy check: 2P/(πw²) integrates back to P.
  const r = beam({ waistUm: 100, powerW: 3, zMm: 0 });
  const w = 100e-4, n = 20000, top = 6 * w;
  let total = 0;
  for (let i = 0; i < n; i++) { const rr = (i + 0.5) * top / n; total += r.peakIntensityWcm2 * Math.exp(-2 * rr * rr / (w * w)) * 2 * Math.PI * rr * top / n; }
  close(total, 3, 1e-6);
});

test('Gaussian beam: the graphs stay finite for odd inputs', () => {
  const cases = [{}, { zMm: -1e7 }, { lens: true }, { lens: true, focalMm: -20, lensDistanceMm: 0 }, { lens: true, focalMm: 1e5, lensDistanceMm: 3 },
    { lens: true, lensDistanceMm: 100, focalMm: 100 }, { given: 'divergence', divergenceMrad: 500 }, { given: 'rayleigh', rayleighMm: 1e9 }, { m2: 1000, index: 4 }];
  for (const c of cases) {
    const r = beam(c);
    assert.ok(r.ok, JSON.stringify(c));
    const scan = gaussianScan(r);
    assert.ok(scan.every(p => Number.isFinite(p.zMm) && Number.isFinite(p.radiusUm) && p.radiusUm > 0 && !Number.isNaN(p.curvatureMm)), JSON.stringify(c));
    assert.ok(scan.some(p => p.zMm <= r.values.zMm) && scan.some(p => p.zMm >= r.values.zMm), 'the reading point is on the plot');
  }
});

test('fiber coupling: overlap limits and closed forms', () => {
  const w = 5, lam = 1550, zr = Math.PI * w * w / (lam * 1e-3);
  close(gaussianCoupling({ waistUm: w, modeRadiusUm: w, wavelengthNm: lam }), 1);
  for (const ratio of [0.5, 0.8, 1.25, 3]) close(gaussianCoupling({ waistUm: w * ratio, modeRadiusUm: w, wavelengthNm: lam }), (2 * ratio / (1 + ratio * ratio)) ** 2, 1e-12, `ratio ${ratio}`);
  for (const d of [0.5, 2, 5]) close(gaussianCoupling({ waistUm: w, modeRadiusUm: w, wavelengthNm: lam, lateralOffsetUm: d }), Math.exp(-d * d / (w * w)), 1e-12);
  for (const t of [5, 30, 100]) close(gaussianCoupling({ waistUm: w, modeRadiusUm: w, wavelengthNm: lam, tiltMrad: t }), Math.exp(-((Math.PI * w * t * 1e-3 / (lam * 1e-3)) ** 2)), 1e-12);
  for (const dz of [-80, 10, 200]) close(gaussianCoupling({ waistUm: w, modeRadiusUm: w, wavelengthNm: lam, axialOffsetUm: dz }), 1 / (1 + (dz / (2 * zr)) ** 2), 1e-12);
  // Symmetric in the sign of the focus error, and never above 1.
  close(gaussianCoupling({ waistUm: 4, modeRadiusUm: 5, wavelengthNm: lam, axialOffsetUm: 30, lateralOffsetUm: 1 }),
    gaussianCoupling({ waistUm: 4, modeRadiusUm: 5, wavelengthNm: lam, axialOffsetUm: -30, lateralOffsetUm: 1 }), 1e-12);
  // The matching focal length really matches.
  const f = matchingFocalMm(2, lam, 5.2);
  close(computeFiberCoupling({ ...FIBER_DEFAULTS, focalMm: f }).matchEfficiency, 1, 1e-12);
  assert.equal(matchingFocalMm(0.01, lam, 5.2), null, 'a beam smaller than the mode has no matching lens');
});

test('fiber coupling: the mode, its range and the tolerances', () => {
  const m = fiberMode({ wavelengthNm: 1550, coreDiameterUm: 8.2, na: 0.14 });
  assert.ok(m.singleMode && m.inFit);
  close(m.cutoffNm, 2 * Math.PI * 4.1 * 0.14 / SINGLE_MODE_V * 1e3);
  assert.equal(fiberMode({ wavelengthNm: 1310, coreDiameterUm: 8.2, na: 0.14 }).singleMode, false);
  // Outside the fit's 1.2-3.5: refused, with the reason.
  const low = fiber({ fiberMode: 'step', coreDiameterUm: 2, na: 0.1 });
  assert.equal(low.ok, false);
  assert.match(low.errors[0].message, /outside 1\.2–3\.5/);
  assert.equal(fiber({ fiberMode: 'step', coreDiameterUm: 20, na: 0.2 }).ok, false);
  // Each 1 dB tolerance costs exactly 1 dB from the aligned coupling.
  const r = fiber({});
  for (const [key, value] of [['lateralOffsetUm', r.tolerance.lateralUm], ['axialOffsetUm', r.tolerance.axialUm], ['tiltMrad', r.tolerance.tiltMrad]]) {
    const eta = fiber({ [key]: value }).efficiency;
    close(-10 * Math.log10(eta / r.matchEfficiency), 1, 1e-9, key);
  }
  // Scans: finite, between 0 and 1, and through the current reading.
  const odd = [{}, { lateralOffsetUm: 50, axialOffsetUm: -2000, tiltMrad: 200 }, { lateralOffsetUm: 3, axialOffsetUm: 80, tiltMrad: -40 }, { beamDiameterMm: 0.01 }, { focalMm: 1.2, beamDiameterMm: 0.4 }, { fiberMode: 'step', wavelengthNm: 633, coreDiameterUm: 3.5, na: 0.12 }];
  for (const c of odd) {
    const res = fiber(c);
    assert.ok(res.ok, JSON.stringify(c));
    for (const key of ['focalMm', 'lateralOffsetUm', 'axialOffsetUm', 'tiltMrad']) {
      const scan = couplingScan(res, key);
      assert.ok(scan.every(p => Number.isFinite(p.x) && (p.efficiency === null || (p.efficiency >= 0 && p.efficiency <= 1 + 1e-12))), `${JSON.stringify(c)} ${key}`);
    }
    assert.ok(Object.values(res.tolerance).every(Number.isFinite));
  }
});

// Review of PR #275: the paraxial limit after a lens and on the fiber page,
// widths named for M² > 1, the offset-and-tilt geometry, the fiber face
// before the lens, and a focus the graph must not step over.
test('the paraxial limit holds after a lens and on the fiber page, with nothing non-finite', () => {
  const lensed = beam({ lens: true, waistUm: 500, lensDistanceMm: 0, focalMm: 0.1 });
  assert.equal(lensed.ok, false);
  assert.match(lensed.errors[0].message, /5000 mrad/);
  assert.equal(beam({ lens: true, lensDistanceMm: 0, focalMm: 1e-9 }).ok, false);
  assert.equal(beam({ lens: true, lensDistanceMm: 0, focalMm: -1e-9 }).ok, false);
  const near = beam({ lens: true, waistUm: 1000, lensDistanceMm: 0, focalMm: 15 });
  assert.ok(near.ok && near.lens.output.halfDivergenceMrad < PARAXIAL_LIMIT_MRAD);
  assert.equal(fiber({ focalMm: 0.1 }).ok, false);
  assert.equal(fiber({ focalMm: 0.1, beamDiameterMm: 100 }).ok, false);
  // The focal-length graph has no value where the page would refuse.
  const r = fiber({ beamDiameterMm: 20, focalMm: 40 });
  const scan = couplingScan(r, 'focalMm');
  for (const p of scan) {
    const steep = computeFiberCoupling({ ...FIBER_DEFAULTS, beamDiameterMm: 20, focalMm: p.x });
    assert.equal(p.efficiency === null, !steep.ok, `f = ${p.x}`);
  }
  assert.ok(scan.some(p => p.efficiency === null) && scan.some(p => p.efficiency !== null));
});

test('widths are named 1/e² for TEM₀₀ and second-moment (D4σ) for M² > 1', () => {
  assert.match(widthNames(1).diameter, /1\/e²/);
  for (const m2 of [1.01, 1.3, 20]) {
    const n = widthNames(m2);
    assert.match(n.diameter, /D4σ/);
    assert.match(n.radius, /2σ/);
    assert.doesNotMatch(`${n.radius} ${n.diameter} ${n.kind}`, /1\/e²/);
  }
});

test('fiber coupling: offset on the face, tilt signed in its plane', () => {
  // The reviewer's case, from her Fresnel propagation of the field:
  // w′ = w_m = 5 µm, 100 µm past the focus, 5 µm off. A beam travelling
  // away from the axis (+θ) came from a focus nearer the axis, so it couples
  // better (the Python reference pins the direction by propagation).
  const at = (dz, t) => gaussianCoupling({ waistUm: 5, modeRadiusUm: 5, wavelengthNm: 1550, axialOffsetUm: dz, lateralOffsetUm: 5, tiltMrad: t });
  close(at(100, 30), 0.3603770, 1e-6);
  close(at(100, -30), 0.1962039, 1e-6);
  // The same beam seen from its focus: 100 µm back along a +30 mrad path its
  // centre was 3 µm nearer the axis; at its focus the offset alone counts.
  assert.ok(at(100, 30) > at(100, 0) && at(100, 0) > at(100, -30));
  // Before the focus the curvature turns over and so does the better sign;
  // at the focus the sign does not matter.
  close(at(-100, -30), at(100, 30), 1e-12);
  close(at(0, 30), at(0, -30), 1e-12);
  // The page accepts both signs and its tolerance is symmetric.
  assert.ok(fiber({ tiltMrad: -10 }).ok);
  close(fiber({ tiltMrad: -10 }).efficiency, fiber({ tiltMrad: 10 }).efficiency, 1e-12);
  const scan = couplingScan(fiber({}), 'tiltMrad');
  assert.ok(scan[0].x < 0 && scan.at(-1).x > 0);
});

test('fiber coupling: the face may not sit before the lens, and the focus-error graph stops there', () => {
  const r = fiber({});
  const lensUm = r.focusDistanceMm * 1e3;
  const before = fiber({ axialOffsetUm: -20000 });
  assert.equal(before.ok, false);
  assert.match(before.errors[0].message, /before the lens/);
  assert.equal(fiber({ axialOffsetUm: -Math.ceil(lensUm) }).ok, false);
  assert.ok(fiber({ axialOffsetUm: -Math.floor(lensUm) + 1 }).ok);
  // A long focal length with a large focus error: the scan would reach past
  // the lens, so it is cut at the lens plane.
  const deep = fiber({ focalMm: 1.5, beamDiameterMm: 0.2, axialOffsetUm: 1000 });
  assert.ok(deep.ok);
  const scan = couplingScan(deep, 'axialOffsetUm');
  assert.ok(scan[0].x > -deep.focusDistanceMm * 1e3, `${scan[0].x} vs ${-deep.focusDistanceMm * 1e3}`);
  // Far off the fiber nothing couples, and the loss is said, not drawn as a dash.
  assert.ok(fiber({ lateralOffsetUm: 1000 }).lossDb > 300);
});

test('fiber coupling: a mode too small for the paraxial model is refused, not matched', () => {
  const tiny = fiber({ mfdUm: 0.5 });
  assert.equal(tiny.ok, false);
  assert.match(tiny.errors[0].message, /1974 mrad/);
  // Just inside the limit it is accepted, and its matching lens is accepted too.
  const mfd = 2 * 1550e-3 / (Math.PI * 0.3) * 1.01;
  const edge = fiber({ mfdUm: mfd });
  assert.ok(edge.ok && edge.modeDivergenceMrad < 300);
  assert.ok(fiber({ mfdUm: mfd, focalMm: edge.optimalFocalMm }).ok);
});

test('Gaussian graph: a tight focus is sampled at its waist, and the lens plane splits the curvature', () => {
  const r = beam({ lens: true, waistUm: 1000, lensDistanceMm: 0, focalMm: 15 });
  const scan = gaussianScan(r);
  close(Math.min(...scan.map(p => p.radiusUm)), r.focusWaistUm, 1e-12);
  const gap = scan.findIndex(p => p.gap);
  assert.ok(gap > 0 && scan[gap].zMm === scan[gap - 1].zMm && scan[gap].zMm === r.lens.positionMm);
  close(scan[gap].radiusUm, scan[gap - 1].radiusUm, 1e-12, 'the radius is continuous at the lens');
  close(1 / scan[gap].curvatureMm - 1 / scan[gap - 1].curvatureMm, -1 / r.lens.focalMm, 1e-9, 'the curvature jumps by −1/f');
  assert.ok(scan.every((p, i) => i === 0 || p.zMm >= scan[i - 1].zMm), 'sorted');
  // And for a slow beam with a lens far down the line, both waists are hit.
  const slow = beam({ lens: true, waistUm: 50, wavelengthNm: 632.8, lensDistanceMm: 3000, focalMm: 200, zMm: 3200 });
  const s2 = gaussianScan(slow);
  close(Math.min(...s2.filter(p => p.zMm < slow.lens.positionMm).map(p => p.radiusUm)), 50, 1e-12);
  close(Math.min(...s2.filter(p => p.after).map(p => p.radiusUm)), slow.focusWaistUm, 1e-12);
  // The lens plane is sampled from both sides, however far down the line.
  const g2 = s2.findIndex(p => p.gap);
  assert.ok(g2 > 0 && s2[g2 - 1].zMm === slow.lens.positionMm && !s2[g2 - 1].after && s2[g2].after);
});

// The numbers the page text quotes, recomputed. A change to the engine that
// moves one of them fails here, so the text is updated with it.
test('the numbers quoted on the Gaussian beam and fiber coupling pages are the engine’s', () => {
  const text = JSON.stringify(beamCalculators);
  const says = (fragment) => assert.ok(text.includes(fragment), `the text no longer says “${fragment}”`);
  const fixed = (x, d) => Number(x).toFixed(d);
  const sigf = (x, d) => String(Number(Number(x).toPrecision(d)));

  const d = beam({});
  says(`Rayleigh range is ${sigf(d.rayleighMm, 3)} mm and the half-angle divergence ${sigf(d.halfDivergenceMrad, 3)} mrad`);
  says(`the radius is ${sigf(d.radiusUm / 1000, 3)} mm and the wavefront’s radius of curvature ${sigf(d.curvatureMm / 1000, 3)} m`);
  says(`${sigf(d.waistIntensityWcm2, 3)} W/cm² at the waist and ${sigf(d.peakIntensityWcm2, 3)} W/cm² there`);
  says(`${(100 * (1 - Math.exp(-2))).toFixed(1)} % of the power lies inside it`);
  const m = beam({ m2: 1.5 });
  says(`Rayleigh range of ${sigf(m.rayleighMm, 3)} mm instead of ${sigf(d.rayleighMm, 3)} mm, and diverges at ${sigf(m.halfDivergenceMrad, 3)} mrad`);
  const c1 = beam({ lens: true, waistUm: 1000, focalMm: 100, lensDistanceMm: 0, zMm: 100 });
  says(`gives a ${sigf(c1.focusWaistUm, 3)} µm waist at ${fixed(c1.focusDistanceMm, 2)} mm`);
  const c2 = beam({ lens: true, waistUm: 250, focalMm: 100, lensDistanceMm: 0, zMm: 100 });
  says(`with a 0.25 mm waist (z<sub>R</sub> = ${sigf(c2.rayleighMm, 3)} mm) the same lens focuses at ${sigf(c2.focusDistanceMm, 3)} mm`);
  const ff = beam({ lens: true, wavelengthNm: 632.8, waistUm: 50, focalMm: 100, lensDistanceMm: 100, zMm: 300 });
  says(`a 50 µm HeNe waist becomes ${sigf(ff.focusWaistUm, 3)} µm`);
  const pass = a => (1 - Math.exp(-2 * a * a)) * 100;
  says(`99 % at a = 1.52 w, 99.99 % at a = 2.15 w`);
  assert.ok(pass(1.52) >= 99 && pass(1.51) < 99 && pass(2.15) >= 99.99 && pass(2.14) < 99.99);

  const smf = fiber({ fiberMode: 'step' });
  says(`has V = ${sigf(smf.vNumber, 3)} at 1550 nm, a cutoff at ${sigf(smf.cutoffNm, 4)} nm and a ${sigf(smf.modeFieldDiameterUm, 3)} µm mode by the fit`);
  const f = fiber({});
  says(`that is ${sigf(f.optimalFocalMm, 4)} mm.`);
  says(`the 11 mm lens the second part of the page starts from gives a ${sigf(2 * f.focusWaistUm, 4)} µm spot, and ${sigf(100 * f.matchEfficiency, 3)} %`);
  const set = setup({});
  says(`from ${sigf(set.range.minMm, 4)} to ${sigf(set.range.maxMm, 4)} mm`);
  const pc = set.suggestion;
  says(`a ${pc.diameterMm} mm ${pc.name} lens with a ${sigf(pc.radiusMm, 4)} mm radius, ${sigf(pc.thicknessMm, 4)} mm thick at the centre`);
  says(`Strehl ratio of ${sigf(pc.strehl, 3)}, and with the fiber ${sigf(-pc.shiftMm * 1e3, 3)} µm nearer the lens than F′ it couples ${sigf(100 * pc.efficiency, 3)} %`);
  const flat = computeThickLens({ ...SINGLET_DEFAULTS, lensKind: 'planoconvex', orientation: 'plano', spec: 'focal', glass: pc.glass, focalMm: set.optimalFocalMm, diameterMm: pc.diameterMm, edgeMm: pc.edgeMm, wavelengthNm: 1550, beamDiameterMm: 2 });
  says(`flat side first it would couple ${sigf(100 * computeFiber(flat, { ...SINGLET_FIBER_DEFAULTS, mfdUm: 10.4 }).real.efficiency, 3)} %`);
  const narrow = setup({ beamDiameterMm: 1 });
  says(`a 1 mm beam with f = ${sigf(narrow.optimalFocalMm, 4)} mm reaches the same mode at the same angle and couples ${sigf(100 * narrow.suggestion.efficiency, 3)} %`);
  close(narrow.focus.beam.halfDivergenceMrad, set.focus.beam.halfDivergenceMrad, 1e-3);
  const wide = setup({ wavelengthNm: 1064, mfdUm: 6.2, beamDiameterMm: 5 });
  says(`a 5 mm beam at 1064 nm onto a 6.2 µm mode, f = ${sigf(wide.optimalFocalMm, 4)} mm, couples only ${sigf(100 * wide.suggestion.efficiency, 3)} %`);
  // A slightly longer plano-convex lens couples a little more, as the text says.
  const longer = planoConvexSuggestion({ wavelengthNm: 1550, beamDiameterMm: 2, focalMm: 1.05 * set.optimalFocalMm, mfdUm: 10.4 });
  assert.ok(longer.efficiency > pc.efficiency && longer.efficiency - pc.efficiency < 0.01);
  says('(1 mm per 12.7 mm of diameter, at least 1 mm)');
  const ratio = q => (100 * (2 * q / (1 + q * q)) ** 2).toFixed(1);
  says(`a waist 10 % off still couples ${ratio(1.1)} %, 25 % off ${ratio(1.25)} %, 50 % off ${ratio(1.5)} %`);
  says(`(here ${sigf(f.focusDistanceMm, 6)} mm)`);
  says(`loses 1 dB (${Math.round(100 * (1 - 10 ** -0.1))} % of the light) at a ${sigf(f.tolerance.lateralUm, 3)} µm offset, against ${sigf(f.tolerance.axialUm, 2)} µm of focus error and ${sigf(f.tolerance.tiltMrad, 3)} mrad of tilt`);
  const fresnel = ((1.45 - 1) / (1.45 + 1)) ** 2;
  says(`about ${(100 * fresnel).toFixed(1)} % for uncoated silica, ${(-10 * Math.log10(1 - fresnel)).toFixed(2)} dB`);
});

// The page in two parts: the fiber and laser design the lens; a lens of any
// focal length and its alignment then read the coupling.
test('fiber coupling: the inputs split into the setup and the lens, each once', () => {
  const ids = [...SETUP_INPUTS, ...LENS_INPUTS].map(i => i.id);
  assert.deepEqual([...ids].sort(), FIBER_INPUTS.map(i => i.id).sort());
  assert.deepEqual(LENS_INPUTS.map(i => i.id), ['focalMm', 'lateralOffsetUm', 'axialOffsetUm', 'tiltMrad']);
  // The second part, merged onto the first's raw values, is the old page.
  const s = setup({});
  close(computeFiberCoupling({ ...s.raw, focalMm: s.optimalFocalMm, lateralOffsetUm: 0, axialOffsetUm: 0, tiltMrad: 0 }).matchEfficiency, 1, 1e-12);
  close(2 * s.focus.beam.waistUm, 10.4, 1e-12);
});

test('fiber coupling: the near-match range is where an ideal lens keeps 95 %', () => {
  for (const x of [{}, { wavelengthNm: 633, mfdUm: 4, beamDiameterMm: 1 }, { beamDiameterMm: 0.02, mfdUm: 10 }]) {
    const s = setup(x), v = s.values, eta = f => gaussianCoupling({ waistUm: focusWaist(v, f), modeRadiusUm: s.modeRadiusUm, wavelengthNm: v.wavelengthNm });
    close(eta(s.range.minMm), NEAR_MATCH, 1e-9, 'min');
    assert.ok(eta(0.99 * s.range.minMm) < NEAR_MATCH && eta(1.01 * s.range.minMm) > NEAR_MATCH);
    if (s.range.maxMm === null) {
      // Open above: no lens focuses the beam wide enough to leave the range.
      assert.ok(eta(1e4) >= NEAR_MATCH * (1 - 1e-9));
    } else {
      close(eta(s.range.maxMm), NEAR_MATCH, 1e-9, 'max');
      assert.ok(eta(1.01 * s.range.maxMm) < NEAR_MATCH);
    }
  }
  // A beam 1.1 times the mode: still 95 % with no lens at all, so the range is open above.
  assert.equal(focalRange(0.0114, 1550, 5.2).maxMm, null);
  // The graph peaks at the match, and stays finite or empty.
  const s = setup({}), scan = focalScan(s);
  const best = scan.reduce((a, p) => (p.efficiency > a.efficiency ? p : a));
  assert.ok(Math.abs(best.x / s.optimalFocalMm - 1) < 0.01);
  assert.ok(scan.every(p => p.efficiency === null || (Number.isFinite(p.efficiency) && p.efficiency <= 1 + 1e-12)));
});

test('fiber coupling: with a beam no wider than the mode there is no lens to suggest', () => {
  const s = setup({ beamDiameterMm: 0.01 });
  assert.ok(s.ok);
  assert.equal(s.optimalFocalMm, null);
  assert.equal(s.suggestion, undefined);
  // An invalid fiber is refused before any lens is designed.
  assert.equal(setup({ mfdUm: 0.5 }).ok, false);
  assert.equal(setup({ fiberMode: 'step', coreDiameterUm: 20, na: 0.2 }).ok, false);
});

test('fiber coupling: the plano-convex suggestion, its glass and diameter rules, and its refusals', () => {
  assert.equal(planoConvexGlass(1550), 'nbk7');
  assert.equal(planoConvexGlass(350), 'nbk7');
  assert.equal(planoConvexGlass(2000), 'nbk7');
  assert.equal(planoConvexGlass(349), 'silica');
  assert.equal(planoConvexGlass(2001), 'caf2');
  assert.equal(planoConvexGlass(205), null);
  assert.equal(planoConvexGlass(10600), null);
  // The smallest catalogue diameter at least twice the beam, with R = (n − 1)f above its radius.
  const c = choosePlanoConvex({ wavelengthNm: 1550, beamDiameterMm: 2, focalMm: 10.54 });
  assert.equal(c.diameterMm, 6);
  close(c.radiusMm, (c.n - 1) * 10.54);
  assert.equal(choosePlanoConvex({ wavelengthNm: 1550, beamDiameterMm: 4, focalMm: 100 }).diameterMm, 9);
  assert.equal(choosePlanoConvex({ wavelengthNm: 1550, beamDiameterMm: 20, focalMm: 500 }).edgeMm, 50.8 / 12.7);
  // A curved face too tight for twice the beam falls back to 1.5 times it.
  const tight = choosePlanoConvex({ wavelengthNm: 1550, beamDiameterMm: 4, focalMm: 8 });
  assert.equal(tight.diameterMm, 6);
  assert.ok(tight.diameterMm < 2 * 4 && tight.diameterMm / 2 < tight.radiusMm);
  // Refusals: a face too tight for 1.5 times the beam, a beam wider than any catalogue lens, no glass.
  assert.equal(choosePlanoConvex({ wavelengthNm: 1550, beamDiameterMm: 10, focalMm: 20 }).ok, false);
  assert.match(choosePlanoConvex({ wavelengthNm: 1550, beamDiameterMm: 100, focalMm: 500 }).reason, /4 in/);
  assert.match(choosePlanoConvex({ wavelengthNm: 10600, beamDiameterMm: 2, focalMm: 10 }).reason, /ZnSe/);
  assert.ok(STOCK_DIAMETERS_MM.every((d, i, all) => i === 0 || d > all[i - 1]));
  // The traced lens: aberrated, below the ideal lens of the same model, which reaches the closed form's 100 %.
  const s = setup({}).suggestion;
  assert.ok(s.ok && s.efficiency > 0.85 && s.efficiency < 0.95 && s.strehl < 1);
  close(s.idealEfficiency, 1, 1e-4);
  assert.ok(s.shiftMm < 0, 'spherical aberration brings the best plane toward the lens');
  close(s.faceLoss, 1 - (1 - ((s.n - 1) / (s.n + 1)) ** 2) ** 2);
  // Asked again, the same suggestion, without tracing it twice.
  assert.equal(planoConvexSuggestion({ wavelengthNm: 1550, beamDiameterMm: 2, focalMm: setup({}).optimalFocalMm, mfdUm: 10.4 }), s);
  // Refused suggestions say why, and the setup itself stays valid.
  for (const x of [{ wavelengthNm: 10600, mfdUm: 30 }, { beamDiameterMm: 100 }]) {
    const r = setup(x);
    assert.ok(r.ok && !r.suggestion.ok && r.suggestion.reason.length > 20);
  }
  // Every number the table shows is finite.
  for (const x of [{}, { wavelengthNm: 266, mfdUm: 3 }, { fiberMode: 'step' }, { wavelengthNm: 3000, mfdUm: 20 }]) {
    const r = setup(x).suggestion;
    assert.ok(r.ok, JSON.stringify(x));
    for (const k of ['radiusMm', 'diameterMm', 'thicknessMm', 'edgeMm', 'bflMm', 'strehl', 'efficiency', 'shiftMm', 'idealEfficiency', 'faceLoss']) assert.ok(Number.isFinite(r[k]), `${k} ${JSON.stringify(x)}`);
  }
});
