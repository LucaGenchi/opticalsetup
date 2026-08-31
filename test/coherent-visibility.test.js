import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, cameraProfileSVG } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceAll, traceScene, detectorReading } from '../sketch/js/raytrace.js';
import { formatSignal } from '../sketch/js/util.js';
import { readFileSync } from 'node:fs';

const LAMBDA_MM = 532e-6;

function machZehnder() {
  const parsed = parseSketch(readFileSync('Examples/Optics Bench/Mach–Zehnder interferometer.json', 'utf8'));
  return {
    elements: parsed.elements,
    beams: parsed.beams || [],
    delay: parsed.elements.find(el => el.type === 'delayline'),
    cameras: parsed.elements.filter(el => el.type === 'camera'),
  };
}

// The brightest beam envelope drawn into a given port.
function portOpacity(camera, drawables) {
  let peak = 0;
  for (const drawable of drawables) {
    if (drawable.type !== 'poly' || !drawable.pts) continue;
    if (drawable.pts.some(p => Math.hypot(p.x - camera.x, p.y - camera.y) < 45)) {
      peak = Math.max(peak, drawable.opacity || 0);
    }
  }
  return peak;
}

test('a nearly extinguished port is drawn nearly invisibly', () => {
  const { elements, beams, delay, cameras } = machZehnder();
  // 1.5038 wavelengths: the port is almost, but not exactly, cancelled.
  delay.params.delayMm = 0.0008;
  traceAll(elements);
  const faint = detectorReading(cameras[0].id).signal;
  assert.ok(faint > 0 && faint < 1e-3, `expected a faint but non-zero port, got ${faint}`);

  const opacity = portOpacity(cameras[0], traceScene(elements, beams).drawables);
  assert.ok(opacity > 0, 'a real, non-zero port must still be drawn');
  assert.ok(opacity < 0.01,
    `a port carrying ${faint.toExponential(2)} of the light must not be drawn at ${opacity}`);
});

test('the visibility floor is untouched for every beam that was drawable before', () => {
  // MIN_INT (0.02) used to terminate anything weaker, so the floor only ever
  // applied above it. Beams at or above that threshold must be unchanged.
  const { elements, beams, delay, cameras } = machZehnder();
  const cases = [
    [0.0005, 1],   // strong port
    [0.0007, 0],   // ~30%
    [0.000665, 0], // 50/50
  ];
  for (const [delayMm, index] of cases) {
    delay.params.delayMm = delayMm;
    traceAll(elements);
    const signal = detectorReading(cameras[index].id).signal;
    const opacity = portOpacity(cameras[index], traceScene(elements, beams).drawables);
    const expected = 0.28 * Math.max(0.4, signal);
    assert.ok(Math.abs(opacity - expected) < 0.02,
      `signal ${signal.toFixed(4)}: opacity ${opacity} should still be ${expected.toFixed(4)}`);
  }
});

test('an exactly cancelled port is drawn not at all', () => {
  const { elements, beams, delay, cameras } = machZehnder();
  delay.params.delayMm = 0;
  traceAll(elements);
  assert.equal(detectorReading(cameras[1].id).signal, 0);
  const { drawables } = traceScene(elements, beams);
  const near = drawables.filter(d => d.pts
    && d.pts.some(p => Math.hypot(p.x - cameras[1].x, p.y - cameras[1].y) < 45));
  assert.deepEqual(near, [], 'a fully dark port must contribute nothing to the figure');
});

test('a faint reading is printed as a number, not rounded away to 0.00', () => {
  // The panels used a coarser formatter than the detector cards, so a real
  // 1.4e-4 port printed "0.00" beside a beam that was still drawn.
  assert.equal(formatSignal(1.395e-4), '1.4e-4');
  assert.notEqual(formatSignal(1.395e-4), '0.00');
  assert.equal(formatSignal(0), '0');
});

// ---------------- profile height ----------------

const profileFor = (total, options) => cameraProfileSVG(
  { profile: [0, total * 0.5, total, total * 0.5, 0], signal: total, color: '#22c55e' },
  { x: 0, width: 100, baseline: 20, height: 16, ...options },
);
const peakHeight = svg => {
  const ys = [...svg.matchAll(/L (-?[\d.]+),(-?[\d.]+)/g)].map(m => Number(m[2]));
  return 20 - Math.min(...ys);
};

test('absolute profile height tracks the reading', () => {
  assert.ok(Math.abs(peakHeight(profileFor(1, { scale: 'absolute' })) - 16) < 1e-6);
  assert.ok(Math.abs(peakHeight(profileFor(0.5, { scale: 'absolute' })) - 8) < 1e-6);
  assert.ok(Math.abs(peakHeight(profileFor(0.1, { scale: 'absolute' })) - 1.6) < 1e-6);
});

test('auto-fit keeps every profile full height whatever its magnitude', () => {
  for (const total of [1, 0.5, 0.1, 0.01]) {
    assert.ok(Math.abs(peakHeight(profileFor(total, { scale: 'fit' })) - 16) < 1e-6,
      `auto-fit must fill the box at total ${total}`);
  }
});

test('the camera carries its own profile-height setting into the reading', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'beam';
  laser.params.beamWidth = 12;
  const camera = createElement('camera', 300, 0);
  assert.equal(camera.params.profileScale, 'absolute', 'absolute is the default');

  traceAll([laser, camera]);
  assert.equal(detectorReading(camera.id).profileScale, 'absolute');

  camera.params.profileScale = 'fit';
  traceAll([laser, camera]);
  assert.equal(detectorReading(camera.id).profileScale, 'fit');
});

test('a reading with no signal field falls back to auto-fit rather than collapsing', () => {
  // Absolute needs a total to scale against; without one, flattening the
  // curve onto the axis would look like a dark port that is not dark.
  const svg = cameraProfileSVG({ profile: [0, 1, 0], color: '#22c55e' },
    { x: 0, width: 100, baseline: 20, height: 16, scale: 'absolute' });
  assert.match(svg, /data-camera-profile-scale="fit"/);
  assert.ok(peakHeight(svg) > 15);
});
