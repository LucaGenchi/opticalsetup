import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createElement, registry, newSampleChannel, sampleChannels, legacySampleChannels,
  sumFrequencyWl, carsAntiStokesWl, MAX_SAMPLE_CHANNELS, MIXING_KINDS, EPI_CAPABLE_KINDS, specimenTypeOf,
} from '../sketch/js/elements.js';
import { traceAll, traceScene, detectorReading, specimenSignalWl } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';

const ch = (kind, over = {}) => ({ ...newSampleChannel(kind), ...over });

// These benches stack signals directly, so they must also say which kind of
// specimen offers them — the trace only honors channels a specimen's own
// type actually provides.
const LINEAR = new Set(['fluor', 'raman', 'phase']);
const specimenTypeFor = channels =>
  (channels.length && channels.every(c => LINEAR.has(c.kind)) ? 'linear' : 'nonlinear');

// Wavelengths (rounded) a forward detector sees, strongest-first order removed.
function detectedWls(elements) {
  const detector = elements[elements.length - 1];
  traceAll(elements);
  const reading = detectorReading(detector.id);
  return reading ? reading.spectrum.map(s => Math.round(s.wavelength)).sort((a, b) => a - b) : [];
}

// A two-colour bench: 800 nm pump + 1040 nm Stokes onto one specimen.
// The specimen surface is horizontal at rot 0 (its clear aperture runs
// left-right); a left-to-right test beam needs it rotated 90° to be crossed.
function twoColourBench(channels, { aperture = 40 } = {}) {
  const pump = createElement('laser', 0, -5);
  pump.params.wavelength = 800;
  const stokes = createElement('laser', 0, 5);
  stokes.params.wavelength = 1040;
  const sample = createElement('sample', 200, 0);
  sample.rot = 90;
  sample.params.aperture = aperture;
  sample.params.specimenType = specimenTypeFor(channels);
  sample.params.channels = channels;
  const detector = createElement('detector', 400, 0);
  detector.params.aperture = 60;
  return [pump, stokes, sample, detector];
}

function singleColourBench(channels, wavelength = 800) {
  const laser = createElement('laser', 0, 0);
  laser.params.wavelength = wavelength;
  const sample = createElement('sample', 200, 0);
  sample.rot = 90;
  sample.params.specimenType = specimenTypeFor(channels);
  sample.params.channels = channels;
  const detector = createElement('detector', 400, 0);
  return [laser, sample, detector];
}

// Counts rays leaving the specimen plane, split by direction of travel.
function emissionDirections(elements, sampleX = 200) {
  const scene = traceScene(elements);
  let forward = 0, epi = 0;
  for (const d of scene.drawables) {
    if (d.type !== 'path' || !d.pts || d.pts.length < 2) continue;
    if (Math.abs(d.pts[0].x - sampleX) > 2) continue;
    const dx = d.pts[1].x - d.pts[0].x;
    if (dx > 0.01) forward++;
    else if (dx < -0.01) epi++;
  }
  return { forward, epi };
}

// ---------------- photon-energy bookkeeping ----------------

test('sum-frequency and anti-Stokes wavelengths follow photon-energy conservation', () => {
  // 1/lambda_SFG = 1/800 + 1/1040
  assert.ok(Math.abs(sumFrequencyWl(800, 1040) - 452.17) < 0.01);
  // omega_as = 2*omega_pump - omega_Stokes
  assert.ok(Math.abs(carsAntiStokesWl(800, 1040) - 650) < 0.01);
  // The anti-Stokes photon is always bluer than the pump, the SFG photon
  // bluer than both parents.
  assert.ok(carsAntiStokesWl(800, 1040) < 800);
  assert.ok(sumFrequencyWl(800, 1040) < 800);
  // Unphysical combinations report null rather than a negative wavelength.
  assert.equal(carsAntiStokesWl(1040, 500), null, 'a Stokes beam bluer than half the pump has no anti-Stokes solution');
});

// ---------------- 1. CARS requires two different colours ----------------

test('CARS is silent under single-beam illumination and lights up with a second colour', () => {
  const alone = detectedWls(singleColourBench([ch('cars', { eff: 0.5 })]));
  assert.deepEqual(alone, [800], 'only the transmitted excitation — no anti-Stokes from one beam');

  const paired = detectedWls(twoColourBench([ch('cars', { eff: 0.5 })]));
  assert.ok(paired.includes(650), `expected the 650 nm anti-Stokes signal, got ${paired}`);
  assert.deepEqual(paired, [650, 800, 1040]);
});

