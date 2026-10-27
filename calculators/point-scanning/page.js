// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { RESOLUTION_INPUTS, RESOLUTION_DEFAULTS, computeResolution, resolutionProfiles,
  SCAN_INPUTS, SCAN_DEFAULTS, computeScan, scanProfile, scanRamps } from './scanning-calculator.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';
import { formatNumber } from '../assets/calculator-kit.js';

// Group headings are set in capitals, which would turn λ into Λ.
const FRACTION = { 2: 'half', 3: 'a third of' };
const nm = x => `${formatNumber(x, 4)} nm`;

// The scan panel reads the NA and the lateral resolution from the panel above.
const focus = { na: null, lateralUm: null, bandPixelUm: null };
let scan = null;

const NO_SECTIONING = 'None: no optical sectioning';
const COLORS = ['--series-3', '--series-2'];
const profileChart = (profile, xLabel) => ({
  x: profile.x, xLabel, xUnit: 'µm', yLabel: 'Normalized signal', yMin: 0, yMax: 1.05,
  formatX: n => formatNumber(n, 3), formatY: n => formatNumber(n, 3),
  series: [{ name: profile.ownFlat ? 'This configuration (thin layer, no sectioning)' : 'This configuration', color: '--series-1', values: profile.own },
    ...profile.others.map((o, i) => ({ name: o.name, color: COLORS[i], dash: true, values: o.values }))],
});

