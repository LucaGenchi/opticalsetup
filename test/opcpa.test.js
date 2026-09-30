// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Optical parametric chirped-pulse amplification with the OPA element: pump
// and seed timed as they arrive (stretched or compressed on the way), a
// chirped seed's wavelengths meeting the pump at their own times, and the
// amplified signal keeping the seed's chirp so a compressor recompresses it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceScene, opaReading, probeBeamsAt } from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';
import { arrivingPulse, planOpa, seedSlices, slicePulse, opaSettings, PHASE_KEPT_WINDOW_RATIO } from '../sketch/js/opa.js';
import { gaussianPulseDurationAfterGDD } from '../sketch/js/glass.js';
import { spectrumSupport, spectrumWeight, transformLimitedDurationFs } from '../sketch/js/spectrum.js';
import { quadraticPhasePulse } from '../sketch/js/pulse-field.js';

// The transform of a power spectrum (per nm) with a quadratic phase: an
// independent route to the durations the tracer reports.
function transformOf(spec, gddFs2) {
  const [lo, hi] = spectrumSupport(spec);
  const density = nm => Math.max(0, spectrumWeight(spec, nm));
  return { limit: quadraticPhasePulse(density, lo, hi, 0).transformLimitFs, stretched: quadraticPhasePulse(density, lo, hi, gddFs2).durationFs };
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tolerance ${tol})`);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

// 800 nm, 30 nm seed: transform limit 31.38 fs.
const TL_FS = transformLimitedDurationFs(30, 800, 'gauss');
const STRETCH = 20000;

function laser(y, wavelength, avgPowerW, extra = {}) {
  const l = createElement('pulsedlaser', 0, y);
  Object.assign(l.params, { wavelength, avgPowerW, repRateMHz: 0.001, pulseWidthFs: 300, beamMode: 'line', ...extra });
  return l;
}
const chirpedSeed = (watts = 1e-3, gdd = STRETCH) => laser(18, 800, watts,
  { transformLimited: false, bandwidth: 30, inputChirp: gdd < 0 ? 'negative' : 'positive', chirpGddFs2: Math.abs(gdd) });
const compressor = (x, y, gddFs2) => {
  const c = createElement('pulsecompressor', x, y);
  Object.assign(c.params, { gddFs2, transEff: 100 });
  return c;
};
function probe(x, y) {
  const p = createElement('probe', x, y);
  p.params.prop = 'duration';
  return p;
}
function meter(x, y) {
  const m = createElement('powermeter', x, y);
  m.params.aperture = 10;
  return m;
}
// Pump into the upper rear port, seed into the lower one; the OPA at (300, 0)
// sends its signal out at y = 18, through a compressor at x = 420 undoing the
// seed's stretch, to probes before (380) and after (470) it.
function bench({ pumpFs = 1000, seed = chirpedSeed(), stretcher = null, opaParams = {}, compressGdd = -STRETCH, extra = [] } = {}) {
  const pump = laser(-18, 532, 1, { transformLimited: true, pulseWidthFs: pumpFs });
  const opa = createElement('opa', 300, 0);
  Object.assign(opa.params, { signalWl: 800, gainBandwidthNm: 80, smallSignalGainDb: 40, maxDepletion: 0.5, outputPump: false, outputIdler: false, ...opaParams });
  const before = probe(380, 18), after = probe(470, 18);
  const elements = [pump, seed, stretcher, opa, before, compressor(420, 18, compressGdd), after, ...extra].filter(Boolean);
  traceScene(elements, []);
  const signalAt = p => probeBeamsAt(p.x, p.y).filter(b => Math.abs(b.power - 1) > 1e-9);
  return { plan: opaReading(opa.id), before: signalAt(before), after: signalAt(after), elements };
}

test('slices of a chirped Gaussian seed add up to its stretched envelope', () => {
  const pulse = { repRateMHz: 1, pulseWidthFs: 1767, phaseNs: 0, centerWavelengthNm: 800 };
  const arrival = { pulse, chirp: { tau0Fs: TL_FS, gddFs2: STRETCH, centreNm: 800 } };
  const settings = opaSettings({ signalWl: 800, gainBandwidthNm: 400 });
  const slices = seedSlices(settings, { wl: 800, bw: 30, spec: null }, 401);
  const envelope = t => slices.reduce((sum, s) => {
    const p = slicePulse(arrival, s.wl);
    const c = p.phaseNs * 1e6;
    return sum + s.fraction * Math.exp(-4 * Math.LN2 * ((t - c) / p.pulseWidthFs) ** 2) / p.pulseWidthFs;
  }, 0);
  const peak = envelope(0);
  let lo = 0, hi = 5000;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (envelope(mid) > peak / 2) lo = mid; else hi = mid; }
  const expected = gaussianPulseDurationAfterGDD(TL_FS, STRETCH);
  assert.ok(rel(2 * lo, expected) < 0.01, `summed FWHM ${2 * lo} vs chirped ${expected}`);
  // Positive chirp: the red end leads.
  assert.ok(slicePulse(arrival, 820).phaseNs < 0 && slicePulse(arrival, 780).phaseNs > 0);
  // Without a known chirp every slice keeps the whole envelope.
  assert.equal(slicePulse({ pulse, chirp: null }, 820), pulse);
});

test('a stretcher in front of the OPA counts: same plan as the same chirp set on the source', () => {
  const onSource = bench();
  const tl = laser(18, 800, 1e-3, { transformLimited: true, pulseWidthFs: TL_FS });
  const viaStretcher = bench({ seed: tl, stretcher: compressor(100, 18, STRETCH) });
  const a = onSource.plan.seeds[0], b = viaStretcher.plan.seeds[0];
  assert.equal(a.state, 'amplifying');
  assert.equal(b.state, 'amplifying');
  near(b.arrivingPulse.pulseWidthFs, gaussianPulseDurationAfterGDD(TL_FS, STRETCH), 1e-6, 'stretched duration');
  assert.ok(rel(b.gainW, a.gainW) < 1e-6, `${b.gainW} vs ${a.gainW}`);
  assert.ok(rel(viaStretcher.plan.conversion, onSource.plan.conversion) < 1e-6);
  near(b.chirp.gddFs2, STRETCH, 1e-6);
});

test('a pump shorter than the stretched seed narrows the amplified band; the compressor recompresses it to its own limit', () => {
  const short = bench({ seed: chirpedSeed(1e-12), pumpFs: 1000 });
  const long = bench({ seed: chirpedSeed(1e-12), pumpFs: 20000 });
  const s = short.plan.seeds[0], l = long.plan.seeds[0];
  assert.ok(s.phaseKept && l.phaseKept);
  assert.ok(s.signal.bw < 0.6 * l.signal.bw, `short pump ${s.signal.bw} nm vs long pump ${l.signal.bw} nm`);
  assert.ok(l.signal.bw > 0.85 * 30, 'a long pump amplifies nearly the whole band');
  for (const [{ after, before }, seed] of [[short, s], [long, l]]) {
    assert.equal(after.length, 1);
    const { limit, stretched } = transformOf(seed.signal.spec, STRETCH);
    near(after[0].pulse.durationFs, limit, 1e-6 * limit, 'recompressed to the amplified spectrum\'s transform limit');
    near(before[0].pulse.durationFs, stretched, 1e-6 * stretched, 'stretched before the compressor');
  }
  assert.ok(short.after[0].pulse.durationFs > 2 * TL_FS && long.after[0].pulse.durationFs < 1.2 * TL_FS);
});

test('a saturated stage flattens the amplified spectrum; its duration is that spectrum\'s transform, not a Gaussian guess', () => {
  const { plan, after } = bench({ seed: chirpedSeed(1e-5, 100000), pumpFs: 30000, compressGdd: -100000,
    opaParams: { gainBandwidthNm: 100, smallSignalGainDb: 60, maxDepletion: 0.3 } });
  const seed = plan.seeds[0];
  assert.ok(seed.saturated && seed.phaseKept);
  assert.ok(seed.signal.bw > 30, `saturation widens the FWHM: ${seed.signal.bw} nm`);
  const { limit } = transformOf(seed.signal.spec, 100000);
  near(after[0].pulse.durationFs, limit, 1e-6 * limit);
  // A flat top of that FWHM is well longer than a Gaussian of the same FWHM.
  assert.ok(limit > 1.3 * transformLimitedDurationFs(seed.signal.bw, seed.signal.wl, 'gauss'));
});

test('a gain window shorter than a few transform limits leaves the signal phase unknown, as before', () => {
  // A 300 fs transform-limited seed and a 300 fs pump: the window is ~130 fs.
  const { plan, after } = bench({ seed: laser(18, 800, 1e-3, { transformLimited: true, pulseWidthFs: 300 }), pumpFs: 300, compressGdd: -2000 });
  const seed = plan.seeds[0];
  assert.equal(seed.state, 'amplifying');
  assert.ok(seed.gainWindowFs < PHASE_KEPT_WINDOW_RATIO * seed.chirp.tau0Fs);
  assert.equal(seed.phaseKept, false);
  assert.equal(after[0].pulse.durationFs, null);
  assert.match(after[0].pulse.durationIssue, /phase unknown/i);
});

test('watts still add up at the detectors with a stretched seed', () => {
  const pump = laser(-18, 532, 1, { transformLimited: true, pulseWidthFs: 1000 });
  const seed = chirpedSeed(1e-3);
  const opa = createElement('opa', 300, 0);
  Object.assign(opa.params, { signalWl: 800, gainBandwidthNm: 80, smallSignalGainDb: 40, maxDepletion: 0.5 });
  const meters = [meter(450, -18), meter(450, 0), meter(450, 18)];
  const elements = [pump, seed, opa, ...meters];
  traceScene(elements, []);
  const total = meters.reduce((sum, m) => sum + (enhancedReading(m, elements)?.detectedPowerW ?? 0), 0);
  near(total, 1 + 1e-3, 1e-9, 'pump + seed in = residual pump + idler + signal out');
  assert.ok(opaReading(opa.id).conversion > 0.3);
});

test('an input whose duration here cannot be stated is not amplified on a guess', () => {
  const pump = { key: 'p', wl: 532, powerW: 1, opl: 0, pulse: { repRateMHz: 1, pulseWidthFs: 1000, phaseNs: 0, transformLimited: true } };
  const unknown = { repRateMHz: 1, pulseWidthFs: 500, phaseNs: 0, spectralPhase: 'unknown', bandwidthNm: 10, centerWavelengthNm: 800 };
  const seed = { key: 's', wl: 800, bw: 0, powerW: 1e-3, opl: 0, pulse: unknown };
  // Undispersed, the configured duration stands; dispersed, it cannot be stated.
  assert.equal(planOpa({ signalWl: 800 }, { pump, seeds: [seed] }).seeds[0].state, 'amplifying');
  const dispersed = planOpa({ signalWl: 800 }, { pump, seeds: [{ ...seed, gddFs2: 5000 }] });
  assert.equal(dispersed.seeds[0].state, 'durationUnavailable');
  assert.equal(dispersed.seeds[0].gainW, 0);
  assert.match(dispersed.seeds[0].durationIssue, /phase unknown/i);
  assert.equal(dispersed.pumpOutW, 1);
  const pumpUnknown = planOpa({ signalWl: 800 }, { pump: { ...pump, pulse: { ...unknown, centerWavelengthNm: 532 }, gddFs2: 5000 }, seeds: [seed] });
  assert.equal(pumpUnknown.state, 'pumpDurationUnavailable');
  assert.ok(arrivingPulse({ ...seed, gddFs2: 5000 }).issue);
});

test('a second stage is seeded by the first stage\'s chirped signal and slices it the same way', () => {
  // Stage 1 at (300, 0) sends its signal along y = 18 into stage 2's seed
  // port; stage 2 has its own pump laser, timed onto the seed from the delay
  // the first trace reports, as a user would set it.
  const pump1 = laser(-18, 532, 1, { transformLimited: true, pulseWidthFs: 3000 });
  const seed = chirpedSeed(1e-9);
  const stage1 = createElement('opa', 300, 0);
  Object.assign(stage1.params, { signalWl: 800, gainBandwidthNm: 80, smallSignalGainDb: 30, maxDepletion: 0.5, outputPump: false, outputIdler: false });
  const pump2 = createElement('pulsedlaser', 440, -18);
  Object.assign(pump2.params, { wavelength: 532, avgPowerW: 1, repRateMHz: 0.001, pulseWidthFs: 3000, beamMode: 'line', transformLimited: true });
  const stage2 = createElement('opa', 620, 0);
  Object.assign(stage2.params, { signalWl: 800, gainBandwidthNm: 80, smallSignalGainDb: 30, maxDepletion: 0.5, outputPump: false, outputIdler: false });
  traceScene([pump1, seed, stage1, pump2, stage2], []);
  pump2.params.pulsePhaseNs = opaReading(stage2.id).seeds[0].skewNs;
  traceScene([pump1, seed, stage1, pump2, stage2], []);
  const one = opaReading(stage1.id), two = opaReading(stage2.id);
  assert.equal(one.seeds[0].state, 'amplifying');
  assert.ok(one.seeds[0].phaseKept);
  const amplified = two.seeds.find(s => s.chirp && s.seedW > 1e-8);
  assert.ok(amplified, 'stage 2 sees stage 1\'s signal as a chirped seed');
  assert.equal(amplified.state, 'amplifying');
  near(amplified.chirp.gddFs2, STRETCH, 1e-6, 'the stretch carried through stage 1');
  assert.ok(amplified.signal.bw <= one.seeds[0].signal.bw * (1 + 1e-9), 'gain narrowing does not reverse');
});
