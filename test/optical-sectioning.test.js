// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createElement, newSampleChannel, registry, specimenFocusReadout, isVolumeSpecimen, sampleLayers,
  NONLINEAR_SIGNAL_KINDS, LINEAR_SIGNAL_KINDS,
} from '../sketch/js/elements.js';
import {
  NONLINEAR_ORDER, MIN_RELATIVE_INTENSITY, bundleFocus, relativeYield, volumeEmissionPoints, linearPathFraction,
} from '../sketch/js/sectioning.js';
import { traceScene, specimenFocusReading, specimenIncidentBeams, probeBeamsAt } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { wavelengthToColor } from '../sketch/js/util.js';

// A bundle converging to (fx, 0) from rays crossing the line x = 0.
// Every ray travels in +x; a negative fx is a bundle diverging from behind.
function converging(fx, halfHeight = 5, n = 5) {
  return Array.from({ length: n }, (_, i) => {
    const y = -halfHeight + 2 * halfHeight * i / (n - 1);
    const sign = Math.sign(fx), len = Math.hypot(fx, y);
    return { p: { x: 0, y }, d: { x: sign * fx / len, y: -sign * y / len }, w: 1 };
  });
}

test('every nonlinear signal kind has an order, and no linear one does', () => {
  assert.deepEqual(Object.keys(NONLINEAR_ORDER).sort(), NONLINEAR_SIGNAL_KINDS.map(([kind]) => kind).sort());
  for (const [kind] of LINEAR_SIGNAL_KINDS) assert.equal(NONLINEAR_ORDER[kind], undefined);
});

test('the focus of a converging bundle is where its rays meet', () => {
  const focus = bundleFocus(converging(50), 800);
  assert.equal(focus.ok, true);
  assert.ok(Math.abs(focus.zMm - 50) < 1e-9);
  assert.ok(Math.abs(focus.point.x - 50) < 1e-9 && Math.abs(focus.point.y) < 1e-9);
  assert.ok(Math.abs(focus.na - 0.1 / Math.hypot(1, 0.1)) < 1e-9);
  // Diffraction-limited Gaussian focus: w0 = λ/(π NA), zR = π w0²/λ.
  const wl = 800e-6;
  assert.ok(Math.abs(focus.w0Mm - wl / (Math.PI * focus.na)) < 1e-12);
  assert.ok(Math.abs(focus.zRMm - Math.PI * focus.w0Mm ** 2 / wl) < 1e-12);
  // A focus behind the crossing is a negative distance.
  assert.ok(Math.abs(bundleFocus(converging(-20), 800).zMm + 20) < 1e-9);
});

test('a bundle with no usable focus says why instead of inventing one', () => {
  const parallel = [-2, 0, 2].map(y => ({ p: { x: 0, y }, d: { x: 1, y: 0 }, w: 1 }));
  assert.deepEqual(bundleFocus(parallel, 800), { ok: false, reason: 'collimated' });
  assert.deepEqual(bundleFocus([{ p: { x: 0, y: 0 }, d: { x: 1, y: 0 }, w: 1 }], 800), { ok: false, reason: 'single' });
  assert.deepEqual(bundleFocus([], 800), { ok: false, reason: 'single' });
  const broken = [{ p: { x: NaN, y: 0 }, d: { x: 1, y: 0 }, w: 1 }, { p: { x: 0, y: 1 }, d: { x: 1, y: Infinity }, w: 1 }];
  assert.equal(bundleFocus(broken, 800).ok, false);
  assert.equal(bundleFocus(converging(50), 0).ok, false);
});

test('the thin-slice yield is a Lorentzian per extra photon', () => {
  assert.equal(relativeYield(1, 5), 1);
  assert.equal(relativeYield(2, 0), 1);
  assert.ok(Math.abs(relativeYield(2, 1) - 0.5) < 1e-12);
  assert.ok(Math.abs(relativeYield(3, 1) - 0.25) < 1e-12);
  assert.ok(relativeYield(3, 1e300) === 0);
});

const U = Math.sqrt(1 / MIN_RELATIVE_INTENSITY - 1);
const F3 = u => (u / (1 + u * u) + Math.atan(u)) / 2;

test('a focus inside a thick layer gives the whole focal signal, from the focus', () => {
  const points = volumeEmissionPoints(2, -10, 10, { ok: true, zRMm: 0.001 }, 8);
  assert.equal(points.length, 1, 'one spot');
  assert.ok(Math.abs(points[0].at - 0.5) < 1e-12 && points[0].level === 1);
  // The whole focal region within the cutoff is inside: exactly the efficiency.
  assert.ok(Math.abs(points[0].share - 1) < 1e-12);
});

