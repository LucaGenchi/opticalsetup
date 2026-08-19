import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createElement, registry, newSampleChannel, sampleChannels, specimenTypeOf,
  signalKindsFor, channelWarning, defaultEmissionWl, drivingExcitationWl,
  ramanShifts, ramanStokesWl, LINEAR_SIGNAL_KINDS, NONLINEAR_SIGNAL_KINDS,
  SPECIMEN_TYPES, MODIFIER_KINDS, EMISSION_ORDER,
} from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceAll, traceScene, detectorReading, specimenSignalWl, specimenIncidentWls } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';

const ch = (kind, over = {}) => ({ ...newSampleChannel(kind), ...over });

// Isotropic signals are evanescent — they die within 25 mm unless something
// collects them — so these benches put an objective right after the specimen,
// the way a real microscope does.
function collectBench(specimenType, channels, wavelengths = [800]) {
  const lasers = wavelengths.map((wl, i) => {
    const laser = createElement('laser', 0, (i - (wavelengths.length - 1) / 2) * 6);
    Object.assign(laser.params, { wavelength: wl, beamMode: 'line' });
    return laser;
  });
  const sample = createElement('sample', 150, 0);
  sample.rot = 90; // the specimen surface is horizontal at rot 0
  Object.assign(sample.params, { aperture: 40, specimenType, channels });
  const objective = createElement('objective', 154, 0);
  objective.params.f = 20;
  const detector = createElement('detector', 320, 0);
  detector.params.aperture = 60;
  return [...lasers, sample, objective, detector];
}

function collectedWls(...args) {
  const elements = collectBench(...args);
  traceAll(elements);
  const reading = detectorReading(elements[elements.length - 1].id);
  return reading ? [...new Set(reading.spectrum.map(s => Math.round(s.wavelength)))].sort((a, b) => a - b) : [];
}

// ---------------- the four specimen types ----------------

test('a specimen is one of four types, and only two of them carry signals', () => {
  assert.deepEqual(SPECIMEN_TYPES.map(([id]) => id), ['absorbing', 'resin', 'linear', 'nonlinear']);
  assert.deepEqual(signalKindsFor('absorbing'), []);
  assert.deepEqual(signalKindsFor('resin'), []);
  assert.deepEqual(signalKindsFor('linear').map(([id]) => id), ['fluor', 'raman', 'phase']);
  assert.deepEqual(signalKindsFor('nonlinear').map(([id]) => id),
    ['tpef', 'thpef', 'shg', 'thg', 'sfg', 'cars', 'srs']);
});

test('both the plain sample and the piezo holder offer the same specimen types', () => {
  for (const type of ['sample', 'stage']) {
    const spec = registry[type].params.find(p => p.key === 'specimenType');
    assert.ok(spec, `${type} should expose a specimen type`);
    assert.deepEqual(spec.options, SPECIMEN_TYPES);
    assert.equal(spec.def, 'absorbing');
  }
});

test('an absorbing specimen attenuates, and blocks the beam outright at zero transmission', () => {
  const laser = createElement('laser', 0, 0);
  const sample = createElement('sample', 150, 0);
  sample.rot = 90;
  Object.assign(sample.params, { specimenType: 'absorbing', transmission: 0.4 });
  const detector = createElement('detector', 300, 0);

  traceAll([laser, sample, detector]);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.4) < 1e-9, 'transmission passes straight through');

  sample.params.transmission = 0;
  traceAll([laser, sample, detector]);
  assert.equal(detectorReading(detector.id), null, 'max attenuation blocks the beam');
});

test('an absorbing or resin specimen never emits, even with channels left over from another type', () => {
  for (const type of ['absorbing', 'resin']) {
    const channels = [ch('fluor', { eff: 0.9 }), ch('shg', { eff: 0.9 })];
    const sample = createElement('sample', 0, 0);
    Object.assign(sample.params, { specimenType: type, channels });
    assert.deepEqual(sampleChannels(sample.params), [], `${type} generates nothing`);
    // The rows are kept in params, so switching back restores the user's work.
    assert.equal(sample.params.channels.length, 2);
  }
});

