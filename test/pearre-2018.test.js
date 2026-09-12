import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { registry, getVisualBounds } from '../sketch/js/elements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { reviewedPaperHandoff, readCollectionSetups } from '../tools/2pp-collection-support.mjs';

const sceneText = await readFile(new URL('../collections/2pp/setups/pearre-2018.json', import.meta.url), 'utf8');
const loadScene = () => parseSketch(sceneText, registry);
const { papers } = JSON.parse(await readFile(new URL('../collections/2pp/papers.json', import.meta.url), 'utf8'));

test('Pearre scene round-trips and keeps reported kHz and MHz quantities distinct', () => {
  const scene = loadScene();
  const reloaded = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, ...scene }), registry);
  assert.deepEqual(reloaded, scene);
  const laser = scene.elements.find(el => el.id === 'pearre-laser');
  const pockels = scene.elements.find(el => el.id === 'pearre-eom');
  const scanner = scene.elements.find(el => el.id === 'pearre-resonant-x');
  assert.equal(laser.params.repRateMHz, 80);
  assert.equal(pockels.params.switchFreqMHz, 3.33);
  assert.equal(scanner.params.resonanceFrequencyKHz, 7.91);
});

test('Pearre default and resonant extrema keep a computed objective-to-resin route', () => {
  const scene = loadScene();
  const scanner = scene.elements.find(el => el.id === 'pearre-resonant-x');
  const hits = [];
  for (const phase of [0, 0.25, 0.75]) {
    scanner._animationTimeS = phase / (scanner.params.resonanceFrequencyKHz * 1000);
    const traced = traceScene(scene.elements, scene.beams);
    assert.equal(traced.signalHits.length, 1);
    assert.equal(traced.writeHits.length, 1);
    assert.equal(traced.signalHits[0].objectiveNA, 0.8);
    hits.push(traced.signalHits[0].x);
  }
  assert.notEqual(hits[1], hits[2], 'resonant motion must move the downstream sample hit');
});

test('Pearre controls remove emission and change Pockels-addressed monitor signal', () => {
  const scene = loadScene();
  const laser = scene.elements.find(el => el.id === 'pearre-laser');
  const eom = scene.elements.find(el => el.id === 'pearre-eom');
  const enabled = traceScene(scene.elements, scene.beams);
  assert.equal(enabled.writeHits.length, 1);
  laser.params.enabled = false;
  assert.equal(traceScene(scene.elements, scene.beams).writeHits.length, 0);

  laser.params.enabled = true;
  laser.params.avgPowerW = 0;
  assert.equal(traceScene(scene.elements, scene.beams).writeHits.length, 0, 'zero optical power cannot write');
  laser.params.avgPowerW = 0.8;
  eom.params.switchDuty = 0.1;
  traceScene(scene.elements, scene.beams);
  const mostlyOpen = detectorReading('pearre-monitor').signal;
  eom.params.switchDuty = 0.9;
  traceScene(scene.elements, scene.beams);
  const mostlyClosed = detectorReading('pearre-monitor').signal;
  assert.ok(mostlyOpen > mostlyClosed * 5);
});

test('Pearre paper handoff uses its reviewed subset and omits typical, approximate and ranged values', () => {
  const result = reviewedPaperHandoff(papers.find(paper => paper.id === 'pearre-2018'));
  const query = new URL(result.url).searchParams;
  assert.equal(query.get('repetitionRateMHz'), '80');
  assert.equal(query.get('basis'), 'paper');
  assert.equal(query.get('numericalAperture'), '0.8');
  assert.equal(query.has('wavelengthNm'), false);
  assert.equal(query.has('pulseDurationFs'), false);
  assert.equal(query.has('sourcePowerMw'), false);
  assert.equal(query.has('switchFreqMHz'), false);
  assert.equal(query.has('resonanceFrequencyKHz'), false);
  assert.equal(loadScene().elements.find(el => el.id === 'pearre-resin').params.handoffEnabled, false);
});


test('Pearre labels and native components fit the exported Figure frame', () => {
  const scene = loadScene();
  const frame = getVisualBounds(scene.elements.find(el => el.type === 'figureframe'), { includeLabel: false });
  for (const element of scene.elements) {
    const bounds = getVisualBounds(element);
    assert.ok(bounds.x0 >= frame.x0 && bounds.x1 <= frame.x1
      && bounds.y0 >= frame.y0 && bounds.y1 <= frame.y1, `${element.id} extends outside the export crop`);
    if (element.showLabel) assert.doesNotMatch(element.label, /\n/, 'native component labels are one line');
  }
});

test('Pearre slow-Y control independently moves the focus while a held resonant mirror stays still', () => {
  const scene = loadScene();
  const resonant = scene.elements.find(el => el.type === 'resonantscanner');
  const slowY = scene.elements.find(el => el.id === 'pearre-slow-y');
  resonant.params.scanAmplitude = 0;
  slowY.params.scanMode = 'triangle';
  const hitAt = time => {
    slowY._animationTimeS = time;
    const result = traceScene(scene.elements, scene.beams);
    assert.equal(result.writeHits.length, 1);
    return result.writeHits[0].x;
  };
  assert.notEqual(hitAt(0.25 / 30), hitAt(0.75 / 30));
  slowY.params.scanMode = 'static';
  assert.equal(hitAt(0), hitAt(1));
});


test('Pearre collection page uses the common loader and discovers the authored scene', async () => {
  const setups = await readCollectionSetups(new URL('../collections/2pp/', import.meta.url).pathname, papers);
  assert.ok(setups.has('pearre-2018'));
  const page = await readFile(new URL('../collections/2pp/pearre-2018/index.html', import.meta.url), 'utf8');
  assert.match(page, /\/sketch\/\?paper=pearre-2018&amp;edit=1/);
  assert.match(page, /\/sketch\/\?paper=pearre-2018&amp;embed=1/);
  assert.match(page, /basis=paper&amp;repetitionRateMHz=80&amp;numericalAperture=0.8/);
});
