import test from 'node:test';
import assert from 'node:assert/strict';

import { mixStateText, registry } from '../sketch/js/elements.js';
import { mixOverlap, mixDurationFs, mixWavelength } from '../sketch/js/parametric.js';
import { detectorReading, mixReading, traceScene } from '../sketch/js/raytrace.js';

const defaults = type => Object.fromEntries((registry[type].params || []).map(p => [p.key, p.def]));
const el = (type, id, x, y, params = {}) => ({ type, id, x, y, rot: 0, params: { ...defaults(type), ...params } });

// Two pulsed beams, well clear of each other's bodies, crossing one crystal.
// `dx` moves the second laser along its own beam, which is exactly what a
// delay stage does: 1 mm of extra path is 3.34 ps of delay.
function bench({ dx = 0, convert = 'sfg', repB = 80, widthFs = 200, cw = false, efficiency = 0.4 } = {}) {
  const second = cw
    ? el('cwlaser', 'b', dx, 25, { wavelength: 800, power: 1, dia: 2 })
    : el('pulsedlaser', 'b', dx, 25, { wavelength: 800, pulseWidthFs: widthFs, repRateMHz: repB, power: 1, dia: 2 });
  const elements = [
    el('pulsedlaser', 'a', 0, -25, { wavelength: 1030, pulseWidthFs: widthFs, repRateMHz: 80, power: 1, dia: 2 }),
    second,
    el('crystal', 'c', 300, 0, { convert, efficiency, aperture: 80 }),
    el('detector', 'd', 600, 0, { aperture: 120 }),
  ];
  traceScene(elements);
  return { reading: mixReading('c'), detector: detectorReading('d') };
}

const sawWavelength = (detector, wl, tolerance = 1) =>
  (detector?.spectrum || []).some(s => Math.abs(s.wavelength - wl) <= tolerance);

test('sum and difference frequency follow photon energy conservation', () => {
  // 1/λ3 = 1/λ1 + 1/λ2 and 1/λ1 − 1/λ2.
  assert.ok(Math.abs(mixWavelength('sfg', 800, 1030) - 450.2732) < 1e-3);
  assert.ok(Math.abs(mixWavelength('dfg', 800, 1030) - 3582.6087) < 1e-3);
  // The order of the two inputs cannot matter.
  assert.equal(mixWavelength('sfg', 1030, 800), mixWavelength('sfg', 800, 1030));
  assert.equal(mixWavelength('dfg', 1030, 800), mixWavelength('dfg', 800, 1030));
  // Difference frequency of one colour with itself has no positive solution.
  assert.equal(mixWavelength('dfg', 800, 800), null);
  assert.equal(mixWavelength('shg', 800, 1030), null);
});

test('the mixed pulse is shorter than either input, and follows the shorter one', () => {
  assert.ok(Math.abs(mixDurationFs(200, 200) - 200 / Math.SQRT2) < 1e-9);
  assert.ok(Math.abs(mixDurationFs(2000, 100) - 99.875) < 1e-3);
  assert.equal(mixDurationFs(0, 150), 150);
});

test('two synchronized beams mix, and their sum frequency reaches the detector', () => {
  const { reading, detector } = bench();
  assert.equal(reading.state, 'mixing');
  assert.ok(Math.abs(reading.wl - 450.2732) < 1e-3, `output ${reading.wl}`);
  assert.equal(reading.skewNs, 0);
  assert.equal(reading.overlap, 1);
  assert.ok(sawWavelength(detector, 450.27), 'no sum-frequency light at the detector');
  // The drawn signal is the authored fraction of the driving beam, and it is
  // attributed to that beam rather than to the crystal.
  const line = (detector.spectrum || []).find(s => Math.abs(s.wavelength - 450.27) <= 1);
  assert.ok(Math.abs(line.power - 0.4) < 1e-9, `sum-frequency power ${line.power}`);
});

