import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';

for (const type of ['slm', 'metasurface']) {
  for (const sourceType of ['cwlaser', 'sclaser']) {
    test(`${type} preserves ${sourceType} spectrum through zero and opposite grating layers`, () => {
      const source = createElement(sourceType, 0, 0);
      Object.assign(source.params, { beamMode: 'line', scMin: 400, scMax: 700, wavelength: 532 });
      const shaper = createElement(type, 150, 0);
      shaper.params.transmissive = true;
      const detector = createElement('spectrometer', 320, 0);
      detector.params.aperture = 100;
      const scene = [source, shaper, detector];
      const expected = sourceType === 'sclaser' ? [400, 700] : [532, 532];
      for (const layers of [[{ type: 'grating', lines: 300, orders: '0' }], [
        { type: 'grating', lines: 300, orders: '1' }, { type: 'grating', lines: 300, orders: '-1' },
      ]]) {
        shaper.params.layers = layers;
        traceAll(scene, []);
        const rd = detectorReading(detector.id);
        assert.ok(Math.abs(rd?.signal - 1) < 1e-8, 'full power reaches detector');
        assert.ok(rd.spotSpan < 1e-7, 'opposite gratings cancel wavelength by wavelength');
        assert.ok(Math.abs(rd.bandMin - expected[0]) < 1e-7);
        assert.ok(Math.abs(rd.bandMax - expected[1]) < 1e-7);
      }
      shaper.params.layers = [{ type: 'grating', lines: 10000, orders: '10' }];
      traceAll(scene, []);
      assert.ok(!detectorReading(detector.id), 'non-propagating order stays absent');
    });
  }
}
