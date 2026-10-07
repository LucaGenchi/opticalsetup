// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { GLASSES, glassDispersion, glassIndex, glassGVD } from '../sketch/js/glass.js';
import { DISPERSION_DEFAULTS, computeDispersion, dispersionScan } from '../calculators/dispersion/dispersion-calculator.js';
import { SHG_DEFAULTS, computeShg } from '../calculators/shg/shg-calculator.js';
import { CARS_DEFAULTS, computeCars } from '../calculators/cars/cars-calculator.js';
const close = (got, want, tol = 1e-9) => assert.ok(Math.abs(got - want) < tol, `${got} != ${want}`);
const dispersion = values => computeDispersion({ ...DISPERSION_DEFAULTS, ...values });
const shg = values => computeShg({ ...SHG_DEFAULTS, ...values });
const cars = values => computeCars({ ...CARS_DEFAULTS, ...values });

test('continuous glass dispersion refuses invalid domains while tracer getters keep clamping', () => {
  for (const [id, glass] of GLASSES) {
    const [lo, hi] = glass.range;
    for (const nm of [lo, hi]) assert.ok(glassDispersion(id, nm));
    for (const bad of [lo - 0.1, hi + 0.1, NaN, Infinity, '', null, '800']) assert.equal(glassDispersion(id, bad), null);
    assert.equal(glassIndex(id, lo - 10), glassIndex(id, lo));
    assert.equal(glassGVD(id, hi + 10), glassGVD(id, hi));
  }
  assert.equal(glassDispersion('unknown', 800), null);
  assert.notEqual(glassDispersion('silica', 800.25).index, glassIndex('silica', 800.25));
  assert.notEqual(glassDispersion('silica', 800.25).gvdFs2PerMm, glassGVD('silica', 800.25));
});

test('dispersion scans every glass including endpoints, normal and anomalous silica GVD', () => {
  for (const [glass, { range: [loNm, hiNm] }] of GLASSES) {
    const r = dispersion({ glass, loNm, hiNm });
    assert.equal(r.ok, true);
    const scan = dispersionScan(r);
    assert.equal(scan.length, 241);
    assert.equal(scan[0].wavelengthNm, loNm);
    assert.equal(scan.at(-1).wavelengthNm, hiNm);
    assert.ok(scan.every(p => Object.values(p).every(Number.isFinite)));
  }
  assert.ok(dispersion({ wavelengthNm: 800 }).gvdFs2PerMm > 0);
  assert.ok(dispersion({ wavelengthNm: 1550 }).gvdFs2PerMm < 0);
  assert.equal(dispersion({ lengthMm: 0 }).gddFs2, 0);
  close(dispersion({ lengthMm: 10 }).gddFs2, 10 * dispersion({}).gvdFs2PerMm);
  for (const bad of [{ glass: 'fake' }, { hiNm: 400 }, { hiNm: 400.5 }, { loNm: 200 },
    { glass: 'nsf11', loNm: 369.99 }, { glass: 'nbk7', hiNm: 2501 }, { lengthMm: -1 }, { wavelengthNm: Infinity }]) {
    assert.equal(dispersion(bad).ok, false);
  }
});

test('SHG forward and reverse agree at fractional wavelengths and input endpoints', () => {
  const forward = shg({ wavelengthNm: 1030.25 });
  const reverse = shg({ mode: 'harmonic', wavelengthNm: forward.harmonicNm });
  close(reverse.fundamentalNm, 1030.25);
  close(forward.harmonicTHz, 2 * forward.fundamentalTHz);
  assert.equal(shg({ wavelengthNm: 100 }).harmonicNm, 50);
  assert.equal(shg({ mode: 'harmonic', wavelengthNm: 20000 }).fundamentalNm, 40000);
  for (const wavelengthNm of ['', NaN, Infinity, -5, 0, 99, 20001]) assert.equal(shg({ wavelengthNm }).ok, false);
  assert.equal(shg({ mode: 'invalid' }).ok, false);
});

test('CARS both modes round-trip and distinct probe controls the emitted frequency', () => {
  const forward = cars({});
  close(forward.ramanShiftCm, 2500);
  close(forward.antiStokesNm, 2000 / 3);
  const inverse = cars({ mode: 'shift', ramanShiftCm: forward.ramanShiftCm, stokesNm: '' });
  close(inverse.stokesNm, 1000);
  close(inverse.antiStokesNm, forward.antiStokesNm);
  close(cars({ separateProbe: true, probeNm: 700 }).antiStokesNm, 28000 / 47);
  assert.equal(cars({ probeNm: '', ramanShiftCm: '' }).ok, true); // disabled fields ignored
  close(cars({ stokesNm: 800.000001 }).ramanShiftCm, 1e7 * 0.000001 / 800 / 800.000001, 1e-10);
});

test('CARS declines reversed/equal wavelengths, impossible shifts and out-of-scope inferred Stokes', () => {
  for (const bad of [
    { stokesNm: 800 }, { stokesNm: 700 }, { pumpNm: '' }, { stokesNm: NaN }, { separateProbe: true, probeNm: Infinity },
    { mode: 'shift', ramanShiftCm: 0 }, { mode: 'shift', ramanShiftCm: -1 },
    { mode: 'shift', pumpNm: 2000, ramanShiftCm: 5000 },
    { mode: 'shift', pumpNm: 2000, ramanShiftCm: 4999.99999 },
    { mode: 'shift', pumpNm: 2000, ramanShiftCm: 6000 },
    { mode: 'shift', pumpNm: 20000, ramanShiftCm: 0.1 },
    { pumpNm: 100, stokesNm: 20000 }, { mode: 'shift', ramanShiftCm: 10001 }, { mode: 'fake' },
  ]) assert.equal(cars(bad).ok, false, JSON.stringify(bad));
  assert.equal(cars({ mode: 'shift', pumpNm: 100, ramanShiftCm: 10000 }).ok, true);
});
