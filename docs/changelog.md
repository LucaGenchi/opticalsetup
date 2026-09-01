# Changelog

What changed on the live site, newest first. Each entry links the pull
request that carries the full reasoning and the exact diff.

This file starts in September 2026. For anything before that, the pull
request history is the record.

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
