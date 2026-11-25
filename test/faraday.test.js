// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Step P2 of the Physics in 2D track: the Faraday rotator and the physical
// optical isolator (docs/physics/faraday.md). The closed forms and the
// Faraday mirror are also checked against validation/reference/faraday.py.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { traceScene, detectorReading, probeAt, faradayReading } from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';
import { readFile } from 'node:fs/promises';
import {
  FARADAY_MATERIAL_OPTIONS, verdetAt, faradayRotationDeg, rotationForCrossingDeg, rotateStokes,
  isolatorRotationDeg, isolatorFieldLength, isolatorFigures, isolatorCrossing, leakOfExtinction,
} from '../sketch/js/faraday.js';
import { MATERIAL_RECORDS, verdetConstant } from '../sketch/js/materials/catalogue.js';
import { parseSketch } from '../sketch/js/state.js';
import { stokesAngleDeg } from '../sketch/js/polarization.js';

await import('../sketch/js/detector-instruments.js');

const make = (type, x, y, params = {}, rot = 0) => {
  const el = createElement(type, x, y);
  Object.assign(el.params, params);
  el.rot = rot;
  return el;
};
const close = (a, b, tol, label = '') => assert.ok(Math.abs(a - b) <= tol, `${label} ${a} vs ${b}`);
const tgg = MATERIAL_RECORDS.get('tgg');
const linear = deg => ({ s1: Math.cos(2 * deg * Math.PI / 180), s2: Math.sin(2 * deg * Math.PI / 180), s3: 0 });
const dopOf = s => (s ? Math.hypot(s.s1, s.s2, s.s3) : 0);
const readout = (el, key) => registry[el.type].params.find(p => p.key === key).readout(el.params, el);

test('P2: the Verdet constant comes from the catalogue, or a custom constant, and is refused outside its data', () => {
  assert.deepEqual(FARADAY_MATERIAL_OPTIONS.map(([id]) => id), ['tgg', 'custom']);
  close(verdetAt({ material: 'tgg' }, 1064).verdet, verdetConstant(tgg, 1064), 1e-12);
  close(verdetAt({ material: 'tgg' }, 1064).verdet, -37.50, 0.01, 'TGG at 1064 nm (Vojna et al.)');
  assert.equal(verdetAt({ material: 'custom', verdetCustom: 3.8 }, 1550).verdet, 3.8);
  assert.equal(verdetAt({ material: 'custom', verdetCustom: 3.8 }, 400).verdet, 3.8, 'the same at every wavelength');
  // Outside 500–1100 nm TGG has no data: the element says so and why.
  for (const nm of [499, 1101, 1550]) {
    const v = verdetAt({ material: 'tgg' }, nm);
    assert.match(v.issue, /500–1100 nm/, String(nm));
  }
  assert.match(verdetAt({ material: 'tgg' }, NaN).issue, /no wavelength/);
});

test('P2: θ = V·B·L, turned about the field: opposite in the frame of light going the other way', () => {
  const p = { material: 'tgg', fieldT: 1, lengthMm: 20, fieldDir: 'along' };
  const along = faradayRotationDeg(p, 1064).deg;
  close(along, verdetConstant(tgg, 1064) * 1 * 0.02 * 180 / Math.PI, 1e-12, 'V B L');
  assert.ok(along < 0, 'TGG (V < 0) lowers the azimuth of light travelling along the field');
  close(rotationForCrossingDeg(p, 1064, true).deg, along, 1e-12);
  close(rotationForCrossingDeg(p, 1064, false).deg, -along, 1e-12, 'against the field');
  close(rotationForCrossingDeg({ ...p, fieldDir: 'against' }, 1064, true).deg, -along, 1e-12, 'field reversed');
  // Linear in B and L; no field, no rotation.
  close(faradayRotationDeg({ ...p, fieldT: 2 }, 1064).deg, 2 * along, 1e-12);
  close(faradayRotationDeg({ ...p, lengthMm: 10 }, 1064).deg, along / 2, 1e-12);
  assert.equal(faradayRotationDeg({ ...p, fieldT: 0 }, 1064).deg, 0);
  // A state turned by θ: a linear state's angle moves by θ; circular light
  // and unpolarized light keep theirs.
  close(stokesAngleDeg(rotateStokes(linear(10), 30)), 40, 1e-9);
  assert.deepEqual(rotateStokes({ s1: 0, s2: 0, s3: 1 }, 30), { s1: 0, s2: 0, s3: 1 });
  assert.equal(rotateStokes(null, 30), null);
});

