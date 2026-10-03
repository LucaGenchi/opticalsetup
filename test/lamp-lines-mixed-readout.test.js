// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// A lamp's lines stay lines when the lamp shares a detector with another
// source, and on a camera as well as a spectrometer. The direct readout of a
// lamp alone is covered by lamp-lines-direct-readout.test.js; these are the
// neighbouring cases the review of that fix ran by hand: the lamp beside a
// single-line laser, a Gaussian, a flat continuum and a filtered (sampled)
// profile, the two weighed by their watts, and each through the camera's own
// spectrum path. In every one the lamp keeps its seven lines at the preset
// shares, the other source keeps its own shape, and the spectrum adds up to
// the signal.

import assert from 'node:assert/strict';
import test from 'node:test';
import '../sketch/js/detector-instruments.js';
import { createElement } from '../sketch/js/elements.js';
import { LAMP_PRESETS } from '../sketch/js/lamps.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';

const HG = [...LAMP_PRESETS.hg.lines].sort((a, b) => a.nm - b.nm);
const HG_WEIGHT = HG.reduce((sum, line) => sum + line.w, 0);

const place = (type, x, y, params = {}) => {
  const el = createElement(type, x, y);
  Object.assign(el.params, params);
  return el;
};

// A collimated mercury lamp along y = 200, and a second source on a parallel
// path at y = 270 that misses the lamp's mirror and lands on the same sensor.
function lamp(params = {}) {
  const source = place('pointsource', 175, 200, { sourceKind: 'lamp', lampType: 'hg', spread: 360, nrays: 24, ...params });
  const mirror = place('oap', 150, 200, { length: 110, f: 25 });
  mirror.rot = 180;
  return { source, elements: [source, mirror] };
}
const beside = (type, params) => place(type, 250, 270, params);

const SENSORS = [
  ['spectrometer', { aperture: 200 }],
  ['camera', { ch: 200 }],
];

function read(sensor, elements) {
  const [type, params] = sensor;
  const detector = place(type, 600, 200, params);
  traceScene([...elements, detector]);
  const reading = detectorReading(detector.id);
  assert.ok(reading, `${type}: light arrives`);
  const bins = reading.spectrum.filter(bin => bin.power > 1e-9);
  const total = bins.reduce((sum, bin) => sum + bin.power, 0);
  assert.ok(Math.abs(total - reading.signal) < 1e-9, `${type}: spectrum ${total} adds up to the signal ${reading.signal}`);
  return { reading, bins };
}

const power = bins => bins.reduce((sum, bin) => sum + bin.power, 0);
const from = (bins, source) => bins.filter(bin => bin.sourceId === source.id);

// The lamp's own part of a reading: seven lines, each at its wavelength (the
// readout keys to 0.1 nm) with its preset share of the lamp's light.
function assertLampLines(bins, label) {
  assert.equal(bins.length, HG.length, `${label}: one bin per mercury line (${bins.map(bin => bin.wavelength)})`);
  const total = power(bins);
  HG.forEach((line, index) => {
    const bin = bins[index];
    assert.ok(Math.abs(bin.wavelength - line.nm) <= 0.05 + 1e-9, `${label}: ${line.nm} nm line, got ${bin.wavelength}`);
    assert.equal(bin.continuum, false, `${label}: ${line.nm} nm is a line, not a band`);
    assert.ok(Math.abs(bin.power / total - line.w / HG_WEIGHT) < 1e-9,
      `${label}: ${line.nm} nm share ${bin.power / total} vs ${line.w / HG_WEIGHT}`);
  });
  return total;
}

// What the lamp delivers on its own, to compare a shared sensor against.
function lampAlone(sensor) {
  const { source, elements } = lamp();
  const { bins } = read(sensor, elements);
  return assertLampLines(from(bins, source), `${sensor[0]}, lamp alone`);
}

