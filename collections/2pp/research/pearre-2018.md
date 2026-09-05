# Pearre 2018 — evidence and use

Paper: Benjamin W. Pearre et al., “Fast Micron-Scale 3D Printing with a Resonant-Scanning Two-Photon Microscope,” arXiv:1803.07135v1 (26 February 2018). Verified PDF SHA-256: `2b51881c09f7bf66d1b2afbb452511926c0e4b3d2d58d406c2508d75c48118e6`.

## Evidence map

| Item | Primary-source evidence | Status in scene |
|---|---|---|
| Source-to-sample topology | PDF p. 3, Fig. 1a and caption: fs laser → Pockels cell → beam expander → resonant/galvo scanner → dichroic → objective → photoresist | Reported sequence |
| Raster mechanism | PDF p. 3, Fig. 1b-c; p. 4, §2.1: fast X sweep, slow Y row index, intensity above/below polymerization threshold | Reported mechanism; qualitative 2D proxy |
| Scanner rates | PDF p. 4, §2.1: X resonant scanner 7.91 kHz; Y is a slow galvanometer. PDF p. 7, §2.3: approximately 8 kHz and usable fraction `D = 0.9` | 7.91 kHz and `D = 0.9` reported; Y preview frequency invented |
| Objective and Z | PDF p. 4, §2.1: 25×, NA 0.8 immersion objective with refraction-compensation ring; objective piezo changes focal plane in Z | Magnification and NA reported; EFL, WD, medium and motion omission explicit |
| Imaging detector | PDF p. 3, Fig. 1a; p. 4, §2.1: PMT camera images workspace and objects through the shared objective/dichroic path | PMT shown as a return detector; resin preview generates no return light |
| Laser timing and wavelength | PDF p. 4, §2.1: tunable Ti:sapphire, approximately 120 fs, 80 MHz, typically 780 nm | Reported values |
| Laser power | PDF p. 4, §2.1: 6–10 W pump gives approximately 600–1000 mW mode-locked output | Range recorded; 0.8 W is an explicitly labelled preview choice and is not handed off |
| Pockels control | PDF p. 4, §2.1: ConOptics 350-80 and 302RM, interfaced to a 3.33 MHz DAC; authors note the cell/driver were not rated for 3 MHz | Reported assembly; native square switching is only a visible proxy for the precomputed voxel stream |
| Power monitoring | PDF p. 4, §2.1: intensity continuously monitored by sampling the passing beam | Pickoff ratio and detector geometry are free interpretation |
| Beam expansion | PDF p. 4, §2.1: 2× Galilean beam expander used to flatten profile and improve collimation | 2× ratio reported; −20/+40 mm prescription invented |
| Voxel addressing | PDF pp. 4–5, §2.2 and Fig. 1c: PrintImage precomputes supra/sub-threshold power values for every raster location. PDF p. 7: 3.33 MHz updates, approximately 8 kHz resonance and `D = 0.9` yield at most 152 X voxels | Not reproduced |

## Optical reasoning

The writing beam is intensity-addressed before scanning. The two scan mirrors change the focus position after relay optics, while the objective piezo selects Z. There are no diffraction orders in this apparatus. The paper states neither input polarization nor the analyzer arrangement that makes a Pockels cell an intensity modulator. The native scene therefore pairs the EOM with an analyzer and labels that analyzer “Free interpretation — not specified in the paper.” The monitoring statement does not specify pickoff geometry or fraction, so the native 2% beamsplitter branch is also free interpretation.

The paper draws “microscopy optics” schematically and gives no scan-lens/tube-lens prescriptions or conjugate distances. The 1:1, 50 mm relay is a compact first-order choice that keeps scanner motion coupled to the objective path; it is not a claimed reconstruction of the commercial microscope relay. The extra fold mirror only packs the scene.

## Working default

The enabled 780 nm pulsed source traces through the Pockels-cell/analyzer proxy, monitor pickoff, 2× Galilean expander, packing fold, 7.91 kHz resonant X scanner, slow Y galvo, interpreted relay, imaging dichroic and 25×/NA 0.8 objective to the resin. The scanner preview is slowed on screen. The objective focuses the traced beam and the resin records bounded 2PP preview arrivals.

## Control experiments

1. **Laser enable/power:** select the laser and turn off **Emit traced rays**. The complete writing trace and resin arrivals disappear. Turning it on restores them. Changing the illustrative average power changes reported source power but does not calibrate curing.
2. **Pockels intensity path:** select the EOM and change **High-state duty** from 0.1 toward 0.9. The power-monitor reading falls as more pulses occupy the analyzer-blocked state. This demonstrates a polarization-plus-analyzer intensity-control assembly, not the paper’s arbitrary 3.33 MHz PrintImage voxel waveform.
3. **Resonant X mechanism:** set the resonant scanner’s **Peak mechanical sweep** to 0°, then back to 1.2°. The focus stops, then resumes its fast sinusoidal motion. **Mechanical resonance** changes motion rate; **Usable scan fraction** is annotation only and does not linearize the raster.
4. **Slow Y index proxy:** set the galvo waveform to **Static**, then restore **Triangle scan**. The slower focus displacement disappears and returns. Both scanner axes are projected into the 2D workbench, so this is a topology/mechanism demonstration rather than a 3D raster calibration.

## Limits and companion handoff

OpticalSetup calculates a qualitative 2D geometric trace, objective aperture/focus, polarization-dependent attenuation, and bounded resin arrival markers. It does not calculate resonant dynamics, sinusoidal scan correction, the 152-address spatial map, PrintImage timing, vectorial focal fields, compensation-ring aberration correction, voxel dose, threshold, polymerization kinetics, or a calibrated 3D print.

The paper-level calculator handoff supports the verified 780 nm wavelength, 80 MHz repetition rate, approximately 120 fs duration, and NA 0.8. It omits power because the paper reports a 0.6–1 W laser-output range rather than one exact operating value at the sample. The live resin handoff is deliberately disabled for the same reason. The 3.33 MHz DAC rate remains a modulator command rate and is never exported as optical repetition frequency.
