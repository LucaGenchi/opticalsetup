// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// An AOTF channel is usually much narrower than the slice of spectrum a
// dispersed wavelength sample stands for. Read at the sample's one
// wavelength, the channel took the whole slice or none of it: behind glass,
// an 800 nm channel passed 0.548 of an 800/60 nm Gaussian where 0.167 passes,
// and an 815 nm channel passed nothing. The passband is integrated over the
// slice instead, so an AOTF selects the same light whether or not the beam
// was fanned out first.

import assert from 'node:assert/strict';
import test from 'node:test';
import '../sketch/js/detector-instruments.js';
import { createElement } from '../sketch/js/elements.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';

const sources = {
  gaussian: () => {
    const src = createElement('pulsedlaser', 0, 0);
    Object.assign(src.params, { beamMode: 'line', wavelength: 800, transformLimited: false, bandwidth: 60 });
    return src;
  },
  flat: () => {
    const src = createElement('sclaser', 0, 0);
    Object.assign(src.params, { beamMode: 'line', scMin: 700, scMax: 900 });
    return src;
  },
  line: () => {
    const src = createElement('cwlaser', 0, 0);
    Object.assign(src.params, { beamMode: 'line', wavelength: 800 });
    return src;
  },
};

// source -> (glass rod) -> (AOTF) -> (filter) -> detector, all on the axis.
function read(kind, { rod = false, aotf = null, filter = null, detector = 'detector' } = {}) {
  const elements = [sources[kind]()];
  const add = (type, x, params) => {
    const el = createElement(type, x, 0);
    Object.assign(el.params, params);
    elements.push(el);
  };
  if (rod) add('glassrod', 250, { rodlen: 100, dia: 20, material: 'nbk7' });
  if (aotf) add('aotf', 450, aotf);
  if (filter) add('filter', 550, filter);
  const det = createElement(detector, 700, 0);
  det.params.aperture = 40;
  traceScene([...elements, det]);
  return detectorReading(det.id);
}
const signal = reading => reading?.signal ?? 0;
const channel = (wl, passband, extra = {}) => ({ channels: [{ wl, eff: 1 }], passband, ...extra });

test('an AOTF selects the same light from a beam whether or not glass fanned it first', () => {
  for (const kind of ['gaussian', 'flat']) {
    const whole = signal(read(kind, { rod: true }));
    // On a sample's wavelength, between samples, narrow, in the tail, wide,
    // down to the narrowest passband allowed and up to one far wider than
    // the beam. The channel is integrated over its own window of the slice,
    // so a 0.1 nm channel cannot fall between the points of a wider grid.
    for (const [wl, passband] of [[800, 10], [780, 10], [815, 4], [760, 2], [800, 40], [780, 0.5], [800, 0.1], [800, 2000]]) {
      const unfanned = signal(read(kind, { aotf: channel(wl, passband) }));
      const fanned = signal(read(kind, { rod: true, aotf: channel(wl, passband) })) / whole;
      assert.ok(unfanned > 2e-4, `${kind} ${wl}/${passband}: the channel selects something (${unfanned})`);
      assert.ok(Math.abs(fanned - unfanned) <= 1e-3 * unfanned, `${kind} ${wl}/${passband}: ${fanned} vs ${unfanned}`);
    }
  }
});

test('what an AOTF selects from a slice is itself cut correctly downstream', () => {
  // The selected light leaves as a narrower slice carrying the reshaped
  // profile, so a bandpass behind it takes what that part holds.
  for (const kind of ['gaussian', 'flat']) {
    const whole = signal(read(kind, { rod: true }));
    const filter = { ftype: 'bandpass', center: 803, band: 4 };
    const unfanned = signal(read(kind, { aotf: channel(800, 10), filter }));
    const fanned = signal(read(kind, { rod: true, aotf: channel(800, 10), filter })) / whole;
    assert.ok(Math.abs(fanned - unfanned) <= 0.01 * unfanned, `${kind}: ${fanned} vs ${unfanned}`);
    // And the selected band stays inside the channel's window (three zeros
    // of the sinc squared: 3.39 passbands either side of centre).
    const band = read(kind, { rod: true, aotf: channel(800, 10) });
    assert.ok(band.bandMin >= 800 - 34 && band.bandMax <= 800 + 34, `${kind}: ${band.bandMin}-${band.bandMax} nm`);
  }
});

test('the selected and depleted beams together still carry the whole beam', () => {
  for (const kind of ['gaussian', 'flat']) {
    const whole = signal(read(kind, { rod: true }));
    const both = signal(read(kind, { rod: true, aotf: channel(800, 10, { showDepleted: true, deflect: 0 }) }));
    assert.ok(Math.abs(both - whole) < 1e-9 * whole, `${kind}: ${both} vs ${whole}`);
    const two = { channels: [{ wl: 780, eff: 1 }, { wl: 820, eff: 0.5 }], passband: 6, showDepleted: true, deflect: 0 };
    assert.ok(Math.abs(signal(read(kind, { rod: true, aotf: two })) - whole) < 1e-9 * whole, `${kind}: two channels`);
  }
});

test('a channel clear of the beam, and a single line, behave as before', () => {
  // A channel whose window misses every slice selects nothing.
  assert.equal(signal(read('gaussian', { rod: true, aotf: channel(1000, 4) })), 0);
  assert.equal(signal(read('flat', { rod: true, aotf: channel(1000, 4) })), 0);
  // A single wavelength is attenuated by the passband at that wavelength,
  // glass or no glass: there is no slice to integrate over.
  const rodOnly = signal(read('line', { rod: true }));
  for (const [wl, expected] of [[800, 1], [805, 0.5], [900, 0]]) {
    const direct = signal(read('line', { aotf: channel(wl, 10) }));
    assert.ok(Math.abs(direct - expected) < 1e-6, `line, channel ${wl}: ${direct}`);
    assert.ok(Math.abs(signal(read('line', { rod: true, aotf: channel(wl, 10) })) - direct * rodOnly) < 1e-12);
  }
});

test('two AOTFs in a row each select from the slice the one before left', () => {
  // A second channel inside the first one's selected line takes its share of
  // that line, as it does of the unfanned beam.
  for (const kind of ['gaussian', 'flat']) {
    const whole = signal(read(kind, { rod: true }));
    const cascade = fanned => {
      const elements = [sources[kind]()];
      const add = (type, x, params) => {
        const el = createElement(type, x, 0);
        Object.assign(el.params, params);
        elements.push(el);
      };
      if (fanned) add('glassrod', 250, { rodlen: 100, dia: 20, material: 'nbk7' });
      add('aotf', 450, channel(800, 10));
      add('aotf', 550, channel(802, 3));
      const det = createElement('detector', 700, 0);
      det.params.aperture = 40;
      traceScene([...elements, det]);
      return signal(detectorReading(det.id));
    };
    const unfanned = cascade(false), fanned = cascade(true) / whole;
    assert.ok(unfanned > 0.005, `${kind}: both channels pass something (${unfanned})`);
    assert.ok(Math.abs(fanned - unfanned) <= 0.01 * unfanned, `${kind}: ${fanned} vs ${unfanned}`);
  }
});
