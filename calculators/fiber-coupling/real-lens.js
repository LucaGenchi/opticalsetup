// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// The second part of the fiber coupling page: a spherical singlet of your
// choosing, plano-convex or bi-convex, focusing the first part's laser into
// its fiber. The lens is designed and traced by the Thin and thick lens
// calculator's engine (calculators/thin-thick-lens/thick-lens.js, with its
// own Python reference), with the same lens inputs as that page, and the
// fiber placed at each lens's best position on the axis: the singlet beside
// the ideal thin lens of the same focal length, and how each one's coupling
// falls as the fiber moves across the axis, along it, or tilts.
import {
  LENS_INPUTS as THICK_INPUTS, LENS_DEFAULTS as THICK_DEFAULTS, FIBER_DEFAULTS as THICK_FIBER_DEFAULTS,
  computeThickLens, computeFiber, fresnelTransmission,
} from '../thin-thick-lens/thick-lens.js';
import { defaultsFor } from '../assets/calculator-inputs.js';
import { isWavelengthInGlassRange } from '../../sketch/js/glass.js';

export const SINGLETS = [['planoconvex', 'Plano-convex singlet'], ['biconvex', 'Bi-convex singlet']];

export const BEST_FORM_TIP = 'Best form: the thin-lens shape with the least spherical aberration for a collimated beam, its stronger face toward the laser.';

// The Thin and thick lens page's lens and dimension inputs, its lens choice
// cut to the two singlets (the ideal lens is drawn beside each anyway), and
// the best form explained on hover. The laser and the fiber come from above.
export const REAL_LENS_INPUTS = THICK_INPUTS.filter(i => i.group === 'lens' || i.group === 'size').map(i => {
  if (i.id === 'lensKind') return { ...i, options: SINGLETS };
  if (i.id === 'shape') { const { help, ...rest } = i; return { ...rest, optionTips: { best: BEST_FORM_TIP } }; }
  return i;
});
export const REAL_LENS_DEFAULTS = defaultsFor(REAL_LENS_INPUTS);

// The lens on `setup`'s laser, and its coupling into `setup`'s mode (taken by
// its mode-field diameter, however the first part was given it). The lens's
// two faces and the fiber end are uncoated, so the coupling is the mode
// overlap times the light the clear diameter passes times what the three
// surfaces transmit; beyond fused silica's fitted range the fiber end's
// reflection is unknown and none is counted (`surfaces: null`).
export function computeRealLens(setup, raw) {
  if (!setup?.ok) return { pending: true, message: 'Set a valid fiber and laser above first.' };
  if (!SINGLETS.some(([id]) => id === raw.lensKind)) return { ok: false, errors: [{ id: 'lensKind', message: 'Choose a plano-convex or a bi-convex singlet.' }] };
  const { wavelengthNm, beamDiameterMm } = setup.values;
  const lens = computeThickLens({ ...THICK_DEFAULTS, ...raw, wavelengthNm, beamDiameterMm });
  if (!lens.ok) return lens;
  const fresnel = isWavelengthInGlassRange('silica', wavelengthNm);
  const fiber = computeFiber(lens, { ...THICK_FIBER_DEFAULTS, fiberMode: 'mfd', mfdUm: setup.mode.modeFieldDiameterUm, fresnel }, { vNumber: setup.mode.vNumber });
  if (fiber.pending) return { pending: true, message: fiber.message };
  if (!fiber.ok) return fiber;
  const surfaces = fresnel ? fresnelTransmission(lens.lens.n, wavelengthNm) : null;
  return { ok: true, values: lens.values, lens, fiber, clipShare: lens.clipShare, surfaces };
}

// The inputs that set this part's lens to the first part's plano-convex
// suggestion, or null when there is none. The focal length keeps six
// figures, so the lens is the one traced above to well within its digits.
export function suggestedLensInputs(setup) {
  const s = setup?.ok ? setup.suggestion : null;
  if (!s?.ok) return null;
  const six = x => Number(x.toPrecision(6));
  return { lensKind: 'planoconvex', orientation: 'convex', spec: 'focal', glass: s.glass, focalMm: six(setup.optimalFocalMm), diameterMm: six(s.diameterMm), edgeMm: six(s.edgeMm) };
}
