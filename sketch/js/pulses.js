// Pure helpers for pulse timing and canvas-only packet visualization.
// Optical path lengths are expressed in millimetres and time in nanoseconds.

import { gaussianPulseDurationAfterGDD } from './glass.js';

export const C_MM_PER_NS = 299.792458;

const positiveMod = (value, modulus) => ((value % modulus) + modulus) % modulus;

// Instantaneous transmission of one temporal gate. `emissionTimeNs` is the
// source emission time when `gate.opl` is an optical path from the source, or
// the local gate time when `gate.opl` is zero (used by the live CW preview).
// Whether two pulse trains actually meet at the same instant. Wave mixing
// and stimulated Raman only happen while both pulses are physically present,
// so a path-length difference between the two arms switches the signal off —
// which is exactly what a delay line exists to correct.
//
// Returns a 0..1 overlap factor (a Gaussian in the arrival skew, measured in
// pulse widths) plus the skew itself for reporting. Continuous-wave light is
// always present, and two trains at genuinely different repetition rates
// drift through each other rather than being permanently mismatched, so both
// count as fully overlapping.
export function pulseOverlap(a, b) {
  const full = { factor: 1, skewNs: 0, comparable: false };
  if (!a?.pulse || !b?.pulse) return full;
  const repA = a.pulse.repRateMHz, repB = b.pulse.repRateMHz;
  if (!(repA > 0) || !(repB > 0) || Math.abs(repA - repB) > 1e-9) return full;
  const periodNs = 1000 / repA;
  const arrivalOf = beam => (beam.opl || 0) / C_MM_PER_NS + (beam.pulse.phaseNs || 0);
  const offset = positiveMod(arrivalOf(a) - arrivalOf(b), periodNs);
  const skewNs = Math.min(offset, periodNs - offset);
  const widthNs = Math.max(1, Math.max(a.pulse.pulseWidthFs || 100, b.pulse.pulseWidthFs || 100)) * 1e-6;
  return { factor: Math.exp(-((skewNs / widthNs) ** 2)), skewNs, comparable: true };
}

export function gateTransmissionAt(gate, emissionTimeNs) {
  if (!Number.isFinite(gate?.opl) || !Number.isFinite(emissionTimeNs)) return 1;
  const frequencyMHz = Math.min(1e6, Math.max(0.000001, gate.frequencyMHz || 1));
  const periodNs = 1000 / frequencyMHz;
  const duty = Math.min(1, Math.max(0, gate.duty ?? 0.5));
  const arrivalNs = emissionTimeNs + gate.opl / C_MM_PER_NS;
  const phase = positiveMod(arrivalNs - (gate.phaseNs || 0), periodNs) / periodNs;
  let transmission;
  if (gate.shape === 'sine') {
    const depth = Math.min(1, Math.max(0, gate.depth ?? 1));
    // A sine gate swings between two levels the same way a square one does;
    // when both are given explicitly it can also express gain (high > 1),
    // which stimulated Raman needs. The default pair reproduces the original
    // 1 .. 1-depth swing exactly.
    const wave = (1 + Math.cos(2 * Math.PI * phase)) / 2;
    const high = Number.isFinite(gate.high) ? gate.high : 1;
    const low = Number.isFinite(gate.low) ? gate.low : 1 - depth;
    transmission = low + (high - low) * wave;
  } else {
    // A square gate alternates between two transmission levels. A chopper or
    // an RF-gated AOM uses the default full-on/full-off pair, but a
    // polarization modulator read through an analyzer swings between two
    // partial Malus-law levels instead (see the 'polarizer'/'pbs' cases in
    // raytrace.js), so both levels are explicit and optional.
    const high = Number.isFinite(gate.high) ? gate.high : 1;
    const low = Number.isFinite(gate.low) ? gate.low : 0;
    transmission = phase < duty ? high : low;
  }
  return gate.invert ? 1 - transmission : transmission;
}

