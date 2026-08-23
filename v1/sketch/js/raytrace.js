// 2D ray-tracing engine.
// Builds world-space surfaces from elements, propagates rays from every source,
// and returns drawables: stroked polylines (line-mode / beam edges) and filled
// polygons (beam-mode envelope between the two edge rays).

import {
  registry, OBJ_SHAPES, EPI_CAPABLE_KINDS as EPI_KINDS, MIXING_KINDS,
  ISOTROPIC_KINDS, MODIFIER_KINDS, EMISSION_ORDER, EMISSION_OFFSET_NM,
  sumFrequencyWl, carsAntiStokesWl, ramanShifts, ramanStokesWl,
  drivingExcitationWl, channelNeedsExcitationProbe, specimenTypeOf,
  fluorophoreSpec, fluorophoreAbsorption,
} from './elements.js';
import { toLocal, toWorld, rotPt, dot, sub, add, mul, norm, perp, wavelengthToColor, D2R, distToSegment } from './util.js';
import { C_MM_PER_NS, pulseGateTransmission, pulseOverlap } from './pulses.js';

// Fixed, readable chunk period for a chopped CW beam (mm). The wheel's real
// period is Hz-to-kHz scale, so c·period would be light-seconds long — this
// mirrors the same schematic-spacing convention already used by pulse
// markers: an on-screen-legible constant, not a physically scaled distance.
const CHOP_SCHEMATIC_PERIOD_MM = 14;
import {
  linearStokes, cloneStokes, retarder as applyRetarder, analyzerTransmission,
  legacyPolarization, polarizationDescription,
} from './polarization.js';
import { arcParameterAtPoint, circularArcThrough } from './polygon.js';
import { glassIndex, isDispersiveGlass } from './glass.js';
import {
  gaussianSpectrum, flatSpectrum, spectrumSamples, applyTransmission, resolveSourceSpectrum,
} from './spectrum.js';

// polylines from the most recent traceAll, kept for beam probes
let lastPaths = [];
let lastSignalHits = [];
let detectorHits = new Map();
let gateTransmissionCache = new Map();
// Non-null only during the mixing probe pass in traceScene(): surface id ->
// Set of wavelengths observed arriving at that specimen.
let specimenProbe = null;
// element id -> wavelengths observed arriving at its specimen surface on the
// last trace. Read by the inspector to derive emission defaults and warn
// about channels the bench cannot drive; empty when nothing illuminates it.
let specimenIncident = new Map();

export function specimenIncidentWls(elementId) {
  return (specimenIncident.get(elementId) || []).map(b => b.wl);
}

// The full incident record — wavelength, path length and pulse train — used
// by the inspector to report how far apart two beams arrive.
export function specimenIncidentBeams(elementId) {
  return specimenIncident.get(elementId) || [];
}

// objective element id -> how wide the beam arriving at its back pupil was.
// Overfilling the back pupil is deliberate practice — it is how you actually
// reach the full rated NA — so the interesting number is what it costs.
let objectivePupilHits = new Map();

function recordObjectivePupil(elementId, radius, pupilRadius) {
  if (!elementId || !Number.isFinite(radius) || !Number.isFinite(pupilRadius)) return;
  const seen = objectivePupilHits.get(elementId);
  if (!seen) objectivePupilHits.set(elementId, { pupilRadius, beamRadius: radius });
  else seen.beamRadius = Math.max(seen.beamRadius, radius);
}

export function objectivePupilFill(elementId) {
  const seen = objectivePupilHits.get(elementId);
  if (!seen || seen.pupilRadius <= 0) return null;
  const fill = seen.beamRadius / seen.pupilRadius;
  // Uniform round beam through a round stop: the surviving fraction is the
  // area ratio. Qualitative, like every other power number here, but it gets
  // the shape of the trade right — doubling the fill costs three quarters.
  const transmitted = fill <= 1 ? 1 : 1 / (fill * fill);
  return {
    pupilDiameter: 2 * seen.pupilRadius,
    beamDiameter: 2 * seen.beamRadius,
    fill,
    transmitted,
  };
}

function hexChannels(color) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  return match ? match.slice(1).map(channel => parseInt(channel, 16)) : [255, 255, 255];
}

// Add wavelength colors in display space. This is intentionally a qualitative
// visualization of ray composition, not a calibrated camera response curve.
function mixedWavelengthColor(hits) {
  if (!hits?.length) return '#d8e7ee';
  let red = 0, green = 0, blue = 0;
  for (const hit of hits) {
    const weight = Math.max(0, Number.isFinite(hit.power) ? hit.power : 0);
    const [r, g, b] = hexChannels(wavelengthToColor(hit.wl));
    red += r * weight;
    green += g * weight;
    blue += b * weight;
  }
  const peak = Math.max(red, green, blue, 1e-9);
  const channel = value => Math.round(255 * value / peak).toString(16).padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

// Wavefront convergence straight from the traced ray slopes at the face.
// Fitting ray angle against ray height is size-independent and stays valid
// through a focus, unlike differencing the beam's drawn width between two
// planes (which quantizes to noise wherever the beam is narrow).
function detectorConvergence(hits) {
  const pts = [];
  for (const h of hits) {
    if (!Number.isFinite(h.dx) || !Number.isFinite(h.tx)) continue;
    const tlen = Math.hypot(h.tx, h.ty);
    if (!(tlen > 1e-9)) continue;
    const tx = h.tx / tlen, ty = h.ty / tlen;   // unit tangent (across the face)
    const along = h.dx * tx + h.dy * ty;         // transverse direction component
    const axial = h.dx * -ty + h.dy * tx;        // component along the face normal
    pts.push({
      height: (h.u - 0.5) * (h.aperture || tlen),
      theta: Math.atan2(along, Math.abs(axial)),
    });
  }
  if (pts.length < 2) return null;
  const n = pts.length;
  const mh = pts.reduce((s, p) => s + p.height, 0) / n;
  const mt = pts.reduce((s, p) => s + p.theta, 0) / n;
  let num = 0, den = 0;
  for (const p of pts) { num += (p.height - mh) * (p.theta - mt); den += (p.height - mh) ** 2; }
  if (!(den > 1e-12)) return null; // every ray at the same height: nothing to fit
  const slope = num / den; // radians of tilt per mm of height
  const heights = pts.map(p => p.height);
  const span = Math.max(...heights) - Math.min(...heights);
  return {
    slopePerMm: slope,
    fullAngleDeg: Math.abs(slope) * span * 180 / Math.PI,
    diverging: slope > 0,
  };
}

const MAX_SPECTRUM_SAMPLES = 24;

// Reduce a broadband profile to a bounded number of samples by merging
// neighbours. Grouping only ever merges adjacent wavelengths, so a bucket
// holding more than one really does span a range of colours.
function bucketize(ordered, limit) {
  if (ordered.length <= limit) return ordered;
  const stride = ordered.length / limit;
  return Array.from({ length: limit }, (_, index) => {
    const start = Math.floor(index * stride);
    const end = Math.max(start + 1, Math.floor((index + 1) * stride));
    const group = ordered.slice(start, end);
    const power = group.reduce((sum, sample) => sum + sample.power, 0);
    const wavelength = power > 0
      ? group.reduce((sum, sample) => sum + sample.wavelength * sample.power, 0) / power
      : group[0].wavelength;
    return {
      wavelength, power,
      continuum: group.length > 1 || group.some(sample => sample.continuum),
      sourceId: group[0].sourceId,
      // Merged bins span from the first sample to the last, plus one bin.
      widthNm: group.length > 1
        ? Math.abs(group[group.length - 1].wavelength - group[0].wavelength) + (group[0].widthNm || 0)
        : group[0].widthNm,
    };
  });
}

function bucketizeSpectrum(samples) {
  const ordered = [...samples.values()].sort((a, b) => a.wavelength - b.wavelength);
  // Discrete lines are summarized separately from any continuum, so a laser
  // line alongside a broadband source is never averaged into the band — it
  // is a peak at one wavelength, not part of a smear across a range. Bands
  // are summarized per source for the same reason, and only the weakest
  // lines are dropped if there are somehow too many.
  const lines = ordered.filter(sample => !sample.continuum);
  const band = ordered.filter(sample => sample.continuum);
  const bySource = new Map();
  for (const sample of band) {
    const list = bySource.get(sample.sourceId) || [];
    list.push(sample);
    bySource.set(sample.sourceId, list);
  }
  const perSourceLimit = Math.max(4, Math.floor(MAX_SPECTRUM_SAMPLES / Math.max(1, bySource.size)));
  const keptBand = [...bySource.values()].flatMap(list => bucketize(list, perSourceLimit));
  const keptLines = lines.length <= MAX_SPECTRUM_SAMPLES
    ? lines
    : [...lines].sort((a, b) => b.power - a.power).slice(0, MAX_SPECTRUM_SAMPLES);
  return [...keptBand, ...keptLines]
    .sort((a, b) => a.wavelength - b.wavelength)
    .map(sample => ({ ...sample, color: wavelengthToColor(sample.wavelength) }));
}

function addSample(samples, wl, power, continuum = false, sourceId = null, widthNm = null) {
  // Keyed by source as well as wavelength: the spectrometer's relative mode
  // scales each source's own contribution to its own peak, which it cannot
  // do once two sources at the same colour have been added together.
  const wavelength = Math.round(wl * 10) / 10;
  const key = `${sourceId || ''}|${wavelength}`;
  const sample = samples.get(key)
    || { wavelength, power: 0, continuum: false, sourceId: sourceId || null, widthNm: null };
  sample.power += power;
  if (continuum) sample.continuum = true;
  if (widthNm > 0) sample.widthNm = Math.max(sample.widthNm || 0, widthNm);
  samples.set(key, sample);
}

// The tracer only ever traces one geometric ray per spatial sample — a
// broadband source's actual spectral shape (Gaussian laser line, flat
// supercontinuum, or whatever survived a filter) is carried analytically as
// `hit.spec`, not by physically splitting the ray into wavelength samples.
// Without expanding it here, a spectrometer aimed straight at a broadband
// laser would show a single spike at its centre wavelength instead of the
// real curve.
// The spectral width one sample stands for, in nm. A broadband profile is
// sampled evenly across its span, so each sample owns one bin; a
// monochromatic ray owns nothing at all, and is reported as a true line for
// the display to render at whatever the instrument can resolve.
function profileBinWidth(profile) {
  if (!profile || profile.length < 2) return null;
  const first = profile[0].wl, last = profile[profile.length - 1].wl;
  return Math.abs(last - first) / (profile.length - 1) || null;
}

function detectorSpectrum(hits) {
  const samples = new Map();
  for (const hit of hits) {
    if (!Number.isFinite(hit.power) || hit.power <= 0) continue;
    if (hit.spec) {
      const profile = spectrumSamples(hit.spec, 48);
      if (profile) {
        const widthNm = profileBinWidth(profile);
        for (const { wl, weight } of profile) addSample(samples, wl, weight * hit.power, true, hit.sourceId, widthNm);
        continue;
      }
    }
    if (Number.isFinite(hit.wl)) addSample(samples, hit.wl, hit.power, false, hit.sourceId, null);
  }
  return bucketizeSpectrum(samples);
}

function averageGateTransmission(pulse) {
  if (!pulse?.gates?.length) return 1;
  // Every field that changes the waveform must be in the key. The two output
  // ports of a polarization-modulated PBS differ *only* by their high/low
  // levels, so omitting those made one port silently reuse the other's
  // cached average.
  const key = [pulse.repRateMHz, pulse.pulseWidthFs, pulse.phaseNs, ...pulse.gates.flatMap(g => [
    g.opl, g.frequencyMHz, g.duty, g.phaseNs, g.shape || 'square', g.depth ?? 1, g.invert ? 1 : 0,
    g.high ?? 1, g.low ?? 0,
  ])].join('|');
  if (!gateTransmissionCache.has(key)) gateTransmissionCache.set(key, pulseGateTransmission(pulse));
  return gateTransmissionCache.get(key);
}

function recordDetectorHit(ray, hit) {
  const id = hit.surface.el?.id;
  if (!id) return;
  if (!detectorHits.has(id)) detectorHits.set(id, []);
  const gateDuty = averageGateTransmission(ray.pulse);
  detectorHits.get(id).push({
    power: (Number.isFinite(ray.power) ? ray.power : ray.intensity) * gateDuty,
    intensity: ray.intensity,
    wl: ray.wl,
    bw: ray.bw || 0,
    spec: ray.spec || null,
    sourceId: ray.sourceId || null,
    pol: ray.pol,
    stokes: cloneStokes(ray.stokes),
    u: hit.u,
    // Ray direction at the face, plus the surface tangent, so a wavefront
    // sensor can read convergence from real ray slopes instead of trying to
    // difference the beam's drawn width between two planes.
    dx: ray.dx,
    dy: ray.dy,
    tx: hit.surface.b.x - hit.surface.a.x,
    ty: hit.surface.b.y - hit.surface.a.y,
    aperture: hit.surface.data.aperture || 0,
    detectorType: hit.surface.data.detectorType || 'Detector',
    readoutKind: registry[hit.surface.el?.type]?.readoutKind || 'detector',
    gain: hit.surface.data.gain,
    saturation: hit.surface.data.saturation,
    pixels: hit.surface.data.pixels,
    pathDelayNs: Number.isFinite(ray.opl) ? ray.opl / C_MM_PER_NS : 0,
    pulse: ray.pulse ? { ...ray.pulse } : null,
  });
}

// Qualitative measurement at a one-sided detector face. `signal` is relative
// ray weight, intentionally not calibrated optical power.
export function detectorReading(elementId) {
  const hits = detectorHits.get(elementId) || [];
  if (!hits.length) return null;
  // A fully blocked pulse can still geometrically reach the detector. It must
  // not contaminate spectrum, polarization, spot, timing, or source counts.
  const activeHits = hits.filter(h => Number.isFinite(h.power) && h.power > 1e-12);
  const signal = activeHits.reduce((sum, h) => sum + Math.max(0, h.power), 0);
  if (signal <= 1e-12) return null;
  const wavelength = activeHits.reduce((sum, h) => sum + h.wl * h.power, 0) / signal;
  const bandMin = Math.min(...activeHits.map(h => h.wl - h.bw / 2));
  const bandMax = Math.max(...activeHits.map(h => h.wl + h.bw / 2));
  const us = activeHits.map(h => h.u);
  const aperture = Math.max(...activeHits.map(h => h.aperture || 0));
  const spotSpan = aperture * (Math.max(...us) - Math.min(...us));
  const detectorType = activeHits[0].detectorType || 'Detector';
  const readoutKind = activeHits[0].readoutKind || 'detector';
  let outputSignal = signal, saturated = false, profile = null, profileColors = null, centroid = null;
  if (readoutKind === 'pmt') {
    const gain = Math.max(1, activeHits[0].gain || 1);
    const saturation = Math.max(1, activeHits[0].saturation || 100);
    outputSignal = Math.min(saturation, signal * gain);
    saturated = signal * gain >= saturation;
  } else if (readoutKind === 'camera') {
    const count = Math.min(64, Math.max(8, Math.round(activeHits[0].pixels || 16)));
    profile = Array(count).fill(0);
    const profileHits = Array.from({ length: count }, () => []);
    for (const h of activeHits) {
      const i = Math.min(count - 1, Math.max(0, Math.floor(h.u * count)));
      profile[i] += Math.max(0, h.power || 0);
      profileHits[i].push(h);
    }
    profileColors = profileHits.map(hitsInBin => hitsInBin.length ? mixedWavelengthColor(hitsInBin) : null);
    const total = profile.reduce((sum, value) => sum + value, 0);
    if (total > 0) centroid = profile.reduce((sum, value, i) => sum + value * ((i + 0.5) / count - 0.5) * aperture, 0) / total;
  }
  const stokesHits = activeHits.filter(h => h.stokes);
  const numericPol = activeHits.filter(h => typeof h.pol === 'number').map(h => h.pol);
  let polarization = 'Unpolarized';
  if (stokesHits.length === activeHits.length) {
    const sw = stokesHits.reduce((sum, h) => sum + Math.max(0, h.power), 0);
    const mixed = {
      s1: stokesHits.reduce((sum, h) => sum + h.stokes.s1 * h.power, 0) / sw,
      s2: stokesHits.reduce((sum, h) => sum + h.stokes.s2 * h.power, 0) / sw,
      s3: stokesHits.reduce((sum, h) => sum + h.stokes.s3 * h.power, 0) / sw,
    };
    polarization = polarizationDescription(mixed);
  } else if (activeHits.every(h => h.pol === 'c')) polarization = 'Circular';
  else if (numericPol.length === activeHits.length) {
    const lo = Math.min(...numericPol), hi = Math.max(...numericPol);
    polarization = hi - lo < 0.5 ? `Linear ${Math.round((lo + hi) / 2)}°` : 'Mixed linear';
  } else if (activeHits.some(h => h.pol !== undefined)) polarization = 'Mixed';
  const pulsed = activeHits.filter(h => h.pulse);
  let pulse = null;
  if (pulsed.length) {
    const delays = pulsed.map(h => h.pathDelayNs).filter(Number.isFinite);
    const first = pulsed[0].pulse;
    const trainMap = new Map();
    for (const h of pulsed) {
      const p = h.pulse;
      const key = p.sourceId || [p.repRateMHz, p.pulseWidthFs, p.phaseNs].join(':');
      if (!trainMap.has(key)) trainMap.set(key, {
        repRateMHz: p.repRateMHz,
        pulseWidthFs: p.pulseWidthFs,
        phaseNs: p.phaseNs,
        gates: Array.isArray(p.gates) ? p.gates.map(g => ({ ...g })) : [],
        pathDelayNs: h.pathDelayNs,
      });
    }
    const trains = [...trainMap.values()];
    const sources = new Set(pulsed.map(h => h.pulse.sourceId).filter(Boolean));
    const trainSettings = new Set(trains.map(p => [p.repRateMHz, p.pulseWidthFs, p.phaseNs].join(':')));
    const mixed = trainSettings.size > 1;
    pulse = {
      sources: Math.max(1, sources.size),
      mixed,
      repRateMHz: mixed ? null : first.repRateMHz,
      pulseWidthFs: mixed ? null : first.pulseWidthFs,
      phaseNs: mixed ? null : first.phaseNs,
      trains,
      earliestPathDelayNs: delays.length ? Math.min(...delays) : 0,
      arrivalSpreadPs: delays.length ? (Math.max(...delays) - Math.min(...delays)) * 1000 : 0,
    };
  }
  return {
    signal,
    samples: activeHits.length,
    wavelength,
    bandMin,
    bandMax,
    polarization,
    spotSpan,
    color: mixedWavelengthColor(activeHits),
    spectrum: detectorSpectrum(activeHits),
    convergence: detectorConvergence(activeHits),
    pulse,
    detectorType,
    readoutKind,
    outputSignal,
    saturated,
    profile,
    profileColors,
    centroid,
  };
}

// sample the beam nearest to (x,y): returns {wl, bw, pol, intensity} or null
export function probeAt(x, y, tol = 16) {
  let best = null, bd = tol;
  const p = { x, y };
  for (const r of lastPaths) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const dd = distToSegment(p, r.pts[i], r.pts[i + 1]);
      if (dd < bd) {
        bd = dd;
        best = { ...r, intensity: r.segmentIntensities?.[i] ?? r.intensity };
      }
    }
  }
  return best ? {
    wl: best.wl, bw: best.bw || 0, spec: best.spec || null, pol: best.pol,
    stokes: cloneStokes(best.stokes), intensity: best.intensity,
    // A polarization-modulated segment has no single meaningful state, so the
    // probe reports the alternation itself rather than its average.
    polMod: best.polMod || null,
  } : null;
}

