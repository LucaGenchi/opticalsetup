// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { INPUTS, DEFAULTS, MAX_FILTERS, computeFluorescence, RATE_INPUTS, RATE_DEFAULTS, computeRates } from './fluorescence-calculator.js';
import { DETECTOR_PRESETS, parseCurveCsv, spectrumRangeNm } from '../../sketch/js/fluorescence.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';
import { formatNumber } from '../assets/calculator-kit.js';

// Spectrum files load one fluorophore at a time, on demand. A failed load
// is shown, and retried when the fluorophore is chosen again a few seconds
// later (a server or a connection that was down).
const files = new Map();
const RETRY_MS = 3000;
let main = null, rate = null;
function spectrumFile(id) {
  const known = files.get(id);
  if (!files.has(id) || (known?.error && Date.now() - known.at > RETRY_MS)) {
    files.set(id, undefined);
    fetch(new URL(`../../sketch/data/fluorophores/${encodeURIComponent(id)}.json`, import.meta.url))
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(data => files.set(id, data), error => files.set(id, { error, at: Date.now() }))
      .finally(() => main?.update());
  }
  return files.get(id);
}

// The user's filter and QE files, read in the browser and never sent
// anywhere; keyed by the file input's id.
const curves = {};
const MAX_FILE_BYTES = 2e6;
document.addEventListener('change', async event => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > MAX_FILE_BYTES) throw new Error('The file is larger than 2 MB.');
    const parsed = parseCurveCsv(await file.text());
    curves[input.name] = parsed.ok ? { name: file.name, parsed } : { name: file.name, error: parsed.message };
  } catch (error) {
    curves[input.name] = { name: file.name, error: error.message || 'The file could not be read.' };
  }
  main?.update();
});

const pct = x => (x === null ? null : x * 100);
const nm = x => `${formatNumber(x, 4)} nm`;
let rateContext = null;

// A fluorophore's own numbers and where they come from.
function markerRows(e, source) {
  const f = e.meta, ref = e.data.reference;
  return [
    { group: f.name },
    ['Colour class', f.category], ...(f.oligomer ? [['Oligomeric state', f.oligomer]] : []),
    ['Excitation peak', nm(f.exMaxNm)], ['Emission peak', nm(f.emMaxNm)], ['Stokes shift', nm(f.emMaxNm - f.exMaxNm)],
    ['Extinction coefficient ε (peak)', f.extinctionM, 'M⁻¹ cm⁻¹', 6], ['Quantum yield Φ', f.quantumYield, '', 3],
    ['Brightness ε·Φ', e.brightness, 'M⁻¹ cm⁻¹', 4],
    ['Fluorescence lifetime', f.lifetimeNs === null ? 'not listed' : `${formatNumber(f.lifetimeNs, 3)} ns`],
    ['Excitation curve', f.excitationType === 'absorption' ? 'absorption spectrum' : 'excitation spectrum'],
    ['Data', source.short],
    ...(ref ? [['Protein’s paper', `${ref.citation}, ${ref.journal}, doi:${ref.doi}`]] : []),
    ...e.data.spectraReferences.map(sr => ['Spectra measured in', `${sr.citation}, doi:${sr.doi}`]),
    ['Terms', source.licenseName],
  ];
}

