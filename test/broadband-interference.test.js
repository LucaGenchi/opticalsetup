// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceAll, traceScene, detectorReading, probeAt, probePowerAt, probeBeamsAt } from '../sketch/js/raytrace.js';
import { spectralFieldResult, spectralTermsAt } from '../sketch/js/spectral-coherence.js';
import { cameraProfileFromHits } from '../sketch/js/camera-profile.js';
import { probeTimingSummary, probeTimingLabel } from '../sketch/js/probe.js';
import { encodeSharePayload, decodeSharePayload } from '../sketch/js/share.js';
import { scopeTrace } from '../sketch/js/pulses.js';
import { resolveSourceSpectrum, applyTransmission, spectrumSlice, spectrumWeight } from '../sketch/js/spectrum.js';

const MZ = readFileSync(new URL('./fixtures/mach-zehnder.json', import.meta.url), 'utf8');
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function scene({ type = 'pulsedlaser', detector = 'camera', delayMm = 0, params = {}, ratio = 0.5 } = {}) {
  const scene = parseSketch(MZ, registry);
  const index = scene.elements.findIndex(e => e.type === 'cwlaser');
  const old = scene.elements[index];
  const source = createElement(type, old.x, old.y);
  source.rot = old.rot;
  Object.assign(source.params, { wavelength: 532, pulseWidthFs: 200, beamWidth: old.params.beamWidth, pol: old.params.pol, ...params });
  scene.elements[index] = source;
  scene.elements.find(e => e.type === 'delayline').params.delayMm = delayMm;
  for (const bs of scene.elements.filter(e => e.type === 'bs')) bs.params.ratio = ratio;
  if (detector !== 'camera') scene.elements = scene.elements.map(e => {
    if (e.type !== 'camera') return e;
    const next = createElement(detector, e.x, e.y); next.rot = e.rot;
    if ('aperture' in next.params) next.params.aperture = 12;
    return next;
  });
  return scene;
}
function run(options) {
  const s = scene(options);
  const start = performance.now();
  const traced = traceScene(s.elements);
  const detectors = s.elements.filter(e => registry[e.type].surfaces?.(e).some(surface => surface.kind === 'detector'));
  return { s, traced, detectors, readings: detectors.map(e => detectorReading(e.id)), ms: performance.now() - start };
}

for (const type of ['pulsedlaser', 'sclaser']) {
  test(`${type}: equal arms and all detector types see complementary powers`, () => {
    for (const detector of ['camera', 'detector', 'pmt', 'spectrometer', 'powermeter', 'generaldetector']) {
      const { readings } = run({ type, detector });
      assert.equal(readings.length, 2, detector);
      assert.ok(readings.every(Boolean), `${detector} keeps an explicit dark-port result`);
      const [bright, dark] = readings;
      near(bright.signal, 1); near(dark.signal, 0);
      near(bright.spectrum.reduce((sum, bin) => sum + bin.power, 0), 1);
      assert.equal(bright.interference?.applied, true);
      assert.equal(dark.dark, true);
      near(bright.sourceFractions.reduce((sum, source) => sum + source.fraction, 0), 1);
    }
  });
  test(`${type}: delay response agrees with independently checked spectral integral`, () => {
    for (const delayMm of [0.000266, 0.002, 0.01]) {
      const { s, readings } = run({ type, delayMm });
      const source = s.elements.find(e => e.type === type);
      const { spec } = resolveSourceSpectrum(type, source.params);
      const expected = spectralFieldResult(spec, [{ amplitude: 0.5, opdMm: 0 }, { amplitude: 0.5, opdMm: delayMm }]);
      near(readings[0].signal, expected.power, 1e-6);
      near(readings[0].signal + readings[1].signal, 1, 1e-8);
    }
  });
  test(`${type}: unequal splitter ratios conserve both port powers`, () => {
    for (const ratio of [0.05, 0.2, 0.8, 0.95]) {
      const { readings } = run({ type, ratio });
      near(readings[0].signal, 4 * ratio * (1 - ratio));
      near(readings[0].signal + readings[1].signal, 1);
    }
  });
  test(`${type}: old scenes retain power-only behavior and the new setting round-trips`, () => {
    const s = scene({ type });
    const source = s.elements.find(e => e.type === type);
    assert.equal(source.params.interference, true);
    const serialize = () => JSON.stringify({ app: 'optics2d', version: 1, elements: s.elements });
    assert.equal(parseSketch(serialize(), registry).elements.find(e => e.type === type).params.interference, true);
    delete source.params.interference;
    const old = parseSketch(serialize(), registry);
    assert.equal(old.elements.find(e => e.type === type).params.interference, false);
    traceAll(old.elements);
    for (const camera of old.elements.filter(e => e.type === 'camera')) near(detectorReading(camera.id).signal, 0.5);
  });
}

