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
  That is the honest physical distinction from a laser — but the first draft of
  this document was wrong about how it would be expressed here, and the
  correction matters enough to keep on the record.

  `coherenceLengthMm` does **not** carry it. `raytrace.js:3249` grants a
  `coherenceId` only to a sized, monochromatic, continuous-wave laser; point,
  broadband, pulsed and generated sources are all deliberately power-only. A
  lamp would therefore never interfere at all, whatever its coherence length
  is set to — not because the fringes wash out, but because no field is
  reconstructed to make them from. Setting the parameter would look like
  physics and do nothing.

  Nor is the obvious repair right. Handing one `coherenceId` to every ray of an
  extended lamp would make its spatial samples mutually phase-locked, which is
  precisely what a low-spatial-coherence source is not. Modelling this properly
  needs mutually incoherent emitter groups — one coherent identity per emitting
  point per line, summed in intensity — which is a real piece of work in the
  coherent path and not a parameter setting.

  The honest options are therefore: declare lamp interference unsupported and
  say so in the wiki, or build the incoherent-group machinery. This document
  recommends the first until someone wants the second.
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
3. **Does interference get declared unsupported, or built?** See the coherence
   note above: the parameter that looks like it would do this does not, and the
   naive fix produces a source that is spatially coherent, which is the opposite
   of a lamp.
4. **Should the lamp be extended rather than a point?** Real lamps have a
   discharge volume of some millimetres, which is why they couple so poorly
   into fibers. An extended source is more faithful but interacts with the
   evanescent-capture model.
5. **Deuterium and xenon are continua, not lines.** Do they belong in the same
   element, or is that a second "continuum lamp" preset family?
6. **Should sodium ship as the D doublet rather than as its mean?** The first
   draft claimed the doublet could not be resolved. That was wrong: `addSample`
   keys wavelengths to 0.1 nm, so 589.0 and 589.6 land six buckets apart and
   display as two lines perfectly well. What would hide the doublet is this
   document's own table, which lists only the 589.2938 nm mean — the standard
   *calibration* line, since that is what the line table is for. So the choice
   is real but it is a choice about the preset, not a limit of the spectrometer:
   ship the mean and match the calibration convention, or ship 589.0 / 589.6 and
   show the doublet that makes sodium recognisable.

## Sources

- R. Paschotta, "Spectral Lamps", RP Photonics Encyclopedia (doi:10.61835/zgq)
- R. Paschotta, "Gas Discharge Lamps", RP Photonics Encyclopedia
