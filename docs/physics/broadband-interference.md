# Pulsed and supercontinuum interference

## Model and conventions

A sized pulsed or supercontinuum source can interfere with split copies of
itself. The source spectrum is the app's existing power density per nanometre:
a Gaussian in wavelength (including for the existing sech² pulse setting),
truncated at ±3 standard deviations, or a flat continuum between its endpoints.
It is normalized over that support. This preserves the authored source model;
it does not assume a frequency-flat continuum or derive a new pulse spectrum.

For one source, the spectral field on a route is represented by up to eight
terms. For wavelength λ in nm, the dimensionless transfer amplitude is

    H(λ) = Σ a_j exp[i (2π × 10⁶ L_j / λ + φ_j)].

Here a_j is the real nonnegative amplitude, L_j the optical path in mm, and
φ_j the ideal surface phase in radians. The output power fraction is
`∫ S(λ) |H(λ)|² dλ / ∫ S(λ) dλ`. Spectrometers receive the shaped spectrum
`S(λ)|H(λ)|²`, not the incident spectrum rescaled by the integrated power.
An ideal beamsplitter contributes sqrt(T) on transmission and i sqrt(R) on
reflection; a fully reflective flat mirror contributes -1. Thus the two ports
of a lossless interferometer conserve power at every wavelength.

This is linear, time-integrated, same-pulse self-interference. A common input
chirp cancels between copies, so stretching both copies does not artificially
increase their coherence length. Independent sources add as powers. The model
does not introduce phase locking between distinct pulses, frequency-comb teeth,
nonlinear supercontinuum generation, arbitrary coating phase, or diffraction.

