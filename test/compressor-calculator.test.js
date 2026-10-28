// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The dispersion compensation calculator: its benches against the canvas's
// own tracer, its Fourier durations against the analytic ones, the solve,
// and what it does at the edges.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPRESSOR_DEFAULTS, LAYOUT_PRESETS, computeCompressor, pulseFromPhase, separationScan, gddScan,
} from '../calculators/dispersion-compensation/compressor-calculator.js';
import { canvasScene, omegaOf, lensGlassGddFs2 } from '../calculators/dispersion-compensation/compressor-model.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';
import { parseSketch } from '../sketch/js/state.js';
import { registry } from '../sketch/js/elements.js';
import { gaussianPulseDurationAfterGDD, sech2PulseDurationAfterGDD } from '../sketch/js/glass.js';

const form = (layout, extra = {}) => Object.fromEntries(Object.entries({
  ...COMPRESSOR_DEFAULTS, ...LAYOUT_PRESETS[layout].values, layout, ...extra,
}).map(([k, v]) => [k, String(v)]));

test('every example bench computes, draws and reads the same GDD on the canvas', () => {
  for (const layout of Object.keys(LAYOUT_PRESETS)) {
    const r = computeCompressor(form(layout));
    assert.ok(r.ok, `${layout}: ${JSON.stringify(r.errors)}`);
    assert.equal(r.figureIssue, null, `${layout}: ${r.figureIssue}`);
    assert.equal(r.net.gddFs2, r.values.targetGddFs2, `${layout}: the solve meets its target`);
    traceScene(r.layout.elements);
    const pulse = detectorReading(r.layout.elements.at(-1).id)?.pulse;
    // A block of glass in the scene carries the chirp, and the canvas reads
    // its GDD together with the compensator's; a source chirp it keeps apart.
    // The canvas also reads the glass it gives the stretcher's lenses, which
    // the page's ideal lenses do not have.
    const glass = lensGlassGddFs2(r.layout, r.values);
    assert.equal(glass > 0, layout === 'stretcher');
    const want = r.comp.gddFs2 + glass + (r.values.sceneChirp?.block ? r.chirp.gddFs2 : 0);
    assert.ok(Math.abs(pulse.gddFs2 - want) < 5e-5 * Math.abs(r.comp.gddFs2), `${layout}: page ${want}, canvas ${pulse.gddFs2}`);
    // Either way the canvas times the compensated pulse as the analytic
    // GDD-only duration does.
    const net = r.net.gddFs2 + glass;
    const duration = r.values.shape === 'gauss' ? gaussianPulseDurationAfterGDD(r.tlFs, net) : sech2PulseDurationAfterGDD(r.tlFs, net);
    assert.ok(Math.abs(pulse.stretchedPulseWidthFs / duration - 1) < 1e-3, `${layout}: page ${duration} fs, canvas ${pulse.stretchedPulseWidthFs} fs`);
  }
});

test('the page quotes the defaults as its content does', () => {
  const at = layout => computeCompressor(form(layout));
  const pair = at('prism-pair'), four = at('four-prism'), gratings = at('grating-pair'), fibre = at('four-grating');
  assert.ok(Math.abs(pair.slopeFs2PerMm + 2.17) < 0.01 && Math.abs(pair.solved.value - 705.5) < 0.1);
  assert.ok(Math.abs(four.slopeFs2PerMm + 18.1) < 0.05 && Math.abs(four.outputFs - 34.8) < 0.1);
  assert.ok(Math.abs(gratings.slopeFs2PerMm + 2883) < 1 && Math.abs(gratings.solved.value - 346.8) < 0.1);
  assert.ok(Math.abs(fibre.outputFs - 205.0) < 0.1 && Math.abs(fibre.tlFs - 139.3) < 0.1);
  assert.ok(Math.abs(gratings.throughput.transmission - 0.92 ** 4) < 1e-12);
});

