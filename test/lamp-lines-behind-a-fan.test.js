// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// A lamp emits lines, not a continuum. Its "bandwidth" is only the span of
// its lines, and the wavelength samples a dispersive element makes of it are
// the lines themselves. Glass and the Grating used to label each one as a
// slice of spectrum reaching halfway to its neighbours, so a filter behind
// either cut "slices" that lie mostly in the dark gaps between lines: a
// bandpass on the 546 nm mercury line passed 0.014 of the lamp where 0.244
// arrives, and one between lines passed light. The pulse shaper and the AOD
// already leave lines as lines.

import assert from 'node:assert/strict';
import test from 'node:test';
import '../sketch/js/detector-instruments.js';
import { createElement } from '../sketch/js/elements.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';

// A collimated mercury lamp, optionally through glass or a grating order,
// then an optional selector, onto a wide detector.
function lampThrough(fan, selector) {
  // The shortest capture range: only the parabola receives the lamp directly, so the
  // beam measured downstream is the collimated one alone.
  const source = createElement('pointsource', 175, 200);
  Object.assign(source.params, { sourceKind: 'lamp', lampType: 'hg', spread: 360, nrays: 24, captureRange: 110 });
  const mirror = createElement('oap', 150, 200);
  mirror.rot = 180;
  Object.assign(mirror.params, { length: 110, f: 25 });
  const elements = [source, mirror];
  const add = (type, x, params) => {
    const el = createElement(type, x, 200);
    Object.assign(el.params, params);
    elements.push(el);
  };
  if (fan === 'glass') add('glassrod', 300, { rodlen: 60, dia: 150, material: 'nbk7' });
  if (fan === 'grating') add('grating', 300, { transmissive: true, lines: 2, orders: '1', length: 200 });
  if (selector) add(selector.type, 450, selector.params);
  const det = createElement('detector', 600, 200);
  det.params.aperture = 200;
  traceScene([...elements, det]);
  return detectorReading(det.id)?.signal ?? 0;
}
const bandpass = (center, band) => ({ type: 'filter', params: { ftype: 'bandpass', center, band, length: 200 } });

test('the lamp reaches the detector, with and without a fan', () => {
  assert.ok(lampThrough(null, null) > 0.5);
  assert.ok(lampThrough('glass', null) > 0.4);
  assert.ok(Math.abs(lampThrough('grating', null) - lampThrough(null, null)) < 1e-9);
});

test('a bandpass on a lamp line passes that line behind glass or a grating order', () => {
  const direct = lampThrough(null, bandpass(546, 4)) / lampThrough(null, null);
  assert.ok(direct > 0.2, `the 546 nm line is a fifth of the lamp and more (${direct})`);
  for (const fan of ['glass', 'grating']) {
    const share = lampThrough(fan, bandpass(546, 4)) / lampThrough(fan, null);
    assert.ok(Math.abs(share - direct) < 1e-9, `${fan}: ${share} vs ${direct}`);
  }
});

test('a bandpass between lamp lines passes nothing behind glass or a grating order', () => {
  // No mercury line lies in 500 ± 1 nm or 560 ± 2 nm.
  for (const fan of [null, 'glass', 'grating']) {
    assert.equal(lampThrough(fan, bandpass(500, 2)), 0, `${fan || 'no fan'}: 500 nm`);
    assert.equal(lampThrough(fan, bandpass(560, 4)), 0, `${fan || 'no fan'}: 560 nm`);
  }
});

test('an AOTF behind glass takes a lamp line as it does without the glass', () => {
  // On the line, on the slope of the passband, and in a gap. (The AOTF's
  // aperture is at most 100 mm and the lamp beam is 110 mm wide, so this is
  // checked behind glass, which does not tilt the rays, not behind a grating.)
  const aotf = (wl, passband) => ({ type: 'aotf', params: { channels: [{ wl, eff: 1 }], passband, aperture: 100 } });
  const whole = lampThrough('glass', null), bare = lampThrough(null, null);
  for (const [wl, passband] of [[546.074, 2], [547, 2], [500, 2]]) {
    const direct = lampThrough(null, aotf(wl, passband)) / bare;
    const behind = lampThrough('glass', aotf(wl, passband)) / whole;
    assert.ok(Math.abs(behind - direct) < 1e-9, `channel ${wl}: ${behind} vs ${direct}`);
  }
  assert.equal(lampThrough('glass', aotf(500, 2)), 0);
});
