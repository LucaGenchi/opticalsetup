import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createElement, estimatedThinLensThicknessMm, registry,
} from '../sketch/js/elements.js';
import {
  gaussianPulseDurationAfterGDD, glassAbbe, glassGVD, glassIndex,
  glassWavelengthRange, isWavelengthInGlassRange, autocorrelationReading,
} from '../sketch/js/glass.js';
import { detectorReading, traceAll, traceScene } from '../sketch/js/raytrace.js';
import '../sketch/js/detector-instruments.js';
import { registry as reg } from '../sketch/js/elements.js';
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

// ---------------- Sellmeier resonance poles ----------------

test('every catalogue glass stays finite and physical across the whole traced band', () => {
  // Each Sellmeier fit has resonance poles, and two of them sit inside the
  // app's own wavelength span: N-SF5 at 242.7 nm and N-SF11 at 249.6 nm.
  // Evaluating across one gave an index of 21 and a GVD of 1.4e9 fs²/mm —
  // a 100 fs pulse through a glass rod reported as 2.3 milliseconds.
  for (const id of ['nbk7', 'silica', 'nsf5', 'nsf11']) {
    const indices = [], gvds = [];
    for (let wl = 150; wl <= 2500; wl += 1) {
      const n = glassIndex(id, wl), g = glassGVD(id, wl);
      assert.ok(Number.isFinite(n), `${id} index non-finite at ${wl} nm`);
      assert.ok(Number.isFinite(g), `${id} GVD non-finite at ${wl} nm`);
      assert.ok(n > 1 && n < 2.5, `${id} index ${n} at ${wl} nm is not physical`);
      indices.push(n); gvds.push(g);
    }
    // no discontinuity: a pole shows up as an enormous step between neighbours
    const stepN = Math.max(...indices.slice(1).map((v, i) => Math.abs(v - indices[i])));
    const stepG = Math.max(...gvds.slice(1).map((v, i) => Math.abs(v - gvds[i])));
    assert.ok(stepN < 0.01, `${id} index jumps by ${stepN} between adjacent nm`);
    assert.ok(stepG < 1000, `${id} GVD jumps by ${stepG} between adjacent nm`);
  }
});

test('a glass quotes its published range rather than extrapolating across a pole', () => {
  assert.deepEqual(glassWavelengthRange('nsf11'), [370, 2500]);
  assert.deepEqual(glassWavelengthRange('silica'), [210, 3710]);
  assert.equal(glassWavelengthRange('nope'), null);

  assert.equal(isWavelengthInGlassRange('nsf11', 800), true);
  assert.equal(isWavelengthInGlassRange('nsf11', 248), false, '248 nm KrF is below N-SF11 fit');
  assert.equal(isWavelengthInGlassRange('silica', 248), true, 'silica really is specified there');

  // below the range, the value held is the range edge — bounded, not absurd
  assert.equal(glassGVD('nsf11', 248), glassGVD('nsf11', 370));
  assert.equal(glassIndex('nsf11', 100), glassIndex('nsf11', 370));
  assert.equal(glassGVD('silica', 5000), glassGVD('silica', 3710));
});

test('a UV pulse through a flint reports a bounded duration, not a millisecond', () => {
  const laser = createElement('pulsedlaser', 60, 0);
  laser.params.wavelength = 250;          // just above N-SF11's 249.6 nm pole
  laser.params.beamMode = 'line';
  laser.params.pulseWidthFs = 100;
  laser.params.transformLimited = true;
  laser.params.bandwidth = 0;
  const rod = createElement('glassrod', 300, 0);
  rod.params.material = 'nsf11';
  rod.params.rodlen = 60;
  rod.params.dia = 20;
  const detector = createElement('detector', 520, 0);
  detector.params.aperture = 40;
  traceAll([laser, rod, detector], []);

  const pulse = detectorReading(detector.id)?.pulse;
  assert.ok(pulse, 'the detector still sees the pulse');
  assert.ok(pulse.gddFs2 < 1e6, `GDD ${pulse.gddFs2} fs² is not a physical glass rod`);
  assert.ok(pulse.stretchedPulseWidthFs < 1e5,
    `${pulse.stretchedPulseWidthFs} fs out of a 60 mm rod is absurd`);
});

// ---------------- autocorrelator ----------------

test('the autocorrelation trace is wider than the pulse by the shape factor', () => {
  const gauss = autocorrelationReading(150, 'gauss', 'gauss');
  assert.ok(Math.abs(gauss.traceFwhmFs - 150 * Math.SQRT2) < 1e-9, 'Gaussian trace is √2 wider');
  assert.ok(Math.abs(gauss.inferredPulseWidthFs - 150) < 1e-9, 'and divides back out exactly');
  assert.equal(gauss.shapeMismatch, false);

  const sech = autocorrelationReading(150, 'sech2', 'sech2');
  assert.ok(Math.abs(sech.traceFwhmFs - 150 * 1.543) < 1e-9);
  assert.ok(Math.abs(sech.inferredPulseWidthFs - 150) < 1e-9);

  assert.equal(autocorrelationReading(0), null, 'no pulse, no trace');
  assert.equal(autocorrelationReading(-5), null);
});

test('assuming the wrong pulse shape misreports the duration, by the factor ratio', () => {
  // The classic lab mistake the instrument invites: a sech² pulse read on a
  // Gaussian setting comes out long by 1.543/1.414 = 9%.
  const wrong = autocorrelationReading(150, 'gauss', 'sech2');
  assert.equal(wrong.shapeMismatch, true);
  assert.equal(wrong.truePulseWidthFs, 150);
  const ratio = wrong.inferredPulseWidthFs / wrong.truePulseWidthFs;
  assert.ok(Math.abs(ratio - 1.543 / Math.SQRT2) < 1e-9, `read ${ratio}x the real duration`);
  assert.ok(ratio > 1.08 && ratio < 1.10, `about 9% long, got ${((ratio - 1) * 100).toFixed(1)}%`);
});

