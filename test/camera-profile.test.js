import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { cameraProfileFromHits } from '../sketch/js/camera-profile.js';
import { createElement, registry } from '../sketch/js/elements.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';

const close = (actual, expected, tolerance = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
};

const sum = values => values.reduce((total, value) => total + value, 0);

function route({
  key = 'path-a', source = 'laser', coherence = source, totalPower = 0.5,
  phase = 0, pol = 0, opl = () => 100, wavelength = 635, samples = 25,
  u0 = 0.3, u1 = 0.7, sampleGrid = null,
} = {}) {
  return Array.from({ length: samples }, (_, sample) => {
    const fraction = samples === 1 ? 0.5 : sample / (samples - 1);
    return {
      power: totalPower / samples,
      u: u0 + (u1 - u0) * fraction,
      wl: wavelength,
      sourceId: source,
      pathKey: key,
      sample,
      sampleCount: samples,
      sampleGrid,
      coherenceId: coherence,
      phaseValid: coherence !== null,
      phaseOffset: phase,
      oplMm: opl(fraction),
      pol,
    };
  });
}

function occupiedIndices(profile) {
  return profile.map((value, index) => value > 1e-12 ? index : -1).filter(index => index >= 0);
}

function assertContiguous(profile) {
  const occupied = occupiedIndices(profile);
  assert.ok(occupied.length > 1);
  assert.equal(occupied[occupied.length - 1] - occupied[0] + 1, occupied.length,
    'a continuous beam must not turn into alternating occupied and empty ray-sample bins');
}

test('a single sized beam deposits as one contiguous profile at every pixel count', () => {
  const hits = route({ totalPower: 1 });
  const readings = [8, 16, 64].map(pixels => cameraProfileFromHits(hits, pixels, 30));

  for (const reading of readings) {
    close(sum(reading.profile), 1);
    assert.deepEqual(reading.profile, reading.depositedProfile, 'one path has no self-interference term');
    assert.equal(reading.profileMode, 'deposited');
    assert.equal(reading.interference.applied, false);
    assertContiguous(reading.profile);
    assert.ok(reading.profile.every(Number.isFinite));
  }

  const direct8 = readings[0].profile;
  const rebinned64 = Array.from({ length: 8 }, (_, index) => sum(readings[2].profile.slice(index * 8, index * 8 + 8)));
  direct8.forEach((value, index) => close(rebinned64[index], value, 2e-12));

  const shifted = [8, 64].map(pixels => cameraProfileFromHits(
    route({ totalPower: 1, u0: 0.301, u1: 0.701 }), pixels, 30,
  ));
  shifted.forEach(reading => close(reading.centroid, 0.03, 2e-12));
  close(shifted[0].centroid, shifted[1].centroid, 2e-12);
});

test('edge-sampled ray tubes match the authored beam width in either direction', () => {
  const expected = Array.from({ length: 64 }, (_, pixel) => pixel >= 24 && pixel < 40 ? 1 / 16 : 0);
  for (const samples of [5, 25, 101]) {
    for (const [u0, u1] of [[0.375, 0.625], [0.625, 0.375]]) {
      const reading = cameraProfileFromHits(route({
        totalPower: 1, samples, u0, u1, sampleGrid: 'edges',
      }), 64, 32);
      close(sum(reading.profile), 1, 2e-12);
      reading.profile.forEach((value, pixel) => close(value, expected[pixel], 2e-12));
    }
  }
});

test('sensor clipping deposits only the overlapping fraction of a ray tube', () => {
  const full = route({
    totalPower: 1, samples: 101, u0: -0.125, u1: 0.5, sampleGrid: 'edges',
  });
  const withSensorMisses = full.map(hit => hit.u >= 0 && hit.u <= 1
    ? hit
    : { ...hit, sensorMiss: true });
  const reading = cameraProfileFromHits(withSensorMisses, 64, 32);
  close(sum(reading.profile), 0.8, 2e-12);
  close(reading.depositedSignal, 0.8, 2e-12);
  close(sum(reading.spectralPowers.map(sample => sample.power)), 0.8, 2e-12);
});

