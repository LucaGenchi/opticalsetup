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
const twoPhotonCell = f => (f.twoPhotonPeakNm ? `${f.twoPhotonPeakNm}${f.twoPhotonPeakGm === null ? '' : `, ${Number(f.twoPhotonPeakGm.toPrecision(3))} GM`}` : '—');
const twoPhotonCount = FLUOROPHORE_LIBRARY.filter(f => f.twoPhotonPeakNm).length;
const twoPhotonGmCount = FLUOROPHORE_LIBRARY.filter(f => f.twoPhotonPeakGm).length;
const libraryRows = FLUOROPHORE_CATEGORIES.map(category => {
  const rows = FLUOROPHORE_LIBRARY.filter(f => f.category === category);
  return `<tr><th colspan="7" scope="colgroup">${category} (${rows.length})</th></tr>\n${rows.map(f => {
    const { reference, spectraReferences } = fileOf(f.id);
    const paper = [...(reference ? [paperLink(reference)] : []), ...spectraReferences.map(r => `spectra: ${paperLink(r)}`)].join('; ');
    return `<tr><td>${f.name}</td><td>${f.exMaxNm} / ${f.emMaxNm}</td><td>${num(f.extinctionM)}</td><td>${num(f.quantumYield)}</td><td>${num(f.lifetimeNs)}</td><td>${twoPhotonCell(f)}</td><td>${paper}</td></tr>`;
  }).join('\n')}`;
}).join('\n');

const detectorRows = Object.values(DETECTOR_PRESETS).map((d, i) => `<tr><th scope="row">${d.label}</th><td>${d.product}</td><td>${d.anchors}</td><td>${cite([6, 7, 7, 8][i])}</td></tr>`).join('\n');

