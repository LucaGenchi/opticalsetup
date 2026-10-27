// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Point-scanning microscope: resolution of the scanned focus, and the field
// of view and spot displacement a galvanometer mirror produces.
import { effectivePsf, halfWidth } from './psf.js';
import { OBJECTIVE_MEDIA, OBJECTIVE_NA_MIN, OBJECTIVE_NA_MAX } from '../../sketch/js/objective.js';
import { ramanStokesWl } from '../../sketch/js/elements.js';
import { defaultsFor, parseInputs, unavailable } from '../assets/calculator-inputs.js';

const WAVELENGTH_SCOPE = [200, 3000];
const MEDIA = ['air', 'water', 'oil'];

export const RESOLUTION_INPUTS = [
  { id: 'mode', type: 'select', group: 'process', label: 'Excitation', value: 'linear',
    options: [['linear', 'One-photon (linear)'], ['nonlinear', 'Multiphoton (nonlinear)']],
    help: 'One-photon signals (fluorescence, spontaneous Raman, scattering) grow linearly with the excitation intensity; N-photon signals (2P/3P fluorescence, harmonics) with its N-th power.' },
  { id: 'signal', type: 'select', group: 'process', label: 'Signal', value: '2pf', when: 'mode', whenValue: 'nonlinear',
    options: [['2pf', 'Two-photon fluorescence'], ['shg', 'Second-harmonic generation (SHG)'], ['3pf', 'Three-photon fluorescence'], ['thg', 'Third-harmonic generation (THG)']],
    help: 'Two-photon fluorescence and SHG follow the square of the excitation intensity, three-photon fluorescence and THG its cube. A harmonic is emitted at exactly λ/2 or λ/3.' },
  { id: 'wavelengthNm', group: 'process', label: 'Excitation wavelength', unit: 'nm', value: 488, min: WAVELENGTH_SCOPE[0], max: WAVELENGTH_SCOPE[1],
    when: 'mode', whenValue: 'linear', help: 'Vacuum wavelength of the scanning laser.' },
  { id: 'nlWavelengthNm', group: 'process', label: 'Excitation wavelength', unit: 'nm', value: 920, min: WAVELENGTH_SCOPE[0], max: WAVELENGTH_SCOPE[1],
    when: 'mode', whenValue: 'nonlinear', help: 'Vacuum wavelength of the pulsed laser (for example 920 nm for GFP, or 1700 nm for three-photon imaging).' },
  { id: 'nlEmissionNm', group: 'process', label: 'Emission wavelength', unit: 'nm', value: 520, min: WAVELENGTH_SCOPE[0], max: WAVELENGTH_SCOPE[1],
    all: [{ when: 'mode', whenValue: 'nonlinear' }, { when: 'signal', whenValue: ['2pf', '3pf'] }],
    help: 'Peak of the detected emission. It does not change the multiphoton point image; it sets the one-photon confocal comparison.' },
  { id: 'detection', type: 'select', group: 'process', label: 'Detected light', value: 'fluorescence', when: 'mode', whenValue: 'linear',
    options: [['fluorescence', 'Fluorescence'], ['raman', 'Spontaneous Raman'], ['elastic', 'Scattered or reflected light']],
    help: 'Sets the wavelength the pinhole sees: the emission, the Raman Stokes line or the excitation itself. Without a pinhole it does not change the resolution.' },
  { id: 'emissionNm', group: 'process', label: 'Emission wavelength', unit: 'nm', value: 520, min: WAVELENGTH_SCOPE[0], max: WAVELENGTH_SCOPE[1],
    all: [{ when: 'mode', whenValue: 'linear' }, { when: 'detection', whenValue: 'fluorescence' }], help: 'Peak of the detected emission band.' },
  { id: 'ramanShiftCm', group: 'process', label: 'Raman shift', unit: 'cm⁻¹', value: 1000, min: 0, max: 10000,
    all: [{ when: 'mode', whenValue: 'linear' }, { when: 'detection', whenValue: 'raman' }], help: 'The detected Stokes line is the excitation shifted down by this wavenumber.' },
  { id: 'na', group: 'objective', label: 'Numerical aperture', unit: '', value: 1, min: OBJECTIVE_NA_MIN, max: OBJECTIVE_NA_MAX,
    help: 'NA = n sin α of the objective, with the back aperture uniformly filled.' },
  { id: 'immersion', type: 'select', group: 'objective', label: 'Immersion medium', value: 'water',
    options: [...MEDIA.map(key => [key, `${OBJECTIVE_MEDIA[key].label} (n = ${OBJECTIVE_MEDIA[key].index})`]), ['custom', 'Custom index']],
    help: 'The medium between the objective and the focus, matched to the sample.' },
  { id: 'immersionIndex', group: 'objective', label: 'Refractive index', unit: '', value: 1.333, min: 1, max: 2,
    when: 'immersion', whenValue: 'custom', help: 'Index of the immersion and sample medium.' },
  { id: 'pinhole', type: 'select', group: 'detector', label: 'Detection', value: 'pinhole', when: 'mode', whenValue: 'linear',
    options: [['pinhole', 'Confocal pinhole'], ['open', 'No pinhole (large detector)']],
    help: 'A pinhole in a plane conjugate to the focus passes light from the focus and blocks most of the rest.' },
  { id: 'pinholeAu', group: 'detector', label: 'Pinhole diameter', unit: 'AU', value: 1, min: 0, max: 10,
    all: [{ when: 'mode', whenValue: 'linear' }, { when: 'pinhole', whenValue: 'pinhole' }],
    help: 'In Airy units of the detected light: 1 AU = 1.22 λ_det/NA, back-projected to the sample. 0 is the ideal point pinhole.' },
  { id: 'comparisonAu', group: 'detector', label: 'Pinhole of the one-photon comparison', unit: 'AU', value: 1, min: 0, max: 10,
    all: [{ when: 'mode', whenValue: 'nonlinear' }, { when: 'signal', whenValue: ['2pf', '3pf'] }],
    help: 'For the one-photon confocal comparison at λ/N. 1 AU is the usual setting; dim samples are often imaged with a wider pinhole.' },
];
export const RESOLUTION_DEFAULTS = defaultsFor(RESOLUTION_INPUTS);

