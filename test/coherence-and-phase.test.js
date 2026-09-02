import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, phasePlateOpdFraction, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import {
  fringeVisibility, linewidthForCoherenceLengthNm, coherenceLengthForLinewidthMm,
} from '../sketch/js/spectrum.js';
import { readFileSync } from 'node:fs';

const LAMBDA_MM = 532e-6;
const MZ = readFileSync('test/fixtures/mach-zehnder.json', 'utf8');

// Fringe contrast at a given nominal path difference, sampled finely enough
// to actually catch the extremes of one fringe.
function contrastAt({ coherenceLengthMm = 0, pathDifferenceMm = 0, samples = 64 } = {}) {
  let lowest = Infinity, highest = -Infinity;
  for (let step = 0; step < samples; step++) {
    const scene = parseSketch(MZ);
    scene.elements.find(el => el.type === 'cwlaser').params.coherenceLengthMm = coherenceLengthMm;
    scene.elements.find(el => el.type === 'delayline').params.delayMm
      = pathDifferenceMm + step * LAMBDA_MM / samples;
    const camera = scene.elements.filter(el => el.type === 'camera')[0];
    traceAll(scene.elements);
    const reading = detectorReading(camera.id);
    const value = reading ? reading.signal : 0;
    lowest = Math.min(lowest, value);
    highest = Math.max(highest, value);
  }
  return (highest - lowest) / (highest + lowest);
}

// ---------------- coherence length ----------------

test('the visibility envelope is a Gaussian whose FWHM is the coherence length', () => {
  assert.equal(fringeVisibility(0, 0.5), 1);
  // lc is defined as the full width at half maximum, so lc/2 must give 1/2.
  assert.ok(Math.abs(fringeVisibility(0.25, 0.5) - 0.5) < 1e-9);
  assert.ok(fringeVisibility(2, 0.5) < 1e-6);
  // An unset (or zero) coherence length is the idealized source: no envelope.
  assert.equal(fringeVisibility(1e6, 0), 1);
  assert.equal(fringeVisibility(1e6, NaN), 1);
});

test('coherence length and linewidth convert both ways at the standard OCT figure', () => {
  // A 50 nm SLD at 840 nm is the textbook ~6.2 um axial resolution.
  const lc = coherenceLengthForLinewidthMm(50, 840);
  assert.ok(Math.abs(lc * 1000 - 6.2) < 0.1, `expected ~6.2 um, got ${(lc * 1000).toFixed(2)}`);
  assert.ok(Math.abs(linewidthForCoherenceLengthNm(lc, 840) - 50) < 1e-9);
});

test('an ideal source still interferes at any path difference', () => {
  // The pre-existing behaviour, and the default: unchanged.
  for (const pathDifferenceMm of [0, 1, 100, 10000]) {
    assert.ok(contrastAt({ pathDifferenceMm }) > 0.99,
      `ideal source lost contrast at ${pathDifferenceMm} mm`);
  }
});

test('a finite coherence length reproduces its own envelope on the bench', () => {
  const coherenceLengthMm = 0.5;
  for (const pathDifferenceMm of [0, 0.125, 0.25, 0.5]) {
    const measured = contrastAt({ coherenceLengthMm, pathDifferenceMm });
    const predicted = fringeVisibility(pathDifferenceMm, coherenceLengthMm);
    assert.ok(Math.abs(measured - predicted) < 0.01,
      `at ${pathDifferenceMm} mm: measured ${measured.toFixed(4)}, predicted ${predicted.toFixed(4)}`);
  }
  // Far outside the envelope the two arms simply add their powers.
  assert.ok(contrastAt({ coherenceLengthMm, pathDifferenceMm: 5 }) < 1e-6);
});