test('the CARS wavelength is derived from the beams present, not typed in', () => {
  const channel = ch('cars');
  assert.equal(channel.autoWl, true, 'auto-derived by default');
  // Pump is the shorter wavelength of the pair; only it drives the mixing,
  // so the pair emits one anti-Stokes photon rather than one per beam.
  assert.ok(Math.abs(specimenSignalWl(channel, 800, [800, 1040]) - 650) < 0.01);
  assert.equal(specimenSignalWl(channel, 1040, [800, 1040]), null, 'the Stokes beam does not also generate');
  assert.equal(specimenSignalWl(channel, 800, [800]), null, 'a single colour cannot mix');
  assert.equal(specimenSignalWl(channel, 800, [800, 800.5]), null, 'two indistinguishable colours cannot mix');
});

test('a manual CARS wavelength still overrides the derived one', () => {
  const channel = ch('cars', { autoWl: false, wl: 660 });
  assert.equal(specimenSignalWl(channel, 800, [800]), 660, 'a typed line works without a second beam');
  const wls = detectedWls(singleColourBench([ch('cars', { eff: 0.5, autoWl: false, wl: 660 })]));
  assert.deepEqual(wls, [660, 800]);
});

// ---------------- 2. epi-detected signal ----------------

test('parametric signals are forward-only until epi is switched on', () => {
  const off = emissionDirections(singleColourBench([ch('shg', { eff: 0.5, epi: false })]));
  assert.equal(off.epi, 0, 'forward-only by default, as before');
  assert.ok(off.forward > 0);

  const on = emissionDirections(singleColourBench([ch('shg', { eff: 0.5, epi: true })]));
  assert.ok(on.epi > 0, 'the epi lobe appears once enabled');
});

test('epi-CARS is weaker than its forward signal by the configured ratio', () => {
  const sample = createElement('sample', 200, 0);
  const channel = ch('cars', { eff: 0.5, epi: true, epiRatio: 0.2 });
  sample.params.channels = [channel];
  sample.params.aperture = 40;
  const elements = twoColourBench([channel]);
  assert.ok(emissionDirections(elements).epi > 0, 'epi-CARS reaches the backward half-space');

  // Fluorescence is incoherent and already isotropic, so it offers no epi
  // switch to turn on.
  assert.equal(EPI_CAPABLE_KINDS.has('fluor'), false);
  for (const kind of ['shg', 'thg', 'sfg', 'cars']) assert.ok(EPI_CAPABLE_KINDS.has(kind));
});

// ---------------- 3. signals really are generated ----------------

test('every signal kind survives a 700 nm shortpass placed after the specimen', () => {
  // The reported symptom was "only fluorescence gets through". The cause was
  // collection geometry, not generation: an epi detection arm only ever saw
  // isotropic fluorescence, because the parametric signals were forward-only.
  const cases = [
    [[ch('shg', { eff: 0.5 })], 400],
    [[ch('thg', { eff: 0.5 })], 267],
    [[ch('cars', { eff: 0.5, autoWl: false, wl: 660 })], 660],
  ];
  for (const [channels, expected] of cases) {
    const laser = createElement('laser', 0, 0);
    laser.params.wavelength = 800;
    const sample = createElement('sample', 200, 0);
    sample.rot = 90;
    sample.params.specimenType = specimenTypeFor(channels);
    sample.params.channels = channels;
    const filter = createElement('filter', 300, 0);
    filter.params.ftype = 'shortpass';
    filter.params.cutoff = 700;
    const detector = createElement('detector', 400, 0);
    const wls = detectedWls([laser, sample, filter, detector]);
    assert.deepEqual(wls, [expected], `${channels[0].kind} should pass the shortpass, got ${wls}`);
  }
});

// ---------------- 4. every beam drives the single-beam signals ----------------

test('SHG and THG are generated from each beam illuminating the specimen', () => {
  const shg = detectedWls(twoColourBench([ch('shg', { eff: 0.3 })]));
  assert.ok(shg.includes(400) && shg.includes(520), `both harmonics expected, got ${shg}`);

  const thg = detectedWls(twoColourBench([ch('thg', { eff: 0.3 })]));
  assert.ok(thg.includes(267) && thg.includes(347), `both third harmonics expected, got ${thg}`);
});

// ---------------- 5 + 6. SFG, and stacking up to five signals ----------------

test('SFG needs two colours and lands at their sum frequency', () => {
  assert.deepEqual(detectedWls(singleColourBench([ch('sfg', { eff: 0.5 })])), [800]);
  const wls = detectedWls(twoColourBench([ch('sfg', { eff: 0.5 })]));
  assert.ok(wls.includes(452), `expected the 452 nm sum-frequency signal, got ${wls}`);
  assert.ok(MIXING_KINDS.has('sfg') && MIXING_KINDS.has('cars'));
});

