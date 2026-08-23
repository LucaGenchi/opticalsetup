// Shared microscope-objective parameter model.
//
// Infinity-corrected objectives have several catalogue properties that must
// remain distinct. Effective focal length (EFL) is the objective's real
// optical power. Working distance is the independently specified clearance
// from the physical front boundary to the nominal specimen focus. Rated NA
// and front-medium index determine the object-side acceptance angle.
//
// EFL and working distance are BOTH honoured at once by not assuming the
// equivalent refracting plane sits at the front tip. Placing it at
//
//     lens plane = front tip + WD - EFL
//
// makes collimated light focus exactly WD beyond the tip while the plane
// itself still has focal length EFL — so an external tube lens produces the
// real catalogue magnification, and the back focal plane one EFL behind it
// is a genuine conjugate: light focused there leaves the objective
// collimated, which is what widefield (Köhler-style) illumination needs and
// what a scan relay must be imaged onto. Working distance is capped at EFL,
// so that plane always lands at or behind the tip — inside the barrel, where
// a real objective's principal plane and pupil actually sit. It is never
// drawn: an objective is an opaque barrel, not a visible singlet.
//
// Rated NA is a real aperture, not an annotation. The back pupil has
// diameter 2*EFL*NA and is the objective's aperture stop, so a beam that
// fills it converges at the rated angle and a beam that overfills it loses
// the overflow to the barrel — which is how NA is set in a real experiment.

export const OBJECTIVE_REFERENCE_TUBE_F_MM = 200;
export const OBJECTIVE_FRONT_X = 16;
export const OBJECTIVE_NA_MIN = 0.05;
export const OBJECTIVE_NA_MAX = 1.49;
export const OBJECTIVE_MAG_MIN = 1;
export const OBJECTIVE_MAG_MAX = 200;
export const OBJECTIVE_WD_MIN = 1;
// Working distance has no fixed ceiling any more: it is bounded by the
// objective's own focal length (see objectiveMaximumWorkingDistance).
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
  // 0.85 is the practical dry ceiling; 1.00 is the physical limit of air
  // that no real dry objective reaches.
  air: medium('Dry / air', 1, 0.85, null),
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

export const OBJECTIVE_EFL_MIN = 1;
export const OBJECTIVE_EFL_MAX = 200;

// The primary optical parameter. Older sketches stored magnification
// instead, so fall back to the tube-lens convention that produced it.
export function objectiveEffectiveFocalLength(params = {}, tubeF = OBJECTIVE_REFERENCE_TUBE_F_MM) {
  const reference = clamp(finite(tubeF) ? tubeF : OBJECTIVE_REFERENCE_TUBE_F_MM, 1, 1000);
  if (finite(params.efl)) return clamp(params.efl, OBJECTIVE_EFL_MIN, OBJECTIVE_EFL_MAX);
  const legacyMag = clamp(finite(params.magnification) ? params.magnification : 20, OBJECTIVE_MAG_MIN, OBJECTIVE_MAG_MAX);
  return clamp(reference / legacyMag, OBJECTIVE_EFL_MIN, OBJECTIVE_EFL_MAX);
}

