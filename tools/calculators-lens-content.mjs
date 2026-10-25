// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Content of the lens design page, built by tools/build-calculators.mjs.
// Every statement here describes what calculators/lens-design/engine/ does;
// change the two together.

const cite = (...n) => n.map(k => `<a class="cite" href="#ref-${k}">[${k}]</a>`).join('');

const GITHUB = 'https://github.com/LucaGenchi/opticalsetup/blob/main';

const REF = { welford: 1, smith: 2, spencer: 3, kingslake: 4, born: 5, optiland: 6, malitson: 7, schott: 8 };
const c = (...keys) => cite(...keys.map(k => REF[k]));

export const lensCalculators = [
  {
    slug: 'lens-design',
    title: 'Lens design',
    card: 'Enter a lens prescription and trace real rays in 3D: first-order data, Seidel aberrations, layout and spot diagrams.',
    summary: 'Type in a lens, surface by surface, or start from a preset: a perfect lens, a singlet, an achromat, a Cooke triplet. The page traces real skew rays through it and draws the layout and the spot diagrams, next to the paraxial data and the third-order aberrations. It is a sketching and teaching tool, not a full design program: there is no optimization or tolerancing.',
    script: 'page.js',
    stylesheet: 'lens-design.css',
    graphs: [],
    workbench: {
      label: 'Lens designer',
      tabs: [
        {
          id: 'layout', title: 'Layout',
          assumptions: `<p>The drawing is the meridional (y–z) section through the axis, to scale. Rays are real rays at the primary wavelength, five per field across the pupil, coloured by field; a ray that fails stops where it fails, marked ×. Glass is shaded; each lens is drawn to the larger clear semi-diameter of its two faces, as it would be ground.</p>
            <p>The first-order table comes from the paraxial (y–nu) trace at the primary wavelength: it is exact for rays infinitely close to the axis and is the reference every aberration is measured from. The entrance and exit pupils are the paraxial images of the stop. The Seidel sums are the third-order aberrations, surface by surface, in Welford’s notation${c('welford')}: S<sub>I</sub> spherical, S<sub>II</sub> coma, S<sub>III</sub> astigmatism, S<sub>IV</sub> Petzval curvature, S<sub>V</sub> distortion, C<sub>L</sub> and C<sub>T</sub> axial and lateral colour between the shortest and longest wavelengths. They predict the real aberrations well when the aperture and field are small; the spot diagram shows the real ones.</p>`,
        },
        {
          id: 'spot', title: 'Spot',
          assumptions: `<p>Each spot diagram is where real rays from one field point cross the image plane. The rays fill the entrance pupil on a square grid of equal cells (the pupil sampling setting), so every ray stands for the same pupil area and the RMS radius is an area-weighted average. Points are plotted relative to the chief ray of the primary wavelength and coloured by wavelength. The RMS and geometric (largest) radii are measured from the spot’s own centroid.</p>
            <p>The dashed circle is the Airy radius, 1.22 λ N<sub>w</sub>, with N<sub>w</sub> the paraxial working F-number: the first dark ring of a perfect lens’s diffraction pattern${c('born')}. A spot much smaller than that circle is “diffraction limited”, and geometric optics no longer describes it; a spot much larger is dominated by aberrations. This page does not yet compute the diffraction pattern itself.</p>
            <p>Rays that miss a surface, are totally internally reflected, are cut by a clear aperture you set or by the stop, or would have to cross a lens whose faces intersect, are counted and left out of the statistics; the notes below the plots say how many. With paraxial aiming some rays can cross the stop outside its radius, because the real pupil is shifted and distorted; real aiming fills the stop exactly.</p>`,
        },
      ],
    },
    facts: [
      { label: 'Model', html: 'Sequential, rotationally symmetric refracting systems in air: spherical, conic and even-aspheric surfaces, plus an ideal (paraxial) lens. Exact real-ray tracing in three dimensions; paraxial and third-order theory alongside. Geometric optics only, for now.' },
      { label: 'Evidence', html: `Checked against an independent Python reference (different intersection, refraction and first-order methods) to 10⁻⁹ mm, and against Optiland 0.5.5${c('optiland')} on the Cooke triplet: 63 skew rays to 10⁻⁹ mm and the RMS spots to 10⁻⁷. See the <a href="${GITHUB}/docs/validation.md" target="_blank" rel="noopener">validation table</a>.` },
      { label: 'Code', html: `<a href="${GITHUB}/calculators/lens-design/engine/trace.js" target="_blank" rel="noopener">trace.js</a> (real rays), <a href="${GITHUB}/calculators/lens-design/engine/paraxial.js" target="_blank" rel="noopener">paraxial.js</a> (first order and Seidel), with glass data from the canvas’s own <a href="${GITHUB}/sketch/js/glass.js" target="_blank" rel="noopener">catalogue</a>. A spherical design opens in the canvas as a <a href="../../wiki/lensgroup/">Lens group</a>.` },
    ],
    sections: [
      {
        id: 'prescription',
        title: 'The prescription',
        html: `<p>A lens is described the way lens designers write it: one row per surface, from the object side. Each row gives the surface’s shape, the axial distance to the next surface, and the material that fills that distance. Two glass rows in a row make a cemented doublet; a glass row followed by air is a lens with an air gap after it. The optical axis is z, light travels toward +z, and lengths are in millimetres.</p>
          <p>A radius is positive when the centre of curvature lies on the +z side of the vertex, so an ordinary biconvex lens has R<sub>1</sub> &gt; 0 and R<sub>2</sub> &lt; 0; ∞ (or 0) is flat. The surface shape is the even asphere${c('kingslake')}:</p>`,
        formulas: [
          { tex: String.raw`z(r) = \frac{c\,r^2}{1 + \sqrt{1 - (1+k)\,c^2 r^2}} + A_4 r^4 + A_6 r^6 + \dots + A_{16} r^{16}, \qquad c = 1/R`, caption: 'k = 0 is a sphere, −1 a paraboloid, below −1 a hyperboloid, between −1 and 0 a prolate ellipsoid. The same convention as the canvas’s Aspheric lens.' },
        ],
        html2: `<p>One surface is the <b>aperture stop</b>, the opening that limits the beam. The aperture is set in object space: as the entrance-pupil diameter, as the F-number f/D for an object at infinity, or as the object-space numerical aperture n sin θ for a near object. Fields are angles for an object at infinity and heights for a near one; a positive field sends rays toward +y (the convention of OpticStudio and Optiland). Glass indices are the canvas catalogue’s published Sellmeier curves, relative to air${c('schott', 'malitson')}, evaluated at the exact wavelength; outside a glass’s fitted range the index is held at the edge of the range, and a note says so. A constant index is available for a material with no dispersion.</p>
          <p>An <b>ideal lens</b> row is a perfect thin lens of focal length f in air: it bends every ray so that each object point is imaged to exactly one point. It is the reference against which real lenses are judged, and the starting point for a layout before real glass is chosen.</p>`,
      },
      {
        id: 'paraxial',
        title: 'First-order optics',
        html: `<p>Rays very close to the axis obey linear equations. At each surface j with curvature c and media n before and n′ after, the paraxial ray height y and slope u change as${c('smith', 'welford')}:</p>`,
        formulas: [
          { tex: String.raw`n'u' = n u - y\,\varphi, \qquad \varphi = c\,(n' - n), \qquad y_{j+1} = y_j + t_j\,u'_j`, caption: 'Refraction, then transfer to the next surface over the thickness t. An ideal lens has φ = 1/f.' },
        ],
        html2: `<p>Two such rays describe the whole system: the <b>marginal ray</b>, from the axial object point to the rim of the pupil, and the <b>chief ray</b>, from the edge of the field through the centre of the stop. The effective focal length is f = −1/u′ for a ray that enters parallel at unit height; the paraxial image is where the marginal ray crosses the axis; the entrance and exit pupils are the images of the stop seen from object and image space. The working F-number, N<sub>w</sub> = 1/(2 n′ |u′|), sets the cone of light that actually reaches the image and with it the Airy radius. Every wavelength is aimed at the primary wavelength’s pupil, so pupil coordinates name the same bundle in every colour.</p>`,
      },
      {
        id: 'real-rays',
        title: 'Real rays',
        html: `<p>A real ray is traced exactly, surface by surface, in three dimensions${c('spencer')}. The intersection with a conic is the root of a quadratic, taken on the surface’s own sheet; a surface with polynomial terms is solved by Newton’s method from the conic root, and a ray whose iteration does not converge is reported rather than moved. At the intersection the unit direction d is refracted by the vector form of Snell’s law with the unit normal N:</p>`,
        formulas: [
          { tex: String.raw`\mathbf d' = \mu\,\mathbf d + \left(\sqrt{1 - \mu^2\,(1 - \cos^2 I)} - \mu \cos I\right)\mathbf N, \qquad \mu = n/n', \quad \cos I = \mathbf d\cdot\mathbf N`, caption: 'When the square root’s argument is negative the ray is totally internally reflected, and stops there.' },
        ],
        html2: `<p>Rays are named by their field and their normalized pupil coordinates (p<sub>x</sub>, p<sub>y</sub>), |p| ≤ 1. With <b>paraxial aiming</b> (the default) a ray is aimed at that point of the paraxial entrance pupil. At large fields or apertures the real pupil is shifted and distorted, so the ray no longer passes where intended through the stop. <b>Real aiming</b> instead finds, by Newton iteration, the ray that crosses the stop at (p<sub>x</sub>, p<sub>y</sub>) times the stop radius. It costs a few traces per ray. Either way the stop cuts any ray that crosses it outside its radius, as a real iris would; the Cooke triplet and the curved-first singlet presets use real aiming for that reason.</p>`,
      },
      {
        id: 'spots',
        title: 'Spots and best focus',
        html: `<p>With rays at positions (x<sub>i</sub>, y<sub>i</sub>) on the image plane, the centroid is their mean and the RMS radius is</p>`,
        formulas: [
          { tex: String.raw`r_\text{RMS} = \sqrt{\frac{1}{N}\sum_i \left[(x_i - \bar x)^2 + (y_i - \bar y)^2\right]}`, caption: 'Over all wavelengths of a field, with equal weights.' },
        ],
        html2: `<p>The image plane can sit at the paraxial focus, at the distance in the last row (“fixed”), or at the <b>best RMS focus</b>, each with an optional offset. Moving the plane by Δ moves every ray by Δ times its direction tangents, so each field’s mean square radius is a quadratic in Δ and its minimum is exact, not searched for:</p>`,
        formulas2: [
          { tex: String.raw`\Delta_\text{best} = -\,\frac{\sum_\text{fields} \overline{(\mathbf r_i - \bar{\mathbf r})\cdot(\mathbf s_i - \bar{\mathbf s})}}{\sum_\text{fields} \overline{|\mathbf s_i - \bar{\mathbf s}|^2}}`, caption: 'r are positions at the paraxial focus and s = (d_x/d_z, d_y/d_z) the direction tangents; bars are means over the rays of one field.' },
        ],
      },
      {
        id: 'seidel',
        title: 'Third-order aberrations',
        html: `<p>The Seidel sums come from the same two paraxial rays. With the refraction invariants A = n(u + yc) and Ā = n(ū + ȳc), the Lagrange invariant H, and Δ the change across the surface${c('welford')}:</p>`,
        formulas: [
          { tex: String.raw`S_I = -A^2 y\,\Delta\!\left(\tfrac{u}{n}\right), \quad S_{II} = -A\bar A\, y\,\Delta\!\left(\tfrac{u}{n}\right), \quad S_{III} = -\bar A^2 y\,\Delta\!\left(\tfrac{u}{n}\right), \quad S_{IV} = -H^2 c\,\Delta\!\left(\tfrac{1}{n}\right)` },
          { tex: String.raw`S_V = -\bar A^3 y\,\Delta\!\left(\tfrac{1}{n^2}\right) + \bar A \bar y c\,(2\bar A y - A\bar y)\,\Delta\!\left(\tfrac{1}{n}\right), \qquad \delta S_I = 8\,b\,(n'-n)\,y^4, \quad b = \tfrac{k c^3}{8} + A_4`, caption: 'A conic or an A4 term adds b to the r⁴ coefficient of the sag; its contributions to S_II, S_III and S_V follow with powers of ȳ/y. An ideal lens contributes nothing.' },
        ],
        html2: `<p>The wavefront coefficients shown in waves at the primary wavelength are W<sub>040</sub> = S<sub>I</sub>/8 (spherical), W<sub>131</sub> = S<sub>II</sub>/2 (coma), W<sub>222</sub> = S<sub>III</sub>/2 (astigmatism), W<sub>220</sub> = (S<sub>III</sub> + S<sub>IV</sub>)/4 (field curvature at the medial surface) and W<sub>311</sub> = S<sub>V</sub>/2 (distortion), at the edge of the pupil and field. A positive S<sub>I</sub> is undercorrected spherical aberration: the rim of a positive lens focuses short of the paraxial focus. Turning a plano-convex lens with its flat side to a collimated beam multiplies its S<sub>I</sub> about fourfold; the presets show both.</p>`,
      },
      {
        id: 'precision',
        title: 'How it was checked',
        html: `<p>An independent reference written in plain Python (<a href="${GITHUB}/validation/reference/lens_design.py" target="_blank" rel="noopener">lens_design.py</a>) recomputes the numbers by different routes: first-order data from 2×2 ray-transfer matrices, surface intersections by bisection, refraction by conserving the tangential component of n d, surface normals by a complex-step derivative, and the third-order coefficient of a real singlet from a polynomial fit to its real transverse aberration. The app agrees with it to 10⁻⁹ mm on first-order data and on ray positions for a Cooke triplet, an aspheric singlet and a near object; its S<sub>I</sub> agrees with Welford’s thin-lens formula for a lens of zero thickness to 10⁻⁹, and with the real-ray fit for a 4 mm lens to 10⁻⁵. An aplanatic plano-hyperbolic lens (conic k = −n²) images an axial point to within 10⁻¹² mm.</p>
          <p>As a second, outside check, the same Cooke triplet was traced by Optiland 0.5.5${c('optiland')}, an open-source design program: the focal length, pupils and F-number agree to 10⁻¹², 63 skew rays at three fields and three wavelengths to 10⁻⁹ mm, and the RMS spot radii on a 64 × 64 pupil grid to 10⁻⁷. The script and its output are kept with the tests.</p>
          <p>What this does not check is the physics left out: real lenses also have diffraction (shown here only as the Airy radius), coatings, absorption, tolerances and scattered light.</p>`,
      },
      {
        id: 'scope',
        title: 'Not in this version',
        html: `<p>Wavefront maps, the diffraction point-spread function, MTF and Strehl ratio, extended-object imaging and fiber coupling are planned for later versions of this page. Out of scope altogether: optimization and tolerancing, mirrors, tilted or decentred surfaces, non-sequential paths, gradient-index and diffractive surfaces, vector diffraction, partial coherence, polarization ray tracing and coatings. For those, a full design program such as Optiland${c('optiland')} is the right tool.</p>
          <p>The Cooke triplet preset is the “Cooke 40 degree field” sample of OpticStudio as distributed with Optiland${c('optiland')}, with SCHOTT N-SK16 in place of the original SK16 and its image plane where the prescription puts it. The achromat is the canvas’s own lens-group preset; the singlets are derived from the lensmaker’s equation at the d line.</p>`,
      },
    ],
    references: [
      { label: 'W. T. Welford, Aberrations of Optical Systems (Adam Hilger, 1986), chapters 7–8: Seidel sums, aspheric contributions, thin-lens aberrations.', url: 'https://search.mnlink.org/Record/fef7324d-544c-4d2e-97a0-160e72fcdc22' },
      { label: 'W. J. Smith, Modern Optical Engineering, 4th ed. (McGraw-Hill, 2008): paraxial ray tracing, pupils and stops.', url: 'https://www.accessengineeringlibrary.com/content/book/9780071476874' },
      { label: 'G. H. Spencer and M. V. R. K. Murty, “General ray-tracing procedure,” J. Opt. Soc. Am. 52, 672–678 (1962).', url: 'https://doi.org/10.1364/JOSA.52.000672' },
      { label: 'R. Kingslake and R. B. Johnson, Lens Design Fundamentals, 2nd ed. (Academic Press/SPIE, 2010): aspheric surfaces, the Cooke triplet.', url: 'https://shop.elsevier.com/books/lens-design-fundamentals/kingslake/978-0-12-374301-5' },
      { label: 'M. Born and E. Wolf, Principles of Optics, 7th ed., Cambridge University Press (1999), section 8.5.2: the Airy pattern', url: 'https://doi.org/10.1017/CBO9781139644181' },
      { label: 'H. Kramer et al., Optiland: open-source optical design in Python (MIT licence), v0.5.5; samples/objectives.py, CookeTriplet.', url: 'https://github.com/HarrisonKramer/optiland' },
      { label: 'I. H. Malitson, “A redetermination of some optical properties of calcium fluoride,” Appl. Opt. 2, 1103–1107 (1963).', url: 'https://doi.org/10.1364/AO.2.001103' },
      { label: 'SCHOTT AG, Optical glass data sheets and Zemax catalogue (2017-01-20): Sellmeier coefficients of the catalogue glasses.', url: 'https://www.schott.com/en-gb/products/optical-glass' },
    ],
  },
];
