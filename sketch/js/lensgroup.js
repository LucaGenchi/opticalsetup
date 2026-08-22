// Multi-element lens groups from a surface table.
//
// A surface table is how real lens prescriptions are written: one row per
// refracting surface, each carrying its radius, the axial distance to the next
// surface, and the medium that follows it. A cemented achromat is three rows:
//
//     #  radius   thickness   glass after
//     1    40         4        N-BK7
//     2  -137.7       2.5      N-SF11
//     3   600         --       air
//
// One representation covers singlet, doublet, Cooke triplet and camera
// objective, and the difference between "cemented" and "air-spaced" falls out
// of it: consecutive glass rows are cemented, a row followed by air is a real
// gap. Everything here is pure geometry — no element, no tracer, no UI — so it
// can be checked against an analytic surface-by-surface trace on its own.

import { glassIndex } from './glass.js';

// The tracer ignores any intersection closer than 0.05 units along a ray, an
// epsilon that stops a surface re-hitting itself. Two glass bodies in optical
// contact therefore lose one of their two coincident interfaces and the ray
// exits into air instead of crossing into the next glass — a cemented doublet
// traced that way comes out badly wrong. Holding cemented groups apart by
// slightly more than that epsilon makes both interfaces real again. The cost
// is a hair of air where the cement should be: about 0.1% of the back focal
// distance, well inside what this qualitative tracer claims anywhere else, and
// real optical cement is a 10-20 um layer of not-quite-glass regardless.
// elements.js re-exports this for the glass bodies that only have to avoid it.
export const MIN_CEMENT_GAP = 0.06;

export const MAX_SURFACE_ROWS = 12;
export const AIR = 'air';

const finite = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Radius bounds match the singlet's, so a group and a thick lens describe the
// same shapes. 0 is flat and is kept exactly rather than clamped to a huge arc.
export const ROW_RADIUS_MAX = 2000;
export const ROW_THICKNESS_MIN = 0.2;
export const ROW_THICKNESS_MAX = 200;
export const ROW_STOP_DIAMETER_MIN = 0.5;
export const ROW_STOP_DIAMETER_MAX = 500;

// Sag of a spherical surface at semi-height y, measured from its vertex.
// Positive radius curves toward +x, matching the singlet's convention.
const sagAt = (y, R) => (R ? R - Math.sign(R) * Math.sqrt(Math.max(0, R * R - y * y)) : 0);

// Least glass left at the rim before the two faces of a body would cross.
const MIN_EDGE_THICKNESS = 0.4;

export function normalizeSurfaceRow(raw = {}) {
  const r = finite(Number(raw.r)) ? Number(raw.r) : 0;
  const thickness = finite(Number(raw.thickness)) ? Number(raw.thickness) : 4;
  const glass = typeof raw.glass === 'string' && (raw.glass === AIR || glassIndex(raw.glass) !== null)
    ? raw.glass
    : AIR;
  const stopDiameter = finite(Number(raw.stopDiameter)) ? Number(raw.stopDiameter) : 12;
  return {
    r: Math.abs(r) < 1e-6 ? 0 : clamp(r, -ROW_RADIUS_MAX, ROW_RADIUS_MAX),
    thickness: clamp(thickness, ROW_THICKNESS_MIN, ROW_THICKNESS_MAX),
    glass,
    // A stop lives in air immediately after this surface. Silently carrying
    // one into glass when a material is changed would describe an absorbing
    // plate embedded in the lens, not an aperture stop, so normalization
    // clears it unless the row exits into air.
    stop: raw.stop === true && glass === AIR,
    stopDiameter: clamp(stopDiameter, ROW_STOP_DIAMETER_MIN, ROW_STOP_DIAMETER_MAX),
  };
}

