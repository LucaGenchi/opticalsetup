# Ouyang 2023: programmable multi-focus writing

Wenqi Ouyang et al., [“Ultrafast 3D nanofabrication via digital holography,” *Nature Communications* 14, 1716 (2023)](https://doi.org/10.1038/s41467-023-37163-y). This integrated scene teaches the geometric route from a programmed DMD's selected angular orders through a Fourier filter and pupil relay to three sample-plane arrivals. It is an explicitly **800 nm central-wavelength view**, not a simulation of dispersion-compensated femtosecond fields or polymerization.

**Design choice = free interpretation; not specified in the paper.** This key applies to the folds, unreported spacings and apertures, monochromatic carrier view, selected frame/column, order count/angles, and drawing layout. The reported hardware values below have a different status.

## Primary evidence

Reviewed the nine-page article, including rendered Fig. 1 on p. 2, and the complete [29-page supplement](https://media.springernature.com/original/springer-static/esm/art%3A10.1038%2Fs41467-023-37163-y/MediaObjects/41467_2023_37163_MOESM1_ESM.pdf), including rendered Fig. S1 on p. 12 and Fig. S4/Note 2 on p. 15. Article SHA-256: `6bc3f492e12a5d12db9084b1b3d3ca0a98905019df929db748427646a3d35d38`; supplement: `d3a3e5950cbe721b16355eccd1e95fb557e84fbc760ea79b24ef041006af17e0`.

| Reported fact | Primary location | Integrated treatment |
| --- | --- | --- |
| Spitfire Pro: 800 nm, 1 kHz, 100 fs, 4 W | Article p. 2; supplement p. 2 | Source settings retained; 4 W is source output, never per-focus/sample power. |
| HWP/PBS attenuation; 600 lines/mm reflective grating | Supplement p. 2, S1 p. 12 | Native elements on the path; a design-choice dump receives the rejected PBS port. |
| L1/L2 = 225/250 mm; L3/L4 = 150/200 mm | Article Fig. 1 caption; supplement S1 | Focal lengths retained. The supplement's later compensation subsection reverses L1/L2; the scene follows the article and S1 caption, without claiming that conflict is resolved. |
| Grating incidence 49.43° | Supplement p. 3 | Retained in the native central-wavelength geometry. |
| DLP6500, 1920 × 1080, 7.56 µm pixels, pulse-synchronized holograms | Supplement pp. 2, 4–5 | Shared illustrative binary frame and separate geometric orders. The drawn 48 mm aperture and 16 × 16 display are not the device's physical pixel prescription. |
| Nikon 40× oil, NA 1.3, WD 0.24 mm; six-axis sample positioner | Supplement p. 2 | Native objective and static resin stage. Five-millimetre EFL follows the app's 200 mm reference and is a design choice. |
| 1–2000 foci; 5 nJ/focus; single-pulse comparison | Supplement pp. 3, 8 | Documented, not used to calibrate the three representative orders or sample markers. |
| Fitted nonlinear orders 8.65, 7.19, 6.65 in the prose | Supplement p. 15 | No two-photon-only cure law. Fig. S4 itself labels the final fit 6.66. |

The paper's mechanism combines digitally encoded, independently positioned foci with a regenerative amplifier and material kinetics. Article pp. 2–4 also discuss ionization, diffusion and solidification. Geometric intersections do not reproduce those results, the reported 90/141 nm features, a high-NA PSF, WGS uniformity, or arbitrary 3D random access.

## What is actually traced

The writing train is amplifier → HWP/PBS → grating → folded L1/L2 relay → reflective DMD → L3 → Fourier-plane slit → L4 → dichroic fold → objective → mounted resin. Five added flat mirrors compact the upstream relay; they preserve unfolded path distances. All five folds and their mechanical arrangement are design choices.

The grating/doublet before the DMD has the paper's **compensation topology**, but the scene does not calculate its compensation. The DMD's geometric orders add wavelength-independent angles and do not model its physical diffraction dispersion. Therefore the source deliberately uses `transformLimited: false, bandwidth: 0`: one 800 nm carrier with 100 fs/1 kHz timing metadata. This is a geometric viewing convention, not a physical zero-bandwidth 100 fs pulse. Enabling source bandwidth exposes uncompensated spectral spread and does not demonstrate the reported compensation or pulse confinement. No compensating spectral slope has been invented.

The shared DMD displays the current 2D binary illustration, enlarged with its sampled column marked. Frame 0, column 6 of 16 is chosen so the entire 2 mm source beam is ON in the traced section. Changing a frame gates actual sampled rays. Separately enabled **Geometric holographic orders** split accepted light into equal-weight branches. Order count, span and steering do not synthesize or modify the displayed frame. Default playback is static; optional frame playback changes discretely at an illustrative rate, not at a claimed hardware-synchronized 1 kHz.

The actual objective focus is on the resin plane. All admitted rays contribute to the shared arrival detail; its fixed ±250 µm field makes the small displacements visible without enlarging the optical geometry. It shows sampled positions/support, not calculated voxel dimensions or dose. The sample uses `transmitExc: true, transmission: 0` to stop the displayed writing rays at the specimen while retaining arrival markers. This is a display boundary, not a measured resin absorption.

The **589 nm observation branch is omitted**, as the canvas states. In the paper it is fibre-coupled LED → M1 below the substrate → resin/substrate → shared objective → transmitted dichroic port → L6 (100 mm) → FLIR Blackfly CCD. The integrated scene makes no camera-image or observation-signal claim.

## Optical planes and finite beam

| Plane or distance | Native value |
| --- | --- |
| Grating | `(285, 180)` mm, incidence 49.43° |
| Grating → L1 / L1 → L2 / L2 → DMD | 225 / 475 / 250 mm, including all folds |
| DMD body / rotation | `(397.135169, 304.654720)` mm / 123° |
| **DMD active face**, local x = −9 | `(402.036921, 297.106685)` mm |
| L3 / Fourier filter / L4 | x = 552.036921 / 702.036921 / 902.036921 mm, at y = 297.106685 mm |
| L4 → dichroic → BFP | 47.963079 + 152.036921 = 200 mm |
| Objective true BFP and stop | `(950, 449.143606)` mm |
| Equivalent refracting plane / resin | y = 454.143606 / 459.143606 mm |

Using the active face rather than the DMD body centre, the unfolded L3/L4 matrix is `A = −4/3, B = 0, C = 0, D = −3/4`. The true BFP and stop coincide. The 2 mm source beam is a design choice that avoids the original scene's severe overfill: the default measured incident pupil extent is 2.993286 mm against a 13 mm pupil. This underfilled model does **not** realize the objective's rated NA 1.3 or calculate high-NA resolution.

Twenty-five independent native line probes across the entire configured source width reach all three orders at steering −1°, 0° and +1°. Each order's pupil centre remains within `1e−8 mm` of the axis; its complete footprint stays inside the pupil. The actual tilted DMD footprint produces small order-dependent beam-width changes, while each monochromatic group still has geometric focus span below `1e−8 mm`. These are ray-geometry checks, not field or throughput predictions.

## Controls and checks

Restore the defaults between comparisons.

| Experiment | Verified native result |
| --- | --- |
| Source off or 0 W | No writing or arrival-detail channels. Positive 4 → 2 W changes metadata only. |
| Geometric orders 3 → 1 | Three groups/75 actual arrivals become one group/25 arrivals. Eight orders preserve eight full groups/200 arrivals and total normalized weight 0.82. |
| Order steering 0° → +1° | Default x offsets −130.953, 0, +130.953 µm become −196.529, −65.456, +65.456 µm. |
| Filter gap 16 → 4 mm | Only the central order's 25 rays survive; lost order power is not redistributed. |
| DMD frame 0 → 1 | Same configured order angles, but the sampled column admits 13 rather than 25 source samples per order. An all-OFF frame removes them. |
| NA reduced to 0.1 / steering +20° | The finite pupil removes outlying rays / finite downstream apertures reject all writing. No false unfocused escape hits survive. |
| Resin moved 0.1 mm axially | Three sampled supports broaden to approximately 53.8–59.9 µm; no sharp fictitious centroid is substituted. Moving L4 by 10 mm also produces finite geometric spread. |

`node --test test/2pp-ouyang-integrated.test.js` passes **6/6**, covering both relay distances, actual face/BFP geometry, full-aperture foci and pupil centres, 1–8 orders, source/frame/filter boundaries, physical defocus, finite coordinates, no post-resin fan and exact save/reload trace equivalence. The on-canvas figure is 1060 × 795 mm with 26.5 mm body/component type and a 42.4 mm title. The native SVG was inspected at 1440 px and at a 500 px fitted width; it is a layout check, **not browser evidence**. Real desktop/narrow browser controls and console acceptance remain pending while the shared browser connection is unavailable.

The destination Two-Photon Lithography Lab cannot represent this multi-focus CGH apparatus, its source operating range, single-pulse initiation or higher-order kinetics. No dose or throughput conclusion should be inferred from a handoff or from the resin markers.

The native source explicitly disables automatic apparatus-to-lab handoff. The companion page may still pass the verified nominal 800 nm, 100 fs and NA 1.3 paper parameters; it does not export the interpreted optical train or unsupported 1 kHz / 4 W inputs.