// Fraction of one finite-duration pulse that survives all gates encountered so
// far. Ultrashort pulses use the exact centre-time decision. Broader pulses are
// integrated with deterministic midpoint samples so a chopper can clip a pulse
// instead of treating it as an infinitely narrow timestamp.
export function pulseTransmissionAt(pulse, emissionTimeNs) {
  const gates = Array.isArray(pulse?.gates) ? pulse.gates.filter(g => Number.isFinite(g?.opl)) : [];
  if (!gates.length) return 1;
  const transmissionAt = timeNs => gates.reduce((value, gate) => value * gateTransmissionAt(gate, timeNs), 1);
  const durationNs = Math.min(1000, Math.max(1e-6, pulse.pulseWidthFs || 100) * 1e-6);
  const gateFeatures = gates.map(gate => {
    const frequencyMHz = Math.min(1e6, Math.max(0.000001, gate.frequencyMHz || 1));
    const periodNs = 1000 / frequencyMHz;
    const duty = Math.min(1, Math.max(0, gate.duty ?? 0.5));
    return gate.shape === 'sine'
      ? periodNs / 4
      : periodNs * Math.max(1e-6, Math.min(duty, 1 - duty));
  });
  if (durationNs < Math.min(...gateFeatures) * 0.001) {
    return transmissionAt(emissionTimeNs);
  }
  const shortestPeriodNs = Math.min(...gates.map(g => 1000 / Math.min(1e6, Math.max(0.000001, g.frequencyMHz || 1))));
  const samples = Math.min(256, Math.max(32, Math.ceil(durationNs / shortestPeriodNs * 128)));
  let passed = 0;
  for (let i = 0; i < samples; i++) {
    const offsetNs = ((i + 0.5) / samples - 0.5) * durationNs;
    passed += transmissionAt(emissionTimeNs + offsetNs);
  }
  return passed / samples;
}

// Average passage of a discrete pulse train through every temporal gate on its
// path. Sampling emitted pulses (rather than multiplying gate duties) preserves
// phase relationships: aligned gates pass together and opposed gates extinguish.
export function pulseGateTransmission(pulse, sampleCount = 4096) {
  const gates = Array.isArray(pulse?.gates) ? pulse.gates.filter(g => Number.isFinite(g?.opl)) : [];
  if (!gates.length) return 1;
  const repRateMHz = Math.min(1e6, Math.max(0.001, pulse.repRateMHz || 80));
  const periodNs = 1000 / repRateMHz;
  const phaseNs = Number.isFinite(pulse.phaseNs) ? pulse.phaseNs : 0;
  const slowestGatePeriodNs = Math.max(...gates.map(g => 1000 / Math.min(1e6, Math.max(0.000001, g.frequencyMHz || 1))));
  const pulsesPerSlowCycle = Math.max(1, Math.ceil(slowestGatePeriodNs / periodNs));
  const slowCycleSamples = pulsesPerSlowCycle * 64;
  const count = Math.min(16384, Math.max(64, Math.round(sampleCount) || 4096, slowCycleSamples));
  // A nearly synchronous pulse train and gate drift through one another over a
  // long beat period. Include that full beat in the bounded sample span; only
  // sampling the first few thousand pulses otherwise reports a false 100% pass.
  const beatPulseSpan = Math.max(1, ...gates.map(gate => {
    const gatePeriodNs = 1000 / Math.min(1e6, Math.max(0.000001, gate.frequencyMHz || 1));
    const step = positiveMod(periodNs / gatePeriodNs, 1);
    const drift = Math.min(step, 1 - step);
    return drift < 1e-12 ? 1 : Math.ceil(1 / drift);
  }));
  const sampledPulseSpan = Math.max(count, slowCycleSamples, beatPulseSpan);
  let passed = 0;
  for (let i = 0; i < count; i++) {
    // When a gate cycle contains more pulses than the bounded sample count,
    // distribute integer pulse indices across 64 slow cycles instead of only
    // examining the tiny initial fraction of the waveform.
    const k = sampledPulseSpan === count ? i : Math.floor(i * sampledPulseSpan / count);
    const emissionTimeNs = phaseNs + k * periodNs;
    passed += pulseTransmissionAt(pulse, emissionTimeNs);
  }
  return passed / count;
}

