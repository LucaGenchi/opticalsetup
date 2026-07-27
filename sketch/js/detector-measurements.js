// Qualitative measurements derived from the ray tracer for detector screens.

import { registry } from './elements.js';
import { detectorReading, probeAt } from './raytrace.js';
import {
  add, dot, mul, norm, perp, rotPt, sub, toLocal, toWorld, wavelengthToColor,
} from './util.js';

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

export function sensorFaceX(sensor) {
  const def = registry[sensor?.type];
  if (Number.isFinite(def?.sensorFaceX)) return def.sensorFaceX;
  const snap = typeof def?.snapPt === 'function' ? def.snapPt(sensor) : def?.snapPt;
  return Number.isFinite(snap?.x) ? snap.x : -20;
}

export function sensorAperture(sensor) {
  if (sensor?.type === 'camera') return Math.max(1, sensor.params.ch || 30);
  if (sensor?.type === 'eye') return Math.max(1, sensor.params.diameter || 30);
  return Math.max(1, sensor?.params?.aperture || 26);
}

function stokesFallback(description) {
  const text = String(description || '');
  const linear = /^Linear\s+(-?[\d.]+)°/.exec(text);
  if (linear) {
    const angle = Number(linear[1]) * Math.PI / 180;
    return { s1: Math.cos(2 * angle), s2: Math.sin(2 * angle), s3: 0 };
  }
  if (/^Circular/.test(text)) return { s1: 0, s2: 0, s3: 1 };
  const elliptical = /^Elliptical\s+(-?[\d.]+)°/.exec(text);
  if (elliptical) {
    const angle = Number(elliptical[1]) * Math.PI / 180;
    return { s1: 0.55 * Math.cos(2 * angle), s2: 0.55 * Math.sin(2 * angle), s3: 0.84 };
  }
  return { s1: 0, s2: 0, s3: 0 };
}

function sampleStokes(sensor, reading) {
  const aperture = sensorAperture(sensor), face = sensorFaceX(sensor) - 1.5;
  let weight = 0, s1 = 0, s2 = 0, s3 = 0;
  for (let index = 0; index < 21; index++) {
    const y = -aperture / 2 + aperture * index / 20;
    const point = toWorld(sensor, face, y);
    const probe = probeAt(point.x, point.y, Math.max(1.2, aperture / 32));
    if (!probe?.stokes) continue;
    const w = Math.max(0.000001, Number.isFinite(probe.intensity) ? probe.intensity : 1);
    weight += w;
    s1 += probe.stokes.s1 * w;
    s2 += probe.stokes.s2 * w;
    s3 += probe.stokes.s3 * w;
  }
  const normalized = weight > 0
    ? { s1: s1 / weight, s2: s2 / weight, s3: s3 / weight }
    : stokesFallback(reading.polarization);
  return {
    normalized: {
      ...normalized,
      degree: clamp(Math.hypot(normalized.s1, normalized.s2, normalized.s3), 0, 1),
    },
    s0: reading.signal,
    s1: reading.signal * normalized.s1,
    s2: reading.signal * normalized.s2,
    s3: reading.signal * normalized.s3,
  };
}

function occupiedSpan(sensor, localX) {
  const aperture = sensorAperture(sensor), occupied = [], samples = 37;
  for (let index = 0; index < samples; index++) {
    const y = -aperture / 2 + aperture * index / (samples - 1);
    const point = toWorld(sensor, localX, y);
    const probe = probeAt(point.x, point.y, Math.max(1, aperture / samples * 0.75));
    if (probe && Number.isFinite(probe.intensity) && probe.intensity > 0.000001) occupied.push(y);
  }
  if (!occupied.length) return null;
  return { span: Math.max(...occupied) - Math.min(...occupied), count: occupied.length };
}

// Reads convergence from the traced ray slopes at the sensor face
// (reading.convergence, computed in raytrace.js). The earlier approach —
// measuring the beam's drawn width at two planes and differencing — depended
// on the sensor's own aperture for both its sampling baseline and its probe
// tolerance, so resizing the detector changed the verdict, and near a focus
// the width difference was pure quantization noise.
function sampleWavefront(sensor, reading) {
  const c = reading?.convergence;
  if (!c || !Number.isFinite(c.fullAngleDeg)) {
    return { state: 'COLLIMATED', divergenceDeg: 0, signedDivergenceDeg: 0 };
  }
  const signed = c.diverging ? c.fullAngleDeg : -c.fullAngleDeg;
  // A single traced ray, or a genuinely parallel bundle, reads as collimated.
  if (c.fullAngleDeg < 0.05) {
    return { state: 'COLLIMATED', divergenceDeg: 0, signedDivergenceDeg: 0 };
  }
  return {
    state: c.diverging ? 'DIVERGING' : 'CONVERGING',
    divergenceDeg: c.fullAngleDeg,
    signedDivergenceDeg: signed,
  };
}

function configuredPower(elements) {
  const sources = elements.filter(element => registry[element?.type]?.source);
  const powered = sources.filter(source => Number.isFinite(source.params?.avgPowerW));
  if (!sources.length || !powered.length) return null;
  return powered.reduce((sum, source) => sum + Math.max(0, source.params.avgPowerW), 0) / sources.length;
}

