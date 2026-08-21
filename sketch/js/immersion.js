// Derived objective-to-target immersion couplings.
//
// A coupling is deliberately scene-derived: the objective owns the medium,
// while a compatible sample surface or fiber end merely provides a contact.
// Nothing here moves an element or creates save-file state.

import { registry } from './elements.js';
import {
  OBJECTIVE_MEDIA,
  objectiveFocalLength,
  objectiveMediumIndex,
  objectiveMediumKey,
  objectivePupilDiameter,
} from './objective.js';
import { esc, rotPt, toWorld } from './util.js';

const GEOMETRY_EPSILON = 1e-7;
const TIE_EPSILON = 1e-5;
const FIBER_FACING_COS = Math.cos(20 * Math.PI / 180);

const finite = value => typeof value === 'number' && Number.isFinite(value);
const finitePoint = point => point && finite(point.x) && finite(point.y);
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (point, scalar) => ({ x: point.x * scalar, y: point.y * scalar });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const cross = (a, b) => a.x * b.y - a.y * b.x;
const length = vector => Math.hypot(vector.x, vector.y);
const normal = vector => ({ x: -vector.y, y: vector.x });
const unit = vector => {
  const magnitude = length(vector);
  return magnitude > GEOMETRY_EPSILON && finite(magnitude)
    ? { x: vector.x / magnitude, y: vector.y / magnitude }
    : null;
};

function safeHook(hook, value) {
  if (typeof hook !== 'function') return null;
  try {
    return hook(value);
  } catch {
    return null;
  }
}

function localObjectiveSource(objective) {
  const def = registry[objective?.type];
  const declared = safeHook(def?.immersionSource, objective);
  if (finitePoint(declared)) return declared;
  if (finitePoint(def?.snapPt)) return def.snapPt;
  return { x: 0, y: 0 };
}

function objectiveFrame(objective) {
  if (!objective || !finite(objective.x) || !finite(objective.y)) return null;
  const localSource = localObjectiveSource(objective);
  const source = toWorld(objective, localSource.x, localSource.y);
  const forward = unit(rotPt(1, 0, finite(objective.rot) ? objective.rot : 0));
  if (!finitePoint(source) || !finitePoint(forward)) return null;
  const workingDistance = objectiveFocalLength(objective.params || {});
  const reach = Math.min(250, Math.max(10, 1.5 * workingDistance));
  return finite(reach) ? { source, forward, reach } : null;
}

function normalizeSegment(raw) {
  if (Array.isArray(raw) && raw.length >= 2 && finitePoint(raw[0]) && finitePoint(raw[1])) {
    return { a: raw[0], b: raw[1] };
  }
  if (finitePoint(raw?.a) && finitePoint(raw?.b)) return { a: raw.a, b: raw.b };
  if (raw && [raw.x1, raw.y1, raw.x2, raw.y2].every(finite)) {
    return { a: { x: raw.x1, y: raw.y1 }, b: { x: raw.x2, y: raw.y2 } };
  }
  return null;
}

function worldContactSegments(element) {
  const raw = safeHook(registry[element?.type]?.immersionContact, element);
  const single = normalizeSegment(raw);
  const declared = single ? [single] : Array.isArray(raw) ? raw.map(normalizeSegment).filter(Boolean) : [];
  return declared.map(segment => ({
    a: toWorld(element, segment.a.x, segment.a.y),
    b: toWorld(element, segment.b.x, segment.b.y),
  })).filter(segment => finitePoint(segment.a) && finitePoint(segment.b));
}

function worldSurfaceSegments(element) {
  const declared = safeHook(registry[element?.type]?.surfaces, element);
  if (!Array.isArray(declared)) return [];
  return declared.map(normalizeSegment).filter(Boolean).map(segment => ({
    a: toWorld(element, segment.a.x, segment.a.y),
    b: toWorld(element, segment.b.x, segment.b.y),
  })).filter(segment => finitePoint(segment.a) && finitePoint(segment.b));
}

// Exact intersection of a forward ray p + t*r with a finite segment a + u*s.
// Collinear contacts are intentionally rejected: there is no unique contact
// point from which to derive a finite liquid bridge.
function raySegmentIntersection(frame, segment) {
  const span = sub(segment.b, segment.a);
  const denominator = cross(frame.forward, span);
  if (!finite(denominator) || Math.abs(denominator) <= GEOMETRY_EPSILON) return null;
  const offset = sub(segment.a, frame.source);
  const distance = cross(offset, span) / denominator;
  const alongSegment = cross(offset, frame.forward) / denominator;
  if (!finite(distance) || !finite(alongSegment)) return null;
  if (distance <= GEOMETRY_EPSILON || distance > frame.reach + GEOMETRY_EPSILON) return null;
  if (alongSegment < -GEOMETRY_EPSILON || alongSegment > 1 + GEOMETRY_EPSILON) return null;
  const contact = add(frame.source, mul(frame.forward, distance));
  return finitePoint(contact) ? { contact, distance } : null;
}

