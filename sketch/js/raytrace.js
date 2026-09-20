// 2D ray-tracing engine.
// Builds world-space surfaces from elements, propagates rays from every source,
// and returns drawables: stroked polylines (line-mode / beam edges) and filled
// polygons (beam-mode envelope between the two edge rays).

import {
  registry, OBJ_SHAPES, EPI_CAPABLE_KINDS as EPI_KINDS, MIXING_KINDS, phasePlateOpdFraction,
  ISOTROPIC_KINDS, MODIFIER_KINDS, EMISSION_ORDER, EMISSION_OFFSET_NM,
  sumFrequencyWl, carsAntiStokesWl, ramanShifts, ramanStokesWl,
  drivingExcitationWl, channelNeedsExcitationProbe, specimenTypeOf,
  fluorophoreSpec, fluorophoreAbsorption, metalensFocalLength, opcpaPortLocal, opoPortLocal, OPO_ACCEPTANCE_DEG,
} from './elements.js';
import { toLocal, toWorld, rotPt, dot, sub, add, mul, norm, perp, wavelengthToColor, D2R, distToSegment } from './util.js';
import { C_MM_PER_NS, pulseGateTransmission, pulseOverlap } from './pulses.js';
import { normalizeAotfChannels, aotfChannelTransmission, normalizeAotfPassband } from './aotf.js';
import { aodDeflectionDeg } from './acousto-optic.js';
import { capillaryLossDbPerM, fiberPropagation, hollowCoreCoefficients } from './fiber.js';
import { propagateEnvelope, fieldMetrics } from './pulse-field.js';

// What each argon capillary did on the last trace, for its inspector panel.
const hollowReadings = new Map();
const hollowCache = new Map();
export const fiberReading = id => hollowReadings.get(id) || null;
// The caveat carried by light whose spectrum the hollow-core solver could not
// compute. It rides on every ray downstream -- through compressors, filters
// and further fibers alike -- and every readout of that light shows it.
export const LINEAR_ONLY = 'Linear-only approximation; nonlinear output unavailable';
export const ARGON_OUT_OF_RANGE = 'Argon dispersion unavailable outside 468–2059 nm; geometric continuation only';

// Fixed, readable chunk period for a chopped CW beam (mm). The wheel's real
// period is Hz-to-kHz scale, so c·period would be light-seconds long — this
// mirrors the same schematic-spacing convention already used by pulse
// markers: an on-screen-legible constant, not a physically scaled distance.
const CHOP_SCHEMATIC_PERIOD_MM = 14;

// Below this a ray carries no light worth drawing. The beam fill has always
// used it per segment; the pulse overlay and the branch emitters use it too so
// the three cannot disagree about whether a beam exists.
const MIN_DRAWN_INTENSITY = 1e-12;
import {
  linearStokes, cloneStokes, retarder as applyRetarder, analyzerTransmission,
  legacyPolarization, polarizationDescription,
} from './polarization.js';
import { arcParameterAtPoint, circularArcThrough } from './polygon.js';
import {
  gddGroupDelayDifferenceFs, glassGVD, glassGroupDelayDifferenceFs, glassIndex,
  isDispersiveGlass, authoredPulseTiming, pulseDurationAfterDispersion, pulseDurationAcrossPaths, filteredPulseDuration, PATHS_DISAGREE, DISPERSION_UNAVAILABLE, PATH_PHASE_TOLERANCE_RAD,
} from './glass.js';
import {
  gaussianSpectrum, flatSpectrum, lineSpectrum, scaleSpectrum, spectrumSamples, spectrumStats, spectrumSupport, spectrumWeight,
  applyTransmission as applySpectralTransmission, fringeVisibility, resolveSourceSpectrum, supercontinuumTransformLimitFs,
  transformLimitedBandwidthNm,
} from './spectrum.js';
import { cameraProfileFromHits } from './camera-profile.js';
import {
  MAX_CONVERSION, MAX_OPO_DEPLETION, mixOverlap, mixPulse, mixWavelength, mixWidthNm,
  nmToWavenumberWidth, opcpaTransfer, opoPulse, opoWaves, pumpWidthNm, supercontinuumRange,
} from './parametric.js';
import { asphereSag, asphereSlope } from './asphere.js';

// polylines from the most recent traceAll, kept for beam probes
let lastPaths = [];
let lastSignalHits = [];
let detectorHits = new Map();
// Rays whose centres cross a camera plane just outside its finite face still
// define the boundary of the adjacent ray tube. Keep those near misses
// separate from measured hits so camera deposition can clip the continuous
// tube exactly without counting an off-sensor ray as detected power.
let detectorMisses = new Map();
// A coherent source cannot be reconstructed from only the branches that
// happened to survive a trace budget: a weak omitted field can still make a
// large cross term with a strong one.  Record any such truncation and
// invalidate that source's camera fields after the complete trace, while
// retaining every hit for conservative power deposition.
let incompleteCoherenceIds = new Map();
// A coherent trace is discovered once as independent rays, then replayed
// with the compatible fields at each ideal beam-splitter crossing collapsed
// into one outgoing field per physical port. The replay makes the corrected
// power available to every downstream consumer: beam drawing, probes, and
// detectors all see the same result.
const MAX_COHERENT_GROUP_PASSES = 4;
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

// phase-object element id -> the span of its aperture the light actually
// crossed, as a fraction 0..1. A phase object only writes the part of its
// profile the beam covers, so this is what decides how many fringes reach the
// camera -- and a wide plate in a narrow beam writes almost none of them.
let phasePlateSpans = new Map();

function recordPhasePlateSpan(elementId, u) {
  if (!elementId || !Number.isFinite(u)) return;
  const seen = phasePlateSpans.get(elementId);
  if (!seen) phasePlateSpans.set(elementId, { lo: u, hi: u });
  else { seen.lo = Math.min(seen.lo, u); seen.hi = Math.max(seen.hi, u); }
}

export function phasePlateIllumination(elementId) {
  const seen = phasePlateSpans.get(elementId);
  if (!seen) return null;
  return { span: Math.max(0, Math.min(1, seen.hi - seen.lo)) };
}

// pulse-compressor element id -> the GDD the beam arrives carrying, and what
// leaves. A compressor whose setting is small next to what a scene already
// accumulated looks inert; showing both numbers is what makes it obvious that
// -2000 fs² against 38680 fs² is doing exactly 5% of the job.
let compressorGdd = new Map();

function recordCompressor(elementId, incoming, outgoing) {
  if (!elementId || !Number.isFinite(incoming)) return;
  const seen = compressorGdd.get(elementId);
  // several rays cross it; the widest-magnitude arrival is the representative
  if (!seen || Math.abs(incoming) > Math.abs(seen.incoming)) {
    compressorGdd.set(elementId, { incoming, outgoing });
  }
}

export function compressorGddReading(elementId) {
  return compressorGdd.get(elementId) || null;
}

// metalens element id -> distinct wavelength/focal-length pairs observed on
// the most recent trace. The inspector uses the trace, not the source config,
// so filters and wavelength conversion upstream are reflected immediately.
let metalensHits = new Map();

function recordMetalensHit(elementId, wavelengthNm, focalLengthMm) {
  if (!elementId || !Number.isFinite(wavelengthNm) || !Number.isFinite(focalLengthMm)) return;
  let hits = metalensHits.get(elementId);
  if (!hits) { hits = new Map(); metalensHits.set(elementId, hits); }
  hits.set(wavelengthNm.toFixed(6), { wavelengthNm, focalLengthMm });
}

// crystal element id -> the OPO state its last pump ray produced.
let opoStates = new Map();

function recordOpo(elementId, state) {
  if (elementId) opoStates.set(elementId, state);
}

export function opoReading(elementId) {
  return opoStates.get(elementId) || null;
}

// OPCPA element/crystal id -> the seeded-amplifier state its last trace found.
let opcpaStates = new Map();

function recordOpcpa(elementId, state) {
  if (elementId) opcpaStates.set(elementId, state);
}

export function opcpaReading(elementId) {
  return opcpaStates.get(elementId) || null;
}

// crystal element id -> the band its last pump ray drew as a supercontinuum.
let supercontinuumStates = new Map();

export function supercontinuumReading(elementId) {
  return supercontinuumStates.get(elementId) || null;
}

// The crystal conversion modes that mix two beams rather than acting on one.
// The crystal mode with a chi(2) response: it doubles every beam and mixes
// any pair, so it needs to know what else is at the crystal.
export const MIX_CONVERTS = new Set(['shg', 'opcpa']);

// crystal element id -> every pair that met at it during this trace, keyed by
// the two beams' identities so the same pair is not counted once per sampling
// ray. The readout describes the crystal as a whole: one pair that cannot mix
// must not speak for a crystal where another pair is mixing.
let mixStates = new Map();

function recordMix(elementId, pair) {
  if (!elementId) return;
  let pairs = mixStates.get(elementId);
  if (!pairs) mixStates.set(elementId, pairs = new Map());
  // Both beams of a pair report it, so the key cannot depend on which of them
  // is speaking.
  const key = pair.state === 'oneBeam' ? 'oneBeam'
    : [pair.driverKey || pair.driverWl, pair.partnerKey || pair.partnerWl].sort().join('+');
  // A crystal that mixes anything has more to say than one that does not.
  if (key === 'oneBeam' && pairs.size) return;
  if (key !== 'oneBeam') pairs.delete('oneBeam');
  pairs.set(key, pair);
}

// specimen element id -> what its two-beam channels found about arrival
// timing this pass, so a silent signal can say why.
let specimenTimingStates = new Map();

// specimen element id -> why stimulated Raman transfer was not drawn, when the
// configuration is outside what the model covers.
let specimenSrsNotes = new Map();

function recordSrsNote(elementId, note) {
  if (elementId) specimenSrsNotes.set(elementId, note);
}

export function specimenSrsNote(elementId) {
  return specimenSrsNotes.get(elementId) || null;
}

function recordSpecimenTiming(elementId, reading) {
  if (!elementId) return;
  const held = specimenTimingStates.get(elementId);
  // A channel that is mixing has more to say than one that cannot, and one that
  // was actually timed has more to say than one whose check is switched off.
  if (held && held.state === 'mixing' && reading.state !== 'mixing') return;
  if (held && held.state !== 'ignored' && reading.state === 'ignored') return;
  specimenTimingStates.set(elementId, reading);
}

export function specimenTimingReading(elementId) {
  return specimenTimingStates.get(elementId) || null;
}

export function mixReading(elementId) {
  const pairs = mixStates.get(elementId);
  if (!pairs || !pairs.size) return null;
  const all = [...pairs.values()];
  if (all.length === 1 && all[0].state === 'oneBeam') return all[0];
  // The pair the readout talks about: whichever is actually mixing most, and
  // otherwise whichever is closest to doing so.
  const best = all.slice().sort((a, b) =>
    (b.state === 'mixing') - (a.state === 'mixing') || (b.overlap || 0) - (a.overlap || 0))[0];
  return all.length > 1 ? { ...best, alsoPairs: all.length - 1 } : best;
}

// Sum- and difference-frequency generation in a chi(2) crystal (the model is
// in parametric.js). The beam this ray carries is mixed with every other
// colour at the crystal, and each pair produces light only while both pulses
// are there: that extra line appearing is what finding time zero looks like on
// a bench, against the second harmonics that never move.
//
// Power is an allocation, not a two-field calculation. Doubling reserves its
// authored fraction of each beam; the mixing then draws its own authored
// fraction of what doubling leaves -- of BOTH beams of a pair, which is what
// puts a mixed line in the same range as the two harmonics beside it. Every
// pair a beam takes part in shares that one budget, so the outputs and the
// residual always add up to the beams that made them.
function mixingOutputs(s, ray, d, data) {
  const crystalId = s.el?.id || null;
  const shgShare = clampConversion(data.efficiency ?? 1);
  const fraction = clampConversion(data.mixEfficiency ?? 0.3);
  // Light this crystal made itself is not fed back into its own mixing.
  if (crystalId && Array.isArray(ray.parametricPath) && ray.parametricPath.includes(crystalId)) return null;
  const beams = data.incidentBeams || [];
  const partners = beams.filter(beam => Math.abs(beam.wl - ray.wl) >= MIXING_MIN_SEPARATION_NM);
  if (!partners.length) {
    recordMix(crystalId, { state: 'oneBeam' });
    return null;
  }
  const remainder = 1 - shgShare;
  // How much of itself one beam offers a pair, and the factor that keeps a
  // beam in several pairs from offering more of itself than it has.
  const request = (a, b) => {
    const overlap = mixOverlap(a, b);
    if (overlap.unsupported) return { overlap, ask: 0 };
    if (overlap.comparable && overlap.factor < MIN_OVERLAP) return { overlap, ask: 0 };
    return { overlap, ask: fraction * overlap.factor };
  };
  const beamScale = beam => {
    const asked = beams
      .filter(other => Math.abs(other.wl - beam.wl) >= MIXING_MIN_SEPARATION_NM)
      .reduce((total, other) => total + request(beam, other).ask, 0);
    return asked > 1 ? 1 / asked : 1;
  };
  // `wl` matters: without it this beam matches none of the partner filters in
  // beamScale, its own requests are never normalised, and a beam in several
  // saturated pairs would give away more of itself than it has.
  // Timed as its beam, not as this one sampling ray of it.
  const self = rayAsBeam(ray, beams);
  const ownScale = beamScale(self);
  // This sampling ray's share of its own beam, so a beam drawn as several rays
  // does not hand its partner's whole contribution to each of them.
  const ownBeam = beamRecordFor(ray, beams);
  const rayShare = ownBeam?.intensity > 0 ? Math.min(1, ray.intensity / ownBeam.intensity) : 1;

  const pairs = [];
  let debited = 0;
  const path = [...(Array.isArray(ray.parametricPath) ? ray.parametricPath : []), crystalId].filter(Boolean);
  const rays = [];
  for (const partner of partners) {
    const { overlap, ask } = request(self, partner);
    const reading = {
      partnerWl: partner.wl, driverWl: ray.wl,
      // Two trains of one colour are two pairs, so identity is the beam, not
      // just its wavelength — and both sides of a pair must name each other the
      // same way, or one pair would be counted as two.
      driverKey: probeBeamKey(ray), partnerKey: partner.key || `${partner.wl}`,
      wl: mixWavelength('sfg', ray.wl, partner.wl),
      dfgWl: data.mixDfg ? mixWavelength('dfg', ray.wl, partner.wl) : null,
      skewNs: overlap.skewNs, overlap: overlap.factor,
      repRateMHz: ray.pulse?.repRateMHz ?? null,
      partnerRepRateMHz: partner.pulse?.repRateMHz ?? null,
    };
    // Trains at different nominal repetition rates are outside this model
    // rather than physically impossible, and are reported as such.
    if (overlap.unsupported) { pairs.push({ ...reading, state: 'unsupported' }); continue; }
    if (overlap.comparable && overlap.factor < MIN_OVERLAP) { pairs.push({ ...reading, state: 'unsynchronized' }); continue; }
    pairs.push({ ...reading, state: 'mixing' });
    if (!(ask > 0) || !(remainder > 0)) continue;
    // What this beam gives the pair, whether or not it is the one that emits.
    const own = remainder * ask * ownScale;
    debited += own;
    // One output per pair: the shorter wavelength emits it, carrying what both
    // beams put in.
    if (ray.wl > partner.wl) continue;
    const fromPartner = remainder * request(partner, self).ask * beamScale(partner)
      * (partner.intensity || 0) * rayShare;
    const total = ray.intensity * own + fromPartner;
    const lines = [['sfg', reading.wl], ['dfg', reading.dfgWl]].filter(([, wl]) => wl > 0);
    if (!lines.length || !(total > 0)) continue;
    for (const [kind, wl] of lines) {
      // The two inputs' widths carry into the line they make, so a spectrum
      // readout compares it with the harmonics on the same footing.
      const bw = mixWidthNm(wl, ray.wl, pumpWidthNm(ray), partner.wl, pumpWidthNm(partner));
      rays.push({
        d, wl, bw, spec: bw > 0 ? gaussianSpectrum(wl, bw) : null, tag: kind,
        // Sum and difference frequency share the pair's allocation; asking for
        // the second line does not conjure more light.
        intensity: total / lines.length,
        pulse: mixPulse(ray.pulse, partner.pulse, {
          crystalId, kind, wl, bandwidthNm: bw,
          centerNs: overlap.centerNs, oplMm: ray.opl, repRateMHz: overlap.repRateMHz,
          partnerPulseOffset: overlap.partnerPulseOffset, periodNs: overlap.periodNs,
        }),
        parametricPath: path,
        // New light, referenced to the crystal exit like the OPO's outputs.
        gdd: 0,
        phaseValid: false,
        phaseIssue: 'sum/difference frequency output: optical phase relative to the inputs is not modelled',
      });
    }
  }
  for (const pair of pairs) recordMix(crystalId, pair);
  // `converted` is what this beam gave away, which is what its residual owes,
  // whether or not this ray was the one that drew the line.
  return debited > 0 || rays.length ? { rays, converted: debited } : null;
}

export function metalensReading(elementId) {
  return [...(metalensHits.get(elementId)?.values() || [])]
    .sort((a, b) => a.wavelengthNm - b.wavelengthNm);
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
// Bands are drawn as a curve rather than as stems, so they can afford far
// more points than the line budget without the plot becoming unreadable.
const MAX_BAND_SAMPLES = 384;

// Reduce a broadband profile to a bounded number of samples by merging
// neighbours. Grouping only ever merges adjacent wavelengths, so a bucket
// holding more than one really does span a range of colours.
// Split one source's spectral components into connected groups: any two
// whose supports overlap describe the same stretch of spectrum and must be
// resampled together, while components separated by a gap are separate
// measurements. Resampling all of them onto one shared grid instead makes
// the grid as coarse as the widest gap, which reports every narrow line
// several times wider than it is and fills the gaps with samples.
function clusterBySupport(components) {
  const entries = components
    .map(component => ({ component, support: spectrumSupport(component.spec) }))
    .filter(entry => entry.support && entry.support[1] > entry.support[0])
    .sort((a, b) => a.support[0] - b.support[0]);
  const clusters = [];
  for (const entry of entries) {
    const open = clusters[clusters.length - 1];
    if (open && entry.support[0] <= open.hi) {
      open.hi = Math.max(open.hi, entry.support[1]);
      open.components.push(entry.component);
    } else {
      clusters.push({ lo: entry.support[0], hi: entry.support[1], components: [entry.component] });
    }
  }
  return clusters;
}

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
      bandId: group[0].bandId,
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
  // are summarized per source for the same reason. If there are more line
  // peaks than the display budget, adjacent peaks are power-preservingly
  // summarized rather than silently dropping measured light.
  const lines = ordered.filter(sample => !sample.continuum);
  const band = ordered.filter(sample => sample.continuum);
  // Grouped per connected band rather than per source: bucketizing across a
  // gap would merge the far side of one line with the near side of the next
  // and report the join as a single very wide sample.
  const byBand = new Map();
  for (const sample of band) {
    const key = sample.bandId || sample.sourceId || '';
    const list = byBand.get(key) || [];
    list.push(sample);
    byBand.set(key, list);
  }
  // Discrete peaks and a sampled curve want different budgets. A dozen
  // stems is already a crowded plot, but a curve needs enough points to
  // keep whatever structure the band actually has -- several overlapping
  // passbands read as one band, and summarising it down to a couple of
  // dozen points would smooth its peaks back into a blob.
  const perBandLimit = Math.max(12, Math.floor(MAX_BAND_SAMPLES / Math.max(1, byBand.size)));
  const keptBand = [...byBand.values()].flatMap(list => bucketize(list, perBandLimit));
  const keptLines = lines.length <= MAX_SPECTRUM_SAMPLES
    ? lines
    : Array.from({ length: MAX_SPECTRUM_SAMPLES }, (_, index) => {
      const start = Math.floor(index * lines.length / MAX_SPECTRUM_SAMPLES);
      const end = Math.max(start + 1, Math.floor((index + 1) * lines.length / MAX_SPECTRUM_SAMPLES));
      const group = lines.slice(start, end);
      const power = group.reduce((sum, sample) => sum + sample.power, 0);
      return {
        wavelength: power > 0
          ? group.reduce((sum, sample) => sum + sample.wavelength * sample.power, 0) / power
          : group[0].wavelength,
        power,
        continuum: false,
        sourceId: group.every(sample => sample.sourceId === group[0].sourceId) ? group[0].sourceId : null,
        widthNm: null,
      };
    });
  return [...keptBand, ...keptLines]
    .sort((a, b) => a.wavelength - b.wavelength)
    .map(sample => ({ ...sample, color: wavelengthToColor(sample.wavelength) }));
}

