// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Step G2 of the Physics in 2D track: the beam envelope, the 1/e² radius
// w(z) of the propagated Gaussian beam (step G1) drawn about the central ray
// as an option per source (docs/physics/beam-propagation.md, "Drawing the
// beam"). The band must be the beam the readouts report, end on the optics
// as the rays do, leave no light undrawn where the beam is declined, and be
// the same in the canvas and every export.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { traceScene, beamAtPoint } from '../sketch/js/raytrace.js';
import { envelopeEdges, envelopeBand, WAIST_MARK_MIN_MM, RAYLEIGH_MARK_MIN_MM } from '../sketch/js/beam-envelope.js';
import { beamDisplayOf } from '../sketch/js/beam-propagation.js';
import { beamFromQ, qFromWaist } from '../sketch/js/gaussian-beam.js';
import { zoomFoci } from '../sketch/js/zoom-focus.js';
import { zoomSceneSVG } from '../sketch/js/zoom-view.js';
import { parseSketch, state } from '../sketch/js/state.js';
import { buildSVG } from '../sketch/js/export.js';

const make = (type, x, y, params = {}, rot = 0) => {
  const el = createElement(type, x, y);
  Object.assign(el.params, params);
  el.rot = rot;
  return el;
};
const laser = (params = {}) => make('cwlaser', 0, 0, { beamMode: 'beam', beamWidth: 2, wavelength: 633, ...params });
const close = (a, b, tol, label = '') => assert.ok(Math.abs(a - b) <= tol, `${label} ${a} vs ${b}`);
const types = drawables => drawables.reduce((n, d) => ({ ...n, [d.type]: (n[d.type] || 0) + 1 }), {});
const ys = pts => pts.map(p => p.y);
// The band's fill: the polygons the envelope adds are the only ones with
// many points (the rays' fill is made of quadrilaterals).
const bands = drawables => drawables.filter(d => d.type === 'poly' && d.pts.length > 8);
// Two-point strokes across the beam: the waist and Rayleigh-range marks.
const marks = drawables => drawables.filter(d => d.type === 'path' && d.pts.length === 2 && Math.abs(d.pts[0].x - d.pts[1].x) < 1e-9);

test('G2: the envelope curve is w0·√(1 + (z/zR)²), with exact ends', () => {
  const edges = envelopeEdges({ point: { x: 10, y: 5 }, axis: { x: 1, y: 0 }, w0Mm: 0.02, zRMm: 2 }, -6, 4, 40);
  assert.equal(edges.left.length, 41);
  close(edges.left[0].x, 4, 1e-12, 'starts at from');
  close(edges.left.at(-1).x, 14, 1e-12, 'ends at to');
  for (const [l, r] of edges.left.map((p, i) => [p, edges.right[i]])) {
    const z = l.x - 10, w = 0.02 * Math.sqrt(1 + (z / 2) ** 2);
    close(l.y - 5, w, 1e-12, `left at z = ${z}`);
    close(5 - r.y, w, 1e-12, `right at z = ${z}`);
  }
  // Samples crowd near the waist, where the curve bends.
  const wide = envelopeEdges({ point: { x: 10, y: 5 }, axis: { x: 1, y: 0 }, w0Mm: 0.02, zRMm: 2 }, -60, 40, 40);
  const gaps = wide.left.slice(1).map((p, i) => p.x - wide.left[i].x);
  assert.ok(Math.min(...gaps) < Math.max(...gaps) / 5);
  // Nothing to draw: an empty stretch, or no beam.
  assert.equal(envelopeEdges({ point: { x: 0, y: 0 }, axis: { x: 1, y: 0 }, w0Mm: 0.02, zRMm: 2 }, 1, 1), null);
  assert.equal(envelopeEdges({ point: { x: 0, y: 0 }, axis: { x: 1, y: 0 }, w0Mm: 0, zRMm: 2 }, 0, 1), null);
  assert.equal(envelopeEdges({ point: { x: 0, y: 0 }, axis: { x: 1, y: 0 }, w0Mm: 0.02, zRMm: NaN }, 0, 1), null);
});

