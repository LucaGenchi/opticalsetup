// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { gaussianSpectrum, spectrumSupport } from '../sketch/js/spectrum.js';

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
  // A band wholly outside reflects nothing and passes the whole line, as a
  // bandpass enclosing it does.
  const away = run('notch', 1064, 20);
  assert.equal(away.r, 0);
  assert.equal(away.t, run('bandpass', 532, 1000).t);
  assert.ok(Math.abs(away.t - 1) < 1e-12, `transmitted ${away.t}`);
  // A band wholly enclosing the line reflects all of it.
  const enclosed = run('notch', 532, 1000);
  assert.equal(enclosed.t, 0);
  assert.equal(enclosed.r, away.t);
});

// The 532/40 nm Gaussian through a dichroic, optionally behind a filter that
// has already reshaped it into a sampled profile.
function gaussianThrough(mirrorParams, { prefilter = null, mirror = true } = {}) {
  const src = createElement('pulsedlaser', 60, 160);
  Object.assign(src.params, { beamMode: 'line', wavelength: 532, transformLimited: false, bandwidth: 40 });
  const elements = [src];
  if (prefilter) {
    const filter = createElement('filter', 180, 160);
    Object.assign(filter.params, prefilter);
    elements.push(filter);
  }
  const through = createElement('detector', 460, 160);
  const reflected = createElement('detector', 300, 320);
  reflected.rot = 90;
  if (mirror) {
    const dichroic = createElement('dichroic', 300, 160);
    dichroic.rot = 135;
    Object.assign(dichroic.params, mirrorParams);
    elements.push(dichroic);
  }
  traceScene([...elements, through, reflected]);
  return { t: detectorReading(through.id)?.signal ?? 0, r: detectorReading(reflected.id)?.signal ?? 0 };
}

test('an already filtered spectrum is split by a band reflector without losing power', () => {
  // A bandpass ahead of the mirror leaves a sampled profile; the band
  // reflector then cuts inside it, and the two ports share what arrives.
  const prefilter = { ftype: 'bandpass', center: 532, band: 30 };
  const arriving = gaussianThrough(null, { prefilter, mirror: false }).t;
  assert.ok(arriving > 0.4 && arriving < 0.9, `arriving ${arriving}`);
  for (const bandRefl of [100, 60]) {
    const { t, r } = gaussianThrough({ dtype: 'notch', center: 532, band: 10, bandRefl }, { prefilter });
    assert.ok(t > 0 && r > 0, `both ports carry light at ${bandRefl} %`);
    assert.ok(Math.abs(t + r - arriving) < 1e-9, `total ${t + r} vs arriving ${arriving} at ${bandRefl} %`);
  }
});

test('a band edge exactly at the end of the spectrum counts as cutting it', () => {
  // The band is closed, so an edge on the support's end puts that endpoint
  // in the band: the transmitted port loses it, and the reflected sliver is
  // too faint to be kept. The complement gives the transmitted port the rest,
  // so nothing goes missing. A band clear of the spectrum keeps the integral.
  const [, hi] = spectrumSupport(gaussianSpectrum(532, 40));
  const band = 20;
  const center = hi + band / 2;
  assert.equal(center - band / 2, hi, 'the lower band edge must land exactly on the support end');
  const onEdge = gaussianThrough({ dtype: 'notch', center, band });
  assert.equal(onEdge.r, 0);
  assert.ok(Math.abs(onEdge.t - 1) < 1e-9, `on the edge ${onEdge.t}`);
  const outside = gaussianThrough({ dtype: 'notch', center: hi + 100, band });
  assert.equal(outside.r, 0);
  assert.equal(outside.t, gaussianThrough({ dtype: 'bandpass', center: 532, band: 1000 }).t);
});

test('the light either side of a band carries none of the band with it', () => {
  // The sides leave as separate pieces with exact edges, as the Filter's
  // notch gives them, so a bandpass of the same band behind the port that
  // carries them finds nothing. One profile spanning the gap would put
  // interpolated light back into it.
  const behind = (dtype, port, withBandpass = true) => {
    const src = createElement('pulsedlaser', 60, 160);
    Object.assign(src.params, { beamMode: 'line', wavelength: 532, transformLimited: false, bandwidth: 40 });
    const mirror = createElement('dichroic', 200, 160);
    mirror.rot = 135;
    Object.assign(mirror.params, { dtype, center: 532, band: 20 });
    const bandpass = createElement('filter', port === 'through' ? 330 : 200, port === 'through' ? 160 : 290);
    if (port !== 'through') bandpass.rot = 90;
    Object.assign(bandpass.params, { ftype: 'bandpass', center: 532, band: 20 });
    const detector = createElement('detector', port === 'through' ? 460 : 200, port === 'through' ? 160 : 420);
    if (port !== 'through') detector.rot = 90;
    traceScene([src, mirror, ...(withBandpass ? [bandpass] : []), detector]);
    return detectorReading(detector.id)?.signal ?? 0;
  };
  // Without the bandpass the sides do reach the detector (exact: 0.5559).
  assert.ok(Math.abs(behind('notch', 'through', false) - 0.5559) < 0.01);
  assert.ok(Math.abs(behind('bandpass', 'reflected', false) - 0.5559) < 0.01);
  assert.equal(behind('notch', 'through'), 0, 'band reflector, transmitted sides');
  assert.equal(behind('bandpass', 'reflected'), 0, 'bandpass dichroic, reflected sides');
});

test('a band reflector beside a line passes all of it, as the Filter notch does', () => {
  // The Filter notch passes a beam clear of its band untouched; the band
  // reflector integrates it, and the integral of a profile passed whole is
  // exactly the profile's power.
  const reflector = gaussianThrough({ dtype: 'notch', center: 1064, band: 20 });
  const src = createElement('pulsedlaser', 60, 160);
  Object.assign(src.params, { beamMode: 'line', wavelength: 532, transformLimited: false, bandwidth: 40 });
  const filter = createElement('filter', 300, 160);
  Object.assign(filter.params, { ftype: 'notch', center: 1064, band: 20 });
  const detector = createElement('detector', 460, 160);
  traceScene([src, filter, detector]);
  assert.equal(detectorReading(detector.id).signal, 1);
  assert.ok(Math.abs(reflector.t - 1) < 1e-12, `band reflector transmitted ${reflector.t}`);
  assert.equal(reflector.r, 0);
});
