import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createElement, registry, newSampleChannel, sampleChannels, specimenTypeOf,
  signalKindsFor, channelWarning, defaultEmissionWl, drivingExcitationWl,
  ramanShifts, ramanStokesWl, LINEAR_SIGNAL_KINDS, NONLINEAR_SIGNAL_KINDS,
  SPECIMEN_TYPES, MODIFIER_KINDS, EMISSION_ORDER,
  FLUOROPHORES, fluorophoreSpec, fluorophoreAbsorption,
  displayViewsFor, resolvedDisplayView, displayActionUpdate,
} from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceAll, traceScene, detectorReading, specimenSignalWl, specimenIncidentWls } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { C_MM_PER_NS, pulseMarkers, pulseOverlap } from '../sketch/js/pulses.js';

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

// Two synchronized trains at 800 (pump) and 1040 nm (Stokes). `modulate`
// picks which one carries the chopper, `read` which one the detector sees,
// and `extraOplMm` lengthens the OTHER arm to break their timing.
function srsBench({
  transferEff = 0.1, withSrs = true, secondBeam = true,
  modulate = 800, read = 1040, extraOplMm = 0, requireOverlap = true,
} = {}) {
  const makeLaser = (wl, y) => {
    const laser = createElement('laser', 0, y);
    Object.assign(laser.params, {
      wavelength: wl, temporalMode: 'pulsed', repRateMHz: 40, pulseWidthFs: 200, beamMode: 'line',
    });
    return laser;
  };
  const pumpY = -6, stokesY = 6;
  const elements = [makeLaser(800, pumpY)];
  if (secondBeam) elements.push(makeLaser(1040, stokesY));
  const chopper = createElement('chopper', 80, modulate === 800 ? pumpY : stokesY);
  Object.assign(chopper.params, { modulate: true, frequencyHz: 1e7, diameter: 10 });
  elements.push(chopper);
  if (extraOplMm) {
    const delay = createElement('delayline', 120, modulate === 800 ? stokesY : pumpY);
    Object.assign(delay.params, { delayMm: extraOplMm, aperture: 10 });
    elements.push(delay);
  }
  const sample = createElement('sample', 200, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 40, specimenType: 'nonlinear',
    channels: withSrs ? [ch('srs', { transferEff, requireOverlap })] : [],
  });
  const readY = read === 1040 ? stokesY : pumpY;
  const filter = createElement('filter', 300, readY);
  Object.assign(filter.params, { ftype: read === 1040 ? 'longpass' : 'shortpass', cutoff: 900, length: 8 });
  const detector = createElement('detector', 380, readY);
  detector.params.aperture = 8;
  elements.push(sample, filter, detector);
  traceAll(elements);
  return { reading: detectorReading(detector.id), detector, elements };
}

const srsGates = opts => ((srsBench(opts).reading?.pulse?.trains) || []).flatMap(t => t.gates || []);

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
});

test('a modulated pump gives the Stokes beam gain, a modulated Stokes gives the pump loss', () => {
  // Energy flows from the blue photon to the red one, so the two directions
  // are not symmetric: the receiving Stokes beam is amplified while the pump
  // is on (SRG, a rise above its unmodulated level), while the receiving
  // pump beam is depleted while the Stokes is on (SRL, a dip).
  const gain = srsGates({ modulate: 800, read: 1040, transferEff: 0.3 })[0];
  assert.ok(gain.high > 1, `stimulated Raman gain should lift the Stokes beam, got high=${gain.high}`);
  assert.ok(Math.abs(gain.high - 1.3) < 1e-9);
  assert.ok(Math.abs(gain.low - 1) < 1e-9, 'and sit at its unmodulated level in between');

  const loss = srsGates({ modulate: 1040, read: 800, transferEff: 0.3 })[0];
  assert.ok(loss.high < 1, `stimulated Raman loss should dip the pump, got high=${loss.high}`);
  assert.ok(Math.abs(loss.high - 0.7) < 1e-9);
  assert.ok(Math.abs(loss.low - 1) < 1e-9);
});

