import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSVG } from '../sketch/js/export.js';
import { createElement, getSize, registry } from '../sketch/js/elements.js';
import { detectorReading, traceAll } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';
import {
  appendBoundaryGesture, boundaryBounds, boundarySegments, circularArcThrough,
  isSimpleBoundary, isSimplePolygon, normalizeBoundaryPoints, normalizePolygonPoints,
  pointInPolygon,
} from '../sketch/js/polygon.js';
import { toWorld } from '../sketch/js/util.js';

const file = elements => JSON.stringify({ app: 'optics2d', version: 1, elements, beams: [] });
const finitePath = path => path.pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y));

test('freeform glass uses one closed, uniquely keyed surface per logical boundary edge', () => {
  const glass = createElement('freeglass');
  glass.params.vertices = [
    { x: -40, y: -20 }, { x: 20, y: -28 }, { x: 42, y: 12 }, { x: 0, y: 30 }, { x: -35, y: 16 },
  ];
  const surfaces = registry.freeglass.surfaces(glass);
  assert.equal(surfaces.length, glass.params.vertices.length);
  assert.deepEqual(surfaces.map(s => s.data.topologyKey), ['edge-0', 'edge-1', 'edge-2', 'edge-3', 'edge-4']);
  assert.deepEqual(
    [surfaces.at(-1).x2, surfaces.at(-1).y2],
    [surfaces[0].x1, surfaces[0].y1],
    'the final edge closes the same registry-owned boundary',
  );
  assert.ok(getSize(glass).w > 80 && getSize(glass).h > 50);
  assert.doesNotMatch(registry.freeglass.svg(glass), /NaN|Infinity|undefined/);
});

test('press-drag gestures add a three-point circular arc while clicks stay straight', () => {
  let points = [{ x: 0, y: 0 }];
  points = appendBoundaryGesture(points, { x: 25, y: -20 }, { x: 50, y: 0 }, true);
  assert.deepEqual(points, [
    { x: 0, y: 0 }, { x: 25, y: -20, arc: true }, { x: 50, y: 0 },
  ]);
  points = appendBoundaryGesture(points, { x: 50, y: 50 }, { x: 50, y: 50 }, false);
  points = appendBoundaryGesture(points, { x: 0, y: 50 }, { x: 0, y: 50 }, false);
  assert.equal(isSimpleBoundary(points), true);

  const [curved, ...straight] = boundarySegments(points);
  assert.equal(curved.kind, 'arc');
  assert.ok(Math.abs(curved.arc.r - 25.625) < 1e-9);
  assert.equal(straight.every(segment => segment.kind === 'line'), true);
});

test('a circular arc can close a simple boundary after sampling exceeds the editable point limit', () => {
  const capsule = [
    { x: -50, y: -40 },
    { x: 50, y: -40 },
    { x: 90, y: 0, arc: true },
    { x: 50, y: 40 },
    { x: -50, y: 40 },
    { x: -90, y: 0, arc: true },
  ];
  assert.equal(isSimpleBoundary(capsule), true);
  assert.equal(boundarySegments(capsule).filter(segment => segment.kind === 'arc').length, 2);
});

test('curved boundaries serialize safely, retain exact bounds, and reject malformed arc runs', () => {
  const curved = [
    { x: -50, y: -20 }, { x: 0, y: -40, arc: true },
    { x: 50, y: -20 }, { x: 50, y: 30 }, { x: -50, y: 30 },
  ];
  assert.equal(isSimpleBoundary(curved), true);
  assert.deepEqual(boundaryBounds(curved), { x0: -50, x1: 50, y0: -40, y1: 30 });
  assert.match(registry.freeglass.svg({ ...createElement('freeglass'), params: {
    ...createElement('freeglass').params, vertices: curved,
  } }), /\bA 72\.5 72\.5 0 0 1 50 -20\b/);

  const fallback = createElement('freeglass').params.vertices;
  const malformed = [
    { x: -30, y: -20 }, { x: -10, y: -30, arc: true },
    { x: 10, y: -30, arc: true }, { x: 30, y: -20 }, { x: 0, y: 30 },
  ];
  assert.deepEqual(normalizeBoundaryPoints(malformed, fallback), fallback);

  const raw = createElement('freeglass', 20, 30);
  raw.params.vertices = curved;
  const [loaded] = parseSketch(file([raw]), registry).elements;
  assert.equal(loaded.params.vertices.some(point => point.arc === true), true);
  assert.equal(isSimpleBoundary(loaded.params.vertices), true);
});

