// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { LAMP_PRESETS } from '../sketch/js/lamps.js';
import '../sketch/js/detector-instruments.js';

// A discharge lamp's lines are ~0.1 nm wide. A box filter or dichroic takes
// them line by line, each at its own wavelength, so a passband holding one
// line passes exactly that line's share of the lamp, and a band between lines
// passes nothing, however narrow the lines are next to any sampling grid.

const HG = LAMP_PRESETS.hg.lines;
const TOTAL = HG.reduce((sum, l) => sum + l.w, 0);
const share = (lo, hi) => HG.filter(l => l.nm >= lo && l.nm <= hi).reduce((sum, l) => sum + l.w, 0) / TOTAL;

const close = (actual, expected, label, tol = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} vs ${expected}`);

// A mercury lamp collimated by an off-axis parabola, then optionally an
// element at (400, 200); a detector straight on and, for a dichroic at 45°,
// one below it for the reflected port.
function trace(kind, params, rot) {
  const lamp = createElement('pointsource', 175, 200);
  Object.assign(lamp.params, { sourceKind: 'lamp', lampType: 'hg', spread: 360, nrays: 24 });
  const oap = createElement('oap', 150, 200);
  oap.rot = 180;
  Object.assign(oap.params, { length: 110, f: 25 });
  const elements = [lamp, oap];
  if (kind) {
    const el = createElement(kind, 400, 200);
    if (rot != null) el.rot = rot;
    Object.assign(el.params, { length: 200, ...params });
    elements.push(el);
  }
  const through = createElement('detector', 600, 200);
  through.params.aperture = 200;
  const reflected = createElement('detector', 400, 420);
  reflected.rot = 90;
  reflected.params.aperture = 200;
  traceScene([...elements, through, reflected]);
  const signal = d => detectorReading(d.id)?.signal ?? 0;
  return { t: signal(through), r: signal(reflected) };
}

const lampPower = trace(null).t;
const filtered = params => trace('filter', params).t / lampPower;
const dichroic = params => {
  const { t, r } = trace('dichroic', params, 135);
  return { t: t / lampPower, r: r / lampPower };
};

test('the lamp reaches the detector without any filter', () => {
  assert.ok(lampPower > 0);
  assert.equal(trace(null).r, 0);
});

test('a bandpass isolating each Hg line passes that line\'s weight share', () => {
  // 577 and 579 nm are a doublet: a 10 nm band at 578 holds both.
  for (const center of [365, 405, 436, 546, 578, 1014]) {
    close(filtered({ ftype: 'bandpass', center, band: 10 }), share(center - 5, center + 5), `${center} nm`);
  }
  // Isolated lines really are isolated: one each, except the doublet.
  assert.equal(share(541, 551), 1 / TOTAL);
  assert.equal(share(573, 583), 0.8 / TOTAL);
});

test('a band between lines passes nothing', () => {
  for (const center of [380, 500, 700]) {
    assert.equal(filtered({ ftype: 'bandpass', center, band: 10 }), 0, `${center} nm`);
  }
  // A band ending just short of a line leaves it out; one reaching it takes it.
  assert.equal(filtered({ ftype: 'bandpass', center: 540, band: 12 }), 0);
  close(filtered({ ftype: 'bandpass', center: 540, band: 12.2 }), share(546, 546.1), 'edge on the line');
});

test('longpass, shortpass and notch filters take the lines on their side', () => {
  close(filtered({ ftype: 'longpass', cutoff: 500 }), share(500, 2000), 'longpass 500');
  close(filtered({ ftype: 'shortpass', cutoff: 500 }), share(0, 500), 'shortpass 500');
  close(filtered({ ftype: 'notch', center: 546, band: 10 }), 1 - share(541, 551), 'notch at 546');
  close(filtered({ ftype: 'notch', center: 500, band: 10 }), 1, 'notch between lines');
  assert.equal(filtered({ ftype: 'notch', center: 700, band: 800 }), 0);
});

test('a dichroic sends each line to one port, and the ports sum to the lamp', () => {
  const cases = [
    [{ dtype: 'bandpass', center: 546, band: 10 }, share(541, 551)],
    [{ dtype: 'longpass', cutoff: 500 }, share(500, 2000)],
    [{ dtype: 'shortpass', cutoff: 500 }, share(0, 500)],
    [{ dtype: 'notch', center: 436, band: 10, bandRefl: 100 }, 1 - share(431, 441)],
    [{ dtype: 'bandpass', center: 500, band: 10 }, 0],
  ];
  for (const [params, transmitted] of cases) {
    const { t, r } = dichroic(params);
    close(t, transmitted, `${JSON.stringify(params)} T`);
    close(t + r, 1, `${JSON.stringify(params)} T + R`);
  }
});

test('a partial band reflector splits its in-band lines between R and Tb', () => {
  const band = share(431, 441);
  for (const bandRefl of [60, 0]) {
    const { t, r } = dichroic({ dtype: 'notch', center: 436, band: 10, bandRefl });
    close(r, band * bandRefl / 100, `R at ${bandRefl} %`);
    close(t, 1 - band * bandRefl / 100, `T + Tb at ${bandRefl} %`);
    close(t + r, 1, `T + R at ${bandRefl} %`);
  }
  // A band holding no line leaves everything to the transmitted side.
  const empty = dichroic({ dtype: 'notch', center: 500, band: 10, bandRefl: 60 });
  close(empty.t, 1, 'empty band T');
  assert.equal(empty.r, 0);
});
