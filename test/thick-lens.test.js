import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createElement, getElementMeta, MIN_CEMENT_GAP, registry, surfaceTransmission,
  thickLensAdjustment, thickLensCardinals, thickLensGeometry, thickLensShapeName,
  touchingGlassBody,
} from '../sketch/js/elements.js';
import { detectorReading, traceAll, traceScene } from '../sketch/js/raytrace.js';
import { GLASSES, glassAbbe, glassIndex, isDispersiveGlass, LEGACY_GLASS_ID, LEGACY_GLASS_REPLACEMENT } from '../sketch/js/glass.js';
import { parseSketch } from '../sketch/js/state.js';
import '../sketch/js/detector-instruments.js';

const X = 200;

// Where a single ray at height `h` crosses the axis after the lens — the
// measurement every optical bench makes, and the one that can't be faked by
// the element reporting its own focal length.
function axisCrossing(params, h, wl = 587.6) {
  const lens = createElement('thicklens', X, 0);
  Object.assign(lens.params, { dia: 25.4, glass: 'nbk7', transmission: 1, ...params });
  const laser = createElement('cwlaser', 0, h);
  Object.assign(laser.params, { beamMode: 'line', wavelength: wl });
  const path = traceScene([laser, lens]).drawables
    .filter(d => d.type === 'path').sort((a, b) => b.pts.length - a.pts.length)[0];
  if (!path || path.pts.length < 3) return null;
  const a = path.pts.at(-2), b = path.pts.at(-1);
  if (Math.abs(b.y - a.y) < 1e-12) return null;
  return a.x + (b.x - a.x) * (0 - a.y) / (b.y - a.y);
}
const tracedBFD = (params, h, wl) => {
  const cross = axisCrossing(params, h, wl);
  return cross === null ? null : cross - (X + thickLensGeometry({ dia: 25.4, ...params }).xv2);
};

// ---------------- glass catalogue ----------------

test('catalogue glasses reproduce their published nd and Abbe number', () => {
  for (const [id, expected] of [['nbk7', [1.5168, 64.17]], ['nsf11', [1.7847, 25.68]], ['silica', [1.4585, 67.82]]]) {
    assert.ok(Math.abs(glassIndex(id, 587.6) - expected[0]) < 5e-5, `${id} nd`);
    assert.ok(Math.abs(glassAbbe(id) - expected[1]) < 0.05, `${id} Abbe number`);
  }
  // a flint really is far more dispersive than a crown
  assert.ok(glassAbbe('nsf11') < glassAbbe('nbk7') / 2);
});

test('the rough legacy BK7 fit is gone, and any sketch naming it loads onto real N-BK7', () => {
  assert.equal(GLASSES.has(LEGACY_GLASS_ID), false, 'no second, less accurate BK7 remains');
  assert.equal(isDispersiveGlass(LEGACY_GLASS_ID), false);
  assert.equal(isDispersiveGlass('constant'), false, 'a fixed index must not be sampled for dispersion');
  assert.equal(isDispersiveGlass(undefined), false);

  // A saved freeglass body still naming it must not silently fall through the
  // select's option check and land on a constant index.
  const raw = { type: 'freeglass', x: 0, y: 0, params: { material: LEGACY_GLASS_ID, ior: 1.5 } };
  const [loaded] = parseSketch(
    JSON.stringify({ app: 'optics2d', version: 1, elements: [raw], beams: [] }), registry).elements;
  assert.equal(loaded.params.material, LEGACY_GLASS_REPLACEMENT);
  assert.equal(isDispersiveGlass(loaded.params.material), true);

  const [loadedWithoutRegistry] = parseSketch(
    JSON.stringify({ app: 'optics2d', version: 1, elements: [raw], beams: [] })).elements;
  assert.equal(loadedWithoutRegistry.params.material, LEGACY_GLASS_REPLACEMENT,
    'the default parse path must apply the same migration');
});