test('P2: traced, a rotator turns the polarization; light crossing it backwards turns the other way in its own frame', () => {
  // 1064 nm, p-polarized, through 20 mm of TGG at 1 T: −43.0°.
  const L = make('cwlaser', 0, 0, { wavelength: 1064, pol: 0 });
  const F = make('faraday', 150, 0);
  traceScene([L, F]);
  const after = probeAt(250, 0);
  close(stokesAngleDeg(after.stokes), 180 + faradayRotationDeg(F.params, 1064).deg, 1e-6);
  assert.equal(after.approximation, null);
  // The same element turned round: the light now crosses against its arrow
  // and the field, and turns the other way.
  traceScene([L, make('faraday', 150, 0, {}, 180)]);
  close(stokesAngleDeg(probeAt(250, 0).stokes), -faradayRotationDeg(F.params, 1064).deg, 1e-6);
  // Crossing at an angle changes nothing (the path grows as 1/cos while the
  // field along the ray falls as cos).
  const tilted = make('cwlaser', 0, -26.8, { wavelength: 1064, pol: 0 }, 10);
  traceScene([tilted, make('faraday', 150, 0, { aperture: 30 })]);
  close(stokesAngleDeg(probeAt(250, 17.6, 4).stokes), 180 + faradayRotationDeg(F.params, 1064).deg, 1e-6);
});

test('P2: a Faraday mirror sends every return to the beamsplitter\'s return port, whatever the waveplate', () => {
  // Martinelli's universal compensator: p light through a PBS, a waveplate at
  // any angle, a 45° rotator and a mirror comes back s-polarized; without
  // the field the return depends on the waveplate (sin²2a for λ/4).
  const returned = (a, fieldT) => {
    const port = make('detector', 100, 125, {}, 90);
    traceScene([make('cwlaser', -50, 0, { wavelength: 1064, pol: 0, beamMode: 'line' }), make('pbs', 100, 0), make('qwp', 200, 0, { a }),
      make('faraday', 300, 0, { lengthMm: 20.941912, fieldT }), make('mirror', 400, 0), port]);
    return detectorReading(port.id)?.signal ?? 0;
  };
  for (const a of [0, 10, 22, 37, 60]) {
    close(returned(a, 1), 1, 1e-6, `rotator on, λ/4 at ${a}°`);
    close(returned(a, 0), Math.sin(2 * a * Math.PI / 180) ** 2, 1e-6, `no field, λ/4 at ${a}°`);
  }
  // A half-wave plate instead of the rotator, the reciprocal case: the
  // return pass undoes it, and p light goes back through the PBS.
  const port = make('detector', 100, 125, {}, 90);
  traceScene([make('cwlaser', -50, 0, { wavelength: 1064, pol: 0, beamMode: 'line' }), make('pbs', 100, 0), make('hwp', 300, 0, { a: 22.5 }), make('mirror', 400, 0), port]);
  assert.ok(!(detectorReading(port.id)?.signal > 1e-9), 'a waveplate cannot do it');
});

test('P2: the physical isolator: cos²δ forward and sin²δ back with ideal polarizers, the extinction ratio below that', () => {
  const ideal = { material: 'tgg', designWl: 800, inputAxis: 0, extinctionDb: 300 };
  for (const nm of [700, 760, 800, 830, 900]) {
    const f = isolatorFigures(ideal, nm);
    const delta = (f.rotationDeg - 45) * Math.PI / 180;
    close(f.rotationDeg, 45 * verdetConstant(tgg, nm) / verdetConstant(tgg, 800), 1e-9, `rotation at ${nm}`);
    close(f.forward, Math.cos(delta) ** 2, 1e-12, `forward at ${nm}`);
    close(f.backward, Math.sin(delta) ** 2, 1e-12, `back at ${nm}`);
  }
  // At the design wavelength the polarizers set the isolation.
  const real = { ...ideal, extinctionDb: 40 };
  close(isolatorFigures(real, 800).isolationDb, 40, 1e-9);
  // (To 1e-18: 10 ** −4 differs in its last bit between platforms.)
  close(leakOfExtinction(40), 1e-4, 1e-18);
  close(isolatorFieldLength(real), (Math.PI / 4) / Math.abs(verdetConstant(tgg, 800)), 1e-15);
  // The input polarizer's angle does not change the figures.
  close(isolatorFigures({ ...real, inputAxis: 30 }, 780).isolationDb, isolatorFigures(real, 780).isolationDb, 1e-9);
  // Unpolarized light keeps half going forward, and leaves along the output
  // polarizer.
  const half = isolatorCrossing(real, 800, null, true);
  close(half.transmission, 0.5, 1e-4);
  close(stokesAngleDeg(half.stokes), 45, 1e-6);
  // No design without a Verdet constant at the design wavelength.
  assert.match(isolatorRotationDeg({ ...real, designWl: 1550 }, 800).issue, /design wavelength/);
  assert.equal(isolatorFieldLength({ ...real, designWl: 1550 }), null);
});