export function signalHitsFromLastTrace(stageId) {
  return lastSignalHits.filter(hit => hit.stageId === stageId);
}

const MAXLEN = 6000, MAX_DEPTH = 60, MIN_INT = 0.02;

// Two beams count as "different colours" for wave mixing only if they are
// resolvably apart; the same laser sampled twice must not mix with itself.
const MIXING_MIN_SEPARATION_NM = 1;

// Incoherent emission (fluorescence, its multiphoton cousins, spontaneous
// Raman) is isotropic, but a microscope only ever collects the small solid
// angle its optics subtend — which sits on the beam axis, forward and back.
// Sampling that emission uniformly spends nearly every ray on directions no
// optic will ever see. These rays are instead drawn from a distribution
// denser along the axis, each still carrying an equal share of the power, so
// the total is unchanged and the directions that can actually be captured
// are the ones sampled finely. The glow is still drawn all the way round.
const EMISSION_RAYS = 20;
const RAMAN_RAYS_PER_LINE = 14;
const AXIS_BIAS = 5;
// How far the drawn glow reaches, and how far away an optic can still
// collect it. Real collection optics sit well outside the few centimetres
// the glow is drawn over, so the two are separate numbers.
const EMISSION_GLOW_MM = 25;
const EMISSION_CAPTURE_MM = 100;

// Angles sampled with density proportional to 1 + AXIS_BIAS * cos^2 around
// `axisAngle`, by inverting that distribution's CDF. Equal-probability
// sampling means every ray still carries the same power.
function emissionAngles(count, axisAngle, bias = AXIS_BIAS) {
  const total = 2 * Math.PI * (1 + bias / 2);
  // CDF of the density, measured from the axis direction.
  const cdf = u => (u * (1 + bias / 2) + bias * Math.sin(2 * u) / 4) / total;
  const angles = [];
  for (let i = 0; i < count; i++) {
    const target = (i + 0.5) / count;
    let lo = 0, hi = 2 * Math.PI;
    for (let step = 0; step < 40; step++) {
      const mid = (lo + hi) / 2;
      if (cdf(mid) < target) lo = mid; else hi = mid;
    }
    angles.push(axisAngle + (lo + hi) / 2);
  }
  return angles;
}
// Below this the two pulses barely meet and the signal is reported as absent
// rather than as a vanishing sliver.
const MIN_OVERLAP = 0.02;

// The wavelength one signal channel produces for a ray of wavelength rayWl.
// Single-beam channels scale the incident colour. Mixing channels (SFG,
// CARS) need a second, different colour present at the same spot, supplied
// by the caller as `incidentWls` — the wavelengths measured arriving at
// this specimen during the mixing probe pass in traceScene(). Returns null
// when the channel cannot produce anything for this ray, which is exactly
// what makes CARS/SFG silent under single-beam illumination.
// Stimulated Raman: a modulated beam drives gain on an unmodulated one at
// the same spot, so the modulation crosses over between colours without any
// new wavelength appearing. That is what makes SRS detectable at all — a
// photodiode on the receiving beam, read on the oscilloscope, sees a
// modulation that is only there because the specimen is Raman-active.
//
// The transferred gate copies the donor's timing verbatim (frequency, duty,
// phase and the optical path the modulation was imposed at) and swaps in a
// shallower depth, so the two trains stay phase-locked. This assumes the two
// sources are synchronous, which is what a real SRS setup arranges.
// Returns null when there is nothing to transfer.
// Record the colour and, for SRS, whatever intensity modulation this beam is
// already carrying, so the real pass afterwards can mix and transfer.
function recordProbeBeam(surface, ray) {
  let seen = specimenProbe.get(surface.id);
  if (!seen) specimenProbe.set(surface.id, seen = []);
  if (seen.some(b => Math.abs(b.wl - ray.wl) < 1e-9)) return;
  seen.push({
    wl: ray.wl, opl: ray.opl,
    pulse: ray.pulse ? { ...ray.pulse } : null,
    gates: (ray.pulse?.gates || []).map(g => ({ ...g })),
  });
}

function srsTransferGate(channel, ray, incidentBeams) {
  if ((ray.pulse?.gates || []).length) return null; // this beam is the donor
  const donor = (incidentBeams || []).find(b =>
    Math.abs(b.wl - ray.wl) >= MIXING_MIN_SEPARATION_NM && b.gates?.length);
  if (!donor) return null;
  // Both pulses must be at the spot together for the interaction to happen.
  const overlap = channelOverlap(channel, ray, donor);
  if (overlap < MIN_OVERLAP) return null;
  const source = donor.gates[donor.gates.length - 1];
  const depth = Math.min(0.5, Math.max(0.01, channel.transferEff ?? 0.1)) * overlap;
  // The two beams are not symmetric. Energy flows from the blue photon to
  // the red one, so when the PUMP (the shorter wavelength) carries the
  // modulation the Stokes beam is amplified while the pump is on — that is
  // stimulated Raman GAIN, and the receiving beam rises above its
  // unmodulated level. When the STOKES beam carries it, the pump is
  // depleted while the Stokes is on — stimulated Raman LOSS, a dip. Both
  // excursions happen during the donor's own "on" half, so they differ in
  // sign, not in phase.
  const receiverIsStokes = donor.wl < ray.wl;
  return {
    opl: source.opl, frequencyMHz: source.frequencyMHz, duty: source.duty,
    phaseNs: source.phaseNs, shape: source.shape, depth, invert: false,
    high: receiverIsStokes ? 1 + depth : 1 - depth,
    low: 1,
  };
}

// How much of a two-beam signal survives the arrival mismatch between the
// beams driving it. Channels can opt out, for a schematic that is about the
// signal rather than about timing.
function channelOverlap(channel, ray, partner) {
  if (!partner || channel.requireOverlap === false) return 1;
  return pulseOverlap({ opl: ray.opl, pulse: ray.pulse }, partner).factor;
}

// The incident beam a mixing channel pairs the current ray with: the longest
// wavelength present, matching how specimenSignalWl picks the Stokes partner.
function mixingPartner(ray, incidentBeams) {
  let best = null;
  for (const beam of incidentBeams || []) {
    if (Math.abs(beam.wl - ray.wl) < MIXING_MIN_SEPARATION_NM) continue;
    if (!best || beam.wl > best.wl) best = beam;
  }
  return best;
}

// The drawing color of one signal channel: true to its own wavelength by
// default, or a custom tint so several channels can be told apart on a busy
// multimodal sketch. Mirrors the laser's own auto/custom color toggle.
export function channelColor(channel, wl) {
  return channel.autoColor === false && channel.color ? channel.color : wavelengthToColor(wl);
}

// What one emission channel actually radiates: its band and how strongly it
// is driven. A named fluorophore emits its own band and is excited according
// to how well the beam matches its absorption; "custom" keeps the generic
// behavior of absorbing whatever arrives and emitting a line one Stokes
// offset above it. Returns null when nothing is emitted at all.
export function specimenEmission(channel, rayWl, incidentWls) {
  const order = EMISSION_ORDER[channel.kind];
  if (!order) return null;
  const excitation = drivingExcitationWl(incidentWls) ?? rayWl;
  const spec = fluorophoreSpec(channel.fluorophore);
  const gain = fluorophoreAbsorption(channel.fluorophore, excitation, order);
  if (spec) {
    // A dye emits its own band wherever it is excited from; only how
    // strongly changes. A manual wavelength still overrides the label.
    const wl = channel.autoWl === false ? channel.wl : spec.emPeak;
    if (!(wl > excitation / order)) return null;
    return { wl, bw: spec.emFwhm, spec: gaussianSpectrum(wl, spec.emFwhm), gain };
  }
  const wl = specimenSignalWl(channel, rayWl, incidentWls);
  return wl > 0 ? { wl, bw: 0, spec: null, gain: 1 } : null;
}

