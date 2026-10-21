// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Content of the dispersion, nonlinear-conversion and coherent-Raman pages.
import { MATERIALS } from '../calculators/dispersion/materials.js';

const cite = (...n) => n.map(k => `<a class="cite" href="#ref-${k}">[${k}]</a>`).join('');
const evidence = 'Equations checked against independent Python references, with published or exact algebraic anchors. These checks do not establish experimental accuracy.';

// Dispersion page: one numbered reference per primary source.
const DISPERSION_REFS = {
  schott: 1, malitson1965: 2, malitson1963: 3, malitson1972: 4, ghosh1999: 5, tamosauskas2018: 6,
  zelmon1998: 7, connolly1979: [8, 9], salzberg1957: [10, 9], daimon2007: 11, ciddor1996: 12,
};
const formulaText = m => m.form === 'gas' ? 'n − 1 = Σ B/(C − λ⁻²)' : `n² − 1 = ${m.A ? 'A + ' : ''}Σ Bλ²/(λ² − C)`;
const coefficientCell = m => [
  ...(m.A ? [`A = ${m.A}`] : []),
  ...m.terms.map(([B, C], i) => `B${i + 1} = ${B}, C${i + 1} = ${+C.toPrecision(10)}`),
].join('<br>');
const materialRows = [...MATERIALS.values()].map(m => `<tr><th scope="row">${m.label}</th><td>${formulaText(m)}</td><td>${coefficientCell(m)}</td><td>${m.range.join('–')}</td><td>${m.conditions}</td><td>${cite(...[DISPERSION_REFS[m.ref]].flat())}</td></tr>`).join('\n');

