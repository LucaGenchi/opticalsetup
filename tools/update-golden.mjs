// Golden snapshots of what the tracer reports for every bundled scene.
//
//   node tools/update-golden.mjs            # rewrite test/golden/*.json
//   node tools/update-golden.mjs --check    # exit 1 if any snapshot differs
//
// Every example under Examples/ and every published community submission is
// traced, and what the tracer reports is recorded: the drawables, each
// element as it is drawn, the pulse tracks, the recorded hits, and each
// element's readout (detector readings, fiber envelopes, OPO and compressor
// states, ...). test/golden.test.js compares the live tracer against these
// files, so a change that moves a recorded number shows up as a reviewable
// diff instead of a surprise on the live site. What is not recorded is listed
// below.
//
// Numbers are rounded to 9 significant digits. Long numeric arrays keep a
// human summary (length, sum, min, max, every 16th sample) plus an ordered
// digest of every rounded sample, so a feature that moves inside an array --
// which sum, min, max and a sparse sample all survive -- still shows up.
//
// A digest compares those rounded values exactly, which is stricter than the
// 1e-6 tolerance the test applies to a scalar it can see. A digest-only
// difference is therefore worth reproducing on the supported runtime before
// it is called a physics change. A 32-bit digest is a regression aid, not a
// guarantee against collisions.
//
// What this covers: everything reachable from traceScene() plus the readout
// getters listed below, each element's drawn SVG, the pulse tracks and the
// write/signal hits. It is a tracer and drawing baseline, not a proof of
// visual equivalence and not a substitute for the instrument-level tests: a
// value an instrument helper derives after detectorReading() (an
// autocorrelation trace, say) is covered only through the record it reads.

import { readdir, readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, relative } from 'node:path';
import { parseSketch } from '../sketch/js/state.js';
import { registry } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';
import '../sketch/js/etalon.js';
import '../sketch/js/vipa.js';
import {
  traceScene, detectorReading, fiberReading, opoReading, compressorGddReading,
  metalensReading, mixReading, supercontinuumReading, objectivePupilFill,
  specimenTimingReading, phasePlateIllumination, specimenIncidentBeams, specimenSrsNote,
} from '../sketch/js/raytrace.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const GOLDEN_DIR = join(ROOT, 'test', 'golden');

const SIGNIFICANT = 9;
const LONG_ARRAY = 32;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else if (entry.name.endsWith('.json')) out.push(path);
  }
  return out.sort();
}

export async function sceneFiles() {
  const files = [...await walk(join(ROOT, 'Examples')), ...await walk(join(ROOT, 'community-submissions'))];
  return files.map(path => ({ path, slug: slugFor(path) }));
}

function slugFor(path) {
  return relative(ROOT, path).replace(/\.json$/, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const round = n => (Number.isFinite(n) ? Number(n.toPrecision(SIGNIFICANT)) : n);

// Non-finite numbers are recorded as a marker rather than a number: JSON
// turns them into null, and a NaN compares equal to nothing, so a regression
// that produces one would otherwise pass silently and a regeneration would
// bless it. `nonFinite` collects where they appeared.
const nonFinite = [];
const marker = n => `non-finite:${Number.isNaN(n) ? 'NaN' : n > 0 ? 'Infinity' : '-Infinity'}`;

// A stable string for any value, walked in full: nested records reach the
// digest instead of collapsing to "[object Object]", every number is checked
// before it is hashed, and a cycle is marked rather than followed. Values
// that legitimately repeat are not cycles, so only ancestors are tracked.
function canonical(value, path = '', ancestors = new Set()) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) { nonFinite.push(`${path || '(root)'} = ${value}`); return marker(value); }
    return String(round(value));
  }
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value !== 'object') return String(value);
  if (ancestors.has(value)) return '[cycle]';
  if (ArrayBuffer.isView(value)) value = Array.from(value);
  ancestors.add(value);
  let text;
  if (Array.isArray(value)) {
    text = `[${value.map((v, i) => canonical(v, `${path}[${i}]`, ancestors)).join(',')}]`;
  } else {
    const keys = Object.keys(value).sort()
      .filter(key => key !== 'el' && typeof value[key] !== 'function' && value[key] !== undefined);
    text = `{${keys.map(key => `${key}:${canonical(value[key], path ? `${path}.${key}` : key, ancestors)}`).join(',')}}`;
  }
  ancestors.delete(value);
  return text;
}

// A number that a summary computed rather than read: a sum of finite terms
// can still overflow to infinity, and must not reach a snapshot unnoticed.
function checked(value, path) {
  if (!Number.isFinite(value)) { nonFinite.push(`${path} = ${value}`); return marker(value); }
  return round(value);
}

