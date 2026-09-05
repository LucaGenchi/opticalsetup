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
| Combined-beam layout | Interpretation | A long-pass dichroic combines the two colours before a shared relay and objective. This is physically coherent with the stated common objective, but no mechanical optical-train drawing is published in the manuscript. |

The distinguishing phase pattern is not a vortex doughnut: its central π pupil step supports axial inhibition as well as the radial ring shown in Fig. 2.

## Native scene

Open [`../setups/fischer-2011.json`](../setups/fischer-2011.json) in OpticalSetup or use the collection page’s editable link. The default scene computes both wavelength paths through their own synchronized AOM, makes both circular with native quarter-wave plates, relays the 532 nm central phase zone, combines the beams, focuses them through the NA 1.4 objective, and records both at the resin stage. Pulsed excitation produces the native bounded 2PP voxel preview while the stage executes a 5 mm triangle sweep at 0.01 Hz; that combination gives a 0.1 mm/s = 100 µm/s transverse speed.

The 80 MHz, 150 fs excitation timing, 10.48 mW illustrative excitation setting, 5.6 mm beam diameter, 100 mm relay lenses, fold, dichroic, 2 mm EFL, 0.13 mm working distance, oil selection, dump and 5 mm scan travel are **Free interpretation — not specified in the paper**. The 10.48 mW choice is 31% above an illustrative 8.0 mW ordinary-DLW point; it is not a reported fixed operating point. The 50 mW depletion source setting is an on-state/pupil-power proxy; native AOM duty bookkeeping displays its time-averaged transmitted power.

## Control experiments

1. **Depletion off.** Select the 532 nm CW source and clear “Emit traced rays.” The green path disappears while the excitation pulses still reach the resin. This is the paper’s ordinary-DLW control at the level supported by the geometric model; it does not calculate the larger cured voxel.
2. **Remove the central phase zone.** Select the phase object and set “Central pupil area fraction” or “Peak path difference” to zero. The mask glyph or phase-path contribution disappears, while the geometric focus remains unchanged. That unchanged focus is intentional evidence of the model boundary: axial/radial vectorial diffraction is not simulated.
3. **Stop the written scan.** Select the sample stage and choose “Static.” The stage and voxel locations stop sweeping. Returning to “XY — long axis,” 5 mm travel and 0.01 Hz restores the illustrative 100 µm/s triangle scan.
4. **Excitation off.** Disable the 810 nm pulsed laser. The depletion path still reaches the sample, but no pulsed 2PP arrival marks are created.

## Supported and unsupported transfer

The paper-specific collection handoff transfers only the verified 810 nm wavelength and NA 1.4. It intentionally omits source power, repetition rate and pulse duration because the paper does not give one fixed supported value for those fields. The native scene’s configured-value handoff is disabled: its timing and excitation power are illustrative operating choices and must not be treated as literature inputs.

This scene computes qualitative geometric rays, AOM gates, polarization state, relay geometry, objective pupil clipping/focus and sample hits. It does **not** compute stimulated-emission depletion, vectorial diffraction or PSFs, axial/radial inhibition strength, triplet or radical dynamics, photoinitiator kinetics, dose thresholds, polymer conversion, shrinkage, voxel dimensions or calibrated 3D fabrication.
