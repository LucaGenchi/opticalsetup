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
// Below the visibility floor crystal mixing drops a pair. Here it is only a
// label: the quadrature already takes the gain continuously to zero.
const MIN_OVERLAP = 0.02;
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

// Quasi-static quadrature over one pulse period on ONE set of time cells
// shared by every seed, so seeds that meet the same pump instant share that
// instant's energy. Times are fs from the pump peak (from the first pulsed
// seed when the pump is CW); widths are intensity FWHM. A window stops where
// the pump no longer gives gain (2.5 FWHM: amplitude-gain scale below 2e-4)
// and where a seed has no power left (4 FWHM: 1e-19 of its peak).
const PUMP_REACH_FWHM = 2.5, SEED_REACH_FWHM = 4;
const CELLS_PER_FWHM = 64, MAX_CELLS_PER_PIECE = 4096;
const GAUSSIAN_AREA_FWHM = Math.sqrt(Math.PI / (4 * Math.LN2));
const envelope = (t, fwhm) => Math.exp(-4 * Math.LN2 * (t / fwhm) ** 2);
const pulsed = beam => beam.pulse?.repRateMHz > 0 ? beam.pulse : null;
const sameRate = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(a, b);
// Fraction of a beam's average power per fs at time t: a pulse holds the
// train's whole average power in its envelope, a CW beam 1/period of it.
const powerDensity = (pulse, centreFs, periodFs, t) => pulse
  ? envelope(t - centreFs, pulse.pulseWidthFs) / (pulse.pulseWidthFs * GAUSSIAN_AREA_FWHM)
  : 1 / periodFs;

