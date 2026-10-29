// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The first part of the fiber coupling page: from the fiber and the laser
// alone, the ideal thin lens that matches the beam to the mode, the range of
// focal lengths that stays close to that match, and a plano-convex singlet
// to start from. The singlet is designed and traced by the Thin and thick
// lens calculator's engine (calculators/thin-thick-lens/thick-lens.js, with
// its own Python reference): curved side toward the collimated beam, the
// orientation with less spherical aberration, and its coupling taken with
// the fiber at its best plane on the axis. The glass, diameter and edge are
// rules of thumb for a catalogue lens, not an optimum; see choosePlanoConvex.
import { parseInputs } from '../assets/calculator-inputs.js';
import { SETUP_INPUTS, resolveMode, matchingFocalMm, focusCollimated, gaussianCoupling, PARAXIAL_LIMIT_MRAD } from './fiber-coupling.js';
import { LENS_DEFAULTS as SINGLET_DEFAULTS, FIBER_DEFAULTS as SINGLET_FIBER_DEFAULTS, computeThickLens, computeFiber } from '../thin-thick-lens/thick-lens.js';
import { GLASSES, isWavelengthInGlassRange } from '../../sketch/js/glass.js';
import { materialIndex, glassShortName } from '../lens-design/engine/materials.js';

// The mode matching the range of focal lengths keeps: 95 % (0.22 dB).
export const NEAR_MATCH = 0.95;

// The focal lengths whose focus keeps a mode matching of at least `eta`.
// With waist ratio r = w′/w_m, η₀ = (2r/(1 + r²))², so η₀ ≥ η for r between
// (1 ∓ √(1 − s²))/s, s = √η; a collimated beam of radius w focuses to w′
// through f = w′ z_R/√(w² − w′²), which grows with w′. Above w′ = w no lens
// reaches the ratio: the range is then open (`maxMm` null).
export function focalRange(beamDiameterMm, wavelengthNm, modeRadiusUm, eta = NEAR_MATCH) {
  const s = Math.sqrt(eta), root = Math.sqrt(1 - eta);
  const f = ratio => matchingFocalMm(beamDiameterMm, wavelengthNm, ratio * modeRadiusUm);
  return { minMm: f((1 - root) / s), maxMm: f((1 + root) / s), eta };
}

// Mode matching of an aligned ideal thin lens against its focal length,
// over a factor of 3 either side of the match; null where the focus is
// steeper than the paraxial limit.
export function focalScan(setup, count = 241) {
  const v = setup.values, centre = setup.optimalFocalMm, lo = centre / 3, hi = centre * 3;
  return Array.from({ length: count }, (_, i) => {
    const f = lo * (hi / lo) ** (i / (count - 1));
    const focus = focusCollimated(v.beamDiameterMm, v.wavelengthNm, f);
    const valid = focus.beam.halfDivergenceMrad <= PARAXIAL_LIMIT_MRAD;
    return { x: f, efficiency: valid ? gaussianCoupling({ waistUm: focus.beam.waistUm, modeRadiusUm: setup.modeRadiusUm, wavelengthNm: v.wavelengthNm }) : null };
  });
}

// Common catalogue clear diameters, mm: 3, 6 and 9 mm, then ½, 1, 2, 3, 4 in.
export const STOCK_DIAMETERS_MM = [3, 6, 9, 12.7, 25.4, 50.8, 76.2, 101.6];

// The glass a catalogue plano-convex lens is usually made of at this
// wavelength: N-BK7 from 350 to 2000 nm, UV fused silica below, CaF₂ above;
// null where none of them transmits (and none is in the catalogue).
export function planoConvexGlass(wavelengthNm) {
  const pick = wavelengthNm >= 350 && wavelengthNm <= 2000 ? 'nbk7' : wavelengthNm < 350 ? 'silica' : 'caf2';
  return isWavelengthInGlassRange(pick, wavelengthNm) ? pick : null;
}

const fmt = (x, d = 4) => String(Number(Number(x).toPrecision(d)));

