// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { besselJ0, besselJ1, airyIntensity, axialIntensity, effectivePsf, halfWidth, pinholeResponse } from '../calculators/point-scanning/psf.js';
import { RESOLUTION_DEFAULTS, computeResolution, resolutionProfiles, SCAN_DEFAULTS, computeScan, scanProfile, scanRamps, sampleDisplacementUm } from '../calculators/point-scanning/scanning-calculator.js';
import { ramanStokesWl } from '../sketch/js/elements.js';

const close = (got, want, tol = 1e-9) => assert.ok(Math.abs(got - want) <= tol * Math.max(1e-12, Math.abs(want)), `${got} != ${want}`);
const resolution = values => computeResolution({ ...RESOLUTION_DEFAULTS, ...values });
const scan = (values, focus = { na: 1, lateralUm: 0.25 }) => computeScan({ ...SCAN_DEFAULTS, ...values }, focus);

test('Bessel approximations match tabulated values', () => {
  // Abramowitz and Stegun, Table 9.1.
  close(besselJ0(1), 0.7651976866, 1e-8);
  close(besselJ1(1), 0.4400505857, 1e-8);
  close(besselJ0(5), -0.1775967713, 1e-7);
  close(besselJ1(10), 0.0434727462, 1e-6);
  close(besselJ1(-2), -0.5767248078, 1e-8);
});

test('open and point-pinhole limits hit their analytic half-maximum points', () => {
  // [2J1(v)/v]² = 1/2 at v = 1.616339948; sinc²(x) = 1/2 at x = 1.391557378.
  close(halfWidth(airyIntensity, 0.05), 1.616339948, 1e-8);
  close(halfWidth(axialIntensity, 0.1), 4 * 1.391557378, 1e-8);
  const r = resolution({ pinhole: 'open', wavelengthNm: 500, na: 0.5, immersion: 'air' });
  close(r.lateralUm, 2 * 1.616339948 * 0.5 / (2 * Math.PI * 0.5), 1e-8);
  close(r.excitationAxialUm, 2 * 4 * 1.391557378 * 0.5 / (4 * Math.PI * (1 - Math.sqrt(0.75))), 1e-8);
  // The Zeiss monograph rounds these to 0.51 and 0.88, and the point-pinhole
  // ones (equal wavelengths) to 0.37 and 0.64.
  const point = resolution({ pinhole: 'pinhole', pinholeAu: 0, detection: 'elastic', wavelengthNm: 500, na: 0.5, immersion: 'air' });
  close(r.lateralUm, r.closedForm.openLateralUm, 0.01);
  close(r.excitationAxialUm, r.closedForm.openAxialUm, 0.01);
  close(point.lateralUm, point.closedForm.pointLateralUm, 0.01);
  close(point.axialUm, point.closedForm.pointAxialUm, 0.01);
});

test('a point pinhole at the excitation wavelength gives the two-photon point image at that wavelength', () => {
  const point = resolution({ pinhole: 'pinhole', pinholeAu: 0, detection: 'elastic', wavelengthNm: 800, na: 0.8 });
  const twoPhoton = resolution({ mode: 'nonlinear', signal: '2pf', nlWavelengthNm: 800, na: 0.8 });
  close(point.lateralUm, twoPhoton.lateralUm, 1e-12);
  close(point.axialUm, twoPhoton.axialUm, 1e-12);
});

test('the pinhole moves the widths monotonically between the point and open limits', () => {
  const sizes = [0, 0.25, 0.5, 1, 2, 5, 10];
  const widths = sizes.map(pinholeAu => resolution({ pinholeAu }));
  const open = resolution({ pinhole: 'open' });
  for (let i = 1; i < widths.length; i++) {
    // Laterally, a pinhole beyond about 1.5 AU also takes in parts of the
    // Airy rings as the point moves off the axis, so the width ripples
    // around the open value instead of growing monotonically.
    if (sizes[i] <= 1) assert.ok(widths[i].lateralUm >= widths[i - 1].lateralUm, `lateral at ${sizes[i]} AU`);
    else close(widths[i].lateralUm, open.lateralUm, 5e-3);
    assert.ok(widths[i].axialUm >= widths[i - 1].axialUm - 1e-12, `axial at ${sizes[i]} AU`);
    assert.ok(widths[i].sliceUm > widths[i - 1].sliceUm, `slice at ${sizes[i]} AU`);
  }
  close(widths[0].lateralUm, widths[0].pointPinhole.lateralUm, 1e-12);
  // A 10 AU pinhole leaves the excitation spot alone.
  close(widths.at(-1).lateralUm, open.lateralUm, 1e-3);
  close(widths.at(-1).axialUm, open.excitationAxialUm, 1e-3);
  assert.equal(open.sliceUm, null);
  assert.equal(open.sectioning, false);
});

