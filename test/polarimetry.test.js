import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';

function mk(type, x, y, params = {}) {
  const element = createElement(type, x, y);
  Object.assign(element.params, params);
  return element;
}

const beam = (pol, y = 0, width = 10) =>
  mk('cwlaser', 0, y, { beamMode: 'beam', beamWidth: width, pol });

function readPolarimeter(elements, meter) {
  traceAll(elements);
  return enhancedReading(meter, elements);
}

test('prepared pure states land where the Poincare sphere says they should', () => {
  const cases = [
    ['linear 0', 0, null, { s1: 1, s2: 0, s3: 0 }, /^Linear 0/],
    ['linear 45', 45, null, { s1: 0, s2: 1, s3: 0 }, /^Linear 45/],
    ['linear 90', 90, null, { s1: -1, s2: 0, s3: 0 }, /^Linear 90/],
    ['circular', 0, 45, { s1: 0, s2: 0, s3: -1 }, /circular/i],
  ];
  for (const [name, pol, qwpAxis, expected, label] of cases) {
    const elements = [beam(pol)];
    if (qwpAxis != null) elements.push(mk('qwp', 150, 0, { a: qwpAxis }));
    const meter = mk('polarimeter', 300, 0, { aperture: 40 });
    elements.push(meter);
    const reading = readPolarimeter(elements, meter);
    const n = reading.stokes.normalized;
    for (const key of ['s1', 's2', 's3']) {
      assert.ok(Math.abs(n[key] - expected[key]) < 1e-9, `${name}: ${key} was ${n[key]}`);
    }
    assert.equal(n.degree, 1, `${name} is a pure state, so DoP must be 1`);
    assert.match(reading.polarization, label);
  }
});

// A single ray cannot be unpolarized -- that state only exists as an
// incoherent sum. Two equally strong orthogonal beams are the simplest way
// to build one, and the detector must average them to the sphere's origin.
test('two equally strong orthogonal beams read as genuinely unpolarized', () => {
  const meter = mk('polarimeter', 300, 0, { aperture: 40 });
  const reading = readPolarimeter([beam(0), beam(90), meter], meter);
  assert.ok(Math.abs(reading.stokes.normalized.degree) < 1e-9,
    `expected DoP 0, got ${reading.stokes.normalized.degree}`);
  assert.equal(reading.polarization, 'Unpolarized');
  // Intensity still adds even though the polarization cancels.
  assert.ok(reading.stokes.s0 > 1);
});

// Regression: the Stokes numbers used to come from probing 21 points across
// the sensor face, and probeAt() returns the nearest single beam rather than
// a mixture. Two overlapping counter-polarized beams therefore reported
// whichever pure state a probe happened to land on -- DoP 1.0 for light that
// is unpolarized -- while the label, built from the tracer's own power
// weighting, correctly said "Unpolarized" right next to it.
test('the reported label and the reported numbers cannot disagree', () => {
  const scenes = [
    ['overlapping', [beam(0, 0, 10), beam(90, 0, 10)]],
    ['side by side, unequal widths', [beam(0, -6, 8), beam(90, 6, 1)]],
    ['single beam', [beam(30)]],
    ['circular', [beam(0), mk('qwp', 150, 0, { a: 45 })]],
  ];
  for (const [name, sources] of scenes) {
    const meter = mk('polarimeter', 300, 0, { aperture: 40 });
    const reading = readPolarimeter([...sources, meter], meter);
    const { degree } = reading.stokes.normalized;
    const saysUnpolarized = reading.polarization === 'Unpolarized';
    assert.equal(saysUnpolarized, degree < 0.02,
      `${name}: label "${reading.polarization}" disagrees with DoP ${degree}`);
  }
});

test('S0 is the arriving intensity and s1..s3 are scaled to it', () => {
  const meter = mk('polarimeter', 300, 0, { aperture: 40 });
  const reading = readPolarimeter([beam(0), meter], meter);
  const { stokes } = reading;
  assert.equal(stokes.s0, reading.signal);
  for (const key of ['s1', 's2', 's3']) {
    assert.ok(Math.abs(stokes[key] - stokes.s0 * stokes.normalized[key]) < 1e-12);
  }
});