test('sub-sample camera motion does not sawtooth a uniformly clipped beam', () => {
  for (const offset of [0, 0.25, 0.5, 0.625, 1]) {
    const u0 = (-15 - offset) / 20 + 0.5;
    const u1 = (15 - offset) / 20 + 0.5;
    const hits = route({
      totalPower: 1, samples: 25, u0, u1, sampleGrid: 'edges',
    }).map(hit => hit.u >= 0 && hit.u <= 1 ? hit : { ...hit, sensorMiss: true });
    for (const pixels of [8, 16, 64]) {
      const reading = cameraProfileFromHits(hits, pixels, 20);
      close(reading.depositedSignal, 2 / 3, 2e-12);
    }
  }
});

test('sensor-edge reconstruction never restores a sample blocked upstream', () => {
  const surviving = route({
    totalPower: 1, samples: 25, u0: 0, u1: 1, sampleGrid: 'edges',
  }).filter(hit => hit.sample !== 0);
  const reading = cameraProfileFromHits(surviving, 64, 30);
  close(reading.depositedSignal, 23.5 / 24, 2e-12);
});

test('sensor near-miss provenance distinguishes clipping from an upstream-blocked endpoint', () => {
  const full = route({
    totalPower: 1, samples: 25,
    u0: -0.5 / 30, u1: 1 + 0.5 / 30,
    sampleGrid: 'edges',
  });
  const sensorClipped = full.map(hit => hit.u >= 0 && hit.u <= 1
    ? hit
    : { ...hit, sensorMiss: true });
  close(cameraProfileFromHits(sensorClipped, 64, 30).depositedSignal, 30 / 31, 2e-12);

  const upstreamBlocked = full.filter(hit => hit.sample !== 0 && hit.sample !== 24);
  close(cameraProfileFromHits(upstreamBlocked, 64, 30).depositedSignal, 23 / 24, 2e-12);
});

test('the traced CW laser no longer exposes its 25 ray samples as camera stripes', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 12;
  const camera = createElement('camera', 300, 0);
  camera.params.ch = 30;
  const profiles = [];

  for (const pixels of [8, 64]) {
    camera.params.pixels = pixels;
    traceAll([laser, camera]);
    const reading = detectorReading(camera.id);
    close(reading.signal, 1);
    close(reading.depositedSignal, 1);
    assert.equal(reading.samples, 25);
    assert.equal(reading.profileMode, 'deposited');
    close(reading.spotSpan, 12, 2e-12);
    assertContiguous(reading.profile);
    profiles.push(reading.profile);
  }

  const rebinned64 = Array.from({ length: 8 }, (_, index) => sum(profiles[1].slice(index * 8, index * 8 + 8)));
  profiles[0].forEach((value, index) => close(rebinned64[index], value, 2e-12));
});

test('a beam tangent to the finite sensor has zero area and no point-splat discontinuity', () => {
  const laser = createElement('cwlaser', 0, 6);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 2;
  const camera = createElement('camera', 300, 0);
  camera.params.ch = 10;
  camera.params.pixels = 32;

  traceAll([laser, camera]);
  assert.equal(detectorReading(camera.id), null, 'measure-zero tangency must deposit no camera power');

  laser.y = 5.999999;
  traceAll([laser, camera]);
  close(detectorReading(camera.id).signal, 5e-7, 2e-12);
});

test('off-sensor near-miss provenance cannot contaminate camera polarization', () => {
  const onSensor = createElement('cwlaser', 0, 0);
  onSensor.params.beamMode = 'beam';
  onSensor.params.beamWidth = 2;
  onSensor.params.wavelength = 532;
  onSensor.params.pol = 0;
  const offSensor = createElement('cwlaser', 0, 20);
  offSensor.params.beamMode = 'beam';
  offSensor.params.beamWidth = 2;
  offSensor.params.wavelength = 635;
  offSensor.params.pol = 90;
  const camera = createElement('camera', 300, 0);
  camera.params.ch = 10;
  camera.params.pixels = 32;

  traceAll([onSensor, offSensor, camera]);
  const reading = detectorReading(camera.id);
  close(reading.signal, 1, 2e-12);
  close(reading.spotSpan, 2, 2e-12);
  assert.equal(reading.polarization, 'Linear 0°');
  close(sum(reading.spectrum.filter(sample => sample.wavelength > 600).map(sample => sample.power)), 0, 2e-12);
});

