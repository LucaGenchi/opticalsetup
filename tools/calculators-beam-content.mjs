// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Content of the Gaussian beam and fiber coupling pages. Every number quoted
// in the text is recomputed by test/calculator-beams.test.js.

const cite = (...n) => n.map(k => `<a class="cite" href="#ref-${k}">[${k}]</a>`).join('');
const evidence = method => `Checked against an independent Python reference that uses a different method: ${method}. These checks do not establish experimental accuracy.`;
const GITHUB = 'https://github.com/LucaGenchi/opticalsetup/blob/main';

const KOGELNIK = { label: 'H. Kogelnik and T. Li, “Laser beams and resonators,” Appl. Opt. 5, 1550–1567 (1966).', url: 'https://doi.org/10.1364/AO.5.001550' };
const SELF = { label: 'S. A. Self, “Focusing of spherical Gaussian beams,” Appl. Opt. 22, 658–661 (1983).', url: 'https://doi.org/10.1364/AO.22.000658' };
const SIEGMAN = { label: 'A. E. Siegman, Lasers (University Science Books, 1986), chapters 16–17: Gaussian beams and their propagation.', url: 'https://search.worldcat.org/isbn/9780935702118' };
const ISO = { label: 'ISO 11146-1:2021, Lasers and laser-related equipment — Test methods for laser beam widths, divergence angles and beam propagation ratios — Part 1: Stigmatic and simple astigmatic beams.', url: 'https://www.iso.org/standard/77769.html' };
const GLOGE = { label: 'D. Gloge, “Weakly guiding fibers,” Appl. Opt. 10, 2252–2258 (1971).', url: 'https://doi.org/10.1364/AO.10.002252' };
const MARCUSE = { label: 'D. Marcuse, “Loss analysis of single-mode fiber splices,” Bell Syst. Tech. J. 56, 703–718 (1977).', url: 'https://doi.org/10.1002/j.1538-7305.1977.tb00534.x' };
const JOYCE = { label: 'W. B. Joyce and B. C. DeLoach, “Alignment of Gaussian beams,” Appl. Opt. 23, 4187–4196 (1984).', url: 'https://doi.org/10.1364/AO.23.004187' };

