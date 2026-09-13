// First-order relay diagnostics, in unfolded optical-path coordinates.
// These helpers report geometry; they do not add rays, move optics or model a PSF.
import {
  objectiveBackFocalPlaneX, objectiveEffectiveFocalLength, objectiveLensPlaneX,
  objectivePupilRadius, objectiveStopX,
} from './objective.js';

const IDENTITY = Object.freeze({ A: 1, B: 0, C: 0, D: 1 });

function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
  return value;
}

function positive(value, name, allowZero = false) {
  finite(value, name);
  if (allowZero ? value < 0 : value <= 0) throw new RangeError(`${name} must be ${allowZero ? 'nonnegative' : 'positive'}`);
  return value;
}

function checked(matrix) {
  for (const key of ['A', 'B', 'C', 'D']) finite(matrix[key], `matrix ${key}`);
  return matrix;
}

// `after` acts on the output of `before`; ray vectors are [height, slope].
export function composeParaxial(after, before) {
  checked(after);
  checked(before);
  return checked({
    A: after.A * before.A + after.B * before.C,
    B: after.A * before.B + after.B * before.D,
    C: after.C * before.A + after.D * before.C,
    D: after.C * before.B + after.D * before.D,
  });
}

// Ordered forward steps, each either { distanceMm } or { focalMm }.
// Distances use physical ray-path length, including folds, rather than the
// distance between device centres. A flat fold has no paraxial optical power.
export function paraxialTrain(steps) {
  if (!Array.isArray(steps)) throw new TypeError('steps must be an array');
  return steps.reduce((matrix, step) => {
    const propagation = Object.hasOwn(step, 'distanceMm');
    if (propagation === Object.hasOwn(step, 'focalMm')) {
      throw new TypeError('each step needs exactly one distanceMm or focalMm');
    }
    if (propagation) {
      return composeParaxial({ ...IDENTITY, B: positive(step.distanceMm, 'distanceMm', true) }, matrix);
    }
    const f = finite(step.focalMm, 'focalMm');
    if (f === 0) throw new RangeError('focalMm must be nonzero');
    return composeParaxial({ ...IDENTITY, C: -1 / f }, matrix);
  }, { ...IDENTITY });
}

export function transferParaxialRay(matrix, heightMm, slope) {
  checked(matrix);
  finite(heightMm, 'heightMm');
  finite(slope, 'slope');
  return {
    heightMm: finite(matrix.A * heightMm + matrix.B * slope, 'output height'),
    slope: finite(matrix.C * heightMm + matrix.D * slope, 'output slope'),
  };
}

export function scanRelayMatrix({ scannerToScanMm, scanFocalMm, scanToTubeMm, tubeFocalMm, tubeToPupilMm }) {
  positive(scanFocalMm, 'scanFocalMm');
  positive(tubeFocalMm, 'tubeFocalMm');
  return paraxialTrain([
    { distanceMm: scannerToScanMm }, { focalMm: scanFocalMm },
    { distanceMm: scanToTubeMm }, { focalMm: tubeFocalMm },
    { distanceMm: tubeToPupilMm },
  ]);
}

