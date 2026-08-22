import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createElement, estimatedThinLensThicknessMm, registry,
} from '../sketch/js/elements.js';
import {
  gaussianPulseDurationAfterGDD, glassAbbe, glassGVD, glassIndex,
} from '../sketch/js/glass.js';
import { detectorReading, traceScene } from '../sketch/js/raytrace.js';
import { pulseEnvelopeAtOpticalPath } from '../sketch/js/pulses.js';
import { parseSketch } from '../sketch/js/state.js';

const sketchFile = elements => JSON.stringify({ app: 'optics2d', version: 1, elements, beams: [] });

function pulsedLaser(wavelength = 800, pulseWidthFs = 100) {
  const laser = createElement('pulsedlaser', 0, 0);
  Object.assign(laser.params, {
    wavelength, pulseWidthFs, beamMode: 'line',
    transformLimited: true, pulseShape: 'gauss',
  });
  return laser;
}

test('Sellmeier curves reproduce catalogue index, Abbe number, GVD, and silica zero crossing', () => {
  const catalogue = [
    ['nbk7', 1.51679844, 64.17, 44.7],
    ['silica', 1.45846234, 67.82, 36.1],
    ['nsf5', 1.67270302, 32.25, 130],
    ['nsf11', 1.78471410, 25.68, 187],
  ];
  for (const [id, nd, abbe, gvd800] of catalogue) {
    assert.ok(Math.abs(glassIndex(id, 587.6) - nd) < 1e-5, `${id} d-line index`);
    assert.ok(Math.abs(glassAbbe(id) - abbe) < 0.1, `${id} Abbe number`);
    assert.ok(Math.abs(glassGVD(id, 800) / gvd800 - 1) < 0.03, `${id} GVD at 800 nm`);
  }
  assert.ok(glassGVD('silica', 1250) > 0);
  assert.ok(glassGVD('silica', 1290) < 0);
});

test('a traced 20 mm N-SF11 prism path accumulates the expected GDD at 800 nm', () => {
  const laser = pulsedLaser();
  const prism = createElement('prism', 150, 0);
  // At this orientation the central ray undergoes one internal reflection.
  // Scaling the triangular body to 19.18 mm gives 20.00 mm of measured path
  // inside it; GDD must follow that path rather than the palette size label.
  Object.assign(prism.params, { material: 'nsf11', psize: 19.18 });
  const detector = createElement('detector', 57, 186);
  detector.rot = 120;
  detector.params.aperture = 150;

  traceScene([laser, prism, detector]);
  const pulse = detectorReading(detector.id)?.pulse;
  assert.ok(pulse, 'the internally reflected prism ray reaches the detector');
  assert.ok(pulse.gddFs2 >= 3700 && pulse.gddFs2 <= 3800, `${pulse.gddFs2} fs²`);
});

test('a 50 mm fused-silica rod accumulates path-length GDD', () => {
  const laser = pulsedLaser();
  const rod = createElement('glassrod', 150, 0);
  Object.assign(rod.params, { rodlen: 50, material: 'silica' });
  const detector = createElement('detector', 300, 0);
  traceScene([laser, rod, detector]);

  const pulse = detectorReading(detector.id)?.pulse;
  assert.ok(pulse.gddFs2 >= 1750 && pulse.gddFs2 <= 1850, `${pulse.gddFs2} fs²`);
});

test('a 10 fs Gaussian pulse broadens correctly through a traced 5 mm N-BK7 slab', () => {
  const laser = pulsedLaser(800, 10);
  const slab = createElement('freeglass', 150, 0);
  Object.assign(slab.params, {
    material: 'nbk7', transEff: 100, scale: 1,
    vertices: [
      { x: -2.5, y: -20 }, { x: 2.5, y: -20 },
      { x: 2.5, y: 20 }, { x: -2.5, y: 20 },
    ],
  });
  const detector = createElement('detector', 300, 0);
  traceScene([laser, slab, detector]);

  const pulse = detectorReading(detector.id)?.pulse;
  assert.ok(pulse.gddFs2 > 220 && pulse.gddFs2 < 225);
  assert.ok(pulse.stretchedPulseWidthFs >= 60 && pulse.stretchedPulseWidthFs <= 65,
    `${pulse.stretchedPulseWidthFs} fs`);
  assert.ok(Math.abs(gaussianPulseDurationAfterGDD(10, pulse.gddFs2) - pulse.stretchedPulseWidthFs) < 1e-9);
});

