import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from '../sketch/js/elements.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';

const mk = (type, x, y, params = {}) => {
  const element = createElement(type, x, y);
  element.id = `${type}-${x}-${y}`;
  Object.assign(element.params, params);
  return element;
};

test('zero or invalid source power cannot illuminate resin or detectors', () => {
  for (const type of ['cwlaser', 'pulsedlaser', 'sclaser']) {
    const source = mk(type, 0, 0, { beamMode: 'line' });
    const stage = mk('stage', 150, 0, { specimenType: 'resin', voxelPreview: true });
    stage.rot = 90;
    const detector = mk('detector', 120, 0);
    for (const avgPowerW of [0, -1, NaN, Infinity, -Infinity, null, '0']) {
      source.params.avgPowerW = avgPowerW;
      const resinTrace = traceScene([source, stage]);
      assert.equal(resinTrace.drawables.length, 0, `${type} at ${avgPowerW}: no rays`);
      assert.equal(resinTrace.writeHits.length, 0, `${type} at ${avgPowerW}: no writing`);
      assert.equal(resinTrace.signalHits.length, 0, `${type} at ${avgPowerW}: no sample signal`);
      traceScene([source, detector]);
      assert.equal((detectorReading(detector.id)?.signal || 0), 0, `${type} at ${avgPowerW}: dark detector`);
    }
    // Positive power changes watt readouts, not the normalized geometric ray
    // weights. A legacy file with no power field keeps that qualitative path.
    for (const avgPowerW of [1e-12, 0.1, 1000, undefined]) {
      source.params.avgPowerW = avgPowerW;
      const result = traceScene([source, stage]);
      assert.ok(result.drawables.length > 0, `${type} at ${avgPowerW}: active path`);
      assert.ok(result.drawables.every(path => (path.pts || []).every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
    }
  }
});
