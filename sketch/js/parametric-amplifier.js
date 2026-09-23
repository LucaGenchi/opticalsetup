// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { mixOverlap, parametricPair, parametricSmallSignalGain } from './parametric.js';

// Pure single-pass event allocation, deliberately independent of ray sampling.
// ALL powerW values must be on the SAME physical watt basis. A source's
// normalized ray weight is not a watt. A future tracer adapter must gather one
// pump and all its spatially eligible seed modes before calling this function,
// then debit/credit each beam ONCE, distributing its result over samples.
//
// Each seed supplies gammaPerM at the local full pump intensity and deltaKPerM;
// the caller, not this allocator, computes intensity and material dispersion.
// Timing scales the generated increment and accessible pump budget by the
// existing Gaussian overlap integral. This is a bounded envelope proxy, not a
// time-resolved integration of cosh gain through a pulse. A uniform reduction
// of all requests when they exhaust the pump is likewise an allocation rule,
// not a solution of the coupled depleted-field equations. No back-conversion.
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
    // Work in fractions of the available pump, never exponentiate an
    // unbounded demand. Also limit each pair to its overlapping pump fraction:
    // enormous formal gain must not consume non-overlapping pump energy.
    const logRequestFraction = Math.log(seed.powerW) + gain.logExcess + Math.log(overlap.factor)
      - Math.log(pair.signalShare) - Math.log(budgetW);
    const requestFraction = Math.exp(Math.min(Math.log(overlap.factor), logRequestFraction));
    channel.saturated = logRequestFraction > Math.log(overlap.factor);
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
