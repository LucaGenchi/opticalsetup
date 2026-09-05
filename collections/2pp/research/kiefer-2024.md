# Kiefer 2024 — evidence and scene controls

Paper: Pascal Kiefer et al., “A multi-photon (7 × 7)-focus 3D laser printer based on a 3D-printed diffractive optical element and a 3D-printed multi-lens array,” *Light: Advanced Manufacturing* 4, 3 (2024). DOI: [10.37188/lam.2024.003](https://doi.org/10.37188/lam.2024.003).

Primary PDF checked: `LAM2023080053.pdf`, 14 pages, SHA-256 `55ac959947738f905ce52252e777686ac17609a303a6a75f167769ce4350be02`.

## Evidence table

| Claim or component | Primary-source location | Status in the native scene |
| --- | --- | --- |
| Chameleon Ultra II; 790 nm; 3.7 W average; 80 MHz; 140 fs sech² | p. 4, “Optical setup,” first paragraph; Fig. 2a source label | Entered exactly as source settings. The 3.7 W is laser output, not objective or per-focus power. |
| L1/L2 1.25× demagnification into AA MT80-A1.5-IR AOM; zero order dumped; first order relayed onward | p. 4, “Optical setup,” first paragraph; Fig. 2a | Native telescope and AOM. Both computed AOM orders are shown; the zero order terminates at a real beam dump. AOM angle, efficiency and focal lengths are interpretation. |
| L3/L4 1.60× relay; flat-wavefront 1/e² diameter `D0,DOE = 571 µm` at DOE | p. 4, first paragraph | Native relay and reported diameter annotation. Canvas geometry is deliberately not a 1:1 micrometre-scale beam metrology model. |
| DOE generates 7×7 beamlets; design `MDOE = 3` | pp. 3–4; Fig. 1c; Fig. 2a caption | Native static diffractive splitter shows the seven orders in the displayed meridional section. It does not synthesize or validate the 2D DOE phase profile. |
| L5/L6 3.33× telescope; L7 telecentric collimation; `D0,MLA = 720 µm` | p. 4, second paragraph; Fig. 2a | Native telescope and lens proxies with reported beam-diameter annotation. Focal lengths and separations are free interpretation because the paper does not list their prescriptions. |
| Separate custom aspheric 7×7 MLA raises `M` from 3 to about 300 without increasing angular dispersion | p. 4, second paragraph; mechanism analysis on p. 3 | Native seven-lenslet 1D paraxial section. It demonstrates independent lenslet axes, but not the published aspheric prescription or 2D vector field. |
| LG1 collimates the initial focus array to GX; LG2/LG3 are a 1× GX-to-GY relay; LG4/LG5 are a 2× pupil relay | p. 4, third paragraph; Fig. 2a–c and caption | Native lens and telescope proxies preserve the functional sequence. Complex multi-element scan groups are reduced to paraxial equivalents; prescriptions are not reported in this paper. |
| GX/GY are Cambridge Technology 6215H, 6 mm mirrors; coordinate system is flipped before GY | p. 4, third paragraph; Fig. 2a caption | Two native galvos animate on the common simulation clock and change the computed downstream rays. Icons are enlarged for legibility. |
| Zeiss Plan-Apochromat 40×/NA 1.4 Oil DIC; 49 foci at 60 µm nearest-neighbour spacing | p. 4, third paragraph; Fig. 2a caption | Native oil objective has NA 1.4 and 70% transmission. The canvas cannot represent the 7×7 field or preserve the 60 µm spacing at its schematic scale. |
| `P = 954 mW` in front of the objective for all 49 foci; estimated `19.5 mW` per focus before the objective; 70% objective transmission assumed | pp. 4–5, paragraph spanning the page break | Kept as an on-canvas power-plane note only. These values are not assigned to every ray and 954 mW is never treated as per-focus power. |
| Hybrid splitting avoids the 177% DOE-only PSF broadening estimate; residual broadening is estimated at 1.77%; Gaussian pupil use is 86.5% | p. 3, mechanism analysis | Explained beside the scene. The geometric tracer does not calculate the PSF, angular-dispersion pulse field, Gaussian encircled power or the 86.5% value. It does visibly show pupil clipping when the relayed bundle overfills the objective. |
| Yellow-light LED transmission illumination; L8 and FLIR Blackfly camera monitor printing | p. 5, first full paragraph; Fig. 2a | Native broadband point source, sample, writing objective, BS, L8 and camera form a computed reverse observation path. An LED condenser is added as free interpretation so the native point emitter is collected. |
| XY microscope stage and PI Q-545.140 Z stage | p. 4 Fig. 2 caption; p. 5 | Recorded in the resin-sample label and notes. Galvo scanning is animated; the native 2D sample does not reproduce the laboratory’s independent XY and Z hardware axes. |

## Functional interpretation

The paper’s throughput mechanism is not “a higher-angle DOE.” A low-angle DOE first distributes power efficiently into 49 beamlets while limiting wavelength-dependent angular spread. The separate refractive MLA then gives each beamlet its own optical axis and expands the effective focus separation. This produces the large field separation needed for printing without paying the chromatic PSF penalty that a direct `M ≈ 300` DOE would impose. The downstream scan relays map the two galvos and beamlets to the objective pupil; the microscope objective produces and scans the focus array in the conjugate printing plane.

The native scene is a bounded 2D meridional proxy: seven displayed DOE orders feed seven lenslets and then a paraxial relay. It is useful for order routing, lenslet-axis behavior, clipping, galvo steering, objective/sample delivery and the observation branch. It does not calculate a 7×7 scalar or vectorial field, diffraction efficiency, custom aspheric sag, aberration correction, PSF, Gaussian encircled power, nonlinear dose, threshold, depletion, voxel geometry or curing.

## Free interpretation — not specified in the paper

- All focal lengths, spacings, coatings, display dimensions and the two packaging folds.
- AOM deflection angle, diffraction efficiency and RF frequency used by the visual proxy.
- The equivalent single-lens reductions of LG1 and the multi-element scan groups.
- The LED condenser required to collect the native point-source rays.
- The schematic beam width. The reported 571 µm and 720 µm values remain annotations and are never converted into optic diameters.

No prism pair is present. The paper discusses a dispersive-telescope alternative but does not use Hahn et al.’s prism compensation architecture.

## Control experiments

1. **Laser enable / power.** Select the Chameleon source and turn **Emit traced rays** off. The red writing route and resin write arrivals disappear, while the yellow observation path remains. Re-enable it and reduce average power: geometry is unchanged, but relative ray power and pulse readouts fall. This proves source gating and power accounting in the tracer, not a cure threshold.
2. **DOE-only control.** Select the diffractive beam splitter and change **Orders in this section** from `-3,-2,-1,0,1,2,3` to `0`. The seven-order fan collapses to the on-axis branch. This isolates the DOE’s routing role; it does not predict the real DOE efficiency or 2D 7×7 uniformity.
3. **DOE-only same-field stress test.** First raise the MLA **Lenslet focal length** from `45 mm` to `3000 mm` (the weak-lens boundary); the sample-arrival span contracts because the separate refractive leverage is gone. Then raise the DOE **Equivalent grating lines/mm** from `54` to `100` to demand the separation directly from diffraction. The outer orders fan farther with wavelength and are vignetted by the compact scan/pupil relay, leaving only the axial sample arrival in this proxy. This is the distinguishing hybrid-split control: it demonstrates why the low-angle DOE plus separate MLA makes a large relayed field practical, not the paper’s `M = 300`, 1.77% PSF-spread or 86.5% Gaussian-pupil figures quantitatively.
4. **Scanner motion.** Run mechanical playback, then pause it and compare GX or GY at two command angles. The actual galvo surfaces rotate and the downstream focus positions change. The 2D view superposes one meridional scan coordinate and does not reproduce the full XY trajectory or calibrated 1 m/s focus speed.

## Companion 2PP handoff

The paper-based handoff supports wavelength `790 nm`, repetition rate `80 MHz`, pulse duration `140 fs`, and numerical aperture `1.4`. It omits source power because `3700 mW` exceeds the companion lab’s accepted 0–1000 mW range. The reported `954 mW` objective-plane total and `19.5 mW` per-focus values are not source power and are therefore not substituted. The companion calculator is single-focus educational tooling; it cannot accept the 49-focus apparatus, focus spacing, DOE/MLA efficiency, or this scene’s qualitative pupil clipping as a calibrated prediction.