test('common chirp does not create a longer interference envelope', () => {
  const unchirped = run({ delayMm: .02, params: { transformLimited: false, bandwidth: 8, chirpGddFs2: 0 } });
  const chirped = run({ delayMm: .02, params: { transformLimited: false, bandwidth: 8, chirpGddFs2: 20000 } });
  unchirped.readings.forEach((r, i) => near(r.signal, chirped.readings[i].signal));
});

test('spectrum contains resolved fringes and keeps total power after recombination', () => {
  const { readings } = run({ type: 'sclaser', detector: 'spectrometer', delayMm: .002 });
  for (const reading of readings) {
    near(reading.spectrum.reduce((sum, bin) => sum + bin.power, 0), reading.signal);
    const density = reading.spectrum.slice(2, -2).map(s => s.power / s.widthNm);
    assert.ok(Math.max(...density) > 5 * Math.min(...density));
    assert.ok(reading.spectrum.length >= 128, `only ${reading.spectrum.length} spectral samples`);
  }
});

test('combined temporal readouts and pulse animation never reuse a surviving arm', () => {
  const { readings, traced } = run({ delayMm: .000266 });
  for (const r of readings) {
    assert.equal(r.pulse.stretchedPulseWidthFs, null);
    assert.match(r.pulse.fieldIssue, /Temporal field after interference/);
    assert.equal(scopeTrace(r.pulse), null);
  }
  assert.ok(traced.pulseTracks.every(track => !track.pulse.interferenceUnknown));
});

test('resolution and path budgets decline instead of aliasing', () => {
  const spec = { kind: 'flat', lo: 300, hi: 700 };
  assert.equal(spectralFieldResult(spec, [{ amplitude: .5, opdMm: 0 }, { amplitude: .5, opdMm: 100 }]), null);
  assert.equal(spectralFieldResult(spec, Array.from({ length: 9 }, () => ({ amplitude: .1, opdMm: 0 }))), null);
  assert.equal(spectralFieldResult(spec, [{ amplitude: NaN, opdMm: 0 }]), null);
  const { readings } = run({ type: 'sclaser', delayMm: 100 });
  for (const r of readings) {
    near(r.signal, .5);
    assert.equal(r.interference.applied, false);
    assert.ok(r.approximations.some(note => /interference unavailable/.test(note)));
  }
});

test('a route through an optic of unknown carrier phase disables the complete interference pair', () => {
  const s = scene();
  s.elements.push(createElement('lens', 520, 200));
  traceAll(s.elements);
  for (const c of s.elements.filter(e => e.type === 'camera')) {
    const r = detectorReading(c.id);
    if (r) assert.equal(r.interference.applied, false);
  }
});

test('spectral phase survives a second field combination', () => {
  const spec = { kind: 'flat', lo: 400, hi: 700 };
  const terms = [{ amplitude: .5, opdMm: 0, phaseRad: 0 }, { amplitude: .5, opdMm: .001, phaseRad: 0 }];
  const first = spectralFieldResult(spec, terms);
  const carried = spectralTermsAt({ power: first.power, terms }, first.power / 2, .002, Math.PI / 2);
  const combined = [...carried, { amplitude: .3, opdMm: .001, phaseRad: 0 }];
  const expected = terms.map(t => ({ amplitude: t.amplitude / Math.sqrt(2), opdMm: t.opdMm + .002, phaseRad: Math.PI / 2 }));
  expected.push(combined.at(-1));
  near(spectralFieldResult(spec, combined).power, spectralFieldResult(spec, expected).power);
});

