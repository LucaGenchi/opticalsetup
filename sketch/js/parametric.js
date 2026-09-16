import { C_MM_PER_NS } from './pulses.js';

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
    pulseWidthFs: transformLimited ? limit : belowLimit ? limit : requested,
    transformLimited,
    spectralPhase: transformLimited ? 'transformLimited' : 'unknown',
    durationRaisedToLimit: !transformLimited && belowLimit,
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
export function mixPulse(rayPulse, partnerPulse, { crystalId, kind, wl, centerNs, oplMm = 0, repRateMHz } = {}) {
  const trains = [rayPulse, partnerPulse].filter(Boolean);
  if (!trains.length) return null;
  const timed = trains.find(t => t.repRateMHz > 0) || trains[0];
  const trainId = timed.sourceId || '';
  const duration = mixDurationFs(rayPulse?.pulseWidthFs, partnerPulse?.pulseWidthFs);
  const rate = repRateMHz ?? timed.repRateMHz;
  const phaseNs = Number.isFinite(centerNs) ? centerNs - oplMm / C_MM_PER_NS : timed.phaseNs;
  // Both inputs' gates apply: each keeps the path it was imposed at, and is
  // rebased onto this train's epoch so it still switches at the same times.
  const gates = trains.flatMap(t => {
    if (!Array.isArray(t.gates) || !t.gates.length) return [];
    const shift = phaseNs - (Number.isFinite(t.phaseNs) ? t.phaseNs : 0);
    return t.gates.map(g => ({ ...g, phaseNs: (Number.isFinite(g.phaseNs) ? g.phaseNs : 0) + shift }));
  });
  return {
    sourceId: `${trainId}›${crystalId || 'crystal'}:${kind || 'mix'}`,
    syncSourceId: timed.syncSourceId || trainId,
    repRateMHz: rate,
    phaseNs,
    gates: gates.length ? gates : undefined,
    centerWavelengthNm: wl,
    bandwidthNm: 0,
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
    };
  }
  if (Math.abs(repA - repB) > 1e-9 * Math.max(repA, repB)) {
    return { factor: 0, skewNs: null, comparable: false, unsupported: true, centerNs: null, repRateMHz: null };
  }
  const periodNs = 1000 / repA;
  const tA = arrivalOf(a), tB = arrivalOf(b);
  // The nearest coincidence, not the raw difference: pulse n of one train
  // meets whichever pulse of the other is closest.
  const wrapped = ((tA - tB) % periodNs + periodNs + periodNs / 2) % periodNs - periodNs / 2;
  const widthA = Math.max(1, a.pulse.pulseWidthFs || 100) * 1e-6;
  const widthB = Math.max(1, b.pulse.pulseWidthFs || 100) * 1e-6;
  const factor = Math.exp(-4 * Math.LN2 * wrapped * wrapped / (widthA * widthA + widthB * widthB));
  // The product of the two envelopes peaks between them, nearer the shorter
  // pulse, which is what pins the signal down in time.
  const weightA = 1 / (widthA * widthA), weightB = 1 / (widthB * widthB);
  const centerNs = (tA * weightA + (tA - wrapped) * weightB) / (weightA + weightB);
  return { factor, skewNs: Math.abs(wrapped), comparable: true, unsupported: false, centerNs, repRateMHz: repA };
}
