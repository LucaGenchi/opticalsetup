import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from '../sketch/js/elements.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < Math.max(1e-15, Math.abs(b) * 1e-9), `${a} != ${b}`);

test('1–99% CW AOM duties survive downstream optics with unchanged power and drawing controls', () => {
  for (const beamMode of ['line', 'beam']) {
    for (const chopDuty of [0.01, 0.03, 0.99]) {
      for (const drawChopped of [false, true]) {
        const laser = createElement('cwlaser', 0, 0);
        Object.assign(laser.params, { beamMode, beamWidth: 3 });
        const aom = createElement('aom', 100, 0);
        Object.assign(aom.params, { modulate: true, modShape: 'square', eff: 1,
          chopDuty, drawChopped, zero: false, deflect: 0 });
        const lens = createElement('lens', 200, 0);
        Object.assign(lens.params, { f: 100, dia: 25 });
        const detector = createElement('detector', 300, 0);
        detector.params.aperture = 50;
        const drawables = traceAll([laser, aom, lens, detector]);
        near(detectorReading(detector.id)?.signal, chopDuty);
        assert.ok(drawables.some(drawable => drawable.pts?.some(point => point.x > 200)),
          'the weak beam is traced through the lens, not only into a directly adjacent detector');
        aom.params.eff = 0;
        traceAll([laser, aom, lens, detector]);
        assert.equal(detectorReading(detector.id), null, 'zero efficiency does not revive a first order');
      }
    }
  }
});

for (const type of ['aom', 'aod']) {
  test(`${type} retains weak first and residual orders through ordinary optics without redistributing power`, () => {
    for (const beamMode of ['line', 'beam']) {
      for (const efficiency of [1e-10, 0.01, 0.99, 1 - 1e-10]) {
        const laser = createElement('cwlaser', 0, 0);
        Object.assign(laser.params, { beamMode, beamWidth: 3 });
        const ao = createElement(type, 100, 0);
        Object.assign(ao.params, { eff: efficiency, zero: true, modulate: false,
          deflect: 10, centerDeflect: 10, aperture: 25 });
        const firstY = distance => distance * Math.tan(10 * Math.PI / 180);
        const straightLens = createElement('lens', 200, 0);
        const firstLens = createElement('lens', 200, firstY(100));
        for (const lens of [straightLens, firstLens]) Object.assign(lens.params, { dia: 10, f: 1000 });
        const straight = createElement('detector', 400, 0);
        const first = createElement('detector', 400, firstY(300));
        for (const detector of [straight, first]) detector.params.aperture = 30;
        traceAll([laser, ao, straightLens, firstLens, straight, first]);
        const zeroPower = detectorReading(straight.id)?.signal;
        const firstPower = detectorReading(first.id)?.signal;
        near(firstPower, efficiency);
        near(zeroPower, 1 - efficiency);
        near(firstPower + zeroPower, 1);
        assert.ok(firstPower > 0 && zeroPower > 0, 'both nonzero ports survive even below the ordinary floor');
      }
    }
  });
}
