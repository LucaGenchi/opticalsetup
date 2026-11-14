// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Issue #313, step A5: every detector readout states what it assumes about
// the direction out of the drawing plane. A detailed readout always shows it;
// a summary only when it is not "in the drawing plane".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import {
  READING_DESCRIPTORS, READING_SCOPES, READOUT_SCOPES, notableScopes, scopeTag, statedScopes,
} from '../sketch/js/readout-scope.js';
import { examples } from '../sketch/js/examples-data.js';

const at = (type, x, y, params = {}, rot = 0, id = type) => {
  const element = createElement(type);
  return Object.assign(element, { id, x, y, rot, params: { ...element.params, ...params } });
};
const laser = () => at('cwlaser', 0, 0, { beamMode: 'beam', beamWidth: 4, wavelength: 633, avgPowerW: 0.001 }, 0, 'laser');

function screen(elements, sensorId, view, displayScale) {
  const display = at('display', 0, 200, { sensorId, displayView: view, screenOn: true, ...(displayScale ? { displayScale } : {}) }, 0, 'screen');
  traceScene([...elements, display], []);
  return registry.display.svg(display, [...elements, display]);
}

test('the four scopes of issue #313 and nothing else', () => {
  assert.deepEqual(Object.keys(READOUT_SCOPES), ['plane', 'outOfPlane', 'meridional', 'circular']);
  assert.equal(READOUT_SCOPES.circular.label, 'Assumes a circular beam');
  for (const id of Object.values(READING_SCOPES)) assert.ok(READOUT_SCOPES[id], `unknown scope ${id}`);
});

test('every quantity of every detector reading in the examples carries a scope', () => {
  const unknown = new Set();
  let readings = 0;
  for (const entry of examples) {
    const file = decodeURIComponent(entry.path.replace('../Examples/', ''));
    const scene = parseSketch(readFileSync(new URL(`../Examples/${file}`, import.meta.url), 'utf8'), registry);
    traceScene(scene.elements, scene.beams);
    for (const element of scene.elements) {
      if (!registry[element.type]?.readoutKind) continue;
      const reading = enhancedReading(element, scene.elements);
      if (!reading) continue;
      readings++;
      for (const key of Object.keys(reading)) {
        if (READING_DESCRIPTORS.has(key)) continue;
        if (!(key in READING_SCOPES)) unknown.add(key);
        else assert.equal(reading.scope[key], READING_SCOPES[key], `${entry.name}: ${element.id}.${key}`);
      }
    }
  }
  assert.ok(readings > 50, `only ${readings} readings checked`);
  assert.deepEqual([...unknown], [],
    'a reading carries a quantity with no scope: add it to READING_SCOPES, or to READING_DESCRIPTORS if it measures nothing');
});

test('a reading lists a scope only for the quantities it holds', () => {
  traceScene([laser(), at('powermeter', 300, 0)], []);
  const reading = detectorReading('powermeter');
  assert.equal(reading.scope.signal, 'plane');
  assert.equal(reading.scope.beamDiameter, undefined, 'beamDiameter belongs to the enhanced reading');
  assert.equal(reading.scope.approximations, undefined, 'a caveat list measures nothing');
  assert.deepEqual(notableScopes(reading.scope), []);
});

test('"in the drawing plane" is stated by the camera and the wavefront detector, in detail only', () => {
  const camera = [laser(), at('camera', 300, 0)];
  const general = [laser(), at('generaldetector', 300, 0)];
  assert.match(screen(camera, 'camera', 'detail'), /DETAIL · IN PLANE/);
  assert.doesNotMatch(screen(camera, 'camera', 'main'), /IN PLANE/);
  // A small screen uses the compact renderer, which states it too (Andrea's
  // review: at scale 0.3 the tag was missing).
  for (const scale of [0.3, 0.6, 1]) {
    assert.match(screen(camera, 'camera', 'detail', scale), /IN PLANE/, `detail at scale ${scale}`);
    assert.doesNotMatch(screen(camera, 'camera', 'main', scale), /IN PLANE/, `summary at scale ${scale}`);
    assert.doesNotMatch(screen(general, 'generaldetector', 'detail', scale), /IN PLANE/, `general detector at scale ${scale}`);
  }
  traceScene([laser(), at('wavefrontdetector', 300, 0)], []);
  assert.deepEqual(statedScopes(detectorReading('wavefrontdetector'), 'detail').map(scope => scope.id), ['plane']);
  assert.deepEqual(statedScopes(detectorReading('wavefrontdetector'), 'main'), []);
  // Power, spectrum, polarization and timing do not depend on how the light
  // is spread across the beam: these detectors leave the plane unsaid.
  assert.doesNotMatch(screen(general, 'generaldetector', 'detail'), /IN PLANE/);
  assert.doesNotMatch(screen(general, 'generaldetector', 'main'), /IN PLANE/);
  for (const type of ['powermeter', 'polarimeter', 'spectrometer', 'detector']) {
    traceScene([laser(), at(type, 300, 0)], []);
    const reading = detectorReading(type);
    assert.ok(reading, `${type} reads the beam`);
    assert.equal(reading.scope.signal, 'plane', `${type} still carries its scope`);
    assert.deepEqual(statedScopes(reading, 'detail'), [], `${type} states none`);
  }
});

test('any scope other than the plane is stated by every detector, summary included', () => {
  const power = { readoutKind: 'power', scope: { signal: 'plane', area: 'circular' } };
  assert.equal(scopeTag(power, 'main'), 'CIRCULAR BEAM');
  assert.equal(scopeTag(power, 'detail'), 'CIRCULAR BEAM');
  const camera = { readoutKind: 'camera', scope: { profile: 'plane', area: 'circular' } };
  assert.equal(scopeTag(camera, 'main'), 'CIRCULAR BEAM');
  assert.equal(scopeTag(camera, 'detail'), 'IN PLANE + CIRCULAR BEAM');
  assert.equal(scopeTag({ readoutKind: 'camera', scope: { profile: 'plane' } }, 'detail'), 'IN PLANE');
  assert.equal(scopeTag(null, 'detail'), '');
});