test('partial coherence still conserves energy exactly', () => {
  // The ports must always sum to the input, whatever the visibility is.
  for (const coherenceLengthMm of [0, 0.05, 0.5, 5]) {
    for (const pathDifferenceMm of [0, 0.1, 0.25, 1, 50]) {
      const scene = parseSketch(MZ);
      scene.elements.find(el => el.type === 'cwlaser').params.coherenceLengthMm = coherenceLengthMm;
      scene.elements.find(el => el.type === 'delayline').params.delayMm = pathDifferenceMm;
      const cameras = scene.elements.filter(el => el.type === 'camera');
      traceAll(scene.elements);
      const total = cameras.reduce((sum, camera) => {
        const reading = detectorReading(camera.id);
        return sum + (reading ? reading.signal : 0);
      }, 0);
      assert.ok(Math.abs(total - 1) < 1e-9,
        `lc ${coherenceLengthMm}, dL ${pathDifferenceMm}: ports summed to ${total}`);
    }
  }
});

// ---------------- phase object ----------------

test('the path profile is the shape it claims to be', () => {
  assert.equal(phasePlateOpdFraction('ramp', 0), 0);
  assert.equal(phasePlateOpdFraction('ramp', 1), 1);
  assert.equal(phasePlateOpdFraction('step', 0.25), 0);
  assert.equal(phasePlateOpdFraction('step', 0.75), 1);
  assert.equal(phasePlateOpdFraction('bar', 0.5), 1, 'the bar covers the middle');
  assert.equal(phasePlateOpdFraction('bar', 0.05), 0, 'and not the edges');
  assert.equal(phasePlateOpdFraction('bump', 0.5), 1);
  assert.equal(phasePlateOpdFraction('bump', 0), 0);
  // Out-of-range crossings are clamped rather than extrapolated.
  assert.equal(phasePlateOpdFraction('ramp', -3), 0);
  assert.equal(phasePlateOpdFraction('ramp', 7), 1);
});

function withPhaseObject({ profile, opdUm, aperture = 6, pixels = 48 }) {
  const scene = parseSketch(MZ);
  const plate = createElement('phaseplate', 520, 200); // inside the upper arm
  Object.assign(plate.params, { profile, opdUm, aperture });
  scene.elements.push(plate);
  const cameras = scene.elements.filter(el => el.type === 'camera');
  cameras.forEach(camera => { camera.params.pixels = pixels; });
  traceAll(scene.elements);
  return cameras.map(camera => detectorReading(camera.id));
}

// Count how many times the profile crosses its own mid-level: a pattern with
// N fringes across the beam alternates bright/dark 2N-1 times.
function alternations(profile) {
  const lit = profile.filter(value => value > 1e-12 || true);
  const values = lit.slice(lit.findIndex(v => v > 1e-12));
  const peak = Math.max(...values);
  if (!(peak > 0)) return 0;
  const above = values.filter(v => v > 1e-12).map(v => v > peak / 2);
  let changes = 0;
  for (let i = 1; i < above.length; i++) if (above[i] !== above[i - 1]) changes++;
  return changes;
}

test('a wedge writes as many fringes across the beam as it has waves of path', () => {
  // One wave of path difference across the aperture is one full fringe.
  const one = withPhaseObject({ profile: 'ramp', opdUm: 532e-3 });
  const two = withPhaseObject({ profile: 'ramp', opdUm: 2 * 532e-3 });
  const three = withPhaseObject({ profile: 'ramp', opdUm: 3 * 532e-3 });
  assert.ok(alternations(one[0].profile) >= 1);
  assert.ok(alternations(two[0].profile) > alternations(one[0].profile));
  assert.ok(alternations(three[0].profile) > alternations(two[0].profile));

  // Averaged over whole fringes the port carries exactly half the light.
  for (const reading of [one, two, three]) {
    assert.ok(Math.abs(reading[0].signal - 0.5) < 0.01, `expected ~0.5, got ${reading[0].signal}`);
    assert.ok(Math.abs(reading[0].signal + reading[1].signal - 1) < 1e-9);
  }
});

test('a half-wave bar reproduces its own shape as a phase-contrast image', () => {
  // The bar covers the middle third, so a half-wave of path sends exactly
  // that third to the other port: two thirds of the light stays behind.
  const [bright, dark] = withPhaseObject({ profile: 'bar', opdUm: 266e-3 });
  assert.ok(Math.abs(bright.signal - 2 / 3) < 0.02, `expected ~0.667, got ${bright.signal}`);
  assert.ok(Math.abs(dark.signal - 1 / 3) < 0.02, `expected ~0.333, got ${dark.signal}`);
  assert.ok(Math.abs(bright.signal + dark.signal - 1) < 1e-9);
});

