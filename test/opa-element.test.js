// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The integrated OPA element: its data-sheet settings (sketch/js/opa.js)
// mapped onto the reviewed parametric core, and its behaviour in traced
// scenes -- watts that add up at real detectors, the Manley-Rowe split, the
// ports and their switches, timing, a broadband seed, sampling and saving.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceScene, opaReading, probeAt } from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';
import { parseSketch } from '../sketch/js/state.js';
import { opaGainAt, opaSettings, planOpa, gammaLForGain, seedSlices } from '../sketch/js/opa.js';
import { calculators } from '../tools/calculators-content.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b} (tolerance ${tol})`);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

// Pump into the upper rear port, seed into the lower one; the OPA at (300, 0)
// has its ports 18 mm off axis with the default aperture and beam size.
function laser(y, wavelength, avgPowerW, extra = {}) {
  const l = createElement('pulsedlaser', 0, y);
  Object.assign(l.params, { wavelength, avgPowerW, repRateMHz: 0.2, pulseWidthFs: 300, beamMode: 'line', ...extra });
  return l;
}
function opaElement(params = {}) {
  const el = createElement('opa', 300, 0);
  Object.assign(el.params, { signalWl: 780, gainBandwidthNm: 40, smallSignalGainDb: 40, maxDepletion: 0.5, ...params });
  return el;
}
function meter(y) {
  const m = createElement('powermeter', 450, y);
  m.params.aperture = 10;
  return m;
}
// Trace a bench and read the three output meters in watts.
function bench({ pump = laser(-18, 515, 1), seed = laser(18, 780, 1e-6), opa = opaElement(), extra = [] } = {}) {
  const meters = { pump: meter(-18), signal: meter(0), idler: meter(18) };
  const elements = [pump, seed, opa, ...Object.values(meters), ...extra].filter(Boolean);
  traceScene(elements, []);
  const watts = Object.fromEntries(Object.entries(meters).map(([k, m]) => [k, enhancedReading(m, elements)?.detectedPowerW ?? 0]));
  return { plan: opaReading(opa.id), watts, elements };
}

test('gain spectrum: the authored peak at the tuned wavelength, half the excess at half the bandwidth', () => {
  const s = opaSettings({ signalWl: 800, gainBandwidthNm: 40, smallSignalGainDb: 30 });
  near(opaGainAt(s, 800), 1000, 1e-9);
  near(opaGainAt(s, 820) - 1, 999 / 2, 1e-9, 'FWHM');
  near(opaGainAt(s, 780) - 1, 999 / 2, 1e-9, 'symmetric');
  // The equivalent Gamma L reproduces the gain through cosh^2.
  near(Math.cosh(gammaLForGain(1000)) ** 2, 1000, 1e-9);
  assert.equal(gammaLForGain(1), 0);
  // A narrow seed is one slice; a broad one is sliced inside the band only.
  assert.equal(seedSlices(s, { wl: 800, bw: 0, spec: null }).length, 1);
  const slices = seedSlices(s, { wl: 700, bw: 600, spec: { kind: 'flat', lo: 400, hi: 1000 } });
  assert.ok(slices.length > 3 && slices.every(x => Math.abs(x.wl - 800) < 120), 'only the part of the band that has gain');
});

test('amplifies the seed, makes the idler, and the watts add up at the detectors', () => {
  const { plan, watts } = bench();
  assert.equal(plan.state, 'amplifying');
  const seed = plan.seeds[0];
  assert.equal(seed.state, 'amplifying');
  near(seed.idlerWl, 1 / (1 / 515 - 1 / 780), 1e-9, 'energy conservation');
  assert.ok(seed.achievedGain > 100 && seed.achievedGain < 1e4, `pulse-averaged gain below the 40 dB peak: ${seed.achievedGain}`);
  // Pump in + seed in = residual pump + amplified signal + idler.
  near(watts.pump + watts.signal + watts.idler, 1 + 1e-6, 1e-12, 'energy');
  // Manley-Rowe: the idler gets lambda_s/lambda_i of the signal's gain.
  assert.ok(rel(watts.idler / (watts.signal - 1e-6), 780 / seed.idlerWl) < 1e-9);
  near(watts.signal, 1e-6 * seed.achievedGain, 1e-15, 'signal meter = seed x gain');
});

