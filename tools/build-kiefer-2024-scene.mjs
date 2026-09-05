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
  element('kiefer-frame', 'figureframe', 390, 390, 0, { w: 760, h: 760, background: 'white' }),
  element('kiefer-title', 'textlabel', 40, 40, 0, {
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
    transformLimited: false,
    bandwidth: 0,
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
    length: 18,
    count: 7,
    f: 15,
  }, 'Separate custom aspheric MLA\n7 lenslets shown · D0,MLA = 720 µm', 't'),
  element('kiefer-lg1', 'lens', 245, 290, 180, {
    f: 45, dia: 48, transEff: 99,
  }, 'LG1 scan-lens proxy¹', 'b'),
  element('kiefer-gx', 'galvo', 200, 290, 45, {
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
  element('kiefer-lg23', 'telescope', 200, 395, 90, {
    f1: 52.5, f2: 52.5, dia: 70, transEff: 99,
  }, 'LG2/LG3 · 1× conjugate relay¹', 'r'),
  element('kiefer-gy', 'galvo', 200, 500, 135, {
    length: 24,
    commandAngle: 0,
    scanMode: 'sine',
    scanAmplitude: 0.5,
    scanFrequencyHz: 73,
    scanPhaseDeg: 90,
    refl: 100,
    showTransmitted: false,
  }, 'GY · coordinate flip before mirror', 'l'),
  element('kiefer-lg45', 'telescope', 371.3291666667, 500, 0, {
    f1: 68.5316666667, f2: 137.0633333333, dia: 100, transEff: 99,
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
    aperture: 4,
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
    spread: 2,
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

  element('kiefer-mla-stop', 'slit', 306, 290, 180, { gap: 18, length: 42 }),
  element('kiefer-led-stop', 'filter', 625, 500, 0, {
    ftype: 'shortpass', cutoff: 700, length: 20,
  }),
  element('kiefer-return-stop', 'filter', 480, 500, 0, {
    ftype: 'longpass', cutoff: 700, length: 160,
  }),
  element('kiefer-pickoff-dump', 'beamdump', 505, 440, 90, { aperture: 60 }),
  element('kiefer-mechanism', 'textlabel', 40, 580, 0, {
    text: '**Hybrid beam splitting**\nSeven DOE orders illuminate seven separate lenslets.\nThe MLA supplies refractive separation; both galvos\nscan the resulting focus row through the objective.\nThe paper has 49 foci in 7×7; this view shows one row.',
    fontSize: 10, fill: '#2b6471',
  }),
  element('kiefer-limit', 'textlabel', 40, 695, 0, {
    text: '**Free interpretation — not specified in the paper:**\nFocal lengths, spacings, folds, coatings, source width, galvo rates,\nAOM settings, LED condenser and isolation filters. Not to scale.\n**Model limit:** geometric routing; no custom asphere, 3D field,\nPSF, calibrated efficiency, nonlinear dose or curing.',
    fontSize: 10, fill: '#5f6670',
  }),
  element('kiefer-power', 'textlabel', 555, 600, 0, {
    text: '**Reported power planes**\n3.7 W at laser output\n954 mW total before objective\n19.5 mW per focus there\n70% objective transmission assumed',
    fontSize: 9, fill: '#7a4b00',
  }),
  element('kiefer-source-note', 'textlabel', 40, 190, 0, {
    text: '**Reported source:** 790 nm · 140 fs sech² · 80 MHz\nBeam diameters: DOE 571 µm; MLA 720 µm (not optic sizes).\n**Try:** DOE orders = 0; weaken MLA f; run Mechanics; laser off.',
    fontSize: 10, fill: '#475569',
  }),
];

const labels = {
  laser: ['Chameleon Ultra II', 't'], l12: ['L1/L2 · 1.25×', 't'],
  aom: ['AOM', 'b'], dump: ['Zero order', 't'], l34: ['L3/L4 · 1.60×', 'b'],
  'fold-a': ['Fold¹', 'r'], 'fold-b': ['Fold¹', 'r'],
  doe: ['DOE · 7 orders', 'b'], l56: ['L5/L6 · 3.33×', 't'],
  l7: ['L7', 'b'], mla: ['MLA · 7 lenslets', 't'], lg1: ['LG1', 'b'],
  gx: ['GX', 'l'], lg23: ['LG2/LG3 · 1×', 'l'], gy: ['GY', 'l'],
  lg45: ['LG4/LG5 · 2×', 'b'], bs: ['BS', 'b'],
  objective: ['40× / NA 1.4 oil', 't'], stage: ['Resin', 'b'],
  'led-condenser': ['', 'b'], led: ['Yellow LED', 't'],
  l8: ['L8', 'r'], camera: ['CMOS', 'l'],
};
for (const item of elements) {
  const label = labels[item.id.replace('kiefer-', '')];
  if (label) [item.label, item.labelPos] = label;
}

await mkdir(new URL('../collections/2pp/setups/', import.meta.url), { recursive: true });
await writeFile(output, `${JSON.stringify({ app: 'optics2d', version: 1, elements, beams: [] }, null, 1)}\n`);
console.log(`Wrote ${output}`);
