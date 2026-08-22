// Pixel-integrated camera reconstruction.
//
// Rays across a sized beam are quadrature samples, not bright/dark camera
// pixels.  This module first turns each continuous traced route into finite
// ray tubes and deposits their power conservatively.  Eligible routes from
// one monochromatic CW source are then combined as fields, with every cross
// term integrated over the finite pixel aperture.  At no point are the
// discrete ray samples themselves added as coherent fields.

import { wavelengthToColor } from './util.js';

const EPS = 1e-10;
const POWER_EPS = 1e-12;
const MAX_COHERENT_MODES = 8;

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const totalOf = values => values.reduce((sum, value) => sum + value, 0);

function finiteComplex(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? { re: value, im: 0 } : null;
  if (Array.isArray(value) && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
    return { re: value[0], im: value[1] };
  }
  if (value && Number.isFinite(value.re) && Number.isFinite(value.im)) return { re: value.re, im: value.im };
  return null;
}

function normalizedJones(hit) {
  if (Array.isArray(hit.jones) && hit.jones.length === 2) {
    const x = finiteComplex(hit.jones[0]), y = finiteComplex(hit.jones[1]);
    if (x && y) {
      const norm = Math.hypot(x.re, x.im, y.re, y.im);
      if (norm > EPS) return [{ re: x.re / norm, im: x.im / norm }, { re: y.re / norm, im: y.im / norm }];
    }
  }
  if (!Number.isFinite(hit.pol)) return null;
  const angle = hit.pol * Math.PI / 180;
  const phase = Number.isFinite(hit.phaseOffset) ? hit.phaseOffset : 0;
  const re = Math.cos(phase), im = Math.sin(phase);
  return [
    { re: Math.cos(angle) * re, im: Math.cos(angle) * im },
    { re: Math.sin(angle) * re, im: Math.sin(angle) * im },
  ];
}

function sameJones(a, b) {
  if (!a || !b) return false;
  return a.every((value, index) => Math.abs(value.re - b[index].re) < 1e-8 && Math.abs(value.im - b[index].im) < 1e-8);
}

function jonesOverlap(left, right) {
  // left† right
  let re = 0, im = 0;
  for (let i = 0; i < 2; i++) {
    re += left[i].re * right[i].re + left[i].im * right[i].im;
    im += left[i].re * right[i].im - left[i].im * right[i].re;
  }
  return { re, im };
}

function hexChannels(color) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  return match ? match.slice(1).map(channel => parseInt(channel, 16)) : [216, 231, 238];
}

