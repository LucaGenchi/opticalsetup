import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry, phasePlateCentralDiameterFraction, phasePlateOpdFraction } from '../sketch/js/elements.js';
import { phasePlateIllumination, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { buildTwoPhotonHandoffUrl, twoPhotonLaserCandidates } from '../sketch/js/two-photon-handoff.js';

test('central pupil section converts radial area into diameter, including empty and full zones', () => {
  assert.equal(phasePlateCentralDiameterFraction(0.5), Math.sqrt(0.5));
  assert.equal(phasePlateCentralDiameterFraction(0.25), 0.5);
  for (const value of [-1, 0, NaN, Infinity]) assert.equal(phasePlateCentralDiameterFraction(value), 0);
  assert.equal(phasePlateCentralDiameterFraction(2), 1);
  for (const u of [0, 0.1, 0.5, 0.9, 1]) {
    assert.equal(phasePlateOpdFraction('pupil', u, 0), 0);
    assert.equal(phasePlateOpdFraction('pupil', u, 1), 1);
    assert.equal(phasePlateOpdFraction('pupil', u, 0.5), Math.abs(2 * u - 1) <= Math.sqrt(0.5) ? 1 : 0);
  }
  assert.ok(Number.isFinite(phasePlateOpdFraction('ramp', NaN)));
});

test('central phase step changes optical path and sampled phase span, never a geometric focus or intensity', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { wavelength: 532, beamMode: 'beam', beamWidth: 8, bandwidth: 0, transformLimited: false });
  const plate = createElement('phaseplate', 100, 0);
  Object.assign(plate.params, { aperture: 8, profile: 'pupil', centralAreaFraction: 0.5, opdUm: 0.266 });
  const stage = createElement('stage', 180, 0);
  stage.rot = 90;
  Object.assign(stage.params, { aperture: 30, specimenType: 'resin', voxelPreview: true });
  const run = area => {
    plate.params.centralAreaFraction = area;
    const hit = traceScene([laser, plate, stage]).writeHits[0];
    return { hit, illumination: phasePlateIllumination(plate.id) };
  };
  const empty = run(0), half = run(0.5), full = run(1);
  for (const value of [half, full]) {
    assert.deepEqual([value.hit.x, value.hit.y, value.hit.intensity], [empty.hit.x, empty.hit.y, empty.hit.intensity]);
    assert.ok(Math.abs(value.hit.opl - empty.hit.opl - 0.000266) < 1e-9);
  }
  assert.equal(empty.illumination.phaseSpan, 0);
  assert.equal(half.illumination.phaseSpan, 1);
  assert.equal(full.illumination.phaseSpan, 0);
});

test('an illustrative source can explicitly disable configured-value handoff and retain that choice on reload', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  assert.ok(buildTwoPhotonHandoffUrl(laser));
  laser.params.handoffEnabled = false;
  const loaded = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [laser], beams: [] }), registry).elements[0];
  assert.equal(loaded.params.handoffEnabled, false);
  assert.equal(buildTwoPhotonHandoffUrl(loaded), null);
  assert.deepEqual(twoPhotonLaserCandidates([loaded], [{ stageId: 'resin', sourceId: loaded.id }], 'resin'), []);
  delete loaded.params.handoffEnabled;
  assert.ok(buildTwoPhotonHandoffUrl(loaded), 'old saved sources retain their existing default behavior');
});
