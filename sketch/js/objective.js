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
// High-magnification objectives routinely have sub-millimetre clearances.
// Keep a small positive floor so the nominal focus can never collapse onto
// (or cross behind) the physical front tip, while still representing common
// oil-objective working distances such as 0.13 mm.
export const OBJECTIVE_WD_MIN = 0.05;
// Real long-working-distance objectives reach WD well beyond their own EFL
// (a 100x Plan Apo NIR focuses ~12 mm out on a 2 mm EFL), so the ceiling is a
// catalogue bound rather than a derived one. See objectiveMaximumWorkingDistance.
export const OBJECTIVE_WD_MAX = 40;
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

// 2 mm is a 100x objective, 60 mm a 3.3x. Beyond that an "objective" is just
// a lens, and the derived barrel and internal planes stop being drawable at
// any sane canvas zoom. 60 also clears the longest EFL in any existing sketch.
export const OBJECTIVE_EFL_MIN = 2;
export const OBJECTIVE_EFL_MAX = 60;

const objectivePreset = (key, group, label, params) => Object.freeze({
  key,
  group,
  label,
  params: Object.freeze(params),
});

// Grouped by immersion class, with the magnification/NA pairs people actually
// buy. These are plausible catalogue-shaped specs, not one manufacturer's
// prescriptions. EFL is 200/magnification throughout; working distance follows
// the real trade-off, so pushing NA up at a fixed magnification buys a shorter
// clearance. Exact values stay editable under Advanced parameters.
export const OBJECTIVE_PRESET_GROUPS = Object.freeze([
  'Dry', 'Water immersion', 'Oil immersion', 'Long working distance',
]);

export const OBJECTIVE_PRESETS = Object.freeze([
  // ---- dry ----------------------------------------------------------------
  objectivePreset('dry-5x-014',   'Dry', '5x dry - NA 0.20 - WD 20 mm',
    { efl: 40, workingDistance: 20, immersion: 'air', na: 0.2, frontAperture: 20 }),
  objectivePreset('dry-10x-040',  'Dry', '10x dry - NA 0.40 - WD 3.5 mm',
    { efl: 20, workingDistance: 3.5, immersion: 'air', na: 0.4, frontAperture: 14 }),
  objectivePreset('dry-20x-025',  'Dry', '20x dry - NA 0.25 - WD 8 mm',
    { efl: 10, workingDistance: 8, immersion: 'air', na: 0.25, frontAperture: 12 }),
  objectivePreset('dry-20x-040',  'Dry', '20x dry - NA 0.40 - WD 5 mm',
    { efl: 10, workingDistance: 5, immersion: 'air', na: 0.4, frontAperture: 11 }),
  objectivePreset('dry-20x-065',  'Dry', '20x dry - NA 0.65 - WD 1.7 mm',
    { efl: 10, workingDistance: 1.7, immersion: 'air', na: 0.65, frontAperture: 10 }),
  objectivePreset('dry-20x-080',  'Dry', '20x dry - NA 0.80 - WD 0.8 mm',
    { efl: 10, workingDistance: 0.8, immersion: 'air', na: 0.8, frontAperture: 10 }),
  objectivePreset('dry-40x-040',  'Dry', '40x dry - NA 0.40 - WD 3.5 mm',
    { efl: 5, workingDistance: 3.5, immersion: 'air', na: 0.4, frontAperture: 8 }),
  objectivePreset('dry-40x-065',  'Dry', '40x dry - NA 0.65 - WD 1.5 mm',
    { efl: 5, workingDistance: 1.5, immersion: 'air', na: 0.65, frontAperture: 8 }),
  objectivePreset('dry-40x-080',  'Dry', '40x dry - NA 0.80 - WD 0.6 mm',
    { efl: 5, workingDistance: 0.6, immersion: 'air', na: 0.8, frontAperture: 8 }),
  // ---- water --------------------------------------------------------------
  objectivePreset('water-20x-080', 'Water immersion', '20x water - NA 0.80 - WD 3.5 mm',
    { efl: 10, workingDistance: 3.5, immersion: 'water', na: 0.8, frontAperture: 10 }),
  objectivePreset('water-20x-100', 'Water immersion', '20x water - NA 1.00 - WD 2 mm',
    { efl: 10, workingDistance: 2, immersion: 'water', na: 1, frontAperture: 10 }),
  objectivePreset('water-40x-100', 'Water immersion', '40x water - NA 1.00 - WD 2.5 mm',
    { efl: 5, workingDistance: 2.5, immersion: 'water', na: 1, frontAperture: 8 }),
  objectivePreset('water-40x-120', 'Water immersion', '40x water - NA 1.20 - WD 0.28 mm',
    { efl: 5, workingDistance: 0.28, immersion: 'water', na: 1.2, frontAperture: 8 }),
  objectivePreset('water-60x-120', 'Water immersion', '60x water - NA 1.20 - WD 0.28 mm',
    { efl: OBJECTIVE_REFERENCE_TUBE_F_MM / 60, workingDistance: 0.28, immersion: 'water', na: 1.2, frontAperture: 7 }),
  objectivePreset('water-60x-127', 'Water immersion', '60x water - NA 1.27 - WD 0.17 mm',
    { efl: OBJECTIVE_REFERENCE_TUBE_F_MM / 60, workingDistance: 0.17, immersion: 'water', na: 1.27, frontAperture: 7 }),
  // ---- oil ----------------------------------------------------------------
  objectivePreset('oil-40x-140', 'Oil immersion', '40x oil - NA 1.40 - WD 0.13 mm',
    { efl: 5, workingDistance: 0.13, immersion: 'oil', na: 1.4, frontAperture: 8 }),
  objectivePreset('oil-60x-140', 'Oil immersion', '60x oil - NA 1.40 - WD 0.13 mm',
    { efl: OBJECTIVE_REFERENCE_TUBE_F_MM / 60, workingDistance: 0.13, immersion: 'oil', na: 1.4, frontAperture: 7 }),
  objectivePreset('oil-100x-140', 'Oil immersion', '100x oil - NA 1.40 - WD 0.13 mm',
    { efl: 2, workingDistance: 0.13, immersion: 'oil', na: 1.4, frontAperture: 6 }),
  // ---- long working distance (Plan Apo NIR class) -------------------------
  objectivePreset('lwd-5x-014',   'Long working distance', '5x LWD - NA 0.14 - WD 34 mm',
    { efl: 40, workingDistance: 34, immersion: 'air', na: 0.14, frontAperture: 20 }),
  objectivePreset('lwd-10x-026',  'Long working distance', '10x LWD - NA 0.26 - WD 30.5 mm',
    { efl: 20, workingDistance: 30.5, immersion: 'air', na: 0.26, frontAperture: 16 }),
  objectivePreset('lwd-20x-040',  'Long working distance', '20x LWD - NA 0.40 - WD 20 mm',
    { efl: 10, workingDistance: 20, immersion: 'air', na: 0.4, frontAperture: 14 }),
  objectivePreset('lwd-50x-042',  'Long working distance', '50x LWD - NA 0.42 - WD 17 mm',
    { efl: 4, workingDistance: 17, immersion: 'air', na: 0.42, frontAperture: 10 }),
  objectivePreset('lwd-100x-050', 'Long working distance', '100x LWD - NA 0.50 - WD 12 mm',
    { efl: 2, workingDistance: 12, immersion: 'air', na: 0.5, frontAperture: 8 }),
]);

