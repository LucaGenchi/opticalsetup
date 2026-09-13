// One programmable pixel model for DMD and SLM devices. Frame values are
// binary states, intensity transmission, or phase cycles; phase pixels alone
// never invent a diffracted field. Optional geometric effects live separately.
export const MASK_MAX_FRAMES = 16;
export const MASK_MAX_SIDE = 32;
export const MASK_JSON_LIMIT = 120000;
const PRESET_SIDE = 16;
const finite = (v, fallback) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const bounded = (v, lo, hi, fallback) => Math.min(hi, Math.max(lo, finite(v, fallback)));
const integer = (v, lo, hi, fallback) => Math.round(bounded(v, lo, hi, fallback));
const mod = (v, n) => ((v % n) + n) % n;
const patterns = new Set(['uniform', 'stripes', 'checkerboard', 'spots', 'slices', 'hologram', 'custom']);
const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);

// Accept one 2D grid or a list of grids. Normalization is bounded before any
// iteration, makes ragged rows rectangular, and fails closed for bad pixels.
export function normalizeMaskFrames(value, device = 'slm') {
  let raw = value;
  if (typeof raw === 'string') {
    if (raw.length > MASK_JSON_LIMIT) return [];
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(raw) || !raw.length) return [];
  if (Array.isArray(raw[0]) && !Array.isArray(raw[0][0])) raw = [raw];
  return raw.slice(0, MASK_MAX_FRAMES).filter(Array.isArray).map(grid => {
    const rows = grid.slice(0, MASK_MAX_SIDE).filter(Array.isArray);
    if (!rows.length) return [[0]];
    const width = Math.max(1, Math.min(MASK_MAX_SIDE, Math.max(...rows.map(row => row.length))));
    return rows.map(row => Array.from({ length: width }, (_, x) => {
      const value = bounded(row[x], 0, 1, 0);
      return device === 'dmd' ? Number(value >= 0.5) : value;
    }));
  });
}

function legacyLevels(value) {
  return String(value ?? '1').slice(0, 200).split(',').slice(0, 8)
    .map(Number).filter(Number.isFinite).map(v => Math.min(1, Math.max(0, v)));
}

// Run before the registry discards retired fields. The original stripe law
// stays exact; only the retired continuous animation is deliberately replaced
// by a discrete sequence of 2D masks. Legacy SLM levels multiply intensity.
export function migrateProgrammableMaskParams(params = {}, device = 'dmd') {
  const p = isRecord(params) ? { ...params } : {};
  if (p.maskPattern === undefined) {
    p.maskPattern = device === 'dmd' ? 'stripes' : 'uniform';
    if (device === 'dmd' && p.pattern === 'hologram') {
      p.maskPattern = 'hologram';
      p.holographicOrders = true;
    } else if (device === 'dmd' && p.sequence === true) p.maskPattern = 'slices';
    const amplitudeLayers = device === 'slm' && Array.isArray(p.layers)
      ? p.layers.filter(layer => layer?.type === 'amplitude') : [];
    if (amplitudeLayers.length) {
      const lists = amplitudeLayers.map(layer => legacyLevels(layer.levels));
      // Keep each old band edge. Multiple overlaid masks can have different
      // divisions, so save the exact legacy bands as a bounded migration field.
      p.maskLegacyBands = lists.map(list => list.length ? list : [1]);
      p.maskPattern = 'custom';
      p.maskMode = 'amplitude';
      const first = p.maskLegacyBands[0];
      p.maskFrames = [first.map(value => Array(8).fill(value))];
      p.layers = p.layers.filter(layer => layer?.type !== 'amplitude');
    }
  }
  if (p.maskPlayback === undefined) p.maskPlayback = p.sequence === true;
  if (p.maskRateHz === undefined && p.sequenceHz !== undefined) p.maskRateHz = p.sequenceHz;
  if (p.spectralMode === undefined) {
    p.spectralMode = p.spectralDispersion === true ? 'linear'
      : p.disperseSpectrum === true ? 'carrier' : 'none';
  }
  return p;
}

export function normalizeMaskLegacyBands(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).filter(Array.isArray).map(row =>
    row.slice(0, 8).map(v => bounded(v, 0, 1, 0))).filter(row => row.length);
}

