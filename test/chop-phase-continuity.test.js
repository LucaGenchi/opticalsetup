import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from '../sketch/js/elements.js';
import { traceScene } from '../sketch/js/raytrace.js';

// A chopped beam is drawn as a pattern cut where the beam is gated -- at the
// chopper or the AOM -- which then has to run unbroken downstream. Every optic
// the beam crosses afterwards starts a new ray, and each ray used to restart
// the pattern at its own first point: with an optic 25 mm past the AOM the
// chunks ran 150-157, 164-171 and then 175-182 instead of 178-185, a 4 mm
// gap and a phase jump at every element.
const PERIOD = 14;
const ON = 7;
const AOM_X = 150;
const HALF_WIDTH = 3;

function scene({ gate = 'aom', zero = false, downstream = [['filter', 25]] } = {}) {
  const laser = createElement('cwlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'beam', beamWidth: 2 * HALF_WIDTH });
  const gateEl = createElement(gate, AOM_X, 0);
  if (gate === 'aom') {
    Object.assign(gateEl.params, {
      modulate: true, modShape: 'square', chopDuty: 0.5, eff: 1, drawChopped: true,
      zero, deflect: zero ? 20 : 0,
    });
  } else {
    Object.assign(gateEl.params, { modulate: true, chopDuty: 0.5 });
  }
  const elements = [laser, gateEl];
  for (const [type, gap] of downstream) {
    const el = createElement(type, AOM_X + gap, 0);
    if (type === 'filter') Object.assign(el.params, { ftype: 'nd', trans: 0.9 });
    elements.push(el);
  }
  return traceScene(elements, []).drawables;
}

// Phase of the pattern at an axial distance d past the gate, where the order's
// own on-window begins `startMm` into each period.
const phaseAt = (d, startMm) => (((d - startMm) % PERIOD) + PERIOD) % PERIOD;

// The on-axis beam's fill chunks, as [start, end] distances past the gate.
function fillChunks(drawables, { minX = AOM_X, band = HALF_WIDTH + 0.5 } = {}) {
  return drawables
    .filter(d => d.type === 'poly' && d.pts.every(p => p.x >= minX - 1e-6 && Math.abs(p.y) <= band))
    .map(d => { const xs = d.pts.map(p => p.x); return [Math.min(...xs) - AOM_X, Math.max(...xs) - AOM_X]; })
    .filter(([a, b]) => b - a > 0.05);
}

function assertChunksOnPattern(chunks, startMm, label) {
  assert.ok(chunks.length >= 6, `${label}: expected a chopped fill, got ${chunks.length} chunks`);
  for (const [a, b] of chunks) {
    // A chunk may be cut short by an optic, but it must lie inside one
    // on-window of the pattern the gate started.
    const mid = (a + b) / 2;
    assert.ok(phaseAt(mid, startMm) < ON,
      `${label}: chunk ${a.toFixed(1)}-${b.toFixed(1)} mm lies in the dark half of the pattern`);
    assert.ok(phaseAt(a, startMm) <= ON + 1e-3 && b - a <= ON + 1e-3,
      `${label}: chunk ${a.toFixed(1)}-${b.toFixed(1)} mm starts off the pattern's on-window`);
  }
}

// The outline is dashed per ray; each downstream ray's dash offset must place
// its dashes on the same pattern the gate started.
function assertOutlineOnPattern(drawables, startMm, label, { band = HALF_WIDTH + 0.5 } = {}) {
  const outlines = drawables.filter(d => d.type === 'path' && d.dash
    && Math.abs(d.pts[0].y) <= band && d.pts[0].x >= AOM_X - 1e-6);
  assert.ok(outlines.length >= 2, `${label}: expected dashed outlines on both sides of the optic`);
  for (const path of outlines) {
    const start = path.pts[0].x - AOM_X;
    // SVG: at distance s along the path the pattern position is s + offset,
    // and a "7 7" pattern is dash first. Distance s=0 is the ray's own start.
    const offset = Number(path.dashOffset || 0);
    for (const s of [0.5, 3.5, 6.5, 7.5, 10.5, 13.5]) {
      const drawnOn = ((s + offset) % PERIOD) < ON;
      const patternOn = phaseAt(start + s, startMm) < ON;
      assert.equal(drawnOn, patternOn,
        `${label}: outline starting ${start.toFixed(1)} mm past the gate is ${drawnOn ? 'lit' : 'dark'} at +${s} mm, pattern says ${patternOn ? 'lit' : 'dark'}`);
    }
  }
}

test('the AOM pattern runs on unbroken through an optic that is not a whole period away', () => {
  for (const gap of [25, 30, 33.5]) {
    const drawables = scene({ downstream: [['filter', gap]] });
    assertChunksOnPattern(fillChunks(drawables), 0, `filter at ${gap} mm`);
    assertOutlineOnPattern(drawables, 0, `filter at ${gap} mm`);
  }
});

test('the pattern survives several optics in a row', () => {
  const drawables = scene({ downstream: [['filter', 25], ['filter', 47], ['filter', 80]] });
  assertChunksOnPattern(fillChunks(drawables), 0, 'three filters');
  assertOutlineOnPattern(drawables, 0, 'three filters');
});

// The undiffracted order is drawn in anti-phase, lit exactly where the
// diffracted one is dark. Continuing the pattern must keep that opposition.
test('the undiffracted order stays in anti-phase past a downstream optic', () => {
  // With a 20 degree deflection the first order has left the axial band by
  // 200 mm; only the undiffracted beam is left there.
  const drawables = scene({ zero: true, downstream: [['filter', 25]] });
  const chunks = fillChunks(drawables, { minX: AOM_X + 50 });
  assertChunksOnPattern(chunks, ON, 'undiffracted order');
});

// The same restart affected the mechanical chopper, which shares the drawing.
test('a mechanical chopper pattern also runs on through a downstream optic', () => {
  const drawables = scene({ gate: 'chopper', downstream: [['filter', 25]] });
  const chunks = fillChunks(drawables);
  // The chopper's own body sits across the first few mm; judge the pattern by
  // where it is cut relative to the chopper's first drawn chunk.
  assert.ok(chunks.length >= 6, `expected a chopped fill, got ${chunks.length}`);
  const startMm = chunks.map(([a]) => a).sort((x, y) => x - y)[0];
  assertChunksOnPattern(chunks, startMm, 'chopper');
});

// Behind an oblique optic the two beam edges have travelled different
// distances: a 45 degree mirror 100 mm past the gate folds a 12 mm beam's
// edges after 106 and 94 mm. The fill used to cut both edges at one edge's
// positions, slanting every chunk parallel to the mirror while the dashed
// outlines, following each edge's own phase, stayed square to the beam.
test('behind a 45 degree mirror the chunks stay square to the beam and agree with both outlines', () => {
  const laser = createElement('cwlaser', 0, 0);
  Object.assign(laser.params, { beamMode: 'beam', beamWidth: 12 });
  const aom = createElement('aom', AOM_X, 0);
  Object.assign(aom.params, { modulate: true, modShape: 'square', chopDuty: 0.5, eff: 1, deflect: 0, zero: false, drawChopped: true });
  const mirror = createElement('mirror', AOM_X + 100, 0);
  mirror.rot = 45;
  mirror.params.length = 40;
  const drawables = traceScene([laser, aom, mirror], []).drawables;
  // The folded beam runs towards -y between x = 244 and 256; keep clear of
  // the mirror's own footprint, where chunks are legitimately cut by it.
  const folded = drawables.filter(d => d.type === 'poly' && d.pts.every(p => p.y < -8));
  assert.ok(folded.length >= 20, `expected a chopped folded beam, got ${folded.length} quads`);
  for (const q of folded) {
    // Quads are [A(lo), A(hi), B(hi), B(lo)]: each cut joins equal y.
    assert.ok(Math.abs(q.pts[0].y - q.pts[3].y) < 1e-6 && Math.abs(q.pts[1].y - q.pts[2].y) < 1e-6,
      `chunk cut is slanted: ${q.pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}`);
  }
  // Every fill chunk along each outer edge must sit on that edge's dashes.
  const outlines = drawables.filter(d => d.type === 'path' && d.dash && d.pts[0].x > AOM_X + 50);
  assert.equal(outlines.length, 2, 'one dashed outline per edge after the fold');
  for (const path of outlines) {
    const edgeX = path.pts[0].x, startY = path.pts[0].y;
    const offset = Number(path.dashOffset || 0);
    const onEdge = folded.filter(q => q.pts.some(p => Math.abs(p.x - edgeX) < 1e-6));
    assert.ok(onEdge.length >= 5, `expected fill chunks along the edge at x=${edgeX}`);
    for (const q of onEdge) {
      const ys = q.pts.filter(p => Math.abs(p.x - edgeX) < 1e-6).map(p => p.y);
      const s = startY - (Math.min(...ys) + Math.max(...ys)) / 2;
      assert.ok(((s + offset) % PERIOD) < ON,
        `fill chunk at x=${edgeX}, y=${Math.max(...ys).toFixed(1)}..${Math.min(...ys).toFixed(1)} falls in a gap of that edge's outline`);
    }
  }
});
