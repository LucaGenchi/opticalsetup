// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The LED is a packaged source: a die behind its own collimator. It leaves
// as a collimated beam of ordinary rays, carries an illustrative LED
// spectrum, and is incoherent by design -- it never interferes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createElement, registry } from '../sketch/js/elements.js';
import { detectorReading, traceAll, traceScene } from '../sketch/js/raytrace.js';
import { LED_PRESETS, ledSpectrum, resolveSourceSpectrum, spectrumWeight } from '../sketch/js/spectrum.js';
import { parseSketch, serialize, state } from '../sketch/js/state.js';

function machZehnder(sourceType) {
  const fixture = new URL('./fixtures/mach-zehnder.json', import.meta.url);
  const scene = parseSketch(readFileSync(fixture, 'utf8'), registry);
  if (sourceType !== 'cwlaser') {
    const laser = scene.elements.find(el => el.type === 'cwlaser');
    const led = createElement(sourceType, laser.x, laser.y);
    led.rot = laser.rot;
    Object.assign(led.params, { ledPreset: 'green', beamMode: 'beam', beamWidth: laser.params.beamWidth });
    scene.elements[scene.elements.indexOf(laser)] = led;
  }
  return scene;
}

function portSignals(scene, delayMm) {
  scene.elements.find(el => el.type === 'delayline').params.delayMm = delayMm;
  traceAll(scene.elements);
  return scene.elements.filter(el => el.type === 'camera').map(camera => detectorReading(camera.id).signal);
}

test('the LED is its own visible source, and the pre-launch `led` type stays unknown', () => {
  assert.equal(registry.ledsource.label, 'LED');
  assert.equal(registry.ledsource.category, 'Sources');
  assert.ok(!registry.ledsource.hidden);
  assert.ok(registry.ledsource.aliases.includes('led'), 'found by searching "led"');
  assert.equal(Object.hasOwn(registry, 'led'), false);
  assert.equal(registry.ledsource.params.some(param => /coheren/i.test(param.key)), false,
    'the LED exposes no coherence setting');
});

test('the built-in collimator emits a parallel beam of ordinary rays across the set width', () => {
  const led = createElement('ledsource', 0, 0);
  led.params.beamWidth = 12;
  const rays = registry.ledsource.source(led);
  assert.ok(rays.length > 1);
  assert.ok(rays.every(ray => ray.dx === 1 && ray.dy === 0), 'every ray leaves along the axis');
  assert.ok(rays.every(ray => !ray.evan), 'none is a short-range point-source ray');
  assert.equal(Math.max(...rays.map(ray => ray.y)) - Math.min(...rays.map(ray => ray.y)), 12);

  // It reaches a distant detector whole, where a bare point source fades.
  const far = createElement('detector', 2000, 0);
  far.params.length = 40;
  traceAll([led, far]);
  assert.ok(Math.abs(detectorReading(far.id).signal - 1) < 1e-9);
});

test('single-colour presets are one band; white is a blue peak and a phosphor band', () => {
  for (const [key, preset] of Object.entries(LED_PRESETS)) {
    const resolved = resolveSourceSpectrum('ledsource', { ledPreset: key });
    assert.ok(Number.isFinite(resolved.wl) && resolved.bw > 0, key);
    if (preset.bands.length === 1) {
      assert.deepEqual(resolved.spec, { kind: 'gauss', center: preset.bands[0].center, fwhm: preset.bands[0].fwhm });
    }
  }
  const white = ledSpectrum({ ledPreset: 'white' });
  assert.equal(white.kind, 'sampled');
  assert.ok(white.w.every(Number.isFinite));
  const blue = spectrumWeight(white, 450), dip = spectrumWeight(white, 490), phosphor = spectrumWeight(white, 580);
  assert.ok(blue > dip + 0.2 && phosphor > dip + 0.2, 'two peaks with a dip between them, not one hump');
});

