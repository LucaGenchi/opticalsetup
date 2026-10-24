// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The fluorescence calculator: an LED, a CW laser line or a pulsed laser on
// a fluorophore's measured excitation spectrum, its emission through filters
// and onto a
// detector, a second fluorophore's crosstalk, and the excitation rate and
// saturation of one molecule. DOM-free; the page loads the spectrum files
// and the user's curve files and passes them in.
import { FLUOROPHORE_LIBRARY, FLUOROPHORE_SOURCES } from '../../sketch/js/fluorophore-library.js';
import {
  spectrumValue, spectrumRangeNm, absorptionCrossSectionCm2, filterTransmission, stackTransmission, detectorQe,
  detectionFractions, focusPeakIntensityWcm2, widefieldIntensityWcm2, focusPowerW, widefieldPowerW,
  collectionFraction, moleculeRates, pulsedMoleculeRates, curveInUnits, excitationSource, sourceAverage,
  sourcePhotonEnergyJ, sourceTransmission, sourceWeight, notchMinimumWidthNm, focusSpectralFactor, DETECTOR_PRESETS,
} from '../../sketch/js/fluorescence.js';
import { LED_MIN_BANDWIDTH_NM, LED_MAX_BANDWIDTH_NM } from '../../sketch/js/spectrum.js';
import { defaultsFor, parseInputs, unavailable } from '../assets/calculator-inputs.js';

export const LIBRARY = new Map(FLUOROPHORE_LIBRARY.map(f => [f.id, f]));
const SCOPE_NM = [250, 1000];
export const MAX_FILTERS = 2;
export const BAND_EDGES = 3;
const FILTER_KINDS = ['bandpass', 'longpass', 'shortpass', 'notch'];
const OD_CAP = 12;
const fluorophoreOptions = FLUOROPHORE_LIBRARY.map(f => [f.id, f.name, f.category]);

// The excitation source and the fluorophores (main form). The LED's band
// and the pulse duration take the canvas's own ranges.
export const SOURCE_LABELS = { cw: 'CW laser', led: 'LED', pulsed: 'Pulsed laser' };
export const MAIN_INPUTS = [
  { id: 'source', group: 'source', label: 'Source', type: 'select', value: 'cw', options: Object.entries(SOURCE_LABELS) },
  { id: 'centerNm', group: 'source', label: 'Central wavelength', unit: 'nm', value: 488, min: SCOPE_NM[0], max: SCOPE_NM[1], arrowStep: 1 },
  { id: 'bandwidthNm', group: 'source', label: 'Bandwidth (FWHM)', unit: 'nm', value: 25, min: LED_MIN_BANDWIDTH_NM, max: LED_MAX_BANDWIDTH_NM, arrowStep: 1,
    when: 'source', whenValue: 'led' },
  { id: 'pulseFs', group: 'source', label: 'Pulse duration (FWHM)', unit: 'fs', value: 100, min: 5, max: 1e6, arrowStep: 10,
    when: 'source', whenValue: 'pulsed', help: 'Transform-limited Gaussian pulses; the bandwidth follows from the duration.' },
  { id: 'fluorophore', group: 'fluor', label: 'Fluorophore', type: 'select', value: 'egfp', options: fluorophoreOptions },
  { id: 'second', group: 'second', label: 'Fluorophore', type: 'select', value: 'none', options: [['none', 'None'], ...fluorophoreOptions] },
];

// How a loaded file's values are read: as its header says (else percent
// when a value exceeds 1.5), or as chosen.
const UNIT_OPTIONS = [['auto', 'As the file says'], ['fraction', 'Fractions (0–1)'], ['percent', 'Percent (0–100)']];

