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
import '../sketch/js/detector-instruments.js';
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
  // The narrow path through zeroOrderPort: one order, always propagating.
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

// ---------------------------------------------------------------------------
// The spectrum, not just the total. Conserving power is necessary but not
// sufficient: light has to leave at wavelengths that were actually in it, and
// in the proportions the grating actually sends them.

// A gas-discharge lamp is a point emitter, so it needs collimating before it
// reaches anything dispersive. It is also the only source that arrives with a
// discrete spectrum AND a bandwidth -- resolveSourceSpectrum() reports the
// span of its lines as bw -- which is exactly what makes it the awkward case.
function lampThrough(layers, { detector = 'spectrometer' } = {}) {
  const src = createElement('pointsource', 0, 0);
  Object.assign(src.params, { sourceKind: 'lamp', lampType: 'hg', spread: 20, nrays: 9 });
  const lens = createElement('lens', 100, 0);
  Object.assign(lens.params, { f: 100, dia: 50.8 });
  const sh = createElement('slm', 260, 0);
  Object.assign(sh.params, { transmissive: true, layers });
  const det = createElement(detector, 420, 0);
  det.params.aperture = detector === 'spectrometer' ? 900 : 1400;
  traceAll([src, lens, sh, det], []);
  return detectorReading(det.id);
}

const HG_LINES = [365.0146, 404.6561, 435.8343, 546.074, 576.96, 579.066, 1014.0];

test('a lamp keeps its own lines when the ray budget is tightest', () => {
  // 21 orders leaves room for a single wavelength per order. A continuum can
  // answer that by coarsening its quadrature to one node at the centroid; a
  // lamp cannot -- its samples are real emission lines, and a centroid would
  // be a wavelength the light does not contain. Whatever survives the budget
  // must be lines the lamp actually emits.
  for (const n of [1, 3, 11, 21]) {
    const reading = lampThrough([{ type: 'grating', orders: orderList(n), lines: 20 }]);
    const seen = (reading?.spectrum ?? []).filter(s => s.power > 1e-6);
    assert.ok(seen.length > 0, `${n} orders produced no spectrum`);
    for (const peak of seen) {
      assert.ok(HG_LINES.some(nm => Math.abs(nm - peak.wavelength) < 1.5),
        `${n} orders reported ${peak.wavelength.toFixed(1)} nm, which is not a mercury line`);
    }
  }
});

test('a lamp through a wide order fan keeps most of its power', () => {
  // Seven lines across twenty-one orders is 147 rays against a cap of 24, so
  // this scene cannot be complete. It can still be far better than dropping
  // whichever rays were generated last: the budget keeps the brightest.
  const reference = lampThrough([], { detector: 'detector' }).signal;
  const wide = lampThrough([{ type: 'grating', orders: orderList(21), lines: 20 }],
    { detector: 'detector' }).signal;
  assert.ok(wide / reference > 0.3, `kept only ${(100 * wide / reference).toFixed(1)}% of the lamp`);
});

test('the zeroth order is reshaped when orders pass off inside the band', () => {
  // 400-800 nm on 1600 l/mm: the +-1 orders exist below 625 nm and are
  // evanescent above it, so the zeroth order keeps a third of the blue and
  // all of the red. It leaves as one polychromatic ray, so that has to show
  // up as a reshaped spectrum -- scaling by the band average alone would give
  // a spectrometer the right total with the incident colour balance.
  const measure = (lines, orders) => {
    const src = createElement('sclaser', 0, 0);
    Object.assign(src.params, { beamMode: 'line', scMin: 400, scMax: 800 });
    const g = createElement('grating', 150, 0);
    Object.assign(g.params, { transmissive: true, lines, orders });
    // A narrow aperture on axis sees the undiffracted order alone.
    const det = createElement('spectrometer', 300, 0);
    det.params.aperture = 20;
    traceAll([src, g, det], []);
    const reading = detectorReading(det.id);
    const bins = (reading?.spectrum ?? []).filter(s => s.power > 1e-9);
    const total = bins.reduce((sum, s) => sum + s.power, 0);
    const red = bins.filter(s => s.wavelength >= 625).reduce((sum, s) => sum + s.power, 0);
    return { signal: reading?.signal ?? 0, redFraction: red / total };
  };

  // 225 nm of blue at 1/3 against 175 nm of red at 1 puts 70% of what leaves
  // in the red half, up from the incident 43.6%.
  const shaped = measure(1600, '-1,0,1');
  assert.ok(Math.abs(shaped.signal - 0.625) < 1e-9, `total was ${shaped.signal}`);
  assert.ok(Math.abs(shaped.redFraction - 0.70) < 0.02,
    `zeroth order came out ${(100 * shaped.redFraction).toFixed(1)}% red, expected ~70%`);

  // Controls: with no order passing off inside the band the count is uniform,
  // the share is a plain 1/N, and the spectrum must be left alone.
  const flat = measure(800, '-1,0,1');
  const alone = measure(1600, '0');
  assert.ok(Math.abs(flat.signal - 1 / 3) < 1e-9);
  assert.ok(Math.abs(flat.redFraction - alone.redFraction) < 1e-9,
    'a uniform order count must not reshape the spectrum');
});