test('a phase object alone is invisible, which is the whole reason it needs a reference', () => {
  for (const opdUm of [0, 0.5, 2, 10]) {
    const laser = createElement('cwlaser', 0, 0);
    Object.assign(laser.params, { beamMode: 'beam', beamWidth: 10 });
    const plate = createElement('phaseplate', 150, 0);
    Object.assign(plate.params, { profile: 'ramp', opdUm, aperture: 10 });
    const camera = createElement('camera', 300, 0);
    Object.assign(camera.params, { ch: 30, pixels: 24 });
    traceAll([laser, plate, camera]);
    const reading = detectorReading(camera.id);
    assert.ok(Math.abs(reading.signal - 1) < 1e-9,
      `a phase object must not change intensity on its own (opd ${opdUm})`);
  }
});

test('a phase object still lengthens the optical path it adds', () => {
  // Invisible in intensity, but real: a pulse arrives later for it.
  const delays = [0, 1000, 3000].map(opdUm => {
    const laser = createElement('pulsedlaser', 0, 0);
    Object.assign(laser.params, { beamMode: 'beam', beamWidth: 2 });
    const plate = createElement('phaseplate', 150, 0);
    // A narrow beam centred in a wide bar sees the full path uniformly.
    Object.assign(plate.params, { profile: 'bar', opdUm, aperture: 30 });
    const detector = createElement('detector', 300, 0);
    detector.params.aperture = 30;
    traceAll([laser, plate, detector]);
    return detectorReading(detector.id).pulse.earliestPathDelayNs;
  });
  // 1 mm of extra optical path is 1/c ≈ 3.336 ps.
  assert.ok(Math.abs((delays[1] - delays[0]) - 1 / 299.792458) < 1e-6);
  assert.ok(Math.abs((delays[2] - delays[0]) - 3 / 299.792458) < 1e-6);
});

test('a phase object keeps the arm coherent rather than falling back', () => {
  const [bright] = withPhaseObject({ profile: 'ramp', opdUm: 532e-3 });
  // Interference is resolved where the arms actually meet, at the
  // recombining beamsplitter, and the per-sample port powers that produces
  // are what the camera then deposits -- which is why the fringes are there.
  assert.equal(bright.interference?.applied, true);
  assert.match(bright.interference.reason, /grouped at an upstream recombination surface/);
  assert.deepEqual(bright.interference.phaseIssues, [],
    'no element in the path may report an unsupported carrier phase');
});


// The defaults are the whole first impression of this element: dropped into a
// scene untouched, it has to visibly do something. A wedge of several waves is
// physically fine and looks completely broken, because the bright and dark
// fringes average back out to half the light whatever the reference arm does.
test('a phase object straight from the palette moves the reading it is watched by', () => {
  const scene = parseSketch(MZ);
  const beamWidth = scene.elements.find(el => el.type === 'cwlaser').params.beamWidth;
  const plate = createElement('phaseplate', 520, 200);
  assert.ok(plate.params.aperture <= beamWidth,
    `default aperture ${plate.params.aperture} mm must not exceed the ${beamWidth} mm default beam`);
  const fringes = plate.params.opdUm * 1000 / 532;
  assert.ok(fringes > 0.25 && fringes <= 1,
    `defaults write ${fringes.toFixed(2)} fringes across the beam; past one the total washes out`);

  scene.elements.push(plate);
  const cameras = scene.elements.filter(el => el.type === 'camera');
  const delay = scene.elements.find(el => el.type === 'delayline');
  const readings = [0, 532e-6 / 2].map(delayMm => {
    delay.params.delayMm = delayMm;
    traceAll(scene.elements);
    return detectorReading(cameras[0].id).signal;
  });
  // Half a wave of reference delay has to visibly move the port. A third of
  // full scale is the most the default bar can give -- it covers a third of
  // the beam -- and it is unmistakable on the readout.
  assert.ok(Math.abs(readings[0] - readings[1]) > 0.25,
    `defaults barely respond to the reference arm: ${readings.map(v => v.toFixed(4)).join(' -> ')}`);
});

