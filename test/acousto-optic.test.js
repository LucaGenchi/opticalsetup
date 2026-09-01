import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acoustoOpticShiftedWavelength, aodDeflectionDeg, aodScanPosition,
  aodAccessTimeUs, aodMaxScanRateKHz,
} from '../sketch/js/acousto-optic.js';
import { createElement, getElementMeta, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { detectorReading, traceAll, traceScene } from '../sketch/js/raytrace.js';

const closeTo = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
};

test('AOM, AOD, and AOTF share the acousto-optic palette subgroup', () => {
  for (const type of ['aom', 'aod', 'aotf']) {
    assert.equal(registry[type].category, 'Modulators');
    assert.equal(registry[type].paletteGroup, 'Acousto-optic');
  }
});

test('AOD deflection is set in degrees and scales with optical wavelength', () => {
  // theta = lambda f / v is linear in both, so reading it forwards from the
  // angles: the scan is linear in position, and a beam at twice the design
  // wavelength deflects twice as far.
  const params = { centerDeflect: 4, scanRange: 2, designWavelength: 532, order: 1 };
  closeTo(aodDeflectionDeg(params, 532, -0.5), 3);
  closeTo(aodDeflectionDeg(params, 532, 0), 4);
  closeTo(aodDeflectionDeg(params, 532, 0.5), 5);
  closeTo(aodDeflectionDeg(params, 1064, 0), 8);
  closeTo(aodDeflectionDeg(params, 266, 0), 2);
  closeTo(aodDeflectionDeg({ ...params, order: -1 }, 532, 0.5), -5);
  // A position beyond the scan is clamped rather than extrapolated.
  closeTo(aodDeflectionDeg(params, 532, 4), 5);
});

test('the defaults describe a deflector that could exist', () => {
  // theta = lambda f / v for TeO2 slow shear (v = 620 m/s), the standard
  // visible and near-infrared deflector material: 532 nm on an 80 MHz drive
  // gives 3.9 deg, and a 40 MHz bandwidth sweeps about 2 deg of that.
  const aod = createElement('aod', 0, 0);
  const teo2 = (wl, f) => 532e-9 * 0 + wl * 1e-9 * f * 1e6 / 620 * 180 / Math.PI;
  assert.ok(Math.abs(aod.params.centerDeflect - teo2(532, 80)) < 0.2,
    `centre default ${aod.params.centerDeflect} deg vs ${teo2(532, 80).toFixed(2)} for a real TeO2 device`);
  assert.ok(Math.abs(aod.params.scanRange - teo2(532, 40)) < 0.2,
    `scan default ${aod.params.scanRange} deg vs ${teo2(532, 40).toFixed(2)} across a 40 MHz band`);
  // Real deflectors reach a few degrees, never tens of them.
  const spec = key => registry.aod.params.find(p => p.key === key);
  assert.ok(spec('centerDeflect').max <= 30, 'the centre deflection ceiling stays plausible');
  assert.ok(spec('scanRange').max <= 15, 'the scan angle ceiling stays plausible');
  // Diffraction efficiency runs 50-80%, sometimes 90%.
  assert.ok(aod.params.eff >= 0.5 && aod.params.eff <= 0.9);
});

test('every scan drive stays inside the scan angle it was given', () => {
  const base = { centerDeflect: 4, scanRange: 2, designWavelength: 532, order: 1, scanFreqKHz: 1 };
  const period = 1 / (base.scanFreqKHz * 1e3);
  for (const scanMode of ['triangle', 'sawtooth', 'random']) {
    const params = { ...base, scanMode };
    // A sweep covers its whole range within one period; random addressing
    // needs many steps before it has visited both ends, so give each drive a
    // window that suits it rather than aliasing the sweeps across hundreds of
    // periods.
    const window = scanMode === 'random' ? 400 * period : period;
    let lowest = Infinity, highest = -Infinity;
    for (let step = 0; step < 400; step++) {
      const where = aodScanPosition(params, (step + 0.5) / 400 * window);
      lowest = Math.min(lowest, where);
      highest = Math.max(highest, where);
    }
    assert.ok(lowest >= -0.5 - 1e-9 && highest <= 0.5 + 1e-9,
      `${scanMode} left its scan range: ${lowest} to ${highest}`);
    assert.ok(highest - lowest > 0.7, `${scanMode} barely moved: ${highest - lowest}`);
  }
  // A static drive sits at the centre and does not move at all.
  assert.equal(aodScanPosition({ ...base, scanMode: 'static' }, 0), 0);
  assert.equal(aodScanPosition({ ...base, scanMode: 'static' }, 1), 0);
});

