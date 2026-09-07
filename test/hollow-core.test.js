import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fft, propagateEnvelope, fieldMetrics } from '../sketch/js/pulse-field.js';
import { hollowCoreCoefficients, normalizeHollowCore } from '../sketch/js/fiber.js';
import { registry, createElement } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceScene, detectorReading, fiberReading } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';
import { initInspector, renderInspector, applyInput } from '../sketch/js/inspector.js';
import { pulseEnvelopeAtOpticalPath } from '../sketch/js/pulses.js';
import { crossCorrelationPair } from '../sketch/js/glass.js';
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
  const settings = { ...base, ...hollowCoreCoefficients({}, 800), lossDbPerM: 0.1 };
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
  const scene = example();
  scene.beams[0].gasPressureBar = 10; scene.beams[0].coreDiameterUm = 50;
  const extreme = trace(scene);
  assert.equal(extreme.fiber.ok, false);
  assert.equal(extreme.after, null);
  assert.ok(extreme.fiber.reason);
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
