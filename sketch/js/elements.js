// Registry of optical elements.
// Local coordinates: element centered at (0,0); default optical propagation is along +x.
// def = { label, category, size:{w,h}|fn(el), params:[...], svg(el)->string,
//         surfaces(el)->[{x1,y1,x2,y2,kind,data}], source(el)->[rays] }
// Surface kinds handled by the tracer: mirror, lens, cmirror, refract,
// dichroic, filter, split, grating, absorb, transmit (data may change
// wavelength / deflect).

import { distToSegment, esc, rotPt, toWorld, wavelengthToColor } from './util.js';
import { uid } from './util.js';
import { detectorReading, probeAt } from './raytrace.js';
import {
  boundaryBounds, boundaryPathData, boundarySegments, isSimpleBoundary,
  pointInBoundary, sampleBoundary,
} from './polygon.js';
import { stokesAngleDeg } from './polarization.js';
import { etalonDefinition } from './etalon.js';

// true when the element's rotation would render baked-in text upside down
function isFlipped(el) {
  const r = ((el.rot || 0) % 360 + 360) % 360;
  return r > 90 && r < 270;
}
// rotation for side-mounted (vertical) text that keeps it readable
function sideTextRot(el) {
  const r = (((el.rot || 0) + 90) % 360 + 360) % 360;
  return (r > 90 && r < 270) ? -90 : 90;
}

const GLASS = '#c9e4f5', GLASS_S = '#4a90c4';
const FREEGLASS_DEFAULT = [
  { x: -36, y: -24 }, { x: 30, y: -24 }, { x: 38, y: 20 }, { x: -26, y: 26 },
];

function freeglassPoints(el) {
  const scale = Math.min(10, Math.max(0.1, el.params.scale || 1));
  const points = Array.isArray(el.params.vertices) && el.params.vertices.length >= 3
    ? el.params.vertices : FREEGLASS_DEFAULT;
  return points.map(p => ({
    x: p.x * scale, y: p.y * scale, ...(p.arc === true ? { arc: true } : {}),
  }));
}

function freeglassEditCandidate(el, index, localPoint) {
  if (!Number.isInteger(index) || !Number.isFinite(localPoint?.x) || !Number.isFinite(localPoint?.y)) return null;
  const scale = Math.min(10, Math.max(0.1, el.params.scale || 1));
  const limit = 5000 * scale;
  const points = freeglassPoints(el);
  if (!points[index]) return null;
  points[index] = {
    x: Math.min(limit, Math.max(-limit, localPoint.x)),
    y: Math.min(limit, Math.max(-limit, localPoint.y)),
    ...(points[index].arc === true ? { arc: true } : {}),
  };
  if (!isSimpleBoundary(points)) return null;
  const b = boundaryBounds(points), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const shift = rotPt(cx, cy, el.rot || 0);
  return {
    x: el.x + shift.x,
    y: el.y + shift.y,
    vertices: points.map(p => ({
      x: (p.x - cx) / scale, y: (p.y - cy) / scale,
      ...(p.arc === true ? { arc: true } : {}),
    })),
  };
}

function rectAbsorb(w, h) {
  const x = w / 2, y = h / 2;
  return [
    { x1: -x, y1: -y, x2: x, y2: -y, kind: 'absorb' },
    { x1: x, y1: -y, x2: x, y2: y, kind: 'absorb' },
    { x1: x, y1: y, x2: -x, y2: y, kind: 'absorb' },
    { x1: -x, y1: y, x2: -x, y2: -y, kind: 'absorb' },
  ];
}

// One-sided detector housing: light is measured at the front face and the
// remaining enclosure simply absorbs it. This lets detectors provide a useful
// readout without pretending the qualitative tracer reports calibrated power.
function detectorSurfaces(w, h, detectorType, detectorData = {}) {
  const x = w / 2, y = h / 2;
  return [
    { x1: -x, y1: -y, x2: -x, y2: y, kind: 'detector', data: { aperture: h, detectorType, ...detectorData } },
    { x1: -x, y1: -y, x2: x, y2: -y, kind: 'absorb' },
    { x1: x, y1: -y, x2: x, y2: y, kind: 'absorb' },
    { x1: x, y1: y, x2: -x, y2: y, kind: 'absorb' },
  ];
}

function signalLamp(el, x, y) {
  const rd = detectorReading(el.id);
  const on = rd && rd.signal > 0.001;
  return `<circle cx="${x}" cy="${y}" r="3.1" fill="${on ? rd.color : '#88919b'}" opacity="${on ? 1 : 0.45}" ` +
    `stroke="#fff" stroke-width="0.8"/>`;
}

export function resolveDisplaySensor(display, elements = []) {
  const sensorId = typeof display?.params?.sensorId === 'string' ? display.params.sensorId : '';
  if (!sensorId || !Array.isArray(elements)) return null;
  return elements.find(candidate => candidate?.id === sensorId
    && candidate.id !== display.id
    && registry[candidate.type]?.readoutKind) || null;
}

export function displayDensity(displayScale = 1) {
  const scale = Math.min(3, Math.max(0.5, Number.isFinite(displayScale) ? displayScale : 1));
  return scale < 0.85 ? 'compact' : scale < 1.45 ? 'standard' : 'expanded';
}

function availableDisplaySensors(display, elements = []) {
  return Array.isArray(elements) ? elements.filter(candidate => candidate?.id !== display?.id
    && registry[candidate?.type]?.readoutKind) : [];
}

export function displayActionUpdate(display, action, elements = []) {
  if (!display || display.type !== 'display') return null;
  if (action === 'power') {
    const screenOn = display.params.screenOn === false;
    return { updates: { screenOn }, message: screenOn ? 'Sensor display on' : 'Sensor display standby' };
  }
  if (action === 'view') {
    const views = ['main', 'spectrum', 'detail'];
    const current = views.includes(display.params.displayView) ? display.params.displayView : 'main';
    const displayView = views[(views.indexOf(current) + 1) % views.length];
    return { updates: { displayView }, message: `Display view: ${displayView}` };
  }
  if (action === 'input') {
    const sensors = availableDisplaySensors(display, elements);
    if (!sensors.length) return { updates: { sensorId: '' }, message: 'No sensors available' };
    const ids = ['', ...sensors.map(sensor => sensor.id)];
    const current = ids.includes(display.params.sensorId) ? display.params.sensorId : '';
    const sensorId = ids[(ids.indexOf(current) + 1) % ids.length];
    const sensor = sensors.find(candidate => candidate.id === sensorId);
    return {
      updates: { sensorId },
      message: sensor ? `Display input: ${displaySensorName(sensor)}` : 'Display input disconnected',
    };
  }
  return null;
}

function displaySensorName(sensor) {
  const name = sensor?.label || registry[sensor?.type]?.label || 'Sensor';
  return String(name).trim().slice(0, 18) || 'Sensor';
}

function displaySpectrum(rd) {
  return rd.bandMax - rd.bandMin > 2
    ? `${Math.round(rd.bandMin)}–${Math.round(rd.bandMax)} nm`
    : `${Math.round(rd.wavelength)} nm`;
}

function shortSpectrum(rd) {
  return rd.bandMax - rd.bandMin > 2
    ? `λ${Math.round(rd.bandMin)}–${Math.round(rd.bandMax)}`
    : `λ${Math.round(rd.wavelength)} nm`;
}

function compactNumber(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1000) return '>999';
  if (value >= 100) return Math.round(value).toString();
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function shortPolarization(polarization = '') {
  return String(polarization)
    .replace(/^Linear /, 'LIN ')
    .replace(/^Elliptical /, 'ELLIP ')
    .replace(/^Circular$/, 'CIRC')
    .replace(/^Unpolarized$/, 'UNPOL')
    .replace(/^Mixed linear$/, 'MIX LIN')
    .slice(0, 12);
}

function displayViewName(view, rd) {
  if (view === 'spectrum') return 'λ SAMPLES';
  if (view === 'detail') return 'DETAIL';
  return rd?.readoutKind === 'camera' ? '1D PROFILE' : rd?.readoutKind === 'pmt' ? 'PMT OUTPUT' : 'REL SIGNAL';
}

function displayProfile(rd, { x = -35, width = 70, baseline = 5, height = 15 } = {}) {
  if (!Array.isArray(rd.profile) || !rd.profile.length) return '';
  const values = rd.profile.map(value => Number.isFinite(value) ? Math.max(0, value) : 0);
  const max = Math.max(...values, 1e-9);
  const binWidth = width / values.length;
  return values.map((value, i) => {
    if (value <= 1e-12) return '';
    const barHeight = Math.max(0.7, height * value / max);
    const color = rd.profileColors?.[i] || rd.color || '#d8e7ee';
    return `<rect data-profile-bin="${i}" x="${(x + i * binWidth).toFixed(2)}" y="${(baseline - barHeight).toFixed(2)}" ` +
      `width="${Math.max(0.35, binWidth - 0.45).toFixed(2)}" height="${barHeight.toFixed(2)}" rx="0.35" fill="${color}"/>`;
  }).join('');
}

function displaySpectrumPlot(rd, { baseline = 5, height = 15 } = {}) {
  const samples = Array.isArray(rd.spectrum) && rd.spectrum.length
    ? rd.spectrum : [{ wavelength: rd.wavelength, power: rd.signal, color: rd.color }];
  const lo = Number.isFinite(rd.bandMin) ? rd.bandMin : rd.wavelength;
  const hi = Number.isFinite(rd.bandMax) ? rd.bandMax : rd.wavelength;
  const span = Math.max(1, hi - lo);
  const max = Math.max(...samples.map(sample => sample.power || 0), 1e-9);
  const marks = samples.map((sample, index) => {
    const x = hi - lo < 1e-9 ? 0 : -34 + 68 * (sample.wavelength - lo) / span;
    const y = baseline - Math.max(1.2, height * Math.max(0, sample.power || 0) / max);
    return `<line data-spectrum-sample="${index}" x1="${x.toFixed(2)}" y1="${baseline}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" ` +
      `stroke="${sample.color || wavelengthToColor(sample.wavelength)}" stroke-width="${samples.length > 12 ? 1.4 : 2.2}" stroke-linecap="round"/>`;
  }).join('');
  return `<line x1="-35" y1="${baseline}" x2="35" y2="${baseline}" stroke="#294453" stroke-width="0.8"/>${marks}`;
}

// Two lines rather than sharing one row: a long sensor name (e.g.
// "PHOTODETECTOR") and the current readout mode used to compete for the
// same baseline and could overlap. Stacking them costs a little vertical
// room, which the rest of standardDisplayReading()'s layout below (all at
// y >= -9) already clears.
function displayHeader(sensorName, mode, pulse) {
  const headerName = sensorName.toUpperCase();
  const nameSize = Math.max(3.9, Math.min(6, 46 / Math.max(1, headerName.length * 0.62)));
  return `<text x="-36" y="-23.5" font-size="${nameSize.toFixed(2)}" font-weight="760" letter-spacing="0.35" fill="#9eb5c3">${esc(headerName)}</text>` +
    `<text x="-36" y="-16.5" font-size="4.5" font-weight="700" letter-spacing="0.35" fill="${pulse ? '#67e8f9' : '#648092'}">${esc(mode)}${pulse ? ' · PULSE' : ''}</text>`;
}

function displayDetail(rd) {
  const entries = rd.readoutKind === 'camera'
    ? [['SIGNAL', `Σw ${compactNumber(rd.signal)}`], ['CENTROID', rd.centroid == null ? '—' : `${rd.centroid.toFixed(2)} mm`],
      ['BINS', String(rd.profile?.length || 0)], ['λ SPAN', displaySpectrum(rd)]]
    : rd.readoutKind === 'pmt'
      ? [['INPUT', `Σw ${compactNumber(rd.signal)}`], ['OUTPUT', `${compactNumber(rd.outputSignal)} a.u.`],
        ['STATE', rd.saturated ? 'SATURATED' : 'LINEAR'], ['λ SPAN', displaySpectrum(rd)]]
      : [['SIGNAL', `Σw ${compactNumber(rd.signal)}`], ['SPOT', rd.samples > 1 ? `${rd.spotSpan.toFixed(1)} mm` : 'POINT'],
        ['POL', shortPolarization(rd.polarization)], ['λ SPAN', displaySpectrum(rd)]];
  return entries.map(([label, value], index) => {
    const x = index % 2 ? 4 : -35;
    const y = index < 2 ? -8 : 5;
    return `<text x="${x}" y="${y}" font-size="4.2" font-weight="700" letter-spacing="0.35" fill="#5f7d8e">${label}</text>` +
      `<text x="${x}" y="${y + 6}" font-size="5.2" font-weight="680" fill="#d9e8ee">${esc(value)}</text>`;
  }).join('');
}

function compactDisplayReading(sensorName, rd, view) {
  const header = `<text x="-35" y="-17" font-size="6" font-weight="760" letter-spacing="0.4" fill="#8fa9b8">${esc(sensorName.toUpperCase().slice(0, 11))}</text>`;
  if (view === 'spectrum') {
    const spectral = rd.bandMax - rd.bandMin > 2
      ? `${Math.round(rd.bandMin)}–${Math.round(rd.bandMax)}`
      : `${Math.round(rd.wavelength)}`;
    return header + `<text x="0" y="6" text-anchor="middle" font-size="${spectral.length > 6 ? 11 : 15}" font-weight="780" fill="${rd.color}">${spectral}</text>` +
      `<text x="0" y="13" text-anchor="middle" font-size="5" font-weight="700" fill="#7792a2">nm · DETECTED λ</text>`;
  }
  if (view === 'detail') {
    return header + `<text x="0" y="4" text-anchor="middle" font-size="8" font-weight="750" fill="#d9e8ee">${esc(shortPolarization(rd.polarization))}</text>` +
      `<text x="0" y="13" text-anchor="middle" font-size="5" fill="#7792a2">${esc(shortSpectrum(rd))}</text>`;
  }
  if (rd.readoutKind === 'camera' && rd.profile) {
    return header + displayProfile(rd, { x: -35, width: 70, baseline: 12, height: 20 }) +
      `<line x1="-35" y1="12.5" x2="35" y2="12.5" stroke="#294453" stroke-width="0.8"/>`;
  }
  const value = rd.readoutKind === 'pmt' ? rd.outputSignal : rd.signal;
  const unit = rd.readoutKind === 'pmt' ? 'a.u.' : 'Σw';
  return header + `<circle cx="-29" cy="2" r="2.3" fill="${rd.color}"/>` +
    `<text x="30" y="7" text-anchor="end" font-size="15" font-weight="780" fill="#ecf7fa">${compactNumber(value)}</text>` +
    `<text x="34" y="13" text-anchor="end" font-size="5" font-weight="700" fill="#7792a2">${unit}</text>`;
}

function standardDisplayReading(sensorName, rd, view, density) {
  const header = displayHeader(sensorName, displayViewName(view, rd), rd.pulse);
  if (view === 'detail') return header + displayDetail(rd);
  if (view === 'spectrum') {
    return header + displaySpectrumPlot(rd, { baseline: density === 'expanded' ? 4 : 6, height: 16 }) +
      `<text x="-35" y="14" font-size="5.2" fill="#8fa7b5">${esc(shortSpectrum(rd))}</text>` +
      `<text x="35" y="14" text-anchor="end" font-size="5.2" font-weight="700" fill="#d9e8ee">Σw ${compactNumber(rd.signal)}</text>`;
  }
  if (rd.readoutKind === 'camera' && rd.profile) {
    const expanded = density === 'expanded';
    const baseline = expanded ? 1 : 5;
    return header + displayProfile(rd, { x: -35, width: 70, baseline, height: expanded ? 14 : 16 }) +
      `<line x1="-35" y1="${baseline + 0.5}" x2="35" y2="${baseline + 0.5}" stroke="#294453" stroke-width="0.8"/>` +
      (expanded
        ? `<text x="-35" y="7" font-size="4" fill="#557181">−½</text><text x="0" y="7" text-anchor="middle" font-size="4" fill="#557181">0</text><text x="35" y="7" text-anchor="end" font-size="4" fill="#557181">+½ sensor</text>`
        : '') +
      `<text x="-35" y="14" font-size="5.2" fill="#8fa7b5">${esc(shortSpectrum(rd))}</text>` +
      `<text x="35" y="14" text-anchor="end" font-size="5.2" font-weight="700" fill="#d9e8ee">Σw ${compactNumber(rd.signal)}</text>`;
  }
  const value = rd.readoutKind === 'pmt' ? rd.outputSignal : rd.signal;
  const unit = rd.readoutKind === 'pmt' ? 'a.u.' : 'Σw';
  const stateText = rd.saturated ? 'SATURATED' : shortPolarization(rd.polarization);
  return header + `<circle cx="-31" cy="-2" r="2.3" fill="${rd.color}"/>` +
    `<text x="35" y="6" text-anchor="end" font-size="14" font-weight="780" fill="#ecf7fa">${compactNumber(value)}</text>` +
    `<text x="35" y="-6" text-anchor="end" font-size="4.7" font-weight="700" fill="#7892a1">${unit}</text>` +
    `<text x="-35" y="14" font-size="5.2" fill="#8fa7b5">${esc(shortSpectrum(rd))}</text>` +
    `<text x="35" y="14" text-anchor="end" font-size="5.2" font-weight="700" fill="${rd.saturated ? '#fb7185' : '#6ee7b7'}">${esc(stateText)}</text>`;
}

function displayControls(screenOn, density, hasReading) {
  const compact = density === 'compact';
  const labelSize = compact ? 4.1 : 4.5;
  return `<g class="display-control" data-display-action="power" role="button" aria-label="Toggle display power">` +
    `<title>Power</title><circle class="display-control-face" cx="-40" cy="27" r="4.4" fill="#14232c" stroke="${screenOn ? '#6ee7b7' : '#60727e'}" stroke-width="1.1"/>` +
    `<path d="M -40,23.8 L -40,27.1 M -42.2,25.2 A 3,3 0 1 0 -37.8,25.2" fill="none" stroke="${screenOn ? '#6ee7b7' : '#80909a'}" stroke-width="0.9" stroke-linecap="round"/></g>` +
    `<g class="display-control" data-display-action="input" role="button" aria-label="Cycle sensor input">` +
    `<title>Cycle sensor input</title><rect class="display-control-face" x="-30" y="22.5" width="23" height="9" rx="2" fill="#1b2b35" stroke="#536a78" stroke-width="0.9"/>` +
    `<text x="-18.5" y="28.6" text-anchor="middle" font-size="${labelSize}" font-weight="760" letter-spacing="0.35" fill="#b7c7d0">${compact ? 'IN' : 'INPUT'}</text></g>` +
    `<g class="display-control" data-display-action="view" role="button" aria-label="Cycle display view">` +
    `<title>Cycle display view</title><rect class="display-control-face" x="-3.5" y="22.5" width="23" height="9" rx="2" fill="#1b2b35" stroke="#536a78" stroke-width="0.9"/>` +
    `<text x="8" y="28.6" text-anchor="middle" font-size="${labelSize}" font-weight="760" letter-spacing="0.35" fill="#b7c7d0">${compact ? 'V' : 'VIEW'}</text></g>` +
    `<circle cx="41" cy="27" r="2.3" fill="${screenOn && hasReading ? '#34d399' : '#596b76'}"/>` +
    `<text x="33" y="29" text-anchor="end" font-size="3.6" font-weight="700" letter-spacing="0.35" fill="#708692">QUAL</text>`;
}

