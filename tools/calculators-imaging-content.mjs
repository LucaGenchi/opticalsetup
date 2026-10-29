// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Content of the imaging page. Every number quoted in the text is
// recomputed by test/calculator-imaging.test.js.

const cite = (...n) => n.map(k => `<a class="cite" href="#ref-${k}">[${k}]</a>`).join('');
const GITHUB = 'https://github.com/LucaGenchi/opticalsetup/blob/main';

const LENS = { label: 'Wikipedia, “Lens (optics)”: the thin-lens formula, magnification and Newton’s form, real and virtual images, the lensmaker’s equation with thickness and the principal planes, two lenses a distance apart and the afocal pair.', url: 'https://en.wikipedia.org/wiki/Lens' };
const BSC_GAUSSIAN = { label: 'S. A. Konijnenberg, A. J. H. Adam and H. P. Urbach, BSc Optics (TU Delft Open, 2021), §2.6 “Gaussian geometrical optics”: ray matrices and the imaging condition, imaging with a thin lens and Newton’s equation, two thin lenses, and the thick lens’s principal planes.', url: 'https://phys.libretexts.org/Bookshelves/Optics/BSc_Optics_(Konijnenberg_Adam_and_Urbach)/02%3A_Geometrical_Optics/2.06%3A_Gaussian_Geometrical_Optics' };
const REFRACTOR = { label: 'Wikipedia, “Refracting telescope”: the Galilean telescope (a diverging eyepiece, no intermediate focus, an upright image), the Keplerian telescope (a converging eyepiece, an inverted image), and the magnification as the ratio of the focal lengths.', url: 'https://en.wikipedia.org/wiki/Refracting_telescope' };
const EXPANDER = { label: 'Wikipedia, “Beam expander”: the Galilean telescope as a beam expander, which never focuses a collimated beam to a point.', url: 'https://en.wikipedia.org/wiki/Beam_expander' };
const CARDINAL = { label: 'Wikipedia, “Cardinal point (optics)”: focal points, principal planes (crossed at equal heights) and nodal points (crossed at equal angles), which coincide with the principal points in air; afocal systems have none.', url: 'https://en.wikipedia.org/wiki/Cardinal_point_(optics)' };
const FOURIER = { label: 'Wikipedia, “Fourier optics”: a lens forms the Fourier transform of a field in its back focal plane; the 4F correlator, with its input one focal length before the first lens, its filter plane one focal length after it, and its output in the back focal plane of the second.', url: 'https://en.wikipedia.org/wiki/Fourier_optics' };

