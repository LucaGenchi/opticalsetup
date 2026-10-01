// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TIME_SCALES, MIN_TIME_SCALE, MAX_TIME_SCALE, CW_FALLBACK_RATIO,
  snapTimeScale, pulsePeriodNs, pulsesReadAsCW, elementDriveHz, recommendedTimeScale, nextAutoScale,
} from '../sketch/js/timescale.js';
import { createElement, galvoAngleAt, registry } from '../sketch/js/elements.js';
import { gateTransmissionAt, pulseMarkers } from '../sketch/js/pulses.js';

const scaleOf = elements => recommendedTimeScale(elements).scaleNsPerSecond;

const pulsedLaser = (repRateMHz, x = 0) => {
  const laser = createElement('pulsedlaser', x, 0);
  laser.params.temporalMode = 'pulsed';
  laser.params.repRateMHz = repRateMHz;
  return laser;
};

test('the canvas offers exactly the seven requested time scales, 1 ns/s through 1 ms/s', () => {
  assert.deepEqual(TIME_SCALES.map(s => s.ns), [1, 10, 100, 1e3, 1e4, 1e5, 1e6]);
  assert.deepEqual(TIME_SCALES.map(s => s.label),
    ['1 ns/s', '10 ns/s', '100 ns/s', '1 µs/s', '10 µs/s', '100 µs/s', '1 ms/s']);
  assert.equal(MIN_TIME_SCALE, 1);
  assert.equal(MAX_TIME_SCALE, 1e6);
});

test('schematic pulsed-source defaults pace the train at about two real seconds per period', () => {
  assert.equal(scaleOf([pulsedLaser(200)]), 1, '200 MHz (5 ns) -> 1 ns/s');
  assert.equal(scaleOf([pulsedLaser(80)]), 10, '80 MHz (12.5 ns) -> 10 ns/s');
  assert.equal(scaleOf([pulsedLaser(40)]), 10, '40 MHz (25 ns) -> 10 ns/s, not 1 µs/s (Luca, #190)');
  assert.equal(scaleOf([pulsedLaser(10)]), 100, '10 MHz (100 ns) -> 100 ns/s');
  assert.equal(scaleOf([pulsedLaser(1)]), 1e3, '1 MHz -> 1 µs/s');
  assert.equal(scaleOf([pulsedLaser(0.2)]), 1e3, '200 kHz -> 1 µs/s (was 100 µs/s)');
  assert.equal(scaleOf([pulsedLaser(0.1)]), 1e4, '100 kHz -> 10 µs/s');
  assert.equal(scaleOf([pulsedLaser(0.001)]), 1e6, '1 kHz -> 1 ms/s');
});

test('physical spacing moves packets at c x scale: its default is the slowest scale', () => {
  for (const repRateMHz of [200, 80, 1, 0.2]) {
    assert.equal(recommendedTimeScale([pulsedLaser(repRateMHz)], { mode: 'physical' }).scaleNsPerSecond, MIN_TIME_SCALE, `${repRateMHz} MHz`);
  }
  // A mechanical element still asks for its own, slower-moving scale.
  const chopper = createElement('chopper', 0, 0);
  chopper.params.modulate = true;
  chopper.params.frequencyHz = 1000;
  assert.equal(recommendedTimeScale([pulsedLaser(80), chopper], { mode: 'physical' }).scaleNsPerSecond, 1e6);
});

// How fast the packets of a train actually move on the drawing, in mm per
// real second, at a given scale: two nearby frames of pulseMarkers on a
// straight 600 mm path.
function packetSpeedMmPerS(repRateMHz, scaleNsPerSecond, mode) {
  const track = { pts: [{ x: 0, y: 0 }, { x: 600, y: 0 }], opls: [0, 600], pulse: { repRateMHz, pulseWidthFs: 100, phaseNs: 0 } };
  const dtNs = scaleNsPerSecond / 1000; // one millisecond of real time
  for (let t0 = 0; t0 < 1e9; t0 += 0.37 * 1000 / repRateMHz) {
    const a = pulseMarkers(track, t0, { mode }), b = pulseMarkers(track, t0 + dtNs, { mode });
    if (a.length && b.length && b[0].opl > a[0].opl) return (b[0].opl - a[0].opl) / 1e-3;
  }
  return null;
}