test('triangle retraces and sawtooth flies back', () => {
  const params = { scanMode: 'triangle', scanFreqKHz: 0.001 };
  closeTo(aodScanPosition(params, 0), -0.5);
  closeTo(aodScanPosition(params, 0.25), 0);
  closeTo(aodScanPosition(params, 0.5), 0.5);
  closeTo(aodScanPosition(params, 0.75), 0);
  closeTo(aodScanPosition(params, 1), -0.5);

  const saw = { scanMode: 'sawtooth', scanFreqKHz: 0.001 };
  closeTo(aodScanPosition(saw, 0), -0.5);
  closeTo(aodScanPosition(saw, 0.5), 0);
  assert.ok(aodScanPosition(saw, 0.999) > 0.49, 'runs to the top before flying back');
});

test('random addressing holds each spot, then jumps somewhere unpredictable', () => {
  const params = { scanMode: 'random', scanFreqKHz: 1 };  // one spot per millisecond
  // Held for the whole step: a real random-access deflector settles and dwells.
  const early = aodScanPosition(params, 0.0002);
  closeTo(aodScanPosition(params, 0.0008), early);
  // And redrawing the same instant twice must give the same angle, or the
  // beam would flicker at the frame rate instead of at the scan rate.
  closeTo(aodScanPosition(params, 0.0002), early);
  // The next step goes elsewhere.
  assert.notEqual(aodScanPosition(params, 0.0012), early);
  // Over many steps it covers the range without marching through it in order.
  const visited = Array.from({ length: 200 }, (_, i) => aodScanPosition(params, (i + 0.5) / 1000));
  assert.ok(Math.max(...visited) > 0.4 && Math.min(...visited) < -0.4, 'reaches both ends');
  const ascending = visited.filter((v, i) => i > 0 && v > visited[i - 1]).length;
  assert.ok(ascending > 60 && ascending < 140,
    `a sweep would step one way; random addressing should not (${ascending}/199 ascending)`);
});

test('AOD trace steers the efficient first order', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.wavelength = 532;

  const aod = createElement('aod', 150, 0);
  aod.params.zero = false;
  aod.params.centerDeflect = 4;
  aod.params.eff = 0.8;

  const detectorX = 300;
  const detectorFaceX = detectorX - 19;
  const detector = createElement('detector', detectorX,
    Math.tan(4 * Math.PI / 180) * (detectorFaceX - aod.x));

  traceAll([laser, aod, detector]);
  const reading = detectorReading(detector.id);
  assert.ok(reading);
  closeTo(reading.signal, 0.8);
  // A deflector does shift the optical carrier, but by far less than anything
  // here can show, so the wavelength is carried through untouched.
  closeTo(reading.wavelength, 532, 1e-9);
});

test('a broadband beam leaves an AOD as a wavelength-dependent angular fan', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.transformLimited = false;
  laser.params.wavelength = 532;
  laser.params.bandwidth = 40;
  const aod = createElement('aod', 150, 0);
  aod.params.zero = false;

  const outgoingAngles = traceAll([laser, aod])
    .filter(path => path.type === 'path' && path.pts.at(-2).x >= aod.x - 1e-6)
    .map(path => {
      const start = path.pts.at(-2), end = path.pts.at(-1);
      return Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
    });

  assert.ok(outgoingAngles.length >= 3, 'the broadband input should expand into spectral rays');
  assert.ok(Math.max(...outgoingAngles) - Math.min(...outgoingAngles) > 0.3,
    'different wavelengths should leave at visibly different angles');
});

test('AOD animated surfaces derive their scan position from simulated time', () => {
  const aod = createElement('aod');
  aod.params.scanMode = 'triangle';
  aod.params.scanFreqKHz = 0.001;
  aod._simulationTimeNs = 500e6;   // half a period of a 1 Hz sweep
  closeTo(registry.aod.surfaces(aod)[0].data.position, 0.5);
});

// ---------------- review findings ----------------

test('a broadband beam through an AOD stays a continuum, not a row of invented lines', () => {
  // An AOD sends every wavelength to its own angle, so the tracer fans a
  // broadband ray into quadrature nodes. Those nodes are a sampling of a
  // continuous spectrum; presented as discrete wavelengths they arrive at a
  // spectrometer as laser lines that were never in the source.
  const source = createElement('sclaser', 0, 0);
  Object.assign(source.params, { beamMode: 'beam', beamWidth: 6, scMin: 500, scMax: 600 });
  const aod = createElement('aod', 200, 0);
  Object.assign(aod.params, { centerDeflect: 0, scanRange: 0, eff: 0.9, zero: false });
  const spectrometer = createElement('spectrometer', 430, 0);
  spectrometer.params.aperture = 120;
  traceAll([source, aod, spectrometer]);
  const reading = detectorReading(spectrometer.id);
  const measured = reading.spectrum.filter(sample => sample.power > 1e-12);
  assert.ok(measured.length > 20, `expected a sampled band, got ${measured.length} samples`);
  assert.ok(measured.every(sample => sample.continuum),
    `${measured.filter(s => !s.continuum).length} node(s) reported as discrete lines`);
});

