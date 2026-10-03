# Changelog

What changed on the live site, newest first. Each entry links the pull
request that carries the full reasoning and the exact diff.

This file starts in September 2026. For anything before that, the pull
request history is the record.

## 2026-09-03 — Gas discharge lamps, and mirrors that behave like mirrors

[#94](https://github.com/LucaGenchi/opticalsetup/pull/94) ·
[#95](https://github.com/LucaGenchi/opticalsetup/pull/95)

Two rounds of work on sources and the mirrors that collect them, both starting
from setups that did not do what the physics says they should.

- **A point source's light passed straight through any mirror.** Its rays are
  flagged evanescent so uncollected isotropic emission fades in the near field,
  but only lenses, metalenses and fiber tips were allowed to collect them. A
  parabola with an emitter at its focus is how you collimate a lamp without
  chromatic aberration, so mirrors — curved ones included — now collect too.

- **The parabolic mirror did not collimate.** It was built from flat facets and
  those facets both located a ray *and* reflected it, so every ray left by the
  angle between chord and curve. Facets now locate the hit and the curve
  supplies the normal, with the ray–parabola intersection solved analytically.
  A source at the focus leaves exactly parallel at any allowed aperture.

- **The spherical mirrors could not aberrate.** Concave and convex were a flat
  chord with an ideal paraxial bend, so a point source at the focus came out
  perfectly collimated — which removed the entire reason parabolic mirrors
  exist. Both are now real spheres of radius 2f, traced as analytic arcs and
  reflected off their own normals. Same source, same focus, 100 mm aperture:

      parabola    98 mm at 400 mm ->  98 mm at 1200 mm    collimated
      sphere     468 mm           -> 792 mm               11.4 deg

  and it scales as it should: f/3.9 gives 0.07 deg, f/0.5 gives 5.7.

- **Gas discharge lamps**, as a mode of the point source rather than a new
  element — a lamp is a point source geometrically and differs only in
  emitting a fixed set of lines. Eight presets (Hg, Na, Cd, He, H, Ne, Cs, Ar)
  with the standard lines each is bought for, drawn as a pen-ray tube tinted
  by its own lines. The lines are carried as lines, so a grating fans exactly
  the wavelengths present and the spectrometer draws them as separate peaks.

  Line *strengths* are deliberately nominal. Both cited sources say why: the
  ratios depend on excitation and drift with drive current and lamp age, and
  the standard tabulations warn that their intensities need not match the lamp
  in front of you. Wavelengths are data; intensities are an illustration.

- **The point source gained a wiki page**, which it had never had, and the
  three mirror pages were rewritten — they had said the surface was a flat
  line, the curvature cosmetic, and spherical aberration impossible.

Thirteen review findings from @bertona88's Codex across the two branches, each
verified against the tracer before being acted on. Several were mistakes of
mine caught before merge, including a partial mirror that leaked most of its
power as ordinary light and a collection marker that outlived the interaction
that set it.

## 2026-09-03 — Sketch toolbar, collapsed library, copy and paste

[#92](https://github.com/LucaGenchi/opticalsetup/pull/92)

Interface work on the canvas, none of it changing what the tracer does.

- **Wiki, Examples and Community are links, not dropdowns.** They sit on the
  right of the toolbar exactly as they do on the landing page, and open in a
  new tab — so the destination is the browsable index with every entry and its
  description, rather than a list of filenames with nowhere to read about them.
  Loading a setup into the canvas still happens from those pages, which is
  where the explanation lives.
- **File actions moved left**, off the wordmark and into the space the
  dropdowns had been using.
- **The component library opens collapsed.** Three categories used to start
  open, which pushed the other fourteen below the fold: the first thing a new
  sketch showed was a scroll bar rather than the shape of the library. All
  seventeen now fit on one screen.
- **A tighter starter scene.** The three sources sit 50 mm apart instead of
  110, and the prompt reads "choose a source and add components from the
  library" — naming where the components come from, now that the library is
  the first thing on screen. The pulsed source opens at 920 nm, so its beam
  reads visibly different from the 532 nm one above it.
- **Copy and paste**, ⌘C/⌘V or Ctrl+C/Ctrl+V, alongside the duplicate shortcut
  that was already there. Successive pastes cascade instead of stacking.
  Singletons are refused, and a detector screen pasted together with its
  detector is relinked to the copy — without that it would keep reading the
  original, which looks like a working paste right up until the two readings
  disagree.

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