// A table always ends in air: the last row's medium is whatever the light
// leaves into, and nothing follows it, so its thickness is unused.
export function normalizeSurfaceTable(value, fallback = DEFAULT_TABLE) {
  const source = Array.isArray(value) && value.length >= 2 ? value
    : Array.isArray(fallback) && fallback.length >= 2 ? fallback
      : DEFAULT_TABLE;
  const out = source.slice(0, MAX_SURFACE_ROWS).map(normalizeSurfaceRow);
  // The final surface always exits into air; glass there would leave the last
  // body unclosed, with nothing to be the back of it.
  out[out.length - 1] = { ...out.at(-1), glass: AIR };
  return out;
}

// The surface list the tracer actually sees. A cemented interface becomes TWO
// surfaces — the back of one body and the front of the next, sharing a radius
// with MIN_CEMENT_GAP of air between them — because the tracer ignores
// intersections closer than 0.05 mm along a ray and would otherwise lose one
// of a coincident pair, sending the ray out into air instead of on into the
// next glass. Expanding it here means the drawn bodies, the traced surfaces
// and the reported cardinals all describe the same object, gap included.
export function realizedSurfaces(rows, { diameter = 25.4 } = {}) {
  const table = normalizeSurfaceTable(rows);
  const h = Math.max(0.5, diameter / 2);
  // A radius smaller than the semi-aperture has no real circular edge.
  const clampR = R => (R === 0 ? 0 : Math.sign(R) * Math.max(Math.abs(R), h * 1.02));
  const out = [];
  let x = 0;
  for (let i = 0; i < table.length; i++) {
    const last = i === table.length - 1;
    const glassAfter = last ? AIR : table[i].glass;
    out.push({ x, r: clampR(table[i].r), glassAfter, row: i });
    if (last) break;
    x += table[i].thickness;
    // glass continuing across the next surface means it is cemented
    const cemented = table[i].glass !== AIR
      && i + 1 < table.length - 1 && table[i + 1].glass !== AIR;
    if (cemented) {
      out.push({ x, r: clampR(table[i + 1].r), glassAfter: AIR, row: i + 1, cementBack: true });
      x += MIN_CEMENT_GAP;
    }
  }

  // A body whose two faces would cross at the rim has to be thickened until a
  // real edge remains — and everything downstream of it moves with it, or the
  // next air gap silently absorbs the correction. Doing this HERE rather than
  // when the outlines are built is what keeps the reported focal length equal
  // to the traced one: both read the same vertex positions.
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].glassAfter === AIR) continue;
    const edge1 = out[i].x + sagAt(h, out[i].r);
    const edge2 = out[i + 1].x + sagAt(h, out[i + 1].r);
    const short = MIN_EDGE_THICKNESS - (edge2 - edge1);
    if (short > 0) for (let k = i + 1; k < out.length; k++) out[k].x += short;
  }

  // Stops sit a tracer-safe distance into the air after their authored
  // surface. Putting an absorbing segment exactly on a refracting face would
  // make one of the coincident interactions disappear behind the tracer's
  // 0.05 mm self-hit epsilon, the same failure the cement gap avoids.
  const stops = table.flatMap((row, i) => {
    if (!row.stop) return [];
    const surface = out.find(candidate => candidate.row === i && candidate.cementBack !== true);
    if (!surface) return [];
    const aperture = Math.min(2 * h, Math.max(ROW_STOP_DIAMETER_MIN, row.stopDiameter));
    return [{ row: i, x: surface.x + MIN_CEMENT_GAP, aperture, h }];
  });
  return { table, surfaces: out, stops, h };
}

