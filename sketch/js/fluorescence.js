// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Linear (one-photon) fluorescence with measured spectra: how strongly a
// laser line excites a fluorophore, which fraction of its emission a stack
// of filters and a detector pass, and the excitation rate and saturation of
// one molecule in a focus or a widefield field. DOM-free and in plain
// numbers with units in their names, for the fluorescence calculator and
// its tests; the spectra come from sketch/data/fluorophores/ (see
// fluorophore-library.js).
//
// A stored spectrum is { startNm, stepNm, values }, values scaled so its
// peak is 1000 (an excitation curve may exceed 1000 away from the peak its
// extinction coefficient refers to, at a protein's 280 nm band). A measured
// curve loaded by the user is { x: [nm], y: [0–1] }, sorted by wavelength.

const H_J_S = 6.62607015e-34;
const C_M_S = 299792458;
const AVOGADRO = 6.02214076e23;
const LN9 = Math.log(9);

// Stored spectrum at one wavelength, as a fraction of its peak; zero
// outside the measured range (FPbase curves end where the signal does).
export function spectrumValue(spectrum, nm) {
  const { startNm, stepNm, values } = spectrum;
  const u = (nm - startNm) / stepNm;
  if (!(u >= 0) || u > values.length - 1) return 0;
  const k = Math.min(values.length - 2, Math.floor(u));
  return (values[k] + (values[k + 1] - values[k]) * (u - k)) / 1000;
}

export const spectrumRangeNm = s => [s.startNm, s.startNm + (s.values.length - 1) * s.stepNm];

// A user-supplied curve at one wavelength, linearly interpolated; zero
// outside its range.
export function curveValue(curve, nm) {
  const { x, y } = curve;
  if (!(nm >= x[0] && nm <= x.at(-1))) return 0;
  let lo = 0, hi = x.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (x[mid] <= nm) lo = mid; else hi = mid; }
  return x[hi] === x[lo] ? y[lo] : y[lo] + (y[hi] - y[lo]) * (nm - x[lo]) / (x[hi] - x[lo]);
}

// σ = ln(10) · 1000 cm³/L · ε / N_A: the decadic molar extinction
// coefficient ε (M⁻¹ cm⁻¹) as the absorption cross-section of one molecule.
export const absorptionCrossSectionCm2 = extinctionM => Math.LN10 * 1000 * extinctionM / AVOGADRO;
export const photonEnergyJ = wavelengthNm => H_J_S * C_M_S / (wavelengthNm * 1e-9);

// ---------------- filters and detectors ----------------

// A filter edge rising from 0 to 1 through `atNm`, as a logistic whose
// 10 %–90 % width is `widthNm`; a width of 0 is a hard step (½ exactly at
// the edge).
function rise(nm, atNm, widthNm) {
  if (!(widthNm > 0)) return nm > atNm ? 1 : nm < atNm ? 0 : 0.5;
  const z = (nm - atNm) * 2 * LN9 / widthNm;
  return z > 700 ? 1 : z < -700 ? 0 : 1 / (1 + Math.exp(-z));
}

// The generic filter: peak transmission T_p inside its passband, 10^-OD
// outside it, with edges of a chosen steepness. Bandpass and notch place
// their edges at centre ± width/2, the half-maximum points when the band is
// much wider than the edges.
//   { type: 'bandpass' | 'notch', centerNm, widthNm, edgeWidthNm, peakTransmission, blockingOd }
//   { type: 'longpass' | 'shortpass', edgeNm, edgeWidthNm, peakTransmission, blockingOd }
//   { type: 'measured', curve }
export function filterTransmission(filter, nm) {
  if (filter.type === 'measured') return curveValue(filter.curve, nm);
  const pass = filter.peakTransmission, block = 10 ** -filter.blockingOd;
  let shape;
  if (filter.type === 'longpass') shape = rise(nm, filter.edgeNm, filter.edgeWidthNm);
  else if (filter.type === 'shortpass') shape = 1 - rise(nm, filter.edgeNm, filter.edgeWidthNm);
  else {
    const band = rise(nm, filter.centerNm - filter.widthNm / 2, filter.edgeWidthNm)
      * (1 - rise(nm, filter.centerNm + filter.widthNm / 2, filter.edgeWidthNm));
    shape = filter.type === 'notch' ? 1 - band : band;
  }
  return block + (pass - block) * shape;
}

