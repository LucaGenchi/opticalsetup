import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
import { traceAll, compressorGddReading } from '../sketch/js/raytrace.js';

test('compressor recommendation cancels incoming GDD independently of its current setting', () => {
  const source = createElement('pulsedlaser', 0, 0);
  source.params.beamMode = 'line';
  const upstream = createElement('pulsecompressor', 120, 0);
  const target = createElement('pulsecompressor', 240, 0);
  const suggestion = registry.pulsecompressor.params.find(p => p.key === 'gddToNull');
  const balance = registry.pulsecompressor.params.find(p => p.key === 'gddBalance');
  for (const incoming of [4000, -4000, 0]) {
    upstream.params.gddFs2 = incoming;
    for (const current of [-2000, 2000, -10000]) {
      target.params.gddFs2 = current;
      traceAll([source, upstream, target], []);
      assert.equal(suggestion.readout(target.params, target), `${(Math.round(-incoming) || 0).toLocaleString()} fs²`);
      if (incoming === current * 2) assert.match(balance.readout(target.params, target), /increases/);
    }
    target.params.gddFs2 = -incoming;
    traceAll([source, upstream, target], []);
    assert.equal(compressorGddReading(target.id).outgoing, 0);
  }
});

// The commonest scene of all: nothing dispersive upstream, so there is nothing
// to cancel. The advice is zero, and it has to read as "0 fs²" -- negating a
// zero arrival yields JavaScript's negative zero, which formats as "-0".
test('a compressor with no dispersion upstream advises zero, not negative zero', () => {
  const source = createElement('pulsedlaser', 0, 0);
  source.params.beamMode = 'line';
  const target = createElement('pulsecompressor', 200, 0);
  const suggestion = registry.pulsecompressor.params.find(p => p.key === 'gddToNull');
  traceAll([source, target], []);
  assert.equal(compressorGddReading(target.id).incoming, 0);
  assert.equal(suggestion.readout(target.params, target), '0 fs²');
});
