import test from 'node:test';
import assert from 'node:assert/strict';

import { createElement, registry, thickLensCardinals } from '../sketch/js/elements.js';
import { traceScene } from '../sketch/js/raytrace.js';
import { glassIndex } from '../sketch/js/glass.js';
import {
  AIR, DEFAULT_TABLE, LENS_GROUP_PRESETS, MAX_SURFACE_ROWS, MIN_CEMENT_GAP,
  normalizeSurfaceRow, normalizeSurfaceTable, presetRows, realizedSurfaces,
  surfaceRowsOf, surfaceTableAxialColour, surfaceTableCardinals, surfaceTableSummary,
  surfaceTableToBodies,
} from '../sketch/js/lensgroup.js';

// An independent paraxial trace, deliberately re-derived rather than reusing
// the module: real angles rather than reduced ones, and its own expansion of
// cemented interfaces. If both agree the engine is not just self-consistent.
function referenceTrace(rows, wavelength = 587.6) {
  const surfaces = [];
  let x = 0;
  for (let i = 0; i < rows.length; i++) {
    const last = i === rows.length - 1;
    surfaces.push({ x, r: rows[i].r, glass: last ? AIR : rows[i].glass });
    if (last) break;
    x += rows[i].thickness;
    if (rows[i].glass !== AIR && i + 1 < rows.length - 1 && rows[i + 1].glass !== AIR) {
      surfaces.push({ x, r: rows[i + 1].r, glass: AIR });
      x += MIN_CEMENT_GAP;
    }
  }
  let y = 1, u = 0, n = 1;
  for (let i = 0; i < surfaces.length; i++) {
    const n2 = surfaces[i].glass === AIR ? 1 : glassIndex(surfaces[i].glass, wavelength);
    u = surfaces[i].r === 0 ? n * u / n2 : (n * u - y * (n2 - n) / surfaces[i].r) / n2;
    n = n2;
    if (i < surfaces.length - 1) y += (surfaces[i + 1].x - surfaces[i].x) * u;
  }
  return { f: 1 / -u, bfd: y / -u };
}

test('a two-row table is exactly the thick singlet it describes', () => {
  // The group engine and the singlet must not be allowed to drift apart: the
  // same prescription has to give the same numbers through either path.
  for (const [r1, r2, thickness, glass] of [
    [60, -60, 6, 'nbk7'], [51.5, 0, 5, 'nbk7'], [0, -51.5, 5, 'nbk7'],
    [40, -300, 4, 'nbk7'], [-60, 60, 3, 'nbk7'], [80, -80, 6, 'nsf11'], [100, -100, 5, 'silica'],
  ]) {
    const singlet = thickLensCardinals({ r1, r2, thickness, glass, dia: 25.4 });
    const group = surfaceTableCardinals([
      { r: r1, thickness, glass }, { r: r2, thickness: 4, glass: AIR },
    ]);
    assert.ok(Math.abs(singlet.f - group.f) < 1e-9, `f for ${r1}/${r2}: ${singlet.f} vs ${group.f}`);
    assert.ok(Math.abs(singlet.bfd - group.bfd) < 1e-9, `bfd for ${r1}/${r2}`);
  }
});

test('the paraxial engine agrees with an independently derived surface-by-surface trace', () => {
  for (const preset of LENS_GROUP_PRESETS) {
    const mine = surfaceTableCardinals(preset.rows);
    const reference = referenceTrace(preset.rows);
    assert.ok(Math.abs(mine.f - reference.f) < 1e-9, `${preset.id} f: ${mine.f} vs ${reference.f}`);
    assert.ok(Math.abs(mine.bfd - reference.bfd) < 1e-9, `${preset.id} bfd`);
  }
});

test('a cemented interface becomes two real surfaces a cement gap apart', () => {
  // The whole reason this is not one shared surface: the tracer ignores
  // intersections closer than 0.05 mm along a ray and would lose one of them.
  const { surfaces } = realizedSurfaces(DEFAULT_TABLE);
  assert.equal(surfaces.length, 4, 'three rows describe four real surfaces once cemented');
  assert.equal(surfaces[1].r, surfaces[2].r, 'the pair shares its radius');
  assert.ok(Math.abs((surfaces[2].x - surfaces[1].x) - MIN_CEMENT_GAP) < 1e-12);
  assert.equal(surfaces[1].glassAfter, AIR, 'the gap really is air');
  assert.equal(surfaces[2].glassAfter, 'nsf11');

  const { bodies } = surfaceTableToBodies(DEFAULT_TABLE, { diameter: 25.4 });
  assert.equal(bodies.length, 2);
  assert.ok(Math.abs((bodies[1].xv1 - bodies[0].xv2) - MIN_CEMENT_GAP) < 1e-9,
    'the drawn bodies are held apart too, not just the surface list');
  assert.equal(bodies[1].cementedToPrevious, true);
  assert.equal(bodies[0].glass, 'nbk7');
  assert.equal(bodies[1].glass, 'nsf11');
});

