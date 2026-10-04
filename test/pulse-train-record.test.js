// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The packets drawn on a beam are timed from the pulse's record, and the
// record describes the pulse train. Where a train travels as several rays --
// the wavelength samples of a fanned-out band, the two sides a notch leaves,
// the pieces of an AOTF's depleted beam -- each ray is only part of it. The
// record used to be taken from the one ray, so each packet showed its own
// piece of the spectrum, and a pulse an earlier filter had reshaped kept
// that filter's record. A detector combines everything that arrives and was
// already right; these tests hold the packets to it.

import assert from 'node:assert/strict';
import test from 'node:test';
import '../sketch/js/detector-instruments.js';
import { createElement, newSampleChannel } from '../sketch/js/elements.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';
import { pulseEnvelopeAtOpticalPath } from '../sketch/js/pulses.js';

const pulsed = (params = {}) => {
  const src = createElement('pulsedlaser', 0, 0);
  Object.assign(src.params, { beamMode: 'line', wavelength: 800, transformLimited: false, bandwidth: 60, ...params });
  return src;
};
const continuum = () => {
  const src = createElement('sclaser', 0, 0);
  Object.assign(src.params, { temporalMode: 'pulsed', beamMode: 'line', scMin: 700, scMax: 900, pulseWidthFs: 500 });
  return src;
};
const at = (type, x, params) => {
  const el = createElement(type, x, 0);
  Object.assign(el.params, params);
  return el;
};
const rod = x => at('glassrod', x, { rodlen: 100, dia: 20, material: 'nbk7' });
const bandpass = (x, center, band) => at('filter', x, { ftype: 'bandpass', center, band });

// The detector's duration and the widths of the packets arriving at it.
function arriving(source, elements) {
  const det = createElement('detector', 950, 0);
  det.params.aperture = 40;
  const { pulseTracks } = traceScene([source, ...elements, det]);
  const end = Math.max(...pulseTracks.map(track => track.opls.at(-1)));
  const packets = pulseTracks.filter(track => track.opls.at(-1) > end - 1 && track.intensity > 1e-5)
    .map(track => pulseEnvelopeAtOpticalPath(track, track.opls.at(-1) - 1e-6)?.pulseWidthFs)
    .filter(Number.isFinite);
  const reading = detectorReading(det.id);
  return { packets, detector: reading?.pulse?.stretchedPulseWidthFs ?? null, signal: reading?.signal ?? 0 };
}
const agree = (name, { packets, detector }, tolerance = 0.01) => {
  assert.ok(packets.length > 0 && detector > 0, `${name}: timed (${detector} fs, ${packets.length} packets)`);
  for (const width of packets) {
    assert.ok(Math.abs(width - detector) <= tolerance * detector, `${name}: packet ${width} fs, detector ${detector} fs`);
  }
};

test('a selector cutting across several fanned-out samples draws the whole line', () => {
  // A 20 nm band behind glass travels as 4 nm samples; a 2 nm AOTF line or a
  // 4 nm bandpass then spans several of them. Each packet showed its own
  // sample's piece (452-579 fs for a 259 fs line), or the earlier bandpass's
  // stale record (105 fs for 471 fs).
  agree('bandpass, glass, AOTF', arriving(pulsed(), [bandpass(100, 800, 20), rod(250), at('aotf', 550, { channels: [{ wl: 800, eff: 1 }], passband: 2 })]));
  agree('bandpass, glass, narrower bandpass', arriving(pulsed(), [bandpass(100, 800, 20), rod(250), bandpass(700, 800, 4)]));
  agree('glass, bandpass', arriving(pulsed(), [rod(250), bandpass(700, 800, 4)]));
  agree('glass, AOTF', arriving(pulsed(), [rod(250), at('aotf', 550, { channels: [{ wl: 800, eff: 1 }], passband: 2 })]));
});

test('the two sides a notch leaves are drawn as one pulse', () => {
  // The sides travel as two rays. Timed apart they read 29 fs and 35 fs;
  // together, as the detector reads them, 16 fs.
  const sides = arriving(pulsed(), [at('filter', 300, { ftype: 'notch', center: 800, band: 10 })]);
  assert.equal(sides.packets.length, 2);
  agree('notch', sides);
});