// The detection path (second form): two filters, then the detector.
const filterInputs = i => {
  const p = `f${i}`, generic = { when: `${p}Type`, whenValue: FILTER_KINDS };
  const defaults = [
    { type: 'bandpass', center: 525, width: 50, edge: 550, edgeWidth: 3, peak: 95, od: 6 },
    { type: 'longpass', center: 550, width: 50, edge: 495, edgeWidth: 3, peak: 93, od: 1.5 },
  ][i - 1];
  return [
    { id: `${p}Type`, group: `filter${i}`, label: 'Type', type: 'select', value: defaults.type,
      options: [['none', 'None'], ['bandpass', 'Bandpass'], ['longpass', 'Longpass'], ['shortpass', 'Shortpass'], ['notch', 'Notch (blocks one band)'], ['measured', 'Measured curve from a file']] },
    { id: `${p}Center`, group: `filter${i}`, label: 'Central wavelength', unit: 'nm', value: defaults.center, min: SCOPE_NM[0], max: 1500, arrowStep: 1,
      when: `${p}Type`, whenValue: ['bandpass', 'notch'] },
    { id: `${p}Width`, group: `filter${i}`, label: 'Width (FWHM)', unit: 'nm', value: defaults.width, min: 0.5, max: 500, arrowStep: 1,
      when: `${p}Type`, whenValue: ['bandpass', 'notch'] },
    { id: `${p}Edge`, group: `filter${i}`, label: 'Edge (50 %)', unit: 'nm', value: defaults.edge, min: SCOPE_NM[0], max: 1500, arrowStep: 1,
      when: `${p}Type`, whenValue: ['longpass', 'shortpass'], help: 'Wavelength where the transmission is half its peak: the cut-on of a longpass, the cut-off of a shortpass.' },
    { id: `${p}EdgeWidth`, group: `filter${i}`, label: 'Edge width (10–90 %)', unit: 'nm', value: defaults.edgeWidth, min: 0, max: 50, arrowStep: 0.5,
      ...generic, help: 'How steep each edge is. Hard-coated interference filters: 1–5 nm. Coloured glass: tens of nm. 0 is an ideal step.' },
    { id: `${p}Peak`, group: `filter${i}`, label: 'Peak transmission', unit: '%', value: defaults.peak, min: 1, max: 100, arrowStep: 1,
      ...generic, help: 'Transmission inside the passband.' },
    { id: `${p}Od`, group: `filter${i}`, label: 'Blocking (optical density)', unit: 'OD', value: defaults.od, min: 0, max: 10, arrowStep: 0.5,
      ...generic, help: 'Transmission outside the passband is 10^−OD: OD 6 passes one part per million.' },
    { id: `${p}File`, group: `filter${i}`, label: 'Transmission file', type: 'file', accept: '.csv,.txt,.tsv,text/csv,text/plain',
      when: `${p}Type`, whenValue: 'measured', help: 'Two columns: wavelength in nm, then transmission (0–1 or %). Read in your browser, never uploaded. Outside the file’s range the transmission is taken as 0.' },
    { id: `${p}FileUnits`, group: `filter${i}`, label: 'Values in', type: 'select', value: 'auto', options: UNIT_OPTIONS,
      when: `${p}Type`, whenValue: 'measured' },
  ];
};
export const DETECT_INPUTS = [
  ...Array.from({ length: MAX_FILTERS }, (_, k) => filterInputs(k + 1)).flat(),
  { id: 'detector', group: 'detector', label: 'Detector', type: 'select', value: 'ideal',
    options: [['ideal', 'None'], ['flat', 'Constant QE'],
      ...Object.entries(DETECTOR_PRESETS).map(([id, p]) => [id, `${p.label}, typical`]), ['measured', 'Measured QE from a file']] },
  { id: 'detectorQe', group: 'detector', label: 'Quantum efficiency', unit: '%', value: 40, min: 0.1, max: 100, arrowStep: 1,
    when: 'detector', whenValue: 'flat' },
  { id: 'detectorFile', group: 'detector', label: 'QE file', type: 'file', accept: '.csv,.txt,.tsv,text/csv,text/plain',
    when: 'detector', whenValue: 'measured', help: 'Two columns: wavelength in nm, then QE (0–1 or %). Read in your browser, never uploaded. Outside the file’s range the QE is taken as 0.' },
  { id: 'detectorFileUnits', group: 'detector', label: 'Values in', type: 'select', value: 'auto', options: UNIT_OPTIONS,
    when: 'detector', whenValue: 'measured' },
];
export const INPUTS = [...MAIN_INPUTS, ...DETECT_INPUTS];
export const DEFAULTS = defaultsFor(INPUTS);