test('a layer shorter than the focal region holds its share of the focal signal', () => {
  // ±1 zR, against the focal signal within ±U zR.
  const half = volumeEmissionPoints(2, -1, 1, { ok: true, zRMm: 1 }, 4);
  assert.ok(Math.abs(half.reduce((s, p) => s + p.share, 0) - Math.atan(1) / Math.atan(U)) < 1e-12);
  const third = volumeEmissionPoints(3, -1, 1, { ok: true, zRMm: 1 }, 4);
  assert.ok(Math.abs(third.reduce((s, p) => s + p.share, 0) - F3(1) / F3(U)) < 1e-12);
});

test('nothing is generated where the intensity is under 1/1000 of the focus', () => {
  const zR = 0.001;
  // A layer 40 to 60 zR from the focus: entirely below the cutoff.
  assert.deepEqual(volumeEmissionPoints(2, 40 * zR, 60 * zR, { ok: true, zRMm: zR }, 4), []);
  assert.deepEqual(volumeEmissionPoints(3, -60 * zR, -40 * zR, { ok: true, zRMm: zR }, 4), []);
  // A layer from 20 to 60 zR: only its part up to 31.6 zR emits, faintly.
  const edge = volumeEmissionPoints(2, 20 * zR, 60 * zR, { ok: true, zRMm: zR }, 4);
  assert.ok(edge.length > 0);
  for (const p of edge) {
    const u = 20 + p.at * 40;
    assert.ok(u <= U + 1e-9, `emits within the cutoff, at ${u} zR`);
    assert.ok(Math.abs(p.level - relativeYield(2, u)) < 1e-12);
  }
  assert.ok(Math.abs(edge.reduce((s, p) => s + p.share, 0) - (Math.atan(U) - Math.atan(20)) / (2 * Math.atan(U))) < 1e-12);
});

test('a linear signal, or a beam without a focus, emits evenly along the path', () => {
  for (const [order, focus] of [[1, null], [2, null], [2, { ok: false, reason: 'speckle' }], [1, { ok: true, zRMm: 0.1 }]]) {
    // A focus off the path anchors nothing.
    const points = volumeEmissionPoints(order, 5, 25, focus, 4);
    assert.deepEqual(points.map(p => p.at), [0.125, 0.375, 0.625, 0.875]);
    assert.ok(points.every(p => p.share === 0.25 && p.level === 1));
  }
});

test('a linear signal samples the focus itself when the focus is on the path', () => {
  // What a confocal pinhole images: one spot exactly at the focus, the
  // others a spacing apart, each carrying the path nearest to it.
  const points = volumeEmissionPoints(1, -3, 7, { ok: true, zRMm: 0.001 }, 4);
  const at = points.map(p => p.at);
  assert.ok(at.some(x => Math.abs(x - 0.3) < 1e-12), `a spot at the focus: ${at}`);
  for (let i = 1; i < at.length; i++) assert.ok(Math.abs(at[i] - at[i - 1] - 0.25) < 1e-12);
  assert.ok(Math.abs(points.reduce((s, p) => s + p.share, 0) - 1) < 1e-12);
  assert.ok(points.every(p => p.level === 1 && p.share > 0));
});

test('a linear signal grows with the path and never passes one', () => {
  assert.ok(Math.abs(linearPathFraction(0.1, 1) - 0.1) < 1e-12, 'efficiency is per millimetre');
  assert.ok(Math.abs(linearPathFraction(0.1, 2) - 0.19) < 1e-12);
  assert.ok(linearPathFraction(0.1, 20) > linearPathFraction(0.1, 10));
  assert.equal(linearPathFraction(0.5, 1e6), 1);
  assert.equal(linearPathFraction(1, 3), 1);
  assert.equal(linearPathFraction(0, 3), 0);
  assert.equal(linearPathFraction(NaN, 3), 0);
  assert.equal(linearPathFraction(0.1, -2), 0);
});