export function enhancedReading(sensor, elements = []) {
  const reading = detectorReading(sensor.id);
  if (!reading) return null;
  const wattsPerRelativeUnit = configuredPower(elements);
  return {
    ...reading,
    beamDiameter: reading.samples > 1 ? Math.max(0, reading.spotSpan) : 0,
    stokes: sampleStokes(sensor, reading),
    wavefront: sampleWavefront(sensor, reading),
    bandwidth: Math.max(0, reading.bandMax - reading.bandMin),
    detectedPowerW: wattsPerRelativeUnit == null ? null : reading.signal * wattsPerRelativeUnit,
    powerIsEstimated: wattsPerRelativeUnit != null,
  };
}

function lensBend(direction, hitPoint, surface, focalLength) {
  const tangent = norm(sub(surface.b, surface.a)), normal = perp(tangent);
  const forward = mul(normal, dot(direction, normal) >= 0 ? 1 : -1);
  const height = dot(sub(hitPoint, mul(add(surface.a, surface.b), 0.5)), tangent);
  const denominator = dot(direction, forward);
  if (Math.abs(denominator) < 0.000001 || !focalLength) return direction;
  return norm(add(forward, mul(tangent, dot(direction, tangent) / denominator - height / focalLength)));
}

function worldLenses(elements) {
  const lenses = [];
  for (const element of elements) {
    const def = registry[element?.type];
    if (!def?.surfaces) continue;
    let surfaces;
    try { surfaces = def.surfaces(element); } catch (_) { continue; }
    for (const surface of surfaces || []) {
      if (surface.kind !== 'lens' || !surface.data?.f) continue;
      lenses.push({
        a: toWorld(element, surface.x1, surface.y1),
        b: toWorld(element, surface.x2, surface.y2),
        data: surface.data,
      });
    }
  }
  return lenses;
}

function imagePoint(point, forward, up, hits) {
  const rays = [{ point, direction: forward }, { point, direction: norm(add(forward, up)) }];
  for (const hit of hits) {
    for (const ray of rays) {
      const edge = sub(hit.surface.b, hit.surface.a);
      const denominator = ray.direction.x * edge.y - ray.direction.y * edge.x;
      if (Math.abs(denominator) < 0.000000001) continue;
      const offset = sub(hit.surface.a, ray.point);
      const distance = (offset.x * edge.y - offset.y * edge.x) / denominator;
      ray.point = add(ray.point, mul(ray.direction, distance));
      ray.direction = lensBend(ray.direction, ray.point, hit.surface, hit.surface.data.f);
    }
  }
  const [first, second] = rays;
  const denominator = first.direction.x * second.direction.y - first.direction.y * second.direction.x;
  if (Math.abs(denominator) < 0.000000001) return null;
  const offset = sub(second.point, first.point);
  const distance = (offset.x * second.direction.y - offset.y * second.direction.x) / denominator;
  const result = add(first.point, mul(first.direction, distance));
  return Number.isFinite(result.x) && Number.isFinite(result.y) ? result : null;
}

export function objectImageAtCamera(camera, elements = []) {
  const lenses = worldLenses(elements);
  if (!lenses.length) return null;
  const face = sensorFaceX(camera), aperture = sensorAperture(camera);
  for (const object of elements) {
    const def = registry[object?.type];
    if (!def?.imaging || object.params?.showImage === false) continue;
    const params = object.params || {};
    const forward = rotPt(1, 0, object.rot || 0), up = rotPt(0, -1, object.rot || 0);
    const base = { x: object.x, y: object.y }, height = Math.max(0.001, params.height || 20);
    const tip = add(base, mul(up, height)), hits = [];
    for (const surface of lenses) {
      const edge = sub(surface.b, surface.a);
      const denominator = forward.x * edge.y - forward.y * edge.x;
      if (Math.abs(denominator) < 0.000000001) continue;
      const offset = sub(surface.a, base);
      const distance = (offset.x * edge.y - offset.y * edge.x) / denominator;
      const fraction = (offset.x * forward.y - offset.y * forward.x) / denominator;
      if (distance > 1 && fraction >= 0 && fraction <= 1) hits.push({ distance, surface });
    }
    hits.sort((a, b) => a.distance - b.distance);
    if (!hits.length) continue;
    const imageBase = imagePoint(base, forward, up, hits), imageTip = imagePoint(tip, forward, up, hits);
    if (!imageBase || !imageTip) continue;
    const localBase = toLocal(camera, imageBase.x, imageBase.y);
    const localTip = toLocal(camera, imageTip.x, imageTip.y);
    const tolerance = Math.max(4, Math.abs(localTip.x - localBase.x) + 2);
    if (Math.abs(localBase.x - face) > tolerance || Math.abs(localTip.x - face) > tolerance) continue;
    if (Math.max(Math.abs(localBase.y), Math.abs(localTip.y)) > aperture / 2 + 3) continue;
    return {
      shape: params.shape || 'arrow',
      color: params.autoColor === false && params.color
        ? params.color : wavelengthToColor(params.wavelength || 532),
      localBaseY: localBase.y,
      localTipY: localTip.y,
      magnification: dot(sub(imageTip, imageBase), up) / height,
    };
  }
  return null;
}
