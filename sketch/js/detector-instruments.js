// Detector catalogue redesign and detector-aware screen panels.

import {
  OBJ_SHAPES, createElement, displayDensity, getElementMeta, registry, resolveDisplaySensor,
} from './elements.js';
import { detectorReading } from './raytrace.js';
import { enhancedReading, objectImageAtCamera } from './detector-measurements.js';
import { esc, wavelengthToColor } from './util.js';

export const DETECTOR_TYPES = [
  'camera', 'detector', 'pmt', 'powermeter', 'wavefrontdetector',
  'polarimeter', 'spectrometer', 'generaldetector',
];

const DESCRIPTIONS = {
  camera: 'Spatially resolves beam intensity, beam diameter, a qualitative 2D intensity map, and an object image formed on the sensor.',
  detector: 'Measures the relative intensity incident on its active surface.',
  pmt: 'Measures intensity with qualitative gain and saturation for weak fluorescence, microscopy, and point-source signals.',
  powermeter: 'Reports incoming optical power when source power is configured, otherwise relative detected power.',
  wavefrontdetector: 'Reports intensity and classifies the incident beam as collimated, converging, or diverging with a qualitative divergence angle.',
  polarimeter: 'Reports polarization state, normalized Stokes parameters, and a visual linear, circular, elliptical, or unpolarized representation.',
  spectrometer: 'Reports centre wavelength, detected spectral range, bandwidth, and a qualitative spectrum.',
  generaldetector: 'Reports intensity, power, beam size, wavefront, polarization and Stokes parameters, wavelength and bandwidth, plus pulse repetition rate and duration.',
  display: 'Connects to one detector and shows only the properties that detector measures. The cable carries data and never affects rays.',
};

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

function compactNumber(value) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toExponential(1);
  if (abs >= 100) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function flipped(el) {
  const rotation = ((el.rot || 0) % 360 + 360) % 360;
  return rotation > 90 && rotation < 270;
}

function detectorSurfaces(width, height, detectorType, data = {}) {
  const x = width / 2, y = height / 2;
  return [
    { x1: -x, y1: -y, x2: -x, y2: y, kind: 'detector', data: { aperture: height, detectorType, ...data } },
    { x1: -x, y1: -y, x2: x, y2: -y, kind: 'absorb' },
    { x1: x, y1: -y, x2: x, y2: y, kind: 'absorb' },
    { x1: x, y1: y, x2: -x, y2: y, kind: 'absorb' },
  ];
}

function lamp(el, x, y) {
  const reading = detectorReading(el.id), active = reading?.signal > 0.000001;
  return `<circle cx="${x}" cy="${y}" r="3" fill="${active ? reading.color : '#7f8a95'}" opacity="${active ? 1 : 0.45}" stroke="#fff" stroke-width="0.8"/>`;
}

function instrumentDefinition({ label, code, readoutKind, paletteOrder, width, accent, aliases }) {
  const height = element => Math.max(10, element.params.aperture || 30);
  return {
    label, category: 'Detectors', paletteOrder, readoutKind, aliases,
    description: DESCRIPTIONS[readoutKind === 'power' ? 'powermeter' : readoutKind === 'wavefront' ? 'wavefrontdetector' : readoutKind],
    sensorFaceX: -width / 2,
    size: { w: width + 2, h: 34 },
    snapPt: { x: -width / 2, y: 0 }, dataPort: { x: width / 2, y: 0 },
    size_: element => ({ w: width + 2, h: height(element) + 4 }),
    params: [{ key: 'aperture', label: 'Active height (mm)', type: 'number', min: 6, max: 150, step: 2, def: 30 }],
    direct: { resize: { y: 'aperture' } },
    svg(element) {
      const h = height(element), textTransform = flipped(element) ? 'transform="rotate(180)"' : '';
      const fontSize = Math.max(6, Math.min(9.5, (width - 10) / Math.max(2, code.length * 0.62)));
      return `<rect x="${-width / 2}" y="${-h / 2}" width="${width}" height="${h}" rx="4" fill="#44505d" stroke="#202a33" stroke-width="1.5"/>` +
        `<rect x="${-width / 2 - 1.7}" y="${-h / 2 + 4}" width="3.4" height="${Math.max(5, h - 8)}" rx="1" fill="${accent}" stroke="#26323c" stroke-width="0.8"/>` +
        `<text x="1" y="1" ${textTransform} text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="720" letter-spacing="0.4" fill="#fff">${esc(code)}</text>` +
        lamp(element, width / 2 - 8, -h / 2 + 7);
    },
    surfaces: element => detectorSurfaces(width, height(element), label),
  };
}