test('the readout says so when the fringes are too fine to move the total', () => {
  const spec = registry.phaseplate.params.find(p => p.key === 'phaseFringes');
  const el = createElement('phaseplate', 0, 0);
  assert.match(spec.readout({ ...el.params, opdUm: 0 }, el), /None/);
  // Untraced, it can only report what a filled aperture would give.
  assert.match(spec.readout({ ...el.params, opdUm: 5 }, el), /if the beam fills the aperture/);
});

test('the readout warns exactly when the total genuinely cannot move', () => {
  const spec = registry.phaseplate.params.find(p => p.key === 'phaseFringes');
  const scene = parseSketch(MZ);
  const plate = createElement('phaseplate', 520, 200);
  scene.elements.push(plate);
  const delay = scene.elements.find(el => el.type === 'delayline');
  const camera = scene.elements.filter(el => el.type === 'camera')[0];

  // Sweep the reference arm a whole wave and watch how far the port actually
  // travels. Whatever the hint claims has to agree with that -- checking the
  // wording against a hand-listed set of profiles just re-asserts whatever the
  // formula already believes.
  const check = params => {
    Object.assign(plate.params, params);
    let lowest = Infinity, highest = -Infinity;
    for (let step = 0; step < 32; step++) {
      delay.params.delayMm = step * 532e-6 / 32;
      traceAll(scene.elements);
      const value = detectorReading(camera.id).signal;
      lowest = Math.min(lowest, value);
      highest = Math.max(highest, value);
    }
    delay.params.delayMm = 0;
    traceAll(scene.elements);
    return { swing: highest - lowest, says: spec.readout(plate.params, plate) };
  };

  for (const params of [
    { profile: 'ramp', opdUm: 0.27 },    // half a fringe: swings hardest of all
    { profile: 'ramp', opdUm: 0.532 },   // one whole fringe: cancels exactly
    { profile: 'ramp', opdUm: 1.064 },   // two fringes: cancels again
    { profile: 'ramp', opdUm: 8 },       // many fringes: averaged away
    { profile: 'step', opdUm: 0.266 },   // half a wave across half the beam
    { profile: 'step', opdUm: 0.4 },     // the same step off half a wave DOES move
    { profile: 'bar', opdUm: 0.266 },
    { profile: 'bar', opdUm: 0.532 },
    { profile: 'bump', opdUm: 0.27 },
  ]) {
    const { swing, says } = check(params);
    const warned = /stays put/.test(says);
    const label = `${params.profile} ${params.opdUm} µm (measured swing ${swing.toFixed(4)})`;
    if (warned) assert.ok(swing < 0.1, `${label} was called immovable but moves`);
    else assert.ok(swing > 0.1, `${label} promised movement it does not have`);
  }
});

// The trap the first implementation fell into: comparing only the two
// reference phases 0 and pi. Those are the extremes for a central bar, and
// they are exactly where a wedge is flat -- so a wedge that swings across
// two thirds of full scale measured as motionless.
test('the swing hint is not fooled by a profile whose extremes sit off 0 and pi', () => {
  const spec = registry.phaseplate.params.find(p => p.key === 'phaseFringes');
  const scene = parseSketch(MZ);
  const plate = createElement('phaseplate', 520, 200);
  Object.assign(plate.params, { profile: 'ramp', opdUm: 0.27 });
  scene.elements.push(plate);
  const delay = scene.elements.find(el => el.type === 'delayline');
  const camera = scene.elements.filter(el => el.type === 'camera')[0];
  const at = delayMm => {
    delay.params.delayMm = delayMm;
    traceAll(scene.elements);
    return detectorReading(camera.id).signal;
  };
  // Sampled at 0 and half a wave this wedge looks perfectly still...
  assert.ok(Math.abs(at(0) - at(532e-6 / 2)) < 0.05);
  // ...while a quarter wave away it has moved most of the way across.
  assert.ok(Math.abs(at(532e-6 / 4) - at(0)) > 0.25);
  assert.doesNotMatch(spec.readout(plate.params, plate), /stays put/);
});

