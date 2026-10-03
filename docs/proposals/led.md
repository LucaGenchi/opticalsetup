# Proposal: LED source with an integrated collimator

Status: **design, not implemented.** Opened for review before any code.

## What is being asked for

An LED element with a realistic spectrum and a built-in collimator, distinct
from the laser sources in that it is *not coherent*: it never interferes.

## Recommendation: a new `led` element

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

Proposed presets: **Blue (460 nm)**, **Green (530 nm)**, **Amber (590 nm)**,
**Red (630 nm)**, **Deep red (660 nm)**, **NIR (850 nm)**, **White (phosphor)**,
each with a preset centre and width, plus a custom mode. The presets are
**illustrative** — typical shapes, not any manufacturer's datasheet — and the
inspector and wiki say so.

The white preset is two components, never one hump: a narrow blue peak
(about 450 nm, 20 nm wide) and a broad phosphor band (about 560 nm, 120 nm
wide), each traced with its own share of the power, so a filter or dichroic
can remove one and leave the other.

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

Stated as model scope, so the wiki can say it plainly: a real LED's
coherence length is a few micrometres (about 4.5 µm for a 30 nm band at
550 nm, taking the coherence length as the full width at half maximum of the
visibility envelope, the convention `fringeVisibility` uses). Low-coherence
interferometry works inside that window of path *difference*. The app does
not model it for the LED: the element is for illumination, and it reads as
incoherent everywhere.

## The collimator

An LED die is an extended Lambertian emitter, so a real collimator never
produces a truly parallel beam — residual divergence is set by the die size
over the collimator focal length. Proposed: a **beam divergence** parameter,
defined as the **full angle**, with a realistic floor rather than a
perfect-collimation option, so the element cannot claim something no LED
does. A 1 mm die behind a 20 mm lens gives 1/20 = 50 mrad, about 2.9°, full
angle.

The collimated output is made of **ordinary propagating rays**, like a
laser's: they travel until something stops them. The LED does not use the
point source's short-range rays. That range is a display and capture
convention — it keeps 360° emission from flooding the canvas and decides
which optics collect it — not near-field physics, and a beam that already
leaves through a collimator has no need of it. PR #191 documents the same
distinction for the point source.

## A separate element, not a mode of Point source

The Point source already has two modes (point emitter, gas discharge lamp)
and answers a search for "led". The lamp became a mode because it is
geometrically the same thing: an isotropic emitter, collected the same way.
A packaged LED is not: it is a directional beam of a set width and
divergence. It is therefore proposed as its own `led` element in Sources,
and the "led" search alias moves from Point source to it. A bare LED die
without optics remains what it is today: a Point source in broadband mode.

Persisted parameters, each clamped at the schema boundary:

| Key | Meaning |
|---|---|
| `ledPreset` | one of the presets above, or `custom` |
| `wavelength`, `bandwidth` | centre and width in nm, used when `custom` |
| `beamWidth` | beam diameter at the collimator, mm |
| `divergenceDeg` | full divergence angle, degrees, with the floor |
| `avgPowerW` | optional average power in watts, as on the other sources |

Saved setups: `led` is a new element type, so no existing scene changes
meaning, no conversion is needed, and no type named `led` was ever saved by
an earlier version. A scene that uses it opens only in versions that have
the element.

## Open questions for review

1. **Is the two-band white spectrum worth the complexity**, or is a single
   broad band enough for this app's purposes? This note proposes two bands.
2. **Should the collimator be integrated or a separate element?** This note
   proposes integrated, as LEDs are sold; a bare die is the Point source.
3. **Divergence floor**: enforce one, or allow perfect collimation and note
   the limitation in the wiki? This note proposes a floor.

## Sources

- R. Paschotta, "Light-emitting Diodes", RP Photonics Encyclopedia
