import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { registry } from '../sketch/js/elements.js';
import { detectorReading, opoReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { idlerWavelength } from '../sketch/js/parametric.js';
import {
  CAVITY_LENGTH_MM, FOLDED_OPO_NAME, FOLDED_OPO_PATH, REP_RATE_MHZ, SYNC_OPO_NAME, SYNC_OPO_PATH,
  foldedOpoScene, syncOpoScene,
} from '../tools/build-opo-example.mjs';

const read = name => readFileSync(new URL(`../Examples/Nonlinear Optics/${name}.json`, import.meta.url), 'utf8');
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);
const IDLER = idlerWavelength(532, 800);
const SIGNAL_SHARE = IDLER / (800 + IDLER);

function traced(name) {
  const scene = parseSketch(read(name), registry);
  traceScene(scene.elements);
  return {
    scene,
    idler: detectorReading('idler-detector'),
    signal: detectorReading('signal-detector'),
    pumpDump: scene.elements.find(el => el.id === 'pump-dump'),
  };
}

// Angle of incidence at a fold, from the directions of the legs either side.
function incidence(from, at, to) {
  const a = { x: at.x - from.x, y: at.y - from.y }, b = { x: to.x - at.x, y: to.y - at.y };
  const cos = (a.x * b.x + a.y * b.y) / (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y));
  const turn = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
  return (180 - turn) / 2;
}

test('the committed OPO examples are exactly what their generator writes', () => {
  assert.deepEqual(JSON.parse(read(SYNC_OPO_NAME)), syncOpoScene());
  assert.deepEqual(JSON.parse(read(FOLDED_OPO_NAME)), foldedOpoScene());
});

test('every cavity fold is near normal incidence, never glancing', () => {
  const { M3, F1, M1, M2, M4 } = SYNC_OPO_PATH;
  // The crystal axis runs M1 → M2 along +x.
  near(incidence(F1, M1, M2), 12, 1e-6, 'M1');
  near(incidence(M1, M2, M4), 12, 1e-6, 'M2');
  near(incidence(M1, F1, M3), 12, 1e-6, 'F1');
  const v = FOLDED_OPO_PATH;
  near(incidence(v.M1, v.M2, v.M3), 15, 1e-6, 'folded M2');
});

test('the synchronously pumped cavity round trip equals the pump period', () => {
  const { M3, F1, M1, M2, M4 } = SYNC_OPO_PATH;
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const oneWay = d(M3, F1) + d(F1, M1) + d(M1, M2) + d(M2, M4);
  near(oneWay, CAVITY_LENGTH_MM, 1e-6, 'one-way cavity path (mm)');
  near(2 * oneWay / 299.792458, 1e3 / REP_RATE_MHZ, 1e-9, 'round-trip time (ns) vs pump period');
  const { scene } = traced(SYNC_OPO_NAME);
  const at = id => scene.elements.find(el => el.id === id);
  for (const [id, p] of Object.entries(SYNC_OPO_PATH)) {
    near(at(id).x, p.x, 1e-3, `${id}.x`);
    near(at(id).y, p.y, 1e-3, `${id}.y`);
  }
  assert.equal(at('pump').params.repRateMHz, REP_RATE_MHZ);
});

for (const [name, efficiency, oc] of [[SYNC_OPO_NAME, 0.375, 0.9], [FOLDED_OPO_NAME, 0.3, 0.7]]) {
  test(`${name}: only the signal resonates; the idler leaves in one pass`, () => {
    const { idler, signal } = traced(name);
    assert.equal(opoReading('crystal').state, 'converting');

    assert.ok(idler, 'no idler reached its detector');
    near(idler.wavelength, IDLER, 1, 'idler centre');
    near(idler.signal, efficiency * (1 - SIGNAL_SHARE), 1e-3, 'idler takes its whole generated share in one pass');
    assert.ok(!idler.spectrum.some(s => s.wavelength < 1000), 'pump or signal leaked into the idler port');

    assert.ok(signal, 'no signal left the output coupler');
    near(signal.wavelength, 800, 0.5, 'signal centre');
    assert.ok(signal.spectrum.every(s => s.wavelength > 700 && s.wavelength < 900), 'pump or idler reached the signal port');
    // Each round trip leaks (1 − R) of the circulating signal; the trace sums a
    // finite number of leaks, so the output is below the generated share.
    const generated = efficiency * SIGNAL_SHARE;
    assert.ok(signal.signal > (1 - oc) * generated && signal.signal < generated, `signal output ${signal.signal}`);
  });
}

test('the picosecond signal carries the authored datasheet-range width and duration', () => {
  const { signal } = traced(SYNC_OPO_NAME);
  near(signal.bandMax - signal.bandMin, 0.30, 0.01, 'signal FWHM (nm)');
  near(signal.pulse.pulseWidthFs, 5000, 1, 'signal duration (fs)');
});