// Test conjugacy (B = 0) separately from output collimation (C = 0).
// For an objective reached at its BFP, the nominal focal-plane coordinate
// is f_objective * output slope. Nonzero B walks the pupil; nonzero C
// spreads a collimated input bundle at the nominal focal plane.
export function inspectScanRelay(matrix, {
  objectiveFocalMm, inputBeamRadiusMm, pupilRadiusMm,
  opticalAnglesDeg = [-0.4, 0, 0.4],
  conjugacyToleranceMm = 1e-7, collimationTolerancePerMm = 1e-9,
}) {
  checked(matrix);
  positive(objectiveFocalMm, 'objectiveFocalMm');
  positive(inputBeamRadiusMm, 'inputBeamRadiusMm', true);
  positive(pupilRadiusMm, 'pupilRadiusMm');
  positive(conjugacyToleranceMm, 'conjugacyToleranceMm', true);
  positive(collimationTolerancePerMm, 'collimationTolerancePerMm', true);
  if (!Array.isArray(opticalAnglesDeg) || opticalAnglesDeg.length === 0) {
    throw new TypeError('opticalAnglesDeg must contain samples');
  }
  const samples = opticalAnglesDeg.map(angleDeg => {
    finite(angleDeg, 'optical angle');
    if (Math.abs(angleDeg) > 5) throw new RangeError('use small optical scan angles (at most 5 degrees)');
    const slope = Math.tan(angleDeg * Math.PI / 180);
    const rays = [-inputBeamRadiusMm, 0, inputBeamRadiusMm].map(height => {
      const out = transferParaxialRay(matrix, height, slope);
      return {
        inputHeightMm: height, pupilHeightMm: out.heightMm, outputSlope: out.slope,
        focusHeightMm: finite(objectiveFocalMm * out.slope, 'focus height'),
      };
    });
    const pupilHeights = rays.map(ray => ray.pupilHeightMm);
    const focusHeights = rays.map(ray => ray.focusHeightMm);
    return {
      opticalAngleDeg: angleDeg,
      pupilCenterMm: rays[1].pupilHeightMm,
      pupilWidthMm: finite(Math.max(...pupilHeights) - Math.min(...pupilHeights), 'pupil width'),
      focusCenterMm: rays[1].focusHeightMm,
      focusWidthMm: finite(Math.max(...focusHeights) - Math.min(...focusHeights), 'focus width'),
      fitsPupil: pupilHeights.every(height => Math.abs(height) <= pupilRadiusMm + 1e-9),
      rays,
    };
  });
  return {
    matrix: { ...matrix },
    pupilConjugate: Math.abs(matrix.B) <= conjugacyToleranceMm,
    collimatedOutput: Math.abs(matrix.C) <= collimationTolerancePerMm,
    samples,
  };
}

// The equivalent BFP and the actually seated aperture stop can differ for
// long-WD/long-EFL objectives. Do not silently treat the two as identical.
export function objectiveScanPlanes(objective) {
  const x = finite(objective.x, 'objective x');
  const y = finite(objective.y, 'objective y');
  const angle = finite(objective.rot ?? 0, 'objective rotation') * Math.PI / 180;
  const axis = { x: Math.cos(angle), y: Math.sin(angle) };
  const at = localX => ({
    x: finite(x + localX * axis.x, 'plane x'),
    y: finite(y + localX * axis.y, 'plane y'),
  });
  const params = objective.params ?? {};
  const bfpX = objectiveBackFocalPlaneX(params);
  const stopX = objectiveStopX(params);
  const lensX = objectiveLensPlaneX(params);
  return {
    axis, bfp: at(bfpX), stop: at(stopX), lens: at(lensX),
    focus: at(lensX + objectiveEffectiveFocalLength(params)),
    pupilRadiusMm: objectivePupilRadius(params),
    stopClamped: Math.abs(bfpX - stopX) > 1e-9,
  };
}

// Intersections of actual native-tracer polylines with a directed plane.
// Use a trace with the source/branch under study isolated: drawables do not
// carry source identity. Only forward crossings count; half-open segments
// avoid duplicating a vertex shared by consecutive path pieces.
export function tracedPlaneCrossings(drawables, { center, axis }) {
  finite(center.x, 'plane x');
  finite(center.y, 'plane y');
  const norm = Math.hypot(finite(axis.x, 'axis x'), finite(axis.y, 'axis y'));
  positive(norm, 'axis norm');
  const nx = axis.x / norm, ny = axis.y / norm;
  const crossings = [];
  for (const drawable of drawables) {
    if (drawable.type !== 'path' || !Array.isArray(drawable.pts)) continue;
    for (let index = 1; index < drawable.pts.length; index++) {
      const a = drawable.pts[index - 1], b = drawable.pts[index];
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue;
      const start = (a.x - center.x) * nx + (a.y - center.y) * ny;
      const finish = (b.x - center.x) * nx + (b.y - center.y) * ny;
      if (!(start < -1e-10 && finish >= -1e-10)) continue;
      const t = -start / (finish - start);
      const x = a.x + t * (b.x - a.x), y = a.y + t * (b.y - a.y);
      const heightMm = -(x - center.x) * ny + (y - center.y) * nx;
      if (Number.isFinite(heightMm)) crossings.push({ x, y, heightMm });
    }
  }
  return crossings;
}