export function specimenSignalWl(channel, rayWl, incidentWls) {
  if (!(rayWl > 0)) return null;
  if (channel.kind === 'shg') return rayWl / 2;
  if (channel.kind === 'thg') return rayWl / 3;
  // Incoherent emission: one photon (fluorescence) or several combined
  // (2PEF/3PEF) are absorbed and one longer-wavelength photon comes back
  // out. The emitted photon must be the less energetic one, so a manual
  // wavelength below excitation/order is unphysical and emits nothing —
  // the inspector warns about exactly this case (see channelWarning).
  const order = EMISSION_ORDER[channel.kind];
  if (order) {
    const excitation = drivingExcitationWl(incidentWls) ?? rayWl;
    const floor = excitation / order;
    if (channel.autoWl === false) return channel.wl > floor ? channel.wl : null;
    return floor + EMISSION_OFFSET_NM;
  }
  if (!MIXING_KINDS.has(channel.kind)) return null;
  if (channel.kind === 'cars' && channel.autoWl === false) return channel.wl > 0 ? channel.wl : null;
  const partners = (incidentWls || []).filter(w => w > 0 && Math.abs(w - rayWl) >= MIXING_MIN_SEPARATION_NM);
  if (!partners.length) return null;
  // Emit once per pair rather than once per ray: only the shorter-wavelength
  // (pump) beam of a pair drives the mixing, so a two-colour spot produces
  // one anti-Stokes/sum-frequency signal, not one from each beam.
  const partner = partners.reduce((a, b) => (b > a ? b : a), partners[0]);
  if (rayWl > partner) return null;
  return channel.kind === 'sfg' ? sumFrequencyWl(rayWl, partner) : carsAntiStokesWl(rayWl, partner);
}

function fiberEndDirection(pts, end, outward = false) {
  const j = end === 0 ? 0 : pts.length - 1;
  const step = end === 0 ? 1 : -1;
  const e = pts[j];
  for (let i = j + step; i >= 0 && i < pts.length; i += step) {
    const q = pts[i];
    const v = outward ? sub(e, q) : sub(q, e);
    if (Math.hypot(v.x, v.y) > 1e-6) return norm(v);
  }
  return null;
}

function polylineLength(pts) {
  let length = 0;
  for (let i = 0; i < pts.length - 1; i++) length += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  return length;
}

function buildSurfaces(elements, beams) {
  const list = [];
  let sid = 0;
  for (const el of elements) {
    const def = registry[el.type];
    if (!def || !def.surfaces) continue;
    for (const s of def.surfaces(el)) {
      const a = toWorld(el, s.x1, s.y1);
      const b = toWorld(el, s.x2, s.y2);
      const data = { ...(s.data || {}) };
      if (data.arcPoint) {
        const through = toWorld(el, data.arcPoint.x, data.arcPoint.y);
        const arc = circularArcThrough(a, through, b);
        if (arc) data.arc = arc;
        delete data.arcPoint;
      }
      list.push({
        id: sid++,
        a, b, kind: s.kind, data, el,
      });
    }
  }
  // fiber connectors: the tip face couples (or blocks) the beam, the body absorbs
  for (const b of beams || []) {
    if (b.kind !== 'fiber' || b.pts.length < 2) continue;
    const W = (b.width || 4) + 6;
    for (const end of [0, 1]) {
      const e = b.pts[end === 0 ? 0 : b.pts.length - 1];
      const dir = fiberEndDirection(b.pts, end); // into the cable
      if (!dir) continue;
      const pn = perp(dir);
      const e2 = add(e, mul(dir, 15));
      const c1 = add(e, mul(pn, W / 2)), c2 = add(e, mul(pn, -W / 2));
      const c3 = add(e2, mul(pn, W / 2)), c4 = add(e2, mul(pn, -W / 2));
      list.push({ id: sid++, a: c1, b: c2, kind: 'fiberin', data: { beam: b, end }, el: null });
      list.push({ id: sid++, a: c1, b: c3, kind: 'absorb', data: {}, el: null });
      list.push({ id: sid++, a: c2, b: c4, kind: 'absorb', data: {}, el: null });
      list.push({ id: sid++, a: c3, b: c4, kind: 'absorb', data: {}, el: null });
    }
  }
  return list;
}

// rays emitted from the far end of a fiber that received light.
// Each end has its own output spec (out0 / out1), so behavior can differ
// between the two connectors and coupling works in both directions.
function fiberEmissionRays(c) {
  const b = c.beam, pts = b.pts;
  const outEnd = c.end === 0 ? 1 : 0;
  const j = outEnd === 0 ? 0 : pts.length - 1;
  const e = pts[j];
  const dir = fiberEndDirection(pts, outEnd, true); // out of the connector
  if (!dir) return [];
  // Just past the tip, not visually clear of it: nearestHit() already
  // ignores any surface within 0.05 mm of a ray's own origin, so this only
  // needs to clear that margin, not the fiber's drawn body. The old 2 mm
  // push left a visible dead gap between the connector and where the beam
  // appeared to start.
  const o = add(e, mul(dir, 0.1));
  const cfg = b['out' + outEnd] || { mode: b.outMode || 'diverge', na: b.na, focal: b.focal, dia: b.outDia };
  const K = 9, rays = [];
  const ng = Math.min(2.2, Math.max(1, b.groupIndex || 1.468));
  const lossDbPerM = Math.min(100, Math.max(0, b.lossDbPerM ?? 0.2));
  const lengthMm = polylineLength(pts);
  const transmission = 10 ** (-(lossDbPerM * lengthMm / 1000) / 10);
  const common = {
    wl: c.wl, bw: c.bw || 0, spec: c.spec || null, speckle: false, intensity: Math.min(1, c.intensity * transmission),
    power: Number.isFinite(c.power) ? c.power * transmission / K : undefined,
    pol: c.pol, stokes: cloneStokes(c.stokes), pulse: c.pulse, sourceId: c.sourceId || null,
    oplStart: (c.opl || 0) + lengthMm * ng + 2,
  };
  if (cfg.mode === 'focus') {
    const f = Math.max(2, cfg.focal || 20), ap = Math.max(1, cfg.dia || 6);
    const pn = perp(dir);
    const fp = add(o, mul(dir, f));
    for (let i = 0; i < K; i++) {
      const src = add(o, mul(pn, -ap / 2 + ap * i / (K - 1)));
      const d = norm(sub(fp, src));
      rays.push({ ...common, x: src.x, y: src.y, dx: d.x, dy: d.y, sample: i });
    }
  } else {
    // gaussian-like cone from the fiber core, half-angle asin(NA)
    const half = Math.asin(Math.min(0.95, Math.max(0.01, cfg.na || 0.12)));
    for (let i = 0; i < K; i++) {
      const d = rotv(dir, -half + 2 * half * i / (K - 1));
      rays.push({ ...common, x: o.x, y: o.y, dx: d.x, dy: d.y, sample: i });
    }
  }
  return rays;
}

// slice the envelope strip between polylines A and B into "on" quads
function chopStrip(A, B, period, duty) {
  const lerpP = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const polys = [];
  const n = Math.min(A.length, B.length);
  let phase = 0;
  for (let j = 0; j < n - 1 && polys.length < 300; j++) {
    const a0 = A[j], a1 = A[j + 1], b0 = B[j], b1 = B[j + 1];
    const L = Math.hypot(a1.x - a0.x, a1.y - a0.y);
    if (L < 1e-6) continue;
    let s = 0;
    while (s < L && polys.length < 300) {
      const ip = (phase + s) % period;
      const on = ip < period * duty;
      const segEnd = Math.min(L, s + (on ? period * duty - ip : period - ip));
      if (on) {
        const t0 = s / L, t1 = segEnd / L;
        polys.push([lerpP(a0, a1, t0), lerpP(a0, a1, t1), lerpP(b0, b1, t1), lerpP(b0, b1, t0)]);
      }
      s = segEnd + 1e-6;
    }
    phase = (phase + L) % period;
  }
  return polys;
}

function rayArcHit(p, d, surface) {
  const arc = surface.data.arc;
  const dx = p.x - arc.cx, dy = p.y - arc.cy;
  const a = dot(d, d);
  const b = 2 * (dx * d.x + dy * d.y);
  const c = dx * dx + dy * dy - arc.r * arc.r;
  let discriminant = b * b - 4 * a * c;
  if (!Number.isFinite(discriminant) || discriminant < -1e-8 || a <= 1e-12) return null;
  discriminant = Math.max(0, discriminant);
  const root = Math.sqrt(discriminant);
  const roots = [(-b - root) / (2 * a), (-b + root) / (2 * a)].sort((x, y) => x - y);
  for (const t of roots) {
    if (t < 0.05) continue;
    const point = add(p, mul(d, t));
    const u = arcParameterAtPoint(arc, point, 1e-7);
    if (u !== null) return { t, u, p: point };
  }
  return null;
}

function rayLineHit(p, d, surface) {
  const e = sub(surface.b, surface.a);
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-9) return null;
  const dp = sub(surface.a, p);
  const t = (dp.x * e.y - dp.y * e.x) / den;
  const u = (dp.x * d.y - dp.y * d.x) / den;
  if (t < 0.05 || u < 0 || u > 1) return null;
  return { t, u, p: add(p, mul(d, t)) };
}

// nearest intersection of ray (p,d) with surfaces, ignoring the immediately
// departed straight segment. Curved surfaces remain eligible because a ray can
// legitimately meet another part of the same arc after entering or reflecting.
function nearestHit(p, d, surfaces, skip) {
  let best = null;
  for (const s of surfaces) {
    if (s === skip && !s.data.arc) continue;
    const candidate = s.data.arc ? rayArcHit(p, d, s) : rayLineHit(p, d, s);
    if (!candidate) continue;
    if (!best || candidate.t < best.t - 1e-8) {
      best = { ...candidate, surface: s, ambiguous: false };
    } else if (Math.abs(candidate.t - best.t) <= 1e-8
        && s.kind === 'refract' && best.surface.kind === 'refract'
        && s.el?.id && s.el.id === best.surface.el?.id
        && (candidate.u < 1e-7 || candidate.u > 1 - 1e-7 || best.u < 1e-7 || best.u > 1 - 1e-7)) {
      // At an exact boundary corner either face normal would be arbitrary.
      // Mark the hit so the tracer can terminate safely at the vertex.
      best.ambiguous = true;
    }
  }
  return best;
}

const reflect = (d, n) => sub(d, mul(n, 2 * dot(d, n)));
const rotv = (d, a) => ({ x: d.x * Math.cos(a) - d.y * Math.sin(a), y: d.x * Math.sin(a) + d.y * Math.cos(a) });

// Vector form of Snell's law. The supplied segment normal can point either
// way; orient it toward the incident medium before solving for transmission.
// null means total internal reflection.
function refract(d, surfaceNormal, n1, n2) {
  let n = norm(surfaceNormal);
  if (dot(d, n) > 0) n = mul(n, -1);
  const eta = n1 / n2;
  const cosI = Math.max(0, -dot(d, n));
  const k = 1 - eta * eta * (1 - cosI * cosI);
  if (k < 0) return null;
  return norm(add(mul(d, eta), mul(n, eta * cosI - Math.sqrt(k))));
}

// deterministic jitter in [-0.5, 0.5) from integer keys — keeps speckle stable
// across re-renders instead of flickering
function jitter(k1, k2) {
  const h = Math.sin((k1 + 1) * 12.9898 + (k2 + 1) * 78.233) * 43758.5453;
  return h - Math.floor(h) - 0.5;
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// speckle grains scattered along a polyline
function speckleDots(pts, width, seed, maxDots = 220) {
  const rng = mulberry32(seed);
  const dots = [];
  for (let i = 0; i < pts.length - 1 && dots.length < maxDots; i++) {
    const a = pts[i], b = pts[i + 1];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-6) continue;
    const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
    let step = 3.5;
    for (let s = 2; s < L && dots.length < maxDots; s += step) {
      if (rng() < 0.75) {
        const off = (rng() - 0.5) * width;
        dots.push({
          x: a.x + ux * s - uy * off, y: a.y + uy * s + ux * off,
          r: 0.5 + rng() * 0.9, o: 0.25 + rng() * 0.6,
        });
      }
      step *= 1.015; // grains thin out with distance
    }
  }
  return dots;
}

// parallel copy of a polyline offset by d along the local normal
function offsetPolyline(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const t = norm(sub(b, a)), n = perp(t);
    return { x: p.x + n.x * d, y: p.y + n.y * d };
  });
}

// broadband rays expand into wavelength samples at dispersive elements
// (prism/grating). Each sample carries a weight (summing to 1) so a Gaussian
// laser line disperses into a fan that is genuinely brighter near its centre
// wavelength, not spread evenly across the box — spectrumSamples() already
// falls back to uniform weights for a flat (supercontinuum) spectrum, so
// that case is unchanged.
function wlSamples(ray) {
  if (!ray.bw) return [{ wl: ray.wl, weight: 1 }];
  const K = ray.bw >= 200 ? 9 : 5;
  if (ray.spec) {
    const samples = spectrumSamples(ray.spec, K);
    if (samples) return samples;
  }
  const lo = ray.wl - ray.bw / 2, hi = ray.wl + ray.bw / 2;
  return Array.from({ length: K }, (_, i) => ({ wl: lo + (hi - lo) * i / (K - 1), weight: 1 / K }));
}

// thin-lens (paraxial) bend; also used for curved mirrors after reflection.
// hc offsets the lens center along the surface (for lenslet arrays).
function lensBend(dir, hitP, s, f, hc = 0) {
  const t = norm(sub(s.b, s.a));
  const n = perp(t);
  const sgn = dot(dir, n) >= 0 ? 1 : -1;
  const np = mul(n, sgn);
  const h = dot(sub(hitP, mul(add(s.a, s.b), 0.5)), t) - hc;
  const denom = dot(dir, np);
  if (Math.abs(denom) < 1e-6 || !f) return dir;
  const u = dot(dir, t) / denom;
  const u2 = u - h / f;
  return norm(add(np, mul(t, u2)));
}

