# Beam propagation in the drawing plane

Step G1 of the [Physics in 2D track](../roadmap.md#physics-in-2d). Until this
step a detector inferred an ideal waist from the cone its rays converged in,
and the zoom drew the diffraction-limited waist of a traced cone,
w₀ = λ/(π·NA); no beam parameter was propagated along the path. A laser drawn
with a size launched 25 parallel rays across its Beam width, the only beam
size a source had.

## Model

**Source.** A CW or pulsed laser drawn with a size starts a Gaussian beam from
what it already has: a 1/e² radius w of half its Beam width, the waist at its
output and M² = 1. Three optional settings in the collapsed *Gaussian beam*
section override this: the waist w₀, the waist's distance after the output
(negative before it) and M². A laser drawn as a simple line has a beam
parameter only when its waist is set. A supercontinuum, an LED and a point
source start none. The beam parameter is

1/q = 1/R − i·M²·λ / (π·n·w²),  q = z + i·z_R

(P. A. Bélanger, *Opt. Lett.* 16, 196 (1991)), with z the distance from the
waist, R the wavefront's radius of curvature and n the medium's index; a
beam of quality M² is the embedded Gaussian of ISO 11146, the TEM₀₀ formulas
with λ replaced by M²·λ/n (`sketch/js/gaussian-beam.js`).

**Propagation.** The in-plane ray-transfer matrix of each branch is measured
from the tracer itself (`sketch/js/beam-propagation.js`). The source marks one
central ray (the middle of a sized beam's 25), which records every interaction
it meets: the surface, the hit, the ray as it arrived and which of the
interaction's children it continued as. After the final trace two companion
rays replay those steps, one displaced across the central ray by
δy = 0.1 µm, one tilted by δθ = 1 µrad. Each meets the same surface (a straight
facet extended past its ends), and the tracer's own `interact()`, run on a
copy of the central ray moved to the companion with nothing recorded about the
scene, gives its outgoing direction. At the plane through the central ray's
vertex, square to its new direction, each companion's offset y along p̂ (the
direction of travel turned a quarter turn anticlockwise, the basis of step A2)
and its reduced slope V = n·sin(angle to the central ray) give the matrix from
the source:

A = y₁/δy, C = V₁/δy (the displaced companion), B = y₂/δV, D = V₂/δV (the tilted
one, δV = n₀·sin δθ),

and q′/n′ = (A·q/n + B)/(C·q/n + D). This is the waist-ray and
divergence-ray method of optical design programs (R. Herloski, S. Marshall
and R. Antos, *Appl. Opt.* 22, 1168 (1983); J. A. Arnaud, *Appl. Opt.* 24, 538
(1985)). Thin and thick lenses, aspheres, lens groups, the objective, tilted
and curved mirrors, prisms and gratings are covered by construction, with
their in-plane anamorphic factors, and the beam cannot disagree with the drawn
rays. Along a segment q advances by the distance travelled. A reflection
mirrors the plane, so in this basis it negates the matrix, which leaves q
unchanged.

The matrices are a first-order finite difference: their error shrinks in
proportion to δy and δθ (test/beam-propagation.test.js), and at the default
step it is about 10⁻⁶ of B through a prism or a grating and 4 × 10⁻⁷ on D of a
tilted mirror. The determinant of the reduced matrix, which is the companion
invariant n·(y₁·u₂ − y₂·u₁), is 1 to 10⁻⁶ in every validation case.

**Fibers.** A fiber whose output mode is known starts a new beam on its end
face, waist on the face, M² = 1: a step-index fiber whose *single-mode core*
diameter is set, through the best-coupling Gaussian of its exact LP₀₁ mode at
V = 2π·a·NA/λ with the fiber's input NA (`sketch/js/lp01.js`, moved there from
the fiber-coupling calculator, which imports it as before), for
1.2 ≤ V < 2.405; a hollow-core capillary through the Gaussian of 1/e field
radius 0.64·a that `sketch/js/fiber.js` already uses for its HE₁₁ mode. The
output cone the fiber draws is still its NA, so the drawn rays and the beam's
divergence need not agree. A fiber with a focusing output, or without a known
mode, starts none, and light that came in with a beam parameter says why.

**What a child inherits.** At a split (beamsplitter, polarizing splitter,
grating orders, dichroic ports) every branch carries the beam parameter on,
each with its own companions' replay. Where two branches of one source reach
the same detector, they add as fields and no single beam parameter describes
the light: the detector declines. At a wavelength conversion the generated
light starts no beam parameter in this version; the unconverted pump keeps
its own. Light a specimen generates is new light and starts none.

