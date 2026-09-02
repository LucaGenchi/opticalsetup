import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createElement, estimatedThinLensThicknessMm, registry,
} from '../sketch/js/elements.js';
import {
  gaussianPulseDurationAfterGDD, glassAbbe, glassGVD, glassIndex,
  glassWavelengthRange, isWavelengthInGlassRange, autocorrelationReading,
  crossCorrelationReading, crossCorrelationPair, correlationShapeValue,
  bestScopeSpanPs, crossScopeHalfSpanFs, CROSS_SCOPE_SPANS_PS, DEFAULT_SCOPE_SPAN_PS,
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
  // 100 mm of N-SF11 stretches this to ~731 fs, a 1034 fs autocorrelation --
  // wider than the ±0.5 ps default window, so the scene picks its own span,
  // exactly as the bundled chirping example does.
  meter.params.timeSpanPs = 1;
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

test('an autocorrelation too wide for the window says so instead of clipping', () => {
  const laser = createElement('pulsedlaser', 60, 0);
  Object.assign(laser.params, {
    beamMode: 'line', pulseWidthFs: 2000, wavelength: 800,
    transformLimited: true, pulseShape: 'gauss', bandwidth: 0,
  });
  const meter = createElement('autocorrelator', 430, 0);
  Object.assign(meter.params, { aperture: 34, timeSpanPs: 0.5 });
  const screen = createElement('display', 560, 0);
  Object.assign(screen.params, { sensorId: meter.id, screenOn: true });
  const scene = [laser, meter, screen];
  traceAll(scene, []);

  // a 2000 fs pulse gives a 2828 fs trace: its half-maximum chord alone is
  // wider than a ±0.5 ps window, so drawing it would be a lie
  const svg = reg.display.svg(screen, scene);
  assert.doesNotMatch(svg, /data-autocorrelation=/);
  assert.match(svg, /WIDER THAN SPAN/);
  assert.match(svg, /WIDEN THE TIME SPAN/);

  // and at a window that holds it, the trace comes back
  meter.params.timeSpanPs = 5;
  traceAll(scene, []);
  assert.match(reg.display.svg(screen, scene), /data-autocorrelation=/);
});

test('the autocorrelation axis is the chosen window, not one sized from the pulse', () => {
  const bench = (pulseFs, timeSpanPs) => {
    const laser = createElement('pulsedlaser', 60, 0);
    Object.assign(laser.params, {
      beamMode: 'line', pulseWidthFs: pulseFs, wavelength: 800,
      transformLimited: true, pulseShape: 'gauss', bandwidth: 0,
    });
    const meter = createElement('autocorrelator', 430, 0);
    Object.assign(meter.params, { aperture: 34, timeSpanPs });
    const screen = createElement('display', 560, 0);
    Object.assign(screen.params, { sensorId: meter.id, screenOn: true });
    const scene = [laser, meter, screen];
    traceAll(scene, []);
    return reg.display.svg(screen, scene);
  };
  // the whole point: two very different durations on one window must LOOK
  // different, not be normalized to the same apparent width
  const short = bench(150, 1), long = bench(700, 1);
  for (const svg of [short, long]) assert.match(svg, /−1 ps/);
  const widthOf = svg => {
    const pts = /data-autocorrelation="\d+" points="([^"]+)"/.exec(svg)[1].split(' ')
      .map(p => p.split(',').map(Number));
    const peak = Math.min(...pts.map(p => p[1]));
    const half = pts.filter(p => p[1] <= (peak + 8) / 2);
    return half.at(-1)[0] - half[0][0];
  };
  assert.ok(widthOf(long) > widthOf(short) * 3,
    'a 700 fs pulse must draw visibly wider than a 150 fs one on the same axis');
});

// ---------------- cross-correlator ----------------

const arm = (over = {}) => ({
  pulseWidthFs: 150, pulseShape: 'gauss', repRateMHz: 80, centerWavelengthNm: 800,
  arrivalFs: 0, ...over,
});

