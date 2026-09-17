import { C_MM_PER_NS } from './pulses.js';

// An application-imposed ceiling on every authored conversion fraction, not a
// physical limit: published single-pass second-harmonic conversion and OPO
// pump depletion both reach well above this. It keeps the workbench's authored
// fractions in a conservative range for now. The OPO has its own control and
// ceiling below, because its depletion is a multi-pass result rather than a
// single-pass efficiency.
//
// It lives here, in a module nothing else in the chain imports back, because
// elements.js reads it while building its parameter list: exported from the
// tracer it sat on an import cycle, and loading the tracer first left it
// uninitialised.
export const MAX_CONVERSION = 0.6;

// The OPO's own ceiling. Its control is pump depletion, the fraction of the
// pump the oscillator removes, which builds up over many round trips of the
// resonant signal: singly resonant OPOs are reported at 78 % and 93 %. The cap
// stops short of total depletion, which the ideal plane-wave model reaches
// only at one operating point.
export const MAX_OPO_DEPLETION = 0.95;

// Supercontinuum in a bulk crystal: where the spectrum ends, from the pump
// wavelength and the medium. The anchors are reference data taken from the
// review by Dubietis, Tamošauskas, Šuminas, Jukna and Couairon, "Ultrafast
// supercontinuum generation in bulk condensed media", Lith. J. Phys. 57,
// 113-157 (2017), section 5, each at the pump it was given for. They come
// from heterogeneous experiments -- different focusing, energies, durations
// and lengths -- so a band between two anchors is an authored interpolation,
// not a prediction. Pumps outside the anchors this table includes get no
// estimate; that is a boundary of this table, not of the literature, which
// reports other pumps too.
//
// Tags after the edge say what kind of reference an anchor is:
//   'atLeast' -- a red edge limited by the detector: the spectrum went further.
//   'typical' -- the review's typical span under common conditions, a summary
//                of several experiments rather than one.
//   'range'   -- one span the review gives for a range of pumps, placed at
//                both ends of that range: YAG's blue cut-off, "fairly stable"
//                at 530 nm across 1.1-1.6 µm, and CaF2's 340 nm-3.3 µm from
//                combined 2.1-2.2 µm data. They are not two measurements.
// `transparentFromNm` is the short end of the 10 % transmission range through
// 1 mm (Table 1).
export const SC_MEDIA = {
  yag: {
    label: 'YAG', transparentFromNm: 210,
    blue: [[515, 390], [800, 420], [1100, 530, 'range'], [1600, 530, 'range'], [2000, 510], [2150, 450]],
    red: [[515, 625], [800, 1600], [2000, 2500, 'atLeast'], [2150, 2500, 'atLeast']],
  },
  sapphire: {
    label: 'Sapphire', transparentFromNm: 190,
    // 1100 nm at 800 nm is the usual tight focusing; loose focusing in a
    // longer plate reached beyond 1600 nm.
    blue: [[400, 350], [515, 340], [800, 410, 'typical'], [2000, 470]],
    red: [[400, 700], [515, 650], [800, 1100, 'typical'], [2000, 2500, 'atLeast']],
  },
  fusedsilica: {
    label: 'Fused silica', transparentFromNm: 180,
    blue: [[594, 415], [800, 390, 'typical']],
    red: [[594, 720], [800, 1000, 'typical']],
  },
  caf2: {
    label: 'CaF₂', transparentFromNm: 120,
    blue: [[800, 300], [2100, 340, 'range'], [2200, 340, 'range']],
    red: [[800, 2000], [2100, 3300, 'range'], [2200, 3300, 'range']],
  },
};

// The two anchors around `x` in a sorted table, or null outside it.
function bracket(table, x) {
  if (x < table[0][0] || x > table[table.length - 1][0]) return null;
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) return [table[i - 1], table[i]];
  }
  return [table[0], table[0]];
}

const lerp = ([x0, y0], [x1, y1], x) => (x1 === x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0));

