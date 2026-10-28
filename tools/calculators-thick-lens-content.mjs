// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Content of the thin and thick lens page. Every number quoted in the text
// is recomputed by test/calculator-thick-lens.test.js.

const cite = (...n) => n.map(k => `<a class="cite" href="#ref-${k}">[${k}]</a>`).join('');
const GITHUB = 'https://github.com/LucaGenchi/opticalsetup/blob/main';

const LENS = { label: 'Wikipedia, “Lens (optics)”: the lensmaker’s equation with thickness, the principal planes of a thick lens, the lens equation, magnification and Newton’s form.', url: 'https://en.wikipedia.org/wiki/Lens' };
const CARDINAL = { label: 'Wikipedia, “Cardinal point (optics)”: focal points, principal planes and nodal points, with the principal planes of a thick lens.', url: 'https://en.wikipedia.org/wiki/Cardinal_point_(optics)' };
const ABBE = { label: 'Wikipedia, “Abbe sine condition”: the condition, and why a lens that follows the thin-lens tangent rule does not meet it at large angles.', url: 'https://en.wikipedia.org/wiki/Abbe_sine_condition' };
const SPHERICAL = { label: 'Wikipedia, “Spherical aberration”: the shape of a single lens with the least spherical aberration, from the Coddington shape and position factors.', url: 'https://en.wikipedia.org/wiki/Spherical_aberration' };

