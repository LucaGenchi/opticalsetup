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
import { gddGroupDelayDifferenceFs, DISPERSION_UNAVAILABLE, glassIndexUnbucketed } from '../sketch/js/glass.js';
import { colourSpreadText } from '../sketch/js/inspector.js';
import { pathPhaseFit, higherOrderPhaseRad } from '../sketch/js/path-phase.js';

// The reference's layouts, so the geometry is the checked one.
const reference = JSON.parse(readFileSync(new URL('../validation/expected/ray-path-phase.json', import.meta.url), 'utf8'));
const layout = name => reference.cases.find(c => c.name.startsWith(name)).inputs;

function trace(name, { laser = {}, extra = [], edit = () => {}, shift = 0, continuum = null } = {}) {
  const { source, elements, detectorId } = layout(name);
  const src = createElement(continuum ? 'sclaser' : 'pulsedlaser', source.x + shift, source.y);
  src.rot = source.rot;
  Object.assign(src.params, continuum
    ? { beamMode: 'line', temporalMode: 'pulsed', ...continuum }
    : { beamMode: 'line', wavelength: source.wavelengthNm, transformLimited: false,
      bandwidth: source.bandwidthNm, pulseWidthFs: 1000, ...laser });
  const scene = elements.map(e => {
    const el = createElement(e.type, e.x + shift, e.y);
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

// How far apart one pass of the reference grating pair (1200 l/mm, 35°
// incidence, G = 150 mm) puts two colours: G (tan β₁ − tan β₂) cos θᵢ.
function treacyWidthMm(loNm, hiNm) {
  const theta = 35 * Math.PI / 180, d = 1e6 / 1200;
  const tanBeta = nm => Math.tan(Math.asin(nm / d - Math.sin(theta)));
  return 150 * Math.abs(tanBeta(hiNm) - tanBeta(loNm)) * Math.cos(theta);
}

test('a detector reads how the split colours arrive: parallel or not, overlapping or side by side', () => {
  // Four prisms bring every colour back onto one path.
  const only = name => {
    const spreads = trace(name).reading.pulse.colourSpreads;
    assert.equal(spreads.length, 1, name);
    return spreads[0];
  };
  const four = only('four Brewster silica prisms');
  assert.equal(four.parallel, true);
  assert.equal(four.overlapping, true);
  assert.ok(four.angleRad < 1e-12 && four.lateralMm < 1e-9, JSON.stringify(four));
  assert.match(colourSpreadText(four), /^Parallel and overlapping across 761\.8–838\.2 nm$/);
  // One pass of a grating pair leaves them parallel and side by side, as far
  // apart as Treacy's geometry puts them: G (tan β₁ − tan β₂) cos θᵢ across
  // the traced band, at 35° incidence and G = 150 mm.
  const pair = only('1200 l/mm grating pair, G = 150 mm, single pass');
  const expected = treacyWidthMm(pair.loNm, pair.hiNm);
  assert.equal(pair.parallel, true);
  assert.equal(pair.overlapping, false);
  assert.ok(Math.abs(pair.lateralMm / expected - 1) < 1e-9, `${pair.lateralMm} mm against ${expected} mm`);
  assert.match(colourSpreadText(pair), /^Parallel, side by side over 4\.79 mm across .* spatial chirp\)$/);
  // One Brewster prism leaves them diverging by the difference of its
  // deviations at the band's edges.
  const one = only('one Brewster nsf10 prism');
  const apex = 60.599929089 * Math.PI / 180, incidence = Math.atan(glassIndexUnbucketed('nsf10', 800));
  const deviation = nm => {
    const n = glassIndexUnbucketed('nsf10', nm);
    return incidence + Math.asin(n * Math.sin(apex - Math.asin(Math.sin(incidence) / n))) - apex;
  };
  const spread = Math.abs(deviation(one.hiNm) - deviation(one.loNm));
  assert.equal(one.parallel, false);
  assert.ok(Math.abs(one.angleRad / spread - 1) < 1e-9, `${one.angleRad} rad against ${spread} rad`);
  assert.match(colourSpreadText(one), /^At different angles: 2\.55 mrad across .*angular dispersion remains; side by side over .* at this face$/);
});

test('light no prism or grating split carries no colour reading', () => {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'line', wavelength: 800, bandwidth: 10, pulseWidthFs: 100 });
  const det = createElement('detector', 200, 0);
  det.rot = 0;
  traceScene([laser, det]);
  const pulse = detectorReading(det.id).pulse;
  assert.ok(pulse, 'the pulse arrives');
  assert.equal(pulse.colourSpreads, undefined);
  assert.equal(colourSpreadText(undefined), '');
});