test('shape names follow the Cartesian sign convention the lensmaker equation needs', () => {
  // R is positive when the centre of curvature lies further along the ray, so
  // a biconvex lens is R1 > 0 with R2 < 0 — the rear face bulges out at a
  // NEGATIVE radius. This readout exists so nobody has to hold that in mind.
  const shape = (r1, r2) => thickLensShapeName({ r1, r2, thickness: 5, dia: 25.4, glass: 'nbk7' });
  assert.equal(shape(60, -60), 'Biconvex');
  assert.equal(shape(-60, 60), 'Biconcave');
  assert.equal(shape(50, 0), 'Convex-plano');
  assert.equal(shape(0, -50), 'Plano-convex');
  assert.equal(shape(0, 50), 'Plano-concave');
  assert.equal(shape(0, 0), 'Plane slab');
  assert.match(shape(40, 80), /^Meniscus/, 'same-sign radii are a meniscus, not a bi- lens');

  // and the names agree with the sign of the power the trace produces
  assert.ok(thickLensCardinals({ r1: 60, r2: -60, thickness: 5, dia: 25.4, glass: 'nbk7' }).f > 0);
  assert.ok(thickLensCardinals({ r1: -60, r2: 60, thickness: 5, dia: 25.4, glass: 'nbk7' }).f < 0);
});

test('the singlet and the group it generalises sit before the lens assemblies', () => {
  const lensPalette = Object.entries(registry)
    .filter(([, definition]) => definition.category === 'Lenses')
    .sort(([, a], [, b]) => a.paletteOrder - b.paletteOrder)
    .map(([type]) => type);
  assert.deepEqual(lensPalette, ['lens', 'lensc', 'thicklens', 'lensgroup', 'telescope', 'objective']);
});

test('the cement gap is just wide enough for the tracer to see both interfaces', () => {
  // rayArcHit/rayLineHit ignore any hit closer than t = 0.05, so two bodies in
  // true contact lose one of their coincident faces and the ray wrongly exits
  // into air. MIN_CEMENT_GAP has to clear that epsilon.
  assert.ok(MIN_CEMENT_GAP > 0.05, 'must exceed the tracer epsilon');
  assert.ok(MIN_CEMENT_GAP < 0.2, 'but stay optically negligible');

  const n1 = 1.5168, n2 = 1.7847, X = 0;
  const paraxial = surfs => {
    let y = 1, ub = 0;
    surfs.forEach((s, i) => {
      ub -= y * (s.n2 - s.n1) / s.R;
      if (i < surfs.length - 1) y += (surfs[i + 1].x - s.x) / s.n2 * ub;
    });
    return surfs.at(-1).x + (-y / ub);
  };
  const cemented = paraxial([
    { x: X - 2, R: 40, n1: 1, n2: n1 }, { x: X + 2, R: -137.7, n1, n2 },
    { x: X + 4.5, R: 600, n1: n2, n2: 1 }]);
  const gapped = paraxial([
    { x: X - 2, R: 40, n1: 1, n2: n1 }, { x: X + 2, R: -137.7, n1, n2: 1 },
    { x: X + 2 + MIN_CEMENT_GAP, R: -137.7, n1: 1, n2 },
    { x: X + 4.5 + MIN_CEMENT_GAP, R: 600, n1: n2, n2: 1 }]);
  const errorFraction = Math.abs(gapped - cemented) / cemented;
  assert.ok(errorFraction < 0.005,
    `standing in for cement costs ${(errorFraction * 100).toFixed(3)}%, which must stay well under 0.5%`);
});

test('every catalogue glass has a sane index across the whole traced spectrum', () => {
  for (const id of GLASSES.keys()) {
    for (const wl of [150, 400, 587.6, 1064, 20000]) {
      const n = glassIndex(id, wl);
      assert.ok(Number.isFinite(n) && n > 1 && n < 2.5, `${id} at ${wl}nm gave ${n}`);
    }
    // normal dispersion: index always falls with wavelength
    assert.ok(glassIndex(id, 450) > glassIndex(id, 650), `${id} must disperse normally`);
  }
});

// ---------------- the trace matches the lensmaker's equation ----------------