export const fluorescenceCalculators = [
  {
    slug: 'fluorescence', title: 'Fluorescence', script: 'page.js',
    card: 'Linear (one-photon) or two-photon excited fluorescence of fluorescent proteins, on their measured spectra: excitation efficiency, emission through filters and a detector, crosstalk, source blocking and saturation.',
    summary: 'Choose linear (one-photon excited) or nonlinear (two-photon excited) fluorescence, a source (an LED, a CW laser or a pulsed laser; pulsed only for two-photon) and a fluorophore, then emission filters and a detector. Read how strongly the source excites it, how much of its emission is detected, how well the source light is blocked, the crosstalk from a second label, and the excitation rate and saturation of one molecule.',
    // Top to bottom: the laser and markers, the graphs, the detection path,
    // the two efficiencies, then each marker's own numbers.
    layout: [
      { form: 'calc', label: 'Fluorescence process' },
      { form: 'markers', label: 'Source and fluorescent markers' },
      { graphs: true },
      { form: 'detect', label: 'Detection path', note: 'Filters multiply: the stack passes the product of their transmissions.' },
      { output: true, label: 'Excitation and detection efficiency', results: [['excitation', 'Excitation efficiency'], ['detection', 'Detection efficiency']] },
      { id: 'markers', title: 'Fluorescent marker additional information', results: [['marker', 'Fluorescent marker'], ['marker2', 'Second marker']] },
    ],
    panels: [{ id: 'rate', title: 'Excitation rate and saturation of one molecule',
      intro: `From the laser power at the sample: the intensity in a focus or a widefield field, how often one molecule absorbs, how close it is to saturation, and how many of its photons reach the detector ${cite(3, 5)}.` }],
    graphs: [
      { id: 'spectra', wide: true, title: 'Spectra, filters and the detected emission', note: 'Excitation and emission are scaled to their peaks; the filter stack and the detector QE are fractions. The dark area is the emission that is detected; the dashed vertical line is the source’s central wavelength, and an LED’s or a pulse’s spectrum is drawn as its own curve.' },
      { id: 'od', wide: true, title: 'Blocking of the filter stack', note: 'Optical density −log₁₀T of the whole stack, shown up to 12. The source’s wavelengths need a high value: scattered excitation light can be far stronger than the fluorescence.' },
    ],
    facts: [
      { label: 'Model', html: 'Measured one-photon and two-photon spectra; one- and two-photon excitation by short pulses per pulse; Gaussian LED bands and transform-limited pulses; generic filters with logistic edges, or your measured curves; typical detector QE curves; a two-level model for saturation, steady under CW and LED light, per pulse under short pulses.' },
      { label: 'Evidence', html: `Equations checked against an independent Python reference (Airy-pattern quadrature, an integrated rate equation, exact filter integrals) and against the detectors’ datasheet values: <a href="${GITHUB}/docs/validation.md" target="_blank" rel="noopener">validation table</a>. The spectra are FPbase’s; they are not checked here.` },
      { label: 'Data', html: `${count} fluorescent proteins from FPbase ${cite(1, 2)}, each credited to its original paper. Dyes follow once their redistribution terms are confirmed.` },
      { label: 'Code', html: `<a href="${GITHUB}/sketch/js/fluorescence.js" target="_blank" rel="noopener">fluorescence.js</a>, a workbench module the canvas’s specimens can use, and the <a href="${GITHUB}/calculators/fluorescence/fluorescence-calculator.js" target="_blank" rel="noopener">calculator module</a>.` },
    ],
    sections: [
      { id: 'physics', title: 'Excitation by the source',
        html: `<p>A fluorophore absorbs a photon of wavelength λ with a probability set by its decadic molar extinction coefficient ε(λ), the number spectroscopists quote. For one molecule it is an absorption cross-section σ ${cite(3)}:</p>`,
        formulas: [{ tex: String.raw`\sigma(\lambda)=\frac{\ln 10\cdot 10^{3}\ \mathrm{cm^3\,L^{-1}}}{N_A}\,\varepsilon(\lambda)\approx 3.82\times10^{-21}\ \mathrm{cm^2}\times\frac{\varepsilon(\lambda)}{\mathrm{M^{-1}\,cm^{-1}}}` }],
        html2: `<p>FPbase lists ε at the absorption peak λ<sub>peak</sub>, and an excitation spectrum X(λ): the fluorescence measured while the excitation wavelength is scanned. For one emitting species the excitation and absorption spectra have the same shape, because the quantum yield does not depend on which absorption band was excited (Kasha–Vavilov) ${cite(3)}. The value at a CW laser line λ<sub>0</sub> therefore scales ε:</p>`,
        formulas2: [{ tex: String.raw`\varepsilon(\lambda_0)=\varepsilon_{\mathrm{peak}}\,\frac{X(\lambda_0)}{X(\lambda_{\mathrm{peak}})},\qquad B=\varepsilon_{\mathrm{peak}}\,\Phi_F,\qquad B(\lambda_0)=\varepsilon(\lambda_0)\,\Phi_F` }],
        html3: `<p>An LED and a pulsed laser have a spectrum w(λ), power per nm. The page takes the same shapes the canvas’s LED source and pulsed laser emit: an LED is a Gaussian band of FWHM Δλ, and a pulse is transform-limited and Gaussian, so its bandwidth follows from its duration τ<sub>p</sub> ${cite(14)}. Since photons per nm go as w(λ)·λ, the relative excitation, and with it ε and σ, is then averaged over the source’s photons:</p>`,
        formulas3: [
          { tex: String.raw`\Delta\lambda_{\mathrm{pulse}}=\frac{0.441\,\lambda_0^2}{c\,\tau_p},\qquad \bar X=\frac{\int w(\lambda)\,\lambda\,X(\lambda)\,d\lambda}{X(\lambda_{\mathrm{peak}})\int w(\lambda)\,\lambda\,d\lambda}` },
        ],
        html4: `<p>X̄, or X(λ<sub>0</sub>)/X(λ<sub>peak</sub>) for a line, is the “relative excitation” the page reports, and Φ<sub>F</sub> is the fluorescence quantum yield. The molecular brightness B compares fluorophores at their own peaks; B at the source compares them under the light you have. The excitation curve in the first graph is X(λ) itself, so the best of the sources you have can be read off it. A few proteins have only an absorption spectrum on FPbase; it is used the same way.</p>`,
      },
      { id: 'twophoton', title: 'Two-photon excitation',
        html: `<p>Choosing nonlinear fluorescence switches to two-photon excitation: the molecule absorbs two near-infrared photons at once, with a probability that goes as the square of the intensity, and then emits as after one-photon excitation, so its emission spectrum and quantum yield are unchanged ${cite(15, 16)}. Its strength is the two-photon cross-section σ₂, in GM (1 GM = 10⁻⁵⁰ cm⁴ s per photon), and its spectrum is measured against the laser wavelength; the first graph draws it there, on the same axis as the emission. It is not the one-photon spectrum at twice the wavelength: EGFP’s two-photon peak is near 927 nm, not 976 nm ${cite(13)}. Only pulsed lasers are offered, and the list holds the ${twoPhotonCount} proteins for which FPbase has a two-photon spectrum, ${twoPhotonGmCount} of them with the peak cross-section that absolute rates need. FPbase records the source of six of these curves (Molina et al. ${cite(17)}); for the rest it names none, though for fourteen proteins its references include Drobizhev et al. ${cite(13)}.</p>`,
        html2: '<p>The relative excitation is the two-photon curve averaged over the pulse’s photons, and σ₂ at the laser scales from its peak value. Strictly, a broad pulse’s two-photon absorption depends on its second-harmonic spectrum; the average is a fair estimate while the pulse is narrow next to the two-photon spectrum, and pulses wider than 5 % of the wavelength (about 20 fs at 920 nm) are declined. For Gaussian pulses of FWHM τ<sub>p</sub> and photon fluence F, a ground-state molecule at the centre of the focus is driven to n excitations per pulse, and the pulse train then responds as in the one-photon case below:</p>',
        formulas2: [{ tex: String.raw`n=\sigma_2\,g_p\,\frac{F^2}{\tau_p},\qquad g_p=\sqrt{\frac{2\ln 2}{\pi}}\approx0.664,\qquad p=1-e^{-n}` }],
        html3: `<p>Here g<sub>p</sub> is the temporal factor of a Gaussian pulse, ∫I(t)²dt = g<sub>p</sub>(∫I dt)²/τ<sub>p</sub> ${cite(15)}. At the same average power the signal grows as 1/(f<sub>rep</sub>τ<sub>p</sub>), which is why the repetition rate and the pulse duration both matter; n = 1 marks saturation. Crosstalk compares σ₂·Φ·η of the two labels, which both scale with the square of the intensity.</p>`,
      },
      { id: 'detection', title: 'Filters, detector and the detected fraction',
        html: '<p>The emission spectrum E(λ) passes a stack of filters, whose transmissions multiply, and reaches a detector of quantum efficiency Q(λ). The page reports the fraction of the emitted photons the filters pass, and the fraction that is then counted, over the whole emission spectrum:</p>',
        formulas: [
          { tex: String.raw`T(\lambda)=\prod_i T_i(\lambda),\qquad \eta_T=\frac{\int E(\lambda)\,T(\lambda)\,d\lambda}{\int E(\lambda)\,d\lambda}` },
          { tex: String.raw`\eta_D=\frac{\int E(\lambda)\,T(\lambda)\,Q(\lambda)\,d\lambda}{\int E(\lambda)\,d\lambda},\qquad \bar Q=\frac{\eta_D}{\eta_T}` },
        ],
        html2: '<p>E(λ) is taken per unit wavelength, as FPbase stores it. A generic filter has peak transmission T<sub>p</sub> in its passband and 10<sup>−OD</sup> outside it, joined by logistic edges whose 10–90 % width Δ you set (0 is an ideal step). Bandpass and notch filters put their edges at the centre ± half the width, so a “525/50” bandpass is centre 525 nm, width 50 nm. The width must be at least three edge widths: narrower, the two edges overlap and the band reaches neither its peak transmission nor its FWHM; from three edge widths on, both hold to 0.3 %:</p>',
        formulas2: [
          { tex: String.raw`T_i(\lambda)=T_b+(T_p-T_b)\,S(\lambda),\quad T_b=10^{-\mathrm{OD}},\qquad s(\lambda;\lambda_e)=\Big[1+e^{-2\ln 9\,(\lambda-\lambda_e)/\Delta}\Big]^{-1}` },
          { tex: String.raw`S_{\mathrm{LP}}=s(\lambda;\lambda_e),\qquad S_{\mathrm{SP}}=1-s(\lambda;\lambda_e)` },
          { tex: String.raw`S_{\mathrm{BP}}=s\big(\lambda;c-\tfrac W2\big)\Big[1-s\big(\lambda;c+\tfrac W2\big)\Big],\qquad S_{\mathrm{notch}}=1-S_{\mathrm{BP}}` },
        ],
        html3: '<p>The emission side of a dichroic beamsplitter acts like a longpass with weak blocking (OD 1–2). A filter you have measured, or downloaded from its maker, can be loaded as a two-column file (wavelength in nm, then transmission); it is read in your browser and never uploaded, and outside the file’s range its transmission is taken as zero. Its values are read as the file’s header states (a “%” or “percent” in it), otherwise as percent when one exceeds 1.5; choose fractions or percent to override that. The laser line itself is reported as the stack’s transmission and optical density OD = −log<sub>10</sub>T at the laser wavelength. Back-scattered and reflected laser light can be many orders of magnitude stronger than the fluorescence, which is why emission filters block the line at OD 6 or more.</p>',
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
        html: `<p>For a diffraction-limited focus the page takes the peak of the Airy pattern of a uniformly filled pupil, I(v) = I<sub>0</sub>[2J<sub>1</sub>(v)/v]² with v = 2π·NA·r/λ, whose total power fixes I<sub>0</sub> ${cite(4)}; widefield illumination is a uniform field of diameter D. An LED cannot be focused to a diffraction-limited spot, its light being spatially incoherent, so with an LED only widefield is offered. For pulses, P and I are averages over time. A short pulse has a broad spectrum, and each wavelength focuses to its own Airy peak, π NA² P(λ)/λ²; at the centre of the focus the page therefore weights the cross-section by that, which changes it from the average at λ<sub>0</sub> by the factor κ below. κ is 1 for a line; for a broad band it depends on where the absorption sits within it: 1.278 for EGFP excited by a 5 fs pulse at 560 nm, whose absorption lies on the band’s blue side, but 0.893 for mCherry excited by a 5 fs pulse at 488 nm, whose absorption lies on the red side:</p>`,
        formulas: [
          { tex: String.raw`I_0=\frac{\pi\,\mathrm{NA}^2\,P}{\lambda^2}\ \ \text{(focus)},\qquad I=\frac{4P}{\pi D^2}\ \ \text{(widefield)}` },
          { tex: String.raw`\kappa=\lambda_0^2\,\frac{\int w(\lambda)\,X(\lambda)\,\lambda^{-1}\,d\lambda}{\int w(\lambda)\,X(\lambda)\,\lambda\,d\lambda}` },
        ],
        html2: `<p>One molecule is treated as a two-level system with fluorescence lifetime τ ${cite(3, 5)}. Under a CW laser or an LED it absorbs at the rate k = σφ, where φ is the photon flux (with the source’s mean photon energy for a band). In the steady state a fraction N<sub>1</sub> of the time is spent excited, and the emission rate R saturates once kτ approaches 1:</p>`,
        formulas2: [
          { tex: String.raw`\varphi=\frac{I\lambda}{hc},\qquad k=\sigma\,\varphi,\qquad N_1=\frac{k\tau}{1+k\tau}` },
          { tex: String.raw`R=\Phi_F\,\frac{k}{1+k\tau},\qquad I_{\mathrm{sat}}=\frac{hc}{\lambda\,\sigma\,\tau}` },
        ],
        html3: `<p>Pulses are taken much shorter than the lifetime and than the period between them (τ<sub>p</sub> at most τ/10 and 1/(10 f<sub>rep</sub>), otherwise the page declines). During a pulse the molecule then does not decay, so a pulse of photon fluence F excites it with probability p = 1 − e<sup>−σF</sup>; until the next pulse, a period T = 1/f<sub>rep</sub> later, it decays by e<sup>−T/τ</sup>. In the periodic steady state the fraction excited after each pulse N<sub>+</sub> and the emission rate follow, and σF = 1 marks saturation. The signal depends on the energy per pulse, not only on the average power, which is why the repetition rate is asked for: at the same average power, pulsed excitation saturates much sooner than CW. Far below saturation both give the same rate:</p>`,
        formulas3: [
          { tex: String.raw`F=\frac{I}{f_{\mathrm{rep}}\,h\nu},\qquad p=1-e^{-\sigma F},\qquad N_+=\frac{p}{1-(1-p)\,e^{-T/\tau}}` },
          { tex: String.raw`R=f_{\mathrm{rep}}\,\Phi_F\,N_+\big(1-e^{-T/\tau}\big),\qquad P_{\mathrm{peak}}=2\sqrt{\ln 2/\pi}\ \frac{P}{f_{\mathrm{rep}}\,\tau_p}` },
        ],
        html4: '<p>Of the photons emitted, an isotropic emitter sends the fraction η<sub>coll</sub> into an objective of numerical aperture NA in a medium of index n; the detected photon rate per molecule multiplies the emission rate by that and by the spectral fraction η<sub>D</sub> from above:</p>',
        formulas4: [{ tex: String.raw`\eta_{\mathrm{coll}}=\frac{1-\cos\theta}{2},\quad \sin\theta=\frac{\mathrm{NA}}{n},\qquad R_{\mathrm{det}}=R\,\eta_{\mathrm{coll}}\,\eta_D` }],
        html5: '<p>The page also gives the average power at the sample that would bring kτ, or σF, to 1 in the chosen geometry. In practice the signal of a real fluorophore stops growing in proportion to the power well before that, because triplet and other dark states fill up and the molecule bleaches; the two-level numbers are an upper bound on the rate, not a prediction of the image.</p>',
      },
      { id: 'parameters', title: 'Every parameter', parameterTable: true, rows: [
        ['—', 'Fluorescence process', '—', 'Linear (one-photon excited) or nonlinear (two-photon excited); two-photon takes a pulsed laser and the markers with a two-photon spectrum.'],
        ['λ<sub>0</sub>', 'Central wavelength', 'nm', 'Vacuum wavelength of the source: 250–1000 nm for one-photon, 550–1400 nm for two-photon excitation. A CW laser’s linewidth is neglected.'],
        ['σ<sub>2</sub>', 'Two-photon cross-section', 'GM', 'At the peak FPbase lists, scaled by the two-photon curve to the laser; 1 GM = 10⁻⁵⁰ cm⁴ s.'],
        ['Δλ', 'LED bandwidth', 'nm', 'FWHM of the LED’s Gaussian band, 5–200 nm, the canvas LED’s range.'],
        ['τ<sub>p</sub>', 'Pulse duration', 'fs', 'Intensity FWHM of transform-limited Gaussian pulses, 5 fs–1 ns.'],
        ['f<sub>rep</sub>', 'Repetition rate', 'MHz', 'Pulses per second (rate panel, pulsed sources only).'],
        ['X(λ)', 'Excitation spectrum', '—', 'FPbase’s curve, 1 nm samples, linear between them; zero outside the measured range.'],
        ['ε', 'Extinction coefficient', 'M⁻¹ cm⁻¹', 'At the absorption peak, as FPbase lists it; scaled by X to the laser.'],
        ['Φ<sub>F</sub>', 'Quantum yield', '—', 'Photons emitted per photon absorbed, from FPbase.'],
        ['τ', 'Fluorescence lifetime', 'ns', 'From FPbase when listed, or entered; only the saturation panel uses it.'],
        ['E(λ)', 'Emission spectrum', '—', 'FPbase’s curve, taken per unit wavelength.'],
        ['c, W', 'Central wavelength and width of a band', 'nm', 'Bandpass passband or notch stop band, between its half-maximum points; W ≥ 3Δ.'],
        ['λ<sub>e</sub>', 'Edge wavelength', 'nm', 'Where a longpass or shortpass transmits half its peak.'],
        ['Δ', 'Edge width', 'nm', '10 %–90 % width of each edge, 0–50 nm; 0 is an ideal step.'],
        ['T<sub>p</sub>', 'Peak transmission', '%', 'Transmission inside the passband, 1–100 %.'],
        ['OD', 'Blocking', '—', 'Outside the passband T = 10<sup>−OD</sup>, OD 0–10, below T<sub>p</sub>.'],
        ['Q(λ)', 'Detector quantum efficiency', '%', 'Typical curve, constant value or your measured curve; 100 % with no detector (the default).'],
        ['P', 'Average power at the sample', 'mW', 'Average power after the objective.'],
        ['NA, n', 'Numerical aperture, sample index', '—', 'Focus size and collection cone; NA must not exceed n.'],
        ['D', 'Field diameter', 'µm', 'Diameter of a uniform widefield field.'],
      ] },
      { id: 'spectra', title: 'The fluorophore library',
        html: `<p>The spectra and numbers come from FPbase, the community-edited fluorescent protein database ${cite(1)}. FPbase states that its data are free of copyright restrictions, for commercial and non-commercial use, with credit to the original authors ${cite(2)}; each protein’s file names the paper FPbase credits for the protein and, where FPbase records one, the paper its curves come from, listed below. An entry with neither is left out. They are measurements, not modelled. Each curve is kept at FPbase’s 1 nm sampling: negative values (baseline noise) are set to zero and the curve is scaled to its peak. The excitation peak is taken within 5 nm of the absorption maximum FPbase lists, the wavelength its ε refers to, so a protein’s 280 nm aromatic band can rise above it.</p><p>A record is left out when a listed peak lies more than 5 nm from its own curve’s, because the numbers and the curve then disagree: DsRed and mRuby2 (emission 11 and 7 nm apart) are left out for that reason, and GCaMP6f because its record lists peaks of 300 and 800 nm. Proteins for which FPbase stores another protein’s curve are left out too, since the page would show a relative’s measurement: mEGFP and mEmerald (EGFP’s curves), mCitrine and YPet (Citrine’s), EYFP and Venus (Citrine’s emission), Cerulean (ECFP’s) and mClover3 (Clover’s). Calcium indicators appear in both of their states. Dye spectra (Alexa Fluor, ATTO, cyanine and other dyes) are left out for now: on FPbase most record no source, or only a manufacturer, so their redistribution terms are being confirmed first.</p><p>Other collections were checked and not used: PhotochemCAD ${cite(10)} and the MPI Brain Research spectra viewer ${cite(11)} state no licence for their spectra, and PubSpectra ${cite(12)} has none recorded and dates from 2006. Manufacturers’ spectra viewers do not grant redistribution.</p><details><summary>All ${count} fluorophores</summary><div class="table-scroll"><table class="param-table"><thead><tr><th>Fluorophore</th><th>Peaks ex / em (nm)</th><th>ε (M⁻¹ cm⁻¹)</th><th>Φ<sub>F</sub></th><th>τ (ns)</th><th>Two-photon peak (nm, σ₂)</th><th>Original data</th></tr></thead><tbody>\n${libraryRows}\n</tbody></table></div></details>`,
      },
      { id: 'precision', title: 'Precision and limits',
        html: `<p>The arithmetic is checked against an independent Python reference to 10⁻⁹ for algebra and exact integrals, 10⁻⁵ for the focus, 2×10⁻⁵ for logistic filter edges and 10⁻⁴ for averages over a source band and for pulse trains, where the page integrates by the trapezoidal rule on 0.05 nm (finer for narrow bands) and splits at hard edges so that ideal steps are exact. The pulse-train check integrates the rate equation through finite pulses; the per-pulse model differs from it by about the ratio of pulse duration to lifetime. The detector curves reproduce their datasheets’ tabulated values to the third decimal. These checks say the page evaluates its model correctly; the inputs set its accuracy. Published ε and Φ<sub>F</sub> of one protein often differ by 10–20 % between papers; spectra depend on pH, temperature and environment, and FPbase does not record whether an emission curve was measured in photons or in energy per wavelength, which matters a little for broad emission. Read the fractions as good to a few percent at best.</p><p>Not modelled:</p><ul>
  <li>Three-photon excitation, and two-photon excitation of dyes, for which no openly licensed two-photon spectra were found.</li>
  <li>Two-photon absorption of a broad pulse beyond the average over its spectrum, and one-photon absorption at a two-photon laser’s wavelength.</li>
  <li>Pulses not much shorter than the lifetime, chirped pulses, stimulated emission, triplet and dark states, photobleaching and photoswitching kinetics.</li>
  <li>An excitation filter in front of an LED, and an LED’s real, often asymmetric, spectrum: the page uses a Gaussian band.</li>
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
      { label: 'J.-C. Diels and W. Rudolph, Ultrashort Laser Pulse Phenomena, 2nd ed., Academic Press (2006), chapter 1: time–bandwidth product of Gaussian pulses', url: 'https://doi.org/10.1016/B978-0-12-215493-5.X5000-9' },
      { label: 'C. Xu and W. W. Webb, “Measurement of two-photon excitation cross sections of molecular fluorophores with data from 690 to 1050 nm,” J. Opt. Soc. Am. B 13, 481–491 (1996)', url: 'https://doi.org/10.1364/JOSAB.13.000481' },
      { label: 'W. R. Zipfel, R. M. Williams and W. W. Webb, “Nonlinear magic: multiphoton microscopy in the biosciences,” Nat. Biotechnol. 21, 1369–1377 (2003)', url: 'https://doi.org/10.1038/nbt899' },
      { label: 'R. S. Molina, Y. Qian, J. Wu, Y. Shen, R. E. Campbell, M. Drobizhev and T. E. Hughes, “Understanding the fluorescence change in red genetically encoded calcium ion indicators,” Biophys. J. 116, 1873–1886 (2019)', url: 'https://doi.org/10.1016/j.bpj.2019.04.007' },
    ],
  },
];
