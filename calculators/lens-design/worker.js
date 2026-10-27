// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Runs the analysis off the page's main thread, so typing in the lens table
// never waits for a trace. Each request carries an id; the page keeps only
// the answer to its latest one. The page runs two of these: one for the
// geometric analysis and one for diffraction (`kind: 'diffraction'`), which
// it can stop and restart when a newer request makes a long one useless,
// and the same again for imaging (`kind: 'imaging'`) and fiber coupling
// (`kind: 'coupling'`), which also name a wavelength.

import { analyzeSystem } from './engine/analyze.js';
import { analyzeDiffraction } from './engine/diffraction.js';
import { analyzeImaging } from './engine/imaging.js';
import { analyzeCoupling } from './engine/coupling.js';

const ANALYSES = { diffraction: analyzeDiffraction, imaging: analyzeImaging, coupling: analyzeCoupling };

self.onmessage = event => {
  const { id, kind, system, field, zImage, wavelength } = event.data;
  try {
    const result = ANALYSES[kind] ? ANALYSES[kind](system, { field, zImage, wavelength }) : analyzeSystem(system);
    self.postMessage({ id, kind, result });
  } catch (error) {
    self.postMessage({ id, kind, error: String(error?.message ?? error) });
  }
};