test('the Fourier duration equals the analytic one for a pure GDD', () => {
  for (const shape of ['gauss', 'sech2']) {
    const v = { wavelengthNm: 800, bandwidthNm: 30, shape };
    const w0 = omegaOf(800);
    const tl = (shape === 'gauss' ? 0.441 : 0.315) * 800 ** 2 / (299.792458 * 30);
    assert.ok(Math.abs(pulseFromPhase(v, () => 0, tl).durationFs / tl - 1) < 1e-3, `${shape} transform limit`);
    for (const gdd of [500, 3000, -20000]) {
      const want = shape === 'gauss' ? gaussianPulseDurationAfterGDD(tl, gdd) : sech2PulseDurationAfterGDD(tl, gdd);
      const got = pulseFromPhase(v, w => gdd * (w - w0) ** 2 / 2, want).durationFs;
      assert.ok(Math.abs(got / want - 1) < 1e-3, `${shape}, ${gdd} fs²: ${got} vs ${want}`);
    }
  }
});

test('a Brewster pair loses nothing to p light and a quarter of s light per face pair', () => {
  const p = computeCompressor(form('prism-pair'));
  const s = computeCompressor(form('prism-pair', { polarization: 's' }));
  assert.ok(Math.abs(p.throughput.transmission - 1) < 1e-12);
  assert.ok(s.throughput.transmission < 0.5 && s.throughput.transmission > 0.2, `${s.throughput.transmission}`);
});

test('setting the separation by hand gives the solved bench back at the solution', () => {
  const solved = computeCompressor(form('grating-pair'));
  const manual = computeCompressor(form('grating-pair', { solve: 'manual', gratingSeparationMm: solved.solved.value }));
  assert.ok(Math.abs(manual.comp.gddFs2 / solved.comp.gddFs2 - 1) < 1e-12);
  assert.equal(manual.solved, null);
});

test('a target out of reach, or a wavelength outside the glass, is unavailable with the reason', () => {
  const far = computeCompressor(form('prism-pair', { targetGddFs2: -50000 }));
  assert.equal(far.ok, false);
  assert.match(far.errors[0].message, /out of reach/);
  assert.equal(far.errors[0].id, 'targetGddFs2');
  const deep = computeCompressor(form('prism-pair', { wavelengthNm: 2400, prismMaterial: 'nsf10', chirp: 'none', solve: 'manual' }));
  // N-SF10's fit ends at 2500 nm, so 2400 nm computes; fused silica's
  // starts at 210 nm, so 200 nm does not.
  assert.ok(deep.ok);
  const blue = computeCompressor(form('prism-pair', { wavelengthNm: 200, chirp: 'none', solve: 'manual' }));
  assert.equal(blue.ok, false);
});

// Where the canvas's rays end on the output detector, one per colour.
const arrivals = r => {
  const det = r.layout.elements.at(-1);
  return traceScene(r.layout.elements).drawables.filter(s => s.type === 'path').map(s => s.pts.at(-1))
    .filter(p => Math.hypot(p.x - det.x, p.y - det.y) < det.params.aperture);
};

test('a double pass returns the beam as it came in: every colour on the same line', () => {
  for (const [layout, extra] of [['prism-pair', {}], ['prism-pair', { insertion2Mm: 5 }], ['grating-pair', {}], ['stretcher', {}]]) {
    const r = computeCompressor(form(layout, { passes: '2', ...extra }));
    assert.equal(r.figureIssue, null, `${layout}: ${r.figureIssue}`);
    assert.equal(r.geometry.outputChirpMm, 0);
    assert.ok(r.layout.elements.some(el => el.type === 'mirror') && !r.layout.elements.some(el => el.type === 'retroreflector'));
    const at = arrivals(r);
    assert.ok(at.length >= 3, `${layout}: ${at.length} colours arrive`);
    for (const p of at) assert.ok(Math.hypot(p.x - at[0].x, p.y - at[0].y) < 1e-6, `${layout}: colours ${JSON.stringify(at)}`);
  }
});

test('one pass of a pair leaves the colours side by side, as Treacy\'s geometry gives', () => {
  const r = computeCompressor(form('grating-pair', { passes: '1' }));
  const { gr } = r.layout, G = r.layout.pairs[0].separationMm, s = Math.sin(gr.incidenceDeg * Math.PI / 180);
  const tanBeta = nm => Math.tan(Math.asin(nm * gr.lines * 1e-6 - s));
  const want = G * Math.abs(tanBeta(785) - tanBeta(815)) * Math.cos(gr.incidenceDeg * Math.PI / 180);
  assert.ok(Math.abs(r.geometry.outputChirpMm / want - 1) < 1e-9, `${r.geometry.outputChirpMm} vs ${want}`);
  const at = arrivals(r);
  assert.ok(Math.max(...at.map(p => p.y)) - Math.min(...at.map(p => p.y)) > want);
  // The stretcher's single pass is a grating pair too.
  assert.ok(computeCompressor(form('stretcher', { passes: '1' })).geometry.outputChirpMm > 10);
});