// An order-sensitive digest. Two arrays with the same values in a different
// order, or one feature displaced, give different digests.
function digestOf(values) {
  let digest = 0x811c9dc5;
  for (const value of values) {
    const text = String(value);
    for (let i = 0; i < text.length; i++) digest = Math.imul(digest ^ text.charCodeAt(i), 0x01000193) >>> 0;
    digest = Math.imul(digest ^ 0x2c, 0x01000193) >>> 0;
  }
  return digest.toString(16).padStart(8, '0');
}

// A stable, reviewable image of any value the tracer hands back.
export function snapshot(value, depth = 0, path = '') {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) { nonFinite.push(`${path || '(root)'} = ${value}`); return marker(value); }
    return round(value);
  }
  if (value === null || typeof value !== 'object') return value === undefined ? null : value;
  if (depth > 12) return '[depth]';
  if (ArrayBuffer.isView(value)) value = Array.from(value);
  if (Array.isArray(value)) {
    if (value.length > LONG_ARRAY && value.every(v => typeof v === 'number')) {
      const rounded = value.map(v => (Number.isFinite(v) ? round(v) : marker(v)));
      const bad = value.filter(v => !Number.isFinite(v));
      if (bad.length) nonFinite.push(`${path || '(root)'} holds ${bad.length} non-finite value(s)`);
      const finite = value.filter(Number.isFinite);
      return {
        length: value.length,
        sum: checked(finite.reduce((a, b) => a + b, 0), `${path || '(root)'}.sum`),
        min: finite.length ? round(Math.min(...finite)) : null,
        max: finite.length ? round(Math.max(...finite)) : null,
        every16th: rounded.filter((_, i) => i % 16 === 0),
        digest: digestOf(rounded),
      };
    }
    return value.map((v, i) => snapshot(v, depth + 1, `${path}[${i}]`));
  }
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (key === 'el') continue; // back-reference to the scene element
    const v = value[key];
    if (typeof v === 'function' || v === undefined) continue;
    out[key] = snapshot(v, depth + 1, path ? `${path}.${key}` : key);
  }
  return out;
}

// Scenes are traced through parseSketch, exactly as the app opens them, and
// community submissions carry their scene under `scene`.
export function sceneFromFile(text) {
  const raw = JSON.parse(text);
  const sketch = raw.app === 'optics2d' ? raw : raw.scene;
  return parseSketch(JSON.stringify(sketch), registry);
}

const READOUTS = {
  detector: detectorReading, opo: opoReading, compressor: compressorGddReading,
  metalens: metalensReading, mix: mixReading, supercontinuum: supercontinuumReading,
  objectivePupil: objectivePupilFill, specimenTiming: specimenTimingReading,
  phasePlate: phasePlateIllumination, specimenIncident: specimenIncidentBeams,
  specimenSrs: specimenSrsNote,
};

// The drawables of a big scene run to thousands of polylines. Recording each
// one would make the snapshot unreadable, so they are summarised: counts by
// type, the colour histogram, the bounding box, coordinate sums and a digest
// of every rounded coordinate. Any moved vertex changes the digest and the
// sums; the counts and box say roughly what changed.
export function drawableSummary(drawables) {
  const byType = {}, colors = {};
  let points = 0, sumX = 0, sumY = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const parts = [];
  for (const [index, d] of drawables.entries()) {
    byType[d.type] = (byType[d.type] || 0) + 1;
    colors[d.color] = (colors[d.color] || 0) + 1;
    // Everything both renderers read: the dash pattern and where it starts
    // (a chopper's chunk alignment), and each speckle dot's radius and
    // opacity.
    parts.push(canonical({
      type: d.type, color: d.color, opacity: d.opacity, w: d.w,
      dash: d.dash ?? null, dashOffset: d.dashOffset ?? null,
    }, `drawables[${index}]`));
    for (const p of d.pts || d.dots || []) {
      points++;
      const x = Number(p.x.toFixed(4)), y = Number(p.y.toFixed(4));
      sumX += x; sumY += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      // Coordinates are rounded for the digest, so they are validated here
      // rather than through canonical().
      for (const [name, v] of [['x', p.x], ['y', p.y], ['r', p.r], ['o', p.o]]) {
        if (v !== undefined && !Number.isFinite(v)) nonFinite.push(`drawables[${index}].${name} = ${v}`);
      }
      parts.push(p.r !== undefined || p.o !== undefined
        ? `${x},${y},${round(p.r) ?? ''},${round(p.o) ?? ''}` : `${x},${y}`);
    }
  }
  const digest = digestOf(parts);
  return {
    count: drawables.length, byType, colors: Object.fromEntries(Object.entries(colors).sort()),
    points, sum: [checked(sumX, 'drawables.sum[0]'), checked(sumY, 'drawables.sum[1]')],
    bbox: points ? [minX, minY, maxX, maxY].map((v, i) => checked(v, `drawables.bbox[${i}]`)) : null,
    digest,
  };
}