// Closed boundaries, one per glass body, in element-local coordinates centred
// on the group. A body runs from a surface that enters glass to the next
// surface, so cemented neighbours end up as two bodies a cement gap apart.
export function surfaceTableToBodies(rows, { diameter = 25.4 } = {}) {
  const { table, surfaces, stops, h } = realizedSurfaces(rows, { diameter });
  const bodies = [];

  for (let i = 0; i < surfaces.length - 1; i++) {
    if (surfaces[i].glassAfter === AIR) continue;
    const R1 = surfaces[i].r, R2 = surfaces[i + 1].r;
    const xv1 = surfaces[i].x, xv2 = surfaces[i + 1].x;
    const points = [{ x: xv1 + sagAt(h, R1), y: h }];
    if (R1) points.push({ x: xv1, y: 0, arc: true });
    points.push({ x: xv1 + sagAt(h, R1), y: -h }, { x: xv2 + sagAt(h, R2), y: -h });
    if (R2) points.push({ x: xv2, y: 0, arc: true });
    points.push({ x: xv2 + sagAt(h, R2), y: h });
    bodies.push({
      points, glass: surfaces[i].glassAfter, h, R1, R2, xv1, xv2,
      // the cement flag lives on the BACK of the previous body, which is the
      // surface immediately before this one
      cementedToPrevious: i > 0 && surfaces[i - 1].cementBack === true,
    });
  }

  // Centre the assembly on the element origin so it rotates and hit-tests like
  // every other component.
  const all = bodies.flatMap(b => b.points.map(pt => pt.x));
  const shift = all.length ? -(Math.min(...all) + Math.max(...all)) / 2 : 0;
  for (const body of bodies) {
    body.points = body.points.map(pt => ({ ...pt, x: pt.x + shift }));
    body.xv1 += shift;
    body.xv2 += shift;
  }
  const shiftedStops = stops.map(stop => ({ ...stop, x: stop.x + shift }));
  return {
    bodies, stops: shiftedStops, table, h, shift,
    span: all.length ? Math.max(...all) - Math.min(...all) : 0,
    vertices: surfaces.map(sf => sf.x + shift),
  };
}

// Paraxial surface-by-surface trace of a collimated ray at unit height, which
// is the textbook way to get a group's cardinal points. Reduced angle
// omega = n*u, so a refraction is omega -= y*(n2-n1)/R and a transfer is
// y += t*omega/n. It runs over the REALIZED surfaces, cement gaps included, so
// the reported focal length is the one the tracer will actually produce rather
// than the one the prescription would give in an ideal world. Reported only —
// the tracer never consults it, the same rule the singlet follows.
export function surfaceTableCardinals(rows, wavelength = 587.6, { diameter = 25.4 } = {}) {
  const { surfaces } = realizedSurfaces(rows, { diameter });
  let y = 1, omega = 0, n = 1;
  for (let i = 0; i < surfaces.length; i++) {
    const nNext = surfaces[i].glassAfter === AIR
      ? 1
      : (glassIndex(surfaces[i].glassAfter, wavelength) ?? 1.5);
    if (surfaces[i].r !== 0) omega -= y * (nNext - n) / surfaces[i].r;
    n = nNext;
    if (i < surfaces.length - 1) y += (surfaces[i + 1].x - surfaces[i].x) * omega / n;
  }
  if (Math.abs(omega) < 1e-12) return { f: Infinity, bfd: Infinity, yLast: y };
  // n is 1 again here: the table always exits into air.
  return { f: 1 / -omega, bfd: y / -omega, yLast: y };
}

// Longitudinal colour across the visible F and C lines — the number an
// achromat exists to null, so it is worth reporting next to the focal length.
export function surfaceTableAxialColour(rows, { diameter = 25.4 } = {}) {
  const F = surfaceTableCardinals(rows, 486.1, { diameter }).bfd;
  const C = surfaceTableCardinals(rows, 656.3, { diameter }).bfd;
  return Number.isFinite(F) && Number.isFinite(C) ? F - C : Number.NaN;
}

export function surfaceTableSummary(rows) {
  const table = normalizeSurfaceTable(rows);
  const glasses = table.slice(0, -1).map(r => r.glass);
  const elements = glasses.filter(g => g !== AIR).length;
  const cementedPairs = glasses.filter((g, i) => g !== AIR && glasses[i + 1] && glasses[i + 1] !== AIR).length;
  const name = elements === 1 ? 'Singlet'
    : elements === 2 ? (cementedPairs ? 'Cemented doublet' : 'Air-spaced doublet')
      : elements === 3 ? (cementedPairs ? 'Triplet (cemented)' : 'Triplet (air-spaced)')
        : `${elements}-element group`;
  return { name, elements, cementedPairs, surfaces: table.length, stops: table.filter(row => row.stop).length };
}