function elementCandidates(objective, element) {
  if (!element || typeof element.id !== 'string' || element.id === objective.id) return [];
  const frame = objectiveFrame(objective);
  if (!frame) return [];
  return worldContactSegments(element).map((segment, targetPort) => {
    const hit = raySegmentIntersection(frame, segment);
    if (!hit) return null;
    return {
      targetKind: 'element',
      targetId: element.id,
      targetType: element.type,
      targetEnd: null,
      targetPort,
      targetKey: `element:${element.id}:${targetPort}`,
      target: element,
      targetSegment: segment,
      ...hit,
    };
  }).filter(Boolean);
}

function fiberEndpoint(beam, end) {
  const points = Array.isArray(beam?.pts) ? beam.pts : [];
  if (points.length < 2) return null;
  const endpointIndex = end === 0 ? 0 : points.length - 1;
  const step = end === 0 ? 1 : -1;
  const contact = points[endpointIndex];
  if (!finitePoint(contact)) return null;
  for (let index = endpointIndex + step; index >= 0 && index < points.length; index += step) {
    if (!finitePoint(points[index])) continue;
    const inward = unit(sub(points[index], contact));
    if (inward) return { contact: { x: contact.x, y: contact.y }, inward };
  }
  return null;
}

function fiberCandidate(objective, beam, end) {
  if (!beam || beam.kind !== 'fiber' || typeof beam.id !== 'string') return null;
  const frame = objectiveFrame(objective);
  const endpoint = fiberEndpoint(beam, end);
  if (!frame || !endpoint) return null;

  // An objective-facing fiber continues away from the objective at its
  // contacted end. Its finite end face must also overlap the objective axis;
  // proximity to an arbitrary point on the cable body is not a coupling.
  if (dot(frame.forward, endpoint.inward) < FIBER_FACING_COS) return null;
  const offset = sub(endpoint.contact, frame.source);
  const axialDistance = dot(offset, frame.forward);
  const distance = length(offset);
  const connectorHalfWidth = beam.bare
    ? Math.max(0.5, (finite(beam.width) ? beam.width : 4) / 2)
    : Math.max(0.5, ((finite(beam.width) ? beam.width : 4) + 6) / 2);
  const lateralDistance = Math.abs(cross(frame.forward, offset));
  if (!finite(distance) || axialDistance <= GEOMETRY_EPSILON || distance > frame.reach + GEOMETRY_EPSILON) return null;
  if (lateralDistance > connectorHalfWidth + GEOMETRY_EPSILON) return null;

  return {
    targetKind: 'fiber',
    targetId: beam.id,
    targetType: 'fiber',
    targetEnd: end,
    targetKey: `fiber:${beam.id}:${end}`,
    target: beam,
    targetSegment: null,
    contact: endpoint.contact,
    distance,
  };
}

function candidateIsBlocked(objective, candidate, elements) {
  const frame = objectiveFrame(objective);
  if (!frame) return true;
  const blockedFrame = { ...frame, reach: Math.min(frame.reach, candidate.distance) };
  for (const element of elements) {
    if (!element || element.id === objective.id) continue;
    if (candidate.targetKind === 'element' && element.id === candidate.targetId) continue;
    // Eligible specimen bodies occlude at their visible external faces,
    // while every other physical optic contributes its traced surfaces.
    // Using both avoids letting a moving unselected sample intrude into a
    // locked bridge merely because its optical centre plane is still behind
    // the selected contact.
    const blockers = [...worldSurfaceSegments(element), ...worldContactSegments(element)];
    for (const segment of blockers) {
      const hit = raySegmentIntersection(blockedFrame, segment);
      if (hit && hit.distance < candidate.distance - TIE_EPSILON) return true;
    }
  }
  return false;
}