test('traced focal length matches the thick lensmaker equation for every shape', () => {
  const shapes = [
    ['biconvex', { r1: 60, r2: -60, thickness: 6 }],
    ['plano-convex', { r1: 50, r2: 0, thickness: 5 }],
    ['convex-plano', { r1: 0, r2: -50, thickness: 5 }],
    ['meniscus', { r1: 40, r2: 80, thickness: 4 }],
    ['biconcave (diverging)', { r1: -60, r2: 60, thickness: 3 }],
    ['dense flint', { r1: 60, r2: -60, thickness: 6, glass: 'nsf11' }],
  ];
  for (const [name, params] of shapes) {
    const { bfd } = thickLensCardinals({ dia: 25.4, glass: 'nbk7', ...params });
    const traced = tracedBFD(params, 0.3);
    assert.ok(traced !== null, `${name} produced no ray`);
    // a near-axis ray is paraxial, so it must land on the analytic BFD
    assert.ok(Math.abs(traced - bfd) < 0.05,
      `${name}: traced ${traced.toFixed(3)} vs theory ${bfd.toFixed(3)}`);
  }
});

test('the thickness term is real, not a thin-lens approximation wearing a coat', () => {
  const thin = thickLensCardinals({ r1: 60, r2: -60, thickness: 0.5, dia: 25.4, glass: 'nbk7' });
  const fat = thickLensCardinals({ r1: 60, r2: -60, thickness: 20, dia: 25.4, glass: 'nbk7' });
  assert.ok(fat.f > thin.f, 'a thicker biconvex lens has a longer focal length');
  // and the trace agrees with that shift, so it is not just a reported number
  assert.ok(Math.abs(tracedBFD({ r1: 60, r2: -60, thickness: 20 }, 0.3) - fat.bfd) < 0.05);
});

// ---------------- aberrations emerge from the geometry ----------------

test('spherical aberration appears on its own: marginal rays focus short', () => {
  const params = { r1: 60, r2: -60, thickness: 6, dia: 50.8 };
  const paraxial = tracedBFD(params, 0.5);
  const marginal = tracedBFD(params, 24);
  assert.ok(marginal < paraxial - 1,
    `marginal (${marginal.toFixed(2)}) must focus shorter than paraxial (${paraxial.toFixed(2)})`);

  // and it must grow monotonically with ray height, as a real sphere does
  const heights = [0.5, 5, 10, 15, 20, 24].map(h => tracedBFD(params, h));
  for (let i = 1; i < heights.length; i++) {
    assert.ok(heights[i] < heights[i - 1], 'focus must shorten monotonically with ray height');
  }
});

test('chromatic aberration appears on its own, and scales with the Abbe number', () => {
  const shape = { r1: 60, r2: -60, thickness: 6, dia: 50.8 };
  const colour = glass => {
    const F = tracedBFD({ ...shape, glass }, 3, 486.1);
    const C = tracedBFD({ ...shape, glass }, 3, 656.3);
    return C - F; // positive: blue focuses shorter, as it must for normal dispersion
  };
  const crown = colour('nbk7'), flint = colour('nsf11');
  assert.ok(crown > 0, 'blue must focus shorter than red');
  assert.ok(flint > 0);

  // a low-Abbe flint disperses far more; compare each against its own f/V
  for (const glass of ['nbk7', 'nsf11', 'silica']) {
    const { f } = thickLensCardinals({ ...shape, glass });
    const predicted = f / glassAbbe(glass);
    const measured = colour(glass);
    assert.ok(Math.abs(measured - predicted) / predicted < 0.15,
      `${glass}: measured ${measured.toFixed(3)} vs f/V ${predicted.toFixed(3)}`);
  }
});