test('a coarsened order still knows what colours it carries', () => {
  // With enough orders the budget comes down to one spectral node per order,
  // and that node stands for the whole band -- only the direction has been
  // collapsed. If such a child claims to be monochromatic at the centroid,
  // every wavelength-selective element downstream believes it: a filter takes
  // its !ray.bw path and passes or blocks the entire order on one number.
  //
  // 400-800 nm through a 650 nm longpass should keep 150/400 = 0.375 of the
  // light. Main reports 0.0000 from nine orders up, having truncated away
  // every order carrying red.
  const measure = (orderCount, longpass) => {
    const src = createElement('sclaser', 0, 0);
    Object.assign(src.params, { beamMode: 'line', scMin: 400, scMax: 800 });
    const sh = createElement('slm', 150, 0);
    Object.assign(sh.params, {
      transmissive: true,
      layers: [{ type: 'grating', orders: orderList(orderCount), lines: 20 }],
    });
    const els = [src, sh];
    if (longpass) {
      const filter = createElement('filter', 300, 0);
      Object.assign(filter.params, { ftype: 'longpass', cutoff: 650, length: 400 });
      els.push(filter);
    }
    const det = createElement('detector', 420, 0);
    det.params.aperture = 2400;
    els.push(det);
    traceAll(els, []);
    return detectorReading(det.id)?.signal ?? 0;
  };

  for (const orderCount of [15, 21]) {
    // One ray per order carrying the colours that order really keeps, so the
    // filter integrates a spectrum instead of testing a single number. What
    // is left is the resolution of the grid the profile is rebuilt on, not a
    // whole order's worth of light.
    assert.ok(Math.abs(measure(orderCount, false) - 1) < 1e-9);
    assert.ok(Math.abs(measure(orderCount, true) - 0.375) < 0.005,
      `${orderCount} orders through a longpass gave ${measure(orderCount, true)}`);
  }

  // Between those and full sampling the budget allows two or three nodes per
  // order. Those are genuine spectral cells at genuinely different angles, so
  // they stay monochromatic and the answer carries the quadrature's own
  // coarseness -- but it must still be in the right part of the world, which
  // is what main was not.
  for (const orderCount of [5, 9, 11]) {
    const ratio = measure(orderCount, true) / measure(orderCount, false);
    assert.ok(ratio > 0.25 && ratio < 0.6,
      `${orderCount} orders through a longpass gave ratio ${ratio.toFixed(4)}`);
  }
});

