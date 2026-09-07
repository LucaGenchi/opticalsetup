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

export const HOLLOW_CORE_FIELDS = [
  { key: 'coreDiameterUm', label: 'Core diameter (µm)', default: 250, min: 50, max: 1000, step: 10 },
  { key: 'gasPressureBar', label: 'Argon pressure (bar)', default: 2, min: 0, max: 10, step: 0.1 },
];
export function normalizeHollowCore(fiber = {}) {
  return {
    fiberModel: fiber.fiberModel === 'argon' ? 'argon' : 'linear',
    kerrEnabled: fiber.kerrEnabled !== false,
    ...Object.fromEntries(HOLLOW_CORE_FIELDS.map(field => [field.key,
      Number.isFinite(fiber[field.key]) ? Math.min(field.max, Math.max(field.min, fiber[field.key])) : field.default,
    ])),
  };
}

// Peck–Fisher argon refractivity, 0.4679–2.0587 µm; density scaled to
// 293.15 K and pressure in bar. Smooth HE11 capillary approximation, not
// an anti-resonant microstructure or loss/bend/mode-coupling solver.
export function hollowCoreCoefficients(fiber, wavelengthNm) {
  const p = normalizeHollowCore(fiber), lam = wavelengthNm / 1000;
  if (!Number.isFinite(lam) || lam < 0.4679 || lam > 2.0587) return null;
  const density = p.gasPressureBar / 1.01325 * 273.15 / 293.15;
  const B = 0.030182943, D = 144, q = D * lam * lam - 1;
  const n = 1 + density * (6.7867e-5 + B * lam * lam / q);
  const dn = density * -2 * B * lam / (q * q);
  const d2n = density * 2 * B * (3 * D * lam * lam + 1) / (q ** 3);
  const lambdaM = wavelengthNm * 1e-9, a = p.coreDiameterUm * 0.5e-6, c = 299792458;
  const u = 2.4048255577, k = 2 * Math.PI / lambdaM;
  const gasBeta2 = lambdaM ** 3 / (2 * Math.PI * c * c) * d2n * 1e42;
  const waveguideBeta2 = -u * u * lambdaM ** 3 / (8 * Math.PI ** 3 * c * c * a * a) * 1e30;
  const effectiveAreaM2 = Math.PI * (0.64 * a) ** 2;
  // Near-IR n2 = 1.01e-23 m²/W at 1 atm (Zahedpour et al., Table 1).
  const n2 = 1.01e-23 * p.gasPressureBar / 1.01325;
  return {
    beta2Fs2PerM: gasBeta2 + waveguideBeta2, gasBeta2, waveguideBeta2,
    groupIndex: n - lam * dn + u * u / (2 * k * k * a * a),
    gammaPerWM: p.kerrEnabled ? k * n2 / effectiveAreaM2 : 0, effectiveAreaM2,
  };
}
