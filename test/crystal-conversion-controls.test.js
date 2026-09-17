import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, getDirectManipulation, registry } from '../sketch/js/elements.js';
import { detectorReading, supercontinuumReading, traceAll } from '../sketch/js/raytrace.js';
import { MAX_CONVERSION, MAX_OPO_DEPLETION, SC_MEDIA, supercontinuumRange } from '../sketch/js/parametric.js';
import { parseSketch } from '../sketch/js/state.js';

const crystalFrom = params => parseSketch(JSON.stringify({
  app: 'optics2d', version: 1,
  elements: [{ id: 'x', type: 'crystal', x: 0, y: 0, rot: 0, params }],
}), registry).elements[0];

function traceContinuum({ source = 'pulsedlaser', wavelength = 1035, crystal = {} } = {}) {
  const laser = createElement(source, 0, 0);
  Object.assign(laser.params, { beamMode: 'line', wavelength });
  const xtal = createElement('crystal', 150, 0);
  Object.assign(xtal.params, { convert: 'sc', efficiency: 0.5, transmitPump: false, ...crystal });
  const detector = createElement('detector', 300, 0);
  traceAll([laser, xtal, detector]);
  return { reading: detectorReading(detector.id), state: supercontinuumReading(xtal.id) };
}

test('the estimate reproduces the measured spectra it was built from', () => {
  for (const [medium, data] of Object.entries(SC_MEDIA)) {
    for (const [pump, blue] of data.blue) {
      assert.ok(Math.abs(supercontinuumRange(pump, medium).minNm - Math.min(blue, pump * 0.98)) < 1e-9, `${medium} blue at ${pump}`);
    }
    for (const [pump, red] of data.red) {
      assert.ok(Math.abs(supercontinuumRange(pump, medium).maxNm - red) < 1e-9, `${medium} red at ${pump}`);
    }
  }
});

test('a 1035 nm pump in YAG covers the near-infrared band a multiplex CARS bench uses', () => {
  // Vernuccio et al., Opt. Express 30, 30135 (2022): 10 mm YAG, 1035 nm, 1050-1300 nm used.
  const band = supercontinuumRange(1035, 'yag');
  assert.ok(band.minNm < 1035 && band.maxNm > 1300, `${band.minNm}-${band.maxNm} nm`);
  assert.equal(band.extrapolated, false);
});

test('the estimate keeps its edges on either side of the pump and inside the medium', () => {
  for (const medium of Object.keys(SC_MEDIA)) {
    for (const pump of [250, 400, 700, 1035, 1600, 2500, 4000]) {
      const band = supercontinuumRange(pump, medium);
      assert.ok(band.minNm < pump && band.maxNm > pump, `${medium} at ${pump}: ${band.minNm}-${band.maxNm}`);
      assert.ok(band.minNm >= Math.min(SC_MEDIA[medium].transparentFromNm, pump * 0.98) - 1e-9, `${medium} at ${pump}`);
    }
  }
  assert.equal(supercontinuumRange(3000, 'caf2').extrapolated, true);
});

test('a pulsed pump draws the estimated band', () => {
  const { reading, state } = traceContinuum({ crystal: { scRange: 'estimate', scMedium: 'yag' } });
  const band = supercontinuumRange(1035, 'yag');
  assert.equal(state.state, 'estimate');
  const wls = reading.spectrum.filter(s => s.power > 0).map(s => s.wavelength);
  assert.ok(Math.min(...wls) >= band.minNm - 1 && Math.max(...wls) <= band.maxNm + 1, `${Math.min(...wls)}-${Math.max(...wls)}`);
  assert.ok(Math.max(...wls) > 1300, 'the near-infrared half is missing');
});

test('a continuous-wave beam starts no estimated continuum', () => {
  const { reading, state } = traceContinuum({ source: 'cwlaser', crystal: { scRange: 'estimate' } });
  assert.equal(state.state, 'cw');
  assert.ok(!reading?.spectrum?.some(s => s.power > 0 && Math.abs(s.wavelength - 1035) > 2), 'a CW beam made a continuum');
});

test('a manual range draws exactly the authored band, pulsed or not', () => {
  const { reading, state } = traceContinuum({ source: 'cwlaser', crystal: { scRange: 'manual', scMinNm: 900, scMaxNm: 1400 } });
  assert.equal(state.state, 'manual');
  const wls = reading.spectrum.filter(s => s.power > 0).map(s => s.wavelength);
  assert.ok(Math.min(...wls) >= 899 && Math.max(...wls) <= 1401 && Math.max(...wls) > 1300);
});

test('saved supercontinuum crystals keep the band they always drew', () => {
  const legacy = crystalFrom({ convert: 'sc', efficiency: 0.4 });
  assert.equal(legacy.params.scRange, 'manual');
  assert.equal(legacy.params.scMinNm, 430);
  assert.equal(legacy.params.scMaxNm, 870);
  assert.equal(crystalFrom({ convert: 'shg' }).params.scRange, 'estimate');
  assert.equal(createElement('crystal', 0, 0).params.scRange, 'estimate');
});

test('OPO pump depletion is its own control, above the single-pass cap', () => {
  assert.ok(MAX_OPO_DEPLETION > MAX_CONVERSION);
  // Saved OPOs carried their figure in the shared efficiency field.
  assert.equal(crystalFrom({ convert: 'opo', efficiency: 0.35 }).params.opoDepletion, 0.35);
  assert.equal(crystalFrom({ convert: 'opo', efficiency: 0.9 }).params.opoDepletion, 0.9);
  assert.equal(crystalFrom({ convert: 'opo', efficiency: 0.35, opoDepletion: 0.8 }).params.opoDepletion, 0.8);

  const laser = createElement('cwlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'line', wavelength: 532 });
  const xtal = createElement('crystal', 150, 0);
  Object.assign(xtal.params, { convert: 'opo', pumpWl: 532, signalWl: 800, opoDepletion: 0.9, efficiency: 0.2, transmitPump: true });
  const detector = createElement('detector', 300, 0);
  traceAll([laser, xtal, detector]);
  const pump = detectorReading(detector.id).spectrum
    .filter(s => Math.abs(s.wavelength - 532) < 1).reduce((sum, s) => sum + s.power, 0);
  assert.ok(Math.abs(pump - 0.1) < 1e-9, `residual pump ${pump}`);
});

test('the crystal handle tunes whichever figure the mode shows', () => {
  const xtal = createElement('crystal', 0, 0);
  xtal.params.convert = 'opo';
  assert.equal(getDirectManipulation(xtal).tune.key, 'opoDepletion');
  xtal.params.convert = 'shg';
  assert.equal(getDirectManipulation(xtal).tune.key, 'efficiency');
  const show = key => registry.crystal.params.find(p => p.key === key).show;
  assert.equal(show('efficiency')({ convert: 'opo' }), false);
  assert.equal(show('opoDepletion')({ convert: 'opo' }), true);
});
