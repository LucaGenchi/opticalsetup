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

// The RF carrier is the acoustic drive, not the modulation rate: it shifts the
// diffracted order's optical frequency whether or not the drive is modulated,
// which is what an AOM used purely as a frequency shifter does. It therefore
// stays visible, and is named so it cannot be mistaken for the modulation.
test('the RF carrier shifts the diffracted wavelength with the drive unmodulated', () => {
  const detected = rfMHz => {
    const laser = createElement('pulsedlaser', 0, 0);
    laser.params.beamMode = 'line';
    const aom = createElement('aom', 200, 0);
    Object.assign(aom.params, { modulate: false, eff: 1, deflect: 10, rfMHz });
    const detector = createElement('detector', 400, Math.round(200 * Math.tan(10 * Math.PI / 180)));
    detector.params.aperture = 40;
    traceAll([laser, aom, detector], []);
    return detectorReading(detector.id)?.wavelength;
  };
  assert.notEqual(detected(5), detected(80),
    'the carrier must keep shifting the light while the drive is unmodulated');
});

test('the RF carrier is always offered, and named apart from the modulation', () => {
  const carrier = registry.aom.params.find(p => p.key === 'rfMHz');
  const modulation = registry.aom.params.find(p => p.key === 'modFreqMHz');
  assert.equal(carrier.show, undefined, 'the carrier is live whether or not the drive is modulated');
  assert.match(carrier.label, /carrier/i);
  assert.ok(modulation.show({ modulate: true }) && !modulation.show({ modulate: false }),
    'the modulation rate is the one that only applies while modulating');
});