const od = t => (t > 10 ** -OD_CAP ? -Math.log10(t) : OD_CAP);

// The filters and detector as fluorescence.js takes them. `curves` holds
// the files the page has read: { [inputId]: { name, parsed } | { name, error } }.
function detectionPath(v, curves) {
  const errors = [], filters = [], files = [];
  let pending = false;
  const curveFor = id => {
    const loaded = curves[id];
    if (!v[id]) return { error: 'choose a file.' };
    // Chosen but not read yet: the page re-runs the calculator once it is.
    if (!loaded || loaded.name !== v[id]) { pending = true; return {}; }
    if (loaded.error) return { error: loaded.error };
    const read = curveInUnits(loaded.parsed, v[`${id}Units`]);
    if (!read.ok) return { error: read.message, id: `${id}Units` };
    files.push({ name: loaded.name, points: loaded.parsed.points, rangeNm: loaded.parsed.rangeNm, unit: read.unit, from: read.from });
    return { curve: read.curve };
  };
  for (let i = 1; i <= MAX_FILTERS; i++) {
    const p = `f${i}`, type = v[`${p}Type`];
    if (type === 'none') continue;
    if (type === 'measured') {
      const { curve, error, id } = curveFor(`${p}File`);
      if (error) errors.push({ id: id ?? `${p}File`, message: `Filter ${i}: ${error}` });
      else if (curve) filters.push({ index: i, type, curve, name: curves[`${p}File`].name });
      continue;
    }
    const peakTransmission = v[`${p}Peak`] / 100, blockingOd = v[`${p}Od`];
    if (10 ** -blockingOd >= peakTransmission) {
      errors.push({ id: `${p}Od`, message: `Filter ${i}: the blocking (10^−OD) must be below the peak transmission.` });
      continue;
    }
    if ((type === 'bandpass' || type === 'notch') && v[`${p}Center`] - v[`${p}Width`] / 2 <= 0) {
      errors.push({ id: `${p}Width`, message: `Filter ${i}: the band must lie at positive wavelengths.` });
      continue;
    }
    // Narrower than three edge widths, the two edges overlap and the band
    // no longer reaches its peak transmission or its FWHM; from there on
    // both hold to 0.3 %.
    if ((type === 'bandpass' || type === 'notch') && v[`${p}Width`] < BAND_EDGES * v[`${p}EdgeWidth`]) {
      const message = `Filter ${i}: the width must be at least ${BAND_EDGES} times the edge width, or the band does not reach its peak transmission and FWHM.`;
      errors.push({ id: `${p}Width`, message }, { id: `${p}EdgeWidth`, message });
      continue;
    }
    // A notch must also be wide enough for its centre to reach the set
    // blocking (to 0.1 OD), which takes more width the deeper it blocks.
    const notchMin = type === 'notch' ? notchMinimumWidthNm({ edgeWidthNm: v[`${p}EdgeWidth`], peakTransmission, blockingOd }) : 0;
    if (v[`${p}Width`] < notchMin) {
      const message = `Filter ${i}: with these edges a notch must be at least ${Number(notchMin.toPrecision(3))} nm wide for its centre to reach OD ${v[`${p}Od`]}.`;
      errors.push({ id: `${p}Width`, message }, { id: `${p}EdgeWidth`, message });
      continue;
    }
    filters.push({ index: i, type, peakTransmission, blockingOd, edgeWidthNm: v[`${p}EdgeWidth`],
      centerNm: v[`${p}Center`], widthNm: v[`${p}Width`], edgeNm: v[`${p}Edge`] });
  }
  let detector = { type: 'ideal' };
  if (v.detector === 'flat') detector = { type: 'flat', qe: v.detectorQe / 100 };
  else if (DETECTOR_PRESETS[v.detector]) detector = { type: 'preset', id: v.detector };
  else if (v.detector === 'measured') {
    const { curve, error, id } = curveFor('detectorFile');
    if (error) errors.push({ id: id ?? 'detectorFile', message: `Detector: ${error}` });
    else if (curve) detector = { type: 'measured', curve, name: curves.detectorFile.name };
  }
  return { filters, detector, errors, pending, files };
}