test('a bench that cannot be drawn in the plane still gives its numbers, and says why', () => {
  // Near Littrow the second grating sits in the input beam.
  const littrow = computeCompressor(form('grating-pair', { gratingIncidenceDeg: 29 }));
  assert.ok(littrow.ok && Number.isFinite(littrow.comp.gddFs2));
  assert.match(littrow.figureIssue, /in height/);
  // With a narrow band every colour still arrives there, but off the wrong
  // path: the colours leave at different angles.
  const narrow = computeCompressor(form('grating-pair', { gratingIncidenceDeg: 29, bandwidthNm: 1 }));
  assert.equal(narrow.comp.gddFs2, littrow.comp.gddFs2);
  assert.match(narrow.figureIssue, /in height/);
  // Gratings smaller than the colours' spread clip the band.
  const small = computeCompressor(form('grating-pair', { gratingSizeMm: 20 }));
  assert.equal(small.comp.gddFs2, computeCompressor(form('grating-pair')).comp.gddFs2);
  assert.match(small.figureIssue, /clipped/);
  // Only missing colours count against the figure, not how the canvas's own
  // models differ from the page's: a stretcher at s = f with a wide band
  // (the canvas's GDD carries its lens glass), and a broad band through
  // s-polarized Brewster prisms (Fresnel loss varies across the band).
  for (const extra of [{}, { bandwidthNm: 40, lensDiameterMm: 200, gratingSizeMm: 250 }]) {
    const flat = computeCompressor(form('stretcher', { solve: 'manual', gratingLensMm: 500, ...extra }));
    assert.equal(flat.figureIssue, null, JSON.stringify(extra));
  }
  const broad = computeCompressor(form('prism-pair', { prismMaterial: 'nsf10', polarization: 's', wavelengthNm: 600, bandwidthNm: 140,
    chirp: 'none', solve: 'manual', separationMm: 100, insertion1Mm: 30, insertion2Mm: 30, prismSizeMm: 100 }));
  assert.equal(broad.figureIssue, null);
});

test('the grating pair\'s GDD is Treacy\'s explicit formula', () => {
  const r = computeCompressor(form('grating-pair', { solve: 'manual', gratingSeparationMm: 250, passes: '1' }));
  const lam = 800e-6, d = 1 / 1200, c = 2.99792458e-4;
  const beta = Math.asin(800 * 1200e-6 - Math.sin(Math.PI / 4));
  const treacy = -(lam ** 3) * 250 / (2 * Math.PI * c * c * d * d * Math.cos(beta) ** 3);
  assert.ok(Math.abs(r.comp.gddFs2 / treacy - 1) < 1e-10, `${r.comp.gddFs2} vs ${treacy}`);
});

test('the canvas opens the bench with an autocorrelator at the output', () => {
  const r = computeCompressor(form('four-prism'));
  const scene = canvasScene(r.layout);
  assert.equal(scene.elements.at(-1).type, 'autocorrelator');
  assert.equal(scene.elements.at(-1).params.aperture, r.layout.elements.at(-1).params.aperture);
  assert.deepEqual(scene.elements.slice(0, -1), r.layout.elements.slice(0, -1));
});