export function programmableMaskParams(device) {
  const isDmd = device === 'dmd';
  return [
    ...(!isDmd ? [{ key: 'maskMode', label: 'Pixel values', type: 'select', def: 'phase', options: [
      ['phase', 'Phase (cycles; display only)'], ['amplitude', 'Intensity transmission (0–1)'],
    ] }] : []),
    { key: 'maskPattern', label: 'Pixel pattern', type: 'select', def: isDmd ? 'stripes' : 'uniform', options: [
      ['uniform', 'Uniform'], ['stripes', 'Binary stripe frame'], ['checkerboard', 'Checkerboard'],
      ['spots', 'Pixel spots'], ['slices', 'Shape slices'], ['hologram', 'Illustrative hologram'],
      ['custom', 'Custom frame grids'],
    ] },
    { key: 'maskLevel', label: isDmd ? 'Uniform ON state (0 or 1)' : 'Uniform value (0–1)', type: 'number',
      min: 0, max: 1, step: isDmd ? 1 : 0.05, def: isDmd ? 1 : 0,
      show: p => p.maskPattern === 'uniform' },
    { key: 'pitch', label: 'Stripe pitch (mm)', type: 'number', min: 1, max: 40, step: 0.5, def: 8,
      show: p => p.maskPattern === 'stripes' },
    { key: 'duty', label: 'Bright fraction (0–1)', type: 'number', min: 0, max: 1, step: 0.01, def: 0.5,
      show: p => p.maskPattern === 'stripes' },
    { key: 'maskFrames', label: 'Frames (JSON grids)', type: 'maskframes', def: [],
      show: p => p.maskPattern === 'custom' },
    { key: 'maskLegacyBands', type: 'maskbands', def: [], show: () => false },
    { key: 'maskFrame', label: 'Frame index (from 0)', type: 'number', min: 0, max: MASK_MAX_FRAMES - 1, step: 1, def: 0,
      show: p => p.maskPattern !== 'uniform' && p.maskPattern !== 'stripes' },
    { key: 'maskPlayback', label: 'Play discrete frames', type: 'checkbox', def: false,
      show: p => p.maskPattern !== 'uniform' && p.maskPattern !== 'stripes' },
    { key: 'maskRateHz', label: 'Preview frames / second', type: 'number', min: 0.05, max: 10, step: 0.05, def: 0.5,
      show: p => p.maskPlayback && p.maskPattern !== 'uniform' && p.maskPattern !== 'stripes' },
    { key: 'maskSlice', label: 'Traced column (0–1)', type: 'number', min: 0, max: 1, step: 0.05, def: 0.5 },
    { key: 'maskPreview', label: 'Current frame', type: 'maskpreview' },
  ];
}

export const programmableEffectParams = [
  { key: 'holographicOrders', label: 'Geometric holographic orders', type: 'checkbox', def: false },
  { key: 'focusCount', label: 'Orders in this section', type: 'number', min: 1, max: 8, step: 1, def: 3,
    show: p => p.holographicOrders },
  { key: 'focusSpan', label: 'Angular span (°)', type: 'number', min: 0, max: 20, step: 0.5, def: 6,
    show: p => p.holographicOrders },
  { key: 'scanAngle', label: 'Order steering (°)', type: 'number', min: -20, max: 20, step: 0.5, def: 0,
    show: p => p.holographicOrders },
  { key: 'spectralMode', label: 'Spectral-angle proxy', type: 'select', def: 'none', options: [
    ['none', 'None'], ['linear', 'Linear angular slope'], ['carrier', 'Relative grating carrier'],
  ] },
  { key: 'dispersionReferenceNm', label: 'Reference wavelength (nm)', type: 'number', min: 100, max: 4000, step: 1, def: 800,
    show: p => p.spectralMode === 'linear' },
  { key: 'dispersionSlopeDegPer100Nm', label: 'Angular slope (° / 100 nm)', type: 'number', min: -60, max: 60, step: 0.5, def: 6,
    show: p => p.spectralMode === 'linear' },
  { key: 'carrierLinesPerMm', label: 'Carrier lines / mm', type: 'number', min: 1, max: 1000, step: 0.1, def: 92.6,
    show: p => p.spectralMode === 'carrier' },
  { key: 'carrierOrder', label: 'Carrier order', type: 'number', min: -20, max: 20, step: 1, def: 1,
    show: p => p.spectralMode === 'carrier' },
  { key: 'designWavelengthNm', label: 'Design wavelength (nm)', type: 'number', min: 100, max: 4000, step: 1, def: 800,
    show: p => p.spectralMode === 'carrier' },
];