test('a continuum cut twice behind glass is drawn close to what the detector reads', () => {
  // Each sample carries the glass's dispersion at its own wavelength, so the
  // packets differ a little from one another; they used to show a fraction
  // of the band (119-243 fs for 392 fs).
  const cut = arriving(continuum(), [rod(250), at('filter', 600, { ftype: 'longpass', cutoff: 780 }), at('filter', 750, { ftype: 'shortpass', cutoff: 820 })]);
  agree('longpass then shortpass', cut, 0.12);
});

test('recombined, an AOTF\'s two beams read as the beam that came in', () => {
  // The depleted pieces carry the incoming spectrum less the selected line,
  // so with the selected beam back on the axis a filter behind them sees the
  // incoming pulse: power and duration as with no AOTF.
  const filter = bandpass(500, 800, 30);
  const plain = arriving(pulsed(), [filter]);
  const recombined = arriving(pulsed(), [at('aotf', 300, { channels: [{ wl: 800, eff: 1 }], passband: 2, showDepleted: true, deflect: 0 }), filter]);
  assert.ok(Math.abs(recombined.signal - plain.signal) <= 2e-3 * plain.signal, `power ${recombined.signal} vs ${plain.signal}`);
  assert.ok(Math.abs(recombined.detector - plain.detector) <= 0.01 * plain.detector, `duration ${recombined.detector} vs ${plain.detector} fs`);
});

test('a second filter re-records the pulse; a first one and bare glass are as before', () => {
  // One ray with its own spectrum is the whole train.
  agree('one bandpass', arriving(pulsed(), [bandpass(300, 800, 30)]), 1e-3);
  // A second filter on it was not re-detected as reshaping, so the packet
  // kept the first filter's record: 64 fs drawn for a 236 fs pulse.
  agree('two bandpasses', arriving(pulsed(), [bandpass(200, 800, 30), bandpass(400, 800, 8)]), 1e-3);
  agree('a longpass then a shortpass', arriving(pulsed(), [at('filter', 200, { ftype: 'longpass', cutoff: 795 }), at('filter', 400, { ftype: 'shortpass', cutoff: 803 })]), 1e-3);
  // Glass alone reshapes nothing: every sample keeps the emitted pulse and
  // its own dispersion, as before.
  const fanned = arriving(pulsed(), [rod(250)]);
  assert.equal(fanned.packets.length, 5);
  assert.ok(Math.min(...fanned.packets) > 600 && Math.max(...fanned.packets) < 1000, `${fanned.packets}`);
});

test('a harmonic behind glass and a filter keeps the record it had', () => {
  // The harmonic carries the pump's record, which does not describe it; a
  // filter acting on its samples must not rebuild that record from the
  // pump's spectrum (which gave 31 fs packets for light the detector reads
  // at a picosecond).
  const through = filter => arriving(pulsed({ bandwidth: 30 }), [
    bandpass(100, 800, 20), at('crystal', 250, { convert: 'shg', efficiency: 0.5, transmitPump: false }), rod(450),
    ...(filter ? [bandpass(700, 400, 10)] : []),
  ]);
  const filtered = through(true), unfiltered = through(false);
  assert.ok(filtered.packets.length > 0 && unfiltered.packets.length > 0);
  assert.ok(Math.min(...filtered.packets) > 200, `packets ${filtered.packets}`);
});

// --- Whose light a record describes ---------------------------------------
// Light a crystal or a specimen generates keeps the pump's pulse record. The
// record still times the train, but it does not describe the new light, and
// must not be rebuilt from the pump's spectrum when that light meets a
// filter. Whether it does cannot be read from wavelengths: a pump 300 nm
// wide reaches its own second harmonic's band, and one 500 nm wide holds the
// harmonic's centre. The mark is set where the light is generated and has to
// survive everything that only copies a record.

