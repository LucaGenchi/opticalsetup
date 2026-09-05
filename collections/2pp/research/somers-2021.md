# somers-2021 — evidence and scene use

Paper: Paul Somers et al., “Rapid, continuous projection multi-photon 3D printing enabled by spatiotemporal focusing of femtosecond pulses,” *Light: Science & Applications* 10, 199 (2021). DOI: [10.1038/s41377-021-00645-z](https://doi.org/10.1038/s41377-021-00645-z).

Verified source: publisher PDF, 11 pages, SHA-256 `9fff3a13ae10d356f028575af9151c9c46094c3eb73da4ac31732d2f5417e7ba`.

## Evidence table

| Item | Reported evidence | Scene treatment |
| --- | --- | --- |
| Throughput mechanism | PDF p. 2, Fig. 1 and caption; p. 3 Results: DMD patterns are coordinated with the moving 3-axis stage; 100 µm/s Z motion prints a unit cell in under 250 ms. | The DMD mask and Z stage animate on the shared playback clock. Their visible rates and travel are illustrative, not the controller waveform. |
| Source | PDF p. 9, “3D printing system”: Spectra-Physics Spitfire, 800 nm centre, 65 fs, 5 kHz, ~22 nm bandwidth. | Native pulsed source uses the reported wavelength, duration, repetition rate and explicit 22 nm bandwidth. Average power is set to 0.10 W solely to keep a runnable native source: **Free interpretation — not specified in the paper.** |
| Power control | PDF p. 9: Newport HWP and Thorlabs PBS25-780. | Native HWP + PBS with a real rejected port and beam dump. |
| First expansion | PDF p. 9: LA1582-B f = −75 mm and LA1509-B f = +100 mm expand the beam to ~6 mm. | Native conjugated thin-lens pair using the reported focal lengths. |
| Flat-top shaping | PDF p. 2 Fig. 1 caption and p. 3 Results; p. 9 identifies πShaper 6_6_TiS. | Labeled at the correct point in the train. The tracer samples a uniform ray tube and does not calculate Gaussian-to-flat-top redistribution. |
| DMD fill expansion | PDF p. 2 Fig. 1 caption and p. 9: plano-convex f = 100 and 150 mm lenses before the DMD. | Native conjugated thin-lens pair using the reported focal lengths. |
| DMD mask and dispersion | PDF pp. 2–3: DLP3000 at ~24° incidence, patterning up to 4 kHz; micromirror columns provide the dispersive grating action; selected blaze order travels along the DMD normal. | Native binary DMD mask with an optional carrier-dispersion proxy. Equivalent 92.6 lines/mm and carrier order 5 are **Free interpretation — not specified in the paper**, chosen to show the 22 nm band separating and being re-imaged without claiming the paper’s full field model. |
| Projection relay | PDF p. 2 Fig. 1 caption; p. 9 Methods: AC254-300-B-ML achromat, f = 300 mm, then Nikon 100× NA 1.49 objective. | Native L3 and oil/dip-in objective. The scene preserves 300 mm from DMD plane to L3 and a first-order 4f-like 300 mm / 2 mm relay to the objective’s equivalent plane. The exact mechanical L3-to-objective spacing is not reported; the relay placement is **Free interpretation — not specified in the paper.** |
| Print medium and motion | PDF p. 3: BBK at 0.7 wt% in PETA, glass substrate, Aerotech ABL1000 series 3-axis air-bearing stages; p. 9 confirms dip-in operation. | Native resin stage with pulsed-arrival voxel preview and a visible Z traverse. The 0.1 mm, 0.2 Hz preview is **Free interpretation — not specified in the paper.** |
| Observation branch | PDF p. 9: Thorlabs BSW29 50:50 beam splitter before the objective feeds a Panasonic CCD. | Native splitter and camera on a traced incident-light monitor branch. The actual reflected-sample imaging return path is not simulated. |
| Alignment branch | PDF p. 9: 633 nm laser enters via Thorlabs DMLP650 to locate the substrate surface. | Native 633 nm CW source and long-pass dichroic join the objective path. |
| Pulse-duration diagnostic | PDF p. 9: Thorlabs DET25K GaP detector is used before the DMD while the amplifier internal grating compressor is adjusted. | Labeled detector is kept off the live path because the insertion/pickoff geometry is not reported. |

## Default route

Open `/sketch/?paper=somers-2021&edit=1`, or load `collections/2pp/setups/somers-2021.json`.

The enabled Spitfire proxy emits a 4.5 mm ray tube. That input diameter, the 0.10 W display power, the alignment source's 5 mW display power and the display-only resin transmission/voxel values are **Free interpretation — not specified in the paper.** The reported Galilean pair expands the ray tube to approximately 6 mm; the positive pair expands it again toward the DMD. ON regions of the DMD route the beam into the selected order and sample the reported spectral band into five weighted geometric rays (the objective pupil can clip the outer spectral samples). L3 and the objective form a first-order image of the DMD plane at the resin. The 50:50 splitter sends a real branch to the CCD. The optional 633 nm source (disabled initially) reflects from DMLP650 into the shared objective path.

The scene demonstrates the spatial conjugate relationship and wavelength fan/recombination geometrically. It does **not** prove temporal confinement: no time-dependent field, pulse-front tilt, vectorial focus, intensity-squared threshold, resin chemistry, dose accumulation or curing is solved.

## Control experiments

1. **Laser enable/power path.** Select the Spitfire source and turn **Emit traced rays** off: the complete 800 nm route and new resin arrivals disappear. Turn it on, rotate the HWP away from 0°, and the PBS redirects a growing fraction toward the rejected-port dump. This tests native emission and polarization routing, not an absolute operating power.
2. **Remove the distinguishing carrier action.** Select the DMD and turn **Dispersive carrier proxy** off. The ON-mask route remains, but the colored spectral fan collapses to one broadband geometric path. The comparison shows what the DMD carrier adds in this scene; it does not calculate temporal pulse width at the resin.
3. **Freeze or alter the projected masks.** Turn **Animate mask sequence** off, then change **ON fraction** or **Pattern pitch**. Downstream mask routing and resin hit presence change because the actual DMD gate changes. The 0.4 Hz playback is illustrative; the paper reports up to 4 kHz masks.
4. **Remove continuous Z traversal.** Select the stage and change **Scan pattern** from **Z — depth** to **Static**. The resin stops moving through the nominal print plane while the DMD can continue updating. This isolates the paper’s no-dead-time motion concept, but the triangular preview is not the Aerotech trajectory or stage-trigger protocol.

## Companion handoff

The paper-specific handoff can safely carry 800 nm, 65 fs and NA 1.49. The reported 0.005 MHz repetition rate is below the calculator’s 10–100 MHz range and is deliberately omitted. Source power is omitted because the paper reports exposure-dependent print-plane intensities rather than one operating source power. The native traced-stage handoff is unavailable for the same repetition-rate reason. Neither route is a calibrated prediction for this projection apparatus.


## PR review corrections — 2026-09-05

Independently inspected attached Fig. 1 and the p. 9 Methods. The initial model correctly used 24° incidence but emitted the selected DMD order 48° away from the face normal. Repositioned the real layout fold and rotated the DMD so the traced incidence is 24° and its central selected order is normal. This also prevents the expanded input beam bypassing a too-grazing fold aperture. Preserved 300 mm from the DMD active face to L3 and 302 mm from L3 to the objective equivalent plane.

Moved the resin by 0.1 mm onto the actual nominal image plane: initial spectral reference hits spanned 0.195 mm; corrected geometric coincidence is below 0.000001 mm. Reduced the Z excursion to 0.1 mm total so the sample remains outside the 0.13 mm objective working-distance gap, rather than traversing the barrel. Zooming into the sample shows this movement; its rate and travel remain a preview, not the reported controller waveform. The linear-triangle native Z preview reverses at its endpoints; it is not an unbounded one-way continuous print trajectory.

DMD bright/dark bands now show the exact traced pitch, ON fraction and animated phase. Cropped text and label collisions were corrected, an explicitly interpreted output dump terminates residual light, and the optional alignment source starts disabled so it cannot hide changes to the writing path. CCD copy now identifies the incident-light monitor limitation, rather than implying that a reflected sample image is computed. Objective transmission, EFL/WD, thin-lens achromat proxy, layout fold, dump and display scaling remain interpretation. Resin marks are reference-ray arrivals, not all projected mask pixels or fabricated layers.

Verification: default/source/dispersion/mask/stage controls, exact incident/selected angles, deliberately broken relay conjugacy, zero power, finite malformed mask inputs, frame fit and save/reload regressions. Native SVG export was rasterized and visually inspected. Repository test/syntax/whitespace checks were run before publication; browser verification is coordinated in the parent review.