// What one fluorophore does with this source and this detection path. For
// a band, the relative excitation is averaged over the source's photons.
function evaluate(meta, data, source, filters, detector) {
  const excitationAt = nm => spectrumValue(data.excitation, nm);
  const relative = sourceAverage(source, excitationAt);
  const extinction = meta.extinctionM;
  const fractions = detectionFractions(data.emission, filters, detector);
  const brightness = extinction && meta.quantumYield ? extinction * meta.quantumYield : null;
  return {
    meta, data, relative, ...fractions, focusFactor: focusSpectralFactor(source, excitationAt),
    extinctionAtLaser: extinction ? extinction * relative : null,
    crossSectionCm2: extinction ? absorptionCrossSectionCm2(extinction * relative) : null,
    brightness, brightnessAtLaser: brightness === null ? null : brightness * relative,
    // ε(λ_L)·Φ·η: signal per molecule at equal excitation intensity, up to
    // the collection geometry, which is common to both fluorophores.
    signal: brightness === null ? null : brightness * relative * fractions.detected,
  };
}

const loaded = (data, id) => data && !data.error && data.id === id && data.excitation?.values && data.emission?.values;

// raw: the main and detection forms. context: { data, secondData } — the
// loaded spectrum files (undefined while loading, { error } on failure) —
// and `curves`, the user's files.
export function computeFluorescence(raw, { data, secondData, curves = {} } = {}) {
  const { values: v, errors } = parseInputs(INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  const meta = LIBRARY.get(v.fluorophore);
  const metaB = v.second === 'none' ? null : LIBRARY.get(v.second);
  const path = detectionPath(v, curves);
  if (path.errors.length) return { ok: false, errors: path.errors };
  if (path.pending) return { ok: false, pending: true, message: 'Reading the file…' };
  if (data === undefined || (metaB && secondData === undefined)) return { ok: false, pending: true, message: 'Loading the spectra…' };
  if (!loaded(data, v.fluorophore)) return unavailable('This fluorophore’s spectra could not be loaded. Check the connection, then choose it again.', 'fluorophore');
  if (metaB && !loaded(secondData, v.second)) return unavailable('The second fluorophore’s spectra could not be loaded. Check the connection, then choose it again.', 'second');
  const { filters, detector } = path;
  const source = excitationSource({ kind: v.source, centerNm: v.centerNm, bandwidthNm: v.bandwidthNm, pulseFs: v.pulseFs });
  const main = evaluate(meta, data, source, filters, detector);
  const second = metaB ? evaluate(metaB, secondData, source, filters, detector) : null;
  const leak = sourceTransmission(source, filters);
  return {
    ok: true, values: v, source, photonJ: sourcePhotonEnergyJ(source), main, second, filters, detector, files: path.files,
    sourceTransmission: leak, sourceOd: od(leak), sourceOdCapped: !(leak > 10 ** -OD_CAP),
    crosstalk: second && main.signal > 0 && second.signal !== null ? second.signal / main.signal : null,
    library: FLUOROPHORE_SOURCES[meta.source],
    plot: plotData(source, [main, second].filter(Boolean), filters, detector),
  };
}

// A source band narrower than this is drawn as its line alone: the 1 nm
// plot grid cannot show it.
const DRAWN_BAND_NM = 3;

// The plotted window: the fluorophores' spectra (where above 0.5 % of
// their peak) and the source, padded and rounded to 10 nm, at 1 nm.
function plotData(source, items, filters, detector) {
  const drawn = source.fwhmNm >= DRAWN_BAND_NM;
  let lo = source.centerNm - (drawn ? 1.5 * source.fwhmNm : 0), hi = source.centerNm + (drawn ? 1.5 * source.fwhmNm : 0);
  for (const { data } of items) {
    for (const s of [data.excitation, data.emission]) {
      const [a, b] = spectrumRangeNm(s);
      const k0 = s.values.findIndex(v => v > 5), k1 = s.values.length - 1 - [...s.values].reverse().findIndex(v => v > 5);
      lo = Math.min(lo, Math.max(a, s.startNm + k0 * s.stepNm, 280));
      hi = Math.max(hi, Math.min(b, s.startNm + k1 * s.stepNm));
    }
  }
  lo = Math.max(SCOPE_NM[0], Math.floor((lo - 10) / 10) * 10);
  hi = Math.min(1100, Math.ceil((hi + 10) / 10) * 10);
  const x = [];
  for (let nm = lo; nm <= hi; nm++) x.push(nm);
  const T = x.map(nm => stackTransmission(filters, nm));
  const qe = x.map(nm => detectorQe(detector, nm));
  const curves = items.map(({ data }) => ({
    ex: x.map(nm => spectrumValue(data.excitation, nm)),
    em: x.map(nm => spectrumValue(data.emission, nm)),
  }));
  return {
    x, T, od: T.map(od), qe, odCap: OD_CAP, curves,
    source: drawn ? x.map(nm => sourceWeight(source, nm)) : null,
    detected: x.map((nm, k) => curves[0].em[k] * T[k] * qe[k]),
    perFilter: filters.map(f => x.map(nm => filterTransmission(f, nm))),
  };
}

// ---------------- excitation rate and saturation ----------------

export const RATE_INPUTS = [
  { id: 'geometry', group: 'beam', label: 'Illumination', type: 'select', value: 'focus',
    options: [['focus', 'Focused spot (confocal, point scanning)'], ['widefield', 'Widefield (uniform field)']],
    help: 'A diffraction-limited focus of the objective, or a flat-top field of a given diameter.' },
  { id: 'powerMw', group: 'beam', label: 'Average power at the sample', unit: 'mW', value: 0.1, min: 1e-6, max: 10000,
    help: 'Average power after the objective. Confocal imaging typically uses 1–100 µW (0.001–0.1 mW).' },
  { id: 'repRateMHz', group: 'beam', label: 'Repetition rate', unit: 'MHz', value: 80, min: 0.001, max: 1e6, arrowStep: 1,
    when: 'source', whenValue: 'pulsed', help: 'With the average power it sets each pulse’s energy, and so its peak power.' },
  { id: 'fieldUm', group: 'beam', label: 'Field diameter', unit: 'µm', value: 200, min: 1, max: 100000, arrowStep: 10,
    when: 'geometry', whenValue: 'widefield', help: 'Diameter of the illuminated field in the sample plane.' },
  { id: 'na', group: 'objective', label: 'Objective NA', value: 1.2, min: 0.05, max: 1.7, arrowStep: 0.05,
    help: 'Sets the focus size and the collection cone. Collection uses it in both illumination modes.' },
  { id: 'mediumIndex', group: 'objective', label: 'Sample refractive index', value: 1.33, min: 1, max: 2.5, arrowStep: 0.01,
    help: 'Index around the fluorophore (water 1.33, cells about 1.36–1.38, oil and glass 1.52). Must not be below the NA.' },
  { id: 'lifetimeFrom', group: 'molecule', label: 'Fluorescence lifetime', type: 'select', value: 'library',
    options: [['library', 'From the library, when listed'], ['manual', 'Enter it']],
    help: 'The lifetime sets saturation. FPbase lists it for many proteins, not all.' },
  { id: 'lifetimeNs', group: 'molecule', label: 'Lifetime', unit: 'ns', value: 3, min: 0.01, max: 1000, arrowStep: 0.1,
    when: 'lifetimeFrom', whenValue: 'manual', help: 'Fluorescence lifetime τ of the excited state.' },
];
export const RATE_DEFAULTS = defaultsFor(RATE_INPUTS);
const formatPeriod = ns => (ns >= 1 ? `${Number(ns.toPrecision(3))} ns` : `${Number((ns * 1e3).toPrecision(3))} ps`);

// Pulses must be this much shorter than the lifetime, and than the
// period between them, for the per-pulse model; without a lifetime,
// fluorescent proteins' ≥ 1 ns is assumed.
const PULSE_TO_LIFETIME = 0.1, PULSE_TO_PERIOD = 0.1, ASSUMED_LIFETIME_NS = 1;

// context: { source, photonJ, name, crossSectionCm2, focusFactor,
// quantumYield, lifetimeNs, detected } from the main panel, or null while
// it is invalid.
// The source kind decides which inputs apply, so it joins the raw values.
export function computeRates(raw, context) {
  const { values: v, errors } = parseInputs(RATE_INPUTS, { ...raw, source: context?.source.kind ?? 'cw' });
  if (errors.length) return { ok: false, errors };
  if (!context) return unavailable('Set a valid source, fluorophore and detection path above to estimate the rates.', null);
  const { source } = context;
  if (v.na > v.mediumIndex) return unavailable('The NA cannot exceed the sample’s refractive index: that light does not propagate in the sample.', 'na', 'mediumIndex');
  if (source.kind === 'led' && v.geometry === 'focus') return unavailable('An LED cannot be focused to a diffraction-limited spot: its light is spatially incoherent. Choose widefield.', 'geometry');
  if (!(context.crossSectionCm2 > 0)) return unavailable(`${context.name} does not absorb this source in its measured spectrum, or has no extinction coefficient listed.`, null);
  if (!(context.quantumYield > 0)) return unavailable(`No quantum yield is listed for ${context.name}.`, null);
  const lifetimeNs = v.lifetimeFrom === 'manual' ? v.lifetimeNs : context.lifetimeNs;
  const pulsed = source.kind === 'pulsed';
  if (pulsed && source.pulseFs > PULSE_TO_LIFETIME * (lifetimeNs ?? ASSUMED_LIFETIME_NS) * 1e6) {
    return unavailable(`Pulses of ${source.pulseFs} fs are not much shorter than the ${lifetimeNs ? `${lifetimeNs} ns` : 'assumed 1 ns'} lifetime, which the per-pulse model needs (at most a tenth of it).`, null);
  }
  if (pulsed && source.pulseFs * 1e-15 > PULSE_TO_PERIOD / (v.repRateMHz * 1e6)) {
    return unavailable(`At ${v.repRateMHz} MHz the pulses are ${formatPeriod(1e3 / v.repRateMHz)} apart, too close for ${source.pulseFs} fs pulses: the per-pulse model needs at least ten pulse durations between them.`, 'repRateMHz');
  }
  const powerW = v.powerMw * 1e-3;
  const focus = v.geometry === 'focus';
  const intensityAt = p => (focus ? focusPeakIntensityWcm2(p, source.centerNm, v.na) : widefieldIntensityWcm2(p, v.fieldUm));
  const powerFor = intensity => (focus ? focusPowerW(intensity, source.centerNm, v.na) : widefieldPowerW(intensity, v.fieldUm));
  const intensityWcm2 = intensityAt(powerW);
  // In a focus each wavelength of a band has its own Airy peak; the factor
  // folds that into the cross-section (1 for a line, and in widefield).
  const crossSectionCm2 = context.crossSectionCm2 * (focus ? context.focusFactor ?? 1 : 1);
  const common = { crossSectionCm2, photonJ: context.photonJ, lifetimeNs, quantumYield: context.quantumYield };
  const rates = pulsed
    ? pulsedMoleculeRates({ ...common, averageIntensityWcm2: intensityWcm2, repRateMHz: v.repRateMHz, pulseFs: source.pulseFs })
    : moleculeRates({ ...common, intensityWcm2 });
  // The average power that brings the molecule to saturation: kτ = 1, or
  // σF = 1 per pulse (fluence 1/σ at the repetition rate).
  const saturationPowerW = pulsed ? powerFor(v.repRateMHz * 1e6 * context.photonJ / crossSectionCm2)
    : rates.saturationIntensityWcm2 === null ? null : powerFor(rates.saturationIntensityWcm2);
  const collection = collectionFraction(v.na, v.mediumIndex);
  return {
    ok: true, values: v, context, pulsed, effectiveCrossSectionCm2: crossSectionCm2, lifetimeNs: lifetimeNs ?? null, lifetimeSource: v.lifetimeFrom === 'manual' ? 'entered' : lifetimeNs ? 'library' : null,
    intensityWcm2, ...rates, collection, saturationPowerW,
    ...(pulsed ? { pulseEnergyJ: powerW / (v.repRateMHz * 1e6), peakPowerW: powerW / (v.repRateMHz * 1e6) * 2 * Math.sqrt(Math.LN2 / Math.PI) / (source.pulseFs * 1e-15) } : {}),
    detectedRate: rates.emissionRate * collection * context.detected,
  };
}
