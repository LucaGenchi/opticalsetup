// Shared microscope-objective parameter model.
//
// Infinity-corrected objectives are specified by magnification and numerical
// aperture in the UI. The geometric tracer still needs an effective thin-lens
// focal length, derived from the tube-lens convention f_obj = f_tube / M.

export const OBJECTIVE_REFERENCE_TUBE_F_MM = 200;
export const OBJECTIVE_NA_MIN = 0.05;
export const OBJECTIVE_NA_MAX = 1.49;
export const OBJECTIVE_CLEAR_APERTURE_MM = 20;

const finite = value => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function objectiveMagnification(params = {}) {
  return clamp(finite(params.magnification) ? params.magnification : 20, 1, 200);
}

export function objectiveNumericalAperture(params = {}, key = 'na') {
  return clamp(finite(params[key]) ? params[key] : 1, OBJECTIVE_NA_MIN, OBJECTIVE_NA_MAX);
}

export function objectiveFocalLength(params = {}, tubeF = OBJECTIVE_REFERENCE_TUBE_F_MM) {
  const reference = clamp(finite(tubeF) ? tubeF : OBJECTIVE_REFERENCE_TUBE_F_MM, 1, 1000);
  return reference / objectiveMagnification(params);
}

export function objectivePupilDiameter() {
  // Keep the objective's drawn body and physical clear aperture independent of
  // magnification and NA. NA is an angular acceptance property and is carried
  // separately on the objective surface for the tracer; changing optical
  // parameters must not resize the draggable objective on the canvas.
  return OBJECTIVE_CLEAR_APERTURE_MM;
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
