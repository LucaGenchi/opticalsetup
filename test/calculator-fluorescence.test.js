// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The fluorescence calculator and the model it runs (sketch/js/
// fluorescence.js): excitation at the laser, the detection budget through
// stacked filters and a detector, crosstalk, laser blocking, the rate panel,
// the user's curve files, and what is declined.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULTS, computeFluorescence, RATE_DEFAULTS, computeRates } from '../calculators/fluorescence/fluorescence-calculator.js';
import {
  filterTransmission, stackTransmission, detectionFractions, detectorQe, spectrumValue, parseCurveCsv, curveInUnits,
  excitationSource, sourceAverage, sourcePhotonEnergyJ, sourceTransmission, notchMinimumWidthNm, pulsedMoleculeRates, photonEnergyJ,
  absorptionCrossSectionCm2, focusPeakIntensityWcm2, moleculeRates, collectionFraction, DETECTOR_PRESETS,
} from '../sketch/js/fluorescence.js';

const load = id => JSON.parse(readFileSync(new URL(`../sketch/data/fluorophores/${id}.json`, import.meta.url), 'utf8'));
const egfp = load('egfp'), mcherry = load('mcherry'), tdtomato = load('tdtomato');
const files = { egfp, mcherry, tdtomato };
const run = (values = {}, curves = {}) => {
  const raw = { ...DEFAULTS, ...values };
  return computeFluorescence(raw, { data: files[raw.fluorophore], secondData: raw.second === 'none' ? null : files[raw.second], curves });
};
const close = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} vs ${b}`);
const finite = list => list.every(Number.isFinite);

test('the generic filter: peak, blocking, half-maximum edges, hard steps', () => {
  const lp = { type: 'longpass', edgeNm: 500, edgeWidthNm: 4, peakTransmission: 0.9, blockingOd: 6 };
  close(filterTransmission(lp, 500), (0.9 + 1e-6) / 2);
  close(filterTransmission(lp, 600), 0.9, 1e-9);
  close(filterTransmission(lp, 400), 1e-6, 1e-9);
  // The 10 %–90 % width is the edge width.
  const t10 = 1e-6 + (0.9 - 1e-6) * 0.1, t90 = 1e-6 + (0.9 - 1e-6) * 0.9;
  close(filterTransmission(lp, 498), t10, 1e-9);
  close(filterTransmission(lp, 502), t90, 1e-9);
  const sp = { ...lp, type: 'shortpass' };
  close(filterTransmission(sp, 498), t90, 1e-9);
  const hard = { ...lp, edgeWidthNm: 0 };
  assert.equal(filterTransmission(hard, 499.999), 1e-6);
  assert.equal(filterTransmission(hard, 500.001), 0.9);
  const bp = { type: 'bandpass', centerNm: 525, widthNm: 50, edgeWidthNm: 2, peakTransmission: 0.95, blockingOd: 6 };
  const notch = { ...bp, type: 'notch' };
  for (const nm of [450, 500, 525, 549, 600]) {
    const s = (filterTransmission(bp, nm) - 1e-6) / (0.95 - 1e-6);
    close((filterTransmission(notch, nm) - 1e-6) / (0.95 - 1e-6), 1 - s, 1e-9);
  }
  close(stackTransmission([bp, lp], 525), filterTransmission(bp, 525) * filterTransmission(lp, 525));
  assert.equal(stackTransmission([], 525), 1);
  // Huge exponents do not overflow.
  assert.ok(Number.isFinite(filterTransmission({ ...lp, edgeWidthNm: 1e-9 }, 900)));
});

test('the detection budget: no filters pass everything, a stack is never above any of its filters', () => {
  const none = detectionFractions(egfp.emission, [], { type: 'ideal' });
  close(none.transmitted, 1, 1e-12); close(none.detected, 1, 1e-12); close(none.meanQe, 1, 1e-12);
  const bp = { type: 'bandpass', centerNm: 525, widthNm: 50, edgeWidthNm: 3, peakTransmission: 0.95, blockingOd: 6 };
  const lp = { type: 'longpass', edgeNm: 495, edgeWidthNm: 3, peakTransmission: 0.93, blockingOd: 1.5 };
  const one = detectionFractions(egfp.emission, [bp], { type: 'ideal' });
  const two = detectionFractions(egfp.emission, [bp, lp], { type: 'flat', qe: 0.4 });
  assert.ok(two.transmitted < one.transmitted && one.transmitted < 0.95);
  close(two.detected, two.transmitted * 0.4, 1e-12);
  close(two.meanQe, 0.4, 1e-12);
  // Blocking everything: the stack passes only the OD floor.
  const dark = detectionFractions(egfp.emission, [{ type: 'shortpass', edgeNm: 260, edgeWidthNm: 0, peakTransmission: 1, blockingOd: 10 }], { type: 'ideal' });
  close(dark.transmitted, 1e-10, 1e-9);
});

test('the default page: EGFP, a 488 nm laser, 525/50 after a 495 nm dichroic, then a GaAsP PMT', () => {
  // No detector by default: what the filters pass is what is counted.
  const plain = run();
  assert.equal(plain.ok, true);
  assert.equal(plain.detector.type, 'ideal');
  close(plain.main.detected, plain.main.transmitted, 1e-12);
  const r = run({ detector: 'gaasp' });
  assert.equal(r.ok, true);
  close(r.main.relative, spectrumValue(egfp.excitation, 488));
  assert.ok(r.main.relative > 0.99);
  close(r.main.extinctionAtLaser, 55900 * r.main.relative);
  close(r.main.crossSectionCm2, absorptionCrossSectionCm2(55900 * r.main.relative));
  const budget = detectionFractions(egfp.emission, r.filters, { type: 'preset', id: 'gaasp' });
  close(r.main.transmitted, budget.transmitted); close(r.main.detected, budget.detected);
  assert.ok(r.main.meanQe > 0.3 && r.main.meanQe < 0.42, `GaAsP over green emission: ${r.main.meanQe}`);
  // The laser sits 12 nm below the bandpass edge and 7 nm below the dichroic's.
  assert.ok(r.sourceOd > 7 && r.sourceOd < 8, `laser blocked at OD ${r.sourceOd}`);
  assert.equal(r.second, null);
  assert.equal(r.crosstalk, null);
  // Nothing non-finite reaches the chart.
  const p = r.plot;
  assert.ok(finite(p.x) && finite(p.T) && finite(p.od) && finite(p.qe) && finite(p.detected) && p.curves.every(c => finite(c.ex) && finite(c.em)));
  assert.ok(p.x[0] <= 488 && p.x.at(-1) >= 600);
});

test('a second fluorophore: its excitation, its detection and the crosstalk ratio', () => {
  const r = run({ second: 'mcherry' });
  assert.equal(r.ok, true);
  const s = r.second;
  close(s.relative, spectrumValue(mcherry.excitation, 488));
  assert.ok(s.relative < 0.15, 'mCherry is excited weakly at 488 nm');
  const ratio = (72000 * s.relative * 0.22 * s.detected) / (55900 * r.main.relative * 0.6 * r.main.detected);
  close(r.crosstalk, ratio, 1e-12);
  assert.ok(r.crosstalk < 0.01);
  // The same label as the second fluorophore crosstalks one to one.
  close(run({ second: 'egfp' }).crosstalk, 1, 1e-12);
  // Waiting for a second file.
  assert.equal(computeFluorescence({ ...DEFAULTS, second: 'mcherry' }, { data: egfp, secondData: undefined }).pending, true);
});

test('declined inputs and loading states', () => {
  assert.equal(run({ centerNm: 249 }).ok, false);
  assert.equal(run({ centerNm: '' }).ok, false);
  const od = run({ f1Peak: 50, f1Od: 0.2 });
  assert.equal(od.ok, false);
  assert.equal(od.errors[0].id, 'f1Od');
  assert.equal(run({ f1Type: 'bandpass', f1Center: 250, f1Width: 500 }).ok, false, 'a band reaching 0 nm');
  assert.equal(computeFluorescence(DEFAULTS, { data: undefined }).pending, true);
  assert.equal(computeFluorescence(DEFAULTS, { data: { error: new Error('404') } }).ok, false);
  assert.equal(computeFluorescence(DEFAULTS, { data: mcherry }).ok, false, 'a file for another fluorophore is refused');
  // A laser outside the measured excitation curve excites nothing.
  const far = run({ centerNm: 700 });
  assert.equal(far.ok, true);
  assert.ok(far.main.relative < 0.01);
});

test('filter and detector files: chosen, read, refused', () => {
  const pending = run({ f1Type: 'measured', f1File: 'bp.csv' });
  assert.equal(pending.pending, true, 'chosen but not read yet');
  assert.equal(run({ f1Type: 'measured', f1File: '' }).ok, false, 'no file chosen');
  const parsed = parseCurveCsv('Wavelength (nm),T (%)\n500,0\n510,90\n540,90\n550,0\n');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.header, 'percent');
  const r = run({ f1Type: 'measured', f1File: 'bp.csv', f2Type: 'none' }, { f1File: { name: 'bp.csv', parsed } });
  assert.deepEqual(r.files.map(f => [f.unit, f.from]), [['percent', 'header']]);
  assert.equal(r.ok, true);
  close(r.sourceTransmission, 0, 0);
  assert.equal(r.sourceOdCapped, true, 'zero transmission is capped for the chart');
  assert.ok(r.plot.od.every(v => v <= r.plot.odCap));
  const bad = run({ f1Type: 'measured', f1File: 'x.csv' }, { f1File: { name: 'x.csv', error: 'Wavelengths must be in nm, between 150 and 3000.' } });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0].message, /Filter 1: Wavelengths/);
  const qe = parseCurveCsv('400\t0.2\n600\t0.4\n');
  const d = run({ detector: 'measured', detectorFile: 'qe.txt' }, { detectorFile: { name: 'qe.txt', parsed: qe } });
  assert.equal(d.ok, true);
  close(detectorQe(d.detector, 500), 0.3, 1e-12);
  const flat = run({ detector: 'flat', detectorQe: 50 });
  close(flat.main.detected, flat.main.transmitted * 0.5, 1e-12);
  const ideal = run({ detector: 'ideal' });
  close(ideal.main.detected, ideal.main.transmitted, 1e-12);
});

test('parsing curve files', () => {
  assert.equal(parseCurveCsv('').ok, false);
  assert.equal(parseCurveCsv('500,0.5').ok, false, 'one row');
  assert.equal(parseCurveCsv('0.5,0.1\n0.6,0.2').ok, false, 'micrometres are refused, not guessed');
  const p = parseCurveCsv('# comment\n600;0.5\n500;0.2\n500;0.4\n700;1.2\n');
  assert.equal(p.ok, true);
  assert.equal(p.header, null);
  assert.deepEqual(p.x, [500, 600, 700]);
  close(p.values[0], 0.3, 1e-12);
  const asRead = curveInUnits(p);
  assert.deepEqual([asRead.unit, asRead.from], ['fraction', 'values']);
  assert.equal(asRead.curve.y[2], 1, 'noise above 1 is clamped');
  assert.equal(curveInUnits(parseCurveCsv('500 50\n600 101\n')).curve.y[1], 1);
  assert.equal(parseCurveCsv('wavelength, T (fraction)\n500 0.5\n600 0.6').header, 'fraction');
});

test('a file in percent with small values is not read as fractions (review of #263)', () => {
  // A constant 0.1 % under a "(%)" header: 10⁻³, OD 3, not 10 %.
  const percent = parseCurveCsv('Wavelength (nm),Transmission (%)\n300,0.1\n900,0.1\n');
  const filter = units => run({ f1Type: 'measured', f1File: 'nd.csv', f1FileUnits: units, f2Type: 'none' }, { f1File: { name: 'nd.csv', parsed: percent } });
  close(filter('auto').sourceTransmission, 1e-3, 1e-12);
  close(filter('auto').sourceOd, 3, 1e-12);
  // The user can override the header.
  close(filter('fraction').sourceTransmission, 0.1, 1e-12);
  // Without a header, small values are fractions unless the user says percent.
  const bare = parseCurveCsv('300,0.1\n900,0.1\n');
  const plain = units => run({ f1Type: 'measured', f1File: 'b.csv', f1FileUnits: units, f2Type: 'none' }, { f1File: { name: 'b.csv', parsed: bare } });
  close(plain('auto').sourceTransmission, 0.1, 1e-12);
  close(plain('percent').sourceTransmission, 1e-3, 1e-12);
  assert.deepEqual(plain('percent').files[0].from, 'chosen');
  // Values above 1.5 are not fractions: refused on the units control.
  const big = parseCurveCsv('300,50\n900,50\n');
  const refused = run({ f1Type: 'measured', f1File: 'p.csv', f1FileUnits: 'fraction', f2Type: 'none' }, { f1File: { name: 'p.csv', parsed: big } });
  assert.equal(refused.ok, false);
  assert.equal(refused.errors[0].id, 'f1FileUnits');
  const qe = run({ detector: 'measured', detectorFile: 'q.csv', detectorFileUnits: 'percent' }, { detectorFile: { name: 'q.csv', parsed: bare } });
  close(detectorQe(qe.detector, 500), 1e-3, 1e-12);
});

test('a band must be at least three edge widths wide (review of #263)', () => {
  assert.equal(run({ f1Width: 8, f1EdgeWidth: 3 }).ok, false);
  const narrow = run({ f1Width: 0.5, f1EdgeWidth: 3 });
  assert.deepEqual(narrow.errors.map(e => e.id), ['f1Width', 'f1EdgeWidth']);
  assert.equal(run({ f2Type: 'notch', f2Center: 600, f2Width: 5, f2EdgeWidth: 2 }).ok, false, 'notch too');
  assert.equal(run({ f1Width: 9, f1EdgeWidth: 3 }).ok, true);
  assert.equal(run({ f1Width: 2, f1EdgeWidth: 0 }).ok, true, 'ideal steps allow any width');
  // At the limit the band keeps its peak and FWHM to 0.3 %.
  const bp = { type: 'bandpass', centerNm: 525, widthNm: 9, edgeWidthNm: 3, peakTransmission: 0.9, blockingOd: 6 };
  const t = nm => filterTransmission(bp, nm);
  assert.ok(t(525) >= 0.997 * 0.9, `peak ${t(525)}`);
  const half = 0.9 / 2;
  let lo = 525, hi = 525;
  while (t(lo) > half) lo -= 0.0005;
  while (t(hi) > half) hi += 0.0005;
  assert.ok(Math.abs((hi - lo) - 9) <= 0.003 * 9, `FWHM ${hi - lo}`);
});

test('detector presets stay inside 0–1 and are zero outside their range', () => {
  for (const [id, preset] of Object.entries(DETECTOR_PRESETS)) {
    const nms = preset.points.map(p => p[0]);
    assert.deepEqual(nms, [...nms].sort((a, b) => a - b), `${id}: sorted`);
    assert.ok(preset.points.every(([, q]) => q >= 0 && q <= 1), `${id}: 0–1`);
    assert.equal(detectorQe({ type: 'preset', id }, nms[0] - 1), 0);
    assert.equal(detectorQe({ type: 'preset', id }, nms.at(-1) + 1), 0);
  }
});

test('the rate panel: focus, widefield, saturation and what it declines', () => {
  const main = run();
  const context = { source: main.source, photonJ: main.photonJ, name: 'EGFP', crossSectionCm2: main.main.crossSectionCm2, quantumYield: 0.6, lifetimeNs: 2.6, detected: main.main.detected };
  const r = computeRates(RATE_DEFAULTS, context);
  assert.equal(r.ok, true);
  close(r.intensityWcm2, focusPeakIntensityWcm2(1e-4, 488, 1.2));
  const m = moleculeRates({ intensityWcm2: r.intensityWcm2, wavelengthNm: 488, crossSectionCm2: context.crossSectionCm2, lifetimeNs: 2.6, quantumYield: 0.6 });
  close(r.excitedFraction, m.excitedFraction);
  assert.ok(r.excitedFraction > 0.1 && r.excitedFraction < 0.4, '100 µW in a 1.2 NA focus is well into saturation');
  close(r.collection, collectionFraction(1.2, 1.33));
  close(r.detectedRate, r.emissionRate * r.collection * main.main.detected);
  // kτ = 1 at the saturation power.
  const atSat = computeRates({ ...RATE_DEFAULTS, powerMw: r.saturationPowerW * 1e3 }, context);
  close(atSat.saturationParameter, 1, 1e-9);
  const wide = computeRates({ ...RATE_DEFAULTS, geometry: 'widefield', powerMw: 10, fieldUm: 200 }, context);
  close(wide.intensityWcm2, 4 * 0.01 / (Math.PI * 0.02 ** 2));
  assert.ok(wide.excitedFraction < 1e-3);
  // Without a lifetime: unsaturated rates only.
  const noTau = computeRates(RATE_DEFAULTS, { ...context, lifetimeNs: null });
  assert.equal(noTau.ok, true);
  assert.equal(noTau.saturationParameter, null);
  assert.equal(noTau.saturationPowerW, null);
  close(noTau.emissionRate, 0.6 * noTau.absorptionRate);
  close(computeRates({ ...RATE_DEFAULTS, lifetimeFrom: 'manual', lifetimeNs: 4 }, { ...context, lifetimeNs: null }).lifetimeNs, 4);
  assert.equal(computeRates({ ...RATE_DEFAULTS, na: 1.4, mediumIndex: 1.33 }, context).ok, false, 'NA above the index');
  assert.equal(computeRates(RATE_DEFAULTS, null).ok, false);
  assert.equal(computeRates(RATE_DEFAULTS, { ...context, crossSectionCm2: 0 }).ok, false, 'no absorption at the laser');
  assert.equal(collectionFraction(1.4, 1.33), null);
});

test('sources: a CW line, an LED band and a transform-limited pulse', () => {
  const cw = run();
  assert.equal(cw.source.kind, 'cw');
  close(cw.main.relative, spectrumValue(egfp.excitation, 488));
  close(cw.photonJ, photonEnergyJ(488));
  // An LED averages the excitation curve over its photons; a narrow one tends to the line.
  const led = run({ source: 'led', centerNm: 470, bandwidthNm: 25 });
  assert.equal(led.ok, true);
  assert.equal(led.source.fwhmNm, 25);
  const band = excitationSource({ kind: 'led', centerNm: 470, bandwidthNm: 25 });
  close(led.main.relative, sourceAverage(band, nm => spectrumValue(egfp.excitation, nm)));
  assert.ok(led.main.relative < spectrumValue(egfp.excitation, 470) + 0.05 && led.main.relative > 0.5);
  const thin = sourceAverage(excitationSource({ kind: 'led', centerNm: 470, bandwidthNm: 5 }), nm => spectrumValue(egfp.excitation, nm));
  assert.ok(Math.abs(thin - spectrumValue(egfp.excitation, 470)) < 0.01, `5 nm LED ${thin}`);
  assert.equal(run({ source: 'led', bandwidthNm: 4 }).ok, false, 'below the canvas LED range');
  assert.ok(led.plot.source && led.plot.source.every(Number.isFinite));
  // The LED's tail leaks through the emission filters far more than a line does.
  assert.ok(led.sourceTransmission > cw.sourceTransmission * 10);
  // A 100 fs pulse at 488 nm is 3.50 nm wide (0.441 λ²/cτ).
  const pulse = run({ source: 'pulsed', pulseFs: 100 });
  close(pulse.source.fwhmNm, 0.441 * 488 ** 2 / (299.792458 * 100), 1e-12);
  assert.ok(Math.abs(pulse.main.relative - cw.main.relative) < 0.01);
  // A long pulse is a line for the plot (narrower than the 1 nm grid can show).
  assert.equal(run({ source: 'pulsed', pulseFs: 1000 }).plot.source, null);
  // Photon energy: hc ∫w / ∫wλ, close to hc/λ₀ for a symmetric band.
  close(sourcePhotonEnergyJ(band), photonEnergyJ(470), 1e-3);
});

test('a notch must be wide enough to reach its blocking (review of #263)', () => {
  // 9 nm with 3 nm edges at OD 6 only reaches OD 2.6 at its centre: refused.
  const shallow = run({ f2Type: 'notch', f2Center: 600, f2Width: 9, f2EdgeWidth: 3, f2Od: 6 });
  assert.equal(shallow.ok, false);
  assert.match(shallow.errors[0].message, /at least 21\.6 nm wide/);
  // At the minimum width the centre reaches OD 6 to 0.1.
  const spec = { edgeWidthNm: 3, peakTransmission: 0.95, blockingOd: 6 };
  const w = notchMinimumWidthNm(spec);
  const notch = { type: 'notch', centerNm: 600, widthNm: w, ...spec };
  close(-Math.log10(filterTransmission(notch, 600)), 5.9, 1e-9);
  assert.equal(run({ f2Type: 'notch', f2Center: 600, f2Width: 22, f2EdgeWidth: 3, f2Od: 6 }).ok, true);
  assert.equal(notchMinimumWidthNm({ ...spec, edgeWidthNm: 0 }), 0, 'ideal steps');
});

test('pulsed excitation: the per-pulse model, its linear limit and what it declines', () => {
  const main = run({ source: 'pulsed', pulseFs: 100 });
  const context = { source: main.source, photonJ: main.photonJ, name: 'EGFP', crossSectionCm2: main.main.crossSectionCm2, quantumYield: 0.6, lifetimeNs: 2.6, detected: main.main.detected };
  const r = computeRates({ ...RATE_DEFAULTS, repRateMHz: 80 }, context);
  assert.equal(r.ok, true);
  assert.equal(r.pulsed, true);
  close(r.pulseEnergyJ, 1e-4 / 80e6);
  close(r.probability, -Math.expm1(-r.saturationParameter));
  assert.ok(r.saturationParameter > 1, 'pulsed excitation saturates at 100 µW in a 1.2 NA focus');
  // Far below saturation it emits what CW excitation of the same average power does.
  const weak = computeRates({ ...RATE_DEFAULTS, powerMw: 1e-6 }, context);
  const cwLike = moleculeRates({ intensityWcm2: weak.intensityWcm2, photonJ: main.photonJ, crossSectionCm2: context.crossSectionCm2, lifetimeNs: 2.6, quantumYield: 0.6 });
  close(weak.emissionRate, cwLike.emissionRate, 1e-5);
  // Incomplete relaxation at a high repetition rate lowers the signal per pulse.
  const fast = pulsedMoleculeRates({ averageIntensityWcm2: 1e5, photonJ: main.photonJ, crossSectionCm2: 2e-16, repRateMHz: 1000, pulseFs: 100, lifetimeNs: 4, quantumYield: 1 });
  assert.ok(fast.relaxFactor > 0.7 && fast.excitedAfterPulse > fast.probability);
  // σF = 1 at the saturation power.
  close(computeRates({ ...RATE_DEFAULTS, powerMw: r.saturationPowerW * 1e3 }, context).saturationParameter, 1, 1e-9);
  // Pulses not much shorter than the lifetime are declined; so is an LED in a focus.
  assert.equal(computeRates(RATE_DEFAULTS, { ...context, source: { ...main.source, pulseFs: 3e5 } }).ok, false);
  const led = run({ source: 'led', centerNm: 470 });
  const ledContext = { ...context, source: led.source, photonJ: led.photonJ, crossSectionCm2: led.main.crossSectionCm2 };
  assert.equal(computeRates(RATE_DEFAULTS, ledContext).ok, false);
  assert.equal(computeRates({ ...RATE_DEFAULTS, geometry: 'widefield', powerMw: 10 }, ledContext).ok, true);
  // Pulses must also fit between one another (review of #263: 200 ps at 10 GHz).
  assert.equal(computeRates({ ...RATE_DEFAULTS, repRateMHz: 10000 }, { ...context, source: { ...main.source, pulseFs: 2e5 } }).errors[0].id, 'repRateMHz');
  assert.equal(computeRates({ ...RATE_DEFAULTS, repRateMHz: 400 }, { ...context, source: { ...main.source, pulseFs: 2e5 } }).ok, true);
  // In a focus each wavelength of a band has its own Airy peak (review of #263):
  // a 5 fs pulse at 560 nm excites EGFP 1.278× more at the focus centre.
  const short = run({ source: 'pulsed', centerNm: 560, pulseFs: 5 });
  assert.ok(Math.abs(short.main.focusFactor - 1.278) < 1e-3, `factor ${short.main.focusFactor}`);
  const shortContext = { ...context, source: short.source, photonJ: short.photonJ, crossSectionCm2: short.main.crossSectionCm2, focusFactor: short.main.focusFactor };
  close(computeRates({ ...RATE_DEFAULTS, powerMw: 1e-6 }, shortContext).effectiveCrossSectionCm2, short.main.crossSectionCm2 * short.main.focusFactor);
  close(computeRates({ ...RATE_DEFAULTS, geometry: 'widefield', powerMw: 1e-6 }, shortContext).effectiveCrossSectionCm2, short.main.crossSectionCm2, 0);
  assert.equal(run().main.focusFactor, 1, 'a line');
  // The repetition rate only applies to pulsed sources.
  assert.equal(computeRates({ ...RATE_DEFAULTS, repRateMHz: '' }, { ...context, source: run().source }).ok, true);
  assert.equal(computeRates({ ...RATE_DEFAULTS, repRateMHz: '' }, context).ok, false);
});