main = mountCalculator({ inputs: INPUTS, defaults: DEFAULTS, hideInactive: true, groups: {
  laser: { title: 'Excitation laser (CW)' },
  fluor: { title: 'Fluorescent marker' },
  second: { title: 'Second marker' },
  ...Object.fromEntries(Array.from({ length: MAX_FILTERS }, (_, k) => [`filter${k + 1}`, { title: `Filter ${k + 1}`, form: 'detect-form' }])),
  detector: { title: 'Detector', form: 'detect-form' },
}, compute: raw => computeFluorescence(raw, {
  data: spectrumFile(raw.fluorophore),
  secondData: raw.second === 'none' ? null : spectrumFile(raw.second),
  curves,
}),
  // Under the graphs and the detection path: the excitation and detection
  // efficiencies side by side, then each marker's own numbers.
  rows: r => {
    const m = r.main, s = r.second;
    return {
      excitation: [
        { group: `Excitation efficiency at ${formatNumber(r.laserNm, 6)} nm` },
        ['Relative to the excitation peak', pct(m.relative), '%', 3],
        ['Extinction coefficient at the laser', m.extinctionAtLaser, 'M⁻¹ cm⁻¹', 4],
        ['Absorption cross-section at the laser', m.crossSectionCm2, 'cm²', 3],
        ['Brightness at the laser, ε(λ)·Φ', m.brightnessAtLaser, 'M⁻¹ cm⁻¹', 3],
        ...(s ? [
          { group: `${s.meta.name} at the laser` },
          ['Relative to its excitation peak', pct(s.relative), '%', 3],
          ['Its brightness at the laser, ε(λ)·Φ', s.brightnessAtLaser, 'M⁻¹ cm⁻¹', 3],
        ] : []),
      ],
      detection: [
        { group: 'Detection efficiency' },
        ['Emission through the filters', pct(m.transmitted), '%', 3],
        ...(r.detector.type === 'ideal' ? [] : [['Mean detector QE over that light', pct(m.meanQe), '%', 3]]),
        ['Emission detected', pct(m.detected), '%', 3],
        ['Laser line through the filters', r.laserTransmission, '', 3],
        ['Laser blocking', r.laserOdCapped ? `≥ ${formatNumber(r.laserOd, 3)} OD` : `${formatNumber(r.laserOd, 3)} OD`],
        ...(s ? [
          { group: `Crosstalk from ${s.meta.name}` },
          ['Its emission detected', pct(s.detected), '%', 3],
          ['Its signal ÷ the main marker’s', r.crosstalk, '', 3],
        ] : []),
      ],
      marker: markerRows(m, r.source),
      marker2: s ? markerRows(s, r.source) : [],
    };
  },
  notes: r => {
    const out = [], m = r.main, [exLo, exHi] = spectrumRangeNm(m.data.excitation);
    if (r.laserNm < exLo || r.laserNm > exHi) out.push(`${r.laserNm} nm is outside ${m.meta.name}’s measured excitation curve (${exLo}–${exHi} nm), so its excitation is taken as zero.`);
    out.push(`Relative excitation is the ${m.meta.excitationType} curve at the laser divided by its value at the ${m.meta.exMaxNm} nm peak, where the extinction coefficient is quoted; ε(λ) and σ(λ) scale with it.`);
    if (m.meta.excitationType === 'absorption') out.push('FPbase has an absorption spectrum for this protein, not an excitation spectrum. For one emitting species they have the same shape.');
    out.push('The detected fractions count emitted photons over the whole emission spectrum, before the collection geometry (see the rate panel below).');
    if (r.filters.length === 0) out.push('No filters: all emission, and all scattered laser light, reach the detector.');
    else if (r.laserTransmission > 1e-3) out.push('The filters pass more than 10⁻³ of the laser line. Scattered laser light is often far stronger than the fluorescence, which is why emission filters block the line at OD 6 or more.');
    if (r.detector.type === 'preset') {
      const p = DETECTOR_PRESETS[r.detector.id];
      out.push(`${p.label}: typical curve of the ${p.product} (${p.anchors}). Another detector of the same kind can differ by several percentage points.`);
    }
    const how = { header: 'as its header states', values: 'from its values', chosen: 'as chosen' };
    for (const f of r.files) out.push(`${f.name}: ${f.points} points, ${f.rangeNm[0]}–${f.rangeNm[1]} nm, read as ${f.unit === 'percent' ? 'percent' : 'fractions'} (${how[f.from]}); zero outside that range.`);
    if (r.second) {
      out.push(r.crosstalk === null
        ? `No crosstalk ratio: FPbase lists no extinction coefficient or quantum yield for one of the two.`
        : `The ratio compares ε(λ)·Φ·(fraction detected) of ${r.second.meta.name} with ${m.meta.name}, at equal concentrations and the same collection; it is the bleed-through of the second label into this channel.`);
    }
    return out;
  },
  graphs: r => {
    const p = r.plot, [a, b] = p.curves;
    const series = [
      { name: `Excitation, ${r.main.meta.name}`, color: '--series-1', values: a.ex, fill: 'light' },
      { name: `Emission, ${r.main.meta.name}`, color: '--series-2', values: a.em, fill: 'light' },
      { name: 'Emission detected', color: '--series-2', values: p.detected, fill: 'strong' },
      ...(r.filters.length ? [{ name: 'Filter stack transmission', color: '--series-3', values: p.T }] : []),
      ...(r.detector.type === 'ideal' ? [] : [{ name: 'Detector QE', color: '--muted', values: p.qe, dash: true }]),
      ...(b ? [
        { name: `Excitation, ${r.second.meta.name}`, color: '--series-1', values: b.ex, dash: true },
        { name: `Emission, ${r.second.meta.name}`, color: '--series-2', values: b.em, dash: true },
      ] : []),
    ];
    const top = Math.max(1.05, ...series.flatMap(s => s.values).map(v => v * 1.02));
    const laser = [{ x: r.laserNm, label: `${formatNumber(r.laserNm, 6)} nm laser` }];
    return {
      spectra: { x: p.x, xLabel: 'Wavelength (nm)', xUnit: 'nm', yLabel: 'Fraction of peak, transmission, QE', series,
        yMin: 0, yMax: top, vlines: laser, formatX: n => formatNumber(n, 5), formatY: n => formatNumber(n, 3) },
      od: r.filters.length ? { x: p.x, xLabel: 'Wavelength (nm)', xUnit: 'nm', yLabel: 'Optical density of the stack',
        series: [{ name: 'Filter stack OD', color: '--series-3', values: p.od }],
        yMin: 0, yMax: Math.max(1, Math.ceil(Math.max(...p.od))), vlines: laser, formatX: n => formatNumber(n, 5), formatY: n => formatNumber(n, 3) }
        : { message: 'No filters in the detection path.' },
    };
  },
  onResult: r => {
    rateContext = r.ok ? {
      laserNm: r.laserNm, name: r.main.meta.name, crossSectionCm2: r.main.crossSectionCm2,
      quantumYield: r.main.meta.quantumYield, lifetimeNs: r.main.meta.lifetimeNs, detected: r.main.detected,
    } : null;
    rate?.update();
  },
});