test('G2: a band ends on a tilted face along it, and square to the beam where the face grazes', () => {
  const shape = beamFromQ(qFromWaist({ waistUm: 1000, wavelengthNm: 633 }), { wavelengthNm: 633 });
  const t = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  const band = envelopeBand({ start: { x: 0, y: 0 }, d: { x: 1, y: 0 }, length: 100, shape, faces: [null, { at: { x: 100, y: 0 }, t }] });
  // Both edges end on the 45° face through (100, 0): y = x − 100.
  for (const side of [band.left, band.right]) {
    const end = side.at(-1);
    close(end.y, end.x - 100, 1e-9, 'edge ends on the face');
    close(Math.abs(end.y), 1, 1e-3, 'at the 1/e² radius');
  }
  // The start is square to the beam.
  close(band.left[0].x, 0, 1e-12);
  close(band.right[0].x, 0, 1e-12);
  // A face met at grazing incidence would stretch the cut far along the
  // beam: the band is cut square there instead.
  const grazing = envelopeBand({ start: { x: 0, y: 0 }, d: { x: 1, y: 0 }, length: 100, shape, faces: [null, { at: { x: 100, y: 0 }, t: { x: 1, y: 0.05 } }] });
  close(grazing.left.at(-1).x, 100, 1e-12);
  close(grazing.right.at(-1).x, 100, 1e-12);
  // Nothing finite to draw, nothing drawn.
  assert.equal(envelopeBand({ start: { x: 0, y: 0 }, d: { x: 1, y: 0 }, length: 0, shape }), null);
  assert.equal(envelopeBand({ start: { x: NaN, y: 0 }, d: { x: 1, y: 0 }, length: 10, shape }), null);
  assert.equal(envelopeBand({ start: { x: 0, y: 0 }, d: { x: 1, y: 0 }, length: 10, shape: null }), null);
});

test('G2: the waist mark sits on the waist, the Rayleigh marks one Rayleigh range either side', () => {
  // A 20 µm waist 50 mm along a 100 mm stretch; z_R = π w0² / λ.
  const q = qFromWaist({ waistUm: 20, wavelengthNm: 633, zMm: -50 });
  const shape = beamFromQ(q, { wavelengthNm: 633 });
  close(shape.waistAheadMm, 50, 1e-9);
  const band = envelopeBand({ start: { x: 0, y: 0 }, d: { x: 1, y: 0 }, length: 100, shape, rayleigh: true });
  close(band.waist.at, 50, 1e-9, 'waist');
  // A 20 µm waist is far below what the bench shows: the mark keeps its
  // minimum reach either side of the axis.
  close(band.waist.pts[0].y, WAIST_MARK_MIN_MM, 1e-12);
  assert.deepEqual(band.rayleigh.map(m => Number(m.at.toFixed(6))), [Number((50 - shape.rayleighMm).toFixed(6)), Number((50 + shape.rayleighMm).toFixed(6))]);
  close(band.rayleigh[0].pts[0].y, RAYLEIGH_MARK_MIN_MM, 1e-12);
  // A waist beyond the stretch is not marked; without the option no
  // Rayleigh marks are drawn.
  const before = envelopeBand({ start: { x: 0, y: 0 }, d: { x: 1, y: 0 }, length: 40, shape });
  assert.equal(before.waist, null);
  assert.deepEqual(before.rayleigh, []);
  // A wide waist is marked a little beyond the band.
  const wide = envelopeBand({ start: { x: 0, y: 0 }, d: { x: 1, y: 0 }, length: 10, shape: beamFromQ(qFromWaist({ waistUm: 2000, wavelengthNm: 633 }), { wavelengthNm: 633 }) });
  close(wide.waist.pts[0].y, 3.2, 1e-9);
});

