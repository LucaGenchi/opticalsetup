import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry } from '../sketch/js/elements.js';
import { initInspector, renderInspector } from '../sketch/js/inspector.js';
import { traceAll } from '../sketch/js/raytrace.js';
import { parseSketch, state } from '../sketch/js/state.js';
import {
  normalizePhaseCycle, phaseCycleFrame, phaseCycleGradient,
} from '../sketch/js/slm-pattern.js';

function cycleFromColumns(columns, name = 'cycle.png') {
  const height = columns[0].length;
  const width = columns.length;
  const bytes = [];
  for (let row = 0; row < height; row++) {
    for (let frame = 0; frame < width; frame++) bytes.push(columns[frame][row]);
  }
  return { name, width, height, data: Buffer.from(bytes).toString('base64') };
}

function finalAngle(path) {
  const a = path.pts.at(-2), b = path.pts.at(-1);
  return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
}

test('SLM phase cycle selects discrete PNG columns and loops at the configured time', () => {
  const cycle = cycleFromColumns([[0, 32], [64, 96], [128, 160], [192, 224]]);
  assert.equal(phaseCycleFrame(cycle, 0, 2), 0);
  assert.equal(phaseCycleFrame(cycle, 0.499, 2), 0);
  assert.equal(phaseCycleFrame(cycle, 0.5, 2), 1);
  assert.equal(phaseCycleFrame(cycle, 1.999, 2), 3);
  assert.equal(phaseCycleFrame(cycle, 2, 2), 0);
});

test('SLM phase cycle turns opposite phase ramps into opposite ray steering', () => {
  const cycle = cycleFromColumns([
    [0, 32, 64, 96, 128],
    [128, 96, 64, 32, 0],
  ]);
  assert.ok(phaseCycleGradient(cycle, 0.5, 0, 2, 40) > 0);
  assert.ok(phaseCycleGradient(cycle, 0.5, 1.1, 2, 40) < 0);

  const laser = createElement('cwlaser', 0, 0);
  laser.params.beamMode = 'line';
  const slm = createElement('slm', 180, 0);
  slm.params.phaseCycle = cycle;
  slm.params.cycleTime = 2;

  slm._animationTimeS = 0;
  const up = traceAll([laser, slm]).find(path => path.type === 'path' && Math.abs(path.pts[0].x - 171) < 1e-6);
  slm._animationTimeS = 1.1;
  const down = traceAll([laser, slm]).find(path => path.type === 'path' && Math.abs(path.pts[0].x - 171) < 1e-6);
  assert.ok(finalAngle(up) > 0, `first frame should steer upward, got ${finalAngle(up)}°`);
  assert.ok(finalAngle(down) < 0, `second frame should steer downward, got ${finalAngle(down)}°`);
});

test('SLM phase patterns survive sketch loading while malformed payloads are discarded', () => {
  const cycle = cycleFromColumns([[0, 64, 128], [255, 128, 0]], 'scan.png');
  const slm = createElement('slm', 20, 30);
  slm.params.phaseCycle = cycle;
  slm.params.cycleTime = 4.5;
  const file = JSON.stringify({ app: 'optics2d', version: 1, elements: [slm], beams: [] });
  const [loaded] = parseSketch(file, registry).elements;
  assert.deepEqual(loaded.params.phaseCycle, cycle);
  assert.equal(loaded.params.cycleTime, 4.5);

  assert.equal(normalizePhaseCycle({ ...cycle, data: 'not base64' }), null);
  assert.equal(normalizePhaseCycle({ ...cycle, width: 9999 }), null);
  assert.equal(normalizePhaseCycle({ ...cycle, data: Buffer.from([1]).toString('base64') }), null);
});

test('SLM inspector offers Load before upload and only Delete plus Cycle time afterward', () => {
  const slm = createElement('slm', 0, 0);
  state.elements = [slm];
  state.beams = [];
  state.selection = { kind: 'element', id: slm.id };
  state.demoMode = false;
  const panel = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  initInspector(panel);

  renderInspector();
  assert.match(panel.innerHTML, />Load pattern</);
  assert.doesNotMatch(panel.innerHTML, /id="slmPatternDelete"/);
  assert.doesNotMatch(panel.innerHTML, /Cycle time/);
  assert.doesNotMatch(panel.innerHTML, /Replace/);

  slm.params.phaseCycle = cycleFromColumns([[0, 64, 128], [255, 128, 0]], 'scan.png');
  renderInspector();
  assert.match(panel.innerHTML, /scan\.png/);
  assert.match(panel.innerHTML, /2 time frames × 3 phase pixels/);
  assert.match(panel.innerHTML, /id="slmPatternDelete"[^>]*>Delete<\/button>/);
  assert.match(panel.innerHTML, /Cycle time/);
  assert.doesNotMatch(panel.innerHTML, />Load pattern</);
  assert.doesNotMatch(panel.innerHTML, /Replace/);
});