export const wavelengthCalculators = [
  {
    slug: 'dispersion', title: 'Material dispersion', script: 'page.js',
    card: 'Refractive and group index, GVD and TOD for optical glasses, crystals, water and air; GDD, TOD and pulse stretching for a laser bandwidth.',
    summary: 'Choose a material and thickness, then the laser’s central wavelength and bandwidth. Read the phase and group index, group-velocity and third-order dispersion, the GDD and TOD the material introduces, and how much a transform-limited pulse stretches.',
    facts: [
      { label: 'Model', html: 'Published room-temperature dispersion fits with analytic derivatives to third order. No absorption, temperature or stress correction.' },
      { label: 'Evidence', html: evidence },
      { label: 'Code', html: 'The <a href="https://github.com/LucaGenchi/opticalsetup/blob/main/calculators/dispersion/materials.js">calculator’s material module</a>; the four workbench glasses reuse the <a href="https://github.com/LucaGenchi/opticalsetup/blob/main/sketch/js/glass.js">canvas catalogue</a>’s coefficients.' },
    ],
    graphs: [
      { id: 'index', title: 'Phase and group index', note: 'The marker shows the phase index at the central wavelength; the shaded band is the laser bandwidth.' },
      { id: 'gvd', title: 'Group-velocity dispersion', note: 'Positive: normal dispersion. Negative: anomalous. A crossing of zero is the zero-GVD wavelength.' },
      { id: 'tod', title: 'Third-order dispersion', note: 'The wavelength dependence of GVD, which compressors must also cancel for short pulses.' },
    ],
    plotControls: { title: 'Plot range' },
    sections: [
      { id: 'physics', title: 'The dispersion model',
        html: `<p>Each material is described by its source’s dispersion formula, with λ in micrometres. Solids and water use the Sellmeier form, C in µm² and an optional constant A; air uses Ciddor’s form for n − 1 ${cite(12)}. The input fields take vacuum wavelengths in nm.</p>`,
        formulas: [{ tex: String.raw`n^2(\lambda)-1=A+\sum_j\frac{B_j\lambda^2}{\lambda^2-C_j},\qquad n_{\text{air}}(\lambda)-1=\sum_j\frac{B_j}{C_j-\lambda^{-2}}` }],
        html2: '<p>The group index describes how the envelope travels. GVD and TOD are the second and third derivatives of the propagation constant k = nω/c with respect to angular frequency, written here in wavelength derivatives. The page evaluates the derivatives analytically and converts β₂ to fs²/mm and β₃ to fs³/mm.</p>',
        formulas2: [
          { tex: String.raw`n_g=n-\lambda\frac{dn}{d\lambda},\qquad \beta_2=\frac{d^2k}{d\omega^2}=\frac{\lambda^3}{2\pi c^2}\frac{d^2n}{d\lambda^2}` },
          { tex: String.raw`\beta_3=\frac{d^3k}{d\omega^3}=-\frac{\lambda^4}{4\pi^2c^3}\left(3\frac{d^2n}{d\lambda^2}+\lambda\frac{d^3n}{d\lambda^3}\right)` },
          { tex: String.raw`\mathrm{GDD}=L\beta_2,\qquad \mathrm{TOD}=L\beta_3`, caption: 'L in mm × β in fs²/mm or fs³/mm gives fs² or fs³.' },
        ],
      },
      { id: 'pulse', title: 'The laser bandwidth',
        html: '<p>The bandwidth Δλ is the spectral FWHM. The delay spread is the group-delay difference between the two band edges, taken from the group index at each edge rather than from GDD × Δω, so it stays exact for the material curve over a broad band. A positive value means the blue edge arrives last.</p>',
        formulas: [{ tex: String.raw`\Delta\tau=\frac{L}{c}\left[n_g\!\left(\lambda_0-\tfrac{\Delta\lambda}{2}\right)-n_g\!\left(\lambda_0+\tfrac{\Delta\lambda}{2}\right)\right]` }],
        html2: '<p>The input pulse is assumed transform-limited. Its duration comes from the time–bandwidth product K (0.441 for Gaussian, 0.315 for sech² pulses) in the small-bandwidth form used throughout the workbench. A Gaussian pulse stretched by GDD has the closed form below. For sech² pulses the page uses the workbench’s converged Fourier-propagation table. Both include GDD only: TOD is listed but not included in the output duration.</p>',
        formulas2: [{ tex: String.raw`\tau_0=K\frac{\lambda_0^2}{c\,\Delta\lambda},\qquad \tau_{\text{Gauss}}=\tau_0\sqrt{1+\left(\frac{4\ln2\;\mathrm{GDD}}{\tau_0^2}\right)^2}` }],
      },
      { id: 'materials', title: 'Materials, coefficients and sources',
        html: `<p>Coefficients were transcribed from the refractiveindex.info database ${cite(13)}, which is in the public domain (CC0), and are attributed to the primary source of each fit. SCHOTT glasses follow the manufacturer’s catalogue ${cite(1)}. The domain is the source’s fit range, not a transmission guarantee: silicon, for example, absorbs below about 1.1 µm, and the page refuses wavelengths outside each domain instead of extrapolating.</p><div class="table-scroll"><table class="param-table"><thead><tr><th>Material</th><th>Formula (λ in µm)</th><th>Coefficients</th><th>Domain (nm)</th><th>Conditions</th><th>Source</th></tr></thead><tbody>\n${materialRows}\n</tbody></table></div><p>Fused silica, N-BK7, N-SF5 and N-SF11 are the canvas catalogue’s own entries, so this page and the tracer evaluate the same curves. The ordinary and extraordinary entries of sapphire, quartz and BBO are principal indices: they hold for light polarized perpendicular or parallel to the optic axis. A beam at another angle in a uniaxial crystal sees an angle-dependent extraordinary index, which is not modelled.</p>`,
      },
      { id: 'precision', title: 'Precision and limits',
        html: '<p>An independent Python reference evaluates each source formula in its own published form, in 50-digit decimal arithmetic, and differentiates k(ω) = nω/c numerically in angular frequency. That route differs from the analytic wavelength derivatives used here. n, n<sub>g</sub>, GVD and TOD agree to 10⁻⁹ relative, or 10⁻⁹ fs²/mm and fs³/mm absolute near a zero crossing. The catalogue’s published n<sub>d</sub> and Abbe numbers separately anchor every SCHOTT glass. The four canvas glasses are also checked against the tracer’s own getters.</p><p>The digits describe the fit, not a real sample. Fits carry their own residuals (Malitson quotes about 10⁻⁵ in index for fused silica), and batch, temperature and stress move real indices further. Glass catalogues give indices relative to air at their reference conditions, and several crystal fits follow the same convention. The page applies no air-to-vacuum correction. Converting to absolute indices (n × n<sub>air</sub> for standard air) raises n by about 3 × 10⁻⁴ × n and also changes the GVD. For N-BK7, for example, it adds 0.19 fs²/mm at 300 nm, 0.045 fs²/mm at 800 nm (0.1 %), 0.020 fs²/mm at 1300 nm (1 %) and 0.003 fs²/mm at 1690 nm. Near a zero-GVD wavelength the relative change has no bound: fused silica’s zero moves by about 0.2 nm.</p><p>The pulse rows describe a transform-limited input with the stated shape. They do not model a measured spectrum, spectral phase already on the pulse, nonlinear propagation or TOD-induced reshaping. Graphs sample 241 wavelengths; hover, use the arrow keys or open the data tables to read them.</p>',
      },
    ],
    references: [
      { label: 'SCHOTT AG, Optical glass data sheets and Zemax catalogue (2017-01-20): N-BK7, N-FK51A, N-SF5, N-SF10, N-SF11, N-SF14, N-SF57 and N-LASF9 dispersion constants, nd and Vd.', url: 'https://www.schott.com/shop/medias/schott-optical-glass-collection-datasheets-english-march2018.pdf?context=bWFzdGVyfHJvb3R8NTQwMzA2MXxhcHBsaWNhdGlvbi9wZGZ8aDllL2hlZS84ODE3NDA4ODY4MzgyLnBkZnw2Y2VlYjY0Njk3YzBkYzU4NDliOGMxMzVmNjgwZmRiYzdlYWMxYmJmZDU1NjdmYjIxYzU5MTQ4NmE1YjhmMGQ2' },
      { label: 'I. H. Malitson, “Interspecimen comparison of the refractive index of fused silica,” J. Opt. Soc. Am. 55, 1205–1208 (1965).', url: 'https://doi.org/10.1364/JOSA.55.001205' },
      { label: 'I. H. Malitson, “A redetermination of some optical properties of calcium fluoride,” Appl. Opt. 2, 1103–1107 (1963).', url: 'https://doi.org/10.1364/AO.2.001103' },
      { label: 'I. H. Malitson and M. J. Dodge, “Refractive index and birefringence of synthetic sapphire,” J. Opt. Soc. Am. 62, 1405 (1972); dispersion formula in M. J. Dodge, Handbook of Laser Science and Technology, Vol. IV, CRC Press (1986), p. 30.', url: 'https://opg.optica.org/josa/abstract.cfm?uri=josa-62-11-1336' },
      { label: 'G. Ghosh, “Dispersion-equation coefficients for the refractive index and birefringence of calcite and quartz crystals,” Opt. Commun. 163, 95–102 (1999).', url: 'https://doi.org/10.1016/S0030-4018(99)00091-7' },
      { label: 'G. Tamošauskas, G. Beresnevičius, D. Gadonas and A. Dubietis, “Transmittance and phase matching of BBO crystal in the 3−5 μm range and its application for the characterization of mid-infrared laser pulses,” Opt. Mater. Express 8, 1410–1418 (2018).', url: 'https://doi.org/10.1364/OME.8.001410' },
      { label: 'D. E. Zelmon, D. L. Small and R. Page, “Refractive-index measurements of undoped yttrium aluminum garnet from 0.4 to 5.0 μm,” Appl. Opt. 37, 4933–4935 (1998).', url: 'https://doi.org/10.1364/AO.37.004933' },
      { label: 'J. Connolly, B. diBenedetto and R. Donadio, “Specifications of Raytran material,” Proc. SPIE 181, 141–144 (1979).', url: 'https://doi.org/10.1117/12.957359' },
      { label: 'B. Tatian, “Fitting refractive-index data with the Sellmeier dispersion formula,” Appl. Opt. 23, 4477–4485 (1984): the Sellmeier fits used for ZnSe and silicon.', url: 'https://doi.org/10.1364/AO.23.004477' },
      { label: 'C. D. Salzberg and J. J. Villa, “Infrared refractive indexes of silicon, germanium and modified selenium glass,” J. Opt. Soc. Am. 47, 244–246 (1957).', url: 'https://doi.org/10.1364/JOSA.47.000244' },
      { label: 'M. Daimon and A. Masumura, “Measurement of the refractive index of distilled water from the near-infrared region to the ultraviolet region,” Appl. Opt. 46, 3811–3820 (2007).', url: 'https://doi.org/10.1364/AO.46.003811' },
      { label: 'P. E. Ciddor, “Refractive index of air: new equations for the visible and near infrared,” Appl. Opt. 35, 1566–1573 (1996).', url: 'https://doi.org/10.1364/AO.35.001566' },
      { label: 'M. N. Polyanskiy, “Refractiveindex.info database of optical constants,” Sci. Data 11, 94 (2024); database released under CC0.', url: 'https://doi.org/10.1038/s41597-023-02898-2' },
    ],
  },
  {
    slug: 'nonlinear-conversion', title: 'Nonlinear frequency conversion', script: 'page.js', graphs: [],
    card: 'SHG, THG, SFG, DFG and OPO wavelengths from energy conservation, with frequencies and photon energies.',
    summary: 'Find the generated wavelength of second- and third-harmonic generation, sum- and difference-frequency generation, or the signal and idler of an optical parametric oscillator. Every wave is shown as a vacuum wavelength, frequency and photon energy.',
    facts: [
      { label: 'Model', html: 'Photon-energy conservation for χ⁽²⁾ and χ⁽³⁾ processes. No crystal, phase-matching or efficiency model.' },
      { label: 'Evidence', html: evidence },
      { label: 'Example', html: '1064 nm → 532 nm (SHG, as in NIST’s example <a class="cite" href="#ref-2">[2]</a>) and 354.67 nm (THG); a 1030 nm-pumped OPO with a 1550 nm signal has a 3070.2 nm idler.' },
    ],
    sections: [
      { id: 'physics', title: 'Energy conservation',
        html: `<p>In a parametric process the medium returns to its initial state, so the photon energies balance and the generated frequency follows from the input frequencies ${cite(1)}. With vacuum wavelengths λ = c/ν:</p>`,
        formulas: [
          { tex: String.raw`\text{SHG: }\nu_{2\omega}=2\nu,\qquad \text{THG: }\nu_{3\omega}=3\nu,\qquad \lambda_{n\omega}=\lambda/n` },
          { tex: String.raw`\text{SFG: }\frac{1}{\lambda_3}=\frac{1}{\lambda_1}+\frac{1}{\lambda_2},\qquad \text{DFG: }\frac{1}{\lambda_3}=\frac{1}{\lambda_1}-\frac{1}{\lambda_2}\;(\lambda_1<\lambda_2)` },
          { tex: String.raw`\text{OPO: }\frac{1}{\lambda_p}=\frac{1}{\lambda_s}+\frac{1}{\lambda_i},\qquad \lambda_s\le 2\lambda_p\le\lambda_i` },
        ],
        html2: `<p>SHG is the degenerate case of SFG, and DFG is the process behind parametric amplification: the lower-frequency input grows as the difference frequency is generated. In an OPO the signal is, by convention, the higher-frequency output; signal and idler meet at the degeneracy wavelength 2λ<sub>p</sub>. One pump photon yields one signal and one idler photon (Manley–Rowe), so at most a fraction λ<sub>p</sub>/λ of the converted pump power can go into each output ${cite(1)}. THG is generated either directly through χ⁽³⁾ or by cascading SHG with SFG ${cite(1)}.</p>`,
        formulas2: [{ tex: String.raw`\nu\,[\mathrm{THz}]=\frac{299792.458}{\lambda\,[\mathrm{nm}]},\qquad E\,[\mathrm{eV}]=\frac{1239.841984}{\lambda\,[\mathrm{nm}]}` }],
      },
      { id: 'precision', title: 'Precision and limits',
        html: '<p>Known wavelengths are accepted from 100 to 20000 nm; generated waves may fall outside that interval (DFG of close wavelengths reaches the terahertz range). DFG needs two different inputs; an OPO output must be longer than the pump. An independent reference computes each process in SI frequencies and checks the page to 10⁻⁹ relative, with exact rational anchors.</p><p>Energy conservation says which wavelength a process would generate, not whether it does: phase matching, crystal transparency and damage, acceptance bandwidths, pulse overlap, power and conversion efficiency are not modelled. Wavelengths inside a medium are shorter by its refractive index; this page reports vacuum wavelengths throughout.</p>',
      },
    ],
    references: [
      { label: 'R. W. Boyd, Nonlinear Optics, 4th ed., Academic Press (2020), ISBN 978-0-12-811002-7: chapters 1–2.', url: 'https://www.sciencedirect.com/book/monograph/9780128110027/nonlinear-optics' },
      { label: 'NIST, Frequency Conversion Interfaces for Photonic Quantum Systems, including the 1064 → 532 nm example.', url: 'https://www.nist.gov/programs-projects/frequency-conversion-interfaces-photonic-quantum-systems' },
    ],
  },
  {
    slug: 'coherent-raman', title: 'Coherent Raman scattering', script: 'page.js', graphs: [],
    card: 'Raman shift, pump or Stokes from the other two; CARS and CSRS wavelengths; spectral resolution from pulse durations.',
    summary: 'Solve the pump, Stokes or Raman shift from the other two, then read the CARS and CSRS wavelengths for two-color excitation or a distinct probe. A second panel estimates the spectral resolution set by the pump and Stokes pulse durations.',
    panels: [{ id: 'resolution', title: 'Spectral resolution from pulse durations',
      intro: `For Gaussian pulses that are transform-limited, or equally chirped as in spectral focusing, the excitation bandwidth depends only on the pump and Stokes durations ${cite(3)}.` }],
    facts: [
      { label: 'Model', html: 'Pump–Stokes difference frequency; CARS and CSRS at the probe frequency plus or minus the Raman frequency; Gaussian-pulse resolution formula.' },
      { label: 'Evidence', html: evidence },
      { label: 'Example', html: '800 nm pump + 1040 nm Stokes → 2884.6 cm⁻¹; CARS at 650 nm, CSRS at 1485.7 nm. Two 2 ps pulses give 14.7 cm⁻¹ resolution.' },
    ],
    sections: [
      { id: 'physics', title: 'Pump, Stokes and probe',
        html: `<p>A pump (ν<sub>p</sub>) and a lower-frequency Stokes beam (ν<sub>S</sub>) drive a vibrational coherence at their difference frequency ${cite(1, 4)}. With vacuum wavelengths in nm, the Raman shift is in cm⁻¹, and any two of pump, Stokes and shift fix the third:</p>`,
        formulas: [
          { tex: String.raw`\Delta\tilde\nu=10^7\left(\frac{1}{\lambda_p}-\frac{1}{\lambda_S}\right),\qquad \lambda_S=\frac{10^7}{10^7/\lambda_p-\Delta\tilde\nu},\qquad \lambda_p=\frac{10^7}{10^7/\lambda_S+\Delta\tilde\nu}` },
          { tex: String.raw`\nu_{\mathrm{Raman}}\,[\mathrm{THz}]=0.0299792458\;\Delta\tilde\nu\,[\mathrm{cm}^{-1}]` },
        ],
        html2: `<p>A probe scatters off the coherence on either side of its own frequency. Coherent anti-Stokes Raman scattering (CARS) appears at the probe frequency plus the Raman frequency, and coherent Stokes Raman scattering (CSRS) at the probe frequency minus it ${cite(1, 2)}. In two-color experiments the pump probes CARS and the Stokes beam probes CSRS; tick “Use a distinct probe” for a third beam. Stimulated Raman scattering (SRS) is read out at the pump and Stokes wavelengths themselves.</p>`,
        formulas2: [
          { tex: String.raw`\nu_{\mathrm{CARS}}=\nu_{\mathrm{pr}}+(\nu_p-\nu_S)\;\xrightarrow{\;\nu_{\mathrm{pr}}=\nu_p\;}\;2\nu_p-\nu_S` },
          { tex: String.raw`\nu_{\mathrm{CSRS}}=\nu_{\mathrm{pr}}-(\nu_p-\nu_S)\;\xrightarrow{\;\nu_{\mathrm{pr}}=\nu_S\;}\;2\nu_S-\nu_p` },
        ],
      },
      { id: 'resolution', title: 'Spectral resolution',
        html: `<p>Mohseni, Polzer and Hellerer derive the spectral resolution of spectral-focusing coherent Raman imaging from the pump and Stokes durations τ<sub>p</sub> and τ<sub>S</sub>, the intensity FWHM of Gaussian pulses, and state that it holds for transform-limited pulses as well as for equally chirped ones ${cite(3)}, Eq. (5):</p>`,
        formulas: [{ tex: String.raw`\Delta\tilde\nu=\frac{2\sqrt2\,\ln2}{\pi c}\sqrt{\tau_p^{-2}+\tau_S^{-2}}\approx 20.8\ \mathrm{ps\,cm^{-1}}\sqrt{\tau_p^{-2}+\tau_S^{-2}}` }],
        html2: `<p>With equal linear chirps the instantaneous pump–Stokes difference frequency is constant in time, so the chirps cancel in the beat and only the chirped envelopes matter. For spectral focusing, enter those chirped durations. A chirp mismatch adds a broadening term that this panel does not include (Eq. (8) of ${cite(3)}). For Gaussian fields the value equals the FWHM of the amplitude spectrum of the driving term E<sub>p</sub>E<sub>S</sub>*. The FWHM of its power spectrum is smaller by √2. The independent reference recomputes the amplitude-spectrum width numerically, for transform-limited and equally chirped pulses.</p>`,
      },
      { id: 'precision', title: 'Precision and limits',
        html: '<p>Wavelength inputs and inferred pump or Stokes wavelengths are limited to 100–20000 nm, and shifts to positive values up to 10000 cm⁻¹. Equal or reversed pump and Stokes, impossible shifts and out-of-scope inferred wavelengths give no result. CARS and CSRS may lie outside the input interval. CSRS is unavailable when the Raman frequency is not below the probing frequency. An independent reference checks all three modes, both probe options and the resolution formula to 10⁻⁹ relative; the paper’s 20.8 ps·cm⁻¹ prefactor anchors the units.</p><p>Frequency relations and a Gaussian bandwidth estimate only. Raman cross-sections, linewidths, the nonresonant background, phase matching, polarization, pulse overlap, signal levels and non-Gaussian pulse shapes are outside this model.</p>',
      },
    ],
    references: [
      { label: 'J.-X. Cheng and X. S. Xie, “Coherent anti-Stokes Raman scattering microscopy: instrumentation, theory, and applications,” J. Phys. Chem. B 108, 827–840 (2004).', url: 'https://doi.org/10.1021/jp035693v' },
      { label: 'S. Heuke and H. Rigneault, “Coherent Stokes Raman scattering microscopy (CSRS),” Nat. Commun. 14, 3337 (2023).', url: 'https://doi.org/10.1038/s41467-023-38941-4' },
      { label: 'M. Mohseni, C. Polzer and T. Hellerer, “Resolution of spectral focusing in coherent Raman imaging,” Opt. Express 26, 10230–10241 (2018).', url: 'https://doi.org/10.1364/OE.26.010230' },
      { label: 'NIST, Broadband Coherent Anti-Stokes Raman Scattering Microscopy, excitation and probe frequency relations.', url: 'https://www.nist.gov/programs-projects/broadband-coherent-anti-stokes-raman-scattering-bcars-microscopy' },
    ],
  },
];