test('P2: traced, the physical isolator leaks back what the figures say, and polarizes its output', () => {
  const scene = model => {
    const back = make('powermeter', 60, 140, {}, 90);
    const iso = make('isolator', 150, 0, { isolatorModel: model, designWl: 1064, inputAxis: 0, extinctionDb: 40 });
    const out = [make('cwlaser', -50, 0, { wavelength: 1000, pol: 0, beamMode: 'line', avgPowerW: 1 }), make('bs', 60, 0), iso, make('mirror', 300, 0), back];
    traceScene(out);
    return { back: detectorReading(back.id)?.signal ?? 0, iso };
  };
  // Through a 50/50 splitter both ways: a quarter of what the isolator lets
  // back.
  const physical = scene('physical');
  const f = isolatorFigures(physical.iso.params, 1000);
  // (To 1e-3: the forward light leaves along the output polarizer only to
  // its extinction, so its reflection is not exactly the state the figure
  // assumes.)
  close(physical.back / (0.25 * f.forward * f.backward), 1, 1e-3, 'leak at 1000 nm');
  assert.ok(f.isolationDb > 17 && f.isolationDb < 19, String(f.isolationDb));
  // The ideal gate, still the default, lets nothing back.
  assert.equal(createElement('isolator', 0, 0).params.isolatorModel, 'ideal');
  assert.ok(!(scene('ideal').back > 0));
  // The physical isolator's output is polarized along its output polarizer,
  // whatever arrives; the ideal gate leaves the state as it was.
  for (const [model, angle] of [['physical', 45], ['ideal', 30]]) {
    traceScene([make('cwlaser', -50, 0, { wavelength: 1064, pol: 30, beamMode: 'line' }), make('isolator', 150, 0, { isolatorModel: model, designWl: 1064 })]);
    // (To 0.01°: a 40 dB polarizer leaves a trace of the light across it.)
    close(stokesAngleDeg(probeAt(250, 0).stokes), angle, 0.01, model);
  }
});

test('P2: a broadband pulse leaks back at the wings of its spectrum, weighed wavelength by wavelength', () => {
  // A 15 fs pulse at 800 nm (about 63 nm wide) into an isolator designed for
  // 800 nm: the return is far weaker than a narrow line's would be wrong by,
  // and its spectrum has its hole at the design wavelength.
  const back = make('spectrometer', 60, 140, {}, 90);
  const iso = make('isolator', 150, 0, { isolatorModel: 'physical', designWl: 800, inputAxis: 0, extinctionDb: 40 });
  const laser = make('pulsedlaser', -50, 0, { wavelength: 800, pulseWidthFs: 15, pol: 0, beamMode: 'line' });
  traceScene([laser, make('bs', 60, 0), iso, make('mirror', 300, 0), back]);
  const reading = detectorReading(back.id);
  const leaked = reading.signal / 0.25;
  // At the centre the isolation is 40 dB; over the band the leak is set by
  // its wings.
  assert.ok(leaked > 10 * 1e-4 && leaked < 0.02, `band-averaged leak ${leaked}`);
  const text = readout(iso, 'isolation');
  assert.match(text, /800 nm: rotation \+45\.0°, forward transmission 100\.0 %, isolation 40\.0 dB; at 768\.\d nm and 831\.\d nm/);
  assert.equal([...text.matchAll(/^800 nm/gm)].length, 1, 'one line per wavelength, though light crosses both ways');
});

