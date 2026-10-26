// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Materials for the lens designer: air, the canvas's glass catalogue
// (sketch/js/glass.js, one source for both), and a constant index. Catalogue
// indices are relative to air, as glass data sheets give them, so air is
// exactly 1 and every path length here is in "air millimetres".
//
// The Sellmeier sum is evaluated here at the exact wavelength. glassIndex()
// rounds to 0.1 nm buckets for the canvas tracer's speed, which moves N-BK7's
// index by 3e-6 at the d line: invisible on the canvas, but a micrometre of
// focus and a visible residue on an aplanatic surface in a lens design.

import { GLASSES, isWavelengthInGlassRange, glassWavelengthRange } from '../../../sketch/js/glass.js';

export const AIR = 'air';
export const CONSTANT = 'constant';
export const INDEX_MIN = 1, INDEX_MAX = 4;

export const MATERIAL_OPTIONS = [
  [AIR, 'Air'],
  ...[...GLASSES.values()].map(g => [g.id, g.label]),
  [CONSTANT, 'Constant index (no dispersion)'],
];

export const isKnownMaterial = id => id === AIR || id === CONSTANT || GLASSES.has(id);

// Short name of a catalogue glass from its label: "N-BK7 crown (nd …)" ->
// "N-BK7", "Calcium fluoride, CaF₂ (nd …)" -> "CaF₂", "Fused silica (nd …)"
// -> "Fused silica".
export function glassShortName(label) {
  const name = label.split(' (nd')[0];
  if (name.includes(',')) return name.split(',').at(-1).trim();
  const code = name.split(' ')[0];
  return /\d/.test(code) ? code : name;
}

export function materialName(id, index) {
  if (id === AIR) return 'air';
  if (id === CONSTANT) return `n = ${index}`;
  const glass = GLASSES.get(id);
  return glass ? glassShortName(glass.label) : id;
}

export function materialIndex(id, wavelengthNm, constantIndex = 1.5) {
  if (id === AIR) return 1;
  if (id === CONSTANT) return constantIndex;
  const glass = GLASSES.get(id);
  if (!glass) return 1;
  // Held at the edge of the fit outside it, as glass.js does.
  const um = Math.min(glass.range[1], Math.max(glass.range[0], wavelengthNm)) / 1000;
  const l2 = um * um;
  let n2 = 1;
  for (let i = 0; i < glass.B.length; i++) n2 += glass.B[i] * l2 / (l2 - glass.C[i]);
  return Math.sqrt(n2);
}

// Null when the index is the catalogue fit's own; otherwise the fit range,
// because glass.js quotes the index at the edge of that range instead.
export function materialRangeIssue(id, wavelengthNm) {
  if (id === AIR || id === CONSTANT || isWavelengthInGlassRange(id, wavelengthNm)) return null;
  return glassWavelengthRange(id);
}
