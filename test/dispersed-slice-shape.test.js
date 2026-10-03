// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// A dispersive element fans a broadband beam into wavelength samples, each
// standing for a slice of the spectrum. Two things have to hold for a
// Gaussian (or already filtered) beam:
//
//   the slice's power   A sample carries the power its slice holds, not the
//                       spectrum's height at the sample's wavelength: by
//                       height, the centre of five samples took 60 % where
//                       its slice holds 55 %.
//
//   the slice's shape   The spectrum is not flat across a slice, so a filter
//                       cutting one takes the power that part really holds.
//                       Cut by width, a band between two samples read up to
//                       80 % wrong.

import assert from 'node:assert/strict';
import test from 'node:test';
import '../sketch/js/detector-instruments.js';
import '../sketch/js/etalon.js';
import { createElement } from '../sketch/js/elements.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';
import { gaussianSpectrum, spectrumPower, spectrumSupport } from '../sketch/js/spectrum.js';

const SPEC = gaussianSpectrum(800, 60);
const [LO, HI] = spectrumSupport(SPEC);
// The share of the 800/60 nm line between a and b, on the model's own profile.
const share = (a, b) => spectrumPower(SPEC, Math.max(a, LO), Math.min(b, HI)) / spectrumPower(SPEC, LO, HI);

const gaussian = () => {
  const src = createElement('pulsedlaser', 0, 0);
  Object.assign(src.params, { beamMode: 'line', wavelength: 800, transformLimited: false, bandwidth: 60 });
  return src;
};
const continuum = () => {
  const src = createElement('sclaser', 0, 0);
  Object.assign(src.params, { beamMode: 'line', scMin: 700, scMax: 900 });
  return src;
};
const lamp = () => {
  const src = createElement('cwlaser', 0, 0);
  Object.assign(src.params, { beamMode: 'line', wavelength: 800 });
  return src;
};

// The first order of a 600 l/mm grating, with an element in it and a detector
// wide enough for the whole fan.
const ANGLE = Math.atan2(2880, -5264);
const along = (type, distance, params = {}) => {
  const el = createElement(type, 200 + distance * Math.cos(ANGLE), distance * Math.sin(ANGLE));
  el.rot = ANGLE * 180 / Math.PI;
  Object.assign(el.params, params);
  return el;
};
function afterGrating(source, element) {
  const grating = createElement('grating', 200, 0);
  Object.assign(grating.params, { lines: 600, orders: '1' });
  const det = along('detector', 300, { aperture: 300 });
  traceScene([source, grating, ...(element ? [element] : []), det]);
  return detectorReading(det.id)?.signal ?? 0;
}
// Glass fans the samples without separating them: a rod at normal incidence.
function afterGlass(source, element) {
  const glass = createElement('glassrod', 250, 0);
  Object.assign(glass.params, { rodlen: 100, dia: 20, material: 'nbk7' });
  const det = createElement('detector', 700, 0);
  det.params.aperture = 40;
  if (element) Object.assign(element, { x: 450, y: 0, rot: 0 });
  traceScene([source, glass, ...(element ? [element] : []), det]);
  return detectorReading(det.id)?.signal ?? 0;
}
const bandpass = (center, band) => along('filter', 150, { ftype: 'bandpass', center, band, length: 300 });

test('a bandpass behind a grating takes the power its band holds, wherever it sits', () => {
  // On the peak, between two samples, across several, and out in the tail.
  for (const [center, band] of [[800, 10], [780, 10], [760, 20], [800, 60], [830, 30], [850, 20]]) {
    const expected = share(center - band / 2, center + band / 2);
    const traced = afterGrating(gaussian(), bandpass(center, band));
    assert.ok(Math.abs(traced - expected) <= 1e-3 * expected + 1e-5,
      `${center} ± ${band / 2} nm: ${traced} vs ${expected}`);
  }
});

test('glass-fanned samples are cut by the same rule', () => {
  const whole = afterGlass(gaussian(), null);
  for (const [center, band] of [[800, 10], [780, 10], [830, 30]]) {
    const filter = createElement('filter', 0, 0);
    Object.assign(filter.params, { ftype: 'bandpass', center, band });
    const expected = share(center - band / 2, center + band / 2);
    const traced = afterGlass(gaussian(), filter) / whole;
    assert.ok(Math.abs(traced - expected) <= 1e-3 * expected + 1e-5,
      `${center} ± ${band / 2} nm: ${traced} vs ${expected}`);
  }
});

