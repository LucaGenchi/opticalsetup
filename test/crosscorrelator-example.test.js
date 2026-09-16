import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import '../sketch/js/detector-instruments.js';   // registers the spectrometer
import { registry } from '../sketch/js/elements.js';
import { detectorReading, mixReading, probeAt, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import {
  crossCorrelatorScene, DELAY_MM, FOCAL_MM, FOLD_DROP_MM, IR_NM, IR_SHG_NM, PULSE_FS,
  RED_NM, RED_SHG_NM, REP_RATE_MHZ, SUM_NM, XCORR_NAME, XCORR_PATH,
} from '../tools/build-crosscorrelator-example.mjs';

const raw = readFileSync(new URL(`../Examples/Ultrashort Pulses/${XCORR_NAME}.json`, import.meta.url), 'utf8');

function traced(detuneMm = 0) {
  const scene = parseSketch(raw, registry);
  if (detuneMm) scene.elements.find(el => el.id === 'delay').params.delayMm += detuneMm;
  traceScene(scene.elements);
  return { scene, reading: mixReading('crystal'), detector: detectorReading('spectrometer') };
}

// What a spectrometer behind the crystal would show, rounded to whole nm.
const linesBelow = (detector, limit = 700) => [...new Set((detector?.spectrum || [])
  .map(s => Math.round(s.wavelength)))].filter(w => w < limit).sort((a, b) => a - b);
const near = (lines, wl, span = 6) => lines.some(w => Math.abs(w - wl) <= span);

test('the committed time-zero example is exactly what its generator writes', () => {
  assert.deepEqual(JSON.parse(raw), crossCorrelatorScene());
});

test('two locked lasers meet in one crystal, one focal length behind the lens', () => {
  const { scene, reading } = traced();
  const at = id => scene.elements.find(el => el.id === id);
  for (const [id, wl] of [['ir-laser', IR_NM], ['red-laser', RED_NM]]) {
    assert.equal(at(id).params.wavelength, wl);
    assert.equal(at(id).params.pulseWidthFs, PULSE_FS);
    assert.equal(at(id).params.repRateMHz, REP_RATE_MHZ, 'the two trains must share a repetition rate');
  }
  assert.equal(at('crystal').x - at('focus').x, FOCAL_MM, 'the crystal is not at the lens focus');
  assert.equal(at('crystal').params.convert, 'shg');
  assert.equal(at('crystal').params.mixDfg, false, 'DFG should be off in this example');
  // The folded arm's extra leg is what the delay line makes up.
  assert.equal(XCORR_PATH.combiner.y - XCORR_PATH.fold.y, FOLD_DROP_MM);
  assert.equal(at('delay').params.delayMm, DELAY_MM);
  assert.equal(reading.skewNs, 0, 'the example does not open at time zero');
  assert.equal(reading.overlap, 1);
});

test('at time zero the spectrometer shows three peaks; off it, only the two harmonics', () => {
  const together = linesBelow(traced().detector);
  assert.ok(near(together, RED_SHG_NM), `${RED_SHG_NM} nm harmonic missing: ${together}`);
  assert.ok(near(together, IR_SHG_NM), `${IR_SHG_NM} nm harmonic missing: ${together}`);
  assert.ok(near(together, SUM_NM, 1), `sum frequency missing: ${together}`);

  // Far from zero the pair stops mixing, and nothing else moves.
  const apart = linesBelow(traced(0.2).detector);
  assert.ok(near(apart, RED_SHG_NM), 'a second harmonic vanished with the delay');
  assert.ok(near(apart, IR_SHG_NM), 'a second harmonic vanished with the delay');
  assert.ok(!near(apart, SUM_NM, 1), 'the sum frequency survived a 667 fs mismatch');
  assert.equal(traced(0.2).reading.state, 'unsynchronized');

  // The two harmonics are not just present but unchanged.
  const power = (detector, wl, span) => (detector.spectrum || [])
    .filter(s => Math.abs(s.wavelength - wl) <= span)
    .reduce((total, s) => total + s.power, 0);
  for (const wl of [RED_SHG_NM, IR_SHG_NM]) {
    const atZero = power(traced().detector, wl, 8);
    const offZero = power(traced(0.2).detector, wl, 8);
    assert.ok(Math.abs(atZero - offZero) < 1e-9, `the ${wl} nm harmonic moved with the delay`);
  }
});

test('the sum-frequency line follows the Gaussian overlap as the delay is scanned', () => {
  // 0.06 mm of path is 200 fs, which leaves a quarter of two 200 fs pulses.
  const { reading, detector } = traced(0.06);
  assert.ok(Math.abs(reading.overlap - 0.25) < 1e-3, `overlap ${reading.overlap}`);
  assert.ok(near(linesBelow(detector), SUM_NM, 1), 'the line vanished 200 fs from zero');
  // Symmetric in sign: only the size of the mismatch matters.
  assert.ok(Math.abs(traced(-0.06).reading.overlap - reading.overlap) < 1e-9);
});

test('the probes read the two beams that go in', () => {
  const { scene } = traced();
  const probe = id => {
    const el = scene.elements.find(e => e.id === id);
    return probeAt(el.x, el.y);
  };
  assert.ok(Math.abs(probe('ir-wavelength').wl - IR_NM) < 0.5);
  assert.ok(Math.abs(probe('red-wavelength').wl - RED_NM) < 0.5);
});
