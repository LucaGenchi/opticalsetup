// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceAll, traceScene, detectorReading, probeAt, probePowerAt, probeBeamsAt } from '../sketch/js/raytrace.js';
import { spectralFieldResult, spectralTermsAt, coherencePathMm } from '../sketch/js/spectral-coherence.js';
import { cameraProfileFromHits } from '../sketch/js/camera-profile.js';
import { probeTimingSummary, probeTimingLabel } from '../sketch/js/probe.js';
import { encodeSharePayload, decodeSharePayload } from '../sketch/js/share.js';
import { scopeTrace } from '../sketch/js/pulses.js';
import { resolveSourceSpectrum, applyTransmission, spectrumSlice, spectrumSupport, spectrumWeight } from '../sketch/js/spectrum.js';

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

test('nonlinear conversion declines an unavailable temporal field', () => {
  const s = scene({ delayMm: .002 });
  const optic = createElement('crystal', 700, 400);
  Object.assign(optic.params, { convert: 'shg' });
  s.elements.push(optic);
  traceAll(s.elements);
  const r = detectorReading(s.elements.find(e => e.type === 'camera').id);
  assert.ok(r && r.signal > 0);
  assert.ok(r.wavelength > 500, 'no fabricated second harmonic');
  assert.ok(r.approximations.some(note => /Nonlinear response after interference unavailable; unconverted input shown/.test(note)));
  assert.equal(r.pulse.stretchedPulseWidthFs, null);
});

// A chopper acts on average power, which the spectral model does supply: it
// must do to the recombined beam what it does to any other, not pass it
// through untouched. The same holds for the acousto- and electro-optic
// modulators that shared its block.
test('a chopper after the recombining beamsplitter still gates the beam', () => {
  const base = scene();
  const combiner = base.elements.filter(e => e.type === 'bs').at(-1);
  // Trace with a chopper halfway between the combiner and one camera, and
  // read that camera.
  const reading = (interference, camera, chop) => {
    const s = scene({ delayMm: 0, params: { interference } });
    if (chop) {
      const chopper = createElement('chopper', (combiner.x + camera.x) / 2, (combiner.y + camera.y) / 2);
      chopper.rot = camera.rot;
      Object.assign(chopper.params, { modulate: true, chopDuty: 0.5 });
      s.elements.push(chopper);
    }
    traceAll(s.elements);
    return detectorReading(camera.id);
  };
  // Equal arms: one port takes everything.
  const bright = base.elements.filter(e => e.type === 'camera')
    .find(camera => Math.abs((reading(true, camera, false)?.signal || 0) - 1) < 1e-6);
  assert.ok(bright, 'no camera sits behind the bright port');
  const chopped = reading(true, bright, true);
  near(chopped.signal, 0.5, 1e-6);
  assert.ok(chopped.approximations.some(note => /applies its average transmission/.test(note)), 'the gate is labelled as averaged');
  assert.ok(!chopped.approximations.some(note => /unavailable/.test(note)));
  assert.equal(chopped.pulse.interferenceUnknown, true, 'the temporal field stays unavailable');
  // Without interference the same port carries half, and the chopper halves that.
  near(reading(false, bright, true).signal, 0.25, 1e-6);
});

test('one beam from a new pulsed source carries no interference caveat', () => {
  for (const type of ['pulsedlaser', 'sclaser']) {
    const source = createElement(type, 0, 0);
    assert.equal(source.params.interference, true);
    source.params.beamMode = 'beam';
    const lens = createElement('lens', 150, 0);
    const camera = createElement('camera', 300, 0);
    traceAll([source, lens, camera]);
    const r = detectorReading(camera.id);
    near(r.signal, 1, 1e-6);
    assert.deepEqual(r.approximations, []);
  }
  // Two routes that do meet beyond the sampling budget keep their caveat.
  const s = scene({ delayMm: 50 });
  traceAll(s.elements);
  const readings = s.elements.filter(e => e.type === 'camera').map(e => detectorReading(e.id));
  assert.ok(readings.every(r => r.approximations.some(note => /interference unavailable/.test(note))));
});