// Wavelengths where a filter has a hard step, so integrals can split there.
function filterEdges(filter) {
  if (filter.type === 'measured') return [];
  if (filter.type === 'longpass' || filter.type === 'shortpass') return [filter.edgeNm];
  return [filter.centerNm - filter.widthNm / 2, filter.centerNm + filter.widthNm / 2];
}

export const stackTransmission = (filters, nm) => filters.reduce((t, f) => t * filterTransmission(f, nm), 1);

// Typical detector quantum efficiencies, drawn by OpticalSetup from
// manufacturers' published typical curves for one representative product
// each: the tabulated values are reproduced exactly (cathode radiant
// sensitivity S converts as QE = S · hc/(eλ)), the points between them are
// read off the typical-response figure. A real detector of the same kind
// can differ by several percentage points, more at the edges of its range.
export const DETECTOR_PRESETS = {
  bialkali: {
    label: 'Bialkali PMT (super bialkali, borosilicate window)', product: 'Hamamatsu H10720/H10721-110 photosensor module',
    anchors: '110 mA/W at its 400 nm peak, 34 % QE; 230–700 nm',
    points: [[228, 0], [230, 0.019], [247, 0.104], [267, 0.213], [300, 0.338], [340, 0.358], [400, 0.341], [450, 0.28],
      [475, 0.227], [500, 0.205], [515, 0.187], [550, 0.109], [600, 0.046], [630, 0.027], [655, 0.012], [675, 0.006], [700, 0.0018], [705, 0]],
  },
  gaasp: {
    label: 'GaAsP PMT', product: 'Hamamatsu H7422-40 photosensor module',
    anchors: '108 mA/W at 420 nm, 176 mA/W at 550 nm, 40 % QE at the 580 nm peak; 300–720 nm',
    points: [[290, 0], [300, 0.057], [335, 0.128], [355, 0.204], [400, 0.295], [420, 0.319], [470, 0.4], [500, 0.4], [550, 0.397],
      [580, 0.4], [600, 0.37], [635, 0.325], [665, 0.26], [685, 0.19], [695, 0.1], [705, 0.05], [711, 0.015], [722, 0.0014], [730, 0]],
  },
  gaas: {
    label: 'GaAs PMT', product: 'Hamamatsu H7422-50 photosensor module',
    anchors: '15 mA/W at 420 nm, 50 mA/W at 550 nm, 90 mA/W at the 800 nm peak; 380–890 nm',
    points: [[355, 0], [361, 0.003], [400, 0.027], [420, 0.044], [440, 0.054], [500, 0.104], [550, 0.113], [605, 0.142],
      [700, 0.139], [800, 0.139], [825, 0.124], [858, 0.085], [875, 0.026], [890, 0.004], [905, 0]],
  },
  scmos: {
    label: 'Back-illuminated sCMOS camera', product: 'Hamamatsu ORCA-Fusion BT (C15440-20UP)',
    anchors: '95 % QE at 550 nm; 300–1100 nm',
    points: [[300, 0.01], [318, 0.1], [338, 0.42], [362, 0.52], [377, 0.61], [400, 0.715], [460, 0.85], [500, 0.905], [540, 0.945],
      [560, 0.952], [600, 0.94], [650, 0.9], [700, 0.83], [735, 0.76], [800, 0.575], [820, 0.52], [850, 0.455], [875, 0.395],
      [895, 0.33], [940, 0.215], [980, 0.15], [1010, 0.09], [1050, 0.035], [1100, 0.005]],
  },
};
const PRESET_CURVES = Object.fromEntries(Object.entries(DETECTOR_PRESETS).map(([id, p]) => [id, { x: p.points.map(q => q[0]), y: p.points.map(q => q[1]) }]));