test('a new specimen is a sandwich; a saved one loads as the sandwich of its thickness', () => {
  for (const type of ['sample', 'stage']) {
    const fresh = createElement(type, 0, 0);
    assert.equal(fresh.params.sampleLayout, 'sandwich');
    assert.equal(fresh.params.glassThickness, 1.5);
    assert.equal(fresh.params.activeThickness, 2);
    assert.equal(fresh.params.showSignalSpot, false, 'the excitation spot starts off');
    const layers = sampleLayers(fresh.params, 10);
    assert.equal(layers.total, 5, '1.5 + 2 + 1.5 mm');
    assert.deepEqual([layers.active.y0, layers.active.y1], [-1, 1]);
    assert.equal(layers.glass.length, 2);
    // Saved before layouts: a 6 mm thin sheet, its fluorescence at 0.1 and its
    // Raman at 0.4, without the excitation-spot setting.
    const saved = createElement(type, 0, 0);
    for (const key of ['sampleLayout', 'glassThickness', 'activeThickness', 'showSignalSpot']) delete saved.params[key];
    Object.assign(saved.params, {
      specimenType: 'linear', thickness: 6,
      channels: [{ ...newSampleChannel('fluor'), eff: 0.1 }, { ...newSampleChannel('raman'), eff: 0.4 }],
    });
    const p = parseSketch(JSON.stringify({ version: 1, elements: [saved] }), registry).elements[0].params;
    assert.equal(p.sampleLayout, 'sandwich');
    assert.equal(p.glassThickness, 2);
    assert.equal(p.activeThickness, 2);
    assert.equal(p.showSignalSpot, false, 'the excitation spot is off unless the scene switched it on');
    assert.ok(isVolumeSpecimen(p));
    // Per millimetre, so the 2 mm layer converts what the sheet did.
    for (const [c, old] of [[p.channels[0], 0.1], [p.channels[1], 0.4]]) {
      assert.ok(Math.abs(linearPathFraction(c.eff, 2) - old) < 1e-12, `${c.kind}: ${c.eff}`);
    }
    // A nonlinear channel keeps its efficiency: it is the focal total.
    const nonlinear = createElement(type, 0, 0);
    for (const key of ['sampleLayout', 'glassThickness', 'activeThickness']) delete nonlinear.params[key];
    Object.assign(nonlinear.params, { specimenType: 'nonlinear', thickness: 3, channels: [{ ...newSampleChannel('tpef'), eff: 0.3 }] });
    const q = parseSketch(JSON.stringify({ version: 1, elements: [nonlinear] }), registry).elements[0].params;
    assert.equal(q.channels[0].eff, 0.3);
    assert.equal(q.glassThickness, 1);
    assert.equal(q.activeThickness, 1);
  }
  // The stage holds slides and sandwiches, not cuvettes.
  const layouts = type => registry[type].params.find(p => p.key === 'sampleLayout').options.map(([id]) => id);
  assert.ok(layouts('sample').includes('cuvette'));
  assert.ok(!layouts('stage').includes('cuvette'));
});

test('a slide puts its active layer on the chosen face; a cuvette has glass all round', () => {
  const p = { sampleLayout: 'slide', glassThickness: 1, activeThickness: 0.1, activeSide: 'top' };
  const top = sampleLayers(p, 10);
  assert.ok(Math.abs(top.total - 1.1) < 1e-12);
  assert.ok(Math.abs(top.active.y0 + 0.55) < 1e-12 && Math.abs(top.active.y1 + 0.45) < 1e-12);
  const bottom = sampleLayers({ ...p, activeSide: 'bottom' }, 10);
  assert.ok(Math.abs(bottom.active.y1 - 0.55) < 1e-12);
  const cuvette = sampleLayers({ sampleLayout: 'cuvette', glassThickness: 1, activeThickness: 10 }, 10);
  assert.equal(cuvette.glass.length, 4);
  assert.equal(cuvette.active.halfWidth, 9);
  // Thicknesses are clamped at the schema boundary.
  const clamped = sampleLayers({ sampleLayout: 'sandwich', glassThickness: -3, activeThickness: Infinity }, 10);
  assert.ok(Number.isFinite(clamped.total) && clamped.total === 0.2 + 2);
});

// A 6 mm beam focused by a 40x-like objective (EFL 4.5 mm, NA 0.65, working
// distance 3 mm), whose focus is at x = 139; a specimen centred there.
function objectiveBench({ kind = 'tpef', offset = 0, layout = 'sandwich', active = 2, lens = true, diffuser = false, eff = 0.2 } = {}) {
  const linear = kind === 'fluor';
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { wavelength: linear ? 488 : 920, beamMode: 'beam', beamWidth: 6 });
  const elements = [laser];
  if (diffuser) {
    const d = createElement('diffuser', 60, 0);
    d.params.div = 6;
    // A fixed grain pattern, so the bench is the same on every run.
    d.scatterSeed = 2295458086;
    elements.push(d);
  }
  if (lens) {
    const obj = createElement('objective', 120, 0);
    Object.assign(obj.params, { efl: 4.5, na: 0.65, workingDistance: 3, immersion: 'air' });
    elements.push(obj);
  }
  const sample = createElement('sample', 139 + offset, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 30, sampleLayout: layout, activeThickness: active, specimenType: linear ? 'linear' : 'nonlinear',
    channels: [{ ...newSampleChannel(kind), eff, autoWl: false, wl: 560 }],
  });
  elements.push(sample);
  const { drawables } = traceScene(elements);
  return { sample, drawables };
}

