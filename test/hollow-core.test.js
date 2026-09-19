// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fft, propagateEnvelope, fieldMetrics } from '../sketch/js/pulse-field.js';
import { capillaryLossDbPerM, hollowCoreCoefficients, marcatiliLossDbPerM, normalizeHollowCore } from '../sketch/js/fiber.js';
import { registry, createElement } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceScene, detectorReading, fiberReading, LINEAR_ONLY, ARGON_OUT_OF_RANGE } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';
import { initInspector, renderInspector, applyInput } from '../sketch/js/inspector.js';
import { pulseEnvelopeAtOpticalPath } from '../sketch/js/pulses.js';
import { crossCorrelationPair, gaussianPulseDurationAfterGDD } from '../sketch/js/glass.js';
import { transformLimitedBandwidthNm } from '../sketch/js/spectrum.js';
import { buildSVG } from '../sketch/js/export.js';
const close = (a, b, rel = 1e-6) => assert.ok(Math.abs(a - b) <= rel * Math.max(1e-20, Math.abs(b)), `${a} ≠ ${b}`);
const base = { pulseWidthFs: 100, energyJ: 30e-6, wavelengthNm: 800, lengthM: 1, beta2Fs2PerM: 0, gammaPerWM: 0 };
const raw = readFileSync(new URL('../Examples/Ultrashort Pulses/Hollow-core pulse compressor.json', import.meta.url), 'utf8');
function example() { return parseSketch(raw, registry); }
function trace(scene) {
  const output = traceScene(scene.elements, scene.beams);
  return { ...output, fiber: fiberReading('hcf-fiber'), before: detectorReading('hcf-before'), after: detectorReading('hcf-output') };
}

test('FFT conserves energy and round-trips an asymmetric complex signal', () => {
  const re = Float64Array.from({ length: 128 }, (_, i) => Math.cos(i * 0.3) + 0.02 * i);
  const im = Float64Array.from({ length: 128 }, (_, i) => Math.sin(i * 0.7));
  const r = re.slice(), m = im.slice();
  const energy = re.reduce((a, v, i) => a + v * v + im[i] * im[i], 0);
  fft(re, im);
  close(re.reduce((a, v, i) => a + v * v + im[i] * im[i], 0) / 128, energy, 1e-12);
  fft(re, im, true);
  for (let i = 0; i < re.length; i++) { assert.ok(Math.abs(re[i] - r[i]) < 1e-12); assert.ok(Math.abs(im[i] - m[i]) < 1e-12); }
});

test('linear numerical propagation agrees with Gaussian GDD and dB energy loss', () => {
  const r = propagateEnvelope({ ...base, beta2Fs2PerM: 2000, lossDbPerM: 3 });
  assert.ok(r.ok, r.reason);
  close(r.metrics.energyJ / base.energyJ, 10 ** -0.3, 1e-10);
  close(r.metrics.fwhmFs, 100 * Math.sqrt(1 + (4 * Math.log(2) * 2000 / 10000) ** 2), 0.001);
  close(fieldMetrics(r.field, 0).fwhmFs, 100, 0.001);
});

test('pure self-phase modulation preserves temporal intensity and obeys analytic RMS broadening', () => {
  const unmodified = propagateEnvelope(base);
  const r = propagateEnvelope({ ...base, gammaPerWM: 7e-9 });
  assert.ok(r.ok, r.reason);
  close(r.metrics.energyJ, base.energyJ, 1e-10);
  close(r.metrics.fwhmFs, unmodified.metrics.fwhmFs, 1e-10);
  close(r.spectralRmsTHz / unmodified.spectralRmsTHz, Math.sqrt(1 + 4 * r.bIntegral ** 2 / (3 * Math.sqrt(3))), 1e-8);
  assert.ok(fieldMetrics(r.field, -650).fwhmFs < 60);
});

test('vacuum retains anomalous waveguide dispersion; gas pressure and radius change physical coefficients', () => {
  const vacuum = hollowCoreCoefficients({ gasPressureBar: 0, coreDiameterUm: 250 }, 800);
  close(vacuum.beta2Fs2PerM, -8.500335782, 1e-9);
  assert.equal(vacuum.gammaPerWM, 0);
  const wider = hollowCoreCoefficients({ gasPressureBar: 0, coreDiameterUm: 500 }, 800);
  close(wider.beta2Fs2PerM, vacuum.beta2Fs2PerM / 4);
  const gas = hollowCoreCoefficients({ gasPressureBar: 2 }, 800);
  assert.ok(gas.beta2Fs2PerM > 0 && gas.groupIndex > 1 && gas.groupIndex < 1.001);
  close(hollowCoreCoefficients({ gasPressureBar: 4 }, 800).gammaPerWM, gas.gammaPerWM * 2);
  assert.equal(hollowCoreCoefficients({ kerrEnabled: false }, 800).gammaPerWM, 0);
});

