# Beam propagation in the drawing plane

Step G1 of the [Physics in 2D track](../roadmap.md#physics-in-2d). Until this
step a detector inferred an ideal waist from the cone its rays converged in,
and the zoom drew the diffraction-limited waist of a traced cone,
w₀ = λ/(π·NA); no beam parameter was propagated along the path. A laser drawn
with a size launched 25 parallel rays across its Beam width, the only beam
size a source had.

## Model

**Source.** A CW or pulsed laser drawn with a size starts a Gaussian beam
whose 1/e² diameter is its Beam width (0.1 to 60 mm), with the waist at its
output. The Beam width is the only size setting, so the drawn beam and the
beam parameter always agree; the collapsed *Gaussian beam* section adds the
beam quality M² (1 by default) and shows the waist, the Rayleigh range and the
divergence that follow. A laser drawn as a simple line starts none, and the
probe says so. A supercontinuum starts none either. That is a limit of this
model, not of the light: a supercontinuum can leave its fiber as a
single-mode, diffraction-limited beam, but it spans many wavelengths, the
size and divergence of a beam depend on the wavelength, and G1 follows one
beam parameter at one wavelength, so it would misstate most of the spectrum. An LED is an
incoherent, extended source and a point source radiates in all directions:
both are described by rays, not by a Gaussian beam. The step guide in
issue #313 also offered a waist size and a waist position overriding the Beam
width; Luca's review of the first version removed them, as two size settings
for one beam were confusing. The beam parameter is

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

**The ideal lens met off its axis.** A lossless optic keeps that determinant
at 1, and an aberration-free lens keeps a beam's quality M² (a real lens met
off its axis adds aberrations, which raise M²; this model has none). The
ideal lens does not keep the determinant where the beam meets it off its
axis: its mapping, perfect imaging onto a flat focal plane, has determinant
cos³θ_out / cos³θ_in in the drawing plane (0.7 % at 4°, 5.7 % for a beam
20 mm off the axis of an f = 100 mm lens), so it is not a physical lens
there. The beam still follows the matrix as measured, which is what the drawn
rays do: a collimated beam and an already converging one focus where the rays
cross. Where the determinant along the path has moved more than 1 % from 1,
every readout of that beam says its values are an estimate: the probe and the
detector cards name the lens and say by how much it would change the beam
quality (100·|det − 1|, a measure of how far the ideal lens is from a lossless
one, not an error bar on w₀, z_R or the waist position, which the model does
not give), and the focus screens of the wavefront and general detectors and
the zoom's note mark the waist "EST." or "estimate". (Keeping the size A and the focusing C and choosing
D = (1 + B·C)/A would make the step lossless, but it keeps only a collimated
beam's focus: a converging beam then focused 1.3 mm away from the rays'
crossing in a two-lens case. Rescaling A, B, C and D by 1/√det leaves q
unchanged, and M²·det would fall below 1, which no beam can have.)

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
each with its own companions' replay. A laser's beam parameter is evaluated
at the centre wavelength of the light: where dispersive glass, a grating, a
filter, a dichroic, an etalon or an AOTF separates its spectrum into parts,
each part carries the beam on at its own centre wavelength (a long-pass that
moves the centre to 800.76 nm, the two parts a notch leaves). The source's
waist is the same at every wavelength, so the Rayleigh range scales as 1/λ
and the distance from the waist does not change. Parts of one spectrum that
reach the same place are one beam: they add in power, and the strongest is
read, marked "strongest of N spectral parts". Converted light is told by
where it comes from, not by its wavelength, since a conversion can land
inside the pump's own band: every light a crystal set to convert generates
is new light, whose beam is not computed, and the pump passing through keeps
its beam. Light a specimen generates is new light too. Branches of the same
light (the same wavelength) that reach one place add as fields, and no
single beam describes them: the readout says they recombine.

## Readouts

The beam probe's *Gaussian beam size* view lists, one bullet each, the 1/e²
radius w, the wavefront (converging or diverging, with its radius of
curvature R), the waist w₀ and how far ahead or behind it lies, the Rayleigh
range and the beam quality M². Several beams get one block each, named by
their wavelength and direction of travel, as the probe's other views name
beams. A detector shows what that kind of detector could measure, one block
per beam:

