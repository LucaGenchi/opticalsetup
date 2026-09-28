// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';

// A beam-mode source launches 25 samples, each carrying 1/25 of its power,
// and each couples into a fiber on its own. The fiber relaunched only the
// first coupling of each emission, so a 100 mW beam delivered 4 mW past the
// fiber. Every coupling merged into one emission now brings its power.

const close = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-12, `${what}: ${actual} vs ${expected}`);

const cable = (overrides = {}) => ({
  id: 'fb', kind: 'fiber', pts: [{ x: 400, y: 10 }, { x: 600, y: 10 }], width: 20,
  propagate: true, lossDbPerM: 0, outMode: 'diverge', na: 0.01, ...overrides,
});

function laser(y, avgPowerW, beamMode = 'beam', beamWidth = 4) {
  const source = createElement('cwlaser', 0, y);
  Object.assign(source.params, { avgPowerW, beamMode, beamWidth });
  return source;
}

function meter() {
  const m = createElement('powermeter', 800, 10);
  m.params.aperture = 100;
  return m;
}

// Drawn light past the fiber's output end.
const relaunched = drawables => drawables.filter(d => (d.pts || []).some(p => p.x > 601));

test('a beam-mode source into a fiber delivers all of its coupled power', () => {
  for (const beamMode of ['beam', 'line']) {
    const source = laser(10, 0.1, beamMode), m = meter();
    const elements = [source, m];
    traceScene(elements, [cable()]);
    const reading = enhancedReading(m, elements);
    close(reading.detectedPowerW, 0.1, `${beamMode} mode, lossless fiber`);
    assert.deepEqual(reading.sourceFractions.map(f => f.sourceId), [source.id]);
  }
});

test('the fiber loss applies once to the merged power, the same in either beam mode', () => {
  // 200 mm at 10 dB/m is 2 dB.
  for (const beamMode of ['beam', 'line']) {
    const m = meter(), elements = [laser(10, 0.1, beamMode), m];
    traceScene(elements, [cable({ lossDbPerM: 10 })]);
    close(enhancedReading(m, elements).detectedPowerW, 0.1 * 10 ** -0.2, `${beamMode} mode, 2 dB`);
  }
});

test('a beam-mode relaunch is drawn once, like a line-mode one', () => {
  // Merging the 25 couplings sums their power into one emission; it does not
  // relaunch 25 bundles on top of each other.
  const counts = ['line', 'beam'].map(beamMode => {
    const { drawables } = traceScene([laser(10, 0.1, beamMode), meter()], [cable()]);
    return relaunched(drawables).length;
  });
  assert.ok(counts[0] > 0, 'the line-mode relaunch is drawn');
  assert.equal(counts[1], counts[0]);
});

test('two sources into one fiber are still delivered and attributed separately', () => {
  const strong = laser(6, 0.1, 'beam', 2), weaker = laser(14, 0.05, 'beam', 2), m = meter();
  const elements = [strong, weaker, m];
  traceScene(elements, [cable()]);
  const reading = enhancedReading(m, elements);
  close(reading.detectedPowerW, 0.15, 'both sources');
  const fractions = new Map(reading.sourceFractions.map(f => [f.sourceId, f.fraction]));
  assert.equal(fractions.size, 2);
  close(fractions.get(strong.id), 1, 'all of the strong source');
  close(fractions.get(weaker.id), 1, 'all of the weaker source');
});

test('weak beam-mode light through a fiber is followed undrawn at its full power', () => {
  // A 1 % ND puts every sample below the drawing floor, and the lens after
  // it is where drawn light would stop: the couplings are measure-only,
  // merge among themselves, and are never drawn past the fiber.
  const filter = createElement('filter', 200, 10);
  Object.assign(filter.params, { ftype: 'nd', trans: 0.01 });
  const lens = createElement('lens', 300, 10);
  lens.params.aperture = 10;
  const m = meter(), elements = [laser(10, 0.1), filter, lens, m];
  const { drawables } = traceScene(elements, [cable()]);
  const reading = enhancedReading(m, elements);
  close(reading.detectedPowerW, 0.001, 'behind a 1 % ND');
  assert.equal(reading.weakLightIncomplete, undefined);
  assert.equal(relaunched(drawables).length, 0, 'nothing drawn past the fiber');
});
