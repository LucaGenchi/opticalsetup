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
// Numbers are rounded to 9 significant digits and long numeric arrays are
// summarised (length, sum, min, max, and every 16th sample), which keeps the
// files reviewable while still catching any real change.

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

// A stable, reviewable image of any value the tracer hands back.
export function snapshot(value, depth = 0) {
  if (typeof value === 'number') return round(value);
  if (value === null || typeof value !== 'object') return value === undefined ? null : value;
  if (depth > 12) return '[depth]';
  if (ArrayBuffer.isView(value)) value = Array.from(value);
  if (Array.isArray(value)) {
    if (value.length > LONG_ARRAY && value.every(v => typeof v === 'number')) {
      const finite = value.filter(Number.isFinite);
      return {
        length: value.length,
        sum: round(finite.reduce((a, b) => a + b, 0)),
        min: round(Math.min(...finite)),
        max: round(Math.max(...finite)),
        every16th: value.filter((_, i) => i % 16 === 0).map(round),
      };
    }
    return value.map(v => snapshot(v, depth + 1));
  }
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (key === 'el') continue; // back-reference to the scene element
    const v = value[key];
    if (typeof v === 'function' || v === undefined) continue;
    out[key] = snapshot(v, depth + 1);
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
  let points = 0, sumX = 0, sumY = 0, digest = 0x811c9dc5;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const mix = value => {
    const text = String(value);
    for (let i = 0; i < text.length; i++) digest = Math.imul(digest ^ text.charCodeAt(i), 0x01000193) >>> 0;
  };
  for (const d of drawables) {
    byType[d.type] = (byType[d.type] || 0) + 1;
    colors[d.color] = (colors[d.color] || 0) + 1;
    mix(`${d.type}|${d.color}|${round(d.opacity)}|${round(d.w)}|${d.dash ?? ''}`);
    for (const p of d.pts || d.dots || []) {
      points++;
      const x = Number(p.x.toFixed(4)), y = Number(p.y.toFixed(4));
      sumX += x; sumY += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      mix(`${x},${y}`);
    }
  }
  return {
    count: drawables.length, byType, colors: Object.fromEntries(Object.entries(colors).sort()),
    points, sum: [round(sumX), round(sumY)],
    bbox: points ? [minX, minY, maxX, maxY].map(round) : null,
    digest: digest.toString(16).padStart(8, '0'),
  };
}

export function goldenFor(scene) {
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
    pulseTracks: result.pulseTracks.length,
    writeHits: (result.writeHits || []).length,
    signalHits: (result.signalHits || []).length,
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
    const text = JSON.stringify(goldenFor(scene), null, 1) + '\n';
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