// The x positions isotropic emission starts from (each fan's rays share an
// origin, and a glow is drawn as segments starting there), with only spots
// drawn at least a tenth as bright as the brightest listed.
function emissionOrigins(drawables, wl = 560) {
  const color = wavelengthToColor(wl);
  const spots = new Map();
  for (const d of drawables) {
    if (d.type !== 'path' || d.color !== color || d.w !== 1.8) continue;
    const key = `${d.pts[0].x.toFixed(3)},${d.pts[0].y.toFixed(3)}`;
    const spot = spots.get(key) || { n: 0, opacity: 0 };
    spot.n++;
    spot.opacity = Math.max(spot.opacity, d.opacity);
    spots.set(key, spot);
  }
  const fans = [...spots].filter(([, spot]) => spot.n >= 10);
  const brightest = Math.max(0, ...fans.map(([, spot]) => spot.opacity));
  return fans.filter(([, spot]) => spot.opacity >= brightest / 10)
    .map(([key]) => Number(key.split(',')[0])).sort((a, b) => a - b);
}

// Emitted power, measured on a huge circle tangent to the beam axis at the
// specimen: it catches the half of every fan that heads to one side, the same
// fraction for every spot on the axis, so ratios between benches are exact.
// (A probe does not count light emitted inside its own circle.)
const emitted = (sample, wl = 560) => probeBeamsAt(sample.x, sample.y - 1e6, 1e6 - 1e-6)
  .filter(b => Math.abs(b.wl - wl) < 0.5).reduce((sum, b) => sum + b.power, 0);

test('a focus inside the active layer: two-photon fluorescence from the focus alone', () => {
  const { sample, drawables } = objectiveBench();
  assert.deepEqual(emissionOrigins(drawables), [139]);
  const readings = specimenFocusReading(sample.id);
  assert.equal(readings[0].inside, true);
  assert.match(specimenFocusReadout(readings), /^920 nm: 1 mm into the active layer · zR 1\.\d+ µm$/);
  // A 100 µm layer around the focus still holds all of a micrometre focus.
  const thick = emitted(sample);
  const thin = objectiveBench({ active: 0.1 });
  assert.ok(thick > 0 && Math.abs(emitted(thin.sample) / thick - 1) < 1e-6);
});

test('a focus away from the active layer generates nothing, and says nothing', () => {
  // The focus 1.2 mm off the middle: inside the 1.5 mm glass.
  const { sample, drawables } = objectiveBench({ offset: 1.2 });
  assert.equal(emitted(sample), 0);
  assert.deepEqual(emissionOrigins(drawables), []);
  assert.equal(specimenFocusReadout(specimenFocusReading(sample.id)), null);
  // Second harmonic too: no forward signal.
  const shg = objectiveBench({ kind: 'shg', offset: 1.2 });
  assert.equal(probeBeamsAt(shg.sample.x + 20, 0, 10).filter(b => Math.abs(b.wl - 460) < 1).length, 0);
  const shgFocused = objectiveBench({ kind: 'shg' });
  assert.ok(probeBeamsAt(shgFocused.sample.x + 20, 0, 10).some(b => Math.abs(b.wl - 460) < 1));
});

test('one-photon fluorescence comes from the whole active layer and grows with it', () => {
  const { drawables } = objectiveBench({ kind: 'fluor' });
  const origins = emissionOrigins(drawables);
  assert.ok(origins.length >= 2, `spots across the layer: ${origins}`);
  assert.ok(origins.every(x => Math.abs(x - 139) <= 1), `inside the 2 mm active layer: ${origins}`);
  // Measured without the objective, which would collect part of the glow.
  const thick = emitted(objectiveBench({ kind: 'fluor', lens: false }).sample);
  const thin = objectiveBench({ kind: 'fluor', active: 0.5, lens: false });
  const ratio = thick / emitted(thin.sample);
  assert.ok(Math.abs(ratio - linearPathFraction(0.2, 2) / linearPathFraction(0.2, 0.5)) < 1e-6, `ratio ${ratio}`);
});

