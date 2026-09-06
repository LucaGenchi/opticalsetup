// Ideal regular polygon mirror, viewed in the plane of rotation. All drawn
// facets are real traced surfaces; there is no invented pivoting scan plane.
const bounded = (value, fallback, min, max) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));

export function polygonScannerState(params = {}, timeSeconds = 0) {
  const facets = Math.round(bounded(params.facets, 12, 3, 72));
  const rpm = bounded(params.rpm, 1000, 0, 60000);
  const diameter = bounded(params.diameter, 60, 10, 200);
  const duty = bounded(params.dutyCycle, 71, 0, 100) / 100;
  const phase = bounded(params.scanPhase, 50, 0, 100) / 100;
  const lineRateHz = facets * rpm / 60;
  // Reduce time before multiplication to keep even extreme finite input safe.
  const t = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  const cycle = params.scanMode === 'static' || !lineRateHz
    ? phase : (t % (1 / lineRateHz)) * lineRateHz + phase;
  const fraction = ((cycle % 1) + 1) % 1;
  const angle = (fraction - 0.5) * 2 * Math.PI / facets;
  const active = duty > 0 && (duty === 1 || Math.abs(fraction - 0.5) < duty / 2);
  return { facets, rpm, diameter, duty, fraction, angle, active, lineRateHz };
}

export function polygonScannerVertices(params = {}, timeSeconds = 0) {
  const { facets, diameter, angle } = polygonScannerState(params, timeSeconds);
  return Array.from({ length: facets }, (_, i) => {
    const a = Math.PI - Math.PI / facets + i * 2 * Math.PI / facets + angle;
    return { x: diameter / 2 * Math.cos(a), y: diameter / 2 * Math.sin(a) };
  });
}

export function polygonScannerSurfaces(params = {}, timeSeconds = 0) {
  const { active } = polygonScannerState(params, timeSeconds);
  const vertices = polygonScannerVertices(params, timeSeconds);
  return vertices.map((a, i) => {
    const b = vertices[(i + 1) % vertices.length];
    return {
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      // Outside the scan window this is an ideal synchronized beam blanker,
      // not a prediction of facet-edge scatter or a proprietary controller.
      kind: active ? 'mirror' : 'absorb',
      data: { refl: bounded(params.refl, 98, 0, 100), opaque: true },
    };
  });
}