export const imagingCalculators = [
  {
    slug: 'imaging', title: 'Imaging with lenses', script: 'page.js',
    card: 'Where a lens images an object, thin or thick, real or virtual, drawn to scale; and two lenses as a Keplerian or Galilean telescope, a beam expander or a 4f relay.',
    summary: 'Place an object before a lens, an ideal thin lens or a spherical singlet given by its focal length or its radii, converging or diverging. Read where the image forms, how large, real or virtual, with the construction rays drawn to scale through the lens’s principal planes, and how the image moves as the object does. Then combine two lenses: a Keplerian or Galilean telescope and beam expander, a 4f relay, or a pair at any spacing, with the thin-lens model beside the thick lenses throughout.',
    facts: [
      { label: 'Model', html: 'Paraxial (first-order) imaging by ideal thin lenses and spherical singlets in air, exact for rays close to the axis, with each singlet’s thin-lens model beside it. No aberrations, no apertures or stops.' },
      { label: 'Evidence', html: `Checked against an independent Python reference: Gaussian imaging from the principal planes lens by lens ${cite(1, 2)}, Newton’s form for afocal pairs, the two-lens focal length and principal planes in closed form, and the concave singlets designed again by the secant method. See the <a href="${GITHUB}/docs/validation.md" target="_blank" rel="noopener">validation table</a>.` },
      { label: 'Code', html: `The <a href="${GITHUB}/calculators/imaging/imaging.js" target="_blank" rel="noopener">calculator’s module</a> takes each singlet’s lens data and convex designs from the <a href="../thin-thick-lens/">Thin and thick lens</a> calculator, with glass data from the canvas’s <a href="${GITHUB}/sketch/js/glass.js" target="_blank" rel="noopener">catalogue</a>; “Open in the canvas” opens the setup with the canvas’s Lens or Thick spherical lens, lit by a point source at the object’s tip or by a laser beam.` },
    ],
    layout: [
      { form: 'calc', preview: 'Open in the canvas', results: 'key', resultsLabel: 'Key results', label: 'Object and lens' },
      { output: true, label: 'Results', results: [['lens', 'The lens'], ['image', 'The image']] },
      { graphs: true },
    ],
    graphs: [
      { id: 'image', title: 'Image distance against object distance', note: 'Where the image forms, after the back vertex V₂ (negative: a virtual image before it), as the object moves away from the front vertex V₁: the thick lens beside the thin-lens formula with the same radii and distances from the lens’s centre. Near the front focal point F the image runs off to infinity; the graph leaves out what lies far beyond its scale.' },
      { id: 'magnification', title: 'Magnification against object distance', note: 'The lateral magnification m, the image’s height over the object’s: negative for an inverted image, above 1 in size for an enlarged one.' },
    ],
    panels: [{ id: 'pair', title: 'Two lenses: telescopes, beam expanders and relays',
      intro: 'Two lenses in a row. Spaced afocal, F′ of the first on F of the second, they make a telescope or beam expander, and with an object in the first lens’s front focal plane a 4f relay; at any other gap, one lens of their combined focal length.',
      layout: [
        { form: 'pair', preview: 'Open in the canvas', results: 'pair-key', resultsLabel: 'Key results', label: 'Two lenses' },
        { output: true, label: 'Results', results: [['pair-l1', 'Lens 1'], ['pair-l2', 'Lens 2'], ['pair-system', 'The pair'], ['pair-image', 'The light through it']] },
        { graphs: true },
      ],
      graphs: [
        { id: 'pair-image', title: 'Image distance against object distance, two lenses', note: 'Where the pair images an object, after lens 2’s back vertex, as the object moves away from lens 1’s front vertex: the thick lenses beside their thin-lens model. Spaced afocal, the line is straight: the image moves (f₂/f₁)² times as far as the object.' },
        { id: 'pair-magnification', title: 'Magnification against object distance, two lenses', note: 'The pair’s lateral magnification. Spaced afocal, it is −f₂/f₁ wherever the object stands.' },
      ] }],
    sections: [
      { id: 'image', title: 'One lens: object and image',
        html: `<p>A lens images every point of an object near its axis to a point. With distances measured from the lens’s principal planes, an object a distance s before the front one, H, forms its image a distance s′ after the back one, H′, as for a thin lens ${cite(1, 2)}:</p>`,
        formulas: [
          { tex: String.raw`\frac{1}{s}+\frac{1}{s'} = \frac{1}{f},\qquad m = -\frac{s'}{s},\qquad x\,x' = f^2\quad (x = s-f,\; x' = s'-f)`, caption: 's is positive for an object before the lens, s′ positive for an image after it, where the light converges (a real image, which a screen can catch); a negative s′ is a virtual image, before the lens, from which the light seems to diverge. m is the lateral magnification, negative for an inverted image. x and x′ (Newton’s form) are measured from the focal points F and F′.' },
        ],
        html2: `<p>The page does not place the principal planes first. It takes the lens’s ray-transfer matrix from its front vertex V₁ to its back vertex V₂, which carries a ray’s height y and slope u through both faces ${cite(2)}, and asks where the rays from one object point meet again:</p>`,
        formulas2: [
          { tex: String.raw`\begin{pmatrix} y_2 \\ u_2 \end{pmatrix} = \begin{pmatrix} A & B \\ C & D \end{pmatrix}\begin{pmatrix} y_1 \\ u_1 \end{pmatrix},\qquad s'_{V} = -\frac{A\,d + B}{C\,d + D},\qquad m = A + C\,s'_{V}`, caption: 'd is the object’s distance before V₁ and s′_V the image’s after V₂. f = −1/C, and the principal planes follow from the matrix too. A singlet’s matrix comes from the thin and thick lens page; an ideal thin lens is [[1, 0], [−1/f, 1]].' },
        ],
        html3: '<p>The page’s example is a bi-convex lens of N-BK7 with R = ±20 mm, t = 5 mm and D = 12 mm, at 588 nm, where n = 1.51678. Its f is 20.21 mm, with H and H′ 1.722 mm inside each face. An object 50 mm before V₁ stands 51.72 mm before H; its image forms 33.18 mm after H′, so 31.45 mm after V₂: real, inverted and reduced, m = −0.6414. In Newton’s form x = 31.51 mm and x′ = 12.96 mm, whose product is f² = 408.5 mm².</p>',
      },
      { id: 'rays', title: 'Construction rays, to scale',
        html: `<p>The figure draws three rays from the object’s tip, each traced through both faces: one parallel to the axis, which leaves through F′; one through F, which leaves parallel; and one aimed at H, which leaves H′ at the angle it came in, as H and H′ are also the nodal points of a lens in air ${cite(6)}. The dashed lines carry each incoming ray forward to H and each outgoing ray back to H′: they meet those planes at equal heights, which is what makes H and H′ the principal planes ${cite(2, 6)}. Where the rays leave the lens diverging, their backward extensions, dashed, meet at the virtual image.</p>`,
        html2: '<p>Moved to 15 mm before V₁, inside F (18.49 mm before V₁), the object of the example gives a virtual, upright image 98.57 mm before V₂, magnified 5.792 times: the lens is a magnifying glass. The same radii made bi-concave give a diverging lens, f = −18.56 mm, and the object 50 mm away a virtual, upright, reduced image 15.23 mm before V₂, m = 0.2646. A diverging lens forms such an image of any real object.</p><p>The rays are paraxial: the figure draws them where the paraxial equations put them, even outside the lens’s clear diameter, where a note says so. They locate the image; the light that passes the lens forms it all the same.</p>',
      },
      { id: 'thin', title: 'The thin-lens model',
        html: `<p>A singlet is often treated as a thin lens at its centre, its focal length from the lensmaker’s equation without the thickness term ${cite(1)}. Two things are lost: the thickness changes f, and the distances are measured from the centre instead of from H and H′. For the example, the thin-lens formula gives f = 19.35 mm and puts the image 28.15 mm after V₂ (m = −0.5837), 3.308 mm short of the thick lens’s 31.45 mm. The graphs show the thin-lens model beside the thick lens for every object distance. A plano-convex or plano-concave lens keeps its f with any thickness, but its principal planes still move: one stays on the curved vertex, the other lies t/n inside the flat face.</p>`,
      },
      { id: 'telescope', title: 'Two lenses afocal: telescopes and beam expanders',
        html: `<p>When the back focal point F′ of a first lens falls on the front focal point F of a second, parallel light entering the pair leaves it parallel: the pair is afocal ${cite(1, 2)}. Their principal planes, H′ of the first and H of the second, are then f₁ + f₂ apart. In the pair’s matrix C = 0, and the angle and width of a beam change by fixed ratios ${cite(1, 3)}:</p>`,
        formulas: [
          { tex: String.raw`\overline{H_1'H_2} = f_1+f_2,\qquad M_\theta = D = -\frac{f_1}{f_2},\qquad \frac{y_2}{y_1} = A = -\frac{f_2}{f_1}`, caption: 'M_θ is the angular magnification (paraxial: angles scale by it), A the ratio of a beam’s widths out and in. Lens 1 is the one the light meets first: a telescope magnifies angles with the long-focus objective first, a beam expander widens a beam with the short-focus lens first.' },
        ],
        html2: `<p>With two converging lenses the pair is a <b>Keplerian</b> telescope: M_θ is negative, so the image is inverted, and the light comes to a real focus between the lenses. With a diverging lens it is a <b>Galilean</b> one: M_θ is positive and the image upright, and there is no focus inside ${cite(3)}, so a collimated beam is never concentrated to a point between the lenses ${cite(4)}; and as f₁ + f₂ is then a difference, it is shorter than a Keplerian pair of the same magnification.</p><p>The example pair is two plano-convex N-BK7 lenses designed for f = 50 and 150 mm at 633 nm, 25.4 mm across with a 2 mm edge, each with its curved side toward the collimated beam. Afocal, their vertices are 194.46 mm apart, H′ of the first lying 3.531 mm inside its glass. A 5 mm beam leaves 15 mm wide, and a beam tilted by 1° leaves at −0.3333°. Spaced f₁ + f₂ between their centres, as the thin-lens model would place them, the gap would be 1.344 mm too long. A plano-concave first lens of f = −50 mm makes a Galilean expander instead: 96.01 mm between the vertices, 102.06 mm from the first to the last, and the tilted beam leaves at +0.3333°, upright.</p>`,
      },
      { id: 'relay', title: 'The 4f relay and the Fourier plane',
        html: `<p>An afocal pair also images objects at a finite distance, with the same magnification wherever the object stands. Newton’s form, applied to each lens with F′ of the first on F of the second, shows how far the image moves ${cite(1, 2)}:</p>`,
        formulas: [
          { tex: String.raw`m = -\frac{f_2}{f_1},\qquad x_2' = -\left(\frac{f_2}{f_1}\right)^{2} x_1`, caption: 'x₁ is the object’s distance before F of lens 1, x₂′ the image’s after F′ of lens 2. An object moved by Δ moves its image by (f₂/f₁)²Δ, the longitudinal magnification, in the same direction.' },
        ],
        html2: `<p>With the object in the front focal plane of lens 1 (x₁ = 0), its image lies in the back focal plane of lens 2: the 4f system. Between them, lens 1’s back focal plane holds the Fourier transform of the object’s field, its angular spectrum, where a mask can filter it ${cite(5)}. The example pair relays an object 50 mm before its curved front vertex, where H lies, to 150 mm after lens 2, with m = −3; its Fourier plane lies 46.47 mm after lens 1’s back vertex. The thin-lens model, its lenses at their centres, puts the image 124.4 mm after lens 2: an error along the axis is multiplied by (f₂/f₁)² = 9.</p>`,
      },
      { id: 'pair', title: 'Two lenses at any spacing',
        html: `<p>At any other spacing the pair acts as one lens, with a focal length and principal planes of its own, from the distance e between H′ of the first lens and H of the second ${cite(1, 2)}:</p>`,
        formulas: [
          { tex: String.raw`\frac{1}{f} = \frac{1}{f_1}+\frac{1}{f_2}-\frac{e}{f_1 f_2}`, caption: 'For thin lenses e is the distance between them. As e → f₁ + f₂ the power 1/f goes to zero: the afocal pair.' },
        ],
        html2: '<p>The page multiplies the matrices instead: the pair is L₂ T(g) L₁, with g the gap between the vertices, and the image, f and principal planes follow as for one lens. The example pair at a 100 mm gap makes one lens of f = 79.40 mm whose F′ lies 88.21 mm before lens 2’s back vertex: the light of a collimated beam leaves diverging, as if from a point there. The thin-lens model gives f = 78.29 mm.</p>',
      },
      { id: 'precision', title: 'Precision and limits',
        html: '<p>An independent Python reference checks the lens data, the images and the two-lens systems to 10⁻⁹ relative: a single lens by the Gaussian formula from its principal planes, from its own Sellmeier data and the thick-lens formulas; a pair lens by lens, the image of the first being the object of the second, or by Newton’s form when it is afocal; the pair’s f and principal planes in closed form; and the concave singlets designed again from their focal length by the secant method. It also computes where each refusal sets in (a radius reaching the clear radius, faces meeting at the rim, f₁ + f₂ = 0 spaced afocal, lenses touching at their rims) and checks that the page accepts just inside and refuses just outside. The figures and graphs evaluate the same matrices.</p><p>Limits. Everything is paraxial and in air: the image of a point near the axis, through lenses without aberrations, so a steep ray from a tall or near object is imaged where the paraxial equations put it, not where a real lens sends it; the Lens design page traces real rays. No aperture or stop limits the light: the rays drawn are construction aids, and the field angle (up to 10°) is magnified in the paraxial sense. The object is real, before the first lens, at one wavelength. Singlets are plano or bi-convex and bi-concave, without menisci; a singlet whose faces cross before its clear diameter, or whose radius is smaller than its clear radius, is refused, and so is a pair whose lenses would overlap. Lenses closer than 0.06 mm, in contact, are computed but not opened in the canvas, which traces two optics that close as one.</p>',
      },
    ],
    references: [LENS, BSC_GAUSSIAN, REFRACTOR, EXPANDER, FOURIER, CARDINAL],
  },
];