test('an air row is a real gap, not a cemented one', () => {
  const airspaced = presetRows('airspaced');
  const { surfaces } = realizedSurfaces(airspaced);
  assert.equal(surfaces.length, 4, 'no interface is duplicated');
  const { bodies } = surfaceTableToBodies(airspaced, { diameter: 25.4 });
  assert.equal(bodies.length, 2);
  assert.ok(Math.abs((bodies[1].xv1 - bodies[0].xv2) - 1.2) < 1e-9, 'the authored 1.2 mm gap survives');
});

test('the presets are what they claim: an achromat really beats its singlet', () => {
  const at = id => {
    const rows = presetRows(id);
    return { f: surfaceTableCardinals(rows).f, colour: surfaceTableAxialColour(rows) };
  };
  const singlet = at('singlet'), airspaced = at('airspaced'), doublet = at('doublet');
  for (const [id, v] of [['singlet', singlet], ['airspaced', airspaced], ['doublet', doublet]]) {
    assert.ok(Math.abs(v.f - 100) < 0.05, `${id} is a 100 mm lens so the three compare directly`);
  }
  assert.ok(Math.abs(singlet.colour) > 1, 'an uncorrected singlet has millimetres of axial colour');
  assert.ok(Math.abs(airspaced.colour) < Math.abs(singlet.colour) / 50, 'air-spaced pair: ~100x better');
  assert.ok(Math.abs(doublet.colour) < Math.abs(singlet.colour) / 1000, 'cemented achromat: ~4600x better');
});

test('surface tables are bounded and always close into air', () => {
  assert.equal(normalizeSurfaceRow({ r: '60', thickness: '4', glass: 'nbk7' }).r, 60);
  assert.equal(normalizeSurfaceRow({ r: 1e-9 }).r, 0, 'a hair of curvature is flat');
  assert.equal(normalizeSurfaceRow({ r: 99999 }).r, 2000, 'radius is bounded');
  assert.equal(normalizeSurfaceRow({ thickness: -5 }).thickness, 0.2, 'thickness cannot invert');
  assert.equal(normalizeSurfaceRow({ glass: 'unobtainium' }).glass, AIR, 'an unknown glass is air');
  assert.equal(normalizeSurfaceRow({}).glass, AIR);

  assert.deepEqual(normalizeSurfaceTable(null), DEFAULT_TABLE.map(normalizeSurfaceRow));
  assert.deepEqual(normalizeSurfaceTable([{ r: 5 }]), DEFAULT_TABLE.map(normalizeSurfaceRow),
    'a table needs at least two surfaces to bound a body');
  assert.equal(normalizeSurfaceTable(Array(40).fill({ r: 10, glass: 'nbk7' })).length, MAX_SURFACE_ROWS);
  assert.equal(normalizeSurfaceTable([{ r: 10, glass: 'nbk7' }, { r: -10, glass: 'nbk7' }]).at(-1).glass, AIR,
    'the last surface always exits into air, or the final body has no back');
});

test('the summary names the assembly it was handed', () => {
  assert.equal(surfaceTableSummary(presetRows('singlet')).name, 'Singlet');
  assert.equal(surfaceTableSummary(presetRows('doublet')).name, 'Cemented doublet');
  assert.equal(surfaceTableSummary(presetRows('airspaced')).name, 'Air-spaced doublet');
  assert.equal(surfaceTableSummary(presetRows('doublet')).elements, 2);
  assert.equal(surfaceTableSummary(presetRows('doublet')).cementedPairs, 1);
  assert.equal(surfaceTableSummary(presetRows('airspaced')).cementedPairs, 0);
});

test('extreme tables produce closed geometry rather than NaN', () => {
  const radii = [-2000, -60, -13, -0.4, 0, 0.4, 13, 60, 2000];
  const glasses = [AIR, 'nbk7', 'nsf11'];
  let combos = 0;
  for (const r1 of radii) for (const r2 of radii) for (const g1 of glasses) for (const g2 of glasses) {
    for (const diameter of [1, 25.4, 100]) {
      const rows = [
        { r: r1, thickness: 0.2, glass: g1 },
        { r: r2, thickness: 60, glass: g2 },
        { r: -r1, thickness: 4, glass: AIR },
      ];
      combos++;
      const { bodies, span } = surfaceTableToBodies(rows, { diameter });
      assert.ok(Number.isFinite(span) && span >= 0, `span at ${r1}/${r2}/${g1}/${g2}`);
      for (const body of bodies) {
        for (const pt of body.points) {
          assert.ok(Number.isFinite(pt.x) && Number.isFinite(pt.y), `point at ${r1}/${r2}`);
        }
        assert.ok(body.xv2 > body.xv1 - 1e-9, 'a body never turns inside out');
      }
      const cardinals = surfaceTableCardinals(rows);
      assert.ok(Number.isFinite(cardinals.f) || cardinals.f === Infinity, 'focal length stays a number');
    }
  }
  assert.ok(combos > 700, `swept ${combos} combinations`);
});

