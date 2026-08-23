// Geometry helpers for editable closed boundaries. Straight polygons remain
// the default. A point with `arc: true` is a point on the circular arc between
// the preceding and following anchors, matching the compact three-point
// construction used by Ray Optics.

const EPS = 1e-7;
const TAU = Math.PI * 2;
export const MAX_POLYGON_POINTS = 64;

const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const copyPoint = p => ({ x: p.x, y: p.y });
const copyBoundaryPoint = p => ({ x: p.x, y: p.y, ...(p.arc === true ? { arc: true } : {}) });
const isArcPoint = p => p?.arc === true;
const wrapAngle = angle => ((angle % TAU) + TAU) % TAU;

export function polygonArea(points) {
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return twiceArea / 2;
}

export function polygonBounds(points) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return {
    x0: Math.min(...xs), x1: Math.max(...xs),
    y0: Math.min(...ys), y1: Math.max(...ys),
  };
}

// The unique circular arc from a to b that passes through `through`.
// `sweep` is signed in canvas coordinates: positive follows increasing
// atan2 angles and negative follows decreasing angles.
export function circularArcThrough(a, through, b) {
  if (![a, through, b].every(finitePoint)) return null;
  const d = 2 * (
    a.x * (through.y - b.y)
    + through.x * (b.y - a.y)
    + b.x * (a.y - through.y)
  );
  if (Math.abs(d) <= EPS) return null;
  const aa = a.x * a.x + a.y * a.y;
  const cc = through.x * through.x + through.y * through.y;
  const bb = b.x * b.x + b.y * b.y;
  const cx = (
    aa * (through.y - b.y)
    + cc * (b.y - a.y)
    + bb * (a.y - through.y)
  ) / d;
  const cy = (
    aa * (b.x - through.x)
    + cc * (a.x - b.x)
    + bb * (through.x - a.x)
  ) / d;
  const r = Math.hypot(a.x - cx, a.y - cy);
  if (![cx, cy, r].every(Number.isFinite) || r <= EPS) return null;

  const start = Math.atan2(a.y - cy, a.x - cx);
  const middle = Math.atan2(through.y - cy, through.x - cx);
  const end = Math.atan2(b.y - cy, b.x - cx);
  const positiveEnd = wrapAngle(end - start);
  const positiveMiddle = wrapAngle(middle - start);
  const sweep = positiveMiddle <= positiveEnd + EPS ? positiveEnd : positiveEnd - TAU;
  if (!Number.isFinite(sweep) || Math.abs(sweep) <= EPS || Math.abs(sweep) >= TAU - EPS) return null;
  return { cx, cy, r, start, sweep };
}

export function arcPointAt(arc, t) {
  const angle = arc.start + arc.sweep * t;
  return { x: arc.cx + arc.r * Math.cos(angle), y: arc.cy + arc.r * Math.sin(angle) };
}

// Returns the normalized location on an arc, or null when the point's angle
// lies outside the directed sweep.
export function arcParameterAtPoint(arc, point, tolerance = 1e-7) {
  if (!arc || !finitePoint(point)) return null;
  const angle = Math.atan2(point.y - arc.cy, point.x - arc.cx);
  if (arc.sweep > 0) {
    const delta = wrapAngle(angle - arc.start);
    if (delta > arc.sweep + tolerance) return null;
    return Math.min(1, Math.max(0, delta / arc.sweep));
  }
  const delta = wrapAngle(arc.start - angle);
  if (delta > -arc.sweep + tolerance) return null;
  return Math.min(1, Math.max(0, delta / -arc.sweep));
}

function validBoundaryStructure(points, closed) {
  if (!Array.isArray(points) || points.length < (closed ? 3 : 1)
      || points.length > MAX_POLYGON_POINTS || points.some(p => !finitePoint(p))
      || isArcPoint(points[0]) || (!closed && isArcPoint(points.at(-1)))) return false;
  const anchorCount = points.filter(p => !isArcPoint(p)).length;
  if (anchorCount < (closed ? 3 : 1)) return false;
  for (let i = 0; i < points.length; i++) {
    if (!isArcPoint(points[i])) continue;
    const prev = i > 0 ? points[i - 1] : (closed ? points.at(-1) : null);
    const next = i + 1 < points.length ? points[i + 1] : (closed ? points[0] : null);
    if (!prev || !next || isArcPoint(prev) || isArcPoint(next)) return false;
  }
  return true;
}