// A specimen's linear channels scale with average power; only its nonlinear
// ones need the temporal field the recombined beam no longer has.
test('linear specimen channels still respond after recombination; nonlinear ones decline', () => {
  const caveats = kind => {
    const s = scene({ delayMm: 0 });
    const sample = createElement('sample', 700, 400);
    sample.rot = 90;
    Object.assign(sample.params, { specimenType: kind === 'tpef' ? 'nonlinear' : 'linear',
      channels: [{ kind, wl: 600, eff: 0.5, retardance: 90, axis: 45 }], transmitExc: true, transmission: 1 });
    s.elements.push(sample);
    traceAll(s.elements);
    return s.elements.filter(e => e.type === 'camera').map(e => detectorReading(e.id)).filter(Boolean)
      .flatMap(r => r.approximations);
  };
  for (const kind of ['fluor', 'raman', 'phase']) {
    assert.ok(!caveats(kind).some(note => /Nonlinear response after interference unavailable/.test(note)), kind);
  }
  assert.ok(caveats('tpef').some(note => /Nonlinear response after interference unavailable/.test(note)));
});

// The recombined beam carries one arm's pulse timing. A gate at the pulse
// rate, with an edge between the two arms' arrival times, used to pass
// everything or nothing depending on which arm that was.
test('a pulse-rate gate after recombination reads its average, whichever arm sets the timing', () => {
  const gated = (phaseNs, modulate = true) => {
    const s = scene({ delayMm: 0.02 });
    const aom = createElement('aom', 700, 400);
    Object.assign(aom.params, { deflect: 0, eff: 1, zero: false, modulate, modShape: 'square',
      modFreqMHz: 80, chopDuty: 0.5, phaseNs });
    s.elements.push(aom);
    traceAll(s.elements);
    return s.elements.filter(e => e.type === 'camera').map(e => detectorReading(e.id)).filter(Boolean);
  };
  const open = gated(0, false).map(r => r.signal);
  // Andrea's edge case, then the gate moved by half and by a quarter period.
  for (const phaseNs of [2.495092788491697, 2.495092788491697 + 6.25, 2.495092788491697 + 3.125, 0]) {
    const readings = gated(phaseNs);
    assert.equal(readings.length, open.length);
    const behindGate = readings.map((r, index) => ({ r, index }))
      .filter(({ r }) => r.approximations.some(note => /applies its average transmission/.test(note)));
    assert.equal(behindGate.length, 1, 'exactly one camera sits behind the gate');
    for (const { r, index } of readings.map((r, index) => ({ r, index }))) {
      near(r.signal, index === behindGate[0].index ? 0.5 * open[index] : open[index], 1e-6);
    }
  }
});