test('a cross-correlation of two identical pulses reproduces their autocorrelation exactly', () => {
  // The width model must not default to plain quadrature: that is right for
  // Gaussians and 9% wrong for sech², which is the very error this instrument
  // exists to demonstrate.
  for (const shape of ['gauss', 'sech2']) {
    const cc = crossCorrelationReading(arm({ pulseShape: shape }), arm({ pulseShape: shape }));
    const ac = autocorrelationReading(150, shape, shape);
    assert.ok(Math.abs(cc.traceFwhmFs - ac.traceFwhmFs) < 1e-9,
      `${shape}: cross ${cc.traceFwhmFs} vs auto ${ac.traceFwhmFs}`);
    assert.equal(cc.shapeMismatch, false);
  }
});

test('unequal durations add in quadrature, and a short reference samples the long pulse', () => {
  const cc = crossCorrelationReading(arm(), arm({ pulseWidthFs: 2000 }));
  assert.ok(Math.abs(cc.traceFwhmFs - Math.hypot(150, 2000)) < 1e-9);
  // the gating limit: a much shorter reference returns the long pulse itself
  const gated = crossCorrelationReading(arm({ pulseWidthFs: 5 }), arm({ pulseWidthFs: 2000 }));
  assert.ok(Math.abs(gated.traceFwhmFs - 2000) / 2000 < 0.001,
    `expected ~2000 fs, got ${gated.traceFwhmFs}`);
});

test('the short-reference limit holds for sech² too, not just for Gaussians', () => {
  // A flat k/sqrt(2) correction satisfies the equal-duration case and then
  // overshoots this one by 9%, which is exactly the size of error this whole
  // component exists to make visible. Both limits have to hold at once.
  const gated = crossCorrelationReading(
    arm({ pulseWidthFs: 5, pulseShape: 'sech2' }),
    arm({ pulseWidthFs: 2000, pulseShape: 'sech2' }));
  assert.ok(Math.abs(gated.traceFwhmFs - 2000) / 2000 < 0.005,
    `a 5 fs sech² reference must sample the 2000 fs pulse, got ${gated.traceFwhmFs}`);

  // and the equal-duration case must still reproduce the autocorrelation
  const equal = crossCorrelationReading(
    arm({ pulseShape: 'sech2' }), arm({ pulseShape: 'sech2' }));
  assert.ok(Math.abs(equal.traceFwhmFs - autocorrelationReading(150, 'sech2', 'sech2').traceFwhmFs) < 1e-9);

  // in between, the model tracks a numerically integrated sech² correlation
  const SECH2_HALF = 2 * Math.acosh(Math.SQRT2);
  const sech2 = (t, fw) => (1 / Math.cosh(SECH2_HALF * t / fw)) ** 2;
  const numericFwhm = (t1, t2) => {
    const W = Math.max(t1, t2) * 12, N = 20001, dt = (2 * W) / (N - 1);
    const val = tau => {
      let sum = 0;
      for (let i = 0; i < N; i++) { const t = -W + i * dt; sum += sech2(t, t1) * sech2(t + tau, t2); }
      return sum * dt;
    };
    const peak = val(0);
    let lo = 0, hi = Math.max(t1, t2) * 4;
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (val(m) > peak / 2) lo = m; else hi = m; }
    return lo + hi;
  };
  for (const [t1, t2] of [[150, 300], [150, 600], [150, 2000]]) {
    const model = crossCorrelationReading(
      arm({ pulseWidthFs: t1, pulseShape: 'sech2' }),
      arm({ pulseWidthFs: t2, pulseShape: 'sech2' })).traceFwhmFs;
    const truth = numericFwhm(t1, t2);
    assert.ok(Math.abs(model / truth - 1) < 0.025,
      `${t1}x${t2}: model ${model.toFixed(1)} vs numeric ${truth.toFixed(1)}`);
  }
});

