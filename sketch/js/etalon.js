// Bounded Fabry–Pérot etalon and VIPA models.
//
// The general tracer is intentionally phase-free. Etalon mode therefore uses
// the closed-form, lossless Airy transmission for two identical coatings
// rather than recursively spawning cavity rays. VIPA mode emits a finite
// geometric leakage array with a user-set qualitative angular dispersion.

const D2R = Math.PI / 180;
const clamp = (value, lo, hi) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(hi, Math.max(lo, number)) : lo;
};

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
  return { mode, aperture, spacing, tilt, tangent, normal, centre, point };
}

function modelData(params, f) {
  return {
    aperture: f.aperture,
    spacing: f.spacing,
    configuredTiltDeg: f.tilt / D2R,
    refractiveIndex: clamp(params.refractiveIndex ?? 1.46, 1, 2.5),
    designWavelength: clamp(params.designWavelength ?? 532, 200, 2000),
  };
}

export function airyTransmission({
  wavelengthNm,
  designWavelengthNm = 532,
  spacingMm = 12,
  refractiveIndex = 1.46,
  reflectivity = 0.9,
  incidenceSin = 0,
  referenceIncidenceSin = 0,
} = {}) {
  const wavelength = clamp(wavelengthNm ?? designWavelengthNm, 1, 1e6);
  const designWavelength = clamp(designWavelengthNm, 1, 1e6);
  const spacingNm = clamp(spacingMm, 0, 1e6) * 1e6;
  const index = clamp(refractiveIndex, 1, 2.5);
  const coatingR = clamp(reflectivity, 0, 0.999999);
  const insideSin = clamp(incidenceSin / index, -0.999999, 0.999999);
  const referenceInsideSin = clamp(referenceIncidenceSin / index, -0.999999, 0.999999);
  const insideCos = Math.sqrt(Math.max(0, 1 - insideSin * insideSin));
  const referenceInsideCos = Math.sqrt(Math.max(0, 1 - referenceInsideSin * referenceInsideSin));
  const finesseCoefficient = 4 * coatingR / Math.max(1e-12, (1 - coatingR) ** 2);
  // Subtract the configured design state before evaluating the Airy phase.
  // This makes the design wavelength an explicit resonant reference instead
  // of depending on an unknowable absolute coating phase / integer order.
  const phaseHalf = 2 * Math.PI * index * spacingNm
    * (insideCos / wavelength - referenceInsideCos / designWavelength);
  return 1 / (1 + finesseCoefficient * Math.sin(phaseHalf) ** 2);
}

export function etalonSurfaces(params = {}) {
  const f = frame(params), half = f.aperture / 2;
  const front = f.centre(-1);
  const a = f.point(front, -half), b = f.point(front, half);
  const common = modelData(params, f);

  if (f.mode === 'etalon') {
    return [{
      x1: a.x, y1: a.y, x2: b.x, y2: b.y,
      kind: 'etalon',
      data: {
        ...common,
        reflectivity: clamp(params.reflectivity ?? 90, 0, 99.9) / 100,
      },
    }];
  }

  const frontReflectivity = clamp(params.frontReflectivity ?? 99.9, 0, 99.9);
  const windowSize = clamp(params.windowSize ?? 3, 0.5, Math.max(0.5, f.aperture - 1));
  const windowOffset = clamp(params.windowOffset ?? 0, -half + windowSize / 2, half - windowSize / 2);
  const windowLo = windowOffset - windowSize / 2;
  const windowHi = windowOffset + windowSize / 2;
  const surface = (from, to, kind, data) => {
    const start = f.point(front, from), end = f.point(front, to);
    return { x1: start.x, y1: start.y, x2: end.x, y2: end.y, kind, data };
  };
  const out = [];
  if (windowLo > -half + 1e-6) {
    out.push(surface(-half, windowLo, 'mirror', { refl: frontReflectivity, showTransmitted: false }));
  }
  out.push(surface(windowLo, windowHi, 'vipa', {
    ...common,
    windowOffset,
    frontReflectivity: frontReflectivity / 100,
    outputReflectivity: clamp(params.outputReflectivity ?? 96, 0, 99.9) / 100,
    angularDispersionDegPerNm: clamp(params.angularDispersion ?? 0.08, -1, 1),
    showLeakage: params.showLeakage !== false,
    maxOrders: 24,
  }));
  if (windowHi < half - 1e-6) {
    out.push(surface(windowHi, half, 'mirror', { refl: frontReflectivity, showTransmitted: false }));
  }
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
  description: 'A closed-form Airy etalon or a bounded, wavelength-separated VIPA leakage array.',
  capabilityNote: 'Etalon transmission is an ideal lossless Airy response referenced to the design wavelength. VIPA leakage and angular dispersion are qualitative; diffraction, coherent far-field fringes, coating phase, and calibration are not modeled.',
  size: { w: 22, h: 41 },
  size_: element => {
    const f = frame(element.params);
    return { w: f.spacing + Math.abs(f.aperture * f.tangent.x) + 12, h: Math.abs(f.aperture * f.tangent.y) + 8 };
  },
  params: [
    { key: 'mode', label: 'Configuration', type: 'select', def: 'etalon', options: [['etalon', 'Fabry–Pérot etalon'], ['vipa', 'VIPA']] },
    { key: 'aperture', label: 'Clear aperture (mm)', type: 'number', min: 6, max: 150, step: 1, def: 35 },
    { key: 'spacing', label: 'Plate spacing / thickness (mm)', type: 'number', min: 1, max: 100, step: 0.5, def: 12 },
    { key: 'refractiveIndex', label: 'Cavity index', type: 'number', min: 1, max: 2.5, step: 0.01, def: 1.46 },
    { key: 'designWavelength', label: 'Design wavelength (nm)', type: 'number', min: 200, max: 2000, step: 1, def: 532 },
    { key: 'etalonTilt', label: 'Etalon tilt (°)', type: 'number', min: -30, max: 30, step: 0.5, def: 0, show: p => p.mode !== 'vipa' },
    { key: 'reflectivity', label: 'Both surfaces reflectivity (%)', type: 'number', min: 0, max: 99.9, step: 0.1, def: 90, show: p => p.mode !== 'vipa' },
    { key: 'vipaTilt', label: 'VIPA incidence tilt (°)', type: 'number', min: -30, max: 30, step: 0.5, def: 4, show: p => p.mode === 'vipa' },
    { key: 'frontReflectivity', label: 'Front HR coating (%)', type: 'number', min: 0, max: 99.9, step: 0.1, def: 99.9, show: p => p.mode === 'vipa' },
    { key: 'outputReflectivity', label: 'Output coating reflectivity (%)', type: 'number', min: 0, max: 99.9, step: 0.1, def: 96, show: p => p.mode === 'vipa' },
    { key: 'angularDispersion', label: 'Angular dispersion (°/nm)', type: 'number', min: -1, max: 1, step: 0.01, def: 0.08, show: p => p.mode === 'vipa' },
    { key: 'windowSize', label: 'Entrance window (mm)', type: 'number', min: 0.5, max: 30, step: 0.5, def: 3, show: p => p.mode === 'vipa' },
    { key: 'windowOffset', label: 'Window offset (mm)', type: 'number', min: -60, max: 60, step: 0.5, def: 0, show: p => p.mode === 'vipa' },
    { key: 'showLeakage', label: 'Show output leakage beams', type: 'checkbox', def: true, show: p => p.mode === 'vipa' },
  ],
  svg: element => etalonSVG(element.params),
  surfaces: element => etalonSurfaces(element.params),
};