test('a coarsened order carries only the colours it can diffract', () => {
  // 400-800 nm on 1600 l/mm: the +-1 orders pass off at 625 nm. When the
  // budget gives one ray per order, that ray covers the whole band, so which
  // colours it keeps cannot be decided at a single wavelength -- doing so
  // hands an order all of the band or none of it. Deciding at the centroid
  // (600 nm, where +-1 still propagate) left the zeroth order on a flat 1/3.
  const zerothOrder = orderCount => {
    const src = createElement('sclaser', 0, 0);
    Object.assign(src.params, { beamMode: 'line', scMin: 400, scMax: 800 });
    const sh = createElement('slm', 150, 0);
    Object.assign(sh.params, {
      transmissive: true,
      layers: [{ type: 'grating', orders: orderList(orderCount), lines: 1600 }],
    });
    const det = createElement('detector', 300, 0);
    det.params.aperture = 8; // narrow and on axis: the undiffracted order only
    traceAll([src, sh, det], []);
    return detectorReading(det.id)?.signal ?? 0;
  };
  // Below 625 nm three orders share the light and above it the zeroth order
  // has it to itself: 225/400 at a third plus 175/400 whole is 0.625.
  for (const orderCount of [15, 21]) {
    assert.ok(Math.abs(zerothOrder(orderCount) - 0.625) < 0.01,
      `${orderCount} orders put ${zerothOrder(orderCount)} in the zeroth order, expected 0.625`);
  }
});

test('equivalent order lists survive the cap identically', () => {
  // Two grating layers is the one stack that can still overrun the cap, and a
  // grating divides evenly, so the children that compete for the last slots
  // usually have identical intensity. Sorting on intensity alone leaves a
  // stable sort falling back to generation order -- which is the order the
  // list was typed in, so the same physical grating gave different answers.
  const readings = orders => {
    const src = createElement('sclaser', 0, 0);
    Object.assign(src.params, { beamMode: 'line', scMin: 400, scMax: 800 });
    const sh = createElement('slm', 150, 0);
    Object.assign(sh.params, {
      transmissive: true,
      layers: [{ type: 'grating', orders, lines: 20 }, { type: 'grating', orders, lines: 20 }],
    });
    // A fan of narrow detectors: a change in which directions survive shows
    // up as light moving between them, not just as a change in the total.
    const dets = [-120, -60, -25, 0, 25, 60, 120].map(y => {
      const det = createElement('detector', 320, y);
      det.params.aperture = 20;
      return det;
    });
    traceAll([src, sh, ...dets], []);
    return dets.map(det => Number((detectorReading(det.id)?.signal ?? 0).toFixed(9)));
  };
  const ascending = orderList(11);
  const descending = ascending.split(',').reverse().join(',');
  assert.deepEqual(readings(descending), readings(ascending),
    `"${ascending}" and "${descending}" are the same grating and must trace alike`);
});

test('a lamp line keeps its own weight, not a quadrature endpoint weight', () => {
  // wlSamples() halves the first and last sample's weight, which is the
  // trapezoid rule for a quadrature across a continuum. A lamp's lines are
  // not nodes of anything -- they are the emission -- and there is no
  // interval outside the outermost of them to take half of. Halving them
  // hands mercury's 365 and 1014 nm lines half the power they emit and
  // renormalising pushes it into the lines in between.
  //
  // On 1000 lines/mm at normal incidence only the 1014 nm line passes off,
  // so the zeroth order takes 1/3 of every other line and all of that one:
  // (0.6 + 0.5 + 1 + 1 + 0.4 + 0.4)/3 + 0.2, over 3.7, is 0.36585. The
  // trapezoid weighting gave 0.35135.
  const share = withGrating => {
    const src = createElement('pointsource', 0, 0);
    Object.assign(src.params, { sourceKind: 'lamp', lampType: 'hg', spread: 20, nrays: 9 });
    const lens = createElement('lens', 100, 0);
    Object.assign(lens.params, { f: 100, dia: 50.8 });
    const els = [src, lens];
    if (withGrating) {
      const g = createElement('grating', 260, 0);
      Object.assign(g.params, { transmissive: true, lines: 1000, orders: '-1,0,1' });
      els.push(g);
    }
    // Narrow and on axis, so only the undiffracted order reaches it. Taking
    // the ratio against the same scene without the grating cancels out how
    // much of the collimated fan the aperture happens to catch.
    const det = createElement('detector', 330, 0);
    det.params.aperture = 10;
    els.push(det);
    traceAll(els, []);
    return detectorReading(det.id)?.signal ?? 0;
  };
  const ratio = share(true) / share(false);
  assert.ok(Math.abs(ratio - 0.36585) < 1e-4,
    `zeroth order took ${ratio.toFixed(5)} of the lamp, expected 0.36585`);
});
