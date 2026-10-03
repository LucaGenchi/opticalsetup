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
    // On a sample's wavelength, between samples, narrow, in the tail, and wide.
    for (const [wl, passband] of [[800, 10], [780, 10], [815, 4], [760, 2], [800, 40]]) {
      const unfanned = signal(read(kind, { aotf: channel(wl, passband) }));
      const fanned = signal(read(kind, { rod: true, aotf: channel(wl, passband) })) / whole;
      assert.ok(unfanned > 0.005, `${kind} ${wl}/${passband}: the channel selects something (${unfanned})`);
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

// A collimated mercury lamp, optionally through glass or a grating order,
// then an optional selector, onto a wide detector.
function lampThrough(fan, selector) {
  const source = createElement('pointsource', 175, 200);
  Object.assign(source.params, { sourceKind: 'lamp', lampType: 'hg', spread: 360, nrays: 24 });
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

test('a lamp behind glass or a grating order still has lines, not slices', () => {
  // Glass and the Grating used to hand each lamp line a slice reaching into
  // the dark gaps on either side. A bandpass on the 546 nm line then passed
  // 0.014 of the lamp where 0.244 arrives, and one between lines passed light.
  const bandpass = (center, band) => ({ type: 'filter', params: { ftype: 'bandpass', center, band, length: 200 } });
  const direct = lampThrough(null, bandpass(546, 4)) / lampThrough(null, null);
  assert.ok(direct > 0.2, `the 546 nm line is a fifth of the lamp and more (${direct})`);
  for (const fan of ['glass', 'grating']) {
    const whole = lampThrough(fan, null);
    assert.ok(Math.abs(lampThrough(fan, bandpass(546, 4)) / whole - direct) < 1e-9, `${fan}: the 546 nm line`);
    assert.equal(lampThrough(fan, bandpass(500, 2)), 0, `${fan}: nothing at 500 nm`);
    assert.equal(lampThrough(fan, bandpass(560, 4)), 0, `${fan}: nothing at 560 nm`);
  }
});

test('an AOTF behind glass takes a lamp line as it does without the glass', () => {
  const aotf = (wl, passband) => ({ type: 'aotf', params: { channels: [{ wl, eff: 1 }], passband, aperture: 100 } });
  const whole = lampThrough('glass', null), bare = lampThrough(null, null);
  // On the line, on the slope of the passband, and in a gap.
  for (const [wl, passband] of [[546.074, 2], [547, 2], [500, 2]]) {
    const direct = lampThrough(null, aotf(wl, passband)) / bare;
    const behind = lampThrough('glass', aotf(wl, passband)) / whole;
    assert.ok(Math.abs(behind - direct) < 1e-9, `channel ${wl}: ${behind} vs ${direct}`);
  }
  assert.equal(lampThrough('glass', aotf(500, 2)), 0);
});

// source -> elements in a line -> detector at 900 mm.
function chain(source, elements) {
  const det = createElement('detector', 900, 0);
  det.params.aperture = 40;
  traceScene([source, ...elements, det]);
  return detectorReading(det.id);
}
const at = (type, x, params) => {
  const el = createElement(type, x, 0);
  Object.assign(el.params, params);
  return el;
};
const rodAt = x => at('glassrod', x, { rodlen: 100, dia: 20, material: 'nbk7' });

test('the depleted beam is missing what the channel took, colour by colour', () => {
  // Selected and depleted beams recombined (zero deflection) are the beam
  // that came in, so a narrow bandpass inside the channel must read what it
  // reads with no AOTF at all. With the depleted slice left at its incoming
  // shape, it found the selected light twice: 86 % too much.
  for (const kind of ['gaussian', 'flat']) {
    for (const [center, band] of [[800, 1], [801.5, 1], [800, 6], [790, 4]]) {
      const filter = at('filter', 650, { ftype: 'bandpass', center, band });
      const without = signal(chain(sources[kind](), [rodAt(250), filter]));
      const aotf = at('aotf', 450, channel(800, 2, { showDepleted: true, deflect: 0 }));
      const withAotf = signal(chain(sources[kind](), [rodAt(250), aotf, filter]));
      assert.ok(Math.abs(withAotf - without) <= 0.01 * without, `${kind} ${center}/${band}: ${withAotf} vs ${without}`);
    }
  }
});

test('a pulse is timed the same whether the AOTF or the glass comes first', () => {
  // The channel leaves a 2 nm sinc-squared line either way; the duration
  // model has to time that line, not the wider window the slice is drawn as.
  const pulsed = () => sources.gaussian();
  const first = chain(pulsed(), [at('aotf', 250, channel(800, 2)), rodAt(450)]);
  const after = chain(pulsed(), [rodAt(250), at('aotf', 550, channel(800, 2))]);
  assert.ok(Math.abs(after.signal - first.signal) <= 1e-3 * first.signal, `power ${after.signal} vs ${first.signal}`);
  const a = first.pulse.stretchedPulseWidthFs, b = after.pulse.stretchedPulseWidthFs;
  assert.ok(a > 200, `the 2 nm line is hundreds of femtoseconds long (${a})`);
  assert.ok(Math.abs(b - a) <= 0.01 * a, `duration ${b} fs vs ${a} fs`);
});
