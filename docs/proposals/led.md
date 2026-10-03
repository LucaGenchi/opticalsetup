# Proposal: LED source with an integrated collimator

Status: **implemented** as the `ledsource` element (label “LED”), in the same
pull request as this note. Where the note and the code disagree, the code and
its wiki page are right.

## What is being asked for

An LED element with a realistic spectrum and a built-in collimator, distinct
from the laser sources in that it is *not coherent*: it never interferes.

## Recommendation: a new LED element

Unlike the lamp question, this one is clear-cut. An LED is not a line source
and not a laser: it is a broad, smooth, single-peaked emitter with a spectral
width of tens of nanometres, and the white variety has a two-band shape no
existing element can express. It also comes with its own optics — almost every
LED a lab uses is packaged behind a lens or reflector — which is exactly the
integrated collimator being asked for.

## The spectra

Single-colour LEDs are near-Gaussian in wavelength. Typical emission bands by
material (RP Photonics):

| Material | Emission |
|---|---|
| InGaN / GaN, ZnS | 450–530 nm (blue — green) |
| GaP:N | 565 nm (green) |
| AlInGaP | 590–620 nm (orange) |
| GaAsP, GaAsP:N | 610–650 nm (orange — red) |
| InGaP | 660–680 nm (red) |
| AlGaAs, GaAs | 680–860 nm (red — near IR) |
| InGaAsP | 1000–1700 nm (infrared) |

Spectral width runs from tens of nanometres up to well over 100 nm depending on
type, against a laser diode's fraction of a nanometre.

**White is the interesting case and must not be modelled as one broad hump.**
A white LED is a blue chip exciting a phosphor: Ce³⁺:YAG converts blue around
440–460 nm into yellow around 520–640 nm. The spectrum is therefore
*bimodal* — a narrow residual blue pump peak plus a broad phosphor band — and
that shape is why white LEDs render colour the way they do. Modelling it as a
single wide Gaussian would lose the one feature worth showing.

Presets: **White (phosphor)**, **Blue (460 nm)**, **Green (530 nm)**,
**Amber (590 nm)**, **Red (630 nm)**, **Deep red (660 nm)**, **NIR (850 nm)**,
each with a preset centre and width, plus a custom mode. The presets are
**illustrative** — typical shapes, not any manufacturer's datasheet — and the
inspector and wiki say so.

The white preset is two bands, never one hump: a narrow blue peak (450 nm,
22 nm wide) and a broad phosphor band (580 nm, 150 nm wide), carried as one
sampled spectrum with both parts in it. Filters, dichroics and the
spectrometer integrate against that shape, so a long-pass filter at 500 nm
removes the blue peak and leaves the phosphor band.

## The LED is an incoherent source

Decision (Luca): **the LED is incoherent, and the app does not give it
coherence.** It has no coherence-length parameter, it never receives a
coherence identity, and wherever two of its beams meet, a detector adds their
powers. No interferometer in the app shows fringes with an LED, by design.

This needs no new machinery and no setting. The tracer already gives a
coherence identity only to a sized, monochromatic CW laser; every other
source is power-only. The LED is simply one more source outside that rule. An
earlier draft of this note presented `coherenceLengthMm` as the mechanism;
that was wrong — on an LED the parameter would have been inert — and it is
removed rather than wired up.

## The collimator

The collimator is part of the element: the LED **comes out collimated**, as a
beam of the width set in the inspector.

The output is made of **ordinary propagating rays**, like a laser's: they
travel until something stops them. The LED does not use the point source's
short-range rays. That range is a display and capture convention — it keeps
360° emission from flooding the canvas and decides which optics collect it —
not near-field physics, and a beam that already leaves through a collimator
has no need of it. PR #191 documents the same distinction for the point
source.

Stated limit: a real die has a size, so a real collimator leaves a residual
divergence of about die size over focal length (a 1 mm die behind a 20 mm
lens: 1/20 = 50 mrad, about 2.9°, full angle). The element does not model
it; its beam is perfectly parallel, and the wiki page says so.

## A separate element, not a mode of Point source

The Point source already has two modes (point emitter, gas discharge lamp).
The lamp became a mode because it is geometrically the same thing: an
isotropic emitter, collected the same way. A packaged LED is not: it is a
directional beam of a set width. It is therefore its own element in Sources.
A bare LED die without optics remains what it is today — a Point source in
broadband mode — so a search for "led" finds both.

Persisted parameters, each clamped at the schema boundary:

| Key | Meaning |
|---|---|
| `ledPreset` | one of the presets above, or `custom` |
| `wavelength`, `bandwidth` | centre and width in nm, used when `custom` (width 5–200 nm) |
| `avgPowerW` | average power in watts, as on the other sources |
| `beamMode`, `beamWidth` | simple line or sized beam, and its width in mm |
| `autoColor`, `color` | beam colour from the spectrum, or a fixed one |

Saved setups: `ledsource` is a new element type, so no existing scene
changes meaning and no conversion is needed. The type is deliberately not
named `led`: sketches from before launch used that name for a different
element, and they keep failing to open as an unknown type rather than
opening as this one. A scene that uses `ledsource` opens only in versions
that have the element.

## Sources

- R. Paschotta, "Light-emitting Diodes", RP Photonics Encyclopedia