test('simple concave polygons are accepted while malformed boundaries normalize safely', () => {
  const concave = [
    { x: -30, y: -30 }, { x: 30, y: -30 }, { x: 5, y: 0 }, { x: 30, y: 30 }, { x: -30, y: 30 },
  ];
  const bowTie = [{ x: -20, y: -20 }, { x: 20, y: 20 }, { x: -20, y: 20 }, { x: 20, y: -20 }];
  const fallback = createElement('freeglass').params.vertices;
  assert.equal(isSimplePolygon(concave), true);
  assert.equal(pointInPolygon({ x: -20, y: 0 }, concave), true);
  assert.equal(isSimplePolygon(bowTie), false);
  assert.deepEqual(normalizePolygonPoints(bowTie, fallback), fallback);
  assert.deepEqual(normalizePolygonPoints([{ x: NaN, y: 0 }], fallback), fallback);

  const raw = createElement('freeglass', 20, 30);
  raw.params.vertices = bowTie;
  const [loaded] = parseSketch(file([raw]), registry).elements;
  assert.equal(isSimplePolygon(loaded.params.vertices), true);
  assert.doesNotMatch(registry.freeglass.svg(loaded), /NaN|Infinity|undefined/);
});

test('loading recenters an asymmetric polygon without moving its world boundary', () => {
  const raw = createElement('freeglass', 120, 80);
  raw.rot = 31;
  raw.params.scale = 1.6;
  raw.params.vertices = [{ x: 10, y: 5 }, { x: 70, y: 4 }, { x: 55, y: 42 }, { x: 12, y: 31 }];
  const before = raw.params.vertices.map(p => toWorld(raw, p.x * raw.params.scale, p.y * raw.params.scale));
  const [loaded] = parseSketch(file([raw]), registry).elements;
  const after = loaded.params.vertices.map(p => toWorld(loaded, p.x * loaded.params.scale, p.y * loaded.params.scale));
  before.forEach((p, i) => {
    assert.ok(Math.abs(p.x - after[i].x) < 1e-9);
    assert.ok(Math.abs(p.y - after[i].y) < 1e-9);
  });
});

test('vertex editing preserves untouched world points and rejects self-crossing candidates', () => {
  const glass = createElement('freeglass', 100, 60);
  glass.rot = 23;
  const editor = registry.freeglass.editPoints;
  const original = editor.get(glass);
  const untouchedWorld = original.slice(1).map(p => toWorld(glass, p.x, p.y));
  const next = editor.candidate(glass, 0, { x: original[0].x - 18, y: original[0].y - 7 });
  assert.ok(next);
  const edited = { ...glass, x: next.x, y: next.y, params: { ...glass.params, vertices: next.vertices } };
  editor.get(edited).slice(1).forEach((p, i) => {
    const world = toWorld(edited, p.x, p.y);
    assert.ok(Math.abs(world.x - untouchedWorld[i].x) < 1e-9);
    assert.ok(Math.abs(world.y - untouchedWorld[i].y) < 1e-9);
  });
  assert.equal(editor.candidate(glass, 0, { x: 34, y: 23 }), null, 'a crossing/collapsed edit is refused');
});

test('a freeform wedge refracts finite rays and produces wavelength-dependent dispersion', () => {
  const finalSlope = wavelength => {
    const laser = createElement('cwlaser', 0, 10);
    laser.params.wavelength = wavelength;
    const glass = createElement('freeglass', 180, 0);
    glass.params.material = 'nbk7';
    glass.params.vertices = [{ x: -35, y: -30 }, { x: 35, y: 0 }, { x: -35, y: 30 }];
    const paths = traceAll([laser, glass]).filter(d => d.type === 'path');
    assert.ok(paths.length >= 1 && paths.every(finitePath));
    const path = paths.at(-1).pts, a = path.at(-2), b = path.at(-1);
    return (b.y - a.y) / (b.x - a.x);
  };
  const blue = finalSlope(450), red = finalSlope(650);
  assert.ok(Math.abs(blue - red) > 0.001, 'BK7-like index changes the exit angle across wavelength');
});