test('camera near misses are one-sided and cannot measure a beam passing behind the housing', () => {
  const laser = createElement('cwlaser', 600, 0);
  laser.rot = 180;
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 60;
  const lens = createElement('lens', 500, 0);
  lens.rot = 180;
  lens.params.f = 20;
  lens.params.dia = 60;
  const camera = createElement('camera', 0, 10);
  camera.params.ch = 20;
  camera.params.pixels = 32;

  traceAll([laser, lens, camera]);
  assert.equal(detectorReading(camera.id), null);
});

test('point and focus-degenerate routes use a finite conservative fallback', () => {
  const point = cameraProfileFromHits([{
    power: 0.7, u: 0.37, wl: 532, sourceId: 'point', pathKey: 'one', sample: 0, sampleCount: 1,
    coherenceId: null, phaseValid: false,
  }], 16, 30);
  close(sum(point.profile), 0.7);
  assert.ok(point.profile.every(value => Number.isFinite(value) && value >= 0));

  const focus = cameraProfileFromHits([
    { power: 0.2, u: 0.5, wl: 532, sourceId: 'laser', pathKey: 'focus', sample: 0, sampleCount: 2, coherenceId: 'laser', phaseValid: true, phaseOffset: 0, oplMm: 10, pol: 0 },
    { power: 0.3, u: 0.5, wl: 532, sourceId: 'laser', pathKey: 'focus', sample: 1, sampleCount: 2, coherenceId: 'laser', phaseValid: true, phaseOffset: 0, oplMm: 10, pol: 0 },
  ], 16, 30);
  close(sum(focus.profile), 0.5);
  assert.equal(focus.profileMode, 'deposited');
  assert.ok(focus.profile.every(value => Number.isFinite(value) && value >= 0));
});

test('same-source route fields give constructive, destructive, and unequal-power interference', () => {
  const first = route({ key: 'a', totalPower: 0.5 });
  const constructive = cameraProfileFromHits([...first, ...route({ key: 'b', totalPower: 0.5 })], 32, 30);
  close(sum(constructive.profile), 2, 2e-9);
  assert.equal(constructive.profileMode, 'coherent');
  assert.equal(constructive.coherentPaths, 2);

  const destructive = cameraProfileFromHits([
    ...first,
    ...route({ key: 'b', totalPower: 0.5, phase: Math.PI }),
  ], 32, 30);
  close(sum(destructive.profile), 0, 2e-9);
  assert.equal(destructive.profileMode, 'coherent');

  const p1 = 0.7, p2 = 0.2, phase = Math.PI / 3;
  const unequal = cameraProfileFromHits([
    ...route({ key: 'a', totalPower: p1 }),
    ...route({ key: 'b', totalPower: p2, phase }),
  ], 32, 30);
  close(sum(unequal.profile), p1 + p2 + 2 * Math.sqrt(p1 * p2) * Math.cos(phase), 2e-9);
});

test('continuous support follows the surviving coherent field, not canceled wide routes', () => {
  const reading = cameraProfileFromHits([
    ...route({ key: 'wide-a', totalPower: 0.4, u0: 0.3, u1: 0.7, sampleGrid: 'edges' }),
    ...route({ key: 'wide-b', totalPower: 0.4, phase: Math.PI, u0: 0.3, u1: 0.7, sampleGrid: 'edges' }),
    ...route({ key: 'narrow', totalPower: 0.2, u0: 0.45, u1: 0.55, sampleGrid: 'edges' }),
  ], 64, 30);
  close(sum(reading.profile), 0.2, 2e-9);
  close(reading.supportSpan, 3, 2e-12);

  const nearDark = cameraProfileFromHits([
    ...route({ key: 'a', totalPower: 0.5, u0: 0.3, u1: 0.7, sampleGrid: 'edges' }),
    ...route({ key: 'b', totalPower: 0.5, phase: Math.PI - 1e-5, u0: 0.3, u1: 0.7, sampleGrid: 'edges' }),
  ], 64, 30);
  assert.ok(sum(nearDark.profile) > 1e-12);
  close(nearDark.supportSpan, 12, 2e-12);
});