test('a single-wavelength beam through an AOD is still a line', () => {
  // The converse: the continuum flag must follow the source, not the element.
  const laser = createElement('cwlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'line', wavelength: 532 });
  const aod = createElement('aod', 200, 0);
  Object.assign(aod.params, { centerDeflect: 0, scanRange: 0, eff: 0.9, zero: false });
  const spectrometer = createElement('spectrometer', 430, 0);
  spectrometer.params.aperture = 120;
  traceAll([laser, aod, spectrometer]);
  const measured = detectorReading(spectrometer.id).spectrum.filter(s => s.power > 1e-12);
  assert.equal(measured.length, 1);
  assert.equal(measured[0].continuum, false);
});

test('a scanning AOD actually moves the beam as the simulation clock advances', () => {
  // The element is time-dependent, which is the whole point of it. If this
  // holds and the beam still does not move on canvas, the fault is in whether
  // the renderer re-traces -- see hasAodScan() in canvas.js's animateMotion.
  const laser = createElement('cwlaser', 80, 240);
  Object.assign(laser.params, { beamMode: 'line', wavelength: 532 });
  const aod = createElement('aod', 300, 240);
  Object.assign(aod.params, {
    centerDeflect: 8, scanRange: 12, scanMode: 'triangle', scanFreqKHz: 10, zero: false,
  });
  const screen = createElement('box', 560, 240);
  Object.assign(screen.params, { text: '', w: 3, h: 220, behavior: 'block' });

  const angleAt = simulationTimeNs => {
    const drawables = traceScene([laser, { ...aod, _simulationTimeNs: simulationTimeNs }, screen], []).drawables;
    const segment = drawables.filter(d => d.pts && d.pts.length > 1).pop();
    const start = segment.pts[0], end = segment.pts[segment.pts.length - 1];
    return Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI;
  };
  // 10 kHz triangle: one period is 100 us, starting at the bottom of the band.
  assert.ok(Math.abs(angleAt(0) - 2) < 1e-6, 'starts at the low end of the scan');
  assert.ok(Math.abs(angleAt(25000) - 8) < 1e-6, 'passes the centre deflection');
  assert.ok(Math.abs(angleAt(50000) - 14) < 1e-6, 'reaches the top of the scan');
  assert.ok(Math.abs(angleAt(100000) - 2) < 1e-6, 'and returns');
});


test('the scan rate ceiling is the one sound imposes', () => {
  // Access time is about 1.5 us per mm of aperture in TeO2 slow shear. A
  // catalogue device with a 20 mm aperture is quoted at 30 us, which is the
  // figure this reproduces -- and it is why published random-access cycle
  // rates sit around 40-170 kHz rather than in the megahertz.
  closeTo(aodAccessTimeUs(20), 30);
  closeTo(aodAccessTimeUs(5), 7.5);
  for (const aperture of [5, 10, 20]) {
    const rate = aodMaxScanRateKHz(aperture);
    assert.ok(rate > 20 && rate < 200,
      `a ${aperture} mm aperture implies ${rate.toFixed(0)} kHz, outside the published band`);
  }
  // Bigger aperture, more resolvable spots, slower scan: the trade-off is
  // the same slow sound wave seen from both ends.
  assert.ok(aodMaxScanRateKHz(20) < aodMaxScanRateKHz(5));

  const spec = registry.aod.params.find(p => p.key === 'scanFreqKHz');
  assert.ok(spec.max <= 200, `a ${spec.max} kHz ceiling is faster than any real deflector`);

  // The readout says when the requested rate outruns the crystal.
  const readout = registry.aod.params.find(p => p.key === 'aodAccess').readout;
  assert.match(readout({ aperture: 10, scanFreqKHz: 10 }), /15\.0 µs/);
  assert.doesNotMatch(readout({ aperture: 10, scanFreqKHz: 10 }), /outruns/);
  assert.match(readout({ aperture: 10, scanFreqKHz: 150 }), /outruns/);
});


test('the Modulators palette separates the families it actually has', () => {
  // Three kinds of modulator sit in this category and they work by entirely
  // different physics. The chopper belongs to neither family, so it is listed
  // on its own rather than under whichever heading happens to precede it.
  assert.equal(registry.chopper.paletteGroup, undefined);
  assert.equal(registry.eom.paletteGroup, 'Electro-optic');
  for (const type of ['aom', 'aod', 'aotf']) {
    assert.equal(registry[type].paletteGroup, 'Acousto-optic');
  }
  // Acousto-optic before electro-optic, by palette order.
  const orderOf = type => registry[type].paletteOrder ?? 100;
  assert.ok(Math.max(orderOf('aom'), orderOf('aod'), orderOf('aotf')) < orderOf('eom'));
});