// Both caveats describe the light a reading is made of. That is the routes
// the aperture integrates -- which may be only a tube bounded by rays that
// miss the sensor -- and never a beam that merely crosses the detector's
// plane somewhere else.
test('caveats follow the routes that feed the reading, not rays elsewhere on the detector plane', () => {
  // A gated, strongly diverged beam reaches an off-axis camera through its
  // tube alone: no ray lands, the gate still halves the reading, and says so.
  const offAxis = modulate => {
    const s = scene({ delayMm: 0 });
    const aom = createElement('aom', 700, 400);
    Object.assign(aom.params, { deflect: 0, eff: 1, zero: false, modulate, modShape: 'square', modFreqMHz: 80, chopDuty: 0.5 });
    const lens = createElement('lens', 720, 400);
    lens.params.f = -2;
    const camera = s.elements.filter(e => e.type === 'camera').sort((a, b) => b.x - a.x)[0];
    Object.assign(camera, { x: 1000, y: 416.25 });
    camera.params.ch = 20;
    s.elements.push(aom, lens);
    traceAll(s.elements);
    return detectorReading(camera.id);
  };
  const open = offAxis(false), gated = offAxis(true);
  assert.ok(open && open.signal > 0);
  assert.equal(gated.samples, 0, 'the reading comes from the tube, not from a ray on the sensor');
  near(gated.signal, 0.5 * open.signal, 1e-9);
  assert.ok(gated.approximations.some(note => /applies its average transmission/.test(note)));
  assert.ok(!open.approximations.some(note => /applies its average transmission/.test(note)));

  // The other port, folded and sent through a lens, passes far from this
  // camera: its unmodeled lens phase is not this reading's caveat.
  const s = scene({ delayMm: 0.02 });
  const [kept, removed] = s.elements.filter(e => e.type === 'camera').sort((a, b) => b.x - a.x);
  s.elements = s.elements.filter(e => e !== removed);
  const fold = createElement('mirror', 600, 500);
  fold.rot = 135;
  const lens = createElement('lens', 700, 500);
  lens.params.f = 1000;
  const before = (traceAll(s.elements), detectorReading(kept.id).signal);
  s.elements.push(fold, lens);
  traceAll(s.elements);
  const r = detectorReading(kept.id);
  near(r.signal, before, 1e-9);
  assert.deepEqual(r.approximations.filter(note => /lens/.test(note)), []);
});

