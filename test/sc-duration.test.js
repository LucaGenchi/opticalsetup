import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
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