test('independent lasers add intensities and never acquire a cross term', () => {
  const reading = cameraProfileFromHits([
    ...route({ key: 'a', source: 'laser-a', coherence: 'laser-a', totalPower: 0.5 }),
    ...route({ key: 'b', source: 'laser-b', coherence: 'laser-b', totalPower: 0.5 }),
  ], 32, 30);
  close(sum(reading.profile), 1);
  assert.equal(reading.profileMode, 'deposited');
  assert.equal(reading.interference.applied, false);
});

test('final spectral totals exclude a canceled field but retain an independent source', () => {
  const red = [
    ...route({ key: 'red-a', source: 'red', coherence: 'red', wavelength: 635, phase: 0 }),
    ...route({ key: 'red-b', source: 'red', coherence: 'red', wavelength: 635, phase: Math.PI }),
  ];
  const green = route({
    key: 'green', source: 'green', coherence: null, wavelength: 532, totalPower: 0.1,
  });
  const reading = cameraProfileFromHits([...red, ...green], 32, 30);
  close(sum(reading.profile), 0.1, 2e-9);
  const final = new Map(reading.spectralPowers.map(sample => [sample.sourceId, sample.power]));
  const deposited = new Map(reading.depositedSpectralPowers.map(sample => [sample.sourceId, sample.power]));
  close(final.get('red'), 0, 2e-9);
  close(final.get('green'), 0.1, 2e-9);
  close(deposited.get('red'), 1, 2e-9);
  close(deposited.get('green'), 0.1, 2e-9);
});

test('excessive or phase-invalid routes fall back without truncating power', () => {
  const bounded = cameraProfileFromHits(Array.from({ length: 8 }, (_, index) => route({
    key: `accepted-${index}`, totalPower: 0.1,
  })).flat(), 16, 30);
  assert.equal(bounded.profileMode, 'coherent');
  assert.equal(bounded.coherentPaths, 8);

  const excessive = cameraProfileFromHits(Array.from({ length: 9 }, (_, index) => route({
    key: `path-${index}`, totalPower: 0.1,
  })).flat(), 16, 30);
  close(sum(excessive.profile), 0.9);
  assert.equal(excessive.profileMode, 'deposited');
  assert.match(excessive.interference.reason, /more than 8 coherent paths/);

  const invalid = route({ key: 'invalid', totalPower: 0.4 }).map(hit => ({ ...hit, phaseValid: false }));
  const mixed = cameraProfileFromHits([...route({ key: 'valid', totalPower: 0.6 }), ...invalid], 16, 30);
  close(sum(mixed.profile), 1);
  assert.equal(mixed.profileMode, 'deposited');
  assert.equal(mixed.interference.excludedHits, invalid.length);

  const partial = cameraProfileFromHits([
    ...route({ key: 'good-a', source: 'good', coherence: 'good', totalPower: 0.25 }),
    ...route({ key: 'good-b', source: 'good', coherence: 'good', totalPower: 0.25 }),
    ...Array.from({ length: 9 }, (_, index) => route({
      key: `overflow-${index}`, source: 'overflow', coherence: 'overflow', totalPower: 0.05,
    })).flat(),
  ], 16, 30);
  assert.equal(partial.profileMode, 'coherent');
  assert.equal(partial.coherentPaths, 2);
  assert.equal(partial.interference.partial, true);
  assert.match(partial.interference.reason, /supported paths interfere/);
});

