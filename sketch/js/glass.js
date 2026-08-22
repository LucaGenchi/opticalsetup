// Optical glass catalogue.
//
// Each entry carries the published three-term Sellmeier coefficients
//
//     n²(λ) = 1 + Σ Bᵢ λ² / (λ² - Cᵢ)
//
// with wavelength in micrometres. Unlike the old two-term Cauchy fit, this
// reproduces the curvature needed for group-velocity dispersion and the
// infrared zero-GVD crossing while leaving visible ray geometry effectively
// unchanged. These room-temperature catalogue curves still do not model
// absorption, temperature, stress, coatings, or manufacturing tolerances.
const LAMBDA_D = 587.6, LAMBDA_F = 486.1, LAMBDA_C = 656.3;
const C_METRES_PER_SECOND = 299792458;

const CATALOGUE = [
  {
    id: 'nbk7', label: 'N-BK7 crown (nd 1.517 / V 64.2)',
    B: [1.03961212, 0.231792344, 1.01046945],
    C: [0.00600069867, 0.0200179144, 103.560653],
  },
  {
    id: 'silica', label: 'Fused silica (nd 1.459 / V 67.8)',
    B: [0.6961663, 0.4079426, 0.8974794],
    C: [0.0684043 ** 2, 0.1162414 ** 2, 9.896161 ** 2],
  },
  {
    id: 'nsf5', label: 'N-SF5 flint (nd 1.673 / V 32.3)',
    B: [1.52481889, 0.187085527, 1.42729015],
    C: [0.011254756, 0.0588995392, 129.141675],
  },
  {
    id: 'nsf11', label: 'N-SF11 dense flint (nd 1.785 / V 25.7)',
    B: [1.73759695, 0.313747346, 1.89878101],
    C: [0.013188707, 0.0623068142, 155.23629],
  },
];

export const GLASSES = new Map(CATALOGUE.map(g => [g.id, { ...g }]));

// The one glass that shipped before this catalogue existed. Its coefficients
// were a rougher fit (Abbe 58.0 against N-BK7's real 64.2), so it is folded
// into the accurate entry on load rather than kept as a second BK7 — see the
// legacy-glass migration in state.js.
export const LEGACY_GLASS_ID = 'bk7';
export const LEGACY_GLASS_REPLACEMENT = 'nbk7';

export const GLASS_OPTIONS = CATALOGUE.map(g => [g.id, GLASSES.get(g.id).label]);

export const isDispersiveGlass = id => GLASSES.has(id);

// Index samples repeat heavily: a broadband ray is tested against several
// surfaces, and each interaction asks for the same material/wavelength pair.
// A 0.1 nm bucket is substantially finer than the tracer's spectral sampling
// while avoiding three Sellmeier-term evaluations at every surface.
const INDEX_CACHE = Object.fromEntries(CATALOGUE.map(glass => [glass.id, []]));

function boundedWavelengthNm(wavelength) {
  return Math.min(20000, Math.max(150, Number(wavelength) || LAMBDA_D));
}

// S = n² and its first two analytic derivatives with respect to wavelength
// in micrometres. Keeping the derivatives analytic avoids the step-size noise
// of finite differences in the tracer's hot loop.
function sellmeierTerms(glass, wavelengthNm) {
  const wavelengthUm = boundedWavelengthNm(wavelengthNm) / 1000;
  const lambda2 = wavelengthUm * wavelengthUm;
  let squaredIndex = 1, first = 0, second = 0;
  for (let i = 0; i < glass.B.length; i++) {
    const B = glass.B[i], C = glass.C[i], denominator = lambda2 - C;
    const denominator2 = denominator * denominator;
    squaredIndex += B * lambda2 / denominator;
    first += -2 * B * C * wavelengthUm / denominator2;
    second += 2 * B * C * (3 * lambda2 + C) / (denominator2 * denominator);
  }
  return { wavelengthUm, squaredIndex, first, second };
}

// Refractive index of a catalogue glass at a wavelength, in nm.
export function glassIndex(id, wavelength = LAMBDA_D) {
  const glass = GLASSES.get(id);
  if (!glass) return null;
  const bucket = Math.round(boundedWavelengthNm(wavelength) * 10);
  const cache = INDEX_CACHE[id];
  if (cache[bucket] !== undefined) return cache[bucket];
  const { squaredIndex } = sellmeierTerms(glass, bucket / 10);
  const index = squaredIndex > 0 && Number.isFinite(squaredIndex) ? Math.sqrt(squaredIndex) : null;
  cache[bucket] = index;
  return index;
}

// Derive the displayed Abbe number from the same curve used for ray tracing,
// so the material label and its actual dispersion cannot drift apart.
export function glassAbbe(id) {
  const nd = glassIndex(id, LAMBDA_D);
  const nF = glassIndex(id, LAMBDA_F);
  const nC = glassIndex(id, LAMBDA_C);
  return [nd, nF, nC].every(Number.isFinite) && nF !== nC
    ? (nd - 1) / (nF - nC)
    : null;
}

// GVD cache: rays are already qualitative wavelength samples, so a 1 nm
// bucket avoids repeating the analytic derivative for many spatial rays while
// remaining far finer than the app's spectral display resolution.
const GVD_CACHE = Object.fromEntries(CATALOGUE.map(glass => [glass.id, []]));

// Group-velocity dispersion β₂ in fs²/mm at a wavelength supplied in nm.
// With λ and d²n/dλ² evaluated in micrometre units, 1e21 converts
// λ³·d²n/dλ² / c² from SI to fs²/mm.
export function glassGVD(id, wavelength = LAMBDA_D) {
  const cache = GVD_CACHE[id];
  if (!cache) return null;
  const bucketNm = Math.round(boundedWavelengthNm(wavelength));
  if (cache[bucketNm] !== undefined) return cache[bucketNm];
  const glass = GLASSES.get(id);
  const { wavelengthUm, squaredIndex, first, second } = sellmeierTerms(glass, bucketNm);
  const n = Math.sqrt(squaredIndex);
  const d2n = second / (2 * n) - (first * first) / (4 * n * n * n);
  const gvd = wavelengthUm ** 3 * d2n * 1e21
    / (2 * Math.PI * C_METRES_PER_SECOND ** 2);
  const finite = Number.isFinite(gvd) ? gvd : null;
  cache[bucketNm] = finite;
  return finite;
}

// Transform-limited Gaussian pulse broadening under second-order dispersion.
// Inputs and output are all femtosecond-based (fs and fs²). Higher-order
// dispersion and any pre-existing chirp remain outside this estimate.
export function gaussianPulseDurationAfterGDD(pulseWidthFs, gddFs2) {
  const input = Number(pulseWidthFs), gdd = Number(gddFs2);
  if (!(input > 0) || !Number.isFinite(gdd)) return null;
  const chirp = 4 * Math.log(2) * gdd / (input * input);
  const output = input * Math.sqrt(1 + chirp * chirp);
  return Number.isFinite(output) ? output : null;
}
