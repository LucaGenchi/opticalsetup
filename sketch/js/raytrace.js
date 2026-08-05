// 2D ray-tracing engine.
// Builds world-space surfaces from elements, propagates rays from every source,
// and returns drawables: stroked polylines (line-mode / beam edges) and filled
// polygons (beam-mode envelope between the two edge rays).

import { registry, OBJ_SHAPES } from './elements.js';
import { toLocal, toWorld, rotPt, dot, sub, add, mul, norm, perp, wavelengthToColor, D2R, distToSegment } from './util.js';
import { C_MM_PER_NS, pulseGateTransmission } from './pulses.js';

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
import { airyTransmission } from './etalon.js';

// polylines from the most recent traceAll, kept for beam probes
let lastPaths = [];
let detectorHits = new Map();
let gateTransmissionCache = new Map();

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

function detectorSpectrum(hits) {
  const samples = new Map();
  for (const hit of hits) {
    if (!Number.isFinite(hit.wl) || !Number.isFinite(hit.power) || hit.power <= 0) continue;
    const key = Math.round(hit.wl * 10) / 10;
    const sample = samples.get(key) || { wavelength: key, power: 0 };
    sample.power += hit.power;
    samples.set(key, sample);
  }
  const ordered = [...samples.values()].sort((a, b) => a.wavelength - b.wavelength);
  if (ordered.length <= 24) return ordered.map(sample => ({
    ...sample,
    color: wavelengthToColor(sample.wavelength),
  }));
  // Keep the readout bounded for sources that produce many wavelength samples.
  const stride = ordered.length / 24;
  return Array.from({ length: 24 }, (_, index) => {
    const start = Math.floor(index * stride);
    const end = Math.max(start + 1, Math.floor((index + 1) * stride));
    const group = ordered.slice(start, end);
    const power = group.reduce((sum, sample) => sum + sample.power, 0);
    const wavelength = power > 0
      ? group.reduce((sum, sample) => sum + sample.wavelength * sample.power, 0) / power
      : group[0].wavelength;
    return { wavelength, power, color: wavelengthToColor(wavelength) };
  });
}