test('one unreconstructable route disables the whole same-source field sum', () => {
  const reading = cameraProfileFromHits([
    ...route({ key: 'a', totalPower: 0.4 }),
    ...route({ key: 'b', totalPower: 0.4, phase: Math.PI }),
    ...route({ key: 'focus', totalPower: 0.2, samples: 1 }),
  ], 32, 30);
  close(sum(reading.profile), 1, 2e-12);
  assert.equal(reading.profileMode, 'deposited');
  assert.match(reading.interference.reason, /could not be reconstructed continuously/);
  assert.equal(reading.interference.excludedHits, 1);
});

test('camera reconstruction retains every detector-visible sub-nanowatt ray sample', () => {
  const reading = cameraProfileFromHits(route({ totalPower: 5e-11 }), 32, 30);
  close(sum(reading.profile), 5e-11, 2e-18);
  close(reading.depositedSignal, 5e-11, 2e-18);
});

test('Jones overlap controls coherent visibility', () => {
  const parallel = cameraProfileFromHits([
    ...route({ key: 'a', pol: 0 }),
    ...route({ key: 'b', pol: 0 }),
  ], 32, 30);
  close(sum(parallel.profile), 2, 2e-9);

  const diagonal = cameraProfileFromHits([
    ...route({ key: 'a', pol: 0 }),
    ...route({ key: 'b', pol: 45 }),
  ], 32, 30);
  close(sum(diagonal.profile), 1 + Math.SQRT1_2, 2e-9);

  const orthogonal = cameraProfileFromHits([
    ...route({ key: 'a', pol: 0 }),
    ...route({ key: 'b', pol: 90 }),
  ], 32, 30);
  close(sum(orthogonal.profile), 1, 2e-9);
  assert.equal(orthogonal.profileMode, 'coherent', 'the routes are coherent even when polarization makes visibility zero');
});

test('finite pixels analytically average unresolved angled-beam fringes', () => {
  const wavelength = 500;
  const wavelengthMm = wavelength * 1e-6;
  const fringePeriodMm = 0.25;
  const slope = wavelengthMm / fringePeriodMm;
  const flat = route({ key: 'flat', totalPower: 0.5, wavelength, samples: 5, u0: 0.1, u1: 0.9 });
  const tilted = route({
    key: 'tilted', totalPower: 0.5, wavelength, samples: 5, u0: 0.1, u1: 0.9,
    opl: fraction => 100 + slope * (-0.4 + 0.8 * fraction),
  });

  const coarse = cameraProfileFromHits([...flat, ...tilted], 4, 1);
  coarse.profile.forEach(value => close(value, 0.25, 2e-9));

  const fine = cameraProfileFromHits([...flat, ...tilted], 64, 1);
  assert.ok(Math.max(...fine.profile) > 4 * Math.min(...fine.profile), 'resolved pixels retain real fringe contrast');
  close(sum(fine.profile), 1, 2e-9);
});

test('a large common optical path retains a quarter-wave phase difference', () => {
  const wavelength = 500;
  const quarterWaveMm = wavelength * 1e-6 / 4;
  const reading = cameraProfileFromHits([
    ...route({ key: 'a', wavelength, opl: () => 100000 }),
    ...route({ key: 'b', wavelength, opl: () => 100000 + quarterWaveMm }),
  ], 32, 30);
  close(sum(reading.profile), 1, 2e-7);
});

