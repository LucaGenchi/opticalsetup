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
import {
  arrivingPulse, chirpedSignalPulse, planOpa, seedSlices, slicePulse, opaSettings, MAX_GATE_BANDWIDTH_RATIO, PATHS_DIFFER,
} from '../sketch/js/opa.js';
import { gaussianPulseDurationAfterGDD, pulseDurationAfterDispersion } from '../sketch/js/glass.js';
import { gaussianSpectrum, spectrumSupport, spectrumWeight, transformLimitedDurationFs } from '../sketch/js/spectrum.js';
import { fft, quadraticPhasePulse } from '../sketch/js/pulse-field.js';

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
    const { limit, stretched } = transformOf(seed.amplifiedProfile, STRETCH);
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
  const { limit } = transformOf(seed.amplifiedProfile, 100000);
  near(after[0].pulse.durationFs, limit, 1e-6 * limit);
  // A flat top of that FWHM is well longer than a Gaussian of the same FWHM.
  assert.ok(limit > 1.3 * transformLimitedDurationFs(seed.signal.bw, seed.signal.wl, 'gauss'));
});

test('a gain window shorter than a few transform limits leaves the signal phase unknown, as before', () => {
  // A 300 fs transform-limited seed and a 300 fs pump: the window is ~130 fs.
  const { plan, after } = bench({ seed: laser(18, 800, 1e-3, { transformLimited: true, pulseWidthFs: 300 }), pumpFs: 300, compressGdd: -2000 });
  const seed = plan.seeds[0];
  assert.equal(seed.state, 'amplifying');
  assert.ok(seed.gateBandRatio > MAX_GATE_BANDWIDTH_RATIO, `${seed.gateBandRatio}`);
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
  Object.assign(stage1.params, { signalWl: 800, gainBandwidthNm: 80, smallSignalGainDb: 40, maxDepletion: 0.5, outputPump: false, outputIdler: false });
  const pump2 = createElement('pulsedlaser', 440, -18);
  Object.assign(pump2.params, { wavelength: 532, avgPowerW: 1, repRateMHz: 0.001, pulseWidthFs: 3000, beamMode: 'line', transformLimited: true });
  const stage2 = createElement('opa', 620, 0);
  Object.assign(stage2.params, { signalWl: 800, gainBandwidthNm: 80, smallSignalGainDb: 40, maxDepletion: 0.5, outputPump: false, outputIdler: false });
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

// ---- The domain in which the signal keeps the seed's phase, checked against
// the field amplified coherently: an undepleted, phase-matched seeded OPA
// multiplies the seed's field by cosh(Gamma L sqrt(I_p(t)/I_peak)); the
// amplified part is that minus the seed. Its compressed duration (the seed's
// GDD removed) is compared with the model's.
function coherentCompressedFs({ lam0, bwNm, gdd, taupFs, G0, delayFs = 0, whole = false }) {
  const N = 1 << 15;
  const tau0 = transformLimitedDurationFs(bwNm, lam0, 'gauss');
  const stretched = gaussianPulseDurationAfterGDD(tau0, gdd);
  const dt = 12 * Math.max(taupFs, stretched, 2 * Math.abs(delayFs)) / N;
  const dOmega = 2 * Math.PI * 299.792458 * bwNm / (lam0 * lam0);
  const dW = 2 * Math.PI / (N * dt), W = k => (k < N / 2 ? k : k - N) * dW;
  const re = new Float64Array(N), im = new Float64Array(N);
  const phase = sign => { for (let k = 0; k < N; k++) {
    const p = sign * gdd * W(k) ** 2 / 2, c = Math.cos(p), s = Math.sin(p);
    const r = re[k] * c - im[k] * s; im[k] = re[k] * s + im[k] * c; re[k] = r;
  } };
  for (let k = 0; k < N; k++) re[k] = Math.exp(-2 * Math.LN2 * W(k) ** 2 / dOmega ** 2);
  phase(1);
  fft(re, im, true);
  const gammaL = Math.acosh(Math.sqrt(G0));
  for (let j = 0; j < N; j++) {
    const t = (j < N / 2 ? j : j - N) * dt;
    const g = Math.cosh(gammaL * Math.exp(-2 * Math.LN2 * ((t - delayFs) / taupFs) ** 2)) - (whole ? 0 : 1);
    re[j] *= g; im[j] *= g;
  }
  fft(re, im, false);
  phase(-1);
  fft(re, im, true);
  const I = Array.from({ length: N }, (_, j) => { const i = (j + N / 2) % N; return re[i] ** 2 + im[i] ** 2; });
  const peak = Math.max(...I), half = peak / 2;
  const first = I.findIndex(v => v >= half), last = N - 1 - [...I].reverse().findIndex(v => v >= half);
  // Crossings interpolated between samples.
  const at = (i, j) => i + (half - I[i]) / (I[j] - I[i]) * (j - i);
  return (at(last + 1, last) - at(first - 1, first)) * dt;
}
function modelSeed({ lam0, bwNm, gdd, taupFs, G0, delayFs = 0, sech2 = false }) {
  const tau0 = transformLimitedDurationFs(bwNm, lam0, 'gauss');
  const pump = { key: 'p', wl: 532, powerW: 1, opl: 0, pulse: { repRateMHz: 0.001, pulseWidthFs: taupFs, phaseNs: delayFs * 1e-6, transformLimited: true } };
  const seed = { key: 's', wl: lam0, bw: bwNm, spec: gaussianSpectrum(lam0, bwNm), powerW: 1e-15, opl: 0,
    pulse: { repRateMHz: 0.001, pulseWidthFs: gaussianPulseDurationAfterGDD(tau0, gdd), phaseNs: 0, transformLimited: false,
      bandwidthNm: bwNm, centerWavelengthNm: lam0, inputGddFs2: gdd, transformLimitFs: tau0, spectrumKind: 'gauss', pulseShape: sech2 ? 'sech2' : 'gauss' } };
  const plan = planOpa({ signalWl: lam0, gainBandwidthNm: 5000, smallSignalGainDb: 10 * Math.log10(G0), maxDepletion: 1 }, { pump, seeds: [seed] });
  const s = plan.seeds[0];
  const out = s.phaseKept ? chirpedSignalPulse(seed.pulse, s.signal, gdd, s.amplifiedProfile) : null;
  return { seed: s, record: seed, compressedFs: out ? pulseDurationAfterDispersion(out, -gdd, 0)?.durationFs : null };
}
const chirpFor = (tau0, stretch) => tau0 * tau0 / (4 * Math.LN2) * Math.sqrt(stretch * stretch - 1);

// The coherent reference has two readings below high gain: the field's
// excess over the seed, (cosh - 1) E, and the whole output field, cosh E. The
// model's gain beam is compared with both; the domain requires a gain at
// which they agree.
test('inside its declared domain the model recompresses within 7 % of the coherently amplified field', () => {
  const lam0 = 800, bwNm = 10, tau0 = transformLimitedDurationFs(bwNm, lam0);
  const window = (R, G0) => R * tau0 * Math.sqrt(Math.acosh(Math.sqrt(G0)));
  // A cross-section of the 266 in-domain cases scanned (stretch x1-x100,
  // 20-60 dB, windows 3-60 tau0, pump delays 0-1.5 stretched FWHM; worst
  // 6.1 % against the excess, 5.5 % against the whole field).
  const cases = [[1, 1e4, 4, 0], [3, 1e4, 4, 0], [10, 1e4, 10, 0], [50, 1e4, 20, 0], [10, 1e4, 20, 0.5],
    [100, 1e4, 20, 0.5], [1, 1e6, 3, 1], [50, 1e6, 60, 0.5], [20, 1e4, 40, 0.25]];
  for (const [stretch, G0, R, delay] of cases) {
    const gdd = stretch === 1 ? 0 : chirpFor(tau0, stretch);
    const args = { lam0, bwNm, gdd, taupFs: window(R, G0), G0, delayFs: delay * gaussianPulseDurationAfterGDD(tau0, gdd) };
    const m = modelSeed(args);
    const label = `stretch ${stretch}, ${10 * Math.log10(G0)} dB, window ${R} tau0, delay ${delay}`;
    assert.ok(m.seed.phaseKept, `${label}: inside the domain`);
    for (const whole of [false, true]) {
      const ref = coherentCompressedFs({ ...args, whole });
      assert.ok(rel(m.compressedFs, ref) < 0.07, `${label}${whole ? ' (whole field)' : ''}: ${m.compressedFs} vs coherent ${ref}`);
    }
  }
  // Andrea's counterexamples (#200): a pump on the seed's wing, 16.5 % off,
  // and a 20 dB stage, 12.6 % off. Both are now outside the domain.
  const wing = modelSeed({ lam0, bwNm, gdd: 159806.116, taupFs: 4334.069, G0: 1e4, delayFs: 4707.257 });
  const low = modelSeed({ lam0, bwNm, gdd: chirpFor(tau0, 50), taupFs: window(20, 100), G0: 100 });
  for (const m of [wing, low]) {
    assert.equal(m.seed.state, 'amplifying');
    assert.equal(m.seed.phaseKept, false);
    assert.ok(m.seed.gateBandRatio <= MAX_GATE_BANDWIDTH_RATIO, 'refused by gain or centring, not by the gate');
  }
  // Gated too fast for the slices -- where they are 18 % or more off -- the
  // signal's phase is declared unknown instead.
  for (const [stretch, R] of [[1, 2], [50, 3], [50, 10]]) {
    const m = modelSeed({ lam0, bwNm, gdd: stretch === 1 ? 0 : chirpFor(tau0, stretch), taupFs: window(R, 1e4), G0: 1e4 });
    assert.equal(m.seed.phaseKept, false, `stretch ${stretch}, window ${R} tau0`);
    assert.ok(m.seed.gateBandRatio > MAX_GATE_BANDWIDTH_RATIO);
  }
});

test('a pump that arrives late amplifies the wavelengths that arrive late, on either sign of chirp', () => {
  const lam0 = 800, bwNm = 30, G0 = 1e4, tau0 = transformLimitedDurationFs(bwNm, lam0);
  const gdd = chirpFor(tau0, 50);
  for (const sign of [1, -1]) {
    const centred = modelSeed({ lam0, bwNm, gdd: sign * gdd, taupFs: 3000, G0 });
    const late = modelSeed({ lam0, bwNm, gdd: sign * gdd, taupFs: 3000, G0, delayFs: 500 });
    near(centred.seed.signal.wl, lam0, 0.5, 'centred pump: centred band (the mapping is linear in frequency, not wavelength)');
    // Positive chirp puts the blue end last; negative, the red end.
    assert.ok(sign > 0 ? late.seed.signal.wl < lam0 - 1 : late.seed.signal.wl > lam0 + 1, `chirp ${sign}: ${late.seed.signal.wl} nm`);
    // The amplified light sits at the centre of seed x gain window: between
    // the seed's centre and the pump's, nearer the narrower of the two.
    const W = late.seed.gainWindowFs, S = late.seed.arrivingPulse.pulseWidthFs;
    const expected = 500 * (1 / W ** 2) / (1 / W ** 2 + 1 / S ** 2);
    assert.ok(rel(late.seed.signalDelayFs, expected) < 0.1, `delay ${late.seed.signalDelayFs} fs vs ${expected} fs`);
    assert.ok(Math.abs(centred.seed.signalDelayFs) < 0.02 * S, `centred: ${centred.seed.signalDelayFs} fs`);
  }
  // Traced: a negatively chirped seed recompresses with positive GDD.
  const { after, plan } = bench({ seed: chirpedSeed(1e-12, -STRETCH), compressGdd: STRETCH });
  assert.ok(plan.seeds[0].phaseKept);
  const { limit } = transformOf(plan.seeds[0].amplifiedProfile, -STRETCH);
  near(after[0].pulse.durationFs, limit, 1e-6 * limit);
});

test('the time mapping is refused where it does not hold, and so is a beam whose rays disagree', () => {
  const tl = transformLimitedDurationFs(10, 800, 'sech2');
  const sech2 = gdd => ({ key: 's', wl: 800, bw: 10, spec: gaussianSpectrum(800, 10), powerW: 1e-6, opl: 0,
    pulse: { repRateMHz: 1, pulseWidthFs: gaussianPulseDurationAfterGDD(tl, gdd), phaseNs: 0, transformLimited: false, bandwidthNm: 10,
      centerWavelengthNm: 800, inputGddFs2: gdd, transformLimitFs: tl, spectrumKind: 'gauss', pulseShape: 'sech2' } });
  // A sech² pulse is mapped only once strongly chirped.
  assert.equal(arrivingPulse(sech2(500)).chirp, null);
  assert.ok(arrivingPulse(sech2(200000)).chirp);
  // A flat band's sweep is an assumption, not a known phase.
  const flat = { key: 'f', wl: 600, bw: 200, spec: { kind: 'flat', lo: 500, hi: 700 }, powerW: 1e-6, opl: 0,
    pulse: { repRateMHz: 1, pulseWidthFs: 1000, phaseNs: 0, spectrumKind: 'flat', spectrumLoNm: 500, spectrumHiNm: 700, transformLimitFs: 5, bandwidthNm: 200, centerWavelengthNm: 600 } };
  assert.equal(arrivingPulse({ ...flat, gddFs2: 1000 }).chirp, null);
  // Rays of one beam through different amounts of glass are not one pulse.
  const seed = sech2(0);
  const split = arrivingPulse({ ...seed, gddFs2: 20000, gddRange: [0, 40000] });
  assert.equal(split.issue, PATHS_DIFFER);
  assert.equal(arrivingPulse({ ...seed, gddFs2: 20000.001, gddRange: [20000, 20000.002] }).issue, null);
});

test('an amplified band narrower than the slicing resolves leaves the phase unknown', () => {
  // A 30 nm seed stretched to ~0.9 ns and a 20 ps pump: the gate is slow
  // enough, but the amplified band is a fraction of one slice.
  const tau0 = transformLimitedDurationFs(30, 800);
  const m = modelSeed({ lam0: 800, bwNm: 30, gdd: 1e7, taupFs: 20000, G0: 1e4 });
  assert.ok(m.seed.chirp && m.seed.state === 'amplifying');
  assert.ok(m.seed.gateBandRatio <= MAX_GATE_BANDWIDTH_RATIO, `${m.seed.gateBandRatio}`);
  assert.equal(m.seed.phaseKept, false);
  assert.ok(tau0 > 0);
});

test('the OPCPA example: stretched, amplified and recompressed, as its probes read it', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseSketch } = await import('../sketch/js/state.js');
  const { registry } = await import('../sketch/js/elements.js');
  const elements = parseSketch(readFileSync(new URL('../Examples/Ultrashort Pulses/OPCPA — stretch, amplify, recompress.json', import.meta.url), 'utf8')).elements;
  traceScene(elements, []);
  const plan = opaReading(elements.find(e => e.type === 'opa').id);
  const seed = plan.seeds[0];
  assert.equal(seed.state, 'amplifying');
  assert.ok(seed.phaseKept, 'the example sits inside the domain where the signal keeps the seed\'s chirp');
  assert.ok(plan.conversion > 0.05 && plan.conversion < 0.5, `${plan.conversion}`);
  const rows = el => [...registry.probe.svg(el, elements).matchAll(/>([^<>]*· [^<>]*)</g)].map(m => m[1]);
  const probes = elements.filter(e => e.type === 'probe' && e.params.prop === 'duration').sort((a, b) => a.x - b.x);
  // Before the OPA: one beam, stretched from 31 fs to ~9 ps.
  assert.ok(probes[1].x < 500 && /ps/.test(registry.probe.svg(probes[1], elements)));
  // After the compressor: one beam -- the OPA's output, the seed it passed on
  // and the gain it added -- recompressed, with both parts' watts.
  const after = rows(probes.at(-1));
  assert.deepEqual(after.length, 1, `${after}`);
  assert.match(after[0], /· 41\.\d fs · 670 mW$/);
  // A time view reads it as one train as well.
  probes.at(-1).params.prop = 'time';
  const time = registry.probe.svg(probes.at(-1), elements);
  assert.match(time, /one beam: OPA output \(seed \+ gain\)/);
  assert.equal(time.match(/data-probe-time-delay-ns/g)?.length, 1, 'one pulse train drawn');
});