// Adjust one authored radius until the F- and C-line back focal distances
// coincide. The scan exists only to find a real sign-changing bracket;
// convergence itself is a deterministic bisection. Both radius signs are
// searched because a custom prescription may null on either side of flat,
// and every candidate goes through the same aperture-aware realized geometry
// used by drawing, tracing and inspector readouts.
export function nullSurfaceTableAxialColour(rows, rowIndex, { diameter = 25.4, iterations = 40 } = {}) {
  const table = normalizeSurfaceTable(rows);
  const index = Math.trunc(Number(rowIndex));
  if (index < 0 || index >= table.length) {
    return { rows: table, radius: Number.NaN, residual: Number.NaN, converged: false, improved: false };
  }

  const originalRadius = table[index].r;
  const baselineFocal = surfaceTableCardinals(table, 587.6, { diameter }).f;
  const evaluate = radius => {
    const candidate = table.map(row => ({ ...row }));
    candidate[index].r = radius;
    const focal = surfaceTableCardinals(candidate, 587.6, { diameter }).f;
    // A one-glass singlet can make F and C coincide only by collapsing toward
    // zero optical power. That is not an achromat, so reject roots that flip
    // the lens or move its focal length outside a generous 5x power window.
    if (!Number.isFinite(focal)) return Number.NaN;
    if (Number.isFinite(baselineFocal) && baselineFocal !== 0) {
      if (Math.sign(focal) !== Math.sign(baselineFocal)) return Number.NaN;
      const ratio = Math.abs(focal / baselineFocal);
      if (ratio < 0.2 || ratio > 5) return Number.NaN;
    }
    return surfaceTableAxialColour(candidate, { diameter });
  };
  const baselineValue = evaluate(originalRadius);
  const baseline = Math.abs(baselineValue);
  if (Number.isFinite(baselineValue) && baseline < 1e-7) {
    return {
      rows: table, radius: originalRadius, residual: baselineValue,
      converged: true, improved: false,
    };
  }
  const semiApertureRadius = Math.max(ROW_STOP_DIAMETER_MIN, Math.abs(Number(diameter) || 25.4) / 2 * 1.02);
  const samplesPerSign = 160;
  const radii = [];
  for (let i = 0; i <= samplesPerSign; i++) {
    const t = i / samplesPerSign;
    const magnitude = semiApertureRadius + (ROW_RADIUS_MAX - semiApertureRadius) * t;
    radii.push(-magnitude);
  }
  radii.push(0);
  for (let i = 0; i <= samplesPerSign; i++) {
    const t = i / samplesPerSign;
    radii.push(semiApertureRadius + (ROW_RADIUS_MAX - semiApertureRadius) * t);
  }
  radii.push(originalRadius);
  radii.sort((a, b) => a - b);

  let best = { radius: originalRadius, value: evaluate(originalRadius) };
  const consider = (radius, value) => {
    if (!Number.isFinite(value)) return;
    const betterResidual = !Number.isFinite(best.value) || Math.abs(value) < Math.abs(best.value) - 1e-14;
    const sameResidual = Number.isFinite(best.value) && Math.abs(Math.abs(value) - Math.abs(best.value)) <= 1e-14;
    if (betterResidual || (sameResidual && Math.abs(radius - originalRadius) < Math.abs(best.radius - originalRadius))) {
      best = { radius, value };
    }
  };

  let previous = null;
  for (const radius of radii) {
    const value = evaluate(radius);
    consider(radius, value);
    if (previous && Number.isFinite(previous.value) && Number.isFinite(value)
      && Math.sign(previous.value) !== Math.sign(value)) {
      let lo = previous.radius, hi = radius;
      let flo = previous.value, fhi = value;
      for (let i = 0; i < iterations; i++) {
        const mid = (lo + hi) / 2;
        const fmid = evaluate(mid);
        consider(mid, fmid);
        if (!Number.isFinite(fmid)) break;
        if (Math.abs(fmid) < 1e-12) break;
        if (Math.sign(flo) === Math.sign(fmid)) {
          lo = mid; flo = fmid;
        } else {
          hi = mid; fhi = fmid;
        }
      }
      consider(hi, fhi);
    }
    previous = { radius, value };
  }

  const residual = best.value;
  const improved = Number.isFinite(residual) && (!Number.isFinite(baseline) || Math.abs(residual) < baseline - 1e-12);
  const resultRows = table.map(row => ({ ...row }));
  if (improved) resultRows[index].r = best.radius;
  return {
    rows: normalizeSurfaceTable(resultRows),
    radius: improved ? best.radius : originalRadius,
    residual: improved ? residual : evaluate(originalRadius),
    converged: improved && Math.abs(residual) < 1e-7,
    improved,
  };
}