test('the SRS transfer efficiency sets the excursion, and is clamped to a sane 1–50%', () => {
  for (const [set, high] of [[0.1, 1.1], [0.5, 1.5], [0.01, 1.01]]) {
    const gate = srsGates({ transferEff: set })[0];
    assert.ok(Math.abs(gate.high - high) < 1e-9, `transfer ${set} should give high=${high}`);
  }
  assert.ok(Math.abs(srsGates({ transferEff: 5 })[0].high - 1.5) < 1e-9, 'clamped to 50%');
});

// ---------------- pulse synchronization ----------------

test('SRS stops when the two arms are no longer path-matched, and the toggle overrides it', () => {
  // 200 fs pulses are ~0.06 mm long, so a fraction of a millimetre of extra
  // path in one arm is enough to pull them apart — which is exactly what a
  // delay line exists to correct.
  assert.ok(srsGates({ extraOplMm: 0 }).length, 'matched arms transfer');
  const slight = srsGates({ extraOplMm: 0.02 })[0];
  assert.ok(slight && slight.high - 1 < 0.1 && slight.high > 1,
    'a small mismatch weakens the transfer rather than switching it off');
  assert.equal(srsGates({ extraOplMm: 1 }).length, 0, 'a millimetre of mismatch kills it');
  assert.equal(srsGates({ extraOplMm: 50 }).length, 0);

  // Opting out restores the un-timed behavior, for a schematic that is about
  // the signal rather than about path matching.
  assert.ok(srsGates({ extraOplMm: 50, requireOverlap: false }).length,
    'the overlap requirement can be switched off per channel');
});

test('CARS and SFG also need the pulses to coincide', () => {
  const mixed = (kind, extraOplMm, requireOverlap = true) => {
    const makeLaser = (wl, y) => {
      const laser = createElement('laser', 0, y);
      Object.assign(laser.params, {
        wavelength: wl, temporalMode: 'pulsed', repRateMHz: 40, pulseWidthFs: 200, beamMode: 'line',
      });
      return laser;
    };
    const elements = [makeLaser(800, -6), makeLaser(1040, 6)];
    if (extraOplMm) {
      const delay = createElement('delayline', 120, 6);
      Object.assign(delay.params, { delayMm: extraOplMm, aperture: 10 });
      elements.push(delay);
    }
    const sample = createElement('sample', 200, 0);
    sample.rot = 90;
    Object.assign(sample.params, {
      aperture: 40, specimenType: 'nonlinear', channels: [ch(kind, { eff: 0.5, requireOverlap })],
    });
    const detector = createElement('detector', 400, 0);
    detector.params.aperture = 60;
    elements.push(sample, detector);
    traceAll(elements);
    const reading = detectorReading(detector.id);
    return reading ? [...new Set(reading.spectrum.map(s => Math.round(s.wavelength)))] : [];
  };

  assert.ok(mixed('cars', 0).includes(650), 'matched arms give the anti-Stokes line');
  assert.ok(!mixed('cars', 5).includes(650), 'a mismatched arm switches CARS off');
  assert.ok(mixed('cars', 5, false).includes(650), 'unless the requirement is switched off');

  assert.ok(mixed('sfg', 0).includes(452), 'matched arms give the sum-frequency line');
  assert.ok(!mixed('sfg', 5).includes(452), 'a mismatched arm switches SFG off');
});