// Time-domain trace a photodetector would show on an oscilloscope: where each
// pulse of the train lands in time, how much of it survived every temporal
// gate on its path (chopper, gated AOM, or a polarization modulator read
// through an analyzer), and the continuous gate envelope behind them.
//
// The window defaults to two periods of whichever is slower — the pulse train
// or the slowest modulation — so an alternating pattern (e.g. a 20 MHz train
// switched at 10 MHz) always shows at least one full repeat of its structure.
export function scopeTrace(pulse, { samples = 200, spanNs: forcedSpanNs } = {}) {
  const repRateMHz = Number.isFinite(pulse?.repRateMHz) && pulse.repRateMHz > 0
    ? Math.min(1e6, Math.max(0.001, pulse.repRateMHz)) : null;
  if (!repRateMHz) return null;
  const pulsePeriodNs = 1000 / repRateMHz;
  const gates = (Array.isArray(pulse?.trains) ? pulse.trains : [pulse])
    .flatMap(train => (Array.isArray(train?.gates) ? train.gates : []))
    .filter(g => Number.isFinite(g?.opl));
  const gatePeriodsNs = gates.map(g => 1000 / Math.min(1e6, Math.max(0.000001, g.frequencyMHz || 1)));
  const slowestGateNs = gatePeriodsNs.length ? Math.max(...gatePeriodsNs) : 0;
  const spanNs = Number.isFinite(forcedSpanNs) && forcedSpanNs > 0
    ? forcedSpanNs
    : 2 * Math.max(pulsePeriodNs, slowestGateNs);
  const phaseNs = Number.isFinite(pulse.phaseNs) ? pulse.phaseNs : 0;
  const gated = { ...pulse, gates };

  // Pulse arrivals inside the window, each scaled by what survived the gates.
  // Very dense trains are bounded so one window can't emit thousands of spikes.
  const maxPulses = 240;
  const first = Math.ceil(-phaseNs / pulsePeriodNs);
  const pulses = [];
  for (let k = first; pulses.length < maxPulses; k++) {
    const tNs = phaseNs + k * pulsePeriodNs;
    if (tNs > spanNs + 1e-9) break;
    if (tNs < -1e-9) continue;
    pulses.push({ tNs, amplitude: gates.length ? pulseTransmissionAt(gated, tNs) : 1 });
  }

  const count = Math.max(2, Math.min(600, Math.round(samples)));
  const envelope = [];
  for (let i = 0; i < count; i++) {
    const tNs = spanNs * i / (count - 1);
    envelope.push({
      tNs,
      value: gates.reduce((acc, gate) => acc * gateTransmissionAt(gate, tNs), 1),
    });
  }

  return {
    spanNs,
    repRateMHz,
    modulationMHz: slowestGateNs > 0 ? 1000 / slowestGateNs : null,
    truncated: pulses.length >= maxPulses,
    pulses,
    envelope,
  };
}

function finiteTrack(track) {
  return track && Array.isArray(track.pts) && Array.isArray(track.opls)
    && track.pts.length >= 2 && track.pts.length === track.opls.length
    && track.pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))
    && track.opls.every(Number.isFinite);
}

// Interpolate a world-space point and retain the segment coordinate for any
// local quantities (currently GDD) that evolve along the same traced segment.
function trackSampleAtOpticalPath(track, target) {
  if (!finiteTrack(track) || !Number.isFinite(target)) return null;
  const opls = track.opls;
  if (target < opls[0] - 1e-9 || target > opls.at(-1) + 1e-9) return null;
  for (let i = 0; i < opls.length - 1; i++) {
    const a = opls[i], b = opls[i + 1];
    if (target > b + 1e-9) continue;
    const span = b - a;
    const t = span > 1e-12 ? Math.min(1, Math.max(0, (target - a) / span)) : 0;
    const p = track.pts[i], q = track.pts[i + 1];
    const dx = q.x - p.x, dy = q.y - p.y;
    return {
      x: p.x + dx * t,
      y: p.y + dy * t,
      angle: Math.atan2(dy, dx) * 180 / Math.PI,
      segmentIndex: i,
      segmentT: t,
    };
  }
  return null;
}