test('the parts a slice is cut into add up to the slice', () => {
  // A longpass and a shortpass at the same wavelength, and a notch with its
  // matching bandpass, each split the fan without losing any of it. 813 nm
  // and 790-797 nm lie inside single samples' slices.
  const whole = afterGrating(gaussian(), null);
  assert.ok(Math.abs(whole - 1) < 1e-9, `the first order carries ${whole}`);
  const filter = params => along('filter', 150, { length: 300, ...params });
  const long = afterGrating(gaussian(), filter({ ftype: 'longpass', cutoff: 813 }));
  const short = afterGrating(gaussian(), filter({ ftype: 'shortpass', cutoff: 813 }));
  assert.ok(Math.abs(long + short - whole) < 1e-9, `longpass + shortpass ${long + short}`);
  assert.ok(Math.abs(long - share(813, HI)) < 1e-3, `longpass ${long} vs ${share(813, HI)}`);
  const pass = afterGrating(gaussian(), filter({ ftype: 'bandpass', center: 793.5, band: 7 }));
  const stop = afterGrating(gaussian(), filter({ ftype: 'notch', center: 793.5, band: 7 }));
  assert.ok(Math.abs(pass + stop - whole) < 1e-9, `bandpass + notch ${pass + stop}`);
});

test('a flat band, a single line and an uncut fan are unchanged', () => {
  // A flat band's slices are flat: a filter takes them by width, exactly.
  for (const [center, band] of [[800, 10], [780, 10], [830, 30]]) {
    const traced = afterGrating(continuum(), bandpass(center, band));
    assert.ok(Math.abs(traced - band / 200) < 1e-9, `flat ${center} ± ${band / 2}: ${traced}`);
  }
  // A single wavelength has no slice to cut.
  assert.equal(afterGrating(lamp(), bandpass(800, 10)), 1);
  assert.equal(afterGrating(lamp(), bandpass(780, 10)), 0);
  // A band wider than the whole Gaussian passes all of it.
  assert.ok(Math.abs(afterGrating(gaussian(), bandpass(800, 400)) - 1) < 1e-9);
  // One clear of it passes none.
  assert.equal(afterGrating(gaussian(), bandpass(1000, 20)), 0);
});

test('an etalon passes the same share of a Gaussian whether or not glass fanned it first', () => {
  // On the whole beam the Airy comb is averaged over the Gaussian. Behind
  // glass it is averaged over each sample's slice, weighted by the same
  // profile, so the slices together give the same answer. Averaged flat
  // across each slice, they read 3.7 % high.
  const etalon = params => {
    const el = createElement('etalon', 450, 0);
    Object.assign(el.params, params);
    return el;
  };
  const direct = params => {
    const det = createElement('detector', 700, 0);
    det.params.aperture = 40;
    traceScene([gaussian(), etalon(params), det]);
    return detectorReading(det.id)?.signal ?? 0;
  };
  const whole = afterGlass(gaussian(), null);
  for (const params of [{}, { centerWavelength: 790, fsr: 7, bandwidth: 0.5 }, { centerWavelength: 815, fsr: 40, bandwidth: 4 }]) {
    const unfanned = direct(params);
    const fanned = afterGlass(gaussian(), etalon(params)) / whole;
    assert.ok(unfanned > 0.01, `the etalon passes something (${unfanned})`);
    assert.ok(Math.abs(fanned - unfanned) <= 1e-3 * unfanned, `${JSON.stringify(params)}: ${fanned} vs ${unfanned}`);
  }
});

// A straight line of elements on the axis, read by a detector at 700 mm.
function inLine(source, elements) {
  const det = createElement('detector', 700, 0);
  det.params.aperture = 40;
  traceScene([source, ...elements, det]);
  return detectorReading(det.id)?.signal ?? 0;
}
const onAxis = (type, x, params = {}) => {
  const el = createElement(type, x, 0);
  Object.assign(el.params, params);
  return el;
};

