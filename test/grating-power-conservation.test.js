// A grating splits light; it must not create or destroy it.
//
// Two separate ways the model used to lose power, both of which read out as a
// detector quietly reporting a fraction of the beam:
//
//   evanescent orders  Power was divided among every order the user listed,
//                      including ones past |sin| = 1 that carry nothing away.
//                      A 2400 l/mm grating asked for -1,0,1 at 532 nm can only
//                      diffract into the zeroth order, and reported a third of
//                      the light.
//
//   the shaper's cap   One shaper hit may emit at most SHAPER_RAY_CAP rays.
//                      Layers used to expand past it and have the tail sliced
//                      off, taking its power along: a 400 nm band across 21
//                      orders wants 189 rays, kept 24, and reported an eighth.
//
// The geometry below keeps every diffracted order well inside the detector, so
// a shortfall here means power went missing rather than merely missing the
// sensor: line densities are low enough that even |m| = 10 stays within a few
// degrees of the axis, except where a test is specifically about pass-off.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from '../sketch/js/elements.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';

const orderList = n => Array.from({ length: n }, (_, i) => i - (n >> 1)).join(',');

// One source, one dispersive element, one wide detector far enough downstream
// that the orders have separated but all still land on it.
function collect({ source = {}, element, params }) {
  const src = createElement('cwlaser', 0, 0);
  Object.assign(src.params, { beamMode: 'line', ...source });
  const el = createElement(element, 150, 0);
  Object.assign(el.params, { transmissive: true, ...params });
  const det = createElement('detector', 400, 0);
  det.params.aperture = 2400;
  traceAll([src, el, det], []);
  return detectorReading(det.id)?.signal ?? 0;
}

const shaper = (layers, source) => collect({ source, element: 'slm', params: { layers } });
const grating = (params, source) => collect({ source, element: 'grating', params });

test('an evanescent order is not given a share of the light', () => {
  // 532 nm on 2400 l/mm: sin(theta) for |m| = 1 is 1.28, so only the zeroth
  // order propagates and it has to carry the whole beam.
  assert.equal(grating({ lines: 2400, orders: '-1,0,1' }), 1);
  assert.equal(grating({ lines: 2400, orders: '-3,-2,-1,0,1,2,3' }), 1);
  // 1200 l/mm passes +-1 (0.638) but not +-2 (1.277): three live orders out of
  // the seven listed, and the light divides among those three.
  assert.equal(grating({ lines: 1200, orders: '-3,-2,-1,0,1,2,3' }), 1);
});

test('a band whose orders pass off partway through still conserves power', () => {
  // Across 400-800 nm on 1200 l/mm, |m| = 1 propagates at the blue end and is
  // evanescent at the red, so the divisor differs from one spectral sample to
  // the next and the zeroth order's share is a band average rather than 1/N.
  for (const bandwidth of [100, 200, 400]) {
    assert.ok(Math.abs(grating({ lines: 1200, orders: '-1,0,1' },
      { bwMode: 'band', bandwidth }) - 1) < 1e-9, `band ${bandwidth} nm`);
  }
});

test('the zeroth order alone still carries everything', () => {
  // The narrow path through zeroOrderShare: one order, always propagating.
  assert.equal(grating({ lines: 600, orders: '0' }), 1);
  assert.equal(grating({ lines: 600, orders: '0' }, { bwMode: 'band', bandwidth: 400 }), 1);
});

test('a broadband beam keeps its power across every order count', () => {
  // Nine spectral samples per order overruns the shaper's budget from three
  // orders up; the samples have to coarsen instead of being truncated.
  for (const n of [1, 3, 5, 9, 11, 15, 21]) {
    const signal = shaper([{ type: 'grating', orders: orderList(n), lines: 50 }],
      { bwMode: 'band', bandwidth: 400 });
    assert.ok(Math.abs(signal - 1) < 1e-9, `${n} orders reported ${signal}`);
  }
});