test('one-photon excitation without a pinhole has no axial resolution', () => {
  for (const detection of ['fluorescence', 'raman', 'elastic']) {
    const r = resolution({ pinhole: 'open', detection });
    assert.equal(r.ok, true);
    assert.equal(r.sectioning, false);
    assert.equal(r.axialUm, null);
    assert.ok(r.excitationAxialUm > 0);
    // The axial graph draws it as the flat signal of a thin layer.
    const axial = resolutionProfiles(r).axial;
    assert.equal(axial.ownFlat, true);
    assert.ok(axial.own.every(y => y === 1));
  }
  // Any pinhole, or N-photon excitation, confines the signal in depth.
  for (const values of [{ pinholeAu: 0 }, { pinholeAu: 10 }, { mode: 'nonlinear', signal: '2pf' }]) {
    const r = resolution(values);
    assert.equal(r.sectioning, true);
    assert.ok(r.axialUm > 0);
    assert.ok(resolutionProfiles(r).axial.own.every(Number.isFinite));
  }
  // The comparisons with one-photon excitation without a pinhole are lateral only.
  const two = resolution({ mode: 'nonlinear', signal: '2pf' });
  assert.deepEqual(Object.keys(two.sameWavelength), ['lateralUm']);
  assert.deepEqual(Object.keys(two.transition), ['lateralUm']);
});

test('the pinhole response is normalized and its radius follows the Airy unit', () => {
  const det = pinholeResponse(1.22 * Math.PI);
  close(det.lateral(0), 1, 1e-14);
  close(det.axial(0), 1, 1e-14);
  // A larger detected wavelength widens the detection side.
  const shifted = resolution({ emissionNm: 650 }), unshifted = resolution({ emissionNm: 488 });
  assert.ok(shifted.lateralUm > unshifted.lateralUm);
  close(resolution({ emissionNm: 650, pinholeAu: 2 }).pinholeUm, 2 * 1.22 * 0.65 / 1, 1e-12);
});

test('N-photon point images narrow against one-photon at the same wavelength', () => {
  for (const [signal, order] of [['2pf', 2], ['3pf', 3], ['shg', 2], ['thg', 3]]) {
    const r = resolution({ mode: 'nonlinear', signal, nlWavelengthNm: 1000, na: 1.0 });
    assert.equal(r.order, order);
    if (!r.signal.harmonic) assert.ok(r.lateralUm < r.sameWavelength.lateralUm && r.lateralUm > r.transition.lateralUm);
    assert.ok(r.axialUm < r.excitationAxialUm && r.axialUm > r.excitationAxialUm / Number(order));
    assert.equal(r.pinholeAu, null);
  }
  const two = resolution({ mode: 'nonlinear', signal: '2pf', nlWavelengthNm: 1000 });
  close(two.sameWavelength.lateralUm / two.lateralUm, 1.6163399 / 1.1601, 1e-3);
});

test('the band-limited pixel follows the cutoff of the point image, not its FWHM', () => {
  // N-photon: h^N passes up to 2N NA/λ, so the pixel is λ/(4 N NA).
  close(resolution({ mode: 'nonlinear', signal: '2pf', nlWavelengthNm: 1000, na: 1 }).bandPixelUm, 0.125, 1e-12);
  close(resolution({ mode: 'nonlinear', signal: '3pf', nlWavelengthNm: 1000, na: 1 }).bandPixelUm, 1 / 12, 1e-12);
  // One-photon without a pinhole: λ/(4 NA); with any pinhole the detection
  // band adds 2 NA/λ_det, however large the pinhole.
  close(resolution({ pinhole: 'open', wavelengthNm: 500, na: 0.5 }).bandPixelUm, 0.25, 1e-12);
  for (const pinholeAu of [0, 1, 10]) {
    close(resolution({ pinholeAu, wavelengthNm: 500, emissionNm: 600, na: 0.5 }).bandPixelUm, 1 / (2 * (2 * 0.5 / 0.5 + 2 * 0.5 / 0.6)), 1e-12);
  }
  // The FWHM rule is coarser than the band limit in every mode.
  for (const values of [{}, { pinhole: 'open' }, { mode: 'nonlinear', signal: '2pf' }, { mode: 'nonlinear', signal: '3pf' }]) {
    const r = resolution(values);
    assert.ok(r.lateralUm / 2 > r.bandPixelUm);
  }
});

