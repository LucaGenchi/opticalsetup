// One bounded binary mask model for the DMD face and its traced routing.
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const modulo = value => ((value % 1) + 1) % 1;

export function dmdPatternPhaseAt(params = {}, timeSeconds = 0) {
  if (params.sequence !== true) return 0;
  const hz = clamp(finite(params.sequenceHz, 0.5), 0.05, 10);
  return modulo((finite(timeSeconds, 0) % (1 / hz)) * hz);
}

function mask(params, phase) {
  const length = clamp(finite(params.length, 40), 10, 100);
  const pitch = clamp(finite(params.pitch, 8), 1, 40);
  const duty = clamp(finite(params.duty, 0.5), 0.05, 0.95);
  return { length, pitch, duty, offset: length / 2 + pitch / 2 + modulo(finite(phase, 0)) * pitch };
}

export function dmdPatternOnAt(params = {}, localY = 0, phase = 0) {
  const m = mask(params, phase);
  return modulo((finite(localY, 0) + m.offset) / m.pitch) < m.duty;
}

// Exact ON/OFF intervals along local +Y, clipped to the active aperture.
export function dmdPatternBands(params = {}, phase = 0) {
  const m = mask(params, phase), half = m.length / 2;
  const bands = [];
  for (let k = Math.floor((-half + m.offset) / m.pitch); k <= Math.floor((half + m.offset) / m.pitch); k++) {
    const start = k * m.pitch - m.offset;
    for (const [a, b, on] of [[start, start + m.duty * m.pitch, true], [start + m.duty * m.pitch, start + m.pitch, false]]) {
      const y0 = Math.max(-half, a), y1 = Math.min(half, b);
      if (y1 > y0) bands.push({ y0, y1, on });
    }
  }
  return bands;
}