const generators = {
  'a crystal': x => at('crystal', x, { convert: 'shg', efficiency: 0.5, transmitPump: false }),
  'a specimen': x => {
    const el = at('sample', x, { specimenType: 'nonlinear', transmitExc: false, channels: [{ ...newSampleChannel('shg'), eff: 0.5 }] });
    el.rot = 90;
    return el;
  },
};
const copiers = {
  'an AOM': [['aom', { eff: 1, zero: false, deflect: 0, modulate: false }]],
  'a gated AOM': [['aom', { eff: 1, zero: false, deflect: 0, modulate: true, modFreqMHz: 40, chopDuty: 0.5 }]],
  'a chopper': [['chopper', { modulate: true, frequencyHz: 1000, chopDuty: 0.5 }]],
  'an AOD': [['aod', { centerDeflect: 0, scanRange: 0, aperture: 30 }]],
  'a shaper': [['slm', { transmissive: true, layers: [{ type: 'grating', orders: '1', lines: 300 }, { type: 'grating', orders: '-1', lines: 300 }] }]],
};

// What arrives at the detector of: pump, generator, (copier), glass, two bandpasses at 400 nm.
function generated(bandwidth, generator, copier) {
  const det = createElement('detector', 950, 0);
  det.params.aperture = 60;
  const middle = (copier || []).map(([type, params], i) => at(type, 330 + 60 * i, params));
  const { pulseTracks } = traceScene([
    pulsed({ bandwidth }), generator(250), ...middle, rod(480), bandpass(650, 400, 40), bandpass(750, 400, 20), det,
  ]);
  const end = Math.max(...pulseTracks.map(track => track.opls.at(-1)));
  const last = pulseTracks.filter(track => track.opls.at(-1) > end - 1 && track.intensity > 1e-7);
  const reading = detectorReading(det.id);
  return {
    signal: reading?.signal ?? 0,
    duration: reading?.pulse?.stretchedPulseWidthFs ?? null,
    model: reading?.pulse?.dispersionModel ?? null,
    // Distinct values: an AOD hands the same light on as more than one track.
    packets: [...new Set(last.map(track => pulseEnvelopeAtOpticalPath(track, track.opls.at(-1) - 1e-6)?.pulseWidthFs ?? null))].sort(),
    pieces: last.flatMap(track => track.pulse.filteredPieces || []),
    record: [...new Set(last.map(track => (track.pulse.filteredPieces || []).map(p => `${p.lo}-${p.hi}`).join('+')))].sort(),
  };
}

test('a harmonic of a broad pump is not re-recorded from the pump', () => {
  // Rebuilt from the pump's spectrum, the record was the pump's tail,
  // 417.8-420 nm, outside the 390-410 nm the last filter passes, with a
  // 239 fs packet.
  for (const bandwidth of [300, 500]) {
    const harmonic = generated(bandwidth, generators['a crystal'], null);
    assert.ok(harmonic.signal > 0.01, `${bandwidth} nm: the harmonic arrives`);
    assert.ok(harmonic.pieces.length > 0 && harmonic.pieces.every(piece => piece.lo < 400 && piece.hi > 400),
      `${bandwidth} nm: the record holds the harmonic (${harmonic.pieces.map(p => `${p.lo}-${p.hi}`)})`);
    assert.ok(harmonic.packets.every(width => width > 1000), `${bandwidth} nm: packets ${harmonic.packets}`);
  }
});

test('an element that copies the record does not make generated light look described', () => {
  // An AOM, a chopper, an AOD and a shaper hand the record on, with a gate
  // or as it is. Behind any of them the generated light reads exactly as it
  // does without: same duration, same model, same packets, same record.
  // Taking a copied record for a new one cleared the mark, and a specimen's
  // emission was given a 23.6 fs packet out of the pump's spectrum.
  for (const bandwidth of [300, 500]) {
    for (const [source, generator] of Object.entries(generators)) {
      const plain = generated(bandwidth, generator, null);
      assert.ok(plain.signal > 0.01, `${source}, ${bandwidth} nm: light arrives`);
      for (const [name, copier] of Object.entries(copiers)) {
        const behind = generated(bandwidth, generator, copier);
        const where = `${source}, ${bandwidth} nm pump, behind ${name}`;
        assert.ok(behind.signal > 0.004, `${where}: light arrives`);
        assert.equal(behind.duration, plain.duration, `${where}: duration`);
        assert.equal(behind.model, plain.model, `${where}: model`);
        assert.deepEqual(behind.packets, plain.packets, `${where}: packets`);
        assert.deepEqual(behind.record, plain.record, `${where}: record`);
      }
    }
  }
});

