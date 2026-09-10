import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';

for (const sourceType of ['sclaser', 'pulsedlaser', 'cwlaser']) {
  for (const transmissive of [true, false]) {
    test(`${sourceType} spectrum survives the ${transmissive ? 'transmitted' : 'reflected'} zeroth order`, () => {
      const source = createElement(sourceType, 0, 0);
      source.params.beamMode = 'line';
      Object.assign(source.params, { scMin: 400, scMax: 700 });
      const detector = createElement('spectrometer', 300, 0);
      traceAll([source, detector]);
      const expected = detectorReading(detector.id);

      const grating = createElement('grating', 150, 0);
      Object.assign(grating.params, { orders: '0', transmissive });
      if (!transmissive) {
        grating.rot = 45;
        Object.assign(detector, { x: 150, y: -150, rot: -90 });
      }
      traceAll([source, grating, detector]);
      const actual = detectorReading(detector.id);
      assert.ok(actual, 'zeroth order reaches the detector');
      assert.equal(actual.signal, expected.signal);
      assert.deepEqual(actual.spectrum, expected.spectrum);
      assert.equal(actual.bandMin, expected.bandMin);
      assert.equal(actual.bandMax, expected.bandMax);
    });
  }
}

test('a downstream bandpass still selects light from a broadband zeroth order', () => {
  const source = createElement('sclaser', 0, 0);
  Object.assign(source.params, { beamMode: 'line', scMin: 400, scMax: 700 });
  const grating = createElement('grating', 150, 0);
  Object.assign(grating.params, { orders: '-1,0,1', transmissive: true });
  const filter = createElement('filter', 230, 0);
  Object.assign(filter.params, { center: 600, band: 30 });
  const detector = createElement('spectrometer', 300, 0);
  traceAll([source, grating, filter, detector]);
  const reading = detectorReading(detector.id);
  assert.ok(reading, '600 nm light must not disappear into a fabricated 400 nm line');
  assert.ok(Math.abs(reading.signal - 1 / 30) < 1e-10);
  assert.ok(reading.bandMin >= 584 && reading.bandMax <= 616);
});