// ---------------- presets ----------------
// Not invented radii: each of these was solved with the paraxial engine above
// — one radius bisected to null the axial colour, then every radius scaled to
// land on f = 100 mm — so all three are directly comparable and the numbers
// they report are ones this app can stand behind. Residual colour across the
// visible F and C lines, at the same focal length:
//
//     N-BK7 singlet          -1.53 mm     (1.5% of f)
//     air-spaced achromat    -0.015 mm    (150 ppm)   ~100x better
//     cemented achromat      -0.0003 mm   (3 ppm)     ~4600x better
//
// A Cooke triplet is deliberately absent: what makes one a Cooke is its
// off-axis correction, and a 2D meridional tracer cannot judge that, so
// shipping one whose only checkable property is axial colour would overclaim.

export const DEFAULT_TABLE = [
  { r: 60.65, thickness: 6, glass: 'nbk7' },
  { r: -61.02, thickness: 3.5, glass: 'nsf11' },
  { r: -131.55, thickness: 4, glass: AIR },
];

export const LENS_GROUP_PRESETS = [
  {
    id: 'doublet',
    label: 'Cemented achromat, f 100 mm (N-BK7 + N-SF11)',
    rows: DEFAULT_TABLE,
  },
  {
    id: 'airspaced',
    label: 'Air-spaced achromat, f 100 mm (N-BK7 + N-SF5)',
    rows: [
      { r: 55.48, thickness: 5, glass: 'nbk7' },
      { r: -44.38, thickness: 1.2, glass: AIR },
      { r: -44.2, thickness: 3, glass: 'nsf5' },
      { r: -166.43, thickness: 4, glass: AIR },
    ],
  },
  {
    id: 'singlet',
    label: 'Uncorrected singlet, f 100 mm (N-BK7) — the colour to beat',
    rows: [
      { r: 102.5, thickness: 5, glass: 'nbk7' },
      { r: -102.5, thickness: 4, glass: AIR },
    ],
  },
];

export const presetRows = id => (LENS_GROUP_PRESETS.find(pr => pr.id === id)?.rows ?? DEFAULT_TABLE)
  .map(row => ({ ...row }));

// The rows an element is actually built from. A preset is authoritative while
// one is selected, so choosing "Cemented achromat" always gives that
// prescription rather than whatever was edited last; the row editor switches
// `preset` to 'custom' and hands control to the stored table.
export const PRESET_OPTIONS = [
  ...LENS_GROUP_PRESETS.map(p => [p.id, p.label]),
  ['custom', 'Custom surface table'],
];

export function surfaceRowsOf(params = {}) {
  return params.preset && params.preset !== 'custom'
    ? presetRows(params.preset)
    : normalizeSurfaceTable(params.rows);
}