function dichroicTransmits(wl, d) {
  if (d.dtype === 'longpass') return wl >= d.cutoff;
  if (d.dtype === 'shortpass') return wl <= d.cutoff;
  return Math.abs(wl - d.center) <= d.band / 2;
}

// transmission passband [lo, hi] of a filter/dichroic
function passbandOf(d) {
  const t = d.dtype || d.ftype;
  if (t === 'longpass') return [d.cutoff, 1e5];
  if (t === 'shortpass') return [0, d.cutoff];
  return [d.center - d.band / 2, d.center + d.band / 2];
}

const bandIntersect = (a, b) => {
  const lo = Math.max(a[0], b[0]), hi = Math.min(a[1], b[1]);
  return lo <= hi ? [lo, hi] : null;
};

// Fabry–Pérot transmission (Airy function), matched-reflectivity mirrors with
// a per-surface loss/absorption term. `cosTheta` is the ray's own incidence
// angle at the surface, not a stored parameter — tilting the element (or a
// ray simply arriving off-axis) shifts the resonance exactly like tilting a
// real etalon does, for free, via the round-trip phase below. Unlike a
// sequence of independent partial mirrors (which only ever sums intensities),
// this is the closed-form multi-beam-interference result: at resonance the
// reflected components from every internal bounce cancel and transmission
// climbs to the coating-limited peak even for high reflectivity.
function etalonAiryTransmission(wl, cosTheta, data) {
  const R = data.R;
  const oneMinusR = Math.max(1e-6, 1 - R);
  const roundTripPhase = (4 * Math.PI * data.spacingNm * cosTheta) / wl;
  const surfaceT = Math.max(0, 1 - R - data.loss);
  const peak = (surfaceT * surfaceT) / (oneMinusR * oneMinusR);
  const finesseTerm = (4 * R) / (oneMinusR * oneMinusR);
  const t = peak / (1 + finesseTerm * Math.sin(roundTripPhase / 2) ** 2);
  return Math.max(0, Math.min(1, t));
}

// Below this fraction a fringe (or its complement) is treated as fully
// blocked / fully transmitted — keeps a near-grazing or badly-mistuned
// etalon from spawning vanishingly weak child rays that can never register
// on a detector.
const ETALON_FLOOR = 0.02;

// child ray carrying the spectral slice [lo, hi] of a parent broadband ray.
// Only used for a flat-spectrum (or spec-less) parent, where the exact
// analytic box overlap below is exact — a Gaussian input routes through
// applyTransmission() instead (see the 'dichroic'/'filter' cases), since a
// box overlap fraction doesn't apply to a curved profile.
function bandChild(ray, d, lo, hi, tag) {
  const nbw = hi - lo < 2 ? 0 : hi - lo;
  return {
    d, wl: (lo + hi) / 2, bw: nbw, spec: nbw > 0 ? flatSpectrum(lo, hi) : null, tag,
    intensity: ray.intensity * Math.min(1, Math.max(0, (hi - lo) / ray.bw)),
  };
}

// A polarization modulation (from a switching EOM) meeting an analyzer:
// Malus's law is evaluated separately for the two modulation states, giving
// the two transmission levels of a real square temporal gate plus the
// time-averaged level a slow instrument would read.
function polModThrough(ray, transmissionOf) {
  const m = ray.polMod;
  const high = transmissionOf(m.stokesHigh);
  const low = transmissionOf(m.stokesLow);
  return {
    high,
    low,
    mean: m.duty * high + (1 - m.duty) * low,
    gate: {
      opl: m.opl, frequencyMHz: m.frequencyMHz, phaseNs: m.phaseNs,
      duty: m.duty, shape: 'square', high, low,
    },
  };
}

const withGate = (pulse, gate) => ({ ...pulse, gates: [...(pulse.gates || []), gate] });

const retardPolMod = (polMod, axisDeg, retardanceDeg) => ({
  ...polMod,
  stokesHigh: applyRetarder(polMod.stokesHigh, axisDeg, retardanceDeg),
  stokesLow: applyRetarder(polMod.stokesLow, axisDeg, retardanceDeg),
});

