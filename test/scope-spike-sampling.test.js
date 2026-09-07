import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import { scopeTrace } from '../sketch/js/pulses.js';

// A photodiode impulse is routinely narrower than one sample of the scope
// plot. Sampled on a uniform grid alone, each sample lands at a different
// point on each spike and the drawn heights beat against the pulse spacing:
// an 80 MHz train through a 5 MHz square gate, read by a 1 ns detector, drew
// peaks running 1.00, 0.87, 0.56, 0.28, 0.10, 0.28, 0.56, 0.87, 1.00 -- a
// second, faster modulation that is not in the signal at all.
function bench({ modShape = 'square', riseTimeNs = 1, modFreqMHz = 5, repRateMHz = 80 } = {}) {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'line', repRateMHz });
  const aom = createElement('aom', 200, 0);
  Object.assign(aom.params, {
    modulate: true, modShape, modFreqMHz, chopDuty: 0.5, modDepth: 1, eff: 1, deflect: 0, zero: false,
  });
  const detector = createElement('detector', 400, 0);
  Object.assign(detector.params, { riseTimeNs });
  const screen = createElement('display', 520, 0);
  Object.assign(screen.params, { sensorId: detector.id, screenOn: true });
  const scene = [laser, aom, detector, screen];
  traceAll(scene, []);
  const svg = registry.display.svg(screen, scene);
  const match = /data-scope-trace="\d+" points="([^"]+)"/.exec(svg);
  assert.ok(match, 'the scope should draw a trace');
  // baseline 6, full height 17 in the card's own units.
  const values = match[1].split(' ').map(p => (6 - Number(p.split(',')[1])) / 17);
  const peaks = [];
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] > values[i - 1] && values[i] >= values[i + 1] && values[i] > 0.02) peaks.push(values[i]);
  }
  return { peaks, trueAmplitudes: scopeTrace(detectorReading(detector.id).pulse, {}).pulses.map(p => p.amplitude) };
}

test('a square gate draws every pulse it passes at the same height', () => {
  const { peaks } = bench({ modShape: 'square' });
  assert.ok(peaks.length >= 8, `expected a resolved train, got ${peaks.length} spikes`);
  const min = Math.min(...peaks), max = Math.max(...peaks);
  // Every pulse the gate passes has amplitude exactly 1, so every drawn spike
  // must reach the same height. Before the fix this spread from 0.10 to 1.00.
  assert.ok((max - min) / max < 0.02,
    `drawn spike heights ripple by ${(100 * (max - min) / max).toFixed(1)}%: ${peaks.map(v => v.toFixed(2)).join(' ')}`);
});

// The continuous gates genuinely vary pulse to pulse, so the test is not that
// the heights are equal but that they follow the gate rather than a beat.
test('the continuous gates draw the amplitudes the gate actually produces', () => {
  for (const modShape of ['sine', 'sawtooth']) {
    const { peaks, trueAmplitudes } = bench({ modShape });
    const trueMax = Math.max(...trueAmplitudes);
    // Every drawn spike must correspond to some pulse the gate really passed
    // at that height; a beat would put spikes at heights the gate never made.
    for (const drawn of peaks) {
      const nearest = Math.min(...trueAmplitudes.map(a => Math.abs(a / trueMax - drawn)));
      assert.ok(nearest < 0.05,
        `${modShape}: drew a spike at ${drawn.toFixed(2)} that the gate never produced`);
    }
    // ...and the full swing of the gate must be visible, not flattened.
    assert.ok(Math.max(...peaks) > 0.9 && Math.min(...peaks) < 0.2,
      `${modShape}: drawn range ${Math.min(...peaks).toFixed(2)}..${Math.max(...peaks).toFixed(2)}`);
  }
});

test('an unmodulated train is still drawn flat', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'line', repRateMHz: 80 });
  const detector = createElement('detector', 300, 0);
  Object.assign(detector.params, { riseTimeNs: 1 });
  const screen = createElement('display', 420, 0);
  Object.assign(screen.params, { sensorId: detector.id, screenOn: true });
  const scene = [laser, detector, screen];
  traceAll(scene, []);
  const svg = registry.display.svg(screen, scene);
  const values = /data-scope-trace="\d+" points="([^"]+)"/.exec(svg)[1].split(' ')
    .map(p => (6 - Number(p.split(',')[1])) / 17);
  const peaks = [];
  for (let i = 1; i < values.length - 1; i++) {
    if (values[i] > values[i - 1] && values[i] >= values[i + 1] && values[i] > 0.02) peaks.push(values[i]);
  }
  const min = Math.min(...peaks), max = Math.max(...peaks);
  assert.ok((max - min) / max < 0.02,
    `an ungated train must draw flat, got ${peaks.map(v => v.toFixed(2)).join(' ')}`);
});

// A detector too slow to follow the train must still merge it into a level
// rather than being handed per-pulse sample points that re-resolve it.
test('a slow detector still integrates the train into a level', () => {
  const { peaks } = bench({ riseTimeNs: 40 });
  const spread = peaks.length ? Math.max(...peaks) - Math.min(...peaks) : 0;
  assert.ok(peaks.length <= 4 && spread < 0.35,
    `a 40 ns detector should not resolve an 80 MHz train: ${peaks.length} spikes, spread ${spread.toFixed(2)}`);
});
