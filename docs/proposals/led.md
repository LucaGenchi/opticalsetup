# Proposal: LED source with an integrated collimator

Status: **design, not implemented.** Opened for review before any code.

## What is being asked for

An LED element with a realistic spectrum and a built-in collimator, distinct
from the laser sources in that it is *not coherent*.

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
each with a preset centre and width, plus a custom mode.

## Incoherence is the point

The app already distinguishes coherent and incoherent light through
`coherenceLengthMm`. An LED's coherence length is of order a few micrometres —
the transform limit of a 30 nm band at 550 nm is around 10 µm. Setting that
honestly means an LED simply cannot produce interference fringes on any path
difference a bench can build, which is the correct and instructive behaviour,
and it comes free from machinery that already exists.

## The collimator

An LED die is an extended Lambertian emitter, so a real collimator never
produces a truly parallel beam — residual divergence is set by the die size
over the collimator focal length. Proposed: a **beam divergence** parameter
with a realistic floor rather than a perfect-collimation option, so the element
cannot claim something no LED does. A 1 mm die behind a 20 mm lens gives about
50 mrad, roughly 3°.

## Open questions for review

1. **Is the two-band white spectrum worth the complexity**, or is a single
   broad band enough for this app's purposes?
2. **Should the collimator be integrated or a separate element?** Integrated
   matches how LEDs are sold and keeps the palette smaller; separate is more
   composable and reuses the existing lens.
3. **Does the LED need the evanescent near-field model** the point source has,
   or is it a normal far-field source? It is bright and directional, so
   probably the latter — but then the two sources behave differently for
   reasons a user has to learn.
4. **Divergence floor**: enforce one, or allow perfect collimation and note
   the limitation in the wiki?

## Sources

- R. Paschotta, "Light-emitting Diodes", RP Photonics Encyclopedia