test('a wide-field or speckle beam generates along the active layer, with no focus message', () => {
  for (const [what, options] of [['collimated', { lens: false }], ['speckle', { lens: false, diffuser: true }]]) {
    const { sample, drawables } = objectiveBench({ ...options, active: 8 });
    assert.equal(specimenFocusReadout(specimenFocusReading(sample.id)), null, `${what}: no focus message`);
    const origins = emissionOrigins(drawables);
    assert.ok(origins.length >= 5, `${what}: emits along the layer, got ${origins}`);
    assert.ok(origins[0] < 136 && origins[origins.length - 1] > 142, `${what}: across the 8 mm layer, got ${origins}`);
  }
  const speckled = objectiveBench({ lens: false, diffuser: true });
  assert.equal(specimenFocusReading(speckled.sample.id)[0].reason, 'speckle');
});

// 10 mm beam, f = 100 mm lens at x = 100: focus at x = 200, zR ≈ 117 µm at
// 920 nm -- a focal region longer than a thin active layer.
function lensBench({ active = 2, offset = 0 } = {}) {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { wavelength: 920, beamMode: 'beam', beamWidth: 10 });
  const lens = createElement('lens', 100, 0);
  lens.params.f = 100;
  const sample = createElement('sample', 200 + offset, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 40, sampleLayout: 'sandwich', activeThickness: active, specimenType: 'nonlinear',
    channels: [{ ...newSampleChannel('tpef'), eff: 0.2, autoWl: false, wl: 560 }],
  });
  const { drawables } = traceScene([laser, lens, sample]);
  return { sample, drawables };
}

test('a layer thinner than the focal region gives its share of the focal signal', () => {
  const thick = lensBench({ active: 20 });
  const whole = emitted(thick.sample);
  const zR = specimenFocusReading(thick.sample.id)[0].zRMm;
  const thin = lensBench({ active: 0.1 });
  const expected = Math.atan(0.05 / zR) / Math.atan(Math.sqrt(1 / MIN_RELATIVE_INTENSITY - 1));
  assert.ok(Math.abs(emitted(thin.sample) / whole - expected) < 1e-3, `share ${emitted(thin.sample) / whole} vs ${expected}`);
});

test('a fainter emission spot glows fainter', () => {
  const { drawables } = lensBench({ active: 2 });
  const color = wavelengthToColor(560);
  const byOrigin = new Map();
  for (const d of drawables) {
    if (d.type !== 'path' || d.color !== color || d.w !== 1.8) continue;
    const x = Number(d.pts[0].x.toFixed(3));
    byOrigin.set(x, Math.max(byOrigin.get(x) || 0, d.opacity));
  }
  const brightest = Math.max(...byOrigin.values());
  assert.ok(byOrigin.size > 1 && [...byOrigin.values()].some(v => v < brightest / 10), 'weak spots are drawn faintly');
});

// Two synchronised trains, pump 800 nm and Stokes 1040 nm, the Stokes
// chopped. A first specimen transfers the modulation onto the pump by SRS;
// a second one, layered, behind a lens makes two-photon fluorescence.
function srsThenTpef({ srs = true } = {}) {
  const laser = (wl, y, beamMode) => {
    const l = createElement('pulsedlaser', 0, y);
    Object.assign(l.params, { wavelength: wl, temporalMode: 'pulsed', repRateMHz: 40, pulseWidthFs: 200, beamMode, beamWidth: 4 });
    return l;
  };
  const chopper = createElement('chopper', 80, 6);
  Object.assign(chopper.params, { modulate: true, frequencyHz: 1e7, diameter: 10 });
  const first = createElement('sample', 140, 0);
  first.rot = 90;
  Object.assign(first.params, {
    aperture: 40, specimenType: 'nonlinear', activeThickness: 1, transmitExc: true, transmission: 1,
    channels: srs ? [{ ...newSampleChannel('srs'), transferEff: 0.3, requireOverlap: false }] : [],
  });
  const lens = createElement('lens', 180, 0);
  lens.params.f = 80;
  const second = createElement('sample', 260, 0);
  second.rot = 90;
  Object.assign(second.params, {
    aperture: 40, sampleLayout: 'cuvette', activeThickness: 20, specimenType: 'nonlinear', transmitExc: true, transmission: 0.9,
    channels: [{ ...newSampleChannel('tpef'), eff: 0.2, autoWl: false, wl: 560 }],
  });
  const { drawables } = traceScene([laser(800, -6, 'beam'), laser(1040, 6, 'line'), chopper, first, lens, second]);
  return { first, second, drawables };
}

