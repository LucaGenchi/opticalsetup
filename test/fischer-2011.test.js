import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  phasePlateCentralDiameterFraction, phasePlateOpdFraction, registry, stageOffsetAt,
} from '../sketch/js/elements.js';
import { objectiveStopX, objectivePupilDiameter } from '../sketch/js/objective.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { buildPaperHandoff, twoPhotonHandoffCandidates } from '../sketch/js/two-photon-handoff.js';
import { reviewedPaperHandoff } from '../tools/2pp-collection-support.mjs';

const SCENE_URL = new URL('../collections/2pp/setups/fischer-2011.json', import.meta.url);

async function scene() {
  return parseSketch(await readFile(SCENE_URL, 'utf8'), registry);
}

test('Fischer default traces both distinct colours through the common objective to resin', async () => {
  const loaded = await scene();
  const result = traceScene(loaded.elements);
  const wavelengths = result.signalHits.map(hit => hit.wavelengthNm).sort((a, b) => a - b);
  assert.equal(wavelengths.length, 2);
  assert.ok(Math.abs(wavelengths[0] - 532) < 0.001);
  assert.ok(Math.abs(wavelengths[1] - 810) < 0.001);
  assert.ok(result.signalHits.every(hit => hit.objectiveNA === 1.4));
  assert.ok(result.writeHits.length > 0, 'the pulsed excitation must create native resin arrivals');
  assert.equal(result.writeHits.every(hit => hit.pulse.sourceId === 'excitation-source'), true);
  assert.equal(loaded.elements.find(element => element.id === 'excitation-source').params.handoffEnabled, false,
    'illustrative source timing and power must not enter the ordinary configured-value handoff');
  assert.deepEqual(twoPhotonHandoffCandidates(
    loaded.elements, result.signalHits, 'detc-peta-stage',
  ), [], 'the resin inspector must not offer interpreted source values as a transfer');
  assert.equal(result.writeHits[0].pulse.gates[0].frequencyMHz, 0.004);
  assert.equal(result.writeHits[0].pulse.gates[0].duty, 0.03);
  for (const drawable of result.drawables) {
    for (const point of drawable.pts || []) {
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
      assert.ok(point.x < 560 && point.y > 20 && point.y < 540,
        'the post-sample dump must contain the complete divergent output cone');
    }
  }
});

test('Fischer central zone represents half the pupil area, not half its diameter', async () => {
  const loaded = await scene();
  const mask = loaded.elements.find(element => element.id === 'central-pi-mask');
  assert.equal(mask.params.profile, 'pupil');
  assert.equal(mask.params.centralAreaFraction, 0.5);
  assert.ok(Math.abs(phasePlateCentralDiameterFraction(mask.params.centralAreaFraction) - Math.sqrt(0.5)) < 1e-12);
  assert.equal(phasePlateOpdFraction('pupil', 0.5, 0.5), 1);
  assert.equal(phasePlateOpdFraction('pupil', 0.05, 0.5), 0);

  mask.params.centralAreaFraction = 0;
  assert.equal(phasePlateOpdFraction('pupil', 0.5, mask.params.centralAreaFraction), 0,
    'the mechanism-off boundary must remove the central zone');
});

test('Fischer controls switch real traced behavior without claiming depletion kinetics', async () => {
  const loaded = await scene();
  const depletion = loaded.elements.find(element => element.id === 'depletion-source');
  depletion.params.enabled = false;
  let result = traceScene(loaded.elements);
  assert.equal(result.signalHits.some(hit => Math.abs(hit.wavelengthNm - 532) < 0.001), false);
  assert.equal(result.signalHits.some(hit => Math.abs(hit.wavelengthNm - 810) < 0.001), true);

  const excitation = loaded.elements.find(element => element.id === 'excitation-source');
  excitation.params.enabled = false;
  depletion.params.enabled = true;
  result = traceScene(loaded.elements);
  assert.equal(result.signalHits.length, 1, 'CW depletion still reaches the sample');
  assert.ok(Math.abs(result.signalHits[0].wavelengthNm - 532) < 0.001);
  assert.equal(result.writeHits.length, 0);

  const stage = loaded.elements.find(element => element.id === 'detc-peta-stage');
  assert.equal(2 * stage.params.pzTravelXY * stage.params.pzFreqXY, 0.1,
    'the interpreted triangle sweep runs at the reported 0.1 mm/s');
  stage.params.pzMode = 'static';
  assert.deepEqual(stageOffsetAt(stage.params, 13.7), { x: 0, y: 0 });
});

