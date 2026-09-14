import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';

const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`);
};

function traceOpo({ pumpWl = 532, signalWl = 800, efficiency = 0.6, transmitPump = true } = {}) {
  const laser = createElement('cwlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'line', wavelength: pumpWl });
  const crystal = createElement('crystal', 150, 0);
  Object.assign(crystal.params, { convert: 'opo', pumpWl, signalWl, efficiency, transmitPump });
  const detector = createElement('detector', 300, 0);
  traceAll([laser, crystal, detector]);
  return detectorReading(detector.id);
}

function spectralLine(reading, wavelength, tolerance = 0.11) {
  return reading?.spectrum.find(sample => Math.abs(sample.wavelength - wavelength) <= tolerance);
}

test('legacy OPO crystal conserves power with a Manley-Rowe signal/idler split', () => {
  const pumpWl = 532;
  const signalWl = 800;
  const efficiency = 0.6;
  const idlerWl = 1 / (1 / pumpWl - 1 / signalWl);
  const reading = traceOpo({ pumpWl, signalWl, efficiency });
  const pump = spectralLine(reading, pumpWl);
  const signal = spectralLine(reading, signalWl);
  const idler = spectralLine(reading, idlerWl);

  assert.ok(pump && signal && idler, 'pump, signal, and idler all reach the detector');
  close(pump.power + signal.power + idler.power, 1);
  close(signal.power / idler.power, idlerWl / signalWl);
  close(signal.power * signalWl, idler.power * idlerWl,
    1e-8); // photon flux is proportional to P * lambda
});

test('degenerate OPO output is one finite ray carrying all converted power', () => {
  const reading = traceOpo({ signalWl: 1064, efficiency: 0.4 });
  const pump = spectralLine(reading, 532);
  const degenerate = spectralLine(reading, 1064);

  assert.ok(pump && degenerate);
  close(pump.power, 0.6);
  close(degenerate.power, 0.4);
  assert.equal(reading.samples, 2, 'coincident signal and idler are not duplicated');
  assert.ok(reading.spectrum.every(sample => Number.isFinite(sample.wavelength)
    && Number.isFinite(sample.power)));
});

test('an unphysical signal wavelength creates no converted output', () => {
  const transmitted = traceOpo({ signalWl: 532, efficiency: 0.8, transmitPump: true });
  assert.equal(transmitted.spectrum.length, 1);
  close(transmitted.spectrum[0].wavelength, 532, 0.11);
  close(transmitted.spectrum[0].power, 1);

  assert.equal(traceOpo({ signalWl: 400, efficiency: 0.8, transmitPump: false }), null,
    'with residual-pump transmission disabled, the invalid conversion is dark');

  const malformed = traceOpo({ signalWl: Infinity, efficiency: 0.8, transmitPump: true });
  assert.equal(malformed.spectrum.length, 1);
  assert.ok(malformed.spectrum.every(sample => Number.isFinite(sample.wavelength)
    && Number.isFinite(sample.power)), 'malformed settings cannot create non-finite rays');
});