function machZehnder({
  delayMm = 0, interference = true, ratio = null, mirrorReflectivity = null,
  replaceMirrorWithGalvo = false,
} = {}) {
  const fixture = new URL('../Examples/Optics%20Bench/Mach%E2%80%93Zehnder%20interferometer.json', import.meta.url);
  const raw = JSON.parse(readFileSync(fixture, 'utf8'));
  assert.equal(raw.elements.find(element => element.type === 'cwlaser').params.beamMode, 'beam');
  const authoredCameras = raw.elements.filter(element => element.type === 'camera');
  assert.equal(authoredCameras.length, 2, 'the bundled example itself must demonstrate both coherent outputs');
  for (const camera of authoredCameras) camera.params.interference = interference;
  if (ratio !== null) for (const splitter of raw.elements.filter(element => element.type === 'bs')) {
    splitter.params.ratio = ratio;
  }
  if (mirrorReflectivity !== null) {
    raw.elements.find(element => element.type === 'mirror').params.refl = mirrorReflectivity;
  }
  if (replaceMirrorWithGalvo) {
    const mirror = raw.elements.find(element => element.type === 'mirror');
    mirror.type = 'galvo';
    mirror.params = {
      length: mirror.params.length,
      commandAngle: 0,
      scanMode: 'static',
      scanAmplitude: 0,
      scanFrequencyHz: 100,
      scanPhaseDeg: 0,
      refl: 100,
      showTransmitted: false,
    };
  }
  const scene = parseSketch(JSON.stringify(raw), registry);
  if (delayMm > 0) {
    const delay = scene.elements.find(element => element.type === 'delayline');
    delay.params.delayMm = delayMm;
  }
  traceAll(scene.elements);
  return scene.elements.filter(element => element.type === 'camera').map(camera => detectorReading(camera.id));
}

test('the actual Mach–Zehnder scene has complementary coherent camera outputs', () => {
  const [bright, dark] = machZehnder();
  close(bright.signal, 1, 2e-9);
  close(dark.signal, 0, 2e-9);
  close(bright.signal + dark.signal, 1, 2e-9);
  for (const reading of [bright, dark]) {
    close(reading.depositedSignal, 0.5, 2e-9);
    assert.equal(reading.profileMode, 'coherent');
    assert.equal(reading.coherentPaths, 2);
  }
  assert.equal(bright.dark, false);
  close(sum(bright.spectrum.map(sample => sample.power)), 1, 2e-9);
  assert.equal(dark.dark, true);
  assert.equal(dark.wavelength, null);
  assert.equal(dark.polarization, 'No detected field');
  close(sum(dark.spectrum.map(sample => sample.power)), 0, 2e-9);
});

test('a real independent source survives coherent cancellation in camera metadata', () => {
  const fixture = new URL('../Examples/Optics%20Bench/Mach%E2%80%93Zehnder%20interferometer.json', import.meta.url);
  const scene = parseSketch(readFileSync(fixture, 'utf8'), registry);
  const source = createElement('cwlaser', 450, 530);
  source.params.beamMode = 'beam';
  source.params.beamWidth = 6;
  source.params.wavelength = 635;
  source.params.pol = 90;
  const steeringMirror = createElement('mirror', 608, 530);
  steeringMirror.rot = 135;
  steeringMirror.params.length = 10;
  steeringMirror.params.refl = 9e-8;
  scene.elements.push(source, steeringMirror);

  traceAll(scene.elements);
  const camera = scene.elements.find(element => element.type === 'camera' && element.y === 560);
  const reading = detectorReading(camera.id);
  assert.equal(reading.profileMode, 'coherent');
  assert.equal(reading.dark, false);
  assert.ok(reading.signal > 8.9e-10 && reading.signal < 9.1e-10);
  assert.equal(reading.wavelength, 635);
  assert.equal(reading.polarization, 'Linear 90°');
  assert.ok(reading.spotSpan > 5.9 && reading.spotSpan < 6.1);
});

test('asymmetric Mach–Zehnder splitters retain every field needed for unitary outputs', () => {
  for (const ratio of [0.001, 0.01, 0.05, 0.1, 0.2, 0.5, 0.8, 0.9, 0.95, 0.99, 0.999]) {
    const readings = machZehnder({ ratio });
    const actual = readings.map(reading => reading.signal).sort((a, b) => a - b);
    const expected = [4 * ratio * (1 - ratio), (2 * ratio - 1) ** 2].sort((a, b) => a - b);
    actual.forEach((value, index) => close(value, expected[index], 3e-8));
    close(sum(actual), 1, 3e-8);
    close(sum(readings.map(reading => reading.depositedSignal)), 1, 3e-8);
    readings.forEach(reading => assert.equal(reading.profileMode, 'coherent'));
  }
});

