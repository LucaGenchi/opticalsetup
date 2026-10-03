// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import '../sketch/js/detector-instruments.js';
import { registry, specimenTimingText } from '../sketch/js/elements.js';
import { detectorReading, specimenIncidentBeams, specimenTimingReading, traceScene } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { gateTransmissionAt } from '../sketch/js/pulses.js';

const raw = readFileSync(
  new URL('../Examples/Microscopy Implementations/Coherent Raman microscope — SRS and CARS.json', import.meta.url),
  'utf8',
);

// The scene's delay stage is a retroreflector: the beam crosses it and comes
// back, so moving it by Δx changes that arm's path by 2Δx.
function scanned(retroOffsetMm = 0) {
  const scene = parseSketch(raw, registry);
  const retro = scene.elements.find(el => el.type === 'retroreflector');
  retro.y += retroOffsetMm;
  traceScene(scene.elements);
  const stage = scene.elements.find(el => el.type === 'stage');
  const readings = Object.fromEntries(scene.elements
    .filter(el => ['detector', 'pmt'].includes(el.type))
    .map(el => [el.id, detectorReading(el.id)?.signal ?? null]));
  return {
    beams: specimenIncidentBeams(stage.id) || [],
    timing: specimenTimingReading(stage.id),
    readings,
    carsWavelengths: scene.elements
      .filter(el => el.type === 'pmt')
      .flatMap(el => (detectorReading(el.id)?.spectrum || []).map(s => Math.round(s.wavelength))),
  };
}

test('the example arrives matched, as a two-colour bench must', () => {
  const { beams, timing } = scanned();
  assert.equal(beams.length, 2, `two beams reach the specimen, not ${beams.length} records`);
  const [pump, stokes] = beams.sort((a, b) => a.wl - b.wl);
  assert.ok(Math.abs(pump.opl - stokes.opl) < 1e-6,
    `the arms must be matched: ${pump.opl} vs ${stokes.opl} mm`);
  assert.equal(timing.state, 'mixing');
  assert.equal(timing.overlap, 1);
  assert.equal(specimenTimingText(timing), null, 'a working setup says nothing');
});

test('scanning the delay stage either way takes the coherent signals out', () => {
  // 1 mm of stage is 2 mm of path: 6.67 ps, far outside the 1 ps pulses.
  for (const offset of [-1, 1]) {
    const { timing, carsWavelengths } = scanned(offset);
    assert.equal(timing.state, 'unsynchronized', `${offset} mm: still mixing`);
    assert.ok(Math.abs(timing.skewNs * 1000 - 6.671) < 0.01, `${offset} mm: skew ${timing.skewNs * 1000} ps`);
    assert.ok(!carsWavelengths.some(wl => Math.abs(wl - 628) <= 2), `${offset} mm: the anti-Stokes line survived`);
    assert.match(specimenTimingText(timing), /arrive .* apart .* Match the arms, or add a delay line/);
  }
});

test('the stimulated Raman channel loses its loss, not its beam', () => {
  // SRS is a change in a beam that is already there: mistimed, the transferred
  // modulation goes and the excitation baseline comes back up.
  const matched = scanned();
  const detuned = scanned(1);
  const srsId = Object.keys(matched.readings)
    .find(id => matched.readings[id] !== null && detuned.readings[id] !== null
      && detuned.readings[id] > matched.readings[id] + 1e-6);
  assert.ok(srsId, 'no detector recovered its baseline when the pulses were separated');
  assert.ok(matched.readings[srsId] < detuned.readings[srsId],
    `${srsId}: ${matched.readings[srsId]} should sit below its unmodulated ${detuned.readings[srsId]}`);
  assert.ok(detuned.readings[srsId] > 0.5, 'the receiving beam itself must still be there');
});

test('the example is a stimulated Raman LOSS scheme: the pump dips while the Stokes is on', () => {
  // The 1030 nm Stokes carries the 20 MHz modulation and the SRS channel reads
  // the 780 nm pump. Energy flows from pump to Stokes, so the pump must be
  // lowest exactly when the Stokes is present — not when it is blocked, which
  // against the Stokes would read as a gain.
  const scene = parseSketch(raw, registry);
  traceScene(scene.elements);
  const trains = id => detectorReading(id)?.pulse?.trains || [];
  const pumpGate = trains('ef2uydcv').find(t => Math.round(t.centerWavelengthNm) === 780)?.gates?.[0];
  const stokesGate = trains('e9xabqr6').find(t => Math.round(t.centerWavelengthNm) === 1030)?.gates?.[0];
  assert.ok(pumpGate && stokesGate, 'both modulations must reach their detectors');

  let stokesOn = 0, stokesOff = 0;
  for (let t = 0; t < 50; t += 0.5) {   // one 20 MHz period, at the same emission times
    const stokes = gateTransmissionAt(stokesGate, t);
    const pump = gateTransmissionAt(pumpGate, t);
    if (stokes > 0.5) {
      assert.ok(pump < 1 - 1e-6, `t=${t} ns: the pump should be depleted while the Stokes is on (${pump})`);
      stokesOn++;
    } else {
      assert.ok(Math.abs(pump - 1) < 1e-6, `t=${t} ns: the pump should be unperturbed while the Stokes is off (${pump})`);
      stokesOff++;
    }
  }
  assert.ok(stokesOn > 0 && stokesOff > 0, 'the Stokes should spend part of the period on and part off');
});