export const beamCalculators = [
  {
    slug: 'gaussian-beam', title: 'Gaussian beam', script: 'page.js',
    card: 'Waist, Rayleigh range, divergence and beam size at any distance; focusing by a thin lens, with M².',
    summary: 'Give a laser beam by its waist, divergence or Rayleigh range, and read its size, wavefront curvature and Gouy phase at any distance. Add a thin lens to see where the beam focuses and how small the spot is.',
    facts: [
      { label: 'Model', html: 'Paraxial Gaussian beam (TEM₀₀, or the embedded Gaussian of an M² beam) in a uniform medium; an ideal thin lens by Self’s equations.' },
      { label: 'Evidence', html: evidence('ABCD propagation of the complex beam parameter') },
      { label: 'Code', html: `The <a href="${GITHUB}/calculators/gaussian-beam/gaussian-beam.js">calculator’s module</a>, and the <a href="${GITHUB}/validation/reference/gaussian_beam.py">Python reference</a>.` },
    ],
    graphs: [
      { id: 'caustic', title: 'Beam radius along the axis', note: 'The 1/e² radius against distance from the input waist; the dot is the reading point. With a lens, the beam after it is the focused one.' },
      { id: 'curvature', title: 'Wavefront curvature', note: '1/R in 1/m: zero at a waist (a flat wavefront), positive where the beam diverges, negative where it converges.' },
    ],
    columns: [
      { form: 'calc', results: 'beam', label: 'The beam at its waist' },
      { form: 'lens', results: 'focus', label: 'After the lens' },
      { output: true, label: 'At the reading point' },
    ],
    sections: [
      { id: 'beam', title: 'The Gaussian beam',
        html: `<p>Most lasers emit, or can be cleaned up to, a beam whose intensity falls off from its axis as a Gaussian. Such a beam keeps its Gaussian shape as it travels: only its width and the curvature of its wavefront change ${cite(1, 3)}. Its width is given as the radius w where the intensity has fallen to 1/e² (13.5 %) of the peak; 86.5 % of the power lies inside it.</p>`,
        formulas: [
          { tex: String.raw`I(r, z) = \frac{2P}{\pi w(z)^2}\,e^{-2r^2/w(z)^2},\qquad w(z) = w_0\sqrt{1+\left(\frac{z}{z_R}\right)^2},\qquad z_R = \frac{\pi w_0^2 n}{\lambda}`, caption: 'w₀ is the waist, the narrowest radius; z is the distance from it; λ the vacuum wavelength and n the index of the medium.' },
        ],
        html2: '<p>The <b>Rayleigh range</b> z<sub>R</sub> divides the near field from the far field. Within ±z<sub>R</sub> of the waist the beam stays nearly parallel: at z<sub>R</sub> its radius has grown by √2 and its area doubled. Far beyond, the radius grows linearly with distance, at the divergence angle θ. The wavefront is flat at the waist, most curved at z = z<sub>R</sub>, and flat again far away, where it looks like a spherical wave from the waist. The Gouy phase ψ is an extra phase the beam picks up through its focus: 90° from the waist to the far field, 180° from far before to far after.</p>',
        formulas2: [
          { tex: String.raw`\theta = \frac{\lambda}{\pi n w_0},\qquad R(z) = z\left[1+\left(\frac{z_R}{z}\right)^2\right],\qquad \psi(z) = \arctan\frac{z}{z_R}` },
        ],
        html3: '<p>Waist and divergence trade against each other: their product w₀θ = λ/(πn), the <b>beam parameter product</b>, is fixed by the wavelength. A beam twice as wide spreads half as fast. With the page’s example, a 1064 nm beam with a 0.5 mm waist, the Rayleigh range is 738 mm and the half-angle divergence 0.677 mrad; 1 m from the waist the radius is 0.842 mm and the wavefront’s radius of curvature 1.54 m. At 1 W its peak intensity is 255 W/cm² at the waist and 89.8 W/cm² there.</p>',
      },
      { id: 'm2', title: 'Beam quality M²',
        html: `<p>Real beams spread faster than an ideal Gaussian of the same waist. The beam propagation ratio M² measures by how much: it is the beam parameter product relative to the ideal one, measured from second-moment widths ${cite(4)}. Such a beam still follows the Gaussian formulas with λ replaced by M²λ, the <b>embedded Gaussian</b> rule ${cite(2, 4)}:</p>`,
        formulas: [
          { tex: String.raw`z_R = \frac{\pi w_0^2 n}{M^2\lambda},\qquad \theta = \frac{M^2\lambda}{\pi n w_0},\qquad w_0\theta = \frac{M^2\lambda}{\pi n}` },
        ],
        html2: `<p>So the 0.5 mm, 1064 nm beam with M² = 1.5 has a Rayleigh range of 492 mm instead of 738 mm, and diverges at 1.02 mrad. The widths are then second-moment widths, the radius 2σ and the diameter D4σ of ISO 11146 ${cite(4)}, which equal the 1/e² widths only for a Gaussian profile; the page labels them so. M² says nothing about the shape of the profile, so for M² &gt; 1 the page gives no peak intensity, half-maximum diameter or Gouy phase.</p>`,
      },
      { id: 'lens', title: 'Focusing with a thin lens',
        html: `<p>A thin lens turns one Gaussian beam into another. Self’s equations give the new waist and where it forms, for an input waist a distance s before a lens of focal length f ${cite(2)}:</p>`,
        formulas: [
          { tex: String.raw`w_0' = \frac{w_0}{\sqrt{\left(1-s/f\right)^2+\left(z_R/f\right)^2}},\qquad s'' = f + \frac{(s-f)\,f^2}{(s-f)^2+z_R^2}`, caption: 's″ is the distance from the lens to the new waist; negative means a virtual waist before the lens.' },
        ],
        html2: '<p>Two limits are worth knowing. A beam that reaches the lens collimated (its waist at the lens, z<sub>R</sub> ≫ f) focuses to w₀′ ≈ λf/(πw₀) at almost exactly f. A 1064 nm beam with a 1 mm waist and a 100 mm lens gives a 33.8 µm waist at 99.89 mm. But when z<sub>R</sub> is not much longer than f, the waist forms well short of the focal point: with a 0.25 mm waist (z<sub>R</sub> = 185 mm) the same lens focuses at 77.3 mm. Ray optics would put both at 100 mm. A waist placed at the front focal plane (s = f) comes out at the back focal plane, magnified by f/z<sub>R</sub>: a 50 µm HeNe waist becomes 403 µm.</p>',
      },
      { id: 'precision', title: 'Precision and limits',
        html: '<p>An independent Python reference propagates the complex beam parameter q with ABCD matrices, finds the waist after a lens where q is imaginary, and recovers a waist from a divergence by bisection on the far-field limit. It never uses the closed forms above. The page agrees with it to 10⁻⁹ relative, through converging, imaging, virtual-waist and diverging lenses.</p><p>The formulas are paraxial: they hold while the beam’s angles are small, roughly below 0.1 rad, so a waist of a few wavelengths or less is outside them. The page refuses a beam whose half-angle divergence exceeds 0.3 rad, before or after the lens, and warns above 0.1 rad after it. The lens is ideal and thin, with no aberrations or clipping. An aperture of radius a passes 1 − exp(−2a²/w²) of a TEM₀₀ beam: 99 % at a = 1.52 w, 99.99 % at a = 2.15 w. The medium is uniform and lossless. Widths are 1/e² intensity values for TEM₀₀ and second-moment values for M² &gt; 1.</p>',
      },
    ],
    references: [KOGELNIK, SELF, SIEGMAN, ISO],
  },
  {
    slug: 'fiber-coupling', title: 'Free space to fiber coupling', script: 'page.js',
    card: 'Couple a collimated laser beam into a single-mode fiber: the lens that matches the mode, a plano-convex lens to start from, and real singlets traced with their aberrations, against lateral, axial and angular offset.',
    summary: 'Give the laser (its wavelength and the size of its TEM₀₀ beam) and the single-mode fiber (its LP₀₁ mode, close to a Gaussian), and the page finds the ideal thin lens that couples the most light: the one that focuses the beam to the size of the mode. It then designs a plano-convex lens of that focal length to start from. Below, model a real lens, plano-convex or bi-convex, to estimate its coupling efficiency and see how it falls as the fiber moves away from its best position: across the axis, along it, or tilted.',
    facts: [
      { label: 'Model', html: 'Overlap of a focused TEM₀₀ beam with the fiber’s exact fundamental mode LP₀₁ (that of a step-index fiber of the same V), through an ideal thin lens; the suggested plano-convex lens and the singlets of the second part traced by the <a href="../thin-thick-lens/">Thin and thick lens</a> calculator’s engine.' },
      { label: 'Evidence', html: `${evidence('the exact fiber mode from its Bessel-function equation, and numerical overlap integrals on the fiber face')} The singlets are the Thin and thick lens calculator’s model, checked by that page’s own reference.` },
      { label: 'Code', html: `The <a href="${GITHUB}/calculators/fiber-coupling/fiber-coupling.js">calculator’s module</a>, its <a href="${GITHUB}/calculators/fiber-coupling/lp01.js">exact fiber mode</a>, its <a href="${GITHUB}/calculators/fiber-coupling/lens-choice.js">lens choice</a>, its <a href="${GITHUB}/calculators/fiber-coupling/real-lens.js">real lenses</a> and the <a href="${GITHUB}/validation/reference/fiber_coupling.py">Python reference</a>; the singlets are traced by the <a href="${GITHUB}/calculators/thin-thick-lens/thick-lens.js">Thin and thick lens module</a>.` },
    ],
    layout: [
      { stage: 'calc', right: 'fiber', label: 'Laser and fiber', side: [['mode', 'The fiber mode']] },
      { output: true, label: 'The lens to use', results: [['ideal', 'The ideal thin lens'], ['planoconvex', 'A plano-convex lens to start from']] },
    ],
    graphs: [
      { id: 'focal', wide: true, title: 'Coupling efficiency against focal length', note: 'An ideal thin lens, perfectly aligned, into the exact LP₀₁ mode; the line marks the focal length that matches the mode.' },
    ],
    panels: [{ id: 'lens', title: 'Coupling with real lenses',
      intro: 'A spherical singlet of your choosing, plano-convex either way round or bi-convex, given by its focal length or by its radii and thickness as on the <a href="../thin-thick-lens/">Thin and thick lens</a> page, focusing the laser above into the fiber above. It is traced with its spherical aberration, beside the ideal thin lens of the same focal length; each fiber sits at its own lens’s best position on the axis, and the graphs move it from there.',
      layout: [
        { form: 'lens', label: 'Lens', side: [['lens-key', 'The lens']] },
        { output: true, label: 'Coupling', results: [['lens-real', 'The singlet'], ['lens-ideal', 'Ideal thin lens, same f']] },
        { graphs: true },
      ],
      graphs: [
        { id: 'lateral', title: 'Coupling against lateral offset', note: 'The coupling efficiency as the fiber’s core moves off the axis, at its best position along it and untilted. The focus is round, so the offset’s direction does not matter.' },
        { id: 'axial', title: 'Coupling against axial position', note: 'The coupling efficiency with the fiber’s core on the axis, against its distance from F′, negative toward the lens.' },
        { id: 'tilt', title: 'Coupling against angular offset', note: 'The coupling efficiency as the fiber turns about its core, at its best position on the axis.' },
      ] }],
    sections: [
      { id: 'mode', title: 'The fiber mode',
        html: `<p>A single-mode fiber guides one field pattern, its fundamental mode LP₀₁. For a step-index fiber with core radius a and numerical aperture NA, the mode depends on one number, V ${cite(1)}:</p>`,
        formulas: [
          { tex: String.raw`V = \frac{2\pi a\,\mathrm{NA}}{\lambda},\qquad \text{single mode for } V < 2.405,\qquad \lambda_c = \frac{2\pi a\,\mathrm{NA}}{2.405}`, caption: '2.405 is the first zero of the Bessel function J₀; above it the next mode, LP₁₁, is guided too. λ_c is the cutoff wavelength.' },
        ],
        html2: `<p>The mode is a Bessel function J₀ in the core and a decaying K₀ in the cladding, whose parameters u and w follow from V ${cite(1)}:</p>`,
        formulas2: [
          { tex: String.raw`\frac{u\,J_1(u)}{J_0(u)} = \frac{w\,K_1(w)}{K_0(w)},\quad u^2 + w^2 = V^2,\qquad E(r) = \begin{cases} J_0(ur/a)/J_0(u), & r \le a \\ K_0(wr/a)/K_0(w), & r \ge a \end{cases}` },
        ],
        html3: `<p>It is very nearly Gaussian ${cite(2)}, but not exactly. The Gaussian that couples to it best, of radius w<sub>m</sub> (the mode-field diameter is 2w<sub>m</sub>), couples 94.4 % at V = 1.2, 97.7 % at V = 1.6, 99.2 % at V = 2 and 99.7 % at V = 2.405. That is the most any TEM₀₀ beam can couple, through any lens, so the page couples into the exact mode: a Gaussian model of the mode would reach 100 %. (Marcuse’s fit, w<sub>m</sub>/a = 0.65 + 1.619 V<sup>−3/2</sup> + 2.879 V<sup>−6</sup>, gives w<sub>m</sub> within 1 %; the page solves the mode instead.) A fiber with an 8.2 µm core and NA 0.14 has V = 2.33 at 1550 nm, a cutoff at 1500 nm and a 9.146 µm mode-field diameter. Real fibers are not ideal step-index profiles; their datasheets quote a measured mode-field diameter (usually by the Petermann II definition) and a cutoff wavelength. From those the page takes V = 2.405 λ<sub>c</sub>/λ and sizes the step-index mode at that V to the datasheet’s diameter. The example, 10.4 µm with a 1260 nm cutoff, has V = 1.955 at 1550 nm, the mode of an 8.09 µm core, and couples at most 99.06 %. The page accepts 1.2 ≤ V ≤ 5, where the reference checks it; above 2.405 the fiber is no longer single-mode, and the page couples into LP₀₁ only.</p>`,
      },
      { id: 'focus', title: 'Choosing the lens',
        html: `<p>The lens should focus the beam to the size of the mode. A collimated beam of radius w at the lens focuses to w′ = w f/√(f² + z<sub>R</sub>²), where z<sub>R</sub> is the input beam’s Rayleigh range ${cite(5)}, so the lens that matches the mode exactly is</p>`,
        formulas: [
          { tex: String.raw`f = \frac{w_m\,z_R}{\sqrt{w^2-w_m^2}} \approx \frac{\pi w\,w_m}{\lambda}` },
        ],
        html2: '<p>For the example, a 2 mm beam at 1550 nm onto a 10.4 µm mode, that is 10.54 mm, and it couples 99.06 %, the mode’s best. The match is forgiving: a waist 10 % too large still couples 98.3 %, 25 % too large 95.2 %, 50 % too large 87 %. The coupling stays at 95 % or more for any focal length from 8.421 to 13.23 mm, so a catalogue lens in that range does nearly as well: an ideal 11 mm lens gives a 10.85 µm spot, and 98.9 %. The focused waist sits slightly short of f (here 10.9997 mm), which matters only for slow beams.</p>',
        html3: '<p>A real lens is not ideal. The simplest one, a plano-convex singlet, brings its outer rays to a focus short of its inner ones (spherical aberration), which spreads the spot. The page suggests one at the matching focal length and traces it with the <a href="../thin-thick-lens/">Thin and thick lens</a> calculator’s engine, the fiber at its best position on the axis: its curved side toward the collimated beam, the way round with less spherical aberration; in N-BK7 from 350 to 2000 nm, UV fused silica below and CaF₂ above, the glasses such lenses are usually made of; on the smallest common diameter at least twice the beam’s, which passes at least 99.97 % of its power, or failing that the widest at least 1.5 times it (at least 98.9 %); its coupling counts the light the lens clips. For the example it is a 6 mm N-BK7 lens with a 5.277 mm radius, 1.936 mm thick at the centre. Its focus has a Strehl ratio of 0.667, and with the fiber 83.8 µm nearer the lens than F′ it couples 88.1 %; flat side first it would couple 65.7 %. The aberration grows with the lens’s size at the same focusing angle: a 1 mm beam with f = 5.27 mm reaches the same mode at the same angle and couples 94.2 %, while a 5 mm beam at 1064 nm onto a 6.2 µm mode with a 980 nm cutoff, f = 22.88 mm, couples only 60 %. An aspheric lens or an achromatic doublet of the same focal length removes most of this loss: the suggestion is a lens to start from, not the best one.</p>',
      },
      { id: 'coupling', title: 'Coupling efficiency',
        html: `<p>The power coupled into the mode is the overlap of the two fields on the fiber face ${cite(3, 4)}, which the page integrates with the exact mode. With the mode taken as its best Gaussian, the overlap has closed forms. For two Gaussians whose waists coincide on the face it depends only on the ratio of their radii:</p>`,
        formulas: [
          { tex: String.raw`\eta = \frac{\left|\iint E_\text{beam}\,E_\text{mode}^{*}\,dA\right|^2}{\iint|E_\text{beam}|^2dA\,\iint|E_\text{mode}|^2dA},\qquad \eta_0 = \left(\frac{2\,w'w_m}{w'^2+w_m^2}\right)^2` },
        ],
        html2: '<p>A lateral offset d, a tilt θ and a focus error Δz each lower it: d is how far from the core the beam’s centre meets the fiber face, Δz how far the face lies past the focused waist, and θ the angle between the beam and the fiber axis. For matched waists (w′ = w<sub>m</sub> = w) and one error at a time the losses take simple forms:</p>',
        formulas2: [
          { tex: String.raw`\eta_d = e^{-d^2/w^2},\qquad \eta_\theta = e^{-(\pi w\theta/\lambda)^2},\qquad \eta_{\Delta z} = \frac{1}{1+\left(\Delta z/2z_R\right)^2}`, caption: 'For Gaussian beams through an ideal lens. Through a real lens the focus is no longer Gaussian, and the second part of the page integrates the overlap instead.' },
        ],
        html3: '<p>Lateral offset is the critical one: with an ideal 11 mm lens and the mode taken as Gaussian, the example loses 1 dB (21 % of the light) at a 2.55 µm offset, against 58 µm of focus error and 44.6 mrad of tilt. Offset and focus tolerances grow with the mode size and the tilt tolerance shrinks with it: a larger mode is easier to hit and harder to aim.</p>',
      },
      { id: 'real', title: 'Coupling through a real lens',
        html: `<p>A singlet’s focus is not a Gaussian waist: spherical aberration spreads it and moves its best plane toward the lens. The second part of the page designs the singlet you describe and traces it with the <a href="../thin-thick-lens/">Thin and thick lens</a> calculator’s engine, then takes the overlap of the delivered field with the mode on the sphere about the fiber’s core, with the exact mode’s far field M in the angle α between each direction and the fiber’s axis. With the core moved by Δ across the axis, or the fiber turned, each plane wave reaches the core with an extra phase:</p>`,
        formulas: [
          { tex: String.raw`\eta = \frac{\left|\int P\,M(\alpha)\,e^{2\pi i\,s_x\Delta/\lambda}\,d\Omega\right|^2}{\int |P|^2\,d\Omega\;\int |M|^2\,d\Omega},\qquad M(\alpha) = \frac{V^2\,[\,P_u J_0(q) - q J_1(q)\,]}{(u^2-q^2)(w^2+q^2)},\quad q = \frac{2\pi a}{\lambda}\sin\alpha`, caption: 'P is the field the lens delivers per unit solid angle, its phase the wavefront error of the traced singlet; s_x the component of a direction along the offset. M is the Hankel transform of the exact mode (from the integrals of J₀ and K₀ and the eigenvalue equation, with P_u = u J₁(u)/J₀(u)); it falls off as a power of q, not as a Gaussian. A lateral offset alone averages over the azimuth to a Bessel function J₀; a tilt alone is integrated numerically.' },
        ],
        html2: '<p>The second part starts from an 11 mm plano-convex lens of N-BK7, 6 mm across with a 1 mm edge, curved side toward the laser. The ideal lens of the same focal length overlaps the mode at 98.9 %; the singlet overlaps it best, at 88.7 %, with the fiber 84.4 µm closer to the lens than F′: aberrated light couples best at neither the paraxial focus nor the brightest plane, so the page places each fiber at its own best position. From there the singlet’s coupling halves with the core 4.8 µm off the axis (the ideal lens’s 4.5 µm), or with the fiber tilted by 74.2 mrad (77.9 mrad). Flat side first, the best overlap is 66.9 %; a bi-convex lens of the best form for the same f reaches 90 %, and an equi-convex one 85.1 %. The page counts the lens and the fiber end as uncoated: the two lens faces and a fused-silica fiber end pass 89.1 % of the light, so the coupling efficiency shown beside each overlap is that much lower, 79 % for the plano-convex singlet. Anti-reflection coatings recover most of the difference. A narrower beam suffers less aberration but focuses to a larger spot: with a 1 mm beam the same singlet is nearly perfect, yet overlaps the mode at only 65.3 %, because its 10.9 µm waist radius is twice the mode’s 5.2 µm; the first part matches it with a 5.27 mm lens.</p>',
      },
      { id: 'precision', title: 'Precision and limits',
        html: '<p>An independent Python reference integrates the overlap numerically on the fiber face, focuses the beam with the ABCD law, finds the matching focal length by bisection and computes the exact LP₀₁ mode from its Bessel-function equation. It agrees with the page’s closed forms for a Gaussian mode to 10⁻⁹ relative. For the exact mode, the reference’s best Gaussian, the coupling into the mode at any focal length, the matching focal length and the ends of the 95 % range agree to 10⁻⁶, and its far field, integrated directly, agrees with the page’s closed form to 10⁻⁷ of its peak.</p><p>Not included: Fresnel reflections in the first part, while the second part counts them at normal incidence for an uncoated lens and fiber end (the fiber face alone loses about 3.4 % for uncoated silica, 0.15 dB; an anti-reflection coating or index matching removes most of it), the aberrations of lenses other than spherical singlets (aspheres, doublets), clipping by a connector, polarization, and beams with M² &gt; 1. The page refuses a focus steeper than 0.3 rad (half angle). The mode is that of an ideal step-index fiber with the given V: a real fiber’s index profile differs, so its mode can couple slightly more or less, especially far from alignment.</p><p>The plano-convex suggestion and the singlets of the second part are the Thin and thick lens calculator’s model, with its precision and limits (its own Python reference traces the singlet and integrates the focus and the overlap, offsets included, to 10⁻⁴; at F′ the lens design page’s two-dimensional fiber overlap agrees as closely, and the ideal lens matches the Gaussian closed form to 10⁻⁴; with the exact mode’s far field the singlet’s coupling, offsets included, agrees to 10⁻⁴ as well, and the ideal lens reaches the first part’s face overlap to 10⁻⁴): the scalar focus of the traced singlet on axis, the exact mode’s far field taken on the sphere about the fiber’s core. Its glass, diameter and edge thickness (1 mm per 12.7 mm of diameter, at least 1 mm) are rules of thumb for a catalogue lens, not an optimum, and its focal length is the ideal lens’s: a plano-convex lens slightly longer can couple a little more, as its aberrated spot is wider. Expect a catalogue lens to differ in focal length, thickness and coating. The page gives no suggestion where that model does not hold: a lit pupil whose Fresnel number a²/(λf) is below 10, whose focus forms short of where the Debye integral puts it. The range of focal lengths near the match stops where focusing turns steeper than the paraxial limit.</p>',
      },
    ],
    references: [GLOGE, MARCUSE, KOGELNIK, JOYCE, SELF],
  },
];
