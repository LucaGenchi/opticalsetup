// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The Fundamentals examples do what their pages say: each scene is traced as
// shipped, then with each control its page (tools/examples-content.mjs) tells
// the reader to change, from the state the page says to start from (most
// changes start from the setup as it opens; where a page chains two changes,
// so does the test). A step that moves one of these readings has to revise
// the page that quotes it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registry, objectImageReadout } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import { parseSketch } from '../sketch/js/state.js';
import { traceScene, objectImageReading } from '../sketch/js/raytrace.js';
import { enhancedReading } from '../sketch/js/detector-measurements.js';
import { glassIndex } from '../sketch/js/glass.js';
import { zoomFoci } from '../sketch/js/zoom-focus.js';
import { formatLength } from '../sketch/js/zoom.js';

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
const degrees = radians => radians * 180 / Math.PI;
const spread = values => Math.max(...values) - Math.min(...values);
const middle = values => (Math.max(...values) + Math.min(...values)) / 2;

// Where each traced ray crosses the plane at `x`: its height `y` there and the
// direction `deg` of the stretch that crosses it. `pick` chooses the rays.
function crossings(traced, x, pick = () => true) {
  const found = [];
  for (const ray of traced.paths) {
    if (!pick(ray)) continue;
    for (let i = 0; i < ray.pts.length - 1; i++) {
      const a = ray.pts[i], b = ray.pts[i + 1];
      if (Math.abs(b.x - a.x) > 1e-9 && (a.x - x) * (b.x - x) <= 0) {
        found.push({ y: a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x), deg: degrees(Math.atan2(b.y - a.y, b.x - a.x)), wl: ray.wl });
        break;
      }
    }
  }
  return found;
}

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

test('imaging with one lens: the rays from the tip cross 300 mm behind the lens, 15 mm below the axis', async () => {
  const { traced, get } = await run('Imaging with one lens');
  const axis = get('lens').y, image = get('lens').x + 300;
  assert.equal(get('lens').x - get('object').x, 150);
  assert.equal(traced.paths.length, 5);
  // The Object is centred on the axis: its tip is half its height above it.
  for (const ray of traced.paths) close(Math.hypot(ray.pts[0].x - get('object').x, ray.pts[0].y - (axis - 7.5)), 1, 1e-9, 'ray start');
  for (const { y } of crossings(traced, image)) close(y, axis + 15, 1e-9, 'tip image');
  // The screen's face stands 1.5 mm behind the image, where the rays end.
  for (const ray of traced.paths) close(ray.pts.at(-1).x, image + 1.5, 1e-9, 'screen');
});

test('beam expanders: both pairs give a collimated 12 mm beam, and defocus shows as their pages say', async () => {
  const NAME = 'Beam expanders — Keplerian and Galilean';
  const shipped = await run(NAME);
  for (const id of ['camK', 'camG']) {
    const r = shipped.reading(id);
    close(r.spotSpan, 12, 1e-9, id);
    assert.equal(r.wavefront.state, 'COLLIMATED');
    close(r.wavefront.divergenceDeg, 0, 1e-9, id);
  }
  // 200 mm and 100 mm between the lenses; the Keplerian focus 50 mm after the first.
  assert.equal(shipped.get('k2').x - shipped.get('k1').x, 200);
  assert.equal(shipped.get('g2').x - shipped.get('g1').x, 100);
  const axisK = shipped.get('k1').y;
  const focus = crossings(shipped.traced, shipped.get('k1').x + 50, ray => Math.abs(ray.pts[0].y - axisK) < 20);
  assert.equal(focus.length, 25);
  for (const { y } of focus) close(y, axisK, 1e-9, 'Keplerian focus');
  // A reading belongs to the last trace, so each one is read before the next.
  for (const [shift, state] of [[10, 'CONVERGING'], [-10, 'DIVERGING']]) {
    const moved = await run(NAME, get => { get('k2').x += shift; get('g2').x += shift; });
    for (const id of ['camK', 'camG']) {
      assert.equal(moved.reading(id).wavefront.state, state);
      close(moved.reading(id).wavefront.divergenceDeg, 0.31, 0.005, id);
    }
  }
  // From the setup as it opens again, as the page says.
  const sixfold = await run(NAME, get => { get('k1').params.f = 25; get('k2').x -= 25; });
  assert.equal(sixfold.get('k2').x - sixfold.get('k1').x, 175);
  close(sixfold.reading('camK').spotSpan, 24, 1e-9);
  assert.equal(sixfold.reading('camK').wavefront.state, 'COLLIMATED');
});