test('at the default scale, packets move at a watchable speed in either display mode', () => {
  // Schematic: 0.6-6 real seconds per period, one ~140 mm spacing each.
  for (const repRateMHz of [1000, 200, 80, 50, 40, 10, 1, 0.5, 0.2, 0.1, 0.02, 0.001]) {
    const scale = scaleOf([pulsedLaser(repRateMHz)]);
    const speed = packetSpeedMmPerS(repRateMHz, scale, 'schematic');
    assert.ok(speed >= 15 && speed <= 250, `${repRateMHz} MHz at ${scale} ns/s: ${speed} mm/s`);
  }
  // Physical: the speed of light on the drawing at 1 ns/s.
  const physical = packetSpeedMmPerS(80, recommendedTimeScale([pulsedLaser(80)], { mode: 'physical' }).scaleNsPerSecond, 'physical');
  assert.ok(Math.abs(physical - 299.792458) < 1e-6, `${physical} mm/s`);
  // The case Luca reported: 40 MHz at the old 1 µs/s default moved 5.6 m/s.
  assert.ok(packetSpeedMmPerS(40, 1e3, 'schematic') > 5000);
});

test('the fastest source in the scene sets the pulsed tier', () => {
  assert.equal(scaleOf([pulsedLaser(0.01, 0), pulsedLaser(80, 200)]), 10,
    'an 80 MHz source alongside a 10 kHz one still selects the 10 ns/s tier');
});

test('continuous-wave sources contribute no timing requirement', () => {
  const cw = createElement('cwlaser', 0, 0);
  assert.equal(elementDriveHz(cw), null);
  assert.equal(scaleOf([cw]), 10, 'a scene with nothing animated falls back to the 10 ns/s default');
});

test('a moving piezo stage recommends Mechanics mode, not a numeric scale', () => {
  // No numeric scale can make the stage's illustrative wall-clock motion
  // "correct," so its presence recommends Mechanics outright.
  const stage = createElement('stage', 0, 0);
  stage.params.pzMode = 'xy';
  const result = recommendedTimeScale([stage]);
  assert.equal(result.mechanics, true);
  assert.equal(result.driver, 'the piezo stage');
  const staticStage = createElement('stage', 0, 0);
  assert.equal(recommendedTimeScale([staticStage]).mechanics, false, 'a static stage recommends nothing special');
});

test('a moving retroreflector delay line also recommends Mechanics mode', () => {
  const retro = createElement('retroreflector', 0, 0);
  retro.params.moveMode = 'linear';
  const result = recommendedTimeScale([retro]);
  assert.equal(result.mechanics, true);
  assert.equal(result.driver, 'the delay line');
});

test('a moving piezo stage or delay line wins over a much faster pulsed source', () => {
  const stage = createElement('stage', 300, 0);
  stage.params.pzMode = 'xy';
  const result = recommendedTimeScale([pulsedLaser(80), stage]);
  assert.equal(result.mechanics, true, 'the 80 MHz laser alone would ask for a numeric 10 ns/s');
  assert.equal(result.driver, 'the piezo stage');
});

test('a galvo defaults to a realistic 100 Hz line-scan rate and reaches kHz', () => {
  const galvo = createElement('galvo', 0, 0);
  assert.equal(galvo.params.scanFrequencyHz, 100, 'point-scanning galvos run at tens of Hz to kHz');
  const spec = registry.galvo.params.find(p => p.key === 'scanFrequencyHz');
  assert.equal(spec.def, 100);
  assert.ok(spec.max >= 1000, 'the fastest point-scanning applications reach kHz');
});

