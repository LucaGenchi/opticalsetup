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
        beam described above.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>The CW Laser emits either a single collimated ray or, in <em>Beam with
        size</em> mode, a fan of 25 parallel rays sampling a finite beam width — this is
        what lets the tracer show a lens actually focusing a beam of nonzero extent,
        rather than a single infinitesimal ray that can never miss an aperture.</p>
        <p>Its spectrum is monochromatic by construction: one wavelength, no bandwidth
        control. That is the whole point of the split between the three laser sources —
        if a bench needs spectral width, it needs the Pulsed Laser or the Supercontinuum
        laser instead, both of which model where that width comes from. Polarization is
        set directly as a Stokes vector rather than emerging from a modeled cavity.</p>`,
      formulas: [],
      limitations: `<p>There is no modeled gain medium, cavity round trip, or threshold —
        wavelength, polarization, and power are configured directly as source parameters,
        not derived from first principles. Divergence and M² are not modeled: a collimated
        beam stays perfectly parallel over any distance.</p>`,
    },
    related: ['pulsedlaser', 'sclaser', 'pointsource', 'mirror'],
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
    related: ['lensc', 'thicklens', 'telescope', 'objective', 'cmirror'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Lenses', url: 'https://www.rp-photonics.com/lenses.html' },
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
    related: ['lens', 'thicklens', 'telescope', 'objective'],
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
        Working distance, meanwhile, is a separate catalogue dimension bounded by the focal
        length: the specimen plane sits one focal length from the principal plane, and the
        glass between the front element and the sample takes up the difference, so working
        distance is always shorter than EFL.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>An objective here is set by three things you would read off a real catalogue —
        <strong>effective focal length (EFL)</strong>, <strong>working distance</strong>,
        and <strong>rated NA</strong> — plus the front aperture that controls how big the
        nose is drawn. EFL is the focal length of the whole multi-element assembly treated
        as one equivalent lens, which is what "focal length" means on an objective; the
        inspector label spells that out. Magnification is not something you type in. It is <em>reported</em> from the EFL against a 200&nbsp;mm reference
        tube lens, because magnification belongs to the objective plus whichever tube lens
        you actually place in the sketch, not to the objective alone. A fresh objective is
        EFL 10&nbsp;mm — 20× on a 200&nbsp;mm tube lens — dry, NA 0.65, 100% transmission.</p>

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
        <p>Working distance is capped at EFL, and defaults to it. A real objective focuses
        at or inside its own focal length, with the glass taking up the difference; the cap
        also keeps the equivalent plane at or behind the front tip, inside the barrel, which
        is where a real objective's principal plane and pupil sit. Nothing is drawn there —
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

        <h3>Handles and markers</h3>
        <p>The purple tune control changes EFL and the blue resize handle changes the front
        aperture. Editing working distance moves the refracting plane without touching EFL or
        the reported magnification; raising EFL leaves an already-configured working distance
        alone, while lowering EFL past it carries the working distance down with it. Toggle
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
        Working distance is a saved property bounded only by EFL, not a value predicted by
        magnification, NA, or immersion medium: a real catalogue pairs them through the
        internal design, and OpticalSetup deliberately lets you keep a visible working
        distance on a high-power objective so the sketch stays readable — a real 60&times;
        oil objective works at a few tenths of a millimetre, which would be invisible here. The equivalent lens plane and the
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
    related: ['aotf', 'eom', 'chopper', 'delayline'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Acousto-optic Modulators', url: 'https://www.rp-photonics.com/acousto_optic_modulators.html' },
    ],
  },

  {
    type: 'detector',
    title: 'Photodetector',
    category: 'Detectors',
    realWorld: {
      html: `
        <p>A real photodetector converts incident optical power to an electrical
        photocurrent with some responsivity <span class="w">R</span> (amps per watt),
        set by the detector's quantum efficiency <span class="w">η</span> — the fraction
        of incident photons that produce a collected charge carrier:</p>`,
      formulas: [
        { tex: 'R = \\frac{\\eta e}{h\\nu} \\quad [\\text{A/W}]', caption: 'Responsivity of an ideal photodetector at optical frequency ν.' },
      ],
    },
    inOpticalSetup: {
      html: `
        <p>The detector reports a <em>qualitative</em> relative signal — the sum of every
        ray's intensity reaching its front face — plus the spectrum, polarization state,
        and spot extent of whatever light arrives, all read directly off the traced rays.
        This is genuinely useful for seeing <em>whether</em> light reaches a detector,
        roughly how strong it is relative to other configurations, and what its spectral
        or polarization content is.</p>`,
      formulas: [],
      limitations: `<p>The reported signal is not calibrated to any real unit — there is
        no watts-in, amps-out responsivity curve, no dark current, no saturation physics
        beyond what's explicitly modeled on the PMT variant. Treat the number as relative,
        not absolute.</p>`,
    },
    related: ['pmt', 'camera', 'eye'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Photodetectors', url: 'https://www.rp-photonics.com/photodetectors.html' },
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