Object.assign(registry.camera, {
  paletteOrder: 1, sensorFaceX: -22, description: DESCRIPTIONS.camera,
  aliases: ['beam camera', 'beam profiler', 'image sensor', '2d intensity map', 'beam diameter', 'object image'],
});
registry.camera.params = [
  { key: 'ch', label: 'Sensor height (mm)', type: 'number', min: 20, max: 150, step: 2, def: 30 },
  { key: 'pixels', label: 'Horizontal samples', type: 'number', min: 8, max: 64, step: 1, def: 24 },
  { key: 'rows', label: '2D display rows', type: 'number', min: 6, max: 24, step: 1, def: 12 },
];
Object.assign(registry.detector, {
  paletteOrder: 2, sensorFaceX: -19, description: DESCRIPTIONS.detector,
  aliases: ['photodiode', 'intensity detector', 'light intensity'],
});
Object.assign(registry.pmt, {
  label: 'Photomultiplier (PMT)', paletteOrder: 3, sensorFaceX: -26, description: DESCRIPTIONS.pmt,
  aliases: ['photomultiplier', 'low light detector', 'fluorescence detector', 'microscopy detector', 'point source detector'],
});
registry.powermeter = instrumentDefinition({
  label: 'Power meter', code: 'PWR', readoutKind: 'power', paletteOrder: 4, width: 48, accent: '#86efac',
  aliases: ['optical power', 'watt meter', 'laser power'],
});
registry.wavefrontdetector = instrumentDefinition({
  label: 'Wavefront detector', code: 'WF', readoutKind: 'wavefront', paletteOrder: 5, width: 52, accent: '#c4b5fd',
  aliases: ['wavefront sensor', 'collimation detector', 'divergence detector', 'shack hartmann'],
});
registry.polarimeter = instrumentDefinition({
  label: 'Polarimeter', code: 'POL', readoutKind: 'polarimeter', paletteOrder: 6, width: 48, accent: '#f9a8d4',
  aliases: ['stokes', 'polarization detector', 'polarisation detector'],
});
registry.spectrometer = instrumentDefinition({
  label: 'Spectrometer', code: 'SPEC', readoutKind: 'spectrometer', paletteOrder: 7, width: 54, accent: '#fde68a',
  aliases: ['spectrum', 'wavelength detector', 'bandwidth detector'],
});
registry.generaldetector = instrumentDefinition({
  label: 'General detector', code: 'ALL', readoutKind: 'general', paletteOrder: 8, width: 54, accent: '#67e8f9',
  aliases: ['universal detector', 'all properties', 'pulse detector', 'repetition rate', 'pulse duration'],
});
registry.display.label = 'Detector screen';
registry.display.paletteOrder = 20;
registry.display.description = DESCRIPTIONS.display;
registry.display.aliases = [...new Set([...(registry.display.aliases || []), 'detector screen', 'instrument display'])];
if (registry.eye) { registry.eye.category = 'Microscopy'; registry.eye.paletteOrder = 20; }

