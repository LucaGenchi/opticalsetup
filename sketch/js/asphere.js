// Rotationally symmetric asphere helpers for the 2D meridional tracer.
//
// The local optical axis is +x and y is the radial coordinate. Each face uses
// the standard even-asphere sag convention
//
//   x(y) = c y² / (1 + sqrt(1 - (1 + k)c²y²))
//          + A4 y⁴ + A6 y⁶ + A8 y⁸
//
// where c = 1/R. R keeps the same Cartesian sign convention as the spherical
// singlet: positive means the centre of curvature lies toward local +x.

import { glassIndex } from './glass.js';

const MIN_RADIUS_MARGIN = 1.02;
const MIN_EDGE_THICKNESS = 0.4;
const PROFILE_SAMPLES = 192;
const DRAW_SAMPLES = 24;

export const ASPHERE_LIMITS = Object.freeze({
  conic: 20,
  a4: 0.01,
  a6: 0.001,
  a8: 0.0001,
});

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

function boundedCoefficient(value, key) {
  const limit = ASPHERE_LIMITS[key];
  return clamp(finite(value), -limit, limit);
}

// Realize one face at a finite aperture. Elliptic/spherical conics have a
// finite radial domain; raising |R| keeps the requested aperture inside it.
// Extremely large polynomial coefficients are scaled together so a malformed
// or direct-mutated scene cannot create kilometre-wide SVG/export bounds.
export function realizeAsphereProfile(profile = {}, aperture = 12.7) {
  const h = Math.max(0.5, finite(aperture, 12.7));
  const k = clamp(finite(profile.k), -ASPHERE_LIMITS.conic, ASPHERE_LIMITS.conic);
  let R = finite(profile.R);
  if (Math.abs(R) < 1e-9) R = 0;
  if (R && 1 + k > 0) {
    const minimum = h * Math.sqrt(1 + k) * MIN_RADIUS_MARGIN;
    if (Math.abs(R) < minimum) R = Math.sign(R) * minimum;
  }

  let a4 = boundedCoefficient(profile.a4, 'a4');
  let a6 = boundedCoefficient(profile.a6, 'a6');
  let a8 = boundedCoefficient(profile.a8, 'a8');
  let largestDeparture = 0;
  for (let i = 0; i <= PROFILE_SAMPLES; i++) {
    const y = h * i / PROFILE_SAMPLES;
    const y2 = y * y;
    const departure = a4 * y2 * y2 + a6 * y2 * y2 * y2 + a8 * y2 * y2 * y2 * y2;
    largestDeparture = Math.max(largestDeparture, Math.abs(departure));
  }
  // A real catalogue asphere is far below this guard. It exists only to keep
  // hand-edited or stale data finite and selectable at very large apertures.
  const maximumDeparture = Math.max(1, h);
  const coefficientScale = largestDeparture > maximumDeparture
    ? maximumDeparture / largestDeparture : 1;
  a4 *= coefficientScale;
  a6 *= coefficientScale;
  a8 *= coefficientScale;
  return { R, k, a4, a6, a8, h, coefficientScale };
}

export function asphereSag(y, profile = {}) {
  const radial = finite(y);
  const R = finite(profile.R);
  const k = finite(profile.k);
  let conic = 0;
  if (Math.abs(R) >= 1e-9) {
    const c = 1 / R;
    const radicand = Math.max(0, 1 - (1 + k) * c * c * radial * radial);
    conic = c * radial * radial / (1 + Math.sqrt(radicand));
  }
  const y2 = radial * radial;
  return conic
    + finite(profile.a4) * y2 * y2
    + finite(profile.a6) * y2 * y2 * y2
    + finite(profile.a8) * y2 * y2 * y2 * y2;
}

// dx/dy of asphereSag(). The conic derivative follows directly from the
// implicit conic equation y² - 2Rx + (1+k)x² = 0 and remains stable near y=0.
export function asphereSlope(y, profile = {}) {
  const radial = finite(y);
  const R = finite(profile.R);
  const k = finite(profile.k);
  const sag = asphereSag(radial, { ...profile, a4: 0, a6: 0, a8: 0 });
  const denominator = R - (1 + k) * sag;
  const conicSlope = Math.abs(R) < 1e-9 || Math.abs(denominator) < 1e-12
    ? 0 : radial / denominator;
  const y2 = radial * radial;
  return conicSlope
    + 4 * finite(profile.a4) * radial * y2
    + 6 * finite(profile.a6) * radial * y2 * y2
    + 8 * finite(profile.a8) * radial * y2 * y2 * y2;
}

