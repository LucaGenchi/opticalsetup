# Fischer 2011 apparatus evidence and use

Paper: Joachim Fischer and Martin Wegener, “Three-dimensional direct laser writing inspired by stimulated-emission-depletion microscopy,” *Optical Materials Express* 1, 614–624 (2011), DOI [10.1364/OME.1.000614](https://doi.org/10.1364/OME.1.000614). The inspected 11-page author manuscript is [arXiv:1105.5703](https://arxiv.org/pdf/1105.5703), SHA-256 `55ded32ec38701a1bef2af6d67362338850bd658a953649ec4937fec1b8d49a8`.

## Evidence table

| Item | Status | Primary-source evidence |
|---|---|---|
| Excitation source | Reported | Manuscript p. 6: Spectra-Physics Mai Tai HP femtosecond pulses centred around 810 nm. Repetition rate and pulse duration are not stated. |
| Excitation polarization | Reported | Manuscript p. 6: circularly polarized. |
| Depletion source | Reported | Manuscript p. 6: Spectra-Physics Millennia Xs, continuous-wave 532 nm, circularly polarized. |
| Central phase mask | Reported | Manuscript pp. 6–7: a 430 nm SU-8 cylinder (`n = 1.62` at 532 nm) introduces 180° phase shift in the centre of the collimated depletion beam. |
| Pupil mapping | Reported | Manuscript p. 6: phase-mask plane imaged onto the objective entrance pupil; central region occupies about 50% of the pupil **area**. The corresponding meridional diameter fraction is `sqrt(0.5) ≈ 0.707`. |
| Depletion focal distribution | Reported | Manuscript p. 7, Fig. 2 and caption: axial lobes plus a focal-plane ring reduce the effective exposure in both axial `z` and lateral `xy`. Fig. 2 is a focal-distribution figure, not an optical-train drawing. |
| Objective | Reported | Manuscript p. 6: Leica HCX PL APO, NA 1.4. Magnification, EFL, working distance and immersion medium are not stated in this manuscript. |
| Resist | Reported | Manuscript p. 7: 0.25 wt% DETC in pentaerythritol tetraacrylate (PETA), with 300–400 ppm monomethyl ether hydroquinone inhibitor. |
| Scanning | Reported | Manuscript p. 7: constant scan velocity 100 µm/s. Scanner/stage hardware and travel are not specified. |
| Temporal gate | Reported | Manuscript p. 7: both beams chopped by AOMs at 4 kHz and 3% duty, including experiments without depletion. |
| Depletion power | Reported with location | Manuscript p. 7: 50 mW for the shown STED-DLW structures; all powers quoted in front of the objective entrance pupil. It is not documented as laser-head output. |
| Excitation power | Reported range, not one setting | Manuscript p. 7: regular-DLW optima 7.4–8.3 mW across rod spacings; STED-DLW optima 31% higher. |
| Combined-beam layout | Interpretation | A short-pass dichroic combines the two colours before a shared relay and objective. This is physically coherent with the stated common objective, but no mechanical optical-train drawing is published in the manuscript. |

The distinguishing phase pattern is not a vortex doughnut: its central π pupil step supports axial inhibition as well as the radial ring shown in Fig. 2.

## Integrated native scene

Open [`../setups/fischer-2011.json`](../setups/fischer-2011.json) in OpticalSetup or use the collection page's editable link. The 720 × 540 mm frame follows the collection's layout: pulsed excitation at the upper left, a real fold into the common lower beam, and the objective/resin at the lower right. Labels and body text use 18-unit type; the title uses 28.8. The [native SVG preview](../previews/fischer-2011.svg) is an export of the actual scene and tracer, not a separate diagram or browser screenshot.

The excitation passes its AOM and quarter-wave plate, folds downward, then traverses its first relay lens. The 532 nm CW beam passes its AOM, quarter-wave plate, central phase plate and first relay lens. An inferred short-pass dichroic transmits 532 nm and reflects 810 nm into a shared second lens. Both beams are circularly polarized in the native trace and meet at the same geometric focus.

**Design choice = free interpretation; not specified in the paper.** Every mechanical coordinate, fold, combiner type, lens prescription and aperture, the 5.6 mm beam diameter, 2 mm objective EFL, 0.13 mm WD, oil selection, and 0.1 mm stage travel at 0.5 Hz are design choices. The stage moves at the reported 100 µm/s between the inferred triangle sweep's reversal points; the paper does not specify this hardware, travel or waveform. The original 5 mm sweep is not retained.

The illustrative source timing is 80 MHz and 150 fs, with no transform-limited bandwidth assumption. The chosen excitation setting, 10.48 mW, is 31% above an illustrative 8.0 mW ordinary-DLW point; it is not a reported fixed operating point. The 50 mW depletion source setting is an on-state/pupil-power proxy rather than a verified laser-head value. These source settings do not calibrate the apparatus or exposure. Both AOMs use the reported 4 kHz and 3% duty, with a common configured zero phase offset. They are drawn as continuous rays to keep their paths legible; pulse-gate and time-averaged CW behavior remain active. “Draw gated beam chopped” can expose the schematic segments without changing transmission.

### Exact equivalent pupil geometry

The scene now images the central mask onto the model's **true BFP**, which is also its aperture stop. This replaces the original branch's clamped-stop proxy. The paper does not supply the following prescription:

| Plane or component | World position (mm) | Role |
| --- | --- | --- |
| Central phase mask | `(225, 310)` | 5.6 mm aperture; central area fraction 0.5; OPD 0.266 µm |
| Depletion L1 | `(325, 310)` | f = 100 mm, 100 mm after mask |
| Short-pass combiner | `(425, 310)` | Transmits 532 nm, reflects the downward 810 nm path |
| Common L2 | `(525, 310)` | f = 100 mm, 200 mm after depletion L1 |
| Objective BFP / stop | `(625, 310)` | 100 mm after L2; 5.6 mm pupil diameter |
| Objective equivalent lens | `(627, 310)` | EFL = 2 mm |
| Resin / nominal focus | `(629, 310)` | 0.13 mm beyond the objective front tip |

The complete mask-to-BFP transfer is `[-1, 0; 0, -1]`: unit inverted magnification, B = 0 and C = 0. The excitation L1 at `(425, 210)` is also 200 mm of folded optical path before L2. Both output bundles are collimated before the objective. This is a mask-image check, not a scanner-pivot relay claim. Nominal 50% area is represented by a meridional central diameter of `5.6 × sqrt(0.5)` mm; it does not mean half the diameter.

The resin retains `transmitExc: true` with `transmission: 0`. That places the qualitative arrivals at the intended sample plane and then terminates the unobserved outgoing fan. Zero transmission is a drawing/model choice, not a reported resin absorption measurement. An explicit rectangular absorber would intercept rays before that plane and lose writing-arrival semantics.

### Controls and honest readouts

1. **Source on/off or zero power.** Disabling 532 nm leaves the 810 nm writing arrivals; disabling 810 nm, or setting its power to zero, leaves CW illumination with no pulsed writing arrivals. Disabling both removes all arrivals. The inset includes CW illumination, so its two-path default is not two writing foci.
2. **Central phase zone.** Change “Central pupil area fraction” from 0.5 to 0, or set “Peak path difference” to zero. The sampled differential-phase readout goes from 0.50 waves at 532 nm to zero/none. A full or oversized uniformly retarded pupil also has zero differential phase. The geometric focus and excitation arrival count do not change: the model does not calculate a depleted volume.
3. **Stage motion.** Change “Scan pattern” from “XY — long axis” to “Static.” The original position is held. At the default 0.1 mm / 0.5 Hz triangle scan, the actual sample-coordinate arrivals traverse ±50 µm inside the fixed ±60 µm inset. This is one transverse direction in the 2D section, not a simulated XY raster or fabricated 3D structure. Moving the sample axially instead produces a finite sampled spread; the inset never substitutes a sharp centroid for it.
4. **AOM gate.** Change duty while holding 4 kHz fixed. The excitation pulse gate changes and the CW path's mean transmission follows duty. Restore 0.03 for the reported setting. These are timing/transmission controls, not calculations of depletion efficiency or photochemistry.

The fixed-scale inset displays actual sampled positions and their support. Its marks and the stage's qualitative arrival markers are not a PSF, focal volume, voxel size, dose or cured material.

## Source transfer and model limits

The paper handoff is limited to nominal 810 nm wavelength and NA 1.4. Source power, repetition rate and pulse duration remain omitted because the paper supplies no single supported fixed value for those fields. `handoffEnabled: false` prevents the illustrative native source from supplying those values through a configured-value transfer.

This scene computes qualitative geometric rays, AOM gates, polarization state, mask optical-path steps, equivalent pupil clipping/focus and actual sample hits. It does **not** compute stimulated-emission depletion, vectorial diffraction or PSFs, axial/radial inhibition strength, triplet or radical dynamics, photoinitiator kinetics, dose thresholds, polymer conversion, shrinkage, voxel dimensions or calibrated 3D fabrication. The actual paper's axial lobes and lateral ring belong to its measured/calculated 3D distributions, not to these traced geometric rays. No shrinking voxel or synthetic depletion field is drawn.

## Integrated validation and open acceptance

Current focused regression status: **7 of 7 tests pass**. The shared weak-ray-retention repair now preserves the actual 1% CW AOM intensity instead of dropping it at the legacy 2% cutoff. The 1%, reported 3% default and 99% boundaries pass with both line and sized-beam sources and both chopped-display settings. No scene-level optical workaround or power rescaling is used.

`node --test test/2pp-fischer-integrated.test.js` exercises the full-beam and boundary cases, controls and save/reload. Independent nine-ray bundles spanning the full 5.6 mm diameter reach `(629, 310)` through the objective for each color, with zero sampled nominal focal span. Each pupil spans 5.6 mm with a centered footprint. Of nine probes spanning 8.4 mm, five pass and four outside the pupil are absorbed. Both channels retain circular polarization. All coordinates are finite and no rays continue beyond the terminated sample plane.

The two default arrival channels each contain 25 spatial samples. During the transverse stage sweep they move from +50 to −50 µm in sample coordinates. A deliberate 0.05 mm axial sample offset yields 140 µm of traced support in each channel, demonstrating geometric defocus without a fabricated focus marker. The phase-off, full-zone and oversized-zone controls preserve the expected geometric behavior. Source-off, zero-power, AOM duty and persistence checks are part of the same scene regression.

The native SVG was rendered with `node tools/render-2pp-preview.mjs fischer-2011`, rasterized and visually inspected for frame fit, legibility and the terminated sample fan. Real-browser acceptance remains pending while the shared browser is unavailable. The [original review](reviews/fischer-2011.md) retains its completed desktop evidence and explicitly pending approximately 1024 px follow-up; it does not claim that the reworked scene has been browser-tested.
