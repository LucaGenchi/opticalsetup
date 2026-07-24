import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { detectorReading, traceAll, traceScene } from '../sketch/js/raytrace.js';
import { C_MM_PER_NS } from '../sketch/js/pulses.js';

const paths = elements => traceAll(elements).filter(d => d.type === 'path');
const angleOfLastSegment = path => {
  const a = path.pts.at(-2), b = path.pts.at(-1);
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
};

test('galvo command changes the physical mirror surface', () => {
  const galvo = createElement('galvo');
  const flat = registry.galvo.surfaces(galvo)[0];
  galvo.params.commandAngle = 15;
  const commanded = registry.galvo.surfaces(galvo)[0];
  assert.equal(flat.x1, 0);
  assert.notEqual(commanded.x1, 0);
  assert.ok(commanded.y1 < 0 && commanded.y2 > 0);
});

test('triangular prism uses drawn boundaries and disperses blue more than red', () => {
  const angles = [];
  for (const wavelength of [450, 650]) {
    const laser = createElement('laser', 0, 0);
    laser.params.wavelength = wavelength;
    const prism = createElement('prism', 180, 0);
    prism.rot = 20;
    const ray = paths([laser, prism]).find(p => p.pts.length >= 4);
    assert.ok(ray);
    angles.push(angleOfLastSegment(ray));
  }
  assert.equal(registry.prism.surfaces(createElement('prism')).length, 3);
  assert.ok(angles[0] > angles[1], `blue ${angles[0]}° should deviate more than red ${angles[1]}°`);
});

test('DMD routes ON and OFF micromirror stripes into distinct orders', () => {
  const onLaser = createElement('laser', 0, 0);
  const offLaser = createElement('laser', 0, 4);
  const dmd = createElement('dmd', 180, 0);
  dmd.params.routeOff = true;
  const onOut = paths([onLaser, dmd]).find(p => Math.abs(p.pts[0].x - 171) < 1e-6);
  const offOut = paths([offLaser, dmd]).find(p => Math.abs(p.pts[0].x - 171) < 1e-6);
  assert.ok(angleOfLastSegment(onOut) < -150);
  assert.ok(angleOfLastSegment(offOut) > 150);

  dmd.params.routeOff = false;
  assert.equal(paths([offLaser, dmd]).filter(p => Math.abs(p.pts[0].x - 171) < 1e-6).length, 0);
});

test('deformable mirror defocuses an off-axis reflected ray through its focus', () => {
  const laser = createElement('laser', 0, 5);
  const dm = createElement('dm', 400, 0);
  dm.params.f = 200;
  const ray = paths([laser, dm])[0];
  const a = ray.pts[1], b = ray.pts[2];
  const t = (200 - a.x) / (b.x - a.x);
  const yAtFocus = a.y + (b.y - a.y) * t;
  assert.ok(Math.abs(yAtFocus) < 1e-9);

  dm.params.f = 0;
  const flat = paths([laser, dm])[0];
  assert.ok(Math.abs(flat.pts[2].y - 5) < 1e-9);
});

test('sample attenuation and holder aperture have distinct bounded behavior', () => {
  const laser = createElement('laser', 0, 0);
  const sample = createElement('sample', 150, 0);
  const detector = createElement('detector', 300, 0);
  traceAll([laser, sample, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.8) < 1e-9);

  sample.params.transmission = 0;
  traceAll([laser, sample, detector]);
  assert.equal(detectorReading(detector.id), null);

  const holder = createElement('stage', 150, 0);
  traceAll([laser, holder, detector]);
  assert.ok(detectorReading(detector.id));
  laser.y = 20; detector.y = 20;
  traceAll([laser, holder, detector]);
  assert.equal(detectorReading(detector.id), null);
});

test('uncollected fluorescence fades within 25 mm and never reaches a bare detector', () => {
  const laser = createElement('laser', 0, 0);
  const sample = createElement('sample', 150, 0);
  sample.params.mode = 'fluor';
  sample.params.transmission = 0.8;
  sample.params.signalEff = 0.1;
  const detector = createElement('detector', 300, 0);
  const drawables = traceAll([laser, sample, detector]);
  // the detector (131 mm away, not a collection optic) reads ONLY the
  // transmitted excitation; the isotropic fluorescence dies evanescently
  const reading = detectorReading(detector.id);
  assert.ok(Math.abs(reading.signal - 0.8) < 1e-9, `bare detector reads excitation only, got ${reading.signal}`);
  // fluorescence glow segments exist and none extend beyond 25 mm of the sample
  const glow = drawables.filter(d => d.type === 'path'
    && d.pts.every(p => Math.hypot(p.x - 150, p.y) < 25 + 1e-6)
    && d.pts.some(p => Math.hypot(p.x - 150, p.y) > 1));
  assert.ok(glow.length > 0, 'evanescent fluorescence glow is drawn near the sample');
  // the drawn glow decays with distance (1/r² profile: near-segment opacity
  // strictly higher than far-segment opacity along the same direction)
  const upward = glow.filter(d => d.pts.every(p => Math.abs(p.x - 150) < 1e-6 && p.y < 0));
  const nearest = upward.reduce((a, b) => (Math.abs(a.pts[0].y) < Math.abs(b.pts[0].y) ? a : b));
  const farthest = upward.reduce((a, b) => (Math.abs(a.pts[1].y) > Math.abs(b.pts[1].y) ? a : b));
  assert.ok(nearest.opacity > farthest.opacity * 3, 'glow opacity falls off steeply with distance');
});