test('an autocorrelator measures the STRETCHED duration a scene actually delivers', () => {
  // The point of the instrument here: it should read what arrives after the
  // glass, not what the source was configured with.
  const laser = createElement('pulsedlaser', 60, 0);
  Object.assign(laser.params, {
    wavelength: 532, beamMode: 'line', pulseWidthFs: 150,
    transformLimited: true, pulseShape: 'gauss', bandwidth: 0,
  });
  const rod = createElement('glassrod', 300, 0);
  Object.assign(rod.params, { material: 'nsf11', rodlen: 100, dia: 20 });
  const meter = createElement('autocorrelator', 520, 0);
  meter.params.aperture = 40;
  traceAll([laser, rod, meter], []);

  const reading = detectorReading(meter.id);
  assert.equal(registry.autocorrelator.readoutKind, 'autocorrelator');
  assert.ok(reading?.pulse, 'the autocorrelator sees the train');
  const arriving = reading.pulse.stretchedPulseWidthFs;
  assert.ok(arriving > 700 && arriving < 760, `100 mm of N-SF11 at 532 nm stretches to ~731 fs, got ${arriving}`);

  const trace = autocorrelationReading(arriving, 'gauss', reading.pulse.pulseShape);
  assert.ok(Math.abs(trace.inferredPulseWidthFs - arriving) < 1e-6,
    'a matched assumption recovers the delivered duration, not the source setting');
  assert.ok(trace.inferredPulseWidthFs > 4 * laser.params.pulseWidthFs,
    'and that is far longer than what the laser was set to');
});

test('an autocorrelator on a detector screen draws its trace and the duration', () => {
  const laser = createElement('pulsedlaser', 60, 0);
  Object.assign(laser.params, {
    wavelength: 532, beamMode: 'line', pulseWidthFs: 150,
    transformLimited: true, pulseShape: 'gauss', bandwidth: 0,
  });
  const rod = createElement('glassrod', 300, 0);
  Object.assign(rod.params, { material: 'nsf11', rodlen: 100, dia: 20 });
  const meter = createElement('autocorrelator', 430, 0);
  meter.params.aperture = 34;
  const screen = createElement('display', 560, 0);
  screen.params.sensorId = meter.id;
  screen.params.screenOn = true;

  const scene = [laser, rod, meter, screen];
  traceAll(scene, []);
  const svg = reg.display.svg(screen, scene);

  assert.match(svg, /data-detector-readout="autocorrelator"/, 'the screen knows what it is showing');
  assert.match(svg, /data-autocorrelation="\d+"/, 'it plots a sampled trace, not a single number');
  assert.match(svg, /AUTOCORRELATION/, 'and labels the mode');
  assert.match(svg, /0 DELAY/, 'the axis is delay, not laboratory time');

  // the duration on the screen is the STRETCHED one the rod delivers
  const arriving = detectorReading(meter.id).pulse.stretchedPulseWidthFs;
  assert.ok(arriving > 700 && arriving < 760, `expected ~731 fs, got ${arriving}`);
  assert.match(svg, new RegExp(`${Math.round(arriving).toLocaleString()} fs`),
    'the screen reports what arrives, not the source setting');

  // a CW source has nothing to autocorrelate, and must say so rather than plot
  const cw = createElement('cwlaser', 60, 0);
  cw.params.beamMode = 'line';
  const cwScene = [cw, meter, screen];
  traceAll(cwScene, []);
  const cwSvg = reg.display.svg(screen, cwScene);
  assert.doesNotMatch(cwSvg, /data-autocorrelation=/, 'no trace without a pulse');
  assert.match(cwSvg, /NO PULSE/);
});

test('a supercontinuum stays one beam where its colours have not separated', () => {
  // Eight spectral samples drawn at the single-ray opacity floor stacked to
  // full coverage of a red-plus-violet blend, so white light turned purple
  // the moment it crossed any dispersive glass.
  const laser = createElement('sclaser', 60, 0);
  Object.assign(laser.params, { scMin: 430, scMax: 870, beamMode: 'beam', beamWidth: 10 });
  const lens = createElement('thicklens', 300, 0);
  Object.assign(lens.params, { r1: 60, r2: -60, thickness: 6, dia: 25.4, glass: 'nbk7' });

  const polys = traceScene([laser, lens], []).drawables.filter(d => d.type === 'poly');
  const sliceAt = x => polys.filter(d =>
    Math.min(...d.pts.map(p => p.x)) <= x && Math.max(...d.pts.map(p => p.x)) >= x);

  const upstream = sliceAt(200), downstream = sliceAt(380);
  assert.equal(new Set(upstream.map(d => d.color)).size, 1, 'undispersed light is one composite colour');
  assert.ok(new Set(downstream.map(d => d.color)).size > 4, 'dispersed light really is sampled per wavelength');

  // each spectral sibling must be drawn at a share of the single-ray floor
  const upOpacity = upstream[0].opacity, downOpacity = downstream[0].opacity;
  assert.ok(downOpacity < upOpacity / 2,
    `spectral samples must be fainter than a single beam: ${downOpacity} vs ${upOpacity}`);
  assert.ok(downOpacity > upOpacity / 12, 'but not so faint that a prism washes out');
});