function profileFromParams(params, face, h) {
  return realizeAsphereProfile({
    R: params[`r${face}`],
    k: params[`k${face}`],
    a4: params[`a4_${face}`],
    a6: params[`a6_${face}`],
    a8: params[`a8_${face}`],
  }, h);
}

function sampleFace(vertex, profile, fromY, toY) {
  const points = [];
  for (let i = 0; i <= DRAW_SAMPLES; i++) {
    const y = fromY + (toY - fromY) * i / DRAW_SAMPLES;
    points.push({ x: vertex + asphereSag(y, profile), y });
  }
  return points;
}

// A closed, sampled outline for drawing and pointer hit testing, plus the exact
// analytic profiles used for tracing and containment. Centre thickness is
// increased only when needed to keep at least a 0.4 mm edge everywhere across
// the aperture.
export function asphericLensGeometry(params = {}) {
  const h = Math.max(0.5, finite(params.dia, 25.4) / 2);
  const front = profileFromParams(params, 1, h);
  const rear = profileFromParams(params, 2, h);
  let requiredThickness = MIN_EDGE_THICKNESS;
  for (let i = 0; i <= PROFILE_SAMPLES; i++) {
    const y = -h + 2 * h * i / PROFILE_SAMPLES;
    requiredThickness = Math.max(
      requiredThickness,
      MIN_EDGE_THICKNESS + asphereSag(y, front) - asphereSag(y, rear),
    );
  }
  const requestedThickness = Math.max(0.5, finite(params.thickness, 6));
  const d = Math.max(requestedThickness, requiredThickness);
  const xv1 = -d / 2;
  const xv2 = d / 2;
  const frontPoints = sampleFace(xv1, front, h, -h);
  const rearPoints = sampleFace(xv2, rear, -h, h);
  const points = [...frontPoints, ...rearPoints];
  const xs = points.map(point => point.x);
  return {
    points, frontPoints, rearPoints, front, rear,
    h, d, xv1, xv2,
    span: Math.max(...xs) - Math.min(...xs),
  };
}

export function asphericLensAdjustment(params = {}) {
  const geometry = asphericLensGeometry(params);
  const requested = {
    r1: finite(params.r1), r2: finite(params.r2),
    thickness: Math.max(0.5, finite(params.thickness, 6)),
    k1: finite(params.k1), k2: finite(params.k2),
    a4_1: finite(params.a4_1), a6_1: finite(params.a6_1), a8_1: finite(params.a8_1),
    a4_2: finite(params.a4_2), a6_2: finite(params.a6_2), a8_2: finite(params.a8_2),
  };
  const realized = {
    r1: geometry.front.R, r2: geometry.rear.R, thickness: geometry.d,
    k1: geometry.front.k, k2: geometry.rear.k,
    a4_1: geometry.front.a4, a6_1: geometry.front.a6, a8_1: geometry.front.a8,
    a4_2: geometry.rear.a4, a6_2: geometry.rear.a6, a8_2: geometry.rear.a8,
  };
  return Object.keys(realized).some(key => Math.abs(realized[key] - requested[key]) > 1e-12)
    ? { ...realized, frontScale: geometry.front.coefficientScale, rearScale: geometry.rear.coefficientScale }
    : null;
}

// Conic constant and A4+ terms do not change vertex curvature, so the
// paraxial cardinal points use the same thick-lens equation as a spherical
// singlet, evaluated with the realized radii and centre thickness.
export function asphericLensCardinals(params = {}, wavelength = 587.6) {
  const geometry = asphericLensGeometry(params);
  const n = glassIndex(params.glass, wavelength) ?? 1.5;
  const c1 = geometry.front.R ? 1 / geometry.front.R : 0;
  const c2 = geometry.rear.R ? 1 / geometry.rear.R : 0;
  const power = (n - 1) * (c1 - c2 + (n - 1) * geometry.d * c1 * c2 / n);
  if (Math.abs(power) < 1e-9) return { f: Infinity, bfd: Infinity, n };
  const f = 1 / power;
  return { f, bfd: f * (1 - (n - 1) * geometry.d * c1 / n), n };
}

export function asphericSurfaceSummary(params = {}) {
  const geometry = asphericLensGeometry(params);
  const kind = profile => {
    const polynomial = Math.abs(profile.a4) + Math.abs(profile.a6) + Math.abs(profile.a8) > 1e-15;
    if (!profile.R && !polynomial) return 'plane';
    if (Math.abs(profile.k) < 1e-12 && !polynomial) return 'spherical';
    return 'aspheric';
  };
  return `Front ${kind(geometry.front)} · rear ${kind(geometry.rear)}`;
}