test('the depletion limit bounds what the pump can give, whatever the gain', () => {
  const { plan, watts } = bench({ seed: laser(18, 780, 0.01), opa: opaElement({ smallSignalGainDb: 100, maxDepletion: 0.3 }) });
  assert.ok(plan.seeds[0].saturated);
  assert.ok(plan.conversion <= 0.3 + 1e-12 && plan.conversion > 0.05, `${plan.conversion}`);
  near(watts.pump + watts.signal + watts.idler, 1.01, 1e-12);
});

test('no seed, no pump, a seed outside the band or shorter than the pump: no gain, and the reason', () => {
  let r = bench({ seed: null });
  assert.equal(r.plan.state, 'noSeed');
  near(r.watts.pump, 1, 1e-12, 'the pump passes through');
  assert.equal(r.watts.idler, 0);
  r = bench({ pump: null });
  assert.equal(r.plan.state, 'noPump');
  near(r.watts.signal, 1e-6, 1e-15, 'the seed passes through unchanged');
  r = bench({ seed: laser(18, 1000, 1e-6) });
  assert.equal(r.plan.seeds[0].state, 'outsideBand');
  near(r.watts.signal, 1e-6, 1e-15);
  r = bench({ seed: laser(18, 400, 1e-6) });
  assert.ok(['seedBelowPump', 'outsideBand'].includes(r.plan.seeds[0].state));
  near(r.watts.pump + r.watts.signal + r.watts.idler, 1 + 1e-6, 1e-12);
});

test('timing: a seed that misses the pump pulse is not amplified', () => {
  const late = laser(18, 780, 1e-6, { pulsePhaseNs: 0.01 }); // 10 ps after a 300 fs pump
  const { plan, watts } = bench({ seed: late });
  assert.equal(plan.seeds[0].state, 'unsynchronized');
  near(watts.signal, 1e-6, 1e-15);
  near(watts.pump, 1, 1e-12);
});

test('a CW seed gains only while the pump pulse is there', () => {
  const cw = createElement('cwlaser', 0, 18);
  Object.assign(cw.params, { wavelength: 780, avgPowerW: 1e-6, beamMode: 'line' });
  const pulsedSeed = bench().plan.seeds[0].achievedGain;
  const { plan } = bench({ seed: cw });
  assert.equal(plan.seeds[0].state, 'amplifying');
  assert.ok(plan.seeds[0].achievedGain < 1.01 && pulsedSeed > 100, `${plan.seeds[0].achievedGain}`);
});

test('a broadband seed: only the slice inside the gain band is amplified', () => {
  const sc = createElement('sclaser', 0, 18);
  Object.assign(sc.params, { scMin: 400, scMax: 1000, avgPowerW: 0.001, repRateMHz: 0.2, pulseWidthFs: 300, beamMode: 'line' });
  const { plan } = bench({ seed: sc });
  const seed = plan.seeds[0];
  assert.equal(seed.state, 'amplifying');
  near(seed.signal.wl, 780, 2, 'the gain slice is centred on the tuned wavelength');
  assert.ok(seed.signal.bw > 30 && seed.signal.bw < 60, `amplified width ${seed.signal.bw} nm, gain band 40 nm`);
  assert.ok(seed.idler.bw > seed.signal.bw * 3, 'the idler is wider in nm: (lambda_i/lambda_s)^2');
});

test('switching the idler or residual pump port off removes that light', () => {
  const opa = opaElement({ outputIdler: false, outputPump: false });
  const { watts } = bench({ opa });
  assert.equal(watts.idler, 0);
  assert.equal(watts.pump, 0);
  assert.ok(watts.signal > 1e-4);
});

test('a sampled pump beam gives the same watts as a single line', () => {
  const line = bench().watts;
  const beam = bench({ pump: laser(-18, 515, 1, { beamMode: 'beam', beamWidth: 4 }) }).watts;
  for (const k of ['pump', 'signal', 'idler']) assert.ok(rel(beam[k], line[k]) < 1e-9, `${k}: ${beam[k]} vs ${line[k]}`);
});