test('P2: where the material has no data the light is not changed silently: it carries a caveat', () => {
  // 1550 nm through TGG (data 500–1100 nm): the rotator keeps the state and
  // says why; the physical isolator passes the light as the ideal gate.
  const F = make('faraday', 150, 0);
  traceScene([make('cwlaser', 0, 0, { wavelength: 1550, pol: 20 }), F]);
  const after = probeAt(250, 0);
  close(stokesAngleDeg(after.stokes), 20, 1e-6);
  assert.match(after.approximation, /Polarization not computed past a Faraday rotator: .*500–1100 nm/);
  assert.match(readout(F, 'rotation'), /1550 nm: not computed/);
  const iso = make('isolator', 150, 0, { isolatorModel: 'physical', designWl: 1064 });
  traceScene([make('cwlaser', 0, 0, { wavelength: 1550, pol: 0 }), iso]);
  assert.match(probeAt(250, 0).approximation, /Isolation not computed at an optical isolator/);
  assert.match(readout(iso, 'isolation'), /1550 nm: not computed/);
  // A pulse whose band turns by different amounts leaves partly polarized
  // (the spectrum's average), and says so.
  traceScene([make('pulsedlaser', 0, 0, { wavelength: 800, pulseWidthFs: 15, pol: 0, beamMode: 'line' }), make('faraday', 150, 0)]);
  assert.match(probeAt(250, 0).approximation, /varies across its spectrum/);
  assert.ok(Math.hypot(probeAt(250, 0).stokes.s1, probeAt(250, 0).stokes.s2) < 0.99);
  // A narrow line does not.
  traceScene([make('cwlaser', 0, 0, { wavelength: 800, pol: 0 }), make('faraday', 150, 0)]);
  assert.equal(probeAt(250, 0).approximation, null);
});

test('P2: readouts give the rotation at each wavelength present, in each direction', () => {
  const F = make('faraday', 300, 0, { lengthMm: 20.941912 });
  assert.match(readout(F, 'rotation'), /No light crosses it yet/);
  traceScene([make('cwlaser', -50, 0, { wavelength: 1064, pol: 0, beamMode: 'line' }), make('pbs', 100, 0), F, make('mirror', 400, 0)]);
  const text = readout(F, 'rotation');
  assert.match(text, /1064 nm, travelling along the field: −45\.0°; V = −37\.50 rad\/\(T·m\)/);
  assert.match(text, /1064 nm, travelling against the field: \+45\.0°/);
  assert.ok(faradayReading(F.id).every(c => c.power > 0));
  // A dark crossing is not listed.
  assert.ok(!/NaN|undefined/.test(text));
});

test('P2: a switching modulator\'s two states are both turned', () => {
  const eom = make('eom', 100, 0, { modulate: true, driveMode: 'switching', switchMode: 'flip', a: 0 });
  traceScene([make('cwlaser', 0, 0, { wavelength: 1064, pol: 0 }), eom, make('faraday', 200, 0)]);
  const after = probeAt(300, 0);
  assert.ok(after.polMod, 'the modulation survives the rotator');
  const turn = faradayRotationDeg({ material: 'tgg', fieldT: 1, lengthMm: 20, fieldDir: 'along' }, 1064).deg;
  close(((stokesAngleDeg(after.polMod.stokesLow) - turn) % 180 + 180) % 180, 0, 1e-6, 'low state');
  close(((stokesAngleDeg(after.polMod.stokesHigh) - turn) % 180 + 180) % 180, 90, 1e-6, 'high state');
});

test('P2: saved setups open unchanged; new settings normalise', () => {
  const opened = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [
    { id: 'i', type: 'isolator', x: 0, y: 0, rot: 0, params: { aperture: 22 } },
    { id: 'f', type: 'faraday', x: 0, y: 0, rot: 0, params: { material: 'yig', fieldT: -3, lengthMm: 0, fieldDir: 'sideways' } },
  ], beams: [] }), registry);
  const [iso, rotator] = opened.elements;
  assert.equal(iso.params.isolatorModel, 'ideal', 'an isolator saved before keeps the one-way gate');
  assert.equal(rotator.params.material, 'tgg');
  assert.equal(rotator.params.fieldT, 0);
  assert.equal(rotator.params.lengthMm, 1);
  assert.equal(rotator.params.fieldDir, 'along');
  // The rotator is offered in the Polarization library with search terms.
  assert.equal(registry.faraday.category, 'Polarization');
  assert.ok(registry.faraday.aliases.includes('Verdet constant'));
});

