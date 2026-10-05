// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
import { GLASSES } from '../sketch/js/glass.js';
const evidence = 'Equations checked against independent Python references, with published or exact algebraic anchors. These checks do not establish experimental accuracy.';
const coefficientRows = [...GLASSES.values()].map(g => `<tr><th scope="row">${g.label}</th><td>${g.range.join('–')}</td><td>${g.B.join('<br>')}</td><td>${g.C.join('<br>')}</td></tr>`).join('');
export const wavelengthCalculators = [
  {
    slug: 'dispersion', title: 'Sellmeier dispersion curves', script: 'page.js',
    card: 'Plot phase and group indices, GVD and the zero-dispersion crossing for catalogue glasses; calculate GDD through a thickness.',
    summary: 'Explore the wavelength dependence of refractive index and group-velocity dispersion for fused silica, N-BK7, N-SF5 and N-SF11. Set a glass thickness to calculate its group-delay dispersion.',
    facts: [
      { label: 'Model', html: 'Room-temperature, three-term Sellmeier fits; analytic wavelength derivatives. No absorption or temperature correction.' },
      { label: 'Evidence', html: evidence },
      { label: 'Code', html: 'Uses the workbench’s <a href="https://github.com/LucaGenchi/opticalsetup/blob/main/sketch/js/glass.js">glass catalogue and analytic terms</a>, without the tracer’s wavelength cache buckets.' },
    ],
    graphs: [
      { id: 'index', title: 'Phase and group index', note: 'Both curves use the same Sellmeier coefficients. The marker shows the phase index at your wavelength.' },
      { id: 'gvd', title: 'Group-velocity dispersion', note: 'Positive: normal dispersion. Negative: anomalous dispersion. A crossing of zero is the zero-GVD wavelength.' },
    ],
    sections: [
      { id: 'physics', title: 'The dispersion model',
        html: '<p>Use λ in micrometres, dimensionless B coefficients and C coefficients in µm². The input fields use vacuum wavelengths in nm. The same Sellmeier terms used for refraction in the workbench supply these curves.</p>',
        formulas: [{ tex: String.raw`n^2(\lambda)=1+\sum_{j=1}^{3}\frac{B_j\lambda^2}{\lambda^2-C_j}` }],
        html2: '<p>The group index describes envelope propagation; GVD describes the local change of group delay with angular frequency. For the GVD equation below, use wavelength and derivatives in SI, then convert s²/m to fs²/mm. The page handles that conversion.</p>',
        formulas2: [
          { tex: String.raw`n_g=n-\lambda\frac{dn}{d\lambda},\qquad \beta_2=\frac{\lambda^3}{2\pi c^2}\frac{d^2n}{d\lambda^2}` },
          { tex: String.raw`\mathrm{GDD}=L\beta_2`, caption: 'L in mm × β₂ in fs²/mm gives GDD in fs². Thickness does not change the material curves.' },
        ],
      },
      { id: 'coefficients', title: 'Coefficients and supported domains',
        html: `<p>These values come directly from the workbench’s catalogue. Each coefficient column lists terms 1, 2 and 3 in order. SCHOTT supplies the optical-glass fits <a class="cite" href="#ref-1">[1]</a>; fused silica uses Malitson <a class="cite" href="#ref-2">[2]</a>. The intervals are the app’s supported fit domains, not transmission guarantees.</p><div class="table-scroll"><table class="param-table"><thead><tr><th>Glass</th><th>Domain (nm)</th><th>B₁, B₂, B₃</th><th>C₁, C₂, C₃ (µm²)</th></tr></thead><tbody>${coefficientRows}</tbody></table></div>`,
      },
      { id: 'precision', title: 'Precision and limits',
        html: '<p>The calculator evaluates analytic derivatives continuously, without the tracer’s 0.1 nm index or 1 nm GVD buckets. The independent Python reference uses five-point finite differences, including fractional wavelengths and all fit endpoints. Agreement is checked to 10⁻⁷ relative for n, 10⁻⁶ for n<sub>g</sub>, and 2 × 10⁻⁴ for GVD; near zero, an absolute 2 × 10⁻⁴ fs²/mm tolerance is used. Published N-BK7 indices separately anchor the fit with 10⁻⁵ absolute tolerance.</p><p>Unknown glass, non-finite input or wavelengths outside its fit domain give no result. Plot endpoints must be in that domain, at least 1 nm apart. No clamped or extrapolated curve is drawn. Graphs sample 241 wavelengths; hover, use arrow keys, or expand the data tables to read samples. Numerical digits describe the fit, not a real sample’s accuracy.</p><p>No absorption, temperature, stress, coatings, batch tolerances or birefringent crystals are modelled. GDD is a local second-order coefficient; it does not predict an arbitrary broadband pulse shape.</p>',
      },
    ],
    references: [
      { label: 'SCHOTT AG, Optical glass collection data sheets, N-BK7, N-SF5 and N-SF11 dispersion constants.', url: 'https://www.schott.com/shop/medias/schott-optical-glass-collection-datasheets-english-march2018.pdf?context=bWFzdGVyfHJvb3R8NTQwMzA2MXxhcHBsaWNhdGlvbi9wZGZ8aDllL2hlZS84ODE3NDA4ODY4MzgyLnBkZnw2Y2VlYjY0Njk3YzBkYzU4NDliOGMxMzVmNjgwZmRiYzdlYWMxYmJmZDU1NjdmYjIxYzU5MTQ4NmE1YjhmMGQ2' },
      { label: 'I. H. Malitson, “Interspecimen comparison of the refractive index of fused silica,” JOSA 55, 1205 (1965). doi:10.1364/JOSA.55.001205.', url: 'https://doi.org/10.1364/JOSA.55.001205' },
    ],
  },
  {
    slug: 'shg', title: 'Second-harmonic wavelength (SHG)', script: 'page.js', graphs: [],
    card: 'Convert a fundamental wavelength to its second harmonic, or find the fundamental required for a target harmonic.',
    summary: 'Calculate the fundamental and second-harmonic vacuum wavelengths and their frequencies. Choose either wave as the known input.',
    facts: [
      { label: 'Model', html: 'Frequency doubling and vacuum-wavelength conversion. No crystal or efficiency model.' },
      { label: 'Evidence', html: evidence },
      { label: 'Example', html: '1064 nm fundamental → 532 nm second harmonic, the example described by NIST <a class="cite" href="#ref-1">[1]</a>.' },
    ],
    sections: [
      { id: 'physics', title: 'Frequency doubling',
        html: '<p>A second harmonic has twice the fundamental frequency <a class="cite" href="#ref-1">[1]</a>. The vacuum-wavelength relations and conversion to THz are:</p>',
        formulas: [
          { tex: String.raw`\nu_{2\omega}=2\nu_\omega,\qquad \lambda_{2\omega}=\frac{\lambda_\omega}{2},\qquad \lambda_\omega=2\lambda_{2\omega}` },
          { tex: String.raw`\nu\,[\mathrm{THz}]=\frac{299792.458}{\lambda\,[\mathrm{nm}]}` },
        ],
      },
      { id: 'precision', title: 'Precision and limits',
        html: '<p>Finite inputs from 100 to 20000 nm are accepted; calculated outputs may lie outside that input interval. An independent reference computes in Hz and metres and checks both directions to 10⁻⁹ relative, including 1064 → 532 nm and fractional inputs.</p><p>This energy relation does not establish phase matching, transmission, bandwidth, power or conversion efficiency. Wavelengths inside a material also depend on its refractive index; this page reports vacuum wavelengths throughout.</p>',
      },
    ],
    references: [{ label: 'NIST, Frequency Conversion Interfaces for Photonic Quantum Systems.', url: 'https://www.nist.gov/programs-projects/frequency-conversion-interfaces-photonic-quantum-systems' }],
  },
  {
    slug: 'cars', title: 'CARS wavelengths and Raman shift', script: 'page.js', graphs: [],
    card: 'Find Raman shift and anti-Stokes wavelength from pump and Stokes, or solve for Stokes from a target Raman shift; optional distinct probe.',
    summary: 'Convert between pump/Stokes wavelengths and Raman shift in cm⁻¹, then calculate the coherent anti-Stokes Raman scattering wavelength for a shared or distinct probe.',
    facts: [
      { label: 'Model', html: 'Positive pump–Stokes difference frequency; anti-Stokes frequency = probe frequency + vibrational frequency.' },
      { label: 'Evidence', html: evidence },
      { label: 'Example', html: '800 nm pump + 1000 nm Stokes → 2500 cm⁻¹ Raman shift; with the pump as probe, anti-Stokes is 666.667 nm.' },
    ],
    sections: [
      { id: 'physics', title: 'Pump, Stokes and probe',
        html: '<p>Pump and Stokes excite a vibrational coherence at their difference frequency; a probe produces an anti-Stokes wave <a class="cite" href="#ref-1">[1]</a>. With all wavelengths in vacuum nm, the Raman wavenumber shift is in cm⁻¹:</p>',
        formulas: [
          { tex: String.raw`\Delta\tilde\nu=10^7\left(\frac{1}{\lambda_p}-\frac{1}{\lambda_s}\right),\qquad \nu_{\mathrm{as}}=\nu_{\mathrm{probe}}+\nu_p-\nu_s` },
          { tex: String.raw`\frac{1}{\lambda_{\mathrm{as}}}=\frac{1}{\lambda_{\mathrm{probe}}}+\frac{1}{\lambda_p}-\frac{1}{\lambda_s}` },
        ],
        html2: '<p>Untick “Use a distinct probe” for two-color CARS, where the pump also probes. Enter a target Raman shift to find Stokes instead:</p>',
        formulas2: [{ tex: String.raw`\lambda_s=\frac{10^7}{10^7/\lambda_p-\Delta\tilde\nu},\qquad \nu_{\mathrm{Raman}}\,[\mathrm{THz}]=0.0299792458\,\Delta\tilde\nu\,[\mathrm{cm}^{-1}]` }],
      },
      { id: 'precision', title: 'Precision and limits',
        html: '<p>Wavelength inputs are limited to 100–20000 nm and shifts to positive values up to 10000 cm⁻¹. Equal or shorter Stokes wavelengths, impossible shifts, and an inferred Stokes beyond 20000 nm give no result. Calculated anti-Stokes outputs may lie outside the wavelength input interval.</p><p>Both modes and distinct-probe cases are checked against independent SI frequency arithmetic to 10⁻⁹ relative. The exact 800/1000 nm example separately anchors wavelength and wavenumber units.</p><p>Frequency relations only: resonance strengths, linewidths, nonresonant background, phase matching, polarization, pulse overlap and signal intensity are outside this model.</p>',
      },
    ],
    references: [{ label: 'NIST, Broadband Coherent Anti-Stokes Raman Scattering Microscopy, excitation and probe frequency relations.', url: 'https://www.nist.gov/programs-projects/broadband-coherent-anti-stokes-raman-scattering-bcars-microscopy' }],
  },
];