test('the trace peaks at the real timing mismatch, and overlap falls away from it', () => {
  const aligned = crossCorrelationReading(arm(), arm());
  assert.equal(aligned.offsetFs, 0);
  assert.ok(Math.abs(aligned.overlap - 1) < 1e-12, 'perfectly overlapped reads full');

  const late = crossCorrelationReading(arm(), arm({ arrivalFs: 400 }));
  assert.equal(late.offsetFs, 400);
  assert.ok(late.overlap < 0.02, `400 fs apart should barely overlap, got ${late.overlap}`);

  // half the trace width off must sit exactly at half maximum, by definition
  const half = crossCorrelationReading(arm(), arm({ arrivalFs: aligned.traceFwhmFs / 2 }));
  assert.ok(Math.abs(half.overlap - 0.5) < 1e-9, `expected 0.5, got ${half.overlap}`);
});

test('mismatch is measured against the nearest pulse, so nulling is modulo the period', () => {
  // 80 MHz is a 12 500 000 fs period; an arm 12 500 100 fs long is 100 fs from
  // the NEXT pulse, not 12.5 ns from the previous one.
  const cc = crossCorrelationReading(arm(), arm({ arrivalFs: 12500100 }));
  assert.ok(Math.abs(cc.offsetFs - 100) < 1e-6, `expected +100 fs, got ${cc.offsetFs}`);
  assert.equal(cc.rawOffsetFs, 12500100);
  assert.ok(cc.overlap > 0.5, 'and it therefore overlaps well');
});

test('trains that are not synchronized report no stable trace', () => {
  const cc = crossCorrelationReading(arm(), arm({ repRateMHz: 79.5 }));
  assert.equal(cc.synchronized, false);
  assert.equal(cc.overlap, 0);
  assert.equal(cc.periodFs, null);
});

test('the sum-frequency wavelength is the one only both beams together can make', () => {
  const cc = crossCorrelationReading(arm(), arm({ centerWavelengthNm: 1030 }));
  // 1/lambda_SF = 1/800 + 1/1030
  assert.ok(Math.abs(cc.sumFrequencyNm - (800 * 1030) / 1830) < 1e-9);
  // and it lies between the two second harmonics, which is why it is separable
  assert.ok(cc.sumFrequencyNm > 400 && cc.sumFrequencyNm < 515);
});

test('mixed shapes are flagged rather than silently averaged', () => {
  const cc = crossCorrelationReading(arm(), arm({ pulseShape: 'sech2' }));
  assert.equal(cc.shapeMismatch, true);
  const g = crossCorrelationReading(arm(), arm());
  const s = crossCorrelationReading(arm({ pulseShape: 'sech2' }), arm({ pulseShape: 'sech2' }));
  assert.ok(cc.traceFwhmFs > g.traceFwhmFs && cc.traceFwhmFs < s.traceFwhmFs,
    'a mixed pair lands between the two pure cases');
});

test('crossCorrelationPair refuses anything that is not exactly two trains', () => {
  assert.equal(crossCorrelationPair({}).reason, 'NO PULSE');
  assert.equal(crossCorrelationPair({ pulse: { trains: [{}] } }).reason, 'ONLY ONE BEAM PRESENT');
  assert.match(crossCorrelationPair({ pulse: { trains: [{}, {}, {}] } }).reason, /EXACTLY 2/);
  const pair = crossCorrelationPair({ pulse: { trains: [
    { pulseWidthFs: 150, phaseNs: 0, pathDelayNs: 1, repRateMHz: 80 },
    { pulseWidthFs: 150, phaseNs: 0.001, pathDelayNs: 1, repRateMHz: 80 },
  ] } });
  // emission phase and propagation both decide when a pulse turns up
  assert.ok(Math.abs(pair.arms[0].arrivalFs - 1e6) < 1e-6);
  assert.ok(Math.abs(pair.arms[1].arrivalFs - 1.001e6) < 1e-6);
});

