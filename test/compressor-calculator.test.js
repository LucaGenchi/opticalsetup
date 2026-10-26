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
import { canvasScene, omegaOf } from '../calculators/dispersion-compensation/compressor-model.js';
import { traceScene, detectorReading } from '../sketch/js/raytrace.js';
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
    // The stretcher's numbers are paraxial; the canvas traces its lenses.
    const tolerance = layout === 'stretcher' ? 3e-3 : 5e-5;
    // A block of glass in the scene carries the chirp, and the canvas reads
    // its GDD together with the compensator's; a source chirp it keeps apart.
    const want = r.comp.gddFs2 + (r.values.sceneChirp?.block ? r.chirp.gddFs2 : 0);
    assert.ok(Math.abs(pulse.gddFs2 - want) < tolerance * Math.abs(r.comp.gddFs2), `${layout}: page ${want}, canvas ${pulse.gddFs2}`);
    // Either way the canvas times the compensated pulse as the page's
    // GDD-only duration does.
    assert.ok(Math.abs(pulse.stretchedPulseWidthFs / r.outputGddOnlyFs - 1) < Math.max(tolerance, 1e-3),
      `${layout}: page ${r.outputGddOnlyFs} fs, canvas ${pulse.stretchedPulseWidthFs} fs`);
  }
});

test('the page quotes the defaults as its content does', () => {
  const at = layout => computeCompressor(form(layout));
  const pair = at('prism-pair'), four = at('four-prism'), gratings = at('grating-pair'), fibre = at('four-grating');
  assert.ok(Math.abs(pair.slopeFs2PerMm + 2.17) < 0.01 && Math.abs(pair.solved.value - 705.5) < 0.1);
  assert.ok(Math.abs(four.slopeFs2PerMm + 18.1) < 0.05 && Math.abs(four.outputFs - 34.8) < 0.1);
  assert.ok(Math.abs(gratings.slopeFs2PerMm + 2883) < 1 && Math.abs(gratings.solved.value - 346.8) < 0.1);
  assert.ok(Math.abs(fibre.outputFs - 205.3) < 0.2 && Math.abs(fibre.tlFs - 139.3) < 0.1);
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

test('a bench that cannot be drawn in the plane still gives its numbers, and says why', () => {
  // Too little glass for the in-plane return: the figure shows one pass.
  const thin = computeCompressor(form('prism-pair', { insertion2Mm: 5 }));
  assert.ok(thin.ok);
  assert.match(thin.figureIssue, /at least \d+(\.5)? mm of glass/);
  assert.ok(!thin.layout.elements.some(el => el.type === 'retroreflector'));
  assert.equal(thin.layout.passes, 2);
  // Near Littrow the second grating sits in the input beam.
  const littrow = computeCompressor(form('grating-pair', { gratingIncidenceDeg: 29 }));
  assert.ok(littrow.ok && Number.isFinite(littrow.comp.gddFs2));
  assert.match(littrow.figureIssue, /in height/);
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

test('the graphs are finite where they are drawn', () => {
  for (const layout of Object.keys(LAYOUT_PRESETS)) {
    const r = computeCompressor(form(layout));
    const scan = separationScan(r), gdd = gddScan(r);
    assert.ok(scan.gddOnly.every(Number.isFinite), layout);
    assert.ok(scan.fs.filter(x => x !== null).every(Number.isFinite), layout);
    assert.ok(gdd.comp.every(Number.isFinite), layout);
  }
});
