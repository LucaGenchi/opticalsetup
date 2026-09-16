import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { registry } from '../sketch/js/elements.js';
import { detectorReading, mixReading, probeAt, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import {
  crossCorrelatorScene, DELAY_MM, FUNDAMENTAL_NM, HARMONIC_NM, PULSE_FS,
  REP_RATE_MHZ, STAGE_EXTRA_MM, STAGE_OFFSET_MM, SUM_NM, XCORR_NAME, XCORR_PATH,
} from '../tools/build-crosscorrelator-example.mjs';

const C_MM_PER_NS = 299.792458;
const raw = readFileSync(new URL(`../Examples/Ultrashort Pulses/${XCORR_NAME}.json`, import.meta.url), 'utf8');

function traced(detuneMm = 0) {
  const scene = parseSketch(raw, registry);
  if (detuneMm) scene.elements.find(el => el.id === 'delay').params.delayMm += detuneMm;
  traceScene(scene.elements);
  return { scene, reading: mixReading('mixer'), detector: detectorReading('signal-detector') };
}

test('the committed cross-correlator is exactly what its generator writes', () => {
  assert.deepEqual(JSON.parse(raw), crossCorrelatorScene());
});

test('the delay line matches the stage\'s double pass, so the example opens at time zero', () => {
  const { M1, M2, splitter, combiner } = XCORR_PATH;
  // The fundamental leaves the axis, crosses the offset twice, and comes back.
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const folded = d(splitter, M1) + d(M1, M2) + d(M2, combiner);
  const direct = d(splitter, combiner);
  assert.equal(folded - direct, STAGE_EXTRA_MM, 'the fold does not add 2 × its offset');
  assert.equal(STAGE_EXTRA_MM, 2 * STAGE_OFFSET_MM);
  assert.equal(DELAY_MM, STAGE_EXTRA_MM, 'the delay line does not match the fold');
  // 400 mm is 1.33 ns, which is what the page quotes.
  assert.ok(Math.abs(DELAY_MM / C_MM_PER_NS - 1.3343) < 1e-3);

  const { reading } = traced();
  assert.equal(reading.state, 'mixing');
  assert.equal(reading.skewNs, 0, 'the two arms do not arrive together');
  assert.equal(reading.overlap, 1);
});

test('one laser drives both colours, and they mix to the sum frequency', () => {
  const { scene, reading, detector } = traced();
  const laser = scene.elements.find(el => el.id === 'laser');
  assert.equal(laser.params.wavelength, FUNDAMENTAL_NM);
  assert.equal(laser.params.pulseWidthFs, PULSE_FS);
  assert.equal(laser.params.repRateMHz, REP_RATE_MHZ);
  // Both arms are the same train, so the rates cannot disagree.
  assert.equal(reading.repRateMHz, REP_RATE_MHZ);
  assert.equal(reading.partnerRepRateMHz, REP_RATE_MHZ);
  assert.ok(Math.abs(reading.wl - SUM_NM) < 1e-6, `sum frequency ${reading.wl}`);
  assert.ok(Math.abs(SUM_NM - 343.333) < 1e-3);

  // The bandpass leaves only the sum frequency on the detector.
  assert.ok(detector, 'nothing reached the detector');
  assert.ok(detector.spectrum.every(s => Math.abs(s.wavelength - SUM_NM) < 1),
    `${detector.spectrum.map(s => s.wavelength).join(', ')} reached the signal detector`);

  const probe = id => {
    const el = scene.elements.find(e => e.id === id);
    return probeAt(el.x, el.y);
  };
  assert.ok(Math.abs(probe('fundamental-wavelength').wl - FUNDAMENTAL_NM) < 0.5);
  assert.ok(Math.abs(probe('harmonic-wavelength').wl - HARMONIC_NM) < 0.5);
  assert.ok(Math.abs(probe('sum-wavelength').wl - SUM_NM) < 0.5);
});

test('scanning the delay away from zero extinguishes the signal', () => {
  // 0.06 mm of path is 200 fs: two 200 fs pulses that far apart keep a
  // quarter of their overlap, exp(−4 ln2 Δt²/(τ₁²+τ₂²)).
  const near = traced(0.06);
  assert.equal(near.reading.state, 'mixing');
  assert.ok(Math.abs(near.reading.overlap - 0.25) < 1e-3, `overlap ${near.reading.overlap}`);
  assert.ok(near.detector, 'the signal vanished 200 fs from zero');

  const far = traced(0.2);
  assert.equal(far.reading.state, 'unsynchronized');
  assert.equal(far.detector, null, 'a signal survived a 667 fs mismatch');

  // Symmetric: it does not matter which arm is long.
  const behind = traced(-0.06);
  assert.ok(Math.abs(behind.reading.overlap - near.reading.overlap) < 1e-9);
});