test('the sum-frequency colour is built from what arrives, not from the emitters', () => {
  // An SHG crystal rewrites the ray wavelength but leaves the source's own
  // centre metadata alone, so a readout built on that metadata would name the
  // colour that entered the bench rather than the one hitting the face.
  const laser = createElement('pulsedlaser', 60, 0);
  Object.assign(laser.params, {
    wavelength: 800, beamMode: 'line', pulseWidthFs: 150, repRateMHz: 80,
    transformLimited: true, pulseShape: 'gauss', bandwidth: 0,
  });
  const crystal = createElement('crystal', 200, 0);
  Object.assign(crystal.params, { convert: 'shg', efficiency: 0.9, transmitPump: false });
  const meter = createElement('autocorrelator', 430, 0);
  Object.assign(meter.params, { aperture: 34, measurementMode: 'cross' });

  const scene = [laser, crystal, meter];
  traceAll(scene, []);
  const reading = detectorReading(meter.id);
  assert.equal(Math.round(reading.wavelength), 400, 'the doubled light is what arrives');
  assert.ok(Math.abs(reading.pulse.trains[0].centerWavelengthNm - 400) < 1,
    `the train must follow it, got ${reading.pulse.trains[0].centerWavelengthNm}`);
});

test('switching to cross-correlation picks a span that frames the arms as they are', () => {
  assert.deepEqual(CROSS_SCOPE_SPANS_PS, [0.5, 1, 5, 10, 25]);
  assert.equal(DEFAULT_SCOPE_SPAN_PS, 0.5);
  assert.equal(crossScopeHalfSpanFs({}), 500, 'and ±0.5 ps is where both modes start');

  // 150 fs pulses give a 212 fs trace; the span has to hold the separation
  const trace = 212, pulse = 150;
  assert.equal(bestScopeSpanPs(trace, 0, pulse), 0.5, 'merged pair needs the narrowest window');
  assert.equal(bestScopeSpanPs(trace, 3000, pulse), 5, 'a 3 ps delay wants ±5 ps');
  assert.equal(bestScopeSpanPs(trace, 1330, pulse), 1);
  assert.equal(bestScopeSpanPs(trace, 12000, pulse), 10);
  // and it never returns something too narrow to hold what it was given
  for (const sep of [0, 400, 3000, 9000, 40000]) {
    const ps = bestScopeSpanPs(trace, sep, pulse);
    assert.ok(ps * 1000 >= Math.abs(sep) / 2 || ps === 25,
      `±${ps} ps cannot hold peaks ${sep / 2} fs out`);
  }
  // an unreachable mismatch saturates at the widest rather than failing
  assert.equal(bestScopeSpanPs(trace, 1e6, pulse), 25);
});

test('one beam in cross mode names the problem', () => {
  assert.equal(crossCorrelationPair({ pulse: { trains: [{}] } }).reason, 'ONLY ONE BEAM PRESENT');
});

