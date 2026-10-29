// SPDX-FileCopyrightText: 2026 Luca Genchi and contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Content of the lens design page, built by tools/build-calculators.mjs.
// Every statement here describes what calculators/lens-design/engine/ does;
// change the two together.

const cite = (...n) => n.map(k => `<a class="cite" href="#ref-${k}">[${k}]</a>`).join('');

const GITHUB = 'https://github.com/LucaGenchi/opticalsetup/blob/main';

const REF = { welford: 1, smith: 2, spencer: 3, kingslake: 4, born: 5, optiland: 6, malitson: 7, schott: 8, goodman: 9, noll: 10, siegman: 11, opticstudio: 12 };
const c = (...keys) => cite(...keys.map(k => REF[k]));

export const lensCalculators = [
  {
    slug: 'lens-design',
    title: 'Lens design',
    card: 'Enter a lens prescription and trace real rays in 3D: layout, spot diagrams, Seidel aberrations, wavefront maps, the diffraction PSF, Strehl ratio and MTF, images in coherent and incoherent light, and fiber coupling.',
    summary: 'Enter a lens surface by surface, or start from a preset: a perfect lens, a singlet, an achromat or a Cooke triplet. The page traces real skew rays through it and draws the layout and spot diagrams alongside the paraxial data and the third-order aberrations, then follows the wavefront to the diffraction-limited image: the point-spread function, Strehl ratio and MTF, the image of a target in coherent and in incoherent light, and how much of the light a single-mode fiber at the focus would take. Optimization and tolerancing are left to dedicated lens design software.',
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
          assumptions: `<p>Each spot diagram is where real rays from one field point cross the image plane. The rays fill the entrance pupil on a square grid of equal cells (the pupil sampling setting), so every ray stands for the same pupil area and the RMS radius is an area-weighted average. The axes are in micrometres in the image plane, with the origin (+) at the chief ray of the primary wavelength; the key above the plots gives each wavelength’s colour. The RMS and geometric (largest) radii are measured from the spot’s own centroid. <a href="#reading-spots">How to read a spot diagram</a> walks through the shapes and the numbers.</p>
            <p>The dashed circle is the Airy radius, 1.22 λ N<sub>w</sub>, with N<sub>w</sub> the paraxial working F-number: the first dark ring of a perfect lens’s diffraction pattern${c('born')}. A spot much smaller than that circle is “diffraction limited”, and geometric optics no longer describes it; a spot much larger is dominated by aberrations. This page does not yet compute the diffraction pattern itself.</p>
            <p>Rays that miss a surface, are totally internally reflected, are cut by a clear aperture you set or by the stop, or would have to cross a lens whose faces intersect, are counted and left out of the statistics; the notes below the plots say how many. With paraxial aiming some rays can cross the stop outside its radius, because the real pupil is shifted and distorted; real aiming fills the stop exactly. The PSF tab computes the diffraction pattern itself.</p>`,
        },
        {
          id: 'wavefront', title: 'Wavefront',
          assumptions: `<p>The map is the optical path difference (OPD) across the pupil for one field and wavelength, in waves: the chief ray’s optical path minus each ray’s, measured to the exit-pupil reference sphere (see <a href="#wavefront">The wavefront</a>). The map is drawn with its mean removed (piston), so red is ahead of the average wavefront and blue behind it. The pupil is sampled on the square grid of the Diffraction settings, in normalized entrance-pupil coordinates (stop coordinates with real aiming); rays that fail, or are cut by an aperture, leave white cells.</p>
            <p>The RMS is taken about the mean (piston removed), and once more with the best-fitting tilt removed, since neither changes the image’s sharpness. The Zernike coefficients are a least-squares fit of the first 37 terms in Noll’s order and normalization${c('noll')}: each term has unit RMS over the pupil, so the RMS of the wavefront is the root sum of squares of the coefficients beyond piston. Every wavelength is referred to the primary wavelength’s chief ray, so another wavelength’s map also carries its lateral colour, as a tilt. When the wavefront changes by more than half a wave between neighbouring samples, the grid is too coarse and a warning says so.</p>`,
        },
        {
          id: 'psf', title: 'PSF',
          assumptions: `<p>The point-spread function is the image of a point of the object: here the scalar diffraction pattern computed from the wavefront by a fast Fourier transform (FFT) of the pupil function, in the Fraunhofer (Debye) approximation${c('goodman', 'born')}. It is scalar (no polarization), isoplanatic (one field point at a time) and incoherent; the polychromatic PSF is the sum of the wavelengths’ intensities with their weights. Intensities are relative to the peak of a perfect lens with the same pupil (the same apertures and illumination), so the brightest point reads directly as the Strehl ratio. The axes are micrometres in the image plane from the primary chief ray (+); the dashed circle is the Airy radius.</p>
            <p>The Strehl ratio is the PSF’s peak, refined between samples, over that perfect lens’s peak; the table also gives its value at the chief ray, which is what Optiland reports. The through-focus curve repeats the calculation with the image plane moved, each plane with its own reference sphere, so the defocus is exact, and with a pupil grid fine enough for that plane’s wavefront; a plane too steep to sample is left out. The results are unreliable, and a note says so, when the image-space NA exceeds 0.6 (polarization matters), when the Fresnel number of the exit pupil is below 10 (the focus shifts away from where the pupil model puts it), when the pupil is sampled too coarsely for the aberration (aliasing), or when the rays leave the lens far from an even grid of directions (pupil distortion). Glass absorption, coatings and scattered light are not included.</p>`,
        },
        {
          id: 'mtf', title: 'MTF',
          assumptions: `<p>The modulation transfer function is the contrast with which the lens images a sinusoidal pattern of each spatial frequency, from 1 at zero frequency to 0 at the cutoff 2 NA/λ${c('goodman')}. It is the magnitude of the Fourier transform of the PSF above, for incoherent light, normalized to 1 at zero frequency. Tangential means the frequency runs along y, the direction of the field (stripes running across it); sagittal means it runs along x. The grey curves are a perfect lens with the same pupil, the best any lens of this aperture can do.</p>
            <p>The polychromatic MTF is the transform of the summed PSF, so it includes lateral colour. Off axis the cone of light that reaches the image narrows, more in the tangential direction than across it, and so do the cutoffs; the PSF’s sampling follows the traced rays, so both are included.</p>`,
        },
        {
          id: 'imaging', title: 'Imaging',
          assumptions: `<p>The image of a whole target, computed from one field point’s wavefront: the target is taken to be small enough that all of it sees the same point-spread function (isoplanatic). It sits where the primary wavelength’s chief ray meets the image plane, at the size a perfect lens would image it, and is sized in units of the lens’s own resolution, so that one setting suits any lens: two points so many Rayleigh distances 0.61 λ/NA apart; a bar target or a grating at a fraction of the incoherent cutoff 2 NA/λ; a Siemens star of so many cycles. One wavelength at a time.</p>
            <p>Two images are computed. In <b>incoherent</b> light (a lamp, an LED, fluorescence) the points of the target radiate independently, so their PSFs add as intensities. In <b>coherent</b> light (a laser shining through the target, here a plane wave travelling along the chief ray) their amplitudes add first, and interfere${c('goodman')}. Partially coherent illumination, as from a microscope condenser, lies between the two and is not computed. Both images use the pupil grid of the Diffraction settings; the computed field is N λ/(2 NA) across and repeats periodically, so a target must fit well inside it, and a note says when the PSF spills round its edges. See <a href="#imaging">Imaging an extended object</a>.</p>`,
        },
        {
          id: 'coupling', title: 'Coupling',
          assumptions: `<p>How much of the focused light enters a single-mode fiber whose face is at the image: the overlap of the field the lens delivers with the fiber’s mode, taken as a Gaussian of 1/e² diameter equal to the fiber’s mode-field diameter (MFD) at the wavelength. Coherent, scalar, one wavelength and one field point at a time; the lens’s own aberrations enter through its wavefront, exactly.</p>
            <p>The core sits where the primary wavelength’s chief ray meets the image plane, plus the offsets you set: across the image plane, and along the axis (positive past the image plane, away from the lens). The fiber points along the chief ray, so that an off-axis field is coupled as a fiber aimed at the lens would couple it; the tilts turn it from there by the angle set (both together by their root sum of squares), positive toward +x and +y. The table splits the losses: mode mismatch (a perfect lens with the same pupil), aberrations, misalignment, and the light lost before the face. For a fiber alone in front of a lens, the <a href="../fiber-coupling/">Fiber coupling</a> calculator gives the same Gaussian overlaps in closed form. See <a href="#coupling">Coupling into a single-mode fiber</a>.</p>`,
        },
      ],
    },
    facts: [
      { label: 'Model', html: 'Sequential, rotationally symmetric refracting systems in air: spherical, conic and even-aspheric surfaces, plus an ideal (paraxial) lens. Exact real-ray tracing in three dimensions; paraxial and third-order theory alongside; scalar diffraction from the exit-pupil wavefront: the incoherent PSF and MTF, images in fully coherent and fully incoherent light, and coupling into a Gaussian fiber mode.' },
      { label: 'Evidence', html: `Checked against an independent Python reference (different intersection, refraction and first-order methods) to 10⁻⁹ mm and 10⁻⁸ waves, and against Optiland 0.5.5${c('optiland')} on the Cooke triplet: rays to 10⁻⁹ mm, wavefronts to 10⁻⁹ waves, Strehl ratios and MTF to 10⁻⁴. Imaging and fiber coupling are checked against a second Python reference that integrates the pupil by quadrature, and against closed forms for a perfect lens. See the <a href="${GITHUB}/docs/validation.md" target="_blank" rel="noopener">validation table</a>.` },
      { label: 'Code', html: `<a href="${GITHUB}/calculators/lens-design/engine/trace.js" target="_blank" rel="noopener">trace.js</a> (real rays), <a href="${GITHUB}/calculators/lens-design/engine/paraxial.js" target="_blank" rel="noopener">paraxial.js</a> (first order and Seidel), <a href="${GITHUB}/calculators/lens-design/engine/wavefront.js" target="_blank" rel="noopener">wavefront.js</a> and <a href="${GITHUB}/calculators/lens-design/engine/diffraction.js" target="_blank" rel="noopener">diffraction.js</a> (OPD, PSF, MTF), <a href="${GITHUB}/calculators/lens-design/engine/imaging.js" target="_blank" rel="noopener">imaging.js</a> and <a href="${GITHUB}/calculators/lens-design/engine/coupling.js" target="_blank" rel="noopener">coupling.js</a> (coherent and incoherent images, fiber coupling), with glass data from the canvas’s own <a href="${GITHUB}/sketch/js/glass.js" target="_blank" rel="noopener">catalogue</a>. A spherical design opens in the canvas as a <a href="../../wiki/lensgroup/">Lens group</a>.` },
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
        html2: `<p>One surface is the <b>aperture stop</b>, the opening that limits the beam. The aperture is set in object space: as the entrance-pupil diameter, as the F-number f/D for an object at infinity, or as the object-space numerical aperture n sin θ for a near object. Fields are angles for an object at infinity and heights for a near one; a positive field sends rays toward +y (the same convention as other design programs${c('opticstudio', 'optiland')}). Glass indices are the canvas catalogue’s published Sellmeier curves, relative to air${c('schott', 'malitson')}, evaluated at the exact wavelength; outside a glass’s fitted range the index is held at the edge of the range, and a note says so. A constant index is available for a material with no dispersion.</p>
          <p>A <b>perfect lens</b> (an ideal lens) is a row whose material is set to “Perfect lens”: a thin lens of focal length f in air, entered in the Radius column, that bends every ray so that each object point is imaged to exactly one point. It is the reference against which real lenses are judged, and the starting point for a layout before real glass is chosen.</p>`,
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
        id: 'reading-spots',
        title: 'How to read a spot diagram',
        html: `<p>A spot diagram answers one question: <em>where does the light from one point of the object land?</em> A perfect lens would put every ray on a single point. Each dot is one ray, coloured by its wavelength, plotted in micrometres from the chief ray (the + at the origin), with y in the plane of the field. Read the panels in order: first the size, then the shape, then the colours, then how all three change from the centre of the field to its edge. The “Same scale for every field” box lets you compare sizes between panels directly; untick it to see the shape of a small spot.</p>
          <h3>The numbers to look at</h3>
          <ul>
            <li><b>RMS radius</b>, the root-mean-square distance of the rays from their centroid, is the single best measure of how sharp the image is. Lower is better.</li>
            <li><b>Compare it with the Airy radius</b> (the dashed circle), the size of the blur that diffraction alone imposes. A spot much larger than the circle is limited by aberrations, and improving the design will sharpen the image. A spot that fits well inside it is <em>diffraction-limited</em>: the real image is then the Airy pattern, and the dots no longer describe it${c('born', 'smith')}. Try the curved-side-first singlet: at 588 nm its RMS radius is 6.9 µm against an Airy radius of 7.2 µm.</li>
            <li><b>Largest radius</b> says how far the outermost rays stray. When it is several times the RMS radius, a faint halo or tail surrounds a brighter core, as for the Cooke triplet at 14° (largest 44 µm, RMS 16 µm).</li>
            <li><b>RMS at each wavelength</b>: spots of very different sizes in different colours on axis mean <em>axial colour</em>, each colour focusing at a different distance (the “Focus by wavelength” table on the Layout tab).</li>
            <li><b>Centroid from chief ray</b>: zero on axis by symmetry. Off axis it measures how lopsided the spot is, which is mostly coma.</li>
            <li><b>Lateral colour</b>: how far apart the shortest and longest wavelengths land off axis. It shows as coloured fringes at the edges of the field.</li>
            <li><b>Distortion</b>: where the chief ray lands compared with its paraxial height, in percent. It does not blur the image, it bends it: positive is pincushion, negative is barrel.</li>
            <li><b>Rays lost and vignetted</b>: light that never reaches the image. Vignetting darkens the edge of the field.</li>
          </ul>
          <p>If the image goes to a camera, compare the spot with the pixel pitch as well: a spot much smaller than a pixel buys sharpness the sensor cannot record, while a spot spread over several pixels blurs the finest detail.</p>
          <h3>Recognizing the aberrations</h3>
          <p>Each Seidel aberration leaves a typical mark, and grows in its own way with the pupil radius ρ and the field height H${c('welford', 'smith')}:</p>
          <ul>
            <li><b>Spherical aberration</b> (blur ∝ ρ³, the same at every field): a round, symmetric spot on axis, a dense core in a wider halo. The rim of the lens focuses at a different distance from its centre, so the spot shrinks when the image plane moves toward that compromise. For pure third-order spherical aberration the best RMS focus is exactly three times smaller than the paraxial one. Try the flat-side-first singlet with only the 0° field, the single wavelength 588 nm and “Best RMS focus”: 27.6 µm becomes 9.2 µm. With several fields, best focus balances all of them, so the axial spot alone improves less.</li>
            <li><b>Coma</b> (∝ ρ² H): off axis only, a comet with its point at the chief ray and its tail fanning toward or away from the axis. The centroid moves away from the chief ray.</li>
            <li><b>Astigmatism</b> (∝ ρ H²): the spot stretches into a line, and the line turns by 90° as the image plane passes through focus, with a rounder spot in between. Try the Cooke triplet with an image-plane offset of −0.15 mm and then +0.3 mm: the 14° spot becomes a vertical line (RMS widths 2 × 21 µm), then a horizontal one (23 × 5 µm).</li>
            <li><b>Field curvature</b> (∝ ρ H²): the sharpest image lies on a curved surface, so on a flat image plane the spots grow toward the edge of the field even when each could be sharp at its own focus.</li>
            <li><b>Distortion</b> (∝ H³): the spots stay sharp but sit in the wrong place; read it in the Distortion column, not in the shapes.</li>
            <li><b>Chromatic aberration</b>: on axis, colours of different sizes (axial colour). Compare the singlet, whose blue F-line spot is 45 µm while its yellow d-line spot is 7 µm, with the achromat, whose three colours focus within 0.06 mm of each other. Off axis, colours shifted apart sideways (lateral colour).</li>
          </ul>
          <p>Real lenses show these together, and good designs balance them against each other rather than removing each one. The Seidel table on the Layout tab says which ones a design carries and which surface contributes them. Higher-order terms the table does not list become visible in the spots at large apertures and fields.</p>`,
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
        id: 'wavefront',
        title: 'The wavefront',
        html: `<p>Light from one object point leaves the lens as a wave converging on its image. For a perfect lens that wave is a sphere centred on the image point; a real lens bends it. The wavefront aberration measures by how much, in optical path: the rays are traced to a <b>reference sphere</b> centred where the primary wavelength’s chief ray meets the image plane, passing through the centre of the exit pupil, and for each ray${c('welford', 'born')}</p>`,
        formulas: [
          { tex: String.raw`W(p_x, p_y) = \frac{\mathrm{OPL}_\text{chief} - \mathrm{OPL}(p_x, p_y)}{\lambda}`, caption: 'In waves, counted from a common wavefront in object space (the object point, or a plane normal to an incoming collimated beam) to the reference sphere. The chief ray of each wavelength has W = 0.' },
        ],
        html2: `<p>This is the convention of OpticStudio and Optiland. A perfect-lens row has no glass to count, so it is given the optical path that makes it perfect between the paraxial conjugates of its beam: every ray from an object point then arrives at its image point with the same path. The shape of W is usually described by its <b>Zernike polynomials</b>, a set of shapes that are orthogonal over a circle: tilt, defocus, astigmatism, coma, spherical aberration and their higher orders. In Noll’s normalization${c('noll')} each has unit RMS over the pupil, so</p>`,
        formulas2: [
          { tex: String.raw`W(\rho, \theta) = \sum_j a_j Z_j(\rho, \theta), \qquad \sigma_W^2 = \sum_{j \ge 2} a_j^2`, caption: 'σ_W is the RMS wavefront error with piston (j = 1) removed; with tilt (j = 2, 3) removed as well it measures the sharpness of the image.' },
        ],
      },
      {
        id: 'diffraction',
        title: 'From the wavefront to the image',
        html: `<p>Because the wave has a finite aperture, even a perfect lens cannot focus it to a point: the image of a point is a diffraction pattern, the <b>point-spread function</b> (PSF). In the Fraunhofer, or Debye, approximation it is the squared magnitude of the Fourier transform of the <b>pupil function</b> P, taken over the directions (l, m) of the converging wave${c('goodman', 'born')}:</p>`,
        formulas: [
          { tex: String.raw`P = A\,e^{-2\pi i W}, \qquad \mathrm{PSF}(x, y) \propto \left|\iint P(l, m)\, e^{+2\pi i\, n (l x + m y)/\lambda}\, dl\, dm\right|^2`, caption: '(l, m) are the direction cosines of the converging rays, pointing from the reference sphere to its centre, and (x, y) the image position from that centre. A is the amplitude across the pupil: 1 for uniform light, or a Gaussian beam exp(−ρ²/β²) whose 1/e² radius is β pupil radii, and 0 where a ray is cut by an aperture. The minus sign in P follows from W being the chief ray’s path minus the ray’s.' },
        ],
        html2: `<p>The page samples P on an N × N grid across the pupil, pads it with zeros to N·Q per side, and takes a fast Fourier transform. The PSF then comes out on a grid of spacing Δ = λ N<sub>w</sub>/Q, where N<sub>w</sub> = 1/(2 NA) is the working F-number; Q = 2 is the least that samples it without loss. The NA is measured from the traced rays, in x and in y separately, because off axis the cone of light reaching the image narrows. For several wavelengths, each wavelength’s pupil is sampled a little more coarsely in proportion to λ N<sub>w</sub>, so that every PSF falls on the same image grid without interpolation: N counts the samples at the wavelength that needs the finest, and the transform grows so that every wavelength keeps at least 32. Wavelengths too far apart for that on a 1024 × 1024 transform, such as 400 nm with 10.6 µm, are refused rather than undersampled, and so is a pupil that apertures cut to fewer than 50 samples. The polychromatic PSF is their sum, each weighted by the wavelength’s weight and the light that passes the apertures.</p>
          <p>The <b>Strehl ratio</b> S is the PSF’s peak relative to that of a perfect lens with the same pupil. For a small aberration it follows from the RMS wavefront error alone, by Maréchal’s approximation${c('born')}:</p>`,
        formulas2: [
          { tex: String.raw`S \approx e^{-(2\pi \sigma_W)^2}, \qquad S \ge 0.8 \iff \sigma_W \lesssim \lambda/14`, caption: 'The usual definition of a diffraction-limited lens: Maréchal’s criterion.' },
          { tex: String.raw`\mathrm{MTF}(\nu) = \frac{|\mathcal F\{\mathrm{PSF}\}(\nu)|}{\mathcal F\{\mathrm{PSF}\}(0)}, \qquad \mathrm{MTF}_\text{perfect}(\nu) = \frac{2}{\pi}\left(\varphi - \cos\varphi \sin\varphi\right), \quad \varphi = \arccos\frac{\nu}{\nu_c}, \quad \nu_c = \frac{2\,\mathrm{NA}}{\lambda}`, caption: 'The modulation transfer function, and its closed form for a uniformly lit circular pupil: no lens of that NA transfers any contrast beyond ν_c.' },
        ],
        html3: `<p>Moving the image plane changes the reference sphere, and with it W; the through-focus curve recomputes the Strehl ratio at each plane, each on the coarsest pupil grid on which W changes by at most half a wave between neighbouring samples: 64 samples across (or N, if fewer), doubled as needed up to 128 (or N, if more). A plane whose wavefront is too steep even for that is left out of the curve rather than shown aliased; the plane at zero shift is the analysis itself. A Gaussian beam that the pupil does not cut focuses to the Gaussian waist w<sub>0</sub> = λ f/(π w), with w the beam’s 1/e² radius at the lens${c('siegman')}; one that the pupil cuts picks up rings.</p>`,
      },
      {
        id: 'reading-diffraction',
        title: 'How to read the wavefront, PSF and MTF',
        html: `<p>The three tabs answer the questions the spot diagram cannot, once the spot is about as small as the Airy circle: how much of the light lands in the central peak, and how much contrast the image keeps at each level of detail. All of them are for one field at a time; choose it above the plots.</p>
          <h3>The wavefront map and its numbers</h3>
          <ul>
            <li><b>Colours</b>: red where the wave is ahead of the perfect sphere, blue where it lags. A bowl (red centre, blue rim, or the reverse) is defocus; a saddle is astigmatism; a map that is high on one side and low on the other, with a bend, is coma; a flat centre with a raised or sunken rim is spherical aberration.</li>
            <li><b>RMS wavefront error</b> is the number to watch. Below λ/14, about 0.07 waves, the lens is diffraction-limited by Maréchal’s criterion. The curved-side-first singlet at 588 nm on axis has 0.086 waves at the paraxial focus, just above, and a Strehl ratio of 0.74 (Maréchal’s estimate gives 0.75). Peak-to-valley is quoted too, but one bad corner of the pupil can make it large while the image hardly suffers.</li>
            <li><b>Zernike coefficients</b> name the shapes: Z4 defocus, Z5 and Z6 astigmatism, Z7 and Z8 coma, Z11 spherical aberration. The largest one says what limits the lens. For the Cooke triplet at 14° and 550 nm, Z6 (astigmatism) is 0.65 waves and dwarfs the rest.</li>
          </ul>
          <h3>The PSF</h3>
          <ul>
            <li>A perfect lens gives the <b>Airy pattern</b>: a bright disc holding 84 % of the light, with its first dark ring at the Airy radius 1.22 λ N<sub>w</sub> (the dashed circle) and fainter rings beyond${c('born')}. Aberrations take light out of the core and into the rings and a halo; the logarithmic scale shows that faint light, which lowers the contrast of the image.</li>
            <li>The <b>Strehl ratio</b> is the brightest point relative to a perfect lens: 1 is perfect, 0.8 is the usual threshold for diffraction-limited, below about 0.1 the PSF looks more like the spot diagram than like the Airy pattern. At 588 nm the singlet with its flat side first has 0.12 on axis, against 0.74 for the same lens turned round.</li>
            <li><b>Spot and PSF together</b>: the spot diagram ignores diffraction and the PSF includes it. At 550 nm the Cooke triplet on axis has an RMS spot of 4.2 µm, close to its 3.35 µm Airy radius, yet a Strehl ratio of only 0.30: 0.18 waves RMS of path error, 0.64 waves from peak to valley, are enough to empty the core.</li>
            <li><b>Through focus</b>: where the Strehl curve peaks is the best focus for this field. Moving the image plane of the curved-side-first singlet about 0.12 mm toward the lens raises its axial Strehl ratio at 588 nm from 0.74 to 0.98, because defocus then cancels most of the spherical aberration. At 550 nm the Cooke triplet’s axial image would be sharpest 0.07 mm further from the lens (Strehl ratio 0.76 instead of 0.30), but its 14° and 20° fields want it 0.16 to 0.18 mm closer: the published image plane is a compromise across the field, which is field curvature at work.</li>
          </ul>
          <h3>The MTF</h3>
          <ul>
            <li>Read the curve as <b>contrast against detail</b>: coarse patterns (low frequencies) keep nearly all their contrast, fine ones lose it, and beyond the cutoff 2 NA/λ nothing is transferred (362 cycles/mm for the F/5 Cooke triplet at 550 nm). The grey curve is the perfect lens: the gap between the two is what the aberrations cost.</li>
            <li><b>MTF50</b>, the frequency where the contrast falls to one half, is a common single number for sharpness: 51.5 cycles/mm on axis for the Cooke triplet at 550 nm.</li>
            <li>When the <b>tangential and sagittal</b> curves part, the PSF is stretched in one direction, mostly by astigmatism or coma. For the Cooke triplet at 14° and 550 nm, at 50 cycles/mm the tangential contrast is 0.05 and the sagittal 0.12, where a perfect lens would keep 0.81.</li>
            <li>For a camera, compare with the sensor’s <b>Nyquist frequency</b>, 1/(2 × pixel pitch): 100 cycles/mm for 5 µm pixels. Contrast well above about 0.2 there means the lens out-resolves the sensor; much lower means the lens limits the image.</li>
          </ul>`,
      },
      {
        id: 'imaging',
        title: 'Imaging an extended object',
        html: `<p>The PSF is the image of one point. An extended target is many points, and how their images combine depends on whether the light from them can interfere${c('goodman')}. With h the amplitude PSF (the transform of the pupil function whose squared magnitude is the PSF) and o the target’s amplitude transmission, in image-plane coordinates:</p>`,
        formulas: [
          { tex: String.raw`I_\text{incoherent} = |h|^2 \circledast |o|^2, \qquad I_\text{coherent} = |h \circledast o|^2`, caption: 'In incoherent light the points’ intensities add; in coherent light their amplitudes add, and then interfere. ⊛ is convolution.' },
        ],
        html2: `<p>In spatial frequencies ν, each becomes a product. Incoherent imaging multiplies the target’s intensity spectrum by the optical transfer function (OTF), the transform of the PSF, whose magnitude is the MTF of the MTF tab: it passes frequencies up to 2 NA/λ, with falling contrast. Coherent imaging multiplies the target’s amplitude spectrum by the pupil function itself, read at the position λν/NA across the pupil: every frequency below NA/λ passes with its full amplitude (and with the wavefront error’s phase), and none above.</p>`,
        formulas2: [
          { tex: String.raw`\nu_\text{coherent} = \frac{\mathrm{NA}}{\lambda}, \qquad \nu_\text{incoherent} = \frac{2\,\mathrm{NA}}{\lambda}`, caption: 'The cutoffs: no detail finer than these reaches the image. Off axis the NA differs in x and y, and so do the cutoffs.' },
        ],
        html3: `<p>So coherent light keeps the full contrast of coarse detail but loses everything above half the incoherent cutoff, while incoherent light reaches twice as far, with contrast that fades toward the cutoff. The page computes both images from the same pupil. A bar target and a grating have closed-form spectra, so their images are exact up to the pupil sampling; the Siemens star is drawn on a grid at least four times finer than the image’s, averaged within each cell, before its spectrum is taken. Two points are images of the PSF itself, placed exactly. The images are relative to a large clear area (or, for two points, to the peak of one point through a perfect lens with the same pupil), and both share one intensity scale.</p>`,
      },
      {
        id: 'reading-imaging',
        title: 'How to read the images',
        html: `<p>The examples below are the perfect-lens preset (f 100 mm at F/10) at 588 nm, whose image-space NA is 0.05: its Rayleigh distance is 7.18 µm, its incoherent cutoff 170 cycles/mm and its coherent cutoff 85 cycles/mm.</p>
          <ul>
            <li><b>Two points at the Rayleigh distance</b>, the first dark ring of one on the peak of the other. In incoherent light the intensity between them dips to 73.5 % of the peaks: that dip is what <b>Rayleigh’s criterion</b> calls just resolved${c('born')}. In coherent light the answer depends on the phase between the two points. In phase, the amplitudes add between the points, which shine at about 147 % of one point’s peak: no dip at all, unresolved. In antiphase they cancel there, and the midpoint is dark: resolved better than in incoherent light. The criterion is defined for incoherent light; for coherent light there is no single resolution limit without the phase.</li>
            <li><b>A grating</b> shows the two cutoffs directly. At 0.4 of the incoherent cutoff (69 cycles/mm, below the coherent cutoff) coherent light keeps the full modulation, 1.00, while incoherent light keeps 0.63. At 0.6 of it (101 cycles/mm, above the coherent cutoff) the coherent image is a flat field, while incoherent light still shows the grating with modulation 0.37.</li>
            <li><b>The bar target</b> adds edges: in coherent light they ring, overshooting the clear level, because the edge loses its high frequencies all at once instead of gradually. Contrast below zero means the pattern is reversed, bright where the target is dark. Aberrations can do that: the Cooke triplet on axis at 550 nm images bars at 0.3 of its cutoff reversed in coherent light, with contrast −0.96.</li>
            <li><b>The Siemens star</b> shows every frequency at once: along a circle of radius r its pattern has spokes/(2πr) cycles per unit length, so it is resolved down to the radius where that reaches the cutoff (the dashed circles) and grey inside it. With 36 cycles the perfect lens resolves it in incoherent light down to 33.7 µm from its centre, and in coherent light only down to 67.4 µm. Off axis the circles become ellipses, because the cutoffs differ in x and y.</li>
          </ul>
          <p>Aberrations act differently in the two lights. In incoherent light they lower the MTF, so fine detail fades. In coherent light the pupil passes every frequency below NA/λ with its full amplitude, aberrated or not; the aberrations change only the frequencies’ phases, so the image changes shape (ringing, shifted fringes, reversed contrast) instead of fading evenly.</p>`,
      },
      {
        id: 'coupling',
        title: 'Coupling into a single-mode fiber',
        html: `<p>A single-mode fiber accepts one field pattern, its mode, and the fraction of an incoming field that enters it is their normalized overlap. The page takes the overlap in the exit pupil, on a sphere centred on the fiber’s core: there the mode’s far field has a flat phase, and its amplitude is a Gaussian in the angle α between the arriving light and the fiber’s axis, while the light the lens delivers is its pupil function P = A e<sup>−2πiW</sup>, with W measured to that same sphere:</p>`,
        formulas: [
          { tex: String.raw`\eta = \frac{\left|\int P\,M\,d\Omega\right|^2}{\int |P|^2 d\Omega \,\int |M|^2 d\Omega}, \qquad M = e^{-\sin^2\!\alpha/\theta_0^2}, \qquad \theta_0 = \frac{\lambda}{\pi n w_0}`, caption: 'w₀ = MFD/2 is the mode’s 1/e² radius and θ₀ its far-field half-angle; the integrals run over the solid angle Ω of the light arriving at the core, the mode’s over all directions. η ≤ 1, with equality only when P has the mode’s shape.' },
        ],
        html2: `<p>Centring the sphere on the core makes the misalignments exact. A core moved sideways or along the axis changes every ray’s path to the sphere, and W takes the tilt or defocus that follows; a tilted fiber turns the mode’s axis. Each pupil sample is weighted by the solid angle its rays fill on the sphere, measured from the traced directions, so the power it carries is conserved. For a perfect lens the overlap has closed forms. A Gaussian beam focused to the mode’s own size couples completely; with the core d to the side, the face Δz past the focus, or the fiber tilted by t,</p>`,
        formulas2: [
          { tex: String.raw`\eta = e^{-d^2/w_0^2}, \qquad \eta = \frac{1}{1 + (\Delta z / 2 z_R)^2}, \qquad \eta = e^{-t^2/\theta_0^2}, \qquad z_R = \frac{\pi w_0^2 n}{\lambda}`, caption: 'Each misalignment alone, for a matched Gaussian beam and mode; the page computes them together, and for any beam and lens.' },
          { tex: String.raw`\eta_\text{uniform} = \frac{2\left(1 - e^{-\alpha^2}\right)^2}{\alpha^2}, \qquad \alpha = \frac{\mathrm{NA}}{\theta_0}, \qquad \max \eta_\text{uniform} = 81.45\,\% \text{ at } \alpha = 1.121`, caption: 'A uniformly lit pupil through a perfect lens, from the overlap of a disc with a Gaussian: even the best mode leaves 18.5 % of the light, because a flat-topped pupil is not a Gaussian.' },
        ],
        html3: `<p>η is the share of the light reaching the face that enters the mode. The light lost before the face is listed beside it: a Gaussian beam’s tail outside the entrance pupil, the light cut by apertures (vignetting), and, if you tick the box, the reflections of uncoated surfaces at normal incidence, ((n − n′)/(n + n′))² each. Their product with η is the power in the fiber mode over the power in the beam. Coatings, absorption in the glass and the fiber’s own losses are not included.</p>
          <p>The pupil-based (Debye) model puts a beam’s focus at the paraxial image. A Gaussian beam of 1/e² radius w at a lens of focal length f in fact waists f³/(f² + z<sub>R</sub>²) nearer the lens, z<sub>R</sub> = πw²/λ${c('siegman')}: 2.2 µm for a 2 mm beam through 100 mm at 588 nm, against a focused Rayleigh range of 0.47 mm. When the shift matters, the Fresnel number of the beam seen from the image is small and a note says so.</p>`,
      },
      {
        id: 'reading-coupling',
        title: 'How to read the coupling',
        html: `<ul>
            <li><b>Start with the perfect lens</b>, the first line under the result: it is the coupling a flawless lens with the same pupil would reach, so what separates it from 100 % is <b>mode mismatch</b>, the beam’s shape against the mode’s. A uniformly lit pupil can reach at most 81.45 %: the perfect-lens preset at 588 nm gets 81.4 % with an 8.39 µm MFD, the size the table suggests (the “Use” button sets it). A Gaussian beam fills the mode far better: lit by a Gaussian beam of half the pupil’s radius, the same lens reaches 99.97 % with a 15.0 µm MFD.</li>
            <li><b>Then the aberrations</b>: the next line is this lens, aligned. A lens sharp enough for a camera can be a poor fiber coupler. The Cooke triplet at 550 nm on axis has a Strehl ratio of 0.30; with a 4 µm MFD a perfect lens of its aperture would couple 80.9 %, the Cooke itself 12.9 %, and even its best mode, 2.99 µm, only 15.3 %. At 14° its astigmatism leaves 4.4 % (12.6 % with its best mode, 9.98 µm). Coupling is a demanding test of the wavefront: on axis the Cooke keeps 0.16 of the perfect lens’s coupling, less than its Strehl ratio.</li>
            <li><b>Then the alignment</b>: the curves show how the coupling falls as the core moves sideways or along the axis from where you set it. Their peak is the best position along each line; a peak away from zero means the best core position is not where the chief ray lands, as off axis, where coma moves the brightest point. Lateral tolerances scale with the mode radius, axial ones with its Rayleigh range. Far from the focus the wavefront seen from the core tilts and curves until the pupil grid can no longer sample it; those positions are left out of the curves (a finer grid reaches further) rather than drawn with false peaks.</li>
            <li><b>Off axis</b>, the fiber points along the chief ray (its angle is in the table). Non-telecentric lenses deliver off-axis light at an angle, so a fiber left parallel to the axis would lose it: at 14° the Cooke triplet’s chief ray arrives 238 mrad from the axis, far beyond the 4 µm mode’s far-field half-angle of 87.5 mrad.</li>
          </ul>`,
      },
      {
        id: 'precision',
        title: 'How it was checked',
        html: `<p>An independent reference written in plain Python (<a href="${GITHUB}/validation/reference/lens_design.py" target="_blank" rel="noopener">lens_design.py</a>) recomputes the numbers by different routes: first-order data from 2×2 ray-transfer matrices, surface intersections by bisection, refraction by conserving the tangential component of n d, surface normals by a complex-step derivative, and the third-order coefficient of a real singlet from a polynomial fit to its real transverse aberration. The app agrees with it to 10⁻⁹ mm on first-order data and on ray positions for a Cooke triplet, an aspheric singlet and a near object; its S<sub>I</sub> agrees with Welford’s thin-lens formula for a lens of zero thickness to 10⁻⁹, and with the real-ray fit for a 4 mm lens to 10⁻⁵. An aplanatic plano-hyperbolic lens (conic k = −n²) images an axial point to within 10⁻¹² mm.</p>
          <p>As a second, outside check, the same Cooke triplet was traced by Optiland 0.5.5${c('optiland')}, an open-source design program: the focal length, pupils and F-number agree to 10⁻¹², 63 skew rays at three fields and three wavelengths to 10⁻⁹ mm, and the RMS spot radii on a 64 × 64 pupil grid to 10⁻⁷. The script and its output are kept with the tests.</p>
          <p>The wavefront and diffraction are checked the same two ways. The Python reference sums the optical paths of its own bisection trace and meets the reference sphere by its own route: the optical path differences agree to 10⁻¹⁰ waves on the Cooke triplet, an aspheric singlet and a near object. It integrates the exact (not parabolic) defocus of a perfect F/10 lens by Simpson’s rule: the on-axis Strehl ratio agrees to 3 × 10⁻⁴ for up to 0.75 waves of defocus. The diffraction-limited MTF matches its closed form to 3 × 10⁻³, and a Gaussian beam focuses to λ f/(π w) within 1 %. The page’s own tests add the rest of the specification’s cases: a perfect lens has Strehl ratio 1 and its first dark ring at 1.22 λ N<sub>w</sub> within 1 %; Strehl ratio against defocus follows sinc²; the FFT conserves energy to 10⁻¹⁶ (Parseval); the PSF lands on the side the rays do, for an upright and an inverted exit pupil. Optiland 0.5.5 computed the same Cooke triplet’s OPD (63 rays, to 10⁻⁹ waves), Noll Zernike fits (to 10⁻⁹ waves), FFT Strehl ratios and MTF: from the same pupil samples they agree to 10⁻¹¹ when its glass absorption is left out and to 10⁻⁴ with it, since Optiland weights the pupil by the glasses’ internal transmittance and this page does not.</p>
          <p>Imaging and fiber coupling have a reference of their own (<a href="${GITHUB}/validation/reference/lens_coherent.py" target="_blank" rel="noopener">lens_coherent.py</a>), which integrates the pupil by Gauss–Legendre quadrature in the radius on its own rays instead of summing a square grid. It evaluates the image of two points by the Debye sum, point by point, and takes the solid angles for the coupling from the derivatives of a polynomial fitted to the traced directions. Before computing anything it checks its own sign convention geometrically: moving the reference sphere’s centre sideways must leave the focus where the rays meet. Through a curved-side-first singlet on axis and at 3° and through the Cooke triplet on axis, two-point images agree to 2 × 10⁻³ of a perfect lens’s peak, and coupling efficiencies to 10⁻³ with a uniform pupil and 3 × 10⁻⁴ with a Gaussian beam, including offsets and tilts of both signs. For a perfect lens, the two-point images agree with the Airy pattern and the gratings with their Fourier series through the diffraction-limited MTF (both to 2 × 10⁻³), the best mode for a uniform pupil with the closed form 81.45 % to 4 × 10⁻⁴, and the Gaussian overlaps (offset, defocus, tilt) to 2 × 10⁻⁵. The page’s own tests check the specification’s remaining cases. A grating is transmitted in coherent light only below NA/λ and in incoherent light only below 2 NA/λ. An incoherent grating’s modulation equals 4/π times the MTF of the MTF tab. The images from the transform equal the point-by-point sum. A Gaussian beam focused onto a matched fiber through a perfect lens couples as the <a href="../fiber-coupling/">Fiber coupling</a> calculator’s closed form says.</p>
          <p>What this does not check is the physics left out: polarization (vector diffraction at high NA), partial coherence, coatings, absorption, tolerances and scattered light.</p>`,
      },
      {
        id: 'scope',
        title: 'Not in this version',
        html: `<p>Out of scope: optimization and tolerancing, mirrors, tilted or decentred surfaces, non-sequential paths, gradient-index and diffractive surfaces, vector diffraction, partially coherent illumination (Abbe’s and Hopkins’s theories of the microscope), field-dependent (non-isoplanatic) imaging of large targets, fiber modes other than a Gaussian, polarization ray tracing and coatings. For those, a full design program is the right tool: Zemax OpticStudio${c('opticstudio')}, the industry standard, or the open-source Optiland${c('optiland')}.</p>
          <p>The Cooke triplet preset is the “Cooke 40 degree field” sample of OpticStudio as distributed with Optiland${c('optiland')}, with SCHOTT N-SK16 in place of the original SK16 and its image plane where the prescription puts it. The achromat is the canvas’s own lens-group preset; the singlets are derived from the lensmaker’s equation at the d line.</p>`,
      },
    ],
    references: [
      { label: 'W. T. Welford, Aberrations of Optical Systems (Adam Hilger, 1986), chapters 7–8: Seidel sums, aspheric contributions, thin-lens aberrations.', url: 'https://search.mnlink.org/Record/fef7324d-544c-4d2e-97a0-160e72fcdc22' },
      { label: 'W. J. Smith, Modern Optical Engineering, 4th ed. (McGraw-Hill, 2008): paraxial ray tracing, pupils and stops.', url: 'https://www.accessengineeringlibrary.com/content/book/9780071476874' },
      { label: 'G. H. Spencer and M. V. R. K. Murty, “General ray-tracing procedure,” J. Opt. Soc. Am. 52, 672–678 (1962).', url: 'https://doi.org/10.1364/JOSA.52.000672' },
      { label: 'R. Kingslake and R. B. Johnson, Lens Design Fundamentals, 2nd ed. (Academic Press/SPIE, 2010): aspheric surfaces, the Cooke triplet.', url: 'https://shop.elsevier.com/books/lens-design-fundamentals/kingslake/978-0-12-374301-5' },
      { label: 'M. Born and E. Wolf, Principles of Optics, 7th ed., Cambridge University Press (1999), section 8.5.2 (the Airy pattern) and chapter 9 (the diffraction theory of aberrations: the Strehl ratio, Maréchal’s criterion).', url: 'https://doi.org/10.1017/CBO9781139644181' },
      { label: 'H. Kramer et al., Optiland: open-source optical design in Python (MIT licence), v0.5.5; samples/objectives.py, CookeTriplet.', url: 'https://github.com/HarrisonKramer/optiland' },
      { label: 'I. H. Malitson, “A redetermination of some optical properties of calcium fluoride,” Appl. Opt. 2, 1103–1107 (1963).', url: 'https://doi.org/10.1364/AO.2.001103' },
      { label: 'SCHOTT AG, Optical glass data sheets and Zemax catalogue (2017-01-20): Sellmeier coefficients of the catalogue glasses.', url: 'https://www.schott.com/en-gb/products/optical-glass' },
      { label: 'J. W. Goodman, Introduction to Fourier Optics, 3rd ed. (Roberts & Company, 2005), chapter 6: the pupil function, coherent and incoherent imaging, the coherent transfer function, the OTF and the MTF of a circular pupil.', url: 'https://search.worldcat.org/isbn/9780974707723' },
      { label: 'R. J. Noll, “Zernike polynomials and atmospheric turbulence,” J. Opt. Soc. Am. 66, 207–211 (1976): the ordering and normalization of the Zernike terms.', url: 'https://doi.org/10.1364/JOSA.66.000207' },
      { label: 'A. E. Siegman, Lasers (University Science Books, 1986), section 17.2: focusing a Gaussian beam.', url: 'https://search.worldcat.org/isbn/9780935702118' },
      { label: 'Ansys, “How to design a singlet lens, Part 1: Setup,” Zemax OpticStudio knowledge base, section “Defining fields in OpticStudio”: positive field angles give the ray a positive slope.', url: 'https://optics.ansys.com/hc/en-us/articles/42661252179987-How-to-design-a-singlet-lens-Part-1-Setup' },
    ],
  },
];