test('where the colours land is read even where their phase cannot be fitted', () => {
  // Behind an AOTF the path phase is not followed, and two colours are too
  // few to fit: the GDD falls back, but the colours still have positions and
  // directions.
  const { reading } = trace('four Brewster silica prisms', {
    edit: scene => {
      const det = scene.find(el => el.id === 'det');
      const aotf = createElement('aotf', det.x - 60, det.y);
      Object.assign(aotf.params, { channels: [{ wl: 800, eff: 1 }], passband: 2000, deflect: 0 });
      scene.push(aotf);
    },
  });
  assert.doesNotMatch(reading.pulse.dispersionModel || '', /ray paths/);
  assert.equal(reading.pulse.colourSpreads.length, 1);
  assert.equal(reading.pulse.colourSpreads[0].parallel, true);
  assert.equal(reading.pulse.colourSpreads[0].overlapping, true);
  assert.equal(reading.pulse.colourSpreads[0].hiNm - reading.pulse.colourSpreads[0].loNm, reading.bandMax - reading.bandMin);
  // A 2 mm detector moved 2 mm across the grating pair's fan catches two
  // of its colours; a 1 mm one on the centre catches one, which has nothing
  // to spread across.
  const narrow = (aperture, acrossMm) => trace('1200 l/mm grating pair, G = 150 mm, single pass', {
    edit: scene => {
      const det = scene.find(el => el.id === 'det');
      det.params.aperture = aperture;
      det.x -= Math.sin(det.rot * Math.PI / 180) * acrossMm;
      det.y += Math.cos(det.rot * Math.PI / 180) * acrossMm;
    },
  }).reading;
  const two = narrow(2, 2);
  assert.equal(two.samples, 2);
  assert.equal(two.pulse.colourSpreads.length, 1);
  const [spread] = two.pulse.colourSpreads;
  assert.equal(spread.parallel, true);
  assert.ok(Math.abs(spread.lateralMm / treacyWidthMm(spread.loNm, spread.hiNm) - 1) < 1e-9, JSON.stringify(spread));
  const one = narrow(1, 0);
  assert.equal(one.samples, 1);
  assert.equal(one.pulse.colourSpreads, undefined);
});