// interaction -> array of child rays [{d, wl?, intensity?, tag?}] ; [] = absorbed
function interact(ray, hit) {
  const s = hit.surface, d = { x: ray.dx, y: ray.dy }, k = s.kind, data = s.data;
  const t = norm(sub(s.b, s.a));
  const n = data.arc
    ? norm({ x: hit.p.x - data.arc.cx, y: hit.p.y - data.arc.cy })
    : perp(t);

  switch (k) {
    case 'absorb': return [];
    case 'detector': return [];
    case 'attenuate': {
      // A specimen with no signals yet still reports what illuminates it, so
      // the inspector can offer live emission defaults the moment one is
      // added (see specimenIncidentWls).
      if (specimenProbe && data.specimen) recordProbeBeam(s, ray);
      return [{ d, intensity: ray.intensity * Math.min(1, Math.max(0, data.transmission ?? 1)) }];
    }
    case 'mirror': {
      // partial reflectivity (cavity mirrors / output couplers): reflect R,
      // transmit 1-R. The transmitted ray is always traced — so a detector
      // or sample placed behind the mirror reads the correct leaked power
      // for a transmission power budget — but only drawn on the canvas
      // when showTransmitted is on (see the `hidden` flag consumed by
      // traceScene(), which strips hidden rays before assembling drawables
      // without touching detector-hit recording).
      const R = (data.refl ?? 100) / 100;
      if (R >= 0.995) return [{ d: reflect(d, n) }];
      const out = [];
      if (R > 0.005) out.push({ d: reflect(d, n), intensity: ray.intensity * R, tag: 'R' });
      out.push({ d, intensity: ray.intensity * (1 - R), tag: 'T', hidden: !data.showTransmitted });
      return out;
    }
    case 'cmirror': {
      const R = (data.refl ?? 100) / 100;
      const focused = lensBend(reflect(d, n), hit.p, s, data.f);
      if (R >= 0.995) return [{ d: focused }];
      const out = [];
      if (R > 0.005) out.push({ d: focused, intensity: ray.intensity * R, tag: 'R' });
      out.push({ d, intensity: ray.intensity * (1 - R), tag: 'T', hidden: !data.showTransmitted });
      return out;
    }
    case 'lens': {
      // transmission efficiency (AR-coating/absorption loss): a straight
      // power/intensity attenuation, no deviation of the focused direction.
      const T = Math.min(1, Math.max(0, (data.transEff ?? 100) / 100));
      const bent = lensBend(d, hit.p, s, data.f);
      if (Number.isFinite(data.objectiveNA) && Number.isFinite(data.objectiveMediumIndex)) {
        // An objective remains an equivalent paraxial plane, but its rated
        // object-space cone is a real acceptance boundary. From the rear,
        // validate the outgoing sample-side direction; from the sample,
        // validate the incoming collection direction. This clips rays
        // qualitatively without pretending to model the internal groups.
        const forward = rotPt(1, 0, s.el?.rot || 0);
        const rearToFront = dot(d, forward) >= 0;
        const objectDirection = rearToFront ? bent : d;
        const objectAxis = rearToFront ? forward : mul(forward, -1);
        const sinAngle = Math.abs(objectDirection.x * objectAxis.y - objectDirection.y * objectAxis.x);
        const acceptedSin = Math.min(1, Math.max(0, data.objectiveNA / data.objectiveMediumIndex));
        if (sinAngle > acceptedSin + 1e-9) return [];
      }
      return [{ d: bent, intensity: ray.intensity * T }];
    }
    case 'refract': {
      const materialId = s.el?.id || null;
      const inside = materialId !== null && ray.medium === materialId;
      // Catalogue glass is dispersive: a broadband ray must be sampled across
      // its bandwidth so each wavelength refracts by its own n(λ) and the
      // beam actually fans out (e.g. white light through a prism). A fixed
      // user-set index (glass rods) has no dispersion to sample.
      const dispersive = isDispersiveGlass(data.material) && ray.bw > 0;
      const transmitAt = (wl, intensity = ray.intensity, tag, bandwidth = ray.bw) => {
        const dispersiveIor = isDispersiveGlass(data.material) ? glassIndex(data.material, wl) : data.ior;
        const materialIor = Math.min(2.5, Math.max(1.01, dispersiveIor || 1.52));
        // A broadband source born inside the body initially carries one
        // center-wavelength IOR. Once sampled at the exit, each wavelength
        // must use its own incident index or the spectrum keeps one angle.
        const n1 = inside ? (dispersive ? materialIor : (ray.ior || materialIor)) : (ray.ior || 1);
        const n2 = inside ? 1 : materialIor;
        // A discretized dispersion sample (bandwidth explicitly forced to 0)
        // is now effectively monochromatic — drop the inherited profile
        // rather than carrying the parent's full-width spec forward. The
        // key is omitted entirely (not set to undefined) for a plain
        // pass-through, so the stack push's `'spec' in c` inheritance rule
        // still sees "unset" and keeps the ray's real profile.
        const specField = bandwidth === ray.bw ? {} : { spec: null };
        // A dispersion sample now stands for one wavelength alone, so it owns
        // a wavelength-derived color outright. Without this, a source with a
        // fixed beam color (a supercontinuum, whose band has no single λ to
        // derive from) would paint its whole dispersed fan that one color
        // instead of the rainbow the prism actually produces.
        const colorField = bandwidth === ray.bw ? {} : { color: wavelengthToColor(wl) };
        const transmitted = refract(d, n, n1, n2);
        if (!transmitted) {
          return {
            d: reflect(d, n), wl, bw: bandwidth, ...specField, ...colorField, intensity,
            ior: inside ? materialIor : (ray.ior || 1),
            tag: tag ? `${tag}-tir` : 'tir',
          };
        }
        return {
          d: transmitted, wl, bw: bandwidth, ...specField, ...colorField, tag,
          medium: inside ? null : materialId,
          ior: n2,
          intensity: intensity * Math.min(1, Math.max(0, data.transmission ?? 1)),
        };
      };
      if (dispersive) {
        const samples = wlSamples(ray);
        return samples.map((s, i) => transmitAt(s.wl, ray.intensity * s.weight, `w${i}`, 0));
      }
      return [transmitAt(ray.wl)];
    }
    case 'dichroic': {
      if (!ray.bw) return dichroicTransmits(ray.wl, data) ? [{ d }] : [{ d: reflect(d, n) }];
      // A Gaussian (or already-filtered) input has no closed-form box
      // overlap with the passband — integrate the real profile numerically.
      if (ray.spec && ray.spec.kind !== 'flat') {
        const T = wl => (dichroicTransmits(wl, data) ? 1 : 0);
        const out = [];
        const trans = applyTransmission(ray.spec, ray.wl, T);
        if (trans) out.push({ d, wl: trans.wl, bw: trans.bw, spec: trans.spec, intensity: ray.intensity * trans.fraction, tag: 'T' });
        const refl = applyTransmission(ray.spec, ray.wl, wl => 1 - T(wl));
        if (refl) out.push({ d: reflect(d, n), wl: refl.wl, bw: refl.bw, spec: refl.spec, intensity: ray.intensity * refl.fraction, tag: 'R' });
        return out;
      }
      // flat (supercontinuum) or unspecified box: exact analytic overlap
      const rb = [ray.wl - ray.bw / 2, ray.wl + ray.bw / 2];
      const pb = passbandOf(data);
      const out = [];
      const ix = bandIntersect(rb, pb);
      if (ix && ix[1] - ix[0] > 0.5) out.push(bandChild(ray, d, ix[0], ix[1], 'T'));
      const rd = reflect(d, n);
      if (rb[0] < pb[0] - 0.5) out.push(bandChild(ray, rd, rb[0], Math.min(rb[1], pb[0]), 'R0'));
      if (rb[1] > pb[1] + 0.5) out.push(bandChild(ray, rd, Math.max(rb[0], pb[1]), rb[1], 'R1'));
      return out;
    }
    case 'filter': {
      const f = data;
      if (f.ftype === 'nd') return [{ d, intensity: ray.intensity * f.trans }];
      if (!ray.bw) {
        const pb0 = passbandOf(f);
        return ray.wl >= pb0[0] && ray.wl <= pb0[1] ? [{ d }] : [];
      }
      if (ray.spec && ray.spec.kind !== 'flat') {
        const T = wl => { const pb = passbandOf(f); return wl >= pb[0] && wl <= pb[1] ? 1 : 0; };
        const trans = applyTransmission(ray.spec, ray.wl, T);
        return trans ? [{ d, wl: trans.wl, bw: trans.bw, spec: trans.spec, intensity: ray.intensity * trans.fraction }] : [];
      }
      // flat (supercontinuum) or unspecified box: transmitted spectrum is
      // the exact overlap of the beam band and the passband
      const ix = bandIntersect([ray.wl - ray.bw / 2, ray.wl + ray.bw / 2], passbandOf(f));
      if (!ix || ix[1] - ix[0] < 0.5) return [];
      const c = bandChild(ray, d, ix[0], ix[1], null);
      delete c.tag;
      return [c];
    }
    case 'etalon': {
      // Off-resonance light reflects (it's two coatings, not an absorber),
      // exactly like 'dichroic' — only right at a resonance does the balance
      // flip toward transmission. The Airy transmission has no box-overlap
      // shortcut regardless of input shape, so both the flat and Gaussian
      // broadband cases go through the same numeric integration.
      const cosTheta = Math.min(1, Math.max(1e-6, Math.abs(dot(d, n))));
      const T = wl => etalonAiryTransmission(wl, cosTheta, data);
      const rd = reflect(d, n);
      if (!ray.bw) {
        const t = T(ray.wl);
        const out = [];
        if (t > ETALON_FLOOR) out.push({ d, intensity: ray.intensity * t, tag: 'T' });
        if (1 - t > ETALON_FLOOR) out.push({ d: rd, intensity: ray.intensity * (1 - t), tag: 'R' });
        return out;
      }
      const out = [];
      const trans = applyTransmission(ray.spec, ray.wl, T);
      if (trans) out.push({ d, wl: trans.wl, bw: trans.bw, spec: trans.spec, intensity: ray.intensity * trans.fraction, tag: 'T' });
      const refl = applyTransmission(ray.spec, ray.wl, wl => 1 - T(wl));
      if (refl) out.push({ d: rd, wl: refl.wl, bw: refl.bw, spec: refl.spec, intensity: ray.intensity * refl.fraction, tag: 'R' });
      return out;
    }
    case 'split': {
      const r = Math.min(1, Math.max(0, data.ratio));
      const out = [];
      if (r > 0.01) out.push({ d, intensity: ray.intensity * r, tag: 'T' });
      if (r < 0.99) out.push({ d: reflect(d, n), intensity: ray.intensity * (1 - r), tag: 'R' });
      return out;
    }
    case 'grating': {
      const si = dot(d, t);                       // sin(incidence), signed
      const sIn = dot(d, n) >= 0 ? 1 : -1;
      const out = [];
      const wls = wlSamples(ray);
      for (const m of data.orders) {
        for (let i = 0; i < wls.length; i++) {
          const sd = si + m * wls[i].wl / data.d;
          if (Math.abs(sd) > 1) continue;
          const c = Math.sqrt(1 - sd * sd);
          const sOut = data.transmissive ? sIn : -sIn;
          out.push({
            d: norm(add(mul(n, sOut * c), mul(t, sd))),
            wl: wls[i].wl, bw: 0, spec: null,
            intensity: ray.intensity * (m === 0 ? 1 : wls[i].weight) / data.orders.length,
            tag: 'm' + m + (wls.length > 1 ? 'w' + i : ''),
          });
          if (m === 0 && wls.length > 1) break; // 0th order is undispersed
        }
      }
      return out;
    }
    case 'diffuser': {
      const div = (data.div || 8) * D2R;
      const sid = hit.surface.id;
      if (ray.sample == null) {
        // a single line ray scatters into a small speckled fan
        return [0, 1, 2, 3, 4].map(k => ({
          d: rotv(d, jitter(k * 3 + 1, sid) * div),
          intensity: ray.intensity / 5, speckle: true, tag: 'd' + k,
        }));
      }
      return [{ d: rotv(d, jitter(ray.sample, sid) * div), speckle: true }];
    }
    case 'aom': {
      const out = [];
      const a = data.deflect * D2R, c = Math.cos(a), sn = Math.sin(a);
      const duty = data.gate ? Math.min(0.99, Math.max(0.01, data.gate.duty ?? 0.5)) : 1;
      const shape = data.gate?.shape === 'sine' ? 'sine' : 'square';
      const depth = Math.min(1, Math.max(0, data.gate?.depth ?? 1));
      const averageTransmission = data.gate ? (shape === 'sine' ? 1 - depth / 2 : duty) : 1;
      let pulse = ray.pulse;
      if (data.gate && ray.pulse) {
        pulse = {
          ...ray.pulse,
          gates: [...(ray.pulse.gates || []), {
            opl: ray.opl, frequencyMHz: data.gate.frequencyMHz || 1, duty,
            phaseNs: data.gate.phaseNs || 0, shape, depth,
          }],
        };
      }
      const C_NM_PER_S = 2.99792458e17;
      const opticalHz = C_NM_PER_S / ray.wl;
      const shiftedHz = Math.max(1, opticalHz + (data.rfMHz || 0) * 1e6);
      const shiftedWl = C_NM_PER_S / shiftedHz;
      out.push({
        d: { x: d.x * c - d.y * sn, y: d.x * sn + d.y * c },
        wl: shiftedWl, intensity: ray.intensity * data.eff * (ray.pulse ? 1 : averageTransmission), tag: 'd1', pulse,
      });
      if (data.zero) {
        if (data.gate && ray.pulse) {
          // Residual zero order exists while RF is on; the diffracted fraction
          // returns to zero order while RF is off. Together the instantaneous
          // first + zero order remains energy-bounded.
          out.push({ d, intensity: ray.intensity * (1 - data.eff), tag: 'd0r' });
          out.push({
            d, intensity: ray.intensity * data.eff, tag: 'd0off',
            pulse: {
              ...ray.pulse,
              gates: [...(ray.pulse.gates || []), {
                opl: ray.opl, frequencyMHz: data.gate.frequencyMHz || 1, duty,
                phaseNs: data.gate.phaseNs || 0, shape, depth, invert: true,
              }],
            },
          });
        } else {
          out.push({ d, intensity: ray.intensity * (1 - data.eff * averageTransmission), tag: 'd0' });
        }
      }
      return out;
    }
    case 'chop': {
      const duty = Math.min(0.99, Math.max(0.01, data.duty ?? 0.5));
      if (!ray.pulse) {
        // CW light downstream of a chopper keeps its duty-averaged power (the
        // quantitative reading a detector sees) but is drawn as a chunked
        // on/off pattern rather than a smoothly dimmed line — a chopper
        // physically gates light in time, and this is its spatial footprint.
        // The pattern is a fixed property of the ray, so it's identical
        // between the live canvas and static SVG/PNG exports.
        return [{ d, intensity: ray.intensity * duty, chopped: { period: CHOP_SCHEMATIC_PERIOD_MM, duty } }];
      }
      const pulse = {
        ...ray.pulse,
        gates: [...(ray.pulse.gates || []), {
          opl: ray.opl, frequencyMHz: data.frequencyMHz || 1, duty, phaseNs: data.phaseNs || 0,
        }],
      };
      return [{ d, pulse, tag: 'gate' }];
    }
    case 'polarizer': {
      const a = data.a || 0;
      if (ray.polMod) {
        const m = polModThrough(ray, s => analyzerTransmission(s, a));
        const stokes = linearStokes(a);
        if (!ray.pulse) {
          if (m.mean < 0.02) return [];
          return [{ d, intensity: ray.intensity * m.mean, pol: a, stokes, polMod: null, tag: 'pol' }];
        }
        if (Math.max(m.high, m.low) < 0.02) return [];
        return [{ d, pol: a, stokes, polMod: null, pulse: withGate(ray.pulse, m.gate), tag: 'pol' }];
      }
      const f = analyzerTransmission(ray.stokes, a);
      if (f < 0.02) return [];
      const stokes = linearStokes(a);
      return [{ d, intensity: ray.intensity * f, pol: a, stokes, tag: 'pol' }];
    }
    case 'wp': {
      if (!ray.stokes) return [{ d }];
      const retardance = data.half ? 180 : 90;
      const stokes = applyRetarder(ray.stokes, data.a || 0, retardance);
      return [{
        d, stokes, pol: legacyPolarization(stokes), tag: data.half ? 'hwp' : 'qwp',
        // A waveplate after a switching EOM retards both modulation states,
        // so the alternation survives (rotated) instead of being erased.
        ...(ray.polMod ? { polMod: retardPolMod(ray.polMod, data.a || 0, retardance) } : {}),
      }];
    }
    case 'retarder': {
      if (!ray.stokes) return [{ d }];
      if (!data.switching) {
        const stokes = applyRetarder(ray.stokes, data.a || 0, data.retardance || 0);
        return [{
          d, stokes, pol: legacyPolarization(stokes), tag: 'ret',
          ...(ray.polMod ? { polMod: retardPolMod(ray.polMod, data.a || 0, data.retardance || 0) } : {}),
        }];
      }
      // A square-wave-driven EOM alternates between two polarization states.
      // Both are carried forward in `polMod` so a downstream analyzer (see
      // 'polarizer'/'pbs') can turn them into a real time-varying
      // transmission — with a pulsed source that means individual pulses are
      // routed differently, not blended. `stokes` itself stays the
      // duty-weighted average, which is what an instrument with no temporal
      // resolution (a probe or a detector placed directly after the EOM)
      // genuinely measures: a partially polarized beam.
      const duty = Math.min(1, Math.max(0, data.duty ?? 0.5));
      const lo = applyRetarder(ray.stokes, data.a || 0, data.retardanceLow || 0);
      // "Flip" drive is the half-wave switch a Pockels cell is normally used
      // for: whatever linear state comes in, the driven state is rotated 90°
      // from it (and circular handedness reverses). In Stokes terms that is
      // exactly a negation, so it needs no crystal-axis bookkeeping and
      // works for any input polarization.
      const hi = data.flip
        ? { s1: -ray.stokes.s1, s2: -ray.stokes.s2, s3: -ray.stokes.s3 }
        : applyRetarder(ray.stokes, data.a || 0, data.retardanceHigh || 0);
      const stokes = {
        s1: duty * hi.s1 + (1 - duty) * lo.s1,
        s2: duty * hi.s2 + (1 - duty) * lo.s2,
        s3: duty * hi.s3 + (1 - duty) * lo.s3,
      };
      const polMod = {
        opl: ray.opl, frequencyMHz: data.frequencyMHz || 1, phaseNs: data.phaseNs || 0,
        duty, stokesHigh: hi, stokesLow: lo,
      };
      return [{ d, stokes, polMod, pol: legacyPolarization(stokes), tag: 'ret' }];
    }
    case 'pbs': {
      if (ray.polMod) {
        // The port a pulse leaves by is decided by its own polarization at
        // the moment it arrives. Under a switching EOM that alternates
        // pulse-by-pulse, so each output port carries a real gated pulse
        // train (complementary to the other) rather than a steady half.
        const m = polModThrough(ray, s => analyzerTransmission(s, 0));
        const out = [];
        if (!ray.pulse) {
          if (m.mean > 0.02) out.push({ d, intensity: ray.intensity * m.mean, pol: 0, stokes: linearStokes(0), polMod: null, tag: 'T' });
          if (1 - m.mean > 0.02) out.push({ d: reflect(d, n), intensity: ray.intensity * (1 - m.mean), pol: 90, stokes: linearStokes(90), polMod: null, tag: 'R' });
          return out;
        }
        if (Math.max(m.high, m.low) > 0.02) {
          out.push({ d, pol: 0, stokes: linearStokes(0), polMod: null, pulse: withGate(ray.pulse, m.gate), tag: 'T' });
        }
        if (Math.max(1 - m.high, 1 - m.low) > 0.02) {
          out.push({
            d: reflect(d, n), pol: 90, stokes: linearStokes(90), polMod: null,
            pulse: withGate(ray.pulse, { ...m.gate, high: 1 - m.high, low: 1 - m.low }), tag: 'R',
          });
        }
        return out;
      }
      const ft = analyzerTransmission(ray.stokes, 0);
      const out = [];
      if (ft > 0.02) out.push({ d, intensity: ray.intensity * ft, pol: 0, stokes: linearStokes(0), tag: 'T' });
      if (1 - ft > 0.02) out.push({ d: reflect(d, n), intensity: ray.intensity * (1 - ft), pol: 90, stokes: linearStokes(90), tag: 'R' });
      return out;
    }
    case 'specimen': {
      // A multimodal specimen emits every configured channel from the same
      // spot on one crossing. Fluorescence is incoherent — isotropic, weak,
      // and drawn as evanescent rays that die within 25 mm unless a nearby
      // lens/objective/fiber collects them. The parametric signals (SHG,
      // THG, SFG, CARS) are coherent and generated along the excitation
      // direction, with an optional weaker backward (epi) lobe.
      const transmission = data.transmitExc ? Math.min(1, Math.max(0, data.transmission ?? 1)) : 0;
      // Mixing probe pass (see traceScene): record which colours actually
      // arrive here and let the excitation through untouched, so the real
      // pass afterwards knows whether CARS/SFG have a second beam to mix
      // with. Generating no signal here is what keeps the probe cheap and
      // stops signals from seeding further signals.
      if (specimenProbe) {
        recordProbeBeam(s, ray);
        return transmission > 0.001 ? [{ d, intensity: ray.intensity * transmission }] : [];
      }
      const out = [];
      const channels = data.channels || [];
      // Light generated here is a new source, not the excitation that drove
      // it: the spectrometer's relative mode scales each source to its own
      // peak, and a Raman line normalized against the pump that produced it
      // would be invisible — which is the whole reason that mode exists.
      const emittedFrom = s.el?.id || null;
      // Isotropic emission and two-beam mixing are per-spot events, not
      // per-ray ones: a beam split into K sampling rays must not emit K
      // copies of the same signal.
      const emitting = ray.sample == null || ray.sample === 0;
      // With several beams on the spot, the shortest wavelength carries the
      // most energy per photon and is the one that drives incoherent
      // emission and Raman. Gating on it also stops each beam from emitting
      // its own duplicate copy of the same signal.
      const driver = drivingExcitationWl(data.incidentWls);
      const isDriver = driver == null || Math.abs(ray.wl - driver) < 1e-6;

      // The excitation is attenuated by the specimen's own transmission and
      // nothing else. Real conversion efficiencies are ~1e-6, so signal
      // generation depletes the pump negligibly; "Signal efficiency" is a
      // visibility gain for the diagram, not an energy budget. Keeping the
      // two independent also means stacking five channels never dims the
      // excitation, and matches what the transmission field claims to do.
      // Phase contrast and SRS ride on this transmitted beam rather than
      // emitting one of their own, so they are applied here.
      if (transmission > 0.001) {
        const exc = { d, intensity: ray.intensity * transmission, tag: 'x' };
        let stokes = ray.stokes, retarded = false, pulse = ray.pulse, gated = false;
        for (const c of channels) {
          if (c.kind === 'phase' && stokes) {
            stokes = applyRetarder(stokes, c.axis ?? 45, c.retardance ?? 90);
            retarded = true;
          } else if (c.kind === 'srs' && ray.pulse) {
            const transferred = srsTransferGate(c, ray, data.incidentBeams);
            if (transferred) { pulse = withGate(pulse, transferred); gated = true; }
          }
        }
        if (retarded) exc.stokes = stokes;
        if (gated) exc.pulse = pulse;
        out.push(exc);
      }

      for (let ci = 0; ci < channels.length; ci++) {
        const c = channels[ci];
        const eff = Math.min(1, Math.max(0, c.eff ?? 0.1));
        // Phase contrast and SRS shape the transmitted beam above; they emit
        // no light of their own and have no efficiency of their own.
        if (MODIFIER_KINDS.has(c.kind)) continue;
        if (eff <= 0) continue;

        if (c.kind === 'raman') {
          // Spontaneous Raman scatters a handful of Stokes-shifted lines,
          // isotropically and weakly, from the material's own fingerprint.
          if (!emitting || !isDriver) continue;
          const pump = driver ?? ray.wl;
          const shifts = ramanShifts(c.material).slice(0, 4);
          const N = RAMAN_RAYS_PER_LINE;
          const axis = Math.atan2(d.y, d.x);
          for (const shift of shifts) {
            const line = ramanStokesWl(pump, shift);
            if (!(line > 0)) continue;
            const tint = channelColor(c, line);
            emissionAngles(N, axis).forEach((a, i) => {
              out.push({
                d: { x: Math.cos(a), y: Math.sin(a) }, wl: line, bw: 0, pol: undefined, stokes: null,
                color: tint, evan: true, evanLen: EMISSION_GLOW_MM, captureLen: EMISSION_CAPTURE_MM,
                sourceId: emittedFrom,
                intensity: 0.25,
                power: Number.isFinite(ray.power) ? ray.power * eff / (N * shifts.length) : undefined,
                tag: `r${ci}_${Math.round(shift)}_${i}`,
              });
            });
          }
          continue;
        }

        if (ISOTROPIC_KINDS.has(c.kind)) {
          if (!emitting || !isDriver) continue;
          const emission = specimenEmission(c, ray.wl, data.incidentWls);
          if (!emission || emission.gain <= 1e-4) continue;
          const N = EMISSION_RAYS;
          const tint = channelColor(c, emission.wl);
          const strength = eff * emission.gain;
          emissionAngles(N, Math.atan2(d.y, d.x)).forEach((a, i) => {
            out.push({
              d: { x: Math.cos(a), y: Math.sin(a) },
              wl: emission.wl, bw: emission.bw, spec: emission.spec,
              pol: undefined, stokes: null,
              color: tint, sourceId: emittedFrom,
              evan: true, evanLen: EMISSION_GLOW_MM, captureLen: EMISSION_CAPTURE_MM,
              intensity: 0.25,
              power: Number.isFinite(ray.power) ? ray.power * strength / N : undefined,
              tag: `f${ci}_${i}`,
            });
          });
          continue;
        }

        const wl = specimenSignalWl(c, ray.wl, data.incidentWls);
        if (!(wl > 0)) continue;
        // Sum-frequency and CARS are wave mixing: no temporal overlap between
        // the two beams, no signal.
        let overlap = 1;
        if (MIXING_KINDS.has(c.kind) && c.autoWl !== false) {
          overlap = channelOverlap(c, ray, mixingPartner(ray, data.incidentBeams));
          if (overlap < MIN_OVERLAP) continue;
        }
        const forward = ray.intensity * eff * overlap;
        const tint = channelColor(c, wl);
        out.push({ d, wl, bw: 0, spec: null, pol: undefined, stokes: null, color: tint, sourceId: emittedFrom, intensity: forward, tag: `c${ci}` });
        if (c.epi && EPI_KINDS.has(c.kind)) {
          const ratio = Math.min(1, Math.max(0, c.epiRatio ?? 0.15));
          if (ratio > 0) {
            out.push({
              d: { x: -d.x, y: -d.y }, wl, bw: 0, spec: null, pol: undefined, stokes: null,
              color: tint, sourceId: emittedFrom,
              intensity: forward * ratio,
              power: Number.isFinite(ray.power) ? ray.power * eff * ratio : undefined,
              tag: `e${ci}`,
            });
          }
        }
      }
      return out;
    }
    case 'fluor': {
      // fluorescence is isotropic and weak: emitted in all directions from
      // the sample as EVANESCENT rays whose drawn glow decays like 1/r² and
      // dies within 25 mm unless a lens / objective / fiber tip nearby
      // collects it (the tracer clears `evan` on capture; collected light
      // propagates normally and can reach detectors downstream)
      const out = [];
      const emitting = ray.sample == null || ray.sample === 0; // once per beam
      const transmission = data.transmitExc ? Math.min(1, Math.max(0, data.transmission ?? 1)) : 0;
      if (transmission > 0.001) out.push({ d, intensity: ray.intensity * transmission, tag: emitting ? 'x' : undefined });
      if (emitting) {
        const N = 16;
        const emitted = ray.intensity * (1 - transmission) * Math.min(1, Math.max(0, data.efficiency ?? 0.1));
        for (let i = 0; i < N; i++) {
          const a = i * 2 * Math.PI / N;
          out.push({
            d: { x: Math.cos(a), y: Math.sin(a) }, wl: data.wl, bw: 0, pol: undefined, stokes: null,
            evan: true, evanLen: EMISSION_GLOW_MM, captureLen: EMISSION_CAPTURE_MM,
            intensity: emitted > 0 ? 0.25 : 0, power: Number.isFinite(ray.power) ? ray.power * (1 - transmission) * Math.min(1, Math.max(0, data.efficiency ?? 0.1)) / N : undefined,
            tag: 'f' + i,
          });
        }
      }
      return out;
    }
    case 'isolator': {
      const fwd = rotPt(1, 0, (s.el && s.el.rot) || 0);
      return dot(d, fwd) > 0 ? [{ d }] : [];
    }
    case 'dmd': {
      const mid = mul(add(s.a, s.b), 0.5);
      const pitch = Math.max(0.1, data.pitch || 8);
      const h = dot(sub(hit.p, mid), t) + (data.length || 40) / 2 + pitch / 2;
      const phase = ((h % pitch) + pitch) % pitch / pitch;
      const on = phase < Math.min(0.95, Math.max(0.05, data.duty ?? 0.5));
      if (!on && !data.routeOff) return [];
      const base = reflect(d, n);
      const angle = (on ? 1 : -1) * 2 * (data.tilt || 12) * D2R;
      return [{ d: rotv(base, angle), tag: on ? 'on' : 'off' }];
    }
    case 'dm': {
      let out = reflect(d, n);
      if (data.f) out = lensBend(out, hit.p, s, data.f);
      if (data.steer) out = rotv(out, data.steer * D2R);
      return [{ d: out }];
    }
    case 'shaper': {
      // SLM / DMD / deformable mirror: base reflection (or transmission),
      // then apply each function layer in order. Layers that diffract
      // (grating) can multiply rays; capped to keep tracing bounded.
      const zf = data.zeroOrder && (data.layers || []).length
        ? Math.min(0.95, Math.max(0, data.zeroFrac ?? 0.1)) : 0;
      let rays = [{ d: data.transmissive ? d : reflect(d, n), intensity: ray.intensity * (1 - zf), tag: '' }];
      const L = data.length;
      const mid = mul(add(s.a, s.b), 0.5);
      for (const ly of (data.layers || []).slice(0, 4)) {
        const next = [];
        for (const r of rays) {
          if (ly.type === 'steer') {
            const a = (ly.angle || 0) * D2R, c = Math.cos(a), sn = Math.sin(a);
            next.push({ ...r, d: { x: r.d.x * c - r.d.y * sn, y: r.d.x * sn + r.d.y * c } });
          } else if (ly.type === 'lensarray') {
            const nL = Math.min(8, Math.max(1, Math.round(ly.n || 1)));
            const pitch = L / nL;
            const h = dot(sub(hit.p, mid), t);
            let idx = Math.floor((h + L / 2) / pitch);
            idx = Math.max(0, Math.min(nL - 1, idx));
            const hc = -L / 2 + (idx + 0.5) * pitch;
            // lenslet index goes into the branch signature so beam strips
            // only pair up within the same lenslet
            next.push({ ...r, d: lensBend(r.d, hit.p, s, ly.f, hc), tag: r.tag + 'L' + idx });
          } else if (ly.type === 'grating') {
            const parsed = [...new Set(String(ly.orders ?? '1').split(',').map(v => parseInt(v.trim(), 10)).filter(m => Number.isFinite(m)))].slice(0, 21);
            const orders = parsed.length ? parsed : [1];
            const gd = 1e6 / (ly.lines || 600);
            const si = dot(r.d, t);
            const sOut = dot(r.d, n) >= 0 ? 1 : -1;
            const wls = wlSamples(ray);
            for (const m of orders) {
              for (let wi = 0; wi < wls.length; wi++) {
                const sd = si + m * wls[wi].wl / gd;
                if (Math.abs(sd) > 1) continue;
                const c = Math.sqrt(1 - sd * sd);
                next.push({
                  d: norm(add(mul(n, sOut * c), mul(t, sd))),
                  wl: wls[wi].wl, bw: 0, spec: null, speckle: r.speckle,
                  intensity: r.intensity * (m === 0 ? 1 : wls[wi].weight) / orders.length,
                  tag: r.tag + 'm' + m + (wls.length > 1 ? 'w' + wi : ''),
                });
                if (m === 0 && wls.length > 1) break;
              }
            }
          } else if (ly.type === 'speckle') {
            const div = (ly.div || 8) * D2R;
            const sid = hit.surface.id;
            if (ray.sample == null) {
              for (let k = 0; k < 5; k++) {
                next.push({ ...r, d: rotv(r.d, jitter(k * 3 + 1, sid) * div), intensity: r.intensity / 2.5, tag: r.tag + 's' + k, speckle: true });
              }
            } else {
              next.push({ ...r, d: rotv(r.d, jitter(ray.sample, sid) * div), speckle: true });
            }
          } else {
            next.push(r);
          }
        }
        rays = next.slice(0, 24);
        if (!rays.length) break;
      }
      const out = rays.map(r => ({
        d: r.d, intensity: r.intensity, tag: r.tag || undefined,
        wl: r.wl, bw: r.bw, speckle: r.speckle || undefined,
      }));
      if (zf > 0) {
        out.push({ d: data.transmissive ? d : reflect(d, n), intensity: ray.intensity * zf, tag: 'z0' });
      }
      return out;
    }
    case 'transmit': {
      const efficiency = Math.min(1, Math.max(0, data.efficiency ?? 1));
      if (data.convert === 'opo') {
        // optical parametric down-conversion: pump -> signal + idler,
        // energy conservation 1/lambda_p = 1/lambda_s + 1/lambda_i.
        // Phase-matching is pump-specific: light at any other wavelength
        // (the crystal's own signal/idler bouncing back through on a later
        // cavity round trip) just transmits unconverted — without this
        // guard, resonating signal would re-split on every single pass,
        // branching exponentially and never terminating.
        const pumpWl = data.pumpWl || 532;
        if (Math.abs(ray.wl - pumpWl) > 1) return [{ d }];
        const sig = Math.max(1, data.signalWl || 800);
        const out = [{ d, wl: sig, intensity: ray.intensity * efficiency / 2, tag: 's' }];
        const invIdler = 1 / pumpWl - 1 / sig;
        if (invIdler > 1e-9) out.push({ d, wl: 1 / invIdler, intensity: ray.intensity * efficiency / 2, tag: 'i' });
        if (data.transmitPump && efficiency < 0.999) out.push({ d, intensity: ray.intensity * (1 - efficiency), tag: 'p' });
        return out;
      }
      let wl = ray.wl, bw, spec;
      if (data.convert === 'shg') wl = ray.wl / 2;
      else if (data.convert === 'thg') wl = ray.wl / 3;
      else if (data.convert === 'custom' || data.convert === 'cars') wl = data.outWl;
      else if (data.convert === 'sc') { wl = 650; bw = 440; spec = flatSpectrum(wl - bw / 2, wl + bw / 2); } // supercontinuum
      const conv = { d, wl, intensity: ray.intensity * efficiency };
      if (bw !== undefined) conv.bw = bw;
      if (spec !== undefined) conv.spec = spec;
      // samples can co-transmit the excitation beam alongside the converted signal
      if (data.transmitExc && wl !== ray.wl) {
        conv.tag = 'c';
        const transmission = Math.min(1, Math.max(0, data.transmission ?? 1));
        return [conv, { d, intensity: ray.intensity * (1 - efficiency) * transmission, tag: 'x' }];
      }
      if (data.transmitPump && wl !== ray.wl && efficiency < 0.999) {
        conv.tag = 'c';
        return [conv, { d, intensity: ray.intensity * (1 - efficiency), tag: 'p' }];
      }
      return [conv];
    }
    default: return [{ d }];
  }
}