const detailDefaults = Object.freeze({
  maskDetailOffsetX: 45, maskDetailOffsetY: -150,
  maskDetailWidth: 250, maskDetailHeight: 140, maskDetailFontSize: 18,
});
const detailRanges = Object.freeze({
  maskDetailOffsetX: [-5000, 5000], maskDetailOffsetY: [-5000, 5000],
  maskDetailWidth: [130, 1000], maskDetailHeight: [110, 600],
  maskDetailFontSize: [12, 36],
});

export const PROGRAMMABLE_MASK_DETAIL_PARAMS = [
  { key: 'maskDetailHeading', label: 'Frame inset', type: 'section', open: false },
  { key: 'showMaskDetail', label: 'Show enlarged frame', type: 'checkbox', def: false,
    note: 'An enlarged view of the current device pixels; the amber column is sampled by the ray tracer.' },
  ...[
    ['maskDetailOffsetX', 'Inset horizontal offset (mm)', 5],
    ['maskDetailOffsetY', 'Inset vertical offset (mm)', 5],
    ['maskDetailWidth', 'Inset width (mm)', 10],
    ['maskDetailHeight', 'Inset height (mm)', 10],
    ['maskDetailFontSize', 'Inset text size', 1],
  ].map(([key, label, step]) => ({ key, label, step, type: 'number',
    min: detailRanges[key][0], max: detailRanges[key][1], def: detailDefaults[key],
    show: p => p.showMaskDetail === true })),
];

export function programmableMaskDetailOptions(params = {}) {
  const options = { enabled: params.showMaskDetail === true };
  for (const [key, fallback] of Object.entries(detailDefaults)) {
    options[key] = bounded(params[key], ...detailRanges[key], fallback);
  }
  return options;
}

export function programmableMaskDetailBounds(element) {
  const options = programmableMaskDetailOptions(element.params);
  if (!options.enabled || !Number.isFinite(element.x) || !Number.isFinite(element.y)) return null;
  const x0 = element.x + options.maskDetailOffsetX, y0 = element.y + options.maskDetailOffsetY;
  return { x0, y0, x1: x0 + options.maskDetailWidth, y1: y0 + options.maskDetailHeight };
}

