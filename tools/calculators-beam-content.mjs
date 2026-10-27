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
        html2: '<p>So the 0.5 mm, 1064 nm beam with M² = 1.5 has a Rayleigh range of 492 mm instead of 738 mm, and diverges at 1.02 mrad. M² describes widths and divergence; it says nothing about the shape of the profile, so for M² &gt; 1 the page gives no peak intensity, half-maximum diameter or Gouy phase.</p>',
      },
      { id: 'lens', title: 'Focusing with a thin lens',
        html: `<p>A thin lens turns one Gaussian beam into another. Self’s equations give the new waist and where it forms, for an input waist a distance s before a lens of focal length f ${cite(2)}:</p>`,
        formulas: [
          { tex: String.raw`w_0' = \frac{w_0}{\sqrt{\left(1-s/f\right)^2+\left(z_R/f\right)^2}},\qquad s'' = f + \frac{(s-f)\,f^2}{(s-f)^2+z_R^2}`, caption: 's″ is the distance from the lens to the new waist; negative means a virtual waist before the lens.' },
        ],
        html2: '<p>Two limits are worth knowing. A beam that reaches the lens collimated (its waist at the lens, z<sub>R</sub> ≫ f) focuses to w₀′ ≈ λf/(πw₀) at almost exactly f. A 1064 nm beam with a 1 mm waist and a 100 mm lens gives a 33.8 µm waist at 99.89 mm. But when z<sub>R</sub> is not much longer than f, the waist forms well short of the focal point: with a 0.25 mm waist (z<sub>R</sub> = 185 mm) the same lens focuses at 77.3 mm. Ray optics would put both at 100 mm. A waist placed at the front focal plane (s = f) comes out at the back focal plane, magnified by f/z<sub>R</sub>: a 50 µm HeNe waist becomes 403 µm.</p>',
      },
      { id: 'precision', title: 'Precision and limits',
        html: '<p>An independent Python reference propagates the complex beam parameter q with ABCD matrices, finds the waist after a lens where q is imaginary, and recovers a waist from a divergence by bisection on the far-field limit. It never uses the closed forms above. The page agrees with it to 10⁻⁹ relative, through converging, imaging, virtual-waist and diverging lenses.</p><p>The formulas are paraxial: they hold while the beam’s angles are small, roughly below 0.1 rad, so a waist of a few wavelengths or less is outside them. The page refuses half-angle divergences above 0.3 rad and warns above 0.1 rad after a lens. The lens is ideal and thin, with no aberrations or clipping. An aperture of radius a passes 1 − exp(−2a²/w²) of a TEM₀₀ beam: 99 % at a = 1.52 w, 99.99 % at a = 2.15 w. The medium is uniform and lossless, and widths are 1/e² intensity values throughout.</p>',
      },
    ],
    references: [KOGELNIK, SELF, SIEGMAN, ISO],
  },
  {
    slug: 'fiber-coupling', title: 'Fiber coupling', script: 'page.js',
    card: 'Couple a collimated laser beam into a single-mode fiber: lens choice, mode matching, alignment tolerances.',
    summary: 'Choose the lens that focuses a collimated laser beam onto a single-mode fiber, and see how much light couples: the mode-matching efficiency, and what lateral offset, focus error and tilt cost.',
    facts: [
      { label: 'Model', html: 'Overlap of a focused TEM₀₀ beam with a Gaussian approximation of the fiber’s fundamental mode; ideal thin lens.' },
      { label: 'Evidence', html: evidence('the exact fiber mode from its Bessel-function equation, and numerical overlap integrals on the fiber face') },
      { label: 'Code', html: `The <a href="${GITHUB}/calculators/fiber-coupling/fiber-coupling.js">calculator’s module</a>, and the <a href="${GITHUB}/validation/reference/fiber_coupling.py">Python reference</a>.` },
    ],
    graphs: [
      { id: 'focal', wide: true, title: 'Efficiency against focal length', note: 'With the alignment as set; the line marks the focal length that matches the mode.' },
      { id: 'lateral', title: 'Lateral offset', note: 'The focus moved across the fiber face.' },
      { id: 'axial', title: 'Focus error', note: 'The fiber face before (negative) or beyond (positive) the focused waist.' },
      { id: 'tilt', title: 'Tilt', note: 'The angle between the beam and the fiber axis.' },
    ],
    columns: [
      { form: 'calc', results: 'focus', label: 'The focused beam' },
      { form: 'fiber', results: 'mode', label: 'The fiber mode' },
      { output: true, label: 'Coupling' },
    ],
    sections: [
      { id: 'mode', title: 'The fiber mode',
        html: `<p>A single-mode fiber guides one field pattern, its fundamental mode LP₀₁. For a step-index fiber with core radius a and numerical aperture NA, the mode depends on one number, V ${cite(1)}:</p>`,
        formulas: [
          { tex: String.raw`V = \frac{2\pi a\,\mathrm{NA}}{\lambda},\qquad \text{single mode for } V < 2.405,\qquad \lambda_c = \frac{2\pi a\,\mathrm{NA}}{2.405}`, caption: '2.405 is the first zero of the Bessel function J₀; above it the next mode, LP₁₁, is guided too. λ_c is the cutoff wavelength.' },
        ],
        html2: `<p>The exact mode is a Bessel function in the core and a decaying one in the cladding, but it is very nearly Gaussian ${cite(2)}. Marcuse fitted the radius w<sub>m</sub> of the Gaussian that matches it best:</p>`,
        formulas2: [
          { tex: String.raw`\frac{w_m}{a} = 0.65 + \frac{1.619}{V^{3/2}} + \frac{2.879}{V^6},\qquad \mathrm{MFD} = 2w_m` },
        ],
        html3: '<p>The independent reference solves the exact mode and finds that this fit stays within 1 % of the best Gaussian for 1.2 ≤ V ≤ 3.5, so the page accepts that range and asks for the mode-field diameter otherwise. The best Gaussian couples to the exact mode at 97.7 % for V = 1.6 and 99.7 % for V = 2.4: the Gaussian model overstates the coupling into a real fiber by that margin. A fiber with an 8.2 µm core and NA 0.14 has V = 2.33 at 1550 nm, a cutoff at 1500 nm and a 9.22 µm mode by the fit. Real fibers are not ideal step-index profiles, and their datasheets quote a measured mode-field diameter (usually by the Petermann II definition) that can differ from the fit by more than its 1 %. When you have the datasheet value, use it; the page’s example takes 10.4 µm.</p>',
      },
      { id: 'focus', title: 'Choosing the lens',
        html: `<p>The lens should focus the beam to the size of the mode. A collimated beam of radius w at the lens focuses to w′ = w f/√(f² + z<sub>R</sub>²), where z<sub>R</sub> is the input beam’s Rayleigh range ${cite(5)}, so the lens that matches the mode exactly is</p>`,
        formulas: [
          { tex: String.raw`f = \frac{w_m\,z_R}{\sqrt{w^2-w_m^2}} \approx \frac{\pi w\,w_m}{\lambda}` },
        ],
        html2: '<p>For the example, a 2 mm beam at 1550 nm onto a 10.4 µm mode, that is 10.54 mm; the page’s 11 mm lens gives a 10.85 µm spot, and 99.8 % mode matching. The match is forgiving: a waist 10 % off still couples 99.1 %, 25 % off 95.2 %, 50 % off 85.2 %. The focused waist sits slightly short of f (here 10.9997 mm), which matters only for slow beams.</p>',
      },
      { id: 'coupling', title: 'Coupling efficiency',
        html: `<p>The power coupled into the mode is the overlap of the two fields on the fiber face ${cite(3, 4)}. For two Gaussians whose waists coincide on the face it depends only on the ratio of their radii:</p>`,
        formulas: [
          { tex: String.raw`\eta = \frac{\left|\iint E_\text{beam}\,E_\text{mode}^{*}\,dA\right|^2}{\iint|E_\text{beam}|^2dA\,\iint|E_\text{mode}|^2dA},\qquad \eta_0 = \left(\frac{2\,w'w_m}{w'^2+w_m^2}\right)^2` },
        ],
        html2: '<p>A lateral offset d, a tilt θ and a focus error Δz each lower it. For matched waists (w′ = w<sub>m</sub> = w) and one error at a time the losses take simple forms:</p>',
        formulas2: [
          { tex: String.raw`\eta_d = e^{-d^2/w^2},\qquad \eta_\theta = e^{-(\pi w\theta/\lambda)^2},\qquad \eta_{\Delta z} = \frac{1}{1+\left(\Delta z/2z_R\right)^2}`, caption: 'The page evaluates the general overlap in closed form, with all three errors and any waist ratio at once.' },
        ],
        html3: '<p>Lateral offset is the critical one: the example loses 1 dB (21 % of the light) at a 2.55 µm offset, against 58 µm of focus error and 44.6 mrad of tilt. Offset and focus tolerances grow with the mode size and the tilt tolerance shrinks with it: a larger mode is easier to hit and harder to aim.</p>',
      },
      { id: 'precision', title: 'Precision and limits',
        html: '<p>An independent Python reference integrates the overlap numerically on the fiber face, focuses the beam with the ABCD law, finds the matching focal length by bisection and computes the exact LP₀₁ mode from its Bessel-function equation. The page agrees with it to 10⁻⁹ relative for a given mode-field diameter, and within the fit’s 1 % (2 % in efficiency) when the mode comes from core and NA.</p><p>Not included: Fresnel reflection at the fiber face (about 3.4 % for uncoated silica, 0.15 dB; an anti-reflection coating or index matching removes most of it), lens aberrations, clipping by the lens or by a connector, polarization, beams with M² &gt; 1, and the slight non-Gaussian shape of the true mode. The page gives the ideal upper bound for the alignment you enter.</p>',
      },
    ],
    references: [GLOGE, MARCUSE, KOGELNIK, JOYCE, SELF],
  },
];
