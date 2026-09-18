# Hollow-core pulse compression

Open **Examples → Ultrashort Pulses → Hollow-core pulse compressor**.
The native scene contains an enabled 800 nm Gaussian pulsed laser, an argon
capillary (the ordinary fiber tool with its model set to Hollow core · argon),
a 10% diagnostic tap, a signed-GDD compressor, two general detectors and their
linked screens. The tap measures the fiber output before compensation; the
other detector measures the compressed pulse. The layout is illustrative,
not a reconstruction of a specific experiment.

![Actual scene export, not a browser screenshot](hollow-core-example.png)

## Default and control experiments

The laser emits 100 fs pulses, 30 µJ each, at 1 kHz (30 mW average power).
The capillary is 1 m long, with a 250 µm core, 2 bar argon at a fixed 20 °C,
and a chosen 0.1 dB/m power loss. The effective area uses the Gaussian
convention `Aeff = π (0.64 a)²`, where `a` is the core radius. Geometrical ray
capture is assumed to couple perfectly into this mode; this is not a
mode-overlap calculation.

**Effective-area convention, derived.** The capillary's HE₁₁ mode is
`E(r) = J₀(u₁₁ r / a)` for `r < a`, with `u₁₁ = 2.4048`. Its own effective
area, `(∫|E|² dA)² / ∫|E|⁴ dA`, integrates numerically to **0.477 πa²**. The
Gaussian that couples best to that mode has a 1/e field radius of
**0.6435 a** (98.1 % power overlap); rounding to 0.64 a gives
`π (0.64 a)² = 0.410 πa²`. The code uses this Gaussian value, so its γ is
**16 % larger** than the exact J₀ mode's would be. At 250 µm and 2 bar this is
γ = 7.79 × 10⁻⁹ W⁻¹ m⁻¹ with the Gaussian area, against 6.69 × 10⁻⁹ with the
exact one. The two are not interchangeable: the choice scales the nonlinear
phase, and therefore the example's broadening, directly.

| Control | Expected result |
| --- | --- |
| Default: compressor −650 fs² | About 102.3 fs at the capillary exit and 45.3 fs after compensation. Spectrum broadens in the capillary and is unchanged by the compressor. |
| Compressor GDD = 0 | Both detectors report the same pulse duration. |
| Kerr nonlinearity off | Nonlinear phase becomes zero. The spectrum stays at the input bandwidth while linear dispersion still acts. Retune the compressor; the original setting overcompensates this control. |
| Pressure = 0 | Gas dispersion and Kerr response vanish. Negative waveguide dispersion remains; hollow core is not β₂ = 0. |
| Double laser average power at fixed repetition rate | Pulse energy doubles, increasing nonlinear phase and spectral broadening; the previous compressor setting need not remain optimal. |
| Increase core diameter | Both waveguide dispersion magnitude and Kerr coefficient decrease approximately as inverse radius squared. |
| Laser power = 0 | No coupled pulse energy: no light exits the capillary. |
| 10 bar and a 50 µm core, or 1 W average power | Outside the solver's bounds. The light continues with argon's linear β₂ only; every downstream readout, spectrum and power included, shows “Linear-only approximation; nonlinear output unavailable”, and no duration is predicted. Returning to a supported setting restores the computed result. |
| Laser at 450 nm | Outside the argon data (468–2059 nm). The light continues geometrically with “Argon dispersion unavailable … geometric continuation only”; no argon β₂ or group index is claimed. |

Select the cable to inspect captured energy, calculated β₂, accumulated
nonlinear phase, spectrum RMS width and the output temporal intensity curve.
Select either detector for its current temporal curve and computed intensity
FWHM, including additional downstream GDD. The general-detector screens show
the arriving duration; their Spectrum view shows the propagated spectrum.
FWHM spans the outermost half-maximum crossings if the pulse has several peaks;
it should not be interpreted as the duration of one clean isolated pulse.

## Physics and assumptions

`sketch/js/pulse-field.js` implements a scalar symmetric split-step Fourier
solution with second-order dispersion, instantaneous Kerr phase and distributed
power loss. It propagates a complex field, not just a bandwidth or chirp scalar:

- Linear frequency-domain step: `Ã ← Ã exp(i β₂ Ω² Δz / 2)`.
- Nonlinear time-domain step: `A ← A exp(i γ |A|² Δz)`.
- Power attenuation: `P(z) = P(0) exp(−α z)`, with `α = ln(10) lossDbPerM / 10`.
- `γ = (2π/λ) n₂ / Aeff`. Argon n₂ is approximated as `1.01e−23 m²/W`
  at one atmosphere, proportional to pressure.

The FFT forward convention is `exp(−i Ωt)` and the carrier convention is
`E = A exp(−i ω₀t)`. Thus physical frequency is `ω₀ − Ω`. Spectrum export
includes the frequency-to-wavelength density Jacobian, and uses the existing
sampled-spectrum abstraction so ordinary spectrometers see the actual shape.
The compressor applies additional quadratic spectral phase to this field;
it cannot reset the pulse to the source's transform-limited width.

Argon refractivity uses Peck–Fisher, density-scaled from standard conditions to
20 °C. Analytic wavelength derivatives supply gas GVD and group index. The
smooth fundamental-mode capillary approximation adds
`β₂,wg = −u₁₁² λ³ / (8π³ c² a²)`, with `u₁₁ = 2.4048255577`.
At 800 nm, 250 µm diameter and 2 bar the components are approximately
+36.87 fs²/m from argon and −8.50 fs²/m from guidance, totaling +28.37 fs²/m.
Loss is user-specified rather than derived from the walls or bends.