export function programmableMaskFrame(params = {}, device = 'dmd', timeSeconds = 0) {
  const p = migrateProgrammableMaskParams(params, device);
  const pattern = patterns.has(p.maskPattern) ? p.maskPattern : 'uniform';
  const mode = device === 'dmd' ? 'binary' : p.maskMode === 'amplitude' ? 'amplitude' : 'phase';
  const custom = pattern === 'custom' ? normalizeMaskFrames(p.maskFrames, device) : [];
  const count = pattern === 'custom' ? Math.max(1, custom.length)
    : ['uniform', 'stripes'].includes(pattern) ? 1 : 4;
  const rate = bounded(p.maskRateHz, 0.05, 10, 0.5);
  const base = integer(p.maskFrame, 0, MASK_MAX_FRAMES - 1, 0);
  const elapsed = bounded(timeSeconds, 0, 1e9, 0);
  const index = mod(base + (p.maskPlayback === true ? Math.floor(elapsed * rate) : 0), count);
  const length = bounded(p.length, 10, 100, 40);
  let grid, rowEdges;
  const bands = normalizeMaskLegacyBands(p.maskLegacyBands);
  if (pattern === 'custom' && bands.length) {
    rowEdges = [...new Set([0, 1, ...bands.flatMap(row => row.map((_, i) => i / row.length))])].sort((a, b) => a - b);
    grid = rowEdges.slice(0, -1).map((edge, i) => {
      const y = (edge + rowEdges[i + 1]) / 2;
      const value = bands.reduce((v, row) => v * row[Math.min(row.length - 1, Math.floor(y * row.length))], 1);
      return Array(8).fill(value);
    });
  } else if (pattern === 'custom') grid = custom[index] || [[0]];
  else if (pattern === 'stripes') {
    const pitch = bounded(p.pitch, 1, 40, 8), duty = bounded(p.duty, 0, 1, 0.5);
    // Preserve old pitch/duty saves exactly, including endpoints. Rows are
    // piecewise constant pixels with explicit normalized edge coordinates.
    rowEdges = [0, 1];
    for (let k = -1; k <= Math.ceil(length / pitch) + 1; k++) {
      for (const edge of [k * pitch - pitch / 2, (k + duty) * pitch - pitch / 2]) {
        if (edge > 0 && edge < length) rowEdges.push(edge / length);
      }
    }
    rowEdges = [...new Set(rowEdges)].sort((a, b) => a - b);
    grid = rowEdges.slice(0, -1).map((edge, i) => {
      const y = (edge + rowEdges[i + 1]) / 2 * length;
      return Array(8).fill(Number(mod(y + pitch / 2, pitch) / pitch < duty));
    });
  } else {
    grid = Array.from({ length: PRESET_SIDE }, (_, y) => Array.from({ length: PRESET_SIDE }, (_, x) => {
      if (pattern === 'uniform') return bounded(p.maskLevel, 0, 1, device === 'dmd' ? 1 : 0);
      if (pattern === 'checkerboard') return Number((Math.floor(x / 4) + Math.floor(y / 4) + index) % 2 === 0);
      if (pattern === 'spots') return Number((x + index * 2) % 8 < 3 && (y + index * 2) % 8 < 3);
      if (pattern === 'slices') {
        const xx = x - 7.5, yy = y - 7.5;
        if (index === 0) return Number(Math.abs(xx) <= 4.5 && Math.abs(yy) <= 4.5);
        if (index === 1) return Number(Math.abs(xx) <= 5.5 && Math.abs(yy) <= 5.5 && (Math.abs(xx) >= 3.5 || Math.abs(yy) >= 3.5));
        if (index === 2) return Number(Math.abs(xx) <= 1.5 || Math.abs(yy) <= 1.5);
        return Number(xx * xx + yy * yy <= 30 && xx * xx + yy * yy >= 10);
      }
      // A schematic phase texture, not a solved CGH. Its frame changes in
      // discrete steps and never claims to determine the configured orders.
      const phase = mod((x * (index + 2) + y * 3 + (x - 7.5) ** 2 / 3 + (y - 7.5) ** 2 / 5) / 16, 1);
      return mode === 'phase' ? phase : Number(phase < 0.5);
    }));
  }
  if (device === 'dmd') grid = grid.map(row => row.map(v => Number(v >= 0.5)));
  return { version: 1, device, mode, pattern, index, count, grid, rowEdges,
    column: bounded(p.maskSlice, 0, 1, 0.5), length };
}

export function sampleProgrammableFrame(frame, height, column = frame.column) {
  if (!Number.isFinite(height)) return { value: 0, transmission: 0, phaseCycles: 0, row: -1, column: -1 };
  const v = height / frame.length + 0.5;
  if (v < 0 || v > 1) return { value: 0, transmission: 0, phaseCycles: 0, row: -1, column: -1 };
  const row = frame.rowEdges
    ? Math.min(frame.grid.length - 1, Math.max(0, frame.rowEdges.findIndex(edge => edge > v + 1e-12) - 1))
    : Math.min(frame.grid.length - 1, Math.floor(v * frame.grid.length));
  // The far aperture endpoint belongs to its final row.
  const r = v >= 1 - 1e-12 ? frame.grid.length - 1 : row;
  const c = Math.min(frame.grid[r].length - 1, Math.floor(bounded(column, 0, 1, 0.5) * frame.grid[r].length));
  const value = frame.grid[r][c];
  return { value, transmission: frame.mode === 'phase' ? 1 : value,
    phaseCycles: frame.mode === 'phase' ? value : 0, row: r, column: c };
}

export function programmableMaskPlaying(el) {
  return (el?.type === 'dmd' || el?.type === 'slm') && el.params?.maskPlayback === true
    && programmableMaskFrame(el.params, el.type).count > 1;
}