test('light that was only selected is still re-recorded behind a copier', () => {
  // The mark is for generated light alone: a filtered pulse through an AOM
  // or a chopper and then a second filter gets the second filter's record.
  for (const [name, copier] of Object.entries(copiers).slice(0, 3)) {
    const middle = copier.map(([type, params], i) => at(type, 330 + 60 * i, params));
    agree(`two bandpasses with ${name} between`, arriving(pulsed(), [bandpass(200, 800, 30), ...middle, bandpass(600, 800, 8)]), 1e-3);
  }
});

// --- The safe way round ----------------------------------------------------
// A ray counts as described by its pulse record only while that is known:
// from a pulsed source, through elements that only select, fan or copy.
// Anything else switches the whole-train record off for that light, which is
// then drawn as it always was. These hold the cases where assuming the
// opposite invented a record.

// What the last stretch of beam before the detector carries.
function lastStretch(elements, beams = []) {
  const det = createElement('detector', 900, 0);
  det.params.aperture = 60;
  const { pulseTracks } = traceScene([...elements, det], beams);
  const end = Math.max(...pulseTracks.map(track => track.opls.at(-1)));
  const last = pulseTracks.filter(track => track.opls.at(-1) > end - 1 && track.intensity > 1e-7);
  return {
    signal: detectorReading(det.id)?.signal ?? 0,
    records: last.map(track => (track.pulse.filteredPieces || []).map(p => [p.lo, p.hi])),
    packets: last.map(track => pulseEnvelopeAtOpticalPath(track, track.opls.at(-1) - 1e-6)?.pulseWidthFs ?? null),
  };
}
const fibre = (from, to) => ({
  id: 'fb', kind: 'fiber', pts: [{ x: from, y: 0 }, { x: to, y: 0 }], width: 20,
  propagate: true, lossDbPerM: 0, outMode: 'focus', f: 100, diameter: 1, na: 0.22,
});
const after = centre => [
  at('glassrod', 590, { rodlen: 60, dia: 20, material: 'nbk7' }), bandpass(680, centre, 40), bandpass(780, centre, 20),
];

test('generated light through a fibre is not re-recorded from the pump', () => {
  // A fibre relaunches the light as new rays. With the record assumed to
  // describe whatever carries it, the harmonic came out of the fibre recorded
  // as the pump's tail, 417.8-420 nm.
  const harmonic = lastStretch([pulsed({ bandwidth: 300 }), generators['a crystal'](200), ...after(400)], [fibre(350, 550)]);
  assert.ok(harmonic.signal > 0.01, `the harmonic arrives (${harmonic.signal})`);
  for (const record of harmonic.records) {
    assert.ok(record.length > 0 && record.every(([lo, hi]) => lo < 400 && hi > 400), `record ${JSON.stringify(record)}`);
  }
  // A specimen's emission has no recorded pieces, and gains none.
  const emission = lastStretch([pulsed({ bandwidth: 500 }), generators['a specimen'](200), ...after(400)], [fibre(350, 550)]);
  assert.ok(emission.signal > 0.01);
  assert.ok(emission.records.every(record => record.length === 0), `records ${JSON.stringify(emission.records)}`);
});

test('a conversion onto the pump\'s own wavelength is still generated light', () => {
  // `custom` replaces the pump's band with a line; set to 800 nm it changes
  // neither the wavelength nor the source. The line passes both filters
  // whole and must not be given the pump's spectrum between their edges
  // (796-804 nm, 236 fs).
  const line = lastStretch([
    pulsed(), at('crystal', 250, { convert: 'custom', outWl: 800, efficiency: 0.5 }), bandpass(500, 800, 30), bandpass(700, 800, 8),
  ]);
  assert.ok(Math.abs(line.signal - 0.5) < 1e-9, `the line passes whole (${line.signal})`);
  assert.ok(line.records.every(record => record.length === 0), `records ${JSON.stringify(line.records)}`);
  assert.ok(line.packets.every(width => width < 100), `packets ${line.packets}`);
});

