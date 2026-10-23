// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The caches that keep specimen emission fast must never change a result:
// a cached answer equals a fresh one, between traces, between scenes, and
// once a cache has filled up.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from '../sketch/js/elements.js';
import { applyTransmission, gaussianSpectrum } from '../sketch/js/spectrum.js';
import { traceScene, getTraceRevision, detectorReading, specimenIncidentBeams } from '../sketch/js/raytrace.js';
import { SceneTraceCache } from '../sketch/js/point-source-rendering.js';
import { sceneFromFile } from '../tools/update-golden.mjs';

const example = name => sceneFromFile(readFileSync(
  new URL(`../Examples/Microscopy Implementations/${name}.json`, import.meta.url), 'utf8'));
const SECTIONING = 'Optical sectioning — linear versus nonlinear';
const EPI = 'Epi-fluorescence microscope';

// Everything the tracer reports for a scene, at full precision.
function report(scene) {
  const result = traceScene(scene.elements, scene.beams);
  return JSON.stringify({
    drawables: result.drawables, pulseTracks: result.pulseTracks,
    writeHits: result.writeHits, signalHits: result.signalHits,
    readings: scene.elements.map(el => [detectorReading(el.id), specimenIncidentBeams(el.id)]),
  }, (key, value) => (key === 'el' ? undefined : value));
}

test('box-filter transmissions are reused without changing their result', () => {
  const spec = gaussianSpectrum(520, 40);
  const longpass = wl => (wl >= 510 ? 1 : 0);
  const first = applyTransmission(spec, 520, longpass, [510]);
  const fresh = applyTransmission(structuredClone(spec), 520, longpass, [510]);
  assert.ok(first.fraction > 0 && first.fraction < 1);
  assert.deepEqual(first, fresh);
  first.fraction = 0;
  first.wl = NaN;
  const again = applyTransmission(spec, 520, longpass, [510]);
  assert.deepEqual(again, fresh, 'a caller changing its result does not reach the next caller');
  // Same profile and edge, different transmission on either side.
  const half = applyTransmission(spec, 520, wl => (wl >= 510 ? 0.5 : 0), [510]);
  assert.ok(Math.abs(half.fraction - fresh.fraction / 2) < 1e-12);
  // A blocked result stays blocked.
  assert.equal(applyTransmission(spec, 520, () => 0, [510]), null);
  // Far more distinct edges than one profile keeps: every answer still equals
  // a fresh computation, and the first edge comes back the same.
  for (let i = 0; i < 200; i++) {
    const edge = 470 + i * 0.5;
    const fn = wl => (wl >= edge ? 1 : 0);
    assert.deepEqual(applyTransmission(spec, 520, fn, [edge]),
      applyTransmission(structuredClone(spec), 520, fn, [edge]));
  }
  assert.deepEqual(applyTransmission(spec, 520, longpass, [510]), fresh);
});

test('two pulses in one scene read as they do alone', () => {
  // Two lasers alike but for their colour, each through a filter that cuts
  // its band: nothing one pulse leaves in a per-trace cache reaches the other.
  const line = (wavelength, y) => {
    const place = (type, x, params) => {
      const element = createElement(type, x, y);
      Object.assign(element.params, params);
      return element;
    };
    return [
      place('pulsedlaser', 0, { wavelength, beamMode: 'line', transformLimited: false, bandwidth: 30, chirpGddFs2: 0 }),
      place('filter', 150, { ftype: 'bandpass', center: wavelength, band: 10 }),
      place('detector', 400, { aperture: 40 }),
    ];
  };
  const pulseAt = (elements, detector) => {
    traceScene(elements);
    return JSON.stringify(detectorReading(detector.id).pulse);
  };
  const a = line(800, 0), b = line(1030, 200);
  const alone = [pulseAt(a, a[2]), pulseAt(b, b[2])];
  assert.match(JSON.parse(alone[1]).dispersionModel, /^Filtered spectrum/);
  assert.deepEqual([pulseAt([...a, ...b], a[2]), pulseAt([...a, ...b], b[2])], alone);
  assert.deepEqual([pulseAt([...b, ...a], a[2]), pulseAt([...b, ...a], b[2])], alone);
});

test('a repeated trace reports exactly what the first one did, whatever was traced between', () => {
  const sectioning = example(SECTIONING);
  const first = report(sectioning);
  report(example(EPI));
  assert.equal(report(sectioning), first);
  assert.equal(report(example(SECTIONING)), first, 'a freshly opened copy traces the same');
});

test('every scene goes through the trace cache, and a vector scene is traced as before', () => {
  const scene = example(SECTIONING);
  const cache = new SceneTraceCache(traceScene, getTraceRevision);
  const cached = cache.get(scene.elements, scene.beams);
  assert.deepEqual(cached.drawables, traceScene(scene.elements, scene.beams).drawables);
  assert.ok(!cached.drawables.some(d => d.pointSourceCanvas), 'only dense point sources go to pixels');
  const again = cache.get(scene.elements, scene.beams);
  const revision = getTraceRevision();
  assert.equal(cache.get(scene.elements, scene.beams), again, 'a pan or a selection does not re-trace');
  assert.equal(getTraceRevision(), revision);
  scene.elements.find(el => el.type === 'objective').x += 1;
  assert.notEqual(cache.get(scene.elements, scene.beams), again, 'a drag does');
  const canvasSource = readFileSync(new URL('../sketch/js/canvas.js', import.meta.url), 'utf8');
  assert.doesNotMatch(canvasSource, /traceScene\(/, 'the canvas never bypasses the cache');
});

test('canvas beam shapes use fill and stroke opacity, not a layer each', () => {
  // Element opacity made the browser composite each of the thousands of
  // emission glow strokes on its own, on every pan and zoom.
  const canvasSource = readFileSync(new URL('../sketch/js/canvas.js', import.meta.url), 'utf8');
  const renderBeams = canvasSource.slice(canvasSource.indexOf('function renderBeams('),
    canvasSource.indexOf('function renderVoxels('));
  const shapes = renderBeams.match(/<(polyline|polygon|circle) [^\n]*/g);
  assert.equal(shapes.length, 3);
  for (const shape of shapes) assert.doesNotMatch(shape, /\sopacity=/);
});