test('an air-spaced crown+flint doublet cancels the colour a singlet has', () => {
  const GAP = 0.3, crownT = 4, flintT = 2.5;
  const crownX = X;
  const flintX = X + thickLensGeometry({ r1: 40, r2: -137.7, thickness: crownT, dia: 25.4 }).span / 2 + GAP + flintT / 2;
  const mk = (x, p) => {
    const e = createElement('thicklens', x, 0);
    Object.assign(e.params, { dia: 25.4, transmission: 1, ...p });
    return e;
  };
  const doublet = R4 => [
    mk(crownX, { r1: 40, r2: -137.7, thickness: crownT, glass: 'nbk7' }),
    mk(flintX, { r1: -137.7, r2: R4, thickness: flintT, glass: 'nsf11' }),
  ];
  const focusOf = (els, wl) => {
    const laser = createElement('cwlaser', 0, 3);
    Object.assign(laser.params, { beamMode: 'line', wavelength: wl });
    const p = traceScene([laser, ...els]).drawables
      .filter(d => d.type === 'path').sort((a, b) => b.pts.length - a.pts.length)[0];
    const a = p.pts.at(-2), b = p.pts.at(-1);
    return a.x + (b.x - a.x) * (0 - a.y) / (b.y - a.y);
  };
  const colourOf = els => focusOf(els, 486.1) - focusOf(els, 656.3);

  const singlet = [mk(X, { r1: 61.6, r2: -61.6, thickness: 5, glass: 'nbk7' })];
  const singletColour = Math.abs(colourOf(singlet));
  assert.ok(singletColour > 0.5, 'the reference singlet should be visibly chromatic');

  // the colour must actually change sign across the design range — that zero
  // crossing is what makes an achromat findable by adjusting one radius
  assert.ok(colourOf(doublet(500)) * colourOf(doublet(1200)) < 0,
    'axial colour must cross zero as the rear radius is scanned');

  let best = Infinity;
  for (let R4 = 400; R4 <= 1200; R4 += 25) best = Math.min(best, Math.abs(colourOf(doublet(R4))));
  assert.ok(best < singletColour / 50,
    `the corrected doublet (${best.toFixed(4)}mm) should beat the singlet (${singletColour.toFixed(3)}mm) by >50x`);
});

// ---------------- geometry stays constructible ----------------

test('the boundary survives extreme parameters instead of producing NaN geometry', () => {
  const extremes = [
    { r1: 2000, r2: -2000, thickness: 0.5, dia: 50.8 },
    { r1: 1, r2: -1, thickness: 0.5, dia: 50.8 },        // radii far below the semi-diameter
    { r1: 0, r2: 0, thickness: 60, dia: 12.7 },          // a flat slab
    { r1: -2000, r2: 2000, thickness: 60, dia: 50.8 },
    { r1: 13, r2: -13, thickness: 0.5, dia: 25.4 },      // faces would cross without the guard
  ];
  for (const params of extremes) {
    const full = { glass: 'nbk7', transmission: 0.98, ...params };
    const g = thickLensGeometry(full);
    for (const p of g.points) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `NaN point for ${JSON.stringify(params)}`);
    }
    const el = createElement('thicklens', 0, 0);
    Object.assign(el.params, full);
    assert.doesNotMatch(registry.thicklens.svg(el), /NaN|Infinity|undefined/);
    for (const s of registry.thicklens.surfaces(el)) {
      assert.ok([s.x1, s.y1, s.x2, s.y2].every(Number.isFinite), 'surface coordinates must be finite');
    }
  }
});

test('a lens too thin for its own curvature is thickened until it has a real edge', () => {
  // R=13 on a 25.4mm lens sags 1.9mm per face; 0.5mm of centre thickness
  // would put the faces through each other.
  const g = thickLensGeometry({ r1: 13, r2: -13, thickness: 0.5, dia: 25.4 });
  assert.ok(g.d > 0.5, 'centre thickness must be raised');
  const front = g.points.find(p => p.y > 0 && p.x < 0);
  const rear = g.points.filter(p => p.y > 0).at(-1);
  assert.ok(rear.x - front.x > 0.3, 'the rim must keep a positive edge thickness');
});

