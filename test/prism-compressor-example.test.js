// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The prism compressor example: a 31 fs pulse chirped by 30 mm of N-BK7 and
// recompressed by four Brewster prisms whose GDD comes from the traced paths.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import '../sketch/js/detector-instruments.js';
import { registry } from '../sketch/js/elements.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';

const file = new URL('../Examples/Ultrashort Pulses/Prism compressor — undoing the chirp of a glass rod.json', import.meta.url);

test('the prism compressor example undoes the rod it follows', () => {
  const scene = parseSketch(readFileSync(file, 'utf8'), registry);
  traceScene(scene.elements, scene.beams);
  const [reference, chirped, compressed] = ['ac1', 'ac2', 'ac3'].map(id => detectorReading(id)?.pulse);
  assert.ok(Math.abs(reference.stretchedPulseWidthFs - 31.4) < 0.05, `reference ${reference.stretchedPulseWidthFs} fs`);
  assert.ok(chirped.gddFs2 > 1300 && chirped.gddFs2 < 1380, `rod ${chirped.gddFs2} fs²`);
  assert.ok(chirped.stretchedPulseWidthFs > 115 && chirped.stretchedPulseWidthFs < 130, `chirped ${chirped.stretchedPulseWidthFs} fs`);
  assert.ok(Math.abs(compressed.gddFs2) < 20, `rod and prisms together ${compressed.gddFs2} fs²`);
  assert.ok(Math.abs(compressed.stretchedPulseWidthFs / reference.stretchedPulseWidthFs - 1) < 0.01,
    `recompressed ${compressed.stretchedPulseWidthFs} fs`);
  assert.match(compressed.dispersionModel, /GDD from the ray paths/);
});