test('the detection response alone is never narrower than the total axial point image', () => {
  for (const pinholeAu of [0, 0.5, 1, 3]) {
    const r = resolution({ pinholeAu, emissionNm: 488 });
    assert.ok(r.sliceUm > r.axialUm, `${pinholeAu} AU`);
  }
  // 488/488 nm, NA 1, water, point pinhole: the section is the total axial
  // FWHM (about 0.64 λ/(n − √(n² − NA²))), not the detection width.
  const point = resolution({ pinholeAu: 0, emissionNm: 488 });
  close(point.axialUm, point.closedForm.pointAxialUm, 0.01);
  assert.ok(point.sliceUm > 1.3 * point.axialUm);
});

test('nonlinear signals: harmonics at λ/N, and a one-photon confocal comparison at λ/N', () => {
  close(resolution({ mode: 'nonlinear', signal: 'shg', nlWavelengthNm: 1000 }).detNm, 500, 1e-12);
  close(resolution({ mode: 'nonlinear', signal: 'thg', nlWavelengthNm: 1200 }).detNm, 400, 1e-12);
  // SHG and two-photon fluorescence share the point image.
  const shg = resolution({ mode: 'nonlinear', signal: 'shg' }), tpf = resolution({ mode: 'nonlinear', signal: '2pf' });
  close(shg.lateralUm, tpf.lateralUm, 1e-12); close(shg.axialUm, tpf.axialUm, 1e-12);
  // The comparison is the linear calculator at λ/N with a 1 AU pinhole.
  for (const [values, linear] of [
    [{ signal: '2pf', nlWavelengthNm: 920, nlEmissionNm: 520 }, { wavelengthNm: 460, detection: 'fluorescence', emissionNm: 520 }],
    [{ signal: '3pf', nlWavelengthNm: 1500, nlEmissionNm: 600 }, { wavelengthNm: 500, detection: 'fluorescence', emissionNm: 600 }],
  ]) {
    const r = resolution({ mode: 'nonlinear', ...values });
    const one = resolution({ pinhole: 'pinhole', pinholeAu: 1, ...linear });
    close(r.transitionConfocal.lateralUm, one.lateralUm, 1e-12);
    close(r.transitionConfocal.axialUm, one.axialUm, 1e-12);
    const p = resolutionProfiles(r);
    assert.ok(p.axial.others[0].flat && p.axial.others[0].values.every(y => y === 1));
    assert.match(p.axial.others[1].name, /1 AU/);
  }
  // The comparison pinhole can be opened from its 1 AU default.
  const wide = resolution({ mode: 'nonlinear', signal: '2pf', comparisonAu: 2 });
  const wideOne = resolution({ wavelengthNm: 460, emissionNm: 520, pinholeAu: 2 });
  close(wide.transitionConfocal.axialUm, wideOne.axialUm, 1e-12);
  assert.match(resolutionProfiles(wide).axial.others[1].name, /2 AU/);
  assert.equal(resolution({ mode: 'nonlinear', signal: '2pf', comparisonAu: 11 }).ok, false);
  // A harmonic has no one-photon counterpart: no comparison at all.
  for (const signal of ['shg', 'thg']) {
    const r = resolution({ mode: 'nonlinear', signal });
    assert.equal(r.sameWavelength, undefined);
    assert.equal(r.transitionConfocal, undefined);
    const p = resolutionProfiles(r);
    assert.equal(p.lateral.others.length, 0);
    assert.equal(p.axial.others.length, 0);
  }
  // Fluorescence is emitted beyond λ/N.
  const anti = resolution({ mode: 'nonlinear', signal: '3pf', nlWavelengthNm: 1700, nlEmissionNm: 520 });
  assert.equal(anti.ok, false);
  assert.ok(anti.errors.some(e => e.id === 'nlEmissionNm'));
});

test('the axial graph reaches past the half maximum of the pinhole response', () => {
  for (const pinholeAu of [0.5, 1, 3, 10]) {
    const p = resolutionProfiles(resolution({ pinholeAu }));
    const detection = p.axial.others[0].values;
    assert.ok(detection[0] < 0.5 && detection.at(-1) < 0.5, `${pinholeAu} AU`);
    assert.ok(p.axial.own.every(Number.isFinite) && detection.every(Number.isFinite));
  }
});

