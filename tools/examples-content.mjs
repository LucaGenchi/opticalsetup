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
    limitations: `<p>What you won't see is the actual interferometric signal.
      OpticalSetup's ray tracer has no coherent phase or wavelength-scale path
      tracking — see the app's stated simulation scope — so the two
      recombined beams simply overlap geometrically rather than showing the
      fringes, visibility, or intensity-vs-path-difference curve that make a
      real Michelson interferometer useful as a measurement instrument. This
      setup teaches the beam geometry a Michelson interferometer relies on,
      not its interferometric readout.</p>`,
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
      separate arms, recombining at the second beamsplitter onto a detector.
      Both arms are genuinely separate ray paths through the scene — move a
      mirror on one arm and only that arm's traced path changes, exactly as
      it would on a real bench.</p>`,
    limitations: `<p>As with the Michelson example, the missing piece is
      coherent interference: OpticalSetup traces ray geometry and intensity,
      not phase, so the two arms recombine without producing the
      fringe-contrast or intensity-vs-phase-difference signal that is the
      entire point of a real Mach–Zehnder interferometer. Placing something
      "in one arm" here changes the traced beam (blocking it, attenuating it,
      shifting its color), but it won't show up as an interference fringe at
      the output the way it would on an optical bench.</p>`,
    citations: [
      { label: 'Wikipedia — Mach–Zehnder interferometer (history and applications)', url: 'https://en.wikipedia.org/wiki/Mach%E2%80%93Zehnder_interferometer' },
      { label: 'RP Photonics Encyclopedia — Interferometers (Mach–Zehnder section)', url: 'https://www.rp-photonics.com/interferometers.html' },
    ],
    resources: [],
    related: ['bs', 'mirror', 'detector'],
  },
  {
    match: 'Pulse stretcher and compressor',
    title: 'Pulse stretcher and compressor',
    tagline: 'Watch a 50 fs Gaussian pulse broaden through fused silica, then contract when a signed-GDD compressor cancels the glass dispersion.',
    html: `
      <p>A transform-limited ultrashort pulse contains a broad range of frequencies whose
      phases line up to form one short temporal envelope. Fused silica has positive GVD
      around 800&nbsp;nm, so those frequencies acquire different group delays as the pulse
      propagates. The accumulated GDD chirps and lengthens the pulse even though its
      geometric ray continues along the same straight path.</p>
      <p>A compressor supplies the opposite spectral-phase curvature. When its negative
      GDD matches the positive GDD of the glass, the net second-order dispersion returns
      to zero and an ideal Gaussian pulse returns to its transform-limited duration.</p>`,
    inOpticalSetupTitle: 'What this setup demonstrates',
    inOpticalSetupHtml: `
      <p>The example sends a 50&nbsp;fs, 800&nbsp;nm Gaussian pulse through 50&nbsp;mm of
      fused silica, which contributes about +1808&nbsp;fs² and broadens the second-order
      duration to about 112&nbsp;fs. The following Pulse Compressor applies −1808&nbsp;fs²,
      returning net GDD and the detector duration to approximately zero and 50&nbsp;fs.
      During playback, the moving packet grows inside and after the rod, then visibly
      contracts after the compressor.</p>`,
    limitations: `<p>The compressor is an adjustable lumped-GDD proxy. A real grating,
      prism, or chirped-mirror compressor also has higher-order dispersion, loss, alignment
      sensitivity, and potentially spatial chirp. The packet drawing is a qualitative
      duration glyph capped at 8× its source length; use the detector for the unclamped
      numerical duration and GDD.</p>`,
    citations: [],
    resources: [
      { label: 'RP Photonics Encyclopedia — Pulse Compression', url: 'https://www.rp-photonics.com/pulse_compression.html' },
    ],
    related: ['pulsedlaser', 'glassrod', 'pulsecompressor', 'detector'],
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