test('after a stimulated Raman specimen, the next specimen still finds its beam and focus', () => {
  // Andrea (#261): the modulation the first specimen adds changed the beam's
  // identity, so the second lost its focus and the beam's summed power.
  const plain = srsThenTpef({ srs: false });
  const plainPower = emitted(plain.second);
  const plainOrigins = emissionOrigins(plain.drawables);
  const gated = srsThenTpef();
  assert.ok(specimenIncidentBeams(gated.first.id).some(b => b.wl === 1040 && b.gates.length), 'the Stokes is modulated');
  assert.ok(plainPower > 0);
  assert.ok(Math.abs(emitted(gated.second) - plainPower) < 1e-9 * Math.max(1, plainPower), 'same power with the transfer');
  assert.deepEqual(emissionOrigins(gated.drawables), plainOrigins);
  assert.ok(plainOrigins.length >= 1 && plainOrigins.every(x => Math.abs(x - 260) <= 2.5), `near the focus: ${plainOrigins}`);
});

test('the focus readout names each beam that focuses inside, and only those', () => {
  // Andrea (#261): a focused pump and a collimated Stokes beam. The readout
  // speaks for the pump, which drives the two-photon signal.
  const pump = createElement('pulsedlaser', 0, 0);
  Object.assign(pump.params, { wavelength: 800, beamMode: 'beam', beamWidth: 10, avgPowerW: 0.5 });
  const lens = createElement('lens', 100, 0);
  lens.params.f = 100;
  // Off to the side and aimed at the specimen, clear of the pump.
  const stokes = createElement('pulsedlaser', 120, 30);
  stokes.rot = Math.atan2(-27, 80) * 180 / Math.PI;
  Object.assign(stokes.params, { wavelength: 1030, beamMode: 'beam', beamWidth: 4 });
  const sample = createElement('sample', 200, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 40, sampleLayout: 'cuvette', activeThickness: 20, specimenType: 'nonlinear',
    channels: [{ ...newSampleChannel('tpef'), eff: 0.2, autoWl: false, wl: 560 }],
  });
  const { drawables } = traceScene([pump, lens, stokes, sample]);
  const readings = specimenFocusReading(sample.id);
  assert.equal(readings.length, 2);
  const text = specimenFocusReadout(readings);
  assert.match(text, /^800 nm: 10 mm into the active layer · zR /);
  assert.doesNotMatch(text, /1030/);
  const origins = emissionOrigins(drawables);
  assert.ok(origins.includes(200), `spots ${origins}`);
  assert.ok(origins.every(x => Math.abs(x - 200) <= 2.5), `spots ${origins}`);
});

test('the sample layout comes first in the specimen\'s controls', () => {
  for (const type of ['sample', 'stage']) {
    const keys = registry[type].params.map(p => p.key);
    assert.ok(keys.indexOf('sampleLayout') < keys.indexOf('specimenType'));
    assert.ok(keys.indexOf('activeThickness') < keys.indexOf('channels'));
  }
});

test('fluorescence driven through a diffuser is not drawn as speckle', () => {
  // Incoherent light does not speckle, however speckled its pump -- including
  // the part the objective collects and sends back.
  const { drawables } = objectiveBench({ kind: 'tpef', diffuser: true });
  const color = wavelengthToColor(560);
  assert.ok(drawables.some(d => d.type === 'dots'), 'the pump is speckle');
  assert.equal(drawables.filter(d => d.type === 'dots' && d.color === color).length, 0);
  assert.ok(drawables.some(d => d.color === color), 'the fluorescence is drawn');
});

// Emitted power of fans launched along a straight line through `through`,
// heading `way`: a huge circle tangent to that line catches the half of every
// fan on one side.
const emittedAlong = (through, way, wl = 560) => {
  const n = { x: -way.y, y: way.x };
  return probeBeamsAt(through.x + n.x * 1e6, through.y + n.y * 1e6, 1e6 - 1e-6)
    .filter(b => Math.abs(b.wl - wl) < 0.5).reduce((sum, b) => sum + b.power, 0);
};

function obliqueBench({ rot = 45, from = { x: 150, y: -25 }, active = 20 } = {}) {
  const laser = createElement('cwlaser', from.x, from.y);
  laser.rot = rot;
  Object.assign(laser.params, { wavelength: 488, beamMode: 'line' });
  const sample = createElement('sample', 200, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 40, activeThickness: active, specimenType: 'linear',
    channels: [{ ...newSampleChannel('fluor'), eff: 0.1, autoWl: false, wl: 560 }],
  });
  const { drawables } = traceScene([laser, sample]);
  return { sample, drawables };
}

