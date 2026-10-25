// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Runs the analysis off the page's main thread, so typing in the lens table
// never waits for a trace. Each request carries an id; the page keeps only
// the answer to its latest one.

import { analyzeSystem } from './engine/analyze.js';

self.onmessage = event => {
  const { id, system } = event.data;
  try {
    self.postMessage({ id, result: analyzeSystem(system) });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
