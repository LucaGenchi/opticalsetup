// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';

// A band reflector is the coating on a cavity mirror: it reflects one band
// and transmits both sides of it. At 45° it sends the band down and lets the
// rest straight on.
function split({ source = 'cwlaser', laser = {}, center = 800, band = 100 }) {
  const src = createElement(source, 60, 160);
  Object.assign(src.params, { beamMode: 'line', ...laser });
  const mirror = createElement('dichroic', 300, 160);
  mirror.rot = 135;
  Object.assign(mirror.params, { dtype: 'notch', center, band });
  const through = createElement('detector', 460, 160);
  const reflected = createElement('detector', 300, 320);
  reflected.rot = 90;
  traceScene([src, mirror, through, reflected]);
  return { through: detectorReading(through.id), reflected: detectorReading(reflected.id) };
}

test('a band reflector reflects its band and transmits both sides', () => {
  for (const [wl, port] of [[532, 'through'], [800, 'reflected'], [1588, 'through']]) {
    const reading = split({ laser: { wavelength: wl } });
    assert.ok(reading[port], `${wl} nm should leave by the ${port} port`);
    assert.equal(reading[port === 'through' ? 'reflected' : 'through'], null, `${wl} nm leaked to the other port`);
  }
});

test('a broadband beam is cut into its in-band reflection and out-of-band transmission', () => {
  // Gaussian spectrum, integrated numerically.
  const pulsed = split({ source: 'pulsedlaser', laser: { wavelength: 800, transformLimited: false, bandwidth: 100 }, band: 60 });
  assert.ok(pulsed.reflected.bandMax - pulsed.reflected.bandMin <= 60 + 1, 'reflected light should lie inside the band');
  assert.ok(pulsed.through.spectrum.filter(s => s.power > 1e-6).every(s => Math.abs(s.wavelength - 800) >= 30 - 5), 'transmitted light should lie outside the band');
  // Exactly a bandpass with its ports exchanged, including the existing
  // spectral integration error both share.
  const bandpass = createElement('pulsedlaser', 60, 160);
  Object.assign(bandpass.params, { beamMode: 'line', wavelength: 800, transformLimited: false, bandwidth: 100 });
  const bp = createElement('dichroic', 300, 160);
  bp.rot = 135;
  Object.assign(bp.params, { dtype: 'bandpass', center: 800, band: 60 });
  const bpThrough = createElement('detector', 460, 160);
  const bpReflected = createElement('detector', 300, 320);
  bpReflected.rot = 90;
  traceScene([bandpass, bp, bpThrough, bpReflected]);
  assert.equal(pulsed.reflected.signal, detectorReading(bpThrough.id).signal);
  assert.equal(pulsed.through.signal, detectorReading(bpReflected.id).signal);

  // Flat supercontinuum, split analytically into three pieces.
  const continuum = createElement('sclaser', 60, 160);
  Object.assign(continuum.params, { scMin: 500, scMax: 1100, beamMode: 'line' });
  const mirror = createElement('dichroic', 300, 160);
  mirror.rot = 135;
  Object.assign(mirror.params, { dtype: 'notch', center: 800, band: 100 });
  const through = createElement('detector', 460, 160);
  const reflected = createElement('detector', 300, 320);
  reflected.rot = 90;
  traceScene([continuum, mirror, through, reflected]);
  const r = detectorReading(reflected.id), t = detectorReading(through.id);
  assert.ok(Math.abs(r.signal - 100 / 600) < 0.01, `reflected share ${r.signal}`);
  assert.ok(Math.abs(t.signal - 500 / 600) < 0.01, `transmitted share ${t.signal}`);
  assert.ok(r.bandMin >= 749 && r.bandMax <= 851, `reflected band ${r.bandMin}–${r.bandMax}`);
});

test('a partially reflecting band is an output coupler: the band splits, the sides still transmit', () => {
  const run = (sourceType, laser, bandRefl) => {
    const src = createElement(sourceType, 60, 160);
    Object.assign(src.params, { beamMode: 'line', ...laser });
    const mirror = createElement('dichroic', 300, 160);
    mirror.rot = 135;
    Object.assign(mirror.params, { dtype: 'notch', center: 800, band: 300, bandRefl });
    const through = createElement('detector', 460, 160);
    const reflected = createElement('detector', 300, 320);
    reflected.rot = 90;
    traceScene([src, mirror, through, reflected]);
    return { through: detectorReading(through.id), reflected: detectorReading(reflected.id) };
  };
  const line = run('cwlaser', { wavelength: 800 }, 90);
  assert.ok(Math.abs(line.reflected.signal - 0.9) < 1e-9, `reflected ${line.reflected.signal}`);
  assert.ok(Math.abs(line.through.signal - 0.1) < 1e-9, `transmitted ${line.through.signal}`);

  const outside = run('cwlaser', { wavelength: 532 }, 90);
  assert.equal(outside.reflected, null, 'out-of-band light must not be reflected');
  assert.ok(Math.abs(outside.through.signal - 1) < 1e-9);

  // A band wholly inside the reflector splits in the same ratio.
  const pulsed = run('pulsedlaser', { wavelength: 800, transformLimited: false, bandwidth: 5 }, 90);
  assert.ok(Math.abs(pulsed.reflected.signal - 0.9) < 1e-3, `pulsed reflected ${pulsed.reflected.signal}`);
  assert.ok(Math.abs(pulsed.through.signal - 0.1) < 1e-3, `pulsed transmitted ${pulsed.through.signal}`);

  const continuum = run('sclaser', { scMin: 700, scMax: 900 }, 90);
  assert.ok(Math.abs(continuum.reflected.signal - 0.9) < 0.01, `continuum reflected ${continuum.reflected.signal}`);
  assert.ok(Math.abs(continuum.through.signal - 0.1) < 0.01, `continuum transmitted ${continuum.through.signal}`);

  // The default is a high reflector, exactly as before.
  const full = run('cwlaser', { wavelength: 800 }, 100);
  assert.equal(full.through, null);
});

test('a spectrum straddling a band edge splits within the shared integration error', () => {
  // The partial and full band reflector both re-grid each port's surviving
  // spectrum separately, which loses about 1.5 % for a Gaussian cut by a band
  // edge. That approximation is inherited from the spectral machinery; this
  // pins it rather than claiming exact conservation.
  const run = bandRefl => {
    const src = createElement('pulsedlaser', 60, 160);
    Object.assign(src.params, { beamMode: 'line', wavelength: 750, transformLimited: false, bandwidth: 60 });
    const mirror = createElement('dichroic', 300, 160);
    mirror.rot = 135;
    Object.assign(mirror.params, { dtype: 'notch', center: 800, band: 100, bandRefl });
    const through = createElement('detector', 460, 160);
    const reflected = createElement('detector', 300, 320);
    reflected.rot = 90;
    traceScene([src, mirror, through, reflected]);
    return { t: detectorReading(through.id)?.signal ?? 0, r: detectorReading(reflected.id)?.signal ?? 0 };
  };
  const partial = run(90), full = run(100);
  assert.ok(Math.abs(partial.t + partial.r - 1) < 0.02, `partial total ${partial.t + partial.r}`);
  assert.ok(Math.abs(full.t + full.r - 1) < 0.02, `full total ${full.t + full.r}`);
  assert.ok(partial.r < full.r && partial.t > full.t, 'lowering the band reflectivity moves power to the transmitted port');
});