test('a ray crossing the active layer through a side generates along its real path', () => {
  // Andrea (#261): y = x - 175 crosses a 20 mm active layer centred at
  // (200, 0) from (190, 15) to (195, 20): 7.07 mm, in through a face and
  // out through a side, never crossing the mid-line.
  const { sample, drawables } = obliqueBench();
  assert.equal(specimenIncidentBeams(sample.id).length, 1, 'the crossing is seen');
  const color = wavelengthToColor(560);
  const spots = [...new Set(drawables.filter(d => d.type === 'path' && d.color === color && d.w === 1.8)
    .map(d => `${d.pts[0].x.toFixed(4)},${d.pts[0].y.toFixed(4)}`))]
    .map(k => k.split(',').map(Number))
    .filter(([x, y]) => Math.abs(y - (x - 175)) < 1e-6);
  assert.ok(spots.length >= 1);
  for (const [x, y] of spots) assert.ok(x >= 190 - 1e-9 && x <= 195 + 1e-9 && y <= 20 + 1e-9, `spot (${x}, ${y}) inside the layer`);
  const way = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  const oblique = emittedAlong({ x: 192.5, y: 17.5 }, way);
  // The same 7.07 mm at normal incidence emits the same: 1 - 0.9^7.07.
  const straight = obliqueBench({ rot: 0, from: { x: 120, y: 0 }, active: 5 * Math.SQRT2 });
  const reference = emittedAlong({ x: 200, y: 0 }, { x: 1, y: 0 });
  assert.ok(reference > 0 && Math.abs(oblique / reference - 1) < 1e-9, `oblique ${oblique}, straight ${reference}`);
  assert.ok(straight.sample);
});

test('light coming back off a mirror crosses the specimen again', () => {
  // Andrea (#261): an ideal mirror keeps the ray's branch, so the returning
  // light looked as if it were still inside the specimen.
  const bench = refl => {
    const laser = createElement('cwlaser', 100, 0);
    Object.assign(laser.params, { wavelength: 488, beamMode: 'line' });
    const sample = createElement('sample', 200, 0);
    sample.rot = 90;
    Object.assign(sample.params, {
      aperture: 40, activeThickness: 1, specimenType: 'linear', transmitExc: true, transmission: 0.8,
      channels: [{ ...newSampleChannel('fluor'), eff: 0.1, autoWl: false, wl: 560 }],
    });
    const elements = [laser, sample];
    if (refl !== null) {
      const mirror = createElement('mirror', 300, 0);
      Object.assign(mirror.params, { refl, length: 2 });
      elements.push(mirror);
    }
    traceScene(elements);
    return emitted(sample);
  };
  const once = bench(null);
  assert.ok(once > 0);
  for (const refl of [100, 99.99]) {
    const twice = bench(refl);
    // Back through the specimen with 0.8 of the beam: 0.1 + 0.08 = 0.18.
    assert.ok(Math.abs(twice / once - (1 + 0.8 * refl / 100)) < 1e-6, `R ${refl}%: ${twice / once}`);
  }
});

test('light generated away from the hit is timed from where it is generated', () => {
  // Andrea (#261): a collimated pulse through a 20 mm THG layer. The
  // harmonic leaves from the exit face, so behind the specimen it has the
  // same path as the pump.
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { wavelength: 800, beamMode: 'line', temporalMode: 'pulsed', repRateMHz: 80, pulseWidthFs: 100 });
  const sample = createElement('sample', 200, 0);
  sample.rot = 90;
  Object.assign(sample.params, {
    aperture: 40, activeThickness: 20, specimenType: 'nonlinear', transmitExc: true, transmission: 1,
    channels: [{ ...newSampleChannel('thg'), eff: 0.2 }],
  });
  traceScene([laser, sample]);
  const beams = probeBeamsAt(280, 0, 2);
  const pump = beams.find(b => Math.abs(b.wl - 800) < 1), thg = beams.find(b => Math.abs(b.wl - 800 / 3) < 1);
  assert.ok(pump && thg);
  assert.ok(Math.abs(thg.oplMm - pump.oplMm) < 1e-9, `THG ${thg.oplMm} mm, pump ${pump.oplMm} mm`);
});

