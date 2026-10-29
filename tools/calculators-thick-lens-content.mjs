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
const BSC_GAUSSIAN = { label: 'S. A. Konijnenberg, A. J. H. Adam and H. P. Urbach, BSc Optics (TU Delft Open, 2021), §2.6 “Gaussian geometrical optics”: ray matrices, the thick lens’s power and principal planes measured from its vertices, and the thin lens.', url: 'https://phys.libretexts.org/Bookshelves/Optics/BSc_Optics_(Konijnenberg_Adam_and_Urbach)/02%3A_Geometrical_Optics/2.06%3A_Gaussian_Geometrical_Optics' };
const BSC_SPECTRUM = { label: 'S. A. Konijnenberg, A. J. H. Adam and H. P. Urbach, BSc Optics (TU Delft Open, 2021), §6.3 “Angular spectrum method”: a field as plane waves, each carried to another plane by its own phase.', url: 'https://phys.libretexts.org/Bookshelves/Optics/BSc_Optics_(Konijnenberg_Adam_and_Urbach)/06%3A_Scalar_diffraction_optics/6.04%3A_Angular_Spectrum_Method' };
const KOGELNIK = { label: 'H. Kogelnik and T. Li, “Laser beams and resonators,” Appl. Opt. 5, 1550–1567 (1966).', url: 'https://doi.org/10.1364/AO.5.001550' };
const SELF = { label: 'S. A. Self, “Focusing of spherical Gaussian beams,” Appl. Opt. 22, 658–661 (1983).', url: 'https://doi.org/10.1364/AO.22.000658' };