test('a mismatched pair is explained, in picoseconds and in millimetres of path', () => {
  const beams = skewMm => ([
    { wl: 800, opl: 200, pulse: { repRateMHz: 40, pulseWidthFs: 200, phaseNs: 0 } },
    { wl: 1040, opl: 200 + skewMm, pulse: { repRateMHz: 40, pulseWidthFs: 200, phaseNs: 0 } },
  ]);
  assert.equal(channelWarning(ch('cars'), beams(0)), null, 'matched arms need no warning');
  const warning = channelWarning(ch('cars'), beams(3));
  assert.match(warning, /pulses to arrive together/);
  assert.match(warning, /ps apart/);
  assert.match(warning, /3\.00 mm of path/);
  assert.match(warning, /delay line/);
  // Continuous-wave light is always present, so timing never applies to it.
  assert.equal(channelWarning(ch('cars'), [{ wl: 800, opl: 200 }, { wl: 1040, opl: 900 }]), null);
  // And the per-channel opt-out silences it.
  assert.equal(channelWarning(ch('cars', { requireOverlap: false }), beams(3)), null);
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

// ---------------- display views follow the linked sensor ----------------

test('a photodiode screen offers only its own readout, never a spectrum it never measured', () => {
  // Regression: the VIEW button cycled main -> spectrum -> detail for every
  // sensor. A photodiode has one channel of information, so "wavelength
  // samples" drew a spectrum plot underneath its own oscilloscope.
  assert.deepEqual(displayViewsFor('detector'), ['main']);
  assert.deepEqual(displayViewsFor('pmt'), ['main']);
  assert.deepEqual(displayViewsFor('spectrometer'), ['main']);
  assert.deepEqual(displayViewsFor('polarimeter'), ['main']);
  // The two sensors that really do carry alternate readouts keep them.
  assert.deepEqual(displayViewsFor('camera'), ['main', 'spectrum', 'detail']);
  assert.deepEqual(displayViewsFor('generaldetector'), ['main', 'spectrum', 'detail']);
});

test('cycling the view on a single-readout sensor is a no-op that says why', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.temporalMode = 'pulsed';
  const detector = createElement('detector', 300, 0);
  const display = createElement('display', 420, 100);
  display.params.sensorId = detector.id;
  const scene = [laser, detector, display];
  traceAll(scene);

  const update = displayActionUpdate(display, 'view', scene);
  assert.deepEqual(update.updates, {}, 'nothing to cycle to');
  assert.match(update.message, /one readout/);

  // Even a stored spectrum view (from an older sketch, or from re-pointing
  // the screen at a camera and back) renders as the primary readout.
  display.params.displayView = 'spectrum';
  assert.equal(resolvedDisplayView(display, detector), 'main');
  const svg = registry.display.svg(display, scene);
  assert.match(svg, /OSCILLOSCOPE/);
  assert.doesNotMatch(svg, /λ SAMPLES/, 'no spectrum caption leaks through');
  assert.doesNotMatch(svg, /data-spectrum-points/, 'and no spectrum plot is drawn underneath');
});

test('a camera screen still cycles through its three readouts', () => {
  const laser = createElement('laser', 0, 0);
  laser.params.beamMode = 'beam';
  const camera = createElement('camera', 300, 0);
  const display = createElement('display', 420, 100);
  display.params.sensorId = camera.id;
  const scene = [laser, camera, display];
  traceAll(scene);

  let view = 'main';
  const seen = [];
  for (let i = 0; i < 3; i++) {
    display.params.displayView = view;
    const update = displayActionUpdate(display, 'view', scene);
    view = update.updates.displayView;
    seen.push(view);
  }
  assert.deepEqual(seen, ['spectrum', 'detail', 'main'], 'cycles and wraps');
});

// ---------------- the animation agrees with the timing ----------------

test('packet positions agree with real synchronization, exactly in physical mode', () => {
  // Two beams reaching the same plane by paths differing by `extra` mm. The
  // animation should not contradict the physics: a pair the tracer treats as
  // synchronized must never be drawn as visibly offset, which is how a delay
  // line gets aligned by eye.
  const C = C_MM_PER_NS, rep = 1000, periodNs = 1000 / rep;
  const pulse = { sourceId: 's', repRateMHz: rep, pulseWidthFs: 200, phaseNs: 0 };
  const trackTo = oplAtSample => ({
    pts: [{ x: 0, y: 0 }, { x: 1200, y: 0 }],
    opls: [oplAtSample - 600, oplAtSample + 600],
    pulse,
  });
  // Distance from the sample plane to that beam's nearest packet.
  const gap = (oplAtSample, mode) => {
    const markers = pulseMarkers(trackTo(oplAtSample), 2.3, { mode });
    return Math.min(...markers.map(m => Math.abs(m.opl - oplAtSample)));
  };
  const aligned = (extra, mode) => Math.abs(gap(600, mode) - gap(600 + extra, mode)) < 0.01;
  const synced = extra => pulseOverlap({ opl: 600, pulse }, { opl: 600 + extra, pulse }).factor > 0.999;

  const period = C * periodNs;
  // A whole period of extra path is still synchronized — the pulse trains are
  // periodic, so any replica will do — and both modes draw it as aligned.
  for (const extra of [0, period, 2 * period]) {
    assert.ok(synced(extra), `${extra} mm should stay synchronized`);
    assert.ok(aligned(extra, 'physical'), `${extra} mm should look aligned in physical mode`);
    assert.ok(aligned(extra, 'schematic'), `${extra} mm should look aligned in schematic mode`);
  }
  // A genuine mismatch is drawn as one, and physical mode tracks it exactly.
  for (const extra of [1, 50, period / 2]) {
    assert.ok(!synced(extra), `${extra} mm should not be synchronized`);
    assert.ok(!aligned(extra, 'physical'), `${extra} mm should look misaligned in physical mode`);
  }
  // Schematic packets are compressed to stay visible, so they also line up at
  // each sub-multiple: looking aligned is necessary but not sufficient there.
  assert.ok(aligned(period / 2, 'schematic'));
});

// ---------------- discrete lines vs a real continuum ----------------

function spectrumScreen(elements, sensor) {
  const display = createElement('display', 700, 200);
  display.params.sensorId = sensor.id;
  const scene = [...elements, display];
  traceAll(scene);
  const svg = registry.display.svg(display, scene);
  return {
    lines: Number((svg.match(/data-spectrum-lines="(\d+)"/) || [0, 0])[1]),
    smoothed: Number((svg.match(/data-spectrum-points="(\d+)"/) || [0, 0])[1]),
    smoothFill: /fill="url\(#specGrad/.test(svg),
  };
}

function monoLaser(wl, y) {
  const laser = createElement('laser', 0, y);
  Object.assign(laser.params, { wavelength: wl, beamMode: 'line' });
  return laser;
}

test('separate laser lines read as separate peaks, not a rainbow between them', () => {
  // Regression: the spectrometer smoothed a gradient-filled curve through
  // every sample, so 532 nm and 580 nm arriving together were drawn as a
  // continuous band covering everything in between.
  const spectrometer = createElement('spectrometer', 400, 0);
  spectrometer.params.aperture = 40;
  const screen = spectrumScreen([monoLaser(532, -3), monoLaser(580, 3), spectrometer], spectrometer);
  assert.equal(screen.lines, 2, 'two discrete peaks');
  assert.equal(screen.smoothFill, false, 'and nothing smoothed between them');

  const reading = detectorReading(spectrometer.id);
  assert.deepEqual(reading.spectrum.map(s => Math.round(s.wavelength)), [532, 580]);
  assert.ok(reading.spectrum.every(s => !s.continuum), 'monochromatic rays are lines, not a band');
});

test('spontaneous Raman lines stay resolved on a spectrometer', () => {
  const laser = monoLaser(532, 0);
  const sample = createElement('sample', 150, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 40, specimenType: 'linear', transmitExc: true, transmission: 0.8,
    channels: [ch('raman', { eff: 0.5, material: 'dmso' })],
  });
  const objective = createElement('objective', 154, 0);
  objective.params.f = 20;
  const spectrometer = createElement('spectrometer', 360, 0);
  spectrometer.params.aperture = 60;

  const screen = spectrumScreen([laser, sample, objective, spectrometer], spectrometer);
  assert.ok(screen.lines >= 3, `expected resolved Raman peaks, got ${screen.lines}`);
  assert.equal(screen.smoothFill, false, 'no rainbow smeared across the fingerprint');
});

