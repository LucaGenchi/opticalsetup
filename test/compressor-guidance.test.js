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
      if (incoming === current * 2) assert.match(balance.readout(target.params, target), /\|GDD\| increased/);
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

// Driving the output negative is a destination, not an overshoot: pre-chirping
// a pulse so it arrives transform-limited after a downstream objective is the
// ordinary reason to use a compressor. The readout has to name that sign, not
// only report how the magnitude moved.
test('the balance readout names the sign of the outgoing dispersion', () => {
  const source = createElement('pulsedlaser', 0, 0);
  source.params.beamMode = 'line';
  const rod = createElement('glassrod', 120, 0);
  rod.params.material = 'nbk7';
  const target = createElement('pulsecompressor', 300, 0);
  const balance = registry.pulsecompressor.params.find(p => p.key === 'gddBalance');
  const read = gdd => {
    target.params.gddFs2 = gdd;
    traceAll([source, rod, target], []);
    return balance.readout(target.params, target);
  };

  const incoming = (traceAll([source, rod, target], []), compressorGddReading(target.id).incoming);
  assert.ok(incoming > 0, 'the glass rod should leave positive GDD to work against');

  // Under-compressed: still positive, and honestly reported as such.
  assert.match(read(-incoming / 2), /positive dispersion/);

  // Past the null: negative, and named negative rather than only "reduced".
  const overshot = read(-incoming * 1.5);
  assert.match(overshot, /negative dispersion/);
  assert.doesNotMatch(overshot, /positive dispersion/);

  // Exactly nulled, and the same magnitude on the far side of the null: the
  // boundary either side of the sign change.
  assert.match(read(-incoming), /dispersion cancelled/);
  assert.match(read(-incoming * 2), /negative dispersion/);

  // Same sign as the input adds to it.
  assert.match(read(incoming), /positive dispersion, \|GDD\| increased/);
});

test('a compressor pre-compensating with nothing upstream reports negative dispersion', () => {
  const source = createElement('pulsedlaser', 0, 0);
  source.params.beamMode = 'line';
  const target = createElement('pulsecompressor', 200, 0);
  const balance = registry.pulsecompressor.params.find(p => p.key === 'gddBalance');
  target.params.gddFs2 = -2000;
  traceAll([source, target], []);
  assert.equal(compressorGddReading(target.id).incoming, 0);
  // No incoming magnitude to take a percentage of, but the sign still matters.
  assert.match(balance.readout(target.params, target), /negative dispersion/);
  assert.doesNotMatch(balance.readout(target.params, target), /%/);
});
