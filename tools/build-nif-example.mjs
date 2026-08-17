// Deterministically rebuild the large NIF teaching sketch from normal
// OpticalSetup components. The emitted JSON is the same format as Save,
// with optional named regions used only by the large-example navigator.

import { writeFile } from 'node:fs/promises';
import { createElement } from '../sketch/js/elements.js';
import '../sketch/js/detector-instruments.js';

let elementIndex = 0;
let beamIndex = 0;

function mk(type, x, y, rot = 0, params = {}, extra = {}) {
  const element = createElement(type, x, y);
  element.id = `nif-e${String(++elementIndex).padStart(3, '0')}`;
  element.rot = rot;
  Object.assign(element.params, params);
  Object.assign(element, extra);
  return element;
}

function tl(text, x, y, fontSize = 11, fill = '#555555') {
  return mk('textlabel', x, y, 0, { text, fontSize, fill });
}

function tls(lines, x, y, fontSize = 11, fill = '#555555') {
  return lines.map((line, index) => tl(line, x, y + index * (fontSize + 3), fontSize, fill));
}

function beamId() {
  return `nif-b${String(++beamIndex).padStart(3, '0')}`;
}

function polylineLength(points) {
  let length = 0;
  for (let index = 0; index < points.length - 1; index++) {
    length += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
  }
  return length;
}

