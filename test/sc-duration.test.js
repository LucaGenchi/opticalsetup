import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createElement, registry, normalizeSupercontinuumParams, supercontinuumPulseWidthFloorFs,
} from '../sketch/js/elements.js';
import { supercontinuumTransformLimitFs } from '../sketch/js/spectrum.js';
import '../sketch/js/detector-instruments.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';

test('configured continuum duration reaches both probe and instruments without changing its spectrum', () => {
  const source = createElement('sclaser', 0, 0);
  Object.assign(source.params, { scMin: 400, scMax: 700, beamMode: 'line', pulseWidthFs: 250 });
  const probe = createElement('probe', 150, 0);
  probe.params.prop = 'duration';
  const ac = createElement('autocorrelator', 300, 0);
  const scene = [source, probe, ac];
  traceAll(scene, []);
  assert.match(registry.probe.svg(probe, scene), /250 fs/);
  const rd = detectorReading(ac.id);
  assert.equal(rd.pulse.pulseWidthFs, 250);
  assert.equal(rd.bandMin, 400);
  assert.equal(rd.bandMax, 700);
  source.params.pulseShape = 'sech2';
  traceAll(scene, []);
  assert.equal(detectorReading(ac.id).pulse.pulseShape, 'sech2');
});

test('legacy continuum sketches retain the previously traced 100 fs Gaussian envelope', () => {
  const source = createElement('sclaser');
  delete source.params.pulseWidthFs;
  delete source.params.pulseShape;
  const parsed = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [source], beams: [] }), registry);
  assert.equal(parsed.elements[0].params.pulseWidthFs, 100);
  assert.equal(parsed.elements[0].params.pulseShape, 'gauss');
});

// A pulse cannot be shorter than the transform limit of its own spectrum. For
// a flat band that limit is set by the band's exact frequency span.
test('the duration floor is the transform limit of the band', () => {
  const floor = p => supercontinuumPulseWidthFloorFs(p);
  // 690-700 nm spans c(1/690 - 1/700) = 6.207e-3 /fs; 0.441 / that = 71.05 fs.
  assert.equal(floor({ scMin: 690, scMax: 700, pulseShape: 'gauss' }), 71.1);
  assert.equal(floor({ scMin: 690, scMax: 700, pulseShape: 'sech2' }), 50.8);
  // The span is exact, not lambda^2/dlambda at the centre: the two agree for
  // a narrow band but not for a wide one, where 400-700 nm gives 1.37 fs
  // exactly against 1.48 fs from the approximation.
  assert.ok(Math.abs(supercontinuumTransformLimitFs(400, 700, 'gauss') - 1.3727) < 1e-3);
  // A band hundreds of nm wide limits nothing the 1 fs field floor does not.
  assert.equal(floor({ scMin: 300, scMax: 700 }), 1);
  assert.equal(floor({ scMin: 400, scMax: 700 }), 1.38);
  // The rounded floor must still honour the limit it rounds.
  for (const [lo, hi] of [[690, 700], [1000, 1010], [532, 533], [400, 700]]) {
    assert.ok(floor({ scMin: lo, scMax: hi }) >= supercontinuumTransformLimitFs(lo, hi, 'gauss'));
  }
});

test('narrowing the band lifts a duration it can no longer support, and widening never lowers one', () => {
  const params = { scMin: 400, scMax: 700, pulseShape: 'gauss', pulseWidthFs: 20 };
  assert.deepEqual(normalizeSupercontinuumParams(params), {}, '20 fs is fine across 300 nm');
  Object.assign(params, { scMin: 690 });
  Object.assign(params, normalizeSupercontinuumParams(params));
  assert.equal(params.pulseWidthFs, 71.1);
  // Switching to the tighter sech2 envelope lowers the floor but must not
  // quietly shorten the pulse the user now has.
  Object.assign(params, { pulseShape: 'sech2' });
  Object.assign(params, normalizeSupercontinuumParams(params));
  assert.equal(params.pulseWidthFs, 71.1);
  Object.assign(params, { scMin: 400 });
  assert.deepEqual(normalizeSupercontinuumParams(params), {});
  assert.equal(params.pulseWidthFs, 71.1);
});

test('a saved sketch below the transform limit loads at the limit, and the tracer carries it', () => {
  const source = createElement('sclaser', 0, 0);
  Object.assign(source.params, { scMin: 690, scMax: 700, beamMode: 'line', pulseWidthFs: 10 });
  const ac = createElement('autocorrelator', 300, 0);
  const parsed = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [source, ac], beams: [] }), registry);
  assert.equal(parsed.elements[0].params.pulseWidthFs, 71.1);
  traceAll(parsed.elements, []);
  assert.equal(detectorReading(parsed.elements[1].id).pulse.pulseWidthFs, 71.1);
});

test('the inspector shows the limit it enforces', () => {
  const spec = registry.sclaser.params.find(p => p.key === 'scTransformLimit');
  assert.equal(spec.type, 'readout');
  assert.equal(spec.readout({ scMin: 690, scMax: 700, pulseShape: 'gauss' }), '71.1');
});
