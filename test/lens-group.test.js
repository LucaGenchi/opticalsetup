import test from 'node:test';
import assert from 'node:assert/strict';

import { thickLensCardinals } from '../sketch/js/elements.js';
import { glassIndex } from '../sketch/js/glass.js';
import {
  AIR, DEFAULT_TABLE, LENS_GROUP_PRESETS, MAX_SURFACE_ROWS, MIN_CEMENT_GAP,
  normalizeSurfaceRow, normalizeSurfaceTable, presetRows, realizedSurfaces,
  surfaceTableAxialColour, surfaceTableCardinals, surfaceTableSummary, surfaceTableToBodies,
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