function header(name, mode, pulse) {
  const title = String(name).toUpperCase(), size = Math.max(3.7, Math.min(6, 46 / Math.max(1, title.length * 0.62)));
  // The mode line must shrink to fit too. Appending " · PULSE" pushed the
  // longest modes (e.g. "WAVELENGTH + BANDWIDTH") past the screen's right
  // edge at a fixed 4.5, so size it against the 72-unit usable width the
  // same way the title is sized.
  const modeText = `${mode}${pulse ? ' · PULSE' : ''}`;
  const modeSize = Math.max(3.1, Math.min(4.5, 72 / Math.max(1, modeText.length * 0.62)));
  return `<text x="-36" y="-23.5" font-size="${size.toFixed(2)}" font-weight="760" letter-spacing="0.35" fill="#9eb5c3">${esc(title)}</text>` +
    `<text x="-36" y="-16.5" font-size="${modeSize.toFixed(2)}" font-weight="700" letter-spacing="0.35" fill="${pulse ? '#67e8f9' : '#648092'}">${esc(modeText)}</text>`;
}

function metrics(entries, columns = 2) {
  const labelSize = columns >= 3 ? 3.05 : 3.8, valueSize = columns >= 3 ? 4 : 5.1;
  const cellWidth = 78 / columns;
  // Each cell must stay inside its own column, or a long value (a pulsed
  // "80.0 MHz · 100 fs", say) runs off the right edge of the screen.
  const fit = (text, preferred) =>
    Math.max(2.7, Math.min(preferred, (cellWidth - 3) / Math.max(1, String(text).length * 0.62)));
  return entries.map(([label, value], index) => {
    const column = index % columns, row = Math.floor(index / columns), x = -35 + column * cellWidth, y = -8 + row * 13;
    return `<text x="${x}" y="${y}" font-size="${fit(label, labelSize).toFixed(2)}" font-weight="700" fill="#5f7d8e">${esc(label)}</text>` +
      `<text x="${x}" y="${y + 6}" font-size="${fit(value, valueSize).toFixed(2)}" font-weight="680" fill="#d9e8ee">${esc(value)}</text>`;
  }).join('');
}

function spectrumLabel(reading) {
  return reading.bandwidth > 0.05 ? `${Math.round(reading.bandMin)}–${Math.round(reading.bandMax)} nm` : `${Math.round(reading.wavelength)} nm`;
}

function spectrumPlot(reading) {
  const samples = reading.spectrum?.length ? reading.spectrum : [{ wavelength: reading.wavelength, power: reading.signal, color: reading.color }];
  const lo = reading.bandMin, hi = reading.bandMax, span = Math.max(1, hi - lo), maximum = Math.max(...samples.map(sample => sample.power || 0), 1e-9);
  return `<line x1="-35" y1="8" x2="35" y2="8" stroke="#294453" stroke-width="0.8"/>` + samples.map((sample, index) => {
    const x = hi - lo < 1e-6 ? 0 : -35 + 70 * (sample.wavelength - lo) / span;
    const height = Math.max(1.2, 17 * Math.max(0, sample.power || 0) / maximum);
    return `<line data-spectrum-sample="${index}" x1="${x.toFixed(2)}" y1="8" x2="${x.toFixed(2)}" y2="${(8 - height).toFixed(2)}" stroke="${sample.color || wavelengthToColor(sample.wavelength)}" stroke-width="2" stroke-linecap="round"/>`;
  }).join('');
}

function profile(reading) {
  const values = reading.profile || [], maximum = Math.max(...values, 1e-9), width = values.length ? 70 / values.length : 0;
  return values.map((value, index) => {
    if (!(value > 0)) return '';
    const height = Math.max(0.6, 20 * value / maximum);
    return `<rect data-profile-bin="${index}" x="${(-35 + index * width).toFixed(2)}" y="${(11 - height).toFixed(2)}" width="${Math.max(0.3, width - 0.4).toFixed(2)}" height="${height.toFixed(2)}" rx="0.3" fill="${reading.profileColors?.[index] || reading.color}"/>`;
  }).join('') + `<line x1="-35" y1="11.5" x2="35" y2="11.5" stroke="#294453" stroke-width="0.8"/>`;
}

