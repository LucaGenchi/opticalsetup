// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Teaching presets. Where a prescription comes from elsewhere, `source` says
// where; the others are derived here and say how.

import { LENS_GROUP_PRESETS } from '../../../sketch/js/lensgroup.js';
import { LINES_FDC, normalizeSystem } from './system.js';

const visible = { wavelengthsNm: LINES_FDC, primaryWavelength: 1 };

// The canvas's cemented achromat (sketch/js/lensgroup.js), so the two agree.
const achromatRows = LENS_GROUP_PRESETS.find(p => p.id === 'doublet').rows;

export const PRESETS = [
  {
    id: 'perfect',
    label: 'Perfect lens, f 100 mm, F/10',
    note: 'An ideal thin lens: every ray from an object point meets at its image point, so the spot is a point and only diffraction is left.',
    system: {
      name: 'Perfect lens', ...visible,
      aperture: { type: 'epd', value: 10 }, fields: { type: 'angle', values: [0, 3, 5] },
      surfaces: [{ type: 'paraxial', focal: 100, thickness: 100, stop: true }],
    },
  },
  {
    id: 'pcx-curved-first',
    label: 'Plano-convex singlet, curved side first',
    note: 'N-BK7, f 100 mm at the d line (R = (n_d − 1) f), 4 mm thick, at F/10. The orientation that shares the bending between both faces: small spherical aberration.',
    system: {
      name: 'Plano-convex, curved side toward the object', ...visible,
      aperture: { type: 'epd', value: 10 }, fields: { type: 'angle', values: [0, 3, 5] },
      surfaces: [
        { radius: 51.68, thickness: 4, material: 'nbk7', stop: true },
        { radius: 0, thickness: 97.4 },
      ],
    },
  },
  {
    id: 'pcx-flat-first',
    label: 'Plano-convex singlet, flat side first',
    note: 'The same lens turned round: the curved face now does all the bending, and the spherical aberration grows about fourfold.',
    system: {
      name: 'Plano-convex, flat side toward the object', ...visible,
      aperture: { type: 'epd', value: 10 }, fields: { type: 'angle', values: [0, 3, 5] },
      surfaces: [
        { radius: 0, thickness: 4, material: 'nbk7', stop: true },
        { radius: -51.68, thickness: 100 },
      ],
    },
  },
  {
    id: 'achromat',
    label: 'Cemented achromat, f 100 mm, F/5 (N-BK7 + N-SF11)',
    note: 'The canvas’s own lens-group preset, solved there to null the axial colour between the F and C lines.',
    system: {
      name: 'Cemented achromat', ...visible,
      aperture: { type: 'epd', value: 20 }, fields: { type: 'angle', values: [0, 1, 2] },
      surfaces: achromatRows.map((row, i) => ({
        radius: row.r, thickness: i === achromatRows.length - 1 ? 97 : row.thickness,
        material: row.glass, stop: i === 0,
      })),
    },
  },
  {
    id: 'cooke',
    label: 'Cooke triplet, f 50 mm, F/5, ±20°',
    note: 'The classic three-element anastigmat: the “Cooke 40 degree field” sample of OpticStudio, as distributed with Optiland, with SCHOTT N-SK16 in place of the original SK16. The image plane is the one in the published prescription.',
    source: 'Optiland samples/objectives.py, class CookeTriplet (v0.5.5)',
    system: {
      name: 'Cooke triplet',
      wavelengthsNm: [480, 550, 650], primaryWavelength: 1,
      aperture: { type: 'epd', value: 10 }, fields: { type: 'angle', values: [0, 14, 20] },
      image: { focus: 'fixed' },
      surfaces: [
        { radius: 22.01359, thickness: 3.25896, material: 'nsk16' },
        { radius: -435.76044, thickness: 6.00755 },
        { radius: -22.21328, thickness: 0.99997, material: 'f2' },
        { radius: 20.29192, thickness: 4.75041, stop: true },
        { radius: 79.68360, thickness: 2.95208, material: 'nsk16' },
        { radius: -18.39533, thickness: 42.20778 },
      ],
    },
  },
];

export const DEFAULT_PRESET = 'cooke';

export function presetSystem(id) {
  const preset = PRESETS.find(p => p.id === id) ?? PRESETS.find(p => p.id === DEFAULT_PRESET);
  return normalizeSystem(preset.system);
}
