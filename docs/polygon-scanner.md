# Polygon scanner and line-scanning example

Find **Polygon scanner** in the Mirrors palette (search also accepts polygon
mirror, line scanner, NST, or SCANLAB). Open **Examples → Scanning → Polygon
scanner — line scanning** for a native, editable scene. The palette's Demo
action also supplies a compact scanner/lens/screen arrangement.

## Source and scope

Source: user-supplied **Polygon Scanner Systems**, Next Scan Technology / SCANLAB,
January 2018, `Polygon Scanner Systems_NST-SCANLAB_0.pdf`, two pages. Both pages
were rendered and inspected. Specifications below describe that supplied edition,
not a claim about current products.

| Evidence | Location | Treatment here |
| --- | --- | --- |
| Rotating polygon makes fast scan lines; an external perpendicular feed axis extends processing to an area | p. 1, diagram and High Throughput Raster Processing | Actual rotating-facet ray tracing; this 2D section shows one scan line. Perpendicular feed is out of plane and is not simulated. |
| LSE uses integrated telecentric mirrors | p. 2, Full Telecentric Optics | Not reconstructed: no mirror prescriptions are supplied. The example uses an explicitly illustrative thin lens. |
| LSE170 STD: 100–400 lines/s, 71% duty, 6 mm input beam (1/e²), 10 mm clear input aperture, 170 mm scan width | p. 2, specifications table | 200 lines/s and a 6 mm geometric beam. The **71% duty is not carried over**: it is a specification for the complete head with its integrated telecentric mirror optics, and the sheet does not give the internal fold, wheel prescription or blanking phase needed to reproduce it. The window here is 56%, a conservative centred blanking window for this illustrative geometry (see below). Note also that the sheet's 6 mm is a Gaussian 1/e² diameter, which is not the same clipping criterion as a hard-edged 6 mm geometric beam. The beam uses native uniform ray sampling, not a Gaussian 1/e² profile. The 170 mm field and 10 mm head aperture are not imposed. |
| LSE170 HNA: 100–400 lines/s, 8 mm beam, 170 mm scan width; LSE300 STD: 56–224 lines/s, 11 mm beam, 300 mm scan width | p. 2, specifications table | Reference only; no product presets that imply matching a complete scan head. |
| 25–100 m/s moving spot speed; system efficiency >85% green/IR and >70% UV | p. 2, specifications table | Not claimed for this layout. Individual facet reflectivity is distinct from whole-head efficiency. |
| LSE170 STD minimum green spot diameter 22 µm under the sheet's conditions | p. 2, spot table and footnote 1 | Not calculated: an ideal ray crossing is not a diffraction-limited spot size prediction. |
| TrueRaster uses correction actuators; repeatability claims require SuperSync, and accuracy requires specified calibration | pp. 1–2, diagram, text, footnotes 2–3 | Not modeled. No timing-jitter, calibration, or proprietary correction claims. |

**Free interpretation — not specified in the datasheet:** 12 facets, 1,000 RPM,
100 mm wheel diameter, the 56% scan window, 98% facet reflectivity, wheel
orientation, all bench positions, a 100 mm focal-length / 100 mm diameter ideal lens, detector dimensions,
and the 532 nm / 300 fs / 1 MHz / 1 W illustrative source. The wavelength falls
within the sheet's green band. The source's pulse bandwidth is transform limited.
Pulse dynamics are hidden initially so the geometric sweep remains readable.

## What is computed

The component is a regular polygon centered on its rotation axis. Its drawn
edges and traced mirror segments come from the same vertices. Each facet reflects
the incident ray by the specular law. A small mechanical facet-angle change
therefore changes outgoing direction by twice that angle. Finite facets naturally
clip or redirect parts of a wide incident beam near a transition.

Facet rate is `facets × RPM / 60`. Phase is a percentage of one facet period;
50% places a left-facing facet at its central orientation before the element's
overall rotation. At the example's 315° orientation the incident beam turns
downward. Aim at the perimeter; the element's placement anchor is the hub.

The centered usable scan window is an **ideal synchronized blanker**. Outside
it, incident rays terminate at the wheel and its hub turns amber. Inside it,
the hub is green. This is a functional exposure-window illustration, not a model
of how the commercial laser/controller implements blanking. Coating loss is
absorbed by the opaque wheel, with no transmitted internal ghost rays.