function objectGlyph(image) {
  if (!image) return '';
  const shape = OBJ_SHAPES[image.shape] || OBJ_SHAPES.arrow, cx = -8, cy = 1;
  const height = clamp(Math.abs(image.localTipY - image.localBaseY) * 0.9, 7, 20), sign = image.magnification < 0 ? -1 : 1;
  const point = value => ({ x: cx + value[0] * height, y: cy + value[1] * height * sign });
  let svg = `<g data-camera-object-image="true"><title>Object image falls on camera</title>`;
  for (const line of shape.lines || []) svg += `<polyline points="${line.map(item => { const p = point(item); return `${p.x.toFixed(2)},${p.y.toFixed(2)}`; }).join(' ')}" fill="none" stroke="${image.color}" stroke-width="1.25"/>`;
  for (const polygon of shape.polys || []) svg += `<polygon points="${polygon.map(item => { const p = point(item); return `${p.x.toFixed(2)},${p.y.toFixed(2)}`; }).join(' ')}" fill="${image.color}"/>`;
  return svg + `</g><text x="-34" y="14" font-size="3.3" font-weight="760" fill="#e2f1f5">OBJECT IMAGE</text>`;
}

function cameraMap(reading, sensor, elements) {
  const values = reading.profile || [], columns = Math.min(24, values.length), rows = clamp(Math.round(sensor.params.rows || 12), 6, 16);
  if (!columns) return '';
  const grouped = Array.from({ length: columns }, (_, column) => {
    const start = Math.floor(column * values.length / columns), end = Math.max(start + 1, Math.floor((column + 1) * values.length / columns));
    const slice = values.slice(start, end), value = slice.reduce((sum, sample) => sum + sample, 0);
    return { value, index: start, color: reading.profileColors?.[start] || reading.color };
  });
  const maximum = Math.max(...grouped.map(item => item.value), 1e-9), x0 = -35, y0 = -11, width = 54, height = 24;
  let pixels = '';
  for (let column = 0; column < columns; column++) {
    const level = grouped[column].value / maximum, sigma = 1.4 + level * rows * 0.19;
    for (let row = 0; row < rows; row++) {
      const dy = row - (rows - 1) / 2, intensity = level * Math.exp(-(dy * dy) / (2 * sigma * sigma));
      if (intensity < 0.035) continue;
      pixels += `<rect data-camera-pixel="${column}:${row}" x="${(x0 + column * width / columns).toFixed(2)}" y="${(y0 + row * height / rows).toFixed(2)}" width="${Math.max(0.35, width / columns - 0.25).toFixed(2)}" height="${Math.max(0.35, height / rows - 0.25).toFixed(2)}" fill="${grouped[column].color}" opacity="${clamp(0.15 + 0.85 * intensity, 0, 1).toFixed(2)}"/>`;
    }
  }
  return `<rect x="${x0}" y="${y0}" width="${width}" height="${height}" rx="1.5" fill="#031119" stroke="#294453"/>${pixels}${objectGlyph(objectImageAtCamera(sensor, elements))}` +
    `<text x="22" y="-6" font-size="4" fill="#6d8796">BEAM Ø</text><text x="40" y="1" text-anchor="end" font-size="6" fill="#d9e8ee">${reading.beamDiameter > 0 ? `${reading.beamDiameter.toFixed(1)} mm` : 'POINT'}</text>` +
    `<text x="40" y="7" text-anchor="end" font-size="4" fill="#6d8796">INTENSITY</text><text x="40" y="14" text-anchor="end" font-size="6" fill="#d9e8ee">Σw ${compactNumber(reading.signal)}</text>`;
}

