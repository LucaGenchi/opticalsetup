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

// The other half of the rule: a colour is pulled out of a band, or it is the
// beam's own. A source only carries a fixed colour when the user turned
// autoColor off and picked one, so repainting an undispersed ray overrides an
// explicit choice. The prism has always guarded this by recolouring only when
// the child's bandwidth differs from its parent's.
for (const [label, optic] of [
  ['grating', () => {
    const g = createElement('grating', 150, 0);
    Object.assign(g.params, { transmissive: true, lines: 300, orders: '-1,0,1' });
    return g;
  }],
  ['slm grating layer', () => {
    const g = createElement('slm', 150, 0);
    Object.assign(g.params, {
      transmissive: true, layers: [{ type: 'grating', lines: 300, orders: '-1,0,1' }],
    });
    return g;
  }],
  ['aod', () => createElement('aod', 150, 0)],
]) {
  test(`${label} leaves a hand-coloured monochromatic beam alone`, () => {
    const source = createElement('cwlaser', 0, 0);
    Object.assign(source.params,
      { beamMode: 'line', wavelength: 532, autoColor: false, color: '#a020f0' });
    const drawables = traceAll([source, optic()], []);
    const downstream = drawables.filter(d => d.pts && d.pts[0].x > 140);
    assert.ok(downstream.length > 0, 'nothing left the optic to check');
    for (const d of downstream) {
      assert.equal(d.color, '#a020f0',
        `a 532 nm beam the user painted purple came out ${d.color}`);
    }
  });

  test(`${label} still splits a real band into its colours`, () => {
    const source = createElement('cwlaser', 0, 0);
    Object.assign(source.params, {
      beamMode: 'line', wavelength: 550, bwMode: 'band', bandwidth: 300,
      autoColor: false, color: '#a020f0',
    });
    const drawables = traceAll([source, optic()], []);
    const colors = new Set(drawables.filter(d => d.pts && d.pts[0].x > 140).map(d => d.color));
    // The custom colour must not be the whole story any more: dispersion
    // really happened, so the separated wavelengths speak for themselves.
    assert.ok(colors.size > 2,
      `${label} fanned a 300 nm band into only ${colors.size} colour(s)`);
  });
}

test('a filter downstream of a coarsened order repaints it', () => {
  // The colour has to stay derived rather than stamped on the ray. Above about
  // thirteen orders the shaper's ray budget hands each order the whole band in
  // one ray, and such a ray is drawn as mixed light -- but a bandpass further
  // down can narrow it to a single colour, and a colour frozen at the grating
  // would outlive the filter that made it wrong.
  const source = createElement('sclaser', 0, 0);
  // Auto-coloured, so nothing is entitled to a fixed colour and every ray's
  // colour has to follow the light it is actually carrying.
  Object.assign(source.params,
    { beamMode: 'line', scMin: 400, scMax: 700, showPulse: false, autoColor: true });
  const shaper = createElement('slm', 150, 0);
  Object.assign(shaper.params, {
    transmissive: true,
    layers: [{
      type: 'grating', lines: 300,
      orders: Array.from({ length: 13 }, (_, i) => i - 6).join(','),
    }],
  });
  const bandpass = createElement('filter', 260, 0);
  Object.assign(bandpass.params, { ftype: 'bandpass', center: 550, band: 100, length: 600 });

  const drawables = traceAll([source, shaper, bandpass], []);
  const past = drawables.filter(d => d.pts && d.pts[0].x > 255);
  assert.ok(past.length > 0, 'nothing made it past the bandpass');
  for (const d of past) {
    assert.notEqual(d.color, '#cbd8ea',
      'a 100 nm slice at 550 nm still drawn as mixed white');
  }
  // 500-600 nm is green; every surviving ray should agree.
  assert.ok(past.every(d => d.color === wavelengthToColor(550)
    || Math.abs(parseInt(d.color.slice(1, 3), 16) - 0xaa) < 0x30),
    `filtered rays came out ${[...new Set(past.map(d => d.color))].join(' ')}`);
});
