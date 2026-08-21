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

const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function objectiveMagnification(params = {}) {
  return clamp(finite(params.magnification) ? params.magnification : 20, OBJECTIVE_MAG_MIN, OBJECTIVE_MAG_MAX);
}

export function objectiveNumericalAperture(params = {}, key = 'na') {
  return clamp(finite(params[key]) ? params[key] : 1, OBJECTIVE_NA_MIN, OBJECTIVE_NA_MAX);
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
  if (!finite(focal) || focal <= 0) return params;
  const reference = finite(tubeF) && tubeF > 0 ? tubeF : OBJECTIVE_REFERENCE_TUBE_F_MM;
  if (!finite(params[magnificationKey])) params[magnificationKey] = reference / focal;
  const aperture = params[apertureKey];
  if (!finite(params[naKey]) && finite(aperture) && aperture > 0) {
    params[naKey] = aperture / (2 * focal);
  }
  return params;
}
