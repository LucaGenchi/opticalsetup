// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { GLASSES, glassIndex, glassGVD, glassGroupIndex, glassAbbe } from '../sketch/js/glass.js';
import { MATERIALS, MATERIAL_OPTIONS, materialDispersion, materialAbbe, isInMaterialRange } from '../calculators/dispersion/materials.js';
import { DISPERSION_DEFAULTS, computeDispersion, dispersionScan } from '../calculators/dispersion/dispersion-calculator.js';
import { CONVERSION_DEFAULTS, computeConversion } from '../calculators/nonlinear-conversion/conversion-calculator.js';
import { CRS_DEFAULTS, computeCrs, RESOLUTION_DEFAULTS, computeResolution, RESOLUTION_PREFACTOR_PS_CM } from '../calculators/coherent-raman/crs-calculator.js';
import { isInputActive } from '../calculators/assets/calculator-inputs.js';
import { transformLimitedDurationFs } from '../sketch/js/spectrum.js';

const close = (got, want, tol = 1e-9) => assert.ok(Math.abs(got - want) <= tol * Math.max(1, Math.abs(want)), `${got} != ${want}`);
const dispersion = values => computeDispersion({ ...DISPERSION_DEFAULTS, ...values });
const conversion = values => computeConversion({ ...CONVERSION_DEFAULTS, ...values });
const crs = values => computeCrs({ ...CRS_DEFAULTS, ...values });
const resolution = values => computeResolution({ ...RESOLUTION_DEFAULTS, ...values });

test('the four workbench glasses evaluate the canvas catalogue curves', () => {
  for (const id of GLASSES.keys()) {
    assert.ok(MATERIALS.has(id), id);
    const [lo, hi] = GLASSES.get(id).range;
    // Whole nm, where the tracer's 0.1 nm and 1 nm buckets land exactly.
    for (const nm of [lo, 587, 800, 1064, hi]) {
      const d = materialDispersion(id, nm);
      close(d.index, glassIndex(id, nm), 1e-14);
      close(d.groupIndex, glassGroupIndex(id, nm), 1e-14);
      close(d.gvdFs2PerMm, glassGVD(id, nm), 1e-12);
    }
    close(materialAbbe(id), glassAbbe(id), 1e-12);
  }
});

test('materials refuse wavelengths outside their fit domain instead of clamping', () => {
  for (const [id, m] of MATERIALS) {
    const [lo, hi] = m.range;
    assert.ok(materialDispersion(id, lo) && materialDispersion(id, hi), id);
    for (const bad of [lo - 0.01, hi + 0.01, NaN, Infinity, '800', null]) assert.equal(materialDispersion(id, bad), null, `${id} ${bad}`);
    assert.equal(isInMaterialRange(id, lo - 0.01), false);
  }
  assert.equal(materialDispersion('unknown', 800), null);
  // Abbe needs the F, d and C lines inside the domain.
  assert.equal(materialAbbe('si'), null);
  assert.equal(materialAbbe('znse'), null);
  assert.ok(MATERIAL_OPTIONS.every(([id, label, group]) => MATERIALS.has(id) && label && group));
});