// The inspector's coherence length is the arm mismatch that halves the
// fringes, from the same spectrum the tracer integrates.
test('the coherence length is where an arm mismatch halves the fringe contrast', () => {
  // A transform-limited Gaussian pulse: its own length, c x duration.
  const pulsed = createElement('pulsedlaser', 0, 0);
  Object.assign(pulsed.params, { wavelength: 800, pulseWidthFs: 150 });
  const gauss = resolveSourceSpectrum('pulsedlaser', pulsed.params).spec;
  const length = coherencePathMm(gauss);
  assert.ok(Math.abs(length - 0.299792458e-3 * 150) < 0.5e-3, `${length} mm`);
  // The tracer's own kernel agrees: two half-power copies give 1 ± V, so a
  // bright fringe and the dark one beside it differ by twice the visibility.
  const cycles = Math.round(length * 1e6 / 800);
  const port = (opdMm, phaseRad) => spectralFieldResult(gauss, [
    { amplitude: Math.SQRT1_2, opdMm: 0, phaseRad: 0 }, { amplitude: Math.SQRT1_2, opdMm, phaseRad }]).power;
  const at = cycles * 800e-6;
  near(port(at, 0) - port(at, Math.PI), 2 * coherenceVisibilityAt(gauss, at), 1e-4);
  // An independent trapezoid in wavelength agrees to its own accuracy.
  assert.ok(Math.abs(coherenceVisibilityAt(gauss, length) - 0.5) < 1e-4);
  // Half the duration, half the length; a wider band, a shorter one.
  Object.assign(pulsed.params, { pulseWidthFs: 75 });
  near(coherencePathMm(resolveSourceSpectrum('pulsedlaser', pulsed.params).spec), length / 2, 1e-3 * length);
  const sc = createElement('sclaser', 0, 0);
  Object.assign(sc.params, { scMin: 400, scMax: 700 });
  const flat = coherencePathMm(resolveSourceSpectrum('sclaser', sc.params).spec);
  assert.ok(flat > 0.2e-3 && flat < 1e-3, `${flat} mm`);
  assert.ok(Math.abs(coherenceVisibilityAt(resolveSourceSpectrum('sclaser', sc.params).spec, flat) - 0.5) < 1e-4);
  // Every band is finite, so none may be called unlimited. A sub-cycle band
  // (800 nm, 1 fs) is declined at once; a nanosecond pulse, whose band is
  // twelve orders narrower than its carrier, is resolved.
  Object.assign(pulsed.params, { pulseWidthFs: 1 });
  const readout = registry.pulsedlaser.params.find(p => p.key === 'coherenceLength').readout;
  assert.ok(Number.isNaN(coherencePathMm(resolveSourceSpectrum('pulsedlaser', pulsed.params).spec)));
  assert.equal(readout(pulsed.params), 'Not resolved for this spectrum');
  Object.assign(pulsed.params, { pulseWidthFs: 1e8 });
  near(coherencePathMm(resolveSourceSpectrum('pulsedlaser', pulsed.params).spec), 30138.995, 0.01);
  assert.match(readout(pulsed.params), /^≈ 30100 mm/);
  // Across the source's whole range the answer is a positive length or a
  // declined sub-cycle band, promptly, and near c x duration once narrow.
  for (const wavelength of [200, 532, 800, 1550, 12000]) {
    for (const pulseWidthFs of [1, 3, 10, 30, 150, 1e4, 1e6, 1e9]) {
      Object.assign(pulsed.params, { wavelength, pulseWidthFs });
      const spec = resolveSourceSpectrum('pulsedlaser', pulsed.params).spec;
      const started = performance.now();
      const value = coherencePathMm(spec);
      assert.ok(performance.now() - started < 250, `${wavelength} nm, ${pulseWidthFs} fs is slow`);
      assert.ok(Number.isNaN(value) || value > 0, `${wavelength} nm, ${pulseWidthFs} fs: ${value}`);
      const cycles = pulseWidthFs * 299.792458 / wavelength;
      if (cycles > 20) assert.ok(Math.abs(value / (0.299792458e-3 * pulseWidthFs) - 1) < 0.01, `${wavelength} nm, ${pulseWidthFs} fs: ${value}`);
      if (cycles < 0.5) assert.ok(Number.isNaN(value));
    }
  }
  // No band, no limit to report. A sampled profile is finite but not one of
  // the supported source shapes: declined, and never called unlimited.
  assert.equal(coherencePathMm(null), null);
  assert.equal(coherencePathMm({ kind: 'lines', lines: [] }), null);
  const twoLines = Array(4097).fill(0);
  twoLines[1024] = 3; twoLines[3072] = 1;
  assert.ok(Number.isNaN(coherencePathMm({ kind: 'sampled', lo: 600, hi: 1000, w: twoLines })));
  for (const type of ['pulsedlaser', 'sclaser']) {
    const params = registry[type].params;
    const readout = params.find(p => p.key === 'coherenceLength').readout;
    assert.match(readout(createElement(type, 0, 0).params), /^≈ [0-9.]+ (µm|mm) \(half contrast\)$/);
    // The panel closes the list, after the pulse and bandwidth controls.
    const keys = params.map(p => p.key);
    assert.deepEqual(keys.slice(-4), ['interferenceHeading', 'interference', 'interferenceModel', 'coherenceLength']);
    assert.ok(keys.indexOf('pulseWidthFs') < keys.indexOf('interferenceHeading'));
  }
  const mono = createElement('pulsedlaser', 0, 0);
  Object.assign(mono.params, { transformLimited: false, bandwidth: 0 });
  assert.equal(registry.pulsedlaser.params.find(p => p.key === 'coherenceLength').readout(mono.params), 'Not limited by this spectrum');
});

// Fringe visibility of two equal copies, straight from the definition.
function coherenceVisibilityAt(spec, opdMm, samples = 4096) {
  const [lo, hi] = spectrumSupport(spec);
  let re = 0, im = 0, norm = 0;
  for (let i = 0; i <= samples; i++) {
    const wl = lo + (hi - lo) * i / samples;
    const weight = (i === 0 || i === samples ? 0.5 : 1) * spectrumWeight(spec, wl);
    const phase = 2 * Math.PI * 1e6 * opdMm / wl;
    re += weight * Math.cos(phase); im += weight * Math.sin(phase); norm += weight;
  }
  return Math.hypot(re, im) / norm;
}