**The window is not derived from the beam, and has to be chosen to suit it.**
It is a fraction of the facet period centred on the facet's own mid-rotation,
and the component has no knowledge of what is illuminating it. The geometry
does: over one period a facet travels its whole chord through the beam, so a
beam occupying a fraction *f* of the facet width is on a single facet for only
about 1 − *f* of the period, and near a transition it lands on two facets at
once and leaves in two directions a full facet step apart. That split is real
scanner behaviour — it is why blanking exists — but a window left wider than
the geometry supports displays it while the hub still reads open.

Oblique incidence makes this tighter and asymmetric: the footprint on the facet
is the beam width divided by the cosine of the incidence angle, and as the wheel
turns that angle grows on one side of the sweep and shrinks on the other. In
this example, 45° at mid-facet becomes 60° at one end — doubling the footprint
there — which is why the clean window runs 21.6% to 90.1% rather than sitting
symmetrically about 50%. That interval is 68.5% wide, but its centre is at 55.9%,
and a window pinned to the middle of the facet can only use the symmetric part of
it: 2 × min(50 − 21.6, 90.1 − 50) ≈ 56.8%, so the example's 56% keeps a little
margin. Part of the apparent duty loss is therefore the cost of fixing the
blanking centre rather than unusable facet area, and an independently adjustable
blanking phase would recover some of it without a larger wheel. Enlarging the
wheel widens the clean window but does not centre it; the asymmetry is a property
of the fold angle, not of the wheel size. The inspector's **facet
width** readout gives the chord to compare a beam against.

Static mode freezes the selected phase. Zero RPM also stops motion. Facet counts
round to integers and geometry, rate, phase, duty, and reflectivity are bounded;
malformed/non-finite inputs fall back safely. Saved sketches remain version 1.

Animation uses the existing shared simulation clock where the sweep is watchable;
otherwise it shows one facet every 12 display seconds, as in Mechanics mode.
Animated exports follow the same rule. Slowed preview timing cannot establish
physical pulse-to-position synchronization. The lens uses the app's existing
paraxial model and is neither an f-theta nor a telecentric scan lens.

## Controls to try

1. Select Static phase and set phase to 25%, 50%, then 75%. The focus crosses
   the detector monotonically, moving roughly 26 mm each side of center.
2. Set phase to 95% with the 56% window. The input reaches the amber wheel,
   but no outgoing ray or detector signal remains. Widen the window past 56%
   and step the phase to 16%: the hub stays green while the beam splits across
   two facets and half of it leaves 60° away, off the frame. That is the
   transition the window exists to gate.
3. Set facet reflectivity from 100% to 50% at the central phase. The collected
   signal halves without a spurious transmitted beam. At 0%, the wheel absorbs.
4. In Continuous rotation, change RPM from 1,000 to 2,000: the rate readout changes
   from 200 to 400 lines/s. Set RPM to zero to stop. Mechanics playback deliberately
   normalizes the visible cycle length; use the readout for the physical rate.

The Photodetector reports normalized ray signal. Source power is a separate
native power-attribution quantity; setting source power to zero does not disable
the geometric ray display in the current app. No material removal, curing,
diffraction spot, bitmap exposure pattern, perpendicular raster feed, or calibrated
throughput is inferred from this example.

## Verification

- Deterministic tests cover rate/phase, stationary rotation, closed facets,
  blanking, unsafe inputs, twice-angle reflection, moving detector focus,
  opaque losses, reflectivity, save/reload, and exported animation.
- Full regression suite: `npm test` (797 tests at implementation).
- `node tools/build-examples.mjs`, syntax checks for every `sketch/js/*.js`
  and `serve.mjs`, and `git diff --check`.
- Native SVG exports at central, off-center, and blanked phases were rendered
  for visual inspection. These are exports from the actual scene, not screenshots.
- Desktop / 1024 px browser interaction and console checks could not run:
  the supervised browser preview service was unavailable in this environment.
  Reproduce with `node serve.mjs`, open `/sketch/`, load the example, and check
  palette search, inspector edits, motion/pause/reset, Save/Open, and responsive
  layout at both widths.

![Native scene at central phase](polygon-scanner/center.png)

![Native scene at 25% phase](polygon-scanner/scan.png)

![Native scene with blanking at 95% phase](polygon-scanner/blanked.png)
