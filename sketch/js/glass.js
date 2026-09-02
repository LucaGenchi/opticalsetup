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
    range: [300, 2500],
  },
  {
    id: 'silica', label: 'Fused silica (nd 1.459 / V 67.8)',
    B: [0.6961663, 0.4079426, 0.8974794],
    C: [0.0684043 ** 2, 0.1162414 ** 2, 9.896161 ** 2],
    range: [210, 3710],
  },
  {
    id: 'nsf5', label: 'N-SF5 flint (nd 1.673 / V 32.3)',
    B: [1.52481889, 0.187085527, 1.42729015],
    C: [0.011254756, 0.0588995392, 129.141675],
    range: [380, 2500],
  },
  {
    id: 'nsf11', label: 'N-SF11 dense flint (nd 1.785 / V 25.7)',
    B: [1.73759695, 0.313747346, 1.89878101],
    C: [0.013188707, 0.0623068142, 155.23629],
    range: [370, 2500],
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

// Every Sellmeier fit has resonance poles just outside its published range —
// N-SF11's sits at 249.6 nm, N-SF5's at 242.7 nm, both inside the app's own
// 100-20000 nm wavelength span. Evaluating across one produces an index of 21
// and a GVD of 1e9 fs²/mm: numbers that are not merely inaccurate but absurd,
// reported with the same confidence as a real one (a 100 fs pulse through a
// glass rod came out as 2.3 milliseconds). Clamping each glass to the range
// its coefficients were published for keeps the curve monotone and physical;
// glassWavelengthRange lets callers say when they are quoting the edge rather
// than the asked-for wavelength.
function boundedWavelengthNm(wavelength, glass = null) {
  const value = Math.min(20000, Math.max(150, Number(wavelength) || LAMBDA_D));
  if (!glass?.range) return value;
  return Math.min(glass.range[1], Math.max(glass.range[0], value));
}

export const glassWavelengthRange = id => GLASSES.get(id)?.range ?? null;

// True when a wavelength falls outside the glass's published fit, so a caller
// can mark the value as extrapolated instead of presenting it as measured.
export function isWavelengthInGlassRange(id, wavelength) {
  const range = glassWavelengthRange(id);
  if (!range) return true;
  const value = Number(wavelength);
  return Number.isFinite(value) && value >= range[0] && value <= range[1];
}

// S = n² and its first two analytic derivatives with respect to wavelength
// in micrometres. Keeping the derivatives analytic avoids the step-size noise
// of finite differences in the tracer's hot loop.
function sellmeierTerms(glass, wavelengthNm) {
  const wavelengthUm = boundedWavelengthNm(wavelengthNm, glass) / 1000;
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
  const bucket = Math.round(boundedWavelengthNm(wavelength, glass) * 10);
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
  const glass = GLASSES.get(id);
  const bucketNm = Math.round(boundedWavelengthNm(wavelength, glass));
  if (cache[bucketNm] !== undefined) return cache[bucketNm];
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

// Intensity-autocorrelation deconvolution factors: the measured trace is
// wider than the pulse by a shape-dependent constant, and dividing by the
// wrong one is the classic way to misreport a duration.
export const AUTOCORRELATION_FACTORS = { gauss: Math.SQRT2, sech2: 1.543 };

// Where a sech^2 profile falls to half its peak, in units of its own FWHM:
// 2*arccosh(sqrt 2) = 1.762747174039086. Used to draw correlation curves; the
// 1.543 deconvolution factor above stays at its published rounding because
// that is the number a real instrument's manual quotes.
const SECH2_HALF = 2 * Math.acosh(Math.SQRT2);

// What an autocorrelator actually sees, and what it would report. `assumed`
// is the shape the instrument is set to; `actual` is the shape the pulse
// really has, so a mismatch can be shown rather than silently absorbed.
export function autocorrelationReading(pulseWidthFs, assumed = 'gauss', actual = 'gauss') {
  const width = Number(pulseWidthFs);
  if (!(width > 0)) return null;
  const actualFactor = AUTOCORRELATION_FACTORS[actual] ?? Math.SQRT2;
  const assumedFactor = AUTOCORRELATION_FACTORS[assumed] ?? Math.SQRT2;
  const traceFwhmFs = width * actualFactor;
  return {
    traceFwhmFs,
    inferredPulseWidthFs: traceFwhmFs / assumedFactor,
    truePulseWidthFs: width,
    assumedFactor,
    actualFactor,
    shapeMismatch: assumed !== actual,
  };
}

// The normalized shape of a correlation trace at a given delay from its peak.
// Shared by the reading and the screen so the overlap figure and the drawn
// curve can never disagree about what the trace actually looks like.
export function correlationShapeValue(delayFs, traceFwhmFs, shape = 'gauss') {
  const width = Number(traceFwhmFs), tau = Number(delayFs);
  if (!(width > 0) || !Number.isFinite(tau)) return 0;
  // sech^2 reaches half maximum at 2*arccosh(sqrt 2) in its own argument, so
  // the argument is SECH2_HALF*tau/FWHM -- not twice that, which would put the
  // half-maximum at a quarter width. The constant is solved rather than typed
  // as its usual 1.7627 rounding, so the curve meets the half-maximum chord
  // exactly instead of 17 ppm away from it.
  if (shape === 'sech2') return (1 / Math.cosh(SECH2_HALF * tau / width)) ** 2;
  return Math.exp(-4 * Math.LN2 * (tau / width) ** 2);
}

// Selecting the two arms for a cross-correlation. `trains` is keyed on source
// id, so two sources always give two entries even when the aggregate `mixed`
// flag stays false because their timing settings happen to agree. Arrival is
// emission phase plus propagation delay: both are real contributions to when a
// pulse turns up, and only their difference matters here.
export function crossCorrelationPair(reading) {
  const trains = Array.isArray(reading?.pulse?.trains) ? reading.pulse.trains : [];
  if (!reading?.pulse) return { reason: 'NO PULSE' };
  if (trains.length < 2) return { reason: 'NEEDS A SECOND SOURCE' };
  if (trains.length > 2) return { reason: `${trains.length} TRAINS — NEEDS EXACTLY 2` };
  const arm = train => ({
    pulseWidthFs: Number.isFinite(train.stretchedPulseWidthFs)
      ? train.stretchedPulseWidthFs : train.pulseWidthFs,
    pulseShape: train.pulseShape || 'gauss',
    repRateMHz: train.repRateMHz,
    centerWavelengthNm: train.centerWavelengthNm,
    arrivalFs: ((Number(train.phaseNs) || 0) + (Number(train.pathDelayNs) || 0)) * 1e6,
  });
  return { arms: [arm(trains[0]), arm(trains[1])] };
}

// A cross-correlation differs from an autocorrelation in the two ways that
// make it useful. It is not forced to be symmetric, and it is not centred on
// zero: the peak sits at whatever timing mismatch the two arms really have,
// which is exactly why the measurement is what finds time zero.
//
// Width: variance adds exactly under correlation whatever the envelopes, so
// the two widths combine in quadrature. Converting that variance back into a
// FWHM needs the trace's own shape constant, which is only well defined when
// both pulses have the same shape -- and the scaling below is built so that
// two identical pulses reproduce the known autocorrelation factor exactly
// (1.414 for Gaussian, 1.543 for sech2) rather than defaulting to quadrature
// and being 9% wrong for sech2, which is the very error this instrument
// exists to teach. Mixed shapes have no closed form; the geometric mean of
// the two constants is used and the result is flagged as approximate.
//
// `a` and `b` are { pulseWidthFs, pulseShape, arrivalFs, repRateMHz,
// centerWavelengthNm }.
export function crossCorrelationReading(a, b) {
  const t1 = Number(a?.pulseWidthFs), t2 = Number(b?.pulseWidthFs);
  if (!(t1 > 0) || !(t2 > 0)) return null;
  const shapeOf = t => (AUTOCORRELATION_FACTORS[t?.pulseShape] ? t.pulseShape : 'gauss');
  const s1 = shapeOf(a), s2 = shapeOf(b);
  const k1 = AUTOCORRELATION_FACTORS[s1], k2 = AUTOCORRELATION_FACTORS[s2];
  const shapeMismatch = s1 !== s2;
  const k = shapeMismatch ? Math.sqrt(k1 * k2) : k1;
  // The shape correction has to fade out as the durations diverge. Applying
  // k/sqrt(2) flat would break the limit the instrument is most used for: with
  // a reference much shorter than the pulse, the correlation must reproduce
  // the pulse's own envelope, so the trace width must converge on the pulse
  // width -- and a flat sech^2 correction overshoots it by 9%. This weight is
  // 1 for equal durations and falls to 0 as either dominates, so both limits
  // come out exact. Against a numerical sech^2 correlation it is within 2%
  // everywhere between them; Gaussians are unaffected, since k/sqrt(2) is 1.
  const overlapWeight = (2 * t1 * t2) / (t1 * t1 + t2 * t2);
  const traceFwhmFs = Math.hypot(t1, t2) * (1 + (k / Math.SQRT2 - 1) * overlapWeight);

  const rep1 = Number(a?.repRateMHz), rep2 = Number(b?.repRateMHz);
  // Without a common repetition rate the two trains drift against each other
  // and no stable trace exists to average up, however well the arms happen to
  // be matched at one instant.
  const synchronized = rep1 > 0 && rep2 > 0 && Math.abs(rep1 - rep2) <= 1e-9 * Math.max(rep1, rep2);
  const periodFs = synchronized ? 1e9 / rep1 : null;

  const rawOffsetFs = (Number(b?.arrivalFs) || 0) - (Number(a?.arrivalFs) || 0);
  // Pulses repeat, so a mismatch of more than half a period is really a
  // smaller mismatch against the neighbouring pulse of the other train. That
  // is not a modelling convenience: it is why a synchronized system can only
  // ever be nulled modulo its own period.
  const offsetFs = periodFs
    ? rawOffsetFs - periodFs * Math.round(rawOffsetFs / periodFs)
    : rawOffsetFs;

  const l1 = Number(a?.centerWavelengthNm), l2 = Number(b?.centerWavelengthNm);
  const sumFrequencyNm = l1 > 0 && l2 > 0 ? (l1 * l2) / (l1 + l2) : null;

  return {
    traceFwhmFs,
    traceShape: shapeMismatch ? 'gauss' : s1,
    offsetFs,
    rawOffsetFs,
    periodFs,
    synchronized,
    shapeMismatch,
    // 1.0 when the two pulses land together; this is the number you maximize
    // when hunting for time zero on a real bench.
    overlap: synchronized
      ? correlationShapeValue(offsetFs, traceFwhmFs, shapeMismatch ? 'gauss' : s1)
      : 0,
    widths: [t1, t2],
    shapes: [s1, s2],
    sumFrequencyNm,
  };
}