// The band for a pump at `pumpNm` in `medium`:
//   { state: 'estimate', minNm, maxNm, measured, summary, redAtLeast }
//   { state: 'unsupported', fromNm, toNm }  -- the pumps the medium has data for
// Each edge is interpolated linearly in wavelength between its own
// neighbouring anchors. `measured` is set only when both edges sit on
// anchors from single experiments at this pump; `summary` when they sit on
// anchors but one is a typical span or a range summary.
export function supercontinuumRange(pumpNm, medium) {
  const data = SC_MEDIA[medium] || SC_MEDIA.yag;
  const fromNm = Math.max(data.blue[0][0], data.red[0][0]);
  const toNm = Math.min(data.blue[data.blue.length - 1][0], data.red[data.red.length - 1][0]);
  const blue = Number.isFinite(pumpNm) ? bracket(data.blue, pumpNm) : null;
  const red = Number.isFinite(pumpNm) ? bracket(data.red, pumpNm) : null;
  if (!blue || !red) return { state: 'unsupported', fromNm, toNm };
  const at = pair => pair.filter(([pump]) => pump === pumpNm);
  const onAnchors = at(blue).length > 0 && at(red).length > 0;
  const summarised = [...at(blue), ...at(red)].some(anchor => anchor.includes('typical') || anchor.includes('range'));
  const redUsed = at(red).length ? at(red) : red;
  return {
    state: 'estimate',
    minNm: Math.max(data.transparentFromNm, lerp(blue[0], blue[1], pumpNm)),
    maxNm: lerp(red[0], red[1], pumpNm),
    measured: onAnchors && !summarised,
    summary: onAnchors && summarised,
    redAtLeast: redUsed.some(anchor => anchor.includes('atLeast')),
    fromNm, toNm,
  };
}

// Optical parametric oscillation for the crystal's `convert: 'opo'` mode: a
// phenomenological singly resonant oscillator, not a cavity simulation.
//
// Energy. A pump photon splits into a signal and an idler photon,
// 1/λp = 1/λs + 1/λi. The cavity holds the signal at its authored wavelength;
// the idler takes up whatever the arriving pump dictates.
//
// Power. A fixed, authored fraction of the pump is converted. Signal and
// idler are generated with equal photon fluxes (Manley–Rowe), so the
// generated powers divide as P_s/P_i = λi/λs. This is the lossless generated
// split: what leaves a real resonator also depends on its output coupling
// and losses. Threshold and pump depletion are not modelled.
//
// Linewidths are FWHM in wavenumber, where energy conservation is linear.
// Unless both are authored, the idler is the pump and signal combined as
// uncorrelated Gaussians (widths in quadrature); correlated fluctuations
// would change that. A narrow line is a Gaussian in wavelength; a broad one
// is sampled from its Gaussian in wavenumber, with the 1/λ² Jacobian.
//
// Pulses keep the pump's train timing, including its accumulated delay. Their
// duration is the pump's times an authored factor, never shorter than their
// bandwidth allows, and their spectral phase is unknown unless declared
// transform-limited. The output spectra are Gaussian, so their transform
// limit uses the Gaussian time–bandwidth product.

import { gaussianSpectrum, spectrumStats } from './spectrum.js';

const NM_CM = 1e7; // λ[nm] · σ[cm⁻¹]
const C_CM_PER_FS = 2.99792458e-5;
const GAUSS_TBP = 0.441;
const SIGMA_PER_FWHM = 1 / (2 * Math.sqrt(2 * Math.LN2));
// Up to this fractional width a Gaussian in wavelength is indistinguishable
// from the Gaussian in wavenumber it stands for.
const NARROW = 0.01;
const SPECTRUM_GRID = 129;
const SUPPORT_SIGMAS = 3;

export const nmToWavenumberWidth = (wl, fwhmNm) => (wl > 0 && fwhmNm > 0 ? NM_CM * fwhmNm / (wl * wl) : 0);
export const wavenumberToNmWidth = (wl, widthCm) => (wl > 0 && widthCm > 0 ? wl * wl * widthCm / NM_CM : 0);

// Transform-limited FWHM duration of a Gaussian spectrum `widthCm` wide. A
// zero width has no finite limit.
export const transformLimitFs = widthCm => (widthCm > 0 ? GAUSS_TBP / (C_CM_PER_FS * widthCm) : Infinity);

