// Fabry–Pérot etalon and VIPA geometry built from the tracer's existing
// partially reflective mirror interactions. The VIPA mode models the
// entrance window and repeated spatially offset leakage beams; coherent
// phase summation / Airy fringes remain outside the qualitative ray model.

import { registry } from './elements.js';

const D2R = Math.PI / 180;
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, Number(value)));

function frame(params = {}) {
  const mode = params.mode === 'vipa' ? 'vipa' : 'etalon';
  const aperture = clamp(params.aperture ?? 35, 6, 150);
  const spacing = clamp(params.spacing ?? 12, 1, 100);
  const tilt = clamp(mode === 'vipa' ? (params.vipaTilt ?? 4) : (params.etalonTilt ?? 0), -30, 30) * D2R;
  const tangent = { x: Math.sin(tilt), y: Math.cos(tilt) };
  const normal = { x: Math.cos(tilt), y: -Math.sin(tilt) };
  const centre = sign => ({ x: sign * spacing * normal.x / 2, y: sign * spacing * normal.y / 2 });
  const point = (surfaceCentre, along) => ({
    x: surfaceCentre.x + along * tangent.x,
    y: surfaceCentre.y + along * tangent.y,
  });
  return { mode, aperture, spacing, tangent, normal, centre, point };
}

function segment(a, b, refl, showTransmitted) {
  return {
    x1: a.x, y1: a.y, x2: b.x, y2: b.y,
    kind: 'mirror', data: { refl, showTransmitted },
  };
}

export function etalonSurfaces(params = {}) {
  const f = frame(params), half = f.aperture / 2;
  const front = f.centre(-1), rear = f.centre(1);

  if (f.mode === 'etalon') {
    const reflectivity = clamp(params.reflectivity ?? 90, 0, 99.4);
    return [
      segment(f.point(front, -half), f.point(front, half), reflectivity, true),
      segment(f.point(rear, -half), f.point(rear, half), reflectivity, true),
    ];
  }

  const frontReflectivity = clamp(params.frontReflectivity ?? 99.9, 0, 100);
  const outputReflectivity = clamp(params.outputReflectivity ?? 96, 0, 99.4);
  const windowSize = clamp(params.windowSize ?? 3, 0.5, Math.max(0.5, f.aperture - 1));
  const windowOffset = clamp(params.windowOffset ?? 0, -half + windowSize / 2, half - windowSize / 2);
  const windowLo = windowOffset - windowSize / 2;
  const windowHi = windowOffset + windowSize / 2;
  const out = [];

  if (windowLo > -half + 1e-6) {
    out.push(segment(f.point(front, -half), f.point(front, windowLo), frontReflectivity, false));
  }
  if (windowHi < half - 1e-6) {
    out.push(segment(f.point(front, windowHi), f.point(front, half), frontReflectivity, false));
  }
  out.push(segment(
    f.point(rear, -half), f.point(rear, half), outputReflectivity,
    params.showLeakage !== false,
  ));
  return out;
}

