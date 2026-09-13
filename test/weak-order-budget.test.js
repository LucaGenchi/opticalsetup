import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, registry } from '../sketch/js/elements.js';
import { traceScene } from '../sketch/js/raytrace.js';

const transmission = Math.cos(67.5 * Math.PI / 180) ** 2;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

// A common weak-order chain: an analyzer, programmed/residual SLM ports and
// an observation pickoff. Every optical face is wide enough to avoid clipping,
// so changing the order count cannot change the collected source-power share.
function bench(count, mode = 'beam', levels = 1) {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, { beamMode: mode, beamWidth: 8, pol: 67.5,
    transformLimited: false, bandwidth: 0 });
  const analyzer = createElement('polarizer', 75, 0);
  const masks = Array.from({ length: levels }, (_, i) => {
    const mask = createElement('slm', 120 + i * 50, 0);
    Object.assign(mask.params, { length: 100, transmissive: true,
      zeroOrder: levels === 1, zeroFrac: 0.7,
      layers: [{ type: 'focusgrid', n: count, f: 3000 }] });
    return mask;
  });
  const pickoff = createElement('bs', 140 + levels * 50, 0);
  Object.assign(pickoff.params, { ratio: 0.8, size: 100 });
  const stage = createElement('stage', 200 + levels * 50, 0);
  stage.rot = 90;
  Object.assign(stage.params, { aperture: 100, specimenType: 'resin', voxelPreview: true });
  return [laser, analyzer, ...masks, pickoff, stage];
}

test('one through eight weak focus orders retain every aperture sample and their original power', () => {
  for (const count of [1, 4, 7, 8]) {
    for (const mode of ['line', 'beam']) {
      const scene = bench(count, mode);
      const groups = traceScene(scene).writeHits.filter(hit => hit.arrivalGroup);
      assert.equal(groups.length, count, `${count} orders in ${mode} mode`);
      assert.ok(groups.every(hit => hit.arrivalSamples === (mode === 'beam' ? 25 : 1)),
        'later aperture samples receive the same allowance as the first sample');
      for (const group of groups) near(group.intensity, transmission * 0.3 * 0.8 / count);
      near(groups.reduce((sum, hit) => sum + hit.intensity, 0), transmission * 0.3 * 0.8);
      scene[0].params.pol = 90;
      assert.equal(traceScene(scene).writeHits.length, 0, 'budget retention cannot revive exactly extinguished light');
    }
  }
});

test('exhausted weak-order budgets stay fair across aperture samples and never renormalize survivors', () => {
  // Four separate eight-order devices deliberately exceed the finite trace
  // allowance. Reverse the spatial traversal order and exceed the usual source
  // sampling count as well: neither case may favour the first beam edge.
  const originalSource = registry.pulsedlaser.source;
  const scene = bench(8, 'beam', 4);
  const counts = [];
  try {
    for (const sampleCount of [25, 129]) {
      let first;
      for (const reverse of [false, true]) {
        registry.pulsedlaser.source = () => {
          const samples = Array.from({ length: sampleCount }, (_, i) => ({
            x: 52, y: -4 + 8 * i / (sampleCount - 1), dx: 1, dy: 0,
            sample: i, sampleGrid: 'edges',
          }));
          return reverse ? samples.reverse() : samples;
        };
        const result = traceScene(scene);
        const groups = result.writeHits.filter(hit => hit.arrivalGroup)
          .sort((a, b) => a.arrivalGroup.localeCompare(b.arrivalGroup));
        assert.ok(groups.length > 0 && groups.length < 8 ** 4, 'the stress trace must actually reach its budget');
        assert.ok(groups.every(hit => hit.arrivalSamples === sampleCount),
          'retained routes keep equal spatial support even when the budget is exhausted');
        for (const group of groups) near(group.intensity, transmission * 0.8 / 8 ** 4);
        assert.ok(groups.reduce((sum, hit) => sum + hit.intensity, 0) < transmission * 0.8,
          'discarded power is not redistributed to the remaining directions');
        assert.ok(result.drawables.every(drawable => (drawable.pts || [])
          .every(point => Number.isFinite(point.x) && Number.isFinite(point.y))));
        if (first) {
          assert.deepEqual(groups.map(hit => hit.arrivalGroup), first.map(hit => hit.arrivalGroup));
          groups.forEach((hit, i) => {
            near(hit.intensity, first[i].intensity);
            near(hit.spreadMm, first[i].spreadMm);
          });
        } else first = groups;
      }
      counts.push(first.length);
    }
  } finally { registry.pulsedlaser.source = originalSource; }
  assert.ok(counts[1] < counts[0], 'the source-wide cap bounds growth beyond normal spatial sampling');
});
