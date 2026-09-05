# Ouyang 2023 — evidence, use, and model limits

**Paper:** Z. Ouyang et al., “Ultrafast 3D nanofabrication via digital holography,” *Nature Communications* 14, 1716 (2023). DOI: [10.1038/s41467-023-37163-y](https://doi.org/10.1038/s41467-023-37163-y).

This note distinguishes reported apparatus facts from the bounded OpticalSetup interpretation. It was checked against the 9-page article (SHA-256 `6bc3f492e12a5d12db9084b1b3d3ca0a98905019df929db748427646a3d35d38`) and 29-page supplement (SHA-256 `d3a3e5950cbe721b16355eccd1e95fb557e84fbc760ea79b24ef041006af17e0`).

## Evidence table

| Item | Reported evidence | Scene treatment |
| --- | --- | --- |
| Identity and mechanism | Article p. 1 abstract; p. 2 Results and Fig. 1: 1 kHz femtosecond amplifier, up to 2000 hologram-generated foci, independently controlled amplitude/phase/location, and random-access scanning by sequential DMD holograms. | Native DMD set to a labelled 1D binary-hologram proxy. Focus count, angular span, and scan angle change both its displayed mask and traced output orders. |
| Laser | Article p. 2 and supplement p. 2: Spitfire Pro, 800 nm, 1 kHz, 100 fs, 4 W average source output. | Pulsed source records `800 nm`, `0.001 MHz`, `100 fs`, and `4 W`. The 4 W is not treated as sample or per-focus power. |
| Attenuation | Supplement p. 2 and Fig. S1 on p. 12: HWP followed by PBS adjusts power. | Native HWP and PBS are on the traced path. |
| Angular-dispersion precompensation | Article p. 2; supplement pp. 2–3; Fig. S1 caption p. 12: reflective blazed grating, 600 lines/mm, followed by L1/L2 4f relay before the DMD. | Native reflective grating and two lenses trace to the DMD. The scene follows the caption/order drawing: L1 = 225 mm, L2 = 250 mm. |
| L1/L2 conflict | Supplement p. 2 “System configuration” and Fig. S1 caption p. 12 state L1/L2 = 225/250 mm. The next subsection on p. 2 states 250/225 mm. | Conflict is labelled on the canvas and is not silently resolved. |
| DMD | Supplement p. 2: TI DLP6500, 1920×1080, 7.56 µm pixels, synchronized to 1 kHz pulses; supplement pp. 4–5 describes Lee binary holograms, lateral/axial phase terms, superposed foci, and WGS uniformity optimization. | Hardware specifications are labels. The optical effect is a deterministic geometric proxy, not a Lee/WGS solver. The workbench’s 2D section represents at most eight focus orders. |
| Fourier filtering and relay | Article p. 2 and Fig. 1; supplement p. 2 and Fig. S1: L3 = 150 mm forms a Fourier plane with a spatial filter for unwanted orders; L4 = 200 mm and objective L5 form the second 4f relay to the sample. | Native L3, slit/order filter, L4, dichroic, and objective form a computed path to the stage. |
| Objective/sample | Supplement p. 2: Nikon CFI S Fluor 40× Oil, NA 1.3, WD 0.24 mm; FTO substrate on PI H-811.I2 six-axis positioner. | Native oil objective uses 5 mm EFL (40× with the app’s 200 mm reference tube lens), NA 1.3, WD 0.24 mm; resin stage receives real traced pulsed arrivals. |
| Throughput settings | Supplement p. 3: 1–2000 foci, 1 kHz scan rate, 5 nJ per focus for best results; supplement p. 8 Table S1: one 100 fs pulse defines a voxel in the compared multi-focus condition. | These are documented, not converted into the source’s 4 W field. The scene demonstrates three representative foci; it does not claim the 2000-focus field or calibrated per-focus energy. |
| Observation path | Supplement p. 2 and Fig. S1 p. 12: 589 nm GCI-060402 LED through single-mode fibre and M1 below the substrate; transmitted image returns through the shared objective and dichroic to L6 = 100 mm and FLIR Blackfly CCD. | A native 589 nm directional source is used as a **Free interpretation — not specified in the paper** proxy for fibre-delivered LED illumination. M1, resin, objective, dichroic, L6, and camera are all traced; the camera receives the 589 nm path. |
| Nonlinear response | Supplement p. 15 Fig. S4 and Note 2: fitted nonlinear coefficients are 8.65 (IP-Dip), 7.19 (DETC), and 6.65 (CAS 55035-43-3 resin). The authors note that a 2PA process would be nearer 2–3 and infer participation of multiple photons at ultrahigh peak power. | No pure two-photon absorption coefficient, threshold, dose, or cure law is applied. The resin markers are explicitly qualitative. |

## Optical sequence and planes

The writing path is:

1. 800 nm amplified pulsed source → HWP/PBS power control.
2. Reflective 600 lines/mm grating → L1/L2 precompensation relay → reflective DMD.
3. DMD binary hologram → L3 → Fourier-plane spatial filter.
4. L4 → dichroic → oil objective → photocurable resin on the six-axis stage.

The grating/L1/L2 unit precompensates angular dispersion that the small-pitch DMD would otherwise introduce; it is not temporal focusing at the sample. L3’s Fourier plane is the order-selection plane. L4 and the objective relay/rescale the selected foci to the sample. The throughput mechanism is parallel, random-access placement of up to 2000 independently encoded foci, with one amplified pulse per voxel in the compared condition.

The observation path is independent at 589 nm: fibre LED → M1 → substrate/resin → shared objective → transmitted through the short-pass dichroic → L6 → CCD.

## Free interpretation in the native scene

- **Free interpretation — not specified in the paper:** exact mechanical distances, clear apertures, incident beam diameter, and compact fold packing. Reported focal lengths and the two stated 4f relationships are retained.
- **Free interpretation — not specified in the paper:** the fibre LED is represented by a directional 589 nm native source because OpticalSetup has no powered fibre-LED element.
- **Bounded proxy:** the DMD samples a deterministic 1D binary mask and creates equal-weight angular orders for a chosen focus count/span. It does not synthesize the paper’s 2D Lee holograms, solve phase, reproduce the WGS algorithm, predict diffraction efficiency, or establish focus uniformity.
- **2D projection:** lateral/axial 3D random access is reduced to an in-plane angular scan. The paper’s 299 × 554 × 760 µm³ work volume and 128/128/249 nm scan resolution are evidence, not canvas calibration.

## Control experiments

1. **Laser emission and power boundary.** Select the Spitfire source and clear **Emit traced rays**: every 800 nm writing ray and resin arrival disappears, while the independent 589 nm observation path remains. Re-enable it, then change **Average power** from 4 W. The peak-power readout and handoff value change, but normalized ray geometry and qualitative voxel markers do not; this deliberately proves no calibrated cure/dose model is being claimed.
2. **Single versus multi-focus hologram.** Select the DMD and set **Representative foci** from 3 to 1. Three traced angular orders collapse to one and one representative focus route reaches the resin. This demonstrates the scene’s distinguishing multi-focus mechanism, not a 3D PSF or the reported 2000-focus limit.
3. **Random-access steering.** Change **Random-access scan** from 0° to +1° (larger angles can leave the finite relay aperture). The whole focus group shifts through the relay and at the sample. This is a 2D angular proxy for changing the tilted/spherical phase terms in sequential holograms.
4. **Fourier-order selection.** Select the Fourier-plane slit and reduce **Gap** from 24 mm to about 4 mm. Outer representative orders are clipped while the central route survives. The result shows why an order filter is physically meaningful; it does not predict the paper’s exact aperture or diffraction efficiency.

For each control, restore the stated default before comparing the next one. The default stage is static because the paper’s fast random access is performed by sequential DMD holograms; the six-axis stage is used for alignment and stitching, not as the per-voxel scanner.

## Handoff to Two-Photon Lithography Lab

The native traced stage resolves the ordinary pulsed source and the objective’s NA. Current destination bounds accept 800 nm, 100 fs, and NA 1.3. They reject 0.001 MHz and 4000 mW as outside the calculator’s ranges. Those values remain in this source scene and note without coercion. The destination is single-focus and cannot accept this multi-focus DMD apparatus, per-focus dose, single-pulse initiation, fitted nonlinear order, WGS uniformity, or a 3D focus field.

## Remaining unsupported behavior

- Arbitrary binary hologram synthesis, phase recovery, WGS optimization, 99% focus uniformity, DMD switching electronics, and true 3D random access.
- Angular-dispersion/pulse-front compensation as a time-dependent field calculation; the workbench traces spatial wavelength samples and ordinary lens/grating geometry only.
- High-NA vectorial PSF, the reported 90/141 nm structures, refractive-index matching errors, cover-glass effects, depletion, plasma/ionization, radical diffusion, solidification, damage, and micro-explosions.
- Calibrated pulse energy at each focus. The reported 5 nJ per focus and measured component efficiencies (64% grating, ~5% DMD, 82% objective, ~2.62% overall) are not inferred from or substituted for the 4 W source output.