test('filters downstream retain fine spectral structure and uniform attenuation', () => {
  const out = spectralFieldResult({ kind: 'flat', lo: 400, hi: 700 }, [
    { amplitude: .5, opdMm: 0 }, { amplitude: .5, opdMm: .008 },
  ]);
  const full = spectrumSlice(out.spec, out.spec.lo, out.spec.hi);
  near(full.fraction, 1, 1e-12);
  const half = applyTransmission(out.spec, 550, () => .5);
  near(half.fraction, .5, 1e-12);
  assert.ok(half.spec.w.length >= out.spec.w.length);
  for (const wl of [420, 477, 561, 644]) near(spectrumWeight(half.spec, wl) / spectrumWeight(full.spec, wl), 1, 1e-9);
});

test('camera-local broadband overlap integrates fields rather than treating the band as one wavelength', () => {
  const source = { kind: 'flat', lo: 400, hi: 700 };
  const hits = delay => ['a', 'b'].flatMap((pathKey, arm) => Array.from({ length: 5 }, (_, sample) => ({
    power: .1, wl: 550, spec: source, bw: 300, spectralSource: source,
    u: sample / 4, sample, sampleCount: 5, sampleGrid: 'edges',
    sourceId: 'sc', coherenceId: 'sc', phaseValid: true,
    pathKey, oplMm: 100 + (arm ? delay : 0), phaseOffset: 0, pol: 0,
  })));
  for (const delay of [0, .002, .005]) {
    const r = cameraProfileFromHits(hits(delay), 8, 4);
    const expected = spectralFieldResult(source, [
      { amplitude: Math.sqrt(.5), opdMm: 0 }, { amplitude: Math.sqrt(.5), opdMm: delay },
    ]);
    near(r.profile.reduce((a, b) => a + b, 0), expected.power, 1e-7);
    assert.equal(r.interference.applied, true);
    assert.ok(r.coherentSpectra.length);
  }
});


test('probe power, duration, and time view agree after recombination', () => {
  const { s, readings } = run({ type: 'sclaser', delayMm: .002 });
  near(probePowerAt(700, 400, 8).sourceFractions.reduce((sum, x) => sum + x.fraction, 0), readings[0].signal);
  const reading = probeAt(700, 400);
  assert.equal(reading.pulse.durationFs, null);
  assert.equal(scopeTrace(reading.pulse), null);
  const beams = probeBeamsAt(700, 400, 8);
  assert.equal(probeTimingLabel(probeTimingSummary(beams)), 'Temporal field unavailable');
  const probe = createElement('probe', 700, 400);
  probe.params.prop = 'time';
  const svg = registry.probe.svg(probe, [...s.elements, probe]);
  assert.match(svg, /Temporal field unavailable/);
  assert.doesNotMatch(svg, /data-probe-time="cw"|NaN|Infinity/);
});

test('shared sources preserve both explicit opt-in and legacy defaults', async () => {
  const s = scene();
  for (const enabled of [true, false, undefined]) {
    const source = s.elements.find(e => e.type === 'pulsedlaser');
    source.params.interference = enabled;
    const text = JSON.stringify({ app: 'optics2d', version: 1, elements: s.elements });
    const loaded = parseSketch(await decodeSharePayload(await encodeSharePayload(text)), registry);
    assert.equal(loaded.elements.find(e => e.type === 'pulsedlaser').params.interference, enabled === true);
  }
});