test('G2: rays stay the default, and an unset or unknown choice draws exactly what was drawn before', () => {
  const scene = display => [laser(display === undefined ? {} : { beamDisplay: display }), make('lens', 200, 0, { f: 100 }), make('detector', 400, 0)];
  const before = traceScene(scene(undefined), []).drawables;
  assert.equal(createElement('cwlaser', 0, 0).params.beamDisplay, 'rays');
  assert.deepEqual(traceScene(scene('rays'), []).drawables, before);
  assert.equal(bands(before).length, 0);
  assert.ok(before.every(d => !('beamRoute' in d)), 'no bookkeeping leaks into the drawables');
  // A saved setup opens unchanged: without the setting, or with a value it
  // does not know, a source is drawn as rays.
  const opened = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, elements: [{ id: 'a', type: 'cwlaser', x: 0, y: 0, rot: 0, params: { beamMode: 'beam', beamDisplay: 'halo', beamRayleighTicks: 'yes' } }], beams: [] }), registry);
  assert.equal(opened.elements[0].params.beamDisplay, 'rays');
  assert.equal(opened.elements[0].params.beamRayleighTicks, false);
  assert.equal(beamDisplayOf(opened.elements[0]), 'rays');
  // A laser drawn as a simple line has no beam to draw, whatever is set.
  assert.equal(beamDisplayOf({ type: 'cwlaser', params: { beamMode: 'line', beamDisplay: 'envelope' } }), 'rays');
  assert.equal(beamDisplayOf({ type: 'ledsource', params: { beamMode: 'beam', beamDisplay: 'envelope' } }), 'rays');
});

test('G2: the choice is offered only for a source drawn with a size, the Rayleigh marks only with the band', () => {
  for (const type of ['cwlaser', 'pulsedlaser', 'sclaser']) {
    const params = registry[type].params;
    const display = params.find(p => p.key === 'beamDisplay');
    const ticks = params.find(p => p.key === 'beamRayleighTicks');
    assert.deepEqual(display.options.map(([value]) => value), ['rays', 'envelope', 'both'], type);
    // In the collapsed Gaussian beam section.
    assert.ok(params.indexOf(display) > params.findIndex(p => p.key === 'beamHeading'), type);
    assert.equal(display.show({ beamMode: 'line' }), false);
    assert.equal(display.show({ beamMode: 'beam' }), true);
    assert.equal(ticks.show({ beamMode: 'beam', beamDisplay: 'rays' }), false);
    assert.equal(ticks.show({ beamMode: 'beam', beamDisplay: 'envelope' }), true);
    assert.equal(ticks.show({ beamMode: 'beam', beamDisplay: 'both' }), true);
  }
});

test('G2: in collimated space the band lies on the outermost rays', () => {
  // A 4 mm beam at 633 nm: z_R = 19.9 m, so over 300 mm it stays 2 mm wide.
  const scene = display => [laser({ beamWidth: 4, beamDisplay: display }), make('detector', 400, 0)];
  const both = traceScene(scene('both'), []).drawables;
  const outlines = both.filter(d => d.type === 'path' && !d.dash && d.pts.length === 2 && d.pts[0].x !== d.pts[1].x);
  const edges = both.filter(d => d.type === 'path' && d.dash === '5 3');
  assert.equal(edges.length, 2, 'both edges, dashed over the rays');
  const rayEdge = Math.max(...outlines.flatMap(d => ys(d.pts)));
  close(rayEdge, 2, 1e-9, 'outermost ray');
  close(Math.max(...edges.flatMap(d => ys(d.pts))), 2, 0.001, 'band edge');
  close(Math.min(...edges.flatMap(d => ys(d.pts))), -2, 0.001, 'band edge');
  // The envelope alone replaces the rays' fill with one band.
  const envelope = traceScene(scene('envelope'), []).drawables;
  assert.deepEqual(types(envelope), { poly: 1, path: 3 }, 'band, two edges and the waist mark at the output');
  close(Math.max(...ys(bands(envelope)[0].pts)), 2, 0.001);
});