// The instrument is a shortcut, not a separate physics path: the same Stokes
// vector must be recoverable by actually performing the measurement out of
// ordinary parts, exactly as Schaefer et al. describe it.
function measureIntensity(prepare, analyzerDeg, quarterWaveAxis) {
  const elements = prepare();
  let x = 220;
  if (quarterWaveAxis != null) {
    elements.push(mk('qwp', x, 0, { a: quarterWaveAxis }));
    x += 70;
  }
  elements.push(mk('polarizer', x, 0, { pangle: analyzerDeg }));
  const detector = mk('detector', x + 120, 0, { aperture: 40 });
  elements.push(detector);
  traceAll(elements);
  return detectorReading(detector.id)?.signal ?? 0;
}

// An elliptical state, so all four parameters are non-trivial.
const prepareElliptical = () => [beam(0), mk('qwp', 120, 0, { a: 22.5 })];

function truthStokes() {
  const meter = mk('polarimeter', 400, 0, { aperture: 40 });
  return readPolarimeter([...prepareElliptical(), meter], meter).stokes;
}

test('the classical four-intensity method reproduces the direct readout', () => {
  const truth = truthStokes();
  // Schaefer et al. Eq. (15): a rotated analyzer, plus one measurement with a
  // quarter-wave plate inserted to reach the circular component.
  const i0 = measureIntensity(prepareElliptical, 0);
  const i90 = measureIntensity(prepareElliptical, 90);
  const i45 = measureIntensity(prepareElliptical, 45);
  const i45q = measureIntensity(prepareElliptical, 45, 0);

  const s0 = i0 + i90;
  const s1 = i0 - i90;
  const s2 = 2 * i45 - s0;
  const s3 = s0 - 2 * i45q;

  assert.ok(Math.abs(s0 - truth.s0) < 1e-9, `S0: ${s0} vs ${truth.s0}`);
  assert.ok(Math.abs(s1 - truth.s1) < 1e-9, `S1: ${s1} vs ${truth.s1}`);
  assert.ok(Math.abs(s2 - truth.s2) < 1e-9, `S2: ${s2} vs ${truth.s2}`);
  assert.ok(Math.abs(s3 - truth.s3) < 1e-9, `S3: ${s3} vs ${truth.s3}`);
});

test('the rotating quarter-wave plate method reproduces it too', () => {
  const truth = truthStokes();
  // Schaefer et al. Eq. (17)-(19): rotate the waveplate, keep the analyzer
  // fixed, and pull the Stokes parameters out of the Fourier coefficients.
  // Nyquist on the 4th harmonic needs at least 8 samples; use 16.
  const N = 16, toRad = Math.PI / 180;
  let a = 0, b = 0, c = 0, d = 0;
  for (let n = 0; n < N; n++) {
    const theta = 180 * n / N;
    const intensity = measureIntensity(prepareElliptical, 0, theta);
    a += intensity;
    b += intensity * Math.sin(2 * theta * toRad);
    c += intensity * Math.cos(4 * theta * toRad);
    d += intensity * Math.sin(4 * theta * toRad);
  }
  a = 2 * a / N; b = 4 * b / N; c = 4 * c / N; d = 4 * d / N;

  assert.ok(Math.abs((a - c) - truth.s0) < 1e-9, `S0 = A - C: ${a - c} vs ${truth.s0}`);
  assert.ok(Math.abs(2 * c - truth.s1) < 1e-9, `S1 = 2C: ${2 * c} vs ${truth.s1}`);
  assert.ok(Math.abs(2 * d - truth.s2) < 1e-9, `S2 = 2D: ${2 * d} vs ${truth.s2}`);
  assert.ok(Math.abs(b - truth.s3) < 1e-9, `S3 = B: ${b} vs ${truth.s3}`);
});