test('a multimodal specimen emits all five signal kinds at once from one crossing', () => {
  const wls = detectedWls(twoColourBench([
    ch('fluor', { wl: 520, eff: 0.1 }),
    ch('shg', { eff: 0.1 }),
    ch('thg', { eff: 0.1 }),
    ch('sfg', { eff: 0.1 }),
    ch('cars', { eff: 0.1 }),
  ]));
  // SHG of both beams (400, 520), THG of both (267, 347), SFG (452),
  // CARS (650), and both transmitted excitation beams.
  for (const expected of [267, 347, 400, 452, 520, 650, 800, 1040]) {
    assert.ok(wls.includes(expected), `missing ${expected} nm from ${wls}`);
  }
});

test('the channel list is capped and an empty list is an optically inert specimen', () => {
  assert.equal(MAX_SAMPLE_CHANNELS, 5);
  const over = Array.from({ length: 8 }, () => ch('shg'));
  const sample = createElement('sample', 0, 0);
  sample.params.specimenType = 'nonlinear';
  sample.params.channels = over;
  assert.equal(sampleChannels(sample.params).length, 5, 'never more than five stacked signals');

  const inert = createElement('sample', 200, 0);
  assert.deepEqual(inert.params.channels, [], 'a fresh specimen starts inert');
  const surfaces = registry.sample.surfaces(inert);
  assert.equal(surfaces.length, 1);
  assert.equal(surfaces[0].kind, 'attenuate', 'no channels means plain attenuation, as before');
});

// ---------------- backward compatibility ----------------

test('sketches saved before stacked channels keep working through their legacy mode', () => {
  for (const [mode, expected] of [['fluor', 'fluor'], ['shg', 'shg'], ['thg', 'thg'], ['cars', 'cars']]) {
    const derived = legacySampleChannels({ mode, fluorWl: 520, carsWl: 660, signalEff: 0.25 });
    assert.equal(derived.length, 1, `${mode} reads as one channel`);
    assert.equal(derived[0].kind, expected);
    assert.equal(derived[0].eff, 0.25, 'the old single signalEff carries over');
  }
  assert.deepEqual(legacySampleChannels({ mode: 'none' }), []);

  // A legacy CARS line was a typed wavelength, so it must not suddenly
  // require a second beam to appear.
  const legacyCars = legacySampleChannels({ mode: 'cars', carsWl: 660, signalEff: 0.5 });
  assert.equal(legacyCars[0].autoWl, false);

  const laser = createElement('laser', 0, 0);
  laser.params.wavelength = 800;
  const sample = createElement('sample', 200, 0);
  sample.rot = 90;
  // A pre-type sketch has no specimenType at all; loading one runs the
  // migrate hook, so mimic that here rather than the plain default.
  sample.params.specimenType = specimenTypeOf({ mode: 'shg' });
  sample.params.mode = 'shg';
  sample.params.signalEff = 0.5;
  const detector = createElement('detector', 400, 0);
  assert.deepEqual(detectedWls([laser, sample, detector]), [400, 800]);
});

test('channels survive a save/load round trip and are clamped on the way in', () => {
  const scene = parseSketch(JSON.stringify({
    app: 'optics2d', version: 1, beams: [],
    elements: [{
      type: 'sample', x: 0, y: 0,
      params: {
        aperture: 34,
        channels: [
          { kind: 'cars', wl: 660, eff: 0.4, epi: true, epiRatio: 0.2, autoWl: false, autoColor: false, color: '#00e5ff' },
          { kind: 'bogus', eff: 99, epiRatio: -3, color: 'not-a-color' },
        ],
      },
    }],
  }), registry);
  const [saved, coerced] = scene.elements[0].params.channels;
  assert.deepEqual(saved, {
    kind: 'cars', wl: 660, eff: 0.4, epi: true, epiRatio: 0.2,
    autoWl: false, autoColor: false, color: '#00e5ff',
    // Fields belonging to other signal kinds round-trip at their defaults.
    material: 'lipid', retardance: 90, axis: 45, transferEff: 0.1, requireOverlap: true,
  });
  assert.equal(coerced.kind, 'fluor', 'an unknown signal kind falls back rather than breaking the load');
  assert.equal(coerced.eff, 1, 'efficiency clamps into 0..1');
  assert.equal(coerced.epiRatio, 0, 'epi ratio clamps into 0..1');
  assert.equal(coerced.color, '#22c55e', 'a malformed colour falls back to the default tint');
  assert.equal(coerced.autoColor, true, 'channels colour themselves from their wavelength by default');
});

