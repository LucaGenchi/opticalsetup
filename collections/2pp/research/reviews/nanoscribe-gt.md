# Nanoscribe GT — original PR #127 review

Reviewed **`121a0b11b2b77a107bf3360c521eaa1775168ec6`**, read-only, on 2026-09-13. The original worktree was clean before and after the source/native review. Scores describe that original, not the integration.

**DROP.** Removal is an explicit user instruction, independent of scoring. Technical reasons also favor removal: the product sheet does not disclose a reconstructable optical train, the interpreted apparatus duplicates the Basic scene's galvo/piezo lesson, and only its second scanner is pupil-conjugate. No standalone GT scene, card or source record belongs in the active final collection. This historical review is retained as review evidence.

| Axis (0–5) | Score | Reason |
| --- | ---: | --- |
| Source completeness | 2 | Primary product sheet verifies subsystems and performance, not an internal apparatus prescription. |
| Optical-train confidence | 2 | Functional order is plausible; source, objective and relay are invented, and X conjugacy fails. |
| Distinctiveness | 1 | Serial galvos and a piezo stage substantially overlap the educational introduction. |
| 2D compatibility | 3 | Native mirror and stage motion work; orthogonal axes are explicitly projected into one plane. |
| Educational value | 3 | Useful source, scanner and stage controls, but little vendor-specific causal information. |
| Visual clarity | 3 | Provisional scene-only score: native export is coherent, with dense small notes and a wide frame; browser pending. |
| Free interpretation required ↑ | 5 | Almost the entire numerical optical prescription and operating point are undisclosed. |
| Maintenance complexity ↑ | 2 | Mostly shared native components; special provenance handling and fragile scanner geometry add burden. |

The final two scores increase with burden, not quality.

## Primary evidence and claims