// Idler wavelength from energy conservation, or null when the signal leaves
// no positive idler frequency (signal at or beyond the pump frequency).
export function idlerWavelength(pumpWl, signalWl) {
  if (!(pumpWl > 0) || !(signalWl > 0)) return null;
  const inv = 1 / pumpWl - 1 / signalWl;
  return inv > 1e-9 ? 1 / inv : null;
}

// Spectral FWHM of the arriving pump, in nm. A filtered or structured
// spectrum is reduced to its FWHM here: the model is Gaussian throughout.
export function pumpWidthNm(ray) {
  const stats = ray?.spec ? spectrumStats(ray.spec) : null;
  if (stats && stats.fwhm > 0) return stats.fwhm;
  return Math.max(0, Number(ray?.bw) || 0);
}

// A Gaussian in wavenumber sampled onto a wavelength grid (with the 1/λ²
// Jacobian) and normalised to a peak of 1.
function sampledWavenumberGaussian(wl, widthCm) {
  const center = NM_CM / wl, sd = widthCm * SIGMA_PER_FWHM;
  const reach = SUPPORT_SIGMAS * sd;
  const lo = NM_CM / (center + reach);
  const hi = NM_CM / Math.max(center * 0.05, center - reach);
  const w = [];
  for (let i = 0; i < SPECTRUM_GRID; i++) {
    const lambda = lo + (hi - lo) * i / (SPECTRUM_GRID - 1);
    const z = (NM_CM / lambda - center) / sd;
    w.push(Math.exp(-0.5 * z * z) / (lambda * lambda));
  }
  const peak = Math.max(...w);
  return { kind: 'sampled', lo, hi, w: w.map(v => v / peak) };
}

// One output wave: wavelength, FWHM in nm, spectrum, and width in cm⁻¹.
// A zero width is an exact line.
export function waveSpectrum(wl, widthCm) {
  if (!(widthCm > 0)) return { wl, bw: 0, spec: null, widthCm: 0 };
  if (widthCm * wl / NM_CM <= NARROW) {
    const bw = wavenumberToNmWidth(wl, widthCm);
    return { wl, bw, spec: gaussianSpectrum(wl, bw), widthCm };
  }
  const spec = sampledWavenumberGaussian(wl, widthCm);
  return { wl, bw: spectrumStats(spec)?.fwhm || wavenumberToNmWidth(wl, widthCm), spec, widthCm };
}

// Signal and idler of one pump ray, or null when the settings leave no
// physical idler.
//   linewidthMode 'pump'   – signal as wide as the pump (a heuristic for
//                            synchronous pumping); idler in quadrature
//                 'signal' – authored signal width; idler in quadrature
//                 'both'   – authored signal and idler widths
// `merged` is set only at degeneracy with equal widths, where signal and
// idler are one beam; with different widths they stay two coincident waves.
export function opoWaves({
  pumpWl, pumpFwhmNm = 0, signalWl, linewidthMode = 'pump', signalLinewidthCm = 0, idlerLinewidthCm = 0,
}) {
  const idler = idlerWavelength(pumpWl, signalWl);
  if (idler === null) return null;
  const pumpCm = nmToWavenumberWidth(pumpWl, pumpFwhmNm);
  const authored = v => Math.max(0, Number(v) || 0);
  const signalCm = linewidthMode === 'signal' || linewidthMode === 'both' ? authored(signalLinewidthCm) : pumpCm;
  const idlerCm = linewidthMode === 'both' ? authored(idlerLinewidthCm) : Math.hypot(pumpCm, signalCm);
  const degenerate = Math.abs(idler - signalWl) <= 1e-9 * Math.max(idler, signalWl);
  const signal = waveSpectrum(signalWl, signalCm);
  return {
    pumpCm,
    degenerate,
    signalShare: idler / (signalWl + idler),
    signal,
    idler: waveSpectrum(degenerate ? signalWl : idler, idlerCm),
    merged: degenerate && Math.abs(signalCm - idlerCm) <= 1e-12 * Math.max(1, signalCm) ? signal : null,
  };
}

