import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement, registry } from '../sketch/js/elements.js';
import { polygonScannerState, polygonScannerSurfaces } from '../sketch/js/polygon-scanner.js';
import { traceAll, detectorReading } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';
import { elementDriveHz } from '../sketch/js/timescale.js';
import { buildSVG } from '../sketch/js/export.js';

const example = readFileSync(new URL('../Examples/Scanning/Polygon scanner - line scanning.json', import.meta.url), 'utf8');
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);
const scene = () => parseSketch(example, registry).elements;

test('facet rate follows RPM, phase wraps, and stopped rotation stays fixed', () => {
  const p = { facets: 12, rpm: 1000, scanPhase: 50 };
  near(polygonScannerState(p).lineRateHz, 200);
  near(polygonScannerState(p, 1 / 200).angle, 0);
  near(polygonScannerState(p, 1 / 800).angle, Math.PI / 24);
  near(polygonScannerState(p, -1 / 800).angle, -Math.PI / 24);
  near(polygonScannerState({ ...p, rpm: 2000 }).lineRateHz, 400);
  near(polygonScannerState({ ...p, scanMode: 'static' }, 100).angle, 0);
  near(polygonScannerState({ ...p, rpm: 0 }, 100).angle, 0);
  const el = createElement('polygonscanner');
  near(elementDriveHz(el), 200);
  el.params.scanMode = 'static';
  assert.equal(elementDriveHz(el), null);
});

test('every facet is closed, finite and reflective; out-of-window facets absorb', () => {
  const surfaces = polygonScannerSurfaces();
  assert.equal(surfaces.length, 12);
  surfaces.forEach((s, i) => {
    assert.equal(s.kind, 'mirror');
    assert.equal(s.data.opaque, true);
    near(s.x2, surfaces[(i + 1) % 12].x1);
    near(s.y2, surfaces[(i + 1) % 12].y1);
  });
  for (const scanPhase of [0, 14, 86, 100]) {
    assert.ok(polygonScannerSurfaces({ scanPhase }).every(s => s.kind === 'absorb'));
  }
  assert.ok(polygonScannerSurfaces({ dutyCycle: 0 }).every(s => s.kind === 'absorb'));
  assert.ok(polygonScannerSurfaces({ dutyCycle: 100, scanPhase: 0 }).every(s => s.kind === 'mirror'));
});

test('unsafe parameters cannot produce non-finite geometry or unbounded facet arrays', () => {
  for (const value of [NaN, Infinity, -Infinity, -1e300, 1e300, null, 'oops']) {
    const p = { facets: value, rpm: value, diameter: value, dutyCycle: value, scanPhase: value, refl: value };
    const s = polygonScannerState(p, value);
    assert.ok(s.facets >= 3 && s.facets <= 72 && Number.isInteger(s.facets));
    assert.ok(Object.values(s).every(v => typeof v === 'boolean' || Number.isFinite(v)));
    for (const surface of polygonScannerSurfaces(p, value)) {
      assert.ok(['x1', 'y1', 'x2', 'y2'].every(key => Number.isFinite(surface[key])));
    }
  }
  assert.equal(polygonScannerState({ facets: 12.7 }).facets, 13);
});

test('the reflected ray changes direction by twice the mechanical facet rotation', () => {
  const elements = scene().filter(e => ['source', 'scanner'].includes(e.id));
  elements[0].params.beamMode = 'line';
  const wheel = elements[1];
  wheel.params.refl = 100;
  const angleAt = scanPhase => {
    wheel.params.scanPhase = scanPhase;
    const path = traceAll(elements).filter(d => d.type === 'path').at(-1);
    const a = path.pts.at(-2), b = path.pts.at(-1);
    return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  };
  near(angleAt(50), 90);
  near(angleAt(25), 75);
  near(angleAt(75), 105);
});

test('the example delivers a moving focus and blanks between facets', () => {
  const elements = scene(), wheel = elements.find(e => e.id === 'scanner');
  const positions = [];
  for (const phase of [25, 50, 75]) {
    wheel.params.scanPhase = phase;
    const drawables = traceAll(elements);
    assert.ok(detectorReading('target')?.signal > 0.9);
    const hits = drawables.filter(d => d.type === 'path').flatMap(d => d.pts).filter(p => Math.abs(p.y - 370) < 1e-5);
    assert.ok(hits.length);
    positions.push(hits.reduce((sum, p) => sum + p.x, 0) / hits.length);
  }
  assert.ok(positions[0] > positions[1] + 20 && positions[1] > positions[2] + 20);
  wheel.params.scanPhase = 95;
  traceAll(elements);
  assert.equal(detectorReading('target'), null);
});

test('opaque wheel coating losses never leak through to a detector behind the hub', () => {
  const source = createElement('cwlaser', 0, 0);
  source.params.beamMode = 'line';
  const wheel = createElement('polygonscanner', 180, 0);
  const behind = createElement('detector', 300, 0);
  for (const refl of [0, 50, 98, 100]) {
    wheel.params.refl = refl;
    traceAll([source, wheel, behind]);
    assert.equal(detectorReading(behind.id), null);
  }
});

test('reflectivity scales delivered power without internal ghost reflections', () => {
  const elements = scene(), wheel = elements.find(e => e.id === 'scanner');
  wheel.params.refl = 100;
  traceAll(elements);
  const full = detectorReading('target').signal;
  wheel.params.refl = 50;
  traceAll(elements);
  near(detectorReading('target').signal, full / 2);
  wheel.params.refl = 0;
  traceAll(elements);
  assert.equal(detectorReading('target'), null);
});

test('native save/reload preserves the example and exported animation follows facet motion', () => {
  const parsed = parseSketch(example, registry);
  const reloaded = parseSketch(JSON.stringify({ app: 'optics2d', version: 1, ...parsed }), registry);
  assert.deepEqual(reloaded, parsed);
  state.elements = parsed.elements;
  state.beams = parsed.beams;
  const initial = buildSVG({ animation: { seconds: 0, playback: { mechanicsMode: true } } });
  const moved = buildSVG({ animation: { seconds: 3, playback: { mechanicsMode: true } } });
  assert.notEqual(initial, moved);
  assert.doesNotMatch(moved, /NaN|Infinity/);
  // Twelve display seconds correspond to one facet in mechanics mode.
  const repeated = buildSVG({ animation: { seconds: 12, playback: { mechanicsMode: true } } });
  assert.equal(initial, repeated);
});