// Midpoint cells that never cross a window edge. The time axis is cut at every
// edge; inside each piece the same seeds are present throughout, and the
// piece is split finely enough for the shortest pulse that shapes it. A cell's
// weight is therefore only time where its seeds and the pump really are, and
// adding or removing a seed cannot widen another seed's cells' reach.
// Each cell lists the channels present. Without any pulse there is no time
// structure: one cell holding everything.
function sharedCells(channels, periodFs, pumpPulse, lengthM) {
  if (periodFs === null) return [{ t: 0, width: 1, present: channels }];
  const edges = [...new Set(channels.flatMap(channel => channel.live.window))].sort((x, y) => x - y);
  const cells = [];
  for (let k = 0; k + 1 < edges.length; k++) {
    const lo = edges[k], hi = edges[k + 1], mid = (lo + hi) / 2;
    if (!(hi > lo)) continue;
    const present = channels.filter(channel => channel.live.window[0] <= mid && mid <= channel.live.window[1]);
    if (!present.length) continue;
    const widths = present.map(channel => channel.live.pulse?.pulseWidthFs).filter(Boolean);
    // High gain sharpens the pump envelope: cosh^2(Gamma_peak L sqrt(I_p/I_peak))
    // is about exp(2 Gamma_peak L) times a Gaussian of width tau_p/sqrt(Gamma_peak L).
    if (pumpPulse) {
      const peakGammaL = Math.max(1, ...present.map(channel => channel.live.seed.gammaPerM * lengthM));
      widths.push(pumpPulse.pulseWidthFs / Math.sqrt(peakGammaL));
    }
    // Only CW light on this piece: a constant integrand, one cell is exact.
    const count = widths.length
      ? Math.min(MAX_CELLS_PER_PIECE, Math.max(1, Math.ceil((hi - lo) * CELLS_PER_FWHM / Math.min(...widths))))
      : 1;
    const width = (hi - lo) / count;
    for (let j = 0; j < count; j++) cells.push({ t: lo + (j + 0.5) * width, width, present });
  }
  return cells;
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
      overlap: 0, skewNs: null, lowOverlap: false, saturated: false,
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
    channel.lowOverlap = overlap.factor < MIN_OVERLAP;
    const gain = parametricSmallSignalGain({ gammaPerM: seed.gammaPerM, lengthM, deltaKPerM: seed.deltaKPerM ?? 0 });
    if (!gain) return stop('invalidGain');
    channel.smallSignalGain = gain.gain;
    channel.smallSignalGainCapped = gain.capped;
    if (budgetW === 0 || gain.logExcess === null) return stop('inactive');
    const pulse = pulsed(seed);
    return { ...channel, state: 'amplifying', requestFraction: 0, pair, live: {
      seed, pulse, overlap, requestW: 0, window: null,
      logSeedPumpW: Math.log(seed.powerW) - Math.log(pair.signalShare),
    } };
  });

  // One period frame for all live seeds. With a pulsed pump its peak is t = 0;
  // with a CW pump the first pulsed seed (key order) sets t = 0 and the period,
  // and a pulsed seed at another repetition rate cannot share the grid.
  const live = channels.filter(channel => channel.live);
  const pumpPulse = pulsed(pump);
  const reference = pumpPulse ? null : live.find(channel => channel.live.pulse);
  const repMHz = pumpPulse?.repRateMHz ?? reference?.live.pulse.repRateMHz ?? null;
  const periodFs = repMHz === null ? null : 1e9 / repMHz;
  const wrap = t => ((t % periodFs) + periodFs * 1.5) % periodFs - periodFs / 2;
  const pumpWindow = pumpPulse
    ? [-PUMP_REACH_FWHM * pumpPulse.pulseWidthFs, PUMP_REACH_FWHM * pumpPulse.pulseWidthFs]
    : [-Infinity, Infinity];
  for (const channel of live) {
    const { pulse, overlap } = channel.live;
    if (!pumpPulse && pulse && !sameRate(pulse.repRateMHz, repMHz)) {
      Object.assign(channel, { state: 'repetitionUnsupported', live: null });
      continue;
    }
    if (periodFs === null) continue;
    // Pulsed pump: offsetNs is pump minus seed, so the seed sits at -offset.
    // CW pump: centerNs is the seed's own arrival.
    const centreFs = !pulse ? 0 : pumpPulse ? -overlap.offsetNs * 1e6
      : wrap((overlap.centerNs - reference.live.overlap.centerNs) * 1e6);
    const own = pulse
      ? [centreFs - SEED_REACH_FWHM * pulse.pulseWidthFs, centreFs + SEED_REACH_FWHM * pulse.pulseWidthFs]
      : [-periodFs / 2, periodFs / 2];
    channel.live.centreFs = centreFs;
    // Not clipped to the period: a seed pulse near half a period from the
    // origin keeps its whole envelope.
    channel.live.window = [Math.max(own[0], pumpWindow[0]), Math.min(own[1], pumpWindow[1])];
  }
  const active = live.filter(channel => channel.live && !(channel.live.window && !(channel.live.window[1] > channel.live.window[0])));
  // In each cell, the seeds present together ask for pump energy; if they
  // ask for more than the cell holds, all are cut by the same factor. Logs
  // keep enormous formal gain finite.
  const logBudgetW = Math.log(budgetW);
  for (const { t, width, present } of sharedCells(active, periodFs, pumpPulse, lengthM)) {
    const pumpShare = (periodFs === null ? 1 : powerDensity(pumpPulse, 0, periodFs, t)) * width;
    if (!(pumpShare > 0)) continue;
    const gammaScale = pumpPulse ? Math.sqrt(envelope(t, pumpPulse.pulseWidthFs)) : 1;
    const logAvailableW = logBudgetW + Math.log(pumpShare);
    const demands = [];
    for (const channel of present) {
      const seedLive = channel.live;
      const seedShare = (periodFs === null ? 1 : powerDensity(seedLive.pulse, seedLive.centreFs, periodFs, t)) * width;
      if (!(seedShare > 0)) continue;
      const local = parametricSmallSignalGain({
        gammaPerM: seedLive.seed.gammaPerM * gammaScale, lengthM, deltaKPerM: seedLive.seed.deltaKPerM ?? 0,
      });
      if (!local || local.logExcess === null) continue;
      demands.push([channel, seedLive.logSeedPumpW + Math.log(seedShare) + local.logExcess]);
    }
    if (!demands.length) continue;
    const top = Math.max(...demands.map(([, logDemand]) => logDemand));
    const logTotalW = top + Math.log(demands.reduce((sum, [, logDemand]) => sum + Math.exp(logDemand - top), 0));
    const logCut = Math.min(0, logAvailableW - logTotalW);
    for (const [channel, logDemandW] of demands) {
      channel.live.requestW += Math.exp(logDemandW + logCut);
      // Flag a cut only where this seed's own demand was significant.
      if (logCut < 0 && logDemandW > logAvailableW - Math.log(1e6)) channel.saturated = true;
    }
  }
  for (const channel of channels) {
    if (!channel.live) continue;
    channel.requestFraction = channel.live.requestW / budgetW;
    if (!(channel.requestFraction > 0)) {
      channel.state = channel.live.window && !(channel.live.window[1] > channel.live.window[0]) ? 'unsynchronized' : 'inactive';
    }
    channel.live = null;
  }
  const totalRequest = channels.reduce((sum, channel) => sum + channel.requestFraction, 0);
  const scale = totalRequest > 1 ? 1 / totalRequest : 1;
  let remainingW = budgetW;
  let depletedPumpW = 0;
  const outputs = channels.map(({ requestFraction, pair, live: _live, ...channel }) => {
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