// Pulse metadata for a generated wave. It keeps the pump train's timing and
// gates but is a train of its own, so detectors can tell pump, signal and
// idler apart while still knowing they are synchronised. Only fields that
// describe the train are carried over; anything describing the pump's own
// spectrum or phase is recomputed for the new light.
export function opoPulse(pumpPulse, wave, { crystalId, role, outputPhase = 'unknown', durationFactor = 1 }) {
  if (!pumpPulse) return null;
  const limit = transformLimitFs(wave.widthCm);
  const factor = Number(durationFactor) > 0 ? Number(durationFactor) : 1;
  const requested = pumpPulse.pulseWidthFs * factor;
  // A zero-width output is an idealised monochromatic pulse train, as a
  // pulsed source with 0 nm bandwidth is: it has a duration but no limit,
  // so it cannot be declared transform-limited.
  const wantsLimit = outputPhase === 'transformLimited';
  const transformLimited = wantsLimit && Number.isFinite(limit);
  // Rounding alone must not count as asking for less than the limit.
  const belowLimit = Number.isFinite(limit) && requested < limit * (1 - 1e-9);
  // Three authored choices. 'transformLimited' sets the duration from the
  // bandwidth. 'unknown' sets it and claims nothing about the phase, so no
  // compressor can shorten it. 'positiveChirp' is an explicit assumption: a
  // coherent Gaussian whose only spectral phase is a positive quadratic one,
  // so the transform-limited pulse carries the GDD that stretches it to the
  // set duration, and a compressor downstream can take it back out. Duration
  // and bandwidth alone could not establish that, which is why it is opt-in.
  const wantsChirp = outputPhase === 'positiveChirp';
  const chirped = wantsChirp && Number.isFinite(limit) && requested > limit * (1 + 1e-9);
  const chirpGddFs2 = chirped
    ? limit * limit / (4 * Math.LN2) * Math.sqrt((requested / limit) ** 2 - 1)
    : 0;
  const trainId = pumpPulse.sourceId || '';
  return {
    sourceId: `${trainId}›${crystalId || 'opo'}:${role}`,
    syncSourceId: pumpPulse.syncSourceId || trainId,
    repRateMHz: pumpPulse.repRateMHz,
    phaseNs: pumpPulse.phaseNs,
    gates: Array.isArray(pumpPulse.gates) ? pumpPulse.gates.map(g => ({ ...g })) : undefined,
    centerWavelengthNm: wave.wl,
    bandwidthNm: wave.bw,
    pulseShape: 'gauss',
    // A chirped pulse is described as its transform limit plus the GDD it
    // carries, which is how every dispersed pulse in the tracer is held.
    pulseWidthFs: transformLimited || belowLimit || chirped ? limit : requested,
    transformLimited: transformLimited || chirped || (wantsChirp && belowLimit),
    spectralPhase: transformLimited || (wantsChirp && belowLimit) ? 'transformLimited' : chirped ? 'positiveChirp' : 'unknown',
    chirpGddFs2,
    outputDurationFs: transformLimited || belowLimit ? limit : requested,
    durationRaisedToLimit: !wantsLimit && belowLimit,
    transformLimitUnavailable: wantsLimit && !transformLimited,
  };
}

// Sum- and difference-frequency generation for the crystal's `convert: 'sfg'`
// and `convert: 'dfg'` modes: a second-order process that needs two beams at
// the crystal at the same time.
//
// Energy. SFG adds the photon energies, 1/λ3 = 1/λ1 + 1/λ2, so the output is
// shorter than either input. DFG subtracts them, 1/λ3 = 1/λ1 − 1/λ2 with λ1
// the shorter input, so the output is longer than that input — though not
// necessarily longer than the other one: 400 nm with 1000 nm gives 667 nm. Both are written
// from the pair, never from one beam alone: single-beam illumination produces
// nothing, which is what makes these modes two-colour experiments.
//
// Time. Mixing is instantaneous: the two pulses have to be at the crystal
// together. `mixOverlap` reports how much of the pair survives their arrival
// mismatch, and the tracer drops the output entirely below a floor — the
// signal appears only around time zero, which is how a real cross-correlation
// finds it. Nothing here models phase matching, depletion or spatial overlap.
export function mixWavelength(kind, aWl, bWl) {
  const a = Number(aWl), b = Number(bWl);
  if (!(a > 0 && b > 0)) return null;
  const shorter = Math.min(a, b), longer = Math.max(a, b);
  if (kind === 'sfg') return 1 / (1 / shorter + 1 / longer);
  if (kind !== 'dfg') return null;
  // 1/λ3 = 1/λ1 − 1/λ2 has no positive solution for two equal inputs.
  const inverse = 1 / shorter - 1 / longer;
  return inverse > 0 ? 1 / inverse : null;
}

