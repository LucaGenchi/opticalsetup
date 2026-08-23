// VIPA (Virtually Imaged Phased Array): a tilted plate with a
// high-reflectivity entrance face (except a small entrance window) and a
// partially transmitting output face. Light enters through the window,
// bounces back and forth across the tilted gap, and leaks a fan of
// spatially offset beams out the output face on every pass — the walk-off
// pattern a real VIPA disperser relies on. That spatial multiplexing is a
// genuinely geometric effect (each bounce exits at a different lateral
// position because of the tilt) and needs no phase/coherence tracking, so —
// unlike the Etalon element — this keeps the app's ordinary incoherent
// multi-pass mirror interaction (see raytrace.js's 'mirror' case) instead of
// the closed-form Airy transmission.
//
// Spectrally a VIPA is the same tilted Fabry–Pérot cavity as the Etalon
// element, just illuminated through a small entrance window instead of
// across the whole aperture — so it's specified the same way: center
// wavelength, resolution (bandwidth) and free spectral range, not the raw
// plate spacing and output-coating reflectivity that those two actually
// resolve to (see resolveVipaPhysical()).

import { registry } from './elements.js';
import { reflectivityForFinesse, spacingForFsr } from './etalon.js';

const D2R = Math.PI / 180;
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, Number(value)));

// A VIPA plate is typically millimeters thick (vs. an etalon's typical
// micrometers) to reach the sub-picometer resolution a real disperser needs
// — 0.05 nm FSR at the app-wide default 532 nm wavelength (532 / 0.05 =
// 10640, an exact integer mode order) gives a ~2.8 mm plate.
const DEFAULT_WAVELENGTH_NM = 532;
const DEFAULT_BANDWIDTH_NM = 0.002;
const DEFAULT_FSR_NM = 0.05;

// Canonical physical values {spacingMm, outputReflectivity} the geometric
// multi-bounce tracer needs, derived from the spectral parameters — the
// only way to specify a VIPA.
export function resolveVipaPhysical(params = {}) {
  const lam0 = Math.max(1, params.centerWavelength ?? DEFAULT_WAVELENGTH_NM);
  const fwhm = Math.max(0.0001, params.bandwidth ?? DEFAULT_BANDWIDTH_NM);
  const fsrTarget = Math.max(fwhm * 1.01, params.fsr ?? DEFAULT_FSR_NM);
  const R = reflectivityForFinesse(fsrTarget / fwhm);
  const spacingNm = spacingForFsr(lam0, fsrTarget);
  return { spacingMm: clamp(spacingNm / 1e6, 0.05, 100), outputReflectivity: clamp(R * 100, 0, 99.4) };
}

function frame(params = {}) {
  const aperture = clamp(params.aperture ?? 35, 6, 150);
  const spacing = resolveVipaPhysical(params).spacingMm;
  const tilt = clamp(params.tilt ?? 4, -30, 30) * D2R;
  const tangent = { x: Math.sin(tilt), y: Math.cos(tilt) };
  const normal = { x: Math.cos(tilt), y: -Math.sin(tilt) };
  const centre = sign => ({ x: sign * spacing * normal.x / 2, y: sign * spacing * normal.y / 2 });
  const point = (surfaceCentre, along) => ({
    x: surfaceCentre.x + along * tangent.x,
    y: surfaceCentre.y + along * tangent.y,
  });
  return { aperture, spacing, tangent, normal, centre, point };
}

function segment(a, b, refl, showTransmitted) {
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, kind: 'mirror', data: { refl, showTransmitted } };
}

export function vipaSurfaces(params = {}) {
  const f = frame(params), half = f.aperture / 2;
  const front = f.centre(-1), rear = f.centre(1);
  const frontReflectivity = clamp(params.frontReflectivity ?? 99.9, 0, 100);
  const outputReflectivity = resolveVipaPhysical(params).outputReflectivity;
  const windowSize = clamp(params.windowSize ?? 3, 0.5, Math.max(0.5, f.aperture - 1));
  const windowOffset = clamp(params.windowOffset ?? 0, -half + windowSize / 2, half - windowSize / 2);
  const windowLo = windowOffset - windowSize / 2;
  const windowHi = windowOffset + windowSize / 2;
  const out = [];
  if (windowLo > -half + 1e-6) out.push(segment(f.point(front, -half), f.point(front, windowLo), frontReflectivity, false));
  if (windowHi < half - 1e-6) out.push(segment(f.point(front, windowHi), f.point(front, half), frontReflectivity, false));
  out.push(segment(f.point(rear, -half), f.point(rear, half), outputReflectivity, params.showLeakage !== false));
  return out;
}

