// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later

// Angular sampling controls for incoherent specimen signals. Defaults keep
// the fluorescence and Raman grids used by sketches saved before this control.
export const ISOTROPIC_KINDS = new Set(['fluor', 'raman', 'tpef', 'thpef']);
export const EMISSION_RAY_LIMITS = { min: 4, max: 128, step: 2 };

export function emissionRayCount(channel = {}) {
  const fallback = channel.kind === 'raman' ? 14 : 20;
  const value = Number.isFinite(channel.nrays) ? channel.nrays : fallback;
  return Math.round(Math.min(EMISSION_RAY_LIMITS.max, Math.max(EMISSION_RAY_LIMITS.min, value)));
}