test('dispersion: GDD, TOD, delays and pulse stretching follow from the material values', () => {
  const r = dispersion({});
  assert.equal(r.ok, true);
  close(r.gddFs2, 10 * r.gvdFs2PerMm);
  close(r.todFs3, 10 * r.todFs3PerMm);
  assert.ok(r.delaySpreadFs > 0, 'normal dispersion delays the blue edge');
  // The edge-to-edge delay agrees with GDD × Δω to first order for a narrow band.
  const narrow = dispersion({ bandwidthNm: 1 });
  const dOmega = 2 * Math.PI * 299.792458 * 1 / 800 ** 2;
  close(narrow.delaySpreadFs, narrow.gddFs2 * dOmega, 1e-4);
  assert.ok(r.outputFs > r.transformLimitFs);
  assert.ok(dispersion({ shape: 'sech2' }).transformLimitFs < r.transformLimitFs);
  // What the material adds over the same path in air: group delay and optical path.
  close(r.addedDelayFs, 10 * (r.groupIndex - 1) * 1e12 / 299792458);
  close(r.addedOpticalPathMm, 10 * (r.index - 1));
  assert.ok(r.addedDelayFs > 0 && r.addedOpticalPathMm > 0 && r.addedDelayFs * 299792458e-12 > r.addedOpticalPathMm, 'n_g > n in normal dispersion');
  const zero = dispersion({ thicknessMm: 0 });
  assert.equal(zero.gddFs2, 0);
  assert.equal(zero.addedDelayFs, 0);
  close(zero.outputFs, zero.transformLimitFs);
  const mono = dispersion({ bandwidthNm: 0 });
  assert.equal(mono.ok, true);
  assert.equal(mono.transformLimitFs, null);
  assert.equal(mono.delaySpreadFs, null);
  assert.ok(dispersion({ wavelengthNm: 1550 }).gvdFs2PerMm < 0);
  // Same time–bandwidth products as the workbench, without its 1e-9 nm
  // bandwidth floor: a narrower band keeps the stated formula (review of #244).
  for (const shape of ['gauss', 'sech2']) close(dispersion({ shape }).transformLimitFs, transformLimitedDurationFs(30, 800, shape), 1e-12);
  close(dispersion({ thicknessMm: 0, bandwidthNm: 1e-10 }).transformLimitFs, 0.441 * 800 ** 2 / (299.792458 * 1e-10), 1e-12);
  // The input-pulse table's frequency width is the same small-band Δν: τ₀ Δν = K.
  close(r.transformLimitFs * r.bandwidthTHz * 1e-3, 0.441, 1e-12);
  assert.equal(mono.bandwidthTHz, null);
  // A band edge outside the domain removes only the delay spread.
  const edge = dispersion({ material: 'water', wavelengthNm: 1120, bandwidthNm: 40 });
  assert.equal(edge.ok, true);
  assert.equal(edge.delaySpreadFs, null);
  assert.ok(Number.isFinite(edge.gddFs2));
});

test('dispersion declines invalid inputs and out-of-domain wavelengths', () => {
  for (const bad of [{ material: 'fake' }, { wavelengthNm: 3800 }, { material: 'si', wavelengthNm: 800 },
    { material: 'water', wavelengthNm: 1200 }, { bandwidthNm: 800 }, { bandwidthNm: -1 }, { thicknessMm: -1 },
    { shape: 'square' }, { wavelengthNm: Infinity }, { plotRange: 'custom', loNm: 200 },
    { plotRange: 'custom', loNm: 1000, hiNm: 1000.5 }, { plotRange: 'nowhere' }]) {
    assert.equal(dispersion(bad).ok, false, JSON.stringify(bad));
  }
  // Out-of-domain plot fields are ignored unless the range is custom.
  assert.equal(dispersion({ loNm: 100, hiNm: 99 }).ok, true);
});

test('dispersion plot ranges: automatic, whole domain and custom, all inside the fit', () => {
  const auto = dispersion({ material: 'water', wavelengthNm: 800 });
  assert.deepEqual(auto.plot, [400, 1129]);
  assert.deepEqual(dispersion({ plotRange: 'domain' }).plot, [210, 3710]);
  assert.deepEqual(dispersion({ plotRange: 'custom', loNm: 500, hiNm: 900 }).plot, [500, 900]);
  for (const id of MATERIALS.keys()) {
    const [lo, hi] = MATERIALS.get(id).range;
    const r = dispersion({ material: id, wavelengthNm: Math.sqrt(lo * hi), plotRange: 'domain' });
    const scan = dispersionScan(r);
    assert.equal(scan.length, 241);
    assert.equal(scan[0].wavelengthNm, lo);
    assert.equal(scan.at(-1).wavelengthNm, hi);
    assert.ok(scan.every(p => [p.index, p.groupIndex, p.gvdFs2PerMm, p.todFs3PerMm].every(Number.isFinite)), id);
  }
});

