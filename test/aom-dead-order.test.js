import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceScene, traceAll, detectorReading } from '../sketch/js/raytrace.js';

// An AOM at full efficiency sends everything into the first order, so there is
// no zeroth order at all. It used to be emitted anyway at exactly zero
// intensity: the beam fill skipped it, but the pulse overlay drew packets
// along it, so a train appeared to travel down a beam that was not there.
function tracks({ eff = 1, modulate = false, zero = true } = {}) {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'line', repRateMHz: 80, showPulse: true });
  const aom = createElement('aom', 200, 0);
  Object.assign(aom.params, { modulate, modShape: 'square', eff, zero, deflect: 10 });
  // Detectors on both orders, as in the reported scene. They matter: a
  // detector is a low-power measurement surface, so a ray too weak to draw is
  // deliberately carried to it. That is what gave the dead zeroth order a full
  // path to hang packets on -- without something downstream it dies at the
  // first step and the defect does not appear at all.
  const straightDet = createElement('detector', 500, 0);
  const deflectedDet = createElement('detector', 500, Math.round(300 * Math.tan(10 * Math.PI / 180)));
  straightDet.params.aperture = 40;
  deflectedDet.params.aperture = 40;
  const { pulseTracks } = traceScene([laser, aom, straightDet, deflectedDet], []);
  const straight = t => Math.abs(t.pts.at(-1).y - t.pts[0].y) < 1;
  return {
    // The incoming beam is straight too, so count only what leaves the AOM.
    zeroth: pulseTracks.filter(t => straight(t) && t.pts[0].x >= 200),
    first: pulseTracks.filter(t => !straight(t)),
  };
}

test('a fully efficient AOM draws no packets down its empty zeroth order', () => {
  const { zeroth, first } = tracks({ eff: 1 });
  assert.equal(zeroth.length, 0, 'nothing is left to travel straight on');
  assert.equal(first.length, 1, 'and the diffracted order still carries its train');
});

test('a partly efficient AOM still draws the zeroth order it really has', () => {
  for (const eff of [0.85, 0.5, 0.1]) {
    const { zeroth } = tracks({ eff });
    assert.equal(zeroth.length, 1, `eff ${eff}: the undiffracted beam should still be drawn`);
    assert.ok(Math.abs(zeroth[0].intensity - (1 - eff)) < 1e-9,
      `eff ${eff}: expected intensity ${(1 - eff).toFixed(2)}, got ${zeroth[0].intensity}`);
  }
});

test('an AOM with no diffraction at all draws no first order', () => {
  const { zeroth, first } = tracks({ eff: 0 });
  assert.equal(first.length, 0, 'nothing is diffracted');
  assert.equal(zeroth.length, 1, 'the whole beam goes straight through');
});

// The same must hold while modulating, where the zeroth order is assembled
// from two branches.
test('a modulated AOM at full efficiency draws no empty zeroth order either', () => {
  const { zeroth, first } = tracks({ eff: 1, modulate: true });
  assert.equal(first.length, 1);
  // At efficiency 1 the residual branch carries nothing; only the light handed
  // back while the RF is off remains, and that is a real beam.
  assert.equal(zeroth.length, 1, 'the returned light is real and still drawn');
  assert.ok(zeroth[0].intensity > 1e-9);
});

test('turning the zeroth order off draws nothing straight through at any efficiency', () => {
  for (const eff of [1, 0.5]) {
    assert.equal(tracks({ eff, zero: false }).zeroth.length, 0);
  }
});

// The RF drive frequency is gone. Acousto-optic diffraction really does shift
// the optical carrier by it, but at 7.6e-5 nm for 80 MHz at 532 nm that is a
// thousand times finer than any wavelength difference this workbench resolves
// -- every readout rounds to the nearest nanometre -- so the control only ever
// moved a number nothing could report. The AOD had already declined it.
test('the AOM carries the wavelength through untouched', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.wavelength = 532;
  const aom = createElement('aom', 200, 0);
  Object.assign(aom.params, { modulate: false, eff: 1, deflect: 10 });
  const detector = createElement('detector', 400, Math.round(200 * Math.tan(10 * Math.PI / 180)));
  detector.params.aperture = 40;
  traceAll([laser, aom, detector], []);
  assert.equal(detectorReading(detector.id).wavelength, 532);
});