test('behind a fibre the pump itself is drawn as it was, not guessed at', () => {
  // The cost of the safe default, stated: relaunched light is not known to
  // be described by its record, so two filters behind a fibre keep the first
  // one's record (785-815 nm), as on the commit before this change. The same
  // two filters without the fibre are re-recorded.
  const filters = [bandpass(650, 800, 30), bandpass(780, 800, 8)];
  const behind = lastStretch([pulsed(), ...filters], [fibre(200, 500)]);
  assert.ok(behind.signal > 0.05);
  assert.deepEqual(behind.records, [[[785, 815]]]);
  const direct = lastStretch([pulsed(), ...filters]);
  assert.deepEqual(direct.records, [[[796, 804]]]);
});

test('a conversion onto the wavelength a sample already had is generated light too', () => {
  // Behind glass the centre sample is already a single line at 800 nm, so a
  // `custom` conversion to 800 nm changes nothing the tracer splits a ray
  // for: the ray carries on as itself. The rule has to be applied on that
  // path as well, or the line is given the pump's spectrum between the
  // filters' edges (796-804 nm, a 236 fs packet).
  const line = lastStretch([
    pulsed(), at('glassrod', 100, { rodlen: 60, dia: 20, material: 'nbk7' }),
    at('crystal', 250, { convert: 'custom', outWl: 800, efficiency: 0.5 }), bandpass(500, 800, 30), bandpass(700, 800, 8),
  ]);
  assert.ok(line.signal > 0.1, `light arrives (${line.signal})`);
  assert.ok(line.records.every(record => record.every(([lo, hi]) => !(Math.abs(lo - 796) < 1e-6 && Math.abs(hi - 804) < 1e-6))),
    `no record rebuilt from the pump: ${JSON.stringify(line.records)}`);
  assert.ok(line.packets.every(width => width < 200), `packets ${line.packets}`);
});

test('light that loses the flag loses only the new record', () => {
  // Behind a fibre the light is not known to be described by its record, so
  // the whole-train record is off. Everything that was there before is not:
  // a detector behind glass and an AOTF still times the selected line from
  // the slice's own profile, with or without the fibre. Gating that on the
  // flag as well made it read 142 fs for 258 fs.
  const chainOf = beams => {
    const det = createElement('detector', 900, 0);
    det.params.aperture = 60;
    traceScene([pulsed(), at('glassrod', 500, { rodlen: 100, dia: 20, material: 'nbk7' }),
      at('aotf', 650, { channels: [{ wl: 800, eff: 1 }], passband: 2 }), det], beams);
    return detectorReading(det.id)?.pulse?.stretchedPulseWidthFs ?? null;
  };
  const direct = chainOf([]), throughFibre = chainOf([fibre(200, 400)]);
  assert.ok(direct > 250 && direct < 265, `without the fibre ${direct} fs`);
  assert.ok(Math.abs(throughFibre - direct) <= 1e-3 * direct, `through the fibre ${throughFibre} fs, without ${direct} fs`);
});

// --- Drawing only ------------------------------------------------------------
// The whole-train spectrum is kept beside the pulse's record and read by the
// on-beam label and the packets alone. The record itself is what the model
// computes from -- an OPA times its pump from it, generated light inherits
// it -- so it must be left exactly as it was.

test('correcting what is drawn leaves the pulse record an OPA is handed as it was', () => {
  // A pump through two filters, then an OPA. The drawn duration after the
  // second filter comes from `trainPieces`, beside the record; the record
  // itself still holds the first filter's piece. (The OPA no longer times its
  // pump from that record alone: see test/opa-filtered-pump.test.js.)
  const place = (type, x, y, params) => {
    const el = createElement(type, x, y);
    Object.assign(el.params, params);
    return el;
  };
  const { pulseTracks } = traceScene([
    place('pulsedlaser', 0, -18, { beamMode: 'line', wavelength: 515, transformLimited: false, bandwidth: 60, avgPowerW: 1, repRateMHz: 0.2 }),
    place('pulsedlaser', 0, 18, { beamMode: 'line', wavelength: 780, transformLimited: true, pulseWidthFs: 300, avgPowerW: 1e-6, repRateMHz: 0.2 }),
    place('filter', 100, -18, { ftype: 'bandpass', center: 515, band: 30 }),
    place('filter', 150, -18, { ftype: 'bandpass', center: 515, band: 8 }),
    place('opa', 300, 0, { signalWl: 780, gainBandwidthNm: 40, smallSignalGainDb: 40, maxDepletion: 0.5 }),
  ]);
  const drawn = pulseTracks.map(track => pulseEnvelopeAtOpticalPath(track, track.opls.at(-1) - 1e-6)?.pulseWidthFs).filter(Number.isFinite);
  assert.ok(drawn.some(width => width > 90 && width < 105), `drawn durations ${drawn.map(w => w.toFixed(1))}`);
});