test('a group too thin for its own aperture is thickened, and the readouts follow', () => {
  // The subtle one: widening the clear aperture forces a body to grow until
  // its faces stop crossing at the rim, which MOVES every surface behind it.
  // If the cardinals kept reading the prescription instead of the realized
  // geometry, the reported focal length would quietly stop being the traced
  // one — which is exactly what happened the first time.
  const rows = presetRows('doublet');
  const narrow = realizedSurfaces(rows, { diameter: 25.4 });
  const wide = realizedSurfaces(rows, { diameter: 50.8 });
  assert.ok(wide.surfaces.at(-1).x > narrow.surfaces.at(-1).x + 1,
    'a 50.8 mm aperture needs materially more glass than a 25.4 mm one');
  assert.notEqual(
    surfaceTableCardinals(rows, 587.6, { diameter: 50.8 }).bfd,
    surfaceTableCardinals(rows, 587.6, { diameter: 25.4 }).bfd,
    'and the reported back focal distance has to notice',
  );
  // the cement gap survives the thickening
  const gaps = [];
  for (let i = 1; i < wide.surfaces.length; i++) {
    if (wide.surfaces[i - 1].cementBack) gaps.push(wide.surfaces[i].x - wide.surfaces[i - 1].x);
  }
  assert.equal(gaps.length, 1);
  assert.ok(Math.abs(gaps[0] - MIN_CEMENT_GAP) < 1e-9, 'thickening must not eat the cement gap');
});

test('the traced focus matches the reported back focal distance', () => {
  // The readouts are only worth showing if the tracer agrees with them.
  for (const id of ['singlet', 'doublet', 'airspaced']) {
    const element = createElement('lensgroup', 300, 0);
    element.params.preset = id;
    const rows = surfaceRowsOf(element.params);
    const geometry = surfaceTableToBodies(rows, { diameter: element.params.dia });
    const predicted = 300 + geometry.vertices.at(-1)
      + surfaceTableCardinals(rows, 587.6, { diameter: element.params.dia }).bfd;

    const laser = createElement('cwlaser', 60, 0.2);
    laser.params.beamMode = 'line';
    laser.params.wavelength = 587.6;   // the d line the readouts quote
    const paths = traceScene([laser, element], []).drawables.filter(d => d.type === 'path' && d.pts.length >= 2);
    const ray = paths.reduce((a, b) => (b.pts.length > a.pts.length ? b : a));
    const a = ray.pts.at(-2), b = ray.pts.at(-1);
    const crossing = a.x - a.y / ((b.y - a.y) / (b.x - a.x));
    assert.ok(Math.abs(crossing - predicted) < 0.01, `${id}: traced ${crossing} vs reported ${predicted}`);
  }
});

test('an achromat corrects its own colour, because the geometry does it', () => {
  // Nothing tells the doublet to be achromatic; it comes out of tracing two
  // glasses with different dispersion through the shape that cancels them.
  const focusAt = (id, wavelength) => {
    const element = createElement('lensgroup', 300, 0);
    element.params.preset = id;
    const laser = createElement('cwlaser', 60, 0.2);
    laser.params.beamMode = 'line';
    laser.params.wavelength = wavelength;
    const paths = traceScene([laser, element], []).drawables.filter(d => d.type === 'path' && d.pts.length >= 2);
    const ray = paths.reduce((a, b) => (b.pts.length > a.pts.length ? b : a));
    const a = ray.pts.at(-2), b = ray.pts.at(-1);
    return a.x - a.y / ((b.y - a.y) / (b.x - a.x));
  };
  const colour = id => focusAt(id, 486.1) - focusAt(id, 656.3);
  const singlet = colour('singlet'), doublet = colour('doublet');
  assert.ok(Math.abs(singlet) > 1, 'the singlet really is uncorrected');
  assert.ok(Math.abs(doublet) < Math.abs(singlet) / 1000, `doublet ${doublet} vs singlet ${singlet}`);
  // and the traced colour is the one the inspector reports
  for (const id of ['singlet', 'airspaced', 'doublet']) {
    const predicted = surfaceTableAxialColour(presetRows(id), { diameter: 25.4 });
    assert.ok(Math.abs(colour(id) - predicted) < 0.01, `${id}: traced ${colour(id)} vs reported ${predicted}`);
  }
});

test('every body of a group gets its own topology key', () => {
  // The tracer tells interactions apart by element id plus topology key, so
  // two bodies of one element would collide on `face-0` and one of them would
  // be treated as a repeat of the other.
  const element = createElement('lensgroup', 0, 0);
  element.params.preset = 'doublet';
  const keys = registry.lensgroup.surfaces(element).map(s => s.data.topologyKey);
  assert.equal(keys.length, 8, 'two bodies, four faces each');
  assert.equal(new Set(keys).size, keys.length, 'and every key is distinct');
  const glasses = new Set(registry.lensgroup.surfaces(element).map(s => s.data.material));
  assert.deepEqual([...glasses].sort(), ['nbk7', 'nsf11'], 'each body carries its own glass');
});
