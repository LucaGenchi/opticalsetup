import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { initInspector, renderInspector } from '../sketch/js/inspector.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { state } from '../sketch/js/state.js';
import {
  buildTwoPhotonHandoffUrl, TWO_PHOTON_LAB_URL, twoPhotonLaserCandidates,
} from '../sketch/js/two-photon-handoff.js';

function pulsedLaser(id = 'laser-1') {
  const laser = createElement('laser', 0, 0);
  laser.id = id;
  Object.assign(laser.params, {
    wavelength: 780,
    avgPowerW: 0.016,
    temporalMode: 'pulsed',
    repRateMHz: 80,
    pulseWidthFs: 100,
  });
  return laser;
}

test('builds a versioned Two-Photon Lab URL with explicit units', () => {
  const href = buildTwoPhotonHandoffUrl(pulsedLaser());
  assert.equal(href,
    'https://twophotonlithography.com/lab?from=opticalsetup&v=1&wavelengthNm=780&sourcePowerMw=16&repetitionRateMHz=80&pulseDurationFs=100');
  const url = new URL(href);
  assert.equal(`${url.origin}${url.pathname}`, TWO_PHOTON_LAB_URL);
  assert.equal(url.searchParams.get('from'), 'opticalsetup');
  assert.equal(url.searchParams.get('v'), '1');
  assert.equal(url.searchParams.get('wavelengthNm'), '780');
  assert.equal(url.searchParams.get('sourcePowerMw'), '16');
  assert.equal(url.searchParams.get('repetitionRateMHz'), '80');
  assert.equal(url.searchParams.get('pulseDurationFs'), '100');
});

test('keeps user-authored laser labels out of the numeric-only URL contract', () => {
  const laser = pulsedLaser();
  laser.label = '<img src=x onerror=alert(1)>';
  assert.doesNotMatch(buildTwoPhotonHandoffUrl(laser), /img|onerror|label/i);
});

test('preserves an allowed destination base URL while replacing handoff keys', () => {
  const url = new URL(buildTwoPhotonHandoffUrl(
    pulsedLaser(),
    'https://example.test/custom?keep=1&v=old',
  ));
  assert.equal(url.origin, 'https://example.test');
  assert.equal(url.pathname, '/custom');
  assert.equal(url.searchParams.get('keep'), '1');
  assert.equal(url.searchParams.get('v'), '1');
});

test('rejects incompatible, continuous-wave, and malformed sources', () => {
  const cw = pulsedLaser();
  cw.params.temporalMode = 'cw';
  assert.equal(buildTwoPhotonHandoffUrl(cw), null);

  const supercontinuum = { ...pulsedLaser(), type: 'sclaser' };
  assert.equal(buildTwoPhotonHandoffUrl(supercontinuum), null);

  for (const [key, value] of [
    ['wavelength', Number.NaN],
    ['avgPowerW', -1],
    ['repRateMHz', 0],
    ['pulseWidthFs', Number.POSITIVE_INFINITY],
    ['wavelength', 488],
    ['avgPowerW', 1.001],
    ['repRateMHz', 101],
    ['pulseWidthFs', 401],
  ]) {
    const malformed = pulsedLaser();
    malformed.params[key] = value;
    assert.equal(buildTwoPhotonHandoffUrl(malformed), null, `${key} should be rejected`);
  }
});

test('resolves only ordinary pulsed lasers traced to the selected stage', () => {
  const first = pulsedLaser('first');
  const second = pulsedLaser('second');
  const cw = pulsedLaser('cw');
  cw.params.temporalMode = 'cw';
  const hits = [
    { stageId: 'stage-a', sourceId: 'first' },
    { stageId: 'stage-a', sourceId: 'first' },
    { stageId: 'stage-a', sourceId: 'second' },
    { stageId: 'stage-a', sourceId: 'cw' },
    { stageId: 'stage-b', sourceId: 'second' },
  ];

  assert.deepEqual(
    twoPhotonLaserCandidates([first, second, cw], hits, 'stage-a').map(laser => laser.id),
    ['first', 'second'],
  );
  assert.deepEqual(twoPhotonLaserCandidates([first], hits, 'missing-stage'), []);
});

test('uses real traced stage hits and exposes every incident pulsed laser explicitly', () => {
  const first = pulsedLaser('first');
  const second = pulsedLaser('second');
  const nonincident = pulsedLaser('off-axis');
  nonincident.y = 100;
  const stage = createElement('stage', 150, 0);
  Object.assign(stage.params, { containsSample: true, sampleKind: 'resin' });
  const elements = [first, second, nonincident, stage];
  const { signalHits } = traceScene(elements);

  assert.deepEqual(
    twoPhotonLaserCandidates(elements, signalHits, stage.id).map(laser => laser.id),
    ['first', 'second'],
  );
});

function stageInspectorHTML(laser, stage) {
  const panel = {
    innerHTML: '',
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  state.elements = [laser, stage];
  state.beams = [];
  state.selection = { kind: 'element', id: stage.id };
  state.demoMode = false;
  traceScene(state.elements, state.beams);
  initInspector(panel);
  renderInspector();
  return panel.innerHTML;
}

test('the mounted resin inspector links the laser that actually illuminates it', () => {
  const laser = pulsedLaser();
  laser.label = 'Writer A';
  const stage = createElement('stage', 150, 0);
  Object.assign(stage.params, { containsSample: true, sampleKind: 'resin', voxelPreview: true });

  const html = stageInspectorHTML(laser, stage);
  assert.match(html, /Continue the 2PP workflow/);
  assert.match(html, /Open Two-Photon Lab with Writer A/);
  assert.match(html, /href="https:\/\/twophotonlithography\.com\/lab\?from=opticalsetup&amp;v=1&amp;/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});

test('the inspector explains missing pulse illumination and stays hidden for other samples', () => {
  const laser = pulsedLaser();
  laser.params.temporalMode = 'cw';
  const stage = createElement('stage', 150, 0);
  Object.assign(stage.params, { containsSample: true, sampleKind: 'resin' });
  assert.match(stageInspectorHTML(laser, stage), /Aim a compatible ordinary pulsed Laser/);
  assert.doesNotMatch(stageInspectorHTML(laser, stage), /class="two-photon-link"/);

  stage.params.sampleKind = 'generic';
  assert.doesNotMatch(stageInspectorHTML(laser, stage), /Continue the 2PP workflow/);
});