test('G2: near a focus the band narrows to the waist the probe reads, where the probe puts it', () => {
  // 3 mm at 532 nm into f = 100 mm: w0 ≈ λf/(πw) = 11.3 µm.
  const elements = [laser({ beamWidth: 3, wavelength: 532, beamDisplay: 'envelope', beamRayleighTicks: true }), make('lens', 252, 0, { f: 100 }), make('detector', 552, 0)];
  const { drawables } = traceScene(elements, []);
  const [reading] = beamAtPoint(300, 0, 1);
  const waistX = 300 + reading.waistAheadMm;
  const [after] = bands(drawables).filter(b => Math.min(...b.pts.map(p => p.x)) > 251);
  // The narrowest point of the band is the waist, to the sampling.
  const half = after.pts.length / 2;
  const widths = after.pts.slice(0, half).map((p, i) => ({ x: p.x, w: p.y - after.pts[after.pts.length - 1 - i].y }));
  const narrowest = widths.reduce((a, b) => (b.w < a.w ? b : a));
  close(narrowest.w / 2 * 1000, reading.waistUm, reading.waistUm * 0.02, 'waist width');
  close(narrowest.x, waistX, reading.rayleighMm * 0.3, 'waist position');
  // The waist mark is exactly there, and the Rayleigh marks one Rayleigh
  // range either side.
  const xs = marks(drawables).map(m => m.pts[0].x).sort((a, b) => a - b);
  const inside = xs.filter(x => x > 260);
  assert.equal(inside.length, 3, JSON.stringify(xs));
  close(inside[1], waistX, 1e-6, 'waist mark');
  close(inside[0], waistX - reading.rayleighMm, 1e-6, 'Rayleigh mark');
  close(inside[2], waistX + reading.rayleighMm, 1e-6, 'Rayleigh mark');
  close(reading.waistUm, 532e-6 * 100 / (Math.PI * 1.5) * 1000, 0.05, 'q law');
});

test('G2: a narrow beam\'s band is narrowest where the beam focuses, not where its rays cross', () => {
  // G1's case: 0.1 mm at 633 nm, 148 mm before an f = 100 mm lens. The rays
  // cross at the focal point, the beam's waist is 295 mm past the lens.
  const elements = [make('cwlaser', 0, 0, { beamMode: 'beam', beamWidth: 0.1, wavelength: 633, beamDisplay: 'envelope' }), make('lens', 200, 0, { f: 100 }), make('detector', 800, 0, { aperture: 30 })];
  const { drawables } = traceScene(elements, []);
  const waists = marks(drawables).map(m => m.pts[0].x).filter(x => x > 200);
  assert.equal(waists.length, 1);
  close(waists[0] - 200, 295, 2, 'waist past the lens');
});

test('G2: bands meet along a tilted mirror and follow each branch of a splitter', () => {
  const folded = traceScene([laser({ beamWidth: 4, beamDisplay: 'envelope' }), make('mirror', 200, 0, {}, -45)], []).drawables;
  const [incoming, reflected] = bands(folded);
  // The mirror is the line y = x − 200; the incoming band's far end and the
  // reflected band's near end lie on it, at the same two points.
  const onMirror = band => band.pts.filter(p => Math.abs(p.y - (p.x - 200)) < 1e-6);
  const a = onMirror(incoming), b = onMirror(reflected);
  assert.equal(a.length, 2, JSON.stringify(a));
  assert.equal(b.length, 2, JSON.stringify(b));
  // To 0.1 µm: the two bands' widths there come from matrices measured on
  // either side of the mirror.
  const key = p => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
  assert.deepEqual(a.map(key).sort(), b.map(key).sort());
  const split = traceScene([laser({ beamDisplay: 'envelope' }), make('bs', 200, 0)], []).drawables;
  assert.equal(bands(split).length, 3, 'before the splitter and on each branch');
});