test('a cross-correlator on a screen finds two real sources and reports the mismatch', () => {
  const mk = (y, wl) => {
    const laser = createElement('pulsedlaser', 60, y);
    Object.assign(laser.params, {
      wavelength: wl, beamMode: 'line', pulseWidthFs: 150, repRateMHz: 80,
      transformLimited: true, pulseShape: 'gauss', bandwidth: 0,
    });
    return laser;
  };
  const pump = mk(0, 800);
  const stokes = mk(0, 1030);
  // same face, different emission times: a 300 fs head start on the Stokes arm
  stokes.params.pulsePhaseNs = 0.0003;
  const meter = createElement('autocorrelator', 430, 0);
  Object.assign(meter.params, { aperture: 34, measurementMode: 'cross' });
  const screen = createElement('display', 560, 0);
  Object.assign(screen.params, { sensorId: meter.id, screenOn: true });

  const scene = [pump, stokes, meter, screen];
  traceAll(scene, []);
  const svg = reg.display.svg(screen, scene);

  assert.match(svg, /CROSS-CORRELATION/, 'the screen labels the mode');
  assert.match(svg, /ARRIVAL TIME/, 'and says which axis it is showing');
  assert.match(svg, /data-arrival-envelope="0"/, 'one envelope per arm');
  assert.match(svg, /data-arrival-envelope="1"/);
  assert.match(svg, /OVERLAP/, 'with the figure you maximize while hunting');
  assert.match(svg, /800 NM/, 'each peak names its own colour');
  assert.match(svg, /1,?030 NM/);

  const trains = detectorReading(meter.id).pulse.trains;
  assert.equal(trains.length, 2, 'two sources give two trains even with equal timing settings');
  const cc = crossCorrelationReading(...crossCorrelationPair({ pulse: { trains } }).arms);
  assert.ok(Math.abs(Math.abs(cc.offsetFs) - 300) < 1, `expected ~300 fs, got ${cc.offsetFs}`);
  assert.ok(Math.abs(cc.sumFrequencyNm - (800 * 1030) / 1830) < 1);
});

// A two-arm bench, parameterized by how far apart the arms are, so the scope's
// behaviour can be walked from merged to out of reach.
function crossBench(separationFs, timeSpanPs = 25) {
  const mk = (y, wl, phaseNs) => {
    const laser = createElement('pulsedlaser', 60, y);
    Object.assign(laser.params, {
      wavelength: wl, beamMode: 'line', pulseWidthFs: 150, repRateMHz: 80,
      transformLimited: true, pulseShape: 'gauss', bandwidth: 0,
      pulsePhaseNs: phaseNs,
    });
    return laser;
  };
  const meter = createElement('autocorrelator', 430, 0);
  Object.assign(meter.params, { aperture: 34, measurementMode: 'cross', timeSpanPs });
  const screen = createElement('display', 560, 0);
  Object.assign(screen.params, { sensorId: meter.id, screenOn: true });
  const scene = [mk(0, 800, 0), mk(0, 1030, separationFs / 1e6), meter, screen];
  traceAll(scene, []);
  return { svg: reg.display.svg(screen, scene), meter };
}

test('the two arrivals slide together and the sum-frequency peak lights up between them', () => {
  // far apart: both envelopes drawn, nothing in the middle
  const apart = crossBench(3000, 5).svg;
  assert.match(apart, /data-arrival-envelope="0"/);
  assert.doesNotMatch(apart, /data-cross-correlation=/,
    '3 ps apart, 150 fs pulses make no sum-frequency signal at all');
  assert.match(apart, /OVERLAP 0%/);

  // closing in: the middle peak appears
  const near = crossBench(200, 5).svg;
  assert.match(near, /data-cross-correlation=/, 'overlapping arms produce the SFG peak');

  // merged: time zero
  const merged = crossBench(0, 5).svg;
  assert.match(merged, /TIME ZERO/);
  assert.match(merged, /OVERLAP 100%/);
  assert.match(merged, /data-cross-correlation=/);
});

test('the window is the one the user chose, and never resizes itself', () => {
  // the same bench at every timebase reports that timebase and no other
  for (const ps of [1, 5, 10, 25]) {
    const svg = crossBench(0, ps).svg;
    assert.match(svg, new RegExp(`−${ps} ps`), `±${ps} ps window must be labelled as such`);
    assert.match(svg, new RegExp(`\\+${ps} ps`));
  }
  // and moving the pulses does not change it, which is the whole point:
  // a window that rescaled itself would hide the motion it exists to show
  const still = [0, 500, 3000].map(sep => /−(\d+) ps/.exec(crossBench(sep, 5).svg)?.[1]);
  assert.deepEqual(still, ['5', '5', '5']);
});

