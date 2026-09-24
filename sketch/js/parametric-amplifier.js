// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { mixOverlap, parametricPair, parametricSmallSignalGain } from './parametric.js';

// Pure single-pass event allocation, deliberately independent of ray sampling.
// ALL powerW values must be on the SAME physical watt basis. A source's
// normalized ray weight is not a watt. A future tracer adapter must gather one
// pump and all its spatially eligible seed modes before calling this function,
// then debit/credit each beam ONCE, distributing its result over samples.
//
// Each seed supplies gammaPerM at the PEAK local pump intensity (for a CW
// pump, its intensity) and deltaKPerM; the caller, not this allocator,
// computes intensity and material dispersion.
// Timing is quasi-static: parametric gain has no energy storage, so each
// instant of the seed sees the gain of the pump intensity at that instant,
// Gamma(t) = Gamma_peak * sqrt(I_p(t)/I_peak), over Gaussian envelopes within
// one pulse period. A CW beam puts only f_rep*dt of its power in each slice,
// so a CW seed is amplified only while the pump pulse is there. Each slice may
// convert at most its own pump energy (a clamp, no back-conversion). Group-
// velocity walk-off, which ends the interaction after the pulse-splitting
// length, is not modelled. When several seeds exhaust the pump, a uniform
// reduction of their requests is an allocation rule, not a solution of the
// coupled depleted-field equations.
//
// Invalid batch structure/powers return null. A valid but unsupported channel
// is passed unchanged with an explicit state. Gates, unknown durations,
// same-mode degeneracy and jointly seeded conjugate modes need more physics;
// they must never silently receive the nondegenerate singly-seeded gain.
const MAX_CHANNELS = 256;
const MIN_OVERLAP = 0.02; // same visibility floor as existing crystal mixing
const finitePower = value => Number.isFinite(value) && value >= 0;
const validTiming = beam => {
  if (!beam.pulse) return true;
  const p = beam.pulse;
  return Number.isFinite(p.repRateMHz) && p.repRateMHz > 0
    && Number.isFinite(p.pulseWidthFs) && p.pulseWidthFs >= 1
    && (p.phaseNs === undefined || Number.isFinite(p.phaseNs))
    && (beam.opl === undefined || Number.isFinite(beam.opl));
};
const sameWavelength = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(a, b);

// Quadrature of one pump-seed coincidence. Times are fs from the pump peak;
// widths are intensity FWHM. The window stops where the pump no longer gives
// gain (2.5 FWHM: amplitude gain scale below 2e-4) and where the seed has no
// power left (4 FWHM: 1e-19 of its peak).
const PUMP_REACH_FWHM = 2.5, SEED_REACH_FWHM = 4, SLICES = 401;
const GAUSSIAN_AREA_FWHM = Math.sqrt(Math.PI / (4 * Math.LN2));
const envelope = (t, fwhm) => Math.exp(-4 * Math.LN2 * (t / fwhm) ** 2);
const pulsed = beam => beam.pulse?.repRateMHz > 0 ? beam.pulse : null;

// Each slice carries the fraction of the seed's and of the pump's average
// power it holds, and the local amplitude-gain scale sqrt(I_p/I_peak).
function coincidenceSlices(pump, seed, skewFs) {
  const pumpPulse = pulsed(pump), seedPulse = pulsed(seed);
  if (!pumpPulse && !seedPulse) return [{ seedFraction: 1, pumpFraction: 1, gammaScale: 1 }];
  const repHz = (pumpPulse || seedPulse).repRateMHz * 1e6;
  const tauP = pumpPulse && Math.max(1, pumpPulse.pulseWidthFs);
  const tauS = seedPulse && Math.max(1, seedPulse.pulseWidthFs);
  const centre = pumpPulse && seedPulse ? skewFs : 0;
  let lo = -Infinity, hi = Infinity;
  if (pumpPulse) { lo = -PUMP_REACH_FWHM * tauP; hi = PUMP_REACH_FWHM * tauP; }
  if (seedPulse) {
    lo = Math.max(lo, centre - SEED_REACH_FWHM * tauS);
    hi = Math.min(hi, centre + SEED_REACH_FWHM * tauS);
  }
  if (!(hi > lo)) return [];
  const step = (hi - lo) / (SLICES - 1);
  const slices = [];
  for (let k = 0; k < SLICES; k++) {
    const t = lo + k * step;
    const width = (k === 0 || k === SLICES - 1 ? 0.5 : 1) * step; // trapezoid
    // A pulse holds a train's whole average power in its envelope; a CW beam
    // holds f_rep*dt of it in each slice of the period.
    const share = (pulse, tau, at) => pulse
      ? envelope(t - at, tau) * width / (tau * GAUSSIAN_AREA_FWHM)
      : width * 1e-15 * repHz;
    slices.push({
      seedFraction: share(seedPulse, tauS, centre),
      pumpFraction: share(pumpPulse, tauP, 0),
      gammaScale: pumpPulse ? Math.sqrt(envelope(t, tauP)) : 1,
    });
  }
  return slices;
}