export function programmableMaskEffects(params = {}) {
  const p = migrateProgrammableMaskParams(params);
  const count = p.holographicOrders === true ? integer(p.focusCount, 1, 8, 3) : 1;
  const span = bounded(p.focusSpan, 0, 20, 6), scan = bounded(p.scanAngle, -20, 20, 0);
  return {
    angles: Array.from({ length: count }, (_, i) => p.holographicOrders === true
      ? scan + (count > 1 ? span * (i / (count - 1) - 0.5) : 0) : 0),
    holographic: p.holographicOrders === true,
    spectralMode: ['linear', 'carrier'].includes(p.spectralMode) ? p.spectralMode : 'none',
    referenceNm: bounded(p.dispersionReferenceNm, 100, 4000, 800),
    slope: bounded(p.dispersionSlopeDegPer100Nm, -60, 60, 6),
    lines: bounded(p.carrierLinesPerMm, 1, 1000, 92.6),
    order: integer(p.carrierOrder, -20, 20, 1),
    designNm: bounded(p.designWavelengthNm, 100, 4000, 800),
  };
}

export function programmableSpectralAngle(effects, wavelength) {
  const wl = bounded(wavelength, 100, 4000, 800);
  if (effects.spectralMode === 'linear') return bounded(effects.slope * (wl - effects.referenceNm) / 100, -80, 80, 0) * Math.PI / 180;
  if (effects.spectralMode === 'carrier') return Math.asin(bounded(effects.order * (wl - effects.designNm) * effects.lines / 1e6, -0.999999, 0.999999, 0));
  return 0;
}

// Draw a true 2D panel. The one tracer cross-section is never substituted for
// the device image. Bounded downsampling keeps tiny exported icons inexpensive.
export function programmableFrameSVG(frame, {
  x = -6, y = -17, width = 14, height = 34, markSlice = false, fullResolution = false,
} = {}) {
  // Imported frames have at most 32 rows; exact legacy stripe edges can
  // create up to 202 narrow bands. A large inset can draw those actual cells.
  const rows = Math.min(fullResolution ? 256 : 24, frame.grid.length);
  const cols = Math.min(fullResolution ? MASK_MAX_SIDE : 16, frame.grid[0].length);
  let svg = `<g data-mask-frame="${frame.index}" data-mask-mode="${frame.mode}">`;
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const top = fullResolution && frame.rowEdges ? frame.rowEdges[row] : row / rows;
    const bottom = fullResolution && frame.rowEdges ? frame.rowEdges[row + 1] : (row + 1) / rows;
    const value = fullResolution ? frame.grid[row][col]
      : sampleProgrammableFrame(frame, ((row + 0.5) / rows - 0.5) * frame.length, (col + 0.5) / cols).value;
    let color;
    if (frame.mode === 'phase') {
      const a = value * Math.PI * 2;
      color = [0, 2 * Math.PI / 3, 4 * Math.PI / 3].map(shift => Math.round(140 + 90 * Math.cos(a - shift)));
    } else color = [30, 44, 52].map(v => Math.round(v + value * (238 - v)));
    const gap = Math.min(width / cols, height * (bottom - top)) * 0.14;
    svg += `<rect data-mask-pixel="${row},${col}" x="${x + col * width / cols}" y="${y + top * height}" width="${width / cols - gap}" height="${height * (bottom - top) - gap}" fill="rgb(${color.join(',')})"/>`;
  }
  if (markSlice) {
    const column = Math.min(cols - 1, Math.floor(frame.column * cols));
    svg += `<rect data-mask-slice="${column}" x="${x + column * width / cols}" y="${y}" width="${width / cols}" height="${height}" fill="none" stroke="#e88e35" stroke-width="1.2"/>`;
    svg += `<line x1="${x + frame.column * width}" y1="${y}" x2="${x + frame.column * width}" y2="${y + height}" stroke="#e88e35" stroke-width="1" stroke-dasharray="3 2"/>`;
  }
  return svg + '</g>';
}