test('total internal reflection: both prisms return the light, less the set face transmission', async () => {
  const NAME = 'Total internal reflection — right-angle prism';
  const shipped = await run(NAME);
  close(shipped.watts('meterA'), 0.9216 * mW, 1e-9);
  close(shipped.watts('meterB'), 0.9216 * mW, 1e-9);
  // N-BK7 at 633 nm, from the app's glass catalogue: n = 1.515, critical angle 41.3°.
  const n = glassIndex(shipped.get('prismA').params.material, 633);
  close(n, 1.515, 0.0005);
  close(degrees(Math.asin(1 / n)), 41.3, 0.05);
  // The lower beam enters 9 mm above the middle of the prism and returns 18 mm lower.
  const laserB = shipped.get('laserB');
  assert.equal(shipped.get('prismB').y - laserB.y, 9);
  const returned = shipped.traced.paths.map(ray => ray.pts.at(-1)).filter(end => end.y > 400 && end.x < 200);
  assert.equal(returned.length, 25);
  close(middle(returned.map(end => end.y)), laserB.y + 18, 1e-9);
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

test('pinhole spatial filter: the gap passes the beam on the axis and stops the light at 6°', async () => {
  const NAME = 'Pinhole spatial filter';
  const shipped = await run(NAME);
  close(shipped.watts('meter'), 10 * mW, 1e-12);
  close(shipped.reading('meter').spotSpan, 8, 1e-9);
  // The light at 6° ends on the plate, 50 mm × tan 6° = 5.3 mm from the gap's centre.
  const pinhole = shipped.get('pinhole');
  const onPlate = shipped.traced.paths.map(ray => ray.pts.at(-1)).filter(end => Math.abs(end.x - pinhole.x) < 1e-6);
  assert.equal(onPlate.length, 25);
  for (const end of onPlate) close(Math.abs(end.y - pinhole.y), 5.26, 0.005, 'stray focus');
  const gap = async mm => (await run(NAME, get => { get('pinhole').params.gap = mm; })).watts('meter');
  close(await gap(10), 10 * mW, 1e-12);
  close(await gap(11), 11 * mW, 1e-12);
  // Gap back at 0.5 mm, pinhole to the side.
  assert.equal((await run(NAME, get => { get('pinhole').y += 0.3; })).watts('meter'), 0);
  // Pinhole back on the axis, moved along it.
  const along = async mm => (await run(NAME, get => { get('pinhole').x += mm; })).watts('meter');
  close(await along(6), 10 * mW, 1e-12);
  close(await along(10), 6 * mW, 1e-12);
  // 10 mm past the focus the beam is 0.8 mm wide.
  const opened = await run(NAME, get => { get('pinhole').x += 10; get('pinhole').params.gap = 25; });
  const beam = crossings(opened.traced, opened.get('pinhole').x, ray => ray.pts[0].x < 0 && Math.abs(ray.pts[0].y - pinhole.y) < 3);
  assert.equal(beam.length, 25);
  close(spread(beam.map(c => c.y)), 0.8, 1e-9);
});

test('Fourier-plane filtering: the mask decides how many of the five orders reach the output plane', async () => {
  const NAME = 'Spatial filtering in the Fourier plane — 4f system';
  close((await run(NAME)).watts('meter'), 3 * mW, 1e-12);
  const gap = async mm => (await run(NAME, get => { get('mask').params.gap = mm; })).watts('meter');
  close(await gap(6), 1 * mW, 1e-12);
  close(await gap(7), 3 * mW, 1e-12);
  close(await gap(12), 3 * mW, 1e-12);
  close(await gap(13), 5 * mW, 1e-12);
  // Mask back at 8 mm.
  const finer = await run(NAME, get => { get('grating').params.lines = 100; });
  close(finer.watts('meter'), 1 * mW, 1e-12);
});

test('Fourier-plane filtering: the orders leave at 1.81° and 3.63° and focus 3.17 and 6.34 mm from the axis', async () => {
  const NAME = 'Spatial filtering in the Fourier plane — 4f system';
  const sorted = values => [...new Set(values.map(v => v.toFixed(2)))].map(Number).sort((a, b) => a - b);
  const open = await run(NAME, get => { get('mask').params.gap = 50; });
  const grating = open.get('grating'), mask = open.get('mask');
  assert.equal(mask.x - grating.x, 200);
  assert.deepEqual(sorted(crossings(open.traced, grating.x + 50).map(c => c.deg)), [-3.63, -1.81, 0, 1.81, 3.63]);
  assert.deepEqual(sorted(crossings(open.traced, mask.x).map(c => c.y - mask.y)), [-6.34, -3.17, 0, 3.17, 6.34]);
  // At 100 lines per millimetre the first orders land where the second ones did.
  const finer = await run(NAME, get => { get('mask').params.gap = 50; get('grating').params.lines = 100; });
  assert.deepEqual(sorted(crossings(finer.traced, mask.x).map(c => c.y - mask.y)), [-12.76, -6.34, 0, 6.34, 12.76]);
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
  // The page's table is one change at a time; two together do not add.
  close(await microwatts((get, fiber) => { get('laser').params.beamWidth = 4; fiber.inputNA = 0.08; }), 440, 1e-6);
});

test('fiber coupling: the enlarged view prints a 2.23 µm waist, and 0.5° on mirror 2 moves the beam 2 mm on the lens', async () => {
  const NAME = 'Coupling a laser into a single-mode fiber';
  const shipped = await run(NAME);
  const foci = zoomFoci(shipped.get('zoom'), shipped.traced.paths);
  assert.equal(foci.length, 1);
  assert.equal(formatLength(foci[0].w0Mm), '2.23 µm');
  close(foci[0].na, 0.09, 0.005);
  const turned = await run(NAME, get => { get('m2').rot += 0.5; });
  const lens = turned.get('lens');
  const onLens = crossings(turned.traced, lens.x - 1e-6).filter(c => Math.abs(c.y - lens.y) < lens.params.dia / 2);
  assert.equal(onLens.length, 25);
  close(Math.abs(middle(onLens.map(c => c.y)) - lens.y), 2.09, 0.005);
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

test('scan relay: 2° on the mirror is 1° at the pupil and 0.17 mm at the focus; 50 mm off the conjugate plane it is 0.9 mm across the pupil', async () => {
  const NAME = 'Scan lens and tube lens — galvo to back pupil';
  const still = (get, angle) => Object.assign(get('galvo').params, { scanMode: 'static', commandAngle: angle });
  // The beam just before the plane 200 mm after the tube lens, less `closer`.
  const atPupil = (r, closer = 0) => {
    const axis = r.get('objective').y;
    return crossings(r.traced, r.get('tube').x + 200 - closer - 1e-6).filter(c => Math.abs(c.y - axis) < 30)
      .map(c => ({ y: c.y - axis, deg: c.deg }));
  };
  const rest = await run(NAME, get => still(get, 0));
  close(spread(atPupil(rest).map(c => c.y)), 7.2, 1e-6);
  const tilted = await run(NAME, get => still(get, 2));
  const beam = atPupil(tilted);
  assert.equal(beam.length, 25);
  for (const { deg } of beam) close(Math.abs(deg), 1, 0.005, 'tilt at the pupil');
  close(middle(beam.map(c => c.y)), 0, 1e-6, 'centred on the pupil');
  const axis = tilted.get('objective').y;
  const [focus] = zoomFoci(tilted.get('zoom'), tilted.traced.paths);
  close(Math.abs(focus.point.y - axis), 0.17, 0.005);
  const [atRest] = zoomFoci(rest.get('zoom'), rest.traced.paths);
  close(atRest.point.y, axis, 1e-6);
  const moved = await run(NAME, get => { still(get, 2); get('objective').x -= 50; });
  close(Math.abs(middle(atPupil(moved, 50).map(c => c.y))), 0.87, 0.005);
});

test('Czerny–Turner: each grating rotation on the page brings its own mercury line through the exit slit', async () => {
  const NAME = 'Czerny–Turner monochromator';
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

test('Czerny–Turner: slits 198 mm from the mirrors, 8.4 nm per millimetre at the exit slit, each line passing over 0.15°', async () => {
  const NAME = 'Czerny–Turner monochromator';
  const shipped = await run(NAME);
  const between = (a, b) => Math.hypot(shipped.get(a).x - shipped.get(b).x, shipped.get(a).y - shipped.get(b).y);
  // (R/2) cos θ for f = 200 mm used at θ = 8°: the focus in the plane of the drawing.
  close(between('entrance', 'm1'), 200 * Math.cos(8 * Math.PI / 180), 1e-6);
  close(between('exit', 'm2'), 198.05, 0.005);
  close(between('m1', 'grating'), 190, 1e-6);
  close(between('m2', 'grating'), 190, 1e-6);
  // The yellow pair in the plane of the exit slit, with the slit opened wide.
  const wide = await run(NAME, get => { get('grating').rot = 190.40; get('exit').params.gap = 45; });
  const exit = wide.get('exit');
  const landing = nm => {
    const ys = crossings(wide.traced, exit.x, ray => Math.abs(ray.wl - nm) < 0.01).map(c => c.y).filter(y => Math.abs(y - exit.y) < 25);
    assert.ok(ys.length > 0, `${nm} nm reaches the exit plane`);
    return ys.reduce((sum, y) => sum + y, 0) / ys.length;
  };
  const apart = Math.abs(landing(579.07) - landing(576.96));
  close(apart, 0.25, 0.005);
  close((579.07 - 576.96) / apart, 8.4, 0.05);
  // The green line passes from 189.74° to 189.88°, and not 0.02° beyond either end.
  const green = async rot => (await run(NAME, get => { get('grating').rot = rot; })).reading('detector');
  for (const rot of [189.74, 189.81, 189.88]) close((await green(rot)).wavelength, 546.074, 1e-6, `at ${rot}°`);
  for (const rot of [189.72, 189.90]) assert.equal(await green(rot), null, `at ${rot}°`);
});

test('Czerny–Turner: an 8 mm exit slit lets the yellow pair through beside the green line', async () => {
  const r = (await run('Czerny–Turner monochromator', get => { get('exit').params.gap = 8; })).reading('detector');
  close(r.bandMin, 546.074, 1e-6);
  close(r.bandMax, 579.07, 1e-6);
  close(r.signal, 1.8 / 4.1, 1e-9);
});
