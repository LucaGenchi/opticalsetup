// A qualitative ray-arrival preview, not a voxel or focus calculation.
// One marker represents each independently programmed order or lenslet, while
// its full traced support remains available for drawing when it is defocused.
// Physical ports are distinct from the tracer's sample tags: m1w0 and m1w4
// are samples of one order, whereas m-1 and m1 must never share a support.
// Track the route before an array activates grouped previews as well, so a
// DOE upstream of an MLA cannot erase its order identity at the lenslet.
export function arrivalPortState(ray, port, startGroup = false) {
  const arrivalPath = `${ray.arrivalPath || ray.arrivalGroup || ''}/${port}`;
  return { arrivalPath, ...(ray.arrivalGroup || startGroup ? { arrivalGroup: arrivalPath } : {}) };
}

// Interpret only tags belonging to a known physical port. In particular an
// AOD's d1w0/d1w4 share its first order, while a diffuser's d0/d1 are spatial
// quadrature samples of one scattered channel. AOTF spectral selections are
// coaxial in this model; its separately deflected depleted port is not.
export function arrivalOutputPort(kind, tag) {
  switch (kind) {
    case 'mirror': case 'cmirror': case 'split': case 'pbs': case 'dichroic': case 'etalon':
      return tag === 'T' ? 'T' : ['R', 'R0', 'R1'].includes(tag) ? 'R' : null;
    case 'aom': case 'aod':
      return /^d1(?:w\d+)?$/.test(tag) ? 'm1' : /^d0(?:r|off)?$/.test(tag) ? 'm0' : null;
    case 'aotf':
      return tag === 'depleted' ? 'depleted' : /^c\d+$/.test(tag) ? 'selected' : null;
    case 'refract':
      return tag === 'tir' || /-tir$/.test(tag) ? 'R' : 'T';
    default: return null;
  }
}

export function groupArrivalHits(hits) {
  const groups = new Map(), plain = [];
  for (const hit of hits) {
    if (!hit.arrivalGroup) { plain.push(hit); continue; }
    if (![hit.x, hit.y, hit.opl].every(Number.isFinite)) continue;
    const key = `${hit.stageId}:${hit.pulse?.sourceId || ''}:${hit.arrivalGroup}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(hit);
  }
  for (const values of groups.values()) {
    const weights = values.map(hit => Math.min(1, Math.max(0, Number.isFinite(hit.weight)
      ? hit.weight : Number.isFinite(hit.intensity) ? hit.intensity : 0)));
    const total = weights.reduce((a, b) => a + b, 0);
    if (!(total > 0)) continue;
    const x = values.reduce((sum, hit, i) => sum + hit.x * weights[i], 0) / total;
    const y = values.reduce((sum, hit, i) => sum + hit.y * weights[i], 0) / total;
    // Select an ACTUAL arrival nearest the weighted center. A marker cannot
    // silently become an invented focus somewhere between divergent rays.
    const representative = values.reduce((best, hit) =>
      Math.hypot(hit.x - x, hit.y - y) < Math.hypot(best.x - x, best.y - y) ? hit : best);
    const xs = values.map(hit => hit.x), ys = values.map(hit => hit.y);
    const axis = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 'x' : 'y';
    const first = values.reduce((best, hit) => hit[axis] < best[axis] ? hit : best);
    const last = values.reduce((best, hit) => hit[axis] > best[axis] ? hit : best);
    const { weight, ...base } = representative;
    plain.push({ ...base, intensity: Math.min(1, total), arrivalSamples: values.length,
      spreadStart: { x: first.x, y: first.y }, spreadEnd: { x: last.x, y: last.y },
      spreadMm: Math.hypot(last.x - first.x, last.y - first.y),
      oplMin: Math.min(...values.map(hit => hit.opl)), oplMax: Math.max(...values.map(hit => hit.opl)),
    });
  }
  return plain;
}
