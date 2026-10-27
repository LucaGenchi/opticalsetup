// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The lens designer's system description: a rotationally symmetric,
// sequential prescription plus its aperture, fields, wavelengths and image
// plane. normalizeSystem() is the schema boundary: anything read from the
// editor, a file or a link passes through it, so the engine only ever sees
// finite, clamped numbers and known materials.
//
// Conventions: lengths in mm, wavelengths in nm, angles in degrees. The axis
// is z and light travels toward +z. A radius is positive when the centre of
// curvature lies on the +z side of the vertex; 0 means flat. Each surface row
// gives the medium *after* the surface and the axial distance to the next
// surface (for the last row, to the image plane when the focus is "fixed").

import { AIR, CONSTANT, INDEX_MIN, INDEX_MAX, isKnownMaterial } from './materials.js';

export const FORMAT = 'opticalsetup-lens';
export const FORMAT_VERSION = 1;

export const ASPHERE_ORDERS = [4, 6, 8, 10, 12, 14, 16];
export const SURFACE_TYPES = ['standard', 'paraxial'];

export const LIMITS = Object.freeze({
  surfaces: 40,
  radius: 1e6,
  thickness: 1e5,
  semiDiameter: 1e4,
  conic: 1e3,
  focal: 1e6,
  asphere: 1e3,
  wavelengths: 5,
  wavelengthNm: [200, 20000],
  fields: 6,
  angleDeg: 89,
  objectHeight: 1e6,
  objectDistance: [1e-3, 1e9],
  epd: [1e-4, 1e5],
  fno: [0.05, 1e4],
  na: [1e-6, 0.999],
  pupilSamples: [4, 128],
  imageOffset: 1e5,
  weight: 1e6,
  beamRatio: [0.05, 10],
});

// Diffraction settings: the pupil grid N (samples across the pupil at the
// shortest wavelength), the zero-padding factor Q (FFT size N·Q, at most
// 1024), the illumination of the entrance pupil, and whether apertures cut
// the beam. A file without them (format version 1 from before they existed)
// reads with these defaults.
export const DIFFRACTION_GRIDS = [32, 64, 128, 256];
export const DIFFRACTION_PADDING = [2, 4];
export const ILLUMINATIONS = ['uniform', 'gaussian'];
export function defaultDiffraction() {
  return { grid: 64, padding: 2, illumination: 'uniform', beamRatio: 1, vignetting: true };
}

// Fraunhofer F, d and C lines (nm): the default visible set.
export const LINES_FDC = [486.1327, 587.5618, 656.2725];