test('a specimen only honors channels its own type offers', () => {
  const linear = createElement('sample', 0, 0);
  Object.assign(linear.params, { specimenType: 'linear', channels: [ch('fluor'), ch('shg'), ch('cars')] });
  assert.deepEqual(sampleChannels(linear.params).map(c => c.kind), ['fluor']);

  const nonlinear = createElement('sample', 0, 0);
  Object.assign(nonlinear.params, { specimenType: 'nonlinear', channels: [ch('fluor'), ch('shg'), ch('raman')] });
  assert.deepEqual(sampleChannels(nonlinear.params).map(c => c.kind), ['shg']);
});

// ---------------- 3a / 4a / 4b: emission wavelengths ----------------

test('fluorescence emits one Stokes offset above the excitation by default', () => {
  assert.equal(defaultEmissionWl('fluor', 800), 820);
  assert.equal(collectedWls('linear', [ch('fluor', { eff: 0.5 })]).includes(820), true);
  // A different bench moves the default with it.
  assert.equal(collectedWls('linear', [ch('fluor', { eff: 0.5 })], [488]).includes(508), true);
});

test('two- and three-photon fluorescence default to half and a third of the excitation, plus the offset', () => {
  assert.equal(defaultEmissionWl('tpef', 800), 420);
  assert.equal(defaultEmissionWl('thpef', 800), 287);
  assert.ok(collectedWls('nonlinear', [ch('tpef', { eff: 0.5 })]).includes(420));
  assert.ok(collectedWls('nonlinear', [ch('thpef', { eff: 0.5 })]).includes(287));
  assert.deepEqual(EMISSION_ORDER, { fluor: 1, tpef: 2, thpef: 3 });
});

test('with several beams the shortest wavelength drives the emission, and only once', () => {
  assert.equal(drivingExcitationWl([1040, 800, 920]), 800);
  const wls = collectedWls('linear', [ch('fluor', { eff: 0.5 })], [800, 1040]);
  assert.ok(wls.includes(820), `the 800 nm beam drives it, got ${wls}`);
  assert.ok(!wls.includes(1060), 'the longer beam does not emit a second copy');
});

test('a manual emission wavelength is honored, and one below the photon-energy floor emits nothing', () => {
  assert.ok(collectedWls('linear', [ch('fluor', { eff: 0.5, autoWl: false, wl: 900 })]).includes(900));
  // 400 nm is more energetic than the 800 nm photon that would have to pump it.
  assert.deepEqual(collectedWls('linear', [ch('fluor', { eff: 0.5, autoWl: false, wl: 400 })]), [800]);
  // 2PEF: two 800 nm photons reach 400 nm, so 380 is impossible but 450 works.
  assert.deepEqual(collectedWls('nonlinear', [ch('tpef', { eff: 0.5, autoWl: false, wl: 380 })]), [800]);
  assert.ok(collectedWls('nonlinear', [ch('tpef', { eff: 0.5, autoWl: false, wl: 450 })]).includes(450));
});

test('emission warnings name the floor the wavelength has to clear', () => {
  const warn = (kind, wl) => channelWarning(ch(kind, { autoWl: false, wl }), [800]);
  assert.equal(warn('fluor', 900), null, 'a longer wavelength is fine');
  assert.match(warn('fluor', 400), /800 nm excitation photon\b/);
  assert.match(warn('fluor', 400), /must exceed 800 nm/);
  assert.match(warn('tpef', 380), /2 combined 800 nm excitation photons/);
  assert.match(warn('tpef', 380), /must exceed 400 nm/);
  assert.match(warn('thpef', 250), /must exceed 267 nm/);
  assert.equal(warn('thpef', 300), null);
  // An auto-tracking channel is correct by construction and never warns.
  assert.equal(channelWarning(ch('fluor'), [800]), null);
});

// ---------------- 3b: spontaneous Raman ----------------