test('splitting step size and refining the temporal grid converge', () => {
  // At the example's computed loss, the smooth-capillary value for 250 µm.
  const settings = { ...base, ...hollowCoreCoefficients({}, 800), lossDbPerM: marcatiliLossDbPerM(250, 800) };
  const low = propagateEnvelope({ ...settings, samples: 1024, steps: 64 });
  const high = propagateEnvelope({ ...settings, samples: 2048, steps: 128 });
  assert.ok(low.ok && high.ok);
  close(low.spectralRmsTHz, high.spectralRmsTHz, 0.001);
  close(fieldMetrics(low.field, low.field.referenceGddFs2 - 650).fwhmFs,
    fieldMetrics(high.field, high.field.referenceGddFs2 - 650).fwhmFs, 0.005);
});

test('native example measures before and after compression and survives save/reload', () => {
  const scene = example(), r = trace(scene);
  assert.ok(r.fiber.ok, r.fiber.reason);
  close(r.fiber.energyJ, 30e-6);
  assert.ok(r.before.pulse.stretchedPulseWidthFs > 100);
  assert.ok(r.after.pulse.stretchedPulseWidthFs > 40 && r.after.pulse.stretchedPulseWidthFs < 50);
  close(r.before.pulse.gddFs2 - r.after.pulse.gddFs2, 650);
  const track = r.pulseTracks.find(t => t.pulse.field && t.pts.at(-1).x < 210);
  assert.ok(track?.gddTrace);
  close(pulseEnvelopeAtOpticalPath(track, track.opls.at(-1)).pulseWidthFs, r.after.pulse.stretchedPulseWidthFs);
  assert.ok(pulseEnvelopeAtOpticalPath(track, track.opls.at(-1)).visualStretch < 1);
  assert.match(crossCorrelationPair({ pulse: { trains: [r.before.pulse.trains[0], r.after.pulse.trains[0]] } }).reason, /NOT MODELED/);
  close(r.after.pulse.envelope.energyJ / r.before.pulse.envelope.energyJ, 9);
  assert.deepEqual(r.before.spectrum.map(p => p.wl), r.after.spectrum.map(p => p.wl));
  const restored = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, ...scene }), registry);
  close(trace(restored).after.pulse.stretchedPulseWidthFs, r.after.pulse.stretchedPulseWidthFs);
  Object.assign(state, scene);
  assert.doesNotMatch(buildSVG({ whiteBg: true }), /NaN|Infinity|undefined/);
});

test('ray sampling and attenuation do not invent pulse energy', () => {
  const scene = example();
  const beam = trace(scene);
  scene.elements.find(e => e.id === 'hcf-laser').params.beamMode = 'line';
  close(trace(scene).fiber.bIntegral, beam.fiber.bIntegral, 1e-10);
  const polarizer = createElement('polarizer', 180, 160);
  polarizer.params.pangle = 45;
  scene.elements.push(polarizer);
  const attenuated = trace(scene);
  close(attenuated.fiber.energyJ, beam.fiber.energyJ / 2);
});

test('vacuum, Kerr-off, higher energy and compressor-off controls change the right outputs', () => {
  const scene = example(), normal = trace(scene);
  scene.beams[0].kerrEnabled = false;
  const linear = trace(scene);
  assert.equal(linear.fiber.bIntegral, 0);
  assert.ok(linear.fiber.spectralRmsTHz < normal.fiber.spectralRmsTHz / 1.5);
  scene.beams[0].kerrEnabled = true; scene.beams[0].gasPressureBar = 0;
  const vacuum = trace(scene);
  assert.equal(vacuum.fiber.bIntegral, 0);
  assert.ok(vacuum.fiber.coefficients.beta2Fs2PerM < 0);
  scene.beams[0].gasPressureBar = 2;
  scene.elements.find(e => e.id === 'hcf-laser').params.avgPowerW *= 2;
  assert.ok(trace(scene).fiber.spectralRmsTHz > normal.fiber.spectralRmsTHz);
  scene.elements.find(e => e.id === 'hcf-compressor').params.gddFs2 = 0;
  const off = trace(scene);
  close(off.after.pulse.stretchedPulseWidthFs, off.before.pulse.stretchedPulseWidthFs);
  scene.elements.find(e => e.id === 'hcf-laser').params.avgPowerW = 0;
  const dark = trace(scene);
  assert.equal(dark.fiber.ok, false);
  assert.equal(dark.fiber.energyJ, 0);
  assert.equal(dark.after, null);
});

