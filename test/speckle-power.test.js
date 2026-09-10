import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from '../sketch/js/elements.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';

for (const type of ['slm', 'metasurface']) {
  for (const beamMode of ['line', 'beam']) {
    test(`${type} speckle preserves ${beamMode} incident power`, () => {
      const source = createElement('cwlaser', 0, 0);
      Object.assign(source.params, { beamMode, beamWidth: 4 });
      const shaper = createElement(type, 150, 0);
      Object.assign(shaper.params, { transmissive: true, layers: [{ type: 'speckle', div: 8 }] });
      const detector = createElement('detector', 300, 0);
      detector.params.aperture = 120;
      traceAll([source, shaper, detector], []);
      assert.ok(Math.abs(detectorReading(detector.id)?.signal - 1) < 1e-8);
      shaper.params.layers = [{ type: 'speckle', div: 0.01 }];
      traceAll([source, shaper, detector], []);
      assert.ok(Math.abs(detectorReading(detector.id)?.signal - 1) < 1e-8, 'narrow scatter does not create power');
    });
  }
}