// trace all rays of one source; returns finished polylines.
// `couplings` collects light captured by fiber input connectors.
function traceRays(rays0, surfaces, couplings, writeHits, signalHits) {
  const done = [];
  const stack = rays0.map(r => {
    const opl = Number.isFinite(r.oplStart) ? r.oplStart : 0;
    return {
      ...r, opl, pts: [{ x: r.x, y: r.y }], opls: [opl],
      segmentIntensities: [], segmentHistories: [], segmentEvents: [],
      sig: '', depth: 0, last: null,
    };
  });
  const appendPoint = (r, p, geometricLength) => {
    const ng = Math.min(3, Math.max(1, r.ior || 1));
    r.opl += Math.max(0, geometricLength) * ng;
    r.segmentIntensities.push(r.intensity);
    r.segmentHistories.push(r.sig);
    r.segmentEvents.push(null);
    r.pts.push(p);
    r.opls.push(r.opl);
  };
  while (stack.length) {
    const r = stack.pop();
    for (; ;) {
      if (r.depth > MAX_DEPTH || r.intensity < MIN_INT) break;
      const hit = nearestHit({ x: r.x, y: r.y }, { x: r.dx, y: r.dy }, surfaces, r.last);
      if (r.evan) {
        // evanescent (isotropic fluorescence, or a diagram point source):
        // the glow decays like 1/r² and dies within the ray's evanescent
        // range (fluorescence: 25 mm, point source: 110 mm) unless a lens /
        // objective / fiber tip collects it first. The collector must sit
        // within 1.5x that range (a small grace margin so an optic right at
        // the fade boundary still counts); otherwise the light is simply
        // gone and never reaches downstream detectors.
        const EVAN_LEN = r.evanLen || 22;
        // How far the glow is DRAWN and how far an optic can still collect it
        // are separate: a collection lens routinely sits well outside the few
        // centimetres of visible glow, and the light is really there.
        const CAPTURE = r.captureLen || EVAN_LEN * 1.5;
        const captured = hit && hit.t <= CAPTURE
          && (hit.surface.kind === 'lens' || hit.surface.kind === 'fiberin');
        if (!captured) {
          const L = hit ? Math.min(hit.t, EVAN_LEN) : EVAN_LEN;
          appendPoint(r, { x: r.x + r.dx * L, y: r.y + r.dy * L }, L);
          r.evanFade = true;
          break;
        }
        r.evan = false; // collected: from here on it behaves like normal light
      }
      if (!hit) {
        appendPoint(r, { x: r.x + r.dx * MAXLEN, y: r.y + r.dy * MAXLEN }, MAXLEN);
        break;
      }
      appendPoint(r, { x: hit.p.x, y: hit.p.y }, hit.t);
      const interactionKey = hit.surface.el?.id
        ? `${hit.surface.el.id}:${hit.surface.kind}${hit.surface.data.topologyKey ? `:${hit.surface.data.topologyKey}` : ''}`
        : `surface${hit.surface.id}:${hit.surface.kind}`;
      r.segmentEvents[r.segmentEvents.length - 1] = interactionKey;
      if (hit.ambiguous && hit.surface.kind === 'refract') break;
      r.sig += `/${interactionKey}`;
      if (hit.surface.el?.type === 'objective' && hit.surface.el?.id) {
        const objectives = Array.isArray(r.objectives) ? r.objectives : [];
        if (!objectives.some(objective => objective.id === hit.surface.el.id)) {
          r.objectives = [...objectives, {
            id: hit.surface.el.id,
            na: Number.isFinite(hit.surface.data.objectiveNA) ? hit.surface.data.objectiveNA : null,
          }];
        }
        // Every segment across the barrel face — the open pupil and the metal
        // either side of it — reports where it was struck, so the widest hit
        // is the radius of the beam that actually arrived.
        const span = hit.surface.data.pupilSpan;
        if (Array.isArray(span) && Number.isFinite(hit.u)) {
          recordObjectivePupil(
            hit.surface.el.id,
            Math.abs(span[0] + hit.u * (span[1] - span[0])),
            hit.surface.data.pupilRadius,
          );
        }
      }
      // Both specimen holders report where the beam lands, so the plain
      // sample can draw its excitation spot too; only the piezo stage writes
      // 2PP voxel marks, which its own writeVoxel flag already gates.
      const holder = hit.surface.el?.type;
      if ((holder === 'stage' || holder === 'sample') && r.writeReference) {
        if (writeHits && hit.surface.data.writeVoxel && r.pulse) {
          writeHits.push({
            stageId: hit.surface.el.id,
            x: hit.p.x,
            y: hit.p.y,
            opl: r.opl,
            pulse: { ...r.pulse },
            intensity: Math.min(1, Math.max(0, r.intensity || 0)),
          });
        }
        if (signalHits && hit.surface.data.reportHit) {
          // The generated-signal wavelength, when this surface actually
          // converts light (fluorescence emission, or SHG/THG/CARS forward
          // conversion) — used to color the excitation-spot indicator by
          // the real signal color rather than a fixed per-material color.
          let signalWl;
          if (hit.surface.kind === 'specimen') {
            // A multimodal specimen has several signal colours at once; the
            // spot shows the first channel that produces light for this ray.
            for (const c of hit.surface.data.channels || []) {
              const wl = c.kind === 'fluor' ? c.wl : specimenSignalWl(c, r.wl, hit.surface.data.incidentWls);
              if (wl > 0) { signalWl = wl; break; }
            }
          } else if (hit.surface.kind === 'fluor') {
            signalWl = hit.surface.data.wl;
          } else if (hit.surface.kind === 'transmit' && hit.surface.data.convert) {
            const conv = hit.surface.data.convert;
            signalWl = conv === 'shg' ? r.wl / 2
              : conv === 'thg' ? r.wl / 3
                : (conv === 'cars' || conv === 'custom') ? hit.surface.data.outWl
                  : undefined;
          }
          signalHits.push({
            stageId: hit.surface.el.id,
            x: hit.p.x,
            y: hit.p.y,
            wl: signalWl,
            sourceId: r.pulse?.sourceId,
            objectiveNA: r.objectives?.length === 1 && Number.isFinite(r.objectives[0].na)
              ? r.objectives[0].na
              : undefined,
          });
        }
      }
      if (hit.surface.kind === 'detector') recordDetectorHit(r, hit);
      if (hit.surface.kind === 'delay') {
        const extraOpl = Math.min(100000, Math.max(0, hit.surface.data.delayMm || 0));
        if (extraOpl > 0) {
          r.segmentIntensities.push(r.intensity);
          r.segmentHistories.push(r.sig);
          r.segmentEvents.push(interactionKey);
          r.pts.push({ x: hit.p.x, y: hit.p.y });
          r.opl += extraOpl;
          r.opls.push(r.opl);
        }
      }
      if (hit.surface.kind === 'fiberin') {
        const fb = hit.surface.data.beam;
        const intoFiber = fiberEndDirection(fb.pts, hit.surface.data.end);
        const inputNA = Math.min(0.95, Math.max(0.01, fb.inputNA ?? 0.22));
        const accepted = intoFiber && dot({ x: r.dx, y: r.dy }, intoFiber) >= Math.cos(Math.asin(inputNA));
        if (couplings && fb.propagate && accepted) {
          couplings.push({
            beam: fb, end: hit.surface.data.end, wl: r.wl, bw: r.bw, spec: r.spec,
            intensity: r.intensity, power: r.power, pol: r.pol, stokes: cloneStokes(r.stokes),
            pulse: r.pulse, opl: r.opl, sourceId: r.sourceId || null,
          });
        }
        break; // the connector absorbs the incoming beam either way
      }
      const children = interact(r, hit);
      if (children.length === 0) break;
      const c0 = children[0];
      const single = children.length === 1 && !c0.tag
        && (c0.wl === undefined || c0.wl === r.wl)
        && (c0.bw === undefined || c0.bw === r.bw)
        && (c0.spec === undefined || c0.spec === r.spec)
        && !(c0.speckle && !r.speckle)
        && !(c0.chopped && !r.chopped)
        && !('pol' in c0 && c0.pol !== r.pol)
        && !('stokes' in c0)
        && !('polMod' in c0)
        && !('pulse' in c0); // state changes split so probes read each segment
      if (single) {
        if (c0.intensity !== undefined && r.intensity > 0 && Number.isFinite(r.power)) {
          r.power *= c0.intensity / r.intensity;
        }
        r.x = hit.p.x; r.y = hit.p.y;
        r.dx = c0.d.x; r.dy = c0.d.y;
        if (c0.intensity !== undefined) r.intensity = c0.intensity;
        if ('pol' in c0) r.pol = c0.pol;
        if ('stokes' in c0) r.stokes = cloneStokes(c0.stokes);
        if ('medium' in c0) r.medium = c0.medium;
        if ('ior' in c0) r.ior = c0.ior;
        r.last = hit.surface; r.depth++;
        continue;
      }
      for (const c of children) {
        const ox = c.origin ? c.origin.x : hit.p.x, oy = c.origin ? c.origin.y : hit.p.y;
        stack.push({
          x: ox, y: oy, dx: c.d.x, dy: c.d.y,
          wl: c.wl !== undefined ? c.wl : r.wl,
          bw: c.bw !== undefined ? c.bw : r.bw,
          spec: 'spec' in c ? c.spec : r.spec,
          speckle: c.speckle || r.speckle || false,
          chopped: c.chopped || r.chopped || undefined,
          evan: c.evan || false,
          evanLen: c.evanLen,
          captureLen: c.captureLen,
          pol: 'pol' in c ? c.pol : r.pol,
          stokes: 'stokes' in c ? cloneStokes(c.stokes) : cloneStokes(r.stokes),
          polMod: 'polMod' in c ? c.polMod : r.polMod,
          // An explicit per-ray drawing color, set when a specimen generates
          // a signal. It overrides the source's own fixed color, because a
          // signal at a new wavelength is not the source's light any more.
          color: 'color' in c ? c.color : r.color,
          sourceId: 'sourceId' in c ? c.sourceId : r.sourceId,
          medium: 'medium' in c ? c.medium : r.medium,
          ior: 'ior' in c ? c.ior : (r.ior || 1),
          pulse: 'pulse' in c ? c.pulse : r.pulse,
          intensity: c.intensity !== undefined ? c.intensity : r.intensity,
          power: c.power !== undefined ? c.power : Number.isFinite(r.power)
            ? r.power * (c.intensity !== undefined && r.intensity > 0 ? c.intensity / r.intensity : 1)
            : undefined,
          sample: r.sample, writeReference: r.writeReference,
          objectives: Array.isArray(r.objectives) ? r.objectives.map(objective => ({ ...objective })) : [],
          hidden: r.hidden || Boolean(c.hidden),
          pts: [{ x: ox, y: oy }],
          opl: r.opl,
          opls: [r.opl],
          segmentIntensities: [],
          segmentHistories: [],
          segmentEvents: [],
          sig: r.sig + '/' + (c.tag || 'w'),
          depth: r.depth + 1, last: hit.surface,
        });
      }
      break;
    }
    done.push(r);
  }
  return done;
}