test('galvo, chopper, AOM and AOD each raise the scale to keep their own motion watchable', () => {
  const galvo = createElement('galvo', 0, 0);
  galvo.params.scanMode = 'sine';
  galvo.params.scanFrequencyHz = 1;
  assert.equal(scaleOf([galvo]), 1e6, 'a 1 Hz galvo needs the slowest scale');

  const chopper = createElement('chopper', 0, 0);
  chopper.params.modulate = true;
  chopper.params.frequencyHz = 1000;
  assert.equal(scaleOf([chopper]), 1e6, 'a 1 kHz chopper cycles once per second at 1 ms/s');

  const aom = createElement('aom', 0, 0);
  aom.params.modulate = true;
  aom.params.modFreqMHz = 1;
  assert.equal(scaleOf([aom]), 1e3, '1 MHz AOM modulation cycles once per second at 1 µs/s');

  const aod = createElement('aod', 0, 0);
  aod.params.scanMode = 'triangle';
  aod.params.scanFreqKHz = 10;
  assert.equal(scaleOf([aod]), 1e5, '10 kHz AOD scanning cycles once per second at 100 µs/s');

  const eom = createElement('eom', 0, 0);
  eom.params.modulate = true;
  eom.params.driveMode = 'switching';
  eom.params.switchFreqMHz = 1;
  assert.equal(scaleOf([eom]), 1e3, '1 MHz EOM switching cycles once per second at 1 µs/s');
});

test('static animated elements are ignored until they are actually switched on', () => {
  const galvo = createElement('galvo', 0, 0);
  assert.equal(elementDriveHz(galvo), null, 'a static galvo drives nothing');
  // NB: the chopper ships with modulate ON, so it drives the clock as soon as
  // it is placed; only an explicitly disabled one is inert.
  const chopper = createElement('chopper', 0, 0);
  assert.ok(Number.isFinite(elementDriveHz(chopper)), 'a default chopper is already modulating');
  chopper.params.modulate = false;
  assert.equal(elementDriveHz(chopper), null, 'a switched-off chopper drives nothing');
  const stage = createElement('stage', 0, 0);
  assert.equal(elementDriveHz(stage), null, 'a stage with no scan pattern drives nothing');
  const retro = createElement('retroreflector', 0, 0);
  assert.equal(elementDriveHz(retro), null, 'a static retroreflector drives nothing');
});

test('a static-retardance EOM and the mechanical delay line are constants, not waveforms', () => {
  const eom = createElement('eom', 0, 0);
  eom.params.modulate = true;
  assert.equal(elementDriveHz(eom), null, 'a static EOM retardance is a fixed phase, not a drive frequency');
  assert.equal(elementDriveHz(createElement('delayline', 0, 0)), null,
    'the delay line adds fixed optical path, it does not oscillate');
});

test('a switching EOM drives the auto time-scale at its switching frequency', () => {
  const eom = createElement('eom', 0, 0);
  eom.params.modulate = true;
  eom.params.driveMode = 'switching';
  eom.params.switchFreqMHz = 2;
  assert.equal(elementDriveHz(eom), 2e6, 'a switching EOM drives at its configured MHz rate');
  eom.params.modulate = false;
  assert.equal(elementDriveHz(eom), null, 'no voltage applied means no drive, even in switching mode');
});

test('snapTimeScale always returns a listed scale and clamps beyond the ends', () => {
  for (const desired of [0.001, 1, 7, 43, 900, 5e4, 9e5, 1e9, 1e15]) {
    assert.ok(TIME_SCALES.some(s => s.ns === snapTimeScale(desired)), `${desired} snapped off-list`);
  }
  assert.equal(snapTimeScale(1e15), MAX_TIME_SCALE, 'absurdly slow motion clamps to 1 ms/s');
  assert.equal(snapTimeScale(1e-9), MIN_TIME_SCALE, 'absurdly fast motion clamps to 1 ns/s');
  for (const bad of [NaN, 0, -5, Infinity]) {
    assert.ok(TIME_SCALES.some(s => s.ns === snapTimeScale(bad)), `${bad} should still yield a usable scale`);
  }
});

test('pulse period is derived correctly from the repetition rate', () => {
  assert.ok(Math.abs(pulsePeriodNs(80) - 12.5) < 1e-9, '80 MHz -> 12.5 ns');
  assert.ok(Math.abs(pulsePeriodNs(1) - 1000) < 1e-9, '1 MHz -> 1000 ns');
  assert.ok(Math.abs(pulsePeriodNs(0.001) - 1e6) < 1e-6, '1 kHz -> 1 ms');
  assert.equal(pulsePeriodNs(0), null);
  assert.equal(pulsePeriodNs(NaN), null);
});

