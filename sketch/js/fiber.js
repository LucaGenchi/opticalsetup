import { glassIndex } from './glass.js';
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
// A capillary's loss is computed by default: the ideal straight, smooth
// dielectric-capillary EH11 loss from Marcatili and Schmeltzer, plus an
// optional extra distributed loss for bends and wall imperfections. "Manual"
// takes the fiber's own loss field as the whole distributed loss instead.
// Coupling at the entrance is a length-independent efficiency, not dB/m,
// and is not part of either.
export const CAPILLARY_LOSS_MODELS = [['marcatili', 'Computed · smooth silica capillary'], ['manual', 'Manual total (dB/m)']];
export const EXTRA_LOSS_FIELD = { key: 'extraLossDbPerM', label: 'Extra distributed loss (dB/m)', default: 0, min: 0, max: 100, step: 0.05 };
export function normalizeHollowCore(fiber = {}) {
  return {
    fiberModel: fiber.fiberModel === 'argon' ? 'argon' : 'linear',
    kerrEnabled: fiber.kerrEnabled !== false,
    lossModel: fiber.lossModel === 'manual' ? 'manual' : 'marcatili',
    [EXTRA_LOSS_FIELD.key]: Number.isFinite(fiber[EXTRA_LOSS_FIELD.key])
      ? Math.min(EXTRA_LOSS_FIELD.max, Math.max(EXTRA_LOSS_FIELD.min, fiber[EXTRA_LOSS_FIELD.key])) : EXTRA_LOSS_FIELD.default,
    ...Object.fromEntries(HOLLOW_CORE_FIELDS.map(field => [field.key,
      Number.isFinite(fiber[field.key]) ? Math.min(field.max, Math.max(field.min, fiber[field.key])) : field.default,
    ])),
  };
}

// Marcatili & Schmeltzer (1964) EH11 attenuation of a straight, smooth hollow
// dielectric capillary: alpha = (u/2pi)^2 lambda^2/a^3 (nu^2+1)/(2 sqrt(nu^2-1)).
// alpha is a field coefficient, so the power loss is 20/ln10 · alpha dB per
// metre -- the convention that reproduces the paper's own worked value, 1.85
// dB/km for nu = 1.50, lambda = 1 um, a = 1 mm. The wall index comes from the
// fused-silica Sellmeier curve at the wavelength. This is the ideal model's
// prediction, not a bound for every hollow fiber: anti-resonant and other
// structured walls are outside it.
export function marcatiliLossDbPerM(coreDiameterUm, wavelengthNm) {
  const a = Number(coreDiameterUm) * 0.5e-6, lambda = Number(wavelengthNm) * 1e-9;
  const nu = glassIndex('silica', Number(wavelengthNm));
  if (!(a > 0) || !(lambda > 0) || !(nu > 1)) return null;
  const u = 2.4048255577;
  const alpha = (u / (2 * Math.PI)) ** 2 * lambda ** 2 / a ** 3 * (nu * nu + 1) / (2 * Math.sqrt(nu * nu - 1));
  const dB = 20 / Math.LN10 * alpha;
  return Number.isFinite(dB) ? dB : null;
}

// The distributed loss a capillary applies at one wavelength. The solver uses
// this single value, taken at the carrier, for its whole broadened field:
// wavelength-dependent attenuation across the spectrum is not modelled.
export function capillaryLossDbPerM(fiber, wavelengthNm, manualDbPerM) {
  const p = normalizeHollowCore(fiber);
  if (p.lossModel === 'manual') return { model: 'manual', idealDbPerM: null, totalDbPerM: manualDbPerM };
  const ideal = marcatiliLossDbPerM(p.coreDiameterUm, wavelengthNm);
  return { model: 'marcatili', idealDbPerM: ideal, totalDbPerM: (Number.isFinite(ideal) ? ideal : 0) + p[EXTRA_LOSS_FIELD.key] };
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
  // Effective area of the Gaussian that best couples to the HE11 mode: its
  // 1/e field radius is 0.6435a (98 % overlap with J0(2.405 r/a)), rounded to
  // 0.64a, so A_eff = π(0.64a)² = 0.410 πa². The J0 mode's own
  // (∫|E|²dA)²/∫|E|⁴dA is 0.477 πa², which would make γ 16 % smaller. This is
  // the Gaussian convention, chosen and documented, not the exact mode.
  const effectiveAreaM2 = Math.PI * (0.64 * a) ** 2;
  // Near-IR n2 = 1.01e-23 m²/W at 1 atm (Zahedpour et al., Table 1).
  const n2 = 1.01e-23 * p.gasPressureBar / 1.01325;
  return {
    beta2Fs2PerM: gasBeta2 + waveguideBeta2, gasBeta2, waveguideBeta2,
    groupIndex: n - lam * dn + u * u / (2 * k * k * a * a),
    gammaPerWM: p.kerrEnabled ? k * n2 / effectiveAreaM2 : 0, effectiveAreaM2,
  };
}
