// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Content of the Calculators section, built by tools/build-calculators.mjs.
//
// Each calculator is one page: an interactive panel (inputs from the
// calculator's own schema, results and graphs computed by the same functions
// the canvas uses) followed by the physics it evaluates. Rules, as for the
// wiki: every claim here is checked against the implementation; formulas
// are TeX, pre-rendered by KaTeX at build time; `cite(n)` refers to the
// page's numbered reference list.

export const cite = (...n) => n.map(k => `<a class="cite" href="#ref-${k}">[${k}]</a>`).join('');

const GITHUB = 'https://github.com/LucaGenchi/opticalsetup/blob/main';

export const calculators = [
  {
    slug: 'opa',
    title: 'Optical parametric amplifier (OPA)',
    card: 'Seeded single-pass parametric gain from pump intensity, crystal and pulse timing, with the idler and the pump depletion.',
    summary: 'Set the pump, the crystal and the seed; read the gain, the idler, the pump depletion and the energy balance. The numbers come from the functions OpticalSetup’s parametric amplifier is built on, and are checked against independent solutions of the same equations.',
    script: 'page.js',
    facts: [
      { label: 'Model', html: 'Plane waves, collinear; gain evaluated instant by instant through the pulses (quasi-static); pump depletion as an energy limit, without back-conversion.' },
      { label: 'Evidence', html: `Reference-checked against independent solutions of the same equations, including an exact solution with pump depletion: <a href="${GITHUB}/docs/validation.md" target="_blank" rel="noopener">validation table</a>. Not compared with a measurement.` },
      { label: 'Code', html: `<a href="${GITHUB}/sketch/js/parametric.js" target="_blank" rel="noopener">parametric.js</a> and <a href="${GITHUB}/sketch/js/parametric-amplifier.js" target="_blank" rel="noopener">parametric-amplifier.js</a>, the functions the canvas’s OPA element is being built on (the element itself is not in the canvas yet).` },
    ],
    graphs: [
      { id: 'delay', title: 'Signal gain against seed delay', note: 'Average-power gain of the seed as its arrival time moves across the pump pulse.' },
      { id: 'length', title: 'Pump conversion against crystal length', note: 'Fraction of the pump energy converted into signal and idler.' },
      { id: 'intensity', title: 'Signal gain against peak pump intensity', note: 'The same amplifier at weaker and stronger pumping.' },
    ],
    sections: [
      {
        id: 'physics',
        title: 'The physics',
        html: `<p>An optical parametric amplifier transfers energy from a strong <b>pump</b> wave to a weak <b>signal</b> (the seed) inside a crystal without inversion symmetry, which has a second-order (χ⁽²⁾) response ${cite(1, 7, 14)}. Each pump photon that disappears creates one signal photon and one <b>idler</b> photon, so the idler frequency is fixed by energy conservation:</p>`,
        formulas: [
          { tex: String.raw`\omega_p = \omega_s + \omega_i \quad\Longleftrightarrow\quad \frac{1}{\lambda_p} = \frac{1}{\lambda_s} + \frac{1}{\lambda_i}`, caption: 'The idler wavelength shown in the results. The seed must be longer in wavelength than the pump.' },
        ],
        html2: `<p>Because photons are created in pairs, the <b>Manley–Rowe relations</b> ${cite(1, 6)} fix how the converted pump power divides. For every watt the signal gains, the idler receives λ<sub>s</sub>/λ<sub>i</sub> watts and the pump loses λ<sub>s</sub>/λ<sub>p</sub> watts; nothing is left in the crystal as heat (apart from absorption, which is not modelled):</p>`,
        formulas2: [
          { tex: String.raw`\Delta P_i = \frac{\lambda_s}{\lambda_i}\,\Delta P_s, \qquad -\Delta P_p = \frac{\lambda_s}{\lambda_p}\,\Delta P_s = \Delta P_s + \Delta P_i`, caption: 'The results table checks the first ratio (“Manley–Rowe check”) and the energy balance.' },
        ],
        html3: `<p>For plane waves, the three slowly varying amplitudes obey coupled equations ${cite(1, 6, 17)}. Written with amplitudes normalised so that |a|² is photon flux relative to the input pump, one coupling constant serves all three waves, and it is the gain coefficient Γ of the input pump:</p>`,
        formulas3: [
          { tex: String.raw`\frac{da_s}{dz} = i\Gamma\, a_p\, a_i^{*}\, e^{-i\Delta k z}, \qquad \frac{da_i}{dz} = i\Gamma\, a_p\, a_s^{*}\, e^{-i\Delta k z}, \qquad \frac{da_p}{dz} = i\Gamma\, a_s\, a_i\, e^{+i\Delta k z}` },
          { tex: String.raw`\Gamma^2 = \frac{8\pi^2\, d_\text{eff}^2\; I_p}{\varepsilon_0\, c\; n_p\, n_s\, n_i\; \lambda_s\, \lambda_i}`, caption: `Baumgartner &amp; Byer, eq. 46 ${cite(6)}; the same as Manzoni &amp; Cerullo’s eq. 2.9 ${cite(17)} written with angular frequencies. Γ grows with d<sub>eff</sub> and with the square root of the pump intensity.` },
          { tex: String.raw`\Delta k = k_p - k_s - k_i \;\left(-\,\frac{2\pi}{\Lambda}\right) = 2\pi\left(\frac{n_p}{\lambda_p} - \frac{n_s}{\lambda_s} - \frac{n_i}{\lambda_i}\right) \left(-\,\frac{2\pi}{\Lambda}\right)`, caption: `The phase mismatch, entered directly on this page. The term in brackets applies to quasi-phase matching with poling period Λ ${cite(11)}.` },
        ],
        html4: `<p>While the pump is not depleted and no idler enters the crystal, the equations have an exact solution. The signal power gain after a length L is ${cite(17, 14)}:</p>`,
        formulas4: [
          { tex: String.raw`G = 1 + \frac{\Gamma^2}{g^2}\,\sinh^2(gL), \qquad g = \sqrt{\Gamma^2 - \left(\Delta k/2\right)^2}`, caption: 'The “peak small-signal gain” in the results, at the peak pump intensity.' },
          { tex: String.raw`G\,\big|_{\Delta k = 0} = \cosh^2(\Gamma L) \;\xrightarrow{\;\Gamma L \gg 1\;}\; \tfrac14\, e^{2\Gamma L}, \qquad G - 1 \;\xrightarrow{\;\Gamma L \ll 1\;}\; (\Gamma L)^2\,\frac{\sin^2(\Delta k L/2)}{(\Delta k L/2)^2}`, caption: 'Phase matched, the gain grows exponentially with length. When |Δk|/2 exceeds Γ, g is imaginary, sinh becomes sin, and the gain only oscillates: that is why an OPA has a gain bandwidth. The regime is shown next to the gain.' },
        ],
        html5: `<p>Baumgartner &amp; Byer also give a mismatched form cosh²(gL) (their eq. 47a) ${cite(6)}. It is a restricted approximation: once |Δk| &gt; 2Γ it predicts no gain at all, whereas the full expression above keeps a small oscillating gain. The calculator uses the full expression; both agree at Δk = 0.</p>
<h3>Pulses: gain instant by instant</h3>
<p>A parametric amplifier stores no energy: it amplifies only while the pump is present ${cite(14, 17, 21)}. The calculator therefore evaluates the gain separately at each instant of the pulse, with the pump intensity of that instant (Gaussian intensity envelopes, FWHM durations), and averages the result over the seed ${cite(13)}:</p>`,
        formulas5: [
          { tex: String.raw`I_p(t) = I_p\, e^{-4\ln 2\, t^2/\tau_p^2}, \qquad \Gamma(t) = \Gamma\,\sqrt{I_p(t)/I_p}` },
          { tex: String.raw`\bar G_0 = \frac{\int P_s(t - \Delta t)\; G\big(\Gamma(t)\big)\, dt}{\int P_s(t)\, dt} \qquad\text{(pulsed seed)}, \qquad \bar G_0 = 1 + f_\text{rep}\!\int \big[G\big(\Gamma(t)\big) - 1\big]\, dt \qquad\text{(CW seed)}`, caption: 'Ḡ<sub>0</sub> is the average-power gain without depletion, shown next to the achieved gain Ḡ in the results; Ḡ is the same average after the energy limit below. In the high-gain regime the effective gain window is much shorter than the pump pulse (about τ<sub>p</sub>/√(ΓL)), because the exponent follows the intensity.' },
        ],
        html6: `<p><b>Pump depletion.</b> The undepleted gain can ask for more energy than the pump holds. In each instant the model converts at most the fraction η<sub>max</sub> of the pump energy present in that instant, and several seeds present at the same instant share it:</p>`,
        formulas6: [
          { tex: String.raw`\delta E_\text{conv}(t) = \min\!\left[\,\frac{\lambda_s}{\lambda_p}\,\big(G(t) - 1\big)\,\delta E_{s,\text{in}}(t),\;\; \eta_\text{max}\, \delta E_{p,\text{in}}(t)\right]`, caption: 'δE<sub>conv</sub> is the pump energy converted in one time slice, δE<sub>s,in</sub> and δE<sub>p,in</sub> the seed and pump energies entering it. This is an energy limit, not a solution of the depleted equations: past the optimum length it keeps full conversion, where real plane waves give energy back to the pump. Graph 2 shows the difference.' },
        ],
        html7: `<p><b>The exact solution with depletion</b> (the orange curve in graph 2). With depletion the coupled equations are still solvable: at Δk = 0 the converted fraction of pump photons is a Jacobi elliptic function of the length ${cite(1, 6)}. Derived here from the Manley–Rowe invariants, with r the seed-to-pump photon ratio:</p>`,
        formulas7: [
          { tex: String.raw`\eta(L) = \frac{r}{1+r}\;\mathrm{sd}^2\!\left(\Gamma L\sqrt{1+r}\;\middle|\;\frac{1}{1+r}\right), \qquad r = \frac{\lambda_s P_s}{\lambda_p P_p}`, caption: `sd = sn/dn; the second argument is the parameter m = k², not the modulus k ${cite(20)}. η rises to 1 (complete conversion), then falls back to 0: the pump regenerates, and the cycle repeats. The page solves the coupled equations numerically for any Δk, in every time slice of the pulses, and the Python reference checks it against this closed form.` },
        ],
        html8: `<p><b>Quantities derived from your inputs.</b> The pulse energy, its peak power and, from the peak intensity you entered, the pump beam radius that intensity implies for a Gaussian beam. A radius that is implausibly small or large means the inputs do not describe the same beam.</p>`,
        formulas8: [
          { tex: String.raw`E = \frac{P}{f_\text{rep}}, \qquad P_\text{peak} = 2\sqrt{\frac{\ln 2}{\pi}}\;\frac{E}{\tau} \approx 0.939\,\frac{E}{\tau}, \qquad w = \sqrt{\frac{2\,P_\text{peak}}{\pi\, I_p}}`, caption: 'w is the 1/e² intensity radius of a Gaussian beam with on-axis peak intensity I<sub>p</sub>.' },
        ],
      },
      {
        id: 'deff',
        title: 'What d_eff is, and why it is in pm/V',
        html: `<p>A strong optical field distorts the electron clouds of a crystal slightly anharmonically. The induced polarization then contains a part proportional to the product of two fields, which radiates at their sum or difference frequency. In a parametric amplifier the pump and the signal together drive a polarization at the idler frequency (and pump and idler one at the signal frequency) ${cite(7)}:</p>`,
        formulas: [
          { tex: String.raw`P^{(2)}(\omega_i) \;\propto\; \varepsilon_0\, d_\text{eff}\; E(\omega_p)\, E^{*}(\omega_s), \qquad \chi^{(2)} = 2d`, caption: 'The numerical prefactor depends on how the field amplitudes are defined (Boyd, section 2.2 [7]); Γ above already includes it.' },
        ],
        html2: `<p><b>Units.</b> ε<sub>0</sub>E already has the units of a polarization, so the product d·E must be a pure number: d has the units of an inverse field, metres per volt. The values are around 10⁻¹² m/V, hence <b>picometres per volt</b>. A field of 1 GV/m (an intensity of about 210 GW/cm² in a crystal of index 1.6, from I = ½nε<sub>0</sub>cE²) times 2 pm/V gives 0.002: the nonlinear response is a small correction to the linear one, and needs intense light to matter.</p>
<p><b>“Effective”.</b> A crystal has a tensor of coefficients d<sub>ij</sub>. d<sub>eff</sub> is the single number that remains for your propagation direction and your three polarizations (for birefringent phase matching it depends on the crystal angles). For quasi-phase matching, where the sign of d is flipped every half period, the first-order Fourier factor 2/π applies: d<sub>eff</sub> = (2/π) d<sub>33</sub>, for ideal poling with a 50 % duty cycle and all three waves polarized along the axis that uses d<sub>33</sub> ${cite(11)}.</p>
<table class="param-table">
  <thead><tr><th>Crystal</th><th>Coefficient measured</th><th>Typical d<sub>eff</sub> for an OPA</th></tr></thead>
  <tbody>
    <tr><td>β-barium borate (BBO), type I</td><td>d<sub>22</sub> = 2.2 pm/V at 1064 nm (2.16 before rounding) ${cite(10)}</td><td>about 2 pm/V (d<sub>22</sub> times a factor near 1 that depends on the angles)</td></tr>
    <tr><td>Periodically poled lithium niobate (PPLN)</td><td>d<sub>33</sub> = 25.2 pm/V at 1064 nm ${cite(9)}</td><td>about 16 pm/V = (2/π) d<sub>33</sub> ${cite(11)}</td></tr>
    <tr><td>Periodically poled KTP (PPKTP)</td><td>d<sub>33</sub> = 14.6 pm/V at 1064 nm ${cite(9)}</td><td>about 9 pm/V = (2/π) d<sub>33</sub></td></tr>
  </tbody>
</table>
<p>These are orders of magnitude, not design values: the coefficients depend on wavelength (they fall towards the infrared), on the crystal’s composition and on the measurement: Eckardt et al. give about 4 % reproducibility and about 10 % absolute accuracy ${cite(10)}. Use the d<sub>eff</sub> of your crystal cut from its data sheet or a crystal handbook ${cite(8)}.</p>`,
      },
      {
        id: 'parameters',
        title: 'Every parameter',
        parameterTable: true,
        html: `<p>Inputs first, then the quantities the calculator derives. Units are those of the fields above; the calculator converts them to SI before calling the app’s functions.</p>`,
        rows: [
          ['λ<sub>p</sub>', 'Pump wavelength', 'nm', 'Vacuum wavelength of the pump, the shortest of the three waves.'],
          ['P<sub>p</sub>', 'Pump average power', 'W', 'Sets the energy budget. Pulse energy = P<sub>p</sub>/f<sub>rep</sub>. It does not set the gain: the peak intensity does.'],
          ['I<sub>p</sub>', 'Pump peak intensity', 'GW/cm²', 'On-axis peak intensity inside the crystal (1 GW/cm² = 10¹³ W/m²). Γ ∝ √I<sub>p</sub>. Kept separate from the power because the beam size is not an input; the results show the beam radius the two imply.'],
          ['τ<sub>p</sub>, τ<sub>s</sub>', 'Pulse durations', 'fs', 'FWHM of the Gaussian intensity envelopes. A pulse must last less than 5 % of the period.'],
          ['f<sub>rep</sub>', 'Repetition rate', 'MHz', 'Shared by pump and seed (unequal rates are not modelled).'],
          ['d<sub>eff</sub>', 'Effective nonlinear coefficient', 'pm/V', 'See the section above. Γ ∝ d<sub>eff</sub>.'],
          ['n<sub>p</sub>, n<sub>s</sub>, n<sub>i</sub>', 'Refractive indices', '—', 'At each wave’s wavelength and polarization. They enter Γ and Δk.'],
          ['L', 'Crystal length', 'mm', 'Interaction length. Pulses are assumed to stay together over it (no group-velocity walk-off).'],
          ['Δk', 'Phase mismatch', '1/mm', 'k<sub>p</sub> − k<sub>s</sub> − k<sub>i</sub>, minus 2π/Λ for quasi-phase matching. Enter it from your own phase-matching calculation; this page has no dispersion data.'],
          ['η<sub>max</sub>', 'Depletion limit', '—', 'Largest fraction of the pump energy converted in any instant. 1 is the plane-wave limit; real beams convert less because their wings are pumped weakly.'],
          ['λ<sub>s</sub>, P<sub>s</sub>', 'Seed wavelength and average power', 'nm, W', 'The signal to be amplified. Without a seed there is no output: parametric noise (optical parametric generation) is not modelled.'],
          ['Δt', 'Seed delay', 'fs', 'Arrival of the seed peak after the pump peak, taken at the nearest pulse of the train.'],
          ['λ<sub>i</sub>', 'Idler wavelength', 'nm', 'From energy conservation.'],
          ['Γ, ΓL', 'Gain coefficient and gain length', '1/mm, —', 'Γ at the peak pump intensity. ΓL ≈ 1 is the start of useful gain; ΓL ≈ 10 gives G ~ 10⁸.'],
          ['G', 'Peak small-signal gain', '—, dB', 'Undepleted gain at the pulse peak, with its regime (exponential, boundary, oscillatory).'],
          ['Ḡ, Ḡ<sub>0</sub>', 'Achieved signal gain, and without depletion', '—', 'Average-power gain of the seed after the pulse averaging, with (Ḡ) and without (Ḡ<sub>0</sub>) the energy limit.'],
          ['η', 'Pump conversion', '%', 'Fraction of the pump energy converted to signal plus idler.'],
          ['w', 'Implied pump beam radius', 'µm', 'The 1/e² radius for which P<sub>peak</sub> gives I<sub>p</sub>.'],
        ],
      },
      {
        id: 'graphs',
        title: 'Reading the graphs',
        html: `<p><b>1. Signal gain against seed delay.</b> Each point is the whole calculation repeated with the seed arriving earlier or later. The blue curve includes the energy limit, the green one does not. Their gap shows where the pump is being depleted: the blue curve flattens where the seed takes all the pump energy it meets. The gain falls much faster than the pulses’ overlap, because the exponent follows the pump intensity. Shown only when both pump and seed are pulsed.</p>
<p><b>2. Pump conversion against crystal length.</b> The blue curve is the model the app uses: undepleted gain limited by the pump energy in each instant. The <b>orange curve is an exact reference for plane waves</b>: the same pulses, timing and seed, cut into time slices, but in each slice the coupled equations are solved with pump depletion instead of the energy limit; the note under the graph says how well its time average has converged. Where the two agree, the limit is a good approximation. Past the optimum length they separate: a real plane wave converts energy back into the pump (back-conversion), so the orange curve peaks and then falls, while the model stays at its limit. A single plane wave would fall to zero and rise again periodically; the orange curve is smoother because each instant of the pulse reaches its optimum at a different length. In a real beam, the transverse profile smooths it further ${cite(15, 13)}. The orange curve ignores η<sub>max</sub> and is drawn for one seed only.</p>
<p><b>3. Signal gain against peak pump intensity.</b> The whole calculation repeated at other pump intensities, with and without the energy limit. At low intensity both follow the exponential growth; where they separate, the pump starts to be depleted and the gain saturates.</p>
<p>Hover or tap a graph to read its values; each graph also has a table of its data.</p>`,
      },
      {
        id: 'precision',
        title: 'How precise is it?',
        html: `<p>Two different questions: how accurately the page evaluates its model, and how well the model describes a real amplifier.</p>
<h3>Numerical precision: the model is evaluated almost exactly</h3>
<table class="param-table">
  <thead><tr><th>Quantity</th><th>Checked against</th><th>Worst disagreement</th></tr></thead>
  <tbody>
    <tr><td>Gain coefficient Γ</td><td>The angular-frequency form of Manzoni &amp; Cerullo’s eq. 2.9 ${cite(17)}</td><td>1 × 10⁻¹⁰</td></tr>
    <tr><td>Undepleted gain G, all regimes</td><td>The analytic cosh²(ΓL) and a Runge–Kutta integration of the coupled equations</td><td>4 × 10⁻¹⁰</td></tr>
    <tr><td>Pulse-averaged gain Ḡ</td><td>Simpson integration on a 20 000-interval grid</td><td>1 × 10⁻¹⁰ (tolerance 10⁻⁶)</td></tr>
    <tr><td>Depleted conversion, one time slice</td><td>The elliptic closed form above, and a 60 000-step Runge–Kutta at Δk ≠ 0</td><td>3.4 × 10⁻⁷ absolute</td></tr>
    <tr><td>Orange curve, averaged over the pulses</td><td>Itself on a grid of twice as many time slices: the slices are doubled until two successive grids agree within 0.2 percentage points at every plotted length. If that would need too much computation (very high gain or long crystals), the curve is not drawn and the graph says why.</td><td>≤ 0.2 percentage points between the last two grids (shown under the graph)</td></tr>
    <tr><td>Energy and photon balance</td><td>Pump in = pump out + signal gain + idler, in every result</td><td>rounding (≈ 10⁻¹⁶ W)</td></tr>
  </tbody>
</table>
<p>The references are written separately in Python from the published equations (<a href="${GITHUB}/validation/reference/opa.py" target="_blank" rel="noopener">opa.py</a>) and run on every change; see the <a href="${GITHUB}/docs/validation.md" target="_blank" rel="noopener">validation table</a>. A test also checks that this page passes the app’s functions the same inputs, in the same units, that you typed.</p>
<h3>Physical accuracy: a guide to trends and orders of magnitude</h3>
<p>Manzoni &amp; Cerullo describe the undepleted, monochromatic plane-wave calculation as giving “the upper limit for the parametric gain” ${cite(17)}; the peak small-signal gain here is that quantity, under the assumptions stated above. Real amplifiers fall below it because:</p>
<ul>
  <li>only the centre of a real beam sees the peak intensity, and the beam profile changes during amplification (gain guiding) ${cite(15)};</li>
  <li>signal, idler and pump travel at different group velocities and separate after the pulse-splitting length, which ends the gain for short pulses ${cite(17, 14)};</li>
  <li>birefringent walk-off separates the beams in space, and dispersion inside the crystal chirps the pulses;</li>
  <li>absorption of the idler changes the energy transfer: it reduces the small-signal gain, while in pulsed oscillators it can even raise the efficiency by suppressing back-conversion ${cite(18)}; either way it needs a model with losses;</li>
  <li>a real crystal is never exactly phase matched over the whole seed spectrum.</li>
</ul>
<p>The gain is also very sensitive to its inputs. At high gain G ≈ ¼e<sup>2ΓL</sup>. At ΓL = 7, a 10 % error in d<sub>eff</sub> (the absolute accuracy of the measured coefficients ${cite(10)}) changes the small-signal gain by a factor of about 4.1, and a 20 % error in the intensity by about 3.8. Read the page for orders of magnitude, trends, the idler wavelength, the energy balance and the timing tolerance; for design, use a model that includes the beams’ transverse profile and the pulses’ propagation ${cite(13, 15)}.</p>`,
      },
      {
        id: 'limits',
        title: 'What is not modelled',
        html: `<ul>
  <li>Transverse beam profile, diffraction, gain guiding and spatial walk-off: all waves are plane waves at the peak intensity ${cite(15)}.</li>
  <li>Group-velocity mismatch, group-velocity dispersion and chirp inside the crystal: each instant of the pulse is amplified independently ${cite(17)}.</li>
  <li>Noncollinear geometry (NOPA) and its broadband phase matching ${cite(19, 14)}; the phase mismatch is a number you enter, not computed from dispersion data.</li>
  <li>Parametric noise: an unseeded crystal gives nothing here, while a real one produces parametric fluorescence (optical parametric generation) ${cite(5)}.</li>
  <li>The degenerate case λ<sub>s</sub> = 2λ<sub>p</sub> with signal and idler in one mode, which is phase-sensitive ${cite(21)}; the calculator declines it.</li>
  <li>A seeded idler, absorption (of any wave), thermal effects and crystal damage.</li>
  <li>Back-conversion in the model itself: only the orange reference curve shows it, for plane waves.</li>
</ul>`,
      },
    ],
    references: [
      { label: 'J. A. Armstrong, N. Bloembergen, J. Ducuing and P. S. Pershan, “Interactions between light waves in a nonlinear dielectric”, Phys. Rev. 127, 1918–1939 (1962)', url: 'https://doi.org/10.1103/PhysRev.127.1918' },
      { label: 'N. M. Kroll, “Parametric amplification in spatially extended media and application to the design of tuneable oscillators at optical frequencies”, Phys. Rev. 127, 1207–1211 (1962)', url: 'https://doi.org/10.1103/PhysRev.127.1207' },
      { label: 'J. A. Giordmaine and R. C. Miller, “Tunable coherent parametric oscillation in LiNbO₃ at optical frequencies”, Phys. Rev. Lett. 14, 973–976 (1965)', url: 'https://doi.org/10.1103/PhysRevLett.14.973' },
      { label: 'S. E. Harris, “Tunable optical parametric oscillators”, Proc. IEEE 57, 2096–2113 (1969)', url: 'https://doi.org/10.1109/PROC.1969.7495' },
      { label: 'B. R. Mollow and R. J. Glauber, “Quantum theory of parametric amplification. I”, Phys. Rev. 160, 1076–1096 (1967)', url: 'https://doi.org/10.1103/PhysRev.160.1076' },
      { label: 'R. A. Baumgartner and R. L. Byer, “Optical parametric amplification”, IEEE J. Quantum Electron. 15, 432–444 (1979); author copy', url: 'https://web.stanford.edu/~rlbyer/PDF_AllPubs/1979/80.pdf' },
      { label: 'R. W. Boyd, Nonlinear Optics, 4th ed., Academic Press (2020), ISBN 978-0-12-811002-7: chapters 1–2', url: 'https://www.sciencedirect.com/book/monograph/9780128110027/nonlinear-optics' },
      { label: 'D. N. Nikogosyan, Nonlinear Optical Crystals: A Complete Survey, Springer (2005), ISBN 978-0-387-22022-2', url: 'https://springer.com/us/book/9780387220222' },
      { label: 'I. Shoji, T. Kondo, A. Kitamoto, M. Shirane and R. Ito, “Absolute scale of second-order nonlinear-optical coefficients”, J. Opt. Soc. Am. B 14, 2268 (1997)', url: 'https://doi.org/10.1364/JOSAB.14.002268' },
      { label: 'R. C. Eckardt, H. Masuda, Y. X. Fan and R. L. Byer, “Absolute and relative nonlinear optical coefficients of KDP, KD*P, BaB₂O₄, LiIO₃, MgO:LiNbO₃, and KTP measured by phase-matched second-harmonic generation”, IEEE J. Quantum Electron. 26, 922–933 (1990)', url: 'https://doi.org/10.1109/3.55534' },
      { label: 'M. M. Fejer, G. A. Magel, D. H. Jundt and R. L. Byer, “Quasi-phase-matched second harmonic generation: tuning and tolerances”, IEEE J. Quantum Electron. 28, 2631–2654 (1992)', url: 'https://doi.org/10.1109/3.161322' },
      { label: 'A. Dubietis, G. Jonušauskas and A. Piskarskas, “Powerful femtosecond pulse generation by chirped and stretched pulse parametric amplification in BBO crystal”, Opt. Commun. 88, 437–440 (1992)', url: 'https://doi.org/10.1016/0030-4018(92)90070-8' },
      { label: 'I. N. Ross, P. Matousek, G. H. C. New and K. Osvay, “Analysis and optimization of optical parametric chirped pulse amplification”, J. Opt. Soc. Am. B 19, 2945 (2002)', url: 'https://doi.org/10.1364/JOSAB.19.002945' },
      { label: 'G. Cerullo and S. De Silvestri, “Ultrafast optical parametric amplifiers”, Rev. Sci. Instrum. 74, 1–18 (2003)', url: 'https://doi.org/10.1063/1.1523642' },
      { label: 'G. Arisholm, R. Paschotta and T. Südmeyer, “Limits to the power scalability of high-gain optical parametric amplifiers”, J. Opt. Soc. Am. B 21, 578 (2004)', url: 'https://doi.org/10.1364/JOSAB.21.000578' },
      { label: 'A. Dubietis, R. Butkus and A. P. Piskarskas, “Trends in chirped pulse optical parametric amplification”, IEEE J. Sel. Top. Quantum Electron. 12, 163–172 (2006)', url: 'https://doi.org/10.1109/JSTQE.2006.871962' },
      { label: 'C. Manzoni and G. Cerullo, “Design criteria for ultrafast optical parametric amplifiers”, J. Opt. 18, 103501 (2016), open access', url: 'https://doi.org/10.1088/2040-8978/18/10/103501' },
      { label: 'G. Rustad, G. Arisholm and Ø. Farsund, “Effect of idler absorption in pulsed optical parametric oscillators”, Opt. Express 19, 2815 (2011)', url: 'https://doi.org/10.1364/OE.19.002815' },
      { label: 'T. Wilhelm, J. Piel and E. Riedle, “Sub-20-fs pulses tunable across the visible from a blue-pumped single-pass noncollinear parametric converter”, Opt. Lett. 22, 1494 (1997)', url: 'https://doi.org/10.1364/OL.22.001494' },
      { label: 'NIST Digital Library of Mathematical Functions, chapter 22: Jacobian elliptic functions', url: 'https://dlmf.nist.gov/22' },
      { label: 'R. Paschotta, “Optical parametric amplifiers” and “Parametric amplification”, RP Photonics Encyclopedia', url: 'https://www.rp-photonics.com/optical_parametric_amplifiers.html' },
    ],
  },
];