// Converts a mixed straight/arc point array into one logical outgoing segment
// per anchor. Degenerate collinear arc controls safely fall back to a line.
export function boundarySegments(points, { closed = true } = {}) {
  if (!validBoundaryStructure(points, closed)) return [];
  const segments = [];
  let i = 0;
  let guard = 0;
  while (guard++ <= points.length) {
    const a = points[i];
    let j = i + 1;
    if (!closed && j >= points.length) break;
    j %= points.length;
    if (isArcPoint(points[j])) {
      let k = j + 1;
      if (!closed && k >= points.length) break;
      k %= points.length;
      const b = points[k];
      const arc = circularArcThrough(a, points[j], b);
      segments.push({
        kind: arc ? 'arc' : 'line', a, b, through: points[j], arc,
        anchorIndex: i, controlIndex: j, endIndex: k,
      });
      i = k;
    } else {
      segments.push({ kind: 'line', a, b: points[j], anchorIndex: i, endIndex: j });
      i = j;
    }
    if (closed ? i === 0 : i >= points.length - 1) break;
  }
  return segments;
}

export function sampleBoundary(points, { closed = true, maxAngle = Math.PI / 48 } = {}) {
  const segments = boundarySegments(points, { closed });
  if (!segments.length) return [];
  const sampled = [copyPoint(segments[0].a)];
  for (const segment of segments) {
    if (segment.kind !== 'arc') {
      sampled.push(copyPoint(segment.b));
      continue;
    }
    const count = Math.max(2, Math.ceil(Math.abs(segment.arc.sweep) / maxAngle));
    for (let i = 1; i <= count; i++) sampled.push(arcPointAt(segment.arc, i / count));
  }
  if (closed && sampled.length > 1
      && Math.hypot(sampled[0].x - sampled.at(-1).x, sampled[0].y - sampled.at(-1).y) <= EPS) {
    sampled.pop();
  }
  return sampled;
}

export function boundaryBounds(points) {
  const segments = boundarySegments(points);
  if (!segments.length) return polygonBounds(points);
  const extrema = [];
  for (const segment of segments) {
    extrema.push(segment.a, segment.b);
    if (segment.kind !== 'arc') continue;
    for (const angle of [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]) {
      const point = { x: segment.arc.cx + segment.arc.r * Math.cos(angle), y: segment.arc.cy + segment.arc.r * Math.sin(angle) };
      if (arcParameterAtPoint(segment.arc, point) !== null) extrema.push(point);
    }
  }
  return polygonBounds(extrema);
}

export function boundaryPathData(points, { closed = true, digits = 2 } = {}) {
  const segments = boundarySegments(points, { closed });
  if (!segments.length) return '';
  const f = value => Number(value.toFixed(digits));
  let d = `M ${f(segments[0].a.x)} ${f(segments[0].a.y)}`;
  for (const segment of segments) {
    if (segment.kind === 'arc') {
      d += ` A ${f(segment.arc.r)} ${f(segment.arc.r)} 0 ${Math.abs(segment.arc.sweep) > Math.PI ? 1 : 0} ${segment.arc.sweep > 0 ? 1 : 0} ${f(segment.b.x)} ${f(segment.b.y)}`;
    } else {
      d += ` L ${f(segment.b.x)} ${f(segment.b.y)}`;
    }
  }
  return closed ? `${d} Z` : d;
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a, b, p) {
  return Math.abs(orientation(a, b, p)) <= EPS
    && p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS
    && p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  if (((o1 > EPS && o2 < -EPS) || (o1 < -EPS && o2 > EPS))
      && ((o3 > EPS && o4 < -EPS) || (o3 < -EPS && o4 > EPS))) return true;
  return (Math.abs(o1) <= EPS && onSegment(a, b, c))
    || (Math.abs(o2) <= EPS && onSegment(a, b, d))
    || (Math.abs(o3) <= EPS && onSegment(c, d, a))
    || (Math.abs(o4) <= EPS && onSegment(c, d, b));
}

function isSimpleLoop(points, { minEdge = 0.25, minArea = 0.5, maxPoints = Infinity } = {}) {
  if (!Array.isArray(points) || points.length < 3 || points.length > maxPoints
      || points.some(p => !finitePoint(p))) return false;
  if (Math.abs(polygonArea(points)) < minArea) return false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (Math.hypot(b.x - a.x, b.y - a.y) < minEdge) return false;
  }
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    for (let j = i + 1; j < points.length; j++) {
      if (j === i || j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j], d = points[(j + 1) % points.length];
      if (segmentsIntersect(a, b, c, d)) return false;
    }
  }
  return true;
}