rate = mountCalculator({ panel: 'rate', inputs: RATE_INPUTS, defaults: RATE_DEFAULTS, hideInactive: true, groups: {
  beam: { title: 'Illumination' }, objective: { title: 'Objective and sample' }, molecule: { title: 'Excited state' },
}, compute: raw => computeRates(raw, rateContext),
  rows: r => [
    { group: r.values.geometry === 'focus' ? 'At the centre of the focus' : 'In the field' },
    [r.values.geometry === 'focus' ? 'Peak intensity' : 'Intensity', r.intensityWcm2, 'W/cm²', 3],
    ['Photon flux φ', r.photonFlux, 'photons cm⁻² s⁻¹', 3],
    { group: `One ${r.context.name} molecule` },
    ['Absorption cross-section at the laser', r.context.crossSectionCm2, 'cm²', 3],
    ['Excitation rate k = σφ', r.absorptionRate, 's⁻¹', 3],
    ['Saturation parameter kτ', r.saturationParameter, '', 3],
    ['Fraction in the excited state', pct(r.excitedFraction), '%', 3],
    ['Emission rate', r.emissionRate, 'photons/s', 3],
    ['Saturation intensity (kτ = 1)', r.saturationIntensityWcm2, 'W/cm²', 3],
    ['Power at the sample for kτ = 1', r.saturationPowerW === null ? null : r.saturationPowerW * 1e3, 'mW', 3],
    { group: 'Reaching the detector' },
    ['Collected by the objective', pct(r.collection), '%', 3],
    ['Then detected (filters × QE, above)', pct(r.context.detected), '%', 3],
    ['Detected photons per molecule', r.detectedRate, 'photons/s', 3],
  ],
  notes: r => {
    const out = [];
    out.push(r.lifetimeSource === 'library' ? `Lifetime ${formatNumber(r.lifetimeNs, 3)} ns from the library.`
      : r.lifetimeSource === 'entered' ? `Lifetime ${formatNumber(r.lifetimeNs, 3)} ns as entered.`
        : `No lifetime is listed for ${r.context.name}: the rates are unsaturated, and saturation is not estimated. Choose “Enter it” to add one.`);
    if (r.saturationParameter > 0.1) out.push(`kτ = ${formatNumber(r.saturationParameter, 2)}: the signal no longer grows in proportion to the power, and the effective focus broadens. Real fluorophores also enter triplet and dark states well below this, which lowers the signal further.`);
    out.push(r.values.geometry === 'focus'
      ? 'Focus: the peak of a scalar, paraxial Airy pattern from a uniformly filled pupil. At high NA the vectorial focus is somewhat wider, and the peak lower.'
      : 'Widefield: a uniform (flat-top) field; a Gaussian or uneven field has a higher peak than this average.');
    out.push('Collection counts an isotropic emitter in a uniform medium; dipole orientation, nearby interfaces and the objective’s own transmission are not included.');
    out.push('Two-level steady state: no triplet or dark states, photobleaching, stimulated emission or pulsed excitation.');
    return out;
  },
});
