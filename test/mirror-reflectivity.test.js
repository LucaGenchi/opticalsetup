import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';

const paths = elements => traceAll(elements).filter(d => d.type === 'path');

const MIRROR_TYPES = ['mirror', 'galvo', 'retroreflector', 'cmirrorx', 'cmirror', 'oap'];

test('every mirror-category element has a reflectivity param defaulting to 100%, with the display toggle hidden until it drops below 100%', () => {
  for (const type of MIRROR_TYPES) {
    const el = createElement(type);
    assert.equal(el.params.refl, 100, `${type} should default to 100% reflectivity`);
    assert.equal(el.params.showTransmitted, false, `${type} should default the display toggle to off`);
    const showSpec = registry[type].params.find(p => p.key === 'showTransmitted');
    assert.ok(showSpec, `${type} should expose a showTransmitted param`);
    assert.equal(showSpec.show({ refl: 100 }), false, `${type}'s toggle should stay hidden at 100% reflectivity`);
    assert.equal(showSpec.show({ refl: 90 }), true, `${type}'s toggle should appear once reflectivity drops below 100%`);
  }
});

test('a partial flat mirror keeps the transmitted beam undrawn by default, but a detector behind it still reads the leaked power', () => {
  const laser = createElement('laser', 0, 0);
  const mirror = createElement('mirror', 150, 0);
  mirror.rot = 45; // folds the reflected beam off-axis; the 20% leak keeps going straight through
  mirror.params.refl = 80;
  const detector = createElement('detector', 300, 0);

  const hidden = paths([laser, mirror, detector]);
  assert.ok(!hidden.some(p => p.pts.some(pt => pt.x > 150 + 1e-6)),
    'no drawable ray should continue straight through the mirror when showTransmitted is off');
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.2) < 1e-6,
    'the detector behind the mirror should still read the 20% leaked power regardless of the display toggle');

  mirror.params.showTransmitted = true;
  const shown = paths([laser, mirror, detector]);
  assert.ok(shown.some(p => p.pts.some(pt => pt.x > 150 + 1e-6)),
    'the leaked beam should be drawn once showTransmitted is on');
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.2) < 1e-6,
    'toggling the display on must not change the physical reading');
});

test('curved mirrors (convex/concave) now split reflectivity too, always tracing the leak for detector physics', () => {
  const laser = createElement('laser', 0, 0);
  const cmirror = createElement('cmirror', 150, 0);
  cmirror.rot = 45;
  cmirror.params.refl = 70;
  cmirror.params.f = 100;
  const behindDetector = createElement('detector', 300, 0);

  traceAll([laser, cmirror, behindDetector]);
  assert.ok(Math.abs(detectorReading(behindDetector.id).signal - 0.3) < 1e-6,
    'a detector behind a partially-reflective concave mirror should read the 30% leaked power');

  const hiddenDrawables = paths([laser, cmirror, behindDetector]);
  assert.ok(!hiddenDrawables.some(p => p.pts.some(pt => pt.x > 150 + 1e-6)),
    'the leak should stay undrawn by default for curved mirrors too');
});

test('a fully reflective mirror is unaffected: no leak traced or drawn', () => {
  const laser = createElement('laser', 0, 0);
  const mirror = createElement('mirror', 150, 0);
  mirror.rot = 45;
  const detector = createElement('detector', 300, 0);

  traceAll([laser, mirror, detector]);
  assert.equal(detectorReading(detector.id), null, 'a 100%-reflective mirror should leak nothing');
});

test('sub-2% power still propagates through the shared tracer to detectors', () => {
  const laser = createElement('laser', 0, 0);
  const first = createElement('filter', 120, 0);
  const second = createElement('filter', 180, 0);
  for (const filter of [first, second]) {
    filter.params.ftype = 'nd';
    filter.params.trans = 0.1;
  }
  const detector = createElement('detector', 260, 0);

  traceAll([laser, first, second, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.01) < 1e-9,
    'the old 2% display threshold must not prune a physically valid detector path');
});

test('the laser has an Average power (W) parameter', () => {
  const laser = createElement('laser');
  assert.ok(Number.isFinite(laser.params.avgPowerW));
  assert.ok(laser.params.avgPowerW > 0);
  const spec = registry.laser.params.find(p => p.key === 'avgPowerW');
  assert.ok(spec, 'laser registry should declare avgPowerW');
  assert.equal(spec.label, 'Average power (W)');
});