function mixedColor(wavelengthProfiles, pixel) {
  let red = 0, green = 0, blue = 0;
  for (const [wavelength, profile] of wavelengthProfiles) {
    const weight = Math.max(0, profile[pixel] || 0);
    if (!(weight > POWER_EPS)) continue;
    const [r, g, b] = hexChannels(wavelengthToColor(Number(wavelength)));
    red += r * weight;
    green += g * weight;
    blue += b * weight;
  }
  const peak = Math.max(red, green, blue);
  if (!(peak > POWER_EPS)) return null;
  const channel = value => Math.round(255 * value / peak).toString(16).padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function addProfile(target, source, scale = 1) {
  for (let i = 0; i < target.length; i++) target[i] += scale * source[i];
}

function addSpectralProfile(map, wavelength, source, scale = 1) {
  const key = Number(wavelength).toFixed(6);
  if (!map.has(key)) map.set(key, Array(source.length).fill(0));
  addProfile(map.get(key), source, scale);
}

function sourceSpectralKey(sourceId, wavelength, continuum, pathKey = null) {
  return JSON.stringify([
    sourceId,
    Number(wavelength).toFixed(9),
    continuum ? 'continuum' : 'line',
    continuum ? pathKey : null,
  ]);
}

function addSourceSpectralProfile(map, sourceId, wavelength, continuum, pathKey, source, scale = 1) {
  const key = sourceSpectralKey(sourceId, wavelength, continuum, pathKey);
  const entry = map.get(key) || {
    sourceId,
    wavelength: Number(wavelength),
    continuum: Boolean(continuum),
    pathKey: continuum ? pathKey : null,
    profile: Array(source.length).fill(0),
  };
  addProfile(entry.profile, source, scale);
  map.set(key, entry);
}

function spectralTotals(map) {
  return [...map.values()].map(entry => ({
    sourceId: entry.sourceId,
    wavelength: entry.wavelength,
    continuum: entry.continuum,
    pathKey: entry.pathKey,
    power: Math.max(0, totalOf(entry.profile)),
  }));
}

function depositCell(cell, profile, pixelWidth, sensorMin) {
  for (let pixel = 0; pixel < profile.length; pixel++) {
    const left = sensorMin + pixel * pixelWidth;
    const right = left + pixelWidth;
    const overlap = Math.max(0, Math.min(cell.right, right) - Math.max(cell.left, left));
    if (overlap > 0) profile[pixel] += overlap * cell.density;
  }
}

function depositPoint(hit, profile, pixelWidth, sensorMin) {
  const sensorMax = sensorMin + profile.length * pixelWidth;
  if (hit.sensorMiss && (hit.x < sensorMin - EPS || hit.x > sensorMax + EPS)) return 0;
  const position = (hit.x - sensorMin) / pixelWidth - 0.5;
  const left = Math.floor(position), fraction = position - left;
  const candidates = [[left, 1 - fraction], [left + 1, fraction]]
    .filter(([index, weight]) => index >= 0 && index < profile.length && weight > EPS);
  const weightSum = candidates.reduce((sum, [, weight]) => sum + weight, 0);
  if (weightSum <= EPS) {
    const index = clamp(Math.floor((hit.x - sensorMin) / pixelWidth), 0, profile.length - 1);
    profile[index] += hit.power;
    return hit.power;
  }
  for (const [index, weight] of candidates) profile[index] += hit.power * weight / weightSum;
  return hit.power;
}

function contiguousRuns(hits) {
  if (!hits.every(hit => Number.isInteger(hit.sample))) return hits.map(hit => [hit]);
  const sorted = [...hits].sort((a, b) => a.sample - b.sample);
  const runs = [];
  for (const hit of sorted) {
    const run = runs[runs.length - 1];
    if (!run || hit.sample !== run[run.length - 1].sample + 1) runs.push([hit]);
    else run.push(hit);
  }
  return runs;
}

function isAuthoredBeamEdge(hit) {
  return hit.sampleGrid === 'edges'
    && Number.isInteger(hit.sample)
    && Number.isInteger(hit.sampleCount)
    && hit.sampleCount > 1
    && (hit.sample === 0 || hit.sample === hit.sampleCount - 1);
}

function finiteTubePiece(run, sensorMin, sensorMax) {
  if (run.length < 2) return null;
  const deltas = run.slice(1).map((hit, index) => hit.x - run[index].x);
  const increasing = deltas.every(delta => delta > EPS);
  const decreasing = deltas.every(delta => delta < -EPS);
  if (!increasing && !decreasing) return null;
  const nodes = [...run].sort((a, b) => a.x - b.x);
  const edges = Array(nodes.length + 1);
  // Edge-sampled lasers place their outer rays on the authored beam
  // boundary. Internal run ends (including a route clipped by an optic)
  // still own half the adjacent spacing beyond their sample centre.
  edges[0] = isAuthoredBeamEdge(nodes[0])
    ? nodes[0].x
    : nodes[0].x - (nodes[1].x - nodes[0].x) / 2;
  for (let i = 1; i < nodes.length; i++) edges[i] = (nodes[i - 1].x + nodes[i].x) / 2;
  edges[nodes.length] = isAuthoredBeamEdge(nodes[nodes.length - 1])
    ? nodes[nodes.length - 1].x
    : nodes[nodes.length - 1].x + (nodes[nodes.length - 1].x - nodes[nodes.length - 2].x) / 2;
  const cells = [];
  for (let i = 0; i < nodes.length; i++) {
    const rawLeft = edges[i], rawRight = edges[i + 1];
    const rawWidth = rawRight - rawLeft;
    if (!(rawWidth > EPS)) return null;
    const left = clamp(rawLeft, sensorMin, sensorMax);
    const right = clamp(rawRight, sensorMin, sensorMax);
    if (!(right - left > EPS)) continue;
    // Keep the density of the full ray tube. Dividing by the clipped width
    // would renormalize off-sensor power back onto the camera.
    cells.push({ left, right, density: nodes[i].power / rawWidth, hit: nodes[i], piece: null });
  }
  const piece = { nodes, cells };
  for (const cell of cells) cell.piece = piece;
  return piece;
}

function sanitizeHits(hits, aperture) {
  const half = aperture / 2;
  return hits.flatMap((raw, index) => {
    const power = Number(raw?.power);
    const u = Number(raw?.u);
    const rawX = Number(raw?.x);
    const x = Number.isFinite(rawX) ? rawX : Number.isFinite(u) ? (u - 0.5) * aperture : NaN;
    const wavelength = Number(raw?.wl);
    if (!(power > POWER_EPS) || !Number.isFinite(x) || !Number.isFinite(wavelength) || !(wavelength > 0)) return [];
    const sample = Number.isInteger(raw.sample) ? raw.sample : null;
    const sampleCount = Number.isInteger(raw.sampleCount) ? raw.sampleCount : null;
    const sampleGrid = raw.sampleGrid === 'edges' ? 'edges' : null;
    // The tracer historically gives every spatial ray equal weight. For a
    // grid whose first/last rays are the authored beam boundaries, convert
    // those samples to trapezoidal quadrature locally at the camera: half
    // weight at the edges, full weight inside, with the complete route still
    // summing to exactly the traced power.
    const gridScale = sampleGrid === 'edges' && sampleCount > 1 && sample !== null
      ? sampleCount / (sampleCount - 1) * (sample === 0 || sample === sampleCount - 1 ? 0.5 : 1)
      : 1;
    const sensorMiss = raw?.sensorMiss === true;
    return [{
      ...raw,
      index,
      power: power * gridScale,
      // A near-miss ray supplies the adjacent tube boundary and wavefront
      // slope, but its centre is deliberately allowed outside the finite
      // face. Ordinary detector hits remain clamped against roundoff.
      x: sensorMiss ? x : clamp(x, -half, half),
      wl: wavelength,
      sample,
      sampleCount,
      sampleGrid,
      pathKey: raw.pathKey == null ? `point-${index}` : String(raw.pathKey),
      sourceId: raw.sourceId == null ? `source-${index}` : String(raw.sourceId),
      coherenceId: raw.coherenceId == null ? null : String(raw.coherenceId),
      jonesState: normalizedJones(raw),
      sensorMiss,
    }];
  });
}

function routeFromHits(key, hits, pixelCount, sensorMin, sensorMax) {
  const pixelWidth = (sensorMax - sensorMin) / pixelCount;
  const profile = Array(pixelCount).fill(0);
  const pieces = [];
  let firstMoment = 0;
  let fallback = false;
  for (const run of contiguousRuns(hits)) {
    const piece = finiteTubePiece(run, sensorMin, sensorMax);
    if (piece) {
      pieces.push(piece);
      for (const cell of piece.cells) {
        depositCell(cell, profile, pixelWidth, sensorMin);
        firstMoment += cell.density * (cell.right ** 2 - cell.left ** 2) / 2;
      }
    } else {
      fallback = true;
      for (const hit of run) {
        const deposited = depositPoint(hit, profile, pixelWidth, sensorMin);
        firstMoment += deposited * clamp(hit.x, sensorMin, sensorMax);
      }
    }
  }
  const first = hits[0];
  const jones = first.jonesState;
  const phaseEligible = !fallback
    && pieces.length > 0
    && first.coherenceId !== null
    && hits.every(hit => hit.phaseValid === true && Number.isFinite(hit.oplMm)
      && hit.coherenceId === first.coherenceId && sameJones(jones, hit.jonesState));
  return {
    key,
    hits,
    profile,
    pieces,
    fallback,
    phaseEligible,
    coherenceId: first.coherenceId,
    sourceId: first.sourceId,
    pathKey: first.pathKey,
    wavelength: first.wl,
    continuum: Boolean(first.spectralContinuum || first.spec || first.bw > 0),
    jones,
    power: totalOf(profile),
    firstMoment,
  };
}

function activeCell(mode, x) {
  for (const piece of mode.pieces) {
    for (const cell of piece.cells) {
      if (x >= cell.left - EPS && x <= cell.right + EPS) return cell;
    }
  }
  return null;
}

function oplLine(piece, x) {
  const nodes = piece.nodes;
  let left = nodes[0], right = nodes[1];
  if (x >= nodes[nodes.length - 1].x) {
    left = nodes[nodes.length - 2]; right = nodes[nodes.length - 1];
  } else if (x > nodes[0].x) {
    for (let i = 0; i < nodes.length - 1; i++) {
      if (x <= nodes[i + 1].x) { left = nodes[i]; right = nodes[i + 1]; break; }
    }
  }
  const slope = (right.oplMm - left.oplMm) / (right.x - left.x);
  return { value: left.oplMm + slope * (x - left.x), slope };
}

function supportsOverlap(a, b) {
  for (const pa of a.pieces) for (const ca of pa.cells) {
    for (const pb of b.pieces) for (const cb of pb.cells) {
      if (Math.min(ca.right, cb.right) - Math.max(ca.left, cb.left) > EPS) return true;
    }
  }
  return false;
}

function sinc(value) {
  if (Math.abs(value) < 1e-6) {
    const square = value * value;
    return 1 - square / 6 + square * square / 120;
  }
  return Math.sin(value) / value;
}

function coherentGroupProfile(modes, baseline, pixelCount, sensorMin, sensorMax) {
  const profile = [...baseline];
  const supportIntervals = [];
  const referenceOpl = Math.min(...modes.flatMap(mode => mode.hits.map(hit => hit.oplMm)));
  const pixelWidth = (sensorMax - sensorMin) / pixelCount;
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const pixelLeft = sensorMin + pixel * pixelWidth;
    const pixelRight = pixelLeft + pixelWidth;
    const points = [pixelLeft, pixelRight];
    for (const mode of modes) for (const piece of mode.pieces) {
      for (const cell of piece.cells) {
        if (cell.left > pixelLeft + EPS && cell.left < pixelRight - EPS) points.push(cell.left);
        if (cell.right > pixelLeft + EPS && cell.right < pixelRight - EPS) points.push(cell.right);
      }
      for (const node of piece.nodes) if (node.x > pixelLeft + EPS && node.x < pixelRight - EPS) points.push(node.x);
    }
    points.sort((a, b) => a - b);
    const unique = points.filter((point, index) => index === 0 || point - points[index - 1] > EPS);
    for (let interval = 0; interval < unique.length - 1; interval++) {
      const left = unique[interval], right = unique[interval + 1], length = right - left;
      if (!(length > EPS)) continue;
      const midpoint = (left + right) / 2;
      const fields = [];
      for (const mode of modes) {
        const cell = activeCell(mode, midpoint);
        if (!cell) continue;
        const line = oplLine(cell.piece, midpoint);
        const waveNumber = 2 * Math.PI / (mode.wavelength * 1e-6);
        fields.push({
          amplitude: Math.sqrt(Math.max(0, cell.density)),
          beta: waveNumber * line.slope,
          phase: waveNumber * (line.value - referenceOpl),
          jones: mode.jones,
        });
      }
      const diagonalPower = fields.reduce((sum, field) => sum + field.amplitude ** 2 * length, 0);
      let intervalPower = diagonalPower;
      for (let m = 1; m < fields.length; m++) for (let n = 0; n < m; n++) {
        const fm = fields[m], fn = fields[n];
        const overlap = jonesOverlap(fn.jones, fm.jones);
        const phase = fm.phase - fn.phase;
        const beta = fm.beta - fn.beta;
        const apertureAverage = length * sinc(beta * length / 2);
        const realVisibility = overlap.re * Math.cos(phase) - overlap.im * Math.sin(phase);
        const crossTerm = 2 * fm.amplitude * fn.amplitude * apertureAverage * realVisibility;
        profile[pixel] += crossTerm;
        intervalPower += crossTerm;
      }
      // Numerical dark-port residue is filtered once, against the final
      // camera signal below. Preserve every locally positive interval here
      // so a real but strongly cancelled field cannot report a zero diameter.
      if (intervalPower > 0) supportIntervals.push([left, right]);
    }
  }
  const scale = Math.max(1, totalOf(baseline));
  if (profile.some(value => !Number.isFinite(value) || value < -1e-9 * scale)) return null;
  return {
    profile: profile.map(value => value < 0 ? 0 : value),
    supportIntervals,
  };
}