test('fluorescence collected by a nearby objective propagates to a detector', () => {
  const laser = createElement('laser', 0, 0);
  const sample = createElement('sample', 150, 0);
  sample.params.mode = 'fluor';
  sample.params.transmission = 0.8;
  sample.params.signalEff = 0.1;
  // objective lens plane (local x = +16, the sample-facing front tip) sits
  // 20 mm from the sample: within the 1.5x capture window of the 25 mm
  // evanescent range
  const objective = createElement('objective', 154, 0);
  objective.params.f = 20;
  const detector = createElement('detector', 320, 0);
  traceAll([laser, sample, objective, detector]);
  const reading = detectorReading(detector.id);
  // transmitted excitation AND collected fluorescence both arrive
  assert.ok(reading.signal > 0.8 + 1e-4, `collected fluorescence adds to the excitation signal, got ${reading.signal}`);
  assert.ok(reading.bandMax >= 520, 'the detected spectrum includes the emission wavelength');

  // move the objective far beyond the capture window: fluorescence dies again
  objective.x = 228; // lens plane 94 mm from the sample
  traceAll([laser, sample, objective, detector]);
  const uncollected = detectorReading(detector.id);
  assert.ok(Math.abs(uncollected.signal - 0.8) < 1e-9, 'a distant objective no longer collects the evanescent light');
});

test('PMT gain/saturation and camera pixels produce detector-specific readings', () => {
  const laser = createElement('laser', 0, 0);
  const pmt = createElement('pmt', 300, 0);
  pmt.params.gain = 10;
  pmt.params.saturation = 100;
  traceAll([laser, pmt]);
  assert.equal(detectorReading(pmt.id).outputSignal, 10);
  pmt.params.saturation = 5;
  traceAll([laser, pmt]);
  assert.equal(detectorReading(pmt.id).outputSignal, 5);
  assert.equal(detectorReading(pmt.id).saturated, true);

  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 8;
  const camera = createElement('camera', 300, 0);
  camera.params.pixels = 16;
  traceAll([laser, camera]);
  const image = detectorReading(camera.id);
  assert.equal(image.profile.length, 16);
  assert.ok(image.profile.filter(v => v > 0).length > 1);
  assert.ok(Math.abs(image.profile.reduce((sum, v) => sum + v, 0) - image.signal) < 1e-9);
  assert.ok(Math.abs(image.centroid) < 0.3);
});

test('eye detects focused light at its retina and clips outside the pupil', () => {
  const laser = createElement('laser', 0, 0);
  const eye = createElement('eye', 200, 0);
  traceAll([laser, eye]);
  assert.equal(detectorReading(eye.id).detectorType, 'Retina');
  laser.y = 10;
  traceAll([laser, eye]);
  assert.equal(detectorReading(eye.id), null);
});

test('chopper averages static CW power, previews live gate phase, and gates pulses', () => {
  const laser = createElement('laser', 0, 0);
  const chopper = createElement('chopper', 150, 0);
  chopper.params.frequencyMHz = 1;
  chopper.params.chopDuty = 0.4;
  chopper.params.phaseNs = 25;
  const detector = createElement('detector', 300, 0);

  // No live clock means a deterministic duty-averaged static trace/export.
  traceAll([laser, chopper, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.4) < 1e-9);

  // A live clock makes the same CW path visibly open and close. The phase
  // offset is the beginning of the open interval; 40% of a 1 MHz gate is open.
  chopper._simulationTimeNs = 25;
  traceAll([laser, chopper, detector]);
  assert.equal(detectorReading(detector.id).signal, 1);
  chopper._simulationTimeNs = 425;
  traceAll([laser, chopper, detector]);
  assert.equal(detectorReading(detector.id), null);

  // Non-finite transient UI state must safely fall back to the static average.
  chopper._simulationTimeNs = Number.NaN;
  traceAll([laser, chopper, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.4) < 1e-9);

  laser.params.temporalMode = 'pulsed';
  const scene = traceScene([laser, chopper, detector]);
  const gated = scene.pulseTracks.find(track => track.pulse.gates?.length);
  assert.ok(gated);
  assert.ok(Math.abs(gated.pulse.gates[0].duty - 0.4) < 1e-9);
});

