// Shared microscope-objective parameter model.
//
// OpticalSetup deliberately models an objective as one ideal, bidirectional
// plane at the physical nose. The authored working distance is also the focal
// distance of that ideal plane:
//
//   collimated rear light -> point at FRONT_X + workingDistance
//   point at that focus   -> collimated rear light
//
// This is intentionally simpler than a compound prescription. It keeps the
// front plane and axial housing footprint fixed, makes the visible focus agree
// with the traced one, and avoids a hidden principal plane moving around
// inside (or outside) the icon. The housing height follows the authored clear
// aperture so the normal canvas resize gesture still has one honest meaning.
//
// Rated NA and the front-medium index request an object-side half-angle. The
// clear opening can limit that request, so every consumer uses the same
// accepted radius and effective NA. The guide, traced lens span, angular
// clipping, and downstream hand-offs therefore cannot disagree.

export const OBJECTIVE_REFERENCE_TUBE_F_MM = 200;
export const OBJECTIVE_FRONT_X = 16;
export const OBJECTIVE_DEFAULT_BACK_X = -21;
export const OBJECTIVE_SHOULDER_X = 7;
export const OBJECTIVE_BODY_HALF_HEIGHT = 17;
export const OBJECTIVE_NOSE_HALF_HEIGHT = 12;
export const OBJECTIVE_MIN_NOSE_HALF_HEIGHT = 5;
export const OBJECTIVE_NOSE_SHELL = 2;
export const OBJECTIVE_BARREL_SHELL = 5;

export const OBJECTIVE_NA_MIN = 0.05;
export const OBJECTIVE_NA_MAX = 1.49;
export const OBJECTIVE_NA_DEFAULT = 0.65;
export const OBJECTIVE_MAG_MIN = 1;
export const OBJECTIVE_MAG_MAX = 200;
export const OBJECTIVE_WD_MIN = 0.05;
export const OBJECTIVE_WD_MAX = 200;
export const OBJECTIVE_FRONT_APERTURE_MIN = 1;
export const OBJECTIVE_FRONT_APERTURE_MAX = 20;

// Compatibility names retained for code and saved scenes written by the
// former independent-EFL model. In the ideal model EFL is exactly the focus
// distance and is kept synchronized on normalization.
export const OBJECTIVE_EFL_MIN = OBJECTIVE_WD_MIN;
export const OBJECTIVE_EFL_MAX = OBJECTIVE_WD_MAX;

const CUSTOM_IMMERSION_INDEX_DEFAULT = 1.333;
const IMMERSION_INDEX_MIN = 1;
const IMMERSION_INDEX_MAX = 2;

const medium = (label, index, maxNA, fill, extra = {}) => Object.freeze({
  label,
  index,
  n: index,
  maxNA,
  fill,
  ...extra,
});

// The medium describes the space between the objective nose and specimen.
// The rendered bridge remains schematic; index is used for the NA angle.
export const OBJECTIVE_MEDIA = Object.freeze({
  air: medium('Dry / air', 1, 0.85, null),
  water: medium('Water', 1.333, 1.27, '#8fd3ed'),
  oil: medium('Oil', 1.518, OBJECTIVE_NA_MAX, '#c9a227'),
  custom: medium('Custom index', null, null, '#9fc8bd'),
  // Old high-NA sketches did not identify a medium. Keep that uncertainty
  // visible instead of inventing water or oil.
  legacy: medium('Legacy (medium unresolved)', null, OBJECTIVE_NA_MAX, null, {
    selectable: false,
    unresolved: true,
  }),
});

const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function inferredFocusDistance(params = {}, tubeF = OBJECTIVE_REFERENCE_TUBE_F_MM) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return 10;
  if (finite(params.workingDistance)) return params.workingDistance;
  if (finite(params.focusDistance)) return params.focusDistance;
  if (finite(params.efl)) return params.efl;
  if (finite(params.f)) return params.f;
  if (finite(params.magnification) && params.magnification > 0) {
    const reference = clamp(finite(tubeF) ? tubeF : OBJECTIVE_REFERENCE_TUBE_F_MM, 1, 1000);
    const magnification = clamp(params.magnification, OBJECTIVE_MAG_MIN, OBJECTIVE_MAG_MAX);
    return reference / magnification;
  }
  return 10;
}

export function objectiveWorkingDistance(params = {}) {
  return clamp(inferredFocusDistance(params), OBJECTIVE_WD_MIN, OBJECTIVE_WD_MAX);
}

export function objectiveMaximumWorkingDistance() {
  return OBJECTIVE_WD_MAX;
}

export function objectiveEffectiveFocalLength(params = {}, tubeF = OBJECTIVE_REFERENCE_TUBE_F_MM) {
  return clamp(inferredFocusDistance(params, tubeF), OBJECTIVE_EFL_MIN, OBJECTIVE_EFL_MAX);
}