test('a wide axial graph still samples the central peak finely', () => {
  // Half width read from the plotted samples by linear interpolation.
  const plottedFwhm = ({ x, own }) => {
    const edge = side => {
      let i = own.indexOf(Math.max(...own));
      while (own[i + side] >= 0.5) i += side;
      const j = i + side;
      return x[i] + (x[j] - x[i]) * (own[i] - 0.5) / (own[i] - own[j]);
    };
    return edge(1) - edge(-1);
  };
  for (const raw of [{ pinholeAu: 10 }, { pinholeAu: 10, wavelengthNm: 200, emissionNm: 3000 }]) {
    const r = resolution(raw);
    const p = resolutionProfiles(r).axial;
    assert.ok(r.ok);
    close(plottedFwhm(p), r.axialUm, 0.01);
    assert.ok(p.x.every((z, i) => i === 0 || z > p.x[i - 1]));
    assert.ok(p.others[0].values[0] < 0.5 && p.others[0].values.at(-1) < 0.5);
  }
});

test('spontaneous Raman detects the Stokes line of the shift', () => {
  const r = resolution({ detection: 'raman', wavelengthNm: 532, ramanShiftCm: 2900 });
  close(r.detNm, ramanStokesWl(532, 2900), 1e-12);
  assert.ok(r.detNm > 532);
});

test('resolution inputs outside the model are refused with a reason', () => {
  const air = resolution({ immersion: 'air', na: 1.0 });
  assert.equal(air.ok, false);
  assert.ok(air.errors.some(e => e.id === 'na'));
  assert.equal(resolution({ immersion: 'custom', immersionIndex: 1.2, na: 1.2 }).ok, false);
  assert.equal(resolution({ detection: 'raman', wavelengthNm: 2500, ramanShiftCm: 1000 }).ok, false);
  assert.equal(resolution({ wavelengthNm: 150 }).ok, false);
  assert.equal(resolution({ pinholeAu: 11 }).ok, false);
  assert.equal(resolution({ na: Number.NaN }).ok, false);
});

test('profiles are finite, peak at 1 and cross one half at the reported FWHM', () => {
  for (const values of [{}, { pinhole: 'open' }, { mode: 'nonlinear', signal: '3pf', nlWavelengthNm: 1300 }]) {
    const r = resolution(values);
    const p = resolutionProfiles(r);
    const curves = [p.lateral.own, p.axial.own, ...p.lateral.others.map(o => o.values), ...p.axial.others.map(o => o.values)];
    for (const curve of curves) {
      assert.ok(curve.every(Number.isFinite));
      assert.ok(Math.max(...curve) <= 1 + 1e-9);
    }
    close(p.lateral.own[(p.lateral.x.length - 1) / 2], 1, 1e-9);
    const scale = r.exNm / 1000 / (2 * Math.PI * r.na);
    close(r.psf.lateral(r.lateralUm / 2 / scale), 0.5, 1e-9);
  }
});

test('galvo displacement: optical angle twice the rotation, both lens mappings', () => {
  const r = scan({});
  // 20x on 200 mm: f_obj = 10 mm; 50/200 mm relay; 1° mechanical = 2° optical.
  close(r.objectiveMm, 10);
  close(r.displacementUm, 1000 * 50 * Math.tan(2 * Math.PI / 180) * 10 / 200);
  close(scan({ angleKind: 'optical', angleDeg: 2 }).displacementUm, r.displacementUm, 1e-12);
  close(scan({ mapping: 'ftheta' }).displacementUm, 1000 * 50 * (2 * Math.PI / 180) * 10 / 200);
  close(r.otherMappingUm, scan({ mapping: 'ftheta' }).displacementUm, 1e-12);
  close(scan({ angleDeg: -1 }).displacementUm, -r.displacementUm, 1e-12);
  close(scan({ angleDeg: 0 }).displacementUm + 1, 1);
  close(r.fieldUm, 2 * sampleDisplacementUm({ opticalRad: 4 * Math.PI / 180, scanLensMm: 50, tubeLensMm: 200, objectiveMm: 10 }));
  close(r.objectFieldUm, 1100);
  close(r.umPerDegree, 1000 * 50 * 10 / 200 * 2 * Math.PI / 180);
  close(scan({ tubeReference: '180', magnification: 25 }).objectiveMm, 7.2);
  close(scan({ tubeReference: 'custom', tubeReferenceMm: 164.5, magnification: 10 }).objectiveMm, 16.45);
});