// Interpolate a world-space point at an absolute optical path length.
export function pointAtOpticalPath(track, target) {
  const sample = trackSampleAtOpticalPath(track, target);
  return sample ? { x: sample.x, y: sample.y, angle: sample.angle } : null;
}

// The local temporal envelope represented at one position on a traced path.
// Only a transform-limited Gaussian has enough authored information for the
// second-order GDD formula to determine a duration. Other pulse shapes keep
// their configured width rather than receiving an invented chirp model.
function pulseEnvelopeAtSample(track, sample, target) {
  if (!sample || !track.pulse) return null;
  const inputPulseWidthFs = Math.min(1e9, Math.max(1, track.pulse.pulseWidthFs || 100));
  let gddFs2 = 0;
  let previous = null;
  for (const event of (Array.isArray(track.gddTrace) ? track.gddTrace : [])) {
    if (!Number.isFinite(event?.opl) || !Number.isFinite(event?.gdd)) continue;
    if (target < event.opl - 1e-9) {
      if (previous && event.linear === true && event.opl > previous.opl) {
        const t = Math.min(1, Math.max(0, (target - previous.opl) / (event.opl - previous.opl)));
        gddFs2 = previous.gdd + (event.gdd - previous.gdd) * t;
      } else if (previous) {
        gddFs2 = previous.gdd;
      }
      previous = null;
      break;
    }
    previous = event;
    gddFs2 = event.gdd;
  }
  const canDerive = track.pulse.transformLimited === true
    && (track.pulse.pulseShape || 'gauss') === 'gauss';
  const derived = canDerive
    ? gaussianPulseDurationAfterGDD(inputPulseWidthFs, gddFs2) : null;
  const pulseWidthFs = Number.isFinite(derived) ? derived : inputPulseWidthFs;
  const stretchFactor = pulseWidthFs / inputPulseWidthFs;
  return {
    gddFs2,
    inputPulseWidthFs,
    pulseWidthFs,
    stretchFactor,
    // Direct proportionality stays visually readable until packets would
    // dominate a whole bench. The real duration and factor remain un-clamped
    // on the marker for readback and detector reporting.
    visualStretch: Math.min(8, Math.max(1, stretchFactor)),
  };
}

export function pulseEnvelopeAtOpticalPath(track, target) {
  return pulseEnvelopeAtSample(track, trackSampleAtOpticalPath(track, target), target);
}

// Packet centres visible on one traced path at the requested simulation time.
// In physical mode, spacing and packet length use cT and c*tau. Schematic mode
// intentionally uses a fixed workbench-scale spacing while detector timing
// remains physical; the UI labels that distinction explicitly.
// How far apart packets are drawn along the path, in millimetres of optical
// path. The schematic spacing is an integer sub-multiple of the true one
// rather than a flat ~140 mm: packets stay visible on a bench-sized sketch,
// but a path difference of one whole repetition period still lands packets
// back on top of each other. That keeps the animation honest about
// synchronization — two beams that genuinely coincide in time always *look*
// coincident where they meet, which is how a delay line actually gets
// aligned. (Alignment is necessary rather than sufficient: every
// sub-multiple looks aligned too, and only the inspector's picosecond
// readout tells those apart.)
function packetSpacing(periodNs, physical, schematicSpacingMm) {
  const trueSpacing = C_MM_PER_NS * periodNs;
  if (physical) return trueSpacing;
  const divisions = Math.max(1, Math.round(trueSpacing / Math.max(20, schematicSpacingMm)));
  return trueSpacing / divisions;
}

