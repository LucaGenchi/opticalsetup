import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from '../sketch/js/elements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { flatSpectrum, gaussianSpectrum, lineSpectrum, scaleSpectrum } from '../sketch/js/spectrum.js';

// A converted ray used to inherit its pump's bandwidth and spectrum, because
// only its wavelength was set. Dichroics and detectors act on the spectrum, so
// frequency-doubling any pulsed source changed nothing downstream: the whole
// beam still read as the pump, and no harmonic light ever appeared. These
// scenes are the ones that exposed it -- CW light never carried a spectrum,
// which is why the CW version of the same demo always looked right.

// A Gaussian (pulsed) spectrum crossing a dichroic already loses about 2e-5 of
// its power to spectral-tail truncation on main, conversion or not, so pulsed
// readings are compared to 1e-4. CW light carries no spectrum and stays exact.
const PULSED = 1e-4;
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);

function crystalScene({ source = 'pulsedlaser', sourceParams = {}, crystal = {}, dichroic = true } = {}) {
  const laser = createElement(source, 60, 160);
  Object.assign(laser.params, { wavelength: 1064, ...sourceParams });
  const xtal = createElement('crystal', 220, 160);
  Object.assign(xtal.params, { convert: 'shg', efficiency: 0.4, transmitPump: true, ...crystal });
  const elements = [laser, xtal];
  if (dichroic) {
    const split = createElement('dichroic', 350, 160);
    split.rot = 135;
    split.params.cutoff = 700;
    const pumpSide = createElement('detector', 520, 160);
    const harmonicSide = createElement('detector', 350, 350);
    harmonicSide.rot = 90;
    elements.push(split, pumpSide, harmonicSide);
    traceScene(elements);
    return { pump: detectorReading(pumpSide.id), harmonic: detectorReading(harmonicSide.id), laser };
  }
  const after = createElement('detector', 400, 160);
  elements.push(after);
  traceScene(elements);
  return { all: detectorReading(after.id), laser };
}

test('SHG of a pulsed source reaches the harmonic port of a dichroic', () => {
  const { pump, harmonic } = crystalScene();
  assert.ok(harmonic, 'the 532 nm port stayed dark: the harmonic kept the pump spectrum');
  near(harmonic.wavelength, 532, 1e-6, 'harmonic centre');
  near(harmonic.signal, 0.4, PULSED, 'converted share');
  near(pump.wavelength, 1064, 1e-6, 'pump centre');
  near(pump.signal, 0.6, PULSED, 'residual pump share');
});

test('the harmonic band is the pump band scaled by the harmonic order', () => {
  const { pump, harmonic } = crystalScene();
  near(harmonic.bandMin, pump.bandMin / 2, 1e-6, 'harmonic band low edge');
  near(harmonic.bandMax, pump.bandMax / 2, 1e-6, 'harmonic band high edge');
  assert.ok(harmonic.bandMax - harmonic.bandMin > 0, 'the converted light should keep a bandwidth, not collapse to a line');

  const third = crystalScene({ crystal: { convert: 'thg' }, dichroic: false }).all;
  const tripled = (third.spectrum || []).filter(s => s.wavelength < 700);
  assert.ok(tripled.length, 'no third-harmonic light in the spectrum');
  const lo = Math.min(...tripled.map(s => s.wavelength)), hi = Math.max(...tripled.map(s => s.wavelength));
  near((lo + hi) / 2, 1064 / 3, 0.5, 'third-harmonic centre');
});

test('even a nearly monochromatic pulse converts', () => {
  // A 0.01 nm pulse failed too: the source attaches a spectrum object however
  // narrow it is, and that object is what was being inherited.
  const { harmonic } = crystalScene({ sourceParams: { transformLimited: false, bandwidth: 0.01 } });
  assert.ok(harmonic, 'narrowband pulsed SHG stayed dark');
  near(harmonic.signal, 0.4, PULSED, 'converted share');
});

test('custom output is one fixed line whatever the pump bandwidth', () => {
  const { all } = crystalScene({ crystal: { convert: 'custom', outWl: 800 }, dichroic: false });
  const custom = (all.spectrum || []).filter(s => Math.abs(s.wavelength - 800) < 1);
  assert.ok(custom.length, 'no 800 nm output line');
  near(custom.reduce((sum, s) => sum + s.power, 0), 0.4, 1e-9, 'custom output share');
  assert.ok(!(all.spectrum || []).some(s => s.wavelength > 801 && s.wavelength < 1000),
    'custom output should not smear the pump bandwidth around 800 nm');
});

test('CW conversion is unchanged', () => {
  const { pump, harmonic } = crystalScene({ source: 'cwlaser' });
  near(harmonic.wavelength, 532, 1e-9, 'CW harmonic');
  near(harmonic.signal, 0.4, 1e-9, 'CW converted share');
  near(pump.signal, 0.6, 1e-9, 'CW residual pump');
});

test('scaleSpectrum scales every spectrum kind and rejects nonsense', () => {
  assert.deepEqual(scaleSpectrum(gaussianSpectrum(1064, 5), 1 / 2), gaussianSpectrum(532, 2.5));
  assert.deepEqual(scaleSpectrum(flatSpectrum(900, 1200), 1 / 3), flatSpectrum(300, 400));
  assert.deepEqual(scaleSpectrum(lineSpectrum([{ nm: 1000, w: 1 }, { nm: 1100, w: 0.5 }]), 1 / 2),
    lineSpectrum([{ nm: 500, w: 1 }, { nm: 550, w: 0.5 }]));
  assert.equal(scaleSpectrum(null, 1 / 2), null);
  assert.equal(scaleSpectrum(gaussianSpectrum(1064, 5), 0), null);
  assert.equal(scaleSpectrum(gaussianSpectrum(1064, 5), NaN), null);
});
