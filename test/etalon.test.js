import test from 'node:test';
import assert from 'node:assert/strict';

import { etalonDefinition, etalonDerivedInfo } from '../sketch/js/etalon.js';
import { registry, createElement } from '../sketch/js/elements.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import '../sketch/js/vipa.js'; // registers registry.vipa for the palette-order test below

function nearly(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`);
}

function signalAt({ rot = 0, wavelength, etalonParams = {} } = {}) {
  const laser = createElement('laser', 0, 0);
  if (wavelength !== undefined) laser.params.wavelength = wavelength;
  const etalon = createElement('etalon', 150, 0);
  etalon.rot = rot;
  Object.assign(etalon.params, etalonParams);
  const detector = createElement('detector', 300, 0);
  traceAll([laser, etalon, detector]);
  return detectorReading(detector.id)?.signal ?? 0;
}

test('registers a standalone Etalon palette element under Filters & Splitters', () => {
  assert.equal(registry.etalon, etalonDefinition);
  assert.equal(etalonDefinition.category, 'Filters & Splitters');
  assert.equal(etalonDefinition.label, 'Etalon (Fabry–Pérot)');
});

test('Filters & Splitters palette lists Beamsplitter, Filter, Dichroic mirror, Etalon, VIPA in that order', () => {
  const listed = Object.values(registry)
    .filter(definition => definition.category === 'Filters & Splitters')
    .sort((a, b) => (a.paletteOrder ?? 100) - (b.paletteOrder ?? 100))
    .map(definition => definition.label);
  assert.deepEqual(listed, ['Beamsplitter', 'Filter', 'Dichroic mirror', 'Etalon (Fabry–Pérot)', 'VIPA']);
});

test('spectral parameters (wavelength, bandwidth, FSR, peak transmission) round-trip exactly through the Airy model', () => {
  const spectral = { centerWavelength: 1550, bandwidth: 0.05, fsr: 2, peakTransmission: 95 };
  const derived = etalonDerivedInfo(spectral);
  nearly(derived.fwhm, 0.05, 1e-9);
  nearly(derived.fsr, 2, 1e-9);
  nearly(derived.peakTransmission, 95, 1e-6);
});

test('changing peak transmission changes only the achieved transmission, not finesse or bandwidth', () => {
  const base = { centerWavelength: 1550, bandwidth: 0.05, fsr: 2 };
  const high = etalonDerivedInfo({ ...base, peakTransmission: 98 });
  const low = etalonDerivedInfo({ ...base, peakTransmission: 50 });
  nearly(high.peakTransmission, 98, 1e-6);
  nearly(low.peakTransmission, 50, 1e-6);
  nearly(high.finesse, low.finesse, 1e-9);
  nearly(high.fwhm, low.fwhm, 1e-9);
});

test('a laser tuned to the default resonance transmits near the coating-limited peak, not a flat partial split', () => {
  // Default input mode is spectral: 1 nm bandwidth, 19 nm FSR, centered at
  // the app-wide default 532 nm laser wavelength, 98% peak transmission.
  nearly(signalAt({ wavelength: 532 }), 0.98, 0.005);
});

test('half a linewidth off resonance transmission has dropped to half the peak', () => {
  // Default bandwidth (FWHM) is 1 nm, so 0.5 nm off resonance sits exactly
  // at the half-max point by definition of FWHM.
  const off = signalAt({ wavelength: 532.5 });
  nearly(off, 0.49, 0.02);
});

test('between resonances (half the free spectral range away) the etalon is essentially opaque', () => {
  // Default FSR is 19 nm and bandwidth 1 nm (finesse ~19) — the midpoint
  // between two fringe orders is deep in the inter-fringe floor.
  const off = signalAt({ wavelength: 541.5 });
  assert.ok(off < 0.01, `expected near-zero transmission between resonances, got ${off}`);
});

test('the next transmission peak appears one free spectral range away', () => {
  // Resonances repeat at 2d/m for integer mode order m, not at exact linear
  // steps of FSR in wavelength — with the default's 19 nm FSR (mode order
  // 28 at 532 nm) that quadratic dispersion shifts the neighbouring order
  // to ~551.7 nm, not 551.0 nm, by more than the 1 nm linewidth.
  const next = signalAt({ wavelength: 551.7 });
  assert.ok(next > 0.5, `expected the neighbouring resonance near +19 nm FSR, got ${next}`);
});

test('rotating the element shifts the resonance away from the tuned wavelength', () => {
  // No dedicated "tilt" parameter — incidence angle comes from the element's
  // own rotation, exactly like tilting a real etalon shifts its passband.
  // The default etalon is thin (~7 µm, sized for a 19 nm FSR) so it takes a
  // few degrees, not fractions of a degree, to detune it.
  const straight = signalAt({ wavelength: 532, rot: 0 });
  const tilted = signalAt({ wavelength: 532, rot: 5 });
  assert.ok(straight > 0.5, 'untilted element should sit on its tuned resonance');
  assert.ok(tilted < straight * 0.1, `expected the 5° tilt to detune the resonance, got ${tilted} vs ${straight}`);
});

test('off-resonance light reflects rather than being silently absorbed', () => {
  const laser = createElement('laser', 0, 0);
  const etalon = createElement('etalon', 150, 0);
  etalon.rot = 45; // large tilt detunes the default 532nm resonance and folds the reflection 90° off-axis
  const reflectedDetector = createElement('detector', 150, -300);
  reflectedDetector.rot = -90;
  traceAll([laser, etalon, reflectedDetector]);
  const reading = detectorReading(reflectedDetector.id);
  assert.ok(reading && reading.signal > 0.9, 'off-resonance light should reflect, not vanish');
});