//   { type: 'ideal' } (QE 1: the transmitted fraction only)
//   { type: 'flat', qe } | { type: 'preset', id } | { type: 'measured', curve }
export function detectorQe(detector, nm) {
  if (detector.type === 'flat') return detector.qe;
  if (detector.type === 'preset') return curveValue(PRESET_CURVES[detector.id], nm);
  if (detector.type === 'measured') return curveValue(detector.curve, nm);
  return 1;
}

// ---------------- the detection budget ----------------

const INTEGRATION_STEP_NM = 0.05;

// ∫ f over [lo, hi] by the trapezoidal rule on a 0.05 nm grid, split at the
// listed wavelengths so a hard filter edge falls on an interval end; each
// piece is sampled just inside its ends, so a step is integrated exactly.
function integrate(f, lo, hi, breaks) {
  const cuts = [lo, ...breaks.filter(b => b > lo && b < hi).sort((a, b) => a - b), hi];
  let sum = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1];
    if (!(b > a)) continue;
    const n = Math.max(1, Math.ceil((b - a) / INTEGRATION_STEP_NM)), h = (b - a) / n, eps = Math.min(1e-9, h * 1e-6);
    let s = (f(a + eps) + f(b - eps)) / 2;
    for (let k = 1; k < n; k++) s += f(a + k * h);
    sum += s * h;
  }
  return sum;
}

// Fractions of an emission spectrum passed by the filter stack, and then
// counted by the detector, both relative to all of it: ∫E·T dλ / ∫E dλ and
// ∫E·T·QE dλ / ∫E dλ. The emission curve is taken per unit wavelength.
export function detectionFractions(emission, filters, detector) {
  const [lo, hi] = spectrumRangeNm(emission);
  const breaks = filters.flatMap(filterEdges);
  const total = integrate(nm => spectrumValue(emission, nm), lo, hi, []);
  const transmitted = integrate(nm => spectrumValue(emission, nm) * stackTransmission(filters, nm), lo, hi, breaks);
  const detected = integrate(nm => spectrumValue(emission, nm) * stackTransmission(filters, nm) * detectorQe(detector, nm), lo, hi, breaks);
  return {
    transmitted: transmitted / total, detected: detected / total,
    // The detector's QE averaged over the light that reaches it.
    meanQe: transmitted > 0 ? detected / transmitted : null,
  };
}

// ---------------- excitation rate and saturation ----------------

// Peak intensity of a diffraction-limited focus: a uniformly filled pupil
// gives an Airy pattern I(v) = I₀[2J₁(v)/v]², v = 2π·NA·r/λ, whose power is
// P = I₀λ²/(π NA²), so I₀ = π NA² P / λ² (scalar, paraxial).
export const focusPeakIntensityWcm2 = (powerW, wavelengthNm, na) => Math.PI * na * na * powerW / (wavelengthNm * 1e-7) ** 2;
// A flat-top field of diameter D: I = 4P/(π D²).
export const widefieldIntensityWcm2 = (powerW, diameterUm) => 4 * powerW / (Math.PI * (diameterUm * 1e-4) ** 2);
// Power that gives intensity I in each geometry (the inverse of the two above).
export const focusPowerW = (intensityWcm2, wavelengthNm, na) => intensityWcm2 * (wavelengthNm * 1e-7) ** 2 / (Math.PI * na * na);
export const widefieldPowerW = (intensityWcm2, diameterUm) => intensityWcm2 * Math.PI * (diameterUm * 1e-4) ** 2 / 4;

// Fraction of the photons an isotropic emitter sends into an objective's
// acceptance cone, half-angle θ = asin(NA/n): (1 − cos θ)/2. Null when the
// NA exceeds the medium's index (that light is evanescent).
export function collectionFraction(na, mediumIndex) {
  if (!(na > 0) || !(mediumIndex > 0) || na > mediumIndex) return null;
  return (1 - Math.sqrt(1 - (na / mediumIndex) ** 2)) / 2;
}