test('nonlinear conversion: harmonics both ways, SFG, DFG and OPO', () => {
  const nm = r => r.waves.map(w => w.wavelengthNm);
  assert.deepEqual(nm(conversion({})), [1064, 532]);
  close(nm(conversion({ process: 'thg' }))[1], 1064 / 3);
  assert.deepEqual(nm(conversion({ process: 'thg', known: 'harmonic', harmonicInputNm: 355 })), [1065, 355]);
  close(nm(conversion({ process: 'sfg' }))[2], 1 / (1 / 800 + 1 / 1040));
  close(nm(conversion({ process: 'dfg', wave1Nm: 1040, wave2Nm: 800 }))[2], 1 / (1 / 800 - 1 / 1040));
  close(nm(conversion({ process: 'sfg', wave1Nm: 1030, wave2Nm: 1030 }))[2], 515);
  const opo = conversion({ process: 'opo' });
  close(nm(opo)[2], 1030 * 1550 / 520);
  close(opo.signalShare + opo.idlerShare, 1);
  // Entering the idler gives the same pair as entering the signal.
  const fromIdler = conversion({ process: 'opo', outputNm: nm(opo)[2] });
  close(nm(fromIdler)[1], 1550);
  // An output just longer than the pump has a very long partner, not a
  // refusal: no tracer cutoff (review of #244).
  const nearPump = conversion({ process: 'opo', outputNm: 1030.001 });
  assert.equal(nearPump.ok, true);
  close(nm(nearPump)[2], 1030 * 1030.001 / 0.001, 1e-6);
  // Inputs one ulp apart: the reciprocals would round equal (review of #244).
  for (const r of [conversion({ process: 'opo', pumpNm: 1900, outputNm: 1900.0000000000002 }),
    conversion({ process: 'dfg', wave1Nm: 1900, wave2Nm: 1900.0000000000002 })]) {
    assert.equal(r.ok, true);
    assert.ok(r.waves.every(w => [w.wavelengthNm, w.frequencyTHz, w.photonEv].every(Number.isFinite) && w.wavelengthNm > 0));
  }
  const degenerate = conversion({ process: 'opo', outputNm: 2060 });
  assert.equal(degenerate.degenerate, true);
  for (const w of degenerate.waves) close(w.photonEv, 1239.8419843320026 / w.wavelengthNm);
});

test('nonlinear conversion: CARS and CSRS agree with the Coherent Raman calculator', () => {
  for (const [pumpNm, stokesNm] of [[1030, 1458], [800, 1040], [600, 1300]]) {
    const r = conversion({ process: 'crs', pumpNm, stokesNm });
    const ref = crs({ mode: 'pump-stokes', pumpNm, stokesNm });
    assert.equal(r.ok, true);
    close(r.ramanShiftCm, ref.ramanShiftCm);
    close(r.waves[2].wavelengthNm, ref.antiStokesNm);
    if (ref.csrsNm === null) assert.equal(r.waves.length, 3, 'no CSRS wave when it would be impossible');
    else close(r.waves[3].wavelengthNm, ref.csrsNm);
  }
  for (const bad of [{ stokesNm: 1000 }, { stokesNm: 1030 }, { pumpNm: 100, stokesNm: 20000 }, { stokesNm: '' }]) {
    const r = conversion({ process: 'crs', ...bad });
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(r.errors.every(e => ['pumpNm', 'stokesNm'].includes(e.id)), 'errors name the conversion page fields');
  }
});

test('nonlinear conversion declines impossible inputs', () => {
  for (const bad of [{ process: 'dfg', wave1Nm: 900, wave2Nm: 900 }, { process: 'opo', outputNm: 1030 },
    { process: 'opo', outputNm: 900 }, { process: 'shg', harmonicInputNm: 99 }, { process: 'xpm' },
    { process: 'shg', known: 'sideways' }, { process: 'sfg', wave1Nm: '' }]) {
    assert.equal(conversion(bad).ok, false, JSON.stringify(bad));
  }
  // Inactive fields are ignored.
  assert.equal(conversion({ process: 'shg', wave1Nm: '', pumpNm: 'x' }).ok, true);
});