test('packets fall back to CW when the pulse period is far from the time scale, in either direction', () => {
  // period >> scale: packets crawl and effectively never arrive
  assert.equal(pulsesReadAsCW(1e6, 1), true, '1 kHz source at 1 ns/s');
  // period << scale: packets smear into a continuous stream
  assert.equal(pulsesReadAsCW(12.5, 1e6), true, '80 MHz source at 1 ms/s');
});

test('packets stay packets whenever the scale is a reasonable match', () => {
  assert.equal(pulsesReadAsCW(12.5, 10), false, '80 MHz at its own 10 ns/s default');
  assert.equal(pulsesReadAsCW(1000, 1e3), false, '1 MHz at its own 1 µs/s default');
  assert.equal(pulsesReadAsCW(1e5, 1e5), false, '10 kHz at its own 100 µs/s default');
  assert.equal(pulsesReadAsCW(25, 10), false, '40 MHz at its own 10 ns/s default');
  assert.equal(pulsesReadAsCW(CW_FALLBACK_RATIO, 1), false, 'exactly at the ratio limit is still drawn');
});

test('every auto-selected default keeps its own pulses drawn as packets', () => {
  // The auto-selection and the CW fallback must not disagree: whatever scale
  // the app picks for a source, that source must still read as pulsed.
  for (const repRateMHz of [200, 80, 50, 10, 1, 0.5, 0.1, 0.01, 0.001]) {
    const scale = scaleOf([pulsedLaser(repRateMHz)]);
    const period = pulsePeriodNs(repRateMHz);
    assert.equal(pulsesReadAsCW(period, scale), false,
      `${repRateMHz} MHz auto-selected ${scale} ns/s but would render as CW`);
  }
});

test('all sim-clock timing elements are periodic on one shared simulated-time axis', () => {
  // Sync contract: given the same simulated time, every element driven by the
  // shared clock advances at its own real configured frequency. Two elements
  // configured to the same frequency therefore complete a cycle together.
  // (The piezo stage and retroreflector are deliberately excluded — they stay
  // on an illustrative wall clock, well outside this range.)
  // 100 Hz sits inside the galvo's real 0.01–200 Hz mechanical range; above
  // 200 Hz galvoAngleAt() clamps, which would break the periodicity contract.
  const HZ = 100;
  const periodNs = 1e9 / HZ;

  const galvo = createElement('galvo');
  galvo.params.scanMode = 'sine';
  galvo.params.scanFrequencyHz = HZ;
  galvo.params.scanAmplitude = 5;

  const gate = { opl: 0, frequencyMHz: HZ / 1e6, duty: 0.5, phaseNs: 0 };

  for (const startNs of [0, 137, 4242.5]) {
    const galvoAt = t => galvoAngleAt(galvo.params, t / 1e9);
    assert.ok(Math.abs(galvoAt(startNs) - galvoAt(startNs + periodNs)) < 1e-9,
      'the galvo returns to the same angle exactly one period later');
    assert.ok(Math.abs(gateTransmissionAt(gate, startNs) - gateTransmissionAt(gate, startNs + periodNs)) < 1e-9,
      'the chopper/AOM gate returns to the same state exactly one period later');
  }

  // ...and they are genuinely in step, not merely each periodic: a half period
  // in, the galvo has swung to the opposite side while the gate has flipped.
  assert.ok(galvoAngleAt(galvo.params, 0) * galvoAngleAt(galvo.params, (periodNs / 2) / 1e9) <= 1e-9,
    'half a period moves the galvo to the opposite side of its sweep');
  assert.notEqual(gateTransmissionAt(gate, 0), gateTransmissionAt(gate, periodNs / 2));
});