// This readout remains available for compatibility and teaching. It is the
// magnification of the ideal model with a 200 mm reference tube lens, not a
// manufacturer catalogue prescription.
export function objectiveMagnification(params = {}, tubeF = OBJECTIVE_REFERENCE_TUBE_F_MM) {
  const reference = clamp(finite(tubeF) ? tubeF : OBJECTIVE_REFERENCE_TUBE_F_MM, 1, 1000);
  return reference / objectiveWorkingDistance(params);
}

export function objectiveMediumKey(params = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return 'air';
  if (typeof params.immersion === 'string' && Object.hasOwn(OBJECTIVE_MEDIA, params.immersion)) {
    return params.immersion;
  }
  if (params.immersion === undefined && finite(params.na) && params.na > 1) return 'legacy';
  return 'air';
}

export function objectiveMediumIndex(params = {}) {
  const key = objectiveMediumKey(params);
  if (key === 'legacy') return null;
  if (key === 'custom') {
    const index = finite(params.immersionIndex) ? params.immersionIndex : CUSTOM_IMMERSION_INDEX_DEFAULT;
    return clamp(index, IMMERSION_INDEX_MIN, IMMERSION_INDEX_MAX);
  }
  return OBJECTIVE_MEDIA[key].index;
}

export function objectiveMaximumNA(params = {}) {
  const key = objectiveMediumKey(params);
  if (key === 'custom') return Math.min(objectiveMediumIndex(params), OBJECTIVE_NA_MAX);
  return OBJECTIVE_MEDIA[key].maxNA;
}

// The authored/rated value is bounded only by the selected medium. A smaller
// clear opening is handled separately as an effective NA, without silently
// rewriting what the user entered.
export function objectiveNumericalAperture(params = {}, key = 'na') {
  return clamp(
    finite(params[key]) ? params[key] : OBJECTIVE_NA_DEFAULT,
    OBJECTIVE_NA_MIN,
    objectiveMaximumNA(params),
  );
}

export function objectiveFrontAperture(params = {}) {
  const authored = finite(params.frontAperture)
    ? params.frontAperture
    : finite(params.clearAperture)
      ? params.clearAperture
      : finite(params.aperture)
        ? params.aperture
        : 20;
  return clamp(authored, OBJECTIVE_FRONT_APERTURE_MIN, OBJECTIVE_FRONT_APERTURE_MAX);
}

export function objectiveRatedAcceptanceHalfAngle(params = {}) {
  const index = objectiveMediumIndex(params);
  if (!finite(index) || index <= 0) return null;
  return Math.asin(clamp(objectiveNumericalAperture(params) / index, 0, 1));
}

// Radius of the real traced opening at the fixed nose plane. Unresolved old
// high-NA scenes use the authored clear opening but export no trusted NA.
export function objectiveAcceptedRadius(params = {}) {
  const clearRadius = objectiveFrontAperture(params) / 2;
  const ratedAngle = objectiveRatedAcceptanceHalfAngle(params);
  if (!finite(ratedAngle)) return clearRadius;
  const requested = objectiveWorkingDistance(params) * Math.tan(Math.min(ratedAngle, Math.PI / 2 - 1e-6));
  return clamp(requested, 0, clearRadius);
}

export function objectiveEffectiveNumericalAperture(params = {}) {
  const index = objectiveMediumIndex(params);
  if (!finite(index) || index <= 0) return null;
  const angle = Math.atan2(objectiveAcceptedRadius(params), objectiveWorkingDistance(params));
  return Math.min(objectiveNumericalAperture(params), index * Math.sin(angle));
}

// The public acceptance angle is the angle the trace can actually deliver,
// after both the rated NA and clear opening are accounted for.
export function objectiveAcceptanceHalfAngle(params = {}) {
  if (!finite(objectiveMediumIndex(params))) return null;
  return Math.atan2(objectiveAcceptedRadius(params), objectiveWorkingDistance(params));
}

export function objectiveAcceptanceHalfAngleDeg(params = {}) {
  const radians = objectiveAcceptanceHalfAngle(params);
  return finite(radians) ? radians * 180 / Math.PI : null;
}

export function normalizeObjectiveParams(params = {}) {
  const source = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
  const normalized = { ...source };
  normalized.immersion = objectiveMediumKey(source);
  normalized.immersionIndex = clamp(
    finite(source.immersionIndex) ? source.immersionIndex : CUSTOM_IMMERSION_INDEX_DEFAULT,
    IMMERSION_INDEX_MIN,
    IMMERSION_INDEX_MAX,
  );
  normalized.workingDistance = objectiveWorkingDistance(source);
  // Keep the compatibility field synchronized so a round-tripped current
  // sketch cannot retain two disagreeing focal models.
  normalized.efl = normalized.workingDistance;
  normalized.na = objectiveNumericalAperture({ ...source, ...normalized });
  normalized.frontAperture = objectiveFrontAperture(source);
  delete normalized.focusDistance;
  delete normalized.magnification;
  delete normalized.f;
  delete normalized.aperture;
  delete normalized.clearAperture;
  return normalized;
}

