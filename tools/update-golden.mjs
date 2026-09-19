// Golden snapshots of what the tracer reports for every bundled scene.
//
//   node tools/update-golden.mjs            # rewrite test/golden/*.json
//   node tools/update-golden.mjs --check    # exit 1 if any snapshot differs
//
// Every example under Examples/ and every published community submission is
// traced, and everything the app could show about the result is recorded:
// the drawables, the pulse tracks, and each element's readout (detector
// readings, fiber envelopes, OPO and compressor states, ...). test/golden.test.js
// compares the live tracer against these files, so a physics change that
// moves any number anywhere shows up as a reviewable diff instead of a
// surprise on the live site.
//
// Numbers are rounded to 9 significant digits. Long numeric arrays keep a
// human summary (length, sum, min, max, every 16th sample) plus an ordered
// digest of every rounded sample, so a feature that moves inside an array --
// which sum, min, max and a sparse sample all survive -- still shows up.
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
        sum: round(finite.reduce((a, b) => a + b, 0)),
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
function drawableSummary(drawables) {
  const byType = {}, colors = {};
  let points = 0, sumX = 0, sumY = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const parts = [];
  for (const d of drawables) {
    byType[d.type] = (byType[d.type] || 0) + 1;
    colors[d.color] = (colors[d.color] || 0) + 1;
    // Everything both renderers read: the dash pattern and where it starts
    // (a chopper's chunk alignment), and each speckle dot's radius and
    // opacity.
    parts.push(`${d.type}|${d.color}|${round(d.opacity)}|${round(d.w)}|${d.dash ?? ''}|${round(d.dashOffset) ?? ''}`);
    for (const p of d.pts || d.dots || []) {
      points++;
      const x = Number(p.x.toFixed(4)), y = Number(p.y.toFixed(4));
      sumX += x; sumY += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      parts.push(p.r !== undefined || p.o !== undefined
        ? `${x},${y},${round(p.r) ?? ''},${round(p.o) ?? ''}` : `${x},${y}`);
    }
  }
  const digest = digestOf(parts);
  return {
    count: drawables.length, byType, colors: Object.fromEntries(Object.entries(colors).sort()),
    points, sum: [round(sumX), round(sumY)],
    bbox: points ? [minX, minY, maxX, maxY].map(round) : null,
    digest,
  };
}

// One line per pulse packet track: what it carries, where it runs, and a
// digest of its geometry and of the dispersion it accumulates along it. A
// changed path delay, gate, packet width or route changes this even when the
// number of tracks does not.
function trackSummary(tracks) {
  return tracks.map(track => ({
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
    digest: digestOf([
      ...(track.pts || []).map(p => `${Number(p.x.toFixed(4))},${Number(p.y.toFixed(4))}`),
      ...(track.opls || []).map(round),
      ...(track.gddTrace || []).map(event => `${round(event.opl)}:${round(event.gdd)}:${event.linear ? 1 : 0}`),
      ...(track.groupDelayDifferenceTrace || []).map(event => `${round(event.opl)}:${round(event.value)}`),
    ]),
  }));
}

// Where light was recorded on a specimen or sample stage, and what it carried.
function hitSummary(hits) {
  return {
    count: hits.length,
    digest: digestOf(hits.map(hit => Object.keys(hit).sort()
      .map(key => `${key}=${typeof hit[key] === 'number' ? round(hit[key]) : String(hit[key])}`).join('|'))),
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
    try { svg = String(def.svg(el, elements)); } catch (error) { svg = `threw: ${error.message}`; }
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
    writeHits: hitSummary(result.writeHits || []),
    signalHits: hitSummary(result.signalHits || []),
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