test('silent thin-lens thickness follows sag, matches the reference family, and changes with diameter', () => {
  const references = [
    [30, 8.6], [50, 6.4], [75, 4.7], [100, 4.1],
    [150, 3.4], [200, 3.1], [300, 2.8], [500, 2.7],
  ];
  for (const [f, catalogueThickness] of references) {
    const estimated = estimatedThinLensThicknessMm({ f, dia: 25.4 });
    assert.ok(Math.abs(estimated / catalogueThickness - 1) <= 0.1,
      `f=${f}: ${estimated} mm against ${catalogueThickness} mm`);
  }
  const small = estimatedThinLensThicknessMm({ f: 100, dia: 12.7 });
  const medium = estimatedThinLensThicknessMm({ f: 100, dia: 25.4 });
  const large = estimatedThinLensThicknessMm({ f: 100, dia: 50.8 });
  assert.ok(small < medium && medium < large, `${small} < ${medium} < ${large}`);

  const lens = createElement('lens');
  const concave = createElement('lensc');
  const objective = createElement('objective');
  for (const element of [lens, concave, objective]) {
    assert.equal(registry[element.type].params.some(param => param.key === 'material'), false,
      `${element.type} must not gain a material input`);
    assert.equal(registry[element.type].params.some(param => param.key === 'thickness'), false,
      `${element.type} must not gain a thickness input`);
  }
});

test('legacy prism and rod scenes retain their previous material behavior', () => {
  const rawPrism = createElement('prism');
  delete rawPrism.params.material;
  const rawRod = createElement('glassrod');
  rawRod.params.ior = 1.63;
  delete rawRod.params.material;
  const [prism, rod] = parseSketch(sketchFile([rawPrism, rawRod]), registry).elements;

  assert.equal(prism.params.material, 'nbk7');
  assert.equal(rod.params.material, 'constant');
  assert.equal(rod.params.ior, 1.63);
  const iorControl = registry.glassrod.params.find(param => param.key === 'ior');
  assert.equal(iorControl.show(rod.params), true);
  assert.equal(iorControl.show({ ...rod.params, material: 'silica' }), false);
});

test('objective GDD uses the documented 30 mm N-BK7 equivalent', () => {
  const laser = pulsedLaser();
  const objective = createElement('objective', 150, 0);
  const detector = createElement('detector', 300, 0);
  traceScene([laser, objective, detector]);

  const pulse = detectorReading(detector.id)?.pulse;
  assert.ok(pulse.gddFs2 > 1300 && pulse.gddFs2 < 1380);
});

test('a pulse compressor applies signed GDD and visibly restores a broadened pulse', () => {
  const laser = pulsedLaser(800, 10);
  const stretcher = createElement('pulsecompressor', 140, 0);
  Object.assign(stretcher.params, { gddFs2: 1000, transEff: 80 });
  const compressor = createElement('pulsecompressor', 220, 0);
  compressor.params.gddFs2 = -1000;
  const detector = createElement('detector', 320, 0);

  const scene = traceScene([laser, stretcher, compressor, detector]);
  const pulse = detectorReading(detector.id)?.pulse;
  assert.ok(pulse);
  assert.ok(Math.abs(pulse.gddFs2) < 1e-9);
  assert.ok(Math.abs(pulse.stretchedPulseWidthFs - 10) < 1e-9);
  assert.ok(Math.abs(detectorReading(detector.id).signal - 0.8) < 1e-9);

  const track = scene.pulseTracks.find(candidate => candidate.pts.length >= 4);
  assert.ok(track?.gddTrace, 'the visual pulse track carries local GDD');
  const middleOpl = (track.opls[1] + track.opls[2]) / 2;
  const finalOpl = (track.opls[2] + track.opls[3]) / 2;
  assert.ok(pulseEnvelopeAtOpticalPath(track, middleOpl).pulseWidthFs > 250);
  assert.ok(Math.abs(pulseEnvelopeAtOpticalPath(track, finalOpl).pulseWidthFs - 10) < 1e-9);
});

test('pulse-compressor GDD is clamped at the saved-scene boundary', () => {
  const raw = createElement('pulsecompressor', 140, 0);
  raw.params.gddFs2 = 9e9;
  const [compressor] = parseSketch(sketchFile([raw]), registry).elements;
  assert.equal(compressor.params.gddFs2, 1000000);

  const laser = pulsedLaser(800, 10);
  const detector = createElement('detector', 300, 0);
  traceScene([laser, compressor, detector]);
  assert.equal(detectorReading(detector.id).pulse.gddFs2, 1000000);
});