test('a slice keeps its profile through a pulse shaper', () => {
  // A +1 grating layer and a -1 layer of the same pitch fan the band out and
  // bring it back onto the axis, still as slices. A filter behind the shaper
  // has to cut them as it cuts any other.
  const shaper = () => onAxis('slm', 250, {
    transmissive: true,
    layers: [{ type: 'grating', orders: '1', lines: 300 }, { type: 'grating', orders: '-1', lines: 300 }],
  });
  const whole = inLine(gaussian(), [shaper()]);
  assert.ok(Math.abs(whole - 1) < 1e-9, `the shaper passes ${whole}`);
  for (const [center, band] of [[800, 10], [780, 10], [830, 30]]) {
    const expected = share(center - band / 2, center + band / 2);
    const traced = inLine(gaussian(), [shaper(), onAxis('filter', 450, { ftype: 'bandpass', center, band })]);
    assert.ok(Math.abs(traced - expected) <= 1e-3 * expected + 1e-5,
      `${center} ± ${band / 2} nm: ${traced} vs ${expected}`);
  }
});

test('a slice keeps its bounds and its profile through an AOD', () => {
  // Glass fans the band; an AOD then steers each sample without fanning it
  // again. Declaring the sample a plain line there let a bandpass behind it
  // pass the centre sample's whole slice: 0.548 of the beam, not 0.156.
  const rod = () => onAxis('glassrod', 250, { rodlen: 100, dia: 20, material: 'nbk7' });
  const aod = () => onAxis('aod', 420, { centerDeflect: 0, scanRange: 0, designWavelength: 800, aperture: 30 });
  const whole = inLine(gaussian(), [rod(), aod()]);
  assert.ok(whole > 0.5, `light reaches the detector through the AOD (${whole})`);
  for (const [center, band] of [[800, 10], [780, 10], [830, 30]]) {
    const expected = share(center - band / 2, center + band / 2);
    const traced = inLine(gaussian(), [rod(), aod(), onAxis('filter', 550, { ftype: 'bandpass', center, band })]) / whole;
    assert.ok(Math.abs(traced - expected) <= 1e-3 * expected + 1e-5,
      `${center} ± ${band / 2} nm: ${traced} vs ${expected}`);
  }
  // A single line through the same AOD is still a line: passed or blocked whole.
  const line = filter => inLine(lamp(), [aod(), ...(filter ? [filter] : [])]);
  assert.equal(line(onAxis('filter', 550, { ftype: 'bandpass', center: 800, band: 10 })), line(null));
  assert.equal(line(onAxis('filter', 550, { ftype: 'bandpass', center: 780, band: 10 })), 0);
});

test('a lamp through one or two AODs keeps its lines, with nothing between them', () => {
  // A lamp's bandwidth is only the span of its lines. An AOD used to hand
  // each line a slice reaching into the dark gaps on either side, so a filter
  // behind it found light where the lamp emits none and too little on a line.
  const read = (aods, filter) => {
    const source = createElement('pointsource', 175, 200);
    Object.assign(source.params, { sourceKind: 'lamp', lampType: 'hg', spread: 360, nrays: 24 });
    const mirror = createElement('oap', 150, 200);
    mirror.rot = 180;
    Object.assign(mirror.params, { length: 110, f: 25 });
    const elements = [source, mirror];
    for (let i = 0; i < aods; i++) {
      const aod = createElement('aod', 300 + 60 * i, 200);
      Object.assign(aod.params, { centerDeflect: 0, scanRange: 0, aperture: 100 });
      elements.push(aod);
    }
    if (filter) {
      const el = createElement('filter', 450, 200);
      Object.assign(el.params, { length: 200, ftype: 'bandpass', ...filter });
      elements.push(el);
    }
    const det = createElement('detector', 600, 200);
    det.params.aperture = 200;
    traceScene([...elements, det]);
    return detectorReading(det.id)?.signal ?? 0;
  };
  const onLine = read(0, { center: 546, band: 4 });
  assert.ok(onLine > 0.1, `the 546 nm line reaches the detector (${onLine})`);
  for (const aods of [1, 2]) {
    assert.ok(Math.abs(read(aods, null) - read(0, null)) < 1e-12, `${aods} AOD(s): the whole lamp`);
    // No mercury line lies within 500 ± 1 nm.
    assert.equal(read(aods, { center: 500, band: 2 }), 0, `${aods} AOD(s): nothing between the lines`);
    assert.ok(Math.abs(read(aods, { center: 546, band: 4 }) - onLine) < 1e-12, `${aods} AOD(s): the 546 nm line`);
  }
});