// One line per pulse packet track: what it carries, where it runs, and a
// digest of its geometry and of the dispersion it accumulates along it. A
// changed path delay, gate, packet width or route changes this even when the
// number of tracks does not.
export function trackSummary(tracks) {
  return tracks.map((track, index) => ({
    wl: round(track.wl),
    intensity: round(track.intensity),
    color: track.color ?? null,
    points: (track.pts || []).length,
    opl: [round(track.opls?.[0]), round(track.opls?.at(-1))],
    pulse: track.pulse ? {
      sourceId: track.pulse.sourceId ?? null,
      repRateMHz: round(track.pulse.repRateMHz),
      pulseWidthFs: round(track.pulse.pulseWidthFs),
      phaseNs: round(track.pulse.phaseNs),
      spectrumReshaped: Boolean(track.pulse.spectrumReshaped),
      gates: (track.pulse.gates || []).length,
    } : null,
    // The whole record, not a chosen few fields: a gate's duty, a
    // group-delay event's interpolation flag, the sampled field and the
    // provenance flags all reach the digest.
    digest: digestOf([canonical({
      pts: (track.pts || []).map(p => [Number(p.x.toFixed(4)), Number(p.y.toFixed(4))]),
      opls: track.opls, gddTrace: track.gddTrace,
      groupDelayDifferenceTrace: track.groupDelayDifferenceTrace,
      pulse: track.pulse, wl: track.wl, intensity: track.intensity, color: track.color ?? null,
    }, `pulseTracks[${index}]`)]),
  }));
}

// Where light was recorded on a specimen or sample stage, and what it carried.
export function hitSummary(hits, label) {
  return {
    count: hits.length,
    digest: digestOf(hits.map((hit, index) => canonical(hit, `${label}[${index}]`))),
  };
}

// Each element as the canvas and the SVG export draw it. A drawing bug that
// does not move a ray -- #177's negative sensor bar, say -- shows up here.
function elementDrawings(elements) {
  const out = {};
  for (const el of elements) {
    const def = registry[el.type];
    if (typeof def?.svg !== 'function') continue;
    let svg;
    try {
      svg = String(def.svg(el, elements));
    } catch (error) {
      // A component that cannot draw is a failure to report, not a digest to
      // record: a regeneration must not bless it.
      nonFinite.push(`${el.type}:${el.id} failed to draw: ${error.message}`);
      svg = `threw: ${error.message}`;
    }
    out[`${el.type}:${el.id}`] = digestOf([svg]);
  }
  return out;
}

// Cleared per scene: `goldenFor` reports what it found through `nonFiniteSeen`.
export function nonFiniteSeen() { return [...nonFinite]; }
export function goldenFor(scene) {
  nonFinite.length = 0;
  const result = traceScene(scene.elements, scene.beams);
  const elements = {};
  for (const el of scene.elements) {
    const readouts = {};
    for (const [name, read] of Object.entries(READOUTS)) {
      const value = read(el.id);
      if (value === null || value === undefined || (Array.isArray(value) && !value.length)) continue;
      readouts[name] = snapshot(value);
    }
    if (Object.keys(readouts).length) elements[`${el.type}:${el.id}`] = readouts;
  }
  const fibers = {};
  for (const beam of scene.beams) {
    const reading = fiberReading(beam.id);
    if (reading) fibers[beam.id] = snapshot(reading);
  }
  return {
    elements: scene.elements.length,
    beams: scene.beams.length,
    drawables: drawableSummary(result.drawables),
    drawnElements: elementDrawings(scene.elements),
    pulseTracks: trackSummary(result.pulseTracks),
    writeHits: hitSummary(result.writeHits || [], 'writeHits'),
    signalHits: hitSummary(result.signalHits || [], 'signalHits'),
    readouts: elements,
    fibers,
  };
}

async function main() {
  const check = process.argv.includes('--check');
  await mkdir(GOLDEN_DIR, { recursive: true });
  let stale = 0;
  for (const { path, slug } of await sceneFiles()) {
    const scene = sceneFromFile(await readFile(path, 'utf8'));
    const golden = goldenFor(scene);
    const bad = nonFiniteSeen();
    if (bad.length) {
      console.error(`refusing to write ${slug}: the tracer produced non-finite values`);
      for (const where of bad.slice(0, 10)) console.error(`  ${where}`);
      process.exitCode = 1;
      continue;
    }
    const text = JSON.stringify(golden, null, 1) + '\n';
    const target = join(GOLDEN_DIR, `${slug}.json`);
    const current = await readFile(target, 'utf8').catch(() => null);
    if (current === text) continue;
    stale++;
    if (check) console.error(`stale: ${relative(ROOT, target)}`);
    else { await writeFile(target, text); console.log(`wrote ${relative(ROOT, target)}`); }
  }
  if (check && stale) process.exit(1);
  if (!stale) console.log('golden snapshots are current');
}

if (process.argv[1] && basename(process.argv[1]) === 'update-golden.mjs') {
  await main().catch(error => { console.error(error); process.exit(1); });
}