export const OBJECTIVE_DEFAULT_PRESET = 'dry-20x-065';

const closeEnough = (a, b) => Math.abs(a - b) <= 1e-6;

export function objectivePresetKey(params = {}) {
  return OBJECTIVE_PRESETS.find(preset => {
    const spec = preset.params;
    return closeEnough(objectiveEffectiveFocalLength(params), spec.efl)
      && closeEnough(objectiveWorkingDistance(params), spec.workingDistance)
      && objectiveMediumKey(params) === spec.immersion
      && closeEnough(objectiveNumericalAperture(params), spec.na)
      && closeEnough(objectiveFrontAperture(params), spec.frontAperture);
  })?.key || 'custom';
}

export function applyObjectivePreset(params = {}, key = OBJECTIVE_DEFAULT_PRESET) {
  const preset = OBJECTIVE_PRESETS.find(candidate => candidate.key === key);
  return preset ? normalizeObjectiveParams({ ...params, ...preset.params }) : normalizeObjectiveParams(params);
}

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

// Long-working-distance designs put the equivalent principal plane ahead of
// the front glass, so WD genuinely exceeds EFL on real hardware. The bound is
// therefore the catalogue ceiling, not the focal length. Missing/legacy values
// still fall back to EFL, which is what the old model recorded.
// Whichever is larger: the catalogue ceiling, or this objective's own EFL.
// The EFL term is what keeps every pre-existing sketch intact — the old model
// defaulted WD to EFL, so a legacy 60 mm objective carries WD 60 and must not
// be silently pulled in to the catalogue bound.
export function objectiveMaximumWorkingDistance(params = {}) {
  return Math.max(OBJECTIVE_WD_MAX, objectiveEffectiveFocalLength(params));
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
  // Seed it from the EFL the objective actually finishes loading with, so a
  // malformed legacy magnification cannot leave WD describing a focal length
  // the element no longer has.
  if (!finite(params.workingDistance)) {
    params.workingDistance = clamp(equivalentFocalLength, OBJECTIVE_EFL_MIN, OBJECTIVE_EFL_MAX);
  }
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