// turn traced polylines into drawables (strokes / envelope strips / speckle
// grains / rainbow ribbons / chopped chunks)
function assembleDrawables(paths, opts, drawables) {
  const { K, isBeam, fixedColor } = opts;
  const colorOf = r => {
    // A signal generated in a specimen carries its own color and is no longer
    // the source's light, so it outranks the source's fixed color — otherwise
    // a custom-colored IR pump would paint its own green SHG red.
    if (r.color) return r.color;
    if (fixedColor) return fixedColor;
    // Undispersed broadband light is co-propagating mixed light, not a rainbow
    // painted across the beam aperture. Dispersive optics split it into bw=0
    // child rays, which regain wavelength-specific color below.
    if (r.bw >= 200) return '#cbd8ea';
    return wavelengthToColor(r.wl);
  };
  const opOf = r => Math.max(0.25, Math.min(0.95, 0.35 + 0.6 * r.intensity));
  const dashOf = r => r.chopped
    ? `${(r.chopped.period * r.chopped.duty).toFixed(1)} ${(r.chopped.period * (1 - r.chopped.duty)).toFixed(1)}`
    : undefined;

  const pushRay = (r, w, opacity, thin) => {
    if (r.pts.length < 2) return;
    if (r.evanFade) {
      // evanescent glow: uncollected isotropic emission decays like 1/r²
      // and visually dies out by the end of its evanescent range
      const a = r.pts[r.pts.length - 2], b = r.pts[r.pts.length - 1];
      const col = colorOf(r), S = 6;
      for (let i = 0; i < S; i++) {
        const t0 = i / S, t1 = (i + 1) / S;
        const tm = (t0 + t1) / 2;
        // inverse-square profile, softened at r→0 so the origin stays finite:
        // full brightness at the source, ~1/20 of it at the fade boundary
        const opacity = Math.max(0.02, 0.55 / ((1 + 3.5 * tm) ** 2));
        drawables.push({
          type: 'path', color: col, w: 1.8, opacity,
          pts: [
            { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 },
            { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 },
          ],
        });
      }
      return;
    }
    if (r.speckle) {
      if (thin && r.sample != null && r.sample % 2 === 1) return; // thin out beam speckle
      const seed = (Math.round(Math.abs(r.pts[0].x * 13 + r.pts[0].y * 29)) + (r.sample == null ? r.sig.length * 7 : r.sample) * 101) | 0;
      drawables.push({ type: 'dots', color: colorOf(r), dots: speckleDots(r.pts, thin ? 3 : 4, seed, thin ? 130 : 220) });
      return;
    }
    if (r.bw >= 200 && r.sample == null) {
      // Coincident spectral halo: spectrum is visible without implying spatial
      // separation before a prism or grating.
      drawables.push({ type: 'path', pts: r.pts, color: '#7c3aed', w: 5, opacity: 0.24, dash: dashOf(r) });
      drawables.push({ type: 'path', pts: r.pts, color: '#f97316', w: 3.2, opacity: 0.28, dash: dashOf(r) });
      drawables.push({ type: 'path', pts: r.pts, color: '#dbe7f5', w: 1.8, opacity: 0.95, dash: dashOf(r) });
      return;
    }
    drawables.push({ type: 'path', pts: r.pts, color: colorOf(r), w, opacity, dash: dashOf(r) });
  };

  if (!isBeam) {
    for (const r of paths) pushRay(r, 2, opOf(r), false);
    return;
  }
  // Beam mode is reconstructed one propagation segment at a time. Two nearby
  // samples can share an upstream route and then differ when only one clips a
  // finite optic. Pairing complete paths would erase their valid common strip;
  // segment histories let that strip continue exactly to the first differing
  // interaction without inventing a connection beyond it.
  const bySample = new Map();
  for (const r of paths) {
    if (r.sample === null || r.sample === undefined || r.pts.length < 2) continue;
    if (!bySample.has(r.sample)) bySample.set(r.sample, []);
    for (let j = 0; j < r.pts.length - 1; j++) {
      bySample.get(r.sample).push({
        ...r,
        pts: [r.pts[j], r.pts[j + 1]],
        intensity: r.segmentIntensities?.[j] ?? r.intensity,
        renderHistory: r.segmentHistories?.[j] ?? r.sig,
        renderEvent: r.segmentEvents?.[j] ?? null,
      });
    }
  }
  const clippedPair = (ra, rb) => {
    const [a0, a1] = ra.pts, [b0, b1] = rb.pts;
    const la = Math.hypot(a1.x - a0.x, a1.y - a0.y);
    const lb = Math.hypot(b1.x - b0.x, b1.y - b0.y);
    const shared = Math.min(la, lb);
    const atLength = (a, b, length, total) => total <= 1e-9 ? a : {
      x: a.x + (b.x - a.x) * Math.min(1, length / total),
      y: a.y + (b.y - a.y) * Math.min(1, length / total),
    };
    return [[a0, atLength(a0, a1, shared, la)], [b0, atLength(b0, b1, shared, lb)]];
  };
  for (let i = 0; i < K - 1; i++) {
    const nextByHistory = new Map((bySample.get(i + 1) || []).map(r => [r.renderHistory, r]));
    for (const ra of bySample.get(i) || []) {
      if (ra.evanFade) { pushRay(ra, 0, 0, false); continue; } // fading glow, no fill
      if (ra.speckle) { pushRay(ra, 0, 0, true); continue; } // grains, no fill
      const rb = nextByHistory.get(ra.renderHistory);
      if (rb && !rb.speckle) {
        const op = 0.28 * Math.max(0.4, ra.intensity);
        const [A, B] = ra.renderEvent === rb.renderEvent
          ? [ra.pts, rb.pts]
          : clippedPair(ra, rb);
        if (ra.chopped) {
          for (const q of chopStrip(A, B, ra.chopped.period, ra.chopped.duty)) {
            drawables.push({ type: 'poly', pts: q, color: colorOf(ra), opacity: op });
          }
        } else {
          drawables.push({ type: 'poly', pts: A.concat([...B].reverse()), color: colorOf(ra), opacity: op });
        }
      }
    }
  }
  // last sample's speckle (loop above covers samples 0..K-2)
  for (const r of bySample.get(K - 1) || []) {
    if (r.speckle) pushRay(r, 0, 0, true);
  }
  // outline strokes on the outer edges of the beam only
  for (const i of [0, K - 1]) {
    for (const r of bySample.get(i) || []) {
      if (!r.speckle && !r.evanFade) drawables.push({ type: 'path', pts: r.pts, color: colorOf(r), w: 1.2, opacity: 0.7, dash: dashOf(r) });
    }
  }
}