function addSample(samples, wl, power, continuum = false, sourceId = null, widthNm = null, bandId = null) {
  // Keyed by source as well as wavelength: the spectrometer's relative mode
  // scales each source's own contribution to its own peak, which it cannot
  // do once two sources at the same colour have been added together.
  //
  // `bandId` additionally names which connected stretch of spectrum a
  // continuum sample belongs to. One source can deliver several bands that
  // do not touch -- an AOTF selecting three lines out of one supercontinuum
  // is the standard case -- and everything downstream has to keep them
  // apart, or a summary spanning the gaps ends up describing light that is
  // not there.
  const wavelength = Math.round(wl * 10) / 10;
  const key = `${sourceId || ''}|${continuum ? 'band' : 'line'}|${bandId || ''}|${wavelength}`;
  const sample = samples.get(key)
    || { wavelength, power: 0, continuum: false, sourceId: sourceId || null, bandId: bandId || null, widthNm: null };
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
function detectorSpectrum(hits) {
  const samples = new Map();
  const bands = new Map();
  for (const hit of hits) {
    if (!Number.isFinite(hit.power) || hit.power <= 0) continue;
    let spec = hit.spec || null;
    if (!spec && hit.spectralContinuum) {
      const width = Math.max(0, Number(hit.spectralWidthNm) || 0);
      const lo = Number.isFinite(hit.spectralLo) ? hit.spectralLo : hit.wl - width / 2;
      const hi = Number.isFinite(hit.spectralHi) ? hit.spectralHi : hit.wl + width / 2;
      spec = flatSpectrum(lo, hi);
    }
    if (spec) {
      const source = hit.sourceId || null;
      const list = bands.get(source) || [];
      list.push({ spec, power: hit.power });
      bands.set(source, list);
      continue;
    }
    if (Number.isFinite(hit.wl)) addSample(samples, hit.wl, hit.power, false, hit.sourceId, null);
  }
  // Every connected band across every source, collected before any is
  // sampled: they share one display budget, and a band cannot choose how
  // finely to sample itself until it knows how many others it is sharing
  // with. Choosing the grid to fit the budget rather than summarising down
  // to it afterwards is what keeps peak heights honest -- merging finished
  // samples at a fractional stride averages some peaks with their
  // neighbours and leaves others alone, which tilts an envelope that should
  // be symmetric.
  const allClusters = [];
  for (const [sourceId, allComponents] of bands) {
    clusterBySupport(allComponents).forEach((cluster, clusterIndex) => {
      allClusters.push({ ...cluster, sourceId, bandId: `${sourceId || ''}#${clusterIndex}` });
    });
  }
  const perBandGrid = Math.max(48, Math.floor(MAX_BAND_SAMPLES / Math.max(1, allClusters.length)));

  {
    for (const { lo, hi, components, sourceId, bandId } of allClusters) {
    if (!(hi > lo)) continue;
    // The grid has to resolve the narrowest thing inside the cluster, not
    // just span its ends. Overlapping passbands -- several AOTF channels
    // whose wings touch, say -- are one connected band carrying fine
    // structure, and a grid sized only to the cluster's width would average
    // that structure away and report a smooth blob where there are peaks.
    const finest = Math.min(...components.map(component => {
      const stats = spectrumStats(component.spec);
      const [componentLo, componentHi] = spectrumSupport(component.spec);
      const width = stats?.fwhm > 0 ? stats.fwhm : (componentHi - componentLo);
      return width > 0 ? width : hi - lo;
    }));
    const count = Math.max(48, Math.min(perBandGrid,
      Math.ceil((hi - lo) / Math.max(1e-9, finest / 6)) + 1));
    const step = (hi - lo) / (count - 1);
    const powers = Array(count).fill(0);
    let targetPower = 0;
    for (const component of components) {
      const [componentLo, componentHi] = spectrumSupport(component.spec);
      const integrationSteps = 256;
      const integrationStep = (componentHi - componentLo) / integrationSteps;
      let area = 0;
      for (let i = 0; i <= integrationSteps; i++) {
        const weight = spectrumWeight(component.spec, componentLo + integrationStep * i);
        area += weight * (i === 0 || i === integrationSteps ? 0.5 : 1);
      }
      area *= integrationStep;
      if (!(area > 0)) continue;
      targetPower += component.power;
      // A flat slice is binned by how much of each display bin it covers.
      // Point-sampling it would count a grid point on the edge two adjacent
      // slices share in both of them: the slices a prism or glass rod cuts a
      // flat continuum into then showed a spike twice the band's height at
      // every junction.
      const flat = component.spec.kind === 'flat';
      for (let i = 0; i < count; i++) {
        const wl = lo + step * i;
        const weight = flat
          ? Math.max(0, Math.min(wl + step / 2, componentHi) - Math.max(wl - step / 2, componentLo)) / step
          : spectrumWeight(component.spec, wl) * (i === 0 || i === count - 1 ? 0.5 : 1);
        powers[i] += component.power * weight / area * step;
      }
    }
    const sampledPower = powers.reduce((sum, power) => sum + power, 0);
    const scale = sampledPower > 0 ? targetPower / sampledPower : 0;
    for (let i = 0; i < count; i++) {
      addSample(samples, lo + step * i, powers[i] * scale, true, sourceId, step, bandId);
    }
    }
  }
  return bucketizeSpectrum(samples);
}

function cameraAdjustedSpectrum(hits, camera) {
  const continuumOf = value => Boolean(value.spectralContinuum || value.spec || value.bw > 0 || value.continuum);
  const keyOf = value => JSON.stringify([
    value.sourceId || null,
    Number(value.wavelength ?? value.wl).toFixed(9),
    continuumOf(value) ? 'continuum' : 'line',
    continuumOf(value) ? (value.pathKey || null) : null,
  ]);
  const quadraturePower = hit => {
    const power = Math.max(0, Number(hit.power) || 0);
    if (hit.sampleGrid !== 'edges' || !(hit.sampleCount > 1) || !Number.isInteger(hit.sample)) return power;
    const endpoint = hit.sample === 0 || hit.sample === hit.sampleCount - 1;
    return power * hit.sampleCount / (hit.sampleCount - 1) * (endpoint ? 0.5 : 1);
  };
  const final = new Map();
  for (const entry of camera.spectralPowers || []) {
    const key = keyOf(entry);
    final.set(key, (final.get(key) || 0) + Math.max(0, Number(entry.power) || 0));
  }
  const raw = new Map();
  for (const hit of hits) {
    const key = keyOf(hit);
    raw.set(key, (raw.get(key) || 0) + quadraturePower(hit));
  }
  const adjusted = hits.map(hit => {
    const key = keyOf(hit);
    const denominator = raw.get(key) || 0;
    const target = final.get(key) || 0;
    return { ...hit, power: denominator > 0 ? quadraturePower(hit) * target / denominator : 0 };
  });
  return detectorSpectrum(adjusted);
}

function coherentCameraPolarization(camera, hits) {
  let total = 0, s1 = 0, s2 = 0, s3 = 0;
  const stateOf = hit => {
    if (hit.stokes && Number.isFinite(hit.stokes.s1)
        && Number.isFinite(hit.stokes.s2) && Number.isFinite(hit.stokes.s3)) {
      return hit.stokes;
    }
    if (typeof hit.pol === 'number') return linearStokes(hit.pol);
    if (hit.pol === 'c') return { s1: 0, s2: 0, s3: 1 };
    if (hit.pol === undefined || hit.pol === null) return { s1: 0, s2: 0, s3: 0 };
    return null;
  };
  const sameState = (left, right) => left && right
    && Math.abs(left.s1 - right.s1) < 1e-7
    && Math.abs(left.s2 - right.s2) < 1e-7
    && Math.abs(left.s3 - right.s3) < 1e-7;

  for (const entry of camera.spectralPowers || []) {
    const power = Math.max(0, Number(entry.power) || 0);
    if (!(power > 1e-12)) continue;
    const matching = hits.filter(hit => (hit.sourceId || null) === (entry.sourceId || null)
      && Math.abs(Number(hit.wl) - Number(entry.wavelength)) < 1e-7
      && Boolean(hit.spectralContinuum || hit.spec || hit.bw > 0) === Boolean(entry.continuum)
      && (!entry.continuum || (hit.pathKey || null) === (entry.pathKey || null)));
    if (!matching.length) return null;
    const states = matching.map(stateOf);
    const state = states[0];
    // The scalar field reconstruction can rescale a contribution only when
    // all of its routes share one Stokes state. A spatially varying Jones
    // mixture needs a vector-field camera model; report that honestly rather
    // than reusing the pre-interference ray average.
    if (!state || states.some(candidate => !sameState(state, candidate))) return null;
    total += power;
    s1 += state.s1 * power;
    s2 += state.s2 * power;
    s3 += state.s3 * power;
  }
  if (!(total > 1e-12)) return 'No detected field';
  return polarizationDescription({ s1: s1 / total, s2: s2 / total, s3: s3 / total });
}

function averageGateTransmission(pulse) {
  if (!pulse?.gates?.length) return 1;
  // Every field that changes the waveform must be in the key. The two output
  // ports of a polarization-modulated PBS differ *only* by their high/low
  // levels, so omitting those made one port silently reuse the other's
  // cached average.
  const key = [pulse.repRateMHz, pulse.pulseWidthFs, pulse.phaseNs, ...pulse.gates.flatMap(g => [
    g.opl, g.frequencyMHz, g.duty, g.phaseNs, g.shape || 'square', g.depth ?? 1,
    g.symmetry ?? 1, g.invert ? 1 : 0, g.high ?? 1, g.low ?? 0,
  ])].join('|');
  if (!gateTransmissionCache.has(key)) gateTransmissionCache.set(key, pulseGateTransmission(pulse));
  return gateTransmissionCache.get(key);
}

function detectorSample(ray, surface, u, oplMm, pathKey, sensorMiss = false) {
  const gateDuty = averageGateTransmission(ray.pulse);
  return {
    power: (Number.isFinite(ray.power) ? ray.power : ray.intensity) * gateDuty,
    // What this branch carries with its gates wide open. `power` above is
    // already duty-averaged, so a time trace built on it would apply the gate
    // a second time. Kept as the factor rather than the product so it stays
    // correct when power is rescaled later (coherent groups do that).
    gateDuty,
    intensity: ray.intensity,
    wl: ray.wl,
    bw: ray.bw || 0,
    spec: ray.spec || null,
    approximation: ray.approximation || null,
    spectralContinuum: ray.spectralContinuum === true,
    spectralWidthNm: Number.isFinite(ray.spectralWidthNm) ? ray.spectralWidthNm : null,
    spectralLo: Number.isFinite(ray.spectralLo) ? ray.spectralLo : null,
    fanLo: Number.isFinite(ray.fanLo) ? ray.fanLo : null,
    fanHi: Number.isFinite(ray.fanHi) ? ray.fanHi : null,
    spectralHi: Number.isFinite(ray.spectralHi) ? ray.spectralHi : null,
    sourceId: ray.sourceId || null,
    sample: Number.isInteger(ray.sample) ? ray.sample : null,
    sampleCount: Number.isInteger(ray.sampleCount) ? ray.sampleCount : null,
    sampleGrid: ray.sampleGrid === 'edges' ? 'edges' : null,
    pathKey,
    oplMm: Number.isFinite(oplMm) ? oplMm : null,
    coherenceId: ray.coherenceId || null,
    phaseValid: ray.phaseValid === true,
    phaseIssue: ray.phaseIssue || null,
    phaseOffset: Number.isFinite(ray.phaseOffset) ? ray.phaseOffset : 0,
    fieldGroupCount: Number.isInteger(ray.fieldGroupCount) ? ray.fieldGroupCount : 1,
    originId: ray.originId || null,
    pol: ray.pol,
    stokes: cloneStokes(ray.stokes),
    u,
    sensorMiss,
    // Ray direction at the face, plus the surface tangent, so a wavefront
    // sensor can read convergence from real ray slopes instead of trying to
    // difference the beam's drawn width between two planes.
    dx: ray.dx,
    dy: ray.dy,
    tx: surface.b.x - surface.a.x,
    ty: surface.b.y - surface.a.y,
    aperture: surface.data.aperture || 0,
    detectorType: surface.data.detectorType || 'Detector',
    readoutKind: registry[surface.el?.type]?.readoutKind || 'detector',
    gain: surface.data.gain,
    saturation: surface.data.saturation,
    darkInput: surface.data.darkInput,
    pixels: surface.data.pixels,
    profileScale: surface.data.profileScale,
    interference: surface.data.interference !== false,
    pathDelayNs: Number.isFinite(oplMm) ? oplMm / C_MM_PER_NS : 0,
    gddFs2: Number.isFinite(ray.gdd) ? ray.gdd : 0,
    groupDelayDifferenceFs: Number.isFinite(ray.groupDelayDifferenceFs)
      ? ray.groupDelayDifferenceFs : 0,
    pulse: ray.pulse ? { ...ray.pulse } : null,
  };
}

function recordDetectorHit(ray, hit) {
  const id = hit.surface.el?.id;
  if (!id) return;
  if (!detectorHits.has(id)) detectorHits.set(id, []);
  detectorHits.get(id).push(detectorSample(ray, hit.surface, hit.u, ray.opl, ray.sig || '', false));
}

// The duration of a filtered train, from every piece of spectrum that
// arrives. The path GDD is the power-weighted mean over the arrivals: pieces
// at different wavelengths legitimately carry different GDD, the glass's at
// each. Arrivals at the same wavelength that took paths with different
// dispersion are separate pulses, and then there is no one duration.
function filteredTrainDuration(pulse, hits) {
  const pieces = hits.map(h => pulseSpectrumPiece(h, h.pulse, Math.max(0, h.power || 0)));
  if (pieces.some(piece => !piece)) return pulseDurationAfterDispersion({ ...pulse, filteredPieces: null }, 0, 0);
  const weight = hits.reduce((sum, h) => sum + Math.max(0, h.power || 0), 0);
  const gdd = weight > 0 ? hits.reduce((sum, h) => sum + (h.gddFs2 || 0) * Math.max(0, h.power || 0), 0) / weight : 0;
  const cNmFs = 299.792458;
  const byWavelength = new Map();
  hits.forEach((h, i) => {
    const key = Math.round(h.wl * 1e6);
    const group = byWavelength.get(key) || [];
    group.push(i);
    byWavelength.set(key, group);
  });
  for (const group of byWavelength.values()) {
    const values = group.map(i => hits[i].gddFs2 || 0);
    const spread = Math.max(...values) - Math.min(...values);
    const halfWidth = Math.max(...group.map(i => Math.PI * cNmFs * (1 / pieces[i].lo - 1 / pieces[i].hi)));
    if (spread * halfWidth * halfWidth / 2 > PATH_PHASE_TOLERANCE_RAD) {
      return { durationFs: null, available: false, model: PATHS_DISAGREE, totalGddFs2: null };
    }
  }
  // One quadratic phase stands for the whole band. Where the glass's GDD
  // differs across the band's own pieces by enough to move the phase at its
  // edge by more than half a radian, that is no longer a description of the
  // pulse -- the neglected part is higher-order dispersion -- and it declines.
  const lo = Math.min(...pieces.map(p => p.lo)), hi = Math.max(...pieces.map(p => p.hi));
  const halfBand = Math.PI * cNmFs * (1 / lo - 1 / hi);
  const deviation = Math.max(...hits.map(h => Math.abs((h.gddFs2 || 0) - gdd)));
  if (deviation * halfBand * halfBand / 2 > 0.5) {
    return { durationFs: null, available: false, model: DISPERSION_UNAVAILABLE.broadGdd, totalGddFs2: null };
  }
  return filteredPulseDuration(pulse, pieces, gdd);
}

// Qualitative measurement at a one-sided detector face. Scalar detectors use
// relative ray weight; a camera's `signal` is the sum of its final
// pixel-integrated profile and can therefore include coherent cross terms.
// Neither is calibrated optical power.
export function detectorReading(elementId) {
  const hits = detectorHits.get(elementId) || [];
  const nearMisses = (detectorMisses.get(elementId) || [])
    .filter(hit => Number.isFinite(hit.power) && hit.power > 1e-12);
  if (!hits.length && !nearMisses.length) return null;
  // A fully blocked pulse can still geometrically reach the detector. It must
  // not contaminate spectrum, polarization, spot, timing, or source counts.
  const activeHits = hits.filter(h => Number.isFinite(h.power) && h.power > 1e-12);
  const groupedDarkHits = hits.filter(h => h.fieldGroupCount > 1 && h.phaseValid);
  const descriptor = activeHits[0] || groupedDarkHits[0] || nearMisses[0];
  const detectorType = descriptor?.detectorType || 'Detector';
  const readoutKind = descriptor?.readoutKind || 'detector';
  const raySignal = activeHits.reduce((sum, h) => sum + Math.max(0, h.power), 0);
  if (readoutKind !== 'camera' && raySignal <= 1e-12) return null;
  const cameraHits = readoutKind === 'camera'
    ? [...(activeHits.length ? activeHits : groupedDarkHits), ...nearMisses]
    : activeHits;
  if (!cameraHits.length) return null;
  const metadataPower = cameraHits.reduce((sum, hit) => sum + Math.max(0, hit.power), 0);
  let wavelength = cameraHits.reduce((sum, h) => sum + h.wl * h.power, 0) / metadataPower;
  // `bw` is a width about `wl`, which is right for a Gaussian laser line or a
  // flat continuum but not for a line spectrum: a lamp's lines are not
  // centred on its brightest one, so mercury would report 111-760 nm instead
  // of the 365-1014 nm it actually emits. A line spectrum states its own
  // extent, so use that.
  const hitBand = h => (h.spec?.kind === 'lines'
    ? spectrumSupport(h.spec)
    : [h.wl - h.bw / 2, h.wl + h.bw / 2]);
  let bandMin = Math.min(...cameraHits.map(h => hitBand(h)[0]));
  let bandMax = Math.max(...cameraHits.map(h => hitBand(h)[1]));
  const us = activeHits.map(h => h.u);
  const aperture = Math.max(...cameraHits.map(h => h.aperture || 0));
  let spotSpan = us.length ? aperture * (Math.max(...us) - Math.min(...us)) : 0;
  let color = mixedWavelengthColor(cameraHits);
  let spectrum = detectorSpectrum(cameraHits);
  let dark = false;
  let signal = raySignal, outputSignal = signal, saturated = false, profile = null, profileColors = null, centroid = null;
  let depositedProfile = null, depositedSignal = raySignal, profileMode = null, coherentPaths = 0, interference = null;
  let cameraResult = null;
  // How much of each originating source's own emitted power arrived here.
  // Every source launches rays summing to 1, and each interaction scales that
  // weight by what it actually transmits, so this fraction already carries the
  // whole source-to-detector efficiency chain -- split ratios, filter
  // transmission, clipped apertures, chopper duty, conversion efficiency.
  // Attribution is by originId, so a specimen's fluorescence is still charged
  // to the laser that pumped it rather than to the specimen.
  const arrivedByOrigin = new Map();
  for (const hit of activeHits) {
    const key = hit.originId || null;
    arrivedByOrigin.set(key, (arrivedByOrigin.get(key) || 0) + Math.max(0, hit.power));
  }
  const sourceFractions = [...arrivedByOrigin].map(([sourceId, fraction]) => ({ sourceId, fraction }));
  let snr = null, darkOutput = null, gain = null;
  if (readoutKind === 'pmt') {
    gain = Math.max(1, descriptor.gain || 1);
    const saturation = Math.max(1, descriptor.saturation || 100);
    // The dark floor is referred to the photocathode: the equivalent input
    // that would produce the same output as the tube's own dark current. It
    // is amplified by exactly the same gain as the signal, which is why the
    // ratio below does not depend on gain at all — the single most useful
    // thing a PMT model can say, and the one most often assumed otherwise.
    const darkInput = Math.max(0, Number(descriptor.darkInput) || 0);
    outputSignal = Math.min(saturation, signal * gain);
    saturated = signal * gain >= saturation;
    darkOutput = darkInput * gain;
    snr = darkInput > 0 ? signal / darkInput : Infinity;
  } else if (readoutKind === 'camera') {
    const count = Math.min(64, Math.max(8, Math.round(descriptor.pixels || 16)));
    const camera = cameraProfileFromHits(cameraHits, count, aperture, {
      interference: descriptor.interference !== false,
    });
    cameraResult = camera;
    profile = camera.profile;
    depositedProfile = camera.depositedProfile;
    depositedSignal = camera.depositedSignal;
    profileColors = camera.profileColors;
    centroid = camera.centroid;
    profileMode = camera.profileMode;
    coherentPaths = camera.coherentPaths;
    interference = camera.interference;
    const upstreamGroupCount = Math.max(1, ...hits.map(hit => hit.fieldGroupCount || 1));
    if (upstreamGroupCount > 1 && profileMode !== 'coherent') {
      profileMode = 'coherent';
      coherentPaths = upstreamGroupCount;
      interference = {
        ...interference,
        applied: true,
        coherentSources: 1,
        pathCount: upstreamGroupCount,
        reason: 'fields were grouped at an upstream recombination surface',
      };
    }
    signal = profile.reduce((sum, value) => sum + value, 0);
    outputSignal = signal;
    spectrum = cameraAdjustedSpectrum(cameraHits, camera);
    dark = profileMode === 'coherent' && signal <= 1e-12;
    if (!(signal > 1e-12) && profileMode !== 'coherent') return null;
    if (dark) {
      wavelength = null;
      bandMin = null;
      bandMax = null;
      spotSpan = 0;
      color = '#5d7380';
    } else {
      const measured = spectrum.filter(sample => Number.isFinite(sample.power) && sample.power > 1e-12);
      const measuredPower = measured.reduce((sum, sample) => sum + sample.power, 0);
      if (measuredPower > 1e-12) {
        wavelength = measured.reduce((sum, sample) => sum + sample.wavelength * sample.power, 0) / measuredPower;
        bandMin = Math.min(...measured.map(sample => sample.wavelength - (sample.widthNm || 0) / 2));
        bandMax = Math.max(...measured.map(sample => sample.wavelength + (sample.widthNm || 0) / 2));
        color = mixedWavelengthColor(measured.map(sample => ({ wl: sample.wavelength, power: sample.power })));
      }
      // Physical support comes from the continuous tube reconstruction, not
      // from the number of occupied output bins. Binning therefore changes
      // resolution without changing the reported beam diameter.
      spotSpan = camera.supportSpan;
    }
  }
  const polarizationHits = readoutKind === 'camera' ? cameraHits : activeHits;
  const stokesHits = polarizationHits.filter(h => h.stokes);
  const numericPol = polarizationHits.filter(h => typeof h.pol === 'number').map(h => h.pol);
  let polarization = 'Unpolarized';
  // The power-weighted mean of every arriving hit's Stokes vector. This is
  // the incoherent sum the Stokes formalism is built for: two equally strong
  // orthogonal beams average to the origin of the Poincare sphere and are
  // genuinely unpolarized, which is a state a single ray cannot represent.
  // Exposed rather than kept local because the polarimeter needs the vector
  // itself, not just the sentence describing it -- deriving them separately
  // let the label and the numbers disagree on one reading.
  let normalizedStokes = null;
  if (stokesHits.length === polarizationHits.length) {
    const sw = stokesHits.reduce((sum, h) => sum + Math.max(0, h.power), 0);
    normalizedStokes = {
      s1: stokesHits.reduce((sum, h) => sum + h.stokes.s1 * h.power, 0) / sw,
      s2: stokesHits.reduce((sum, h) => sum + h.stokes.s2 * h.power, 0) / sw,
      s3: stokesHits.reduce((sum, h) => sum + h.stokes.s3 * h.power, 0) / sw,
    };
    polarization = polarizationDescription(normalizedStokes);
  } else if (polarizationHits.every(h => h.pol === 'c')) polarization = 'Circular';
  else if (numericPol.length === polarizationHits.length) {
    const lo = Math.min(...numericPol), hi = Math.max(...numericPol);
    polarization = hi - lo < 0.5 ? `Linear ${Math.round((lo + hi) / 2)}°` : 'Mixed linear';
  } else if (polarizationHits.some(h => h.pol !== undefined)) polarization = 'Mixed';
  if (readoutKind === 'camera' && !dark && cameraResult) {
    polarization = coherentCameraPolarization(cameraResult, polarizationHits)
      || 'Not resolved for camera mix';
  }
  if (dark) {
    polarization = 'No detected field';
    // A coherently cancelled port has no field, so it has no polarization
    // state either. Leaving the vector populated would let a reading say
    // "No detected field" while still handing downstream surfaces a
    // confident DoP of 1.0 -- the same label-versus-numbers split that the
    // polarimeter's own Stokes readout was fixed for.
    normalizedStokes = null;
  }
  const pulsed = activeHits.filter(h => h.pulse);
  let pulse = null;
  if (pulsed.length) {
    const delays = pulsed.map(h => h.pathDelayNs).filter(Number.isFinite);
    const first = pulsed[0].pulse;
    const hitGroups = new Map();
    for (const h of pulsed) {
      const p = h.pulse;
      const key = p.sourceId || [p.repRateMHz, p.pulseWidthFs, p.phaseNs].join(':');
      const group = hitGroups.get(key) || [];
      group.push(h);
      hitGroups.set(key, group);
    }
    const trains = [...hitGroups.values()].map(sourceHits => {
      // Every arrival's own record counts, not just the first: a filter
      // crossing part of a beam marks only the rays it touched, and which
      // half arrives first must not decide whether the train is valid. An
      // invalid record anywhere decides for the train, and records that
      // disagree about phase or duration make it unavailable too.
      const records = [...new Set(sourceHits.map(h => h.pulse))];
      // A filtered record is not invalid: its duration is worked out from the
      // spectrum that arrives. One that is unavailable for another reason
      // still decides for the train.
      const invalidRecord = records.find(r => r.fieldIssue || r.durationUnknown || r.etalonComb);
      const filteredRecord = invalidRecord ? null : records.find(r => r.spectrumReshaped);
      const provenance = r => [r.transformLimited === true, r.spectralPhase || '', r.inputChirp || '',
        r.pulseWidthFs, r.bandwidthNm, r.pulseShape || 'gauss'].join('|');
      const recordsDisagree = !invalidRecord && new Set(records.map(provenance)).size > 1;
      const p = invalidRecord || filteredRecord || sourceHits[0].pulse;
      const centerWavelength = Number.isFinite(p.centerWavelengthNm)
        ? p.centerWavelengthNm : sourceHits[0].wl;
      const nearestDistance = Math.min(...sourceHits.map(h => Math.abs(h.wl - centerWavelength)));
      const centerHits = sourceHits.filter(h => Math.abs(Math.abs(h.wl - centerWavelength) - nearestDistance) < 1e-7);
      const weight = centerHits.reduce((sum, h) => sum + Math.max(0, h.power || 0), 0);
      const weighted = key => weight > 0
        ? centerHits.reduce((sum, h) => sum + h[key] * Math.max(0, h.power || 0), 0) / weight
        : centerHits[0]?.[key] || 0;
      const gddFs2 = weighted('gddFs2');
      // The colour a cross-correlation mixes is the one that ARRIVES. Source
      // metadata survives wavelength conversion unchanged -- an SHG crystal
      // rewrites ray.wl but not pulse.centerWavelengthNm -- so a sum-frequency
      // readout built on it would name the emitters' colours rather than the
      // light actually incident on the face.
      const arrivingWeight = sourceHits.reduce((sum, h) => sum + Math.max(0, h.power || 0), 0);
      const arrivingCenterNm = arrivingWeight > 0
        ? sourceHits.reduce((sum, h) => sum + h.wl * Math.max(0, h.power || 0), 0) / arrivingWeight
        : sourceHits[0]?.wl;
      const groupDelayDifferenceFs = weighted('groupDelayDifferenceFs');
      // A sampled envelope answers for itself, at this detector's GDD. When
      // it cannot -- several temporal paths, or a field that no longer fits
      // its window -- the train is unavailable: the analytic model is never
      // asked to stand in for a field that failed.
      const fieldIssue = p.field ? (p.fieldIssue
        || (sourceHits.some(h => h.pulse.field !== p.field || Math.abs(h.gddFs2 - gddFs2) > 1e-6)
          ? 'Multiple temporal paths reach this sensor; their combined envelope is not modeled.' : null)) : null;
      const rawEnvelope = p.field && !fieldIssue ? fieldMetrics(p.field, gddFs2) : null;
      const envelopeScale = p.fieldReferencePower > 0
        ? sourceHits.reduce((sum, h) => sum + Math.max(0, h.power || 0), 0) / p.fieldReferencePower : 1;
      const envelope = rawEnvelope ? {
        ...rawEnvelope, energyJ: rawEnvelope.energyJ * envelopeScale, peakPowerW: rawEnvelope.peakPowerW * envelopeScale,
      } : null;
      // Every centre-wavelength arrival is a path this train took; the model
      // answers only when those paths agree on one duration.
      let duration = p.field
        ? (envelope
          ? { durationFs: envelope.fwhmFs, available: true, model: 'Sampled envelope · argon capillary' }
          : { durationFs: null, available: false, model: fieldIssue || 'Pulse exceeds the numerical time window.' })
        : filteredRecord ? filteredTrainDuration(p, sourceHits)
          : pulseDurationAcrossPaths(p, centerHits.map(h => ({
            gddFs2: h.gddFs2, groupDelayDifferenceFs: h.groupDelayDifferenceFs || 0, weight: h.power,
          })));
      // A prism or grating fans the pulse into wavelength samples, and an
      // aperture can then catch only some of them. The duration model assumes
      // the whole band arrives, so where the arriving cells leave part of it
      // uncovered it declines -- after any earlier reason to decline.
      if (duration?.available !== false && recordsDisagree) {
        duration = { durationFs: null, available: false, model: DISPERSION_UNAVAILABLE.recordsDiffer };
      }
      if (duration?.available !== false && !filteredRecord && !fannedBandCovered(p, sourceHits)) {
        duration = { durationFs: null, available: false, model: DISPERSION_UNAVAILABLE.partialFan };
      }
      return {
        repRateMHz: p.repRateMHz,
        pulseWidthFs: p.pulseWidthFs,
        phaseNs: p.phaseNs,
        gates: Array.isArray(p.gates) ? p.gates.map(g => ({ ...g })) : [],
        pathDelayNs: Math.min(...sourceHits.map(h => h.pathDelayNs)),
        gddFs2,
        groupDelayDifferenceFs,
        stretchedPulseWidthFs: duration?.durationFs ?? null,
        dispersionModel: duration?.model ?? null,
        transformLimitFs: duration?.transformLimitFs ?? null,
        inputGddFs2: duration?.inputGddFs2 ?? null,
        totalGddFs2: duration?.totalGddFs2 ?? gddFs2,
        envelope,
        fieldIssue: p.field && !envelope ? duration.model : (p.fieldIssue || null),
        // A cross-correlation is between two specific trains, so it needs each
        // one's own shape and colour rather than the aggregate's -- the whole
        // point is that the two arms differ.
        pulseShape: p.pulseShape || 'gauss',
        centerWavelengthNm: Number.isFinite(arrivingCenterNm) ? arrivingCenterNm : centerWavelength,
      };
    });
    // What a photodiode actually sums. `trains` groups by source, which is
    // what a correlator needs -- two arms, two trains -- but it keeps one
    // representative pulse per source, so branches of the same beam that are
    // gated DIFFERENTLY collapse into whichever arrived first. An AOM's
    // zeroth order is exactly that: a residual that is always present plus
    // the diffracted light handed back while the RF is off. Reported through
    // `trains` alone it looked like it switched fully off.
    //
    // So the time trace gets its own view: one entry per distinct gating,
    // each weighted by the UNGATED intensity arriving on it (the hit's own
    // `power` is already duty-averaged, which would apply the gate twice).
    // Summing these is what a detector does, and the weights are relative to
    // one source beam, so an element that passes only part of the light shows
    // up as a trace that no longer reaches full height.
    const branchGroups = new Map();
    for (const h of pulsed) {
      const gates = Array.isArray(h.pulse.gates) ? h.pulse.gates : [];
      const key = [h.pulse.sourceId || '', ...gates.map(g => [
        g.opl, g.frequencyMHz, g.duty, g.phaseNs, g.shape || 'square', g.depth ?? 1,
        g.symmetry ?? 1, g.invert ? 1 : 0, g.high ?? 1, g.low ?? 0,
      ].join(','))].join('|');
      const group = branchGroups.get(key) || { gates: gates.map(g => ({ ...g })), weight: 0 };
      // Undo the duty averaging already in `power` to recover the level this
      // branch sits at while its gates are open, still on the scale where one
      // whole source beam is 1.
      const duty = Number.isFinite(h.gateDuty) && h.gateDuty > 1e-9 ? h.gateDuty : 1;
      group.weight += Math.max(0, h.power || 0) / duty;
      branchGroups.set(key, group);
    }
    const branches = [...branchGroups.values()];
    const sources = new Set(pulsed.map(h => h.pulse.sourceId).filter(Boolean));
    const trainSettings = new Set(trains.map(p => [p.repRateMHz, p.pulseWidthFs, p.phaseNs].join(':')));
    const mixed = trainSettings.size > 1;
    const trainWeight = trains.length || 1;
    const gddFs2 = trains.reduce((sum, train) => sum + train.gddFs2, 0) / trainWeight;
    const gddValues = trains.map(train => train.gddFs2);
    // Several trains with the same settings share one readout only when they
    // also agree on a duration; otherwise the pairing of train 0's width with
    // the mean GDD would describe no pulse that actually arrives.
    const widths = trains.map(train => train.stretchedPulseWidthFs);
    const trainsAgree = trains.length === 1 || (widths.every(Number.isFinite)
      && (Math.max(...widths) - Math.min(...widths)) / Math.max(1e-9, widths[0]) <= 0.02);
    const duration = mixed ? null : trainsAgree ? trains[0]
      : { stretchedPulseWidthFs: null, dispersionModel: PATHS_DISAGREE, totalGddFs2: null };
    pulse = {
      sources: Math.max(1, sources.size),
      mixed,
      repRateMHz: mixed ? null : first.repRateMHz,
      pulseWidthFs: mixed ? null : first.pulseWidthFs,
      phaseNs: mixed ? null : first.phaseNs,
      // The autocorrelator needs the real shape to show what assuming the
      // wrong one would cost, and whether a duration is derivable at all.
      pulseShape: mixed ? null : (first.pulseShape || 'gauss'),
      transformLimited: mixed ? null : first.transformLimited === true,
      trains,
      branches,
      gddFs2,
      gddRangeFs2: [Math.min(...gddValues), Math.max(...gddValues)],
      groupDelayDifferenceFs: duration?.groupDelayDifferenceFs ?? null,
      stretchedPulseWidthFs: duration?.stretchedPulseWidthFs ?? null,
      dispersionModel: duration?.dispersionModel ?? null,
      transformLimitFs: duration?.transformLimitFs ?? null,
      inputGddFs2: duration?.inputGddFs2 ?? null,
      totalGddFs2: duration?.totalGddFs2 ?? gddFs2,
      envelope: !mixed && trains.length === 1 ? trains[0].envelope : null,
      fieldIssue: trains.find(t => t.fieldIssue)?.fieldIssue || null,
      earliestPathDelayNs: delays.length ? Math.min(...delays) : 0,
      arrivalSpreadPs: delays.length ? (Math.max(...delays) - Math.min(...delays)) * 1000 : 0,
    };
  }
  // Caveats riding on the arriving light -- a hollow-core fiber that could
  // only continue it linearly, say. Spectrum, power and every other readout
  // of this detector describe light the model did not fully compute.
  const approximations = [...new Set(activeHits.map(h => h.approximation).filter(Boolean))];
  return {
    signal,
    approximations,
    samples: readoutKind === 'camera' ? cameraHits.filter(hit => !hit.sensorMiss).length : activeHits.length,
    wavelength,
    bandMin,
    bandMax,
    polarization,
    normalizedStokes,
    spotSpan,
    color,
    spectrum,
    convergence: detectorConvergence(activeHits),
    pulse,
    detectorType,
    readoutKind,
    outputSignal,
    saturated,
    sourceFractions,
    gain,
    darkOutput,
    snr,
    profile,
    profileScale: activeHits[0]?.profileScale === 'fit' ? 'fit' : 'absolute',
    depositedProfile,
    depositedSignal,
    profileColors,
    centroid,
    profileMode,
    coherentPaths,
    interference,
    dark,
  };
}

// sample the beam nearest to (x,y): returns {wl, bw, pol, intensity} or null
export function probeAt(x, y, tol = 16) {
  let best = null, bd = tol;
  const p = { x, y };
  for (const r of lastPaths) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const dd = distToSegment(p, r.pts[i], r.pts[i + 1]);
      const intensity = r.segmentIntensities?.[i] ?? r.intensity;
      if (dd < bd - 1e-9 || (Math.abs(dd - bd) <= 1e-9 && intensity > (best?.intensity ?? -Infinity))) {
        bd = dd;
        best = { ...r, intensity };
      }
    }
  }
  const dispersedPulse = best?.pulse
    ? pulseDurationAfterDispersion(best.pulse, best.gdd, best.groupDelayDifferenceFs)
    : null;
  return best ? {
    wl: best.wl, bw: best.bw || 0, spec: best.spec || null, pol: best.pol,
    stokes: cloneStokes(best.stokes), intensity: best.intensity,
    // Which source this ray came from, so the probe can quote that source's
    // configured watts, and what its train looks like here -- including any
    // gates picked up on the way, which is what the time plot draws.
    sourceId: best.sourceId || null,
    approximation: best.approximation || null,
    pulse: best.pulse ? {
      repRateMHz: best.pulse.repRateMHz,
      pulseWidthFs: best.pulse.field || best.pulse.fieldIssue
        ? null
        : dispersedPulse?.durationFs ?? best.pulse.pulseWidthFs,
      phaseNs: best.pulse.phaseNs,
      pulseShape: best.pulse.pulseShape || 'gauss',
      gates: (best.pulse.gates || []).map(g => ({ ...g })),
    } : null,
    // A polarization-modulated segment has no single meaningful state, so the
    // probe reports the alternation itself rather than its average.
    polMod: best.polMod || null,
  } : null;
}

export function signalHitsFromLastTrace(stageId) {
  return lastSignalHits.filter(hit => hit.stageId === stageId);
}

const MAXLEN = 6000, MAX_DEPTH = 60, MIN_INT = 0.02;
// Coherent branches are amplitudes, so the ordinary ray-visibility cutoff is
// much too large: a 1%-power branch can change an 81%-power branch by 18%.
// This lower budget remains finite; crossing it disables interference for
// the whole source instead of returning a silently incomplete field sum.
const MIN_COHERENT_INT = 1e-4;
// How co-propagating mixed light is drawn: a band wide enough that no single
// wavelength stands for it has no colour of its own, so it is painted as the
// pale mix rather than as whichever wavelength happens to sit in the middle.
const MIXED_LIGHT_COLOR = '#cbd8ea';
const MIN_RETAINED_POWER_INT = 1e-12;
const MAX_RETAINED_WEAK_BRANCHES = 256;
// How many rays one shaper hit may leave with, across all of its layers. It
// bounds a stack that multiplies rays (orders x wavelengths x speckle grains),
// and every layer sizes its own sampling to fit rather than overflowing and
// being truncated — see the shaper case in interact().
const SHAPER_RAY_CAP = 24;
const LOW_POWER_MEASUREMENT_SURFACES = new Set(['detector', 'specimen', 'attenuate', 'fluor', 'fiberin']);

