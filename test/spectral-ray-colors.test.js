import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from '../sketch/js/elements.js';
import { traceAll } from '../sketch/js/raytrace.js';
import { wavelengthToColor } from '../sketch/js/util.js';

for (const type of ['grating', 'slm', 'metasurface', 'aod']) {
  test(`${type} gives dispersed continuum slices their wavelength colors`, () => {
    const source = createElement('sclaser', 0, 0);
    Object.assign(source.params, { scMin: 400, scMax: 700, beamMode: 'line', showPulse: false });
    const optic = createElement(type, 150, 0);
    Object.assign(optic.params, { transmissive: true, orders: '1', layers: [{ type: 'grating', lines: 300, orders: '1' }], zero: false });
    const drawables = traceAll([source, optic], []);
    const colors = new Set(drawables.map(d => d.color));
    assert.ok(colors.has(wavelengthToColor(400)), 'violet dispersed edge');
    assert.ok(colors.has(wavelengthToColor(700)), 'red dispersed edge');
    assert.ok(drawables.some(d => d.color === '#dbe7f5' && d.pts?.every(p => p.x <= 150)),
      'incident mixed spectrum keeps its white continuum stroke');
  });
}