test('a generated signal is coloured by its own wavelength, not by its source laser', () => {
  // Regression: a custom-coloured pump painted every signal it generated with
  // the pump's colour, so an IR laser tinted red made its 515 nm SHG red too.
  const signalColours = channels => {
    const laser = createElement('laser', 0, 0);
    laser.params.wavelength = 1030;
    laser.params.autoColor = false;
    laser.params.color = '#ff0000';
    const sample = createElement('sample', 200, 0);
    sample.rot = 90;
    sample.params.specimenType = specimenTypeFor(channels);
    sample.params.channels = channels;
    const scene = traceScene([laser, sample]);
    return new Set(scene.drawables.filter(d => d.pts && d.pts[0].x >= 199).map(d => d.color));
  };

  const auto = signalColours([ch('shg', { eff: 0.5 })]);
  assert.ok(auto.has('#1fff00'), `515 nm SHG should be drawn green, got ${[...auto]}`);
  assert.ok(auto.has('#ff0000'), 'the pump keeps its own custom colour');

  const custom = signalColours([ch('shg', { eff: 0.5, autoColor: false, color: '#00e5ff' })]);
  assert.ok(custom.has('#00e5ff'), `a custom channel tint should win, got ${[...custom]}`);
  assert.ok(!custom.has('#1fff00'));
});

test('channels colour themselves from their own wavelength across the spectrum', () => {

  // 1030 nm doubled is green; 790 nm doubled is violet.
  const shgOf = wl => {
    const laser = createElement('laser', 0, 0);
    laser.params.wavelength = wl;
    const sample = createElement('sample', 200, 0);
    sample.rot = 90;
    sample.params.specimenType = 'nonlinear';
    sample.params.channels = [ch('shg', { eff: 0.5 })];
    const scene = traceScene([laser, sample]);
    return scene.drawables.filter(d => d.pts && d.pts[0].x >= 199).map(d => d.color);
  };
  assert.ok(shgOf(1030).includes('#1fff00'), 'SHG of 1030 nm reads green');
  assert.ok(shgOf(790).includes('#8000a1'), 'SHG of 790 nm reads violet');
});

test('stacking signals never dims the transmitted excitation', () => {
  // Signal efficiency is a visibility gain for the diagram, not an energy
  // budget — real conversion is ~1e-6 — so the excitation is set by the
  // specimen's own transmission alone, however many channels are stacked.
  const read = channels => {
    const laser = createElement('laser', 0, 0);
    laser.params.wavelength = 800;
    const sample = createElement('sample', 200, 0);
    sample.rot = 90;
    sample.params.specimenType = specimenTypeFor(channels);
    sample.params.channels = channels;
    sample.params.transmission = 0.8;
    const detector = createElement('detector', 400, 0);
    traceAll([laser, sample, detector]);
    return detectorReading(detector.id).spectrum.find(s => Math.round(s.wavelength) === 800).power;
  };
  const bare = read([]);
  const loaded = read([ch('shg', { eff: 0.4 }), ch('thg', { eff: 0.4 })]);
  assert.ok(Math.abs(bare - loaded) < 1e-9, `excitation should be ${bare} either way, got ${loaded}`);
});

// ---------------- inspector layout cleanup ----------------

test('the piezo holder always carries a specimen — no "Sample installed" switch', () => {
  const keys = registry.stage.params.map(p => p.key);
  assert.ok(!keys.includes('containsSample'), 'the redundant installed/empty toggle is gone');

  // A freshly placed holder is an inert specimen: it attenuates, emits
  // nothing, and still presents its optical surface to the beam.
  const stage = createElement('stage', 200, 0);
  assert.deepEqual(stage.params.channels, []);
  const kinds = registry.stage.surfaces(stage).map(s => s.kind);
  assert.ok(kinds.includes('attenuate'), `the mounted specimen is always in the beam, got ${kinds}`);

  stage.rot = 90;
  const laser = createElement('laser', 0, 0);
  const detector = createElement('detector', 400, 0);
  assert.deepEqual(detectedWls([laser, stage, detector]), [532], 'excitation passes, no signal added');
});

test('size fields that read as presentation live in Label & appearance', () => {

  const stageAperture = registry.stage.params.find(p => p.key === 'aperture');
  assert.equal(stageAperture.appearance, true, 'the holder clear aperture moved out of Optical behavior');

  const sampleAperture = registry.sample.params.find(p => p.key === 'aperture');
  assert.equal(sampleAperture.appearance, true);
  assert.equal(sampleAperture.label, 'Sample width (mm)', 'the sample size is a width, not a height');
});
