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
    match: 'Gregorian telescope — element by element',
    title: 'Gregorian telescope',
    tagline: 'A parabola and an ellipse, each placed at the one pair of points it images perfectly, and a traced spot seven ten-millionths of a millimetre across.',
    html: `
      <p>A spherical mirror does not focus. Rays near its rim cross the axis ahead of
      rays near its centre, and no plane anywhere along the axis catches them all — the
      light forms a caustic rather than a point. This is not a manufacturing defect; it
      is what a sphere is.</p>
      <p>The conic sections are the cure, and each one is exact for exactly one pair of
      points. A <strong>parabola</strong> images infinity onto its focus. An
      <strong>ellipse</strong> images one of its foci onto the other. A
      <strong>hyperbola</strong> does the same for one real focus and one virtual one.
      These are not approximations that improve on the sphere — they are geometric
      identities, true for a ray at the rim as much as one on the axis.</p>
      <p>James Gregory published this telescope in 1663, before anyone had built a
      reflecting telescope at all: a parabolic primary to collect the light, and a
      concave elliptical secondary placed <em>past</em> the primary's focus to relay that
      image out through a hole in the primary. Each mirror is asked to do the one job its
      own shape does perfectly, so the pair inherits the exactness.</p>
      <p>The arrangement costs length — the secondary must sit beyond the prime focus, so
      the tube is longer than a Cassegrain of the same focal length — and repays it with
      an upright image and, more usefully, a <em>real intermediate focus</em> inside the
      instrument, where a field stop can sit and reject stray light before it ever
      reaches the detector.</p>`,
    inOpticalSetupTitle: 'What this setup demonstrates',
    inOpticalSetupHtml: `
      <p>Both mirrors are real conic surfaces, intersected analytically, so nothing here
      is a paraxial stand-in: the focus is as good or as bad as the geometry makes it.</p>
      <p>The primary is a parabola (<span class="w">k = −1</span>) of
      <span class="w">f = 40 mm</span>, forming a real image at <span class="w">x = 460</span>.
      The secondary sits 20 mm beyond that, and its prescription follows directly from
      requiring its two foci to land on the intermediate image and on the focal plane:
      <span class="w">R = 2pq/(p+q) = 31.35 mm</span> and
      <span class="w">k = −((q−p)/(q+p))² = −0.3221</span>, with
      <span class="w">p = 20</span> and <span class="w">q = 72.5</span>. That is the mirror
      equation and the eccentricity, nothing more.</p>
      <p>The traced spot at the focal plane spans <strong>7×10⁻⁷ mm</strong> — zero, to the
      precision the arithmetic holds. Set either conic constant to zero and the surface
      becomes a sphere, and the point becomes a smear you can measure.</p>
      <p>The central obstruction is not drawn in. The secondary is an opaque mirror
      sitting in the beam, so it blocks the middle of the aperture because it is genuinely
      in the way, and the primary is illuminated as an annulus in consequence.</p>`,
    limitations: `<p>This is a 2D meridional section. There is no sagittal plane, so
      astigmatism and field curvature are not reproduced as a real instrument shows them,
      and the off-axis behaviour sampled here is only one cut through a rotationally
      symmetric system.</p>
      <p>Nothing is diffractive: no Airy disc, and none of the ring redistribution a
      central obstruction really causes, so the geometric point is sharper than any real
      telescope's. Reflectivity is a flat percentage with no angle, polarization or
      wavelength dependence, and the scale here is a teaching choice rather than any
      catalogue instrument.</p>`,
    citations: [],
    resources: [
      { label: 'RP Photonics Encyclopedia — Parabolic Mirrors', url: 'https://www.rp-photonics.com/parabolic_mirrors.html' },
    ],
    related: ['conicmirror', 'oap', 'cmirror', 'mirror'],
  },

  {
    match: 'Ritchey–Chrétien telescope — element by element',
    title: 'Ritchey–Chrétien telescope',
    tagline: 'Two hyperboloids that are measurably worse on the optical axis than a classical Cassegrain, and better everywhere else — the trade behind Hubble, the VLT and Keck.',
    html: `
      <p>A classical Cassegrain is exact on its axis. A parabolic primary brings starlight
      to a point, and a hyperbolic secondary sharing that focus relays it to another point,
      each surface doing the one thing its shape does perfectly. Measured on the axis, it
      cannot be beaten.</p>
      <p>Point it slightly off axis and the image falls apart. Rays through opposite sides
      of the aperture no longer land together; a star grows a one-sided flare, brighter at
      one end, like a small comet. This is <strong>coma</strong>, and it grows linearly
      with field angle, which is why a classical Cassegrain is a superb instrument for
      looking at one object and a poor one for surveying a field.</p>
      <p>George Ritchey and Henri Chrétien's answer, around 1910, was to stop insisting on
      the axis. Make <em>both</em> mirrors hyperbolic and two free parameters become
      available instead of one — enough to cancel spherical aberration and coma together
      rather than spherical aberration alone. The design is <em>aplanatic</em>: no longer
      perfect anywhere, and nearly as good everywhere.</p>
      <p>That trade is why it is the standard for research telescopes. Hubble, the VLT and
      the Keck telescopes are all Ritchey–Chrétiens, because a telescope earns its cost on
      the field it can image at once, not on the single point at the centre of it.</p>`,
    inOpticalSetupTitle: 'What this setup demonstrates',
    inOpticalSetupHtml: `
      <p>The geometry is fixed and only the two conic constants change, so any difference
      between the designs is surface shape alone.</p>
      <p>The classical Cassegrain's secondary follows from the shared-focus construction,
      <span class="w">k = −((m+1)/(m−1))² = −2.609467</span> at a secondary magnification
      of <span class="w">m = 4.25</span>. The Ritchey–Chrétien's pair cannot be built that
      way — neither mirror images the conjugates on its own — so it was solved against this
      app's own tracer by bisection: the secondary conic chosen to null the signed
      spherical aberration at the focal plane, then the primary conic chosen to null the
      signed coma of a 0.1° bundle. That gives
      <span class="w">k₁ = −1.040245</span> and <span class="w">k₂ = −2.971093</span>.</p>
      <p>Spot size at the focal plane, measured:</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Design</th><th>on axis</th><th>0.1°</th><th>0.3°</th></tr></thead>
        <tbody>
          <tr><td>Classical Cassegrain</td><td>4.5×10⁻⁷ mm</td><td>5.0×10⁻³ mm</td><td>2.2×10⁻² mm</td></tr>
          <tr><td>Ritchey–Chrétien</td><td>5.4×10⁻⁴ mm</td><td>1.9×10⁻³ mm</td><td>1.4×10⁻² mm</td></tr>
        </tbody>
      </table></div>
      <p>The Cassegrain is a thousand times better on the axis and two and a half times
      worse a tenth of a degree off it. Set the primary to
      <span class="w">k = −1</span> and the secondary to
      <span class="w">k = −2.609467</span> in the inspector and you can watch the axis
      sharpen and the field degrade together.</p>
      <p>By 0.3° the two designs are close again, and that is worth understanding rather
      than hiding: what remains at that field is largely astigmatism, which the
      Ritchey–Chrétien does not claim to correct. Removing it needs a third element — a
      corrector plate — which is exactly what wide-field survey telescopes add.</p>`,
    limitations: `<p>A 2D meridional section cannot show astigmatism or field curvature
      the way a real instrument does: a rotationally symmetric system is being sampled
      along a single cut, so the off-axis numbers above describe that cut and not a full
      spot diagram. The aplanatic pair was solved against this tracer's exact ray
      geometry rather than from third-order theory, so the conic constants are close to
      but not identical with the textbook closed-form values.</p>
      <p>Nothing is diffractive — no Airy disc, no obstruction-driven ring
      redistribution, no spider vanes — and the aperture is a teaching scale, not a
      catalogue instrument. Reflectivity carries no angle, polarization or wavelength
      dependence.</p>`,
    citations: [],
    resources: [
      { label: 'RP Photonics Encyclopedia — Mirrors', url: 'https://www.rp-photonics.com/mirrors.html' },
    ],
    related: ['conicmirror', 'oap', 'cmirror', 'objective'],
  },

  {
    match: 'IR Cassegrain objective — element by element',
    title: 'Inside an IR Cassegrain objective',
    tagline: 'Follow the light through an open primary, onto a convex secondary, and back to a concave primary that focuses around it.',
    html: `
      <p>A reflective microscope objective can focus infrared light without refractive
      glass. A common layout uses a large concave primary with a central opening and a
      small convex secondary. In the infinity-input focusing direction, light first
      passes through the primary opening, reflects from the secondary, returns to the
      primary, and finally converges past the secondary toward the sample.${cite(1)}</p>
      <p>This example exposes each optic as an independent, editable element. The two
      golden curves are actual traced surfaces. The small absorber and slit select the
      entrance pupil; the camera's active face marks the sample plane.</p>`,
    inOpticalSetupTitle: 'A prescription you can understand',
    inOpticalSetupHtml: `
      <p>This is a <strong>Cassegrain-type teaching design</strong>, not a manufacturer
      prescription or the classical concentric spherical Schwarzschild design. The
      convex secondary is a paraboloid with radius 80 mm and conic constant −1. It turns
      collimated light into a diverging return bundle with a virtual focus at x = 410 mm.
      The ellipsoidal primary sends that bundle to the second focus at x = 530 mm.</p>
      <p>The primary vertex is x = 250 mm. Its two focal distances are therefore 160
      and 280 mm: ellipse semi-major axis a = 220 mm, focal half-separation c = 60 mm,
      vertex radius R = (a² − c²)/a = 203.636363… mm, and k = −c²/a² = −0.074380… .
      The secondary vertex is x = 370 mm. Both radii are positive in the scene's +x
      axis; the coated sides face each other.</p>
      <p>These conics provide an exact on-axis geometrical focus. The 160 mm working
      distance and oversized dimensions make the path readable; they are illustrative
      dimensions, not a claimed commercial IR objective specification.</p>
      <ol>
        <li><strong>Clip the entrance:</strong> select the primary and reduce Central
        opening from 36 to 20 mm. Fewer rays reach the focus. The opening is an absence
        of mirror, not a transmissive surface.</li>
        <li><strong>Try spherical mirrors:</strong> set both conic constants to zero,
        leaving their radii and positions unchanged. The sensor spot span rises from
        numerical zero to about 0.152 mm; the camera inspector makes this small blur
        easier to inspect than the overview.</li>
        <li><strong>Change wavelength:</strong> change the source from 3000 to 10000 nm.
        The ray focus stays put because the modeled reflection geometry is achromatic.</li>
        <li><strong>Change loss:</strong> reduce primary reflectivity from 98% to 49%.
        The relative detected signal halves; at 0% the primary absorbs the beam.</li>
      </ol>
      <p><strong>Why this pairing, and not a classical Cassegrain.</strong> The choice is
      a directly derivable on-axis teaching construction, not a claim of better
      performance. A convex paraboloid creates a virtual source; an ellipsoid images that
      source to the chosen sample position. The generous spacing exists to make the folded
      path readable. Note also the order: here the collimated beam meets the
      <em>convex paraboloid</em> first, whereas a conventional classical Cassegrain sends
      it to the concave parabolic primary first and then to a convex hyperbolic secondary.
      Swapping the conic constants in this scene would not reproduce that arrangement.</p>
      <p><strong>On the reported signal.</strong> It is a relative sum over this 2D ray
      section, not transmitted power through a circular pupil, so central-obstruction
      losses here differ from a 3D area calculation. With the scene's 14.4&nbsp;mm central
      stop and 32&nbsp;mm illuminated width, a continuous 1D blocked fraction would be
      <span class="w">14.4/32 = 45%</span>, while the corresponding area fraction for a
      uniformly illuminated circular pupil would be
      <span class="w">(14.4/32)² = 20.25%</span>. The figure the scene reports is the
      sampled result for these rays, and the two 98% mirror reflections reduce it
      further.</p>`,    limitations: `
      <p>This is a 2D meridional ray trace, not a 3D objective design or electromagnetic
      calculation. The mirror is a zero-thickness, one-sided coated conic with an opaque
      back and absorptive coating losses. No substrate thickness, mounting spiders,
      diffraction, Airy rings, vector PSF, wavefront phase, coating dispersion, or IR
      detector responsivity is calculated. The geometric point focus is not a prediction
      of physical spot diameter. Commercial Schwarzschild objectives and their
      aberration correction are different prescriptions.${cite(2)}</p>
      <p>The selected entrance pupil is represented by two ray bands in this section.
      Its area throughput cannot be inferred from the displayed 1D ray weights. Golden
      mirror strokes and red IR rays are display colors, not a material or visible-color
      claim. Source watts are metadata for power readouts; the existing tracer continues
      to draw normalized rays at zero watts.</p>`,
    citations: [
      { label: 'Edmund Optics — Introduction to Reflective Objectives (infinity-input ray order)', url: 'https://www.edmundoptics.co.uk/knowledge-center/application-notes/microscopy/introduction-to-reflective-objectives/' },
      { label: 'Thorlabs — Reflective Microscope Objectives (Schwarzschild design)', url: 'https://www.thorlabs.com/reflective-microscope-objectives' },
    ],
    resources: [],
    related: ['cmirror', 'cmirrorx', 'oap', 'camera', 'slit'],
  },
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
    tagline: 'Two f = 40 mm prescriptions under the same 400–750 nm beam: one glass spreads the spectrum along the axis, two glasses fold it back.',
    html: `
      <p>A lens works because glass slows light, and it slows every colour by a different
      amount. The refractive index of any ordinary glass falls as wavelength rises — blue
      light sees a denser medium than red — and since the power of a thin lens is
      <span class="w">(n − 1)</span> times its curvature, a single positive lens is
      simply <em>stronger in the blue</em>. Blue focuses short, red focuses long, and the
      focal length becomes a function of colour. That is axial, or longitudinal,
      chromatic aberration.</p>
      <p>Nothing about the shape can remove it. Bending a singlet — changing the two
      radii while holding the power — is the classical cure for spherical aberration and
      does nothing at all for colour, because colour comes from the material, not the
      geometry. One glass has one dispersion curve, and the lens is stuck with it.</p>
      <p>The escape is to use two glasses with different dispersions. Put a positive
      crown element in contact with a negative flint element of much stronger dispersion,
      and choose the two powers so that
      <span class="w">φ₁/V₁ + φ₂/V₂ = 0</span>, where <span class="w">V</span> is the Abbe
      number — about 64 for N-BK7 and 26 for N-SF11. The colour errors then cancel to
      first order while the powers still add to something useful. The flint gives back
      less power than it removes colour, which is exactly the trade an achromat is.</p>`,
    inOpticalSetupTitle: 'What this setup demonstrates',
    inOpticalSetupHtml: `
      <p>Both lanes are identical apart from the prescription: the same 400–750&nbsp;nm
      supercontinuum, the same 20&nbsp;mm beam, the same 1-inch clear aperture, and the
      same 40&nbsp;mm focal length at the d line. Anything that differs downstream is the
      glass.</p>
      <p>The uncorrected N-BK7 singlet spreads its focus over <strong>1.39&nbsp;mm</strong>
      between 400 and 750&nbsp;nm. At the d-line focal plane, where the screen sits, that
      leaves a coloured blur about <strong>0.39&nbsp;mm</strong> across — blue core, red
      skirt, and no plane anywhere that is sharp in every colour at once. The cemented
      N-BK7 + N-SF11 achromat, at the same focal length, brings that to
      <strong>0.15&nbsp;mm</strong> of focus spread and a <strong>0.04&nbsp;mm</strong>
      spot: about ten times tighter.</p>
      <p>None of that is a flag or a display effect. Every sampled wavelength refracts
      through the drawn faces with its own catalogue index, and the separation is whatever
      those interactions produce. Select either group to read its surface table and its
      axial-colour figure, or edit a row to make a custom copy and watch the correction
      break.</p>
      <p>The residual in the corrected lane is worth looking at rather than ignoring. Two
      glasses can bring exactly two wavelengths to a common focus; everything between and
      beyond them lands slightly differently, and that leftover bow is the
      <em>secondary spectrum</em>. Removing it needs a third glass with anomalous
      dispersion — which is what separates an apochromat from an achromat, and most of
      what you pay for in one.</p>`,
    limitations: `<p>This is a 2D meridional geometric trace: it shows longitudinal
      colour, not diffraction-limited spot size, lateral colour, off-axis aberration,
      coatings, or manufacturing tolerance. The catalogue glasses use visible-band Cauchy
      fits rather than full Sellmeier data, so the residual figures are indicative rather
      than a design-grade prediction. The doublet here is solved for this aperture in this
      model; it is a teaching prescription, not a catalogue part.</p>
      <p>Both lenses are deliberately fast — f/2 on a 20&nbsp;mm beam — which makes the
      colour easy to see but also means each lane carries spherical aberration of its own.
      The spot sizes quoted are the combined blur, not colour alone.</p>`,
    citations: [],
    resources: [
      { label: 'RP Photonics Encyclopedia — Achromatic Optics', url: 'https://www.rp-photonics.com/achromatic_optics.html' },
      { label: 'RP Photonics Encyclopedia — Chromatic Dispersion', url: 'https://www.rp-photonics.com/chromatic_dispersion.html' },
    ],
    related: ['lensgroup', 'thicklens', 'sclaser'],
  },
  {
    match: 'Spherical aberration — sphere vs asphere vs ideal lens',
    title: 'Sphere, asphere, and the lens that does not exist',
    tagline: 'Three 1-inch lenses of the same 25 mm focal length under one 20 mm monochromatic bundle: a perfect point, a 7.5 mm smear, and a point again.',
    html: `
      <p>The thin-lens construction every optics course starts with sends every ray
      through a single focal point. It is an approximation, and the approximation is
      <em>paraxial</em> — it assumes rays stay close enough to the axis that
      <span class="w">sin θ ≈ θ</span>. Push light out to the rim of a real lens and the
      neglected terms arrive.</p>
      <p>A spherical surface is the shape that is easy to make, not the shape that is
      right. Grinding two glass blanks against each other with abrasive between them
      naturally produces spheres, because the sphere is the only surface that slides on
      itself in every direction — which is why almost every lens ever made has been
      spherical. But a sphere curves away from the axis faster than focusing requires. A
      ray striking it far from the axis meets a surface that is too steeply tilted, is
      refracted too strongly, and crosses the axis <em>before</em> the paraxial focus. The
      further out the ray, the worse the error: it grows as the cube of ray height, which
      is why spherical aberration is invisible near the axis and brutal at the edge, and
      why stopping a lens down cures it so dramatically.</p>
      <p>The consequence is not a blurrier focus. It is that there is <strong>no focus at
      all</strong> — no plane anywhere along the axis where the light comes to a point. The
      rays instead form a caustic, the bright cusped envelope you can see in a coffee cup.
      The best available plane is the <em>circle of least confusion</em>, sitting well
      inside the paraxial focus, and it is a disc rather than a point.</p>
      <p>An asphere breaks the manufacturing constraint to fix the optical one. Adding a
      conic constant <span class="w">k</span> to the sag equation keeps the curvature at
      the vertex — so the paraxial focal length is untouched — while flattening the
      surface progressively away from the axis, by exactly the amount needed to stop
      over-bending the marginal rays. One number, chosen correctly, removes almost the
      whole error.</p>`,
    inOpticalSetupTitle: 'What this setup demonstrates',
    inOpticalSetupHtml: `
      <p>Three lanes, each starting identically: a monochromatic 587.6&nbsp;nm point
      source at the front focus of a collimator, producing a 20&nbsp;mm bundle of parallel
      rays. Every lens under test is 1 inch across with a 25&nbsp;mm focal length, so all
      three are working at f/1.25 and any difference between them is shape alone.</p>
      <ul>
        <li><strong>The ideal thin lens</strong> puts every ray height through one point.
        Longitudinal spread: <strong>0.000&nbsp;mm</strong>. This is the construction, not
        a lens that can be built.</li>
        <li><strong>The N-BK7 spherical singlet</strong> focuses its paraxial rays at
        26.4&nbsp;mm and its rim rays at 19.6&nbsp;mm — <strong>6.8&nbsp;mm apart</strong>.
        At the paraxial plane, where the screen sits, the bundle is spread over
        <strong>7.5&nbsp;mm</strong>. Even at its tightest, 5.2&nbsp;mm short of that
        plane, the circle of least confusion is still <strong>1.7&nbsp;mm</strong>
        across.</li>
        <li><strong>The N-BK7 asphere</strong>, same power, same aperture, with
        <span class="w">k₁ = −0.55</span> on its front face: longitudinal spread
        <strong>0.046&nbsp;mm</strong> and a <strong>0.02&nbsp;mm</strong> spot. That is
        147 times better than the sphere longitudinally, and about 74 times tighter than
        the sphere's <em>best</em> plane.</li>
      </ul>
      <p>Two things are worth doing by hand. Select the spherical singlet and drag its
      aperture down: the blur collapses far faster than the aperture does, because the
      transverse error goes as the cube of ray height — this is why a slow lens is easy and
      a fast one is hard, and why photographers stop down. Then select the asphere and
      sweep <span class="w">k₁</span> away from −0.55: the focal length readout does not
      move, because the conic constant does not touch vertex curvature, but the rim rays
      swing through the focus and back out again.</p>
      <p>Notice also that the three screens are not at the same distance. Equal focal
      length does not mean equal back focal distance: the asphere's is shorter because its
      principal planes sit differently. Focal length is measured from the principal plane,
      not from the glass.</p>`,
    limitations: `<p>A 2D meridional trace shows only the aberrations that live in that
      plane. Spherical aberration and defocus do; coma, astigmatism and field curvature
      need the third dimension or a real off-axis field, so the asphere here is being
      judged on the one job this model can actually check. A real aspheric condenser is
      corrected for one conjugate and one wavelength, and the conic that fixes an infinite
      conjugate is not the conic that fixes a finite one.</p>
      <p>All three lenses are f/1.25 so the effect is unmistakable at a glance; a normal
      f/8 singlet would show a blur too small to see at this scale. The tracer samples nine
      rays, so the caustic is drawn as a handful of distinct crossings rather than the
      continuous envelope it really is. Nothing here is manufactured: no surface figure
      error, no roughness, no centring tolerance, and no coating — a real asphere is
      considerably harder to make than these numbers suggest, which is the whole reason
      spherical lenses dominated for four centuries.</p>`,
    citations: [],
    resources: [
      { label: 'RP Photonics Encyclopedia — Spherical Aberration', url: 'https://www.rp-photonics.com/spherical_aberrations.html' },
      { label: 'Edmund Optics — All About Aspheric Lenses', url: 'https://www.edmundoptics.com/knowledge-center/application-notes/optics/all-about-aspheric-lenses/' },
    ],
    related: ['asphericlens', 'thicklens', 'lens', 'pointsource'],
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
    tagline: 'Two beamsplitters, two fully separate arms, two output ports — shown three ways: a mechanical delay, a driven phase modulator, and a phase object that turns the layout into a phase-contrast imager.',
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
      <p>One layout, two ways to put phase into an arm. Each row is the same
      Mach–Zehnder diamond — a laser, two beamsplitters, a mirror folding each
      of the two separate arms — recombining onto two cameras with their own
      screens. Both arms are genuinely separate ray paths: move a mirror on
      one and only that arm's traced path changes, exactly as on a bench.</p>
      <p>The invariant to watch in both is that the ports are complementary.
      Whatever leaves one arrives at the other, and they always sum to the
      input — the light is redirected, never absorbed.</p>
      <p><strong>Row 1, a delay line.</strong> Lengthen one arm mechanically.
      Equal arms make one port bright and the other dark; half a wavelength
      (0.000266&nbsp;mm at 532&nbsp;nm) swaps them, and a full wavelength brings
      them back. It ships set to <em>Periodic sweep</em>, walking a micrometre
      back and forth at 0.1&nbsp;Hz, so the two screens trade the light
      continuously rather than sitting on one point of the fringe. That is the
      interferometer as a ruler for optical path.</p>
      <p><strong>Row 2, a phase object.</strong> A half-wave bar across part of
      the beam. The arms now disagree by different amounts at different heights,
      so the output is not a level but a <em>pattern</em>, and the split follows
      how much of the beam the bar actually covers. That is phase contrast — and
      the object absorbs nothing: put a detector after it on its own and the
      reading is unchanged.</p>
      <p>A third way to drive an arm is the
      <a href="../../wiki/phasemodulator/">phase modulator</a>, which does the
      same swap from a voltage and at megahertz rather than by moving a stage.
      Its own page carries that setup.</p>
      <p>Worth trying on both rows: give the laser a coherence length. It
      defaults to zero, meaning idealised, and interferes at any arm mismatch.
      Set a real value and sweep the delay further, and the fringes fade out
      where the arms are mismatched by more than that distance.</p>`,
    limitations: `<p>The tracer combines only phase-valid routes from this
      sized monochromatic CW laser. Optical path, 100%-reflective flat-mirror phase,
      and a unitary non-polarizing beamsplitter phase are represented. Compatible
      fields are grouped at the second beamsplitter before the output beams are drawn;
      a camera additionally integrates any remaining cross terms over its finite 1D
      pixels.</p>
      <p>Temporal coherence is modelled only as a visibility envelope in the arm
      mismatch, set by the source's coherence length: the beam still carries a single
      wavelength, so the linewidth that coherence length implies is reported but never
      propagated, and spatial coherence is not modelled at all. This is not a general
      wave-optics solver either — diffraction, vibration, surface figure, and 2D sensor
      response are absent. Putting an optic whose carrier phase is not modeled in either
      arm makes the tracer fall back to conservative deposited intensity instead of
      inventing a fringe.</p>`,
    citations: [
      { label: 'Wikipedia — Mach–Zehnder interferometer (history and applications)', url: 'https://en.wikipedia.org/wiki/Mach%E2%80%93Zehnder_interferometer' },
      { label: 'RP Photonics Encyclopedia — Interferometers (Mach–Zehnder section)', url: 'https://www.rp-photonics.com/interferometers.html' },
      { label: '“Coherence Length,” RP Photonics Encyclopedia', url: 'https://www.rp-photonics.com/coherence_length.html' },
    ],
    resources: [],
    related: ['bs', 'mirror', 'camera', 'delayline', 'phaseplate', 'cwlaser'],
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
    match: 'Optical parametric oscillator — ring cavity, element by element',
    title: 'Optical parametric oscillator',
    tagline: 'A synchronously pumped singly resonant OPO in a bow-tie ring: green pump photons split into an 800 nm signal and a 1588 nm idler.',
    html: `
      <p>An optical parametric oscillator makes new colours of coherent light without a
      laser transition. Inside a crystal with a χ⁽²⁾ nonlinearity, a pump photon splits
      into two lower-energy photons, the <em>signal</em> and the <em>idler</em>, whose
      frequencies add up to the pump's. Which pair appears is chosen by phase matching,
      so turning the crystal or changing its temperature tunes the output${cite(1)}.</p>
      <p>Energy conservation fixes the idler once the signal is chosen, and because the
      two are made in equal numbers of photons, the higher-energy signal carries the
      larger share of the generated power:</p>
      <div class="formula"><span class="w">1/λ<sub>p</sub> = 1/λ<sub>s</sub> + 1/λ<sub>i</sub></span>
        <div class="caption">Pumped at 532 nm with an 800 nm signal, the idler is at 1588 nm.</div></div>
      <div class="formula"><span class="w">P<sub>s</sub> / P<sub>i</sub> = λ<sub>i</sub> / λ<sub>s</sub></span>
        <div class="caption">Equal photon numbers: the 800 nm signal takes 66.5 % of the generated power and the 1588 nm idler 33.5 %.</div></div>
      <p>A single pass through the crystal gives little gain, so the crystal sits in a
      cavity that feeds one of the waves back. In a <strong>singly resonant</strong>
      OPO only that wave, here the signal, is reflected by the mirrors; the pump and
      idler pass straight through their coatings. Oscillation starts once the round-trip
      gain beats the round-trip loss, which is why an OPO has a pump threshold, and
      driven well above it the pump is depleted and the generated waves can start to
      convert back${cite(2)}.</p>
      <p>Here the cavity is a four-mirror <strong>bow-tie ring</strong>. In this singly
      pumped, co-propagating phase-matched configuration, parametric gain favours the signal
      travelling with the pump, selecting one circulation direction around the ring${cite(1)}. The mirror after the crystal is the output
      coupler: its coating reflects most of the signal and transmits the rest together with
      the pump and idler, so all three leave collinearly and are separated outside. A real
      ring resonator still requires a suitable mode, mirror curvatures, coatings and cavity
      length.</p>
      <p>With a mode-locked pump the crystal only has gain while a pump pulse is inside it,
      so the resonator is <strong>synchronously pumped</strong>: its round trip takes exactly
      one pump period, and a signal pulse that leaves the crystal comes round to meet the
      next pump pulse and is amplified again${cite(1)}. For a ring that fixes the perimeter,
      <span class="w">c / f<sub>rep</sub></span> — strictly the group optical path, so a
      dispersive crystal makes the real ring slightly shorter.</p>`,
    inOpticalSetupTitle: 'What this setup demonstrates',
    inOpticalSetupHtml: `
      <p>A 532 nm, 2 ps, 80 MHz pump drives a χ⁽²⁾ crystal between M1 and M2, the lower
      pair of a bow-tie ring completed by M3 and M4. All four are band reflectors for the
      650–950 nm signal band and transmit the pump and idler, and every one is met at a 12°
      angle of incidence. The signal runs M2 → M3 → M4 → M1 → crystal, crossing itself
      between the upper and lower pairs. The perimeter is exactly
      <span class="w">c / 80 MHz = 3747.4 mm</span>, a 12.5 ns round trip equal to the pump
      period; the crystal is a thin surface, so the whole path is air. Because of that, the
      animated packets of successive round trips overlap instead of forming offset
      clusters. The schematic view still draws several illustrative packets around the ring
      at a fixed fraction of the pulse spacing; the physical view shows the true
      pump-period spacing. The overlap follows from the length ratio, not from a simulated
      synchronisation or gain process. M2 is the output coupler: it reflects 80 % of
      the signal band and transmits the rest, so signal, idler and residual pump leave
      together; a longpass and a shortpass dichroic then separate them. Beam probes read
      the wavelength of the pump, the signal circulating on the upper arm, and each
      separated output: idler, signal and residual pump.</p>
      <p>The crystal is set to a 532 nm pump and an 800 nm signal, so the inspector shows
      the idler at 1588 nm. It converts a fixed 30 % of the pump: 19.95 % becomes signal
      and 10.05 % idler. The idler detector reads that 10.05 % in one pass. The signal
      leaks through M2 on every round trip, and the tracer sums twelve of those leaks,
      reading 18.6 % of the pump. Those are successive round trips of one launched signal,
      not amplified passes: the tracer does not add gain from later pump pulses. It also
      launches the signal only in the pump's direction and does not calculate the gain
      competition that selects that direction. The signal is authored with the same frequency
      (wavenumber) FWHM as the pump, a heuristic, which is about 0.47 nm at 800 nm; the idler width is derived from pump and signal, and the output pulses
      keep the pump's duration; all are illustrative, not one instrument's.</p>
      <p>Things to try: move the signal wavelength and watch the idler follow; lower M2's
      in-band reflectivity and more of the signal leaves on each round trip; or tune the pump more
      than 1 nm away from 532 nm and the oscillator goes dark.</p>`,
    limitations: `<p>This is a phenomenological OPO. The crystal converts a fixed fraction of
      the pump on its first pass: there is no threshold, gain, build-up or back-conversion,
      and phase matching is not calculated, so turning or heating the crystal does nothing.
      The signal output is a finite sum of traced leaks, not a steady state, and changing
      the ring's length does not detune anything — in a real synchronously pumped OPO it
      shifts the signal and can stop oscillation. Ring cavities usually use curved mirrors
      to focus into the crystal; these four are drawn flat. The pump is a
      single axial ray, so only the chief-ray routing is shown, with no mode, focus or beam
      overlap. Mirror coatings switch perfectly at their band edges and do not depend on
      angle.</p>`,
    citations: [
      { label: 'RP Photonics Encyclopedia — Optical Parametric Oscillators', url: 'https://www.rp-photonics.com/optical_parametric_oscillators.html' },
      { label: 'A. Berrou, J.-M. Melkonian, M. Raybaut, A. Godard, E. Rosencher, M. Lefebvre, “Specific architectures for optical parametric oscillators,” C. R. Physique 8, 1162–1173 (2007)', url: 'https://doi.org/10.1016/j.crhy.2007.09.012' },
    ],
    resources: [],
    related: ['crystal', 'dichroic', 'mirror', 'pulsedlaser', 'detector'],
  },

  {
    match: 'Synchronously pumped picosecond OPO',
    title: 'Synchronously pumped picosecond OPO',
    tagline: 'A frequency-doubled 1032 nm picosecond laser pumps a cavity whose round trip lasts one pump period, giving an 800 nm signal.',
    html: `
      <p>An optical parametric oscillator feeds one of its two generated waves back through
      a χ⁽²⁾ crystal so that it keeps being amplified. With a mode-locked pump the
      crystal only has gain while a pump pulse is inside it, and between pulses there is
      none${cite(1)}.</p>
      <p><strong>Synchronous pumping</strong> makes the cavity's round-trip time equal one
      pump period. A signal pulse leaves the crystal, travels once around the
      resonator and arrives back just as the next pump pulse does, so it is amplified on
      every pass. For a pump at repetition rate <span class="w">f<sub>rep</sub></span> the
      round trip must take <span class="w">1/f<sub>rep</sub></span>: a one-way optical path
      of <span class="w">c / (2 f<sub>rep</sub>)</span>, 1.87 m at 80 MHz. Strictly this is
      the <em>group</em> optical path, so a dispersive crystal inside the cavity makes the
      mirrors sit a little closer together than that distance.</p>
      <p>Frequency-doubled mode-locked lasers can pump picosecond OPO sources for coherent
      Raman imaging, which needs two synchronised colours. Near-transform-limited pulses of
      a few picoseconds can provide bandwidths comparable to many molecular Raman bands,
      balancing spectral selectivity against peak intensity${cite(2)}. A singly resonant
      cavity reflects only the signal band: the pump enters through one of its mirrors, the
      idler and residual pump leave through another, and a fraction of the signal leaves
      through the output coupler on every round trip.</p>`,
    inOpticalSetupTitle: 'What this setup demonstrates',
    inOpticalSetupHtml: `
      <p>The scene is an illustrative layout with illustrative settings, representative of
      picosecond OPOs of this kind rather than any one instrument or publication. A 1032 nm, 2 ps, 80 MHz
      laser is frequency-doubled in an SHG crystal that converts half of it to 516 nm. A
      shortpass dichroic sends the residual 1032 nm fundamental up to a dump and passes the
      green pump on to the OPO; in coherent Raman sources that fundamental can instead serve
      as a third synchronised beam.</p>
      <p>The green pump enters a Z-shaped cavity, M3 → F1 → M1 → crystal → M2 → M4, whose
      one-way path is exactly <span class="w">c / (2 × 80 MHz) = 1873.7 mm</span> — a round
      trip of 12.5 ns, the pump period. Every fold is at a 12° angle of incidence, so the
      beam turns back on itself as it does on real cavity mirrors, and one flat fold, F1,
      keeps the long arm on the page. The crystals are thin surfaces, so the whole path is
      air and group and geometric lengths coincide. M1 and M2 are band reflectors that
      return the 650–950 nm signal band and transmit the pump and idler. The pump enters
      through M1; the idler and residual pump leave together through M2 and are separated by
      a dichroic outside the cavity. M4 is an output coupler reflecting 90 % of the
      signal.</p>
      <p>The OPO crystal is set to a 516 nm pump and an 800 nm signal, placing the idler at
      1453.5 nm. The signal is authored with a 10 cm⁻¹ FWHM (0.64 nm) and the pump's 2 ps
      duration, a time–bandwidth product of 0.60; the idler width, about 3.8 nm, is derived
      from pump and signal as uncorrelated Gaussians. Beam probes read the wavelength of the
      1032 nm fundamental, the 516 nm pump, the signal circulating in the long arm and the
      residual pump, and spectrum probes show the separated idler and signal.</p>
      <p>The OPO crystal converts a fixed, illustrative 35 % of the green pump. By photon
      energy that is 22.6 % of the green as signal and 12.4 % as idler — 11.3 % and 6.2 % of
      the 1032 nm laser, which is what the detectors read against. The idler detector reads
      its 6.2 % in one pass. The tracer sums six output-coupler leaks of the signal before
      its path-depth limit, about 5.3 % of the laser; infinitely many would recover the
      generated 11.3 %. Neither is a steady-state prediction.</p>`,
    limitations: `<p>This is a phenomenological OPO, not a cavity simulation. Both crystals
      convert a fixed fraction on a single pass; there is no threshold, gain, build-up or
      saturation, and changing the cavity length does not detune anything — in a real
      synchronously pumped OPO it shifts the signal and can stop oscillation. The signal
      output is a finite sum of traced leakage paths. The SHG crystal scales the pump
      spectrum with the wavelength and keeps the pump's duration, which doubles the
      frequency width. In the undepleted, ideal Gaussian limit the second harmonic would be
      √2 wider in frequency and √2 shorter; the green here is about 14.7 cm⁻¹ instead of
      about 10.4 cm⁻¹, and that carries into the derived idler width.</p>
      <p>Drawing concessions: M1 and M2 are drawn flat. Synchronously pumped cavities
      commonly focus into the crystal with curved mirrors, but the workbench's curved
      mirrors are not wavelength-selective. Many picosecond OPOs couple signal and idler out
      collinearly; here the idler leaves through M2. The pump is a single axial ray, so the
      scene shows chief-ray routing only, with no focus, waist, resonator mode or beam
      overlap. Crystal lengths, temperature tuning and intracavity dispersion are not
      modelled, and the output widths, durations, output coupling and conversion fractions
      are authored.</p>`,
    citations: [
      { label: 'RP Photonics Encyclopedia — Optical Parametric Oscillators', url: 'https://www.rp-photonics.com/optical_parametric_oscillators.html' },
      { label: 'K. Kieu, B. G. Saar, G. R. Holtom, X. S. Xie, F. W. Wise, “High-power picosecond fiber source for coherent Raman microscopy,” Optics Letters 34, 2051–2053 (2009)', url: 'https://doi.org/10.1364/OL.34.002051' },
    ],
    resources: [],
    related: ['crystal', 'dichroic', 'mirror', 'pulsedlaser', 'probe'],
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