function collectPulseTracks(paths, K, fixedColor, pulseTracks) {
  const centreSample = Math.floor((Math.max(1, K) - 1) / 2);
  for (const r of paths) {
    if (!r.pulse || r.pts.length < 2 || r.opls?.length !== r.pts.length) continue;
    if (r.sample !== null && r.sample !== undefined && r.sample !== centreSample) continue;
    pulseTracks.push({
      pts: r.pts.map(p => ({ x: p.x, y: p.y })),
      opls: [...r.opls],
      pulse: { ...r.pulse },
      bw: r.bw || 0,
      color: r.color || fixedColor || wavelengthToColor(r.wl),
      intensity: r.intensity,
    });
  }
}

// Trace everything. The static drawables remain export-safe while pulseTracks
// carry absolute optical path lengths for the canvas-only animation layer.
export function traceScene(elements, beams = []) {
  const surfaces = buildSurfaces(elements, beams);
  const drawables = [];
  const pulseTracks = [];
  const writeHits = [];
  const signalHits = [];
  lastSignalHits = [];
  const couplings = [];
  lastPaths = [];
  detectorHits = new Map();
  objectivePupilHits = new Map();
  gateTransmissionCache = new Map();
  specimenIncident = new Map();

  // Sources are emitted twice when a specimen needs two-colour mixing: once
  // as a cheap probe that only records which wavelengths reach each specimen
  // (the `specimenProbe` branch in interact()), then for real with that
  // knowledge attached. The tracer only ever sees one ray at a time, so
  // without the probe a CARS or SFG channel has no way to know whether a
  // second beam is present at the same spot.
  const emitSources = collect => {
  for (const el of elements) {
    const def = registry[el.type];
    if (!def || !def.source) continue;
    const p = el.params;
    const baseColor = p.autoColor === false && p.color ? p.color : wavelengthToColor(p.wavelength);
    const local = def.source(el);
    // A ray's (wl, bw) stay the centroid/FWHM summary every part of the
    // tracer already reads; `spec` is the true shape — Gaussian for a
    // broadband laser line, flat for a supercontinuum — that wavelength-
    // selective elements and the spectrometer display integrate against.
    // Each source type's own rule for arriving at the three lives in
    // resolveSourceSpectrum(), so nothing here branches on element type.
    const { wl: srcWl, bw: srcBw, spec: srcSpec } = resolveSourceSpectrum(el.type, p);
    const K = local.length;
    const pulse = p.temporalMode === 'pulsed' ? {
      sourceId: el.id,
      repRateMHz: Math.min(1000000, Math.max(0.001, p.repRateMHz || 80)),
      pulseWidthFs: Math.min(1000000000, Math.max(1, p.pulseWidthFs || 100)),
      phaseNs: Math.min(1000000, Math.max(-1000000, p.pulsePhaseNs || 0)),
    } : null;
    const rays0 = local.map(r => {
      const o = toWorld(el, r.x, r.y);
      const d = rotPt(r.dx, r.dy, el.rot || 0);
      const containing = elements.filter(body => {
        const bodyDef = registry[body.type];
        return bodyDef?.containsLocal?.(body, toLocal(body, o.x, o.y));
      });
      const initialBody = containing.length === 1 ? containing[0] : null;
      const initialIor = initialBody
        ? registry[initialBody.type].refractiveIndex?.(initialBody, srcWl) || 1
        : 1;
      return {
        x: o.x, y: o.y, dx: d.x, dy: d.y, wl: srcWl, bw: srcBw, spec: srcSpec, speckle: false,
        pol: typeof p.pol === 'number' ? p.pol : undefined,
        stokes: typeof p.pol === 'number' ? linearStokes(p.pol) : null,
        pulse,
        objectives: [],
        evan: r.evan || false, evanLen: r.evanLen,
        medium: initialBody?.id || null, ior: initialIor,
        intensity: 1, power: 1 / Math.max(1, K), sample: r.sample !== undefined ? r.sample : null,
        // Which source this light started from, so the spectrometer can
        // normalize each source's own contribution independently.
        sourceId: el.id,
        writeReference: r.sample === undefined || r.sample === Math.floor((K - 1) / 2),
      };
    });
    const allPaths = traceRays(rays0, surfaces,
      collect ? couplings : null, collect ? writeHits : [], collect ? signalHits : []);
    if (!collect) continue;
    // Rays tagged hidden (a partial mirror's transmitted leak with its
    // "Display transmitted beam" toggle off) are always fully traced above,
    // for correct detector/power-budget physics — but stay out of every
    // visual surface: drawables, pulse animation, and the beam probe.
    const paths = allPaths.filter(r => !r.hidden);
    lastPaths.push(...paths);
    assembleDrawables(paths, {
      K, isBeam: p.beamMode === 'beam',
      fixedColor: p.autoColor === false && p.color ? baseColor : null,
    }, drawables);
    // "Show pulse dynamics" is a rendering choice only: the pulse train above
    // is still traced and still gates temporal overlap downstream — skipping
    // the tracks just leaves the steady CW beam graphic in place of packets.
    if (p.showPulse !== false) {
      collectPulseTracks(paths, K, p.autoColor === false && p.color ? baseColor : null, pulseTracks);
    }
  }
  };

  // Probe whenever a signal-bearing specimen is on the table: its channels
  // may need to know the other colours present, and even a specimen with no
  // channels yet reports what illuminates it so the inspector can offer live
  // emission defaults. SHG/THG-only benches still skip it.
  const needsProbe = surfaces.some(s =>
    (s.kind === 'specimen' && (s.data.channels || []).some(channelNeedsExcitationProbe))
    || (s.kind === 'attenuate' && s.data.specimen && s.el
        && ['linear', 'nonlinear'].includes(specimenTypeOf(s.el.params))));
  if (needsProbe) {
    specimenProbe = new Map();
    try {
      emitSources(false);
      for (const s of surfaces) {
        if (s.kind !== 'specimen' && !(s.kind === 'attenuate' && s.data.specimen)) continue;
        const beams = specimenProbe.get(s.id) || [];
        s.data.incidentBeams = beams;
        s.data.incidentWls = beams.map(b => b.wl);
        if (s.el) specimenIncident.set(s.el.id, beams);
      }
    } finally {
      specimenProbe = null;
      detectorHits = new Map();
      objectivePupilHits = new Map();
      gateTransmissionCache = new Map();
    }
  }
  emitSources(true);

  // fibers that received light re-emit at their far end (up to 3 chained hops)
  const emitted = new Set();
  for (let pass = 0; pass < 3 && couplings.length; pass++) {
    const batch = couplings.splice(0, couplings.length);
    for (const c of batch) {
      const key = c.beam.id + ':' + c.end + ':' + Math.round(c.wl || 0) + ':' + (c.pulse?.sourceId || 'cw') + ':' + Math.round(c.opl || 0);
      if (emitted.has(key)) continue;
      emitted.add(key);
      const rays0 = fiberEmissionRays(c);
      if (!rays0) continue;
      const paths = traceRays(rays0, surfaces, couplings, writeHits, signalHits).filter(r => !r.hidden);
      lastPaths.push(...paths);
      assembleDrawables(paths, { K: rays0.length, isBeam: true, fixedColor: null }, drawables);
      collectPulseTracks(paths, rays0.length, null, pulseTracks);
    }
  }
  // image formation for Object elements: locate the image of the object's
  // base and tip by tracing each through every lens on its axis using real
  // per-surface thin-lens physics (two rays per point, then intersect the
  // outgoing lines). This is correct even when the object sits off the
  // shared lens axis (tilted object planes / Scheimpflug) or exactly at a
  // focal plane, unlike a single local-axis paraxial chain.
  for (const el of elements) {
    const def = registry[el.type];
    if (!def || !def.imaging || !el.params.showImage) continue;
    const pp = el.params;
    const u = rotPt(1, 0, el.rot || 0);       // object's forward axis
    const v = rotPt(0, -1, el.rot || 0);      // object's "up" direction
    const p0 = { x: el.x, y: el.y };
    const h0 = pp.height;
    const tip0 = add(p0, mul(v, h0));

    // lens surfaces crossed by the object's own axis ray, ordered by distance
    const hits = [];
    for (const s of surfaces) {
      if (s.kind !== 'lens') continue;
      const e = sub(s.b, s.a);
      const den = u.x * e.y - u.y * e.x;
      if (Math.abs(den) < 1e-9) continue;
      const dp = sub(s.a, p0);
      const t = (dp.x * e.y - dp.y * e.x) / den;
      const q = (dp.x * u.y - dp.y * u.x) / den;
      if (t > 1 && q >= 0 && q <= 1) hits.push({ t, s });
    }
    hits.sort((a, b) => a.t - b.t);
    if (!hits.length || hits.some(h => !h.s.data.f)) continue;

    // image of any point: trace two independent real rays from it through
    // every lens hit with the same bending physics as live ray tracing
    // (lensBend), then intersect the two outgoing lines. Paraxial transfer
    // is linear, so any two non-parallel starting directions give the exact
    // same image point — u+v (45°-ish) is never parallel to u itself, unlike
    // "aim at the first lens centre" which degenerates for on-axis points.
    const imagePoint = P => {
      const rays = [{ p: P, d: u }, { p: P, d: norm(add(u, v)) }];
      for (const { s } of hits) {
        for (const r of rays) {
          const e = sub(s.b, s.a);
          const den = r.d.x * e.y - r.d.y * e.x;
          if (Math.abs(den) < 1e-9) continue;
          const dp = sub(s.a, r.p);
          const t = (dp.x * e.y - dp.y * e.x) / den;
          const hitP = add(r.p, mul(r.d, t));
          r.p = hitP;
          r.d = lensBend(r.d, hitP, s, s.data.f);
        }
      }
      const [rA, rB] = rays;
      const den2 = rA.d.x * rB.d.y - rA.d.y * rB.d.x;
      if (Math.abs(den2) < 1e-9) return null; // image at infinity
      const dp2 = sub(rB.p, rA.p);
      const tA = (dp2.x * rB.d.y - dp2.y * rB.d.x) / den2;
      const pt = add(rA.p, mul(rA.d, tA));
      return Number.isFinite(pt.x) && Number.isFinite(pt.y) ? pt : null;
    };

    const imgBase = imagePoint(p0);
    const imgTip = imagePoint(tip0);
    if (!imgBase || !imgTip) continue;
    if (Math.hypot(imgBase.x - p0.x, imgBase.y - p0.y) > MAXLEN) continue;

    const m = dot(sub(imgTip, imgBase), v) / h0;
    if (!Number.isFinite(m) || Math.abs(m) < 1e-6) continue;
    const color = pp.autoColor === false && pp.color ? pp.color : wavelengthToColor(pp.wavelength);
    // redraw the object's shape at the image plane, scaled by |m| and
    // vertically flipped when m < 0
    const sh = OBJ_SHAPES[pp.shape] || OBJ_SHAPES.arrow;
    const toWorldPt = (sx, sy) => add(add(imgBase, mul(u, sx * h0 * Math.abs(m))), mul(v, -sy * h0 * m));
    for (const ln of sh.lines) {
      drawables.push({ type: 'path', pts: ln.map(q => toWorldPt(q[0], q[1])), color, w: 2.2, opacity: 0.85, dash: true });
    }
    for (const pg of sh.polys) {
      drawables.push({ type: 'poly', pts: pg.map(q => toWorldPt(q[0], q[1])), color, opacity: 0.85 });
    }
  }

  lastSignalHits = signalHits;
  return { drawables, pulseTracks, writeHits, signalHits };
}

export function traceAll(elements, beams = []) {
  return traceScene(elements, beams).drawables;
}
