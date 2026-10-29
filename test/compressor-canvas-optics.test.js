// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The optics a dispersion compensator needs on the canvas. Prism faces
// transmit by Fresnel at their real angle and polarization
// (docs/physics/prism-fresnel.md); gratings keep a set diffraction
// efficiency per order; CaF₂ is a canvas glass; a D-shaped mirror reflects
// one chosen pass of each beam and lets the other go by.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, registry } from '../sketch/js/elements.js';
import { readFileSync } from 'node:fs';
import { traceScene, traceAll, detectorReading, probeAt } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { glassIndex, GLASS_OPTIONS } from '../sketch/js/glass.js';
import { fresnelTransmittances, throughFace } from '../sketch/js/fresnel.js';
import { linearStokes } from '../sketch/js/polarization.js';

const D2R = Math.PI / 180;

// An N-SF10 prism cut and turned for Brewster's angle at 800 nm, at minimum
// deviation, with a detector across the deviated beam.
function brewsterPrism(pol) {
  const n = glassIndex('nsf10', 800);
  const theta = Math.atan(n) / D2R, apex = 180 - 2 * theta, dev = 2 * theta - apex;
  const laser = createElement('cwlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'line', wavelength: 800, pol });
  const prism = createElement('prism', 200, 0);
  prism.rot = theta - apex / 2;
  Object.assign(prism.params, { material: 'nsf10', apex, psize: 25.4 });
  // The beam meets the prism's left face; aim the detector along the
  // deviated direction from roughly where it leaves.
  const det = createElement('detector', 200 + 300 * Math.cos(dev * D2R), 300 * Math.sin(dev * D2R));
  det.rot = dev;
  det.params.aperture = 120;
  return { laser, prism, det, n, theta };
}

test('a Brewster prism passes p-polarized light whole and s-polarized light at Fresnel loss', () => {
  const p = brewsterPrism(0);
  traceScene([p.laser, p.prism, p.det]);
  const pSignal = detectorReading(p.det.id).signal;
  const s = brewsterPrism(90);
  traceScene([s.laser, s.prism, s.det]);
  const sSignal = detectorReading(s.det.id).signal;
  // Both faces at Brewster: T_s from air into glass and back out are equal.
  const face = fresnelTransmittances(1, s.n, Math.cos(s.theta * D2R));
  assert.ok(Math.abs(face.Tp - 1) < 1e-6, `T_p ${face.Tp}`);
  assert.ok(Math.abs(pSignal - 1) < 1e-3, `p through two Brewster faces: ${pSignal}`);
  assert.ok(Math.abs(sSignal - face.Ts ** 2) < 2e-3, `s: ${sSignal} against ${face.Ts ** 2}`);
});

test('linear light at 45 degrees loses the mean and turns toward p, segment by segment', () => {
  const p = brewsterPrism(45);
  traceScene([p.laser, p.prism, p.det]);
  const reading = detectorReading(p.det.id);
  const face = fresnelTransmittances(1, p.n, Math.cos(p.theta * D2R));
  const first = throughFace(linearStokes(45), face);
  const second = throughFace(first.stokes, face);
  assert.ok(Math.abs(reading.signal - first.T * second.T) < 2e-3, `${reading.signal} against ${first.T * second.T}`);
  // A probe before the prism still reads 45°; one after reads the turned state.
  const before = probeAt(100, 0);
  assert.ok(Math.abs(before.stokes.s2 - 1) < 1e-9, `before: ${JSON.stringify(before.stokes)}`);
  const angle = Math.atan2(p.det.y, p.det.x - 200);
  const after = probeAt(200 + 150 * Math.cos(angle), 150 * Math.sin(angle));
  assert.ok(Math.abs(after.stokes.s1 - second.stokes.s1) < 1e-6, `after: ${JSON.stringify(after.stokes)}`);
  assert.ok(after.stokes.s1 > 0, 'turned toward p');
});

test('a grating order keeps its set diffraction efficiency', () => {
  const read = efficiency => {
    const laser = createElement('cwlaser', 0, 0);
    Object.assign(laser.params, { beamMode: 'line', wavelength: 800 });
    const grating = createElement('grating', 200, 0);
    Object.assign(grating.params, { lines: 600, orders: '1', ...(efficiency ? { efficiency } : {}) });
    const angle = Math.atan2(2880, -5264);
    const det = createElement('detector', 200 + 300 * Math.cos(angle), 300 * Math.sin(angle));
    det.rot = angle / D2R;
    det.params.aperture = 60;
    traceScene([laser, grating, det]);
    return detectorReading(det.id)?.signal ?? 0;
  };
  const full = read(null);
  assert.ok(full > 0.99, `default keeps the whole order: ${full}`);
  assert.ok(Math.abs(read(80) - 0.8 * full) < 1e-9);
  assert.equal(registry.grating.params.find(p => p.key === 'efficiency').def, 100);
});

test('CaF₂ is a canvas glass with its published index', () => {
  assert.ok(GLASS_OPTIONS.some(([id]) => id === 'caf2'));
  // Malitson (1963): nd = 1.43385.
  assert.ok(Math.abs(glassIndex('caf2', 587.6) - 1.43385) < 2e-5);
});

const mkOptic = (type, x, y, rot, params = {}) => Object.assign(createElement(type, x, y), { rot, params: { ...createElement(type).params, ...params } });

// The D-shaped mirror at (230, 180), turned so the beam from the laser would
// leave upward and a beam coming back from the right leaves downward.
function pickoffScene(reflectsOn) {
  const laser = mkOptic('cwlaser', 40, 180, 0, { wavelength: 633, beamMode: 'line' });
  const pickoff = mkOptic('dmirror', 230, 180, 45, { length: 12.7, reflectsOn });
  return { laser, pickoff };
}

test('a D-shaped mirror set to the second pass lets the beam go by and picks off its return', () => {
  const { laser, pickoff } = pickoffScene('second');
  assert.equal(createElement('dmirror').params.reflectsOn, 'second');
  // An end mirror at normal incidence sends the beam back along its own line,
  // as a vertically displaced return looks in a top view.
  const end = mkOptic('mirror', 460, 180, 0);
  const below = mkOptic('detector', 230, 320, 90, { aperture: 26 });
  const above = mkOptic('detector', 230, 60, -90, { aperture: 26 });
  traceScene([laser, pickoff, end, below, above]);
  assert.ok(Math.abs(detectorReading(below.id).signal - 1) < 1e-9, 'the whole return is picked off');
  assert.equal(detectorReading(above.id), null, 'the outgoing beam is not reflected');
  // The pass that goes by is lossless even when the coating is not.
  pickoff.params.refl = 80;
  traceScene([laser, pickoff, end, below, above]);
  assert.ok(Math.abs(detectorReading(below.id).signal - 0.8) < 1e-9);
});

test('a D-shaped mirror set to the first pass reflects the beam and lets its return go by', () => {
  const { laser, pickoff } = pickoffScene('first');
  const end = mkOptic('mirror', 230, 60, 90);
  const below = mkOptic('detector', 230, 320, 90, { aperture: 26 });
  const right = mkOptic('detector', 460, 180, 0, { aperture: 26 });
  traceScene([laser, pickoff, end, below, right]);
  assert.ok(Math.abs(detectorReading(below.id).signal - 1) < 1e-9, 'the return goes by to the detector below');
  assert.equal(detectorReading(right.id), null, 'nothing goes on past the mirror on the first pass');
});

test('a D-shaped mirror counts only hits on its face, so an in-plane return is a first pass', () => {
  // Beside the incoming beam, the mirror never meets it: the return, displaced
  // sideways by a roof reflector, is the first beam to land on the face.
  const laser = mkOptic('cwlaser', 40, 180, 0, { wavelength: 633, beamMode: 'line' });
  const pickoff = mkOptic('dmirror', 230, 203, 45, { length: 12.7, reflectsOn: 'first' });
  const roof = mkOptic('retroreflector', 460, 190, 0, { length: 50.8 });
  const det = mkOptic('detector', 230, 320, 90, { aperture: 26 });
  traceScene([laser, pickoff, roof, det]);
  assert.ok(Math.abs(detectorReading(det.id).signal - 1) < 1e-9);
  pickoff.params.reflectsOn = 'second';
  traceScene([laser, pickoff, roof, det]);
  assert.equal(detectorReading(det.id), null, 'set to the second pass, the only hit goes by');
  assert.equal(registry.dmirror.category, 'Mirrors');
});

test('a D-shaped mirror treats every pass after the second as the second', () => {
  // Out, back from the end mirror and reflected down (pass 2), then round
  // three fold mirrors onto the face again from the left, 15 mm higher: the
  // third pass reflects, as the second did, up to the detector above.
  const { laser, pickoff } = pickoffScene('second');
  pickoff.params.length = 50.8;
  const end = mkOptic('mirror', 460, 180, 0);
  const foldA = mkOptic('mirror', 230, 300, 45, { length: 12.7 });
  const foldB = mkOptic('mirror', 150, 300, -45, { length: 12.7 });
  const foldC = mkOptic('mirror', 150, 165, 45, { length: 12.7 });
  const above = mkOptic('detector', 245, 60, -90, { aperture: 6 });
  traceScene([laser, pickoff, end, foldA, foldB, foldC, above]);
  assert.ok(Math.abs(detectorReading(above.id).signal - 1) < 1e-9, 'the third pass is reflected');
  pickoff.params.reflectsOn = 'first';
  traceScene([laser, pickoff, end, foldA, foldB, foldC, above]);
  assert.equal(detectorReading(above.id), null, 'set to the first pass, nothing comes back to the face');
});

test('a D-shaped mirror a beam goes by keeps its carrier phase', () => {
  // Across one arm of the bundled Mach-Zehnder, met once and so gone by: the
  // interferometer still puts all the light in its bright port.
  const readings = withMirror => {
    const scene = parseSketch(readFileSync('test/fixtures/mach-zehnder.json', 'utf8'));
    if (withMirror) scene.elements.push(mkOptic('dmirror', 520, 200, 0, { length: 25.4 }));
    traceAll(scene.elements);
    return scene.elements.filter(el => el.type === 'camera').map(camera => detectorReading(camera.id).signal);
  };
  const [bright, dark] = readings(true);
  const [plainBright, plainDark] = readings(false);
  assert.ok(Math.abs(bright - plainBright) < 1e-9 && Math.abs(dark - plainDark) < 1e-9,
    `${bright} / ${dark} with the mirror, ${plainBright} / ${plainDark} without`);
  assert.ok(Math.abs(bright - 1) < 1e-9);
});

test('a D-shaped mirror a point source\'s light goes by does not collect it', () => {
  // Out of range at the detector, the light fades whether or not it went by
  // a mirror on the way, under every catching rule.
  for (const catchMode of ['all', 'collectors', 'lensmirror']) {
    const signal = withMirror => {
      const source = mkOptic('pointsource', 0, 0, 0, { nrays: 4, captureRange: 165, catchMode });
      const det = mkOptic('detector', 500, 0, 0, { aperture: 26 });
      const elements = [source, det];
      if (withMirror) elements.push(mkOptic('dmirror', 100, 0, 0));
      traceAll(elements);
      return detectorReading(det.id)?.signal || 0;
    };
    assert.equal(signal(true), signal(false), `${catchMode}: going by the mirror changed the reading`);
  }
});

// Placed along the beam after the prism of brewsterPrism(): `distance` mm
// along the deviated ray, turned across it.
function afterPrism(setup, type, distance, params = {}) {
  const dev = Math.atan2(setup.det.y, setup.det.x - 200);
  const el = createElement(type, 200 + distance * Math.cos(dev), distance * Math.sin(dev));
  el.rot = dev / D2R;
  Object.assign(el.params, params);
  return el;
}

test('at the critical angle the grazing ray carries nothing, and the edge is continuous', () => {
  // N-BK7 at 435 nm, entering normally, meets the second face at exactly
  // the critical angle: Snell gives a grazing ray, Fresnel gives it zero.
  const laser = createElement('cwlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'line', wavelength: 435 });
  const prism = createElement('prism', 200, 0);
  Object.assign(prism, { rot: -20.458982519532874 });
  Object.assign(prism.params, { material: 'nbk7', apex: 40.91796503906575, psize: 25.4 });
  // The second face, from the apex to its base corner, in world coordinates.
  const h = 25.4, hb = h * Math.tan(prism.params.apex * D2R / 2), r = prism.rot * D2R;
  const world = (x, y) => ({ x: 200 + x * Math.cos(r) - y * Math.sin(r), y: x * Math.sin(r) + y * Math.cos(r) });
  const top = world(0, -h / 2), corner = world(hb, h / 2);
  const t = { x: corner.x - top.x, y: corner.y - top.y }, len = Math.hypot(t.x, t.y);
  const along = { x: t.x / len, y: t.y / len };
  const dir = along.x > 0 ? along : { x: -along.x, y: -along.y };
  // Where the beam (y = 0) meets that face, then 60 mm along it.
  const k = -top.y / t.y, exit = { x: top.x + k * t.x, y: 0 };
  const det = createElement('detector', exit.x + 79 * dir.x, exit.y + 79 * dir.y);
  det.rot = Math.atan2(dir.y, dir.x) / D2R;
  det.params.aperture = 80;
  traceScene([laser, prism, det]);
  assert.ok((detectorReading(det.id)?.signal ?? 0) < 1e-6, `grazing ray: ${detectorReading(det.id)?.signal}`);
  // Approaching the critical angle the transmission falls continuously to
  // zero (as the square root of the distance to it); past it, none.
  const n = glassIndex('nbk7', 435), critical = Math.asin(1 / n);
  const at = gap => fresnelTransmittances(n, 1, Math.cos(critical - gap));
  assert.ok(at(1e-2).Tp > at(1e-4).Tp && at(1e-4).Tp > at(1e-6).Tp && at(1e-6).Tp < 0.02,
    `${at(1e-2).Tp} > ${at(1e-4).Tp} > ${at(1e-6).Tp}`);
  assert.equal(fresnelTransmittances(n, 1, Math.cos(critical + 1e-6)), null);
});

test('light an EOM switches crosses the face state by state', () => {
  // p in, flipped to s half the time, through a Brewster N-SF10 prism: p
  // passes whole, s at T_s² over two faces. An analyzer on each state reads
  // what that state brought.
  const read = axis => {
    const setup = brewsterPrism(0);
    const eom = createElement('eom', 100, 0);
    Object.assign(eom.params, { modulate: true, driveMode: 'switching', switchMode: 'flip', switchDuty: 0.5 });
    const analyzer = afterPrism(setup, 'polarizer', 150, { pangle: axis });
    traceScene([setup.laser, eom, setup.prism, analyzer, setup.det]);
    return { signal: detectorReading(setup.det.id)?.signal ?? 0, setup };
  };
  const p = read(0), s = read(90);
  const face = fresnelTransmittances(1, p.setup.n, Math.cos(p.setup.theta * D2R));
  assert.ok(Math.abs(p.signal - 0.5) < 2e-3, `p analyzer: ${p.signal}`);
  assert.ok(Math.abs(s.signal - 0.5 * face.Ts ** 2) < 2e-3, `s analyzer: ${s.signal} against ${0.5 * face.Ts ** 2}`);
});

test('a probe after the prism names the state the faces left', () => {
  // Circular light through two Brewster faces is elliptical, no longer
  // circular; unpolarized light leaves partly p-polarized.
  const circular = brewsterPrism(0);
  const qwp = createElement('qwp', 100, 0);
  qwp.params.a = 45;
  traceScene([circular.laser, qwp, circular.prism, circular.det]);
  const dev = Math.atan2(circular.det.y, circular.det.x - 200);
  const probe = probeAt(200 + 150 * Math.cos(dev), 150 * Math.sin(dev));
  assert.equal(probe.pol, 'e');
  assert.ok(probe.stokes.s1 > 0.2 && Math.abs(probe.stokes.s3) > 0.9, JSON.stringify(probe.stokes));

  const led = createElement('ledsource', 0, 0);
  led.params.beamMode = 'line';
  const unpolarized = brewsterPrism(0);
  traceScene([led, unpolarized.prism, unpolarized.det]);
  const after = probeAt(200 + 150 * Math.cos(dev), 150 * Math.sin(dev));
  assert.ok(after.stokes && after.stokes.s1 > 0.1 && after.stokes.s1 < 0.6, JSON.stringify(after.stokes));
  // The probe element draws it as partly polarized, not as unpolarized.
  const probeEl = createElement('probe', 200 + 150 * Math.cos(dev), 150 * Math.sin(dev));
  probeEl.params.prop = 'pol';
  const drawn = registry.probe.svg(probeEl);
  assert.match(drawn, /% polarized · linear/);
  assert.doesNotMatch(drawn, />unpolarized</);
});
