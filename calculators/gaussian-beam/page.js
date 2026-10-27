// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { GAUSSIAN_INPUTS, GAUSSIAN_DEFAULTS, computeGaussianBeam, gaussianScan } from './gaussian-beam.js';
import { mountCalculator } from '../assets/simple-calculator-page.js';
import { formatNumber } from '../assets/calculator-kit.js';

// A length in µm, shown in mm once it passes 1 mm.
const length = um => (Math.abs(um) >= 1000 ? [um / 1000, 'mm'] : [um, 'µm']);
const row = (label, um, digits) => [label, ...length(um), digits];

mountCalculator({ inputs: GAUSSIAN_INPUTS, defaults: GAUSSIAN_DEFAULTS, groups: {
  beam: { title: 'Beam' }, position: { title: 'Where to read it', form: 'lens-form' }, lens: { title: 'Thin lens', form: 'lens-form', optional: true },
}, compute: computeGaussianBeam, hideInactive: true,
  rows: r => {
    const v = r.values, b = r.input, tem00 = v.m2 === 1, lens = r.lens;
    const at = r.at;
    return {
      beam: [{ group: 'The beam at its waist' },
        row('Waist radius w₀', b.waistUm), row('Waist diameter 2w₀', 2 * b.waistUm),
        ['Rayleigh range z_R', b.rayleighMm, 'mm'], ['Depth of focus 2z_R', 2 * b.rayleighMm, 'mm'],
        ['Divergence, half angle θ', b.halfDivergenceMrad, 'mrad'], ['Divergence, full angle 2θ', 2 * b.halfDivergenceMrad, 'mrad'],
        ['Beam parameter product w₀θ', b.bppMmMrad, 'mm·mrad'],
        ...(r.waistIntensityWcm2 ? [['Peak intensity at the waist', r.waistIntensityWcm2, 'W/cm²', 4]] : [])],
      focus: lens ? [{ group: `After the ${lens.focalMm > 0 ? 'converging' : 'diverging'} lens` },
        row('New waist radius', lens.output.waistUm), row('New waist diameter', 2 * lens.output.waistUm),
        lens.distanceMm >= 0 ? ['Waist distance after the lens', lens.distanceMm, 'mm'] : ['Virtual waist, before the lens', -lens.distanceMm, 'mm'],
        ['New Rayleigh range', lens.output.rayleighMm, 'mm'], ['New divergence, full angle', 2 * lens.output.halfDivergenceMrad, 'mrad'],
        ['Magnification w₀′/w₀', lens.magnification, '', 4], row('Beam radius at the lens', lens.lensRadiusUm)] : [],
      calc: [{ group: `At z = ${formatNumber(v.zMm, 6)} mm${at.after ? ', after the lens' : ''}` },
        row('Beam radius w', at.radiusUm), row('Beam diameter 2w (1/e²)', 2 * at.radiusUm),
        ...(tem00 ? [row('Diameter at half maximum', 2 * at.radiusUm * Math.sqrt(Math.log(2) / 2))] : []),
        at.after ? ['Ratio to the new waist w/w₀′', at.radiusUm / lens.output.waistUm, '', 4] : ['Ratio to the waist w/w₀', at.radiusUm / b.waistUm, '', 4],
        Number.isFinite(at.curvatureMm) ? ['Wavefront radius of curvature R', at.curvatureMm, 'mm'] : ['Wavefront radius of curvature R', 'flat (at the waist)'],
        ...(r.gouyDeg !== null ? [['Gouy phase from the waist', r.gouyDeg, '°', 4]] : []),
        ...(r.peakIntensityWcm2 ? [['Peak intensity', r.peakIntensityWcm2, 'W/cm²', 4]] : [])],
    };
  },
  notes: r => {
    const v = r.values, out = [];
    out.push(v.m2 === 1 ? 'An ideal TEM₀₀ Gaussian beam: widths are 1/e² intensity radii.'
      : `M² = ${formatNumber(v.m2, 4)}: the embedded-Gaussian rule (λ → M²λ) gives the second-moment width and divergence. The profile is not Gaussian, so the half-maximum diameter, peak intensity and Gouy phase are not given.`);
    if (v.index !== 1) out.push(`In a medium of index ${formatNumber(v.index, 4)}: the wavelength there is λ/n, which lengthens the Rayleigh range and narrows the divergence by n.`);
    if (r.lens) {
      const { lens } = r;
      // A beam that reaches the lens nearly collimated (within one Rayleigh
      // range of its waist) would focus at f by ray optics.
      if (lens.focalMm > 0 && lens.distanceMm > 0 && lens.positionMm < r.input.rayleighMm) {
        const shift = lens.focalMm - lens.distanceMm;
        if (Math.abs(shift) > 1e-3 * lens.focalMm) out.push(`The beam reaches the lens nearly collimated, yet its new waist is ${formatNumber(Math.abs(shift), 3)} mm ${shift > 0 ? 'short of' : 'beyond'} the focal point: a Gaussian beam focuses at f only when its Rayleigh range at the lens is long compared with f.`);
      }
      if (lens.distanceMm < 0) out.push('The output beam diverges from a virtual waist before the lens: no real focus.');
      if (lens.output.halfDivergenceMrad > 100) out.push(`The focused beam converges at a half angle of ${formatNumber(lens.output.halfDivergenceMrad, 3)} mrad: beyond about 0.1 rad the paraxial formulas understate the focal spot.`);
      out.push('An ideal thin lens: no aberrations, and no clipping. An aperture of radius a passes 1 − exp(−2a²/w²) of a TEM₀₀ beam: 99 % at a = 1.52 w, 99.99 % at a = 2.15 w, where w is the beam radius at the lens.');
    }
    return out;
  },
  graphs: r => {
    const scan = gaussianScan(r), x = scan.map(p => p.zMm);
    const big = Math.max(...scan.map(p => p.radiusUm)) >= 2000;
    const unit = big ? 'mm' : 'µm', k = big ? 1e-3 : 1;
    const vlines = [{ x: 0, label: 'waist' }];
    if (r.lens) {
      vlines.push({ x: r.lens.positionMm, label: 'lens' });
      // Labelled only when it sits clear of the lens line (8 % of the plot).
      if (r.lens.distanceMm > 0.08 * (x.at(-1) - x[0])) vlines.push({ x: r.lens.positionMm + r.lens.distanceMm, label: 'new waist' });
    }
    return {
      caustic: { x, xLabel: 'Distance from the input waist z (mm)', xUnit: 'mm', yLabel: `Beam radius w (${unit})`, yMin: 0,
        series: [{ name: 'Beam radius w(z)', color: '--series-1', fill: 'light', values: scan.map(p => p.radiusUm * k) }],
        vlines, marker: { x: r.values.zMm, y: r.at.radiusUm * k },
        formatX: n => formatNumber(n, 4), formatY: n => formatNumber(n, 4) },
      curvature: { x, xLabel: 'Distance from the input waist z (mm)', xUnit: 'mm', yLabel: 'Wavefront curvature 1/R (1/m)',
        series: [{ name: 'Curvature 1/R', color: '--series-1', values: scan.map(p => 1000 / p.curvatureMm) }],
        vlines, marker: { x: r.values.zMm, y: 1000 / r.at.curvatureMm },
        formatX: n => formatNumber(n, 4), formatY: n => formatNumber(n, 4) },
    };
  },
});