function displayScreenSVG(el, elements = []) {
  const scale = Math.min(3, Math.max(0.5, el.params.displayScale || 1));
  const density = displayDensity(scale);
  const screenOn = el.params.screenOn !== false;
  const view = ['main', 'spectrum', 'detail'].includes(el.params.displayView) ? el.params.displayView : 'main';
  const sensor = resolveDisplaySensor(el, elements);
  const hasConfiguredLink = Boolean(el.params.sensorId);
  const rd = sensor ? detectorReading(sensor.id) : null;
  const sensorName = sensor ? displaySensorName(sensor) : '';
  let screen;

  if (!screenOn) {
    screen = `<text x="0" y="-1" text-anchor="middle" font-size="9" font-weight="760" letter-spacing="1" fill="#415661">STANDBY</text>` +
      `<text x="0" y="10" text-anchor="middle" font-size="5" fill="#31454f">${sensor ? esc(sensorName) : 'input retained'}</text>`;
  } else if (!sensor) {
    screen = `<text x="0" y="-2" text-anchor="middle" font-size="9" font-weight="760" letter-spacing="0.8" fill="${hasConfiguredLink ? '#f59e0b' : '#94a3b8'}">${hasConfiguredLink ? 'LINK LOST' : 'SELECT INPUT'}</text>` +
      `<text x="0" y="10" text-anchor="middle" font-size="5.4" fill="#607887">${hasConfiguredLink ? 'Press INPUT to relink' : 'Press INPUT to connect'}</text>`;
  } else if (!rd) {
    screen = `<text x="-35" y="-20" font-size="5.7" font-weight="760" letter-spacing="0.45" fill="#8fa9b8">${esc(sensorName.toUpperCase())}</text>` +
      `<circle cx="-29" cy="1" r="2.2" fill="#64748b"/>` +
      `<text x="-23" y="3" font-size="8.5" font-weight="760" letter-spacing="0.7" fill="#a7b8c5">NO SIGNAL</text>` +
      `<text x="-35" y="14" font-size="5.2" fill="#607887">Σw 0.00 · aim at sensor face</text>`;
  } else {
    screen = density === 'compact'
      ? compactDisplayReading(sensorName, rd, view)
      : standardDisplayReading(sensorName, rd, view, density);
  }

  return `<g transform="scale(${scale})" data-display-density="${density}"><rect x="-49" y="-36" width="98" height="72" rx="6" fill="#24313b" stroke="#111b22" stroke-width="1.7"/>` +
    `<path d="M -43,-32 H 43" stroke="#40515d" stroke-width="0.8" opacity="0.7"/>` +
    `<rect x="-43" y="-29" width="86" height="47" rx="3" fill="${screenOn ? '#061822' : '#071219'}" stroke="#45606f" stroke-width="1.2"/>` +
    `<g font-family="ui-monospace, SFMono-Regular, Menlo, monospace">${screen}</g>` +
    `<circle cx="-49" cy="19" r="3.6" fill="#13212a" stroke="#89a2b2" stroke-width="1"/>` +
    `<circle cx="-49" cy="19" r="1.3" fill="${sensor ? '#60a5fa' : '#52636f'}"/>` +
    displayControls(screenOn, density, Boolean(rd)) +
    `</g>`;
}

export function displayCableSVG(display, elements = []) {
  const sensor = resolveDisplaySensor(display, elements);
  if (!sensor) return '';
  const rawPort = registry[sensor.type]?.dataPort;
  const localPort = typeof rawPort === 'function' ? rawPort(sensor) : rawPort;
  if (!Number.isFinite(localPort?.x) || !Number.isFinite(localPort?.y)) return '';
  const from = toWorld(sensor, localPort.x, localPort.y);
  const scale = Math.min(3, Math.max(0.5, display.params.displayScale || 1));
  const to = toWorld(display, -49 * scale, 19 * scale);
  if (![from.x, from.y, to.x, to.y].every(Number.isFinite)) return '';
  const direction = to.x >= from.x ? 1 : -1;
  const bend = Math.min(90, Math.max(24, Math.abs(to.x - from.x) * 0.42 + Math.abs(to.y - from.y) * 0.12));
  const path = `M ${from.x.toFixed(2)} ${from.y.toFixed(2)} C ${(from.x + direction * bend).toFixed(2)} ${from.y.toFixed(2)}, ${(to.x - direction * bend).toFixed(2)} ${to.y.toFixed(2)}, ${to.x.toFixed(2)} ${to.y.toFixed(2)}`;
  return `<g data-sensor-link="${esc(sensor.id)}" pointer-events="none">` +
    `<path d="${path}" fill="none" stroke="#f8fafc" stroke-width="5.2" stroke-linecap="round" opacity="0.9" vector-effect="non-scaling-stroke"/>` +
    `<path d="${path}" fill="none" stroke="#40586a" stroke-width="2.4" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` +
    `<circle cx="${from.x.toFixed(2)}" cy="${from.y.toFixed(2)}" r="3.2" fill="#1f3340" stroke="#9eb3c0" stroke-width="1" vector-effect="non-scaling-stroke"/>` +
    `</g>`;
}

function boxSVG(w, h, fill, stroke, text, textFill, flip) {
  return `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>` +
    (text ? `<text x="0" y="0" ${flip ? 'transform="rotate(180)"' : ''} text-anchor="middle" dominant-baseline="central" font-size="${Math.min(11, w / (text.length * 0.62))}" font-weight="600" fill="${textFill || '#fff'}">${esc(text)}</text>` : '');
}

function hatch(x, y1, y2, side, n) {
  // decorative hatching behind mirror-like surfaces
  if (!Number.isFinite(n) || n < 1 || y2 <= y1) return '';
  let s = '';
  const step = (y2 - y1) / n;
  for (let i = 0; i <= n; i++) {
    const y = y1 + i * step;
    s += `<line x1="${x}" y1="${y}" x2="${x + 6 * side}" y2="${y + 6}" stroke="#888" stroke-width="1"/>`;
  }
  return s;
}

// Wavefront shapers (SLM / DMD / deformable mirror) compose their optical
// function from up to 4 overlaid layers, applied in order to the reflected ray.
export const MAX_SHAPER_LAYERS = 4;
export function newShaperLayer() {
  return { type: 'lensarray', n: 3, f: 50, lines: 600, orders: '1', angle: 5, div: 8 };
}
const layersParam = { key: 'layers', label: 'Optical function', type: 'layers', def: [] };

// object shapes for image-formation diagrams, in unit coords:
// base at (0,0), tip at (0,-1); the traced image redraws the same shape
// scaled by the magnification (negative m = inverted)
// Normalized around y = 0 (the object's anchor, also the ray fan's origin):
// a shape spanning the full "height" param extends ±0.5 of it either side,
// so a 20mm-tall shape sits 10mm above and 10mm below the point that's
// actually irradiating — both the live icon (svg() below) and the redrawn
// image at the image plane (raytrace.js) read these same coordinates.
export const OBJ_SHAPES = {
  arrow: {
    lines: [[[0, 0.5], [0, -0.22]]],
    polys: [[[0, -0.5], [-0.17, -0.16], [0.17, -0.16]]],
  },
  F: {
    lines: [[[-0.06, 0.5], [-0.06, -0.5]], [[-0.06, -0.5], [0.42, -0.5]], [[-0.06, -0.05], [0.3, -0.05]]],
    polys: [],
  },
  tree: {
    // fir tree: short trunk + three stacked crown tiers
    lines: [[[0, 0.5], [0, 0.22]]],
    polys: [
      [[-0.36, 0.26], [0.36, 0.26], [0, -0.08]],
      [[-0.28, 0.02], [0.28, 0.02], [0, -0.3]],
      [[-0.2, -0.2], [0.2, -0.2], [0, -0.5]],
    ],
  },
};

// infographic card for the beam probe ("?" tool)
function probeCard(el, rd) {
  if (!rd) {
    return `<g transform="translate(14,-28)"><rect x="0" y="-12" width="56" height="24" rx="4" fill="#fff" stroke="#c9ced6"/>` +
      `<text x="28" y="0" text-anchor="middle" dominant-baseline="central" font-size="8" fill="#9aa2ad">no beam</text></g>`;
  }
  const prop = el.params.prop;
  const isSC = rd.bw >= 200;
  const c = wavelengthToColor(rd.wl);

  if (prop === 'wl') {
    const label = isSC ? `SC ${Math.round(rd.wl - rd.bw / 2)}–${Math.round(rd.wl + rd.bw / 2)} nm`
      : rd.bw > 0 ? `${Math.round(rd.wl)} ± ${Math.round(rd.bw / 2)} nm` : `${Math.round(rd.wl)} nm`;
    const w = label.length * 5.4 + 24;
    return `<g transform="translate(14,-28)"><rect x="0" y="-12" width="${w}" height="24" rx="4" fill="#fff" stroke="#c9ced6"/>` +
      `<circle cx="11" cy="0" r="4.5" fill="${isSC ? '#fff' : c}" ${isSC ? 'stroke="#888"' : ''}/>` +
      (isSC ? `<path d="M 7,0 A 4.5 4.5 0 0 1 15.5,0" fill="#e04040"/><path d="M 7,0 A 4.5 4.5 0 0 0 15.5,0" fill="#3050e0"/>` : '') +
      `<text x="20" y="0" font-size="9" dominant-baseline="central" fill="#333">${label}</text></g>`;
  }

  if (prop === 'pol') {
    let icon, lab;
    if (rd.pol === 'c') {
      icon = `<path d="M 8,2 A 8.2 8.2 0 1 1 3,-7.7" fill="none" stroke="#333" stroke-width="1.6"/>` +
        `<path d="M 3,-7.7 L 7.5,-8.5 L 4.5,-3.6 Z" fill="#333"/>`;
      lab = 'circular';
    } else if (typeof rd.pol === 'number') {
      icon = `<g transform="rotate(${-rd.pol})"><line x1="-8.5" y1="0" x2="8.5" y2="0" stroke="#333" stroke-width="1.6"/>` +
        `<path d="M 10,0 L 4.5,-3 L 4.5,3 Z M -10,0 L -4.5,-3 L -4.5,3 Z" fill="#333"/></g>`;
      lab = `linear ${Math.round(rd.pol)}°`;
    } else if (rd.pol === 'e') {
      // Elliptical: partial retardance (e.g. a waveplate not at 0/45/90° to
      // the input) leaves a nonzero circular component (s3) without being
      // purely circular — distinct from, and must not collapse into, the
      // true "no polarization at all" case below.
      const angle = rd.stokes ? stokesAngleDeg(rd.stokes) : 0;
      icon = `<g transform="rotate(${-angle})"><ellipse cx="0" cy="0" rx="8.5" ry="4" fill="none" stroke="#333" stroke-width="1.6"/>` +
        `<path d="M 8.5,0 L 4,-2.6 L 4,2.6 Z" fill="#333"/></g>`;
      lab = `elliptical ${Math.round(angle)}°`;
    } else {
      icon = `<g stroke="#666" stroke-width="1.3"><line x1="-8" y1="0" x2="8" y2="0"/><line x1="0" y1="-8" x2="0" y2="8"/><line x1="-5.7" y1="-5.7" x2="5.7" y2="5.7"/><line x1="-5.7" y1="5.7" x2="5.7" y2="-5.7"/></g>`;
      lab = 'unpolarized';
    }
    return `<g transform="translate(28,-40)"><circle r="14" fill="#fff" stroke="#c9ced6"/>` + icon +
      `<text x="0" y="24" text-anchor="middle" font-size="8" fill="#333">${lab}</text></g>`;
  }

  // spectrum plot: λ (nm) vs I (a.u.), schematic
  const W = 74, H = 50, x0 = 10, y0 = H - 13, pw = W - 18, ph = H - 24;
  let curve = '';
  if (isSC) {
    const hs = [0.35, 0.6, 0.85, 1, 0.9, 0.7, 0.45];
    const bw = pw / hs.length;
    hs.forEach((hgt, i) => {
      const wlBar = rd.wl - rd.bw / 2 + rd.bw * i / (hs.length - 1);
      curve += `<rect x="${x0 + i * bw}" y="${y0 - hgt * ph}" width="${bw}" height="${hgt * ph}" fill="${wavelengthToColor(wlBar)}" opacity="0.8"/>`;
    });
  } else {
    const xc = x0 + Math.min(1, Math.max(0, (rd.wl - 400) / 380)) * pw;
    const hw = Math.max(2.5, (rd.bw / 380) * pw / 2);
    curve = `<path d="M ${x0},${y0} L ${Math.max(x0, xc - 3 * hw)},${y0} C ${xc - hw},${y0} ${xc - hw * 0.7},${y0 - ph} ${xc},${y0 - ph} C ${xc + hw * 0.7},${y0 - ph} ${xc + hw},${y0} ${Math.min(x0 + pw, xc + 3 * hw)},${y0} L ${x0 + pw},${y0}" fill="none" stroke="${c}" stroke-width="1.5"/>`;
  }
  const vlabel = isSC ? `${Math.round(rd.wl - rd.bw / 2)}–${Math.round(rd.wl + rd.bw / 2)} nm`
    : rd.bw > 0 ? `${Math.round(rd.wl)} ± ${Math.round(rd.bw / 2)} nm` : `${Math.round(rd.wl)} nm`;
  return `<g transform="translate(14,-${H + 6})">` +
    `<rect x="0" y="0" width="${W}" height="${H}" rx="4" fill="#fff" stroke="#c9ced6"/>` +
    `<line x1="${x0}" y1="${y0}" x2="${x0 + pw}" y2="${y0}" stroke="#888" stroke-width="1"/>` +
    `<line x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0 - ph - 2}" stroke="#888" stroke-width="1"/>` +
    curve +
    `<text x="${x0 + pw}" y="${H - 4}" text-anchor="end" font-size="5.5" fill="#888">λ (nm)</text>` +
    `<text x="${x0 - 4}" y="${y0 - ph}" text-anchor="middle" font-size="5.5" fill="#888" transform="rotate(-90 ${x0 - 4} ${y0 - ph})">I (a.u.)</text>` +
    `<text x="${x0 + pw}" y="${y0 - ph - 1}" text-anchor="end" font-size="6.5" fill="#333">${vlabel}</text>` +
    `</g>`;
}

// samples can generate signal (fluorescence / SHG / THG / CARS) and
// independently transmit or block the excitation beam
function sampleModeParams() {
  return [
    { key: 'mode', label: 'Signal generated', type: 'select', def: 'none', options: [['none', 'None'], ['fluor', 'Fluorescence (isotropic)'], ['shg', 'SHG λ/2 (forward)'], ['thg', 'THG λ/3 (forward)'], ['cars', 'CARS (forward)']] },
    { key: 'fluorWl', label: 'Emission λ (nm)', type: 'number', min: 200, max: 1200, step: 5, def: 520, show: p => p.mode === 'fluor' },
    { key: 'carsWl', label: 'CARS λ (nm)', type: 'number', min: 200, max: 1200, step: 5, def: 660, show: p => p.mode === 'cars' },
    { key: 'transmitExc', label: 'Transmit excitation', type: 'checkbox', def: true },
    { key: 'transmission', label: 'Excitation transmission', type: 'number', min: 0, max: 1, step: 0.05, def: 0.8, show: p => p.transmitExc },
    { key: 'signalEff', label: 'Signal efficiency', type: 'number', min: 0, max: 1, step: 0.05, def: 0.1, show: p => p.mode !== 'none' },
  ];
}
// A piezo stage can translate the mounted specimen along its own XY (long
// axis, transverse to the beam) and Z (its own optical axis — a 2D stand-in
// for focus/depth) directions. Three scan patterns:
//   'xy'   — continuous bidirectional (triangle) sweep along XY only.
//   'z'    — continuous bidirectional sweep along Z only.
//   'sync' — a raster scan: XY sweeps continuously (one full left-to-right
//            or right-to-left pass per half period) while Z advances by one
//            discrete step each time XY completes a pass, bouncing back
//            down once it reaches the far end — a serpentine line-by-line
//            scan, not a calibrated piezo trajectory.
// Internally XY maps to the world-Y offset and Z maps to the world-X offset,
// matching the sample surface's local geometry (the beam crosses it at
// local x=0, spanning y across the clear aperture).
function triangleWave(timeSeconds, frequency, travel) {
  const phase = ((timeSeconds * frequency) % 1 + 1) % 1;
  const triangle = phase < 0.5 ? phase * 2 : 2 - phase * 2;
  return (triangle - 0.5) * travel;
}

function syncZOffset(timeSeconds, freqXY, travelZ, steps) {
  const n = Math.max(2, Math.round(steps) || 2);
  if (!(freqXY > 0)) return -travelZ / 2;
  const halfPeriod = 1 / (2 * freqXY);
  const sweepIndex = Math.floor(timeSeconds / halfPeriod);
  const cycleLen = 2 * (n - 1);
  const stepPhase = ((sweepIndex % cycleLen) + cycleLen) % cycleLen;
  const level = stepPhase <= n - 1 ? stepPhase : cycleLen - stepPhase;
  return -travelZ / 2 + (level / (n - 1)) * travelZ;
}

// A retroreflector's delay-line motion translates the whole element along
// its own apex axis (local x, pointing from the mouth toward the apex); the
// caller rotates this local offset into world space by the element's own
// rot, since the retroreflector — unlike the piezo stage — is routinely
// placed at an arbitrary angle to fold a beam path. The offset ranges over
// [0, travel], starting at 0 (the placed position, the shortest path) and
// moving only in the positive-x direction — away from the mouth, which
// always lengthens the round-trip optical path, never shortens it.
export function retroOffsetAt(params = {}, timeSeconds = 0) {
  if (params.moveMode !== 'linear' || !Number.isFinite(timeSeconds)) return { x: 0, y: 0 };
  const travel = Math.min(200, Math.max(0, params.travel ?? 50));
  const freq = Math.min(10, Math.max(0.01, params.freqHz ?? 0.2));
  return { x: triangleWave(timeSeconds, freq, travel) + travel / 2, y: 0 };
}

export function stageOffsetAt(params = {}, timeSeconds = 0) {
  const mode = params.pzMode || 'static';
  if (mode === 'static' || !Number.isFinite(timeSeconds)) return { x: 0, y: 0 };
  const travelXY = Math.min(150, Math.max(0, params.pzTravelXY ?? 12));
  const freqXY = Math.min(10, Math.max(0.01, params.pzFreqXY ?? 0.15));
  const travelZ = Math.min(150, Math.max(0, params.pzTravelZ ?? 8));
  if (mode === 'xy') return { x: 0, y: triangleWave(timeSeconds, freqXY, travelXY) };
  if (mode === 'z') {
    const freqZ = Math.min(10, Math.max(0.01, params.pzFreqZ ?? 0.1));
    return { x: triangleWave(timeSeconds, freqZ, travelZ), y: 0 };
  }
  if (mode === 'sync') {
    const steps = Math.min(50, Math.max(2, Math.round(params.pzZSteps ?? 5)));
    return { x: syncZOffset(timeSeconds, freqXY, travelZ, steps), y: triangleWave(timeSeconds, freqXY, travelXY) };
  }
  return { x: 0, y: 0 };
}

