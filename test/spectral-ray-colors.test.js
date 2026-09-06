import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from '../sketch/js/elements.js';
import { traceAll, traceScene } from '../sketch/js/raytrace.js';
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

test('pulse packets are drawn in the same colour as the ray they travel along', () => {
  // The static stroke and the pulse packet moving along it are the same light.
  // They were resolved by two separate expressions, which is how they drifted:
  // one learned that dispersion outranks an inherited tint and the other did
  // not, so an animated export disagreed with the canvas it was exported from.
  const source = createElement('sclaser', 0, 0);
  Object.assign(source.params, { beamMode: 'line', scMin: 400, scMax: 700 });
  const grating = createElement('grating', 150, 0);
  Object.assign(grating.params, { transmissive: true, lines: 300, orders: '-1,0,1' });

  const { drawables, pulseTracks } = traceScene([source, grating], []);
  assert.ok(pulseTracks.length > 0, 'the scene must animate for this to mean anything');
  const packetColors = new Set(pulseTracks.map(t => t.color));
  // Compare only the colours that are a wavelength's own. Undispersed
  // broadband light is drawn as a layered glyph in its own palette rather than
  // as one stroke, so those colours are not comparable and are not the point.
  const spectral = new Set();
  for (let wl = 380; wl <= 780; wl++) spectral.add(wavelengthToColor(wl));
  const fanned = new Set(drawables
    .filter(d => d.pts && d.pts[0].x > 145 && spectral.has(d.color))
    .map(d => d.color));
  assert.ok(fanned.size > 3, 'the grating should have fanned the beam');
  for (const color of fanned) {
    assert.ok(packetColors.has(color),
      `rays are drawn ${color} but no packet travelling along them is`);
  }
});

test('inverse layers put the band back together, and it looks it', () => {
  // A +1 grating layer followed by a -1 of the same pitch sends every
  // wavelength back along the direction it arrived on -- that recombination is
  // what a 4f pulse shaper is built from. Light that leaves the way it came in
  // was not, in the end, separated, so it should read as the one beam its
  // coincident samples draw rather than as a stack of coloured strokes.
  const source = createElement('sclaser', 0, 0);
  Object.assign(source.params, { beamMode: 'line', scMin: 400, scMax: 700, showPulse: false });
  const shaper = createElement('slm', 150, 0);
  Object.assign(shaper.params, {
    transmissive: true,
    layers: [
      { type: 'grating', lines: 300, orders: '1' },
      { type: 'grating', lines: 300, orders: '-1' },
    ],
  });
  const { drawables } = traceScene([source, shaper], []);
  const out = drawables.filter(d => d.pts && d.pts[0].x > 140);
  assert.ok(out.length > 1, 'the shaper should emit a sample per wavelength');
  // Coincident: the band really did come back together.
  const ends = new Set(out.map(d => {
    const p = d.pts[d.pts.length - 1];
    return `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  }));
  assert.equal(ends.size, 1, 'the inverse layer should have undone the first');
  assert.equal(new Set(out.map(d => d.color)).size, 1,
    `recombined light drawn in ${new Set(out.map(d => d.color)).size} colours`);

  // And the control: one grating layer alone still fans.
  shaper.params.layers = [{ type: 'grating', lines: 300, orders: '1' }];
  const fan = traceScene([source, shaper], []).drawables.filter(d => d.pts && d.pts[0].x > 140);
  assert.ok(new Set(fan.map(d => d.color)).size > 3, 'a single layer must still fan');

  // Recombination is a property of the whole band. Steering that brings one
  // wavelength back onto the axis while its siblings still fan has put nothing
  // back together, and that one ray must not go pale among the coloured ones.
  shaper.params.layers = [
    { type: 'grating', lines: 300, orders: '1' },
    { type: 'steer', angle: -9.497 },
  ];
  const steered = traceScene([source, shaper], []).drawables
    .filter(d => d.pts && d.pts[0].x > 140);
  assert.ok(new Set(steered.map(d => d.color)).size > 3,
    'a band that still fans must stay coloured');
  assert.ok(!steered.some(d => d.color === '#cbd8ea'),
    'one wavelength crossing the axis is not the band coming back together');

  // Nor is it a property of the output as a whole. A stack that reassembles
  // one order pair while another still fans has genuinely put the first back
  // together, and that beam should look it even though the rest does not.
  shaper.params.layers = [
    { type: 'grating', lines: 300, orders: '1' },
    { type: 'grating', lines: 300, orders: '-1,0' },
  ];
  const mixed = traceScene([source, shaper], []).drawables
    .filter(d => d.pts && d.pts[0].x > 140);
  assert.ok(mixed.some(d => d.color === '#cbd8ea'),
    'the recombined port should read as one beam');
  assert.ok(new Set(mixed.filter(d => d.color !== '#cbd8ea').map(d => d.color)).size > 3,
    'the port that still fans should stay coloured');
});
