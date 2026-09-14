import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { registry } from '../sketch/js/elements.js';
import { detectorReading, opoReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { idlerWavelength, nmToWavenumberWidth } from '../sketch/js/parametric.js';
import { CAVITY_LENGTH_MM, REP_RATE_MHZ, opoExampleScene } from '../tools/build-opo-example.mjs';

const exampleText = readFileSync(new URL('../Examples/Nonlinear Optics/Synchronously pumped femtosecond OPO.json', import.meta.url), 'utf8');
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);

function traced() {
  const scene = parseSketch(exampleText, registry);
  traceScene(scene.elements);
  const byId = Object.fromEntries(scene.elements.map(el => [el.id, el]));
  return { byId, idler: detectorReading('idler-detector'), signal: detectorReading('signal-detector') };
}

test('the committed OPO example is exactly what its generator writes', () => {
  assert.deepEqual(JSON.parse(exampleText), opoExampleScene());
});

test('the cavity round trip equals the pump period', () => {
  const { byId } = traced();
  const at = id => byId[id];
  const d = (a, b) => Math.hypot(at(a).x - at(b).x, at(a).y - at(b).y);
  const oneWay = d('M3', 'M1') + d('M1', 'M2') + d('M2', 'M5') + d('M5', 'M4');
  near(oneWay, CAVITY_LENGTH_MM, 1e-3, 'one-way cavity length (mm)');
  near(2 * oneWay / 299.792458, 1e3 / REP_RATE_MHZ, 1e-5, 'round-trip time (ns) vs pump period');
  assert.equal(at('pump').params.repRateMHz, REP_RATE_MHZ);
});

test('only the signal resonates: the idler leaves through M2 in one pass, the signal through the output coupler', () => {
  const { idler, signal } = traced();
  const idlerWl = idlerWavelength(1040, 1480);
  const signalShare = idlerWl / (1480 + idlerWl);

  assert.ok(idler, 'no idler reached its detector');
  near(idler.wavelength, idlerWl, 3, 'idler centre');
  near(idler.signal, 0.78 * (1 - signalShare), 1e-3, 'idler takes its whole generated share in one pass');
  const idlerWidthCm = nmToWavenumberWidth(idler.wavelength, idler.bandMax - idler.bandMin);
  near(idlerWidthCm, 131, 3, 'idler linewidth (cm⁻¹)');
  assert.ok(!idler.spectrum.some(s => s.wavelength < 2500), 'pump or signal leaked into the idler port');

  assert.ok(signal, 'no signal left the output coupler');
  near(signal.wavelength, 1480, 1, 'signal centre');
  assert.ok(!signal.spectrum.some(s => s.wavelength < 1300 || s.wavelength > 2500), 'pump or idler reached the signal port');
  // Every round trip leaks 5 % of the circulating signal; the trace follows a
  // handful of them, so the output is a transient below the generated share.
  assert.ok(signal.signal > 0.05 && signal.signal < 0.78 * signalShare, `signal output ${signal.signal}`);
  assert.equal(opoReading('crystal').state, 'converting');
});

test('the output coupler sets how much signal leaves per round trip', () => {
  const scene = parseSketch(exampleText, registry);
  const run = refl => {
    scene.elements.find(el => el.id === 'M4').params.refl = refl;
    traceScene(scene.elements);
    return detectorReading('signal-detector').signal;
  };
  assert.ok(run(80) > run(95), 'a 20 % output coupler should extract more of the traced signal than a 5 % one');
});