// A 2PP voxel's apparent size/opacity qualitatively broadens and fades the
// further the sample currently sits from the stage's nominal X=0 (focus)
// plane — a stand-in for real defocus-broadened, threshold-limited exposure
// in a system with no true third axis. `travelZ` scales what "far" means so
// the falloff tracks whatever axial range the user configured.
export function voxelDepthFactor(xOffset = 0, travelZ = 8) {
  const halfTravel = Math.max(1e-6, travelZ / 2);
  return Math.min(1, Math.abs(xOffset) / halfTravel);
}

// Fallback material-identity color, used only when no live traced hit is
// available yet (e.g. nothing currently illuminates the sample). Once a ray
// hits, the actual generated-signal wavelength (computed in raytrace.js)
// takes over for fluorescence and nonlinear signals.
function stageSampleColor(params) {
  if (params.mode === 'fluor') return wavelengthToColor(params.fluorWl);
  if (params.mode === 'cars') return wavelengthToColor(params.carsWl);
  if (params.sampleKind === 'resin') return '#9b5de5';
  if (params.sampleKind === 'nonlinear') return '#e6a23c';
  if (params.sampleKind === 'opaque') return '#69737e';
  return '#e2758f';
}

function stageSampleLabel(params) {
  if (params.sampleKind === 'resin') return 'Resin';
  if (params.sampleKind === 'fluorescent') return 'Fluor';
  if (params.sampleKind === 'nonlinear') return 'NL';
  if (params.sampleKind === 'opaque') return 'Opaque';
  return 'Sample';
}

// The material label always reads upright, independent of the stage's own
// rotation — same world-space, non-rotated pattern as the generic
// el.label/showLabel system in labelSVG() below.
export function stageSampleLabelSVG(el) {
  if (el.type !== 'stage' || !el.params.containsSample || el.params.showMaterialLabel === false) return '';
  const sz = getSize(el);
  const a = (el.rot || 0) * Math.PI / 180;
  const ey = (Math.abs(sz.w * Math.sin(a)) + Math.abs(sz.h * Math.cos(a))) / 2;
  const y = el.y - ey - 3;
  return `<text x="${el.x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-size="5.5" fill="#5b6472">${esc(stageSampleLabel(el.params))}</text>`;
}

function sampleSurfaces(el, h) {
  const p = el.params;
  const writeVoxel = p.sampleKind === 'resin' && p.voxelPreview === true;
  const reportHit = true;
  if (p.mode === 'fluor') {
    return [{ x1: 0, y1: -h, x2: 0, y2: h, kind: 'fluor', data: { wl: p.fluorWl, transmitExc: p.transmitExc, transmission: p.transmission, efficiency: p.signalEff, writeVoxel, reportHit } }];
  }
  if (p.mode === 'shg' || p.mode === 'thg' || p.mode === 'cars') {
    return [{ x1: 0, y1: -h, x2: 0, y2: h, kind: 'transmit', data: { convert: p.mode, outWl: p.carsWl, transmitExc: p.transmitExc, transmission: p.transmission, efficiency: p.signalEff, writeVoxel, reportHit } }];
  }
  return p.transmitExc
    ? [{ x1: 0, y1: -h, x2: 0, y2: h, kind: 'attenuate', data: { transmission: p.transmission, writeVoxel, reportHit } }]
    : rectAbsorb(8, 2 * h).map(s => ({ ...s, data: { reportHit } }));
}

// lens outline at x=cx: biconvex for f>=0, biconcave for f<0.
// The refracting faces are the two VERTICAL surfaces the beam crosses, so
// for a diverging lens those are the ones that curve inward (waist at mid).
function lensShape(cx, h, f) {
  const d = f >= 0
    ? `M ${cx},${-h} Q ${cx + 9},0 ${cx},${h} Q ${cx - 9},0 ${cx},${-h} Z`
    : `M ${cx - 6},${-h} L ${cx + 6},${-h} Q ${cx},0 ${cx + 6},${h} L ${cx - 6},${h} Q ${cx},0 ${cx - 6},${-h} Z`;
  return `<path d="${d}" fill="${GLASS}" stroke="${GLASS_S}" stroke-width="1.5"/>`;
}

function prismGeometry(el) {
  const height = Math.max(5, el.params.psize || 25.4);
  const apex = Math.min(80, Math.max(10, el.params.apex || 60)) * Math.PI / 180;
  const halfBase = height * Math.tan(apex / 2);
  return {
    top: { x: 0, y: -height / 2 },
    left: { x: -halfBase, y: height / 2 },
    right: { x: halfBase, y: height / 2 },
    width: 2 * halfBase,
    height,
  };
}

// laser body height grows with the beam width so a thick beam never
// exceeds its source
function laserH(el) {
  const p = el.params;
  return p.beamMode === 'beam' ? Math.max(34, p.beamWidth + 28) : 34;
}

// absorbing housing around a shaper's active face: top, bottom, back, and the
// two bits of front frame beyond the active area (face at x=fx, body to x=bx)
function shaperBody(fx, bx, L, hh) {
  return [
    { x1: fx, y1: -hh, x2: bx, y2: -hh, kind: 'absorb' },
    { x1: fx, y1: hh, x2: bx, y2: hh, kind: 'absorb' },
    { x1: bx, y1: -hh, x2: bx, y2: hh, kind: 'absorb' },
    { x1: fx, y1: -hh, x2: fx, y2: -L, kind: 'absorb' },
    { x1: fx, y1: L, x2: fx, y2: hh, kind: 'absorb' },
  ];
}

const P = {
  wavelength: { key: 'wavelength', label: 'Wavelength (nm)', type: 'number', min: 100, max: 12000, step: 1, def: 532 },
  autoColor: { key: 'autoColor', label: 'Color from λ', type: 'checkbox', def: true },
  color: { key: 'color', label: 'Beam color', type: 'color', def: '#e02020', show: p => !p.autoColor },
};

// Shared by every mirror in the Mirrors category: a reflectivity percentage
// and, once it's set below 100%, an opt-in toggle for actually drawing the
// leaked transmitted beam (default off — the leak is still fully traced for
// correct detector/power-budget readings either way, see raytrace.js's
// `hidden` ray flag; this only controls whether it's rendered).
function reflectivityParams() {
  return [
    { key: 'refl', label: 'Reflectivity (%)', type: 'number', min: 1, max: 100, step: 1, def: 100 },
    { key: 'showTransmitted', label: 'Display transmitted beam', type: 'checkbox', def: false, show: p => (p.refl ?? 100) < 100 },
  ];
}

// Ideal quasistatic galvo command. The mechanical mirror angle is what the
// user configures; a reflected beam changes direction by twice that amount.
// Animation deliberately omits inertia/resonance so the UI never implies a
// calibrated scanner transfer function.
export function galvoAngleAt(params = {}, timeSeconds = 0) {
  const center = Math.min(45, Math.max(-45, Number.isFinite(params.commandAngle) ? params.commandAngle : 0));
  if (params.scanMode !== 'sine' && params.scanMode !== 'triangle') {
    return Math.min(45, Math.max(-45, center));
  }
  const amplitude = Math.min(10, 45 - Math.abs(center),
    Math.max(0, Number.isFinite(params.scanAmplitude) ? params.scanAmplitude : 0));
  const frequency = Math.min(5000, Math.max(0.01, Number.isFinite(params.scanFrequencyHz) ? params.scanFrequencyHz : 100));
  const phase = (Number.isFinite(params.scanPhaseDeg) ? params.scanPhaseDeg : 0) * Math.PI / 180;
  const cycle = timeSeconds * frequency + phase / (2 * Math.PI);
  const frac = ((cycle % 1) + 1) % 1;
  const wave = params.scanMode === 'triangle'
    ? (frac < 0.25 ? 4 * frac : frac < 0.75 ? 2 - 4 * frac : 4 * frac - 4)
    : Math.sin(2 * Math.PI * frac);
  return Math.min(45, Math.max(-45, center + amplitude * wave));
}

