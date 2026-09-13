// A qualitative ray-arrival preview, not a voxel or focus calculation.
// One marker represents each independently programmed order or lenslet, while
// its full traced support remains available for drawing when it is defocused.
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
