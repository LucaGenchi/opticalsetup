// Pure helpers for pulse timing and canvas-only packet visualization.
// Optical path lengths are expressed in millimetres and time in nanoseconds.

export const C_MM_PER_NS = 299.792458;

const positiveMod = (value, modulus) => ((value % modulus) + modulus) % modulus;

function gateTransmission(gate, emissionTimeNs) {
  if (!Number.isFinite(gate?.opl) || !Number.isFinite(emissionTimeNs)) return 1;
  const frequencyMHz = Math.min(1e6, Math.max(0.000001, gate.frequencyMHz || 1));
  const periodNs = 1000 / frequencyMHz;
  const duty = Math.min(1, Math.max(0, gate.duty ?? 0.5));
  const arrivalNs = emissionTimeNs + gate.opl / C_MM_PER_NS;
  const phase = positiveMod(arrivalNs - (gate.phaseNs || 0), periodNs) / periodNs;
  let transmission;
  if (gate.shape === 'sine') {
    const depth = Math.min(1, Math.max(0, gate.depth ?? 1));
    transmission = 1 - depth * (1 - Math.cos(2 * Math.PI * phase)) / 2;
  } else {
    transmission = phase < duty ? 1 : 0;
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
  const transmissionAt = timeNs => gates.reduce((value, gate) => value * gateTransmission(gate, timeNs), 1);
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

function finiteTrack(track) {
  return track && Array.isArray(track.pts) && Array.isArray(track.opls)
    && track.pts.length >= 2 && track.pts.length === track.opls.length
    && track.pts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))
    && track.opls.every(Number.isFinite);
}

// Interpolate a world-space point at an absolute optical path length.
export function pointAtOpticalPath(track, target) {
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
    };
  }
  return null;
}

// Packet centres visible on one traced path at the requested simulation time.
// In physical mode, spacing and packet length use cT and c*tau. Schematic mode
// intentionally uses a fixed workbench-scale spacing while detector timing
// remains physical; the UI labels that distinction explicitly.
export function pulseMarkers(track, timeNs, {
  mode = 'schematic',
  schematicSpacingMm = 140,
  schematicWidthMm = 12,
  maxMarkers = 80,
} = {}) {
  if (!finiteTrack(track) || !track.pulse || !Number.isFinite(timeNs)) return [];
  const repRateMHz = Math.min(1e6, Math.max(0.001, track.pulse.repRateMHz || 80));
  const pulseWidthFs = Math.min(1e9, Math.max(1, track.pulse.pulseWidthFs || 100));
  const periodNs = 1000 / repRateMHz;
  const physical = mode === 'physical';
  const spacing = physical ? C_MM_PER_NS * periodNs : Math.max(20, schematicSpacingMm);
  const speed = physical ? C_MM_PER_NS : spacing / periodNs;
  const width = physical ? C_MM_PER_NS * pulseWidthFs * 1e-6 : Math.max(2, schematicWidthMm);
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
    const point = pointAtOpticalPath(track, opl);
    if (point) markers.push({
      ...point, opl, widthMm: width,
      physicalWidthMm: C_MM_PER_NS * pulseWidthFs * 1e-6,
      transmission,
    });
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
  const spacing = physical ? C_MM_PER_NS * periodNs : Math.max(20, schematicSpacingMm);
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