test('G2: where the beam is declined the rays stay drawn, so no light disappears', () => {
  // Past a diffuser the light is drawn as before; the band ends on it.
  const diffused = traceScene([laser({ beamDisplay: 'envelope' }), make('diffuser', 200, 0)], []).drawables;
  assert.equal(bands(diffused).length, 1);
  assert.ok(bands(diffused)[0].pts.every(p => p.x <= 200 + 1e-6));
  const plain = traceScene([laser(), make('diffuser', 200, 0)], []).drawables;
  // (A diffuser's speckle is redrawn at random on every trace: compare how
  // much of it there is.)
  assert.equal(diffused.filter(d => d.type === 'dots').length, plain.filter(d => d.type === 'dots').length);
  // An edge 1.2 mm from a 2 mm beam's axis clips it part-way along the
  // stretch: the band's edges stop there, dashed over the rays, which are
  // kept on the whole stretch.
  const scene = display => [laser({ beamDisplay: display }), make('blocker', 200, 31.2, { w: 16, h: 60 }), make('detector', 400, 0)];
  const clipped = traceScene(scene('envelope'), []).drawables;
  const rays = traceScene(scene('rays'), []).drawables;
  assert.equal(bands(clipped).length, 0, 'no fill where the beam is clipped');
  assert.equal(clipped.filter(d => d.type === 'poly').length, rays.filter(d => d.type === 'poly').length, 'the rays\' fill stays');
  const edges = clipped.filter(d => d.dash === '5 3');
  assert.equal(edges.length, 2);
  const end = Math.max(...edges.flatMap(d => d.pts.map(p => p.x)));
  assert.ok(end > 150 && end < 192, `the band stops before the block: ${end}`);
  // An interferometer's dark port carries no light, and no band.
  const mz = [laser({ beamDisplay: 'envelope' }), make('bs', 200, 0), make('bs', 300, 0), make('bs', 200, -100), make('bs', 300, -100), make('detector', 420, -100)];
  const lit = traceScene(mz, []).drawables;
  // The unused output travels up through x = 300 (G1's dark-port case).
  assert.ok(!bands(lit).some(b => b.pts.some(p => p.y < -150 && Math.abs(p.x - 300) < 3)), 'nothing on the unused output');
  assert.equal(beamAtPoint(300, -300, 5).length, 0);
});

test('G2: a zoom over a band does not draw the waist again, and keeps its note', () => {
  const zoom = make('zoom', 352, 0, { w: 10, h: 10, diffraction: true });
  const scene = display => [laser({ beamWidth: 3, wavelength: 532, beamDisplay: display }), make('lens', 252, 0, { f: 100 }), zoom];
  for (const display of ['rays', 'envelope']) {
    const traced = traceScene(scene(display), []);
    const [focus] = zoomFoci(zoom, traced.paths);
    assert.equal(focus.model, 'propagated');
    assert.equal(focus.drawnAsEnvelope, display === 'envelope', display);
    const svg = zoomSceneSVG(zoom, { drawables: traced.drawables, paths: traced.paths, elements: scene(display) });
    assert.equal(/data-zoom-focus="true"/.test(svg), display === 'rays', display);
    assert.match(svg, /w₀ /, display);
  }
});

test('G2: the export draws the same band as the canvas', () => {
  state.elements = [laser({ beamWidth: 3, wavelength: 532, beamDisplay: 'envelope' }), make('lens', 252, 0, { f: 100 })];
  state.beams = [];
  const { drawables } = traceScene(state.elements, []);
  const svg = buildSVG({ bounds: { x: -10, y: -20, w: 500, h: 40 } });
  const band = bands(drawables)[0];
  // Written to 10 nm, so a micron waist's edges stay apart.
  const first = `${band.pts[0].x.toFixed(5)},${band.pts[0].y.toFixed(5)}`;
  assert.ok(svg.includes(first), 'the band polygon is in the export');
  assert.equal([...svg.matchAll(/<polygon /g)].length >= bands(drawables).length, true);
});

