// Shared microscope-objective parameter model.
//
// Infinity-corrected objectives are specified by magnification and numerical
// aperture in the UI. The geometric tracer still needs an effective thin-lens
// focal length, derived from the tube-lens convention f_obj = f_tube / M.
// Working distance — how far in front of the objective it actually focuses —
// is the same quantity expressed in a more graphically useful unit: this
// single-surface qualitative model has nowhere else for that distance to
// come from, so editing either magnification or working distance keeps the
// other in sync (see inspector.js).

export const OBJECTIVE_REFERENCE_TUBE_F_MM = 200;
export const OBJECTIVE_NA_MIN = 0.05;
export const OBJECTIVE_NA_MAX = 1.49;
export const OBJECTIVE_MAG_MIN = 1;
export const OBJECTIVE_MAG_MAX = 200;

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
  return normalized;
}

export function objectiveFocalLength(params = {}, tubeF = OBJECTIVE_REFERENCE_TUBE_F_MM) {
  const reference = clamp(finite(tubeF) ? tubeF : OBJECTIVE_REFERENCE_TUBE_F_MM, 1, 1000);
  return reference / objectiveMagnification(params);
}

// Magnification expressed the other way round: the tube-lens reference
// distance divided by the desired working distance. Used only to translate a
// user-entered working distance back into a magnification — the tracer
// itself always reads magnification via objectiveFocalLength().
export function magnificationForWorkingDistance(workingDistanceMm, tubeF = OBJECTIVE_REFERENCE_TUBE_F_MM) {
  const reference = clamp(finite(tubeF) ? tubeF : OBJECTIVE_REFERENCE_TUBE_F_MM, 1, 1000);
  const wd = clamp(finite(workingDistanceMm) ? workingDistanceMm : reference / 20, reference / OBJECTIVE_MAG_MAX, reference / OBJECTIVE_MAG_MIN);
  return clamp(reference / wd, OBJECTIVE_MAG_MIN, OBJECTIVE_MAG_MAX);
}

// The drawn barrel/pupil width, and the actual ray-accepting aperture height
// the tracer clips against — these always agree, so the box you see is the
// box that vignettes. It tracks magnification/working distance (2x focal
// length is a plain, continuous stand-in for a real pupil calculation) but
// deliberately NOT NA: NA is an angular acceptance property of the design,
// not a statement about how physically large the barrel is, so dragging the
// NA field must never resize the objective — see the resize handle in
// elements.js, wired to magnification instead.
export function objectivePupilDiameter(params = {}, tubeF = OBJECTIVE_REFERENCE_TUBE_F_MM) {
  return clamp(2 * objectiveFocalLength(params, tubeF), 0.5, 150);
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
  if (params.immersion === undefined) {
    params.immersion = finite(params[naKey]) && params[naKey] > 1 ? 'legacy' : 'air';
  }
  return params;
}
