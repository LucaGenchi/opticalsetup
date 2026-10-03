// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement } from '../sketch/js/elements.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { LAMP_PRESETS } from '../sketch/js/lamps.js';
import { resolveEtalonPhysical } from '../sketch/js/etalon.js';
import '../sketch/js/detector-instruments.js';

// The smooth transmissions -- an etalon's Airy comb and an AOTF's sinc²
// passband -- take a discharge lamp's lines one by one, each at its own
// wavelength, as a single wavelength is taken. Sampled across the lamp's
// span, the ~0.1 nm lines fall between the grid points: an AOTF tuned
// exactly onto a line passed nothing.

const HG = LAMP_PRESETS.hg.lines;
const TOTAL = HG.reduce((sum, l) => sum + l.w, 0);
// The share of the lamp's power a per-line transmission keeps.
const share = T => HG.reduce((sum, l) => sum + l.w * T(l.nm), 0) / TOTAL;
const lineShare = nm => share(wl => (Math.abs(wl - nm) < 0.5 ? 1 : 0));

const close = (actual, expected, label, tol = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${actual} vs ${expected}`);

// A mercury lamp collimated by an off-axis parabola, then the given elements;
// a detector straight on and one below (400, 200) for a port folded down.
function trace(build = () => []) {
  // The shortest capture range: only the parabola receives the lamp directly, so the
  // beam measured downstream is the collimated one alone.
  const lamp = createElement('pointsource', 175, 200);
  Object.assign(lamp.params, { sourceKind: 'lamp', lampType: 'hg', spread: 360, nrays: 24, captureRange: 110 });
  const oap = createElement('oap', 150, 200);
  oap.rot = 180;
  Object.assign(oap.params, { length: 60, f: 25 });
  const through = createElement('detector', 700, 200);
  through.params.aperture = 200;
  const reflected = createElement('detector', 400, 420);
  reflected.rot = 90;
  reflected.params.aperture = 200;
  traceScene([lamp, oap, ...build(), through, reflected]);
  const signal = d => detectorReading(d.id)?.signal ?? 0;
  return { t: signal(through), r: signal(reflected) };
}

const lampPower = trace().t;

const element = (type, x, params, rot) => {
  const el = createElement(type, x, 200);
  if (rot != null) el.rot = rot;
  Object.assign(el.params, params);
  return el;
};

// The Airy transmission, written out independently of the tracer.
function airy(params, cosTheta) {
  const { R, spacingNm, loss } = resolveEtalonPhysical(params);
  const peak = ((1 - R - loss) / (1 - R)) ** 2;
  const F = 4 * R / (1 - R) ** 2;
  return wl => peak / (1 + F * Math.sin(2 * Math.PI * spacingNm * cosTheta / wl) ** 2);
}

function etalon(params) {
  const { t, r } = trace(() => [element('etalon', 400, { aperture: 150, ...params }, 135)]);
  return { t: t / lampPower, r: r / lampPower };
}

test('the lamp reaches the detector on its own', () => {
  assert.ok(lampPower > 0);
  assert.equal(trace().r, 0);
});

test('an etalon passes each lamp line at its own Airy transmission and reflects the rest', () => {
  const params = { centerWavelength: 546, bandwidth: 20, fsr: 90, peakTransmission: 100 };
  const T = airy(params, Math.SQRT1_2);
  const expected = share(T);
  assert.ok(expected > 0.1 && expected < 0.9, `a real mix of ports: ${expected}`);
  const { t, r } = etalon(params);
  close(t, expected, 'transmitted');
  close(r, 1 - expected, 'reflected');
  close(t + r, 1, 'T + R');
});

test('a lossy etalon transmits each line at its reduced peak', () => {
  const params = { centerWavelength: 546, bandwidth: 20, fsr: 90, peakTransmission: 60 };
  const T = airy(params, Math.SQRT1_2);
  const { t, r } = etalon(params);
  close(t, share(T), 'transmitted');
  // The reflected port takes the rest of each line, as it does for a laser.
  close(r, 1 - share(T), 'reflected');
});

test('an etalon whose comb misses every line reflects the lamp and transmits nothing', () => {
  // Fringes 0.02 nm wide: each line sits far out on the comb's floor, and a
  // transmitted share below the etalon's 2 % floor is dropped.
  const params = { centerWavelength: 500, bandwidth: 0.02, fsr: 7, peakTransmission: 100 };
  const expected = share(airy(params, Math.SQRT1_2));
  assert.ok(expected < 0.02, `expected share ${expected} should be under the floor`);
  const { t, r } = etalon(params);
  assert.equal(t, 0);
  close(r, 1 - expected, 'reflected');
});

const aotf = (params, after = []) =>
  trace(() => [element('aotf', 400, { aperture: 100, passband: 2, ...params }), ...after]).t / lampPower;
const bandpass = center => element('filter', 550, { length: 200, ftype: 'bandpass', center, band: 10 });

test('an AOTF channel tuned onto a lamp line passes that line', () => {
  close(aotf({ channels: [{ wl: 546.074, eff: 1 }] }), lineShare(546.074), '546 nm');
  close(aotf({ channels: [{ wl: 435.8343, eff: 1 }] }), lineShare(435.8343), '436 nm');
  close(aotf({ channels: [{ wl: 546.074, eff: 0.5 }] }), 0.5 * lineShare(546.074), 'half efficiency');
  close(aotf({ channels: [{ wl: 435.8343, eff: 1 }, { wl: 546.074, eff: 1 }] }),
    lineShare(435.8343) + lineShare(546.074), 'two channels');
});

test('an AOTF channel off a line passes it by the sinc² passband, or not at all', () => {
  // Half the passband away is the half-power point.
  close(aotf({ channels: [{ wl: 547.074, eff: 1 }] }), 0.5 * lineShare(546.074), 'half-power point', 1e-9);
  // The 577/579 nm doublet, each line about a nanometre from a 578 nm channel.
  const sinc2 = detune => {
    const x = detune * 0.44294647068945237;
    return (Math.sin(Math.PI * x) / (Math.PI * x)) ** 2;
  };
  close(aotf({ channels: [{ wl: 578, eff: 1 }] }),
    share(wl => (Math.abs(wl - 578) < 2 ? sinc2(wl - 578) : 0)), 'doublet');
  // Between lines, beyond the passband's wings: nothing.
  assert.equal(aotf({ channels: [{ wl: 500, eff: 1 }] }), 0);
});

test('the depleted beam keeps only what the channels left of each line', () => {
  // Undeflected, both beams reach the detector: together they are the lamp.
  const both = { showDepleted: true, deflect: 0 };
  close(aotf({ ...both, channels: [{ wl: 546.074, eff: 1 }] }), 1, 'selected + depleted');
  close(aotf({ ...both, channels: [{ wl: 546.074, eff: 0.5 }] }), 1, 'selected + depleted at half efficiency');
  // A bandpass on the selected line finds it once, however it was divided.
  close(aotf({ ...both, channels: [{ wl: 546.074, eff: 1 }] }, [bandpass(546)]), lineShare(546.074), '546 nm, all selected');
  close(aotf({ ...both, channels: [{ wl: 546.074, eff: 0.5 }] }, [bandpass(546)]), lineShare(546.074), '546 nm, half selected');
  // A line no channel touches stays whole in the depleted beam.
  close(aotf({ ...both, channels: [{ wl: 546.074, eff: 1 }] }, [bandpass(436)]), lineShare(435.8343), '436 nm untouched');
  // With no channel on a line the depleted beam is the whole lamp.
  close(aotf({ ...both, channels: [{ wl: 500, eff: 1 }] }), 1, 'nothing selected');
});