function coatingLine(surfaceCentre, f, from, to, stroke, width, dash = '') {
  const a = f.point(surfaceCentre, from), b = f.point(surfaceCentre, to);
  return `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" ` +
    `stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

export function etalonSVG(params = {}) {
  const f = frame(params), half = f.aperture / 2;
  const front = f.centre(-1), rear = f.centre(1);
  const p1 = f.point(front, -half), p2 = f.point(front, half);
  const p3 = f.point(rear, half), p4 = f.point(rear, -half);
  const body = `<path d="M ${p1.x.toFixed(2)},${p1.y.toFixed(2)} L ${p2.x.toFixed(2)},${p2.y.toFixed(2)} ` +
    `L ${p3.x.toFixed(2)},${p3.y.toFixed(2)} L ${p4.x.toFixed(2)},${p4.y.toFixed(2)} Z" ` +
    `fill="#c9e4f5" fill-opacity="0.62" stroke="#4a90c4" stroke-width="1.1"/>`;

  if (f.mode === 'etalon') {
    return body + coatingLine(front, f, -half, half, '#4d5560', 2.1) +
      coatingLine(rear, f, -half, half, '#4d5560', 2.1) +
      `<circle cx="0" cy="0" r="2.2" fill="#7c8fa4"/>`;
  }

  const windowSize = clamp(params.windowSize ?? 3, 0.5, Math.max(0.5, f.aperture - 1));
  const windowOffset = clamp(params.windowOffset ?? 0, -half + windowSize / 2, half - windowSize / 2);
  const windowLo = windowOffset - windowSize / 2;
  const windowHi = windowOffset + windowSize / 2;
  const windowCentre = f.point(front, windowOffset);
  const entryStart = {
    x: windowCentre.x - 9 * f.normal.x,
    y: windowCentre.y - 9 * f.normal.y,
  };
  const entryEnd = {
    x: windowCentre.x - 1.4 * f.normal.x,
    y: windowCentre.y - 1.4 * f.normal.y,
  };

  return body +
    coatingLine(front, f, -half, windowLo, '#353b44', 2.8) +
    coatingLine(front, f, windowHi, half, '#353b44', 2.8) +
    coatingLine(rear, f, -half, half, '#5d5575', 2.1, '3 1.5') +
    `<line x1="${entryStart.x.toFixed(2)}" y1="${entryStart.y.toFixed(2)}" ` +
    `x2="${entryEnd.x.toFixed(2)}" y2="${entryEnd.y.toFixed(2)}" stroke="#7c3aed" stroke-width="1.5"/>` +
    `<path d="M ${entryEnd.x.toFixed(2)},${entryEnd.y.toFixed(2)} l -3,-2 l 0,4 Z" fill="#7c3aed"/>`;
}

export const etalonDefinition = {
  label: 'Etalon / VIPA',
  category: 'Dispersive & Apertures',
  paletteOrder: 2,
  aliases: [
    'fabry perot', 'fabry–pérot', 'fabry-perot etalon', 'interferometer',
    'vipa', 'virtually imaged phased array', 'spectral disperser',
  ],
  description: 'Parallel partially reflective plates. Toggle VIPA mode for an HR entrance-window face and a partially transmitting output face that produces spatially offset multi-pass leakage beams.',
  size: { w: 22, h: 41 },
  size_: element => {
    const f = frame(element.params);
    return { w: f.spacing + Math.abs(f.aperture * f.tangent.x) + 12, h: Math.abs(f.aperture * f.tangent.y) + 8 };
  },
  params: [
    { key: 'mode', label: 'Configuration', type: 'select', def: 'etalon', options: [['etalon', 'Fabry–Pérot etalon'], ['vipa', 'VIPA']] },
    { key: 'aperture', label: 'Clear aperture (mm)', type: 'number', min: 6, max: 150, step: 1, def: 35 },
    { key: 'spacing', label: 'Plate spacing / thickness (mm)', type: 'number', min: 1, max: 100, step: 0.5, def: 12 },
    { key: 'etalonTilt', label: 'Etalon tilt (°)', type: 'number', min: -30, max: 30, step: 0.5, def: 0, show: p => p.mode !== 'vipa' },
    { key: 'reflectivity', label: 'Both surfaces reflectivity (%)', type: 'number', min: 0, max: 99.4, step: 0.1, def: 90, show: p => p.mode !== 'vipa' },
    { key: 'vipaTilt', label: 'VIPA incidence tilt (°)', type: 'number', min: -30, max: 30, step: 0.5, def: 4, show: p => p.mode === 'vipa' },
    { key: 'frontReflectivity', label: 'Front HR coating (%)', type: 'number', min: 0, max: 100, step: 0.1, def: 99.9, show: p => p.mode === 'vipa' },
    { key: 'outputReflectivity', label: 'Output coating reflectivity (%)', type: 'number', min: 0, max: 99.4, step: 0.1, def: 96, show: p => p.mode === 'vipa' },
    { key: 'windowSize', label: 'Entrance window (mm)', type: 'number', min: 0.5, max: 30, step: 0.5, def: 3, show: p => p.mode === 'vipa' },
    { key: 'windowOffset', label: 'Window offset (mm)', type: 'number', min: -60, max: 60, step: 0.5, def: 0, show: p => p.mode === 'vipa' },
    { key: 'showLeakage', label: 'Show output leakage beams', type: 'checkbox', def: true, show: p => p.mode === 'vipa' },
  ],
  svg: element => etalonSVG(element.params),
  surfaces: element => etalonSurfaces(element.params),
};

registry.etalon = etalonDefinition;
