// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// A spectrometer looking straight at a discharge lamp shows the lamp's lines.
// The readout used to put a line spectrum on the same uniform grid it samples
// a continuum on, where a line counts only if a grid point lands within its
// nominal half-width: a mercury lamp read directly showed its 365 and 1014 nm
// lines alone, as a 75 % / 25 % "band", while the same lamp behind a glass rod
// (which hands each line on as its own ray) showed all seven correctly.

import assert from 'node:assert/strict';
import test from 'node:test';
import '../sketch/js/detector-instruments.js';
import { createElement } from '../sketch/js/elements.js';
import { LAMP_PRESETS } from '../sketch/js/lamps.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';

function readSpectrum(elements) {
  const spectrometer = createElement('spectrometer', 600, 200);
  spectrometer.params.aperture = 200;
  traceScene([...elements, spectrometer]);
  const reading = detectorReading(spectrometer.id);
  assert.ok(reading, 'light reaches the spectrometer');
  const bins = reading.spectrum.filter(bin => bin.power > 1e-9);
  return { reading, bins, total: bins.reduce((sum, bin) => sum + bin.power, 0) };
}

// A collimated lamp, optionally through a glass rod.
function lamp(lampType, glass) {
  // The shortest capture range: only the parabola receives the lamp directly, so the
  // beam measured downstream is the collimated one alone.
  const source = createElement('pointsource', 175, 200);
  Object.assign(source.params, { sourceKind: 'lamp', lampType, spread: 360, nrays: 24, captureRange: 110 });
  const mirror = createElement('oap', 150, 200);
  mirror.rot = 180;
  Object.assign(mirror.params, { length: 110, f: 25 });
  const elements = [source, mirror];
  if (glass) {
    const rod = createElement('glassrod', 300, 200);
    Object.assign(rod.params, { rodlen: 60, dia: 150, material: 'nbk7' });
    elements.push(rod);
  }
  return readSpectrum(elements);
}

// Every line of the preset, at its own wavelength (the readout keys to
// 0.1 nm), with its own share of the light and nothing anywhere else.
function assertPresetLines(lampType, { reading, bins, total }, label) {
  const lines = LAMP_PRESETS[lampType].lines;
  const weight = lines.reduce((sum, line) => sum + line.w, 0);
  assert.equal(bins.length, lines.length, `${label}: one bin per line (${bins.map(bin => bin.wavelength)})`);
  assert.ok(Math.abs(total - reading.signal) < 1e-9, `${label}: the lines add up to the signal (${total} vs ${reading.signal})`);
  const ordered = [...lines].sort((a, b) => a.nm - b.nm);
  ordered.forEach((line, index) => {
    const bin = bins[index];
    assert.ok(Math.abs(bin.wavelength - line.nm) <= 0.05 + 1e-9, `${label}: ${line.nm} nm line, got ${bin.wavelength}`);
    assert.ok(Math.abs(bin.power / total - line.w / weight) < 1e-9,
      `${label}: ${line.nm} nm share ${bin.power / total} vs ${line.w / weight}`);
    assert.equal(bin.continuum, false, `${label}: ${line.nm} nm is a line, not a band`);
  });
  assert.ok(Math.abs(reading.bandMin - ordered[0].nm) < 1e-9, `${label}: band starts at the first line`);
  assert.ok(Math.abs(reading.bandMax - ordered[ordered.length - 1].nm) < 1e-9, `${label}: band ends at the last line`);
}

test('a mercury lamp read directly shows every line with the preset shares', () => {
  assertPresetLines('hg', lamp('hg', false), 'direct');
});

test('the same lines and shares arrive behind glass', () => {
  const direct = lamp('hg', false), behind = lamp('hg', true);
  assertPresetLines('hg', behind, 'behind glass');
  assert.deepEqual(behind.bins.map(bin => bin.wavelength), direct.bins.map(bin => bin.wavelength));
  direct.bins.forEach((bin, index) => {
    assert.ok(Math.abs(bin.power / direct.total - behind.bins[index].power / behind.total) < 1e-9,
      `${bin.wavelength} nm: same share direct and behind glass`);
  });
});

test('every lamp preset reads its own lines directly', () => {
  // Includes sodium, whose D lines are 0.6 nm apart and still resolve.
  for (const lampType of Object.keys(LAMP_PRESETS)) {
    assertPresetLines(lampType, lamp(lampType, false), lampType);
  }
});

test('a single-line source is still one line carrying the whole signal', () => {
  const laser = createElement('cwlaser', 100, 200);
  const { reading, bins } = readSpectrum([laser]);
  assert.equal(bins.length, 1);
  assert.equal(bins[0].wavelength, Math.round(laser.params.wavelength * 10) / 10);
  assert.equal(bins[0].continuum, false);
  assert.ok(Math.abs(bins[0].power - reading.signal) < 1e-12);
});

test('a Gaussian is still a sampled curve: centred, symmetric, with its width', () => {
  const laser = createElement('pulsedlaser', 100, 200);
  Object.assign(laser.params, { transformLimited: false, bandwidth: 10 });
  const center = laser.params.wavelength;
  const { reading, bins, total } = readSpectrum([laser]);
  assert.ok(bins.length >= 48, `a curve, not a few stems (${bins.length})`);
  assert.ok(bins.every(bin => bin.continuum), 'every sample belongs to the band');
  assert.ok(Math.abs(total - reading.signal) < 1e-9, 'the curve integrates to the signal');
  const density = bin => bin.power / bin.widthNm;
  const peak = bins.reduce((best, bin) => (density(bin) > density(best) ? bin : best));
  assert.ok(Math.abs(peak.wavelength - center) < 0.5, `peak at ${peak.wavelength}, centre ${center}`);
  const centroid = bins.reduce((sum, bin) => sum + bin.wavelength * bin.power, 0) / total;
  assert.ok(Math.abs(centroid - center) < 0.1, `centroid ${centroid}`);
  const above = bins.filter(bin => density(bin) >= density(peak) / 2);
  const fwhm = above[above.length - 1].wavelength - above[0].wavelength;
  assert.ok(Math.abs(fwhm - 10) < 1, `FWHM ${fwhm} nm for a 10 nm Gaussian`);
});
