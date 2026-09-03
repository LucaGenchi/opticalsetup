import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import '../sketch/js/detector-instruments.js';

const mk = (type, x, y, rot = 0, params = {}) => {
  const el = createElement(type, x, y); el.rot = rot; Object.assign(el.params, params); return el;
};

// A point source at the focus of a parabolic mirror, read by a detector some
// way downstream. The mirror is at the origin of its own parabola, so with
// f = 25 the focus sits 25 mm to its right.
function bench({ mirror = true, detectorX = 400, aperture = 130 } = {}) {
  const source = mk('pointsource', 175, 200, 0, { spread: 360, nrays: 24, bwMode: 'mono' });
  const detector = mk('detector', detectorX, 200, 0, { aperture });
  const scene = mirror
    ? [source, mk('oap', 150, 200, 180, { length: 110, f: 25 }), detector]
    : [source, detector];
  traceAll(scene, []);
  return detectorReading(detector.id);
}

test('a point source alone still fades within its near field', () => {
  // The evanescent model is the point of this source: uncollected isotropic
  // emission dies out rather than illuminating the whole bench. Letting
  // mirrors collect must not quietly turn it into a floodlight.
  assert.equal(bench({ mirror: false, detectorX: 400 }), null, 'nothing survives 225 mm uncollected');
  assert.equal(bench({ mirror: false, detectorX: 900 }), null);
});

test('a parabolic mirror collects a point source at its focus and collimates it', () => {
  // Before mirrors were collectors the light passed straight through the
  // parabola as if it were not there, and no arrangement could collimate it.
  const near = bench({ detectorX: 400 });
  assert.ok(near && near.signal > 0, 'the mirror collects and redirects the light');

  // Collimated means the beam does not spread: the same aperture intercepts
  // the same fraction of it whatever the distance. A diverging beam would
  // drop off, a converging one would rise then fall.
  const far = bench({ detectorX: 900 });
  assert.ok(far && far.signal > 0, 'and it still arrives 725 mm out');
  assert.ok(Math.abs(far.signal - near.signal) < 1e-6,
    `collimated: ${near.signal} at 400 mm vs ${far.signal} at 900 mm`);
});

test('an ordinary mirror also reflects point-source light now', () => {
  // The parabola is a chain of plane mirror facets, so this is the same rule
  // seen at its simplest -- and the case that showed the omission was general
  // rather than anything to do with parabolas.
  const source = mk('pointsource', 300, 200, 0, { spread: 360, nrays: 24, bwMode: 'mono' });
  const mirror = mk('mirror', 200, 200, 45, { length: 120 });
  // this mirror folds the leftward light downward
  const detector = mk('detector', 200, 310, 90, { aperture: 120 });
  traceAll([source, mirror, detector], []);
  const reading = detectorReading(detector.id);
  assert.ok(reading && reading.signal > 0, 'light folded 90 degrees reaches the detector');

  // and with the mirror gone that detector sees nothing, so the signal above
  // really came off the mirror rather than straight from the source
  const bare = mk('detector', 200, 310, 90, { aperture: 120 });
  traceAll([mk('pointsource', 300, 200, 0, { spread: 360, nrays: 24, bwMode: 'mono' }), bare], []);
  const without = detectorReading(bare.id);
  assert.ok(!without || without.signal === 0, 'no mirror, no signal');
});

test('collection still respects the capture range', () => {
  // A mirror far outside the near field cannot collect what never reaches it.
  const source = mk('pointsource', 175, 200, 0, { spread: 360, nrays: 24, bwMode: 'mono' });
  const far = mk('oap', -400, 200, 180, { length: 110, f: 575 });
  const detector = mk('detector', 600, 200, 0, { aperture: 130 });
  traceAll([source, far, detector], []);
  const reading = detectorReading(detector.id);
  assert.ok(!reading || reading.signal === 0,
    'a collector beyond the capture range collects nothing');
});

test('a partial mirror collects only what it reflects', () => {
  // A 30% mirror gathers 30% of the light. The other 70% passed through and
  // was collected by nothing, so it must keep fading -- otherwise it leaves as
  // ordinary light carrying most of the power and reaches any detector on the
  // bench, which would be a worse bug than the one this fixes.
  // The 45 degree fold separates the two branches geometrically: reflected
  // light goes down, transmitted light carries straight on to the left.
  const bench = (detector) => {
    const source = mk('pointsource', 300, 200, 0, { spread: 360, nrays: 24, bwMode: 'mono' });
    const mirror = mk('mirror', 200, 200, 45, { length: 120, refl: 30, showTransmitted: true });
    traceAll([source, mirror, detector], []);
    return detectorReading(detector.id);
  };

  const reflected = bench(mk('detector', 200, 310, 90, { aperture: 140 }));
  assert.ok(reflected && reflected.signal > 0, 'the reflected fraction is collected');

  const transmitted = bench(mk('detector', 60, 200, 180, { aperture: 140 }));
  assert.ok(!transmitted || transmitted.signal === 0,
    `the 70% that passed through must still fade, got ${transmitted && transmitted.signal}`);
});

test('curved mirrors collect too, not just flat and parabolic ones', () => {
  // A concave mirror is what a collection mirror around a sample actually is,
  // and it uses a different surface kind from the flat and parabolic ones.
  const source = mk('pointsource', 300, 200, 0, { spread: 360, nrays: 24, bwMode: 'mono' });
  const concave = mk('cmirror', 150, 200, 0, { f: 75, length: 160 });
  const detector = mk('detector', 700, 200, 0, { aperture: 200 });
  traceAll([source, concave, detector], []);
  const reading = detectorReading(detector.id);
  assert.ok(reading && reading.signal > 0, 'a concave mirror gathers the light and sends it on');

  // without it, nothing survives the trip
  const bare = mk('detector', 700, 200, 0, { aperture: 200 });
  traceAll([mk('pointsource', 300, 200, 0, { spread: 360, nrays: 24, bwMode: 'mono' }), bare], []);
  const without = detectorReading(bare.id);
  assert.ok(!without || without.signal === 0, 'no collector, no light');
});
