# Ouyang 2023: original-branch review

Reviewed 2026-09-13. PR #134, exact head `9cf0f93fe2a16238450ef17b9204a2352ffe24fe`; original worktree clean and unchanged. Scores apply to that original, not the shared integration's replacement DMD.

**KEEP AFTER REWORK.** This is a strong candidate for the collection's programmable multi-focus architecture: source provenance is substantial, the order/filter controls are causal, and the downstream relay is nearly conjugate. It needs a readable landscape composition, shared programmable-device behavior, explicit treatment of upstream angular dispersion and clipping, and completed browser acceptance before selection is final.

## Primary evidence and fidelity

Read the attached nine-page [article](https://doi.org/10.1038/s41467-023-37163-y), especially p. 2 and rendered Fig. 1, and downloaded/read the complete 29-page [supplement](https://media.springernature.com/original/springer-static/esm/art%3A10.1038%2Fs41467-023-37163-y/MediaObjects/41467_2023_37163_MOESM1_ESM.pdf), including rendered pp. 12 and 15. Their SHA-256 values match the branch evidence note (`6bc3f492…d35d38`, `d3a3e595…17e0`). The author is **Wenqi Ouyang**, not the note's “Z. Ouyang.”

The native writing sequence matches Fig. 1/S1: source → HWP/PBS → grating → L1/L2 → DMD → L3/Fourier filter → L4/dichroic → objective/resin. A separate 589 nm illumination path reaches the camera through the shared objective.

| Evidence | Treatment in the original |
| --- | --- |
| Article p. 2: 800 nm, 1 kHz, 100 fs, 4 W; up to 2000 independently encoded foci | Source values retained; three representative angular orders. Four watts is source output, not delivered per-focus power. |
| Supplement p. 2/S1 p. 12: 600 lines/mm; L1/L2/L3/L4/L6 = 225/250/150/200/100 mm; DLP6500; NA 1.3 oil, WD 0.24 mm | Reported hardware/topology mostly preserved. L1/L2 reversal in the later supplement subsection is correctly disclosed. |
| Supplement p. 3: compensation incidence angles are specified | The scene's 80° grating incidence is a design choice, unlike the reported 49.43°. This distinction needs an explicit label. |
| Supplement pp. 4–6: binary CGH and WGS; p. 15: fitted nonlinear order far above a simple 2PA response | Correctly excluded from the geometric model. The 1D mask is not a computed CGH, uniformity result, or polymerization model. |
| Unspecified mechanical prescription | Beam width, apertures, arrangement, DMD proxy pitch/angles, LED source substitution and 5 mm objective EFL are interpretations. EFL follows the app's 200 mm reference, not a measured prescription. |

The grating/DMD unit is intended to compensate angular dispersion; it is not temporal focusing. The original DMD only reflects and adds wavelength-independent configured angles, so it cannot cancel the grating's spectral angular spread. Neither a simulated wavefront nor compensated pulse confinement is established.

## Native geometry and controls

Used the original `parseSketch`, `traceScene`, registry, detector readout and objective functions. `node --test test/dmd-hologram.test.js test/2pp-voxel-preview.test.js test/2pp-paper-handoff.test.js`: **23/23 pass**. JSON normalization/save/reload reproduces identical complete trace output for all 23 elements. All measured control traces have finite drawable coordinates.

| Control, restored to defaults between trials | Native result |
| --- | --- |
| Default | 15 resin arrival records at y = 110.24 mm: five wavelength samples × three angular orders. The evidence addendum's nine records is stale. Central-wavelength x positions: −0.131041, −0.000088, +0.130865 mm. |
| Laser disabled / 0 W | No writing arrivals; independent camera signal stays 0.041 relative units at 589 nm. |
| 4 W → 2 W | Identical normalized arrival geometry/weights; metadata changes. This is consistent with the stated absence of a dose model. |
| Representative foci 3 → 1 | 15 → 5 records, one angular group. |
| Random-access scan 0° → +1° | All groups shift; central-wavelength central hit moves to −0.065545 mm. |
| Fourier slit 24 → 4 mm | 15 → 5 records; outer groups removed. |
| Scan +5° / HWP 45° | Finite aperture clipping leaves six spectral/order records at +5°; HWP/PBS extinction removes writing. |

The effective DMD face is local x = −9, world `(599.877658, 0.012017)`. Using its actual face, L3/L4 separation 350 mm and L4→BFP distance 200.24 mm gives

`[A,B;C,D] = [−1.333333, −0.016877 mm; 0, −0.75]`.

This small B residual is not a major pupil-walk defect, but is not exact conjugacy. The objective BFP, equivalent lens and resin are at y = 100.24, 105.24 and 110.24 mm. Nine independent monochromatic line probes spanning 2 mm of projected height on the **tilted actual face**, launched into the downstream native train at −3°, 0°, +3°, all reach the resin. Their pupil centres are 0.016907, 0.016023, 0.015138 mm; spans 2.815698, 2.666667, 2.517635 mm. Focus centres are +0.196529, 0, −0.196529 mm, with spans below `8e−15 mm`. At +5° the 24 mm Fourier slit rejects all these isolated probes. These probes isolate the relay; they do not validate DMD synthesis or upstream illumination.

Upstream illumination is a separate concern. Default native pupil readout is 22.8584 mm incident extent against a 13 mm pupil. Independent 800 nm source-height probes confirm real loss: offsets −2 and +1.5 mm reach the pupil outside its opening; several other offsets are DMD-OFF. Only three of nine sampled source heights reach the resin in this probe set. The surviving monochromatic groups are sharply intersecting, but this does not prove full-beam transmission or compensation. The default broadband arrival group has about 0.0563 mm lateral chromatic spread. The camera receives illumination, not a validated transmitted image of a patterned specimen.

## Browser evidence and remaining acceptance

The real exact-head editor was opened at **1364 × 938**. Its fitted view showed the complete bench at about 61% zoom, normal toolbar/palette/inspector placement, a nearly square 1230 × 1250 figure frame, source at the bottom, very small labels and long annotation blocks. Objective/resin labels crowd each other. Broad writing-ray fans downstream of the transmitting resin cross the lower composition and extend beyond the frame. The separate foci are too close to distinguish in this overview. The DMD glyph shows only its 1D stripe section; there is no discrete 2D hologram playback.

The 1024 px native iframe fixture was opened, but browser recovery interrupted capture. Browser control interactions, console inspection, completed narrow-view visual checks, and durable screenshot files remain **pending**. No result is claimed for those checks. The coordinator requested pausing all browser work after repeated shared recovery failures; no alternative renderer or browser mechanism was substituted.

## Scores and required rework

First six: higher is better. Final two: higher is more burden.

| Axis | 0–5 |
| --- | ---: |
| Source completeness | 5 |
| Optical-train confidence | 3 |
| Distinctiveness | 5 |
| 2D compatibility | 3 |
| Educational value | 4 |
| Visual clarity | 2 |
| Free interpretation required | 4 |
| Maintenance complexity | 4 |

Keep only after: (1) shared 2D frames/discrete playback with separately named angular-order proxy; (2) a compact landscape layout with legible limits and three visible control experiments; (3) exact optical-surface relay placement and an explicit, checked interpretation of grating incidence, beam footprint, spectral spread and finite apertures; (4) removal of misleading “hologram produces these rays” or calibrated fabrication implications; and (5) completed desktop/narrow browser controls, console and screenshots. Preserve the distinction between 3D random access reported by the paper and in-plane order steering actually traced. Shared DMD behavior, objective boundary handling and arrival grouping belong to the integration, not a paper-specific fork.