test('a circular-arc glass face uses exact circle intersections and radial refraction normals', () => {
  const vertices = [
    { x: -50, y: -20 }, { x: 0, y: -40, arc: true },
    { x: 50, y: -20 }, { x: 50, y: 30 }, { x: -50, y: 30 },
  ];
  const arc = circularArcThrough(vertices[0], vertices[1], vertices[2]);
  const laser = createElement('cwlaser', 25, -120);
  laser.params.beamMode = 'line';
  laser.rot = 90;
  const glass = createElement('freeglass', 0, 0);
  glass.params.ior = 1.5;
  glass.params.vertices = vertices;

  const [path] = traceAll([laser, glass]).filter(drawable => drawable.type === 'path');
  assert.ok(path && finitePath(path));
  const entry = path.pts[1];
  assert.ok(Math.abs(Math.hypot(entry.x - arc.cx, entry.y - arc.cy) - arc.r) < 1e-7);
  assert.ok(Math.abs(path.pts[2].x - entry.x) > 1, 'the off-axis radial normal bends the ray inside the glass');
  assert.ok(path.pts.at(-1).x < -100, 'the curved entrance and flat exit produce a finite deflected output');
});

test('an exact circular-arc endpoint hit stops instead of choosing either adjoining normal', () => {
  const target = { x: 50, y: -20 };
  const angleDeg = 60, angle = angleDeg * Math.PI / 180;
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const laser = createElement('cwlaser', target.x - direction.x * 212, target.y - direction.y * 212);
  laser.params.beamMode = 'line';
  laser.rot = angleDeg;
  const glass = createElement('freeglass', 0, 0);
  glass.params.vertices = [
    { x: -50, y: -20 }, { x: 0, y: -40, arc: true },
    target, { x: 50, y: 30 }, { x: -50, y: 30 },
  ];

  const [path] = traceAll([laser, glass]).filter(drawable => drawable.type === 'path');
  assert.ok(path && finitePath(path));
  assert.ok(Math.abs(path.pts.at(-1).x - target.x) < 1e-7);
  assert.ok(Math.abs(path.pts.at(-1).y - target.y) < 1e-7);
});

test('a source born inside freeform glass undergoes TIR and exits without non-finite rays', () => {
  const angle = 20 * Math.PI / 180;
  const laser = createElement('cwlaser', -52 * Math.cos(angle), -52 * Math.sin(angle));
  laser.rot = 20; // emission begins at the glass centre
  const glass = createElement('freeglass', 0, 0);
  glass.params.ior = 1.5;
  glass.params.vertices = [{ x: -100, y: -10 }, { x: 100, y: -10 }, { x: 100, y: 10 }, { x: -100, y: 10 }];
  const paths = traceAll([laser, glass]).filter(d => d.type === 'path');
  assert.ok(paths.length >= 3, 'two TIR bounces create distinct, topology-safe path branches');
  assert.ok(paths.every(finitePath));
  assert.ok(paths.some(path => path.pts.at(-1).x > 100), 'the ray eventually exits the end face');
});

test('a broadband source born inside BK7 glass keeps its spectrum when it exits', () => {
  const sourceAngle = 20 * Math.PI / 180;
  const source = createElement('sclaser', -52 * Math.cos(sourceAngle), -52 * Math.sin(sourceAngle));
  source.rot = 20;
  source.params.beamMode = 'line';
  source.params.temporalMode = 'cw';
  source.params.scMin = 450;
  source.params.scMax = 700;
  const glass = createElement('freeglass', 0, 0);
  glass.params.material = 'nbk7';
  glass.params.vertices = [{ x: -100, y: -80 }, { x: 100, y: -80 }, { x: 100, y: 80 }, { x: -100, y: 80 }];
  const detector = createElement('detector', 180, 78);
  detector.params.aperture = 120;
  const paths = traceAll([source, glass, detector]);
  const reading = detectorReading(detector.id);
  assert.ok(reading, 'the exiting spectrum reaches the detector');
  assert.equal(reading.bandMin, source.params.scMin);
  assert.equal(reading.bandMax, source.params.scMax);
  const exitAngles = paths
    .filter(path => path.type === 'path' && path.pts.length >= 2 && path.pts[0].x > 90)
    .map(path => {
      const a = path.pts.at(-2), b = path.pts.at(-1);
      return Math.atan2(b.y - a.y, b.x - a.x).toFixed(6);
    });
  assert.ok(new Set(exitAngles).size >= 5, 'wavelength-specific glass indices create angular dispersion at the exit');
});

