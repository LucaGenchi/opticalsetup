import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry, retroOffsetAt } from '../sketch/js/elements.js';
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
    const laser = createElement('cwlaser', 0, 0);
    laser.params.beamMode = 'line';
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
  const onLaser = createElement('cwlaser', 0, 0);
  onLaser.params.beamMode = 'line';
  const offLaser = createElement('cwlaser', 0, 4);
  offLaser.params.beamMode = 'line';
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
  const laser = createElement('cwlaser', 0, 5);
  laser.params.beamMode = 'line';
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
  const laser = createElement('cwlaser', 0, 0);
  const sample = createElement('sample', 150, 0);
  sample.rot = 90; // horizontal at rot 0; rotate to cross a left-to-right beam
  const detector = createElement('detector', 300, 0);
  traceAll([laser, sample, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.8) < 1e-9);

  sample.params.transmission = 0;
  traceAll([laser, sample, detector]);
  assert.equal(detectorReading(detector.id), null);

  const holder = createElement('stage', 150, 0);
  holder.rot = 90;
  traceAll([laser, holder, detector]);
  assert.ok(detectorReading(detector.id));
  // Beyond the 25 mm clear aperture but still within the mount's outer edge
  // (clear + 12 = 37 mm), so the ray is blocked by the mount rather than
  // missing the holder geometry entirely.
  laser.y = 30; detector.y = 30;
  traceAll([laser, holder, detector]);
  assert.equal(detectorReading(detector.id), null);
});

test('uncollected fluorescence fades within 25 mm and never reaches a bare detector', () => {
  const laser = createElement('cwlaser', 0, 0);
  const sample = createElement('sample', 150, 0);
  sample.rot = 90; // horizontal at rot 0; rotate to cross a left-to-right beam
  sample.params.specimenType = 'linear';
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
  // strictly higher than far-segment opacity along the same direction).
  // Emission directions are sampled denser along the beam axis, so pick a
  // direction that exists rather than assuming one lands exactly upward.
  // Every fade sub-segment of one emitted ray shares that ray's direction.
  const bearing = d => Math.atan2(d.pts[1].y - d.pts[0].y, d.pts[1].x - d.pts[0].x);
  const along = glow.filter(d => Math.abs(bearing(d) - bearing(glow[0])) < 1e-6);
  const nearest = along.reduce((a, b) => (Math.hypot(a.pts[0].x - 150, a.pts[0].y) < Math.hypot(b.pts[0].x - 150, b.pts[0].y) ? a : b));
  const farthest = along.reduce((a, b) => (Math.hypot(a.pts[1].x - 150, a.pts[1].y) > Math.hypot(b.pts[1].x - 150, b.pts[1].y) ? a : b));
  assert.ok(nearest.opacity > farthest.opacity * 3, 'glow opacity falls off steeply with distance');
});

test('fluorescence collected by a nearby objective propagates to a detector', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  const sample = createElement('sample', 150, 0);
  sample.rot = 90; // horizontal at rot 0; rotate to cross a left-to-right beam
  sample.params.specimenType = 'linear';
  sample.params.mode = 'fluor';
  sample.params.transmission = 0.8;
  sample.params.signalEff = 0.1;
  // The objective's sample-facing front boundary sits 20 mm from the sample;
  // give its independent focus map the same WD so the specimen is nominally
  // in focus (catalogue magnification no longer supplies traced WD).
  const objective = createElement('objective', 154, 0);
  objective.params.efl = 20; // was magnification 10 -> f = 200/10
  objective.params.workingDistance = 20;
  objective.params.na = 0.65;
  objective.params.frontAperture = 20;
  const detector = createElement('detector', 320, 0);
  traceAll([laser, sample, objective, detector]);
  const reading = detectorReading(detector.id);
  // transmitted excitation AND collected fluorescence both arrive
  assert.ok(reading.signal > 0.8 + 1e-4, `collected fluorescence adds to the excitation signal, got ${reading.signal}`);
  assert.ok(reading.bandMax >= 520, 'the detected spectrum includes the emission wavelength');

  // Collection optics routinely sit well outside the few centimetres the
  // glow is DRAWN over, so capture reaches 100 mm even though the visible
  // glow still fades by 25 mm. Push the objective past that to lose it.
  objective.x = 228; // lens plane 94 mm from the sample: still within reach
  traceAll([laser, sample, objective, detector]);
  assert.ok(detectorReading(detector.id).signal > 0.8 + 1e-4,
    'a lens within the capture range still collects, even past the drawn glow');

  objective.x = 300; // lens plane 166 mm away: beyond any collection
  traceAll([laser, sample, objective, detector]);
  const uncollected = detectorReading(detector.id);
  assert.ok(Math.abs(uncollected.signal - 0.8) < 1e-9, 'a distant objective no longer collects the evanescent light');
});