test('one beam alone produces nothing, whatever its power', () => {
  const elements = [
    el('pulsedlaser', 'a', 0, 0, { wavelength: 1030, pulseWidthFs: 200, repRateMHz: 80, power: 5 }),
    el('crystal', 'c', 300, 0, { convert: 'sfg', efficiency: 0.9, aperture: 40 }),
    el('detector', 'd', 600, 0, { aperture: 60 }),
  ];
  traceScene(elements);
  assert.equal(mixReading('c').state, 'oneBeam');
  assert.ok(!sawWavelength(detectorReading('d'), 515), 'a single beam produced a harmonic in a mixing mode');
});

test('the signal disappears when the two pulses stop arriving together', () => {
  // 30 mm of extra path is 100 ps, far outside a 200 fs pulse.
  const { reading, detector } = bench({ dx: -30 });
  assert.equal(reading.state, 'unsynchronized');
  assert.equal(reading.reason, 'skew');
  assert.ok(Math.abs(reading.skewNs - 30 / 299.792458) < 1e-9, `skew ${reading.skewNs}`);
  assert.ok(!sawWavelength(detector, 450.27), 'signal survived a 100 ps mismatch');
  assert.match(mixStateText(reading), /No signal: the pulses arrive 100 ps apart/);
});

test('the overlap traces a cross-correlation as the delay is scanned', () => {
  // Scanning the stage through zero is how time zero is found on a bench:
  // the signal peaks at zero delay and falls away either side of it.
  const overlaps = [-0.06, -0.02, 0, 0.02, 0.06].map(dx => bench({ dx }).reading.overlap);
  assert.equal(overlaps[2], 1, 'the peak is not at zero delay');
  assert.ok(overlaps[1] > overlaps[0] && overlaps[1] < 1, 'not rising towards zero delay');
  assert.ok(overlaps[3] > overlaps[4] && overlaps[3] < 1, 'not falling after zero delay');
  // Symmetric about zero, since only the size of the mismatch matters.
  assert.ok(Math.abs(overlaps[1] - overlaps[3]) < 1e-9);
  assert.ok(Math.abs(overlaps[0] - overlaps[4]) < 1e-9);
});

test('a longer pulse pair tolerates a delay that kills a shorter one', () => {
  const short = bench({ dx: -0.2, widthFs: 200 });
  const long = bench({ dx: -0.2, widthFs: 5000 });
  assert.equal(short.reading.state, 'unsynchronized');
  assert.equal(long.reading.state, 'mixing');
  assert.ok(long.reading.overlap > 0.9, `overlap ${long.reading.overlap}`);
});

test('unrelated repetition rates never coincide; harmonic ones do', () => {
  const odd = bench({ repB: 37 });
  assert.equal(odd.reading.state, 'unsynchronized');
  assert.equal(odd.reading.reason, 'repRate');
  assert.equal(odd.reading.overlap, 0);
  assert.match(mixStateText(odd.reading), /same repetition rate, or one an exact multiple/);
  // An 80 MHz beam and a 40 MHz one derived from it meet on every second
  // pulse, which is a real way to run a two-colour experiment.
  const harmonic = bench({ repB: 40 });
  assert.equal(harmonic.reading.state, 'mixing');
  assert.equal(harmonic.reading.overlap, 1);
});

test('a CW partner is always present, so it needs no timing', () => {
  const { reading } = bench({ cw: true });
  assert.equal(reading.state, 'mixing');
  assert.equal(reading.overlap, 1);
  assert.equal(reading.skewNs, null);
  assert.match(mixStateText(reading), /no pulse timing to match/);
  assert.equal(mixOverlap({ opl: 0, pulse: null }, { opl: 0, pulse: { repRateMHz: 80 } }).comparable, false);
});

test('difference frequency generates the long wavelength, past either input', () => {
  const { reading, detector } = bench({ convert: 'dfg' });
  assert.equal(reading.state, 'mixing');
  assert.ok(reading.wl > 1030, `difference frequency ${reading.wl} is not the longest wave`);
  assert.ok(sawWavelength(detector, 3582.6, 2), 'no difference-frequency light at the detector');
});

test('mixed light is not fed back into the same crystal', () => {
  const { detector } = bench();
  // 450 nm mixing with 800 nm would appear at 288 nm if the crystal converted
  // its own output again.
  assert.ok(!sawWavelength(detector, 288.4, 2), 'the crystal mixed its own output');
});
