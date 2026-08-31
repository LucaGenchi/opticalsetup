import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';

const mW = watts => watts * 1000;

function beamLaser(x, y, watts, { width = 14, wavelength = 532 } = {}) {
  const laser = createElement('cwlaser', x, y);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = width;
  laser.params.wavelength = wavelength;
  if (watts != null) laser.params.avgPowerW = watts;
  return laser;
}

function ndFilter(x, y, transmission) {
  const filter = createElement('filter', x, y);
  filter.params.ftype = 'nd';
  filter.params.trans = transmission;
  return filter;
}

function readPower(elements, meter) {
  traceAll(elements);
  return enhancedReading(meter, elements);
}

test('a power meter reads the source power that actually reaches it', () => {
  const meter = createElement('powermeter', 300, 0);
  meter.params.aperture = 60;
  const laser = beamLaser(0, 0, 0.1);
  assert.equal(Math.round(mW(readPower([laser, meter], meter).detectedPowerW)), 100);
});

test('every transmission between source and meter is carried into the reading', () => {
  const meter = createElement('powermeter', 320, 0);
  meter.params.aperture = 60;
  const elements = [beamLaser(0, 0, 0.1), ndFilter(120, 0, 0.5), ndFilter(200, 0, 0.25), meter];
  // 100 mW x 0.5 x 0.25: the efficiency chain multiplies, it is not averaged.
  assert.ok(Math.abs(mW(readPower(elements, meter).detectedPowerW) - 12.5) < 1e-6);
});

test('several sources reaching one meter add up', () => {
  const meter = createElement('powermeter', 400, 0);
  meter.params.aperture = 120;
  const elements = [beamLaser(0, -30, 0.1), beamLaser(0, 30, 0.05), meter];
  assert.equal(Math.round(mW(readPower(elements, meter).detectedPowerW)), 150);
});

// The regression this whole model replaced: the reading used to be the mean
// of every source's power field across the entire scene, so light that never
// touched this meter still moved its number.
test('a source that never reaches the meter does not change its reading', () => {
  const meter = createElement('powermeter', 300, 0);
  meter.params.aperture = 60;
  const laser = beamLaser(0, 0, 0.1);
  const alone = mW(readPower([laser, meter], meter).detectedPowerW);

  const elsewhere = beamLaser(0, 600, 0.05);
  const withBystander = mW(readPower([laser, elsewhere, meter], meter).detectedPowerW);
  assert.equal(Math.round(withBystander), Math.round(alone),
    'an unrelated laser aimed away from the meter must not alter it');

  // A point source has no power field at all. It used to count in the
  // denominator of the scene-wide mean and halve this reading.
  const pointSource = createElement('pointsource', 0, 600);
  const withPointSource = mW(readPower([laser, pointSource, meter], meter).detectedPowerW);
  assert.equal(Math.round(withPointSource), Math.round(alone),
    'an unrelated point source must not alter it either');
});

test('a specimen signal is charged to the laser that pumped it, not the specimen', () => {
  const laser = beamLaser(0, 0, 0.1, { width: 12, wavelength: 488 });
  const focus = createElement('lens', 150, 0);
  focus.params.f = 60;
  focus.params.dia = 25;
  const slide = createElement('sample', 210, 0);
  slide.rot = 90;
  slide.params.specimenType = 'linear';
  slide.params.transmitExc = true;
  slide.params.transmission = 0.9;
  slide.params.aperture = 44;
  slide.params.channels = [{
    kind: 'fluor', wl: 520, eff: 0.35, epi: false, epiRatio: 0.15, autoWl: false,
    autoColor: true, color: '#22c55e', material: 'lipid', fluorophore: 'custom',
    retardance: 90, axis: 45, transferEff: 0.1, requireOverlap: true,
  }];
  const collect = createElement('lens', 285, 0);
  collect.params.f = 55;
  collect.params.dia = 50;
  const longpass = createElement('filter', 345, 0);
  longpass.params.ftype = 'longpass';
  longpass.params.cutoff = 500;
  longpass.params.length = 50;
  const meter = createElement('powermeter', 440, 0);
  meter.params.aperture = 40;

  const elements = [laser, focus, slide, collect, longpass, meter];
  const enhanced = readPower(elements, meter);
  const raw = detectorReading(meter.id);

  // Only the emission gets through the longpass.
  assert.equal(Math.round(raw.wavelength), 520);
  // A specimen relabels sourceId when it emits, so without a separate origin
  // id this light would be attributed to the slide -- which has no power
  // rating -- and the meter would report no watts at all.
  assert.deepEqual(raw.sourceFractions.map(entry => entry.sourceId), [laser.id]);
  assert.ok(enhanced.detectedPowerW > 0, 'fluorescence must still carry attributable power');
  // Faint, but a real fraction of the pump rather than a fraction of nothing.
  assert.ok(enhanced.detectedPowerW < 0.01);
  assert.ok(Math.abs(enhanced.detectedPowerW - 0.1 * raw.sourceFractions[0].fraction) < 1e-12);
});

test('watts are withheld when nothing arriving carries a power rating', () => {
  const source = createElement('pointsource', 60, 40);
  const lens = createElement('lens', 140, 40);
  lens.params.f = 60;
  lens.params.dia = 40;
  const meter = createElement('powermeter', 320, 40);
  meter.params.aperture = 160;
  const enhanced = readPower([source, lens, meter], meter);
  assert.equal(enhanced.detectedPowerW, null);
  assert.equal(enhanced.powerIsEstimated, false);
});

test('a partly-rated arrival reports the rated part and says so', () => {
  const laser = beamLaser(0, -40, 0.1, { width: 10 });
  const pointSource = createElement('pointsource', 60, 40);
  const lens = createElement('lens', 140, 40);
  lens.params.f = 60;
  lens.params.dia = 40;
  const meter = createElement('powermeter', 320, 0);
  meter.params.aperture = 160;

  const enhanced = readPower([laser, pointSource, lens, meter], meter);
  const raw = detectorReading(meter.id);
  assert.equal(raw.sourceFractions.length, 2, 'both sources should reach this meter');
  // The laser's contribution is reported in full...
  assert.equal(Math.round(mW(enhanced.detectedPowerW)), 100);
  // ...and the reading is flagged as a floor, because the point source that
  // also landed here carries no power rating to add.
  assert.equal(enhanced.powerCoversAllArrivals, false);
});