// Carrier phase is exact only through explicitly supported component
// topologies. Several unrelated elements deliberately share the generic
// `mirror` surface kind (galvos, retroreflectors and faceted OAPs), so a
// surface-kind allowlist would incorrectly turn their geometric approximation
// into a wave-optics model.
function carrierPhaseIssue(surface) {
  const type = surface.el?.type;
  if (surface.kind === 'detector') return null;
  if (surface.kind === 'split' && type === 'bs') return null;
  if (surface.kind === 'delay' && type === 'delayline') return null;
  // A phase object only lengthens the optical path, without bending the
  // ray or splitting it, so the carrier phase through it stays exact.
  if (surface.kind === 'phaseplate' && type === 'phaseplate') return null;
  // A phase modulator does the same, uniformly across the beam and driven by
  // a voltage: still no bending, no splitting, so the carrier stays exact.
  if (surface.kind === 'phasemod' && type === 'phasemodulator') return null;
  if (surface.kind === 'mirror' && type === 'mirror') {
    const reflectivity = Math.min(100, Math.max(0, Number(surface.data.refl ?? 100)));
    return reflectivity >= 100
      ? null
      : 'carrier phase is not modeled for partial-mirror coatings';
  }
  return `carrier phase is not modeled through ${type || surface.kind}`;
}

function markIncompleteCoherence(ray, reason) {
  if (!ray.phaseValid || !ray.coherenceId || incompleteCoherenceIds.has(ray.coherenceId)) return;
  incompleteCoherenceIds.set(ray.coherenceId, reason);
}

function invalidateIncompleteCameraFields() {
  if (!incompleteCoherenceIds.size) return;
  for (const hits of [...detectorHits.values(), ...detectorMisses.values()]) for (const hit of hits) {
    const issue = hit.coherenceId && incompleteCoherenceIds.get(hit.coherenceId);
    if (!issue) continue;
    hit.phaseValid = false;
    hit.phaseIssue = issue;
  }
}

const phaseWrap = phase => Math.atan2(Math.sin(phase), Math.cos(phase));
const quantized = (value, scale) => Math.round(value * scale);

function coherentChildKey(ray, surface, child) {
  return JSON.stringify([
    surfaceInteractionKey(surface), ray.coherenceId, ray.sample, Number(ray.wl).toFixed(9),
    ray.sig, child.tag || 'w',
  ]);
}

function polarizationKey(ray) {
  if (ray.stokes) return ['s', ray.stokes.s1, ray.stokes.s2, ray.stokes.s3]
    .map(value => Number.isFinite(value) ? Number(value).toFixed(9) : 'x').join(':');
  return Number.isFinite(ray.pol) ? `p:${Number(ray.pol).toFixed(9)}` : 'unpolarized';
}

function recordCoherentArrival(ray, hit, children, arrivals) {
  if (!arrivals || hit.surface.kind !== 'split' || hit.surface.el?.type !== 'bs'
      || !ray.coherenceId || !Number.isInteger(ray.sample) || !ray.phaseValid
      || !(ray.intensity > 0) || !(ray.power > 0)) return;
  const positionKey = `${quantized(hit.p.x, 1e6)}:${quantized(hit.p.y, 1e6)}`;
  const batchKey = JSON.stringify([
    surfaceInteractionKey(hit.surface), ray.coherenceId, ray.sample,
    Number(ray.wl).toFixed(9), positionKey, polarizationKey(ray),
  ]);
  const incomingKey = `${quantized(ray.dx, 1e8)}:${quantized(ray.dy, 1e8)}`;
  for (const child of children) {
    const intensity = child.intensity !== undefined ? child.intensity : ray.intensity;
    const power = child.power !== undefined ? child.power
      : ray.power * (child.intensity !== undefined && ray.intensity > 0
        ? child.intensity / ray.intensity : 1);
    if (!(power > 0) || !(intensity > 0)) continue;
    arrivals.push({
      batchKey,
      incomingKey,
      outputKey: `${quantized(child.d.x, 1e8)}:${quantized(child.d.y, 1e8)}`,
      childKey: coherentChildKey(ray, hit.surface, child),
      power,
      intensity,
      weightUnit: power / intensity,
      opl: ray.opl,
      coherenceLengthMm: ray.coherenceLengthMm || 0,
      wavelengthMm: ray.wl * 1e-6,
      phase: 2 * Math.PI * ray.opl / (ray.wl * 1e-6)
        + (Number.isFinite(ray.phaseOffset) ? ray.phaseOffset : 0)
        + (Number.isFinite(child.phaseShift) ? child.phaseShift : 0),
      fieldGroupCount: Number.isInteger(ray.fieldGroupCount) ? ray.fieldGroupCount : 1,
    });
  }
}

function extendCoherentPlan(arrivals, plan = new Map()) {
  const next = new Map(plan);
  const batches = new Map();
  for (const arrival of arrivals) {
    if (!batches.has(arrival.batchKey)) batches.set(arrival.batchKey, []);
    batches.get(arrival.batchKey).push(arrival);
  }
  for (const batch of batches.values()) {
    if (new Set(batch.map(item => item.incomingKey)).size < 2) continue;
    const outputs = new Map();
    for (const item of batch) {
      if (!outputs.has(item.outputKey)) outputs.set(item.outputKey, []);
      outputs.get(item.outputKey).push(item);
    }
    for (const fields of outputs.values()) {
      if (new Set(fields.map(item => item.incomingKey)).size < 2) continue;
      const reference = fields[0].phase;
      let re = 0, im = 0;
      for (const field of fields) {
        const relative = phaseWrap(field.phase - reference);
        const amplitude = Math.sqrt(field.power);
        re += amplitude * Math.cos(relative);
        im += amplitude * Math.sin(relative);
      }
      // Fully coherent result. Its phase is what continues downstream: with
      // partial coherence the ports move toward each other, so the phase
      // matters progressively less, and at zero visibility they are equal.
      const groupedPhase = reference + Math.atan2(im, re);
      // Power is built the way partial coherence actually works, rather than
      // from the vector sum above: every field contributes its own power
      // unconditionally, and each *pair* contributes an interference term
      // scaled by how well those two fields still overlap in time. A pair
      // whose paths differ by much more than the source's coherence length
      // simply adds its power and makes no fringe. With an ideal source every
      // visibility is 1 and this reduces exactly to |sum of amplitudes|^2.
      let groupedPower = 0;
      for (const field of fields) groupedPower += Math.max(0, field.power);
      for (let i = 0; i < fields.length; i++) {
        for (let j = i + 1; j < fields.length; j++) {
          const a = fields[i], b = fields[j];
          // A pair is only as coherent as the shorter of the two envelopes.
          const lengths = [a.coherenceLengthMm, b.coherenceLengthMm].filter(value => value > 0);
          const coherenceLengthMm = lengths.length ? Math.min(...lengths) : 0;
          const visibility = fringeVisibility(a.opl - b.opl, coherenceLengthMm);
          if (visibility <= 0) continue;
          groupedPower += 2 * Math.sqrt(Math.max(0, a.power) * Math.max(0, b.power))
            * Math.cos(phaseWrap(a.phase - b.phase)) * visibility;
        }
      }
      groupedPower = Math.max(0, groupedPower);
      const representative = [...fields].sort((a, b) => a.childKey.localeCompare(b.childKey))[0];
      const fieldGroupCount = fields.reduce((sum, field) => sum + field.fieldGroupCount, 0);
      for (const field of fields) {
        const keep = field === representative;
        next.set(field.childKey, {
          power: keep ? groupedPower : 0,
          intensity: keep && field.weightUnit > 0 ? groupedPower / field.weightUnit : 0,
          phaseOffset: keep
            ? phaseWrap(groupedPhase - 2 * Math.PI * field.opl / field.wavelengthMm)
            : 0,
          fieldGroupCount,
          retainZeroField: keep && groupedPower <= 1e-12,
          coherentlySuppressed: !keep,
        });
      }
    }
  }
  return next;
}

function coherentPlansEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    const other = right.get(key);
    if (!other || Math.abs(value.power - other.power) > 1e-12
        || Math.abs(value.intensity - other.intensity) > 1e-10
        || Math.abs(phaseWrap(value.phaseOffset - other.phaseOffset)) > 1e-10
        || value.fieldGroupCount !== other.fieldGroupCount
        || value.retainZeroField !== other.retainZeroField
        || value.coherentlySuppressed !== other.coherentlySuppressed) return false;
  }
  return true;
}
// A deliberately selected line can be a thin slice of a broad source and
// still be the whole point of the setup, so branches flagged keepWeak are
// held to a far lower floor than the generic negligible-ray cull.
const MIN_WEAK_INT = 1e-5;
const BAND_SELECTING_SURFACES = new Set(['filter', 'dichroic', 'etalon']);

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
const clampConversion = value => Math.min(MAX_CONVERSION, Math.max(0, Number(value) || 0));

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
// A beam is sampled by several rays, which must not be recorded as several
// beams -- but two trains of the same colour arriving at different times are
// two beams, and collapsing them by wavelength alone would make the result
// depend on which source happened to be traced first.
// What makes two arriving rays the same beam: where they came from and what
// train they carry. Deliberately NOT the accumulated path -- a focused beam is
// sampled by rays whose paths differ across the cone, and those are one beam
// arriving, not a spread of beams to be timed against each other.
function probeBeamKey(ray) {
  const pulse = ray.pulse;
  const gates = (pulse?.gates || [])
    .map(g => `${g.opl}|${g.frequencyMHz}|${g.duty}|${g.phaseNs}|${g.shape || ''}`).join(';');
  return [
    ray.wl.toFixed(9), ray.branch || pulse?.sourceId || '',
    pulse?.repRateMHz ?? '', pulse?.phaseNs ?? '', pulse?.pulseWidthFs ?? '', gates,
  ].join('/');
}

function recordProbeBeam(surface, ray) {
  let seen = specimenProbe.get(surface.id);
  if (!seen) specimenProbe.set(surface.id, seen = []);
  const key = probeBeamKey(ray);
  const weight = Math.max(0, ray.intensity || 0);
  const already = seen.find(b => b.key === key);
  // A beam sampled by several rays is one beam: its power is theirs together,
  // and it arrives when its power arrives.
  if (already) {
    already.intensity += weight;
    already.power += Math.max(0, Number(ray.power) || 0);
    already.oplWeight += weight;
    already.oplSum += weight * (ray.opl || 0);
    already.oplMin = Math.min(already.oplMin, ray.opl || 0);
    return;
  }
  seen.push({
    key,
    branch: ray.branch || null,
    wl: ray.wl, opl: ray.opl,
    oplSum: weight * (ray.opl || 0), oplWeight: weight, oplMin: ray.opl || 0,
    // The arriving spectrum, so a process that mixes this beam can use its
    // width -- including whatever a filter upstream did to it.
    bw: ray.bw, spec: ray.spec,
    intensity: weight,
    power: Math.max(0, Number(ray.power) || 0),
    pulse: ray.pulse ? { ...ray.pulse } : null,
    gates: (ray.pulse?.gates || []).map(g => ({ ...g })),
  });
}

// One arrival per beam, weighted by where its power actually is, so that every
// sampling ray of a beam is timed the same way.
function settleProbeBeam(beam) {
  beam.opl = beam.oplWeight > 0 ? beam.oplSum / beam.oplWeight : beam.oplMin;
  return beam;
}

// The record of the beam this ray belongs to, so a ray is timed as its beam
// rather than against whichever ray of another beam happened to be sampled.
function beamRecordFor(ray, beams) {
  const key = probeBeamKey(ray);
  return (beams || []).find(beam => beam.key === key) || null;
}

// A ray as its beam arrives: the same pulse train, timed where the beam's
// power is. Falls back to the ray itself when there is no record.
function rayAsBeam(ray, beams) {
  const record = beamRecordFor(ray, beams);
  return { wl: ray.wl, opl: record ? record.opl : ray.opl, pulse: ray.pulse, bw: ray.bw, spec: ray.spec };
}

// The two transmission levels a gate swings its beam between, as the beam
// actually sees them: `high` holds during the first `duty` of each period and
// `low` for the rest, with the per-shape defaults and any inversion applied.
function gateEffectiveLevels(gate) {
  const depth = Math.min(1, Math.max(0, gate.depth ?? 1));
  const square = !gate.shape || gate.shape === 'square';
  const high = Number.isFinite(gate.high) ? gate.high : 1;
  const low = Number.isFinite(gate.low) ? gate.low : (square ? 0 : 1 - depth);
  return gate.invert ? { high: 1 - high, low: 1 - low } : { high, low };
}

export function srsTransferGate(channel, ray, incidentBeams, elementId) {
  const beams = incidentBeams || [];
  const modulatedPartners = beams.filter(b =>
    Math.abs(b.wl - ray.wl) >= MIXING_MIN_SEPARATION_NM && b.gates?.length);
  // What this model covers is one unmodulated beam receiving the modulation of
  // one other beam through one modulator. Anything beyond that is not drawn,
  // and says so, rather than being drawn as though it were modelled.
  if ((ray.pulse?.gates || []).length) {
    // This beam is itself modulated, so it is the donor of the usual pair --
    // unless another beam is modulated too.
    if (modulatedPartners.length) {
      recordSrsNote(elementId, 'both beams are modulated, and transfer between two modulated beams is not modelled');
    }
    return null;
  }
  if (!modulatedPartners.length) return null;
  if (modulatedPartners.length > 1) {
    recordSrsNote(elementId, 'more than one modulated beam could drive it, and only a single modulated partner is modelled');
    return null;
  }
  const donor = modulatedPartners[0];
  if (donor.gates.length > 1) {
    // The donor's transmission is the product of every modulator it passed; a
    // single gate cannot carry that, and keeping only one of them would draw a
    // transfer while the donor is blocked.
    recordSrsNote(elementId, 'the modulated beam passes more than one modulator, and a composite modulation is not modelled');
    return null;
  }
  // Both pulses must be at the spot together for the interaction to happen.
  const overlap = channelOverlap(channel, ray, donor, beams, elementId).factor;
  if (overlap < MIN_OVERLAP) return null;
  const source = donor.gates[0];
  const depth = Math.min(0.5, Math.max(0.01, channel.transferEff ?? 0.1)) * overlap;
  // The two beams are not symmetric. Energy flows from the blue photon to
  // the red one, so when the PUMP (the shorter wavelength) carries the
  // modulation the Stokes beam is amplified while the pump is on — that is
  // stimulated Raman GAIN, and the receiving beam rises above its
  // unmodulated level. When the STOKES beam carries it, the pump is
  // depleted while the Stokes is on — stimulated Raman LOSS, a dip.
  const receiverIsStokes = donor.wl < ray.wl;
  const sign = receiverIsStokes ? 1 : -1;
  // Whichever of the donor gate's two levels actually lets the donor through
  // is when the transfer happens. That is not always the gate's `high` half:
  // a polarization modulator read through an analyzer can block its beam
  // during `high` and pass it during `low`, and putting the effect on `high`
  // regardless landed a loss while the donor was off -- which reads, against
  // the donor, as a gain. So each level of the transferred gate follows how
  // much of the donor that level passes.
  const levels = gateEffectiveLevels(source);
  const brightest = Math.max(levels.high, levels.low);
  const darkest = Math.min(levels.high, levels.low);
  if (!(brightest - darkest > 1e-9)) return null; // the donor is not modulated
  // A normalised display proxy, not a Raman transfer law: any donor contrast is
  // stretched to the full authored excursion, so a donor swinging 0.8 to 1.0
  // transfers as much as one swinging 0 to 1, and a steady donor transfers
  // nothing. The depth is transferEff times the temporal overlap.
  const follow = level => 1 + sign * depth * (level - darkest) / (brightest - darkest);
  // A gate is evaluated at its own beam's emission time. The donor photons that
  // meet a receiver pulse at the specimen left their source earlier or later
  // by the difference in the two paths -- by a whole pulse period, even, when
  // the arms differ by one -- so the transferred gate is moved by that path
  // difference to ask the donor about the photons that are actually there.
  const receiverOpl = rayAsBeam(ray, beams).opl;
  const pathShift = (Number.isFinite(receiverOpl) ? receiverOpl : 0) - (Number.isFinite(donor.opl) ? donor.opl : 0);
  return {
    opl: source.opl + pathShift, frequencyMHz: source.frequencyMHz, duty: source.duty,
    phaseNs: source.phaseNs, shape: source.shape, symmetry: source.symmetry,
    depth, invert: false,
    high: follow(levels.high),
    low: follow(levels.low),
  };
}

// How much of a two-beam signal survives the arrival mismatch between the
// beams driving it, judged beam to beam. Channels can opt out, for a schematic
// that is about the signal rather than about timing.
//
// This is the same timing model the crystal's mixing uses: the Gaussian
// overlap integral, coincidence with the nearest pulse of the other train, and
// only trains at one nominal repetition rate — a rate mismatch is reported as
// not modelled rather than waved through at full strength.
function channelOverlap(channel, ray, partner, beams, elementId) {
  if (!partner) return { factor: 1, state: 'oneBeam' };
  if (channel.requireOverlap === false) {
    // Say that timing was deliberately not checked, rather than leaving the
    // readout to look as if no two-beam signal were there at all.
    recordSpecimenTiming(elementId, { kind: channel.kind, driverWl: ray.wl, partnerWl: partner.wl, state: 'ignored' });
    return { factor: 1, state: 'ignored' };
  }
  const overlap = mixOverlap(rayAsBeam(ray, beams), partner);
  const reading = {
    kind: channel.kind, driverWl: ray.wl, partnerWl: partner.wl,
    skewNs: overlap.skewNs, overlap: overlap.factor,
    repRateMHz: ray.pulse?.repRateMHz ?? null,
    partnerRepRateMHz: partner.pulse?.repRateMHz ?? null,
  };
  const state = overlap.unsupported ? 'unsupported'
    : overlap.comparable && overlap.factor < MIN_OVERLAP ? 'unsynchronized'
      : 'mixing';
  recordSpecimenTiming(elementId, { ...reading, state });
  return { factor: state === 'mixing' ? overlap.factor : 0, state, skewNs: overlap.skewNs };
}

// The sum frequency of this beam with every other colour at the specimen. A
// pair is emitted once, by its shorter wavelength, and only while the two
// pulses are there together -- the same rule the crystal's mixing follows.
// Signals here are bounded qualitative proxies that do not deplete the
// excitation, so each pair carries the channel's own authored efficiency
// rather than drawing on a shared budget.
function specimenMixedOutputs(channel, ray, d, data, elementId) {
  const out = [];
  const eff = Math.min(1, Math.max(0, channel.eff ?? 1));
  if (!(eff > 0)) return out;
  for (const partner of data.incidentBeams || []) {
    if (partner.wl - ray.wl < MIXING_MIN_SEPARATION_NM) continue;   // the shorter beam emits
    const wl = mixWavelength('sfg', ray.wl, partner.wl);
    if (!(wl > 0)) continue;
    const overlap = mixOverlap(rayAsBeam(ray, data.incidentBeams), partner);
    const gate = channelOverlap(channel, ray, partner, data.incidentBeams, elementId).factor;
    if (gate < MIN_OVERLAP) continue;
    const tint = channelColor(channel, wl);
    const forward = ray.intensity * eff * gate;
    // This light exists only while both pulses are there, so it is the pair's
    // train -- not the driving beam's, whose duration and transform-limited
    // claim are not this signal's.
    const pulse = mixPulse(ray.pulse, partner.pulse, {
      crystalId: elementId, kind: 'sfg', wl,
      centerNs: overlap.centerNs, oplMm: ray.opl, repRateMHz: overlap.repRateMHz,
      partnerPulseOffset: overlap.partnerPulseOffset, periodNs: overlap.periodNs,
    });
    const child = {
      d, wl, bw: 0, spec: null, pol: undefined, stokes: null, pulse,
      color: tint, sourceId: elementId, intensity: forward, tag: `sfg${Math.round(wl)}`,
    };
    out.push(child);
    if (channel.epi) {
      const ratio = Math.min(1, Math.max(0, channel.epiRatio ?? 0.15));
      if (ratio > 0) {
        out.push({
          ...child,
          d: { x: -d.x, y: -d.y },
          intensity: forward * ratio,
          power: Number.isFinite(ray.power) ? ray.power * eff * gate * ratio : undefined,
          tag: `esfg${Math.round(wl)}`,
        });
      }
    }
  }
  return out;
}