function polarizationGlyph(reading) {
  const text = String(reading.polarization), match = /(?:Linear|Elliptical)\s+(-?[\d.]+)°/.exec(text), rotation = match ? -Number(match[1]) : 0;
  if (/^Linear/.test(text)) return `<g transform="translate(-24 1) rotate(${rotation})" stroke="#e2f1f5" stroke-width="1.5"><line x1="-9" y1="0" x2="9" y2="0"/><path d="M 9,0 L 5,-2.5 M 9,0 L 5,2.5 M -9,0 L -5,-2.5 M -9,0 L -5,2.5"/></g>`;
  if (/^Circular/.test(text)) return `<g transform="translate(-24 1)" fill="none" stroke="#e2f1f5" stroke-width="1.5"><circle r="8"/><path d="M 5.5,-5.8 L 9,-5.2 L 7.4,-1.8" fill="#e2f1f5"/></g>`;
  if (/^Elliptical/.test(text)) return `<g transform="translate(-24 1) rotate(${rotation})" fill="none" stroke="#e2f1f5" stroke-width="1.5"><ellipse rx="9" ry="4.5"/><path d="M 5.4,-3.5 L 8.8,-2.8 L 7.2,0.1" fill="#e2f1f5"/></g>`;
  return `<g transform="translate(-24 1)" stroke="#8fa7b5"><line x1="-8" y1="-5" x2="8" y2="5"/><line x1="-8" y1="5" x2="8" y2="-5"/><circle r="8" fill="none" stroke-dasharray="2 2"/></g>`;
}

function formatPower(watts, signal) {
  if (!Number.isFinite(watts)) return [compactNumber(signal), 'rel. power'];
  if (Math.abs(watts) >= 1) return [compactNumber(watts), 'W'];
  if (Math.abs(watts) >= 0.001) return [compactNumber(watts * 1000), 'mW'];
  if (Math.abs(watts) >= 1e-6) return [compactNumber(watts * 1e6), 'µW'];
  return [watts.toExponential(1), 'W'];
}

function pulseRate(pulse) { return !pulse ? 'CW' : pulse.mixed ? 'MIXED' : `${compactNumber(pulse.repRateMHz)} MHz`; }
function pulseDuration(pulse) { return !pulse ? '—' : pulse.mixed ? 'MIXED' : `${compactNumber(pulse.pulseWidthFs)} fs`; }