for (const sensor of SENSORS) {
  const name = sensor[0];

  test(`${name}: a lamp alone shows its seven lines`, () => {
    const { source, elements } = lamp();
    const { reading, bins } = read(sensor, elements);
    assert.equal(bins.length, HG.length, 'nothing but the lamp');
    assertLampLines(from(bins, source), name);
    assert.ok(Math.abs(reading.bandMin - HG[0].nm) < 0.05, `band starts at the first line (${reading.bandMin})`);
    assert.ok(Math.abs(reading.bandMax - HG[HG.length - 1].nm) < 0.05, `band ends at the last line (${reading.bandMax})`);
  });

  test(`${name}: a lamp beside a single-line laser keeps its lines, and the laser its one`, () => {
    const { source, elements } = lamp();
    const laser = beside('cwlaser', { wavelength: 633 });
    const { bins } = read(sensor, [...elements, laser]);
    assert.ok(Math.abs(assertLampLines(from(bins, source), name) - lampAlone(sensor)) < 1e-9, 'the lamp delivers what it does alone');
    const line = from(bins, laser);
    assert.equal(line.length, 1);
    assert.equal(line[0].wavelength, 633);
    assert.equal(line[0].continuum, false);
    assert.ok(Math.abs(line[0].power - 1) < 1e-9, `the whole laser arrives (${line[0].power})`);
  });

  test(`${name}: a laser on a lamp line is not added into the lamp's line`, () => {
    const { source, elements } = lamp();
    const laser = beside('cwlaser', { wavelength: 546.1 });
    const { bins } = read(sensor, [...elements, laser]);
    assertLampLines(from(bins, source), name);
    const line = from(bins, laser);
    assert.equal(line.length, 1);
    assert.equal(line[0].wavelength, 546.1);
    assert.ok(Math.abs(line[0].power - 1) < 1e-9);
  });

  test(`${name}: a lamp beside a Gaussian keeps its lines, and the Gaussian its curve`, () => {
    const { source, elements } = lamp();
    const laser = beside('pulsedlaser', { transformLimited: false, bandwidth: 10, wavelength: 800 });
    const { bins } = read(sensor, [...elements, laser]);
    assert.ok(Math.abs(assertLampLines(from(bins, source), name) - lampAlone(sensor)) < 1e-9);
    const curve = from(bins, laser);
    assert.ok(curve.length >= 48, `a curve, not a few stems (${curve.length})`);
    assert.ok(curve.every(bin => bin.continuum), 'every sample belongs to the band');
    assert.ok(Math.abs(power(curve) - 1) < 1e-9, `the whole pulse arrives (${power(curve)})`);
    const density = bin => bin.power / bin.widthNm;
    const peak = curve.reduce((best, bin) => (density(bin) > density(best) ? bin : best));
    assert.ok(Math.abs(peak.wavelength - 800) < 0.5, `peak at ${peak.wavelength}`);
    const above = curve.filter(bin => density(bin) >= density(peak) / 2);
    const fwhm = above[above.length - 1].wavelength - above[0].wavelength;
    assert.ok(Math.abs(fwhm - 10) < 1, `FWHM ${fwhm} nm for a 10 nm Gaussian`);
  });

  test(`${name}: a lamp inside a flat continuum keeps its lines apart from the band`, () => {
    // 450-700 nm spans four mercury lines; none of them is folded into it.
    const { source, elements } = lamp();
    const continuum = beside('sclaser', { scMin: 450, scMax: 700 });
    const { bins } = read(sensor, [...elements, continuum]);
    assert.ok(Math.abs(assertLampLines(from(bins, source), name) - lampAlone(sensor)) < 1e-9);
    const band = from(bins, continuum);
    assert.ok(band.length >= 48 && band.every(bin => bin.continuum));
    assert.ok(Math.abs(power(band) - 1) < 1e-9, `the whole continuum arrives (${power(band)})`);
    assert.ok(Math.abs(band[0].wavelength - 450) < 0.1 && Math.abs(band[band.length - 1].wavelength - 700) < 0.1,
      `band spans ${band[0].wavelength}-${band[band.length - 1].wavelength} nm`);
    // Flat: every interior sample has the same density.
    const interior = band.slice(1, -1).map(bin => bin.power / bin.widthNm);
    const mean = interior.reduce((sum, value) => sum + value, 0) / interior.length;
    assert.ok(interior.every(value => Math.abs(value / mean - 1) < 1e-6), 'the band is flat');
  });

  test(`${name}: a lamp beside a filtered profile keeps its lines, and the profile its cut`, () => {
    // A longpass at the centre of a Gaussian leaves its red half: a sampled
    // profile, on a path the lamp does not take.
    const { source, elements } = lamp();
    const laser = beside('pulsedlaser', { transformLimited: false, bandwidth: 20, wavelength: 800 });
    const filter = place('filter', 350, 270, { ftype: 'longpass', cutoff: 800, length: 16 });
    const { bins } = read(sensor, [...elements, laser, filter]);
    assert.ok(Math.abs(assertLampLines(from(bins, source), name) - lampAlone(sensor)) < 1e-9, 'the filter is not in the lamp path');
    const kept = from(bins, laser);
    assert.ok(kept.length >= 48 && kept.every(bin => bin.continuum));
    assert.ok(Math.abs(power(kept) - 0.5) < 1e-3, `half the pulse passes (${power(kept)})`);
    assert.ok(kept[0].wavelength >= 800 - 1e-9, `nothing below the cutoff (${kept[0].wavelength})`);
    const density = bin => bin.power / bin.widthNm;
    assert.ok(density(kept[1]) > density(kept[kept.length - 2]), 'falls away from the cut edge');
  });

  test(`${name}: lamp and laser are weighed by their watts, the lamp's shares unchanged`, () => {
    // 1 W of lamp, of which a fraction reaches the sensor, against 3 W of
    // laser: the balance moves, the total and the lamp's own ratios do not.
    const { source, elements } = lamp({ avgPowerW: 1 });
    const laser = beside('cwlaser', { wavelength: 633, avgPowerW: 3 });
    const { reading, bins } = read(sensor, [...elements, laser]);
    const lampPart = assertLampLines(from(bins, source), name);
    const laserPart = power(from(bins, laser));
    const arriving = lampAlone(sensor);
    assert.ok(Math.abs(laserPart / lampPart - 3 / arriving) < 1e-6, `laser to lamp ${laserPart / lampPart} vs ${3 / arriving}`);
    assert.ok(Math.abs(lampPart + laserPart - reading.signal) < 1e-9);
  });
}
