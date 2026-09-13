# Somers 2021 — discrete projection frames and geometric imaging

Somers et al., [“Rapid, continuous projection multi-photon 3D printing enabled by spatiotemporal focusing of femtosecond pulses”](https://doi.org/10.1038/s41377-021-00645-z), *Light: Science & Applications* 10, 199 (2021). Primary source: attached publisher PDF, 11 pages, SHA-256 `9fff3a13ae10d356f028575af9151c9c46094c3eb73da4ac31732d2f5417e7ba`. The apparatus page was rendered and inspected. Page references below are PDF pages.

The paper combines projected DMD patterns, the DMD's angular dispersion, and externally triggered stage motion. The native scene teaches the mask-to-resin image relationship with discrete 2D device frames and a separately configured spectral-angle proxy. It does not calculate the time-dependent field or the paper's continuous fabrication process. The original branch review remains in [reviews/somers-2021.md](reviews/somers-2021.md); its original scores are not scores for this rework.

| Apparatus or setting | Primary evidence | Integrated treatment |
| --- | --- | --- |
| Spitfire source, 800 nm, 65 fs, 5 kHz, approximately 22 nm bandwidth | p. 9, “3D printing system” | Native pulsed source. The 22 nm spectral input represents the reported approximate bandwidth; transform-limited inference is disabled. |
| HWP and PBS25-780 power control | p. 9 | Native polarization routing, with a real rejected-port dump. |
| −75/+100 mm expansion to approximately 6 mm | p. 9 | Native conjugated lens pair. The chosen 4.5 mm input becomes 6 mm. |
| πShaper 6_6_TiS, then +100/+150 mm expansion | p. 2 Fig. 1a caption; pp. 3, 9 | The πShaper is an annotation at the correct train position; Gaussian-to-flat-top redistribution is not traced. The second native lens pair produces a 9 mm beam. |
| DLP3000, approximately 24° incidence, normal selected blaze order, patterns up to 4 kHz | pp. 2–3; p. 9 | Correct native incident/exit geometry. Four shared 2D slice frames play at an illustrative 0.5 frames/s. The marked column identifies the geometric section; the frame is not a calculated optical field. |
| DMD columns provide angular dispersion | p. 3 numerical-model description | Separate `Relative grating carrier` control. Its 92.6 lines/mm and order 5 are design choices, not the paper's retrieved grating prescription. |
| L3 achromat f=300 mm and Nikon 100×/NA 1.49 dip-in objective | p. 2 Fig. 1a; p. 9 | Native 300 mm lens and oil-objective equivalent. The 2 mm EFL, 0.13 mm WD, 8 mm front aperture and ideal-lens prescription are design choices. |
| 70% objective transmission | p. 9 | **Reported assumption**, used by the authors when estimating print-plane intensities; not a measured transmission or an unspecified free choice. |
| BSW29 50:50 splitter and Panasonic CCD | p. 9 | A real incident-light branch reaches the native CCD. It does not reproduce reflected-sample imaging. |
| BBK, 0.7 wt% in PETA; substrate on Aerotech ABL1000 three-axis stages | p. 3; p. 9 | Native mounted resin with a fixed-scale detail of actual ray arrivals. Default stage is static at the image plane. Optional Z motion reverses periodically. |
| 633 nm/DMLP650 alignment and GaP DET25K pulse-duration diagnostic | p. 9 | Documented here but omitted from the compact bench. No disconnected auxiliary replica or fictitious return beam is drawn. |

**Design choice = free interpretation; not specified in the paper.** This key applies to the display source power (0.10 W), input diameter, five added folding mirrors and their locations, source/optic apertures and mounting sizes, the 12 mm DMD section aperture, slice shapes and playback rate, carrier settings, equivalent objective prescription, and optional 0.1 mm/0.2 Hz Z travel. The 25.4 mm L3 aperture is a native design input inferred from the named AC254 component, not a separately reported measurement. The added folds compact the bench without scaling the reported focal lengths. The CCD branch is an incident monitor. Rendering ends at the resin using zero transmitted intensity; this is a drawing termination choice, not a claim of complete material absorption.

The two expansion ratios give a 9 mm incident beam and a 9/cos(24°) = 9.8517 mm footprint at the DMD. The chosen 12 mm active section contains that entire footprint. The four slice shapes are illustrative square, outline, cross and ring frames; they are not reconstructions of the paper's unit-cell image files. A native enlarged frame view shows that same current frame, frame index and marked tracer column without changing the physical aperture or optical effect.

## Image and aperture audit

The required conjugacy is **DMD field plane → resin image plane**, not scanner → objective BFP. With the source at upper left, the real folded route uses:

| Plane or fold | World position (mm) |
| --- | --- |
| DMD active face | (670, 215); element center (670, 206), rotation 270° |
| First projection fold | (670, 315) |
| L3, f=300 mm | (470, 315) |
| Second projection fold | (421.5, 315) |
| Third projection fold | (421.5, 420) |
| Objective BFP / stop | (568, 420) |
| Objective equivalent plane | (570, 420) |
| Nominal resin plane | (572, 420) |

The unfolded distances are 300 mm from DMD face to L3, 302 mm from L3 to the objective equivalent plane, and 2 mm to the resin. The first-order matrix is `[−1/150, 0; 0, −150]`. B=0 is the field-image condition. C happens to be zero in this chosen arrangement, but it is not a required scanner-style criterion for a DMD field image. The actual native folded scene maps DMD screen-x displacement to resin screen-y displacement with magnification −1/150.

Twenty-five independent source-line probes spanning the complete 4.5 mm input beam reach the actual DMD face. Every field position re-images all three admitted spectral samples at one point, to below 1e−8 mm spread. The shared finite pupil is at the true BFP. Its 2.98 mm radius admits the center and approximately 786/814 nm samples and blocks the approximately 772/828 nm outer samples. Independent monochromatic probes at both field edges and the center verify this acceptance and stationary wavelength-specific pupil positions. Spectral separation at the pupil is intentional. Geometric wavelength overlap at the resin does not prove temporal compression.

## Three useful experiments

1. **Source and power path.** Disable **Emit traced rays**, or set source power to zero: both the actual-arrival detail and CCD go dark. Restore the source and rotate the HWP from 0° to 22.5°: the CCD's relative reading halves; at 45° the writing path is extinguished. Positive display power is not a dose calibration.
2. **Programmed frames and spectral effect.** Inspect the DMD, disable **Play discrete frames**, and select frames 0–3. The actual-arrival detail changes with the sampled column of the square, outline, cross and ring. Playback advances only at frame boundaries; it never translates a stripe conveyor. Turning playback off returns to the selected starting frame rather than promising to freeze the currently animated frame. Separately set **Spectral-angle proxy** to **None**: the spectral fan collapses while the spatial mask image remains.
3. **Image plane and Z.** The stage starts **Static** at the nominal image plane. Select **Z — depth** to move it through a 0.1 mm reversing preview; the full sampled support broadens away from the image plane. Return to Static to recover the image. This is neither the paper's one-way continuous motion nor its external triggering. The reported 100 µm/s fabrication example (p. 3) is not reproduced by this 0.2 Hz display cycle.

The native arrival detail displays samples on a fixed ±80 µm transverse field, not a PSF or intensity curve. At the nominal plane, frames 0–3 produce 57, 30, 75 and 24 admitted spatial/spectral samples. Their support spans approximately 49.259, 54.732, 65.678 and 49.259 µm respectively. These counts depend on geometric sampling, not a number of physical pixels or cured voxels. Center-only signal spots and voxel markers are disabled: the center can be OFF in an outline or ring while many other image points remain illuminated.

With frame 0, moving the resin ±50 µm axially broadens the actual support from 49.259 to 146.587 µm. It stays beyond the objective's front tip. The pulse remains configured at 65 fs; no depth-dependent temporal recompression is calculated. The DMD frame clock and optional stage/pulse playback are illustrative and are not synchronized to the paper's controller.

## Scope and verification

No arbitrary 2D/3D optical field, pulse-front tilt, diffraction efficiency, temporal-focusing confinement, vectorial high-NA PSF, voxel dimensions, nonlinear absorption, dose, curing chemistry or calibrated throughput is solved. The simulation samples one column of the visible 2D frame. Native source weights and CCD readings are relative. The paper's source power is unknown, and its 0.005 MHz repetition rate falls outside the companion calculator's range; the native source handoff is disabled rather than transferring an invented operating point.

`node --test test/2pp-somers-integrated.test.js` passes seven meaningful tests: default full-field support and CCD route; all 25 field probes plus a deliberately broken 330 mm L3; true-BFP finite-aperture rejection; source/polarization/carrier controls; discrete 2D frames and dark column/frame; physical reversing Z with broadened support; and normalized save/reload plus figure containment. Tests also require finite output and termination at the real specimen plane. The native SVG is generated by `node tools/render-2pp-preview.mjs somers-2021` and was rasterized for visual inspection at 1520 px and 500 px wide, including both shared detail views. This is native export QA, not browser acceptance. Desktop, approximately-1024, meaningful UI controls, console and browser persistence remain a separate integration gate while the coordinated browser is unavailable.