// The product of two Gaussians in time: the mixed pulse is shorter than
// either input, and a long pulse mixed with a short one takes the short
// one's duration. This is the undepleted, transform-limited-Gaussian
// statement, not a propagation calculation.
export function mixDurationFs(aFs, bFs) {
  const a = Number(aFs), b = Number(bFs);
  if (!(a > 0)) return b > 0 ? b : null;
  if (!(b > 0)) return a;
  return 1 / Math.sqrt(1 / (a * a) + 1 / (b * b));
}

// How wide the mixed line is. Frequencies add, so for two uncorrelated
// Gaussian inputs the sum-frequency width is their widths added in quadrature
// — in wavenumber, where that addition is linear. A line drawn with no width
// at all would read as an enormous spectral density beside the harmonics it is
// meant to be compared with.
export function mixWidthNm(outWl, aWl, aFwhmNm, bWl, bFwhmNm) {
  if (!(outWl > 0)) return 0;
  const a = nmToWavenumberWidth(aWl, aFwhmNm), b = nmToWavenumberWidth(bWl, bFwhmNm);
  const widthCm = Math.hypot(a, b);
  return widthCm > 0 ? wavenumberToNmWidth(outWl, widthCm) : 0;
}

// The mixed output's pulse train. It exists only while both inputs are at the
// crystal, so its timing comes from the pair rather than from whichever beam
// drives it: the centre is the Gaussian product's centre, and a gate on
// either input gates the signal, because both have to be there.
//
// Gates are defined against their own train's emission time, so a gate taken
// from one input has to be rebased when it is carried onto a train with a
// different epoch: shifting its phase by the difference between the two
// emission times leaves it switching at the same absolute instants it did on
// the beam it was imposed on. Without that, moving a source would move when
// its own modulator appears to act.
//
// `centerNs` is when the signal peaks at the crystal, absolute on the same
// scale as the inputs' arrivals; `oplMm` is the path the generated ray
// carries onward, so the stored phase reproduces that arrival.
export function mixPulse(rayPulse, partnerPulse, {
  crystalId, kind, wl, bandwidthNm = 0, centerNs, oplMm = 0, repRateMHz, partnerPulseOffset = 0, periodNs = 0,
} = {}) {
  const trains = [rayPulse, partnerPulse].filter(Boolean);
  if (!trains.length) return null;
  const timed = trains.find(t => t.repRateMHz > 0) || trains[0];
  const trainId = timed.sourceId || '';
  const duration = mixDurationFs(rayPulse?.pulseWidthFs, partnerPulse?.pulseWidthFs);
  const rate = repRateMHz ?? timed.repRateMHz;
  const phaseNs = Number.isFinite(centerNs) ? centerNs - oplMm / C_MM_PER_NS : timed.phaseNs;
  // Both inputs' gates apply: each keeps the path it was imposed at, and is
  // rebased onto this train's epoch so it still switches at the same times.
  // The partner's gates are rebased against the pulse of ITS train that takes
  // part, which can be whole periods from its own pulse zero: a gate passing
  // every second pulse has to be asked about the pulse that actually arrives.
  const rebase = (train, pulseOffset) => {
    if (!Array.isArray(train?.gates) || !train.gates.length) return [];
    const shift = phaseNs - (Number.isFinite(train.phaseNs) ? train.phaseNs : 0) - pulseOffset * periodNs;
    return train.gates.map(g => ({ ...g, phaseNs: (Number.isFinite(g.phaseNs) ? g.phaseNs : 0) + shift }));
  };
  const gates = [...rebase(rayPulse, 0), ...rebase(partnerPulse, partnerPulseOffset)];
  return {
    sourceId: `${trainId}›${crystalId || 'crystal'}:${kind || 'mix'}`,
    syncSourceId: timed.syncSourceId || trainId,
    repRateMHz: rate,
    phaseNs,
    gates: gates.length ? gates : undefined,
    centerWavelengthNm: wl,
    // The same width the drawn spectrum carries, so the pulse metadata and the
    // spectrum describe one output.
    bandwidthNm,
    pulseShape: 'gauss',
    pulseWidthFs: duration ?? timed.pulseWidthFs,
    transformLimited: false,
    spectralPhase: 'unknown',
  };
}

