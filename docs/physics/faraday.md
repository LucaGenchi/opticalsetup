# Faraday rotator and physical optical isolator

Step P2 of the [Physics in 2D track](../roadmap.md#physics-in-2d). Until this
step the optical isolator was a one-way gate (`case 'isolator'` in
`sketch/js/raytrace.js`): forward light passed untouched, backward light was
removed, and its wiki page said the Faraday mechanism was not modelled. The
model lives in `sketch/js/faraday.js`; the tracer applies it to the light
that crosses the two elements.

## Model

**Faraday rotation.** A magneto-optic medium of length L in a magnetic field
B along the beam turns the polarization by θ = V·B·L, with V the Verdet
constant. The turn is about the field's direction b̂ and right-handed for
V > 0, whatever way the light travels.

**Sign, in the basis of step A2.** Jones vectors are (E_p, E_s), the azimuth
is measured from p̂ towards ŝ and (p̂, ŝ, k̂) is right-handed
(`sketch/js/mueller.js`), so a turn right-handed about k̂ raises the azimuth.
Light travelling along b̂ therefore has its azimuth raised by V·B·L; light
travelling against b̂ has it lowered by the same amount, in its own basis.
Seen looking towards the source, a positive V turns the polarization
anticlockwise for light travelling along the field and clockwise for light
travelling against it. In the app's polarization angle (measured from the
drawing plane towards the viewer, for the light's own direction of travel)
light along the field has its angle raised by V·B·L. TGG's V is negative
(Slezák et al. 2016). Vojna et al. (2019) state that V is negative when the
medium rotates the polarization clockwise for light propagating parallel to
the field, without naming the viewing direction; the convention above is the
app's, stated in full.

**Non-reciprocity.** Because the turn is fixed by the field, a return pass
adds to the first instead of undoing it: the reciprocal rule of step A2
(J_back = Q·Jᵀ·Q) does not apply, and the element is handled where it is
traced. The tracer turns each crossing's Stokes state by
`rotationForCrossingDeg`: +V·B·L·s, with s = +1 for light along the field and
−1 against it (`rotateStokes`, `rotatorMueller`). A switching modulator's two
states are turned alike.

**Angle.** To first order the turn does not depend on the angle at which
light crosses the rod: the path through it grows as 1/cos θ while the field
component along the ray falls as cos θ.

**Verdet constant.** *Material* offers the catalogue's records that carry
Verdet data (step A3b: TGG, Vojna et al.'s single-transition model with
Slezák et al.'s sample NG6, 500–1100 nm, 295 K) and a custom constant,
signed, the same at every wavelength. Outside a record's range the element
computes no rotation (below).

**Broadband light.** A ray carries one polarization state for its whole
spectrum. Each wavelength turns by its own amount, so the state carried on is
the power-weighted average of the turned states (the Stokes vectors of the
spectrum's samples, added): light whose wavelengths now point different ways
is, to an instrument that does not resolve the spectrum, partly polarized.
That gives the power a polarizer passes after it exactly, as long as no other
element that acts differently at each wavelength follows; the spectrum the
polarizer leaves is not, and where the degree of polarization falls by more
than 0.01 the light carries a caveat saying so. Such light is marked: a second
Faraday rotator or physical isolator met before a polarizer restores one state
would need each wavelength's own state, which the average has lost (two
rotators with opposite fields undo each other wavelength by wavelength, which
the average cannot show), so its result is declared not computed, with that
caveat replacing the first. A polarizer or a polarizing beamsplitter makes the
state one again and clears the mark. Part of a band outside the
material's data keeps the state it arrived with, and the caveat names that
part. A switching modulator's two states are turned by the rotation at the
centre wavelength.

## Physical isolator

*Model* on the optical isolator keeps the **ideal one-way gate** as the
default and adds **Polarizers and a Faraday rotator**: an input polarizer
at the set angle a, a Faraday rotator of the chosen material, and an output
polarizer at a + 45° (both angles for light along the arrow; light crossing
the other way sees them at −a and −(a + 45°)). The field is chosen so that
light travelling forward is turned by +45° at the design wavelength λ_d, so
by θ(λ) = 45°·V(λ)/V(λ_d) at λ; the inspector gives the field-length product
B·L = (π/4)/|V(λ_d)| the design needs.

With ideal polarizers and δ(λ) = θ(λ) − 45°, light polarized along the input
polarizer passes forward as cos²δ, and light returning along the output
polarizer leaks back as sin²δ. Each polarizer is a linear diattenuator that
passes a power fraction 1 along its axis and 1/ER across it, ER its
extinction ratio, so at λ_d the isolation is ER (in dB). The tracer computes
the Mueller product per wavelength for the arriving state (`isolatorCrossing`)
and applies it across the light's spectrum with the tracer's spectral
transmission (`applyTransmission`; a lamp's lines one by one), so a short pulse
leaks back at the wings of its spectrum and its returning spectrum has a hole
at λ_d. The transmission is weighed scaled to its largest value over the band,
so a leak of 10⁻⁴ or less is not lost below the spectral integration's floor,
and a pulse whose spectrum it reshapes takes the duration of what survives.
That duration is a scalar transform of the surviving power spectrum; where the
leak's field changes sign across the band (going back, its amplitude follows
sin δ, which changes sign at λ_d inside the band; going forward, cos δ where
|δ| passes 90°) or its state varies across the band, the light is not one
scalar pulse, and the duration is declined ("not one scalar pulse").
The light leaves in the spectrum's average state, as above: going forward,
along the output polarizer to the polarizers' extinction; coming back, the
leak at the design wavelength (across the input polarizer) and at the wings
(along it) average to a partly polarized state, which gives the power a
polarizer after it passes. Light from a switching modulator keeps its two
states, each crossing with its own transmission at the centre wavelength: a
pulse train carries the difference as a gate, continuous light as each state's
weight (as at a Fresnel face). The state it leaves in is the two states'
average weighted by the light that arrives in each: for a pulse train, the
share of its pulses that meet each state, sampled pulse by pulse as a gate is,
so pulses synchronized with the modulator read the state of their phase.

The inspector's isolation is −10·log10 of what returns through the isolator
of light polarized along the output polarizer, which is the state of a
reflection of the forward beam; the forward figure is for light polarized
along the input polarizer.

## Declines

- A Faraday rotator whose material has no Verdet constant at a wavelength
  (TGG outside 500–1100 nm) computes no rotation there: the light keeps the
  polarization it arrived with and carries the caveat "Polarization not
  computed past a Faraday rotator", with the reason; the inspector says
  "not computed".
- A physical isolator at such a wavelength passes the light as the ideal gate
  would (forward through, backward blocked), with the caveat "Isolation not
  computed at an optical isolator". A design wavelength without a Verdet
  constant leaves no design, and the inspector says why.
- Where only part of a band lies outside the data, that part keeps its state
  (rotator) or passes as through the ideal gate (isolator), and the caveat
  names the part, in nm (each part separately where data are missing at both
  ends of the band).

## Not modelled

- The rod's index, its path delay and dispersion, absorption, surface
  reflections, heating and thermal lensing at high power, and a field that
  varies along the rod: the element is thin, at its centre, and drawn to its
  length.
- Temperature: TGG's Verdet constant is that of one sample at room
  temperature; Slezák et al.'s six samples range from 6.6 % below to 18.6 %
  above it at 632 nm.
- The polarizers' wavelength dependence and their own losses; the isolator's
  internal reflections and a beam displacer design (polarization-independent
  isolators).
- The spectrum that a polarizer leaves of light whose polarization varies
  across its spectrum: the state is carried as the spectrum's average.

## Validation

`validation/reference/faraday.py` computes, independently of the JavaScript:
the rotation V·B·L with Vojna's TGG model and a custom constant, for light
along and against the field; the Faraday mirror (Martinelli 1989) as the
round trip W^T R(θ) R(θ) W in laboratory axes with the mirror as the
identity, which returns light orthogonal to how it left for θ = 45° whatever
the retarder W, and sin²(2a) for a quarter-wave plate at a without the
rotator; and the isolator's forward and backward transmissions with Jones
matrices of partial polarizers in laboratory axes. The app answers the
Faraday-mirror cases by tracing a polarizing beamsplitter, a retarder, a
Faraday rotator and a mirror, so the reference also checks the tracer's
ray-frame conventions (the mirror, the reciprocal retarder, the
non-reciprocal rotator) against a calculation in another frame.
`test/faraday.test.js` holds the closed forms cos²δ and sin²δ, the
extinction-limited isolation, the declines and the caveats;
`test/faraday-examples.test.js` checks every number the two example pages
quote.

## Examples

- *Optical isolator — isolation across a pulse spectrum* (Ultrashort Pulses):
  a 15 fs pulse at 800 nm leaks back through an isolator designed for 800 nm
  at the wings of its spectrum.
- *Faraday mirror — a double pass that undoes an unknown retarder* (Beam
  Routing): a quarter-wave plate at any angle, a 45° rotator and a mirror send
  every return to the beamsplitter's return port. The fiber element passes
  polarization unchanged, so the plate stands in for a fibre's birefringence.

## Sources

- D. Vojna, O. Slezák, A. Lucianetti and T. Mocek, "Verdet constant of
  magneto-active materials developed for high-power Faraday devices,"
  *Appl. Sci.* 9, 3160 (2019), Eq. (13) and Table 2 (open access,
  CC BY 4.0).
- O. Slezák, R. Yasuhara, A. Lucianetti and T. Mocek, "Temperature-wavelength
  dependence of terbium gallium garnet ceramics Verdet constant," *Opt.
  Mater. Express* 6, 3683 (2016), Table 2.
- M. Martinelli, "A universal compensator for polarization changes induced by
  birefringence on a retracing beam," *Opt. Commun.* 72, 341 (1989),
  doi:10.1016/0030-4018(89)90436-7.
- R. J. Potton, "Reciprocity in optics," *Rep. Prog. Phys.* 67, 717 (2004).