// Andrea's review of the first version (PR #335, round 1).
test('P2 (review): a 40 dB leak is kept and read, down to 80 dB', () => {
  // 1 W at the design wavelength sent back along the output polarizer.
  for (const er of [30, 40, 50, 60, 80]) {
    const meter = make('powermeter', -100, 0, {}, 180);
    const scene = [make('cwlaser', 300, 0, { wavelength: 800, pol: 135, beamMode: 'line', avgPowerW: 1 }, 180),
      make('isolator', 100, 0, { isolatorModel: 'physical', designWl: 800, extinctionDb: er }), meter];
    traceScene(scene);
    close(enhancedReading(meter, scene).detectedPowerW, 10 ** (-er / 10), 10 ** (-er / 10) * 1e-6, `${er} dB`);
  }
});

test('P2 (review): a broadband leak carries its state as the spectrum\'s average, so a polarizer reads the right power', async () => {
  // The example (a 15 fs pulse sent into the isolator from its output side)
  // with a polarizer at 0° after it: the leak at the wings, along the input
  // polarizer, passes; the leak at the centre, across it, does not. The
  // average state gives what a per-wavelength sum gives (the state of the
  // centre alone gave a few nW in the first version).
  const scene = parseSketch(await readFile(new URL('../Examples/Ultrashort Pulses/Optical isolator — isolation across a pulse spectrum.json', import.meta.url), 'utf8'), registry);
  const meter = make('powermeter', 60, 250, {}, 180);
  scene.elements.splice(scene.elements.findIndex(e => e.id === 'spectrometer'), 1, make('polarizer', 150, 250, { pangle: 0 }), meter);
  traceScene(scene.elements, scene.beams);
  const iso = scene.elements.find(e => e.id === 'isolator'), laser = scene.elements.find(e => e.id === 'laser');
  // The sum over the source's spectrum, wavelength by wavelength, of what
  // crosses the isolator back and then the polarizer (axis 0° in the light's
  // own frame, going back).
  const { spectrumSamples, gaussianSpectrum, transformLimitedBandwidthNm } = await import('../sketch/js/spectrum.js');
  const samples = spectrumSamples(gaussianSpectrum(800, transformLimitedBandwidthNm(laser.params.pulseWidthFs, 800, 'gauss')), 400);
  let expected = 0;
  for (const { wl, weight } of samples) {
    const c = isolatorCrossing(iso.params, wl, linear(135), false);
    const angle = stokesAngleDeg(c.stokes);
    expected += weight * c.transmission * (Math.cos((angle - 0) * Math.PI / 180) ** 2 * dopOf(c.stokes) + (1 - dopOf(c.stokes)) / 2);
  }
  close(enhancedReading(meter, scene.elements).detectedPowerW, expected * laser.params.avgPowerW, expected * 0.01);
});

test('P2 (review 4): a beam that crossed an isolator forward and comes back through it is declared, not computed', () => {
  // Forward through the isolator its wavelengths leave in states that differ
  // very slightly; the app carries one average state, and the return pass
  // needs each one: it says so instead of quoting a figure that could be off
  // by as much as that spread times the power.
  const meter = make('powermeter', 60, 140, {}, 90);
  const scene = [make('pulsedlaser', -50, 0, { wavelength: 800, pulseWidthFs: 15, pol: 0, beamMode: 'line', avgPowerW: 1 }), make('bs', 60, 0, { ratio: 0.9 }),
    make('isolator', 200, 0, { isolatorModel: 'physical', designWl: 800, extinctionDb: 40 }), make('mirror', 350, 0), meter];
  traceScene(scene);
  assert.ok(detectorReading(meter.id).approximations.some(a => /not computed past a second Faraday element/.test(a)));
  // Andrea's round-4 cases: a rotator whose spread lowers the degree of
  // polarization by only 4e-7, then a second rotator and an analyzer at 150°.
  const second = make('powermeter', 400, 0);
  traceScene([make('pulsedlaser', -50, 0, { wavelength: 800, pulseWidthFs: 100, pol: 0, beamMode: 'line', avgPowerW: 1 }),
    make('faraday', 100, 0, { lengthMm: 10, fieldT: 0.05 }), make('faraday', 200, 0, { lengthMm: 10, fieldT: 7 }), make('polarizer', 300, 0, { pangle: 150 }), second]);
  assert.ok(detectorReading(second.id).approximations.some(a => /not computed past a second Faraday element/.test(a)));
});

