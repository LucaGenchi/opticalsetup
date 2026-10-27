// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// The dispersion compensation calculator's page content, built by
// tools/build-calculators.mjs (see tools/calculators-content.mjs for the
// rules). Numbers quoted here are the page's own defaults, checked by
// test/compressor-calculator.test.js.

const cite = (...n) => n.map(k => `<a class="cite" href="#ref-${k}">[${k}]</a>`).join('');
const GITHUB = 'https://github.com/LucaGenchi/opticalsetup/blob/main';

export const compressorCalculators = [
  {
    slug: 'dispersion-compensation', title: 'Dispersion compensation', script: 'page.js',
    card: 'Prism pairs, four-prism lines, grating pairs and a grating stretcher: GDD, TOD and FOD from the geometry, the separation that cancels a chirp, the output pulse, and the bench drawn to scale as you change it.',
    summary: 'Choose a prism or grating layout, the pulse and the chirp it carries; the page solves the separation (or takes yours), draws the bench to scale with the canvas’s own tracer, and gives the compensator’s GDD, TOD and FOD, the output pulse from every order of the phase, the colours’ spread and the transmission.',
    facts: [
      { label: 'Model', html: 'Exact plane-wave phase of each layout along the central ray: Fork, Martinez and Gordon’s apex path for prisms, Treacy’s for gratings, Martinez’s equivalent pair for the stretcher (paraxial). The output pulse is the Fourier transform of the spectrum with every order of the phase.' },
      { label: 'Evidence', html: `Checked against an independent program in 40-digit arithmetic, with its own geometry, ray tracing and derivatives: GDD, TOD, the solved separation and the transmission agree to 10⁻⁹, FOD to 2 × 10⁻³ (<a href="${GITHUB}/docs/validation.md" target="_blank" rel="noopener">validation table</a>). As an outside check, Light Conversion’s online compressor calculators ${cite(6)} give the same grating-pair GDD and TOD, and the same prism-pair GDD to 5 × 10⁻⁴.` },
      { label: 'Code', html: `<a href="${GITHUB}/calculators/dispersion-compensation/compressor-model.js" target="_blank" rel="noopener">compressor-model.js</a> builds the bench from the canvas’s own elements (prism, grating, lens, mirror, beamsplitter) and glass catalogue; “Open in the canvas” opens that scene.` },
    ],
    layout: [
      { form: 'calc', preview: 'Open in the canvas', results: 'key', resultsLabel: 'Key results', label: 'Dispersion compensator' },
      { output: true, label: 'Results', results: [['geometry', 'The bench'], ['dispersion', 'Dispersion'], ['pulse', 'Pulse duration'], ['transmission', 'Transmission']] },
      { graphs: true },
    ],
    graphs: [
      { id: 'gdd', title: 'GDD across the spectrum', note: 'The compensator’s GDD, the input’s and their sum. A flat net curve at zero means a short output; its tilt is the residual TOD.' },
      { id: 'scan', title: 'Output duration against the separation', note: 'Every order of the phase (solid) and GDD only (dashed). The marker is the bench shown.' },
      { id: 'pulse', title: 'The output pulse', note: 'Intensity against time, with the transform limit and, when it fits, the input.' },
    ],
    sections: [
      {
        id: 'physics',
        title: 'The physics',
        html: `<p>A pulse’s spectral phase φ(ω), expanded about its central frequency ω₀, sets its shape in time. The linear term is a delay; the quadratic one, the group delay dispersion (GDD), is a linear chirp; the third- and fourth-order terms (TOD and FOD) distort the pulse further. Glass, lenses and fibres add positive GDD at visible and near-infrared wavelengths. A compensator adds the opposite.</p>`,
        formulas: [
          { tex: String.raw`\varphi(\omega)=\varphi_0+\tau_g\,\Delta\omega+\frac{\mathrm{GDD}}{2}\Delta\omega^2+\frac{\mathrm{TOD}}{6}\Delta\omega^3+\frac{\mathrm{FOD}}{24}\Delta\omega^4+\dots,\qquad \Delta\omega=\omega-\omega_0` },
        ],
        html2: `<p><b>Prism pair.</b> Each colour leaves the first prism in its own direction u(ω) and is made parallel again by the second, identical prism, turned the other way. Fork, Martinez and Gordon showed that the phase between a wavefront before the first prism and one after the second equals that of a virtual ray from apex A of the first to the wavefront through apex B of the second ${cite(1)}: no glass on that ray, only the projection of the apex-to-apex vector on the colour’s direction. Moving a prism into the beam moves its apex, which is how insertion adds glass. The page evaluates this exactly, with the colour’s direction from Snell’s law at both faces:</p>`,
        formulas2: [
          { tex: String.raw`\varphi(\omega)=\frac{\omega}{c}\,(\mathbf B-\mathbf A)\cdot\mathbf u(\omega),\qquad \delta(\omega)=\theta_1+\arcsin\!\big(n\sin(\alpha-\arcsin(\sin\theta_1/n))\big)-\alpha`, caption: 'u turns from the input direction by the deviation δ, with n = n(ω) the glass’s index, α the apex angle and θ₁ the angle of incidence. A Brewster-cut prism at minimum deviation has tan θ₁ = n and α = π − 2θ₁ at the central wavelength.' },
        ],
        html3: `<p><b>Grating pair.</b> Treacy’s compressor ${cite(2)}: two parallel gratings a perpendicular distance G apart, used in order −1. In the plane-wave form used here the phase is</p>`,
        formulas3: [
          { tex: String.raw`\varphi(\omega)=\frac{\omega}{c}\,G\cos\beta(\omega),\qquad \sin\beta=\frac{\lambda}{d}-\sin\gamma,\qquad \mathrm{GDD}=-\frac{\lambda^3 G}{2\pi c^2 d^2\cos^3\beta}`, caption: 'γ is the angle of incidence, β the diffraction angle, d the groove spacing. The GDD is Treacy’s explicit form, which the page’s derivative reproduces.' },
        ],
        html4: `<p><b>Grating stretcher.</b> Two gratings with two lenses of focal length f between them, 2f apart, each grating a distance s from its lens: the lenses image one grating onto the other, and the pair acts like a grating pair of separation (s₁ + s₂ − 2f) cos β ${cite(3)}. With the gratings inside the focal planes that is negative, and the GDD positive: the stretcher of a chirped-pulse amplifier ${cite(4, 5)}. This holds to paraxial order in ideal thin lenses without glass; in the canvas the lenses also carry an estimated thickness of N-BK7, whose GDD it adds.</p>`,
        formulas4: [
          { tex: String.raw`G_\text{eq}=(s_1+s_2-2f)\cos\beta_0` },
        ],
        html5: `<p><b>Double pass and sequences.</b> Sending the light back through the same pair, or through a mirror-image second pair, doubles the phase and makes the colours coincide again: a single pass leaves them side by side (spatial chirp). The double pass ends on a flat mirror square to the beam: after one pass of a pair the colours travel parallel, so each meets the mirror at normal incidence and comes back along its own path. The return is the time reverse of the first pass, so the GDD is exactly twice one pass and the colours that one pass left side by side meet again: the beam leaves with the diameter it came in with. In the plane of the figure the return retraces the input, so a beamsplitter takes it out; in the lab the end mirror is tipped slightly out of the plane and a pickoff mirror just above the input takes the return without loss, which leaves the in-plane geometry, and so the dispersion, unchanged. A four-element sequence is two pairs, the second the mirror image of the first; between the pairs the colours travel parallel, so the gap does not change the phase.</p>
<p><b>Derivatives and the solve.</b> The phase is evaluated in Taylor arithmetic to third order in ω, so GDD and TOD are exact up to rounding; FOD comes from fourth differences of the exact phase. Each layout’s phase is linear in its separation (L, G or s), so the separation that brings the net GDD to the target follows exactly from two evaluations.</p>`,
        html6: `<p><b>The output pulse.</b> The spectrum (Gaussian or sech² intensity with the FWHM entered) carries the input phase plus the compensator’s, every order; the pulse is its Fourier transform and the duration the FWHM of |E(t)|². The input phase is either a material’s, from its published dispersion fit (the material calculator’s data), or the GDD, TOD and FOD entered. The GDD-only duration, for comparison, is the analytic one:</p>`,
        formulas6: [
          { tex: String.raw`E(t)\propto\int\sqrt{S(\omega)}\;e^{\,i[\varphi_\text{in}(\omega)+\varphi_\text{comp}(\omega)]}\,e^{-i\omega t}\,d\omega,\qquad \tau_\text{GDD}=\tau_0\sqrt{1+\big(4\ln2\,\mathrm{GDD}/\tau_0^2\big)^2}`, caption: 'Gaussian; sech² uses its own analytic form, as the canvas does. τ₀ is the transform limit, 0.441 λ²/(cΔλ) for a Gaussian and 0.315 λ²/(cΔλ) for sech².' },
        ],
        html7: `<p><b>Spread and transmission.</b> The colours of the FWHM band arrive at the second prism a distance L |δ(λ₁) − δ(λ₂)| apart, and at the second grating G |tan β₁ − tan β₂| apart; with the beam diameter that sets the aperture the second optic needs. Uncoated prism faces transmit by Fresnel’s formulas for the polarization chosen, at each face’s angle (see <a href="${GITHUB}/docs/physics/prism-fresnel.md" target="_blank" rel="noopener">prism Fresnel</a>); at Brewster’s angle p-polarized light crosses without loss. Gratings transmit the efficiency entered once per diffraction.</p>`,
      },
      {
        id: 'layouts',
        title: 'Choosing a layout',
        html: `<p>The defaults show the trade-offs; each number below is the page’s own for that bench.</p>
<ul>
  <li><b>Prism pairs are weak but clean.</b> The fused-silica pair adds −2.2 fs² per mm of separation in double pass at 800 nm, so cancelling 10 mm of N-BK7 takes about 70 cm. A flint (the four N-SF10 prisms) adds −18 fs² per mm. Brewster-cut and p-polarized, the prisms lose nothing to reflection. Sliding the second prism in or out tunes the GDD continuously without moving the beam.</li>
  <li><b>Prisms take back part of the glass’s TOD.</b> Glass adds positive GDD and positive TOD; a prism pair adds negative GDD with negative TOD, so it removes part of the glass’s TOD with its GDD. A strongly dispersive flint removes more TOD than the glass brought: on the four-prism default the output (34.8 fs) stays above the transform limit (31.4 fs) because of the TOD left over.</li>
  <li><b>Grating pairs are strong.</b> The 1200 lines/mm pair at 45° adds about −2900 fs² per mm of separation in double pass, enough to recompress a pulse stretched to 88 ps in 35 cm. Its TOD is positive with negative GDD: matched to a grating stretcher of the same gratings and angle, it cancels the stretcher’s TOD and FOD too, which is how chirped-pulse amplifiers recompress ${cite(4, 5)}. Each diffraction loses a little (92 % per bounce on the defaults: 72 % for four bounces).</li>
  <li><b>Gratings and glass add TOD of the same sign.</b> On the fibre default (20 m of fused silica at 1030 nm, four gratings) the GDD cancels but the TOD adds up, and the output (205 fs) stays well above the transform limit (139 fs). Prisms, or a combination of prisms and gratings, are the usual remedy; this page models each separately.</li>
  <li><b>Near Littrow the gratings are most efficient but the beams overlap.</b> In the plane of the figure the beam leaving the second grating runs back across the first; real compressors separate the beams in height. The page draws the bench further from the source where it can, and says so where no in-plane layout works. The numbers do not depend on the drawing.</li>
</ul>`,
      },
      {
        id: 'parameters',
        title: 'Every parameter',
        parameterTable: true,
        html: '<p>Inputs first, then what the page derives.</p>',
        rows: [
          ['λ₀, Δλ', 'Central wavelength, bandwidth', 'nm', 'Vacuum wavelength and spectral FWHM. The transform limit follows from them and the shape.'],
          ['—', 'Chirp to compensate', '—', 'None; a material and its length (every order of its published dispersion); or entered GDD, TOD and FOD.'],
          ['—', 'Polarization', 'p or s', 'p is in the plane of the figure. Sets the prisms’ Fresnel loss.'],
          ['α, θ₁', 'Apex angle, angle of incidence', '°', 'Brewster cut: α = π − 2θ_B and θ₁ = θ_B at λ₀, with tan θ_B = n(λ₀). Otherwise set by hand.'],
          ['L', 'Prism separation', 'mm', 'Along the central ray, from the first prism’s exit to the second’s entrance.'],
          ['—', 'Glass in prism 1, 2', 'mm', 'The central ray’s path in each prism. Sets where the apexes sit.'],
          ['1/d, γ', 'Line density, angle of incidence', 'lines/mm, °', 'Reflective gratings in order −1. Littrow: sin γ = λ/(2d).'],
          ['G', 'Grating separation', 'mm', 'Perpendicular distance between the faces; the slant distance along the ray is G / cos β.'],
          ['f, s', 'Lens focal length, grating to lens', 'mm', 'The stretcher: s &lt; f gives positive GDD, s = f none.'],
          ['—', 'Target net GDD', 'fs²', 'What the solve aims at: 0 for a compressor, a positive value for a stretcher.'],
          ['GDD, TOD, FOD', 'Compensator dispersion', 'fs², fs³, fs⁴', 'Derivatives of its phase at ω₀.'],
          ['—', 'Output duration', 'fs', 'FWHM of the Fourier-transformed pulse, every order of the phase; and the GDD-only analytic value.'],
          ['—', 'Colour spread, aperture', 'mm', 'Of the FWHM band on the second optic; the aperture adds the beam diameter (and the grating footprint).'],
          ['T', 'Transmission', '%', 'Fresnel losses of the prism faces, or grating efficiency per diffraction. Mirrors are lossless here.'],
        ],
      },
      {
        id: 'graphs',
        title: 'Reading the graphs',
        html: `<p><b>1. GDD across the spectrum.</b> The compensator’s GDD (blue), the input’s (dashed) and the net (green) from 1.5 bandwidths below to 1.5 above the centre; the yellow band is the FWHM. At the centre the net is the target. A sloped net curve is residual TOD, a curved one residual FOD.</p>
<p><b>2. Output duration against the separation.</b> The bench recomputed at other separations around the one shown. The minimum of the solid curve is the shortest pulse this layout gives; with TOD left over it lies slightly away from zero net GDD, where the dashed GDD-only curve has its minimum. Far from it only the dashed curve is drawn, because the pulse is long.</p>
<p><b>3. The output pulse.</b> Its intensity in time, peak 1, against the transform limit. Satellites on one side are the mark of TOD.</p>`,
      },
      {
        id: 'precision',
        title: 'How precise is it?',
        html: `<h3>Numerical precision</h3>
<table class="param-table">
  <thead><tr><th>Quantity</th><th>Checked against</th><th>Agreement</th></tr></thead>
  <tbody>
    <tr><td>GDD, TOD, the solved separation and the transmission</td><td>An independent program in 40-digit arithmetic, with its own geometry, ray tracing and derivatives, on seven benches: both prism layouts, both grating layouts and the stretcher, in p and s light (<a href="${GITHUB}/docs/validation.md" target="_blank" rel="noopener">validation table</a>)</td><td>10⁻⁹</td></tr>
    <tr><td>FOD</td><td>The same program</td><td>2 × 10⁻³: the page takes the FOD from differences of its phase in double precision</td></tr>
    <tr><td>Grating-pair GDD</td><td>Treacy’s explicit formula ${cite(2)}</td><td>10⁻¹⁰</td></tr>
    <tr><td>GDD and TOD of grating and prism pairs, double pass</td><td>Light Conversion’s two-prism and grating-pair compressor calculators ${cite(6)}, on benches matched in geometry (perpendicular grating separation; glass in each prism and the path between them)</td><td>grating pairs identical to 10⁻¹¹; prism pairs GDD within 5 × 10⁻⁴ and TOD within 1 % in fused silica, where both use the same index fit (the residual is consistent with numerical derivatives of the index on their side)</td></tr>
    <tr><td>Output duration</td><td>The analytic Gaussian and sech² durations when the phase is pure GDD</td><td>10⁻³</td></tr>
  </tbody>
</table>
<p>The page shows dispersion to the nearest fs², fs³ or fs⁴ and durations to the nearest fs (a tenth of a fs below 10 fs): the computation is far more precise than that, but the glass data and the plane-wave model hold no more.</p>
<h3>Physical accuracy</h3>
<p>The phase is exact for plane waves and ideal optics: flat faces, perfect gratings, the glass’s published index. Real compressors depart from it through the beam’s finite size (each part of the beam crosses a different amount of glass), surface and grating errors, misalignment (a prism pair whose faces are not exactly parallel leaves angular dispersion) and the gratings’ groove density tolerance. The page is a design aid for the geometry and the orders of the phase; align and measure the real one.</p>`,
      },
      {
        id: 'limits',
        title: 'What is not modelled',
        html: `<ul>
  <li>Beam size and diffraction: everything is along the central ray of each colour.</li>
  <li>Grisms, chirped mirrors, and prisms combined with gratings in one compressor.</li>
  <li>Grating efficiency against wavelength, angle and polarization: one number per diffraction.</li>
  <li>Absorption in the glass, coatings, mirror losses.</li>
  <li>Thick or real lenses in the stretcher, and their glass: ideal thin lenses, to paraxial order in the page’s numbers.</li>
  <li>Nonlinear effects in the material carrying the chirp (self-phase modulation in a fibre, for instance).</li>
</ul>`,
      },
    ],
    references: [
      { label: 'R. L. Fork, O. E. Martinez and J. P. Gordon, “Negative dispersion using pairs of prisms”, Opt. Lett. 9, 150 (1984)', url: 'https://doi.org/10.1364/OL.9.000150' },
      { label: 'E. B. Treacy, “Optical pulse compression with diffraction gratings”, IEEE J. Quantum Electron. 5, 454–458 (1969)', url: 'https://doi.org/10.1109/JQE.1969.1076303' },
      { label: 'O. E. Martinez, “3000 times grating compressor with positive group velocity dispersion: application to fiber compensation in 1.3–1.6 µm region”, IEEE J. Quantum Electron. 23, 59–64 (1987)', url: 'https://doi.org/10.1109/JQE.1987.1073201' },
      { label: 'D. Strickland and G. Mourou, “Compression of amplified chirped optical pulses”, Opt. Commun. 56, 219–221 (1985)', url: 'https://doi.org/10.1016/0030-4018(85)90120-8' },
      { label: 'M. Pessot, P. Maine and G. Mourou, “1000 times expansion/compression of optical pulses for chirped pulse amplification”, Opt. Commun. 62, 419–421 (1987)', url: 'https://doi.org/10.1016/0030-4018(87)90011-3' },
      { label: 'Light Conversion, Optics Toolbox: two-prism compressor and grating-pair compressor calculators, used here as an outside check of the results', url: 'https://toolbox.lightcon.com/tools/prismpair' },
    ],
  },
];