export function objectiveFocalLength(params = {}, tubeF = OBJECTIVE_REFERENCE_TUBE_F_MM) {
  return objectiveEffectiveFocalLength(params, tubeF);
}

// The ideal refracting plane is the physical front of the objective.
export function objectiveLensPlaneX() {
  return OBJECTIVE_FRONT_X;
}

export function objectiveBackFocalPlaneX(params = {}) {
  return OBJECTIVE_FRONT_X - objectiveWorkingDistance(params);
}

export function objectiveBackX() {
  return OBJECTIVE_DEFAULT_BACK_X;
}

export function objectivePupilRadius(params = {}) {
  return objectiveAcceptedRadius(params);
}

export function objectivePupilDiameter(params = {}) {
  return 2 * objectiveAcceptedRadius(params);
}

export function objectiveNoseHalfHeight(params = {}) {
  const clearRadius = objectiveFrontAperture(params) / 2;
  return clamp(
    clearRadius + OBJECTIVE_NOSE_SHELL,
    OBJECTIVE_MIN_NOSE_HALF_HEIGHT,
    OBJECTIVE_NOSE_HALF_HEIGHT,
  );
}

export function objectiveBarrelHalfHeight(params = {}) {
  return Math.min(
    OBJECTIVE_BODY_HALF_HEIGHT,
    objectiveNoseHalfHeight(params) + OBJECTIVE_BARREL_SHELL,
  );
}

export function objectiveBarrelHalfHeightAt(params = {}, x = OBJECTIVE_SHOULDER_X) {
  const outer = objectiveBarrelHalfHeight(params);
  const nose = objectiveNoseHalfHeight(params);
  if (x <= OBJECTIVE_SHOULDER_X) return outer;
  if (x >= OBJECTIVE_FRONT_X) return nose;
  const t = (x - OBJECTIVE_SHOULDER_X) / (OBJECTIVE_FRONT_X - OBJECTIVE_SHOULDER_X);
  return outer + (nose - outer) * t;
}

// Compatibility alias. The simplified objective has no separate BFP stop;
// its clear aperture and ideal lens share the fixed front plane.
export function objectiveStopX() {
  return OBJECTIVE_FRONT_X;
}

export function objectiveShowsAcceptance(params = {}) {
  return params?.showAcceptance === true;
}

export function migrateLegacyObjectiveParams(rawParams = {}, {
  focalKey = 'f',
  magnificationKey = 'magnification',
  naKey = 'na',
  apertureKey = 'aperture',
  tubeF = OBJECTIVE_REFERENCE_TUBE_F_MM,
} = {}) {
  const params = rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)
    ? { ...rawParams }
    : {};

  const reference = finite(tubeF) && tubeF > 0 ? tubeF : OBJECTIVE_REFERENCE_TUBE_F_MM;
  const legacyFocal = finite(params[focalKey]) && params[focalKey] > 0 ? params[focalKey] : null;
  const storedEfl = finite(params.efl) && params.efl > 0 ? params.efl : null;
  const storedMagnification = finite(params[magnificationKey])
    ? clamp(params[magnificationKey], OBJECTIVE_MAG_MIN, OBJECTIVE_MAG_MAX)
    : null;

  // Preserve the actual authored focus first. Minimal current scenes that
  // only store EFL then fall back to that EFL, fixing the old default-20x
  // migration bug. Older f/magnification sketches retain their old focus.
  if (!finite(params.workingDistance)) {
    if (storedEfl) params.workingDistance = storedEfl;
    else if (legacyFocal) params.workingDistance = legacyFocal;
    else if (storedMagnification) params.workingDistance = reference / storedMagnification;
    else params.workingDistance = 10;
  }
  params.workingDistance = clamp(params.workingDistance, OBJECTIVE_WD_MIN, OBJECTIVE_WD_MAX);
  params.efl = params.workingDistance;

  const aperture = finite(params.frontAperture)
    ? params.frontAperture
    : finite(params.clearAperture)
      ? params.clearAperture
      : finite(params[apertureKey])
        ? params[apertureKey]
        : 20;
  params.frontAperture = clamp(aperture, OBJECTIVE_FRONT_APERTURE_MIN, OBJECTIVE_FRONT_APERTURE_MAX);

  // The oldest objective stored its aperture as a pupil estimate. Recover an
  // NA only when there is no authored value, then classify its medium below.
  if (!finite(params[naKey]) && legacyFocal && finite(params[apertureKey]) && params[apertureKey] > 0) {
    params[naKey] = params[apertureKey] / (2 * legacyFocal);
  }
  if (params.immersion === undefined) {
    params.immersion = finite(params[naKey]) && params[naKey] > 1 ? 'legacy' : 'air';
  }
  return params;
}