test('P2 (review): a switching modulator keeps its two states through the isolator', () => {
  // Pulses at 80 MHz, the modulator switching in step with them: every
  // pulse meets the same state, and half a period later the other one.
  const read = phase => {
    const meter = make('powermeter', 500, 0);
    const scene = [make('pulsedlaser', -50, 0, { wavelength: 800, pol: 0, beamMode: 'line', avgPowerW: 1, repRateMHz: 80, pulseWidthFs: 1000 }),
      make('eom', 50, 0, { modulate: true, driveMode: 'switching', switchMode: 'flip', a: 0, switchFreqMHz: 80, switchDuty: 0.5, switchPhaseNs: phase }),
      make('isolator', 200, 0, { isolatorModel: 'physical', material: 'custom', verdetCustom: -40, designWl: 800, extinctionDb: 10 }),
      make('polarizer', 320, 0, { pangle: 135 }), meter];
    traceScene(scene);
    return enhancedReading(meter, scene)?.detectedPowerW ?? 0;
  };
  // Horizontal light passes and leaves at 45°, which the analyzer at 135°
  // stops; vertical light leaks 1/10 through the input polarizer and 1/10
  // through the output one, across it, at 135°: 10 mW.
  close(read(0), 0.01, 1e-9);
  close(read(6.25), 0, 1e-9);
});

test('P2 (review): a leak whose field changes sign across its band has no duration', async () => {
  // Going back, the leak's amplitude follows sin δ, which changes sign at the
  // design wavelength inside the band: not one scalar pulse (Andrea's vector
  // transform gives 195 fs, the scalar one 91.7 fs). The duration is
  // declined, not invented.
  const scene = parseSketch(await readFile(new URL('../Examples/Ultrashort Pulses/Optical isolator — isolation across a pulse spectrum.json', import.meta.url), 'utf8'), registry);
  scene.elements.find(e => e.id === 'laser').params.pulseWidthFs = 100;
  traceScene(scene.elements, scene.beams);
  const pulse = detectorReading('spectrometer').pulse;
  assert.equal(pulse.stretchedPulseWidthFs, null);
  assert.match(pulse.fieldIssue, /not one scalar pulse; duration unavailable/);
  // Going forward the same pulse keeps a duration: no sign change there.
  const meter = make('powermeter', 400, 0);
  traceScene([make('pulsedlaser', -50, 0, { wavelength: 800, pulseWidthFs: 100, pol: 0, beamMode: 'line' }), make('isolator', 150, 0, { isolatorModel: 'physical', designWl: 800 }), meter]);
  assert.ok(Number.isFinite(detectorReading(meter.id).pulse.stretchedPulseWidthFs));
});

test('P2 (review 2): a second Faraday element does not pretend to know the states a first one averaged', () => {
  // Two identical TGG rotators with opposite fields and a crossed analyzer:
  // every wavelength turns by θ(λ) and back, so nothing should pass; from the
  // first rotator's average state the second cannot recover that. The power
  // after the analyzer is said not to be computed.
  const meter = make('powermeter', 400, 0);
  const scene = [make('pulsedlaser', -50, 0, { wavelength: 800, pulseWidthFs: 15, pol: 0, beamMode: 'line', avgPowerW: 1 }),
    make('faraday', 100, 0), make('faraday', 200, 0, { fieldDir: 'against' }), make('polarizer', 300, 0, { pangle: 90 }), meter];
  traceScene(scene);
  assert.ok(detectorReading(meter.id).approximations.some(a => /not computed past a second Faraday element/.test(a)));
});

test('P2 (review 3): the mark that states were averaged does not wait for the caveat, and survives a polarizer', () => {
  const crossed = (fs, between = []) => {
    const meter = make('powermeter', 400, 0);
    const scene = [make('pulsedlaser', -50, 0, { wavelength: 800, pulseWidthFs: fs, pol: 0, beamMode: 'line', avgPowerW: 1 }),
      make('faraday', 100, 0, { fieldT: 5 }), ...between, make('faraday', 200, 0, { fieldT: 5, fieldDir: 'against' }), make('polarizer', 300, 0, { pangle: between.length ? 0 : 90 }), meter];
    traceScene(scene);
    return detectorReading(meter.id)?.approximations || [];
  };
  // At 30 fs the first rotator lowers the degree of polarization by less
  // than its caveat's 0.01, but the second still needs each wavelength's
  // state (Andrea: 6.78 mW of 1 W read, none should pass).
  assert.ok(crossed(30).some(a => /not computed past a second Faraday element/.test(a)));
  // A polarizer between them leaves one state but passes each wavelength
  // by cos²θ(λ), which the average spectrum does not carry.
  assert.ok(crossed(15, [make('polarizer', 150, 0, { pangle: 0 })]).some(a => /not computed past a second Faraday element/.test(a)));
  // One isolator's forward pass changes the states by less than 1e-6 of
  // the power: its own return through it is still computed (the example).
});