function coatingLine(surfaceCentre, f, from, to, stroke, width, dash = '') {
  const a = f.point(surfaceCentre, from), b = f.point(surfaceCentre, to);
  return `<line x1="${a.x.toFixed(2)}" y1="${a.y.toFixed(2)}" x2="${b.x.toFixed(2)}" y2="${b.y.toFixed(2)}" ` +
    `stroke="${stroke}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

export function vipaSVG(params = {}) {
  const f = frame(params), half = f.aperture / 2;
  const front = f.centre(-1), rear = f.centre(1);
  const p1 = f.point(front, -half), p2 = f.point(front, half);
  const p3 = f.point(rear, half), p4 = f.point(rear, -half);
  const body = `<path d="M ${p1.x.toFixed(2)},${p1.y.toFixed(2)} L ${p2.x.toFixed(2)},${p2.y.toFixed(2)} ` +
    `L ${p3.x.toFixed(2)},${p3.y.toFixed(2)} L ${p4.x.toFixed(2)},${p4.y.toFixed(2)} Z" ` +
    `fill="#c9e4f5" fill-opacity="0.62" stroke="#4a90c4" stroke-width="1.1"/>`;

  const windowSize = clamp(params.windowSize ?? 3, 0.5, Math.max(0.5, f.aperture - 1));
  const windowOffset = clamp(params.windowOffset ?? 0, -half + windowSize / 2, half - windowSize / 2);
  const windowLo = windowOffset - windowSize / 2;
  const windowHi = windowOffset + windowSize / 2;
  const windowCentre = f.point(front, windowOffset);
  const entryStart = { x: windowCentre.x - 9 * f.normal.x, y: windowCentre.y - 9 * f.normal.y };
  const entryEnd = { x: windowCentre.x - 1.4 * f.normal.x, y: windowCentre.y - 1.4 * f.normal.y };

  return body +
    coatingLine(front, f, -half, windowLo, '#353b44', 2.8) +
    coatingLine(front, f, windowHi, half, '#353b44', 2.8) +
    coatingLine(rear, f, -half, half, '#5d5575', 2.1, '3 1.5') +
    `<line x1="${entryStart.x.toFixed(2)}" y1="${entryStart.y.toFixed(2)}" ` +
    `x2="${entryEnd.x.toFixed(2)}" y2="${entryEnd.y.toFixed(2)}" stroke="#7c3aed" stroke-width="1.5"/>` +
    `<path d="M ${entryEnd.x.toFixed(2)},${entryEnd.y.toFixed(2)} l -3,-2 l 0,4 Z" fill="#7c3aed"/>`;
}

export const vipaDefinition = {
  label: 'VIPA',
  category: 'Filters & Splitters',
  paletteOrder: 5,
  aliases: ['virtually imaged phased array', 'spectral disperser', 'vipa etalon'],
  description: 'A tilted plate with a high-reflectivity entrance face (except a small entrance window) and a partially transmitting output face. Produces a fan of spatially offset leakage beams from repeated internal bounces — the geometric walk-off a real VIPA disperser relies on. Specified by center wavelength, spectral resolution and free spectral range, the same as the Etalon.',
  size: { w: 22, h: 41 },
  size_: element => {
    const f = frame(element.params);
    return { w: f.spacing + Math.abs(f.aperture * f.tangent.x) + 12, h: Math.abs(f.aperture * f.tangent.y) + 8 };
  },
  params: [
    { key: 'aperture', label: 'Clear aperture (mm)', type: 'number', min: 6, max: 150, step: 1, def: 35 },
    { key: 'centerWavelength', label: 'Center wavelength (nm)', type: 'number', min: 150, max: 8000, step: 1, def: DEFAULT_WAVELENGTH_NM },
    { key: 'bandwidth', label: 'Resolution, FWHM (nm)', type: 'number', min: 0.0001, max: 5, step: 0.0005, def: DEFAULT_BANDWIDTH_NM },
    { key: 'fsr', label: 'Free spectral range (nm)', type: 'number', min: 0.001, max: 10, step: 0.005, def: DEFAULT_FSR_NM },
    { key: 'tilt', label: 'Incidence tilt (°)', type: 'number', min: -30, max: 30, step: 0.5, def: 4 },
    { key: 'frontReflectivity', label: 'Front HR coating (%)', type: 'number', min: 0, max: 100, step: 0.1, def: 99.9 },
    { key: 'windowSize', label: 'Entrance window (mm)', type: 'number', min: 0.5, max: 30, step: 0.5, def: 3 },
    { key: 'windowOffset', label: 'Window offset (mm)', type: 'number', min: -60, max: 60, step: 0.5, def: 0 },
    { key: 'showLeakage', label: 'Show output leakage beams', type: 'checkbox', def: true },
  ],
  svg: element => vipaSVG(element.params),
  surfaces: element => vipaSurfaces(element.params),
};

registry.vipa = vipaDefinition;