test('a genuinely broadband source still draws as a smooth band', () => {
  const laser = createElement('sclaser', 0, 0);
  laser.params.beamMode = 'line';
  const spectrometer = createElement('spectrometer', 400, 0);
  spectrometer.params.aperture = 40;
  const screen = spectrumScreen([laser, spectrometer], spectrometer);
  assert.ok(screen.smoothed > 2, 'sampled across its width');
  assert.equal(screen.smoothFill, true, 'and filled as a continuum');
  assert.equal(screen.lines, 0, 'with no spurious discrete peaks');

  const reading = detectorReading(spectrometer.id);
  assert.ok(reading.spectrum.every(s => s.continuum), 'every sample belongs to the band');
});

test('a laser line on top of a broadband source keeps both, drawn each its own way', () => {
  const sc = createElement('sclaser', 0, -3);
  sc.params.beamMode = 'line';
  const spectrometer = createElement('spectrometer', 400, 0);
  spectrometer.params.aperture = 40;
  const screen = spectrumScreen([sc, monoLaser(1064, 3), spectrometer], spectrometer);
  assert.equal(screen.smoothFill, true, 'the continuum is still a band');
  assert.equal(screen.lines, 1, 'and the laser line is still a discrete peak on top of it');

  // The discrete line must never be averaged into the band by the sample cap.
  const reading = detectorReading(spectrometer.id);
  const line = reading.spectrum.find(s => Math.round(s.wavelength) === 1064);
  assert.ok(line, `the 1064 nm line survived summarizing, got ${reading.spectrum.map(s => Math.round(s.wavelength))}`);
  assert.equal(line.continuum, false);
});