| Detector | Shows |
|---|---|
| General detector (DET) | w, wavefront and R, waist, Rayleigh range, M², Gouy phase |
| Wavefront detector | w, wavefront and R |
| Camera | w (the beam's size on its face) |
| Photodetector, PMT, power meter, spectrometer, autocorrelator, polarimeter, eye | none: they do not measure a beam's size or shape |

All of it is in the drawing plane (step A5: `reading.beam` has the scope
*plane*, shown in the card's Scope row; the reading itself always holds every
property). The Gouy phase of a beam is half the sum of the phases of its two
transverse planes; until the out-of-plane size is added it assumes a
circular beam, and says so beside its value (`gouyScope: 'circular'`).

Only light that is there counts. A dark port of an interferometer keeps its
traced path with no power on it: neither the probe nor a detector reads a
beam there. A probe whose circle reaches past the end of a segment reads the
beam where the segment ends, not beyond the optic that ends it. Where light
arrives without a Gaussian beam the probe says which source sent it and why
it starts none. No readout names an internal step of the roadmap.

A wavefront or general detector on a focus reads FOCUS PLANE as before, from
the traced cone. Its waist, Rayleigh range and waist position are now the
propagated beam's where exactly one branch arrives (`waistModel:
'propagated'`), and the cone estimate otherwise, marked CONE EST. on the
screens (`waistModel: 'cone'`). The zoom draws the propagated waist where the
bundle's central ray carries one and notes *beam parameter*; elsewhere it
keeps the cone estimate and notes *cone estimate*. A propagated waist that lies
outside the bundle's stretch is not drawn there: the rays' crossing is then not
where the beam is narrowest. An edge that clips the beam before its waist or
within the drawn stretch ends the beam parameter there for the zoom too, which
then keeps the cone estimate.

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
  on that side; a circular aperture of radius 1.5 w passes 98.9 %, close to the
  usual rule that a diameter of π·w passes 99 %): any element's edge near the
  beam between two interactions, and the rim of the surface the beam meets,
  its footprint widened by 1/cos(incidence) on a tilted surface and followed
  across smoothly joined facets of the same element. The readout quotes the
  edge's distance and 1.5 w there. A clipped beam diffracts at the edge and is
  no longer Gaussian, so no w, R or waist follows. The 25 drawn rays span only
  ±w, so an edge can clip the beam without stopping a drawn ray;
- a far-field half-angle above 0.2 rad (the paraxial limit: the readout says
  the beam is focused too steeply for the Gaussian-beam formulas);
- a companion ray that misses the surface or leaves the central ray's
  sequence of interactions (the readout says the beam cannot be followed
  through it);
- a wavelength conversion, and branches of the same light that overlap again. On
  a detector two branches recombine when their spots overlap (closer than
  1.5 (w₁ + w₂)); separate spots are read one by one. At the probe, branches
  recombine when they travel together through its circle (within 0.1 rad) and
  overlap across the beam by the same measure; parallel beams side by side in
  a wide circle, and beams that cross it at larger angles, are listed apart.

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
of 50 µm. A laser's own waist sits at its output and the tracer meets a lens
from 0.1 mm on, so these three cases apply the lens matrix the companions
measure to the issue's beam; a fourth check runs a 0.2 mm laser beam through
the readout itself, 0.1 mm before the lens, against the q law by hand. An
independent pass over every bundled scene (outside the suite) recomputed
each propagated track that meets only thin lenses and flat optics with
free-space and thin-lens Gaussian optics: all 56 vertices met on the lens
axis agree to 4 × 10⁻⁸, and
the only differences are beams that cross an ideal lens off its axis, which
follow it as described above (`test/beam-propagation.test.js` checks such a
beam against the q law by hand). The calculators' closed forms (`calculators/assets/gaussian-beam.js`,
used by the thin and thick lens and fiber-coupling pages) now go through the
same q law as the canvas.
