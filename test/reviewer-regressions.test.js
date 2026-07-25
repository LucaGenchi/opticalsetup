import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { detectorReading, probeAt, traceAll, traceScene } from '../sketch/js/raytrace.js';
import { C_MM_PER_NS } from '../sketch/js/pulses.js';

function closeTo(actual, expected, tolerance = 1e-9, message = '') {
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    message || `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test('finite optics preserve the shared beam before adjacent samples split', () => {
  const cases = [
    ['concave mirror', 'cmirror', optic => { optic.params.length = 25.4; }],
    ['lens', 'lens', optic => { optic.params.dia = 25.4; }],
    ['blocker', 'blocker', optic => { optic.params.w = 8; optic.params.h = 25.4; }],
  ];

  for (const [label, type, configure] of cases) {
    const laser = createElement('laser', 0, 0);
    laser.params.beamMode = 'beam';
    laser.params.beamWidth = 60;
    const optic = createElement(type, 200, 0);
    configure(optic);

    const polygons = traceAll([laser, optic]).filter(drawable => drawable.type === 'poly');

    // Twenty-five samples make 24 incident strips. Reflecting/refracting
    // optics add ten downstream strips between the eleven samples that hit;
    // an absorbing blocker has no downstream continuation.
    assert.equal(polygons.length, type === 'blocker' ? 24 : 34, `${label} dropped a shared beam segment`);
    assert.ok(polygons.every(poly => poly.pts.length === 4), `${label} produced a malformed beam strip`);

    if (type === 'lens') {
      const crosses = (poly, x) => {
        const xs = poly.pts.map(point => point.x);
        return Math.min(...xs) < x && Math.max(...xs) >= x;
      };
      const incident = polygons.filter(poly => crosses(poly, 190));
      assert.equal(incident.length, 24, 'the incident beam has white seams before the lens');
      assert.equal(
        incident.filter(poly => Math.max(...poly.pts.map(point => point.x)) > 201).length,
        12,
        'a hit/miss boundary was falsely filled beyond the lens',
      );
    }
  }
});

test('zero-power gated hits cannot contaminate detector metadata', () => {
  const blocked = createElement('laser', 0, 0);
  blocked.params.temporalMode = 'pulsed';
  blocked.params.repRateMHz = 80;
  blocked.params.wavelength = 400;

  const passing = createElement('laser', 0, 30);
  passing.params.temporalMode = 'pulsed';
  passing.params.repRateMHz = 80;
  passing.params.wavelength = 800;

  const first = createElement('chopper', 150, 0);
  const second = createElement('chopper', 200, 0);
  first.params.frequencyHz = 1e6;
  second.params.frequencyHz = 1e6;
  first.params.chopDuty = 0.5;
  second.params.chopDuty = 0.5;
  first.params.phaseNs = 98 / C_MM_PER_NS;
  second.params.phaseNs = 148 / C_MM_PER_NS + 500;

  const camera = createElement('camera', 300, 15);
  camera.params.ch = 100;
  traceAll([blocked, passing, first, second, camera]);

  const reading = detectorReading(camera.id);
  assert.ok(reading);
  closeTo(reading.signal, 1);
  closeTo(reading.wavelength, 800);
  closeTo(reading.bandMin, 800);
  closeTo(reading.bandMax, 800);
  closeTo(reading.spotSpan, 0);
  assert.equal(reading.samples, 1);
  assert.equal(reading.pulse.sources, 1);
  assert.equal(reading.pulse.trains.length, 1);
});

test('a passive diffuser redistributes but does not create optical power', () => {
  const laser = createElement('laser', 0, 0);
  const diffuser = createElement('diffuser', 150, 0);
  const camera = createElement('camera', 300, 0);
  camera.params.ch = 150;

  traceAll([laser, diffuser, camera]);
  const reading = detectorReading(camera.id);

  assert.ok(reading);
  assert.equal(reading.samples, 5, 'the large sensor should collect every scattered branch');
  assert.ok(reading.signal <= 1 + 1e-9, 'a passive diffuser created relative power');
  closeTo(reading.signal, 1, 1e-9, 'the large sensor should recover the full input power');
});

test('beam probes report state at their position rather than the final path state', () => {
  const laser = createElement('laser', 0, 0);
  const sample = createElement('sample', 150, 0);
  sample.params.transmission = 0.25;

  traceAll([laser, sample]);
  const upstream = probeAt(100, 0, 4);
  const downstream = probeAt(250, 0, 4);

  assert.ok(upstream);
  assert.ok(downstream);
  closeTo(upstream.intensity, 1, 1e-9, 'upstream probe inherited downstream attenuation');
  closeTo(downstream.intensity, 0.25);
});

test('pulsed AOM zero order complements the gated first order', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.temporalMode = 'pulsed';
  laser.params.repRateMHz = 1;

  const aom = createElement('aom', 150, 0);
  aom.params.deflect = 4;
  aom.params.eff = 0.8;
  aom.params.zero = true;
  aom.params.modulate = true;
  aom.params.modFreqMHz = 1;
  aom.params.chopDuty = 0.25;
  aom.params.phaseNs = 98 / C_MM_PER_NS;

  const detectorX = 500;
  const detectorFaceX = detectorX - 19;
  const zeroOrder = createElement('detector', detectorX, 0);
  const firstOrder = createElement(
    'detector',
    detectorX,
    Math.tan(aom.params.deflect * Math.PI / 180) * (detectorFaceX - aom.x),
  );

  const onScene = traceScene([laser, aom, zeroOrder, firstOrder]);
  assert.ok(
    onScene.pulseTracks.some(track => track.pulse.gates?.some(gate => gate.invert)),
    'zero order has no complementary RF-off pulse gate',
  );
  const zeroOn = detectorReading(zeroOrder.id);
  const firstOn = detectorReading(firstOrder.id);
  assert.ok(zeroOn);
  assert.ok(firstOn);
  closeTo(zeroOn.signal, 0.2);
  closeTo(firstOn.signal, 0.8);
  closeTo(zeroOn.signal + firstOn.signal, 1);

  aom.params.phaseNs += 500;
  traceAll([laser, aom, zeroOrder, firstOrder]);
  const zeroOff = detectorReading(zeroOrder.id);
  const firstOff = detectorReading(firstOrder.id);
  assert.ok(zeroOff);
  assert.equal(firstOff, null);
  closeTo(zeroOff.signal, 1);
});
