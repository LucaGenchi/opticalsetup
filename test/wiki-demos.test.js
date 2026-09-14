import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';
const main = await readFile(new URL('../sketch/js/main.js', import.meta.url), 'utf8');
const helper = main.slice(main.indexOf('function mkDemo('), main.indexOf('// The two fiber tools'));
const definitions = main.slice(main.indexOf('  eye: () =>'), main.indexOf('  fiber: () =>'));
const demos = new Function('createElement', helper + '\nreturn ({' + definitions + '});')(createElement);
// Execute the actual page fixtures with the tracer, without booting the DOM UI.
// Keep scene construction in main.js, where the existing wiki demos live.
for (const [type, build] of Object.entries(demos)) test(`wiki ${type} demo traces its documented behavior`, () => {
  const elements = build();
  const result = traceScene(elements);
  assert.ok(result.drawables.length, type + ': no light');
  assert.ok(!JSON.stringify(result).includes('NaN'), type);
  const sensors = elements.filter(e => registry[e.type]?.readoutKind);
  const readings = sensors.map(e => detectorReading(e.id));
  if (type !== 'box') for (const reading of readings) assert.ok(reading?.signal > 0, type + ': unlit detector');
  if (type === 'box') {
    assert.ok(!readings[0]); elements.find(e => e.type === 'box').params.behavior = 'pass'; traceScene(elements);
    assert.ok(detectorReading(sensors[0].id)?.signal > 0);
  }
  if (type === 'chopper') {
    const half = readings[0].signal;
    elements.find(e => e.type === 'chopper').params.modulate = false; traceScene(elements);
    assert.ok(Math.abs(detectorReading(sensors[0].id).signal - 2 * half) < 1e-8);
  }
  if (type === 'crystal') {
    const spectrum = JSON.stringify(readings.map(r => Math.round(r?.wavelength)));
    assert.ok(spectrum.includes('532') && spectrum.includes('1064'), spectrum);
  }
  if (type === 'delayline') {
    const shifted = readings[0].pulse.trains[0].pathDelayNs;
    elements.find(e => e.type === 'delayline').params.delayMm = 0; traceScene(elements);
    assert.ok(Math.abs(shifted - detectorReading(sensors[0].id).pulse.trains[0].pathDelayNs - 100/299.792458) < 1e-8);
  }
});