The physical principle is the field autocorrelation / spectral interferometry
relation: Kop and Sprik, “Phase-sensitive interferometry with ultrashort optical
pulses,” Rev. Sci. Instrum. 66, 5459–5463 (1995), equations (1)–(3).
[Paper](https://pages.cs.wisc.edu/~dluu/data/papers/e%20field%20corr/Phase-sensitive%20interferometry%20with%20ultrashort%20optical%20pulses%20%281995%29.pdf).

## Scope and numerical bounds

The carrier-phase allowlist remains authoritative: ideal nonpolarizing
beamsplitters, 100% flat mirrors, delay lines, phase objects and phase modulators.
Other optics keep their existing power propagation and report an unavailable
carrier phase when an interference calculation would need it. In particular,
material dispersion and the GDD compressor are not silently assigned a carrier
phase by this feature.

The wavelength quadrature resolves the fastest path-difference fringe and
uses composite Simpson quadrature, and checks convergence on refinement.
There are at most 8 field terms and 4097 wavelength samples; the initial grid
requires at least 32 samples per fastest fringe, and refinement must change
power by at most 2 × 10⁻⁶ times the sum of the individual term powers.
Recombination planning is bounded to four passes. A
calculation outside those budgets falls back to deposited power with an explicit
interference-unavailable reason; it never samples an unresolved fringe as a
false bright or dark port. The Python reference instead integrates in reciprocal
wavelength with the corresponding Jacobian, and checks refinement separately.
Analytic equal-path bright/dark limits supplement the numerical checks.

At detectors the existing ray tubes define spatial power density. Linear
phase slopes are integrated across each pixel (or the scalar aperture) using
a sinc factor at each wavelength; linear-polarization cross terms include
the cosine of the polarization-angle difference. Spatially changing internal
spectral amplitudes outside this interpolation model decline reconstruction.
The independent reference covers the wavelength integral; regression checks
also cover aperture clipping, pixel subdivision, orthogonal polarization,
cascaded interferometers and power conservation.

Recombined spectral power does not specify a temporal field. Pulse duration,
peak power, autocorrelation, time traces and downstream nonlinear calculations
must not inherit an arbitrary surviving arm's pulse. Where the combined temporal
field is not available, those quantities are unavailable; average power and the
computed spectrum remain usable. Pulse animation must not portray that output
as a known original pulse train. Nonlinear converters, OPOs and specimens with
a nonlinear channel pass an explicitly labelled unconverted input onward, and
writing a two-photon voxel from an unavailable field is disabled: their yield
depends on peak power. A chopper, an acousto- or electro-optic modulator and a
specimen's linear channels (fluorescence, spontaneous Raman, retardance) depend
on average power only, so they act on the recombined beam exactly as on any other.

A time gate on the recombined beam -- a chopper, or a modulated AOM, AOD, AOTF or
EOM -- cannot be timed against the pulse train, because the ray carries one arm's
timing, not the output's. It applies each gate's own average transmission and the
reading says so. That is exact for a gate unrelated to the pulse rate; a gate
synchronised to the pulses, which would pass all or none of them, is not resolved.

A detector reports an interference-unavailable caveat only where two routes from
the same source fall within what its aperture integrates. A single beam through a lens or a wave plate
has nothing to interfere with, and its power carries no such caveat.

## Coherence length

Each pulsed and supercontinuum source reports a coherence length in its
Interference panel: the optical path difference between two equal copies at which
fringe visibility, `|∫ S(λ) exp(2πi ΔL/λ) dλ| / ∫ S(λ) dλ`, first falls to one
half. It is computed from the same source spectrum the tracer integrates, so it is
the scale of what an interferometer in the app shows. For a narrow-band
transform-limited Gaussian pulse it approaches the pulse's own length, c × duration
(45.2 µm against 45.0 µm for 150 fs at 800 nm); the two part as the band widens,
because the source spectrum is Gaussian in wavelength and truncated. The default
flat continuum gives a fraction of a micrometre. A chirped pulse of the same
bandwidth has the same value. It is an estimate of the source, not of a particular
layout: unequal splitting or polarization lowers the contrast further.

The integral is taken in wavenumber, one octave of wavelength at a time, with
the band's width and the phases both referred to its mean, so a nanosecond pulse
(a band twelve orders narrower than its carrier) is resolved. Only the
single-band source shapes (Gaussian and flat) are supported. The readout says
"Not limited by this spectrum" only when the source has no band at all. It says
"Not resolved for this spectrum" for a sub-cycle pulse, whose band reaches below
a quarter of its centre wavelength: the Gaussian-in-wavelength source shape is
clipped at the 1 nm floor there and no longer describes a pulse.

This is not the CW laser's coherence-length parameter under another name. That
parameter is the full width at half maximum of the laser's visibility envelope
against arm mismatch, so its fringes are at half contrast at a mismatch of half
the stated length; the value here is the mismatch itself.

## Saved scenes

New pulsed and supercontinuum sources enable same-source interference. An old
saved source lacking the `interference` parameter loads with it disabled, so
existing files and share links retain their results. The source's Interference
control enables the new model explicitly; its value survives save and share.
The existing pulsed-source and fiber conversions are retained.


## Example controls

Both bundled Mach–Zehnder examples use ideal 50:50 splitters. Powers below
are fractions of the source power, summed over each detector aperture.

| Control | Expected result |
| --- | --- |
| Pulsed example: 800 nm, 150 fs Gaussian, ΔL = 0.02 mm | Ports ≈ 0.937383 and 0.062617. |
| Supercontinuum example: flat 400–700 nm, ΔL = 0.002 mm | Ports ≈ 0.552941 and 0.447059; complementary spectral fringes. |
| Set ΔL = 0 | Bright port 1, dark port 0. |
| Disable source Interference | Both ports 0.5; incident spectral shape preserved. |
| Increase ΔL within the sampling budget | Wavelength fringes become finer; integrated contrast follows the source spectrum. |
| Change common chirp at fixed spectrum | The average-power interference envelope stays unchanged. |
| Exceed the budget, or insert optics without a modeled carrier phase | Powers add with an explicit interference-unavailable reason. |

The spectral kernel agrees with the 16 independent reference cases within
1 × 10⁻⁵ absolute in source-power units. These are model/reference checks,
not experimental calibration of a detector or interferometer.