test('PMT gain/saturation and camera pixels produce detector-specific readings', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
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
  const laser = createElement('cwlaser', 0, 0);
  const eye = createElement('eye', 200, 0);
  traceAll([laser, eye]);
  assert.equal(detectorReading(eye.id).detectorType, 'Retina');
  laser.y = 10;
  traceAll([laser, eye]);
  assert.equal(detectorReading(eye.id), null);
});

test('chopper averages static CW power, draws it as a chunked pattern, and gates pulses', () => {
  const laser = createElement('cwlaser', 0, 0);
  const pulsedLaser = createElement('pulsedlaser', 0, 0);
  const chopper = createElement('chopper', 150, 0);
  chopper.params.frequencyHz = 1000;
  chopper.params.chopDuty = 0.4;
  chopper.params.phaseNs = 25;
  const detector = createElement('detector', 300, 0);

  // CW power downstream of a chopper is always its duty-averaged value —
  // this is the quantitative reading a detector sees, live or static.
  traceAll([laser, chopper, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.4) < 1e-9);

  // The traced beam still reaches the detector (chopping doesn't remove the
  // ray) but is tagged as a chunked pattern for rendering: a fixed on/off
  // dash cadence reflecting the duty cycle, identical in the live view and
  // in static SVG/PNG exports.
  const scene = traceScene([laser, chopper, detector]);
  const chopped = scene.drawables.find(d => d.dash);
  assert.ok(chopped, 'the downstream beam should carry a chunked dash pattern');
  const [on, off] = chopped.dash.split(' ').map(Number);
  assert.ok(Math.abs(on / (on + off) - 0.4) < 1e-6, 'dash/gap ratio should match the duty cycle');

  const pulsedScene = traceScene([pulsedLaser, chopper, detector]);
  const gated = pulsedScene.pulseTracks.find(track => track.pulse.gates?.length);
  assert.ok(gated);
  assert.ok(Math.abs(gated.pulse.gates[0].duty - 0.4) < 1e-9);
});

test('detector signal follows overlap of chained pulse gates', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  laser.params.repRateMHz = 80;
  const first = createElement('chopper', 150, 0);
  const second = createElement('chopper', 200, 0);
  first.params.frequencyHz = 1e6;
  second.params.frequencyHz = 1e6;
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
  const laser = createElement('cwlaser', 0, 0);
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
  const laser = createElement('pulsedlaser', 0, 0);
  laser.params.beamMode = 'line';
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

test('AOTF passes its selected lines straight through and rejects everything else', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.wavelength = 800;
  const aotf = createElement('aotf', 150, 0);
  aotf.params.channels = [{ wl: 800, band: 2, eff: 0.8 }];
  aotf.params.deflect = 6;
  const detector = createElement('detector', 300, 0);

  traceAll([laser, aotf, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.8) < 1e-9,
    'the selected line leaves along the incoming axis, not the deflected one');

  laser.params.wavelength = 810;
  traceAll([laser, aotf, detector]);
  assert.equal(detectorReading(detector.id), null, 'a line outside every passband does not get through');
});

test('AOTF stacks lines, and cycling shares the period between them', () => {
  const aotf = createElement('aotf', 150, 0);
  aotf.params.deflect = 6;
  const detector = createElement('detector', 300, 0);
  const lasers = [488, 532, 633].map(wl => {
    const l = createElement('cwlaser', 0, 0);
    l.params.wavelength = wl;
    return l;
  });
  const channels = [488, 532, 633].map(wl => ({ wl, band: 4, eff: 0.9 }));

  for (let n = 1; n <= 3; n++) {
    aotf.params.channels = channels.slice(0, n);
    aotf.params.modMode = 'static';
    traceAll([...lasers, aotf, detector]);
    assert.ok(Math.abs(detectorReading(detector.id).signal - 0.9 * n) < 1e-9,
      `${n} selected line(s) should pass ${n} x 0.9`);
  }

  // Cycling opens one line at a time, so a slow detector reads the average.
  aotf.params.modMode = 'cycle';
  traceAll([...lasers, aotf, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.9) < 1e-9,
    'three lines cycling average to one line open');
});