test('G2: light a fiber relaunches is drawn as its source was set to draw it', () => {
  // A hollow-core capillary relaunches an 80 µm beam (G1's case); the laser
  // that sends light in is set to draw its envelope.
  const sketch = display => parseSketch(JSON.stringify({ version: 1, elements: [
    { id: 'L', type: 'cwlaser', x: 0, y: 0, rot: 0, params: { beamMode: 'beam', beamWidth: 2, wavelength: 1000, beamDisplay: display } },
    { id: 'lens', type: 'lens', x: 150, y: 0, rot: 0, params: { f: 100 } },
    { id: 'D', type: 'detector', x: 700, y: 0, rot: 0, params: {} },
  ], beams: [{ id: 'F', kind: 'fiber', pts: [{ x: 250, y: 0 }, { x: 400, y: 0 }], propagate: true, inputNA: 0.12, out1: { mode: 'diverge', na: 0.05 }, out0: { mode: 'diverge', na: 0.05 }, fiberModel: 'argon', coreDiameterUm: 250 }] }), registry);
  const drawn = display => {
    const { elements, beams } = sketch(display);
    return bands(traceScene(elements, beams).drawables);
  };
  const envelope = drawn('envelope');
  // Before the lens, between the lens and the fiber, and past the fiber.
  assert.ok(envelope.some(b => b.pts.every(p => p.x >= 400 - 1e-6)), 'a band past the fiber');
  assert.equal(drawn('rays').length, 0);
  // A fiber that relaunches no beam keeps its rays. Its relaunched rays
  // start a route history of their own, like the laser's: the envelope
  // before the fiber must not take their fill away (the bundled fiber
  // coupling example lost its output rays this way).
  const noMode = display => {
    const { elements, beams } = parseSketch(JSON.stringify({ version: 1, elements: [
      { id: 'L', type: 'cwlaser', x: 0, y: 0, rot: 0, params: { beamMode: 'beam', beamWidth: 2, wavelength: 1000, beamDisplay: display } },
      { id: 'lens', type: 'lens', x: 150, y: 0, rot: 0, params: { f: 100 } },
    ], beams: [{ id: 'F', kind: 'fiber', pts: [{ x: 250, y: 0 }, { x: 400, y: 0 }], propagate: true, inputNA: 0.12, out1: { mode: 'diverge', na: 0.05 }, out0: { mode: 'diverge', na: 0.05 } }] }), registry);
    return traceScene(elements, beams).drawables.filter(d => d.type === 'poly' && d.pts.every(p => p.x >= 400 - 1e-6)).length;
  };
  assert.ok(noMode('rays') > 0);
  assert.equal(noMode('envelope'), noMode('rays'));
});

// Andrea's review of the first version (PR #334, round 1).
test('G2 (review): light that goes round what stops the central ray stays drawn', () => {
  // A 10 mm beam and a centred blocker 4 mm across: 16 of 25 rays pass it.
  const scene = display => [laser({ beamWidth: 10, beamDisplay: display }), make('blocker', 200, 0, { w: 16, h: 4 }), make('detector', 400, 0, { aperture: 30 })];
  traceScene(scene('rays'), []);
  const plain = traceScene(scene('rays'), []).drawables;
  const enveloped = traceScene(scene('envelope'), []).drawables;
  const past = ds => ds.filter(d => d.type === 'poly' && d.pts.some(p => p.x > 210));
  assert.ok(past(plain).length > 0);
  assert.equal(past(enveloped).length, past(plain).length, 'every strip that reaches past the blocker is kept');
  // The blocker's rim clips the beam where it ends: the band is drawn as
  // edges over the rays, not filled.
  assert.equal(bands(enveloped).length, 0);
  assert.ok(enveloped.some(d => d.dash === '5 3'));
});

test('G2 (review): arms that recombine get no band, as the readouts say', () => {
  const mz = display => [laser({ beamDisplay: display }), make('bs', 200, 0), make('bs', 300, 0), make('bs', 200, -100), make('bs', 300, -100), make('detector', 420, -100)];
  const drawn = traceScene(mz('envelope'), []).drawables;
  const onOutput = ds => ds.filter(d => d.type === 'poly' && d.pts.every(p => p.x > 305 && Math.abs(p.y + 100) < 5));
  assert.equal(bands(onOutput(drawn)).length, 0, 'no band on the lit output');
  assert.equal(onOutput(drawn).length, onOutput(traceScene(mz('rays'), []).drawables).length, 'its rays are drawn');
  const [read] = beamAtPoint(360, -100, 5);
  assert.match(read.issue.reason, /recombine/);
  // Before they meet, each arm has its band.
  assert.ok(bands(drawn).length >= 3);
});

