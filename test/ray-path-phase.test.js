// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The GDD of a pulse from the paths its colours took through prisms and
// gratings (docs/physics/ray-path-phase.md). The numbers are checked against
// the Python reference in test/validation.test.js; this file covers how the
// readings behave: compression, the cases that decline or keep each ray's
// glass GDD, probes, and the fit itself.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from '../sketch/js/elements.js';
import { traceScene, detectorReading, probeAt } from '../sketch/js/raytrace.js';
import { gddGroupDelayDifferenceFs, DISPERSION_UNAVAILABLE } from '../sketch/js/glass.js';
import { pathPhaseFit, higherOrderPhaseRad } from '../sketch/js/path-phase.js';

// The reference's layouts, so the geometry is the checked one.
const reference = JSON.parse(readFileSync(new URL('../validation/expected/ray-path-phase.json', import.meta.url), 'utf8'));
const layout = name => reference.cases.find(c => c.name.startsWith(name)).inputs;

function trace(name, { laser = {}, extra = [], edit = () => {} } = {}) {
  const { source, elements, detectorId } = layout(name);
  const src = createElement('pulsedlaser', source.x, source.y);
  src.rot = source.rot;
  Object.assign(src.params, { beamMode: 'line', wavelength: source.wavelengthNm, transformLimited: false,
    bandwidth: source.bandwidthNm, pulseWidthFs: 1000, ...laser });
  const scene = elements.map(e => {
    const el = createElement(e.type, e.x, e.y);
    Object.assign(el, { id: e.id, rot: e.rot });
    Object.assign(el.params, e.params);
    return el;
  });
  edit(scene);
  traceScene([src, ...scene, ...extra]);
  return { reading: detectorReading(detectorId), scene };
}

const C_NM_PER_FS = 299.792458;
const omega = nm => 2 * Math.PI * C_NM_PER_FS / nm;

test('the fit recovers a known phase, its group delay and its higher orders', () => {
  const center = 800, gdd = -1234.5, tod = 6789, fod = -4.2e4;
  const wavelengths = [774, 787, 800, 813, 826];
  const samples = wavelengths.map(nm => {
    const x = omega(nm) - omega(center);
    const phi = 1e7 + 3e6 * x + gdd / 2 * x * x + tod / 6 * x ** 3 + fod / 24 * x ** 4;
    return { wavelengthNm: nm, pathMm: phi * nm * 1e-6 / (2 * Math.PI), cycles: 0 };
  });
  const fit = pathPhaseFit(samples, center, { loNm: 774, hiNm: 826 });
  assert.ok(Math.abs(fit.gddFs2 / gdd - 1) < 1e-6, `GDD ${fit.gddFs2}`);
  assert.ok(Math.abs(fit.todFs3 / tod - 1) < 1e-5, `TOD ${fit.todFs3}`);
  assert.ok(Math.abs(fit.fodFs4 / fod - 1) < 1e-4, `FOD ${fit.fodFs4}`);
  const x = omega(826) - omega(center);
  assert.ok(Math.abs(higherOrderPhaseRad(fit, center, 826) - (tod / 6 * x ** 3 + fod / 24 * x ** 4)) < 1e-6);
  // A pure quadratic phase spreads the band edges as a lumped GDD does.
  const quadratic = wavelengths.map(nm => {
    const dx = omega(nm) - omega(center);
    return { wavelengthNm: nm, pathMm: (gdd / 2 * dx * dx) * nm * 1e-6 / (2 * Math.PI), cycles: 0 };
  });
  const lumped = pathPhaseFit(quadratic, center, { loNm: 774, hiNm: 826 });
  assert.ok(Math.abs(lumped.delaySpreadFs / gddGroupDelayDifferenceFs(gdd, 774, 826) - 1) < 1e-6);
});

