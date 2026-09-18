// Shared fiber propagation settings. Length 0 retains the drawn-path length
// used by older sketches; a positive value represents cable stored in a coil.
export const FIBER_PROPAGATION_FIELDS = [
  { key: 'lengthM', label: 'Physical length (m; 0 = drawn)', default: 0, min: 0, max: 10000, step: 0.01 },
  { key: 'beta2Ps2PerKm', label: 'Dispersion β₂ (ps²/km)', default: 0, min: -10000, max: 10000, step: 0.1 },
];

export function normalizeFiberDispersion(fiber = {}) {
  return Object.fromEntries(FIBER_PROPAGATION_FIELDS.map(field => [field.key,
    Number.isFinite(fiber[field.key])
      ? Math.min(field.max, Math.max(field.min, fiber[field.key])) : field.default,
  ]));
}

export function fiberPropagation(fiber, drawnLengthMm) {
  const settings = normalizeFiberDispersion(fiber);
  const lengthMm = settings.lengthM > 0 ? settings.lengthM * 1000
    : Number.isFinite(drawnLengthMm) ? Math.max(0, drawnLengthMm) : 0;
  // 1 ps²/km = 1 fs²/mm. Signed GDD adds to all upstream dispersion.
  return { lengthMm, gddFs2: settings.beta2Ps2PerKm * lengthMm };
}