test('light generated behind two filters is drawn from the record it inherits', () => {
  // The pump after the second filter is drawn at 236 fs. The harmonic made
  // from it inherits the pump's record, untouched, and is drawn as it was.
  const det = createElement('detector', 900, 0);
  det.params.aperture = 60;
  const { pulseTracks } = traceScene([
    pulsed(), bandpass(100, 800, 30), bandpass(250, 800, 8),
    at('crystal', 450, { convert: 'shg', efficiency: 0.5, transmitPump: false }), det,
  ]);
  const widths = pulseTracks.map(track => pulseEnvelopeAtOpticalPath(track, track.opls.at(-1) - 1e-6)?.pulseWidthFs);
  const [, afterFirst, afterSecond, harmonic] = widths;
  assert.ok(Math.abs(afterSecond - 235.87) < 0.5, `pump after the second filter ${afterSecond} fs`);
  assert.equal(harmonic, afterFirst, `the harmonic is drawn from the inherited record (${harmonic} fs)`);
  assert.ok(Math.abs(detectorReading(det.id).pulse.stretchedPulseWidthFs - 117.93) < 0.01);
});

test('light that gets a record of its own does not keep the pump\'s drawn spectrum', () => {
  // An OPO's signal and idler, and a continuum, bring records describing
  // them. The whole-train spectrum belongs to the record it was derived
  // from, so they start without one: inheriting the pump's drew both OPO
  // outputs at the pump's 236 fs with its 796-804 nm pieces. A copy of the
  // same record (an AOM's) keeps it.
  const behindTwoFilters = last => {
    const det = createElement('detector', 900, 0);
    det.params.aperture = 60;
    const { pulseTracks } = traceScene([pulsed(), bandpass(100, 800, 30), bandpass(250, 800, 8), last, det]);
    const end = Math.max(...pulseTracks.map(track => track.opls.at(-1)));
    return pulseTracks.filter(track => track.opls.at(-1) > end - 1).map(track => ({
      width: pulseEnvelopeAtOpticalPath(track, track.opls.at(-1) - 1e-6)?.pulseWidthFs,
      pieces: (track.pulse.filteredPieces || []).map(p => [p.lo, p.hi]),
    }));
  };
  const fromPump = pieces => pieces.some(([lo, hi]) => Math.abs(lo - 796) < 1e-6 && Math.abs(hi - 804) < 1e-6);
  const opo = behindTwoFilters(at('crystal', 450, {
    convert: 'opo', pumpWl: 800, signalWl: 1200, opoDepletion: 0.5, transmitPump: false, outputPhase: 'transformLimited',
  }));
  assert.equal(opo.length, 2, 'signal and idler');
  for (const wave of opo) {
    assert.ok(!fromPump(wave.pieces), `pieces ${JSON.stringify(wave.pieces)}`);
    assert.ok(wave.width > 50 && wave.width < 150, `drawn at ${wave.width} fs`);
  }
  const continuum = behindTwoFilters(at('crystal', 450, {
    convert: 'sc', scRange: 'manual', scMinNm: 500, scMaxNm: 1100, efficiency: 0.5, transmitPump: false,
  }));
  assert.ok(continuum.length > 0 && continuum.every(wave => !fromPump(wave.pieces)), JSON.stringify(continuum));
  const copied = behindTwoFilters(at('aom', 450, { eff: 1, zero: false, deflect: 0, modulate: false }));
  assert.ok(copied.length > 0 && copied.every(wave => fromPump(wave.pieces) && Math.abs(wave.width - 235.87) < 0.5), JSON.stringify(copied));
});