test('cascaded interferometers retain wavelength-dependent phase and conserve total power', () => {
  const first = scene({ type: 'sclaser', delayMm: .002 });
  const second = scene({ type: 'sclaser', delayMm: .001 });
  const [firstBright, firstDark] = first.elements.filter(e => e.type === 'camera');
  const optics = first.elements.filter(e => e !== firstBright && e.type !== 'display');
  for (const el of second.elements.filter(e => !['sclaser', 'textlabel', 'display'].includes(e.type))) {
    el.id += '-second'; el.x += 600; el.y += 200;
    optics.push(el);
  }
  traceAll(optics);
  const outputs = optics.filter(e => e.type === 'camera');
  const readings = outputs.map(e => detectorReading(e.id));
  assert.ok(readings.every(r => r && r.interference.applied));
  near(readings.reduce((sum, r) => sum + r.signal, 0), 1, 1e-7);
  const source = optics.find(e => e.type === 'sclaser');
  const spec = resolveSourceSpectrum(source.type, source.params).spec;
  const expected = spectralFieldResult(spec, [0, .001, .002, .003].map(opdMm => ({ amplitude: .25, opdMm })));
  near(readings.find((r, i) => outputs[i].id.endsWith('-second')).signal, expected.power, 1e-7);
  assert.equal(outputs[0].id, firstDark.id);
});

test('independent pulsed sources add powers without cross-source phase locking', () => {
  const s = scene({ delayMm: .002 });
  traceAll(s.elements);
  const cameras = s.elements.filter(e => e.type === 'camera');
  const before = cameras.map(c => detectorReading(c.id).signal);
  const laser = s.elements.find(e => e.type === 'pulsedlaser');
  s.elements.push({ ...structuredClone(laser), id: 'independent-source' });
  traceAll(s.elements);
  cameras.forEach((c, i) => near(detectorReading(c.id).signal, 2 * before[i]));
});

test('spectral field kernel integrates finite pixels and orthogonal polarization', () => {
  const source = { kind: 'flat', lo: 400, hi: 700 };
  const orthogonal = spectralFieldResult(source, [
    { amplitude: .5, opdMm: 0, pol: 0 }, { amplitude: .5, opdMm: 0, pol: 90 },
  ]);
  near(orthogonal.power, .5);
  const terms = [{ amplitude: .5, opdMm: 0 }, { amplitude: .5, opdMm: .001, slope: .001 }];
  const whole = spectralFieldResult(source, terms, { widthMm: 2 });
  const halves = [-.5, .5].map(x => spectralFieldResult(source,
    terms.map(t => ({ ...t, opdMm: t.opdMm + x * (t.slope || 0) })), { widthMm: 1 }));
  near(whole.power, (halves[0].power + halves[1].power) / 2, 1e-7);
});


test('scalar apertures agree with camera integration when they clip a broadband beam', () => {
  for (const detector of ['camera', 'detector', 'pmt', 'spectrometer', 'powermeter']) {
    const s = scene({ type: 'sclaser', detector, params: { beamWidth: 16 } });
    const sensors = s.elements.filter(e => registry[e.type].surfaces?.(e).some(x => x.kind === 'detector'));
    const bright = sensors[0];
    Object.assign(bright.params, { ch: 10, aperture: 10 });
    bright.y += .13;
    traceAll(s.elements);
    near(detectorReading(bright.id).signal, 10 / 16, 1e-7);
  }
});

test('downstream gates and nonlinear conversion decline an unavailable temporal field', () => {
  for (const type of ['chopper', 'crystal']) {
    const s = scene({ delayMm: .002 });
    const optic = createElement(type, 700, 400);
    Object.assign(optic.params, { modulate: true, convert: 'shg' });
    s.elements.push(optic);
    traceAll(s.elements);
    const r = detectorReading(s.elements.find(e => e.type === 'camera').id);
    assert.ok(r && r.signal > 0);
    assert.ok(r.wavelength > 500, 'no fabricated second harmonic');
    assert.ok(r.approximations.some(note => /unconverted, ungated input shown/.test(note)));
    assert.equal(r.pulse.stretchedPulseWidthFs, null);
  }
});