Read and visually inspected both pages of the attached `01-nanoscribe-gt-datasheet.pdf` using the PDF workflow. SHA-256: `471bd66e9974798b34f58c4098c8a12450d239d3aeea25838a8da59b60755d6f`, matching the branch source record. The [vendor sheet preserved as a journal supplement](https://mdpi-res.com/d_attachment/polymers/polymers-10-00011/article_deploy/polymers-10-00011-s001.pdf?version=1513942821) is **DS/GT/V04_2016** (p. 2 footer; PDF creation metadata also December 2016). It cannot establish the exact machine behind the benchmark labelled 2014.

| Location | Verified evidence / boundary |
| --- | --- |
| p. 1 description and labelled photograph | Piezo and galvo writing modes; turnkey NIR fibre laser, XY galvos, motorized XY/XYZ piezo stages, microscope/objectives and camera. Photograph labels components; it is not an optical schematic. |
| p. 1 options | Automatically exchangeable scanning objectives are an option. No catalogue model, NA or internal prescription. |
| p. 2 printing performance | Typical beam/piezo speeds 10 mm/s and 100 µm/s; 100 × 100 mm² motorized area; 300 × 300 × 300 µm³ piezo range; objective-dependent 200–600 µm diameter galvo field. |
| p. 2 footnotes | Performance depends on machine configuration and photoresist; scanning speed alone does not determine effective printing time. Objective-specific information requires consultation. |
| p. 2 laser/electrical rows | NIR femtosecond source only. Wavelength, duration, repetition rate and optical power absent. **<500 W is electrical consumption.** |

The scene/evidence note correctly marks 780 nm, 100 fs, 80 MHz, 80 mW, 6 mm illumination, polarization, folds, scanner drives, 80/80 mm relay and generic oil NA 1.4/EFL 5 mm/WD 0.13 mm objective as free interpretation. A 0.3 mm triangle piezo sweep at 1/6 Hz gives a 100 µm/s leg speed; this is a constructed trajectory consistent with a typical value, not a disclosed vendor drive. The camera and autofocus are not reconstructed. No measured feature size, PSF, dose, curing or throughput is calculated. Interpreted-source numeric handoff is correctly disabled, and the supported settings object is empty; the catalogue summary's suggestion of a provenance-preserving handoff is stale.

## Optical train and native evidence

The traced order is source → fold → X galvo → Y galvo → fold → scan lens → tube lens → objective → resin. The nominal objective BFP/stop is **x=570 mm**, equivalent lens x=575, and focus/resin x=580, all at y=225. Its stop is not clamped; pupil diameter is 14 mm. Unfolded Y→scan-lens distance is 30+50=80 mm, lens separation 160 mm, and tube-lens→BFP distance 80 mm.

Using the shared matrix criterion with the original scene geometry: Y→BFP has `A=D=−1, B=C=0`. X is 60 mm farther upstream without an inter-pivot relay: `A=D=−1, B=−60 mm, C=0`. Native nine-ray probes over a 2 mm input diameter independently driven through ±0.2° mechanical confirm **X pupil walk ±0.418886 mm**, while Y stays centred within 10⁻¹² mm. Both retain nine rays and a nominal focus span below 10⁻⁹ mm. A sharp focus does not repair pupil walk.

Ran `node --test test/2pp-collection.test.js test/2pp-voxel-preview.test.js`: **21/21 pass**. Additional measurements used this original's `parseSketch`, `traceScene`, objective and stage functions; integration helpers only measured path intersections/matrices.

| Control/check | Native result |
| --- | --- |
| Default t=0 | One write-reference arrival at (580, 225.122197) mm; both beam edges meet there. All geometry finite. |
| Source disabled / 0 W | Zero drawables, signal hits and write hits. |
| 40 / 80 / 160 mW | Same arrival position/count; no dose or curing inference. |
| Both galvos static, zero command | Centred arrival at (580,225) mm. |
| X alone ±0.5° mechanical | Focus offset ∓0.087275 mm; pupil centre walks ∓1.047304 mm. |
| Y alone ±0.7° mechanical | Focus offset ±0.122197 mm; pupil centre remains within 10⁻¹² mm. |
| Full source width | Seventeen independent native line probes across the authored 6 mm beam follow the complete upstream train. All 17 reach pupil/resin at 81 times over the 40 ms combined scan period; maximum pupil walk 1.047984 mm, width 6.005055 mm, focus span below 10⁻⁹ mm. The underfilled 14 mm pupil explains survival. This is sampled validation, not proof between frames. |
| Scan-lens f=80→60 mm, held scanners | Full-beam pupil width 6→8 mm and resin-plane span 0→0.125 mm. The default beam-mode write marker still reports one centre arrival; it does not show calculated voxel dimensions or certify a point focus. |
| Piezo XY, t=0.75/2.25 s | Stage shifts −0.075/+0.075 mm; lab focus stays fixed and material coordinates become +0.075/−0.075 mm. |
| Persistence/provenance | JSON normalization/reload is identical. Interpreted-source handoff remains `null`. |

The original pupil-fill readout derives a maximum radial extent from objective surface hits, including the equivalent lens plane. It is not a separate pupil-centre/beam-width measurement; this review uses actual BFP crossings for conjugacy.

## Visual and browser status

Inspected the original native-export PNG: source at upper left, folded route, objective/resin at right, concise component labels, and explicit interpretation/model limits are present. The 660×335 mm Figure frame has aspect ratio 1.97, wider than the collection target; long bottom notes and several text sizes reduce fitted readability. The Figure-bound regression passes. This export is **not browser evidence**.

**Pending:** real native-editor desktop and approximately 1024 px inspection; toolbar/palette/canvas/inspector overflow; interactive controls and persistence; fresh console review; browser screenshots. The coordinator reported a stalled shared browser and explicitly instructed this reviewer not to initialize or call it yet. No browser checks have passed in this review. These checks remain required even though removal is mandated.

**DROP — user-mandated removal, additionally supported by proprietary evidence gaps, duplication of the Basic lesson and incomplete X-scanner conjugacy.**