export const thickLensCalculators = [
  {
    slug: 'thin-thick-lens', title: 'Thin and thick lens', script: 'page.js',
    card: 'Focus a laser with an ideal thin lens or a real singlet, given by its focal length or its radii: the focused beam and spot, and colour.',
    summary: 'Send a CW laser beam through a lens: an ideal thin lens, or a spherical singlet, plano-convex either way round or bi-convex, given by its focal length or by its radii and thickness. Read its focal lengths and principal planes, the focusing NA and the focused waist, the beam through focus for the singlet beside an ideal thin lens, and how the focal length changes with wavelength. To couple the focus into a single-mode fiber, use the <a href="../fiber-coupling/">Free space to fiber coupling</a> calculator, which traces the same singlets.',
    facts: [
      { label: 'Model', html: 'Paraxial lens data of an ideal thin lens or a spherical singlet in air (exact for rays close to the axis); a collimated Gaussian beam focused on axis by scalar diffraction, through an ideal (aplanatic) lens and through the traced singlet.' },
      { label: 'Evidence', html: `Checked against an independent Python reference: the thick-lens formulas ${cite(1, 5)} for the lens data, the designed radii solved again from them, the complex beam parameter through both surfaces for the Gaussian focus, and, for the real singlet, rays traced by its own routine with the focus integrated by quadrature. See the <a href="${GITHUB}/docs/validation.md" target="_blank" rel="noopener">validation table</a>.` },
      { label: 'Code', html: `The <a href="${GITHUB}/calculators/thin-thick-lens/thick-lens.js" target="_blank" rel="noopener">calculator’s module</a> takes the lens data from the <a href="../lens-design/">Lens design</a> calculator’s paraxial trace and the real rays from its ray tracer, with glass data from the canvas’s <a href="${GITHUB}/sketch/js/glass.js" target="_blank" rel="noopener">catalogue</a>; “Open in the canvas” opens the lens as the canvas’s Lens or Thick spherical lens.` },
    ],
    layout: [
      { form: 'calc', preview: 'Open in the canvas', results: 'key', resultsLabel: 'Key results', label: 'Laser and lens' },
      { output: true, label: 'Results', results: [['lens', 'Cardinal points and shape'], ['focus', 'The focused beam']] },
      { graphs: true },
    ],
    graphs: [
      { id: 'beam', title: 'The beam through focus', note: 'The radius that holds 86.5 % of the power (the 1/e² radius of a Gaussian beam) against the distance from the paraxial focus F′, negative toward the lens: the singlet beside an ideal thin lens of the same focal length.' },
      { id: 'colour', title: 'Focal length against wavelength', note: 'From the glass’s dispersion: a singlet’s effective and back focal lengths beside the thin-lens formula with the same radii. A plano-convex lens’s thin and thick f coincide, and flat side first so does its back focal length, so the curves overlap. The ideal lens has no dispersion: its f is the same at every wavelength.' },
    ],
    sections: [
      { id: 'lens', title: 'Thin and thick lenses',
        html: `<p>A lens with spherical faces of radii R₁ and R₂ and refractive index n focuses parallel light at its focal length f. If the lens is thin compared with its radii, the lensmaker’s equation gives f from the shape alone ${cite(1, 5)}:</p>`,
        formulas: [
          { tex: String.raw`\frac{1}{f} = (n-1)\left(\frac{1}{R_1}-\frac{1}{R_2}\right)`, caption: 'A radius is positive when its centre of curvature lies after the face, in the direction the light travels: a bi-convex lens has R₁ > 0 and R₂ < 0. A flat face has 1/R = 0.' },
        ],
        html2: `<p>A real lens has a centre thickness t. The rays bend at two faces a distance t apart, and the focal length becomes ${cite(1, 5)}</p>`,
        formulas2: [
          { tex: String.raw`\frac{1}{f} = (n-1)\left[\frac{1}{R_1}-\frac{1}{R_2}+\frac{(n-1)\,t}{n\,R_1R_2}\right]` },
        ],
        html3: `<p>Where is f measured from? A thick lens acts as a thin lens of focal length f, but one split in two: light entering it behaves as if it reached a <b>front principal plane</b> H, and leaves as if from a <b>back principal plane</b> H′, at the same height ${cite(2)}. The focal points F and F′ lie f before H and f after H′. Measured from the vertices, where the faces meet the axis (V₁ on the face toward the laser, V₂ on the other, both marked on the figure), positive in the direction of the light ${cite(1, 2, 5)}:</p>`,
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
        html: `<p>A collimated Gaussian laser beam of 1/e² radius w does not focus to a point but to a waist. Between the principal planes the lens acts as a thin one, so the <a href="../gaussian-beam/">Gaussian beam</a> calculator’s thin-lens equations apply with distances from H and H′ ${cite(6, 7)}; for a collimated beam they reduce to</p>`,
        formulas: [
          { tex: String.raw`w_0' \approx \frac{\lambda f}{\pi w},\qquad z_R' = \frac{\pi w_0'^2}{\lambda},\qquad \theta = \frac{w_0'}{z_R'}`, caption: 'w₀′ is the focused waist, z_R′ its Rayleigh range and θ the half angle of the focused beam; the page gives sin θ as the beam’s focusing NA.' },
        ],
        html2: '<p>The example lens focuses a 2 mm beam at 1550 nm to a 5.4 µm waist, 9.741 mm after the back vertex, with a Rayleigh range of 59.7 µm, converging at 90.91 mrad: a focusing NA of 0.0908. A lens of clear diameter D passes 1 − exp(−2D²/d²) of a beam of 1/e² diameter d; the page says when it cuts more than a trace.</p><p>That is the ideal lens. To see a real one, the page follows two lenses through focus: an <b>ideal thin lens</b> of the same focal length, and the <b>real singlet</b>, its rays traced through both spherical faces by the lens design page’s ray tracer. Both are lit by the same beam and limited by the same clear aperture.</p>',
      },
      { id: 'real', title: 'The real singlet: spherical aberration',
        html: `<p>The ideal lens is taken to be <b>aplanatic</b>: it sends a ray entering at height h toward the focus at an angle θ with sin θ = h/f, the sine condition for an object at infinity ${cite(3)}. A lens that obeyed the thin-lens rule exactly (tan θ = h/f) would spread its outer rays over less angle and widen the example’s focus by 0.4 %; the aplanatic ideal focuses the example’s beam to within 0.11 % of the Gaussian formula’s waist, slightly tighter, as that formula is the limit of small angles.</p><p>A spherical singlet is neither. Its outer rays cross the axis before F′ (spherical aberration), so its wavefront W, the optical path of each ray compared with a perfect spherical wave, grows toward the rim of the pupil. The page computes the focus of both lenses from their wavefronts by scalar diffraction. On the axis everything is symmetric about it, so the field at a distance r from the axis is a one-dimensional integral over the pupil radius ρ: the Debye integral, as on the <a href="../lens-design/">Lens design</a> page, a sum of plane waves that the angular spectrum method carries to any other plane ${cite(8)}:</p>`,
        formulas: [
          { tex: String.raw`U(r) = 2\pi\int_0^1 A(\rho)\sqrt{\frac{J(\rho)}{\cos\theta}}\;e^{-2\pi i W(\rho)}\,J_0\!\left(\frac{2\pi\,s(\rho)\,r}{\lambda}\right)\rho\,d\rho`, caption: 'A is the beam’s amplitude in the pupil, s the sine of each ray’s angle to the axis as it reaches the plane of interest, J = (s/ρ) ds/dρ the way the pupil’s area maps onto directions, and J₀ a Bessel function. A ray of power A² per unit area of the pupil spans the solid angle J/cos θ there, and the plane waves of the integral are summed over directions divided by cos θ once more, hence √(J/cos θ): for the aplanat, the usual √cos θ apodization. W is measured on the reference sphere about the paraxial focus F′; at a plane Δz further on, each plane wave of the integral gains the phase 2πΔz(cos θ − 1)/λ relative to the axial one (the Debye–Wolf form).' },
        ],
        html2: '<p>The peak intensity relative to that of the same pupil with W = 0 is the <b>Strehl ratio</b>; 0.8 is the usual mark of a diffraction-limited focus. With the example’s 2 mm beam the singlet reaches only 0.39 at its paraxial focus F′. Its brightest plane lies 111.8 µm closer to the lens, where the Strehl ratio is 0.695 and the spot radius 7.3 µm, against 5.4 µm for the ideal lens. Turned round, flat side first, the same lens makes the curved face do all the bending: the best Strehl ratio falls to 0.401, 268.4 µm before F′. The shape matters too: designed for the same f, an equi-convex lens reaches 0.639 and the best form 0.72. With a 1 mm beam the plano-convex singlet is nearly perfect (0.99): the wavefront error grows as the fourth power of the beam radius.</p><p>How much of such a focus a single-mode fiber accepts, and where the fiber should sit, is the subject of the <a href="../fiber-coupling/">Free space to fiber coupling</a> calculator, which traces these singlets with this page’s model.</p><p>The page does not plot the focal spot itself: the Strehl ratio says how much of the ideal peak is left. The spot radius is the radius that holds 86.5 % of the power: for a Gaussian beam it is the 1/e² radius, and it stays meaningful for a beam whose aberrations give it rings or a halo, where the 1/e² point of the profile does not.</p>',
      },
      { id: 'precision', title: 'Precision and limits',
        html: '<p>An independent Python reference checks the lens data and the colour against the thick-lens formulas, from its own Sellmeier data, to 10⁻⁹; the designed lenses by solving the thick-lens formula for f again, to 10⁻⁹; the Gaussian focus by carrying the complex beam parameter through both refracting surfaces, to 10⁻⁹; and the real singlet with rays from its own tracer, integrating the focus by Gauss–Legendre quadrature, to 10⁻⁴ (the page samples the pupil radius 1024 times, or 4096 when the wavefront needs it, and integrates by Simpson’s rule with at least four steps per wave). Through focus the ideal lens follows the Gaussian beam’s radius to 2 × 10⁻³ at the example’s convergence, and more closely for slower beams, where the paraxial formulas are better. At the focus the ideal lens matches the Gaussian waist to 1.1 × 10⁻³.</p><p>Limits. Everything is on the axis. The beam is a collimated TEM₀₀ beam with its waist at the lens, at one wavelength; the focus is scalar, so it ignores polarization, which a note flags above an NA of 0.6, and it rests on the Debye approximation, which a note flags when the Fresnel number of the lit pupil, a²/(λf), falls below 10. Absorption, reflections and tolerances are not included. The lens’s edge must not be thinner than zero: a lens whose faces cross at its clear diameter is shown as an ideal lens only. A lens whose F′ lies inside the glass or before it has no focus in air, and shows none; a singlet wavefront too steep to integrate on 4096 samples is refused, and a spot wider than the page integrates is left unmeasured, as a note says.</p>',
      },
    ],
    references: [LENS, CARDINAL, ABBE, SPHERICAL, BSC_GAUSSIAN, SELF, KOGELNIK, BSC_SPECTRUM],
  },
];