test('a filter removes one band of the white LED and leaves the other; the two parts add up', () => {
  const read = (ftype, cutoff) => {
    const led = createElement('ledsource', 0, 0);
    const filter = createElement('filter', 150, 0);
    Object.assign(filter.params, { ftype, cutoff });
    const detector = createElement('detector', 300, 0);
    traceAll([led, filter, detector]);
    return detectorReading(detector.id);
  };
  const phosphor = read('longpass', 500), blue = read('shortpass', 500);
  assert.ok(phosphor.wavelength > 540 && phosphor.bandMin >= 500 - 1e-6);
  assert.ok(blue.wavelength < 470 && blue.bandMax <= 500 + 1e-6);
  assert.ok(blue.signal > 0.02 && blue.signal < phosphor.signal, 'the phosphor band carries most of the power');
  assert.ok(Math.abs(blue.signal + phosphor.signal - 1) < 1e-3, `parts sum to ${blue.signal + phosphor.signal}`);
});

test('the LED never interferes: an interferometer that swaps ports for a laser reads steady powers', () => {
  // The delay line folds the beam, so 0.000266 mm of travel is half a wave
  // of path at 532 nm: the laser's light moves from one port to the other.
  const laser = machZehnder('cwlaser');
  const laserAt0 = portSignals(laser, 0), laserSwapped = portSignals(laser, 0.000266);
  assert.ok(laserAt0[0] > 0.99 && laserSwapped[0] < 0.01, 'the laser reference does swap ports');

  const led = machZehnder('ledsource');
  for (const delayMm of [0, 0.0000665, 0.000266]) {
    const signals = portSignals(led, delayMm);
    assert.ok(Math.abs(signals[0] - 0.5) < 1e-6 && Math.abs(signals[1] - 0.5) < 1e-6,
      `each port holds half the power at ${delayMm} mm, got ${signals}`);
  }
  // Even made as narrow as the field allows, and sized, it is power-only.
  const narrow = led.elements.find(el => el.type === 'ledsource');
  Object.assign(narrow.params, { ledPreset: 'custom', wavelength: 532, bandwidth: 0 });
  assert.deepEqual(portSignals(led, 0.000266).map(v => Number(v.toFixed(6))), [0.5, 0.5]);
});

test('malformed LED parameters still give a finite spectrum and a drawable beam', () => {
  for (const params of [
    { ledPreset: 'no-such-preset' },
    { ledPreset: 'custom', wavelength: Number.NaN, bandwidth: Number.POSITIVE_INFINITY },
    { ledPreset: 'custom', wavelength: -5, bandwidth: -1 },
    {},
  ]) {
    const { wl, bw, spec } = resolveSourceSpectrum('ledsource', params);
    assert.ok(Number.isFinite(wl) && wl > 0 && Number.isFinite(bw) && bw >= 5 && spec, JSON.stringify(params));
  }
  const led = createElement('ledsource', 0, 0);
  Object.assign(led.params, { ledPreset: 'custom', wavelength: 620, bandwidth: 9999 });
  state.elements = [led];
  state.beams = [];
  const reopened = parseSketch(serialize(), registry).elements[0];
  assert.equal(reopened.type, 'ledsource');
  assert.equal(reopened.params.wavelength, 620);
  assert.equal(reopened.params.bandwidth, 200, 'the width is clamped at the schema boundary');
  const drawn = traceScene([reopened], []).drawables;
  assert.doesNotMatch(JSON.stringify(drawn), /NaN|Infinity|null/);
});

test('a white LED beam is drawn as mixed light and a single-colour one in its own colour', () => {
  const colors = preset => {
    const led = createElement('ledsource', 0, 0);
    led.params.ledPreset = preset;
    return new Set(traceScene([led, createElement('beamdump', 300, 0)], []).drawables.map(d => d.color));
  };
  assert.deepEqual([...colors('white')], ['#cbd8ea']);
  const red = [...colors('red')];
  assert.equal(red.length, 1);
  assert.notEqual(red[0], '#cbd8ea');
});
