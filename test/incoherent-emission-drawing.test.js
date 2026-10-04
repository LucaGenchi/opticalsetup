// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createElement } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';
import { parseSketch } from '../sketch/js/state.js';

// Travelling pulse packets are how the app draws a laser's pulse train. A
// specimen's fluorescence and Raman scatter are incoherent, spontaneous
// emission: they used to inherit the pump's packets wherever the drawing
// happened to pick them up -- behind a fibre, or straight off the specimen
// for a single-ray source. They are drawn as a steady beam now, while the
// pump's record still times them for detectors.

function bench(channel, { fiber = false, specimenType = 'nonlinear', wavelength = 920, transmitExc = true } = {}) {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { wavelength, beamMode: 'line' });
  const sample = Object.assign(createElement('sample', 200, 0), { rot: 90 });
  Object.assign(sample.params, {
    specimenType, transmitExc, transmission: 0.8,
    channels: [{ eff: 0.5, autoWl: true, autoColor: true, ...channel }],
  });
  const lens = createElement('lens', 215, 0);
  Object.assign(lens.params, { f: 15, dia: 25.4 });
  const pmt = createElement('pmt', 400, 0);
  const beams = fiber ? [{
    id: 'f1', kind: 'fiber', propagate: true, inputNA: 0.5,
    pts: [{ x: 300, y: 0 }, { x: 350, y: 0 }],
    out0: { mode: 'diverge', na: 0.05 }, out1: { mode: 'diverge', na: 0.05 },
  }] : [];
  return { elements: [laser, sample, lens, pmt], beams, pmt };
}
const packetColors = tracks => new Set(tracks.map(t => t.color));
const drawnColors = drawables => new Set(drawables.map(d => d.color).filter(Boolean));

test('fluorescence is drawn as a steady beam, not as laser pulses', () => {
  const { elements, beams } = bench({ kind: 'tpef', wl: 520 });
  const { pulseTracks, drawables } = traceScene(elements, beams);
  assert.equal(packetColors(pulseTracks).size, 1, 'only the excitation travels as packets');
  assert.ok(pulseTracks.some(t => t.pts.some(p => p.x > 250)), 'and it still does past the specimen');
  assert.ok(drawnColors(drawables).size > 1, 'the fluorescence itself is still drawn');
});

test('only the drawing changes: a detector still times fluorescence by the pump train', () => {
  // The excitation is blocked, so the fluorescence is all the PMT receives.
  const { elements, beams, pmt } = bench({ kind: 'tpef', wl: 520 }, { transmitExc: false });
  traceScene(elements, beams);
  const reading = enhancedReading(pmt, elements);
  assert.ok(reading.detectedPowerW > 0, 'the fluorescence reaches the PMT');
  assert.equal(reading.pulse?.repRateMHz, 80, 'and is still read at the laser repetition rate');
});

test('fluorescence relaunched by a fiber stays a steady beam', () => {
  const { elements, beams } = bench({ kind: 'tpef', wl: 520 }, { fiber: true });
  const { pulseTracks } = traceScene(elements, beams);
  assert.ok(pulseTracks.some(t => t.pts.some(p => p.x > 351)), 'the laser is animated past the fiber');
  assert.equal(packetColors(pulseTracks).size, 1, 'and nothing else is');
});

test('spontaneous Raman is not drawn as pulses either', () => {
  const { elements, beams } = bench({ kind: 'raman', material: 'lipid' }, { specimenType: 'linear', wavelength: 532 });
  const { pulseTracks, drawables } = traceScene(elements, beams);
  assert.ok(drawnColors(drawables).size > 1, 'the Raman lines are drawn');
  assert.equal(packetColors(pulseTracks).size, 1, 'but only the pump travels as packets');
});

test('a coherent signal generated in the specimen is still drawn as pulses', () => {
  const { elements, beams } = bench({ kind: 'shg' });
  assert.equal(packetColors(traceScene(elements, beams).pulseTracks).size, 2, 'excitation and second harmonic');
});

test('the lensless-endoscope community setup: LP900 dichroics, no fluorescence packets', () => {
  const submission = JSON.parse(readFileSync(new URL('../community-submissions/issue-45.json', import.meta.url), 'utf8'));
  const dichroics = submission.scene.elements.filter(el => el.type === 'dichroic');
  assert.deepEqual(dichroics.map(el => el.params.cutoff), [900, 900]);
  const scene = parseSketch(JSON.stringify(submission.scene));
  const { pulseTracks } = traceScene(scene.elements, scene.beams);
  assert.equal(packetColors(pulseTracks).size, 1, 'only the 920 nm laser is animated');
});