test('sub-budget camera-edge routes keep conservative tube support', () => {
  for (const offset of [0, 0.25, 0.5, 0.625, 1]) {
    const laser = createElement('cwlaser', 0, 0);
    laser.params.beamMode = 'beam';
    laser.params.beamWidth = 30;
    const splitter = createElement('bs', 150, 0);
    splitter.rot = 90;
    splitter.params.size = 50;
    splitter.params.ratio = 5e-5;
    const camera = createElement('camera', 300, offset);
    camera.params.ch = 20;
    camera.params.pixels = 64;

    traceAll([laser, splitter, camera]);
    const reading = detectorReading(camera.id);
    close(reading.signal, 5e-5 * 2 / 3, 2e-12);
    close(reading.spotSpan, 20, 2e-12);
  }
});

test('weak noncoherent splitter outputs remain measurable through a passive optic', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  const splitter = createElement('bs', 150, 0);
  splitter.rot = 90;
  splitter.params.size = 50;
  splitter.params.ratio = 0.005;
  const filter = createElement('filter', 225, 0);
  filter.params.ftype = 'nd';
  filter.params.trans = 1;
  const camera = createElement('camera', 300, 0);

  traceAll([laser, splitter, filter, camera]);
  close(detectorReading(camera.id).signal, 0.005, 2e-12);
});

test('a coherent branch below the bounded trace budget disables the whole field sum', () => {
  const readings = machZehnder({ ratio: 0.00001 });
  readings.forEach(reading => {
    assert.equal(reading.profileMode, 'deposited');
    assert.match(reading.interference.reason, /bounded trace threshold/);
    assert.ok(reading.interference.excludedHits > 0);
    close(reading.signal, reading.depositedSignal, 2e-12);
  });
  assert.ok(sum(readings.map(reading => reading.signal)) <= 1 + 1e-12,
    'fallback may omit a below-budget path but must never create power');
});

test('partial flat mirrors fall back instead of inventing a coating phase', () => {
  const readings = machZehnder({ mirrorReflectivity: 99 });
  readings.forEach(reading => {
    assert.equal(reading.profileMode, 'deposited');
    assert.match(reading.interference.reason, /partial-mirror coating/);
    assert.ok(reading.interference.excludedHits > 0);
    close(reading.signal, reading.depositedSignal, 2e-12);
  });
  close(sum(readings.map(reading => reading.signal)), 0.995, 2e-9);
});

test('a half-wave path delay swaps the Mach–Zehnder output ports', () => {
  const halfWaveMm = 532e-6 / 2;
  const [dark, bright] = machZehnder({ delayMm: halfWaveMm });
  close(dark.signal, 0, 2e-9);
  close(bright.signal, 1, 2e-9);
  close(dark.signal + bright.signal, 1, 2e-9);
});

test('the camera switch exposes the conservative Mach–Zehnder baseline', () => {
  const readings = machZehnder({ interference: false });
  for (const reading of readings) {
    close(reading.signal, 0.5, 2e-9);
    assert.equal(reading.profileMode, 'deposited');
    assert.equal(reading.interference.reason, 'disabled');
  }
});