test('a very wide cone is one beam, however far apart its edge rays point', () => {
  // Andrea (#261): a 25 mm beam focused by an f = 10 mm lens has edge rays
  // more than 90° apart; they still cross the specimen from the same side.
  const bench = lens => {
    const laser = createElement('pulsedlaser', 0, 0);
    Object.assign(laser.params, { wavelength: 920, beamMode: 'beam', beamWidth: 25 });
    const elements = [laser];
    if (lens) {
      const l = createElement('lens', 100, 0);
      Object.assign(l.params, { f: 10, dia: 40 });
      elements.push(l);
    }
    const sample = createElement('sample', 110, 0);
    sample.rot = 90;
    Object.assign(sample.params, {
      activeThickness: 0.1, specimenType: 'nonlinear',
      channels: [{ ...newSampleChannel('tpef'), eff: 0.2, autoWl: false, wl: 560 }],
    });
    elements.push(sample);
    traceScene(elements);
    return { sample, power: emitted(sample) };
  };
  const cone = bench(true);
  assert.equal(specimenIncidentBeams(cone.sample.id).length, 1, 'one beam record');
  const readings = specimenFocusReading(cone.sample.id);
  assert.equal(readings.length, 1);
  assert.ok(readings[0].inside);
  // The layer holds the whole focal region: the full efficiency, as for the
  // same beam unfocused.
  const flat = bench(false);
  assert.ok(Math.abs(cone.power / flat.power - 1) < 1e-9, `cone ${cone.power}, flat ${flat.power}`);
});

test('a tilted specimen near a wide focus is still crossed by one beam', () => {
  // Andrea (#261): tilted 45° at the apex of a wide cone, one beam crosses
  // the layer from both sides; it is still one crossing.
  const bench = (x, y) => {
    const laser = createElement('pulsedlaser', 0, 0);
    Object.assign(laser.params, { wavelength: 920, beamMode: 'beam', beamWidth: 25 });
    const lens = createElement('lens', 100, 0);
    Object.assign(lens.params, { f: 10, dia: 40 });
    const sample = createElement('sample', x, y);
    sample.rot = 45;
    Object.assign(sample.params, {
      aperture: 10, activeThickness: 0.1, specimenType: 'nonlinear',
      channels: [{ ...newSampleChannel('tpef'), eff: 0.2, autoWl: false, wl: 560 }],
    });
    const { drawables } = traceScene([laser, lens, sample]);
    return { sample, drawables };
  };
  const centred = bench(110, 0);
  assert.equal(specimenIncidentBeams(centred.sample.id).length, 1, 'one beam record');
  const [reading] = specimenFocusReading(centred.sample.id);
  assert.ok(reading.ok && reading.inside && reading.zRMm < 0.001, `zR ${reading.zRMm}`);
  // Moved 0.1 mm along its normal, every crossing is beyond the cutoff
  // (about 15 µm here): nothing is generated.
  const moved = bench(110 - 0.1 * Math.SQRT1_2, 0.1 * Math.SQRT1_2);
  assert.equal(specimenIncidentBeams(moved.sample.id).length, 1);
  assert.deepEqual(emissionOrigins(moved.drawables), []);
});

test('the example: fluorescence sampled every 0.5 mm through the focus, two-photon only at it', async () => {
  const { readFile } = await import('node:fs/promises');
  const text = await readFile(new URL('../Examples/Microscopy Implementations/Optical sectioning — linear versus nonlinear.json', import.meta.url), 'utf8');
  const scene = parseSketch(text, registry);
  const { drawables } = traceScene(scene.elements, scene.beams);
  for (const sample of scene.elements.filter(e => e.type === 'sample')) {
    const [focus] = specimenFocusReading(sample.id).filter(r => r.ok && r.inside);
    assert.ok(focus, `${sample.params.specimenType}: focused inside`);
    // Fan origins on the beam's axis through the focus, drawn at least a
    // tenth as bright as the brightest.
    const spots = new Map();
    for (const d of drawables) {
      if (d.type !== 'path' || d.w !== 1.8 || Math.abs(d.pts[0].y - focus.point.y) > 1e-6) continue;
      const x = Number(d.pts[0].x.toFixed(6));
      const spot = spots.get(x) || { n: 0, opacity: 0 };
      spot.n++;
      spot.opacity = Math.max(spot.opacity, d.opacity);
      spots.set(x, spot);
    }
    const fans = [...spots].filter(([, s]) => s.n >= 10);
    const brightest = Math.max(...fans.map(([, s]) => s.opacity));
    const xs = fans.filter(([, s]) => s.opacity >= brightest / 10).map(([x]) => x).sort((a, b) => a - b);
    assert.ok(xs.some(x => Math.abs(x - focus.point.x) < 1e-6), `${sample.params.specimenType}: a spot at the focus, ${xs}`);
    if (sample.params.specimenType === 'linear') {
      assert.ok(xs.length >= 10, `along the 6 mm layer: ${xs}`);
      for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] <= 0.5 + 1e-9);
    } else {
      assert.deepEqual(xs.map(x => Number(x.toFixed(6))), [Number(focus.point.x.toFixed(6))]);
    }
  }
});