test('sources without a power setting cannot be amplified: the element says so', () => {
  const plan = planOpa({}, { pump: { key: 'p', wl: 515, powerW: null }, pumps: [{}], seeds: [{ key: 's', wl: 780, powerW: 1e-6 }] });
  assert.equal(plan.state, 'uncalibrated');
  assert.equal(planOpa({}, { pump: null, pumps: [{ key: 'a' }, { key: 'b' }], seeds: [] }).state, 'multiplePumps');
});

test('outputs are finite and drawn: the probe reads signal and idler behind the ports', () => {
  const { elements, plan } = bench();
  assert.equal(probeAt(400, 0, 3)?.wl, 780);
  near(probeAt(400, 18, 3)?.wl, plan.seeds[0].idlerWl, 1e-6);
  assert.ok(elements.every(e => e.x !== undefined));
  const values = JSON.stringify(plan, (k, v) => (k === 'record' ? undefined : v));
  assert.ok(!/NaN|Infinity/.test(values));
});

test('saved and reopened, the OPA keeps its settings; the registry links an existing calculator', () => {
  const el = opaElement({ signalWl: 1030, gainBandwidthNm: 25, smallSignalGainDb: 55, maxDepletion: 0.35, outputIdler: false });
  const [back] = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [el] }), registry).elements;
  for (const key of ['signalWl', 'gainBandwidthNm', 'smallSignalGainDb', 'maxDepletion', 'outputIdler']) assert.equal(back.params[key], el.params[key], key);
  assert.ok(calculators.some(c => c.slug === registry.opa.calculator));
});

test('the result does not depend on the order the sources are traced in', () => {
  const pump = laser(-18, 515, 1), seed = laser(18, 780, 1e-6), opa = opaElement();
  const meters = [meter(-18), meter(0), meter(18)];
  const read = order => {
    traceScene([...order, opa, ...meters], []);
    return meters.map(m => enhancedReading(m, [pump, seed, opa, ...meters])?.detectedPowerW ?? 0);
  };
  const a = read([pump, seed]), b = read([seed, pump]);
  a.forEach((w, k) => assert.ok(rel(b[k], w) < 1e-12, `${w} vs ${b[k]}`));
});

test('a pump-power scan: the conversion grows with the pump and saturates at the limit', () => {
  // The gain is authored at the pump's peak, so the pump power sets the
  // energy budget: a strong seed saturates a weak pump and not a strong one.
  let last = -1;
  for (const watts of [0.001, 0.01, 0.1, 1, 10]) {
    const { plan } = bench({ pump: laser(-18, 515, watts), seed: laser(18, 780, 0.001), opa: opaElement({ maxDepletion: 0.4 }) });
    const converted = plan.pumpInW - plan.pumpOutW;
    assert.ok(converted >= last - 1e-15, `converted power never falls as the pump grows (${watts} W)`);
    assert.ok(plan.conversion <= 0.4 + 1e-12);
    last = converted;
  }
});

// Andrea's reproductions against 11dbd8b: a 0.1 nm gain band inside a
// 400-1000 nm continuum was sampled on the seed's 9.4 nm grid, so tuning to
// 780 nm read 'outside the band' and 775 nm amplified a whole grid cell's
// power, with the seed's full 600 nm width.
function scSeed() {
  const sc = createElement('sclaser', 0, 18);
  Object.assign(sc.params, { scMin: 400, scMax: 1000, avgPowerW: 1e-6, repRateMHz: 0.2, pulseWidthFs: 300, beamMode: 'line' });
  return sc;
}
test('a narrow gain band inside a broad continuum is integrated wherever it is tuned', () => {
  const gains = [775, 777.3, 780, 781.9].map(signalWl => {
    const { plan, watts } = bench({ seed: scSeed(), opa: opaElement({ signalWl, gainBandwidthNm: 0.1 }) });
    const seed = plan.seeds[0];
    assert.equal(seed.state, 'amplifying', `${signalWl} nm`);
    // The amplified light has the band's width, not the continuum's.
    assert.ok(seed.signal.bw > 0.03 && seed.signal.bw < 0.2, `signal width ${seed.signal.bw} nm at ${signalWl} nm`);
    assert.ok(seed.idler.bw < 1, `idler width ${seed.idler.bw} nm`);
    near(watts.pump + watts.signal + watts.idler, 1 + 1e-6, 1e-12);
    return seed.gainW;
  });
  // A flat continuum: the same slice power wherever the band sits (the gain
  // itself changes slightly with wavelength through the idler, Gamma^2 ~ 1/(lambda_s lambda_i)).
  for (const g of gains) assert.ok(rel(g, gains[0]) < 0.02, `${g} vs ${gains[0]}`);
});