// How much of a mixed pair survives the mismatch in when the two pulses reach
// the crystal, and when the signal peaks.
//
// For two Gaussian intensity envelopes of FWHM τ₁ and τ₂ arriving Δt apart,
// the normalised overlap integral is exp[−4 ln2 Δt²/(τ₁² + τ₂²)] and the
// product peaks at the weighted mean of the two arrivals.
//
// Only trains at the same nominal repetition rate are modelled. Different
// rates are not a physical "never": 80 and 60 MHz coincide at 20 MHz, and
// slightly detuned trains sweep through the delay, which is what asynchronous
// optical sampling uses. This model has no epoch bookkeeping for those, so it
// reports them as unsupported rather than pretending to a result.
export function mixOverlap(a, b) {
  const repA = a?.pulse?.repRateMHz, repB = b?.pulse?.repRateMHz;
  const arrivalOf = beam => (beam.opl || 0) / C_MM_PER_NS + (beam.pulse?.phaseNs || 0);
  const pulsedA = repA > 0, pulsedB = repB > 0;
  // A steady beam is always there. Timing then comes from the pulsed one, if
  // there is one: an always-present beam cannot set when the signal arrives.
  if (!pulsedA || !pulsedB) {
    const timed = pulsedA ? a : pulsedB ? b : null;
    return {
      factor: 1, skewNs: null, comparable: false, unsupported: false,
      centerNs: timed ? arrivalOf(timed) : null,
      repRateMHz: timed?.pulse?.repRateMHz ?? null,
      partnerPulseOffset: 0, periodNs: timed ? 1000 / timed.pulse.repRateMHz : 0,
    };
  }
  if (Math.abs(repA - repB) > 1e-9 * Math.max(repA, repB)) {
    return { factor: 0, skewNs: null, comparable: false, unsupported: true, centerNs: null, repRateMHz: null };
  }
  const periodNs = 1000 / repA;
  const tA = arrivalOf(a), tB = arrivalOf(b);
  // The nearest coincidence, not the raw difference: pulse n of one train
  // meets whichever pulse of the other is closest. That pulse can be whole
  // periods away, and which one it is matters to anything slower than the
  // train — a chopper passing every second pulse, for instance — so the
  // offset is reported alongside the remainder.
  const wrapped = ((tA - tB) % periodNs + periodNs + periodNs / 2) % periodNs - periodNs / 2;
  const partnerPulseOffset = Math.round((tA - tB) / periodNs);
  const widthA = Math.max(1, a.pulse.pulseWidthFs || 100) * 1e-6;
  const widthB = Math.max(1, b.pulse.pulseWidthFs || 100) * 1e-6;
  const factor = Math.exp(-4 * Math.LN2 * wrapped * wrapped / (widthA * widthA + widthB * widthB));
  // The product of the two envelopes peaks between them, nearer the shorter
  // pulse, which is what pins the signal down in time.
  const weightA = 1 / (widthA * widthA), weightB = 1 / (widthB * widthB);
  const centerNs = (tA * weightA + (tA - wrapped) * weightB) / (weightA + weightB);
  return {
    factor, skewNs: Math.abs(wrapped), comparable: true, unsupported: false,
    centerNs, repRateMHz: repA, partnerPulseOffset, periodNs,
  };
}
