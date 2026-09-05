import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { createElement } from '../sketch/js/elements.js';

const output = fileURLToPath(new URL('../collections/2pp/setups/kiefer-2024.json', import.meta.url));

function element(id, type, x, y, rot = 0, params = {}, label = '', labelPos = 't') {
  const item = createElement(type, x, y);
  item.id = id;
  item.rot = rot;
  Object.assign(item.params, params);
  if (label) {
    item.label = label;
    item.showLabel = true;
    item.labelPos = labelPos;
  }
  return item;
}

const elements = [
  element('kiefer-frame', 'figureframe', 390, 360, 0, { w: 760, h: 680, background: 'white' }),
  element('kiefer-title', 'textlabel', 390, 40, 0, {
    text: '**Kiefer et al. 2024 — hybrid DOE + MLA 49-focus printer**\nNative 2D meridional mechanism proxy · DOI 10.37188/lam.2024.003',
    fontSize: 15,
    fill: '#26333a',
  }),

  // Writing path, row 1: reported source, AOM, and input relays.
  element('kiefer-laser', 'pulsedlaser', 75, 100, 0, {
    enabled: true,
    wavelength: 790,
    avgPowerW: 3.7,
    beamMode: 'beam',
    beamWidth: 4,
    repRateMHz: 80,
    pulsePhaseNs: 0,
    pulseWidthFs: 140,
    transformLimited: true,
    pulseShape: 'sech2',
    pol: 0,
    autoColor: true,
    color: '#c90000',
    showPulse: true,
    temporalMode: 'pulsed',
  }, 'Chameleon Ultra II\n790 nm · 140 fs sech² · 80 MHz · 3.7 W', 'b'),
  element('kiefer-l12', 'telescope', 210, 100, 0, {
    f1: 30, f2: 24, dia: 18, transEff: 99,
  }, 'L1/L2 · 1.25× demagnification¹', 't'),
  element('kiefer-aom', 'aom', 290, 100, 0, {
    aperture: 18,
    deflect: 8,
    rfMHz: 80,
    zero: true,
    eff: 0.82,
    modulate: false,
  }, 'AOM · first order used', 'b'),
  element('kiefer-dump', 'beamdump', 390, 100, 0, { aperture: 16 }, '0th order dump', 't'),
  element('kiefer-l34', 'telescope', 420, 118.3, 8, {
    f1: 25, f2: 40, dia: 18, transEff: 99,
  }, 'L3/L4 · 1.60× relay¹', 'b'),
  element('kiefer-fold-a', 'mirror', 540, 135.1, 139, {
    length: 28, refl: 100, showTransmitted: false,
  }, 'Fold¹', 'r'),
  element('kiefer-fold-b', 'mirror', 540, 290, 45, {
    length: 28, refl: 100, showTransmitted: false,
  }, 'Fold¹', 'r'),

  // Writing path, row 2: low-angle diffractive split, refractive separation,
  // then the first scan lens and physical X galvo.
  element('kiefer-doe', 'diffractivesplitter', 505, 290, 180, {
    length: 34,
    lines: 54,
    orders: '-3,-2,-1,0,1,2,3',
  }, '7-order section of 7×7 DOE\nMDOE ≈ 3 · D0,DOE = 571 µm', 'b'),
  element('kiefer-l56', 'telescope', 440, 290, 180, {
    f1: 15, f2: 50, dia: 38, transEff: 99,
  }, 'L5/L6 · 3.33× telescope¹', 't'),
  element('kiefer-l7', 'lens', 370, 290, 180, {
    f: 200, dia: 42, transEff: 99,
  }, 'L7 · telecentric collimation¹', 'b'),
  element('kiefer-mla', 'microlensarray', 305, 290, 180, {
    length: 42,
    count: 7,
    f: 45,
  }, 'Separate custom aspheric MLA\n7 lenslets shown · D0,MLA = 720 µm', 't'),
  element('kiefer-lg1', 'lens', 245, 290, 180, {
    f: 55, dia: 48, transEff: 99,
  }, 'LG1 scan-lens proxy¹', 'b'),
  element('kiefer-gx', 'galvo', 160, 290, 45, {
    length: 24,
    commandAngle: 0,
    scanMode: 'triangle',
    scanAmplitude: 0.8,
    scanFrequencyHz: 100,
    scanPhaseDeg: 0,
    refl: 100,
    showTransmitted: false,
  }, 'GX · 6 mm reported²', 'l'),

  // Down-leg and row 3: GX-to-GY unity relay, GY, 2× pupil relay, objective,
  // resin target. Both galvos animate and alter the computed downstream trace.
  element('kiefer-lg23', 'telescope', 160, 400, 90, {
    f1: 40, f2: 40, dia: 50.8, transEff: 99,
  }, 'LG2/LG3 · 1× conjugate relay¹', 'r'),
  element('kiefer-gy', 'galvo', 160, 500, 135, {
    length: 24,
    commandAngle: 0,
    scanMode: 'sine',
    scanAmplitude: 0.5,
    scanFrequencyHz: 73,
    scanPhaseDeg: 90,
    refl: 100,
    showTransmitted: false,
  }, 'GY · coordinate flip before mirror', 'l'),
  element('kiefer-lg45', 'telescope', 365, 500, 0, {
    f1: 50, f2: 100, dia: 60, transEff: 99,
  }, 'LG4/LG5 · 2× pupil relay¹', 't'),
  element('kiefer-bs', 'bs', 505, 500, 0, {
    ratio: 0.96,
    size: 25.4,
  }, 'BS · writing path transmitted', 't'),
  element('kiefer-objective', 'objective', 605, 500, 0, {
    efl: 5,
    workingDistance: 0.19,
    immersion: 'oil',
    immersionIndex: 1.49,
    na: 1.4,
    showAcceptance: true,
    transEff: 70,
    frontAperture: 11.55,
  }, 'Zeiss Plan-Apochromat 40× / NA 1.4 oil\n11.55 mm entrance pupil · 70% assumed transmission', 't'),
  element('kiefer-stage', 'sample', 621.2, 500, 90, {
    aperture: 54,
    specimenType: 'resin',
    channels: [],
    showSignalSpot: true,
    thickness: 0.15,
    voxelPreview: true,
    voxelSize: 0.8,
    transmitExc: true,
    transmission: 0.8,
    mode: 'none',
    fluorWl: 520,
    carsWl: 660,
    signalEff: 0.1,
  }, 'Photocurable resin on reported XYZ stages', 'b'),

  // Reported transmission-observation path: yellow-light LED through sample
  // and writing objective, picked off at BS, focused by L8 onto the camera.
  // A condenser is added explicitly because the native point emitter needs a
  // collector before it can represent the otherwise unspecified illumination.
  element('kiefer-led-condenser', 'lens', 650, 500, 180, {
    f: 30, dia: 20, transEff: 95,
  }, 'LED condenser¹', 'b'),
  element('kiefer-led', 'pointsource', 680, 500, 180, {
    displayScale: 0.7,
    sourceKind: 'point',
    wavelength: 590,
    bwMode: 'band',
    bandwidth: 40,
    spread: 8,
    nrays: 12,
    autoColor: true,
    color: '#f1c40f',
  }, 'Yellow-light LED illumination', 't'),
  element('kiefer-l8', 'lens', 505, 565, 90, {
    f: 45, dia: 30, transEff: 95,
  }, 'L8', 'r'),
  element('kiefer-camera', 'camera', 505, 635, 90, {
    ch: 36,
    pixels: 64,
    interference: false,
  }, 'CMOS camera · print monitoring', 'r'),

  element('kiefer-mechanism', 'textlabel', 360, 620, 0, {
    text: '**Why the separate MLA matters**\nThe low-angle DOE limits chromatic spread. Each diffracted beamlet then enters its own refractive lenslet, increasing focus separation without a second high-angle diffractive split and reducing clipping through the scan/pupil relays. The paper still estimates 86.5% Gaussian-pupil use—not zero vignetting.',
    fontSize: 10,
    fill: '#2b6471',
  }),
  element('kiefer-limit', 'textlabel', 225, 590, 0, {
    text: '¹ **Free interpretation — not specified in the paper:** focal lengths, relay spacings, fold mirrors, coatings, AOM deflection/efficiency, LED condenser and display scale.\n² The canvas is not dimensionally to scale; 571 µm and 720 µm are reported **beam diameters**, while the 6 mm galvo is drawn larger for legibility.\n**Model boundary:** representative 7-order/7-lenslet meridional section only—not the custom asphere, 7×7 vector field, PSF, efficiency, dose or curing model.',
    fontSize: 8.5,
    fill: '#5f6670',
  }),
  element('kiefer-power', 'textlabel', 625, 585, 0, {
    text: '**Power plane (reported)**\n954 mW total before objective\n÷ 49 = 19.5 mW per focus before objective\n70% objective transmission is an assumption\n3.7 W is laser output—not sample power',
    fontSize: 9,
    fill: '#7a4b00',
  }),
];

await mkdir(new URL('../collections/2pp/setups/', import.meta.url), { recursive: true });
await writeFile(output, `${JSON.stringify({ app: 'optics2d', version: 1, elements, beams: [] }, null, 1)}\n`);
console.log(`Wrote ${output}`);