## Readouts

Every detector the beam reaches, and the beam probe's *Gaussian beam size*
view, report per source and branch: the 1/e² radius w, the wavefront's radius
of curvature R (converging or diverging), the waist w₀ and how far ahead or
behind it lies, the Rayleigh range, and the Gouy phase relative to the waist,
atan(z/z_R). All are in the drawing plane (step A5, `reading.beam` has the
scope *plane*). The Gouy phase of a beam is half the sum of the phases of its
two transverse planes; until step G3 supplies the second plane it assumes a
circular beam, and says so beside its value (`gouyScope: 'circular'`).

A wavefront or general detector on a focus reads FOCUS PLANE as before, from
the traced cone. Its waist, Rayleigh range and waist position are now the
propagated beam's where exactly one branch arrives (`waistModel:
'propagated'`), and the cone estimate otherwise, marked CONE EST. on the
screens (`waistModel: 'cone'`). The zoom draws the propagated waist where the
bundle's central ray carries one and notes *beam parameter*; elsewhere it
keeps the cone estimate and notes *cone estimate*. A propagated waist that lies
outside the bundle's stretch is not drawn there: the rays' crossing is then not
where the beam is narrowest.

For an ideal beam (M² = 1) in air, the cone estimate λ·f/(π·w) is the limit of
the propagated waist when the Rayleigh range of the incoming beam is much
longer than f. Where they differ (a shorter Rayleigh range, a waist away from
the lens, M² above 1, a medium other than air) the readout follows the
propagated value. Two cases the tests hold:

- A 10 mm, 532 nm beam into an f = 100 mm lens: propagated w₀ = 3.387 µm,
  z_R = 67.74 µm, 24 nm before the geometric focus; the cone estimate gave
  3.391 µm and 67.9 µm (it uses sin of the edge ray's angle, the paraxial beam
  its tangent).
- A 1 mm, 532 nm beam into an f = 2 m lens: the beam's own Rayleigh range,
  1.48 m, is not long against f, and the waist, 409 µm, lies 1.30 m before the
  geometric focus, where the cone estimate put 677 µm.

## Declines

The beam parameter stops, and every readout downstream names the element and
the reason (the detector's inspector card, the probe card), at:

- an element with no paraxial model: a diffuser, a deformable mirror, a DMD, a
  pulse shaper or SLM pattern, a metasurface lens, a specimen, a retina, an
  OPO or OPA crystal;
- an edge within 1.5 beam radii of the central ray, which clips the beam (at
  1.5 w a Gaussian's in-plane profile has 0.13 % of its power beyond the edge
  on that side): any element's edge near the beam between two interactions,
  and the rim of the surface the beam meets, its footprint widened by
  1/cos(incidence) on a tilted surface and followed across smoothly joined
  facets of the same element;
- a far-field half-angle above 0.2 rad (the paraxial limit);
- a companion ray that misses the surface or leaves the central ray's
  sequence of interactions;
- a wavelength conversion, and branches of one source that recombine.

## Not modelled

- The beam out of the drawing plane (step G3); an astigmatic beam is
  represented by its in-plane half only.
- Aberrations beyond first order: the matrix is the local, paraxial one about
  the central ray.
- Clipping: a clipped beam is declined, not truncated.
- The beam's own effect on the drawn rays: the 25 rays of a sized laser still
  sample its width uniformly; the envelope drawing is step G2.
- The accumulated Gouy phase between branches and Gaussian interference
  profiles on cameras (step G5).

## Validation

`validation/reference/beam_propagation.py` builds the analytic matrices
(free space, thin lens, refraction at a sphere, a thick lens as a product of
surface matrices, a concave mirror at incidence θ with in-plane focal length
(R/2)·cos θ, a tilted plane interface and a prism with their anamorphic factors,
a reflection grating, a Keplerian expander) and the three ideal-thin-lens
waists of issue #313 (100 µm at 1 µm, waist on the lens): for z_R ≫ f the
cone estimate; for M² = 1 and f = z_R = 31.416 mm, 70.711 µm at 15.708 mm; for
M² = 2 and f = z_R = 15.708 mm, 70.711 µm at 7.854 mm, against a cone estimate
of 50 µm. The calculators' closed forms (`calculators/assets/gaussian-beam.js`,
used by the thin and thick lens and fiber-coupling pages) now go through the
same q law as the canvas.