function averageGateTransmission(pulse) {
  if (!pulse?.gates?.length) return 1;
  const key = [pulse.repRateMHz, pulse.pulseWidthFs, pulse.phaseNs, ...pulse.gates.flatMap(g => [
    g.opl, g.frequencyMHz, g.duty, g.phaseNs, g.shape || 'square', g.depth ?? 1, g.invert ? 1 : 0,
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
  return best ? { wl: best.wl, bw: best.bw || 0, pol: best.pol, stokes: cloneStokes(best.stokes), intensity: best.intensity } : null;
}

// Physics and presentation use different cutoffs. Low-power branches must
// still reach detectors; keeping the old 2% threshold only for drawing avoids
// turning deep split paths into canvas clutter.
const MAXLEN = 6000, MAX_DEPTH = 60, MIN_TRACE_INT = 1e-6, MIN_RENDER_INT = 0.02;

function pathPeakIntensity(ray) {
  return Math.max(ray.intensity || 0, ...(ray.segmentIntensities || []));
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
  const o = add(e, mul(dir, 2));
  const cfg = b['out' + outEnd] || { mode: b.outMode || 'diverge', na: b.na, focal: b.focal, dia: b.outDia };
  const K = 9, rays = [];
  const ng = Math.min(2.2, Math.max(1, b.groupIndex || 1.468));
  const lossDbPerM = Math.min(100, Math.max(0, b.lossDbPerM ?? 0.2));
  const lengthMm = polylineLength(pts);
  const transmission = 10 ** (-(lossDbPerM * lengthMm / 1000) / 10);
  const common = {
    wl: c.wl, bw: c.bw || 0, speckle: false, intensity: Math.min(1, c.intensity * transmission),
    power: Number.isFinite(c.power) ? c.power * transmission / K : undefined,
    pol: c.pol, stokes: cloneStokes(c.stokes), pulse: c.pulse, oplStart: (c.opl || 0) + lengthMm * ng + 2,
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
function wlSamples(ray) {
  if (!ray.bw) return [ray.wl];
  const K = ray.bw >= 200 ? 9 : 5;
  const lo = ray.wl - ray.bw / 2, hi = ray.wl + ray.bw / 2;
  return Array.from({ length: K }, (_, i) => lo + (hi - lo) * i / (K - 1));
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

// child ray carrying the spectral slice [lo, hi] of a parent broadband ray
function bandChild(ray, d, lo, hi, tag) {
  const nbw = hi - lo < 2 ? 0 : hi - lo;
  return {
    d, wl: (lo + hi) / 2, bw: nbw, tag,
    intensity: ray.intensity * Math.min(1, Math.max(0, (hi - lo) / ray.bw)),
  };
}

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
    case 'attenuate': return [{ d, intensity: ray.intensity * Math.min(1, Math.max(0, data.transmission ?? 1)) }];
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
    case 'etalon': {
      const axis = dot(d, n) >= 0 ? n : mul(n, -1);
      const incidenceSin = dot(d, t);
      const index = Math.min(2.5, Math.max(1, data.refractiveIndex || 1.46));
      const insideSin = Math.min(0.999999, Math.max(-0.999999, incidenceSin / index));
      const insideCos = Math.sqrt(Math.max(1e-12, 1 - insideSin * insideSin));
      const insideTan = insideSin / insideCos;
      const spacing = Math.min(100, Math.max(1, data.spacing || 12));
      const rearOrigin = add(add(hit.p, mul(axis, spacing)), mul(t, spacing * insideTan));
      const referenceIncidenceSin = Math.sin((data.configuredTiltDeg || 0) * D2R);
      const samples = wlSamples(ray);
      const out = [];
      for (let i = 0; i < samples.length; i++) {
        const wavelength = samples[i];
        const transmission = airyTransmission({
          wavelengthNm: wavelength,
          designWavelengthNm: data.designWavelength,
          spacingMm: spacing,
          refractiveIndex: index,
          reflectivity: data.reflectivity,
          incidenceSin,
          referenceIncidenceSin,
        });
        const sampleIntensity = ray.intensity / samples.length;
        if (transmission > 0) out.push({
          d, origin: rearOrigin, wl: wavelength, bw: 0,
          intensity: sampleIntensity * transmission,
          oplOffset: index * spacing / insideCos,
          tag: `airy-T${i}`,
        });
        if (transmission < 1) out.push({
          d: reflect(d, n), wl: wavelength, bw: 0,
          intensity: sampleIntensity * (1 - transmission),
          tag: `airy-R${i}`,
        });
      }
      return out;
    }
    case 'vipa': {
      const axis = dot(d, n) >= 0 ? n : mul(n, -1);
      const incidenceSin = dot(d, t);
      const index = Math.min(2.5, Math.max(1, data.refractiveIndex || 1.46));
      const insideSin = Math.min(0.999999, Math.max(-0.999999, incidenceSin / index));
      const insideCos = Math.sqrt(Math.max(1e-12, 1 - insideSin * insideSin));
      const insideTan = insideSin / insideCos;
      const spacing = Math.min(100, Math.max(1, data.spacing || 12));
      const aperture = Math.min(150, Math.max(6, data.aperture || 35));
      const windowMidpoint = mul(add(s.a, s.b), 0.5);
      const surfaceMidpoint = sub(windowMidpoint, mul(t, data.windowOffset || 0));
      const inputAlong = dot(sub(hit.p, surfaceMidpoint), t);
      const oneWayShift = spacing * insideTan;
      const roundTripShift = 2 * oneWayShift;
      const outputR = Math.min(0.999, Math.max(0, data.outputReflectivity ?? 0.96));
      const roundTrip = outputR * Math.min(0.999, Math.max(0, data.frontReflectivity ?? 0.999));
      const leakage = 1 - outputR;
      const samples = wlSamples(ray);
      const maxOrders = Math.abs(roundTripShift) < 0.05 ? 1 : Math.min(24, Math.max(1, data.maxOrders || 24));
      const out = [];
      for (let i = 0; i < samples.length; i++) {
        const wavelength = samples[i];
        const dispersion = Math.min(45, Math.max(-45,
          (data.angularDispersionDegPerNm || 0) * (wavelength - data.designWavelength))) * D2R;
        for (let order = 0; order < maxOrders; order++) {
          const outputAlong = inputAlong + oneWayShift + order * roundTripShift;
          if (Math.abs(outputAlong) > aperture / 2) break;
          const orderIntensity = ray.intensity / samples.length * leakage * roundTrip ** order;
          if (orderIntensity < MIN_TRACE_INT) break;
          out.push({
            d: rotv(d, dispersion),
            origin: add(add(surfaceMidpoint, mul(axis, spacing)), mul(t, outputAlong)),
            wl: wavelength, bw: 0,
            intensity: orderIntensity,
            oplOffset: index * spacing * (2 * order + 1) / insideCos,
            hidden: !data.showLeakage,
            tag: `vipa-w${i}-o${order}`,
          });
        }
      }
      return out;
    }
    case 'lens': {
      // transmission efficiency (AR-coating/absorption loss): a straight
      // power/intensity attenuation, no deviation of the focused direction.
      const T = Math.min(1, Math.max(0, (data.transEff ?? 100) / 100));
      return [{ d: lensBend(d, hit.p, s, data.f), intensity: ray.intensity * T }];
    }
    case 'refract': {
      const materialId = s.el?.id || null;
      const inside = materialId !== null && ray.medium === materialId;
      // BK7-like glass is dispersive: a broadband ray must be sampled across
      // its bandwidth so each wavelength refracts by its own n(λ) and the
      // beam actually fans out (e.g. white light through a prism). A fixed
      // user-set index (glass rods) has no dispersion to sample.
      const dispersive = data.material === 'bk7' && ray.bw > 0;
      const transmitAt = (wl, intensity = ray.intensity, tag, bandwidth = ray.bw) => {
        const dispersiveIor = data.material === 'bk7' ? 1.5046 + 4680 / (wl * wl) : data.ior;
        const materialIor = Math.min(2.5, Math.max(1.01, dispersiveIor || 1.52));
        // A broadband source born inside the body initially carries one
        // center-wavelength IOR. Once sampled at the exit, each wavelength
        // must use its own incident index or the spectrum keeps one angle.
        const n1 = inside ? (dispersive ? materialIor : (ray.ior || materialIor)) : (ray.ior || 1);
        const n2 = inside ? 1 : materialIor;
        const transmitted = refract(d, n, n1, n2);
        if (!transmitted) {
          return {
            d: reflect(d, n), wl, bw: bandwidth, intensity,
            ior: inside ? materialIor : (ray.ior || 1),
            tag: tag ? `${tag}-tir` : 'tir',
          };
        }
        return {
          d: transmitted, wl, bw: bandwidth, tag,
          medium: inside ? null : materialId,
          ior: n2,
          intensity: intensity * Math.min(1, Math.max(0, data.transmission ?? 1)),
        };
      };
      if (dispersive) {
        const samples = wlSamples(ray);
        return samples.map((wl, i) => transmitAt(wl, ray.intensity / samples.length, `w${i}`, 0));
      }
      return [transmitAt(ray.wl)];
    }
    case 'dichroic': {
      if (!ray.bw) return dichroicTransmits(ray.wl, data) ? [{ d }] : [{ d: reflect(d, n) }];
      // broadband: transmit the overlap with the passband, reflect the rest
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
      // broadband: transmitted spectrum = overlap of beam band and passband
      const ix = bandIntersect([ray.wl - ray.bw / 2, ray.wl + ray.bw / 2], passbandOf(f));
      if (!ix || ix[1] - ix[0] < 0.5) return [];
      const c = bandChild(ray, d, ix[0], ix[1], null);
      delete c.tag;
      return [c];
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
          const sd = si + m * wls[i] / data.d;
          if (Math.abs(sd) > 1) continue;
          const c = Math.sqrt(1 - sd * sd);
          const sOut = data.transmissive ? sIn : -sIn;
          out.push({
            d: norm(add(mul(n, sOut * c), mul(t, sd))),
            wl: wls[i], bw: 0,
            intensity: ray.intensity / (data.orders.length * (m === 0 ? 1 : wls.length)),
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
      const f = analyzerTransmission(ray.stokes, a);
      if (f < 0.02) return [];
      const stokes = linearStokes(a);
      return [{ d, intensity: ray.intensity * f, pol: a, stokes, tag: 'pol' }];
    }
    case 'wp': {
      if (!ray.stokes) return [{ d }];
      const stokes = applyRetarder(ray.stokes, data.a || 0, data.half ? 180 : 90);
      return [{ d, stokes, pol: legacyPolarization(stokes), tag: data.half ? 'hwp' : 'qwp' }];
    }
    case 'retarder': {
      if (!ray.stokes) return [{ d }];
      const stokes = applyRetarder(ray.stokes, data.a || 0, data.retardance || 0);
      return [{ d, stokes, pol: legacyPolarization(stokes), tag: 'ret' }];
    }
    case 'pbs': {
      const ft = analyzerTransmission(ray.stokes, 0);
      const out = [];
      if (ft > 0.02) out.push({ d, intensity: ray.intensity * ft, pol: 0, stokes: linearStokes(0), tag: 'T' });
      if (1 - ft > 0.02) out.push({ d: reflect(d, n), intensity: ray.intensity * (1 - ft), pol: 90, stokes: linearStokes(90), tag: 'R' });
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
            evan: true, evanLen: 25,
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
                const sd = si + m * wls[wi] / gd;
                if (Math.abs(sd) > 1) continue;
                const c = Math.sqrt(1 - sd * sd);
                next.push({
                  d: norm(add(mul(n, sOut * c), mul(t, sd))),
                  wl: wls[wi], bw: 0, speckle: r.speckle,
                  intensity: r.intensity / (orders.length * (m === 0 ? 1 : wls.length)),
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
      let wl = ray.wl, bw;
      if (data.convert === 'shg') wl = ray.wl / 2;
      else if (data.convert === 'thg') wl = ray.wl / 3;
      else if (data.convert === 'custom' || data.convert === 'cars') wl = data.outWl;
      else if (data.convert === 'sc') { wl = 650; bw = 440; } // supercontinuum
      const conv = { d, wl, intensity: ray.intensity * efficiency };
      if (bw !== undefined) conv.bw = bw;
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
      if (r.depth > MAX_DEPTH || r.intensity < MIN_TRACE_INT) break;
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
        const CAPTURE = EVAN_LEN * 1.5;
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
      if (hit.surface.el?.type === 'stage' && r.writeReference) {
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
          if (hit.surface.kind === 'fluor') {
            signalWl = hit.surface.data.wl;
          } else if (hit.surface.kind === 'transmit' && hit.surface.data.convert) {
            const conv = hit.surface.data.convert;
            signalWl = conv === 'shg' ? r.wl / 2
              : conv === 'thg' ? r.wl / 3
                : (conv === 'cars' || conv === 'custom') ? hit.surface.data.outWl
                  : undefined;
          }
          signalHits.push({ stageId: hit.surface.el.id, x: hit.p.x, y: hit.p.y, wl: signalWl });
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
            beam: fb, end: hit.surface.data.end, wl: r.wl, bw: r.bw,
            intensity: r.intensity, power: r.power, pol: r.pol, stokes: cloneStokes(r.stokes),
            pulse: r.pulse, opl: r.opl,
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
        && !(c0.speckle && !r.speckle)
        && !(c0.chopped && !r.chopped)
        && !('pol' in c0 && c0.pol !== r.pol)
        && !('stokes' in c0)
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
        const childOpl = r.opl + Math.max(0, Number.isFinite(c.oplOffset) ? c.oplOffset : 0);
        stack.push({
          x: ox, y: oy, dx: c.d.x, dy: c.d.y,
          wl: c.wl !== undefined ? c.wl : r.wl,
          bw: c.bw !== undefined ? c.bw : r.bw,
          speckle: c.speckle || r.speckle || false,
          chopped: c.chopped || r.chopped || undefined,
          evan: c.evan || false,
          evanLen: c.evanLen,
          pol: 'pol' in c ? c.pol : r.pol,
          stokes: 'stokes' in c ? cloneStokes(c.stokes) : cloneStokes(r.stokes),
          medium: 'medium' in c ? c.medium : r.medium,
          ior: 'ior' in c ? c.ior : (r.ior || 1),
          pulse: 'pulse' in c ? c.pulse : r.pulse,
          intensity: c.intensity !== undefined ? c.intensity : r.intensity,
          power: c.power !== undefined ? c.power : Number.isFinite(r.power)
            ? r.power * (c.intensity !== undefined && r.intensity > 0 ? c.intensity / r.intensity : 1)
            : undefined,
          sample: r.sample, writeReference: r.writeReference,
          hidden: r.hidden || Boolean(c.hidden),
          pts: [{ x: ox, y: oy }],
          opl: childOpl,
          opls: [childOpl],
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
      color: fixedColor || wavelengthToColor(r.wl),
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
  const couplings = [];
  lastPaths = [];
  detectorHits = new Map();
  gateTransmissionCache = new Map();

  for (const el of elements) {
    const def = registry[el.type];
    if (!def || !def.source) continue;
    const p = el.params;
    const baseColor = p.autoColor === false && p.color ? p.color : wavelengthToColor(p.wavelength);
    const local = def.source(el);
    const scLo = el.type === 'sclaser' ? Math.min(p.scMin || 430, p.scMax || 870) : 430;
    const scHi = el.type === 'sclaser' ? Math.max(p.scMin || 430, p.scMax || 870) : 870;
    const srcBw = p.bwMode === 'band' ? (p.bandwidth || 0)
      : p.bwMode === 'sc' ? scHi - scLo : 0;
    const srcWl = p.bwMode === 'sc' ? (scHi + scLo) / 2 : p.wavelength;
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
        x: o.x, y: o.y, dx: d.x, dy: d.y, wl: srcWl, bw: srcBw, speckle: false,
        pol: typeof p.pol === 'number' ? p.pol : undefined,
        stokes: typeof p.pol === 'number' ? linearStokes(p.pol) : null,
        pulse,
        evan: r.evan || false, evanLen: r.evanLen,
        medium: initialBody?.id || null, ior: initialIor,
        intensity: 1, power: 1 / Math.max(1, K), sample: r.sample !== undefined ? r.sample : null,
        writeReference: r.sample === undefined || r.sample === Math.floor((K - 1) / 2),
      };
    });
    const allPaths = traceRays(rays0, surfaces, couplings, writeHits, signalHits);
    // Rays tagged hidden (a partial mirror's transmitted leak with its
    // "Display transmitted beam" toggle off) are always fully traced above,
    // for correct detector/power-budget physics — but stay out of every
    // visual surface: drawables, pulse animation, and the beam probe.
    const visiblePaths = allPaths.filter(r => !r.hidden);
    const renderPaths = visiblePaths.filter(r => pathPeakIntensity(r) >= MIN_RENDER_INT);
    lastPaths.push(...renderPaths);
    assembleDrawables(renderPaths, {
      K, isBeam: p.beamMode === 'beam',
      fixedColor: p.autoColor === false && p.color ? baseColor : null,
    }, drawables);
    collectPulseTracks(renderPaths, K, p.autoColor === false && p.color ? baseColor : null, pulseTracks);
  }

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
      const visiblePaths = traceRays(rays0, surfaces, couplings, writeHits, signalHits).filter(r => !r.hidden);
      const renderPaths = visiblePaths.filter(r => pathPeakIntensity(r) >= MIN_RENDER_INT);
      lastPaths.push(...renderPaths);
      assembleDrawables(renderPaths, { K: rays0.length, isBeam: true, fixedColor: null }, drawables);
      collectPulseTracks(renderPaths, rays0.length, null, pulseTracks);
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

  return { drawables, pulseTracks, writeHits, signalHits };
}

export function traceAll(elements, beams = []) {
  return traceScene(elements, beams).drawables;
}