function panel(sensor, reading, elements, view) {
  const name = sensor.label || registry[sensor.type].label;
  if (sensor.type === 'camera') {
    if (view === 'detail') return header(name, 'SPATIAL METRICS', reading.pulse) + metrics([
      ['INTENSITY', `Σw ${compactNumber(reading.signal)}`], ['BEAM Ø', reading.beamDiameter > 0 ? `${reading.beamDiameter.toFixed(2)} mm` : 'POINT'],
      ['CENTROID', Number.isFinite(reading.centroid) ? `${reading.centroid.toFixed(2)} mm` : '—'], ['MAP', `${reading.profile?.length || 0}×${sensor.params.rows || 12}`],
    ]);
    if (view === 'spectrum') return header(name, 'LINE PROFILE', reading.pulse) + profile(reading);
    return header(name, '2D INTENSITY', reading.pulse) + cameraMap(reading, sensor, elements);
  }
  if (sensor.type === 'detector') return header(name, 'REL INTENSITY', reading.pulse) +
    `<circle cx="-31" cy="-1" r="2.3" fill="${reading.color}"/><text x="35" y="4" text-anchor="end" font-size="15" font-weight="780" fill="#ecf7fa">${compactNumber(reading.signal)}</text><text x="35" y="12" text-anchor="end" font-size="5" fill="#7892a1">Σw · REL INTENSITY</text>`;
  if (sensor.type === 'pmt') return header(name, 'LOW-LIGHT INTENSITY', reading.pulse) + metrics([
    ['INPUT', `Σw ${compactNumber(reading.signal)}`], ['GAIN', `×${compactNumber(sensor.params.gain || 1)}`],
    ['PMT OUTPUT', `${compactNumber(reading.outputSignal)} a.u.`], ['STATE', reading.saturated ? 'SATURATED' : 'LINEAR'],
  ]);
  if (sensor.type === 'powermeter') {
    const [value, unit] = formatPower(reading.detectedPowerW, reading.signal);
    // The value and its unit sit on one baseline; the old provenance caption
    // ("from configured source power") collided with the unit and is dropped.
    return header(name, 'OPTICAL POWER', reading.pulse)
      + `<text x="35" y="6" text-anchor="end" font-size="14" font-weight="780" fill="#ecf7fa">${value}</text>`
      + `<text x="35" y="14" text-anchor="end" font-size="5.2" fill="#86efac">${unit}</text>`;
  }
  if (sensor.type === 'wavefrontdetector') {
    const wave = reading.wavefront, divergence = wave.state === 'COLLIMATED' ? '0.00°' : `${wave.divergenceDeg.toFixed(2)}°`;
    return header(name, 'WAVEFRONT + INTENSITY', reading.pulse) + `<text x="35" y="-4" text-anchor="end" font-size="8.2" font-weight="780" fill="#e9e3ff">${wave.state}</text><text x="35" y="4" text-anchor="end" font-size="5.2" fill="#a99bd4">DIVERGENCE ${divergence}</text><text x="35" y="13" text-anchor="end" font-size="5.2" fill="#d9e8ee">INTENSITY Σw ${compactNumber(reading.signal)}</text>`;
  }
  if (sensor.type === 'polarimeter') return header(name, 'POLARIZATION · STOKES', reading.pulse) + polarizationGlyph(reading) +
    `<text x="-11" y="-5" font-size="6" font-weight="760" fill="#f5e8f1">${esc(String(reading.polarization).toUpperCase())}</text><text x="-11" y="3" font-size="4.4" fill="#b99aaa">DoP ${(100 * reading.stokes.normalized.degree).toFixed(0)}%</text><text x="-11" y="11" font-size="4.2" fill="#d9e8ee">S0 ${compactNumber(reading.stokes.s0)}  S1 ${compactNumber(reading.stokes.s1)}</text><text x="35" y="11" text-anchor="end" font-size="4.2" fill="#d9e8ee">S2 ${compactNumber(reading.stokes.s2)}  S3 ${compactNumber(reading.stokes.s3)}</text>`;
  if (sensor.type === 'spectrometer' || (sensor.type === 'generaldetector' && view === 'spectrum')) return header(name, sensor.type === 'spectrometer' ? 'WAVELENGTH + BANDWIDTH' : 'GENERAL · SPECTRUM', reading.pulse) + spectrumPlot(reading)
    // λ range and bandwidth each get their own line: side by side they
    // overlapped as soon as the range was a two-ended span.
    + `<text x="-35" y="11" font-size="4.6" fill="#8fa7b5">λ ${esc(spectrumLabel(reading))}</text>`
    + `<text x="-35" y="17" font-size="4.6" fill="#fde68a">BANDWIDTH ${compactNumber(reading.bandwidth)} nm</text>`;
  if (sensor.type === 'generaldetector' && view === 'detail') return header(name, 'STOKES + PULSE TIMING', reading.pulse) + metrics([
    ['S0', compactNumber(reading.stokes.s0)], ['S1', compactNumber(reading.stokes.s1)], ['S2', compactNumber(reading.stokes.s2)],
    ['S3', compactNumber(reading.stokes.s3)], ['REP RATE', pulseRate(reading.pulse)], ['PULSE DURATION', pulseDuration(reading.pulse)],
  ], 3);
  if (sensor.type === 'generaldetector') {
    const [power, unit] = formatPower(reading.detectedPowerW, reading.signal);
    const wave = reading.wavefront.state === 'COLLIMATED' ? 'COLLIMATED' : `${reading.wavefront.state} ${reading.wavefront.divergenceDeg.toFixed(2)}°`;
    return header(name, 'ALL LIGHT PROPERTIES', reading.pulse) + metrics([
      ['POWER / INTENSITY', `${power} ${unit}`], ['BEAM Ø', reading.beamDiameter > 0 ? `${reading.beamDiameter.toFixed(2)} mm` : 'POINT'], ['WAVEFRONT', wave],
      ['POLARIZATION', String(reading.polarization).toUpperCase()], ['WAVELENGTH', spectrumLabel(reading)], ['PULSE', reading.pulse ? `${pulseRate(reading.pulse)}·${pulseDuration(reading.pulse)}`.replace(/ /g, '') : 'CW'],
    ], 3);
  }
  return '';
}