test('pulses beyond the chosen window are reported, not drawn', () => {
  // 30 ps apart puts each pulse 15 ps either side of the origin: outside a
  // ±5 ps window, comfortably inside a ±25 ps one
  const { svg } = crossBench(30000, 5);
  assert.doesNotMatch(svg, /data-arrival-envelope=/, 'nothing is drawn that is not on screen');
  assert.match(svg, /RELATIVE DELAY/);
  assert.match(svg, /30 ps/, 'the actual separation, not just "off screen"');
  assert.match(svg, /SPAN ±5 ps/);
  // and the correction quoted in the unit of the control you turn
  assert.match(svg, /SHORTEN THE SECOND ARM BY 8\.99 MM/);

  // widening the timebase brings the same bench back on screen
  const wider = crossBench(30000, 25).svg;
  assert.match(wider, /data-arrival-envelope="0"/, 'a wider window reaches them');
  assert.doesNotMatch(wider, /RELATIVE DELAY/);

  // but the widest window still cannot hold an arbitrarily large mismatch,
  // and says so rather than pretending
  assert.match(crossBench(60000, 25).svg, /RELATIVE DELAY/);
});

test('a narrow pulse stays visible on a wide timebase', () => {
  // a 150 fs pulse is 0.3% of a +/-25 ps window: sampled on a fixed coarse
  // grid it would fall between samples and vanish entirely
  const svg = crossBench(0, 25).svg;
  const pts = /data-arrival-envelope="0" points="([^"]+)"/.exec(svg)?.[1] || '';
  const ys = pts.split(' ').map(p => Number(p.split(',')[1]));
  assert.ok(ys.length > 200, `needs a fine grid at this timebase, got ${ys.length} samples`);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 10,
    'the pulse must actually rise off the baseline, not be sampled away');
});

test('one source in cross mode says so instead of plotting an autocorrelation', () => {
  const laser = createElement('pulsedlaser', 60, 0);
  Object.assign(laser.params, { beamMode: 'line', pulseWidthFs: 150, wavelength: 800 });
  const meter = createElement('autocorrelator', 430, 0);
  Object.assign(meter.params, { aperture: 34, measurementMode: 'cross' });
  const screen = createElement('display', 560, 0);
  Object.assign(screen.params, { sensorId: meter.id, screenOn: true });
  const scene = [laser, meter, screen];
  traceAll(scene, []);
  const svg = reg.display.svg(screen, scene);
  assert.doesNotMatch(svg, /data-cross-correlation=/, 'no trace from one arm');
  assert.match(svg, /ONLY ONE BEAM PRESENT/);
});

test('switching modes does not disturb the autocorrelation readout', () => {
  const laser = createElement('pulsedlaser', 60, 0);
  Object.assign(laser.params, {
    beamMode: 'line', pulseWidthFs: 150, wavelength: 800,
    transformLimited: true, pulseShape: 'gauss', bandwidth: 0,
  });
  const meter = createElement('autocorrelator', 430, 0);
  meter.params.aperture = 34;
  const screen = createElement('display', 560, 0);
  Object.assign(screen.params, { sensorId: meter.id, screenOn: true });
  const scene = [laser, meter, screen];
  traceAll(scene, []);
  const before = reg.display.svg(screen, scene);
  meter.params.measurementMode = 'auto';
  traceAll(scene, []);
  assert.equal(reg.display.svg(screen, scene), before,
    'the default and an explicit "auto" must render identically');
  assert.match(before, /data-autocorrelation="\d+"/);
});

test('correlationShapeValue is normalized and hits half maximum at the half width', () => {
  for (const shape of ['gauss', 'sech2']) {
    assert.equal(correlationShapeValue(0, 200, shape), 1);
    assert.ok(Math.abs(correlationShapeValue(100, 200, shape) - 0.5) < 1e-9, shape);
  }
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