test('invalid inputs, extreme conditions and altered input spectra produce explicit unavailable readings', () => {
  for (const bad of [{ energyJ: NaN }, { energyJ: 0 }, { pulseWidthFs: 1 }, { wavelengthNm: Infinity }, { gammaPerWM: 100 }, { lengthM: 100 }]) {
    assert.equal(propagateEnvelope({ ...base, ...bad }).ok, false);
  }
  // A 50 µm core at 800 nm loses about 77 dB/m (loss scales as 1/a³), so
  // almost nothing survives 1 m: the capillary is nearly opaque, not refused.
  const narrow = example();
  narrow.beams[0].coreDiameterUm = 50;
  const opaque = trace(narrow);
  assert.ok(opaque.fiber.loss.idealDbPerM > 70, `${opaque.fiber.loss.idealDbPerM} dB/m`);
  // The refusal: 1 W at 1 kHz is 1 mJ, far beyond the Kerr solver's bounds.
  const scene = example();
  scene.elements.find(e => e.id === 'hcf-laser').params.avgPowerW = 1;
  const extreme = trace(scene);
  assert.equal(extreme.fiber.ok, false);
  assert.ok(extreme.fiber.reason);
  // A refusal is not zero energy: the light continues with argon's linear
  // dispersion, and every downstream readout says it is only that. Neither
  // the compressor on the way nor the analytic duration model may turn it
  // back into a prediction.
  assert.equal(extreme.fiber.state, 'linearOnly');
  assert.ok(extreme.after, 'light still reaches the output detector');
  assert.deepEqual(extreme.after.approximations, [LINEAR_ONLY]);
  assert.equal(extreme.after.pulse.stretchedPulseWidthFs, null);
  assert.equal(extreme.after.pulse.envelope, null);
  assert.equal(extreme.after.pulse.dispersionModel, LINEAR_ONLY);
  assert.ok(extreme.pulseTracks.every(t => t.opls.every(Number.isFinite)));
  assert.deepEqual(normalizeHollowCore({ gasPressureBar: Infinity, coreDiameterUm: -1 }).coreDiameterUm, 50);
  const shaped = example();
  const filter = createElement('filter', 180, 160); filter.params.ftype = 'bandpass'; filter.params.center = 800; filter.params.band = 2;
  shaped.elements.push(filter);
  const result = trace(shaped);
  assert.ok(!result.fiber || !result.fiber.ok);
});

test('inspector model switch exposes gas controls, commits bounded values and displays computed pulses', () => {
  const scene = example(); Object.assign(state, scene, { selection: { kind: 'beam', id: 'hcf-fiber' }, embedMode: false });
  const panel = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  initInspector(panel); trace(scene); renderInspector();
  assert.match(panel.innerHTML, /Argon pressure/); assert.match(panel.innerHTML, /30.00 µJ/);
  assert.doesNotMatch(panel.innerHTML, /data-k="groupIndex"|data-k="beta2Ps2PerKm"/);
  applyInput({ dataset: { k: 'gasPressureBar' }, type: 'number', value: '100', min: '0', max: '10' }, true);
  assert.equal(scene.beams[0].gasPressureBar, 10);
  applyInput({ dataset: { k: 'fiberModel' }, type: 'select-one', value: 'linear' }, true);
  assert.match(panel.innerHTML, /data-k="beta2Ps2PerKm"/); assert.doesNotMatch(panel.innerHTML, /Argon pressure/);
  const restored = example(); Object.assign(state, restored, { selection: { kind: 'element', id: 'hcf-output' } });
  trace(restored); renderInspector();
  assert.match(panel.innerHTML, /Computed FWHM|Computed pulse intensity versus time/);
  assert.doesNotMatch(panel.innerHTML, /Negligible at this pulse duration/);
});