export const registry = {

  // ---------------- Sources ----------------
  laser: {
    label: 'Laser', category: 'Sources', paletteOrder: 0, size: { w: 104, h: 38 },
    snapPt: { x: 52, y: 0 }, // beam exit aperture
    size_: el => ({ w: 104, h: laserH(el) + 4 }),
    params: [
      P.wavelength,
      { key: 'avgPowerW', label: 'Average power (W)', type: 'number', min: 0, max: 1000, step: 0.001, def: 0.01 },
      { key: 'beamMode', label: 'Beam style', type: 'select', def: 'line', options: [['line', 'Simple line'], ['beam', 'Beam with size']] },
      { key: 'beamWidth', label: 'Beam width (mm)', type: 'number', min: 1, max: 60, step: 0.5, def: 6, show: p => p.beamMode === 'beam' },
      { key: 'bwMode', label: 'Spectrum', type: 'select', def: 'mono', options: [['mono', 'Monochromatic'], ['band', 'Broadband'], ['sc', 'Supercontinuum (white)']] },
      { key: 'bandwidth', label: 'Bandwidth (nm)', type: 'number', min: 1, max: 400, step: 5, def: 40, show: p => p.bwMode === 'band' },
      { key: 'pol', label: 'Polarization (°)', type: 'number', min: 0, max: 180, step: 5, def: 0 },
      { key: 'temporalMode', label: 'Emission', type: 'select', def: 'cw', options: [['cw', 'Continuous wave'], ['pulsed', 'Pulsed']] },
      { key: 'repRateMHz', label: 'Repetition rate (MHz)', type: 'number', min: 0.001, max: 1000000, step: 1, def: 80, show: p => p.temporalMode === 'pulsed' },
      { key: 'pulseWidthFs', label: 'Pulse duration (fs)', type: 'number', min: 1, max: 1000000000, step: 10, def: 100, show: p => p.temporalMode === 'pulsed' },
      { key: 'pulsePhaseNs', label: 'Emission offset (ns)', type: 'number', min: -1000000, max: 1000000, step: 0.1, def: 0, show: p => p.temporalMode === 'pulsed' },
      P.autoColor, P.color,
    ],
    svg(el) {
      const h = laserH(el), hh = h / 2;
      const ap = el.params.beamMode === 'beam' ? Math.min(hh - 4, el.params.beamWidth / 2 + 3) : 6;
      const pulsed = el.params.temporalMode === 'pulsed';
      return `<rect x="-46" y="${-hh}" width="92" height="${h}" rx="4" fill="#3a3f46" stroke="#22252a" stroke-width="1.5"/>` +
        `<text x="0" y="${pulsed ? -3 : 0}" ${isFlipped(el) ? 'transform="rotate(180)"' : ''} text-anchor="middle" dominant-baseline="central" font-size="${pulsed ? 10 : 12}" font-weight="700" letter-spacing="1.5" fill="#fff">LASER</text>` +
        (pulsed ? `<g stroke="#8fd3ff" stroke-width="1.2" opacity="0.95"><path d="M -17,8 L -12,8 L -10,3 L -8,11 L -6,8 L -1,8"/><path d="M 3,8 L 8,8 L 10,3 L 12,11 L 14,8 L 19,8"/></g>` : '') +
        `<rect x="46" y="${-ap}" width="5" height="${2 * ap}" fill="#666" stroke="#444" stroke-width="1"/>`;
    },
    surfaces: el => rectAbsorb(92, laserH(el)),
    source(el) {
      const p = el.params;
      if (p.beamMode === 'beam') {
        // sample rays across the beam width; adjacent samples with an identical
        // interaction history are filled as an envelope strip, so a lenslet
        // array splits the beam into visibly separate focusing beamlets
        const K = 25, w = p.beamWidth;
        const out = [];
        for (let i = 0; i < K; i++) out.push({ x: 52, y: -w / 2 + w * i / (K - 1), dx: 1, dy: 0, sample: i });
        return out;
      }
      return [{ x: 52, y: 0, dx: 1, dy: 0 }];
    },
  },

  // Unified replacement for the old LED + Light source: one isotropic point
  // emitter. Rays are evanescent — they fade within ~110 mm (5x a fluorescent
  // specimen's range) unless a nearby lens / objective / fiber tip collects
  // them, which keeps 360° emission from flooding the canvas.
  pointsource: {
    label: 'Point source', category: 'Sources', paletteOrder: 2, size: { w: 30, h: 30 },
    aliases: ['led', 'lamp', 'light source', 'bulb', 'isotropic source', 'point emitter'],
    size_: el => ({ w: 30 * (el.params.displayScale || 1), h: 30 * (el.params.displayScale || 1) }),
    params: [
      { key: 'displayScale', label: 'Display scale', type: 'number', min: 0.5, max: 2.5, step: 0.1, def: 1 },
      P.wavelength,
      { key: 'bwMode', label: 'Spectrum', type: 'select', def: 'mono', options: [['mono', 'Monochromatic'], ['band', 'Broadband']] },
      { key: 'bandwidth', label: 'Spectrum width (nm)', type: 'number', min: 10, max: 600, step: 10, def: 400, show: p => p.bwMode === 'band' },
      { key: 'spread', label: 'Emission angle (°)', type: 'number', min: 10, max: 360, step: 10, def: 360 },
      { key: 'nrays', label: 'Rays', type: 'number', min: 4, max: 32, step: 2, def: 12 },
      P.autoColor, P.color,
    ],
    svg(el) {
      const c = el.params.autoColor === false && el.params.color ? el.params.color : wavelengthToColor(el.params.wavelength);
      let spokes = '';
      for (let i = 0; i < 8; i++) {
        const a = (i * 45) * Math.PI / 180;
        spokes += `<line x1="${(6 * Math.cos(a)).toFixed(1)}" y1="${(6 * Math.sin(a)).toFixed(1)}" x2="${(11 * Math.cos(a)).toFixed(1)}" y2="${(11 * Math.sin(a)).toFixed(1)}" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`;
      }
      return `<g transform="scale(${el.params.displayScale || 1})"><circle r="4.5" fill="${c}" stroke="#333" stroke-width="1"/>` + spokes + `</g>`;
    },
    source(el) {
      const { spread, nrays } = el.params, out = [];
      const n = Math.max(1, Math.round(nrays));
      for (let i = 0; i < n; i++) {
        // A full-circle source must not duplicate the -180°/+180° sample.
        const aDeg = spread >= 359.999
          ? 360 * i / n
          : (n === 1 ? 0 : -spread / 2 + spread * i / (n - 1));
        const a = aDeg * Math.PI / 180;
        out.push({ x: 0, y: 0, dx: Math.cos(a), dy: Math.sin(a), evan: true, evanLen: 110 });
      }
      return out;
    },
  },

  // ---------------- Mirrors ----------------
  mirror: {
    label: 'Mirror', category: 'Mirrors', paletteOrder: 0, size: { w: 14, h: 56 },
    params: [
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
      ...reflectivityParams(),
    ],
    size_: el => ({ w: 14, h: el.params.length + 6 }),
    svg(el) {
      const L = el.params.length / 2;
      return `<line x1="0" y1="${-L}" x2="0" y2="${L}" stroke="#444" stroke-width="3.5"/>` + hatch(-1.5, -L, L - 6, -1, Math.round(el.params.length / 8));
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'mirror', data: { refl: el.params.refl, showTransmitted: el.params.showTransmitted } }];
    },
  },

  galvo: {
    label: 'Galvo mirror', category: 'Mirrors', paletteOrder: 4, size: { w: 30, h: 40 },
    size_: el => {
      const L = Math.max(6, el.params.length || 20);
      const sweep = Math.abs(el.params.commandAngle || 0) + (el.params.scanMode === 'static' ? 0 : Math.abs(el.params.scanAmplitude || 0));
      const a = Math.min(45, sweep) * Math.PI / 180;
      return { w: Math.max(30, L * Math.sin(a) + 18), h: Math.max(40, L * Math.cos(a) + 18) };
    },
    params: [
      { key: 'length', label: 'Mirror size (mm)', type: 'number', min: 6, max: 60, step: 2, def: 20 },
      { key: 'commandAngle', label: 'Center mechanical angle (°)', type: 'number', min: -30, max: 30, step: 0.5, def: 0 },
      { key: 'scanMode', label: 'Scan waveform', type: 'select', def: 'static', options: [['static', 'Static'], ['sine', 'Sine scan'], ['triangle', 'Triangle scan']] },
      { key: 'scanAmplitude', label: 'Peak mechanical sweep (°)', type: 'number', min: 0, max: 10, step: 0.5, def: 1, show: p => p.scanMode !== 'static' },
      { key: 'scanFrequencyHz', label: 'Scan frequency (Hz)', type: 'number', min: 0.01, max: 5000, step: 1, def: 100, show: p => p.scanMode !== 'static' },
      { key: 'scanPhaseDeg', label: 'Scan phase (°)', type: 'number', min: -360, max: 360, step: 5, def: 0, show: p => p.scanMode !== 'static' },
      ...reflectivityParams(),
    ],
    svg(el) {
      const L = el.params.length / 2;
      const command = galvoAngleAt(el.params, el._animationTimeS || 0);
      return `<circle r="4.5" fill="#777" stroke="#444" stroke-width="1.2"/>` +
        `<g transform="rotate(${command})"><line x1="0" y1="${-L}" x2="0" y2="${L}" stroke="#444" stroke-width="3"/></g>` +
        `<path d="M -9,${-L - 3} A ${L + 5} ${L + 5} 0 0 1 9,${-L - 3}" fill="none" stroke="#999" stroke-width="1.2" stroke-dasharray="3 2"/>` +
        `<path d="M -9,${L + 3} A ${L + 5} ${L + 5} 0 0 0 9,${L + 3}" fill="none" stroke="#999" stroke-width="1.2" stroke-dasharray="3 2"/>` +
        (el.params.scanMode !== 'static' ? `<circle cx="10" cy="${-L - 5}" r="2.5" fill="#8b5cf6"/>` : '');
    },
    surfaces(el) {
      const L = el.params.length / 2;
      const a = galvoAngleAt(el.params, el._animationTimeS || 0) * Math.PI / 180;
      return [{
        x1: L * Math.sin(a), y1: -L * Math.cos(a), x2: -L * Math.sin(a), y2: L * Math.cos(a), kind: 'mirror',
        data: { refl: el.params.refl, showTransmitted: el.params.showTransmitted },
      }];
    },
  },

  retroreflector: {
    label: 'Retroreflector', category: 'Mirrors', paletteOrder: 5, size: { w: 24, h: 56 },
    size_: el => ({ w: el.params.length / 2 + 10, h: el.params.length + 10 }),
    params: [
      { key: 'moveHeading', label: 'Delay-line movement', type: 'section' },
      { key: 'moveMode', label: 'Motion', type: 'select', def: 'static', options: [['static', 'Static'], ['linear', 'Periodic linear']] },
      { key: 'travel', label: 'Travel range (mm)', type: 'number', min: 0, max: 200, step: 1, def: 50, show: p => p.moveMode === 'linear' },
      { key: 'freqHz', label: 'Frequency (Hz)', type: 'number', min: 0.01, max: 10, step: 0.01, def: 0.2, show: p => p.moveMode === 'linear' },
      { key: 'opticalHeading', label: 'Optical behavior', type: 'section' },
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
      ...reflectivityParams(),
    ],
    // Apex at the local origin (the element's anchor/pivot point) pointing
    // toward +x, with two mirror arms opening toward -x at exactly 45° each
    // — a right-angle "roof" corner reflector. In 2D this returns any
    // incoming ray exactly antiparallel to its incidence direction
    // (offset in y), independent of incidence angle within its aperture —
    // the defining property of a corner retroreflector, unlike a single
    // flat mirror whose return direction depends on incidence angle.
    svg(el) {
      const L = el.params.length / 2;
      return `<path d="M ${-L},${L} L 0,0 L ${-L},${-L}" fill="#e8eaee" fill-opacity="0.3" stroke="#444" stroke-width="3.5"/>`;
    },
    surfaces(el) {
      const L = el.params.length / 2;
      const data = { refl: el.params.refl, showTransmitted: el.params.showTransmitted };
      return [
        { x1: 0, y1: 0, x2: -L, y2: L, kind: 'mirror', data },
        { x1: 0, y1: 0, x2: -L, y2: -L, kind: 'mirror', data },
      ];
    },
  },

  cmirrorx: {
    label: 'Convex mirror', category: 'Mirrors', paletteOrder: 1, size: { w: 18, h: 56 },
    params: [
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
      { key: 'f', label: 'Focal length (mm)', type: 'number', min: 5, max: 2000, step: 5, def: -100, negative: true },
      ...reflectivityParams(),
    ],
    size_: el => ({ w: 18, h: el.params.length + 6 }),
    svg(el) {
      const L = el.params.length / 2;
      // bulges toward the incoming beam (from -x)
      return `<path d="M 0,${-L} Q -7,0 0,${L}" fill="none" stroke="#444" stroke-width="3.5"/>` + hatch(1, -L, L - 6, 1, Math.round(el.params.length / 8));
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'cmirror', data: { f: -Math.abs(el.params.f), refl: el.params.refl, showTransmitted: el.params.showTransmitted } }];
    },
  },

  cmirror: {
    label: 'Concave mirror', category: 'Mirrors', paletteOrder: 2, size: { w: 18, h: 56 },
    params: [
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
      { key: 'f', label: 'Focal length (mm)', type: 'number', min: 5, max: 2000, step: 5, def: 100 },
      ...reflectivityParams(),
    ],
    size_: el => ({ w: 18, h: el.params.length + 6 }),
    svg(el) {
      const L = el.params.length / 2;
      // hollow toward the incoming beam (from -x): focuses it
      return `<path d="M 0,${-L} Q 7,0 0,${L}" fill="none" stroke="#444" stroke-width="3.5"/>` + hatch(1, -L, L - 6, 1, Math.round(el.params.length / 8));
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'cmirror', data: { f: Math.abs(el.params.f), refl: el.params.refl, showTransmitted: el.params.showTransmitted } }];
    },
  },

  oap: {
    label: 'Parabolic mirror', category: 'Mirrors', paletteOrder: 3, size: { w: 40, h: 90 },
    params: [
      { key: 'length', label: 'Optic size', type: 'optsize', def: 80 },
      { key: 'f', label: 'Focal length (mm)', type: 'number', min: 5, max: 2000, step: 5, def: 50 },
      ...reflectivityParams(),
    ],
    size_: el => {
      const L = el.params.length / 2;
      const sag = (L * L) / (4 * Math.max(5, el.params.f));
      return { w: Math.max(20, 2 * sag + 14), h: el.params.length + 6 };
    },
    svg(el) {
      // true parabola x = -y²/(4f): vertex at the origin, opening toward the
      // incoming beam, focus at (-f, 0). Shorter f -> visibly deeper curve.
      const L = el.params.length / 2, f = Math.max(5, el.params.f);
      const N = 26;
      let dp = '';
      for (let i = 0; i <= N; i++) {
        const y = -L + (2 * L * i) / N;
        const x = -(y * y) / (4 * f);
        dp += (i ? ' L ' : 'M ') + x.toFixed(1) + ',' + y.toFixed(1);
      }
      let ticks = '';
      for (let y = -L + 4; y < L - 3; y += 8) {
        const x = -(y * y) / (4 * f);
        ticks += `<line x1="${(x + 1.5).toFixed(1)}" y1="${y.toFixed(1)}" x2="${(x + 7).toFixed(1)}" y2="${(y + 5).toFixed(1)}" stroke="#888" stroke-width="1"/>`;
      }
      return `<path d="${dp}" fill="none" stroke="#444" stroke-width="3.5" stroke-linejoin="round"/>` + ticks;
    },
    surfaces(el) {
      // real geometry: the parabola as a chain of small plane mirrors, so
      // reflection off the actual curve sends a collimated beam to the focus
      const L = el.params.length / 2, f = Math.max(5, el.params.f);
      // more segments for deeper curves so marginal rays still hit the focus
      const N = Math.min(64, Math.max(16, Math.round(L / 2 + (L * L) / (6 * f))));
      const segs = [];
      const data = { refl: el.params.refl, showTransmitted: el.params.showTransmitted };
      let py = -L, px = -(py * py) / (4 * f);
      for (let i = 1; i <= N; i++) {
        const y = -L + (2 * L * i) / N;
        const x = -(y * y) / (4 * f);
        segs.push({ x1: px, y1: py, x2: x, y2: y, kind: 'mirror', data });
        px = x; py = y;
      }
      return segs;
    },
  },

  // ---------------- Lenses ----------------
  lens: {
    label: 'Convex lens', category: 'Lenses', paletteOrder: 0, size: { w: 18, h: 56 },
    params: [
      { key: 'f', label: 'Focal length (mm)', type: 'number', min: -3000, max: 3000, step: 5, def: 100 },
      { key: 'dia', label: 'Diameter', type: 'optsize', def: 25.4 },
      { key: 'transEff', label: 'Transmission efficiency (%)', type: 'number', min: 1, max: 100, step: 1, def: 100 },
    ],
    size_: el => ({ w: 18, h: el.params.dia + 6 }),
    svg(el) { return lensShape(0, el.params.dia / 2, el.params.f); },
    surfaces(el) {
      const h = el.params.dia / 2;
      return [{ x1: 0, y1: -h, x2: 0, y2: h, kind: 'lens', data: { f: el.params.f, transEff: el.params.transEff } }];
    },
  },

  telescope: {
    label: 'Telescope (lens pair)', category: 'Lenses', paletteOrder: 2, size: { w: 174, h: 62 },
    size_: el => ({ w: Math.max(30, el.params.f1 + el.params.f2) + 26, h: (el.params.dia || 25.4) + 10 }),
    params: [
      { key: 'f1', label: 'Lens 1 focal (mm)', type: 'number', min: -3000, max: 3000, step: 5, def: 100 },
      { key: 'f2', label: 'Lens 2 focal (mm)', type: 'number', min: -3000, max: 3000, step: 5, def: 50 },
      { key: 'dia', label: 'Lens diameter', type: 'optsize', def: 25.4 },
      { key: 'transEff', label: 'Transmission efficiency (%)', type: 'number', min: 1, max: 100, step: 1, def: 100 },
    ],
    svg(el) {
      const p = el.params, s = Math.max(5, p.f1 + p.f2), h = (p.dia || 25.4) / 2;
      return `<line x1="${-s / 2}" y1="0" x2="${s / 2}" y2="0" stroke="#b6bdc6" stroke-width="1" stroke-dasharray="4 4"/>` +
        lensShape(-s / 2, h, p.f1) + lensShape(s / 2, h, p.f2);
    },
    surfaces(el) {
      // Each lens carries the same shared coating spec, so the pair's
      // overall throughput is transEff² — matching two real lenses with
      // matched AR coatings, consistent with how `dia` is already shared.
      const p = el.params, s = Math.max(5, p.f1 + p.f2), h = (p.dia || 25.4) / 2;
      return [
        { x1: -s / 2, y1: -h, x2: -s / 2, y2: h, kind: 'lens', data: { f: p.f1, transEff: p.transEff } },
        { x1: s / 2, y1: -h, x2: s / 2, y2: h, kind: 'lens', data: { f: p.f2, transEff: p.transEff } },
      ];
    },
  },

  objective: {
    // Back (tube-lens/infinity side, where a telescope or scan relay
    // delivers collimated light) is the wide barrel at local x=-16; front
    // (sample side) is the narrow tip and glass at local x=+16, which is
    // also where the single thin-lens surface actually bends rays — so the
    // drawing and the physics agree on which end focuses light.
    label: 'Objective', category: 'Lenses', paletteOrder: 3, size: { w: 36, h: 40 },
    snapPt: { x: 16, y: 0 }, // lens plane (sample-facing front tip)
    size_: el => ({ w: 36, h: (el.params.aperture || 20) + 20 }),
    params: [
      { key: 'f', label: 'Focal length (mm)', type: 'number', min: 1, max: 500, step: 1, def: 10 },
      { key: 'aperture', label: 'Clear aperture (mm)', type: 'number', min: 5, max: 100, step: 1, def: 20 },
      { key: 'transEff', label: 'Transmission efficiency (%)', type: 'number', min: 1, max: 100, step: 1, def: 100 },
    ],
    svg(el) {
      const h = (el.params.aperture || 20) / 2, outer = h + 7;
      return `<path d="M 16,${-h} L -2,${-outer} L -16,${-outer} L -16,${outer} L -2,${outer} L 16,${h} Z" fill="#8d98a5" stroke="#4d565f" stroke-width="1.5"/>` +
        `<line x1="-2" y1="${-outer}" x2="-2" y2="${outer}" stroke="#4d565f" stroke-width="1"/>` +
        `<rect x="14.5" y="${-h}" width="3" height="${2 * h}" fill="${GLASS}" stroke="${GLASS_S}" stroke-width="1"/>`;
    },
    surfaces(el) {
      const h = (el.params.aperture || 20) / 2;
      return [{ x1: 16, y1: -h, x2: 16, y2: h, kind: 'lens', data: { f: el.params.f, transEff: el.params.transEff } }];
    },
  },

  // ---------------- Filters & splitters ----------------
  dichroic: {
    label: 'Dichroic mirror', category: 'Filters & Splitters', size: { w: 14, h: 56 },
    params: [
      { key: 'dtype', label: 'Type', type: 'select', def: 'longpass', options: [['longpass', 'Longpass (transmit long λ)'], ['shortpass', 'Shortpass (transmit short λ)'], ['bandpass', 'Bandpass']] },
      { key: 'cutoff', label: 'Cutoff (nm)', type: 'number', min: 150, max: 8000, step: 5, def: 550, show: p => p.dtype !== 'bandpass' },
      { key: 'center', label: 'Band center (nm)', type: 'number', min: 150, max: 8000, step: 5, def: 550, show: p => p.dtype === 'bandpass' },
      { key: 'band', label: 'Band width (nm)', type: 'number', min: 1, max: 2000, step: 5, def: 50, show: p => p.dtype === 'bandpass' },
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
    ],
    size_: el => ({ w: 14, h: el.params.length + 6 }),
    svg(el) {
      const L = el.params.length / 2;
      return `<rect x="-3" y="${-L}" width="6" height="${el.params.length}" fill="#dfeef7" stroke="#5d7f96" stroke-width="1.5"/>` +
        `<line x1="-3" y1="${-L}" x2="-3" y2="${L}" stroke="#b04ad0" stroke-width="2"/>`;
    },
    surfaces(el) {
      const L = el.params.length / 2, p = el.params;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'dichroic', data: { dtype: p.dtype, cutoff: p.cutoff, center: p.center, band: p.band } }];
    },
  },

  filter: {
    label: 'Filter', category: 'Filters & Splitters', size: { w: 12, h: 42 },
    params: [
      { key: 'ftype', label: 'Type', type: 'select', def: 'bandpass', options: [['bandpass', 'Bandpass'], ['longpass', 'Longpass'], ['shortpass', 'Shortpass'], ['nd', 'Neutral density']] },
      { key: 'cutoff', label: 'Cutoff (nm)', type: 'number', min: 150, max: 8000, step: 5, def: 500, show: p => p.ftype === 'longpass' || p.ftype === 'shortpass' },
      { key: 'center', label: 'Band center (nm)', type: 'number', min: 150, max: 8000, step: 5, def: 525, show: p => p.ftype === 'bandpass' },
      { key: 'band', label: 'Band width (nm)', type: 'number', min: 1, max: 2000, step: 5, def: 40, show: p => p.ftype === 'bandpass' },
      { key: 'trans', label: 'Transmission (0–1)', type: 'number', min: 0, max: 1, step: 0.05, def: 0.5, show: p => p.ftype === 'nd' },
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
    ],
    size_: el => ({ w: 12, h: el.params.length + 6 }),
    svg(el) {
      const L = el.params.length / 2;
      const fill = el.params.ftype === 'nd' ? '#9aa0a6' : '#bfe3c9';
      return `<rect x="-2.5" y="${-L}" width="5" height="${el.params.length}" fill="${fill}" stroke="#557" stroke-width="1.5"/>`;
    },
    surfaces(el) {
      const L = el.params.length / 2, p = el.params;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'filter', data: { ftype: p.ftype, cutoff: p.cutoff, center: p.center, band: p.band, trans: p.trans } }];
    },
  },

  bs: {
    label: 'Beamsplitter', category: 'Filters & Splitters', size: { w: 30, h: 30 },
    size_: el => ({ w: (el.params.size || 26) + 4, h: (el.params.size || 26) + 4 }),
    params: [
      { key: 'ratio', label: 'Transmission (0–1)', type: 'number', min: 0, max: 1, step: 0.05, def: 0.5 },
      { key: 'size', label: 'Cube size', type: 'optsize', def: 25.4 },
    ],
    svg(el) {
      const s = (el.params.size || 26) / 2;
      return `<rect x="${-s}" y="${-s}" width="${2 * s}" height="${2 * s}" fill="${GLASS}" stroke="${GLASS_S}" stroke-width="1.5"/>` +
        `<line x1="${-s}" y1="${s}" x2="${s}" y2="${-s}" stroke="${GLASS_S}" stroke-width="1.5"/>`;
    },
    surfaces(el) {
      const s = (el.params.size || 26) / 2;
      return [{ x1: -s, y1: s, x2: s, y2: -s, kind: 'split', data: { ratio: el.params.ratio } }];
    },
  },

  // ---------------- Polarization ----------------
  polarizer: {
    label: 'Polarizer', category: 'Polarization', size: { w: 24, h: 56 },
    size_: el => ({ w: 24, h: el.params.length + 6 }),
    params: [
      { key: 'pangle', label: 'Axis angle (°)', type: 'number', min: 0, max: 180, step: 5, def: 0 },
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
    ],
    svg(el) {
      const L = el.params.length / 2, a = el.params.pangle;
      return `<rect x="-2.5" y="${-L}" width="5" height="${el.params.length}" fill="#cfd8e3" stroke="#54606e" stroke-width="1.4"/>` +
        `<g transform="rotate(${-a})"><circle r="8.5" fill="#fff" stroke="#54606e" stroke-width="1.2"/>` +
        `<line x1="0" y1="-6" x2="0" y2="6" stroke="#54606e" stroke-width="1.6"/>` +
        `<path d="M 0,-8 L -2.4,-4 L 2.4,-4 Z M 0,8 L -2.4,4 L 2.4,4 Z" fill="#54606e"/></g>`;
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'polarizer', data: { a: el.params.pangle } }];
    },
  },

  hwp: {
    label: 'λ/2 waveplate', category: 'Polarization', size: { w: 18, h: 56 },
    size_: el => ({ w: 18, h: el.params.length + 6 }),
    params: [
      { key: 'a', label: 'Fast axis (°)', type: 'number', min: 0, max: 180, step: 5, def: 22.5 },
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
    ],
    svg(el) {
      const L = el.params.length / 2;
      return `<rect x="-2.5" y="${-L}" width="5" height="${el.params.length}" fill="#f3e3c3" stroke="#a08340" stroke-width="1.4"/>` +
        `<text x="0" y="${-L - 6}" text-anchor="middle" dominant-baseline="central" font-size="8.5" fill="#7a6430" ${isFlipped(el) ? `transform="rotate(180 0 ${-L - 6})"` : ''}>λ/2</text>`;
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'wp', data: { a: el.params.a, half: true } }];
    },
  },

  qwp: {
    label: 'λ/4 waveplate', category: 'Polarization', size: { w: 18, h: 56 },
    size_: el => ({ w: 18, h: el.params.length + 6 }),
    params: [
      { key: 'a', label: 'Fast axis (°)', type: 'number', min: 0, max: 180, step: 5, def: 45 },
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
    ],
    svg(el) {
      const L = el.params.length / 2;
      return `<rect x="-2.5" y="${-L}" width="5" height="${el.params.length}" fill="#e8d5ef" stroke="#8a5fa8" stroke-width="1.4"/>` +
        `<text x="0" y="${-L - 6}" text-anchor="middle" dominant-baseline="central" font-size="8.5" fill="#6a4a80" ${isFlipped(el) ? `transform="rotate(180 0 ${-L - 6})"` : ''}>λ/4</text>`;
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'wp', data: { a: el.params.a, half: false } }];
    },
  },

  pbs: {
    label: 'Polarizing BS', category: 'Polarization', size: { w: 30, h: 30 },
    size_: el => ({ w: (el.params.size || 26) + 4, h: (el.params.size || 26) + 4 }),
    params: [{ key: 'size', label: 'Cube size', type: 'optsize', def: 25.4 }],
    svg(el) {
      const s = (el.params.size || 26) / 2;
      return `<rect x="${-s}" y="${-s}" width="${2 * s}" height="${2 * s}" fill="#d5e3f0" stroke="#3f6a92" stroke-width="1.6"/>` +
        `<line x1="${-s}" y1="${s}" x2="${s}" y2="${-s}" stroke="#3f6a92" stroke-width="1.6"/>` +
        `<text x="${-s}" y="${s + 8}" text-anchor="start" dominant-baseline="central" font-size="8.5" fill="#3f6a92" font-weight="600" ${isFlipped(el) ? `transform="rotate(180 ${-s} ${s + 8})"` : ''}>PBS</text>`;
    },
    surfaces(el) {
      const s = (el.params.size || 26) / 2;
      return [{ x1: -s, y1: s, x2: s, y2: -s, kind: 'pbs' }];
    },
  },

  isolator: {
    label: 'Optical isolator', category: 'Polarization', size: { w: 50, h: 26 },
    size_: el => ({ w: 50, h: (el.params.aperture || 22) + 4 }),
    params: [{ key: 'aperture', label: 'Clear aperture (mm)', type: 'number', min: 8, max: 100, step: 2, def: 22 }],
    svg(el) {
      const h = (el.params.aperture || 22) / 2;
      return `<rect x="-23" y="${-h}" width="46" height="${2 * h}" rx="${Math.min(11, h)}" fill="#6b7280" stroke="#3f4650" stroke-width="1.5"/>` +
        `<path d="M -12,0 L 10,0 M 10,0 L 3,-5 M 10,0 L 3,5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    },
    surfaces: el => {
      const h = (el.params.aperture || 22) / 2;
      return [{ x1: 0, y1: -h, x2: 0, y2: h, kind: 'isolator' }];
    },
  },

  // ---------------- Dispersive & apertures ----------------
  grating: {
    label: 'Diffraction grating', category: 'Dispersive & Apertures', size: { w: 16, h: 56 },
    params: [
      { key: 'lines', label: 'Lines / mm', type: 'number', min: 50, max: 3600, step: 50, def: 600 },
      { key: 'orders', label: 'Orders (e.g. -1,0,1)', type: 'text', def: '1' },
      { key: 'transmissive', label: 'Transmissive', type: 'checkbox', def: false },
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
    ],
    size_: el => ({ w: 16, h: el.params.length + 6 }),
    svg(el) {
      const L = el.params.length / 2;
      let ticks = '';
      for (let y = -L + 3; y <= L - 3; y += 5) ticks += `<line x1="0" y1="${y}" x2="4" y2="${y}" stroke="#333" stroke-width="1"/>`;
      return `<rect x="0" y="${-L}" width="6" height="${el.params.length}" fill="#e8e0f0" stroke="#5d5575" stroke-width="1.5"/>` + ticks;
    },
    surfaces(el) {
      const L = el.params.length / 2, p = el.params;
      const orders = [...new Set(String(p.orders).split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n)))].slice(0, 21);
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'grating', data: { d: 1e6 / p.lines, orders: orders.length ? orders : [1], transmissive: p.transmissive } }];
    },
  },

  slit: {
    label: 'Slit', category: 'Beam Block', size: { w: 10, h: 56 },
    params: [
      { key: 'gap', label: 'Gap (mm)', type: 'number', min: 0.5, max: 60, step: 0.5, def: 8 },
      { key: 'length', label: 'Plate size', type: 'optsize', def: 50.8 },
    ],
    size_: el => ({ w: 10, h: el.params.length + 6 }),
    svg(el) {
      const L = el.params.length / 2, g = Math.min(L, el.params.gap / 2);
      if (g >= L) return '';
      return `<rect x="-2.5" y="${-L}" width="5" height="${L - g}" fill="#333"/>` +
        `<rect x="-2.5" y="${g}" width="5" height="${L - g}" fill="#333"/>`;
    },
    surfaces(el) {
      const L = el.params.length / 2, g = Math.min(L, el.params.gap / 2);
      if (g >= L) return [];
      return [
        { x1: 0, y1: -L, x2: 0, y2: -g, kind: 'absorb' },
        { x1: 0, y1: g, x2: 0, y2: L, kind: 'absorb' },
      ];
    },
  },

  prism: {
    label: 'Prism', category: 'Dispersive & Apertures', size: { w: 44, h: 44 },
    size_: el => { const g = prismGeometry(el); return { w: g.width + 6, h: g.height + 6 }; },
    params: [
      { key: 'apex', label: 'Apex angle (°)', type: 'number', min: 10, max: 80, step: 5, def: 60 },
      { key: 'psize', label: 'Size', type: 'optsize', def: 25.4 },
    ],
    svg(el) {
      const g = prismGeometry(el);
      return `<path d="M ${g.top.x},${g.top.y} L ${g.left.x},${g.left.y} L ${g.right.x},${g.right.y} Z" fill="${GLASS}" stroke="${GLASS_S}" stroke-width="1.5"/>`;
    },
    surfaces(el) {
      const { left, top, right } = prismGeometry(el);
      const data = { material: 'bk7', transmission: 0.98 };
      return [
        { x1: left.x, y1: left.y, x2: top.x, y2: top.y, kind: 'refract', data: { ...data, topologyKey: 'edge-0' } },
        { x1: top.x, y1: top.y, x2: right.x, y2: right.y, kind: 'refract', data: { ...data, topologyKey: 'edge-1' } },
        { x1: right.x, y1: right.y, x2: left.x, y2: left.y, kind: 'refract', data: { ...data, topologyKey: 'edge-2' } },
      ];
    },
  },

  freeglass: {
    label: 'Freeform glass', category: 'Dispersive & Apertures', paletteOrder: 3,
    aliases: ['custom prism', 'polygon glass', 'arbitrary glass', 'glass polygon', 'curved glass', 'circular arc glass'],
    construction: { kind: 'polygon', pointsKey: 'vertices', minPoints: 3, circularArcs: true },
    size_(el) {
      const b = boundaryBounds(freeglassPoints(el));
      return { w: b.x1 - b.x0 + 6, h: b.y1 - b.y0 + 6 };
    },
    params: [
      { key: 'vertices', label: 'Boundary points', type: 'boundary', def: FREEGLASS_DEFAULT, hidden: true },
      { key: 'scale', label: 'Overall scale', type: 'number', min: 0.1, max: 10, step: 0.05, def: 1 },
      { key: 'material', label: 'Glass model', type: 'select', def: 'constant', options: [['constant', 'Constant index'], ['bk7', 'BK7-like dispersion']] },
      { key: 'ior', label: 'Refractive index', type: 'number', min: 1.01, max: 2.5, step: 0.01, def: 1.5, show: p => p.material === 'constant' },
      { key: 'transmission', label: 'Per-surface transmission', type: 'number', min: 0, max: 1, step: 0.01, def: 0.98 },
    ],
    svg(el) {
      const path = boundaryPathData(freeglassPoints(el));
      return `<path d="${path}" fill="${GLASS}" fill-opacity="0.72" stroke="${GLASS_S}" stroke-width="1.5" stroke-linejoin="round"/>`;
    },
    surfaces(el) {
      const points = freeglassPoints(el);
      const material = el.params.material === 'bk7' ? 'bk7' : undefined;
      return boundarySegments(points).map((segment, i) => ({
        x1: segment.a.x, y1: segment.a.y, x2: segment.b.x, y2: segment.b.y, kind: 'refract',
        data: {
          material, ior: el.params.ior, transmission: el.params.transmission,
          topologyKey: `edge-${i}`,
          ...(segment.kind === 'arc'
            ? { arcPoint: { x: segment.through.x, y: segment.through.y } }
            : {}),
        },
      }));
    },
    editPoints: {
      get: freeglassPoints,
      candidate: freeglassEditCandidate,
      hint: 'blue anchors and purple curve nodes reshape the boundary',
    },
    hitTest(el, localPoint, tolerance = 4) {
      const points = freeglassPoints(el);
      const sampled = sampleBoundary(points, { maxAngle: Math.PI / 90 });
      return pointInBoundary(localPoint, points)
        || sampled.some((a, i) => distToSegment(localPoint, a, sampled[(i + 1) % sampled.length]) <= tolerance);
    },
    containsLocal(el, localPoint) { return pointInBoundary(localPoint, freeglassPoints(el)); },
    refractiveIndex(el, wavelength = 550) {
      return el.params.material === 'bk7'
        ? 1.5046 + 4680 / (wavelength * wavelength)
        : Math.min(2.5, Math.max(1.01, el.params.ior || 1.5));
    },
  },

  diffuser: {
    label: 'Diffuser', category: 'Dispersive & Apertures', size: { w: 14, h: 56 },
    size_: el => ({ w: 14, h: el.params.length + 6 }),
    params: [
      { key: 'div', label: 'Divergence (°)', type: 'number', min: 0.5, max: 40, step: 0.5, def: 8 },
      { key: 'length', label: 'Optic size', type: 'optsize', def: 25.4 },
    ],
    svg(el) {
      const L = el.params.length / 2;
      let rough = `M -3,${-L}`;
      for (let y = -L; y < L - 1; y += 3) rough += ` L ${-3 - (y % 6 === 0 ? 1.8 : 0.4)},${y + 1.5}`;
      rough += ` L -3,${L}`;
      return `<rect x="-3" y="${-L}" width="6" height="${el.params.length}" fill="#eceef1" stroke="#6b7280" stroke-width="1.3"/>` +
        `<path d="${rough}" fill="none" stroke="#6b7280" stroke-width="1"/>`;
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{ x1: 0, y1: -L, x2: 0, y2: L, kind: 'diffuser', data: { div: el.params.div } }];
    },
  },

  // ---------------- Wavefront shaping ----------------
  slm: {
    label: 'SLM', category: 'Wavefront Shaping', size: { w: 30, h: 50 },
    snapPt: { x: -9, y: 0 }, // active face
    params: [
      { key: 'transmissive', label: 'Transmissive', type: 'checkbox', def: false },
      { key: 'length', label: 'Active size (mm)', type: 'number', min: 10, max: 100, step: 2, def: 40 },
      { key: 'zeroOrder', label: '0th-order reflection', type: 'checkbox', def: false },
      { key: 'zeroFrac', label: '0th-order fraction (0–1)', type: 'number', min: 0.01, max: 0.9, step: 0.01, def: 0.1, show: p => p.zeroOrder },
      layersParam,
    ],
    size_: el => ({ w: 30, h: el.params.length + 10 }),
    svg(el) {
      const L = el.params.length / 2;
      let px = '';
      for (let y = -L + 2; y < L - 1; y += 5) px += `<line x1="-11" y1="${y}" x2="-7" y2="${y}" stroke="#4ac0b0" stroke-width="2.5"/>`;
      return `<rect x="-9" y="${-L - 3}" width="20" height="${el.params.length + 6}" rx="2" fill="#3a4750" stroke="#222b31" stroke-width="1.5"/>` + px +
        `<text x="3" y="0" text-anchor="middle" dominant-baseline="central" font-size="8.5" font-weight="600" fill="#fff" transform="rotate(${sideTextRot(el)} 3 0)">SLM</text>`;
    },
    surfaces(el) {
      const L = el.params.length / 2;
      const body = el.params.transmissive ? [] : shaperBody(-9, 11, L, L + 3);
      return [{
        x1: -9, y1: -L, x2: -9, y2: L, kind: 'shaper',
        data: {
          layers: el.params.layers || [], length: el.params.length, transmissive: !!el.params.transmissive,
          zeroOrder: !!el.params.zeroOrder, zeroFrac: el.params.zeroFrac || 0.1,
        },
      }, ...body];
    },
  },

  dmd: {
    label: 'DMD', category: 'Wavefront Shaping', size: { w: 30, h: 50 },
    snapPt: { x: -9, y: 0 }, // active face
    params: [
      { key: 'length', label: 'Active size (mm)', type: 'number', min: 10, max: 100, step: 2, def: 40 },
      { key: 'tilt', label: 'Micromirror tilt (°)', type: 'number', min: 1, max: 20, step: 0.5, def: 12 },
      { key: 'pitch', label: 'Pattern pitch (mm)', type: 'number', min: 1, max: 40, step: 0.5, def: 8 },
      { key: 'duty', label: 'ON fraction (0–1)', type: 'number', min: 0.05, max: 0.95, step: 0.05, def: 0.5 },
      { key: 'routeOff', label: 'Show OFF order', type: 'checkbox', def: false },
    ],
    size_: el => ({ w: 30, h: el.params.length + 10 }),
    svg(el) {
      const L = el.params.length / 2;
      let mm = '';
      for (let y = -L + 4; y < L - 2; y += 6) mm += `<line x1="-11" y1="${y + 2}" x2="-7" y2="${y - 2}" stroke="#cfd6dd" stroke-width="1.6"/>`;
      return `<rect x="-9" y="${-L - 3}" width="20" height="${el.params.length + 6}" rx="2" fill="#2e3a42" stroke="#1b2329" stroke-width="1.5"/>` + mm +
        `<text x="3" y="0" text-anchor="middle" dominant-baseline="central" font-size="8.5" font-weight="600" fill="#fff" transform="rotate(${sideTextRot(el)} 3 0)">DMD</text>`;
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{
        x1: -9, y1: -L, x2: -9, y2: L, kind: 'dmd',
        data: {
          length: el.params.length, tilt: el.params.tilt, pitch: el.params.pitch,
          duty: el.params.duty, routeOff: el.params.routeOff,
        },
      }, ...shaperBody(-9, 11, L, L + 3)];
    },
  },

  dm: {
    label: 'Deformable mirror', category: 'Wavefront Shaping', size: { w: 22, h: 56 },
    params: [
      { key: 'length', label: 'Aperture (mm)', type: 'number', min: 10, max: 100, step: 2, def: 50 },
      { key: 'f', label: 'Defocus focal length (mm)', type: 'number', min: -3000, max: 3000, step: 5, def: 200 },
      { key: 'steer', label: 'Tip / tilt (°)', type: 'number', min: -30, max: 30, step: 0.5, def: 0 },
    ],
    size_: el => ({ w: 22, h: el.params.length + 6 }),
    svg(el) {
      const L = el.params.length / 2;
      // wavy membrane
      const nW = Math.max(3, Math.round(el.params.length / 12));
      const step = el.params.length / nW;
      let d = `M 0,${-L}`, side = 1;
      for (let i = 0; i < nW; i++) {
        const y = -L + i * step;
        d += ` Q ${3 * side},${y + step / 2} 0,${y + step}`;
        side = -side;
      }
      let act = '';
      for (let y = -L + 2; y < L - 4; y += 7) act += `<rect x="4" y="${y}" width="4" height="4" fill="#8d98a5"/>`;
      return `<rect x="8" y="${-L}" width="4" height="${el.params.length}" fill="#4d565f"/>` + act +
        `<path d="${d}" fill="none" stroke="#444" stroke-width="2.5"/>`;
    },
    surfaces(el) {
      const L = el.params.length / 2;
      return [{
        x1: 0, y1: -L, x2: 0, y2: L, kind: 'dm',
        data: { f: el.params.f, steer: el.params.steer },
      }, ...shaperBody(0, 12, L, L)];
    },
  },

  // ---------------- Detectors ----------------
  detector: {
    label: 'Photodetector', category: 'Detectors', readoutKind: 'detector', size: { w: 40, h: 30 },
    snapPt: { x: -19, y: 0 }, // entrance window
    dataPort: { x: 20, y: 0 },
    size_: el => ({ w: 40, h: (el.params.aperture || 26) + 4 }),
    params: [{ key: 'aperture', label: 'Sensor height (mm)', type: 'number', min: 6, max: 120, step: 2, def: 26 }],
    svg(el) {
      const h = el.params.aperture || 26;
      return boxSVG(36, h, '#4b5563', '#2b333d', 'PD', null, isFlipped(el)) +
        `<rect x="-19.5" y="${-(h - 8) / 2}" width="3" height="${h - 8}" fill="#93c5fd" stroke="#2b333d" stroke-width="1"/>` +
        signalLamp(el, 11, -h / 2 + 5);
    },
    surfaces: el => detectorSurfaces(38, el.params.aperture || 26, 'Photodetector'),
  },

  pmt: {
    label: 'PMT', category: 'Detectors', readoutKind: 'pmt', size: { w: 54, h: 30 },
    snapPt: { x: -25, y: 0 }, // entrance window
    dataPort: { x: 27, y: 0 },
    size_: el => ({ w: 54, h: (el.params.aperture || 26) + 4 }),
    params: [
      { key: 'aperture', label: 'Photocathode height (mm)', type: 'number', min: 6, max: 120, step: 2, def: 26 },
      { key: 'gain', label: 'Qualitative gain', type: 'number', min: 1, max: 1000, step: 1, def: 10 },
      { key: 'saturation', label: 'Output saturation', type: 'number', min: 1, max: 10000, step: 10, def: 100 },
    ],
    svg(el) {
      const h = el.params.aperture || 26;
      return `<rect x="-25" y="${-h / 2}" width="50" height="${h}" rx="${Math.min(13, h / 2)}" fill="#4b5563" stroke="#2b333d" stroke-width="1.5"/>` +
        `<rect x="-27" y="${-(h - 8) / 2}" width="4" height="${h - 8}" fill="#93c5fd" stroke="#2b333d" stroke-width="1"/>` +
        `<text x="2" y="0" ${isFlipped(el) ? 'transform="rotate(180 2 0)"' : ''} text-anchor="middle" dominant-baseline="central" font-size="10" font-weight="600" fill="#fff">PMT</text>` +
        signalLamp(el, 16, -h / 2 + 6);
    },
    surfaces: el => detectorSurfaces(52, el.params.aperture || 26, 'PMT', { gain: el.params.gain, saturation: el.params.saturation }),
  },

  camera: {
    label: 'Camera', category: 'Detectors', readoutKind: 'camera', size: { w: 44, h: 34 },
    snapPt: { x: -22, y: 0 }, // sensor face
    dataPort: { x: 22, y: 0 },
    size_: el => ({ w: 44, h: (el.params.ch || 30) + 4 }),
    params: [
      { key: 'ch', label: 'Sensor height (mm)', type: 'number', min: 20, max: 150, step: 2, def: 30 },
      { key: 'pixels', label: '1D pixels', type: 'number', min: 8, max: 64, step: 1, def: 16 },
    ],
    svg(el) {
      const h = el.params.ch || 30;
      return boxSVG(40, h, '#4b5563', '#2b333d', 'CAM', null, isFlipped(el)) +
        `<rect x="-24" y="${-(h - 16) / 2}" width="5" height="${h - 16}" fill="#333" stroke="#2b333d"/>` +
        signalLamp(el, 13, -h / 2 + 7);
    },
    surfaces: el => detectorSurfaces(44, el.params.ch || 30, 'Camera sensor', { pixels: el.params.pixels }),
  },

  eye: {
    label: 'Human eye', category: 'Detectors', readoutKind: 'retina', size: { w: 36, h: 36 },
    snapPt: { x: -15, y: 0 }, // pupil
    dataPort: el => ({ x: (el.params.diameter || 30) / 2 + 3, y: 0 }),
    size_: el => ({ w: (el.params.diameter || 30) + 6, h: (el.params.diameter || 30) + 6 }),
    params: [
      { key: 'diameter', label: 'Eye diameter (mm)', type: 'number', min: 18, max: 60, step: 1, def: 30 },
      { key: 'pupil', label: 'Pupil diameter (mm)', type: 'number', min: 2, max: 12, step: 0.5, def: 12 },
      { key: 'focus', label: 'Lens focal length (mm)', type: 'number', min: 20, max: 35, step: 0.5, def: 30 },
    ],
    svg(el) {
      const scale = (el.params.diameter || 30) / 30;
      return `<g transform="scale(${scale})"><circle r="15" fill="#fff" stroke="#4d565f" stroke-width="1.5"/>` +
        // cornea bulge over the pupil
        `<path d="M -14.2,-7 Q -21,0 -14.2,7" fill="rgba(160,200,240,0.45)" stroke="#4a7fa8" stroke-width="1.2"/>` +
        // iris above and below the pupil
        `<path d="M -14.5,-9 L -10.5,-5.5" stroke="#7a5230" stroke-width="2.4" stroke-linecap="round"/>` +
        `<path d="M -14.5,9 L -10.5,5.5" stroke="#7a5230" stroke-width="2.4" stroke-linecap="round"/>` +
        // crystalline lens
        `<ellipse cx="-8.5" cy="0" rx="3" ry="6.5" fill="#cfe4f5" stroke="#4a7fa8" stroke-width="1"/>` +
        // retina
        `<path d="M 7,-13 A 15 15 0 0 1 7,13" fill="none" stroke="#c86a6a" stroke-width="2.5"/></g>`;
    },
    surfaces(el) {
      // the pupil acts as an ideal lens that focuses collimated light onto
      // the retina; the rest of the eyeball absorbs
      const scale = (el.params.diameter || 30) / 30;
      const radius = 15 * scale, retina = 13 * scale;
      const h = Math.min(radius * 0.8, Math.max(1, el.params.pupil / 2));
      return [
        { x1: -radius, y1: -h, x2: -radius, y2: h, kind: 'lens', data: { f: el.params.focus } },
        { x1: -radius, y1: -radius, x2: -radius, y2: -h, kind: 'absorb' },
        { x1: -radius, y1: h, x2: -radius, y2: radius, kind: 'absorb' },
        { x1: -radius, y1: -radius, x2: radius, y2: -radius, kind: 'absorb' },
        { x1: -radius, y1: radius, x2: radius, y2: radius, kind: 'absorb' },
        { x1: radius, y1: -retina, x2: radius, y2: retina, kind: 'detector', data: { aperture: 2 * retina, detectorType: 'Retina' } },
      ];
    },
  },

  display: {
    label: 'Sensor display', category: 'Detectors', paletteOrder: 10, size: { w: 98, h: 72 },
    aliases: ['screen', 'monitor', 'readout', 'oscilloscope', 'data acquisition', 'DAQ'],
    rotatable: false,
    paramsTitle: 'Signal connection',
    size_: el => {
      const scale = Math.min(3, Math.max(0.5, el.params.displayScale || 1));
      return { w: 98 * scale, h: 72 * scale };
    },
    params: [
      { key: 'sensorId', label: 'Sensor input', type: 'sensor', def: '' },
      { key: 'displayScale', label: 'Display scale', type: 'number', min: 0.5, max: 3, step: 0.1, def: 1 },
      { key: 'screenOn', label: 'Power', type: 'checkbox', def: true, hidden: true },
      { key: 'displayView', label: 'View', type: 'select', def: 'main', options: [['main', 'Primary'], ['spectrum', 'Wavelength samples'], ['detail', 'Detail']], hidden: true },
    ],
    directHint: 'Use the blue handles to resize · PWR, INPUT, and VIEW operate directly on the display.',
    svg: displayScreenSVG,
    surfaces: () => [],
  },

  beamdump: {
    label: 'Beam dump', category: 'Beam Block', size: { w: 24, h: 26 },
    size_: el => ({ w: 24, h: (el.params.aperture || 22) + 4 }),
    params: [{ key: 'aperture', label: 'Absorber height (mm)', type: 'number', min: 6, max: 120, step: 2, def: 22 }],
    svg(el) {
      const h = (el.params.aperture || 22) / 2;
      return `<path d="M -10,${-h} L 10,${-h} L 10,${h} L -10,${h} Z M -10,${-h} L 4,0 L -10,${h}" fill="#26292e" stroke="#111" stroke-width="1.5"/>`;
    },
    surfaces: el => rectAbsorb(20, el.params.aperture || 22),
  },

  // ---------------- Modulators & misc ----------------
  aom: {
    label: 'AOM', category: 'Modulators', size: { w: 44, h: 30 },
    size_: el => ({ w: 44, h: (el.params.aperture || 26) + 4 }),
    params: [
      { key: 'aperture', label: 'Active aperture (mm)', type: 'number', min: 6, max: 100, step: 2, def: 26 },
      { key: 'deflect', label: 'Deflection (°)', type: 'number', min: -45, max: 45, step: 0.5, def: 4 },
      { key: 'rfMHz', label: 'RF frequency (MHz)', type: 'number', min: -10000, max: 10000, step: 1, def: 80 },
      { key: 'zero', label: 'Keep 0th order', type: 'checkbox', def: false },
      { key: 'eff', label: 'Efficiency (0–1)', type: 'number', min: 0, max: 1, step: 0.05, def: 0.85 },
      { key: 'modulate', label: 'Modulate RF drive', type: 'checkbox', def: false },
      { key: 'modShape', label: 'Modulation waveform', type: 'select', def: 'square', options: [['square', 'RF on/off'], ['sine', 'Sinusoidal intensity']], show: p => p.modulate },
      { key: 'modFreqMHz', label: 'Modulation frequency (MHz)', type: 'number', min: 0.000001, max: 1000, step: 0.001, def: 1, show: p => p.modulate },
      { key: 'chopDuty', label: 'On fraction (0–1)', type: 'number', min: 0.05, max: 0.95, step: 0.05, def: 0.5, show: p => p.modulate && p.modShape !== 'sine' },
      { key: 'modDepth', label: 'Modulation depth (0–1)', type: 'number', min: 0, max: 1, step: 0.05, def: 1, show: p => p.modulate && p.modShape === 'sine' },
      { key: 'phaseNs', label: 'Modulation offset (ns)', type: 'number', min: -1000000, max: 1000000, step: 0.1, def: 0, show: p => p.modulate },
    ],
    svg(el) { return boxSVG(40, el.params.aperture || 26, '#c9b458', '#8a7a2e', 'AOM', '#3d3616', isFlipped(el)); },
    surfaces(el) {
      const p = el.params;
      return [{
        x1: 0, y1: -(p.aperture || 26) / 2, x2: 0, y2: (p.aperture || 26) / 2, kind: 'aom',
        data: {
          deflect: p.deflect, rfMHz: p.rfMHz, zero: p.zero, eff: p.eff,
          gate: p.modulate ? {
            frequencyMHz: p.modFreqMHz, duty: p.chopDuty, phaseNs: p.phaseNs,
            shape: p.modShape, depth: p.modDepth,
          } : null,
        },
      }];
    },
  },

  aotf: {
    label: 'AOTF', category: 'Modulators', size: { w: 56, h: 30 },
    size_: el => ({ w: 56, h: (el.params.aperture || 26) + 4 }),
    params: [
      { key: 'aperture', label: 'Active aperture (mm)', type: 'number', min: 6, max: 100, step: 2, def: 26 },
      { key: 'center', label: 'Selected wavelength (nm)', type: 'number', min: 150, max: 8000, step: 1, def: 532 },
      { key: 'band', label: 'Passband width (nm)', type: 'number', min: 0.5, max: 2000, step: 0.5, def: 1 },
      { key: 'deflect', label: 'Deflection (°)', type: 'number', min: -45, max: 45, step: 0.5, def: 4 },
      { key: 'rfMHz', label: 'RF frequency (MHz)', type: 'number', min: -10000, max: 10000, step: 1, def: 80 },
      { key: 'eff', label: 'Selected-order efficiency (0–1)', type: 'number', min: 0, max: 1, step: 0.05, def: 0.8 },
    ],
    svg(el) {
      return boxSVG(52, el.params.aperture || 26, '#7fc7c4', '#397b78', 'AOTF', '#153b39', isFlipped(el));
    },
    surfaces(el) {
      const p = el.params, h = (p.aperture || 26) / 2;
      // Qualitative composition of a narrow spectral selector and its selected
      // acousto-optic order; this does not imply a calibrated device response.
      return [
        { x1: -1, y1: -h, x2: -1, y2: h, kind: 'filter', data: { ftype: 'bandpass', center: p.center, band: p.band } },
        { x1: 1, y1: -h, x2: 1, y2: h, kind: 'aom', data: { deflect: p.deflect, rfMHz: p.rfMHz, zero: false, eff: p.eff, gate: null } },
      ];
    },
  },

  delayline: {
    label: 'Mechanical delay line', category: 'Pulse Timing', size: { w: 40, h: 32 },
    params: [
      { key: 'delayMm', label: 'Extra optical path (mm)', type: 'number', min: 0, max: 100000, step: 1, def: 100 },
      { key: 'aperture', label: 'Clear aperture (mm)', type: 'number', min: 6, max: 100, step: 2, def: 24 },
    ],
    size_: el => ({ w: 40, h: (el.params.aperture || 24) + 8 }),
    svg(el) {
      const h = (el.params.aperture || 24) / 2;
      const flipped = isFlipped(el) ? 'transform="rotate(180)"' : '';
      return `<rect x="-18" y="${-h - 3}" width="36" height="${2 * h + 6}" rx="3" fill="#d8d1ec" stroke="#69588f" stroke-width="1.4"/>` +
        `<g ${flipped} fill="none" stroke="#514171" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M -15,0 H -6 L 4,-7 H 11 L 4,0 L 11,7 H 4 L -6,0"/>` +
        `<path d="M -1,-10 V 10" stroke-dasharray="2 2" opacity="0.65"/></g>` +
        `<text x="0" y="${h + 1}" ${flipped} text-anchor="middle" dominant-baseline="central" font-size="7" font-weight="700" fill="#44365f">ΔL</text>`;
    },
    surfaces(el) {
      const h = (el.params.aperture || 24) / 2;
      return [{ x1: 0, y1: -h, x2: 0, y2: h, kind: 'delay', data: { delayMm: el.params.delayMm } }];
    },
  },

  eom: {
    label: 'EOM', category: 'Modulators', size: { w: 48, h: 28 },
    size_: el => ({ w: 48, h: (el.params.aperture || 24) + 4 }),
    params: [
      { key: 'aperture', label: 'Active aperture (mm)', type: 'number', min: 6, max: 100, step: 2, def: 24 },
      { key: 'modulate', label: 'Apply voltage', type: 'checkbox', def: false },
      { key: 'a', label: 'Crystal axis (°)', type: 'number', min: 0, max: 180, step: 5, def: 0, show: p => p.modulate },
      { key: 'retardance', label: 'Retardance (°)', type: 'number', min: -720, max: 720, step: 5, def: 90, show: p => p.modulate },
    ],
    svg(el) { return boxSVG(44, el.params.aperture || 24, '#b8c9a3', '#66794a', 'EOM', '#2f3a20', isFlipped(el)); },
    surfaces(el) {
      const p = el.params;
      if (!p.modulate) return [];
      const h = (p.aperture || 24) / 2;
      return [{ x1: 0, y1: -h, x2: 0, y2: h, kind: 'retarder', data: { a: p.a, retardance: p.retardance } }];
    },
  },

  chopper: {
    label: 'Chopper', category: 'Modulators', size: { w: 40, h: 40 },
    size_: el => ({ w: (el.params.diameter || 40) + 4, h: (el.params.diameter || 40) + 4 }),
    params: [
      { key: 'modulate', label: 'Modulate on/off', type: 'checkbox', def: true },
      { key: 'diameter', label: 'Wheel diameter (mm)', type: 'number', min: 20, max: 120, step: 2, def: 40 },
      { key: 'frequencyHz', label: 'Chop frequency (Hz)', type: 'number', min: 0.1, max: 20000, step: 0.1, def: 1000, show: p => p.modulate },
      { key: 'chopDuty', label: 'On fraction (0–1)', type: 'number', min: 0.05, max: 0.95, step: 0.05, def: 0.5, show: p => p.modulate },
      { key: 'phaseNs', label: 'Gate offset (ns)', type: 'number', min: -1000000, max: 1000000, step: 0.1, def: 0, show: p => p.modulate },
    ],
    svg(el) {
      let blades = '';
      const p = el.params, r = (p.diameter || 40) / 2 - 2;
      const bladeSpan = 60 * (1 - Math.min(0.95, Math.max(0.05, p.chopDuty ?? 0.5)));
      // Six identical blade/slot pairs make one gate period a 60° wheel step.
      // The positive rotation also places the fixed horizontal ray in a slot
      // for phase < duty and behind a blade for the remainder of the cycle.
      const rawAngle = Number.isFinite(el._simulationTimeNs)
        ? (el._simulationTimeNs - (p.phaseNs || 0)) * (p.frequencyHz || 1000) * 6e-8
        : (el._animationTimeS || 0) * 60 * Math.min(2, Math.max(0.25, p.frequencyHz || 1000));
      const physicalAngle = ((rawAngle % 60) + 60) % 60;
      for (let i = 0; i < 6; i++) {
        const a0 = i * 60, a1 = a0 + bladeSpan;
        const x0 = r * Math.cos(a0 * Math.PI / 180), y0 = r * Math.sin(a0 * Math.PI / 180),
          x1 = r * Math.cos(a1 * Math.PI / 180), y1 = r * Math.sin(a1 * Math.PI / 180);
        blades += `<path d="M 0,0 L ${x0},${y0} A ${r} ${r} 0 0 1 ${x1},${y1} Z" fill="#8d98a5"/>`;
      }
      return `<g transform="rotate(${physicalAngle})">${blades}</g>` +
        `<circle r="3.5" fill="#4d565f"/><circle r="${r + 0.5}" fill="none" stroke="#4d565f" stroke-width="1" stroke-dasharray="2 3"/>`;
    },
    surfaces(el) {
      const p = el.params;
      if (!p.modulate) return [];
      const half = (p.diameter || 40) / 2;
      return [{
        x1: 0, y1: -half, x2: 0, y2: half, kind: 'chop',
        data: {
          frequencyMHz: (p.frequencyHz || 1000) / 1e6,
          duty: p.chopDuty,
          phaseNs: p.phaseNs,
        },
      }];
    },
  },

  crystal: {
    label: 'Crystal', category: 'Nonlinear Optics', size: { w: 36, h: 26 },
    size_: el => ({ w: 36, h: (el.params.aperture || 22) + 4 }),
    params: [
      { key: 'aperture', label: 'Crystal aperture (mm)', type: 'number', min: 6, max: 100, step: 2, def: 22 },
      { key: 'convert', label: 'Convert λ', type: 'select', def: 'none', options: [['none', 'None'], ['shg', 'SHG (λ/2)'], ['thg', 'THG (λ/3)'], ['sc', 'Supercontinuum (white)'], ['opo', 'OPO (signal + idler)'], ['custom', 'Custom output λ']] },
      { key: 'outWl', label: 'Output λ (nm)', type: 'number', min: 100, max: 12000, step: 1, def: 532, show: p => p.convert === 'custom' },
      { key: 'pumpWl', label: 'Pump λ (nm)', type: 'number', min: 100, max: 3000, step: 1, def: 532, show: p => p.convert === 'opo' },
      { key: 'signalWl', label: 'Signal λ (nm)', type: 'number', min: 100, max: 11000, step: 1, def: 800, show: p => p.convert === 'opo' },
      { key: 'efficiency', label: 'Conversion efficiency', type: 'number', min: 0, max: 1, step: 0.05, def: 0.5, show: p => p.convert !== 'none' },
      { key: 'transmitPump', label: 'Transmit residual pump', type: 'checkbox', def: true, show: p => p.convert !== 'none' },
    ],
    svg(el) {
      const isOpo = el.params.convert === 'opo';
      const h = (el.params.aperture || 22) / 2;
      return `<path d="M -12,${-h} L 16,${-h} L 12,${h} L -16,${h} Z" fill="${isOpo ? '#d8e8f5' : '#e4d5f2'}" stroke="${isOpo ? '#4a7fa8' : '#8a5fb0'}" stroke-width="1.5"/>`;
    },
    surfaces(el) {
      const p = el.params;
      if (p.convert === 'none') return [];
      const h = (p.aperture || 22) / 2;
      return [{ x1: 0, y1: -h, x2: 0, y2: h, kind: 'transmit', data: { convert: p.convert, outWl: p.outWl, pumpWl: p.pumpWl, signalWl: p.signalWl, efficiency: p.efficiency, transmitPump: p.transmitPump } }];
    },
  },

  glassrod: {
    label: 'Glass rod', category: 'Dispersive & Apertures', size: { w: 64, h: 14 },
    params: [
      { key: 'rodlen', label: 'Length (mm)', type: 'number', min: 20, max: 300, step: 5, def: 60 },
      { key: 'dia', label: 'Diameter', type: 'optsize', def: 12.7 },
      { key: 'ior', label: 'Refractive index', type: 'number', min: 1.01, max: 2.5, step: 0.01, def: 1.52 },
    ],
    size_: el => ({ w: el.params.rodlen + 4, h: (el.params.dia || 10) + 4 }),
    svg(el) {
      const L = el.params.rodlen / 2, d = el.params.dia || 10;
      return `<rect x="${-L}" y="${-d / 2}" width="${el.params.rodlen}" height="${d}" rx="${Math.min(4, d / 3)}" fill="${GLASS}" stroke="${GLASS_S}" stroke-width="1.5"/>`;
    },
    surfaces(el) {
      const x = el.params.rodlen / 2, y = (el.params.dia || 10) / 2;
      const data = { ior: el.params.ior || 1.52, transmission: 0.96 };
      // All four faces are dielectric boundaries. The tracer tracks whether a
      // ray is inside this rod, so it refracts on entry/exit and reflects when
      // total internal reflection occurs at a side wall.
      return [
        { x1: -x, y1: -y, x2: x, y2: -y, kind: 'refract', data: { ...data, topologyKey: 'edge-0' } },
        { x1: x, y1: -y, x2: x, y2: y, kind: 'refract', data: { ...data, topologyKey: 'edge-1' } },
        { x1: x, y1: y, x2: -x, y2: y, kind: 'refract', data: { ...data, topologyKey: 'edge-2' } },
        { x1: -x, y1: y, x2: -x, y2: -y, kind: 'refract', data: { ...data, topologyKey: 'edge-3' } },
      ];
    },
  },

  // ---------------- Microscopy ----------------
  sample: {
    label: 'Sample', category: 'Microscopy', size: { w: 14, h: 40 },
    size_: el => ({ w: 14, h: (el.params.aperture || 34) + 6 }),
    params: [{ key: 'aperture', label: 'Sample height (mm)', type: 'number', min: 6, max: 150, step: 2, def: 34 }, ...sampleModeParams()],
    svg(el) {
      const p = el.params;
      const c = p.mode === 'fluor' ? wavelengthToColor(p.fluorWl) : p.mode === 'cars' ? wavelengthToColor(p.carsWl) : '#e2758f';
      const h = (p.aperture || 34) / 2;
      return `<rect x="-3" y="${-h}" width="6" height="${2 * h}" fill="${GLASS}" stroke="${GLASS_S}" stroke-width="1.2"/>` +
        `<circle cx="0" cy="0" r="4" fill="${c}" opacity="0.85"/>`;
    },
    surfaces: el => sampleSurfaces(el, (el.params.aperture || 34) / 2),
  },

  stage: {
    label: 'Sample on piezo stage', category: 'Microscopy', size: { w: 22, h: 56 },
    size_: el => ({ w: 22, h: (el.params.aperture || 25.4) + 30 }),
    params: [
      { key: 'pzHeading', label: 'Piezo movement', type: 'section' },
      { key: 'pzMode', label: 'Scan pattern', type: 'select', def: 'static', options: [['static', 'Static'], ['xy', 'XY — long axis'], ['z', 'Z — depth'], ['sync', 'XYZ sync — raster']] },
      { key: 'pzTravelXY', label: 'XY travel (mm)', type: 'number', min: 0, max: 150, step: 1, def: 12, show: p => p.pzMode === 'xy' || p.pzMode === 'sync' },
      { key: 'pzFreqXY', label: 'XY scan frequency (Hz)', type: 'number', min: 0.01, max: 10, step: 0.01, def: 0.15, show: p => p.pzMode === 'xy' || p.pzMode === 'sync' },
      { key: 'pzTravelZ', label: 'Z travel (mm)', type: 'number', min: 0, max: 150, step: 1, def: 8, show: p => p.pzMode === 'z' || p.pzMode === 'sync' },
      { key: 'pzFreqZ', label: 'Z scan frequency (Hz)', type: 'number', min: 0.01, max: 10, step: 0.01, def: 0.1, show: p => p.pzMode === 'z' },
      { key: 'pzZSteps', label: 'Z raster lines', type: 'number', min: 2, max: 50, step: 1, def: 5, show: p => p.pzMode === 'sync' },
      { key: 'opticalHeading', label: 'Optical behavior', type: 'section' },
      { key: 'containsSample', label: 'Sample installed', type: 'checkbox', def: false },
      { key: 'aperture', label: 'Clear aperture', type: 'optsize', min: 4, max: 150, def: 25.4 },
      { key: 'sampleKind', label: 'Sample material', type: 'select', def: 'generic', show: p => p.containsSample, options: [['generic', 'General sample'], ['fluorescent', 'Fluorescent specimen'], ['resin', 'Photocurable resin'], ['nonlinear', 'Nonlinear specimen'], ['opaque', 'Absorbing specimen']] },
      { key: 'showMaterialLabel', label: 'Show material label', type: 'checkbox', def: true, show: p => p.containsSample },
      { key: 'showSignalSpot', label: 'Show excitation spot', type: 'checkbox', def: false, show: p => p.containsSample },
      { key: 'voxelPreview', label: '2PP voxel preview', type: 'checkbox', def: false, show: p => p.containsSample && p.sampleKind === 'resin' },
      { key: 'voxelSize', label: 'Voxel marker (mm)', type: 'number', min: 0.1, max: 6, step: 0.1, def: 0.6, show: p => p.containsSample && p.sampleKind === 'resin' && p.voxelPreview },
      ...sampleModeParams().map(spec => ({ ...spec, show: p => p.containsSample && (!spec.show || spec.show(p)) })),
    ],
    svg(el) {
      const p = el.params;
      const clear = (p.aperture || 25.4) / 2, outer = clear + 12;
      let spot = '';
      if (p.showSignalSpot && el._signalHitLocal) {
        const liveWl = el._signalHitLocal.wl;
        const color = Number.isFinite(liveWl) ? wavelengthToColor(liveWl) : stageSampleColor(p);
        spot = `<circle cx="${el._signalHitLocal.x.toFixed(2)}" cy="${el._signalHitLocal.y.toFixed(2)}" r="2.24" fill="${color}" opacity="0.75"/>`;
      }
      // Two separate L brackets (short-side cap + rail) grip the glass from
      // its top and bottom short edges and protrude 20% of the glass length
      // inward, leaving a 60%-of-length window between them for the beam.
      const windowY = clear * 0.6;
      return `<path d="M 8,${-outer} L -6,${-outer} L -6,${-windowY}" fill="none" stroke="#4d565f" stroke-width="4"/>` +
        `<path d="M 8,${outer} L -6,${outer} L -6,${windowY}" fill="none" stroke="#4d565f" stroke-width="4"/>` +
        `<rect x="-2" y="${-clear}" width="5" height="${2 * clear}" fill="${GLASS}" fill-opacity="0.75" stroke="${GLASS_S}" stroke-width="1.2"/>` +
        spot +
        (p.voxelPreview ? `<circle cx="0.5" cy="0" r="6.2" fill="none" stroke="#7c3aed" stroke-width="0.8" stroke-dasharray="1.5 1.5"/>` : '');
    },
    surfaces(el) {
      const clear = Math.max(2, (el.params.aperture || 25.4) / 2), outer = clear + 12;
      const mount = [
        { x1: -6, y1: -outer, x2: -6, y2: -clear, kind: 'absorb' },
        { x1: -6, y1: clear, x2: -6, y2: outer, kind: 'absorb' },
      ];
      return el.params.containsSample ? [...mount, ...sampleSurfaces(el, clear)] : mount;
    },
  },

  microscope: {
    label: 'Microscope', category: 'Microscopy', size: { w: 74, h: 54 },
    size_: el => ({ w: 74, h: (el.params.housingHeight || 50) + 4 }),
    params: [
      { key: 'objectiveF', label: 'Objective focal (mm)', type: 'number', min: 2, max: 100, step: 1, def: 10 },
      { key: 'tubeF', label: 'Tube lens focal (mm)', type: 'number', min: 5, max: 300, step: 5, def: 40 },
      { key: 'housingHeight', label: 'Housing height (mm)', type: 'number', min: 20, max: 180, step: 2, def: 50 },
      { key: 'aperture', label: 'Clear aperture', type: 'optsize', min: 8, max: 150, def: 50.8 },
    ],
    svg(el) { return boxSVG(70, el.params.housingHeight || 50, '#e8eaee', '#7a828c', 'Microscope', '#3d444d', isFlipped(el)); },
    surfaces(el) {
      const x = 35, y = (el.params.housingHeight || 50) / 2;
      const h = Math.min(y, (el.params.aperture || 50.8) / 2);
      // A compact objective + tube-lens assembly. The default focal lengths
      // add to the 50 mm separation, producing an afocal 4x beam expansion;
      // changing either value gives the same live thin-lens behavior as the
      // standalone optics.
      return [
        { x1: -25, y1: -h, x2: -25, y2: h, kind: 'lens', data: { f: el.params.objectiveF } },
        { x1: 25, y1: -h, x2: 25, y2: h, kind: 'lens', data: { f: el.params.tubeF } },
        { x1: -x, y1: -y, x2: x, y2: -y, kind: 'absorb' },
        { x1: x, y1: y, x2: -x, y2: y, kind: 'absorb' },
        { x1: -x, y1: -y, x2: -x, y2: -h, kind: 'absorb' },
        { x1: -x, y1: h, x2: -x, y2: y, kind: 'absorb' },
        { x1: x, y1: -y, x2: x, y2: -h, kind: 'absorb' },
        { x1: x, y1: h, x2: x, y2: y, kind: 'absorb' },
      ];
    },
  },

  // ---------------- Imaging ----------------
  objarrow: {
    label: 'Object', category: 'Sources', size: { w: 20, h: 60 },
    size_: el => ({ w: 20, h: 2 * el.params.height + 10 }),
    imaging: true,
    params: [
      { key: 'height', label: 'Height (mm)', type: 'number', min: 2, max: 150, step: 1, def: 22 },
      { key: 'shape', label: 'Shape', type: 'select', def: 'arrow', options: [['arrow', 'Arrow'], ['F', 'Letter F'], ['tree', 'Tree']] },
      { key: 'raysMode', label: 'Rays from tip', type: 'select', def: 'fan', options: [['fan', 'Show ray fan'], ['none', 'No rays']] },
      { key: 'spread', label: 'Fan angle (°)', type: 'number', min: 1, max: 40, step: 1, def: 10, show: p => p.raysMode === 'fan' },
      { key: 'nrays', label: 'Rays', type: 'number', min: 2, max: 9, step: 1, def: 3, show: p => p.raysMode === 'fan' },
      { key: 'showImage', label: 'Draw image formed', type: 'checkbox', def: true },
      { ...P.wavelength, def: 620 },
      P.autoColor, P.color,
    ],
    svg(el) {
      const p = el.params, h = p.height;
      const c = p.autoColor === false && p.color ? p.color : wavelengthToColor(p.wavelength);
      const sh = OBJ_SHAPES[p.shape] || OBJ_SHAPES.arrow;
      let s = `<line x1="-7" y1="0" x2="7" y2="0" stroke="#888" stroke-width="1.2"/>`;
      for (const ln of sh.lines) {
        s += `<polyline points="${ln.map(q => `${(q[0] * h).toFixed(1)},${(q[1] * h).toFixed(1)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      for (const pg of sh.polys) {
        s += `<polygon points="${pg.map(q => `${(q[0] * h).toFixed(1)},${(q[1] * h).toFixed(1)}`).join(' ')}" fill="${c}"/>`;
      }
      return s;
    },
    source(el) {
      const p = el.params;
      if (p.raysMode !== 'fan') return [];
      const n = Math.max(2, Math.round(p.nrays)), out = [];
      // fan from the object's own anchor point (on the shared optical axis,
      // not the off-axis tip): the central ray is exactly horizontal, so it
      // passes through the center of every on-axis lens undeviated (h = 0
      // there) and stays a fixed horizontal reference as the surrounding
      // rays fan out symmetrically — half clockwise, half counterclockwise
      // — and bend toward it at each focusing surface.
      for (let i = 0; i < n; i++) {
        const a = (-p.spread / 2 + p.spread * i / (n - 1)) * Math.PI / 180;
        out.push({ x: 1, y: 0, dx: Math.cos(a), dy: Math.sin(a) });
      }
      return out;
    },
    surfaces: () => [],
  },

  probe: {
    label: 'Beam probe (?)', category: 'Annotations', size: { w: 24, h: 24 },
    size_: el => ({ w: 24 * (el.params.displayScale || 1), h: 24 * (el.params.displayScale || 1) }),
    noLabel: true,
    params: [
      { key: 'displayScale', label: 'Display scale', type: 'number', min: 0.5, max: 2.5, step: 0.1, def: 1 },
      { key: 'prop', label: 'Show', type: 'select', def: 'spectrum', options: [['spectrum', 'Spectrum plot'], ['pol', 'Polarization'], ['wl', 'Wavelength label']] },
    ],
    svg(el) {
      const scale = el.params.displayScale || 1;
      return `<g transform="scale(${scale})"><circle r="4.5" fill="none" stroke="#e07020" stroke-width="1.6"/>` +
        `<line x1="0" y1="-8" x2="0" y2="8" stroke="#e07020" stroke-width="1"/>` +
        `<line x1="-8" y1="0" x2="8" y2="0" stroke="#e07020" stroke-width="1"/>` +
        `<line x1="3.5" y1="-3.5" x2="14" y2="-14" stroke="#e07020" stroke-width="1"/>` +
        probeCard(el, probeAt(el.x, el.y)) + `</g>`;
    },
    surfaces: () => [],
  },

  // Hidden from the palette: the Annotations "Arrow" tile starts the freehand
  // draw-arrow tool instead (same concept, drawn point-by-point). Existing
  // placed arrowann elements stay fully editable.
  arrowann: {
    label: 'Arrow', category: 'Annotations', hidden: true, size: el => ({
      w: el.params.len + 8,
      h: Math.max(20, 2 * (3 + 1.5 * el.params.width) + 4),
    }),
    params: [
      { key: 'len', label: 'Length (mm)', type: 'number', min: 10, max: 400, step: 5, def: 60 },
      { key: 'width', label: 'Line width', type: 'number', min: 0.5, max: 8, step: 0.5, def: 2 },
      { key: 'fill', label: 'Color', type: 'color', def: '#333333' },
    ],
    svg(el) {
      const p = el.params, L = p.len / 2, w = p.width;
      const hl = Math.min(p.len, 6 + 3 * w), hw = 3 + 1.5 * w;
      return `<line x1="${-L}" y1="0" x2="${(L - hl + 1).toFixed(1)}" y2="0" stroke="${p.fill}" stroke-width="${w}" stroke-linecap="round"/>` +
        `<path d="M ${L},0 L ${L - hl},${-hw} L ${L - hl},${hw} Z" fill="${p.fill}"/>`;
    },
    surfaces: () => [],
  },

  figureframe: {
    label: 'Figure frame', category: 'Annotations', paletteOrder: 99,
    aliases: ['crop', 'artboard', 'export frame', 'paper frame'],
    singleton: true,
    hideInExport: true,
    exportFrame: true,
    rotatable: false,
    noLabel: true,
    directHint: 'blue handles set the exact export crop',
    params: [
      { key: 'w', label: 'Figure width (mm)', type: 'number', min: 40, max: 2000, step: 5, def: 320 },
      { key: 'h', label: 'Figure height (mm)', type: 'number', min: 30, max: 2000, step: 5, def: 200 },
      { key: 'background', label: 'SVG background', type: 'select', def: 'transparent', options: [['transparent', 'Transparent'], ['white', 'White']] },
    ],
    size: el => ({ w: el.params.w, h: el.params.h }),
    hitTest(el, point, tolerance) {
      const hw = el.params.w / 2, hh = el.params.h / 2;
      if (Math.abs(point.x) > hw + tolerance || Math.abs(point.y) > hh + tolerance) return false;
      return Math.abs(Math.abs(point.x) - hw) <= tolerance || Math.abs(Math.abs(point.y) - hh) <= tolerance;
    },
    svg(el) {
      const w = el.params.w, h = el.params.h, x = -w / 2, y = -h / 2;
      const m = Math.min(12, w / 7, h / 7);
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#7d8ca3" stroke-width="1.2" stroke-dasharray="7 5"/>` +
        `<path d="M ${x},${y + m} V ${y} H ${x + m} M ${-x - m},${y} H ${-x} V ${y + m} M ${-x},${-y - m} V ${-y} H ${-x - m} M ${x + m},${-y} H ${x} V ${-y - m}" fill="none" stroke="#50637d" stroke-width="2"/>` +
        `<text x="${x + 7}" y="${y + 15}" font-size="9" font-weight="700" letter-spacing="0.7" fill="#64748b">FIGURE</text>`;
    },
    surfaces: () => [],
  },

  // ---------------- Custom ----------------
  box: {
    label: 'Custom box', category: 'Custom', size: el => ({ w: el.params.w + 4, h: el.params.h + 4 }),
    params: [
      { key: 'text', label: 'Label', type: 'text', def: 'Device' },
      { key: 'w', label: 'Width (mm)', type: 'number', min: 10, max: 400, step: 5, def: 70 },
      { key: 'h', label: 'Height (mm)', type: 'number', min: 10, max: 400, step: 5, def: 40 },
      { key: 'behavior', label: 'Beam behavior', type: 'select', def: 'block', options: [['block', 'Blocks beam'], ['pass', 'Beam passes through']] },
      { key: 'fill', label: 'Fill', type: 'color', def: '#eef0f3' },
    ],
    svg(el) {
      const p = el.params;
      return boxSVG(p.w, p.h, p.fill, '#7a828c', p.text, '#3d444d', isFlipped(el));
    },
    surfaces(el) {
      return el.params.behavior === 'block' ? rectAbsorb(el.params.w, el.params.h) : [];
    },
  },

  blocker: {
    label: 'Invisible blocker', category: 'Beam Block', size: el => ({ w: el.params.w + 4, h: el.params.h + 4 }),
    hideInExport: true,
    params: [
      { key: 'w', label: 'Width (mm)', type: 'number', min: 4, max: 400, step: 2, def: 16 },
      { key: 'h', label: 'Height (mm)', type: 'number', min: 4, max: 400, step: 2, def: 60 },
    ],
    svg(el) {
      const p = el.params;
      return `<rect x="${-p.w / 2}" y="${-p.h / 2}" width="${p.w}" height="${p.h}" rx="2" fill="rgba(208,96,96,0.07)" stroke="#d89c9c" stroke-width="1" stroke-dasharray="4 3"/>` +
        `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="9" fill="#c98080">✂</text>`;
    },
    surfaces(el) {
      return rectAbsorb(el.params.w, el.params.h);
    },
  },

  textlabel: {
    label: 'Text label', category: 'Annotations', size: el => ({ w: Math.max(30, String(el.params.text).length * el.params.fontSize * 0.6), h: el.params.fontSize + 10 }),
    params: [
      { key: 'text', label: 'Text', type: 'text', def: 'Label' },
      { key: 'fontSize', label: 'Size (pt)', type: 'number', min: 6, max: 72, step: 1, def: 14 },
      { key: 'fill', label: 'Color', type: 'color', def: '#333333' },
    ],
    noLabel: true,
    svg(el) {
      const p = el.params;
      return `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="${p.fontSize}" fill="${p.fill}">${esc(p.text)}</text>`;
    },
    surfaces: () => [],
  },
};

// Keep optional component definitions in the registry module's import graph so
// browser, Node, and CLI loaders all see the same source of truth.
registry.etalon = etalonDefinition;

// concave lens: identical optics to 'lens', concave default focal length
registry.lensc = {
  ...registry.lens,
  label: 'Concave lens',
  paletteOrder: 1,
  params: registry.lens.params.map(p => (p.key === 'f' ? { ...p, def: -100 } : p)),
};

// A first-class registry type reuses the Laser physics contract while making
// the broadband source discoverable. Legacy lasers with bwMode="sc" continue
// to load as before.
registry.sclaser = {
  ...registry.laser,
  label: 'Supercontinuum laser',
  paletteOrder: 1,
  aliases: ['super continuum', 'white laser', 'broadband pulsed source', 'sc laser'],
  params: [
    { ...P.wavelength, def: 650, show: () => false },
    { key: 'scMin', label: 'Spectrum minimum (nm)', type: 'number', min: 200, max: 11999, step: 10, def: 430 },
    { key: 'scMax', label: 'Spectrum maximum (nm)', type: 'number', min: 201, max: 12000, step: 10, def: 870 },
    { key: 'beamMode', label: 'Beam style', type: 'select', def: 'beam', options: [['line', 'Simple line'], ['beam', 'Beam with size']] },
    { key: 'beamWidth', label: 'Beam width (mm)', type: 'number', min: 1, max: 60, step: 0.5, def: 8, show: p => p.beamMode === 'beam' },
    { key: 'bwMode', label: 'Spectrum', type: 'select', def: 'sc', options: [['sc', 'Supercontinuum (white)']], show: () => false },
    { key: 'pol', label: 'Polarization (°)', type: 'number', min: 0, max: 180, step: 5, def: 0 },
    { key: 'temporalMode', label: 'Emission', type: 'select', def: 'pulsed', options: [['cw', 'Continuous wave'], ['pulsed', 'Pulsed']] },
    { key: 'repRateMHz', label: 'Repetition rate (MHz)', type: 'number', min: 0.001, max: 1000000, step: 1, def: 80, show: p => p.temporalMode === 'pulsed' },
    { key: 'pulseWidthFs', label: 'Pulse duration (fs)', type: 'number', min: 1, max: 1000000000, step: 10, def: 100, show: p => p.temporalMode === 'pulsed' },
    { key: 'pulsePhaseNs', label: 'Emission offset (ns)', type: 'number', min: -1000000, max: 1000000, step: 0.1, def: 0, show: p => p.temporalMode === 'pulsed' },
    P.autoColor, P.color,
  ],
  svg(el) {
    const h = laserH(el), hh = h / 2;
    const ap = el.params.beamMode === 'beam' ? Math.min(hh - 4, el.params.beamWidth / 2 + 3) : 6;
    const stripes = ['#7c3aed', '#2563eb', '#10b981', '#eab308', '#f97316', '#ef4444']
      .map((c, i) => `<rect x="${46 + i * 0.85}" y="${-ap}" width="1" height="${2 * ap}" fill="${c}"/>`).join('');
    return `<rect x="-46" y="${-hh}" width="92" height="${h}" rx="4" fill="#24233a" stroke="#171629" stroke-width="1.5"/>` +
      `<text x="0" y="-3" ${isFlipped(el) ? 'transform="rotate(180)"' : ''} text-anchor="middle" dominant-baseline="central" font-size="10" font-weight="750" letter-spacing="1.1" fill="#fff">SC LASER</text>` +
      `<g stroke="#c4b5fd" stroke-width="1.1"><path d="M -17,8 L -12,8 L -10,3 L -8,11 L -6,8 L -1,8"/><path d="M 3,8 L 8,8 L 10,3 L 12,11 L 14,8 L 19,8"/></g>` + stripes;
  },
};

// Registry-owned direct-manipulation semantics. Canvas code only understands
// generic resize/tune descriptors; the component definition decides which
// real physical parameter a handle changes.
const DIRECT = {
  laser: { resize: { y: 'beamWidth', set: { beamMode: 'beam' } }, tune: { key: 'wavelength', short: 'λ', when: p => p.bwMode !== 'sc' } },
  sclaser: { resize: { y: 'beamWidth', set: { beamMode: 'beam' } }, tune: { key: 'scMax', short: 'λ max' } },
  pointsource: { resize: { uniform: 'displayScale' }, tune: { key: 'spread', short: 'angle' } },
  objarrow: { resize: { y: 'height' }, tune: { key: 'spread', short: 'fan', when: p => p.raysMode === 'fan' } },
  mirror: { resize: { y: 'length' }, tune: { key: 'refl', short: 'R' } },
  galvo: { resize: { y: 'length' }, tune: { key: 'commandAngle', short: 'center' } },
  retroreflector: { resize: { y: 'length' }, tune: { key: 'refl', short: 'R' } },
  cmirrorx: { resize: { y: 'length' }, tune: { key: 'f', short: 'f' } },
  cmirror: { resize: { y: 'length' }, tune: { key: 'f', short: 'f' } },
  oap: { resize: { y: 'length' }, tune: { key: 'f', short: 'f' } },
  lens: { resize: { y: 'dia' }, tune: { key: 'f', short: 'f' } },
  lensc: { resize: { y: 'dia' }, tune: { key: 'f', short: 'f' } },
  telescope: { resize: { y: 'dia' }, tune: { key: 'f2', short: 'f₂' } },
  objective: { resize: { y: 'aperture' }, tune: { key: 'f', short: 'f' } },
  dichroic: { resize: { y: 'length' }, tune: { key: p => p.dtype === 'bandpass' ? 'center' : 'cutoff', short: 'λ' } },
  filter: { resize: { y: 'length' }, tune: { key: p => p.ftype === 'nd' ? 'trans' : p.ftype === 'bandpass' ? 'center' : 'cutoff', short: 'filter' } },
  etalon: { resize: { y: 'aperture' }, tune: { key: p => p.mode === 'vipa' ? 'angularDispersion' : 'reflectivity', short: 'response' } },
  bs: { resize: { uniform: 'size' }, tune: { key: 'ratio', short: 'T' } },
  polarizer: { resize: { y: 'length' }, tune: { key: 'pangle', short: 'axis' } },
  hwp: { resize: { y: 'length' }, tune: { key: 'a', short: 'axis' } },
  qwp: { resize: { y: 'length' }, tune: { key: 'a', short: 'axis' } },
  pbs: { resize: { uniform: 'size' } },
  isolator: { resize: { y: 'aperture' } },
  grating: { resize: { y: 'length' }, tune: { key: 'lines', short: 'lines' } },
  slit: { resize: { y: 'length' }, tune: { key: 'gap', short: 'gap' } },
  prism: { resize: { uniform: 'psize' }, tune: { key: 'apex', short: 'apex' } },
  freeglass: { resize: { uniform: 'scale' }, tune: { key: 'ior', short: 'n', when: p => p.material === 'constant' } },
  diffuser: { resize: { y: 'length' }, tune: { key: 'div', short: 'spread' } },
  slm: { resize: { y: 'length' }, tune: { key: 'zeroFrac', short: '0th', when: p => p.zeroOrder } },
  dmd: { resize: { y: 'length' }, tune: { key: 'tilt', short: 'tilt' } },
  dm: { resize: { y: 'length' }, tune: { key: 'steer', short: 'steer' } },
  detector: { resize: { y: 'aperture' } },
  pmt: { resize: { y: 'aperture' }, tune: { key: 'gain', short: 'gain' } },
  camera: { resize: { y: 'ch' }, tune: { key: 'pixels', short: 'px' } },
  eye: { resize: { uniform: 'diameter' }, tune: { key: 'focus', short: 'f' } },
  display: { resize: { uniform: 'displayScale' } },
  beamdump: { resize: { y: 'aperture' } },
  aom: { resize: { y: 'aperture' }, tune: { key: 'deflect', short: 'deflect' } },
  aotf: { resize: { y: 'aperture' }, tune: { key: 'center', short: 'λ select' } },
  delayline: { resize: { y: 'aperture' }, tune: { key: 'delayMm', short: 'ΔL' } },
  eom: { resize: { y: 'aperture' }, tune: { key: 'retardance', short: 'Δφ', when: p => p.modulate } },
  chopper: { resize: { uniform: 'diameter' }, tune: { key: 'chopDuty', short: 'duty', when: p => p.modulate } },
  crystal: { resize: { y: 'aperture' }, tune: { key: 'efficiency', short: 'η', when: p => p.convert !== 'none' } },
  glassrod: { resize: { x: 'rodlen', y: 'dia' }, tune: { key: 'ior', short: 'n' } },
  sample: { resize: { y: 'aperture' }, tune: { key: 'transmission', short: 'T', when: p => p.transmitExc } },
  stage: { resize: { y: 'aperture' } },
  microscope: { resize: { y: 'housingHeight' }, tune: { key: 'objectiveF', short: 'f obj' } },
  arrowann: { resize: { x: 'len' }, tune: { key: 'width', short: 'stroke' } },
  figureframe: { resize: { x: 'w', y: 'h' } },
  box: { resize: { x: 'w', y: 'h' } },
  blocker: { resize: { x: 'w', y: 'h' } },
  textlabel: { resize: { uniform: 'fontSize' } },
  probe: { resize: { uniform: 'displayScale' } },
};

for (const [type, direct] of Object.entries(DIRECT)) {
  if (registry[type]) registry[type].direct = direct;
}

export function getDirectManipulation(el) {
  const def = registry[el?.type];
  if (!def?.direct) return null;
  const resolveKey = value => typeof value === 'function' ? value(el.params) : value;
  const resize = def.direct.resize && (!def.direct.resize.when || def.direct.resize.when(el.params))
    ? Object.fromEntries(Object.entries(def.direct.resize).filter(([key]) => key !== 'when').map(([key, value]) => [key, resolveKey(value)]))
    : null;
  const rawTune = def.direct.tune;
  let tune = null;
  if (rawTune && (!rawTune.when || rawTune.when(el.params))) {
    const key = resolveKey(rawTune.key);
    const param = (def.params || []).find(spec => spec.key === key);
    if (param && (param.type === 'number' || param.type === 'optsize')) tune = { ...rawTune, key, param };
  }
  return resize || tune ? { resize, tune } : null;
}

// User-facing capability metadata. The distinction is deliberately explicit:
// simulated elements affect traced rays, configurable elements need an active
// mode, and diagram-only elements are honest visual annotations/placeholders.
const ELEMENT_HELP = {
  laser: 'Emits a CW or pulsed monochromatic, broadband, supercontinuum, or sized collimated beam.',
  sclaser: 'Emits a configurable pulsed supercontinuum band as a collimated beam.',
  pointsource: 'Emits isotropic light (360° by default, optionally broadband) that fades over a short evanescent range unless captured by a nearby lens, objective, or fiber tip.',
  objarrow: 'Traces object-tip rays and draws an ideal paraxial image; the image marker does not model downstream clipping.',
  mirror: 'Reflects rays with configurable size and reflectivity.',
  retroreflector: 'A right-angle pair of mirrors that reflects any incoming ray back antiparallel to its incidence direction, independent of angle. Its delay-line motion starts at the placed position and periodically slides the whole element away along its own apex axis, only ever lengthening the round-trip optical path over a user-set range — a physical model of a mechanical retroreflecting delay stage.',
  galvo: 'Reflects rays from a static or animated ideal quasistatic mechanical scan angle; high scan rates use a slowed preview.',
  cmirrorx: 'Diverges reflected rays with a paraxial focal-length model.',
  cmirror: 'Focuses reflected rays with a paraxial focal-length model.',
  oap: 'Reflects from segmented parabolic geometry toward the configured focus.',
  lens: 'Bends rays with a thin-lens, paraxial focal-length model.',
  lensc: 'Diverges rays with a negative thin-lens focal length.',
  telescope: 'Applies two thin lenses separated by their focal lengths.',
  objective: 'Applies a compact focusing thin-lens model; ƒ also sets the distance to the back focal plane (BFP) behind the lens — the plane a telescope or scan relay should image onto for pupil-matched scanning.',
  dichroic: 'Transmits or reflects wavelength bands around its configured cutoff.',
  filter: 'Passes a spectral band or attenuates intensity as a neutral-density filter.',
  bs: 'Splits incident light into transmitted and reflected branches.',
  grating: 'Creates selected diffraction orders using the grating equation.',
  prism: 'Refracts through all three drawn BK7-like boundaries with wavelength-dependent dispersion.',
  freeglass: 'Refracts through a directly editable boundary of straight segments and exact circular arcs. Supports constant-index or BK7-like qualitative dispersion; overlapping glass bodies are not surface-merged.',
  diffuser: 'Spreads incident light into a configurable angular fan.',
  glassrod: 'Refracts at every glass-air boundary and supports total internal reflection.',
  polarizer: 'Applies a linear polarization axis and Malus-law attenuation.',
  hwp: 'Rotates linear polarization around the configured fast axis.',
  qwp: 'Applies quarter-wave retardance, producing linear, elliptical, or circular polarization from the input state.',
  pbs: 'Separates orthogonal polarization states into two paths.',
  isolator: 'Passes light in one direction and blocks reverse propagation.',
  slit: 'Blocks rays outside the configured aperture gap.',
  beamdump: 'Absorbs incident rays.',
  blocker: 'Absorbs rays but stays hidden in exported figures.',
  slm: 'Reflects by default and can overlay lens-array, grating, steering, or speckle functions.',
  dmd: 'Routes a configurable binary micromirror pattern into ON and optional OFF orders.',
  dm: 'Applies continuous reflective tip, tilt, and paraxial defocus.',
  detector: 'Measures qualitative ray signal, spectrum, polarization, and spot span.',
  pmt: 'Applies configurable qualitative gain and saturation to detected optical signal.',
  camera: 'Bins incident rays into a configurable one-dimensional sensor profile.',
  eye: 'Focuses through a configurable pupil and reports the qualitative retinal signal and spot.',
  display: 'Shows the live qualitative output of a linked photodetector, PMT, camera, or retina.',
  aom: 'Deflects and frequency-shifts first-order light with efficiency, zero-order, and square or sinusoidal RF modulation.',
  aotf: 'Selects a configurable spectral band, then deflects and attenuates the selected acousto-optic order.',
  delayline: 'Adds a configurable folded optical-path delay while preserving the outgoing beam axis.',
  eom: 'Applies voltage-controlled polarization retardance; an analyzer converts it to intensity modulation.',
  chopper: 'Gates finite-duration pulse trains in time and draws CW light as a chunked on/off pattern matching its duty cycle; detector readings use the duty-averaged CW power.',
  crystal: 'Converts a configurable fraction of pump power into SHG, THG, supercontinuum, OPO, or custom output.',
  sample: 'Attenuates excitation and can convert a bounded fraction into fluorescence or nonlinear signal.',
  stage: 'Mechanically clips rays outside its clear aperture and optionally contains a sample. The piezo stage can scan the sample along its long axis (XY), along the beam axis (Z, depth), or raster both together; a resin sample can also show pulsed 2PP voxel marks.',
  microscope: 'Models a configurable objective, tube lens, clear aperture, and absorbing housing.',
  probe: 'Reads spectrum, wavelength, or polarization from the nearest traced beam.',
  arrowann: 'Diagram annotation; does not interact with rays.',
  figureframe: 'Canvas-only export crop. Its border and handles never appear in the exported figure.',
  textlabel: 'Diagram annotation; does not interact with rays.',
  box: 'Generic enclosure with explicit pass-through or beam-blocking behavior.',
};

const DIAGRAM_ONLY = new Set(['arrowann', 'textlabel', 'figureframe']);
const SHAPERS = new Set(['slm']);

export function getElementMeta(type, params = {}, context = {}) {
  const definition = registry[type];
  let tier = DIAGRAM_ONLY.has(type) ? 'diagram' : (definition?.capabilityTier || 'simulated');
  let note = definition?.capabilityNote || '';
  let description = definition?.description || ELEMENT_HELP[type] || 'Optical workbench component.';
  const displayLinkMissing = type === 'display' && params.sensorId
    && context.element && Array.isArray(context.elements)
    && !resolveDisplaySensor(context.element, context.elements);

  if (type === 'eom' && !params.modulate) {
    tier = 'configurable';
    note = 'Apply voltage to set a polarization retardance; use a downstream polarizer or PBS for amplitude modulation.';
  } else if (type === 'display' && (!params.sensorId || displayLinkMissing)) {
    tier = 'configurable';
    note = displayLinkMissing
      ? 'The linked sensor is no longer in this sketch. Choose another input; the data cable never changes traced rays.'
      : 'Choose a sensor input in the inspector. The drawn cable carries data only and never changes traced rays.';
  } else if (type === 'crystal' && (!params.convert || params.convert === 'none')) {
    tier = 'configurable';
    note = 'Choose a conversion mode to generate an output wavelength.';
  } else if (SHAPERS.has(type) && (!Array.isArray(params.layers) || params.layers.length === 0)) {
    tier = 'configurable';
    note = 'Currently a plain reflector. Add an optical structure to shape the wavefront.';
  } else if (type === 'arrowann' || type === 'textlabel' || type === 'figureframe') {
    note = 'Annotations are intentionally visual and never change traced rays.';
  } else if (type === 'freeglass') {
    note = 'Straight and circular-arc boundaries use qualitative geometric refraction. Nested or overlapping glass bodies are not surface-merged.';
  } else if (type === 'stage' && params.voxelPreview) {
    note = 'Pulsed arrivals leave canvas-only 2PP voxel markers in the mounted sample; marker size/opacity qualitatively broadens with Z (depth) offset from focus. This is a 2D scan preview, not a threshold, dose, curing, or true 3D fabrication simulation.';
  } else if (type === 'stage' && params.pzMode && params.pzMode !== 'static') {
    note = 'The piezo stage motion is a display-time animation of the mounted sample — "sync" is a simple serpentine raster, not a calibrated piezo trajectory.';
  } else if (type === 'display') {
    note = 'The screen mirrors a linked sensor’s qualitative tracer output. Its data cable never changes traced rays.';
  }

  const labels = { simulated: 'Simulated', configurable: 'Needs setup', diagram: 'Diagram only' };
  return {
    tier,
    status: labels[tier],
    description,
    note,
  };
}

export const categories = [
  'Annotations',
  'Sources',
  'Mirrors',
  'Lenses',
  'Fibers',
  'Filters & Splitters',
  'Dispersive & Apertures',
  'Polarization',
  'Beam Block',
  'Wavefront Shaping',
  'Detectors',
  'Modulators',
  'Pulse Timing',
  'Nonlinear Optics',
  'Microscopy',
  'Custom',
];

export function getSize(el) {
  const d = registry[el.type];
  if (d.size_ && typeof d.size_ === 'function') return d.size_(el);
  if (typeof d.size === 'function') return d.size(el);
  return d.size;
}

// Axis-aligned world bounds for fitting/export. This includes common labels
// and the probe's readout card, which extend beyond the element hit box.
export function getVisualBounds(el, { includeLabel = true } = {}) {
  const d = registry[el.type];
  if (!d) return null;
  const sz = getSize(el);
  const a = (el.rot || 0) * Math.PI / 180;
  const ex = (Math.abs(sz.w * Math.cos(a)) + Math.abs(sz.h * Math.sin(a))) / 2;
  const ey = (Math.abs(sz.w * Math.sin(a)) + Math.abs(sz.h * Math.cos(a))) / 2;
  let x0 = el.x - ex, x1 = el.x + ex, y0 = el.y - ey, y1 = el.y + ey;

  if (el.type === 'probe') {
    const scale = el.params.displayScale || 1;
    const corners = [[-10, -75], [160, -75], [-10, 15], [160, 15]]
      .map(([x, y]) => toWorld(el, x * scale, y * scale));
    x0 = Math.min(x0, ...corners.map(p => p.x)); x1 = Math.max(x1, ...corners.map(p => p.x));
    y0 = Math.min(y0, ...corners.map(p => p.y)); y1 = Math.max(y1, ...corners.map(p => p.y));
  }

  if (includeLabel && el.showLabel && el.label) {
    const width = Math.max(8, String(el.label).length * 6.2);
    const pos = el.labelPos || 'b';
    if (pos === 'b') {
      const y = el.y + ey + 13;
      x0 = Math.min(x0, el.x - width / 2); x1 = Math.max(x1, el.x + width / 2); y1 = Math.max(y1, y + 3);
    } else if (pos === 't') {
      const y = el.y - ey - 7;
      x0 = Math.min(x0, el.x - width / 2); x1 = Math.max(x1, el.x + width / 2); y0 = Math.min(y0, y - 11);
    } else if (pos === 'l') {
      x0 = Math.min(x0, el.x - ex - 7 - width); y0 = Math.min(y0, el.y - 7); y1 = Math.max(y1, el.y + 7);
    } else {
      x1 = Math.max(x1, el.x + ex + 7 + width); y0 = Math.min(y0, el.y - 7); y1 = Math.max(y1, el.y + 7);
    }
  }
  return { x0, y0, x1, y1 };
}

// element label, drawn OUTSIDE the rotated group: always upright, positioned
// around the element's rotated bounding box (labelPos: b/t/l/r)
export function labelSVG(el) {
  if (!el.showLabel || !el.label) return '';
  const sz = getSize(el);
  const a = (el.rot || 0) * Math.PI / 180;
  const ex = (Math.abs(sz.w * Math.cos(a)) + Math.abs(sz.h * Math.sin(a))) / 2;
  const ey = (Math.abs(sz.w * Math.sin(a)) + Math.abs(sz.h * Math.cos(a))) / 2;
  const pos = el.labelPos || 'b';
  let x = el.x, y = el.y, anchor = 'middle', base = '';
  if (pos === 'b') y += ey + 13;
  else if (pos === 't') y -= ey + 7;
  else if (pos === 'l') { x -= ex + 7; anchor = 'end'; base = 'dominant-baseline="central"'; }
  else { x += ex + 7; anchor = 'start'; base = 'dominant-baseline="central"'; }
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" ${base} font-size="11" fill="#444">${esc(el.label)}</text>`;
}

export function createElement(type, x = 0, y = 0) {
  const d = registry[type];
  const params = {};
  for (const p of d.params || []) params[p.key] = Array.isArray(p.def) ? JSON.parse(JSON.stringify(p.def)) : p.def;
  return { id: uid(), type, x, y, rot: 0, label: '', showLabel: false, params };
}
