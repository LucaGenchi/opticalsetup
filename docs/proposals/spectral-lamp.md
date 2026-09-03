# Proposal: gas-discharge and spectral lamps

Status: **design, not implemented.** Opened for review before any code.

## What is being asked for

The point source can be monochromatic or broadband with a user-set width. Real
incoherent sources are neither: a gas-discharge lamp emits a *line spectrum*,
and that is the whole reason such lamps exist.

## Recommendation: a new `lamp` element, not another point-source mode

The point source is already carrying two jobs — a near-field emitter for
fiber/objective coupling demos, and a general diagram source — and its
evanescent behaviour is tied to the first. A lamp is a different object: it has
a fixed spectrum you pick rather than a wavelength you type, it is an extended
source rather than a point, and its line structure is the entire point of it.
Folding a line-spectrum picker into the point source would make one element
answer to three different mental models.

Against that: a new element is another palette entry, and the point source
already aliases "lamp" in search.

## The spectra

Standard spectral lines, from the RP Photonics table. These are the lines the
app should ship, because they are the ones a real calibration lamp is bought
for:

| Wavelength | Designation | Element |
|---|---|---|
| 365.0146 nm | i | mercury |
| 404.6561 nm | h | mercury |
| 435.8343 nm | g | mercury |
| 479.9914 nm | F' | cadmium |
| 486.1327 nm | F | hydrogen |
| 546.074 nm | e | mercury |
| 587.5618 nm | d | helium |
| 589.2938 nm | D | sodium |
| 643.8469 nm | C' | cadmium |
| 656.2725 nm | C | hydrogen |
| 706.5188 nm | r | helium |
| 852.11 nm | s | cesium |
| 1013.98 nm | t | mercury |

Proposed presets: **Mercury (Hg)**, **Sodium (Na)**, **Cadmium (Cd)**,
**Helium (He)**, **Hydrogen (H)**, **Neon (Ne)**, **Xenon (Xe)**, plus
**Deuterium** for the UV continuum.

## Physics worth getting right

- **Low pressure is the point.** These are low-pressure glow discharges
  specifically so that pressure broadening does not smear the lines. Lines are
  quasi-monochromatic, defined to a small fraction of a nanometre.
- **Coherence length is often well below 1 cm**, and spatial coherence is low.
  This is the honest way to distinguish a lamp from a laser in this app, and it
  maps directly onto the existing `coherenceLengthMm` parameter: set it short
  and interference washes out on any real path difference, which is exactly
  what happens on a bench.
- **Relative line intensities are not a fixed property.** RP is explicit that
  they are usually unspecified and vary with drive current and lamp age. The
  model should either weight lines equally and say so, or ship one nominal set
  and label it nominal. Inventing precise branching ratios would be a
  fabricated measurement.

## Open questions for review

1. **New element or point-source mode?** Recommendation above is a new element;
   the counter-argument is palette weight.
2. **Do lines get relative weights at all**, given the source says they are not
   a specified property? Equal weights are defensible and honest; a nominal set
   looks better on a spectrometer.
3. **Should the lamp be extended rather than a point?** Real lamps have a
   discharge volume of some millimetres, which is why they couple so poorly
   into fibers. An extended source is more faithful but interacts with the
   evanescent-capture model.
4. **Deuterium and xenon are continua, not lines.** Do they belong in the same
   element, or is that a second "continuum lamp" preset family?
5. **How should the spectrometer's 0.1 nm keying treat lines 1.7 nm apart**
   (He 587.56 / Na 589.29)? They resolve, but the sodium D doublet itself
   (589.0 / 589.6) would not.

## Sources

- R. Paschotta, "Spectral Lamps", RP Photonics Encyclopedia (doi:10.61835/zgq)
- R. Paschotta, "Gas Discharge Lamps", RP Photonics Encyclopedia