const originalDisplaySVG = registry.display.svg;
registry.display.svg = function detectorAwareDisplaySVG(display, elements = []) {
  const base = originalDisplaySVG(display, elements);
  if (display.params.screenOn === false) return base;
  const sensor = resolveDisplaySensor(display, elements);
  if (!sensor || !DETECTOR_TYPES.includes(sensor.type)) return base;
  const reading = enhancedReading(sensor, elements);
  if (!reading) return base;
  const scale = clamp(display.params.displayScale || 1, 0.5, 3);
  const view = ['main', 'spectrum', 'detail'].includes(display.params.displayView) ? display.params.displayView : 'main';
  const content = panel(sensor, reading, elements, view);
  return base + `<g transform="scale(${scale})" data-detector-readout="${esc(sensor.type)}" data-display-density="${displayDensity(scale)}" pointer-events="none"><rect x="-42.2" y="-28.2" width="84.4" height="45.4" rx="2.5" fill="#061822"/><g font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${content}</g></g>`;
};

function paletteItem(type) {
  const def = registry[type], element = createElement(type);
  const size = typeof def.size === 'function' ? def.size(element) : (def.size_ ? def.size_(element) : def.size);
  const viewBox = Math.max(size.w, size.h) + 12, meta = getElementMeta(type, element.params);
  const description = def.description || DESCRIPTIONS[type] || meta.description;
  const search = `${def.label} ${def.category} ${description} ${(def.aliases || []).join(' ')}`.toLowerCase();
  return `<button type="button" class="palitem" data-type="${type}" data-search="${esc(search)}" title="${esc(description)}"><svg viewBox="${-viewBox / 2} ${-viewBox / 2} ${viewBox} ${viewBox}">${def.svg(element)}</svg><span class="pal-copy"><span class="pal-label">${esc(def.label)}</span><span class="pal-desc">${esc(description)}</span></span><i class="cap-dot ${meta.tier}" title="${esc(meta.status)}"></i></button>`;
}

async function rebuildGroup(category) {
  const group = document.querySelector(`.palette-group[data-category="${category}"]`), list = group?.querySelector('.catlist');
  if (!list) return;
  const types = Object.entries(registry).filter(([, def]) => def.category === category && !def.hidden)
    .sort((a, b) => (a[1].paletteOrder ?? 100) - (b[1].paletteOrder ?? 100)).map(([type]) => type);
  list.innerHTML = types.map(paletteItem).join('');
  const count = group.querySelector('.group-count');
  if (count) count.textContent = String(types.length);
  const { startPlacing } = await import('./canvas.js');
  list.querySelectorAll('.palitem').forEach(item => item.addEventListener('click', () => startPlacing(item.dataset.type)));
}

async function enhancePalette() {
  if (typeof document === 'undefined') return;
  await rebuildGroup('Detectors');
  await rebuildGroup('Microscopy');
  const group = document.querySelector('.palette-group[data-category="Detectors"]');
  if (group) group.open = true;
  const count = document.getElementById('libraryCount');
  if (count) count.textContent = `${document.querySelectorAll('.palitem').length} components`;
  const { renderAll } = await import('./canvas.js');
  renderAll();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhancePalette, { once: true });
  else setTimeout(enhancePalette, 0);
}

export { DESCRIPTIONS, enhancedReading, objectImageAtCamera };