test('the AOM offers no drive-frequency control, and its one frequency is the modulation', () => {
  assert.equal(registry.aom.params.find(p => p.key === 'rfMHz'), undefined);
  const frequencies = registry.aom.params.filter(p => /frequency/i.test(p.label || ''));
  assert.deepEqual(frequencies.map(p => p.key), ['modFreqMHz'],
    'only the modulation rate is left, so there is nothing to confuse it with');
  assert.ok(frequencies[0].show({ modulate: true }) && !frequencies[0].show({ modulate: false }),
    'and it only applies while the drive is modulated');
});

// A sketch saved while the control existed still loads; the stale key is
// carried and ignored rather than changing anything.
test('a sketch saved with a drive frequency still traces identically', () => {
  const build = extra => {
    const laser = createElement('pulsedlaser', 0, 0);
    laser.params.beamMode = 'line';
    const aom = createElement('aom', 200, 0);
    Object.assign(aom.params, { modulate: false, eff: 0.8, deflect: 10 }, extra);
    const detector = createElement('detector', 400, Math.round(200 * Math.tan(10 * Math.PI / 180)));
    detector.params.aperture = 40;
    traceAll([laser, aom, detector], []);
    const reading = detectorReading(detector.id);
    return { signal: reading.signal, wavelength: reading.wavelength };
  };
  assert.deepEqual(build({ rfMHz: 80 }), build({}));
});

// The cut has to be a cut, not a rejection. A beam extinguished part way
// along is still lit up to that point, and its packets belong on the lit
// stretch: judging the whole path by its final intensity threw away the train
// between a laser and a fully blocking filter, where the beam is drawn.
test('packets survive on the lit stretch of a path that is extinguished later', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'line', repRateMHz: 80, showPulse: true });
  const shutter = createElement('filter', 300, 0);
  Object.assign(shutter.params, { ftype: 'nd', trans: 0 });
  const { pulseTracks } = traceScene([laser, shutter], []);
  assert.equal(pulseTracks.length, 1, 'the lit run from the laser to the filter keeps its train');
  const track = pulseTracks[0];
  assert.ok(track.intensity > 1e-9, 'and it is recorded at the intensity it actually carries');
  // Truncated at the filter, not carried on past it.
  assert.ok(track.pts.at(-1).x <= 305, `the train should stop at the filter, ended at x=${track.pts.at(-1).x}`);
  assert.equal(track.pts.length, track.opls.length, 'points and optical paths stay in step');
});

// A drawing threshold must never decide what exists. The tracer deliberately
// walks weak positive rays to detectors, so the emitters hand over whatever
// they carry and only the overlay applies the visual floor.
test('a nearly extinguished zeroth order still reaches a detector', () => {
  for (const residual of [1e-9, 1e-10, 1e-11]) {
    const laser = createElement('cwlaser', 0, 0);
    laser.params.beamMode = 'line';
    const aom = createElement('aom', 200, 0);
    Object.assign(aom.params, { modulate: false, eff: 1 - residual, zero: true, deflect: 10 });
    const detector = createElement('detector', 400, 0);
    detector.params.aperture = 40;
    traceAll([laser, aom, detector], []);
    const reading = detectorReading(detector.id);
    assert.ok(reading, `a zeroth order of ${residual.toExponential(0)} should still be measured`);
    assert.ok(Math.abs(reading.signal - residual) / residual < 1e-6,
      `expected ${residual.toExponential(0)}, read ${reading.signal.toExponential(3)}`);
  }
});