mountCalculator({ inputs: RESOLUTION_INPUTS, defaults: RESOLUTION_DEFAULTS, hideInactive: true, groups: {
  process: { title: 'Excitation and detected light' }, objective: { title: 'Objective' }, detector: { title: 'Detector' },
}, compute: computeResolution, charts: ['lateral', 'axial'],
  // Four tables, two to a row: this configuration, its wavelengths, and two
  // comparisons.
  rows: r => {
    const focus = [
      { group: r.linear ? 'This configuration (FWHM of the scanned point image)' : `${r.signal.label} (FWHM of the scanned point image)` },
      ['Lateral resolution', r.lateralUm, 'µm', 3],
      r.sectioning ? ['Axial resolution', r.axialUm, 'µm', 3] : ['Axial resolution', `${NO_SECTIONING} without a pinhole`],
      ...(r.sliceUm != null ? [['Axial FWHM of the pinhole’s detection response', r.sliceUm, 'µm', 3]] : []),
    ];
    const light = [
      { group: 'Wavelengths and aperture' },
      ['Excitation wavelength', r.exNm, 'nm', 6],
      ...(r.detNm !== r.exNm ? [[`Detected wavelength (${r.detectionLabel.toLowerCase()})`, r.detNm, 'nm', 6]] : []),
      ['Aperture half-angle α = asin(NA/n)', r.apertureHalfAngleDeg, '°', 3],
      ...(r.linear ? [['1 AU at the detected wavelength (at the sample)', r.auUm, 'µm', 3]] : []),
      ...(r.pinholeUm !== null ? [['Pinhole diameter at the sample', r.pinholeUm, 'µm', 3]] : []),
    ];
    // A harmonic has no one-photon counterpart: no comparison tables.
    if (!r.linear && r.signal.harmonic) return { 'res-focus': focus, 'res-light': light };
    if (!r.linear) {
      return {
        'res-focus': focus, 'res-light': light,
        'res-compare': [
          { group: `For comparison: one-photon at the same wavelength (${nm(r.exNm)}), no pinhole` },
          ['Lateral', r.sameWavelength.lateralUm, 'µm', 3], ['Axial', NO_SECTIONING],
          ['Lateral width of this configuration, relative', r.lateralUm / r.sameWavelength.lateralUm, '×', 3],
        ],
        'res-limits': [
          { group: `For comparison: one-photon at ${FRACTION[r.order]} the wavelength (${nm(r.exNm / r.order)})` },
          ['No pinhole: lateral', r.transition.lateralUm, 'µm', 3], ['No pinhole: axial', NO_SECTIONING],
          [`Confocal, ${formatNumber(r.transitionConfocalAu, 3)} AU pinhole: lateral`, r.transitionConfocal.lateralUm, 'µm', 3],
          [`Confocal, ${formatNumber(r.transitionConfocalAu, 3)} AU pinhole: axial`, r.transitionConfocal.axialUm, 'µm', 3],
        ],
      };
    }
    const c = r.closedForm;
    return {
      'res-focus': focus, 'res-light': light,
      'res-compare': [
        { group: 'For comparison: the same objective and wavelengths' },
        ...(r.pinholeAu === null ? [] : [['No pinhole: lateral', r.excitationLateralUm, 'µm', 3], ['No pinhole: axial', NO_SECTIONING]]),
        ['Point pinhole (0 AU): lateral', r.pointPinhole.lateralUm, 'µm', 3], ['Point pinhole (0 AU): axial', r.pointPinhole.axialUm, 'µm', 3],
      ],
      // The axial forms describe a pinhole; without one they do not apply.
      'res-limits': [
        { group: `Closed forms of the Zeiss monograph (mean wavelength ${nm(c.meanNm)})` },
        ['Eq. 3, PH > 1 AU: lateral 0.51 λexc/NA', c.openLateralUm, 'µm', 3],
        ...(r.pinholeAu === null ? [] : [['Eq. 2, PH > 1 AU: axial 0.88 λexc/(n − √(n² − NA²))', c.openAxialUm, 'µm', 3]]),
        ['Eq. 8, PH < 0.25 AU: lateral 0.37 λ̄/NA', c.pointLateralUm, 'µm', 3],
        ['Eq. 7, PH < 0.25 AU: axial 0.64 λ̄/(n − √(n² − NA²))', c.pointAxialUm, 'µm', 3],
        ...(c.sliceUm === null ? [] : [['Eq. 4, PH > 1 AU: optical slice thickness', c.sliceUm, 'µm', 3]]),
      ],
    };
  },
  notes: r => {
    const out = [];
    if (r.linear && r.pinholeAu === null) {
      out.push('Without a pinhole there is no optical sectioning: a one-photon signal is excited in every plane the beam crosses, and a uniform fluorescent layer gives the same total signal at every depth, so the detector cannot tell which depth the light came from. A confocal pinhole, or multiphoton excitation, adds that depth selection.');
      out.push(`The page therefore lists no axial resolution here; that is a choice of what to report. An isolated bead on a dark background still shows an axial profile, ${formatNumber(r.excitationAxialUm, 3)} µm FWHM (the excitation focus). In a real sample the fluorescence above and below the focus adds to it, the same total from every plane, so this width does not tell where the signal came from.`);
    }
    if (r.pinholeAu !== null) {
      out.push(`The pinhole passes ${formatNumber(r.pinholeAu, 3)} AU = ${formatNumber(r.pinholeUm, 3)} µm back-projected to the sample; the physical pinhole is this times the magnification from the sample to the pinhole plane.`);
      if (r.pinholeAu <= 0.25) out.push('Below about 0.25 AU the resolution approaches the point-pinhole limit while the detected signal keeps falling.');
      else if (r.pinholeAu >= 1) out.push('From about 1 AU up, the lateral resolution is set by the excitation spot alone; the pinhole still rejects out-of-focus light.');
      else out.push('Between 0.25 and 1 AU the Zeiss closed forms bracket the result; the computed widths apply to this pinhole.');
      out.push(r.pinholeAu >= 1
        ? 'From 1 AU up, the Zeiss monograph calls the axial FWHM of the pinhole’s detection response the optical slice thickness (its eq. 4): the pinhole, not the excitation, limits how thick a layer contributes.'
        : `Below 1 AU the Zeiss monograph no longer distinguishes the optical section from the axial resolution: the section is the axial FWHM, ${formatNumber(r.axialUm, 3)} µm. The detection response alone is wider.`);
      if (r.na / r.n > 0.5) out.push('Zeiss eq. 4 takes the defocus blur at the pinhole from NA/n, a small-angle estimate, so at this aperture it gives a wider detection response than the computed one.');
    }
    if (r.linear && r.values.detection === 'elastic') out.push('Scattered or reflected light is treated as coming from point-like, incoherent scatterers. A mirror or an interface images coherently and gives narrower axial responses (Zeiss quotes 0.45 instead of 0.64 for a mirror).');
    if (r.linear && r.values.detection === 'raman') out.push(`The Stokes line of a ${formatNumber(r.values.ramanShiftCm, 5)} cm⁻¹ shift lies at ${nm(r.detNm)}.`);
    if (!r.linear) {
      out.push(`The signal follows the ${r.order === 2 ? 'square' : 'cube'} of the excitation intensity, so the point image is the excitation PSF to the power ${r.order}, and the signal is confined to the focus: optical sectioning without a pinhole.`);
      if (!r.signal.harmonic) out.push(`Laterally the point image is narrower than one-photon excitation at the same wavelength and wider than one-photon excitation at λ/${r.order}; one-photon excitation without a pinhole has no optical sectioning.`);
      if (!r.signal.harmonic) {
        out.push(`The one-photon confocal comparison is excited at ${nm(r.transitionConfocalNm)} and detects the emission at ${nm(r.detNm)} through a ${formatNumber(r.transitionConfocalAu, 3)} AU pinhole. One-photon excitation still reaches every plane the beam crosses; only the pinhole rejects their signal.`);
        out.push('About 1 AU is the typical pinhole and, for most fluorescence work, the best compromise between signal and depth discrimination; with weak fluorescence a wider pinhole trades sectioning for signal. These are ideal values: measured confocal resolution often falls short of them, while nonlinear microscopes come close to theirs.');
      }
      if (r.signal.harmonic) out.push(`${r.order === 2 ? 'SHG' : 'THG'} is generated coherently at exactly λ/${r.order} = ${nm(r.detNm)}. The point image applies to a point-like source; extended structures add coherent effects (phase matching, the Gouy phase, forward and backward emission) that are not modelled.`);
    }
    if (r.na / r.n > 0.7) out.push('Above about NA/n = 0.7, the polarization of the focused light widens the real focus along the polarization direction; this scalar model does not include it.');
    out.push('Uniformly filled back aperture, no aberrations, sample index matched to the immersion medium. Deep in tissue or through an index mismatch the focus is wider.');
    return out;
  },
  graphs: r => {
    const p = resolutionProfiles(r);
    return {
      lateral: profileChart(p.lateral, 'Lateral position (µm)'),
      axial: profileChart(p.axial, 'Axial position (µm)'),
    };
  },
  onResult: r => {
    focus.na = r.ok ? r.na : null;
    focus.lateralUm = r.ok ? r.lateralUm : null;
    focus.bandPixelUm = r.ok ? r.bandPixelUm : null;
    scan?.update();
  },
});