// The panel is an enlarged display of the same normalized frame, separate
// from the physical active face. Counter-rotation makes its offsets world
// aligned, exactly like the specimen-arrival inset.
export function programmableMaskDetailSVG(element, currentFrame = null) {
  const options = programmableMaskDetailOptions(element.params);
  if (!options.enabled) return '';
  const frame = currentFrame || programmableMaskFrame(element.params, element.type, element._animationTimeS);
  const width = options.maskDetailWidth, height = options.maskDetailHeight;
  const wide = width >= 230;
  const rotation = finite(element.rot, 0);
  const device = frame.device === 'slm' ? 'SLM' : 'DMD';
  const frameLabel = `${frame.index + 1} / ${frame.count}`;
  const column = Math.min(frame.grid[0].length - 1, Math.floor(frame.column * frame.grid[0].length)) + 1;
  const columnLabel = `Column ${column} / ${frame.grid[0].length}`;
  const modeLabel = frame.mode === 'binary' ? 'Binary ON / OFF'
    : frame.mode === 'phase' ? 'Phase (cycles)' : 'Intensity 0–1';
  const bodyScale = 0.88;
  // Reserve text room before sizing the grid. Oversized requested text fits
  // down inside the saved panel instead of extending its visual/export box.
  const textFactor = Math.max(`${device} frame`.length * 0.64,
    frameLabel.length * 0.64, modeLabel.length * 0.56 * bodyScale,
    columnLabel.length * 0.56 * bodyScale);
  const fontLimit = wide ? Math.min((height - 16) / 4.4, (width - 32 - 56) / textFactor)
    : Math.min((height - 44) / 2.2, (width - 24) / ((device.length + frameLabel.length) * 0.64 + 1),
      (width - 24) / (columnLabel.length * 0.56 * bodyScale));
  const fontSize = Math.min(options.maskDetailFontSize, fontLimit);
  const bodySize = fontSize * bodyScale;
  const gridSize = wide ? Math.min(height - 16, width - 32 - textFactor * fontSize)
    : Math.min(width - 24, height - 24 - 2.2 * fontSize);
  const gridX = wide ? 8 : (width - gridSize) / 2;
  const gridY = wide ? (height - gridSize) / 2 : fontSize + 12;
  const textX = gridX + gridSize + 16;
  const number = value => Number(value.toFixed(2));
  let svg = `<g class="programmable-mask-detail" transform="rotate(${-rotation}) translate(${options.maskDetailOffsetX} ${options.maskDetailOffsetY})" font-family="Helvetica, Arial, sans-serif">`;
  svg += `<title>${device} frame ${frameLabel}. ${modeLabel}. Amber outline: ${columnLabel.toLowerCase()}, sampled by the 2D ray tracer.</title>`;
  svg += `<rect width="${width}" height="${height}" rx="6" fill="#ffffff" stroke="#64748b" stroke-width="0.8"/>`;
  svg += `<rect x="${gridX - 1}" y="${gridY - 1}" width="${gridSize + 2}" height="${gridSize + 2}" fill="#172033"/>`;
  svg += programmableFrameSVG(frame, { x: gridX, y: gridY, width: gridSize, height: gridSize,
    fullResolution: true, markSlice: true });
  if (wide) {
    svg += `<text x="${number(textX)}" y="${number(height / 2 - 1.55 * fontSize)}" font-size="${number(fontSize)}" font-weight="700" fill="#172033">${device} frame</text>`;
    svg += `<text x="${number(textX)}" y="${number(height / 2 - 0.35 * fontSize)}" font-size="${number(fontSize)}" font-weight="700" fill="#172033">${frameLabel}</text>`;
    svg += `<text x="${number(textX)}" y="${number(height / 2 + 0.9 * fontSize)}" font-size="${number(bodySize)}" fill="#475569">${modeLabel}</text>`;
    svg += `<text x="${number(textX)}" y="${number(height / 2 + 2.05 * fontSize)}" font-size="${number(bodySize)}" fill="#b45309">${columnLabel}</text>`;
  } else {
    svg += `<text x="12" y="${number(fontSize + 5)}" font-size="${number(fontSize)}" font-weight="700" fill="#172033">${device}</text>`;
    svg += `<text x="${width - 12}" y="${number(fontSize + 5)}" text-anchor="end" font-size="${number(fontSize)}" font-weight="700" fill="#172033">${frameLabel}</text>`;
    svg += `<text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-size="${number(bodySize)}" fill="#b45309">${columnLabel}</text>`;
  }
  return svg + '</g>';
}
