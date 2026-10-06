// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry, newSampleChannel, sampleChannels } from '../sketch/js/elements.js';
import { emissionRayCount } from '../sketch/js/emission.js';
import { traceScene, detectorReading, specimenIncidentBeams, probeBeamsAt } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';

function bench({ kind = 'tpef', nrays = 20, width = 40, gap = 8, offset = 0 } = {}) {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { wavelength: 800, beamMode: 'beam', beamWidth: width });
  const stop = createElement('slit', 100, offset);
  Object.assign(stop.params, { gap, length: 100 });
  const sample = createElement('sample', 150, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 80, specimenType: kind === 'fluor' || kind === 'raman' ? 'linear' : 'nonlinear',
    transmitExc: false,
    channels: [{ ...newSampleChannel(kind), nrays, eff: 0.5, autoWl: false, wl: 900 }],
  });
  return { laser, stop, sample, elements: [laser, stop, sample] };
}

function emittedWeight(sample, x = sample.x, y = sample.y, wavelength = 900) {
  // A circle tangent just beyond the emission point counts the forward half
  // of the symmetric fan. Uncollected glow still carries traced power.
  return probeBeamsAt(x + 12, y, 11.999999)
    .filter(b => Math.abs(b.wl - wavelength) < 1e-6).reduce((sum, b) => sum + b.power, 0) * 2;
}

for (const kind of ['fluor', 'tpef', 'thpef']) {
  test(`${kind} survives clipping the pump edges and scales with surviving excitation`, () => {
    const { sample, elements, stop } = bench({ kind });
    const result = traceScene(elements);
    const incident = specimenIncidentBeams(sample.id);
    assert.equal(incident.length, 1);
    assert.ok(Math.abs(incident[0].power - 0.2) < 1e-12);
    assert.ok(Math.abs(emittedWeight(sample) - 0.1) < 1e-12, 'all surviving excitation drives one fan');
    for (const d of result.drawables) for (const p of d.pts || []) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    }
    stop.params.gap = 60;
    traceScene(elements);
    assert.ok(Math.abs(emittedWeight(sample) - 0.5) < 1e-12, 'opening the stop restores the full pump weight');
  });
}

test('off-axis surviving excitation emits once even when the centre ray is blocked', () => {
  const { sample, elements } = bench({ gap: 8, offset: 10 });
  const result = traceScene(elements);
  const incident = specimenIncidentBeams(sample.id)[0];
  assert.ok(incident.power > 0);
  const origin = result.drawables.find(d => d.type === 'path' && d.pts?.[0].x === sample.x);
  assert.ok(origin, 'a surviving off-axis ray places the fan');
  const y = origin.pts[0].y;
  assert.ok(y >= 6 && y <= 14, 'emission originates inside the transmitted slit gap');
  assert.ok(Math.abs(emittedWeight(sample, sample.x, y) - incident.power * 0.5) < 1e-12);
});

test('blocking all excitation produces no fluorescence or specimen arrival', () => {
  const { sample, elements } = bench();
  const dump = createElement('beamdump', 80, 0);
  dump.params.aperture = 100;
  const result = traceScene([...elements, dump]);
  assert.equal(specimenIncidentBeams(sample.id).length, 0);
  assert.equal(result.signalHits.length, 0);
  assert.equal(emittedWeight(sample), 0);
});

test('angular ray count changes the fan resolution without multiplying its power', () => {
  for (const nrays of [4, 8, 20, 64, 128]) {
    const { sample, elements } = bench({ nrays });
    const result = traceScene(elements);
    const firstSegments = result.drawables.filter(d => d.type === 'path'
      && d.pts?.[0].x === sample.x && Math.abs(d.pts?.[0].y) < 1e-9);
    assert.equal(firstSegments.length, nrays, 'one angular fan, not one per transverse pump ray');
    assert.ok(Math.abs(emittedWeight(sample) - 0.1) < 1e-12, `same total emission at ${nrays} rays`);
  }
});

test('resin fluorescence is opt-in and coexists with one pulsed voxel write location', () => {
  const { laser, sample } = bench({ width: 6 });
  const stage = createElement('stage', sample.x, 0);
  stage.rot = 90;
  Object.assign(stage.params, { ...sample.params, specimenType: 'resin', voxelPreview: true, transmitExc: true, transmission: 0 });
  assert.deepEqual(sampleChannels(stage.params), []);
  const lens = createElement('lens', 160, 0);
  Object.assign(lens.params, { f: 40, dia: 60 });
  const detector = createElement('detector', 250, 0);
  detector.params.aperture = 80;
  const els = [laser, stage, lens, detector];
  assert.equal(traceScene(els).writeHits.length, 1);
  assert.equal(detectorReading(detector.id), null);
  stage.params.resinFluorescence = true;
  const result = traceScene(els);
  assert.equal(result.writeHits.length, 1, 'fluorescence does not create extra writing events');
  assert.ok(detectorReading(detector.id).spectrum.some(s => Math.abs(s.wavelength - 900) < 1));
  stage.params.voxelPreview = false;
  assert.equal(traceScene(els).writeHits.length, 0);
  assert.ok(detectorReading(detector.id).signal > 0, 'fluorescence is independent of the preview');
  stage.params.resinFluorescence = false;
  traceScene(els);
  assert.equal(detectorReading(detector.id), null);
});

test('old resin channels stay dormant, and angular counts normalize and round-trip', () => {
  function load(params) {
    return parseSketch({ version: 1, elements: [{ id: 's', type: 'stage', x: 0, y: 0, params }] }, registry).elements[0];
  }
  const old = load({ specimenType: 'resin', channels: [newSampleChannel('tpef')] });
  assert.equal(old.params.resinFluorescence, false);
  assert.deepEqual(sampleChannels(old.params), []);
  for (const [raw, expected] of [[undefined, 20], [NaN, 20], [Infinity, 20], [-10, 4], [10000, 128], [19.6, 20]]) {
    assert.equal(emissionRayCount({ kind: 'tpef', nrays: raw }), expected);
    const el = load({ specimenType: 'resin', resinFluorescence: true,
      channels: [{ ...newSampleChannel('tpef'), nrays: raw }, newSampleChannel('shg')] });
    assert.equal(sampleChannels(el.params).length, 1, 'resin only offers two-photon fluorescence');
    assert.equal(sampleChannels(el.params)[0].nrays, expected);
    assert.equal(sampleChannels(load(el.params).params)[0].nrays, expected);
  }
  assert.equal(emissionRayCount({ kind: 'raman' }), 14, 'legacy Raman angular sampling');
});
