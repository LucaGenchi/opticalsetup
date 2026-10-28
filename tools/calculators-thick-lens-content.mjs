// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Content of the thin and thick lens page. Every number quoted in the text
// is recomputed by test/calculator-thick-lens.test.js.

const cite = (...n) => n.map(k => `<a class="cite" href="#ref-${k}">[${k}]</a>`).join('');
const GITHUB = 'https://github.com/LucaGenchi/opticalsetup/blob/main';

const LENS = { label: 'Wikipedia, “Lens (optics)”: the lensmaker’s equation with thickness, the principal planes of a thick lens, the lens equation, magnification and Newton’s form.', url: 'https://en.wikipedia.org/wiki/Lens' };
const CARDINAL = { label: 'Wikipedia, “Cardinal point (optics)”: focal points, principal planes and nodal points, with the principal planes of a thick lens.', url: 'https://en.wikipedia.org/wiki/Cardinal_point_(optics)' };
const ABBE = { label: 'Wikipedia, “Abbe sine condition”: the condition, and why a lens that follows the thin-lens tangent rule does not meet it at large angles.', url: 'https://en.wikipedia.org/wiki/Abbe_sine_condition' };

export const thickLensCalculators = [
  {
    slug: 'thin-thick-lens', title: 'Thin and thick lens', script: 'page.js',
    card: 'A spherical singlet: focal length with and without its thickness, principal planes, the image of an object, colour, and how well the real lens focuses a laser beam into a fiber.',
    summary: 'Give a singlet by its glass, radii, thickness and diameter. Read its focal length by the thin-lens and the thick-lens formulas, where its principal planes and focal points lie, and where it images an object, drawn to scale. Then send a laser beam through it: the focused spot, the beam through focus and the coupling into a single-mode fiber, for an ideal lens and for the real singlet with its spherical aberration.',
    facts: [
      { label: 'Model', html: 'Paraxial optics of a spherical singlet in air (exact for rays close to the axis); a collimated Gaussian beam focused on axis by an ideal (aplanatic) lens and by the real singlet, with scalar diffraction and Gaussian fiber modes.' },
      { label: 'Evidence', html: `Checked against an independent Python reference: the thick-lens formulas and a ray-transfer matrix for the lens data and the image, the complex beam parameter through both surfaces for the Gaussian focus, and, for the real singlet, rays traced by its own routine with the focus and the fiber overlap integrated by quadrature. See the <a href="${GITHUB}/docs/validation.md" target="_blank" rel="noopener">validation table</a>.` },
      { label: 'Code', html: `The <a href="${GITHUB}/calculators/thin-thick-lens/thick-lens.js" target="_blank" rel="noopener">calculator’s module</a> takes the lens data from the <a href="../lens-design/">Lens design</a> calculator’s paraxial trace and the real rays from its ray tracer, with glass data from the canvas’s <a href="${GITHUB}/sketch/js/glass.js" target="_blank" rel="noopener">catalogue</a>; “Open in the canvas” opens the singlet as the canvas’s Thick spherical lens.` },
    ],
    layout: [
      { form: 'calc', preview: 'Open in the canvas', results: 'key', resultsLabel: 'Key results', label: 'Thin and thick lens' },
      { output: true, label: 'Results', results: [['lens', 'The lens'], ['image', 'The image'], ['focus', 'The focused beam'], ['fiber', 'Fiber coupling']] },
      { graphs: true },
    ],
    graphs: [
      { id: 'beam', title: 'The beam through focus', note: 'The radius that holds 86.5 % of the power (the 1/e² radius of a Gaussian beam) against the distance from the paraxial focus F′; negative toward the lens.' },
      { id: 'psf', title: 'The focal spot', note: 'Intensity across the focus, relative to the ideal lens’s peak: the singlet at its best plane (solid) and at F′ (dashed).' },
      { id: 'coupling', title: 'Fiber coupling through focus', note: 'The share of the light that enters the fiber, with its core on the axis, against its distance from F′.' },
      { id: 'colour', title: 'Focal length against wavelength', note: 'From the glass’s dispersion: the effective and back focal lengths of the thick lens, and the thin-lens formula.' },
    ],
    sections: [
      { id: 'lens', title: 'Thin and thick lenses',
        html: `<p>A lens with spherical faces of radii R₁ and R₂ and refractive index n focuses parallel light at its focal length f. If the lens is thin compared with its radii, the lensmaker’s equation gives f from the shape alone ${cite(1)}:</p>`,
        formulas: [
          { tex: String.raw`\frac{1}{f} = (n-1)\left(\frac{1}{R_1}-\frac{1}{R_2}\right)`, caption: 'A radius is positive when its centre of curvature lies after the face, in the direction the light travels: a biconvex lens has R₁ > 0 and R₂ < 0. A flat face has 1/R = 0.' },
        ],
        html2: `<p>A real lens has a centre thickness t. The rays bend at two faces a distance t apart, and the focal length becomes ${cite(1)}</p>`,
        formulas2: [
          { tex: String.raw`\frac{1}{f} = (n-1)\left[\frac{1}{R_1}-\frac{1}{R_2}+\frac{(n-1)\,t}{n\,R_1R_2}\right]` },
        ],
        html3: `<p>Where is f measured from? A thick lens acts as a thin lens of focal length f, but one split in two: light entering it behaves as if it reached a <b>front principal plane</b> H, and leaves as if from a <b>back principal plane</b> H′, at the same height ${cite(2)}. The focal points F and F′ lie f before H and f after H′. Measured from the vertices, the faces’ centres on the axis, positive in the direction of the light ${cite(1, 2)}:</p>`,
        formulas3: [
          { tex: String.raw`\overline{V_1H} = -\frac{f\,(n-1)\,t}{n\,R_2},\qquad \overline{V_2H'} = -\frac{f\,(n-1)\,t}{n\,R_1},\qquad \mathrm{BFL} = f + \overline{V_2H'}`, caption: 'The back focal length BFL runs from the back vertex V₂ to F′, the distance you can measure; the front focal length FFL from F to the front vertex V₁. In air the nodal points coincide with the principal points.' },
        ],
        html4: '<p>The page’s example is a plano-convex lens of N-BK7, R₁ = 5.5 mm, flat at the back and 3 mm thick, used at 1550 nm, where n = 1.50065. With one face flat the thickness term vanishes, so thin and thick formulas agree: f = 10.99 mm. But H′ lies 1.999 mm inside the glass (t/n behind the curved face), so the focus is only 8.987 mm behind the flat back. A biconvex lens with R = ±20 mm and t = 5 mm at 587.6 nm shows the thickness in f itself: 19.35 mm by the thin formula, 20.21 mm by the thick one, with H and H′ 1.722 mm inside each face and a back focal length of 18.49 mm.</p>',
      },
      { id: 'image', title: 'Object and image',
        html: `<p>With distances measured from the principal planes, a thick lens images exactly as a thin one does. An object a distance s before H forms an image s′ after H′ ${cite(1)}:</p>`,
        formulas: [
          { tex: String.raw`\frac{1}{s}+\frac{1}{s'} = \frac{1}{f},\qquad m = -\frac{s'}{s},\qquad x\,x' = f^2\quad (x = s-f,\; x' = s'-f)`, caption: 's is positive for a real object before the lens, s′ positive for a real image after it; m is the lateral magnification, negative for an inverted image. x and x′ (Newton’s form) are measured from the focal points.' },
        ],
        html2: '<p>The page traces two paraxial rays through both faces instead, which gives the same image without placing the principal planes first, and draws the three construction rays to scale: the ray parallel to the axis leaves through F′, the ray through F leaves parallel, and the ray aimed at H leaves H′ at the same angle. The dashed lines show the incoming and outgoing rays meeting H and H′ at equal heights. With the example lens, an object 30 mm before the front vertex is imaged 15.33 mm after the back vertex, inverted and reduced, m = −0.5778; the thin-lens formula with distances from the lens’s centre would put it at 15.37 mm. An object closer than F gives a virtual, upright image on the object’s side, drawn dashed.</p><p>These are paraxial results: exact for rays close to the axis, and the reference from which aberrations are measured. Steep rays from a tall or close object focus elsewhere, which the lens design page traces.</p>',
      },
      { id: 'colour', title: 'Focal length and wavelength',
        html: '<p>The index of glass falls with wavelength, and f grows with it, about as 1/(n − 1): blue light focuses closest to the lens (chromatic aberration). The example lens has f = 10.53 mm at 486.1 nm (the F line) and 10.69 mm at 656.3 nm (the C line); at 1300 nm it is 10.92 mm, at 1550 nm 10.99 mm. Glasses with a high Abbe number V disperse less; an achromat pairs a crown and a flint to cancel the first-order change. The indices come from the canvas’s catalogue, Sellmeier fits to the makers’ data sheets inside their fitted ranges; the page refuses a wavelength outside them.</p>',
      },
      { id: 'beam', title: 'Focusing a laser beam',
        html: '<p>A collimated Gaussian laser beam of 1/e² radius w does not focus to a point but to a waist. Between the principal planes the lens acts as a thin one, so the <a href="../gaussian-beam/">Gaussian beam</a> calculator’s thin-lens equations apply with distances from H and H′; for a collimated beam they reduce to</p>',
        formulas: [
          { tex: String.raw`w_0' \approx \frac{\lambda f}{\pi w},\qquad z_R' = \frac{\pi w_0'^2}{\lambda},\qquad \theta = \frac{w_0'}{z_R'}`, caption: 'w₀′ is the focused waist, z_R′ its Rayleigh range and θ the half angle of the focused beam.' },
        ],
        html2: '<p>The example lens focuses a 2 mm beam at 1550 nm to a 5.42 µm waist, 8.986 mm after the back vertex, with a Rayleigh range of 59.54 µm, converging at 91.03 mrad. A lens of clear diameter D passes 1 − exp(−2D²/d²) of a beam of 1/e² diameter d; the page says when it cuts more than a trace.</p><p>That is the ideal lens. To see the real one, the page follows two lenses through focus: an <b>ideal lens</b> of the same focal length, and the <b>real singlet</b>, its rays traced through both spherical faces by the lens design page’s ray tracer. Both are lit by the same beam and limited by the same clear aperture.</p>',
      },
      { id: 'real', title: 'The real singlet: spherical aberration',
        html: `<p>The ideal lens is taken to be <b>aplanatic</b>: it sends a ray entering at height h toward the focus at an angle θ with sin θ = h/f, the sine condition for an object at infinity ${cite(3)}. A lens that obeyed the thin-lens rule exactly (tan θ = h/f) would spread its outer rays over less angle and widen the example’s focus by 0.4 %; the aplanatic ideal focuses a Gaussian beam to the Gaussian formula’s waist.</p><p>A spherical singlet is neither. Its outer rays cross the axis before F′ (spherical aberration), so its wavefront W, the optical path of each ray compared with a perfect spherical wave, grows toward the rim of the pupil. The page computes the focus of both lenses from their wavefronts by scalar diffraction. On the axis everything is symmetric about it, so the field at a distance r from the axis is a one-dimensional integral over the pupil radius ρ (the Debye integral, as on the <a href="../lens-design/">Lens design</a> page):</p>`,
        formulas: [
          { tex: String.raw`U(r) = 2\pi\int_0^1 A(\rho)\sqrt{J(\rho)}\;e^{-2\pi i W(\rho)}\,J_0\!\left(\frac{2\pi\,s(\rho)\,r}{\lambda}\right)\rho\,d\rho`, caption: 'A is the beam’s amplitude in the pupil, s the sine of each ray’s angle to the axis as it reaches the plane of interest, J = (s/ρ) ds/dρ the way the pupil’s area maps onto directions, and J₀ a Bessel function. W is measured on the reference sphere about the paraxial focus F′; at a plane Δz further on, each plane wave of the integral gains the phase 2πΔz(cos θ − 1)/λ relative to the axial one (the Debye–Wolf form).' },
        ],
        html2: '<p>The peak intensity relative to that of the same pupil with W = 0 is the <b>Strehl ratio</b>; 0.8 is the usual mark of a diffraction-limited focus. With the example’s 2 mm beam the singlet reaches only 0.39 at its paraxial focus F′. Its brightest plane lies 110.5 µm closer to the lens, where the Strehl ratio is 0.699 and the spot radius 7.23 µm, against 5.42 µm for the ideal lens. Turned round, flat side first, the same lens makes the curved face do all the bending: the best Strehl ratio falls to 0.397, 268.1 µm before F′. With a 1 mm beam the singlet is nearly perfect (0.99): the wavefront error grows as the fourth power of the beam radius.</p><p>The spot radius is the radius that holds 86.5 % of the power: for a Gaussian beam it is the 1/e² radius, and it stays meaningful for a beam whose aberrations give it rings or a halo, where the 1/e² point of the profile does not.</p>',
      },
      { id: 'fiber', title: 'Coupling into a fiber',
        html: `<p>A single-mode fiber accepts only light that matches its mode, close to a Gaussian of the fiber’s mode-field diameter. The coupled share is the overlap of the delivered field with the mode, taken on the sphere about the fiber’s core with the mode’s far field exp(−s²/θ₀²), θ₀ = λ/(π w<sub>m</sub>), as the lens design page does; the <a href="../fiber-coupling/">Fiber coupling</a> calculator gives it in closed form for Gaussian beams and explains the fiber’s mode.</p>`,
        formulas: [
          { tex: String.raw`\eta = \frac{\left|2\pi\int_0^1 A\sqrt{J/\cos\theta}\;e^{-s^2/\theta_0^2}\,e^{-2\pi i W}\rho\,d\rho\right|^2}{2\pi\int_0^1 A^2\rho\,d\rho\;\int |M|^2\,d\Omega}` },
        ],
        html2: '<p>For the example (a fiber of 10.4 µm mode-field diameter at 1550 nm) the ideal lens couples 99.8 %. The singlet couples 72.2 % with the fiber at F′, and 91.1 % with it 82.33 µm closer to the lens: aberrated light couples best at neither the paraxial focus nor the brightest plane, so the fiber’s position is worth scanning. Flat side first, the best is 67.9 %. A narrower beam suffers less aberration but focuses to a larger spot: with a 1 mm beam the singlet is nearly perfect, yet couples only 60.5 %, because its 10.84 µm waist no longer matches the mode.</p>',
      },
      { id: 'precision', title: 'Precision and limits',
        html: '<p>An independent Python reference checks the lens data, the image and the colour against the thick-lens formulas and a ray-transfer matrix, from its own Sellmeier data, to 10⁻⁹; the Gaussian focus by carrying the complex beam parameter through both refracting surfaces, to 10⁻⁹; and the real singlet with rays from its own tracer, integrating the focus and the fiber overlap by Gauss–Legendre quadrature, to 10⁻⁴ (the page samples the pupil radius 1024 times and integrates by Simpson’s rule; at F′ the lens design page’s two-dimensional fiber overlap agrees as closely). Through focus the ideal lens follows the Gaussian beam’s radius to 2 × 10⁻³ at the example’s convergence, and more closely for slower beams, where the paraxial formulas are better. The ideal lens reproduces the Gaussian waist and the Gaussian coupling to 10⁻³.</p><p>Limits. Everything is on the axis: an object off it is imaged paraxially, with no aberrations. The beam is a collimated TEM₀₀ beam with its waist at the lens, at one wavelength; the focus is scalar, so it ignores polarization, which a note flags above an NA of 0.6, and it rests on the Debye approximation, which a note flags when the Fresnel number of the lit pupil, a²/(λf), falls below 10. The fiber sits on the axis, aligned with it; its mode is Gaussian. Reflections at the faces (about 4 % per uncoated face), absorption, and tolerances are not included. The lens’s edge must not be thinner than zero: a lens whose faces cross at its clear diameter is shown as an ideal lens only.</p>',
      },
    ],
    references: [LENS, CARDINAL, ABBE],
  },
];