Only one intact Gaussian transform-limited source train, optionally with
upstream GDD and wavelength-independent attenuation, can initialize this
model. Captured ray powers are summed before deriving energy; changing between
a line and a sized beam cannot change nonlinear strength when capture is equal.
Overlapping independent sources, pre-filtered spectra, and a second nonlinear
fiber acting on an already sampled envelope are rejected explicitly. Filtering
or wavelength conversion after the fiber invalidates temporal-field readouts;
the ray/spectral calculation still continues where supported.

The model excludes higher-order dispersion, wall resonances, multiple spatial
modes, self-steepening, ionization/plasma, Raman response, nonlinear coupling
between sources, coupling optics outside the capillary and pressure gradients.
It is not an anti-resonant-fiber design solver, supercontinuum/UV source model,
or a calibrated compressor prescription. Gaussian autocorrelation
approximations and generic beam-probe durations are suppressed for sampled
fields rather than reporting an invented Gaussian pulse.

## Numerical limits and validation

The default grid has 1024 time samples and a 24-input-duration window, expanded
for linear stretching. Propagation uses at least 32 steps, increasing to keep
the estimated nonlinear phase increment below about 1/32 rad. An LRU cache
avoids solving again on unchanged animation frames.

Supported input durations are 15–500 fs, center wavelengths 500–1800 nm and
lengths up to 10 m. The solver declines estimated nonlinear phase above 12 rad,
linear stretch above 6×, spectra touching grid boundaries or leaving the
argon-fit range, excessive fractional bandwidth, and significant temporal
energy at the window edges. The tracer also declines peak intensities above
5×10¹³ W/cm². These are **model validity limits, not laboratory safety or
ionization thresholds**.

What happens outside them, by case:

- **No coupled pulse energy:** the fiber stays dark.
- **Solver refusal, or a pulse it cannot take** (not one intact
  transform-limited Gaussian train, unknown energy, reshaped spectrum, two
  sources in one end): the light continues with argon's *linear* β₂ and group
  index, any earlier field is cleared, and the ray carries “Linear-only
  approximation; nonlinear output unavailable” to every downstream readout,
  through compressors, filters and further fibers. Self-phase modulation
  changes the spectrum, so the carried input spectrum is not a computed output
  spectrum. The detector inspectors show a *Caveat* row, and the detector
  screens an amber strip in every view, Spectrum included. No duration is
  predicted: the analytic model of #148 declines any pulse with a field issue.
- **Outside 468–2059 nm:** there are no argon coefficients, so none are
  claimed: geometric continuation with its own caveat, group index 1 for
  timing, and no fiber GDD.
- **Kerr off** is not a refusal: the solver propagates the field with γ = 0,
  and the inspector says “Kerr off: linear propagation within the β₂ model”
  (within that model, not physically exact: the grid is finite and higher
  orders are omitted).
- **A chained capillary** never rebuilds a field from light that is already
  unavailable upstream: after a refused or out-of-range capillary the next
  one refuses too, Kerr on or off, and keeps the upstream reason and caveat.

Extreme downstream GDD that exceeds the time window makes the duration
unavailable at that detector; the Gaussian model is never asked to stand in
for a field that failed.

`test/hollow-core.test.js` checks FFT inversion/Parseval conservation, analytic
Gaussian broadening, dB energy loss, the analytic pure-SPM RMS bandwidth law,
1024/2048-sample and 64/128-step convergence, captured-power invariance,
polarizer attenuation, the native example's two measurement paths, local
packet duration after compression, save/reload, controls, inspector commits,
invalid spectral states and a 36-case pressure/core/energy sweep. Ordinary
fiber regression tests remain in `test/fiber-dispersion.test.js`.

**Browser QA** (local server, 1440×900 and 1024×768): the example loads and
reads 102 fs before and 45.3 fs after the compressor. Selecting the cable shows
the computed envelope (30.00 µJ, β₂ 28.37 fs²/m, 2.16 rad, 102.3 fs), with the
argon controls replacing group index and typed β₂. Setting 10 bar and a 50 µm
core switches the panel to *linear-only approximation*; the beam still reaches
both detectors; both screens show *UNAVAILABLE* and the linear-only strip, in
the Spectrum view too; and the detector inspector shows the *Caveat* row.
Returning to 2 bar / 250 µm restores 102 / 45.3 fs exactly. Kerr off reads
“linear propagation within the β₂ model”, 100 / 101 fs. 10 bar at 250 µm stays valid and
compresses to 21.3 fs. A reload restores the refused state with its labels.
At 1024 px there is no horizontal overflow and the inspector fits. The console
shows no errors throughout.

## Sources

- [Peck and Fisher, Dispersion of argon (1964)](https://doi.org/10.1364/JOSA.54.001362),
  refractivity formula [transcribed in the optical-constants database](https://refractiveindex.info/?shelf=main&book=Ar&page=Peck-0C).
- [Zahedpour, Wahlstrand and Milchberg (2015), Table 1](https://arxiv.org/pdf/1509.02232):
  argon Kerr coefficient and its weak near-infrared dispersion.
- [Grigorova et al., Dispersion-tuning of nonlinear optical pulse dynamics in gas-filled hollow capillary fibers](https://arxiv.org/html/2302.01113v2),
  Eq. 1: gas and waveguide dispersion contributions; experiments illustrate
  nonlinear processes beyond the bounded model implemented here.
