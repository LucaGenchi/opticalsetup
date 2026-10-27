// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Runs the analysis off the page's main thread, so typing in the lens table
// never waits for a trace. Each request carries an id; the page keeps only
// the answer to its latest one. The page runs two of these: one for the
// geometric analysis and one for diffraction (`kind: 'diffraction'`), which
// it can stop and restart when a newer request makes a long one useless.

import { analyzeSystem } from './engine/analyze.js';
import { analyzeDiffraction } from './engine/diffraction.js';

self.onmessage = event => {
  const { id, kind, system, field, zImage } = event.data;
  try {
    const result = kind === 'diffraction' ? analyzeDiffraction(system, { field, zImage }) : analyzeSystem(system);
    self.postMessage({ id, kind, result });
  } catch (error) {
    self.postMessage({ id, kind, error: String(error?.message ?? error) });
  }
};