test('the scan panel uses the resolution panel for the pupil and Nyquist sampling', () => {
  const r = scan({ beamMm: 2.5 }, { na: 1.0, lateralUm: 0.25, bandPixelUm: 0.1 });
  close(r.pupilMm, 20);
  close(r.beamAtPupilMm, 10);
  close(r.fillRatio, 0.5);
  close(r.halfFwhmPixelUm, 0.125);
  assert.equal(r.pixelsNeeded, Math.ceil(r.fieldUm / 0.125));
  close(r.bandPixelUm, 0.1);
  assert.equal(r.bandPixelsNeeded, Math.ceil(r.fieldUm / 0.1));
  const alone = scan({}, null);
  assert.equal(alone.ok, true);
  assert.equal(alone.pupilMm, null);
  assert.equal(alone.fillRatio, null);
  assert.equal(alone.pixelsNeeded, null);
  assert.equal(alone.bandPixelsNeeded, null);
});

test('scan inputs outside the model are refused', () => {
  assert.equal(scan({ angleDeg: 31 }).ok, false);
  assert.equal(scan({ angleKind: 'optical', rangeDeg: 60, angleDeg: 0 }).ok, true);
  assert.equal(scan({ rangeDeg: 61 }).ok, false);
  assert.equal(scan({ magnification: 0 }).ok, false);
  assert.equal(scan({ tubeReference: 'custom', tubeReferenceMm: 10 }).ok, false);
  const p = scanProfile(scan({ angleDeg: 5, rangeDeg: 2 }));
  assert.ok(p.tan.every(Number.isFinite) && p.ftheta.every(Number.isFinite));
  assert.ok(Math.max(...p.x) >= 5);
  // At the edge of the accepted mechanical range the graph stops at ±60°
  // optical, short of tan's pole.
  for (const values of [{ angleDeg: 30 }, { angleDeg: 0, rangeDeg: 60 }]) {
    const r = scan(values);
    assert.equal(r.ok, true);
    const edge = scanProfile(r);
    close(Math.max(...edge.x) * r.optical, 60, 1e-12);
    const limit = sampleDisplacementUm({ opticalRad: 60 * Math.PI / 180, scanLensMm: 50, tubeLensMm: 200, objectiveMm: 10 });
    assert.ok(Math.max(...edge.tan.map(Math.abs)) <= limit * (1 + 1e-12));
  }
});

test('raster commands: sawtooth or triangle on X, one step per line on Y', () => {
  const at = (p, t) => p.x.findIndex(x => Math.abs(x - t) < 1e-9);
  // 4° mechanical peak to peak at 0.5 V/°: ±1 V; optical angles halve it.
  close(scan({}).commandAmplitudeV, 1);
  close(scan({ angleKind: 'optical', rangeDeg: 4 }).commandAmplitudeV, 0.5);
  close(scan({ voltsPerDeg: 1 }).commandAmplitudeV, 2);
  for (const bidirectional of [false, true]) {
    const p = scanRamps(scan({ bidirectional }), { lines: 8, samplesPerLine: 100 });
    assert.ok(p.fast.every(Number.isFinite) && p.slow.every(Number.isFinite));
    assert.ok(Math.max(...p.fast.map(Math.abs), ...p.slow.map(Math.abs)) <= 1 + 1e-12);
    // Lines step evenly from −1 V to +1 V, and the frame flies back to −1 V.
    for (let k = 0; k < 8; k++) close(p.slow[at(p, k + 0.5)] + 2, -1 + 2 * k / 7 + 2, 1e-12);
    close(p.slow.at(-1), -1); close(p.fast.at(-1), -1);
    if (!bidirectional) {
      // Every line starts at −1 V: the sawtooth ramps up and flies back.
      for (let k = 0; k < 8; k++) close(p.fast[at(p, k)], -1);
      close(p.fast[at(p, 0.4)] + 1, 1, 1e-12);
    } else {
      // A triangle: even lines run up, odd lines down, with no flyback.
      for (let k = 0; k < 8; k++) close(p.fast[at(p, k)], k % 2 ? 1 : -1);
      close(p.fast[at(p, 1.5)] + 1, 1, 1e-12);
    }
  }
});

test('the page lays out each panel as inputs, graphs, then results, numbering the graphs in order', () => {
  const html = readFileSync(new URL('../calculators/point-scanning/index.html', import.meta.url), 'utf8');
  const order = ['id="calc-form"', 'id="chart-lateral"', 'id="chart-axial"', 'id="res-focus-results"', 'id="res-limits-results"', 'id="calc-notes"',
    'id="scan-panel"', 'id="scan-form"', 'id="chart-scan"', 'id="chart-ramps"', 'id="scan-objective-results"', 'id="scan-beam-results"', 'id="scan-notes"'].map(s => html.indexOf(s));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), order.join(', '));
  assert.match(html, /chart-num">3<\/span><span><b>Spot displacement/);
  assert.match(html, /chart-num">4<\/span><span><b>X and Y command voltages/);
});