test('P2 (review 3): every sign change of the leak declines the duration, and so does the modulator branch', () => {
  // Designed at 1064 nm, 60 dB: a 100 fs pulse at 547 nm sent back along the
  // output polarizer crosses δ = 180° at 547.5 nm.
  const back = (extra = []) => {
    const meter = make('powermeter', -100, 0, {}, 180);
    traceScene([make('pulsedlaser', 300, 0, { wavelength: 547, pulseWidthFs: 100, pol: 135, beamMode: 'line', avgPowerW: 1 }, 180), ...extra,
      make('isolator', 100, 0, { isolatorModel: 'physical', designWl: 1064, extinctionDb: 60 }), meter]);
    return detectorReading(meter.id)?.pulse;
  };
  assert.match(back().fieldIssue || '', /not one scalar pulse/);
  // The same field through a switching modulator that does nothing (both
  // states unretarded): still declined.
  const eom = make('eom', 200, 0, { modulate: true, driveMode: 'switching', switchMode: 'custom', retardanceLow: 0, retardanceHigh: 0, a: 0 }, 180);
  assert.match(back([eom]).fieldIssue || '', /not one scalar pulse/);
});

test('P2 (review 2): a polarimeter after the isolator reads the state of the pulses that arrive', () => {
  const read = phase => {
    const pm = make('polarimeter', 400, 0);
    traceScene([make('pulsedlaser', -50, 0, { wavelength: 800, pol: 0, beamMode: 'line', avgPowerW: 1, repRateMHz: 80, pulseWidthFs: 1000 }),
      make('eom', 50, 0, { modulate: true, driveMode: 'switching', switchMode: 'flip', a: 0, switchFreqMHz: 80, switchDuty: 0.5, switchPhaseNs: phase }),
      make('isolator', 200, 0, { isolatorModel: 'physical', material: 'custom', verdetCustom: -40, designWl: 800, extinctionDb: 10 }), pm]);
    return detectorReading(pm.id).normalizedStokes;
  };
  close(read(0).s2, -1, 1e-6, 'linear 135°');
  close(read(6.25).s2, 1, 1e-6, 'linear 45°');
});

