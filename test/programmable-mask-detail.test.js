import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, getSize, getVisualBounds, registry } from '../sketch/js/elements.js';
import { buildSVG } from '../sketch/js/export.js';
import { parseSketch, state } from '../sketch/js/state.js';
import { traceScene } from '../sketch/js/raytrace.js';
import {
  programmableFrameSVG, programmableMaskFrame, programmableMaskDetailOptions,
  programmableMaskDetailBounds, programmableMaskDetailSVG,
} from '../sketch/js/programmable-mask.js';

const save = elements => JSON.stringify({ app: 'optics2d', version: 1, elements, beams: [] });

for (const type of ['slm', 'dmd']) {
  test(`${type} inset is optional and cannot change the physical face or traced power`, () => {
    const old = createElement(type, 100, 0);
    old.params = { length: 24 };
    const [loadedOld] = parseSketch(save([old]), registry).elements;
    assert.equal(loadedOld.params.showMaskDetail, false);
    assert.equal(programmableMaskDetailSVG(loadedOld), '');
    assert.equal(programmableMaskDetailBounds(loadedOld), null);

    const source = createElement('pulsedlaser', 0, 0);
    Object.assign(source.params, { beamMode: 'beam', beamWidth: 6, transformLimited: false, bandwidth: 0 });
    const device = createElement(type, 100, 0);
    Object.assign(device.params, { length: 24, transmissive: true, maskPattern: 'uniform', maskLevel: 1 });
    const surface = registry[type].surfaces(device), size = getSize(device);
    const without = traceScene([source, device]);
    Object.assign(device.params, { showMaskDetail: true, maskDetailWidth: 365, maskDetailHeight: 155,
      maskDetailOffsetX: 300, maskDetailOffsetY: 200, maskDetailFontSize: 26 });
    assert.deepEqual(registry[type].surfaces(device), surface);
    assert.deepEqual(getSize(device), size);
    assert.deepEqual(traceScene([source, device]), without);
    assert.match(registry[type].svg(device), /class="programmable-mask-detail"/);
  });

  test(`${type} enlarged pixels, native pixels and optical sampling use the same discrete frame clock`, () => {
    const device = createElement(type, 100, 0);
    Object.assign(device.params, { showMaskDetail: true, maskPattern: 'slices', maskPlayback: true,
      maskRateHz: 1, maskSlice: 0.25 });
    for (const [time, expected] of [[0, 0], [0.999, 0], [1, 1], [4, 0]]) {
      const pose = { ...device, _animationTimeS: time };
      const frame = programmableMaskFrame(device.params, type, time);
      assert.equal(frame.index, expected);
      assert.equal(registry[type].surfaces(pose)[0].data.mask.index, expected);
      const svg = registry[type].svg(pose);
      assert.deepEqual([...svg.matchAll(/data-mask-frame="(\d+)"/g)].map(match => Number(match[1])), [expected, expected]);
      assert.ok(svg.includes(`>${expected + 1} / 4</text>`));
      assert.match(svg, /data-mask-slice="4"/);
      assert.match(svg, />Column 5 \/ 16<\/text>/);
    }
    assert.equal(programmableMaskDetailSVG({ ...device, _animationTimeS: 0.1 }),
      programmableMaskDetailSVG({ ...device, _animationTimeS: 0.9 }));
  });
}

test('the inset preserves all 32×32 custom pixels and highlights the actual endpoint column', () => {
  const device = createElement('slm', 0, 0);
  const grid = Array.from({ length: 32 }, (_, row) => Array.from({ length: 32 }, (_, col) => (row + col) % 2));
  Object.assign(device.params, { showMaskDetail: true, maskPattern: 'custom', maskMode: 'amplitude',
    maskFrames: [grid], maskSlice: 1 });
  const frame = programmableMaskFrame(device.params, 'slm');
  const svg = programmableMaskDetailSVG(device, frame);
  assert.equal((svg.match(/data-mask-pixel=/g) || []).length, 1024);
  assert.match(svg, /data-mask-slice="31"/);
  assert.equal((svg.match(/fill="rgb\(238,238,238\)"/g) || []).length, 512);
  assert.equal((svg.match(/fill="rgb\(30,44,52\)"/g) || []).length, 512);
  assert.ok((programmableFrameSVG(frame).match(/data-mask-pixel=/g) || []).length < 1024,
    'only the physical icon keeps its inexpensive display sampling');
});