test('two split bands at one detector are read one per band', () => {
  // Two sources, 750 and 800 nm, 10 nm each, through one pass of the grating
  // pair: each band keeps its own width and its own mm per nm, which the
  // pair makes different (the merged reading had given 0.0635 mm/nm for
  // both and the width of one).
  const name = '1200 l/mm grating pair, G = 150 mm, single pass';
  const { source } = layout(name);
  const blue = createElement('pulsedlaser', source.x, source.y);
  blue.rot = source.rot;
  Object.assign(blue.params, { beamMode: 'line', wavelength: 750, transformLimited: false, bandwidth: 10, pulseWidthFs: 1000 });
  const { reading } = trace(name, {
    laser: { wavelength: 800, bandwidth: 10 },
    extra: [blue],
    edit: scene => { scene.find(el => el.id === 'det').params.aperture = 100; },
  });
  const spreads = reading.pulse.colourSpreads;
  assert.equal(spreads.length, 2, JSON.stringify(spreads));
  assert.ok(spreads[0].hiNm < 775 && spreads[1].loNm > 775, 'bluest first');
  const perNm = spreads.map(c => c.lateralMm / (c.hiNm - c.loNm));
  for (const c of spreads) {
    assert.ok(Math.abs(c.lateralMm / treacyWidthMm(c.loNm, c.hiNm) - 1) < 1e-9, JSON.stringify(c));
  }
  assert.ok(perNm[1] > perNm[0] * 1.05, `${perNm} mm/nm`);
  for (const [c, text] of spreads.map(c => [c, colourSpreadText(c)])) {
    assert.match(text, new RegExp(`across ${c.loNm.toFixed(1)}–${c.hiNm.toFixed(1)} nm`));
  }
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

test('a narrow band keeps its GDD with the uncertainty rounding leaves', () => {
  const want = reference.cases.find(c => c.name.startsWith('four Brewster')).expected.gddFs2;
  for (const bandwidth of [1, 0.1]) {
    const { pulse } = trace('four Brewster silica prisms', { laser: { bandwidth, pulseWidthFs: 1e7 } }).reading;
    assert.ok(Math.abs(pulse.gddFs2 / want - 1) < 1e-4, `${bandwidth} nm: ${pulse.gddFs2} fs²`);
    assert.equal(pulse.gddUncertaintyFs2, undefined);
  }
  // Narrower, the phases differ by little more than the paths' rounding: the
  // estimate stays, with an uncertainty that contains the true value (it read
  // -894 fs² at 0.001 nm before, then 0 ± 12.7 at 0.03 nm), and the duration
  // is given only because it is the same across that range.
  for (const bandwidth of [0.03, 0.01, 0.001]) {
    const { pulse } = trace('four Brewster silica prisms', { laser: { bandwidth, pulseWidthFs: 1e7 } }).reading;
    assert.ok(pulse.gddUncertaintyFs2 > 0, `${bandwidth} nm: uncertainty given`);
    assert.ok(Math.abs(pulse.gddFs2 - want) <= pulse.gddUncertaintyFs2, `${bandwidth} nm: ${pulse.gddFs2} ± ${pulse.gddUncertaintyFs2} fs²`);
    assert.match(pulse.dispersionModel, /uncertain; the duration holds across that range/);
    assert.ok(Math.abs(pulse.stretchedPulseWidthFs / pulse.transformLimitFs - 1) < 1e-3);
  }
});

test('a scene far from the origin keeps the reading honest about its rounding', () => {
  // The same four prisms moved 1e9 mm along x: coordinates that large leave
  // the 30 nm GDD uncertain by about 12 fs², enough to move a 31 fs pulse, so
  // the duration declines rather than being given from one end of the range.
  const want = reference.cases.find(c => c.name.startsWith('four Brewster')).expected.gddFs2;
  const { pulse } = trace('four Brewster silica prisms', { shift: 1e9 }).reading;
  assert.ok(Math.abs(pulse.gddFs2 - want) <= pulse.gddUncertaintyFs2, `${pulse.gddFs2} ± ${pulse.gddUncertaintyFs2} fs²`);
  assert.equal(pulse.stretchedPulseWidthFs, null);
  assert.match(pulse.dispersionModel, /uncertain by ±\d+ fs² from rounding/);
});

test('the fit is not swamped by long paths over a narrow band', () => {
  // 0.2 nm across five samples, 2 m of path: the absolute phases are 1.6e7
  // rad, the curvature about 0.1 milliradian.
  const center = 800, gdd = -5000;
  const samples = [-0.1, -0.05, 0, 0.05, 0.1].map(d => {
    const nm = center + d, x = omega(nm) - omega(center);
    const phi = 2 * Math.PI * 2000 / (nm * 1e-6) + gdd / 2 * x * x;
    return { wavelengthNm: nm, pathMm: phi * nm * 1e-6 / (2 * Math.PI), cycles: 0 };
  });
  const fit = pathPhaseFit(samples, center, {});
  assert.ok(fit.gddNoiseFs2 < 0.01 * Math.abs(gdd), `noise ${fit.gddNoiseFs2}`);
  assert.ok(Math.abs(fit.gddFs2 - gdd) <= fit.gddNoiseFs2, `${fit.gddFs2} against ${gdd} ± ${fit.gddNoiseFs2}`);
});

test('dispersion further along does not change what a probe reads upstream', () => {
  // A 10 mm silica window at normal incidence, a probe after it, then (or
  // not) the four prisms: the beam at the probe is the same either way.
  const window = () => {
    const slab = createElement('freeglass', 100, 0);
    Object.assign(slab.params, { material: 'silica', scale: 1, transEff: 100,
      vertices: [{ x: -5, y: -20 }, { x: 5, y: -20 }, { x: 5, y: 20 }, { x: -5, y: 20 }] });
    return slab;
  };
  const read = withPrisms => {
    trace('four Brewster silica prisms', {
      laser: { pulseWidthFs: 20, transformLimited: true },
      extra: [window()],
      edit: scene => { if (!withPrisms) scene.splice(0, scene.length, ...scene.filter(el => el.type === 'detector')); },
    });
    return probeAt(120, 0)?.pulse;
  };
  const alone = read(false), before = read(true);
  assert.ok(Number.isFinite(alone.durationFs), alone.durationIssue);
  assert.equal(before.durationFs, alone.durationFs);
});

test('the duration check covers the whole uncertainty, compression point included', () => {
  // Four prisms moved 1e10 mm, the source chirped to cancel the estimated
  // GDD: the reading sits at the transform limit, and both ends of the
  // ±123 fs² uncertainty give the same longer pulse. Comparing the ends alone
  // passed it; the duration varies 5.8 % across the range.
  const estimate = trace('four Brewster silica prisms', { shift: 1e10 }).reading.pulse;
  assert.ok(estimate.gddUncertaintyFs2 > 50, `uncertainty ${estimate.gddUncertaintyFs2} fs²`);
  const { pulse } = trace('four Brewster silica prisms', {
    shift: 1e10, laser: { inputChirp: 'positive', chirpGddFs2: -estimate.gddFs2 },
  }).reading;
  assert.equal(pulse.stretchedPulseWidthFs, null);
  assert.match(pulse.dispersionModel, /uncertain by ±/);
});

test('a flat-band continuum checks the delay spread its duration comes from', () => {
  // The flat-band model times the pulse from the band edges' delay spread,
  // not the GDD: the uncertainty has to move that spread too. Here it moves
  // the duration between about 100.7 and 103.3 fs, so none is given.
  const { pulse } = trace('four Brewster silica prisms', {
    shift: 1e9, continuum: { scMin: 785, scMax: 815, pulseWidthFs: 100 },
  }).reading;
  assert.ok(pulse.gddUncertaintyFs2 > 10, `uncertainty ${pulse.gddUncertaintyFs2} fs²`);
  assert.equal(pulse.stretchedPulseWidthFs, null);
  assert.match(pulse.dispersionModel, /uncertain by ±/);
});

test('a filtered pulse with an uncertain GDD declines its duration', () => {
  // A bandpass and a notch cut the spectrum; the scene sits far from the
  // origin, so rounding leaves the GDD uncertain by about ±1370 fs². The
  // filtered transform's width is not monotonic in the GDD: three points
  // agreed at about 140 fs while 3250 fs², inside the range, gives 197 fs.
  const filters = [
    Object.assign(createElement('filter', 80 + 1.37e6, 0), { params: { ...createElement('filter').params, ftype: 'bandpass', center: 800, band: 30 } }),
    Object.assign(createElement('filter', 110 + 1.37e6, 0), { params: { ...createElement('filter').params, ftype: 'notch', center: 796.5, band: 15 } }),
  ];
  const { pulse } = trace('four Brewster silica prisms', {
    shift: 1.37e6, laser: { inputChirp: 'positive', chirpGddFs2: 2810 }, extra: filters,
  }).reading;
  assert.ok(pulse.gddUncertaintyFs2 > 100, `uncertainty ${pulse.gddUncertaintyFs2} fs²`);
  assert.equal(pulse.stretchedPulseWidthFs, null);
  assert.match(pulse.dispersionModel, /uncertain by ±/);
});
