// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceScene, detectorReading, opaReading, mixReading, specimenIncidentWls } from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';

const el = (type, x, y, params = {}) => {
  const e = createElement(type, x, y); Object.assign(e.params, params); return e;
};
const laser = (y, wavelength, avgPowerW = 1) => el('cwlaser', 0, y, { wavelength, avgPowerW, beamMode: 'line' });
const fiber = (y, id, extra = {}) => ({
  id, kind: 'fiber', pts: [{ x: 100, y }, { x: 200, y }], propagate: true,
  width: 4, inputNA: 0.22, groupIndex: 1, lossDbPerM: 0,
  out0: { mode: 'diverge', na: 0.01 }, out1: { mode: 'diverge', na: 0.01 }, ...extra,
});

test('fiber-delivered colours drive crystal mixing and specimen excitation', () => {
  const a = laser(-18, 1030), b = laser(18, 800);
  const crystal = el('crystal', 300, 0, { convert: 'shg', mixEfficiency: 0.4, efficiency: 0.2, aperture: 80 });
  const meter = el('detector', 450, 0, { aperture: 120 });
  const elements = [a, b, crystal, meter];
  const fibers = [fiber(-18, 'a'), fiber(18, 'b')];
  traceScene(elements);
  const direct = detectorReading(meter.id).spectrum;
  traceScene(elements, fibers);
  assert.equal(mixReading(crystal.id).state, 'mixing');
  const transmitted = detectorReading(meter.id).spectrum;
  assert.deepEqual(transmitted.map(s => s.wavelength), direct.map(s => s.wavelength));
  for (let i = 0; i < direct.length; i++) assert.ok(Math.abs(direct[i].power - transmitted[i].power) < 1e-8);

  const sample = el('sample', 300, 0, { aperture: 80, specimenType: 'nonlinear', channels: [] });
  sample.rot = 90;
  traceScene([a, b, sample], fibers);
  assert.deepEqual(specimenIncidentWls(sample.id).map(Math.round).sort((x, y) => x - y), [800, 1030]);
  fibers[1].propagate = false;
  traceScene([a, b, sample], fibers);
  assert.deepEqual(specimenIncidentWls(sample.id).map(Math.round), [1030], 'a blocked fiber does not create excitation');
});

test('an OPA plans fiber-delivered pump and seed power after attenuation', () => {
  for (const seedLoss of [0, 10]) {
    const pump = laser(-18, 515), seed = laser(18, 780, 1e-6);
    const opa = el('opa', 300, 0, { signalWl: 780, gainBandwidthNm: 40, smallSignalGainDb: 40, maxDepletion: 0.5 });
    const meter = el('powermeter', 450, 18, { aperture: 10 });
    const elements = [pump, seed, opa, meter];
    traceScene(elements, [fiber(-18, 'pump'), fiber(18, 'seed', { lossDbPerM: seedLoss })]);
    const plan = opaReading(opa.id);
    assert.equal(plan.state, 'amplifying');
    assert.equal(plan.seeds.length, 1);
    assert.ok(!plan.unplannedInput);
    const expected = 0.01 * 10 ** (-seedLoss * 0.1 / 10);
    assert.ok(Math.abs(enhancedReading(meter, elements).detectedPowerW - expected) < 1e-8,
      'the final trace uses the same delivered seed power as the plan');
  }
});


test('nonlinear planning follows four chained fibers per colour', () => {
  const a = laser(-18, 1030), b = laser(18, 800);
  const crystal = el('crystal', 300, 0, { convert: 'shg', mixEfficiency: 0.4, efficiency: 0.2, aperture: 80 });
  const meter = el('detector', 450, 0, { aperture: 120 });
  const elements = [a, b, crystal, meter];
  const fibers = [-18, 18].flatMap(y => Array.from({ length: 4 }, (_, i) => fiber(y, `${y}-${i}`, {
    pts: [{ x: 100 + i * 25, y }, { x: 120 + i * 25, y }],
  })));
  traceScene(elements);
  const direct = detectorReading(meter.id).spectrum;
  traceScene(elements, fibers);
  assert.equal(mixReading(crystal.id).state, 'mixing');
  const delivered = detectorReading(meter.id).spectrum;
  assert.deepEqual(delivered.map(s => s.wavelength), direct.map(s => s.wavelength));
  for (let i = 0; i < direct.length; i++) assert.ok(Math.abs(delivered[i].power - direct[i].power) < 1e-8);
});