test('world placement stays upright and fitted SVG exports contain the same static and animated inset', () => {
  const device = createElement('dmd', 670, 206);
  device.rot = 67;
  Object.assign(device.params, { showMaskDetail: true, maskDetailOffsetX: -645, maskDetailOffsetY: -11,
    maskDetailWidth: 295, maskDetailHeight: 120, maskPattern: 'slices', maskPlayback: true, maskRateHz: 1 });
  const card = programmableMaskDetailBounds(device);
  assert.deepEqual(card, { x0: 25, y0: 195, x1: 320, y1: 315 });
  const visual = getVisualBounds(device);
  assert.ok(visual.x0 <= card.x0 && visual.x1 >= card.x1 && visual.y0 <= card.y0 && visual.y1 >= card.y1);
  state.elements = [device]; state.beams = [];
  const svg = buildSVG();
  assert.ok(svg.includes(programmableMaskDetailSVG(device)));
  assert.match(svg, /transform="rotate\(-67\) translate\(-645 -11\)"/);
  const [x, y, width, height] = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  assert.ok(x <= card.x0 && x + width >= card.x1 && y <= card.y0 && y + height >= card.y1);
  const animated = buildSVG({ animation: { seconds: 1, playback: { mechanicsMode: true } } });
  assert.ok(animated.includes(programmableMaskDetailSVG({ ...device, _animationTimeS: 1 })));
  assert.match(animated, />2 \/ 4<\/text>/);
});

test('inset geometry and typography round-trip and malformed values stay finite inside the saved box', () => {
  const device = createElement('slm', 400, 0);
  Object.assign(device.params, { showMaskDetail: true, maskDetailOffsetX: -250, maskDetailOffsetY: 180,
    maskDetailWidth: 250, maskDetailHeight: 125, maskDetailFontSize: 21 });
  const loaded = parseSketch(save([device]), registry);
  assert.deepEqual(programmableMaskDetailOptions(loaded.elements[0].params), programmableMaskDetailOptions(device.params));
  assert.deepEqual(parseSketch(save(loaded.elements), registry), loaded);
  assert.match(programmableMaskDetailSVG(device), /font-size="21"/);

  const malformed = { showMaskDetail: true, maskDetailOffsetX: Infinity, maskDetailOffsetY: -1e99,
    maskDetailWidth: NaN, maskDetailHeight: 0, maskDetailFontSize: Infinity };
  assert.deepEqual(programmableMaskDetailOptions(malformed), { enabled: true, maskDetailOffsetX: 45,
    maskDetailOffsetY: -5000, maskDetailWidth: 250, maskDetailHeight: 110, maskDetailFontSize: 18 });
  assert.doesNotMatch(programmableMaskDetailSVG({ ...device, params: malformed }), /NaN|Infinity/);

  for (const [width, height, requested] of [[365, 155, 26], [130, 110, 36]]) {
    Object.assign(device.params, { maskDetailWidth: width, maskDetailHeight: height, maskDetailFontSize: requested });
    const bounds = programmableMaskDetailBounds(device);
    const svg = programmableMaskDetailSVG(device);
    assert.equal(bounds.x1 - bounds.x0, width);
    assert.equal(bounds.y1 - bounds.y0, height);
    const fonts = [...svg.matchAll(/font-size="([\d.]+)"/g)].map(match => Number(match[1]));
    assert.ok(fonts.every(font => font > 0 && font <= requested));
    if (width === 365) assert.ok(fonts.includes(26), 'the larger paper panel can use the requested readable type');
    else assert.ok(Math.max(...fonts) < requested, 'oversized text fits down without enlarging the saved panel');
  }
});