const finite = (value, fallback) => {
  const n = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clampAbs = (v, max) => clamp(v, -max, max);

export function defaultSurface() {
  return { type: 'standard', radius: 0, conic: 0, asphere: ASPHERE_ORDERS.map(() => 0), thickness: 5, material: AIR, index: 1.5, semiDiameter: 0, stop: false, focal: 100 };
}

export function normalizeSurface(raw = {}) {
  const s = defaultSurface();
  s.type = SURFACE_TYPES.includes(raw.type) ? raw.type : 'standard';
  s.radius = clampAbs(finite(raw.radius, 0), LIMITS.radius);
  if (Math.abs(s.radius) < 1e-9) s.radius = 0;
  s.conic = clampAbs(finite(raw.conic, 0), LIMITS.conic);
  const asphere = Array.isArray(raw.asphere) ? raw.asphere : [];
  s.asphere = ASPHERE_ORDERS.map((_, i) => clampAbs(finite(asphere[i], 0), LIMITS.asphere));
  s.thickness = clamp(finite(raw.thickness, 5), 0, LIMITS.thickness);
  s.material = isKnownMaterial(raw.material) ? raw.material : AIR;
  s.index = clamp(finite(raw.index, 1.5), INDEX_MIN, INDEX_MAX);
  s.semiDiameter = clamp(finite(raw.semiDiameter, 0), 0, LIMITS.semiDiameter);
  s.stop = raw.stop === true;
  // An ideal lens has no profile and sits in air on both sides: its power is
  // 1/f, and nothing else about it is defined.
  if (s.type === 'paraxial') {
    const f = clampAbs(finite(raw.focal, 100), LIMITS.focal);
    s.focal = Math.abs(f) < 1e-6 ? 100 : f;
    s.radius = 0; s.conic = 0; s.asphere = ASPHERE_ORDERS.map(() => 0);
    s.material = AIR;
  }
  return s;
}

export function normalizeSystem(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const rows = Array.isArray(src.surfaces) ? src.surfaces.slice(0, LIMITS.surfaces) : [];
  const surfaces = rows.map(normalizeSurface);
  if (!surfaces.length) surfaces.push(normalizeSurface({ radius: 50, thickness: 4, material: 'nbk7', stop: true }), normalizeSurface({ radius: -50, thickness: 48 }));
  // Exactly one stop: the first flagged row, or the first surface.
  const firstStop = surfaces.findIndex(s => s.stop);
  surfaces.forEach((s, i) => { s.stop = i === (firstStop < 0 ? 0 : firstStop); });

  const object = src.object && typeof src.object === 'object' ? src.object : {};
  const atInfinity = object.atInfinity !== false;
  const objectDistanceMm = clamp(finite(object.distanceMm, 100), ...LIMITS.objectDistance);

  const ap = src.aperture && typeof src.aperture === 'object' ? src.aperture : {};
  let apertureType = ['epd', 'fno', 'na'].includes(ap.type) ? ap.type : 'epd';
  // Object-space NA needs an object at a finite distance.
  if (apertureType === 'na' && atInfinity) apertureType = 'epd';
  const apertureRange = LIMITS[apertureType];
  const apertureFallback = { epd: 10, fno: 5, na: 0.1 }[apertureType];
  const apertureValue = clamp(finite(ap.value, apertureFallback), ...apertureRange);

  const fl = src.fields && typeof src.fields === 'object' ? src.fields : {};
  // Field angles need an object at infinity; heights need a finite object.
  const fieldType = atInfinity ? 'angle' : 'height';
  const fieldMax = fieldType === 'angle' ? LIMITS.angleDeg : LIMITS.objectHeight;
  let fieldValues = (Array.isArray(fl.values) ? fl.values : [0])
    .slice(0, LIMITS.fields).map(v => clamp(Math.abs(finite(v, 0)), 0, fieldMax));
  if (fl.type && fl.type !== fieldType) fieldValues = [0];
  if (!fieldValues.length) fieldValues = [0];

  let wavelengthsNm = (Array.isArray(src.wavelengthsNm) ? src.wavelengthsNm : LINES_FDC)
    .slice(0, LIMITS.wavelengths).map(v => clamp(finite(v, 587.5618), ...LIMITS.wavelengthNm));
  if (!wavelengthsNm.length) wavelengthsNm = [587.5618];
  const primary = clamp(Math.round(finite(src.primaryWavelength, Math.floor(wavelengthsNm.length / 2))), 0, wavelengthsNm.length - 1);

  // One weight per wavelength for the polychromatic sums; missing ones are
  // 1, and all zero means equal weights.
  const rawWeights = Array.isArray(src.wavelengthWeights) ? src.wavelengthWeights : [];
  let wavelengthWeights = wavelengthsNm.map((_, i) => clamp(finite(rawWeights[i], 1), 0, LIMITS.weight));
  if (!wavelengthWeights.some(w => w > 0)) wavelengthWeights = wavelengthsNm.map(() => 1);

  const df = src.diffraction && typeof src.diffraction === 'object' ? src.diffraction : {};
  const dDefault = defaultDiffraction();
  const diffraction = {
    grid: DIFFRACTION_GRIDS.includes(Number(df.grid)) ? Number(df.grid) : dDefault.grid,
    padding: DIFFRACTION_PADDING.includes(Number(df.padding)) ? Number(df.padding) : dDefault.padding,
    illumination: ILLUMINATIONS.includes(df.illumination) ? df.illumination : dDefault.illumination,
    beamRatio: clamp(finite(df.beamRatio, dDefault.beamRatio), ...LIMITS.beamRatio),
    vignetting: df.vignetting !== false,
  };

  const im = src.image && typeof src.image === 'object' ? src.image : {};
  const focus = ['paraxial', 'best-rms', 'fixed'].includes(im.focus) ? im.focus : 'paraxial';

  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    name: typeof src.name === 'string' ? src.name.slice(0, 120) : 'Untitled lens',
    object: { atInfinity, distanceMm: objectDistanceMm },
    aperture: { type: apertureType, value: apertureValue },
    fields: { type: fieldType, values: fieldValues },
    wavelengthsNm,
    wavelengthWeights,
    primaryWavelength: primary,
    surfaces,
    image: { focus, offsetMm: clampAbs(finite(im.offsetMm, 0), LIMITS.imageOffset) },
    rayAiming: src.rayAiming === 'real' ? 'real' : 'paraxial',
    pupilSamples: clamp(Math.round(finite(src.pupilSamples, 32)), ...LIMITS.pupilSamples),
    diffraction,
  };
}

export const stopIndexOf = system => system.surfaces.findIndex(s => s.stop);

// The prescription as a file: the normalized system, so a file written by
// this version reads back identically.
export function systemToJSON(system) {
  return JSON.stringify(normalizeSystem(system), null, 2);
}

export function systemFromJSON(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { error: 'This file is not JSON.' }; }
  if (!data || typeof data !== 'object' || data.format !== FORMAT) {
    return { error: 'This file is not an OpticalSetup lens prescription.' };
  }
  if (!(Number(data.version) >= 1 && Number(data.version) <= FORMAT_VERSION)) {
    return { error: `This prescription has format version ${data.version}; this page reads up to version ${FORMAT_VERSION}.` };
  }
  return { system: normalizeSystem(data) };
}

export { AIR, CONSTANT };