test('a galvo is only fast enough to ride the simulated clock in the top part of its range', () => {
  // Documents why galvo sync is conditional: at the coarsest scale (1 ms/s)
  // one real second is 1 ms of simulated time, so only galvos at roughly
  // 100 Hz and above complete a sweep in a watchable time. Slower ones fall
  // back to the illustrative wall clock, like the stage and retroreflector.
  const realSecondsPerCycleAtCoarsest = hz => 1 / (hz * (1e6 / 1e9));
  const WATCHABLE_S = 12;
  // The two rates called out explicitly: at 1 ms/s a 100 Hz galvo must take
  // 10 real seconds per period and a 1 kHz galvo exactly 1 second.
  assert.equal(realSecondsPerCycleAtCoarsest(100), 10);
  assert.equal(realSecondsPerCycleAtCoarsest(1000), 1);
  assert.ok(realSecondsPerCycleAtCoarsest(100) <= WATCHABLE_S, '100 Hz must ride the simulated clock');
  assert.ok(realSecondsPerCycleAtCoarsest(1000) <= WATCHABLE_S, '1 kHz must ride the simulated clock');
  assert.ok(realSecondsPerCycleAtCoarsest(1) > WATCHABLE_S, 'a 1 Hz galvo would take ~1000 s — illustrative');
  assert.ok(realSecondsPerCycleAtCoarsest(0.4) > WATCHABLE_S, 'the wiki demo galvo would freeze if synced');
});

test('scaling simulated time rescales galvo motion proportionally', () => {
  // The whole point of the time-scale control: the same real second advances
  // more simulated time at a coarser scale, so the galvo sweeps further.
  const galvo = createElement('galvo');
  galvo.params.scanMode = 'sine';
  galvo.params.scanFrequencyHz = 1;
  galvo.params.scanAmplitude = 5;

  const angleAfterOneRealSecondAt = scaleNsPerSecond => {
    const simulatedSeconds = (1 * scaleNsPerSecond) / 1e9;
    return galvoAngleAt(galvo.params, simulatedSeconds);
  };
  // At 1 ms/s one real second is 1 ms of simulated time = 1/1000 of a 1 Hz
  // cycle; at 1 ns/s it is a million times less, i.e. essentially frozen.
  assert.ok(Math.abs(angleAfterOneRealSecondAt(1e6)) > Math.abs(angleAfterOneRealSecondAt(1)),
    'a coarser time scale advances the galvo further per real second');
});

// The automatic scale over a session: follow the scene, hold a hand-picked
// scale while the scene still calls for the same default, and release it as
// soon as it calls for a different one.
function session(keys, manualAt = {}) {
  let status = { lastAuto: null, manualFor: null };
  const applied = [];
  keys.forEach((key, i) => {
    if (i in manualAt) status = { ...status, manualFor: manualAt[i] };
    const next = nextAutoScale(key, status);
    status = { lastAuto: next.lastAuto, manualFor: next.manualFor };
    applied.push(next.apply ? key : null);
  });
  return { applied, status };
}

test('the automatic scale follows the scene and stays quiet when nothing changes', () => {
  // 10 ns/s is the startup default: no change, no announcement.
  assert.deepEqual(session([10, 10, 1e3, 1e3, 10]).applied, [null, null, 1e3, null, 10]);
  assert.deepEqual(session(['mechanics', 'mechanics']).applied, ['mechanics', null]);
});

test('a hand-picked scale holds only until the scene calls for a different default', () => {
  // A 40 MHz source (10 ns/s); the user picks another scale by hand while the
  // recommendation is 10 ns/s; edits that keep it at 10 ns/s leave the pick
  // alone; adding a 1 kHz chopper (1 ms/s) releases it.
  const { applied, status } = session([10, 10, 10, 1e6, 1e6, 10], { 1: 10 });
  assert.deepEqual(applied, [null, null, null, 1e6, null, 10]);
  assert.equal(status.manualFor, null, 'released, not held for the rest of the session');
  // Switching to physical spacing (1 ns/s) also releases it.
  assert.deepEqual(session([10, 1], { 1: 10 }).applied, [null, 1]);
  // Released even when the new recommendation is the one applied before the pick.
  assert.deepEqual(nextAutoScale(1e3, { lastAuto: 1e3, manualFor: 10 }), { apply: true, lastAuto: 1e3, manualFor: null });
  // A demo that fixes its scale holds it the same way (no scale applied yet).
  assert.deepEqual(nextAutoScale(1e3, { lastAuto: null, manualFor: 1e3 }), { apply: false, lastAuto: null, manualFor: 1e3 });
});