test('spontaneous Raman emits its material fingerprint, Stokes-shifted from the excitation', () => {
  // DMSO's real lines at 532 nm excitation.
  assert.deepEqual(ramanShifts('dmso'), [670, 1042, 2913, 2994]);
  const expected = ramanShifts('dmso').map(sh => Math.round(ramanStokesWl(532, sh)));
  assert.deepEqual(expected, [552, 563, 630, 633]);

  const wls = collectedWls('linear', [ch('raman', { eff: 0.5, material: 'dmso' })], [532]);
  for (const line of expected) assert.ok(wls.includes(line), `missing the ${line} nm line from ${wls}`);
});

test('the Raman fingerprint moves with the excitation but keeps its shifts', () => {
  // The same material pumped at a different colour lands on different
  // wavelengths, but the cm^-1 shifts are unchanged — that is the point of
  // a fingerprint.
  const shiftOf = (pump, line) => Math.round((1 / pump - 1 / line) * 1e7);
  for (const pump of [532, 800]) {
    for (const shift of ramanShifts('lipid')) {
      assert.equal(shiftOf(pump, ramanStokesWl(pump, shift)), shift);
    }
  }
  // Every offered material is a real, distinct fingerprint.
  const all = ['lipid', 'protein', 'dmso', 'pmma', 'polystyrene', 'water'];
  const seen = new Set();
  for (const m of all) {
    const key = ramanShifts(m).join(',');
    assert.ok(!seen.has(key), `${m} duplicates another material`);
    seen.add(key);
  }
});

test('an anti-Stokes-side shift that would need more energy than the pump is dropped', () => {
  assert.equal(ramanStokesWl(200, 60000), null);
  assert.ok(ramanStokesWl(800, 2900) > 800, 'Stokes lines are always redder than the pump');
});

// ---------------- 3c: phase contrast ----------------

test('phase contrast retards the transmitted beam without adding light of its own', () => {
  const readPolarization = (retardance, axis) => {
    const laser = createElement('laser', 0, 0);
    Object.assign(laser.params, { pol: 0, beamMode: 'line' });
    const sample = createElement('sample', 150, 0);
    sample.rot = 90;
    Object.assign(sample.params, { specimenType: 'linear', channels: [ch('phase', { retardance, axis })] });
    const polarimeter = createElement('polarimeter', 300, 0);
    traceAll([laser, sample, polarimeter]);
    return detectorReading(polarimeter.id);
  };

  assert.match(readPolarization(0, 45).polarization, /LINEAR 0°/i, 'no retardance leaves the beam alone');
  assert.match(readPolarization(90, 45).polarization, /CIRCULAR/i, 'a quarter wave at 45° gives circular light');
  assert.match(readPolarization(180, 45).polarization, /LINEAR 90°/i, 'a half wave at 45° flips the azimuth');

  // It transmits by default and emits nothing, so the spectrum is excitation only.
  assert.deepEqual(collectedWls('linear', [ch('phase')]), [800]);
  assert.ok(MODIFIER_KINDS.has('phase'));
});

// ---------------- 4e: stimulated Raman ----------------

function srsBench({ transferEff = 0.1, withSrs = true, secondBeam = true } = {}) {
  const pump = createElement('laser', 0, -6);
  Object.assign(pump.params, { wavelength: 800, temporalMode: 'pulsed', repRateMHz: 40, beamMode: 'line' });
  const chopper = createElement('chopper', 80, -6);
  Object.assign(chopper.params, { modulate: true, frequencyHz: 1e7, diameter: 10 });
  const elements = [pump, chopper];
  if (secondBeam) {
    const stokes = createElement('laser', 0, 6);
    Object.assign(stokes.params, { wavelength: 1040, temporalMode: 'pulsed', repRateMHz: 40, beamMode: 'line' });
    elements.push(stokes);
  }
  const sample = createElement('sample', 200, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 40, specimenType: 'nonlinear',
    channels: withSrs ? [ch('srs', { transferEff })] : [],
  });
  const longpass = createElement('filter', 300, 6);
  Object.assign(longpass.params, { ftype: 'longpass', cutoff: 900, length: 8 });
  const detector = createElement('detector', 380, 6);
  detector.params.aperture = 8;
  elements.push(sample, longpass, detector);
  traceAll(elements);
  return { reading: detectorReading(detector.id), detector, elements };
}

