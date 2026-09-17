import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createElement, registry, newSampleChannel, sampleChannels, specimenTypeOf,
  signalKindsFor, channelWarning, defaultEmissionWl, drivingExcitationWl, specimenTimingText,
  specimenTimingReadout,
  ramanShifts, ramanStokesWl, LINEAR_SIGNAL_KINDS, NONLINEAR_SIGNAL_KINDS,
  SPECIMEN_TYPES, MODIFIER_KINDS, EMISSION_ORDER,
  FLUOROPHORES, fluorophoreSpec, fluorophoreAbsorption,
  displayViewsFor, resolvedDisplayView, displayActionUpdate, getSize,
} from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import {
  traceAll, traceScene, detectorReading, specimenIncidentBeams, specimenSignalWl, specimenIncidentWls,
  specimenTimingReading,
} from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { wavelengthToColor } from '../sketch/js/util.js';
import { C_MM_PER_NS, pulseMarkers, pulseOverlap } from '../sketch/js/pulses.js';

const ch = (kind, over = {}) => ({ ...newSampleChannel(kind), ...over });

// Isotropic signals are evanescent — they die within 25 mm unless something
// collects them — so these benches put an objective right after the specimen,
// the way a real microscope does.
function collectBench(specimenType, channels, wavelengths = [800]) {
  const lasers = wavelengths.map((wl, i) => {
    const laser = createElement('cwlaser', 0, (i - (wavelengths.length - 1) / 2) * 6);
    Object.assign(laser.params, { wavelength: wl, beamMode: 'line' });
    return laser;
  });
  const sample = createElement('sample', 150, 0);
  sample.rot = 90; // the specimen surface is horizontal at rot 0
  Object.assign(sample.params, { aperture: 40, specimenType, channels });
  const objective = createElement('objective', 154, 0);
  objective.params.efl = 20; // effective focal length
  objective.params.workingDistance = 20; // front boundary is 20 mm from the sample
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
  // Sum frequency is not its own kind any more: one chi(2) channel gives both
  // the second harmonic of a beam and the sum frequency of a pair.
  assert.deepEqual(signalKindsFor('nonlinear').map(([id]) => id),
    ['tpef', 'thpef', 'shg', 'thg', 'cars', 'srs']);
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
  const laser = createElement('cwlaser', 0, 0);
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
    const laser = createElement('cwlaser', 0, 0);
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
    const laser = createElement('pulsedlaser', 0, y);
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

test('CARS and the second-order channel need the pulses to coincide', () => {
  const mixed = (kind, extraOplMm, requireOverlap = true) => {
    const makeLaser = (wl, y) => {
      const laser = createElement('pulsedlaser', 0, y);
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

  // The chi(2) channel doubles each beam whatever the timing, and adds their
  // sum frequency only while the pulses coincide.
  const together = mixed('shg', 0), apart = mixed('shg', 5);
  assert.ok(together.includes(452), 'matched arms give the sum-frequency line');
  assert.ok(!apart.includes(452), 'a mismatched arm switches the sum frequency off');
  for (const harmonic of [400, 520]) {
    assert.ok(together.includes(harmonic), `the ${harmonic} nm harmonic is missing`);
    assert.ok(apart.includes(harmonic), `the ${harmonic} nm harmonic should not depend on timing`);
  }
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
      { type: 'cwlaser', x: 0, y: 0, params: { wavelength: 800, beamMode: 'line' } },
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
  const laser = createElement('pulsedlaser', 0, 0);
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
  const laser = createElement('cwlaser', 0, 0);
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
  const laser = createElement('cwlaser', 0, y);
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
  objective.params.efl = 20; // f = 20 mm
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
    // Discrete lines render as a plain hairline stem at their height above
    // the baseline.
    stems: [...svg.matchAll(/<line x1="[-\d.]+" y1="([-\d.]+)" x2="[-\d.]+" y2="([-\d.]+)" stroke="#[0-9a-f]{6}" stroke-width="2"/g)]
      .map(m => Number((Number(m[1]) - Number(m[2])).toFixed(2))).sort((a, b) => b - a),
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
    const laser = createElement('cwlaser', 0, y);
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

test('the spectrometer has no configurable line resolution — that is outside what this app models', () => {
  assert.ok(!registry.spectrometer.params.some(p => p.key === 'resolutionNm'));
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
  objective.params.efl = 20; // f = 20 mm
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

// ---------------- specimen presentation ----------------

test('the excitation spot is the only circle a specimen draws, and the toggle governs it', () => {
  // Regression: the plain Sample drew a hardcoded circle at its centre on
  // every render, in a fixed per-material colour, independent of both the
  // toggle and the emission wavelength. Only the piezo holder behaved.
  for (const type of ['sample', 'stage']) {
    const el = createElement(type, 0, 0);
    Object.assign(el.params, { specimenType: 'linear', channels: [ch('fluor')] });

    el.params.showSignalSpot = false;
    assert.doesNotMatch(registry[type].svg(el), /<circle/, `${type} draws no spot when the toggle is off`);

    el.params.showSignalSpot = true;
    assert.doesNotMatch(registry[type].svg(el), /<circle/,
      `${type} draws no spot until the tracer reports a hit`);

    // The canvas attaches the live hit; the spot then takes that signal's colour.
    el._signalHitLocal = { x: 0, y: 0, wl: 620 };
    const lit = registry[type].svg(el);
    assert.match(lit, /<circle/, `${type} draws the spot once there is a hit`);
    assert.ok(lit.includes(wavelengthToColor(620)), `${type} colours the spot by the emission wavelength`);

    el._signalHitLocal = { x: 0, y: 0, wl: 480 };
    assert.ok(registry[type].svg(el).includes(wavelengthToColor(480)), `${type} follows the wavelength`);
  }
});

test('sample thickness is a presentation control that never moves the optical surface', () => {
  for (const type of ['sample', 'stage']) {
    const el = createElement(type, 0, 0);
    const spec = registry[type].params.find(p => p.key === 'thickness');
    assert.ok(spec, `${type} exposes a thickness`);
    assert.equal(spec.appearance, true, 'and it lives in Label & appearance');
    assert.equal(spec.def, 6);

    const glassHeight = svg => Number((svg.match(/<rect [^>]*height="([\d.]+)"[^>]*fill="[^"]*"[^>]*stroke="#/) || [])[1]
      ?? (svg.match(/height="([\d.]+)"/) || [])[1]);
    const thin = glassHeight(registry[type].svg(el));
    el.params.thickness = 16;
    const thick = glassHeight(registry[type].svg(el));
    assert.ok(thick > thin, `${type} glass should be drawn thicker, got ${thin} then ${thick}`);
    assert.ok(getSize(el).h >= 16, 'and the element box grows to contain it');

    // The traced surface is a thin sheet at the same place either way.
    const surfaceOf = e => registry[type].surfaces(e).find(su => su.kind === 'attenuate' || su.kind === 'specimen');
    el.params.thickness = 2;
    const thinSurface = surfaceOf(el);
    el.params.thickness = 20;
    const thickSurface = surfaceOf(el);
    assert.deepEqual(thinSurface, thickSurface, `${type} thickness must not move or change the optical surface`);
  }
});

test('a focused beam is timed as one beam, not as a spread of sampling rays', () => {
  // A converging beam is traced as many rays whose paths differ across the
  // cone. Timing a ray of one beam against an arbitrary sampled ray of the
  // other made a matched pair look picoseconds apart and silenced the signal —
  // which is what a correctly built two-colour microscope hit.
  const laser = (wl, y) => {
    const source = createElement('pulsedlaser', 0, y);
    Object.assign(source.params, {
      wavelength: wl, temporalMode: 'pulsed', repRateMHz: 80, pulseWidthFs: 1000,
      beamMode: 'size', dia: 6,
    });
    return source;
  };
  const elements = [laser(800, -30), laser(1040, 30)];
  // Both beams through one lens, so each arrives as a cone of rays.
  const lens = createElement('lens', 150, 0);
  Object.assign(lens.params, { f: 150, dia: 80 });
  const sample = createElement('sample', 300, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 60, specimenType: 'nonlinear',
    channels: [ch('cars', { eff: 0.5, requireOverlap: true })],
  });
  const detector = createElement('detector', 500, 0);
  detector.params.aperture = 120;
  elements.push(lens, sample, detector);
  traceAll(elements);

  const beams = specimenIncidentBeams(sample.id) || [];
  assert.equal(beams.length, 2, `two beams reach the specimen, not ${beams.length} records`);
  const [a, b] = beams.sort((x, y) => x.wl - y.wl);
  assert.ok(Math.abs(a.opl - b.opl) < 1e-6, `the arms are matched: ${a.opl} vs ${b.opl}`);

  const reading = specimenTimingReading(sample.id);
  assert.equal(reading.state, 'mixing', 'matched beams were judged out of time');
  assert.ok(reading.overlap > 0.99, `overlap ${reading.overlap}`);
  const spectrum = detectorReading(detector.id)?.spectrum || [];
  assert.ok(spectrum.some(s => Math.abs(s.wavelength - 650) < 2), 'no anti-Stokes line from a matched pair');
});

test('the specimen says why a two-beam signal is missing', () => {
  const bench = ({ extraOplMm = 0, partnerRepMHz = 80 } = {}) => {
    const laser = (wl, y, repRateMHz) => {
      const source = createElement('pulsedlaser', 0, y);
      Object.assign(source.params, {
        wavelength: wl, temporalMode: 'pulsed', repRateMHz, pulseWidthFs: 200, beamMode: 'line',
      });
      return source;
    };
    const elements = [laser(800, -6, 80), laser(1040, 6, partnerRepMHz)];
    if (extraOplMm) {
      const delay = createElement('delayline', 120, 6);
      Object.assign(delay.params, { delayMm: extraOplMm, aperture: 10 });
      elements.push(delay);
    }
    const sample = createElement('sample', 200, 0);
    sample.rot = 90;
    Object.assign(sample.params, {
      aperture: 40, specimenType: 'nonlinear',
      channels: [ch('cars', { eff: 0.5, requireOverlap: true })],
    });
    elements.push(sample, createElement('detector', 400, 0));
    traceAll(elements);
    return specimenTimingReading(sample.id);
  };

  assert.equal(bench().state, 'mixing');
  assert.equal(specimenTimingText(bench()), null, 'a working signal says nothing');

  const late = bench({ extraOplMm: 30 });
  assert.equal(late.state, 'unsynchronized');
  assert.match(specimenTimingText(late), /CARS needs both pulses at the specimen.*100 ps apart \(30 mm of path\)/);

  // Unrelated repetition rates are outside the model rather than simply late.
  const rates = bench({ partnerRepMHz: 37 });
  assert.equal(rates.state, 'unsupported');
  assert.match(specimenTimingText(rates), /timing not modelled/);
});

test('retiring the sum-frequency channel keeps every authored channel that still means something', () => {
  const raw = (kind, extra = {}) => ({
    kind, wl: 520, eff: 0.1, epi: false, epiRatio: 0.15, autoWl: true, autoColor: true,
    color: '#22c55e', material: 'lipid', fluorophore: 'custom', retardance: 90, axis: 45,
    transferEff: 0.1, requireOverlap: true, ...extra,
  });
  const load = channels => parseSketch(JSON.stringify({
    app: 'optics2d', version: 1,
    elements: [{ id: 's', type: 'sample', x: 0, y: 0, rot: 90, params: { specimenType: 'nonlinear', channels } }],
  }), registry).elements[0].params.channels;

  // Two authored second-harmonic channels are two channels, not one.
  const twoHarmonics = load([raw('shg', { eff: 0.1 }), raw('shg', { eff: 0.7, epi: true })]);
  assert.deepEqual(twoHarmonics.map(c => [c.kind, c.eff, c.epi]), [['shg', 0.1, false], ['shg', 0.7, true]]);

  // A lone sum-frequency channel becomes the second-order channel, settings intact.
  const converted = load([raw('sfg', { eff: 0.7, epi: true })]);
  assert.deepEqual(converted.map(c => [c.kind, c.eff, c.epi]), [['shg', 0.7, true]]);

  // Alongside a second-harmonic channel it has nothing left to add.
  assert.deepEqual(load([raw('shg', { eff: 0.1 }), raw('sfg', { eff: 0.7 })]).map(c => c.kind), ['shg']);
  // And it converts in place beside unrelated channels.
  assert.deepEqual(load([raw('cars'), raw('sfg', { eff: 0.4 })]).map(c => c.kind), ['cars', 'shg']);
});

test('the sum frequency is the pair\'s own pulse, not the beam that drove it', () => {
  const bench = ({ driverCw = false } = {}) => {
    const driver = createElement(driverCw ? 'cwlaser' : 'pulsedlaser', 0, -6);
    Object.assign(driver.params, driverCw
      ? { wavelength: 800, beamMode: 'line' }
      : { wavelength: 800, temporalMode: 'pulsed', repRateMHz: 80, pulseWidthFs: 200, beamMode: 'line' });
    const partner = createElement('pulsedlaser', 0, 6);
    Object.assign(partner.params, {
      wavelength: 1030, temporalMode: 'pulsed', repRateMHz: 80, pulseWidthFs: 200, beamMode: 'line',
    });
    const sample = createElement('sample', 200, 0);
    sample.rot = 90;
    Object.assign(sample.params, {
      aperture: 40, specimenType: 'nonlinear', transmitExc: false, transmission: 0,
      channels: [ch('shg', { eff: 0.5, requireOverlap: true })],
    });
    const detector = createElement('detector', 400, 0);
    detector.params.aperture = 60;
    traceAll([driver, partner, sample, detector]);
    const trains = detectorReading(detector.id)?.pulse?.trains || [];
    return trains.find(t => Math.abs((t.centerWavelengthNm || 0) - 450.27) < 1);
  };

  // Two 200 fs pulses make a 141 fs product, not another 200 fs pulse.
  const both = bench();
  assert.ok(both, 'no sum-frequency train at the detector');
  assert.ok(Math.abs(both.pulseWidthFs - 200 / Math.SQRT2) < 0.1, `duration ${both.pulseWidthFs}`);
  assert.notEqual(both.transformLimited, true, 'the driver\'s transform-limited claim is not this signal\'s');

  // A steady driver cannot make the signal steady: it exists only when the
  // pulsed partner is there.
  const withCw = bench({ driverCw: true });
  assert.ok(withCw, 'a CW driver and a pulsed partner produced no sum frequency');
  assert.equal(withCw.repRateMHz, 80, 'the signal must carry the pulsed partner\'s train');
  assert.ok(Math.abs(withCw.pulseWidthFs - 200) < 0.1, `duration ${withCw.pulseWidthFs}`);
});

test('one laser split in two is two beams, and only the arm that meets the pulse is the partner', () => {
  // Branch identity, tested on a real split: one 800 nm laser through a
  // beamsplitter, its two arms independently delayed, and a 1040 nm beam to
  // mix with. Both arms carry the same source, so only the path they took
  // tells them apart -- and averaging them would put a signal where neither
  // arm overlaps.
  const bench = ({ delayMm, order = 'forward' } = {}) => {
    const pump = createElement('pulsedlaser', 0, 0);
    Object.assign(pump.params, {
      wavelength: 800, temporalMode: 'pulsed', repRateMHz: 80, pulseWidthFs: 200, beamMode: 'line',
    });
    const splitter = createElement('bs', 100, 0);
    splitter.rot = 90;
    Object.assign(splitter.params, { ratio: 0.5, size: 25.4 });
    const fold = createElement('mirror', 100, 60);
    fold.rot = 135;
    Object.assign(fold.params, { length: 25.4, refl: 100 });
    // The delay sits in the transmitted arm only, so the two arms move apart.
    const delay = createElement('delayline', 250, 0);
    Object.assign(delay.params, { delayMm, aperture: 24 });
    // The partner colour, arriving 445 mm along: the mean of the two arms
    // when they straddle it.
    const probe = createElement('pulsedlaser', -45, 30);
    Object.assign(probe.params, {
      wavelength: 1040, temporalMode: 'pulsed', repRateMHz: 80, pulseWidthFs: 200, beamMode: 'line',
    });
    const sample = createElement('sample', 400, 30);
    sample.rot = 90;
    Object.assign(sample.params, {
      aperture: 200, specimenType: 'nonlinear',
      channels: [ch('cars', { eff: 0.5, requireOverlap: true })],
    });
    const detector = createElement('detector', 600, 30);
    detector.params.aperture = 200;
    const optics = [pump, splitter, fold, delay, probe];
    traceAll([...(order === 'forward' ? optics : [...optics].reverse()), sample, detector]);
    const beams = specimenIncidentBeams(sample.id) || [];
    return {
      beams,
      arms: beams.filter(b => Math.round(b.wl) === 800),
      reading: specimenTimingReading(sample.id),
      hasSignal: (detectorReading(detector.id)?.spectrum || []).some(s => Math.abs(s.wavelength - 650) < 3),
    };
  };

  // Arms 15 mm either side of the partner: their mean is exactly matched.
  const straddling = bench({ delayMm: 30 });
  assert.equal(straddling.arms.length, 2, 'the split must give two 800 nm beams');
  const [armA, armB] = straddling.arms;
  assert.equal(armA.pulse.sourceId, armB.pulse.sourceId, 'both arms come from the one laser');
  assert.notEqual(armA.branch, armB.branch, 'the two arms must be told apart by the path they took');
  assert.ok(Math.abs(Math.abs(armA.opl - armB.opl) - 30) < 1e-6,
    `the delay line should separate the arms by 30 mm: ${armA.opl} and ${armB.opl}`);
  const partner = straddling.beams.find(b => Math.round(b.wl) === 1040);
  assert.ok(Math.abs((armA.opl + armB.opl) / 2 - partner.opl) < 1e-6,
    'the arms must straddle the partner, so that their mean would look matched');
  assert.ok(Math.abs(armA.opl - partner.opl) > 10 && Math.abs(armB.opl - partner.opl) > 10,
    'neither arm may actually overlap the partner');
  assert.equal(straddling.reading.state, 'unsynchronized');
  assert.ok(!straddling.hasSignal, 'two mistimed arms were averaged into a signal');

  // Move one arm onto the partner: that arm is the partner now.
  const matched = bench({ delayMm: 45 });
  assert.equal(matched.arms.length, 2, 'still two arms');
  assert.equal(matched.reading.state, 'mixing');
  assert.ok(matched.hasSignal, 'the matched arm produced no signal');

  // The order the scene happens to be built in must not decide any of it.
  const reversed = bench({ delayMm: 45, order: 'reverse' });
  assert.equal(reversed.reading.state, 'mixing');
  assert.equal(reversed.hasSignal, matched.hasSignal);
  assert.equal(bench({ delayMm: 30, order: 'reverse' }).hasSignal, false);
});

test('the sampling rays that draw one beam stay one beam', () => {
  // The other half of the same rule: a focused cone is many rays on one path,
  // and they must not be timed against each other.
  const laser = (wl, y) => {
    const source = createElement('pulsedlaser', 0, y);
    Object.assign(source.params, {
      wavelength: wl, temporalMode: 'pulsed', repRateMHz: 80, pulseWidthFs: 1000, beamMode: 'size', dia: 6,
    });
    return source;
  };
  const lens = createElement('lens', 150, 0);
  Object.assign(lens.params, { f: 150, dia: 80 });
  const sample = createElement('sample', 300, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 60, specimenType: 'nonlinear',
    channels: [ch('cars', { eff: 0.5, requireOverlap: true })],
  });
  const detector = createElement('detector', 500, 0);
  detector.params.aperture = 120;
  traceAll([laser(800, -30), laser(1040, 30), lens, sample, detector]);

  const beams = specimenIncidentBeams(sample.id) || [];
  assert.equal(beams.length, 2, `two beams reach the specimen, not ${beams.length} records`);
  assert.equal(new Set(beams.map(b => b.branch)).size, 2, 'each beam is one branch');
  const [a, b] = beams.sort((x, y) => x.wl - y.wl);
  assert.ok(Math.abs(a.opl - b.opl) < 1e-6, `the arms are matched: ${a.opl} vs ${b.opl}`);
  assert.equal(specimenTimingReading(sample.id).state, 'mixing');
  assert.ok((detectorReading(detector.id)?.spectrum || []).some(s => Math.abs(s.wavelength - 650) < 2),
    'no anti-Stokes line from a matched pair');
});

test('the specimen shows where the two beams are, not only when they are wrong', () => {
  // A picosecond is a third of a millimetre of path: no drawing at bench scale
  // can show it, so the number has to be readable while a delay is moved.
  const bench = extraOplMm => {
    const laser = (wl, y) => {
      const source = createElement('pulsedlaser', 0, y);
      Object.assign(source.params, {
        wavelength: wl, temporalMode: 'pulsed', repRateMHz: 80, pulseWidthFs: 1000, beamMode: 'line',
      });
      return source;
    };
    const elements = [laser(800, -6), laser(1040, 6)];
    if (extraOplMm) {
      const delay = createElement('delayline', 120, 6);
      Object.assign(delay.params, { delayMm: extraOplMm, aperture: 10 });
      elements.push(delay);
    }
    const sample = createElement('sample', 200, 0);
    sample.rot = 90;
    Object.assign(sample.params, {
      aperture: 40, specimenType: 'nonlinear',
      channels: [ch('cars', { eff: 0.5, requireOverlap: true })],
    });
    elements.push(sample, createElement('detector', 400, 0));
    traceAll(elements);
    return { sample, text: specimenTimingReadout(specimenTimingReading(sample.id)) };
  };

  // Matched, and it says so rather than staying silent.
  assert.match(bench(0).text, /800 \+ 1040 nm: arriving together, 100% temporal overlap/);
  // Partly overlapping: the number moves continuously, which is what makes a
  // delay scan readable.
  assert.match(bench(0.2).text, /667 fs apart \(0\.2 mm of path\), 54% temporal overlap/);
  assert.match(bench(30).text, /100 ps apart \(30 mm of path\), 0% temporal overlap/);

  // And the readout is offered on both specimen holders when a two-beam signal
  // is configured.
  for (const type of ['sample', 'stage']) {
    const row = registry[type].params.find(p => p.key === 'pulseTiming');
    assert.ok(row, `${type} has no timing readout`);
    const { sample } = bench(0);
    assert.equal(row.show({ ...sample.params }), true, `${type} hides it from a two-beam specimen`);
    assert.equal(row.show({ ...sample.params, channels: [ch('fluor')] }), false,
      `${type} shows it where no signal needs two beams`);
  }
});

test('a scene carrying both second harmonic and sum frequency keeps the harmonic channel', () => {
  // The authored migration choice: the surviving chi(2) channel covers what
  // the sum-frequency entry did, and that entry's own settings go with it
  // rather than the scene emitting each signal twice.
  const raw = (kind, extra = {}) => ({
    kind, wl: 520, eff: 0.1, epi: false, epiRatio: 0.15, autoWl: true, autoColor: true,
    color: '#22c55e', material: 'lipid', fluorophore: 'custom', retardance: 90, axis: 45,
    transferEff: 0.1, requireOverlap: true, ...extra,
  });
  const load = channels => parseSketch(JSON.stringify({
    app: 'optics2d', version: 1,
    elements: [{ id: 's', type: 'sample', x: 0, y: 0, rot: 90, params: { specimenType: 'nonlinear', channels } }],
  }), registry).elements[0].params.channels;

  const conflicting = [
    raw('shg', { eff: 0.1, epi: false, autoWl: true, color: '#22c55e', requireOverlap: true }),
    raw('sfg', { eff: 0.7, epi: true, epiRatio: 0.4, autoWl: false, wl: 400, color: '#ff0000', requireOverlap: false }),
  ];
  for (const order of [conflicting, [...conflicting].reverse()]) {
    const loaded = load(order);
    assert.equal(loaded.length, 1, 'one second-order channel survives, whichever order they were saved in');
    const [only] = loaded;
    assert.equal(only.kind, 'shg');
    // The harmonic channel's own settings, not the retired entry's.
    assert.equal(only.eff, 0.1);
    assert.equal(only.epi, false);
    assert.equal(only.autoWl, true);
    assert.equal(only.color, '#22c55e');
    assert.equal(only.requireOverlap, true);
  }
});

test('with the overlap requirement off, the readout says timing is not checked', () => {
  // An unchecked channel still draws its schematic signal, so the readout must
  // not suggest there is no two-beam signal at all.
  const bench = requireOverlap => {
    const laser = (wl, y) => {
      const source = createElement('pulsedlaser', 0, y);
      Object.assign(source.params, {
        wavelength: wl, temporalMode: 'pulsed', repRateMHz: 80, pulseWidthFs: 200, beamMode: 'line',
      });
      return source;
    };
    const delay = createElement('delayline', 120, 6);
    Object.assign(delay.params, { delayMm: 30, aperture: 10 });
    const sample = createElement('sample', 200, 0);
    sample.rot = 90;
    Object.assign(sample.params, {
      aperture: 40, specimenType: 'nonlinear', channels: [ch('cars', { eff: 0.5, requireOverlap })],
    });
    const detector = createElement('detector', 400, 0);
    detector.params.aperture = 60;
    traceAll([laser(800, -6), laser(1040, 6), delay, sample, detector]);
    return {
      text: specimenTimingReadout(specimenTimingReading(sample.id)),
      hasSignal: (detectorReading(detector.id)?.spectrum || []).some(s => Math.abs(s.wavelength - 650) < 2),
    };
  };

  const unchecked = bench(false);
  assert.ok(unchecked.hasSignal, 'with the requirement off the schematic signal is drawn');
  assert.match(unchecked.text, /800 \+ 1040 nm: pulse-overlap requirement off, so arrival timing is not checked/);

  // With it on, the same 30 mm mismatch is timed and reported.
  const checked = bench(true);
  assert.ok(!checked.hasSignal);
  assert.match(checked.text, /100 ps apart/);

  assert.equal(specimenTimingReadout(null), 'No two-beam timing measured yet');
});

test('an unchecked channel never hides a checked channel\'s timing verdict', () => {
  // Two CARS channels on one specimen, one with the overlap check and one
  // without, in both orders: the readout must keep the real verdict.
  const run = order => {
    const laser = (wl, y) => {
      const source = createElement('pulsedlaser', 0, y);
      Object.assign(source.params, {
        wavelength: wl, temporalMode: 'pulsed', repRateMHz: 80, pulseWidthFs: 200, beamMode: 'line',
      });
      return source;
    };
    const delay = createElement('delayline', 120, 6);
    Object.assign(delay.params, { delayMm: 30, aperture: 10 });
    const sample = createElement('sample', 200, 0);
    sample.rot = 90;
    const checked = ch('cars', { eff: 0.5, requireOverlap: true });
    const unchecked = ch('cars', { eff: 0.5, requireOverlap: false });
    Object.assign(sample.params, {
      aperture: 40, specimenType: 'nonlinear',
      channels: order === 'checked-first' ? [checked, unchecked] : [unchecked, checked],
    });
    const detector = createElement('detector', 400, 0);
    detector.params.aperture = 60;
    traceAll([laser(800, -6), laser(1040, 6), delay, sample, detector]);
    return {
      text: specimenTimingReadout(specimenTimingReading(sample.id)),
      hasSignal: (detectorReading(detector.id)?.spectrum || []).some(s => Math.abs(s.wavelength - 650) < 2),
    };
  };
  for (const order of ['checked-first', 'unchecked-first']) {
    const { text, hasSignal } = run(order);
    assert.match(text, /100 ps apart \(30 mm of path\), 0% temporal overlap/, `${order}: ${text}`);
    assert.ok(hasSignal, `${order}: the unchecked channel should still draw its schematic signal`);
  }
});
