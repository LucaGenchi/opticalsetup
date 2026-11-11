// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The Fundamentals examples do what their pages say: each scene is traced as
// shipped, then with each control its page (tools/examples-content.mjs) tells
// the reader to change. A step that moves one of these readings has to revise
// the page that quotes it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registry, objectImageReadout } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene, objectImageReading } from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';

const close = (actual, expected, tolerance, what = '') =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${what} ${actual} != ${expected} ± ${tolerance}`);

// Trace an example after optional edits. `get(id)` finds an element, `fiber`
// is the scene's first fiber. Returns the scene and a reader for its sensors.
async function run(name, edit = () => {}) {
  const path = new URL(`../Examples/Fundamentals/${name}.json`, import.meta.url);
  const scene = parseSketch(await readFile(path, 'utf8'), registry);
  const get = id => scene.elements.find(el => el.id === id);
  edit(get, scene.beams[0], scene);
  const traced = traceScene(scene.elements, scene.beams);
  for (const drawable of traced.drawables) {
    for (const point of drawable.pts || []) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  }
  const reading = id => enhancedReading(get(id), scene.elements);
  // Watts on a power meter; 0 when no light arrives.
  const watts = id => reading(id)?.detectedPowerW ?? 0;
  const readout = (id, key) => registry[get(id).type].params.find(p => p.key === key).readout(get(id).params, get(id));
  return { scene, traced, get, reading, watts, readout };
}

const mW = 1e-3;

test('imaging with one lens: the Object reads the thin-lens equation at every distance its page lists', async () => {
  const NAME = 'Imaging with one lens';
  const at = async dx => {
    await run(NAME, get => { get('object').x += dx; });
    return objectImageReadout(objectImageReading('object'));
  };
  assert.equal(await at(0), 'Image 300 mm after Lens · m = −2.00 · real, inverted');
  assert.equal(await at(-150), 'Image 150 mm after Lens · m = −0.50 · real, inverted');
  assert.equal(await at(-50), 'Image 200 mm after Lens · m = −1.00 · real, inverted');
  assert.equal(await at(25), 'Image 500 mm after Lens · m = −4.00 · real, inverted');
  assert.equal(await at(50), 'Image at infinity after Lens (collimated)');
  assert.equal(await at(90), 'Image 150 mm before Lens · m = 2.50 · virtual, upright');
});

test('beam expanders: both pairs give a collimated 12 mm beam, and defocus shows as their pages say', async () => {
  const NAME = 'Beam expanders — Keplerian and Galilean';
  const shipped = await run(NAME);
  for (const id of ['camK', 'camG']) {
    const r = shipped.reading(id);
    close(r.spotSpan, 12, 1e-9, id);
    assert.equal(r.wavefront.state, 'COLLIMATED');
  }
  // A reading belongs to the last trace, so each one is read before the next.
  for (const [shift, state] of [[10, 'CONVERGING'], [-10, 'DIVERGING']]) {
    const moved = await run(NAME, get => { get('k2').x += shift; get('g2').x += shift; });
    for (const id of ['camK', 'camG']) {
      assert.equal(moved.reading(id).wavefront.state, state);
      close(moved.reading(id).wavefront.divergenceDeg, 0.31, 0.005, id);
    }
  }
  const sixfold = await run(NAME, get => { get('k1').params.f = 25; get('k2').x -= 25; });
  close(sixfold.reading('camK').spotSpan, 24, 1e-9);
  assert.equal(sixfold.reading('camK').wavefront.state, 'COLLIMATED');
});

test('total internal reflection: both prisms return the light, less the set face transmission', async () => {
  const NAME = 'Total internal reflection — right-angle prism';
  const shipped = await run(NAME);
  close(shipped.watts('meterA'), 0.9216 * mW, 1e-9);
  close(shipped.watts('meterB'), 0.9216 * mW, 1e-9);
  const lossless = await run(NAME, get => { get('prismA').params.transEff = 100; get('prismB').params.transEff = 100; });
  close(lossless.watts('meterA'), 1 * mW, 1e-9);
  close(lossless.watts('meterB'), 1 * mW, 1e-9);
});

test('total internal reflection: the 90° turn fails below n = 1.414, the return past 5.6°', async () => {
  const NAME = 'Total internal reflection — right-angle prism';
  const index = n => run(NAME, get => { Object.assign(get('prismA').params, { material: 'constant', ior: n }); });
  close((await index(1.42)).watts('meterA'), 0.9216 * mW, 1e-9);
  assert.equal((await index(1.41)).watts('meterA'), 0);
  const turned = rot => run(NAME, get => { get('prismB').rot = rot; });
  for (const rot of [5.5, -5.5]) close((await turned(rot)).watts('meterB'), 0.9216 * mW, 1e-9, `at ${rot}°`);
  for (const rot of [5.7, -5.7]) assert.equal((await turned(rot)).watts('meterB'), 0, `at ${rot}°`);
});

test('law of Malus: the analyzer passes cos² θ of half the LED, the half-wave plate sin² 2a of the laser', async () => {
  const NAME = 'Law of Malus — polarizers and a half-wave plate';
  const shipped = await run(NAME);
  close(shipped.watts('meterA'), 0.375 * mW, 1e-12);
  assert.equal(shipped.reading('meterA').polarization, 'Linear 30°');
  close(shipped.watts('meterB'), 1 * mW, 1e-12);
  assert.equal(shipped.reading('meterB').polarization, 'Linear 90°');
  for (const [angle, microwatts] of [[0, 500], [45, 250], [60, 125], [90, 0]]) {
    const r = await run(NAME, get => { get('anaA').params.pangle = angle; });
    close(r.watts('meterA'), microwatts * 1e-6, 1e-12, `analyzer at ${angle}°`);
  }
  for (const [angle, microwatts] of [[0, 0], [22.5, 500], [30, 750]]) {
    const r = await run(NAME, get => { get('hwp').params.a = angle; });
    close(r.watts('meterB'), microwatts * 1e-6, 1e-12, `plate at ${angle}°`);
  }
});

// Where the centre of the beam crosses the plane of each iris, measured from
// the iris's centre, with both irises opened wide and the beam a single ray.
async function walkErrors(state) {
  const { scene, traced, get } = await run('Beam walking — two mirrors and two irises', find => {
    find('laser').params.beamMode = 'line';
    find('laser').rot = state.laser; find('m1').rot = state.m1; find('m2').rot = state.m2;
    for (const id of ['iris1', 'iris2']) find(id).params.gap = 25;
  });
  const axis = get('iris1').y;
  const at = x => {
    for (const drawable of traced.drawables) {
      const pts = drawable.pts || [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if ((a.x - x) * (b.x - x) <= 0 && Math.abs(b.x - a.x) > 1e-9 && Math.abs(a.y - axis) < 60) {
          return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x) - axis;
        }
      }
    }
    return NaN;
  };
  assert.ok(scene.elements.length > 0);
  return { iris1: at(get('iris1').x), iris2: at(get('iris2').x) };
}

// Turn one mirror until the beam is centred on one iris (secant method).
async function centre(state, mirror, iris) {
  let a = state[mirror], b = a + 0.05;
  let fa = (await walkErrors({ ...state, [mirror]: a }))[iris], fb = (await walkErrors({ ...state, [mirror]: b }))[iris];
  for (let i = 0; i < 40 && Math.abs(fb) > 1e-10; i++) {
    const c = b - fb * (b - a) / (fb - fa);
    a = b; fa = fb; b = c; fb = (await walkErrors({ ...state, [mirror]: b }))[iris];
  }
  return { ...state, [mirror]: b };
}

test('beam walking: the aligned setup passes, a 1° turn of the laser darkens it, the quoted mirror angles restore it', async () => {
  const NAME = 'Beam walking — two mirrors and two irises';
  close((await run(NAME)).watts('meter'), 1 * mW, 1e-12);
  assert.equal((await run(NAME, get => { get('laser').rot = 1; })).watts('meter'), 0);
  const walked = await run(NAME, get => { get('laser').rot = 1; get('m1').rot = 46.30; get('m2').rot = 45.80; });
  close(walked.watts('meter'), 1 * mW, 1e-12);
});

test('beam walking: each round leaves b(a+b+c)/((a+b)(b+c)) of the error, and the wrong pairing diverges', async () => {
  let state = { laser: 1, m1: 45, m2: 45 };
  const start = await walkErrors(state);
  close(Math.abs(start.iris1), 5.41, 0.005);
  close(Math.abs(start.iris2), 9.77, 0.005);
  const table = [[4.65, 0.78], [2.07, 0.34], [0.92, 0.15], [0.41, 0.07]];
  let previous = null;
  for (const [offIris2, offIris1] of table) {
    state = await centre(state, 'm1', 'iris1');
    const afterFirst = await walkErrors(state);
    state = await centre(state, 'm2', 'iris2');
    const afterSecond = await walkErrors(state);
    close(Math.abs(afterFirst.iris2), offIris2, 0.006);
    close(Math.abs(afterSecond.iris1), offIris1, 0.006);
    // a = 100, b = 50, c = 250 mm.
    if (previous !== null) close(Math.abs(afterFirst.iris2) / previous, 50 * 400 / (150 * 300), 0.002);
    previous = Math.abs(afterFirst.iris2);
  }
  for (let round = 0; round < 12; round++) {
    state = await centre(state, 'm1', 'iris1');
    state = await centre(state, 'm2', 'iris2');
  }
  close(state.m1, 46.30, 0.005);
  close(state.m2, 45.80, 0.005);
  // Mirror 2 for iris 1 first: the beam ends further from iris 2 than it started.
  const wrong = await walkErrors(await centre({ laser: 1, m1: 45, m2: 45 }, 'm2', 'iris1'));
  close(Math.abs(wrong.iris2), 22.8, 0.05);
});

test('pinhole spatial filter: the gap passes the beam on the axis and stops the light at 6°', async () => {
  const NAME = 'Pinhole spatial filter';
  const shipped = await run(NAME);
  close(shipped.watts('meter'), 10 * mW, 1e-12);
  close(shipped.reading('meter').spotSpan, 8, 1e-9);
  const gap = async mm => (await run(NAME, get => { get('pinhole').params.gap = mm; })).watts('meter');
  close(await gap(10), 10 * mW, 1e-12);
  close(await gap(11), 11 * mW, 1e-12);
  assert.equal((await run(NAME, get => { get('pinhole').y += 0.3; })).watts('meter'), 0);
  const along = async mm => (await run(NAME, get => { get('pinhole').x += mm; })).watts('meter');
  close(await along(6), 10 * mW, 1e-12);
  close(await along(10), 6 * mW, 1e-12);
});

test('Fourier-plane filtering: the mask decides how many of the five orders reach the output plane', async () => {
  const NAME = 'Spatial filtering in the Fourier plane — 4f system';
  close((await run(NAME)).watts('meter'), 3 * mW, 1e-12);
  const gap = async mm => (await run(NAME, get => { get('mask').params.gap = mm; })).watts('meter');
  close(await gap(6), 1 * mW, 1e-12);
  close(await gap(7), 3 * mW, 1e-12);
  close(await gap(12), 3 * mW, 1e-12);
  close(await gap(13), 5 * mW, 1e-12);
  const finer = await run(NAME, get => { get('grating').params.lines = 100; });
  close(finer.watts('meter'), 1 * mW, 1e-12);
});

test('fiber coupling: the reading is the count of rays inside the acceptance cone', async () => {
  const NAME = 'Coupling a laser into a single-mode fiber';
  const microwatts = async edit => (await run(NAME, edit)).watts('meter') * 1e6;
  close(await microwatts(), 1000, 1e-6);
  close(await microwatts(get => { get('lens').params.f = 4; }), 440, 1e-6);
  close(await microwatts(get => { get('laser').params.beamWidth = 4; }), 600, 1e-6);
  close(await microwatts((get, fiber) => { fiber.inputNA = 0.08; }), 840, 1e-6);
  close(await microwatts(get => { get('m2').rot += 0.5; }), 240, 1e-6);
  assert.equal(await microwatts(get => { get('m2').rot += 1; }), 0);
});

test('fiber coupling: the tracer has no core, so a focus off the centre or short of the face still couples', async () => {
  const NAME = 'Coupling a laser into a single-mode fiber';
  const back = await run(NAME, (get, fiber) => { fiber.pts[0].x += 3; });
  close(back.watts('meter'), 1 * mW, 1e-12);
  const aside = await run(NAME, (get, fiber) => { fiber.pts[0].y += 0.1; });
  close(aside.watts('meter'), 1 * mW, 1e-12);
});

test('scan relay: the beam stays in the back pupil at the conjugate plane and is cut away from it', async () => {
  const NAME = 'Scan lens and tube lens — galvo to back pupil';
  const fill = async (edit = () => {}) => (await run(NAME, edit)).readout('objective', 'pupilFill');
  const still = (get, angle) => Object.assign(get('galvo').params, { scanMode: 'static', commandAngle: angle });
  assert.match(await fill(), /^7\.6 \/ 8\.0 mm — 95% filled, all through$/);
  assert.match(await fill(get => still(get, 0)), /^7\.2 \/ 8\.0 mm — 90% filled, all through$/);
  assert.match(await fill(get => still(get, 2)), /^7\.6 \/ 8\.0 mm — 95% filled, all through$/);
  assert.match(await fill(get => { still(get, 2); get('objective').x -= 50; }), /^9\.0 \/ 8\.0 mm — overfilled, about 80% through/);
  assert.match(await fill(get => { still(get, 0); get('objective').x -= 50; }), /^7\.2 \/ 8\.0 mm — 90% filled, all through$/);
});

test('Czerny–Turner: each grating rotation on the page brings its own mercury line through the exit slit', async () => {
  const NAME = 'Czerny–Turner spectrometer';
  const TOTAL = 4.1; // the lamp's line weights, summed
  const shipped = await run(NAME);
  close(shipped.get('grating').rot, 189.81, 1e-9);
  close(shipped.reading('detector').wavelength, 546.074, 1e-6);
  close(shipped.reading('detector').signal, 1 / TOTAL, 1e-9);
  const table = [[186.54, 365.0146, 0.6], [187.26, 404.6561, 0.5], [187.82, 435.8343, 1], [198.45, 1013.98, 0.2]];
  for (const [rot, nm, weight] of table) {
    const r = (await run(NAME, get => { get('grating').rot = rot; })).reading('detector');
    close(r.bandMin, nm, 1e-6, `at ${rot}°`);
    close(r.bandMax, nm, 1e-6, `at ${rot}°`);
    close(r.signal, weight / TOTAL, 1e-9, `at ${rot}°`);
  }
  // The yellow pair is 2.1 nm apart and passes the 1 mm slit together.
  const yellow = (await run(NAME, get => { get('grating').rot = 190.40; })).reading('detector');
  close(yellow.bandMin, 576.96, 1e-6);
  close(yellow.bandMax, 579.07, 1e-6);
  close(yellow.signal, 0.8 / TOTAL, 1e-9);
  // Away from every line's angle the detector is dark.
  assert.equal((await run(NAME, get => { get('grating').rot = 189.0; })).reading('detector'), null);
});

test('Czerny–Turner: an 8 mm exit slit lets the yellow pair through beside the green line', async () => {
  const r = (await run('Czerny–Turner spectrometer', get => { get('exit').params.gap = 8; })).reading('detector');
  close(r.bandMin, 546.074, 1e-6);
  close(r.bandMax, 579.07, 1e-6);
  close(r.signal, 1.8 / 4.1, 1e-9);
});