test('detector signal follows overlap of chained pulse gates', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.temporalMode = 'pulsed';
  laser.params.repRateMHz = 80;
  const first = createElement('chopper', 150, 0);
  const second = createElement('chopper', 200, 0);
  first.params.frequencyMHz = 1;
  second.params.frequencyMHz = 1;
  first.params.chopDuty = 0.5;
  second.params.chopDuty = 0.5;
  first.params.phaseNs = 98 / C_MM_PER_NS;
  second.params.phaseNs = 148 / C_MM_PER_NS;
  const detector = createElement('detector', 300, 0);
  traceAll([laser, first, second, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.5) < 1e-9);

  second.params.phaseNs += 500;
  traceAll([laser, first, second, detector]);
  assert.equal(detectorReading(detector.id), null);
});

test('AOM deflects, frequency-shifts, and attenuates first-order light', () => {
  const laser = createElement('laser', 0, 0);
  const aom = createElement('aom', 150, 0);
  aom.params.deflect = 4;
  aom.params.eff = 0.85;
  aom.params.rfMHz = 80;
  const detectorX = 300, faceX = detectorX - 19;
  const detector = createElement('detector', detectorX, Math.tan(4 * Math.PI / 180) * (faceX - 150));
  traceAll([laser, aom, detector]);
  const reading = detectorReading(detector.id);
  assert.ok(Math.abs(reading.signal - 0.85) < 1e-9);
  assert.ok(reading.wavelength < laser.params.wavelength);
});

test('mechanical delay line adds bounded optical path without steering the beam', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.temporalMode = 'pulsed';
  const delay = createElement('delayline', 150, 0);
  const detector = createElement('detector', 300, 0);

  delay.params.delayMm = 0;
  traceAll([laser, delay, detector]);
  const baseline = detectorReading(detector.id).pulse.earliestPathDelayNs;

  delay.params.delayMm = 250;
  const delayedPaths = traceAll([laser, delay, detector]).filter(drawable => drawable.type === 'path');
  const delayed = detectorReading(detector.id).pulse.earliestPathDelayNs;
  assert.ok(Math.abs(delayed - baseline - 250 / C_MM_PER_NS) < 1e-9);
  assert.ok(delayedPaths.every(path => path.pts.every(point => Math.abs(point.y) < 1e-9)));

  delay.params.delayMm = -50;
  traceAll([laser, delay, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).pulse.earliestPathDelayNs - baseline) < 1e-9);
});

test('AOTF selects its passband and deflects only the selected order', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.wavelength = 800;
  const aotf = createElement('aotf', 150, 0);
  aotf.params.center = 800;
  aotf.params.band = 1;
  aotf.params.deflect = 4;
  aotf.params.eff = 0.8;
  const detectorX = 300, faceX = detectorX - 19;
  const detector = createElement('detector', detectorX, Math.tan(4 * Math.PI / 180) * (faceX - 151));

  traceAll([laser, aotf, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.8) < 1e-9);

  laser.params.wavelength = 810;
  traceAll([laser, aotf, detector]);
  assert.equal(detectorReading(detector.id), null);
});

test('nonlinear crystal partitions converted and residual pump power', () => {
  const laser = createElement('laser', 0, 0);
  const crystal = createElement('crystal', 150, 0);
  crystal.params.convert = 'shg';
  crystal.params.efficiency = 0.4;
  crystal.params.transmitPump = true;
  const detector = createElement('detector', 300, 0);
  traceAll([laser, crystal, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 1) < 1e-9);

  crystal.params.transmitPump = false;
  traceAll([laser, crystal, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.4) < 1e-9);
  assert.ok(Math.abs(detectorReading(detector.id).wavelength - 266) < 1e-9);
});

test('fiber input NA rejects steep incidence and accepts an aligned source', () => {
  const fiber = {
    id: 'na-fiber', kind: 'fiber', pts: [{ x: 100, y: 0 }, { x: 200, y: 0 }],
    color: '#e8a800', width: 4, propagate: true, inputNA: 0.1,
    groupIndex: 1.468, lossDbPerM: 0,
    out0: { mode: 'diverge', na: 0.12, focal: 20, dia: 6 },
    out1: { mode: 'diverge', na: 0.12, focal: 20, dia: 6 },
  };
  const aligned = createElement('laser', 0, 0);
  aligned.params.temporalMode = 'pulsed';
  assert.ok(traceScene([aligned], [fiber]).pulseTracks.some(track => track.opls[0] > 100));

  const steep = createElement('laser', 0, -17.6336);
  steep.rot = 10;
  steep.params.temporalMode = 'pulsed';
  assert.equal(traceScene([steep], [fiber]).pulseTracks.some(track => track.opls[0] > 100), false);
});

test('configured SLM steering changes the reflected ray direction', () => {
  const laser = createElement('laser', 0, 0);
  const slm = createElement('slm', 180, 0);
  slm.params.layers = [{ type: 'steer', n: 3, f: 50, lines: 600, orders: '1', angle: 10, div: 8 }];
  const ray = paths([laser, slm])[0];
  assert.ok(Math.abs(angleOfLastSegment(ray)) > 160 && Math.abs(angleOfLastSegment(ray)) < 180);
});