test('G2 (review): an edge that clips a converging beam part-way is found where the beam is wide', () => {
  // A 10 mm beam into an f = 100 mm lens at x = 200; a blocker's corner sits
  // 4 mm from the axis at x = 215, where the beam is still 3.5 mm in radius,
  // but 1.5 mm from its waist region it would clear.
  const scene = [laser({ beamWidth: 10, wavelength: 633, beamDisplay: 'envelope' }), make('lens', 200, 0, { f: 100, dia: 25.4 }),
    make('blocker', 220, 34, { w: 10, h: 60 }), make('detector', 400, 0, { aperture: 40 })];
  const { drawables } = traceScene(scene, []);
  const [at] = beamAtPoint(230, 0, 1);
  assert.match(at.issue?.reason || '', /clips the beam/, JSON.stringify(at));
  const edges = drawables.filter(d => d.dash === '5 3' && d.pts.every(p => p.x >= 199));
  assert.equal(edges.length, 2);
  const end = Math.max(...edges.flatMap(d => d.pts.map(p => p.x)));
  assert.ok(end < 216, `the band stops where the clearance runs out: ${end}`);
  assert.equal(bands(drawables).filter(b => b.pts.some(p => p.x > 201)).length, 0, 'no fill on the clipped stretch');
});

test('G2 (review): a widening band reaches a leaning mirror along both edges', () => {
  // 0.1 mm at 633 nm with M² = 25 spreads fast; a mirror at −60° 100 mm on.
  const { drawables } = traceScene([make('cwlaser', 0, 0, { beamMode: 'beam', beamWidth: 0.1, wavelength: 633, beamM2: 25, beamDisplay: 'envelope' }),
    make('mirror', 152, 0, { length: 100 }, -60)], []);
  const [incoming] = bands(drawables);
  // The mirror's line through (152, 0) at −60° to the vertical.
  const t = { x: Math.cos((-60 + 90) * Math.PI / 180), y: Math.sin((-60 + 90) * Math.PI / 180) };
  const offLine = p => Math.abs((p.x - 152) * t.y - p.y * t.x);
  // One edge meets the mirror before the central hit, the other 21 mm
  // beyond it, where the beam is a third wider than at the hit.
  const onMirror = incoming.pts.filter(p => offLine(p) < 1e-6);
  assert.equal(onMirror.length, 2, 'both edges end on the mirror');
  assert.ok(onMirror.some(p => p.x > 170) && onMirror.some(p => p.x < 140), JSON.stringify(onMirror));
});

test('G2 (review): an edge past the waist leaves the zoom its propagated waist', () => {
  const zoom = make('zoom', 311, 0, { w: 10, h: 10, diffraction: true });
  const scene = [laser({ beamWidth: 0.4, wavelength: 633, beamDisplay: 'envelope' }), make('lens', 200, 0, { f: 100 }),
    make('blocker', 600, 31.2, { w: 16, h: 60 }), zoom];
  const traced = traceScene(scene, []);
  const [focus] = zoomFoci(zoom, traced.paths);
  assert.equal(focus.model, 'propagated');
  close(focus.point.x, 311.51, 0.05, 'the propagated waist');
  assert.equal(focus.drawnAsEnvelope, true);
  assert.ok(!/data-zoom-focus="true"/.test(zoomSceneSVG(zoom, { drawables: traced.drawables, paths: traced.paths, elements: scene })));
});

test('G2 (review): an exported micron waist keeps its two edges apart', () => {
  state.elements = [laser({ beamWidth: 10, wavelength: 532, beamDisplay: 'envelope' }), make('lens', 200, 0, { f: 100 })];
  state.beams = [];
  const svg = buildSVG({ bounds: { x: 290, y: -5, w: 20, h: 10 } });
  const polygons = [...svg.matchAll(/<polygon points="([^"]+)"/g)].map(m => m[1].split(' ').map(pair => pair.split(',').map(Number)));
  const band = polygons.find(pts => pts.length > 50 && pts.some(([x]) => Math.abs(x - 300) < 0.05));
  assert.ok(band, 'the band is exported');
  const nearWaist = band.filter(([x]) => Math.abs(x - 300) < 0.05);
  assert.ok(nearWaist.length >= 2);
  assert.ok(nearWaist.every(([, y]) => Math.abs(y) > 1e-3), JSON.stringify(nearWaist));
});