test('AOTF conserves energy between the selected lines and the depleted beam', () => {
  const laser = createElement('sclaser', 0, 0);
  Object.assign(laser.params, { scMin: 420, scMax: 700, beamMode: 'line' });
  const aotf = createElement('aotf', 200, 0);
  aotf.params.deflect = 20;
  aotf.params.showDepleted = true;
  const kept = createElement('detector', 520, 0);
  const dumped = createElement('detector', 500, 116);
  dumped.rot = 20;
  dumped.params.aperture = 140;

  // The passband is a Lorentzian of the given full width at half maximum, so
  // what it keeps is not its stated width: integrating 1/(1+x²) over the line
  // gives an effective width of pi/2 times the FWHM, less whatever the wings
  // lose to truncation. The invariant worth asserting is that the selection
  // grows with the width, stays under what an equally wide flat-top would
  // take at the wings' expense, and always adds up.
  let previous = 0;
  for (const band of [20, 60, 140]) {
    aotf.params.channels = [{ wl: 532, band, eff: 1 }];
    traceAll([laser, aotf, kept, dumped]);
    const selected = detectorReading(kept.id)?.signal ?? 0;
    const depleted = detectorReading(dumped.id)?.signal ?? 0;
    assert.ok(selected > previous, `a ${band} nm line keeps more than a narrower one`);
    assert.ok(selected > band / 280,
      `a Lorentzian ${band} nm line keeps more than a flat ${band} nm window would`);
    assert.ok(selected < Math.PI / 2 * band / 280 + 1e-9,
      `and no more than its untruncated effective width, pi/2 x ${band} nm`);
    assert.ok(Math.abs(selected + depleted - 1) < 1e-9, 'nothing is created or lost');
    previous = selected;
  }

  // Hiding the depleted port removes the drawn beam, not the accounting.
  aotf.params.showDepleted = false;
  aotf.params.channels = [{ wl: 532, band: 20, eff: 1 }];
  traceAll([laser, aotf, kept, dumped]);
  const hiddenPort = detectorReading(kept.id).signal;
  assert.equal(detectorReading(dumped.id), null, 'the depleted beam is not traced when hidden');
  aotf.params.showDepleted = true;
  traceAll([laser, aotf, kept, dumped]);
  assert.ok(Math.abs(detectorReading(kept.id).signal - hiddenPort) < 1e-12,
    'the selection is unaffected by whether the depleted port is drawn');
});

test('an AOTF channel is half open exactly at the width it was set to', () => {
  // `band` is the full width at half maximum of the passband, which is the
  // only thing that pins the shape to the number in the inspector.
  const aotf = createElement('aotf', 200, 0);
  const detector = createElement('detector', 400, 0);
  const at = wl => {
    const laser = createElement('cwlaser', 0, 0);
    Object.assign(laser.params, { wavelength: wl, beamMode: 'line' });
    aotf.params.channels = [{ wl: 532, band: 4, eff: 1 }];
    traceAll([laser, aotf, detector]);
    return detectorReading(detector.id)?.signal ?? 0;
  };
  assert.ok(Math.abs(at(532) - 1) < 1e-9, 'fully open on line centre');
  assert.ok(Math.abs(at(534) - 0.5) < 1e-9, 'half open half a width above centre');
  assert.ok(Math.abs(at(530) - 0.5) < 1e-9, 'and half a width below it');
  // A Lorentzian falls away smoothly rather than switching off at an edge.
  assert.ok(at(536) > 0.15 && at(536) < 0.25, 'the wings still carry light');
  assert.equal(at(600), 0, 'but not without limit');
});