// Now a reported consequence of EFL, not an independent setting: the
// magnification you get once YOUR tube lens images the objective's output.
export function objectiveMagnification(params = {}, tubeF = OBJECTIVE_REFERENCE_TUBE_F_MM) {
  const reference = clamp(finite(tubeF) ? tubeF : OBJECTIVE_REFERENCE_TUBE_F_MM, 1, 1000);
  return reference / objectiveEffectiveFocalLength(params, tubeF);
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

export const OBJECTIVE_NA_DEFAULT = 0.65;

export function objectiveNumericalAperture(params = {}, key = 'na') {
  return clamp(
    finite(params[key]) ? params[key] : OBJECTIVE_NA_DEFAULT,
    OBJECTIVE_NA_MIN,
    objectiveMaximumNA(params),
  );
}

// A real objective focuses at or inside its own focal length: the nominal
// specimen plane is one EFL from the principal plane, and the glass takes up
// the difference. Working distance therefore defaults to EFL and can only be
// shortened from there, which also keeps the equivalent plane inside the
// barrel instead of floating out in front of the tip.
export function objectiveMaximumWorkingDistance(params = {}) {
  return Math.max(OBJECTIVE_WD_MIN, objectiveEffectiveFocalLength(params));
}

export function objectiveWorkingDistance(params = {}) {
  const efl = objectiveEffectiveFocalLength(params);
  return clamp(
    finite(params.workingDistance) ? params.workingDistance : efl,
    OBJECTIVE_WD_MIN,
    objectiveMaximumWorkingDistance(params),
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
  normalized.efl = objectiveEffectiveFocalLength(normalized);
  normalized.workingDistance = objectiveWorkingDistance(normalized);
  normalized.frontAperture = objectiveFrontAperture(normalized);
  // Magnification is derived now; drop any stored copy so it can never
  // disagree with the EFL that actually drives the trace.
  delete normalized.magnification;
  return normalized;
}

export function objectiveFocalLength(params = {}, tubeF = OBJECTIVE_REFERENCE_TUBE_F_MM) {
  return objectiveEffectiveFocalLength(params, tubeF);
}

// Where the equivalent thin lens actually sits, so that focal length and
// working distance are both true at once (see the header note).
export function objectiveLensPlaneX(params = {}) {
  return OBJECTIVE_FRONT_X + objectiveWorkingDistance(params) - objectiveEffectiveFocalLength(params);
}

// One focal length behind the lens plane: a real traced conjugate, not a
// marker. Light focused here leaves the objective collimated.
export function objectiveBackFocalPlaneX(params = {}) {
  return objectiveLensPlaneX(params) - objectiveEffectiveFocalLength(params);
}

// The housing has to physically contain its own optics, so the barrel grows
// backwards whenever a short working distance pulls the lens plane behind the
// default rear face. Only the straight rear section lengthens — the tapered
// nose keeps the shape an objective is recognised by.
//
// The nose spans SHOULDER_X..FRONT_X (9 mm) and the straight section
// DEFAULT_BACK_X..SHOULDER_X (28 mm): a stubby taper on a long body, which is
// what a real objective looks like from the side.
export const OBJECTIVE_DEFAULT_BACK_X = -21;
export const OBJECTIVE_SHOULDER_X = 7;
export function objectiveBackX(params = {}) {
  return Math.min(OBJECTIVE_DEFAULT_BACK_X, objectiveLensPlaneX(params) - 4);
}

// The rated back pupil, which is the objective's real aperture stop: a beam
// filling it converges at the rated NA, and anything wider is lost to the
// barrel. 2*f*NA is the standard first-order (Abbe sine condition) estimate.
export function objectivePupilRadius(params = {}, tubeF = OBJECTIVE_REFERENCE_TUBE_F_MM) {
  return objectivePupilDiameter(params, tubeF) / 2;
}

// Half-height of the barrel's straight rear section. The housing has to be
// wide enough to hold its own pupil, so a large 2*f*NA makes the objective
// physically fatter rather than silently clipping at the drawn outline.
export function objectiveBarrelHalfHeight(params = {}) {
  return Math.max(objectiveFrontAperture(params) / 2 + 7, objectivePupilRadius(params) + 2);
}

// ...and at an arbitrary point along it, so a stop placed inside the tapered
// nose cannot block light that visually passes outside the barrel.
export function objectiveBarrelHalfHeightAt(params = {}, x = OBJECTIVE_SHOULDER_X) {
  const outer = objectiveBarrelHalfHeight(params);
  const tip = objectiveFrontAperture(params) / 2;
  if (x <= OBJECTIVE_SHOULDER_X) return outer;
  if (x >= OBJECTIVE_FRONT_X) return tip;
  const t = (x - OBJECTIVE_SHOULDER_X) / (OBJECTIVE_FRONT_X - OBJECTIVE_SHOULDER_X);
  return outer + (tip - outer) * t;
}

// Where the aperture stop physically sits. For an infinity objective the
// entrance pupil IS the back focal plane, and that is what makes relaying a
// scan mirror onto the BFP worth doing: a beam pivoting there stays centred
// in the stop at every scan angle, while a mismatched pivot walks across it
// and vignettes. The single-plane model can push the BFP further back than
// any real barrel, so the stop is clamped into the housing rather than left
// blocking light in mid-air behind it.
export function objectiveStopX(params = {}) {
  return Math.max(objectiveBackFocalPlaneX(params), objectiveBackX(params) + 1);
}

// The purple acceptance sector is an explanatory overlay, off unless asked
// for, so the default objective draws as a plain barrel.
export function objectiveShowsAcceptance(params = {}) {
  return params?.showAcceptance === true;
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
    if (!finite(params.efl)) params.efl = clamp(focal, OBJECTIVE_EFL_MIN, OBJECTIVE_EFL_MAX);
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
  // EFL became the primary optical parameter. A sketch that stored only
  // magnification must be converted here, BEFORE the schema fills in the
  // `efl` default — otherwise that default would win and silently give the
  // objective a different focal length than the one it was saved with. The
  // conversion uses the bounded magnification for the same reason the
  // geometry below does.
  if (!finite(params.efl)) {
    params.efl = clamp(equivalentFocalLength, OBJECTIVE_EFL_MIN, OBJECTIVE_EFL_MAX);
  }
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