test('the fit declines what it cannot read', () => {
  const at = nm => ({ wavelengthNm: nm, pathMm: 1000, cycles: 0 });
  assert.equal(pathPhaseFit([at(790), at(810)], 800), null, 'two wavelengths');
  assert.equal(pathPhaseFit([at(790), at(800), at(800)], 800), null, 'a repeated wavelength');
  assert.equal(pathPhaseFit([at(790), at(800), { wavelengthNm: 810, pathMm: NaN, cycles: 0 }], 800), null, 'not finite');
  assert.equal(pathPhaseFit([at(790), at(800), at(810)], 0), null, 'no centre');
  // Three wavelengths fit a quadratic: no third order to report.
  const three = pathPhaseFit([at(790), at(800), at(810)], 800);
  assert.equal(three.todFs3, 0);
  assert.equal(three.fodFs4, 0);
});

test('a four-prism line compresses a positively chirped pulse to its transform limit', () => {
  const plain = trace('four Brewster silica prisms').reading.pulse;
  assert.ok(plain.gddFs2 < 0, `the line has negative GDD (${plain.gddFs2} fs²)`);
  assert.match(plain.dispersionModel, /GDD from the ray paths/);
  assert.doesNotMatch(plain.dispersionModel, /central ray/, 'the colours come back together');
  const chirped = trace('four Brewster silica prisms', {
    laser: { inputChirp: 'positive', chirpGddFs2: -plain.gddFs2 },
  }).reading.pulse;
  const limit = 0.441 * 800 ** 2 / (C_NM_PER_FS * 30);
  assert.ok(Math.abs(chirped.stretchedPulseWidthFs / limit - 1) < 0.01,
    `${chirped.stretchedPulseWidthFs} fs against the ${limit} fs limit`);
});

test('a grating pair\'s parallel, side-by-side colours are timed on the central ray', () => {
  const whole = trace('1200 l/mm grating pair, G = 150 mm, single pass').reading.pulse;
  assert.ok(Number.isFinite(whole.stretchedPulseWidthFs), whole.dispersionModel);
  assert.match(whole.dispersionModel, /central ray: the colours arrive side by side/);
  // A detector that catches part of the spatially spread band declines.
  const part = trace('1200 l/mm grating pair, G = 150 mm, single pass', {
    edit: scene => { scene.find(el => el.id === 'det').params.aperture = 1; },
  }).reading.pulse;
  assert.equal(part.stretchedPulseWidthFs, null);
  assert.equal(part.dispersionModel, DISPERSION_UNAVAILABLE.partialFan);
});

test('colours still diverging at the detector give the central ray\'s GDD and no duration', () => {
  const { reading } = trace('one Brewster nsf10 prism');
  assert.ok(reading.pulse.gddFs2 < 0, 'angular dispersion outweighs the glass on the central ray');
  assert.equal(reading.pulse.stretchedPulseWidthFs, null);
  assert.match(reading.pulse.dispersionModel, /angular dispersion remains/);
});

test('a family through an element without a modelled path phase keeps each ray\'s glass GDD', () => {
  // A wide AOTF channel behind the four prisms: its phase is not modelled,
  // so the reading falls back to the glass GDD the rays carry, as before.
  const { reading } = trace('four Brewster silica prisms', {
    edit: scene => {
      const det = scene.find(el => el.id === 'det');
      const aotf = createElement('aotf', det.x - 60, det.y);
      Object.assign(aotf.params, { channels: [{ wl: 800, eff: 1 }], passband: 2000, deflect: 0 });
      scene.push(aotf);
    },
  });
  assert.ok(reading.pulse.gddFs2 > 0, `glass GDD only (${reading.pulse.gddFs2} fs²)`);
  assert.doesNotMatch(reading.pulse.dispersionModel || '', /ray paths/);
});

test('a probe on one colour of a fanned pulse sends the reader to a detector', () => {
  const { scene } = trace('Brewster silica prism pair, 500 mm, single pass');
  const [p1, p2] = ['p1', 'p2'].map(id => scene.find(el => el.id === id));
  const probe = probeAt((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
  assert.ok(probe?.pulse, 'the probe finds the pulse between the prisms');
  assert.equal(probe.pulse.durationFs, null);
  assert.match(probe.pulse.durationIssue, /a detector reads the duration/);
});
