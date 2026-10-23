// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Content of the fluorescence page.
import { readFileSync } from 'node:fs';
import { FLUOROPHORE_LIBRARY, FLUOROPHORE_CATEGORIES, FLUOROPHORE_SOURCES } from '../sketch/js/fluorophore-library.js';
import { DETECTOR_PRESETS } from '../sketch/js/fluorescence.js';

const cite = (...n) => n.map(k => `<a class="cite" href="#ref-${k}">[${k}]</a>`).join('');
const GITHUB = 'https://github.com/LucaGenchi/opticalsetup/blob/main';
const count = FLUOROPHORE_LIBRARY.length;
const fpbase = FLUOROPHORE_SOURCES.fpbase;

// The library table: every fluorophore with its numbers and its paper.
const fileOf = id => JSON.parse(readFileSync(new URL(`../sketch/data/fluorophores/${id}.json`, import.meta.url), 'utf8'));
const paperLink = r => `<a href="https://doi.org/${r.doi}">${r.citation}</a>`;
const num = (x, unit = '') => (x === null ? '—' : `${x.toLocaleString('en-US')}${unit}`);
const libraryRows = FLUOROPHORE_CATEGORIES.map(category => {
  const rows = FLUOROPHORE_LIBRARY.filter(f => f.category === category);
  return `<tr><th colspan="6" scope="colgroup">${category} (${rows.length})</th></tr>\n${rows.map(f => {
    const { reference, spectraReferences } = fileOf(f.id);
    const paper = [...(reference ? [paperLink(reference)] : []), ...spectraReferences.map(r => `spectra: ${paperLink(r)}`)].join('; ');
    return `<tr><td>${f.name}</td><td>${f.exMaxNm} / ${f.emMaxNm}</td><td>${num(f.extinctionM)}</td><td>${num(f.quantumYield)}</td><td>${num(f.lifetimeNs)}</td><td>${paper}</td></tr>`;
  }).join('\n')}`;
}).join('\n');

const detectorRows = Object.values(DETECTOR_PRESETS).map((d, i) => `<tr><th scope="row">${d.label}</th><td>${d.product}</td><td>${d.anchors}</td><td>${cite([6, 7, 7, 8][i])}</td></tr>`).join('\n');