test('an impossible requested shape exposes the exact geometry the tracer realizes', () => {
  const params = { r1: 1, r2: -1, thickness: 0.5, dia: 50.8, glass: 'nbk7' };
  const adjusted = thickLensAdjustment(params);
  assert.ok(adjusted, 'the impossible request must be reported as adjusted');
  assert.ok(Math.abs(adjusted.r1) > params.dia / 2);
  assert.ok(Math.abs(adjusted.r2) > params.dia / 2);
  assert.ok(adjusted.thickness > params.thickness);

  const readout = registry.thicklens.params.find(param => param.key === 'realizedGeometry');
  assert.equal(readout.show(params), true);
  assert.match(readout.readout(params), /R₁ .* R₂ .* t .* mm/);
  assert.match(getElementMeta('thicklens', params).note, /trace uses.*Geometry used/i);
  assert.equal(readout.show(createElement('thicklens').params), false,
    'ordinary constructible lenses should not show a redundant adjustment row');
});

test('a flat face is traced as a plane, not a huge-radius arc', () => {
  const el = createElement('thicklens', 0, 0);
  Object.assign(el.params, { r1: 50, r2: 0, thickness: 5, dia: 25.4, glass: 'nbk7' });
  const surfaces = registry.thicklens.surfaces(el);
  const curved = surfaces.filter(s => s.data.arcPoint);
  assert.equal(curved.length, 1, 'only the curved face should carry an arc');
});


// ---------------- per-surface transmission is a percentage ----------------

test('glass bodies express per-surface transmission the same way every other optic does', () => {
  for (const type of ['thicklens', 'freeglass']) {
    const spec = registry[type].params.find(p => p.key === 'transEff');
    assert.ok(spec, `${type} must carry transEff, not a bespoke 0-1 transmission`);
    assert.deepEqual([spec.min, spec.max, spec.def], [0, 100, 98], `${type} bounds`);
    assert.equal(registry[type].params.some(p => p.key === 'transmission'), false,
      `${type} must not keep the retired fractional key`);
  }
  // the tracer still works in fractions
  assert.equal(surfaceTransmission({ transEff: 100 }), 1);
  assert.equal(surfaceTransmission({ transEff: 0 }), 0);
  assert.ok(Math.abs(surfaceTransmission({ transEff: 98 }) - 0.98) < 1e-12);
  assert.ok(Math.abs(surfaceTransmission({}) - 0.98) < 1e-12, 'defaults to the schema default');
  assert.equal(surfaceTransmission({ transEff: 900 }), 1, 'and stays bounded');
});

test('a sketch saved with the old 0-1 transmission loads at the same physical value', () => {
  const file = els => JSON.stringify({ app: 'optics2d', version: 1, elements: els, beams: [] });
  for (const type of ['thicklens', 'freeglass']) {
    for (const stored of [0, 0.5, 0.98, 1]) {
      const fresh = createElement(type, 0, 0);
      const params = { ...fresh.params, transmission: stored };
      delete params.transEff;
      const [loaded] = parseSketch(file([{ id: `x-${type}-${stored}`, type, x: 0, y: 0, params }]), registry).elements;
      assert.equal(loaded.params.transEff, stored * 100, `${type} ${stored} -> percent`);
      assert.ok(Math.abs(surfaceTransmission(loaded.params) - stored) < 1e-12,
        `${type} ${stored} must reach the tracer unchanged`);
    }
    // a current sketch keeps its percentage rather than being multiplied again
    const now = createElement(type, 0, 0);
    now.params.transEff = 73;
    const [again] = parseSketch(file([now]), registry).elements;
    assert.equal(again.params.transEff, 73);
  }
});

test('per-surface transmission attenuates each face, so a singlet costs it twice', () => {
  const readings = [100, 50].map(pct => {
    const lens = createElement('thicklens', 300, 0);
    Object.assign(lens.params, { r1: 2000, r2: -2000, thickness: 4, dia: 50.8, glass: 'nbk7', transEff: pct });
    const laser = createElement('cwlaser', 60, 0);
    laser.params.beamMode = 'beam';
    laser.params.beamWidth = 6;
    const detector = createElement('detector', 520, 0);
    detector.params.aperture = 40;
    traceAll([laser, lens, detector], []);
    return detectorReading(detector.id)?.signal ?? 0;
  });
  assert.ok(Math.abs(readings[1] / readings[0] - 0.25) < 1e-9, 'two faces at 50% leave a quarter');
});