const um = nm => nm / 1000;
// Photons per event (the power of the excitation intensity) of each
// nonlinear signal, and whether it is a harmonic, emitted at λ/N.
export const SIGNALS = {
  '2pf': { order: 2, harmonic: false, label: 'Two-photon fluorescence' },
  shg: { order: 2, harmonic: true, label: 'Second-harmonic generation' },
  '3pf': { order: 3, harmonic: false, label: 'Three-photon fluorescence' },
  thg: { order: 3, harmonic: true, label: 'Third-harmonic generation' },
};
// FWHM in µm from a half width in optical units.
const lateralUm = (halfV, lambdaNm, na) => 2 * halfV * um(lambdaNm) / (2 * Math.PI * na);
const axialUm = (halfU, lambdaNm, axialNa) => 2 * halfU * um(lambdaNm) / (4 * Math.PI * axialNa);
const widths = (psf, lambdaNm, na, axialNa) => ({
  lateralUm: lateralUm(halfWidth(psf.lateral, 0.05), lambdaNm, na),
  axialUm: axialUm(halfWidth(psf.axial, 0.1), lambdaNm, axialNa),
});

export function computeResolution(raw) {
  const { values: v, errors } = parseInputs(RESOLUTION_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  const n = v.immersion === 'custom' ? v.immersionIndex : OBJECTIVE_MEDIA[v.immersion].index;
  if (!(v.na < n)) return unavailable(`The NA must be smaller than the medium’s index (n = ${n}).`, 'na', 'immersion', 'immersionIndex');
  const na = v.na;
  // n − √(n² − NA²) = n(1 − cos α): the axial optical coordinate's scale.
  const axialNa = n - Math.sqrt(n * n - na * na);
  const linear = v.mode === 'linear';
  const signal = linear ? null : SIGNALS[v.signal];
  const order = linear ? 1 : signal.order;
  const exNm = linear ? v.wavelengthNm : v.nlWavelengthNm;
  let detNm = exNm, detectionLabel = 'Excitation wavelength';
  if (signal?.harmonic) { detNm = exNm / order; detectionLabel = order === 2 ? 'Second harmonic' : 'Third harmonic'; }
  if (signal && !signal.harmonic) {
    detNm = v.nlEmissionNm; detectionLabel = 'Emission';
    if (!(detNm > exNm / order)) return unavailable(`Fluorescence is emitted at a longer wavelength than λ/${order} = ${Number((exNm / order).toFixed(1))} nm, the transition the ${order} photons reach.`, 'nlEmissionNm', 'nlWavelengthNm');
  }
  if (linear && v.detection === 'fluorescence') { detNm = v.emissionNm; detectionLabel = 'Emission'; }
  if (linear && v.detection === 'raman') {
    detNm = ramanStokesWl(exNm, v.ramanShiftCm);
    if (detNm === null || detNm > WAVELENGTH_SCOPE[1]) return unavailable(`The Stokes line falls beyond ${WAVELENGTH_SCOPE[1]} nm. Reduce the shift or shorten the excitation wavelength.`, 'ramanShiftCm', 'wavelengthNm');
    detectionLabel = 'Raman Stokes line';
  }
  const pinholeAu = linear && v.pinhole === 'pinhole' ? v.pinholeAu : null;
  const ratio = exNm / detNm;
  const psf = effectivePsf({ order, pinholeAu, detectionRatio: ratio });
  const own = widths(psf, exNm, na, axialNa);
  // The excitation focus alone. Laterally it is the one-photon resolution
  // without a pinhole; along the axis it is not a resolution there, because
  // every plane the beam crosses is excited and detected alike.
  const excitation = widths(effectivePsf({}), exNm, na, axialNa);
  const auUm = 1.22 * um(detNm) / na;
  const sectioning = linear ? pinholeAu !== null : true;
  const result = {
    ok: true, values: v, linear, order, signal, exNm, detNm, detectionLabel, n, na, axialNa, pinholeAu,
    apertureHalfAngleDeg: Math.asin(na / n) * 180 / Math.PI,
    lateralUm: own.lateralUm,
    // Axial resolution only where the signal is confined in depth: with a
    // pinhole, or with N-photon excitation.
    axialUm: sectioning ? own.axialUm : null,
    excitationAxialUm: excitation.axialUm,
    psf, excitationLateralUm: excitation.lateralUm, auUm,
    pinholeUm: pinholeAu === null ? null : pinholeAu * auUm,
    sectioning,
    // Highest spatial frequency the point image passes (cycles/µm). The
    // transfer function of a product of PSFs is the convolution of theirs,
    // so the cutoffs add: 2NA/λ per factor of h, at that factor's wavelength.
    cutoffPerUm: 2 * na * (order / um(exNm) + (pinholeAu === null ? 0 : 1 / um(detNm))),
  };
  // Sampling theorem: two samples per period of that frequency.
  result.bandPixelUm = 1 / (2 * result.cutoffPerUm);
  if (linear) {
    // Point-pinhole limit: h_ex · h_det.
    result.pointPinhole = widths(effectivePsf({ pinholeAu: 0, detectionRatio: ratio }), exNm, na, axialNa);
    // Axial FWHM of the pinhole's detection response D alone: the quantity
    // Zeiss eq. 4 estimates, which the monograph calls the optical slice
    // thickness from 1 AU up (below 1 AU it takes the axial resolution).
    result.sliceUm = pinholeAu === null ? null : axialUm(halfWidth(psf.detection.axial, 0.2), detNm, axialNa);
    // Closed forms of Carl Zeiss's monograph (eqs. 2, 3, 4, 6, 7, 8).
    const meanNm = Math.SQRT2 * exNm * detNm / Math.hypot(exNm, detNm);
    result.closedForm = {
      meanNm,
      openLateralUm: 0.51 * um(exNm) / na, openAxialUm: 0.88 * um(exNm) / axialNa,
      pointLateralUm: 0.37 * um(meanNm) / na, pointAxialUm: 0.64 * um(meanNm) / axialNa,
      sliceUm: pinholeAu === null ? null : Math.hypot(0.88 * um(detNm) / axialNa, Math.SQRT2 * n * result.pinholeUm / na),
    };
  } else if (!signal.harmonic) {
    // Fluorescence only (a harmonic has no one-photon counterpart): the
    // same objective, one-photon without a pinhole at the same
    // wavelength and at λ/N (the transition the N photons reach together):
    // lateral widths only, as neither has an axial resolution.
    result.sameWavelength = { lateralUm: excitation.lateralUm };
    result.transition = { lateralUm: excitation.lateralUm / order };
    // One-photon confocal at λ/N with the chosen pinhole (1 AU by default),
    // detecting the same emission: the usual alternative to N-photon
    // excitation.
    result.transitionConfocalNm = exNm / order;
    result.transitionConfocalAu = v.comparisonAu;
    result.transitionConfocalPsf = effectivePsf({ pinholeAu: v.comparisonAu, detectionRatio: exNm / order / detNm });
    result.transitionConfocal = widths(result.transitionConfocalPsf, exNm / order, na, axialNa);
  }
  return result;
}

// Normalized profiles through the focus, for the graphs: this configuration
// and its comparisons, each { name, values }. Along the axis, one-photon
// excitation without a pinhole has no point-image width to show; its line
// is the signal from a thin uniform layer, the same at every depth (`flat`).
// With a pinhole the comparison along the axis is the pinhole's detection
// response alone.
export function resolutionProfiles(r, count = 161) {
  const latScale = um(r.exNm) / (2 * Math.PI * r.na), axScale = um(r.exNm) / (4 * Math.PI * r.axialNa);
  const grid = span => Array.from({ length: count }, (_, i) => -span + 2 * span * i / (count - 1));
  const xs = grid(1.6 * Math.max(r.lateralUm, r.excitationLateralUm));
  const lat = f => xs.map(x => f(Math.abs(x) / latScale));
  if (!r.linear && r.signal.harmonic) {
    // A harmonic has no one-photon counterpart to compare with.
    const zs = grid(1.6 * r.axialUm);
    return { lateral: { x: xs, own: lat(r.psf.lateral), others: [] }, axial: { x: zs, own: zs.map(z => r.psf.axial(Math.abs(z) / axScale)), others: [] } };
  }
  if (!r.linear) {
    // The one-photon comparison at λ/N has optical coordinates N times the
    // excitation's.
    const zs = grid(1.6 * r.axialUm);
    const confocal = r.transitionConfocalPsf, k = r.order;
    const confocalName = `One-photon confocal at ${Number(r.transitionConfocalNm.toFixed(1))} nm, ${Number(r.transitionConfocalAu.toFixed(2))} AU`;
    return {
      lateral: { x: xs, own: lat(r.psf.lateral), others: [
        { name: 'One-photon at the same wavelength, no pinhole', values: lat(effectivePsf({}).lateral) },
        { name: confocalName, values: lat(v => confocal.lateral(k * v)) }] },
      axial: { x: zs, own: zs.map(z => r.psf.axial(Math.abs(z) / axScale)), others: [
        { name: 'One-photon, no pinhole (thin layer, no sectioning)', values: zs.map(() => 1), flat: true },
        { name: confocalName, values: zs.map(z => confocal.axial(k * Math.abs(z) / axScale)) }] },
    };
  }
  const point = effectivePsf({ pinholeAu: 0, detectionRatio: r.exNm / r.detNm });
  if (!r.sectioning) {
    const zs = grid(1.6 * r.pointPinhole.axialUm);
    return {
      lateral: { x: xs, own: lat(r.psf.lateral), others: [{ name: 'Confocal, point pinhole', values: lat(point.lateral) }] },
      // This configuration is the flat layer line; the point pinhole's
      // point image shows what a pinhole adds.
      axial: { x: zs, own: zs.map(() => 1), ownFlat: true, others: [
        { name: 'Confocal, point pinhole', values: zs.map(z => point.axial(Math.abs(z) / axScale)) }] },
    };
  }
  // The detection response is wider: reach past its half-maximum points,
  // and keep the central peak as finely sampled as the span alone would.
  const core = grid(1.6 * r.axialUm), wide = grid(Math.max(1.6 * r.axialUm, 0.75 * r.sliceUm));
  const zs = wide.at(-1) > core.at(-1)
    ? [...wide.filter(z => Math.abs(z) > core.at(-1)), ...core].sort((a, b) => a - b) : core;
  const b = r.exNm / r.detNm;
  return {
    lateral: { x: xs, own: lat(r.psf.lateral), others: [{ name: 'No pinhole', values: lat(effectivePsf({}).lateral) }] },
    axial: { x: zs, own: zs.map(z => r.psf.axial(Math.abs(z) / axScale)), others: [
      { name: 'Pinhole’s detection response alone', values: zs.map(z => r.psf.detection.axial(b * Math.abs(z) / axScale)) }] },
  };
}

// ---------------- field of view and galvo scanning ----------------

export const TUBE_LENSES = { 200: 'Nikon, Leica (200 mm)', 180: 'Olympus / Evident (180 mm)', 165: 'Zeiss (165 mm)' };

export const SCAN_INPUTS = [
  { id: 'magnification', group: 'objective', label: 'Objective magnification', unit: '×', value: 20, min: 1, max: 200,
    help: 'The engraved magnification, valid with the maker’s own tube lens.' },
  { id: 'tubeReference', type: 'select', group: 'objective', label: 'Maker’s tube-lens focal length', value: '200',
    options: [...Object.entries(TUBE_LENSES).sort((a, b) => b[0] - a[0]), ['custom', 'Other']],
    help: 'The reference focal length that defines the magnification: f_obj = f_ref / M.' },
  { id: 'tubeReferenceMm', group: 'objective', label: 'Reference focal length', unit: 'mm', value: 200, min: 50, max: 500,
    when: 'tubeReference', whenValue: 'custom', help: 'The tube-lens focal length the magnification refers to.' },
  { id: 'fieldNumberMm', group: 'objective', label: 'Field number', unit: 'mm', value: 22, min: 1, max: 40,
    help: 'Diameter of the corrected field in the intermediate image, from the objective or eyepiece specification.' },
  { id: 'scanLensMm', group: 'scan', label: 'Scan-lens focal length', unit: 'mm', value: 50, min: 5, max: 1000,
    help: 'The lens after the galvo, one focal length from its pivot.' },
  { id: 'tubeLensMm', group: 'scan', label: 'Tube-lens focal length', unit: 'mm', value: 200, min: 5, max: 1000,
    help: 'The lens that collimates the beam into the objective; with the scan lens it images the galvo onto the back aperture.' },
  { id: 'mapping', type: 'select', group: 'scan', label: 'Scan-lens mapping', value: 'tan',
    options: [['tan', 'f·tan θ (distortion-free lens)'], ['ftheta', 'f·θ (f-theta scan lens)']],
    help: 'How the scan lens turns the beam angle into a position in the intermediate image.' },
  { id: 'beamMm', group: 'scan', label: 'Beam diameter at the galvo (1/e²)', unit: 'mm', value: 5, min: 0.1, max: 50,
    help: 'Sets how the beam fills the objective’s back aperture.' },
  { id: 'angleKind', type: 'select', group: 'galvo', label: 'Angles given as', value: 'mechanical',
    options: [['mechanical', 'Mechanical (mirror rotation)'], ['optical', 'Optical (beam deflection, twice the rotation)']],
    help: 'A mirror turned by θ deflects the reflected beam by 2θ.' },
  { id: 'angleDeg', group: 'galvo', label: 'Galvo angle from centre', unit: '°', value: 1, min: -30, max: 30,
    help: 'The rotation (or deflection) whose spot displacement you want.' },
  { id: 'rangeDeg', group: 'galvo', label: 'Scan range (peak to peak)', unit: '°', value: 4, min: 0.01, max: 60,
    help: 'Full swing of the scan, symmetric about the centre; it sets the field width.' },
  { id: 'pixels', group: 'galvo', label: 'Pixels per line', unit: '', value: 512, min: 2, max: 16384,
    help: 'Samples across the field width, for the pixel size.' },
  { id: 'voltsPerDeg', group: 'galvo', label: 'Driver scale factor', unit: 'V/°', value: 0.5, min: 0.01, max: 10,
    help: 'Command voltage per degree of mirror rotation (mechanical), as set on the galvo’s servo driver; take it from the driver’s datasheet.' },
  { id: 'bidirectional', type: 'checkbox', group: 'galvo', label: 'Bidirectional (serpentine) scanning', value: false,
    help: 'Record on both sweeps of the fast mirror, instead of only on the forward ramp.' },
];
export const SCAN_DEFAULTS = defaultsFor(SCAN_INPUTS);

const DEG = Math.PI / 180;

// Position in the sample of a beam deflected by `opticalRad` at the galvo:
// the scan lens forms the intermediate image at height h = f_SL tan θ (or
// f_SL θ for an f-theta lens), and the tube lens and the objective image it
// onto the sample with magnification f_obj / f_TL.
export function sampleDisplacementUm({ opticalRad, scanLensMm, tubeLensMm, objectiveMm, mapping = 'tan' }) {
  const h = scanLensMm * (mapping === 'ftheta' ? opticalRad : Math.tan(opticalRad));
  return 1000 * h * objectiveMm / tubeLensMm;
}

// `focus` carries the NA, the lateral FWHM and the band-limited pixel from
// the resolution panel (null when that panel has no valid result).
export function computeScan(raw, focus = null) {
  const { values: v, errors } = parseInputs(SCAN_INPUTS, raw);
  if (errors.length) return { ok: false, errors };
  const optical = v.angleKind === 'optical' ? 1 : 2;
  const opticalDeg = optical * v.angleDeg, rangeOpticalDeg = optical * v.rangeDeg;
  if (Math.abs(opticalDeg) > 60 || rangeOpticalDeg > 120) return unavailable('Optical deflections are limited to ±60°.', 'angleDeg', 'rangeDeg');
  const referenceMm = v.tubeReference === 'custom' ? v.tubeReferenceMm : Number(v.tubeReference);
  const objectiveMm = referenceMm / v.magnification;
  const geometry = { scanLensMm: v.scanLensMm, tubeLensMm: v.tubeLensMm, objectiveMm, mapping: v.mapping };
  const at = deg => sampleDisplacementUm({ ...geometry, opticalRad: deg * DEG });
  const displacementUm = at(opticalDeg);
  const fieldUm = 2 * at(rangeOpticalDeg / 2);
  const objectFieldUm = 1000 * v.fieldNumberMm / v.magnification;
  const relay = v.tubeLensMm / v.scanLensMm;
  const intermediateMm = displacementUm / 1000 * v.tubeLensMm / objectiveMm;
  const pupilMm = focus?.na ? 2 * objectiveMm * focus.na : null;
  const beamAtPupilMm = v.beamMm * relay;
  const pixelUm = fieldUm / v.pixels;
  // Two pixels per lateral FWHM (the Zeiss rule), and the sampling theorem
  // applied to the point image's band limit.
  const halfFwhmPixelUm = focus?.lateralUm ? focus.lateralUm / 2 : null;
  const bandPixelUm = focus?.bandPixelUm ?? null;
  return {
    ok: true, values: v, optical, referenceMm, objectiveMm, opticalDeg, rangeOpticalDeg,
    pupilAngleDeg: Math.atan(intermediateMm / v.tubeLensMm) / DEG,
    displacementUm, intermediateMm,
    otherMappingUm: sampleDisplacementUm({ ...geometry, mapping: v.mapping === 'tan' ? 'ftheta' : 'tan', opticalRad: opticalDeg * DEG }),
    // Small-angle slope, per degree of the angle as entered.
    umPerDegree: 1000 * v.scanLensMm * objectiveMm / v.tubeLensMm * optical * DEG,
    fieldUm, diagonalUm: Math.SQRT2 * fieldUm, objectFieldUm,
    relay, systemMagnification: v.tubeLensMm / objectiveMm,
    // Fast-axis command amplitude: the mechanical half-range times the
    // driver's scale.
    commandAmplitudeV: rangeOpticalDeg / 4 * v.voltsPerDeg,
    pupilMm, beamAtPupilMm, fillRatio: pupilMm ? beamAtPupilMm / pupilMm : null,
    pixelUm, halfFwhmPixelUm, bandPixelUm, lateralUm: focus?.lateralUm ?? null,
    pixelsNeeded: halfFwhmPixelUm ? Math.ceil(fieldUm / halfFwhmPixelUm) : null,
    bandPixelsNeeded: bandPixelUm ? Math.ceil(fieldUm / bandPixelUm) : null,
  };
}

// Displacement against galvo angle (as entered) over the scan range and the
// chosen angle, for both lens mappings. The margin around them stops at the
// ±60° optical deflection the panel accepts, short of tan's pole at 90°.
export function scanProfile(r, count = 121) {
  const span = Math.min(Math.max(r.values.rangeDeg / 2, Math.abs(r.values.angleDeg)) * 1.5, 60 / r.optical);
  const x = Array.from({ length: count }, (_, i) => -span + 2 * span * i / (count - 1));
  const geometry = { scanLensMm: r.values.scanLensMm, tubeLensMm: r.values.tubeLensMm, objectiveMm: r.objectiveMm };
  const curve = mapping => x.map(deg => sampleDisplacementUm({ ...geometry, mapping, opticalRad: r.optical * deg * DEG }));
  return { x, tan: curve('tan'), ftheta: curve('ftheta') };
}

// Command voltages of a raster frame against time, in line periods, drawn
// with `lines` lines over a square field: the fast (x) mirror sweeps each
// line, the slow (y) mirror advances one line per sweep and returns at the
// end of the frame. Unidirectional: a sawtooth whose ramp takes
// `rampFraction` of the line period and whose flyback the rest.
// Bidirectional: a triangle, with every sweep used. The slow mirror steps
// during the flyback (or within `turn` of the turnaround) and flies back
// over one line period.
export function scanRamps(r, { lines = 8, samplesPerLine = 100, rampFraction = 0.8, turn = 0.05 } = {}) {
  const a = r.commandAmplitudeV, bi = r.values.bidirectional;
  const level = k => -a + 2 * a * Math.min(k, lines - 1) / (lines - 1);
  const ease = (from, to, f) => from + (to - from) * Math.min(1, Math.max(0, f));
  const fast = t => {
    const k = Math.floor(t), f = t - k;
    if (k >= lines) return -a;
    if (bi) return (k % 2 ? 1 : -1) * (a - 2 * a * f);
    return f < rampFraction ? -a + 2 * a * f / rampFraction : a - 2 * a * (f - rampFraction) / (1 - rampFraction);
  };
  const slow = t => {
    const k = Math.floor(t), f = t - k;
    if (k >= lines) return ease(a, -a, f);
    if (k === lines - 1) return bi ? ease(level(k - 1), level(k), (f + turn / 2) / turn) : level(k);
    if (!bi) return f < rampFraction ? level(k) : ease(level(k), level(k + 1), (f - rampFraction) / (1 - rampFraction));
    if (f < turn / 2 && k > 0) return ease(level(k - 1), level(k), (f + turn / 2) / turn);
    if (f > 1 - turn / 2) return ease(level(k), level(k + 1), (f - 1 + turn / 2) / turn);
    return level(k);
  };
  const count = (lines + 1) * samplesPerLine + 1;
  const x = Array.from({ length: count }, (_, i) => i / samplesPerLine);
  // The last sample belongs to the end of the frame flyback.
  return { x, fast: x.map(t => t >= lines + 1 ? -a : fast(t)), slow: x.map(t => t >= lines + 1 ? -a : slow(t)), lines, rampFraction };
}