// One molecule as a two-level system: absorption rate k = σΦ from the
// photon flux Φ = I/(hν); steady-state excited fraction kτ/(1 + kτ) and
// emission rate Φ_F·k/(1 + kτ). Saturation (kτ = 1) is at I_sat = hν/(στ).
// Without a lifetime only the unsaturated rates are given.
export function moleculeRates({ intensityWcm2, wavelengthNm, crossSectionCm2, lifetimeNs = null, quantumYield }) {
  const photonFlux = intensityWcm2 / photonEnergyJ(wavelengthNm);
  const absorptionRate = crossSectionCm2 * photonFlux;
  if (!(lifetimeNs > 0)) {
    return { photonFlux, absorptionRate, saturationParameter: null, excitedFraction: null, emissionRate: quantumYield * absorptionRate, saturationIntensityWcm2: null };
  }
  const tau = lifetimeNs * 1e-9;
  const s = absorptionRate * tau;
  return {
    photonFlux, absorptionRate, saturationParameter: s, excitedFraction: s / (1 + s),
    emissionRate: quantumYield * absorptionRate / (1 + s),
    saturationIntensityWcm2: crossSectionCm2 > 0 ? photonEnergyJ(wavelengthNm) / (crossSectionCm2 * tau) : null,
  };
}

// ---------------- measured curves from a file ----------------

// A two-column text file (wavelength in nm, then transmission or QE),
// separated by commas, semicolons, tabs or spaces. Lines without two
// numbers (headers, comments) are skipped; a header before the data that
// names % or percent, or fraction, records the unit it states. Repeated
// wavelengths are averaged. The values stay as written: curveInUnits
// converts them.
export function parseCurveCsv(text, { minNm = 150, maxNm = 3000 } = {}) {
  const rows = [];
  let header = null;
  for (const line of String(text).split(/\r?\n/)) {
    const cells = line.trim().split(/[\s,;]+/).filter(Boolean);
    const nm = Number(cells[0]), v = Number(cells[1]);
    if (cells.length >= 2 && Number.isFinite(nm) && Number.isFinite(v)) { rows.push([nm, v]); continue; }
    if (!rows.length && header === null) header = /%|percent/i.test(line) ? 'percent' : /fraction|\(\s*0\s*[-–]\s*1\s*\)/i.test(line) ? 'fraction' : null;
  }
  if (rows.length < 2) return { ok: false, message: 'The file needs at least two rows of “wavelength, value”.' };
  if (rows.some(([nm]) => nm < minNm || nm > maxNm)) return { ok: false, message: `Wavelengths must be in nm, between ${minNm} and ${maxNm}.` };
  const byNm = new Map();
  for (const [nm, v] of rows) {
    const slot = byNm.get(nm) ?? { sum: 0, n: 0 };
    slot.sum += v; slot.n++;
    byNm.set(nm, slot);
  }
  const x = [...byNm.keys()].sort((a, b) => a - b);
  if (x.length < 2) return { ok: false, message: 'The file needs at least two different wavelengths.' };
  const values = x.map(nm => byNm.get(nm).sum / byNm.get(nm).n);
  return { ok: true, x, values, header, maxValue: Math.max(...values), points: x.length, rangeNm: [x[0], x.at(-1)] };
}

// A parsed file as a 0–1 curve. `units` is 'fraction', 'percent', or
// 'auto': the unit its header states, else percent when a value exceeds
// 1.5. Values are clamped to 0–1 (measurement noise); a "fraction" above
// 1.5 is refused rather than clamped.
export function curveInUnits(parsed, units = 'auto') {
  const unit = units !== 'auto' ? units : parsed.header ?? (parsed.maxValue > 1.5 ? 'percent' : 'fraction');
  const from = units !== 'auto' ? 'chosen' : parsed.header ? 'header' : 'values';
  if (unit === 'fraction' && parsed.maxValue > 1.5) return { ok: false, message: 'values above 1.5 cannot be fractions; choose percent.' };
  const scale = unit === 'percent' ? 0.01 : 1;
  return { ok: true, unit, from, curve: { x: parsed.x, y: parsed.values.map(v => Math.min(1, Math.max(0, v * scale))) } };
}
