// Structured content for the OpticalSetup wiki. One entry per flagship
// component. `tools/build-wiki.mjs` turns this into static pages, pulling
// the live icon and current defaults straight from the component registry
// so the wiki can never silently drift from what the app actually ships.
//
// Every claim under `inOpticalSetup` must be verified against the actual
// implementation (js/raytrace.js, js/polarization.js) before it's written
// here — see the physics verification pass in the branch's history.
//
// Citations: whenever a factual claim in the prose needs a source, cite it
// inline, academic-style, with `cite(n)` or `cite(n, m, ...)` at the point
// the claim is made, e.g. `...sub-arcsecond alignment tolerance${cite(1, 2)}.`
// The numbers are 1-indexed positions into that entry's own `citations`
// array; each renders as a clickable [n] linking to the matching numbered
// entry in the page's "References" section (built by build-wiki.mjs). Use
// `resources` instead for general further-reading links not tied to one
// specific claim.
function cite(...nums) {
  return `<sup class="cite">[${nums.map(n => `<a href="#ref-${n}">${n}</a>`).join(',')}]</sup>`;
}


// Wiki subjects that are drawing tools rather than registry components. A
// fiber is a path in state.beams, so it has no registry svg() or metadata to
// read — it supplies its own icon and tagline here instead.
export const wikiToolSubjects = [
  {
    type: 'fiber',
    label: 'Optical fiber',
    tagline: 'Routes light along a drawn path between two connectorized ends, with its own acceptance angle, loss, and output cone.',
    icon: `<path d="M -20,6 Q -4,6 0,0 Q 4,-6 20,-6" fill="none" stroke="#e8a800" stroke-width="4" stroke-linecap="round"/>`
      + `<g transform="translate(-20 6) rotate(-20)"><rect x="-11" y="-5" width="11" height="10" rx="1.5" fill="#4d565f"/><rect x="-15" y="-2.5" width="4" height="5" fill="#8d98a5"/></g>`
      + `<g transform="translate(20 -6) rotate(160)"><rect x="-11" y="-5" width="11" height="10" rx="1.5" fill="#4d565f"/><rect x="-15" y="-2.5" width="4" height="5" fill="#8d98a5"/></g>`,
  },
  {
    type: 'barefiber',
    label: 'Bare fiber',
    tagline: 'The same guided path with the connector plugs omitted and flat-cleaved ends, for custom laboratory assemblies.',
    icon: `<path d="M -20,6 Q -4,6 0,0 Q 4,-6 20,-6" fill="none" stroke="#e8a800" stroke-width="4" stroke-linecap="butt"/>`,
  },
];