test('the canvas scene delivers the colours the figure check traced, with its autocorrelator box in place', () => {
  // One pass of a grating pair sends the bluest colour to the second grating
  // past the output: an autocorrelator box reaching toward the optics would
  // take it before it gets there.
  for (const [layout, extra] of [...Object.keys(LAYOUT_PRESETS).map(k => [k, {}]),
    ['grating-pair', { passes: '1' }], ['prism-pair', { passes: '1' }]]) {
    const r = computeCompressor(form(layout, extra));
    assert.equal(r.figureIssue, null, `${layout} ${JSON.stringify(extra)}: ${r.figureIssue}`);
    traceScene(r.layout.elements);
    const page = detectorReading(r.layout.elements.at(-1).id);
    const { elements } = parseSketch(canvasScene(r.layout), registry);
    traceScene(elements);
    const canvas = detectorReading(elements.at(-1).id);
    assert.equal(canvas.samples, page.samples, `${layout} ${JSON.stringify(extra)}`);
    assert.equal(canvas.bandMin, page.bandMin, `${layout} ${JSON.stringify(extra)}`);
    assert.equal(canvas.bandMax, page.bandMax, `${layout} ${JSON.stringify(extra)}`);
    // Loading rounds the scene's numbers, which moves the fitted GDD a little.
    assert.ok(Math.abs(canvas.pulse.gddFs2 / page.pulse.gddFs2 - 1) < 1e-3, `${layout} ${JSON.stringify(extra)}`);
  }
  const r = computeCompressor(form('grating-pair', { passes: '1' }));
  traceScene(r.layout.elements);
  assert.equal(detectorReading(r.layout.elements.at(-1).id).samples, 5);
});

test('the graphs are finite where they are drawn', () => {
  for (const layout of Object.keys(LAYOUT_PRESETS)) {
    const r = computeCompressor(form(layout));
    const scan = separationScan(r), gdd = gddScan(r);
    assert.ok(scan.gddOnly.every(Number.isFinite), layout);
    assert.ok(scan.fs.filter(x => x !== null).every(Number.isFinite), layout);
    assert.ok(gdd.comp.every(Number.isFinite), layout);
  }
});

test('the Fourier pulse: positive TOD trails, and the duration does not depend on the first guess', () => {
  const v = { wavelengthNm: 800, bandwidthNm: 30, shape: 'gauss' }, w0 = omegaOf(800);
  const { times, intensity } = pulseFromPhase(v, w => 1e4 * (w - w0) ** 3 / 6, 60).profile;
  const centroid = times.reduce((sum, t, i) => sum + t * intensity[i], 0) / intensity.reduce((sum, I) => sum + I, 0);
  // E(t) ∝ ∫ √S e^{iφ} e^{−iωt} dω: the group delay φ′ = TOD Δω²/2 is positive.
  assert.ok(Math.abs(centroid - 7.0297) < 1e-3, `${centroid}`);
  const fibre = computeCompressor(form('four-grating'));
  const phase = w => fibre.compPhase(w) + fibre.chirpPhase(w);
  const durations = [150, 1000, 30000].map(guess => pulseFromPhase(fibre.values, phase, guess).durationFs);
  for (const d of durations) assert.ok(Math.abs(d / durations[0] - 1) < 2e-4, `${durations}`);
});

test('a pulse the transform cannot give says why: too long, or outside a glass', () => {
  // A large FOD with no GDD: the window follows the pulse, not the band's wings.
  const fod = computeCompressor(form('grating-pair', { solve: 'manual', lines: 50, gratingIncidenceDeg: 45, gratingSeparationMm: 1,
    chirp: 'gdd', inputGddFs2: 0, inputTodFs3: 0, inputFodFs4: 1e9 }));
  assert.ok(Math.abs(fod.outputFs - 275.72) < 0.05, `${fod.outputFs}`);
  const blue = computeCompressor(form('grating-pair', { wavelengthNm: 250, bandwidthNm: 40, chirp: 'material', chirpMaterial: 'silica', chirpLengthMm: 10 }));
  assert.equal(blue.outputFs, null);
  assert.equal(blue.outputFailure, 'domain');
  const long = computeCompressor(form('grating-pair', { solve: 'manual', gratingSeparationMm: 5000, chirp: 'none', bandwidthNm: 60 }));
  assert.equal(long.outputFailure, 'long');
});

test('the scene carries what the page computes, or says it cannot', () => {
  // The grating efficiency entered reaches the canvas's gratings.
  const half = computeCompressor(form('grating-pair', { efficiencyPct: 50 }));
  assert.deepEqual(half.layout.elements.filter(el => el.type === 'grating').map(el => el.params.efficiency), [50, 50]);
  assert.equal(half.figureIssue, null);
  // A chirp beyond what the canvas source carries is flagged.
  const big = computeCompressor(form('grating-pair', { inputGddFs2: 2e7, inputTodFs3: 0, inputFodFs4: 0, bandwidthNm: 1 }));
  assert.ok(big.ok && big.values.sceneChirp.clipped);
  assert.equal(computeCompressor(form('grating-pair')).values.sceneChirp.clipped, false);
});