// The incident beam a mixing channel pairs the current ray with: the longest
// wavelength present, matching how specimenSignalWl picks the Stokes partner.
// Where that colour arrives on more than one path -- two arms of a split beam,
// say -- the one that actually meets this pulse is the partner.
function mixingPartner(ray, incidentBeams) {
  let best = null;
  for (const beam of incidentBeams || []) {
    if (Math.abs(beam.wl - ray.wl) < MIXING_MIN_SEPARATION_NM) continue;
    if (!best || beam.wl > best.wl) { best = beam; continue; }
    if (Math.abs(beam.wl - best.wl) < MIXING_MIN_SEPARATION_NM) {
      const here = mixOverlap(rayAsBeam(ray, incidentBeams), beam).factor;
      const there = mixOverlap(rayAsBeam(ray, incidentBeams), best).factor;
      if (here > there) best = beam;
    }
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
// The argon capillary, for one coupled batch of light. Four outcomes:
//  - no coupled pulse energy: the fiber stays dark (`dark`);
//  - outside the Peck–Fisher data (468–2059 nm): no argon dispersion is
//    claimed; the light continues geometrically with a caveat, never with the
//    ordinary fiber's group index and β₂ passed off as argon's;
//  - the Kerr solver accepts the pulse: a sampled field and its spectrum
//    replace the incoming ones (with Kerr off this is linear propagation within the β₂ model
//    of the same field);
//  - the solver refuses, or the pulse is not one it can take: the light
//    continues with argon's linear β₂ only, its old field cleared, and every
//    downstream readout carries LINEAR_ONLY -- including the spectrum, which
//    self-phase modulation would have changed and this continuation does not.
function hollowCoreEmission(c, b, lengthMm, lossDbPerM) {
  const coefficients = hollowCoreCoefficients(b, c.wl);
  const kerr = b.kerrEnabled !== false;
  if (!coefficients) {
    hollowReadings.set(b.id, { ok: false, state: 'outOfRange', reason: ARGON_OUT_OF_RANGE, kerr });
    return {
      output: { ng: 1, gddFs2: 0, ...(c.pulse ? { pulse: { ...c.pulse, field: null, fieldIssue: ARGON_OUT_OF_RANGE } } : {}) },
      approximation: ARGON_OUT_OF_RANGE,
    };
  }
  const linear = { ng: coefficients.groupIndex, gddFs2: coefficients.beta2Fs2PerM * lengthMm / 1000 };
  const pulse = c.pulse;
  if (!pulse) {
    // Continuous light carries no pulse energy for a Kerr phase to build on:
    // at CW powers the nonlinear phase is negligible, so linear is the answer.
    hollowReadings.set(b.id, { ok: false, state: 'cw', reason: 'Continuous light: argon dispersion only; no pulse for the Kerr model.', coefficients, kerr });
    return { output: linear };
  }
  const energyJ = pulse.avgPowerW * c.power / (pulse.repRateMHz * 1e6);
  if (Number.isFinite(energyJ) && energyJ <= 0) {
    hollowReadings.set(b.id, { ok: false, state: 'noEnergy', reason: 'No coupled pulse energy.', energyJ, coefficients, kerr });
    return { dark: true };
  }
  // A refusal keeps whatever was already unknown upstream: an earlier
  // fiber's reason and caveat are not replaced by this one's.
  const refuse = reason => {
    hollowReadings.set(b.id, { ok: false, state: 'linearOnly', reason, energyJ, coefficients, kerr });
    return {
      output: { ...linear, pulse: { ...pulse, field: null, fieldIssue: pulse.fieldIssue || LINEAR_ONLY } },
      approximation: c.approximation || LINEAR_ONLY,
    };
  };
  // Light whose temporal state is already unknown -- a refused or
  // out-of-range capillary upstream, a generated continuum -- cannot become
  // an intact Gaussian again just because this solver could run on its
  // source's settings. That holds with Kerr off as well as on.
  if (pulse.fieldIssue || c.approximation || pulse.durationUnknown) {
    return refuse('The light arriving is already unavailable as a computed pulse upstream, so no field is built from it.');
  }
  // The solver starts from a transform-limited Gaussian of the spectrum's
  // width. A chirped laser's pulse record carries that limit and its signed
  // GDD; the GDD becomes part of the initial phase, once.
  const sourceGdd = pulse.transformLimited !== true && Number.isFinite(pulse.inputGddFs2) ? pulse.inputGddFs2 : 0;
  const referenceWidth = pulse.transformLimited === true ? pulse.pulseWidthFs
    : Number(pulse.transformLimitFs) > 0 && Number.isFinite(pulse.inputGddFs2) ? Number(pulse.transformLimitFs) : NaN;
  const expectedBandwidth = transformLimitedBandwidthNm(referenceWidth, c.wl);
  const intactSpectrum = Number.isFinite(referenceWidth) && c.spec?.kind === 'gauss' && Math.abs(c.spec.center - c.wl) < 1e-6
    && Math.abs(c.spec.fwhm - expectedBandwidth) <= 1e-6 * Math.max(1, expectedBandwidth);
  if (!Number.isFinite(energyJ)) return refuse('The pulse energy of this light is not known, so the Kerr phase cannot be computed.');
  if (!intactSpectrum || pulse.pulseShape !== 'gauss' || pulse.field
    || pulse.spectrumReshaped || c.incompatibleEnvelope) {
    return refuse('The Kerr model needs one unsplit Gaussian pulse train with its spectrum intact and its phase known — transform-limited or a laser\'s authored chirp (500–1800 nm).');
  }
  const input = {
    pulseWidthFs: referenceWidth, energyJ, wavelengthNm: c.wl, lengthM: lengthMm / 1000,
    ...coefficients, lossDbPerM, inputGddFs2: sourceGdd + (c.gdd || 0),
  };
  const key = JSON.stringify({ ...input, sourceGdd });
  let result = hollowCache.get(key);
  if (!result) {
    result = propagateEnvelope(input);
    // The ray carries only the path's GDD, never the source's, so the field
    // is referred to the same frame: downstream elements then add to it and
    // the detector's GDD selects the right phase.
    if (result.ok && sourceGdd) {
      result = { ...result, field: { ...result.field, referenceGddFs2: result.field.referenceGddFs2 - sourceGdd } };
    }
    if (result.ok && result.maxPeakPowerW / coefficients.effectiveAreaM2 > 5e17) {
      result = { ok: false, reason: 'Peak intensity exceeds the Kerr-only model bound (5 × 10¹³ W/cm²); ionization is not modeled.' };
    }
    if (hollowCache.size >= 24) hollowCache.clear();
    hollowCache.set(key, result);
  }
  if (!result.ok) return refuse(result.reason);
  hollowReadings.set(b.id, { ...result, state: kerr ? 'field' : 'kerrOff', coefficients, energyJ, kerr });
  return {
    output: {
      ...linear,
      // The field already contains the capillary's GDD; the ray's own GDD
      // still accumulates it so downstream elements add to the right total.
      pulse: {
        ...pulse, field: result.field, fieldIssue: null,
        fieldReferencePower: c.power * 10 ** (-(lossDbPerM * lengthMm / 1000) / 10),
        transformLimited: false, pulseShape: 'sampled',
      },
      spec: result.spectrum, bw: spectrumStats(result.spectrum).fwhm,
    },
  };
}

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
  let ng = Math.min(2.2, Math.max(1, b.groupIndex || 1.468));
  let lossDbPerM = Math.min(100, Math.max(0, b.lossDbPerM ?? 0.2));
  // A capillary's loss follows its core and the wavelength unless set by hand.
  let capillaryLoss = null;
  if (b.fiberModel === 'argon') {
    capillaryLoss = capillaryLossDbPerM(b, c.wl, lossDbPerM);
    // A computed loss is the model's, whatever its size: a narrow, short
    // capillary can exceed the manual field's 100 dB/m, and capping it would
    // deliver energy the model says is lost. Only a typed value is bounded,
    // by its input field.
    if (capillaryLoss.model === 'manual') lossDbPerM = Math.min(100, Math.max(0, capillaryLoss.totalDbPerM));
    else if (Number.isFinite(capillaryLoss.totalDbPerM) && capillaryLoss.totalDbPerM >= 0) lossDbPerM = capillaryLoss.totalDbPerM;
  }
  // A set physical length stands for cable coiled out of the drawing: it
  // sets delay, loss and dispersion together, and the drawing stays put.
  let { lengthMm, gddFs2 } = fiberPropagation(b, polylineLength(pts));
  let pulse = c.pulse, spec = c.spec || null, bw = c.bw || 0;
  let approximation = c.approximation || null;
  if (b.fiberModel === 'argon') {
    const hollow = hollowCoreEmission(c, b, lengthMm, lossDbPerM);
    const reading = hollowReadings.get(b.id);
    if (reading) hollowReadings.set(b.id, { ...reading, loss: { ...capillaryLoss, totalDbPerM: lossDbPerM } });
    if (hollow.dark) return [];
    ({ ng, gddFs2, pulse, spec, bw } = { ng, gddFs2, pulse, spec, bw, ...hollow.output });
    approximation = hollow.approximation || approximation;
  }
  // β₂ is one value for the whole band, like the compressor's lumped GDD, so
  // a broad band's endpoint spread follows from it the same way.
  const fiberDelayDifference = gddFs2
    ? gddGroupDelayDifferenceFs(gddFs2, c.pulse?.spectrumLoNm, c.pulse?.spectrumHiNm) : 0;
  const transmission = 10 ** (-(lossDbPerM * lengthMm / 1000) / 10);
  const common = {
    wl: c.wl, bw, spec, speckle: false, intensity: Math.min(1, c.intensity * transmission),
    power: Number.isFinite(c.power) ? c.power * transmission / K : undefined,
    pol: c.pol, stokes: cloneStokes(c.stokes), pulse, approximation, sourceId: c.sourceId || null,
    originId: c.originId || null,
    oplStart: (c.opl || 0) + lengthMm * ng + 2,
    // Dispersion accumulated before coupling survives the relaunch, and the
    // fiber's own signed GDD adds to it.
    gddStart: (Number.isFinite(c.gdd) ? c.gdd : 0) + gddFs2,
    groupDelayDifferenceStartFs: (Number.isFinite(c.groupDelayDifferenceFs) ? c.groupDelayDifferenceFs : 0)
      + (Number.isFinite(fiberDelayDifference) ? fiberDelayDifference : 0),
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

// Slice the envelope strip between two beam edges A and B -- one propagation
// segment each, as the beam fill is built -- into its "on" quads.
//
// Each edge carries its own `start`: how far into that edge the pattern's
// on-window begins, measured unwrapped from the gate, so window n lies at
// [start + nP, start + nP + on] along it. Pairing window n on both edges is
// what keeps a chunk's cut where both edges are equally far from the gate.
// Behind an oblique optic the edges arrive after different distances -- a
// 45 degree mirror folds a 12 mm beam's edges 12 mm apart -- and cutting both
// at one edge's positions would slant the fill across the beam while the
// dashed outlines, which follow each edge's own phase, stay square to it.
// An anti-phase strip is simply one whose starts sit half a period later.
function chopStrip(A, B, period, duty, startA = 0, startB = startA) {
  const along = (p0, p1, length, s) => (length < 1e-9 ? p0
    : { x: p0.x + (p1.x - p0.x) * s / length, y: p0.y + (p1.y - p0.y) * s / length });
  const [a0, a1] = A, [b0, b1] = B;
  const lengthA = Math.hypot(a1.x - a0.x, a1.y - a0.y);
  const lengthB = Math.hypot(b1.x - b0.x, b1.y - b0.y);
  if (Math.max(lengthA, lengthB) < 1e-6) return [];
  const on = period * duty;
  const clamp = (v, length) => Math.min(length, Math.max(0, v));
  const first = Math.floor((Math.min(-startA, -startB) - on) / period);
  const last = Math.ceil(Math.max(lengthA - startA, lengthB - startB) / period);
  const polys = [];
  for (let n = first; n <= last && polys.length < 300; n++) {
    const aLo = clamp(startA + n * period, lengthA), aHi = clamp(startA + n * period + on, lengthA);
    const bLo = clamp(startB + n * period, lengthB), bHi = clamp(startB + n * period + on, lengthB);
    // Nothing of this window falls on this segment along either edge.
    if (aHi - aLo < 1e-6 && bHi - bLo < 1e-6) continue;
    polys.push([along(a0, a1, lengthA, aLo), along(a0, a1, lengthA, aHi),
      along(b0, b1, lengthB, bHi), along(b0, b1, lengthB, bLo)]);
  }
  return polys;
}

// A chop pattern is anchored where it was cut -- the chopper or AOM -- and has
// to run on unbroken from there. Every ray object measures `startMm` from its
// own first point, so a ray continuing a parent's pattern carries the parent's
// phase forward by the distance the parent travelled. It is kept unwrapped:
// two beam edges that reached an oblique optic after different distances must
// still pair the same window, which a phase folded into one period cannot tell.
function continuedChop(chopped, travelledMm) {
  if (!chopped) return undefined;
  return { ...chopped, startMm: (chopped.startMm || 0) - travelledMm };
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

const ASPHERE_BINOMIAL = Array.from({ length: 17 }, (_, n) => {
  const row = Array(n + 1).fill(1);
  for (let k = 1; k < n; k++) row[k] = row[k - 1] * (n - k + 1) / k;
  return row;
});

function multiplyPolynomial(a, b) {
  const result = Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) result[i + j] += a[i] * b[j];
  }
  return result;
}

function powerToBernstein(power) {
  const degree = power.length - 1;
  return power.map((_, i) => {
    let value = 0;
    for (let j = 0; j <= i; j++) {
      value += power[j] * ASPHERE_BINOMIAL[i][j] / ASPHERE_BINOMIAL[degree][j];
    }
    return value;
  });
}

function splitBernsteinHalf(coefficients) {
  const degree = coefficients.length - 1;
  let level = coefficients;
  const left = [level[0]];
  const right = [level[degree]];
  for (let depth = 1; depth <= degree; depth++) {
    const next = Array(level.length - 1);
    for (let i = 0; i < next.length; i++) next[i] = (level[i] + level[i + 1]) / 2;
    left.push(next[0]);
    right.push(next.at(-1));
    level = next;
  }
  right.reverse();
  return [left, right];
}

// Intersect a ray with the exact rotationally symmetric profile carried by an
// aspheric-lens face. In the element frame the surface is single-valued,
// x = sag(y), so the finite aperture gives a bounded one-dimensional root
// search. Ordinary near-axial rays have constant y and are solved directly.
// For oblique rays, substituting the ray and even-polynomial departure into
// the conic's implicit equation produces a polynomial of degree at most 16.
// Bernstein subdivision isolates every root, including even-multiplicity
// tangencies and two crossings whose endpoint residuals share a sign. Roots
// on the conic's unused second branch are rejected against the explicit sag.
// The returned point lies on the analytic profile rather than on the sampled
// SVG outline.
function rayAsphereHit(p, d, surface) {
  const profile = surface.data.asphere;
  const offset = { x: p.x - profile.cx, y: p.y - profile.cy };
  const x0 = dot(offset, profile.ux), y0 = dot(offset, profile.uy);
  const dx = dot(d, profile.ux), dy = dot(d, profile.uy);
  const h = Math.max(0.5, Number(profile.h) || 0.5);
  const valueAt = t => x0 + dx * t - asphereSag(y0 + dy * t, profile);
  const makeHit = t => {
    if (!Number.isFinite(t) || t < 0.05) return null;
    const localY = y0 + dy * t;
    if (localY < -h - 1e-7 || localY > h + 1e-7) return null;
    if (profile.inner > 0 && Math.abs(localY) < profile.inner - 1e-7) return null;
    return {
      t,
      // The authored surface runs from +h to -h, matching surface.a -> b.
      u: Math.min(1, Math.max(0, (h - localY) / (2 * h))),
      p: add(p, mul(d, t)),
    };
  };

  if (Math.abs(dy) < 1e-10) {
    if (Math.abs(y0) > h + 1e-7 || Math.abs(dx) < 1e-12) return null;
    return makeHit((asphereSag(y0, profile) - x0) / dx);
  }

  const edgeA = (-h - y0) / dy;
  const edgeB = (h - y0) / dy;
  let lo = Math.max(0.05, Math.min(edgeA, edgeB));
  const hi = Math.max(edgeA, edgeB);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return null;

  // Moving a hair beyond the self-hit threshold prevents a ray launched from
  // this face from rediscovering the same numerical root at exactly 0.05 mm.
  lo += 1e-9;

  const span = hi - lo;
  const xa = x0 + dx * lo;
  const ya = y0 + dy * lo;
  const xStep = dx * span;
  const yStep = dy * span;

  // P(y(u)) in the normalized ray parameter u = (t - lo) / span.
  const departure = Array(9).fill(0);
  for (const [degree, coefficient] of [
    [4, Number(profile.a4) || 0],
    [6, Number(profile.a6) || 0],
    [8, Number(profile.a8) || 0],
  ]) {
    for (let j = 0; j <= degree; j++) {
      departure[j] += coefficient * ASPHERE_BINOMIAL[degree][j]
        * ya ** (degree - j) * yStep ** j;
    }
  }

  // z = x - P(y) is the conic-only sag. For a non-plane conic it obeys
  // y² - 2Rz + (1+k)z² = 0; for a plane base, z itself is the equation.
  const z = departure.map((coefficient, i) => (i === 0 ? xa : i === 1 ? xStep : 0) - coefficient);
  let equation;
  const R = Number(profile.R) || 0;
  const conicFactor = 1 + (Number(profile.k) || 0);
  if (Math.abs(R) < 1e-9) {
    equation = z;
  } else {
    const zSquared = multiplyPolynomial(z, z);
    equation = Array(zSquared.length).fill(0);
    equation[0] = ya * ya;
    equation[1] = 2 * ya * yStep;
    equation[2] = yStep * yStep;
    for (let i = 0; i < z.length; i++) equation[i] -= 2 * R * z[i];
    for (let i = 0; i < zSquared.length; i++) equation[i] += conicFactor * zSquared[i];
  }
  while (equation.length > 1 && equation.at(-1) === 0) equation.pop();

  const residualTolerance = 1e-9;
  const polishRoot = (leftT, rightT) => {
    let leftValue = valueAt(leftT);
    let rightValue = valueAt(rightT);
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return null;
    if (Math.abs(leftValue) <= residualTolerance) return leftT;
    if (Math.abs(rightValue) <= residualTolerance) return rightT;
    if (leftValue * rightValue < 0) {
      for (let iteration = 0; iteration < 56; iteration++) {
        const middle = (leftT + rightT) / 2;
        const middleValue = valueAt(middle);
        if (!Number.isFinite(middleValue)) return null;
        if (Math.abs(middleValue) <= 1e-12) return middle;
        if (leftValue * middleValue <= 0) {
          rightT = middle;
          rightValue = middleValue;
        } else {
          leftT = middle;
          leftValue = middleValue;
        }
      }
      return (leftT + rightT) / 2;
    }

    // An even-multiplicity tangency has no sign-changing bracket. Start from
    // the best point in the isolated interval and polish with safeguarded
    // Newton steps using the exact analytic derivative.
    const middle = (leftT + rightT) / 2;
    const samples = [
      { t: leftT, value: leftValue },
      { t: middle, value: valueAt(middle) },
      { t: rightT, value: rightValue },
    ];
    let best = samples.reduce((a, b) => Math.abs(b.value) < Math.abs(a.value) ? b : a);
    for (let iteration = 0; iteration < 12; iteration++) {
      if (!Number.isFinite(best.value) || Math.abs(best.value) <= residualTolerance) break;
      const derivative = dx - dy * asphereSlope(y0 + dy * best.t, profile);
      if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-14) break;
      const nextT = best.t - best.value / derivative;
      if (!(nextT > leftT && nextT < rightT)) break;
      const next = { t: nextT, value: valueAt(nextT) };
      if (!Number.isFinite(next.value) || Math.abs(next.value) >= Math.abs(best.value)) break;
      best = next;
    }
    return Math.abs(best.value) <= residualTolerance ? best.t : null;
  };

  if (equation.every(coefficient => coefficient === 0)) {
    const candidate = polishRoot(lo, hi);
    return candidate === null ? null : makeHit(candidate);
  }

  const initial = powerToBernstein(equation);
  const stack = [{ coefficients: initial, u0: 0, u1: 1, depth: 0 }];
  while (stack.length) {
    const interval = stack.pop();
    const scale = Math.max(1, ...interval.coefficients.map(Math.abs));
    const coefficientTolerance = 256 * Number.EPSILON * scale;
    const minimum = Math.min(...interval.coefficients);
    const maximum = Math.max(...interval.coefficients);
    if (minimum > coefficientTolerance || maximum < -coefficientTolerance) continue;

    const width = interval.u1 - interval.u0;
    if (interval.depth >= 56 || width <= 2 ** -48) {
      const leftT = lo + span * interval.u0;
      const rightT = lo + span * interval.u1;
      const candidate = polishRoot(leftT, rightT);
      if (candidate !== null) {
        const hit = makeHit(candidate);
        if (hit) return hit;
      }
      continue;
    }

    const middleU = (interval.u0 + interval.u1) / 2;
    const [leftCoefficients, rightCoefficients] = splitBernsteinHalf(interval.coefficients);
    // LIFO order keeps the search increasing in t, so the first accepted root
    // is the nearest physical hit even when one interval contains a pair.
    stack.push({
      coefficients: rightCoefficients, u0: middleU, u1: interval.u1,
      depth: interval.depth + 1,
    });
    stack.push({
      coefficients: leftCoefficients, u0: interval.u0, u1: middleU,
      depth: interval.depth + 1,
    });
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

function rayInfiniteLineHit(p, d, surface) {
  const e = sub(surface.b, surface.a);
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-9) return null;
  const dp = sub(surface.a, p);
  const t = (dp.x * e.y - dp.y * e.x) / den;
  const u = (dp.x * d.y - dp.y * d.x) / den;
  if (t < 0.05) return null;
  return { t, u, p: add(p, mul(d, t)) };
}

// nearest intersection of ray (p,d) with surfaces, ignoring the immediately
// departed straight segment. Curved surfaces remain eligible because a ray can
// legitimately meet another part of the same arc after entering or reflecting.
function nearestHit(p, d, surfaces, skip) {
  let best = null;
  for (const s of surfaces) {
    if (s === skip && !s.data.arc && !s.data.asphere) continue;
    const candidate = s.data.asphere ? rayAsphereHit(p, d, s)
      : s.data.arc ? rayArcHit(p, d, s) : rayLineHit(p, d, s);
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

function surfaceInteractionKey(surface) {
  return surface.el?.id
    ? `${surface.el.id}:${surface.kind}${surface.data.topologyKey ? `:${surface.data.topologyKey}` : ''}`
    : `surface${surface.id}:${surface.kind}`;
}

function recordCameraNearMisses(ray, cameraSurfaces, segmentLength) {
  if (!Number.isInteger(ray.sample) || !(segmentLength > 0)) return;
  const origin = { x: ray.x, y: ray.y };
  const direction = { x: ray.dx, y: ray.dy };
  for (const surface of cameraSurfaces) {
    if (surface === ray.last) continue;
    const entranceDirection = rotPt(1, 0, surface.el?.rot || 0);
    if (dot(direction, entranceDirection) <= 1e-9) continue;
    const crossing = rayInfiniteLineHit(origin, direction, surface);
    if (!crossing || crossing.t > segmentLength + 1e-8
        || (crossing.u >= 0 && crossing.u <= 1)) continue;
    const id = surface.el?.id;
    if (!id) continue;
    const pathKey = `${ray.sig}/${surfaceInteractionKey(surface)}`;
    const refractiveIndex = Math.min(3, Math.max(1, ray.ior || 1));
    const oplMm = ray.opl + crossing.t * refractiveIndex;
    if (!detectorMisses.has(id)) detectorMisses.set(id, []);
    detectorMisses.get(id).push(detectorSample(
      ray, surface, crossing.u, oplMm, pathKey, true,
    ));
  }
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
// maxK caps the quadrature count for callers working inside a ray budget.
// The nodes are only a numerical device — the weights are renormalised to sum
// to 1 whatever count comes back — so a caller that cannot afford nine rays
// per order is far better off asking for fewer than letting the tail be
// truncated away with its power.
function wlSamples(ray, maxK = Infinity) {
  if (!ray.bw) return [{ wl: ray.wl, weight: 1 }];
  const K = Math.max(1, Math.min(maxK, ray.bw >= 200 ? 9 : 5));
  const [lo, hi] = ray.spec
    ? spectrumSupport(ray.spec)
    : [ray.wl - ray.bw / 2, ray.wl + ray.bw / 2];
  // One node has to stand for the whole band, so it sits at the spectrum's
  // centroid; the midpoint of the support would misplace a skewed profile.
  // This case is also why the budget cannot simply be handed to
  // spectrumSamples(), which floors at two nodes and would quietly return
  // twice what the caller can afford.
  //
  // A line spectrum is exempt: its samples are a lamp's actual emission
  // lines, not quadrature nodes, and a discharge lamp reaches here with a
  // bandwidth because resolveSourceSpectrum() reports the span of its lines.
  // Collapsing those to a centroid would trace every order at a wavelength
  // the light does not contain and erase the lines themselves. They stay
  // whole and the cap deals with the count: under-reporting a little through
  // truncation is much the better failure.
  const discrete = ray.spec?.kind === 'lines';
  if (K === 1 && !discrete) {
    const center = ray.spec ? (spectrumStats(ray.spec)?.center ?? (lo + hi) / 2) : ray.wl;
    return [{ wl: center, weight: 1, spectralLo: lo, spectralHi: hi }];
  }
  let samples = null;
  if (ray.spec) {
    samples = spectrumSamples(ray.spec, K);
  }
  if (!samples) samples = Array.from({ length: K }, (_, i) => ({
    wl: K === 1 ? (lo + hi) / 2 : lo + (hi - lo) * i / (K - 1),
    weight: 1,
  }));
  // These are quadrature nodes across a continuous spectrum. Trapezoidal
  // endpoint weights keep a flat band flat and give each child an explicit
  // spectral cell, instead of later presenting the computational nodes as
  // invented laser lines.
  //
  // A lamp's lines are not nodes of anything — they are the emission itself,
  // and there is no interval outside the outermost of them to take half of.
  // Halving those two hands a mercury lamp's 365 and 1014 nm lines half the
  // power they emit and, after renormalising, pushes it into the lines in
  // between.
  const cellLo = index => (index === 0 ? lo : (samples[index - 1].wl + samples[index].wl) / 2);
  const cellHi = index => (index === samples.length - 1 ? hi : (samples[index].wl + samples[index + 1].wl) / 2);
  // A band a filter has left is weighted by the spectrum integrated over each
  // cell. Weighting it by the density at the node gave its two outer cells
  // nothing -- their nodes sit on the passband edges, where the sampled
  // profile falls to zero -- and the band came out narrower than the light.
  // An emitted Gaussian or flat band keeps the node rule.
  const cellWeight = index => {
    const a = cellLo(index), b = cellHi(index);
    if (!(b > a)) return 0;
    let sum = 0;
    for (let i = 0; i < 32; i++) sum += Math.max(0, spectrumWeight(ray.spec, a + (b - a) * (i + 0.5) / 32));
    return sum * (b - a) / 32;
  };
  const weighted = discrete ? samples : samples.map((sample, index) => ({
    ...sample,
    weight: ray.spec?.kind === 'sampled' ? cellWeight(index)
      : sample.weight * (index === 0 || index === samples.length - 1 ? 0.5 : 1),
  }));
  const total = weighted.reduce((sum, sample) => sum + sample.weight, 0);
  return weighted.map((sample, index) => ({
    ...sample,
    weight: sample.weight / total,
    spectralLo: cellLo(index),
    spectralHi: cellHi(index),
  }));
}

// The diffraction orders a shaper's grating layer is configured for, as
// written in its comma-separated `orders` field.
function shaperLayerOrders(ly) {
  const parsed = [...new Set(String(ly.orders ?? '1').split(',')
    .map(v => parseInt(v.trim(), 10)).filter(m => Number.isFinite(m)))].slice(0, 21);
  return parsed.length ? parsed : [1];
}

// An order steeper than grazing is evanescent: sin(theta_out) would exceed 1,
// so it carries no light away from the grating and must not be handed a share
// of it either. A real grating redistributes a passing-off order's energy into
// the orders that still propagate (the Rayleigh anomaly), and dividing by the
// propagating count is that same bookkeeping. Without it a fine grating at a
// long wavelength quietly loses most of the beam: 2400 l/mm asked for orders
// -1,0,1 at 532 nm has only the zeroth order to give light to, and reported a
// third of the beam because it still divided by three.
//
// The count is per wavelength sample, since an order can propagate at one end
// of a band and pass off at the other.
function propagatingOrderCounts(orders, wls, si, groove) {
  return wls.map(w => orders.reduce(
    (count, m) => count + (m === 0 || Math.abs(si + m * w.wl / groove) <= 1 ? 1 : 0), 0));
}

// Wavelengths used to settle propagation across a band that travels whole, in
// one ray per order. It only has to place a pass-off edge, not resolve a
// spectrum, and it is walked in the coarsest regime only.
const COARSE_GRID = 129;

// Whether order m leaves the grating at all at this wavelength.
const orderPropagates = (m, wl, si, groove) =>
  m === 0 || Math.abs(si + m * wl / groove) <= 1;

// When the ray budget leaves a single spectral node, the whole band travels in
// one ray per order and propagation cannot be settled at the centroid: an
// order that passes off inside the band still carries everything below its
// cutoff, and the orders alive there share what it gives up. Deciding that at
// one wavelength gives an order either all of the band or none of it.
//
// Every order's share comes off the same grid, so they still sum to exactly
// the incident power — at each wavelength the live orders divide one between
// them. The reshaped profile each order carries is taken separately, through
// the machinery a filter uses, and is deliberately not allowed to set the
// share: a second grid would conserve power slightly less than exactly.
function coarseOrderShares(ray, orders, si, groove) {
  const [lo, hi] = ray.spec
    ? spectrumSupport(ray.spec)
    : [ray.wl - ray.bw / 2, ray.wl + ray.bw / 2];
  const shares = new Map(orders.map(m => [m, 0]));
  let total = 0;
  for (let i = 0; i < COARSE_GRID; i++) {
    const wl = lo + (hi - lo) * i / (COARSE_GRID - 1);
    const weight = ray.spec ? Math.max(0, spectrumWeight(ray.spec, wl)) : 1;
    if (!(weight > 0)) continue;
    total += weight;
    const live = orders.filter(m => orderPropagates(m, wl, si, groove));
    for (const m of live) shares.set(m, shares.get(m) + weight / live.length);
  }
  if (!(total > 0)) return null;
  for (const m of orders) shares.set(m, shares.get(m) / total);
  return shares;
}

// Rebuilding a profile per order costs a re-grid of the spectrum, and every
// spatial sample of a beam meets the grating at the same angle carrying the
// same spectrum: without this a 25-sample beam repeats identical work 25
// times, which measured 12 ms on a 21-order layer against 0.3 ms with it.
// Reset per trace alongside the other caches in traceScene().
let coarsePortCache = new Map();
const specIds = new WeakMap();
let nextSpecId = 1;
function specKey(spec) {
  if (!spec) return 'none';
  let id = specIds.get(spec);
  if (!id) { id = nextSpecId++; specIds.set(spec, id); }
  return id;
}

// A quadrature node stands for a slice of the incident spectrum, not for a
// laser line at its centre. Handing the child only the slice's bounds tells
// detectors the truth — they read spectralLo/Hi — but nothing else: a filter
// or a dichroic takes its !ray.bw path and judges the whole slice by the one
// wavelength. Carrying the slice itself lets them cut inside it. Budgeting
// makes the slices wider, so this matters more here than it used to: a
// 400-800 nm beam across nine orders has 200 nm slices, and a 799 nm longpass
// passed a whole half-band on the strength of its 800 nm label.
//
// Cached per trace: every order shares the same set of slices, so there are
// only ever as many distinct ones as there are nodes.
let cellSpectrumCache = new Map();
function cellSpectrum(ray, lo, hi) {
  if (!ray.spec || !(ray.bw > 0) || !(hi > lo)) return null;
  const key = `${specKey(ray.spec)}|${lo}|${hi}`;
  if (cellSpectrumCache.has(key)) return cellSpectrumCache.get(key);
  const shaped = applyTransmission(ray.spec, ray.wl, wl => (wl >= lo && wl <= hi ? 1 : 0));
  const cell = shaped?.spec ? { spec: shaped.spec, bw: shaped.bw } : null;
  cellSpectrumCache.set(key, cell);
  return cell;
}

// What each order leaves with when the whole band travels in one ray: the
// share of the incident power, and the colours that share is made of.
function coarseOrderPorts(ray, orders, si, groove) {
  const key = `${si.toFixed(9)}|${groove}|${orders.join(',')}|${specKey(ray.spec)}|${ray.wl}|${ray.bw}`;
  const cached = coarsePortCache.get(key);
  if (cached) return cached;
  const shares = coarseOrderShares(ray, orders, si, groove);
  if (!shares) return null;
  const ports = new Map();
  for (const m of orders) {
    const fraction = shares.get(m);
    if (!(fraction > 0)) continue;
    const shaped = applyTransmission(ray.spec, ray.wl, wl => (orderPropagates(m, wl, si, groove)
      ? 1 / orders.filter(k => orderPropagates(k, wl, si, groove)).length : 0));
    // A share this order really holds must never be dropped because the
    // re-grid declined to build a profile for it — that would lose the light
    // rather than merely describe it coarsely. Fall back to the incident
    // spectrum instead.
    ports.set(m, shaped
      ? { fraction, spec: shaped.spec, wl: shaped.wl, bw: shaped.bw }
      : { fraction, spec: ray.spec, wl: ray.wl, bw: ray.bw });
  }
  coarsePortCache.set(key, ports);
  return ports;
}

// The undiffracted order leaves as one polychromatic ray rather than splitting
// per wavelength, so when N varies across the band its share is not a scalar
// but a spectral shaping: it keeps everything where the other orders have
// passed off, and 1/N where they still propagate. A 400-800 nm beam on a
// 1600 l/mm grating loses its +-1 orders above 625 nm, so its zeroth order
// comes out distinctly red-weighted — scaling by the band average alone hands
// a spectrometer the right total power with the incident colour balance.
//
// Returns the fraction to scale intensity by, plus the reshaped profile to
// carry when the spectrum really is reshaped.
function zeroOrderPort(ray, orders, wls, counts, si, groove) {
  // No order passing off inside the band is the common case, and there the
  // share is exactly 1/N with the spectrum untouched. Taking that division
  // directly keeps the result bit-identical to the plain 1/N this replaced,
  // instead of accumulating rounding across a quadrature sum.
  const first = counts[0];
  if (counts.every(count => count === first)) return { fraction: first ? 1 / first : 0 };

  // The fraction stays on the same quadrature nodes the diffracted orders are
  // weighted by, so the shares still telescope to exactly the incident power:
  // each node contributes w/N once for the zeroth order and once per
  // propagating order, N of them in total. The reshaped profile below is only
  // the colour balance, and is deliberately not allowed to set the fraction —
  // a finer grid there would conserve power slightly less than exactly.
  const fraction = wls.reduce((sum, w, i) => sum + (counts[i] ? w.weight / counts[i] : 0), 0);
  const share = wl => {
    const live = orders.reduce((count, m) =>
      count + (m === 0 || Math.abs(si + m * wl / groove) <= 1 ? 1 : 0), 0);
    return live ? 1 / live : 0;
  };

  // A lamp's lines each take their own share exactly. Re-gridding them the way
  // a continuum is re-gridded would smear them into a profile that is no
  // longer a line spectrum, inventing light between the lines.
  if (ray.spec?.kind === 'lines') {
    const scaled = lineSpectrum(ray.spec.lines.map(l => ({ nm: l.nm, w: l.w * share(l.nm) })));
    const stats = scaled && spectrumStats(scaled);
    if (!scaled || !stats) return { fraction: 0 };
    const brightest = scaled.lines.reduce((best, l) => (l.w > best.w ? l : best));
    return { fraction, spec: scaled, wl: brightest.nm, bw: stats.fwhm };
  }

  // For a continuum this is exactly what a filter does to a spectrum, so it
  // goes through the same machinery, on a grid fine enough to place the
  // pass-off edge properly rather than on the handful of quadrature nodes.
  const shaped = ray.spec && applyTransmission(ray.spec, ray.wl, share);
  if (shaped) return { fraction, spec: shaped.spec, wl: shaped.wl, bw: shaped.bw };
  // No profile to reshape: the band-averaged fraction is all there is.
  return { fraction };
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
  const inBand = Math.abs(wl - d.center) <= d.band / 2;
  // A band reflector is the coating on an OPO or laser cavity mirror: high
  // reflection over one band, transmission on both sides of it.
  return d.dtype === 'notch' ? !inBand : inBand;
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

// The mean Airy transmission over [lo, hi] nm, weighted by `weight(nm)`
// (flat when omitted), resolved at any finesse. The transmission is periodic in
// the round-trip phase φ = 4π d cosθ / λ, and over φ one fringe integrates in
// closed form:
//   ∫ dφ / (1 + F sin²(φ/2)) = (2/s) [atan(s tan(φ/2 − kπ)) + kπ],  s = √(1+F),
// with k the nearest whole number of half-turns, which keeps it continuous.
// Only the Jacobian dλ/dφ = λ²/(4π d cosθ) and the spectral weight are taken
// piecewise constant, over pieces far wider than a fringe can make a fixed
// grid of samples wrong: a 0.01 nm linewidth over a 60 nm slice was
// overestimated 6.7 times by sampling.
export function etalonMeanTransmission(lo, hi, cosTheta, data, weight = null) {
  if (!(hi > lo)) return etalonAiryTransmission(lo, cosTheta, data);
  const R = data.R;
  const oneMinusR = Math.max(1e-6, 1 - R);
  const surfaceT = Math.max(0, 1 - R - data.loss);
  const peak = (surfaceT * surfaceT) / (oneMinusR * oneMinusR);
  const scale = Math.sqrt(1 + (4 * R) / (oneMinusR * oneMinusR));
  const optical = 4 * Math.PI * data.spacingNm * cosTheta;
  const G = phi => {
    const k = Math.round(phi / 2 / Math.PI);
    return (2 / scale) * (Math.atan(scale * Math.tan(phi / 2 - k * Math.PI)) + k * Math.PI);
  };
  const PIECES = 256;
  let transmitted = 0, total = 0;
  for (let i = 0; i < PIECES; i++) {
    const a = lo + (hi - lo) * i / PIECES, b = lo + (hi - lo) * (i + 1) / PIECES, mid = (a + b) / 2;
    const w = weight ? Math.max(0, Number(weight(mid)) || 0) : 1;
    if (!(w > 0)) continue;
    // ∫ T dλ over the piece = (dλ/dφ at its middle) · peak · ∫ dφ/(1+F sin²).
    transmitted += w * (mid * mid / optical) * peak * (G(optical / a) - G(optical / b));
    total += w * (b - a);
  }
  return total > 0 ? Math.max(0, Math.min(1, transmitted / total)) : 0;
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
    // Under 2 nm the slice travels monochromatic, as a fanned sample does,
    // and like one keeps the slice it carries: a 1 nm bandpass passes 1 nm of
    // continuum, which a spectrometer and the pulse duration both read.
    ...(nbw > 0 ? {} : { spectralContinuum: true, spectralLo: lo, spectralHi: hi, spectralWidthNm: hi - lo }),
    intensity: ray.intensity * Math.min(1, Math.max(0, (hi - lo) / ray.bw)),
  };
}

// A wavelength sample fanned out by dispersive refraction travels with bw 0 —
// it has to, or the next glass surface would fan it out all over again — but
// it still stands for a slice [spectralLo, spectralHi] of a continuum, and a
// detector already integrates across that slice. A filter or dichroic has to
// as well: judging the slice by its node alone passed a whole 60 nm sample of
// a 400-900 nm supercontinuum through a 1 nm bandpass. The slice is taken as
// flat inside, which is what the detector assumes when it paints it.
function sampleCell(ray) {
  if (ray.bw) return null;
  if (ray.spectralContinuum && Number.isFinite(ray.spectralLo) && Number.isFinite(ray.spectralHi) && ray.spectralHi > ray.spectralLo) {
    return [ray.spectralLo, ray.spectralHi];
  }
  // A grating order's sample keeps its slice as fanLo/fanHi instead, so that
  // spectrometers go on drawing it as a line; a filter still has to cut it.
  const lo = ray.fanLo, hi = ray.fanHi;
  return Number.isFinite(lo) && Number.isFinite(hi) && hi > lo ? [lo, hi] : null;
}

// The part of a cell inside a passband and the (up to two) parts outside it.
function splitCell(cell, pb) {
  const eps = 1e-9 * (cell[1] - cell[0]);
  const ix = bandIntersect(cell, pb);
  return {
    inside: ix && ix[1] - ix[0] > eps ? ix : null,
    outside: [[cell[0], Math.min(cell[1], pb[0])], [Math.max(cell[0], pb[1]), cell[1]]]
      .filter(([lo, hi]) => hi - lo > eps),
  };
}

// A still-monochromatic child carrying the piece [lo, hi] of its parent's cell,
// with the power that piece holds. The node wavelength stays where it lies in
// the piece — it set the ray's direction — and otherwise moves to the piece's
// middle so the colour and label describe light the ray actually carries. The
// tag keeps the child off the single-child fast path, which would drop the
// narrowed bounds.
function cellChild(ray, d, cell, lo, hi, tag, share = 1) {
  return {
    d, tag,
    wl: ray.wl >= lo && ray.wl <= hi ? ray.wl : (lo + hi) / 2,
    spectralContinuum: true, spectralLo: lo, spectralHi: hi, spectralWidthNm: hi - lo,
    // A grating sample's own record of its slice narrows with it.
    ...(Number.isFinite(ray.fanLo) ? { fanLo: lo, fanHi: hi } : {}),
    intensity: ray.intensity * share * (hi - lo) / (cell[1] - cell[0]),
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
  // A parabola x = -y^2/(4f) has gradient (1, y/(2f)) in its own frame, so
  // the exact normal is available at any point on it. Using it rather than
  // the facet chord is what makes reflection off the curve exact.
  const parabolaNormal = () => {
    const { cx, cy, ux, uy, f } = data.parab;
    // hit.p is on a facet CHORD, not on the curve, so its height is not quite
    // the height at which the ray really meets the parabola. Using it directly
    // leaves an error that grows as the facets get long relative to the
    // curvature: negligible at f = 25, but measurable at f = 5.
    // Solve the ray against the curve itself. With a = local x, b = local y
    // and the surface a + b^2/(4f) = 0, substituting a = a0 + t*da and
    // b = b0 + t*db gives a quadratic in t.
    const rx = ray.x - cx, ry = ray.y - cy;
    const a0 = rx * ux.x + ry * ux.y, b0 = rx * uy.x + ry * uy.y;
    const da = d.x * ux.x + d.y * ux.y, db = d.x * uy.x + d.y * uy.y;
    const k = 1 / (4 * f);
    const A = k * db * db, B = da + 2 * k * b0 * db, C = a0 + k * b0 * b0;
    let t = null;
    if (Math.abs(A) < 1e-12) {
      // Ray parallel to the axis: the equation is linear in t.
      if (Math.abs(B) > 1e-12) t = -C / B;
    } else {
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const root = Math.sqrt(disc);
        const t1 = (-B - root) / (2 * A), t2 = (-B + root) / (2 * A);
        // Both roots are real intersections with the full parabola; the facet
        // already told us which one the ray actually reached.
        const candidates = [t1, t2].filter(v => Number.isFinite(v));
        for (const v of candidates) {
          if (t === null || Math.abs(v - hit.t) < Math.abs(t - hit.t)) t = v;
        }
      }
    }
    // If the quadratic degenerates, the chord height is still the best
    // estimate available and is what the facets were built to approximate.
    const local = t === null
      ? (hit.p.x - cx) * uy.x + (hit.p.y - cy) * uy.y
      : b0 + t * db;
    const slope = local / (2 * f);
    return norm({ x: ux.x + uy.x * slope, y: ux.y + uy.y * slope });
  };
  const asphereNormal = () => {
    const profile = data.asphere;
    const offset = { x: hit.p.x - profile.cx, y: hit.p.y - profile.cy };
    const localY = dot(offset, profile.uy);
    const slope = asphereSlope(localY, profile);
    // Gradient of x - sag(y) = 0, transformed back to world coordinates.
    return norm(sub(profile.ux, mul(profile.uy, slope)));
  };
  const n = data.arc
    ? norm({ x: hit.p.x - data.arc.cx, y: hit.p.y - data.arc.cy })
    : data.parab ? parabolaNormal()
      : data.asphere ? asphereNormal()
      : perp(t);

  switch (k) {
    case 'absorb': return [];
    case 'detector': return [];
    case 'gdd': {
      // A zero-thickness proxy for the net second-order spectral phase of a
      // grating/prism/chirped-mirror compressor. It does not bend the ray or
      // model a carrier phase; it only adds signed GDD to the running total.
      const applied = Number.isFinite(Number(data.gddFs2))
        ? Math.min(1000000, Math.max(-1000000, Number(data.gddFs2))) : 0;
      const efficiency = Math.min(1, Math.max(0.01, Number(data.efficiency) || 1));
      const incoming = Number.isFinite(ray.gdd) ? ray.gdd : 0;
      const delayChange = gddGroupDelayDifferenceFs(
        applied, ray.pulse?.spectrumLoNm, ray.pulse?.spectrumHiNm,
      );
      const incomingDelayDifference = Number.isFinite(ray.groupDelayDifferenceFs)
        ? ray.groupDelayDifferenceFs : 0;
      recordCompressor(s.el?.id, incoming, incoming + applied);
      return [{
        d,
        intensity: ray.intensity * efficiency,
        gdd: incoming + applied,
        groupDelayDifferenceFs: incomingDelayDifference
          + (Number.isFinite(delayChange) ? delayChange : 0),
      }];
    }
    case 'attenuate': {
      // A specimen with no signals yet still reports what illuminates it, so
      // the inspector can offer live emission defaults the moment one is
      // added (see specimenIncidentWls).
      if (specimenProbe && data.specimen) recordProbeBeam(s, ray);
      return [{ d, intensity: ray.intensity * Math.min(1, Math.max(0, data.transmission ?? 1)) }];
    }
    case 'conicmirror': {
      // n points toward local +x. Only the chosen coated side reflects.
      if (dot(d, n) * data.frontSign >= 0) return [];
      const R = Math.min(1, Math.max(0, (data.refl ?? 98) / 100));
      return R > 0 ? [{ d: reflect(d, n), intensity: ray.intensity * R }] : [];
    }
    case 'mirror': {
      // partial reflectivity (cavity mirrors / output couplers): reflect R,
      // transmit 1-R. The transmitted ray is retained through the bounded
      // weak-power path budget, so a detector or sample placed behind the
      // mirror reads the correct leaked power
      // for a transmission power budget — but only drawn on the canvas
      // when showTransmitted is on (see the `hidden` flag consumed by
      // traceScene(), which strips hidden rays before assembling drawables
      // without touching detector-hit recording).
      const R = Math.min(1, Math.max(0, (data.refl ?? 100) / 100));
      if (R >= 1) return [{ d: reflect(d, n), phaseShift: Math.PI }];
      const out = [];
      if (R > 0) out.push({ d: reflect(d, n), intensity: ray.intensity * R, tag: 'R', retainWeak: true });
      // Solid polygon wheels absorb coating losses; leaking through the
      // wheel would otherwise produce spurious internal facet reflections.
      if (R < 1 && !data.opaque) out.push({ d, intensity: ray.intensity * (1 - R), tag: 'T', hidden: !data.showTransmitted, retainWeak: true });
      return out;
    }
    case 'cmirror': {
      const R = Math.min(1, Math.max(0, (data.refl ?? 100) / 100));
      // A real spherical surface reflects off its own normal, and the
      // aberration follows from that. `data.arc` gives the exact normal at
      // the hit point, so no paraxial bend is applied or wanted: a sphere
      // does not bring marginal rays to the paraxial focus, and pretending
      // otherwise hid the entire reason parabolic mirrors exist.
      const focused = data.arc ? reflect(d, n) : lensBend(reflect(d, n), hit.p, s, data.f);
      if (R >= 1) return [{ d: focused }];
      const out = [];
      if (R > 0) out.push({ d: focused, intensity: ray.intensity * R, tag: 'R', retainWeak: true });
      if (R < 1) out.push({ d, intensity: ray.intensity * (1 - R), tag: 'T', hidden: !data.showTransmitted, retainWeak: true });
      return out;
    }
    case 'metalens': {
      const efficiency = Math.min(1, Math.max(0, Number(data.focusEff) / 100 || 0));
      const sampled = ray.bw > 0;
      const samples = wlSamples(ray);
      return samples.map((sample, i) => {
        const focalLength = metalensFocalLength(data, sample.wl);
        recordMetalensHit(s.el?.id, sample.wl, focalLength);
        return {
          d: lensBend(d, hit.p, s, focalLength),
          wl: sample.wl,
          bw: sampled ? 0 : ray.bw,
          ...(sampled ? {
            spec: null,
            color: wavelengthToColor(sample.wl),
            spectralCount: samples.length,
            tag: `w${i}`,
          } : {}),
          intensity: ray.intensity * efficiency * (sampled ? sample.weight : 1),
        };
      });
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
      const materialGVD = data.gddMaterial
        ? glassGVD(data.gddMaterial, ray.wl) : null;
      const estimatedGdd = Number.isFinite(materialGVD) && Number.isFinite(data.gddThicknessMm)
        ? materialGVD * Math.max(0, data.gddThicknessMm) : 0;
      const delayChange = data.gddMaterial && Number.isFinite(data.gddThicknessMm)
        ? glassGroupDelayDifferenceFs(
          data.gddMaterial, ray.pulse?.spectrumLoNm, ray.pulse?.spectrumHiNm,
          Math.max(0, data.gddThicknessMm),
        ) : null;
      return [{
        d: bent,
        intensity: ray.intensity * T,
        gdd: (Number.isFinite(ray.gdd) ? ray.gdd : 0) + estimatedGdd,
        groupDelayDifferenceFs: (Number.isFinite(ray.groupDelayDifferenceFs)
          ? ray.groupDelayDifferenceFs : 0) + (Number.isFinite(delayChange) ? delayChange : 0),
      }];
    }
    case 'refract': {
      const materialId = s.el?.id || null;
      const inside = materialId !== null && ray.medium === materialId;
      // Catalogue glass is dispersive: a broadband ray must be sampled across
      // its bandwidth so each wavelength refracts by its own n(λ) and the
      // beam actually fans out (e.g. white light through a prism). A fixed
      // user-set index (glass rods) has no dispersion to sample.
      const materialDispersive = isDispersiveGlass(data.material);
      const dispersive = materialDispersive && ray.bw > 0;
      const transmitAt = (wl, intensity = ray.intensity, tag, bandwidth = ray.bw) => {
        const dispersiveIor = materialDispersive ? glassIndex(data.material, wl) : data.ior;
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
          mediumMaterial: inside ? null : (materialDispersive ? data.material : null),
          ior: n2,
          intensity: intensity * Math.min(1, Math.max(0, data.transmission ?? 1)),
        };
      };
      if (dispersive) {
        const samples = wlSamples(ray);
        // Each sample is one slice of a beam that is still physically single
        // until the colours actually separate. Carrying the sibling count lets
        // the renderer draw the overlapping region at a share of full opacity
        // instead of stacking eight saturated colours on the same pixels.
        return samples.map((s, i) => ({
          ...transmitAt(s.wl, ray.intensity * s.weight, `w${i}`, 0),
          spectralCount: samples.length,
          spectralContinuum: true,
          spectralLo: s.spectralLo,
          spectralHi: s.spectralHi,
          spectralWidthNm: s.spectralHi - s.spectralLo,
        }));
      }
      return [transmitAt(ray.wl)];
    }
    case 'dichroic': {
      // A band reflector may return only part of its band, as an output
      // coupler's coating does: the rest of the band is transmitted. Both
      // parts are retained below the normal drawing cutoff, within the trace
      // budgets, as a partial mirror's are.
      const inBandR = data.dtype === 'notch' ? Math.min(1, Math.max(0, (data.bandRefl ?? 100) / 100)) : 1;
      const partial = inBandR < 1;
      notePulseSelection(wl => (dichroicTransmits(wl, data) ? 1 : 1 - inBandR), passbandOf(data));
      const cell = sampleCell(ray);
      if (cell) {
        const { inside, outside } = splitCell(cell, passbandOf(data));
        const rd = reflect(d, n);
        // A cell wholly on one side of every edge behaves as its node does.
        if (!inside || !outside.length) {
          const transmits = dichroicTransmits(ray.wl, data);
          if (transmits || !partial) return [{ d: transmits ? d : rd }];
        }
        const notch = data.dtype === 'notch';
        const out = [];
        if (inside) {
          if (!notch) out.push(cellChild(ray, d, cell, inside[0], inside[1], 'T'));
          else {
            if (inBandR > 0) out.push({ ...cellChild(ray, rd, cell, inside[0], inside[1], 'R', inBandR), retainWeak: partial });
            if (partial) out.push({ ...cellChild(ray, d, cell, inside[0], inside[1], 'Tb', 1 - inBandR), retainWeak: true });
          }
        }
        outside.forEach(([lo, hi], i) => out.push(
          cellChild(ray, notch ? d : rd, cell, lo, hi, `${notch ? 'T' : 'R'}${i}`)));
        return out;
      }
      if (!ray.bw) {
        if (dichroicTransmits(ray.wl, data)) return [{ d }];
        if (!partial) return [{ d: reflect(d, n) }];
        const split = [];
        if (inBandR > 0) split.push({ d: reflect(d, n), intensity: ray.intensity * inBandR, tag: 'R', retainWeak: true });
        split.push({ d, intensity: ray.intensity * (1 - inBandR), tag: 'T', retainWeak: true });
        return split;
      }
      // A Gaussian (or already-filtered) input has no closed-form box
      // overlap with the passband — integrate the real profile numerically.
      if (ray.spec && ray.spec.kind !== 'flat') {
        const T = wl => (dichroicTransmits(wl, data) ? 1 : 1 - inBandR);
        const out = [];
        const weak = partial ? { retainWeak: true } : {};
        const trans = applyTransmission(ray.spec, ray.wl, T);
        if (trans) out.push({ d, wl: trans.wl, bw: trans.bw, spec: trans.spec, intensity: ray.intensity * trans.fraction, tag: 'T', ...weak });
        const refl = applyTransmission(ray.spec, ray.wl, wl => 1 - T(wl));
        if (refl) out.push({ d: reflect(d, n), wl: refl.wl, bw: refl.bw, spec: refl.spec, intensity: ray.intensity * refl.fraction, tag: 'R', ...weak });
        return out;
      }
      // flat (supercontinuum) or unspecified box: exact analytic overlap
      const rb = [ray.wl - ray.bw / 2, ray.wl + ray.bw / 2];
      const pb = passbandOf(data);
      const out = [];
      const rd = reflect(d, n);
      // A band reflector is a bandpass with the two ports exchanged.
      const [inside, outside] = data.dtype === 'notch' ? [rd, d] : [d, rd];
      const [insideTag, outsideTag] = data.dtype === 'notch' ? ['R', 'T'] : ['T', 'R'];
      const ix = bandIntersect(rb, pb);
      if (ix && ix[1] - ix[0] > 0.5) {
        if (!partial) out.push(bandChild(ray, inside, ix[0], ix[1], insideTag));
        else {
          const scaled = (dir, tag, share) => {
            const c = bandChild(ray, dir, ix[0], ix[1], tag);
            return { ...c, intensity: c.intensity * share, retainWeak: true };
          };
          if (inBandR > 0) out.push(scaled(rd, 'R', inBandR));
          out.push(scaled(d, 'Tb', 1 - inBandR));
        }
      }
      if (rb[0] < pb[0] - 0.5) out.push(bandChild(ray, outside, rb[0], Math.min(rb[1], pb[0]), `${outsideTag}0`));
      if (rb[1] > pb[1] + 0.5) out.push(bandChild(ray, outside, Math.max(rb[0], pb[1]), rb[1], `${outsideTag}1`));
      return out;
    }
    case 'filter': {
      const f = data;
      if (f.ftype === 'nd') return [{ d, intensity: ray.intensity * f.trans }];
      notePulseSelection(wl => { const pb = passbandOf(f); return wl >= pb[0] && wl <= pb[1] ? 1 : 0; }, passbandOf(f));
      if (!ray.bw) {
        const pb0 = passbandOf(f);
        const cell = sampleCell(ray);
        if (cell) {
          const { inside, outside } = splitCell(cell, pb0);
          if (!inside) return [];
          return outside.length ? [cellChild(ray, d, cell, inside[0], inside[1], 'T')] : [{ d }];
        }
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
      notePulseSelection(T);
      const rd = reflect(d, n);
      if (!ray.bw) {
        // A fanned-out sample takes the Airy curve's fringe-resolved mean over
        // the slice it stands for. The children stay monochromatic and keep
        // the slice's bounds: this is the slice's power, not its comb -- a
        // second etalon or narrow filter downstream sees the slice as flat.
        const cell = sampleCell(ray);
        const t = cell ? etalonMeanTransmission(cell[0], cell[1], cosTheta, data) : T(ray.wl);
        const out = [];
        if (t > ETALON_FLOOR) out.push({ d, intensity: ray.intensity * t, tag: 'T' });
        if (1 - t > ETALON_FLOOR) out.push({ d: rd, intensity: ray.intensity * (1 - t), tag: 'R' });
        return out;
      }
      const out = [];
      // The sampled comb gives each port's spectrum its shape; how much light
      // each port takes is the fringe-resolved mean, which the fixed grid of
      // that comb cannot give at high finesse.
      const [lo, hi] = ray.spec ? spectrumSupport(ray.spec) : [ray.wl - ray.bw / 2, ray.wl + ray.bw / 2];
      const t = etalonMeanTransmission(lo, hi, cosTheta, data, ray.spec ? nm => spectrumWeight(ray.spec, nm) : null);
      const trans = applyTransmission(ray.spec, ray.wl, T);
      if (trans && t > ETALON_FLOOR) out.push({ d, wl: trans.wl, bw: trans.bw, spec: trans.spec, intensity: ray.intensity * t, tag: 'T' });
      const refl = applyTransmission(ray.spec, ray.wl, wl => 1 - T(wl));
      if (refl && 1 - t > ETALON_FLOOR) out.push({ d: rd, wl: refl.wl, bw: refl.bw, spec: refl.spec, intensity: ray.intensity * (1 - t), tag: 'R' });
      return out;
    }
    case 'split': {
      const r = Math.min(1, Math.max(0, data.ratio));
      const out = [];
      const transmitted = ray.intensity * r;
      const reflected = ray.intensity * (1 - r);
      if (r > 0) out.push({
        d, intensity: transmitted, tag: 'T',
        retainWeak: !ray.phaseValid && transmitted < MIN_INT,
      });
      if (1 - r > 0) out.push({
        d: reflect(d, n), intensity: reflected, tag: 'R', phaseShift: Math.PI / 2,
        retainWeak: !ray.phaseValid && reflected < MIN_INT,
      });
      return out;
    }
    case 'grating': {
      const si = dot(d, t);                       // sin(incidence), signed
      const sIn = dot(d, n) >= 0 ? 1 : -1;
      const out = [];
      const wls = wlSamples(ray);
      const counts = propagatingOrderCounts(data.orders, wls, si, data.d);
      for (const m of data.orders) {
        // The undiffracted order keeps the incident spectrum intact. It
        // redirects the whole band specularly (or passes it straight through),
        // rather than turning the first spectral sample into a laser line.
        if (m === 0) {
          const port = zeroOrderPort(ray, data.orders, wls, counts, si, data.d);
          out.push({
            d: data.transmissive ? d : reflect(d, n),
            intensity: ray.intensity * port.fraction,
            // Only carried when the band really is reshaped; otherwise the
            // ray inherits the incident spectrum untouched.
            ...(port.spec !== undefined ? { spec: port.spec, wl: port.wl, bw: port.bw } : {}),
            tag: 'm0',
          });
          continue;
        }
        for (let i = 0; i < wls.length; i++) {
          const sd = si + m * wls[i].wl / data.d;
          if (Math.abs(sd) > 1) continue;
          const c = Math.sqrt(1 - sd * sd);
          const sOut = data.transmissive ? sIn : -sIn;
          out.push({
            // Only where dispersion actually happened: marking an
            // undispersed beam would repaint a monochromatic ray the user had
            // deliberately coloured, which is the guard the prism already
            // applies by comparing bandwidths.
            dispersed: m !== 0 && ray.bw > 0,
            d: norm(add(mul(n, sOut * c), mul(t, sd))),
            wl: wls[i].wl, bw: 0, spec: null,
            // The slice of the band this order sample stands for, kept apart
            // from spectralLo/Hi so spectrometers go on reading a grating's
            // output as they always have. Only the duration model's fan
            // coverage check reads it.
            ...(ray.bw > 0 && Number.isFinite(wls[i].spectralLo)
              ? { fanLo: wls[i].spectralLo, fanHi: wls[i].spectralHi } : {}),
            intensity: ray.intensity * wls[i].weight / counts[i],
            tag: 'm' + m + (wls.length > 1 ? 'w' + i : ''),
          });
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
    case 'aotf': {
      // Selected lines leave along the incoming axis; whatever is left of the
      // beam is deflected away as the depleted port. A channel narrower than
      // the beam's band takes only its overlap, so picking 2 nm out of a
      // supercontinuum really does keep only 2 nm worth of power.
      // `channels` is already only the lines open at this instant: every one
      // under multiplexed drive, exactly one under sequential drive.
      const channels = normalizeAotfChannels(data.channels);
      const passband = normalizeAotfPassband(data.passband);
      const a = (data.deflect || 0) * D2R;
      const deflected = { x: d.x * Math.cos(a) - d.y * Math.sin(a), y: d.x * Math.sin(a) + d.y * Math.cos(a) };
      const out = [];
      let takenFraction = 0;

      channels.forEach((c, i) => {
        if (!(c.eff > 0)) return;
        // An open line is fully open: the sequence decides which line, not how
        // much of it gets through.
        const pass = c.eff;
        const withGate = child => {
          // The selected line is the useful output and is often a thin slice
          // of a broad source, so it must survive the weak-ray cull that would
          // otherwise delete exactly the beam the user asked for.
          child.keepWeak = true;
          return child;
        };
        const transmission = aotfChannelTransmission(c, passband);
        notePulseSelection(transmission);

        if (!ray.bw) {
          // A single wavelength is simply attenuated by how far it sits from
          // line centre, instead of passing whole or not at all.
          const t = transmission(ray.wl);
          if (!(t > 0)) return;
          takenFraction += pass * t;
          out.push(withGate({ d, intensity: ray.intensity * pass * t, tag: `c${i}` }));
          return;
        }
        // Everything with a spectrum goes the same way, flat sources
        // included: a Lorentzian passband reshapes a profile rather than
        // cutting a slice out of it, so a flat band leaves peaked, not flat.
        const incident = ray.spec
          || flatSpectrum(ray.wl - ray.bw / 2, ray.wl + ray.bw / 2);
        const trans = applyTransmission(incident, ray.wl, transmission);
        if (!trans) return;
        takenFraction += trans.fraction * pass;
        out.push(withGate({
          d, wl: trans.wl, bw: trans.bw, spec: trans.spec,
          intensity: ray.intensity * trans.fraction * pass, tag: `c${i}`,
        }));
      });

      if (data.showDepleted) {
        const left = Math.max(0, 1 - Math.min(1, takenFraction));
        if (left > 0) {
          out.push({
            d: deflected, intensity: ray.intensity * left, tag: 'depleted',
            wl: ray.wl, bw: ray.bw, spec: ray.spec,
          });
        }
      }
      return out;
    }
    case 'aom':
    case 'aod': {
      const out = [];
      const isAod = hit.surface.kind === 'aod';
      const duty = data.gate ? Math.min(0.99, Math.max(0.01, data.gate.duty ?? 0.5)) : 1;
      const shape = data.gate?.shape === 'sine' || data.gate?.shape === 'sawtooth'
        ? data.gate.shape : 'square';
      const depth = Math.min(1, Math.max(0, data.gate?.depth ?? 1));
      // How much of the ramp's period is spent rising: 1 a rising sawtooth,
      // 0 a falling one, 0.5 a triangle. It shapes the gate without changing
      // its mean, so it only ever shows in the time domain -- which is why it
      // has to be carried onto the gate itself rather than folded into
      // averageTransmission below.
      const symmetry = Math.min(1, Math.max(0, Number(data.gate?.symmetry ?? 1)));
      // A square gate passes `duty` of the time; both continuous shapes sweep
      // symmetrically between 1-depth and 1, so each averages 1 - depth/2 --
      // a sine over its cosine and a sawtooth over its ramp.
      const averageTransmission = data.gate
        ? (shape === 'square' ? duty : 1 - depth / 2) : 1;
      // A square RF gate switches the diffracted order fully on and off, so it
      // can be drawn in chunks the way a chopper's CW output already is. This
      // is a drawing hint alone -- the intensities below are unchanged, and so
      // is every detector reading. A sinusoidal drive has no on/off edges to
      // chunk, so it is never marked.
      const chopped = data.gate && shape === 'square' && data.gate.drawChopped !== false
        ? { period: CHOP_SCHEMATIC_PERIOD_MM, duty, startMm: 0 } : null;
      // The zeroth order is the complement: light returns to it exactly while
      // the RF is off, so its chunks start where the diffracted order's stop
      // and one beam is lit wherever the other is dark.
      const choppedZero = chopped
        ? { period: CHOP_SCHEMATIC_PERIOD_MM, duty: 1 - duty, startMm: CHOP_SCHEMATIC_PERIOD_MM * duty }
        : null;
      const efficiency = Math.min(1, Math.max(0, Number(data.eff) || 0));
      let pulse = ray.pulse;
      if (data.gate && ray.pulse) {
        pulse = {
          ...ray.pulse,
          gates: [...(ray.pulse.gates || []), {
            opl: ray.opl, frequencyMHz: data.gate.frequencyMHz || 1, duty,
            phaseNs: data.gate.phaseNs || 0, shape, depth, symmetry,
          }],
        };
      }
      if (efficiency > 0) {
        const samples = isAod ? wlSamples(ray) : [{ wl: ray.wl, weight: 1 }];
        // An AOD only separates colours when its deflection depends on
        // wavelength. Driven at zero it sends the whole band one way, so the
        // beam leaves as the beam it arrived as and keeps the colour the user
        // chose for it -- having a bandwidth is not the same as having been
        // taken apart.
        const deflections = isAod
          ? samples.map(sample => aodDeflectionDeg(data, sample.wl, data.position))
          : [];
        const separates = deflections.length > 1
          && Math.max(...deflections) - Math.min(...deflections) > 1e-9;
        samples.forEach((sample, index) => {
          const deflection = isAod
            ? aodDeflectionDeg(data, sample.wl, data.position)
            : Number(data.deflect) || 0;
          const a = deflection * D2R, c = Math.cos(a), sn = Math.sin(a);
          out.push({
            d: { x: d.x * c - d.y * sn, y: d.x * sn + d.y * c },
            // Carried through untouched. Acousto-optic diffraction really does
            // shift the optical carrier by the drive frequency, but at
            // 7.6e-5 nm for 80 MHz at 532 nm it is a thousand times finer than
            // any wavelength difference this workbench resolves, so applying
            // it only ever moved a number nothing could report. The AOD
            // already declined it for the same reason.
            wl: sample.wl,
            // An AOD sends every wavelength to its own angle, so each child
            // really is one narrow slice travelling on its own. They are
            // quadrature nodes across a continuous spectrum all the same, and
            // have to say so: without the continuum flags a broadband source
            // comes out the far side as a handful of invented laser lines,
            // which is exactly what wlSamples warns against and what any
            // spectrometer downstream would then report.
            ...(isAod ? {
              // Same rule, and it asks whether the colours actually went
              // different ways. The acousto-optic shift moves the wavelength a
              // fraction of a nanometre even for a single line, which is not
              // reason enough to repaint a beam the user chose the colour of.
              dispersed: separates,
              bw: 0,
              spec: null,
              spectralCount: samples.length,
              spectralContinuum: ray.bw > 0,
              spectralLo: sample.spectralLo,
              spectralHi: sample.spectralHi,
              spectralWidthNm: Number.isFinite(sample.spectralHi) && Number.isFinite(sample.spectralLo)
                ? sample.spectralHi - sample.spectralLo
                : null,
            } : {}),
            intensity: ray.intensity * efficiency * sample.weight * (ray.pulse ? 1 : averageTransmission),
            ...(chopped ? { chopped } : {}),
            tag: isAod && samples.length > 1 ? `d1w${index}` : 'd1', pulse,
          });
        });
      }
      if (data.zero) {
        if (data.gate && ray.pulse) {
          // Residual zero order exists while RF is on; the diffracted fraction
          // returns to zero order while RF is off. Together the instantaneous
          // first + zero order remains energy-bounded.
          //
          // These two branches exist for the pulse calculation, but they draw
          // as one beam on one path, so the chunk hint belongs on both: with
          // it on the gated branch alone, the residual kept drawing a solid
          // stroke straight through the gaps and the zeroth order never went
          // dark. The branches themselves -- their intensities and gates --
          // are untouched.
          out.push({
            d, intensity: ray.intensity * (1 - efficiency), tag: 'd0r',
            ...(choppedZero ? { chopped: choppedZero } : {}),
          });
          out.push({
            d, intensity: ray.intensity * efficiency, tag: 'd0off',
            ...(choppedZero ? { chopped: choppedZero } : {}),
            pulse: {
              ...ray.pulse,
              gates: [...(ray.pulse.gates || []), {
                opl: ray.opl, frequencyMHz: data.gate.frequencyMHz || 1, duty,
                phaseNs: data.gate.phaseNs || 0, shape, depth, symmetry, invert: true,
              }],
            },
          });
        } else {
          // One ray, exactly as before -- the anti-phase chunks are a drawing
          // hint on it and nothing more. Splitting it into a residual plus
          // the light handed back during the off phase would have drawn the
          // zeroth order more honestly, but at high efficiency the residual
          // falls under the tracer's weak-branch floor and is culled at the
          // next ordinary optic, so a display flag would have moved a
          // detector reading (efficiency 0.99 through a lens: 0.505 -> 0.495).
          // A drawing choice must never do that. The cost is that the drawn
          // beam extinguishes fully while the RF is on even though a real
          // zeroth order keeps 1-efficiency; the wiki says so.
          // Emitted whatever it carries, including a sliver: the tracer
          // deliberately walks weak positive rays to detectors and other
          // low-power measurement surfaces, so dropping one here would change
          // a reading rather than only what is drawn. Whether it is DRAWN is
          // decided later, where drawing is decided.
          out.push({
            d, intensity: ray.intensity * (1 - efficiency * averageTransmission),
            ...(choppedZero ? { chopped: choppedZero } : {}), tag: 'd0',
          });
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
          if (m.mean <= MIN_RETAINED_POWER_INT) return [];
          return [{ d, intensity: ray.intensity * m.mean, pol: a, stokes, polMod: null, retainWeak: true, tag: 'pol' }];
        }
        if (Math.max(m.high, m.low) <= MIN_RETAINED_POWER_INT) return [];
        return [{ d, pol: a, stokes, polMod: null, pulse: withGate(ray.pulse, m.gate), retainWeak: true, tag: 'pol' }];
      }
      const f = analyzerTransmission(ray.stokes, a);
      if (f <= MIN_RETAINED_POWER_INT) return [];
      const stokes = linearStokes(a);
      return [{ d, intensity: ray.intensity * f, pol: a, stokes, retainWeak: true, tag: 'pol' }];
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
          if (m.mean > MIN_RETAINED_POWER_INT) out.push({ d, intensity: ray.intensity * m.mean, pol: 0, stokes: linearStokes(0), polMod: null, retainWeak: true, tag: 'T' });
          if (1 - m.mean > MIN_RETAINED_POWER_INT) out.push({ d: reflect(d, n), intensity: ray.intensity * (1 - m.mean), pol: 90, stokes: linearStokes(90), polMod: null, retainWeak: true, tag: 'R' });
          return out;
        }
        if (Math.max(m.high, m.low) > MIN_RETAINED_POWER_INT) {
          out.push({ d, pol: 0, stokes: linearStokes(0), polMod: null, pulse: withGate(ray.pulse, m.gate), retainWeak: true, tag: 'T' });
        }
        if (Math.max(1 - m.high, 1 - m.low) > MIN_RETAINED_POWER_INT) {
          out.push({
            d: reflect(d, n), pol: 90, stokes: linearStokes(90), polMod: null,
            pulse: withGate(ray.pulse, { ...m.gate, high: 1 - m.high, low: 1 - m.low }), retainWeak: true, tag: 'R',
          });
        }
        return out;
      }
      const ft = analyzerTransmission(ray.stokes, 0);
      const out = [];
      if (ft > MIN_RETAINED_POWER_INT) out.push({ d, intensity: ray.intensity * ft, pol: 0, stokes: linearStokes(0), retainWeak: true, tag: 'T' });
      if (1 - ft > MIN_RETAINED_POWER_INT) out.push({ d: reflect(d, n), intensity: ray.intensity * (1 - ft), pol: 90, stokes: linearStokes(90), retainWeak: true, tag: 'R' });
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
            const transferred = srsTransferGate(c, ray, data.incidentBeams, s.el?.id || null);
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
                d: { x: Math.cos(a), y: Math.sin(a) }, wl: line, bw: 0, spec: null, pol: undefined, stokes: null,
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

        // One chi(2) does both: a specimen that doubles a beam also sums two
        // of them. The second harmonic is emitted whatever the timing; the
        // pair's sum frequency only while both pulses are at the spot.
        if (c.kind === 'shg' && emitting) {
          for (const mixed of specimenMixedOutputs(c, ray, d, data, s.el?.id || null)) out.push(mixed);
        }
        const wl = specimenSignalWl(c, ray.wl, data.incidentWls);
        if (!(wl > 0)) continue;
        // Sum-frequency and CARS are wave mixing: no temporal overlap between
        // the two beams, no signal.
        let overlap = 1;
        if (MIXING_KINDS.has(c.kind) && c.autoWl !== false) {
          overlap = channelOverlap(c, ray, mixingPartner(ray, data.incidentBeams), data.incidentBeams, s.el?.id || null).factor;
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
            d: { x: Math.cos(a), y: Math.sin(a) }, wl: data.wl, bw: 0, spec: null, pol: undefined, stokes: null,
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
      let rays = [{
        d: data.transmissive ? d : reflect(d, n), intensity: ray.intensity * (1 - zf), tag: '',
        wl: ray.wl, bw: ray.bw, spec: ray.spec, spectralContinuum: ray.spectralContinuum,
        spectralLo: ray.spectralLo, spectralHi: ray.spectralHi,
      }];
      const L = data.length;
      const mid = mul(add(s.a, s.b), 0.5);
      const layers = (data.layers || []).slice(0, 4);
      // Size the whole stack's sampling before tracing any of it. Each layer
      // multiplies the ray count, so a diffuser in front of a many-order
      // grating has to scatter into fewer grains — otherwise the grating's
      // orders, which are real directions the user asked for, get truncated
      // away with their power. Grains are the sampling choice that gives:
      // orders are not negotiable, and steering and lenslets are one-for-one.
      // Grating spectral sampling is budgeted separately, per layer, below.
      const orderCounts = layers.map(ly => ly.type === 'grating' ? shaperLayerOrders(ly).length : 1);
      const orderProduct = orderCounts.reduce((a, b) => a * b, 1);
      // A sized beam already traces one ray per spatial sample, so its speckle
      // deflects rather than fans and costs nothing here.
      const fanningLayers = ray.sample == null
        ? layers.filter(ly => ly.type === 'speckle').length : 0;
      // Split the room left over from the orders evenly across the diffusers:
      // n of them each fanning by f cost f**n. The epsilon keeps an exact
      // power (24 grains over two layers) from floor()ing down on rounding.
      const speckleFan = fanningLayers
        ? Math.max(1, Math.min(5, Math.floor((SHAPER_RAY_CAP / orderProduct) ** (1 / fanningLayers) + 1e-9)))
        : 1;
      // What one ray entering layer j still has to expand into afterwards, so
      // each layer can leave room for the ones behind it.
      const multipliers = layers.map((ly, j) => ly.type === 'speckle' ? speckleFan : orderCounts[j]);
      const afterLayer = multipliers.map((_, j) => multipliers.slice(j + 1).reduce((a, b) => a * b, 1));
      for (let li = 0; li < layers.length; li++) {
        const ly = layers[li];
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
            const orders = shaperLayerOrders(ly);
            const gd = 1e6 / (ly.lines || 600);
            const si = dot(r.d, t);
            const sOut = dot(r.d, n) >= 0 ? 1 : -1;
            // Spend the budget on the orders first and the spectral sampling
            // second. An order is a distinct direction the user asked for; a
            // wavelength sample is only a quadrature node, and wlSamples
            // renormalises its weights to whatever count it is given. Sampling
            // more finely than the budget allows and letting the tail be
            // truncated would drop whole orders and their power with them —
            // a 400 nm band across 21 orders wants 189 rays and kept 24,
            // reporting an eighth of the light.
            const wls = wlSamples(r, Math.floor(
              SHAPER_RAY_CAP / (rays.length * orders.length * afterLayer[li])));
            const counts = propagatingOrderCounts(orders, wls, si, gd);
            const lineSpectrum = r.spec?.kind === 'lines';
            // One slice per node, shared by every order — but only where the
            // budget has actually forced the sampling below what the model
            // would otherwise use. At full resolution the cells are narrow and
            // the children stay monochromatic, which is what lets the opposite
            // orders of two stacked gratings recombine wavelength by
            // wavelength; a cell carries a bandwidth, and a bandwidth gets
            // dispersed again by the next grating instead of cancelling.
            const naturalNodes = r.bw >= 200 ? 9 : 5;
            const cells = lineSpectrum || wls.length >= naturalNodes
              ? wls.map(() => null)
              : wls.map(w => cellSpectrum(r, w.spectralLo, w.spectralHi));
            // With enough orders the budget comes down to a single node, and
            // that node stands for the entire band rather than a slice of it:
            // only the direction has been collapsed, to the centroid. Such a
            // child still carries the whole spectrum, and has to say so.
            // Handing it bw: 0 and spec: null would tell everything
            // downstream the order is monochromatic at the centroid, and a
            // wavelength-selective element believes it — spectralLo/Hi are
            // read by detectors, but a filter takes its !ray.bw path and
            // would throw away a whole order on the strength of one number.
            // A 400-800 nm beam through 21 orders into a 650 nm longpass
            // passed 0.018 of the light where 0.375 of it is above the edge.
            //
            // Which colours each order carries then has to be settled across
            // the band rather than at one wavelength, or an order that passes
            // off inside the band takes all of it or none of it.
            // A line spectrum is excluded: re-gridding lines would smear them.
            const ports = r.bw > 0 && wls.length === 1 && !lineSpectrum
              ? coarseOrderPorts(r, orders, si, gd) : null;
            if (ports) {
              for (const [m, port] of ports) {
                // The representative angle comes from the centroid of what
                // this order actually keeps, not of the incident band: the
                // +-1 orders of a 400-800 nm beam that pass off at 625 nm
                // travel as their surviving blue half and point accordingly.
                // Clamped rather than skipped — the share is real even where
                // the rebuilt centroid lands a hair past grazing.
                const sd = m === 0 ? si
                  : Math.max(-1, Math.min(1, si + m * port.wl / gd));
                const c = Math.sqrt(1 - sd * sd);
                next.push({
                  ...r,
                  d: m === 0 ? r.d : norm(add(mul(n, sOut * c), mul(t, sd))),
                  spec: port.spec, wl: port.wl, bw: port.bw,
                  intensity: r.intensity * port.fraction,
                  tag: r.tag + 'm' + m,
                  // As above. A coarsened order can still span most of the
                  // band, and colorOf paints that as mixed light on its own --
                  // which is why this is a flag and not a colour: stamping the
                  // pale mix here would survive a bandpass that later narrows
                  // the ray to a single colour. The undiffracted order is
                  // still the incident beam and keeps the source's look.
                  dispersed: m !== 0 || r.dispersed,
                });
              }
              continue;
            }
            for (const m of orders) {
              if (m === 0) {
                const port = zeroOrderPort(r, orders, wls, counts, si, gd);
                next.push({
                  ...r, intensity: r.intensity * port.fraction, tag: r.tag + 'm0',
                  ...(port.spec !== undefined ? { spec: port.spec, wl: port.wl, bw: port.bw } : {}),
                });
                continue;
              }
              for (let wi = 0; wi < wls.length; wi++) {
                const sd = si + m * wls[wi].wl / gd;
                if (Math.abs(sd) > 1) continue;
                const c = Math.sqrt(1 - sd * sd);
                next.push({
                  ...r, d: norm(add(mul(n, sOut * c), mul(t, sd))),
                  // The node sets the direction and the colour it is drawn
                  // in; the cell it stands for travels with it, so a filter
                  // downstream can cut inside the cell instead of taking or
                  // rejecting all of it. A lamp line has no cell — it is
                  // already the whole of what it carries.
                  wl: wls[wi].wl,
                  ...(cells[wi] ? { bw: cells[wi].bw, spec: cells[wi].spec } : { bw: 0, spec: null }),
                  // A continuum sample keeps its bounds so a detector can
                  // integrate across them. A lamp line stands for itself:
                  // wlSamples() still hands it midpoint bounds, and carrying
                  // those would let the detector paint invented power across
                  // the dark gaps between lines.
                  spectralContinuum: lineSpectrum ? false : r.spectralContinuum,
                  spectralLo: lineSpectrum ? null : (wls[wi].spectralLo ?? r.spectralLo),
                  spectralHi: lineSpectrum ? null : (wls[wi].spectralHi ?? r.spectralHi),
                  intensity: r.intensity * wls[wi].weight / counts[wi],
                  tag: r.tag + 'm' + m + (wls.length > 1 ? 'w' + wi : ''),
                  // As above: its own colours where it really is a band taken
                  // apart, and the incident beam's otherwise.
                  dispersed: (m !== 0 && r.bw > 0) || r.dispersed,
                });
              }
            }
          } else if (ly.type === 'speckle') {
            const div = (ly.div || 8) * D2R;
            const sid = hit.surface.id;
            if (ray.sample == null) {
              // speckleFan was sized against the whole stack, so the grains
              // coarsen rather than the fan being truncated and its power
              // going with it.
              for (let k = 0; k < speckleFan; k++) {
                next.push({ ...r, d: rotv(r.d, jitter(k * 3 + 1, sid) * div), intensity: r.intensity / speckleFan, tag: r.tag + 's' + k, speckle: true });
              }
            } else {
              next.push({ ...r, d: rotv(r.d, jitter(ray.sample, sid) * div), speckle: true });
            }
          } else {
            next.push(r);
          }
        }
        // Everything above sizes itself to the budget, so this is a last
        // resort, and only one stack can still reach it: two grating layers,
        // whose orders multiply and where neither side is a sampling choice
        // that could give — 11 orders behind 11 orders is 121 real directions
        // against a cap of 24. Drop the dimmest rays rather than whichever
        // were generated last, so the loss is the smallest available and does
        // not depend on the order the user typed the orders in. Such a scene
        // then under-reports, which is the honest failure: rescaling the
        // survivors would report the full power out of the few directions that
        // happened to survive.
        // Equal-power children are the norm here — a grating divides evenly —
        // so intensity alone leaves the comparator returning 0 and a stable
        // sort falls back to generation order, which is the order the user
        // typed. The tag is built from the order numbers themselves, so
        // breaking ties on it makes the same set of orders survive however
        // the list was written.
        if (next.length > SHAPER_RAY_CAP) {
          next.sort((a, b) => b.intensity - a.intensity
            || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
        }
        rays = next.slice(0, SHAPER_RAY_CAP);
        if (!rays.length) break;
      }
      // Inverse layers put the band back: a +1 grating followed by a -1 of the
      // same pitch sends every wavelength back along the direction it came in
      // on, which is what a 4f pulse shaper is for. Light that leaves the way
      // it arrived was not, in the end, separated -- the samples land on top of
      // one another and should read as the one beam they draw, not as a stack
      // of coincident coloured strokes.
      // Inverse layers can bring a band back onto one direction -- a +1 grating
      // followed by a -1 is how a 4f shaper works -- and such a beam is drawn
      // as coincident coloured strokes rather than as the single mixed beam it
      // physically is. Detecting that reliably turned out to need more than a
      // direction test: it has to hold per outgoing port, tolerate a common
      // steering layer moving the recombined port off the incident axis, and
      // carry a rendering state of its own, because for an auto-coloured
      // source there is no fixed colour to fall back to and each sample would
      // still draw in its own wavelength. That is a feature, not a predicate,
      // and it does not belong in a change about fanning colours out.
      const out = rays.map(r => ({
        ...(r.color ? { color: r.color } : {}),
        dispersed: r.dispersed || undefined,
        d: r.d, intensity: r.intensity, tag: r.tag || undefined,
        wl: r.wl, bw: r.bw, spec: r.spec, spectralContinuum: r.spectralContinuum,
        spectralLo: r.spectralLo, spectralHi: r.spectralHi,
        speckle: r.speckle || undefined,
      }));
      if (zf > 0) {
        out.push({ d: data.transmissive ? d : reflect(d, n), intensity: ray.intensity * zf, tag: 'z0' });
      }
      return out;
    }
    case 'opcpain': {
      // A packaged OPCPA has separate seed and pump apertures but one shared
      // interaction. The probe pass gathers both inputs first; the real pass
      // then routes amplified signal, idler and residual pump to fixed ports.
      if (specimenProbe) {
        recordProbeBeam(s, ray);
        return [];
      }
      const el = s.el;
      if (!el) return [];
      const pumpWl = Number(data.pumpWl ?? 527);
      const acceptance = Math.max(0, Number(data.pumpAcceptanceNm ?? 2));
      const enteringAs = Math.abs(ray.wl - pumpWl) <= acceptance ? 'pump' : 'signal';
      if (enteringAs !== data.inputRole) return [];
      const result = opcpaConversion(ray, data, el.id || null);
      const axis = rotPt(1, 0, el.rot || 0);
      const launch = output => {
        const local = opcpaPortLocal(`${output.role}Out`, data);
        const diameter = Number(data[`${output.role}BeamMm`]) || 0;
        const at = offset => toWorld(el, local.x, local.y + offset);
        const sampled = Number.isInteger(ray.sample) && ray.sampleCount > 1;
        if (!(diameter > 0)) return [{ d: axis, origin: at(0), ...output.ray }];
        if (sampled) {
          return [{ d: axis, origin: at(diameter * (ray.sample / (ray.sampleCount - 1) - 0.5)), ...output.ray }];
        }
        const n = OPO_OUTPUT_SAMPLES;
        const inputPower = Number.isFinite(ray.power) ? ray.power : ray.intensity;
        const outputPower = ray.intensity > 0 ? inputPower * output.ray.intensity / ray.intensity : 0;
        return Array.from({ length: n }, (_, i) => ({
          d: axis,
          origin: at(diameter * (i / (n - 1) - 0.5)),
          ...output.ray,
          power: outputPower / n,
          sample: i,
          sampleCount: n,
          sampleGrid: 'even',
        }));
      };
      const outputs = Object.values(result.outputs || {});
      if (outputs.length) return outputs.flatMap(launch);
      // With no usable partner, the box behaves as a routed pass-through so
      // a mistimed or disconnected stage stays diagnosable downstream.
      if (enteringAs === 'pump' && data.transmitPump === false) return [];
      return launch({ role: enteringAs, ray: { intensity: ray.intensity, tag: `opcpa-${enteringAs}-pass` } });
    }
    case 'opoin': {
      // The integrated OPO's rear aperture. Accepted pump light is converted
      // by the same model as the crystal's OPO mode and leaves the front
      // ports along the body axis; everything else stays inside the box.
      const el = s.el;
      const elementId = el?.id || null;
      if (!el) return [];
      const axis = rotPt(1, 0, el.rot || 0);
      const cosine = Math.max(-1, Math.min(1, dot(d, axis)));
      const angleDeg = Math.acos(cosine) / D2R;
      const tuningNote = data.tuning && Number.isInteger(data.tuning.index)
        ? { index: data.tuning.index, count: data.tuning.count } : null;
      const firstState = state => {
        if (elementId && !opoStates.has(elementId)) opoStates.set(elementId, { ...state, tuning: tuningNote });
      };
      if (!(angleDeg <= OPO_ACCEPTANCE_DEG + 1e-9)) {
        firstState({ state: 'rejected', angleDeg });
        return [];
      }
      const tuning = data.tuning || {};
      if (!Number.isFinite(tuning.signalWl)) {
        firstState({ state: 'noProgram' });
        return [];
      }
      const efficiency = Math.min(MAX_OPO_DEPLETION, Math.max(0, Number(data.opoDepletion) || 0));
      // Whatever pump arrives is the pump: the window is centred on it.
      const result = opoConversion(ray, { ...data, pumpWl: ray.wl, pumpAcceptanceNm: 0, signalWl: tuning.signalWl }, elementId, efficiency);
      // The shared helper records converting and invalid readings; the step
      // being played is the element's to add.
      if (elementId && (result.state === 'converting' || result.state === 'invalid') && opoStates.has(elementId)) {
        Object.assign(opoStates.get(elementId), { tuning: tuningNote, pumpNm: ray.wl });
      }
      if (result.state === 'badParams') firstState({ state: 'badParams' });
      if (result.state !== 'converting' || !(efficiency > 0)) return [];
      // Each output leaves as a beam of its own set diameter, whatever the
      // pump's width. A sized pump beam's samples keep their places across it:
      // sample i of K leaves at i/(K-1) of the output diameter, so the output
      // is drawn as one beam and a clipped pump loses the samples it lost.
      // A single-ray pump is spread over OPO_OUTPUT_SAMPLES rays sharing its
      // power. The outputs take no path inside the box: their timing is
      // referenced to the pump's arrival at the aperture, not to a cavity.
      const launch = (output, portRole) => {
        const local = opoPortLocal(portRole, data);
        const diameter = portRole === 'idler' ? data.idlerBeamMm : data.signalBeamMm;
        const at = offset => toWorld(el, local.x, local.y + offset);
        const sampled = Number.isInteger(ray.sample) && ray.sampleCount > 1;
        if (!(diameter > 0)) return [{ d: axis, origin: at(0), ...output.ray }];
        if (sampled) {
          return [{ d: axis, origin: at(diameter * (ray.sample / (ray.sampleCount - 1) - 0.5)), ...output.ray }];
        }
        // Each spatial sample keeps the converted ray's tracing intensity --
        // the quantity continuation cutoffs read -- and carries an equal share
        // of its power, as a sized source's samples do. The pump's incoming
        // attenuation is kept in that power.
        const n = OPO_OUTPUT_SAMPLES;
        const pumpPower = Number.isFinite(ray.power) ? ray.power : ray.intensity;
        const converted = ray.intensity > 0 ? pumpPower * output.ray.intensity / ray.intensity : 0;
        return Array.from({ length: n }, (_, i) => ({
          d: axis, origin: at(diameter * (i / (n - 1) - 0.5)), ...output.ray,
          power: converted / n,
          sample: i, sampleCount: n, sampleGrid: 'even',
        }));
      };
      // At degeneracy signal and idler share a wavelength and leave together
      // through the signal port, whatever the idler toggle says.
      if (result.waves.degenerate) return result.outputs.flatMap(output => launch(output, 'signal'));
      return result.outputs
        .filter(output => output.role !== 'idler' || data.outputIdler)
        .flatMap(output => launch(output, output.role === 'idler' ? 'idler' : 'signal'));
    }
    case 'transmit': {
      const efficiency = data.convert === 'opo'
        ? Math.min(MAX_OPO_DEPLETION, Math.max(0, Number(data.opoDepletion ?? data.efficiency) || 0))
        : data.convert && data.convert !== 'none'
        ? clampConversion(data.efficiency ?? 1)
        : Math.min(1, Math.max(0, data.efficiency ?? 1));
      // The probe pass records which colours reach a mixing crystal, so the
      // real pass afterwards knows what there is to mix with. Conversion still
      // happens on that pass, so a harmonic made upstream is available as a
      // colour further downstream.
      if (specimenProbe && MIX_CONVERTS.has(data.convert)) recordProbeBeam(s, ray);
      if (data.convert === 'opcpa') {
        // During the discovery pass every input continues unchanged so later
        // two-beam elements can still see it. The real pass uses the complete
        // incident-beam record gathered above.
        if (specimenProbe) return [{ d }];
        const result = opcpaConversion(ray, data, s.el?.id || null);
        if (result.state === 'reconverted') return [{ d }];
        const outputs = Object.values(result.outputs || {}).map(output => ({ d, ...output.ray }));
        if (outputs.length) return outputs;
        const isPump = Math.abs(ray.wl - Number(data.pumpWl ?? 527)) <= Math.max(0, Number(data.pumpAcceptanceNm ?? 2));
        return isPump && data.transmitPump === false ? [] : [{ d }];
      }
      if (data.convert === 'opo') {
        // Optical parametric oscillation (see parametric.js for the model).
        const pass = () => [{ d }];
        const result = opoConversion(ray, data, s.el?.id || null, efficiency);
        // Pump outside the window, and light this crystal already generated,
        // pass straight through regardless of the residual toggle.
        if (result.state === 'reconverted' || result.state === 'outOfWindow') return pass();
        if (result.state !== 'converting' || !(efficiency > 0)) return data.transmitPump ? pass() : [];
        const out = result.outputs.map(output => ({ d, ...output.ray }));
        if (data.transmitPump && efficiency < 0.999) out.push({ d, intensity: ray.intensity * (1 - efficiency), tag: 'p' });
        return out;
      }
      // Every converting mode states its output spectrum explicitly. A child
      // that sets neither bw nor spec inherits the parent's, and that spectrum
      // -- not wl -- is what dichroics and detectors act on: harmonics of any
      // pulsed or broadband pump used to keep the pump's, so SHG of a 1064 nm
      // pulse still read as 1064 nm and no 532 nm light appeared downstream.
      let wl = ray.wl, bw, spec;
      if (data.convert === 'shg' || data.convert === 'thg') {
        const order = data.convert === 'shg' ? 2 : 3;
        wl = ray.wl / order;
        bw = (ray.bw || 0) / order;
        spec = scaleSpectrum(ray.spec, 1 / order);
      } else if (data.convert === 'custom' || data.convert === 'cars') {
        wl = data.outWl; bw = 0; spec = null; // one fixed output line, whatever the pump's width
      } else if (data.convert === 'sc') {
        // A bulk continuum: estimated from the pump and the medium, or an
        // authored band. The estimate covers pulsed pumps at wavelengths the
        // medium has published spectra for; anything else needs a manual band.
        const crystalId = s.el?.id || null;
        let band;
        if (data.scRange === 'manual') {
          const lo = Number(data.scMinNm ?? 430), hi = Number(data.scMaxNm ?? 870);
          band = { state: 'manual', minNm: Math.min(lo, hi), maxNm: Math.max(lo, hi) };
        } else if (!ray.pulse) {
          if (crystalId && !supercontinuumStates.has(crystalId)) supercontinuumStates.set(crystalId, { state: 'cw' });
          return data.transmitPump ? [{ d }] : [];
        } else {
          band = { pumpNm: ray.wl, medium: data.scMedium, ...supercontinuumRange(ray.wl, data.scMedium) };
          if (band.state !== 'estimate') {
            if (crystalId && !supercontinuumStates.has(crystalId)) supercontinuumStates.set(crystalId, band);
            return data.transmitPump ? [{ d }] : [];
          }
        }
        if (crystalId) supercontinuumStates.set(crystalId, band);
        wl = (band.minNm + band.maxNm) / 2; bw = band.maxNm - band.minNm; spec = flatSpectrum(band.minNm, band.maxNm);
      }
      // A crystal with a non-zero chi(2) does not choose between doubling and
      // mixing: it does both. Each beam's second harmonic is drawn whatever
      // else is present, and any second colour at the crystal is mixed with it
      // when the two arrive together.
      const mixed = data.convert === 'shg' && !specimenProbe ? mixingOutputs(s, ray, d, data) : null;
      const takenByMixing = mixed ? mixed.converted : 0;
      const conv = { d, wl, intensity: ray.intensity * efficiency };
      if (bw !== undefined) conv.bw = bw;
      if (spec !== undefined) conv.spec = spec;
      // A continuum generated here is a pulse of its own: a new, flat band and
      // a spectral phase nobody knows. It carries a record that says so --
      // timed to the pump, as the OPO's outputs are -- instead of the pump's,
      // whose bandwidth and duration describe different light.
      if (data.convert === 'sc' && ray.pulse && spec?.kind === 'flat') {
        const [lo, hi] = spectrumSupport(spec);
        const trainId = ray.pulse.sourceId || '';
        conv.pulse = {
          ...ray.pulse,
          sourceId: `${trainId}›${s.el?.id || 'crystal'}:sc`,
          syncSourceId: ray.pulse.syncSourceId || trainId,
          centerWavelengthNm: wl, bandwidthNm: bw,
          spectrumKind: 'flat', spectrumLoNm: lo, spectrumHiNm: hi,
          transformLimited: false, transformLimitFs: null, spectralPhase: 'unknown', durationUnknown: true,
          field: null, fieldIssue: null, spectrumReshaped: false,
        };
      }
      // samples can co-transmit the excitation beam alongside the converted signal
      if (data.transmitExc && wl !== ray.wl) {
        conv.tag = 'c';
        const transmission = Math.min(1, Math.max(0, data.transmission ?? 1));
        return [conv, { d, intensity: ray.intensity * (1 - efficiency) * transmission, tag: 'x' }];
      }
      if (data.transmitPump && wl !== ray.wl && efficiency + takenByMixing < 0.999) {
        conv.tag = 'c';
        // The residual is debited by everything this beam actually produced,
        // its own harmonic and its share of the mixing.
        return [conv, ...(mixed?.rays || []), { d, intensity: ray.intensity * (1 - efficiency - takenByMixing), tag: 'p' }];
      }
      return [conv, ...(mixed?.rays || [])];
    }
    default: return [{ d }];
  }
}

function opcpaBeamPowerW(beam) {
  const sourcePower = Number(beam?.pulse?.avgPowerW);
  const fraction = Number(beam?.power);
  return sourcePower > 0 && fraction > 0 ? sourcePower * fraction : 0;
}

// Resolve one pump + seeded-signal pair and turn it into a bounded single-pass
// OPCPA energy budget. The real signal keeps its spectrum, chirp and timing;
// the generated idler is a new mixed pulse. The model is deliberately
// phenomenological: gain and the pump-depletion ceiling are authored rather
// than derived from a crystal prescription.
function opcpaConversion(ray, data, elementId) {
  if (elementId && Array.isArray(ray.parametricPath) && ray.parametricPath.includes(elementId)) {
    return { state: 'reconverted', currentRole: 'other' };
  }
  const beams = Array.isArray(data.incidentBeams) ? data.incidentBeams : [];
  const pumpWl = Number(data.pumpWl ?? 527);
  const acceptance = Math.max(0, Number(data.pumpAcceptanceNm ?? 2));
  const pumpCandidates = beams.filter(beam => Math.abs(beam.wl - pumpWl) <= acceptance);
  const strongest = list => [...list].sort((a, b) => opcpaBeamPowerW(b) - opcpaBeamPowerW(a))[0] || null;
  const pump = strongest(pumpCandidates);
  const seed = strongest(beams.filter(beam => beam !== pump && (!pump || beam.wl > pump.wl + 1e-9)));
  const current = beamRecordFor(ray, beams);
  const currentRole = current === pump ? 'pump' : current === seed ? 'signal' : 'other';
  const finish = (state, extra = {}) => {
    recordOpcpa(elementId, { state, pumpNm: pump?.wl ?? null, signalWl: seed?.wl ?? null, ...extra });
    return { state, currentRole, ...extra };
  };
  if (!pump) return finish('missingPump');
  if (!seed) return finish('missingSeed');
  if (!pump.pulse || !seed.pulse) return finish('unpulsed');
  const timing = mixOverlap(seed, pump);
  if (timing.unsupported) return finish('unsupported', { timing });
  const waves = opoWaves({
    pumpWl: pump.wl,
    pumpFwhmNm: pumpWidthNm(pump),
    signalWl: seed.wl,
    linewidthMode: 'signal',
    signalLinewidthCm: nmToWavenumberWidth(seed.wl, pumpWidthNm(seed)),
  });
  if (!waves) return finish('invalid', { timing });
  const seedPowerW = opcpaBeamPowerW(seed);
  const pumpPowerW = opcpaBeamPowerW(pump);
  if (!(seedPowerW > 0) || !(pumpPowerW > 0)) return finish('noPower', { timing, waves });
  const transfer = opcpaTransfer({
    seedPowerW,
    pumpPowerW,
    smallSignalGain: data.smallSignalGain,
    maxPumpDepletion: data.maxPumpDepletion,
    overlap: timing.factor,
    signalShare: waves.signalShare,
  });
  const idlerPulse = mixPulse(seed.pulse, pump.pulse, {
    crystalId: elementId,
    kind: 'opcpa-idler',
    wl: waves.idler.wl,
    bandwidthNm: waves.idler.bw,
    centerNs: timing.centerNs,
    oplMm: seed.opl || 0,
    repRateMHz: timing.repRateMHz,
    partnerPulseOffset: timing.partnerPulseOffset,
    periodNs: timing.periodNs,
  });
  const path = [...(Array.isArray(ray.parametricPath) ? ray.parametricPath : []), elementId].filter(Boolean);
  const phase = {
    phaseValid: false,
    phaseIssue: 'OPCPA output phase relative to the pump is not modelled',
    parametricPath: path,
  };
  const outputs = {};
  if (currentRole === 'signal') {
    outputs.signal = {
      role: 'signal',
      ray: { intensity: ray.intensity * transfer.actualGain, tag: 'opcpa-s', ...phase },
    };
    if (data.outputIdler !== false && transfer.idlerPowerW > 0) {
      const factor = transfer.idlerPowerW / seedPowerW;
      outputs.idler = {
        role: 'idler',
        ray: {
          wl: waves.idler.wl,
          bw: waves.idler.bw,
          spec: waves.idler.spec,
          intensity: ray.intensity * factor,
          tag: 'opcpa-i',
          pulse: idlerPulse,
          sourceId: idlerPulse?.sourceId || `${ray.sourceId || ''}›${elementId || 'opcpa'}:idler`,
          gdd: 0,
          ...phase,
        },
      };
    }
  } else if (currentRole === 'pump' && data.transmitPump !== false && transfer.residualPumpW > 0) {
    outputs.pump = {
      role: 'pump',
      ray: { intensity: ray.intensity * (1 - transfer.pumpDepletion), tag: 'opcpa-p', parametricPath: path },
    };
  }
  const state = transfer.overlap <= 0.02 ? 'noOverlap' : transfer.pumpTransferredW > 0 ? 'amplifying' : 'idle';
  return finish(state, { timing, waves, transfer, idlerPulse, outputs });
}

// How many rays an integrated OPO or OPCPA spreads a single-ray input over, per output,
// with equal power weights across the authored diameter.
const OPO_OUTPUT_SAMPLES = 9;

// The optical parametric conversion both OPO packagings share: the crystal's
// OPO mode and the integrated OPO element. It decides whether this pump
// converts, records the reading, and returns the generated waves with their
// power, spectrum and pulse already worked out; the caller only routes them.
//   state 'reconverted' -- light this element already generated (never
//                          converted twice, or a resonating signal would
//                          re-split on every round trip)
//   state 'badParams'   -- a non-finite or non-positive pump or signal
//   state 'outOfWindow' -- pump centre outside the authored acceptance
//   state 'invalid'     -- a signal at or beyond the pump frequency: no idler
//   state 'converting'  -- outputs: [{ role, ray }] with role 'signal',
//                          'idler' or 'merged', and `ray` a child without `d`
function opoConversion(ray, data, elementId, efficiency) {
  if (elementId && Array.isArray(ray.parametricPath) && ray.parametricPath.includes(elementId)) {
    return { state: 'reconverted' };
  }
  const pumpWl = Number(data.pumpWl ?? 532);
  const sig = Number(data.signalWl ?? 800);
  if (!(Number.isFinite(pumpWl) && pumpWl > 0 && Number.isFinite(sig) && sig > 0)) return { state: 'badParams' };
  // Phase matching accepts pump light whose centre lies within an authored
  // window; everything else is not converted.
  const acceptance = Math.max(0, Number(data.pumpAcceptanceNm ?? 1));
  if (!(Math.abs(ray.wl - pumpWl) <= acceptance)) return { state: 'outOfWindow' };
  // The cavity holds the signal; the idler follows the pump that arrives.
  const waves = opoWaves({
    pumpWl: ray.wl, pumpFwhmNm: pumpWidthNm(ray), signalWl: sig,
    linewidthMode: data.linewidthMode,
    signalLinewidthCm: data.signalLinewidthCm, idlerLinewidthCm: data.idlerLinewidthCm,
  });
  if (!waves) {
    recordOpo(elementId, { state: 'invalid', signalWl: sig });
    return { state: 'invalid' };
  }
  const phase = { outputPhase: data.outputPhase, durationFactor: data.durationFactor, crystalId: elementId };
  const pulses = waves.merged
    ? { merged: opoPulse(ray.pulse, waves.merged, { ...phase, role: 'degenerate' }) }
    : {
      signal: opoPulse(ray.pulse, waves.signal, { ...phase, role: 'signal' }),
      idler: opoPulse(ray.pulse, waves.idler, { ...phase, role: 'idler' }),
    };
  recordOpo(elementId, { state: 'converting', efficiency, waves, pulses, signalWl: sig });
  const converted = ray.intensity * efficiency;
  const path = [...(Array.isArray(ray.parametricPath) ? ray.parametricPath : []), elementId].filter(Boolean);
  const gen = (wave, pulse, intensity, tag) => ({
    wl: wave.wl, bw: wave.bw, spec: wave.spec, intensity, tag, pulse,
    parametricPath: path,
    // The pulse's reference plane is where the light is generated. A chirped
    // output leaves carrying the GDD that stretches it to its set duration.
    gdd: pulse?.chirpGddFs2 || 0,
    // New light does not carry the pump's reconstructable CW field.
    phaseValid: false,
    phaseIssue: 'parametric output: optical phase relative to the pump is not modelled',
  });
  // At degeneracy with equal widths, signal and idler are one beam carrying
  // their combined power. Otherwise one signal and one idler photon are
  // created per pump photon; their photon fluxes are equal, so
  // P_s/P_i = nu_s/nu_i = lambda_i/lambda_s. At degeneracy with different
  // widths they stay two coincident beams, each with its own spectrum.
  const outputs = waves.merged
    ? [{ role: 'merged', ray: gen(waves.merged, pulses.merged, converted, 's=i') }]
    : [
      { role: 'signal', ray: gen(waves.signal, pulses.signal, converted * waves.signalShare, 's') },
      { role: 'idler', ray: gen(waves.idler, pulses.idler, converted * (1 - waves.signalShare), 'i') },
    ];
  return { state: 'converting', efficiency, waves, pulses, outputs };
}

// trace all rays of one source; returns finished polylines.
// `couplings` collects light captured by fiber input connectors.
// Whether an element reshapes a pulse's spectrum. A dispersive element fans a
// broadband ray into wavelength samples, so by the time a filter acts, each
// ray may be one sample and the filter shows up only as samples that vanish:
// comparing a ray's spectrum with its parent's cannot see that. What can is
// the element itself -- whether its transmission varies across the band the
// pulse was emitted with. Every spectrally selective interaction goes through
// applyTransmission() below, which asks exactly that of the ray being traced.
// A dichroic far from its edge, or a neutral density filter, transmits the
// band evenly and leaves the pulse's duration alone.
let interactionRay = null;
let interactionReshapesPulse = false;
function pulseBand(pulse) {
  if (!pulse) return null;
  if (pulse.spectrumKind === 'flat' && Number.isFinite(pulse.spectrumLoNm) && Number.isFinite(pulse.spectrumHiNm)
    && pulse.spectrumHiNm > pulse.spectrumLoNm) {
    return flatSpectrum(pulse.spectrumLoNm, pulse.spectrumHiNm);
  }
  const bw = Number(pulse.bandwidthNm), center = Number(pulse.centerWavelengthNm);
  return bw > 0 && center > 0 ? gaussianSpectrum(center, bw) : null;
}
// The piece of a pulse's spectrum one ray (or detector hit) carries, for the
// filtered-duration model: its own spectrum when it has a bandwidth, or --
// for a wavelength sample of a fanned-out band -- the band it was cut from,
// restricted to its slice. That band is the spectrum the last filter left
// when the slice was cut after it, and the emitted band otherwise; the slice
// itself is drawn flat, but the light in it keeps the band's shape.
function pulseSpectrumPiece(ray, pulse, power = 1) {
  if (ray.bw > 0 && ray.spec && ray.spec.kind !== 'lines') {
    const [lo, hi] = spectrumSupport(ray.spec);
    return hi > lo ? { spec: ray.spec, lo, hi, power } : null;
  }
  const cell = sampleCell(ray);
  if (!cell) return null;
  const parent = (pulse?.filteredPieces || []).find(p => p.lo <= cell[0] + 1e-9 && p.hi >= cell[1] - 1e-9);
  const spec = parent?.spec || pulseBand(pulse) || flatSpectrum(cell[0], cell[1]);
  const lo = Math.max(cell[0], parent?.lo ?? -Infinity), hi = Math.min(cell[1], parent?.hi ?? Infinity);
  return hi > lo ? { spec, lo, hi, power } : null;
}
// Where the pulse's emitted band carries at least 1 % of its peak weight.
const BAND_GRID = 257;
function pulseBandRegion(pulse) {
  const band = pulseBand(pulse);
  if (!band) return null;
  const [lo, hi] = spectrumSupport(band);
  const weights = Array.from({ length: BAND_GRID }, (_, i) => spectrumWeight(band, lo + (hi - lo) * i / (BAND_GRID - 1)));
  const peak = Math.max(...weights);
  const kept = weights.map((w, i) => (w >= 0.01 * peak ? i : -1)).filter(i => i >= 0);
  if (!kept.length) return null;
  const at = i => lo + (hi - lo) * i / (BAND_GRID - 1);
  return { band, lo: at(kept[0]), hi: at(kept.at(-1)), points: kept.map(at) };
}
// Whether one interaction reshapes the band. Box filters -- bandpass,
// longpass, shortpass, notch -- name their edges, and an edge inside the band
// is decisive whatever a sample grid would have seen: a 1 nm passband lying
// between two sample points is still a 1 nm slice. For smooth transmissions
// (etalon, AOTF) the band is sampled, and two backstops catch what the samples
// miss: the ray's own wavelength or cell transmitting differently from the
// sampled value, and applyTransmission() integrating to a different fraction.
// Uniform attenuation passes all three and leaves the duration alone.
function sampledBandTransmission(region, transmissionFn) {
  let tMin = Infinity, tMax = -Infinity;
  for (const wl of region.points) {
    const t = Math.max(0, Math.min(1, Number(transmissionFn(wl)) || 0));
    tMin = Math.min(tMin, t); tMax = Math.max(tMax, t);
  }
  return { tMin, tMax };
}
// Light a specimen or crystal generated at a new colour can still carry the
// pump's pulse record. That record's band then says nothing about this
// light's spectrum, so it is not used to judge a filter acting on it.
function rayWithinPulseBand(ray, region) {
  const lo = Math.min(...[ray.wl - (ray.bw || 0) / 2, ray.spectralLo, ray.fanLo].filter(Number.isFinite));
  const hi = Math.max(...[ray.wl + (ray.bw || 0) / 2, ray.spectralHi, ray.fanHi].filter(Number.isFinite));
  return hi >= region.lo && lo <= region.hi;
}
function notePulseSelection(transmissionFn, edges = []) {
  const pulse = interactionRay?.pulse;
  if (!pulse || pulse.spectrumReshaped || interactionReshapesPulse) return null;
  const region = pulseBandRegion(pulse);
  if (!region || !rayWithinPulseBand(interactionRay, region)) return null;
  if (edges.some(e => Number.isFinite(e) && e > region.lo && e < region.hi)) {
    interactionReshapesPulse = true;
    return null;
  }
  const { tMin, tMax } = sampledBandTransmission(region, transmissionFn);
  if (!(tMax - tMin <= 0.01)) { interactionReshapesPulse = true; return null; }
  const uniform = (tMin + tMax) / 2;
  const ray = interactionRay;
  const own = [ray.wl, ray.spectralLo, ray.spectralHi].filter(Number.isFinite);
  if (own.some(wl => Math.abs(Math.max(0, Math.min(1, Number(transmissionFn(wl)) || 0)) - uniform) > 0.01)) {
    interactionReshapesPulse = true;
    return null;
  }
  return uniform;
}
function applyTransmission(spec, centerWl, transmissionFn) {
  const uniform = notePulseSelection(transmissionFn);
  const result = applySpectralTransmission(spec, centerWl, transmissionFn);
  // The integration runs on a finer grid than the band sample: a passband it
  // finds, where the samples saw none, is a reshaping they missed.
  if (Number.isFinite(uniform) && Math.abs((result?.fraction ?? 0) - uniform) > 0.01) interactionReshapesPulse = true;
  return result;
}

// Whether the wavelength cells of a fanned-out pulse that reach a detector
// still carry the band it was emitted with. Measured as the share of the
// emitted spectral weight inside the arriving cells, which must be 95 % or
// more: the tracer drops the faint outermost samples of a Gaussian on its own
// (about 2.4 % of the weight), while an aperture catching part of a prism fan
// removes a fifth or more. Light that was never fanned out carries no cells,
// and a uniformly clipped broadband beam keeps its whole band, so both pass.
// This is a bounded guard: it sees samples that miss entirely, not a sample
// clipped partly more than its neighbours.
export const FAN_COVERAGE = 0.95;
function fannedBandCovered(pulse, hits) {
  const cellOf = h => (Number.isFinite(h.fanLo) && Number.isFinite(h.fanHi) ? [h.fanLo, h.fanHi]
    : Number.isFinite(h.spectralLo) && Number.isFinite(h.spectralHi) ? [h.spectralLo, h.spectralHi] : null);
  const region = pulseBandRegion(pulse);
  if (!region) return true;
  const band = region.band;
  // Only arrivals the pulse record describes: converted light is left out.
  const cells = hits.filter(h => rayWithinPulseBand(h, region)).map(cellOf).filter(c => c && c[1] > c[0]);
  if (!cells.length) return true;
  const [lo, hi] = spectrumSupport(band);
  let total = 0, covered = 0;
  for (let i = 0; i < BAND_GRID; i++) {
    const wl = lo + (hi - lo) * (i + 0.5) / BAND_GRID;
    const w = Math.max(0, spectrumWeight(band, wl));
    total += w;
    if (cells.some(([a, b]) => wl >= a && wl <= b)) covered += w;
  }
  return !(total > 0) || covered / total >= FAN_COVERAGE;
}

function traceRays(rays0, surfaces, couplings, writeHits, signalHits, coherent = null) {
  const done = [];
  let retainedWeakBranches = 0;
  const cameraSurfaces = surfaces.filter(surface => surface.kind === 'detector'
    && registry[surface.el?.type]?.readoutKind === 'camera');
  const stack = rays0.map(r => {
    const opl = Number.isFinite(r.oplStart) ? r.oplStart : 0;
    const gdd = Number.isFinite(r.gddStart) ? r.gddStart
      : Number.isFinite(r.gdd) ? r.gdd : 0;
    const groupDelayDifferenceFs = Number.isFinite(r.groupDelayDifferenceStartFs)
      ? r.groupDelayDifferenceStartFs
      : Number.isFinite(r.groupDelayDifferenceFs) ? r.groupDelayDifferenceFs : 0;
    const visualizesDispersion = Boolean(r.pulse);
    return {
      ...r, opl, gdd, groupDelayDifferenceFs, pts: [{ x: r.x, y: r.y }], opls: [opl],
      // Sparse local-GDD events exist only for pulses whose duration the app
      // can honestly derive. `linear` marks propagation through real glass;
      // a lens or compressor is an instantaneous step at one optical path.
      gddTrace: visualizesDispersion ? [{ opl, gdd, linear: false }] : null,
      groupDelayDifferenceTrace: visualizesDispersion
        ? [{ opl, value: groupDelayDifferenceFs, linear: false }] : null,
      segmentIntensities: [], segmentHistories: [], segmentEvents: [],
      sig: '', depth: 0, last: null,
    };
  });
  const appendPoint = (r, p, geometricLength) => {
    const length = Math.max(0, geometricLength);
    const ng = Math.min(3, Math.max(1, r.ior || 1));
    r.opl += length * ng;
    if (r.mediumMaterial) {
      const oplStart = r.opl - length * ng;
      const gddStart = r.gdd;
      const materialGVD = glassGVD(r.mediumMaterial, r.wl);
      if (Number.isFinite(materialGVD)) r.gdd += length * materialGVD;
      if (r.gddTrace && r.gdd !== gddStart) {
        const last = r.gddTrace.at(-1);
        if (!last || last.opl !== oplStart || last.gdd !== gddStart) {
          r.gddTrace.push({ opl: oplStart, gdd: gddStart, linear: false });
        }
        r.gddTrace.push({ opl: r.opl, gdd: r.gdd, linear: true });
      }
      const lo = r.pulse?.spectrumLoNm, hi = r.pulse?.spectrumHiNm;
      const spreadStart = r.groupDelayDifferenceFs;
      const delayDifference = glassGroupDelayDifferenceFs(r.mediumMaterial, lo, hi, length);
      if (Number.isFinite(delayDifference)) r.groupDelayDifferenceFs += delayDifference;
      if (r.groupDelayDifferenceTrace && r.groupDelayDifferenceFs !== spreadStart) {
        const last = r.groupDelayDifferenceTrace.at(-1);
        if (!last || last.opl !== oplStart || last.value !== spreadStart) {
          r.groupDelayDifferenceTrace.push({ opl: oplStart, value: spreadStart, linear: false });
        }
        r.groupDelayDifferenceTrace.push({
          opl: r.opl, value: r.groupDelayDifferenceFs, linear: true,
        });
      }
    }
    r.segmentIntensities.push(r.intensity);
    r.segmentHistories.push(r.sig);
    r.segmentEvents.push(null);
    r.pts.push(p);
    r.opls.push(r.opl);
  };
  while (stack.length) {
    const r = stack.pop();
    for (; ;) {
      if (r.depth > MAX_DEPTH) {
        markIncompleteCoherence(r, 'coherent path exceeded the trace-depth budget');
        break;
      }
      const hit = nearestHit({ x: r.x, y: r.y }, { x: r.dx, y: r.dy }, surfaces, r.last);
      if (!coherent?.dryRun && !r.evan) recordCameraNearMisses(r, cameraSurfaces, hit?.t ?? MAXLEN);
      const intensityFloor = r.phaseValid ? MIN_COHERENT_INT
        : r.retainWeak ? MIN_RETAINED_POWER_INT
          : r.keepWeak ? MIN_WEAK_INT
            : MIN_INT;
      if (r.intensity < intensityFloor && !r.retainZeroField
          && !LOW_POWER_MEASUREMENT_SURFACES.has(hit?.surface.kind)) {
        // A weak branch that directly reaches a detector/sample is cheap and
        // physically material, so record it even below the drawing budget.
        // Absorbed or escaping light cannot affect a downstream camera; a
        // weak branch stopped before another optical interaction makes the
        // coherent source incomplete and therefore forces safe deposition.
        if (!r.coherentlySuppressed && hit && hit.surface.kind !== 'absorb') {
          markIncompleteCoherence(r, 'coherent path fell below the bounded trace threshold');
        }
        break;
      }
      if (r.evan) {
        // evanescent (isotropic fluorescence, or a diagram point source):
        // the glow decays like 1/r² and dies within the ray's evanescent
        // range (fluorescence: 25 mm, point source: 110 mm) unless a lens /
        // objective / fiber tip collects it first. The collector must sit
        // within 1.5x that range (a small grace margin so an optic right at
        // the fade boundary still counts); otherwise the light is simply
        // gone and never reaches downstream detectors.
        // `??`, not `||`: a range of exactly zero means exhausted, and falling
        // back to the default there would hand a spent branch a fresh 22 mm.
        const EVAN_LEN = r.evanLen ?? 22;
        // How far the glow is DRAWN and how far an optic can still collect it
        // are separate: a collection lens routinely sits well outside the few
        // centimetres of visible glow, and the light is really there.
        const CAPTURE = r.captureLen ?? EVAN_LEN * 1.5;
        // Mirrors collect too. A parabolic mirror with an emitter at its focus
        // is the standard way to collimate a lamp or an arc without chromatic
        // aberration, and a collection mirror round a fluorescing sample is
        // ordinary spectroscopy -- leaving them off this list meant a point
        // source's light passed straight through any mirror as if it were not
        // there, which is what made a parabola fail to collimate it.
        // `cmirror` is the concave/convex pair, which is what an actual
        // collection mirror around a sample usually is -- leaving it out
        // would have fixed the flat and parabolic cases and left the two
        // components most likely to be used for collection still broken.
        const COLLECTORS = new Set(['lens', 'metalens', 'fiberin', 'mirror', 'cmirror']);
        const captured = hit && hit.t <= CAPTURE && COLLECTORS.has(hit.surface.kind);
        if (!captured) {
          const L = hit ? Math.min(hit.t, EVAN_LEN) : EVAN_LEN;
          appendPoint(r, { x: r.x + r.dx * L, y: r.y + r.dy * L }, L);
          r.evanFade = true;
          break;
        }
        r.evan = false; // collected: from here on it behaves like normal light
        // ...but a partial mirror only collects what it REFLECTS. Light that
        // goes through a 1%-reflective mirror was gathered by nothing, so it
        // has to keep fading; otherwise it leaves as ordinary light carrying
        // 99% of the power and reaches any detector on the bench. The
        // transmitted child inherits this.
        // The transmitted child starts AT the collector, having already used
        // up hit.t of its range. Handing it the full range again would let a
        // chain of partial mirrors walk near-field light across the bench.
        r.carriedEvan = {
          evanLen: Math.max(0, EVAN_LEN - hit.t),
          captureLen: Math.max(0, CAPTURE - hit.t),
        };
        if (!coherent?.dryRun) recordCameraNearMisses(r, cameraSurfaces, hit?.t ?? MAXLEN);
      }
      if (!hit) {
        appendPoint(r, { x: r.x + r.dx * MAXLEN, y: r.y + r.dy * MAXLEN }, MAXLEN);
        break;
      }
      appendPoint(r, { x: hit.p.x, y: hit.p.y }, hit.t);
      const interactionKey = surfaceInteractionKey(hit.surface);
      r.segmentEvents[r.segmentEvents.length - 1] = interactionKey;
      if (hit.ambiguous && hit.surface.kind === 'refract') break;
      r.sig += `/${interactionKey}`;
      const phaseIssue = r.phaseValid ? carrierPhaseIssue(hit.surface) : null;
      if (phaseIssue) {
        r.phaseValid = false;
        r.phaseIssue = phaseIssue;
      }
      if (!coherent?.dryRun && hit.surface.el?.type === 'objective' && hit.surface.el?.id) {
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
            gddFs2: Number.isFinite(r.gdd) ? r.gdd : 0,
            pulseWidthFs: r.pulse?.pulseWidthFs,
            stretchedPulseWidthFs: pulseDurationAfterDispersion(
              r.pulse, r.gdd, r.groupDelayDifferenceFs)?.durationFs ?? null,
            wavelengthNm: r.wl,
            objectiveNA: r.objectives?.length === 1 && Number.isFinite(r.objectives[0].na)
              ? r.objectives[0].na
              : undefined,
          });
        }
      }
      if (!coherent?.dryRun && hit.surface.kind === 'detector') recordDetectorHit(r, hit);
      if (hit.surface.kind === 'phaseplate') {
        // Same bookkeeping as the delay line, except the added path depends on
        // where this particular ray crossed the aperture -- which is what turns
        // a uniform port into a fringe pattern once the arms recombine.
        const peak = Math.min(20000, Math.max(0, Number(hit.surface.data.opdUm) || 0)) * 1e-3;
        if (!coherent?.dryRun) recordPhasePlateSpan(hit.surface.el?.id, hit.u);
        const extraOpl = peak * phasePlateOpdFraction(hit.surface.data.profile, hit.u);
        if (extraOpl > 0) {
          r.segmentIntensities.push(r.intensity);
          r.segmentHistories.push(r.sig);
          r.segmentEvents.push(interactionKey);
          r.pts.push({ x: hit.p.x, y: hit.p.y });
          r.opl += extraOpl;
          r.opls.push(r.opl);
        }
      }
      if (hit.surface.kind === 'phasemod') {
        // Uniform across the aperture, unlike the phase object: every ray
        // takes the same added path, so on its own the beam is unchanged and
        // only a reference arm can reveal it.
        const extraOpl = Number(hit.surface.data.opdMm) || 0;
        if (Math.abs(extraOpl) > 0) {
          r.segmentIntensities.push(r.intensity);
          r.segmentHistories.push(r.sig);
          r.segmentEvents.push(interactionKey);
          r.pts.push({ x: hit.p.x, y: hit.p.y });
          // A negative drive shortens the path; keep the total non-negative so
          // downstream arrival-time bookkeeping stays sane.
          r.opl = Math.max(0, r.opl + extraOpl);
          r.opls.push(r.opl);
        }
      }
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
            pulse: r.pulse, opl: r.opl, gdd: r.gdd,
            groupDelayDifferenceFs: r.groupDelayDifferenceFs,
            approximation: r.approximation || null,
            sourceId: r.sourceId || null,
            originId: r.originId || null,
            coherenceLengthMm: r.coherenceLengthMm || 0,
          });
        }
        break; // the connector absorbs the incoming beam either way
      }
      // The collection marker applies to THIS interaction and no other: it
      // exists to tell the transmitted branch of a partial collector that it
      // was never actually gathered. Left on the ray, it would re-evanesce the
      // transmitted child of every later splitter the collected light happens
      // to meet -- a dichroic, an etalon, another partial mirror -- and that
      // light would die for no reason. The one-child fast path reuses `r`, so
      // clearing it here covers that route too.
      const carriedEvan = r.carriedEvan;
      r.carriedEvan = null;
      interactionRay = r; interactionReshapesPulse = false;
      const children = interact(r, hit);
      // What a wavelength-selective element passes is the band the user chose,
      // often a thin slice of a broad source -- 1 nm of a 500 nm continuum is
      // 0.2 % of it -- so, like an AOTF line, it is held to the weak-ray floor
      // instead of being culled at the next optic.
      if (BAND_SELECTING_SURFACES.has(hit.surface.kind) && !(hit.surface.kind === 'filter' && hit.surface.data.ftype === 'nd')) {
        for (const child of children) if (!('keepWeak' in child)) child.keepWeak = true;
      }
      const reshaped = interactionReshapesPulse;
      interactionRay = null; interactionReshapesPulse = false;
      if (children.length === 0) break;
      recordCoherentArrival(r, hit, children, coherent?.arrivals);
      for (const child of children) {
        const override = coherent?.plan?.get(coherentChildKey(r, hit.surface, child));
        if (!override) continue;
        child.intensity = override.intensity;
        child.power = override.power;
        child.phaseOffset = override.phaseOffset;
        child.fieldGroupCount = override.fieldGroupCount;
        child.retainZeroField = override.retainZeroField;
        child.coherentlySuppressed = override.coherentlySuppressed;
      }
      // A filter, dichroic or grating order that changes the shape of a
      // pulse's spectrum changes its duration by itself, and leaves the
      // dispersion accumulated so far describing wavelengths it has removed.
      // Mark the pulse so the duration model declines downstream. Light an
      // element generated brings a pulse of its own and is left alone.
      if (reshaped && r.pulse) {
        for (const child of children) {
          if ('pulse' in child) continue;
          // The piece that survived goes with the record, so the duration can
          // be worked out from it downstream.
          const piece = pulseSpectrumPiece({ ...r, ...child }, r.pulse);
          child.pulse = { ...r.pulse, spectrumReshaped: true, filteredPieces: piece ? [piece] : null };
        }
      }
      // An etalon's output keeps its power but not its comb (and not the
      // etalon's own transfer phase), so it is not timed from it. This is
      // marked on its own terms: a pulse an earlier filter already reshaped is
      // not re-detected as reshaping here, and must not slip past the mark.
      if (hit.surface.kind === 'etalon' && r.pulse && (reshaped || r.pulse.spectrumReshaped)) {
        for (const child of children) {
          if ('pulse' in child && child.pulse !== r.pulse && !child.pulse?.spectrumReshaped) continue;
          child.pulse = { ...(child.pulse || r.pulse), spectrumReshaped: true, etalonComb: true };
        }
      }
      // A sampled field describes one spectrum. Once an element changes the
      // spectrum or wavelength a ray carries, the field no longer applies.
      if (r.pulse?.field) {
        for (const child of children) {
          if (('spec' in child && child.spec !== r.spec) || ('wl' in child && child.wl !== r.wl)) {
            child.pulse = { ...(child.pulse || r.pulse), field: null,
              fieldIssue: 'Spectrum changed after envelope propagation; temporal field is unavailable.' };
          }
        }
      }
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
        if ('mediumMaterial' in c0) r.mediumMaterial = c0.mediumMaterial;
        if ('ior' in c0) r.ior = c0.ior;
        if (Number.isFinite(c0.phaseOffset)) r.phaseOffset = c0.phaseOffset;
        else if (Number.isFinite(c0.phaseShift)) r.phaseOffset = (r.phaseOffset || 0) + c0.phaseShift;
        if (Number.isInteger(c0.fieldGroupCount)) r.fieldGroupCount = c0.fieldGroupCount;
        if ('retainZeroField' in c0) r.retainZeroField = Boolean(c0.retainZeroField);
        if (c0.phaseValid === false) {
          r.phaseValid = false;
          r.phaseIssue = c0.phaseIssue || r.phaseIssue || 'carrier phase became unavailable';
        }
        if ('gdd' in c0) {
          if (r.gddTrace && c0.gdd !== r.gdd) {
            r.gddTrace.push({ opl: r.opl, gdd: c0.gdd, linear: false });
          }
          r.gdd = c0.gdd;
        }
        if ('groupDelayDifferenceFs' in c0) {
          if (r.groupDelayDifferenceTrace && c0.groupDelayDifferenceFs !== r.groupDelayDifferenceFs) {
            r.groupDelayDifferenceTrace.push({
              opl: r.opl, value: c0.groupDelayDifferenceFs, linear: false,
            });
          }
          r.groupDelayDifferenceFs = c0.groupDelayDifferenceFs;
        }
        r.last = hit.surface; r.depth++;
        continue;
      }
      for (const [ci, c] of children.entries()) {
        const childIntensity = c.intensity !== undefined ? c.intensity : r.intensity;
        const childRetainsWeak = r.retainWeak || Boolean(c.retainWeak);
        // Only a genuine branch is charged. A lone child continues the ray it
        // came from rather than widening the tree -- a polarizer takes this
        // path because its output carries a tag, not because it split -- so
        // charging it would spend the budget on work that never grew. It bit
        // a sized beam through a long polarizer stack: every sample charged
        // once per stage, the 256 slots ran out, and later samples were
        // dropped, reporting 92% of the expected signal after 16 elements and
        // 68% after 20. Depth and length still bound a continuation chain.
        if (childRetainsWeak && childIntensity < MIN_INT && children.length > 1) {
          if (retainedWeakBranches >= MAX_RETAINED_WEAK_BRANCHES) continue;
          retainedWeakBranches++;
        }
        const ox = c.origin ? c.origin.x : hit.p.x, oy = c.origin ? c.origin.y : hit.p.y;
        const childGdd = 'gdd' in c ? c.gdd : r.gdd;
        const childDelayDifference = 'groupDelayDifferenceFs' in c
          ? c.groupDelayDifferenceFs : r.groupDelayDifferenceFs;
        stack.push({
          x: ox, y: oy, dx: c.d.x, dy: c.d.y,
          // Anything that reaches here starts a new branch string: a real
          // split, and also a lone child that changes the light's state (a new
          // wavelength, spectrum, polarization or pulse). The `single` fast
          // path above is narrower than "one child" and is the only case that
          // keeps the parent's branch. Either way every sampling ray of one
          // beam takes the same route and lands on the same string, which is
          // what the grouping needs.
          branch: `${r.branch || ''}>${hit.surface.el?.id || ''}:${c.tag ?? ci}`,
          wl: c.wl !== undefined ? c.wl : r.wl,
          bw: c.bw !== undefined ? c.bw : r.bw,
          spec: 'spec' in c ? c.spec : r.spec,
          spectralContinuum: 'spectralContinuum' in c ? c.spectralContinuum
            : ((c.wl === undefined || c.wl === r.wl)
                ? r.spectralContinuum
                : Boolean(('spec' in c ? c.spec : r.spec) || (c.bw !== undefined ? c.bw : r.bw) > 0)),
          spectralWidthNm: Number.isFinite(c.spectralWidthNm) ? c.spectralWidthNm
            : (c.wl === undefined || c.wl === r.wl) ? r.spectralWidthNm : null,
          spectralLo: Number.isFinite(c.spectralLo) ? c.spectralLo
            : (c.wl === undefined || c.wl === r.wl) ? r.spectralLo : null,
          fanLo: Number.isFinite(c.fanLo) ? c.fanLo : (c.wl === undefined || c.wl === r.wl) ? r.fanLo : null,
          fanHi: Number.isFinite(c.fanHi) ? c.fanHi : (c.wl === undefined || c.wl === r.wl) ? r.fanHi : null,
          spectralHi: Number.isFinite(c.spectralHi) ? c.spectralHi
            : (c.wl === undefined || c.wl === r.wl) ? r.spectralHi : null,
          speckle: c.speckle || r.speckle || false,
          // Once a dispersive optic has taken a beam apart, the pieces stay
          // apart: the flag rides along so their colour keeps being derived
          // from the wavelength each piece actually carries. Light a specimen
          // generates is new light rather than the pump taken apart, though --
          // it arrives with its own sourceId and its own tint -- so it starts
          // undispersed however the pump reached it.
          dispersed: 'sourceId' in c ? Boolean(c.dispersed) : (c.dispersed || r.dispersed || false),
          // A pattern the optic cut here starts here; one inherited from
          // upstream continues from where the parent's pattern had reached.
          chopped: c.chopped || continuedChop(r.chopped, polylineLength(r.pts)),
          // A branch that merely passed THROUGH a collector was never
          // collected, so it stays evanescent with the range it had.
          evan: c.evan || Boolean(c.tag === 'T' && carriedEvan),
          evanLen: c.evanLen ?? (c.tag === 'T' ? carriedEvan?.evanLen : undefined),
          captureLen: c.captureLen ?? (c.tag === 'T' ? carriedEvan?.captureLen : undefined),
          pol: 'pol' in c ? c.pol : r.pol,
          stokes: 'stokes' in c ? cloneStokes(c.stokes) : cloneStokes(r.stokes),
          polMod: 'polMod' in c ? c.polMod : r.polMod,
          // An explicit per-ray drawing color, set when a specimen generates
          // a signal. It overrides the source's own fixed color, because a
          // signal at a new wavelength is not the source's light any more.
          color: 'color' in c ? c.color : r.color,
          sourceId: 'sourceId' in c ? c.sourceId : r.sourceId,
          coherenceId: r.coherenceId || null,
          phaseValid: r.phaseValid === true && c.phaseValid !== false,
          phaseIssue: c.phaseIssue || r.phaseIssue || null,
          phaseOffset: Number.isFinite(c.phaseOffset) ? c.phaseOffset
            : (Number.isFinite(r.phaseOffset) ? r.phaseOffset : 0)
              + (Number.isFinite(c.phaseShift) ? c.phaseShift : 0),
          fieldGroupCount: Number.isInteger(c.fieldGroupCount)
            ? c.fieldGroupCount : (Number.isInteger(r.fieldGroupCount) ? r.fieldGroupCount : 1),
          retainZeroField: Boolean(c.retainZeroField),
          coherentlySuppressed: Boolean(c.coherentlySuppressed),
          // Deliberately not overridable by the child: a specimen's
          // fluorescence is new light with a new sourceId, but its power is
          // still a fraction of the laser that drove it.
          originId: r.originId || null,
          // Likewise a property of the emitting source, carried unchanged so
          // it is still known wherever the arms are eventually recombined.
          coherenceLengthMm: r.coherenceLengthMm || 0,
          medium: 'medium' in c ? c.medium : r.medium,
          mediumMaterial: 'mediumMaterial' in c ? c.mediumMaterial : r.mediumMaterial,
          spectralCount: 'spectralCount' in c ? c.spectralCount : r.spectralCount,
          keepWeak: 'keepWeak' in c ? c.keepWeak : r.keepWeak,
          ior: 'ior' in c ? c.ior : (r.ior || 1),
          gdd: childGdd,
          // A child with a pulse of its own (light an OPO generated) carries
          // its own dispersion trace; without one it continues its parent's.
          gddTrace: ('pulse' in c ? Boolean(c.pulse) : r.gddTrace)
            ? [{ opl: r.opl, gdd: childGdd, linear: false }] : null,
          groupDelayDifferenceFs: childDelayDifference,
          groupDelayDifferenceTrace: ('pulse' in c ? Boolean(c.pulse) : r.groupDelayDifferenceTrace)
            ? [{ opl: r.opl, value: childDelayDifference, linear: false }] : null,
          pulse: 'pulse' in c ? c.pulse : r.pulse,
          // A caveat is never cleared downstream: no later element computes
          // what the linear-only continuation left out.
          approximation: r.approximation || c.approximation || null,
          parametricPath: 'parametricPath' in c ? c.parametricPath : r.parametricPath,
          intensity: childIntensity,
          power: c.power !== undefined ? c.power : Number.isFinite(r.power)
            ? r.power * (c.intensity !== undefined && r.intensity > 0 ? c.intensity / r.intensity : 1)
            : undefined,
          // A child can start a sampled beam of its own (an OPO spreading a
          // single-ray pump over its output diameter).
          sample: 'sample' in c ? c.sample : r.sample,
          sampleCount: 'sampleCount' in c ? c.sampleCount : r.sampleCount,
          sampleGrid: 'sampleGrid' in c ? c.sampleGrid : r.sampleGrid,
          writeReference: r.writeReference,
          objectives: Array.isArray(r.objectives) ? r.objectives.map(objective => ({ ...objective })) : [],
          hidden: r.hidden || Boolean(c.hidden),
          retainWeak: childRetainsWeak,
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

// What colour a ray is drawn in. One rule, because the static stroke and the
// pulse packet travelling along it are the same light and must never disagree
// -- they were resolved separately once, and drifted.
//
// A signal generated in a specimen carries its own colour and is no longer the
// source's light, so it outranks the source's fixed colour: otherwise a
// custom-coloured IR pump would paint its own green SHG red. A custom source
// colour in turn describes the user's beam. Dispersion outranks both, because
// light a dispersive optic has separated is no longer that beam, nor an
// emission band, but either of them taken apart -- and a band is a band, so a
// grating spreads it into separate colours rather than repeating one tint
// across the fan. Without that, a supercontinuum (whose default colour is the
// pale mix) fans out white where a prism fans out a rainbow.
//
// Everything here is derived from what the ray carries now, never stamped on
// it earlier, so a filter that narrows it downstream is reflected.
function rayColor(r, fixedColor) {
  if (r.color && !r.dispersed) return r.color;
  if (fixedColor && !r.dispersed) return fixedColor;
  // Undispersed broadband light is co-propagating mixed light, not a rainbow
  // painted across the beam aperture.
  if (r.bw >= 200) return MIXED_LIGHT_COLOR;
  return wavelengthToColor(r.wl);
}

// turn traced polylines into drawables (strokes / envelope strips / speckle
// grains / rainbow ribbons / chopped chunks)
function assembleDrawables(paths, opts, drawables) {
  const { K, isBeam, fixedColor } = opts;
  const colorOf = r => rayColor(r, fixedColor);
  const opOf = r => Math.max(0.25, Math.min(0.95, 0.35 + 0.6 * r.intensity));
  // Whether a ray is chunked is decided where the chunking is asked for -- by
  // the element's own flag -- and not from whether pulse packets happen to be
  // on screen. Packet drawing is live playback state: the overlay is dropped
  // in mechanics mode and whenever the time scale sits far from the pulse
  // rate, neither of which the tracer can see. Conditioning on it here made
  // the chunks vanish in exactly the case they exist for, a pulsed beam being
  // drawn as a steady line.
  const drawChopped = r => Boolean(r.chopped);
  const dashOf = r => (drawChopped(r)
    ? `${(r.chopped.period * r.chopped.duty).toFixed(1)} ${(r.chopped.period * (1 - r.chopped.duty)).toFixed(1)}`
    : undefined);
  // A dash pattern starts at the path origin, so sliding the on-window along
  // the beam is a negative offset: with the pattern shifted back by P - start,
  // the first dash lands at `start` instead of at zero.
  // `startMm` is unwrapped (see continuedChop), so fold it into one period.
  const dashOffsetOf = r => {
    if (!drawChopped(r)) return undefined;
    const P = r.chopped.period;
    const start = (((r.chopped.startMm || 0) % P) + P) % P;
    return start > 1e-9 ? Number((P - start).toFixed(3)) : undefined;
  };

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
      drawables.push({ type: 'path', pts: r.pts, color: '#7c3aed', w: 5, opacity: 0.24, dash: dashOf(r), dashOffset: dashOffsetOf(r) });
      drawables.push({ type: 'path', pts: r.pts, color: '#f97316', w: 3.2, opacity: 0.28, dash: dashOf(r), dashOffset: dashOffsetOf(r) });
      drawables.push({ type: 'path', pts: r.pts, color: '#dbe7f5', w: 1.8, opacity: 0.95, dash: dashOf(r), dashOffset: dashOffsetOf(r) });
      return;
    }
    drawables.push({ type: 'path', pts: r.pts, color: colorOf(r), w, opacity, dash: dashOf(r), dashOffset: dashOffsetOf(r) });
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
  // A chopped ray's fill is cut one segment at a time, while its dashed
  // outline runs along the whole polyline; each segment therefore carries the
  // pattern forward by the distance before it, or the fill would restart at
  // every bend the outline passes straight through.
  const bySample = new Map();
  for (const r of paths) {
    if (r.sample === null || r.sample === undefined || r.pts.length < 2) continue;
    if (!bySample.has(r.sample)) bySample.set(r.sample, []);
    let travelled = 0;
    for (let j = 0; j < r.pts.length - 1; j++) {
      const segmentLength = Math.hypot(r.pts[j + 1].x - r.pts[j].x, r.pts[j + 1].y - r.pts[j].y);
      const intensity = r.segmentIntensities?.[j] ?? r.intensity;
      if (intensity > 1e-12) {
        bySample.get(r.sample).push({
          ...r,
          pts: [r.pts[j], r.pts[j + 1]],
          intensity,
          renderHistory: r.segmentHistories?.[j] ?? r.sig,
          renderEvent: r.segmentEvents?.[j] ?? null,
          chopped: continuedChop(r.chopped, travelled),
        });
      }
      travelled += segmentLength;
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
        // A broadband ray split into N spectral samples is still one beam
        // where those samples coincide. Flooring every sample at the
        // single-ray minimum made eight translucent colours stack to full
        // coverage of a red-plus-violet blend, so a white supercontinuum
        // turned purple the moment it crossed any dispersive glass. Sharing
        // the floor keeps the overlap near the composite and still lets the
        // colours show where they genuinely separate.
        // 1/sqrt(N) rather than 1/N: where the samples coincide (a lens) the
        // stack is thin enough to read as the mixed light it physically is,
        // and where they separate (a prism) each colour is still drawn boldly
        // enough to be a rainbow rather than a wash.
        const siblings = Math.max(1, ra.spectralCount || 1);
        // The floor keeps a dim-but-real beam visible instead of fading it to
        // nothing. It was sized for the 2%-100% band, because MIN_INT used to
        // terminate anything weaker before it could be drawn at all. Coherent
        // cancellation now produces genuine sub-percent ports, and holding
        // those at 40% brightness draws a nearly extinguished arm as if it
        // were live -- the contradiction between figure and readout that this
        // work exists to remove. Fade the floor away below the old threshold:
        // at and above MIN_INT every previously drawable beam is untouched.
        const visibilityFloor = (0.4 / Math.sqrt(siblings))
          * Math.min(1, Math.max(0, ra.intensity) / MIN_INT);
        const op = 0.28 * Math.max(visibilityFloor, ra.intensity);
        const [A, B] = ra.renderEvent === rb.renderEvent
          ? [ra.pts, rb.pts]
          : clippedPair(ra, rb);
        if (drawChopped(ra)) {
          const startA = ra.chopped.startMm || 0;
          const startB = rb.chopped ? rb.chopped.startMm || 0 : startA;
          for (const q of chopStrip(A, B, ra.chopped.period, ra.chopped.duty, startA, startB)) {
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
      if (!r.speckle && !r.evanFade) drawables.push({ type: 'path', pts: r.pts, color: colorOf(r), w: 1.2, opacity: 0.7, dash: dashOf(r), dashOffset: dashOffsetOf(r) });
    }
  }
}

function collectPulseTracks(paths, K, fixedColor, pulseTracks) {
  const centreSample = Math.floor((Math.max(1, K) - 1) / 2);
  for (const r of paths) {
    if (!r.pulse || r.pts.length < 2 || r.opls?.length !== r.pts.length) continue;
    if (r.sample !== null && r.sample !== undefined && r.sample !== centreSample) continue;
    // The beam fill skips any SEGMENT carrying no light, and the packets have
    // to agree or a train draws along a path with no beam under it. Judging
    // the whole path by its final intensity is too blunt, though: a beam
    // extinguished part way along -- by a shutter, or an AOM sending
    // everything into its other order -- is still lit up to that point, and
    // its packets belong on the lit stretch. So the track is cut where the
    // light stops rather than dropped.
    let lit = 0;
    while (lit < r.pts.length - 1
      && (r.segmentIntensities?.[lit] ?? r.intensity) > MIN_DRAWN_INTENSITY) lit++;
    if (lit < 1) continue;
    pulseTracks.push({
      pts: r.pts.slice(0, lit + 1).map(p => ({ x: p.x, y: p.y })),
      opls: r.opls.slice(0, lit + 1),
      ...(r.gddTrace ? { gddTrace: r.gddTrace.map(event => ({ ...event })) } : {}),
      ...(r.groupDelayDifferenceTrace ? {
        groupDelayDifferenceTrace: r.groupDelayDifferenceTrace.map(event => ({ ...event })),
      } : {}),
      pulse: { ...r.pulse },
      bw: r.bw || 0,
      color: rayColor(r, fixedColor),
      // The intensity of the stretch kept, not the path's final one.
      intensity: r.segmentIntensities?.[lit - 1] ?? r.intensity,
    });
  }
}

function traceWithCoherentGrouping(rays0, surfaces, couplings, writeHits, signalHits) {
  if (!rays0.some(ray => ray.phaseValid && ray.coherenceId)) {
    return traceRays(rays0, surfaces, couplings, writeHits, signalHits);
  }
  let plan = new Map();
  for (let pass = 0; pass < MAX_COHERENT_GROUP_PASSES; pass++) {
    const arrivals = [];
    traceRays(rays0, surfaces, null, [], [], { plan, arrivals, dryRun: true });
    const next = extendCoherentPlan(arrivals, plan);
    if (coherentPlansEqual(plan, next)) break;
    plan = next;
  }
  return traceRays(rays0, surfaces, couplings, writeHits, signalHits, { plan });
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
  hollowReadings.clear();
  detectorHits = new Map();
  detectorMisses = new Map();
  incompleteCoherenceIds = new Map();
  objectivePupilHits = new Map();
  phasePlateSpans = new Map();
  compressorGdd = new Map();
  metalensHits = new Map();
  gateTransmissionCache = new Map();
  coarsePortCache = new Map();
  cellSpectrumCache = new Map();
  specimenIncident = new Map();
  opoStates = new Map();
  opcpaStates = new Map();
  supercontinuumStates = new Map();
  mixStates = new Map();
  specimenTimingStates = new Map();
  specimenSrsNotes = new Map();

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
    const support = spectrumSupport(srcSpec);
    const K = local.length;
    // A pulsed laser's emitted duration, transform limit and signed chirp
    // come from the one accessor its readouts use too.
    const timing = el.type === 'pulsedlaser' ? authoredPulseTiming(p) : null;
    const pulse = p.temporalMode === 'pulsed' ? {
      sourceId: el.id,
      avgPowerW: Number.isFinite(p.avgPowerW) ? Math.max(0, p.avgPowerW) : 0,
      repRateMHz: Math.min(1000000, Math.max(0.001, p.repRateMHz || 80)),
      // A laser's record carries exactly the duration its readout shows; the
      // accessor already bounds a transform-limited duration to its field.
      pulseWidthFs: timing && Number.isFinite(timing.durationFs) && timing.durationFs > 0 ? timing.durationFs
        : Math.min(1000000000, Math.max(1, p.pulseWidthFs || 100)),
      phaseNs: Math.min(1000000, Math.max(-1000000, p.pulsePhaseNs || 0)),
      centerWavelengthNm: srcWl,
      bandwidthNm: srcBw,
      spectrumKind: srcSpec?.kind || null,
      spectrumLoNm: support?.[0] ?? null,
      spectrumHiNm: support?.[1] ?? null,
      transformLimitFs: el.type === 'sclaser'
        ? supercontinuumTransformLimitFs(p.scMin ?? 300, p.scMax ?? 700, p.pulseShape)
        : timing?.transformLimitFs ?? null,
      pulseShape: p.pulseShape || 'gauss',
      transformLimited: timing ? timing.transformLimited : p.transformLimited === true,
      // The source's own quadratic phase, stated once here and added to the
      // path's GDD by the duration model; it is never also put on the ray.
      ...(timing && !timing.transformLimited ? {
        inputGddFs2: timing.inputGddFs2,
        inputChirp: timing.inputGddFs2 < 0 ? 'negative' : 'positive',
      } : {}),
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
      // A sized, monochromatic CW laser is the only source whose samples are
      // presently guaranteed to describe one phase-locked spatial mode.
      // Point rays cannot reconstruct a field across a finite camera pixel;
      // pulsed, broadband, and generated sources remain power-only.
      const coherenceId = el.type === 'cwlaser' && srcBw === 0 && !pulse && K > 1 ? el.id : null;
      const initialMaterial = initialBody
        ? [initialBody.params?.glass, initialBody.params?.material].find(isDispersiveGlass) || null
        : null;
      return {
        x: o.x, y: o.y, dx: d.x, dy: d.y, wl: srcWl, bw: srcBw, spec: srcSpec, speckle: false,
        // Which optical path this light is on. Every sampling ray of one beam
        // shares it; a beamsplitter's two arms do not, so two arms of one
        // source can be told apart even when they carry the same colour.
        branch: el.id,
        spectralContinuum: Boolean(srcSpec || srcBw > 0),
        spectralWidthNm: null, spectralLo: null, spectralHi: null,
        pol: typeof p.pol === 'number' ? p.pol : undefined,
        stokes: typeof p.pol === 'number' ? linearStokes(p.pol) : null,
        pulse,
        objectives: [],
        evan: r.evan || false, evanLen: r.evanLen,
        medium: initialBody?.id || null, mediumMaterial: initialMaterial, ior: initialIor,
        groupDelayDifferenceFs: 0,
        intensity: 1, power: 1 / Math.max(1, K), sample: r.sample !== undefined ? r.sample : null,
        sampleCount: K,
        sampleGrid: r.sampleGrid === 'edges' ? 'edges' : null,
        coherenceId,
        // Temporal coherence travels with the light: the envelope depends on
        // the path difference at the point where the arms are recombined,
        // which is only known there.
        coherenceLengthMm: Math.max(0, Number(p.coherenceLengthMm) || 0),
        phaseValid: coherenceId !== null,
        phaseIssue: coherenceId === null ? 'source does not define a reconstructable monochromatic CW field' : null,
        phaseOffset: 0,
        fieldGroupCount: 1,
        // Which source this light started from, so the spectrometer can
        // normalize each source's own contribution independently. A specimen
        // relabels sourceId when it emits a signal of its own, so `originId`
        // additionally records the element that actually put the energy into
        // the scene, and is never rewritten downstream -- that is the only id
        // a watt figure can be attributed to.
        sourceId: el.id,
        originId: el.id,
        writeReference: r.sample === undefined || r.sample === Math.floor((K - 1) / 2),
      };
    });
    const allPaths = collect
      ? traceWithCoherentGrouping(rays0, surfaces, couplings, writeHits, signalHits)
      : traceRays(rays0, surfaces, null, [], []);
    if (!collect) continue;
    // Rays tagged hidden (a partial mirror's transmitted leak with its
    // "Display transmitted beam" toggle off) are retained by the bounded
    // weak-power trace above for correct detector/power-budget physics, but
    // stay out of every
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
    || (s.kind === 'transmit' && MIX_CONVERTS.has(s.data.convert))
    || s.kind === 'opcpain'
    || (s.kind === 'attenuate' && s.data.specimen && s.el
        && ['linear', 'nonlinear'].includes(specimenTypeOf(s.el.params))));
  if (needsProbe) {
    specimenProbe = new Map();
    try {
      emitSources(false);
      for (const s of surfaces) {
        if (s.kind !== 'specimen' && s.kind !== 'opcpain' && !(s.kind === 'transmit' && MIX_CONVERTS.has(s.data.convert))
            && !(s.kind === 'attenuate' && s.data.specimen)) continue;
        const records = s.kind === 'opcpain' && s.el
          ? surfaces.filter(peer => peer.kind === 'opcpain' && peer.el?.id === s.el.id)
            .flatMap(peer => specimenProbe.get(peer.id) || [])
          : specimenProbe.get(s.id) || [];
        const beams = records.map(settleProbeBeam);
        s.data.incidentBeams = beams;
        s.data.incidentWls = [...new Set(beams.map(b => b.wl))];
        if (s.el) specimenIncident.set(s.el.id, beams);
      }
    } finally {
      specimenProbe = null;
      detectorHits = new Map();
      detectorMisses = new Map();
      incompleteCoherenceIds = new Map();
      objectivePupilHits = new Map();
      phasePlateSpans = new Map();
      compressorGdd = new Map();
      metalensHits = new Map();
      gateTransmissionCache = new Map();
    }
  }
  emitSources(true);

  // fibers that received light re-emit at their far end (up to 3 chained hops)
  const emitted = new Set();
  for (let pass = 0; pass < 3 && couplings.length; pass++) {
    const batch = couplings.splice(0, couplings.length);
    // An argon capillary sees one pulse, not K ray samples: gather what
    // arrives at the same end from the same source before deriving its pulse
    // energy, so the ray count changes neither the nonlinear strength nor the
    // transmitted power. Ordinary fibers keep their per-coupling path.
    const argon = new Map(), ordinary = [];
    for (const c of batch) {
      if (c.beam.fiberModel !== 'argon') { ordinary.push(c); continue; }
      const key = c.beam.id + ':' + c.end + ':' + (c.sourceId || 'cw');
      const prev = argon.get(key);
      if (!prev) { argon.set(key, { ...c }); continue; }
      prev.incompatibleEnvelope ||= c.wl !== prev.wl || c.spec !== prev.spec
        || Math.abs((c.gdd || 0) - (prev.gdd || 0)) > 1e-6 || Math.abs((c.opl || 0) - (prev.opl || 0)) > 1e-4;
      prev.power = (Number.isFinite(prev.power) ? prev.power : 0) + (Number.isFinite(c.power) ? c.power : 0);
    }
    // Two sources into one capillary end form no single envelope.
    const argonGroups = [...argon.values()];
    for (const c of argonGroups) {
      c.incompatibleEnvelope ||= argonGroups.some(other => other !== c && other.beam.id === c.beam.id
        && other.end === c.end && other.sourceId !== c.sourceId);
    }
    for (const c of [...ordinary, ...argonGroups]) {
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
      if (s.kind !== 'lens' && s.kind !== 'metalens') continue;
      const e = sub(s.b, s.a);
      const den = u.x * e.y - u.y * e.x;
      if (Math.abs(den) < 1e-9) continue;
      const dp = sub(s.a, p0);
      const t = (dp.x * e.y - dp.y * e.x) / den;
      const q = (dp.x * u.y - dp.y * u.x) / den;
      if (t > 1 && q >= 0 && q <= 1) hits.push({ t, s });
    }
    hits.sort((a, b) => a.t - b.t);
    const imageFocalLength = s => s.kind === 'metalens'
      ? metalensFocalLength(s.data, pp.wavelength) : s.data.f;
    if (!hits.length || hits.some(h => !imageFocalLength(h.s))) continue;

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
          r.d = lensBend(r.d, hitP, s, imageFocalLength(s));
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

  invalidateIncompleteCameraFields();
  lastSignalHits = signalHits;
  return { drawables, pulseTracks, writeHits, signalHits };
}

export function traceAll(elements, beams = []) {
  return traceScene(elements, beams).drawables;
}
