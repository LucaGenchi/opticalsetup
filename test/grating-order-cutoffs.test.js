// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// A diffraction order passes off at one wavelength: above it the order is
// evanescent and the orders still alive share its light. A wavelength sample
// stands for a cell of the spectrum, so when the cutoff falls inside a cell
// the order must take the part of the cell it propagates in -- not all of the
// cell or none of it, as judging at the sample's own wavelength gives.
//
// 1600 l/mm at normal incidence puts the +-1 cutoff at 625 nm.

import assert from 'node:assert/strict';
import test from 'node:test';
import '../sketch/js/detector-instruments.js';
import { createElement } from '../sketch/js/elements.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import { gaussianSpectrum, spectrumSupport, spectrumWeight } from '../sketch/js/spectrum.js';

const CUTOFF = 625;
const orderList = n => Array.from({ length: n }, (_, i) => i - (n >> 1)).join(',');

// A small aperture far down the axis sees the undiffracted order alone. A wide
// one 25 mm behind the grating sees every order out to 88.8 degrees: an order
// close to its cutoff leaves almost along the grating, and would miss a
// detector further away. (Closer than about 10 mm the detector meets the beam
// before the grating does.)
function reading({ source, type = 'sclaser', element, params, aperture }) {
  const src = createElement(type, 0, 0);
  Object.assign(src.params, { beamMode: 'line', ...source });
  const el = createElement(element, 150, 0);
  Object.assign(el.params, { transmissive: true, ...params });
  const det = createElement('detector', aperture > 100 ? 175 : 400, 0);
  det.params.aperture = aperture;
  traceAll([src, el, det], []);
  return detectorReading(det.id)?.signal ?? 0;
}

// The same three orders through the Grating, through a shaper layer at full
// sampling, and through a shaper layer whose 21 listed orders leave the ray
// budget one sample per order (only 0 and +-1 ever propagate at 1600 l/mm).
const paths = [
  ['grating', { element: 'grating', params: { lines: 1600, orders: '-1,0,1' } }],
  ['shaper, three orders', { element: 'slm', params: { layers: [{ type: 'grating', orders: orderList(3), lines: 1600 }] } }],
  ['shaper, one sample per order', { element: 'slm', params: { layers: [{ type: 'grating', orders: orderList(21), lines: 1600 }] } }],
];

test('the zeroth order of a flat band takes a third below the cutoff and all above it', () => {
  for (const [lo, hi] of [[400, 800], [500, 700], [550, 650], [610, 640], [600, 626]]) {
    const expected = ((CUTOFF - lo) / 3 + (hi - CUTOFF)) / (hi - lo);
    for (const [name, path] of paths) {
      const zero = reading({ ...path, source: { scMin: lo, scMax: hi }, aperture: 4 });
      assert.ok(Math.abs(zero - expected) < 1e-9, `${name}, ${lo}-${hi} nm: ${zero} vs ${expected}`);
      const all = reading({ ...path, source: { scMin: lo, scMax: hi }, aperture: 2400 });
      assert.ok(Math.abs(all - 1) < 1e-9, `${name}, ${lo}-${hi} nm: all orders carry ${all}`);
    }
  }
});

test('a lone diffracted order carries exactly the band below its cutoff', () => {
  // Nothing else is listed to take what it gives up, so the light above the
  // cutoff leaves in no order at all.
  for (const [lo, hi] of [[400, 800], [550, 650], [610, 640]]) {
    const first = reading({ element: 'grating', params: { lines: 1600, orders: '1' }, source: { scMin: lo, scMax: hi }, aperture: 2400 });
    const expected = (CUTOFF - lo) / (hi - lo);
    assert.ok(Math.abs(first - expected) < 1e-9, `${lo}-${hi} nm: ${first} vs ${expected}`);
  }
});

test('a band clear of the cutoff, or ending on it, is divided as before', () => {
  for (const [name, path] of paths) {
    // Wholly below: three live orders throughout.
    assert.ok(Math.abs(reading({ ...path, source: { scMin: 450, scMax: 600 }, aperture: 4 }) - 1 / 3) < 1e-12, `${name} below`);
    // Wholly above: only the zeroth order is left.
    assert.ok(Math.abs(reading({ ...path, source: { scMin: 650, scMax: 800 }, aperture: 4 }) - 1) < 1e-12, `${name} above`);
    // The band's end exactly on the cutoff cuts no cell.
    assert.ok(Math.abs(reading({ ...path, source: { scMin: 425, scMax: CUTOFF }, aperture: 4 }) - 1 / 3) < 1e-9, `${name} ending on the cutoff`);
  }
  // A single wavelength either side of the cutoff.
  const line = wavelength => reading({ type: 'cwlaser', element: 'grating', params: { lines: 1600, orders: '-1,0,1' }, source: { wavelength }, aperture: 4 });
  assert.ok(Math.abs(line(624) - 1 / 3) < 1e-12);
  assert.equal(line(626), 1);
});

test('a Gaussian line across the cutoff is shared by the light on each side of it', () => {
  // Reference: a dense integral of the model's own profile.
  const spec = gaussianSpectrum(600, 100);
  const [lo, hi] = spectrumSupport(spec);
  let above = 0, total = 0;
  const n = 200000;
  for (let i = 0; i <= n; i++) {
    const wl = lo + (hi - lo) * i / n;
    const w = spectrumWeight(spec, wl) * (i === 0 || i === n ? 0.5 : 1);
    total += w;
    if (wl > CUTOFF) above += w;
  }
  const expected = 1 / 3 + (2 / 3) * (above / total);
  const source = { wavelength: 600, transformLimited: false, bandwidth: 100 };
  // One sample per order: the band is integrated piece by piece.
  const coarse = reading({ ...paths[2][1], type: 'pulsedlaser', source, aperture: 4 });
  assert.ok(Math.abs(coarse - expected) < 2e-4, `one sample per order: ${coarse} vs ${expected}`);
  // Five samples: the cell holding the cutoff is split exactly, but the
  // samples' own weights are a five-point rule over the Gaussian, which sets
  // the accuracy. Judged at the sample wavelengths alone this read 0.466.
  for (const [name, path] of paths.slice(0, 2)) {
    const sampled = reading({ ...path, type: 'pulsedlaser', source, aperture: 4 });
    assert.ok(Math.abs(sampled - expected) < 0.02, `${name}: ${sampled} vs ${expected}`);
    const all = reading({ ...path, type: 'pulsedlaser', source, aperture: 2400 });
    assert.ok(Math.abs(all - 1) < 1e-9, `${name}: all orders carry ${all}`);
  }
});
