// Run against materialized paper worktrees to measure their OWN native tracer.
// Usage: node tools/audit-2pp-relays.mjs --worktrees /path/to/worktrees
// Redirect stdout to retain the JSON evidence; this script makes no edits.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tracedPlaneCrossings } from '../sketch/js/scan-relay.js';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--worktrees') {
  console.error('Usage: node tools/audit-2pp-relays.mjs --worktrees /path/to/worktrees');
  process.exit(1);
}
const worktrees = resolve(args[1]);
const tasks = [
  ['pearre-2018', 'pearre-resonant-x', 90, ['pearre-resonant-x', 'pearre-slow-y', 'pearre-relay', 'pearre-objective']],
  ['pearre-2018', 'pearre-slow-y', 0, ['pearre-slow-y', 'pearre-relay', 'pearre-objective']],
  ['kiefer-2024', 'kiefer-gx', 180, ['kiefer-gx', 'kiefer-lg23', 'kiefer-gy', 'kiefer-lg45', 'kiefer-objective']],
  ['kiefer-2024', 'kiefer-gy', 90, ['kiefer-gy', 'kiefer-lg45', 'kiefer-objective']],
  ['gittard-2011', 'gittard-galvo-x', 278, ['gittard-galvo-x', 'gittard-scan-relay', 'gittard-galvo-y', 'gittard-pupil-relay', 'gittard-objective']],
  ['gittard-2011', 'gittard-galvo-y', 0, ['gittard-galvo-y', 'gittard-pupil-relay', 'gittard-objective']],
];

const results = [];
for (const [paper, pivotId, incomingDeg, elementIds] of tasks) {
  const root = resolve(worktrees, paper);
  const moduleAt = name => import(pathToFileURL(resolve(root, 'sketch/js', name)).href);
  const { createElement } = await moduleAt('elements.js');
  const { traceScene } = await moduleAt('raytrace.js');
  const { objectiveBackFocalPlaneX, objectiveLensPlaneX, objectiveEffectiveFocalLength, objectiveStopX } = await moduleAt('objective.js');
  const scenePath = `collections/2pp/setups/${paper}.json`;
  const scene = JSON.parse(readFileSync(resolve(root, scenePath), 'utf8'));
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const opticalChanges = execFileSync('git', ['status', '--porcelain', '--', scenePath, 'sketch/js'], { cwd: root, encoding: 'utf8' }).trim();
  const rows = [];
  for (const mechanicalAngleDeg of [-0.2, 0, 0.2]) {
    const elements = structuredClone(scene.elements.filter(element => elementIds.includes(element.id)));
    const pivot = elements.find(element => element.id === pivotId);
    if (!pivot || elements.length !== elementIds.length) throw new Error(`${paper}: expected optical element missing`);
    for (const element of elements) {
      if (element.type === 'galvo') {
        element.params.scanMode = 'static';
        element.params.commandAngle = element.id === pivotId ? mechanicalAngleDeg : 0;
      }
      if (element.type === 'resonantscanner') {
        element.params.scanAmplitude = 0;
        element.params.centerAngle = element.id === pivotId ? mechanicalAngleDeg : 0;
      }
    }
    const incoming = incomingDeg * Math.PI / 180;
    const dx = Math.cos(incoming), dy = Math.sin(incoming);
    const sources = Array.from({ length: 9 }, (_, index) => {
      const heightMm = (index - 4) / 4;
      const source = createElement('pulsedlaser', pivot.x - 100 * dx - heightMm * dy, pivot.y - 100 * dy + heightMm * dx);
      source.rot = incomingDeg;
      Object.assign(source.params, { beamMode: 'line', bandwidth: 0 });
      return source;
    });
    const traced = traceScene([...sources, ...elements]);
    const objective = elements.find(element => element.type === 'objective');
    const rotation = (objective.rot || 0) * Math.PI / 180;
    const axis = { x: Math.cos(rotation), y: Math.sin(rotation) };
    const pointAt = localX => ({ x: objective.x + localX * axis.x, y: objective.y + localX * axis.y });
    const bfpX = objectiveBackFocalPlaneX(objective.params);
    const focusX = objectiveLensPlaneX(objective.params) + objectiveEffectiveFocalLength(objective.params);
    const measure = center => {
      const crossings = tracedPlaneCrossings(traced.drawables, { center, axis });
      if (crossings.length === 0) return { count: 0, centerMm: null, widthMm: null };
      const heights = crossings.map(point => point.heightMm);
      const low = Math.min(...heights), high = Math.max(...heights);
      return { count: crossings.length, centerMm: (low + high) / 2, widthMm: high - low };
    };
    rows.push({
      mechanicalAngleDeg, opticalAngleDeg: 2 * mechanicalAngleDeg,
      pupil: measure(pointAt(bfpX)), focus: measure(pointAt(focusX)),
      stopClamped: Math.abs(bfpX - objectiveStopX(objective.params)) > 1e-9,
    });
  }
  results.push({ paper, head, scenePath, opticalChanges: opticalChanges || null, pivot: pivotId, incomingDeg, elementIds, rows });
}

console.log(JSON.stringify({
  schemaVersion: 1,
  protocol: 'Nine independent native collimated probe rays across 2 mm, injected before each scanner pivot; downstream scanner/relay/objective only; each original worktree supplies its own tracer and objective model.',
  probeInputRadiusMm: 1,
  sampleCount: 9,
  limitations: 'One meridional geometric plane. Full source illumination, other branches, hologram orders, high-NA PSF, dose and curing are outside this audit.',
  results,
}, null, 2));
