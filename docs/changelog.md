# Changelog

What changed on the live site, newest first. Each entry links the pull
request that carries the full reasoning and the exact diff.

This file starts in September 2026. For anything before that, the pull
request history is the record.

## 2026-09-03 — Autocorrelator, cross-correlation, and finding time zero

[#90](https://github.com/LucaGenchi/opticalsetup/pull/90)

The autocorrelator gained a wiki page, a second measurement mode, and a
scope-style display for the one job an autocorrelator cannot do alone.

- **The wiki page.** Intensity and interferometric geometries, scanning versus
  single-shot, two-photon detectors, high dynamic range and third-order
  variants, and where FROG and SPIDER take over. Two sections answer specific
  questions: why the trace is wider than the pulse, and how a cross-correlator
  finds time zero — worked through for coherent Raman, including the two things
  that make it more than alignment. The overlap that matters is at the
  objective focus, not on the bench; and under spectral focusing the delay
  tunes the Raman shift, so time zero sets the origin of the spectroscopic
  axis.
- **Why "wider" needed care.** The exact universal statement is about second
  moments — self-correlation doubles the variance, so the rms width grows by
  √2 for any envelope — while the FWHM ratio everyone quotes is shape-dependent.
  A rectangular pulse gives a ratio of exactly 1, which is in the page as the
  counterexample that makes the point.
- **Cross-correlation mode.** No new tracing was needed: the arriving light was
  already grouped per source with its own arrival, duration and dispersion. The
  mode reports the timing mismatch, the overlap, and the sum-frequency
  wavelength; refuses trains whose repetition rates differ, since without a
  fixed phase there is nothing stable to average; and measures against the
  nearest pulse of the other train, because arms can only ever be nulled modulo
  the repetition period.
- **A scope, not a plot.** The display is a laboratory arrival-time axis: two
  pulses at their own arrival times, sliding together as an arm is tuned, with
  the sum-frequency peak lighting up between them at the crossing. The axis
  changes meaning between the two modes — scan delay for an autocorrelation,
  arrival time for a cross-correlation — and says which it is showing.
- **The timebase is a knob.** ±0.5, ±1, ±5, ±10 or ±25 ps, in both modes, and
  it holds still. A window that re-ranged itself would rescale the axis under
  the pulses exactly as they approached, so they would never appear to travel —
  and it would draw every duration at the same apparent width, so the three
  traces of the chirping example would look identical and only their labels
  would differ. Switching mode picks a framing once (a 3 ps mismatch selects
  ±5 ps); after that it is yours.
- **Five bugs fixed on the way.** The sech² curve scaled its argument twice
  over and fell to half maximum at a quarter of its own trace width, missing
  the chord drawn across it. The inspector crashed outright in cross mode — a
  one-argument call into a two-argument body. The sum-frequency colour was read
  from source metadata, which survives wavelength conversion, so a doubled beam
  named the emitter's colour instead of the arriving one. The sech²
  cross-correlation broke the short-reference limit by 9%, the same figure the
  component exists to teach. And the delay line stepped in 100 nm, finer than a
  real stage resolves; it is 1 µm now.
- **Two benches**, both on the wiki page: one autocorrelator on a
  transform-limited 150 fs pulse, and a two-colour cross-correlator whose delay
  line sweeps through time zero and back every ten seconds.

Seven review findings from @bertona88's Codex, each verified against the
tracer or against numerics before being acted on.

## 2026-09-01 — Acousto-optic deflector

[#86](https://github.com/LucaGenchi/opticalsetup/pull/86) — by @bertona88, with review fixes

A new AOD element under a shared Acousto-optic palette section, steering a
beam by diffraction from a travelling acoustic grating instead of a moving
mirror.

- **Steered by angle, not by RF.** Since θ = λf/v is linear in the drive
  frequency, a scan linear in frequency is linear in angle — so the centre
  deflection and total scan angle are the controls, and the RF centre and
  bandwidth the element originally asked for are gone. What that gives up is
  the optical frequency shift, which at 7.6×10⁻⁵ nm for 80 MHz at 532 nm is
  a thousand times finer than anything here resolves.
- **Random-step addressing**, alongside static, triangle and sawtooth: the
  mode a deflector is actually chosen for, jumping to any angle as fast as to
  its neighbour.
- **Real numbers.** Defaults are a TeO₂ slow-shear device at 532 nm — 4° of
  centre deflection, 2° of sweep — and the scan rate is bounded by the time
  sound takes to cross the aperture, reported in the inspector.
- **Three review fixes:** the scan never animated the beam, a broadband beam
  came out as invented laser lines, and ungrouped palette items were filed
  under "Other".

## 2026-09-01 — Spectrometer and AOTF

[#87](https://github.com/LucaGenchi/opticalsetup/pull/87)

The spectrometer read several narrow lines as one smeared rainbow, and the
AOTF that produced them passed a rectangle. Both fixed, along with the plot
window they share.

- **Disjoint bands stay apart.** Every spectral component from one source
  was resampled onto a single grid spanning all of them, so three 2 nm AOTF
  lines came back reported as 8.19 nm wide each — the grid spacing, not a
  measurement — and the empty stretches between them were drawn as spectrum.
  Components are now clustered by connected support, one grid and one drawn
  curve each.
- **The plot window is sized from the measurement.** It was a centroid plus
  a nominal width, which is meaningless when light arrives in several bands
  and ran nearly twice as wide as the light it contained. It now spans
  exactly what clears a thousandth of each feature's own peak.
- **The AOTF passband is a sinc².** The phase-matching response of the real
  acousto-optic interaction: a central lobe of the configured full width at
  half maximum, true zeros either side, and sidelobes at 4.7% and 1.7% that
  are the device's actual rejection floor.
- **The passband belongs to the device**, not to each RF tone, matching a
  real crystal where resolution follows from the interaction length. Older
  sketches migrate from both previous formats.
- **Sixteen channels**, up from eight.

## Earlier

See the [pull request history](https://github.com/LucaGenchi/opticalsetup/pulls?q=is%3Apr+is%3Amerged).
