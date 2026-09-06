import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceAll, traceScene, detectorReading } from '../sketch/js/raytrace.js';

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

test('a zeroth-order grating layer stays one undispersed ray per incoming ray', () => {
  // The spectrometer cannot see this on its own: N monochromatic rays that all
  // leave in the same direction read exactly like one broadband ray. But the
  // zeroth order is undispersed by definition, and the shaper caps each layer
  // at 24 rays -- so splitting it per wavelength burns that budget N times
  // faster and starves a stacked configuration, which is the same failure this
  // file already guards for resampling.
  const source = createElement('sclaser', 0, 0);
  Object.assign(source.params, { beamMode: 'line', scMin: 400, scMax: 700 });
  const shaper = createElement('slm', 200, 0);
  Object.assign(shaper.params, {
    transmissive: true, zeroOrder: false, length: 80,
    layers: [{ type: 'grating', lines: 300, orders: '0' }],
  });

  const incoming = traceScene([source]).drawables.filter(p => p.type === 'path').length;
  const paths = traceScene([source, shaper]).drawables.filter(p => p.type === 'path');
  const leaving = paths.filter(p => p.pts[0].x > shaper.x - 50).length;
  assert.ok(incoming > 1, 'the source must emit several rays for this to mean anything');
  assert.equal(leaving, incoming,
    `order 0 must not fan out: ${incoming} rays in, ${leaving} out`);
});
