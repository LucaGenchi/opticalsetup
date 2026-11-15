// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// What a readout assumes about the direction out of the drawing plane
// (issue #313, step A5).
//
// The workbench traces in the drawing plane. A readout computed from the rays
// there is exact for the conditions issue #313 lists under "When a 2D trace is
// exact"; anything else has to say what it took for granted. Every detector
// readout therefore carries a scope, one of four:
//
//   plane       computed in the drawing plane, from the rays traced there;
//   outOfPlane  a number for the direction across the plane, entered or
//               estimated rather than traced (none yet: G3 adds the first);
//   meridional  computed from meridional rays only;
//   circular    assumes the beam is round, so its size across the plane equals
//               its size in it. Anything that needs a beam area (irradiance,
//               fluence, a 2D image) is computed only under this assumption.
//
// Every detector readout is "in the drawing plane": none needs a beam area,
// and the camera shows its profile in the plane only. The first quantity with
// another scope is the Gouy phase of a propagated beam (step G1), which
// assumes a circular beam until G3 and carries that scope beside its value;
// the others are here for the steps that bring them (G3-G5), so that a
// readout taking one of them on states it the same way.
//
// Scope is one field of the readout record that roadmap step 1.2 will give
// every readout ({ value, unit, approximation, evidence, caveats }), not a
// second labelling system. Every reading carries it. A detailed readout shows
// it and a summary only when it is not "in the drawing plane", with one
// further rule (Luca, 2026-11-14): "in the drawing plane" is stated only by
// the detectors whose readout is the light's spatial distribution, the camera
// and the wavefront detector. Power, spectrum, polarization and timing do not
// depend on how the light is spread across the beam, so the plane takes
// nothing from them worth saying; any other scope is stated wherever it
// applies.

export const READOUT_SCOPES = Object.freeze({
  plane: Object.freeze({ id: 'plane', label: 'In the drawing plane', short: 'IN PLANE' }),
  outOfPlane: Object.freeze({ id: 'outOfPlane', label: 'Out of the plane (a number only)', short: 'OUT OF PLANE' }),
  meridional: Object.freeze({ id: 'meridional', label: 'Meridional rays only', short: 'MERIDIONAL RAYS' }),
  circular: Object.freeze({ id: 'circular', label: 'Assumes a circular beam', short: 'CIRCULAR BEAM' }),
});

export function scopeInfo(id) {
  return READOUT_SCOPES[id] || null;
}

// The scope of every quantity a detector reading carries, by its key in the
// reading. A key missing here and from READING_DESCRIPTORS below fails
// test/readout-scope.test.js, so a new readout cannot arrive without one.
export const READING_SCOPES = Object.freeze({
  // detectorReading()
  signal: 'plane',
  wavelength: 'plane',
  bandMin: 'plane',
  bandMax: 'plane',
  polarization: 'plane',
  normalizedStokes: 'plane',
  spotSpan: 'plane',
  spectrum: 'plane',
  convergence: 'plane',
  pulse: 'plane',
  outputSignal: 'plane',
  saturated: 'plane',
  sourceFractions: 'plane',
  gain: 'plane',
  darkOutput: 'plane',
  snr: 'plane',
  profile: 'plane',
  depositedProfile: 'plane',
  depositedSignal: 'plane',
  centroid: 'plane',
  interference: 'plane',
  // enhancedReading()
  beamDiameter: 'plane',
  stokes: 'plane',
  wavefront: 'plane',
  bandwidth: 'plane',
  detectedPowerW: 'plane',
  // The propagated Gaussian beam (step G1): radius, wavefront, waist and
  // Rayleigh range per branch, in the drawing plane. The Gouy phase in it
  // assumes a circular beam and says so itself (gouyScope).
  beam: 'plane',
});

// Keys of a reading that describe it rather than measure anything: how it was
// made, how to draw it, or the caveats that go with it.
export const READING_DESCRIPTORS = Object.freeze(new Set([
  'approximations', 'weakLightIncomplete', 'samples', 'color', 'detectorType',
  'readoutKind', 'profileScale', 'profileColors', 'profileMode',
  'coherentPaths', 'dark', 'powerIsEstimated', 'powerCoversAllArrivals',
  'scope',
]));

// The scope a reading carries: one entry for each quantity it holds.
export function readingScope(reading) {
  const scope = {};
  for (const key of Object.keys(reading)) {
    if (key in READING_SCOPES) scope[key] = READING_SCOPES[key];
  }
  return scope;
}

// The scopes a summary shows: those that are not "in the drawing plane".
export function notableScopes(scope) {
  return [...new Set(Object.values(scope || {}).filter(id => id && id !== 'plane'))]
    .map(scopeInfo).filter(Boolean);
}

// The detectors whose readout is the light's spatial distribution.
export const SPATIAL_READOUT_KINDS = Object.freeze(new Set(['camera', 'wavefront']));

// The scopes a view states (see the rules above): `view` is 'detail' for a
// detailed readout (the inspector, a screen's detail view), else a summary.
export function statedScopes(reading, view) {
  const ids = [...new Set(Object.values(reading?.scope || {}))];
  const planeStated = view === 'detail' && SPATIAL_READOUT_KINDS.has(reading?.readoutKind);
  return ids.filter(id => id !== 'plane' || planeStated).map(scopeInfo).filter(Boolean);
}

// The scope a screen adds to its mode line.
export function scopeTag(reading, view) {
  return statedScopes(reading, view).map(scope => scope.short).join(' + ');
}
