// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The fluorescence calculator: a CW laser line on a fluorophore's measured
// excitation spectrum, its emission through a stack of filters and onto a
// detector, a second fluorophore's crosstalk, and the excitation rate and
// saturation of one molecule. DOM-free; the page loads the spectrum files
// and the user's curve files and passes them in.
import { FLUOROPHORE_LIBRARY, FLUOROPHORE_SOURCES } from '../../sketch/js/fluorophore-library.js';
import {
  spectrumValue, spectrumRangeNm, absorptionCrossSectionCm2, filterTransmission, stackTransmission, detectorQe,
  detectionFractions, focusPeakIntensityWcm2, widefieldIntensityWcm2, focusPowerW, widefieldPowerW,
  collectionFraction, moleculeRates, DETECTOR_PRESETS,
} from '../../sketch/js/fluorescence.js';
import { defaultsFor, parseInputs, unavailable } from '../assets/calculator-inputs.js';

export const LIBRARY = new Map(FLUOROPHORE_LIBRARY.map(f => [f.id, f]));
const SCOPE_NM = [250, 1000];
export const MAX_FILTERS = 2;
const FILTER_KINDS = ['bandpass', 'longpass', 'shortpass', 'notch'];
const OD_CAP = 12;
const fluorophoreOptions = FLUOROPHORE_LIBRARY.map(f => [f.id, f.name, f.category]);

// The excitation laser and the fluorophores (main form).
export const MAIN_INPUTS = [
  { id: 'laserNm', group: 'laser', label: 'Laser wavelength', unit: 'nm', value: 488, min: SCOPE_NM[0], max: SCOPE_NM[1], arrowStep: 1 },
  { id: 'fluorophore', group: 'fluor', label: 'Fluorophore', type: 'select', value: 'egfp', options: fluorophoreOptions },
  { id: 'second', group: 'second', label: 'Fluorophore', type: 'select', value: 'none', options: [['none', 'None'], ...fluorophoreOptions] },
];

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
];
export const INPUTS = [...MAIN_INPUTS, ...DETECT_INPUTS];
export const DEFAULTS = defaultsFor(INPUTS);

const od = t => (t > 10 ** -OD_CAP ? -Math.log10(t) : OD_CAP);