test('at low gain the OPA output reads as one beam whose duration is not stated', async () => {
  const { registry } = await import('../sketch/js/elements.js');
  // 10 dB peak: the seed passed on is a large part of the output.
  const { elements } = bench({ seed: chirpedSeed(1e-3), opaParams: { smallSignalGainDb: 10 } });
  const after = elements.find(e => e.type === 'probe' && e.x === 470);
  const rows = [...registry.probe.svg(after, elements).matchAll(/>([^<>]*· [^<>]*)</g)].map(m => m[1]);
  assert.equal(rows.length, 1, `${rows}`);
  assert.match(rows[0], /· Unavailable · /);
});

test('the duration view ranks every beam by watts before it cuts the list, whatever the source order', async () => {
  const { registry } = await import('../sketch/js/elements.js');
  const make = (fs, watts) => laser(0, 800, watts, { transformLimited: true, pulseWidthFs: fs, repRateMHz: 80 });
  for (const order of [[0, 1, 2], [1, 0, 2], [2, 1, 0]]) {
    const lasers = [make(300, 1e-3), make(300, 1), make(500, 1e-2)];
    const p = probe(200, 0);
    const elements = [...order.map(i => lasers[i]), p];
    traceScene(elements, []);
    const rows = [...registry.probe.svg(p, elements).matchAll(/>([^<>]*· [^<>]*)</g)].map(m => m[1]);
    assert.equal(rows.length, 2, `order ${order}`);
    assert.match(rows[0], /· 300 fs · 1.00 W$/, `order ${order}`);
    assert.match(rows[1], /· 500 fs · 10.0 mW$/, `order ${order}`);
  }
});