export const wikiEntries = [
  {
    type: 'cwlaser',
    title: 'CW Laser',
    category: 'Sources',
    realWorld: {
      html: `
        <p>Laser technology occupies a central position within photonics because laser
        light exhibits several properties that distinguish it from conventional light
        sources, beyond simple monochromaticity. A laser beam is characterized by high
        spatial coherence, which permits propagation over considerable distances with
        minimal divergence — frequently limited only by diffraction — and allows the beam
        to be focused to a very small spot, yielding a correspondingly high intensity.</p>
        <p>This coherence typically extends to the temporal domain as well: a
        continuous-wave laser emits within a very narrow spectral bandwidth, in contrast
        to sources such as incandescent or gas-discharge lamps, which radiate across a
        broad spectral range. Emission is steady rather than pulsed: the output power a
        detector reads is the same at every instant.</p>
        <p>The theoretical foundation for the laser predates its experimental realization:
        Townes, Schawlow, Basov, and Prokhorov independently developed the theory of
        stimulated emission as a mechanism for light amplification, building on the
        microwave maser Townes had demonstrated in 1953 — the concept was initially termed
        the "optical maser" before "laser" became standard usage. Theodore Maiman first
        realized this theory experimentally in 1960, constructing the first laser: a
        pulsed, lamp-pumped ruby crystal. The same year saw two further milestones: the
        helium–neon laser, the first to operate with a gaseous gain medium, and the first
        semiconductor laser diode.</p>
        <p>Real laser beams are not perfectly collimated: they exhibit Gaussian
        propagation and diverge with distance. For a beam of waist radius
        <span class="w">w₀</span>, the far-field half-angle divergence is given by</p>`,
      formulas: [
        { tex: '\\theta \\approx \\frac{\\lambda}{\\pi w_0}', caption: 'Far-field divergence half-angle of a Gaussian beam (small-angle, TEM₀₀ mode).' },
        { tex: 'E_{\\text{photon}} = \\frac{hc}{\\lambda}', caption: 'Photon energy — why shorter wavelengths (blue, UV) carry more energy per photon than longer ones (red, IR).' },
      ],
      html2: `
        <p>These properties originate from stimulated emission within a resonant cavity:
        a gain medium bounded by two mirrors amplifies a specific wavelength on each round
        trip, while losses — mirror transmission, absorption, scattering — deplete it.
        Above threshold, the pump rate at which round-trip gain first equals round-trip
        loss, the cavity sustains the stable, highly monochromatic, spatially coherent
        beam described above.</p>
        <h3>Coherence length</h3>
        <p>No real laser is perfectly monochromatic. The emission occupies a finite
        linewidth, and the physical meaning of that linewidth is that the optical phase
        drifts: predict the phase far enough ahead and the prediction stops being right.
        <em>Coherence length</em> is the distance over which the phase stays predictable —
        formally the coherence time times the vacuum speed of light${cite(1)}.</p>
        <p>It matters because it decides whether an experiment sees fringes. Split a beam,
        send the halves down two arms and recombine them: the two waves can only interfere
        if the one arriving from the long arm still remembers the phase of the one from the
        short arm. Make the arms differ by much more than the coherence length and the
        fringes vanish, leaving the ports simply to add their powers${cite(1)}. The same
        constraint sets how deep a hologram can be recorded, and how far apart the two arms
        of an interferometric sensor may be.</p>
        <p>Linewidth and coherence length are inversely related, though the exact prefactor
        depends on the lineshape and is not universal${cite(1, 2)}. For the Lorentzian spectrum produced
        by a random walk of the optical phase, the expression is${cite(1)}</p>`,
      formulas2: [
        { tex: 'L_{\\text{coh}} = c\\,\\tau_{\\text{coh}} = \\frac{c}{\\pi\\,\\Delta\\nu}', caption: 'Lorentzian lineshape: the distance at which the coherence function falls to 1/e, for a FWHM linewidth Δν. The literature often quotes this without the π when only an order of magnitude is wanted.' },
      ],
      html3: `
        <p>The span across real sources is enormous. A stabilised single-frequency
        solid-state laser at 10&nbsp;kHz linewidth reaches roughly 9.5&nbsp;km; systems
        built for optical clocks, stabilised below 1&nbsp;Hz, exceed 300 000&nbsp;km. A
        laser diode is far shorter, limited by phase noise from spontaneous emission in a
        short, strongly out-coupled resonator. At the opposite extreme, the superluminescent
        diodes used for optical coherence tomography are made <em>deliberately</em>
        broadband — tens of nanometres — precisely because a coherence length of a few
        micrometres is what gives that technique its axial resolution: only light returning
        from one narrow depth can still interfere with the reference${cite(1)}.</p>
        <p>Two cautions are worth carrying. The shape and width of a spectrum do not by
        themselves fully determine coherence: a frequency comb has a broad spectrum and
        excellent long-range coherence, and no single-number coherence length describes
        it${cite(1)}. And “coherence length” is not one quantity but a family of them —
        several inequivalent definitions are in use, and which is meant matters as soon as
        a real source departs from an idealised lineshape${cite(2)}.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The CW Laser emits either a single collimated ray or, in <em>Beam with
        size</em> mode, a fan of 25 parallel rays sampling a finite beam width — this is
        what lets the tracer show a lens actually focusing a beam of nonzero extent,
        rather than a single infinitesimal ray that can never miss an aperture.</p>
        <p>Its spectrum is monochromatic by construction: the beam carries one wavelength
        and is drawn and detected as one colour. That is the point of the split between the
        three laser sources — a bench that needs real spectral <em>width</em>, with distinct
        wavelengths propagating and dispersing separately, needs the Pulsed Laser or the
        Supercontinuum laser instead, both of which model where that width comes from.
        Polarization is set directly as a Stokes vector rather than emerging from a modeled
        cavity.</p>
        <p>What the CW Laser does carry is a <strong>coherence length</strong>, and it is
        the one place a linewidth enters this source. It changes no ray and no colour; it
        decides how far the two arms of an interferometer may differ before their fringes
        fade. Fields recombining at a beamsplitter are weighted, pair by pair, by a Gaussian
        visibility in their path difference.</p>`,
      formulas: [
        { tex: 'V(\\Delta L) = \\exp\\!\\left[-4\\ln 2\\left(\\frac{\\Delta L}{l_c}\\right)^{2}\\right]', caption: 'Fringe visibility against arm mismatch. The coherence length l_c is the full width at half maximum of this envelope, so ΔL = l_c/2 halves the contrast.' },
        { tex: 'l_c = \\frac{2\\ln 2}{\\pi}\\,\\frac{\\lambda^{2}}{\\Delta\\lambda}', caption: 'The linewidth the inspector reports as implied by a given coherence length — the Gaussian convention standard in optical coherence tomography, where l_c is the axial resolution.' },
      ],
      html2: `
        <p>Zero, the default, means the idealised source: the arms interfere perfectly
        however far apart they are, which is how every scene behaved before this parameter
        existed. Give it a finite value and the bench becomes a ruler — sweep the delay line
        and fringes appear only where the arms match, which is the measurement an
        interferometer is actually for. The inspector reports the linewidth that coherence
        length implies, so the two ways of describing the same source stay visible together:
        50&nbsp;nm at 840&nbsp;nm gives 6.2&nbsp;µm, the familiar axial resolution of a
        broadband OCT source.</p>
        <p>Note the convention. This model uses the Gaussian form standard in optical
        coherence tomography, in which <span class="w">l<sub>c</sub></span> is the
        <em>full width at half maximum</em> of the visibility envelope. The Lorentzian
        expression quoted above${cite(1)} is a different definition — the 1/e point of a
        differently shaped coherence function — and the two disagree by a numerical factor.
        Neither is more correct: they describe different lineshapes under different
        conventions, and real source spectra are non-Gaussian often enough that the choice
        of definition is itself a documented source of disagreement${cite(2)}.</p>
        <p>Energy is conserved at every visibility: the self-powers of the recombining
        fields always add, and only their cross term is scaled by
        <span class="w">V</span>. The two ports of an interferometer therefore always sum to
        the input, whether they are fringing hard or have washed out to a flat half
        each.</p>`,
      limitations: `<p>There is no modeled gain medium, cavity round trip, or threshold —
        wavelength, polarization, and power are configured directly as source parameters,
        not derived from first principles. Divergence and M² are not modeled: a collimated
        beam stays perfectly parallel over any distance.</p>
        <p>Coherence length is a visibility envelope applied at recombination, not a
        simulated phase-noise process: the beam carries no actual linewidth, so the source
        stays exactly one wavelength for colour, dispersion, and every spectral readout, and
        the implied linewidth is reported rather than propagated. Spatial coherence is not
        modelled at all — only the temporal kind — and the envelope is Gaussian by
        assumption, so a lineshape that behaves differently, a frequency comb above all,
        cannot be represented by this single number.</p>`,
    },
    related: ['pulsedlaser', 'sclaser', 'pointsource', 'mirror'],
    citations: [
      { label: '“Coherence Length,” RP Photonics Encyclopedia', url: 'https://www.rp-photonics.com/coherence_length.html' },
      { label: 'C. Akcay, P. Parrein and J. P. Rolland, “Estimation of longitudinal resolution in optical coherence imaging,” Applied Optics 41(25), 5256–5262 (2002) — compares several definitions of coherence length and the limits of the Gaussian assumption for real source spectra', url: 'https://doi.org/10.1364/AO.41.005256' },
    ],
    resources: [
      { label: 'RP Photonics Encyclopedia — Lasers', url: 'https://www.rp-photonics.com/lasers.html' },
      { label: 'RP Photonics Encyclopedia — Laser Light', url: 'https://www.rp-photonics.com/laser_light.html' },
    ],
  },

  {
    type: 'pulsedlaser',
    title: 'Pulsed Laser',
    category: 'Sources',
    realWorld: {
      html: `
        <p>A pulsed laser concentrates its output into short bursts separated by a fixed
        repetition period, rather than emitting steadily. Concentrating a given pulse
        energy into a shorter duration — in addition to spatial concentration at a focus —
        enables substantially higher intensities than continuous-wave operation can
        achieve; the most extreme intensities produced this way are employed in high-field
        physics, and more modest ones drive the nonlinear processes behind multiphoton
        microscopy and two-photon polymerization.</p>
        <p>Pulse durations range from microseconds down to a few femtoseconds. The average
        power a power meter reads is the pulse energy divided by the repetition period; the
        peak power reached within a pulse is far larger, by roughly the ratio of the
        repetition period to the pulse duration.</p>
        <p>Ultrafast lasers are inherently broadband: a sufficiently short pulse duration
        necessarily corresponds to a correspondingly broad frequency spectrum. A pulse
        whose spectral width is exactly the minimum its duration allows is called
        transform-limited — it carries no residual chirp, and it is the shortest pulse
        that spectrum could possibly support. The dimensionless product below depends only
        on the envelope shape.</p>`,
      formulas: [
        { tex: '\\Delta\\nu \\, \\Delta t \\geq K', caption: 'Time–bandwidth product. K = 0.441 for a Gaussian envelope, 0.315 for a sech². Equality is the transform-limited case.' },
        { tex: 'P_{\\text{peak}} \\approx K_{s} \\, \\frac{P_{\\text{avg}}}{f_{\\text{rep}} \\, \\tau}', caption: 'Peak power: the pulse energy P_avg / f_rep delivered within one pulse duration τ, with a shape factor K_s (0.94 Gaussian, 0.88 sech²).' },
      ],
      html2: `
        <p>Short pulses are produced by mode locking: a fixed phase relationship is
        enforced across many longitudinal cavity modes, so that they interfere
        constructively for a brief instant on each cavity round trip and destructively the
        rest of the time. The repetition rate that results is set by the cavity round-trip
        time, which is why typical mode-locked oscillators sit in the tens of MHz.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The Pulsed Laser emits the same collimated ray or 25-ray sampled beam as the CW
        Laser, plus a pulse train: a repetition rate, a pulse duration, and an emission
        offset that shifts this source's pulses in time relative to any other. That timing
        is what drives the travelling packet overlay, the oscilloscope view on a
        photodetector, chopper and AOM/EOM gating, and the two-colour temporal overlap
        that CARS and SFG require.</p>
        <p>Bandwidth follows the pulse: while <em>Transform-limited</em> is on, the
        spectral width is computed from the duration and the chosen envelope shape, so a
        shorter pulse automatically becomes a wider spectrum. Turning it off exposes the
        bandwidth directly for a chirped or spectrally shaped pulse; setting it to 0&nbsp;nm
        models an idealized monochromatic pulse train. Peak power is reported back as a
        derived readout, never entered.</p>
        <p><em>Show pulse dynamics</em> is a drawing choice only — switching it off leaves
        the beam rendered as a steady CW line while every bit of the pulse physics above
        keeps running.</p>
        <h3>Dispersion and pulse stretching</h3>
        <p>Every pulsed detector reports accumulated group-delay dispersion (GDD) in
        fs². Catalogue-glass bodies add their traced distance through the selected
        Sellmeier material; zero-thickness lenses and objectives add the clearly marked
        estimates described on their own pages. For a transform-limited Gaussian input,
        the detector also reports the corresponding broadened duration, and the travelling
        packet length follows that duration locally: it grows through glass and contracts
        when a Pulse Compressor cancels the accumulated GDD. GDD remains the
        primary number because it is additive and meaningful even when a 150&nbsp;fs pulse
        changes too little to notice.</p>`,
      formulas: [
        { tex: '\\tau_{out}=\\tau_{in}\\sqrt{1+\\left(4\\ln 2\\,\\mathrm{GDD}/\\tau_{in}^{2}\\right)^2}', caption: 'Second-order broadening of a transform-limited Gaussian pulse.' },
      ],
      limitations: `<p>There is no modeled gain medium, cavity, or mode-locking mechanism —
        repetition rate, duration, and shape are configured directly. The duration estimate
        uses second-order GDD only and is shown only for a transform-limited Gaussian input;
        pre-existing chirp, third- and higher-order dispersion, self-phase modulation, and
        material absorption are not inferred. Divergence and M² are not modeled.</p>`,
    },
    related: ['cwlaser', 'sclaser', 'pulsecompressor', 'objective', 'stage'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Mode Locking', url: 'https://www.rp-photonics.com/mode_locking.html' },
      { label: 'RP Photonics Encyclopedia — Time–Bandwidth Product', url: 'https://www.rp-photonics.com/time_bandwidth_product.html' },
    ],
  },

  {
    type: 'pulsecompressor',
    title: 'Pulse Compressor',
    category: 'Pulse Timing',
    realWorld: {
      html: `
        <p>An ultrashort pulse is shortest when its frequency components arrive with the
        spectral phase required by its transform limit. Material dispersion makes those
        components acquire different delays, producing chirp and a longer temporal
        envelope. A pulse compressor introduces the opposite spectral-phase curvature so
        the accumulated group-delay dispersion (GDD) approaches zero and the pulse becomes
        shorter again.</p>
        <p>Real compressors commonly use diffraction-grating pairs, prism pairs, chirped
        mirrors, or combinations of them. Their geometry determines not only second-order
        GDD but also third- and higher-order dispersion, throughput, spatial chirp, and
        alignment sensitivity. The useful setting therefore compensates the measured
        upstream dispersion rather than having a universally correct negative value.</p>`,
      formulas: [
        { tex: '\\mathrm{GDD}_{out}=\\mathrm{GDD}_{in}+\\mathrm{GDD}_{comp}', caption: 'Second-order compensation is additive; shortest duration occurs near zero net GDD for a transform-limited Gaussian input.' },
        { tex: '\\tau_{out}=\\tau_{0}\\sqrt{1+\\left(4\\ln 2\\,\\mathrm{GDD}_{out}/\\tau_{0}^{2}\\right)^2}', caption: 'Gaussian pulse duration under the second-order-only model used by OpticalSetup.' },
      ],
    },
    inOpticalSetup: {
      html: `
        <p>The Pulse Compressor is a straight-through, zero-thickness GDD element. Set
        <em>Applied GDD</em> positive or negative; the value is added to every pulsed ray
        crossing its clear aperture, while transmission efficiency applies the configured
        loss. A negative setting compresses only when it cancels positive GDD already on
        the path — placed before any glass, the same negative magnitude broadens a
        transform-limited pulse instead.</p>
        <p>For a transform-limited Gaussian source, the travelling packet overlay reads the
        local accumulated GDD along each traced segment. Its envelope grows continuously
        through catalogue glass and changes at the compressor, so the same pulse can be
        watched stretching and then returning toward its input length. The true duration,
        GDD, and stretch factor remain available numerically at a downstream detector.</p>`,
      formulas: [],
      limitations: `<p>This is a lumped second-order phase proxy, not a physical compressor
        prescription. It does not trace the compressor's internal grating, prism, or
        chirped-mirror geometry; it does not model carrier phase, third-order dispersion,
        spatial chirp, pulse-front tilt, nonlinear phase, or an independently authored
        input chirp. On-screen packet length is a qualitative glyph with an 8× display cap;
        detector numbers retain the unclamped second-order result.</p>`,
    },
    related: ['pulsedlaser', 'glassrod', 'prism', 'detector'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Pulse Compression', url: 'https://www.rp-photonics.com/pulse_compression.html' },
      { label: 'RP Photonics Encyclopedia — Group Delay Dispersion', url: 'https://www.rp-photonics.com/group_delay_dispersion.html' },
    ],
  },

  {
    type: 'sclaser',
    title: 'Supercontinuum laser',
    category: 'Sources',
    realWorld: {
      html: `
        <p>A supercontinuum source produces light spanning hundreds of nanometres — often
        the whole visible range and beyond — while retaining the spatial coherence and
        collimation of a laser beam. It is, in effect, white light that behaves optically
        like a laser: it can be focused to a diffraction-limited spot and coupled into a
        single-mode fibre, neither of which a lamp of comparable bandwidth allows.</p>
        <p>The broadening is not produced by the gain medium. A pump laser — typically a
        mode-locked oscillator delivering high peak power — is launched into a strongly
        nonlinear medium, most often a photonic crystal fibre engineered so that its zero
        dispersion wavelength sits near the pump. Over a few centimetres, a cascade of
        nonlinear processes redistributes the pump energy across a vastly wider spectrum:
        self-phase modulation broadens it initially, then soliton fission, Raman
        self-frequency shift, and dispersive wave generation extend the edges.</p>
        <p>Because the process is pump-driven, the output inherits the pump's pulse train:
        a supercontinuum is emitted as pulses at the pump's repetition rate, not as steady
        light, even though it looks white. Spectral flatness and pulse-to-pulse stability
        vary considerably with how far into the anomalous-dispersion regime the source is
        driven.</p>`,
      formulas: [
        { tex: '\\gamma = \\frac{2\\pi n_2}{\\lambda A_{\\text{eff}}}', caption: 'Nonlinear coefficient of the broadening fibre — small effective area A_eff is what makes photonic crystal fibre so much more nonlinear than standard fibre.' },
      ],
      html2: `
        <p>Supercontinuum sources became practical laboratory instruments after photonic
        crystal fibre made it possible to place the zero-dispersion wavelength wherever the
        available pump happened to be, rather than the other way round. They are now
        standard in broadband spectroscopy, optical coherence tomography, and as tunable
        excitation sources for fluorescence microscopy, where a single box replaces a rack
        of discrete laser lines.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The Supercontinuum laser replaces a single wavelength with a spectrum minimum
        and maximum, and emits a flat-top band between them. Downstream wavelength-selective
        elements — filters, dichroics, etalons, the spectrometer — integrate against that
        true flat profile rather than a centroid, so a 20&nbsp;nm bandpass placed on a
        400&nbsp;nm-wide source transmits the fraction of power it actually overlaps.</p>
        <p>Dispersive elements (prisms, gratings) sample the band at several discrete
        wavelengths and fan them out individually, each carrying its own wavelength-derived
        colour — which is why a prism turns this source into a visible rainbow even though
        the undispersed beam is drawn as a single broadband white line.</p>
        <p>It carries the same pulse train as the Pulsed Laser, since a real supercontinuum
        inherits its pump's timing, but exposes no pulse duration of its own: that is a
        property of whatever generated the continuum upstream, which is not modeled here.</p>`,
      formulas: [],
      limitations: `<p>The spectrum is an idealized flat top, not a measured shape with the
        peaks, dips, and edge roll-off of a real continuum, and its shape does not change
        with pump power. No broadening is simulated: the band is declared, not generated
        from a pump and a nonlinear fibre. Pulse-to-pulse spectral noise, a real limitation
        of these sources, is not represented.</p>`,
    },
    related: ['cwlaser', 'pulsedlaser', 'prism', 'filter'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Supercontinuum Generation', url: 'https://www.rp-photonics.com/supercontinuum_generation.html' },
      { label: 'RP Photonics Encyclopedia — Photonic Crystal Fibers', url: 'https://www.rp-photonics.com/photonic_crystal_fibers.html' },
    ],
  },

  {
    type: 'mirror',
    title: 'Mirror',
    category: 'Mirrors',
    realWorld: {
      html: `
        <p>Reflection at a smooth interface follows the law of reflection: the angle of
        incidence equals the angle of reflection, both measured from the surface normal,
        with the incident and reflected rays in the same plane. In vector form, an
        incident direction <span class="w">d̂</span> reflecting off a surface with unit
        normal <span class="w">n̂</span> becomes:</p>`,
      formulas: [
        { tex: "\\hat{d}' = \\hat{d} - 2(\\hat{d}\\cdot\\hat{n})\\,\\hat{n}", caption: 'Vector form of the law of reflection.' },
        { tex: 'R = \\left(\\frac{n_1 - n_2}{n_1 + n_2}\\right)^{2}', caption: 'Fresnel reflectance at normal incidence for an uncoated dielectric interface — real mirrors instead use a metal or multilayer dielectric coating engineered for R close to 1 (or a deliberately partial value for an output coupler).' },
      ],
    },
    inOpticalSetup: {
      html: `
        <p>OpticalSetup implements the exact vector law of reflection shown above — the
        mirror surface's normal is computed from its two drawn endpoints, so rotating or
        resizing a mirror changes the reflected direction correctly at any angle.
        Reflectivity is a single configurable percentage: at 100% every ray reflects; below
        that, each incident ray splits into a reflected branch carrying fraction
        <span class="w">R</span> of the intensity and a transmitted branch carrying
        <span class="w">1 − R</span>, which is how a partially-reflective cavity mirror or
        output coupler is modeled.</p>`,
      formulas: [],
      limitations: `<p>Reflectivity is a single flat number: real coatings vary with angle
        of incidence and polarization (s- vs p-plane), and a metal mirror's reflectance
        varies with wavelength. None of that is modeled — <span class="w">R</span> is
        constant regardless of incidence angle, polarization, or color.</p>`,
    },
    related: ['cmirror', 'cmirrorx', 'oap', 'galvo', 'retroreflector', 'bs'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Mirrors', url: 'https://www.rp-photonics.com/mirrors.html' },
    ],
  },

  {
    type: 'lens',
    title: 'Convex lens',
    category: 'Lenses',
    realWorld: {
      html: `
        <p>A thin lens bends light by refraction at its two curved surfaces. In the
        paraxial approximation — rays close to the optical axis, at small angles — those
        two refractions collapse into a single relationship between object distance
        <span class="w">dₒ</span>, image distance <span class="w">dᵢ</span>, and focal
        length <span class="w">f</span>:</p>`,
      formulas: [
        { tex: '\\frac{1}{f} = \\frac{1}{d_o} + \\frac{1}{d_i}', caption: 'The thin-lens equation.' },
        { tex: 'm = -\\frac{d_i}{d_o}', caption: 'Transverse magnification — negative sign means an inverted image for a real image from a positive lens.' },
      ],
    },
    inOpticalSetup: {
      html: `
        <p>Rather than tracing the thin-lens equation for one axial object point at a
        time, OpticalSetup applies the equivalent <strong>paraxial ray-transfer
        relation</strong> to every individual ray that crosses the lens plane. For a ray
        crossing at height <span class="w">h</span> from the optical axis with incoming
        slope <span class="w">u</span> (the ratio of its transverse to axial direction
        components), the outgoing slope is:</p>`,
      formulas: [
        { tex: "u' = u - \\frac{h}{f}", caption: 'Paraxial ray-transfer equation for a thin lens — the same physics as the lens equation above, applied per-ray so any bundle of rays (not just one object point) focuses correctly.' },
      ],
      limitations: `<p>This is genuine paraxial optics, not a hand-wavy "bend toward
        focus": a beam of parallel rays offset from the axis really does converge at the
        back focal point, and an object arrow really does form an inverted, magnified, or
        demagnified image at the position the lens equation predicts. What's missing is
        everything paraxial theory leaves out by construction — spherical and chromatic
        aberration, finite lens geometry, and any behavior for rays far from the axis or
        at large angles. For pulse reporting only, the lens silently assumes N-BK7 and a
        centre thickness from spherical sag plus 2.5&nbsp;mm edge thickness. That
        diameter-aware estimate is typically within about 10% for ordinary plano-convex
        catalogue singlets; it does not change the traced ray geometry.</p>`,
    },
    related: ['lensc', 'metalens', 'thicklens', 'telescope', 'objective', 'cmirror'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Lenses', url: 'https://www.rp-photonics.com/lenses.html' },
    ],
  },

  {
    type: 'metalens',
    title: 'Metalens',
    category: 'Lenses',
    realWorld: {
      html: `
        <p>A metalens is a flat optical surface patterned with subwavelength
        structures. Those meta-atoms impose a position-dependent phase delay instead
        of relying on the curved entrance and exit faces of a glass lens. An ideal
        focusing phase profile at design wavelength <span class="w">λ₀</span> is
        hyperbolic rather than the quadratic profile of the paraxial limit:</p>`,
      formulas: [
        { tex: '\\phi(r,\\lambda_0) = -\\frac{2\\pi}{\\lambda_0}\\left(\\sqrt{f_0^2+r^2}-f_0\\right) \\pmod{2\\pi}', caption: 'Ideal phase required to bring a normally incident plane wave to a focus f₀ from radius r.' },
        { tex: '\\mathrm{NA} = \\sin\\!\\left[\\arctan\\!\\left(\\frac{D}{2|f_0|}\\right)\\right]', caption: 'Geometric numerical aperture in air for clear diameter D and focal length f₀.' },
      ],
      html2: `
        <p>The direction of that colour error is the surprising part, and worth
        holding on to: a metalens is chromatic the <em>opposite</em> way round from
        glass. A refractive lens has a higher index in the blue, so blue comes to a
        focus <em>nearer</em> than red. A diffractive surface has a focal length
        inversely proportional to wavelength, so <strong>red focuses nearer and blue
        further away</strong>. Their colour fringes therefore run in opposite
        directions — which is also why a diffractive surface can be used to cancel
        the chromatic aberration of a refractive one rather than compounding it.</p>
        <p>A phase pattern fabricated for one wavelength normally has strong
        diffractive chromaticity: longer wavelengths focus nearer and shorter
        wavelengths focus farther away. Achromatic metalenses add engineered group
        delay, but bandwidth, aperture, NA, polarization response, and efficiency are
        coupled design constraints rather than independent knobs${cite(1)}. Practical
        focusing efficiency also sends some incident power into zeroth order, unwanted
        diffraction orders, reflection, absorption, and scatter${cite(2)}.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>OpticalSetup treats the patterned surface as a zero-thickness paraxial
        phase-gradient proxy. In <strong>Chromatic</strong> mode, the nominal focal
        length <span class="w">f₀</span> is exact at the design wavelength and every
        sampled wavelength follows the ordinary diffractive scaling:</p>`,
      formulas: [
        { tex: 'f(\\lambda) = f_0\\frac{\\lambda_0}{\\lambda}', caption: 'The wavelength-dependent focal length used by the chromatic metalens trace.' },
        { tex: "u' = u - \\frac{h}{f(\\lambda)}", caption: 'Each sampled wavelength then uses the same paraxial ray-transfer relation as the ideal thin lens.' },
      ],
      html2: `
        <p>A broadband ray is expanded into the same weighted wavelength samples used
        by prisms and gratings, making axial color visible in the actual traced paths.
        <strong>Idealized achromatic band</strong> holds <span class="w">f=f₀</span>
        inside the chosen range and transitions continuously back to diffractive
        scaling outside it. Focusing efficiency attenuates the focused output by the
        configured power fraction.</p>`,
      limitations: `<p>No phase map or electromagnetic field is propagated. The
        simulator does not design meta-atoms, derive efficiency, show the unfocused
        zeroth order, validate group-delay feasibility, or calculate polarization
        conversion, PSF, MTF, Strehl ratio, diffraction-limited spot size, field angle,
        aberrations, substrate effects, or fabrication tolerances. Achromatic mode is
        explicitly an idealized system-level behavior, not proof that the selected
        diameter, NA, bandwidth, and efficiency can be fabricated together.</p>`,
    },
    related: ['lens', 'thicklens', 'grating', 'slm', 'objective'],
    // These two back the cited claims in the prose, so they belong in
    // `citations` -- that is what emits the #ref anchors the [1]/[2]
    // superscripts link to. Left only in `resources`, both links were dead.
    citations: [
      { label: 'Arbabi et al., “Subwavelength-thick lenses with high numerical apertures and large efficiency,” Nature Communications 6, 7069 (2015)', url: 'https://doi.org/10.1038/ncomms8069' },
      { label: 'Khorasaninejad et al., “Metalenses at visible wavelengths,” Science 352, 1190–1194 (2016)', url: 'https://doi.org/10.1126/science.aaf6644' },
    ],
    resources: [
      { label: 'RP Photonics Encyclopedia — Diffractive Optics', url: 'https://www.rp-photonics.com/diffractive_optics.html' },
      { label: 'RP Photonics Encyclopedia — Chromatic Aberrations', url: 'https://www.rp-photonics.com/chromatic_aberrations.html' },
    ],
  },

  {
    type: 'lensc',
    title: 'Concave lens',
    category: 'Lenses',
    realWorld: {
      html: `
        <p>A concave (diverging) lens obeys the exact same thin-lens equation as a convex
        one — the only difference is the sign of <span class="w">f</span>. A negative
        focal length always produces a negative image distance for a real object, which
        means a concave lens can <em>never</em> form a real image on its own: the rays
        always appear to diverge from a virtual, upright, reduced image on the same side
        as the object.</p>`,
      formulas: [
        { tex: '\\frac{1}{f} = \\frac{1}{d_o} + \\frac{1}{d_i}, \\qquad f < 0', caption: 'The thin-lens equation with a negative focal length — the defining property of a diverging lens.' },
      ],
      html2: `
        <p>Concave lenses correct myopia (short-sightedness) in eyeglasses, and paired
        with a convex lens they make a compact Galilean telescope or beam expander — see
        the telescope page.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>This is literally the same component as the <a href="../lens/">convex
        lens</a> — same paraxial ray-transfer relation <span class="w">u' = u −
        h/f</span>, same registry entry under the hood — just defaulting to a negative
        focal length. Setting a positive focal length on this element makes it behave
        exactly like a convex lens, and vice versa: the sign of <span class="w">f</span>
        is the only thing that determines converging versus diverging behavior anywhere
        in OpticalSetup.</p>`,
      formulas: [],
      limitations: `<p>Same caveats as the convex lens: exact paraxial geometry with no
        spherical or chromatic aberration. GDD alone uses the same diameter-aware N-BK7
        sag estimate (roughly a 10% class estimate); the assumed thickness never becomes
        traced geometry.</p>`,
    },
    related: ['lens', 'metalens', 'thicklens', 'telescope', 'objective'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Lenses', url: 'https://www.rp-photonics.com/lenses.html' },
    ],
  },

  {
    type: 'thicklens',
    title: 'Thick spherical lens',
    category: 'Lenses',
    realWorld: {
      html: `
        <p>A real singlet has finite centre thickness and two separately refracting
        surfaces${cite(1)}. Its paraxial power therefore depends on both signed radii, the
        glass index, and the separation between the faces${cite(2)}. Effective focal length is
        measured between principal planes; back focal distance is the rear-vertex-to-focus
        distance for collimated light, so the two numbers are not generally equal.</p>
        <p>At a large aperture, a spherical surface does not send every ray height to one
        axial point: marginal rays focus closer to a positive lens than paraxial rays,
        producing longitudinal spherical aberration and its visible caustic${cite(3)}.
        Optical-glass index also varies with wavelength, so an uncorrected singlet has
        longitudinal chromatic aberration.</p>`,
      formulas: [
        {
          tex: '\\Phi=(n-1)\\left(\\frac{1}{R_1}-\\frac{1}{R_2}+\\frac{(n-1)d}{nR_1R_2}\\right),\\qquad f=\\frac{1}{\\Phi}',
          caption: 'Thick lensmaker equation in air.',
        },
        {
          tex: '\\mathrm{BFD}=f\\left(1-\\frac{(n-1)d}{nR_1}\\right)',
          caption: 'Back focal distance from the rear vertex for collimated input along the element\'s local +x direction.',
        },
        {
          tex: 'V_d=\\frac{n_d-1}{n_F-n_C}',
          caption: 'Abbe number: lower values mean stronger dispersion between the visible F and C reference lines.',
        },
      ],
    },
    inOpticalSetup: {
      html: `
        <p>OpticalSetup intersects each ray with the two drawn plane or exact circular-arc
        faces, applies vector Snell refraction at each boundary, tracks the ray while it
        is inside the glass, and supports total internal reflection. Focal length and
        back focal distance are derived paraxial summaries of that geometry at the
        587.6&nbsp;nm d line; the tracer never aims rays at either reported point.
        Spherical and chromatic aberration therefore emerge from the traced surfaces and
        wavelength-dependent index rather than being drawn as an effect.</p>
        <p>In the default left-to-right orientation, positive radius means the centre of
        curvature lies toward local +x. A biconvex singlet is therefore
        <span class="w">R₁ &gt; 0</span> and <span class="w">R₂ &lt; 0</span>;
        <span class="w">R = 0</span> makes that face plane. The Shape readout names the
        resulting profile so the sign convention can be checked directly.</p>
        <p>The selectable N-BK7, fused-silica, N-SF5, and N-SF11 models use each glass's
        published d-line index and Abbe number${cite(4)}. If a requested radius is too
        small for the clear aperture, or the centre thickness would make the faces cross,
        the inspector shows the exact constructible geometry the tracer uses instead of
        hiding the adjustment.</p>
        <p><strong>Two glass bodies must not touch.</strong> The tracer ignores any
        intersection closer than 0.05&nbsp;mm along a ray, so a pair of coincident
        interfaces loses one of them and the ray wrongly exits into air. Building a
        cemented doublet by pushing two singlets together therefore gives an answer that
        is not obviously broken, just wrong — measured on a crown+flint pair, the focus
        lands 4&nbsp;mm short with one interface silently skipped. Leave at least
        0.06&nbsp;mm between them and both interfaces come back; the inspector warns when
        anything is closer. That gap costs about 0.1% of the back focal distance, and a
        real cemented group is a 10–20&nbsp;µm layer of not-quite-glass anyway. Nested or
        fully overlapping bodies are a separate unsupported case — boundaries are never
        merged.</p>`,
      formulas: [
        {
          tex: 'n^2(\\lambda)=1+\\sum_i\\frac{B_i\\lambda^2}{\\lambda^2-C_i}',
          caption: 'Three-term Sellmeier curve used for catalogue-glass index and dispersion.',
        },
      ],
      limitations: `<p>This is a 2D meridional geometric trace with spherical or plane
        faces only. It does not model skew rays, diffraction, aspheres, full 3D off-axis
        aberrations, Fresnel/coating behavior, stress birefringence, manufacturing
        tolerances, temperature dependence, or absorption bands. GDD uses the analytic
        second derivative of the selected Sellmeier curve and the actual traced distance
        in glass; the material contribution is generally within a few percent where the
        catalogue curve is valid. Per-surface transmission is a flat
        configured percentage applied at each face, not a Fresnel or coating calculation. Treat axial spherical and visible chromatic behavior as
        meaningful within this model and off-axis behavior as qualitative.</p>`,
    },
    related: ['lens', 'lensc', 'objective', 'prism', 'freeglass'],
    citations: [
      { label: 'The Physics Hypertextbook — Spherical lenses', url: 'https://physics.info/lenses/' },
      { label: 'Thorlabs — N-BK7 plano-convex lenses: the lensmaker equation for a thick lens', url: 'https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated?tabName=Tutorial' },
      { label: 'RP Photonics Encyclopedia — Spherical aberrations', url: 'https://www.rp-photonics.com/spherical_aberrations.html' },
      { label: 'SCHOTT — Optical-glass collection datasheets', url: 'https://www.schott.com/en-gb/products/optical-glass/-/media/Project/OnEx/Products/O/optical-glass/Downloads/schott-optical-glass-collection-datasheets-english-may2019.pdf' },
    ],
    resources: [
      { label: 'SCHOTT — Optical-glass technical properties', url: 'https://www.schott.com/en-gb/products/optical-glass/technical-details' },
    ],
  },

  {
    type: 'lensgroup',
    title: 'Lens group (surface table)',
    category: 'Lenses',
    realWorld: {
      html: `
        <p>A compound lens is specified as an ordered <strong>surface table</strong>.
        Each row names one refracting surface by its signed radius, gives the axial
        distance to the next surface, and names the optical medium after it. The
        convention is compact because the same rows describe both shape and topology:
        consecutive glass media form neighbouring elements in a cemented group, while
        an air medium followed by another glass creates a real air space.</p>
        <p>Achromatic doublets exploit that topology by pairing crown and flint glasses
        whose dispersion and powers oppose one another. Their net focal power remains
        useful while the first-order F- and C-line focal shift approaches zero. Published
        optical-glass catalogues therefore specify both the d-line index and the Abbe
        number used to compare dispersion${cite(1)}.</p>`,
      formulas: [
        {
          tex: '\\omega^+=\\omega^- - y\\frac{n_2-n_1}{R},\\qquad y^+=y^-+t\\frac{\\omega}{n}',
          caption: 'Paraxial refraction and transfer in reduced angle ω = nu, applied in surface-table order.',
        },
        {
          tex: '\\frac{\\Phi_1}{V_1}+\\frac{\\Phi_2}{V_2}\\approx 0',
          caption: 'First-order achromat condition: crown and flint chromatic powers cancel while their ordinary powers add.',
        },
      ],
    },
    inOpticalSetup: {
      html: `
        <p>Each editable row is <strong>radius R · thickness to next · medium
        after</strong>. Radius uses exactly the thick-singlet convention: for the
        default left-to-right direction, positive R puts the centre of curvature toward
        local +x, negative R puts it toward −x, and zero is a plane. The last row always
        exits into air and has no following thickness.</p>
        <p>The table is turned into one closed boundary per glass body. Every ray meets
        the drawn plane or exact circular-arc faces and refracts with the selected
        glass's wavelength-dependent index. The focal length and back focal distance
        readouts are a separate paraxial surface-by-surface summary; the tracer never
        aims rays at them. Longitudinal colour is reported as the difference between the
        F- and C-line back focal distances, so the supplied singlet and achromat presets
        can be compared at the same nominal 100&nbsp;mm focal length.</p>
        <p>Cemented and air-spaced groups are not separate element types. Consecutive
        glass rows make a cemented interface; an air row makes an authored air gap. A
        cemented interface is realized as two equal-radius faces separated by
        0.06&nbsp;mm of air. That tiny gap is deliberate: the tracer ignores a new hit
        within 0.05&nbsp;mm of the previous one, so coincident glass boundaries would
        silently lose an interaction and send the ray into the wrong medium. The gap,
        the outlines, the exact trace, and every cardinal readout all use the same
        realized prescription.</p>
        <p>The clear aperture can also change that prescription. If widening it would
        make two spherical faces cross at the rim, OpticalSetup thickens that body until
        at least 0.4&nbsp;mm of edge remains and moves every downstream surface with it.
        The readouts follow the adjusted geometry rather than continuing to quote the
        impossible typed shape.</p>
        <p>An air row can carry an aperture stop. Its two absorbing segments block light
        outside the configured clear diameter without adding power; stopping down a
        fast group therefore reduces its visible spherical caustic by rejecting the
        marginal rays. “Null F–C colour” varies the chosen row's radius by deterministic
        bisection, but accepts a solution only when it keeps a finite focal length with
        the original sign and comparable power. Any first row edit — including the
        purple on-canvas last-radius control — copies an active preset into a custom
        table instead of pretending a preset was edited when it was still authoritative.</p>`,
      formulas: [
        {
          tex: '\\Delta z_{FC}=\\mathrm{BFD}(486.1\\,\\mathrm{nm})-\\mathrm{BFD}(656.3\\,\\mathrm{nm})',
          caption: 'The axial-colour readout and the quantity the row action nulls.',
        },
      ],
      limitations: `<p>This is a 2D meridional geometric model with spherical or plane
        faces. On-axis spherical and visible longitudinal chromatic behavior emerge from
        the geometry and are meaningful within that scope; off-axis behavior is
        qualitative. The model does not include skew rays, aspheres, diffraction,
        quantitative coma or astigmatism, field curvature, coatings, Fresnel reflection,
        cement index, manufacturing tolerances, or a full optical-design merit function.
        The 0.06&nbsp;mm cement gap is a tracer workaround rather than a physical cement
        model. Catalogue glasses use two-term visible-band Cauchy fits anchored to nd and
        Abbe number${cite(1)}, not full Sellmeier curves; deep-UV, infrared, and temporal
        dispersion claims are outside this element's scope. Per-surface transmission is
        a configured percentage, not coating physics.</p>`,
    },
    related: ['thicklens', 'lens', 'objective', 'prism', 'freeglass'],
    citations: [
      { label: 'SCHOTT — Optical-glass collection datasheets', url: 'https://www.schott.com/en-gb/products/optical-glass/-/media/Project/OnEx/Products/O/optical-glass/Downloads/schott-optical-glass-collection-datasheets-english-may2019.pdf' },
    ],
    resources: [
      { label: 'RP Photonics Encyclopedia — Achromatic Optics', url: 'https://www.rp-photonics.com/achromatic_optics.html' },
      { label: 'The Physics Hypertextbook — Spherical lenses', url: 'https://physics.info/lenses/' },
    ],
  },

  {
    type: 'telescope',
    title: 'Telescope (lens pair)',
    category: 'Lenses',
    realWorld: {
      html: `
        <p>An afocal telescope pairs two lenses a distance
        <span class="w">f₁ + f₂</span> apart so that parallel rays in produce parallel
        rays out — no net focusing power, just a change in beam diameter and angular
        magnification. A <strong>Keplerian</strong> telescope uses two convex lenses and
        has a real, inverted intermediate image at the shared focus between them; a
        <strong>Galilean</strong> telescope uses a convex objective and a concave
        eyepiece, stays upright, and needs no space for an intermediate image — the
        arrangement behind classic opera glasses and compact laser beam expanders.</p>`,
      formulas: [
        { tex: 'M = -\\frac{f_1}{f_2}', caption: 'Angular magnification — negative for the inverted Keplerian case (both lenses convex), positive and upright when f₂ is negative (Galilean).' },
      ],
    },
    inOpticalSetup: {
      html: `
        <p>Two independent <a href="../lens/">lens</a> surfaces, each applying the same
        paraxial ray-transfer relation, separated by exactly
        <span class="w">f₁ + f₂</span> — the afocal spacing shown by the dashed
        centerline through the icon. Either lens's focal length can be set negative
        independently, so the same element models both configurations: two positive
        focal lengths gives a Keplerian telescope with a real crossing point in the
        middle, while a negative second focal length gives a Galilean telescope that
        never focuses the beam down to a point at all.</p>`,
      formulas: [],
      limitations: `<p>Same paraxial-only physics as a single lens, with no eyepiece
        field-of-view limits, eye relief, or exit-pupil modeling — just the afocal
        geometry and magnification. Each of the two zero-thickness surfaces contributes
        the same silent, diameter-aware N-BK7 sag estimate used by a standalone thin lens,
        typically a roughly 10% class estimate for pulse GDD.</p>`,
    },
    related: ['lens', 'lensc', 'thicklens', 'objective'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Beam Expanders', url: 'https://www.rp-photonics.com/beam_expanders.html' },
    ],
  },

  {
    type: 'objective',
    title: 'Objective',
    category: 'Lenses',
    realWorld: {
      html: `
        <p>A real microscope or camera objective is a highly corrected assembly of many
        lens elements, not a single piece of glass — the element count exists almost
        entirely to cancel spherical and chromatic aberration, flatten the field, and
        reach a high numerical aperture without the image falling apart. Numerical
        aperture <span class="w">NA</span> is the single number that matters most: it
        sets the objective's light-gathering cone and, through diffraction, the finest
        detail it can ever resolve, regardless of magnification:</p>`,
      formulas: [
        { tex: '\\mathrm{NA} = n\\sin\\theta', caption: "Numerical aperture depends on both the accepted half-angle and the refractive index of the objective's designed front medium; NA above 1 therefore requires immersion." },
        { tex: 'd \\approx \\frac{\\lambda}{2\\,\\mathrm{NA}}', caption: "The Abbe diffraction limit — the smallest resolvable feature size, set by wavelength and numerical aperture alone." },
        { tex: 'r_{\\text{BFP}} \\approx f \\cdot \\mathrm{NA}', caption: "Entrance-pupil radius at the back focal plane, for a well-corrected objective (the Abbe sine condition)." },
        { tex: 'M = \\frac{f_{\\text{tube}}}{f_{\\text{objective}}}', caption: "Magnification of an infinity-corrected objective, set purely by comparing its focal length to the tube lens's." },
        { tex: '\\mathrm{NA}_{\\text{eff}} \\approx \\frac{D}{2f} \\le \\mathrm{NA}', caption: "The NA you actually work at when a beam of diameter D underfills the back pupil — the rating is a ceiling, not a guarantee." },
      ],
      html2: `
        <p>Modern objectives are almost always <strong>infinity-corrected</strong>: a
        point at the sample (the front focal plane) emits a cone that leaves the back of
        the objective as a <em>collimated</em> beam, which a separate tube lens then
        focuses onto a camera or eyepiece — nothing focuses light directly behind an
        infinity objective on its own. The reference plane a focal length
        <span class="w">f</span> behind the objective, on that tube-lens side, is the
        <strong>back focal plane (BFP)</strong> — where the objective's entrance pupil
        (radius above) is imaged. It matters most in laser-scanning microscopy: a scan
        mirror, or its relayed image via a scan lens and tube lens, is deliberately
        positioned at a plane conjugate to the BFP, so that as the mirror tilts, the beam
        pivots around a fixed point inside the pupil instead of walking across it —
        keeping the full aperture illuminated at every scan angle.</p>
        <p>That same magnification formula is also why widefield imaging systems pick
        the objective focal length they do. A high-power compound-microscope objective
        (60×, 100×) has a very short effective focal length — often just a couple of
        millimeters — paired with a long tube lens. Its <strong>working distance</strong>,
        however, is a separate catalogue dimension: the axial clearance from the front
        boundary to the in-focus specimen plane. High-magnification objectives often have
        short working distances because of their practical optical and mechanical design,
        but working distance is not obtained from the magnification formula and
        long-working-distance objectives are specifically engineered exceptions. A
        <strong>stereomicroscope</strong> uses low-to-moderate magnification, a wide field
        of view, and enough working distance to get hands or tools under the lens; its zoom
        system can vary magnification without turning working distance into focal length.</p>
        <p>One practical consequence of that pupil: the NA on the barrel is a
        <em>ceiling</em>, not a promise. You only work at the rated NA if your beam actually
        fills the back pupil. A laser beam narrower than the pupil converges at a
        proportionally smaller angle, giving a bigger focal spot and worse resolution than
        the label implies — which is why laser-scanning systems deliberately
        <strong>overfill</strong> the back aperture, accepting the power clipped off at the
        rim in exchange for the full aperture and the tightest spot the objective can make.
        Working distance, meanwhile, is a separate catalogue dimension set by the complete
        prescription. It is often shorter than EFL in high-power objectives, but there is
        no universal <span class="w">WD&nbsp;&le;&nbsp;EFL</span> rule for real compound
        objectives; specialized long-working-distance designs are the obvious exception.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The inspector begins with a starting point grouped by immersion class —
        <strong>Dry</strong>, <strong>Water</strong>, <strong>Oil</strong>, and
        <strong>Long working distance</strong> — each offering the magnification and NA
        pairs people actually buy. They are plausible catalogue-shaped specs, not one
        manufacturer's prescriptions; choosing one sets EFL, working distance, medium, NA,
        and front aperture together. The labels carry NA and WD precisely because the two
        trade off: at a fixed magnification, every step up in NA costs clearance. Exact
        values remain editable in the collapsed <strong>Advanced parameters</strong>
        section, and any edit there drops the selector to Custom.</p>
        <p>An objective here is set by three things you would read off a real catalogue —
        <strong>effective focal length (EFL)</strong>, <strong>working distance</strong>,
        and <strong>rated NA</strong> — plus the front aperture that controls how big the
        nose is drawn. EFL is the focal length of the whole multi-element assembly treated
        as one equivalent lens, which is what "focal length" means on an objective; the
        inspector label spells that out. Magnification is not something you type in. It is <em>reported</em> from the EFL against a 200&nbsp;mm reference
        tube lens, because magnification belongs to the objective plus whichever tube lens
        you actually place in the sketch, not to the objective alone. A fresh objective uses
        the 20× dry starting point: EFL 10&nbsp;mm, WD 1.2&nbsp;mm, NA 0.40, and 100%
        transmission.</p>

        <h3>Where the refracting plane sits, and why</h3>
        <p>OpticalSetup traces the objective as one equivalent refracting plane of focal
        length EFL, but it does <em>not</em> put that plane at the front tip. It sits one
        focal length short of the nominal focus — at the front tip plus
        <span class="w">WD&nbsp;&minus;&nbsp;EFL</span> — which for a real objective means
        somewhere inside the barrel. That single choice is what makes three things true at
        once:</p>
        <ul>
          <li>Collimated light from the tube-lens side focuses <em>exactly</em> one working
          distance beyond the physical front tip, so the drawn focus is the working
          distance you typed.</li>
          <li>The plane still carries the objective's real focal length, so an external
          200&nbsp;mm tube lens really does produce the reported magnification rather than
          a decorative label.</li>
          <li>The plane one EFL behind it is a genuine <strong>back focal plane (BFP)</strong>:
          light focused there leaves the objective collimated. That is what widefield
          (Köhler-style) illumination needs, and it is the plane a laser-scanning relay has
          to image the scan mirror onto.</li>
        </ul>
        <p>The BFP is drawn as a labelled marker next to the WD focus, and it is a traced
        conjugate rather than an annotation — put a source at it and the output really does
        come out collimated.</p>
        <p>Working distance is <em>not</em> capped at EFL. Real long-working-distance
        objectives focus well beyond their own focal length — a 100× Plan Apo NIR reaches
        about 12&nbsp;mm on a 2&nbsp;mm EFL — by putting the equivalent principal plane
        <em>ahead</em> of the front glass, and the model reproduces that: when WD exceeds
        EFL the equivalent plane sits in front of the tip, exactly where the real one is.
        The only bound is a catalogue ceiling of 40&nbsp;mm, or the objective's own EFL if
        that is longer, so older sketches that recorded WD equal to a long EFL keep their
        focus exactly where it was. Missing legacy values still fall back to EFL.
        Nothing is drawn at the equivalent plane —
        an objective is an opaque barrel, not a visible singlet. When a short working
        distance pushes the plane behind the default rear face, only the straight rear
        section of the barrel lengthens; the tapered nose is fixed geometry.</p>

        <h3>Rated NA is a real aperture, not a label</h3>
        <p>The back pupil has diameter <span class="w">2fNA</span> and is the objective's
        aperture stop. A beam that fills it converges at the rated angle: raise NA and the
        focusing cone opens, lower it and the cone closes. Nothing else in the objective
        sets the cone, so NA is a control rather than a caption.</p>
        <p>That stop sits <em>at the back focal plane</em>, where an infinity objective's
        entrance pupil belongs, and this is what makes relaying a scan mirror onto the BFP
        marker do real work: a beam pivoting there stays centred in the pupil at every scan
        angle and loses nothing, while a pivot anywhere else walks across the pupil and is
        cut. (The single-plane model can push the BFP further back than any plausible barrel;
        the stop is then clamped into the housing rather than left blocking light in mid-air
        behind it, so the zero-walk property degrades for very long focal lengths.)</p>
        <p>The metal around that opening blocks. Overfilling the back pupil is normal
        laboratory practice — it is how you actually reach the full rated NA — and the
        overflow is genuinely lost, so the objective reports what it costs. Two readouts sit
        under the NA control:</p>
        <ul>
          <li><strong>Back-pupil fill</strong> — the beam diameter arriving, the pupil it has
          to get through, and a first-order estimate of the fraction that survives. That
          estimate is the area ratio for a uniform round beam, so doubling the fill costs
          about three quarters of the power.</li>
          <li><strong>Effective NA in use</strong> — underfilling does not merely waste the
          rating, it hands you a smaller NA and a correspondingly wider focal spot. Fill half
          the pupil and you are running at half the NA; the readout says so, and by how much
          the spot widens. Overfilling is capped at the rating: you cannot buy more NA than
          the objective has.</li>
        </ul>
        <p>A large <span class="w">2fNA</span> makes the housing physically wider rather than
        silently clipping at the drawn outline, and the dark bars across the barrel's rear
        face show the pupil diameter the beam has to fit through.</p>

        <h3>Medium and acceptance angle</h3>
        <p>The objective owns its medium; there is no separately placeable liquid
        component. Dry/air caps rated NA at 0.85 — the practical ceiling for real dry
        designs, rather than the physical <span class="w">n&nbsp;=&nbsp;1</span> limit —
        water at 1.27, oil at 1.49, and a custom medium at the lesser of its index
        <span class="w">n</span> and 1.49. The medium's index and the rated NA give the
        object-side half-angle <span class="w">θ&nbsp;=&nbsp;asin(NA/n)</span> shown as a
        readout; changing medium may clamp an out-of-range NA but never changes working
        distance. Alongside the pupil, the tracer also rejects object-side rays steeper than
        that half-angle. <strong>Show acceptance angle</strong> — off by default, because
        most sketches want a plain barrel — draws it as a dashed sector at the actual
        contact or nominal focus.</p>
        <p>Water, oil, and custom objectives derive a non-selectable
        <strong>immersion bridge</strong> to the nearest compatible contact in front: a
        Sample, a Sample on piezo stage, or a facing fiber endpoint. The target is chosen
        from the authored geometry, so a scanning stage carries the same relationship while
        it remains aligned and in range, then disconnects instead of making the objective
        jump between nearby samples.</p>
        <p>The bridge spans the objective's complete front aperture and the contacted
        specimen or fiber face. Two cubic Bézier curves bow inward between those edges to
        make a legible meniscus in the canvas and in SVG, PNG, and GIF output. This is an
        authored schematic, not a capillary-surface calculation. If no contact is available,
        no liquid is drawn. Older high-NA sketches that never recorded a medium remain
        explicitly unresolved until one is chosen.</p>

        <h3>Controls and markers</h3>
        <p>The blue resize handle changes the front aperture. EFL is intentionally an exact
        Advanced field rather than a free-drag canvas knob, and is bounded to
        2–60&nbsp;mm: 2&nbsp;mm is a 100× objective, 60&nbsp;mm a 3.3×, and past that an
        "objective" is simply a lens whose derived barrel and internal planes stop being
        drawable at any usable zoom. Editing working distance
        moves the refracting plane without touching EFL or the reported magnification; raising
        EFL leaves an already-configured working distance alone, while lowering EFL past it
        carries the working distance down with it. Toggle
        "Show focal points" (the <span class="w">ƒ</span> button) or select the objective to
        see both marked planes: <span class="w">BFP</span> on the tube-lens side and the
        nominal <span class="w">WD focus</span> on the sample side.</p>
        <p>When this objective sits between a pulsed laser and an illuminated
        photocurable-resin sample, its NA is one of the values OpticalSetup can hand off
        to the dedicated Two-Photon Lithography Lab, alongside the laser's wavelength,
        power, repetition rate, and pulse duration — see the inspector on a resin
        sample's stage.</p>
        <p>For pulse reporting, the equivalent plane silently contributes 30&nbsp;mm of
        N-BK7. This is a class-typical GDD estimate, not a prescription: real objectives
        can be roughly half to twice that value, and the estimate does not scale with NA,
        magnification, immersion medium, or barrel geometry.</p>`,
      formulas: [],
      limitations: `<p>The 200&nbsp;mm reference tube length is a real, common convention
        (Nikon and Leica both design infinity objectives against 200&nbsp;mm) but not a
        universal one — Olympus uses 180&nbsp;mm and Zeiss 165&nbsp;mm — and OpticalSetup
        doesn't model a manufacturer choice or a separate tube-lens element the way the
        standalone <a href="../telescope/">telescope</a> pairs two real lenses; the
        reference length is used only for effective-focal-length metadata and the
        first-order pupil estimate; it does not define the trace boundary or focus map.
        Working distance is a saved property bounded by EFL in this model, not a value
        predicted by magnification, NA, or immersion medium: a real catalogue pairs them
        through the internal design and can include long-working-distance prescriptions that
        violate this simplified cap. The supplied high-power starting points do retain
        plausible sub-millimetre clearances. The equivalent lens plane and the
        back focal plane it defines are first-order stand-ins for a compound objective's
        principal plane and pupil, not the real internal conjugates: one plane cannot
        reproduce a real objective's aberration correction, field curvature, or the axial
        spacing of its actual groups. The pupil stop and NA clipping remain qualitative and do not model
        diffraction, aberration correction, internal stops, or polarization at high
        angle. The pupil is a paraxial stop in a thin-lens tracer, so a beam filling it
        converges at <span class="w">atan(NA)</span> rather than the sine-condition
        <span class="w">asin(NA/n)</span> that the rated half-angle readout quotes; the
        two agree closely at moderate NA and separate as NA approaches its ceiling. The
        overfill estimate is a uniform-beam area ratio, not a Gaussian truncation or a
        vignetting calculation. Dry objectives cap at NA 0.85, the practical ceiling for
        real dry designs rather than the physical <span class="w">n = 1</span> limit. The drawn meniscus does not solve wetting, contact angle, surface tension,
        volume, or gravity; it adds no refracting boundary and does not model cover glass,
        index mismatch, focal shift, or immersion aberrations. The fixed 30&nbsp;mm
        N-BK7 GDD equivalent can be wrong by about a factor of two for a particular
        objective; detector readouts report the combined path total, while this page
        identifies which part of that total is only assumed.</p>`,
    },
    related: ['lens', 'thicklens', 'telescope'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Microscope Objectives', url: 'https://www.rp-photonics.com/microscope_objectives.html' },
      { label: 'RP Photonics Encyclopedia — Numerical Aperture', url: 'https://www.rp-photonics.com/numerical_aperture.html' },
      { label: 'ZEISS — Oil immersion, refractive index, and lens design', url: 'https://www.zeiss.com/microscopy/en/resources/insights-hub/foundational-knowledge/oil-immersion-refractive-index-and-lens-design.html' },
    ],
  },

  {
    type: 'fiber',
    title: 'Optical fiber',
    category: 'Fibers',
    realWorld: {
      html: `
        <p>An optical fiber guides light along its own length instead of across open
        space. A cylindrical <strong>core</strong> of slightly higher refractive index is
        surrounded by a <strong>cladding</strong> of slightly lower index, and light that
        strikes the boundary at a shallow enough angle is totally internally reflected back
        into the core. Repeated indefinitely, that confinement carries a beam around bends
        and over distances that no free-space path could survive, which is why fiber
        underpins both global telecommunications and a great deal of everyday optics on the
        bench.</p>
        <p>Two numbers govern how light gets in. The <strong>numerical aperture</strong>
        is set by the two indices and defines a cone of acceptance: light arriving within
        that half-angle couples into the guided mode, and light outside it does not. The
        <strong>core diameter</strong> then decides how many spatial modes the fiber
        supports — a large multimode core carries many, while a single-mode core of a few
        micrometres carries exactly one and therefore preserves a clean wavefront.</p>`,
      formulas: [
        { tex: '\\mathrm{NA} = \\sqrt{n_{\\text{core}}^{2} - n_{\\text{clad}}^{2}}', caption: 'Numerical aperture from the index step — it sets both the acceptance cone on the way in and the divergence cone on the way out.' },
        { tex: '\\theta_{\\max} = \\arcsin\\left(\\frac{\\mathrm{NA}}{n_0}\\right)', caption: 'Half-angle of the acceptance cone in a medium of index n₀ — in air, simply arcsin(NA).' },
        { tex: 'P(L) = P_0 \\, 10^{-\\alpha L / 10}', caption: 'Attenuation along a fiber of length L for a loss coefficient α in dB per unit length.' },
        { tex: 't = \\frac{n_g L}{c}', caption: 'Transit time through the fiber — the group index n_g, not the phase index, sets the delay a pulse or an interferometer actually sees.' },
      ],
      html2: `
        <p>What emerges at the far end is not the beam that went in. A fiber scrambles the
        spatial information it carries, so a multimode fiber illuminated with coherent light
        produces speckle rather than an image; the output simply diverges into a cone set by
        the fiber's NA. Light is attenuated along the way, by absorption and by scattering,
        at a rate conventionally quoted in decibels per kilometre — around 0.2&nbsp;dB/km for
        silica telecom fiber at 1550&nbsp;nm, which is the wavelength band the material is
        most transparent to and the reason that band dominates long-haul communication.</p>
        <p>Fiber also delays light. The group index of silica is close to 1.47, so a pulse
        travels at roughly two-thirds of its vacuum speed and a fiber path is optically much
        longer than its physical length — a distinction that matters enormously in
        interferometry, where the optical path difference is what sets the fringes.</p>
        <p>A separate and very active line of work turns the fiber's scrambling into
        something useful. Because the mixing is deterministic, it can be measured and
        inverted: a wavefront shaped correctly at the input emerges from a multimode fiber
        as a diffraction-limited focus at a chosen point in the output plane, and scanning
        that focus turns a hair-thin fiber into a microscope objective. These
        <strong>lensless endoscopes</strong> image deep inside tissue through a probe no
        wider than the fiber itself.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>A fiber is drawn rather than placed: pick the tool, click waypoints along the
        route you want, and double-click to finish. The result is a path, not a component,
        so it curves smoothly through its waypoints and can be reshaped afterwards by
        dragging the round handles. Everything optical about it lives on that path.</p>
        
        <p>The connectors drawn at each end are the terminated patch cable you would pick
        up off a bench. For the same component without them — a cleaved or spliced fiber,
        as used in custom laboratory assemblies — draw a <a href="../barefiber/">bare
        fiber</a> instead; it behaves identically and differs only in how it renders and in
        the width of the end face a beam has to hit.</p>
        <p>A new fiber starts as <strong>diagram only</strong>. Its ends block whatever
        light reaches them, and nothing comes out — which is the honest depiction of an
        unconnected cable lying on a table. Tick <strong>Beam propagates</strong> to make it
        an optical path, and the inspector then exposes the properties that make it one.</p>

        <h3>Getting light in</h3>
        <p>Coupling is a real test, not an assumption. A ray reaching an end face couples
        in only if it arrives within the acceptance cone — the <strong>Input NA</strong>,
        0.22 by default — measured against that end's own axis. A beam that arrives too
        steeply is simply not accepted, exactly as it would not be on a bench. An
        <a href="../objective/">objective</a> aimed at a fiber end couples into it the same
        way, which is how the lensless-endoscope setups in the community gallery are built.</p>

        <h3>What the fiber does to the light</h3>
        <p>Three saved properties act along the drawn length. <strong>Loss</strong>, in
        dB/m (0.2 by default), attenuates the light over the path's true geometric length.
        The <strong>group index</strong> (1.468 by default, fused silica) multiplies that
        length into optical path, so a fiber arm in an interferometer contributes the delay
        it really would, and a pulse arrives when it should rather than when a free-space
        path of the same drawn length would deliver it.</p>
        <p>Wavelength, spectrum, polarization state, and pulse envelope all survive the
        journey, as does any group-delay dispersion the light picked up <em>before</em> it
        coupled in. Speckle does not: light emerges from the far end as a clean cone or
        focus rather than as the grain a real multimode fiber would impose.</p>

        <h3>Getting light out</h3>
        <p>Each end carries its own independent output specification, so the two ends can
        behave differently and coupling works in both directions — light entering end A
        leaves from B under B's spec, and vice versa. Two styles are available:</p>
        <ul>
          <li><strong>Diverging</strong> — the ordinary case. Light leaves the tip as a
          cone of half-angle arcsin(NA), using that end's output NA (0.12 by default),
          which is what a real fiber tip does.</li>
          <li><strong>Focused</strong> — light leaves as a converging fan of a chosen
          output diameter that comes to a focus a chosen distance ahead. This is not what a
          plain cleaved fiber does; it is there for <strong>lensless endoscopes</strong> and
          for the lensed and GRIN-terminated fibers that deliver a focus directly from the
          fiber tip. It is what lets you sketch a fiber probe that images a sample without
          drawing an objective in front of it.</li>
        </ul>`,
      limitations: `
        <p>The fiber is modelled as a guided path with an acceptance cone, a loss, and a
        delay — not as a waveguide. Nothing here computes modes, so single-mode and
        multimode fibers are not distinguished, and the mode scrambling that dominates a
        real multimode output is absent: the output is a clean cone or focus, never
        speckle. Bend loss is not modelled either, so a tightly drawn path costs no more
        than a straight one, and the loss figure is applied uniformly rather than varying
        with wavelength. Nine rays are launched from the output end, which sets how finely
        the emerging cone is sampled.</p>
        <p>Most significantly, <strong>the fiber's own chromatic dispersion is not
        modelled</strong>. Dispersion accumulated elsewhere in the setup is carried through
        correctly, but the fiber itself neither stretches nor compresses a pulse, so a
        femtosecond pulse emerges from a long fiber exactly as long as it went in. Real
        fiber is one of the most dispersive elements in any ultrafast setup. Fiber
        <strong>dispersion</strong> — and <strong>wavelength conversion</strong>, covering
        the nonlinear behaviour that makes fiber a source as well as a conduit — are both
        candidates for a future release.</p>`,
    },
    related: ['barefiber', 'objective', 'sclaser', 'detector'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Optical Fibers', url: 'https://www.rp-photonics.com/fibers.html' },
      { label: 'RP Photonics Encyclopedia — Numerical Aperture', url: 'https://www.rp-photonics.com/numerical_aperture.html' },
      { label: 'Thorlabs — Optical Fiber Tutorial', url: 'https://www.thorlabs.com/newgrouppage9.cfm?objectgroup_id=6835' },
    ],
  },
  {
    type: 'barefiber',
    title: 'Bare fiber',
    category: 'Fibers',
    realWorld: {
      html: `
        <p>An optical fiber guides light along its own length instead of across open
        space. A cylindrical <strong>core</strong> of slightly higher refractive index is
        surrounded by a <strong>cladding</strong> of slightly lower index, and light that
        strikes the boundary at a shallow enough angle is totally internally reflected back
        into the core. Repeated indefinitely, that confinement carries a beam around bends
        and over distances that no free-space path could survive, which is why fiber
        underpins both global telecommunications and a great deal of everyday optics on the
        bench.</p>
        <p>Two numbers govern how light gets in. The <strong>numerical aperture</strong>
        is set by the two indices and defines a cone of acceptance: light arriving within
        that half-angle couples into the guided mode, and light outside it does not. The
        <strong>core diameter</strong> then decides how many spatial modes the fiber
        supports — a large multimode core carries many, while a single-mode core of a few
        micrometres carries exactly one and therefore preserves a clean wavefront.</p>`,
      formulas: [
        { tex: '\\mathrm{NA} = \\sqrt{n_{\\text{core}}^{2} - n_{\\text{clad}}^{2}}', caption: 'Numerical aperture from the index step — it sets both the acceptance cone on the way in and the divergence cone on the way out.' },
        { tex: '\\theta_{\\max} = \\arcsin\\left(\\frac{\\mathrm{NA}}{n_0}\\right)', caption: 'Half-angle of the acceptance cone in a medium of index n₀ — in air, simply arcsin(NA).' },
        { tex: 'P(L) = P_0 \\, 10^{-\\alpha L / 10}', caption: 'Attenuation along a fiber of length L for a loss coefficient α in dB per unit length.' },
        { tex: 't = \\frac{n_g L}{c}', caption: 'Transit time through the fiber — the group index n_g, not the phase index, sets the delay a pulse or an interferometer actually sees.' },
      ],
      html2: `
        <p>What emerges at the far end is not the beam that went in. A fiber scrambles the
        spatial information it carries, so a multimode fiber illuminated with coherent light
        produces speckle rather than an image; the output simply diverges into a cone set by
        the fiber's NA. Light is attenuated along the way, by absorption and by scattering,
        at a rate conventionally quoted in decibels per kilometre — around 0.2&nbsp;dB/km for
        silica telecom fiber at 1550&nbsp;nm, which is the wavelength band the material is
        most transparent to and the reason that band dominates long-haul communication.</p>
        <p>Fiber also delays light. The group index of silica is close to 1.47, so a pulse
        travels at roughly two-thirds of its vacuum speed and a fiber path is optically much
        longer than its physical length — a distinction that matters enormously in
        interferometry, where the optical path difference is what sets the fringes.</p>
        <p>A separate and very active line of work turns the fiber's scrambling into
        something useful. Because the mixing is deterministic, it can be measured and
        inverted: a wavefront shaped correctly at the input emerges from a multimode fiber
        as a diffraction-limited focus at a chosen point in the output plane, and scanning
        that focus turns a hair-thin fiber into a microscope objective. These
        <strong>lensless endoscopes</strong> image deep inside tissue through a probe no
        wider than the fiber itself — and are typically built from bare, cleaved fiber
        rather than from connectorized cable.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>A bare fiber is drawn rather than placed: pick the tool, click waypoints along the
        route you want, and double-click to finish. The result is a path, not a component,
        so it curves smoothly through its waypoints and can be reshaped afterwards by
        dragging the round handles. Everything optical about it lives on that path.</p>
        
        <p>A bare fiber is the same optical component as the connectorized
        <a href="../fiber/">optical fiber</a> — identical acceptance cone, loss, delay, and
        output behaviour — drawn without the connector plugs and with flat-cleaved rather
        than rounded ends. It is there for the many laboratory setups that are assembled
        from bare cleaved or spliced fiber rather than from terminated patch cables, where
        drawing an FC/PC plug would misrepresent the hardware. The one functional
        difference follows from the geometry: the end face a beam has to hit is narrower,
        since it is the fiber itself rather than the wider connector body, so aligning a
        source onto a bare end is correspondingly fussier — as it is on a real bench.</p>
        <p>A new fiber starts as <strong>diagram only</strong>. Its ends block whatever
        light reaches them, and nothing comes out — which is the honest depiction of an
        unconnected cable lying on a table. Tick <strong>Beam propagates</strong> to make it
        an optical path, and the inspector then exposes the properties that make it one.</p>

        <h3>Getting light in</h3>
        <p>Coupling is a real test, not an assumption. A ray reaching an end face couples
        in only if it arrives within the acceptance cone — the <strong>Input NA</strong>,
        0.22 by default — measured against that end's own axis. A beam that arrives too
        steeply is simply not accepted, exactly as it would not be on a bench. An
        <a href="../objective/">objective</a> aimed at a fiber end couples into it the same
        way, which is how the lensless-endoscope setups in the community gallery are built.</p>

        <h3>What the fiber does to the light</h3>
        <p>Three saved properties act along the drawn length. <strong>Loss</strong>, in
        dB/m (0.2 by default), attenuates the light over the path's true geometric length.
        The <strong>group index</strong> (1.468 by default, fused silica) multiplies that
        length into optical path, so a fiber arm in an interferometer contributes the delay
        it really would, and a pulse arrives when it should rather than when a free-space
        path of the same drawn length would deliver it.</p>
        <p>Wavelength, spectrum, polarization state, and pulse envelope all survive the
        journey, as does any group-delay dispersion the light picked up <em>before</em> it
        coupled in. Speckle does not: light emerges from the far end as a clean cone or
        focus rather than as the grain a real multimode fiber would impose.</p>

        <h3>Getting light out</h3>
        <p>Each end carries its own independent output specification, so the two ends can
        behave differently and coupling works in both directions — light entering end A
        leaves from B under B's spec, and vice versa. Two styles are available:</p>
        <ul>
          <li><strong>Diverging</strong> — the ordinary case. Light leaves the tip as a
          cone of half-angle arcsin(NA), using that end's output NA (0.12 by default),
          which is what a real fiber tip does.</li>
          <li><strong>Focused</strong> — light leaves as a converging fan of a chosen
          output diameter that comes to a focus a chosen distance ahead. This is not what a
          plain cleaved fiber does; it is there for <strong>lensless endoscopes</strong> and
          for the lensed and GRIN-terminated fibers that deliver a focus directly from the
          fiber tip. It is what lets you sketch a fiber probe that images a sample without
          drawing an objective in front of it.</li>
        </ul>`,
      limitations: `
        <p>The fiber is modelled as a guided path with an acceptance cone, a loss, and a
        delay — not as a waveguide. Nothing here computes modes, so single-mode and
        multimode fibers are not distinguished, and the mode scrambling that dominates a
        real multimode output is absent: the output is a clean cone or focus, never
        speckle. Bend loss is not modelled either, so a tightly drawn path costs no more
        than a straight one, and the loss figure is applied uniformly rather than varying
        with wavelength. Nine rays are launched from the output end, which sets how finely
        the emerging cone is sampled.</p>
        <p>Most significantly, <strong>the fiber's own chromatic dispersion is not
        modelled</strong>. Dispersion accumulated elsewhere in the setup is carried through
        correctly, but the fiber itself neither stretches nor compresses a pulse, so a
        femtosecond pulse emerges from a long fiber exactly as long as it went in. Real
        fiber is one of the most dispersive elements in any ultrafast setup. Fiber
        <strong>dispersion</strong> — and <strong>wavelength conversion</strong>, covering
        the nonlinear behaviour that makes fiber a source as well as a conduit — are both
        candidates for a future release.</p>`,
    },
    related: ['fiber', 'objective', 'sclaser', 'detector'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Optical Fibers', url: 'https://www.rp-photonics.com/fibers.html' },
      { label: 'RP Photonics Encyclopedia — Numerical Aperture', url: 'https://www.rp-photonics.com/numerical_aperture.html' },
      { label: 'Thorlabs — Optical Fiber Tutorial', url: 'https://www.thorlabs.com/newgrouppage9.cfm?objectgroup_id=6835' },
    ],
  },
  {
    type: 'prism',
    title: 'Prism',
    category: 'Dispersive elements',
    realWorld: {
      html: `
        <p>A prism disperses light because its refractive index depends on wavelength.
        Each face refracts according to Snell's law:</p>`,
      formulas: [
        { tex: 'n_1 \\sin\\theta_1 = n_2 \\sin\\theta_2', caption: "Snell's law at each face." },
      ],
      html2: `
        <p>Since <span class="w">n</span> itself varies with <span class="w">λ</span>,
        different colors refract by different amounts and separate — this is why white
        light fans into a rainbow. Real optical glass is characterized by a Sellmeier
        equation, a sum of resonance terms fit to measured data, not a single simple
        formula.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>Each face is a genuine refracting boundary — incident rays bend by real vector
        Snell's law, and a ray that exceeds the critical angle undergoes total internal
        reflection instead of exiting, exactly as a real prism does. For dispersion,
        broadband and supercontinuum beams are sampled at several discrete wavelengths
        across their band, and each sample refracts with its own wavelength-dependent
        index, so the beam visibly fans into a spectrum. N-BK7, fused silica, N-SF5, and
        N-SF11 are selectable; existing sketches still default to N-BK7. Pulsed rays add
        GDD from their actual traced distance inside the selected glass.</p>`,
      formulas: [
        { tex: 'n^2(\\lambda)=1+\\sum_i\\frac{B_i\\lambda^2}{\\lambda^2-C_i}', caption: 'The selected glass\'s published three-term Sellmeier curve.' },
      ],
      limitations: `<p>The Sellmeier curves make refractive index and GDD accurate to a
        few percent over their valid transparent ranges, but absorption bands,
        temperature, coatings, and surface quality are not modeled; the fixed per-face
        transmission is the only loss.</p>`,
    },
    related: ['grating', 'glassrod', 'freeglass', 'thicklens', 'dichroic'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Prisms', url: 'https://www.rp-photonics.com/prisms.html' },
    ],
  },

  {
    type: 'grating',
    title: 'Diffraction grating',
    category: 'Dispersive elements',
    realWorld: {
      html: `
        <p>A diffraction grating is a surface ruled with closely, evenly spaced lines
        (period <span class="w">d</span>). Light diffracting from it interferes
        constructively only at angles satisfying the grating equation:</p>`,
      formulas: [
        { tex: 'd\\,(\\sin\\theta_i + \\sin\\theta_m) = m\\lambda', caption: 'The grating equation: incidence angle θᵢ, diffraction angle θₘ, integer order m, line spacing d.' },
      ],
      html2: `<p>Because the equation depends on <span class="w">λ</span>, each nonzero
        order spreads white light into a spectrum — the same effect a prism produces
        through dispersion, but from interference rather than refractive-index variation.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>This is one of the few components where OpticalSetup implements the textbook
        formula directly and exactly, solving the grating equation per sampled wavelength
        for every configured diffraction order, in either reflective or transmissive
        mode. Orders where the equation has no real solution (<span class="w">|sinθₘ| &gt;
        1</span>) are simply dropped, matching a real grating's behavior of only lighting
        up the orders that geometrically exist.</p>`,
      formulas: [],
      limitations: `<p>Diffraction efficiency is split evenly across the configured
        orders rather than computed from the groove profile (a real blazed grating
        concentrates most of the light into one order by design) — order existence and
        angle are exact, relative brightness between orders is not.</p>`,
    },
    related: ['prism', 'dmd', 'slm'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Diffraction Gratings', url: 'https://www.rp-photonics.com/diffraction_gratings.html' },
    ],
  },

  {
    type: 'freeglass',
    title: 'Freeform glass',
    category: 'Dispersive elements',
    realWorld: {
      html: `
        <p>Real glass optics are rarely limited to a lens's spherical curve or a
        prism's flat triangular faces — aspheric correctors, light pipes, freeform
        illumination optics, and hand-ground custom prisms all refract light through an
        arbitrary boundary shape. However exotic the outline, the physics at every point
        on the surface is the same vector Snell's law that governs a plain prism or lens
        face; only the local surface normal changes from point to point.</p>
        <p>This is also literally how any CAD or ray-tracing renderer handles a smoothly
        curved optical surface in practice: an arbitrarily smooth boundary is approximated
        as a fine mesh of flat facets (or, for a closer fit, circular arcs), each
        refracting independently, with the approximation error shrinking as the facets get
        smaller. A coarse hand-built approximation and a smooth manufactured asphere differ
        only in how fine that mesh is.</p>`,
      formulas: [
        { tex: 'n_1 \\sin\\theta_1 = n_2 \\sin\\theta_2', caption: "Snell's law, applied independently at every straight or curved boundary segment — the only physics a freeform refracting surface needs." },
        { tex: 'n^2(\\lambda)=1+\\sum_i\\frac{B_i\\lambda^2}{\\lambda^2-C_i}', caption: 'The optional catalogue glasses use the same Sellmeier curves as the thick spherical lens.' },
      ],
    },
    inOpticalSetup: {
      html: `
        <p>The boundary is drawn as a chain of straight edges and true circular arcs —
        editable directly on the canvas by dragging anchor and curve-control points — and
        each segment becomes its own independent refracting surface, so a completely
        custom cross-section (a light pipe's tapered profile, a freeform prism, a
        corrective wedge) refracts and totally-internally-reflects exactly like the
        fixed-geometry <a href="../prism/">Prism</a>, just without being locked to a
        triangle. Choose a constant refractive index or one of four catalogue models:
        N-BK7, fused silica, N-SF5, and N-SF11. A broadband beam through a catalogue-glass
        boundary is sampled by wavelength and visibly disperses into a spectrum.</p>`,
      formulas: [],
      limitations: `<p>The catalogue options use published Sellmeier curves, so GDD
        follows the actual traced distance and is generally within a few percent where
        those curves are valid. Absorption bands and temperature are not modeled;
        per-surface transmission is a flat configured number rather than a computed
        coating or bulk loss. Circular-arc segments are true 2D arcs, but the whole element
        is still a 2D cross-section — it represents a freeform profile, not a true freeform
        3D surface. Nested or overlapping glass bodies are not surface-merged.</p>`,
    },
    related: ['prism', 'glassrod', 'lens', 'thicklens'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Prisms', url: 'https://www.rp-photonics.com/prisms.html' },
    ],
  },

  {
    type: 'diffuser',
    title: 'Diffuser',
    category: 'Dispersive elements',
    realWorld: {
      html: `
        <p>An optical diffuser scatters a beam into a cone of directions by refracting
        light through a microscopically rough or engineered surface — ground or frosted
        glass, a holographic diffuser with an embossed random microstructure, or an
        engineered "top-hat" diffuser designed for a specific divergence angle and
        intensity profile. Each microscopic facet still obeys ordinary Snell's law; what
        differs from a diffuser to a plain glass window is only the local surface normal,
        which varies randomly (or by design) from point to point at a scale far smaller
        than the beam.</p>
        <p>Diffusers homogenize illumination and convert a laser's narrow beam into broad,
        uniform lighting — and, critically for coherent sources, reduce speckle. A static
        diffuser illuminated by coherent laser light produces a grainy interference
        pattern (speckle) from the random path-length differences between scattered
        wavelets; spinning the diffuser fast enough that its pattern changes within a
        camera's or eye's integration time averages that speckle out into smooth
        illumination.</p>`,
      formulas: [
        { tex: 'I(\\theta) \\propto \\exp\\!\\left(-\\frac{\\theta^{2}}{2\\sigma^{2}}\\right), \\qquad \\text{FWHM} \\approx 2.355\\,\\sigma', caption: "A common engineering model for a ground-glass diffuser's angular scattering profile — its divergence is usually specified by this FWHM cone angle." },
      ],
    },
    inOpticalSetup: {
      html: `
        <p>Each incident ray is split into a small fan of rays (five, for a single traced
        ray), scattered within the configured divergence half-angle around the original
        direction. The scatter angle for each ray isn't randomized frame to frame — it's a
        deterministic pseudo-random offset computed from the surface's own ID, so the same
        diffuser always produces the exact same fan on every render, which is what keeps
        the speckled pattern stable and inspectable rather than flickering as you pan or
        re-render the sketch.</p>`,
      formulas: [],
      limitations: `<p>Divergence is set directly as a configured half-angle rather than
        derived from any surface-roughness or microstructure spec, and the scattered
        directions are a small fixed-count sample (five rays for a single incident ray)
        rather than a continuous or wavelength-dependent angular distribution — there's no
        Gaussian or top-hat irradiance profile actually computed, just a jittered fan. The
        speckled look is a fixed, deterministic pattern with no real interference behind
        it: unlike true laser speckle, it never changes with viewing angle, beam position,
        or a spinning diffuser, since no coherence or interference is modeled anywhere in
        the app.</p>`,
    },
    related: ['freeglass', 'prism', 'slm'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Diffusers', url: 'https://www.rp-photonics.com/diffusers.html' },
      { label: 'RP Photonics Encyclopedia — Scattering', url: 'https://www.rp-photonics.com/scattering.html' },
    ],
  },

  {
    type: 'glassrod',
    title: 'Glass rod',
    category: 'Dispersive elements',
    realWorld: {
      html: `
        <p>The geometry OpticalSetup draws for a glass rod is a plane-parallel slab: two
        flat, parallel long faces and two flat ends — the classic "glass block" of an
        introductory optics course. At normal incidence, light passes straight through
        with no net angular deviation but a real velocity change: phase velocity inside
        the medium drops to <span class="w">c/n</span>, so light takes longer to cross the
        same physical distance than it would in vacuum or air — the basis of every optical
        delay produced by inserting glass into a beam path, from picosecond fiber-stretcher
        spools to the fraction-of-a-picosecond thickness of a camera sensor's cover
        glass.</p>
        <p>At any nonzero angle of incidence, Snell's law bends the ray at entry and bends
        it back by the same amount at exit — the two parallel faces cancel the angular
        deviation exactly — but the beam still emerges shifted sideways from where it would
        have gone straight through, a lateral displacement that grows with thickness,
        incidence angle, and index. It's the same "apparent depth" effect that makes a
        straw look bent in a glass of water, just viewed from the side instead of from
        above.</p>`,
      formulas: [
        { tex: '\\Delta t = \\frac{nL}{c} - \\frac{L}{c} = \\frac{(n-1)L}{c}', caption: 'Extra transit time a slab of thickness L and refractive index n adds compared to the same distance in vacuum — equivalently, an extra optical path length of (n − 1)L.' },
        { tex: 'd = t\\,\\sec r\\,\\sin(i-r)', caption: 'Lateral displacement of a beam through a plane-parallel slab of thickness t, for incidence angle i and refraction angle r (related by Snell\'s law) — zero at normal incidence, growing with angle, thickness, and index.' },
      ],
    },
    inOpticalSetup: {
      html: `
        <p>The rod is four independent flat refracting boundaries — two long faces and two
        ends — each obeying the exact vector form of Snell's law and total internal
        reflection used by every dielectric surface in the app, so tilting the rod at an
        angle reproduces the real lateral-displacement geometry above, not an idealized
        straight pass-through. Inside the medium, the tracer accumulates optical path
        length as geometric distance × refractive index; on the shared pulse-timing
        overlay this means a packet visibly slows down while crossing the rod, lagging a
        same-time packet on a vacuum path by exactly the extra delay the formula above
        predicts for the configured index. The rod's fill is deliberately translucent so
        that lag is something you can actually watch happen, rather than a number hidden
        behind an opaque block. Choose the legacy constant index or one of the four
        catalogue Sellmeier glasses. A catalogue material also accumulates GDD from the
        actual distance each ray travels inside the rod.</p>`,
      formulas: [],
      limitations: `<p>The default remains a single constant index so every existing
        saved rod keeps its authored behavior; that mode has no material GDD. Selecting a
        catalogue glass enables Sellmeier refraction and path-length GDD, generally within
        a few percent where the curve is valid, but still omits absorption, temperature,
        coatings, and higher-order pulse effects. There's no
        cylindrical or lensing geometry either: despite the name, this is a rectangular
        slab cross-section with flat ends, not a focusing rod lens.</p>`,
    },
    related: ['freeglass', 'prism', 'delayline'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Group Velocity', url: 'https://www.rp-photonics.com/group_velocity.html' },
      { label: 'RP Photonics Encyclopedia — Group Index', url: 'https://www.rp-photonics.com/group_index.html' },
    ],
  },

  {
    type: 'bs',
    title: 'Beamsplitter',
    category: 'Filters & Splitters',
    realWorld: {
      html: `
        <p>A beamsplitter divides an incident beam into a transmitted and a reflected
        branch, typically using a thin dielectric or metallic coating on a glass cube or
        plate. Real coatings are rarely perfectly neutral: the reflect/transmit ratio
        usually depends on both wavelength and polarization, since s- and p-polarized
        light reflect differently off any dielectric interface away from normal
        incidence.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The beamsplitter is modeled as an ideal, polarization-independent divider: a
        single configurable ratio sets what fraction of each incident ray's intensity
        continues straight through versus reflects at the drawn diagonal, with no
        wavelength or angle dependence.</p>`,
      formulas: [
        { tex: 'I_T = rI_0, \\qquad I_R = (1-r)I_0', caption: 'Transmitted and reflected intensity for split ratio r.' },
      ],
      limitations: `<p>A real 50/50 cube is rarely exactly 50/50 across the visible
        spectrum, and its ratio shifts with polarization — none of that is modeled here.
        For a splitter whose two outputs are cleanly separated by polarization state
        rather than a fixed ratio, see the Polarizing BS instead.</p>`,
    },
    related: ['pbs', 'dichroic', 'filter', 'mirror'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Beam Splitters', url: 'https://www.rp-photonics.com/beam_splitters.html' },
    ],
  },

  {
    type: 'polarizer',
    title: 'Polarizer',
    category: 'Polarization',
    realWorld: {
      html: `
        <p>An ideal linear polarizer transmits only the field component parallel to its
        transmission axis. For fully polarized light arriving at angle
        <span class="w">θ</span> to that axis, the classic form of Malus's law gives the
        transmitted intensity:</p>`,
      formulas: [
        { tex: 'I = I_0 \\cos^{2}\\theta', caption: "Malus's law for fully (linearly) polarized input." },
      ],
      html2: `<p>That scalar formula only covers fully linearly polarized light, though —
        it says nothing about partially polarized, unpolarized, or elliptically
        polarized input, which is most real light sources.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>Polarization state throughout OpticalSetup is tracked as a full normalized
        Stokes vector <span class="w">(s₁, s₂, s₃)</span>, not a single angle — so a
        polarizer's transmission is computed with the general form of Malus's law, which
        reduces to the scalar equation above for fully linear light but also gives the
        correct partial transmission for unpolarized, partially polarized, or circular
        input:</p>`,
      formulas: [
        { tex: 'T = \\tfrac{1}{2}\\left(1 + s_1\\cos 2\\theta + s_2\\sin 2\\theta\\right)', caption: "The Stokes-vector form of Malus's law that OpticalSetup evaluates at every polarizer." },
      ],
      limitations: `<p>The polarizer is ideal — perfect extinction on the blocked axis,
        no wavelength dependence, no insertion loss on the transmission axis.</p>`,
    },
    related: ['hwp', 'qwp', 'pbs', 'eom'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Polarizers', url: 'https://www.rp-photonics.com/polarizers.html' },
    ],
  },

  {
    type: 'hwp',
    title: 'Half-wave plate',
    category: 'Polarization',
    realWorld: {
      html: `
        <p>A waveplate is a slice of birefringent crystal — quartz, magnesium fluoride,
        calcite — in which the refractive index depends on the direction the light is
        polarized. Two perpendicular directions in the plate face are special: the
        <strong>fast axis</strong>, along which light sees the lower index and travels
        quicker, and the <strong>slow axis</strong> perpendicular to it. Any incoming
        polarization can be resolved into components along those two axes, and because the
        components travel at different speeds, one emerges behind the other. Nothing is
        absorbed; only the relative phase between the two components changes.</p>
        <p>How much phase separates them is the <strong>retardance</strong>, and it depends
        on the index difference, the plate thickness, and the wavelength:</p>`,
      formulas: [
        { tex: '\\Gamma = \\frac{2\\pi\\,\\Delta n\\,d}{\\lambda}', caption: 'Retardance of a plate of thickness d, for an index difference Δn between the slow and fast axes.' },
        { tex: 'd = \\frac{\\lambda}{2\\,\\Delta n}', caption: 'The thickness that makes Γ exactly π — half a wave. For quartz at 633 nm, Δn ≈ 0.009, so this is about 35 µm: real plates are either bonded to a substrate or made an odd multiple of this thickness.' },
        { tex: '\\theta_{\\text{out}} = 2\\alpha - \\theta_{\\text{in}}', caption: 'A half-wave plate mirrors the polarization about its fast axis. Linear light at θ to that axis therefore comes out rotated by 2θ.' },
      ],
      html2: `
        <p>At exactly half a wave, one component is inverted relative to the other, and the
        effect on linear polarization is a <em>reflection about the fast axis</em>. The
        practical consequence is the one everybody uses: rotating the plate by some angle
        rotates the polarization by twice that angle. A plate turned 22.5° rotates the light
        45°; turned 45°, it rotates it a full 90°. Because it is a phase device rather than
        an absorbing one, this rotation is lossless — which is exactly why a half-wave plate
        followed by a polarizer is the standard way to control laser power continuously
        without touching the laser.</p>
        <p>On circularly polarized light the same mirror operation reverses the handedness,
        turning left-circular into right-circular.</p>
        <p>Retardance depends on wavelength, so a plate is specified for one. Used far from
        that wavelength it is no longer half-wave and the rotation degrades. A
        <strong>zero-order</strong> plate is genuinely as thin as the formula demands and is
        relatively forgiving of wavelength, angle, and temperature; a
        <strong>multi-order</strong> plate is a thicker, cheaper piece that adds several
        whole waves on top and is correspondingly fussier. <strong>Achromatic</strong>
        designs combine two materials so that the retardance stays near half a wave across a
        broad band.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The plate has one control that matters: the <strong>fast axis</strong> angle, on
        the purple canvas knob or in the inspector. Polarization is carried through the
        whole sketch as a Stokes vector, and the plate applies an exact 180° retardance
        about that axis — geometrically, a rotation of the polarization state on the
        Poincaré sphere.</p>
        <p>The behaviour that follows is the real one, not an approximation of it. Linear
        light at 0° through a plate with its axis at 22.5° comes out at exactly 45°; set the
        axis to 45° and the same input comes out at 90°. Align the axis with the input
        polarization, or put it perpendicular, and nothing changes — a half-wave plate does
        nothing to light already polarized along one of its own axes. Send circular light
        through and the handedness flips.</p>
        <p>Two consequences are worth knowing. The plate is <strong>lossless</strong>: it
        changes the state, never the intensity, so a power-control stage needs the polarizer
        after it to convert the rotation into attenuation. And <strong>unpolarized light
        passes through unchanged</strong>, which is correct rather than a shortcut — there
        is no preferred direction for the plate to act on. Put a
        <a href="../polarizer/">polarizer</a> before it if you want a defined state to
        rotate.</p>
        <p>Polarization modulation survives the plate too: a beam being switched between two
        states by an <a href="../aom/">electro-optic modulator</a> keeps alternating after
        the waveplate, with both states rotated together, rather than having the modulation
        flattened away.</p>`,
      limitations: `<p>The retardance is exactly half a wave at every wavelength. Nothing
        here models Δn, the plate thickness, or their dispersion, so there is no distinction
        between zero-order, multi-order, and achromatic plates, and no degradation when a
        plate is used away from its design wavelength — in a real setup that is the single
        most common reason a waveplate underperforms. The plate is also perfectly lossless
        and perfectly aligned: no Fresnel reflection at the faces, no absorption, no
        sensitivity to angle of incidence or temperature, and no walk-off between the two
        rays inside a birefringent crystal. Its optical thickness is not modelled either, so
        it contributes no group-delay dispersion to a pulse.</p>`,
    },
    related: ['qwp', 'polarizer', 'pbs', 'eom'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Waveplates', url: 'https://www.rp-photonics.com/waveplates.html' },
      { label: 'RP Photonics Encyclopedia — Birefringence', url: 'https://www.rp-photonics.com/birefringence.html' },
    ],
  },
  {
    type: 'qwp',
    title: 'Quarter-wave plate',
    category: 'Polarization',
    realWorld: {
      html: `
        <p>A quarter-wave plate is the same birefringent slice as a
        <a href="../hwp/">half-wave plate</a>, cut half as thick. It splits the incoming
        polarization into components along its fast and slow axes and delays one by a
        quarter of a wave — 90° of phase — relative to the other.</p>
        <p>That quarter wave is the amount that converts <em>between</em> linear and
        circular polarization rather than moving light around within either family. Two
        equal components 90° out of phase trace a circle as they add; the same two
        components in phase trace a straight line. So the plate's effect depends entirely on
        how the input is oriented relative to its axes:</p>`,
      formulas: [
        { tex: '\\Gamma = \\frac{2\\pi\\,\\Delta n\\,d}{\\lambda} = \\frac{\\pi}{2}', caption: 'Quarter-wave condition — the same retardance expression as any waveplate, set to 90°.' },
        { tex: 'd = \\frac{\\lambda}{4\\,\\Delta n}', caption: 'The thickness that achieves it: about 18 µm of quartz at 633 nm, which is why true zero-order plates are usually bonded to a thicker window.' },
      ],
      html2: `
        <p>At <strong>45°</strong> to the fast axis, the input splits into two equal
        components and the plate turns linear light into circular. At <strong>0° or
        90°</strong>, all the light is already along one axis, there is no second component
        to delay, and the polarization passes through untouched. At any angle in between the
        two components are unequal and the result is <strong>elliptical</strong> — the
        general case, of which linear and circular are the two limits.</p>
        <p>The conversion runs both ways, and that reversibility is what makes the plate so
        useful. Circular light entering a quarter-wave plate comes out linear. Pairing one
        with a polarizer therefore builds a simple optical gate: light passes the polarizer,
        becomes circular, reflects off something — which reverses the handedness — returns
        through the plate as linear light rotated 90° from the original, and is rejected by
        the polarizer it came through. That trick suppresses back-reflections in everything
        from optical drives to interferometers, and it is the reason quarter-wave plates
        turn up wherever a beam has to go out and come back along the same path.</p>
        <p>Circular polarization is also worth having in its own right. It carries no
        preferred direction in the plane, so it excites molecules regardless of their
        orientation, and its two handednesses interact differently with chiral matter —
        the basis of circular dichroism spectroscopy.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>Like the half-wave plate, the quarter-wave plate exposes one control, the
        <strong>fast axis</strong> angle, and applies an exact retardance to the beam's
        Stokes vector — 90° in this case. It starts at 45°, the angle that produces circular
        light from a horizontally polarized input.</p>
        <p>The full range of behaviour is there and can be read off any detector that
        reports polarization. Linear light at 0° with the axis at 45° comes out fully
        circular. Rotate the axis to 0° or 90° and the light passes through still linear.
        Set it to 22.5° and the output is elliptical, with the tilt of the ellipse and the
        amount of circularity both visible in a <a href="../detector/">polarimeter's</a>
        Stokes readout. Feed circular light in and linear light comes out.</p>
        <p>Two quarter-wave plates in series with the same axis are equivalent to one
        half-wave plate — worth trying, because it makes concrete that retardance simply
        accumulates.</p>
        <p>As with any waveplate here, the element is lossless and does nothing at all to
        unpolarized light, which has no defined phase relationship for the plate to act on.
        Establish a state with a <a href="../polarizer/">polarizer</a> first.</p>`,
      limitations: `<p>The retardance is exactly a quarter wave at every wavelength, so
        there is no wavelength dependence, no distinction between zero-order, multi-order,
        and achromatic plates, and no degradation away from a design wavelength. The plate
        is lossless and insensitive to angle of incidence and temperature, there is no
        walk-off inside the crystal, and it adds no group-delay dispersion to a pulse. The
        circular light it produces is mathematically perfect; a real plate leaves a small
        residual ellipticity that matters in sensitive polarimetry.</p>`,
    },
    related: ['hwp', 'polarizer', 'pbs', 'isolator'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Waveplates', url: 'https://www.rp-photonics.com/waveplates.html' },
      { label: 'RP Photonics Encyclopedia — Circular Polarization', url: 'https://www.rp-photonics.com/circular_polarization.html' },
    ],
  },
  {
    type: 'pbs',
    title: 'Polarizing beamsplitter',
    category: 'Polarization',
    realWorld: {
      html: `
        <p>An ordinary beamsplitter divides a beam by intensity and does not care how it is
        polarized. A polarizing beamsplitter divides it by polarization instead: one linear
        state is transmitted, the orthogonal state is reflected, and — unlike a
        <a href="../polarizer/">polarizer</a>, which absorbs or dumps what it rejects —
        both halves leave as usable beams. Nothing is thrown away, which is what makes the
        device a router rather than a filter.</p>
        <p>The usual form is a cube: two right-angle prisms cemented along their
        hypotenuses, with a multilayer dielectric coating sandwiched between them. Light
        meets that internal interface at 45°, and the layer stack is designed so that the
        <em>p</em>-polarized component (electric field in the plane of incidence) is
        transmitted while the <em>s</em>-polarized component is reflected through 90°. The
        two outputs are therefore linearly polarized and perpendicular to one another.</p>
        <p>How the incoming power divides follows Malus's law, so the split is set by the
        input polarization angle rather than by the cube:</p>`,
      formulas: [
        { tex: 'T = \\cos^{2}\\theta, \\qquad R = \\sin^{2}\\theta', caption: 'Fraction transmitted and reflected for linearly polarized light at θ to the transmission axis. Unpolarized light averages to 50/50.' },
      ],
      html2: `
        <p>Putting a <a href="../hwp/">half-wave plate</a> in front turns this into a
        <strong>continuously variable beamsplitter</strong>: rotating the plate rotates the
        input polarization, sweeping the split from all-transmitted to all-reflected without
        any absorption anywhere. That pairing is one of the most common two-element
        combinations on an optical bench, used for power control, for balanced splitting,
        and for routing a beam between two experiments.</p>
        <p>Run backwards, the same cube <em>combines</em> two orthogonally polarized beams
        into one path — the standard way to overlap two lasers with no loss, which no
        intensity beamsplitter can do.</p>
        <p>One asymmetry matters in practice. The transmitted port is usually very pure,
        with extinction ratios of 1000:1 or better, because the coating is good at rejecting
        <em>s</em>. The reflected port is markedly worse, often nearer 20:1, since some
        <em>p</em> light leaks into it. If an experiment needs a clean state, take it from
        the transmitted port, or clean the reflected one up with a polarizer afterwards.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The cube is drawn with its coated diagonal, and that diagonal is the traced
        surface. It transmits horizontal polarization along the incoming axis and reflects
        vertical polarization through 90°, splitting a single incoming ray into two outgoing
        beams that the tracer follows independently.</p>
        <p>The division follows Malus's law exactly: linear light at 0° goes fully through,
        at 90° fully across, at 45° splits half and half, and at 30° divides 75/25.
        Unpolarized light splits evenly, as it should. Both outputs emerge in
        <em>pure</em> linear states — horizontal on the transmitted port, vertical on the
        reflected one — regardless of what arrived, which is what makes a PBS a polarization
        <em>cleanup</em> element and not merely a splitter. A port receiving less than 2% of
        the light is dropped rather than drawn as a hairline that suggests a beam nobody
        could use.</p>
        <p>Because the cube resolves polarization into two paths, it is also how the sketch
        makes polarization <em>visible</em>: put one after a
        <a href="../hwp/">half-wave plate</a> and rotating the plate's axis visibly shifts
        power from one output arm to the other, with no attenuation anywhere in the path.</p>
        <p>The cube also handles fast polarization switching properly. A beam alternating
        between two states pulse by pulse leaves each port as a genuinely gated pulse train,
        with the two ports complementary — so an
        <a href="../aom/">electro-optic modulator</a> followed by a PBS produces two real
        interleaved trains rather than two steady half-power beams.</p>`,
      limitations: `<p>The cube is ideal. Both ports are perfectly pure, which the
        reflected port of a real cube is emphatically not — expect nearer 20:1 there — so
        an experiment whose result depends on reflected-port purity will look better here
        than on a bench. There is no coating loss, no residual reflection at the entrance
        and exit faces, and no angular or spectral acceptance: the split is the same at
        every wavelength and every angle of incidence, whereas a real cube is specified for
        a band and degrades outside it. The glass path through the cube is not modelled
        either, so it adds no optical path and no group-delay dispersion to a pulse.</p>`,
    },
    related: ['polarizer', 'hwp', 'bs', 'isolator'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Polarizers', url: 'https://www.rp-photonics.com/polarizers.html' },
      { label: 'RP Photonics Encyclopedia — Beam Splitters', url: 'https://www.rp-photonics.com/beam_splitters.html' },
    ],
  },
  {
    type: 'isolator',
    title: 'Optical isolator',
    category: 'Polarization',
    realWorld: {
      html: `
        <p>An optical isolator is a one-way valve for light: it passes a beam in the forward
        direction and blocks anything coming back. Lasers need one because they are unusually
        vulnerable to their own reflected light. A few per cent returning into the cavity can
        destabilise the output power, broaden the linewidth, drive a diode into mode-hopping,
        or — with enough power — damage the facet outright. Every optic downstream reflects
        something, so on any serious laser bench the isolator goes in first.</p>
        <p>What makes it possible is a genuinely unusual piece of physics. Almost everything
        in optics is <strong>reciprocal</strong>: reverse the direction of propagation and
        the light retraces its path exactly. A <a href="../hwp/">waveplate</a> that rotates
        polarization one way on the way out rotates it back on the way in, so no arrangement
        of ordinary optics can distinguish forward from backward. The
        <strong>Faraday effect</strong> can. A magneto-optic material in a strong axial
        magnetic field rotates polarization by an angle fixed by the field direction, not by
        the direction the light travels — a beam going the other way is rotated the
        <em>same</em> absolute way, not back.</p>`,
      formulas: [
        { tex: '\\beta = V B d', caption: 'Faraday rotation angle: the Verdet constant of the material times the axial field times the path length. The isolator is built so that β = 45°.' },
      ],
      html2: `
        <p>A standard isolator stacks three parts: an input polarizer, a 45° Faraday
        rotator, and an output polarizer set 45° from the input one. Forward, light is
        polarized, rotated 45°, and arrives aligned with the output polarizer — it passes.
        Backward, light entering the output polarizer is rotated a further 45° <em>in the
        same absolute sense</em>, reaching the input polarizer at 90° to it, and is
        rejected. The non-reciprocity is the whole mechanism; without it the return trip
        would simply undo the outward one.</p>
        <p>Real devices reach 30–40&nbsp;dB of isolation while costing 1–2&nbsp;dB going
        forward. Because the Verdet constant and the required rotation both depend on
        wavelength, an isolator is specified for a particular one, and its performance falls
        off away from it.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The isolator is modelled as what it does rather than how it does it: a
        directional gate. Rays travelling along the element's forward direction pass through
        untouched; rays with any backward component are removed from the trace entirely.
        Rotating the element sets which way is forward, so an isolator turned 180° blocks
        the beam it previously passed — the simplest way to see the element working.</p>
        <p>Its use here is the same as on a bench. Put one right after a laser, aim a mirror
        or a partially reflecting surface downstream, and the return beam that would
        otherwise travel back into the source stops at the isolator instead. Because the
        sketch traces reflections as real rays, that back-propagating beam is genuinely
        there to be blocked rather than merely implied.</p>
        <p>Note that despite living in the Polarization category, this element does not
        touch polarization at all. A beam's Stokes state is identical before and after it.
        That is a deliberate simplification, and it differs from a real isolator in a way
        worth knowing about — see below.</p>`,
      limitations: `<p>The Faraday mechanism is not modelled. There is no rotator and there
        are no internal polarizers, so the element does not polarize its output the way a
        real isolator does: light leaves in whatever state it arrived, whereas a real device
        emits light polarized along its output polarizer regardless of the input. If your
        setup depends on that, place an explicit <a href="../polarizer/">polarizer</a> after
        the isolator to represent it. Isolation is also perfect and instantaneous rather than
        the 30–40&nbsp;dB a real device achieves, forward transmission is lossless rather
        than costing 1–2&nbsp;dB, and there is no wavelength, temperature, or field
        dependence — a real isolator works properly only near the wavelength it was built
        for. Nothing outside the clear aperture is affected.</p>`,
    },
    related: ['polarizer', 'qwp', 'pbs', 'cwlaser'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Faraday Isolators', url: 'https://www.rp-photonics.com/faraday_isolators.html' },
      { label: 'RP Photonics Encyclopedia — Faraday Effect', url: 'https://www.rp-photonics.com/faraday_effect.html' },
    ],
  },
  {
    type: 'aom',
    title: 'Acousto-optic modulator (AOM)',
    category: 'Modulators',
    realWorld: {
      html: `
        <p>An AOM diffracts light off a traveling sound wave launched into a crystal by a
        piezoelectric transducer driven at an RF frequency. In the Bragg regime, light
        incident at the Bragg angle diffracts efficiently into a single order, shifted in
        frequency by exactly the drive frequency (up-shifted or down-shifted depending on
        propagation direction relative to the sound wave):</p>`,
      formulas: [
        { tex: '\\sin\\theta_B = \\frac{\\lambda}{2\\Lambda}, \\qquad \\Lambda = \\frac{v_s}{f_{RF}}', caption: 'Bragg angle, set by the acoustic wavelength Λ (sound velocity vₛ over drive frequency).' },
        { tex: 'f_{\\text{out}} = f_{\\text{in}} \\pm f_{RF}', caption: 'The diffracted beam is frequency-shifted by exactly the RF drive frequency.' },
      ],
    },
    inOpticalSetup: {
      html: `
        <p>The frequency shift is modeled exactly: the diffracted ray's optical frequency
        is genuinely shifted by the configured RF frequency, then converted back to a
        wavelength, which is what makes an AOM in a pulse-timing setup actually change
        color. Deflection and diffraction efficiency, though, are direct configurable
        parameters rather than quantities derived from crystal or drive properties.
        Gating support (square or graded sinusoidal) lets the modeled RF drive turn on
        and off in time, which the pulse-timing overlay reads as a temporal gate on the
        beam.</p>`,
      formulas: [],
      limitations: `<p>Deflection angle and diffraction efficiency are set directly by
        you, not derived from the Bragg condition, RF power, or interaction length — this
        is a schematic acousto-optic model, not a Bragg-cell simulator. Only the frequency
        shift is first-principles physics.</p>`,
    },
    related: ['aod', 'aotf', 'eom', 'chopper'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Acousto-optic Modulators', url: 'https://www.rp-photonics.com/acousto_optic_modulators.html' },
    ],
  },

  {
    type: 'eom',
    title: 'Electro-optic modulator (EOM)',
    category: 'Modulators',
    realWorld: {
      html: `
        <p>An electro-optic modulator controls light with a voltage. Almost all of them
        work through the <em>Pockels effect</em>: in a crystal without inversion symmetry,
        an applied electric field changes the refractive index in proportion to the field
        strength${cite(1)}${cite(3)}. Put a few hundred volts across a centimetre of lithium
        niobate and the optical path through it changes by a fraction of a wavelength —
        with no moving part, and in nanoseconds.</p>
        <p>The quantity that describes a device is the voltage needed to shift the phase by
        π, the <strong>half-wave voltage</strong>. For a bulk Pockels cell it is hundreds
        or thousands of volts, which is why these devices come with high-voltage drivers;
        a waveguide modulator, where the electrodes sit micrometres apart rather than
        millimetres, needs far less and switches far faster${cite(1)}${cite(2)}.</p>`,
      formulas: [
        { tex: '\\Delta n \\propto E \\qquad\\Longrightarrow\\qquad \\Delta\\varphi = \\pi\\,\\frac{V}{V_\\pi}', caption: 'The Pockels effect is linear in the applied field, so the phase shift is linear in the voltage. Vπ, the half-wave voltage, is the whole specification in one number.' },
      ],
      html2: `
        <p>What makes the family confusing is that one physical device — a crystal with
        electrodes on it — becomes three quite different instruments depending on how the
        light is sent through it and what is placed after it.</p>
        <h3>Phase modulator</h3>
        <p>The simplest arrangement, and the one everything else is built from: the input
        polarisation is aligned to one of the crystal's optical axes, so the polarisation
        state is untouched and only the phase moves${cite(1)}. Drive it sinusoidally and the
        output is not one frequency but a comb — the carrier plus sidebands at every
        multiple of the drive frequency, with amplitudes given by Bessel
        functions${cite(2)}.</p>`,
      formulas2: [
        { tex: 'e^{i\\beta\\sin\\Omega t} = \\sum_{n=-\\infty}^{\\infty} J_n(\\beta)\\, e^{in\\Omega t}', caption: 'The Jacobi–Anger expansion: phase modulation of depth β puts sidebands at ω ± nΩ with amplitude Jₙ(β). Drive hard enough and dozens of them appear, which is how a modulator becomes a comb generator.' },
      ],
      html3: `
        <p>Those sidebands are the point of the device in laser stabilisation: the
        Pound–Drever–Hall technique locks a laser to a cavity by asking how the sidebands
        it wrote come back${cite(1)}. Worth noting what a phase modulator is <em>not</em>
        good for: it cannot produce a sustained frequency shift, since that would need a
        phase ramp increasing without limit${cite(1)}. An <a href="../aom/">AOM</a> does that
        instead.</p>
        <h3>Polarisation modulator</h3>
        <p>Orient the crystal so the two polarisation axes see different index changes, and
        the cell becomes a <strong>voltage-controlled waveplate</strong>${cite(1)}${cite(2)}.
        Linear light entering at 45° to the axes leaves elliptical in general; at exactly a
        half wave of relative retardance it leaves linear again, rotated by 90°. Drive it
        randomly and it is a polarisation scrambler.</p>
        <h3>Amplitude modulator</h3>
        <p>Two routes, and they belong to different worlds. Put a polariser after a
        polarisation modulator and the polarisation swing becomes an intensity swing — the
        classic bulk arrangement, and the basis of Q-switches, cavity dumpers and pulse
        pickers${cite(1)}. Or put a phase modulator in one arm of a Mach–Zehnder
        interferometer, so the two arms interfere constructively or destructively according
        to the drive${cite(1)}${cite(2)}. The interferometric route is what integrated optics
        uses, because on a chip the phase stability that arrangement demands is far easier
        to hold than on a bench — and it is the workhorse of optical
        telecommunications.</p>
        <h3>Beyond the Pockels effect</h3>
        <p>Kerr cells use the quadratic electro-optic effect and are uncommon${cite(1)}.
        Electro-absorption modulators change absorption rather than index, through the
        Franz–Keldysh effect or the quantum-confined Stark effect in a semiconductor, and
        so are not electro-optic in the same sense at all${cite(1)}${cite(2)}. Plasmonic
        modulators, exploiting surface plasmon polaritons at metal surfaces, are extremely
        fast at low energy${cite(1)}.</p>
        <p>Materials matter, and the trade-offs are specific: KD*P gives excellent optical
        quality and high extinction over large apertures, which makes it the standard for
        Q-switches, but it is hygroscopic and rings piezoelectrically, limiting the
        repetition rate. BBO handles high average power and switches faster. Lithium
        niobate dominates waveguide devices for its large electro-optic
        coefficients${cite(1)}. Devices intended for stability often use two matched cells
        in an athermal pairing that cancels the temperature drift of the relative phase, or
        four crystals to cancel walk-off as well${cite(1)}.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>This element is the <strong>polarisation modulator</strong> of the three: a
        Pockels cell used as a voltage-controlled waveplate. It applies a retardance
        between the two axes of a crystal whose orientation you set, either as a fixed
        value or switching between two states as a square wave on the shared simulation
        clock.</p>
        <p>The default switching mode flips between orthogonal linear polarisations, which
        is the half-wave switch a Pockels cell is usually bought for and needs no
        crystal-axis reasoning at all. Put a <a href="../polarizer/">polariser</a> or a
        <a href="../pbs/">polarising beamsplitter</a> after it and that becomes real
        intensity modulation — the bulk amplitude modulator above, built the way it is built
        on a bench. With a pulsed source, individual pulses are routed by whichever state
        they meet, so a photodetector on a screen shows the modulated train and the element
        works as a pulse picker.</p>`,
      formulas: [],
      limitations: `<p>This element is the polarisation modulator alone. The phase
        modulator is a separate component — see
        <a href="../phasemodulator/">Phase modulator</a> — and the amplitude modulator is
        built rather than provided: a polariser after this one, which works with any source,
        or a phase modulator in one arm of an interferometer, which needs a sized
        monochromatic CW laser for the arms to interfere at all.</p>
        <p>Nothing here is a voltage. Retardance is set in degrees directly, so there is no
        half-wave voltage, no drive amplitude, and no relation between the two — which also
        means the linearity of the Pockels effect, the whole basis of the device, is
        assumed rather than shown. The crystal is ideal and achromatic: a retardance set
        here applies equally at 405 nm and 1550 nm, where a real cell is calibrated for one
        wavelength and scales roughly as 1/λ. No material is chosen, so none of the
        material trade-offs appear.</p>
        <p>Switching is instantaneous and perfectly square. Rise time, driver bandwidth,
        piezoelectric ringing, thermal drift of the operating point, and the residual
        static birefringence a real cell has at zero volts are all absent, as is any
        insertion loss. Resonant and travelling-wave designs, which is how real devices
        reach gigahertz, have no counterpart.</p>`,
    },
    related: ['phasemodulator', 'polarizer', 'pbs', 'qwp', 'aom'],
    citations: [
      { label: '“Electro-optic Modulators,” RP Photonics Encyclopedia (DOI 10.61835/7rv)', url: 'https://www.rp-photonics.com/electro_optic_modulators.html' },
      { label: 'Electro-optic modulator — Wikipedia', url: 'https://en.wikipedia.org/wiki/Electro-optic_modulator' },
      { label: 'T. A. Maldonado, “Electro-Optic Modulators,” ch. 13 in M. Bass (ed.), Handbook of Optics, Vol. 2, McGraw-Hill (1995) — the standard reference treatment: crystal optics and the index ellipsoid, the electro-optic effect, and modulator devices', url: 'https://www.accessengineeringlibrary.com/browse/handbook-of-optics-volume-v-atmospheric-optics-modulators-fiber-optics-x-ray-and-neutron-optics-third-edition' },
    ],
    resources: [
      { label: 'RP Photonics Encyclopedia — Pockels Cells', url: 'https://www.rp-photonics.com/pockels_cells.html' },
      { label: 'IEEE TechNav — Electrooptic Modulators', url: 'https://technav.ieee.org/topic/electrooptic-modulators/' },
    ],
  },

  {
    type: 'phasemodulator',
    title: 'Phase modulator',
    category: 'Modulators',
    realWorld: {
      html: `
        <p>A phase modulator is the simplest electro-optic device there is: a Pockels
        cell with the input polarisation aligned to one of the crystal's optical axes, so
        the polarisation state is untouched and the voltage moves only the
        phase${cite(1)}. Nothing about the beam changes that a detector can see. It is the
        component every other electro-optic modulator is built from, and on its own it is
        completely invisible.</p>
        <p>What the crystal actually fixes is the optical path: the Pockels effect changes
        the refractive index in proportion to the applied field, so a given drive writes
        the same Δn·L at every wavelength. The <em>phase</em> that corresponds to therefore
        scales as 1/λ, which is why a modulator is specified together with a
        wavelength — a device that is half-wave at 532 nm is quarter-wave at
        1064 nm${cite(1)}${cite(3)}.</p>`,
      formulas: [
        { tex: '\\Delta\\varphi = \\frac{2\\pi}{\\lambda}\\,\\Delta n\\,L = \\pi\\,\\frac{V}{V_\\pi}', caption: 'The path written is fixed by the crystal and the voltage; the phase follows from it and the wavelength. Vπ, the half-wave voltage, is hundreds to thousands of volts for a bulk cell, far less for a waveguide.' },
      ],
      html2: `
        <p>Drive it sinusoidally and the output spectrum is no longer one frequency. A
        phase varying as β sin Ωt produces the carrier plus a pair of sidebands at every
        multiple of the drive frequency, with amplitudes given by Bessel
        functions${cite(2)}. Drive hard enough — a resonant modulator can reach large depth
        at modest voltage — and dozens of sidebands appear, which is how a modulator
        becomes a comb generator${cite(1)}.</p>`,
      formulas2: [
        { tex: 'e^{i\\beta\\sin\\Omega t} = \\sum_{n=-\\infty}^{\\infty} J_n(\\beta)\\,e^{in\\Omega t}', caption: 'The Jacobi–Anger expansion: modulation depth β sets how the light is divided among the carrier and the sidebands at ω ± nΩ.' },
      ],
      html3: `
        <p>Those sidebands are what the device is usually bought for. Pound–Drever–Hall
        laser stabilisation writes them deliberately and asks how they come back from a
        cavity, deriving from that an error signal that says which way the laser has
        drifted${cite(1)}. It is worth being clear about what a phase modulator cannot do:
        it cannot produce a sustained frequency shift, because that would require a phase
        ramp increasing without bound${cite(1)}. An <a href="../aom/">AOM</a> shifts
        frequency; a phase modulator only wobbles it.</p>
        <h3>Making it visible</h3>
        <p>Since phase alone is undetectable, a phase modulator is put to work by letting
        it interfere with something. Place it in one arm of a Mach–Zehnder interferometer
        and the two arms recombine constructively or destructively according to the drive,
        so the phase becomes power at the output${cite(1)}${cite(2)}. That is the
        <strong>Mach–Zehnder modulator</strong>, and its transfer function is the
        interferometer's own.</p>`,
      formulas3: [
        { tex: 'P_{\\text{out}} = P_{\\text{in}}\\cos^{2}\\!\\left(\\frac{\\Delta\\varphi}{2}\\right)', caption: 'Half a wave of drive takes the output from fully bright to fully dark. The light is not absorbed — it leaves by the other port.' },
      ],
      html4: `
        <p>Almost all high-speed optical telecommunications runs on this arrangement, built
        as a waveguide interferometer on lithium niobate or silicon. On a chip the phase
        stability the layout demands is far easier to hold than on a bench, the electrodes
        sit micrometres apart so the drive voltage is low, and travelling-wave electrodes
        matched to the optical velocity push the bandwidth into the tens of
        gigahertz${cite(1)}${cite(2)}.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The modulator writes one optical path across the whole beam — uniform, unlike
        the <a href="../phaseplate/">phase object</a>, which varies its path across the
        aperture. It does not touch polarisation, intensity, or direction, so on its own it
        does nothing measurable at all: put a detector after it and the reading is exactly
        what it was.</p>
        <p>The drive is set as the phase it writes at full deflection, in degrees at a
        design wavelength, which is how a device is chosen — half-wave, quarter-wave. That
        is converted to the fixed optical path the crystal really applies, so a modulator
        set to half a wave at 532 nm writes a quarter wave at 1064 nm, as a real one does.
        Hold it static, or drive it with a sine or square wave on the shared simulation
        clock.</p>
        <p>In one arm of an interferometer it becomes the amplitude modulator above,
        following cos²(Δφ/2) exactly: half a wave takes the output from full to nothing,
        and the light that leaves one port arrives at the other, so the two always sum to
        the input.</p>
        <p>That holds only where the tracer can reconstruct a coherent field, which means
        a <strong>CW laser in <em>Beam with size</em> mode with no bandwidth</strong> — the
        one source whose samples carry a recoverable phase. Drive the same interferometer
        with a pulsed or supercontinuum source, or with a CW laser in <em>Simple line</em>
        mode, and the two arms are added as intensities instead: both ports sit at half the
        light and the modulator changes nothing, whatever it is set to. The reading says so
        rather than leaving it to be inferred — it reports insufficient coherent overlap.</p>`,
      formulas: [],
      limitations: `<p>The interferometric behaviour above needs a sized monochromatic CW
        laser. That is not a property of this element but of what the tracer can reconstruct
        a phase through, and it applies to every interference effect in the app; it is
        repeated here because it decides whether this component appears to do anything at
        all.</p>
        <p>Sidebands are not modelled, and could not usefully be: a 1 GHz
        drive at 532 nm puts them 9×10⁻⁴ nm from the carrier, and at 1 MHz it is 9×10⁻⁷ nm,
        against a spectrometer that resolves 0.1 nm. Everything the sidebands are used for
        — Pound–Drever–Hall locking, comb generation, anything reading the modulation in
        the spectrum rather than in time — is therefore out of reach. What is modelled is
        the phase itself, and what interference makes of it.</p>
        <p>Nothing here is a voltage. The drive is set as a phase directly, so there is no
        half-wave voltage, no drive amplitude, no crystal and no material — which means the
        linearity of the Pockels effect is assumed rather than shown. The modulator is
        ideal: no insertion loss, no residual static birefringence, no thermal drift of the
        operating point, and a square drive that switches instantaneously with no driver
        bandwidth behind it. Resonant and travelling-wave designs, which is how real
        devices reach gigahertz, have no counterpart.</p>`,
    },
    related: ['eom', 'phaseplate', 'bs', 'camera', 'aom'],
    citations: [
      { label: '“Electro-optic Modulators,” RP Photonics Encyclopedia (DOI 10.61835/7rv)', url: 'https://www.rp-photonics.com/electro_optic_modulators.html' },
      { label: 'Electro-optic modulator — Wikipedia', url: 'https://en.wikipedia.org/wiki/Electro-optic_modulator' },
      { label: 'T. A. Maldonado, “Electro-Optic Modulators,” ch. 13 in M. Bass (ed.), Handbook of Optics, Vol. 2, McGraw-Hill (1995)', url: 'https://www.accessengineeringlibrary.com/browse/handbook-of-optics-volume-v-atmospheric-optics-modulators-fiber-optics-x-ray-and-neutron-optics-third-edition' },
    ],
    resources: [
      { label: 'RP Photonics Encyclopedia — Phase Modulators', url: 'https://www.rp-photonics.com/phase_modulators.html' },
      { label: 'RP Photonics Encyclopedia — Pound–Drever–Hall Technique', url: 'https://www.rp-photonics.com/pound_drever_hall_technique.html' },
    ],
  },

  {
    type: 'aod',
    title: 'Acousto-optic deflector (AOD)',
    category: 'Modulators',
    realWorld: {
      html: `
        <p>An acousto-optic deflector steers a laser beam by changing a frequency. A
        piezoelectric transducer bonded to a transparent crystal launches a sound wave
        through it; the travelling compression makes a moving grating of refractive
        index, and light crossing that grating is diffracted. Change the drive
        frequency and the acoustic wavelength changes with it, so the diffracted beam
        leaves at a different angle — a scanner with nothing in it that moves${cite(1)}.</p>
        <p>It is the same interaction an <a href="../aom/">AOM</a> uses. The difference
        is entirely in the drive: a modulator is run at a fixed frequency and varying
        power, to switch a beam on and off, while a deflector is run at constant power
        and varying frequency, to point it${cite(1)}. The deflection angle follows from
        the Bragg condition, and for an isotropic medium it is</p>`,
      formulas: [
        { tex: '\\theta = \\frac{\\lambda f}{v}', caption: 'Deflection angle: λ the vacuum wavelength, f the acoustic drive frequency, v the speed of sound in the crystal. It is also just the ratio of the optical to the acoustic wavelength, the latter typically 10–100 µm.' },
      ],
      html2: `
        <p>Three things follow from that one expression, and between them they explain
        every specification on an AOD datasheet.</p>
        <p><strong>The angles are small.</strong> Sound is slow and its wavelength is
        enormous next to light's, so the ratio is tiny. A 1064 nm beam in fused silica —
        sound speed 5.9 km/s — driven at 100 MHz deflects by 18 mrad, about one
        degree${cite(1)}. The usable range of a real deflector is "rather small — a few
        degrees"${cite(1)}, with published devices quoting scan angles from roughly 5 to
        60 mrad${cite(2)}. Anyone needing more puts a telescope after it, which trades
        beam width for angle.</p>
        <p><strong>Slow crystals are better.</strong> Since the angle goes as 1/v, a
        material with a slow sound wave gives more deflection for the same frequency
        range. This is why the standard choice for the visible and near infrared is
        tellurium dioxide driven on its slow shear mode, where sound travels at about
        620 m/s — roughly a tenth of the speed in fused silica${cite(1)}${cite(2)}. Fused
        silica is used in the ultraviolet and germanium in the mid infrared, in each case
        because the crystal has to be transparent before anything else matters${cite(1)}.</p>
        <p><strong>The scan is chromatic.</strong> The angle is proportional to
        wavelength, so two colours entering together leave at different angles. That is
        a nuisance for a broadband beam and the whole point of an
        <a href="../aotf/">AOTF</a>, which uses the same physics to select colours
        rather than to steer them.</p>
        <h3>Resolvable spots</h3>
        <p>The number that actually matters when choosing a deflector is usually not the
        scan angle but how many distinguishable directions fit inside it${cite(1)}. A
        beam cannot be pointed more precisely than its own divergence, so the resolution
        is the scan range divided by that divergence — equivalently, the time the sound
        takes to cross the beam multiplied by the frequency range it is driven
        over${cite(1)}.</p>`,
      formulas2: [
        { tex: 'N = \\frac{\\Delta\\theta}{\\theta_{\\text{div}}} = \\tau\\,\\Delta f', caption: 'Resolvable spots: the aperture time τ — how long sound takes to cross the beam — times the RF bandwidth. Around 1.5 µs per mm of beam in TeO₂, so a 5 mm beam and a 40 MHz bandwidth give roughly 300 spots.' },
      ],
      html3: `
        <p>That product is why a deflector wants a wide, well-collimated beam: widening
        it lengthens the aperture time and buys resolution. It is also why resolution and
        speed pull against each other. The device cannot settle faster than sound crosses
        the beam, so the same choice that gives many spots makes each jump slower, and a
        crystal chosen for its slow sound wave is slow in both senses${cite(1)}.</p>
        <p>Two deflectors mounted at right angles steer in two dimensions${cite(1)}. Because
        the beam can be sent to any angle in the range as fast as it can be sent to the
        neighbouring one, an AOD pair can address points in an arbitrary order rather than
        rastering through them — the basis of random-access scanning in multiphoton
        microscopy, where the interesting neurons are visited and the space between them
        is not.</p>
        <h3>What a datasheet reports</h3>
        <p>Diffraction efficiency is typically 50–80%, sometimes near 90%, and lower at
        longer wavelengths${cite(1)}. It is polarisation dependent, and it peaks at the
        centre of the frequency range and falls away toward both ends — which is why it
        should be checked at the edges of the scan and not only in the middle${cite(1)}.
        Some devices compensate by raising the drive power at the extremes, and
        beam-steered designs use a phased array of electrodes to swing the acoustic wave
        direction and hold efficiency across a wider scan${cite(1)}.</p>
        <p>The undiffracted zero order carries whatever was not deflected. It does not
        move with the drive and is normally dumped${cite(1)}.</p>
        <p>One effect is worth knowing because it is invisible: the diffracted beam comes
        away shifted in optical frequency by exactly the drive frequency, since it has
        scattered from a moving grating. For a deflector this is "usually irrelevant"${cite(1)}
        — 80 MHz on a 532 nm beam is a shift of 7.6×10⁻⁵ nm — but it is the same effect
        an AOM is bought for.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The deflector is specified the way you would choose one: by the angles. Set
        the <strong>centre deflection</strong> and, for a scan, the <strong>total scan
        angle</strong> swept around it. The drive frequency behind those angles is left
        implicit — reading θ = λf/v forwards, a scan linear in frequency is linear in
        angle, so the angles are the honest parameterisation and the crystal never has
        to be named.</p>
        <p>The defaults are a real device: 4° of centre deflection and 2° of scan is what
        a TeO₂ slow-shear deflector gives at 532 nm on an 80 MHz drive across a 40 MHz
        bandwidth. The wavelength scaling is kept, referenced to the design wavelength, so
        a beam at twice that wavelength deflects twice as far and a broadband beam fans
        out — which is the chromatic behaviour a real deflector has.</p>
        <p>Four drives are available. <em>Static</em> holds one angle. <em>Triangle</em>
        sweeps and retraces, <em>sawtooth</em> sweeps and flies back, and <em>random
        step</em> addresses one angle per step in an unpredictable order and holds it
        until the next — the random-access mode, rather than a sweep. The scan runs on the
        shared simulation clock at the rate set in kilohertz, so it stays phase-locked to
        pulses and to any other modulator on the bench.</p>
        <p>The scan rate is bounded by the same physics that sets the resolution. The
        inspector reports the <strong>access time</strong> for the aperture in use, taken
        as 1.5&nbsp;µs per millimetre for TeO₂ slow shear, and the rate that implies: a
        20&nbsp;mm aperture takes 30&nbsp;µs to fill and so cannot be re-pointed faster
        than about 33&nbsp;kHz, which is why catalogue random-access cycle rates sit
        between roughly 40 and 170&nbsp;kHz${cite(2)} rather than in the megahertz. Ask for
        more and the readout says the crystal cannot settle that fast.</p>`,
      formulas: [],
      limitations: `<p>The angles are configured, not derived. Nothing here knows a
        crystal, an acoustic velocity, or an RF bandwidth, so a combination set on this
        element need not correspond to any device that could be built — and the ceilings
        allowed are deliberately looser than reality so an illustrative sketch stays
        readable. Real deflectors reach a few degrees at most.</p>
        <p>Diffraction efficiency is a flat user-set fraction across the whole scan. A
        real one peaks at the centre frequency and falls away toward both ends, which is
        the specification that most often decides whether a device is usable, and it is
        polarisation dependent, which is not modelled either. There is no relation
        between drive power and efficiency.</p>
        <p>The optical frequency shift is not applied. It is real, but at 7.6×10⁻⁵ nm for
        80 MHz at 532 nm it is more than a thousand times finer than the finest wavelength
        difference anything in this workbench resolves; the <a href="../aom/">AOM</a>,
        which exists for that shift, still carries it.</p>
        <p>Access time is reported but not enforced: the beam jumps instantly between
        angles, with no settling and no transient while the acoustic wave refills the
        aperture. The number of resolvable spots — arguably the figure that decides a real
        deflector's worth — is not computed at all, and neither is the cylindrical lensing
        a fast scan produces when different parts of the beam see different acoustic
        frequencies at once. Multi-tone drive, which addresses several
        angles at once, is not available: one drive, one deflected beam.</p>`,
    },
    related: ['aom', 'aotf', 'galvo', 'slm'],
    citations: [
      { label: '“Acousto-optic Deflectors,” RP Photonics Encyclopedia', url: 'https://www.rp-photonics.com/acousto_optic_deflectors.html' },
      { label: 'Gooch & Housego — Acousto-optic deflectors: product specifications for TeO₂ and fused-silica devices', url: 'https://gandh.com/products/acousto-optics/deflectors' },
    ],
    resources: [
      { label: 'AA Opto-Electronic — High Resolution Deflectors', url: 'https://aaoptoelectronic.com/ao-devices/high-resolution-deflectors/' },
      { label: 'RP Photonics Encyclopedia — Acousto-optic Modulators', url: 'https://www.rp-photonics.com/acousto_optic_modulators.html' },
    ],
  },

  {
    type: 'beamdump',
    title: 'Beam dump',
    category: 'Beam Block',
    realWorld: {
      html: `
        <p>A beam dump ends a beam. Every optical setup produces light that has done its
        job — the unused port of a beamsplitter, the rejected polarization, the zeroth order
        off a grating, the beam left over when an experiment is realigned — and all of it
        has to stop somewhere deliberate. Left alone it lands on a wall, a colleague, or
        back in the laser.</p>
        <p>Doing that well is harder than it sounds, because "absorbing" light is really
        <em>converting it to heat</em> while reflecting as little as possible. The usual
        design is geometric rather than material: a cone, a wedge, or a stack of angled
        vanes, anodised matte black, arranged so that any light not absorbed on first
        contact reflects <em>deeper into</em> the cavity rather than back out. Several
        bounces at a few per cent reflectivity each leave a negligible fraction escaping.
        The black surface does the absorbing; the geometry catches what the surface
        misses.</p>

        <h3>Why high-power dumps need cooling</h3>
        <p>A dump absorbs essentially the entire beam, so it receives the laser's full
        average power as heat in a small volume. That is a genuine thermal engineering
        problem, and it sets how a dump is built:</p>
        <ul>
          <li>Up to a few watts, a black-anodised aluminium cone with fins radiates and
          convects the heat away passively.</li>
          <li>From tens of watts, passive cooling stops keeping up and the dump needs
          forced air or a substantial heat sink.</li>
          <li>At hundreds of watts and above — industrial and materials-processing lasers —
          dumps are <strong>water-cooled</strong>, with flow interlocks that shut the laser
          down if circulation fails.</li>
        </ul>
        <p>Exceeding a dump's rating is not a small mistake. The anodised layer can burn
        away, destroying the absorption it was providing and releasing particulates;
        absorbing glass can crack from thermal shock; and a dump that starts reflecting is
        worse than no dump at all, because nobody is expecting a beam to come back out of
        it. Ultrafast lasers add a second constraint: a femtosecond pulse train of modest
        <em>average</em> power carries enormous <em>peak</em> intensity, and can ablate an
        absorber that would handle the same average power from a CW source without
        complaint. Dumps are rated for both.</p>`,
      formulas: [
        { tex: 'P_{\\text{abs}} \\approx P_{\\text{in}}', caption: 'The defining property: a dump converts essentially the whole beam to heat, so its thermal load is the full incident power — not a fraction of it.' },
        { tex: 'R_{\\text{eff}} \\approx R^{N}', caption: 'Why the geometry matters more than the coating: N bounces inside the cavity at surface reflectivity R leave only R^N escaping. Four bounces at 5% reflect back about 6 parts per million.' },
      ],
      html2: `
        <h3>Safety practice around beam blocks</h3>
        <p>Beam dumps are the most basic piece of laser safety hardware on a bench, and they
        work only as part of a wider practice:</p>
        <ul>
          <li><strong>Terminate every beam, including the ones you did not plan.</strong>
          An uncoated glass surface reflects about 4% per face at normal incidence, so every
          window, sample, and filter throws off stray beams. Those are what actually reach
          people's eyes; the main beam is usually the one everybody is watching.</li>
          <li><strong>Keep every beam in one horizontal plane, well below seated eye
          level</strong>, and never raise your eyes to that plane. Most accidents happen
          when someone bends down to look at something.</li>
          <li><strong>Remove watches, rings, and badges</strong> before working near an open
          beam. A polished surface at an unlucky angle is an unplanned mirror.</li>
          <li><strong>Wear eyewear matched to both wavelength and optical density.</strong>
          Goggles that block 1064&nbsp;nm may transmit 532&nbsp;nm freely — a real hazard in
          multi-wavelength setups such as a two-colour Raman microscope, where the pump,
          Stokes, and generated signal are all different colours.</li>
          <li><strong>Never look along a beam axis</strong>, even attenuated. Use a viewing
          card, a fluorescent target, or an IR viewer.</li>
          <li><strong>Enclose the beam path</strong> where you can, and use interlocks and
          warning signage where you cannot.</li>
          <li>For <strong>Class 4</strong> lasers, remember that even <em>diffuse</em>
          reflections can be hazardous to eyes and skin, and that the beam is a credible
          ignition source for paper, cloth, and solvents.</li>
        </ul>
        <p>None of this is modelled by a ray tracer, and a sketch that looks tidy on screen
        can still describe a setup that is unsafe to build. Treat a drawing as a plan, not
        a risk assessment.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The dump is drawn as a closed body whose faces are all absorbing, so any ray that
        reaches it from any direction stops there and is removed from the trace. Nothing is
        transmitted, nothing is reflected, and no ray continues past it. The only control is
        the clear aperture, which sets how large a target it presents.</p>
        <p>Its practical use here is the same as on a bench: give the unused ports somewhere
        to end. Put one on the second output of a <a href="../bs/">beamsplitter</a>, on the
        rejected port of a <a href="../pbs/">polarizing beamsplitter</a>, or on an
        unwanted diffraction order from a <a href="../grating/">grating</a>, and the figure
        stops showing a beam wandering off into empty space. It makes a diagram read as a
        deliberate design rather than an unfinished one, and it is what a reviewer of your
        figure will look for.</p>
        <p>Because a dumped ray is removed rather than attenuated, a dump is also a clean
        way to isolate one branch of a setup while you study another — block one arm of an
        interferometer and the remaining path is all that is traced.</p>`,
      limitations: `<p>Absorption is total and perfect: there is no residual reflectivity,
        no wavelength dependence, and no angular limit, whereas a real dump reflects a small
        fraction and does so more at grazing incidence. Nothing thermal is modelled at all —
        no absorbed power, no temperature rise, no damage threshold, and no warning when a
        sketch dumps a kilowatt into a component that could not survive it. The dump's
        rating and its cooling requirement are entirely the designer's responsibility, and
        the section above is the only place this tool addresses them.</p>`,
    },
    related: ['blocker', 'slit', 'bs', 'pbs'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Beam Dumps', url: 'https://www.rp-photonics.com/beam_dumps.html' },
      { label: 'RP Photonics Encyclopedia — Laser Safety', url: 'https://www.rp-photonics.com/laser_safety.html' },
    ],
  },
  {
    type: 'slit',
    title: 'Slit',
    category: 'Beam Block',
    realWorld: {
      html: `
        <p>A slit is an aperture: two opaque jaws with a gap between them. Unlike a
        <a href="../beamdump/">beam dump</a>, whose job is to stop a beam entirely, a slit
        stops only part of one — it passes the light within its gap and absorbs everything
        outside it. That makes it a shaping and selecting element, though the light it
        rejects still has to be absorbed, and at high power the jaws face the same thermal
        problem a dump does.</p>
        <p>Slits do two quite different jobs depending on where they sit. In a plane where
        the beam is <em>spatially</em> spread out, a slit trims the beam's cross-section —
        cutting off a tail, defining a sheet of light, or setting the illuminated strip in a
        line-scan system. In a plane where wavelengths have been spread out by a
        <a href="../grating/">grating</a> or <a href="../prism/">prism</a>, exactly the same
        component becomes a <em>wavelength</em> selector: it passes a band and rejects the
        rest. A monochromator is, in essence, a dispersing element with a slit at each end,
        and the slit width sets the spectral resolution directly.</p>
        <p>There is a limit to how far this can be pushed. Narrowing a slit does not narrow
        the transmitted beam indefinitely, because diffraction sets in: the narrower the
        aperture, the more the light spreads after it.</p>`,
      formulas: [
        { tex: '\\theta \\approx \\frac{\\lambda}{a}', caption: 'Diffraction spreading after a slit of width a — the angular half-width of the central lobe. Below roughly a millimetre for visible light, closing the slit further makes the far-field beam wider, not narrower.' },
        { tex: '\\Delta\\lambda \\approx \\frac{a}{f}\\,\\frac{d\\lambda}{d\\theta}', caption: 'Spectral bandwidth passed by a slit of width a at the focal plane of a spectrograph of focal length f — the slit width and the dispersion together set the resolution.' },
      ],
      html2: `
        <p>Because a slit rejects most of the light reaching it, it is a lossy component by
        design, and in a spectrograph the trade-off is explicit: a narrower slit buys
        resolution at the cost of signal. Choosing the width is choosing where on that curve
        to sit.</p>
        <p>The rejected light does not vanish. On a low-power source it simply warms the
        jaws; on a high-power one the jaws need the same treatment as a beam dump — an
        absorbing surface that can shed heat, and at high enough power, active cooling. A
        pair of thin blackened blades that works at milliwatts will not survive tens of
        watts.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The slit is drawn as two absorbing jaws with a gap between them, and it is traced
        exactly that way: rays passing through the gap continue completely unchanged, and
        rays striking either jaw are absorbed and removed. Two controls set it — the
        <strong>gap</strong>, and the overall optic size that fixes how far the jaws
        extend.</p>
        <p>The useful consequence is that a slit here is a genuine spatial filter. Send a
        wide beam at one and only the central portion survives, so you can define a beam
        width mid-path, clip the wings off a diverging beam, or take one branch of a fan and
        discard the rest. Place one after a <a href="../grating/">grating</a> or a
        <a href="../prism/">prism</a> and it becomes a wavelength selector, because the
        colours have been separated in space by then and the slit is choosing among
        positions.</p>
        <p>The purple canvas knob adjusts the gap directly, which makes the selection easy
        to explore: widen it until the branch you want passes, then narrow it until only
        that branch does.</p>`,
      limitations: `<p><strong>Diffraction is not modelled</strong>, and for a slit that is
        the significant omission: narrowing the gap here simply passes a narrower bundle of
        rays, whereas a real slit below about a millimetre starts spreading the light it
        transmits, and a very narrow one produces a broad diffraction pattern rather than a
        thin beam. Nothing in this element will ever show that reversal. Transmission
        through the gap is also perfect and edge effects are absent — no partial
        transmission at the jaw edges, no scattering off them, and no wavelength dependence.
        As with the beam dump, the absorbed light produces no heat and carries no damage
        threshold, so a sketch will happily throw arbitrary power at a pair of thin
        blades.</p>`,
    },
    related: ['beamdump', 'blocker', 'grating', 'prism'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Monochromators', url: 'https://www.rp-photonics.com/monochromators.html' },
      { label: 'RP Photonics Encyclopedia — Diffraction', url: 'https://www.rp-photonics.com/diffraction.html' },
    ],
  },
  {
    type: 'blocker',
    title: 'Invisible blocker',
    category: 'Beam Block',
    realWorld: {
      html: `
        <p>This element has no laboratory counterpart. It is a figure-making tool: a region
        that absorbs any ray entering it, drawn on the canvas while you work and then
        <strong>omitted from exported figures</strong>.</p>
        <p>The need it answers is a real one, though. A ray tracer follows every branch it
        generates, including ones that are physically correct but irrelevant to the point a
        figure is making — a weak back-reflection wandering across the frame, a stray
        diffraction order, the ghost from a beamsplitter's second surface. On a bench you
        would put a card in the way and forget about it. The equivalent here is a blocker:
        it takes the unwanted branch out of the trace without adding a component to the
        drawing that a reader would have to interpret.</p>
        <p>The honest framing is that this is a <em>presentation</em> control, not physics.
        If a stray beam exists in your setup it exists in reality too, and hiding it from a
        figure is a choice about what the figure is for. Use it to remove distractions from
        a teaching diagram; do not use it to make a setup look cleaner than it is, and never
        use it to hide a beam that would need terminating in the real build — see the
        safety notes on the <a href="../beamdump/">beam dump</a> page.</p>`,
      formulas: [],
    },
    inOpticalSetup: {
      html: `
        <p>The blocker is a rectangle whose faces all absorb. Any ray reaching it stops
        there, exactly as with a <a href="../beamdump/">beam dump</a> — the difference is
        purely in the drawing. It carries <code>hideInExport</code>, so it is visible on the
        canvas while you compose and absent from SVG and PNG exports. In the exported
        figure the blocked beam simply ends, with nothing to explain why.</p>
        <p>Two controls set its width and height, and the blue handles resize it on the
        canvas, so it can be shaped to catch exactly the branch you want and nothing
        else.</p>
        <p>Its bounds are still counted when a figure is fitted for export, so a blocker
        parked far from the setup will pad the exported crop with empty space even though it
        is not drawn. Keep it close to the beam it is catching, or use a
        <a href="../figureframe/">figure frame</a> to define the crop explicitly.</p>`,
      limitations: `<p>Absorption is perfect and total, like the beam dump's. The single
        thing to understand about this element is that it changes what a figure
        <em>shows</em>, not what the setup <em>is</em>: the trace it removes was a real
        branch of the light, and its absence from the exported drawing is your editorial
        decision rather than a physical result. A reader of the figure has no way to tell a
        blocker was used.</p>`,
    },
    related: ['beamdump', 'slit', 'figureframe'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Beam Dumps', url: 'https://www.rp-photonics.com/beam_dumps.html' },
    ],
  },
  {
    type: 'slm',
    title: 'Spatial light modulator',
    category: 'Wavefront Shaping',
    realWorld: {
      html: `
        <p>A spatial light modulator is a programmable optic. Instead of grinding a surface
        into a fixed shape, it imposes a phase pattern that software can change frame by
        frame — so one device can act as a lens, a grating, a corrector for aberrations it
        measures on the fly, or a hologram that paints an arbitrary intensity pattern in a
        distant plane.</p>

        <h3>How liquid crystals do it</h3>
        <p>The working substance is a <strong>nematic liquid crystal</strong>: rod-shaped
        molecules that share a common orientation — the <em>director</em> — while remaining
        free to move past one another like a liquid. That orientational order without
        positional order is what makes the phase useful. Aligned rods are optically
        <strong>birefringent</strong>: light polarized along the director sees the
        extraordinary index <span class="w">n<sub>e</sub></span>, light polarized across it
        sees the ordinary index <span class="w">n<sub>o</sub></span>, and the difference is
        large — around 0.1 to 0.2, roughly ten times that of a quartz
        <a href="../hwp/">waveplate</a>.</p>
        <p>Applying a voltage across a pixel tilts the director toward the field. The index
        seen by light polarized along the original director slides continuously from
        <span class="w">n<sub>e</sub></span> toward <span class="w">n<sub>o</sub></span>, so
        the optical path through that pixel — and therefore the phase of the light leaving
        it — becomes a smooth function of the applied voltage:</p>`,
      formulas: [
        { tex: '\\Gamma(V) = \\frac{2\\pi\\,\\Delta n(V)\\,d}{\\lambda}', caption: 'Phase retardance of one pixel: the voltage-dependent index difference times the liquid-crystal layer thickness. This is the same expression as a waveplate, with Δn now under electrical control.' },
        { tex: '\\Gamma_{\\text{LCOS}} = 2 \\times \\frac{2\\pi\\,\\Delta n(V)\\,d}{\\lambda}', caption: 'A reflective device doubles it: light crosses the layer on the way in and again on the way out, so half the thickness achieves a full 2π stroke.' },
      ],
      html2: `
        <p>Nearly all phase-only modulators are <strong>LCOS</strong> — liquid crystal on
        silicon. A CMOS backplane addresses each pixel and carries a mirror beneath it, with
        the liquid-crystal layer above; light enters, reflects off the pixel mirror, and
        leaves having crossed the modulating layer twice. Pixels are a few micrometres
        across, the phase is quantised to 8 bits, and the device is calibrated so that its
        full drive range corresponds to exactly 2π at one design wavelength.</p>
        <p>Two consequences follow from the physics and are worth knowing before you design
        around one. First, <strong>the input must be linearly polarized along the
        director</strong>: only that component is modulated, so light in the orthogonal
        state passes through unchanged and dilutes the pattern. Every SLM setup therefore
        has a <a href="../polarizer/">polarizer</a> in front of it. Second, liquid crystals
        are <strong>slow</strong> — reorientation takes milliseconds, so refresh rates are
        tens of hertz, not the megahertz an acousto-optic device reaches.</p>

        <h3>The zero-order problem</h3>
        <p>An SLM never modulates all the light that lands on it, and the unmodulated
        fraction leaves along the direction of a plain mirror — the specular, or
        <strong>zeroth-order</strong>, beam. It sits on the optical axis, undiffracted,
        while the pattern you asked for is formed around it. Several causes contribute:</p>
        <ul>
          <li><strong>Fill factor below 100%.</strong> The gaps between pixels, and the
          circuitry at their edges, are not modulated. That light reflects with no phase
          structure at all.</li>
          <li><strong>Front-surface reflection</strong> from the protective cover glass,
          which never reaches the liquid crystal.</li>
          <li><strong>Incomplete 2π stroke.</strong> If the calibration is off, or the
          device is used away from its design wavelength, the phase never wraps cleanly and
          a residual unmodulated component survives.</li>
          <li><strong>Phase quantisation and flicker</strong> from the digital drive
          scheme.</li>
        </ul>
        <p>Together these typically leave a few per cent up to about ten per cent of the
        incident power in the zeroth order — which, concentrated in a single undiffracted
        spot, is frequently the <em>brightest</em> feature in the output plane. In
        holographic optical tweezers it is a trap nobody asked for; in a
        <a href="../objective/">microscope</a> it is a bright spot at the centre of the
        field; at high power it can damage a sample outright.</p>
        <p>The standard remedy is to steer the useful light away from it. Adding a linear
        phase ramp — a blazed grating — to the displayed hologram deflects the whole pattern
        off-axis, leaving the zeroth order behind on the axis where it can be removed with a
        <a href="../beamdump/">beam block</a> at an intermediate focus. Careful
        per-wavelength calibration of the 2π lookup table reduces the residue at the source,
        and slightly tilting the device separates the cover-glass reflection from the
        modulated beam.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The SLM is <strong>reflective</strong> by default, matching an LCOS device, with
        a <strong>Transmissive</strong> toggle for the less common transmissive kind. Its
        active size sets how much of a beam it intercepts, and the blue handle resizes it on
        the canvas.</p>
        <p>What it does to light is set by a stack of <strong>optical function</strong>
        layers, applied in order — up to four:</p>
        <ul>
          <li><strong>Lens array</strong> — divides the aperture into lenslets of a chosen
          count and focal length, so one beam becomes several focused spots. Each lenslet is
          tracked separately, so beams do not blend between them.</li>
          <li><strong>Grating</strong> — a programmable diffraction grating with a chosen
          line density and list of orders, which is how a real SLM steers and splits.</li>
          <li><strong>Beam steer</strong> — a plain angular deflection, the simplest thing a
          phase ramp does.</li>
          <li><strong>Speckle / diffuser</strong> — scatters into a cone, standing in for a
          random phase pattern.</li>
        </ul>

        <h3>The zeroth order, on a toggle</h3>
        <p>Because the undiffracted beam is a real and often dominant feature of any SLM
        setup, it is available here rather than quietly ignored — but it is
        <strong>off by default</strong>, so a teaching diagram is not cluttered by a stray
        beam nobody asked about.</p>
        <p>Turn on <strong>0th-order reflection</strong> and set the fraction (0.1, ten per
        cent, by default — a realistic figure for a good device) and the element splits its
        output: that fraction leaves along the plain specular direction, exactly where a
        mirror would send it, while the patterned light carries the rest. With a grating
        layer on a device at 45°, you can watch the two separate — the diffracted beam
        steered by the pattern, the zeroth order going straight on, and the balance between
        them shifting as you change the fraction.</p>
        <p>The toggle correctly does nothing on an unpatterned SLM. With no layers
        configured the device is simply a mirror, and there is no diffracted order for a
        "zeroth" to be measured against.</p>
        <p>This makes the standard mitigation something you can actually draw: add a grating
        layer to steer the useful light off-axis, then put a <a href="../beamdump/">beam
        dump</a> in the path of the zeroth order and terminate it.</p>`,
      limitations: `<p>No phase map is computed. The layers are geometric ray operations
        chosen to stand in for what a hologram does, not a diffraction calculation over a
        pixel array — so there is no pixel pitch, no fill factor, no 8-bit quantisation, no
        2π stroke, and no wavelength dependence of Δn. The zeroth-order fraction is a number
        you set, not one derived from the fill factor and calibration that actually cause it.
        The polarization requirement is not enforced either: a real device modulates only
        the component along its director, whereas this one acts on any input state, so a
        sketch will not warn you about the missing polarizer. Grating orders share the light
        evenly rather than following a blaze, and the millisecond response and frame rate of
        a real liquid crystal are not represented at all — the pattern here changes
        instantly.</p>`,
    },
    related: ['dmd', 'dm', 'polarizer', 'grating', 'beamdump'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Spatial Light Modulators', url: 'https://www.rp-photonics.com/spatial_light_modulators.html' },
      { label: 'RP Photonics Encyclopedia — Liquid Crystal Modulators', url: 'https://www.rp-photonics.com/liquid_crystal_modulators.html' },
    ],
  },
  {
    type: 'metasurface',
    title: 'Metasurface',
    category: 'Wavefront Shaping',
    realWorld: {
      html: `
        <p>A metasurface is a flat optic that works by pattern rather than by shape.
        Instead of bending light with a curved glass surface, it carries an array of
        <strong>meta-atoms</strong> — pillars, fins, or slots smaller than the wavelength —
        each imposing its own local phase delay on the light passing through. Choose the
        phase at every point across the aperture and you choose what the surface does.</p>
        <p>Because the structures are subwavelength, they do not diffract individually; the
        surface behaves as a continuous phase profile <span class="w">Φ(x)</span>. What
        steers the light is the <em>gradient</em> of that profile, which generalises
        Snell's law: a phase that varies along the surface adds momentum to the transmitted
        beam.</p>`,
      formulas: [
        { tex: 'n_t\\sin\\theta_t - n_i\\sin\\theta_i = \\frac{\\lambda_0}{2\\pi}\\frac{d\\Phi}{dx}', caption: "The generalised Snell's law. With no phase gradient this collapses to ordinary refraction; a constant gradient deflects the beam, and a position-dependent one focuses, splits, or scatters it." },
        { tex: '\\Phi(r) = -\\frac{2\\pi}{\\lambda_0}\\left(\\sqrt{f^2+r^2}-f\\right)', caption: 'The particular profile that focuses. A metasurface carrying this one is a <a href="../metalens/">metalens</a> — the same device, given a lens\\u2019s job.' },
      ],
      html2: `
        <p>What makes the idea powerful is that the profile is arbitrary. The same
        fabrication process yields a lens, a blazed grating, a beam splitter, a vortex
        plate carrying orbital angular momentum, a polarisation-selective element that
        does different things to each state, or a hologram — decided entirely by the
        pattern. And because the whole optic is a film a fraction of a micrometre thick on
        a carrier, it replaces components that would otherwise be centimetres of glass,
        which is why metasurfaces are pursued for phone cameras, endoscopes, AR displays,
        and satellite instruments.</p>
        <p>The costs are real. Efficiency is finite, so some light leaves undiffracted in
        the <strong>zeroth order</strong> along with scatter and reflection. Most designs
        are strongly chromatic, since the phase is set for one wavelength and every other
        colour sees the wrong profile. Many are polarisation-sensitive by construction.
        And the pattern is <strong>fixed at fabrication</strong> — which is the sharp
        distinction from an <a href="../slm/">SLM</a>, whose liquid crystal lets the same
        aperture display a new profile thousands of times a second. A metasurface trades
        that programmability for being thin, passive, fast at the speed of light, and
        needing no drive electronics.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The metasurface is drawn as what it is: a patterned layer on a thin transparent
        carrier. It is <strong>transmissive by default</strong>, since that is how these
        optics are almost always used, with a toggle for the reflective case.</p>
        <p>It shares its phase engine with the <a href="../slm/">SLM</a> — deliberately,
        because a phase profile does the same thing to a ray whether liquid crystal or
        etched silicon put it there. The difference between the two elements is what they
        represent, not what the light does. So the same stack of <strong>optical
        functions</strong> applies, up to four, in order:</p>
        <ul>
          <li><strong>Lens array</strong> — divides the aperture into lenslets, the
          multi-focus profile a metasurface array carries.</li>
          <li><strong>Grating</strong> — a fixed blazed deflector with chosen line density
          and orders. Verified against the grating equation: 600 lines/mm at 532&nbsp;nm
          sends the first order to 18.61°, exactly arcsin(λ/d).</li>
          <li><strong>Beam steer</strong> — the constant phase gradient of the generalised
          Snell's law above, the simplest metasurface there is.</li>
          <li><strong>Speckle / diffuser</strong> — a randomised profile.</li>
        </ul>
        <p>Layers compose in sequence, so a steer of 5° followed by a 600&nbsp;lines/mm
        grating puts the output at 23.98° — the two sines adding, as they should.</p>
        <p>The <strong>undiffracted 0th order</strong> toggle models finite efficiency:
        turn it on and the chosen fraction leaves along the original path while the
        patterned light carries the rest, so a design can be drawn with its leakage and a
        <a href="../beamdump/">beam dump</a> put where the waste goes. It is off by
        default so a teaching figure stays clean.</p>
        <p>For the specific case of a focusing metasurface with a wavelength-dependent
        focal length, use the <a href="../metalens/">metalens</a> instead — it models the
        diffractive <span class="w">f(λ) = f₀λ₀/λ</span> scaling that this element's
        geometric layers do not.</p>`,
      limitations: `<p>No phase map is computed and no field is propagated. The layers are
        geometric ray operations standing in for what a profile does, so there are no
        meta-atoms, no subwavelength geometry, no fill factor, and no diffraction
        calculation — an aperture that would be far too small to work in reality traces
        exactly like a large one. The steering here is also achromatic where a real
        metasurface is strongly chromatic: only the grating layer disperses, through the
        grating equation, while a steer or lens-array layer treats every wavelength alike.
        Polarisation is untouched, though polarisation sensitivity is a defining property
        of many real designs, and the zeroth-order fraction is a number you set rather
        than one derived from the structure. Efficiency, scatter, substrate reflections,
        and fabrication tolerance are all absent.</p>`,
    },
    related: ['slm', 'metalens', 'dmd', 'grating', 'beamdump'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Metasurfaces', url: 'https://www.rp-photonics.com/metasurfaces.html' },
      { label: 'RP Photonics Encyclopedia — Diffractive Optics', url: 'https://www.rp-photonics.com/diffractive_optics.html' },
    ],
  },
  {
    type: 'dmd',
    title: 'Digital micromirror device',
    category: 'Wavefront Shaping',
    realWorld: {
      html: `
        <p>A DMD is an array of hundreds of thousands of aluminium mirrors, each a few
        micrometres across, sitting on a CMOS memory cell. Every mirror has exactly two
        stable positions — tilted one way or the other about its diagonal, typically by
        <strong>±12°</strong> — and is held there electrostatically against mechanical
        landing posts. Writing a bit to the cell underneath flips it.</p>
        <p>That makes the device fundamentally different from a
        <a href="../slm/">liquid-crystal SLM</a>. An SLM is <em>analogue</em> and works on
        <em>phase</em>: it retards light and can therefore redirect it. A DMD is
        <em>binary</em> and works on <em>amplitude</em>: each mirror either sends its light
        toward the target or throws it away. There is no in-between position.</p>
        <p>Because a mirror tilted by θ deflects a beam by 2θ, the two states send light in
        directions separated by four times the tilt angle:</p>`,
      formulas: [
        { tex: '\\delta = 2\\theta', caption: 'A mirror tilted by θ deflects the reflected beam by 2θ — the reason a small mechanical tilt buys a large optical separation.' },
        { tex: '\\Delta = 4\\theta', caption: 'Angle between the ON and OFF beams, since the two mirror states tilt opposite ways. At the standard ±12° that is 48°, which is why a DLP projection lens sits well off the illumination axis.' },
        { tex: 'd\\sin\\theta_m = m\\lambda', caption: 'The mirror array is periodic, so it is also a grating. At roughly 7.6 µm pitch this matters as soon as the illumination is coherent.' },
      ],
      html2: `
        <h3>Grey levels out of a binary device</h3>
        <p>If each mirror is only ever fully on or fully off, brightness has to come from
        somewhere else — and it comes from <strong>time</strong>. The mirror is switched on
        and off thousands of times per frame, and the fraction of the frame it spends in the
        ON state sets the perceived brightness. The eye, or any detector slower than the
        switching, integrates the result. Pulse-width modulation in space's place.</p>
        <p>This is why DMDs are <em>fast</em>. A micromirror flips in microseconds, giving
        binary frame rates in the tens of kilohertz — three or four orders of magnitude
        quicker than liquid crystal, which has to physically reorient. It also explains the
        colour-fringing "rainbow effect" some people see in single-chip DLP projectors,
        where red, green and blue are displayed sequentially rather than together.</p>

        <h3>What it is good and bad at</h3>
        <p>Being a mirror rather than a birefringent layer, a DMD is
        <strong>polarization-insensitive</strong> and <strong>broadband</strong> — aluminium
        reflects from the ultraviolet well into the infrared, so one device works at any
        wavelength. It has a high fill factor, around 92%, and tolerates far more optical
        power than liquid crystal. Those properties took it well beyond projectors: maskless
        photolithography, structured-illumination microscopy, hyperspectral imaging,
        single-pixel and compressive-sensing cameras, and patterned optogenetic
        stimulation.</p>
        <p>The cost is efficiency. Because it works by discarding light rather than
        redirecting it, everything in the OFF state is simply thrown away — at 50% duty you
        lose half the beam, and that light has to be caught by a
        <a href="../beamdump/">beam dump</a>, which at high power needs to be a real cooled
        one. A phase SLM steering the same light into the pattern wastes almost none of it.
        The periodicity is the other complication: with coherent illumination the array
        behaves as a blazed grating and splits the beam into diffraction orders, so a
        laser-illuminated DMD needs its geometry chosen so that the wanted order and the
        blaze direction coincide.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The device is traced as a binary mirror array. Rays are sorted into ON and OFF
        by where they land, and each state reflects into its own direction — the ON beam
        deflected one way from the specular direction, the OFF beam the other:</p>
        <ul>
          <li><strong>Micromirror tilt</strong> sets the deflection. The ON and OFF beams
          emerge separated by exactly four times this angle, so the default 12° puts 48°
          between them, matching a real device.</li>
          <li><strong>Pattern pitch</strong> and <strong>ON fraction</strong> define the
          pattern itself as periodic stripes across the aperture — the fraction of each
          period whose mirrors are ON.</li>
          <li><strong>Show OFF order</strong> decides whether the discarded beam is drawn.</li>
        </ul>
        <p>That last toggle is worth understanding. It is <strong>off by default</strong>,
        so the rejected light simply stops at the device — which is what a setup with a
        properly dumped OFF path looks like, and keeps a teaching figure uncluttered. Turn
        it on and the OFF beam is traced to wherever it actually goes, which is the honest
        picture while you are designing: you can see the 48° separation, confirm nothing
        downstream is sitting in that path, and put a <a href="../beamdump/">beam dump</a>
        there to terminate it.</p>
        <p>Sweeping the tilt is the quickest way to see the geometry that makes DLP work.
        At 6° the two beams leave 24° apart and are awkward to separate; at 20° they are
        80° apart and trivially separable, but the device would be harder to build. The
        real ±12° is the compromise.</p>`,
      limitations: `<p><strong>Diffraction is not modelled</strong>, and for a DMD that is
        the significant omission: a real array is periodic at roughly 7.6&nbsp;µm and acts
        as a blazed grating, so coherent illumination produces a set of diffraction orders
        that a laser-based design has to be built around. Here reflection is purely
        geometric and a single beam produces a single ON beam. The pattern is also
        periodic stripes measured in millimetres of canvas rather than an addressable array
        of micromirrors, so it cannot display an image, and there is no time dimension —
        no pulse-width modulation, no grey levels, no switching time, and no colour
        sequencing. Fill-factor loss, aluminium reflectivity, absorption, and the damage
        threshold are all absent, so the ON and OFF beams together carry the full incident
        power.</p>`,
    },
    related: ['slm', 'dm', 'beamdump', 'grating'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Spatial Light Modulators', url: 'https://www.rp-photonics.com/spatial_light_modulators.html' },
      { label: 'Texas Instruments — DLP Technology', url: 'https://www.ti.com/dlp-chip/overview.html' },
    ],
  },
  {
    type: 'dm',
    title: 'Deformable mirror',
    category: 'Wavefront Shaping',
    realWorld: {
      html: `
        <p>A deformable mirror corrects a wavefront by changing its own shape. Light does
        not always arrive with the flat, well-behaved wavefront that optical design assumes:
        the atmosphere scrambles starlight, the eye's own cornea and lens distort a view of
        the retina, and tissue aberrates a focus long before a microscope reaches the depth
        it was built for. In every case the instrument is fine and the wavefront is not, so
        the fix is to add the <em>conjugate</em> of the distortion and cancel it.</p>
        <p>The device is a thin reflective faceplate — a metallised membrane or a polished
        silicon layer — sitting on an array of actuators that push and pull it. Piezoelectric
        stacks, electrostatic pads, voice coils, and MEMS all appear, but the principle is
        the same: drive each actuator and the surface bends locally.</p>
        <p>Reflection is what makes the mechanics easy. Displacing the surface by
        <span class="w">h</span> shortens or lengthens the path twice, once on the way in
        and once on the way out, so a very small movement buys a large optical
        correction:</p>`,
      formulas: [
        { tex: '\\text{OPD} = 2h', caption: 'Optical path difference from a surface displacement h. A quarter-wavelength of mechanical stroke produces half a wavelength of optical correction — which is why deformable mirrors move by micrometres, not millimetres.' },
        { tex: 'S \\approx \\exp\\!\\left[-\\left(\\frac{2\\pi\\sigma}{\\lambda}\\right)^{2}\\right]', caption: 'Maréchal approximation for Strehl ratio from residual wavefront error σ. Getting σ down to about λ/14 gives S ≈ 0.8 — the usual definition of "diffraction limited", and the target a correction loop aims at.' },
        { tex: '\\delta = 2\\theta', caption: 'Tilting a mirror by θ deflects the beam by 2θ. Worth remembering when reading this element’s controls — see below.' },
      ],
      html2: `
        <h3>Working in a loop</h3>
        <p>A deformable mirror is almost never set by hand. It runs closed-loop with a
        wavefront sensor — usually a Shack–Hartmann, a lenslet array whose spot
        displacements measure local wavefront slope. The measured wavefront is decomposed
        into <strong>Zernike modes</strong> — tip, tilt, defocus, astigmatism, coma,
        spherical aberration, and higher — the actuator commands that best cancel them are
        computed, and the cycle repeats at hundreds or thousands of hertz, fast enough to
        keep up with atmospheric turbulence.</p>
        <p>The low-order modes carry most of the power. Tip and tilt alone account for the
        largest share of atmospheric distortion, so big telescopes often split the job: a
        small, fast tip–tilt mirror handles the bulk motion while the deformable mirror,
        with hundreds or thousands of actuators, takes the higher orders. How well the
        higher orders can be corrected is set by actuator count and spacing — a mirror
        cannot reproduce structure finer than its actuator pitch, and the residue left over
        is called fitting error.</p>
        <p>Designs trade smoothness against independence. A <strong>continuous
        facesheet</strong> gives a smooth surface but neighbouring actuators pull on each
        other, so each has an influence function rather than acting alone. A
        <strong>segmented</strong> mirror gives independent control at the price of gaps
        between segments, which diffract. <strong>MEMS</strong> devices are compact and
        cheap with limited stroke; <strong>bimorph</strong> and <strong>voice-coil</strong>
        mirrors offer large stroke with fewer actuators.</p>
        <p>The applications are wherever a wavefront arrives spoiled: ground-based astronomy,
        adaptive-optics retinal imaging, deep-tissue and two-photon microscopy, laser beam
        shaping, and free-space optical communication.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>This element models the two lowest-order corrections a deformable mirror makes —
        the ones that dominate real aberration budgets — as a mirror with an adjustable
        curvature and an adjustable deflection. Three controls:</p>
        <ul>
          <li><strong>Aperture</strong>, the size of the reflective face; the blue handle
          resizes it.</li>
          <li><strong>Defocus focal length</strong>, which curves the surface. Positive
          values make it concave: light reflects converging, and the focus lands that many
          millimetres in front of the mirror — set 100&nbsp;mm and the beam crosses the axis
          100&nbsp;mm away, set 200&nbsp;mm and it crosses at 200. Negative values make it
          convex, so the return beam diverges from a virtual focus behind the surface.
          Leave it at zero for a flat mirror.</li>
          <li><strong>Tip / tilt</strong>, on the purple knob, which steers the reflected
          beam.</li>
        </ul>
        <p>Pair one with a <a href="../detector/">wavefront detector</a> and the correction
        becomes measurable rather than merely drawn: a flat mirror returns a collimated
        beam, a positive focal length returns a converging one, and a negative focal length
        a diverging one, with the detector naming the state and reporting the cone
        angle.</p>

        <h3>One convention to know</h3>
        <p>The <strong>Tip / tilt</strong> control applies its angle directly to the
        outgoing beam: set 5° and the reflected beam leaves 5° away from where it would have
        gone. That is the <em>beam deviation</em>, not the mechanical tilt of the surface —
        a real mirror tilted by 5° would deflect the beam by 10°. Rotating the whole element
        on the canvas does behave physically, giving the usual factor of two, so the two
        routes to a tilt are not equivalent. If you are reasoning about actuator stroke,
        halve the number.</p>`,
      limitations: `<p>Only <strong>tip, tilt, and defocus</strong> are modelled — the
        lowest Zernike orders. There is no astigmatism, coma, spherical aberration, or
        arbitrary surface shape, which is awkward given that correcting exactly those higher
        orders is the reason deformable mirrors exist; this element captures what they do
        first, not what makes them special. Nothing represents the mechanism either: no
        actuators, no actuator count or pitch, no influence functions or inter-actuator
        coupling, no stroke limit, and therefore no fitting error. The surface is perfectly
        smooth, so segment gaps and print-through never diffract, and there is no temporal
        response — the shape changes instantly rather than over the milliseconds a real
        mirror needs. Nothing closes the loop: there is no sensor driving the correction, so
        the shape is one you set by hand rather than one the system finds.</p>`,
    },
    related: ['slm', 'dmd', 'cmirror', 'detector'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Adaptive Optics', url: 'https://www.rp-photonics.com/adaptive_optics.html' },
      { label: 'RP Photonics Encyclopedia — Deformable Mirrors', url: 'https://www.rp-photonics.com/deformable_mirrors.html' },
    ],
  },
  {
    type: 'aotf',
    title: 'Acousto-optic tunable filter',
    category: 'Modulators',
    realWorld: {
      html: `
        <p>An AOTF selects colours electronically. Sound travelling through a crystal
        compresses and rarefies it, and since the refractive index follows density, an
        acoustic wave is a moving index grating that light can diffract from. That much it
        shares with an <a href="../aom/">acousto-optic modulator</a>. The difference — and
        the whole point of the device — is that an AOTF arranges the interaction so only
        <em>one wavelength at a time</em> can diffract from a given tone.</p>
        <p>It does this in a <strong>birefringent</strong> crystal, usually tellurium
        dioxide, in a geometry where the diffracted light emerges in the orthogonal
        polarization state. Because the two states have different refractive indices, the
        momentum-matching condition between the optical and acoustic waves is satisfied at
        only one optical wavelength per acoustic frequency. An AOM diffracts whatever you
        send it; an AOTF picks a line out of it.</p>
        <p>Change the RF drive frequency and you change the line. That is the tuning
        mechanism, and it is purely electronic — no filter wheel to rotate, no grating to
        turn. The RF <em>power</em> sets the diffraction efficiency, so the same device
        controls how much of that line gets through.</p>`,
      formulas: [
        { tex: '\\tau \\approx \\frac{D}{v_{a}}', caption: 'Switching time is the acoustic transit across the beam. In TeO₂ the shear wave travels around 650 m/s, so a 1 mm beam switches in roughly 1.5 µs — against the tens of milliseconds a filter wheel needs.' },
        { tex: 'P_{\\text{line}} \\approx P_{\\text{in}}\\,\\frac{\\Delta\\lambda}{\\Delta\\lambda_{\\text{source}}}\\,\\eta', caption: 'What a narrow selection actually costs: picking 2 nm out of a 280 nm supercontinuum keeps well under 1% of the power, however efficient the diffraction is.' },
      ],
      html2: `
        <h3>Multiplexed and sequential drive</h3>
        <p>The property that makes AOTFs indispensable is that the crystal does not have to
        be driven with one tone. Apply <strong>several RF frequencies simultaneously</strong>
        and each selects its own wavelength, with its own amplitude setting that line's
        intensity independently. That is <strong>multiplexing</strong>: every selected line
        is present in the output at the same time. One small crystal thereby replaces a rack
        of shutters, filters, and attenuators — which is why the laser combiner in a confocal
        or multiphoton microscope is almost always an AOTF.</p>
        <p>Driving one tone at a time instead, stepping from line to line, is
        <strong>sequential</strong> operation. Only one wavelength is present at any instant.
        Because switching takes microseconds, the sequence can be faster than a pixel dwell,
        so a scan can step excitation wavelengths line by line or even pixel by pixel and
        build a separate image per colour — which is exactly what multiplexed drive cannot
        do, since there every colour arrives at once and the detector cannot tell them
        apart.</p>
        <p>Typical passbands are one to a few nanometres — narrow enough to isolate one
        laser line from its neighbour. The light that is not selected is not absorbed; it
        simply fails to diffract and continues on, which means a real installation always
        has somewhere for it to go, usually a <a href="../beamdump/">beam dump</a>.</p>
        <p>Beyond microscopy, AOTFs appear in hyperspectral and multispectral imaging, Raman
        instruments, fluorescence spectroscopy, and space-borne instruments where a filter
        wheel's mass and mechanism are unwelcome.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The element is built around a list of <strong>selected lines</strong>, one per RF
        tone, in the same spirit as the <a href="../slm/">SLM's</a> stacked functions. A
        fresh AOTF has a single line; press <em>Add line</em> to stack more, up to sixteen.
        Each line carries its own wavelength and efficiency, so a weak line and a strong one
        can be selected together, while the passband is a property of the device and is
        shared by all of them — as it is in a real crystal, where the resolution follows
        from the interaction length rather than from which tone is applied.</p>
        <p>That passband is a sinc², the phase-matching response of the acousto-optic
        interaction itself. The width set in the inspector is its full width at half
        maximum; either side of the central lobe it passes through true zeros, with
        sidelobes at 4.7% and 1.7% of the peak between them. Those sidelobes are the
        device's real rejection floor: a line sitting in the first one still gets a few
        percent through, which no rectangular passband would ever show.</p>

        <h3>Where the light goes</h3>
        <p>The selected lines leave along the <strong>incoming axis</strong>, so the
        selection stays on the optical axis and the rest of a setup can be built downstream
        of it in a straight line. Everything not selected — the beam
        <strong>depleted</strong> of those lines — is deflected to an angle you choose.</p>
        <p>That depleted beam is <strong>hidden by default</strong>, because in a working
        instrument it goes straight into a dump and drawing it only clutters the figure.
        Turn on <em>Show depleted beam</em> while designing and it is traced to wherever it
        actually goes, so you can confirm nothing downstream is sitting in its path and put
        a <a href="../beamdump/">beam dump</a> there. Hiding it changes only the drawing:
        the power accounting is the same either way.</p>

        <h3>Driving the lines</h3>
        <p><strong>Multiplexed</strong> drive opens every selected line at once, so all of
        them are in the output together and a spectrometer downstream shows the whole set.
        <strong>Sequential</strong> drive steps through them one at a time at a rate you set,
        so exactly one line is present at any instant and the spectrometer shows it change
        as the sequence advances.</p>
        <p>The sequence runs on the canvas clock, slowed to a step or two a second — a real
        driver steps at kilohertz, far too fast to read — in the same illustrative spirit as
        a scanning galvo or a chopper wheel. Each line is fully open while it is its turn;
        the sequence chooses <em>which</em> line, not how much of it gets through.</p>

        <h3>What the numbers do</h3>
        <p>Selection is exact and conserves energy. A 20&nbsp;nm window on a 420–700&nbsp;nm
        supercontinuum passes 20/280 of the power and the depleted port carries the rest,
        summing to one. Efficiency multiplies on top, so three multiplexed lines at 0.9
        selected from three matching laser lines deliver 2.7× a single line's worth. Narrow
        selections work too: a 0.5&nbsp;nm line out of that supercontinuum is 0.18% of the
        beam and still traces correctly rather than being discarded as negligible.</p>`,
      limitations: `<p><strong>The geometry is the reverse of a physical device.</strong> In
        a real AOTF the selected light is the <em>diffracted</em> first order and leaves at
        an angle, while the remainder passes straight through as the zeroth order. This
        element draws the opposite assignment — the selection continues along the incoming
        axis and the remainder is deflected — because it keeps a multi-line selection on the
        optical axis where the rest of a setup is built. The power accounting is identical
        either way; only which port is bent differs.</p>
        <p>The passband is set directly rather than following from an acoustic frequency:
        in a real device one RF tone fixes the selected wavelength, the diffraction angle,
        and the polarization rotation together through phase matching, so a combination set
        here need not correspond to any crystal. Its <em>shape</em> is modelled — the
        sinc² below — but its sidelobes are truncated at the third zero rather than
        continuing to fall away forever, so the deepest rejection a real device gives out
        in the far wings is not reproduced. The
        polarization rotation itself is not modelled, so the selected light leaves in the
        state it arrived and cannot be cleaned up with a <a href="../polarizer/">polarizer</a>
        the way a real one is. There is no relation between RF power and efficiency, no
        acoustic transit time — lines switch instantly — and no crystal transmission range,
        so a line can be selected at any wavelength the source provides.</p>`,
    },
    related: ['aom', 'aod', 'eom', 'filter', 'beamdump'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Acousto-optic Tunable Filters', url: 'https://www.rp-photonics.com/acousto_optic_tunable_filters.html' },
      { label: 'RP Photonics Encyclopedia — Acousto-optic Modulators', url: 'https://www.rp-photonics.com/acousto_optic_modulators.html' },
    ],
  },
  {
    type: 'detector',
    title: 'Photodetector',
    category: 'Detectors',
    realWorld: {
      html: `
        <p>A photodetector is a semiconductor <strong>photodiode</strong>: a p-n (or p-i-n)
        junction that absorbs a photon and, if the photon carries enough energy to cross the
        material's bandgap, promotes an electron into the conduction band. The junction's
        built-in field sweeps that electron and the hole it left behind apart before they can
        recombine, and the result is a photocurrent proportional to the incident optical
        power. How efficiently that conversion happens is the <strong>quantum efficiency</strong>
        <span class="w">η</span> — the fraction of incident photons that produce a
        collected charge carrier — and how much current comes out per watt of light in is
        the <strong>responsivity</strong> <span class="w">R</span>:</p>`,
      formulas: [
        { tex: 'R = \\frac{\\eta e}{h\\nu} = \\frac{\\eta e \\lambda}{hc} \\quad [\\text{A/W}]', caption: 'Responsivity at optical frequency ν (equivalently, wavelength λ). For a fixed η, R rises with wavelength — a 1550 nm photon carries less energy than a 500 nm one, so the same absorbed photon flux yields more amps per watt at the longer wavelength.' },
      ],
      html2: `
        <h3>Sensor material sets the usable colours</h3>
        <p>η is not a constant — it is a function of wavelength set by the semiconductor's
        <strong>bandgap</strong>, and it is the reason a detector has to be chosen for the
        wavelength it needs to see rather than assumed to work everywhere. A photon below the
        bandgap energy simply cannot promote an electron, however bright the beam: η drops to
        zero at a sharp cutoff wavelength, not a gentle roll-off.</p>
        <p><strong>Silicon</strong> is the default choice for anything visible or near-infrared.
        Its 1.12 eV bandgap gives it a cutoff around 1100&nbsp;nm, and a typical
        commercial Si photodiode's responsivity climbs from a few tenths of an A/W in the
        visible to a peak near 0.5–0.6&nbsp;A/W around 900–1000&nbsp;nm, right before that
        cutoff${cite(1)}. It covers essentially every laser wavelength in this app's own
        palette below 1064&nbsp;nm.</p>
        <p><strong>InGaAs</strong> (indium gallium arsenide) is the standard choice once a
        setup reaches into the <strong>short-wave infrared</strong> — the telecom bands
        around 1310 and 1550&nbsp;nm, or Er-doped fiber sources. Its smaller ~0.75 eV
        bandgap pushes the cutoff out to roughly 1.7&nbsp;µm, with peak responsivity around
        0.9–1.0&nbsp;A/W near 1550&nbsp;nm${cite(1)} — silicon is completely blind out
        there; those photons simply don't carry enough energy to cross its wider gap.</p>
        <p><strong>Germanium</strong> was the original short-wave infrared material, and is
        still around: a smaller ~0.67 eV bandgap stretches its cutoff out to roughly
        1.8&nbsp;µm, past even InGaAs, with peak responsivity around 0.7–0.8&nbsp;A/W near
        1.5–1.6&nbsp;µm${cite(1)}. What displaced it from most telecom and low-light work is
        dark current — the reverse-bias leakage current a photodiode carries with no light at
        all, which competes directly with a weak real signal. Germanium's is roughly
        two to three orders of magnitude higher than InGaAs at the same reverse bias and room
        temperature${cite(1)}, so germanium detectors usually need cooling to be
        useful for anything faint, while InGaAs does not. It remains a cheaper option where
        that noise floor doesn't matter. Beyond these three, extended-range InGaAs and HgCdTe
        push further into the mid-infrared at the cost of even more dark current and, for
        HgCdTe, mandatory cooling — but silicon, InGaAs, and germanium between them cover the
        overwhelming majority of laboratory optics.</p>
        <h3>Frequency response</h3>
        <p>A photodiode also cannot follow an arbitrarily fast amplitude modulation. Its
        junction behaves as a capacitor <span class="w">C_j</span> discharging through a load
        resistance <span class="w">R_L</span>, and that RC time constant — together with how
        long a photo-generated carrier takes to drift across the depletion region — sets a
        3 dB electrical bandwidth beyond which the output can no longer track the optical
        signal:</p>`,
      formulas2: [
        { tex: 'f_{3\\text{dB}} \\approx \\frac{1}{2\\pi R_L C_j}', caption: 'A larger sensor area collects more light but adds junction capacitance Cⱼ, so higher sensitivity and higher speed pull in opposite directions — which is why detector datasheets fork into two families that rarely overlap.' },
      ],
      html3: `
        <p>A large-area photodiode built for power metering — like the
        <a href="../powermeter/">power meter</a> in this palette — trades bandwidth for active
        area and sensitivity, and is typically limited to the kHz range or slower. A
        telecom-grade InGaAs photodiode with a 250&nbsp;µm active area, by contrast, is built
        for the opposite trade and can exceed 10&nbsp;GHz${cite(2)} — fast enough to demodulate
        a digital data stream, but far too small and insensitive to usefully catch a divergent
        free-space beam. Choosing a photodetector for a real setup means picking a point on
        that speed-versus-area curve, not just a material.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The photodetector reports a <em>qualitative</em> relative signal — the sum of every
        ray's power reaching its front face, in arbitrary units — plus the wavelength or
        detected spectral band, polarization state, and spot extent of whatever light
        arrives, all read directly off the traced rays. If the arriving light is pulsed, it
        also reports the accumulated <a href="../pulsecompressor/">GDD</a>, optical path
        delay, and arrival spread, the same as every other instrument in the Detectors
        category. This is genuinely useful for seeing <em>whether</em> light reaches a given
        point, roughly how strong it is relative to other configurations, and what its
        spectral or polarization content is — regardless of what real sensor a lab bench
        would need there.</p>`,
      formulas: [],
      limitations: `<p>The reported signal is not calibrated to any real unit, and there is no
        concept of sensor material at all: a photodetector in this app reads every wavelength
        in its traced light with equal weight, whether that light is 405&nbsp;nm (well inside
        silicon's range) or 1550&nbsp;nm (which silicon cannot detect at all and would need
        InGaAs). There is no responsivity curve, no bandgap cutoff, and no way to configure or
        even see which material is assumed. There is also no frequency response of any kind —
        no bandwidth, no rise time, no 3 dB cutoff — so a beam modulated far beyond what any
        real photodiode could follow reads at full strength exactly like a steady beam. Dark
        current, noise-equivalent power, and saturation are likewise not modeled here; the
        PMT variant is the only detector in this category with any qualitative gain/saturation
        behavior at all. Treat every reading as relative and instantaneous, never as a
        prediction of what a specific real sensor would output.</p>`,
    },
    related: ['pmt', 'camera', 'powermeter', 'eye'],
    citations: [
      { label: 'Thorlabs — Photodiode Tutorial (responsivity vs. wavelength for Si, Ge, and InGaAs detectors)', url: 'https://www.thorlabs.com/newgrouppage9.cfm?objectgroup_id=285' },
      { label: 'RP Photonics Encyclopedia — Photodiodes', url: 'https://www.rp-photonics.com/photodiodes.html' },
    ],
    resources: [
      { label: 'RP Photonics Encyclopedia — Photodetectors', url: 'https://www.rp-photonics.com/photodetectors.html' },
      { label: 'RP Photonics Encyclopedia — Responsivity', url: 'https://www.rp-photonics.com/responsivity.html' },
    ],
  },

  {
    type: 'pmt',
    title: 'Photomultiplier (PMT)',
    category: 'Detectors',
    realWorld: {
      html: `
        <p>A <a href="../detector/">photodiode</a> turns one absorbed photon into one
        electron. That is a vanishingly small amount of charge, and once the signal is
        weak enough, the amplifier reading it contributes more electrical noise than the
        light contributes current — the measurement stops being about the light at all. A
        <strong>photomultiplier tube</strong> solves this by amplifying the photoelectron
        <em>before</em> any electronics touch it.</p>
        <p>Light lands on a <strong>photocathode</strong>, a thin film in an evacuated glass
        envelope, and ejects a photoelectron. A strong electric field accelerates it onto a
        <strong>dynode</strong> — an electrode held at a few hundred volts more positive —
        hard enough that the impact knocks loose several <em>secondary</em> electrons. Those
        are accelerated onto the next dynode, and so on down a chain of typically 8 to 12
        stages before the whole shower is collected at the anode. If each stage yields
        <span class="w">δ</span> secondary electrons per incident one, the total gain over
        <span class="w">n</span> stages compounds:</p>`,
      formulas: [
        { tex: 'G = \\delta^{\\,n}, \\qquad \\delta \\propto V_{\\text{stage}}^{\\,k}', caption: 'A modest per-stage yield compounds into an enormous total: δ ≈ 4 over 10 dynodes is a gain near 10⁶. Because δ depends on the accelerating voltage, gain is set by the supply voltage — and is steeply sensitive to it, which is why PMT gain is always plotted on a log axis against voltage.' },
      ],
      html2: `
        <p>A single photoelectron therefore arrives at the anode as a pulse of ~10⁶
        electrons — far above the noise of any reasonable amplifier. This is what makes a PMT
        able to register <strong>individual photons</strong>, and it is the entire reason the
        instrument exists.</p>

        <h3>Gain is not sensitivity</h3>
        <p>The most common misconception about PMTs is that turning up the gain makes the
        instrument more sensitive. It does not. Gain multiplies everything arriving at the
        first dynode — the signal and the tube's own noise alike — so the ratio between them
        is fixed before any amplification happens.</p>
        <p>That noise has a specific source. The photocathode is warm, so electrons
        occasionally escape it by thermal energy alone, with no photon involved. Each one is
        amplified into a full-size output pulse indistinguishable from a real detection. This
        is <strong>dark current</strong>, and its rate is what a datasheet quotes as
        <strong>dark counts</strong> per second. Cooling the tube reduces it — which is why
        photon-counting instruments often run their PMTs cooled — but no amount of gain will,
        because gain amplifies the dark electrons by exactly the same factor.</p>
        <p>So the useful figure of merit is the ratio of signal to dark, and the only ways to
        improve it are to collect more light or to lower the dark rate. Where the gain
        genuinely matters is in getting the signal clear of the <em>downstream</em>
        electronics' noise floor — which it does spectacularly well.</p>

        <h3>What it costs</h3>
        <p>A PMT is not simply a better photodiode. Its photocathode <strong>quantum
        efficiency</strong> — the fraction of arriving photons that eject a photoelectron at
        all — is typically only 20–40% at its peak, and falls off sharply outside the band the
        cathode material was chosen for${cite(1)}. A silicon photodiode reaches 80–90%
        over a much broader range. The PMT wins not by converting more photons, but by
        amplifying the few it does convert before anything can bury them.</p>
        <p>Photocathode material sets the accessible band much as semiconductor bandgap does
        for a photodiode: bialkali cathodes peak in the blue and are effectively blind past
        ~650&nbsp;nm, while extended-red and multialkali types reach into the near
        infrared${cite(1)}. Beyond roughly 900&nbsp;nm there is no practical photocathode at
        all, which is why near-infrared work returns to semiconductor detectors.</p>
        <p>Two practical constraints matter on a real bench. Output is linear only up to a
        maximum anode current; beyond it, space charge in the last dynode stages compresses
        the response and a brighter input stops reading brighter. And a PMT exposed to room
        light while powered can be <strong>permanently damaged</strong> — which is why they
        live in light-tight housings, are interlocked to the room lights in some labs, and are
        always powered down before anything is opened.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The PMT reads the same relative ray weight every detector in this palette does,
        then applies an <strong>electron gain</strong> to it. Gain is set as a power of ten,
        from ×1 to ×10⁷, matching how a real tube's gain-versus-voltage curve is specified.
        This is the element to reach for when a signal is genuinely faint: specimen
        fluorescence collected through an objective typically arrives carrying somewhere
        around 10⁻⁴ to 10⁻³ of relative weight, which a plain photodetector reports as a
        number too small to compare against anything. A gain of 10⁵ lifts exactly that
        signal into a readable range.</p>

        <h3>The dark floor, and why gain cannot beat it</h3>
        <p>The <strong>equivalent dark input</strong> is the tube's own dark current
        expressed as the light level that would produce the same output — referred to the
        photocathode, so it sits alongside the signal and is amplified by the same gain. The
        panel reports both the amplified dark floor and the <strong>signal / dark</strong>
        ratio, and that ratio is deliberately <em>independent of gain</em>: sweep the gain
        across every decade it offers and the ratio does not move at all. Lower the dark
        floor, or collect more light, and it does. That is the single most useful thing this
        model has to say.</p>
        <p>The state line answers the questions in the order they matter. <strong>Saturated</strong>
        comes first, because once the output clips at the configured maximum the number is no
        longer trustworthy at all — a brighter input reads the same as a dimmer one.
        Otherwise it reports whether the signal clears the dark floor:
        <strong>below dark floor</strong> when the tube's own noise is larger than the signal,
        <strong>marginal</strong> when it is less than three times larger, and
        <strong>linear range</strong> when it is comfortably measurable.</p>`,
      formulas: [
        { tex: '\\text{output} = \\min(\\text{max}, \\; \\Sigma w \\cdot G), \\qquad \\frac{S}{D} = \\frac{\\Sigma w}{d}', caption: 'Amplified output clips at the configured maximum. The signal-to-dark ratio divides the summed ray weight by the equivalent dark input — G cancels, which is exactly the point.' },
      ],
      limitations: `<p>Gain here is a plain multiplier on relative ray weight, not a dynode
        cascade: there is no supply voltage, no stage count, no δ, and no gain drift with
        voltage or temperature. The dark floor is a fixed threshold you set, not a rate — the
        tracer is deterministic, so nothing fluctuates, there are no dark <em>counts</em> to
        integrate, and no shot noise on the signal itself. That means the reported ratio is a
        clean comparison of two configured levels, not a predicted measurement SNR, and it
        will never reproduce the √N behaviour that governs how long a real experiment must
        integrate.</p>
        <p>Nothing about the photocathode is modelled: no quantum efficiency, no spectral
        response, and no blindness past the red cutoff — so a PMT here reads 900&nbsp;nm light
        exactly as readily as 400&nbsp;nm, which no real bialkali tube would. Saturation is a
        hard clip rather than the gradual space-charge compression of a real tube, there is no
        afterpulsing, no dead time, no dynode fatigue, and no damage from overexposure.
        Compare readings between configurations, never as an absolute count rate.</p>`,
    },
    related: ['detector', 'camera', 'powermeter', 'sample', 'objective'],
    citations: [
      { label: 'Hamamatsu — Photomultiplier Tubes: Basics and Applications (photocathode quantum efficiency and spectral response)', url: 'https://www.hamamatsu.com/content/dam/hamamatsu-photonics/sites/documents/99_SALES_LIBRARY/etd/PMT_handbook_v4E.pdf' },
    ],
    resources: [
      { label: 'RP Photonics Encyclopedia — Photomultipliers', url: 'https://www.rp-photonics.com/photomultipliers.html' },
      { label: 'RP Photonics Encyclopedia — Photon Counting', url: 'https://www.rp-photonics.com/photon_counting.html' },
    ],
  },

  {
    type: 'powermeter',
    title: 'Power meter',
    category: 'Detectors',
    realWorld: {
      html: `
        <p>A <a href="../detector/">photodetector</a> reports a photocurrent; a power meter
        reports <strong>watts</strong>. The difference is calibration: a power meter's sensor
        has a known, measured relationship between what it outputs and the optical power that
        produced it, so the console can show an absolute number instead of an arbitrary one. Every
        commercial power meter is really two parts — a sensor head and a console that knows how
        to read it — and the sensor is where the real design tradeoff lives.</p>
        <p>A <strong>photodiode sensor</strong> is the same physical device as a plain
        photodetector, just factory-calibrated: its responsivity <span class="w">R(λ)</span>
        is measured at each wavelength, so the console can recover power from photocurrent.
        That calibration is the whole catch — <span class="w">R(λ)</span> is not flat, exactly as
        on the <a href="../detector/">photodetector page</a>, so the meter has to be told which
        wavelength it's reading. Set the wrong one and the number is wrong by the ratio of the
        two responsivities, silently.</p>`,
      formulas: [
        { tex: 'P = \\frac{I_{\\text{pd}}}{R(\\lambda)}', caption: 'A photodiode sensor recovers power by dividing the measured photocurrent by the responsivity at the configured wavelength. The reading is only as correct as that wavelength setting.' },
      ],
      html2: `
        <p>A <strong>thermal sensor</strong> — a thermopile, or a pyroelectric detector for
        single pulses — sidesteps that problem entirely. Incident light is absorbed by a black
        coating and converted to heat, and the sensor reads the resulting temperature rise (or,
        for a pyroelectric, the heat pulse from one shot). Absorption into heat is, to good
        approximation, the same process at every wavelength, so a thermal sensor's calibration
        holds across a broad spectral range with no wavelength setting to get wrong${cite(1)}.
        The tradeoff is speed: a thermopile takes seconds to reach thermal equilibrium, against
        microseconds for a photodiode, and needs more power to produce a measurable temperature
        rise at all — which is why thermal sensors dominate at higher powers and photodiode
        sensors dominate at low ones.</p>
        <p>Either sensor has a hard <strong>damage threshold</strong>. A photodiode sensor can
        saturate or be burned out by too much continuous power — or, just as easily, by the
        instantaneous peak power of a pulsed beam whose <em>average</em> power looks perfectly
        safe. A thermal sensor's coating can be scorched by a tightly focused beam even within
        its rated average-power range. Every real power meter publishes a maximum power (and
        often a maximum power <em>density</em>) that the reading itself gives no warning of
        approaching.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The power meter measures the same relative ray weight every detector in this
        palette does. On its own — selected in the canvas, read from its inspector panel — that
        relative number is all it shows, identical to a plain photodetector. The Watts reading
        appears once it drives a <a href="../display/">detector screen</a> ("Connect to a
        detector screen" in its inspector does this in one click).</p>
        <p>That figure is built per source. Every source launches rays whose weights sum to
        one, and each interaction along the way scales that weight by what it actually
        transmits — a beamsplitter's ratio, a filter's transmission, an aperture that clips
        part of the beam, a chopper's duty cycle, a nonlinear crystal's conversion efficiency.
        The weight that survives to the sensor face is therefore the whole source-to-detector
        efficiency chain in one number, and multiplying it by that source's
        <strong>Average power (W)</strong> gives the watts it delivered here. Several sources
        landing on the same meter simply add:</p>`,
      formulas: [
        { tex: 'P_{\\text{det}} = \\sum_{s\\,\\to\\,\\text{det}} \\eta_{s}\\, P_{s}, \\qquad \\eta_{s} = \\!\\!\\sum_{\\text{rays from } s} \\!\\! w_{\\text{ray}}', caption: 'Only sources whose light actually arrives contribute. η is the surviving fraction of that source\'s own emitted power, so a 100 mW laser behind two filters passing 50% and 25% reads 12.5 mW, and a second laser on the same meter adds its own term.' },
      ],
      html2: `
        <p>Attribution follows the light through wavelength changes too. When a specimen
        fluoresces, the emission is new light at a new colour, but its power is still a
        fraction of the laser that pumped it — so it is charged to that laser, not to the
        specimen. In the <a href="../pmt/">PMT</a>'s fluorescence example the meter would read
        the pump power times the roughly 2&times;10⁻³ that survives excitation focusing,
        conversion efficiency, collection solid angle, and the emission filter.</p>
        <p>If some of the light arriving carries no power rating at all — the point source has
        no Average power field — the screen reports the rated contribution and marks the
        reading <em>+ unrated source</em>, because that number is then a floor rather than the
        total. When nothing arriving is rated, it falls back to showing relative weight.</p>`,
      limitations: `<p>The conversion is wavelength-flat: one watt of 400&nbsp;nm and one watt
        of 1550&nbsp;nm read identically, so the element behaves like an idealized broadband
        thermal sensor no matter which real sensor type you have in mind, and there is no way
        to select one or to get the wavelength-setting error that a real photodiode meter
        punishes you for. Power is average power only — a pulsed and a CW source of the same
        average read the same, with no peak-power figure and no notion of a pulsed beam
        damaging a sensor a CW beam of equal average power would not.</p>
        <p>There is no damage threshold, no saturation, no noise floor, and no response time,
        so nothing distinguishes a thermopile's seconds-long settling from a photodiode's
        microseconds. The watts are exact arithmetic on the traced efficiencies rather than a
        measurement: they inherit every idealization upstream of them — hard-edged filter
        passbands, flat per-surface transmission instead of Fresnel losses, no scatter and no
        absorption that the tracer was not told about — so treat the number as what this
        idealized bench delivers, not as what a real one would.</p>`,
    },
    related: ['detector', 'pmt', 'display', 'cwlaser'],
    citations: [
      { label: 'RP Photonics Encyclopedia — Thermal Detectors', url: 'https://www.rp-photonics.com/thermal_detectors.html' },
    ],
    resources: [
      { label: 'RP Photonics Encyclopedia — Optical Power Meters', url: 'https://www.rp-photonics.com/optical_power_meters.html' },
      { label: 'RP Photonics Encyclopedia — Photodiodes', url: 'https://www.rp-photonics.com/photodiodes.html' },
    ],
  },

  {
    type: 'wavefrontdetector',
    title: 'Wavefront detector',
    category: 'Detectors',
    realWorld: {
      html: `
        <p>Every other detector on this bench answers <em>how much</em> light arrived, and
        maybe what colour it was. A wavefront sensor answers a different question entirely:
        <strong>what shape</strong> is the light. A beam's wavefront is the surface joining
        points of equal phase, and it is always perpendicular to the local direction of
        travel. A perfectly collimated beam has flat wavefronts; a beam converging to a focus
        has spherical ones centred on that focus. Real optics never produce either exactly —
        aberrations, thermal lensing, atmospheric turbulence and mounting stress all leave the
        wavefront misshapen, and that misshape is what limits how tightly a beam can be
        focused.</p>
        <p>You cannot photograph a wavefront. Detectors respond to intensity, and phase
        information is lost the instant light is absorbed. So every wavefront sensor works
        indirectly, by converting phase structure into something an intensity detector
        <em>can</em> see. The <strong>Shack–Hartmann sensor</strong> does it by measuring
        direction.</p>

        <h3>From Hartmann's mask to Shack's lenslets</h3>
        <p>The lineage starts with a mask. In 1904 Johannes Hartmann tested telescope optics
        by covering the aperture with a screen of holes and photographing where each pencil of
        light landed${cite(1)} — displaced spots meant the rays were not going where a perfect
        optic would send them. The method worked but wasted almost all the light and gave
        fuzzy shadow spots that were hard to locate precisely.</p>
        <p>In the late 1960s Roland Shack and Ben Platt made the change that turned it into an
        instrument: they replaced each hole with a small <strong>lenslet</strong>${cite(1)}.
        A hole casts a shadow; a lenslet <em>focuses</em>. The array now uses essentially all
        the incident light, and each sub-aperture produces a tight, bright spot whose centroid
        can be located to a small fraction of a pixel. That single substitution is what makes
        the modern sensor both efficient and precise.</p>

        <h3>What the spots actually measure</h3>
        <p>Each lenslet samples one small patch of the incoming wavefront. Over a patch that
        small the wavefront is essentially a tilted plane, and a tilted plane wave focuses to a
        spot displaced from the lenslet's axis in proportion to that tilt. With lenslet focal
        length <span class="w">f</span>, a local wavefront slope <span class="w">θ</span>
        moves the spot by</p>`,
      formulas: [
        { tex: '\\Delta x = f\\,\\theta = f\\,\\frac{\\partial W}{\\partial x}', caption: 'Spot displacement measures the local gradient of the wavefront W, not the wavefront itself. Every lenslet returns one slope sample; the surface has to be reconstructed from the whole map of them.' },
      ],
      html2: `
        <p>So a Shack–Hartmann sensor is fundamentally a <strong>gradient</strong> sensor. It
        returns an array of local slopes, and the wavefront is recovered afterwards by
        integrating them — either zonally, stitching patch to patch, or modally, by
        least-squares fitting an orthogonal set such as the <strong>Zernike
        polynomials</strong>, whose low-order terms are the familiar named aberrations: tilt,
        defocus, astigmatism, coma, spherical. Reporting a beam as "0.2 waves RMS with 0.15
        waves of coma" means exactly this fit was performed on the slope map.</p>

        <h3>The tradeoff every design lives with</h3>
        <p>Two numbers fight each other. <strong>Sensitivity</strong> improves with lenslet
        focal length, since a longer <span class="w">f</span> converts the same small slope
        into a larger, more measurable displacement. <strong>Dynamic range</strong> works the
        other way: a spot must stay inside its own sub-aperture cell to remain attributable to
        its lenslet, so the largest measurable slope is roughly the lenslet pitch
        <span class="w">p</span> over twice the focal length${cite(2)}.</p>`,
      formulas2: [
        { tex: '\\theta_{\\max} \\approx \\frac{p}{2f}, \\qquad \\delta\\theta_{\\min} \\approx \\frac{\\delta x_{\\text{centroid}}}{f}', caption: 'Longer lenslets measure smaller slopes but tolerate a narrower range of them. Finer spatial sampling means smaller p, which shortens f as well — so resolution, sensitivity and dynamic range cannot all be maximised at once.' },
      ],
      html3: `
        <p>Spatial resolution is a third constraint: the wavefront is only sampled once per
        lenslet, so structure finer than the pitch is simply averaged away. Conventional
        refractive arrays sit around a hundred lenslets per square millimetre, which is why
        classical Shack–Hartmann sensors suit smooth, slowly varying wavefronts and not sharply
        structured ones. Recent work replaces the refractive lenslets with
        <a href="../metasurface/">metasurfaces</a>, which set phase by subwavelength structure
        rather than by curvature and so decouple the packing density from the focal length: a
        2024 demonstration reached a sampling density of 5963&nbsp;lenslets/mm² with an 8°
        acceptance angle, and used it for single-shot phase imaging of biological
        tissue${cite(3)}.</p>
        <p>One limit is structural rather than technical. Because the instrument measures a
        gradient, a genuine <strong>discontinuity</strong> in the wavefront is invisible to
        it${cite(1)} — a step or a branch point has no finite slope to sample, so no amount of
        sensitivity or sampling density recovers it.</p>

        <h3>Where they are used</h3>
        <p>In <strong>adaptive optics</strong>, a wavefront sensor and a
        <a href="../dm/">deformable mirror</a> form a closed loop: the sensor measures the
        distortion, the mirror applies its negative, and an astronomical telescope recovers
        near-diffraction-limited imaging through atmospheric turbulence. The same loop
        sharpens deep imaging in multiphoton microscopy, where the specimen itself is the
        aberrating medium. In <strong>ophthalmology</strong>, aberrometry of the eye's own
        wavefront is what makes wavefront-guided LASIK and PRK possible${cite(1)}. And in the
        laboratory, wavefront sensors characterise laser beam quality and
        <span class="w">M²</span>, verify collimation, test optical surfaces in transmission or
        double-pass reflection, and align systems in real time${cite(4)}.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>OpticalSetup traces rays, and a ray is by definition perpendicular to the
        wavefront — so ray direction <em>is</em> local wavefront slope, already available
        without any lenslets. The wavefront detector uses that directly: at its sensor face it
        takes every arriving ray's height <span class="w">h</span> across the face and its
        angle <span class="w">θ</span> to the face normal, and least-squares fits a straight
        line through the resulting <span class="w">θ(h)</span>.</p>
        <p>That fit is the measurement. Its <em>intercept</em> is the mean tilt of the whole
        bundle and is discarded, which is why steering the beam in at an angle does not change
        the reading — a tilted flat wavefront is still flat. Its <em>gradient</em>
        <span class="w">dθ/dh</span> is the wavefront curvature, and its sign says which way:
        negative for a converging beam, positive for a diverging one, and a magnitude below
        0.05° across the beam reports as collimated.</p>`,
      formulas: [
        { tex: '\\frac{d\\theta}{dh} = \\frac{1}{R}, \\qquad \\Theta_{\\text{full}} = \\left|\\frac{d\\theta}{dh}\\right| \\cdot D', caption: 'The fitted gradient is the reciprocal of the wavefront radius of curvature R, and multiplying it by the illuminated diameter D gives the full convergence or divergence cone angle — the number the panel reports.' },
      ],
      html2: `
        <p>Both quantities come out exact rather than approximate. A 20&nbsp;mm beam through
        an <span class="w">f</span>&nbsp;=&nbsp;100&nbsp;mm lens gives a measured full angle of
        11.43°, against 11.42° from the geometry; and the fitted
        <span class="w">1/R</span> tracks the signed distance to focus to the tenth of a
        millimetre — −20.0&nbsp;mm when the sensor face sits 80&nbsp;mm past that lens, +5.0&nbsp;mm
        when it sits 5&nbsp;mm beyond the focus. The reported cone angle is constant on both
        sides of the focus, as it should be: the beam narrows and re-expands, but the cone it
        belongs to does not change.</p>`,
      limitations: `<p>A straight line through <span class="w">θ(h)</span> has exactly one
        shape term in it, and that term is <strong>defocus</strong>. Tilt is fitted and thrown
        away; everything above defocus — astigmatism, coma, spherical aberration, and every
        higher Zernike — has nowhere to go. Send a deliberately aberrated beam in (a fast
        singlet with visible spherical aberration, say) and the fan of ray angles is still
        collapsed to one average slope and reported as a single clean convergence angle. The
        aberration is precisely the departure from that straight line, and it is exactly what
        the fit discards. This instrument tells you whether a beam is converging, diverging or
        collimated, and how hard; it does not tell you whether it is any good.</p>
        <p>Some of that is structural rather than unimplemented. The tracer is a 2D meridional
        section with one transverse axis, so astigmatism — different curvature in
        <span class="w">x</span> and <span class="w">y</span> — is not representable in the
        first place, and neither is any azimuthal aberration. There is also no sensor:
        no lenslet array, no spots, no centroiding, no pixel noise, and therefore none of the
        sensitivity-versus-dynamic-range tradeoff that dominates real instrument design. Every
        arriving ray is used at full precision, so there is no maximum measurable slope and no
        minimum detectable one.</p>
        <p>The reading is geometric throughout: an angle in degrees, never an optical path
        difference in waves, and with no wavelength dependence at all. There is no RMS or
        peak-to-valley wavefront error, no Zernike decomposition, and no Strehl ratio. Finally,
        the fit needs at least two rays at different heights — a single ray, or a source in
        line mode, has no gradient to measure and reports collimated by default rather than
        declining to answer.</p>`,
    },
    related: ['dm', 'detector', 'camera', 'lens', 'metasurface'],
    citations: [
      { label: 'Shack–Hartmann wavefront sensor — Wikipedia (Hartmann’s 1904 mask, Shack and Platt’s lenslet substitution, insensitivity to wavefront discontinuities, ophthalmic and astronomical use)', url: 'https://en.wikipedia.org/wiki/Shack%E2%80%93Hartmann_wavefront_sensor' },
      { label: 'RP Photonics Encyclopedia — Shack–Hartmann Wavefront Sensors (lenslet geometry, sensitivity and dynamic-range limits)', url: 'https://www.rp-photonics.com/shack_hartmann_wavefront_sensors.html' },
      { label: 'Go et al., “Meta Shack–Hartmann wavefront sensor with large sampling density and large angular field of view,” Light: Science & Applications 13, 187 (2024)', url: 'https://doi.org/10.1038/s41377-024-01528-9' },
      { label: 'Axiom Optics — Wavefront sensing applications (optical testing, beam diagnostics and M², adaptive optics, real-time alignment)', url: 'https://www.axiomoptics.com/application/wavefront-sensing-aaplications/' },
    ],
    resources: [
      { label: 'RP Photonics Encyclopedia — Adaptive Optics', url: 'https://www.rp-photonics.com/adaptive_optics.html' },
      { label: 'RP Photonics Encyclopedia — Wavefronts', url: 'https://www.rp-photonics.com/wavefronts.html' },
    ],
  },

  {
    type: 'camera',
    title: 'Camera',
    category: 'Detectors',
    realWorld: {
      html: `
        <p>A consumer camera is built to produce a pleasing picture. A scientific camera is
        built to produce a <em>number</em>: one that is proportional to how many photons
        arrived at a given place, by a known factor, with a known uncertainty. Everything
        that distinguishes the sensors below follows from that one change of purpose.</p>
        <p>The chain is short and every link loses something. Photons land on silicon and a
        fraction of them free an electron — that fraction is the <em>quantum efficiency</em>.
        The freed electrons accumulate in a potential well under each pixel for the duration
        of the exposure. At the end the accumulated charge is converted to a voltage,
        amplified, and digitised into an integer count. Read that integer back through the
        chain and you have an estimate of the photon flux, plus everything the chain added
        on the way.</p>`,
      formulas: [
        { tex: 'S_{\\text{ADU}} = \\frac{\\eta\\, N_{\\gamma} + D t}{g} + \\text{offset}', caption: 'What a pixel actually reports: incident photons N_γ scaled by quantum efficiency η, plus dark current D accumulated over exposure t, divided by the gain g in electrons per count.' },
        { tex: '\\sigma_{\\text{total}} = \\sqrt{\\underbrace{\\eta N_{\\gamma}}_{\\text{shot}} + \\underbrace{D t}_{\\text{dark}} + \\underbrace{\\sigma_{\\text{read}}^{2}}_{\\text{read}}}', caption: 'The three noise sources add in quadrature, in electrons. Shot noise is the photons themselves and cannot be engineered away; the other two are what a camera is designed to minimise.' },
      ],
      html2: `
        <p>Because shot noise grows as the square root of the signal, it dominates in bright
        light and read noise dominates in dim light. That single fact explains why scientific
        cameras are specified the way they are, and why the three architectures below
        divide the work between them.</p>
        <h3>CCD</h3>
        <p>A charge-coupled device shifts the charge packet from pixel to pixel across the
        chip to a single readout node, where one amplifier converts every pixel in
        turn${cite(1)}. One amplifier for the whole sensor is what makes a CCD so uniform —
        there is no pixel-to-pixel variation in gain or offset to calibrate, because every
        pixel is measured by the same electronics. Back-thinned devices, illuminated from
        the rear so light does not cross the wiring layers, reach a quantum efficiency
        around 95% near 550&nbsp;nm${cite(1)}. The cost is speed: serialising millions of
        pixels through one amplifier is slow, and reading faster raises the read noise.</p>
        <h3>EMCCD</h3>
        <p>The electron-multiplying CCD, introduced around 2001, attacks read noise by
        amplifying the signal <em>before</em> it reaches the amplifier. Charge is clocked
        through a long multiplication register — 536 elements in the e2v CCD97 — where a
        high voltage gives each transfer a small probability of impact ionisation, so the
        packet grows geometrically${cite(1)}. With 30 electrons of read noise and a gain of
        100, the noise referred back to the input is 0.3 electrons.</p>
        <p>The catch is that multiplication is itself stochastic. Each electron either does
        or does not multiply at each stage, and that randomness adds a noise contribution of
        its own — an excess noise factor of √2, conventionally handled by treating the camera
        as though its quantum efficiency were <em>halved</em>${cite(1)}${cite(3)}. A 95% QE
        back-illuminated EMCCD is therefore quoted with an effective QE near 0.48 when it is
        run at high gain${cite(3)}. It buys the ability to count almost nothing at the price
        of counting everything else less well.</p>
        <h3>sCMOS</h3>
        <p>Scientific CMOS reverses the CCD's arrangement: each pixel carries its own
        amplifier, and each column its own analogue-to-digital converter, so millions of
        pixels are converted in parallel rather than in series${cite(1)}. The technology
        arrived in 2009 from a consortium of Fairchild Imaging, Andor and PCO, combining
        properties that had not previously coexisted — read noise near one electron,
        quantum efficiency of 60–70% or more, high frame rate, high resolution and wide
        dynamic range at once${cite(2)}.</p>
        <p>A current sensor reads about 5 megapixels at 100 frames per second with an
        effective read noise around one electron and a peak QE of 82%, linear across almost
        four orders of magnitude${cite(1)}. Read noise is not even uniform: on a measured
        sCMOS sensor the median is around 0.9&nbsp;electrons, and more than half the pixels
        contribute either one noise electron or none in a given frame${cite(2)}. The price of
        per-pixel amplifiers is that every pixel has its own gain, offset and dark current,
        so a scientific camera ships with a per-pixel calibration applied in firmware —
        which is a large part of what separates a scientific sensor from the same silicon
        sold as an industrial one${cite(3)}.</p>
        <h3>Which one wins</h3>
        <p>Less obvious than the datasheets suggest. A controlled comparison that put an
        sCMOS, an EMCCD and an industry-grade CMOS camera on the two arms of one 50/50
        beamsplitter — so all three saw the same photons frame by frame — found the sCMOS
        delivering 1.5× to 2.4× the signal-to-noise of the industrial CMOS, but the
        industrial CMOS <em>slightly outperforming</em> the EMCCD, by 1.2× to 1.4×, at the
        photon levels of fluorescence fluctuation imaging${cite(3)}. The EMCCD's higher
        quantum efficiency could not compensate for the excess noise of its multiplication
        stage. EMCCDs remain the right answer where the photon count really is very low —
        spinning-disk confocal is the standard example${cite(1)}${cite(3)} — while sCMOS
        wins wherever field of view and speed matter, which is most of super-resolution and
        light-sheet imaging${cite(1)}.</p>
        <p>The same comparison found one thing that no datasheet reports: the industrial
        camera introduced spurious correlations between neighbouring pixels, which the
        calibrated scientific sensors did not${cite(3)}. For any method that reads
        <em>correlations</em> rather than intensities, that is disqualifying regardless of
        how good the SNR looks.</p>
        <h3>Full well capacity and bit depth</h3>
        <p>Two numbers set the range of a scientific camera, and they are routinely
        confused with each other.</p>
        <p>The <strong>full well capacity</strong> is a property of the silicon: the maximum
        number of charge carriers a pixel can hold before it overflows${cite(2)}. Fill it and
        the pixel saturates — further photons are simply not recorded, and on a CCD the
        excess charge can spill into neighbours as blooming. It scales with pixel area,
        which is one of the real reasons EMCCDs use large 16&nbsp;µm pixels where sCMOS uses
        6.5&nbsp;µm${cite(1)}${cite(3)}. Typical sCMOS sensors hold around 30&nbsp;000
        electrons${cite(2)}.</p>
        <p>Divide that ceiling by the smallest signal the camera can distinguish — its read
        noise — and you have the <strong>dynamic range</strong>, the ratio of the brightest
        to the faintest thing measurable in one exposure${cite(2)}.</p>`,
      formulas2: [
        { tex: '\\mathrm{DR} = \\frac{N_{\\text{well}}}{\\sigma_{\\text{read}}} \\qquad\\Longrightarrow\\qquad N_{\\text{bits}} \\ge \\log_{2}\\mathrm{DR}', caption: 'Intra-scene dynamic range, and the number of bits an ADC needs before it stops being the limiting element. Published sCMOS figures run from about 1:5000 to 1:33 000.' },
      ],
      html3: `
        <p><strong>Bit depth</strong> is a property of the electronics, not the silicon: how
        many discrete levels the converter divides the signal into. It does not create
        dynamic range, it only decides whether the sensor's own range survives digitisation.
        The link between the two is the <em>gain</em>, in electrons per count.</p>
        <p>Take a sensor holding 30&nbsp;000 electrons with 1.1 electrons of read noise —
        a dynamic range near 27&nbsp;000:1${cite(2)}. Since log₂(27&nbsp;000) ≈ 14.7, a
        16-bit converter carries it comfortably, at about 0.46 electrons per count. A 12-bit
        converter has only 4096 levels, so each count is worth about 7.3 electrons: the
        quantisation step alone is now several times the read noise, and the low-light
        performance the sensor was built for has been discarded in the last stage of the
        chain. More bits than the dynamic range justifies is equally pointless — it digitises
        noise into finer and finer slices without adding information.</p>
        <p>The engineering difficulty is that a fast converter with many bits is itself
        noisy. The solution now standard in sCMOS is to stop trying: each column carries
        <em>two</em> amplifier–converter pairs, one high-gain and low-noise for small
        signals, one low-gain and high-capacity for large ones, sampling every pixel
        simultaneously and reconstructing one image from both. Two 11-bit converters used
        this way contribute less noise than a single faster 16-bit converter would, while
        the combined output still spans a 16-bit range${cite(2)}.</p>
        <p>One consequence catches people out, and it is a display problem rather than a
        camera one: 16-bit data has to be squeezed into the 8-bit range of an ordinary
        monitor before anyone can look at it, so choosing which part of the range to show is
        a decision the user has to make and can easily make badly${cite(2)}.</p>
        <p>A related trap appears whenever two cameras are compared by swapping them onto
        the same port. If their pixel sizes differ, they are not seeing the same thing: a
        signal that filled one 12&nbsp;µm pixel is divided among four 6&nbsp;µm pixels, so
        the smaller-pixel camera reports a quarter of the signal per pixel and looks less
        sensitive than it is${cite(2)}. A fair comparison matches the projected pixel size
        through the optics, which is exactly what the SOFI study did — it set each camera's
        tube lens so all three landed within 97–102&nbsp;nm at the sample${cite(3)}.</p>
        <p>Finally, most scientific cameras are monochrome by design, and deliberately so. A
        colour sensor puts a mosaic of filters over the pixels — the Bayer pattern gives half
        the pixels to green and a quarter each to red and blue — so each pixel measures only
        about a third of the spectrum and the missing values are interpolated, a step that
        introduces artefacts of its own and is usually accompanied by a deliberate blur
        filter to suppress them${cite(4)}. For quantitative work, the wavelength is selected
        by a filter in front of an unfiltered sensor instead: every pixel then measures the
        same band, with no interpolation and no sampling artefacts. It is worth noting that
        this is also why silicon's response varies so strongly across the spectrum — short
        wavelengths are absorbed within a fraction of a micrometre of the surface while red
        and near-infrared light penetrates several micrometres before being absorbed, if it
        is absorbed at all${cite(4)}.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The Camera measures a <strong>one-dimensional intensity profile</strong> across
        its sensor face. Its two geometric settings are the sensor height and the number of
        pixels that height is divided into; each ray that lands is deposited into the pixels
        its ray tube actually covers, rather than being counted at a single point, so a beam
        that falls between two pixel centres still contributes to both.</p>
        <p>That is what makes the profile a measurement rather than a histogram of ray
        arrivals: the number under it is conserved, and a beam clipped by an aperture
        upstream reports exactly the fraction that survived. The reading is reported as
        Σw, a fraction of one source's emitted power, and a linked Detector screen draws the
        profile.</p>`,
      formulas: [],
      html2: `
        <p>When the interference option is on, the camera resolves fringes formed by a sized
        monochromatic CW laser whose routes recombine with a modelled carrier phase — the
        two ports of an interferometer come out complementary, and a phase object in one arm
        writes a real pattern across the pixels. Where a route's phase cannot be
        reconstructed, the camera falls back to depositing intensity conservatively rather
        than inventing a fringe, and says so in its reading.</p>
        <p>Profile height can track the reading absolutely, so a port carrying a tenth of
        the light draws a tenth as tall, or auto-fit to its own peak when only the shape
        matters.</p>`,
      limitations: `<p>This is a geometric intensity model, not a sensor model. Nothing above
        about noise, sensitivity or dynamic range is simulated: there is no quantum
        efficiency, so every ray is detected with equal weight at every wavelength; no read
        noise, dark current, or shot noise, so repeating an exposure gives an identical
        answer; and no full well capacity, so a pixel never saturates, never blooms, and
        responds linearly without limit. There is no bit depth either — readings are
        continuous numbers, never quantised into counts — which means none of the
        full-well-versus-gain reasoning above can be demonstrated here.</p>
        <p>The sensor is one-dimensional, matching the tracer's 2D meridional plane, so
        there is no second transverse axis and no image in the ordinary sense: a
        “camera image” here is a line profile, not a picture. It is monochrome with no
        colour filter array, has no exposure time, no frame rate, and no shutter — global or
        rolling — so the rolling-shutter distortions and synchronisation problems that
        dominate real fast imaging cannot appear. Pixels are perfectly uniform, with no
        per-pixel gain or offset variation, no hot or blinking pixels, and no inter-pixel
        crosstalk, which is precisely the set of imperfections that separates camera
        technologies from one another in practice.</p>`,
    },
    related: ['detector', 'pmt', 'display', 'phaseplate', 'bs'],
    citations: [
      { label: 'N. Stuurman and R. D. Vale, “Impact of new camera technologies on discoveries in cell biology,” The Biological Bulletin 231(1), 5–13 (2016)', url: 'https://doi.org/10.1086/689587' },
      { label: 'G. Holst, “Scientific CMOS camera technology: a breeding ground for new microscopy techniques,” Microscopy and Analysis 28(1), S4–S12 (2014)', url: 'https://analyticalscience.wiley.com/content/article-do/scientific-cmos-camera-technology-breeding-ground-new-microscopy-techniques' },
      { label: 'R. Van den Eynde, A. Sandmeyer, W. Vandenberg, S. Duwé, W. Hübner, T. Huser, P. Dedecker and M. Müller, “Quantitative comparison of camera technologies for cost-effective super-resolution optical fluctuation imaging (SOFI),” Journal of Physics: Photonics 1, 044001 (2019)', url: 'https://doi.org/10.1088/2515-7647/ab36ae' },
      { label: 'R. F. Lyon and P. M. Hubel, “Eyeing the camera: into the next century,” Proc. IS&amp;T/SID 10th Color Imaging Conference, 349–355 (2002)', url: 'https://doi.org/10.2352/CIC.2002.10.1.art00064' },
    ],
    resources: [
      { label: 'Andor / Oxford Instruments — Dual Amplifier Dynamic Range (how the split-gain sCMOS readout works)', url: 'https://andor.oxinst.com/learning/view/article/dual-amplifier-dynamic-range' },
      { label: 'Hamamatsu — Photon counting and camera noise fundamentals', url: 'https://camera.hamamatsu.com/jp/en/learns_more/technical_guides.html' },
    ],
  },
  {
    type: 'phaseplate',
    title: 'Phase object',
    category: 'Specimens',
    realWorld: {
      html: `
        <p>Most of what a microscope is pointed at does not absorb light. A living cell in
        culture medium, a gas flow, a flame, a fibre being drawn, a layer of transparent
        polymer — all of them are close to perfectly clear. Shine light through and almost
        exactly as much comes out the other side, so a detector that measures intensity
        sees nothing at all. Such an object is called a <em>phase object</em>: it is
        invisible not because it fails to affect the light, but because everything it does
        happens in a quantity ordinary detection throws away.</p>
        <p>What it does affect is the arrival time. Light slows in a medium of refractive
        index <span class="w">n</span>, so a thickness <span class="w">t</span> of material
        with an index different from its surroundings advances or retards the wave that
        crosses it relative to the wave beside it. The accumulated optical path difference
        is</p>`,
      formulas: [
        { tex: '\\mathrm{OPD} = (n_{\\text{object}} - n_{\\text{medium}})\\, t', caption: 'Optical path difference written by a transparent object of thickness t.' },
        { tex: '\\Delta\\varphi = \\frac{2\\pi}{\\lambda}\\,\\mathrm{OPD}', caption: 'The phase shift that path difference corresponds to, at vacuum wavelength λ.' },
      ],
      html2: `
        <p>The numbers involved are small and stubbornly invisible. A typical cell is
        perhaps 5&nbsp;µm thick with an index around 1.37 in medium of index 1.33, giving
        an OPD near 0.2&nbsp;µm — well under half a wavelength of green light. No amount of
        contrast stretching recovers it from an intensity image, because the intensity
        image genuinely does not contain it.</p>
        <p>Every technique for seeing such an object works the same way underneath:
        interfere the light that passed through it with a reference that did not, so the
        phase difference becomes a difference in brightness. Two beams of intensity
        <span class="w">I₁</span> and <span class="w">I₂</span> meeting with a phase
        difference <span class="w">Δφ</span> give</p>`,
      formulas2: [
        { tex: 'I = I_1 + I_2 + 2\\sqrt{I_1 I_2}\\,\\cos\\Delta\\varphi', caption: 'Two-beam interference: the cross term is what carries the phase into intensity.' },
      ],
      html3: `
        <p>Frits Zernike built the first practical instrument on exactly this idea. His
        phase-contrast microscope splits the light a specimen scatters from the light that
        passes it undisturbed, retards one against the other by a quarter wave in a ring
        etched into a glass plate at the back focal plane, and lets them recombine — turning
        a phase object into a bright-and-dark image without staining or killing it. It won
        the 1953 Nobel Prize in Physics and remains the reason live-cell microscopy is
        possible at all${cite(1)}.</p>
        <p>The same principle scales far beyond a microscope. Differential interference
        contrast interferes each point of the specimen with a slightly sheared copy of
        itself, so the image reports the phase <em>gradient</em>. Quantitative phase imaging
        recovers the OPD map as a calibrated number per pixel, which for a cell of known
        index is essentially a dry-mass measurement. And a Mach–Zehnder interferometer with
        a wind tunnel in one arm turns the density field of a shock wave into countable
        fringes${cite(2)} — the technique that made compressible flow visible long before
        computational fluid dynamics.</p>
        <p>The practical rule in every one of these is the same. A phase object shifted by a
        whole wavelength is indistinguishable from no object at all, because the wave
        recombines exactly as it started. Contrast is maximised near half a wave, where the
        recombination is fully destructive, and that is the condition instruments are
        designed around.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The Phase object writes optical path across the beam without bending it. It has
        no index and no thickness to configure; it is specified directly by the quantity
        that matters, the peak path difference it adds, and by how that path is distributed
        across its clear aperture. Four profiles are available:</p>
        <ul>
          <li><strong>Central bar</strong> — the middle third of the aperture retarded, the
          rest untouched. A phase-contrast test object, and the default.</li>
          <li><strong>Wedge</strong> — path rising linearly from one edge to the other, the
          classic tilted-plate fringe generator.</li>
          <li><strong>Step</strong> — half the aperture retarded, half clear.</li>
          <li><strong>Curved</strong> — quadratic, thickest at the centre and falling to
          zero at both edges, like a lenslet or a droplet.</li>
        </ul>
        <p>Each ray crossing the plate picks up the path its own crossing point calls for,
        so the phase written across the beam is a real spatial pattern rather than a single
        number. Recombine that arm against a reference and the pattern becomes intensity —
        which is the whole reason the element exists. The default is a central bar of
        0.27&nbsp;µm, half a wave at 532&nbsp;nm: the phase-contrast condition.</p>`,
      formulas: [
        { tex: 'N_{\\text{fringes}} = \\frac{\\mathrm{OPD}_{\\text{peak}}}{\\lambda}\\times\\frac{d_{\\text{beam}}}{d_{\\text{aperture}}}', caption: 'What the inspector reports as “Fringes across the beam”: only the illuminated part of the profile is written onto the light.' },
      ],
      html2: `
        <p>Two behaviours surprise people, and both are real optics rather than
        simplifications.</p>
        <p><strong>The profile spans the clear aperture, not the beam.</strong> A narrow
        beam through a wide wedge samples only a short section of the ramp and picks up an
        almost uniform delay — a piston, not a tilt, and pistons produce no fringes. Match
        the aperture to the beam and the full profile is written. The inspector's “Fringes
        across the beam” readout uses the span the trace actually lit, so it reports what
        the light picks up rather than what the plate could write.</p>
        <p><strong>Some settings move a port total and some cannot, and the difference is
        not about strength.</strong> Averaging the two-beam formula across the beam leaves
        the port at half the light plus a term that swings with the reference arm, and the
        size of that swing is the length of the mean phasor of the written phase —
        <span class="w">|⟨e<sup>iΔφ(u)</sup>⟩|</span> over the illuminated aperture. When
        the phases written across the beam cancel as a phasor, the total is pinned at half
        the light however the reference is set, and the fringes merely slide sideways
        underneath an unchanging number.</p>
        <p>That happens at particular settings rather than for particular profiles. A wedge
        spanning exactly one whole fringe cancels, and so does one spanning two, or twenty;
        but the same wedge at <em>half</em> a fringe swings harder than anything else here,
        between 0.19 and 0.81 of the input. A half-aperture step cancels when its step is
        exactly half a wave, and swings once it is not. The central bar is asymmetric — a
        third of the beam against two thirds — so it swings by a third, between 0.67 and
        0.33, which is why it makes the most legible default. When the current setting
        genuinely cannot move the total, the readout says <em>total stays put, read the
        profile</em> rather than leaving the element looking inert.</p>
        <p>The added path is genuine, not a bookkeeping phase: a pulse crossing the plate
        arrives later by OPD/c, which a photodetector or autocorrelator downstream will
        report. And on its own the element is exactly as invisible as its physical
        counterpart — put a detector straight after it at any setting and the reading is
        unchanged. It takes a reference arm to reveal it.</p>`,
      limitations: `<p>This is a pure phase screen. It has no absorption and, more
        significantly, no refraction: a real transparent object with an index step both
        delays light <em>and</em> bends it, and a strong phase gradient deflects a ray by an
        angle this element does not apply. The rays leave exactly parallel to how they
        arrived, carrying only the added path.</p>
        <p>The profile is one-dimensional across the aperture, matching the tracer's 2D
        meridional plane — there is no second transverse axis, so a true 2D phase map such
        as a real cell presents cannot be authored. The four shapes are fixed; arbitrary
        OPD maps, measured phase data, and the Zernike quarter-wave <em>ring</em> at a back
        focal plane are not available, so the phase-contrast <em>microscope</em> cannot be
        reproduced as an instrument even though the physics it exploits is here.</p>
        <p>The path difference is specified in micrometres and held fixed across
        wavelength, which correctly makes the resulting phase scale as 1/λ but means the
        element carries no material dispersion of its own: a real object's index varies with
        wavelength and its OPD varies with it. Nothing scatters, and there is no partially
        coherent imaging theory — the fringes come from the tracer's coherent recombination,
        so the contrast a real instrument loses to finite condenser aperture and source
        extent is not modelled.</p>`,
    },
    related: ['sample', 'stage', 'camera', 'bs', 'delayline'],
    citations: [
      { label: 'F. Zernike, “How I discovered phase contrast,” Science 121(3141), 345–349 (1955) — the Nobel lecture account of the method', url: 'https://doi.org/10.1126/science.121.3141.345' },
      { label: 'W. Merzkirch, “Flow Visualization,” 2nd ed., Academic Press (1987) — interferometric density measurement in compressible flow', url: 'https://www.sciencedirect.com/book/9780124913516/flow-visualization' },
    ],
    resources: [
      { label: 'Nikon MicroscopyU — Introduction to Phase Contrast Microscopy', url: 'https://www.microscopyu.com/techniques/phase-contrast/introduction-to-phase-contrast-microscopy' },
      { label: 'RP Photonics Encyclopedia — Optical Path Length', url: 'https://www.rp-photonics.com/optical_path_length.html' },
    ],
  },
  {
    type: 'spectrometer',
    title: 'Spectrometer',
    category: 'Detectors',
    realWorld: {
      html: `
        <p>A spectrometer answers one question: how is this light's power distributed
        across wavelength? That is enough to characterise a laser or an LED, to check the
        channels of a wavelength-division-multiplexed link and their signal-to-noise
        ratios, to measure a component's transmission by comparing spectra taken with and
        without it, and to read the wavelength-dependent gain and noise figure of a fibre
        amplifier${cite(1)}.</p>
        <p>What is worth knowing is that instruments answering that one question are built
        on several quite different principles, and the principle decides what the
        instrument is good at${cite(1)}.</p>
        <h3>Spectrograph</h3>
        <p>A grating disperses the light and a detector array — a photodiode array, or a
        linear CCD — catches all the wavelengths at once. Nothing moves, so acquisition is
        fast, and the resolution is set by the detector rather than by the optics. The
        costs are that spatially resolving detectors exist only for limited spectral
        regions, poorly into the infrared, and that stray light inside the instrument caps
        the dynamic range${cite(1)}. This is the compact instrument most people mean by
        "a spectrometer", and the pattern behind the small, inexpensive designs that put a
        grating and a scanning reflector in a package a few centimetres
        across${cite(3)}.</p>
        <h3>Scanning monochromator</h3>
        <p>Rather than catching every wavelength at once, send the light through a tunable
        bandpass filter and measure the transmitted power with a single detector, sweeping
        the filter across the range of interest${cite(1)}. The filter is a grating
        monochromator — Czerny–Turner, typically — turned by a precise motor, and the
        resolution is set by its slit width and grating.</p>
        <p>This is how high-performance instruments are built, and the reason is dynamic
        range. One monochromator manages perhaps 30&nbsp;dB, because strong light at one
        wavelength scatters inside it and lifts the reading everywhere else. Two in series,
        held on the same wavelength, reach beyond 70&nbsp;dB${cite(1)}. The price is time:
        a sweep takes longer for finer resolution, and longer again for more sensitivity.</p>
        <h3>Fourier transform</h3>
        <p>A Michelson interferometer measures something else entirely — the output power
        against arm-length difference — and Fourier transforms it${cite(1)}. Monochromatic
        light gives a sinusoid whose period is the wavelength, which is how a wavemeter
        works. Here the resolution is set by how far the arm was scanned, not by any slit:
        the wavenumber resolution is simply the inverse of the path-difference range, so a
        15&nbsp;mm scan gives about 10&nbsp;GHz, roughly 0.03&nbsp;nm at 1&nbsp;µm${cite(1)}.</p>
        <p>Its weakness is instructive. A strong line does not produce a perfectly clean
        sinusoid, and the noise on it transforms into a background spread across the whole
        spectrum — so sensitivity to a weak line gets <em>worse</em> when a strong one is
        present, and no amount of extra scan range fixes it. Dynamic range lands around
        30–40&nbsp;dB${cite(1)}.</p>
        <h3>Acousto-optic</h3>
        <p>A diffraction grating is not the only way to disperse light. A Bragg cell driven
        by a surface acoustic wave diffracts each optical frequency to its own angle, and
        integrated-optic spectrum analysers were built on exactly that — a guided wave
        interacting with a surface acoustic wave on a single chip${cite(5)}. The same
        interaction, run as a filter rather than as a disperser, is the
        <a href="../aotf/">AOTF</a>.</p>`,
      formulas: [
        { tex: '\\text{PSD}(\\lambda) = \\frac{P_{\\text{measured}}}{\\text{RBW}}', caption: 'Power spectral density is the measured power divided by the resolution bandwidth the instrument was set to. It is the honest vertical axis, and the one that lets a narrow line and a broad band be compared.' },
      ],
      html2: `
        <p>That division is subtler than it looks, and it is the single most common way of
        misreading a spectrum. An analyser's vertical axis often shows measured power, not
        power spectral density${cite(1)}. Converting between them means dividing by the
        resolution bandwidth — but the calibration is usually done for quasi-monochromatic
        light, and when the bandwidth is quoted as a full width at half maximum, how well
        power-divided-by-bandwidth matches the true density depends on the shape of the
        instrument's filter${cite(1)}. Log scales in dBm are common precisely because the
        interesting range spans orders of magnitude.</p>
        <p>One warning from the same source is worth repeating: a spectrum analyser is not
        the instrument to measure optical power with. Coupling efficiencies in the delivery
        path are rarely known well enough. Use a <a href="../powermeter/">power
        meter</a>${cite(1)}.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The Spectrometer reports the centre wavelength, the detected range, the
        bandwidth, and a plotted spectrum of everything reaching its face. Wire it to a
        <a href="../display/">Detector screen</a> to see the spectrum drawn.</p>
        <p>Its vertical axis offers exactly the choice above. <strong>Spectral density</strong>
        is the honest one — power per nanometre, so a band's height does not depend on how
        finely it happened to be sampled. It carries the consequence that makes real
        instruments awkward too: a laser line has no width of its own, so it is spread over
        a nominal 0.1&nbsp;nm to give it a height at all, and it then towers over any
        continuum beside it. That is what a real spectrometer shows, and it is useless when
        the point is to see a weak Raman line next to its own pump — so
        <strong>relative</strong> mode scales each source to its own peak instead.</p>
        <p>Two behaviours are worth knowing because they were built deliberately.
        <strong>Bands that do not touch stay apart.</strong> One source can arrive carrying
        several disjoint bands — an <a href="../aotf/">AOTF</a> selecting three lines out of
        a supercontinuum is the standard case — and each is measured and drawn on its own,
        rather than being summarised across the gaps between them into a single smear.
        Overlapping passbands are one band, correctly, and the grid inside it is fine enough
        to keep whatever structure it has: several narrow lines cutting a pulsed laser's
        envelope come back as separate peaks whose heights still trace that envelope.</p>
        <p>And <strong>the axis is sized from the measurement</strong>, spanning whatever
        clears a thousandth of each feature's own peak. Per feature, not against one global
        maximum — otherwise a line's towering density would push a perfectly real broadband
        source off the plot for the crime of sharing a detector with a laser. A manual range
        is available when a fixed window is wanted.</p>`,
      formulas: [],
      limitations: `<p>This is not an instrument, it is a readout. There is no
        monochromator, no slit, and so no resolution bandwidth: a real spectrometer shows
        the true spectrum convolved with its own filter function, and reports something
        broader than reality for anything narrower than that filter. Here the modelled
        spectrum is reported directly. Nothing sets a sweep time, and there is no
        distinction between a spectrograph, a scanning instrument and a Fourier-transform
        one — all of which would answer differently.</p>
        <p>There is no dynamic range and no noise floor. Stray light does not exist, so the
        30&nbsp;dB that limits a single monochromator and the 30–40&nbsp;dB that limits a
        Fourier-transform instrument have no counterpart, and a weak line beside a strong one
        is read as easily as if it were alone — which is precisely the measurement real
        instruments find hardest. There is no logarithmic or dBm scale.</p>
        <p>The plotted samples are a display budget, not a physical resolution, and
        wavelengths are keyed to 0.1&nbsp;nm, so two lines closer together than that are
        reported as one. Readings are fractions of a source's emitted power rather than
        absolute values in watts; for power, use the <a href="../powermeter/">power
        meter</a>, which is the advice for real instruments too.</p>`,
    },
    related: ['detector', 'display', 'aotf', 'grating', 'powermeter'],
    citations: [
      { label: '“Optical Spectrum Analyzers,” RP Photonics Encyclopedia', url: 'https://www.rp-photonics.com/optical_spectrum_analyzers.html' },
      { label: 'Optical spectrum analyzer — ScienceDirect Topics (engineering overview)', url: 'https://www.sciencedirect.com/topics/engineering/optical-spectrum-analyzer' },
      { label: 'J. A. Moon et al., “Optical spectrum analyzer,” US patent 7,253,897 B2, Cidra Corp (granted 2007) — a compact dual-pass grating analyser with a pivoting reflector and reference mirrors', url: 'https://patents.google.com/patent/US7253897B2/en' },
      { label: 'Review article, Review of Scientific Instruments 94(8), 081501 (2023)', url: 'https://pubs.aip.org/aip/rsi/article/94/8/081501/2905189' },
      { label: 'M. Barnoski, B.-U. Chen, T. Joseph, J. Lee and O. Ramer, “Integrated-optic spectrum analyzer,” IEEE Transactions on Circuits and Systems 26(12), 1113–1124 (1979) — a Bragg analyser built from a guided wave and a surface acoustic wave', url: 'https://ieeexplore.ieee.org/abstract/document/1084599' },
    ],
    resources: [
      { label: 'RP Photonics Encyclopedia — Spectrometers', url: 'https://www.rp-photonics.com/spectrometers.html' },
      { label: 'RP Photonics Encyclopedia — Wavemeters', url: 'https://www.rp-photonics.com/wavemeters.html' },
    ],
  },

  {
    type: 'polarimeter',
    title: 'Polarimeter',
    category: 'Detectors',
    realWorld: {
      html: `
        <p>Polarization is the direction the electric field oscillates in as light
        travels. Describing it fully means describing an <strong>ellipse</strong> — the
        figure the field vector traces out in the plane transverse to propagation — with its
        orientation, its ellipticity, and its handedness. The trouble is that this ellipse is
        an amplitude description, and amplitude is not something a detector can see. Detectors
        respond to intensity, so the ellipse "can neither be observed nor
        measured"${cite(1)} directly.</p>
        <p>George Gabriel Stokes solved this in 1852 by describing the polarization state
        with four quantities that are all <em>intensities</em>, and so all measurable. The
        <strong>Stokes parameters</strong> are, in the modern convention:</p>`,
      formulas: [
        { tex: '\\begin{aligned} S_0 &= I_{0°} + I_{90°} &&\\text{total intensity} \\\\ S_1 &= I_{0°} - I_{90°} &&\\text{horizontal vs. vertical} \\\\ S_2 &= I_{45°} - I_{135°} &&\\text{diagonal vs. anti-diagonal} \\\\ S_3 &= I_{\\text{RCP}} - I_{\\text{LCP}} &&\\text{right vs. left circular} \\end{aligned}', caption: 'Each parameter is a difference of two intensities through opposite analyzers, which is exactly why the set is measurable when the polarization ellipse is not. S₀ is the total power; the other three say how it is distributed between each pair of opposite states.' },
      ],
      html2: `
        <p>Dividing the last three by <span class="w">S₀</span> gives normalized parameters
        <span class="w">s₁, s₂, s₃</span>, each between −1 and +1, and these are the Cartesian
        coordinates of a point on or inside the <strong>Poincaré sphere</strong>. The equator
        holds every linear state, the poles the two circular ones, and everything between is
        elliptical. A lossless waveplate does not change how polarized the light is, only
        which state it is in, so it moves the point around the surface — which is why the
        sphere is such a natural way to think about retarders.</p>
        <p>The radius of that point is the <strong>degree of polarization</strong>:</p>`,
      formulas2: [
        { tex: 'P = \\frac{\\sqrt{S_1^{\\,2} + S_2^{\\,2} + S_3^{\\,2}}}{S_0}, \\qquad 0 \\le P \\le 1', caption: 'P = 1 is fully polarized (a point on the surface), P = 0 is unpolarized (the centre), and anything between is partially polarized. Crucially, S₁² + S₂² + S₃² < S₀² is possible — a fact no single polarization ellipse can express.' },
      ],
      html3: `
        <p>That last point is what makes the Stokes description more than a change of
        notation. Unpolarized light is not one state; it is an <em>incoherent mixture</em> of
        states, and mixtures add as Stokes vectors. Two equally strong orthogonal beams
        superposed give <span class="w">S₁ = S₂ = S₃ = 0</span> with
        <span class="w">S₀</span> unchanged: the sphere's centre, genuinely unpolarized. No
        single ellipse can represent that, which is why real sources — sunlight, a lamp, an
        LED — need the Stokes formalism and not the ellipse.</p>

        <h3>Measuring the four parameters</h3>
        <p>A polarimeter is whatever apparatus turns the four definitions above into four
        numbers. The <strong>classical method</strong> follows them almost literally: send the
        beam through a rotatable linear polarizer onto a power meter and record the
        transmitted intensity at a few analyzer angles. With the analyzer at
        <span class="w">θ</span> and an optional waveplate of retardance
        <span class="w">φ</span> in front of it, the transmitted intensity
        is${cite(1)}</p>`,
      formulas3: [
        { tex: 'I(\\theta, \\varphi) = \\tfrac{1}{2}\\left(S_0 + S_1\\cos 2\\theta + S_2 \\sin 2\\theta \\cos\\varphi - S_3 \\sin 2\\theta \\sin\\varphi \\right)', caption: 'Three measurements with no waveplate (θ = 0°, 45°, 90°) give S₀, S₁ and S₂; a fourth with a quarter-wave plate inserted (φ = 90°) at θ = 45° gives S₃, since S₃ = S₀ − 2I(45°, 90°).' },
      ],
      html4: `
        <p>It works, but Schaefer and colleagues list its weaknesses plainly${cite(1)}: the
        analyzer has to be aligned accurately at each angle, the waveplate has to be inserted
        and aligned for the last reading, inserting it absorbs light and so changes the very
        equations being used, and only four data points are taken — so a single bad reading
        has nothing to average against.</p>
        <p>The <strong>rotating quarter-wave plate method</strong> fixes all four at once. Put
        the waveplate <em>first</em> and rotate it through an angle
        <span class="w">θ</span>, keep the analyzer fixed, and record intensity continuously.
        Nothing is inserted or removed mid-measurement, only one element moves, and the
        transmitted intensity becomes a truncated Fourier series${cite(1)}:</p>`,
      formulas4: [
        { tex: 'I(\\theta) = \\tfrac{1}{2}\\left(A + B\\sin 2\\theta + C\\cos 4\\theta + D\\sin 4\\theta\\right), \\qquad \\begin{aligned} S_0 &= A - C & S_1 &= 2C \\\\ S_2 &= 2D & S_3 &= B \\end{aligned}', caption: 'All four parameters fall out of the harmonic content of one continuous scan. Because the highest term is the fourth harmonic, Nyquist requires at least eight samples per rotation — and in practice many more are taken and least-squares fitted, so every point improves the result instead of one point being decisive.' },
      ],
      html5: `
        <p>Thorlabs have a short build video that walks through both methods on a real bench,
        with a polarizer, a quarter-wave plate and a power meter, and shows the actual mounts
        and the data reduction${cite(2)} — a good companion to the algebra above if you intend
        to assemble one.</p>
        <p>Commercial polarimeters mostly avoid moving parts altogether: a division-of-amplitude
        instrument splits the beam into four paths with fixed analyzers and reads all four
        detectors at once, and rotating-waveplate designs are still common where speed matters
        less than cost. Polarimetry underpins fiber and telecom monitoring, stress birefringence
        measurement in glass and plastics, ellipsometry for thin-film thickness, remote sensing,
        and polarization-resolved microscopy of ordered biological structure such as collagen.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>Every ray in OpticalSetup carries a normalized Stokes vector, and the polarization
        elements transform it exactly as the Poincaré-sphere picture says they should. A
        <a href="../polarizer/">polarizer</a> projects onto its axis by Malus's law in Stokes
        form, and a <a href="../qwp/">waveplate</a> rotates the vector about the axis set by
        its own fast axis, through an angle equal to its retardance. Prepared states land
        where they should: a linear source reads
        <span class="w">(1, 0, 0)</span>, the same beam through a quarter-wave plate at 45°
        reads <span class="w">(0, 0, −1)</span> — circular — and at 22.5° reads
        <span class="w">(0.5, 0.5, −0.707)</span>, still fully polarized.</p>
        <p>The polarimeter reports <span class="w">S₀</span> as the arriving intensity,
        the three normalized components scaled to it, the degree of polarization, and a plain
        description of the state. It gets those from the power-weighted mean of every ray
        landing on its face — which means <strong>partially polarized and unpolarized light
        are representable</strong>, even though no individual ray can be either. Two equally
        strong counter-polarized beams on one face average to the centre of the sphere and are
        correctly reported as unpolarized, with <span class="w">S₀</span> undiminished.</p>

        <h3>The instrument is a shortcut, not a separate physics</h3>
        <p>This element does not measure anything: it reads out a vector the tracer has been
        carrying all along. The measurement it stands in for can nevertheless be performed
        properly on the bench, out of ordinary parts, because the polarizer really does
        implement <span class="w">I = ½(S₀ + S₁cos2θ + S₂sin2θ)</span> — the same equation the
        classical method inverts.</p>
        <p>Both published methods have been checked against it. Building the classical
        four-intensity measurement out of a polarizer, a quarter-wave plate and a plain
        <a href="../detector/">photodetector</a>, then applying
        <span class="w">S₀ = I(0°)+I(90°)</span> and the rest, recovers the polarimeter's own
        numbers to better than one part in 10¹⁵. So does the rotating-waveplate method:
        sixteen intensities through a rotating quarter-wave plate and a fixed analyzer,
        Fourier-analyzed into <span class="w">A, B, C, D</span>, give back the same Stokes
        vector. Both are locked in as regression tests, so the shortcut and the honest
        measurement cannot drift apart.</p>`,
      limitations: `<p>Waveplates here are perfectly achromatic: a quarter-wave plate applies
        exactly 90° of retardance at 405&nbsp;nm and at 1550&nbsp;nm alike. A real waveplate is
        quarter-wave only near its design wavelength, with retardance scaling roughly as
        1/λ, so a genuine polarimeter's calibration is wavelength-specific and this one's is
        not. Polarizers are ideal too — perfect extinction on one axis, no leakage, no
        wavelength dependence, and no insertion loss beyond the projection itself, so the
        "inserting the waveplate absorbs light" problem that motivates the rotating method
        cannot be reproduced here.</p>
        <p>Nothing depolarizes. Scattering, stress birefringence, thermal effects and
        multimode fiber all scramble polarization in reality; here the only route to a
        partially polarized reading is incoherently mixing distinct beams on one detector
        face. There is no Mueller-matrix generality either: elements apply their specific
        transformations rather than an arbitrary 4×4 matrix, so diattenuation and
        depolarization cannot be authored as element properties.</p>
        <p>The readout itself is noiseless and instantaneous — no detector noise, no analyzer
        misalignment, no waveplate retardance error, and none of the systematic
        error budget that dominates real polarimetry. And because the tracer works in a 2D
        meridional plane, the Stokes vector is carried as an abstract state attached to rays
        rather than as a field orientation in three dimensions; it is exact within that model,
        but it is not a full vector-field treatment.</p>`,
    },
    related: ['polarizer', 'qwp', 'hwp', 'pbs', 'detector'],
    citations: [
      { label: 'B. Schaefer, E. Collett, R. Smyth, D. Barrett and B. Fraher, “Measuring the Stokes polarization parameters,” American Journal of Physics 75(2), 163–168 (2007)', url: 'https://doi.org/10.1119/1.2386162' },
      { label: 'Thorlabs Insights — “Build a Polarimeter to Find Stokes Values, Polarization State (Viewer Inspired)” (YouTube, 2021): both the classical and rotating-waveplate methods built on a real bench', url: 'https://www.youtube.com/watch?v=pR4r7gMyN5U' },
    ],
    resources: [
      { label: 'Stokes parameters — Wikipedia', url: 'https://en.wikipedia.org/wiki/Stokes_parameters' },
      { label: 'RP Photonics Encyclopedia — Polarization of Light', url: 'https://www.rp-photonics.com/polarization_of_light.html' },
    ],
  },
  {
    type: 'autocorrelator',
    title: 'Autocorrelator',
    category: 'Detectors',
    realWorld: {
      html: `
        <p>A femtosecond pulse cannot be timed by anything electronic. The fastest
        photodiodes and sampling oscilloscopes reach a few picoseconds; a 100&nbsp;fs pulse
        is two orders of magnitude shorter than that, and no detector exists whose response
        is short enough to resolve it${cite(1)}. The way out is to stop looking for a faster
        clock and instead use the pulse to measure itself.</p>
        <p>That is what an autocorrelator does. A beam splitter makes two copies of the
        incoming pulse; one travels through a variable delay line; the two are then brought
        together in a medium with a &chi;<sup>(2)</sup> nonlinearity — typically a thin
        second-harmonic crystal — where they mix only while they physically overlap in
        time${cite(1)}. Sum-frequency light appears at a new, shorter wavelength, and its
        power depends on how much of the two envelopes coincide. Sweep the delay, record
        that power, and the resulting curve — the autocorrelation trace — is about as wide as the
        pulse is long. Nothing in the detection chain needs to be fast: the photodiode only
        has to read an <em>average</em> power for each delay setting, because a mode-locked
        laser supplies a regular train of nominally identical pulses${cite(1)}.</p>
        <h3>Intensity autocorrelation</h3>
        <p>In the standard arrangement the two copies cross at a small angle in the crystal,
        so the sum-frequency beam leaves along its own direction, between the two inputs.
        Because that beam only exists where the pulses overlap, the signal falls to zero at
        large delay: the measurement is <strong>background-free</strong>${cite(1)}, and this
        non-collinear geometry is what gives an intensity autocorrelator its high dynamic
        range${cite(2)}. The trace it records is</p>`,
      formulas: [
        { tex: 'I_{\\mathrm{ac}}(\\tau)=\\int_{-\\infty}^{\\infty} P(t)\\,P(t+\\tau)\\,\\mathrm{d}t', caption: 'The intensity autocorrelation: the optical power of the pulse multiplied by a delayed copy of itself, integrated over time, as a function of the delay τ set by the moving arm.' },
      ],
      html2: `
        <h3>Why the trace is always wider than the pulse</h3>
        <p>Look at that integral at zero delay: the two copies sit exactly on top of one
        another and the product is maximal. Now shift by a delay smaller than the pulse
        duration. The overlap has shrunk, but it has not vanished — the trailing part of one
        copy is still sitting on the leading part of the other, so a real signal is still
        produced. Only when the delay exceeds roughly the pulse length does the product
        finally go to zero. The measured curve therefore stays above half maximum for
        <em>longer</em> than the pulse itself does, and the autocorrelation is inescapably
        broader than the thing it is measuring. This is not an instrumental defect that
        better optics would remove; it is a property of the operation.</p>
        <p>How much broader depends on the shape of the envelope. For a Gaussian pulse the
        autocorrelation is itself Gaussian and about <strong>1.41 times</strong> wider —
        exactly &radic;2, because Gaussian widths add in quadrature and
        &radic;(&tau;&sup2;&nbsp;+&nbsp;&tau;&sup2;)&nbsp;=&nbsp;&radic;2&nbsp;&tau;${cite(1)}. For a sech² pulse, the shape most
        mode-locked oscillators actually produce, the pulse duration is about
        <strong>0.65 times</strong> the width of the trace${cite(1)} — a factor of roughly
        1.543 the other way. So the instrument never reports a duration directly. It reports
        a trace width, and someone must divide out a <em>deconvolution factor</em>:</p>`,
      formulas2: [
        { tex: '\\tau_{\\mathrm{p}}=\\frac{\\Delta\\tau_{\\mathrm{ac}}}{k},\\qquad k_{\\mathrm{Gauss}}=\\sqrt{2}\\approx 1.414,\\qquad k_{\\mathrm{sech}^2}\\approx 1.543', caption: 'The pulse duration is the measured autocorrelation FWHM divided by a factor that depends entirely on the pulse shape you assume it has.' },
      ],
      html3: `
        <p>And there is the catch that defines the technique. The factor depends on a shape
        the measurement itself cannot establish. Gaussian and sech² traces do not look
        dramatically different, so fitting one to the data is a sanity check rather than a
        proof${cite(1)}. Yet the two factors differ by 9%, so assuming the wrong one puts
        the answer out by 9% before any other error is counted — and for genuinely odd pulse
        shapes, by far more. A quoted "150&nbsp;fs, assuming sech²" is an honest reading;
        a quoted "150&nbsp;fs" is an incomplete one.</p>
        <h3>What an autocorrelation cannot tell you</h3>
        <p>The deeper limitation is structural: <strong>the autocorrelation trace is always
        symmetric about zero delay, even when the pulse is not</strong>${cite(1)}. Swapping
        <em>t</em>&nbsp;&rarr;&nbsp;&minus;<em>t</em> in the integral leaves it unchanged, so a pulse with a steep rise and a slow
        decay produces exactly the same trace as its mirror image. The direction of time is
        simply not in the data${cite(2)}. Neither is the phase: an intensity autocorrelation
        responds only to optical power, so it carries no information about chirp, and
        different pulses can yield indistinguishable traces${cite(1,3)}. Usefully, the
        symmetry works as a diagnostic in reverse — an <em>asymmetric</em> trace means a
        misaligned autocorrelator, not an asymmetric pulse${cite(1)}.</p>
        <p>Noise makes this worse in a specific and notorious way. When a laser is not
        mode-locking cleanly, each pulse in the train differs from the last, and the
        averaged trace can show a narrow spike sitting on a much broader pedestal. Taking
        that spike as the pulse duration is wrong: it is a <strong>coherent
        artifact</strong>, and in such a situation the trace conveys very little about the
        real pulse${cite(1,5)}. A distorted train can look like a beautifully short
        pulse.</p>
        <h3>Interferometric autocorrelation</h3>
        <p>Send the two copies collinearly instead — same path, same polarization — and they
        interfere before the crystal sees them. The recorded signal then resolves the
        optical fringes, oscillating with a period of half the optical wavelength${cite(1)}:</p>`,
      formulas3: [
        { tex: 'I_{\\mathrm{iac}}(\\tau)=\\int \\bigl(E(t)+E(t+\\tau)\\bigr)^{4}\\,\\mathrm{d}t', caption: 'The interferometric (fringe-resolved) autocorrelation. Because the fields add before being squared twice, perfect constructive interference gives four times the intensity and sixteen times the second-harmonic signal — against a background of twice that from one arm alone.' },
      ],
      html4: `
        <p>That arithmetic gives the technique its built-in alignment check: a properly
        aligned interferometric autocorrelator always produces a trace whose peak is exactly
        <strong>eight times</strong> its wings${cite(1)}. If the fringes are averaged out,
        as they are for longer pulses, the ratio becomes 3:1 rather than 4:1, because the
        oscillation is not sinusoidal${cite(1)}. Unlike the intensity version, this trace
        <em>is</em> sensitive to chirp — although a chirped pulse's duration is
        underestimated if one simply reads off the width, and post-processing methods such as
        MOSAIC exist to make the chirp legible${cite(1)}. The collinear geometry avoids the
        geometric smearing that a crossing angle causes, which is why interferometric designs
        dominate at the few-femtosecond end${cite(1,2)}.</p>
        <h3>Practical variants</h3>
        <p><strong>Scanning versus single-shot.</strong> Most traces are built from many
        pulses, one or more per delay setting, which quietly assumes the train is regular —
        fine for a mode-locked oscillator, unreliable for a low-repetition-rate amplifier.
        A single-shot autocorrelator instead focuses with a <em>cylindrical</em> lens so that
        position across the crystal maps to delay, and reads the whole trace off a camera
        from one pulse${cite(1)}. Scanning units suit stable high-rate trains; single-shot
        units are what a 10&nbsp;Hz or 1&nbsp;kHz amplifier needs, and the only way to see
        shot-to-shot fluctuation${cite(1)}.</p>
        <p><strong>Two-photon detectors.</strong> A photodiode with a band gap too large to
        absorb the light linearly still responds through two-photon absorption, which is
        itself the required nonlinearity — so the crystal disappears entirely, and with it
        the phase-matching alignment${cite(1)}. LEDs run backwards as detectors work
        too${cite(1)}. These are the compact, nearly alignment-free instruments, at the cost
        of sensitivity: quoted as the product of average and peak power, a TPA head reaches
        around 10<sup>&minus;2</sup>&nbsp;W&sup2; where a photomultiplier-based unit reaches
        10<sup>&minus;6</sup>&nbsp;W&sup2;${cite(2)}.</p>
        <p><strong>Dynamic range.</strong> Weak pedestals and satellite pulses — a
        speciality of mode-locked fiber lasers — need far more range than a standard trace
        offers. Type-II phase matching, two-frequency chopping with lock-in detection, and
        photomultiplier detection push background-free measurements to 80 or even
        100&nbsp;dB${cite(1)}. A third-order autocorrelator, mixing the light with its own
        second harmonic, breaks the symmetry altogether and can distinguish a pre-pulse from
        a post-pulse — at much lower sensitivity${cite(1)}.</p>
        <p><strong>When to stop autocorrelating.</strong> Below about 10&nbsp;fs the
        phase-matching bandwidth of even a very thin crystal becomes the limit, and
        frequency-resolved optical gating (FROG) and spectral phase interferometry (SPIDER)
        are both more accurate and able to return the phase the autocorrelation discards
        ${cite(1,3,6)}. FROG is in one sense just an autocorrelator that spectrally resolves
        its output — spectrum versus delay instead of energy versus delay — and that one
        extra axis is enough to lift the ambiguity${cite(2)}.</p>
        <h3>Cross-correlation: two different pulses</h3>
        <p>Nothing in the layout requires the two arms to carry copies of the same pulse.
        Feed the nonlinear crystal from two <em>different</em> beams and the same delay scan
        measures their <strong>cross-correlation</strong>:</p>`,
      formulas4: [
        { tex: 'I_{\\mathrm{cc}}(\\tau)=\\int_{-\\infty}^{\\infty} I_1(t)\\,I_2(t+\\tau)\\,\\mathrm{d}t,\\qquad \\Delta\\tau_{\\mathrm{cc}}=\\sqrt{\\tau_1^{2}+\\tau_2^{2}}\\ \\ (\\text{Gaussians})', caption: 'The cross-correlation of two pulses, and — for Gaussian envelopes — the width of the resulting trace, which adds the two durations in quadrature.' },
      ],
      html5: `
        <p>Two things change, and both are improvements. First, the trace is no longer
        forced to be symmetric, so an asymmetric pulse now shows its asymmetry and the
        direction of time survives the measurement. Second, if one of the two pulses is
        already known and much shorter than the other, it acts as a fast optical gate:
        <em>I</em><sub>1</sub> approaches a delta function, the integral collapses to <em>I</em><sub>2</sub>(&tau;), and the
        trace <em>is</em> the unknown envelope, sampled directly rather than
        deconvolved${cite(1)}. This is why a characterized reference pulse is worth so much,
        and why the quadrature relation above matters — with &tau;<sub>1</sub>&nbsp;&#8810;&nbsp;&tau;<sub>2</sub> the
        measured width is just &tau;<sub>2</sub>.</p>
        <h3>Finding time zero for multi-beam overlap</h3>
        <p>The most common use of a cross-correlation in a working laboratory is not
        measuring a duration at all. It is answering a blunter question: <em>when do these
        two beams actually arrive at the same place at the same time?</em></p>
        <p>Any experiment driven by two or more synchronized pulses has this problem. The
        beams travel different paths — different numbers of mirrors, different lengths of
        glass, an optical parametric oscillator in one arm and none in the other — and a
        single millimetre of path difference is 3.3&nbsp;ps of timing error, which for
        100&nbsp;fs pulses means no overlap whatsoever. Spatial alignment can be judged by
        eye or on a camera; temporal alignment cannot be seen at all. Worse, the search space
        is large and the signal is exactly zero everywhere outside it, so scanning blind is
        hopeless without a signal that appears the moment the pulses coincide.</p>
        <p>The cross-correlation provides exactly that. Combine the two beams on a dichroic
        mirror, focus them into a thin nonlinear crystal, and scan one arm's delay while
        watching for sum-frequency light. Because 1/&lambda;<sub>SF</sub>&nbsp;=&nbsp;1/&lambda;<sub>1</sub>&nbsp;+&nbsp;1/&lambda;<sub>2</sub>, that light appears at a wavelength lying between the two
        second harmonics — a colour that <strong>only</strong> exists when both beams are
        present together, which makes it unmistakable. The delay-stage position that
        maximises it is <strong>time zero</strong>, and the width of the peak around it tells
        you how much timing slop the experiment can tolerate${cite(4)}.</p>
        <p>Coherent Raman microscopy is the textbook case. In coherent anti-Stokes Raman
        scattering (CARS), a pump photon and a Stokes photon drive a molecular vibration
        whose frequency is their difference, and a third photon probes it — so the signal
        exists only where and when both beams overlap in the focal volume${cite(4)}. The
        pump typically comes from a femtosecond oscillator and the Stokes from an optical
        parametric oscillator pumped by it: synchronized by construction, but arriving at the
        sample at quite different times until a delay line is set. The standard procedure is
        to focus the combined beams into a type-I BBO crystal and maximise the
        sum-frequency signal${cite(4)}.</p>
        <p>Two subtleties make this more than an alignment step. The overlap that matters is
        at the <em>focus of the objective</em>, not at the entrance to the microscope, and a
        high-NA objective is a substantial piece of glass — so a measurement made on the
        bench with an external autocorrelator does not describe the pulses that actually
        reach the sample${cite(4)}. And when the pulses are deliberately chirped for
        <em>spectral focusing</em> — stretched so that their instantaneous frequency
        difference stays constant across the overlap — the delay no longer merely switches
        the signal on. It <em>tunes the Raman shift</em>. Time zero then defines the origin
        of the spectroscopic axis, and getting it wrong shifts every measured vibrational
        frequency${cite(4)}.</p>
        <p>A neat consequence, exploited by Piazza and co-workers, is that the delay line
        already present in every such microscope is enough to characterize both pulses
        without any autocorrelator at all. Scanning it while recording two different
        nonlinear signals from a sample — the sum-frequency signal, which mixes one pump
        photon with one Stokes photon, and the non-resonant four-wave-mixing signal, which
        takes two pump photons and one Stokes photon — gives two cross-correlation widths
        that depend differently on the two durations. Two equations, two unknowns: both
        durations fall out, and tracking how the centre wavelength of each signal drifts with
        delay yields each pulse's chirp as well${cite(4)}.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The Autocorrelator reports the pulse duration of whatever pulse train reaches its
        face — and reports it the way a real instrument does, as a trace width with an
        assumption divided out, rather than as a number read off the source.</p>
        <p>The one control that matters is <strong>Assumed pulse shape</strong>: Gaussian
        (÷1.414) or sech² (÷1.543). This is deliberately a user choice and not something the
        instrument works out for itself, because in a laboratory it is not something the
        instrument <em>can</em> work out for itself. Set it to the wrong shape and the
        reading changes — a Gaussian assumption on a sech² source reads about 9% long, and
        the inspector says so explicitly, naming the true duration beside the inferred one.
        That disagreement is the lesson the component exists to teach.</p>
        <p>The reading is taken from the pulse that <em>arrives</em>, not the one that was
        emitted. Put a <a href="../glassrod/">glass rod</a> in the path and the autocorrelator
        measures the stretched duration; add a <a href="../pulsecompressor/">pulse
        compressor</a> with the opposite group delay dispersion and it measures the pulse
        recovering. The bundled <em>Ultrashort pulse chirping</em> example is built around
        exactly that comparison, with three autocorrelators reading the same pulse under
        three different dispersion conditions.</p>
        <p>Wired to a Detector screen, it draws the trace: delay on
        the horizontal axis rather than laboratory time, the curve symmetric about zero delay
        as a real autocorrelation always is, the half-maximum chord that <em>is</em> the
        measurement marked across it, and the inferred duration printed above. A continuous-wave
        source produces no trace and says so; two different pulse trains arriving together
        produce no trace either, and say that instead of averaging them into a meaningless
        number.</p>`,
      formulas: [],
      limitations: `<p>No scan is simulated. The trace is drawn from the arriving duration
        and the assumed shape rather than being accumulated by stepping a delay line through
        a nonlinear crystal, so there is no scan time, no delay-line travel limit setting a
        maximum measurable duration, and no acquisition noise. Everything downstream of that
        choice follows: no crystal, no phase matching, no group velocity mismatch, and
        therefore none of the difficulties that dominate real measurements below about
        20&nbsp;fs.</p>
        <p>Only the intensity autocorrelation is modelled. There is no interferometric mode,
        so the fringes, the diagnostic 8:1 peak-to-background ratio, and the chirp sensitivity
        that comes with a collinear geometry have no counterpart here. There is no dynamic
        range and no noise floor, so pedestals, satellite pulses, and the coherent artifact
        cannot appear — the trace is always the clean curve of a well-behaved pulse. Pulse
        shapes other than Gaussian and sech² are not available, and since the modelled
        envelope is symmetric, the asymmetry that a real autocorrelation famously hides is
        not there to be hidden.</p>
        <p>It is an autocorrelator only. Two beams cannot be cross-correlated against each
        other: a single instrument sees the sum of what reaches its face, and if that is more
        than one pulse train it declines to report rather than mixing them. Finding time zero
        between two arms, as described above, is therefore something the component describes
        but does not perform.</p>`,
    },
    related: ['pulsedlaser', 'glassrod', 'pulsecompressor', 'detector', 'spectrometer'],
    citations: [
      { label: 'R. Paschotta, “Autocorrelators,” RP Photonics Encyclopedia; doi:10.61835/y7n', url: 'https://www.rp-photonics.com/autocorrelators.html' },
      { label: '“Ultrashort laser pulse characterisation: Optical autocorrelators,” MEETOPTICS Academy', url: 'https://www.meetoptics.com/academy/autocorrelators' },
      { label: 'D. J. Kane, “Ultrafast Laser Techniques: Pulse Characterization Techniques,” in Encyclopedia of Modern Optics, Elsevier (2005), pp. 227–239; doi:10.1016/B0-12-369395-0/00842-3', url: 'https://www.sciencedirect.com/science/article/pii/B0123693950008423' },
      { label: 'V. Piazza, G. de Vito, E. Farrokhtakin, G. Ciofani and V. Mattoli, “Femtosecond-laser-pulse characterization and optimization for CARS microscopy,” PLoS ONE 11(5), e0156371 (2016)', url: 'https://doi.org/10.1371/journal.pone.0156371' },
      { label: 'R. A. Fisher and J. A. Fleck Jr., “On the phase characteristics and compression of picosecond pulses,” Appl. Phys. Lett. 15, 287 (1969) — the origin of the coherent-artifact warning', url: 'https://doi.org/10.1063/1.1653002' },
      { label: 'D. J. Kane and R. Trebino, “Characterization of arbitrary femtosecond pulses using frequency-resolved optical gating,” IEEE J. Quantum Electron. 29(2), 571–579 (1993)', url: 'https://doi.org/10.1109/3.199311' },
    ],
    resources: [
      { label: 'RP Photonics Encyclopedia — Pulse Characterization', url: 'https://www.rp-photonics.com/pulse_characterization.html' },
      { label: 'RP Photonics Encyclopedia — Pulse Duration', url: 'https://www.rp-photonics.com/pulse_duration.html' },
    ],
  },

  {
    type: 'dichroic',
    title: 'Dichroic mirror',
    category: 'Filters & Splitters',
    realWorld: {
      html: `
        <p>A dichroic mirror is a multilayer thin-film coating engineered so
        constructive and destructive interference between the layers reflects one band
        of wavelengths while transmitting another. The transmission spectrum
        <span class="w">T(λ)</span> it produces depends on the full layer stack — there's
        no single closed-form equation, and real coatings have a finite-width transition
        (not a hard cutoff) that also shifts with the angle of incidence.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>OpticalSetup models the idealized target behavior a dichroic coating is
        designed to approximate: a hard-edged passband. Longpass, shortpass, and bandpass
        variants each define a wavelength range that transmits completely, reflecting
        everything else. For a broadband beam, the transmitted and reflected branches
        each carry the actual spectral overlap between the beam's band and the passband —
        so a supercontinuum beam through a longpass dichroic correctly comes out
        color-shifted on both branches, not just dimmed.</p>`,
      formulas: [
        { tex: 'T(\\lambda) = \\begin{cases} 1 & \\lambda \\in \\text{passband} \\\\ 0 & \\text{otherwise} \\end{cases}', caption: 'The ideal step-function transmission OpticalSetup evaluates, versus a real coating\'s smooth, angle-dependent roll-off.' },
      ],
      limitations: `<p>No thin-film interference is modeled, the cutoff is a hard edge
        rather than a smooth transition, and — unlike a real coating, whose cutoff
        wavelength shifts at non-normal incidence — the configured cutoff is fixed
        regardless of the angle the dichroic is drawn at.</p>`,
    },
    related: ['filter', 'bs', 'etalon', 'prism'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Dichroic Mirrors', url: 'https://www.rp-photonics.com/dichroic_mirrors.html' },
    ],
  },

  {
    type: 'filter',
    title: 'Filter',
    category: 'Filters & Splitters',
    realWorld: {
      html: `
        <p>Optical filters reject unwanted wavelengths by one of two physical
        mechanisms. <strong>Absorptive filters</strong> — colored or doped glass, or a
        dye suspended in a polymer — remove light by genuine absorption: photons in the
        rejected band are converted to heat inside the material. <strong>Interference
        filters</strong> instead use the same multilayer dielectric-coating physics as a
        dichroic mirror, engineered so the rejected band destructively interferes in
        transmission — which usually means it reflects back out rather than being
        absorbed. A <strong>neutral-density (ND) filter</strong> is the wavelength-flat
        special case of an absorptive or partially-reflective metallic coating, meant to
        attenuate intensity uniformly across the visible band rather than reject a
        specific color.</p>
        <p>Absorptive and interference designs behave very differently under high power:
        an absorptive filter converts the rejected light to heat and can be damaged or
        even cracked if that exceeds its thermal budget, while an interference filter's
        rejected light reflects back toward the source — a real hazard when placed near a
        laser cavity, since that reflection can re-enter the gain medium.</p>`,
      formulas: [
        { tex: 'T(\\lambda) = e^{-\\alpha(\\lambda) L}', caption: "Beer–Lambert absorption through a filter of thickness L and wavelength-dependent absorption coefficient α(λ) — why a real absorptive filter's cut-on or cut-off is always a gradual slope, not a sharp step." },
        { tex: '\\text{OD} = -\\log_{10} T, \\qquad T = 10^{-\\text{OD}}', caption: 'Optical density — the standard way neutral-density filters are specified and stacked: ODs simply add when filters are combined in series.' },
      ],
    },
    inOpticalSetup: {
      html: `
        <p>One element models four filter families, selected by type: <em>Bandpass</em>,
        <em>Longpass</em>, and <em>Shortpass</em> each define an idealized passband —
        exactly the same hard-edged step-function model used by the <a
        href="../dichroic/">dichroic mirror</a> — while <em>Neutral density</em> instead
        attenuates every wavelength by the same configured transmission fraction. For a
        broadband or supercontinuum beam, the transmitted spectrum is the exact overlap
        between the beam's band and the passband, so a wide beam through a narrow
        bandpass filter correctly comes out both dimmer and spectrally narrowed.</p>`,
      formulas: [
        { tex: 'T(\\lambda) = \\begin{cases} 1 & \\lambda \\in \\text{passband} \\\\ 0 & \\text{otherwise} \\end{cases}, \\qquad I_{\\text{nd}} = \\text{trans} \\cdot I_0', caption: 'The idealized step-function passband used for bandpass/longpass/shortpass, and the flat scalar attenuation used for neutral density.' },
      ],
      limitations: `<p>Rejected light simply vanishes rather than reflecting — this
        matches the physical picture of an absorptive colored-glass filter, but not a
        reflective interference filter (for a component that reflects its rejected band
        instead, use the Dichroic mirror). The passband edge is a hard step with no
        transition slope, no per-wavelength optical density curve, and no angle
        dependence. The neutral-density mode is perfectly grey at every wavelength — real
        ND filters have some spectral ripple — and there's no damage-threshold or thermal
        modeling for either absorptive heating or reflected back-power.</p>`,
    },
    related: ['dichroic', 'bs', 'aotf'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Optical Filters', url: 'https://www.rp-photonics.com/optical_filters.html' },
      { label: 'RP Photonics Encyclopedia — Interference Filters', url: 'https://www.rp-photonics.com/interference_filters.html' },
    ],
  },

  {
    type: 'etalon',
    title: 'Etalon (Fabry–Pérot)',
    category: 'Filters & Splitters',
    realWorld: {
      html: `
        <p>A Fabry–Pérot etalon is just two closely spaced, parallel, partially
        reflective surfaces — but unlike a single partial mirror, light inside that gap
        bounces back and forth indefinitely, and every one of those internal reflections
        leaks a little light out and interferes with all the others. Sum that infinite
        series of multiply-reflected beams and, at most wavelengths, the interference is
        destructive enough that the etalon simply reflects, behaving like an ordinary
        partial mirror. But at a resonance — where the round-trip phase is a multiple of
        2π — every reflected component cancels almost perfectly, and transmission surges
        to a coating-limited peak that can approach 100% even through two mirrors that are
        individually 99% reflective. That counterintuitive buildup, not a simple partial
        transmission, is the entire operating principle.</p>
        <p>Resonances repeat periodically in wavelength at the free spectral range (FSR),
        and how sharp each resonance is — how far you can detune before transmission
        collapses back toward zero — is set by the finesse, which climbs steeply as the
        mirror reflectivity approaches 1.</p>`,
      formulas: [
        { tex: 'T(\\delta) = \\frac{T_{\\max}}{1 + F_c \\sin^2(\\delta/2)}, \\qquad F_c = \\frac{4R}{(1-R)^{2}}', caption: 'The Airy function — Fabry–Pérot transmission versus round-trip phase δ, for two matched mirrors of reflectivity R.' },
        { tex: '\\text{FSR} = \\frac{\\lambda^{2}}{2nd\\cos\\theta}, \\qquad \\mathcal{F} = \\frac{\\pi\\sqrt{R}}{1-R} = \\frac{\\text{FSR}}{\\text{FWHM}}', caption: 'Free spectral range (spacing between resonances, set by cavity length d and refractive index n) and finesse (resonance sharpness, set by reflectivity alone) — together they fix the resonance linewidth.' },
      ],
      html2: `
        <p>Because the round-trip phase δ depends on the incidence angle through
        <span class="w">cos θ</span>, tilting an etalon shifts its resonance wavelength
        without changing the mirrors at all — a standard tuning technique in real optical
        systems, alongside temperature tuning of the spacing itself. Etalons are used
        intracavity in lasers to force single-longitudinal-mode operation, and standalone
        as narrowband spectral filters and scanning spectrum analyzers.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The Etalon is specified the way a real one is speced on a datasheet — center
        wavelength, transmission bandwidth (FWHM), free spectral range, and peak
        transmission — rather than by the raw mirror spacing and reflectivity the Airy
        function actually needs. Those spectral targets are inverted internally into the
        matched-mirror reflectivity <span class="w">R</span> and cavity spacing that
        produce them, then the exact closed-form Airy function above is evaluated at every
        ray's real incidence angle: off-resonance light reflects, on-resonance light
        transmits up to the configured peak, and rotating the element on the canvas shifts
        the resonance exactly like tilting a real etalon — because the tracer uses the
        ray's actual hit angle, not a separately stored tilt parameter.</p>`,
      formulas: [],
      limitations: `<p>This is one of only two elements in the library implementing genuine
        multi-beam interference rather than an idealized on/off band — the app's ray
        tracer otherwise never tracks phase, so the etalon is special-cased as a single
        surface driven by the closed-form Airy result instead of actually summing repeated
        internal bounces. There's no mirror-parallelism defect (wedge), no temperature
        drift of the spacing, and peak transmission below 100% is reached with a single
        lumped loss term rather than a modeled absorption or scatter mechanism on each
        coating.</p>`,
    },
    related: ['vipa', 'dichroic', 'filter'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Etalons', url: 'https://www.rp-photonics.com/etalons.html' },
      { label: 'RP Photonics Encyclopedia — Finesse', url: 'https://www.rp-photonics.com/finesse.html' },
      { label: 'RP Photonics Encyclopedia — Tilt Tuning of Etalons', url: 'https://www.rp-photonics.com/spotlight_2009_12_31.html' },
    ],
  },

  {
    type: 'vipa',
    title: 'VIPA (Virtually Imaged Phased Array)',
    category: 'Filters & Splitters',
    realWorld: {
      html: `
        <p>A VIPA is, at heart, the same tilted Fabry–Pérot cavity as an etalon — two
        closely spaced reflective coatings — but illuminated and read out completely
        differently. Light enters through a small uncoated window in an otherwise
        near-perfectly reflective front face, focused to a line inside the cavity. Because
        the plate is tilted relative to that incoming beam, each internal bounce off the
        partially transmitting back face leaks light out at a slightly different lateral
        position instead of retracing the same path — producing a fan of many spatially
        offset, mutually coherent beams that interfere in the far field exactly like light
        emerging from a real phased array of point sources, except every one of those
        virtual sources is actually a single physical cavity imaged multiple times${cite(1)}.
        That's the "virtually imaged" half of the name.</p>
        <p>The result is angular dispersion 10–20× higher than an ordinary diffraction
        grating in a device a few millimeters thick, at the cost of a much smaller free
        spectral range — which is why VIPAs are typically paired with a grating in a
        cross-dispersed configuration (the grating separates orders that would otherwise
        overlap) in high-resolution spectrometers, optical coherence tomography systems,
        and dense wavelength-division-multiplexing demultiplexers.</p>`,
      formulas: [
        { tex: '\\Delta\\lambda_{\\text{res}} = \\frac{\\text{FSR}}{\\mathcal{F}}, \\qquad \\mathcal{F} = \\frac{\\pi\\sqrt{R_{\\text{out}}}}{1-R_{\\text{out}}}', caption: "Spectral resolution and finesse — set by the output face's reflectivity, exactly as in an ordinary etalon; only the readout geometry differs." },
      ],
    },
    inOpticalSetup: {
      html: `
        <p>Because the walk-off between successive leaked beams is a purely geometric
        consequence of the tilt — each bounce genuinely exits at a different point along
        the plate — OpticalSetup traces it directly as repeated ordinary mirror
        reflections rather than borrowing the Etalon's closed-form Airy transmission: an
        entrance window in the front coating lets rays in, and each subsequent bounce off
        the partially reflective rear face spawns both a continuing internal ray and a
        leaked output ray, exactly reproducing the fan of offset beams a real VIPA
        produces. Only the output face's reflectivity needs the Fabry–Pérot mathematics,
        and it's derived the same way the Etalon derives its mirror reflectivity: you
        specify center wavelength, resolution (FWHM), and free spectral range, and
        <code>resolveVipaPhysical()</code> solves for the plate spacing and coating
        reflectivity that would actually produce them — sharing its solver with the Etalon
        element, since spectrally the two are the same cavity.</p>`,
      formulas: [],
      limitations: `<p>The fan of leaked beams is genuine ray-traced geometry, but each
        individual leaked ray still carries only the ordinary (incoherent) intensity
        propagated by the rest of the tracer — the far-field interference between those
        beams that a real VIPA relies on to build its angular dispersion pattern isn't
        computed; what you see is the correct geometric walk-off, not a simulated
        diffraction pattern. There's also no modeled anti-reflection coating on the
        entrance window, no cylindrical input-lens focusing, and no cross-dispersing
        grating stage — this element models the VIPA plate alone.</p>`,
    },
    related: ['etalon', 'grating', 'dichroic'],
    citations: [
      { label: 'M. Shirasaki, "Large angular dispersion by a virtually imaged phased array and its application to a wavelength demultiplexer," Opt. Lett. 21, 366 (1996)', url: 'https://opg.optica.org/ol/abstract.cfm?uri=ol-21-5-366' },
    ],
    resources: [
      { label: 'Wikipedia — Virtually imaged phased array', url: 'https://en.wikipedia.org/wiki/Virtually_imaged_phased_array' },
      { label: 'RP Photonics Encyclopedia — Etalons', url: 'https://www.rp-photonics.com/etalons.html' },
    ],
  },

  {
    type: 'cmirrorx',
    title: 'Convex mirror',
    category: 'Mirrors',
    realWorld: {
      html: `
        <p>A convex (diverging) spherical mirror bulges toward the incoming light and
        spreads a reflected beam out rather than focusing it. It obeys the same mirror
        equation as a concave mirror, but with a negative focal length — object rays
        reflect as if diverging from a virtual focus behind the mirror, forming an
        upright, reduced virtual image. This is the geometry behind car passenger-side
        mirrors and wide-field security mirrors, both chosen for their expanded field of
        view rather than any focusing power.</p>`,
      formulas: [
        { tex: 'f = \\frac{R}{2} < 0, \\qquad \\frac{1}{f} = \\frac{1}{d_o} + \\frac{1}{d_i}', caption: 'Same mirror equation as the concave case, with f negative by convention.' },
      ],
    },
    inOpticalSetup: {
      html: `
        <p>Identical implementation to the <a href="../cmirror/">concave mirror</a> —
        exact vector reflection off the drawn line, followed by the lens-style paraxial
        correction <span class="w">u' = u − h/f</span> — just with a negative focal
        length, which is why the reflected beam here visibly spreads instead of
        converging.</p>`,
      formulas: [],
      limitations: `<p>Same caveat as the concave mirror: the curvature drawn in the icon
        is cosmetic, the correction is exact at every ray height (no spherical
        aberration), and there's no wavelength- or angle-dependent reflectivity.</p>`,
    },
    related: ['cmirror', 'mirror', 'oap'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Mirrors', url: 'https://www.rp-photonics.com/mirrors.html' },
    ],
  },

  {
    type: 'cmirror',
    title: 'Concave mirror',
    category: 'Mirrors',
    realWorld: {
      html: `
        <p>A concave (converging) spherical mirror focuses light by reflection the same
        way a lens focuses it by refraction. For a mirror of radius of curvature
        <span class="w">R</span>, the paraxial focal length is half the radius, and object
        and image distances obey the same mirror equation as a lens:</p>`,
      formulas: [
        { tex: 'f = \\frac{R}{2}', caption: 'Paraxial focal length from the radius of curvature.' },
        { tex: '\\frac{1}{f} = \\frac{1}{d_o} + \\frac{1}{d_i}, \\qquad m = -\\frac{d_i}{d_o}', caption: 'The mirror equation and transverse magnification — identical in form to the thin-lens equation.' },
      ],
      html2: `
        <p>That formula is only exact for rays close to the axis. A real sphere brings
        marginal (off-axis) rays to a focus slightly closer to the mirror than paraxial
        rays — spherical aberration — which is why fast astronomical mirrors are ground as
        parabolas instead (see the parabolic mirror page).</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>OpticalSetup reflects each ray off the mirror's drawn line using the exact
        vector law of reflection, then applies the same paraxial ray-transfer correction
        used by the <a href="../lens/">lens</a> element — <span class="w">u' = u −
        h/f</span> — to the reflected direction. The visible curvature in the icon is
        cosmetic; the ray/surface interaction happens against the flat line, with focusing
        added afterward as a per-ray angular correction.</p>`,
      formulas: [],
      limitations: `<p>Because the paraxial correction is applied exactly at every ray
        height rather than being derived from a real curved surface, this mirror has
        <em>no</em> spherical aberration at any aperture — every parallel ray converges
        exactly to the focal point regardless of how far it is from the axis. A real
        spherical mirror this fast would show visible aberration; this one won't. For a
        mirror whose curvature is actually ray-traced, see the parabolic mirror.</p>`,
    },
    related: ['cmirrorx', 'mirror', 'oap'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Mirrors', url: 'https://www.rp-photonics.com/mirrors.html' },
    ],
  },

  {
    type: 'oap',
    title: 'Parabolic mirror',
    category: 'Mirrors',
    realWorld: {
      html: `
        <p>A parabola has an exact geometric property a sphere only approximates: every
        ray traveling parallel to its axis, at <em>any</em> distance from that axis,
        reflects through a single focus. There is no spherical aberration to correct for,
        which is why fast telescope primaries, off-axis paraboloid (OAP) mirrors in
        ultrafast laser labs, and satellite dishes are all parabolic rather than
        spherical. In this 2D side view, the mirror profile is the parabola with vertex at
        the origin and focus a distance <span class="w">f</span> behind it:</p>`,
      formulas: [
        { tex: 'x = -\\frac{y^{2}}{4f}', caption: 'The parabola profile traced by the mirror, opening toward the incoming beam.' },
      ],
    },
    inOpticalSetup: {
      html: `
        <p>Unlike the concave and convex mirrors, which reflect off a single flat line
        and add focusing as a separate paraxial correction, the parabolic mirror is
        <strong>traced as its real geometric curve</strong> — split into a chain of short
        flat segments, each obeying the exact vector law of reflection. A collimated beam
        genuinely converges to the focus through real reflection geometry at every ray
        height, with no paraxial approximation involved.</p>`,
      formulas: [],
      limitations: `<p>This is closer to first-principles optics than most elements in the
        library, but it's still a 2D on-axis cross-section — a real OAP is typically an
        off-axis section of a 3D paraboloid, which this side view can't represent. The
        curve is also faceted into a finite number of straight segments rather than
        perfectly smooth; the segment count scales with size and focal length to keep
        faceting error negligible for realistic apertures, but an extremely fast mirror
        sampled too coarsely could show it.</p>`,
    },
    related: ['cmirror', 'cmirrorx', 'mirror'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Mirrors', url: 'https://www.rp-photonics.com/mirrors.html' },
    ],
  },

  {
    type: 'galvo',
    title: 'Galvo mirror',
    category: 'Mirrors',
    realWorld: {
      html: `
        <p>A galvanometer scanner ("galvo") is a small mirror mounted on a limited-rotation
        motor, used to steer a beam electronically instead of by hand — the core
        building block of laser scanning microscopes, laser marking and cutting systems,
        LiDAR, and laser light shows. Because reflection doubles an angle change, a small
        mechanical rotation produces twice as much angular deflection in the reflected
        beam:</p>`,
      formulas: [
        { tex: '\\theta_{\\text{beam}} = 2\\,\\theta_{\\text{mechanical}}', caption: 'The optical scan angle is always twice the mechanical mirror rotation — the same doubling that applies to any steering mirror.' },
      ],
      html2: `
        <p>Real galvo systems pair two mirrors on perpendicular axes (X and Y) to raster-
        or vector-scan a beam over a 2D field, and their achievable speed is limited by
        the mirror's rotational inertia — large, fast angular steps take longer to settle
        than small ones.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The galvo reflects rays with the same exact vector law of reflection as a
        plain mirror, but its surface angle is recomputed every frame from a configurable
        command: <em>Static</em> holds a fixed mechanical angle; <em>Sine</em> and
        <em>Triangle</em> continuously sweep it around that center at a set frequency and
        peak amplitude. In sweep mode the mirror actually rotates and the reflected beam
        visibly sweeps back and forth on its own — this is the one component in the
        library that animates continuously in real time, driven by its own clock rather
        than the pulse-timing playback controls used elsewhere.</p>`,
      formulas: [],
      limitations: `<p>The peak mechanical sweep is capped at 10°, and defaults to a
        modest 1° — enough to demonstrate scanning clearly without the swing dominating a
        sketch. There's no modeled inertia, bandwidth, or settling time: the mirror
        follows the commanded sine or triangle wave instantly and perfectly at any
        frequency, which a real galvo's mechanical response could not do.</p>`,
    },
    related: ['mirror', 'cmirror', 'cmirrorx'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Mirrors', url: 'https://www.rp-photonics.com/mirrors.html' },
      { label: 'RP Photonics Encyclopedia — Laser Beam Delivery', url: 'https://www.rp-photonics.com/laser_beam_delivery.html' },
    ],
  },

  {
    type: 'retroreflector',
    title: 'Retroreflector',
    category: 'Mirrors',
    realWorld: {
      html: `
        <p>A single flat mirror sends a ray back at whatever angle the law of reflection
        dictates — tilt the mirror even slightly and the returned beam walks off target. A
        <strong>corner retroreflector</strong> solves that by pairing two flat mirrors at
        exactly a right angle. Each bounce still obeys the ordinary law of reflection, but
        the composition of two perpendicular reflections has a special property: the
        outgoing ray is always exactly antiparallel to the incoming one, independent of
        the angle of incidence, for any ray that enters within the device's aperture.</p>
        <p>The three-dimensional version of this idea — three mutually perpendicular
        mirror facets meeting at a corner, called a <em>corner cube</em> — is why bicycle
        reflectors and road signs throw a car's headlights straight back at the driver
        regardless of the exact angle the light arrives from, and why the retroreflector
        arrays left on the Moon by the Apollo missions still return laser pulses fired
        from Earth decades later with sub-arcsecond alignment tolerance${cite(1, 2)}. The 2D version
        modeled here — two mirrors at 90°, sometimes called a "roof" or "porro" reflector
        — is the working element inside a Michelson interferometer arm that needs
        alignment-insensitive retroreflection, and inside mechanical delay lines: mounting
        one on a translation stage and sliding it changes the round-trip path length by
        twice the stage's travel, without ever needing to re-align the returned beam.</p>`,
      formulas: [
        { tex: "\\hat{d}' = -\\hat{d}", caption: 'The defining property of a corner retroreflector: the outgoing direction is exactly the negative of the incoming one, for any incidence angle within the aperture — unlike a single flat mirror, whose return direction depends on incidence angle.' },
        { tex: '\\Delta L = 2\\,\\Delta x', caption: 'Translating a retroreflector by Δx along its own axis changes the round-trip optical path by twice that distance — the basis of every retroreflecting mechanical delay line, from tabletop pulse stretchers to gravitational-wave interferometer arms.' },
      ],
    },
    inOpticalSetup: {
      html: `
        <p>The Retroreflector is built from the same two flat mirror surfaces, each
        obeying the exact vector law of reflection used by the plain <a
        href="../mirror/">mirror</a>, joined at a shared apex at exactly 90°. Ray tracing
        finds the first mirror hit, reflects it, then finds the second mirror hit and
        reflects again — two ordinary reflections, composed — which is enough for the
        antiparallel-return property to fall directly out of the vector reflection law
        rather than being special-cased.</p>
        <p>Its <strong>delay-line movement</strong> section adds an optional periodic
        motion: set to <em>Periodic linear</em>, the whole element slides back and forth
        along its own apex axis, rotation-aware, so it works at any angle you place it on
        the table. The motion always starts at the position you placed it — the shortest
        path — and moves only in the direction that adds path length, sweeping up to the
        configured travel range (50&nbsp;mm by default, up to 200&nbsp;mm) at the
        configured frequency, then back. Because it's a true retroreflector rather than
        an abstract path-length tag, this doubles as a physical model of a mechanical
        retroreflecting delay stage: moving it by Δx really does add 2Δx of round-trip
        path, computed from the actual traced geometry.</p>`,
      formulas: [],
      limitations: `<p>Reflectivity is a single flat percentage applied identically to
        both mirror surfaces, with the same caveats as the plain mirror: no angle- or
        polarization-dependence, and no wavelength-dependent coating behavior. The
        delay-line motion is an idealized triangle wave — no modeled stage inertia, servo
        settling time, or velocity ripple — and, like the piezo stage's scanning, it
        drives the traced geometry directly rather than a separate abstract path-length
        parameter.</p>`,
    },
    related: ['mirror', 'cmirror', 'cmirrorx', 'galvo'],
    citations: [
      { label: 'NASA — Retroreflectors from Apollo & Mars', url: 'https://www.nasa.gov/image-article/retroreflectors-from-apollo-mars/' },
      { label: 'Wikipedia — List of retroreflectors on the Moon', url: 'https://en.wikipedia.org/wiki/List_of_retroreflectors_on_the_Moon' },
    ],
    resources: [
      { label: 'RP Photonics Encyclopedia — Retroreflectors', url: 'https://www.rp-photonics.com/retroreflectors.html' },
    ],
  },
];