export const fluorescenceCalculators = [
  {
    slug: 'fluorescence', title: 'Fluorescence excitation and detection', script: 'page.js',
    card: 'A CW laser on a fluorescent protein’s measured spectra: excitation efficiency, emission through stacked filters and a detector, crosstalk, laser blocking and saturation.',
    summary: 'Choose a CW laser line and a fluorophore, then stack emission filters and a detector. Read how strongly the laser excites it, how much of its emission is detected, how well the laser line is blocked, the crosstalk from a second label, and the excitation rate and saturation of one molecule.',
    // Top to bottom: the laser and markers, the graphs, the detection path,
    // the two efficiencies, then each marker's own numbers.
    layout: [
      { form: 'calc', label: 'Laser and fluorescent markers' },
      { graphs: true },
      { form: 'detect', label: 'Detection path', note: 'Filters multiply: the stack passes the product of their transmissions.' },
      { output: true, label: 'Excitation and detection efficiency', results: [['excitation', 'Excitation efficiency'], ['detection', 'Detection efficiency']] },
      { id: 'markers', title: 'Fluorescent marker additional information', results: [['marker', 'Fluorescent marker'], ['marker2', 'Second marker']] },
    ],
    panels: [{ id: 'rate', title: 'Excitation rate and saturation of one molecule',
      intro: `From the laser power at the sample: the intensity in a focus or a widefield field, how often one molecule absorbs, how close it is to saturation, and how many of its photons reach the detector ${cite(3, 5)}.` }],
    graphs: [
      { id: 'spectra', wide: true, title: 'Spectra, filters and the detected emission', note: 'Excitation and emission are scaled to their peaks; the filter stack and the detector QE are fractions. The dark area is the emission that is detected; the dashed vertical line is the laser.' },
      { id: 'od', wide: true, title: 'Blocking of the filter stack', note: 'Optical density −log₁₀T of the whole stack, shown up to 12. The laser line needs a high value: scattered laser light can be far stronger than the fluorescence.' },
    ],
    facts: [
      { label: 'Model', html: 'Measured one-photon spectra; generic filters with logistic edges, or your measured curves; typical detector QE curves; a two-level steady state for saturation.' },
      { label: 'Evidence', html: `Equations checked against an independent Python reference (Airy-pattern quadrature, an integrated rate equation, exact filter integrals) and against the detectors’ datasheet values: <a href="${GITHUB}/docs/validation.md" target="_blank" rel="noopener">validation table</a>. The spectra are FPbase’s; they are not checked here.` },
      { label: 'Data', html: `${count} fluorescent proteins from FPbase ${cite(1, 2)}, each credited to its original paper. Dyes follow once their redistribution terms are confirmed.` },
      { label: 'Code', html: `<a href="${GITHUB}/sketch/js/fluorescence.js" target="_blank" rel="noopener">fluorescence.js</a>, a workbench module the canvas’s specimens can use, and the <a href="${GITHUB}/calculators/fluorescence/fluorescence-calculator.js" target="_blank" rel="noopener">calculator module</a>.` },
    ],
    sections: [
      { id: 'physics', title: 'Excitation at a laser line',
        html: `<p>A fluorophore absorbs a photon of wavelength λ with a probability set by its decadic molar extinction coefficient ε(λ), the number spectroscopists quote. For one molecule it is an absorption cross-section σ ${cite(3)}:</p>`,
        formulas: [{ tex: String.raw`\sigma(\lambda)=\frac{\ln 10\cdot 10^{3}\ \mathrm{cm^3\,L^{-1}}}{N_A}\,\varepsilon(\lambda)\approx 3.82\times10^{-21}\ \mathrm{cm^2}\times\frac{\varepsilon(\lambda)}{\mathrm{M^{-1}\,cm^{-1}}}` }],
        html2: `<p>FPbase lists ε at the absorption peak λ<sub>peak</sub>, and an excitation spectrum X(λ): the fluorescence measured while the excitation wavelength is scanned. For one emitting species the excitation and absorption spectra have the same shape, because the quantum yield does not depend on which absorption band was excited (Kasha–Vavilov) ${cite(3)}. The value at the laser line therefore scales ε:</p>`,
        formulas2: [{ tex: String.raw`\varepsilon(\lambda_L)=\varepsilon_{\mathrm{peak}}\,\frac{X(\lambda_L)}{X(\lambda_{\mathrm{peak}})},\qquad B=\varepsilon_{\mathrm{peak}}\,\Phi_F,\qquad B(\lambda_L)=\varepsilon(\lambda_L)\,\Phi_F` }],
        html3: `<p>X(λ<sub>L</sub>)/X(λ<sub>peak</sub>) is the “relative excitation” the page reports, and Φ<sub>F</sub> is the fluorescence quantum yield. The molecular brightness B compares fluorophores at their own peaks; B(λ<sub>L</sub>) compares them at the laser you have. The excitation curve in the first graph is X(λ) itself, so the best of the laser lines you have can be read off it. A few proteins have only an absorption spectrum on FPbase; it is used the same way.</p>`,
      },
      { id: 'detection', title: 'Filters, detector and the detected fraction',
        html: '<p>The emission spectrum E(λ) passes a stack of filters, whose transmissions multiply, and reaches a detector of quantum efficiency Q(λ). The page reports the fraction of the emitted photons the filters pass, and the fraction that is then counted, over the whole emission spectrum:</p>',
        formulas: [
          { tex: String.raw`T(\lambda)=\prod_i T_i(\lambda),\qquad \eta_T=\frac{\int E(\lambda)\,T(\lambda)\,d\lambda}{\int E(\lambda)\,d\lambda}` },
          { tex: String.raw`\eta_D=\frac{\int E(\lambda)\,T(\lambda)\,Q(\lambda)\,d\lambda}{\int E(\lambda)\,d\lambda},\qquad \bar Q=\frac{\eta_D}{\eta_T}` },
        ],
        html2: '<p>E(λ) is taken per unit wavelength, as FPbase stores it. A generic filter has peak transmission T<sub>p</sub> in its passband and 10<sup>−OD</sup> outside it, joined by logistic edges whose 10–90 % width Δ you set (0 is an ideal step). Bandpass and notch filters put their edges at the centre ± half the width, so a “525/50” bandpass is centre 525 nm, width 50 nm:</p>',
        formulas2: [
          { tex: String.raw`T_i(\lambda)=T_b+(T_p-T_b)\,S(\lambda),\quad T_b=10^{-\mathrm{OD}},\qquad s(\lambda;\lambda_e)=\Big[1+e^{-2\ln 9\,(\lambda-\lambda_e)/\Delta}\Big]^{-1}` },
          { tex: String.raw`S_{\mathrm{LP}}=s(\lambda;\lambda_e),\qquad S_{\mathrm{SP}}=1-s(\lambda;\lambda_e)` },
          { tex: String.raw`S_{\mathrm{BP}}=s\big(\lambda;c-\tfrac W2\big)\Big[1-s\big(\lambda;c+\tfrac W2\big)\Big],\qquad S_{\mathrm{notch}}=1-S_{\mathrm{BP}}` },
        ],
        html3: '<p>The emission side of a dichroic beamsplitter acts like a longpass with weak blocking (OD 1–2). A filter you have measured, or downloaded from its maker, can be loaded as a two-column file (wavelength in nm, transmission as a fraction or in percent); it is read in your browser and never uploaded, and outside the file’s range its transmission is taken as zero. The laser line itself is reported as the stack’s transmission and optical density OD = −log<sub>10</sub>T at the laser wavelength. Back-scattered and reflected laser light can be many orders of magnitude stronger than the fluorescence, which is why emission filters block the line at OD 6 or more.</p>',
        html4: `<p>The detector curves are typical ones, one representative product each, drawn by OpticalSetup from the manufacturer’s datasheet. Where the datasheet tabulates the photocathode’s radiant sensitivity S, the quantum efficiency follows exactly; the points in between are read off its typical-response figure ${cite(9)}:</p>`,
        formulas4: [{ tex: String.raw`Q(\lambda)=\frac{S(\lambda)\,hc}{e\,\lambda}=\frac{S\,[\mathrm{A/W}]\times 1239.84}{\lambda\,[\mathrm{nm}]}` }],
        html5: `<div class="table-scroll"><table class="param-table"><thead><tr><th>Detector</th><th>Representative product</th><th>Datasheet values reproduced</th><th>Source</th></tr></thead><tbody>
${detectorRows}
</tbody></table></div><p>A real detector of the same kind can differ by several percentage points, more near the ends of its range, and with its window, temperature and age. For your own detector, load its measured curve, or enter a constant QE.</p>`,
      },
      { id: 'crosstalk', title: 'A second fluorophore',
        html: '<p>With a second label in the sample, the page evaluates it with the same laser and detection path: how strongly the laser excites it, how much of its emission is detected, and its signal relative to the main fluorophore at equal concentrations,</p>',
        formulas: [{ tex: String.raw`X=\frac{\varepsilon_2(\lambda_L)\,\Phi_{F,2}\,\eta_{D,2}}{\varepsilon_1(\lambda_L)\,\Phi_{F,1}\,\eta_{D,1}}` }],
        html2: '<p>X is the bleed-through of label 2 into this channel. The collection geometry is the same for both and cancels. It ignores energy transfer between the labels and any difference in their environment.</p>',
      },
      { id: 'rates', title: 'Excitation rate and saturation',
        html: `<p>For a diffraction-limited focus the page takes the peak of the Airy pattern of a uniformly filled pupil, I(v) = I<sub>0</sub>[2J<sub>1</sub>(v)/v]² with v = 2π·NA·r/λ, whose total power fixes I<sub>0</sub> ${cite(4)}; widefield illumination is a uniform field of diameter D:</p>`,
        formulas: [{ tex: String.raw`I_0=\frac{\pi\,\mathrm{NA}^2\,P}{\lambda^2}\ \ \text{(focus)},\qquad I=\frac{4P}{\pi D^2}\ \ \text{(widefield)}` }],
        html2: `<p>One molecule is treated as a two-level system with fluorescence lifetime τ ${cite(3, 5)}. It absorbs at the rate k = σφ, where φ is the photon flux. In the steady state a fraction N<sub>1</sub> of the time is spent excited, and the emission rate saturates once kτ approaches 1:</p>`,
        formulas2: [
          { tex: String.raw`\varphi=\frac{I\lambda}{hc},\qquad k=\sigma(\lambda_L)\,\varphi,\qquad N_1=\frac{k\tau}{1+k\tau}` },
          { tex: String.raw`F=\Phi_F\,\frac{k}{1+k\tau},\qquad I_{\mathrm{sat}}=\frac{hc}{\lambda\,\sigma\,\tau}` },
        ],
        html3: '<p>Of the photons emitted, an isotropic emitter sends the fraction η<sub>coll</sub> into an objective of numerical aperture NA in a medium of index n; the detected photon rate per molecule multiplies the emission rate by that and by the spectral fraction η<sub>D</sub> from above:</p>',
        formulas3: [{ tex: String.raw`\eta_{\mathrm{coll}}=\frac{1-\cos\theta}{2},\quad \sin\theta=\frac{\mathrm{NA}}{n},\qquad R_{\mathrm{det}}=F\,\eta_{\mathrm{coll}}\,\eta_D` }],
        html4: '<p>The page also gives the power at the sample that would bring kτ to 1 in the chosen geometry. In practice the signal of a real fluorophore stops growing in proportion to the power well before that, because triplet and other dark states fill up and the molecule bleaches; the two-level numbers are an upper bound on the rate, not a prediction of the image.</p>',
      },
      { id: 'parameters', title: 'Every parameter', parameterTable: true, rows: [
        ['λ<sub>L</sub>', 'Laser wavelength', 'nm', 'Vacuum wavelength of the CW laser, 250–1000 nm. Its linewidth is neglected.'],
        ['X(λ)', 'Excitation spectrum', '—', 'FPbase’s curve, 1 nm samples, linear between them; zero outside the measured range.'],
        ['ε', 'Extinction coefficient', 'M⁻¹ cm⁻¹', 'At the absorption peak, as FPbase lists it; scaled by X to the laser.'],
        ['Φ<sub>F</sub>', 'Quantum yield', '—', 'Photons emitted per photon absorbed, from FPbase.'],
        ['τ', 'Fluorescence lifetime', 'ns', 'From FPbase when listed, or entered; only the saturation panel uses it.'],
        ['E(λ)', 'Emission spectrum', '—', 'FPbase’s curve, taken per unit wavelength.'],
        ['c, W', 'Central wavelength and width of a band', 'nm', 'Bandpass passband or notch stop band, between its half-maximum points.'],
        ['λ<sub>e</sub>', 'Edge wavelength', 'nm', 'Where a longpass or shortpass transmits half its peak.'],
        ['Δ', 'Edge width', 'nm', '10 %–90 % width of each edge, 0–50 nm; 0 is an ideal step.'],
        ['T<sub>p</sub>', 'Peak transmission', '%', 'Transmission inside the passband, 1–100 %.'],
        ['OD', 'Blocking', '—', 'Outside the passband T = 10<sup>−OD</sup>, OD 0–10, below T<sub>p</sub>.'],
        ['Q(λ)', 'Detector quantum efficiency', '%', 'Typical curve, constant value or your measured curve; 100 % with no detector (the default).'],
        ['P', 'Power at the sample', 'mW', 'Average power after the objective.'],
        ['NA, n', 'Numerical aperture, sample index', '—', 'Focus size and collection cone; NA must not exceed n.'],
        ['D', 'Field diameter', 'µm', 'Diameter of a uniform widefield field.'],
      ] },
      { id: 'spectra', title: 'The fluorophore library',
        html: `<p>The spectra and numbers come from FPbase, the community-edited fluorescent protein database ${cite(1)}. FPbase states that its data are free of copyright restrictions, for commercial and non-commercial use, with credit to the original authors ${cite(2)}; each protein’s file names the paper FPbase credits for the protein and, where FPbase records one, the paper its curves come from, listed below. An entry with neither is left out. They are measurements, not modelled. Each curve is kept at FPbase’s 1 nm sampling: negative values (baseline noise) are set to zero and the curve is scaled to its peak. The excitation peak is taken within 5 nm of the absorption maximum FPbase lists, the wavelength its ε refers to, so a protein’s 280 nm aromatic band can rise above it.</p><p>A record is left out when a listed peak lies more than 5 nm from its own curve’s, because the numbers and the curve then disagree: DsRed and mRuby2 (emission 11 and 7 nm apart) are left out for that reason, and GCaMP6f because its record lists peaks of 300 and 800 nm. Calcium indicators appear in both of their states. Dye spectra (Alexa Fluor, ATTO, cyanine and other dyes) are left out for now: on FPbase most record no source, or only a manufacturer, so their redistribution terms are being confirmed first.</p><p>Other collections were checked and not used: PhotochemCAD ${cite(10)} and the MPI Brain Research spectra viewer ${cite(11)} state no licence for their spectra, and PubSpectra ${cite(12)} has none recorded and dates from 2006. Manufacturers’ spectra viewers do not grant redistribution.</p><details><summary>All ${count} fluorophores</summary><div class="table-scroll"><table class="param-table"><thead><tr><th>Fluorophore</th><th>Peaks ex / em (nm)</th><th>ε (M⁻¹ cm⁻¹)</th><th>Φ<sub>F</sub></th><th>τ (ns)</th><th>Original data</th></tr></thead><tbody>\n${libraryRows}\n</tbody></table></div></details>`,
      },
      { id: 'precision', title: 'Precision and limits',
        html: `<p>The arithmetic is checked against an independent Python reference to 10⁻⁹ for algebra and exact integrals, 10⁻⁵ for the focus and 2×10⁻⁵ for logistic filter edges, where the page integrates by the trapezoidal rule on 0.05 nm and splits at hard edges so that ideal steps are exact. The detector curves reproduce their datasheets’ tabulated values to the third decimal. These checks say the page evaluates its model correctly; the inputs set its accuracy. Published ε and Φ<sub>F</sub> of one protein often differ by 10–20 % between papers; spectra depend on pH, temperature and environment, and FPbase does not record whether an emission curve was measured in photons or in energy per wavelength, which matters a little for broad emission. Read the fractions as good to a few percent at best.</p><p>Not modelled:</p><ul>
  <li>Two- and three-photon excitation. Their spectra are not the one-photon spectrum at λ/2 or λ/3: EGFP’s two-photon peak is near 927 nm, not 976 nm ${cite(13)}.</li>
  <li>Pulsed lasers, stimulated emission, triplet and dark states, photobleaching and photoswitching kinetics.</li>
  <li>Concentration effects: inner-filter absorption, reabsorption of the emission, quenching and energy transfer between labels.</li>
  <li>Polarization, dipole orientation, emission near interfaces, the objective’s own transmission and the dichroic’s reflection of the laser.</li>
  <li>Filter properties beyond the generic shape: angle of incidence, ripple, out-of-band leaks. Load a measured curve for those.</li>
  <li>Vectorial high-NA focusing, which makes the focus somewhat wider and its peak lower than the scalar Airy value.</li>
</ul>`,
      },
    ],
    references: [
      { label: fpbase.citation, url: fpbase.paper },
      { label: 'FPbase, License, Policies, and Disclaimers (data free of copyright restrictions; credit the original authors)', url: fpbase.licenseUrl },
      { label: 'J. R. Lakowicz, Principles of Fluorescence Spectroscopy, 3rd ed., Springer (2006), chapters 1–2', url: 'https://doi.org/10.1007/978-0-387-46312-4' },
      { label: 'M. Born and E. Wolf, Principles of Optics, 7th ed., Cambridge University Press (1999), section 8.5.2: the Airy pattern', url: 'https://doi.org/10.1017/CBO9781139644181' },
      { label: 'J. B. Pawley (ed.), Handbook of Biological Confocal Microscopy, 3rd ed., Springer (2006): chapter 16, R. Y. Tsien, L. Ernst and A. Waggoner, “Fluorophores for confocal microscopy: photophysics and photochemistry”', url: 'https://doi.org/10.1007/978-0-387-45524-2' },
      { label: 'Hamamatsu Photonics, Photomultiplier tube modules H10720/H10721 series, datasheet TPMO1062E', url: 'https://www.hamamatsu.com/resources/pdf/etd/H10720_H10721_TPMO1062E.pdf' },
      { label: 'Hamamatsu Photonics, Photosensor modules H7422 series, datasheet (copy hosted by UC San Diego)', url: 'https://neurophysics.ucsd.edu/Manuals/Hamamatsu/H7422%20Specifications.pdf' },
      { label: 'Hamamatsu Photonics, ORCA-Fusion BT digital CMOS camera C15440-20UP, catalogue SCAS0143J', url: 'https://www.hamamatsu.com/resources/pdf/sys/SCAS0143J_C15440-20UP.pdf' },
      { label: 'Hamamatsu Photonics, Photomultiplier Tubes: Basics and Applications, 4th ed. (2017): radiant sensitivity and quantum efficiency', url: 'https://www.hamamatsu.com/content/dam/hamamatsu-photonics/sites/documents/99_SALES_LIBRARY/etd/PMT_handbook_v4E.pdf' },
      { label: 'M. Taniguchi, H. Du and J. S. Lindsey, PhotochemCAD spectral database (no licence stated)', url: 'https://www.photochemcad.com/' },
      { label: 'Max Planck Institute for Brain Research, Spectra viewer (no licence stated)', url: 'https://public.brain.mpg.de/SpectraViewer/' },
      { label: 'G. McNamara, PubSpectra (2006; no licence recorded)', url: 'https://works.bepress.com/gmcnamara/9/' },
      { label: 'M. Drobizhev, N. S. Makarov, S. E. Tillo, T. E. Hughes and A. Rebane, “Two-photon absorption properties of fluorescent proteins,” Nat. Methods 8, 393–399 (2011)', url: 'https://doi.org/10.1038/nmeth.1596' },
    ],
  },
];