/**
 * Convert detector hits into a conservative, finite-pixel camera reading.
 * `aperture` and all optical path lengths are millimetres; wavelength is nm.
 */
export function cameraProfileFromHits(hits, pixelCount, aperture, { interference = true } = {}) {
  const count = clamp(Math.round(Number(pixelCount) || 16), 1, 4096);
  const sensorAperture = Math.max(EPS, Number(aperture) || 1);
  const sensorMin = -sensorAperture / 2, sensorMax = sensorAperture / 2;
  const clean = sanitizeHits(Array.isArray(hits) ? hits : [], sensorAperture);
  const routeGroups = new Map();
  for (const hit of clean) {
    const key = `${hit.sourceId}|${hit.pathKey}|${hit.wl.toFixed(9)}|${hit.sampleCount ?? 'point'}|${hit.sampleGrid || 'centres'}`;
    if (!routeGroups.has(key)) routeGroups.set(key, []);
    routeGroups.get(key).push(hit);
  }
  const routes = [...routeGroups].map(([key, routeHits]) => routeFromHits(key, routeHits, count, sensorMin, sensorMax));
  const depositedProfile = Array(count).fill(0);
  const wavelengthProfiles = new Map();
  const sourceSpectralProfiles = new Map();
  const depositedSourceSpectralProfiles = new Map();
  for (const route of routes) {
    addProfile(depositedProfile, route.profile);
    addSpectralProfile(wavelengthProfiles, route.wavelength, route.profile);
    addSourceSpectralProfile(sourceSpectralProfiles, route.sourceId, route.wavelength, route.continuum, route.pathKey, route.profile);
    addSourceSpectralProfile(depositedSourceSpectralProfiles, route.sourceId, route.wavelength, route.continuum, route.pathKey, route.profile);
  }
  const profile = [...depositedProfile];
  const depositedFirstMoment = routes.reduce((sum, route) => sum + route.firstMoment, 0);
  let pathCount = 0, coherentSources = 0, applied = false;
  let fallbackReason = null;
  const appliedRouteKeys = new Set();
  const coherentSupportIntervals = [];
  const coherenceGroups = new Map();
  for (const route of routes.filter(route => route.coherenceId !== null)) {
    const key = `${route.coherenceId}|${route.wavelength.toFixed(9)}`;
    if (!coherenceGroups.has(key)) coherenceGroups.set(key, []);
    coherenceGroups.get(key).push(route);
  }
  if (interference) for (const groupRoutes of coherenceGroups.values()) {
    // One unknown route from a source makes that source's field incomplete:
    // it could interfere with every supported route. Keep the entire source
    // on its conservative deposited baseline instead of summing a plausible
    // subset and calling the result coherent.
    if (groupRoutes.some(route => !route.phaseEligible)) {
      const issue = groupRoutes.flatMap(route => route.hits)
        .map(hit => hit.phaseIssue)
        .find(Boolean);
      fallbackReason = fallbackReason || issue || 'a coherent route could not be reconstructed continuously';
      continue;
    }
    const modes = groupRoutes;
    if (modes.length > MAX_COHERENT_MODES) {
      fallbackReason = fallbackReason || `more than ${MAX_COHERENT_MODES} coherent paths`;
      continue;
    }
    const overlapping = modes.length >= 2 && modes.some((mode, index) => modes.slice(index + 1).some(other => supportsOverlap(mode, other)));
    if (!overlapping) continue;
    const baseline = Array(count).fill(0);
    for (const mode of modes) addProfile(baseline, mode.profile);
    const coherent = coherentGroupProfile(modes, baseline, count, sensorMin, sensorMax);
    if (!coherent) { fallbackReason = fallbackReason || 'non-finite coherent reconstruction'; continue; }
    addProfile(profile, baseline, -1);
    addProfile(profile, coherent.profile);
    addSpectralProfile(wavelengthProfiles, modes[0].wavelength, baseline, -1);
    addSpectralProfile(wavelengthProfiles, modes[0].wavelength, coherent.profile);
    addSourceSpectralProfile(sourceSpectralProfiles, modes[0].sourceId, modes[0].wavelength, false, null, baseline, -1);
    addSourceSpectralProfile(sourceSpectralProfiles, modes[0].sourceId, modes[0].wavelength, false, null, coherent.profile);
    modes.forEach(mode => appliedRouteKeys.add(mode.key));
    if (totalOf(coherent.profile) > POWER_EPS) {
      coherentSupportIntervals.push(...coherent.supportIntervals);
    }
    applied = true;
    coherentSources++;
    pathCount += modes.length;
  }
  const finalProfile = profile.map(value => Number.isFinite(value) && value > 0 ? value : 0);
  const signal = totalOf(finalProfile);
  const excludedRoutes = routes.filter(route => route.coherenceId !== null && !route.phaseEligible);
  const excluded = excludedRoutes.flatMap(route => route.hits);
  const phaseIssues = [...new Set(excluded.map(hit => hit.phaseIssue).filter(Boolean))];
  const partial = applied && (excluded.length > 0 || Boolean(fallbackReason));
  const pixelWidth = sensorAperture / count;
  const centroid = signal <= POWER_EPS ? null
    : applied
      ? finalProfile.reduce((sum, value, pixel) => sum + value * (sensorMin + (pixel + 0.5) * pixelWidth), 0) / signal
      : depositedFirstMoment / Math.max(POWER_EPS, totalOf(depositedProfile));
  const activeSpectralKeys = new Set([...sourceSpectralProfiles]
    .filter(([, entry]) => totalOf(entry.profile) > POWER_EPS)
    .map(([key]) => key));
  let supportMin = Infinity, supportMax = -Infinity;
  for (const [left, right] of coherentSupportIntervals) {
    supportMin = Math.min(supportMin, left);
    supportMax = Math.max(supportMax, right);
  }
  for (const route of routes) {
    if (appliedRouteKeys.has(route.key)) continue;
    const key = sourceSpectralKey(route.sourceId, route.wavelength, route.continuum, route.pathKey);
    if (!activeSpectralKeys.has(key)) continue;
    if (route.pieces.length) {
      for (const piece of route.pieces) for (const cell of piece.cells) {
        supportMin = Math.min(supportMin, cell.left);
        supportMax = Math.max(supportMax, cell.right);
      }
    } else {
      for (const hit of route.hits) {
        if (hit.sensorMiss || hit.x < sensorMin - EPS || hit.x > sensorMax + EPS) continue;
        supportMin = Math.min(supportMin, hit.x);
        supportMax = Math.max(supportMax, hit.x);
      }
    }
  }
  const supportSpan = signal > POWER_EPS && Number.isFinite(supportMin) && Number.isFinite(supportMax)
    ? Math.max(0, supportMax - supportMin)
    : 0;
  return {
    profile: finalProfile,
    depositedProfile,
    depositedSignal: totalOf(depositedProfile),
    profileColors: Array.from({ length: count }, (_, pixel) => mixedColor(wavelengthProfiles, pixel)),
    spectralPowers: spectralTotals(sourceSpectralProfiles),
    depositedSpectralPowers: spectralTotals(depositedSourceSpectralProfiles),
    centroid,
    supportSpan,
    profileMode: applied ? 'coherent' : 'deposited',
    coherentPaths: pathCount,
    interference: {
      applied,
      partial,
      coherentSources,
      pathCount,
      excludedHits: excluded.length,
      phaseIssues,
      fallbackReason,
      reason: !interference ? 'disabled'
        : applied ? (partial
          ? 'supported paths interfere; other paths use deposited intensity'
          : 'same-source paths overlap on the sensor')
          : fallbackReason || phaseIssues[0] || 'insufficient coherent overlap',
    },
  };
}
