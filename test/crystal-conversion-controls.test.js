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

// Transcribed separately from the table in parametric.js, from Dubietis et al.,
// Lith. J. Phys. 57, 113 (2017), section 5, so a slip in either shows up here.
const REPORTED = [
  // medium, pump nm, blue nm, red nm, red limited by the detector
  ['yag', 515, 390, 625, false],      // "When pumped in the visible spectral range (515 nm) ... (390–625 nm)"
  ['yag', 800, 420, 1600, false],     // "(420–1600 nm, with 800 nm pumping)"
  ['yag', 2000, 510, 2500, true],     // "from 510 nm to more than 2.5 μm ... at 2 μm"
  ['yag', 2150, 450, 2500, true],     // "from 450 nm to more than 2.5 μm with 32 fs pulses at 2.15 μm"
  ['sapphire', 400, 350, 700, false], // "(400 nm), the SC spectrum in the 350–700 nm range"
  ['sapphire', 515, 340, 650, false], // "(515 nm) ... from 340 to 650 nm"
  ['sapphire', 800, 410, 1100, false],// "from 410 to 1100 nm ... around 800 nm"
  ['sapphire', 2000, 470, 2500, true],// "from 470 nm to more than 2.5 μm ... at 2 μm"
  ['fusedsilica', 594, 415, 720, false], // "from 415 to 720 nm ... at 594 nm"
  ['fusedsilica', 800, 390, 1000, false],// "extends from 390 to 1000 nm" with Ti:sapphire pumping
  ['caf2', 800, 300, 2000, false],    // "with 800 nm pumping ... from 300 nm to 2 μm ... in CaF2"
  ['caf2', 2100, 340, 3300, false],   // "(2.1 − 2.2 μm) ... span from 340 nm to 3.3 μm" in CaF2
  ['caf2', 2200, 340, 3300, false],
];

test('the estimate returns the reported spectra at the pumps they were reported for', () => {
  for (const [medium, pump, blue, red, atLeast] of REPORTED) {
    const band = supercontinuumRange(pump, medium);
    assert.equal(band.state, 'estimate', `${medium} at ${pump}`);
    assert.equal(band.minNm, blue, `${medium} blue at ${pump}`);
    assert.equal(band.maxNm, red, `${medium} red at ${pump}`);
    assert.equal(band.measured, true, `${medium} at ${pump} is a reported pump`);
    assert.equal(band.redAtLeast, atLeast, `${medium} red bound at ${pump}`);
  }
  // YAG's blue cut-off holds near 530 nm across 1.1–1.6 µm pumping.
  for (const pump of [1100, 1300, 1600]) assert.equal(supercontinuumRange(pump, 'yag').minNm, 530);
});

test('a 1035 nm pump in YAG covers the near-infrared band a multiplex CARS bench uses', () => {
  // Vernuccio et al., Opt. Express 30, 30135 (2022): 10 mm YAG, 1035 nm, 1050–1300 nm used.
  const band = supercontinuumRange(1035, 'yag');
  assert.equal(band.state, 'estimate');
  assert.ok(band.minNm < 1035 && band.maxNm > 1300, `${band.minNm}-${band.maxNm} nm`);
  assert.equal(band.measured, false, 'no spectrum was reported at 1035 nm, so it is interpolated');
  assert.equal(band.redAtLeast, true, 'its red side leans on the detector-limited 2 µm anchor');
});

test('pumps outside the reported range of a medium get no estimate', () => {
  assert.deepEqual(supercontinuumRange(1035, 'fusedsilica'), { state: 'unsupported', fromNm: 594, toNm: 800 });
  assert.equal(supercontinuumRange(180, 'yag').state, 'unsupported', 'a pump YAG does not transmit');
  assert.equal(supercontinuumRange(2300, 'yag').state, 'unsupported');
  assert.equal(supercontinuumRange(2100, 'sapphire').state, 'unsupported', 'sapphire has no anchor past 2 µm');
});