export function pulseMarkers(track, timeNs, {
  mode = 'schematic',
  schematicSpacingMm = 140,
  schematicWidthMm = 12,
  maxMarkers = 80,
} = {}) {
  if (!finiteTrack(track) || !track.pulse || !Number.isFinite(timeNs)) return [];
  const repRateMHz = Math.min(1e6, Math.max(0.001, track.pulse.repRateMHz || 80));
  const periodNs = 1000 / repRateMHz;
  const physical = mode === 'physical';
  const spacing = packetSpacing(periodNs, physical, schematicSpacingMm);
  const speed = physical ? C_MM_PER_NS : spacing / periodNs;
  const phaseNs = Number.isFinite(track.pulse.phaseNs) ? track.pulse.phaseNs : 0;
  const phase = positiveMod((timeNs - phaseNs) * speed, spacing);
  const lo = track.opls[0], hi = track.opls.at(-1);
  const k0 = Math.ceil((lo - phase) / spacing);
  const k1 = Math.floor((hi - phase) / spacing);
  const count = Math.max(0, k1 - k0 + 1);
  // Extremely dense physical trains are sampled across the whole path. Keeping
  // only the last packets makes the visible workbench look empty near the source.
  const stride = count > maxMarkers ? Math.ceil(count / maxMarkers) : 1;
  const markers = [];
  for (let k = k0; k <= k1 && markers.length < maxMarkers; k += stride) {
    const opl = phase + k * spacing;
    const emissionTimeNs = timeNs - opl / speed;
    const activeGates = (track.pulse.gates || []).filter(gate => opl >= gate.opl);
    const transmission = pulseTransmissionAt({ ...track.pulse, gates: activeGates }, emissionTimeNs);
    if (transmission <= 0) continue;
    const point = trackSampleAtOpticalPath(track, opl);
    const envelope = pulseEnvelopeAtSample(track, point, opl);
    if (point && envelope) {
      const physicalWidthMm = C_MM_PER_NS * envelope.pulseWidthFs * 1e-6;
      const widthMm = physical
        ? physicalWidthMm
        : Math.max(2, schematicWidthMm * envelope.visualStretch);
      markers.push({
        x: point.x, y: point.y, angle: point.angle,
        opl, widthMm, physicalWidthMm, transmission,
        ...envelope,
      });
    }
  }
  return markers;
}

// Arrival events at one optical-path position between two display-clock times.
// This uses the same physical/schematic packet speed as `pulseMarkers`, so a
// deposited preview marker coincides with the animated packet reaching a
// surface. Dense trains are bounded rather than trying to represent every
// physical pulse in a single animation frame.
export function pulseArrivalsAtPath(track, fromTimeNs, toTimeNs, targetOpl, {
  mode = 'schematic',
  schematicSpacingMm = 140,
  maxEvents = 96,
} = {}) {
  if (!finiteTrack(track) || !track.pulse || !Number.isFinite(fromTimeNs)
      || !Number.isFinite(toTimeNs) || !Number.isFinite(targetOpl)
      || toTimeNs <= fromTimeNs || targetOpl < track.opls[0] - 1e-9
      || targetOpl > track.opls.at(-1) + 1e-9) return [];
  const repRateMHz = Math.min(1e6, Math.max(0.001, track.pulse.repRateMHz || 80));
  const periodNs = 1000 / repRateMHz;
  const physical = mode === 'physical';
  const spacing = packetSpacing(periodNs, physical, schematicSpacingMm);
  const speed = physical ? C_MM_PER_NS : spacing / periodNs;
  const phaseNs = Number.isFinite(track.pulse.phaseNs) ? track.pulse.phaseNs : 0;
  const firstArrival = phaseNs + targetOpl / speed;
  const firstIndex = Math.floor((fromTimeNs - firstArrival) / periodNs) + 1;
  const lastIndex = Math.floor((toTimeNs - firstArrival + 1e-9) / periodNs);
  if (lastIndex < firstIndex) return [];
  const total = lastIndex - firstIndex + 1;
  const stride = total > maxEvents ? Math.ceil(total / maxEvents) : 1;
  const activeGates = (track.pulse.gates || []).filter(gate => targetOpl + 1e-9 >= gate.opl);
  const arrivals = [];
  for (let i = firstIndex; i <= lastIndex && arrivals.length < maxEvents; i += stride) {
    const timeNs = firstArrival + i * periodNs;
    const emissionTimeNs = timeNs - targetOpl / speed;
    const transmission = pulseTransmissionAt({ ...track.pulse, gates: activeGates }, emissionTimeNs);
    if (transmission > 1e-9) arrivals.push({ timeNs, transmission });
  }
  return arrivals;
}