export function allocateParametricAmplifier({ pump, seeds = [], lengthM, maxDepletion = 1 } = {}) {
  if (!pump || !finitePower(pump.powerW) || !Number.isFinite(pump.wl) || pump.wl <= 0
      || !Array.isArray(seeds) || seeds.length > MAX_CHANNELS
      || !Number.isFinite(lengthM) || lengthM < 0
      || !Number.isFinite(maxDepletion) || maxDepletion < 0 || maxDepletion > 1) return null;
  const keys = new Set();
  let totalInputW = pump.powerW;
  for (const seed of seeds) {
    if (!seed || typeof seed.key !== 'string' || !seed.key || keys.has(seed.key) || !finitePower(seed.powerW)) return null;
    keys.add(seed.key);
    totalInputW += seed.powerW;
    if (!Number.isFinite(totalInputW)) return null;
  }
  // Sorting gives deterministic floating-point reductions and output order.
  const ordered = [...seeds].sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const budgetW = pump.powerW * maxDepletion;
  const channels = ordered.map(seed => {
    const pair = parametricPair(pump.wl, seed.wl);
    const channel = {
      key: seed.key, state: 'inactive', signalWl: Number.isFinite(seed.wl) ? seed.wl : null,
      idlerWl: pair?.idlerWl ?? null, signalInW: seed.powerW, signalOutW: seed.powerW,
      signalGainW: 0, idlerOutW: 0, depletedPumpW: 0, pumpFraction: 0,
      smallSignalGain: 1, smallSignalGainCapped: false, achievedGain: 1,
      achievedGainCapped: false,
      overlap: 0, skewNs: null, saturated: false,
    };
    const stop = state => ({ ...channel, state, requestFraction: 0 });
    if (!pair) return stop('invalidWavelength');
    if (seed.powerW === 0) return stop('noSeed');
    if (pump.powerW === 0) return stop('noPump');
    if (pair.degenerate) return stop('degenerateUnsupported');
    // Two populated conjugate frequencies require their relative phase and
    // coherent coupled fields. This allocator cannot treat them independently.
    if (ordered.some(other => other.key !== seed.key && other.powerW > 0
      && Number.isFinite(other.wl) && sameWavelength(other.wl, pair.idlerWl))) return stop('doubleSeedUnsupported');
    if (!validTiming(pump) || !validTiming(seed)) return stop('invalidTiming');
    if ([pump, seed].some(beam => beam.pulse?.durationUnknown)) return stop('durationUnsupported');
    if ([pump, seed].some(beam => beam.pulse?.gates?.length)) return stop('gatesUnsupported');
    const overlap = mixOverlap(pump, seed);
    if (!Number.isFinite(overlap.factor) || !Number.isFinite(overlap.skewNs ?? 0)) return stop('invalidTiming');
    channel.overlap = overlap.factor;
    channel.skewNs = overlap.skewNs;
    if (overlap.unsupported) return stop('repetitionUnsupported');
    if (overlap.factor < MIN_OVERLAP) return stop('unsynchronized');
    const gain = parametricSmallSignalGain({ gammaPerM: seed.gammaPerM, lengthM, deltaKPerM: seed.deltaKPerM ?? 0 });
    if (!gain) return stop('invalidGain');
    channel.smallSignalGain = gain.gain;
    channel.smallSignalGainCapped = gain.capped;
    if (budgetW === 0 || gain.logExcess === null) return stop('inactive');
    // Work in logs, never exponentiate an unbounded demand, and let each
    // slice convert at most its own pump energy: enormous formal gain must not
    // consume pump energy that never meets the seed.
    const logSeedPumpW = Math.log(seed.powerW) - Math.log(pair.signalShare);
    let requestW = 0;
    for (const slice of coincidenceSlices(pump, seed, (overlap.skewNs ?? 0) * 1e6)) {
      if (!(slice.seedFraction > 0 && slice.pumpFraction > 0)) continue;
      const local = parametricSmallSignalGain({
        gammaPerM: seed.gammaPerM * slice.gammaScale, lengthM, deltaKPerM: seed.deltaKPerM ?? 0,
      });
      if (!local) return stop('invalidGain');
      if (local.logExcess === null) continue;
      const logDemandW = logSeedPumpW + Math.log(slice.seedFraction) + local.logExcess;
      const logAvailableW = Math.log(budgetW) + Math.log(slice.pumpFraction);
      if (logDemandW > logAvailableW) channel.saturated = true;
      requestW += Math.exp(Math.min(logDemandW, logAvailableW));
    }
    const requestFraction = requestW / budgetW;
    return { ...channel, state: requestFraction > 0 ? 'amplifying' : 'inactive', requestFraction, pair };
  });
  const totalRequest = channels.reduce((sum, channel) => sum + channel.requestFraction, 0);
  const scale = totalRequest > 1 ? 1 / totalRequest : 1;
  let remainingW = budgetW;
  let depletedPumpW = 0;
  const outputs = channels.map(({ requestFraction, pair, ...channel }) => {
    const takeW = Math.min(remainingW, budgetW * requestFraction * scale);
    remainingW = Math.max(0, remainingW - takeW);
    depletedPumpW += takeW;
    if (takeW > 0) {
      channel.signalGainW = takeW * pair.signalShare;
      channel.idlerOutW = takeW - channel.signalGainW;
      channel.signalOutW += channel.signalGainW;
      channel.depletedPumpW = takeW;
      channel.pumpFraction = takeW / pump.powerW;
      // A finite diagnostic even for a subnormal seed. Physical powers above
      // are uncapped and conserved; this readout cannot drive another stage.
      const achieved = channel.signalOutW / channel.signalInW;
      channel.achievedGain = Math.min(Number.MAX_VALUE, achieved);
      channel.achievedGainCapped = !Number.isFinite(achieved);
      channel.saturated ||= scale < 1;
    }
    return channel;
  });
  return {
    pumpInW: pump.powerW, pumpOutW: Math.max(0, pump.powerW - depletedPumpW),
    depletedPumpW, conversionFraction: pump.powerW > 0 ? depletedPumpW / pump.powerW : 0,
    totalInputW, channels: outputs,
  };
}