test('a monochromatic seed is one line: the amplified light is a line too', () => {
  const plan = planOpa({ signalWl: 780, gainBandwidthNm: 40, smallSignalGainDb: 40 },
    { pump: { key: 'p', wl: 515, bw: 0, powerW: 1 }, pumps: [{}], seeds: [{ key: 's', wl: 781, bw: 0, spec: null, powerW: 1e-6 }] });
  assert.equal(plan.seeds[0].state, 'amplifying');
  assert.equal(plan.seeds[0].signal.bw, 0);
  assert.equal(plan.seeds[0].signal.wl, 781);
});

test('light from an upstream OPA passes a second OPA unamplified, and the readout says why', () => {
  const pump = laser(-18, 515, 1), seed = laser(18, 780, 1e-6), first = opaElement();
  // A second OPA directly behind the first: its seed port sits on the first
  // one's signal output.
  const second = createElement('opa', 460, 18);
  Object.assign(second.params, { signalWl: 780, gainBandwidthNm: 40, smallSignalGainDb: 40 });
  traceScene([pump, seed, first, second], []);
  const plan = opaReading(second.id);
  assert.ok(plan.unplannedInput, 'the second OPA saw light the probe pass did not');
  assert.match(registry.opa.params.find(p => p.key === 'opaState').readout(second.params, second), /cascaded OPAs are not modelled/);
});

// Andrea's reproductions against 647d7c1.
const cwPump = { key: 'p', wl: 515, bw: 0, powerW: 1 };
const wide = { signalWl: 800, gainBandwidthNm: 100, smallSignalGainDb: 20 };
test('a reshaped (sampled) seed spectrum is reported unsupported, never mis-sampled into no overlap', () => {
  const spike = { kind: 'sampled', lo: 700, hi: 900, w: Array.from({ length: 1001 }, (_, i) => (i === 400 ? 1 : 0)) };
  const plan = planOpa(wide, { pump: cwPump, pumps: [cwPump], seeds: [{ key: 's', wl: 780, bw: 0.2, spec: spike, powerW: 1e-6 }] });
  assert.equal(plan.seeds[0].state, 'spectrumUnsupported');
  assert.equal(plan.seeds[0].gainW, 0);
  assert.match(registry.opa.params.find(p => p.key === 'opaState').readout(wide, null) || '', /Tuned/);
});

test('discrete seed lines stay discrete lines in the signal and the idler', () => {
  const plan = planOpa(wide, { pump: cwPump, pumps: [cwPump],
    seeds: [{ key: 's', wl: 800, bw: 50, spec: { kind: 'lines', lines: [{ nm: 775, w: 1 }, { nm: 825, w: 1 }] }, powerW: 1e-6 }] });
  const seed = plan.seeds[0];
  assert.equal(seed.state, 'amplifying');
  assert.equal(seed.signal.spec.kind, 'lines');
  assert.deepEqual(seed.signal.spec.lines.map(l => l.nm), [775, 825]);
  assert.equal(seed.idler.spec.kind, 'lines');
  // Idlers sorted by wavelength: 825 nm's (1370.6 nm) comes before 775 nm's (1535.1 nm).
  const idlers = [825, 775].map(wl => 1 / (1 / 515 - 1 / wl));
  seed.idler.spec.lines.forEach((l, k) => near(l.nm, idlers[k], 1e-9));
});

test('a seed with no pump is an ordinary seed, not an upstream OPA', () => {
  const opa = opaElement();
  traceScene([laser(18, 780, 1e-6), opa], []);
  const plan = opaReading(opa.id);
  assert.equal(plan.state, 'noPump');
  assert.ok(!plan.unplannedInput);
  assert.doesNotMatch(registry.opa.params.find(p => p.key === 'opaState').readout(opa.params, opa), /upstream/);
});