function circlePolyline(cx, cy, radius, samples = 96) {
  return Array.from({ length: samples + 1 }, (_, index) => {
    const angle = index * 2 * Math.PI / samples;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

function buildNifFacilityScene() {
  elementIndex = 0;
  beamIndex = 0;
  const elements = [], beams = [];
  const cx = 3200, cy = 900;
  const sourceX = 80, sourceExitX = sourceX + 52;
  const portCount = 11;
  const portAngles = Array.from({ length: portCount }, (_, index) => -180 + index * 360 / portCount);
  const radial = (angleDeg, radius) => {
    const angle = angleDeg * Math.PI / 180;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  };
  const along = (angleDeg, radius, type, params = {}, extra = {}) => {
    const point = radial(angleDeg, radius);
    return mk(type, point.x, point.y, angleDeg + 180, params, extra);
  };

  elements.push(
    tl('NATIONAL IGNITION FACILITY · 2D OPTICAL CONSTRUCTION', 2400, -920, 24, '#24313d'),
    tl('One modeled master pulse → 11 causally connected representative quad ports → one absorbing target surrogate', 2400, -884, 12, '#536473'),
    tl('This opens as a facility overview. Use Setup regions, then zoom to inspect split ratios, fibers, timing trim, amplifier optics, final optics, and VISAR.', 2400, -858, 10, '#6c7a87'),
    tl('Reality scale: NIF has 48 chamber beam ports, four beams per port (192 beamlines). This readable 2D slice displays 11 live representative ports.', 2400, -832, 10, '#7653ad'),
    tl('01  MASTER OSCILLATOR + INJECTION DISTRIBUTION', 900, 420, 13, '#34495a'),
    tl('Sequential split ratios make eleven equal-power displayed seeds. The icons stand in for the actual staged fiber splitter / fiber amplifier network.', 900, 448, 9, '#687786'),
    mk('laser', sourceX, cy, 0, {
      wavelength: 1053, beamMode: 'line', temporalMode: 'single',
      pulseWidthFs: 20000000, pulsePhaseNs: 0,
    }, { label: '1ω master-oscillator pulse · illustrative 20 ns', showLabel: true, labelPos: 'b' }),
  );

  const inputs = [];
  for (let index = 0; index < portCount - 1; index++) {
    const splitX = 500 + index * 95;
    const up = index % 2 === 0;
    const transmission = (portCount - index - 1) / (portCount - index);
    elements.push(mk('bs', splitX, cy, up ? 0 : 90, {
      ratio: transmission, size: 40,
    }, index === 0 ? {
      label: 'equal-power staged split · T = 10/11, 9/10 … 1/2', showLabel: true, labelPos: 't',
    } : {}));
    const p0 = { x: splitX, y: cy + (up ? -170 : 170) };
    const p1 = { x: splitX, y: cy + (up ? -250 : 250) };
    inputs.push({ portIndex: index + 1, p0, p1, entryOpl: splitX - sourceExitX + 170 });
  }
  inputs.push({
    portIndex: 0,
    p0: { x: 1570, y: cy },
    p1: { x: 1650, y: cy },
    entryOpl: 1570 - sourceExitX,
  });

  const fiberRecords = [];
  for (const input of inputs) {
    const angle = portAngles[input.portIndex];
    const radians = angle * Math.PI / 180;
    const direction = { x: Math.cos(radians), y: Math.sin(radians) };
    const outer = radial(angle, 1420);
    const shoulder = radial(angle, 1210);
    const end = radial(angle, 1100);
    const points = [input.p0, input.p1];
    if (direction.x > 0.05) {
      const upper = direction.y < 0;
      const corridorY = cy + (upper ? -1650 : 1650) + input.portIndex * (upper ? -9 : 9);
      points.push({ x: 1750, y: corridorY }, { x: cx + 1580, y: corridorY });
    } else if (direction.y < -0.12) {
      points.push({ x: 1720, y: cy - 1320 }, { x: outer.x - 150, y: cy - 1320 });
    } else if (direction.y > 0.12) {
      points.push({ x: 1720, y: cy + 1320 }, { x: outer.x - 150, y: cy + 1320 });
    } else {
      points.push({ x: 1780, y: cy });
    }
    points.push(outer, shoulder, end);
    const fiber = {
      id: beamId(), kind: 'fiber', pts: points, color: '#b58d2e', width: 3,
      bare: false, propagate: true, inputNA: 0.22, groupIndex: 1.468, lossDbPerM: 0,
      out0: { mode: 'diverge', na: 0.08, focal: 20, dia: 8 },
      out1: { mode: 'diverge', na: 0.08, focal: 20, dia: 8 },
    };
    beams.push(fiber);
    fiberRecords.push({
      ...input, angle, fiber,
      preTrimOpl: input.entryOpl + polylineLength(points) * 1.468 + 2,
    });
  }

  const longestPreTrim = Math.max(...fiberRecords.map(record => record.preTrimOpl));
  for (const record of fiberRecords) {
    const angle = record.angle;
    const port = String(record.portIndex + 1).padStart(2, '0');
    const first = record.portIndex === 0;
    elements.push(
      along(angle, 1008, 'lens', { f: 90, dia: 50.8 }, first ? {
        label: 'collimator', showLabel: true, labelPos: 't',
      } : {}),
      along(angle, 962, 'delayline', {
        delayMm: longestPreTrim - record.preTrimOpl, aperture: 42,
      }, first ? { label: 'timing trim', showLabel: true, labelPos: 'b' } : {}),
      along(angle, 910, 'eom', {
        aperture: 42, modulate: true, a: 0, retardance: 0,
      }, first ? { label: 'EOM / PEPC proxy', showLabel: true, labelPos: 't' } : {}),
      along(angle, 835, 'freeglass', {
        vertices: [{ x: -35, y: -16 }, { x: 35, y: -16 }, { x: 35, y: 16 }, { x: -35, y: 16 }],
        scale: 1, material: 'constant', ior: 1.5, transmission: 0.99,
      }, first ? { label: 'Nd:glass · passive', showLabel: true, labelPos: 'b' } : {}),
      along(angle, 748, 'crystal', {
        aperture: 46, convert: 'shg', efficiency: 1, transmitPump: false,
      }, first ? { label: '2ω · 526.5', showLabel: true, labelPos: 't' } : {}),
      along(angle, 690, 'crystal', {
        aperture: 46, convert: 'custom', outWl: 351, efficiency: 1, transmitPump: false,
      }, first ? { label: '3ω · 351', showLabel: true, labelPos: 'b' } : {}),
      along(angle, 590, 'lens', { f: 590, dia: 50.8 }, first ? {
        label: 'final focus', showLabel: true, labelPos: 't',
      } : {}),
    );
    const badge = radial(angle, 515);
    elements.push(tl(`P${port}`, badge.x, badge.y, 8, '#694aa0'));
  }

  const sampleAngle = portAngles[0];
  elements.push(along(sampleAngle, 535, 'bs', { ratio: 0.75, size: 34 }, {
    label: '25% display sample', showLabel: true, labelPos: 'b',
  }));
  const samplerPoint = radial(sampleAngle, 535);
  elements.push(mk('detector', samplerPoint.x, samplerPoint.y - 150, 270, { aperture: 80 }, {
    label: '3ω drive PD · live 351 nm', showLabel: true, labelPos: 'r',
  }));

  elements.push(
    tl('02  11 LIVE FINAL-OPTICS PORTS', cx, 250, 13, '#34495a'),
    tl('Each port is active: fiber seed → collimator → timing trim → EOM/PEPC proxy → glass slab → 2ω → 3ω → focus.', cx, 276, 9, '#687786'),
    tl('The 11-way radial layout is a readable 2D projection, not NIF’s literal four 3D cone angles. Every P01–P11 path is traced from the same source.', cx, 298, 9, '#7653ad'),
    mk('sample', cx, cy, 0, {
      aperture: 110, mode: 'none', transmitExc: false, transmission: 0,
    }, { label: 'absorbing target surrogate', showLabel: true, labelPos: 'b' }),
    tl('target element is real absorption; hohlraum x-ray conversion, capsule implosion, fusion, and yield are not modeled', cx, cy + 92, 8.5, '#8a3e3e'),
  );

  beams.push(
    { id: beamId(), kind: 'beam', pts: circlePolyline(cx, cy, 505), color: '#617384', width: 4, dash: true, arrow: false },
    { id: beamId(), kind: 'beam', pts: circlePolyline(cx, cy, 472), color: '#aab5bf', width: 1.4, dash: true, arrow: false },
  );

  elements.push(
    tl('03  VISAR-STYLE OPTICAL DIAGNOSTIC · LIVE RAY PATH', 2800, 2275, 13, '#176b78'),
    tl('Separate pulsed probe, target return, delayed reference return, recombination, and camera are optical elements—not a diagnostic placeholder.', 2800, 2302, 9, '#4e6f78'),
    tl('LLNL VISAR uses 659.5–660 nm light. This camera measures return and delay spread; coherent fringe phase and inferred velocity are outside the ray model.', 2800, 2324, 9, '#7a556f'),
    mk('laser', 2300, 2800, 0, {
      wavelength: 659.5, beamMode: 'line', temporalMode: 'single',
      pulseWidthFs: 100000, pulsePhaseNs: 0,
    }, { label: 'VISAR probe · illustrative 100 ps', showLabel: true, labelPos: 'b' }),
    mk('bs', 2550, 2800, 0, { ratio: 0.5, size: 40 }, {
      label: 'interferometer splitter / recombiner', showLabel: true, labelPos: 'b',
    }),
    mk('delayline', 2550, 2580, 270, { delayMm: 50, aperture: 40 }, {
      label: 'delayed reference arm', showLabel: true, labelPos: 'l',
    }),
    mk('mirror', 2550, 2470, 90, { length: 60, refl: 100 }, {
      label: 'reference return', showLabel: true, labelPos: 'l',
    }),
    mk('mirror', 3100, 2800, 45, { length: 60, refl: 100 }, {
      label: 'target-line turn mirror', showLabel: true, labelPos: 'b',
    }),
    mk('mirror', 3100, 2350, 90, { length: 60, refl: 100 }, {
      label: 'moving reflector surrogate · target return', showLabel: true, labelPos: 'r',
    }),
    mk('camera', 2550, 3050, 90, { ch: 80, pixels: 32, rows: 12 }, {
      label: 'streak-camera proxy · live 659.5 nm returns', showLabel: true, labelPos: 'r',
    }),
    tl('DANTE: x-ray power history · annotation only (no x-ray transport)', 3950, 1910, 9, '#9a6a22'),
    tl('nTOF: neutron time of flight · annotation only (no neutron transport)', 3950, 1940, 9, '#3a7654'),
    tl('MODEL BOUNDARY', 3950, 2750, 11, '#8a3e3e'),
    ...tls([
      'Simulated: geometric paths, bounded relative signal, wavelengths, polarization, single-shot timing, fiber delay, detector arrivals.',
      'Constructed from existing optics only: laser, BS, fiber, lens, delay, EOM, freeform glass, crystals, sample, mirrors, detector/camera.',
      'Not simulated: gain/saturation, flashlamps, four-pass amplifier switching, damage, diffraction/phase, 3D cones, x rays, implosion, fusion, neutrons.',
    ], 3950, 2776, 8.5, '#66717e'),
  );

  return {
    app: 'optics2d', version: 1, elements, beams,
    regions: [
      { label: 'Whole facility', bounds: { x0: -40, y0: -1020, x1: 4830, y1: 3200 }, padding: 20 },
      { label: 'Injection split', bounds: { x0: 0, y0: 350, x1: 1760, y1: 1450 }, padding: 70 },
      { label: '11 live ports', bounds: { x0: 1950, y0: 120, x1: 4400, y1: 1760 }, padding: 45 },
      { label: 'VISAR diagnostic', bounds: { x0: 2180, y0: 2240, x1: 3270, y1: 3150 }, padding: 55 },
      { label: 'Model boundary', bounds: { x0: 3450, y0: 2670, x1: 4720, y1: 2870 }, padding: 80 },
    ],
  };
}

const output = new URL('../Examples/NIF — one shot from master oscillator to target.json', import.meta.url);
await writeFile(output, `${JSON.stringify(buildNifFacilityScene(), null, 1)}\n`, 'utf8');
console.log(`Wrote ${output.pathname}`);
