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

test('a spectrum straddling a band edge splits without losing power', () => {
  // Each port's spectrum is still re-gridded separately for its shape, but
  // the port holding both sides of the band takes the power the band's port
  // does not, so the two always add up to the incident power.
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
  assert.ok(Math.abs(partial.t + partial.r - 1) < 1e-9, `partial total ${partial.t + partial.r}`);
  assert.ok(Math.abs(full.t + full.r - 1) < 1e-9, `full total ${full.t + full.r}`);
  assert.ok(partial.r < full.r && partial.t > full.t, 'lowering the band reflectivity moves power to the transmitted port');
});

test('a Gaussian line centred on a band reflector conserves power across both ports', () => {
  // gaussianSpectrum(532, 40) with a 20 nm band: the band holds 0.4441 of
  // the power. Integrated separately, the two sides came to 0.5409 instead of
  // 0.5559, and T + R fell to 0.981.
  const run = (dtype, center, band) => {
    const src = createElement('pulsedlaser', 60, 160);
    Object.assign(src.params, { beamMode: 'line', wavelength: 532, transformLimited: false, bandwidth: 40 });
    const mirror = createElement('dichroic', 300, 160);
    mirror.rot = 135;
    Object.assign(mirror.params, { dtype, center, band, bandRefl: 100 });
    const through = createElement('detector', 460, 160);
    const reflected = createElement('detector', 300, 320);
    reflected.rot = 90;
    traceScene([src, mirror, through, reflected]);
    return { t: detectorReading(through.id)?.signal ?? 0, r: detectorReading(reflected.id)?.signal ?? 0 };
  };
  const notch = run('notch', 532, 20);
  assert.ok(Math.abs(notch.t + notch.r - 1) < 1e-9, `notch total ${notch.t + notch.r}`);
  assert.ok(Math.abs(notch.r - 0.4441) < 0.01, `in-band share ${notch.r}`);
  assert.ok(Math.abs(notch.t - 0.5559) < 0.01, `out-of-band share ${notch.t}`);

  // A bandpass is the same coating with its ports exchanged, and conserves too.
  const bandpass = run('bandpass', 532, 20);
  assert.ok(Math.abs(bandpass.t + bandpass.r - 1) < 1e-9, `bandpass total ${bandpass.t + bandpass.r}`);
  assert.equal(bandpass.t, notch.r);
  assert.equal(bandpass.r, notch.t);

  // Boundary: with no band edge inside the line, nothing is redistributed.
  // A band wholly outside reflects nothing, and the line passes as it does
  // any other filter that transmits all of it (a bandpass enclosing it).
  const away = run('notch', 1064, 20);
  assert.equal(away.r, 0);
  assert.equal(away.t, run('bandpass', 532, 1000).t);
  assert.ok(Math.abs(away.t - 1) < 1e-4, `transmitted ${away.t}`);
  // A band wholly enclosing the line reflects all of it.
  const enclosed = run('notch', 532, 1000);
  assert.equal(enclosed.t, 0);
  assert.equal(enclosed.r, away.t);
});
