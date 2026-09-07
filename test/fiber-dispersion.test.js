import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';
import { pulseEnvelopeAtOpticalPath } from '../sketch/js/pulses.js';
import { parseSketch } from '../sketch/js/state.js';
import { fiberPropagation, normalizeFiberDispersion } from '../sketch/js/fiber.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} ≠ ${expected}`);
const fiber = (overrides = {}) => ({
  id: 'fiber', kind: 'fiber', pts: [{ x: 100, y: 0 }, { x: 200, y: 0 }],
  propagate: true, groupIndex: 1.5, lossDbPerM: 0, lengthM: 1, beta2Ps2PerKm: 36,
  ...overrides,
});
function run(cable, extra = [], reverse = false, sourceParams = {}) {
  const laser = createElement('pulsedlaser', reverse ? 300 : 0, 0);
  laser.rot = reverse ? 180 : 0;
  Object.assign(laser.params, { wavelength: 800, pulseWidthFs: 100, transformLimited: true, pulseShape: 'gauss', ...sourceParams });
  const detector = createElement('detector', reverse ? 0 : 300, 0);
  detector.rot = reverse ? 180 : 0;
  const scene = traceScene([laser, ...extra, detector], [cable]);
  return { scene, reading: detectorReading(detector.id) };
}

test('both fiber types add signed dispersion in either coupling direction', () => {
  for (const bare of [false, true]) for (const reverse of [false, true]) {
    const { scene, reading } = run(fiber({ bare }), [], reverse);
    close(reading.pulse.gddFs2, 36000);
    // Analytic Gaussian intensity-FWHM result for 100 fs and 36000 fs².
    close(reading.pulse.stretchedPulseWidthFs, 1003.1287901664384);
    const output = scene.pulseTracks.find(track => track.opls[0] > 1000);
    assert.ok(output);
    close(pulseEnvelopeAtOpticalPath(output, output.opls[0]).pulseWidthFs, 1003.1287901664384);
  }
  close(run(fiber({ beta2Ps2PerKm: -36 })).reading.pulse.gddFs2, -36000);
  close(run(fiber({ beta2Ps2PerKm: -36 })).reading.pulse.stretchedPulseWidthFs, 1003.1287901664384);
});

test('fiber GDD adds to upstream dispersion and an opposite compensator recompresses', () => {
  for (const x of [75, 240]) {
    const compressor = createElement('pulsecompressor', x, 0);
    compressor.params.gddFs2 = -36000;
    const { reading } = run(fiber(), [compressor]);
    close(reading.pulse.gddFs2, 0);
    close(reading.pulse.stretchedPulseWidthFs, 100);
  }
});

test('physical length scales dispersion, delay and loss together without moving endpoints', () => {
  const short = run(fiber({ lengthM: 1, lossDbPerM: 3 }));
  const long = run(fiber({ lengthM: 2, lossDbPerM: 3 }));
  close(long.reading.pulse.gddFs2, 72000);
  close(long.reading.pulse.earliestPathDelayNs - short.reading.pulse.earliestPathDelayNs, 1500 / 299.792458);
  const output = result => result.scene.pulseTracks.find(track => track.opls[0] > 1000);
  close(output(long).intensity / output(short).intensity, 10 ** (-3 / 10));
  assert.deepEqual(output(long).pts[0], output(short).pts[0]);
});

test('zero and missing settings preserve legacy fiber behavior; unsupported pulse shapes stay explicit', () => {
  const legacy = fiber();
  delete legacy.lengthM;
  delete legacy.beta2Ps2PerKm;
  assert.deepEqual(fiberPropagation(legacy, 100), { lengthMm: 100, gddFs2: 0 });
  close(run(legacy).reading.pulse.stretchedPulseWidthFs, 100);
  close(run(fiber({ beta2Ps2PerKm: 0 })).reading.pulse.stretchedPulseWidthFs, 100);
  close(run(fiber({ lengthM: 0 })).reading.pulse.gddFs2, 3600);
  assert.equal(run(fiber(), [], false, { transformLimited: false }).reading.pulse.stretchedPulseWidthFs, null);
  assert.equal(run(fiber(), [], false, { pulseShape: 'sech2' }).reading.pulse.stretchedPulseWidthFs, null);
  assert.equal(run(fiber(), [], false, { temporalMode: 'cw' }).reading.pulse, null);
});

test('dispersion survives save/load and rejects non-finite or excessive inputs', () => {
  const parse = b => parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [], beams: [b] }), registry).beams[0];
  const restored = parse(fiber({ bare: true, lengthM: 2.5, beta2Ps2PerKm: -21.7 }));
  assert.equal(restored.lengthM, 2.5);
  assert.equal(restored.beta2Ps2PerKm, -21.7);
  assert.equal(restored.bare, true);
  close(run(restored).reading.pulse.gddFs2, -54250);
  assert.deepEqual(normalizeFiberDispersion({ lengthM: Infinity, beta2Ps2PerKm: NaN }), { lengthM: 0, beta2Ps2PerKm: 0 });
  assert.deepEqual(normalizeFiberDispersion({ lengthM: -10, beta2Ps2PerKm: -1e30 }), { lengthM: 0, beta2Ps2PerKm: -10000 });
  const bounded = parse(fiber({ lengthM: 1e30, beta2Ps2PerKm: 1e30 }));
  assert.equal(bounded.lengthM, 10000);
  assert.equal(bounded.beta2Ps2PerKm, 10000);
  const { scene } = run(bounded);
  assert.ok(scene.pulseTracks.every(track => track.opls.every(Number.isFinite)));
});