// ---------------- glass bodies must not touch ----------------

function cementedPair(gap) {
  const front = createElement('thicklens', 300, 0);
  Object.assign(front.params, { r1: 40, r2: -137.7, thickness: 4, dia: 25.4, glass: 'nbk7' });
  const rear = createElement('thicklens', 0, 0);
  Object.assign(rear.params, { r1: -137.7, r2: 600, thickness: 2.5, dia: 25.4, glass: 'nsf11' });
  rear.x = 300 + thickLensGeometry(front.params).xv2 + gap - thickLensGeometry(rear.params).xv1;
  return [front, rear];
}

test('two glass bodies closer than the tracer can resolve are called out', () => {
  // Below the gap the trace is silently wrong, so the inspector has to say so
  // rather than leaving a plausible-looking focus to be believed.
  for (const gap of [0, 0.02, 0.05]) {
    const pair = cementedPair(gap);
    const found = touchingGlassBody(pair[0], pair);
    assert.ok(found, `a ${gap} mm gap must be reported`);
    // the boundary is sampled into chords, so the measured gap is close rather
    // than exact — this is a "are these touching" check, not metrology
    assert.ok(Math.abs(found.gap - gap) < 1e-3, `and measured: got ${found.gap}`);
    const meta = getElementMeta('thicklens', pair[0].params, { element: pair[0], elements: pair });
    assert.equal(meta.tier, 'configurable');
    assert.match(meta.note, /touching another glass body/);
  }
  // ...and the recommended gap itself must be clean, or the advice contradicts
  // the warning that gives it
  for (const gap of [MIN_CEMENT_GAP, 0.5, 20]) {
    const pair = cementedPair(gap);
    assert.equal(touchingGlassBody(pair[0], pair), null, `${gap} mm must not warn`);
    const meta = getElementMeta('thicklens', pair[0].params, { element: pair[0], elements: pair });
    assert.doesNotMatch(meta.note, /touching another glass body/);
  }
});

test('the touching check only ever fires on another glass body', () => {
  const [lens] = cementedPair(0);
  assert.equal(touchingGlassBody(lens, [lens]), null, 'a lone body has nothing to touch');
  assert.equal(touchingGlassBody(lens, [lens, createElement('mirror', 300, 0)]), null,
    'a mirror in the same place is not a glass boundary');
  assert.equal(touchingGlassBody(lens, [lens, createElement('thicklens', 300, 60)]), null,
    'a body offset well off-axis is not touching');

  // a freeglass edge laid against the lens counts, at the same threshold
  const near = createElement('freeglass', 304.02, 0);
  near.params.vertices = [{ x: -2, y: -20 }, { x: 40, y: -20 }, { x: 40, y: 20 }, { x: -2, y: 20 }];
  const found = touchingGlassBody(lens, [lens, near]);
  assert.ok(found && found.type === 'freeglass');
  const far = createElement('freeglass', 304.5, 0);
  far.params.vertices = near.params.vertices;
  assert.equal(touchingGlassBody(lens, [lens, far]), null);
});

test('the warning marks exactly the gaps where the trace really does go wrong', () => {
  // The claim the note makes has to stay true: below the gap an interface is
  // skipped, above it both are seen.
  const interactions = gap => {
    const pair = cementedPair(gap);
    const laser = createElement('cwlaser', 60, 1);
    laser.params.beamMode = 'line';
    const paths = traceScene([laser, ...pair], []).drawables.filter(d => d.type === 'path');
    return Math.max(0, ...paths.map(p => p.pts.length - 1));
  };
  assert.equal(interactions(0.02), 4, 'one interface is lost when they touch');
  assert.equal(interactions(MIN_CEMENT_GAP), 5, 'and comes back at the recommended gap');
});