// An OPA whose amplified output leaves along y = 200 from x = 206 (the
// Mach-Zehnder fixture's input) or y = 18 (the bench), high gain, the seed
// stretched so the signal keeps its chirp.
function opaFeeding(y) {
  const pump = laser(y - 36, 532, 1, { transformLimited: true, pulseWidthFs: 3000, repRateMHz: 80 });
  const seed = laser(y, 800, 1e-9, { transformLimited: false, bandwidth: 30, inputChirp: 'positive', chirpGddFs2: STRETCH, repRateMHz: 80 });
  pump.x = seed.x = -300;
  const opa = createElement('opa', 150, y - 18);
  Object.assign(opa.params, { signalWl: 800, gainBandwidthNm: 80, smallSignalGainDb: 40, maxDepletion: 0.5, outputPump: false, outputIdler: false });
  return [pump, seed, opa];
}

test('an OPA output split into two delayed arms reads as two beams, each one OPA output', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseSketch } = await import('../sketch/js/state.js');
  const { registry } = await import('../sketch/js/elements.js');
  const scene = parseSketch(readFileSync(new URL('./fixtures/mach-zehnder.json', import.meta.url), 'utf8'), registry);
  const bench = scene.elements.filter(e => !['camera', 'display', 'textlabel', 'cwlaser'].includes(e.type));
  bench.find(e => e.type === 'delayline').params.delayMm = 3; // 10 ps between the arms
  const p = probe(700, 400);
  const elements = [...opaFeeding(200), ...bench, p];
  traceScene(elements, []);
  assert.ok(opaReading(elements[2].id).seeds[0].phaseKept);
  assert.equal(probeBeamsAt(700, 400, 5).length, 4, 'seed and gain on each of two arms');
  // Duration: each arm's seed and gain are one beam; the two arms have one
  // duration, so they share a row -- never "Unavailable" from counting the
  // other arm's gain as this arm's weak part (Andrea, #200).
  const rows = [...registry.probe.svg(p, elements).matchAll(/>([^<>]*· [^<>]*)</g)].map(m => m[1]);
  assert.equal(rows.length, 1, `${rows}`);
  assert.doesNotMatch(rows[0], /Unavailable/);
  // Time: two trains, 10 ps apart.
  p.params.prop = 'time';
  const time = registry.probe.svg(p, elements);
  assert.match(time, /data-probe-timing="delayed"/);
  assert.equal(time.match(/data-probe-time-delay-ns/g)?.length, 2);
});

test('an OPA output stays one beam through a fiber', async () => {
  const { registry } = await import('../sketch/js/elements.js');
  const p = probe(700, 18);
  const elements = [...opaFeeding(18), p];
  const cable = { id: 'fb', kind: 'fiber', pts: [{ x: 420, y: 18 }, { x: 600, y: 18 }], width: 20,
    propagate: true, lossDbPerM: 0, outMode: 'diverge', na: 0.01 };
  traceScene(elements, [cable]);
  const beams = probeBeamsAt(700, 18, 5);
  assert.equal(beams.length, 2, 'the seed and the gain, relaunched');
  assert.ok(beams.every(b => b.opaSignalOf) && beams[0].opaSignalOf === beams[1].opaSignalOf, 'one identity');
  const rows = [...registry.probe.svg(p, elements).matchAll(/>([^<>]*· [^<>]*)</g)].map(m => m[1]);
  assert.equal(rows.length, 1, `${rows}`);
});