test('a filtered broadband source stays a band — narrower, but still continuous', () => {
  const sc = createElement('sclaser', 0, 0);
  sc.params.beamMode = 'line';
  const filter = createElement('filter', 200, 0);
  Object.assign(filter.params, { ftype: 'bandpass', center: 600, band: 40, length: 30 });
  const spectrometer = createElement('spectrometer', 400, 0);
  spectrometer.params.aperture = 40;
  const screen = spectrumScreen([sc, filter, spectrometer], spectrometer);
  assert.equal(screen.smoothFill, true, 'filtering a continuum leaves a continuum');
  assert.equal(screen.lines, 0);
});

// ---------------- spectrometer intensity axis and peak labels ----------------

function spectrometerScreen(elements, sensor) {
  const display = createElement('display', 700, 200);
  display.params.sensorId = sensor.id;
  const scene = [...elements, display];
  traceAll(scene);
  const svg = registry.display.svg(display, scene);
  const baseline = 1; // the spectrometer plots against this baseline
  return {
    svg,
    // Discrete lines render as a triangle of the instrument's own resolution
    // width, peaking at their height above the baseline.
    stems: [...svg.matchAll(/<path d="M ([-\d.]+),([-\d.]+) L ([-\d.]+),([-\d.]+) L ([-\d.]+),/g)]
      .map(m => Number((Number(m[2]) - Number(m[4])).toFixed(2))).sort((a, b) => b - a),
    lineWidths: [...svg.matchAll(/<path d="M ([-\d.]+),[-\d.]+ L [-\d.]+,[-\d.]+ L ([-\d.]+),/g)]
      .map(m => Number((Number(m[2]) - Number(m[1])).toFixed(2))),
    bandPeak: (() => {
      const path = (svg.match(/<path d="M ([^"]+)" fill="none" stroke="url\(#specGrad/) || [])[1];
      if (!path) return null;
      const ys = path.split(/[ ,CQ]+/).map(Number).filter((_, i) => i % 2 === 1);
      return Number((baseline - Math.min(...ys)).toFixed(2));
    })(),
    labelled: [...svg.matchAll(/font-weight="700" fill="#[0-9a-f]{6}">(\d+)</g)].map(m => Number(m[1])),
    yUnit: (svg.match(/I \(([^)]+)\)/) || [])[1],
  };
}

const spectrometerAt = (x, params = {}) => {
  const sensor = createElement('spectrometer', x, 0);
  Object.assign(sensor.params, { aperture: 60, ...params });
  return sensor;
};

test('the spectrometer no longer captions a single ambiguous bandwidth', () => {
  // One number cannot describe several lines: it read as the span between
  // the outermost peaks rather than the width of anything real.
  const spectrometer = spectrometerAt(400);
  const screen = spectrometerScreen([monoLaser(532, -3), monoLaser(580, 3), spectrometer], spectrometer);
  assert.doesNotMatch(screen.svg, /BANDWIDTH/);
});

test('peaks are labelled with their wavelength, and the labels can be switched off', () => {
  const spectrometer = spectrometerAt(400, { rangeMode: 'manual', rangeMin: 500, rangeMax: 620 });
  const on = spectrometerScreen([monoLaser(532, -3), monoLaser(580, 3), spectrometer], spectrometer);
  assert.deepEqual(on.labelled, [532, 580], 'each line names its own wavelength');

  spectrometer.params.labelPeaks = false;
  const off = spectrometerScreen([monoLaser(532, -3), monoLaser(580, 3), spectrometer], spectrometer);
  assert.deepEqual(off.labelled, [], 'the toggle removes them');
  assert.equal(registry.spectrometer.params.find(p => p.key === 'labelPeaks').def, true, 'on by default');
});

test('a continuous band is labelled at its peak, alongside any discrete lines', () => {
  const sc = createElement('sclaser', 0, -3);
  Object.assign(sc.params, { beamMode: 'line', scMin: 500, scMax: 700 });
  const spectrometer = spectrometerAt(400, { rangeMode: 'manual', rangeMin: 480, rangeMax: 900 });
  const screen = spectrometerScreen([sc, monoLaser(850, 3), spectrometer], spectrometer);
  assert.ok(screen.labelled.includes(850), `the discrete line is named, got ${screen.labelled}`);
  assert.ok(screen.labelled.some(wl => wl >= 500 && wl <= 700),
    `the band's peak is named too, got ${screen.labelled}`);
});

test('the intensity axis is a spectral density, so a line and a band are comparable', () => {
  // A laser line packs its whole power into one colour; a 40 nm band spreads
  // the same power across many. On a per-nm axis the line towers over it,
  // which is what a real spectrometer shows.
  const mk = (y, broadband) => {
    const laser = createElement('laser', 0, y);
    Object.assign(laser.params, {
      wavelength: 532, beamMode: 'line', avgPowerW: 1,
      ...(broadband ? { bwMode: 'band', bandwidth: 40 } : {}),
    });
    return laser;
  };
  const spectrometer = spectrometerAt(400, { rangeMode: 'manual', rangeMin: 480, rangeMax: 600 });
  const density = spectrometerScreen([mk(-3, false), mk(3, true), spectrometer], spectrometer);
  assert.equal(density.yUnit, 'per nm');
  assert.ok(density.stems[0] > density.bandPeak * 5,
    `the line should dominate on a density axis, got line ${density.stems[0]} vs band ${density.bandPeak}`);

  spectrometer.params.intensityScale = 'relative';
  const relative = spectrometerScreen([mk(-3, false), mk(3, true), spectrometer], spectrometer);
  assert.equal(relative.yUnit, 'rel.');
  assert.ok(relative.bandPeak > relative.stems[0] * 0.8,
    `relative mode should bring both to full height, got line ${relative.stems[0]} vs band ${relative.bandPeak}`);
});

test('relative mode rescues a weak signal beside its own pump, keeping the fingerprint intact', () => {
  // Light generated in a specimen counts as its own source, so normalizing
  // per source separates a Raman line from the laser that excited it.
  const build = intensityScale => {
    const laser = monoLaser(800, 0);
    const sample = createElement('sample', 150, 0);
    sample.rot = 90;
    Object.assign(sample.params, {
      aperture: 40, specimenType: 'nonlinear', transmitExc: true, transmission: 0.8,
      channels: [ch('shg', { eff: 0.4 }), ch('thg', { eff: 0.1 })],
    });
    const spectrometer = spectrometerAt(360, { intensityScale, rangeMode: 'manual', rangeMin: 200, rangeMax: 900 });
    return spectrometerScreen([laser, sample, spectrometer], spectrometer);
  };

  const density = build('density');
  const relative = build('relative');
  // Four times the power should still read as four times the height, in both
  // modes — normalizing must not flatten a fingerprint into equal peaks.
  const ratio = list => list[list.length - 2] / list[list.length - 1];
  assert.ok(Math.abs(ratio(density.stems) - 4) < 0.2, `density keeps 4:1, got ${density.stems}`);
  assert.ok(Math.abs(ratio(relative.stems) - 4) < 0.2, `relative keeps 4:1 too, got ${relative.stems}`);
  // But the signal itself is lifted clear of the excitation.
  assert.ok(relative.stems[1] > density.stems[1],
    `the strongest signal should rise in relative mode, got ${density.stems} then ${relative.stems}`);
});

// ---------------- instrument resolution renders line width ----------------

test('the spectrometer resolution sets how wide a line can be drawn', () => {
  // Regression: resolution only ever divided into the density, and since the
  // plot normalizes to its own maximum, a lines-only reading looked identical
  // at every setting. A spectrometer cannot render a line narrower than it
  // resolves, so the width now shows it.
  const widthAt = resolutionNm => {
    const spectrometer = spectrometerAt(400, {
      resolutionNm, rangeMode: 'manual', rangeMin: 500, rangeMax: 620,
    });
    return spectrometerScreen([monoLaser(532, -3), monoLaser(580, 3), spectrometer], spectrometer).lineWidths[0];
  };
  const fine = widthAt(0.5), coarse = widthAt(20);
  assert.ok(coarse > fine * 5, `coarsening the resolution should broaden lines, got ${fine} then ${coarse}`);
});

// ---------------- emission reach and sampling ----------------

function emissionBench(channels, { lensAtMm, specimenType = 'linear' }) {
  const laser = monoLaser(532, 0);
  const sample = createElement('sample', 150, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 40, specimenType, transmitExc: true, transmission: 0.8, channels,
  });
  const lens = createElement('lens', 150 + lensAtMm, 0);
  Object.assign(lens.params, { f: 40, dia: 60 });
  const detector = createElement('detector', 150 + lensAtMm + 220, 0);
  detector.params.aperture = 80;
  const elements = [laser, sample, lens, detector];
  traceAll(elements);
  const reading = detectorReading(detector.id);
  if (!reading) return [];
  return [...new Set(reading.spectrum.map(s => Math.round(s.wavelength)))]
    .filter(wl => Math.abs(wl - 532) > 5).sort((a, b) => a - b);
}

test('emission is collectable well past the distance its glow is drawn over', () => {
  // The glow still fades by 25 mm, but a collection lens routinely sits
  // further out than that and the light is really there.
  for (const channels of [[ch('fluor', { eff: 0.5 })], [ch('raman', { eff: 0.5, material: 'dmso' })]]) {
    assert.ok(emissionBench(channels, { lensAtMm: 20 }).length, 'a close lens collects');
    assert.ok(emissionBench(channels, { lensAtMm: 95 }).length,
      'a lens at ~10 cm still collects, well past the drawn glow');
    assert.equal(emissionBench(channels, { lensAtMm: 140 }).length, 0,
      'beyond the capture range the light is gone');
  }
});

test('spontaneous Raman delivers its whole fingerprint to a distant lens', () => {
  const lines = ramanShifts('dmso').map(shift => Math.round(ramanStokesWl(532, shift)));
  const collected = emissionBench([ch('raman', { eff: 0.5, material: 'dmso' })], { lensAtMm: 95 });
  for (const line of lines) assert.ok(collected.includes(line), `missing ${line} nm from ${collected}`);
});

test('emission directions are sampled denser along the beam axis', () => {
  // Isotropic emission is still isotropic; the SAMPLING is concentrated where
  // collection optics actually sit, so the rays that can be captured are the
  // ones resolved finely.
  const laser = monoLaser(532, 0);
  const sample = createElement('sample', 150, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 40, specimenType: 'linear', transmitExc: true, transmission: 0.8,
    channels: [ch('fluor', { eff: 0.5 })],
  });
  const scene = traceScene([laser, sample]);
  const directions = new Set();
  for (const d of scene.drawables) {
    if (d.type !== 'path' || !d.pts || d.pts.length < 2) continue;
    if (Math.hypot(d.pts[0].x - 150, d.pts[0].y) > 30) continue;
    directions.add(Math.atan2(d.pts[1].y - d.pts[0].y, d.pts[1].x - d.pts[0].x).toFixed(4));
  }
  const angles = [...directions].map(Number);
  assert.ok(angles.length >= 16, `emission should be sampled with many rays, got ${angles.length}`);
  const nearAxis = angles.filter(a => {
    const t = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    return t < Math.PI / 6 || t > 5 * Math.PI / 6; // within 30° of forward or back
  });
  // A third of the circle lies within those cones, so uniform sampling would
  // put about a third of the rays there.
  assert.ok(nearAxis.length > angles.length * 0.45,
    `expected the axis to be oversampled, got ${nearAxis.length} of ${angles.length}`);
});

// ---------------- named fluorophores ----------------

function dyeEmission(kind, fluorophore, excitationWl) {
  const laser = monoLaser(excitationWl, 0);
  const sample = createElement('sample', 150, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 40, specimenType: kind === 'fluor' ? 'linear' : 'nonlinear',
    transmitExc: true, transmission: 0.8,
    channels: [ch(kind, { eff: 0.5, fluorophore })],
  });
  const objective = createElement('objective', 154, 0);
  objective.params.f = 20;
  const detector = createElement('detector', 320, 0);
  detector.params.aperture = 60;
  traceAll([laser, sample, objective, detector]);
  const reading = detectorReading(detector.id);
  if (!reading) return null;
  const signal = reading.spectrum.filter(s => Math.abs(s.wavelength - excitationWl) > 5);
  if (!signal.length) return null;
  const peak = signal.reduce((a, b) => (a.power > b.power ? a : b));
  return { peak: Math.round(peak.wavelength), samples: signal.length };
}

test('each fluorophore emits its own band when excited near its absorption peak', () => {
  for (const [id, , spec] of FLUOROPHORES) {
    if (!spec) continue;
    const emission = dyeEmission('fluor', id, spec.absPeak);
    assert.ok(emission, `${id} should emit when excited on its absorption peak`);
    assert.ok(Math.abs(emission.peak - spec.emPeak) <= 10,
      `${id} should peak near ${spec.emPeak} nm, got ${emission.peak}`);
    assert.ok(emission.samples > 2, `${id} emits a band, not a single line`);
  }
});

test('a fluorophore excited far from its band emits nothing, and says why', () => {
  assert.equal(dyeEmission('fluor', 'gfp', 640), null, 'GFP is not excited by 640 nm');
  const warning = channelWarning(ch('fluor', { fluorophore: 'gfp' }), [640]);
  assert.match(warning, /GFP/);
  assert.match(warning, /peaks at 488 nm/);
  assert.equal(channelWarning(ch('fluor', { fluorophore: 'gfp' }), [488]), null, 'on peak, no complaint');
});

test('multiphoton excitation reaches a dye at twice and three times its absorption peak', () => {
  for (const [id, , spec] of FLUOROPHORES) {
    if (!spec) continue;
    const two = dyeEmission('tpef', id, spec.absPeak * 2);
    assert.ok(two, `${id} should be excited two photons at a time`);
    assert.ok(Math.abs(two.peak - spec.emPeak) <= 10,
      `${id} emits its own band however it was pumped, got ${two.peak}`);
  }
  const three = dyeEmission('thpef', 'dapi', 358 * 3);
  assert.ok(three && Math.abs(three.peak - 461) <= 10, `three-photon DAPI should emit its band, got ${three?.peak}`);

  // The warning names the photon order and the effective wavelength.
  const warning = channelWarning(ch('tpef', { fluorophore: 'gfp' }), [1200]);
  assert.match(warning, /2 photons/);
  assert.match(warning, /600 nm effective/);
});

test('the custom fluorophore keeps the generic absorb-anything, emit-20-nm-longer rule', () => {
  assert.equal(fluorophoreSpec('custom'), null);
  assert.equal(fluorophoreAbsorption('custom', 1234, 1), 1, 'absorbs whatever arrives');

  const one = dyeEmission('fluor', 'custom', 532);
  assert.equal(one.peak, 552, 'one Stokes offset above the excitation');
  assert.equal(one.samples, 1, 'and a discrete line, not a band');

  const two = dyeEmission('tpef', 'custom', 800);
  assert.equal(two.peak, 420, 'half the excitation plus the offset');
});