const MAPPING = { tan: 'f·tan θ', ftheta: 'f·θ' };
const rampChart = (p, bidirectional) => ({
  x: p.x, xLabel: 'Time (line periods)', xUnit: 'lines', yLabel: 'Command voltage (V)',
  formatX: n => formatNumber(n, 3), formatY: n => formatNumber(n, 4),
  band: { lo: p.lines, hi: p.lines + 1, label: 'Frame flyback' },
  series: [{ name: `Fast axis X (${bidirectional ? 'triangle' : 'sawtooth'})`, color: '--series-1', values: p.fast },
    { name: 'Slow axis Y (one step per line)', color: '--series-2', values: p.slow }],
});
scan = mountCalculator({ panel: 'scan', inputs: SCAN_INPUTS, defaults: SCAN_DEFAULTS, hideInactive: true, groups: {
  objective: { title: 'Objective' }, scan: { title: 'Scan and tube lenses' }, galvo: { title: 'Galvanometer mirror' },
}, compute: raw => computeScan(raw, focus.na ? focus : null), charts: ['scan', 'ramps'],
  rows: r => ({
    'scan-objective': [{ group: 'Objective' },
    ['Focal length f_obj = f_ref / M', r.objectiveMm, 'mm', 4],
    ['Magnification with your tube lens (f_TL / f_obj)', r.systemMagnification, '×', 4],
    ['Field of view (field number / M)', r.objectFieldUm, 'µm', 4],
    ['Back-aperture diameter (2 f_obj NA)', r.pupilMm, 'mm', 3]],
    'scan-spot': [{ group: `Spot displacement for ${formatNumber(r.values.angleDeg, 4)}° (${r.values.angleKind})` },
    ['Optical deflection at the galvo', r.opticalDeg, '°', 4],
    ['Beam angle at the back aperture', r.pupilAngleDeg, '°', 4],
    ['Height in the intermediate image', r.intermediateMm, 'mm', 4],
    ['Displacement at the sample', r.displacementUm, 'µm', 4],
    [`Small-angle slope, per ° ${r.values.angleKind}`, r.umPerDegree, 'µm', 4]],
    'scan-field': [{ group: `Scanned field (${formatNumber(r.values.rangeDeg, 4)}° peak to peak)` },
    ['Field width', r.fieldUm, 'µm', 4], ['Diagonal of a square field', r.diagonalUm, 'µm', 4],
    ['Pixel size', r.pixelUm, 'µm', 3],
    ['Largest pixel, two per lateral FWHM (FWHM / 2)', r.halfFwhmPixelUm, 'µm', 3],
    ['Pixels per line, two per FWHM', r.pixelsNeeded, '', 6],
    ['Largest pixel for the band limit, 1 / (2 f_c)', r.bandPixelUm, 'µm', 3],
    ['Pixels per line for the band limit', r.bandPixelsNeeded, '', 6],
    ['Fast-axis command amplitude (± V)', r.commandAmplitudeV, 'V', 4]],
    'scan-beam': [{ group: 'Beam at the objective' },
    ['Expansion by scan and tube lens (f_TL / f_SL)', r.relay, '×', 4],
    ['Beam diameter at the back aperture (1/e²)', r.beamAtPupilMm, 'mm', 3],
    ['Fill ratio T (beam / aperture)', r.fillRatio, '', 3]],
  }),
  notes: r => {
    const out = [];
    if (r.values.angleKind === 'mechanical') out.push('A mirror turned by θ deflects the beam by 2θ, so the optical angles are twice the entered rotation.');
    if (r.diagonalUm > r.objectFieldUm) {
      out.push(r.fieldUm > r.objectFieldUm
        ? 'The scanned field is wider than the objective’s field of view: expect vignetting and aberrations towards the edges.'
        : 'The corners of a square field lie outside the objective’s field of view: expect vignetting and aberrations there.');
    }
    if (r.halfFwhmPixelUm === null) out.push('The resolution panel has no valid result, so the back aperture, the fill ratio and the sampling rows are not given.');
    else if (r.pixelUm > r.halfFwhmPixelUm) out.push(`Undersampled: the pixels are larger than half the lateral FWHM (${formatNumber(r.lateralUm, 3)} µm). Reduce the scan range or use at least ${r.pixelsNeeded} pixels per line for two pixels per FWHM.`);
    else if (r.pixelUm > r.bandPixelUm) out.push(`The pixels are at most half the lateral FWHM, the practical sampling the Zeiss monograph recommends. The sampling theorem asks for more: this point image passes spatial frequencies up to f_c, so every detail it carries needs pixels of ${formatNumber(r.bandPixelUm, 3)} µm or less (${r.bandPixelsNeeded} per line). Near f_c the contrast is weak, so the gain is small.`);
    else out.push('The pixels are within the band limit of this point image, so the sampling theorem is met for every spatial frequency it passes.');
    if (r.fillRatio !== null) {
      if (r.fillRatio < 0.6) out.push('The beam underfills the back aperture (T below about 0.6): the focus is close to Gaussian and wider than the resolution panel’s uniformly filled aperture.');
      else if (r.fillRatio < 1) out.push('The beam partly underfills the back aperture: the focus lies between a Gaussian and the Airy pattern the resolution panel assumes.');
      else if (r.fillRatio >= 3) out.push('The beam strongly overfills the back aperture: the focus is the Airy pattern, but much of the power is clipped.');
      else out.push('The beam fills the back aperture: the focus is close to the Airy pattern the resolution panel assumes, at the cost of some clipped power.');
    }
    const other = r.values.mapping === 'tan' ? 'ftheta' : 'tan';
    if (r.displacementUm !== 0) out.push(`With an ${MAPPING[other]} scan lens the displacement would be ${formatNumber(r.otherMappingUm, 4)} µm (${formatNumber(100 * (r.otherMappingUm / r.displacementUm - 1), 2)} %).`);
    out.push(r.values.bidirectional
      ? 'Bidirectional: the fast mirror follows a triangle and both sweeps record a line, so no time is lost to a flyback. The mirror lags its command, which shifts the forward lines one way and the return lines the other; the two must be aligned (a phase or delay setting) or vertical edges look jagged.'
      : 'Unidirectional: the fast mirror follows a sawtooth; a line is recorded on the linear ramp only, and the flyback and the turnaround are discarded.');
    out.push('The scan and tube lenses are assumed to image the galvo pivot onto the back aperture, so the beam pivots there without walking off. Relays between two galvos do not change the result if they image at unit magnification.');
    return out;
  },
  graphs: r => {
    const p = scanProfile(r);
    const other = r.values.mapping === 'tan' ? 'ftheta' : 'tan';
    return {
      scan: { x: p.x, xLabel: `Galvo angle, ${r.values.angleKind} (°)`, xUnit: '°', yLabel: 'Displacement at the sample (µm)',
        formatX: n => formatNumber(n, 4), formatY: n => formatNumber(n, 4),
        band: { lo: -r.values.rangeDeg / 2, hi: r.values.rangeDeg / 2, label: 'Scan range' },
        marker: { x: r.values.angleDeg, y: r.displacementUm },
        series: [{ name: `${MAPPING[r.values.mapping]} (selected)`, color: '--series-1', values: p[r.values.mapping] },
          { name: MAPPING[other], color: '--series-3', dash: true, values: p[other] }] },
      ramps: rampChart(scanRamps(r), r.values.bidirectional),
    };
  },
});