test('pressure/core/energy sweep stays finite or returns an explicit model boundary', () => {
  let valid = 0, rejected = 0;
  for (const pressure of [0, 0.5, 2, 10]) for (const diameter of [50, 250, 1000]) for (const energyJ of [1e-6, 30e-6, 150e-6]) {
    const result = propagateEnvelope({ ...base, energyJ, ...hollowCoreCoefficients({ gasPressureBar: pressure, coreDiameterUm: diameter }, 800) });
    if (!result.ok) { rejected++; assert.ok(result.reason); continue; }
    valid++;
    assert.ok(result.field.re.every(Number.isFinite) && result.field.im.every(Number.isFinite));
    assert.ok(result.metrics.fwhmFs > 0 && Number.isFinite(result.metrics.fwhmFs));
    close(result.metrics.energyJ, energyJ, 1e-8);
  }
  assert.ok(valid > 10 && rejected > 0);
});

test('mixed sources and spectral filtering after the fiber do not retain a false temporal field', () => {
  const scene = example();
  const second = structuredClone(scene.elements.find(e => e.id === 'hcf-laser'));
  second.id = 'second-laser'; second.y += 0.1; scene.elements.push(second);
  assert.equal(trace(scene).fiber.ok, false);
  const shaped = example(), filter = createElement('filter', 280, 300);
  filter.rot = 180; filter.params.ftype = 'bandpass'; filter.params.center = 800; filter.params.band = 5;
  shaped.elements.push(filter);
  const r = trace(shaped);
  assert.ok(r.after && r.after.pulse.fieldIssue);
  assert.equal(r.after.pulse.stretchedPulseWidthFs, null);
});

// --- Continuation, caveats and states (review of #143) ----------------------

const byId = (scene, id) => scene.elements.find(e => e.id === id);

test('zero coupled pulse energy keeps the capillary dark', () => {
  const scene = example();
  byId(scene, 'hcf-laser').params.avgPowerW = 0;
  const result = trace(scene);
  assert.equal(result.fiber.state, 'noEnergy');
  assert.equal(result.after, null);
  assert.equal(result.before, null);
});

test('Kerr off is exact linear propagation, distinct from a refusal', () => {
  const scene = example();
  scene.beams[0].kerrEnabled = false;
  const off = trace(scene);
  assert.equal(off.fiber.ok, true);
  assert.equal(off.fiber.state, 'kerrOff');
  assert.deepEqual(off.after.approximations, []);
  assert.ok(Number.isFinite(off.after.pulse.stretchedPulseWidthFs));
  const refused = example();
  byId(refused, 'hcf-laser').params.avgPowerW = 1;
  const r = trace(refused);
  assert.equal(r.fiber.state, 'linearOnly');
  assert.deepEqual(r.after.approximations, [LINEAR_ONLY]);
});

test('a valid → refused → valid transition leaves no stale field, caveat or cache behind', () => {
  const scene = example();
  const first = trace(scene);
  const laser = byId(scene, 'hcf-laser');
  const saved = laser.params.avgPowerW;
  laser.params.avgPowerW = 1;
  const refused = trace(scene);
  assert.equal(refused.fiber.state, 'linearOnly');
  laser.params.avgPowerW = saved;
  const again = trace(scene);
  assert.equal(again.fiber.state, 'field');
  assert.deepEqual(again.after.approximations, []);
  close(again.after.pulse.stretchedPulseWidthFs, first.after.pulse.stretchedPulseWidthFs, 1e-12);
  close(again.before.pulse.stretchedPulseWidthFs, first.before.pulse.stretchedPulseWidthFs, 1e-12);
});

test('outside the argon data the light continues geometrically, never as an ordinary fiber called argon', () => {
  const scene = example();
  byId(scene, 'hcf-laser').params.wavelength = 450; // below Peck–Fisher's 467.9 nm
  const result = trace(scene);
  assert.equal(result.fiber.state, 'outOfRange');
  assert.equal(hollowCoreCoefficients(scene.beams[0], 450), null);
  assert.ok(result.after, 'geometric continuation still reaches the detector');
  assert.deepEqual(result.after.approximations, [ARGON_OUT_OF_RANGE]);
  // Only the compressor's own GDD arrives: no β₂ was claimed for the fiber.
  close(result.after.pulse.gddFs2, -650, 1e-9);
  assert.equal(result.after.pulse.stretchedPulseWidthFs, null);
});

