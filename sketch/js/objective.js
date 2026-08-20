// Shared microscope-objective parameter model.
//
// Infinity-corrected objectives are specified by magnification and numerical
// aperture in the UI. The geometric tracer still needs an effective thin-lens
// focal length, derived from the tube-lens convention f_obj = f_tube / M.

export const OBJECTIVE_REFERENCE_TUBE_F_MM = 200;
export const OBJECTIVE_NA_MIN = 0.05;
export const OBJECTIVE_NA_MAX = 1.49;

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

export function objectivePupilDiameter(params = {}, tubeF = OBJECTIVE_REFERENCE_TUBE_F_MM, naKey = 'na') {
  const focal = objectiveFocalLength(params, tubeF);
  const na = objectiveNumericalAperture(params, naKey);
  // Paraxial entrance-pupil estimate used only by this qualitative 2D tracer.
  return clamp(2 * focal * na, 0.5, 150);
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