test('SRS copies one beam’s modulation onto the other without creating a wavelength', () => {
  const bare = srsBench({ withSrs: false }).reading;
  assert.equal(Math.round(bare.wavelength), 1040);
  assert.deepEqual((bare.pulse?.trains || []).flatMap(t => t.gates || []), [],
    'the Stokes beam is unmodulated with no SRS channel');

  const srs = srsBench({ transferEff: 0.3 }).reading;
  assert.equal(Math.round(srs.wavelength), 1040, 'SRS adds no new colour');
  const gates = (srs.pulse?.trains || []).flatMap(t => t.gates || []);
  assert.equal(gates.length, 1, 'the Stokes beam picked up exactly one transferred modulation');
  assert.equal(gates[0].frequencyMHz, 10, 'at the donor’s own frequency');
  assert.ok(Math.abs(gates[0].high - 1) < 1e-9);
  assert.ok(Math.abs(gates[0].low - 0.7) < 1e-9, 'modulation depth equals the transfer efficiency');
});

test('the SRS transfer efficiency sets the depth, and is clamped to a sane 1–50%', () => {
  for (const [set, low] of [[0.1, 0.9], [0.5, 0.5], [0.01, 0.99]]) {
    const gates = (srsBench({ transferEff: set }).reading.pulse?.trains || []).flatMap(t => t.gates || []);
    assert.ok(Math.abs(gates[0].low - low) < 1e-9, `transfer ${set} should give low=${low}`);
  }
  // Out-of-range values clamp rather than producing a nonsense gate.
  const tooDeep = (srsBench({ transferEff: 5 }).reading.pulse?.trains || []).flatMap(t => t.gates || []);
  assert.ok(Math.abs(tooDeep[0].low - 0.5) < 1e-9, 'clamped to 50%');
});

test('SRS needs a second beam, and says so when there is only one', () => {
  const alone = srsBench({ secondBeam: false }).reading;
  assert.equal(alone, null, 'nothing reaches the Stokes detector without a Stokes beam');
  assert.match(channelWarning(ch('srs'), [800]), /two excitation beams/);
  assert.equal(channelWarning(ch('srs'), [800, 1040]), null);
});

test('the transferred modulation reaches the oscilloscope on the receiving beam', () => {
  const { reading, detector, elements } = srsBench({ transferEff: 0.3 });
  assert.ok(reading);
  const display = createElement('display', 480, 80);
  display.params.sensorId = detector.id;
  const scene = [...elements, display];
  traceAll(scene);
  const svg = registry.display.svg(display, scene);
  assert.match(svg, /OSCILLOSCOPE/);
  assert.match(svg, /MOD 10\.0 MHz/, 'the screen reports the transferred modulation frequency');
  assert.match(svg, /REP 40\.0 MHz/);
});

// ---------------- 4e/4f: two-beam warnings ----------------

test('sum frequency and CARS report when a single beam cannot drive them', () => {
  assert.match(channelWarning(ch('sfg'), [800]), /two different excitation wavelengths/);
  assert.equal(channelWarning(ch('sfg'), [800, 1040]), null);
  assert.match(channelWarning(ch('cars'), [800]), /two different excitation wavelengths/);
  assert.equal(channelWarning(ch('cars'), [800, 1040]), null);
  // A manually pinned CARS line is a deliberate choice and needs no second beam.
  assert.equal(channelWarning(ch('cars', { autoWl: false, wl: 660 }), [800]), null);
});

// ---------------- the tracer reports what illuminates a specimen ----------------

test('a specimen reports the wavelengths reaching it, even with no signals configured yet', () => {
  const elements = collectBench('linear', []);
  traceScene(elements);
  const sample = elements.find(e => e.type === 'sample');
  assert.deepEqual(specimenIncidentWls(sample.id).map(Math.round), [800],
    'an empty linear specimen still reports its excitation, so the UI can offer defaults');

  const two = collectBench('linear', [], [800, 1040]);
  traceScene(two);
  const sample2 = two.find(e => e.type === 'sample');
  assert.deepEqual(specimenIncidentWls(sample2.id).map(Math.round).sort((a, b) => a - b), [800, 1040]);
});

// ---------------- migration ----------------