test('a field that no longer fits its window is unavailable, not a Gaussian estimate', () => {
  const scene = example();
  byId(scene, 'hcf-compressor').params.gddFs2 = -900000;
  const result = trace(scene);
  assert.equal(result.fiber.state, 'field');
  assert.equal(result.after.pulse.stretchedPulseWidthFs, null);
  assert.equal(result.after.pulse.envelope, null);
  assert.match(result.after.pulse.dispersionModel, /numerical time window/);
});

test('detector screens downstream of a refusal carry the linear-only caveat', () => {
  const scene = example();
  byId(scene, 'hcf-laser').params.avgPowerW = 1;
  traceScene(scene.elements, scene.beams);
  const screen = byId(scene, 'hcf-after-screen');
  const svg = registry.display.svg(screen, scene.elements);
  assert.match(svg, /LINEAR-ONLY APPROX/);
  assert.match(svg, /data-caveat="Linear-only approximation; nonlinear output unavailable"/);
});

test('an ordinary fiber neither carries nor saves capillary settings', () => {
  const parsed = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [], beams: [{
    id: 'f', kind: 'fiber', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }], propagate: true,
  }] }), registry).beams[0];
  for (const key of ['fiberModel', 'kerrEnabled', 'coreDiameterUm', 'gasPressureBar']) assert.equal(key in parsed, false, key);
  assert.equal(example().beams[0].gasPressureBar, 2);
});

test('a second capillary does not rebuild a field from light already unavailable upstream', () => {
  // The reviewer's reproduction: a refused capillary feeding a Kerr-off one
  // through closely spaced connectors.
  const out = { mode: 'diverge', na: 0.01, focal: 20, dia: 4 };
  const capillary = (id, x0, x1, core, kerr) => ({ id, kind: 'fiber', bare: true,
    pts: [{ x: x0, y: 0 }, { x: x1, y: 0 }], propagate: true, inputNA: 0.22, width: 4, fiberModel: 'argon',
    lengthM: 1, coreDiameterUm: core, gasPressureBar: 2, kerrEnabled: kerr, lossDbPerM: 0.1, out0: out, out1: out });
  const run = beams => {
    const source = createElement('pulsedlaser', 0, 0);
    source.id = 'chain-laser';
    Object.assign(source.params, { wavelength: 800, pulseWidthFs: 100, transformLimited: true, beamMode: 'line', avgPowerW: 1, repRateMHz: 0.001 });
    const det = createElement('detector', 300, 0);
    det.id = 'chain-det';
    det.params.aperture = 40;
    const scene = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [source, det], beams }), registry);
    traceScene(scene.elements, scene.beams);
    return { states: beams.map(b => fiberReading(b.id)?.state), reading: detectorReading('chain-det') };
  };
  for (const kerr of [false, true]) {
    const chained = run([capillary('c1', 100, 150, 250, true), capillary('c2', 150.3, 200.3, 1000, kerr)]);
    assert.deepEqual(chained.states, ['linearOnly', 'linearOnly'], `second capillary Kerr ${kerr ? 'on' : 'off'}`);
    assert.equal(chained.reading.pulse.stretchedPulseWidthFs, null);
    assert.equal(chained.reading.pulse.envelope, null);
    assert.deepEqual(chained.reading.approximations, [LINEAR_ONLY]);
  }
  // Control: the same Kerr-off capillary fed directly computes its field.
  const direct = run([capillary('c2', 100, 150, 1000, false)]);
  assert.deepEqual(direct.states, ['kerrOff']);
  close(direct.reading.pulse.stretchedPulseWidthFs, 100.01481656697831, 1e-9);
  assert.deepEqual(direct.reading.approximations, []);
});