// The singlet's shape: the glass, the clear diameter and the edge. The
// diameter is the smallest catalogue one at least twice the beam's (it then
// passes 99.97 % of the power), else the widest at least 1.5 times it
// (98.9 %); a curved face of radius R = (n − 1)f reaches only diameters
// below 2R. The edge is 1 mm per 12.7 mm of diameter, at least 1 mm.
export function choosePlanoConvex({ wavelengthNm, beamDiameterMm, focalMm }) {
  const glass = planoConvexGlass(wavelengthNm);
  if (!glass) return { ok: false, reason: `None of the catalogue’s glasses for plano-convex lenses (N-BK7, fused silica, CaF₂) transmits at ${fmt(wavelengthNm, 5)} nm; lenses there are made of other materials (ZnSe or germanium in the far infrared).` };
  const n = materialIndex(glass, wavelengthNm), radiusMm = (n - 1) * focalMm;
  const fits = STOCK_DIAMETERS_MM.filter(d => d / 2 < radiusMm);
  const diameterMm = fits.find(d => d >= 2 * beamDiameterMm) ?? fits.filter(d => d >= 1.5 * beamDiameterMm).at(-1);
  const name = glassShortName(GLASSES.get(glass).label);
  if (1.5 * beamDiameterMm > STOCK_DIAMETERS_MM.at(-1)) {
    return { ok: false, glass, n, radiusMm, reason: `A ${fmt(beamDiameterMm)} mm beam needs a lens at least 1.5 times as wide, beyond the ${STOCK_DIAMETERS_MM.at(-1)} mm (4 in) of catalogue plano-convex lenses.` };
  }
  if (diameterMm === undefined) {
    return { ok: false, glass, n, radiusMm, reason: `A plano-convex lens of ${name} with f = ${fmt(focalMm)} mm has a curved face of radius ${fmt(radiusMm)} mm, too tight for a catalogue diameter that passes a ${fmt(beamDiameterMm)} mm beam (at least 1.5 times it). Expand the beam less, or use an aspheric lens.` };
  }
  return { ok: true, glass, name, n, radiusMm, diameterMm, edgeMm: Math.max(1, diameterMm / 12.7) };
}

// The suggested singlet, traced, and its coupling into the mode with the
// fiber at its best plane (no Fresnel reflections, as on the rest of the
// page). The last suggestion is kept, as tracing takes a fraction of a
// second and the page asks again on every redraw.
let last = { key: null, value: null };
export function planoConvexSuggestion({ wavelengthNm, beamDiameterMm, focalMm, mfdUm }) {
  const key = JSON.stringify([wavelengthNm, beamDiameterMm, focalMm, mfdUm]);
  if (last.key !== key) last = { key, value: tracePlanoConvex({ wavelengthNm, beamDiameterMm, focalMm, mfdUm }) };
  return last.value;
}

function tracePlanoConvex({ wavelengthNm, beamDiameterMm, focalMm, mfdUm }) {
  const shape = choosePlanoConvex({ wavelengthNm, beamDiameterMm, focalMm });
  if (!shape.ok) return shape;
  const lens = computeThickLens({
    ...SINGLET_DEFAULTS, wavelengthNm, beamDiameterMm, lensKind: 'planoconvex', orientation: 'convex', spec: 'focal',
    glass: shape.glass, focalMm, diameterMm: shape.diameterMm, edgeMm: shape.edgeMm,
  });
  const refused = reason => ({ ...shape, ok: false, reason });
  if (!lens.ok) return refused(lens.errors[0].message);
  if (lens.beamIssue || lens.realIssue) return refused(lens.beamIssue ?? lens.realIssue);
  const fiber = computeFiber(lens, { ...SINGLET_FIBER_DEFAULTS, fiberMode: 'mfd', mfdUm, fresnel: false });
  if (!fiber.ok) return refused(fiber.errors?.[0]?.message ?? fiber.message);
  return {
    ...shape, thicknessMm: lens.values.thicknessMm, bflMm: lens.bfl, strehl: lens.scan.real.strehl, clipShare: lens.clipShare,
    efficiency: fiber.real.efficiency, overlap: fiber.real.aligned, shiftMm: fiber.real.shiftMm, idealEfficiency: fiber.ideal.efficiency,
    // What its two faces would reflect uncoated, at normal incidence.
    faceLoss: 1 - (1 - ((shape.n - 1) / (shape.n + 1)) ** 2) ** 2,
  };
}

// The fiber and laser: the mode, the matching lens and its focus, the range
// of focal lengths near the match, and the plano-convex suggestion. `raw`
// is kept so the second part of the page can add its lens to it.
export function computeFiberSetup(raw) {
  const { values: v, errors } = parseInputs(SETUP_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  const m = resolveMode(v);
  if (!m.ok) return m;
  const out = { ok: true, raw, values: v, ...m, optimalFocalMm: matchingFocalMm(v.beamDiameterMm, v.wavelengthNm, m.modeRadiusUm) };
  if (out.optimalFocalMm === null) return out;
  out.focus = focusCollimated(v.beamDiameterMm, v.wavelengthNm, out.optimalFocalMm);
  out.range = focalRange(v.beamDiameterMm, v.wavelengthNm, m.modeRadiusUm);
  out.suggestion = planoConvexSuggestion({ wavelengthNm: v.wavelengthNm, beamDiameterMm: v.beamDiameterMm, focalMm: out.optimalFocalMm, mfdUm: m.mode.modeFieldDiameterUm });
  return out;
}