// The filters and detector as fluorescence.js takes them. `curves` holds
// the files the page has read: { [inputId]: { name, curve } | { name, error } }.
function detectionPath(v, curves) {
  const errors = [], filters = [];
  let pending = false;
  const curveFor = id => {
    const loaded = curves[id];
    if (!v[id]) return { error: 'choose a file.' };
    // Chosen but not read yet: the page re-runs the calculator once it is.
    if (!loaded || loaded.name !== v[id]) { pending = true; return {}; }
    return loaded.error ? { error: loaded.error } : { curve: loaded.curve };
  };
  for (let i = 1; i <= MAX_FILTERS; i++) {
    const p = `f${i}`, type = v[`${p}Type`];
    if (type === 'none') continue;
    if (type === 'measured') {
      const { curve, error } = curveFor(`${p}File`);
      if (error) errors.push({ id: `${p}File`, message: `Filter ${i}: ${error}` });
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
    filters.push({ index: i, type, peakTransmission, blockingOd, edgeWidthNm: v[`${p}EdgeWidth`],
      centerNm: v[`${p}Center`], widthNm: v[`${p}Width`], edgeNm: v[`${p}Edge`] });
  }
  let detector = { type: 'ideal' };
  if (v.detector === 'flat') detector = { type: 'flat', qe: v.detectorQe / 100 };
  else if (DETECTOR_PRESETS[v.detector]) detector = { type: 'preset', id: v.detector };
  else if (v.detector === 'measured') {
    const { curve, error } = curveFor('detectorFile');
    if (error) errors.push({ id: 'detectorFile', message: `Detector: ${error}` });
    else if (curve) detector = { type: 'measured', curve, name: curves.detectorFile.name };
  }
  return { filters, detector, errors, pending };
}

// What one fluorophore does with this laser and this detection path.
function evaluate(meta, data, laserNm, filters, detector) {
  const relative = spectrumValue(data.excitation, laserNm);
  const extinction = meta.extinctionM;
  const fractions = detectionFractions(data.emission, filters, detector);
  const brightness = extinction && meta.quantumYield ? extinction * meta.quantumYield : null;
  return {
    meta, data, relative, ...fractions,
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
  if (!loaded(data, v.fluorophore)) return unavailable('This fluorophore’s spectra could not be loaded.', 'fluorophore');
  if (metaB && !loaded(secondData, v.second)) return unavailable('The second fluorophore’s spectra could not be loaded.', 'second');
  const { filters, detector } = path;
  const main = evaluate(meta, data, v.laserNm, filters, detector);
  const second = metaB ? evaluate(metaB, secondData, v.laserNm, filters, detector) : null;
  const laserTransmission = stackTransmission(filters, v.laserNm);
  return {
    ok: true, values: v, laserNm: v.laserNm, main, second, filters, detector,
    laserTransmission, laserOd: od(laserTransmission), laserOdCapped: !(laserTransmission > 10 ** -OD_CAP),
    crosstalk: second && main.signal > 0 && second.signal !== null ? second.signal / main.signal : null,
    source: FLUOROPHORE_SOURCES[meta.source],
    plot: plotData(v.laserNm, [main, second].filter(Boolean), filters, detector),
  };
}

// The plotted window: the fluorophores' spectra (where above 0.5 % of
// their peak) and the laser, padded and rounded to 10 nm, at 1 nm.
function plotData(laserNm, items, filters, detector) {
  let lo = laserNm, hi = laserNm;
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
    detected: x.map((nm, k) => curves[0].em[k] * T[k] * qe[k]),
    perFilter: filters.map(f => x.map(nm => filterTransmission(f, nm))),
  };
}

// ---------------- excitation rate and saturation ----------------

export const RATE_INPUTS = [
  { id: 'geometry', group: 'beam', label: 'Illumination', type: 'select', value: 'focus',
    options: [['focus', 'Focused spot (confocal, point scanning)'], ['widefield', 'Widefield (uniform field)']],
    help: 'A diffraction-limited focus of the objective, or a flat-top field of a given diameter.' },
  { id: 'powerMw', group: 'beam', label: 'Laser power at the sample', unit: 'mW', value: 0.1, min: 1e-6, max: 10000,
    help: 'Average power after the objective. Confocal imaging typically uses 1–100 µW (0.001–0.1 mW).' },
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

// context: { laserNm, name, crossSectionCm2, quantumYield, lifetimeNs,
// detected } from the main panel, or null while it is invalid.
export function computeRates(raw, context) {
  const { values: v, errors } = parseInputs(RATE_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  if (!context) return unavailable('Set a valid laser, fluorophore and detection path above to estimate the rates.', null);
  if (v.na > v.mediumIndex) return unavailable('The NA cannot exceed the sample’s refractive index: that light does not propagate in the sample.', 'na', 'mediumIndex');
  if (!(context.crossSectionCm2 > 0)) return unavailable(`${context.name} does not absorb at ${context.laserNm} nm in its measured spectrum, or has no extinction coefficient listed.`, null);
  if (!(context.quantumYield > 0)) return unavailable(`No quantum yield is listed for ${context.name}.`, null);
  const lifetimeNs = v.lifetimeFrom === 'manual' ? v.lifetimeNs : context.lifetimeNs;
  const powerW = v.powerMw * 1e-3;
  const intensityWcm2 = v.geometry === 'focus' ? focusPeakIntensityWcm2(powerW, context.laserNm, v.na) : widefieldIntensityWcm2(powerW, v.fieldUm);
  const rates = moleculeRates({ intensityWcm2, wavelengthNm: context.laserNm, crossSectionCm2: context.crossSectionCm2, lifetimeNs, quantumYield: context.quantumYield });
  const collection = collectionFraction(v.na, v.mediumIndex);
  const saturationPowerW = rates.saturationIntensityWcm2 === null ? null
    : v.geometry === 'focus' ? focusPowerW(rates.saturationIntensityWcm2, context.laserNm, v.na) : widefieldPowerW(rates.saturationIntensityWcm2, v.fieldUm);
  return {
    ok: true, values: v, context, lifetimeNs: lifetimeNs ?? null, lifetimeSource: v.lifetimeFrom === 'manual' ? 'entered' : lifetimeNs ? 'library' : null,
    intensityWcm2, ...rates, collection, saturationPowerW,
    detectedRate: rates.emissionRate * collection * context.detected,
  };
}
