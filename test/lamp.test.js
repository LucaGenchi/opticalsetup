import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { LAMP_PRESETS, lampColor } from '../sketch/js/lamps.js';
import {
  lineSpectrum, resolveSourceSpectrum, spectrumSamples, spectrumStats, spectrumSupport, spectrumWeight,
} from '../sketch/js/spectrum.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import '../sketch/js/detector-instruments.js';

test('a line spectrum returns its own lines rather than a grid', () => {
  // This is the whole reason for the new kind. A uniform grid fine enough to
  // resolve a 0.1 nm line across the visible would be thousands of points
  // wide, and every consumer re-samples; returning the lines means a grating
  // fans exactly the wavelengths that are there and nothing that is not.
  const spec = lineSpectrum([{ nm: 435.8343, w: 1 }, { nm: 546.074, w: 1 }, { nm: 1013.98, w: 0.2 }]);
  const samples = spectrumSamples(spec);
  assert.deepEqual(samples.map(s => s.wl), [435.8343, 546.074, 1013.98]);
  const total = samples.reduce((sum, s) => sum + s.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-12, 'weights are normalised');
  assert.ok(samples[0].weight > samples[2].weight, 'and follow the line strengths');
});

test('a line carries weight only at the line', () => {
  const spec = lineSpectrum([{ nm: 546.074, w: 1 }]);
  assert.equal(spectrumWeight(spec, 546.074), 1);
  assert.equal(spectrumWeight(spec, 500), 0, 'nothing between the lines');
  // a single line still needs a finite span for anything that integrates
  const [lo, hi] = spectrumSupport(spec);
  assert.ok(hi > lo, `support must be finite, got ${lo}..${hi}`);
});

test('every preset is well formed and physically ordered', () => {
  for (const [key, preset] of Object.entries(LAMP_PRESETS)) {
    assert.ok(preset.label, `${key} has a label`);
    assert.ok(preset.lines.length >= 3, `${key} has lines worth showing`);
    for (const line of preset.lines) {
      assert.ok(line.nm > 150 && line.nm < 12000, `${key}: ${line.nm} nm is in range`);
      assert.ok(line.w > 0 && line.w <= 1, `${key}: weight ${line.w} is a fraction`);
    }
    const spec = lineSpectrum(preset.lines);
    assert.ok(spec, `${key} builds a spectrum`);
    assert.equal(spec.lines.length, preset.lines.length, `${key} keeps every line`);
  }
});

test('the sodium D lines are two lines, and they resolve', () => {
  // The proposal claimed the doublet could not be shown. It can: the
  // spectrometer keys wavelengths to 0.1 nm, and these sit six buckets apart.
  const na = LAMP_PRESETS.na.lines.filter(l => l.nm > 588 && l.nm < 590);
  assert.equal(na.length, 2, 'the D doublet ships as a pair, not as its mean');
  const bucket = wl => Math.round(wl * 10) / 10;
  assert.notEqual(bucket(na[0].nm), bucket(na[1].nm), 'and lands in distinct buckets');
});

test('a lamp is tinted by its own lines, not washed to grey', () => {
  // Averaging RGB across several lines drifts every multi-line lamp toward
  // the same muddy neutral; normalising to the brightest channel keeps the
  // hue the lines actually make.
  const hue = type => {
    const hex = lampColor(type);
    return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
  };
  const na = hue('na'), ne = hue('ne'), cs = hue('cs');
  assert.ok(na.r > 200 && na.g > 150 && na.b < 80, `sodium reads yellow, got ${JSON.stringify(na)}`);
  assert.ok(ne.r > 200 && ne.b < 80, `neon reads warm, got ${JSON.stringify(ne)}`);
  assert.ok(cs.b > cs.r, `caesium leans blue, got ${JSON.stringify(cs)}`);
  // and every preset produces a real colour
  for (const key of Object.keys(LAMP_PRESETS)) assert.match(lampColor(key), /^#[0-9a-f]{6}$/);
});

test('the element resolves its preset into a spectrum the tracer can use', () => {
  const resolved = resolveSourceSpectrum('pointsource', { sourceKind: 'lamp', lampType: 'na' });
  assert.equal(resolved.spec.kind, 'lines');
  // the nominal wavelength is the brightest VISIBLE line, so the beam is
  // drawn the colour the lamp looks, not the colour of its strongest infrared
  assert.ok(resolved.wl > 588 && resolved.wl < 590, `sodium reads as its D line, got ${resolved.wl}`);
  const cs = resolveSourceSpectrum('pointsource', { sourceKind: 'lamp', lampType: 'cs' });
  assert.ok(cs.wl < 780, `caesium's 852 nm line is stronger but invisible, got ${cs.wl}`);
  // an unknown or missing preset falls back rather than failing
  assert.equal(resolveSourceSpectrum('pointsource', { sourceKind: 'lamp' }).spec.kind, 'lines');
  assert.equal(resolveSourceSpectrum('pointsource', { sourceKind: 'lamp', lampType: 'nope' }).spec.kind, 'lines');
});

test('a lamp emits like a point source and is collected the same way', () => {
  const lamp = createElement('pointsource', 175, 200);
  Object.assign(lamp.params, { sourceKind: 'lamp', lampType: 'hg', spread: 360, nrays: 24 });
  const rays = registry.pointsource.source(lamp);
  assert.equal(rays.length, 24);
  assert.ok(rays.every(r => r.evan && r.evanLen === 110),
    'the same near-field behaviour, so the same collectors apply');

  // and a parabola at its focus collimates it, exactly as for a point source
  const mirror = createElement('oap', 150, 200); mirror.rot = 180;
  Object.assign(mirror.params, { length: 110, f: 25 });
  const detector = createElement('detector', 600, 200);
  detector.params.aperture = 200;
  traceAll([lamp, mirror, detector], []);
  const reading = detectorReading(detector.id);
  assert.ok(reading && reading.signal > 0, 'the lamp collimates off a parabola');
  assert.ok(reading.bandMax - reading.bandMin > 100,
    `and arrives carrying its whole line set, got ${reading.bandMin}-${reading.bandMax} nm`);
});

test('a lamp cannot interfere, which is what makes it a lamp', () => {
  // Not a setting: like every source except a sized monochromatic CW laser,
  // its light is carried as power and no field is reconstructed from it.
  const lamp = createElement('pointsource', 100, 200);
  lamp.params.sourceKind = 'lamp';
  const stats = spectrumStats(resolveSourceSpectrum('pointsource', lamp.params).spec);
  assert.ok(stats.fwhm > 0, 'it spans a real range of wavelengths');
  assert.ok(!registry.pointsource.params.some(p => p.key === 'coherenceLengthMm'),
    'and offers no coherence-length control, which would not do anything');
});

test('the drawing follows the mode, and the point mode is untouched', () => {
  const el = createElement('pointsource', 0, 0);
  const asPoint = registry.pointsource.svg(el);
  el.params.sourceKind = 'lamp';
  const asLamp = registry.pointsource.svg(el);
  assert.match(asPoint, /<circle r="4.5"/, 'a point emitter is still the star glyph');
  assert.doesNotMatch(asPoint, /<rect/);
  assert.match(asLamp, /<rect x="-5" y="-13"/, 'a lamp is drawn as a pen-ray tube');
  assert.doesNotMatch(asLamp, /<circle r="4.5"/);
  // and the point mode's spectrum is unchanged by the new option existing
  const mono = resolveSourceSpectrum('pointsource', { wavelength: 532, bwMode: 'mono' });
  assert.equal(mono.wl, 532);
  assert.equal(mono.spec, null);
});
