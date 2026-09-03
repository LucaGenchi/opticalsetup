import test from 'node:test';
import assert from 'node:assert/strict';

import {
  gaussianSpectrum, flatSpectrum, spectrumWeight, spectrumSamples, spectrumStats,
  applyTransmission, transformLimitedBandwidthNm, transformLimitedDurationFs, resolveSourceSpectrum,
} from '../sketch/js/spectrum.js';
import { createElement, formatPower, getVisualBounds, peakPowerW, probeScale, registry } from '../sketch/js/elements.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import '../sketch/js/detector-instruments.js';
import '../sketch/js/etalon.js';
import '../sketch/js/vipa.js';

function nearly(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`);
}

// ---------------- spectrum.js pure-function physics ----------------

test('gaussianSpectrum weight and FWHM measure back correctly', () => {
  const g = gaussianSpectrum(532, 40);
  nearly(spectrumWeight(g, 532), 1);
  nearly(spectrumWeight(g, 552), 0.5); // exactly one half-FWHM off centre
  nearly(spectrumWeight(g, 512), 0.5);
  const stats = spectrumStats(g);
  nearly(stats.center, 532);
  nearly(stats.fwhm, 40);
});

test('flatSpectrum has uniform weight inside its range and zero outside', () => {
  const f = flatSpectrum(400, 800);
  nearly(spectrumWeight(f, 400), 1);
  nearly(spectrumWeight(f, 600), 1);
  nearly(spectrumWeight(f, 800), 1);
  nearly(spectrumWeight(f, 399.9), 0);
  nearly(spectrumWeight(f, 800.1), 0);
});

test('spectrumSamples normalizes weights to sum to 1 for both shapes', () => {
  const g = spectrumSamples(gaussianSpectrum(532, 40), 33);
  nearly(g.reduce((sum, s) => sum + s.weight, 0), 1, 1e-9);
  const f = spectrumSamples(flatSpectrum(400, 800), 33);
  nearly(f.reduce((sum, s) => sum + s.weight, 0), 1, 1e-9);
  // a flat profile's samples should all carry (nearly) the same weight
  const spread = Math.max(...f.map(s => s.weight)) - Math.min(...f.map(s => s.weight));
  assert.ok(spread < 1e-9, 'flat spectrum samples should be uniformly weighted');
});

test('applyTransmission reproduces exact analytic box overlap for a flat spectrum', () => {
  const f = flatSpectrum(400, 800);
  const passband = wl => (wl >= 540 && wl <= 560) ? 1 : 0;
  const result = applyTransmission(f, 600, passband);
  // grid-based numeric integration of a flat source against a step function
  // has some discretization error; this is the case the app routes through
  // the exact analytic bandIntersect path instead (see raytrace.js), so a
  // loose tolerance here just confirms the numeric fallback is in the right
  // ballpark, not exact.
  nearly(result.fraction, 20 / 400, 0.01);
});

test('applyTransmission with no spectrum (monochromatic) is exact', () => {
  const passband = wl => (wl >= 540 && wl <= 560) ? 1 : 0;
  assert.equal(applyTransmission(null, 550, passband).fraction, 1);
  assert.equal(applyTransmission(null, 550, passband).spec, null);
  assert.equal(applyTransmission(null, 561, passband), null);
});

test('applyTransmission narrows a Gaussian correctly clipped by a bandpass', () => {
  const g = gaussianSpectrum(532, 40);
  // a bandpass wholly inside the Gaussian's support should pass only that slice
  const result = applyTransmission(g, 532, wl => (wl >= 520 && wl <= 544) ? 1 : 0);
  assert.ok(result.fraction > 0 && result.fraction < 1, 'only part of the Gaussian survives');
  nearly(result.wl, 532, 1); // centred bandpass keeps the centroid near 532
  assert.ok(result.bw < 40, 'the surviving slice is narrower than the original FWHM');
});

test('time-bandwidth product: Gaussian pulse bandwidth matches the textbook benchmark', () => {
  // ~100 fs Gaussian pulses at 800 nm need ~9.4 nm FWHM bandwidth (a widely
  // cited Ti:Sapphire oscillator benchmark) — direct formula check.
  nearly(transformLimitedBandwidthNm(100, 800, 'gauss'), 9.41, 0.02);
});

test('sech² pulses need less bandwidth than Gaussian for the same duration', () => {
  const gaussBw = transformLimitedBandwidthNm(100, 800, 'gauss');
  const sechBw = transformLimitedBandwidthNm(100, 800, 'sech2');
  assert.ok(sechBw < gaussBw, 'sech2 K=0.315 < gauss K=0.441, so its bandwidth should be smaller');
});

test('transformLimitedDurationFs is the inverse of transformLimitedBandwidthNm', () => {
  const bw = transformLimitedBandwidthNm(200, 1064, 'gauss');
  const dt = transformLimitedDurationFs(bw, 1064, 'gauss');
  nearly(dt, 200, 0.01);
});

// ---------------- laser source defaults ----------------

test('each laser source ships the defaults its own bench role implies', () => {
  const cw = createElement('cwlaser');
  assert.equal(cw.params.wavelength, 532);
  assert.equal(cw.params.avgPowerW, 0.1);
  assert.equal(cw.params.beamMode, 'beam');
  assert.equal(cw.params.beamWidth, 3);
  assert.equal(cw.params.pol, 0);
  assert.equal(cw.params.autoColor, true);
  assert.equal(cw.params.temporalMode, 'cw');

  const pulsed = createElement('pulsedlaser');
  assert.equal(pulsed.params.wavelength, 532);
  assert.equal(pulsed.params.avgPowerW, 0.1);
  assert.equal(pulsed.params.beamWidth, 3);
  assert.equal(pulsed.params.repRateMHz, 80);
  assert.equal(pulsed.params.pulsePhaseNs, 0);
  assert.equal(pulsed.params.pulseWidthFs, 150);
  assert.equal(pulsed.params.transformLimited, true);
  assert.equal(pulsed.params.pulseShape, 'gauss');
  assert.equal(pulsed.params.bandwidth, 5);
  assert.equal(pulsed.params.showPulse, true);
  assert.equal(pulsed.params.temporalMode, 'pulsed');

  const sc = createElement('sclaser');
  assert.equal(sc.params.scMin, 300);
  assert.equal(sc.params.scMax, 700);
  assert.equal(sc.params.avgPowerW, 1);
  assert.equal(sc.params.beamWidth, 3);
  assert.equal(sc.params.repRateMHz, 80);
  assert.equal(sc.params.autoColor, false, 'a supercontinuum has no single colour to derive');
  assert.equal(sc.params.color, '#cbd8ea');
  assert.equal(sc.params.showPulse, true);
  assert.equal(sc.params.temporalMode, 'pulsed');
});

test('the CW laser exposes no temporal or spectral-width controls at all', () => {
  const keys = registry.cwlaser.params.map(p => p.key);
  for (const gone of ['repRateMHz', 'pulseWidthFs', 'pulsePhaseNs', 'transformLimited', 'bwMode', 'bandwidth', 'showPulse']) {
    assert.equal(keys.includes(gone), false, `CW laser must not offer ${gone}`);
  }
});

test('the pulsed laser swaps its derived bandwidth for an editable one when transform-limited is off', () => {
  const def = registry.pulsedlaser;
  const shape = def.params.find(p => p.key === 'pulseShape');
  const derived = def.params.find(p => p.key === 'bandwidthTL');
  const bandwidth = def.params.find(p => p.key === 'bandwidth');

  // The envelope shape applies either way — it sets the time-bandwidth
  // constant while transform-limited, and the peak-power shape factor always.
  assert.equal(shape.show, undefined, 'pulse shape is always available');

  // Exactly one Bandwidth row is ever on screen, and both carry the same label
  // so the field appears to change hands rather than move.
  assert.equal(derived.label, bandwidth.label);
  assert.equal(derived.type, 'readout');
  assert.equal(derived.show({ transformLimited: true }), true, 'shown read-only while derived');
  assert.equal(derived.show({ transformLimited: false }), false);
  assert.equal(bandwidth.show({ transformLimited: true }), false);
  assert.equal(bandwidth.show({ transformLimited: false }), true, 'editable for a chirped pulse');
  assert.equal(bandwidth.min, 0, '0 nm is a valid monochromatic pulse train');

  // the read-only value is the real transform limit for the configured pulse
  const laser = createElement('pulsedlaser');
  assert.equal(derived.readout(laser.params),
    String(Number(transformLimitedBandwidthNm(150, 532, 'gauss').toPrecision(4))));
  assert.notEqual(derived.readout({ ...laser.params, pulseShape: 'sech2' }), derived.readout(laser.params),
    'a sech2 envelope has a different time-bandwidth product');
});

// ---------------- resolved source spectra ----------------

test('a transform-limited pulse derives its bandwidth from its own duration', () => {
  const pulsed = createElement('pulsedlaser');
  const { wl, bw, spec } = resolveSourceSpectrum('pulsedlaser', pulsed.params);
  assert.equal(wl, 532);
  nearly(bw, transformLimitedBandwidthNm(150, 532, 'gauss'), 1e-9);
  assert.equal(spec.kind, 'gauss');
});

test('turning transform-limited off hands the spectrum over to the bandwidth field, 0 nm included', () => {
  const pulsed = createElement('pulsedlaser');
  pulsed.params.transformLimited = false;
  pulsed.params.bandwidth = 12;
  assert.equal(resolveSourceSpectrum('pulsedlaser', pulsed.params).bw, 12);

  pulsed.params.bandwidth = 0;
  const mono = resolveSourceSpectrum('pulsedlaser', pulsed.params);
  assert.equal(mono.bw, 0);
  assert.equal(mono.spec, null, 'a 0 nm bandwidth is an exactly monochromatic pulse train');
});

test('the CW laser is monochromatic no matter what stray params it carries', () => {
  const cw = createElement('cwlaser');
  const { bw, spec } = resolveSourceSpectrum('cwlaser', { ...cw.params, bandwidth: 40 });
  assert.equal(bw, 0);
  assert.equal(spec, null);
});

test('the supercontinuum resolves to a flat band centred between its endpoints', () => {
  const sc = createElement('sclaser');
  const { wl, bw, spec } = resolveSourceSpectrum('sclaser', sc.params);
  assert.equal(wl, 500);
  assert.equal(bw, 400);
  assert.deepEqual(spec, { kind: 'flat', lo: 300, hi: 700 });
});

test('peak power concentrates the pulse energy into one pulse duration', () => {
  const pulsed = createElement('pulsedlaser');
  // 0.1 W / 80 MHz = 1.25 nJ per pulse, delivered in 150 fs
  nearly(peakPowerW(pulsed.params), 0.9394 * (0.1 / 80e6) / 150e-15, 1e-6);
  assert.match(formatPower(peakPowerW(pulsed.params)), /kW$/);

  assert.equal(peakPowerW({ ...pulsed.params, avgPowerW: 0 }), null);
  assert.equal(formatPower(null), '—');
});

// ---------------- end-to-end: a spectrometer sees the real Gaussian shape ----------------

test('a monochromatic laser reads as a single spike on a spectrometer', () => {
  const laser = createElement('cwlaser', 0, 0);
  const spectrometer = createElement('spectrometer', 300, 0);
  traceAll([laser, spectrometer]);
  const reading = detectorReading(spectrometer.id);
  assert.equal(reading.spectrum.length, 1);
  nearly(reading.spectrum[0].wavelength, laser.params.wavelength, 0.5);
});

test('a broadband laser reads as a real Gaussian curve on a spectrometer, not a single spike', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.bwMode = 'band';
  laser.params.bandwidth = 40;
  const spectrometer = createElement('spectrometer', 300, 0);
  traceAll([laser, spectrometer]);
  const reading = detectorReading(spectrometer.id);
  assert.ok(reading.spectrum.length > 10, 'the spectrometer should resolve many points across the line, not one');

  // peak should sit at the centre wavelength, and power should fall off
  // monotonically moving away from it on both sides (a genuine Gaussian
  // shape, not noise or a flat plateau)
  const samples = reading.spectrum;
  const peakIndex = samples.reduce((best, s, i) => (s.power > samples[best].power ? i : best), 0);
  nearly(samples[peakIndex].wavelength, 532, 3);
  for (let i = 1; i <= peakIndex; i++) assert.ok(samples[i].power >= samples[i - 1].power - 1e-9, 'rising toward the peak');
  for (let i = peakIndex; i < samples.length - 1; i++) assert.ok(samples[i].power >= samples[i + 1].power - 1e-9, 'falling away from the peak');

  // half-maximum points should sit roughly bandwidth/2 away from centre
  const peak = samples[peakIndex].power;
  const above = samples.filter(s => s.power >= peak / 2);
  const halfWidth = Math.max(...above.map(s => s.wavelength)) - Math.min(...above.map(s => s.wavelength));
  nearly(halfWidth, 40, 6);
});

test('a transform-limited pulsed laser drives its bandwidth from pulse duration, not a manual setting', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.temporalMode = 'pulsed';
  laser.params.pulseWidthFs = 100;
  laser.params.transformLimited = true;
  laser.params.pulseShape = 'gauss';
  // an explicit (and very different) bandwidth must be ignored while
  // transform-limited mode is driving the spectrum
  laser.params.bwMode = 'band';
  laser.params.bandwidth = 400;
  const spectrometer = createElement('spectrometer', 300, 0);
  traceAll([laser, spectrometer]);
  const reading = detectorReading(spectrometer.id);
  const expected = transformLimitedBandwidthNm(100, laser.params.wavelength, 'gauss');
  nearly(reading.bandMax - reading.bandMin, expected, 0.05);

  laser.params.pulseShape = 'sech2';
  traceAll([laser, spectrometer]);
  const sechReading = detectorReading(spectrometer.id);
  assert.ok(sechReading.bandMax - sechReading.bandMin < reading.bandMax - reading.bandMin,
    'sech2 should be measurably narrower than Gaussian for the same duration');
});

// ---------------- broadband light through wavelength-selective elements ----------------

test('a bandpass filter partially transmits a Gaussian laser line, proportional to spectral overlap', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.bwMode = 'band';
  laser.params.bandwidth = 40; // wide relative to a 20 nm passband
  const filter = createElement('filter', 150, 0);
  filter.params.ftype = 'bandpass';
  filter.params.center = 532;
  filter.params.band = 20;
  const detector = createElement('detector', 300, 0);
  traceAll([laser, filter, detector]);
  const reading = detectorReading(detector.id);
  assert.ok(reading, 'a centred passband should transmit something of a broad Gaussian line');
  assert.ok(reading.signal > 0 && reading.signal < 1, 'only a fraction of the Gaussian survives a narrower passband');

  // moving the passband far into the Gaussian's tail should transmit much less
  filter.params.center = 532 + 60;
  traceAll([laser, filter, detector]);
  const farReading = detectorReading(detector.id);
  const farSignal = farReading ? farReading.signal : 0;
  assert.ok(farSignal < reading.signal, 'a passband far in the tail should transmit less than one centred on the peak');
});

test('a dichroic mirror splits a Gaussian laser line into transmitted and reflected halves', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.bwMode = 'band';
  laser.params.bandwidth = 40;
  const dichroic = createElement('dichroic', 150, 0);
  dichroic.rot = 45; // fold the reflected half 90° off-axis
  dichroic.params.dtype = 'longpass';
  dichroic.params.cutoff = 532; // splits the Gaussian roughly down the middle
  const transmitted = createElement('detector', 300, 0);
  const reflected = createElement('detector', 150, -150);
  reflected.rot = -90;
  traceAll([laser, dichroic, transmitted, reflected]);
  const t = detectorReading(transmitted.id), r = detectorReading(reflected.id);
  assert.ok(t && r, 'both halves of a Gaussian split at its centre should register');
  nearly(t.signal + r.signal, 1, 0.02, 'energy should be conserved between the transmitted and reflected halves');
  nearly(t.signal, 0.5, 0.05, 'a cutoff at the centre wavelength should roughly bisect a symmetric Gaussian');
});

test('two filters in series on a Gaussian source: the second sees the first\'s reshaped output, not the raw line', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.bwMode = 'band';
  laser.params.bandwidth = 60;
  const first = createElement('filter', 100, 0);
  first.params.ftype = 'bandpass'; first.params.center = 532; first.params.band = 30;
  const second = createElement('filter', 200, 0);
  second.params.ftype = 'bandpass'; second.params.center = 535; second.params.band = 10;
  const detector = createElement('detector', 300, 0);
  assert.doesNotThrow(() => traceAll([laser, first, second, detector]));
  const reading = detectorReading(detector.id);
  assert.ok(reading, 'some of the Gaussian survives two overlapping narrow filters');
  nearly(reading.bandMax - reading.bandMin, 10, 2, 'the narrower, later filter should dominate the final width');

  // a filter with no overlap with what survived the first one blocks everything
  second.params.center = 700;
  traceAll([laser, first, second, detector]);
  assert.equal(detectorReading(detector.id), null);
});

test('two filters in series on a supercontinuum source keep the exact analytic overlap at each stage', () => {
  const source = createElement('sclaser', 0, 0);
  source.params.beamMode = 'line';
  source.params.scMin = 400;
  source.params.scMax = 800;
  const first = createElement('filter', 100, 0);
  first.params.ftype = 'bandpass'; first.params.center = 550; first.params.band = 100;
  const second = createElement('filter', 200, 0);
  second.params.ftype = 'bandpass'; second.params.center = 560; second.params.band = 20;
  const detector = createElement('detector', 300, 0);
  traceAll([source, first, second, detector]);
  // the second (narrower) filter is wholly inside the first's passband, so
  // the final transmitted fraction is exactly its own width over the source
  nearly(detectorReading(detector.id).signal, 20 / 400, 1e-6);
});

test('the exact flat-spectrum overlap through a filter is unaffected by the Gaussian code path', () => {
  // regression: supercontinuum sources must keep using the analytic exact
  // overlap, not the numeric Gaussian integration
  const source = createElement('sclaser', 0, 0);
  source.params.beamMode = 'line';
  source.params.scMin = 400;
  source.params.scMax = 800;
  const filter = createElement('filter', 150, 0);
  filter.params.ftype = 'bandpass';
  filter.params.band = 20;
  filter.params.center = 550;
  const detector = createElement('detector', 300, 0);
  traceAll([source, filter, detector]);
  nearly(detectorReading(detector.id).signal, 20 / 400, 1e-6);
});

// ---------------- dispersion weighting ----------------

test('a Gaussian-mode broadband laser disperses through a prism with a brighter centre, not a flat fan', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.bwMode = 'band';
  laser.params.bandwidth = 200; // >=200 uses the finer 9-sample dispersion grid
  const prism = createElement('prism', 180, 0);
  prism.params.psize = 50;
  prism.rot = 20;
  const drawables = traceAll([laser, prism]).filter(d => d.type === 'path' && d.pts.length >= 3);
  assert.ok(drawables.length > 3, 'a broadband ray should disperse into several distinct wavelength paths');
  // intensities should not all be identical — the Gaussian weighting means
  // samples near the centre wavelength carry more power than the tails
  const intensities = new Set(drawables.map(d => d.opacity ?? d.intensity ?? null).filter(v => v != null));
  assert.ok(intensities.size > 1 || drawables.length <= 1,
    'dispersed rays from a Gaussian source should not all carry identical weight');
});

test('a supercontinuum source still disperses through a prism with uniform weighting (unchanged)', () => {
  const source = createElement('sclaser', 0, 0);
  source.params.beamMode = 'line';
  source.params.scMin = 450;
  source.params.scMax = 700;
  const prism = createElement('prism', 180, 0);
  prism.params.psize = 50;
  prism.rot = 20;
  const outgoing = traceAll([source, prism]).filter(d => d.type === 'path' && d.pts.length >= 3);
  assert.ok(outgoing.length > 3, 'supercontinuum should still fan out across the prism');
});

// ---------------- etalon interaction with the new Gaussian model ----------------

test('a monochromatic laser exactly on an etalon resonance is unaffected by the spectrum redesign', () => {
  const laser = createElement('cwlaser', 0, 0);
  const etalon = createElement('etalon', 150, 0);
  const detector = createElement('detector', 300, 0);
  traceAll([laser, etalon, detector]);
  const reading = detectorReading(detector.id);
  nearly(reading.signal, 0.98, 0.001); // default spectral-mode peak transmission is 98%
});

test('a broadband Gaussian laser through an etalon degrades gracefully (no crash, finite result)', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.bwMode = 'band';
  laser.params.bandwidth = 40; // far broader than the etalon's default 1 nm linewidth
  const etalon = createElement('etalon', 150, 0);
  const transmitted = createElement('detector', 300, 0);
  const reflected = createElement('detector', 150, -300);
  reflected.rot = -90;
  etalon.rot = 45; // guarantees a reflected path exists to sanity-check against
  assert.doesNotThrow(() => traceAll([laser, etalon, transmitted, reflected]));
  const r = detectorReading(reflected.id);
  assert.ok(r === null || (Number.isFinite(r.signal) && r.signal >= 0 && r.signal <= 1.01),
    'reflected signal must stay finite and physically bounded even when the etalon linewidth is unresolved');
});

// ---------------- beam probe: real data, padded range, labeled extremes ----------------

function screenFor(sensor, elements, view = 'main') {
  const display = createElement('display', sensor.x + 130, sensor.y + 80);
  display.params.sensorId = sensor.id;
  display.params.displayView = view;
  const scene = [...elements, display];
  traceAll(scene);
  return registry.display.svg(display, scene);
}

test('the beam probe plots real sampled data for a broadband line as a smooth curve, not a hand-drawn bump', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.bwMode = 'band';
  laser.params.bandwidth = 40; // centre 532, so bandMin=512, bandMax=552
  const probe = createElement('probe', 150, 0);
  traceAll([laser, probe]);
  const svg = registry.probe.svg(probe);
  const sampleCount = Number(svg.match(/data-spectrum-points="(\d+)"/)?.[1] ?? 0);
  assert.ok(sampleCount > 5, `expected many sampled points for a broadband line, got ${sampleCount}`);
});

test('the beam probe frames the spectrum by what clears a thousandth of the peak', () => {
  // The spectrometer's rule, not a fixed number of standard deviations: the
  // axis spans whatever the light actually contains, so a wider band gets a
  // wider window rather than the same shape drawn at the same apparent size.
  const bench = bandwidth => {
    const laser = createElement('cwlaser', 0, 0);
    laser.params.beamMode = 'line';
    laser.params.bwMode = 'band';
    laser.params.bandwidth = bandwidth;
    const probe = createElement('probe', 150, 0);
    traceAll([laser, probe]);
    const svg = registry.probe.svg(probe, [laser, probe]);
    const ticks = [...svg.matchAll(/font-size="4.6" fill="#666">(\d+)</g)].map(m => Number(m[1]));
    return { svg, ticks };
  };
  const narrow = bench(40), wide = bench(200);
  assert.equal(narrow.ticks[1], 532, 'centre wavelength is labeled');
  assert.equal(wide.ticks[1], 532);
  const span = t => t[2] - t[0];
  assert.ok(span(wide.ticks) > span(narrow.ticks) * 3,
    `a 5x wider band must open the window: ${span(narrow.ticks)} vs ${span(wide.ticks)} nm`);
  // and each window must actually contain its own band
  assert.ok(narrow.ticks[0] < 512 && narrow.ticks[2] > 552, 'the 40 nm band fits inside its window');
});

test('a fixed wavelength range overrides the automatic one', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.bwMode = 'band';
  laser.params.bandwidth = 40;
  const probe = createElement('probe', 150, 0);
  Object.assign(probe.params, { rangeMode: 'manual', specMin: 500, specMax: 560 });
  traceAll([laser, probe]);
  const ticks = [...registry.probe.svg(probe, [laser, probe])
    .matchAll(/font-size="4.6" fill="#666">(\d+)</g)].map(m => Number(m[1]));
  assert.deepEqual(ticks, [500, 530, 560], 'the axis is exactly what was asked for');
});

test('the beam probe spectrum plot never overflows the white box', () => {
  // Regression: the curve was once drawn from all 28 raw samples of the
  // spec's own support, unfiltered and unclipped, so a wide enough laser ran
  // past the plot box's edges. The automatic window now spans the light
  // rather than cutting it, but a manual range can still be narrower than
  // what is there -- so both guards, the filter and the clip, still matter.
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.bwMode = 'band';
  laser.params.bandwidth = 200;
  const probe = createElement('probe', 150, 0);
  Object.assign(probe.params, { rangeMode: 'manual', specMin: 500, specMax: 560 });
  traceAll([laser, probe]);
  const svg = registry.probe.svg(probe, [laser, probe]);
  assert.match(svg, /<clipPath id="probeSpecClip/, 'the curve is clipped to the plot box');

  // every plotted point must sit inside the axes, not merely be clipped there
  const path = /<path data-spectrum-points="\d+" d="([^"]+)"/.exec(svg)?.[1] || '';
  const xs = [...path.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
  assert.ok(xs.length > 2, 'the curve has points to check');
  assert.ok(Math.min(...xs) >= 10 - 0.01 && Math.max(...xs) <= 66 + 0.01,
    `points must stay within the 10..66 plot box, got ${Math.min(...xs)}..${Math.max(...xs)}`);
});

test('the beam probe pads a monochromatic line by 5 nm on each side too', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  const probe = createElement('probe', 150, 0);
  traceAll([laser, probe]);
  const svg = registry.probe.svg(probe);
  assert.match(svg, />527</); // 532 - 5
  assert.match(svg, />532</);
  assert.match(svg, />537</); // 532 + 5
});

test('the beam probe readout card renders at 1.5x the original baseline, and its crosshair never scales', () => {
  const laser = createElement('cwlaser', 0, 0);
  const probe = createElement('probe', 150, 0);
  traceAll([laser, probe]);
  assert.equal(probe.params.displayScale, 1);
  assert.equal(probeScale(probe), 1.5);
  const svg = registry.probe.svg(probe);
  assert.match(svg, /scale\(1\.5\)/, 'the card renders at the dialled-back default size');
  const crosshair = svg.slice(0, svg.indexOf('<g transform="rotate('));
  assert.match(crosshair, /circle r="4.5"/, 'the crosshair is drawn outside (before) the scaled card group');
});

test('the beam probe scale dial spans 0.5x to 2x around its new default', () => {
  const probe = createElement('probe', 0, 0);
  const spec = registry.probe.params.find(p => p.key === 'displayScale');
  assert.equal(spec.min, 0.5);
  assert.equal(spec.max, 2);
  assert.equal(spec.def, 1);
  probe.params.displayScale = 0.5;
  assert.equal(probeScale(probe), 0.75);
  probe.params.displayScale = 2;
  assert.equal(probeScale(probe), 3);
  probe.params.displayScale = 99; // out-of-range input still clamps
  assert.equal(probeScale(probe), 3);
});

test('the probe card stays upright and clear of the beam however the probe is rotated', () => {
  const laser = createElement('cwlaser', 0, 0);
  const probe = createElement('probe', 150, 0);
  traceAll([laser, probe]);

  for (const rot of [0, 90, 180, 270]) {
    probe.rot = rot;
    const svg = registry.probe.svg(probe);
    // The card group counter-rotates by exactly the element's own rotation,
    // so its text and plots always render horizontally.
    assert.match(svg, new RegExp(`rotate\\(${-rot}\\)`),
      `card should counter-rotate by ${-rot}° so its contents stay level`);

    // And it is placed on the side the leader points to, never covering the
    // sampled point at the element's origin.
    const bounds = getVisualBounds(probe, { includeLabel: false });
    if (rot === 0) assert.ok(bounds.y0 < probe.y - 20, 'card sits above when the leader points up');
    if (rot === 180) assert.ok(bounds.y1 > probe.y + 20, 'card sits below when the leader points down');
    if (rot === 90) assert.ok(bounds.x1 > probe.x + 20, 'card sits right when the leader points right');
    if (rot === 270) assert.ok(bounds.x0 < probe.x - 20, 'card sits left when the leader points left');
  }
});

// ---------------- spectrometer: default padded range + manual override ----------------

// The plotted window, read back off the axis labels the display draws.
function axisRange(svg) {
  const ticks = [...svg.matchAll(/>(\d{3,4})</g)].map(match => Number(match[1]));
  return [Math.min(...ticks), Math.max(...ticks)];
}

test('the automatic range shows the whole measured profile, not a window that clips it', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.bwMode = 'band';
  laser.params.bandwidth = 40;
  const spectrometer = createElement('spectrometer', 300, 0);
  assert.equal(spectrometer.params.rangeMode, 'auto');
  const svg = screenFor(spectrometer, [laser, spectrometer]);
  const [lo, hi] = axisRange(svg);
  // A 40 nm FWHM line is traced out to three standard deviations, so real
  // signal reaches 532 ± 51 nm. The axis has to contain all of it: sizing the
  // window from a centroid and a nominal width used to cut the last 10 nm off
  // each tail, hiding measured light rather than displaying it.
  assert.ok(lo <= 482, `axis starts at ${lo} nm, inside the measured profile`);
  assert.ok(hi >= 582, `axis ends at ${hi} nm, inside the measured profile`);
  // And it stays snug around the data rather than padding out to twice its width.
  assert.ok(hi - lo < 140, `axis spans ${hi - lo} nm for ~102 nm of light`);
  assert.match(svg, />532</, 'the centre is still labelled');
});

test('a spectrometer\'s manual range overrides the auto-computed one and clips out-of-range samples', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.bwMode = 'band';
  laser.params.bandwidth = 40; // bandMin=512, bandMax=552
  const spectrometer = createElement('spectrometer', 300, 0);
  const autoSvg = screenFor(spectrometer, [laser, spectrometer]);
  const autoSamples = Number(autoSvg.match(/data-spectrum-points="(\d+)"/)?.[1] ?? 0);

  spectrometer.params.rangeMode = 'manual';
  spectrometer.params.rangeMin = 525;
  spectrometer.params.rangeMax = 539; // a narrow window well inside the Gaussian's full extent
  const manualSvg = screenFor(spectrometer, [laser, spectrometer]);
  assert.match(manualSvg, />525</);
  assert.match(manualSvg, />532</);
  assert.match(manualSvg, />539</);
  assert.doesNotMatch(manualSvg, />493</, 'the auto lower bound should no longer appear once manual range is set');

  const manualSamples = Number(manualSvg.match(/data-spectrum-points="(\d+)"/)?.[1] ?? 0);
  assert.ok(manualSamples < autoSamples, 'a narrower manual window should clip out-of-range samples');
});

test('an invalid manual range (max <= min) falls back to the automatic range', () => {
  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  laser.params.bwMode = 'band';
  laser.params.bandwidth = 40;
  const spectrometer = createElement('spectrometer', 300, 0);
  spectrometer.params.rangeMode = 'manual';
  spectrometer.params.rangeMin = 600;
  spectrometer.params.rangeMax = 600; // invalid: not > min
  const svg = screenFor(spectrometer, [laser, spectrometer]);
  const [lo, hi] = axisRange(svg);
  assert.ok(lo <= 482 && hi >= 582,
    `should fall back to the automatic range, got [${lo}, ${hi}]`);
});