export function isSimplePolygon(points, { minEdge = 0.25, minArea = 0.5 } = {}) {
  return isSimpleLoop(points, { minEdge, minArea, maxPoints: MAX_POLYGON_POINTS });
}

function isSimpleOpenBoundary(points, minEdge = 0.25) {
  if (!validBoundaryStructure(points, false)) return false;
  const sampled = sampleBoundary(points, { closed: false });
  if (!sampled.length) return points.length === 1;
  for (let i = 0; i < sampled.length - 1; i++) {
    if (Math.hypot(sampled[i + 1].x - sampled[i].x, sampled[i + 1].y - sampled[i].y) < Math.min(minEdge, 1e-4)) return false;
  }
  for (let i = 0; i < sampled.length - 1; i++) {
    for (let j = i + 2; j < sampled.length - 1; j++) {
      if (segmentsIntersect(sampled[i], sampled[i + 1], sampled[j], sampled[j + 1])) return false;
    }
  }
  return true;
}

export function isSimpleBoundary(points, { minArea = 0.5 } = {}) {
  if (!validBoundaryStructure(points, true)) return false;
  const sampled = sampleBoundary(points);
  // Arc sampling can legitimately produce more points than the compact,
  // user-editable representation is allowed to store.
  return isSimpleLoop(sampled, { minEdge: 1e-5, minArea });
}

// Commits one construction gesture. A click adds one straight anchor; a
// press-drag adds the pressed point as an on-arc control and the release point
// as the next anchor.
export function appendBoundaryGesture(points, press, release, curved = false) {
  if (!Array.isArray(points) || !finitePoint(press) || !finitePoint(release)) return null;
  const candidate = points.map(copyBoundaryPoint);
  if (curved) candidate.push({ x: press.x, y: press.y, arc: true });
  candidate.push({ x: release.x, y: release.y });
  return isSimpleOpenBoundary(candidate) ? candidate : null;
}

// True when a new open-polyline edge would cross an earlier edge. The closing
// edge is validated separately by isSimplePolygon when construction finishes.
export function canAppendPolygonPoint(points, point, minEdge = 0.25) {
  if (!finitePoint(point) || points.length >= MAX_POLYGON_POINTS) return false;
  if (!points.length) return true;
  const last = points[points.length - 1];
  if (Math.hypot(point.x - last.x, point.y - last.y) < minEdge) return false;
  if (points.length < 2) return true;
  for (let i = 0; i < points.length - 2; i++) {
    if (segmentsIntersect(points[i], points[i + 1], last, point)) return false;
  }
  return true;
}

export function normalizePolygonPoints(value, fallback = [], limit = 5000) {
  const fallbackCopy = () => fallback.map(copyPoint);
  if (!Array.isArray(value)) return fallbackCopy();
  const points = [];
  for (const raw of value.slice(0, MAX_POLYGON_POINTS)) {
    if (!finitePoint(raw)) continue;
    const p = {
      x: Math.min(limit, Math.max(-limit, raw.x)),
      y: Math.min(limit, Math.max(-limit, raw.y)),
    };
    const prev = points[points.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) >= 0.25) points.push(p);
  }
  if (points.length > 2 && Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) < 0.25) points.pop();
  return isSimplePolygon(points) ? points : fallbackCopy();
}

export function normalizeBoundaryPoints(value, fallback = [], limit = 5000) {
  const fallbackCopy = () => fallback.map(copyBoundaryPoint);
  if (!Array.isArray(value)) return fallbackCopy();
  const points = [];
  for (const raw of value.slice(0, MAX_POLYGON_POINTS)) {
    if (!finitePoint(raw)) continue;
    const point = {
      x: Math.min(limit, Math.max(-limit, raw.x)),
      y: Math.min(limit, Math.max(-limit, raw.y)),
      ...(raw.arc === true ? { arc: true } : {}),
    };
    const prev = points.at(-1);
    if (!prev || Math.hypot(point.x - prev.x, point.y - prev.y) >= 0.25) points.push(point);
  }
  if (points.length > 2 && !isArcPoint(points.at(-1))
      && Math.hypot(points[0].x - points.at(-1).x, points[0].y - points.at(-1).y) < 0.25) {
    points.pop();
  }
  return isSimpleBoundary(points) ? points : fallbackCopy();
}

export function pointInPolygon(point, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    const crosses = ((a.y > point.y) !== (b.y > point.y))
      && point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || EPS) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function pointInBoundary(point, points) {
  return pointInPolygon(point, sampleBoundary(points, { maxAngle: Math.PI / 90 }));
}
