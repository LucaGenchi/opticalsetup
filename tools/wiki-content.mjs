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
    type: 'laser',
    title: 'Laser',
    category: 'Sources',
    realWorld: {
      html: `
        <p>Laser technology occupies a central position within photonics because laser
        light exhibits several properties that distinguish it from conventional light
        sources, beyond simple monochromaticity. A laser beam is characterized by high
        spatial coherence, which permits propagation over considerable distances with
        minimal divergence — frequently limited only by diffraction — and allows the beam
        to be focused to a very small spot, yielding a correspondingly high intensity.</p>
        <p>This coherence typically extends to the temporal domain as well: most lasers
        emit within a very narrow spectral bandwidth, in contrast to sources such as
        incandescent or gas-discharge lamps, which radiate across a broad spectral range.
        An exception exists among ultrafast lasers, several of which are inherently
        broadband, since a sufficiently short pulse duration necessarily corresponds to a
        correspondingly broad frequency spectrum.</p>
        <p>Laser emission may be continuous or pulsed, with pulse durations ranging from
        microseconds down to a few femtoseconds. Concentrating a given pulse energy into a
        shorter duration — in addition to spatial concentration at a focus — enables
        substantially higher intensities than continuous-wave operation can achieve; the
        most extreme intensities produced this way are employed in high-field physics.</p>
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
        <p>The Laser element emits either a single collimated ray or, in <em>Beam with
        size</em> mode, a fan of 25 parallel rays sampling a finite beam width — this is
        what lets the tracer show a lens actually focusing a beam of nonzero extent,
        rather than a single infinitesimal ray that can never miss an aperture.</p>
        <p>Spectrum is monochromatic, broadband (a symmetric bandwidth around the center
        wavelength), or supercontinuum (a fixed 430–870&nbsp;nm white-light band) — dispersive
        elements downstream (prisms, gratings) sample this band at several discrete
        wavelengths and fan them out individually. Pulsed mode adds a repetition rate and
        pulse duration that drive the timing overlay; polarization is set directly as a
        Stokes vector rather than emerging from a modeled cavity.</p>`,
      formulas: [],
      limitations: `<p>There is no modeled gain medium, cavity round trip, or threshold —
        wavelength, spectrum, polarization, and pulse timing are configured directly as
        source parameters, not derived from first principles. Divergence and M² are not
        modeled: a collimated beam stays perfectly parallel over any distance.</p>`,
    },
    related: ['sclaser', 'pointsource', 'mirror'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Lasers', url: 'https://www.rp-photonics.com/lasers.html' },
      { label: 'RP Photonics Encyclopedia — Laser Light', url: 'https://www.rp-photonics.com/laser_light.html' },
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
        aberration, finite lens thickness, and any behavior for rays far from the axis or
        at large angles.</p>`,
    },
    related: ['lensc', 'telescope', 'objective', 'cmirror'],
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
      limitations: `<p>Same caveats as the convex lens: exact paraxial optics with no
        spherical or chromatic aberration, and no modeled lens thickness.</p>`,
    },
    related: ['lens', 'telescope', 'objective'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Lenses', url: 'https://www.rp-photonics.com/lenses.html' },
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
        geometry and magnification.</p>`,
    },
    related: ['lens', 'lensc', 'objective'],
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
        { tex: 'd \\approx \\frac{\\lambda}{2\\,\\mathrm{NA}}', caption: "The Abbe diffraction limit — the smallest resolvable feature size, set by wavelength and numerical aperture alone." },
        { tex: 'r_{\\text{BFP}} \\approx f \\cdot \\mathrm{NA}', caption: "Entrance-pupil radius at the back focal plane, for a well-corrected objective (the Abbe sine condition)." },
        { tex: 'M = \\frac{f_{\\text{tube}}}{f_{\\text{objective}}}', caption: "Magnification of an infinity-corrected objective, set purely by comparing its focal length to the tube lens's." },
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
        (60×, 100×) has a very short focal length — often just a couple of millimeters —
        paired with a long tube lens, and trades that magnification for a short working
        distance and a narrow field of view. A <strong>stereomicroscope</strong> sits at
        the opposite end on purpose: its objective (shared or paired, one per eye) has a
        comparatively long focal length, giving low-to-moderate magnification, a wide
        field of view, and — critically for a dissecting scope — enough physical working
        distance to actually get hands or tools under the lens. Zoom stereomicroscopes
        vary magnification with a separate afocal zoom system in between, but the same
        rule holds at any zoom setting: a shorter effective objective focal length always
        means higher magnification and a smaller field of view, at the cost of working
        distance.</p>`,
    },
    inOpticalSetup: {
      html: `
        <p>Optically this is the same single thin-lens surface as the plain
        <a href="../lens/">lens</a> element, using the same paraxial ray-transfer
        relation <span class="w">u' = u − h/f</span> at the lens plane marked by the
        housing's flat front glass — just with a short default focal length and a drawn
        clear aperture typical of a real objective. What's modeled precisely, though, is
        <em>where the back focal plane actually sits</em>: toggle "Show focal points"
        (the <span class="w">ƒ</span> button) or select the objective, and a marker
        labeled <span class="w">BFP</span> appears exactly <span class="w">f</span>
        behind the lens plane, on the side the beam arrives from — the real coordinate to
        position (or image, via a <a href="../telescope/">telescope</a>) a scan mirror
        onto for correct pupil-matched scanning, not just an illustrative icon.</p>`,
      formulas: [],
      limitations: `<p>The BFP's <em>position</em> is geometrically exact for this
        thin-lens model, but its <em>size</em> is not modeled — there's no numerical
        aperture parameter, so the pupil radius formula above isn't computed or enforced
        anywhere, and no aberration correction, immersion media, or field-flatness
        limits exist either. It's a single idealized thin lens wearing an objective's
        housing, with one genuinely precise feature: the BFP marker's location. There's
        also no separate tube lens or reported magnification number — changing
        <span class="w">f</span> changes how tightly the element focuses, which is the
        real effect behind the magnification formula above, but OpticalSetup never
        computes or displays a magnification value.</p>`,
    },
    related: ['lens', 'telescope'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Microscope Objectives', url: 'https://www.rp-photonics.com/microscope_objectives.html' },
      { label: 'RP Photonics Encyclopedia — Numerical Aperture', url: 'https://www.rp-photonics.com/numerical_aperture.html' },
    ],
  },

  {
    type: 'prism',
    title: 'Prism',
    category: 'Dispersive & Apertures',
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
        index, so the beam visibly fans into a spectrum.</p>`,
      formulas: [
        { tex: 'n(\\lambda) = 1.5046 + \\frac{4680}{\\lambda^{2}} \\quad (\\lambda \\text{ in nm})', caption: 'The dispersion curve used for the built-in "BK7-like" glass — a compact two-term approximation, not the real 3-term BK7 Sellmeier equation.' },
      ],
      limitations: `<p>The dispersion formula above is a deliberately simplified stand-in
        for real BK7 glass, tuned to give the right qualitative shape (more bending at
        blue wavelengths, less at red) rather than matching a real glass catalog to
        several decimal places. Only one glass "family" is modeled; there's no coating,
        absorption, or surface-quality loss beyond the configured per-face transmission.</p>`,
    },
    related: ['grating', 'glassrod', 'freeglass', 'dichroic'],
    resources: [
      { label: 'RP Photonics Encyclopedia — Prisms', url: 'https://www.rp-photonics.com/prisms.html' },
    ],
  },

  {
    type: 'grating',
    title: 'Diffraction grating',
    category: 'Dispersive & Apertures',
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