test('coherent Raman: three input modes agree, CARS and CSRS on either side', () => {
  const a = crs({});
  close(a.ramanShiftCm, 1e7 * (1 / 800 - 1 / 1040));
  close(a.antiStokesNm, 650);
  close(a.csrsNm, 1 / (2 / 1040 - 1 / 800));
  const b = crs({ mode: 'pump-shift', ramanShiftCm: a.ramanShiftCm, stokesNm: '' });
  close(b.stokesNm, 1040);
  const c = crs({ mode: 'stokes-shift', ramanShiftCm: a.ramanShiftCm, pumpNm: '' });
  close(c.pumpNm, 800);
  close(c.csrsNm, a.csrsNm);
  // CARS sits one Raman shift above the pump, CSRS one below the Stokes beam.
  close(1e7 / a.antiStokesNm - 1e7 / 800, a.ramanShiftCm, 1e-9);
  close(1e7 / 1040 - 1e7 / a.csrsNm, a.ramanShiftCm, 1e-9);
  // No CSRS when the shift exceeds the probing (Stokes) frequency; CARS remains.
  const noCsrs = crs({ pumpNm: 600, stokesNm: 1300 });
  assert.equal(noCsrs.ok, true);
  assert.equal(noCsrs.csrsNm, null);
  assert.ok(noCsrs.antiStokesNm > 0);
  close(crs({ stokesNm: 800.000001 }).ramanShiftCm, 1e7 * 0.000001 / 800 / 800.000001, 1e-10);
});

test('coherent Raman declines reversed beams, impossible shifts and inferred waves out of scope', () => {
  for (const bad of [
    { stokesNm: 800 }, { stokesNm: 700 }, { pumpNm: '' }, { stokesNm: Infinity },
    { mode: 'pump-shift', ramanShiftCm: 0 }, { mode: 'stokes-shift', ramanShiftCm: -1 },
    { mode: 'pump-shift', pumpNm: 2000, ramanShiftCm: 5000 }, { mode: 'pump-shift', pumpNm: 20000, ramanShiftCm: 0.1 },
    { mode: 'stokes-shift', stokesNm: 105, ramanShiftCm: 10000 }, { pumpNm: 100, stokesNm: 20000 },
    { mode: 'pump-shift', ramanShiftCm: 10001 }, { mode: 'fake' },
  ]) assert.equal(crs(bad).ok, false, JSON.stringify(bad));
  assert.equal(crs({ mode: 'pump-shift', pumpNm: 100, ramanShiftCm: 10000 }).ok, true);
});

test('coherent Raman resolution: Eq. (5) of Mohseni et al., symmetric and bounded by the shorter pulse', () => {
  close(RESOLUTION_PREFACTOR_PS_CM, 20.8, 0.0025);
  const r = resolution({});
  close(r.resolutionCm, RESOLUTION_PREFACTOR_PS_CM * Math.SQRT1_2);
  close(resolution({ pumpPs: 1, stokesPs: 3 }).resolutionCm, resolution({ pumpPs: 3, stokesPs: 1 }).resolutionCm);
  assert.ok(resolution({ pumpPs: 1, stokesPs: 10000 }).resolutionCm < resolution({ pumpPs: 1, stokesPs: 1 }).resolutionCm);
  close(r.resolutionGHz, r.resolutionCm * 29.9792458);
  for (const bad of [{ pumpPs: 0 }, { stokesPs: -1 }, { pumpPs: '' }, { stokesPs: 1e5 }]) assert.equal(resolution(bad).ok, false);
});

test('inputs: `when` conditions accept a checkbox, one value or a list of values', () => {
  assert.equal(isInputActive({ when: 'probe' }, { probe: true }), true);
  assert.equal(isInputActive({ when: 'probe' }, { probe: false }), false);
  assert.equal(isInputActive({ when: 'mode', whenValue: 'a' }, { mode: 'a' }), true);
  assert.equal(isInputActive({ when: 'mode', whenValue: ['a', 'b'] }, { mode: 'b' }), true);
  assert.equal(isInputActive({ when: 'mode', whenValue: ['a', 'b'] }, { mode: 'c' }), false);
  assert.equal(isInputActive({ when: 'range', whenValue: false }, { range: false }), true);
});