function candidatesFor(objective, elements, beams) {
  const candidates = [];
  for (const element of elements) {
    if (typeof registry[element?.type]?.immersionContact !== 'function') continue;
    candidates.push(...elementCandidates(objective, element));
  }
  for (const beam of beams) {
    for (const end of [0, 1]) {
      const candidate = fiberCandidate(objective, beam, end);
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates.filter(candidate => !candidateIsBlocked(objective, candidate, elements));
}

function nearestCandidate(candidates) {
  let best = null;
  let ambiguous = false;
  for (const candidate of candidates) {
    if (!best || candidate.distance < best.distance - TIE_EPSILON) {
      best = candidate;
      ambiguous = false;
    } else if (Math.abs(candidate.distance - best.distance) <= TIE_EPSILON) {
      ambiguous = true;
    }
  }
  return { candidate: ambiguous ? null : best, ambiguous };
}

function followCandidate(selected, objective, elements, beams) {
  let candidate = null;
  if (selected.targetKind === 'element') {
    const target = elements.find(element => element?.id === selected.targetId);
    candidate = target
      ? elementCandidates(objective, target).find(value => value.targetKey === selected.targetKey) || null
      : null;
  } else {
    const target = beams.find(beam => beam?.id === selected.targetId);
    candidate = target ? fiberCandidate(objective, target, selected.targetEnd) : null;
  }
  return candidate && !candidateIsBlocked(objective, candidate, elements) ? candidate : null;
}

/**
 * Resolve transient immersion bridges without mutating the scene.
 *
 * Candidate identity is selected against baseElements (normally the authored
 * scene). The matching current element is then re-evaluated, so an animated
 * piezo stage carries its existing coupling instead of making the objective
 * jump to whichever target happens to be closest on that frame.
 */
export function resolveImmersionCouplings(elements = [], beams = [], { baseElements = elements } = {}) {
  const currentElements = Array.isArray(elements) ? elements : [];
  const couplings = new Map();

  for (const objective of currentElements) {
    const status = immersionCouplingStatus(objective, currentElements, beams, { baseElements });
    if (status.state === 'connected') couplings.set(objective.id, status.coupling);
  }
  return couplings;
}

export function immersionCouplingStatus(objective, elements = [], beams = [], { baseElements = elements } = {}) {
  if (objective?.type !== 'objective' || typeof objective.id !== 'string') return { state: 'invalid' };
  const medium = objectiveMediumKey(objective.params || {});
  if (medium === 'air' || medium === 'legacy' || !OBJECTIVE_MEDIA[medium]) return { state: medium, medium };

  const currentElements = Array.isArray(elements) ? elements : [];
  const authoredElements = Array.isArray(baseElements) ? baseElements : currentElements;
  const manualBeams = Array.isArray(beams) ? beams : [];
  const authoredObjective = authoredElements.find(element => element?.id === objective.id && element.type === 'objective') || objective;
  const choice = nearestCandidate(candidatesFor(authoredObjective, authoredElements, manualBeams));
  if (choice.ambiguous) return { state: 'ambiguous', medium };
  if (!choice.candidate) return { state: 'open', medium };

  const selected = choice.candidate;
  const current = followCandidate(selected, objective, currentElements, manualBeams);
  if (!current || current.targetKey !== selected.targetKey) {
    return { state: 'disconnected', medium, targetId: selected.targetId };
  }
  const frame = objectiveFrame(objective);
  if (!frame) return { state: 'invalid', medium };

  return {
    state: 'connected',
    medium,
    coupling: {
      objectiveId: objective.id,
      objective,
      medium,
      refractiveIndex: objectiveMediumIndex(objective.params || {}),
      source: frame.source,
      reach: frame.reach,
      baseDistance: selected.distance,
      ...current,
    },
  };
}

const MEDIUM_STROKES = Object.freeze({
  water: '#2f92bd',
  oil: '#96740f',
  custom: '#4c8e7c',
});

function polygonFor(coupling) {
  if (!finitePoint(coupling?.source) || !finitePoint(coupling?.contact)) return null;
  const direction = unit(sub(coupling.contact, coupling.source));
  if (!direction) return null;
  const side = normal(direction);
  const pupil = objectivePupilDiameter(coupling.objective?.params || {});
  const sourceHalfWidth = Math.min(8, Math.max(1.2, pupil / 4));
  const targetHalfWidth = Math.min(1.8, Math.max(0.6, sourceHalfWidth * 0.22));
  const points = [
    add(coupling.source, mul(side, sourceHalfWidth)),
    add(coupling.contact, mul(side, targetHalfWidth)),
    add(coupling.contact, mul(side, -targetHalfWidth)),
    add(coupling.source, mul(side, -sourceHalfWidth)),
  ];
  return points.every(finitePoint) ? points : null;
}

const pointList = points => points.map(point => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');

export function immersionLayerSVG(elements = [], beams = [], { baseElements = elements } = {}) {
  let svg = '';
  const couplings = resolveImmersionCouplings(elements, beams, { baseElements });
  for (const coupling of couplings.values()) {
    const points = polygonFor(coupling);
    const fill = OBJECTIVE_MEDIA[coupling.medium]?.fill;
    const stroke = MEDIUM_STROKES[coupling.medium];
    if (!points || !fill || !stroke || !finite(coupling.refractiveIndex)) continue;
    svg += `<polygon class="immersion-coupling immersion-${coupling.medium}" ` +
      `data-immersion-objective-id="${esc(coupling.objectiveId)}" data-immersion-medium="${coupling.medium}" ` +
      `data-immersion-index="${coupling.refractiveIndex.toFixed(3)}" points="${pointList(points)}" ` +
      `fill="${fill}" fill-opacity="0.28" stroke="${stroke}" stroke-opacity="0.72" stroke-width="0.8" pointer-events="none"/>`;
  }
  return svg;
}
