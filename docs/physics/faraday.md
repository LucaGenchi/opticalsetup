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
That gives the power a polarizer passes after it exactly, as long as nothing
between them passes wavelengths by their own shares (a filter, an angled glass
face, another Faraday element); the spectrum the
polarizer leaves is not, and where the degree of polarization falls by more
than 0.01 the light carries a caveat saying so. The light also carries how far
the state of any wavelength in its band lies from the average (the largest
distance of their normalized Stokes vectors, `stateSpread`). An element that
passes each wavelength by a share depending on its polarization, m00·(1 + d·s)
for its diattenuation vector d (a polarizer, a polarizing beamsplitter's port,
a glass face at an angle), uses it: the share of any wavelength differs from
the average's by at most |d|·spread/(1 + d·s̄) of it, and where that exceeds
1 % (the isolator's own reshaping test) the spectrum it leaves and the pulse's
duration are declared not computed. The power right past it is exact only if
nothing between it and the Faraday element passes wavelengths by their own
shares, and what a later filter selects from its spectrum is not computed
(a 2 nm band-pass after Andrea's crossed analyzer reads 3.4 nW against
18.12 pW integrated), so the caveat says both and vouches for no power. A glass
face that passes p and s differently can move the wavelengths' states further
apart than the Faraday element left them (at 80° incidence on index 2.5, an
analyzer's share then runs from 44.52 % at 780 nm to 38.73 % at 820 nm, 41.50 %
for the average): past such a face the spread is not bounded any more (it is
set to 2, the widest two normalized Stokes vectors can lie), so a polarizer
after it declares. Dispersive glass cuts a band into slices that carry no
spectrum of their own but keep the average state and its spread, so a
polarizer after the glass still declares; a Faraday element or isolator that
meets a slice samples it across its own part of the band (`sliceProfile`), and
the isolator weighs each slice's profile by its transmission across the
slice and carries it on reshaped, so a filter after it cuts the light that
passed. The spectrum the isolator reshapes is kept on one point every 0.04 nm
(257 to 4097 points; 4001 across a 15 fs pulse's band) rather than the
tracer's usual 65 across the band, and a slice of a band on the same spacing:
its leak dips by the polarizers'
extinction within a few nm of the design wavelength, and a 2 nm band-pass after
it read 4.8 % off the same filter before it on the coarser grid (0.8 % at
60 dB on 1025 points; slices on 257 points each were 0.97 % apart). The
isolator's polarizers and the state past the first are set up once per
arriving state (`isolatorCrosser`), so each wavelength costs only a rotation
and one matrix; within one trace its transmission at each wavelength, and
the spectrum an arriving spectrum leaves with, are kept and shared by the rays
that cross it the same way in the same state (a sized beam's 25 parallel
rays), keyed by the arriving spectrum's content. A profile finer than the
tracer's 65-point grid is integrated on its own samples (exactly for the
straight lines that join them), and a filter, dichroic or notch that cuts it
keeps those samples and the cut's exact edges as a window (nothing lies
outside it; spectrumSupport, spectrumWeight and the integrals read it). The cut is marked fine, so it keeps this path however few
samples it left (a 2.5 nm cut leaving 65 samples read 1.8 % off when it was
re-sampled again); a smooth transmission applied to it is read as finely as on any
other profile across the light that survives, each sample's step divided into
equal parts whose points lie on the same straight segments; an AOTF channel
asks for one point every 1/32 of its passband there (a 0.1 nm channel read at
0.04 nm samples alone passed 8.85 % too little; both orders now agree with
the integral within 0.04 %). Re-sampling the cut moved features a sample or two wide:
the resonances of an etalon of FWHM 0.04 nm, about one sample wide, read
21.6 % off through a 10 nm band-pass in front of a 1 nm one, and 21.8 %
through a 101 nm one; keeping only the samples inside left a sliver at each
edge that a narrower filter after it missed (two notches 2.2 % off). Both
orders now agree to 10⁻¹¹. The example
at 60 dB with a band-pass after the isolator re-traces in about 4 ms per move
in Node (about 12 ms with N-BK7 before it), where it took 57 ms (44 ms)
before these and 400 ms with 4097 points per slice.
A filter after it keeps those points (a sampled profile is re-sampled on its
own points, up to 4097, rather than on 65), and faint light the tracer keeps
on purpose (the isolator's output among it) stops at a filter, a dichroic or a
notch only below 10⁻⁶ of what reaches it (`WEAK_LIGHT_FLOOR`), where other
light stops below 10⁻⁴. The floor applies where the tracer weighs a
spectrum. Where a share is a plain number (a neutral density, a partial
mirror, a partly reflecting dichroic band met by light of one wavelength; a
polarizer down to 10⁻¹²) the share is passed however faint, as #193 decided
for weak beams, so that an OD 6 beam is still drawn: a neutral density of
5×10⁻⁷ after the isolator passes 0.5 µW of 1 W. A flat band (a
supercontinuum) crossing a partly reflecting dichroic band also gets the
plain share; a sampled or Gaussian spectrum is weighed across it, so its share
meets the floor (10⁻⁴, or 10⁻⁶ for light kept on purpose), as on `main`: at
99.99995 % a line and a flat 790–810 nm band transmit 0.5 µW, a 100 fs pulse
nothing. Where an edge of the band cuts the spectrum, the floor is applied to
each piece before the band's share multiplies it, so a port can end below the
floor: at 0.00005 % a 100 fs pulse at 800 nm reflects nothing from a
700–900 nm band but 0.25 µW from an 800–900 nm one. Whether
the plain-number shares should stop below 10⁻⁶ too is Luca's decision, not
made here. Luca allowed 10⁻⁵ or 10⁻⁶ for such light, not lower,
so the bench does not fill with light no one would see. At 60 dB (set
directly in the tests; the setting stops at 50 dB) the 2 nm band holds
2.2×10⁻⁵ of it, 84.59 nW. Measured in the isolator
example with a 2 nm band-pass, a dichroic band or two notches, at 40 and
60 dB, with and without N-BK7 before the isolator, the two positions agree
within 0.1 %; this is what the tests check, not a bound for other scenes. An analyzer crossed
with a forward isolator's output passes only the part of the field that goes as
sin(θ(λ) − 45°), nought at the design wavelength, so declares; one along that
output keeps the spectrum and the duration. A polarizer leaves every
wavelength in one state, so the spread after it is zero. Light whose wavelengths a
Faraday element left in states that differ at all (the weighted mean distance
of their normalized Stokes vectors from the mean one above 10⁻⁹, numerical
noise) is marked, caveat or not. A second Faraday rotator or physical isolator
met anywhere after it would need each wavelength's own state, which the
average has lost: its result could be off by up to that distance times the
power, and no smaller bound holds in general (a fall of 4×10⁻⁷ in the degree
of polarization gave 53 µW of 1 W in Andrea's case, because the power after an
analyzer depends on the states to first order and the degree of polarization
only to second). So its result is declared not computed, with that caveat
replacing the earlier Faraday ones. A polarizer or a polarizing beamsplitter
does not clear the mark: it leaves one state, but passes each wavelength by
its own share, which the average spectrum does not carry. This includes a
broadband beam that crosses a physical isolator forward and comes back
through it; the isolator example therefore sends its pulse in backwards, in
the state a reflection has. Part of a band outside the
material's data keeps the state it arrived with, and the caveat names that
part. A switching modulator's two states are turned by the rotation at the
centre wavelength. A pulse whose wavelengths the rotator turns differently
gets no duration: its field now points different ways at different
wavelengths and is not one scalar pulse (20 mm of TGG at 10 T splits a 15 fs
pulse into two lobes 30 fs apart). A switching modulator's two states are each checked on
their own (two orthogonal states average to no polarization at all): where
either turns differently across the band, the light carries a caveat that its
polarization and power past the rotator are not computed for the two states,
and the pulse gets no duration.

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
What the isolator passes stops below 10⁻⁶ of what arrives, as at a filter; the
extinction setting stops at 50 dB (about a good Glan polarizer's 10⁵:1), so
that at the design wavelength a leak of 10⁻⁵ comes back rather than nothing.
A pulse whose spectrum the isolator reshapes by more than 1 % (its
transmission, relative to its largest value, varies by that much across the
band), or whose state arrives or leaves varying across it, does not get a
duration: the field that passes can change sign or polarization from one
wavelength to another (the leak going back follows sin δ, which changes sign at
λ_d; light entering across the input polarizer follows it going forward too),
and a scalar transform of its power spectrum would be wrong (195 fs against
91.7 fs in one case). The duration is declined ("not one scalar pulse"), also
on the path a switching modulator's light takes. A pulse the isolator barely
changes (a 100 fs pulse going forward near λ_d) keeps its duration.
The light leaves in the spectrum's average state, as above: going forward,
along the output polarizer to the polarizers' extinction; coming back, the
leak at the design wavelength (across the input polarizer) and at the wings
(along it) average to a partly polarized state, which gives the power a
polarizer after it passes. Light from a switching modulator is first sorted by
the states that carry it: for a pulse train, the share of its pulses that meet
each state, sampled pulse by pulse as a gate is. Pulses synchronized with the
modulator that all meet one state, and a modulator whose two states are the
same, cross as light in that state, wavelength by wavelength, exactly as above.
Only a state that no light meets at all is left out: a weak one can be the one
a later element passes (2.51×10⁻⁵ of the power after a first isolator at
23 dB, but along the second one's axis: 14.55 µW where the strong state alone
gives 3.98 µW).
Light in two different states keeps them: each crosses as its spectrum's
average, its transmission and the state it leaves in (partly polarized where
its wavelengths leave in different states), which gives the power right after
the isolator and after one polarizer; a pulse train carries the difference as
a gate, continuous light as each state's weight (as at a Fresnel face). Its
spectrum is not reshaped: where either state's transmission or the state it
leaves in varies across the band (each state checked on its own, since two
orthogonal states average to no polarization at all), the light says its
spectrum and polarization past the isolator are not computed, is marked for a
later Faraday element, and a pulse gets no duration. In Andrea's case, an EOM
alternating linear and circular pulses into an isolator and an analyzer at
135°, this reads 28.08 nW, the mean of the two states prepared on their own
(34.10 and 22.05 nW), against 28.02 nW from an independent integration.

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
- Spectral detail about one sample wide through elements other than filters.
  A fine profile (finer than the tracer's 65-point grid, or cut from one,
  such as the isolator's leak or an etalon of FWHM 0.04 nm behind it) keeps
  its own samples, with exact edges, through filters, dichroics, notches,
  etalons and AOTF channels. Its integral is exact for the straight lines
  that join its samples; a smooth transmission (an etalon, an AOTF channel)
  is multiplied in at those samples and at points that divide each step
  between them, so it is read on that finer grid, not exactly. Dispersive
  glass, which cuts a band into slices weighed on a grid of its own, the
  AOTF's depleted output, and other elements that re-sample a spectrum
  (gratings, prisms) still re-sample it, so a reading behind them that
  depends on features one sample wide can change with the order of the
  elements: behind 12 mm of N-BK7, a band-pass and a 0.1 nm AOTF channel
  read 196.4 and 174.1 nW in the two orders, and a band-pass read 425.0 and
  506.8 nW through an AOTF's depleted output, with an etalon comb. The tested
  cases with the isolator's own, smooth profile (glass and filters, at 40 and
  60 dB) agree within 0.1 %. Keeping a fine profile's samples in every
  element is a separate change.
- The spectrum that a polarizer leaves of light whose polarization varies
  across its spectrum: the state is carried as the spectrum's average, and
  where the polarizer's share could vary by more than 1 % across the band the
  spectrum and duration past it are declared not computed.

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
  a 15 fs pulse at 800 nm, sent into an isolator designed for 800 nm from its
  output side in the state a reflection has, gets through at the wings of its
  spectrum.
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