export const thickLensCalculators = [
  {
    slug: 'thin-thick-lens', title: 'Thin and thick lens', script: 'page.js',
    card: 'Focus a laser with an ideal thin lens or a real singlet, given by its focal length or its radii: the focused beam and spot, colour, and fiber coupling against lateral, axial and angular offset.',
    summary: 'Send a CW laser beam through a lens: an ideal thin lens, or a spherical singlet, plano-convex either way round or bi-convex, given by its focal length or by its radii and thickness. Read its focal lengths and principal planes, the focused waist, the beam through focus and the focal spot of the singlet beside an ideal thin lens, and how the focal length changes with wavelength. Then couple the focus into a single-mode fiber, and see how the coupling falls as the fiber moves across the axis, along it, or tilts.',
    facts: [
      { label: 'Model', html: 'Paraxial lens data of an ideal thin lens or a spherical singlet in air (exact for rays close to the axis); a collimated Gaussian beam focused on axis by scalar diffraction, through an ideal (aplanatic) lens and through the traced singlet; Gaussian fiber modes, moved across or along the axis or tilted.' },
      { label: 'Evidence', html: `Checked against an independent Python reference: the thick-lens formulas for the lens data, the designed radii solved again from them, the complex beam parameter through both surfaces for the Gaussian focus, and, for the real singlet, rays traced by its own routine with the focus and the fiber overlap, offsets included, integrated by quadrature. See the <a href="${GITHUB}/docs/validation.md" target="_blank" rel="noopener">validation table</a>.` },
      { label: 'Code', html: `The <a href="${GITHUB}/calculators/thin-thick-lens/thick-lens.js" target="_blank" rel="noopener">calculator’s module</a> takes the lens data from the <a href="../lens-design/">Lens design</a> calculator’s paraxial trace and the real rays from its ray tracer, with glass data from the canvas’s <a href="${GITHUB}/sketch/js/glass.js" target="_blank" rel="noopener">catalogue</a>; “Open in the canvas” opens the lens as the canvas’s Lens or Thick spherical lens.` },
    ],
    layout: [
      { form: 'calc', preview: 'Open in the canvas', results: 'key', resultsLabel: 'Key results', label: 'Laser and lens' },
      { output: true, label: 'Results', results: [['lens', 'Cardinal points and shape'], ['focus', 'The focused beam']] },
      { graphs: true },
    ],
    graphs: [
      { id: 'beam', title: 'The beam through focus', note: 'The radius that holds 86.5 % of the power (the 1/e² radius of a Gaussian beam) against the distance from the paraxial focus F′, negative toward the lens: the singlet beside an ideal thin lens of the same focal length.' },
      { id: 'psf', title: 'The focal spot', note: 'Intensity across the focus, relative to the ideal thin lens’s peak: the singlet at its brightest plane (solid) and at F′ (dashed).' },
      { id: 'colour', title: 'Focal length against wavelength', note: 'From the glass’s dispersion: a singlet’s effective and back focal lengths beside an ideal thin lens with the same radii; for the ideal lens, a thin lens of the chosen glass.' },
    ],
    panels: [{ id: 'fiber', title: 'Coupling into a single-mode fiber',
      intro: 'The focus from the panel above, into a fiber placed at each lens’s best position on the axis: the coupling efficiency there, and how it falls as the fiber moves across the axis, along it, or tilts.',
      layout: [
        { form: 'fiber', label: 'Fiber' },
        { output: true, label: 'Coupling', results: [['fiber-mode', 'The fiber'], ['fiber-coupling', 'Coupling']] },
        { graphs: true },
      ],
      graphs: [
        { id: 'lateral', title: 'Coupling against lateral offset', note: 'The coupling efficiency as the fiber’s core moves off the axis, at its best position along it and untilted. The focus is round, so the offset’s direction does not matter.' },
        { id: 'axial', title: 'Coupling against axial position', note: 'The coupling efficiency with the fiber’s core on the axis, against its distance from F′, negative toward the lens.' },
        { id: 'tilt', title: 'Coupling against angular offset', note: 'The coupling efficiency as the fiber turns about its core, at its best position on the axis.' },
      ] }],
    sections: [
      { id: 'lens', title: 'Thin and thick lenses',
        html: `<p>A lens with spherical faces of radii R₁ and R₂ and refractive index n focuses parallel light at its focal length f. If the lens is thin compared with its radii, the lensmaker’s equation gives f from the shape alone ${cite(1)}:</p>`,
        formulas: [
          { tex: String.raw`\frac{1}{f} = (n-1)\left(\frac{1}{R_1}-\frac{1}{R_2}\right)`, caption: 'A radius is positive when its centre of curvature lies after the face, in the direction the light travels: a bi-convex lens has R₁ > 0 and R₂ < 0. A flat face has 1/R = 0.' },
        ],
        html2: `<p>A real lens has a centre thickness t. The rays bend at two faces a distance t apart, and the focal length becomes ${cite(1)}</p>`,
        formulas2: [
          { tex: String.raw`\frac{1}{f} = (n-1)\left[\frac{1}{R_1}-\frac{1}{R_2}+\frac{(n-1)\,t}{n\,R_1R_2}\right]` },
        ],
        html3: `<p>Where is f measured from? A thick lens acts as a thin lens of focal length f, but one split in two: light entering it behaves as if it reached a <b>front principal plane</b> H, and leaves as if from a <b>back principal plane</b> H′, at the same height ${cite(2)}. The focal points F and F′ lie f before H and f after H′. Measured from the vertices, the faces’ centres on the axis, positive in the direction of the light ${cite(1, 2)}:</p>`,
        formulas3: [
          { tex: String.raw`\overline{V_1H} = -\frac{f\,(n-1)\,t}{n\,R_2},\qquad \overline{V_2H'} = -\frac{f\,(n-1)\,t}{n\,R_1},\qquad \mathrm{BFL} = f + \overline{V_2H'}`, caption: 'The back focal length BFL runs from the back vertex V₂ to F′, the distance you can measure; the front focal length FFL from F to the front vertex V₁. In air the nodal points coincide with the principal points.' },
        ],
        html4: '<p>The page’s example is a plano-convex lens of N-BK7 for f = 11 mm at 1550 nm, where n = 1.50065, curved side toward the laser. With one face flat the thickness term vanishes, so thin and thick formulas agree. But H′ lies 1.259 mm inside the glass (t/n before the flat back face), so the focus is only 9.741 mm behind the flat back. A bi-convex lens with R = ±20 mm and t = 5 mm at 587.6 nm shows the thickness in f itself: 19.35 mm by the thin formula, 20.21 mm by the thick one, with H and H′ 1.722 mm inside each face and a back focal length of 18.49 mm. The ideal thin lens is the limit t → 0: H and H′ lie in its plane.</p>',
      },
      { id: 'design', title: 'A singlet from its focal length',
        html: '<p>Catalogues sell singlets by focal length and diameter. Given f, the clear diameter D and the thickness e left at the edge, the page finds the radii and the centre thickness. A face of radius R rises by its sag over the clear radius, so the centre is as thick as the edge plus both sags:</p>',
        formulas: [
          { tex: String.raw`s(R) = R-\sqrt{R^2-(D/2)^2},\qquad t = e + s(R_1) + s(|R_2|)`, caption: 'A flat face has no sag. A radius not larger than D/2 cannot reach the clear diameter: such a lens does not exist, and the page says so.' },
        ],
        html2: `<p>A <b>plano-convex</b> lens is the simple case: with one face flat, f = R/(n − 1) whatever the thickness, so R = (n − 1)f, 5.507 mm for the example, and t = 1.889 mm with a 1 mm edge. Turned round, flat side first, it keeps its f but moves its principal planes. A <b>bi-convex</b> lens is solved numerically for f, the thickness term included: equi-convex (R₂ = −R₁), the same f takes R = ±10.7 mm and t = 1.859 mm. The <b>best form</b> is the bi-convex shape with the least spherical aberration for a collimated beam, from the thin lens’s Coddington shape factor ${cite(4)}:</p>`,
        formulas2: [
          { tex: String.raw`\frac{R_1+R_2}{R_1-R_2} = -\frac{2\,(n^2-1)}{n+2}`, caption: 'For an object at infinity. At n = 1.5 it gives R₂ = −6R₁, the stronger face toward the laser; from n = 1.686 on, the least-aberration shape is no longer bi-convex, and the page refuses it.' },
        ],
        html3: '<p>For the example’s glass and f, the best form has R₁ = 6.331 mm and R₂ = −38.14 mm, 1.874 mm thick. It is a thin-lens result; the page traces the thick lens it gives, and the next sections show how the shapes compare.</p>',
      },
      { id: 'colour', title: 'Focal length and wavelength',
        html: '<p>The index of glass falls with wavelength, and f grows with it, about as 1/(n − 1): blue light focuses closest to the lens (chromatic aberration). The example lens has f = 10.54 mm at 486.1 nm (the F line) and 10.71 mm at 656.3 nm (the C line); at 1300 nm it is 10.93 mm, at 1550 nm 11.00 mm. A designed lens keeps the radii found at the laser’s wavelength; the graph shows its f at other wavelengths, beside the thin-lens formula with the same radii. Glasses with a high Abbe number V disperse less; an achromat pairs a crown and a flint to cancel the first-order change. The indices come from the canvas’s catalogue, Sellmeier fits to the makers’ data sheets inside their fitted ranges; the page refuses a wavelength outside them.</p>',
      },
      { id: 'beam', title: 'Focusing a laser beam',
        html: '<p>A collimated Gaussian laser beam of 1/e² radius w does not focus to a point but to a waist. Between the principal planes the lens acts as a thin one, so the <a href="../gaussian-beam/">Gaussian beam</a> calculator’s thin-lens equations apply with distances from H and H′; for a collimated beam they reduce to</p>',
        formulas: [
          { tex: String.raw`w_0' \approx \frac{\lambda f}{\pi w},\qquad z_R' = \frac{\pi w_0'^2}{\lambda},\qquad \theta = \frac{w_0'}{z_R'}`, caption: 'w₀′ is the focused waist, z_R′ its Rayleigh range and θ the half angle of the focused beam.' },
        ],
        html2: '<p>The example lens focuses a 2 mm beam at 1550 nm to a 5.43 µm waist, 9.741 mm after the back vertex, with a Rayleigh range of 59.7 µm, converging at 90.91 mrad. A lens of clear diameter D passes 1 − exp(−2D²/d²) of a beam of 1/e² diameter d; the page says when it cuts more than a trace.</p><p>That is the ideal lens. To see a real one, the page follows two lenses through focus: an <b>ideal thin lens</b> of the same focal length, and the <b>real singlet</b>, its rays traced through both spherical faces by the lens design page’s ray tracer. Both are lit by the same beam and limited by the same clear aperture.</p>',
      },
      { id: 'real', title: 'The real singlet: spherical aberration',
        html: `<p>The ideal lens is taken to be <b>aplanatic</b>: it sends a ray entering at height h toward the focus at an angle θ with sin θ = h/f, the sine condition for an object at infinity ${cite(3)}. A lens that obeyed the thin-lens rule exactly (tan θ = h/f) would spread its outer rays over less angle and widen the example’s focus by 0.4 %; the aplanatic ideal focuses the example’s beam to within 0.11 % of the Gaussian formula’s waist, slightly tighter, as that formula is the limit of small angles.</p><p>A spherical singlet is neither. Its outer rays cross the axis before F′ (spherical aberration), so its wavefront W, the optical path of each ray compared with a perfect spherical wave, grows toward the rim of the pupil. The page computes the focus of both lenses from their wavefronts by scalar diffraction. On the axis everything is symmetric about it, so the field at a distance r from the axis is a one-dimensional integral over the pupil radius ρ (the Debye integral, as on the <a href="../lens-design/">Lens design</a> page):</p>`,
        formulas: [
          { tex: String.raw`U(r) = 2\pi\int_0^1 A(\rho)\sqrt{\frac{J(\rho)}{\cos\theta}}\;e^{-2\pi i W(\rho)}\,J_0\!\left(\frac{2\pi\,s(\rho)\,r}{\lambda}\right)\rho\,d\rho`, caption: 'A is the beam’s amplitude in the pupil, s the sine of each ray’s angle to the axis as it reaches the plane of interest, J = (s/ρ) ds/dρ the way the pupil’s area maps onto directions, and J₀ a Bessel function. A ray of power A² per unit area of the pupil spans the solid angle J/cos θ there, and the plane waves of the integral are summed over directions divided by cos θ once more, hence √(J/cos θ): for the aplanat, the usual √cos θ apodization. W is measured on the reference sphere about the paraxial focus F′; at a plane Δz further on, each plane wave of the integral gains the phase 2πΔz(cos θ − 1)/λ relative to the axial one (the Debye–Wolf form).' },
        ],
        html2: '<p>The peak intensity relative to that of the same pupil with W = 0 is the <b>Strehl ratio</b>; 0.8 is the usual mark of a diffraction-limited focus. With the example’s 2 mm beam the singlet reaches only 0.39 at its paraxial focus F′. Its brightest plane lies 111.8 µm closer to the lens, where the Strehl ratio is 0.695 and the spot radius 7.29 µm, against 5.42 µm for the ideal lens. Turned round, flat side first, the same lens makes the curved face do all the bending: the best Strehl ratio falls to 0.401, 268.4 µm before F′. The shape matters too: designed for the same f, an equi-convex lens reaches 0.639 and the best form 0.72. With a 1 mm beam the plano-convex singlet is nearly perfect (0.99): the wavefront error grows as the fourth power of the beam radius.</p><p>The spot radius is the radius that holds 86.5 % of the power: for a Gaussian beam it is the 1/e² radius, and it stays meaningful for a beam whose aberrations give it rings or a halo, where the 1/e² point of the profile does not.</p>',
      },
      { id: 'fiber', title: 'Coupling into a fiber',
        html: '<p>A single-mode fiber accepts only light that matches its mode, close to a Gaussian of the fiber’s mode-field diameter. The coupled share is the overlap of the delivered field with the mode, taken on the sphere about the fiber’s core with the mode’s far field, as the lens design page does; the <a href="../fiber-coupling/">Fiber coupling</a> calculator gives it in closed form for Gaussian beams and explains the fiber’s mode. With the core moved by Δ across the axis, or the fiber turned by τ, the far field is a Gaussian in the angle α between each direction and the fiber’s axis, and each plane wave reaches the moved core with an extra phase:</p>',
        formulas: [
          { tex: String.raw`\eta = \frac{\left|\int P\,e^{-\sin^2\!\alpha/\theta_0^2}\,e^{2\pi i\,s_x\Delta/\lambda}\,d\Omega\right|^2}{\int |P|^2\,d\Omega\;\int |M|^2\,d\Omega},\qquad \theta_0 = \frac{\lambda}{\pi w_m}`, caption: 'P = A√(cos θ/J) e^(−2πiW) is the field the lens delivers per unit solid angle (so that P dΩ = A√(J/cos θ) e^(−2πiW) times the pupil area); s_x the component of a direction along the offset; w_m half the mode-field diameter. Without offsets α = θ and the azimuth contributes 2π. A lateral offset alone averages over the azimuth exactly to J₀(2π s Δ/λ); a tilt alone lights an arc of azimuth about its direction, which the page integrates numerically.' },
        ],
        html2: '<p>For the example (a fiber of 10.4 µm mode-field diameter at 1550 nm) the ideal lens couples 99.8 %. The singlet couples best, 90.9 %, with the fiber 83.45 µm closer to the lens than F′: aberrated light couples best at neither the paraxial focus nor the brightest plane, so the page places each fiber at its own best position. From there the singlet’s coupling halves with the core 4.65 µm off the axis (the ideal lens’s 4.42 µm), or with the fiber tilted by 73.4 mrad (77.6 mrad). Flat side first, the best is 67.9 %; the best form reaches 92 %. A narrower beam suffers less aberration but focuses to a larger spot: with a 1 mm beam the singlet is nearly perfect, yet couples only 60.4 %, because its 10.85 µm waist no longer matches the mode.</p><p>The <b>coupling efficiency</b> is the overlap times the light that reaches the fiber: the beam’s share inside the clear diameter and, for uncoated surfaces, the normal-incidence transmission of the two lens faces and a fused-silica fiber end, together 89.1 % for the example, which brings the singlet to 81 %.</p>',
      },
      { id: 'precision', title: 'Precision and limits',
        html: '<p>An independent Python reference checks the lens data and the colour against the thick-lens formulas, from its own Sellmeier data, to 10⁻⁹; the designed lenses by solving the thick-lens formula for f again, to 10⁻⁹; the Gaussian focus by carrying the complex beam parameter through both refracting surfaces, to 10⁻⁹; and the real singlet with rays from its own tracer, integrating the focus and the fiber overlap, offsets included, by Gauss–Legendre quadrature, to 10⁻⁴ (the page samples the pupil radius 1024 times, or 4096 when the wavefront or the mode needs it, and integrates by Simpson’s rule with at least four steps per wave; at F′ the lens design page’s two-dimensional fiber overlap agrees as closely). Through focus the ideal lens follows the Gaussian beam’s radius to 2 × 10⁻³ at the example’s convergence, and more closely for slower beams, where the paraxial formulas are better. At the focus the ideal lens matches the Gaussian coupling to 10⁻⁴ and the Gaussian waist to 1.1 × 10⁻³.</p><p>Limits. Everything is on the axis. The beam is a collimated TEM₀₀ beam with its waist at the lens, at one wavelength; the focus is scalar, so it ignores polarization, which a note flags above an NA of 0.6, and it rests on the Debye approximation, which a note flags when the Fresnel number of the lit pupil, a²/(λf), falls below 10. The fiber’s mode is Gaussian, and it is moved one way at a time. Absorption and tolerances are not included, nor reflections unless asked for. The lens’s edge must not be thinner than zero: a lens whose faces cross at its clear diameter is shown as an ideal lens only. A lens whose F′ lies inside the glass or before it has no focus in air, and shows none; a singlet wavefront too steep to integrate on 4096 samples is refused, and a spot wider than the page integrates is left unmeasured, as a note says.</p>',
      },
    ],
    references: [LENS, CARDINAL, ABBE, SPHERICAL],
  },
];