test('inside the reported range both edges stay either side of the pump and inside the medium', () => {
  for (const [medium, data] of Object.entries(SC_MEDIA)) {
    const { fromNm, toNm } = supercontinuumRange(0, medium);
    for (let pump = fromNm; pump <= toNm; pump += 5) {
      const band = supercontinuumRange(pump, medium);
      assert.equal(band.state, 'estimate', `${medium} at ${pump}`);
      assert.ok(band.minNm < pump && band.maxNm > pump, `${medium} at ${pump}: ${band.minNm}-${band.maxNm}`);
      assert.ok(band.minNm >= data.transparentFromNm, `${medium} at ${pump}`);
    }
  }
});

test('a pulsed pump draws the estimated band', () => {
  const { reading, state } = traceContinuum({ crystal: { scRange: 'estimate', scMedium: 'yag' } });
  const band = supercontinuumRange(1035, 'yag');
  assert.equal(state.state, 'estimate');
  const wls = reading.spectrum.filter(s => s.power > 0).map(s => s.wavelength);
  assert.ok(Math.min(...wls) >= band.minNm - 1 && Math.max(...wls) <= band.maxNm + 1, `${Math.min(...wls)}-${Math.max(...wls)}`);
  assert.ok(Math.max(...wls) > 1300, 'the near-infrared half is missing');
});

test('a pump outside the reported range draws no estimated continuum', () => {
  const { reading, state } = traceContinuum({ wavelength: 1035, crystal: { scRange: 'estimate', scMedium: 'fusedsilica' } });
  assert.equal(state.state, 'unsupported');
  assert.ok(!reading?.spectrum?.some(s => s.power > 0 && Math.abs(s.wavelength - 1035) > 2), 'an unsupported pump made a continuum');
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

test('a new OPO is transform-limited at full depletion; a saved one keeps its set duration', () => {
  const fresh = createElement('crystal', 0, 0);
  assert.equal(fresh.params.outputPhase, 'transformLimited');
  assert.equal(fresh.params.opoDepletion, MAX_OPO_DEPLETION);
  const saved = crystalFrom({ convert: 'opo', efficiency: 0.3, pumpWl: 516, signalWl: 800 });
  assert.equal(saved.params.outputPhase, 'unknown');
  assert.equal(saved.params.opoDepletion, 0.3);
  // Only an OPO's efficiency was ever its depletion.
  const doubler = crystalFrom({ convert: 'shg', efficiency: 0.3 });
  assert.equal(doubler.params.opoDepletion, MAX_OPO_DEPLETION);
  assert.equal(doubler.params.outputPhase, 'transformLimited');
});

test('the OPO outputs readout gives bandwidth and duration on their own lines', () => {
  const readout = registry.crystal.params.find(p => p.key === 'opoWidths').readout;
  const run = outputPhase => {
    const laser = createElement('pulsedlaser', 0, 0);
    Object.assign(laser.params, { beamMode: 'line', wavelength: 516, pulseWidthFs: 2000, bandwidth: 0.5 });
    const xtal = createElement('crystal', 150, 0);
    Object.assign(xtal.params, {
      convert: 'opo', pumpWl: 516, signalWl: 800, linewidthMode: 'both', signalLinewidthCm: 10, idlerLinewidthCm: 10, outputPhase,
    });
    traceAll([laser, xtal, createElement('detector', 300, 0)]);
    return readout(xtal.params, xtal).split('\n');
  };
  const limited = run('transformLimited');
  assert.equal(limited.length, 4);
  assert.match(limited[0], /^Signal bandwidth [\d.]+ nm \(10 cm⁻¹\)$/);
  assert.match(limited[1], /^Signal duration [\d.]+ (fs|ps) \(transform limited\)$/);
  assert.match(limited[2], /^Idler bandwidth [\d.]+ nm \(10 cm⁻¹\)$/);
  assert.match(limited[3], /^Idler duration [\d.]+ (fs|ps) \(transform limited\)$/);
  const set = run('unknown');
  assert.equal(set[1], 'Signal duration 2 ps (chirped)');
  assert.equal(set[3], 'Idler duration 2 ps (chirped)');
});