test('broadband BK7 branches retain wavelength-specific index through TIR and exit', () => {
  const sourceAngle = 20 * Math.PI / 180;
  const source = createElement('sclaser', -52 * Math.cos(sourceAngle), -52 * Math.sin(sourceAngle));
  source.rot = 20;
  source.params.beamMode = 'line';
  source.params.temporalMode = 'cw';
  source.params.scMin = 450;
  source.params.scMax = 700;
  const glass = createElement('freeglass', 0, 0);
  glass.params.material = 'nbk7';
  glass.params.vertices = [{ x: -100, y: -10 }, { x: 100, y: -10 }, { x: 100, y: 10 }, { x: -100, y: 10 }];

  const paths = traceAll([source, glass]);
  assert.ok(paths.every(path => path.type !== 'path' || finitePath(path)));
  const exitAngles = paths
    .filter(path => path.type === 'path' && path.pts.length >= 3 && path.pts.at(-1).x > 100)
    .map(path => {
      const a = path.pts.at(-2), b = path.pts.at(-1);
      return Math.atan2(b.y - a.y, b.x - a.x).toFixed(6);
    });
  assert.ok(new Set(exitAngles).size >= 5, 'TIR children keep wavelength-specific IOR until the later exit');
});

test('an exact polygon-corner hit terminates at the vertex instead of choosing an arbitrary normal', () => {
  const target = { x: 170, y: -30 }, angleDeg = -15, angle = angleDeg * Math.PI / 180;
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const laser = createElement('cwlaser', target.x - direction.x * 212, target.y - direction.y * 212);
  laser.params.beamMode = 'line';
  laser.rot = angleDeg;
  const glass = createElement('freeglass', 200, 0);
  glass.params.vertices = [{ x: -30, y: -30 }, { x: 30, y: -30 }, { x: 30, y: 30 }, { x: -30, y: 30 }];
  const [path] = traceAll([laser, glass]).filter(d => d.type === 'path');
  assert.ok(path && finitePath(path));
  assert.ok(Math.abs(path.pts.at(-1).x - target.x) < 1e-7);
  assert.ok(Math.abs(path.pts.at(-1).y - target.y) < 1e-7);
});

test('figure frame sets the export viewBox and remains canvas-only', () => {
  const previous = { elements: state.elements, beams: state.beams };
  try {
    const laser = createElement('cwlaser', 100, 80);
    const frame = createElement('figureframe', 100, 80);
    frame.params.w = 200; frame.params.h = 100; frame.params.background = 'white';
    state.elements = [laser, frame]; state.beams = [];
    const svg = buildSVG();
    assert.match(svg, /viewBox="0 30 200 100"/);
    assert.match(svg, /fill="#ffffff"/);
    assert.doesNotMatch(svg, /FIGURE|stroke-dasharray="7 5"/);
  } finally {
    state.elements = previous.elements; state.beams = previous.beams;
  }
});

test('figure frame is selectable at its border but does not capture its interior', () => {
  const frame = createElement('figureframe', 100, 80);
  frame.params.w = 200;
  frame.params.h = 100;
  assert.equal(registry.figureframe.hitTest(frame, { x: 0, y: 0 }, 6), false);
  assert.equal(registry.figureframe.hitTest(frame, { x: 99, y: 0 }, 6), true);
  assert.equal(registry.figureframe.hitTest(frame, { x: 0, y: -48 }, 6), true);
});
