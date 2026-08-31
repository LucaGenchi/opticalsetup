// Structured content for OpticalSetup's Examples pages. One entry per
// curated setup under Examples/**/*.json. tools/build-examples-pages.mjs
// turns this into static pages, matching each entry against
// sketch/js/examples-data.js by exact name (see `match` below) so a typo or
// a renamed/removed example file fails the build instead of silently
// shipping a stale or orphaned page.
//
// Not every example needs an entry here immediately — same rule as the
// wiki: a missing page just means main.js's Examples menu still works, it
// just doesn't get a public URL, references, or an "In OpticalSetup" style
// writeup yet. Add entries as new examples are curated.
//
// Citations: use `cite(n)` inline at the point a claim needs a source, e.g.
// `...invented by Ludwig Zehnder in 1891${cite(1)}.` The numbers are
// 1-indexed positions into that entry's own `citations` array. Use
// `resources` instead for general further-reading links not tied to one
// specific claim.
function cite(...nums) {
  return `<sup class="cite">[${nums.map(n => `<a href="#ref-${n}">${n}</a>`).join(',')}]</sup>`;
}

export const exampleEntries = [
  {
    match: 'Spherical aberration — ideal lens vs spherical singlet',
    title: 'Why a real lens has no focal point',
    tagline: 'One collimated bundle through an ideal lens and through a real N-BK7 singlet of the same focal length — a point against a 30 mm smear.',
    html: `
      <p>The lensmaker's equation gives a lens one focal length, and the thin-lens
      construction sends every ray through one point. Both are approximations that hold
      only near the axis. A real lens is bounded by spheres, and a sphere is the wrong
      shape: it bends a ray that strikes it far from the axis <em>too strongly</em>, so
      the rim of the lens focuses closer than the centre does.</p>
      <p>That is spherical aberration, and unlike chromatic aberration it does not go away
      with a single colour — it is there in monochromatic light, for a perfectly made lens,
      as a consequence of the shape alone. There is no plane anywhere along the axis where
      the light comes to a point. The best you get is the <em>circle of least confusion</em>,
      the plane where the blur is smallest.</p>`,
    inOpticalSetupTitle: 'What this setup demonstrates',
    inOpticalSetupHtml: `
      <p>Both rows start identically: a monochromatic point source at the front focus of a
      collimator, which turns it into a 90&nbsp;mm bundle of parallel rays. Only the lens
      under test differs, and both have the same focal length, so any difference is the
      shape of the glass and nothing else.</p>
      <p>The top row uses the idealised <code>lens</code> element. Every ray crosses the
      axis at exactly the same place, and the screen at that plane catches a point.</p>
      <p>The bottom row uses a real N-BK7 <code>thicklens</code> with the same power. The
      rays now cross the axis at five distinct places spread over 31&nbsp;mm: the rim
      focuses 31&nbsp;mm short of the paraxial focus, and the classic caustic opens up
      between the two. At the paraxial plane where the screen sits, that same light is
      spread over about 30&nbsp;mm. Even at its tightest, 24&nbsp;mm before the screen, the
      spot is still about 7&nbsp;mm across.</p>
      <p>Select the singlet and shrink its aperture — the blur collapses far faster than
      the aperture does, because the transverse blur grows as the cube of the ray height.
      That is the whole reason stopping a lens down sharpens the image, and why a fast lens
      is so much harder to build than a slow one. Bending the lens by making the two radii
      unequal at constant power also helps, and splitting the power over more surfaces
      helps most of all — which is what the lens-group element is for.</p>`,
    limitations: `<p>This singlet is deliberately fast — about f/1.3 — so the caustic is
      obvious at a glance; a normal f/8 lens would show a blur too small to see at this
      scale. The tracer samples ten rays, so the caustic is drawn as a handful of distinct
      crossings rather than the continuous surface it really is, and the drawing carries no
      information about how the energy is distributed within the blur: in a real spot most
      of the light piles up near the circle of least confusion rather than spreading evenly.
      Only spherical aberration is on show here — the bundle is on-axis, so coma,
      astigmatism, and field curvature never appear, and the single wavelength hides
      chromatic aberration entirely. Diffraction is not modelled at all, so the ideal lens
      focuses to a mathematical point rather than to an Airy disc.</p>`,
    citations: [],
    resources: [
      { label: 'RP Photonics Encyclopedia — Spherical Aberration', url: 'https://www.rp-photonics.com/spherical_aberrations.html' },
      { label: 'Thorlabs — Plano-Convex Lens Tutorial', url: 'https://www.thorlabs.com/n-bk7-plano-convex-lenses-uncoated?tabName=Tutorial' },
    ],
    related: ['lens', 'thicklens', 'lensgroup', 'pointsource'],
  },
  {
    match: 'Singlet vs achromat — axial colour',
    title: 'Singlet vs achromat — axial colour',
    tagline: 'Two 100 mm prescriptions under the same visible supercontinuum: the crown singlet separates colour while the crown–flint doublet brings it back together.',
    html: `
      <p>A single positive lens cannot focus every visible wavelength at the same
      axial position because optical-glass index changes with wavelength. Blue light
      generally sees more power than red light and therefore focuses closer to the
      lens. An achromatic doublet combines a low-dispersion crown element with a
      higher-dispersion flint element of opposing power, cancelling most of that
      first-order colour without cancelling the useful net focus.</p>
      <p>This side-by-side scene holds the comparison unusually clean: both lanes use
      the same 486.1–656.3&nbsp;nm source band, 24&nbsp;mm beam, clear aperture, and
      approximately 100&nbsp;mm effective focal length. Only the prescription changes.</p>`,
    inOpticalSetupTitle: 'What this setup demonstrates',
    inOpticalSetupHtml: `
      <p>The upper N-BK7 singlet produces about −1.53&nbsp;mm of F-to-C longitudinal
      colour. The lower N-BK7 + N-SF11 cemented achromat produces about
      −0.0003&nbsp;mm in the same model — roughly five thousand times less. That
      correction is not a display effect or an “achromat” flag: every sampled
      wavelength refracts through the drawn spherical faces with its own glass index,
      and the focus separation emerges from those interactions.</p>
      <p>Select either Lens group to inspect the actual surface rows. Editing any row
      makes a custom copy of the preset; the per-row action can then vary one radius to
      null the F-to-C readout while preserving a finite focal length of the same sign.</p>`,
    limitations: `<p>The comparison is a 2D meridional geometric trace. It shows
      longitudinal colour and spherical caustics, not diffraction-limited spot size,
      lateral colour, quantitative off-axis aberrations, coatings, manufacturing
      tolerances, or a full visible image. The near-zero F/C result does not mean every
      intermediate wavelength shares exactly one focus, and the catalogue glasses use
      visible-band Cauchy fits rather than full Sellmeier data.</p>`,
    citations: [],
    resources: [
      { label: 'RP Photonics Encyclopedia — Achromatic Optics', url: 'https://www.rp-photonics.com/achromatic_optics.html' },
    ],
    related: ['lensgroup', 'thicklens', 'sclaser'],
  },
  {
    match: 'Multiphoton microscope — SHG and two photon fluorescence',
    title: 'Multimodal multiphoton microscope',
    tagline: 'One femtosecond beam, two contrast mechanisms: second-harmonic generation for non-centrosymmetric structure and two-photon fluorescence for labelled molecules.',
    html: `
      <p>Multiphoton microscopy trades one photon of high energy for two of low energy
      arriving at essentially the same instant. Because the probability of that coincidence
      scales with the square of the instantaneous intensity, it happens at a useful rate
      only where the light is most concentrated — inside the focal volume — and nowhere
      else along the beam. Optical sectioning therefore comes for free: no pinhole is
      needed, because almost nothing outside the focus is excited in the first place. The
      long excitation wavelength also scatters less in tissue and is absorbed less by it,
      which is why multiphoton imaging reaches depths that confocal microscopy cannot.</p>
      <p>That nonlinearity is also why the source has to be a femtosecond laser. What
      matters is peak intensity, and for fixed average power the peak scales inversely with
      pulse duration: compressing 1&nbsp;ns of energy into 150&nbsp;fs raises the peak by
      four orders of magnitude, generating signal at powers a sample can survive. An 80
      MHz train delivers a pulse every 12.5&nbsp;ns, fast enough to dwell on each pixel for
      many pulses while letting excited states relax in between.</p>
      <p>Two different nonlinear processes are available at once, and they report on
      different things:</p>
      <ul>
        <li><strong>Second-harmonic generation</strong> is a coherent, energy-conserving
        conversion of two photons into one at exactly half the wavelength. It is forbidden
        in any material with a centre of symmetry, so it appears only where the structure
        itself is non-centrosymmetric and ordered — collagen, myosin, microtubules,
        actin-rich structures. No label is involved and no energy is deposited, so it is
        both endogenous and gentle.</li>
        <li><strong>Two-photon excited fluorescence</strong> is an absorptive process: the
        molecule really is promoted to an excited state and re-emits after relaxing, so the
        emission is incoherent, Stokes-shifted, and broad. It reports on whatever is
        labelled — GFP and its relatives are the workhorses.</li>
      </ul>
      <p>Around 920&nbsp;nm is a good compromise between the two: it drives two-photon
      excitation of GFP efficiently while putting the second harmonic at 460&nbsp;nm, clear
      of the fluorescence band and easy to separate with a narrow bandpass.</p>`,
    inOpticalSetupTitle: 'What this setup demonstrates',
    inOpticalSetupHtml: `
      <p>A complete beam path from source to detectors: a 920&nbsp;nm, 150&nbsp;fs,
      80&nbsp;MHz laser, a half-wave plate and polarizer for power control, alignment
      mirrors, a galvanometer pair for scanning, and a scan lens and tube lens relaying the
      scan mirrors to the objective's back pupil.</p>
      <p>The sample is a nonlinear specimen carrying two channels, SHG and GFP two-photon
      fluorescence, and the microscope collects both on either side of it:</p>
      <ul>
        <li><strong>Forward</strong> — the second harmonic is collected by the condenser
        objective, separated from the excitation by a short-pass dichroic, and isolated by
        a 460/20&nbsp;nm bandpass onto a PMT. Selecting that PMT shows a signal at exactly
        460&nbsp;nm: half of 920, as second-harmonic generation requires. A camera on the
        same forward path records the transmitted 920&nbsp;nm excitation.</li>
        <li><strong>Epi</strong> — fluorescence is collected back through the excitation
        objective, reflected off the short-pass dichroic, and read by a second PMT. This
        one reports around 507&nbsp;nm across a 484–530&nbsp;nm band: GFP emission, not a
        harmonic of anything. Epi-collection is the practical choice for fluorescence in
        thick tissue, where scattered emission is recovered but forward transmission is
        not.</li>
      </ul>
      <p>The two channels are distinguishable by their spectra alone, which is the point:
      one narrow line locked to exactly half the excitation wavelength, one broad
      Stokes-shifted band that moves with the fluorophore rather than with the laser.</p>`,
    limitations: `<p>The nonlinear signals are generated by the sample element as
      configured channels with a set conversion efficiency, not computed from a
      susceptibility, an intensity, or a focal volume — so doubling the power does not
      quadruple the SHG here as it would on a bench. The excitation is traced
      geometrically, so the focal spot is a ray crossing rather than a diffraction-limited
      volume, and the optical sectioning that defines multiphoton microscopy is implied by
      the geometry rather than computed. Emission is launched into a fixed set of rays
      rather than the full 4π of a real fluorophore, and photobleaching, saturation, and
      the pulse broadening the excitation would really suffer through the objective are not
      modelled. The galvanometers are shown static; the scan relay is drawn correctly but
      the image is not formed.</p>`,
    citations: [],
    resources: [
      { label: 'RP Photonics Encyclopedia — Multiphoton Microscopy', url: 'https://www.rp-photonics.com/multiphoton_microscopy.html' },
      { label: 'RP Photonics Encyclopedia — Second-Harmonic Generation', url: 'https://www.rp-photonics.com/frequency_doubling.html' },
    ],
    related: ['pulsedlaser', 'objective', 'sample', 'galvo', 'pmt', 'dichroic'],
  },
  {
    match: 'Coherent Raman microscope — SRS and CARS',
    title: 'Coherent Raman microscope',
    tagline: 'Two synchronised picosecond beams beating at a molecular vibration, read out three ways: stimulated Raman loss, forward CARS, and epi-CARS.',
    html: `
      <p>Spontaneous Raman scattering identifies molecules by their vibrational
      frequencies without any label at all, but it is desperately weak — perhaps one photon
      in ten million — which makes it far too slow for imaging. Coherent Raman techniques
      fix that by driving the vibration rather than waiting for it. Two beams, a
      <strong>pump</strong> and a <strong>Stokes</strong>, are overlapped in space and
      time; when their frequency difference matches a Raman-active vibration, they beat at
      exactly that frequency and drive the whole ensemble of molecules in phase. The signal
      that follows is coherent and can be orders of magnitude stronger than the
      spontaneous one.</p>
      <p>Which vibration is addressed is set entirely by the difference between the two
      wavelengths, so tuning one beam sweeps the spectrum. Written as wavenumbers, the
      vibration addressed is simply the difference of the two beams' reciprocal
      wavelengths, and the anti-Stokes light that CARS produces appears at
      2/λ<sub>pump</sub> − 1/λ<sub>Stokes</sub> — shorter than either input, which is what
      makes it separable by a filter rather than by lock-in detection.</p>`,
    inOpticalSetupTitle: 'What this setup demonstrates',
    inOpticalSetupHtml: `
      <p>Two synchronised picosecond sources: a tunable pump, drawn at 780&nbsp;nm and
      tunable across 750–950&nbsp;nm, and a fixed 1030&nbsp;nm Stokes. Picosecond rather
      than femtosecond pulses are the deliberate choice here — their narrower bandwidth
      matches the width of a Raman line, giving chemical selectivity that a femtosecond
      pulse would wash out by driving many vibrations at once.</p>
      <p>At 780 and 1030&nbsp;nm the pair addresses a vibration near
      3100&nbsp;cm⁻¹; retuning the pump moves that anywhere across the fingerprint and
      CH-stretch regions. A retroreflector delay line on the pump arm sets the temporal
      overlap the whole technique depends on — without it the two pulses simply miss each
      other — and a short-pass dichroic recombines the beams before the scanner.</p>
      <p>The setup reads the interaction out in three independent ways:</p>
      <ul>
        <li><strong>Stimulated Raman loss.</strong> An electro-optic modulator and polarizer
        impose a 20&nbsp;MHz intensity modulation on the <em>Stokes</em> beam. Where the
        vibration is driven, energy transfers from pump to Stokes, so the <em>pump</em>
        comes out slightly depleted and carries that 20&nbsp;MHz modulation as a
        copy. The SRS channel therefore sits at 780&nbsp;nm — the pump — and a beamsplitter
        picks off part of the modulated 1030&nbsp;nm Stokes onto a second detector as the
        reference. Moving the modulation onto one beam and detecting it on the other is what
        lifts a signal of one part in ten thousand out of the laser noise.</li>
        <li><strong>Forward CARS.</strong> The same driven vibration also radiates a new
        anti-Stokes beam. Selecting the CARS channel shows 628&nbsp;nm, which is exactly
        where 2/λ<sub>pump</sub> − 1/λ<sub>Stokes</sub> puts it — blue-shifted of both
        inputs, which is why it can be separated from them by filtering alone.</li>
        <li><strong>Epi-CARS.</strong> A second PMT collects the backward-radiated fraction
        through the excitation objective. It reads the same 628&nbsp;nm at a much smaller
        amplitude, because CARS is a coherent process that phase-matches strongly in the
        forward direction; what returns backwards comes from small or interface-like
        structures, which is exactly what makes the epi channel informative rather than
        redundant.</li>
      </ul>
      <p>Comparing the two mechanisms in one setup is the real lesson. SRS is a change in a
      beam you already have, so it scales linearly with concentration and carries no
      non-resonant background; CARS is a new colour you can filter for cleanly, but sits on
      a non-resonant background that distorts its lineshape.</p>`,
    limitations: `<p>The Raman interaction is not computed. The sample generates its CARS
      and SRS channels as configured signals with set efficiencies, so nothing here derives
      a lineshape from a susceptibility, and the non-resonant background that complicates
      real CARS is absent. Retuning the pump changes the anti-Stokes wavelength through the
      energy relation, but no vibrational resonance is modelled, so the signal does not
      rise and fall as you tune across a line. Temporal overlap is likewise not enforced:
      the delay line is drawn and is physically meaningful, but mistiming the two pulses
      will not extinguish the signal the way it would on a bench. The 20&nbsp;MHz
      modulation is applied to the beam and detected, but no lock-in demodulation happens,
      and the shot-noise-limited sensitivity that makes SRS work in practice is outside
      what a ray tracer can express.</p>`,
    citations: [],
    resources: [
      { label: 'RP Photonics Encyclopedia — Raman Scattering', url: 'https://www.rp-photonics.com/raman_scattering.html' },
      { label: 'RP Photonics Encyclopedia — Coherent Anti-Stokes Raman Scattering', url: 'https://www.rp-photonics.com/coherent_anti_stokes_raman_scattering.html' },
    ],
    related: ['pulsedlaser', 'eom', 'retroreflector', 'objective', 'sample', 'pmt'],
  },
  {
    match: 'Michelson interferometer',
    title: 'Michelson interferometer',
    tagline: 'One beamsplitter, two mirror arms, one recombined output — the interferometer behind the Michelson–Morley experiment and, scaled up four kilometers, LIGO.',
    html: `
      <p>A beamsplitter divides an incoming beam into two arms, each terminated
      by a mirror that reflects it straight back. Both reflected beams retrace
      their outbound path and recombine at the very same beamsplitter,
      producing two output beams whose relative intensity depends on the
      optical path difference between the two arms. Albert Michelson built the
      first version in 1881 and, with Edward Morley, refined it into the
      famous 1887 experiment that searched for Earth's motion through the
      hypothesized luminiferous ether — and found none, a null result that
      helped motivate special relativity${cite(1)}.</p>
      <p>The same geometry, scaled to 4&nbsp;km arms and stabilized to a
      fraction of a proton's width, is what LIGO uses to detect gravitational
      waves: a passing wave stretches one arm and compresses the other by an
      almost unimaginably small amount, which shows up as a shift in the
      recombined interference pattern${cite(2)}. At the tabletop scale, the
      same layout is a standard tool for measuring small displacements,
      testing optical flats, and — with a scanning mirror — for
      Fourier-transform spectroscopy.</p>`,
    inOpticalSetupTitle: 'What this setup demonstrates',
    inOpticalSetupHtml: `
      <p>This example places one laser, one beamsplitter, and two mirrors in
      exactly the Michelson topology: the beam splits at the beamsplitter,
      each half reflects off its own mirror, and both return to recombine at
      the same beamsplitter into two output directions, each read by a
      detector. Every reflection and split follows the same exact vector
      geometry used throughout OpticalSetup — moving either mirror changes
      the traced ray paths precisely, the way moving a real mirror would.</p>`,
    limitations: `<p>This particular scene keeps a line source and a scalar
      photodetector, so it remains a geometry lesson rather than an
      interferometric readout. OpticalSetup's bounded coherent model is
      limited to sized monochromatic CW beams. Switching the source to beam
      mode can expose supported flat-mirror/beamsplitter path interference,
      but the app still does not
      model diffraction, surface figure, vibration, coherence length, or a
      laboratory detector response.</p>`,
    citations: [
      { label: 'Michelson & Morley, "On the Relative Motion of the Earth and the Luminiferous Ether," American Journal of Science (1887)', url: 'https://en.wikipedia.org/wiki/Michelson%E2%80%93Morley_experiment' },
      { label: 'LIGO Scientific Collaboration — how LIGO works', url: 'https://www.ligo.caltech.edu/page/what-is-ligo' },
    ],
    resources: [
      { label: 'RP Photonics Encyclopedia — Michelson Interferometers', url: 'https://www.rp-photonics.com/michelson_interferometers.html' },
    ],
    related: ['bs', 'mirror', 'detector'],
  },
  {
    match: 'Mach–Zehnder interferometer',
    title: 'Mach–Zehnder interferometer',
    tagline: 'Two beamsplitters, two fully separate arms, two output ports — the workhorse interferometer behind flow visualization, quantum-eraser experiments, and on-chip optical modulators.',
    html: `
      <p>Where a Michelson interferometer sends both arms back through the
      same beamsplitter, a Mach–Zehnder interferometer uses two: the first
      splits the beam onto two completely separate paths, each folded once by
      a mirror, and the second recombines them into two spatially distinct
      output ports. Because each arm is traversed only once — no
      retroreflection — the two arms can be made physically very different in
      length or content, which is exactly what makes the layout useful.
      Ludwig Zehnder proposed it in 1891 and Ludwig Mach refined it in
      1892${cite(1)}.</p>
      <p>Putting anything that shifts phase or path length in one arm — a
      flame, a gas flow, a transparent sample, a voltage-driven phase
      modulator — changes how the two arms recombine, so a Mach–Zehnder
      interferometer converts an invisible phase difference into a visible
      intensity difference between its two outputs. That principle shows up
      at wildly different scales: wind-tunnel schlieren imaging of density
      gradients, single-photon "quantum eraser" experiments in quantum optics,
      and — as a microscopic waveguide pair on a chip — the Mach–Zehnder
      modulator that encodes data onto light in most fiber-optic
      telecommunications hardware${cite(2)}.</p>`,
    inOpticalSetupTitle: 'What this setup demonstrates',
    inOpticalSetupHtml: `
      <p>This example places one laser and two beamsplitters at the corners of
      the classic Mach–Zehnder diamond, with a mirror folding each of the two
      separate arms, recombining at the second beamsplitter onto two cameras.
      Both arms are genuinely separate ray paths through the scene — move a
      mirror on one arm and only that arm's traced path changes, exactly as
      it would on a real bench. The two linked screens show complementary
      camera outputs: equal arms make one port bright and the other dark.
      Entering half a wavelength in the ΔL arm (0.000266&nbsp;mm at
      532&nbsp;nm) swaps them.</p>`,
    limitations: `<p>The tracer combines only phase-valid routes from this
      sized monochromatic CW laser. Optical path, 100%-reflective flat-mirror phase,
      and a unitary non-polarizing beamsplitter phase are represented. Compatible
      fields are grouped at the second beamsplitter before the output beams are drawn;
      a camera additionally integrates any remaining cross terms over its finite 1D
      pixels. This is not a
      general wave-optics solver: diffraction, coherence length, vibration,
      surface figure, and 2D sensor response are absent. Putting an optic
      whose carrier phase is not modeled in either arm makes the tracer fall
      back to conservative deposited intensity instead of inventing a
      fringe.</p>`,
    citations: [
      { label: 'Wikipedia — Mach–Zehnder interferometer (history and applications)', url: 'https://en.wikipedia.org/wiki/Mach%E2%80%93Zehnder_interferometer' },
      { label: 'RP Photonics Encyclopedia — Interferometers (Mach–Zehnder section)', url: 'https://www.rp-photonics.com/interferometers.html' },
    ],
    resources: [],
    related: ['bs', 'mirror', 'camera', 'delayline'],
  },
  {
    match: 'Ultrashort pulse chirping',
    title: 'Ultrashort pulse chirping',
    tagline: 'The same 150 fs pulse measured three ways — bare, chirped by 100 mm of dense flint, and recompressed — each on its own autocorrelator.',
    html: `
      <p>A transform-limited pulse is the shortest envelope its spectrum allows: every
      frequency component arrives in phase. Glass takes that away. Because the refractive
      index varies with wavelength, the blue components travel slower than the red ones,
      so the pulse leaves the glass <em>chirped</em> — its colours strung out in time —
      and therefore longer, even though nothing about its spectrum has changed and its ray
      still runs dead straight.</p>
      <p>The quantity that governs this is the group delay dispersion, the second
      derivative of spectral phase. It accumulates along the path, adds up over every piece
      of glass, and can be undone by anything supplying the opposite sign.</p>`,
    inOpticalSetupTitle: 'What this setup demonstrates',
    inOpticalSetupHtml: `
      <p>Three identical 150&nbsp;fs, 532&nbsp;nm Gaussian sources, each measured by its
      own autocorrelator wired to a detector screen.</p>
      <p>The first arm has nothing in the beam and reads 150&nbsp;fs — the reference. The
      second passes through 100&nbsp;mm of N-SF11, a dense flint whose GVD at 532&nbsp;nm
      is about 387&nbsp;fs²/mm: roughly +38&nbsp;680&nbsp;fs² in total, stretching the pulse
      to about 731&nbsp;fs, nearly five times longer. The third adds a compressor set to
      −38&nbsp;680&nbsp;fs², which cancels the glass exactly and returns the measurement to
      150&nbsp;fs.</p>
      <p>Each screen shows what an autocorrelator actually produces: delay on the horizontal
      axis rather than laboratory time, the self-convolution of the pulse envelope, the
      half-maximum chord that constitutes the measurement, and the duration inferred by
      dividing out the shape factor (√2 for a Gaussian). Change the assumed shape on any
      autocorrelator and it will tell you how far wrong that assumption puts the answer.</p>
      <p>Wavelength matters as much as path length here: the same rod at 800&nbsp;nm
      contributes only about 18&nbsp;750&nbsp;fs², because N-SF11's GVD falls steeply toward
      the infrared. Retune the sources and watch all three traces change together.</p>`,
    limitations: `<p>Only second-order dispersion is modelled. Real glass also has
      third-order and higher terms that reshape a pulse asymmetrically rather than simply
      widening it, and a real compressor is a grating, prism, or chirped-mirror assembly
      with its own higher-order dispersion, loss, and alignment sensitivity rather than a
      single signed number. The pulse is assumed to enter transform-limited; an input chirp
      would add to or subtract from the glass instead of simply being stretched by it. The
      autocorrelation curve is drawn from the inferred duration, not from a simulated
      scanning measurement, and absorption in the glass is not modelled at all.</p>`,
    citations: [],
    resources: [
      { label: 'RP Photonics Encyclopedia — Group Delay Dispersion', url: 'https://www.rp-photonics.com/group_delay_dispersion.html' },
      { label: 'RP Photonics Encyclopedia — Optical Autocorrelators', url: 'https://www.rp-photonics.com/autocorrelators.html' },
    ],
    related: ['pulsedlaser', 'glassrod', 'pulsecompressor', 'autocorrelator'],
  },
  {
    match: 'OPTICAL SETUP — pulsed component panorama',
    title: 'OPTICAL SETUP — pulsed component panorama',
    tagline: "OpticalSetup's own flagship demo: the words \"OPTICAL SETUP\" traced entirely in live pulsed light, exercising nearly every category in the component library.",
    html: `
      <p>This one isn't a recreation of a textbook or laboratory setup — it's
      a self-referential showcase built to put as much of the component
      library on screen at once as a single readable scene allows. Every
      visible letter stroke is a real traced beam path, not a drawn shape:
      acousto-optic and electro-optic modulators, a chopper, a nonlinear
      crystal, a mechanical delay line, dichroics and filters, a grating,
      waveplates, an isolator, an objective, a polarizing beamsplitter, a
      PMT, polarizers, a specimen and its stage, a spatial light modulator,
      and a supercontinuum laser all contribute strokes — including one
      letter, the "U," that is carried by an actual propagating fiber path
      rather than a free-space beam.</p>`,
    inOpticalSetupTitle: 'What this setup demonstrates',
    inOpticalSetupHtml: `
      <p>Select any component in the embedded canvas below to inspect its
      live parameters and its capability badge — simulated, needs setup, or
      diagram-only — the same three-way distinction used everywhere in
      OpticalSetup. Because pulsed timing drives the animation, the scene
      also doubles as a stress test of the pulse-timing overlay across very
      different component types at once: modulators gating in time, a
      mechanical delay line adding path length, and a fiber carrying a pulse
      train through a completely different rendering path than a free-space
      beam.</p>`,
    limitations: `<p>Because this scene exists to showcase breadth rather than
      to teach one physical setup, treat individual component behavior as the
      subject — for the physics and simplifications behind any single
      component visible here, follow the related links below to its wiki
      page rather than reading this scene as a coherent experiment.</p>`,
    citations: [],
    resources: [],
    related: ['aom', 'grating', 'dichroic', 'polarizer', 'objective'],
  },
];
