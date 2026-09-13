import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { registry, stageOffsetAt } from '../sketch/js/elements.js';
import { phasePlateIllumination, probeAt, traceScene } from '../sketch/js/raytrace.js';
import { objectiveScanPlanes, paraxialTrain, tracedPlaneCrossings } from '../sketch/js/scan-relay.js';
import { sampleArrivalDetailReading } from '../sketch/js/sample-arrival-detail.js';
import { parseSketch } from '../sketch/js/state.js';
import { buildTwoPhotonHandoffUrl, twoPhotonLaserCandidates } from '../sketch/js/two-photon-handoff.js';
import { rotPt } from '../sketch/js/util.js';

const raw = await readFile(new URL('../collections/2pp/setups/fischer-2011.json', import.meta.url), 'utf8');
const load = () => parseSketch(raw, registry);
const get = (scene, id) => scene.elements.find(element => element.id === id);
const close = (actual, expected, tolerance = 1e-8) => assert.ok(
  Math.abs(actual - expected) < tolerance, `${actual} should equal ${expected} within ${tolerance}`,
);
const span = values => Math.max(...values) - Math.min(...values);
const phaseReadout = registry.phaseplate.params.find(param => param.key === 'phaseFringes').readout;

function finiteAndTerminated(result, sampleX) {
  const points = result.drawables.flatMap(drawable => drawable.pts || []);
  assert.ok(points.length > 0);
  assert.ok(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  assert.ok(points.every(point => point.x <= sampleX + 1e-7), 'no unobserved post-resin fan');
}

function isolatedBundle(scene, sourceId, diameter = 5.6) {
  const source = get(scene, sourceId);
  const optics = scene.elements.filter(element => !['excitation-source', 'depletion-source'].includes(element.id));
  const probes = Array.from({ length: 9 }, (_, index) => ({
    ...structuredClone(source),
    id: `${sourceId}-probe-${index}`,
    y: source.y + (index - 4) * diameter / 8,
    params: { ...source.params, beamMode: 'line', showPulse: false },
  }));
  return traceScene([...optics, ...probes]);
}

test('Fischer images its central phase mask onto the true BFP and reaches the true resin plane', () => {
  const scene = load();
  const mask = get(scene, 'central-pi-mask');
  const first = get(scene, 'depletion-relay-l1');
  const last = get(scene, 'common-relay-l2');
  const objective = get(scene, 'leica-objective');
  const stage = get(scene, 'detc-peta-stage');
  const planes = objectiveScanPlanes(objective);
  const matrix = paraxialTrain([
    { distanceMm: first.x - mask.x }, { focalMm: first.params.f },
    { distanceMm: last.x - first.x }, { focalMm: last.params.f },
    { distanceMm: planes.bfp.x - last.x },
  ]);
  for (const [key, expected] of Object.entries({ A: -1, B: 0, C: 0, D: -1 })) close(matrix[key], expected);
  assert.equal(planes.stopClamped, false);
  close(planes.bfp.x, 625);
  close(planes.stop.x, planes.bfp.x);
  close(planes.focus.x, stage.x);
  close(planes.focus.y, stage.y);
  close(mask.params.aperture, 2 * planes.pupilRadiusMm);

  const result = traceScene(scene.elements);
  assert.deepEqual(result.signalHits.map(hit => hit.wavelengthNm).sort((a, b) => a - b), [532, 810]);
  assert.equal(result.writeHits.length, 1);
  assert.equal(result.writeHits[0].pulse.sourceId, 'excitation-source');
  for (const hit of result.signalHits) {
    close(hit.x, stage.x); close(hit.y, stage.y);
    assert.equal(hit.objectiveNA, 1.4, 'every reported sample hit must traverse the objective');
  }
  const details = sampleArrivalDetailReading(stage.id);
  assert.equal(details.channels.length, 2);
  for (const channel of details.channels) {
    assert.ok(channel.sampleCount >= 9, 'the inset records the beam support, not just a reference marker');
    close(channel.minUm, 0); close(channel.maxUm, 0);
  }
  finiteAndTerminated(result, stage.x);
});

test('both full-width Fischer beams fill the pupil, stay circular and focus; overfill is clipped', () => {
  const scene = load();
  const stage = get(scene, 'detc-peta-stage');
  const planes = objectiveScanPlanes(get(scene, 'leica-objective'));
  for (const sourceId of ['excitation-source', 'depletion-source']) {
    const result = isolatedBundle(scene, sourceId);
    assert.equal(result.signalHits.length, 9, `${sourceId}: both aperture edges must reach resin`);
    assert.ok(result.signalHits.every(hit => hit.objectiveNA === 1.4));
    close(span(result.signalHits.map(hit => hit.y)), 0);
    for (const hit of result.signalHits) { close(hit.x, stage.x); close(hit.y, stage.y); }
    const pupil = tracedPlaneCrossings(result.drawables, { center: planes.bfp, axis: planes.axis });
    assert.equal(pupil.length, 9);
    close(span(pupil.map(hit => hit.heightMm)), 5.6);
    close((Math.max(...pupil.map(hit => hit.heightMm)) + Math.min(...pupil.map(hit => hit.heightMm))) / 2, 0);
    const probe = probeAt(600, 310, 3);
    close(Math.abs(probe.stokes.s3), 1);
    close(probe.stokes.s1, 0); close(probe.stokes.s2, 0);
    finiteAndTerminated(result, stage.x);

    const overfilled = isolatedBundle(scene, sourceId, 8.4);
    assert.equal(overfilled.signalHits.length, 5, 'four probe rays beyond the 5.6 mm pupil are absorbed');
    close(span(overfilled.signalHits.map(hit => hit.y)), 0);
    assert.ok(overfilled.signalHits.every(hit => hit.objectiveNA === 1.4));
    finiteAndTerminated(overfilled, stage.x);
  }
});

test('Fischer source controls distinguish pulsed writing from CW-only illumination', () => {
  for (const setting of ['off', 'zero']) {
    const scene = load();
    const excitation = get(scene, 'excitation-source');
    excitation.params[setting === 'off' ? 'enabled' : 'avgPowerW'] = setting === 'off' ? false : 0;
    const result = traceScene(scene.elements);
    assert.deepEqual(result.signalHits.map(hit => hit.wavelengthNm), [532]);
    assert.equal(result.writeHits.length, 0);
    assert.equal(sampleArrivalDetailReading('detc-peta-stage').channels.length, 1);
  }
  const scene = load();
  get(scene, 'depletion-source').params.enabled = false;
  let result = traceScene(scene.elements);
  assert.deepEqual(result.signalHits.map(hit => hit.wavelengthNm), [810]);
  assert.equal(result.writeHits.length, 1);
  get(scene, 'excitation-source').params.enabled = false;
  result = traceScene(scene.elements);
  assert.equal(result.signalHits.length, 0);
  assert.equal(result.writeHits.length, 0);
  assert.equal(sampleArrivalDetailReading('detc-peta-stage').channels.length, 0);
});

test('Fischer phase-off, full-zone and oversized-zone controls never invent an inhibition field', () => {
  const scene = load();
  const mask = get(scene, 'central-pi-mask');
  const baseline = traceScene(scene.elements);
  assert.match(phaseReadout(mask.params, mask), /^0\.50 at 532 nm/);
  const geometry = result => result.signalHits.map(hit => [hit.wavelengthNm, hit.x, hit.y]);
  for (const [key, value] of [['centralAreaFraction', 0], ['centralAreaFraction', 1], ['aperture', 12], ['opdUm', 0]]) {
    Object.assign(mask.params, { centralAreaFraction: 0.5, aperture: 5.6, opdUm: 0.266, [key]: value });
    const result = traceScene(scene.elements);
    assert.deepEqual(geometry(result), geometry(baseline));
    assert.deepEqual(result.writeHits, baseline.writeHits);
    if (key === 'opdUm') assert.match(phaseReadout(mask.params, mask), /^None/);
    else {
      assert.equal(phasePlateIllumination(mask.id).phaseSpan, 0);
      assert.match(phaseReadout(mask.params, mask), /^0\.00 at 532 nm/);
    }
  }
});

test('Fischer 3% AOM gates remain real when displayed as continuous rays, including duty boundaries', () => {
  for (const duty of [0.01, 0.03, 0.99]) {
    const scene = load();
    for (const id of ['excitation-aom', 'depletion-aom']) get(scene, id).params.chopDuty = duty;
    const pulseResult = traceScene(scene.elements);
    const gate = pulseResult.writeHits[0].pulse.gates[0];
    close(gate.frequencyMHz, 0.004); close(gate.duty, duty);
    get(scene, 'excitation-source').params.enabled = false;
    traceScene(scene.elements);
    close(probeAt(600, 310, 3).intensity, duty, 1e-7);
    get(scene, 'depletion-aom').params.drawChopped = true;
    traceScene(scene.elements);
    close(probeAt(600, 310, 3).intensity, duty, 1e-7);
  }
});

test('Fischer scan moves true arrivals within a fixed field and defocus retains finite support', () => {
  const scene = load();
  const stage = get(scene, 'detc-peta-stage');
  close(2 * stage.params.pzTravelXY * stage.params.pzFreqXY, 0.1);
  for (const [time, expectedUm] of [[0, 50], [0.5, 0], [1, -50]]) {
    const local = stageOffsetAt(stage.params, time);
    const offset = rotPt(local.x, local.y, stage.rot);
    const moved = { ...stage, x: stage.x + offset.x, y: stage.y + offset.y };
    const result = traceScene(scene.elements.map(element => element.id === stage.id ? moved : element));
    assert.equal(result.signalHits.length, 2);
    assert.equal(result.writeHits.length, 1);
    for (const channel of sampleArrivalDetailReading(stage.id).channels) {
      close(channel.minUm, expectedUm, 1e-6); close(channel.maxUm, expectedUm, 1e-6);
    }
  }
  stage.params.pzMode = 'static';
  assert.deepEqual(stageOffsetAt(stage.params, 17), { x: 0, y: 0 });
  stage.x += 0.05;
  const result = traceScene(scene.elements);
  assert.equal(result.signalHits.length, 2);
  for (const channel of sampleArrivalDetailReading(stage.id).channels) {
    close(channel.maxUm - channel.minUm, 140, 1e-6);
    assert.ok(channel.positionsUm.length > 2, 'defocus must preserve sampled support');
  }
  finiteAndTerminated(result, stage.x);
});

test('Fischer scene round-trips with true-plane termination, fixed-field inset and illustrative handoff guard', () => {
  const scene = load();
  const roundTrip = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, ...scene }), registry);
  assert.deepEqual(roundTrip, scene);
  const source = get(roundTrip, 'excitation-source');
  const stage = get(roundTrip, 'detc-peta-stage');
  assert.equal(buildTwoPhotonHandoffUrl(source), null);
  const result = traceScene(roundTrip.elements);
  assert.deepEqual(twoPhotonLaserCandidates(roundTrip.elements, result.signalHits, stage.id), []);
  assert.equal(stage.params.transmitExc, true);
  assert.equal(stage.params.transmission, 0);
  assert.equal(stage.params.showArrivalDetail, true);
  close(stage.params.arrivalDetailRangeUm, 60);
  assert.equal(result.writeHits.length, 1);
});