test('P2 (review 2): parts missing data at both ends of a band are named apart', () => {
  traceScene([make('sclaser', 0, 0, { scMin: 450, scMax: 1200, beamMode: 'line', pol: 0 }), make('faraday', 150, 0)]);
  assert.match(probeAt(250, 0).approximation, /for 450–\d+ nm and 11\d\d–1200 nm of this light's spectrum/);
});

test('P2 (review): a band partly outside the material\'s data names the part that is not computed', () => {
  // 15 fs at 1090 nm reaches past TGG's 1100 nm.
  traceScene([make('pulsedlaser', 0, 0, { wavelength: 1090, pulseWidthFs: 15, pol: 0, beamMode: 'line' }), make('faraday', 150, 0)]);
  assert.match(probeAt(250, 0).approximation, /Polarization not computed past a Faraday rotator for 1101–\d+ nm of this light's spectrum/);
  traceScene([make('pulsedlaser', 0, 0, { wavelength: 1090, pulseWidthFs: 15, pol: 0, beamMode: 'line' }), make('isolator', 150, 0, { isolatorModel: 'physical', designWl: 1064 })]);
  assert.match(probeAt(250, 0).approximation, /Isolation not computed at an optical isolator for 1101–\d+ nm of this light's spectrum/);
});

test('P2 (review): a lamp\'s lines are read one by one', () => {
  const F = make('faraday', 150, 0, { aperture: 40 });
  traceScene([make('pointsource', 0, 0, { sourceKind: 'lamp', lampType: 'hg', spread: 10, nrays: 12 }), make('lens', 120, 0, { f: 100, dia: 50 }), F]);
  const text = readout(F, 'rotation');
  for (const line of ['546.1 nm, travelling along the field', '577 nm, travelling along the field', '579.1 nm, travelling along the field', '1014 nm, travelling along the field']) {
    assert.ok(text.includes(line), `${line}\n${text}`);
  }
  assert.match(text, /435\.8 nm: not computed/);
});

// Andrea's review, round 5.
test('P2 (review 5): a modulator whose two states are the same changes nothing at the isolator', async () => {
  const read = async (extra, analyzer = false) => {
    const scene = parseSketch(await readFile(new URL('../Examples/Ultrashort Pulses/Optical isolator — isolation across a pulse spectrum.json', import.meta.url), 'utf8'), registry);
    scene.elements.push(...extra);
    if (analyzer) scene.elements.push(make('polarizer', 150, 250, { pangle: 0 }));
    traceScene(scene.elements, scene.beams);
    return enhancedReading(scene.elements.find(e => e.id === 'spectrometer'), scene.elements)?.detectedPowerW ?? 0;
  };
  const neutral = () => [make('eom', 400, 250, { modulate: true, driveMode: 'switching', switchMode: 'custom', retardanceLow: 0, retardanceHigh: 0, a: 0 }, 180)];
  close(await read(neutral()), await read([]), 1e-9, 'unchanged');
  close(await read([]), 3.953e-3, 0.002e-3);
  close(await read(neutral(), true), await read([], true), 1e-9, 'with an analyzer, unchanged');
});

test('P2 (review 5): a rotator that turns a pulse\'s wavelengths differently declines its duration', () => {
  const after = fieldT => {
    const meter = make('powermeter', 300, 0);
    traceScene([make('pulsedlaser', -50, 0, { wavelength: 800, pulseWidthFs: 15, pol: 0, beamMode: 'line' }), make('faraday', 150, 0, { fieldT }), meter]);
    return detectorReading(meter.id).pulse;
  };
  // 20 mm of TGG at 10 T: two lobes at ±15.2 fs (Andrea's Jones transform).
  assert.match(after(10).fieldIssue || '', /not one scalar pulse/);
  // No field, no turn: the duration stays.
  assert.ok(!after(0).fieldIssue && Number.isFinite(after(0).stretchedPulseWidthFs));
});

test('P2 (review 5): identical partly polarized states are not taken for a spread', () => {
  // An unpolarized LED through a forward isolator with a constant Verdet
  // constant and 10 dB polarizers leaves every wavelength in the same partly
  // polarized state; a rotator at zero field and an analyzer at 45° read
  // 0.5 W with no caveat.
  const meter = make('powermeter', 450, 0);
  traceScene([make('ledsource', -50, 0, { ledPreset: 'custom', wavelength: 800, bandwidth: 60, avgPowerW: 1, beamMode: 'line' }),
    make('isolator', 100, 0, { isolatorModel: 'physical', material: 'custom', verdetCustom: -40, designWl: 800, extinctionDb: 10 }),
    make('faraday', 200, 0, { fieldT: 0 }), make('polarizer', 300, 0, { pangle: 45 }), meter]);
  assert.ok(!(detectorReading(meter.id).approximations || []).some(a => /second Faraday element/.test(a)));
});

// Andrea's review, round 6: a flip modulator synchronized with the laser
// (80 MHz, duty 0.5, phase 0) sends every pulse at 90°, though its two
// states average to no polarization.
const syncedFlip = () => [make('pulsedlaser', -50, 0, { wavelength: 800, pol: 0, beamMode: 'line', avgPowerW: 1, repRateMHz: 80 }),
  make('eom', 30, 0, { modulate: true, driveMode: 'switching', switchMode: 'flip', a: 0, switchFreqMHz: 80, switchDuty: 0.5, switchPhaseNs: 0 })];
test('P2 (review 6): a rotator checks each of a modulator\'s states for its spread', () => {
  const [laser, eom] = syncedFlip();
  laser.params.pulseWidthFs = 15;
  const meter = make('powermeter', 400, 0);
  traceScene([laser, eom, make('faraday', 150, 0, { fieldT: 10 }), make('polarizer', 300, 0, { pangle: 47 }), meter]);
  const reading = detectorReading(meter.id);
  assert.match(reading.pulse.fieldIssue || '', /not one scalar pulse/);
  assert.ok(reading.approximations.some(a => /modulator's two states/.test(a)), JSON.stringify(reading.approximations));
});

test('P2 (review 6): an isolator checks each of a modulator\'s states for reshaping', () => {
  const [laser, eom] = syncedFlip();
  laser.params.pulseWidthFs = 50;
  const meter = make('powermeter', 400, 0);
  traceScene([laser, eom, make('isolator', 150, 0, { isolatorModel: 'physical', designWl: 800, inputAxis: 0, extinctionDb: 40 }), meter]);
  const reading = detectorReading(meter.id);
  assert.match(reading.pulse.fieldIssue || '', /not one scalar pulse/);
  assert.ok(reading.approximations.some(a => /modulator's two states/.test(a)), JSON.stringify(reading.approximations));
});