test('camera spectra preserve same-source continuum routes with different clipping', () => {
  const source = createElement('sclaser', 100, 200);
  source.params.beamMode = 'beam';
  source.params.beamWidth = 30;
  source.params.scMin = 400;
  source.params.scMax = 800;
  const firstSplitter = createElement('bs', 300, 200);
  firstSplitter.rot = 90;
  firstSplitter.params.size = 50;
  const lowFilter = createElement('filter', 400, 200);
  lowFilter.params.ftype = 'bandpass';
  lowFilter.params.center = 500;
  lowFilter.params.band = 200;
  lowFilter.params.length = 50;
  const slit = createElement('slit', 500, 200);
  slit.params.gap = 10;
  slit.params.length = 50;
  const upperMirror = createElement('mirror', 600, 200);
  upperMirror.rot = 135;
  upperMirror.params.length = 50;
  const highFilter = createElement('filter', 300, 300);
  highFilter.rot = 90;
  highFilter.params.ftype = 'bandpass';
  highFilter.params.center = 700;
  highFilter.params.band = 200;
  highFilter.params.length = 50;
  const lowerMirror = createElement('mirror', 300, 400);
  lowerMirror.rot = 135;
  lowerMirror.params.length = 50;
  const secondSplitter = createElement('bs', 600, 400);
  secondSplitter.rot = 90;
  secondSplitter.params.size = 50;
  const camera = createElement('camera', 780, 400);
  camera.params.ch = 20;
  camera.params.pixels = 64;

  traceAll([
    source, firstSplitter, lowFilter, slit, upperMirror,
    highFilter, lowerMirror, secondSplitter, camera,
  ]);
  const reading = detectorReading(camera.id);
  const lowPower = sum(reading.spectrum.filter(sample => sample.wavelength < 600).map(sample => sample.power));
  const highPower = sum(reading.spectrum.filter(sample => sample.wavelength > 600).map(sample => sample.power));
  close(reading.signal, 0.11979166666666667, 2e-12);
  close(sum(reading.spectrum.map(sample => sample.power)), reading.signal, 2e-12);
  close(lowPower, 0.03645833333333333, 2e-12);
  close(highPower, 0.08333333333333333, 2e-12);
});

test('dispersive quadrature nodes remain a continuum in camera metadata', () => {
  const fixture = new URL('../Examples/Optics%20Bench/Mach%E2%80%93Zehnder%20interferometer.json', import.meta.url);
  const raw = JSON.parse(readFileSync(fixture, 'utf8'));
  const source = raw.elements.find(element => element.type === 'cwlaser');
  const defaults = createElement('sclaser', source.x, source.y);
  source.type = 'sclaser';
  source.params = {
    ...defaults.params,
    scMin: 500,
    scMax: 700,
    beamMode: 'beam',
    beamWidth: 6,
  };
  const scene = parseSketch(JSON.stringify(raw), registry);
  const glass = createElement('freeglass', 450, 200);
  glass.params.vertices = [
    { x: -10, y: -10 }, { x: 10, y: -10 },
    { x: 10, y: 10 }, { x: -10, y: 10 },
  ];
  glass.params.material = 'nbk7';
  glass.params.transEff = 100;
  scene.elements.push(glass);

  traceAll(scene.elements);
  for (const camera of scene.elements.filter(element => element.type === 'camera')) {
    const reading = detectorReading(camera.id);
    close(reading.signal, 0.5, 2e-12);
    close(sum(reading.spectrum.map(sample => sample.power)), 0.5, 2e-12);
    assert.ok(reading.spectrum.every(sample => sample.continuum));
    assert.ok(Math.max(...reading.spectrum.map(sample => sample.power)) < 0.03,
      'computational dispersion nodes must not appear as false spectral lines');
    close(reading.wavelength, 600, 2e-9);
  }
});

test('unsupported thin-lens carrier phase falls back without losing camera power', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 6;
  const lens = createElement('lens', 180, 0);
  lens.params.f = 300;
  lens.params.dia = 30;
  const camera = createElement('camera', 300, 0);
  camera.params.ch = 30;
  camera.params.pixels = 32;

  traceAll([laser, lens, camera]);
  const reading = detectorReading(camera.id);
  close(reading.signal, reading.depositedSignal, 2e-9);
  assert.equal(reading.profileMode, 'deposited');
  assert.ok(reading.interference.excludedHits > 0);
  assert.ok(reading.profile.every(value => Number.isFinite(value) && value >= 0));
});

test('a galvo mirror cannot inherit flat-mirror carrier phase from its surface kind', () => {
  const readings = machZehnder({ replaceMirrorWithGalvo: true });
  readings.forEach(reading => {
    assert.equal(reading.profileMode, 'deposited');
    assert.ok(reading.interference.excludedHits > 0);
    assert.match(reading.interference.reason, /galvo/);
    close(reading.signal, reading.depositedSignal, 2e-9);
  });
});