test('sketches predating the specimen type are migrated from what they do carry', () => {
  const load = params => parseSketch(JSON.stringify({
    app: 'optics2d', version: 1, beams: [],
    elements: [{ type: 'stage', x: 0, y: 0, params }],
  }), registry).elements[0].params;

  assert.equal(load({ sampleKind: 'resin' }).specimenType, 'resin');
  assert.equal(load({ sampleKind: 'fluorescent' }).specimenType, 'linear');
  assert.equal(load({ sampleKind: 'nonlinear' }).specimenType, 'nonlinear');
  assert.equal(load({ sampleKind: 'opaque' }).specimenType, 'absorbing');
  assert.equal(load({ sampleKind: 'generic' }).specimenType, 'absorbing');
  // Stacked channels win over the old material, since they are the newer truth.
  assert.equal(load({ sampleKind: 'generic', channels: [{ kind: 'shg' }] }).specimenType, 'nonlinear');
  assert.equal(load({ sampleKind: 'generic', channels: [{ kind: 'fluor' }] }).specimenType, 'linear');
  // A legacy single `mode` is read the same way.
  assert.equal(load({ mode: 'cars' }).specimenType, 'nonlinear');
  assert.equal(load({ mode: 'fluor' }).specimenType, 'linear');
  // An explicitly saved type is never second-guessed.
  assert.equal(load({ specimenType: 'absorbing', channels: [{ kind: 'shg' }] }).specimenType, 'absorbing');
});

test('a migrated legacy specimen still traces the signal it always did', () => {
  const scene = parseSketch(JSON.stringify({
    app: 'optics2d', version: 1, beams: [],
    elements: [
      { type: 'laser', x: 0, y: 0, params: { wavelength: 800, beamMode: 'line' } },
      { type: 'sample', x: 200, y: 0, rot: 90, params: { mode: 'shg', signalEff: 0.5 } },
      { type: 'detector', x: 400, y: 0, params: {} },
    ],
  }), registry);
  traceAll(scene.elements);
  const reading = detectorReading(scene.elements[2].id);
  assert.deepEqual([...new Set(reading.spectrum.map(s => Math.round(s.wavelength)))].sort((a, b) => a - b),
    [400, 800], 'the legacy SHG sample keeps generating its harmonic');
});

// ---------------- stacking ----------------

test('a linear and a nonlinear specimen each stack up to five of their own signals', () => {
  const linear = collectedWls('linear', [
    ch('fluor', { eff: 0.2 }),
    ch('raman', { eff: 0.2, material: 'polystyrene' }),
    ch('phase'),
  ]);
  assert.ok(linear.includes(820), 'fluorescence');
  for (const line of ramanShifts('polystyrene').map(sh => Math.round(ramanStokesWl(800, sh)))) {
    assert.ok(linear.includes(line), `Raman line ${line} missing from ${linear}`);
  }

  const nonlinear = collectedWls('nonlinear', [
    ch('tpef', { eff: 0.2 }),
    ch('thpef', { eff: 0.2 }),
    ch('shg', { eff: 0.2 }),
    ch('thg', { eff: 0.2 }),
    ch('sfg', { eff: 0.2 }),
  ], [800, 1040]);
  for (const expected of [420, 287, 400, 520, 267, 347, 452]) {
    assert.ok(nonlinear.includes(expected), `missing ${expected} nm from ${nonlinear}`);
  }
});

test('every offered signal kind is reachable and produces something', () => {
  const kinds = [...LINEAR_SIGNAL_KINDS, ...NONLINEAR_SIGNAL_KINDS].map(([id]) => id);
  assert.deepEqual(kinds.length, new Set(kinds).size, 'no duplicate kinds across the two menus');
  for (const [id] of LINEAR_SIGNAL_KINDS) {
    assert.equal(specimenTypeOf({ channels: [{ kind: id }] }), 'linear', `${id} implies a linear specimen`);
  }
  for (const [id] of NONLINEAR_SIGNAL_KINDS) {
    assert.equal(specimenTypeOf({ channels: [{ kind: id }] }), 'nonlinear', `${id} implies a nonlinear specimen`);
  }
});
