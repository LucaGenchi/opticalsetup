# Gittard 2011 — evidence and scene notes

Paper: Shaun D. Gittard et al., “Fabrication of microscale medical devices by two-photon polymerization with multiple foci via a spatial light modulator,” *Biomedical Optics Express* 2, 3167–3178 (2011). DOI: [10.1364/BOE.2.003167](https://doi.org/10.1364/BOE.2.003167).

Primary source checked: 12-page article PDF from Europe PMC, SHA-256 `57aeb233979fa416a88854a4e398c1e7859dddfa6285c4b6aa9134baf1dea062`.

## Evidence table

| Claim | Primary-source location | Status in the scene |
|---|---|---|
| Ti:sapphire Chameleon at 780 nm, repetition rate 80 MHz, average source power 4 W, pulse width `<150 fs` | PDF p. 6, Experimental | Source fields use 780 nm, 80 MHz and 4 W. The 150 fs scene value is an upper-bound playback proxy, not exported as an exact paper value. |
| Pulse-energy control uses a liquid-crystal modulator and polarizing beamsplitter, followed by a beam expander | PDF p. 6, Experimental | Native voltage-controlled retarder plus PBS, followed by an interpreted 20/40 mm expander. The native retarder is only an LC-attenuator proxy. |
| LC-R2500 reflective, phase-only SLM; 256 gray levels; 128×128-pixel CGH tiled 6×6 on the XGA SLM | PDF p. 6, Experimental | Reflective SLM with a visible 4×4 square-focus CGH proxy. Pixel-level phase and the 6×6 tiling are documented, not calculated. |
| First diffracted order forms an arbitrary pattern at Fourier plane P and the sample; zero order is removed at P | PDF pp. 6–7 and Fig. 1 on p. 7 | A bounded carrier-steer proxy separates the configured focus pattern from a specular zero-order branch; a dump at P removes the latter. |
| Phase-modulated beam passes through a galvanoscanner for X/Y structuring control, then a microscope objective | PDF pp. 6–7 and Fig. 1 on p. 7 | Two animated galvo mirrors move the traced focus-row pattern through an interpreted scanner/pupil relay and the objective. |
| Representative Venus run: 16 beams in a 4×4 array, 8–12 mW average power per spot, 100× oil objective, NA 1.40, 100 nm layer/raster spacing, 1 mm/s | PDF p. 7, Results | Default is 4×4, with four rows traced in the 2D section, and a 100×-equivalent 2 mm EFL oil objective at NA 1.40. Power, spacing and speed are annotations because the tracer is not a calibrated writer. |
| Four-focus scaffold run used 35 µm square spacing and a 20×, NA 0.4 objective | PDF p. 8 | Documented as a different run; not substituted into the representative Venus default. |
| Four-focus scaffold: about 52.5 mW per focus at 2.5 mm/s; single-beam comparisons used 55–61 mW and 5–20 mm/s | PDF p. 9 | Recorded here to keep measurement planes and experiments distinct; not used as Venus parameters. |
| Four-focus microneedle run used a 5×, NA 0.13 objective and 200 µm/s | PDF p. 10 | Documented as a different run; not used in the default scene. |
| SLM input damage limit 1 W; bulk power remained in blocked zero order; SLM refresh about 20 Hz; one scanner/objective limits the field of view | PDF p. 11, Discussion | Explicit model limitations. The default `zeroFrac=0.7` is illustrative, not a measured diffraction efficiency. |
| Fig. 1 includes a CMOS camera near the scanner and transmission illumination below the sample | PDF p. 7, Fig. 1 and caption | Visible illumination is traced through the sample/objective to a CMOS camera branch. The pickoff, isolation filter and condenser prescription are free interpretations. No APD is present. |

## Reconstructed functional sequence

1. Pulsed 780 nm source with the reported 80 MHz repetition rate and 4 W source specification.
2. Liquid-crystal attenuation proxy and PBS.
3. Interpreted two-lens beam expander.
4. Reflective SLM carrying an 8° carrier-steer interpretation and a 4×4 square-focus CGH proxy.
5. Fourier plane P: the specular zero order is dumped while the selected first-order focus pattern continues.
6. X and Y galvo mirrors translate the whole configured focus-row pattern.
7. Interpreted scan relay maps the scanner toward the objective pupil.
8. 100×-equivalent, NA 1.40 oil objective focuses into resin on the positioning stage.
9. An auxiliary visible source below the specimen is collected through the specimen/objective and picked off to the CMOS camera.

The paper’s throughput mechanism is parallel writing: one ordinary scan command is applied to multiple SLM-generated foci, so several copies are written at once. The model does not infer writing throughput from source power.

## Reported, interpreted and unsupported

Reported facts are identified in the table above. Every authored focal length, relay ratio, carrier angle, galvo frequency/amplitude, observation pickoff ratio, visible filter cutoff and illumination wavelength is labelled in the scene as “Free interpretation — not specified in the paper” or equivalent. These values make the native 2D optical path compact and functional; they are not apparatus measurements.

The paper/figure discrepancies are retained:

- Fig. 1 labels a half-wave plate and polarizer, whereas the prose specifies a liquid-crystal modulator and PBS.
- Fig. 1 says `<140 fs`, whereas the prose says `<150 fs`.

The scene does not solve a CGH, its diffraction efficiency, scalar or vector diffraction, a 3D multi-focus field, the objective prescription, voxel threshold, dose, polymerization kinetics or calibrated fabrication. The square-grid control displays N×N target points on the SLM and traces N in-plane focus rows. Its other N columns are out of the 2D workbench plane.

## Control experiments

1. **Multifocus versus one focus.** Select the SLM, open **Optical function**, and change **Foci per side** from 4 to 1. The SLM display changes from 4×4 to one target and the resin receives one traced in-plane focus row instead of four. This demonstrates parallel addressing, not a calculated 3D PSF.
2. **Move the whole pattern.** Leave the SLM at 4×4 and switch both galvos between **Triangle scan** and **Static**. In Mechanics playback, the downstream rays and resin marks move together; the SLM grid itself does not move. This distinguishes pattern generation from scanning.
3. **Remove the residual zero order.** Toggle the SLM’s **0th-order reflection** off. The specular branch into the plane-P dump disappears while the selected focus pattern remains. The configured 70% fraction is deliberately illustrative; the paper gives no measured efficiency here.
4. **Source-off boundary.** Turn off **Emit traced rays** on the pulsed laser. Writing rays and new resin marks disappear. Re-enable it to restore the path.

## Cross-site handoff

The paper-backed handoff supports exactly 780 nm, 80 MHz and NA 1.40. It omits pulse duration because `<150 fs` is not an exact value, and omits 4000 mW because it is outside the companion lab’s accepted source-power range. The paper’s 8–12 mW per-spot Venus value is a downstream writing-plane measurement and is not substituted for source power.