test('the capillary loss follows Marcatili and Schmeltzer, and follows the core', () => {
  // The paper's own worked value, reproduced with alpha as a field
  // coefficient: nu = 1.50, lambda = 1 um, a = 1 mm gives 1.85 dB/km.
  const u = 2.4048255577, nu = 1.5, lambda = 1e-6, a = 1e-3;
  const alpha = (u / (2 * Math.PI)) ** 2 * lambda ** 2 / a ** 3 * (nu * nu + 1) / (2 * Math.sqrt(nu * nu - 1));
  close(20 / Math.LN10 * alpha * 1000, 1.85, 0.002);
  // At 800 nm with a fused-silica wall.
  close(marcatiliLossDbPerM(150, 800), 2.8485, 1e-3);
  close(marcatiliLossDbPerM(250, 800), 0.61528, 1e-3);
  close(marcatiliLossDbPerM(500, 800), 0.076910, 1e-3);
  // Inverse cube of the radius, square of the wavelength (wall index aside).
  close(marcatiliLossDbPerM(125, 800) / marcatiliLossDbPerM(250, 800), 8, 1e-9);
  // Computed by default; an extra distributed loss adds; manual takes over.
  const computed = capillaryLossDbPerM({ fiberModel: 'argon', coreDiameterUm: 250 }, 800, 5);
  assert.equal(computed.model, 'marcatili');
  close(computed.totalDbPerM, marcatiliLossDbPerM(250, 800), 1e-12);
  close(capillaryLossDbPerM({ fiberModel: 'argon', coreDiameterUm: 250, extraLossDbPerM: 0.3 }, 800, 5).totalDbPerM,
    marcatiliLossDbPerM(250, 800) + 0.3, 1e-12);
  assert.equal(capillaryLossDbPerM({ fiberModel: 'argon', lossModel: 'manual' }, 800, 0.1).totalDbPerM, 0.1);
  // The example's readout and delivered energy follow a core change.
  const scene = example();
  const wide = trace(scene).fiber;
  scene.beams[0].coreDiameterUm = 300;
  const wider = trace(scene).fiber;
  assert.ok(wider.loss.idealDbPerM < wide.loss.idealDbPerM);
  close(wide.loss.totalDbPerM, 0.61528, 1e-3);
  const after = trace(example()).after.pulse.envelope.energyJ;
  close(after / 30e-6, 0.9 * 10 ** (-0.61521 / 10), 2e-3);
});

test('a chirped laser starts the solver at its transform limit, its GDD counted once', () => {
  // Kerr off makes the capillary linear, so the output must be the analytic
  // Gaussian at the source's GDD plus the path's -- not the chirped width
  // treated as a transform limit, and not the source GDD added twice.
  const scene = example();
  scene.beams[0].kerrEnabled = false;
  const laser = scene.elements.find(e => e.id === 'hcf-laser');
  const tau0 = 100;
  Object.assign(laser.params, {
    transformLimited: false, bandwidth: transformLimitedBandwidthNm(tau0, 800, 'gauss'),
    inputChirp: 'positive', chirpGddFs2: 300,
  });
  const result = trace(scene);
  assert.equal(result.fiber.state, 'kerrOff');
  for (const reading of [result.before, result.after]) {
    const pathGdd = reading.pulse.gddFs2;
    close(reading.pulse.stretchedPulseWidthFs, gaussianPulseDurationAfterGDD(tau0, 300 + pathGdd), 2e-3);
  }
});

test('a computed loss above 100 dB/m is applied in full, to the field and to the rays', () => {
  // The reviewer's reproduction: 50 µm core, 1 cm, +100 dB/m extra, Kerr off.
  // The model gives about 176.9 dB/m; the manual field's 100 dB/m ceiling must
  // not cap it, or the capillary delivers energy the model says is lost.
  const scene = example();
  Object.assign(scene.beams[0], { coreDiameterUm: 50, lengthM: 0.01, extraLossDbPerM: 100, kerrEnabled: false });
  const model = capillaryLossDbPerM(scene.beams[0], 800, 0);
  assert.ok(model.totalDbPerM > 170, `${model.totalDbPerM} dB/m`);
  const result = trace(scene);
  assert.equal(result.fiber.state, 'kerrOff');
  close(result.fiber.loss.totalDbPerM, model.totalDbPerM, 1e-12);
  const required = 10 ** (-model.totalDbPerM * 0.01 / 10);
  close(result.after.pulse.envelope.energyJ / 30e-6 / 0.9, required, 1e-6);
  // The rays carry the same attenuation as the field.
  const lossless = example();
  Object.assign(lossless.beams[0], { coreDiameterUm: 50, lengthM: 0.01, lossModel: 'manual', lossDbPerM: 0, kerrEnabled: false });
  close(result.after.signal / trace(lossless).after.signal, required, 1e-6);
  // A typed manual loss stays bounded by its field.
  assert.equal(normalizeHollowCore({ lossModel: 'manual' }).lossModel, 'manual');
});