test('a narrow AOTF line survives the weak-ray cull that would delete it', () => {
  // 0.5 nm out of 280 nm is 0.18% of the beam - far below the generic
  // negligible-ray floor, and yet the entire point of the element.
  const laser = createElement('sclaser', 0, 0);
  Object.assign(laser.params, { scMin: 420, scMax: 700, beamMode: 'line' });
  const aotf = createElement('aotf', 200, 0);
  aotf.params.channels = [{ wl: 532, band: 0.5, eff: 0.9 }];
  const detector = createElement('detector', 400, 0);

  traceAll([laser, aotf, detector]);
  const reading = detectorReading(detector.id);
  assert.ok(reading, 'a 0.5 nm selection still reaches the detector');
  // A Lorentzian of 0.5 nm FWHM collects rather more than a flat 0.5 nm slice,
  // because its wings reach past the half-maximum points -- but still a tiny
  // fraction of the source, which is the point of the test.
  assert.ok(reading.signal > 0.9 * 0.5 / 280 && reading.signal < 0.9 * 1.6 * 0.5 / 280,
    `a 0.5 nm selection carries about its Lorentzian share, got ${reading.signal.toExponential(3)}`);
  assert.ok(Math.abs(reading.wavelength - 532) < 0.5, 'at the selected wavelength');
});

test('nonlinear crystal partitions converted and residual pump power', () => {
  const laser = createElement('cwlaser', 0, 0);
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
  const aligned = createElement('pulsedlaser', 0, 0);
  aligned.params.temporalMode = 'pulsed';
  assert.ok(traceScene([aligned], [fiber]).pulseTracks.some(track => track.opls[0] > 100));

  const steep = createElement('pulsedlaser', 0, -17.6336);
  steep.rot = 10;
  steep.params.temporalMode = 'pulsed';
  assert.equal(traceScene([steep], [fiber]).pulseTracks.some(track => track.opls[0] > 100), false);
});

test('configured SLM steering changes the reflected ray direction', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  const slm = createElement('slm', 180, 0);
  slm.params.layers = [{ type: 'steer', n: 3, f: 50, lines: 600, orders: '1', angle: 10, div: 8 }];
  const ray = paths([laser, slm])[0];
  assert.ok(Math.abs(angleOfLastSegment(ray)) > 160 && Math.abs(angleOfLastSegment(ray)) < 180);
});

test('retroreflector returns a beam antiparallel to its incidence, mirrored about its axis', () => {
  const laser = createElement('cwlaser', 0, 10);
  laser.params.beamMode = 'line';
  const retro = createElement('retroreflector', 150, 0);
  const ray = paths([laser, retro])[0];
  assert.ok(ray.pts.length >= 4, 'expects an entry bounce, an internal bounce, and an exit segment');
  const angle = Math.abs(angleOfLastSegment(ray));
  assert.ok(Math.abs(angle - 180) < 1e-6, `exit ray should be antiparallel (180°), got ${angle}°`);
  const exitStart = ray.pts.at(-2), exitEnd = ray.pts.at(-1);
  assert.ok(Math.abs(exitStart.y - (-10)) < 1e-6, 'a beam entering at +10 above the axis should return at -10');
  assert.ok(Math.abs(exitEnd.y - exitStart.y) < 1e-9, 'the outgoing leg should stay at constant height');
});

test('retroreflector delay-line motion is static by default, starts at the placed position, and only ever lengthens the path', () => {
  const retro = createElement('retroreflector');
  assert.equal(retro.params.travel, 50, 'default travel range should be 50 mm');
  assert.deepEqual(retroOffsetAt(retro.params, 5), { x: 0, y: 0 });

  retro.params.moveMode = 'linear';
  retro.params.travel = 20;
  retro.params.freqHz = 0.5;
  assert.deepEqual(retroOffsetAt(retro.params, 0), { x: 0, y: 0 }, 'motion should start at the beginning of the travel range');
  const samples = [0, 0.5, 1, 1.5, 2].map(t => retroOffsetAt(retro.params, t).x);
  for (const x of samples) assert.ok(x >= -1e-9 && x <= 20 + 1e-9, `offset ${x} should stay within [0, travel] — never shorter than the placed position`);
  assert.ok(Math.abs(samples[0] - samples[4]) < 1e-9, 'motion should repeat every period (1/freqHz = 2s)');
  assert.ok(samples.some(x => x > 1e-6), 'linear mode should actually move, always lengthening the path');

  const clamped = retroOffsetAt({ moveMode: 'linear', travel: 500, freqHz: 0.5 }, 1);
  assert.ok(clamped.x >= -1e-9 && clamped.x <= 200 + 1e-9, 'travel should clamp to the 200 mm maximum');
});