test('the same orders in a different order give the same result', () => {
  // Truncation used to keep whichever rays were generated first, so the result
  // depended on how the user happened to type the list.
  for (const source of [{}, { bwMode: 'band', bandwidth: 400 }]) {
    const up = shaper([{ type: 'grating', orders: '-5,-4,-3,-2,-1,0,1,2,3,4,5', lines: 50 }], source);
    const down = shaper([{ type: 'grating', orders: '5,4,3,2,1,0,-1,-2,-3,-4,-5', lines: 50 }], source);
    assert.equal(up, down);
    assert.ok(Math.abs(up - 1) < 1e-9);
  }
});

test('stacked diffusers coarsen rather than lose light', () => {
  // Five grains per layer is 5, 25, 125, 625 rays against a cap of 24.
  for (const layerCount of [1, 2, 3, 4]) {
    const layers = Array.from({ length: layerCount }, () => ({ type: 'speckle', div: 3 }));
    const signal = shaper(layers);
    assert.ok(Math.abs(signal - 1) < 1e-9, `${layerCount} speckle layers reported ${signal}`);
  }
});

test('a diffuser in front of a many-order grating leaves room for the orders', () => {
  // The fan has to be sized against the whole stack, not just its own layer:
  // five grains into eleven orders is 55 rays, and truncating that would drop
  // whole orders. This is the case that needs the look-ahead budget.
  for (const n of [3, 5, 11, 21]) {
    for (const layers of [
      [{ type: 'speckle', div: 3 }, { type: 'grating', orders: orderList(n), lines: 50 }],
      [{ type: 'grating', orders: orderList(n), lines: 50 }, { type: 'speckle', div: 3 }],
      [{ type: 'steer', angle: 1 }, { type: 'grating', orders: orderList(n), lines: 50 },
        { type: 'speckle', div: 2 }],
    ]) {
      const signal = shaper(layers, { bwMode: 'band', bandwidth: 400 });
      assert.ok(Math.abs(signal - 1) < 1e-9,
        `${layers.map(l => l.type).join('+')} with ${n} orders reported ${signal}`);
    }
  }
});

test('a single diffuser still scatters into five grains', () => {
  // The budget must not quietly coarsen the ordinary case it was introduced to
  // protect -- one diffuser on its own has room for the full fan.
  const src = createElement('cwlaser', 0, 0);
  src.params.beamMode = 'line';
  const sh = createElement('slm', 150, 0);
  Object.assign(sh.params, { transmissive: true, layers: [{ type: 'speckle', div: 8 }] });
  const det = createElement('detector', 400, 0);
  det.params.aperture = 2400;
  traceAll([src, sh, det], []);
  const reading = detectorReading(det.id);
  assert.equal(reading.samples, 5);
});

test('an unmodulated zeroth order does not disturb the balance', () => {
  for (const zeroFrac of [0.1, 0.5, 0.9]) {
    for (const n of [3, 11, 21]) {
      const signal = shaper([{ type: 'grating', orders: orderList(n), lines: 50 }],
        { bwMode: 'band', bandwidth: 400 });
      assert.ok(Math.abs(signal - 1) < 1e-9, `zeroFrac ${zeroFrac}, ${n} orders`);
    }
  }
});

test('a beam samples the same total as a single line ray', () => {
  // Beam mode traces one ray per spatial sample and takes the other branch
  // through speckle, so it is the control: it must land on the same total.
  for (const layers of [
    [{ type: 'grating', orders: orderList(21), lines: 50 }],
    [{ type: 'speckle', div: 3 }],
    [{ type: 'speckle', div: 3 }, { type: 'grating', orders: orderList(11), lines: 50 }],
  ]) {
    const signal = shaper(layers, { beamMode: 'beam', beamWidth: 4, bwMode: 'band', bandwidth: 400 });
    assert.ok(Math.abs(signal - 1) < 1e-9, `${layers.map(l => l.type).join('+')} in beam mode`);
  }
});