test('Fischer scene survives native save/reload and exposes only exact paper handoff fields', async () => {
  const loaded = await scene();
  const roundTrip = parseSketch(JSON.stringify({
    app: 'optics2d', version: 1, elements: loaded.elements, beams: loaded.beams,
  }), registry);
  assert.deepEqual(roundTrip, loaded);

  const handoff = buildPaperHandoff({ wavelengthNm: 810, numericalAperture: 1.4 });
  assert.deepEqual(handoff.imported.map(field => field.key), ['wavelengthNm', 'numericalAperture']);
  assert.deepEqual(handoff.omitted.map(field => field.key), [
    'sourcePowerMw', 'repetitionRateMHz', 'pulseDurationFs',
  ]);
  assert.equal(new URL(handoff.url).searchParams.get('basis'), 'paper');
});

test('collection loader and evidence note keep interpretation and model limits explicit', async () => {
  const [main, note] = await Promise.all([
    readFile(new URL('../sketch/js/main.js', import.meta.url), 'utf8'),
    readFile(new URL('../collections/2pp/research/fischer-2011.md', import.meta.url), 'utf8'),
  ]);
  assert.match(main, /fetch\(collectionRequest\.path\)/);
  assert.match(main, /hasLinkedScene && loadLinked/,
    'both the locked preview and editable literature scene must fit the full apparatus');
  assert.match(note, /Free interpretation — not specified in the paper/);
  assert.match(note, /does \*\*not\*\* compute stimulated-emission depletion/);
  assert.match(note, /not a vortex doughnut/);
});


test('Fischer mask spans the relayed pupil and the glyph matches its phase zone', async () => {
  const loaded = await scene();
  const mask = loaded.elements.find(element => element.id === 'central-pi-mask');
  const objective = loaded.elements.find(element => element.id === 'leica-objective');
  const relay = loaded.elements.find(element => element.id === 'common-relay-l2');
  const source = loaded.elements.find(element => element.id === 'depletion-source');
  assert.equal(mask.params.aperture, source.params.beamWidth,
    'the beam must illuminate both the central phase zone and the outer annulus');
  assert.equal(mask.params.aperture, objectivePupilDiameter(objective.params),
    'the 1:1 relay matches the authored mask diameter to the realized objective pupil');
  assert.equal(objective.x + objectiveStopX(objective.params), relay.x + relay.params.f,
    'the relayed mask plane must land on the traced pupil stop');
  const halfHeight = mask.params.aperture / 2 * Math.sqrt(0.5);
  assert.ok(registry.phaseplate.svg(mask).includes(`M -4,${-halfHeight} L 4,${-halfHeight}`));
  mask.params.centralAreaFraction = 1;
  assert.ok(registry.phaseplate.svg(mask).includes('M -4,-2.8 L 4,-2.8'));
  mask.params.centralAreaFraction = 0;
  assert.ok(registry.phaseplate.svg(mask).includes('M -4,0 L 4,0'));
});


test('Fischer pupil readout measures phase contrast actually sampled by the beam', async () => {
  const loaded = await scene();
  const mask = loaded.elements.find(element => element.id === 'central-pi-mask');
  const readout = registry.phaseplate.params.find(param => param.key === 'phaseFringes').readout;
  traceScene(loaded.elements);
  assert.match(readout(mask.params, mask), /^0\.50 at 532 nm/);
  for (const centralAreaFraction of [0, 1]) {
    mask.params.centralAreaFraction = centralAreaFraction;
    traceScene(loaded.elements);
    assert.match(readout(mask.params, mask), /^0\.00 at 532 nm/,
      'an empty or uniformly retarded pupil has no differential phase');
  }
  mask.params.centralAreaFraction = 0.5;
  mask.params.aperture = 12;
  traceScene(loaded.elements);
  assert.match(readout(mask.params, mask), /^0\.00 at 532 nm/,
    'a central zone covering the entire beam must not claim a half-wave phase contrast');
});


test('Fischer collection transfers only its explicitly reviewed numerical subset', async () => {
  const { papers } = JSON.parse(await readFile(new URL('../collections/2pp/papers.json', import.meta.url), 'utf8'));
  const handoff = reviewedPaperHandoff(papers.find(paper => paper.id === 'fischer-2011'));
  assert.deepEqual(handoff.imported.map(field => [field.key, field.value]), [
    ['wavelengthNm', 810], ['numericalAperture', 1.4],
  ]);
});
