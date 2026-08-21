// Shared microscope-objective parameter model.
//
// Infinity-corrected objectives have several catalogue properties that must
// remain distinct. Magnification determines the equivalent focal length via
// the reference tube lens. Working distance is the independently specified
// clearance from the physical front boundary to the nominal specimen focus.
// Rated NA and front-medium index determine the object-side acceptance angle.

export const OBJECTIVE_REFERENCE_TUBE_F_MM = 200;
export const OBJECTIVE_FRONT_X = 16;
export const OBJECTIVE_NA_MIN = 0.05;
export const OBJECTIVE_NA_MAX = 1.49;
export const OBJECTIVE_MAG_MIN = 1;
export const OBJECTIVE_MAG_MAX = 200;
export const OBJECTIVE_WD_MIN = 0.1;
export const OBJECTIVE_WD_MAX = 200;
export const OBJECTIVE_FRONT_APERTURE_MIN = 1;
export const OBJECTIVE_FRONT_APERTURE_MAX = 100;

const CUSTOM_IMMERSION_INDEX_DEFAULT = 1.333;
const IMMERSION_INDEX_MIN = 1;
const IMMERSION_INDEX_MAX = 2;

const medium = (label, index, maxNA, fill, extra = {}) => Object.freeze({
  label,
  index,
  // Keep the conventional optical symbol alongside the descriptive name so
  // renderers and explanatory UI can use either without re-declaring data.
  n: index,
  maxNA,
  fill,
  ...extra,
});

// This catalogue describes the objective's designed front medium. It is not
// a set of independently placeable materials: scene code derives a coupling
// gap from the objective and a compatible target. `legacy` is deliberately
// unresolved so loading an older high-NA objective does not invent water or
// oil that the saved sketch never specified.
export const OBJECTIVE_MEDIA = Object.freeze({
  air: medium('Dry / air', 1, 1, null),
  water: medium('Water', 1.333, 1.27, '#8fd3ed'),
  oil: medium('Oil', 1.518, OBJECTIVE_NA_MAX, '#c9a227'),
  custom: medium('Custom index', null, null, '#9fc8bd'),
  legacy: medium('Legacy (medium unresolved)', null, OBJECTIVE_NA_MAX, null, {
    selectable: false,
    unresolved: true,
  }),
});

const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function objectiveMagnification(params = {}) {
  return clamp(finite(params.magnification) ? params.magnification : 20, OBJECTIVE_MAG_MIN, OBJECTIVE_MAG_MAX);
}

export function objectiveMediumKey(params = {}) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return 'air';
  if (typeof params.immersion === 'string' && Object.hasOwn(OBJECTIVE_MEDIA, params.immersion)) {
    return params.immersion;
  }
  // New objectives store `air` explicitly. A missing value can therefore be
  // interpreted as an old sketch, whose >1 NA must remain usable without
  // pretending we know which immersion material the author intended.
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

export function objectiveNumericalAperture(params = {}, key = 'na') {
  return clamp(finite(params[key]) ? params[key] : 1, OBJECTIVE_NA_MIN, objectiveMaximumNA(params));
}

export function objectiveWorkingDistance(params = {}) {
  const fallback = objectiveFocalLength(params);
  return clamp(
    finite(params.workingDistance) ? params.workingDistance : fallback,
    OBJECTIVE_WD_MIN,
    OBJECTIVE_WD_MAX,
  );
}

export function objectiveFrontAperture(params = {}) {
  const fallback = clamp(2 * objectiveFocalLength(params), OBJECTIVE_FRONT_APERTURE_MIN, OBJECTIVE_FRONT_APERTURE_MAX);
  return clamp(
    finite(params.frontAperture) ? params.frontAperture : fallback,
    OBJECTIVE_FRONT_APERTURE_MIN,
    OBJECTIVE_FRONT_APERTURE_MAX,
  );
}

export function objectiveAcceptanceHalfAngle(params = {}) {
  const index = objectiveMediumIndex(params);
  if (!finite(index) || index <= 0) return null;
  return Math.asin(clamp(objectiveNumericalAperture(params) / index, 0, 1));
}

export function objectiveAcceptanceHalfAngleDeg(params = {}) {
  const radians = objectiveAcceptanceHalfAngle(params);
  return finite(radians) ? radians * 180 / Math.PI : null;
}

export function normalizeObjectiveParams(params = {}) {
  const normalized = params && typeof params === 'object' && !Array.isArray(params)
    ? { ...params }
    : {};
  normalized.immersion = objectiveMediumKey(normalized);
  normalized.immersionIndex = clamp(
    finite(normalized.immersionIndex) ? normalized.immersionIndex : CUSTOM_IMMERSION_INDEX_DEFAULT,
    IMMERSION_INDEX_MIN,
    IMMERSION_INDEX_MAX,
  );
  normalized.na = objectiveNumericalAperture(normalized);
  normalized.workingDistance = objectiveWorkingDistance(normalized);
  normalized.frontAperture = objectiveFrontAperture(normalized);
  return normalized;
}

export function objectiveFocalLength(params = {}, tubeF = OBJECTIVE_REFERENCE_TUBE_F_MM) {
  const reference = clamp(finite(tubeF) ? tubeF : OBJECTIVE_REFERENCE_TUBE_F_MM, 1, 1000);
  return reference / objectiveMagnification(params);
}

// Common first-order estimate for an infinity objective's entrance pupil.
// The physical front opening remains an independently resizable boundary;
// this derived value describes the rated pupil rather than the outer barrel.
export function objectivePupilDiameter(params = {}, tubeF = OBJECTIVE_REFERENCE_TUBE_F_MM) {
  return clamp(2 * objectiveFocalLength(params, tubeF) * objectiveNumericalAperture(params), 0.5, 150);
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
  const focal = params[focalKey];
  if (finite(focal) && focal > 0) {
    const reference = finite(tubeF) && tubeF > 0 ? tubeF : OBJECTIVE_REFERENCE_TUBE_F_MM;
    if (!finite(params[magnificationKey])) params[magnificationKey] = reference / focal;
    const aperture = params[apertureKey];
    if (!finite(params[naKey]) && finite(aperture) && aperture > 0) {
      params[naKey] = aperture / (2 * focal);
    }
  }
  const reference = finite(tubeF) && tubeF > 0 ? tubeF : OBJECTIVE_REFERENCE_TUBE_F_MM;
  // Derive compatibility geometry from the same bounded magnification that
  // the registry will retain. Otherwise malformed legacy values such as 0
  // or 10000 would seed WD/aperture from a different objective than the one
  // that actually finishes loading.
  const magnification = clamp(
    finite(params[magnificationKey]) ? params[magnificationKey] : 20,
    OBJECTIVE_MAG_MIN,
    OBJECTIVE_MAG_MAX,
  );
  const equivalentFocalLength = reference / magnification;
  // The previous model made WD exactly equal to EFL. Preserve that geometry
  // when opening an older sketch, then let future edits keep them separate.
  if (!finite(params.workingDistance)) params.workingDistance = equivalentFocalLength;
  if (!finite(params.frontAperture)) {
    params.frontAperture = finite(params[apertureKey]) && params[apertureKey] > 0
      ? params[apertureKey]
      : 2 * equivalentFocalLength;
  }
  if (params.immersion === undefined) {
    params.immersion = finite(params[naKey]) && params[naKey] > 1 ? 'legacy' : 'air';
  }
  return params;
}
